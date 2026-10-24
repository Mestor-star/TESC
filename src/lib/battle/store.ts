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

   2026-09-15 主人定的两条：
     · **第一档 1000，之后指数**：LEVEL_BASE_COST 是这条曲线的起点，LEVEL_RATE 是
       每一级在上一级上乘的倍率。底价原本 80，随整支货币 ×12.5 抬到 1000
       （收入与军需价格同步放大，见 tuning 的 coin 与 gear 的「价位」）——
       所以这条曲线买起来的快慢与从前一样，只是数字大了。
     · **每级 +10%**：原本 5%，主人抬的。第 10 级就是 +100%。

   2026-09-16 主人再收一刀：「升级太简单了 —— 让升级需要的点数变多」。
   ------------------------------------------------------------
   当时的手感：**一场中期主线（S5，3750 点）直接换 2 级 = 全属性 +20%**，
   后期一场能换 3 级。收的是**曲线**：
     · 底价 1000 → 3000（第一级不再是一两场就能换的）
     · 倍率 1.6 → 1.85（第 4 级起明显咬人，堆满一个人变成长期目标）
   两者都是乘法，所以抬底价是整条曲线平移、抬倍率是越往上越陡。
   价格按级别指数上涨，所以第一级便宜、后面越推越贵 —— 这是有意的。

   同日稍后主人又拍了一刀在**另一个地方**：「敌人给的点数也降低」——
   那一刀落在 tuning 的 coinPerStage / coinMainlineBase（收入 ÷2.33），
   军需价一个没降。两处一起看才是最终手感：**中期主线一场 1575 点，
   第一级 3000 = 打两场**。改任何一头之前，先把另一头的数也读一遍。 */
const LEVEL_KEY = 'level'

/* ------------------------------------------------------------
   2026-10 · 主人：**「等级按原著的 stage 做」**
   ------------------------------------------------------------
   这一格存的还是「买过几次」，但含义换了名字：
     · 显示 = 该角色的**原著 Stage**（data/growth.ts 的 baseStageOf）
              ＋ 这一格里记的次数。买一级 = 把那个人的 Stage 推进 1。
       ——所以人物卡上写的是「Stage 5」，不是「等级 3」。
     · 数值 = LEVEL_STEP_PCT × 次数（**基线 Stage 本身一分都不加**）。
       基线是档案上那条终末潜力的读数，是那个人命里带来的东西，不是强化。
       这条就是「零解锁时战斗数值逐字节等于改动前」的来路（mech §43 钉着）。
     · 曲线 = 还是下面 levelCostOf 那一条 —— 柜台与角色页卖的是同一件事，
       两条曲线必然有一天对不上，所以等级价全仓只此一处。

   存档兼容：这一格**没有搬家**（还是 IndexedDB 的 meta.level、还是「次数」），
   旧档的 0..N 原样读进来 —— 进度一格不丢，只是显示从「等级 N」变成
   「基线 Stage + N」。老档里不可能有别的形状，但脏数据（负的 / 小数 /
   字符串 / null）一律在 migrateLevels 里夹回来，绝不让它把界面算崩。
   ------------------------------------------------------------ */

/** 每一级给本人加的百分比（2026-09-15 主人从 5 抬到 10） */
export const LEVEL_STEP_PCT = 10
/** 第 0 级（→ 第 1 级）的价格 —— 整支货币 ×12.5 之后从 80 抬到 1000，2026-09-16 再抬到 3000 */
export const LEVEL_BASE_COST = 3000
/**
 * 曲线的「指数」基准 —— **2026-09-21 起它不再是整条曲线的倍率**，只作为
 * 「当年那条纯指数曲线」的存档值与文案基准（军需处那段引导文案读的就是它）。
 * 真实价格一律走下面的 levelCostOf()：前三级线性、之后按 LEVEL_TAIL_RATE 指数。
 * 保留这个名字与这个数，是因为 mech 与引导文案都钉着它（见 scripts/mech/run.ts
 * 的「主人定的那条曲线就是这几笔」一条）；改这里的数等于同时改两条守卫。
 */
export const LEVEL_RATE = 1.85
/**
 * 前几级走**线性**：第 0→1 级 LEVEL_BASE_COST，之后每级加 LEVEL_LINEAR_STEP。
 * 这一段是「前期便宜」——旧版纯指数曲线在第三级就跳到 10268（≈6.5 场中期主线），
 * 新手把前两级买完就被挡住了；线性段把 1→2、2→3 压在 3600 / 4200。
 */
export const LEVEL_LINEAR_LEVELS = 3
export const LEVEL_LINEAR_STEP = 600
/**
 * 第 LEVEL_LINEAR_LEVELS 级起改走指数，倍率比旧版的 1.85 更陡（2.3）。
 * 这一段是「后期陡」——第 8 级以后每一级都是一次长期目标，
 * 「再升一级」与「买一件装具 + 一批补给」之间必须真的二选一。
 *
 * 前后对照（逐级，括注旧版 3000×1.85 的指数；两列都由脚本现算，不是估的）：
 *   0→1  3000（3000）     1→2  3600（5550）      2→3  4200（10268）
 *   3→4  9660（18995）    4→5  22218（35141）    5→6  51101（65010）
 *   6→7  117533（120268） 7→8  270326（222497）  8→9  621751（411619）
 *   9→10 1430027（761495） 10→11 3289061（1408765）
 * 累计：到第 3 级 10800（旧 18818，便宜 43%）；到第 5 级 42678（旧 72954，便宜 42%）；
 * 到第 6 级 93779（旧 137964，68%）；到第 8 级 481638（旧 480729，就此拉平）；
 * 到第 9 级 1103389（旧 892348，+24%）；到第 10 级 2533416（旧 1653843，+53%）。
 * 也就是说**前中期省下来的钱，全在第 8 级之后还回去** —— 这正是主人要的那条台阶。
 * 单级对价也落在这一步上：第 3→4 级 9660 ≈ 最贵那件装具（9375），第 4→5 级 22218 ≈ 两件半，
 * 于是「再升一级」与「换一件装 + 备一批药」真的是同一笔钱在挑 —— 这就是要的那个选择。
 */
export const LEVEL_TAIL_RATE = 2.3

/**
 * 从 n 级升到 n+1 级要多少终末点数（n 从 0 起）。
 * 分段：前 LEVEL_LINEAR_LEVELS 级线性（便宜、可预期），之后指数（陡）。
 * 两段的接缝落在第 LEVEL_LINEAR_LEVELS - 1 级那一格的价上，所以曲线连续、没有断崖。
 */
export function levelCostOf(n: number): number {
  const k = Math.max(0, Math.floor(n))
  if (k < LEVEL_LINEAR_LEVELS) return LEVEL_BASE_COST + k * LEVEL_LINEAR_STEP
  const seam = LEVEL_BASE_COST + (LEVEL_LINEAR_LEVELS - 1) * LEVEL_LINEAR_STEP
  return Math.round(seam * Math.pow(LEVEL_TAIL_RATE, k - (LEVEL_LINEAR_LEVELS - 1)))
}

/**
 * 旧档 / 脏数据的迁移（**纯函数**，mech §43 直接拿它验「老档不崩、进度不丢」）。
 * ------------------------------------------------------------
 * 这一格从 2026-09 起就是「id → 买过几次」，这一次换的只是**说法**，
 * 所以旧档不需要换算：读进来是 3，推进次数就是 3，进度一格不丢。
 * 能收的形状：
 *   · 正常档：`{ hikari: 3, luna: 1 }`
 *   · 字符串数字（某次手改过的档）：`'2'` → 2
 *   · 包了一层的（更早的试验形状）：`{ lv: 2 }` / `{ n: 2 }` / `{ level: 2 }` → 2
 * 收不下的（负数、NaN、null、对象里没有数）→ **丢掉的那一格按 0 算**，
 * 不抛、不写回、不许把整张表带崩。
 */
export function migrateLevels(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  // 数组不是一张「id → 次数」的表（`[1,2]` 会读成 {0:1, 1:2}）——整格丢掉
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    let n = NaN
    if (typeof v === 'number') n = v
    else if (typeof v === 'string') n = Number(v)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      for (const k of ['lv', 'level', 'n', 'value']) {
        const c = o[k]
        if (typeof c === 'number') { n = c; break }
        if (typeof c === 'string' && Number.isFinite(Number(c))) { n = Number(c); break }
      }
    }
    if (!Number.isFinite(n) || n <= 0) continue
    out[id] = Math.floor(n)
  }
  return out
}

export async function readLevels(): Promise<Record<string, number>> {
  return safe(async () => {
    const row = await db().meta.get(LEVEL_KEY)
    return migrateLevels(row?.value)
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
 * 把作战域隐藏存档收回到**本档初值** —— 这一套初值逻辑的唯一实现。
 * ------------------------------------------------------------
 * 这一整库都是**当前这一轮**的东西：作战记录、终末点数、小队体力、
 * 装具库存与装配、任务成长、已领取归档。
 *
 * 「初值」不是「另写一份默认值」，而是**两张表清空后各读取函数自己的兜底**：
 *   · records  → `listRecords()` 返回 []（任务简报板 / 作战记录空着）
 *   · coin     → `readCoin()` 返回 0（军需点数归零）
 *   · stamina  → `readStamina()` 空表时走 `freshStamina()`（体力回满、chargeAt 归 0）
 *   · bag      → `readBag()` 返回 TUNING.bagDefault 的副本（补给池回初始配给）
 *   · growth / level / equip / gear / mainclaimed → 各自的默认答案（{} / {} / {} / {} / {}）
 * 所以「清空」与「回到初值」在这里是同一件事，只是**必须两表都清**。
 *
 * 两条路径共用本函数（口径统一，别再造第二份）：
 *   · 重置 / 开新档 → Terminal 的 hardReset（`resetBattleStore` 这个旧名就是本函数）
 *   · 读档 / applySnapshot → slots.ts 里直接 await 它，见那边的 RUN_STATE_KEYS 注
 * 手动存档（zts-slots:v1）不在此列，一律保留。
 */
export async function resetBattleToInitial(): Promise<void> {
  await safe(async () => {
    await db().records.clear()
    await db().meta.clear()
  }, undefined)
}

/**
 * 旧名（重置路径的既有调用点）—— 转手给 `resetBattleToInitial()`，
 * 同一个函数、同一套初值，读档那一路也吃这一份。
 */
export async function resetBattleStore(): Promise<void> {
  await resetBattleToInitial()
}
