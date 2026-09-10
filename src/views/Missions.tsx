import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Crosshair, PaperPlaneTilt, Storefront, Trash, Users, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { TIMELINE } from '../data/timeline'
import { rBadgeOf } from '../lib/battle/rvalue'
import { OPERATOR_ID, OPERATOR_PERSON, PERSON_IDS, personOf } from '../data/castmeta'
import { opPeriodAt, VOL1_END } from '../lib/operator-arc'
import type { Mission } from '../data/types'
import { stageSeverity } from '../lib/format'
import { Battle } from './Battle'
import { periodProgress, squadIdsFrom } from '../lib/battle/derive'
import { TUNING } from '../lib/battle/tuning'
import {
  buyGear, buyItem, deleteRecord, listRecords, readBag, readCoin, readEquip, readGearBag,
  addGear, readGrowth, readStamina, writeEquip, readMainClaimed, writeMainClaimed,
} from '../lib/battle/store'
import { settleExit, settleWin } from '../lib/battle/settle'
import { genBoard } from '../lib/battle/missiongen'
import { mainlineMissions } from '../lib/battle/mainline'
import { GEAR_SHOP, ITEMS, GEAR_OF, canEquip } from '../lib/battle/gear'
import type { BattleRecord, StaminaState } from '../lib/battle/types'

import css from './Missions.module.css'

type FilterKey = '全部' | '待接取' | '已派遣' | '压制中' | '完成' | '高威胁'
type LocalStatus = Mission['status']

const FILTERS: FilterKey[] = ['全部', '待接取', '已派遣', '压制中', '完成', '高威胁']

/**
 * 巡逻任务的放行点：脏器公寓（第 4 话）一案结清之前，可刷新的看板一律不派单——
 * 那时委员会还没把巡逻区交到他手上。正史主线不受此限：走到哪一段，就能复盘哪一段。
 */
const PATROL_OPEN_AT = 'v1-5'

/**
 * 编队上限。主角占一个位置且不可摘 —— 所以「6 人」里有他一个。
 * 上限放宽到 6 的理由不只是人数：后期的作战里，慢启动门、连携与合击
 * 都要人手才成立，4 人根本摆不开阵。
 * 数值本体在 TUNING.squadMax —— 羁绊那边判「全员到场」也要读同一个数。
 */
const SQUAD_MAX = TUNING.squadMax

const STATUS_META: Record<LocalStatus, { cls: string; color: string; label: string }> = {
  待接取: { cls: 'chip', color: 'var(--steel)', label: '待接取' },
  已派遣: { cls: 'chip chip--warn', color: 'var(--amber)', label: '已派遣' },
  压制中: { cls: 'chip chip--danger', color: 'var(--red)', label: '压制中' },
  完成: { cls: 'chip chip--on', color: 'var(--jade)', label: '已完成' },
  锁定: { cls: 'chip chip--off', color: 'var(--ink-mute)', label: '等待签署' },
}

const CHAR_HUE: Record<string, string> = Object.fromEntries(CHARACTERS.map((c) => [c.name, c.hue]))

export function Missions() {
  const { push, epDone, bumpBond, bondNow, isMet, operatorName, navigate } = useTerminal()
  /** 上阵名单 → 羁绊读数表。作战屏只读它，仗打完了才由 settle 回写。 */
  const bondOfSquad = useCallback(
    (ids: string[]) => Object.fromEntries(ids.map((id) => [id, bondNow(id)])),
    [bondNow],
  )
  const [filter, setFilter] = useState<FilterKey>('全部')
  const [status, setStatus] = useState<Record<string, LocalStatus>>({})
  const [openId, setOpenId] = useState<string | null>(null)

  /* —— 作战子系统状态 —— */
  const [stamina, setStamina] = useState<StaminaState>({ cur: TUNING.spMax, max: TUNING.spMax, chargeAt: 0 })
  const [growth, setGrowth] = useState<Record<string, number>>({})
  const [records, setRecords] = useState<BattleRecord[]>([])
  /* 已领取归档的剧情战斗（事件 id）：牌面靠它翻页，所以要落盘 */
  const [mainClaimed, setMainClaimed] = useState<Record<string, true>>({})
  const [openRec, setOpenRec] = useState<string | null>(null)
  /** 编队中的任务（非 null = 编队面板开着） */
  const [briefing, setBriefing] = useState<Mission | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  /** 正在打的那一场 */
  const [live, setLive] = useState<{ mission: Mission; squad: string[] } | null>(null)

  /* —— 军需 —— */
  const [coin, setCoin] = useState(0)
  const [gearBag, setGearBag] = useState<Record<string, number>>({})
  const [equip, setEquip] = useState<Record<string, string>>({})
  const [bag, setBag] = useState<Record<string, number>>({ ...TUNING.bagDefault })
  const [shopTab, setShopTab] = useState<'装具' | '补给'>('装具')
  /** 军需处的柜台：平时只是一个按钮，点开才展开 */
  const [shopOpen, setShopOpen] = useState(false)

  /* —— 看板：放行之后随观测进度自动重掷，也可手动刷新 —— */
  const [reroll, setReroll] = useState(0)

  const patrolOpen = !!epDone[PATROL_OPEN_AT]
  /** 放行点那一段主线的标题（未放行时挂牌用） */
  const patrolOpenTitle = TIMELINE.find((e) => e.id === PATROL_OPEN_AT)?.title ?? PATROL_OPEN_AT

  const eventsDone = Object.keys(epDone).length
  /** 看板种子 = 观测进度 + 手动重掷计数（同一 seed 必得同一批任务） */
  const seed = eventsDone * 101 + reroll * 17 + 1
  const board = useMemo(() => (patrolOpen ? genBoard(seed) : []), [patrolOpen, seed])

  const reload = useCallback(async () => {
    const [sp, g, rs, c, gb, eq, bg, mc] = await Promise.all([
      readStamina(eventsDone), readGrowth(), listRecords(),
      readCoin(), readGearBag(), readEquip(), readBag(), readMainClaimed(),
    ])
    setStamina(sp)
    setGrowth(g)
    setRecords(rs)
    setCoin(c)
    setGearBag(gb)
    setEquip(eq)
    setBag(bg)
    setMainClaimed(mc)
  }, [eventsDone])

  useEffect(() => { void reload() }, [reload])

  const set = (id: string, s: LocalStatus) => setStatus((prev) => ({ ...prev, [id]: s }))

  /* 剧情作战：一场一场来 —— 打赢一场、领取归档，下一场才上牌面 */
  const mainline = useMemo(() => mainlineMissions(epDone, mainClaimed), [epDone, mainClaimed])

  const list = useMemo(() => {
    // 主线排在最前：正史优先于巡逻任务，其余照旧按危险度排
    const rows = [...mainline, ...board].map((m) => ({ ...m, status: status[m.id] ?? m.status }))
    const sorted = [...rows].sort((a, b) => {
      if (!!a.mainline !== !!b.mainline) return a.mainline ? -1 : 1
      return filter === '高威胁' ? a.stage - b.stage : b.stage - a.stage
    })
    if (filter === '全部') return sorted
    if (filter === '高威胁') return sorted.filter((m) => m.stage >= 6)
    return sorted.filter((m) => m.status === filter)
  }, [mainline, board, filter, status])

  const counts = useMemo(() => {
    const s: Record<string, number> = {}
    for (const m of board) {
      const st = status[m.id] ?? m.status
      s[st] = (s[st] ?? 0) + 1
    }
    return s
  }, [board, status])

  /** 有胜仗记录的任务 id —— 归档只看它，不看点了多少次 */
  const wonIds = useMemo(
    () => new Set(records.filter((r) => r.outcome === '胜').map((r) => r.missionId)),
    [records],
  )

  /** 这一条任务的胜仗打过了没有。
      主线作战不是在任务简报里打起来的 —— 它由剧情推演现场触发，
      归档时按「同属那一段事件」认领（作战记录的编号是 plot-<事件 id>-序号）。 */
  const hasWin = useCallback(
    (m: Mission) => wonIds.has(m.id) || (!!m.at && [...wonIds].some((id) => id.startsWith(`plot-${m.at}-`))),
    [wonIds],
  )

  const act = (m: Mission) => {
    const cur = status[m.id] ?? m.status
    if (cur === '待接取') {
      set(m.id, '已派遣')
      push('success', '任务已接取', `${m.no}「${m.title}」已派遣至 ${m.place}`, false)
    } else if (cur === '已派遣') {
      set(m.id, '压制中')
      push('danger', '交战中', `${m.no}「${m.title}」与 ${m.nature} 交火，请求频道保持畅通`, false)
    } else if (cur === '压制中') {
      // 归档要有凭据：没有胜仗记录就只是「还没打」，不是「打完了」
      if (!hasWin(m)) {
        push('warn', '尚无战果', `${m.no}「${m.title}」还没有可归档的胜仗 —— ${m.mainline
          ? '剧情作战在推演现场发生：走到这一段、打赢那一仗，再回来领取。'
          : '先带队出击，打赢了才谈归档。'}`, false)
        return
      }
      if (m.mainline && m.at) {
        // 剧情作战领取即翻页：这一场收了，牌面才轮到下一场
        setMainClaimed((prev) => {
          const next = { ...prev, [m.at as string]: true as const }
          void writeMainClaimed(next)
          return next
        })
        push('success', '剧情战斗归档', `${m.no}「${m.title}」战果已领取 · 简报翻到下一场`, false)
        return
      }
      set(m.id, '完成')
      push('success', '任务完成', `${m.no}「${m.title}」已归档，简报更新`, false)
    } else if (cur === '锁定') {
      push('warn', '等待签署', '本任务需要执行委员长签署，目前无法由你直接下达。', false)
    }
  }

  /* —— 编队 —— */
  const opArc = opPeriodAt(epDone)

  const openBriefing = (m: Mission) => {
    const rec = squadIdsFrom(m.recommend).filter((id) => id !== OPERATOR_ID)
    const auto = rec.length ? rec : PERSON_IDS.filter((id) => id !== OPERATOR_ID && isMet(id)).slice(0, 3)
    // 主角必在队里 —— 编队是「他带谁去」，不是「要不要带他」
    setPicked([OPERATOR_ID, ...auto.filter((id) => id !== OPERATOR_ID).slice(0, SQUAD_MAX - 1)])
    setBriefing(m)
  }

  const togglePick = (id: string) => {
    if (id === OPERATOR_ID) return
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= SQUAD_MAX ? p : [...p, id]))
  }

  /** 编队时改装备：与战斗里那次换装同一份存档（空 id = 摘下来） */
  const equipOf = (id: string, gearId: string) => {
    // 一件装具只有一副：有人系着的时候这是换人，不是多一副 —— 界面上按不动，
    // 这里再拦一道，免得别的入口绕开。
    if (gearId) {
      const holder = picked.find((pid) => pid !== id && equip[pid] === gearId)
      if (holder) {
        push('warn', '装具只有一副', `${GEAR_OF[gearId]?.name ?? gearId} 正系在 ${personOf(holder)?.name ?? holder} 身上，先让他摘下来。`, false)
        return
      }
    }
    setEquip((m) => {
      const next = { ...m }
      if (gearId) next[id] = gearId
      else delete next[id]
      void writeEquip(next)
      return next
    })
  }

  const launch = () => {
    if (!briefing) return
    const squad = picked.includes(OPERATOR_ID) ? picked : [OPERATOR_ID, ...picked].slice(0, SQUAD_MAX)
    if (stamina.cur < TUNING.spPerSortie) {
      push('warn', '体力不足', '小队体力见底，先让观测间隔过去再说。', false)
      return
    }
    if (stamina.cur <= TUNING.overdriveAt) {
      push('warn', '过载出击', `余 ${Math.round(stamina.cur)} 体力仍强行出击 · 全场输出打折`, false)
    }
    setLive({ mission: briefing, squad })
    setBriefing(null)
  }

  /* —— 结算：只有胜仗落库；装备按概率搜刮，终末点数必得 —— */
  const settle = async (
    rec: BattleRecord, spLeft: number, eq: Record<string, string>, bagLeft: Record<string, number>,
  ) => {
    const line = await settleWin({ rec, spLeft, equip: eq, bag: bagLeft, stamina, bumpBond })
    set(rec.missionId, '完成')
    push('success', '作战归档', line, false)
    setLive(null)
    // 第一卷最后一节打完，丝线才算真的系上：那一仗的战利品不是捡的，是她给的
    if (rec.missionId === `main-${VOL1_END}`) {
      await addGear('luna-thread')
      push('success', '丝线', '露娜抽下一束丝线，绕过手腕系成结——此后它只认他一个人。', false)
    }
    await reload()
  }

  const deleteRec = async (id: string) => {
    await deleteRecord(id)
    setOpenRec(null)
    await reload()
  }

  /* —— 军需处：特殊装备须先完成对应主线才上架（未完成只挂牌） —— */
  const mainTitle = (id?: string) => (id ? TIMELINE.find((e) => e.id === id)?.title ?? id : '')
  const gearOpen = (g: { unlockMain?: string }) => !g.unlockMain || !!epDone[g.unlockMain]

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">FIELD / MISSIONS</div>
          <h1>任务简报板</h1>
          <div className="vhead__sub">动态生成处置卡片。接取、派遣、压制、归档——每条任务都有它的编号与代价。</div>
        </div>
        <div className={css.filters}>
          {FILTERS.map((f) => (
            <button key={f} className={`${css.filterBtn} ${filter === f ? css.isOn : ''}`} onClick={() => setFilter(f)}>
              {f}
              {f !== '全部' && f !== '高威胁' ? <span className="muted" style={{ marginLeft: 5 }}>{counts[f] ?? 0}</span> : null}
            </button>
          ))}
          <button
            className={css.filterBtn}
            data-board-refresh
            disabled={!patrolOpen}
            onClick={() => setReroll((n) => n + 1)}
            title={patrolOpen ? '按当前观测进度重掷整块看板' : `主线「${patrolOpenTitle}」结清后才放行巡逻任务`}
          >
            ⟳ 刷新看板
          </button>
        </div>
      </div>

      {/* 小队体力：只在执行任务时消耗，随观测间隔缓慢回复 */}
      <div className={css.stamina} data-squad-stamina>
        <span className="tiny mono" style={{ letterSpacing: '0.18em', color: 'var(--ink-mute)' }}>小队体力</span>
        <div className={css.staminaBar}>
          <i
            style={{ width: `${(stamina.cur / stamina.max) * 100}%` }}
            data-low={stamina.cur <= TUNING.overdriveAt ? '1' : undefined}
          />
        </div>
        <span className="tiny mono">{Math.round(stamina.cur)}/{stamina.max}</span>
        <span className="tiny muted">出击扣除，观测推进时回补</span>
      </div>

      {/* 军需处：平时只是一条挂牌 —— 点开才是柜台。
          研究所产出的装备不走市价，按贡献点兑换；作战结算累积的终末点数就是贡献点。 */}
      <section className={css.shopBar} data-gear-shop data-guide="shop">
        <span className={css.shopSigil} aria-hidden>泰</span>
        <div className={css.shopWho}>
          <b>军需处 · 泰尔米别克 · 简别科娃</b>
          <span className="tiny muted">
            梅芙的哥哥，苍之学园的前辈研究员，研究所深处的那位。研究所产出的装备不走市价，
            按贡献点兑换——作战结算累积的终末点数，在这儿就是贡献点。
          </span>
        </div>
        <span className={css.coin} data-coin title="作战结算累积 · 在军需处即贡献点">终末点数 <b>{coin}</b></span>
        <button
          className="btn btn--primary"
          style={{ fontSize: 12 }}
          data-shop-open
          onClick={() => setShopOpen(true)}
        >
          <Storefront size={13} weight="bold" style={{ marginRight: 5 }} />
          打开军需处
        </button>
      </section>

      {shopOpen ? (
        <div className={css.modal} data-shop-modal>
          <div className={`${css.modalBox} ${css.modalBoxWide}`}>
            <div className={css.modalHead}>
              <Storefront size={15} weight="bold" />
              <b>军需处 · 研究所配给</b>
              <span className="tiny muted">贡献点 {coin} · 装具每人至多装配一件</span>
              <button className="btn btn--ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setShopOpen(false)} data-shop-close>
                <X size={12} weight="bold" />
              </button>
            </div>

            <div className={css.shopSeller}>
              研究所仓库的账本摊在桌上。泰尔米别克 · 简别科娃——梅芙的哥哥——没有抬头：
              「终末点数你攒得不少了。这些不是买来的，是我们做出来、记在贡献上的东西。
              挑一件吧，一个人一件。」
            </div>

            <div className={css.shopTabs}>
              <button className={`${css.shopTab} ${shopTab === '装具' ? css.isOn : ''}`} data-shop-tab="装具" onClick={() => setShopTab('装具')}>
                研究所产出的装备
              </button>
              <button className={`${css.shopTab} ${shopTab === '补给' ? css.isOn : ''}`} data-shop-tab="补给" onClick={() => setShopTab('补给')}>
                道具补给
              </button>
            </div>

            <div className={css.shopGrid} data-shop-grid>
              {shopTab === '装具'
                ? GEAR_SHOP.map((g) => {
                  const owned = gearBag[g.id] ?? 0
                  const full = g.maxOwn != null && owned >= g.maxOwn
                  return (
                    <div key={g.id} className={css.shopItem} data-shop={g.id} data-rank={g.rank}>
                      <div className={css.shopName}>
                        <b>{g.name}</b>
                        <i className="mono">{g.sub}</i>
                        {g.maxOwn ? <span className={css.limitTag}>限兑 {g.maxOwn}</span> : null}
                      </div>
                      <p className={css.shopDesc}>{g.desc}</p>
                      <div className={css.shopFoot}>
                        <span className="tiny muted">
                          持有 {owned}{g.maxOwn ? `/${g.maxOwn}` : ''}
                          {g.onlyFor ? ` · 仅限 ${g.onlyFor.map((id) => personOf(id)?.name ?? id).join('、')}` : ''}
                        </span>
                        {!gearOpen(g) ? (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 11, opacity: 0.72 }}
                            data-gear-locked={g.id}
                            disabled
                            title={`完成主线「${mainTitle(g.unlockMain)}」后上架`}
                          >
                            需完成主线 · {mainTitle(g.unlockMain)}
                          </button>
                        ) : full ? (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 11, opacity: 0.72 }}
                            data-buy={g.id}
                            data-buy-full={g.id}
                            disabled
                            title="研究所的配给一人一件，兑完为止"
                          >
                            已兑完
                          </button>
                        ) : (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 11 }}
                            data-buy={g.id}
                            disabled={coin < g.price}
                            onClick={async () => {
                              const r = await buyGear(g.id, g.price, g.maxOwn)
                              setCoin(r.coin)
                              setGearBag(r.bag)
                              if (r.full) {
                                push('warn', '军需处', `${g.name} 是研究所的配给，一人只兑一件。`, false)
                                return
                              }
                              push('success', '军需处', `${g.name} 已入库（余 ${r.coin} 贡献点）`, false)
                            }}
                          >
                            {g.price} 贡献点
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
                : ITEMS.map((it) => (
                  <div key={it.id} className={css.shopItem} data-shop={it.id} data-rank={1}>
                    <div className={css.shopName}>
                      <b>{it.name}</b>
                      <i className="mono">补给</i>
                    </div>
                    <p className={css.shopDesc}>{it.desc}</p>
                    <div className={css.shopFoot}>
                      <span className="tiny muted">携带 {bag[it.id] ?? 0}</span>
                      <button
                        className="btn btn--ghost"
                        style={{ fontSize: 11 }}
                        data-buy={it.id}
                        disabled={coin < it.price}
                        onClick={async () => {
                          const r = await buyItem(it.id, it.price)
                          setCoin(r.coin)
                          setBag(r.bag)
                          push('success', '军需处', `${it.name} 已入库（余 ${r.coin} 贡献点）`, false)
                        }}
                      >
                        {it.price} 贡献点
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className={css.modalFoot}>
              <span className="tiny muted">装具每人至多装配一件 · 战斗中更换不消耗回合</span>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setShopOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 巡逻任务未放行：先走正史，脏器公寓一案结清后才派单 */}
      {!patrolOpen ? (
        <div className={css.empty} data-patrol-locked>
          <div style={{ fontSize: 15, letterSpacing: '0.14em', color: 'var(--amber)' }}>巡逻区尚未放行</div>
          <div className="mono tiny" style={{ letterSpacing: '0.2em', marginTop: 8 }}>
            可刷新任务将在主线「{patrolOpenTitle}」结清后开放 · 眼下只走主线
          </div>
        </div>
      ) : null}

      {list.length === 0 ? (
        <div className={css.empty}>
          <div style={{ fontSize: 26, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>NO ACTIVE TASKS</div>
          <div className="mono tiny" style={{ letterSpacing: '0.2em' }}>当前筛选下没有任务。第 12 区暂时平稳——去休息一下吧。</div>
        </div>
      ) : (
        <div className={css.board}>
          {list.map((m2) => {
            const sev = stageSeverity(m2.stage)
            const sm = STATUS_META[m2.status]
            const done = m2.status === '完成'
            const ribbonCls = m2.status === '完成' ? css.done : m2.status === '压制中' ? css.danger : m2.status === '锁定' ? css.warn : m2.stage >= 6 ? css.danger : m2.stage >= 3 ? css.warn : css.ok
            /* 该地 R 值 → 敌人成色：出击前就该看得见，好让人决定带谁去 */
            const rb = rBadgeOf(m2.place, m2.stage)
            const amp = Math.round((rb.f.mul - 1) * 100)
            return (
              <article key={m2.id} className={`${css.card} ${m2.mainline ? css.cardMain2 : ''}`} data-mission={m2.mainline ? undefined : m2.id} data-mainline-mission={m2.mainline ? m2.id : undefined} style={{ '--s': m2.mainline ? 'var(--violet)' : m2.stage >= 6 ? 'var(--red)' : m2.stage >= 3 ? 'var(--amber)' : 'var(--steel)' }}>
                <div className={`${css.cardRibbon} ${ribbonCls}`} />
                <div className={css.cardMain}>
                  <div className={css.cardTop}>
                    <span className={css.cardNo}>
                      {m2.mainline ? <b className={css.mainTag}>主线 · 观测</b> : null}
                      档案 {m2.no} / 阶段 S{m2.stage}
                    </span>
                    <span className="num badge" style={{ color: sev.color, borderColor: sev.color }}>{sev.label}</span>
                    <span className={`${sm.cls}`}><span className={css.statusBadge}><span className={css.dot} style={{ background: sm.color, boxShadow: `0 0 6px ${sm.color}` }} />{sm.label}</span></span>
                    <span className={`chip`} style={{ borderColor: 'transparent', background: 'var(--bg-2)' }}>{m2.nature}</span>
                  </div>
                  <h3 className={css.cardTitle} style={{ marginTop: 6 }}>{m2.title}</h3>
                  <div className={css.cardSub}>
                    <span>地点 {m2.place}</span>
                    <span className={css.sep}>/</span>
                    <span
                      className={css.rChip}
                      data-mission-r={m2.id}
                      data-r-known={rb.reading.known ? '1' : undefined}
                      data-r-amp={amp}
                      title={`${rb.reading.note}
${rb.f.word}`}
                    >
                      R {rb.reading.r.toFixed(3)}
                      {amp ? ` · 敌 +${amp}%` : ' · 常规'}
                      {rb.reading.known ? '' : '（推算）'}
                    </span>
                    <span className={css.sep}>/</span>
                    <span className={css.deadline}>期限 · {m2.deadline}</span>
                    <span className={css.sep}>/</span>
                    <span>编号 {m2.no}</span>
                  </div>
                  <p className={`${css.cardDesc} ${openId === m2.id ? css.open : ''}`}>{m2.desc}</p>
                  <div className={css.crew}>
                    <span className="tag tiny" style={{ padding: '4px 8px' }}>推荐小队</span>
                    {m2.recommend.map((r) => (
                      <span key={r} className={css.crewChip} style={{ '--crew': CHAR_HUE[r] ?? 'var(--violet)' }}>
                        <i>{CHAR_HUE[r] ? CHARACTERS.find((c) => c.name === r)?.sigil ?? '?' : '?'}</i>
                        {r}
                      </span>
                    ))}
                    <button className="linkGo" onClick={() => setOpenId(openId === m2.id ? null : m2.id)} style={{ marginLeft: 'auto' }}>
                      {openId === m2.id ? '收起' : '展开详情'}
                    </button>
                  </div>
                </div>

                <div className={css.cardAside}>
                  <div className={css.rewards}>
                    {m2.reward.map((rw) => (
                      <span key={rw} className={css.rewardLine}>{rw}</span>
                    ))}
                  </div>
                  <div className={css.asideAction}>
                    {m2.status === '锁定' ? (
                      <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => act(m2)}>
                        <PaperPlaneTilt size={13} /> 等待签署
                      </button>
                    ) : done ? (
                      <>
                        <button className="btn btn--ghost" style={{ fontSize: 12 }} disabled>已归档</button>
                        <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => openBriefing(m2)} title="再次出击（不计入首次归档）">
                          <Crosshair size={13} /> 再出击
                        </button>
                      </>
                    ) : (
                      <>
                        {/* 剧情作战没得接取：只把「到哪儿打」摆出来 —— 打完才谈领取 */}
                        {m2.mainline ? (
                          <>
                            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => navigate('plot')} data-sortie={m2.id} data-mainline-fight={m2.at}>
                              <Crosshair size={13} weight="bold" /> 进入推演
                            </button>
                            <button
                              className="btn btn--ghost"
                              style={{ fontSize: 12 }}
                              disabled={!hasWin(m2)}
                              title={hasWin(m2)
                                ? '现场那一仗已经赢了 —— 领取战果，牌面翻到下一场'
                                : '剧情战斗在推演现场发生：走到这一段、打赢那一仗，这里才收得到战果'}
                              data-archive={m2.id}
                              data-act={hasWin(m2) ? '领取' : '待战'}
                              onClick={() => act(m2)}
                            >
                              {hasWin(m2) ? <>领取归档 <Check size={13} weight="bold" /></> : <>待剧情战斗 <Crosshair size={13} /></>}
                            </button>
                          </>
                        ) : (
                          <>
                            {/* 出击是接取之后才有的事：还没点头的任务，先签字再说 */}
                            {m2.status !== '待接取' && (
                              <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => openBriefing(m2)} data-sortie={m2.id}>
                                <Crosshair size={13} weight="bold" /> 出击
                              </button>
                            )}
                            <button
                              className="btn btn--ghost"
                              style={{ fontSize: 12 }}
                              disabled={m2.status === '压制中' && !hasWin(m2)}
                              title={m2.status === '压制中' && !hasWin(m2) ? '还是一场胜仗都没有，归档无从谈起' : undefined}
                              data-archive={m2.status === '压制中' ? m2.id : undefined}
                              data-act={m2.status === '待接取' ? '接取' : m2.status === '已派遣' ? '压制' : m2.status === '压制中' ? '归档' : undefined}
                              onClick={() => act(m2)}
                            >
                              {m2.status === '待接取' && <>接取任务 <Check size={13} weight="bold" /></>}
                              {m2.status === '已派遣' && <>下令压制 <ArrowRight size={13} /></>}
                              {m2.status === '压制中' && <>提交归档 <Check size={13} weight="bold" /></>}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* 作战记录 */}
      <section className={css.records} data-battle-records>
        <div className={css.recordsHead}>
          <b>作战记录</b>
          <span className="tiny muted">{records.length} 场已归档 · 逐手底稿、成文与缴获一并留档（只留胜仗）</span>
        </div>
        {records.length === 0 ? (
          <div className="tiny muted" style={{ padding: '10px 2px' }}>尚无作战记录。出击一次，回来就有了。</div>
        ) : (
          <div className={css.recList}>
            {records.map((r) => (
              <article key={r.id} className={`${css.rec} ${r.mainline ? css.recMain : ''}`} data-battle-record={r.id} data-outcome={r.outcome} data-mainline={r.mainline ? '1' : undefined}>
                <button className={css.recTop} onClick={() => setOpenRec(openRec === r.id ? null : r.id)}>
                  <span className={css.recOut} data-outcome={r.outcome}>{r.outcome}</span>
                  {r.mainline ? <span className={css.mainTag} data-rec-main="1">主线</span> : null}
                  <b className={css.recTitle}>{r.no}「{r.title}」</b>
                  <span className="tiny muted">
                    {r.rounds} 手 / {r.ticks} 拍 · MVP {r.mvp} · 终末点数 +{r.coin}
                    {r.loot.length ? ` · ${r.loot.map((g) => GEAR_OF[g]?.name ?? g).join('、')}` : ''} · {r.narrativeBy}
                  </span>
                  <span className={css.recChev} data-open={openRec === r.id ? '1' : undefined}>›</span>
                </button>
                {openRec === r.id ? (
                  <div className={css.recBody}>
                    <div className={css.recNarr} data-battle-narrative data-mainline-narr={r.mainline ? '1' : undefined}>{r.narrative || '（未成文）'}</div>
                    <details className={css.recRaw}>
                      <summary className="tiny mono">逐手底稿</summary>
                      <pre className={css.recPre}>{r.digest}</pre>
                    </details>
                    <button className="btn btn--ghost" style={{ fontSize: 11 }} onClick={() => deleteRec(r.id)}>
                      <Trash size={12} /> 删除此条
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 编队 */}
      {briefing ? (
        <div className={css.modal} data-sortie-briefing>
          <div className={css.modalBox}>
            <div className={css.modalHead}>
              <Users size={15} weight="bold" />
              <b>编队 · {briefing.no}「{briefing.title}」</b>
              <span className="tiny muted">危险度 S{briefing.stage} · 最多 {SQUAD_MAX} 人（含主角）</span>
            </div>
            {/* 主角也是战斗人员：面板随观测进度换页，编队时可一并带上 */}
            <div className={css.opCard} data-operator-card>
              <span className="glyph" style={{ '--g': OPERATOR_PERSON.hue, width: 30, height: 30 }}>
                <span style={{ fontSize: 13 }}>{OPERATOR_PERSON.sigil}</span>
              </span>
              <div className={css.opMain}>
                <b>{operatorName.trim() || '言万心叶'} · {opArc.cls}</b>
                <span className="tiny muted">
                  兼指挥与观测，但他本人同样下场——五轴、武装、技能随观测进度换页，可编入小队一同出击。
                </span>
                <span className="tiny muted">{opArc.vol} · {opArc.title} · 武装 {opArc.arm}</span>
              </div>
              {/* 主角必在队里：这一格只是告诉玩家他占一个位置，摘不下来 */}
              <span
                className={`${css.pick} ${css.pickOn} ${css.pickFixed}`}
                data-pick={OPERATOR_ID}
                data-on="1"
                data-pick-fixed="1"
                title="主角必在队里 —— 编队是他带谁去，不是要不要带他"
              >
                队长 · 必编入
              </span>
            </div>
            <div className={css.pickGrid}>
              {PERSON_IDS.map((id) => {
                const p = personOf(id)
                if (!p) return null
                const met = isMet(id)
                const on = picked.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    className={`${css.pick} ${on ? css.pickOn : ''}`}
                    disabled={!met}
                    data-pick={id}
                    data-on={on ? '1' : undefined}
                    onClick={() => togglePick(id)}
                    title={met ? p.name : '尚未遇见'}
                  >
                    <span className="glyph" style={{ '--g': p.hue, width: 24, height: 24 }}>
                      <span style={{ fontSize: 11 }}>{p.sigil}</span>
                    </span>
                    <span className={css.pickName}>{met ? p.name : '？？？'}</span>
                  </button>
                )
              })}
            </div>
            {/* 装备调整：出击前就把装具定下来，别等打起来才发现带错了。
                与战斗中的「更换装备」是同一份存档（每人至多一件 · 只列库里有的、
                且这个人装得上的 —— 认人的那几件不给人硬塞）。 */}
            <div className={css.loadout} data-briefing-gear>
              <div className={css.loadoutCap}>
                <b>装备调整</b>
                <span className="tiny muted">
                  每人至多一件 · 只列军需库里有的、且这个人装得上的（更换装备不消耗回合）
                </span>
              </div>
              {picked.map((id) => {
                const p = personOf(id)
                if (!p) return null
                const cur = equip[id] ?? ''
                const mine = Object.keys(gearBag)
                  .filter((gid) => (gearBag[gid] ?? 0) > 0 && canEquip(id, gid))
                  .sort((a, b) => (GEAR_OF[a]?.name ?? a).localeCompare(GEAR_OF[b]?.name ?? b))
                return (
                  <div key={id} className={css.loadRow} data-load-row={id}>
                    <span className={css.loadName}>
                      {p.name}
                      <em className="tiny muted">{cur ? GEAR_OF[cur]?.name ?? cur : '未装配'}</em>
                    </span>
                    <div className={css.loadBtns}>
                      <button
                        type="button"
                        className={`${css.loadBtn} ${cur ? '' : css.loadBtnOn}`}
                        data-load-gear=""
                        data-on={cur ? undefined : '1'}
                        onClick={() => equipOf(id, '')}
                      >
                        不装配
                      </button>
                      {/* 一件装具只有一副：先看它是不是已经系在别人身上了 */}
                      {mine.map((gid) => {
                        const holder = picked.find((pid) => equip[pid] === gid)
                        return (
                        <button
                          key={gid}
                          type="button"
                          className={`${css.loadBtn} ${cur === gid ? css.loadBtnOn : ''}`}
                          data-load-gear={gid}
                          data-on={cur === gid ? '1' : undefined}
                          /* 一件装具只有一副：别人系上了，这边就按不动（同一件东西不能同时挂在两个人身上） */
                          data-taken={holder && holder !== id ? holder : undefined}
                          disabled={!!holder && holder !== id}
                          title={holder && holder !== id
                            ? `${GEAR_OF[gid]?.name ?? gid} 正系在 ${personOf(holder)?.name ?? holder} 身上 —— 一件装具只有一副，先让他摘下来。`
                            : GEAR_OF[gid]?.desc ?? ''}
                          onClick={() => equipOf(id, gid)}
                        >
                          {GEAR_OF[gid]?.name ?? gid}
                        </button>
                        )
                      })}
                      {!mine.length ? <span className="tiny muted">库里还没有他能装的装具</span> : null}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className={css.modalFoot}>
              <span className="tiny muted">
                已选 {picked.length}/{SQUAD_MAX} · 预计消耗体力 {TUNING.spPerSortie}
                {stamina.cur <= TUNING.overdriveAt ? ' · 体力偏低，将过载出击' : ''}
              </span>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setBriefing(null)}>取消</button>
              <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={launch} data-launch data-guide="launch">
                出击
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 作战本体 */}
      {live ? (
        <Battle
          mission={live.mission}
          squad={live.squad}
          /* 「变成他人」可借的档案：已遇见、且不在这支队伍里 */
          morphPool={PERSON_IDS.filter((id) => id !== OPERATOR_ID && isMet(id) && !live.squad.includes(id))}
          progress={periodProgress(epDone)}
          growth={growth}
          stamina={stamina}
          equip={equip}
          owned={gearBag}
          bag={bag}
          /* 上阵这几个人跟你的羁绊 —— 连携接得多快、本人多硬气都看它 */
          bond={bondOfSquad(live.squad)}
          coin={coin}
          onExit={async (spLeft, eq) => {
            await settleExit(spLeft, eq, stamina)
            setEquip(eq)
            setLive(null)
            await reload()
          }}
          onSettled={(rec, spLeft, eq, bagLeft) => { void settle(rec, spLeft, eq, bagLeft) }}
        />
      ) : null}
    </div>
  )
}
