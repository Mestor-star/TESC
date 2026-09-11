/* 管理预设 · 指令条目 pane（受控）
   ------------------------------------------------------------------
   这里就是「工具包」的内容：生成行为、文本格式这类控制指令。
   它们不属于任何世界书，套用本预设时才进提示词。 */

import { useMemo, useState } from 'react'
import { Eye, EyeSlash, Plus, Trash } from '@phosphor-icons/react'
import { newPresetEntry, scopeOf } from '../lib/preset'
import type { PresetEntry, PresetEntryKind, PresetEntryPos, PresetEntryScope } from '../lib/preset'
import css from './PresetManager.module.css'

interface Props {
  entries: PresetEntry[]
  onChange: (next: PresetEntry[]) => void
}

const KINDS: PresetEntryKind[] = ['行为', '格式', '其它']

/** 适用范围 → 界面上的短标（左列副标题用） */
const SCOPE_TAG: Record<PresetEntryScope, string> = { all: '两通道', main: '仅主线', sms: '仅短信' }

export default function PresetEntryPane({ entries, onChange }: Props) {
  const [selId, setSelId] = useState<string | null>(entries[0]?.id ?? null)
  const sel = useMemo(() => entries.find((e) => e.id === selId) ?? null, [entries, selId])

  const patch = (id: string, p: Partial<PresetEntry>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...p } : e)))

  const add = () => {
    const e = newPresetEntry((entries.at(-1)?.order ?? 0) + 10)
    onChange([...entries, e])
    setSelId(e.id)
  }

  const remove = (id: string) => {
    const next = entries.filter((e) => e.id !== id)
    onChange(next)
    if (selId === id) setSelId(next[0]?.id ?? null)
  }

  /** 按 group 归纳显示（酒馆预设的分隔行在这里成了分组标题） */
  const grouped = useMemo(() => {
    const out: Array<{ group: string; items: PresetEntry[] }> = []
    for (const e of entries) {
      const g = e.group || '未分组'
      const last = out.at(-1)
      if (last && last.group === g) last.items.push(e)
      else out.push({ group: g, items: [e] })
    }
    return out
  }, [entries])

  const onCount = entries.filter((e) => e.enabled !== false && !e.placeholder).length
  const realCount = entries.filter((e) => !e.placeholder).length

  return (
    <>
      <div className={css.colList}>
        <div className={css.colHead}>
          <span className="muted tiny">指令条目 · 启用 <span className={css.tagOn}>{onCount}</span> / {realCount}</span>
          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 9px' }} onClick={add}>
            <Plus size={12} weight="bold" /> 新建
          </button>
        </div>
        <div className={css.rows}>
          {entries.length === 0 ? (
            <div className={css.empty}>
              <b>还没有条目</b>
              <span>点「新建」写一条：比如叙述人称、文本格式、字数要求。</span>
            </div>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group}>
                <div className={css.groupHead}>{group}</div>
                {items.map((e) => (
                  <div key={e.id} className={css.rowWrap} data-preset-entry={e.id}>
                    <button
                      type="button"
                      className={`${css.row} ${e.id === selId ? css.isActive : ''} ${e.enabled === false ? css.isOff : ''} ${e.placeholder ? css.isPh : ''}`}
                      onClick={() => setSelId(e.id)}
                    >
                      <b>{e.name}</b>
                      <span className="muted tiny">
                        {e.placeholder ? '占位 · 运行时填充' : e.constant ? '常驻' : `关键词 ${e.keys.join('/') || '（未设）'}`}
                        {' · '}{e.position === 'post' ? '后置' : '前置'}
                        {scopeOf(e) !== 'all' ? ` · ${SCOPE_TAG[scopeOf(e)]}` : ''}
                      </span>
                    </button>
                    {!e.placeholder && (
                      <button
                        type="button"
                        className={css.sw}
                        data-preset-sw={e.id}
                        title={e.enabled === false ? '已关闭 · 不参与注入（点此启用）' : '已启用 · 点此关闭'}
                        onClick={() => patch(e.id, { enabled: e.enabled === false })}
                      >
                        {e.enabled === false ? <EyeSlash size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={css.pane}>
        {!sel ? (
          <div className={css.empty}>
            <b>左列选一条来编辑</b>
            <span>条目会按「常驻 / 关键词命中」在本回合注入提示词。</span>
          </div>
        ) : (
          <>
            {sel.placeholder && (
              <div className={css.hint} style={{ margin: '-14px -16px 0', padding: '9px 16px' }}>
                <span className="muted tiny">
                  占位条目：酒馆预设里由应用填入的段落（角色档案 / 世界书 / 对话历史…）。
                  本终端在运行时自行处理这些内容，此条不参与注入，保留只为让结构可见。
                </span>
              </div>
            )}

            <label className={css.fieldRow}>
              <span>条目标题</span>
              <input className="field" value={sel.name} onChange={(ev) => patch(sel.id, { name: ev.target.value })} />
            </label>

            <div className={css.miniRow}>
              <label>
                分类
                <select className="field" style={{ width: 110 }} value={sel.kind} onChange={(ev) => patch(sel.id, { kind: ev.target.value as PresetEntryKind })}>
                  {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label>
                注入位置
                <select className="field" style={{ width: 190 }} value={sel.position} onChange={(ev) => patch(sel.id, { position: ev.target.value as PresetEntryPos })}>
                  <option value="pre">前置（导演规则之后）</option>
                  <option value="post">后置（事件指令之前）</option>
                </select>
              </label>
              <label>
                适用范围
                <select
                  className="field" style={{ width: 150 }} value={scopeOf(sel)}
                  onChange={(ev) => {
                    const v = ev.target.value as PresetEntryScope
                    /* 写成 'all' 时把这个字段删掉，而不是存一个 scope:'all' ——
                       缺省本来就是 all，存下去会让「没设过」和「特意设为两边」分不清。 */
                    const { scope: _drop, ...rest } = sel
                    patch(sel.id, v === 'all' ? rest : { ...rest, scope: v })
                  }}
                >
                  <option value="all">两条通道都进</option>
                  <option value="main">只管主线推演</option>
                  <option value="sms">只管角色短信</option>
                </select>
              </label>
              <label>
                顺序
                <input
                  className="field num" type="number" value={sel.order}
                  onChange={(ev) => { const n = Number(ev.target.value); patch(sel.id, { order: Number.isFinite(n) ? n : 100 }) }}
                />
              </label>
            </div>

            <div className={css.miniRow}>
              <label className={css.ck}>
                <input type="checkbox" checked={sel.constant} disabled={sel.placeholder} onChange={(ev) => patch(sel.id, { constant: ev.target.checked })} />
                常驻（每回合都注入）
              </label>
              {!sel.constant && (
                <label style={{ flex: 1, minWidth: 260 }}>
                  关键词（逗号分隔，命中才注入）
                  <input
                    className="field" style={{ flex: 1, minWidth: 220 }}
                    value={sel.keys.join('，')}
                    onChange={(ev) => patch(sel.id, { keys: ev.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
                  />
                </label>
              )}
              <label className={css.ck}>
                <input type="checkbox" checked={sel.enabled !== false} disabled={sel.placeholder} onChange={(ev) => patch(sel.id, { enabled: ev.target.checked })} />
                启用
              </label>
            </div>

            <label className={css.fieldRow}>
              <span>指令正文（原样进入提示词）</span>
              <textarea
                className={css.textarea}
                value={sel.content}
                placeholder={sel.placeholder ? '（占位条目无正文）' : '例：以第三人称限知视角叙述，紧贴在场角色的所见所感。'}
                disabled={sel.placeholder}
                onChange={(ev) => patch(sel.id, { content: ev.target.value })}
              />
            </label>

            <div className={css.miniRow}>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => remove(sel.id)}>
                <Trash size={13} weight="bold" /> 删除此条
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
