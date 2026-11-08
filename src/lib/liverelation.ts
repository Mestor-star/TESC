/* ============================================================
   此刻（本档）——世界书条目的动态那一行（lib/liverelation.ts）
   ------------------------------------------------------------
   角色条目里写的是**底账**：这个人是谁、认得谁、什么关系。
   那些话在一局里不会变，所以可以写死在 dossiers.ts 里。

   会变的是这一档此刻的样子：羁绊到哪一档、称呼改没改、
   这段关系比初见偏移了多少、有没有被事件锁定。
   这一行不写进种子，而是在注入那一刻现算 —— 同一份世界书，
   换一档存档就读出另一行，不必重播种子。

   只认人物档里的人（PERSON_IDS）；文风、图鉴、事件那些条目
   查不到名字，这里返回 undefined，注入层就不加这一行。
   ============================================================ */

import { addressOf } from '../data/address'
import { genderOf, personOf, PERSON_IDS } from '../data/castmeta'
import type { WorldState } from '../data/types'
import { bondName } from './format'
import { furthestDone } from './operator'

/** 词条名 → 「此刻（本档）：…」；不是人名、或查不到，返回 undefined */
export type LiveLore = (label: string) => string | undefined

export function liveLore(
  world: WorldState,
  epDone: Record<string, true>,
  bondNow: (id: string) => number,
): LiveLore {
  const byName = new Map<string, string>()
  for (const id of PERSON_IDS) {
    const p = personOf(id)
    if (!p || p.kind === 'operator') continue
    byName.set(p.name, id)
  }
  const done = furthestDone(epDone)

  return (label: string) => {
    const raw = (label || '').trim()
    if (!raw) return undefined

    /* 词条名有时带称号（「恋兔光 · 恋兔队队长」），所以先精确、再包容 */
    let id = byName.get(raw)
    if (!id) {
      for (const [name, pid] of byName) {
        if (raw.includes(name) || name.includes(raw)) { id = pid; break }
      }
    }
    if (!id) return undefined

    if (!world.met?.[id]) return '此刻（本档）：尚未遇见。'

    const bond = Math.round(bondNow(id))
    const stage = bondName(bond, { gender: genderOf(id) })
    const drift = Math.round(world.offset[id] ?? 0)
    const call = addressOf(id, bond, done)
    const parts = [
      `羁绊 ${bond} · ${stage}`,
      `行为偏移 ${drift >= 0 ? '+' : ''}${drift}`,
      call ? `称「${call}」` : '称呼未定',
    ]
    const locked = world.locked?.[id]
    if (typeof locked === 'number') parts.push(`已锁定在 ${Math.round(locked)}`)
    return '此刻（本档）：' + parts.join('｜') + '。'
  }
}
