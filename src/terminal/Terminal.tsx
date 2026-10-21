import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { RegionReading, Toast, ToastKind, BondSnap, BondGate, WorldState, OwnEndEntry, WorldRecord, RecordMode, FlagValue, IntimateProfile, IntimateProgress, AttireProfile, AttireProgress, ActCount, RelId, TimelineEvent, AnchorLog } from '../data/types'
import { castOf } from '../lib/cast'
import { REGIONS } from '../data/regions'
import { TIMELINE, unlockEventId, readingIndexOf, firstMainId, isIntroGroup } from '../data/timeline'
import { ANCHORS } from '../data/anchors'
import { planRewind } from '../lib/rewind'
import { writeConcluded, writePendingBattle } from '../lib/plotpending'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { BOND_FULL, CAST, defaultBondOf, personOf, PERSON_IDS } from '../data/castmeta'
import type { CastPerson } from '../data/castmeta'
import { PERSONA_CARDS } from '../data/persona'
import { intimateOf, mergeIntim } from '../data/intimate'
import { attireOf, dryAttire, mergeAttire } from '../data/attire'
import { mergeActs } from '../data/acts'
import { clamp } from '../lib/format'
import { nameKey } from '../lib/namekey'
import { isFreeId } from '../lib/freetime'
import { furthestDone, opFull } from '../lib/operator'
import { manifestOf, regionOfPlace, rOfPlace } from '../lib/battle/rvalue'
import { ensureSeeded } from '../lib/lorestore'
import { ensureBriefs } from '../data/briefs'
import { ensureBudgetFloor, ensureBuiltinPresets } from '../lib/builtin-presets'
import { ensureBuiltinGroups } from '../lib/smsthreads'
import { requestRemount } from '../lib/remount'
import { subscribeTabLock, tabLockState, tabWriteBlocked } from '../lib/tablock'
import { sfx } from '../lib/audio'
import { resetBattleStore } from '../lib/battle/store'
import { syncResearch } from '../lib/research'
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

export type ViewId = 'dashboard' | 'plot' | 'map' | 'saga' | 'memory' | 'lore' | 'arms' | 'archive' | 'missions' | 'codex' | 'tavern' | 'settings'

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
  /** 退出终端：回到开场标题屏 */
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
  /** 现下已登记的变量名（供导演新起的名字并到老键上，见 lib/flagname.ts） */
  flagKeys: () => string[]
  /** 新增命名变量；键名冲突或非法时返回 false（不覆盖既有值） */
  addVar: (k: string, v: FlagValue) => boolean
  /** 删除命名变量；不存在时返回 false */
  unsetVar: (k: string) => boolean
  /** 改名（先拷后删）；目标已占用或源不存在 → false 且不动数据 */
  renameVar: (from: string, to: string) => boolean
  /** 变量面板开关（NavRail 底部「变量」按钮；Plot 等亦可经 ctx 打开） */
  varsOpen: boolean
  setVarsOpen: (open: boolean) => void
  /** 这一场约会此刻挂着的那张 CG（导演没点名 → null，不摆图） */
  cgOf: (id: string) => string | null
  /**
   * 这场约会**被点过几次名**（0 = 还没点过）。多变体槽位拿它取模决定这次摆第几版
   * —— 见 lib/cg.ts 的 `cgVariantId`。
   */
  cgTurnOf: (id: string) => number
  setCg: (id: string, cgId: string) => void
  /**
   * 该段**此刻**在场上的人：导演实时改过就用改过的（`world.cast`），
   * 没改过照事件静态名册（`castOf`）。右栏与提示词都取这一个入口。
   */
  castOfEvent: (ev: Pick<TimelineEvent, 'id' | 'cast' | 'chars'>) => string[]
  /**
   * 导演实时修正某段的在场名册（全量覆盖）。
   * **空数组合法** —— 「他把人都赶走了」「他独自离开」就得靠它落地。
   */
  setCast: (id: string, ids: string[]) => void
  /** 该段**此刻**的地点：导演改过就用改过的（`world.place`），没改过照 `ev.place` */
  placeOfEvent: (ev: Pick<TimelineEvent, 'id' | 'place'>) => string
  /** 导演实时修正某段的地点（段 id → 地名） */
  setPlace: (id: string, place: string) => void

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
   * **贴身衣物**（内衣与内裤此刻穿成什么样、内裤湿到什么程度）。与 `intimOf`
   * 并列摆在同一页私密档案里，但它记的是**此刻**而不是账 —— 穿着档位后写覆盖
   * （她可以又穿回去），湿润的增量可正可负（缓过来了就回落）。
   *
   * `arouse` = 同一次里这位涨了多少色情度：湿润那一半的耦合就落在这儿
   * （「因为发情而湿润」），规矩在 `mergeAttire` 里。
   * 非女角色 / 无底档 → null（档案页据此整节不摆）。
   */
  attireOf: (charId: string) => AttireProfile | null
  /** 落下一次贴身衣物推进（约会 / 私密往来）：穿着档位与湿润增量 */
  bumpAttire: (charId: string, p: AttireProgress, arouse: number) => void
  /**
   * 湿润自己退一档（`data/attire.ts` 的 `dryAttire`）—— 一回合里什么都没往上走
   * 的那一次，由落地的调用方喊一声。她凉下来、擦干净、换了一条，读数就该往下走
   * （用户口径：「内裤湿不可能一直湿润」）。已经干爽的人不动，也不留空转的流水。
   */
  dryAttireAll: () => void
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
   * **推进叙事时钟**（一格 = 半天：+1 = 半天，+2 = 一天）。
   *
   * 三条路都走这一个入口：右栏那两枚「等一等」、导演回执的 `advanceDays`
   * （乘 2 落进来，见 lib/plot.ts 的 `TICKS_PER_DAY`）、以及收束推进到下一段时的
   * 自然顺延（`tickGapFor` 按两段 `day` 的差值算）。
   * **只增不减**：给 0 / 负数什么都不做 —— 时间没有回拨这条路。
   */
  advanceTick: (halfDays: number) => void

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


  /**
   * 回退到「某一段之前」（多步回退）：把目标段**及它之后所有已归档段**一次撤干净。
   *
   * 与 `reopenEvent` 的差别只有一处 —— **一格 vs 到某段之前**：
   *   · `reopenEvent(id)` 只撤那一段（目标永远是「上一段」，用于一路推着撤）；
   *   · `rewindTo(id)` 撤目标段 + 它之后全部（用户在低语者日志里点「回到这一段之前」）。
   * 撤的东西同一口径：`epDone` 若干格、`world.records` 里对应记录、这些段 `lock`
   * 写下的羁绊下限（按**剩下还收着的段**重算）、指针 `cur` 落回目标段之前。
   * `rewindTo` 另多做两件：`world.anchors` 里这些段的锚点登记一并撤销（锚点跟着段走），
   * 以及清掉 `zts-plot-pending:v1`（收束栏 / 待战按钮不许残留成幽灵按钮）。
   *
   * **不撤**：会话正文、`world.cast`、`met`、图鉴登记、作战记录、`world.tick`
   * （tick 只增不减是既有口径 —— 回退不回拨时钟）。返回是否真的撤了。
   */
  rewindTo: (id: string) => boolean

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

  /**
   * 跨视图「赴某一场约会」意图（短信 / 正文聊成一场 → 在线推演 · 约会专线）。
   * 与 `smsRequest` 同一套路数，只是落点换成了在线推演那一路。
   * `id` 是约会名册上的那一场（`zts-rendezvous:v1` 里的 d:uuid）；给 null 只跳路不开场。
   */
  dateRequest: { id: string | null; ts: number } | null
  requestDate: (rvId: string | null) => void
  clearDateRequest: () => void

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

/* ============================================================
   通知队列 · 模块作用域（跨全量重挂载存活）
   ------------------------------------------------------------
   读档 / 重置 / 行动开始三条路都要 requestRemount() 把整个
   TerminalProvider 换掉 —— 各视图的 state 是在挂载那一刻从存储读的，
   不换实例就读不到新档。
   所以这里的通知**不能存在 provider 的 state 里**：换实例那一下就没了。
   上一版做的是「模块级 pendingToast + 新 provider 首个 effect 里挂一个
   420ms 定时器再 push」，队列本身不在模块里，于是那条提示的生死挂在
   「新实例能否活过 420ms」上 —— 卸载的 cleanup 会 clearTimeout，
   而 pendingToast 在排定时器之前就已经置空了，等不到第二次消费机会：
   一旦重挂载在这段窗口里再来一次，提示就**永远消失**。
   这条路的失败形状正是「读档之后没有提示 / 提示闪一下就没了」——
   真机上就是读档没反应，冒烟那头则是偶发超时。
   现在队列本身跨重挂载存活，写进队列的那一刻就在屏上：
   没有待消费的旗标，也没有「等一会儿再弹」的定时器。
   ============================================================ */
let toastList: Toast[] = []
let toastSeq = 0
const toastSubs = new Set<() => void>()

function commitToasts(next: Toast[]): void {
  toastList = next
  for (const fn of toastSubs) fn()
}
function subscribeToasts(fn: () => void): () => void {
  toastSubs.add(fn)
  return () => { toastSubs.delete(fn) }
}
function readToasts(): Toast[] {
  return toastList
}

/**
 * 弹一条通知。live 的那几条（后台推来的）不自动消退。
 * 只有「出事 / 得手」两种才出声；情报类（观测记录、人事通知、委员长的
 * 自言自语）在右下角悄悄来去就好 —— 从前每一条都响，后台推一条就叮一下，
 * 用户根本对不上是哪件事。
 */
function pushToast(kind: ToastKind, title: string, body?: string, live?: boolean): void {
  if (kind === 'danger' || kind === 'warn') sfx('alert')
  else if (kind === 'success') sfx('loot')
  toastSeq += 1
  const t: Toast = { id: toastSeq, kind, title, body, live }
  commitToasts([...toastList.slice(-4), t])
  if (!live) {
    window.setTimeout(() => {
      commitToasts(toastList.filter((x) => x.id !== t.id))
    }, 5400)
  }
}

function dismissToast(id: number): void {
  commitToasts(toastList.filter((x) => x.id !== id))
}

/**
 * 只读页（另一个标签页正在玩同一份进度）按下「要写档」的入口时的**唯一**台词。
 *
 * 为什么必须说话：这几个入口（行动开始 / 自动档读取 / 手动档读取）底下的写盘函数
 * （clearRunStorage / applySnapshot / saveFile）已经各自被 tabWriteBlocked() 拦下了，
 * 但拦住之后是**静默 return** —— 界面上按下去什么都不发生，人会以为按钮坏了。
 * 更糟的是旧版这里根本拦不住运行档指针：拦在存储层的只有正文账，
 * 而「开始新游戏」会重挂载一次 provider，新实例用一份空 epDone/cur 把
 * `zts-terminal:v3` 整份覆写掉（第一页下一次世界变化才自愈）。所以判据要提到入口这一层，
 * 并且**明说**该怎么办。
 */
function speakReadonly(): void {
  pushToast(
    'warn',
    '这一页是只读的 —— 另一个标签页在玩同一份进度',
    '要在这里开始，先点「在这一页接手」（剧情推进页顶部那条常驻提示里）。',
  )
}

function takePendingView(): ViewId | null {
  const v = pendingView
  pendingView = null
  return v
}

function emptyWorld(): WorldState {
  return {
    offset: {}, locked: {}, flags: {}, met: {}, ends: {}, own: [], cg: {}, cgVariant: {}, cast: {},
    intim: {}, attire: {}, acts: {}, rel: {}, tick: 0, records: [],
  }
}

/** 「记录」按阅读序排序（主键 readingIndexOf，次键完成时间） */
function sortRecords(list: WorldRecord[]): WorldRecord[] {
  return [...list].sort(
    (a, b) => (readingIndexOf(a.eventId) - readingIndexOf(b.eventId)) || (a.ts - b.ts),
  )
}

/* ============================================================
   正文出场识别 · 别名表（由既有数据表推导，不在这里重抄名单）

   图鉴里「以人物名现身于正文」的条目（CODEX 中**无编号**、且名字与名录角色同一个
   人的那几条）——读到对应段落（标题/地点/概述/台词里出现其名）即自动登记。
   从前这里只写死三个全名，而原文与推演正文里这几位大多以简称出现
   （「乃梦姐」「义人」「草次郎」），于是这一层基本没在回填。

   表从哪来：
     · 全名 / 名录别名 —— castmeta 的 CAST：name + names
       （side 的 names 就是 sidecast 里 card(id, 全名, 简称, …) 那个第三参）；
     · 简称 —— 由全名的姓名段推「后两字」（胡道乃梦 → 乃梦、东夷草次郎 → 次郎），
       **但必须在 data/persona.ts 的人物卡语料里被单独用过**才收：只从名号里切出来
       的碎片（「特琳」之于「凯特琳」、「摩尔」之于「惠特摩尔」）一律不算；
     · 敬称不另造 —— 匹配走子串，「乃梦姐」「次郎同学」靠 '乃梦' / '次郎' 天然认出。

   三道防误记的闸门：最短 2 字（单字「琳」「珊」不收）；通用称谓词不收；
   同一个别名指向两个人就**整条放弃**（宁可漏记，不许记错人）并当场 console.warn。
   ============================================================ */

type AliasKind = 'full' | 'short'

/** 一条命中：id 是图鉴条目，kind 区分「全名命中」与「简称命中」（内部用，不上屏） */
export interface ProseEndHit {
  id: string
  /** 收进来的那种写法（报告/调试用） */
  text: string
  kind: AliasKind
}

/** 单独拿出来不指向任何人的称谓（宁可漏记，不许记错人） */
const GENERIC_ALIAS = new Set([
  '会长', '副会长', '队长', '领队', '老师', '姐姐', '妹妹', '兄长',
  '学长', '学姐', '学妹', '先生', '同学', '大人', '公主', '魔王', '少女', '少年',
])

/** 收不收这个别名：比两个字符短、或是个通用称谓 → 不收 */
function aliasAccepted(key: string): boolean {
  return key.length >= 2 && !GENERIC_ALIAS.has(key)
}

/** 姓名段分隔：nameKey 之后中点只剩 U+00B7，按它切 */
const SEG_DOT = '\u00b7'

/**
 * 这条候选简称在语料里有没有「不寄居在本人任何一个已知名号里」的单独用法。
 * 只从已知名号里切出来的碎片（「特琳」之于「凯特琳」、「摩尔」之于「惠特摩尔」）
 * 一律不算 —— 那是名字的一段，不是称呼。
 */
function witnessed(corpus: string, masks: string[], cand: string): boolean {
  if (!corpus) return false
  const covered: [number, number][] = []
  for (const m of masks) {
    if (!m) continue
    for (let i = corpus.indexOf(m); i >= 0; i = corpus.indexOf(m, i + 1)) {
      covered.push([i, i + m.length])
    }
  }
  for (let i = corpus.indexOf(cand); i >= 0; i = corpus.indexOf(cand, i + 1)) {
    const nested = covered.some(([s, e]) => i >= s && i + cand.length <= e)
    if (!nested) return true
  }
  return false
}

export interface ProseAliasBuild {
  aliases: { id: string; key: string; text: string; kind: AliasKind }[]
  /** 同一个键指向不止一个人 → 整条放弃（附两侧 id） */
  conflicts: { key: string; ids: string[] }[]
  /** 被闸门剔掉的（太短 / 通用称谓），报告用 */
  dropped: string[]
}

/**
 * 建别名表（模块级只跑一次）。corpusOf 给见证语料（见 witnessed）—— 推导简称的依据。
 * 导出只为让校验脚本能拿别的数据再跑一遍（真表就在下面立刻建）。
 */
export function buildProseAliases(
  persons: CastPerson[],
  corpusOf: (id: string) => string,
  /* 派生简称（推出来的那种）只为这几个人推 —— 猜名字有风险，只在不猜就认不出
     图鉴条目的那几位身上猜；castmeta 已经声明过的名字不受这条限制。 */
  deriveOnly?: Set<string>,
): ProseAliasBuild {
  const slots = new Map<string, { text: string; ids: Set<string>; kind: AliasKind }>()
  const dropped: string[] = []
  const put = (id: string, raw: string, kind: AliasKind) => {
    const key = nameKey(raw)
    if (!aliasAccepted(key)) {
      if (key) dropped.push(raw + '(' + id + ')')
      return
    }
    const slot = slots.get(key)
    if (!slot) {
      slots.set(key, { text: raw, ids: new Set([id]), kind })
      return
    }
    slot.ids.add(id)
    // 同一个人既有全名又有简称落到同一格时留全名那条（kind 只作内部标记）
    if (kind === 'full') slot.kind = 'full'
  }
  for (const p of persons) {
    const full = nameKey(p.name)
    const segs = full.split(SEG_DOT)
    put(p.id, p.name, 'full')
    for (const n of p.names) put(p.id, n, nameKey(n) === full ? 'full' : 'short')
    /* 姓名段 ≥3 字 → 推「后两字」作简称（胡道乃梦 → 乃梦、东夷草次郎 → 次郎），
       须在语料里被单独用过。遮罩用本人全部已知名号 + 各姓名段 ——
       否则「凯特琳」里切出来的「特琳」、「惠特摩尔」里的「摩尔」都会被当成称呼。 */
    if (deriveOnly && !deriveOnly.has(p.id)) continue
    const masks = [full, ...p.names.map((n) => nameKey(n)), ...segs]
    const corpus = corpusOf(p.id)
    for (const seg of segs) {
      if (seg.length < 3) continue
      const cand = seg.slice(-2)
      if (witnessed(corpus, masks, cand)) put(p.id, cand, 'short')
    }
  }
  const aliases: ProseAliasBuild['aliases'] = []
  const conflicts: ProseAliasBuild['conflicts'] = []
  for (const [key, slot] of slots) {
    if (slot.ids.size > 1) {
      conflicts.push({ key, ids: [...slot.ids] })
      continue
    }
    aliases.push({ id: [...slot.ids][0], key, text: slot.text, kind: slot.kind })
  }
  // 同一个别名指向两个人：整条放弃，并在开发期把冲突打出来（不许悄悄挑一个）
  if (conflicts.length) {
    console.warn(
      '[terminal/prose] 别名指向不止一个人，已整条放弃（宁可漏记，不许记错人）：\n'
      + conflicts.map((c) => c.key + ' → ' + c.ids.join(' / ')).join('\n'),
    )
  }
  return { aliases, conflicts, dropped }
}

/* 简称的见证语料：data/persona.ts 的人物卡全集（这几位在原文里被怎么称呼，卡上都留着）。
   不拿 TIMELINE 正文当见证 —— 那是要匹配的对象，拿它自证就成了自己证自己。 */
const PERSONA_CORPUS = nameKey(
  Object.values(PERSONA_CARDS).map((c) => c.sections.map((s) => s.lines.join(' ')).join(' ')).join(' '),
)

/**
 * 人名 → 图鉴条目 id。只认 CODEX 里**无编号**且与名录角色同名的那几条：
 * 带【No.…】的实体走 entities 标注登记，按名字提前放行会把「艾美莉亚之箱」
 * 这类提及也算成她本人到场。
 */
const PROSE_END_ID = new Map<string, string>()
for (const p of CAST) {
  const key = nameKey(p.name)
  const entry = CODEX.find(
    (c) => (!c.no || c.no === '？' || c.no === '？？？') && nameKey(c.name) === key,
  )
  if (entry) PROSE_END_ID.set(p.id, entry.id)
}

const PROSE_ALIAS_BUILD = buildProseAliases(CAST, () => PERSONA_CORPUS, new Set(PROSE_END_ID.keys()))
const PROSE_ALIASES = PROSE_ALIAS_BUILD.aliases

/**
 * 正文（已归一）→ 本次命中的人。按图鉴 id 去重；同一人全名与简称都命中时留全名那一条。
 * 正文只归一一次（见 proseOf），这里只做表内的子串比对。
 */
export function proseEndHits(prose: string): ProseEndHit[] {
  const hit = new Map<string, ProseEndHit>()
  for (const a of PROSE_ALIASES) {
    const endId = PROSE_END_ID.get(a.id)
    if (!endId || !prose.includes(a.key)) continue
    const prev = hit.get(endId)
    if (!prev || (prev.kind === 'short' && a.kind === 'full')) {
      hit.set(endId, { id: endId, text: a.text, kind: a.kind })
    }
  }
  return [...hit.values()]
}

/** 一段的正文比较键：标题 + 地点 + 概述 + 台词（署名与叙述都算）—— 每段只归一这一次 */
function proseOf(e: TimelineEvent): string {
  const script = e.script ? e.script.map((l) => (l.speaker ?? '') + l.text).join(' ') : ''
  return nameKey(e.title + ' ' + e.place + ' ' + e.summary + ' ' + script)
}

/** 一段正文 → 命中的人（hydrate 与 resolve 两条路都只走这一处：归一一次、比一次） */
export function proseEndHitsOf(e: TimelineEvent): ProseEndHit[] {
  return proseEndHits(proseOf(e))
}

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
    // 旧档没有这一栏（约会那张图是后加的）→ 空表：没点过名就不摆，行为不变
    cg: raw?.cg ?? {},
    // 旧档没有这一栏（多变体轮换是后加的）→ 空表 + 起始值 1：第一次触发就是第 1 版
    cgVariant: raw?.cgVariant ?? {},
    // 旧档没有这一栏（实时在场名册是后加的）→ 空表；那些段照静态名册摆，行为不变
    cast: raw?.cast ?? {},
    // 旧档没有这一栏（私密档案是后加的）→ 空表；底档照常可读，只是没有推进的痕迹
    intim: raw?.intim ?? {},
    // 贴身衣物同为后加 → 旧档空表：两件照底档读作「穿着」、湿润读作 0（干爽）
    attire: raw?.attire ?? {},
    // 次数账与关系档位同为后加 → 旧档空表：八栏读作 0、档位读作「尚未定下」
    acts: raw?.acts ?? {},
    rel: raw?.rel ?? {},
    /* 自由活动开关（后加）：旧档没有 → 关着。它只是个开关，不落档也不会怎样 ——
       读作关就是当初的样子（主线一段咬着一段走）。 */
    free: raw?.free === true,
    /* 叙事时钟（后加）：旧档没有这一格 → 从 0 起算（第 0 日），不报错。
       坏值（负 / NaN / 小数）一律抹平到 0 或整数 —— 这一格只增不减，读档不该把它读坏。 */
    tick: typeof raw?.tick === 'number' && Number.isFinite(raw.tick) && raw.tick > 0 ? Math.floor(raw.tick) : 0,
    /* 世界线锚点的落地账（后加）：旧档没有 → 空表，也正是旧档该有的语义
       （一条都还没落地）；有的一律原样带走 —— 这里的键是锚点 id，改一次就等于
       把所有旧档的「这件大事已经演过了」抹掉，之后它会再提醒一遍。 */
    anchors: raw?.anchors ?? {},
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
  /* 锚点的**旧档回填**：存档里根本没有 anchors 这一栏（这一层是后加的）时，
     已收束的那些段所对应的锚点一律按「早就演过了」补记。
     不回填的后果不是少一条提示，而是**多二十四条**：一份读到第六卷的旧档
     在第一回合会把所有锚点一起判成「此刻到期」，提示词里一次涌出二十四句结果。
     判据只认「raw.anchors === undefined」—— 新写的档一定带着这张表（哪怕是空的），
     所以这条回填只对旧档生效，不会把新档里「还没演」的锚点误标成演过。 */
  if (raw?.anchors === undefined) {
    const back: Record<string, AnchorLog> = {}
    for (const a of ANCHORS) {
      if (a.evId && epDone[a.evId]) back[a.id] = { tick: w.tick ?? 0, how: 'played' }
    }
    w.anchors = back
  }
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
    // 正文里以全名或简称现身的相关者一并回填（别名表见上；正文只归一一次）
    for (const h of proseEndHitsOf(e)) w.ends[h.id] = true
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

  /* 科研（研究室）的研究点：按来源重算一遍（幂等，见 lib/research 的 syncResearch）。
     挂在这里而不是收束那一刻的某个回调里，是因为「段数」这件事只有一个出处 ——
     在线推演收束、离线通读收束、读档回填，三条路最后都落到这一个 epDone 上。 */
  useEffect(() => {
    void syncResearch(Object.keys(epDone).length)
  }, [epDone])
  /** 变量面板浮层开关 */
  const [varsOpen, setVarsOpen] = useState(false)
  /** 「存读档」浮层开关 */
  const [slotsOpen, setSlotsOpen] = useState(false)
  /* 通知队列是模块级那份（见 pushToast 上头那一段）：重挂载换实例，
     队列不跟着走 —— 「已读档」这种提示才不会被换实例抹掉。 */
  const toasts = useSyncExternalStore(subscribeToasts, readToasts)
  /** 跨视图「打开档案」意图（正文关键词跳转用；档案页消费后清除） */
  const [profileRequest, setProfileRequest] = useState<{ id: string; name: string; ts: number } | null>(null)
  /** 跨视图「打开图鉴条目」意图（正文关键词跳转用；图鉴页消费后清除） */
  const [codexRequest, setCodexRequest] = useState<{ id: string; name: string; ts: number } | null>(null)
  /** 跨视图「打开某角色短信」意图（短信页消费后清除） */
  const [smsRequest, setSmsRequest] = useState<{ id: string; ts: number } | null>(null)
  /** 跨视图「赴某一场约会」意图（在线推演 · 约会专线消费后清除） */
  const [dateRequest, setDateRequest] = useState<{ id: string | null; ts: number } | null>(null)

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

  /* 多标签页：只读页**不写运行档指针**。
     这一条正是那个漏点 —— 入口那一层拦的是 clearRunStorage / applySnapshot（正文账），
     可「开始新游戏」在只读页上还会重挂载一次 provider，新实例带着一份空的
     epDone / cur 走到这里，把 `zts-terminal:v3`（运行档指针）整份覆写成 0；
     第一页要等下一次世界变化才自愈。所以写之前再问一次写权。
     代次进依赖：在这一页接手之后要立刻补写一次，不必等下一次世界变化。 */
  const tabLock = useSyncExternalStore(subscribeTabLock, tabLockState)
  useEffect(() => {
    if (tabWriteBlocked()) return
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      /* 隐私模式等场景下静默降级 */
    }
  }, [saved, tabLock.epoch])

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

  /* 事件详纲那张表 2.1 MB，是懒加载的（见 data/briefs/index.ts）。
     在**开屏之后、第一次推进之前**这段空闲里先把它拉回来 —— 等到真拼导演提示词
     那一刻再去拉，那一回合就白等一个来回。拿不到也不拦：`Plot` 那边会 await 一次，
     真拉不回来就退回 summary（那条退路本来就在）。 */
  useEffect(() => { void ensureBriefs().catch(() => {}) }, [])

  /* 世界书：挂载时幂等播种 canon 库（惰性、失败静默、不阻塞渲染） */
  useEffect(() => {
    void ensureSeeded().catch(() => {
      /* 隐私模式/IndexedDB 不可用时静默降级：世界书缺席不影响主线 */
    })
  }, [])

  /* 两个都是模块函数（跨重挂载稳定）：组件这一头只做转手 */
  const push = pushToast
  const dismiss = dismissToast

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
      /* 这一支就是「读自动档」：只读页上它会覆写运行档指针，入口层先说人话。 */
      if (tabWriteBlocked()) { speakReadonly(); return }
      // 读档带 IDB 那一趟：'zts-battle' 的初值重置清不掉同步，必须 await 在重挂载之前
      void (async () => {
        await applySnapshot(a.snapshot)
        sessionAuthed = true
        sessionStage = 'game'
        requestRemount()
      })()
      return
    }
    sessionStage = 'game'
    setStageState('game')
  }, [])

  /** 读取自动存档：无视当前运行档，直接以自动档覆盖并全量重挂载（标题页「自动存档 · 读取」） */
  const loadAutosave = useCallback((): boolean => {
    /* 只读页：判据在最前面 —— 说人话，再什么都不动（标题页「自动存档 · 读取」）。 */
    if (tabWriteBlocked()) { speakReadonly(); return false }
    const a = readAutosave()
    if (!a) return false
    // 同上：先把 'zts-battle' 收回初值，再写回快照并重挂载（返回值仍同步给出去）
    void (async () => {
      await applySnapshot(a.snapshot)
      sessionAuthed = true
      sessionStage = 'game'
      sessionSetup = false
      pendingView = 'dashboard'
      pushToast('info', '已读取自动存档', `${a.name || '自动存档'} · 收束 ${a.records} 段`)
      requestRemount()
    })()
    return true
  }, [])

  /** 清空当前 run（手动槽保留）并全量重挂载 → 全新记录落到终端总览 */
  const hardReset = useCallback(async (title: string, body: string) => {
    /* 只读页：「行动开始 / 重置」= 把另一个标签页正玩着的那一档整份删掉。
       clearRunStorage() 自己也会拦（存储层），但那儿是静默 return；这里拦在入口上，
       并且明说「先点在这一页接手」—— 否则按下去只像按钮坏了。 */
    if (tabWriteBlocked()) { speakReadonly(); return }
    clearRunStorage()
    // 军需（终末点数）/ 小队体力 / 作战记录 存在 IndexedDB 'zts-battle' 里，
    // 不在 clearRunStorage 管的那几个 localStorage key 内 —— 不显式清，
    // 重置后点数还留着、体力不回满、旧战报继续挂在任务简报板上。
    // 读档那一路（applySnapshot）调的是同一个函数 resetBattleToInitial（本名是它的旧名），
    // 两条路径的初值口径只有一份。
    // 必须 await 在 requestRemount 之前：重挂载后总览立刻读这几个读数，晚到的清空会让旧值先上屏。
    await resetBattleStore()
    sessionAuthed = true
    sessionStage = 'game'
    sessionSetup = false
    setSetupMode(false)
    // 开场先给总览：这一屏是「你现在什么状况」，
    // 正史要往哪儿推是下一步的事，不该一进来就压在人脸上。
    pendingView = 'dashboard'
    pushToast('warn', title, body)
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
      /* 只读页：「读取存档」= 拿一份档把整本账（含运行档指针）覆写掉。同上，先说人话。 */
      if (tabWriteBlocked()) { speakReadonly(); return }
      const slot = readSlot(i)
      if (!slot) {
        push('warn', '空存档位', `第 ${i + 1} 槽还没有存档。`)
        return
      }
      // 同上：读档 = 连战斗域一起换（军需 / 体力 / 战报），await 在重挂载之前
      void (async () => {
        await applySnapshot(slot.snapshot)
        sessionAuthed = true
        sessionStage = 'game'
        sessionSetup = false
        setSetupMode(false)
        pushToast('success', '存档已读取', `载入「${slot.name}」。`)
        requestRemount()
      })()
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

  /* 已登记的变量名。给 `applyDirective` 用：导演新起的名字先跟这一张表比一遍，
     差一点点就并到老键上（见 lib/flagname.ts）—— 手打的那个键一个字都不动。 */
  const flagKeys = useCallback(() => Object.keys(world.flags), [world.flags])

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

  /** 某场约会此刻挂着的那张 CG（导演还没点名 → null，那就一张也不摆） */
  const cgOf = useCallback((id: string) => world.cg?.[id] ?? null, [world.cg])
  const cgTurnOf = useCallback((id: string) => world.cgVariant?.[id] ?? 0, [world.cgVariant])
  /**
   * 导演点名某场约会该摆哪张 CG。同一场可以被反复改写 —— 往下走一幕就是换一张，
   * 后一次覆盖前一次（要看的是「此刻挂着哪张」，不是「换过哪些张」）。
   * 认不认这个 id 由显示端（components/DateLane.tsx 对着 dateCgPalette 判）——
   * 这里只落盘。
   *
   * 顺带把这一场的**触发次数** +1：同一张画有多版时，显示端拿这个数取模换下一版
   * （`lib/cg.ts` 的 `cgVariantId`）。**只有真的换了一张才 +1** —— 导演重复点名
   * 同一个 id 时不加，否则原地打转那几回合会把变体白转过去。
   */
  const setCg = useCallback((id: string, cgId: string) => {
    setWorld((prev) => {
      if (prev.cg?.[id] === cgId) return prev
      return {
        ...prev,
        cg: { ...prev.cg, [id]: cgId },
        cgVariant: { ...prev.cgVariant, [id]: (prev.cgVariant?.[id] ?? 0) + 1 },
      }
    })
  }, [])

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
   * 不是「来过哪些人」。**空名单照写** —— 场上一个人都没有也是一种要摆出来的局面；
   * 「名册没变」由调用方省略这一项表达（见 sanitizeDirective）。
   */
  const setCast = useCallback((id: string, ids: string[]) => {
    setWorld((prev) => ({ ...prev, cast: { ...prev.cast, [id]: [...ids] } }))
  }, [])

  /** 某段此刻的地点（导演改过 → world.place，否则照静态地点） */
  const placeOfEvent = useCallback(
    (ev: Pick<TimelineEvent, 'id' | 'place'>): string => world.place?.[ev.id] ?? ev.place,
    [world.place],
  )
  /** 导演实时修正某段的地点（`PlotDirective.place`）：后一次覆盖前一次 */
  const setPlace = useCallback((id: string, place: string) => {
    if (!place.trim()) return
    setWorld((prev) => ({ ...prev, place: { ...prev.place, [id]: place.trim() } }))
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

  /**
   * 该角色此刻的贴身衣物（底档 + world.attire 合成）；非女角色 / 无底档 → null。
   * 与私密档案同一道门槛，同一页上摆。
   */
  const attireOfFn = useCallback(
    (charId: string) => attireOf(charId, world.attire?.[charId]),
    [world.attire],
  )
  /**
   * 落下一次贴身衣物推进 —— 怎么并进手里那一份，全在 `mergeAttire` 里
   * （穿着后写覆盖 · 湿润累加且可负 · 色情度耦合 · 空转不记账）。
   * 与 `bumpIntim` 同一个分工：规则住在 data 里（能被单独验），这儿只管写回世界。
   */
  const bumpAttire = useCallback((charId: string, prog: AttireProgress, arouse: number) => {
    if (!personOf(charId)) return
    setWorld((prev) => {
      const next = mergeAttire(prev.attire?.[charId], prog, arouse)
      return { ...prev, attire: { ...prev.attire, [charId]: next } }
    })
  }, [])

  /**
   * 湿润自己退一档 —— 一回合里没有私密推进、也没有衣物推进时，由落地那一层喊一声
   * （见 `dryAttire`）。退到 0 的人不再动：`dryAttire` 回 null，这里连世界都不重写
   * （没有真的变，就不该产生一次新的 world 引用让整棵树重画）。
   */
  const dryAttireAll = useCallback(() => {
    setWorld((prev) => {
      const table = prev.attire
      if (!table) return prev
      let touched = false
      const next = { ...table }
      for (const [id, prog] of Object.entries(table)) {
        const dried = dryAttire(prog)
        if (!dried) continue
        next[id] = dried
        touched = true
      }
      return touched ? { ...prev, attire: next } : prev
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
   * 叙事时钟往前推 n 格（一格 = 半天）。**只增不减** —— 0 / 负数一律不动。
   *
   * 旧档没有 `world.tick` 时按 0 起算（第 0 日），不必先补一格；
   * 读档那一路由 `hydrateWorld` 已经把坏值抹平（见那儿的一行注释）。
   */
  const advanceTick = useCallback((halfDays: number) => {
    const add = Number.isFinite(halfDays) ? Math.floor(halfDays) : 0
    if (add <= 0) return
    setWorld((prev) => ({ ...prev, tick: (typeof prev.tick === 'number' ? prev.tick : 0) + add }))
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

  /**
   * 请求赴一场约会（自动切到在线推演；那儿消费后把约会专线这一路打开）。
   * `rvId` 给 null 就是「只把这一路打开、不定哪一场」—— 由短信 / 正文里
   * 落下的那一条事件指令决定去哪儿时，不该再让主人自己挑。
   */
  const requestDate = useCallback(
    (rvId: string | null) => {
      navigate('plot')
      setDateRequest({ id: rvId, ts: Date.now() })
    },
    [navigate],
  )
  const clearDateRequest = useCallback(() => setDateRequest(null), [])

  /** 立即把某角色标记为「遇见」（接受档案名录内任意 id：四位主役 + 21 名在册登场者） */
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
      // 正文一次归一（可能很长），再与别名表比对：全名与简称（「乃梦姐」→ '乃梦'）都认得出
      const proseHits = proseEndHitsOf(ev)
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
        for (const m of proseHits) {
          if (!ends[m.id]) {
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
        /* —— 世界线锚点：这一段收束了，挂在这一段上的锚点就算**演出来了** ——
           记一笔 played（`WorldState.anchors`），于是下一回合的判定不再复述它、
           界面那行「下一个锚点」也往后挪一格。记在收束这一处（而不是某个视图里），
           是因为「这一段走完了」这件事只有这一个入口 —— 放别处会漏掉离线通读那条路。
           走 fallback 形态的那种由后续批次写 'fallback'，这里不猜。 */
        let anchors = prev.anchors
        const onThis = ANCHORS.filter((a) => a.evId === id && !anchors?.[a.id])
        if (onThis.length) {
          anchors = { ...anchors }
          for (const a of onThis) anchors[a.id] = { tick: prev.tick ?? 0, how: 'played' }
        }
        const rec: WorldRecord = { eventId: id, mode, digest: body, diverged: !!diverged, ts: Date.now() }
        return {
          ...prev,
          ...(locked !== prev.locked ? { locked } : null),
          ...(anchors !== prev.anchors ? { anchors } : null),
          records: sortRecords([...prev.records.filter((r) => r.eventId !== id), rec]),
        }
      })
      return true
    },
    [resolveEvent, gateMissing],
  )

  /**
   * 回退到「某一段之前」（多步回退）—— `reopenEvent` 的多步版，契约见
   * `TerminalState.rewindTo`。方案由 `lib/rewind.ts` 的 `planRewind` 算出（纯函数，
   * 读序取 `EPISODES` 下标，含卷间自由段）；这里只负责照着落盘。
   *
   * 一次撤干净（①~⑥）：
   *   ① `epDone` 删掉 `plan.drop` 全部；
   *   ② `cur` 置为 `plan.cursor`（drop 之前最近的一段，没有就 null）；
   *   ③ 低语者记录按 `plan.drop` 逐条 filter（自由段本无记录，兜住即可）；
   *   ④ 羁绊下限 `world.locked` **只按 `plan.keep` 重算**（不是整份清空）；
   *   ⑤ `world.anchors` 按 `plan.anchors` 逐键 delete（着段走的锚点登记一并撤）；
   *   ⑥ 清 `zts-plot-pending:v1`（收束栏 / 待战按钮不许残留成幽灵按钮）。
   *
   * 与 `reopenEvent` 的差异只有「撤多少」：它撤**一格**，这里撤**这一段及其之后全部**。
   * `reopenEvent` 不碰的这几样，这里同样不碰：会话正文（`zts-plot`，推过的正文
   * 还留着能重读）、`world.cast`、`met`、图鉴登记（`world.ends`）、作战记录
   * （battle store）、`world.tick` —— **回退不回拨时钟**（tick 只增不减，既有口径）。
   */
  const rewindTo = useCallback(
    (id: string): boolean => {
      const plan = planRewind(id, epDone)
      if (!plan) return false
      const dropped = new Set(plan.drop)

      setEpDone((prev) => {
        const next = { ...prev }
        for (const evId of plan.drop) delete next[evId]
        return next
      })
      setCur(plan.cursor)

      setWorld((prev) => {
        /* ④ 羁绊下限只按 keep 重算 —— 与 reopenEvent 同一条口径，范围换成「剩下的全部」 */
        const locked: Record<string, number> = {}
        for (const evId of plan.keep) {
          const ev = TIMELINE.find((e) => e.id === evId)
          for (const l of ev?.lock ?? []) {
            if (l.value > (locked[l.char] ?? 0)) locked[l.char] = l.value
          }
        }
        const anchors = { ...(prev.anchors ?? {}) }
        for (const a of plan.anchors) delete anchors[a]
        return {
          ...prev,
          locked,
          anchors,
          records: prev.records.filter((r) => !dropped.has(r.eventId)),
        }
      })

      /* ⑥ 收束栏 / 待战按钮：两半各写各的，两下都清干净（见 lib/plotpending.ts） */
      writeConcluded(null)
      writePendingBattle(null)

      /* 观测记录（toast）由调用方推：它比这里更清楚「用户点的是哪一段」——
         Saga 那枚「回到这一段之前」推的就是 plan.drop 那份名单。 */
      return true
    },
    [epDone],
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
    flagKeys,
    addVar,
    unsetVar,
    renameVar,
    cgOf,
    cgTurnOf,
    setCg,
    castOfEvent,
    setCast,
    placeOfEvent,
    setPlace,
    intimOf,
    bumpIntim,
    attireOf: attireOfFn,
    bumpAttire,
    dryAttireAll,
    actsOf,
    bumpActs,
    relOf,
    setRel,
    advanceTick,
    freeMode,
    setFreeMode,
    closeFreeSlot,
    varsOpen,
    setVarsOpen,
    records: world.records,
    meetChar,
    completeEvent,
    reopenEvent,
    rewindTo,
    profileRequest,
    requestProfile,
    clearProfileRequest,
    codexRequest,
    requestCodex,
    clearCodexRequest,
    smsRequest,
    requestSms,
    clearSmsRequest,
    dateRequest,
    requestDate,
    clearDateRequest,
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
