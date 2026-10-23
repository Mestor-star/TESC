/* ============================================================
   喂给导演的那一份历史（lib/turns.ts）
   ------------------------------------------------------------
   剧情推进页把一段会话正文接进提示词，走的是 `toTurns`：取末尾 N 条、翻成
   ChatTurn。它从前不看**这一段还在不在时间线上** —— 于是回退之后重推同一段时，
   被撤下的那一屏正文仍被当成「已经发生的对话」接进提示词：同一段在上下文里
   出现两套版本，导演照着幽灵自相矛盾地往下写（2026-09-20 主人点名的那一处）。

   两半判据，缺一不可：

   ① **段级（结构性）**：`EPISODES` 的读序上落在「最前沿」之后的段，整段不取。
      前沿 = 已归档段里阅读序最大的那一格，与「第一格未收束的段」取大。回退把
      `epDone` 退回去之后，被撤段**之后**那些段的正文（旧时间线残留）就在前沿
      之外，不必记账也认得出来；刷新重进照样成立。

   ② **条级（记号）**：前沿那一格本身的旧正文没法和「正在推的这一格」分开 ——
      回退到 v1-2 之前，与正常玩到 v1-2 中间，`(epDone, cur, logs)` 一模一样
      （`epDone` 只有 v1-1、`cur` 也是 v1-1）。所以回退那一下把被撤段的每一条
      消息打上 `meta.stale = true`（`markStale`）：**正文一个字不删**，仍留在
      `zts-plot:v1` 里照旧能读，只是不再喂给导演。重推之后新写的消息没有这枚
      记号，照常进历史；旧的那一屏永远进不去 —— 它本来就是被作废的版本。

   `cur` 不参与判定：它记的是「最靠前的**已读**段」，回退前后与正常推进时取值相同，
   分不出上面那两种情形（这一条写在判据里，免得下一个人以为漏了一个参数）。

   本模块无 React；纯函数部分（`onTimeline` / `liveMsgs` / `turnsFor`）不碰存储，
   可以直接验。只有 `markStale` 读写 `zts-plot:v1`（回退那一下调它）。
   ============================================================ */

import type { ChatMsg, ChatMsgMeta } from '../data/types'
import type { ChatTurn } from './api'
import { EPISODES } from './freetime'
import { PLOT_KEY, noteStorageFault } from './slots'
import { tabWriteBlocked } from './tablock'

/** `meta` 上那枚「属于被撤下的时间线」的记号（界面记号，不是回执字段） */
type StaleMeta = ChatMsgMeta & { stale?: boolean }

/** 阅读序：与 `lib/rewind.ts` 同一套 —— 只有 `EPISODES` 一处，另造一套只会两处对不上 */
const READ_ORDER: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>()
  EPISODES.forEach((ev, i) => {
    if (!m.has(ev.id)) m.set(ev.id, i)
  })
  return m
})()

/**
 * 时间线的最前沿（阅读序下标）。
 *
 * 取「已归档段里最大的下标」与「第一格未收束的段的下标」的较大者：
 *   · 正常推进：epDone = {v1-1} → 前沿是 v1-2 —— 正在推的这一格在线上，
 *     比它更靠后的段（只可能是旧时间线残留）不在线上；
 *   · 全篇走完：没有「未收束的段」，前沿就是最后归档的那一格 ——
 *     这时每一段都还在线上（已归档的段永远算数）。
 */
function frontierOf(epDone: Record<string, true>): number {
  let best = -1
  for (const id of Object.keys(epDone)) {
    if (!epDone[id]) continue
    const at = READ_ORDER.get(id)
    if (at !== undefined && at > best) best = at
  }
  for (let i = 0; i < EPISODES.length; i += 1) {
    if (!epDone[EPISODES[i]!.id]) {
      if (i > best) best = i
      break
    }
  }
  return best
}

/**
 * 这一段还在不在时间线上（还在 = 它的正文可以喂给导演）。
 *
 * 已归档的段一律算数；读序排不到的那些键（旧档遗留 / 已下线的段）也算数 ——
 * 判不出来就别乱删，与 `lib/rewind.ts` 对这类键的口径一致。
 */
export function onTimeline(epDone: Record<string, true>, segId: string): boolean {
  const at = READ_ORDER.get(segId)
  if (at === undefined) return true
  return at <= frontierOf(epDone)
}

/** 这一条消息是不是「被撤下的时间线」留下的 */
export function isStale(m: ChatMsg): boolean {
  return (m.meta as StaleMeta | undefined)?.stale === true
}

/**
 * 这一段**还该喂给导演**的那些消息（顺序不动、原文不动）。
 * 段不在时间线上 → 空；段内带 stale 记号的条 → 跳过。
 */
export function liveMsgs(epDone: Record<string, true>, segId: string, log: ChatMsg[] | undefined): ChatMsg[] {
  if (!log || !log.length) return []
  if (!onTimeline(epDone, segId)) return []
  return log.filter((m) => !isStale(m))
}

/**
 * 一段会话正文 → 提示词历史（**唯一入口**，Plot.tsx 的 `toTurns` 换成了它）。
 *
 * 只取末尾 `max` 条，且只取「还在时间线上、且不是被撤下的那一版」的那些 ——
 * 回退之后重推同一段时，旧那一屏正文不再进提示词，但它仍在 `zts-plot:v1` 里，
 * 观测者在「剧情推进」里照旧读得到。
 */
export function turnsFor(
  epDone: Record<string, true>,
  segId: string,
  log: ChatMsg[] | undefined,
  max = 16,
): ChatTurn[] {
  return liveMsgs(epDone, segId, log)
    .slice(-max)
    .map((m): ChatTurn => (
      m.from === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text }
    ))
}

/**
 * 给这些段的每一条消息打上 `meta.stale` 记号并落盘 —— 回退那一下调它（只加记号，
 * **一个字都不删**：观测者还想重读那一屏）。
 *
 * 为什么写在 `zts-plot:v1` 里、而不是另开一个「被撤段」的键：这份记号就是会话账
 * 自己的一半状态，跟着账走 —— 重置 / 读档 / 清往期正文那一套清账的动作顺手就把它
 * 带走了，不必再在 `lib/slots.ts` 的清理名单里登记一个新键（漏登记就是新档里
 * 误伤同 id 的段）。读回也只看这一个来源，没有第二本账要对齐。
 *
 * 返回这次真正改了记号的消息条数（0 = 什么都没变，调用方不必惊动谁）。
 */
export function markStale(segIds: readonly string[]): number {
  if (!segIds.length) return 0
  /* 只读页（另一个标签页在玩同一份进度）一个字都不写 —— 与 writeLogs 同一条闸 */
  if (tabWriteBlocked()) return 0
  let file: Record<string, unknown>
  try {
    const raw = localStorage.getItem(PLOT_KEY)
    if (!raw) return 0
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0
    file = parsed as Record<string, unknown>
  } catch {
    // 隐私模式 / 账被写坏：当作没打成 —— 历史那一侧还有段级那道闸兜着
    return 0
  }

  let touched = 0
  for (const seg of segIds) {
    const list = file[seg]
    if (!Array.isArray(list)) continue
    file[seg] = (list as ChatMsg[]).map((m) => {
      if (!m || typeof m !== 'object' || isStale(m)) return m
      touched += 1
      return { ...m, meta: { ...(m.meta ?? {}), stale: true } as StaleMeta }
    })
  }
  if (!touched) return 0
  try {
    localStorage.setItem(PLOT_KEY, JSON.stringify(file))
  } catch (e) {
    noteStorageFault(PLOT_KEY, e)
    return 0
  }
  return touched
}
