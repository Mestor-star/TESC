/* ============================================================
   次数统计（data/acts.ts）
   ------------------------------------------------------------
   **游戏内档案，不是原文考据。** 原作没有这些数 —— 栏位、标签与规矩都由本终端
   自行拟制（与 data/intimate.ts 同一性质）。因此绝不许冠以「· 原文」，也不进
   人物卡 / 导演提示词当事实喂；它只写在私密档案的背面那一栏里。

   八栏是**八本各记各的账**（见 `ACT_KINDS`）：前七栏按「她做了什么」分，
   最后一栏按「他怎么收的」分 —— 所以「内射」与「性交 / 肛交」互不换算：
   同一次里可以两栏同时加一，也可以只有交合而没有内射。

   规矩只有三条，都落在本文件的三个函数里：
     · **只增不减**（`mergeActs`）—— 这是一本累计账，没有往回缩的道理；
     · **一回合一小步**（sanitizer 那道 1–9 的夹子）—— 一次报十回等于没数；
     · **数不清就不给** —— 拿不准的整条省略，宁可少记一笔，也不虚报。

   与 `WorldState.intim` 的分工：intim 说的是「这一处**此刻**是什么样」
   （开发度 / 状态句 / 破处对象，可以被改写与覆盖），acts 说的是「**一共**多少回」
   （只累加、不覆盖）。两本账一一对应，各记各的。
   ============================================================ */

import type { ActCount, ActKind } from './types'

/** 八栏的固定顺序 —— 界面与提示词都照它排列，别各自再写一套 */
export const ACT_KINDS: readonly ActKind[] = [
  'kiss', 'oral', 'sex', 'anal', 'hand', 'foot', 'breast', 'creampie',
] as const

/** 每一栏的中文标签与一行释义（档案面板与提示词共用） */
export const ACT_META: Record<ActKind, { label: string; hint: string }> = {
  kiss: { label: '亲吻', hint: '唇与舌的接触 —— 礼节性的贴面不算' },
  oral: { label: '口交', hint: '她以口、舌与咽喉待他的次数' },
  sex: { label: '性交', hint: '小穴里的结合' },
  anal: { label: '肛交', hint: '后庭里的结合' },
  hand: { label: '手交', hint: '她以手待他的次数' },
  foot: { label: '足交', hint: '她以足待他的次数' },
  breast: { label: '乳交', hint: '她以胸待他的次数' },
  creampie: { label: '内射', hint: '射在里面 —— 与性交 / 肛交各记各的，同一次里可以两栏都动' },
}

/** 这一栏是不是「他收下的」那一栏（内射）—— 面板上分组摆要用 */
export function isActReceive(kind: ActKind): boolean {
  return kind === 'creampie'
}

/** 一本账的总回数（八栏求和；空表读作 0） */
export function actTotal(count: ActCount | undefined): number {
  if (!count) return 0
  let sum = 0
  for (const k of ACT_KINDS) {
    const v = count[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) sum += v
  }
  return sum
}

/** 某一栏的读数（没记过 → 0） */
export function actOf(count: ActCount | undefined, kind: ActKind): number {
  const v = count?.[kind]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * 把一次报上来的增量**并进**手里那一本账，返回新的那一本。
 *
 * 这是「只增不减」落地的地方，所以它必须是纯函数、独自可验：
 *   · 逐栏**累加**（负数、零、非数（NaN / Infinity）一律跳过 —— 这本账没有往回缩的道理）；
 *   · 没报的栏位原样留着，不因为这次没提它就归零。
 * 上头的 sanitizer 本来就把它夹成 1–9 的整数了 —— 这里再守一道，是因为
 * 「只增不减」是这一栏的规矩本身，不该只靠上游那一层拦。
 */
export function mergeActs(cur: ActCount | undefined, add: ActCount): ActCount {
  const next: ActCount = { ...cur }
  for (const kind of ACT_KINDS) {
    const v = add[kind]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
    next[kind] = (next[kind] ?? 0) + Math.round(v)
  }
  return next
}
