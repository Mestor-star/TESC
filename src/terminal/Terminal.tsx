import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RegionReading, Toast, ToastKind, BondSnap, WorldState, OwnEndEntry, WorldRecord, RecordMode, FlagValue } from '../data/types'
import { castOf } from '../lib/cast'
import { REGIONS } from '../data/regions'
import { TIMELINE, unlockEventId, readingIndexOf, firstMainId, isIntroGroup } from '../data/timeline'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { BOND_FULL, defaultBondOf, personOf, PERSON_IDS } from '../data/castmeta'
import { bondWithStage } from '../data/bondstage'
import { clamp } from '../lib/format'
import { opFull } from '../lib/operator'
import { ensureSeeded } from '../lib/lorestore'
import { ensureBuiltinPresets } from '../lib/builtin-presets'
import { requestRemount } from '../lib/remount'
import { sfx } from '../lib/audio'
import { resetBattleStore } from '../lib/battle/store'
import {
  applySnapshot,
  captureSnapshot,
  clearRunStorage,
  ensureMigration,
  hasRunProgress,
  readAutosave,
  readSlot,
  RUN_KEY,
  writeAutosave,
  writeSlot,
} from '../lib/slots'

export type ViewId = 'dashboard' | 'plot' | 'saga' | 'lore' | 'arms' | 'archive' | 'missions' | 'codex' | 'tavern' | 'settings'

/**
 * 需完成「欢迎来到，终末停滞委员会」事件才能解锁的视图。
 * 角色档案亦在其列：名册与羁绊是入学之后的凭据，先读剧情才准调阅。
 */
export const LOCKED_VIEWS: ViewId[] = ['arms', 'archive', 'missions', 'codex', 'tavern']
const LOCKED_SET = new Set<ViewId>(LOCKED_VIEWS)

interface Saved {
  authed: boolean          // 开屏指纹认证已完成
  unlocked: boolean        // 「欢迎来到，终末停滞委员会」事件已完成
  epDone: Record<string, true>
  cur: string | null       // 目前最靠前的已读段
  operatorName: string
  focusId: string
  world?: Partial<WorldState>
}

export interface TerminalState {
  view: ViewId
  /** 受门禁保护的导航 */
  navigate: (v: ViewId) => void

  operatorName: string
  operatorTitle: string
  setOperatorName: (n: string) => void

  focusId: string
  focusRegion: RegionReading
  setFocusId: (id: string) => void

  /** 开屏认证 */
  authed: boolean
  enter: () => void

  /** 流程阶段：title=标题菜单 · game=终端本体 */
  stage: 'title' | 'game'
  /** 行动继续：沿用当前进度进入终端（无运行进度但自动档有档时先读自动档） */
  resume: () => void
  /** 读取自动存档（不论当前运行档有无进度，一律以自动档覆盖）→ 全量重挂载；无自动档返回 false */
  loadAutosave: () => boolean
  /** 行动开始 / 重置：清当前 run（手动槽保留），进入全新记录 */
  startNew: () => void
  /** 终端连接：进入设置专用界面（仅此一页 · 隐藏侧边栏；密钥仅运行时录入） */
  enterSettings: () => void
  /** 设置专用界面态：只渲染终端设置一页（无侧边栏/无其他导航） */
  setupMode: boolean
  /** 从设置专用界面返回标题菜单 */
  exitSetup: () => void
  /** 退出终端：回到指纹认证开屏 */
  exitToBoot: () => void
  /** 读档：写入第 i 槽快照后全量重挂载 */
  loadSlot: (i: number) => void
  /** 存档：把当前 run 存进第 i 槽，返回是否成功 */
  saveSlot: (i: number, name: string) => boolean
  /** 游戏内「存读档」浮层开关 */
  slotsOpen: boolean
  setSlotsOpen: (open: boolean) => void

  /** 事件门禁 */
  unlocked: boolean
  /** 目标解锁事件是否已完成 */
  unlockReady: boolean

  /** 时间线阅读进度 */
  epDone: Record<string, true>
  cur: string | null              // 当前所在「段」id
  markRead: (id: string) => void
  resetRead: (id: string) => void

  /** 好感：起步＝初见≈20±性格；主役随已走剧情段原著快照推进，全体再叠主角行为（抉择/推演/短信）偏移——可增可减的变量 */
  bondNow: (charId: string) => number
  bondSnapAt: (epId: string | null) => BondSnap

  /** —— 动态世界状态（持久化变量） —— */
  world: WorldState
  isMet: (charId: string) => boolean
  /** 直接增减某角色的羁绊偏移（主角行为的效果统一走这里；接受档案名录内任意角色） */
  bumpBond: (charId: string, delta: number) => void
  /** 结算整段事件：标记完成 → 遇见角色自动解锁 + 推进图鉴自动登记 */
  resolveEvent: (id: string) => void
  /** 登记图鉴条目 id（剧情推进 / 操作员手动登记共用） */
  registerEnd: (id: string) => void
  isEndReg: (id: string) => boolean
  ownEnds: OwnEndEntry[]
  addOwnEnd: (e: OwnEndEntry) => void
  removeOwnEnd: (id: string) => void
  flagOf: (k: string) => FlagValue | undefined
  setFlag: (k: string, v: FlagValue) => void
  /** 新增命名变量；键名冲突或非法时返回 false（不覆盖既有值） */
  addVar: (k: string, v: FlagValue) => boolean
  /** 删除命名变量；不存在时返回 false */
  unsetVar: (k: string) => boolean
  /** 改名（先拷后删）；目标已占用或源不存在 → false 且不动数据 */
  renameVar: (from: string, to: string) => boolean
  /** 变量面板开关（NavRail 底部「变量」按钮；Plot 等亦可经 ctx 打开） */
  varsOpen: boolean
  setVarsOpen: (open: boolean) => void
  /** 该段已做的抉择（事件 id → 选项 key） */
  pickOf: (id: string) => string | null
  recordPick: (id: string, key: string) => void

  /** 已归档「记录」（按阅读序） */
  records: WorldRecord[]
  /** 立即把某角色标记为「遇见」（结构化指令在事件完结前先解锁用） */
  meetChar: (charId: string) => void
  /** 收束当前事件：resolveEvent + 追加一条记录，返回是否成功（true=已归档） */
  completeEvent: (id: string, digest: string, mode: RecordMode, diverged?: boolean) => boolean

  /** 跨视图「打开某角色档案」意图（正文关键词跳转 → 档案页就近展开） */
  profileRequest: { id: string; name: string; ts: number } | null
  requestProfile: (id: string) => void
  clearProfileRequest: () => void

  /** 跨视图「打开某图鉴条目」意图（正文关键词跳转 → 图鉴页滚动并展开） */
  codexRequest: { id: string; name: string; ts: number } | null
  requestCodex: (id: string) => void
  clearCodexRequest: () => void

  /** 跨视图「打开某角色短信」意图（档案卡 / 出击小队等 → 短信页并选中该联系人） */
  smsRequest: { id: string; ts: number } | null
  requestSms: (charId: string) => void
  clearSmsRequest: () => void

  toasts: Toast[]
  push: (kind: ToastKind, title: string, body?: string, live?: boolean) => void
  dismiss: (id: number) => void
  resetWorld: () => void
}

const Ctx = createContext<TerminalState | null>(null)
const KEY = RUN_KEY

/**
 * 会话级流程旗标（模块变量，跨全量重挂载保留）。
 * 冷启动默认全 false/title → 仍先走 Boot → 标题菜单（语义不变）；
 * 读档 / 行动开始会先置位再 requestRemount，重挂载后直达对应界面。
 */
let sessionAuthed = false
let sessionStage: 'title' | 'game' = 'title'
let sessionSetup = false
let pendingView: ViewId | null = null
/** 重挂载后由 provider 首个 effect 弹一次的通知（重置/读档的落地反馈） */
let pendingToast: { kind: ToastKind; title: string; body: string } | null = null

function takePendingView(): ViewId | null {
  const v = pendingView
  pendingView = null
  return v
}

function emptyWorld(): WorldState {
  return { offset: {}, flags: {}, met: {}, ends: {}, own: [], pick: {}, records: [] }
}

/** 「记录」按阅读序排序（主键 readingIndexOf，次键完成时间） */
function sortRecords(list: WorldRecord[]): WorldRecord[] {
  return [...list].sort(
    (a, b) => (readingIndexOf(a.eventId) - readingIndexOf(b.eventId)) || (a.ts - b.ts),
  )
}

/**
 * 图鉴里「以人物/名称现身于正文」、却无编号实体的条目 → 读到对应段落（正文/概述出现其名）即自动登记。
 * 其余封存条目（无编号、亦不在任何正文出现）由操作员自行登记。
 */
const PROSE_END_MAP: { name: string; id: string }[] = [
  { name: '胡道乃梦', id: 'huda-nayume' },
  { name: '勇鱼义人', id: 'yuina-yoshito' },
  { name: '东夷草次郎', id: 'touyi-caojiro' },
]

function defaultSaved(): Saved {
  return {
    authed: false,
    unlocked: false,
    epDone: {},
    cur: null,
    operatorName: '言万心叶',
    focusId: 'gcn',
    world: emptyWorld(),
  }
}

/** 各角色首次出场的段位（用于「遇见后解锁」）；按现场名册判定，外场角色同样可解锁 */
function meetIndexOf(charId: string): number {
  const i = TIMELINE.findIndex((e) => castOf(e).includes(charId))
  return i
}

/**
 * 旧存档（无 world）迁移 / 世界补算：
 * 已读进度会自动回填「已遇见角色」「已登记图鉴」，避免老玩家存档在切换后被打回原形。
 */
function hydrateWorld(epDone: Record<string, true>, cur: string | null, raw: Partial<WorldState> | undefined): WorldState {
  const w: WorldState = {
    offset: raw?.offset ?? {},
    flags: raw?.flags ?? {},
    met: raw?.met ?? {},
    ends: raw?.ends ?? {},
    own: raw?.own ?? [],
    pick: raw?.pick ?? {},
    records: [],
  }
  const doneIds = new Set(Object.keys(epDone))
  // 「记录」回填：已读段若无记录则补一条 legacy（旧档 → 完整记录流），再按阅读序排序
  const haveRec = new Set((raw?.records ?? []).map((r) => r.eventId))
  const records: WorldRecord[] = [...(raw?.records ?? [])]
  for (const e of TIMELINE) {
    if (doneIds.has(e.id) && !haveRec.has(e.id)) {
      records.push({ eventId: e.id, mode: 'legacy', digest: e.summary, ts: 0 })
    }
  }
  w.records = sortRecords(records)
  const readIdx = Math.max(
    cur !== null ? readingIndexOf(cur) : -1,
    ...[...doneIds].map((id) => readingIndexOf(id)).filter((i) => i >= 0),
    -1,
  )
  // 角色解锁：读到其首次出场段即视为「遇见」（覆盖名录全体，含外场侧角）
  for (const id of PERSON_IDS) {
    const mi = meetIndexOf(id)
    if (mi >= 0 && mi <= readIdx) w.met[id] = true
  }
  // 图鉴登记：把已读段里的实体标注登记进图鉴
  for (const e of TIMELINE) {
    if (!doneIds.has(e.id)) continue
    for (const ent of e.entities) {
      if (ent === '——') continue
      const id = resolveEntityToCodexId(ent)
      if (id) w.ends[id] = true
    }
    // 正文以人物名现身的相关者一并回填
    const prose = `${e.title} ${e.place} ${e.summary} ${e.script ? e.script.map((l) => `${l.speaker ?? ''}${l.text}`).join(' ') : ''}`
    for (const m of PROSE_END_MAP) {
      if (prose.includes(m.name)) w.ends[m.id] = true
    }
  }
  return w
}

function loadSaved(): Saved {
  const fallback = defaultSaved()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Saved>
    const epDone = parsed.epDone ?? {}
    const cur = typeof parsed.cur === 'string' ? parsed.cur : fallback.cur
    return {
      // 开屏认证不持久化:每次进入都先过指纹闸门(剧情进度不受影响)
      authed: false,
      unlocked: parsed.unlocked === true,
      epDone,
      cur,
      operatorName: typeof parsed.operatorName === 'string' ? parsed.operatorName : fallback.operatorName,
      focusId: typeof parsed.focusId === 'string' ? parsed.focusId : fallback.focusId,
      world: hydrateWorld(epDone, cur, parsed.world),
    }
  } catch {
    return fallback
  }
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadSaved()).current

  // 初始视图：重挂载若带 pendingView（重置/读档想落脚的页面）则优先
  const [view, setViewRaw] = useState<ViewId>(() => takePendingView() ?? 'dashboard')
  const [operatorName, setOperatorNameState] = useState<string>(initial.operatorName)
  const [focusId, setFocusId] = useState<string>(initial.focusId)
  // authed：同会话读档重挂载时经 sessionAuthed 跳过 Boot；冷启动仍回 false
  const [authed, setAuthed] = useState<boolean>(initial.authed || sessionAuthed)
  const [stage, setStageState] = useState<'title' | 'game'>(sessionStage)
  const [setupMode, setSetupMode] = useState<boolean>(sessionSetup)
  const [unlocked, setUnlocked] = useState<boolean>(initial.unlocked)
  const [epDone, setEpDone] = useState<Record<string, true>>(initial.epDone)
  const [cur, setCur] = useState<string | null>(initial.cur)
  const [world, setWorld] = useState<WorldState>(() => hydrateWorld(initial.epDone, initial.cur, initial.world))
  /** 变量面板浮层开关 */
  const [varsOpen, setVarsOpen] = useState(false)
  /** 「存读档」浮层开关 */
  const [slotsOpen, setSlotsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  /** 跨视图「打开档案」意图（正文关键词跳转用；档案页消费后清除） */
  const [profileRequest, setProfileRequest] = useState<{ id: string; name: string; ts: number } | null>(null)
  /** 跨视图「打开图鉴条目」意图（正文关键词跳转用；图鉴页消费后清除） */
  const [codexRequest, setCodexRequest] = useState<{ id: string; name: string; ts: number } | null>(null)
  /** 跨视图「打开某角色短信」意图（短信页消费后清除） */
  const [smsRequest, setSmsRequest] = useState<{ id: string; ts: number } | null>(null)

  const focusRegion: RegionReading = REGIONS.find((r) => r.id === focusId) ?? REGIONS[0]
  const saved = useMemo<Saved>(
    () => ({ authed, unlocked, epDone, cur, operatorName, focusId, world }),
    [authed, unlocked, epDone, cur, operatorName, focusId, world],
  )

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      /* 隐私模式等场景下静默降级 */
    }
  }, [saved])

  /* 自动存档 = 现有运行档的 1.5s 防抖镜像（日志限量；配额/隐私模式静默降级） */
  useEffect(() => {
    if (!authed || stage !== 'game') return
    const t = window.setTimeout(() => {
      try {
        writeAutosave(captureSnapshot({ operatorName, unlocked, epDone, cur, focusId, world }))
      } catch {
        /* noop */
      }
    }, 1500)
    return () => window.clearTimeout(t)
  }, [saved, authed, stage])

  /* 首启迁移：无槽文件但有旧进度 → 留 slots[0]「旧档留档」+ 自动档（幂等） */
  useEffect(() => {
    ensureMigration()
    // 内置预设也在这个时候入册：用户开「终端设置」时它已经在方案列表里了
    void ensureBuiltinPresets()
  }, [])

  /* 重挂载后落地一条重置/读档的反馈通知（冷启动为 null 则跳过） */
  useEffect(() => {
    if (!pendingToast) return
    const t = pendingToast
    pendingToast = null
    const id = window.setTimeout(() => push(t.kind, t.title, t.body, false), 420)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 世界书：挂载时幂等播种 canon 库（惰性、失败静默、不阻塞渲染） */
  useEffect(() => {
    void ensureSeeded().catch(() => {
      /* 隐私模式/IndexedDB 不可用时静默降级：世界书缺席不影响主线 */
    })
  }, [])

  const push = useCallback((kind: ToastKind, title: string, body?: string, live?: boolean) => {
    /*
      只有「出事 / 得手」两种才出声；情报类（观测记录、人事通知、委员长的自言自语）
      在右下角悄悄来去就好 —— 以前每一条都响，后台推一条就叮一下，
      用户根本对不上是哪件事，只会觉得「又在莫名响」。
    */
    if (kind === 'danger' || kind === 'warn') sfx('alert')
    else if (kind === 'success') sfx('loot')
    toastId.current += 1
    const t: Toast = { id: toastId.current, kind, title, body, live }
    setToasts((prev) => [...prev.slice(-4), t])
    if (!live) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
      }, 5400)
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  /* —— 事件门禁 —— */
  const navigate = useCallback(
    (v: ViewId) => {
      if (!unlocked && LOCKED_SET.has(v)) {
        push('warn', '权限未解锁', '需先完成事件「欢迎来到，终末停滞委员会」，方可访问该子系统。')
        return
      }
      setViewRaw(v)
    },
    [unlocked, push],
  )

  const enter = useCallback(() => {
    sessionAuthed = true
    setAuthed(true)
  }, [])

  /** 行动继续：沿用当前进度进终端；无运行进度但有自动档 → 先读自动档 */
  const resume = useCallback(() => {
    sessionSetup = false
    setSetupMode(false)
    const a = readAutosave()
    if (!hasRunProgress() && a) {
      applySnapshot(a.snapshot)
      sessionAuthed = true
      sessionStage = 'game'
      requestRemount()
      return
    }
    sessionStage = 'game'
    setStageState('game')
  }, [])

  /** 读取自动存档：无视当前运行档，直接以自动档覆盖并全量重挂载（标题页「自动存档 · 读取」） */
  const loadAutosave = useCallback((): boolean => {
    const a = readAutosave()
    if (!a) return false
    applySnapshot(a.snapshot)
    sessionAuthed = true
    sessionStage = 'game'
    sessionSetup = false
    pendingView = 'dashboard'
    pendingToast = { kind: 'info', title: '已读取自动存档', body: `${a.name || '自动存档'} · 收束 ${a.records} 段` }
    requestRemount()
    return true
  }, [])

  /** 清空当前 run（手动槽保留）并全量重挂载 → 全新记录落到终端总览 */
  const hardReset = useCallback(async (title: string, body: string) => {
    clearRunStorage()
    // 军需（终末点数）/ 小队体力 / 作战记录 存在 IndexedDB 'zts-battle' 里，
    // 不在 clearRunStorage 管的那几个 localStorage key 内 —— 不显式清，
    // 重置后点数还留着、体力不回满、旧战报继续挂在任务简报板上。
    // 必须 await 在 requestRemount 之前：重挂载后总览立刻读这几个读数，晚到的清空会让旧值先上屏。
    await resetBattleStore()
    sessionAuthed = true
    sessionStage = 'game'
    sessionSetup = false
    setSetupMode(false)
    // 开场先给总览：这一屏是「你现在什么状况」，
    // 正史要往哪儿推是下一步的事，不该一进来就压在人脸上。
    pendingView = 'dashboard'
    pendingToast = { kind: 'warn', title, body }
    requestRemount()
  }, [])

  const startNew = useCallback(() => {
    void hardReset('行动开始', '新的观测记录已建立。手动存档（存读档）不受影响。')
  }, [hardReset])

  const enterSettings = useCallback(() => {
    // 标题「终端连接」：进入仅含设置一页的设置专用界面（无侧边栏）
    sessionSetup = true
    setSetupMode(true)
    sessionStage = 'game'
    setStageState('game')
    setViewRaw('settings')
  }, [])

  /** 设置专用界面 → 返回标题菜单 */
  const exitSetup = useCallback(() => {
    sessionSetup = false
    setSetupMode(false)
    sessionStage = 'title'
    pendingView = null
    setStageState('title')
    setViewRaw('dashboard')
  }, [])

  const exitToBoot = useCallback(() => {
    sessionSetup = false
    setSetupMode(false)
    sessionAuthed = false
    sessionStage = 'title'
    pendingView = null
    setAuthed(false)
    setStageState('title')
    setViewRaw('dashboard')
  }, [])

  /** 读档：写回快照后置位旗标 → 全量重挂载（新 provider 从存储重建） */
  const loadSlot = useCallback(
    (i: number) => {
      const slot = readSlot(i)
      if (!slot) {
        push('warn', '空存档位', `第 ${i + 1} 槽还没有存档。`)
        return
      }
      applySnapshot(slot.snapshot)
      sessionAuthed = true
      sessionStage = 'game'
      sessionSetup = false
      setSetupMode(false)
      pendingToast = { kind: 'success', title: '存档已读取', body: `载入「${slot.name}」。` }
      requestRemount()
    },
    [push],
  )

  /** 存档：把当前 run 存进手动槽并弹通知（不重挂载） */
  const saveSlot = useCallback(
    (i: number, name: string): boolean => {
      if (i < 0 || i > 7) return false
      const slot = writeSlot(i, name, captureSnapshot({ operatorName, unlocked, epDone, cur, focusId, world }))
      if (!slot) return false
      push('success', '已存入存档槽', `第 ${i + 1} 槽 ·「${slot.name}」 · 记录 ${slot.records} 条。`, false)
      return true
    },
    [saved, push],
  )


  /* —— 好感：起步＝初见（无段可依时），主役取当前所在「段」的原著快照作基准 —— */
  const bondSnapAt = useCallback(
    (epId: string | null): BondSnap => {
      if (epId) {
        const ep = TIMELINE.find((e) => e.id === epId)
        if (ep) return ep.bond
      }
      return {}
    },
    [],
  )

  /**
   * 好感变量：基准 + 主角行为累积偏移。
   * 基准 = 四位主役：当前段原著快照（读到哪段就跟到哪段的原著推进）；
   *        其余 20 名在册登场者及未读段的主役：castmeta 起步值（初见≈20±性格）。
   * 主角行为（在线推演抉择/导演回执、短信往来）→ world.offset 增减 → 可增可减的动态变量。
   */
  const bondNow = useCallback(
    (charId: string) => {
      // 会长：一开始就是满值，且不随主角行为偏移上下浮动
      if (BOND_FULL[charId]) return 100
      const ep = cur ? TIMELINE.find((e) => e.id === cur) : undefined
      const v = ep?.bond[charId as keyof BondSnap]
      // 主役锚点 = 当前段原著快照；其余 20 名在册登场者 = 起步值（初见）；均叠加主角行为偏移
      const base = typeof v === 'number' ? v : defaultBondOf(charId)
      const off = world.offset[charId] ?? 0
      // 阶段上限：有的关系是「到了那一步」才翻篇的，推时间线本身不白送好感
      // （露娜在缔结使用者契约之前封顶，之后直接满值 —— 见 data/bondstage.ts）
      return bondWithStage(charId, clamp(base + off, 0, 100), cur)
    },
    [cur, world.offset],
  )

  /* —— 动态世界操作 —— */
  const bumpBond = useCallback((charId: string, delta: number) => {
    setWorld((prev) => ({
      ...prev,
      offset: {
        ...prev.offset,
        [charId]: clamp((prev.offset[charId] ?? 0) + delta, -100, 100),
      },
    }))
  }, [])

  const isMet = useCallback((charId: string) => !!world.met[charId], [world.met])

  const flagOf = useCallback(
    (k: string) => world.flags[k],
    [world.flags],
  )

  const setFlag = useCallback((k: string, v: FlagValue) => {
    setWorld((prev) => ({ ...prev, flags: { ...prev.flags, [k]: v } }))
  }, [])

  const addVar = useCallback(
    (k: string, v: FlagValue): boolean => {
      const key = k.trim()
      if (!key) return false
      if (Object.prototype.hasOwnProperty.call(world.flags, key)) return false
      setWorld((prev) => ({ ...prev, flags: { ...prev.flags, [key]: v } }))
      return true
    },
    [world.flags],
  )

  const unsetVar = useCallback(
    (k: string): boolean => {
      const key = k.trim()
      if (!key) return false
      if (!Object.prototype.hasOwnProperty.call(world.flags, key)) return false
      setWorld((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev.flags, key)) return prev
        const flags = { ...prev.flags }
        delete flags[key]
        return { ...prev, flags }
      })
      return true
    },
    [world.flags],
  )

  const renameVar = useCallback(
    (from: string, to: string): boolean => {
      const f = from.trim()
      const t = to.trim()
      if (!f || !t) return false
      if (f === t) return true
      if (!Object.prototype.hasOwnProperty.call(world.flags, f)) return false
      if (Object.prototype.hasOwnProperty.call(world.flags, t)) return false
      setWorld((prev) => {
        const v = prev.flags[f]
        if (v === undefined && !Object.prototype.hasOwnProperty.call(prev.flags, f)) return prev
        const flags = { ...prev.flags }
        delete flags[f]
        flags[t] = v
        return { ...prev, flags }
      })
      return true
    },
    [world.flags],
  )

  const pickOf = useCallback((id: string) => world.pick[id] ?? null, [world.pick])
  const recordPick = useCallback((id: string, key: string) => {
    setWorld((prev) => ({ ...prev, pick: { ...prev.pick, [id]: key } }))
  }, [])

  /** 请求打开某角色档案（自动切到档案页；档案页受门禁保护，未解锁时 navigate 会被拦下） */
  const requestProfile = useCallback(
    (id: string) => {
      if (!PERSON_IDS.includes(id)) return
      navigate('archive')
      setProfileRequest({ id, name: personOf(id)?.name ?? id, ts: Date.now() })
    },
    [navigate],
  )
  const clearProfileRequest = useCallback(() => setProfileRequest(null), [])

  /** 请求打开某图鉴条目（自动切到终末图鉴；图鉴页滚动并展开该条） */
  const requestCodex = useCallback(
    (id: string) => {
      navigate('codex')
      const ent = CODEX.find((e) => e.id === id)
      setCodexRequest({ id, name: ent?.name ?? id, ts: Date.now() })
    },
    [navigate],
  )
  const clearCodexRequest = useCallback(() => setCodexRequest(null), [])

  /** 请求打开某角色短信（自动切到短信页；短信页消费后选中并展开对应联系人） */
  const requestSms = useCallback(
    (charId: string) => {
      if (!PERSON_IDS.includes(charId)) return
      navigate('tavern')
      setSmsRequest({ id: charId, ts: Date.now() })
    },
    [navigate],
  )
  const clearSmsRequest = useCallback(() => setSmsRequest(null), [])

  /** 立即把某角色标记为「遇见」（接受档案名录内任意 id：四位主役 + 20 名在册登场者） */
  const meetChar = useCallback((charId: string) => {
    if (!PERSON_IDS.includes(charId)) return
    setWorld((prev) => (prev.met[charId] ? prev : { ...prev, met: { ...prev.met, [charId]: true } }))
  }, [])

  const registerEnd = useCallback((id: string) => {
    setWorld((prev) => {
      if (prev.ends[id]) return prev
      return { ...prev, ends: { ...prev.ends, [id]: true } }
    })
  }, [])

  const isEndReg = useCallback((id: string) => !!world.ends[id], [world.ends])

  const addOwnEnd = useCallback((e: OwnEndEntry) => {
    setWorld((prev) => ({ ...prev, own: [...prev.own.filter((x) => x.id !== e.id), e] }))
  }, [])

  const removeOwnEnd = useCallback((id: string) => {
    setWorld((prev) => ({ ...prev, own: prev.own.filter((x) => x.id !== id) }))
  }, [])

  /* —— 时间线阅读 —— */
  const markRead = useCallback(
    (id: string) => {
      const ev = TIMELINE.find((e) => e.id === id)
      if (!ev) return
      setEpDone((prev) => {
        if (prev[id]) return prev
        return { ...prev, [id]: true }
      })
      // 前进指针：只允许往后，不允许倒退
      setCur((prevCur) => {
        if (prevCur === id) return prevCur
        const curIdx = prevCur ? readingIndexOf(prevCur) : -1
        const newIdx = readingIndexOf(id)
        if (curIdx === -1 || (newIdx >= 0 && newIdx > curIdx)) return id
        return prevCur
      })
    },
    [],
  )

  /** 结算整段：标记完成，并自动解锁「本次遇见」的角色、自动登记「本次遭遇」的实体 */
  const resolveEvent = useCallback(
    (id: string) => {
      const ev = TIMELINE.find((e) => e.id === id)
      if (!ev) return
      markRead(id)

      const newChars: string[] = []
      const newEnds: string[] = []
      setWorld((prev) => {
        const met = { ...prev.met }
        // 现场名册（cast 优先，缺省回落 chars）：事件收束即把这些角色登记为「已遇见」
        for (const c of castOf(ev)) if (!met[c]) { met[c] = true; newChars.push(c) }
        const ends = { ...prev.ends }
        for (const ent of ev.entities) {
          if (ent === '——') continue
          const cid = resolveEntityToCodexId(ent)
          if (cid && !ends[cid]) { ends[cid] = true; newEnds.push(cid) }
        }
        // 正文出现其名的相关者（无编号实体）：读到即登记
        const prose = `${ev.title} ${ev.place} ${ev.summary} ${ev.script ? ev.script.map((l) => `${l.speaker ?? ''}${l.text}`).join(' ') : ''}`
        for (const m of PROSE_END_MAP) {
          if (prose.includes(m.name) && !ends[m.id]) {
            ends[m.id] = true
            newEnds.push(m.id)
          }
        }
        if (newChars.length === 0 && newEnds.length === 0) return prev
        return { ...prev, met, ends }
      })

      if (newChars.length > 0) {
        const names = newChars.map((c) => personOf(c)?.name ?? c).join(' · ')
        window.setTimeout(() => push('decode', '档案解锁 · 遇见登记', `${names}，已录入角色档案。`, false), 60)
      }
      if (newEnds.length > 0) {
        window.setTimeout(() => push('info', '图鉴登记 · 剧情推进', `${newEnds.length} 条实体记录已自动登记进终末图鉴。`, false), 240)
      }
    },
    [markRead, push],
  )

  /** 收束当前事件：标记完成＋自动遇见/登记，然后追加一条「记录」 */
  const completeEvent = useCallback(
    (id: string, digest: string, mode: RecordMode, diverged?: boolean): boolean => {
      const ev = TIMELINE.find((e) => e.id === id)
      if (!ev) return false
      resolveEvent(id)
      const body = digest.trim() || ev.summary
      setWorld((prev) => {
        const rec: WorldRecord = { eventId: id, mode, digest: body, diverged: !!diverged, ts: Date.now() }
        return { ...prev, records: sortRecords([...prev.records.filter((r) => r.eventId !== id), rec]) }
      })
      return true
    },
    [resolveEvent],
  )

  // 完成目标事件 → 自动解锁受门禁保护的视图（含角色档案）
  const unlockReady = !unlocked && unlockEventId !== null && !!epDone[unlockEventId]

  useEffect(() => {
    if (unlockReady && !unlocked) {
      setUnlocked(true)
      const un = TIMELINE.find((e) => e.id === unlockEventId)
      push('success', '事件完成 · 欢迎来到，终末停滞委员会', un ? `你已成为苍之学园的正式成员。${un.title}` : '你已成为苍之学园的正式成员。', false)
    }
  }, [unlockReady, unlocked, push])

  const resetRead = useCallback((id: string) => {
    setEpDone((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  /** 世界重置（NavRail 底部）：只清当前 run；手动存档（zts-slots:v1）保留 */
  const resetWorld = useCallback(() => {
    void hardReset('世界已重置', '进度归零。角色档案、终末图鉴与羁绊变量均已初始化，手动存档仍在「存读档」。')
  }, [hardReset])

  // 未解锁却停留在锁定视图（如重置后）时自动送回剧情推进
  useEffect(() => {
    if (!unlocked && LOCKED_SET.has(view)) {
      setViewRaw('plot')
    }
  }, [unlocked, view])

  const value: TerminalState = {
    view,
    navigate,
    operatorName,
    operatorTitle: opFull(epDone),
    setOperatorName: setOperatorNameState,
    focusId,
    focusRegion,
    setFocusId,
    authed,
    enter,
    stage,
    resume,
    loadAutosave,
    startNew,
    enterSettings,
    setupMode,
    exitSetup,
    exitToBoot,
    loadSlot,
    saveSlot,
    slotsOpen,
    setSlotsOpen,
    unlocked,
    unlockReady,
    epDone,
    cur,
    markRead,
    resetRead,
    bondNow,
    bondSnapAt,
    world,
    isMet,
    bumpBond,
    resolveEvent,
    registerEnd,
    isEndReg,
    ownEnds: world.own,
    addOwnEnd,
    removeOwnEnd,
    flagOf,
    setFlag,
    addVar,
    unsetVar,
    renameVar,
    pickOf,
    recordPick,
    varsOpen,
    setVarsOpen,
    records: world.records,
    meetChar,
    completeEvent,
    profileRequest,
    requestProfile,
    clearProfileRequest,
    codexRequest,
    requestCodex,
    clearCodexRequest,
    smsRequest,
    requestSms,
    clearSmsRequest,
    toasts,
    push,
    dismiss,
    resetWorld,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTerminal(): TerminalState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTerminal 必须在 TerminalProvider 内使用')
  return ctx
}

/** 供视图引用：首个主线段 id、序幕组判断 */
export { unlockEventId, firstMainId, isIntroGroup, readingIndexOf, TIMELINE }
