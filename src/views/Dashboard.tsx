/**
 * 终端主页 —— 一屏只有三样东西：人、影子、右手的五个动作。
 *
 * 立绘裁到半身（只露到头到腰），下缘一道渐隐。
 * 右侧动作不是一排按钮：它们全部锚在同一个点上，指针靠近才散开（位移 + 缩放 + 去模糊，
 * 逐项延迟），离开 280ms 收回去 —— 打开方式照主人给的参考稿，外观仍走本仓的浅色终端。
 *
 * 立绘不是换人键：指针移上去，她说一句自己的话；点一下，再说下一句。
 * 话取自人物卡与档案里的原文台词，各人有各人的口吻。换人走左下角那一枚。
 * 操作员本人不上看板 —— 他要说话，去剧情里说。
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { PERSON_IDS, personOf } from '../data/castmeta'
import { HUB_LINES } from '../data/hubquotes'
import { useTerminal } from '../terminal/Terminal'
import { useCharImg } from '../components/Portrait'
import css from './Dashboard.module.css'

const HUB_KEY = 'zts-hub-portrait:v1'
const HOLD_MS = 4800

interface HubAction {
  go: 'plot' | 'research' | 'archive' | 'missions' | 'tavern'
  no: string
  zh: string
  en: string
  /** 散开时相对锚点的位移（vw / vh），数值照参考稿的比例 */
  tx: string
  ty: string
}

const ACTIONS: HubAction[] = [
  { go: 'plot', no: '01', zh: '出击', en: 'SORTIE', tx: '0vw', ty: '0vh' },
  { go: 'research', no: '02', zh: '研究', en: 'RESEARCH', tx: '-6vw', ty: '-17vh' },
  { go: 'archive', no: '03', zh: '角色', en: 'ARCHIVE', tx: '-10vw', ty: '-5vh' },
  { go: 'missions', no: '04', zh: '任务', en: 'MISSIONS', tx: '-9vw', ty: '7vh' },
  { go: 'tavern', no: '05', zh: '短信', en: 'MESSAGES', tx: '-5vw', ty: '18vh' },
]

function readPick(): string {
  try { return localStorage.getItem(HUB_KEY) ?? '' } catch { return '' }
}

export function Dashboard() {
  const { navigate, isMet } = useTerminal()

  /* 立绘池：魔王先站（第一段就同船登场），随后是已经遇见的人。操作员不进池。 */
  const pool = useMemo(() => {
    const met = PERSON_IDS.filter((id) => isMet(id) && id !== 'kuro-no-maou')
    return ['kuro-no-maou', ...met]
  }, [isMet])

  const [pick, setPick] = useState<string>(() => readPick())
  const idx = Math.max(0, pool.indexOf(pick))
  const cur = pool[idx] ?? pool[0]
  const person = personOf(cur)
  const name = person?.name ?? cur
  const sigil = person?.sigil ?? cur.slice(0, 1)
  const hue = person?.hue ?? 'var(--steel)'
  const avatarId = person?.avatarId ?? cur
  const shot = useCharImg(avatarId, 'full')
  /* 半身位用去了白底的裁切版（public/charimg/cut/*.webp）；没有就退回原图，再没有走纹章 */
  const [cutFail, setCutFail] = useState(false)
  useEffect(() => { setCutFail(false) }, [cur])
  const cutUrl = import.meta.env.BASE_URL + 'charimg/cut/' + avatarId + '.webp'
  const src = shot ? (cutFail ? shot : cutUrl) : null

  const cycle = () => {
    const next = pool[(idx + 1) % pool.length] ?? cur
    setPick(next)
    try { localStorage.setItem(HUB_KEY, next) } catch { /* 无痕模式记不住，这一趟照换 */ }
  }

  /* 立绘说话：悬停一句，点一下再说一句 */
  const lines = HUB_LINES[cur] ?? []
  /* 悬停从最短的一句起排，连续移上去会顺着往下换 —— 同一个人也不会只剩一句 */
  const hoverOrder = useMemo(() => [...lines].sort((a, b) => a.length - b.length), [lines])
  const [say, setSay] = useState<{ text: string; key: number } | null>(null)
  const [pokeIdx, setPokeIdx] = useState(1)
  const hoverIdx = useRef(0)
  const sayKey = useRef(0)
  const sayTimer = useRef<number | null>(null)
  const holdUntil = useRef(0)
  useEffect(() => {
    setSay(null)
    setPokeIdx(1)
    hoverIdx.current = 0
    holdUntil.current = 0
    if (sayTimer.current) { window.clearTimeout(sayTimer.current); sayTimer.current = null }
  }, [cur])
  useEffect(() => () => { if (sayTimer.current) window.clearTimeout(sayTimer.current) }, [])

  const showSay = (text: string, hold = 0) => {
    sayKey.current += 1
    setSay({ text, key: sayKey.current })
    if (sayTimer.current) { window.clearTimeout(sayTimer.current); sayTimer.current = null }
    if (hold) {
      holdUntil.current = Date.now() + hold
      sayTimer.current = window.setTimeout(() => setSay(null), hold)
    } else {
      holdUntil.current = 0
    }
  }

  const enterPortrait = () => {
    if (!hoverOrder.length) { showSay('……'); return }
    showSay(hoverOrder[hoverIdx.current % hoverOrder.length])
    hoverIdx.current += 1
  }

  const leavePortrait = () => {
    if (Date.now() < holdUntil.current) return
    if (sayTimer.current) window.clearTimeout(sayTimer.current)
    sayTimer.current = window.setTimeout(() => setSay(null), 220)
  }

  const speak = () => {
    if (!lines.length) { showSay('……', 1800); return }
    let i = pokeIdx % lines.length
    if (lines.length > 1 && lines[i] === say?.text) i = (i + 1) % lines.length
    setPokeIdx(i + 1)
    showSay(lines[i], HOLD_MS)
  }

  /* 右侧动作簇：指针进来散开，离开 280ms 收回 */
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])

  const enter = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpen(true)
  }
  const leave = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => { setOpen(false); setHover(null) }, 280)
  }

  const ghost = ACTIONS.find((a) => a.go === hover)?.en ?? 'SORTIE'

  return (
    <section className={css.stage} data-hub>
      <span className={css.ghost} aria-hidden="true">{ghost}</span>

      <div className={css.figure}>
        <button
          type="button"
          className={css.portrait}
          onClick={speak}
          onPointerEnter={enterPortrait}
          onPointerLeave={leavePortrait}
          onFocus={enterPortrait}
          onBlur={leavePortrait}
          data-hub-portrait
          aria-label={'当前看板 · ' + name + '（点一下听一句）'}
          title={name}
        >
          {src ? (
            <img className={css.shot} src={src} alt="" draggable={false} onError={() => setCutFail(true)} />
          ) : (
            <span className={css.sigil} style={{ color: hue }}>{sigil}</span>
          )}
        </button>
      </div>

      {say ? (
        <div className={css.say} data-hub-say aria-live="polite" key={say.key}>
          <b className={css.sayName}>{name}</b>
          <span className={css.sayText}>{say.text}</span>
        </div>
      ) : null}

      <button type="button" className={css.plate} onClick={cycle} data-hub-cycle aria-label={'换一位立绘 · 当前 ' + name} title="换一位">
        <span className={css.no}>{String(idx + 1).padStart(2, '0')} / {String(pool.length).padStart(2, '0')}</span>
        <b data-hub-name>{name}</b>
        <i className={css.next} aria-hidden="true">›</i>
      </button>

      <nav
        className={css.cluster + (open ? ' ' + css.clusterOpen : '')}
        aria-label="终端动作"
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocusCapture={enter}
        onBlurCapture={leave}
      >
        {ACTIONS.map((a) => (
          <button
            key={a.go}
            type="button"
            className={css.action + (a.go === 'plot' ? ' ' + css.prime : '') + (hover === a.go ? ' ' + css.hot : '')}
            style={{ '--tx': open || a.go === 'plot' ? a.tx : '0vw', '--ty': open || a.go === 'plot' ? a.ty : '0vh' } as React.CSSProperties}
            data-hub-action={a.go}
            onPointerEnter={() => setHover(a.go)}
            onFocus={() => setHover(a.go)}
            onClick={() => navigate(a.go, a.go === 'missions' ? 'open' : undefined)}
          >
            <span className={css.num}>{a.no}</span>
            <span className={css.zh}>{a.zh}</span>
            <span className={css.en}>{a.en}</span>
          </button>
        ))}
      </nav>
    </section>
  )
}
