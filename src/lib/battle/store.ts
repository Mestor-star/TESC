/* ============================================================
   作战记录 · 隐藏存档
   ------------------------------------------------------------
   DB 'zts-battle' v1
     表 records:'id, missionId, at'  —— 每场作战一条（含逐回合底稿 + 生成剧情）
     表 meta:'key'                  —— 体力池 / 逐个角色的任务成长
   这份库不进 world.records、不上剧情页，只在「作战记录」里可读，
   并在后续生成时作为上下文取用 —— 防前后文不搭。
   惰性单例：模块加载不产生任何副作用。
   ============================================================ */

import Dexie from 'dexie'
import type { Table } from 'dexie'

import { TUNING } from './tuning'
import type { BattleRecord, StaminaState } from './types'

export const BATTLE_DB_NAME = 'zts-battle'
export const BATTLE_DB_VERSION = 1

const SP_KEY = 'stamina'
const GROWTH_KEY = 'growth'

interface MetaRow {
  key: string
  value: unknown
}

class BattleDatabase extends Dexie {
  records!: Table<BattleRecord, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super(BATTLE_DB_NAME)
    this.version(BATTLE_DB_VERSION).stores({
      records: 'id, missionId, at',
      meta: 'key',
    })
  }
}

let inst: BattleDatabase | null = null

function db(): BattleDatabase {
  if (!inst) inst = new BattleDatabase()
  return inst
}

/** 本地存储区不可用时（隐私模式等）：一切读写降级为「不存在」，绝不炸掉作战**/
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

/* ---------- 作战记录 ---------- */

export async function listRecords(): Promise<BattleRecord[]> {
  return safe(async () => {
    const rows = await db().records.toArray()
    return rows.sort((a, b) => b.at - a.at)
  }, [])
}

export async function putRecord(rec: BattleRecord): Promise<void> {
  await safe(async () => {
    await db().records.put(rec)
  }, undefined)
}

export async function deleteRecord(id: string): Promise<void> {
  await safe(async () => {
    await db().records.delete(id)
  }, undefined)
}

/* ---------- 体力池（小队共用 · 只在执行任务时消耗） ---------- */

function freshStamina(): StaminaState {
  return { cur: TUNING.spMax, max: TUNING.spMax, chargeAt: 0 }
}

/**
 * 读体力：先按「观测间隔」补回 —— 自上回结算以来每收束一段剧情补 spRegenPerEvent。
 * 补回后的值立即落盘（并把 chargeAt 推到当前），故不会重复回血。
 */
export async function readStamina(eventsDone: number): Promise<StaminaState> {
  const st = await safe(async () => {
    const row = await db().meta.get(SP_KEY)
    return (row?.value as StaminaState | undefined) ?? null
  }, null)
  const base = st ?? freshStamina()
  const gained = Math.max(0, eventsDone - base.chargeAt)
  const cur = Math.min(base.max, base.cur + gained * TUNING.spRegenPerEvent)
  const next: StaminaState = { cur, max: base.max, chargeAt: Math.max(base.chargeAt, eventsDone) }
  if (gained > 0 || !st) await writeStamina(next)
  return next
}

export async function writeStamina(s: StaminaState): Promise<void> {
  await safe(async () => {
    await db().meta.put({ key: SP_KEY, value: s })
  }, undefined)
}

/* ---------- 任务成长（完成任务加数值） ---------- */

export async function readGrowth(): Promise<Record<string, number>> {
  return safe(async () => {
    const row = await db().meta.get(GROWTH_KEY)
    return (row?.value as Record<string, number> | undefined) ?? {}
  }, {})
}

const MAX_GROWTH_PCT = 12

/** 追加成长点（百分数，写隐藏存档；不写进 world 变量） */
export async function addGrowth(patch: Record<string, number>): Promise<Record<string, number>> {
  const cur = await readGrowth()
  for (const id in patch) {
    cur[id] = Math.min(MAX_GROWTH_PCT, (cur[id] ?? 0) + patch[id])
  }
  await safe(async () => {
    await db().meta.put({ key: GROWTH_KEY, value: cur })
  }, undefined)
  return cur
}

export async function resetBattleStore(): Promise<void> {
  await safe(async () => {
    await db().records.clear()
    await db().meta.clear()
  }, undefined)
}
