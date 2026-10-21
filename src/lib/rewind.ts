/* ============================================================
   剧情多步回退（lib/rewind.ts）
   ------------------------------------------------------------
   现有的 `reopenEvent(id)` 只撤**一格**：撤 `epDone[id]`、撤那一条低语者记录、
   重算羁绊下限、指针退回。可玩家想回到**更早**的一段时，单撤一格会把这一段
   后面那些已归档段留在账上 —— 时间线断裂、指针错位。

   这里补的是「**退回到某一段之前**」：把目标段**及其之后所有已归档段**一起撤掉。

   纯函数，无 React、无存储：只算一份 `RewindPlan` 交给调用方去落地
   （撤 `epDone` 键 / 撤记录 / 重算 locked / 删 `world.anchors` 键 / 挪指针）。

   阅读序从哪儿来 —— 只有一处：`lib/freetime.ts` 的 `EPISODES`。
   `data/timeline.ts` 也导出了 `readingIndexOf`，但它只认 `TIMELINE`，
   卷间那格自由段（`free:v1` 之类）在那条线上读作 **-1** ——
   `Terminal.tsx` 的注释里已经点明这事（`closeFreeSlot` 那段）。
   回退**必须**能排自由段的位置（规则 6 要求它照样进 `drop`），
   所以这里一律照 `EPISODES` 的下标当阅读序 —— 它本来就是「`TIMELINE` 加上
   每卷之后的自由段」那条完整读序，另造一套顺序只会两处对不上。

   不在 `EPISODES` 里的键（旧档遗留 / 已下线的段）：读序未知，
   **宁可留在 `keep` 里也不撤** —— 排不到位置的段，撤掉就没有第二次机会了。
   同理，这种键当 `target` 时返回 `null`：不知道它站在哪儿，就算不出该撤到哪儿。
   ============================================================ */

import { EPISODES } from './freetime'
import { ANCHORS } from '../data/anchors'

/** 一份多步回退的方案（调用方照着它落盘，本模块自己不碰任何状态） */
export interface RewindPlan {
  /** 保留的已归档段（按阅读序） */
  keep: string[]
  /** 要撤销的段（按阅读序，含目标段本身） */
  drop: string[]
  /** 回退后推演指针应落的那一段（drop 之前最近一段；没有就 null） */
  cursor: string | null
  /** 这些段对应的锚点 id（要一并从 `world.anchors` 撤掉） */
  anchors: string[]
}

/** 阅读序：`EPISODES` 的下标；同一 id 只认第一次出现（重复 id 那格当没插过） */
const READ_ORDER: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>()
  EPISODES.forEach((ev, i) => {
    if (!m.has(ev.id)) m.set(ev.id, i)
  })
  return m
})()

/** 一个键的阅读序；不在读序里（旧档遗留 / 自由段以外的不明键）读作 -1 */
function readOrderOf(id: string): number {
  return READ_ORDER.get(id) ?? -1
}

/**
 * 算一份「退回到 `target` 之前」的方案。
 *
 * `target` 没归档（或不在读序里）→ `null`：没有可撤的那一格，别让调用方按空方案落盘。
 * 否则 `drop` = 阅读序 ≥ target 的全部已归档段（含自由段那一格），`keep` = 其余。
 */
export function planRewind(target: string, epDone: Record<string, true>): RewindPlan | null {
  if (!epDone[target]) return null
  const at = readOrderOf(target)
  if (at < 0) return null

  /** 排得到位置的已归档段，按阅读序 */
  const ordered: string[] = []
  /** 排不到位置的已归档段（读序未知，一律留在 keep，撤了就没第二次机会） */
  const unordered: string[] = []
  for (const id of Object.keys(epDone)) {
    if (!epDone[id]) continue
    if (readOrderOf(id) < 0) unordered.push(id)
    else ordered.push(id)
  }
  ordered.sort((a, b) => readOrderOf(a) - readOrderOf(b))

  const keep: string[] = []
  const drop: string[] = []
  for (const id of ordered) {
    if (readOrderOf(id) >= at) drop.push(id)
    else keep.push(id)
  }

  /* 指针落 `keep` 里阅读序最靠后的那一段。排不到位置的那些不参与定指针 ——
     它们本来就不该被当成「读到哪儿了」的标记。 */
  const cursor = keep.length > 0 ? keep[keep.length - 1]! : null

  const dropSet = new Set(drop)
  const anchors = ANCHORS.filter((a) => a.evId != null && dropSet.has(a.evId)).map((a) => a.id)

  return { keep: [...keep, ...unordered], drop, cursor, anchors }
}
