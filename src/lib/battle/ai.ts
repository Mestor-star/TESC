/* ============================================================
   敌方指挥 —— 接口接通时由模型决定敌方这一手
   ------------------------------------------------------------
   两条腿走路：
     · **离线**：引擎自带的判断（pickTarget + 技能权重），永远可用，
       没填接口 / 调用失败 / 回包读不出来 —— 一律走它，战斗不会卡住。
     · **AI**：接通接口时，把场上局面压成一小段 JSON 交给模型，
       只要它回一个 `{"skill":"…","target":"…"}`，这一手就按它打。

   分两步，是为了**不让玩家等**（见 Battle.tsx 的两段 effect）：
     requestEnemyIntent —— 问。轮到我方决定时就把敌体这一手都要回来存着。
     intentOf           —— 用。真轮到它时按**此刻**的局面过一遍规则。

   约束写在提示词里也写在代码里：**模型只能在 legalSkills 里挑**。
   挑了个不存在的、体力不够的、目标已经倒下的 —— 整手退回离线判断。
   模型可以打得聪明，但不许打出规则外的一手。

   另外：原文里属于 boss 定位的敌体（危险度 ≥ ultStage），
   在作战系统里同样是 boss —— 它的终结技能不吃这套指挥，
   咏唱照旧自己走（见 engine 的 ultStep），AI 只能在常规手里挑。
   ============================================================ */

import { chatCompletion, isReady } from '../api'
import type { ApiSettings, ChatTurn } from '../api'
import { affordable, bossUltOf, evadeOf, find, legalSkills, shieldOf } from './engine'
import type { BattleState, Combatant, EnemyIntent, SkillSpec } from './types'

/** 模型若要回话，只回这一种形状 */
const SYSTEM = `你在为一场回合制战斗指挥**敌方**。
只能从给你的 skills 列表里挑一门，target 只能从 targets 列表里挑一个。
打得像那个敌体本身：机械就盯着输出最高的打，魔王就先补掉血最少的，
残渣就乱打。不要去猜规则、不要解说、不要道歉。

**不要推演、不要权衡、不要展开思考** —— 看一眼局面，几秒内定下一手。
你只需要给结论：谁打谁、用哪一门。想得越多打得越慢，这一手并不值得想那么久。

**这一手有个硬截止，等不起**：请把下面那一行 JSON 作为你的**第一段输出**直接写出来，
不要先分析、不要写思考、不要解释你为什么这么挑 —— 想说的话一律省掉，只在 note 里留一句战意。
（哪怕你有内部思考通道，也请跳过它直接作答；这一手是几秒内的事，不值得想。）

只回一行 JSON，不要代码块，不要多余文字：
{"skill":"技能id","target":"目标id","note":"一句话战意（12 字以内）"}`

const clampJson = (t: string): string => {
  const i = t.indexOf('{')
  const j = t.lastIndexOf('}')
  return i >= 0 && j > i ? t.slice(i, j + 1) : t
}

/** 一门手在提示词里的样子：够模型判断，又不至于把上下文撑爆 */
function skillLine(k: SkillSpec, cd: number): Record<string, unknown> {
  return {
    id: k.id,
    name: k.name,
    类: k.kind,
    倍率: Number((k.power / 2).toFixed(2)),
    轴: k.axis,
    打谁: k.target,
    体力: k.cost,
    ...(cd > 0 ? { 冷却中: `还需 ${cd} 拍` } : {}),
    ...(k.effect ? { 效果: Object.keys(k.effect) } : {}),
  }
}

/** 身上挂着几层减益（大招咏唱期间，一层削一截 —— 模型看得到才好权衡） */
function debuffCount(c: Combatant): number {
  return c.buffs.filter((b) => b.v < 0 || b.k === 'slow' || b.k === 'mark').length
}

/** 场上的局面，压成一份可读的简报 */
function briefOf(s: BattleState, foe: Combatant) {
  const u = bossUltOf(foe)
  return {
    场次: `${s.no}「${s.title}」· ${s.place}`,
    危险度: s.stage,
    敌方: {
      id: foe.id,
      名: foe.name,
      类型: foe.cls,
      性质: foe.trait,
      生命: `${foe.hp}/${foe.hpMax}`,
      体力: `${foe.sp}/${foe.spMax}`,
      减伤: Number(shieldOf(foe).toFixed(2)),
      身上的减益层数: debuffCount(foe),
      ...(u
        ? {
          终结技能: `「${u.name}」已蓄 ${foe.chant[u.id] ?? 0}/${u.ult ?? 1} 拍`
            + `——蓄满这一手必放，被一次打掉最大生命 ${Math.round((u.ultBreak ?? 0.14) * 100)}% 即打断。`,
        }
        : {}),
    },
    我方: s.allies
      .filter((a) => !a.down)
      .map((a) => ({
        id: a.id,
        名: a.name,
        定位: a.cls,
        生命: `${a.hp}/${a.hpMax}`,
        体力: `${a.sp}/${a.spMax}`,
        闪避: Number(evadeOf(a).toFixed(2)),
        引仇中: a.taunt > 0,
      })),
    // 大招不在这张表里：它不占常规出手，也不由指挥决定（见 engine 的 ultStep）
    skills: legalSkills(foe, s)
      .filter((k) => !k.ult && affordable(k, foe.sp))
      .map((k) => skillLine(k, foe.cds[k.id] ?? 0)),
  }
}

/** 模型回包里的那一手（**未经规则校验**，可能挑了个打不出来的技能） */
export interface RawIntent {
  skill: string
  target: string
  note: string
}

/**
 * 问模型：这一手怎么打（只负责**问**，不校验）。
 *
 * 与 `askEnemyIntent` 分开，是为了能**提前问**：
 * 轮到我方决定时就把敌方这一手先要来存着，等真轮到敌体，
 * 结果多半已经到了 —— 不必让玩家盯着「敌方指挥中…」等一次往返。
 * 提前问回来的那一手，落地前照样要过 `intentOf` 的规则校验
 * （存的是局面，局面会变：技能可能冷却、目标可能已经倒了）。
 *
 * @returns 回包；接口没接通 / 调用失败 / 读不出 JSON —— 一律 null（调用方退回离线）
 */
export async function requestEnemyIntent(
  s: BattleState,
  foe: Combatant,
  cfg: ApiSettings,
  opts?: { signal?: AbortSignal },
): Promise<RawIntent | null> {
  if (!isReady(cfg)) return null
  const messages: ChatTurn[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(briefOf(s, foe)) },
  ]
  let raw = ''
  try {
    raw = await chatCompletion(cfg, messages, {
      signal: opts?.signal,
      maxTokens: 200,
      temperature: Math.min(1, Math.max(0.2, cfg.temperature)),
      meta: { channel: '交战推演', act: `${foe.name} 的下一步` },
    })
  } catch {
    return null
  }
  let parsed: { skill?: unknown; target?: unknown; note?: unknown }
  try {
    parsed = JSON.parse(clampJson(raw)) as typeof parsed
  } catch {
    return null
  }
  return {
    skill: typeof parsed.skill === 'string' ? parsed.skill : '',
    target: typeof parsed.target === 'string' ? parsed.target : '',
    note: typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 40) : '',
  }
}

/**
 * 把模型挑的那一手按**此刻**的规则校验一遍，落成能执行的意图。
 *
 * 提前问回来的回包，到用的时候局面可能已经不一样了：
 * 技能冷却好了没有、体力还够不够、它瞄的人是否已经倒下 ——
 * 所以校验用的是**当前**的 `s`，不是问的时候那份。
 *
 * @returns 合规的一手；挑了个出不来的、目标不对 —— 一律 null（调用方退回离线）
 */
export function intentOf(s: BattleState, foe: Combatant, raw: RawIntent | null | undefined): EnemyIntent | null {
  if (!raw) return null
  const skillId = raw.skill
  const targetId = raw.target
  const legal = legalSkills(foe, s).some((k) => k.id === skillId && !k.ult && affordable(k, foe.sp))
  if (!legal) return null
  const t = targetId ? find(s, targetId) : undefined
  if (targetId && (!t || t.down || t.side !== 'ally')) return null
  return {
    foeId: foe.id,
    skillId,
    targetId: t?.id,
    by: 'ai',
    note: raw.note ? `${foe.name} 的指挥：${raw.note}` : undefined,
  }
}

