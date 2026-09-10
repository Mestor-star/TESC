/* 管理预设 · 世界书调配（受控 pane）
   ------------------------------------------------------------------
   调的是**预设自己**的一份条目开关集，不是世界书。
   书上的 enabled 是书的笔迹；这里改的是「套用此预设时覆上去的滤网」。
   本 pane 只改内存中的 off，落盘与否由 PresetManager 决定。 */

import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import * as lore from '../lib/lorestore'
import { seedEntryOff, toggleEntryOff } from '../lib/schemes'
import type { Lorebook } from '../lib/tavernlike/types'
import css from './PresetManager.module.css'

interface Props {
  off: Record<string, string[]>
  onChange: (next: Record<string, string[]>) => void
}

/** 世界书页 → 该书的「关闭词条」集（供落基线用） */
const offIdsOf = (b: Lorebook) => b.entries.filter((e) => e.enabled === false).map((e) => e.id)

export default function LoreFilterPane({ off, onChange }: Props) {
  const [books, setBooks] = useState<Lorebook[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [selBook, setSelBook] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [bs, act] = await Promise.all([lore.listAllBooks(), lore.getActiveLorebookIds()])
      bs.sort((a, b) => Number(act.includes(b.id)) - Number(act.includes(a.id)) || a.name.localeCompare(b.name))
      setBooks(bs)
      setActiveIds(act)
      setSelBook(bs[0]?.id ?? null)
    })()
  }, [])

  const book = useMemo(() => books.find((b) => b.id === selBook) ?? null, [books, selBook])
  /** 该书是否已被本预设接管（接管 = 套用时整层覆盖） */
  const managed = !!selBook && !!off[selBook]
  const offCount = selBook ? (off[selBook]?.length ?? 0) : 0

  /** 翻转某条：若该书尚未被接管，先以书现状落基线，避免「一开整本」的意外覆盖 */
  const flip = (entryId: string, on: boolean) => {
    if (!book) return
    onChange(toggleEntryOff(seedEntryOff(off, book.id, offIdsOf(book)), book.id, entryId, on))
  }

  /** 整本批量：全开 = 滤网记为空（整层覆盖为全启用）；全关 = 记下全部条目 */
  const setAll = (on: boolean) => {
    if (!book) return
    const next = { ...off }
    if (on) delete next[book.id]
    else next[book.id] = book.entries.map((e) => e.id)
    onChange(next)
  }

  /** 取消接管：该书恢复「本预设不管它」 */
  const release = () => {
    if (!book) return
    const next = { ...off }
    delete next[book.id]
    onChange(next)
  }

  return (
    <>
      <div className={css.colList}>
        <div className={css.colHead}>
          <span className="muted tiny">世界书（已激活者在前）</span>
        </div>
        <div className={css.rows}>
          {books.map((b) => {
            const n = off[b.id]?.length ?? 0
            return (
              <button
                key={b.id}
                type="button"
                className={`${css.bookRow} ${b.id === selBook ? css.isActive : ''}`}
                onClick={() => setSelBook(b.id)}
              >
                <b>{b.name}</b>
                <span className={css.bookMeta}>
                  {activeIds.includes(b.id) && <span className={css.tagOn}>● 激活</span>}
                  {off[b.id] && <span className={css.tagManaged}>◈ 已接管</span>}
                  {n > 0 && <span className={css.tagOff}>−{n}</span>}
                  <span>{b.entries.length} 条</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={css.pane} style={{ padding: 0, gap: 0 }}>
        <div className={css.colHead}>
          <span className="muted tiny">
            {book ? (
              managed
                ? <>本预设接管中 · 关闭 <span className={css.tagOff}>{offCount}</span> / {book.entries.length} 条</>
                : <>未接管 · 套用时保持书上的原样</>
            ) : '—'}
          </span>
          {book && (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 9px' }} onClick={() => setAll(true)}>全开</button>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 9px' }} onClick={() => setAll(false)}>全关</button>
              {managed && (
                <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 9px' }} onClick={release} title="取消接管：套用本预设时不再动这本书">
                  解除接管
                </button>
              )}
            </span>
          )}
        </div>

        <div className={css.rows} style={{ padding: '8px 10px' }}>
          {!book ? (
            <div className={css.empty}>左列选择一本书。</div>
          ) : book.entries.length === 0 ? (
            <div className={css.empty}>这本书还没有词条。</div>
          ) : (
            book.entries.map((e) => {
              const dead = managed && (off[book.id]?.includes(e.id) ?? false)
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`${css.entryRow} ${dead ? css.isOff : ''}`}
                  title={dead ? '本预设下关闭 · 点此启用' : '本预设下启用 · 点此关闭'}
                  onClick={() => flip(e.id, dead)}
                >
                  <b>{e.comment || e.keys[0] || '(未命名词条)'}</b>
                  <span className={css.entryKeys}>{e.keys.slice(0, 4).join(' / ')}{e.keys.length > 4 ? ' …' : ''}</span>
                  <span className={css.entrySw}>
                    {dead ? <EyeSlash size={13} /> : <Eye size={13} />}
                    {dead ? '关闭' : '启用'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
