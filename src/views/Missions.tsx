import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Crosshair, PaperPlaneTilt, Trash, Users } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { OPERATOR_ID, OPERATOR_PERSON, PERSON_IDS, personOf } from '../data/castmeta'
import { opPeriodAt } from '../lib/operator-arc'
import type { Mission } from '../data/types'
import { stageSeverity } from '../lib/format'
import { Battle } from './Battle'
import { periodProgress, squadIdsFrom } from '../lib/battle/derive'
import { TUNING } from '../lib/battle/tuning'
import {
  buyGear, buyItem, deleteRecord, listRecords, readBag, readCoin, readEquip, readGearBag,
  readGrowth, readStamina,
} from '../lib/battle/store'
import { settleExit, settleWin } from '../lib/battle/settle'
import { genBoard } from '../lib/battle/missiongen'
import { mainlineMissions } from '../lib/battle/mainline'
import { GEARS, ITEMS, GEAR_OF } from '../lib/battle/gear'
import type { BattleRecord, StaminaState } from '../lib/battle/types'

import css from './Missions.module.css'

type FilterKey = '全部' | '待接取' | '已派遣' | '压制中' | '完成' | '高威胁'
type LocalStatus = Mission['status']

const FILTERS: FilterKey[] = ['全部', '待接取', '已派遣', '压制中', '完成', '高威胁']

const STATUS_META: Record<LocalStatus, { cls: string; color: string; label: string }> = {
  待接取: { cls: 'chip', color: 'var(--steel)', label: '待接取' },
  已派遣: { cls: 'chip chip--warn', color: 'var(--amber)', label: '已派遣' },
  压制中: { cls: 'chip chip--danger', color: 'var(--red)', label: '压制中' },
  完成: { cls: 'chip chip--on', color: 'var(--jade)', label: '已完成' },
  锁定: { cls: 'chip chip--off', color: 'var(--ink-mute)', label: '等待签署' },
}

const CHAR_HUE: Record<string, string> = Object.fromEntries(CHARACTERS.map((c) => [c.name, c.hue]))

export function Missions() {
  const { push, epDone, bumpBond, isMet, operatorName } = useTerminal()
  const [filter, setFilter] = useState<FilterKey>('全部')
  const [status, setStatus] = useState<Record<string, LocalStatus>>({})
  const [openId, setOpenId] = useState<string | null>(null)

  /* —— 作战子系统状态 —— */
  const [stamina, setStamina] = useState<StaminaState>({ cur: TUNING.spMax, max: TUNING.spMax, chargeAt: 0 })
  const [growth, setGrowth] = useState<Record<string, number>>({})
  const [records, setRecords] = useState<BattleRecord[]>([])
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

  /* —— 看板：随观测进度自动重掷，也可手动刷新 —— */
  const [reroll, setReroll] = useState(0)

  const eventsDone = Object.keys(epDone).length
  /** 看板种子 = 观测进度 + 手动重掷计数（同一 seed 必得同一批任务） */
  const seed = eventsDone * 101 + reroll * 17 + 1
  const board = useMemo(() => genBoard(seed), [seed])

  const reload = useCallback(async () => {
    const [sp, g, rs, c, gb, eq, bg] = await Promise.all([
      readStamina(eventsDone), readGrowth(), listRecords(),
      readCoin(), readGearBag(), readEquip(), readBag(),
    ])
    setStamina(sp)
    setGrowth(g)
    setRecords(rs)
    setCoin(c)
    setGearBag(gb)
    setEquip(eq)
    setBag(bg)
  }, [eventsDone])

  useEffect(() => { void reload() }, [reload])

  const set = (id: string, s: LocalStatus) => setStatus((prev) => ({ ...prev, [id]: s }))

  /* 主线作战：时间线上确实交过手的事件，走到哪一段就能复盘到哪一段 */
  const mainline = useMemo(() => mainlineMissions(epDone), [epDone])

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

  const act = (m: Mission) => {
    const cur = status[m.id] ?? m.status
    if (cur === '待接取') {
      set(m.id, '已派遣')
      push('success', '任务已接取', `${m.no}「${m.title}」已派遣至 ${m.place}`, false)
    } else if (cur === '已派遣') {
      set(m.id, '压制中')
      push('danger', '交战中', `${m.no}「${m.title}」与 ${m.nature} 交火，请求频道保持畅通`, false)
    } else if (cur === '压制中') {
      set(m.id, '完成')
      push('success', '任务完成', `${m.no}「${m.title}」已归档，简报更新`, false)
    } else if (cur === '锁定') {
      push('warn', '等待签署', '本任务需要执行委员长签署，目前无法由你直接下达。', false)
    }
  }

  /* —— 编队 —— */
  const opArc = opPeriodAt(epDone)

  const openBriefing = (m: Mission) => {
    const rec = squadIdsFrom(m.recommend)
    const auto = rec.length ? rec : PERSON_IDS.filter((id) => isMet(id)).slice(0, 3)
    setPicked(auto.length < 4 ? [...auto, OPERATOR_ID] : auto)
    setBriefing(m)
  }

  const togglePick = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]))
  }

  const launch = () => {
    if (!briefing || picked.length === 0) return
    if (stamina.cur < TUNING.spPerSortie) {
      push('warn', '体力不足', '小队体力见底，先让观测间隔过去再说。', false)
      return
    }
    if (stamina.cur <= TUNING.overdriveAt) {
      push('warn', '过载出击', `余 ${Math.round(stamina.cur)} 体力仍强行出击 · 全场输出打折`, false)
    }
    setLive({ mission: briefing, squad: picked })
    setBriefing(null)
  }

  /* —— 结算：只有胜仗落库；装备按概率搜刮，军需点必得 —— */
  const settle = async (
    rec: BattleRecord, spLeft: number, eq: Record<string, string>, bagLeft: Record<string, number>,
  ) => {
    const line = await settleWin({ rec, spLeft, equip: eq, bag: bagLeft, stamina, bumpBond })
    set(rec.missionId, '完成')
    push('success', '作战归档', line, false)
    setLive(null)
    await reload()
  }

  const deleteRec = async (id: string) => {
    await deleteRecord(id)
    setOpenRec(null)
    await reload()
  }

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
          <button className={css.filterBtn} data-board-refresh onClick={() => setReroll((n) => n + 1)} title="按当前观测进度重掷整块看板">
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

      {/* 军需处：军需点购买补给与反现实辅助装备（装具不涉弹痕，每人至多一件） */}
      <section className={css.shop} data-gear-shop>
        <div className={css.shopHead}>
          <b>军需处</b>
          <span className={css.coin} data-coin title="作战结算累积">军需点 <b>{coin}</b></span>
          <div className={css.shopTabs}>
            <button className={`${css.shopTab} ${shopTab === '装具' ? css.isOn : ''}`} onClick={() => setShopTab('装具')}>反现实辅助装备</button>
            <button className={`${css.shopTab} ${shopTab === '补给' ? css.isOn : ''}`} onClick={() => setShopTab('补给')}>道具补给</button>
          </div>
          <span className="tiny muted">装具每人至多装配一件 · 战斗中更换不消耗回合</span>
        </div>
        <div className={css.shopGrid}>
          {shopTab === '装具'
            ? GEARS.map((g) => (
              <div key={g.id} className={css.shopItem} data-shop={g.id} data-rank={g.rank}>
                <div className={css.shopName}>
                  <b>{g.name}</b>
                  <i className="mono">{g.sub}</i>
                </div>
                <p className={css.shopDesc}>{g.desc}</p>
                <div className={css.shopFoot}>
                  <span className="tiny muted">持有 {gearBag[g.id] ?? 0}</span>
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 11 }}
                    data-buy={g.id}
                    disabled={coin < g.price}
                    onClick={async () => {
                      const r = await buyGear(g.id, g.price)
                      setCoin(r.coin)
                      setGearBag(r.bag)
                      push('success', '军需处', `${g.name} 已入库（余 ${r.coin} 军需点）`, false)
                    }}
                  >
                    {g.price} 军需点
                  </button>
                </div>
              </div>
            ))
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
                      push('success', '军需处', `${it.name} 已入库（余 ${r.coin} 军需点）`, false)
                    }}
                  >
                    {it.price} 军需点
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

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
            return (
              <article key={m2.id} className={`${css.card} ${m2.mainline ? css.cardMain2 : ''}`} data-mission={m2.mainline ? undefined : m2.id} data-mainline-mission={m2.mainline ? m2.id : undefined} style={{ '--s': m2.mainline ? 'var(--violet)' : m2.stage >= 6 ? 'var(--red)' : m2.stage >= 3 ? 'var(--amber)' : 'var(--steel)' }}>
                <div className={`${css.cardRibbon} ${ribbonCls}`} />
                <div className={css.cardMain}>
                  <div className={css.cardTop}>
                    <span className={css.cardNo}>
                      {m2.mainline ? <b className={css.mainTag}>正史 · 主线</b> : null}
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
                        <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => openBriefing(m2)} data-sortie={m2.id}>
                          <Crosshair size={13} weight="bold" /> 出击
                        </button>
                        <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => act(m2)}>
                          {m2.status === '待接取' && <>接取任务 <Check size={13} weight="bold" /></>}
                          {m2.status === '已派遣' && <>下令压制 <ArrowRight size={13} /></>}
                          {m2.status === '压制中' && <>标记完成 <Check size={13} weight="bold" /></>}
                        </button>
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
                    {r.rounds} 手 / {r.ticks} 拍 · MVP {r.mvp} · 军需点 +{r.coin}
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
              <span className="tiny muted">危险度 S{briefing.stage} · 最多 4 人</span>
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
              <button
                type="button"
                className={`${css.pick} ${picked.includes(OPERATOR_ID) ? css.pickOn : ''}`}
                data-pick={OPERATOR_ID}
                data-on={picked.includes(OPERATOR_ID) ? '1' : undefined}
                onClick={() => togglePick(OPERATOR_ID)}
              >
                {picked.includes(OPERATOR_ID) ? '已编入' : '编入'}
              </button>
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
            <div className={css.modalFoot}>
              <span className="tiny muted">
                已选 {picked.length}/4 · 预计消耗体力 {TUNING.spPerSortie}
                {stamina.cur <= TUNING.overdriveAt ? ' · 体力偏低，将过载出击' : ''}
              </span>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setBriefing(null)}>取消</button>
              <button className="btn btn--primary" style={{ fontSize: 12 }} disabled={picked.length === 0} onClick={launch} data-launch>
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
          progress={periodProgress(epDone)}
          growth={growth}
          stamina={stamina}
          equip={equip}
          owned={gearBag}
          bag={bag}
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
