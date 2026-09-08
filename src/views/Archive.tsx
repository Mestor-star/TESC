import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { SIDECAST } from '../data/sidecast'
import { ROSTER_GROUPS, SIDE_AXIS, SIDE_TRAIT } from '../data/roster'
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

/** 每组所属的原貌介绍（仅复述三学园系谱与原文定位，不新造设定） */
const GROUP_NOTE: Record<string, string> = {
  ao: '「弹痕」的摇篮。以石像「弹痕的天使」授予的反现实武装闻名；主角所属的光明会 · 突击队与学生中枢皆在此园。',
  kaus: '持「斩击」的武斗学院。由学生会组织评议会[The Council] 统领，精锐「黑锤部队[Écraseurs]」名震弗尔克图斯。',
  corp: '持「片羽」的资本都市学园。以商业与学生自治著称，学生会长麾下统率学园内部警察——企业警备队。',
  out: '弗尔克图斯之外的来客与无名者——黑手党干部、异次元的访客、心叶故乡的人们。',
}

/** 非主役登场者的登记主题色（按登场顺序取用） */
const SIDE_PALETTE = [
  '#8fd8ff', '#ffb454', '#54d2a0', '#ff7a9b', '#c9b2ff',
  '#f0a35e', '#5fe6c8', '#ff5d73', '#9fd0ff', '#e2d27c',
  '#b48cff', '#6fe0e0', '#ff9a8a', '#a7e06f',
]

/* ---------------- 统一档案行 ---------------- */
interface Row {
  kind: 'core' | 'side'
  id: string
  groupKey: string
  groupLabel: string
  kicker: string      // 顶部小字（终端编号 / 登场卷）
  name: string
  alias: string       // 呼号/昵称（主役 = 定位；登场者 = 昵称）
  epithet: string     // 称号行
  division: string    // 所属
  trait: string       // 弹痕 / 片羽 / 斩击 / 特性
  potential: string   // 终末潜力
  state: string       // 状态 / 出场
  quote: string
  bio: string
  axis: number[]      // 与 AXIS_ORDER 对齐的五轴值
  hue: string
  sigil: string
  stationNote?: string
  page?: string
}

function buildRows(): Row[] {
  const core = new Map(CHARACTERS.map((c) => [c.id, c]))
  const side = new Map(SIDECAST.map((e) => [e.id, e]))
  const sideIndex = new Map(SIDECAST.map((e, i) => [e.id, i]))

  const rows: Row[] = []
  for (const g of ROSTER_GROUPS) {
    for (const id of g.ids) {
      const c = core.get(id)
      if (c) {
        rows.push({
          kind: 'core',
          id: c.id,
          groupKey: g.key,
          groupLabel: g.label,
          kicker: `${c.no} · ${c.callsign}`,
          name: c.name,
          alias: c.role,
          epithet: c.epithet,
          division: c.division,
          trait: c.scar,
          potential: c.potential,
          state: c.station,
          quote: c.quote,
          bio: c.bio,
          axis: AXIS_ORDER.map((k) => statOf(c, k)),
          hue: c.hue,
          sigil: c.sigil,
          stationNote: c.stationNote,
        })
        continue
      }
      const e = side.get(id)
      if (e) {
        const idx = sideIndex.get(id) ?? 0
        const hue = SIDE_PALETTE[idx % SIDE_PALETTE.length]
        rows.push({
          kind: 'side',
          id: e.id,
          groupKey: g.key,
          groupLabel: g.label,
          kicker: `${e.volLabel} · 登场登记`,
          name: e.name,
          alias: e.alias,
          epithet: e.role,
          division: g.label,
          trait: SIDE_TRAIT[id] ?? '—',
          potential: '—',
          state: `第 ${e.vol} 卷 · 登场`,
          quote: e.quote,
          bio: e.desc,
          axis: SIDE_AXIS[id] ?? [0, 0, 0, 0, 0],
          hue,
          sigil: e.name.slice(0, 1),
          page: e.page,
        })
      }
    }
  }
  return rows
}

function Meters({ row }: { row: Row }) {
  return (
    <>
      {AXIS_ORDER.map((k, i) => {
        const v = row.axis[i] ?? 0
        return (
          <div key={k} className={css.stat}>
            <small>{k}</small>
            <div className="meter">
              <div
                className="meter__fill"
                style={{ width: `${v}%`, background: `linear-gradient(90deg, ${row.hue}66, ${row.hue})` }}
              />
            </div>
            <span className="num">{v}</span>
          </div>
        )
      })}
    </>
  )
}

export function Archive() {
  const { operatorName, bondNow, push } = useTerminal()
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = useMemo(buildRows, [])
  const focus = rows.find((r) => r.id === openId) ?? null
  const focusBond = focus && focus.kind === 'core' ? bondNow(focus.id) : null
  const name = operatorName.trim() ? operatorName : '低语者'

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">DATA / ARCHIVE</div>
          <h1>角色档案</h1>
          <div className="vhead__sub">
            委员会全量角色档案：主役与其余登场者并置同一名册，按学院／所属归组，格式一致。
            能力参数以委员会状态模拟五轴评定——破坏力 · 敏捷度 · 物理抗性 · 反现实亲和 · 意志力；
            其余登场者数值为终端近似评定。羁绊值随时间线逐段事件而变化。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip chip--warn">登场者五轴为近似评定</span>
          <span className="chip">全员档案 · 按所属归组</span>
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

      {/* 全量档案 · 按所属归组 */}
      {ROSTER_GROUPS.map((g) => {
        const members = rows.filter((r) => r.groupKey === g.key)
        return (
          <section key={g.key} className={css.group} style={{ '--ga': groupAccent(g.key) } as CSSProperties}>
            <header className={css.groupBand}>
              <div className={css.groupTitleBox}>
                <h2 className={css.groupTitle}>
                  {g.label}
                  <i>{members.length} 人</i>
                </h2>
                <p className={css.groupNote}>{GROUP_NOTE[g.key] ?? ''}</p>
              </div>
            </header>
            <div className={css.cards}>
              {members.map((r) => {
                const bond = r.kind === 'core' ? bondNow(r.id) : null
                return (
                <article key={r.id} className={css.card} style={{ '--c': r.hue } as CSSProperties}>
                  <div className={css.cardHead}>
                    <span className="glyph" style={{ '--g': r.hue, width: 46, height: 46 }}>
                      <span>{r.sigil}</span>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className={css.cardNo}>{r.kicker}</div>
                      <div className={css.cardName}>
                        <h3>{r.name}</h3>
                        {r.alias && r.alias !== r.name ? <span>{r.alias}</span> : null}
                      </div>
                      <div className={css.cardEpithet}>{r.epithet}</div>
                    </div>
                  </div>

                  <div className={css.cardQuote}>{r.quote}</div>

                  <div className={css.cardBody}>
                    <div className={css.kvBlock}>
                      <div className={css.kvCell}><small>所属</small><b>{r.division}</b></div>
                      <div className={css.kvCell}><small>弹痕 / 特性</small><b>{r.trait}</b></div>
                      <div className={css.kvCell}><small>终末潜力</small><b>{r.potential}</b></div>
                      <div className={css.kvCell}><small>状态 · 出场</small><b>{r.state}</b></div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Meters row={r} />
                    </div>

                    {bond !== null ? (
                      <div className={css.bondRow}>
                        <span className={css.bondName} style={{ color: r.hue, borderColor: `${r.hue}88`, background: `${r.hue}1e` }}>
                          当前羁绊 {bondName(bond)} · {bond}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className={css.cardFoot}>
                    <span className={css.cardStatusNote}>{r.stationNote ?? r.page ?? ''}</span>
                    <button className="linkGo" onClick={() => setOpenId(r.id)}>展开档案</button>
                  </div>
                </article>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* 详情弹窗 */}
      {focus ? (
        <div className={css.overlay} onClick={() => setOpenId(null)}>
          <div className={css.dialog} onClick={(e) => e.stopPropagation()} style={{ '--c': focus.hue } as CSSProperties}>
            <div className={css.dialogHead}>
              <span className="glyph glyph--lg" style={{ '--g': focus.hue }}>
                <span>{focus.sigil}</span>
              </span>
              <div className={css.dialogTitle}>
                <small>
                  {focus.kicker} · {focus.groupLabel}
                  {focus.kind === 'side' ? ' · 逐字摘录' : ''}
                </small>
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
                  <div className={css.kvCell}><small>定位 / 呼号</small><b>{focus.alias}</b></div>
                  <div className={css.kvCell}><small>弹痕 / 特性</small><b>{focus.trait}</b></div>
                  <div className={css.kvCell}><small>终末潜力</small><b>{focus.potential}</b></div>
                  <div className={css.kvCell}><small>状态 · 出场</small><b>{focus.state}</b></div>
                  {focus.page ? (
                    <div className={css.kvCell}><small>原文出处</small><b>{focus.page}</b></div>
                  ) : focus.stationNote ? (
                    <div className={css.kvCell}><small>状态备注</small><b>{focus.stationNote}</b></div>
                  ) : null}
                  <div className={css.kvCell}><small>代表台词</small><b>{focus.quote}</b></div>
                </div>
              </div>

              <div className={css.dialogSection}>
                <h4>能力参数（五轴评定）</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Meters row={focus} />
                </div>
                {focus.kind === 'side' ? (
                  <div className="tiny muted" style={{ marginTop: 8 }}>本条目数值为终端近似评定；台词与介绍逐字摘录自各卷卷首人物页 / 正文初登场，不作杜撰。</div>
                ) : null}
              </div>

              {focusBond !== null ? (
                <div className={css.dialogSection}>
                  <h4>当前羁绊</h4>
                  <div className={css.relationGrid}>
                    <div className="meter meter--thick">
                      <div className="meter__fill" style={{ width: `${focusBond}%`, background: `linear-gradient(90deg, ${focus.hue}66, ${focus.hue})` }} />
                    </div>
                    <div>
                      <span className={css.bondName} style={{ color: focus.hue, borderColor: `${focus.hue}88`, background: `${focus.hue}1e` }}>
                        {focusBond} · {bondName(focusBond)}
                      </span>
                      <div className="tiny muted" style={{ marginTop: 6 }}>随你读到的每一段事件变化。</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function groupAccent(key: string): string {
  switch (key) {
    case 'ao': return '#3fd3bf'
    case 'kaus': return '#ff5d73'
    case 'corp': return '#ffb454'
    default: return '#8f9cb8'
  }
}
