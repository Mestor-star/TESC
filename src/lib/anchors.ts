/**
 * 世界线锚点的运行时判定（纯函数，**只读**，一个字都不写状态）。
 *
 * 它只回答三个问题：
 *   · due      —— 条件已满足、还没落地的：**现在就该发生**；
 *   · imminent —— 下一步可能到期的：给 guard 用（别提前写掉）；
 *   · missed   —— 前一段早就收束、时间也到了，可现场条件一直没凑齐、迟迟没落地的：
 *                 拿 fallback 提醒「绕开它时它该怎么回来」。
 *
 * 「落地」以 `WorldState.anchors[锚点 id]` 为准（由 completeEvent 写下 played，
 * 或后续批次写下 fallback）。**没落地**才可能出现在这三个名单里 ——
 * 落过一次的锚点不再复述第二遍。
 *
 * 判据（给的条件每一条都要满足，没有「或」）：
 *   afterDone 全部收束 ＋ tick ≥ minTick ＋ place / cast / flag / playerAct 若给了都成立。
 */
import type { Anchor, AnchorLog, FlagValue } from '../data/types'
import { ANCHORS } from '../data/anchors'

/** 判定输入 —— 都是「此刻的读数」，函数不改它们 */
export interface AnchorInput {
  /** 已收束的段（`Terminal` 的 epDone） */
  epDone?: Record<string, true> | null
  /** 叙事时钟（格，1 格 = 半天）。缺省按 0 读 —— 旧档就是第 0 日。 */
  tick?: number
  /** 此刻这一场在哪儿 */
  place?: string | null
  /** 此刻在场上的人（`world.cast[段]` 那一层实时名册） */
  cast?: readonly string[] | null
  /** 世界变量 */
  flags?: Record<string, FlagValue> | null
  /** 这一回合玩家主动写了要去做这件事（= 主动踩上去） */
  playerAct?: boolean
  /** 已落地的锚点账（`world.anchors`） */
  landed?: Record<string, AnchorLog> | null
}

export interface AnchorVerdict {
  due: Anchor[]
  imminent: Anchor[]
  missed: Anchor[]
}

/** 提前多久算「下一步就到」—— 4 格（两天）之内 */
export const IMMINENT_TICKS = 4

/**
 * 到期之后宽限几格再判成「错过」。
 *
 * 为什么需要这一格：`cast` 这类现场条件玩家随时能改（把人支走、自己走开），
 * 刚到期的那一格常常只是「他不在场」，这时候该由 imminent 提醒导演，
 * 而不是立刻把锚点判成「这条走 fallback」。宽限一格（半天）刚好给出一回合的余地。
 */
export const MISS_GRACE_TICKS = 1

/** 提示词里最多摆几条「还没到期」/「已经错过」—— 防提示词膨胀（due 一律全摆） */
export const PROMPT_PENDING_MAX = 3
export const PROMPT_MISSED_MAX = 2

/** 读时钟：坏值 / 缺省 → 0，不抛也不报错（与 lib/plot.ts 的 tickOf 同一口径） */
function readTick(input: AnchorInput): number {
  const t = input.tick
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.floor(t) : 0
}

/** 这条锚点挂在哪一段（null = 跨段） */
export function anchorsOfEvent(evId: string | null | undefined, list: Anchor[] = ANCHORS): Anchor[] {
  if (!evId) return []
  return list.filter((a) => a.evId === evId)
}

/** 按 id 取锚点（跨文件只走这一处，别各写一遍 filter） */
export function anchorById(id: string, list: Anchor[] = ANCHORS): Anchor | undefined {
  return list.find((a) => a.id === id)
}

/**
 * 界面那一行读的「第 N 日之后」。
 *
 * minTick 的单位是**格（半天）**，所以 N = ceil(minTick / 2) ——
 * 第 3 格（第 1 日 · 半天）念作「第 2 日之后」，宁可说晚不说早。
 * 没填 minTick（卷二起 timeline 没有日标）→ null：那一行就不念日子。
 */
export function dayAfterOf(a: Anchor): number | null {
  const m = a.when.minTick
  if (typeof m !== 'number' || !Number.isFinite(m) || m < 0) return null
  return Math.ceil(m / 2)
}

/** 前置：该收束的都收束了、时间也到了（与现场条件无关） */
function prereqHolds(a: Anchor, input: AnchorInput, tick: number): boolean {
  const w = a.when
  for (const id of w.afterDone ?? []) {
    if (!input.epDone?.[id]) return false
  }
  const min = typeof w.minTick === 'number' && Number.isFinite(w.minTick) ? w.minTick : 0
  return tick >= min
}

/** 现场：place / cast / flag / playerAct —— 给了的每一条都要成立 */
function situatedHolds(a: Anchor, input: AnchorInput): boolean {
  const w = a.when
  if (typeof w.place === 'string' && w.place.trim()) {
    if ((input.place ?? '').trim() !== w.place.trim()) return false
  }
  if (w.cast && w.cast.length) {
    // 「这些人里至少一人在场」。名单未知（没给 cast）同样算不成立 —— 认不出就别替它认。
    const here = input.cast
    if (!here || !w.cast.some((id) => here.includes(id))) return false
  }
  if (w.flag) {
    for (const [k, v] of Object.entries(w.flag)) {
      if (input.flags?.[k] !== v) return false
    }
  }
  if (w.playerAct === true && input.playerAct !== true) return false
  return true
}

/**
 * 三态判定。**只读**：不改 input，也不写 WorldState。
 *
 * @param input 此刻的读数
 * @param list  锚点表（缺省 = ANCHORS；离线脚本造样例时传自己的表）
 */
export function anchorStatus(input: AnchorInput, list: Anchor[] = ANCHORS): AnchorVerdict {
  const tick = readTick(input)
  const due: Anchor[] = []
  const imminent: Anchor[] = []
  const missed: Anchor[] = []
  for (const a of list) {
    if (input.landed?.[a.id]) continue // 落过一次就不再复述
    const pre = prereqHolds(a, input, tick)
    if (pre && situatedHolds(a, input)) {
      due.push(a)
      continue
    }
    const min = typeof a.when.minTick === 'number' && Number.isFinite(a.when.minTick) ? a.when.minTick : 0
    if (pre) {
      /* 时机到了、现场条件没凑齐：宽限期内先算「下一步就到」（导演这一回合还来得及把人凑上），
         过了宽限就判成「错过」—— 这时提示词改念 fallback，锚点不会因为玩家一直走开就消失。 */
      if (tick >= min + MISS_GRACE_TICKS) missed.push(a)
      else imminent.push(a)
      continue
    }
    /* 还没到时候：只有「前一段已经走完、时钟离 minTick 只在两步之内」才值得提前念一句 guard。 */
    const afterDoneOk = (a.when.afterDone ?? []).every((id) => !!input.epDone?.[id])
    if (afterDoneOk && tick < min && min - tick <= IMMINENT_TICKS) imminent.push(a)
  }
  return { due, imminent, missed }
}

/**
 * 界面那行读的「下一个锚点」：按表序（= 阅读序）取**第一条还没落地**的。
 *
 * 与 due / imminent 分开是因为它答的是另一个问题 —— 「还有哪件大事没来」，
 * 而不是「此刻该不该让它来」。到期时 `due` 为 true，那一行就变红。
 */
export function nextAnchor(
  input: AnchorInput,
  list: Anchor[] = ANCHORS,
): { anchor: Anchor; due: boolean; dayAfter: number | null } | null {
  const tick = readTick(input)
  for (const a of list) {
    if (input.landed?.[a.id]) continue
    const due = prereqHolds(a, input, tick) && situatedHolds(a, input)
    return { anchor: a, due, dayAfter: dayAfterOf(a) }
  }
  return null
}

/**
 * 提示词那一节 —— **没有内容就返回空串**（整节不出现，提示词与从前一字不差）。
 *
 * 用词上有条硬规：不出现「唯一事实来源 / 就是定论 / 必须发生」这三类说法
 * （mech §41 那一批断言钉的就是它们：把结果说成定论，导演就会把情节推回原点，
 * 玩家的行动等于白做）。这里说的是「这一件状态要成立，过程归他」。
 */
export function anchorsPrompt(v: AnchorVerdict): string {
  const pend = v.imminent.slice(0, PROMPT_PENDING_MAX)
  const miss = v.missed.slice(0, PROMPT_MISSED_MAX)
  if (!v.due.length && !pend.length && !miss.length) return ''
  const rows: string[] = []
  for (const a of v.due) {
    rows.push(
      `· 已到期的：${a.title} —— ${a.outcome}（现在这一回合就要让它落地；形式 / 代价 / 在场者 / 关系后果都可以按他的行动改写，但这一件状态要成立。）`,
    )
  }
  for (const a of miss) {
    rows.push(`· 已经错过的：${a.title} —— 按这个形态补回来：${a.fallback}`)
  }
  for (const a of pend) {
    rows.push(`· 还没到期的：${a.title} —— 别提前写掉；${a.guard}`)
  }
  return `\n\n【世界线锚点 · 这一段不可动摇的事】\n${rows.join('\n')}`
}
