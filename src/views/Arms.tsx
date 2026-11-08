import { useMemo, useState } from 'react'
import { ARMS, ARM_TRADITIONS } from '../data/arms'
import type { ArmEntry, ArmKind } from '../data/types'
import { useTerminal } from '../terminal/Terminal'

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
          <span className="chip">密级 · 委员会军械录</span>
        </div>
      </div>

      <div className={css.shell}>
        <aside className={css.index}>
          {(['全部', ...KINDS] as const).map((k) => (
            <button
              key={k}
              className={`${css.idxRow} ${kind === k ? css.idxOn : ''}`}
              onClick={() => { setKind(k); setOpenId(null) }}
            >
              <span>{k}</span>
              <span className={css.idxNum}>{counts[k] ?? 0}</span>
            </button>
          ))}
        </aside>

        <div className={css.body}>
          {groups.map((g) => (
            <section key={g.trad.kind} className={css.group}>
              <div className={css.tradHead}>
                <span className={css.tradKind}>{g.trad.kind}</span>
                <span className={css.tradSub}>{g.trad.sub}</span>
                <span className={css.tradSchool}>{g.trad.school}</span>
              </div>
              <p className={css.tradText}>{g.trad.statue}</p>
              <p className={css.tradText}>{g.trad.basis}</p>
              <p className={css.tradText}>{g.trad.note}</p>
              <p className={css.tradQuote}>「{g.trad.quote}」</p>

              <div className={css.groupHead}>
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
                        <article key={a.id} className={css.item} data-locked-id={a.id}>
                          <div className={css.lockRow}>
                            <span className={css.lockMark}>？？？</span>
                            <span className={css.lockHint}>首见持有者 · 或读到揭示段落后解锁</span>
                            <span className={css.lockCode}>LOCKED · {a.kind}</span>
                          </div>
                        </article>
                      )
                    }
                    shown++
                    const open = openId === a.id
                    return (
                      <article key={a.id} className={css.item} data-arm-id={a.id}>
                        <button
                          className={`${css.row} ${open ? css.rowOn : ''}`}
                          onClick={() => setOpenId(open ? null : a.id)}
                          aria-expanded={open}
                        >
                          <span className={css.no}>{String(shown).padStart(2, '0')}</span>
                          <span className={css.main}>
                            <span className={css.name}>『{a.name}』</span>
                            <span className={css.alias}>{a.sub}</span>
                            <span className={css.power}>{a.power}</span>
                          </span>
                          <span className={css.meta}>
                            <span className={css.kindTag}>{a.kind}</span>
                            <span className={css.holder}>
                              <i>持有</i>{a.holder}
                            </span>
                          </span>
                        </button>

                        {open ? (
                          <div className={css.detail}>
                            <div className={css.kv}>
                              <span className={css.k}>持有者</span>
                              <span className={css.v}>
                                <b>{a.holder}</b>
                                <span className={css.holderNote}>{a.holderNote}</span>
                              </span>
                            </div>
                            <div className={css.kv}>
                              <span className={css.k}>本相</span>
                              <span className={css.v}>{a.phrase}</span>
                            </div>
                            <div className={css.kv}>
                              <span className={css.k}>力量</span>
                              <span className={css.v}>{a.power}</span>
                            </div>
                            {a.awakened ? (
                              <div className={css.kv}>
                                <span className={css.k}>到达点 · AWAKENED</span>
                                <span className={css.v}>{a.awakened}</span>
                              </div>
                            ) : null}
                            <div className={css.kv}>
                              <span className={css.k}>首见</span>
                              <span className={css.v}>{a.ref}</span>
                            </div>
                            <div className={css.metaRow}>
                              <span>{g.trad.school}</span>
                              <span>{a.kind}</span>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    )
                  })
                })()}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
