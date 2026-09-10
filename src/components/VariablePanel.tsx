/* ============================================================
   变量系统（命名变量面板）
   ------------------------------------------------------------
   分区 A · 用户变量：列出世界状态 flags 全部（AI 亦经结构化指令
   写入同一份），可新增 / 编辑（键名+类型+值）/ 删除，删除走行内
   二次确认。
   分区 B · 系统派生 · 只读：操作员代号、全员实时羁绊 bond:<id>，
   及整个 web 前端运行状态的计数（met / ends / own / records / picks /
   epDone / cur / unlocked）——不落档，随世界现算。
   无 emoji，改动一律行内 toast。浮层经 portal 挂到 body，避免
   被带 transform 的 view-transition 祖先捕获。
   ============================================================ */

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import type { FlagValue } from '../data/types'
import { PERSON_IDS } from '../data/castmeta'

import css from './VariablePanel.module.css'

type VType = 'str' | 'num' | 'bool'

const T_LABEL: Record<VType, string> = { str: '文本', num: '数值', bool: '布尔' }
const T_CHIP: Record<VType, string> = { str: 'str', num: 'num', bool: 'bool' }

function typeOf(v: FlagValue): VType {
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return 'num'
  return 'str'
}

function toText(v: FlagValue): string {
  return typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)
}

/** 变量名：非空、无空白、≤48 字符 */
function validKey(k: string): boolean {
  return /^\S+$/.test(k) && k.length > 0 && k.length <= 48
}

/** 按类型把输入串解析为落档值；数值非法返回 null */
function parseVal(t: VType, raw: string): FlagValue | null {
  if (t === 'bool') return raw === 'true'
  if (t === 'num') {
    const s = raw.trim()
    if (s === '' || Number.isNaN(Number(s))) return null
    return Number(s)
  }
  return raw
}

export function VariablePanel() {
  const {
    world, flagOf, setFlag, addVar, unsetVar, renameVar,
    operatorName, bondNow, isMet, epDone, cur, unlocked, push,
    setVarsOpen,
  } = useTerminal()

  const [adding, setAdding] = useState(false)
  const [nKey, setNKey] = useState('')
  const [nType, setNType] = useState<VType>('str')
  const [nRaw, setNRaw] = useState('')
  /** 正在编辑的变量 key；null=列表态 */
  const [editKey, setEditKey] = useState<string | null>(null)
  const [eKey, setEKey] = useState('')
  const [eType, setEType] = useState<VType>('str')
  const [eRaw, setERaw] = useState('')
  /** 删除二次确认 */
  const [delKey, setDelKey] = useState<string | null>(null)

  const flags = world.flags
  const rows = useMemo(
    () => Object.entries(flags).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    [flags],
  )

  const sysRows = useMemo(() => {
    const bondRows = PERSON_IDS.map((id) => [`bond:${id}`, String(bondNow(id))])
    return [
      ['operatorName', operatorName.trim() || '言万心叶'],
      ...bondRows,
      ['met', `${PERSON_IDS.filter((id) => isMet(id)).length}/${PERSON_IDS.length}`],
      ['ends', String(Object.keys(world.ends).length)],
      ['own', String(world.own.length)],
      ['records', String(world.records.length)],
      ['picks', String(Object.keys(world.pick).length)],
      ['epDone', String(Object.keys(epDone).length)],
      ['cur', cur ?? '—'],
      ['unlocked', unlocked ? 'true' : 'false'],
    ] as Array<[string, string]>
  }, [operatorName, bondNow, isMet, epDone, cur, unlocked, world])

  const close = () => setVarsOpen(false)

  const resetEdit = () => { setEditKey(null); setEKey(''); setERaw(''); setEType('str') }
  const resetAdd = () => { setAdding(false); setNKey(''); setNRaw(''); setNType('str') }

  /* —— 新增 —— */
  const commitAdd = () => {
    const key = nKey.trim()
    if (!validKey(key)) {
      push('warn', '键名不合法', '变量名需为非空、不含空格、≤48 字符。', false)
      return
    }
    if (flagOf(key) !== undefined) {
      push('warn', '同名变量已存在', `「${key}」已在命名变量中，可直接编辑。`, false)
      return
    }
    const parsed = parseVal(nType, nRaw)
    if (parsed === null) {
      push('warn', '数值无效', '选定了「数值」类型但输入的不是数字。', false)
      return
    }
    if (!addVar(key, parsed)) {
      push('warn', '新增失败', `「${key}」未能写入。`, false)
      return
    }
    push('success', '已新增变量', key, false)
    resetAdd()
  }

  /* —— 编辑（键名 / 类型 / 值 同一表单） —— */
  const beginEdit = (key: string) => {
    const v = flagOf(key)
    if (v === undefined) return
    setEditKey(key)
    setEKey(key)
    setEType(typeOf(v))
    setERaw(toText(v))
  }
  const commitEdit = () => {
    if (!editKey) return
    const nextKey = eKey.trim()
    const parsed = parseVal(eType, eRaw)
    if (parsed === null) {
      push('warn', '数值无效', '选定了「数值」类型但输入的不是数字。', false)
      return
    }
    if (nextKey === editKey) {
      setFlag(editKey, parsed)
      push('success', '已更新变量', editKey, false)
      resetEdit()
      return
    }
    if (!validKey(nextKey)) {
      push('warn', '键名不合法', '变量名需为非空、不含空格、≤48 字符。', false)
      return
    }
    if (!renameVar(editKey, nextKey)) {
      push('warn', '改名冲突', '目标名已被占用或原变量不存在，未改动。', false)
      return
    }
    setFlag(nextKey, parsed)
    push('success', '已改名并更新变量', `${editKey} → ${nextKey}`, false)
    resetEdit()
  }

  /* —— 删除（行内二次确认） —— */
  const doDel = (key: string) => {
    if (delKey !== key) { setDelKey(key); return }
    setDelKey(null)
    if (!unsetVar(key)) {
      push('warn', '删除失败', '该变量不存在。', false)
      return
    }
    push('info', '已删除变量', key, false)
  }

  const renderValueInput = (type: VType, raw: string, setRaw: (s: string) => void) => {
    if (type === 'bool') {
      return (
        <select className="field" value={raw} onChange={(e) => setRaw(e.target.value)} aria-label="布尔值">
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    }
    return <input className="field" placeholder={type === 'num' ? '数值…' : '值…'} value={raw} aria-label="变量值" onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
  }

  return createPortal(
    <div className={css.mask} data-vars-panel="1" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className={css.panel} role="dialog" aria-modal="true" aria-label="命名变量">
        <div className={css.head}>
          <div>
            <div className={css.kicker}>VARIABLE / REGISTRY</div>
            <b className={css.title}>命名变量</b>
          </div>
          <div className={css.headActs}>
            <button className={`btn btn--ghost ${css.iconBtn}`} onClick={close} aria-label="关闭变量面板">
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className={css.body}>
          <div className={css.hint}>
            <b>命名变量 · 随世界状态存档。</b>
            <span>在线推演中，主角的行为会由导演回执自动更新受影响变量的值（回执会先附当前登记表）；短信可带轻量更新。你在这里也可增、改、删。</span>
          </div>

          <div className={css.secHead}>
            <b>命名变量</b>
            <span className="muted tiny">{rows.length} 个 · 可读写</span>
            <div style={{ marginLeft: 'auto' }}>
              {!adding ? (
                <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setAdding(true)}>
                  <Plus size={12} weight="bold" /> 新增变量
                </button>
              ) : null}
            </div>
          </div>

          {adding ? (
            <div className={css.addRow}>
              <input className="field" placeholder="键名…" value={nKey} aria-label="新变量名" onChange={(e) => setNKey(e.target.value)} spellCheck={false} />
              {renderValueInput(nType, nRaw, setNRaw)}
              <select className={css.typeSel} value={nType} onChange={(e) => { const nt = e.target.value as VType; setNType(nt); if (nt === 'bool') setNRaw('true'); }} aria-label="新变量类型">
                <option value="str">文本</option>
                <option value="num">数值</option>
                <option value="bool">布尔</option>
              </select>
              <button className="btn btn--primary" style={{ fontSize: 11, padding: '6px 12px' }} onClick={commitAdd}>
                <Check size={13} weight="bold" /> 添加
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={resetAdd}>
                取消
              </button>
            </div>
          ) : null}

          {rows.length === 0 && !adding ? (
            <div className={css.empty}>还没有变量。按「新增变量」加一条，或由导演在推演中经事件指令写入。</div>
          ) : (
            <div className={css.list}>
              {rows.map(([key, v]) => {
                const t = typeOf(v)
                const isEditing = editKey === key
                return (
                  <div key={key} className={css.row} data-var-row={key}>
                    {isEditing ? (
                      <>
                        <input className={`field ${css.keyEdit}`} value={eKey} aria-label="编辑键名" onChange={(e) => setEKey(e.target.value)} spellCheck={false} autoFocus />
                        <span className={css.typeTag} />
                        <span className={css.valBox}>
                          {renderValueInput(eType, eRaw, setERaw)}
                          <select className={css.typeSel} value={eType} onChange={(e) => { const nt = e.target.value as VType; setEType(nt); if (nt === 'bool') setERaw('true'); }} aria-label="编辑类型">
                            <option value="str">文本</option>
                            <option value="num">数值</option>
                            <option value="bool">布尔</option>
                          </select>
                        </span>
                        <span className={css.rowActs}>
                          <button className="btn btn--primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={commitEdit}>
                            <Check size={12} weight="bold" /> 保存
                          </button>
                          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={resetEdit}>
                            取消
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <code className={css.key} title={key}>{key}</code>
                        <span className={css.typeTag}>{T_CHIP[t]}</span>
                        <span className={css.val} title={`${T_LABEL[t]} · ${toText(v)}`}>{toText(v)}</span>
                        <span className={css.rowActs}>
                          <button className="btn btn--ghost btn--icon" style={{ fontSize: 11 }} onClick={() => beginEdit(key)} title="编辑键名 / 值" aria-label={`编辑 ${key}`}>
                            <PencilSimple size={13} weight="bold" />
                          </button>
                          <button
                            className={`btn btn--ghost btn--icon ${delKey === key ? css.danger : ''}`}
                            style={{ fontSize: 11 }}
                            onClick={() => doDel(key)}
                            onBlur={() => setDelKey((d) => (d === key ? null : d))}
                            title={delKey === key ? '再按一次 · 确认删除' : '删除'}
                            aria-label={`删除 ${key}`}
                          >
                            {delKey === key ? '确认' : <Trash size={13} weight="bold" />}
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className={css.divider} />

          <div className={css.secHead}>
            <b>终端派生 · 只读</b>
            <span className="muted tiny">实时现值 · 不落档</span>
          </div>
          <div className={css.sysList}>
            {sysRows.map(([key, val]) => (
              <div key={key} className={css.sysRow} data-var-sys={key}>
                <code>{key}</code>
                <span className={css.sysVal}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={css.foot}>
          <span className="muted tiny">命名变量随世界状态一并留存，不涉推演通道。</span>
          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={close}>
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
