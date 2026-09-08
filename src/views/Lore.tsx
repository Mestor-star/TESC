import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { LORE } from '../data/lore'
import type { LoreCat } from '../data/types'

import css from './Lore.module.css'

const CATS: { key: LoreCat; label: string; color: string }[] = [
  { key: '世界观', label: '世界观 · 世界运行的规则', color: 'var(--steel)' },
  { key: '势力', label: '势力 · 组织与机构', color: 'var(--amber)' },
  { key: '概念', label: '概念 · 术语与法理', color: 'var(--violet)' },
]

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
            理解「终末」，才能理解委员会为什么要让世界停滞。世界观、势力与概念——按原作设定逐条考据整理。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip">词条 {LORE.length}</span>
          <span className="chip chip--warn" style={{ borderColor: 'transparent', background: 'var(--bg-2)' }}>
            密级 · 委员会内部
          </span>
        </div>
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
