import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Lock } from '@phosphor-icons/react'
import { ARMS, ARM_TRADITIONS } from '../data/arms'
import { RESEARCH, RESEARCH_LINES } from '../data/research'
import type { ResearchEffect, ResearchNode } from '../data/research'
import { investResearch, researchStatusOf, syncResearch, useResearch } from '../lib/research'
import type { ArmEntry, ArmKind } from '../data/types'
import { useTerminal } from '../terminal/Terminal'
import { inkOf } from '../lib/hue'

import css from './Arms.module.css'

const KINDS: ArmKind[] = ['弹痕', '斩击', '片羽', '特殊武器']

/**
 * 图鉴门禁（P8）：
 *  无 holderId 且无 revealAt → 恒显（公开条目，如「泣泪巨鸟」「喜讯喜讯」等）。
 *  仅 holderId → 需「遇见」持有者（isMet）后点亮。
 *  仅 revealAt → 需收束该事件（epDone[revealAt]）后点亮（操作员的 noapusa / a Session. 属此）。
 *  二者皆有 → 按 gate 取：'holder' 只需持有者已见；'event' 只需事件收束；缺省两者皆须满足。
 * 锁定的条目以灰卡「？？？/首见或被告知后解锁」占位，不泄出本体 / 持有者 / 力量。
 * 读毕 / 收束即视为「被告知」，计数一律在过滤后计算。
 */
function visibleOf(a: ArmEntry, isMet: (id: string) => boolean, epDone: Record<string, true>): boolean {
  const hasHolder = !!a.holderId
  const hasReveal = !!a.revealAt
  if (!hasHolder && !hasReveal) return true
  const hOk = !hasHolder || isMet(a.holderId!)
  const eOk = !hasReveal || !!epDone[a.revealAt!]
  if (hasHolder && hasReveal) {
    if (a.gate === 'holder') return hOk
    if (a.gate === 'event') return eOk
  }
  return hOk && eOk
}

/* ============================================================
   研究室（书架曼荼罗那一侧的门路）
   ------------------------------------------------------------
   挂在武装图鉴底下，**不新开导航项**：图鉴读的是「队里拿什么打」，研究室读的是
   「为什么这样打更痛」—— 本来就是同一页的两件事。

   三条线、每个节点一张卡（见 data/research.ts）。三种状态：
     done   已研成（绿，按钮收起）
     ready  可研（点数够、前置已研，按钮可点）
     locked 锁定（写明差在哪：前置是谁 / 还差几点）
   点下去：扣点 → 置 done → push 一条观测记录 → 战斗与档案两侧的读数立刻跟着变
   （derive 与 Archive 读的都是 lib/research.ts 那一份 researchBonus()）。
   ============================================================ */

/** 一份 effect 念成人话：按四条比例偏序，写的顺序照「攻击 / 生命 / 物理抗性 / 反现实亲和」 */
function effectTextOf(e: ResearchEffect): string {
  const parts: string[] = []
  if (e.atk) parts.push(`攻击 +${(e.atk * 100).toFixed(1)}%`)
  if (e.hp) parts.push(`生命 +${(e.hp * 100).toFixed(1)}%`)
  if (e.resPhysical) parts.push(`物理抗性 +${(e.resPhysical * 100).toFixed(1)}%`)
  if (e.aff) parts.push(`反现实亲和 +${(e.aff * 100).toFixed(1)}%`)
  return parts.join(' · ')
}

function ResearchNodeCard({ node }: { node: ResearchNode }) {
  const { push } = useTerminal()
  const status = researchStatusOf(node)
  const prev = node.require ? RESEARCH.find((n) => n.id === node.require) : null
  const tint = status === 'done' ? 'var(--jade)' : status === 'ready' ? 'var(--amber)' : 'var(--line-2)'
  return (
    <article
      className={css.item}
      style={{ '--c': tint, minWidth: 0 } as CSSProperties}
      data-research-node={node.id}
      data-research-state={status}
      data-research-cost={node.cost}
    >
      <div className={css.expBody} style={{ minWidth: 0 }}>
        <div className={css.expLabel}>
          第 {node.tier} 层 · {node.name}
        </div>
        <p className={css.expText} style={{ overflowWrap: 'anywhere' }}>{node.desc}</p>
        <div className={css.expFoot} style={{ flexWrap: 'wrap' }}>
          <span className={css.schoolChip}>{effectTextOf(node.effect)}</span>
          <span className={css.schoolChip}>成本 · {node.cost} 点</span>
          {prev && status !== 'done' ? (
            <span className={css.refChip}>前置 · {prev.name}</span>
          ) : null}
        </div>
        {status === 'done' ? (
          <span className="chip chip--on" data-research-done>已研成</span>
        ) : (
          <button
            className="btn btn--ghost"
            style={{ fontSize: 12, marginTop: 8 }}
            disabled={status === 'locked'}
            onClick={() => {
              const res = investResearch(node.id)
              if (!res.ok) {
                push('warn', `研究室 · 投不进去`, res.reason ?? '这一项此刻研不了。', false)
                return
              }
              push(
                'success',
                `研究室 · 「${node.name}」研成`,
                `投入 ${node.cost} 研究点 —— ${effectTextOf(node.effect)}（全队 · 我方战斗面板）。`,
                false,
              )
            }}
          >
            {status === 'ready' ? '投入研究点' : '研究点不足'}
          </button>
        )}
      </div>
    </article>
  )
}

function ResearchLab() {
  const { epDone, push } = useTerminal()
  const save = useResearch()

  /* 研究点按来源重算（幂等）：段数来自剧情进度，作战记录在 lib/research 里边动态读。
     只挂 [epDone] —— 同步本身会改存档，挂上存档就会自己咬自己。 */
  useEffect(() => {
    let alive = true
    void syncResearch(Object.keys(epDone).length).then((delta) => {
      if (!alive || delta <= 0) return
      push('info', '研究室 · 观测清算', `新入账 ${delta} 研究点。`, false)
    })
    return () => { alive = false }
  }, [epDone, push])

  const done = RESEARCH.filter((n) => save.done[n.id]).length

  return (
    <section data-research-lab style={{ marginTop: 28 }}>
      <div className={css.groupHead}>
        <span className={css.groupMark} style={{ background: 'var(--amber)' }} />
        <span className={css.groupTitle}>研究室 · 书架曼荼罗</span>
        <span className={css.groupCount}>
          研究点 {save.points} · 已研 {done}/{RESEARCH.length}
        </span>
      </div>
      <div className="tiny muted" style={{ margin: '0 0 12px', lineHeight: 1.7 }}>
        委员会与书架曼荼罗换知识的门路一直是通的。观测攒下来的东西拿去换目录，
        换回来的不是新武器，是全队都受用的一层读数 —— 它直接乘在我方的战斗面板上，
        敌方不吃这一份。点数来自：主线收束、任务完成、击破具名首领。
      </div>

      {RESEARCH_LINES.map((line) => {
        const nodes = RESEARCH.filter((n) => n.line === line.id)
        return (
          <div key={line.id} style={{ marginBottom: 18 }}>
            <div className={css.groupHead}>
              <span className={css.groupMark} style={{ background: 'var(--steel)' }} />
              <span className={css.groupTitle}>{line.id}</span>
              <span className={css.groupCount}>{line.sub}</span>
            </div>
            <div className="tiny muted" style={{ margin: '0 0 8px' }}>{line.note}</div>
            <div className={css.list} style={{ minWidth: 0 }}>
              {nodes.map((n) => <ResearchNodeCard key={n.id} node={n} />)}
            </div>
          </div>
        )
      })}
    </section>
  )
}

export function Arms() {
  const { isMet, epDone } = useTerminal()
  const [kind, setKind] = useState<ArmKind | '全部'>('全部')
  const [openId, setOpenId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m: Record<string, number> = { 全部: 0 }
    for (const a of ARMS) {
      if (!visibleOf(a, isMet, epDone)) continue
      m['全部']++
      m[a.kind] = (m[a.kind] ?? 0) + 1
    }
    return m
  }, [isMet, epDone])

  const groups = useMemo(() => {
    const visibleKinds = kind === '全部' ? KINDS : KINDS.filter((k) => k === kind)
    return visibleKinds
      .map((k) => {
        const arms = ARMS.filter((a) => a.kind === k)
        return {
          trad: ARM_TRADITIONS.find((t) => t.kind === k)!,
          arms,
          unlockedCount: arms.filter((a) => visibleOf(a, isMet, epDone)).length,
          lockedCount: arms.filter((a) => !visibleOf(a, isMet, epDone)).length,
        }
      })
      .filter((g) => g.arms.length > 0)
  }, [kind, isMet, epDone])

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">ARMS / REGISTER</div>
          <h1>武装图鉴</h1>
          <div className="vhead__sub">
            弹痕、斩击、片羽——三学园系谱的反现实武装。它们形态各异，本质却只有一个：
            为持有者实现渴望，即，与绝望战斗。多数条目只在「遇见持有者 · 或读到其揭示段落」后点亮，
            未点亮的以「？？？」留位——首见或被告知后解锁。内容依原作考据整理。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip">已点亮 {counts['全部']} 件</span>
          <span className="chip chip--warn" style={{ borderColor: 'transparent', background: 'var(--bg-2)' }}>
            密级 · 委员会军械录
          </span>
        </div>
      </div>

      <div className={css.metrics}>
        {(['全部', ...KINDS] as const).map((k) => (
          <button
            key={k}
            className={`${css.metric} ${kind === k ? css.isOn : ''}`}
            onClick={() => { setKind(k); setOpenId(null) }}
          >
            <small>{k === '全部' ? '已点亮' : k}</small>
            <b>{counts[k] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className={css.controls}>
        {(['全部', ...KINDS] as const).map((k) => {
          const on = kind === k
          const color = k === '全部' ? 'var(--steel)' : ARM_TRADITIONS.find((t) => t.kind === k)!.color
          return (
            <button
              key={k}
              className={css.kindChip}
              style={{
                '--c': color,
                borderColor: on ? color : 'var(--line-2)',
                /* 同上：那一档本色是数据表里带来的（还可能浅到发白），当字压不住 ——
                   选中的字一律走墨色，本色留给底洗与描边去认 */
                color: on ? 'var(--ink)' : 'var(--ink-dim)',
                background: on ? 'color-mix(in srgb, ' + color + ' 16%, transparent)' : 'var(--bg-2)',
                boxShadow: on ? `inset 0 0 0 1px ${color}` : 'none',
              } as CSSProperties}
              onClick={() => { setKind(k); setOpenId(null) }}
            >
              {k}
            </button>
          )
        })}
      </div>

      {groups.map((g) => (
        <section key={g.trad.kind}>
          {/* 系谱传统卡（恒显） */}
          <div
            className={css.trad}
            style={{ '--c': g.trad.color } as CSSProperties}
          >
            <div className={css.tradMark}>
              <span className={css.tradKind}>{g.trad.kind}</span>
              <small>{g.trad.sub}</small>
            </div>
            <div className={css.tradBody}>
              <div className={css.tradSchool}>{g.trad.school}</div>
              <p className={css.tradStatue}>{g.trad.statue}</p>
              <p className={css.tradBasis}>{g.trad.basis}</p>
              <p className={css.tradNote}>{g.trad.note}</p>
            </div>
            <div className={css.tradQuote}>「{g.trad.quote}」</div>
          </div>

          <div className={css.groupHead}>
            <span className={css.groupMark} style={{ background: g.trad.color }} />
            <span className={css.groupTitle}>持有武装 · {g.trad.kind}</span>
            <span className={css.groupCount}>
              {g.unlockedCount} 件已点亮
              {g.lockedCount > 0 ? ` · 另有 ${g.lockedCount} 件待解锁` : ''}
            </span>
          </div>

          <div className={css.list}>
            {(() => {
              let shown = 0
              return g.arms.map((a) => {
                const visible = visibleOf(a, isMet, epDone)
                if (!visible) {
                  return (
                    <article
                      key={a.id}
                      className={`${css.item} ${css.itemLocked}`}
                      style={{ '--c': g.trad.color } as CSSProperties}
                      data-locked-id={a.id}
                    >
                      <span className={css.lockRow}>
                        <span className={css.lockBadge}>
                          <Lock size={15} weight="fill" />
                        </span>
                        <span className={css.lockMain}>
                          <b>？？？</b>
                          <i>首见持有者 · 或读到揭示段落后解锁</i>
                        </span>
                        <span className={css.lockCode}>LOCKED · {a.kind}</span>
                      </span>
                    </article>
                  )
                }
                shown++
                const open = openId === a.id
                return (
                  <article
                    key={a.id}
                    className={css.item}
                    style={{ '--c': g.trad.color } as CSSProperties}
                    data-arm-id={a.id}
                  >
                    <button
                      className={`${css.itemRow} ${open ? css.open : ''}`}
                      onClick={() => setOpenId(open ? null : a.id)}
                      aria-expanded={open}
                    >
                      <span className={css.itemNo}>
                        <span className={css.no}>{String(shown).padStart(2, '0')}</span>
                        <small>{a.kind}</small>
                      </span>
                      <span className={css.itemMain}>
                        <b>『{a.name}』</b>
                        <span className={css.alias}>{a.sub}</span>
                        <p className={open ? css.open : ''}>{a.power}</p>
                      </span>
                      <span className={css.itemRight}>
                        <span className={css.holderChip}>
                          <i>持有</i>{a.holder}
                        </span>
                        <span className={css.chev}>›</span>
                      </span>
                    </button>

                    <div className={`${css.expand} ${open ? css.open : ''}`}>
                      <div className={css.expBody}>
                        <div className={css.expGrid}>
                          <div className={css.expCol}>
                            <div className={css.expLabel}>○ 持有者</div>
                            <p className={css.expText}>
                              <b className={css.holderName}>{a.holder}</b>
                              <span className={css.holderNote}>{a.holderNote}</span>
                            </p>
                          </div>
                          <div className={css.expCol}>
                            <div className={css.expLabel}>○ 本相</div>
                            <p className={css.expText}>{a.phrase}</p>
                          </div>
                        </div>
                        <div className={css.expLabel}>○ 力量</div>
                        <p className={css.expText}>{a.power}</p>
                        {a.awakened ? (
                          <>
                            <div className={css.expLabel} style={{ color: 'var(--violet-deep)' }}>○ 到达点 · AWAKENED</div>
                            <p className={css.expText}>{a.awakened}</p>
                          </>
                        ) : null}
                        <div className={css.expFoot}>
                          <span className={css.schoolChip}>{g.trad.school}</span>
                          {/* 传统本色是给黑底挑的浅色，当字要先过 inkOf；描边照旧用原色 */}
                          <span className={css.schoolChip} style={{ borderColor: g.trad.color, color: inkOf(g.trad.color) }}>{a.kind}</span>
                          <span className={css.refChip}>首见 · {a.ref}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })
            })()}
          </div>
        </section>
      ))}

      <ResearchLab />
    </div>
  )
}
