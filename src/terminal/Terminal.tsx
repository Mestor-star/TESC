import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RegionReading, Toast, ToastKind, BondSnap, WorldState, OwnEndEntry, CharId, WorldRecord, RecordMode, FlagValue } from '../data/types'
import { CHARACTERS } from '../data/chars'
import { REGIONS } from '../data/regions'
import { TIMELINE, unlockEventId, readingIndexOf, firstMainId, isIntroGroup } from '../data/timeline'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { defaultBondOf, personOf, PERSON_IDS } from '../data/castmeta'
import { clamp } from '../lib/format'
import { ensureSeeded } from '../lib/lorestore'

export type ViewId = 'dashboard' | 'plot' | 'saga' | 'lore' | 'arms' | 'archive' | 'missions' | 'comms' | 'codex' | 'tavern' | 'settings'

/**
 * 需完成「欢迎来到，终末停滞委员会」事件才能解锁的视图。
 * 角色档案自始开放（全员档案 + 羁绊照常显示），故不在锁定之列。
 */
export const LOCKED_VIEWS: ViewId[] = ['arms', 'missions', 'comms', 'codex', 'tavern']
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

  /** 事件门禁 */
  unlocked: boolean
  /** 目标解锁事件是否已完成 */
  unlockReady: boolean

  /** 时间线阅读进度 */
  epDone: Record<string, true>
  cur: string | null              // 当前所在「段」id
  markRead: (id: string) => void
  resetRead: (id: string) => void

  /** 好感（随时间线逐段变化 + 抉择偏移 = 可增可减的变量） */
  bondNow: (charId: string) => number
  bondSnapAt: (epId: string | null) => BondSnap

  /** —— 动态世界状态（持久化变量） —— */
  world: WorldState
  isMet: (charId: string) => boolean
  /** 直接增减某角色的羁绊偏移（抉择、对话效果统一走这里；接受档案名录内任意角色） */
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

  toasts: Toast[]
  push: (kind: ToastKind, title: string, body?: string, live?: boolean) => void
  dismiss: (id: number) => void
  resetWorld: () => void
}

const Ctx = createContext<TerminalState | null>(null)
const KEY = 'zts-terminal:v3'

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

/** 各角色首次出场的段位（用于「遇见后解锁」） */
function meetIndexOf(charId: string): number {
  const i = TIMELINE.findIndex((e) => e.chars.includes(charId as CharId))
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
  // 角色解锁：读到其首次出场段即视为「遇见」
  for (const c of CHARACTERS) {
    const mi = meetIndexOf(c.id)
    if (mi >= 0 && mi <= readIdx) w.met[c.id] = true
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

  const [view, setViewRaw] = useState<ViewId>('dashboard')
  const [operatorName, setOperatorNameState] = useState<string>(initial.operatorName)
  const [focusId, setFocusId] = useState<string>(initial.focusId)
  const [authed, setAuthed] = useState<boolean>(initial.authed)
  const [unlocked, setUnlocked] = useState<boolean>(initial.unlocked)
  const [epDone, setEpDone] = useState<Record<string, true>>(initial.epDone)
  const [cur, setCur] = useState<string | null>(initial.cur)
  const [world, setWorld] = useState<WorldState>(() => hydrateWorld(initial.epDone, initial.cur, initial.world))
  /** 变量面板浮层开关 */
  const [varsOpen, setVarsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  /** 跨视图「打开档案」意图（正文关键词跳转用；档案页消费后清除） */
  const [profileRequest, setProfileRequest] = useState<{ id: string; name: string; ts: number } | null>(null)
  /** 跨视图「打开图鉴条目」意图（正文关键词跳转用；图鉴页消费后清除） */
  const [codexRequest, setCodexRequest] = useState<{ id: string; name: string; ts: number } | null>(null)

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

  /* 词条库：挂载时幂等播种 canon 库（惰性、失败静默、不阻塞渲染） */
  useEffect(() => {
    void ensureSeeded().catch(() => {
      /* 隐私模式/IndexedDB 不可用时静默降级：词条库缺席不影响主线 */
    })
  }, [])

  const push = useCallback((kind: ToastKind, title: string, body?: string, live?: boolean) => {
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

  const enter = useCallback(() => setAuthed(true), [])

  /* —— 好感：取当前所在「段」的快照 —— */
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
   * 好感变量 = 当前段原著快照（基准）+ 操作员抉择累积偏移。
   * 随着读到的段推进，基准沿原著抬升/回落；抉择可在此基础上增减 → 可增可减的动态变量。
   */
  const bondNow = useCallback(
    (charId: string) => {
      const ep = cur ? TIMELINE.find((e) => e.id === cur) : undefined
      const v = ep?.bond[charId as keyof BondSnap]
      // 主役锚点 = 当前段原著快照；其余 21 名登场者 = castmeta 登记基线；均叠加抉择偏移
      const base = typeof v === 'number' ? v : defaultBondOf(charId)
      const off = world.offset[charId] ?? 0
      return clamp(base + off, 0, 100)
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

  /** 请求打开某角色档案（自动切到档案页；角色档案自始开放，无需解锁） */
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

  /** 立即把某角色标记为「遇见」（接受档案名录内任意 id：四位主役 + 21 名登场者） */
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
        for (const c of ev.chars) if (!met[c]) { met[c] = true; newChars.push(c) }
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
        const names = newChars.map((c) => CHARACTERS.find((x) => x.id === c)?.name ?? c).join(' · ')
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

  // 完成目标事件 → 自动解锁四大视图
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

  const resetWorld = useCallback(() => {
    setAuthed(true)
    setUnlocked(false)
    setEpDone({})
    setCur(null)
    setOperatorNameState('言万心叶')
    setFocusId('gcn')
    setWorld(emptyWorld())
    setViewRaw('plot')
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
    push('warn', '世界已重置', '进度归零。角色档案、终末图鉴与羁绊变量均已初始化。')
  }, [push])

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
    operatorTitle: '苍之学园 体验入学 · Stage4『活性化』 · 低语者',
    setOperatorName: setOperatorNameState,
    focusId,
    focusRegion,
    setFocusId,
    authed,
    enter,
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
