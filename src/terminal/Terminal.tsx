import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RegionReading, Toast, ToastKind, BondSnap, BondGate, WorldState, OwnEndEntry, WorldRecord, RecordMode, FlagValue, IntimateProfile, IntimateProgress, ActCount, RelId, TimelineEvent } from '../data/types'
import { castOf } from '../lib/cast'
import { REGIONS } from '../data/regions'
import { TIMELINE, unlockEventId, readingIndexOf, firstMainId, isIntroGroup } from '../data/timeline'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { BOND_FULL, defaultBondOf, personOf, PERSON_IDS } from '../data/castmeta'
import { intimateOf, mergeIntim } from '../data/intimate'
import { mergeActs } from '../data/acts'
import { clamp } from '../lib/format'
import { isFreeId } from '../lib/freetime'
import { furthestDone, opFull } from '../lib/operator'
import { manifestOf, regionOfPlace, rOfPlace } from '../lib/battle/rvalue'
import { ensureSeeded } from '../lib/lorestore'
import { ensureBudgetFloor, ensureBuiltinPresets } from '../lib/builtin-presets'
import { ensureBuiltinGroups } from '../lib/smsthreads'
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

export type ViewId = 'dashboard' | 'plot' | 'saga' | 'memory' | 'lore' | 'arms' | 'archive' | 'missions' | 'codex' | 'tavern' | 'settings'

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
  /** 手动钉住的观测点 id；null = 跟随剧情（默认） */
  focusId: string | null
  world?: Partial<WorldState>
}

export interface TerminalState {
  view: ViewId
  /** 受门禁保护的导航 */
  navigate: (v: ViewId) => void

  operatorName: string
  operatorTitle: string
  setOperatorName: (n: string) => void

  /** 当前钉住的观测点 id；null = 跟随剧情。见 focusRegion */
  focusId: string | null
  /**
   * 当前观测点读数。**默认跟着剧情走** —— 取最近收束段的地点，一段都没推过就取下一段的地点；
   * 手动点选某一格才改为钉住该区（focusId 非 null）。表里没有的地点照算（推算读数，标 EST-），
   * 不退回固定分区：退回等于「这一带从没变过」，而总览读的应当是此刻在哪。
   */
  focusRegion: RegionReading
  /** 钉住某个观测点（传 null 回到「跟随剧情」） */
  setFocusId: (id: string | null) => void

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

  /**
   * 好感：起步＝初见（≈20±性格）＋ 主角行为累积偏移（对话 / 抉择 / 短信 / 作战）。
   * **不随进度白涨** —— 推进到哪一段都不给固定读数，涨多少只看这一路做过什么
   * （可说错话往下掉）。唯一的例外仍是事件说了算的 `world.locked` 锁定值。
   */
  bondNow: (charId: string) => number
  /** 原著读数：这一段原著里那个人对他说得上的好感 —— 只作对照，不当基准 */
  bondSnapAt: (epId: string | null) => BondSnap
  /** 这一段的门槛还差谁（空数组 = 进得去）；界面用它提前说明「为什么这一段点不进去」 */
  gateMissing: (id: string) => BondGate[]
  /** 门槛缺失的人话：「露娜（52/70）」 */
  gateText: (miss: BondGate[]) => string

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
  /**
   * 该段**此刻**在场上的人：导演实时改过就用改过的（`world.cast`），
   * 没改过照事件静态名册（`castOf`）。右栏与提示词都取这一个入口。
   */
  castOfEvent: (ev: Pick<TimelineEvent, 'id' | 'cast' | 'chars'>) => string[]
  /** 导演实时修正某段的在场名册（全量覆盖；空名单不写） */
  setCast: (id: string, ids: string[]) => void

  /**
   * 私密档案（只对女角色生效）。`intimOf` 返回**底档 + 已落地的推进**合成之后的一页；
   * 非女角色 / 无底档 → null（档案页据此整节不摆）。
   *
   * 这一页**不设门槛** —— 它只住在本机、只给「你」看，随时翻得开。
   * 羁绊过线之后变的只有一处：她对这件事的看法换一句（见 `intimateOf`）。
   */
  intimOf: (charId: string) => IntimateProfile | null
  /** 落下一次私密推进（约会 / 私密往来）：各部位开发度增量、状态改写、破处对象 */
  bumpIntim: (charId: string, p: IntimateProgress) => void
  /**
   * **次数账**（八栏累计值；见 `data/acts.ts`）。与 `intimOf` 并列摆在同一页背面：
   * intim 说的是「这一处此刻是什么样」，它说的是「**一共**多少回」—— 只增不减。
   * 没记过的角色 → 空表（八栏全读作 0）。
   */
  actsOf: (charId: string) => ActCount
  /** 记一笔次数（八栏增量；只增不减） */
  bumpActs: (charId: string, add: ActCount) => void
  /**
   * **关系档位**（`data/rel.ts` 的九级梯子）。由剧情给，**不从羁绊读数换算** ——
   * 没给过 → undefined，档案上照实读作「尚未定下」。
   */
  relOf: (charId: string) => RelId | undefined
  /** 落下一次关系档位（**绝对**档位：往上、往下都给同一个入口；相同则不写） */
  setRel: (charId: string, tier: RelId) => void

  /**
   * **自由活动**开关（`WorldState.free`）—— 主线走到一半想脱纲一会儿时按下去。
   *
   * 它动的只有一条规矩：**这期间羁绊一律不动**（拦在落地那一层，见 lib/plot.ts 的
   * `applyDirective` 第三个参数）。开发度 / 次数账 / 关系档位照常各记各的。
   * 卷与卷之间那一格（`EPISODES` 里的 `free:<卷>` 段）走的是同一个状态 ——
   * 到了那一格它自己就是开着的，不必操作员再按一次。
   */
  freeMode: boolean
  setFreeMode: (on: boolean) => void
  /**
   * 结束卷间那一格自由时间（「进入下一卷」）：只标收束，**不写记录**。
   *
   * 与 `completeEvent` 的分工是清楚的：那一条是「原文里这一段走完了」，要落摘要、
   * 要点名解锁、要算图鉴；自由段**不是原文里的一段**（见 lib/freetime.ts），
   * 没有可归档的摘录，也不该在低语者日志上占一条 —— 它只该让推演指针往下走。
   * 返回是否真的收束了。
   */
  closeFreeSlot: (id: string) => boolean

  /** 已归档「记录」（按阅读序） */
  records: WorldRecord[]
  /** 立即把某角色标记为「遇见」（结构化指令在事件完结前先解锁用） */
  meetChar: (charId: string) => void
  /** 收束当前事件：resolveEvent + 追加一条记录，返回是否成功（true=已归档） */
  completeEvent: (id: string, digest: string, mode: RecordMode, diverged?: boolean) => boolean
  /**
   * 回退到上一段：把某一段**连同它的记录**一起撤回去，推演指针退回这一段之前。
   *
   * 「退干净」—— 用户口径。撤掉的四样：
   *   · `epDone[id]`（这一段重新变成「未收束」）；
   *   · `world.records` 里那一条（低语者日志上不再挂着它）；
   *   · 这一段 `lock` 写下的羁绊下限（按**剩下还收着的段**重算，不是整份清空）；
   *   · `cur` 退回它前面最近一段（前面没有了就退回 null）。
   * **不动**的三样：会话正文（`zts-plot`，那一段推过的话还在，能重读、
   * 也能再推一遍把它收回来）、`met` / `ends` 登记（「见过」「登记过」是不可逆的
   * 事实，与进度无关）、以及别段的任何东西。返回是否真的撤了。
   */
  reopenEvent: (id: string) => boolean

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
  return {
    offset: {}, locked: {}, flags: {}, met: {}, ends: {}, own: [], cast: {},
    intim: {}, acts: {}, rel: {}, records: [],
  }
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
    // null = 跟随剧情（默认）。总览读的是此刻在哪，不该一上来就钉死在某一格。
    focusId: null,
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
    // 旧档没有这一栏（好感锁定是后加的）→ 空表；已锁定的段位由本次读档重新触发。
    locked: raw?.locked ?? {},
    flags: raw?.flags ?? {},
    met: raw?.met ?? {},
    ends: raw?.ends ?? {},
    own: raw?.own ?? [],
    // 旧档没有这一栏（实时在场名册是后加的）→ 空表；那些段照静态名册摆，行为不变
    cast: raw?.cast ?? {},
    // 旧档没有这一栏（私密档案是后加的）→ 空表；底档照常可读，只是没有推进的痕迹
    intim: raw?.intim ?? {},
    // 次数账与关系档位同为后加 → 旧档空表：八栏读作 0、档位读作「尚未定下」
    acts: raw?.acts ?? {},
    rel: raw?.rel ?? {},
    /* 自由活动开关（后加）：旧档没有 → 关着。它只是个开关，不落档也不会怎样 ——
       读作关就是当初的样子（主线一段咬着一段走）。 */
    free: raw?.free === true,
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
      // 老档里存的 'gcn' 是过去那个硬编码缺省值（那会儿聚焦区根本没人能改），
      // 不算「用户选过」——按「跟随剧情」读，免得老档永远钉在第一格。
      focusId: typeof parsed.focusId === 'string' && parsed.focusId !== 'gcn' ? parsed.focusId : null,
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
  const [focusId, setFocusId] = useState<string | null>(initial.focusId)
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

  /**
   * 当前观测点 —— 总览的仪表盘、威胁条与顶栏读数都取这一个值。
   * 默认**跟着剧情走**：最近收束的那一段在哪儿，观测的就是哪儿；一段都没推过就取下一段的地点。
   * 手动点选分区才钉住（focusId 非 null）。
   * 读数按 rOfPlace 的次序取：**原文明写了数的读原文（CN-，挂「原文」）**、
   * 侦察网标定表命中取表值（FLK-，挂「标定」）、都对不上才按**这一段现场的终末**
   * （manifestOf：entities ＋ 在场的人型终末）推一个（EST-，挂「推算」）。
   * 不许退回 REGIONS[0] —— 退回等于宣称「这一带从没变过」，那是死板：
   * 开场那艘太平洋上的货船有黑之魔王在甲板上，那里就不该读成 1.000。
   * 拿卷号当危险度同样不行：卷号只说讲到第几本书，不说此刻这条街有多危险。
   */
  const focusRegion: RegionReading = useMemo(() => {
    const pinned = focusId ? REGIONS.find((r) => r.id === focusId) : undefined
    if (pinned) return pinned
    const fi = furthestDone(epDone)
    const ev = fi >= 0 ? TIMELINE[fi] : TIMELINE.find((e) => !epDone[e.id])
    if (!ev) return REGIONS[0]
    const hit = regionOfPlace(ev.place)
    if (hit) return hit
    const site = manifestOf(ev)
    const rd = rOfPlace(ev.place, site.stage, site.names)
    return {
      id: `live:${ev.id}`,
      name: ev.place,
      code: rd.code,
      r: rd.r,
      delta: 0,
      threatStage: site.stage,
      threatName: site.names[0] ?? null,
      note: rd.note,
      /* 挂牌用出身：原文实测 / 标定表 / 推算 —— 推算数不能冒充实测数 */
      known: rd.known,
      src: rd.src,
      series: rd.series,
      naxa: rd.naxa,
      quote: rd.quote,
      book: rd.book,
      over: rd.over,
    }
  }, [focusId, epDone])
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
    /*
      内置预设也在这个时候入册：用户开「终端设置」时它已经在方案列表里了。
      挨着再做两件一次性的首启事，**顺序不能反**：
        ① 先让自带预设生效 —— 本机没有生效目标时直接启动它（套用会把协议
           预设自带的输出预算一并落进两通道）；
        ② 再把还停在我们自己写过的那些旧值上的预算抬到上限。
      反过来的话，②刚抬上去的数会被①用预设里的值原样盖回去 —— 白抬一趟。
      （②只认我们自己塞过的那些值，用户手打的数一概不碰。）
    */
    void ensureBuiltinPresets().then(() => ensureBudgetFloor())
    /* 内置群聊与上面几位分开走：短信页的名册是同步读 localStorage 的，
       这一步只写盘；真正的重读在 Tavern 挂载时（见 views/Tavern.tsx）。 */
    ensureBuiltinGroups()
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


  /* —— 好感：只从主角的行为里来 —— */

  /**
   * 原著读数：这一段原著里，那个人对言万心叶的好感大概是多少。
   *
   * **它不再是好感的基准** —— 只作对照用：界面上拿它比一比「走到这一段，
   * 你比他更亲近，还是更疏远」。好感本身只从 `world.offset` 来（见 bondNow）。
   */
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
   * 好感变量：**初见值 + 主角行为累积**，不从进度里来。
   *
   * 从前是「读到哪一段就跟到那一段的原著数值」，主角做过什么只在这之上加减一个偏移 ——
   * 于是好感成了进度的影子：什么都没做也涨，跳过一集也涨。现在基准只剩初见值
   * （`defaultBondOf`，性格定的起点），涨多少全看这一路说过什么、做过什么
   * （在线推演抉择 / 导演回执 / 短信往来 / 一起作战 → `world.offset`）。什么都不做就是不动。
   *
   * 曾经还有第二档「阶段上限」（不到翻篇那一步封顶、到了直接给满，见 data/bondstage.ts）
   * —— 也撤了：它同样是「推进到某一段就白给一个固定读数」。如今唯一的例外只剩
   *   锁定（`world.locked`，由事件的 `lock` 写入）—— 那件事之后关系回不去了，此后固定在这个值。
   * 现下只有 v1-9（卷一使用者契约）用它锁 100，且那道门本身仍要求露娜的好感先到 70。
   */
  const bondNow = useCallback(
    (charId: string) => {
      // 会长：一开始就是满值，且不随主角行为偏移上下浮动
      if (BOND_FULL[charId]) return 100
      const base = defaultBondOf(charId)
      const off = world.offset[charId] ?? 0
      const v = clamp(base + off, 0, 100)
      // 锁定值优先于行为偏移，且只增不减：已被锁过的角色再撞上更低的锁定值，取高的那个
      const locked = world.locked?.[charId]
      return typeof locked === 'number' ? Math.max(v, locked) : v
    },
    [world.offset, world.locked],
  )

  /**
   * 这一段的**门槛**还差几个人：返回所有未达成的条目（空数组 = 进得去）。
   *
   * 用在「不是读到这儿就该发生，而是关系先得走到这儿」的段上（如卷一的契约事件）。
   * 好感不够时推进指针会停在前一段 —— 时间线不替主角把关系走完。
   */
  const gateMissing = useCallback(
    (id: string): BondGate[] => {
      const ev = TIMELINE.find((e) => e.id === id)
      if (!ev?.gate?.length) return []
      return ev.gate.filter((g) => bondNow(g.char) < g.value)
    },
    [bondNow],
  )

  /** 门槛的缺失人话（给提示条用）：「露娜（52/70）」 */
  const gateText = useCallback(
    (miss: BondGate[]) =>
      miss.map((m) => `${personOf(m.char)?.name ?? m.char}（${bondNow(m.char)}/${m.value}）`).join('、'),
    [bondNow],
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

  /**
   * 某段此刻真的在场上的人（导演还没改过名册 → undefined，由显示端照静态名册摆）
   */
  const castOfEvent = useCallback(
    (ev: Pick<TimelineEvent, 'id' | 'cast' | 'chars'>): string[] => world.cast?.[ev.id] ?? castOf(ev),
    [world.cast],
  )
  /**
   * 导演实时修正某段的在场名册（`PlotDirective.cast`）。
   * 给的是**全量**名单、后一次覆盖前一次 —— 右栏要摆的是「此刻这一场里都有谁」，
   * 不是「来过哪些人」。空名单不写（那由「省略这一项」表达，见 sanitizeDirective）。
   */
  const setCast = useCallback((id: string, ids: string[]) => {
    if (!ids.length) return
    setWorld((prev) => ({ ...prev, cast: { ...prev.cast, [id]: [...ids] } }))
  }, [])

  /**
   * 该角色此刻的私密档案（底档 + world.intim 合成）；非女角色 / 无底档 → null。
   * 把羁绊一并递进去 —— 它只影响一处：「对性行为的看法」取哪一层。
   */
  const intimOf = useCallback(
    (charId: string) => intimateOf(charId, world.intim?.[charId], bondNow(charId)),
    [world.intim, bondNow],
  )
  /**
   * 落下一次私密推进 —— 怎么并进手里那一份，全在 `mergeIntim` 里
   * （开发度与色情度累加 · 状态句后写覆盖 · **破处只认第一回**）。
   * 这儿只管一件事：把它写回世界。规则本身放在 data 里，是为了它能被单独验。
   */
  const bumpIntim = useCallback((charId: string, prog: IntimateProgress) => {
    if (!personOf(charId)) return
    setWorld((prev) => {
      const next = mergeIntim(prev.intim?.[charId], prog)
      return { ...prev, intim: { ...prev.intim, [charId]: next } }
    })
  }, [])

  /** 该角色手里那一本次数账（没记过 → 空表：八栏全读作 0） */
  const actsOf = useCallback(
    (charId: string): ActCount => world.acts?.[charId] ?? {},
    [world.acts],
  )
  /**
   * 记一笔次数 —— 怎么并进手里那一本，全在 `mergeActs` 里（逐栏累加、**只增不减**）。
   * 与 `bumpIntim` 同一个分工：规则住在 data 里（能被单独验），这儿只管写回世界。
   */
  const bumpActs = useCallback((charId: string, add: ActCount) => {
    if (!personOf(charId)) return
    setWorld((prev) => {
      const next = mergeActs(prev.acts?.[charId], add)
      return { ...prev, acts: { ...prev.acts, [charId]: next } }
    })
  }, [])

  /** 该角色此刻的关系档位（还没由剧情定下 → undefined，档案上照实读作「尚未定下」） */
  const relOf = useCallback(
    (charId: string): RelId | undefined => world.rel?.[charId],
    [world.rel],
  )
  /**
   * 落下一次关系档位 —— 给的是**绝对**档位（不是增量），所以这里只做一件事：
   * 与此刻那一档相同就别写（免得每次推演都刷一遍存档、也免得白白触发一次渲染）。
   * 上下都走同一个入口：翻脸了照样给，那就是低的那一级。
   */
  const setRel = useCallback((charId: string, tier: RelId) => {
    if (!personOf(charId)) return
    setWorld((prev) => {
      if (prev.rel?.[charId] === tier) return prev
      return { ...prev, rel: { ...prev.rel, [charId]: tier } }
    })
  }, [])

  /**
   * 自由活动开关。写进 `world.free` —— 它跟存档走，读档回来还在原来的状态。
   *
   * 同一状态还有第二个入口：卷与卷之间那一格（`isFreeId(ev.id)`）。
   * 那一格**不用**操作员按这一枚开关，推演那边按段 id 自己就认（见 lib/plot.ts）；
   * 两者合流成同一个「羁绊不动」的落地口径，不必在这儿互相写来写去。
   */
  const freeMode = world.free === true
  const setFreeMode = useCallback((on: boolean) => {
    setWorld((prev) => (prev.free === on ? prev : { ...prev, free: on }))
  }, [])

  /**
   * 结束卷间那一格自由时间。只落 `epDone[id]` 一格 —— 照 `closeFreeSlot` 契约
   * 里那条：**不写记录**（自由段不是原文里的一段，没有可归档的摘录）。
   *
   * 进度那一本账不受影响：数进度的地方一律照 `TIMELINE` 过（`countMainlineDone`
   * 亦然），这一个 `free:` 键在那些地方 `readingIndexOf` 读作 -1 就被跳过了。
   * `cur`（「目前最靠前的已读段」）同样不动 —— 那一栏是给读档回填「见过谁 / 登记过
   * 什么」用的，而自由时间不揭新角色、不登新图鉴；且指针本身照 `epDone` 现算
   * （见 Plot 的 `focusEv`），不靠 `cur`。
   */
  const closeFreeSlot = useCallback((id: string): boolean => {
    if (!isFreeId(id)) return false
    setEpDone((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
    return true
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
      // 门槛：关系还没走到这儿，这一段就开不了 —— 指针停在前一段，不替主角把路走完
      const miss = gateMissing(id)
      if (miss.length) {
        push(
          'warn',
          '这一段还进不去',
          `还差：${gateText(miss)}。好感只在对话与行动里涨 —— 先把这段关系走出来。`,
        )
        return
      }
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
    [gateMissing, gateText, push],
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
      // 门槛同样拦在这里：收束是「这一段走完了」的宣告，门都没进就不算走完。
      // 不拦的话，导演回执可以绕过 markRead 直接把这一段判成完成 —— 那就等于
      // 事件又能替主角把关系走完了，正是这次要拿掉的东西。
      if (gateMissing(id).length) return false
      resolveEvent(id)
      const body = digest.trim() || ev.summary
      setWorld((prev) => {
        // 本段若带锁定（如卷一的契约事件），走完就锁死这一段关系的下限：
        // 此后主角说什么做什么，读出来都不会再低于这个值
        let locked = prev.locked
        for (const l of ev.lock ?? []) {
          const had = locked?.[l.char] ?? 0
          if (l.value > had) locked = { ...locked, [l.char]: l.value }
        }
        const rec: WorldRecord = { eventId: id, mode, digest: body, diverged: !!diverged, ts: Date.now() }
        return {
          ...prev,
          ...(locked !== prev.locked ? { locked } : null),
          records: sortRecords([...prev.records.filter((r) => r.eventId !== id), rec]),
        }
      })
      return true
    },
    [resolveEvent, gateMissing],
  )

  /**
   * 回退到上一段（用户口径：「退干净：连日志那一条一起撤」）。
   * 撤 `epDone` 那一格、低语者日志里那一条记录、这一段写下的羁绊下限，并把指针
   * 退回它前面最近一段；会话正文与「见过 / 登记过」的既成事实一律不动。
   * 契约见 `TerminalState.reopenEvent`。
   */
  const reopenEvent = useCallback(
    (id: string): boolean => {
      if (!TIMELINE.some((e) => e.id === id) || !epDone[id]) return false
      const at = readingIndexOf(id)

      setEpDone((prev) => {
        if (!prev[id]) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })

      /* 指针退回这一段之前：剩下还收着的段里，阅读序最靠后、且在本段之前的那一段。
         一段都没有（撤的是第一段）→ 退回 null，回到「还没开始推」的样子。 */
      setCur((prev) => {
        let best: string | null = null
        let bestAt = -1
        for (const evId of Object.keys(epDone)) {
          if (evId === id) continue
          const i = readingIndexOf(evId)
          if (i >= 0 && i < at && i > bestAt) { best = evId; bestAt = i }
        }
        if (bestAt === -1) return null
        return prev === best ? prev : best
      })

      setWorld((prev) => {
        /* 羁绊下限重算：`ev.lock` 是那一段走完才落下的，撤了它，它写下的下限
           也跟着撤 —— 但只重算剩下的段，别把整份清空（后头还有段锁着更高的值）。 */
        const locked: Record<string, number> = {}
        for (const evId of Object.keys(epDone)) {
          if (evId === id) continue
          const ev = TIMELINE.find((e) => e.id === evId)
          for (const l of ev?.lock ?? []) {
            if (l.value > (locked[l.char] ?? 0)) locked[l.char] = l.value
          }
        }
        return {
          ...prev,
          locked,
          records: prev.records.filter((r) => r.eventId !== id),
        }
      })

      const ev = TIMELINE.find((e) => e.id === id)
      push('info', '回退一段 · 已撤回', `《${ev?.title ?? id}》已从低语者日志撤下，推演退回这一段之前。这一段推过的正文仍留在会话里。`, false)
      return true
    },
    [epDone, push],
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
    gateMissing,
    gateText,
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
    castOfEvent,
    setCast,
    intimOf,
    bumpIntim,
    actsOf,
    bumpActs,
    relOf,
    setRel,
    freeMode,
    setFreeMode,
    closeFreeSlot,
    varsOpen,
    setVarsOpen,
    records: world.records,
    meetChar,
    completeEvent,
    reopenEvent,
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
