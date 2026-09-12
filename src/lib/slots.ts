/**
 * 存档槽（8 手动 + 1 自动）。
 *
 * 设计约束（见 P7 计划）：
 *  - 独立新 key `zts-slots:v1`，不改动 `zts-terminal:v3` 的运行档语义；
 *  - 手动槽 / 自动档均存完整 RunSnapshot（运行档 + 剧情/短信会话日志），
 *    日志每角色限量（.slice(-MAX)）防 localStorage 配额；
 *  - applySnapshot 把快照写回三个 key，由调用方触发全量重挂载，
 *    让 provider 重新从存储读取（本模块保持无 React、可测）。
 */
import type { ChatMsg, WorldState } from '../data/types'
import { readGuide, resetGuide, writeGuide } from './guide'
import type { GuideState } from './guide'

export const RUN_KEY = 'zts-terminal:v3'
export const PLOT_KEY = 'zts-plot:v1'
export const TAVERN_KEY = 'zts-tavern:v1'
export const SLOTS_KEY = 'zts-slots:v1'
export const SLOT_COUNT = 8
/** 每条会话日志保留上限（自动/手动快照都裁剪） */
const LOG_CAP = 80

/** 运行档中需要入快照的部分（由 TerminalProvider 的 saved 提供） */
export interface RunStateInput {
  operatorName: string
  unlocked: boolean
  epDone: Record<string, true>
  cur: string | null
  /** 钉住的观测点 id；null = 跟随剧情（见 Terminal 的 focusRegion） */
  focusId: string | null
  world: WorldState
}

export interface RunSnapshot extends RunStateInput {
  schema: 1
  plot: Record<string, ChatMsg[]>
  tavern: Record<string, ChatMsg[]>
  /**
   * 梅芙讲到哪儿了 —— 这一档自己的进度，**跟着存档走**。
   * 新档里它是空的，所以每一份新存档都会从头触发一次引导；
   * 读到哪一档，就接着那一档讲到哪里（老档没有这一项，读到则不动当前进度）。
   */
  guide?: GuideState
  savedAt: number
}

export interface SaveSlot {
  name: string
  savedAt: number
  /** 保存时的已收束事件数 */
  records: number
  snapshot: RunSnapshot
}

export interface SlotsFile {
  v: 1
  slots: (SaveSlot | null)[]
  autosave: SaveSlot | null
}

function emptyWorld(): WorldState {
  /* 只在这儿兜一个空壳（真正的空档由 Terminal 的 emptyWorld 建）；
     私密那一支的几本账一并备齐：intim（私密档案）/ attire（贴身衣物）/
     acts（次数账）/ rel（关系档位）—— 每个都按「没有就是空表」读。 */
  return {
    offset: {}, flags: {}, met: {}, ends: {}, own: [], records: [],
    intim: {}, attire: {}, acts: {}, rel: {},
  }
}

/** 逐角色裁剪会话日志，防配额 */
function trimLogs(obj: unknown): Record<string, ChatMsg[]> {
  const out: Record<string, ChatMsg[]> = {}
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = (v as ChatMsg[]).slice(-LOG_CAP)
    else if (v && typeof v === 'object') out[k] = Object.values(v as Record<string, ChatMsg>).slice(-LOG_CAP)
  }
  return out
}

function readLogs(key: string): Record<string, ChatMsg[]> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    return trimLogs(JSON.parse(raw))
  } catch {
    return {}
  }
}

function readFile(): SlotsFile {
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (!raw) return { v: 1, slots: Array(SLOT_COUNT).fill(null), autosave: null }
    const p = JSON.parse(raw) as Partial<SlotsFile>
    const slots: (SaveSlot | null)[] = Array.isArray(p.slots)
      ? p.slots.slice(0, SLOT_COUNT)
      : Array(SLOT_COUNT).fill(null)
    while (slots.length < SLOT_COUNT) slots.push(null)
    return { v: 1, slots, autosave: p.autosave ?? null }
  } catch {
    return { v: 1, slots: Array(SLOT_COUNT).fill(null), autosave: null }
  }
}

function saveFile(f: SlotsFile): void {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(f))
  } catch {
    /* 配额/隐私模式静默 */
  }
}

export function readSlotsList(): (SaveSlot | null)[] {
  return readFile().slots
}

export function readAutosave(): SaveSlot | null {
  return readFile().autosave
}

export function readSlot(index: number): SaveSlot | null {
  const f = readFile()
  return f.slots[index] ?? null
}

/** 当前运行档是否存在实质进度（zts-terminal:v3 有已读段或指针） */
export function hasRunProgress(): boolean {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    if (!raw) return false
    const p = JSON.parse(raw) as { epDone?: unknown; cur?: unknown }
    if (!p || typeof p !== 'object') return false
    if (typeof p.cur === 'string' && p.cur) return true
    if (p.epDone && typeof p.epDone === 'object') return Object.keys(p.epDone).length > 0
    return false
  } catch {
    return false
  }
}

/** 标题「行动继续」可用的判定：运行档有进度，或自动档里有历史 */
export function canContinue(): boolean {
  if (hasRunProgress()) return true
  const a = readAutosave()
  return !!a && Object.keys(a.snapshot.epDone).length > 0
}

/** 由当前运行档（含会话日志）组一份快照 */
export function captureSnapshot(run: RunStateInput): RunSnapshot {
  return {
    schema: 1,
    operatorName: run.operatorName,
    unlocked: run.unlocked,
    epDone: run.epDone,
    cur: run.cur,
    focusId: run.focusId,
    world: run.world,
    plot: readLogs(PLOT_KEY),
    tavern: readLogs(TAVERN_KEY),
    // 引导进度一并入档：这一档存的是「梅芙讲到哪儿了」，读档时原样放回去
    guide: readGuide(),
    savedAt: Date.now(),
  }
}

function slotFrom(snapshot: RunSnapshot, name: string): SaveSlot {
  return {
    name,
    savedAt: snapshot.savedAt,
    records: Object.keys(snapshot.epDone).length,
    snapshot,
  }
}

export function writeSlot(index: number, name: string, snapshot: RunSnapshot): SaveSlot | null {
  if (index < 0 || index >= SLOT_COUNT) return null
  const f = readFile()
  const slot = slotFrom(snapshot, name.trim() || `手动存档 · ${index + 1}`)
  f.slots[index] = slot
  saveFile(f)
  return slot
}

export function writeAutosave(snapshot: RunSnapshot): SaveSlot {
  const f = readFile()
  f.autosave = slotFrom(snapshot, '自动存档')
  saveFile(f)
  return f.autosave
}

/** 把快照写回运行档 + 两条会话日志 key（authed 恒 false，加载方再强制过闸门） */
export function applySnapshot(snapshot: RunSnapshot): void {
  try {
    localStorage.setItem(
      RUN_KEY,
      JSON.stringify({
        authed: false,
        unlocked: snapshot.unlocked,
        epDone: snapshot.epDone,
        cur: snapshot.cur,
        operatorName: snapshot.operatorName,
        focusId: snapshot.focusId,
        world: snapshot.world,
      }),
    )
  } catch {
    /* noop */
  }
  try {
    localStorage.setItem(PLOT_KEY, JSON.stringify(trimLogs(snapshot.plot)))
  } catch {
    /* noop */
  }
  try {
    localStorage.setItem(TAVERN_KEY, JSON.stringify(trimLogs(snapshot.tavern)))
  } catch {
    /* noop */
  }
  // 梅芙接着这一档讲：老档没有 guide 字段时不写，别把当前进度搅了
  writeGuide(snapshot.guide)
}

/** 清除当前运行（重置 / 开新档用）：清运行档、会话日志与引导进度，绝不碰 zts-slots:v1 */
export function clearRunStorage(): void {
  for (const key of [RUN_KEY, PLOT_KEY, TAVERN_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* noop */
    }
  }
  // 新的一档就是新的一轮：连同梅芙讲到哪儿一起清掉，引导从头再来
  resetGuide()
}

let migrated = false

/**
 * 首启迁移（幂等）：尚无槽文件、但运行档里已有旧进度时，
 * 把当前进度留一份到 slots[0]「旧档留档」并同步为自动档。
 * 以槽文件是否存在为幂等键；migrated 再兜一层会话内防重。
 */
export function ensureMigration(): void {
  if (migrated) return
  migrated = true
  try {
    if (localStorage.getItem(SLOTS_KEY)) return
    const raw = localStorage.getItem(RUN_KEY)
    if (!raw) return
    const p = JSON.parse(raw) as Partial<RunStateInput>
    if (!p || typeof p !== 'object') return
    const epDone = p.epDone && typeof p.epDone === 'object' ? (p.epDone as Record<string, true>) : {}
    const cur = typeof p.cur === 'string' ? p.cur : null
    if (Object.keys(epDone).length === 0 && !cur) return
    const snapshot = captureSnapshot({
      operatorName: typeof p.operatorName === 'string' ? p.operatorName : '言万心叶',
      unlocked: p.unlocked === true,
      epDone,
      cur,
      focusId: typeof p.focusId === 'string' ? p.focusId : 'gcn',
      world: p.world && typeof p.world === 'object' ? (p.world as WorldState) : emptyWorld(),
    })
    const f: SlotsFile = { v: 1, slots: Array(SLOT_COUNT).fill(null), autosave: null }
    f.slots[0] = slotFrom(snapshot, '旧档留档')
    f.autosave = slotFrom(snapshot, '自动存档')
    saveFile(f)
  } catch {
    /* noop */
  }
}

/** epoch ms → 「M月D日 HH:MM」档位时间 */
export function fmtSlotTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
