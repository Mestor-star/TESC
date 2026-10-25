/* ============================================================
   敌方指挥 —— 接口接通时由模型决定敌方这一手
   ------------------------------------------------------------
   两条腿走路：
     · **离线**：引擎自带的判断（pickTarget + 技能权重），永远可用，
       没填接口 / 调用失败 / 回包读不出来 —— 一律走它，战斗不会卡住。
     · **AI**：接通接口时，把场上局面压成一小段 JSON 交给模型，
       只要它回一个 {"skill":…,"target":…}，这一手就按它打。

   分两步，是为了**不让玩家等**（见 Battle.tsx 的两段 effect）：
     requestEnemyIntent —— 问。轮到我方决定时就把敌体这一手都要回来存着。
     intentOf           —— 用。真轮到它时按**此刻**的局面过一遍规则。

   约束写在提示词里也写在代码里：**模型只能在 legalSkills 里挑**。
   挑了个不存在的、体力不够的、目标已经倒下的 —— 整手退回离线判断。
   模型可以打得聪明，但不许打出规则外的一手。

   另外：原文里属于 boss 定位的敌体（危险度 ≥ ultStage），
   在作战系统里同样是 boss —— 它的终结技能不吃这套指挥，
   咏唱照旧自己走（见 engine 的 ultStep），AI 只能在常规手里挑。

   ============================================================
   2026-09-18 那一场事故之后补的三件事（这一节是账，别再拆掉）
   ------------------------------------------------------------
   ① **一次敌方行动只发一条请求**：单飞与去重在 Battle.tsx 那一侧（同回合、
      同一只、只问一次；effect 重跑先 abort 旧的）。这边只保证「问一次就一次」。
   ② **失败自动重试恰好一次**，重试时把输出预算翻倍：现场证据是回包只有 88 个
      completion、而这一路的 maxTokens 从前写死 200 —— 长一点的技能名 / 战意那句
      就会把那一行 JSON 掐断；掐断的 JSON 解析不出来，于是每一次都「失败」。
      而 finish_reason 从前没人接（没传 onFinish），所以「为什么失败」从来没被看见。
      现在：截断 / 空正文（预算被内部思考吃光）/ 解析不出来 / 超时 / 通道报错 ——
      一律算失败，带**真实原因**在 dev 下 warn 一行，然后**只**再试一次。
   ③ **容错解析**：先剥 ```json 围栏（大小写都认），再取第一个配平的 {…}，
      再退回「从第一个 { 到最后一个 }」那一截。三档都失败才算失败。
   ============================================================ */

import { chatCompletion, isReady } from '../api'
import type { ApiSettings, ChatTurn } from '../api'
import { affordable, bossUltOf, evadeOf, find, legalSkills, shieldOf } from './engine'
import { foeTargetOf, threatOf } from './types'
import { axisNameOf } from './derive'
import { TUNING } from './tuning'
import type { BattleState, Combatant, EnemyIntent, SkillSpec } from './types'

/**
 * 提示词侧：**别要它想，要它照着挑**。
 *
 * 从前这里四句「打得像那个敌体本身」（机械盯输出最高、魔王补血最少、残渣乱打）——
 * 那是在要它**推理**该怎么像。推理型通道于是真的开一段思考：预算、延迟、
 * 以及 2026-09-18 那场账单，都花在这段思考上。
 * 现在给一张**优先级清单**：命中就停。做匹配，不做权衡。
 * 「像那个敌体」的味道留成清单后面的一句补充，不再展开。
 *
 * 2026-09-2x（这一轮）：清单从四条扩成**七条怪物的战术**，覆盖主人要的那几件事 ——
 * 嘲讽是硬规则 / 没有嘲讽就按威胁挑（治疗 > 输出 > 坦克）/ 能补刀就补刀 /
 * 人多就放群攻 / 打不动的换人 / 残血先自保 / 终结技它自己会放。
 * 与简报那一侧对得上：简报给我方的表按**威胁降序**摆，第 1 条与第 2 条才有把手。
 * ⚠️ 别把 mech 钉着的那三个「锁结局」的词写进来（见那份脚本 §43 的对照那一条）——
 * 那是别的提示词那一侧的口径，这一路不要跟着学。
 */
export const SYSTEM = `你在替敌方做一道「这一手出哪一门、打谁」的选择题，不是写分析。

只能从 skills 里挑一门；target 只能从「我方」里挑一个 id ——
那张表已经按威胁（threat）从高到低排好，排第一的就是眼下最该处理的人。

照下面七条挑，命中就停，不要权衡、不要解释：
1. 「我方」里有人「嘲讽剩余」> 0（还在引仇）→ 这一手只能打他，除非你这一手打不到他
   （打全体、或只能落在自己人身上的增益 / 回复）。几个引仇者挑威胁最高的那个。
2. 没人引仇 → 打「威胁」最高的那个。威胁的次序通常是 治疗 > 输出 > 坦克：
   先掐奶，再掐刀，坦克放最后。
3. 能补刀就补刀：有人生命低于 30%、而你有一门打得死他的 → 打他，后排与治疗优先。
4. 「我方」还站着三个人以上、而你手里有打全体的一手（打谁 = all）→ 放群攻，比单点划算。
5. 目标减伤超过 0.6、而场上还有别的靶子 → 换一个打；除非这一门写着穿甲。
6. 自己的生命低于 40%、手里又有回复 / 护盾 / 护持 → 先用它，别硬顶。
7. 终结技能蓄满的时候它自己会放（不用你挑 ult）：这一手照常挑最重、放得起的一门常规手跟上。

打得像那个敌体本身：机械盯着输出最高的打，魔王先补血最少的，残渣乱打。

只输出一行 JSON：{"skill":"<skills 里的 id>","target":"<我方里的 id>"}，不要 markdown、不要注释。`

/* ============================================================
   回包的取法 —— 三档逐级降级（模型不听话时全靠这三档）
   ============================================================ */

/** 剥掉 ```json … ``` 围栏（json / JSON / 不带语言名都认） */
function stripFence(t: string): string {
  const s = t.trim()
  const m = /^```[A-Za-z]*\s*([\s\S]*?)\s*```$/.exec(s)
  return m ? m[1].trim() : s
}

/**
 * 取第一个**配平**的 {…}（字符串里的括号不算数）。
 * 截断的回包在这里拿不到东西 —— 那正是「被长度掐断」的形状，交给调用方当失败处理。
 */
function firstBalanced(t: string): string | null {
  const i = t.indexOf('{')
  if (i < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let k = i; k < t.length; k++) {
    const ch = t[k]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '\"') inStr = false
      continue
    }
    if (ch === '\"') inStr = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return t.slice(i, k + 1)
    }
  }
  return null
}

/** 三档降级地读一行意图；全都不成返回 null */
function parseIntent(text: string): { skill: string; target: string; note: string } | null {
  const bare = stripFence(text)
  const cands: string[] = [bare]
  const bal = firstBalanced(bare)
  if (bal) cands.push(bal)
  const last = bare.lastIndexOf('}')
  if (last > 0) cands.push(bare.slice(0, last + 1))
  for (const c of cands) {
    try {
      const j = JSON.parse(c) as { skill?: unknown; target?: unknown; note?: unknown }
      if (!j || typeof j !== 'object') continue
      return {
        skill: typeof j.skill === 'string' ? j.skill : '',
        target: typeof j.target === 'string' ? j.target : '',
        note: typeof j.note === 'string' ? j.note.trim().slice(0, 40) : '',
      }
    } catch { /* 这一档不成，下一档 */ }
  }
  return null
}

/** 一门手在提示词里的样子：够模型判断，又不至于把上下文撑爆 */
function skillLine(k: SkillSpec, cd: number): Record<string, unknown> {
  return {
    id: k.id,
    name: k.name,
    类: k.kind,
    倍率: Number((k.power / 2).toFixed(2)),
    轴: axisNameOf(k.axis),
    打谁: k.target,
    体力: k.cost,
    ...(cd > 0 ? { 冷却中: '还需 ' + cd + ' 拍' } : {}),
    ...(k.effect ? { 效果: Object.keys(k.effect) } : {}),
  }
}

/** 身上挂着几层减益（大招咏唱期间，一层削一截 —— 模型看得到才好权衡） */
function debuffCount(c: Combatant): number {
  return c.buffs.filter((b) => b.v < 0 || b.k === 'slow' || b.k === 'mark').length
}

/**
 * 场上的局面，压成一份可读的简报 —— 给模型的那一份。
 *
 * 三件事在这一份里要说死：
 *   · **敌体自己**：全部放得出来的技能（能耗 / 冷却 / 倍率 / 轴 / 打谁 / 效果都在
 *     `skillLine` 里）＋ 终结技蓄了几拍 ＋ 自己的减伤 / 减益 / 形态；
 *   · **我方每人**：生命、体力、闪避、减伤、减益层数、**威胁值**、**嘲讽剩余**、
 *     以及最近一次出手（从作战记录里捞，捞不到就写「还没出手过」）；
 *   · **排序**：我方那张表按**威胁降序**摆 —— 模型最容易照着顺序挑第一个。
 */
export function briefOf(s: BattleState, foe: Combatant) {
  const u = bossUltOf(foe)
  /** 这个人最近一次出手（技能名 + 落在谁身上）；只认出手，指令条目不算 */
  const recentOf = (id: string): string => {
    for (let i = s.log.length - 1; i >= 0; i--) {
      const e = s.log[i]!
      if (e.actorId !== id || e.kind === '指令') continue
      if (e.miss) continue
      return '「' + e.skill + '」'
        + (e.dmg ? ' 伤 ' + e.dmg : e.heal ? ' 回复 ' + e.heal : '')
        + (e.target ? ' → ' + e.target : '')
    }
    return '（还没出手过）'
  }
  const pct = (c: Combatant) => Math.round((c.hpMax > 0 ? c.hp / c.hpMax : 0) * 100)
  /* 按威胁降序；并列按 id —— 与 types.foeTargetOf 同一把尺，模型读到的顺序
     就是离线那一路会挑的顺序。 */
  const mine = s.allies
    .filter((a) => !a.down && a.gone <= 0)
    .sort((a, b) => threatOf(b) - threatOf(a) || a.id.localeCompare(b.id))
  return {
    场次: s.no + '「' + s.title + '」· ' + s.place,
    危险度: s.stage,
    敌方: {
      id: foe.id,
      名: foe.name,
      类型: foe.cls,
      性质: foe.trait,
      生命: foe.hp + '/' + foe.hpMax + '（' + pct(foe) + '%）',
      体力: foe.tempo + '/' + foe.tempoMax,
      减伤: Number(shieldOf(foe).toFixed(2)),
      身上的减益层数: debuffCount(foe),
      ...(foe.morph ? { 形态: foe.morph.name + '（还剩 ' + foe.morph.ticks + ' 拍）' } : {}),
      ...(u
        ? {
          终结技能: '「' + u.name + '」已蓄 ' + (foe.chant[u.id] ?? 0) + '/' + (u.ult ?? 1) + ' 拍'
            + '——蓄满这一手必放，被一次打掉最大生命 ' + Math.round((u.ultBreak ?? 0.14) * 100) + '% 即打断。',
        }
        : {}),
    },
    我方: mine.map((a) => ({
      id: a.id,
      名: a.name,
      定位: a.cls,
      生命: a.hp + '/' + a.hpMax + '（' + pct(a) + '%）',
      体力: a.tempo + '/' + a.tempoMax,
      闪避: Number(evadeOf(a).toFixed(2)),
      减伤: Number(shieldOf(a).toFixed(2)),
      减益层数: debuffCount(a),
      威胁: Math.round(threatOf(a)),
      嘲讽剩余: a.taunt,
      最近一手: recentOf(a.id),
    })),
    // 大招不在这张表里：它不占常规出手，也不由指挥决定（见 engine 的 ultStep）
    skills: legalSkills(foe, s)
      .filter((k) => !k.ult && affordable(k, foe.tempo))
      .map((k) => skillLine(k, foe.cds[k.id] ?? 0)),
  }
}

/** 模型回包里的那一手（**未经规则校验**，可能挑了个打不出来的技能） */
export interface RawIntent {
  skill: string
  target: string
  note: string
}

/** 一次尝试的结局：要嘛拿到意图，要嘛给出**真实原因** */
interface Attempt {
  raw: RawIntent | null
  /** 被外部掐掉（离开这一屏 / 页面藏起来）—— 这种**不重试** */
  cancelled: boolean
  /** 网关不认 reasoning_effort（400 + unsupported 之类）—— 摘掉它重发，不算失败重试 */
  effortRejected?: boolean
  /** 给人看的失败原因（dev 下直接打进控制台） */
  why: string
}

/**
 * 哪些通道不吃 reasoning_effort（baseUrl|model）。**本页会话内**记住。
 *
 * 这条必须是自适应的：无条件带上会 400（把整条路打死），
 * 无条件不带又白白多花一段思考。第一次带、被 400 顶回来就摘掉、记住了不再带。
 */
const effortBanned = new Set<string>()
const chanKeyOf = (cfg: ApiSettings) => cfg.baseUrl.trim() + '|' + cfg.model.trim()
/** 首次请求带的低思考参数（o 系与部分中转认它；不认的走上面那条自适应） */
const LOW_EFFORT = { reasoning_effort: 'low' }

/** 这次 400 是不是「不认识这个字段」 */
function effortUnsupported(msg: string): boolean {
  if (!/^HTTP 4(00|22)/.test(msg)) return false
  return /reasoning_effort|reasoning|unsupported|unknown|unrecognized|not support|invalid/i.test(msg)
}

/** 把 AbortSignal 串起来（老浏览器没有 AbortSignal.any 就手工接） */
function linked(ctl: AbortController, outer?: AbortSignal): AbortSignal {
  if (!outer) return ctl.signal
  const anyOf = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (typeof anyOf === 'function') return anyOf([outer, ctl.signal])
  if (outer.aborted) ctl.abort()
  else outer.addEventListener('abort', () => ctl.abort(), { once: true })
  return ctl.signal
}

/** 从异常里读一句人话（HTTP 码 / 思考吃光预算 / 网络） */
function reasonOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/^HTTP 40[12]/.test(m)) return '密钥 / 额度：' + m
  if (/^HTTP 429/.test(m)) return '被限流：' + m
  if (m.includes('内部思考')) return '预算被内部思考吃光、正文为空：' + m
  return m
}

/**
 * 问一次。**一次尝试**只发一条请求：
 *   · 自己带一道硬截止（TUNING.enemyAskMs）—— 到点 abort，算失败；
 *   · 外部 signal 照样掐得动（那算「取消」，不重试）；
 *   · finish_reason 接在手里：'length' 就是**被长度截断**，与解析失败分开报。
 */
async function askOnce(
  cfg: ApiSettings,
  messages: ChatTurn[],
  tokens: number,
  outer: AbortSignal | undefined,
  foeName: string,
  useEffort: boolean,
): Promise<Attempt> {
  const ctl = new AbortController()
  const signal = linked(ctl, outer)
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctl.abort() }, TUNING.enemyAskMs)
  let text = ''
  let finish: string | undefined
  let err: unknown = null
  try {
    text = await chatCompletion(cfg, messages, {
      signal,
      maxTokens: tokens,
      // 分类题，不跟着通道那条 0.8 走（见 TUNING.enemyAskTemp）
      temperature: TUNING.enemyAskTemp,
      // 机会式低思考：认它的通道能省掉一整段内部推理，不认的下一次就不带了
      ...(useEffort ? { body: LOW_EFFORT } : {}),
      onFinish: (r) => { finish = r.finishReason; text = r.text },
      meta: { channel: '交战推演', act: foeName + ' 的下一步' },
    })
  } catch (e) {
    err = e
  } finally {
    clearTimeout(timer)
  }
  if (outer?.aborted) return { raw: null, cancelled: true, why: '被调用方取消' }
  if (timedOut) return { raw: null, cancelled: false, why: '超时（' + TUNING.enemyAskMs + 'ms 没回话）' }
  if (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 网关不认这个字段：摘掉重发一次（不算失败重试，见 requestEnemyIntent）
    if (useEffort && effortUnsupported(msg)) {
      return { raw: null, cancelled: false, effortRejected: true, why: '通道不认 reasoning_effort：' + msg }
    }
    return { raw: null, cancelled: false, why: reasonOf(err) }
  }
  const body = (text ?? '').trim()
  if (!body) {
    return {
      raw: null, cancelled: false,
      why: finish === 'length'
        ? '被长度截断（finish_reason=length，max_tokens=' + tokens + '）—— 正文一个字节也没剩'
        : '通道回了空正文（max_tokens=' + tokens + '）',
    }
  }
  const parsed = parseIntent(body)
  if (!parsed) {
    return {
      raw: null, cancelled: false,
      why: (finish === 'length' ? '被长度截断' : '回包不是可解析的 JSON')
        + '（finish_reason=' + (finish ?? '未给') + '，max_tokens=' + tokens
        + '，首 60 字：' + body.slice(0, 60) + '）',
    }
  }
  return { raw: parsed, cancelled: false, why: '' }
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
 * 失败**自动重试恰好一次**，并把输出预算翻倍（600 → 1200）——
 * 「被长度掐断」这一类失败，翻倍往往就过了。第二次还失败就返回 null，
 * 由调用方退回离线打法；要不要再试一次由**玩家**点（见 Battle.tsx 那枚按钮）。
 *
 * @param opts.attempts 自动尝试次数：缺省 2（一次 + 一次重试）；手动重试传 1。
 * @returns 回包；接口没接通 / 两次都没成 / 被取消 —— 一律 null
 */
export async function requestEnemyIntent(
  s: BattleState,
  foe: Combatant,
  cfg: ApiSettings,
  opts?: { signal?: AbortSignal; attempts?: 1 | 2 },
): Promise<RawIntent | null> {
  if (!isReady(cfg)) return null
  const messages: ChatTurn[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(briefOf(s, foe)) },
  ]
  const tries = opts?.attempts ?? 2
  let tokens: number = TUNING.enemyAskTokens
  let used = 0
  let last = ''
  while (used < tries) {
    if (opts?.signal?.aborted) return null
    const chan = chanKeyOf(cfg)
    const useEffort = !effortBanned.has(chan)
    const got = await askOnce(cfg, messages, tokens, opts?.signal, foe.name, useEffort)
    if (got.raw) return got.raw
    if (got.cancelled) return null
    /* 通道不认 reasoning_effort：摘掉它、记下来、**不占**这次的尝试次数 */
    if (got.effortRejected) {
      effortBanned.add(chan)
      if (import.meta.env?.DEV) {
        console.info('[battle/ai] ' + chan + ' 不认 reasoning_effort —— 摘掉重发，本次会话不再带')
      }
      continue
    }
    last = got.why
    used += 1
    /* 失败要能查：把**真实原因**和这次用的预算打出来（别只留一句「失败了」） */
    if (import.meta.env?.DEV) {
      console.warn('[battle/ai] ' + foe.name + ' 这一手没成（第 ' + used + '/' + tries + ' 次）：' + got.why)
    }
    tokens = Math.min(tokens * 2, TUNING.enemyAskTokens * 4)
  }
  if (import.meta.env?.DEV && last) {
    console.warn('[battle/ai] ' + foe.name + ' 这一手放弃 AI，退回离线打法：' + last)
  }
  return null
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
  const k = legalSkills(foe, s).find((x) => x.id === skillId && !x.ult && affordable(x, foe.tempo))
  if (!k) return null
  const t = targetId ? find(s, targetId) : undefined
  if (targetId && (!t || t.down || t.side !== 'ally')) return null
  /* 嘲讽是硬规则：有人还在引仇时，这一手只能落在引仇者身上（几个引仇者里挑威胁最高的）——
     模型挑的那个人不算数。判据与引擎的 pickTarget / foeplan 是同一个函数
     （见 types 的 foeTargetOf），模型失手时行为才不会退化。
     只管**打别人**的那几手：治疗 / 增益落在自己人身上，把它们改成引仇者等于把一记治疗空放。 */
  const taunting = k.target === 'one'
    ? s.allies.filter((a) => !a.down && a.gone <= 0 && a.taunt > 0)
    : []
  const forced = taunting.length ? foeTargetOf(taunting) : undefined
  return {
    foeId: foe.id,
    skillId,
    targetId: forced ? forced.id : t?.id,
    by: 'ai',
    note: raw.note ? foe.name + ' 的指挥：' + raw.note : undefined,
  }
}
