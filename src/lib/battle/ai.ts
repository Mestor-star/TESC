/* ============================================================
   敌方指挥 —— 接口接通时由模型决定敌方这一手
   ------------------------------------------------------------
   两条腿走路：
     · **离线**：引擎自带的判断（pickTarget + 技能权重），永远可用，
       没填接口 / 调用失败 / 回包读不出来 —— 一律走它，战斗不会卡住。
     · **AI**：接通接口时，把场上局面压成一小段 JSON 交给模型，
       只要它回一个 `{"skill":"…","target":"…"}`，这一手就按它打。

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

/**
 * 问模型：这一手怎么打。
 * @returns 决定；接口没接通 / 调用失败 / 回包读不出来 —— 一律 null（调用方退回离线）
 */
export async function askEnemyIntent(
  s: BattleState,
  foe: Combatant,
  cfg: ApiSettings,
  opts?: { signal?: AbortSignal },
): Promise<EnemyIntent | null> {
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
  const skillId = typeof parsed.skill === 'string' ? parsed.skill : ''
  const targetId = typeof parsed.target === 'string' ? parsed.target : ''
  // 规则内校验：技能得列得出来、目标得还站着 —— 不合规就整手退回离线
  const legal = legalSkills(foe, s).some((k) => k.id === skillId && !k.ult && affordable(k, foe.sp))
  if (!legal) return null
  const t = targetId ? find(s, targetId) : undefined
  if (targetId && (!t || t.down || t.side !== 'ally')) return null
  const note = typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 40) : ''
  return {
    foeId: foe.id,
    skillId,
    targetId: t?.id,
    by: 'ai',
    note: note ? `${foe.name} 的指挥：${note}` : undefined,
  }
}
