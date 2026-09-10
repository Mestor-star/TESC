import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Gauge, Users, MapPin, BookOpen, Scroll, Vault, Lock, Bell, X, Info, Warning, Check, Lightning, PenNib, Sword, ChatDots, GearSix, Play, SlidersHorizontal, FloppyDisk, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'

import { TerminalProvider, useTerminal, LOCKED_VIEWS } from './terminal/Terminal'
import type { ViewId } from './terminal/Terminal'
import type { Toast, ToastKind } from './data/types'
import { clock, rSeverity } from './lib/format'
import { clearRemount, registerRemount } from './lib/remount'
import { resetGuide } from './lib/guide'
import { bedForView, installAudio, setAudio, setBed, useAudioSettings } from './lib/audio'
import { subscribeUnread, totalUnread } from './lib/sms'
import { useProactiveSms } from './lib/smsauto'

import { Boot } from './Boot'
import { TitleMenu } from './views/Title'
import { Dashboard } from './views/Dashboard'
import { Saga } from './views/Saga'
import { Lore } from './views/Lore'
import { Arms } from './views/Arms'
import { Archive } from './views/Archive'
import { Missions } from './views/Missions'
import { Codex } from './views/Codex'
import { Tavern } from './views/Tavern'
import { Plot } from './views/Plot'
import { Settings } from './views/Settings'
import { ErrorBoundary } from './components/ErrorBoundary'
import { VariablePanel } from './components/VariablePanel'
import { SaveDialog } from './components/SaveDialog'
import { Guide } from './components/Guide'

import css from './App.module.css'

const NAV: { id: ViewId; en: string; cn: string; icon: ReactNode }[] = [
  { id: 'dashboard', en: 'DASHBOARD', cn: '终端总览', icon: <Gauge size={21} weight="bold" /> },
  { id: 'plot', en: 'PLOT / STORY', cn: '剧情推进', icon: <Play size={21} weight="bold" /> },
  { id: 'saga', en: 'RECORD / TIMELINE', cn: '低语者日志', icon: <Scroll size={21} weight="bold" /> },
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
        <div className={css.brandMark}>終</div>
        <div className={css.brandText}>
          <b>终末停滞委员会</b>
          <i>STAGNATION COMMITTEE</i>
        </div>
      </div>

      <div className={css.nav} data-guide="nav">
        <div className={css.navLabel}>Main System</div>
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
            <div className={css.opAvatar}>{avatarText}</div>
            <div className={css.opMeta}>
              <b>{name}</b>
              <i>{operatorTitle}</i>
            </div>
            <button className={`btn btn--icon ${css.opGear}`} onClick={() => { setDraft(operatorName); setEditing(true) }} aria-label="修改代号">
              <PenNib size={14} weight="bold" />
            </button>
          </div>
        )}
        <button
          className="btn btn--ghost"
          style={{ width: '100%', marginTop: 8, fontSize: 11, padding: '7px 8px', clipPath: 'none' }}
          data-guide="slot"
          onClick={() => setSlotsOpen(true)}
          title="手动存档 / 读档（独立于当前进度，重置不影响）"
        >
          <FloppyDisk size={13} weight="bold" /> 存读档
        </button>
        <button
          className="btn btn--ghost"
          style={{ width: '100%', marginTop: 8, fontSize: 11, padding: '7px 8px', clipPath: 'none' }}
          data-guide="vars"
          onClick={() => setVarsOpen(true)}
          title="查看 / 编辑命名变量（AI 推演亦读写同一份）"
        >
          <SlidersHorizontal size={13} weight="bold" /> 查看 / 编辑变量
        </button>
        <button
          data-guide="reset"
          className={confirmReset ? 'btn btn--amber' : 'btn btn--ghost'}
          style={{ width: '100%', marginTop: 8, fontSize: 11, padding: '7px 8px', clipPath: 'none' }}
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
        <button className={css.pill} onClick={() => push('info', 'R 值实时读数', `${focus.name} R 值 ${focus.r.toFixed(3)}（${focus.delta >= 0 ? '+' : ''}${focus.delta.toFixed(3)}）`, false)}>
          <span data-guide="r-pill" />R 值&nbsp;<span className={sev.cls} style={{ fontWeight: 800 }}>{focus.r.toFixed(3)}</span>
        </button>
        {focus.threatStage > 0 ? (
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
  switch (view) {
    case 'dashboard': return <Dashboard />
    case 'plot': return <Plot />
    case 'saga': return <Saga />
    case 'lore': return <Lore />
    case 'arms': return <Arms />
    case 'archive': return <Archive />
    case 'missions': return <Missions />
    case 'codex': return <Codex />
    case 'tavern': return <Tavern />
    case 'settings': return <Settings />
  }
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
          <Settings />
        </main>
      </div>
      <ToastHost />
    </div>
  )
}

function Gate() {
  const { authed, stage, setupMode, enter } = useTerminal()
  // 标题菜单与设置专用界面不在 Shell 里，底在这里补上；
  // 进了终端本体就撒手 —— 那一段由 Shell 按当前模块决定
  useEffect(() => {
    if (authed && (stage !== 'game' || setupMode)) setBed('menu')
  }, [authed, stage, setupMode])
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
