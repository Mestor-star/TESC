/* ============================================================
   世界书管理器（双形态）
   ------------------------------------------------------------
   形态一  modal（缺省）  ：浮层式，由 剧情推进/智库 的按钮打开；
   形态二  embedded      ：作为智库页正文直接内嵌（整页自持管理）。
   功能共用：启用开关 / 浏览编辑 / 新建 / 删除 / 导入 / 导出，
   编辑：关键词（每行一）/ 内容 / 注记 / 顺序 / 常驻。
   中性词表、无 emoji、行内二次确认。
   ============================================================ */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft, Check, Download, Eye, EyeSlash, Plus, Trash, Upload, X } from '@phosphor-icons/react'

import type { Lorebook, LorebookEntry, SillyTavernLorebookExport } from '../../lib/tavernlike/types'
import type { MultiImportInput } from '../../lib/tavernlike/importer'
import { exportToJson } from '../../lib/tavernlike/importer'
import { createDefaultLorebook, createDefaultEntry, updateEntry, removeEntry, clampNumber } from '../../lib/tavernlike/editor-utils'
import * as store from '../../lib/lorestore'
import { useTerminal } from '../../terminal/Terminal'

import css from './LorebookModal.module.css'

interface LoreManagerProps {
  /** embedded=true：无遮罩/无浮层，直接作为页面正文的一整块 */
  embedded?: boolean
  /** modal 形态的显隐开关（embedded 时忽略） */
  open?: boolean
  /** 提供时才显示「完成 / ×」等关闭入口（modal 必备；embedded 可省） */
  onClose?: () => void
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

export function LoreManager({ embedded = false, open = true, onClose }: LoreManagerProps) {
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
    if (embedded) {
      void refresh()
      return
    }
    if (!open) return
    void refresh()
    setEditBook(null)
    setEditSel(null)
    setCreating(false)
    setConfirmDel(null)
  }, [embedded, open, refresh])

  if (!embedded && !open) return null

  const activeSet = new Set(active)

  /* —— 启用/停用 —— */
  const toggleBook = async (id: string, on: boolean) => {
    try {
      await store.setBookActive(id, on)
      const b = books.find((x) => x.id === id)
      push('info', on ? '已启用世界书' : '已停用世界书', on ? `「${b?.name ?? ''}」命中即注入词条。` : `「${b?.name ?? ''}」不再参与命中。`, false)
    } catch {
      push('danger', '操作失败', '世界书启用状态未能保存。', false)
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
      if (ok.length) push('success', '导入世界书', ok.map((r) => r.book?.name ?? '').filter(Boolean).join(' · '), false)
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
      exportToJson(store.exportBookAsStJson(b), `${b.name || '世界书'}.json`)
      push('success', '已导出', `${b.name || '世界书'} · 世界书 JSON`, false)
    } catch {
      push('danger', '导出失败', '世界书导出未完成。', false)
    }
  }

  /* —— 新建库 —— */
  const doCreate = async () => {
    const n = newName.trim()
    if (!n) {
      push('warn', '名称不能为空', '请为新世界书填一个名字。', false)
      return
    }
    const lb = createDefaultLorebook(n)
    await store.saveBook(lb)
    setNewName('')
    setCreating(false)
    push('success', '已创建世界书', n, false)
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
      push('info', '已删除世界书', `${b?.name ?? ''}（若为内置种子，可在设置里清空后自动重建）`, false)
    } catch {
      push('danger', '删除失败', '世界书未能删除。', false)
    }
    void refresh()
  }

  /* —— 进入 / 退出编辑 —— */
  const openEditor = (b: Lorebook) => {
    setEditBook(b)
    setEditSel(null)
  }
  const exitEditor = () => {
    setEditBook(null)
    setEditSel(null)
  }

  const saveEdit = async () => {
    if (!editBook) return
    const nm = editBook.name.trim()
    if (!nm) {
      push('warn', '名称不能为空', '保存前请为世界书填一个名字。', false)
      return
    }
    try {
      await store.saveBook(editBook)
      push('success', '已保存世界书', nm, false)
      exitEditor()
    } catch {
      push('danger', '保存失败', '世界书未能保存。', false)
    }
    void refresh()
  }

  const patchBook = (patch: Partial<Lorebook>) => setEditBook((b) => (b ? { ...b, ...patch } : b))
  const patchEntry = (entryId: string, patch: Partial<LorebookEntry>) =>
    setEditBook((b) => (b ? updateEntry(b, entryId, patch) : b))
  const addEntry = () => {
    const e = createDefaultEntry()
    setEditBook((b) => (b ? { ...b, entries: [...b.entries, e], updatedAt: Date.now() } : b))
    setEditSel(e.id)
  }
  const delEntry = (entryId: string) => setEditBook((b) => (b ? removeEntry(b, entryId) : b))
  /** 预设调配 · 整本批量开关：一键全开／全关本世界书内的词条 */
  const setAllEntries = (on: boolean) =>
    setEditBook((b) => (b ? { ...b, entries: b.entries.map((e) => ({ ...e, enabled: on })), updatedAt: Date.now() } : b))

  /* modal 形态：整页遮罩 + 居中面板；embedded：无遮罩，面板铺满可用宽度 */
  const panelStyle: CSSProperties = embedded
    ? { width: '100%', maxHeight: 'none', borderRadius: 0, border: 'none', boxShadow: 'none' }
    : {}

  const wrap = (node: ReactNode) =>
    embedded ? (
      <div data-loremanager="1">{node}</div>
    ) : (
      <div className={css.mask} onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}>
        {node}
      </div>
    )

  const listHeadActs = (closeBtn: boolean) => (
    <div className={css.headActs}>
      <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => void doImport()} disabled={busy}>
        <Upload size={13} weight="bold" /> 导入
      </button>
      <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setCreating(true)}>
        <Plus size={13} weight="bold" /> 新建
      </button>
      {closeBtn ? (
        <button className={`btn btn--ghost ${css.iconBtn}`} onClick={onClose} aria-label="关闭">
          <X size={16} weight="bold" />
        </button>
      ) : null}
    </div>
  )

  /* ================= 列表视图 ================= */
  if (!editBook) {
    const list = (
      <div className={`${css.panel} ${embedded ? '' : ''}`} style={panelStyle} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-label="世界书管理">
        <div className={css.head}>
          <div>
            <div className={css.kicker}>WORLD INFO / MANAGER</div>
            <b className={css.title}>世界书</b>
          </div>
          {listHeadActs(!!onClose)}
        </div>

        {creating ? (
          <div className={css.createRow}>
            <input
              className="field"
              placeholder="新世界书名称…"
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
            <span className="muted tiny">命中规则：某条词条的关键词出现在操作员/剧情叙述或短信里即注入。内置 4 本世界书由 canon 数据生成，内容只读建议；可按需停用或删除。</span>
          </div>
          {books.length === 0 ? (
            <div className={css.empty}>
              <b>还没有世界书</b>
              <span>点「新建」从零建一本，或用「导入」读入外部世界书 JSON。</span>
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
                      <b>{b.name || '未命名世界书'}</b>
                      {b.description ? <span className="muted tiny">{b.description}</span> : null}
                    </div>
                    <span className={css.count}>{b.entries?.length ?? 0} 词条</span>
                    <div className={css.rowActs}>
                      <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => openEditor(b)}>
                        浏览 / 编辑
                      </button>
                      <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => doExport(b)} title="导出为世界书 JSON">
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

        {onClose ? (
          <div className={css.foot}>
            <span className="muted tiny">世界书数据与激活标记保存在本终端本地，不含任何接口密钥。</span>
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={onClose}>
              完成
            </button>
          </div>
        ) : null}
      </div>
    )
    return wrap(list)
  }

  /* ================= 编辑视图 ================= */
  const selected = editSel ? editBook.entries.find((e) => e.id === editSel) : null
  /** 已启用词条数（预设调配计数，关闭者不计） */
  const onCount = editBook.entries.filter((e) => e.enabled !== false).length

  const edit = (
    <div className={`${css.panel} ${css.wide}`} style={panelStyle} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-label="世界书编辑">
      <div className={css.head}>
        <button className={`btn btn--ghost ${css.iconBtn}`} onClick={exitEditor} aria-label="返回列表">
          <ArrowLeft size={16} weight="bold" />
        </button>
        <div style={{ minWidth: 0 }}>
          <div className={css.kicker}>WORLD INFO / EDIT</div>
          <input className={`${css.titleInput}`} value={editBook.name} onChange={(e) => patchBook({ name: e.target.value })} aria-label="世界书名称" />
        </div>
        <div className={css.headActs}>
          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void saveEdit()}>
            <Check size={13} weight="bold" /> 保存
          </button>
          {onClose ? (
            <button className={`btn btn--ghost ${css.iconBtn}`} onClick={onClose} aria-label="关闭">
              <X size={16} weight="bold" />
            </button>
          ) : (
            <button className={`btn btn--ghost ${css.iconBtn}`} onClick={exitEditor} aria-label="返回列表">
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div className={css.editBody}>
        <aside className={css.entryList}>
          <div className={css.entryListHead}>
            <span className="muted tiny">
              词条（{editBook.entries.length}）
              {onCount < editBook.entries.length ? (
                <b className={css.offCount}> · 已关 {editBook.entries.length - onCount}</b>
              ) : null}
            </span>
            <span className={css.bulkSw}>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setAllEntries(true)}>
                全开
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setAllEntries(false)}>
                全关
              </button>
            </span>
            <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={addEntry}>
              <Plus size={12} weight="bold" /> 新增词条
            </button>
          </div>
          <div className={css.entryRows}>
            {editBook.entries.length === 0 ? (
              <div className="muted tiny" style={{ padding: 10 }}>尚无词条。</div>
            ) : (
              editBook.entries.map((e) => (
                <div key={e.id} className={css.entryWrap}>
                  <button
                    type="button"
                    className={`${css.entryRow} ${e.id === editSel ? css.isActive : ''} ${e.enabled === false ? css.isOff : ''}`}
                    onClick={() => setEditSel(e.id)}
                  >
                    <b>{e.comment || e.keys[0] || '(未命名词条)'}</b>
                    <span className="muted tiny">{e.keys.slice(0, 3).join(' / ')}{e.keys.length > 3 ? ' …' : ''}</span>
                  </button>
                  <button
                    type="button"
                    className={css.entrySw}
                    title={e.enabled === false ? '已关闭 · 不参与注入（点此启用）' : '已启用 · 点此关闭'}
                    onClick={() => patchEntry(e.id, { enabled: e.enabled === false })}
                  >
                    {e.enabled === false ? <EyeSlash size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className={css.form}>
          {!selected ? (
            <div className={css.formEmpty}>
              <b>选择或新增一个词条</b>
              <span>左侧点选词条以编辑关键词与内容；编辑后记得「保存」整本世界书。</span>
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
                <label className={css.ck}>
                  <input
                    type="checkbox"
                    checked={selected.enabled !== false}
                    onChange={(e) => patchEntry(selected.id, { enabled: e.target.checked })}
                  />
                  启用（关闭后本词条不参与注入，常驻亦然）
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
  )
  return wrap(edit)
}
