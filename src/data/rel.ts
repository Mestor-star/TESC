/* ============================================================
   关系档位（data/rel.ts）
   ------------------------------------------------------------
   **这一栏由剧情给，不从读数换算。** 羁绊是读数（0–100 的一条量表，主角一路的
   言行攒出来的），关系档位是「这两个人之间到底走到哪儿了」—— 同样 80 的羁绊，
   可以是并肩的战友，也可以是把话挑明了的恋人，差别不在数上。

   所以 `WorldState.rel` 只由导演在剧情真走到那一步时落一次
   （`PlotDirective.rel`），给的是**此刻的档位**（绝对值、不是增量）：
   可以往上走，也可以因为一场翻脸往回掉。本文件不写任何「多少羁绊换哪一档」
   的函数 —— 那种映射一旦写出来，这一栏就退化成读数的别名了。

   与私密档案同一性质：**游戏内档案，不是原文考据**。原作没有这张梯子；
   它只用来给档案页一个读得懂的落点，**界面与提示词里都不许把它说成原文设定**。

   另一条边界：这九级说的是**关系本身**（从萍水到誓约），不是身体进度 ——
   「情人」那一档说的是关系已经带着身体这一层且持续着，但它**不代替**
   私密档案里那四处开发度的读数。两本账各记各的（见 data/acts.ts 的开头）。
   ============================================================ */

import type { RelId } from './types'

/**
 * 九级梯子 —— **顺序即高低**（从生到熟，逐级往上）。
 *
 * 每一级的 `hint` 是**导演照着写的那一句口径**：她不只换个称呼，整个分寸、
 * 能说的话、肯让的距离都跟着换。所以梯子上每一级的 hint 都要写得能用 ——
 * 只写「关系好」这种话，等于没给这一栏。
 */
export const REL_TIERS: readonly { id: RelId; name: string; hint: string }[] = [
  {
    id: 'stranger', name: '萍水',
    hint: '还没说上几句话：客气、公事公办，各人守着各人的位置',
  },
  {
    id: 'known', name: '认得',
    hint: '认得这个人了：照面会打招呼，说两句场面话，不深交',
  },
  {
    id: 'friend', name: '朋友',
    hint: '说得上话的熟人：愿意搭把手、开两句玩笑，但私事仍收着',
  },
  {
    id: 'close', name: '亲近',
    hint: '放得下防备：肯说私事、肯示弱，也肯在他面前露出不体面的那一面',
  },
  {
    id: 'heart', name: '交心',
    hint: '心意已经清楚了，只是那层话还没挑明：会绕、会试探、会为一点小事上心',
  },
  {
    id: 'lover', name: '恋人',
    hint: '两情相悦，话已经挑明了：称呼、距离、身体上的亲近都不再是越界的事',
  },
  {
    id: 'mate', name: '情人',
    hint: '关系里已经带着身体这一层，且持续着：见面就不必绕，也不必装没事人',
  },
  {
    id: 'exclusive', name: '独占',
    hint: '彼此只认这一条线：把话说到过那一层，旁人的位置也就不存在了',
  },
  {
    id: 'pledged', name: '誓约',
    hint: '已经许下终身：往后的事按「一起」来算，称呼与分寸都归到了最里面那一档',
  },
]

/** 梯子上九级的 id（按顺序）—— 指令 schema 那一行照它拼 */
export const REL_IDS: readonly RelId[] = REL_TIERS.map((t) => t.id)

const BY_ID = new Map<RelId, { id: RelId; name: string; hint: string }>(REL_TIERS.map((t) => [t.id, t]))

/** 这一级在梯子上排第几（0 起；认不出来 → -1） */
export function relIndex(id: RelId | null | undefined): number {
  if (!id) return -1
  return REL_TIERS.findIndex((t) => t.id === id)
}

/** 梯子上的第几级（认不出来 → null） */
export function relTier(id: RelId | null | undefined): { id: RelId; name: string; hint: string } | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

/** 档位的中文名（还没定下 / 认不出来 → 空串，调用方自己摆那一句「尚未定下」） */
export function relName(id: RelId | null | undefined): string {
  return relTier(id)?.name ?? ''
}

/** 档位那一句口径（提示词用；还没定下 → 空串） */
export function relHint(id: RelId | null | undefined): string {
  return relTier(id)?.hint ?? ''
}

/** id 是不是梯子上的一级（sanitizer 用） */
export function isRelId(v: unknown): v is RelId {
  return typeof v === 'string' && BY_ID.has(v as RelId)
}

/**
 * 整张梯子渲染成提示词里的那一段（`- id（名字）——口径`）。
 *
 * 只列到 `'pledged'` 为止的**整张**：导演得看得见上面还有几级，
 * 才知道此刻这一档是刚起步还是已经走到很里面了。
 */
export function relLadderText(): string {
  return REL_TIERS.map((t) => `- ${t.id}（${t.name}）—— ${t.hint}`).join('\n')
}
