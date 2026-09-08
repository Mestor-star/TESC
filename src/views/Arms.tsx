import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Lock } from '@phosphor-icons/react'
import { ARMS, ARM_TRADITIONS } from '../data/arms'
import type { ArmEntry, ArmKind } from '../data/types'
import { useTerminal } from '../terminal/Terminal'

import css from './Arms.module.css'

const KINDS: ArmKind[] = ['弹痕', '斩击', '片羽']

/**
 * 图鉴门禁（P8）：
 *  无 holderId 且无 revealAt → 恒显（公开条目，如「泣泪巨鸟」「森林的诅咒」等）。
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
                color: on ? '#fff' : 'var(--ink-dim)',
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
                            <div className={css.expLabel} style={{ color: 'var(--red)' }}>○ 到达点 · AWAKENED</div>
                            <p className={css.expText}>{a.awakened}</p>
                          </>
                        ) : null}
                        <div className={css.expFoot}>
                          <span className={css.schoolChip}>{g.trad.school}</span>
                          <span className={css.schoolChip} style={{ borderColor: g.trad.color, color: g.trad.color }}>{a.kind}</span>
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
    </div>
  )
}
