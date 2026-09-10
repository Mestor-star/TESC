import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { LORE } from '../data/lore'
import { MANUAL } from '../data/manual'
import type { LoreCat } from '../data/types'
import { LoreManager } from './lorebook/LoreManager'

import css from './Lore.module.css'

const CATS: { key: LoreCat; label: string; color: string }[] = [
  { key: '世界观', label: '世界观 · 世界运行的规则', color: 'var(--steel)' },
  { key: '势力', label: '势力 · 组织与机构', color: 'var(--amber)' },
  { key: '概念', label: '概念 · 术语与法理', color: 'var(--violet)' },
]

const secHead: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
  margin: '6px 0 10px',
}
const secTitle: CSSProperties = {
  margin: 0, fontSize: 17, fontWeight: 900, letterSpacing: '0.03em', color: 'var(--ink)',
}
const secKicker: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--ink-faint)',
  textTransform: 'uppercase', marginRight: 'auto',
}

export function Lore() {
  const [cat, setCat] = useState<LoreCat>('世界观')

  const list = useMemo(() => LORE.filter((l) => l.cat === cat), [cat])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of LORE) c[l.cat] = (c[l.cat] ?? 0) + 1
    return c
  }, [])
  const meta = CATS.find((c) => c.key === cat)!

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">DATA / THINK TANK</div>
          <h1>智库</h1>
          <div className="vhead__sub">
            本页即世界书管理器：上方管理与编辑你的世界书（启用命中 / 浏览编辑 / 新建 / 删除 / 导入 / 导出）；
            下方为内置 canon 词条的只读速览，共 {LORE.length} 条，亦已并入可编辑的内置世界书。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip">canon 词条 {LORE.length}</span>
          <span className="chip">管理器 · 世界书启停</span>
        </div>
      </div>

      {/* 世界书管理器（整页内嵌） */}
      <div style={{ ...secHead, marginTop: 0 }}>
        <span style={secKicker}>WORLDINFO / MANAGER</span>
        <h2 style={secTitle}>世界书管理器</h2>
        <span className="chip chip--warn" style={{ borderColor: 'transparent', background: 'var(--bg-2)' }}>
          密级 · 委员会内部
        </span>
      </div>
      <LoreManager embedded />

      {/* 观测终端操作手册（文本教程）—— 讲这台终端怎么用，不是设定，故不进世界书 */}
      <div style={{ ...secHead, marginTop: 26, paddingTop: 18, borderTop: '1px dashed var(--line-2)' }}>
        <span style={secKicker}>MANUAL / OPERATION</span>
        <h2 style={secTitle}>观测终端操作手册</h2>
        <span className="chip chip--warn" style={{ borderColor: 'transparent', background: 'var(--bg-2)' }}>
          共 {MANUAL.length} 节 · 可照着做
        </span>
      </div>
      <div className={css.grid} data-manual>
        {MANUAL.map((s) => (
          <article key={s.id} className={css.card} data-sub={s.no} data-manual-section={s.id}
            style={{ '--c': 'var(--amber)' } as CSSProperties}>
            <div className={css.cardHead}>
              <h3 className={css.cardTitle}>{s.title}</h3>
              <span className={css.cardSub}>{s.no}</span>
              <span className={css.cardRef}>{s.at}</span>
            </div>
            <p className={css.cardBody}><b>{s.lead}</b></p>
            <ol className={css.mList}>
              {s.items.map((t) => (
                <li key={t} className={css.mItem}>{t}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>

      {/* 内置 canon 速览 */}
      <div style={{ ...secHead, marginTop: 26, paddingTop: 18, borderTop: '1px dashed var(--line-2)' }}>
        <span style={secKicker}>CANON / OVERVIEW</span>
        <h2 style={secTitle}>内置 canon 词条 · 速览</h2>
        <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
          只读陈列 · 内容编辑请在上方世界书管理器
        </span>
      </div>

      <div className={css.filterRow}>
        {CATS.map((c) => (
          <button
            key={c.key}
            className={`${css.catBtn} ${cat === c.key ? css.isOn : ''}`}
            style={{ '--c': c.color } as CSSProperties}
            onClick={() => setCat(c.key)}
          >
            {c.key}
            <small>{counts[c.key] ?? 0} · {c.label}</small>
          </button>
        ))}
      </div>

      <div className={css.grid}>
        {list.map((l) => (
          <article
            key={l.id}
            className={css.card}
            data-sub={l.sub}
            style={{ '--c': meta.color } as CSSProperties}
          >
            <div className={css.cardHead}>
              <h3 className={css.cardTitle}>{l.title}</h3>
              <span className={css.cardSub}>{l.sub}</span>
              {l.ref ? <span className={css.cardRef}>出处 {l.ref}</span> : null}
            </div>
            <p className={css.cardBody}>{l.body}</p>
            <div className={css.cardTags}>
              {l.tags.map((t) => (
                <span key={t} className={css.tag}>{t}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
