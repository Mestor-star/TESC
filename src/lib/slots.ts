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
import { RENDEZVOUS_KEY } from './rendezvous'
import { LOOK_KEY } from './look'
import { PLOT_PENDING_KEY } from './plotpending'
import { readGuide, resetGuide, writeGuide } from './guide'
import type { GuideState } from './guide'
/* IndexedDB 'zts-battle'（军需点数 / 小队体力 / 作战记录）的「收回本档初值」。
   这里直引 battle/store 不会成环：它只 import './tuning' 与 './types'，
   而 guide.ts 早就已经引了它（LEVEL_* 那几个常量）—— 依赖图上本模块 =a=> guide =b=> battle/store
   早就存在，再加一条 slots =b=> battle/store 只是把同一条边拉直，既不新增 chunk 也不新增环。 */
import { resetBattleToInitial } from './battle/store'
/* 多标签页并发（见 lib/tablock.ts）：另一页正在玩同一份进度时，这一页是只读的 ——
   存档槽与会话账的写入口都得先过这一道。循环是安全的：tablock 谁都不 import。 */
import { tabWriteBlocked } from './tablock'

export const RUN_KEY = 'zts-terminal:v3'
export const PLOT_KEY = 'zts-plot:v1'
export const TAVERN_KEY = 'zts-tavern:v1'
export const SLOTS_KEY = 'zts-slots:v1'
export const SLOT_COUNT = 8
/** 每条会话日志保留上限（自动/手动快照都裁剪） */
const LOG_CAP = 80

/* ---------- 写盘故障（配额满 / 隐私模式）的**明说**通道 ----------
 *
 * 从前这几处全是 `catch { /* noop *\/ }`：写不进去就写不进去，界面上一个字都没有。
 * 本机量过的那条路是这样丢消息的 —— 5.14M 字符的账上再发一条长消息，
 * `zts-plot:v1` 抛 QuotaExceededError、被静默吃掉；那条消息照常上屏，
 * 刷新之后消失；下一条回执又拿**存储里的旧账**回写，把它彻底盖掉。
 * 自动档同理：边缘上写不进去，槽里留着的仍是上一次成功的那一份。
 *
 * 所以「写失败」不再是一个吞掉的异常，而是一条可订阅的**故障**：
 * 写成的键自己会清掉它，订阅方（剧情推进页顶上那条横幅）据此给出路。
 * 这里只管记账与通知，不 import 任何 UI —— 本模块照旧无 React、可测。
 *
 * ⚠️ 故障按**键**分开记：只留一条最近的在屏上，够用且不吵。
 */
export interface StorageFault {
  /** 写失败的那个 key（`zts-plot:v1` / `zts-slots:v1` …） */
  key: string
  /** 人话理由：配额满 / 隐私模式 / 其它 */
  reason: string
  at: number
}

/* 按**键**分开记：一次配额满往往同时打中会话账与自动档，屏上那条横幅
   要挑最该说的那一条 —— 会话账在前（丢的是刚写的话），自动档在后。 */
const faults = new Map<string, StorageFault>()
const faultListeners = new Set<() => void>()

/** 屏上优先说哪一个：会话正文 > 自动档 > 其余最近的那一个 */
function primary(): StorageFault | null {
  const plot = faults.get(PLOT_KEY)
  if (plot) return plot
  const slots = faults.get(SLOTS_KEY)
  if (slots) return slots
  let last: StorageFault | null = null
  for (const f of faults.values()) last = f
  return last
}

/** 人话理由：配额满与「浏览器不让存」分开说，前者有出路，后者没有 */
function reasonOf(key: string, e: unknown): string {
  const name = e instanceof Error ? e.name : ''
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return `${key} 写不进去：本地存储配额已满`
  }
  return `${key} 写不进去：${e instanceof Error ? e.message : String(e)}`
}

/** 记一次写失败（同一个键只留一条，连报就刷新它的时间戳） */
export function noteStorageFault(key: string, e: unknown): void {
  faults.delete(key)
  faults.set(key, { key, reason: reasonOf(key, e), at: Date.now() })
  for (const fn of faultListeners) fn()
}

/** 写成功了就撤掉**这个键**的故障（其它键的故障不受影响） */
export function clearStorageFault(key: string): void {
  if (!faults.delete(key)) return
  for (const fn of faultListeners) fn()
}

/** 当前要在屏上说的那一条；订阅用同一对 getter/subscribe（useSyncExternalStore 口径） */
export function storageFault(): StorageFault | null {
  return primary()
}

export function subscribeStorageFault(fn: () => void): () => void {
  faultListeners.add(fn)
  return () => { faultListeners.delete(fn) }
}

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

/**
 * 逐角色裁剪会话日志，防配额。
 *
 * 出参用**无原型对象**：这份账的键来自 localStorage 里的原文（也可能是一份外来备份
 * 原样灌进来的），键名叫 `__proto__` 时普通对象的赋值会走 setter 把**原型**改成
 * 那个数组 —— 这一条悄悄消失，整张账的原型还变成 Array（本机 fuzz 复现：ownKeys 少
 * 一个、`Object.getPrototypeOf(out)` 是 Array）。键名是数据，不该改写原型。
 */
function trimLogs(obj: unknown): Record<string, ChatMsg[]> {
  const out: Record<string, ChatMsg[]> = Object.create(null)
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

/**
 * 一格存档的形状兜底（读档的输入边界）。
 *
 * `zts-slots:v1` 是 localStorage 里的一段裸 JSON ——「从备份恢复」会把外来备份里的
 * 这一串**原样**写回来，截断的 / 手改的 / 别的版本写的都可能落在这儿。
 * 从前这里只 slice 不验：slots 里塞进字符串、数字、缺 snapshot 的对象时，
 * SlotGrid 那两行 `slot.snapshot.operatorName` 直接抛
 * `Cannot read properties of undefined (reading 'operatorName')` ——
 * 整个存读档面板白屏（本机 fuzz 复现）。所以逐槽过一遍形状：
 * 认不出的当空格；认得出但缺字段的按空值补齐，**不猜内容**。
 */
function asSlotOf(v: unknown, index: number): SaveSlot | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const snap = o.snapshot
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null
  const s = snap as Record<string, unknown>
  const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null)
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name : `手动存档 · ${index + 1}`,
    savedAt: num(o.savedAt),
    records: num(o.records),
    snapshot: {
      schema: 1,
      operatorName: typeof s.operatorName === 'string' ? s.operatorName : '言万心叶',
      unlocked: s.unlocked === true,
      epDone: (obj(s.epDone) ?? {}) as Record<string, true>,
      cur: typeof s.cur === 'string' ? s.cur : null,
      focusId: typeof s.focusId === 'string' ? s.focusId : null,
      world: (obj(s.world) ?? emptyWorld()) as WorldState,
      plot: (obj(s.plot) ?? {}) as Record<string, ChatMsg[]>,
      tavern: (obj(s.tavern) ?? {}) as Record<string, ChatMsg[]>,
      guide: (obj(s.guide) ?? undefined) as GuideState | undefined,
      savedAt: num(s.savedAt) || num(o.savedAt),
    },
  }
}

function readFile(): SlotsFile {
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (!raw) return { v: 1, slots: Array(SLOT_COUNT).fill(null), autosave: null }
    const p = JSON.parse(raw) as Partial<SlotsFile>
    const slots: (SaveSlot | null)[] = Array.isArray(p.slots)
      ? p.slots.slice(0, SLOT_COUNT).map((v, i) => asSlotOf(v, i))
      : Array(SLOT_COUNT).fill(null)
    while (slots.length < SLOT_COUNT) slots.push(null)
    /* autosave 同样是外来内容：认不出就当没有自动档 —— canContinue() 要读
       a.snapshot.epDone，读档那一路要读 snapshot.world，坏壳交给它们只会抛 */
    return { v: 1, slots, autosave: asSlotOf(p.autosave, 0) }
  } catch {
    return { v: 1, slots: Array(SLOT_COUNT).fill(null), autosave: null }
  }
}

function saveFile(f: SlotsFile): void {
  /* 只读页（另一个标签页在玩）：**不写**。整本回写会把那边的档盖掉 —— 这是本模块
     自己的写入入口，拦在这里比拦在各调用方稳。 */
  if (tabWriteBlocked()) return
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(f))
    /* 这一趟写成了：之前挂着的「自动档写不进去」就不该再在屏上 */
    clearStorageFault(SLOTS_KEY)
  } catch (e) {
    /* 配额 / 隐私模式：不再静默 —— 记一条故障，剧情推进页顶上会明说
       「自动存档写不进去、刷新会退回上一次成功的自动档」并给出路 */
    noteStorageFault(SLOTS_KEY, e)
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

/* ---------- 会话账的「内存真账」来源（配额满时的补档路） ----------
 *
 * 剧情推进页写失败之后，那一条正文只活在它的模块变量里（见 views/Plot.tsx 的
 * unsavedLogs / currentLogs）—— 存储里比屏幕上少一条。自动档若照旧从存储读
 * `zts-plot:v1`，那份真账就永远进不了档：刷新之后退回上一次成功的那一份，
 * 丢掉的那条连自动档里都找不回来。
 *
 * 所以 captureSnapshot 认一个**可覆盖的会话账**：调用方给了就用调用方的
 * （第二参数，显式优先）；否则若 Plot 注册了「内存真账」读取源就用它；
 * 都没有才照旧读存储 —— 既有调用方（首启迁移、读档回写）行为不变。
 *
 * ⚠️ 这里只握一对**函数**，不握 unsavedLogs 本身：账的所有权留在视图那一侧，
 * 本模块照旧无 React、不 import 任何视图（否则 slots ↔ Plot 会绕成环）。
 *
 * 为什么还要 reset：内存真账是**上一轮**的账。读档（applySnapshot）换的是整整一轮运行态，
 * 存储里的 `zts-plot:v1` 被覆写成刚读进来的那一档，而视图那份 unsavedLogs 若还留着，
 * 同一会话里先撞过配额、再去读另一档时，它就会压过刚读进来的档 —— Plot 的 state 初值
 * （useState(currentLogs)）与写失败后的兜底写都读 currentLogs，读到的全是旧账。
 * 所以 applySnapshot 写完存储之后调一次 reset，账本所有权那侧把 unsavedLogs 抹掉，
 * currentLogs() 自然回到读存储。
 */
export interface PlotLogsBridge {
  /** 读当前真账（写失败过就是内存那份，否则读存储） */
  read: () => Record<string, ChatMsg[]>
  /** 作废内存真账（读档 / 重置用）—— 之后 read() 必须回到读存储 */
  reset?: () => void
}

let plotLogsBridge: PlotLogsBridge | null = null

/** 注册「内存真账」的读 / 作废源（传 null 撤销） */
export function setPlotLogsSource(bridge: PlotLogsBridge | null): void {
  plotLogsBridge = bridge
}

/** 作废内存真账：没注册、或注册方没给 reset 都当没有，绝不因此抛 */
function resetPlotLogs(): void {
  try {
    plotLogsBridge?.reset?.()
  } catch {
    /* noop */
  }
}

/** 由当前运行档（含会话日志）组一份快照；sessions.plot 覆盖会话账（默认读存储） */
export function captureSnapshot(
  run: RunStateInput,
  sessions?: { plot?: Record<string, ChatMsg[]> },
): RunSnapshot {
  return {
    schema: 1,
    operatorName: run.operatorName,
    unlocked: run.unlocked,
    epDone: run.epDone,
    cur: run.cur,
    focusId: run.focusId,
    world: run.world,
    plot: sessions?.plot ?? plotLogsBridge?.read() ?? readLogs(PLOT_KEY),
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

/* ---------- 运行态键清单（BUG-01） ----------
 *
 * 读档（applySnapshot）与重置（clearRunStorage）必须清**同一套**东西：两档之间会串味儿的
 * 只有「这一档的运行态」，凡是属于这一档的 localStorage 键都该在两条路上被清掉。
 * 从前两条路各清各的（读档只清 zts-plot-pending、名册/自建群/未读角标一条没动），
 * 于是读档后 cur 已切成 v1-1、侧栏角标还顶着上一档的 3 —— 点进去线程写着「本线程还没有消息」。
 * 清单只在这里写一份，两条路径共用，免得以后再漂。
 *
 * ── 运行态（RUN_STATE_KEYS：读档与重置都清）──
 *   · zts-rendezvous:v1   约会名册（lib/rendezvous.ts 的 RENDEZVOUS_KEY）
 *   · zts-plot-pending:v1 收束栏 / 待战按钮（lib/plotpending.ts），上一次渲染留下的界面状态
 *   · zts-sms-threads:v1  自建群（lib/smsthreads.ts 的 THREADS_KEY）
 *   · zts-sms-unread:v1   未读角标（lib/sms.ts 的 SMS_UNREAD_KEY）
 *   · zts-sms-tasks:v1    电话里「别人托付的事」（lib/smstasks.ts 的 TASKS_KEY）
 *   · zts-look:v1         右栏状态卡的那一句话（lib/look.ts 的 LOOK_KEY）：按人挂、
 *                         由回执的 look 落下来。它记的是「此刻她这个样子」—— 换一档
 *                         就该换一个样子，所以读档与重置一并清（与 rendezvous 同一档）。
 *   · zts-sms-auto:v1     主动来信的节拍账（lib/smsauto.ts 的 AUTO_KEY：上次滚格 /
 *                         每人上次命中）。它与 zts-sms-unread 同类 —— 是**这一轮里**
 *                         被推演出来的账，不是设备偏好也不是档本身：不清就会拿上一档的
 *                         节拍接着滚（来电时间点错乱，还不显形，最难查）。
 *                         清了最坏结果是开档立刻滚一格，那是对的：新的一档就是新的一轮。
 *   这几支没去 import 各自的常量：smsthreads / sms 会经 plot → crosslink 反手 import
 *   本模块的 PLOT_KEY，import 进来就在 slots 这一层绕成一个环，还会把 plot 那一大坨
 *   拖进只读存档的 chunk（Title / SaveDialog 都引本模块）；smsauto 更重，它 import 了
 *   React 的 useProactiveSms 与整个 Terminal。键名字面值以那一行为准，改时两边一起改。
 *
 * ── 刻意不在这份清单里 ──
 *   · zts-slots:v1        存档槽**本体**（读档正是从这儿挑一档；清了等于把档删了）
 *   · zts-terminal:v3 / zts-plot:v1 / zts-tavern:v1
 *                         这三支是「档本身」——读档是**覆写**、重置是**删除**，
 *                         不叫「清运行态」，故各自那一段单列
 *   · zts-guide:v1        梅芙讲到哪儿：读档跟存档走（writeGuide）、重置 resetGuide()，
 *                         有自己的一条路，这里不硬 remove（否则老档没 guide 时会误清进度）
 *   · zts-sms-builtin-groups:v1  内置群的播种标记（设备级：播过就不再播）
 *   · zts-schemes:v1 / zts-active-preset:v1 / zts-builtin-presets:v1 / zts-budget-floor:v1
 *                         接口方案与预设 —— **设备配置**，换档不该把人家的通道配置清掉
 *   · zts-audio:v1 / zts-fx-level / zts-pv-seen
 *                         音量 / 特效档位 / 开场 PV 看过没 —— **设备级偏好**。CLAUDE.md 那条
 *                         明写「重置世界进度」不该把 PV 翻出来再放一遍
 *   · zts-ailog:v1        通联日志（诊断账，不是进度；核对「设置有没有送到后台」用）
 *   · zts-lore-seed-v1    词条播种的一次性迁移标记
 *   · zts-chunk-retry:v1  走的是 sessionStorage（分块自救的账），根本不在这本账上
 *   · IndexedDB（'zts-lore' / 'zts-terminal-store'）不是 localStorage，且
 *     'zts-terminal-store' 的 kv 里住着接口密钥 —— 本模块一个字都不碰
 *
 * ── IndexedDB 'zts-battle' 不在上面这份 localStorage 清单里，走另一条路 ──
 *   库里住着**这一轮**的军需点数 / 小队体力 / 作战记录 / 装备与成长（见 battle/store.ts）。
 *   它不是键、清不掉「removeItem 一下」，所以不登记进 RUN_STATE_KEYS，而是两条路径
 *   各调**同一个函数** `resetBattleToInitial()`（battle/store.ts，初值口径写在那个函数的头注里）：
 *     · 读档：applySnapshot 末尾 await 它 —— 读一份旧档，军需/体力/战报就回到这一档的初值；
 *     · 重置：Terminal 的 hardReset 里 await 它（旧名 resetBattleStore，转手给同一个函数）。
 *   ⚠️ 新增运行态时先问一句：它在 localStorage 吗？不在，就接到 resetBattleToInitial 上，
 *   别只登记键就以为收口了。
 */
const SMS_THREADS_KEY = 'zts-sms-threads:v1'
const SMS_UNREAD_KEY = 'zts-sms-unread:v1'
const SMS_TASKS_KEY = 'zts-sms-tasks:v1'
/** 主动来信节拍（lib/smsauto.ts 的 AUTO_KEY）—— 同上，字面值以那一行为准 */
const SMS_AUTO_KEY = 'zts-sms-auto:v1'
/** 科研树已完成节点（lib/research.ts 的 KEY）—— 研究点本身按来源现算，但「已研成」
 *  是这一档的成果，读档/重置必须一起清；否则下一档会带着上一档的科研加成开局。 */
const RESEARCH_KEY = 'zts-research:v1'

/** 「这一档的运行态」键清单 —— 读档与重置共用（见上）。
 *  ⚠️ 只覆盖 localStorage。IndexedDB 'zts-battle' 走 resetBattleToInitial()，
 *  不在本清单里 —— 但它同样属于「这一轮」，两条路径都得调（见上面那一段注）。 */
export const RUN_STATE_KEYS: readonly string[] = [
  RENDEZVOUS_KEY,
  LOOK_KEY,
  PLOT_PENDING_KEY,
  SMS_THREADS_KEY,
  SMS_UNREAD_KEY,
  SMS_TASKS_KEY,
  SMS_AUTO_KEY,
  RESEARCH_KEY,
]

/** 逐键清；键不在、localStorage 抛（隐私模式 / 配额）都不炸 —— 幂等且容错 */
function clearRunState(): void {
  for (const key of RUN_STATE_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* noop */
    }
  }
}

/**
 * 把快照写回运行档 + 两条会话日志 key（authed 恒 false，加载方再强制过闸门），
 * 并把**这一轮的战斗域隐藏存档**收回本档初值。
 *
 * 异步只为一件事：IndexedDB 'zts-battle'（军需点数 / 小队体力 / 作战记录）清不掉同步。
 * 调用方**必须 await 它，再触发全量重挂载** —— 重挂载后总览立刻读军需与体力，
 * 晚到的重置会让上一档的点数先上屏（与 hardReset 里同一句提醒同源）。
 */
export async function applySnapshot(snapshot: RunSnapshot): Promise<void> {
  /* 只读页读档 = 拿一份档把整本账覆写掉（还顺手清运行态、重置战斗域）——
     另一个标签页正玩着的进度会被这一下整份换掉。拦在最前面，什么都别动。 */
  if (tabWriteBlocked()) return
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
    clearStorageFault(PLOT_KEY)
  } catch (e) {
    /* 读档回写同样可能撞配额：这时候「当前会话」根本没换过去，必须让界面说出来 */
    noteStorageFault(PLOT_KEY, e)
  }
  try {
    localStorage.setItem(TAVERN_KEY, JSON.stringify(trimLogs(snapshot.tavern)))
    clearStorageFault(TAVERN_KEY)
  } catch (e) {
    noteStorageFault(TAVERN_KEY, e)
  }
  /* 三条键都写完了，才轮到作废**内存真账** —— 顺序不能反：先 reset 再写存储，
     写失败时（配额满）存储里还是上一档，而内存那份又已经抹掉，两头都空。
     放在这儿而不是调用方那一侧：读档 = 换一整轮运行态，账的作废与键的覆写是同一件事，
     以后谁再调 applySnapshot（Title / Terminal 四条入口）都自动带上。 */
  resetPlotLogs()
  /* 读档 = 这一轮的运行态整个换掉：与重置共用 RUN_STATE_KEYS（收束栏 / 待战按钮、
     约会名册、自建群、未读角标、短信任务、主动来信节拍）。不跟着搬，否则新档一进来就可能
     顶着上一档那一段的收束栏（段 id 偶尔会撞上），名册上还挂着上一档的空线程、侧栏还亮着
     幻影角标，来信节拍还按上一档的格子往下滚。 */
  clearRunState();
  /* 读档 = 这一轮的战斗域也整个换掉：'zts-battle'（军需点数 / 小队体力 / 作战记录 /
     装具与成长）不在 localStorage 清单里，走 battle/store.ts 的 resetBattleToInitial()
     —— 与「重置」那条路**同一个函数**（初值口径写在那个函数头上：两表清空后各读取
     函数自己的兜底，即 军需点数→0、体力→freshStamina()、records→[]、bag→bagDefault）。
     不清：读一份旧档之后军需点数、体力、上一档的战报仍挂在界面上，作战屏与任务简报
     读到的都是上一轮的数 —— 这是本模块之外最大的串档口。 */
  await resetBattleToInitial();
  // 梅芙接着这一档讲：老档没有 guide 字段时不写，别把当前进度搅了
  writeGuide(snapshot.guide)
}

/**
 * 清除当前运行（重置 / 开新档用）：运行态整份清掉 + 连档一起清，
 * **绝不碰 zts-slots:v1**（存档槽本体）与 IndexedDB 里的接口密钥。
 *
 * 口径与读档（applySnapshot）**共用同一份 RUN_STATE_KEYS** —— 读档是「换一整轮运行态」、
 * 重置是「连档一起清」，两边该清的那一撮必须是同一撮，见上一段清单。
 *
 * 逐条都在这一趟里的理由：
 *  · `zts-plot-pending:v1`（收束栏 / 待战按钮）是「上一次渲染留下的界面状态」，指着的是
 *    **上一档**的段 id；不跟着清，新档一进来就会读回一条过期记录（好在 Plot 那一侧还有
 *    `epDone`/`focusEv` 校验兜着，但清干净才是对的）。
 *  · `zts-rendezvous:v1`（约会名册）的「一场」是挂在那本会话日志（`zts-tavern:v1`）上的
 *    元数据 —— 底下的账被清了、元数据还留着，名册上就挂着一条**点进去一个字都没有**的
 *    空线程，还带着上一轮的 `beats`（约会 CG 的节拍）。
 *  · `zts-sms-threads:v1` / `zts-sms-unread:v1` / `zts-sms-tasks:v1` 同属这一档的会话面：
 *    自建群、未读角标、短信任务都是「这一轮跟谁说过话」的账，账本换了它们不换就是串档。
 * CLAUDE.md 那条「新增持久化状态必须…在 slots.ts 的存档读写里登记」说的正是这里。
 */
export function clearRunStorage(): void {
  /* 只读页重置 = 把另一个标签页正玩着的那一档整份删掉。同上，拦在最前面。 */
  if (tabWriteBlocked()) return
  /* ① 运行态：与读档共用同一份 RUN_STATE_KEYS（口径统一，见上面那一段清单） */
  clearRunState()
  /* ② 档本身：重置是**连档一起清**（读档那一路只是覆写这三支，不清） */
  for (const key of [RUN_KEY, PLOT_KEY, TAVERN_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* noop */
    }
  }
  /* 档连存储都清了，内存那份真账更不能留着 —— 否则下一次 currentLogs() 还端出上一档的账，
     而下一次写成功又把它整本回写进刚清空的 zts-plot:v1。与读档同一条路。 */
  resetPlotLogs()
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
