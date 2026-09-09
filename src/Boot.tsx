import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Fingerprint } from '@phosphor-icons/react'

import { opFull } from './lib/operator'
import { readAutosave } from './lib/slots'
import css from './Boot.module.css'

/**
 * 开屏 = 终端开机流程:
 *  指纹认证页(长按扫描) → 认证通过 → 转入黑底开机自检(逐行打字)
 *  → 提示符就绪 → onDone():终端界面以「启动弹出」方式挂载进场。
 */
const SCAN_MS = 1500      // 指纹扫描时长
const BOOT_START = 140    // 自检首行延时
const BOOT_STEP = 230     // 每行间隔
const BOOT_READY_MS = 340 // 就绪行之后停留

const SELF_CHECK = [
  '停滞观测网 接入中 ……',
  '弗尔克图斯 · 第12区 观测分区 坐标标定 ……',
  '接入认证 ···· 言万心叶',
  '秘钥载入 · 终端解锁',
]
const READY_LINE = '停滞观测终端已启动 · 欢迎回来，言万心叶。'

type Phase = 'idle' | 'scan' | 'boot'

export function Boot({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)          // 0..100
  const [phase, setPhase] = useState<Phase>('idle')
  const [shown, setShown] = useState(0)                // 已打出的行数(含就绪行)
  const raf = useRef<number | null>(null)
  const startAt = useRef(0)
  const doneRef = useRef(false)
  const timers = useRef<number[]>([])

  /* 接入身份随存档进度变化：全新开始无存档 → 临时访问；有存档 → 该进度对应的学籍身份 */
  const identity = useMemo(() => {
    const auto = readAutosave()
    return opFull((auto?.snapshot?.epDone ?? {}) as Record<string, true>)
  }, [])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const begin = () => {
    if (phase !== 'idle' || doneRef.current) return
    setPhase('scan')
    startAt.current = performance.now()
    const step = (now: number) => {
      const el = now - startAt.current
      const pct = Math.min(100, (el / SCAN_MS) * 100)
      setProgress(pct)
      if (pct >= 100) {
        // 认证通过 → 终端开机自检
        setPhase('boot')
        doneRef.current = true
        const total = SELF_CHECK.length + 1
        for (let i = 1; i <= total; i++) {
          later(() => setShown(i), BOOT_START + i * BOOT_STEP)
        }
        later(onDone, BOOT_START + (total + 1) * BOOT_STEP + BOOT_READY_MS)
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }

  const abort = () => {
    if (phase !== 'scan' || doneRef.current) return
    setPhase('idle')
    setProgress(0)
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
  }

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  const scanning = phase === 'scan'
  const booting = phase === 'boot'

  const hint = scanning
    ? '正在读取指纹 …… 请不要松开'
    : booting
      ? ''
      : '长按指纹 · 完成认证'

  if (booting) {
    // —— 开机自检:纯黑终端,逐行打字 ——
    return (
      <div className={`${css.boot} ${css.isBoot}`} role="log" aria-label="终端启动中">
        <div className={css.term}>
          <div className={css.termHead}>
            <span>STAGNATION COMMITTEE · OBSERVER TERMINAL</span>
            <span className={css.termHeadRight}>VER 4.2 // 委员制式配备</span>
          </div>
          <div className={css.termLines}>
            {SELF_CHECK.slice(0, shown).map((ln) => (
              <div key={ln} className={css.line}>
                <b>&gt;</b>
                <span>{ln}</span>
                <em>OK</em>
              </div>
            ))}
            {shown > SELF_CHECK.length ? (
              <div className={`${css.line} ${css.ready}`}>
                <b>#</b>
                <span>{READY_LINE}</span>
                <em className={css.caret}>▊</em>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${css.boot} ${scanning ? css.isScanning : ''}`}
      role="dialog"
      aria-label="认证开屏"
    >
      <div className={css.bootInner}>
        <div className={css.bootKicker}>STAGNATION COMMITTEE · IDENTITY GATE</div>
        <h1 className={css.bootTitle}>
          这里是，<em>终末停滞委员会</em>
        </h1>
        <div className={css.bootSub}>—— 请认证信息 ——</div>
        <div className={css.bootBrand}>
          <b>{identity}</b> · 言万心叶
        </div>

        <button
          className={`${css.fp} ${scanning ? css.isScanning : ''}`}
          style={{ ['--p']: progress } as CSSProperties}
          onPointerDown={begin}
          onPointerUp={abort}
          onPointerLeave={abort}
          onPointerCancel={abort}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="长按指纹以完成认证"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              begin()
            }
          }}
          onKeyUp={abort}
        >
          <span className={css.fpRing} style={{ ['--p']: progress } as CSSProperties} />
          <span className={css.fpBeam} />
          <span className={css.fpIcon}>
            <Fingerprint size={60} weight="fill" />
          </span>
        </button>

        <div className={`${css.fpHint} ${scanning ? css.isLive : ''}`}>{hint}</div>
      </div>
    </div>
  )
}
