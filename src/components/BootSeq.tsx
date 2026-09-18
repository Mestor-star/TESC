import { useEffect, useRef, useState } from 'react'

import css from './BootSeq.module.css'

/**
 * 「接入序列」—— 在开始界面上点下**行动继续 / 行动开始 / 读取存档**之后、
 * 终端真正挂载之前跑的那一段：四行自检逐行显现 + 一条进度，末行落定再交还。
 *
 * 2026-09-16 搬的这一次，节拍与观感一个字没改，只换了两件事：
 *  ① 宿主从 `Boot`（原认证开屏）挪到 `components/BootSeq`；
 *  ② **位置**换了 —— 从「进开始界面**之前**」挪到「开始界面上按下去**之后**」。
 * 它现在是一层盖在开始界面上的浮层（`position: fixed` · z-index 300），
 * 跑完 `onDone()`，由调用方接着做真动作（起新档 / 续档 / 读档）。
 *
 * ⚠️ 计时这几支是**累加**的：`onDone` 必须晚于末行的落定时刻，
 * 改行数（`SELF_CHECK.length`）时那个 `total` 会自己跟着走，别把常数抄硬。
 * 四角小件的 `.corner/.chip` 与开场标题屏那套同源 —— 两边的 CSS 各持一份，
 * 改观感时两边一起看。
 */
const BOOT_START = 140    // 自检首行延时
const BOOT_STEP = 230     // 每行间隔
const BOOT_READY_MS = 340 // 就绪行之后停留

/* 自检这几行**逐条带自己那枚判定**（2026-09-16 主人点的）：
   前两行与末行是「机器在报读到哪儿」，判定一律 `OK`；中间那行是**对着人做的**
   —— 虹膜认证，它收尾那一下说的是「完成」而不是 OK。
   两条线分开，读起来才像一台终端真的在认人，而不是一串复读的标签。 */
const SELF_CHECK: { text: string; tag: string }[] = [
  { text: '停滞观测网 · 握手 ……', tag: 'OK' },
  { text: '观测分区 · 弗尔克图斯 第12区 · 标定 ……', tag: 'OK' },
  { text: '虹膜认证 ……', tag: '完成' },
  { text: '秘钥载入 · 终端解锁 ……', tag: 'OK' },
]
const READY_LINE = '停滞观测终端已启动 · 欢迎回来。'

export function BootSeq({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0)
  /* `onDone` 由调用方每次渲染新建，挂进依赖会把这一趟重跑一遍 ——
     所以要把它**扣在 ref 里**，让下面那个空依赖的 effect 够得着最新的那一份。
     ⚠️ 挡「只跑一趟」不许用 `useRef(false)` 那种开关：dev 的 StrictMode 会把
     effect 走两遍（装 → 清 → 再装），开关在第二遍进门时已经是真，
     effect 直接 return、一个 timer 都没重挂 —— 开场就停在接入序列不动，
     而生产构建不做这两遍，冒烟（build 产物）照样全绿。 */
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const total = SELF_CHECK.length + 1
    const timers: number[] = []
    for (let i = 1; i <= total; i++) {
      timers.push(window.setTimeout(() => setShown(i), BOOT_START + i * BOOT_STEP))
    }
    timers.push(
      window.setTimeout(() => onDoneRef.current(), BOOT_START + (total + 1) * BOOT_STEP + BOOT_READY_MS),
    )
    return () => timers.forEach((x) => window.clearTimeout(x))
  }, [])

  const total = SELF_CHECK.length + 1
  const pct = Math.min(100, Math.round((shown / total) * 100))

  return (
    <div className={css.boot} role="log" aria-label="接入序列" data-boot-seq="1">
      <div className={css.corner}>
        <span className={`${css.chip} ${css.chipTL}`}>
          <i className={css.chipDot} />接入序列
        </span>
        <span className={`${css.chip} ${css.chipBR}`}>OBSERVER TERMINAL</span>
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
            <div key={ln.text} className={css.line}>
              <b>&gt;</b>
              <span>{ln.text}</span>
              <em>{ln.tag}</em>
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
