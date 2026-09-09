import { useMemo } from 'react'
import { ArrowClockwise, Plug, Play, SignOut } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { canContinue, fmtSlotTime, readAutosave, readSlotsList } from '../lib/slots'
import { SlotGrid } from '../components/SlotGrid'

import css from './Title.module.css'

/**
 * 标题菜单（认证通过后、进游戏前）：
 *  行动继续 / 行动开始 / 终端连接 / 退出终端
 *  + 8 个手动存档位（读取即进游戏）。
 * 首次冷启动：Boot 指纹认证 → 本页 → 选择后进游戏；同会话读档重挂载直接越过本页。
 */
export function TitleMenu() {
  const { operatorName, resume, startNew, enterSettings, exitToBoot } = useTerminal()

  const auto = useMemo(() => readAutosave(), [])
  const filled = useMemo(() => readSlotsList().filter((s) => s !== null).length, [])
  const canGo = canContinue()
  const displayOp = operatorName.trim() ? operatorName : '言万心叶'

  return (
    <div className={css.root} data-title="1">
      <div className={css.inner}>
        <header className={css.brand}>
          <span className={css.kicker}>STAGNATION COMMITTEE · OBSERVER TERMINAL</span>
          <h1>
            这里是，<em>终末停滞委员会</em>
          </h1>
          <span className={css.sub}>停滞观测终端 v4.2 · 委员制式配备</span>
          <span className={css.op}>
            欢迎回来，<b>{displayOp}</b> · 停滞观测操作员
          </span>
        </header>

        <div className={css.cols}>
          {/* 左栏：动作菜单 */}
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

            <button className={css.menuBtn} onClick={enterSettings}>
              <span className={css.ic}><Plug size={17} weight="bold" /></span>
              <span className={css.menuTxt}>
                终端连接
                <i>进入后直达终端设置 · 配置推演通道（密钥仅本机运行时录入）</i>
              </span>
            </button>

            <button className={css.menuBtn} onClick={exitToBoot}>
              <span className={css.ic}><SignOut size={17} weight="bold" /></span>
              <span className={css.menuTxt}>
                退出终端
                <i>回到指纹认证开屏</i>
              </span>
            </button>

            <div className={css.menuFoot}>
              手动档 <b>{filled}/8</b> 位 · 存档与自动档均只存于本机浏览器，不入库、不上传。
            </div>
          </nav>

          {/* 右栏：手动存档位 */}
          <section className={css.slots}>
            <div className={css.slotsHead}>
              <b className={css.slotsTitle}>手动存档位</b>
              <span className="muted">{filled}/8 USED</span>
            </div>
            <SlotGrid mode="load" />
            <div className={css.slotsNote}>
              点「读取」载入对应档并进入游戏。存档与写档在游戏内进行：终端左侧底部「存读档」可把当前进度保存到任一槽。
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
