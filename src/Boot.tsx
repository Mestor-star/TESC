import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Fingerprint } from '@phosphor-icons/react'

import { opFull } from './lib/operator'
import { readAutosave } from './lib/slots'
import css from './Boot.module.css'

/**
 * 开屏 = 终端开机流程（2026-09-16 改成「游戏启动」那一路的语汇）:
 *  认证页（长按指纹核心） → 认证通过 → 接入序列（逐行显现 + 进度条）
 *  → 提示符就绪 → onDone():终端界面以「启动弹出」方式挂载进场。
 *
 * 语汇与外壳、标题页同一套：四角小件、菱形夹标题、细线夹副标、✦ 装饰。
 * **两处不能动**：`aria-label="认证开屏"` 与 `aria-label="长按指纹以完成认证"` ——
 * 冒烟 `boot()` 与 Phase J / L / Q 全按这两个把手找这一屏。
 * 长按那套手势（`onPointerDown/Up/Leave/Cancel` 与 `--p` 进度环）同样一字不动。
 */
const SCAN_MS = 1500      // 指纹扫描时长
const BOOT_START = 140    // 自检首行延时
const BOOT_STEP = 230     // 每行间隔
const BOOT_READY_MS = 340 // 就绪行之后停留

const SELF_CHECK = [
  '停滞观测网 · 握手 ……',
  '观测分区 · 弗尔克图斯 第12区 标定 ……',
  '委员身份校验 ···· 言万心叶',
  '秘钥载入 · 终端解锁 ……',
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
        // 认证通过 → 接入序列
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
    ? '正在校验 ···· 请不要松开'
    : booting
      ? ''
      : '长按核心 · 接入观测网'

  if (booting) {
    // —— 接入序列：逐行显现 + 一条进度（不再是「黑终端里刷日志」）——
    const total = SELF_CHECK.length + 1
    const pct = Math.min(100, Math.round((shown / total) * 100))
    return (
      <div className={`${css.boot} ${css.isBoot}`} role="log" aria-label="终端启动中">
        <div className={css.corner}>
          <span className={`${css.chip} ${css.chipTL}`}>
            <i className={css.chipDot} />接入序列
          </span>
          <span className={`${css.chip} ${css.chipTR}`}>OBSERVER TERMINAL</span>
        </div>

        <div className={css.seq}>
          <div className={css.seqKicker}>
            <span>STAGNATION COMMITTEE</span>
          </div>
          <h2 className={css.seqTitle}>接入序列</h2>
          <div className={css.seqMeter} role="presentation">
            <span style={{ width: `${pct}%` }} />
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
      {/* 四角小件 —— 与标题页同一种：开机的时候屏幕上先摆好框 */}
      <div className={css.corner}>
        <span className={`${css.chip} ${css.chipTL}`}>
          <i className={css.chipDot} />身份认证
        </span>
        <span className={`${css.chip} ${css.chipTR}`}>VER 4.2</span>
        <span className={`${css.chip} ${css.chipBL}`}>弗尔克图斯 · 第 12 区</span>
        <span className={`${css.chip} ${css.chipBR}`}>委员制式配备</span>
      </div>

      <div className={css.bootInner}>
        <div className={css.bootKicker}>STAGNATION COMMITTEE</div>
        <h1 className={css.bootTitle}>
          这里是，<em>终末停滞委员会</em>
        </h1>
        <div className={css.bootSub}>停滞观测终端</div>
        <div className={css.bootTag}>观测 · 记录 · 压制 · 善后 —— 全部从这一台走</div>
        <div className={css.orn}>✦</div>

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
        <div className={css.bootBrand}>
          <b>{identity}</b> · 言万心叶
        </div>
      </div>
    </div>
  )
}
