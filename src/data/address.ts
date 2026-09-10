/* ============================================================
   对主角的称呼 —— 同一个人，不同时期叫他的方式不一样
   ------------------------------------------------------------
   最典型的是露娜：签订使用者契约（v3-9「星鲸」——她以己命为他缝伤
   输血）之前，她一直喊的是「言万同学」；契约之后才改口「小主人」。
   （原文锚：chars.ts 露娜条目「她管心叶叫『言万同学』」；
     minds.ts m3-6 卷 3 末尾『黄金之兔 · 告别』已作「……对不起，小主人……」）

   所以一条称呼规则同时看两件事：
   · min  —— 羁绊值到没到
   · from —— 剧情读到哪一段了（时间线事件 id，含该段）
   两者都给就都要满足；后写的规则覆盖先写的。
   ============================================================ */

import { TIMELINE } from './timeline'

export interface AddressRule {
  /** 羁绊达到该值起适用；缺省 = 不限 */
  min?: number
  /** 读到这一段时间线事件（含）之后才适用；缺省 = 不限 */
  from?: string
  /** 该阶段他/她怎么称呼言万心叶 */
  form: string
}

export const ADDRESS: Record<string, AddressRule[]> = {
  luna: [
    { form: '言万同学' },
    // v3-9「星鲸」：她以己命为他缝伤输血，缔结使用者契约 —— 自此改口
    { from: 'v3-9', form: '小主人' },
  ],
}

const IDX = (id: string) => TIMELINE.findIndex((e) => e.id === id)

/**
 * 此刻该角色怎么称呼言万心叶。
 * @param bond 当前羁绊（0..100）
 * @param done 已收束事件的最高时间线序号（-1 = 一节都还没读）
 * @returns 称呼；没有规定则 null（交给导演按原文语气自行拿捏）
 */
export function addressOf(charId: string, bond: number, done: number): string | null {
  const rules = ADDRESS[charId]
  if (!rules || !rules.length) return null
  let hit: string | null = null
  for (const r of rules) {
    if (r.min !== undefined && bond < r.min) continue
    if (r.from !== undefined) {
      const i = IDX(r.from)
      if (i >= 0 && done < i) continue
    }
    hit = r.form
  }
  return hit
}
