/**
 * 多标签页并发 —— 心跳锁 + 只读保护。
 *
 * 病灶（不是猜测）：会话账 `zts-plot:v1` 与自动档 `zts-slots:v1` 的写法是
 * 「读整本 → 改 → 整本回写」。开两个标签页玩同一份进度，后写的那个会把前一个
 * 这几回合的正文整本盖掉，屏上没有任何提示。
 *
 * 做法（最小可行，不做协同编辑）：
 *   · 一个键 `zts-tab:lock` 存 `{ id, ts }` —— 拿到写权的那一页每 4s 写一次心跳；
 *   · 另一页只是**读**它：发现「另一个 id 的心跳在 5s 内」就判自己为只读，
 *     写入入口（会话账 / 存档槽）一律拦下，屏上给一条常驻提示 + 「在这一页接手」；
 *   · 接手 = 把自己写成最新心跳并 +1 代次（视图据此从存储重载一次）；
 *     对面那一页下一拍就看见「别人在拍」，自己转只读；
 *   · 心跳超过 5s 没更新 = 对面走了（关标签页没触发 unload、被后台节流、进程没了
 *     都算这条）：下一拍自己认领，**不需要用户点按钮**。
 *
 * 口径与边界：
 *   · 只认 localStorage，读不到（隐私模式）就当「没有锁」—— 宁可放行，也不误锁；
 *   · 本模块无 React、不 import 任何视图；订阅给 useSyncExternalStore 用，
 *     快照对象只在状态真的变时才换引用。
 */

/** 心跳键（沿用 zts- 前缀） */
export const TAB_LOCK_KEY = 'zts-tab:lock'
/** 心跳间隔：比判定阈值短，留出一次丢拍的余量 */
const BEAT_MS = 4000
/** 「对面还活着」的判定阈值：超过它就算空闲，下一拍自动收回写权 */
const STALE_MS = 5000

export interface TabLockState {
  /** true = 这一页是「第二页」：写入入口一律拦下，屏上常驻只读提示 */
  readonly: boolean
  /** 每次「这一页拿到写权」+1（接手 / 对面空闲后自动回来）—— 视图据此重载一次 */
  epoch: number
}

let selfId = ''
let started = false
let timer: ReturnType<typeof setInterval> | null = null
let state: TabLockState = { readonly: false, epoch: 0 }
const listeners = new Set<() => void>()

function setReadonly(ro: boolean): void {
  if (state.readonly === ro) return
  state = { readonly: ro, epoch: ro ? state.epoch : state.epoch + 1 }
  for (const fn of listeners) fn()
}

function readLock(): { id: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(TAB_LOCK_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { id?: unknown; ts?: unknown }
    if (!p || typeof p.id !== 'string' || typeof p.ts !== 'number') return null
    return { id: p.id, ts: p.ts }
  } catch {
    return null
  }
}

/** 写一拍心跳（拿不到 localStorage 就算了：放行优先于误锁） */
function beat(): void {
  try {
    localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: selfId, ts: Date.now() }))
  } catch {
    /* noop */
  }
}

/** 对面是否正在拍：另一个 id、且心跳在阈值内 */
function otherAlive(now: number): boolean {
  const lock = readLock()
  return !!lock && lock.id !== selfId && now - lock.ts < STALE_MS
}

function tick(): void {
  if (otherAlive(Date.now())) {
    /* 对面在拍（含「我这一页被人接手了」）：让出写权 —— 只读，且**不写心跳**，
       否则两页会互相踩着写，谁也判不出来。 */
    setReadonly(true)
    return
  }
  /* 对面不在拍（没人 / 超过 5s 没更新）：自己认领。只读的那一页走到这里 = 自动回到可写。 */
  if (state.readonly) setReadonly(false)
  beat()
}

/** 关页那一瞬间尽力放开：只在锁还姓自己的时候清，别把刚接手的那一页锁掉 */
function release(): void {
  const lock = readLock()
  if (lock && lock.id !== selfId) return
  try {
    localStorage.removeItem(TAB_LOCK_KEY)
  } catch {
    /* noop */
  }
}

/**
 * 起心跳（幂等）。挂载点在 Plot 那一侧 —— 心跳只为「剧情推进」这一路服务，
 * 别的界面不参与判定，也就不该多写一拍。
 */
export function startTabLock(): void {
  if (started) return
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  started = true
  selfId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  try {
    window.addEventListener('pagehide', release)
    window.addEventListener('beforeunload', release)
  } catch {
    /* noop */
  }
  /* 启动那一下就走一拍：对面在拍 → 立刻只读（不等 4s）；没人在拍 → 立刻认领 */
  tick()
  timer = setInterval(tick, BEAT_MS)
  /* interval 不该把页面钉住（Node/测试环境没有 window 也无所谓） */
  if (timer && typeof (timer as { unref?: () => void }).unref === 'function') (timer as unknown as { unref: () => void }).unref()
}

/**
 * 写入口的统一判据：true = 这一页只读，写 zts-plot / zts-slots 一律拦下。
 *
 * **第一次问写权时就地起心跳**（懒启动）：心跳若只挂在 Plot 的挂载点上，第二页
 * 在「标题菜单 → 开始新游戏」那一段时间里是**无锁可判**的 —— 那一手会走
 * clearRunStorage()，把第一页正玩着的档整份删掉（读档 / 重置同一条路）。
 * 所以判据自己也把锁立起来：一有页要写，就先看一眼有没有别人在拍。
 */
export function tabWriteBlocked(): boolean {
  if (!started) {
    startTabLock()
    if (!started) return false   // 没有 window / localStorage：放行优先于误锁
  }
  /* 这一笔之前再确认一次：页面被冻结 / 后台节流时 tick 可能晚了不止一拍，
     而「我那会儿还是可写的」这个缓存值正是会盖掉别人正文的那种过期判断。
     一次 getItem 换掉一整类过期写，值。 */
  if (!state.readonly && otherAlive(Date.now())) setReadonly(true)
  return state.readonly
}

/** 点「在这一页接手」：抢锁（自己成为最新心跳）+ 放开写入 + 代次 +1（视图重载一次） */
export function takeoverTabLock(): void {
  if (!started) startTabLock()
  if (!started) return
  beat()
  setReadonly(false)
}

/** useSyncExternalStore 的 getSnapshot：引用只在状态真的变时才换 */
export function tabLockState(): TabLockState {
  return state
}

export function subscribeTabLock(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
