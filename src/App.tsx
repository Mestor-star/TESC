import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { ArrowLeft, Brain, Gauge, Users, MapPin, BookOpen, Scroll, Vault, Lock, Bell, X, Info, Warning, Check, Lightning, PenNib, Sword, ChatDots, GearSix, Play, SlidersHorizontal, FloppyDisk, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'

import { TerminalProvider, useTerminal, LOCKED_VIEWS } from './terminal/Terminal'
import type { ViewId } from './terminal/Terminal'
import type { Toast, ToastKind } from './data/types'
import { clock, rSeverity } from './lib/format'
import { rFactor } from './lib/battle/rvalue'
import { clearRemount, registerRemount } from './lib/remount'
import { browserStore, chunkError, clearRetry, reloadFresh, takeRetryOnce } from './lib/chunkretry'
import { resetGuide } from './lib/guide'
import { bedForState, bedForView, installAudio, setAudio, setBed, stopBed, useAudioSettings } from './lib/audio'
import { subscribeUnread, totalUnread } from './lib/sms'
import { useProactiveSms } from './lib/smsauto'

import { Boot } from './Boot'
import { TitleMenu } from './views/Title'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Portrait, useCharImg } from './components/Portrait'
import { VariablePanel } from './components/VariablePanel'
import { SaveDialog } from './components/SaveDialog'
import { Guide } from './components/Guide'

import css from './App.module.css'

/* ============================================================
   重模块懒加载（拆主包）
   ------------------------------------------------------------
   十一个视图此前全是静态导入：首屏得先把 `Views/*.tsx` 一万两千行
   （Plot / Battle / Tavern / Archive 四块最沉）连同它们的数据表一起解析完，
   才画得出第一帧 —— 单块 4.3 MB 就是这么来的。改成动态导入之后，
   每个视图自己一个 chunk，**第一次真的走到那一页**才拉那一块。

   `Boot` 与 `TitleMenu` 不懒：它们是第一帧本身，懒了等于让开屏先闪一下空白。

   视图都是**具名导出**（`export function Plot()`），而 `lazy` 只认 `default`。
   与其回头给十一个视图各补一个 default export（拆包的活儿不该动视图自己的导出），
   不如在这儿垫一层薄薄的胶水 —— 就是下面这个 `view()`。 */
/* ---- 拉一块视图分块：失手自动重取一次（主人 2026-09-15）--------------
   头一次失败先原地再来一次 —— 多半是网络抖了一下，或那一块 CSS 的请求断在中途，
   重来一次就好了，主人这边**看不出发生过什么**。还不行就带 `?v=<时间戳>`
   整页换地址重来：页面缓存着上一版入口（那份 index 里记的分块名已经不在了）
   时，只有这一条路解得开。两趟都走过仍然失败，才抛给兜底那一屏。

   额度（**每一块**只自动重取一次，账记在块名上，见 `lib/chunkretry.ts` 开头那段）
   与换地址那一步都在 `lib/chunkretry.ts` 里，那儿是纯的，mech 拿内存桩直接验；
   这儿只管按顺序试。

   整页重来有一个代价，写在明处：`sessionAuthed` 是 `Terminal` 的模块变量
   （`terminal/Terminal.tsx:292`），冷启动必回 false —— 所以那一条路走完，
   主人回到的是**指纹开屏**那一屏，不是刚才那一页。这条只在「真·缓存错版」
   时才会走到；拿它换「不黑屏」，值。

   还有一处不走 `vite:preloadError` 的监听：那一手要 `preventDefault()` 把
   Vite 的异常吞掉，吞掉之后 import 会**装成成功**（拿到 `undefined`），
   反而绕开了下面这套重取。让它照常抛出来，这里接住，更直。 */
async function loadView<K extends string>(name: K, load: () => Promise<Record<K, ComponentType>>) {
  /* 取一次，并且当场把具名导出挑出来 ——「模块到手了但没有这个名」也算失败
     （Vite 那条预载被别的监听吞掉时会走到这儿），一样要重取，不能放它出去 */
  const pick = async (): Promise<ComponentType> => {
    const mod = await load()
    const comp = mod?.[name]
    if (!comp) throw new Error(`这一块里没有导出「${name}」`)
    return comp
  }
  try {
    const comp = await pick()
    clearRetry(browserStore, name)   // 成了 —— 销掉这一块的账，下一回撞上还能自动重取
    return comp
  } catch (e) {
    /* 账上写着这一块的名字，说明它整页重来过一趟了还是不行 —— 直接抛给兜底，
       绝不再换一次地址（不然主人会卡在「点一次、重载一次」的圈里，
       永远见不到兜底那一屏）。名字对不上才是新的一回。 */
    if (!takeRetryOnce(browserStore, name)) throw chunkError(name, e)
    try {
      await new Promise((r) => setTimeout(r, 320))   // 让开那一下抖动，别原样再撞一次
      const comp = await pick()
      clearRetry(browserStore, name)
      return comp
    } catch (e2) {
      reloadFresh()
      /* 页面正在把自己换掉。先挂在「正在接通模块…」上，别闪一下兜底 ——
         给换页 1.2 秒；真没换成（地址就是走不了）才把错摊出来。 */
      await new Promise((r) => setTimeout(r, 1200))
      throw chunkError(name, e2)
    }
  }
}

const view = <K extends string>(name: K, load: () => Promise<Record<K, ComponentType>>) =>
  lazy(async () => ({ default: await loadView(name, load) }))

const Dashboard = view('Dashboard', () => import('./views/Dashboard'))
const Plot = view('Plot', () => import('./views/Plot'))
const Saga = view('Saga', () => import('./views/Saga'))
const Memory = view('Memory', () => import('./views/Memory'))
const Lore = view('Lore', () => import('./views/Lore'))
const Arms = view('Arms', () => import('./views/Arms'))
const Archive = view('Archive', () => import('./views/Archive'))
const Missions = view('Missions', () => import('./views/Missions'))
const Codex = view('Codex', () => import('./views/Codex'))
const Tavern = view('Tavern', () => import('./views/Tavern'))
const Settings = view('Settings', () => import('./views/Settings'))

/* 等 chunk 的那几十毫秒里摆什么。`data-view-loading` 是给冒烟用的把手：
   导航那一枚 `goto()` 按完就以它为准等一次，「切过去了没」不必靠 sleep 猜。 */
function ViewLoading() {
  return <div className={css.viewLoading} data-view-loading>正在接通模块…</div>
}

const NAV: { id: ViewId; en: string; cn: string; icon: ReactNode }[] = [
  { id: 'dashboard', en: 'DASHBOARD', cn: '终端总览', icon: <Gauge size={21} weight="bold" /> },
  { id: 'plot', en: 'PLOT / STORY', cn: '剧情推进', icon: <Play size={21} weight="bold" /> },
  { id: 'saga', en: 'RECORD / TIMELINE', cn: '低语者日志', icon: <Scroll size={21} weight="bold" /> },
  { id: 'memory', en: 'MEMORY / SITUATIONAL', cn: '情景记忆库', icon: <Brain size={21} weight="bold" /> },
  { id: 'lore', en: 'THINK TANK', cn: '智库', icon: <Vault size={21} weight="bold" /> },
  { id: 'arms', en: 'ARMORY', cn: '武装图鉴', icon: <Sword size={21} weight="bold" /> },
  { id: 'archive', en: 'ARCHIVE', cn: '角色档案', icon: <Users size={21} weight="bold" /> },
  { id: 'missions', en: 'MISSIONS', cn: '任务简报', icon: <MapPin size={21} weight="bold" /> },
  { id: 'codex', en: 'CODEX', cn: '终末图鉴', icon: <BookOpen size={21} weight="bold" /> },
  { id: 'tavern', en: 'SMS / CHARACTER CHAT', cn: '短信', icon: <ChatDots size={21} weight="bold" /> },
  { id: 'settings', en: 'SYSTEM', cn: '终端设置', icon: <GearSix size={21} weight="bold" /> },
]

const TITLE: Record<ViewId, { en: string; cn: string }> = {
  dashboard: { en: 'TERMINAL / DASHBOARD', cn: '终端总览' },
  plot: { en: 'PLOT / STORY', cn: '剧情推进' },
  saga: { en: 'RECORD / WHISPERER LOG', cn: '低语者日志' },
  memory: { en: 'MEMORY / SITUATIONAL', cn: '情景记忆库' },
  lore: { en: 'DATA / THINK TANK', cn: '智库' },
  arms: { en: 'DATA / ARMORY', cn: '武装图鉴' },
  archive: { en: 'DATA / ARCHIVE', cn: '角色档案' },
  missions: { en: 'FIELD / MISSIONS', cn: '任务简报' },
  codex: { en: 'CODEX / ENDINGS', cn: '终末图鉴' },
  tavern: { en: 'SMS / CHARACTER CHAT', cn: '短信' },
  settings: { en: 'SYSTEM / SETTINGS', cn: '终端设置' },
}

const KIND_ICON: Record<ToastKind, ReactNode> = {
  info: <Info size={19} weight="fill" />,
  warn: <Warning size={19} weight="fill" />,
  danger: <Warning size={19} weight="fill" />,
  success: <Check size={19} weight="bold" />,
  decode: <Lightning size={19} weight="fill" />,
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={`${css.toast} ${css['toast--' + toast.kind]}`} role="status">
      <span className={css.toast__ic}>{KIND_ICON[toast.kind]}</span>
      <span className={css.toast__txt}>
        <b>{toast.title}</b>
        {toast.body && <span>{toast.body}</span>}
      </span>
      <button className={css.toast__x} onClick={onDismiss} aria-label="关闭通知">
        <X size={14} weight="bold" />
      </button>
    </div>
  )
}

function ToastHost() {
  const { toasts, dismiss } = useTerminal()
  return (
    <div className={css.toasts} aria-live="polite" data-guide="toasts">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function NavRail() {
  const { view, navigate, unlocked, operatorName, operatorTitle, setOperatorName, resetWorld, setVarsOpen, setSlotsOpen } = useTerminal()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(operatorName)
  const [confirmReset, setConfirmReset] = useState(false)
  /* 未读短信数：后台主动来信也会让它立刻亮起 */
  const unread = useSyncExternalStore(subscribeUnread, totalUnread)

  const commit = () => {
    const v = draft.trim()
    if (v) setOperatorName(v)
    setEditing(false)
  }

  const name = operatorName.trim() ? operatorName : '言万心叶'
  const avatarText = name.slice(0, 1).toUpperCase()
  /* 侧栏身份卡那一格：有立绘就摆他的胸像，没有才是「姓」的字块（缺图占位） */
  const opFace = useCharImg('operator', 'face')

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      window.setTimeout(() => setConfirmReset(false), 3600)
      return
    }
    resetWorld()
    resetGuide()   // 世界重置了，梅芙从头再讲一遍
    setConfirmReset(false)
  }

  return (
    <aside className={css.rail} data-guide="rail">
      <div className={css.brand}>
        <div className={css.brandMark}><span>終</span></div>
        <div className={css.brandText}>
          <b>终末停滞委员会</b>
          <i>STAGNATION COMMITTEE</i>
        </div>
      </div>

      <div className={css.nav} data-guide="nav">
        <div className={css.navLabel}>终端模块</div>
        {NAV.map((n, i) => {
          const locked = LOCKED_VIEWS.includes(n.id) && !unlocked
          return (
            <button
              key={n.id}
              className={`${css.navItem} ${view === n.id ? css.isActive : ''} ${locked ? css.isLocked : ''}`}
              data-guide={`nav-${n.id}`}
              onClick={() => navigate(n.id)}
              aria-current={view === n.id ? 'page' : undefined}
              title={locked ? '需完成事件「欢迎来到，终末停滞委员会」后解锁' : undefined}
            >
              <span className={css.navItem__icon}>{n.icon}</span>
              <span className={css.navItem__label}>
                <b>{n.cn}</b>
                <i>{locked ? 'LOCKED' : n.en}</i>
              </span>
              <span className={css.navItem__idx}>
                {locked ? <Lock size={13} weight="bold" /> : String(i + 1).padStart(2, '0')}
              </span>
              {n.id === 'tavern' && unread > 0 ? (
                <span className={css.navBadge} data-sms-unread={unread}>{unread > 99 ? '99+' : unread}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className={css.railFoot}>
        {editing ? (
          <div className={css.opCard} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <input
              autoFocus
              className="field"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              placeholder="输入你的代号"
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--amber" style={{ flex: 1, fontSize: 12 }} onClick={commit}>
                <Check size={13} weight="bold" /> 保存
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setEditing(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className={css.opCard} title={operatorTitle}>
            {opFace ? (
              <Portrait
                avatarId="operator"
                name={name}
                fit="cover"
                width={34}
                height={34}
                eager
                className={css.opAvatar}
                style={{ borderRadius: 0 }}
              />
            ) : (
              <div className={css.opAvatar}>{avatarText}</div>
            )}
            <div className={css.opMeta}>
              <b>{name}</b>
              <i>{operatorTitle}</i>
            </div>
            <button className={`btn btn--icon ${css.opGear}`} onClick={() => { setDraft(operatorName); setEditing(true) }} aria-label="修改代号">
              <PenNib size={14} weight="bold" />
            </button>
          </div>
        )}
        {/* 操作员卡与底下这三枚之间的一道细线：上面是「你是谁」，下面是「动这台机器」 */}
        <span className={css.footRule} />
        <button
          className="btn btn--ghost"
          style={{ width: '100%', fontSize: 11, padding: '7px 8px', clipPath: 'none' }}
          data-guide="slot"
          onClick={() => setSlotsOpen(true)}
          title="手动存档 / 读档（独立于当前进度，重置不影响）"
        >
          <FloppyDisk size={13} weight="bold" /> 存读档
        </button>
        <button
          className="btn btn--ghost"
          style={{ width: '100%', fontSize: 11, padding: '7px 8px', clipPath: 'none' }}
          data-guide="vars"
          onClick={() => setVarsOpen(true)}
          title="查看 / 编辑命名变量（AI 推演亦读写同一份）"
        >
          <SlidersHorizontal size={13} weight="bold" /> 查看 / 编辑变量
        </button>
        <button
          data-guide="reset"
          className={confirmReset ? 'btn btn--amber' : 'btn btn--ghost'}
          style={{ width: '100%', fontSize: 11, padding: '7px 8px', clipPath: 'none' }}
          onClick={handleReset}
        >
          {confirmReset ? '再次点击确认重置' : '重置世界进度'}
        </button>
      </div>
    </aside>
  )
}

function TopStatus({ view }: { view: ViewId }) {
  const { push, focusRegion: focus } = useTerminal()
  const [now, setNow] = useState(() => new Date())
  const sev = rSeverity(focus.r)
  /* 与总览的威胁条同一个判据：R 值偏离正常区间（两侧都算）即为异常。
     只看原定危险度会出现「横幅报警、顶栏写着本区观测平稳」两处口径打架。 */
  const fac = rFactor(focus.r)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const t = TITLE[view]
  return (
    <header className={css.topbar} data-guide="topbar">
      <span className={css.tbTitleSlash} />
      <span className={css.tbLeft}>
        <span className={css.tbTitleEn}>{t.en}</span>
        <span className={css.tbTitleCn}>{t.cn}</span>
      </span>
      <div className={css.tbRight}>
        <button className={css.pill} title="当前监测区域" onClick={() => push('info', '监测区域', `当前焦点：${focus.name} · ${focus.code}`, false)}>
          <span data-guide="region-pill" />区域&nbsp;<span className="muted tiny">{focus.code}</span>&nbsp;{focus.name.split(' · ').pop()}
        </button>
        <button className={css.pill} data-r-src={focus.src ?? 'table'} onClick={() => push('info', 'R 值实时读数', `${focus.name} R 值 ${focus.r.toFixed(3)}` + (focus.src === 'est' ? ' · 由该段现场危险度推算' : focus.src === 'canon' ? ` · ${focus.note}` : `（${focus.delta >= 0 ? '+' : ''}${focus.delta.toFixed(3)}）`), false)}>
          <span data-guide="r-pill" />R 值&nbsp;<span className={sev.cls} style={{ fontWeight: 800 }}>{focus.r.toFixed(3)}</span>
        </button>
        {fac.out > 0 ? (
          <button
            className={`${css.pill} ${css['pill--danger']}`}
            title={`${focus.name} R 值 ${focus.r.toFixed(3)} 偏出正常区间 ${fac.out.toFixed(3)}（${fac.kind === '低R' ? '现实偏薄' : '现实过厚'}）`}
            onClick={() => push('danger', `区域观测${sev.label}`, `${focus.name} R 值 ${focus.r.toFixed(3)}，${fac.kind === '低R' ? '现实偏薄' : '现实过厚'}，偏离正常区间 ${fac.out.toFixed(3)} · ${focus.note}`, false)}
          >
            <span className={css.pulseDot} />
            区域异常 · {sev.label}
          </button>
        ) : focus.threatStage > 0 ? (
          <button className={`${css.pill} ${css['pill--danger']}`} onClick={() => push('danger', '区域警戒确认', `观测危险度 STAGE ${focus.threatStage} · ${focus.note}`, false)}>
            <span className={css.pulseDot} />
            区域警戒 STAGE {focus.threatStage}
          </button>
        ) : (
          <button className={css.pill} title="本区观测平稳">
            <span className={css.pulseDot} style={{ background: 'var(--jade)', boxShadow: '0 0 8px var(--jade)' }} />
            本区观测平稳
          </button>
        )}
        {/* 两簇之间那一道细线：左边三格是**读数**（区域 / R 值 / 异常），
            右边三格是**机器**（时钟 / 信道 / 声音）。 */}
        <span className={css.tbDiv} />
        <button className={`${css.pill} ${css.clock}`} title="弗尔克图斯本地时间">
          <span className="num">{clock(now)}</span>
        </button>
        <button className={css.pill} title="停滞观测信道状态" onClick={() => push('decode', '观测信道稳定', '与停滞观测网 · 弗尔克图斯分区保持全双工连接', false)}>
          <Bell size={14} weight="bold" />
        </button>
        <AudioPill />
      </div>
    </header>
  )
}

/**
 * 顶栏上的静音钮。
 * 只动总开关，三个滑块的值原样留着 —— 再按一下原样回来。
 * 第一次按下同时就是解锁音频的那一下手势（浏览器不许没有手势就出声）。
 */
function AudioPill() {
  const a = useAudioSettings()
  const on = !a.muted && a.master > 0
  return (
    <button
      className={css.pill}
      data-audio-pill={on ? 'on' : 'off'}
      title={on ? '声音已开 · 点击静音' : '声音已静 · 点击开启'}
      onClick={() => setAudio({ muted: on })}
    >
      {on ? <SpeakerHigh size={14} weight="bold" /> : <SpeakerSlash size={14} weight="bold" />}
    </button>
  )
}

function Stage() {
  const { view } = useTerminal()
  const page = (() => {
    switch (view) {
      case 'dashboard': return <Dashboard />
      case 'plot': return <Plot />
      case 'saga': return <Saga />
      case 'memory': return <Memory />
      case 'lore': return <Lore />
      case 'arms': return <Arms />
      case 'archive': return <Archive />
      case 'missions': return <Missions />
      case 'codex': return <Codex />
      case 'tavern': return <Tavern />
      case 'settings': return <Settings />
    }
  })()
  /* 边界架在**切换过的那个视图**外面，不是整个主区：等 chunk 的时候
     侧边栏、顶栏、常驻的来信监听都还在，只有正文那一片在等。 */
  return <Suspense fallback={<ViewLoading />}>{page}</Suspense>
}

function Shell() {
  const { view, push, varsOpen, slotsOpen } = useTerminal()
  const booted = useRef(false)

  /* 主动来信：挂在常驻的 Shell 上 —— 观测者不在电话页也照常收到 */
  useProactiveSms()

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const t1 = window.setTimeout(() => {
      push('decode', '停滞观测信道已接通', '委员认证通过 · 言万心叶 · 潜力登记 Stage4『活性化』', false)
    }, 900)
    return () => { window.clearTimeout(t1) }
  }, [push])

  /* 换模块就换一段底：每个模块有自己的环境音 */
  useEffect(() => { setBed(bedForView(view)) }, [view])

  return (
    <div className={`${css.root} app--stage ${css.bootPop}`}>
      <NavRail />
      <div className={css.main}>
        <TopStatus view={view} />
        <main className={css.screen} data-guide="screen">
          <Stage />
        </main>
      </div>
      <ToastHost />
      <Guide />
      {varsOpen ? <VariablePanel /> : null}
      {slotsOpen ? <SaveDialog /> : null}
    </div>
  )
}

/** 标题「终端连接」进入的设置专用界面：只呈现终端设置一页（无侧边栏），顶部含返回标题按钮 */
function SetupShell() {
  const { exitSetup } = useTerminal()
  return (
    <div className={`${css.root} app--stage ${css.bootPop}`}>
      <div className={`${css.main} ${css.mainWide}`}>
        <header className={css.topbar}>
          <span className={css.tbTitleSlash} />
          <span className={css.tbTitleEn}>SETUP / CHANNEL</span>
          <span className={css.tbTitleCn}>终端连接 · 配置推演通道</span>
          <div className={css.tbRight}>
            <span className="muted tiny" style={{ letterSpacing: '0.06em' }}>仅此一页 · 侧边栏在进入终端后出现</span>
            <button className="btn btn--amber" style={{ fontSize: 12 }} onClick={exitSetup} title="返回标题菜单">
              <ArrowLeft size={14} weight="bold" /> 返回标题
            </button>
          </div>
        </header>
        <main className={css.screen}>
          {/* 设置这一页也在懒加载名单里（Shell 的侧边栏走的是同一个组件）——
              开屏这一路单独进它，所以这儿也得有一条边界 */}
          <Suspense fallback={<ViewLoading />}><Settings /></Suspense>
        </main>
      </div>
      <ToastHost />
    </div>
  )
}

function Gate() {
  const { authed, stage, setupMode, enter, view } = useTerminal()
  /*
    标题菜单与设置专用界面不在 Shell 里，底在这里补上；
    进了终端本体就照模块那一份（按 view 判，Shell 那边也一样）。
    「该放哪一段」由 bedForState 一处决定 —— 关键的一份是**指纹认证开屏**：
    「退出终端」之后那一段底必须停，否则界面关了、声音还在。
  */
  useEffect(() => {
    const want = bedForState({ authed, stage, setupMode, view })
    if (want === null) stopBed()
    else setBed(want)
  }, [authed, stage, setupMode, view])
  // 认证开屏 → 标题菜单 → 终端本体 / 设置专用界面（读档/重置经 key 重挂载后按阶段直达）
  if (!authed) return <Boot onDone={enter} />
  if (stage !== 'game') return <TitleMenu />
  if (setupMode) return <SetupShell />
  return <Shell />
}

/** 外层持有 nonce：读档 / 重置世界时经 requestRemount 全量重挂载 TerminalProvider */
function Root() {
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    registerRemount(() => setNonce((n) => n + 1))
    return clearRemount
  }, [])

  return (
    <TerminalProvider key={nonce}>
      <Gate />
    </TerminalProvider>
  )
}

export default function App() {
  // 音频全局接线：一次手势解锁 · 按钮统一音效 · 切后台自动压低
  useEffect(() => installAudio(), [])

  // 兜底放在最外层：任何一处渲染抛错都摊成可读的一屏，而不是黑屏
  return (
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  )
}
