import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { CODEX } from '../data/codex'
import type { EndEntry, OwnEndEntry } from '../data/types'
import { useTerminal } from '../terminal/Terminal'

import css from './Codex.module.css'

/** 原法分类的「目录」顺序——贴合原著的法系（异法／死灵操法…） */
const CANON_ORDER = [
  '异法',
  '死灵操法',
  '仪式灾害',
  '反现实机械工学',
  '梵我合一',
  '世界的色彩',
  '天使之律',
  '旧神',
  '共同幻想',
  '侦探',
]

const STATE_META: Record<string, { cls: string; color: string; label: string }> = {
  活跃: { cls: 'chip chip--danger', color: 'var(--red)', label: '活跃' },
  抑制: { cls: 'chip chip--warn', color: 'var(--amber)', label: '抑制' },
  收容: { cls: 'chip chip--on', color: 'var(--jade)', label: '收容' },
  已清除: { cls: 'chip chip--off', color: 'var(--ink-mute)', label: '已清除' },
}

/** 图鉴浏览档位：全部 / 仅已遭遇 / 仅封存未解 */
type CodexMode = 'all' | 'met' | 'sealed'

/** 自记条目所带原法分类的默认值顺序 */
const CLASS_OPTIONS = [
  '异法',
  '死灵操法',
  '仪式灾害',
  '反现实机械工学',
  '梵我合一',
  '世界的色彩',
  '天使之律',
  '旧神',
  '共同幻想',
  '侦探',
]

const STAGE_OPTIONS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function allClasses(own: OwnEndEntry[]): string[] {
  const s = new Set<string>()
  for (const e of CODEX) for (const c of e.classes) s.add(c)
  for (const o of own) for (const c of o.classes) s.add(c)
  const canon = CANON_ORDER.filter((c) => s.has(c))
  const rest = [...s].filter((c) => !CANON_ORDER.includes(c))
  return [...canon, ...rest]
}

function fmtTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

export function Codex() {
  const { ownEnds, isEndReg, registerEnd, addOwnEnd, removeOwnEnd, push } = useTerminal()

  const [cls, setCls] = useState<string>('全部')
  const [mode, setMode] = useState<CodexMode>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  /* —— 操作员自记条目的录入表单 —— */
  const [f, setF] = useState<{ name: string; no: string; alias: string; stage: number; stageKw: string; klass: string; state: OwnEndEntry['state']; origin: string; detail: string; counter: string }>({
    name: '',
    no: '',
    alias: '',
    stage: -1,
    stageKw: '未解明',
    klass: '异法',
    state: '活跃',
    origin: '',
    detail: '',
    counter: '',
  })
  const canSave = f.name.trim() !== '' && f.origin.trim() !== ''
  const set = (k: keyof typeof f, v: string | number) => setF((prev) => ({ ...prev, [k]: v }))

  const classes = useMemo(() => allClasses(ownEnds), [ownEnds])

  /* —— 图鉴各项动态状态 —— */
  // 封存：未登记 且 档案亦未公开；其余未登记但 seen=true 的为「常备档案：委员会已知，个人未遭遇」
  const sealedOf = (e: EndEntry) => !isEndReg(e.id) && !e.seen

  // 登记状态随时可变，故按渲染即时计算（规模小，无需记忆化）
  const reg = CODEX.reduce((n, e) => n + (isEndReg(e.id) ? 1 : 0), 0)
  const sealedTotal = CODEX.reduce((n, e) => n + (sealedOf(e) ? 1 : 0), 0)
  const counts = {
    total: CODEX.length + ownEnds.length,
    reg: reg + ownEnds.length,
    sealed: sealedTotal,
    active: CODEX.reduce((n, e) => n + (e.state === '活跃' ? 1 : 0), 0),
    cleared: CODEX.reduce((n, e) => n + (e.state === '已清除' ? 1 : 0), 0),
  }

  const pool = CODEX.filter((e) => {
    if (mode === 'met') return isEndReg(e.id)
    if (mode === 'sealed') return sealedOf(e)
    return true
  })
  let groups: [string, EndEntry[]][]
  if (cls !== '全部') {
    const matched = pool.filter((e) => e.classes.includes(cls))
    groups = matched.length ? [[cls, matched]] : []
  } else {
    const g: Record<string, EndEntry[]> = {}
    for (const e of pool) {
      const k = e.classes[0] ?? '其他'
      ;(g[k] ??= []).push(e)
    }
    const order = CANON_ORDER.filter((k) => g[k])
    const rest = Object.keys(g)
      .filter((k) => !CANON_ORDER.includes(k))
      .sort()
    groups = [...order, ...rest].map((k) => [k, g[k]] as [string, EndEntry[]])
  }

  const ownSorted = useMemo(() => [...ownEnds].sort((a, b) => b.ts - a.ts), [ownEnds])

  const switchMode = (m: CodexMode) => {
    setMode(m)
    setOpenId(null)
  }
  const switchCls = (c: string) => {
    setCls(c)
    setOpenId(null)
  }

  const doRegister = (e: EndEntry) => {
    registerEnd(e.id)
    push('decode', '图鉴登记 · 解封', `「${e.name}」已登记进终末图鉴。`, false)
  }

  const doAdd = () => {
    if (!canSave) return
    const entry: OwnEndEntry = {
      id: `own-${Date.now().toString(36)}`,
      name: f.name.trim(),
      alias: f.alias.trim(),
      no: f.no.trim(),
      stage: f.stage,
      stageKw: f.stageKw.trim() || '未解明',
      classes: [f.klass],
      state: f.state,
      origin: f.origin.trim(),
      detail: f.detail.trim(),
      counter: f.counter.trim(),
      ref: '操作员自记 · 档案扩充',
      ts: Date.now(),
    }
    addOwnEnd(entry)
    push('success', '自记补录完成', `「${entry.name}」已写入操作员自记。`, false)
    setF({ name: '', no: '', alias: '', stage: -1, stageKw: '未解明', klass: f.klass, state: '活跃', origin: '', detail: '', counter: '' })
    setAdding(false)
  }

  const doRemove = (e: OwnEndEntry) => {
    removeOwnEnd(e.id)
    setOpenId(null)
    push('info', '自记条目删除', `「${e.name}」已从操作员自记移除。`, false)
  }

  const statusTag = (e: EndEntry) =>
    isEndReg(e.id)
      ? { text: '已遭遇 · 已登记', cls: css.tagMet }
      : sealedOf(e)
        ? { text: '封存 · 未解明', cls: css.tagSeal }
        : { text: '仅档案 · 未遭遇', cls: css.tagIntel }

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">CODEX / ENDINGS</div>
          <h1>终末图鉴</h1>
          <div className="vhead__sub">
            反现实实体观测档案。按原法分类归档——异法、死灵操法、仪式灾害、反现实机械工学、
            梵我合一、世界的色彩、天使之律、旧神、共同幻想。编号与名称依原作考据整理；
            已遭遇状态随剧情推进自动登记，封存条目可由操作员自行解封补录。
          </div>
        </div>
      </div>

      <div className={css.metrics}>
        <div className={css.metric}>
          <small>收录档案</small>
          <b>{counts.total}</b>
        </div>
        <div className={css.metric}>
          <small>已遭遇登记</small>
          <b style={{ color: 'var(--steel)' }}>{counts.reg}</b>
        </div>
        <div className={css.metric}>
          <small>封存未解</small>
          <b style={{ color: 'var(--ink-mute)' }}>{counts.sealed}</b>
        </div>
        <div className={css.metric}>
          <small>活跃中</small>
          <b style={{ color: 'var(--red)' }}>{counts.active}</b>
        </div>
        <div className={css.metric}>
          <small>已清除</small>
          <b style={{ color: 'var(--jade)' }}>{counts.cleared}</b>
        </div>
      </div>

      {/* 档位 + 原法分类筛选 */}
      <div className={css.controls}>
        {(
          [
            ['all', '全部记录'],
            ['met', '仅已遭遇'],
            ['sealed', '仅封存未解'],
          ] as [CodexMode, string][]
        ).map(([m, label]) => {
          const on = mode === m
          return (
            <button
              key={m}
              className="chip"
              style={{
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.05em',
                color: on ? '#fff' : 'var(--ink-dim)',
                borderColor: on ? 'var(--red)' : 'var(--line-2)',
                background: on ? 'var(--red-soft)' : 'var(--bg-2)',
                boxShadow: on ? 'inset 0 0 0 1px var(--red)' : 'none',
              }}
              onClick={() => switchMode(m)}
            >
              {label}
            </button>
          )
        })}

        <span className={css.split} />

        {['全部', ...classes].map((c) => {
          const on = cls === c
          return (
            <button
              key={c}
              className="chip"
              style={{
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.05em',
                color: on ? '#fff' : 'var(--ink-dim)',
                borderColor: on ? 'var(--red)' : 'var(--line-2)',
                background: on ? 'var(--red-soft)' : 'var(--bg-2)',
                boxShadow: on ? 'inset 0 0 0 1px var(--red)' : 'none',
              }}
              onClick={() => switchCls(c)}
            >
              {c}
            </button>
          )
        })}
      </div>

      {/* —— 操作员自记 · 观测补录 —— */}
      <section className={css.ownSection}>
        <div className={css.groupHead}>
          <span className={css.groupMark} />
          <span className={css.groupTitle}>操作员自记</span>
          <span className={css.groupSub}>OBSERVER NOTES</span>
          <span className={css.groupCount}>{ownEnds.length} 条</span>
          <button
            className="btn btn--ghost"
            style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px' }}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? '收起录入' : '＋ 新增观测条目'}
          </button>
        </div>

        {adding ? (
          <div className={css.addPanel}>
            <div className={css.fieldGrid}>
              <label className={css.field}>
                <span>条目名称 *</span>
                <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="如：深夜的红线" />
              </label>
              <label className={css.field}>
                <span>观测编号</span>
                <input value={f.no} onChange={(e) => set('no', e.target.value)} placeholder="如 3922（可留空）" />
              </label>
              <label className={css.field}>
                <span>别名 / 学名</span>
                <input value={f.alias} onChange={(e) => set('alias', e.target.value)} placeholder="拉丁或代号（可留空）" />
              </label>
              <label className={css.field}>
                <span>Stage 分级</span>
                <select value={f.stage} onChange={(e) => set('stage', Number(e.target.value))}>
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s < 0 ? '未解明' : `Stage ${s}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className={css.field}>
                <span>阶段关键词</span>
                <input value={f.stageKw} onChange={(e) => set('stageKw', e.target.value)} placeholder="如 『活性化』" />
              </label>
              <label className={css.field}>
                <span>原法分类</span>
                <select value={f.klass} onChange={(e) => set('klass', e.target.value)}>
                  {CLASS_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className={css.field}>
                <span>处置状态</span>
                <select value={f.state} onChange={(e) => set('state', e.target.value as OwnEndEntry['state'])}>
                  <option value="活跃">活跃</option>
                  <option value="抑制">抑制</option>
                  <option value="收容">收容</option>
                  <option value="已清除">已清除</option>
                </select>
              </label>
            </div>
            <label className={css.field}>
              <span>来历 *</span>
              <textarea rows={2} value={f.origin} onChange={(e) => set('origin', e.target.value)} placeholder="在何处遭遇 / 记录缘起……" />
            </label>
            <label className={css.field}>
              <span>详细</span>
              <textarea rows={3} value={f.detail} onChange={(e) => set('detail', e.target.value)} placeholder="观测细节、特征、相关事件……" />
            </label>
            <label className={css.field}>
              <span>应对要点</span>
              <textarea rows={2} value={f.counter} onChange={(e) => set('counter', e.target.value)} placeholder="若为反现实实体，写清应对方式……" />
            </label>
            <div className={css.saveRow}>
              <span className={css.saveHint}>自记条目将写入本机存档，仅操作员可见。</span>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setAdding(false)}>
                取消
              </button>
              <button className="btn btn--primary" style={{ fontSize: 12 }} disabled={!canSave} onClick={doAdd}>
                写入自记
              </button>
            </div>
          </div>
        ) : null}

        {ownSorted.length ? (
          <div className={css.list} style={{ marginTop: 12 }}>
            {ownSorted.map((o) => {
              const open = openId === o.id
              const st = STATE_META[o.state] ?? { cls: 'chip', color: 'var(--ink-mute)', label: o.state }
              return (
                <article key={o.id} className={css.item} style={{ '--c': 'var(--amber)' } as CSSProperties}>
                  <button
                    className={`${css.itemRow} ${open ? css['open'] : ''}`}
                    onClick={() => setOpenId(open ? null : o.id)}
                    aria-expanded={open}
                  >
                    <span className={css.itemStage}>
                      <span className={css['s']} style={{ color: 'var(--amber)', fontSize: 20 }}>{o.stage < 0 ? '?' : o.stage}</span>
                      <small>{o.stageKw}</small>
                    </span>
                    <span className={css.itemMain}>
                      <b>{o.name}</b>
                      <span className={css.alias}>{o.alias || o.no || 'SELF-REGISTERED'}</span>
                      <p className={open ? css['open'] : ''}>{o.origin}</p>
                    </span>
                    <span className={css.itemRight}>
                      <span className={`${st.cls}`}>{st.label}</span>
                      <span className={css.tagSelf}>自记</span>
                      <span className={css.chev}>›</span>
                    </span>
                  </button>

                  <div className={`${css.expand} ${open ? css['open'] : ''}`}>
                    <div className={css.expBody}>
                      <div className={css.expLabel}>○ 来历</div>
                      <p className={css.expText}>{o.origin}</p>
                      {o.detail ? (
                        <>
                          <div className={css.expLabel}>○ 详细</div>
                          <p className={css.expText}>{o.detail}</p>
                        </>
                      ) : null}
                      {o.counter ? (
                        <div className={css.counterBox} style={{ marginTop: 12 }}>
                          <b>应对要点 · COUNTERMEASURE</b>
                          <span>{o.counter}</span>
                        </div>
                      ) : null}
                      <div className={css.expFoot}>
                        <span className={css.refChip}>操作员自记 · {fmtTs(o.ts)}</span>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto' }} onClick={() => doRemove(o)}>
                          删除此条
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className={css.groupEmpty} style={{ fontSize: 12.5 }}>
            尚无自记条目。阅读正文或推进剧情后，如需补充委员会档案之外的观测，可点上方「新增观测条目」手动补录。
          </div>
        )}
      </section>

      {/* —— 委员会收录档案 —— */}
      {groups.map(([groupKey, list]) => (
        <section key={groupKey}>
          <div className={css.groupHead}>
            <span className={css.groupMark} />
            <span className={css.groupTitle}>{groupKey}</span>
            <span className={css.groupSub}>{list[0]?.classes[1] ?? 'primary class'}</span>
            <span className={css.groupCount}>{list.length} 条</span>
          </div>
          <div className={css.list}>
            {list.map((e) => {
              const open = openId === e.id
              const sealed = sealedOf(e)
              const reg = isEndReg(e.id)
              const st = STATE_META[e.state] ?? { cls: 'chip', color: 'var(--ink-mute)', label: e.state }
              const stageNum = e.stage >= 0 ? String(e.stage) : '?'
              const accent = reg ? 'var(--red)' : sealed ? 'var(--line-2)' : 'var(--steel)'
              const tag = statusTag(e)
              return (
                <article
                  key={e.id}
                  className={`${css.item} ${reg ? css['itemReg'] : sealed ? css['itemSeal'] : ''}`}
                  style={{ '--c': accent } as CSSProperties}
                >
                  <button
                    className={`${css.itemRow} ${open ? css['open'] : ''}`}
                    onClick={() => setOpenId(open ? null : e.id)}
                    aria-expanded={open}
                  >
                    <span className={css.itemStage}>
                      <span className={css['s']} style={{ color: reg ? 'var(--red)' : sealed ? 'var(--ink-faint)' : 'var(--ink-mute)' }}>{stageNum}</span>
                      <small>{e.stageKw}</small>
                    </span>
                    <span className={css.itemMain}>
                      <b>{e.name}</b>
                      <span className={css.alias}>{e.alias}</span>
                      <p className={open ? css['open'] : ''}>{sealed ? '封存条目——情报未解封，需登记后方可阅览。' : e.origin}</p>
                    </span>
                    <span className={css.itemRight}>
                      <span className={`${st.cls}`}>{st.label}</span>
                      <span className={tag.cls}>{tag.text}</span>
                      <span className={css.chev}>›</span>
                    </span>
                  </button>

                  <div className={`${css.expand} ${open ? css['open'] : ''}`}>
                    <div className={css.expBody}>
                      {sealed ? (
                        <div className={css.seal}>
                          <div className={css.sealTitle}>档案封存 · 未解明</div>
                          <p className={css.sealText}>
                            「{e.name}」在委员会档案中处于封存状态。此条目与正文事件暂无编号关联，
                            无法随剧情自动登记——如你已在某段故事中与之遭遇，可手动解封登记以补全观测记录。
                          </p>
                          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => doRegister(e)}>
                            登记此条 · 解封档案
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className={css.expLabel}>○ 来历</div>
                          <p className={css.expText}>{e.origin}</p>
                          <div className={css.expLabel}>○ 详细</div>
                          <p className={css.expText}>{e.detail}</p>
                          <div className={css.counterBox}>
                            <b>应对要点 · COUNTERMEASURE</b>
                            <span>{e.counter}</span>
                          </div>
                          <div className={css.expFoot}>
                            {e.classes.map((c) => (
                              <span key={c} className={css.classChip}>{c}</span>
                            ))}
                            <span className={css.refChip}>主要出处 · {e.ref ?? '—'}</span>
                            {!reg ? (
                              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => doRegister(e)}>
                                登记为已遭遇
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className={css.groupEmpty}>
          {mode === 'sealed' ? '当前分类下没有封存未解的记录。' : mode === 'met' ? '当前分类下还没有已遭遇登记。' : '该分类下没有符合条件的记录。'}
        </div>
      ) : null}
    </div>
  )
}
