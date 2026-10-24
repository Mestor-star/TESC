/* ============================================================
   成长系统 · 逻辑（等级 / 技能天赋 / 世界的色彩）
   ------------------------------------------------------------
   数据在 `data/growth.ts`，这一支只管三件事：
     ① 存档 —— `zts-growth:v1`（localStorage，沿用 zts- 前缀）
     ② 状态的算法 —— 已解锁到第几级、下一级要什么、加成的汇总
     ③ 花钱 —— 终末点数在 IndexedDB（store.ts 那一格 coin），这里只调它的门

   两半的分工（照 research.ts 那一套）：
     · **同步**这一半（growthBonusOf / skillUpsOf / colorsOf …）只读
       localStorage 与静态表 —— derive 造人时要的是同步的一份，不能 await；
     · **异步**这一半（等级与购买）要读 IndexedDB 的点数，全是 async。

   ⚠️ **模块加载零副作用**：localStorage 只在第一次真读时碰，读不到就当空档
     （没有成长 = 一点都不加）。这条是 derive → 本模块 → 战斗数值那条链的前提：
     mech / balance 在 Node 里加载整条 import 链时，第一步就不许抛。

   ⚠️ **另一支的存档**：剧情进度（哪些事件段读完了）住在 `zts-terminal:v3` 的
     epDone 里，那是 slots.ts 的 RUN_KEY。这里**只读不写**，键名字面值以
     slots.ts 那一行为准（改时两边一起改）—— 不 import slots 是为了不在
     这条链上拖着它那一整包（Title / SaveDialog 也引它）。
   ============================================================ */

import {
  COLORS, COLOR_MAX_LEVEL, COLOR_DROP_CHANCE, SKILL_LINES, TALENT_LINES,
  NO_BONUS, baseStageOf, colorCostOfLevel,
} from '../data/growth'
import type { ColorDef, GrowthBonus, GrowthLevel, GrowthLine } from '../data/growth'

export type { ColorDef, GrowthBonus, GrowthLevel, GrowthLine } from '../data/growth'
export { COLORS, COLOR_MAX_LEVEL, baseStageOf, colorCostOfLevel }

/** 存档键（沿用 zts- 前缀；读档 / 重置时由 slots 的 RUN_STATE_KEYS 一并清） */
export const GROWTH_STORAGE_KEY = 'zts-growth:v1'
/** 剧情进度所在的键（slots.ts 的 RUN_KEY）—— 只读 */
const RUN_KEY = 'zts-terminal:v3'

export type GrowthKind = 'skill' | 'talent'

/**
 * 存档形状。
 *   skill / talent : 线键 → 已买到第几级（**买的**那一份，不含剧情白送的那几级）
 *   color          : 色彩 id → 级
 *   drops          : 已经结算过的作战记录 id（掉落不重掷的凭据）
 */
export interface GrowthSave {
  ver: 1
  skill: Record<string, number>
  talent: Record<string, number>
  color: Record<string, number>
  drops: Record<string, true>
}

function emptySave(): GrowthSave {
  return { ver: 1, skill: {}, talent: {}, color: {}, drops: {} }
}

/** 把外来 / 旧档的形状收成能用的（数字才认，负数与小数一律夹回来） */
function saneNumberMap(src: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!src || typeof src !== 'object') return out
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (!Number.isFinite(n) || n <= 0) continue
    out[k] = Math.floor(n)
  }
  return out
}

function sanitize(raw: unknown): GrowthSave {
  if (!raw || typeof raw !== 'object') return emptySave()
  const o = raw as Record<string, unknown>
  const drops: Record<string, true> = {}
  if (o.drops && typeof o.drops === 'object') {
    for (const k of Object.keys(o.drops as Record<string, unknown>)) drops[k] = true
  }
  return {
    ver: 1,
    skill: saneNumberMap(o.skill),
    talent: saneNumberMap(o.talent),
    color: saneNumberMap(o.color),
    drops,
  }
}

/** 缓存：改一次写一次，读到的永远是同一份（localStorage 不可用时也照旧在内存里跑） */
let CACHE: GrowthSave | null = null

export function readGrowthSave(): GrowthSave {
  if (CACHE) return CACHE
  let raw: unknown = null
  try {
    const s = globalThis.localStorage?.getItem(GROWTH_STORAGE_KEY)
    if (s) raw = JSON.parse(s)
  } catch {
    /* 隐私模式 / 脏数据：按空档算 */
  }
  CACHE = sanitize(raw)
  return CACHE
}

function writeGrowthSave(s: GrowthSave): void {
  CACHE = s
  try {
    globalThis.localStorage?.setItem(GROWTH_STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* 写不进去就只留内存那一份 —— 这一次会话里的成长仍然算数 */
  }
}

/**
 * 只给复核（scripts/mech）用：**直接摆一份存档**，不经过 localStorage。
 * 有它才验得动「买过一级之后 combatantOf 的输出真的变了」——
 * 那条链是同步的（derive 造人），没有别的口子能把它喂进去。
 */
export function _useGrowthSave(s: GrowthSave | null): void {
  CACHE = s ? sanitize(s) : null
}

/** 只给复核用：把缓存丢掉，下次重读 localStorage */
export function _resetGrowthCache(): void {
  CACHE = null
}

/** 这一轮读到哪了（事件段 id → true）。读不到就按「一段都没读」算。 */
export function storyDoneOf(): Record<string, true> {
  try {
    const s = globalThis.localStorage?.getItem(RUN_KEY)
    if (!s) return {}
    const o = JSON.parse(s) as { epDone?: Record<string, true> }
    return o?.epDone && typeof o.epDone === 'object' ? o.epDone : {}
  } catch {
    return {}
  }
}

/** 那一段剧情到了没有 */
export function storyReached(eventId: string, epDone: Record<string, true> = storyDoneOf()): boolean {
  return !!epDone[eventId]
}

/* ============================================================
   一、等级（= 原著 Stage + 已买次数）
   ------------------------------------------------------------
   ⚠️ 等级**存在 IndexedDB**（store.ts 的 meta.level）而不是这个 localStorage 档里，
   因为柜台（views/Research.tsx）卖的是同一件事，它读的就是那一格 —— 两处各存一份
   必然有一天对不上。所以这里只是「换一层说法 + 换一条读法」：
     显示 = baseStageOf(id) + 已买次数
     加成 = LEVEL_STEP_PCT × 已买次数（基线 Stage 本身不给数值）
   ============================================================ */

/** 已买次数（不含基线 Stage） */
export async function levelUpCountOf(id: string): Promise<number> {
  const { readLevels } = await import('./battle/store')
  const lv = await readLevels()
  return lv[id] ?? 0
}

/** 这个人的等级 —— 显示成「Stage N」的那个 N（基线 Stage + 已买次数） */
export async function levelOf(id: string): Promise<number> {
  return baseStageOf(id) + (await levelUpCountOf(id))
}

/** 再升一级要多少终末点数（曲线只有一条：store 的 levelCostOf） */
export async function levelCostOf(id: string): Promise<number> {
  const store = await import('./battle/store')
  return store.levelCostOf(await levelUpCountOf(id))
}

/**
 * 花终末点数把 Stage 推进 1 级。
 * 点数不够原样退回（ok: false），不扣钱也不加倍 —— 与柜台同一条口径。
 */
export async function levelUpWithPoints(id: string): Promise<{
  ok: boolean
  coin: number
  /** 推完之后显示的那个 Stage */
  level: number
  cost: number
}> {
  const store = await import('./battle/store')
  const counts = await store.readLevels()
  const cost = store.levelCostOf(counts[id] ?? 0)
  const res = await store.buyLevel(id, cost)
  return {
    ok: res.ok,
    coin: res.coin,
    level: baseStageOf(id) + (res.levels[id] ?? 0),
    cost,
  }
}

/* ============================================================
   二、技能 / 天赋
   ============================================================ */

/** 一个人的技能线 / 天赋线（静态表里没有的人 = 空表，不抛） */
export function linesOf(id: string, kind: GrowthKind): GrowthLine[] {
  const t = kind === 'skill' ? SKILL_LINES : TALENT_LINES
  return t[id] ?? []
}

/** 一条线到了第几级（剧情白送的 + 点数买的，取**连续**的那一段） */
function reachedLevelOf(line: GrowthLine, bought: number, epDone: Record<string, true>): number {
  let lv = 0
  for (const l of line.levels) {
    if (l.story && storyReached(l.story, epDone)) { lv = l.lv; continue }
    if (bought >= l.lv) { lv = l.lv; continue }
    break
  }
  return lv
}

/** 一条线的当下状态（给角色页直接渲染） */
export interface UpState {
  key: string
  name: string
  kind: GrowthKind
  note: string
  /** 已经到第几级（0 = 一级都还没解锁） */
  lv: number
  /** 这条线一共几级 */
  max: number
  /** 下一级那一格（null = 已经满了） */
  next: GrowthLevel | null
  /** 下一级是不是「剧情到了就白送」 */
  free: boolean
  /** 下一级的解锁条件**此刻**满足没有（free 那一档看剧情到没到；要买的那一档这里恒 false） */
  ready: boolean
  /** 下一级要的剧情节点（free 时才有值） */
  story?: string
  /** 下一级要花多少点数（free 时是 undefined） */
  cost?: number
  /** 这一条线当下的总加成 */
  bonus: GrowthBonus
}

function bonusOfLevels(line: GrowthLine, lv: number): GrowthBonus {
  const out: GrowthBonus = { ...NO_BONUS }
  for (const l of line.levels) {
    if (l.lv > lv) break
    for (const k of Object.keys(out) as Array<keyof GrowthBonus>) {
      if (typeof l.bonus?.[k] === 'number') out[k] = l.bonus[k] as number
    }
  }
  return out
}

function upStateOfLine(
  line: GrowthLine, bought: number, epDone: Record<string, true>,
): UpState {
  const lv = reachedLevelOf(line, bought, epDone)
  const next = line.levels.find((l) => l.lv === lv + 1) ?? null
  return {
    key: line.key,
    name: line.name,
    kind: line.kind,
    note: line.note,
    lv,
    max: line.levels.length,
    next,
    free: !!next?.story,
    // 剧情那一档：节点到了才算「条件满足」；要买的那一档归钱包管（这里恒 false）
    ready: !!(next?.story && storyReached(next.story, epDone)),
    story: next?.story,
    cost: next?.story ? undefined : next?.cost,
    bonus: bonusOfLevels(line, lv),
  }
}

/** 技能线状态 */
export function skillUpsOf(id: string, epDone: Record<string, true> = storyDoneOf()): UpState[] {
  const bought = readGrowthSave().skill
  return linesOf(id, 'skill').map((l) => upStateOfLine(l, bought[l.key] ?? 0, epDone))
}

/** 天赋线状态 */
export function talentUpsOf(id: string, epDone: Record<string, true> = storyDoneOf()): UpState[] {
  const bought = readGrowthSave().talent
  return linesOf(id, 'talent').map((l) => upStateOfLine(l, bought[l.key] ?? 0, epDone))
}

/** 能不能解锁下一级：剧情到了 = 免费；否则看点数够不够 */
export interface UnlockState {
  ok: boolean
  /** 剧情已达成，这一次不花钱 */
  free: boolean
  /** 要花多少（free 时是 0） */
  cost: number
  /** 为什么不行（ok 时为空串） */
  reason: string
  /** 这一条线此刻的状态（没有这一条线时是 null） */
  state: UpState | null
}

/**
 * 「能不能解锁下一级」的**纯函数**那一半（同步；剧情达没达成、钱包有多少都由外面传）。
 * mech §43 拿它验「第 1 级剧情白送、第 2 级只能花点数」——
 * 那条规矩不该藏在读钱包的那一层后面（不然复核还得先造一个 IndexedDB）。
 */
export function unlockStateOf(
  id: string, kind: GrowthKind, key: string,
  epDone: Record<string, true> = {}, coin = 0,
): UnlockState {
  const line = linesOf(id, kind).find((l) => l.key === key)
  if (!line) return { ok: false, free: false, cost: 0, reason: '没有这一条线', state: null }
  const bought = (kind === 'skill' ? readGrowthSave().skill : readGrowthSave().talent)[key] ?? 0
  const state = upStateOfLine(line, bought, epDone)
  if (!state.next) return { ok: false, free: false, cost: 0, reason: '已经到顶了', state }
  /* 剧情那一档：**节点没到就真的解不开**（不是「等钱」也不是「先给了再说」）——
     于是「第 1 级只能靠剧情」这条规矩是硬的：钱包再鼓也买不到它。 */
  if (state.free) {
    if (!state.ready) {
      return { ok: false, free: true, cost: 0, reason: '剧情还没推进到 ' + (state.story ?? ''), state }
    }
    return { ok: true, free: true, cost: 0, reason: '', state }
  }
  const need = state.next.cost ?? 0
  if (coin < need) return { ok: false, free: false, cost: need, reason: '终末点数不够', state }
  return { ok: true, free: false, cost: need, reason: '', state }
}

/** 同上，但自己去看这一轮的剧情进度与钱包（角色页点「解锁」时走这一个） */
export async function canUnlock(
  id: string, kind: GrowthKind, key: string,
  opts: { epDone?: Record<string, true>; coin?: number } = {},
): Promise<UnlockState> {
  const epDone = opts.epDone ?? storyDoneOf()
  const coin = opts.coin ?? (await (await import('./battle/store')).readCoin())
  return unlockStateOf(id, kind, key, epDone, coin)
}

/**
 * 花点数解锁下一级。
 * **剧情已达成的那一级不许在这里买** —— 那是白送的，收钱就等于让玩家
 * 为「读过剧情」再付一次（所以 free 的那一级直接返回 ok: false）。
 */
export async function unlockWithPoints(
  id: string, kind: GrowthKind, key: string,
): Promise<{ ok: boolean; coin: number; reason: string; state: UpState | null }> {
  const store = await import('./battle/store')
  const st = await canUnlock(id, kind, key)
  if (!st.ok) {
    return { ok: false, coin: await store.readCoin(), reason: st.reason, state: st.state }
  }
  if (st.free) {
    return { ok: false, coin: await store.readCoin(), reason: '这一级是剧情解锁的，不用买', state: st.state }
  }
  /* 走到这儿 st.ok 已经保证「不是剧情那一档」，所以下面扣钱那一段只可能是买 */
  const coin = await store.addCoin(-st.cost)
  const save = readGrowthSave()
  const map = { ...(kind === 'skill' ? save.skill : save.talent) }
  map[key] = Math.max(map[key] ?? 0, (st.state?.lv ?? 0) + 1)
  writeGrowthSave({ ...save, [kind]: map })
  const line = linesOf(id, kind).find((l) => l.key === key)!
  return { ok: true, coin, reason: '', state: upStateOfLine(line, map[key] ?? 0, storyDoneOf()) }
}

/* ============================================================
   三、世界的色彩
   ------------------------------------------------------------
   全队共享；1→7 级；下一级的价走 data 里那张表（主人的 4n 公式）。
   ============================================================ */

/** 一支色彩此刻几级 */
export function colorLevelOf(id: string): number {
  return Math.min(COLOR_MAX_LEVEL, readGrowthSave().color[id] ?? 0)
}

/** 再升一级要多少（已经满级 → null） */
export function colorCostOf(id: string): number | null {
  const lv = colorLevelOf(id)
  if (lv >= COLOR_MAX_LEVEL) return null
  return colorCostOfLevel(lv + 1)
}

export interface ColorState extends ColorDef {
  lv: number
  max: number
  /** 下一级的价（满级 = null） */
  nextCost: number | null
  /** 到这一级为止给的那一份（总量，不是增量） */
  bonus: Partial<GrowthBonus>
}

function colorStateOf(c: ColorDef): ColorState {
  const lv = colorLevelOf(c.id)
  return {
    ...c,
    lv,
    max: COLOR_MAX_LEVEL,
    nextCost: lv >= COLOR_MAX_LEVEL ? null : colorCostOfLevel(lv + 1),
    bonus: lv > 0 ? { [c.field]: c.per * lv } : {},
  }
}

/** 六支色彩的全表（角色页直接渲染这一份） */
export function colorsOf(): ColorState[] {
  return COLORS.map(colorStateOf)
}

/** 花终末点数买一级色彩 */
export async function buyColor(id: string): Promise<{
  ok: boolean; coin: number; lv: number; cost: number; reason: string
}> {
  const def = COLORS.find((c) => c.id === id)
  const store = await import('./battle/store')
  if (!def) return { ok: false, coin: await store.readCoin(), lv: 0, cost: 0, reason: '没有这一支色彩' }
  const lv = colorLevelOf(id)
  if (lv >= COLOR_MAX_LEVEL) {
    return { ok: false, coin: await store.readCoin(), lv, cost: 0, reason: '已经到 7 级了' }
  }
  const cost = colorCostOfLevel(lv + 1)
  const have = await store.readCoin()
  if (have < cost) return { ok: false, coin: have, lv, cost, reason: '终末点数不够' }
  const coin = await store.addCoin(-cost)
  const save = readGrowthSave()
  save.color[id] = lv + 1
  writeGrowthSave(save)
  return { ok: true, coin, lv: lv + 1, cost, reason: '' }
}

/** FNV-1a：掉落与剧情点都用它（确定性，不掺随机） */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 具名首领的掉落结算。
 * ------------------------------------------------------------
 * **幂等**：每一场作战记录只结算一次（drops 里记着它的 id），而且是
 * **确定性**的 —— 掉不掉、掉哪一支，全由那条记录的 id 哈希出来，
 * 所以刷新一百次结果都一样（不是「读一次掷一次」那种会漂的账）。
 *
 * 谁是「具名首领」：作战记录上带着 bossId（bosses.ts 那一栏），且这一场胜了。
 * 战绩之外的杂兵、现推的观测体都不掉 —— 掉落只认有名有姓的那一位。
 *
 * 调用点：Terminal 挂载时那一下（见 terminal/Terminal.tsx）。
 */
export async function awardColorDrops(): Promise<{ gained: number; colors: string[] }> {
  const { listRecords } = await import('./battle/store')
  const recs = await listRecords()
  const save = readGrowthSave()
  let gained = 0
  const got: string[] = []
  for (const r of recs) {
    if (r.outcome !== '胜' || !r.bossId) continue
    if (save.drops[r.id]) continue
    save.drops[r.id] = true
    const h = hash32(r.id)
    if (h % 1000 >= Math.round(COLOR_DROP_CHANCE * 1000)) continue
    const c = COLORS[(h >>> 12) % COLORS.length]!
    const lv = save.color[c.id] ?? 0
    if (lv >= COLOR_MAX_LEVEL) continue
    save.color[c.id] = lv + 1
    gained += 1
    got.push(c.name)
  }
  // 即使这一趟没掉，也要把「这些记录结算过了」写下去 —— 否则下次重掷
  writeGrowthSave(save)
  return { gained, colors: got }
}

/* ============================================================
   四、汇总 —— derive 造人时读的那一份
   ------------------------------------------------------------
   = 本人技能线 / 天赋线的加成 ＋ 全队共享的色彩加成。
   **全零时它就是 NO_BONUS 那八个 0** —— derive 那边逐字段看「是不是 0」，
   是 0 就原样返回它手里的对象 / 数值（见 derive 的 growthAxes / growthHp）。
   ============================================================ */

/** 某人的加成总量（同步：只读 localStorage 与静态表） */
export function growthBonusOf(id: string, epDone: Record<string, true> = storyDoneOf()): GrowthBonus {
  const out: GrowthBonus = { ...NO_BONUS }
  const add = (b: Partial<GrowthBonus>) => {
    for (const k of Object.keys(out) as Array<keyof GrowthBonus>) {
      const v = b[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] += v
    }
  }
  const save = readGrowthSave()
  for (const kind of ['skill', 'talent'] as const) {
    for (const line of linesOf(id, kind)) {
      const bought = (kind === 'skill' ? save.skill : save.talent)[line.key] ?? 0
      add(bonusOfLevels(line, reachedLevelOf(line, bought, epDone)))
    }
  }
  for (const c of COLORS) {
    const lv = colorLevelOf(c.id)
    if (lv > 0) add({ [c.field]: c.per * lv })
  }
  return out
}

/** 一份加成是不是全零（derive 用来决定「原样返回」的那把尺） */
export function isNoBonus(b: GrowthBonus): boolean {
  for (const k of Object.keys(b) as Array<keyof GrowthBonus>) {
    if (b[k] !== 0) return false
  }
  return true
}

/**
 * 一份加成的人话（角色页 / 复核断言读它）。
 * 只念非零的那几条 —— 没有的就是没有，不印「+0%」。
 */
export function bonusLinesOf(b: GrowthBonus): string[] {
  const out: string[] = []
  const pct = (v: number) => (v > 0 ? '+' : '') + Math.round(v * 1000) / 10 + '%'
  if (b.power) out.push('技能倍率 ' + pct(b.power))
  if (b.atk) out.push('破坏力 ' + pct(b.atk))
  if (b.hp) out.push('生命上限 ' + pct(b.hp))
  if (b.res) out.push('物理抗性 ' + pct(b.res))
  if (b.aff) out.push('反现实亲和 ' + pct(b.aff))
  if (b.will) out.push('意志力 ' + pct(b.will))
  if (b.evade) out.push('闪避 ' + pct(b.evade))
  if (b.tempo) out.push('节拍上限 +' + b.tempo)
  return out
}
