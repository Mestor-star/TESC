/* ============================================================
   羁绊的阶段上限 —— 有的关系不是「攒出来的」，是「到了那一步」才翻篇的
   ------------------------------------------------------------
   露娜最典型：签订使用者契约（v1-9「黄金狮子 · 你的名字」，她以己命为他缝伤
   输血，在「我……可以坚持到最后吗」「可以哦」里立下契约）之前，她就算把命
   交出去也只到「倾心」那一档 —— 关系没走到那一步，好感不该先到那一步；
   契约一签，直接是满值：至死不渝的主仆，此后不再按行为增减。

   规则与 address.ts 同源：看的是「读到哪一段了」（时间线事件 id，含该段），
   不是读了多少。没写在这里的角色照旧按初见值 + 行为偏移算。

   与 `TimelineEvent.gate` 的关系：这里封的是**上限**（不到那一步最多给到哪），
   gate 拦的是**入口**（关系没走到就不让进那一段）。两个方向，合起来才是
   「契约之前攒不满、攒够了才进得去、进去之后锁满」这一整条线。
   ============================================================ */

import { TIMELINE } from './timeline'

export interface BondStage {
  /** 读到这一段（含）之后，关系才翻篇 */
  from: string
  /** 翻篇之前，好感封顶在这里 —— 时间推进本身不白送 */
  cap: number
  /** 翻篇之后直接给到的值 */
  full: number
  /** 到满值时才现身的那份「关系确认」 */
  confirm?: { title: string; body: string }
}

export const BOND_STAGE: Record<string, BondStage> = {
  luna: {
    // 使用者契约缔结于此（v1-9）。封顶 78 < 该段门槛 70 —— 攒得到，但攒不满：
    // 契约没签，这段关系就不该先到满值。
    from: 'v1-9',
    cap: 78,
    full: 100,
    confirm: {
      title: '使用者契约 · 至死不渝的主仆',
      body: '露娜（商会製人工侍从）理论上不可能解放终末。'
        + '她以「我……可以坚持到最后吗」「可以哦」那一句约定立下使用者契约，'
        + '让本应用于毁灭的黄金狮子反过来守人；自此她唤他「小主人」，'
        + '而这份关系不再按行为增减 —— 满了就是满了。',
    },
  },
}

const IDX = (id: string) => TIMELINE.findIndex((e) => e.id === id)

/** 这一段读到没有（cur = 当前所在的事件 id；null = 还在一节之前） */
export function stagePassed(charId: string, cur: string | null): boolean {
  const st = BOND_STAGE[charId]
  if (!st) return false
  const i = IDX(st.from)
  const at = cur ? IDX(cur) : -1
  return i >= 0 && at >= i
}

/** 羁绊的最终取值：没过那一段就封顶，过了就给满 */
export function bondWithStage(charId: string, value: number, cur: string | null): number {
  const st = BOND_STAGE[charId]
  if (!st) return value
  return stagePassed(charId, cur) ? st.full : Math.min(value, st.cap)
}

/** 到满值之后才给的那份关系确认（没有、或还没到那一步就 null） */
export function confirmOf(charId: string, cur: string | null): { title: string; body: string } | null {
  const st = BOND_STAGE[charId]
  if (!st?.confirm) return null
  return stagePassed(charId, cur) ? st.confirm : null
}
