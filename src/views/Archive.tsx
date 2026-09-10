import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { SIDECAST } from '../data/sidecast'
import { ROSTER_GROUPS, SIDE_AXIS, SIDE_AXIS_LIMIT, SIDE_TRAIT, SIDE_POTENTIAL, committeeRankOf } from '../data/roster'
import { personOf } from '../data/castmeta'
import { bondName } from '../lib/format'
import type { BondGender } from '../lib/format'
import { opSituation } from '../lib/operator'
import { AXIS_MAX } from '../data/types'
import type { AxisVal, Character, CharacterStat } from '../data/types'
import { Portrait } from '../components/Portrait'

import css from './Archive.module.css'

const STAT_HINT: Record<string, string> = {
  破坏力: '战斗中的破坏／攻击强度',
  敏捷度: '速度 · 反应 · 机动',
  物理抗性: '对物理伤害与躯体的耐受',
  反现实亲和: '与反现实／终末的亲和与介入深度',
  意志力: '精神韧性 · 抵御侵蚀与人格篡夺',
}

const AXIS_ORDER = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']

function axisOf(c: Character, key: string): AxisVal {
  const s = c.stats.find((x: CharacterStat) => x.key === key)
  return s ? s.value : 0
}

/** 五轴读数 / 条宽（'∞' → 满格） */
function axisW(v: AxisVal): number {
  return v === '∞' ? 100 : Math.min(100, (v / AXIS_MAX) * 100)
}

/** 读数文本（'∞' 原样） */
function axisText(v: AxisVal): string {
  return v === '∞' ? '∞' : String(v)
}

/** 每组所属的原貌介绍（仅复述三学园系谱与原文定位，不新造设定） */
const GROUP_NOTE: Record<string, string> = {
  ao: '「弹痕」的摇篮。以石像「弹痕的天使」授予的反现实武装闻名；主角所属的恋兔队、秘密结社光明会与学生中枢皆在此园。',
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
  rank?: string       // 委员会学生排行 RANK（原文/人物页有明确者；无则不标）
  state: string       // 状态 / 出场
  quote: string
  bio: string
  axis: AxisVal[]     // 与 AXIS_ORDER 对齐的五轴常态值（可含 '∞' = 无法测量）
  axisLimit: (AxisVal | null)[]  // 对齐的五轴极限值；null = 未登记（该轴无更强表现可考 → 单值显示）
  gender: BondGender  // 羁绊称谓按目标性别取用
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
          rank: committeeRankOf(c.id),
          state: c.station,
          quote: c.quote,
          bio: c.bio,
          axis: AXIS_ORDER.map((k) => axisOf(c, k)),
          axisLimit: AXIS_ORDER.map((k) => c.stats.find((x) => x.key === k)?.limit ?? null),
          gender: personOf(c.id)?.gender ?? '?',
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
          potential: SIDE_POTENTIAL[id] ?? '—',
          rank: committeeRankOf(e.id),
          state: `第 ${e.vol} 卷 · 登场`,
          quote: e.quote,
          bio: e.desc,
          axis: SIDE_AXIS[id] ?? [0, 0, 0, 0, 0],
          axisLimit: SIDE_AXIS_LIMIT[id] ?? [null, null, null, null, null],
          gender: personOf(e.id)?.gender ?? '?',
          hue,
          sigil: e.name.slice(0, 1),
          page: e.page,
        })
      }
    }
  }
  return rows
}

/**
 * 单条五轴（m 为外层 .stat）。
 * 常态条＝主题色（紫色系），极限条＝红色、垫在其后：两者重合处只显常态，
 * 超出常态的那一段才露出红色 —— 即「极限超出常态多少」。
 * 读数同步记为「常态/极限」；该轴未登记极限（或极限未超常态）时退回单值。
 */
function Meters({ row }: { row: Row }) {
  return (
    <>
      {AXIS_ORDER.map((k, i) => {
        const v = row.axis[i] ?? 0
        const lim = row.axisLimit[i] ?? null
        const vW = axisW(v)
        const limW = lim === null ? vW : Math.max(vW, axisW(lim))
        // 已登记的轴恒记双值「常态/极限」（含 ∞/∞）；未登记的轴退回单值
        const showLimit = lim !== null
        const inf = v === '∞'
        const fillBg = inf
          ? `repeating-linear-gradient(-45deg, ${row.hue} 0 5px, transparent 5px 10px)`
          : `linear-gradient(90deg, ${row.hue}66, ${row.hue})`
        return (
          <div key={k} className={css.stat}>
            <small>{k}</small>
            <div className="meter" title={showLimit ? `常态 ${axisText(v)} · 极限 ${axisText(lim)}` : undefined}>
              {lim !== null && limW > vW ? (
                <div className={`meter__fill ${css.limitFill}`} style={{ width: `${limW}%` }} />
              ) : null}
              <div
                className={`meter__fill ${inf ? css.infFill : ''}`}
                style={{ width: `${vW}%`, background: fillBg }}
              />
            </div>
            <span className="num" data-axis-num data-axis-normal={axisText(v)} data-axis-limit={showLimit ? axisText(lim) : ''}>
              {showLimit ? `${axisText(v)}/${axisText(lim)}` : axisText(v)}
            </span>
          </div>
        )
      })}
    </>
  )
}

/** 详情弹窗的就近锚点：卡片坐标 → 视口内夹取（末段无条件夹回 [m, vh-m]） */
function placeDialog(
  dlgW: number,
  dlgH: number,
  rect: DOMRect,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const m = 14
  const gap = 12
  const left = Math.max(m, Math.min(rect.left + rect.width / 2 - dlgW / 2, vw - dlgW - m))
  const roomBelow = vh - (rect.bottom + gap)
  const roomAbove = rect.top - gap
  let top: number
  if (roomBelow >= dlgH) {
    top = rect.bottom + gap
  } else if (roomAbove >= dlgH) {
    top = rect.top - gap - dlgH
  } else {
    // 两侧都不够：哪边余量大多靠哪边，最后夹回视口
    top = roomAbove >= roomBelow ? rect.top - gap - dlgH : vh - dlgH - m
  }
  const topMin = m
  const topMax = Math.max(m, vh - dlgH - m)
  top = Math.max(topMin, Math.min(top, topMax))
  return { left, top }
}

export function Archive() {
  const { operatorName, epDone, bondNow, push, profileRequest, clearProfileRequest, isMet } = useTerminal()
  const [openId, setOpenId] = useState<string | null>(null)
  const [openRect, setOpenRect] = useState<DOMRect | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [viewer, setViewer] = useState(false)
  const dlgRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(buildRows, [])
  const focus = rows.find((r) => r.id === openId) ?? null
  const name = operatorName.trim() ? operatorName : '言万心叶'
  const sit = opSituation(epDone)

  /* 展开某档案（卡片就近） */
  const openFromId = useCallback((id: string) => {
    const el = rootRef.current?.querySelector(`[data-archive-card="${id}"]`) as HTMLElement | null
    setOpenRect(el ? el.getBoundingClientRect() : null)
    setPos(null)
    setOpenId(id)
  }, [])
  const onCardOpen = useCallback((id: string, e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement
    setOpenRect(el.getBoundingClientRect())
    setPos(null)
    setViewer(false)
    setOpenId(id)
  }, [])
  const close = useCallback(() => { setOpenId(null); setViewer(false); setOpenRect(null); setPos(null) }, [])

  /* 打开后测量真实尺寸再就近落位 */
  useLayoutEffect(() => {
    if (!openId || !openRect || !dlgRef.current) return
    const el = dlgRef.current
    const r = openRect
    const t = window.setTimeout(() => {
      setPos(placeDialog(el.offsetWidth, el.offsetHeight, r))
    }, 0)
    return () => window.clearTimeout(t)
  }, [openId, openRect])

  /* ESC 关闭 */
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, close])

  /* 跨视图意图：正文关键词跳转 → 档案页就近展开对应角色 */
  const handledReq = useRef(0)
  useEffect(() => {
    if (!profileRequest) return
    if (handledReq.current === profileRequest.ts) return
    handledReq.current = profileRequest.ts
    const el = rootRef.current?.querySelector(`[data-archive-card="${profileRequest.id}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'center' })
    // 未遇见者不展开：只把它滚进视野，正文里点名字也撬不开封存档案
    if (!isMet(profileRequest.id)) {
      push('warn', '档案封存中', `${profileRequest.name} 尚未遇见，无从调阅。`, false)
      clearProfileRequest()
      return
    }
    const raf = window.requestAnimationFrame(() => {
      openFromId(profileRequest.id)
      clearProfileRequest()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [profileRequest, openFromId, clearProfileRequest, isMet, push])

  /* —— 渲染 —— */
  return (
    <div className="vpage">
      <div ref={rootRef}>
        <div className="vhead">
          <div>
            <div className="vhead__kicker">DATA / ARCHIVE</div>
            <h1>角色档案</h1>
            <div className="vhead__sub">
              委员会全量角色档案，主役与登场者并置同一名册，按学院／所属归组，格式一致。
              能力参数按委员会五轴评定，以「学生排行榜 RANK」与已观测的战绩、称号为参照——10 ≈ 普通成年人的该轴水准，
              观测上限 200，『∞』为无法测量；凡观测记录载明委员会排行者，已在其档案标示 RANK。羁绊起步皆为「初见」
              （陌生≈20、按性格小幅浮动）；主役另沿已读剧情段的走向推进，
              好感随主角行为——推演中的抉择、短信往来——实时增减。
            </div>
          </div>
          <div className="vhead__right">
            <span className="chip chip--warn">五轴以 RANK 与正文为参照</span>
            <span className="chip">全员 24 · 含羁绊</span>
            <span className="chip">入学后开放 · 逐人解封</span>
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
        <div className="tiny muted" style={{ color: 'var(--ink-faint)', margin: '-8px 0 14px', lineHeight: 1.7 }}>
          五轴标尺：10 ≈ 普通成年人的该轴水准；精锐约 20–35；超规格约 50–60；『∞』表示该轴已超出委员会可评定范围（无法测量），读数以满格示出。
          <br />
          每轴并记两值：<b style={{ color: 'var(--ink-dim)' }}>常态</b>（紫条 · 平常态可测体评）与
          <b style={{ color: 'var(--red)' }}>极限</b>（红条 · 机制全开／变身／限时爆发下的最强表现），读数为「常态/极限」。
          红条只在极限确实高于常态时露出——重合处仍读常态；两值皆不可测者记『∞/∞』。未登记极限的轴退回单值。
        </div>

        {/* 操作员横幅 */}
        <div className={css.opBanner}>
          <div className={css.opGlyph}>{name.slice(0, 1).toUpperCase()}</div>
          <div className={css.opBannerMain}>
            <h2>言万心叶 <em>（你 · 操作员本人）</em></h2>
            <p>
              {sit.standing} · 低语者（Susurrador）。以读心为名登记在册的终末潜力 Stage4『活性化』——
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
                  const bond = bondNow(r.id)
                  // 未遇见 → 锁定保密：不显名、不显武装、不显五轴、不显羁绊
                  if (!isMet(r.id)) {
                    return (
                      <article
                        key={r.id}
                        data-archive-card={r.id}
                        data-locked-id={r.id}
                        className={`${css.card} ${css.cardLocked}`}
                        aria-disabled
                      >
                        <div className={css.cardHead}>
                          <span className={css.lockSigil} aria-hidden>？</span>
                          <div style={{ minWidth: 0 }}>
                            <div className={css.cardNo}>观测未及 · 保密</div>
                            <div className={css.cardName}><h3>？？？</h3></div>
                            <div className={css.cardEpithet}>档案封存中</div>
                          </div>
                        </div>
                        <div className={css.cardQuote}>尚未遇见。抵达其出场段落，本页才会显影。</div>
                        <div className={css.cardFoot}>
                          <span className={css.cardStatusNote}>解析度不足 · 无可读记录</span>
                          <span className={css.lockTag}>LOCKED</span>
                        </div>
                      </article>
                    )
                  }
                  return (
                    <article
                      key={r.id}
                      data-archive-card={r.id}
                      className={css.card}
                      style={{ '--c': r.hue } as CSSProperties}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => onCardOpen(r.id, e)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardOpen(r.id, e as unknown as MouseEvent<HTMLElement>) } }}
                    >
                      <div className={css.cardHead}>
                        <Portrait avatarId={r.id} name={r.name} hue={r.hue} sigil={r.sigil} size={46} />
                        <div style={{ minWidth: 0 }}>
                          <div className={css.cardNo}>{r.kicker}{r.rank ? ` · 委员会 ${r.rank}` : ''}</div>
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
                          <div className={css.kvCell}><small>武装 / 终末</small><b>{r.trait}</b></div>
                          <div className={css.kvCell}><small>终末潜力</small><b>{r.potential}</b></div>
                          <div className={css.kvCell}><small>状态 · 出场</small><b>{r.state}</b></div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Meters row={r} />
                        </div>

                        <div className={css.bondRow}>
                          <span className={css.bondName} style={{ color: r.hue, borderColor: `${r.hue}88`, background: `${r.hue}1e` }}>
                            当前羁绊 {bondName(bond, { gender: r.gender })} · {bond}
                          </span>
                        </div>
                      </div>

                      <div className={css.cardFoot}>
                        <span className={css.cardStatusNote}>{r.stationNote ?? r.page ?? ''}</span>
                        <span className="linkGo">展开档案 ›</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {createPortal(
        <>
      {/* 就近详情弹窗 */}
      {focus ? (
        <>
          <div className={css.scrim} data-archive-scrim onClick={close} />
          <div
            ref={dlgRef}
            data-archive-dialog
            className={`${css.dialog} ${pos ? css.open : ''}`}
            style={{ '--c': focus.hue, ...(pos ? { left: pos.left, top: pos.top } : {}) } as CSSProperties}
            role="dialog"
            aria-modal="true"
          >
            <div className={css.dialogHead}>
              <Portrait avatarId={focus.id} name={focus.name} hue={focus.hue} sigil={focus.sigil} size={54} round />
              <div className={css.dialogTitle}>
                <small>
                  {focus.kicker} · {focus.groupLabel}
                </small>
                <h3>{focus.name}</h3>
                <div style={{ color: focus.hue, fontSize: 13, marginTop: 2 }}>{focus.epithet}</div>
              </div>
              <button className={css.dialogClose} onClick={close} aria-label="关闭">
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* 立绘位：真图就位即点亮；缺图显示纹章占位 */}
            <div className={css.stoodRow}>
              <Portrait avatarId={focus.id} name={focus.name} hue={focus.hue} sigil={focus.sigil} width={132} height={188} fit="contain" />
              <div className={css.stoodInfo}>
                <span className="vhead__kicker" style={{ fontSize: 9 }}>PORTRAIT / 立绘</span>
                <b style={{ fontSize: 15 }}>{focus.name}</b>
                <p>立绘全图。同名素材置于 public/charimg/ 即自动点亮；当前缺图为纹章占位。</p>
                <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setViewer(true)}>
                  查看全图
                </button>
              </div>
            </div>

            <div className={css.dialogBody}>
              <p className={css.dialogBio}>{focus.bio}</p>

              <div className={css.dialogSection}>
                <h4>档案信息</h4>
                <div className={css.kvBlock}>
                  <div className={css.kvCell}><small>所属</small><b>{focus.division}</b></div>
                  <div className={css.kvCell}><small>定位 / 呼号</small><b>{focus.alias}</b></div>
                  <div className={css.kvCell}><small>武装 / 终末</small><b>{focus.trait}</b></div>
                  <div className={css.kvCell}><small>终末潜力</small><b>{focus.potential}</b></div>
                  <div className={css.kvCell}><small>状态 · 出场</small><b>{focus.state}</b></div>
                  <div className={css.kvCell}><small>委员会排行</small><b>{focus.rank ?? '—'}</b></div>
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
                {focus.axis.includes('∞') ? (
                  <div className="tiny muted" style={{ marginTop: 8 }}>带条纹的『∞』读数无法测量——已超出委员会可评定上限。</div>
                ) : null}
              </div>

              <div className={css.dialogSection}>
                <h4>当前羁绊</h4>
                <div className={css.relationGrid}>
                  <div className="meter meter--thick">
                    <div
                      className="meter__fill"
                      style={{ width: `${bondNow(focus.id)}%`, background: `linear-gradient(90deg, ${focus.hue}66, ${focus.hue})` }}
                    />
                  </div>
                  <div>
                    <span className={css.bondName} style={{ color: focus.hue, borderColor: `${focus.hue}88`, background: `${focus.hue}1e` }}>
                      {bondNow(focus.id)} · {bondName(bondNow(focus.id), { gender: focus.gender })}
                    </span>
                    <div className="tiny muted" style={{ marginTop: 6 }}>主役随读到的每一段事件变化；登场者自近似基线起，随剧情中的遇见与短信增减。</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* 立绘全图查看器（大尺寸、contain，关闭即还原） */}
      {viewer && focus ? (
        <div className={css.lightbox} data-archive-lightbox onClick={() => setViewer(false)} role="dialog" aria-modal="true">
          <div className={css.lightboxStage} onClick={(e) => e.stopPropagation()}>
            <Portrait
              avatarId={focus.id}
              name={focus.name}
              hue={focus.hue}
              sigil={focus.sigil}
              fit="contain"
              width={Math.min(760, window.innerWidth - 48)}
              height={Math.min(720, window.innerHeight - 120)}
            />
            <div className={css.lightboxMeta}>
              <b>{focus.name}</b>
              <span className="tiny muted">立绘全图 · 点按任意处合上</span>
              <button className={css.dialogClose} onClick={() => setViewer(false)} aria-label="关闭">
                <X size={18} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </>,
        document.body,
      )}
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
