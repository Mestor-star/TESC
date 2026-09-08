import { useState } from 'react'
import { Check, FloppyDisk, FolderOpen, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { fmtSlotTime, readSlotsList } from '../lib/slots'
import type { SaveSlot } from '../lib/slots'

import css from './SlotGrid.module.css'

/**
 * 8 槽存档网格。
 *  - mode='load'   标题菜单用：只读，点「读取此档」进游戏（读档即全量重挂载）；
 *  - mode='manage' 游戏内「存读档」用：读取 + 保存（占用槽覆盖需行内二次确认）。
 */
export function SlotGrid({ mode }: { mode: 'load' | 'manage' }) {
  const { loadSlot, saveSlot } = useTerminal()
  const [list, setList] = useState<(SaveSlot | null)[]>(readSlotsList)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [arm, setArm] = useState<number | null>(null)

  const refresh = () => setList(readSlotsList())

  const openEditor = (i: number) => {
    const existing = list[i]
    setDraft(existing ? existing.name : `手动档 · ${String(i + 1).padStart(2, '0')}`)
    setArm(null)
    setEditing(i)
  }

  const commitSave = (i: number) => {
    const ok = saveSlot(i, draft.trim())
    if (ok) refresh()
    setEditing(null)
    setArm(null)
  }

  const cancelEdit = () => {
    setEditing(null)
    setArm(null)
  }

  return (
    <div className={css.grid}>
      {list.map((slot, i) => {
        const idx = String(i + 1).padStart(2, '0')
        const isEdit = editing === i
        const isArm = arm === i
        const overwriting = isArm && !!slot
        return (
          <article key={i} className={`${css.card} ${slot ? css.filled : css.empty}`}>
            <header className={css.cardHead}>
              <span className={css.no}>SLOT {idx}</span>
              {slot ? (
                <span className={css.stamp}>
                  <span className="chip__dot" style={{ width: 6, height: 6 }} />
                  {slot.records} 记录
                </span>
              ) : (
                <span className="muted tiny" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>EMPTY</span>
              )}
            </header>

            {slot ? (
              <>
                <b className={css.name} title={slot.name}>{slot.name}</b>
                <span className={css.time}>{fmtSlotTime(slot.savedAt)} 保存</span>
                <span className={css.recLine}>
                  记录 <b>{slot.records}</b> 条 · 操作员 <b>{slot.snapshot.operatorName || '言万心叶'}</b>
                </span>
              </>
            ) : (
              <span className={css.emptyTxt}>
                {mode === 'load' ? '尚无存档，可从「行动继续」进入后再于游戏中存读档。' : '尚无存档。可把当前进度保存到这一槽。'}
              </span>
            )}

            {isEdit ? (
              <div className={css.editBox}>
                {overwriting ? <div className={css.overwrite}>将覆盖「{slot?.name}」的原进度</div> : null}
                <input
                  autoFocus
                  className="field"
                  value={draft}
                  maxLength={24}
                  placeholder="存档名称"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitSave(i)
                    else if (e.key === 'Escape') cancelEdit()
                  }}
                />
                <div className={css.editRow}>
                  <button
                    className={`btn ${overwriting ? 'btn--amber' : 'btn--primary'}`}
                    style={{ flex: 1, clipPath: 'none' }}
                    onClick={() => commitSave(i)}
                  >
                    <Check size={12} weight="bold" /> 保存
                  </button>
                  <button className="btn btn--ghost" style={{ clipPath: 'none' }} onClick={cancelEdit}>
                    <X size={12} weight="bold" /> 取消
                  </button>
                </div>
              </div>
            ) : (
              <div className={css.acts}>
                {slot ? (
                  <button
                    className="btn btn--ghost"
                    style={{ clipPath: 'none' }}
                    onClick={() => loadSlot(i)}
                    title="读取此档进入游戏"
                  >
                    <FolderOpen size={12} weight="bold" /> 读取
                  </button>
                ) : null}
                {mode === 'manage' ? (
                  isArm ? (
                    <button
                      className="btn btn--amber"
                      style={{ clipPath: 'none' }}
                      onClick={() => openEditor(i)}
                      title="覆盖已有存档需再次确认"
                    >
                      <FloppyDisk size={12} weight="bold" /> 再次确认覆盖
                    </button>
                  ) : (
                    <button
                      className="btn btn--ghost"
                      style={{ clipPath: 'none' }}
                      onClick={() => {
                        if (slot) setArm(i)
                        else openEditor(i)
                      }}
                      title={slot ? '覆盖该槽（需二次确认）' : '保存当前进度到此槽'}
                    >
                      <FloppyDisk size={12} weight="bold" /> {slot ? '覆盖保存' : '保存到此槽'}
                    </button>
                  )
                ) : null}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
