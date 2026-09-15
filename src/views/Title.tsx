import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowClockwise, FolderOpen, Plug, Play, SignOut, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { canContinue, fmtSlotTime, readAutosave, readSlotsList } from '../lib/slots'
import { SlotGrid } from '../components/SlotGrid'

import css from './Title.module.css'

/**
 * 标题菜单（认证通过后、进游戏前）—— 2026-09-16 重排成**单列居中**的游戏标题页：
 *
 *   ┌ 左上：自动档条 [data-autosave-card]       右上：操作员胶囊 ● ┐
 *   │            ◆ 这里是，终末停滞委员会 ◆                        │
 *   │                ── 停滞观测终端 v4.2 ──                       │
 *   │                        ✦                                     │
 *   │              行动继续（渐变实心 · 首枚高亮）                  │
 *   │              行动开始 / 读取存档                              │
 *   │                        ✦                                     │
 *   │              终端连接 / 退出终端                              │
 *   └            底部：版本号 + 手动档计数                          ┘
 *
 * 上一版是「左菜单 270px + 右存档格」的两栏，底下压一条糖果斜纹警戒带；
 * 8 格手动档收进「读取存档」那枚按钮后面的浮层（`data-title-slots`）——
 * 格子本身还是 `<SlotGrid mode="load" />`，只是从正文挪到了一层幕布后面，
 * 每次开都重新读一遍 `readSlotsList()`，比常驻着一份陈的更准。
 *
 * **被冒烟逐字钉住、不许动的**（Phase J / L / Q）：
 *   · 根上的 `data-title="1"`；
 *   · `[data-autosave-card]` 容器 + 里面那枚 `trim() === '读取'` 的按钮；
 *   · 自动档条正文里的 `已收束 N 段`；
 *   · 四枚主名 `行动继续` / `行动开始` / `终端连接` / `退出终端`。
 * 浮层**不叫** `[data-savedialog]`（那是游戏内那一枚的把手，撞名会让 Phase J 抓到两个）。
 */
export function TitleMenu() {
  const { operatorName, resume, loadAutosave, startNew, enterSettings, exitToBoot } = useTerminal()

  const auto = useMemo(() => readAutosave(), [])
  const filled = useMemo(() => readSlotsList().filter((s) => s !== null).length, [])
  const canGo = canContinue()
  const displayOp = operatorName.trim() ? operatorName : '言万心叶'

  const [slotsOpen, setSlotsOpen] = useState(false)

  /* 开了浮层就把 Esc 收作「关」—— 幕布点一下也能关。 */
  useEffect(() => {
    if (!slotsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSlotsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slotsOpen])

  return (
    <div className={css.root} data-title="1">
      {/* 四角小件：左上自动档、右上操作员 —— 与开屏、终端外壳同一套语汇 */}
      <div className={css.corner}>
        <article className={css.autoCard} data-autosave-card>
          <span className={css.autoKicker}>AUTO SAVE · 自动存档</span>
          {auto ? (
            <span className={css.autoMain}>
              <b className={css.autoName}>{auto.name || '自动存档'}</b>
              <span className={css.autoMeta}>
                {fmtSlotTime(auto.savedAt)} · 已收束 {auto.records} 段
              </span>
            </span>
          ) : (
            <span className={css.autoMain}>
              <span className={css.autoMeta}>尚无自动存档 · 收束一个事件后自动写入</span>
            </span>
          )}
          <button
            className="btn btn--ghost"
            style={{ fontSize: 11, padding: '5px 11px' }}
            disabled={!auto}
            onClick={loadAutosave}
            title="以自动存档覆盖当前进度并进入终端"
          >
            读取
          </button>
        </article>

        <div className={css.cornerR}>
          <span className={css.opDot} />
          {displayOp}
        </div>
      </div>

      <div className={css.inner}>
        <header className={css.brand}>
          <span className={css.kicker}>STAGNATION COMMITTEE · OBSERVER TERMINAL</span>
          <h1>
            这里是，<em>终末停滞委员会</em>
          </h1>
          <span className={css.sub}>停滞观测终端 v4.2 · 委员制式配备</span>
          <span className={css.tag}>
            欢迎回来，<b>{displayOp}</b> · 停滞观测操作员
          </span>
          <span className={css.orn} aria-hidden="true">✦</span>
        </header>

        <nav className={css.menu} aria-label="终端菜单">
          <button className={`${css.menuBtn} ${css.menuPrimary}`} onClick={resume} disabled={!canGo}>
            <span className={css.ic}><ArrowClockwise size={17} weight="bold" /></span>
            <span className={css.menuTxt}>
              行动继续
              <i>
                {auto
                  ? `续接自动存档 · ${fmtSlotTime(auto.savedAt)} · ${auto.records} 条记录`
                  : canGo ? '延续已有观测进度' : '当前尚无进度，无法继续'}
              </i>
            </span>
          </button>

          <button className={css.menuBtn} onClick={startNew}>
            <span className={css.ic}><Play size={16} weight="bold" /></span>
            <span className={css.menuTxt}>
              行动开始
              <i>开启全新的观测记录（手动存档保留）</i>
            </span>
          </button>

          <button className={css.menuBtn} onClick={() => setSlotsOpen(true)}>
            <span className={css.ic}><FolderOpen size={16} weight="bold" /></span>
            <span className={css.menuTxt}>
              读取存档
              <i>手动档 {filled}/8 位 · 以某一档续接观测</i>
            </span>
          </button>

          <div className={css.menuRule} aria-hidden="true">✦</div>

          <button className={css.menuBtn} onClick={enterSettings}>
            <span className={css.ic}><Plug size={17} weight="bold" /></span>
            <span className={css.menuTxt}>
              终端连接
              <i>进入后直达终端设置 · 配置推演通道（密钥仅运行时录入，不落档案）</i>
            </span>
          </button>

          <button className={css.menuBtn} onClick={exitToBoot}>
            <span className={css.ic}><SignOut size={17} weight="bold" /></span>
            <span className={css.menuTxt}>
              退出终端
              <i>回到指纹认证开屏</i>
            </span>
          </button>
        </nav>

        <footer className={css.verse}>
          <span className={css.verLine}>停滞观测终端 v4.2</span>
          <span className={css.verNote}>
            手动档 <b>{filled}/8</b> 位 · 存档与自动档只落在本终端，不外传。
          </span>
        </footer>
      </div>

      {/* 8 格手动档浮层 —— 照 SaveDialog 的幕布 + 面板写法，把手另起一个 */}
      {slotsOpen
        ? createPortal(
            <div
              className={css.mask}
              data-title-slots="1"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setSlotsOpen(false)
              }}
            >
              <div className={css.panel} role="dialog" aria-modal="true" aria-label="读取存档">
                <div className={css.panelHead}>
                  <div>
                    <div className={css.panelKicker}>LOAD / MANUAL SLOTS</div>
                    <b className={css.panelTitle}>读取存档 · 手动槽 ×8</b>
                  </div>
                  <button
                    className={`btn btn--ghost ${css.panelX}`}
                    onClick={() => setSlotsOpen(false)}
                    aria-label="关闭读取存档"
                  >
                    <X size={16} weight="bold" />
                  </button>
                </div>
                <div className={css.panelBody}>
                  <div className={css.panelHint}>
                    按「读取」以该档续接观测 —— 会覆盖当前运行进度。
                    写档在终端内进行：左侧底部「存读档」可把当前进度写入任一槽。
                  </div>
                  <SlotGrid mode="load" />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
