import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ARMS, ARM_TRADITIONS } from '../data/arms'
import type { ArmKind } from '../data/types'

import css from './Arms.module.css'

const KINDS: ArmKind[] = ['弹痕', '斩击', '片羽']

export function Arms() {
  const [kind, setKind] = useState<ArmKind | '全部'>('全部')
  const [openId, setOpenId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m: Record<string, number> = { 全部: ARMS.length }
    for (const a of ARMS) m[a.kind] = (m[a.kind] ?? 0) + 1
    return m
  }, [])

  const groups = useMemo(() => {
    const visible = kind === '全部' ? KINDS : KINDS.filter((k) => k === kind)
    return visible
      .map((k) => ({
        trad: ARM_TRADITIONS.find((t) => t.kind === k)!,
        list: ARMS.filter((a) => a.kind === k),
      }))
      .filter((g) => g.list.length > 0)
  }, [kind])

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">ARMS / REGISTER</div>
          <h1>武装图鉴</h1>
          <div className="vhead__sub">
            弹痕、斩击、片羽——三学园系谱的反现实武装。它们形态各异，本质却只有一个：
            为持有者实现渴望，即，与绝望战斗。编号按系谱分列，内容依原作考据整理。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip">收录武装 {counts['全部']}</span>
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
            <small>{k === '全部' ? '收录武装' : k}</small>
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
          {/* 系谱传统卡 */}
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
            <span className={css.groupCount}>{g.list.length} 件</span>
          </div>

          <div className={css.list}>
            {g.list.map((a, i) => {
              const open = openId === a.id
              return (
                <article
                  key={a.id}
                  className={css.item}
                  style={{ '--c': g.trad.color } as CSSProperties}
                >
                  <button
                    className={`${css.itemRow} ${open ? css.open : ''}`}
                    onClick={() => setOpenId(open ? null : a.id)}
                    aria-expanded={open}
                  >
                    <span className={css.itemNo}>
                      <span className={css.no}>{String(i + 1).padStart(2, '0')}</span>
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
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
