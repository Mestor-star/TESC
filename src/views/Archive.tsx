import { useState } from 'react'
import type { CSSProperties } from 'react'
import { X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { SIDECAST } from '../data/sidecast'
import type { SideCastEntry } from '../data/sidecast'
import { bondName } from '../lib/format'
import type { Character, CharacterStat } from '../data/types'

import css from './Archive.module.css'

const STAT_HINT: Record<string, string> = {
  破坏力: '战斗中的破坏／攻击强度',
  敏捷度: '速度 · 反应 · 机动',
  物理抗性: '对物理伤害与躯体的耐受',
  反现实亲和: '与反现实／终末的亲和与介入深度',
  意志力: '精神韧性 · 抵御侵蚀与人格篡夺',
}

const AXIS_ORDER = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']

function statOf(c: Character, key: string): number {
  const s = c.stats.find((x: CharacterStat) => x.key === key)
  return s ? s.value : 0
}

export function Archive() {
  const { operatorName, bondNow, push } = useTerminal()
  const [openId, setOpenId] = useState<string | null>(null)
  const focus = CHARACTERS.find((c) => c.id === openId) ?? null
  const name = operatorName.trim() ? operatorName : '低语者'

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">DATA / ARCHIVE</div>
          <h1>角色档案</h1>
          <div className="vhead__sub">
            苍之学园体验入学者的个人档案。能力参数以委员会状态模拟五轴评定：
            破坏力 · 敏捷度 · 物理抗性 · 反现实亲和 · 意志力。羁绊值随时间线逐段事件而变化。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip chip--warn">参数为终端内模拟值</span>
          <span className="chip">档案随事件解锁</span>
        </div>
      </div>

      {/* 能力五轴说明 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
        {AXIS_ORDER.map((k) => (
          <div key={k} className="tag" style={{ lineHeight: 1.5, padding: '8px 10px', borderRadius: 2 }}>
            <b style={{ color: 'var(--ink)' }}>{k}</b>
            <span style={{ display: 'block', marginTop: 2, fontSize: 10.5 }}>{STAT_HINT[k]}</span>
          </div>
        ))}
      </div>

      {/* 操作员横幅 */}
      <div className={css.opBanner}>
        <div className={css.opGlyph}>{name.slice(0, 1).toUpperCase()}</div>
        <div className={css.opBannerMain}>
          <h2>言万心叶 <em>（你 · 操作员本人）</em></h2>
          <p>
            苍之学园 体验入学 · 低语者（Susurrador）。以读心为名登记在册的终末潜力 Stage4『活性化』——
            读取半径约 500 米内他人心声的读心者，也正因为听得见，才比谁都更怕「不被喜欢」。
          </p>
          <div className={css.opChips}>
            <span className="chip chip--on">低语者 Susurrador</span>
            <span className="chip">Stage4『活性化』</span>
            <span className="chip">读心半径 ≈ 500m</span>
            <span className="chip">担保人 · 学生会长 艾莉芙・安纳托利亚</span>
          </div>
        </div>
        <div className={css.opAction}>
          <button
            className="btn btn--ghost"
            style={{ fontSize: 12 }}
            onClick={() => push('info', '操作员档案', `${name} · 言万心叶。角色档案只记录他人——你的故事，写在时间线里。`, false)}
          >
            我是谁？
          </button>
        </div>
      </div>

      {/* 成员卡片 */}
      <div className={css.cards}>
        {CHARACTERS.map((c) => {
          const bond = bondNow(c.id)
          return (
            <article key={c.id} className={css.card} style={{ '--c': c.hue } as CSSProperties}>
              <div className={css.cardHead}>
                <span className="glyph" style={{ '--g': c.hue, width: 46, height: 46 }}>
                  <span>{c.sigil}</span>
                </span>
                <div>
                  <div className={css.cardNo}>{c.no} · {c.callsign}</div>
                  <div className={css.cardName}>
                    <h3>{c.name}</h3>
                    <span>{c.role}</span>
                  </div>
                  <div className={css.cardEpithet}>{c.epithet}</div>
                </div>
              </div>

              <div className={css.cardQuote}>{c.quote}</div>

              <div className={css.cardBody}>
                <div className={css.kvBlock}>
                  <div className={css.kvCell}><small>所属</small><b>{c.division}</b></div>
                  <div className={css.kvCell}><small>弹痕 / 特性</small><b>{c.scar}</b></div>
                  <div className={css.kvCell}><small>终末潜力</small><b>{c.potential}</b></div>
                  <div className={css.kvCell}><small>状态</small><b>{c.station}</b></div>
                </div>

                <div>
                  {AXIS_ORDER.map((k) => (
                    <div key={k} className={css.stat}>
                      <small>{k}</small>
                      <div className="meter">
                        <div className="meter__fill" style={{ width: `${statOf(c, k)}%`, background: `linear-gradient(90deg, ${c.hue}66, ${c.hue})` }} />
                      </div>
                      <span className="num">{statOf(c, k)}</span>
                    </div>
                  ))}
                </div>

                <div className={css.bondRow}>
                  <span className={css.bondName} style={{ color: c.hue, borderColor: `${c.hue}88`, background: `${c.hue}1e` }}>
                    当前羁绊 {bondName(bond)} · {bond}
                  </span>
                </div>
              </div>

              <div className={css.cardFoot}>
                <span className={css.cardStatusNote}>{c.stationNote}</span>
                <button className="linkGo" onClick={() => setOpenId(c.id)}>展开档案</button>
              </div>
            </article>
          )
        })}
      </div>

      {/* 详情弹窗 */}
      {focus ? (
        <div className={css.overlay} onClick={() => setOpenId(null)}>
          <div className={css.dialog} onClick={(e) => e.stopPropagation()} style={{ '--c': focus.hue } as CSSProperties}>
            <div className={css.dialogHead}>
              <span className="glyph glyph--lg" style={{ '--g': focus.hue }}>
                <span>{focus.sigil}</span>
              </span>
              <div className={css.dialogTitle}>
                <small>{focus.no} · {focus.callsign} · {focus.role}</small>
                <h3>{focus.name}</h3>
                <div style={{ color: focus.hue, fontSize: 13, marginTop: 2 }}>{focus.epithet}</div>
              </div>
              <button className={css.dialogClose} onClick={() => setOpenId(null)} aria-label="关闭">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className={css.dialogBody}>
              <p className={css.dialogBio}>{focus.bio}</p>

              <div className={css.dialogSection}>
                <h4>档案信息</h4>
                <div className={css.kvBlock}>
                  <div className={css.kvCell}><small>所属</small><b>{focus.division}</b></div>
                  <div className={css.kvCell}><small>定位</small><b>{focus.role}</b></div>
                  <div className={css.kvCell}><small>弹痕 / 特性</small><b>{focus.scar}</b></div>
                  <div className={css.kvCell}><small>终末潜力</small><b>{focus.potential}</b></div>
                  <div className={css.kvCell}><small>状态</small><b>{focus.station} · {focus.stationNote}</b></div>
                  <div className={css.kvCell}><small>代表台词</small><b>{focus.quote}</b></div>
                </div>
              </div>

              <div className={css.dialogSection}>
                <h4>能力参数（五轴评定）</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {AXIS_ORDER.map((k) => (
                    <div key={k} className={css.stat}>
                      <small>{k}</small>
                      <div className="meter">
                        <div className="meter__fill" style={{ width: `${statOf(focus, k)}%`, background: `linear-gradient(90deg, ${focus.hue}66, ${focus.hue})` }} />
                      </div>
                      <span className="num">{statOf(focus, k)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={css.dialogSection}>
                <h4>当前羁绊</h4>
                <div className={css.relationGrid}>
                  <div className="meter meter--thick">
                    <div className="meter__fill" style={{ width: `${bondNow(focus.id)}%`, background: `linear-gradient(90deg, ${focus.hue}66, ${focus.hue})` }} />
                  </div>
                  <div>
                    <span className={css.bondName} style={{ color: focus.hue, borderColor: `${focus.hue}88`, background: `${focus.hue}1e` }}>
                      {bondNow(focus.id)} · {bondName(bondNow(focus.id))}
                    </span>
                    <div className="tiny muted" style={{ marginTop: 6 }}>随你读到的每一段事件变化。</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <SideCastSection />
    </div>
  )
}

/* ================= 其余登场者（协力者登记） ================= */
const SIDE_PALETTE = [
  '#8fd8ff', '#ffb454', '#54d2a0', '#ff7a9b', '#c9b2ff',
  '#f0a35e', '#5fe6c8', '#ff5d73', '#9fd0ff', '#e2d27c',
  '#b48cff', '#6fe0e0', '#ff9a8a', '#a7e06f',
]

function SideCastSection() {
  const [sel, setSel] = useState(0)
  const vols = Array.from(new Set(SIDECAST.map((e) => e.vol))).sort((a, b) => a - b)
  const shown = sel === 0 ? SIDECAST : SIDECAST.filter((e) => e.vol === sel)

  return (
    <section className={css.sideSection}>
      <div className={css.sideBand}>
        <div className={css.sideBandIntro}>
          <div className={css.sideKicker}>REGISTER / 协力者 · 敌对者 · 其他重要他人</div>
          <h2>登场者登记</h2>
          <p>
            主役四人之外，于时间线中实际出场、留下名字的人们。自第 1 卷起逐卷登记——
            以下条目均逐字摘录自各卷卷首「登场人物」页或原文初登场叙述，不作杜撰。
          </p>
        </div>
        <div className={css.sideFilters} role="tablist" aria-label="按登场卷筛选登记人物">
          <button className={`${css.filt} ${sel === 0 ? css.filtOn : ''}`} onClick={() => setSel(0)}>
            全部 <i>{SIDECAST.length}</i>
          </button>
          {vols.map((v) => (
            <button key={v} className={`${css.filt} ${sel === v ? css.filtOn : ''}`} onClick={() => setSel(v)}>
              第{v}卷 <i>{SIDECAST.filter((e) => e.vol === v).length}</i>
            </button>
          ))}
        </div>
      </div>

      <div className={css.sideGrid}>
        {shown.map((e: SideCastEntry) => {
          const idx = SIDECAST.indexOf(e)
          const hue = SIDE_PALETTE[idx % SIDE_PALETTE.length]
          return (
            <article key={e.id} className={`${css.card} ${css.sideCard}`} style={{ '--c': hue } as CSSProperties}>
              <div className={css.cardHead}>
                <span className={css.sideMonogram} style={{ color: hue, borderColor: `${hue}77`, background: `${hue}18` }}>
                  {e.name.slice(0, 1)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className={css.cardNo}>{e.volLabel} · 登场</div>
                  <div className={css.cardName}>
                    <h3>{e.name}</h3>
                  </div>
                  <div className={css.cardEpithet}>{e.role}</div>
                </div>
              </div>
              <div className={css.sideDesc}>{e.desc}</div>
              <div className={`${css.cardQuote} ${css.sideQuote}`}>{e.quote}</div>
              <div className={css.cardFoot}>
                <span className={css.sideSrc}>{e.page}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
