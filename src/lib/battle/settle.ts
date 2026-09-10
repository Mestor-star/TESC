/* ============================================================
   作战结算 · 一处收口
   ------------------------------------------------------------
   任务板与剧情交战两条入口共用这一段：只有胜仗落库，
   成长 / 羁绊 / 体力 / 装具 / 补给 / 军需点一并写回隐藏存档。
   败与撤不写记录、不推进剧情（执行委员长口径）。
   ============================================================ */

import { TUNING } from './tuning'
import { squadIdsFrom } from './derive'
import { addCoin, addGear, addGrowth, putRecord, writeBag, writeEquip, writeStamina } from './store'
import type { BattleRecord, StaminaState } from './types'

export interface SettleArgs {
  rec: BattleRecord
  spLeft: number
  /** 收场时每人的装配（战斗中可换） */
  equip: Record<string, string>
  /** 战斗结束时剩下的补给 */
  bag: Record<string, number>
  stamina: StaminaState
  /** 羁绊加成（由终端上下文提供） */
  bumpBond: (id: string, n: number) => void
}

/** 归档一场胜仗，并把一切写回。返回给 toast 用的一句话。 */
export async function settleWin(a: SettleArgs): Promise<string> {
  const { rec, spLeft, equip, bag, stamina, bumpBond } = a
  await putRecord(rec)
  const patch: Record<string, number> = {}
  for (const id of rec.squad) patch[id] = TUNING.growthPerWin
  await addGrowth(patch)
  const mvpId = squadIdsFrom([rec.mvp])[0]
  for (const id of rec.squad) {
    bumpBond(id, TUNING.bondPerWin + (id === mvpId ? TUNING.bondMvp : 0))
  }
  await writeStamina({ ...stamina, cur: Math.max(0, spLeft) })
  await writeEquip(equip)
  await writeBag(bag)
  for (const g of rec.loot) await addGear(g)
  await addCoin(rec.coin)
  return `${rec.no}「${rec.title}」· ${rec.rounds} 手 / ${rec.ticks} 拍 · 出力最重 ${rec.mvp}`
    + ` · 军需点 +${rec.coin}`
}

/** 撤出 / 未打过：只把消耗与装配写回，不落档 */
export async function settleExit(
  spLeft: number, equip: Record<string, string>, stamina: StaminaState,
): Promise<void> {
  await writeStamina({ ...stamina, cur: Math.max(0, spLeft) })
  await writeEquip(equip)
}
