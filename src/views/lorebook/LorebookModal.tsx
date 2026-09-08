/* ============================================================
   词条库管理器（内嵌于剧情推进头部按钮，浮层式）
   ------------------------------------------------------------
   列表：启用开关 / 浏览编辑 / 新建 / 删除 / 导入(多选) / 导出单个库。
   编辑：词条关键词（每行一个）/ 内容 / 注记 / 顺序 / 常驻开关。
   文案与操作全部走中性词表（词条库 / 词条 / 启用 / 停用…），
   无 emoji、不用 alert/confirm，只用行内二次确认。
   ============================================================ */

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, Download, Plus, Trash, Upload, X } from '@phosphor-icons/react'

import type { Lorebook, LorebookEntry, SillyTavernLorebookExport } from '../../lib/tavernlike/types'
import type { MultiImportInput } from '../../lib/tavernlike/importer'
import { exportToJson } from '../../lib/tavernlike/importer'
import { createDefaultLorebook, createDefaultEntry, updateEntry, removeEntry, clampNumber } from '../../lib/tavernlike/editor-utils'
import * as store from '../../lib/lorestore'
import { useTerminal } from '../../terminal/Terminal'

import css from './LorebookModal.module.css'

interface LorebookModalProps {
  open: boolean
  onClose: () => void
}

/** 读取本地 .json 文件（可多选）为待导入对象；JSON 解析失败标 null */
function pickLorebookFiles(multiple: boolean): Promise<Array<{ fileName: string; json: unknown }>> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.multiple = multiple
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      const out: Array<{ fileName: string; json: unknown }> = []
      for (const f of files) {
        try {
          out.push({ fileName: f.name, json: JSON.parse(await f.text()) as unknown })
        } catch {
          out.push({ fileName: f.name, json: null })
        }
      }
      resolve(out)
    }
    input.click()
  })
}

function splitKeys(s: string): string[] {
  return s
    .split(/[\n,，]+/)
    .map((k) => k.trim())
    .filter(Boolean)
}

export function LorebookModal({ open, onClose }: LorebookModalProps) {
  const { push } = useTerminal()
  const [books, setBooks] = useState<Lorebook[]>([])
  const [active, setActive] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  /** 编辑目标：null=列表视图 */
  const [editBook, setEditBook] = useState<Lorebook | null>(null)
  const [editSel, setEditSel] = useState<string | null>(null)
  /** 新建库内联面板 */
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  /** 删除二次确认的库 id */
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [bs, ids] = await Promise.all([store.listAllBooks(), store.getActiveLorebookIds()])
      setBooks(bs)
      setActive(ids)
    } catch {
      /* IndexedDB 不可用时静默 */
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refresh()
    setEditBook(null)
    setEditSel(null)
    setCreating(false)
    setConfirmDel(null)
  }, [open, refresh])

  if (!open) return null

  const activeSet = new Set(active)

  /* —— 启用/停用 —— */
  const toggleBook = async (id: string, on: boolean) => {
    try {
      await store.setBookActive(id, on)
      const b = books.find((x) => x.id === id)
      push('info', on ? '已启用词条库' : '已停用词条库', on ? `「${b?.name ?? ''}」命中即注入词条。` : `「${b?.name ?? ''}」不再参与命中。`, false)
    } catch {
      push('danger', '操作失败', '词条库启用状态未能保存。', false)
    }
    void refresh()
  }

  /* —— 导入（多文件） —— */
  const doImport = async () => {
    if (busy) return
    const picked = await pickLorebookFiles(true)
    if (!picked.length) return
    const inputs: MultiImportInput[] = picked.map((p) => ({ fileName: p.fileName, json: p.json as SillyTavernLorebookExport }))
    setBusy(true)
    try {
      const results = await store.importStLorebookMulti(inputs)
      const ok = results.filter((r) => r.book)
      const bad = results.filter((r) => r.error)
      if (ok.length) push('success', '导入词条库', ok.map((r) => r.book?.name ?? '').filter(Boolean).join(' · '), false)
      if (bad.length) push('warn', '部分文件未识别', bad.map((r) => r.fileName).join('、'), false)
    } catch {
      push('danger', '导入失败', '读取文件时出错。', false)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  /* —— 导出单个库 —— */
  const doExport = (b: Lorebook) => {
    try {
      exportToJson(store.exportBookAsStJson(b), `${b.name || '词条库'}.json`)
      push('success', '已导出', `${b.name || '词条库'} · 词条库 JSON`, false)
    } catch {
      push('danger', '导出失败', '词条库导出未完成。', false)
    }
  }

  /* —— 新建库 —— */
  const doCreate = async () => {
    const n = newName.trim()
    if (!n) {
      push('warn', '名称不能为空', '请为新词条库填一个名字。', false)
      return
    }
    const lb = createDefaultLorebook(n)
    await store.saveBook(lb)
    setNewName('')
    setCreating(false)
    push('success', '已创建词条库', n, false)
    void refresh()
  }

  /* —— 删除库（行内二次确认） —— */
  const doDelete = async (id: string) => {
    const b = books.find((x) => x.id === id)
    if (confirmDel !== id) {
      setConfirmDel(id)
      return
    }
    setConfirmDel(null)
    try {
      await store.deleteBook(id)
      push('info', '已删除词条库', `${b?.name ?? ''}（若为内置种子，可在设置里清空后自动重建）`, false)
    } catch {
      push('danger', '删除失败', '词条库未能删除。', false)
    }
    void refresh()
  }

  /* —— 进入 / 退出编辑 —— */
  const openEditor = (b: Lorebook) => {
    setEditBook(b)
    setEditSel(null)
  }

  const saveEdit = async () => {
    if (!editBook) return
    const nm = editBook.name.trim()
    if (!nm) {
      push('warn', '名称不能为空', '保存前请为词条库填一个名字。', false)
      return
    }
    try {
      await store.saveBook(editBook)
      push('success', '已保存词条库', nm, false)
      setEditBook(null)
      setEditSel(null)
    } catch {
      push('danger', '保存失败', '词条库未能保存。', false)
    }
    void refresh()
  }

  const patchBook = (patch: Partial<Lorebook>) => setEditBook((b) => (b ? { ...b, ...patch } : b))
  const patchEntry = (entryId: string, patch: Partial<LorebookEntry>) =>
    setEditBook((b) => (b ? updateEntry(b, entryId, patch) : b))
  const addEntry = () =>
    setEditBook((b) => {
      if (!b) return b
      const e = createDefaultEntry()
      return { ...b, entries: [...b.entries, e], updatedAt: Date.now() }
    })
  const delEntry = (entryId: string) => setEditBook((b) => (b ? removeEntry(b, entryId) : b))

  /* ================= 列表视图 ================= */
  if (!editBook) {
    return (
      <div className={css.mask} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div className={css.panel} role="dialog" aria-modal="true" aria-label="词条库管理">
          <div className={css.head}>
            <div>
              <div className={css.kicker}>LOREFILE / MANAGER</div>
              <b className={css.title}>词条库</b>
            </div>
            <div className={css.headActs}>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => void doImport()} disabled={busy}>
                <Upload size={13} weight="bold" /> 导入
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setCreating(true)}>
                <Plus size={13} weight="bold" /> 新建
              </button>
              <button className={`btn btn--ghost ${css.iconBtn}`} onClick={onClose} aria-label="关闭">
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          {creating ? (
            <div className={css.createRow}>
              <input
                className="field"
                placeholder="新词条库名称…"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void doCreate() }
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
              />
              <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void doCreate()}>
                <Check size={13} weight="bold" /> 创建
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => { setCreating(false); setNewName('') }}>
                取消
              </button>
            </div>
          ) : null}

          <div className={css.body}>
            <div className={css.listHint}>
              <span className="muted tiny">命中规则：词条关键词出现在操作员/剧情叙述或短信里即注入。内置 5 库由 canon 数据生成，内容只读建议；可按需停用或删除。</span>
            </div>
            {books.length === 0 ? (
              <div className={css.empty}>
                <b>还没有词条库</b>
                <span>点「新建」从零建一个，或用「导入」读入外部 lorebook JSON。</span>
              </div>
            ) : (
              <div className={css.list}>
                {books.map((b) => {
                  const isOn = activeSet.has(b.id)
                  return (
                    <div key={b.id} className={css.row}>
                      <button
                        type="button"
                        className={`${css.toggle} ${isOn ? css.isOn : ''}`}
                        onClick={() => void toggleBook(b.id, !isOn)}
                        title={isOn ? '停用此库' : '启用此库'}
                      >
                        <span className={css.dot} />
                        {isOn ? '启用' : '停用'}
                      </button>
                      <div className={css.rowMain}>
                        <b>{b.name || '未命名词条库'}</b>
                        {b.description ? <span className="muted tiny">{b.description}</span> : null}
                      </div>
                      <span className={css.count}>{b.entries?.length ?? 0} 词条</span>
                      <div className={css.rowActs}>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => openEditor(b)}>
                          浏览 / 编辑
                        </button>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => doExport(b)} title="导出为词条库 JSON">
                          <Download size={12} weight="bold" />
                        </button>
                        <button
                          className={`btn ${confirmDel === b.id ? `${css.danger} btn--ghost` : 'btn--ghost'}`}
                          style={{ fontSize: 11, padding: '5px 9px' }}
                          onClick={() => void doDelete(b.id)}
                          onBlur={() => setConfirmDel(null)}
                        >
                          {confirmDel === b.id ? '确认删除' : <Trash size={12} weight="bold" />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={css.foot}>
            <span className="muted tiny">词条库数据与激活标记保存在本地（Dexie · zts-lore），不含任何接口密钥。</span>
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={onClose}>
              完成
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ================= 编辑视图 ================= */
  const selected = editSel ? editBook.entries.find((e) => e.id === editSel) : null

  return (
    <div className={css.mask} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${css.panel} ${css.wide}`} role="dialog" aria-modal="true" aria-label="词条库编辑">
        <div className={css.head}>
          <button className={`btn btn--ghost ${css.iconBtn}`} onClick={() => { setEditBook(null); setEditSel(null) }} aria-label="返回列表">
            <ArrowLeft size={16} weight="bold" />
          </button>
          <div style={{ minWidth: 0 }}>
            <div className={css.kicker}>LOREBOOK / EDIT</div>
            <input className={`${css.titleInput}`} value={editBook.name} onChange={(e) => patchBook({ name: e.target.value })} aria-label="词条库名称" />
          </div>
          <div className={css.headActs}>
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void saveEdit()}>
              <Check size={13} weight="bold" /> 保存
            </button>
            <button className={`btn btn--ghost ${css.iconBtn}`} onClick={() => { setEditBook(null); setEditSel(null) }} aria-label="关闭">
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className={css.editBody}>
          <aside className={css.entryList}>
            <div className={css.entryListHead}>
              <span className="muted tiny">词条（{editBook.entries.length}）</span>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={addEntry}>
                <Plus size={12} weight="bold" /> 新增词条
              </button>
            </div>
            <div className={css.entryRows}>
              {editBook.entries.length === 0 ? (
                <div className="muted tiny" style={{ padding: 10 }}>尚无词条。</div>
              ) : (
                editBook.entries.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`${css.entryRow} ${e.id === editSel ? css.isActive : ''}`}
                    onClick={() => setEditSel(e.id)}
                  >
                    <b>{e.comment || e.keys[0] || '(未命名词条)'}</b>
                    <span className="muted tiny">{e.keys.slice(0, 3).join(' / ')}{e.keys.length > 3 ? ' …' : ''}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className={css.form}>
            {!selected ? (
              <div className={css.formEmpty}>
                <b>选择或新增一个词条</b>
                <span>左侧点选词条以编辑关键词与内容；编辑后记得「保存」整个词条库。</span>
              </div>
            ) : (
              <>
                <div className={css.fieldRow}>
                  <label>关键词（每行一个，命中其一即注入）</label>
                  <textarea
                    className="field"
                    rows={3}
                    value={selected.keys.join('\n')}
                    onChange={(e) => patchEntry(selected.id, { keys: splitKeys(e.target.value) })}
                  />
                </div>
                <div className={css.fieldRow}>
                  <label>注记（列表里的短名，可留空）</label>
                  <input
                    className="field"
                    value={selected.comment ?? ''}
                    onChange={(e) => patchEntry(selected.id, { comment: e.target.value })}
                  />
                </div>
                <div className={css.fieldRow}>
                  <label>内容</label>
                  <textarea
                    className="field"
                    rows={9}
                    value={selected.content}
                    onChange={(e) => patchEntry(selected.id, { content: e.target.value })}
                  />
                </div>
                <div className={css.miniRow}>
                  <label>
                    顺序
                    <input
                      className={`field ${css.num}`}
                      type="number"
                      value={selected.order}
                      onChange={(e) => patchEntry(selected.id, { order: clampNumber(e.target.value, -100000, 100000, 100) })}
                    />
                  </label>
                  <label className={css.ck}>
                    <input
                      type="checkbox"
                      checked={selected.constant === true}
                      onChange={(e) => patchEntry(selected.id, { constant: e.target.checked })}
                    />
                    常驻（不按关键词，始终注入）
                  </label>
                  <button className="btn btn--ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => delEntry(selected.id)}>
                    <Trash size={12} weight="bold" /> 删除该词条
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
