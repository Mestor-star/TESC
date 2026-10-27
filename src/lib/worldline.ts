/**
 * 世界线脊梁 —— 把 24 个真锚点与此刻的 world 折成「一页看得见」的行数据。
 *
 * 纯函数，只读：不改 world，也不写任何状态。判定一律复用 `lib/anchors.ts` 的
 * `anchorStatus`（到期 / 错过那两档的判据不在别处另写一套），这里只做三件事：
 *   ① 把每条锚点折成一行（四档状态 + 那几个要摊开才看得到的字段）；
 *   ② 把 `world.records` 里 `diverged === true` 的挑出来单独成表；
 *   ③ 给栏头数数（锚点几条、落地几条、到期几条、偏离几段）。
 *
 * 四档状态的优先级（从上往下判，命中即定）：
 *   landed  已落地 —— `world.anchors[id]` 有记录（带落在第几格、怎么落的）
 *   due     此刻到期 —— anchorStatus 判 due
 *   missed  已错过 —— anchorStatus 判 missed（那一行念 fallback 的首句）
 *   pending 还没到 —— 其余；minTick 还有余量时念「第 N 日之后」
 *
 * 「怎么落的」两档来自 `AnchorLog.how`：played = 按原样演出来了，
 * fallback = 走的是那条替代形态。文案放这儿是为了让离线断言读得到字。
 */
import type { Anchor, AnchorLog, AnchorVariable, RecordMode, WorldState } from '../data/types'
import { ANCHORS } from '../data/anchors'
import { TIMELINE } from '../data/timeline'
import { anchorStatus, dayAfterOf } from './anchors'

/** 可变量的中文名（顺序即锚点表里 variable 的书写顺序，这里不动它） */
export const VARIABLE_LABEL: Record<AnchorVariable, string> = {
  form: '形式',
  cost: '代价',
  relation: '关系',
  who: '见证人',
  when: '时机',
}

/** 四档状态（闭集：界面上的徽记与 data 属性都只认这四个） */
export type WorldlineState = 'landed' | 'due' | 'missed' | 'pending'

/** 徽记上那两个字 —— 与 state 一一对应 */
export const STATE_LABEL: Record<WorldlineState, string> = {
  landed: '已落地',
  due: '此刻到期',
  missed: '已错过',
  pending: '还没到',
}

/** 「怎么落的」那两个字 */
export const HOW_LABEL: Record<AnchorLog['how'], string> = {
  played: '原文演出',
  fallback: '替代形态',
}

/** 脊梁上的一行 */
export interface WorldlineRow {
  /** 锚点 id（`world.anchors` 的键，进了存档就不改） */
  id: string
  /** 挂靠的段（跨段锚为 null） */
  evId: string | null
  title: string
  /** 那一天不可动摇的那件状态事 */
  outcome: string
  /** 玩家能改的那几样（已中文化） */
  variables: string[]
  fallback: string
  /** 原文出处，一句「第 N 卷 · 章」 */
  sourceRef: string
  state: WorldlineState
  /** 徽记上的字（= STATE_LABEL[state]） */
  stateLabel: string
  /** 落地时落在第几格（未落地 → null） */
  tick: number | null
  /** 落地方式（未落地 → null） */
  how: AnchorLog['how'] | null
  /** 落地方式的中文（未落地 → null） */
  howLabel: string | null
  /**
   * 「第 N 日之后」—— **只在还没到、且时钟确实还没走到 minTick 时**才有值。
   * 填法是 `lib/anchors.ts` 的 dayAfterOf（N = ceil(minTick / 2)），这里不另算一套。
   */
  dayAfter: number | null
  /** 这一行是不是**当前段**那一行（anchor.evId 命中此刻在推的那一段） */
  current: boolean
  /** 已错过那一行念的话：fallback 的首句（未错过 → null） */
  missedNote: string | null
}

/** 偏离账本里的一行 */
export interface WorldlineDiverged {
  eventId: string
  /** 时间线事件标题（查不到就退回 eventId） */
  title: string
  /** 收束方式（界面自己按 MODE 那一套念，这里只给原值） */
  mode: RecordMode
  /** 摘要首句 */
  digestFirst: string
}

/** 栏头那几个数 */
export interface WorldlineCount {
  total: number
  landed: number
  due: number
  missed: number
  pending: number
  /** 偏离账本的条数 */
  diverged: number
}

/** 折出来的一页 */
export interface Worldline {
  rows: WorldlineRow[]
  diverged: WorldlineDiverged[]
  count: WorldlineCount
}

/** 折这一页要的三样读数（都是「此刻的」，函数不改它们） */
export interface WorldlineInput {
  /** 世界状态（只读这三栏：anchors / tick / records） */
  world?: Partial<Pick<WorldState, 'anchors' | 'tick' | 'records'>> | null
  /** 已收束的段（`Terminal` 的 epDone） */
  epDone?: Record<string, true> | null
  /** 此刻在推的那一段（当前段高亮用） */
  curEvId?: string | null
}

/**
 * 一句话的首句。
 *
 * 锚点的 fallback 往往是一整句「他不肯离开神殿 → 装置自行启动、把两人强行推出：
 * 这层关系照样成立，只是露娜把它记成『被这个人拖累』。」—— 脊梁上那一行只摆首句，
 * 全文在展开里。判据是第一个句号（。／. 都算），没有句号就整句照摆。
 */
export function firstSentence(text: string): string {
  const s = (text ?? '').trim()
  if (!s) return ''
  const at = s.search(/[。.]/)
  return at >= 0 ? s.slice(0, at + 1) : s
}

/** 读时钟：坏值 / 缺省 → 0（与 lib/anchors.ts 的 readTick 同一口径，这里只为了写「第 N 日之后」） */
function readTick(world: WorldlineInput['world']): number {
  const t = world?.tick
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.floor(t) : 0
}

/** 出处那一句：「第 1 卷 · 序章『船与影』／第1话」 */
export function sourceRefText(a: Anchor): string {
  const ch = a.sourceRef.ch?.trim() ? a.sourceRef.ch.trim() : '（未标注章节）'
  return `第 ${a.sourceRef.vol} 卷 · ${ch}`
}

/**
 * 折一页。
 * @param input 此刻的三样读数
 * @param list  锚点表（缺省 = 24 条真锚点；离线脚本造样例时传自己的表）
 */
export function buildWorldline(input: WorldlineInput = {}, list: Anchor[] = ANCHORS): Worldline {
  const world = input.world ?? {}
  const landed = world.anchors ?? {}
  const tick = readTick(world)
  const verdict = anchorStatus({ epDone: input.epDone ?? null, tick, landed })
  const dueIds = new Set(verdict.due.map((a) => a.id))
  const missedIds = new Set(verdict.missed.map((a) => a.id))
  const curEvId = input.curEvId ?? null

  const rows: WorldlineRow[] = list.map((a) => {
    const log = landed[a.id]
    let state: WorldlineState
    if (log) state = 'landed'
    else if (dueIds.has(a.id)) state = 'due'
    else if (missedIds.has(a.id)) state = 'missed'
    else state = 'pending'

    const min = typeof a.when.minTick === 'number' && Number.isFinite(a.when.minTick) ? a.when.minTick : null
    const dayAfter = state === 'pending' && min !== null && tick < min ? dayAfterOf(a) : null

    return {
      id: a.id,
      evId: a.evId ?? null,
      title: a.title,
      outcome: a.outcome,
      variables: (a.variable ?? []).map((v) => VARIABLE_LABEL[v] ?? v),
      fallback: a.fallback,
      sourceRef: sourceRefText(a),
      state,
      stateLabel: STATE_LABEL[state],
      tick: log ? (typeof log.tick === 'number' && Number.isFinite(log.tick) ? log.tick : 0) : null,
      how: log ? log.how : null,
      howLabel: log ? HOW_LABEL[log.how] : null,
      dayAfter,
      current: !!a.evId && a.evId === curEvId,
      missedNote: state === 'missed' ? firstSentence(a.fallback) : null,
    }
  })

  const titleOf = (eventId: string) => TIMELINE.find((e) => e.id === eventId)?.title ?? eventId
  const diverged: WorldlineDiverged[] = (world.records ?? [])
    .filter((r) => r.diverged === true)
    .map((r) => ({
      eventId: r.eventId,
      title: titleOf(r.eventId),
      mode: r.mode,
      digestFirst: firstSentence(r.digest),
    }))

  const count: WorldlineCount = {
    total: rows.length,
    landed: rows.filter((r) => r.state === 'landed').length,
    due: rows.filter((r) => r.state === 'due').length,
    missed: rows.filter((r) => r.state === 'missed').length,
    pending: rows.filter((r) => r.state === 'pending').length,
    diverged: diverged.length,
  }

  return { rows, diverged, count }
}
