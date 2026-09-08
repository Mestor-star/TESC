import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { readAutosave } from '../lib/slots'
import { fmtSlotTime } from '../lib/slots'
import { SlotGrid } from './SlotGrid'

import css from './SaveDialog.module.css'

/** 游戏内「存读档」浮层：8 手动槽读写 + 自动档只读信息。 */
export function SaveDialog() {
  const { setSlotsOpen, push } = useTerminal()
  const autosave = readAutosave()

  const close = () => setSlotsOpen(false)

  return createPortal(
    <div
      className={css.mask}
      data-savedialog="1"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className={css.panel} role="dialog" aria-modal="true" aria-label="存读档">
        <div className={css.head}>
          <div>
            <div className={css.kicker}>SAVE / LOAD</div>
            <b className={css.title}>存读档 · 手动槽 ×8</b>
          </div>
          <div className={css.headActs}>
            <button
              className={`btn btn--ghost ${css.iconBtn}`}
              onClick={close}
              aria-label="关闭存读档"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className={css.body}>
          <div className={css.hint}>
            <b>手动存档独立于当前进度。</b>
            <span>
              读取会写入对应档的全部进度与会话；保存到已占用槽需行内二次确认。「重置世界进度」不会删除这些手动档。
            </span>
          </div>

          <div className={css.autoCard}>
            <span className={css.autoLabel}>自动存档</span>
            {autosave ? (
              <span className={css.autoTxt}>
                {fmtSlotTime(autosave.savedAt)} · {autosave.records} 条记录
                {autosave.snapshot.operatorName ? ` · ${autosave.snapshot.operatorName}` : ''}
              </span>
            ) : (
              <span className={`muted tiny`} style={{ color: 'var(--ink-faint)' }}>进入剧情推演后将自动生成</span>
            )}
            <span className={css.grow} />
            <button
              className="btn btn--ghost"
              style={{ fontSize: 11, padding: '6px 12px' }}
              onClick={() => push('info', '自动存档说明', '终端每有进度变化，1.5 秒后自动把当前运行镜像到自动档（仅本机，不入库）。', false)}
            >
              说明
            </button>
          </div>

          <SlotGrid mode="manage" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
