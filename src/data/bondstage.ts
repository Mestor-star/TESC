/* ============================================================
   关系的「翻篇」节点 —— 只发一份确认，不再改数值
   ------------------------------------------------------------
   这个文件从前还有一档**阶段上限**：不到那一步好感封顶、到了那一步直接给满
   （露娜最典型：v1-9 之前封顶 78、之后给 100）。那一档已经撤掉 ——
   推进到哪一段都不再白送一个固定读数，好感只从主角的行为里来
   （见 Terminal 的 bondNow）。契约走完之所以仍然是满值，靠的不再是这里的
   封顶/满值，而是事件自己的 `lock`（v1-9 锁 100，只增不减）。

   留下来的这一份是**文案**：那件事发生之后，这段关系该怎么被说明白。
   规则与 address.ts 同源：看的是「读到哪一段了」（时间线事件 id，含该段），
   不是读了多少。

   与 `TimelineEvent.gate` 的关系：gate 拦的是**入口**（关系没走到 70 就不让进
   v1-9 那一段）—— 那一关仍然在，且仍然只在**第一卷**内生效。
   ============================================================ */

import { TIMELINE } from './timeline'

export interface BondStage {
  /** 读到这一段（含）之后，关系才翻篇 */
  from: string
  /** 到那一步时才现身的那份「关系确认」 */
  confirm?: { title: string; body: string }
}

export const BOND_STAGE: Record<string, BondStage> = {
  luna: {
    // 使用者契约缔结于此（v1-9）。入口那条门槛（好感 ≥70）写在 timeline 的 gate 上，
    // 走完由该事件的 lock 锁到 100；这里只管契约之后这段关系该怎么被说明白。
    from: 'v1-9',
    confirm: {
      title: '使用者契约 · 至死不渝的主仆',
      body: '露娜（商会製人工侍从）理论上不可能解放终末。'
        + '是言万心叶先问的「我……可以，坚持到最后吗。」，她答「……真拿你没办法。可以哦。'
        + '因为我，喜欢你这种地方。」—— 这一问一答立下使用者契约，'
        + '让本应用于毁灭的黄金狮子反过来守人。她自己把话说得明白：'
        + '「我会燃烧你的灵魂，奔跑下去——我们，会变成同样的东西哦。」'
        + '「我是个病态的女人。死的时候也要一起哦。」自此她改口唤他「主人」，'
        + '出院那夜唤的是「我的小主人」；而这份关系不再按行为增减 —— 满了就是满了。',
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

/** 到满值之后才给的那份关系确认（没有、或还没到那一步就 null） */
export function confirmOf(charId: string, cur: string | null): { title: string; body: string } | null {
  const st = BOND_STAGE[charId]
  if (!st?.confirm) return null
  return stagePassed(charId, cur) ? st.confirm : null
}
