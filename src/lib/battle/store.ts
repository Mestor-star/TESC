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

/**
 * 旧档补齐：作战记录是跨版本留下来的东西，早先写下的条目可能缺后加的字段
 * （outcome / loot / turns 一类）。这里一律补成可安全渲染的形状，
 * 免得一条老记录把整个任务简报板掀翻。
 */
function fixRecord(r: BattleRecord): BattleRecord {
  return {
    ...r,
    no: r.no ?? '—',
    title: r.title ?? '（未命名作战）',
    place: r.place ?? '未知',
    outcome: r.outcome ?? '胜',
    rounds: r.rounds ?? 0,
    ticks: r.ticks ?? 0,
    squad: r.squad ?? [],
    mvp: r.mvp ?? '—',
    digest: r.digest ?? '',
    turns: r.turns ?? [],
    narrative: r.narrative ?? '',
    narrativeBy: r.narrativeBy ?? '模板',
    loot: r.loot ?? [],
    coin: r.coin ?? 0,
  }
}

export async function listRecords(): Promise<BattleRecord[]> {
  return safe(async () => {
    const rows = await db().records.toArray()
    return rows.map(fixRecord).sort((a, b) => b.at - a.at)
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

/* ---------- 终末等级（用终末点数换的常驻强化） ----------
   先说清楚这个名字：这里的「终末等级」是**终端给在册者记的常驻强化评级**，
   与剧情里的终末 Stage（那个人背负的终末到了第几级、危险度多高）**毫无关系**。
   一个是可以花的点数堆出来的训练记录，一个是命里带来的东西。
   两者只是碰巧都叫「终末」，界面上必须分开写，不许混。

   口径：与任务成长走同一条路 —— 每级给本人加 LEVEL_STEP_PCT 个百分点，
   五轴按 (1 + 成长/100) 放大，生命按 growthHpWeight 那一份跟着涨（见 derive）。
   区别只有一条：任务成长封顶在 12%，买来的等级**不封顶**。
   价格按级别指数上涨，所以第一级便宜、后面越推越贵。 */
const LEVEL_KEY = 'level'

/** 每一级给本人加的百分比 */
export const LEVEL_STEP_PCT = 5
/** 第 0 级（→ 第 1 级）的价格 */
export const LEVEL_BASE_COST = 80
/** 每一级在上一级价格上乘的倍率 —— 就是这条曲线的「指数」 */
export const LEVEL_RATE = 1.6

/** 从 n 级升到 n+1 级要多少终末点数（n 从 0 起） */
export function levelCostOf(n: number): number {
  return Math.round(LEVEL_BASE_COST * Math.pow(LEVEL_RATE, Math.max(0, n)))
}

export async function readLevels(): Promise<Record<string, number>> {
  return safe(async () => {
    const row = await db().meta.get(LEVEL_KEY)
    return (row?.value as Record<string, number> | undefined) ?? {}
  }, {})
}

/**
 * 买一级。点数不够原样退回（ok: false），不扣钱也不加倍。
 * 只加不减：等级是这个人在终端上留下的记录，没有「洗掉」这一说。
 */
export async function buyLevel(
  id: string, cost: number,
): Promise<{ ok: boolean; coin: number; levels: Record<string, number> }> {
  const coin = await readCoin()
  const levels = await readLevels()
  if (coin < cost) return { ok: false, coin, levels }
  const next = { ...levels, [id]: (levels[id] ?? 0) + 1 }
  const left = coin - cost
  await safe(async () => {
    await db().meta.put({ key: COIN_KEY, value: left })
    await db().meta.put({ key: LEVEL_KEY, value: next })
  }, undefined)
  return { ok: true, coin: left, levels: next }
}

/**
 * 战斗真正吃的那一份成长 = 任务成长（封顶 12%） + 买来的终末等级（不封顶）。
 * 引擎只认这一个数（combatantOf 的 growthPct），所以两者在这里合流，
 * 别的任何地方都不许自己去加。
 */
export function effectiveGrowth(
  growth: Record<string, number>, levels: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...growth }
  for (const id in levels) {
    out[id] = (out[id] ?? 0) + LEVEL_STEP_PCT * (levels[id] ?? 0)
  }
  return out
}

/* ---------- 军需：终末点数 / 道具补给池 / 反现实辅助装备 ---------- */

const COIN_KEY = 'coin'
const BAG_KEY = 'bag'
const GEAR_KEY = 'gear'
const EQUIP_KEY = 'equip'
const MAIN_CLAIM_KEY = 'mainclaimed'

/** 终末点数（胜利结算累积；商店消费） */
export async function readCoin(): Promise<number> {
  return safe(async () => {
    const row = await db().meta.get(COIN_KEY)
    return typeof row?.value === 'number' ? row.value : 0
  }, 0)
}

export async function addCoin(delta: number): Promise<number> {
  const cur = await readCoin()
  const next = Math.max(0, cur + delta)
  await safe(async () => {
    await db().meta.put({ key: COIN_KEY, value: next })
  }, undefined)
  return next
}

/** 已有的装具库存（id → 件数）；击败敌人可搜刮到重复件 */
export async function readGearBag(): Promise<Record<string, number>> {
  return safe(async () => {
    const row = await db().meta.get(GEAR_KEY)
    return (row?.value as Record<string, number> | undefined) ?? {}
  }, {})
}

export async function addGear(id: string, n = 1): Promise<Record<string, number>> {
  const bag = await readGearBag()
  bag[id] = (bag[id] ?? 0) + n
  await safe(async () => {
    await db().meta.put({ key: GEAR_KEY, value: bag })
  }, undefined)
  return bag
}

/** 每人当前装配的装具（角色 id → 装具 id） */
export async function readEquip(): Promise<Record<string, string>> {
  return safe(async () => {
    const row = await db().meta.get(EQUIP_KEY)
    return (row?.value as Record<string, string> | undefined) ?? {}
  }, {})
}

export async function writeEquip(map: Record<string, string>): Promise<void> {
  await safe(async () => {
    await db().meta.put({ key: EQUIP_KEY, value: map })
  }, undefined)
}

/** 剧情战斗已领取归档的事件 id —— 打赢了还要来任务简报这里点一下才算收尾 */
export async function readMainClaimed(): Promise<Record<string, true>> {
  return safe(async () => {
    const row = await db().meta.get(MAIN_CLAIM_KEY)
    return (row?.value as Record<string, true> | undefined) ?? {}
  }, {})
}

export async function writeMainClaimed(map: Record<string, true>): Promise<void> {
  await safe(async () => {
    await db().meta.put({ key: MAIN_CLAIM_KEY, value: map })
  }, undefined)
}

/** 道具补给池（id → 个数） */
export async function readBag(): Promise<Record<string, number>> {
  return safe(async () => {
    const row = await db().meta.get(BAG_KEY)
    return (row?.value as Record<string, number> | undefined) ?? { ...TUNING.bagDefault }
  }, { ...TUNING.bagDefault })
}

export async function writeBag(bag: Record<string, number>): Promise<void> {
  await safe(async () => {
    await db().meta.put({ key: BAG_KEY, value: bag })
  }, undefined)
}

/** 补给采购（剩点数与库存一并返回） */
export async function buyItem(id: string, price: number): Promise<{ coin: number; bag: Record<string, number> }> {
  const coin = await readCoin()
  if (coin < price) return { coin, bag: await readBag() }
  const bag = await readBag()
  bag[id] = (bag[id] ?? 0) + 1
  await addCoin(-price)
  await writeBag(bag)
  return { coin: coin - price, bag }
}

/** 装具采购 */
export async function buyGear(
  id: string, price: number, max = Number.POSITIVE_INFINITY,
): Promise<{ coin: number; bag: Record<string, number>; full?: boolean }> {
  const coin = await readCoin()
  const bag = await readGearBag()
  // 限购：研究所产出的特殊装备是「拿贡献点换的配给」，兑完一件就没有第二件
  if ((bag[id] ?? 0) >= max) return { coin, bag, full: true }
  if (coin < price) return { coin, bag }
  bag[id] = (bag[id] ?? 0) + 1
  await addCoin(-price)
  await safe(async () => {
    await db().meta.put({ key: GEAR_KEY, value: bag })
  }, undefined)
  return { coin: coin - price, bag }
}

/**
 * 清空作战域隐藏存档 —— 「重置世界进度 / 开新档」的收口。
 * ------------------------------------------------------------
 * 这一整库都是**当前这一轮**的东西：作战记录、终末点数、小队体力、
 * 装具库存与装配、任务成长、已领取归档。clearRunStorage() 只管 localStorage
 * 那几个 key，碰不到这里，所以重置路径必须显式调用本函数，
 * 否则出现「进度已归零，点数还在、体力不回满、旧战报还挂着」。
 * 手动存档（zts-slots:v1）不在此列，一律保留。
 */
export async function resetBattleStore(): Promise<void> {
  await safe(async () => {
    await db().records.clear()
    await db().meta.clear()
  }, undefined)
}
