import { useMemo, useState } from 'react'
import { LORE } from '../data/lore'
import { MANUAL } from '../data/manual'
import type { LoreCat } from '../data/types'
import { FoldAll, FoldHead, useFolds } from '../components/Fold'
import { LoreManager } from './lorebook/LoreManager'

import css from './Lore.module.css'

const CATS: { key: LoreCat; label: string }[] = [
  { key: '世界观', label: '世界观 · 世界运行的规则' },
  { key: '势力', label: '势力 · 组织与机构' },
  { key: '概念', label: '概念 · 术语与法理' },
]

/** 手册各节的折叠键（= 节的 id），给 FoldAll 用 */
const MANUAL_KEYS = MANUAL.map((s) => s.id)

export function Lore() {
  const [cat, setCat] = useState<LoreCat>('世界观')
  /* 手册是「按需查阅」的文档，不是要通读的文章：默认折着，先给九行标题，
     要点哪一节再摊开哪一节。（canon 那一栏不折 —— 那本来就是本页要读的东西。） */
  const folds = useFolds()

  const [openId, setOpenId] = useState<string | null>(null)

  const list = useMemo(() => LORE.filter((l) => l.cat === cat), [cat])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of LORE) c[l.cat] = (c[l.cat] ?? 0) + 1
    return c
  }, [])
  const sel = LORE.find((l) => l.id === openId && l.cat === cat) ?? list[0]

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
      <div className={`${css.secHead} ${css.secHeadFirst}`}>
        <span className={css.secKicker}>WORLDINFO / MANAGER</span>
        <h2 className={css.secTitle}>世界书管理器</h2>
        <span className="chip">密级 · 委员会内部</span>
      </div>
      <LoreManager embedded />

      {/* 观测终端操作手册（文本教程）—— 讲这台终端怎么用，不是设定，故不进世界书 */}
      <div className={css.secHead}>
        <span className={css.secKicker}>MANUAL / OPERATION</span>
        <h2 className={css.secTitle}>观测终端操作手册</h2>
        <span className="chip">共 {MANUAL.length} 节 · 可照着做</span>
      </div>
      <FoldAll folds={folds} keys={MANUAL_KEYS} label={`${MANUAL.length} 节`}
        className={css.manualBar}
        hint={`${MANUAL.length} 节默认都折着：先看标题，点哪一节的抬头就摊开哪一节。`} />
      <div className={css.rows} data-manual>
        {MANUAL.map((s) => (
          <article key={s.id} className={css.mRow} data-sub={s.no} data-manual-section={s.id}>
            <FoldHead k={s.id} open={folds.isOpen(s.id)} folds={folds} className={css.mHead} plain>
              <h3 className={css.mTitle}>{s.title}</h3>
              <span className={css.mSub}>{s.no}</span>
              <span className={css.mRef}>{s.at}</span>
            </FoldHead>
            <div className={css.mBody} data-fold-body>
              <p className={css.mLead}><b>{s.lead}</b></p>
              <ol className={css.mList}>
                {s.items.map((t) => (
                  <li key={t} className={css.mItem}>{t}</li>
                ))}
              </ol>
            </div>
          </article>
        ))}
      </div>

      {/* 内置 canon 速览 */}
      <div className={css.secHead}>
        <span className={css.secKicker}>CANON / OVERVIEW</span>
        <h2 className={css.secTitle}>内置 canon 词条 · 速览</h2>
        <span className={css.secNote}>只读陈列 · 内容编辑请在上方世界书管理器</span>
      </div>

      <div className={css.shell}>
        <nav className={css.tree}>
          {CATS.map((c) => (
            <div key={c.key} className={css.treeGroup}>
              <button
                className={`${css.groupRow} ${cat === c.key ? css.groupOn : ''}`}
                onClick={() => { setCat(c.key); setOpenId(null) }}
              >
                <span className={css.groupLabel}>{c.label}</span>
                <span className={css.groupNum}>{counts[c.key] ?? 0}</span>
              </button>
              {cat === c.key
                ? list.map((l) => (
                    <button
                      key={l.id}
                      className={`${css.node} ${sel?.id === l.id ? css.nodeOn : ''}`}
                      data-sub={l.sub}
                      onClick={() => setOpenId(l.id)}
                    >
                      <span className={css.nodeTitle}>{l.title}</span>
                      <span className={css.nodeSub}>{l.sub}</span>
                    </button>
                  ))
                : null}
            </div>
          ))}
        </nav>

        <div className={css.read}>
          {sel ? (
            <article className={css.article}>
              <div className={css.articleHead}>
                <h3 className={css.articleTitle}>{sel.title}</h3>
                <span className={css.articleSub}>{sel.sub}</span>
                {sel.ref ? <span className={css.articleRef}>出处 {sel.ref}</span> : null}
              </div>
              <p className={css.articleBody}>{sel.body}</p>
              <div className={css.articleTags}>
                {sel.tags.map((t) => (
                  <span key={t} className={css.tag}>{t}</span>
                ))}
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  )
}
