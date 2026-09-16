import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowClockwise, FolderOpen, Plug, Play, SignOut, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { canContinue, fmtSlotTime, readAutosave, readSlotsList } from '../lib/slots'
import { SlotGrid } from '../components/SlotGrid'
import { BootSeq } from '../components/BootSeq'
import { TitleCard } from '../components/TitleCard'

import css from './Title.module.css'

/**
 * 标题菜单（认证通过后、进游戏前）—— 2026-09-16 重排成**单列居中**的游戏标题页：
 *
 *   ┌ 左上：自动档条 [data-autosave-card]       右上：操作员胶囊 ● ┐
 *   │      ┌ 官方 PV 那张标题卡（こちら、／終末停滞／委員会。）┐     │
 *   │      │        + TIME IS THE END / STAGNATION COMMITTEE. │     │
 *   │      └ 淡灰格纸 · 白方贴 · 品红大字 · 逐帧复刻的入场 ────┘     │
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
 * **进终端之前要过一趟「接入序列」**（2026-09-16）。那一段原来长在认证开屏里
 * （指纹认完就自检），现在挪到这儿 —— 按下去的**那一下之后**才开始：
 * 行动继续 / 行动开始 / 自动档「读取」/ 手动档「读取」四条都先起 `BootSeq`，
 * 它跑完再执行真动作。所以这一屏多了一枚 `pending` 状态，四处入口共用。
 * 没被 gate 的只有「终端连接」—— 它进的是设置专用界面，不是终端本体。
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

  /* 进终端之前那一趟「接入序列」。存的是**动作本身**，不是布尔的旗子 ——
     跑完照着它执行，动作与入口天然对得上，不必再拿一串 if 去认是谁按的。
     包一层对象是为了绕开 `setState(fn)` 的更新器语义：直接存函数会被 React
     当成 updater 调掉，存进去的就成了它的**返回值**。 */
  const [pending, setPending] = useState<{ run: () => void } | null>(null)
  const gate = (run: () => void) => setPending({ run })

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
            onClick={() => gate(loadAutosave)}
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
          {/* —— 标题：**官方 PV 收尾那张卡**（2026-09-16）——
              主人要「开始界面这行标题和 PV 里那张完全一样，还要一样动起来」。
              那份卡现在只有一处 —— `components/TitleCard`，开场标题屏（`Boot`）
              用的是同一份：PV 放完停的那张脸，与这一屏是同一张。
              取色、逐段尺寸、以及「为什么它自带底色」都在那个模块的头上。 */}
          <TitleCard />
          <span className={css.sub}>停滞观测终端 v4.2 · 委员制式配备</span>
          <span className={css.tag}>
            欢迎回来，<b>{displayOp}</b> · 停滞观测操作员
          </span>
          <span className={css.orn} aria-hidden="true">✦</span>
        </header>

        <nav className={css.menu} aria-label="终端菜单">
          <button className={`${css.menuBtn} ${css.menuPrimary}`} onClick={() => gate(resume)} disabled={!canGo}>
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

          <button className={css.menuBtn} onClick={() => gate(startNew)}>
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
              <i>回到开场标题屏</i>
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
                  <SlotGrid mode="load" beforeLoad={gate} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* 接入序列 —— 按下去之后、真动作之前的那一趟。它是 `position: fixed`
          · z-index 300，压得住上面那层存档幕布（130），所以读档那条路也在它底下走。 */}
      {pending ? (
        <BootSeq
          onDone={() => {
            const { run } = pending
            setPending(null)
            run()
          }}
        />
      ) : null}
    </div>
  )
}
