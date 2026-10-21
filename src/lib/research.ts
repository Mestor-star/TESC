/* ============================================================
   科研 · 研究点与全队加成（研究室那一套的唯一出处）
   ------------------------------------------------------------
   三件事：
     ① 研究点从哪儿来 —— 集中成下面那四个常数，界面与引擎都不许另算；
     ② 存档 —— `zts-research:v1`，形状 `{ points, done }`（沿用 zts- 前缀）；
     ③ 对外只读的一格 `researchBonus()` —— 战斗（derive 的我方那两支）与面板
        （Archive 的五轴读数）读的是**同一份**，不各算一遍。

   ⚠️ 研究点不是「打一场加一次」的累加账。它是**按来源重算**的：
        points = max(0, 已挣到的 − 已投进去的)
     已挣到的从两个地方数得出来（推过的段数 / 作战记录），所以同步是幂等的 ——
     同一次读数跑两遍不会变成两倍，删掉一条作战记录也不会凭空多出一笔。
     于是存档里那一格 `points` 是**缓存**，不是权威：权威永远是「进度 + 记录 − done」。

   ⚠️ 模块加载**零副作用**（mech / balance 在 Node 里直接加载整条 import 链）：
     localStorage 只在第一次真读时碰，读不到就按 0 算（没有科研 = 一点都不加）。
     Dexie（作战记录）也只在那条 async 同步路径里**动态** import。
   ============================================================ */

import { useSyncExternalStore } from 'react'
import { RESEARCH } from '../data/research'
import type { ResearchNode } from '../data/research'

/* ============================================================
   一、研究点从哪儿来（只有这一处）
   ------------------------------------------------------------
   口径：**观测本身换钱**。委员会是观测机构，换给研究室的不是战利品，是读到的段数；
   作战记录只值一点点（那是重复劳动）；真正值钱的是打下有名有姓的那一位 ——
   他的档案能补进目录，一本书换一本书。

   量级（照这张树满共 156 点来配）：一段主线 3 点，推完全部 57 段 = 171 点 ——
   也就是说**只读剧情也能把树研完**，但要读到最后；打任务与打首领是提前一点。
   这个坡度是有意的：科研是长线，不是一次战斗的结算奖励。
   ============================================================ */

/** 主线事件收束：每收一段给多少 */
export const RP_PER_EVENT = 3
/** 任务完成（胜）：底子 */
export const RP_PER_MISSION = 3
/** 任务完成（胜）：每一级危险度再加多少（危险度 6 的任务 = 3 + 6 = 9 点） */
export const RP_PER_STAGE = 1
/** 击破具名首领：每一位给多少（按 bossId 去重 —— 同一位只算一次） */
export const RP_PER_BOSS = 12

/** 存档键（沿用 zts- 前缀） */
export const RESEARCH_STORAGE_KEY = 'zts-research:v1'

/** 存档形状。旧档没有这一格 = 空档，一切从 0 起算。 */
export interface ResearchSave {
  /** 此刻还剩下的研究点 */
  points: number
  /** 已研成的节点（nodeId → true） */
  done: Record<string, true>
}

/** 全队加成（比例）。字段与 `data/research.ts` 的 `ResearchEffect` 一一对应。 */
export interface ResearchBonus {
  atk: number
  hp: number
  resPhysical: number
  aff: number
}

const ZERO: ResearchBonus = { atk: 0, hp: 0, resPhysical: 0, aff: 0 }

/* ============================================================
   二、存档（惰性 · 可跨重挂载 · 存储不可用时降级为「空档」）
   ============================================================ */

let state: ResearchSave | null = null
const subs = new Set<() => void>()

function blank(): ResearchSave {
  return { points: 0, done: {} }
}

/** 读得到 localStorage 就用它，读不到（Node / 隐私模式）就当没有这一格 */
function storage(): Storage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    return ls ?? null
  } catch {
    return null
  }
}

function load(): ResearchSave {
  if (state) return state
  let next = blank()
  try {
    const raw = storage()?.getItem(RESEARCH_STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<ResearchSave> | null
      const done: Record<string, true> = {}
      // 只认这张表里还有的节点：改过树之后，旧档里那些已经不在的 id 不算数
      for (const n of RESEARCH) if (p?.done?.[n.id]) done[n.id] = true
      const pts = Math.floor(Number(p?.points))
      next = { points: Number.isFinite(pts) && pts > 0 ? pts : 0, done }
    }
  } catch {
    next = blank()
  }
  state = next
  return state
}

function persist(s: ResearchSave): void {
  try {
    storage()?.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* 存不进去就只活在这一趟里 —— 不许因为写不进存档把人卡在研究室 */
  }
}

function commit(next: ResearchSave): void {
  state = next
  bonusCache = null
  persist(next)
  for (const fn of subs) fn()
}

function subscribe(fn: () => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

/* ============================================================
   三、读（对外只读）
   ============================================================ */

/** 此刻的存档（模块内那一份的唯一快照；改它一律走 invest / sync） */
export function researchState(): ResearchSave {
  return load()
}

/** 已投进去的点数（已研成节点的成本之和） */
export function researchSpent(): number {
  const s = load()
  let sum = 0
  for (const n of RESEARCH) if (s.done[n.id]) sum += n.cost
  return sum
}

/** 这张树全研完要多少点（界面抬头那一格用） */
export const RESEARCH_TOTAL_COST = RESEARCH.reduce((n, x) => n + x.cost, 0)

/** 已研成几个 */
export function researchDoneCount(): number {
  const s = load()
  return RESEARCH.filter((n) => s.done[n.id]).length
}

let bonusCache: { key: string; v: ResearchBonus } | null = null

/**
 * **全队加成** —— 战斗与面板共用的那一格。
 *
 * 空树时返回同一枚全 0 的常量（`ZERO`），于是「没有科研」与改动前**逐字节相同**：
 * 调用方一律写 `v * (1 + bonus)` 之前先看它是不是 0，或者在 0 时原样返回。
 * 返回值**不许改**（同一份会被多处读到）。
 */
export function researchBonus(): ResearchBonus {
  const s = load()
  const key = Object.keys(s.done).sort().join(',')
  if (bonusCache && bonusCache.key === key) return bonusCache.v
  let atk = 0
  let hp = 0
  let resPhysical = 0
  let aff = 0
  for (const n of RESEARCH) {
    if (!s.done[n.id]) continue
    const e = n.effect
    atk += e.atk ?? 0
    hp += e.hp ?? 0
    resPhysical += e.resPhysical ?? 0
    aff += e.aff ?? 0
  }
  const v: ResearchBonus = key ? { atk, hp, resPhysical, aff } : ZERO
  bonusCache = { key, v }
  return v
}

/** 这个节点研成了没有 */
export function researchOwned(id: string): boolean {
  return !!load().done[id]
}

/** 前置都研成了没有（第一层恒 true） */
export function researchOpen(node: ResearchNode): boolean {
  const s = load()
  return !node.require || !!s.done[node.require]
}

/** 此刻能不能投：前置已研、自己没研、点数够 */
export function researchReady(node: ResearchNode): boolean {
  const s = load()
  if (s.done[node.id]) return false
  if (node.require && !s.done[node.require]) return false
  return s.points >= node.cost
}

/** 这个节点的状态（界面按它上三种色） */
export function researchStatusOf(node: ResearchNode): 'done' | 'ready' | 'locked' {
  if (researchOwned(node.id)) return 'done'
  if (researchOpen(node) && load().points >= node.cost) return 'ready'
  return 'locked'
}

/* ============================================================
   四、写（两条路：投一个节点 / 按来源同步一遍）
   ============================================================ */

/** 投入研究点。前置没研 / 点不够 / 已研成 → 不动，返回原因。 */
export function investResearch(id: string): { ok: boolean; node?: ResearchNode; reason?: string } {
  const node = RESEARCH.find((n) => n.id === id)
  if (!node) return { ok: false, reason: '没有这一项' }
  const s = load()
  if (s.done[id]) return { ok: false, node, reason: '已经研成了' }
  if (node.require && !s.done[node.require]) {
    const prev = RESEARCH.find((n) => n.id === node.require)
    return { ok: false, node, reason: `要先研成「${prev?.name ?? node.require}」` }
  }
  if (s.points < node.cost) return { ok: false, node, reason: '研究点不够' }
  commit({ points: s.points - node.cost, done: { ...s.done, [id]: true } })
  return { ok: true, node }
}

/**
 * 按来源重算一遍研究点（幂等）。
 *
 * `eventsDone` = 已收束的主线段数（Terminal 的 `epDone` 的键数）。
 * 作战记录从 Dexie 现读（动态 import —— 静态引进来会把 Dexie 挂到 derive 那条链上，
 * 而 mech / balance 是在 Node 里直接加载那条链的）。
 *
 * 读不到记录时**只按段数算**，不是「清空」：宁可少算，不把人攒的抹掉。
 * 返回这一次净变化（界面拿它决定要不要说一句话）。
 */
export async function syncResearch(eventsDone: number): Promise<number> {
  const s = load()
  const before = s.points
  let earned = Math.max(0, Math.floor(eventsDone)) * RP_PER_EVENT
  try {
    const { listRecords } = await import('./battle/store')
    const recs = await listRecords()
    const bosses = new Set<string>()
    for (const r of recs) {
      if (r.outcome !== '胜') continue
      earned += RP_PER_MISSION + Math.max(0, r.stage) * RP_PER_STAGE
      if (r.bossId) bosses.add(r.bossId)
    }
    earned += bosses.size * RP_PER_BOSS
  } catch {
    /* 记录读不到：只算段数（见上） */
  }
  const next = Math.max(0, earned - researchSpent())
  if (next !== s.points) commit({ points: next, done: s.done })
  return next - before
}

/* ============================================================
   五、给 React 的那一枚
   ============================================================ */

/** 存档的原样快照（引用稳定：只在真改动时换一份，useSyncExternalStore 认它） */
export function useResearch(): ResearchSave {
  return useSyncExternalStore(subscribe, researchState, researchState)
}
