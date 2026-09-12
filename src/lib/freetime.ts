/* ============================================================
   自由时间（lib/freetime.ts）
   ------------------------------------------------------------
   主线不该一段咬着一段没完。每一大卷收束之后、下一卷开头之前，
   中间那一段空档就是**自由时间** —— 那一格不按大纲走：闲逛、找人说话、
   接个任务、赴一场约、私密往来，都行。

   两处入口，同一条规矩：
     · **卷间那一格**（`EPISODES` 里插进来的 `free:<卷>` 段）—— 上一卷最后一节
       收束后自动顶上来，推演到哪儿算哪儿；按下「进入下一卷」才接回主线。
     · **自由活动开关**（`WorldState.free`）—— 主线走到一半也想脱纲一会儿，
       右栏那一枚开关按下去就进了同一个状态，关掉就回主线。

   同一条规矩说的是这个：**这期间羁绊一律不动**。
   不在提示词里求模型别给 —— 是在落地那一层拦掉的（见 lib/plot.ts 的
   `applyDirective(d, api, { freezeBond })`）。开发度 / 次数账 / 关系档位
   照常各记各的：一场赴约该记的还记，只是好感那条线不在这儿长。

   这一格**不是原文**：原作没有「自由时间」这回事。所以它的段头一律写
   「（非原文 · 本终端拟制）」，也绝不冠「· 原文」。
   ============================================================ */

import { TIMELINE } from '../data/timeline'
import type { TimelineEvent } from '../data/types'

/** 自由段的 id 前缀（`free:v1` = 第 1 卷之后那一段） */
export const FREE_PREFIX = 'free:'

/** 是不是自由段（卷间那一格） */
export function isFreeId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(FREE_PREFIX)
}

/** 自由段的 id（第 n 卷之后） */
export function freeIdAfterVol(vol: number): string {
  return `${FREE_PREFIX}v${vol}`
}

/** 自由段的档期名（右栏与段头都念它） */
export function freeLabel(vol: number): string {
  return `第 ${vol} 卷之后 · 自由时间`
}

/**
 * 造一格自由段。
 *
 * 它得**长得像一个 TimelineEvent** —— 整条流程（当前段 / 下一段 / 回退 / 正文）
 * 都是照那个形状写的，另起一套类型等于把那些路重写一遍。所以这里把大纲类的字段
 * 一律留空（`summary` 空、`entities` 空、`chars` 空、`bond` 空），
 * 提示词那一侧照 `isFreeId` 认它，走的是**另一份模板**（见 lib/plot.ts）。
 *
 * `place` / `day` 给的是「接着上一卷结尾」的落点：自由时间发生在上卷收束之后，
 * 地点与日子就从上卷末尾那一节续着念，别凭空造一个新的地方。
 *
 * **在场名册也一样续着上一段**（`cast` / `chars`）—— 空名单会连着坏三处：
 * 右栏「在场人物」整栏空掉、提示词里没有可写的人、`useProactiveSms` 的
 * 「谁不在眼前」把**所有人**都算进去（一进自由时间就涌一堆主动来信）。
 * 这些人只是接着上卷末尾还在场；导演中途改了名册（`world.cast`）照旧覆盖得住。
 */
export function freeSlot(vol: number, prev: TimelineEvent | undefined): TimelineEvent {
  return {
    id: freeIdAfterVol(vol),
    vol,
    ga: false,
    group: freeLabel(vol),
    order: 99,
    phase: '自由时间',
    title: '自由时间',
    place: prev?.place ?? '弗尔克图斯',
    day: prev?.day ?? '',
    summary: '',
    entities: [],
    chars: [...(prev?.chars ?? [])],
    cast: [...(prev?.cast ?? [])],
    bond: {},
    /* 原文没有这一段 —— 在数据上就把它标成不是原文，
       免得哪一处照着「有 id 就有原文」的假设去取切片。 */
    script: [],
  }
}

/**
 * 整条流程：`TIMELINE` 的每一卷收束之后插进一格自由时间。
 *
 * 插在**每卷最后一节之后**（最后一卷不插 —— 全篇走完就没有「下一卷」可进了，
 * 那时的自由活动由开关接手）。外传段照它自己在 TIMELINE 里的位置排，不另作处理：
 * 它本来就挨在某一卷后面，于是那一格自由时间自然落在它之后。
 *
 * 顺序即主线的读序 —— 当前段的指针就在这条线上走，别处一律照它，别再各自
 * 从 TIMELINE 里 find 一遍。
 */
export const EPISODES: TimelineEvent[] = buildEpisodes()

function buildEpisodes(): TimelineEvent[] {
  /* 插在哪一格，得按「卷 + 它后面那串外传」这一整段算 —— 不能只看 group 变没变：
     外传（`vol: 0`、`group: '外传·S1'`）是紧跟在第 2 / 第 3 卷之后的休整短篇，
     它属于**同一段**。只看 group 会在外传之后又插一格，还会因为两处外传都取
     `ev.vol === 0` 而造出两个同名的 `free:v0` —— 那是个会互相顶掉的重复 id。 */
  const vols = [...new Set(TIMELINE.map((e) => e.vol))].filter((v) => v > 0).sort((a, b) => a - b)
  const insertAfter = new Map<number, number>()
  vols.forEach((v, vi) => {
    /* 最后一卷后面不插：全篇走完就没有「下一卷」可进了，那时的自由活动由开关接手 */
    if (vi === vols.length - 1) return
    let j = TIMELINE.length - 1
    while (j > 0 && TIMELINE[j]!.vol !== v) j -= 1
    /* 再往后吃掉紧跟的那串外传（同一段里的休整短篇） */
    while (j + 1 < TIMELINE.length && TIMELINE[j + 1]!.ga) j += 1
    insertAfter.set(j, v)
  })

  const out: TimelineEvent[] = []
  for (let i = 0; i < TIMELINE.length; i += 1) {
    const ev = TIMELINE[i]!
    out.push(ev)
    const after = insertAfter.get(i)
    if (after !== undefined) out.push(freeSlot(after, ev))
  }
  return out
}

/** 按 id 取段：主线走 TIMELINE，自由段现造一个（`EPISODES` 里也有一份） */
export function episodeOf(id: string | null | undefined): TimelineEvent | undefined {
  if (!id) return undefined
  return EPISODES.find((e) => e.id === id)
}

/**
 * 这一段的「下一格」是哪一段（账上还没收束的那一格）。
 *
 * 照 `EPISODES` 的读序往后找第一个没收束的；找到自由段就停在那儿 ——
 * **别越过它去够下一卷**，那正是「一段咬着一段」要断掉的地方。
 */
export function nextEpisodeAfter(
  id: string,
  epDone: Record<string, boolean | undefined>,
): TimelineEvent | null {
  const i = EPISODES.findIndex((e) => e.id === id)
  if (i < 0) return null
  return EPISODES.slice(i + 1).find((e) => !epDone[e.id] && e.id !== id) ?? null
}

/**
 * 自由段的提示词框架 —— 换掉主线那份【事件大纲】。
 *
 * 主线那一份喂的是「原著里这一段怎么走的」；自由时间**没有那一段可喂**，
 * 所以这里给的是「怎么起、怎么收」：落在哪儿、按谁的分寸写、怎么算走完。
 * 要紧的是别让它空转 —— 没大纲不等于没事发生。
 */
export const FREE_FRAME = `（本段**没有原文大纲** —— 自由时间不是原作里的一段，
是这条时间线上本终端给你留的空档。所以别去凑原著情节，也别假装这里有个既定走向。）

怎么起：接上一段收束之后的落点 —— 人还在刚才那个地方，事刚了结，日子往下过。
把「接下来这一点时间他们各自在做什么」自然接上，不必另起一个场面。

这一段能发生什么：什么都行 —— 闲逛、找人说话、把攒着没问的话问出去、
接一件要办的事、赴一场约、两个人的私密往来。**不设范围**，按在场的这几位此刻的
关系与性子决定他们会一起走到哪儿。任务、约会、私密往来都照常落指令
（battle / intim / acts / rel 一样给），不因为「没有大纲」就少给。

怎么收：这一格**由操作员按「进入下一卷」结束**（或者他另说了要收）。
你别自己宣布自由时间结束 —— 但也要让它有事发生：这一段若只是「他们笑了笑、然后天亮了」，
那就是把一格空档白写了。每次落笔都得留下点什么：一句话、一个决定、一件办成的事。`

/**
 * 自由活动期间关于羁绊那一句话。
 *
 * 话要说，但**拦的不是这一句** —— 真正拦住的是落地那一层
 * （见 lib/plot.ts 的 `applyDirective(d, api, { freezeBond })`）。
 * 这里写明白，只是免得模型白写一条 bond 出来、再被默默丢掉。
 */
export const FREE_BOND_NOTE = `**自由活动期间羁绊一律不动。** 这一格里的任何事都不改好感读数 ——
羁绊只从主线长出来，空档里做什么都算不到它头上。所以**不要给 bond 那一条**（给了也不落）；
关系亲疏照**此刻**的读数写，别在这一格里把它往上推。
开发度、次数账、关系档位照常给 —— 顺着往下走，不因为「自由」就什么都不许动。`

/**
 * 刻度：走到哪一卷的哪一格了。
 *
 * 自由段不算主线进度（它对 `epDone` 是另一本账里的那一格），所以这里只数
 * `TIMELINE` 里收束过的节数 —— 与从前一样，加进来的自由段不该让进度条虚涨。
 */
export function countMainlineDone(epDone: Record<string, boolean | undefined>): number {
  return TIMELINE.filter((e) => epDone[e.id]).length
}
