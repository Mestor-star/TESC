import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowRight, ArrowUUpLeft, ChatCircle, ClockCounterClockwise, Crosshair, MapPin,
  NoteBlank, Package, PaperPlaneTilt, ShieldChevron, Target,
} from '@phosphor-icons/react'

import { PanelHead, useFolds } from '../components/Fold'
import { Portrait } from '../components/Portrait'
import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { PERSON_IDS, personOf } from '../data/castmeta'
import type { CastPerson } from '../data/castmeta'
import { CODEX } from '../data/codex'
import { REGIONS } from '../data/regions'
import { TIMELINE } from '../data/timeline'
import { clamp, rSeverity } from '../lib/format'
import { opSituation, furthestDone } from '../lib/operator'
import { manifestOf, rBadgeOf, rFactor, regionOfPlace } from '../lib/battle/rvalue'
import { GEAR_OF, ITEM_OF } from '../lib/battle/gear'
import {
  listRecords, readBag, readCoin, readEquip, readGearBag, readGrowth, readStamina,
} from '../lib/battle/store'
import { loadSmsLogs, smsLogVersion, subscribeSmsLog, subscribeUnread, totalUnread, unreadOf } from '../lib/sms'
import type { BattleRecord, StaminaState } from '../lib/battle/types'
import type { Character, ChatMsg } from '../data/types'

import css from './Dashboard.module.css'

/** 全卷走完时的收束语（不再硬写「第 1 卷」） */
const ALL_DONE = '时间线上的六卷正传与外传插曲均已归档。'

const CIRC = 2 * Math.PI * 90

/**
 * 观测点示意图上的连线：按故事里的走动关系连，不按距离。
 * 第 12 区那一片内部来回走（本校舍—山道宿舍—旧集市—东侧废屋街），
 * 出了废屋街往东才到第 6 区（工房街—女神神殿遗址）。
 * 坐标写在 data/regions.ts 的 xy 上 —— 这里只管谁连着谁。
 */
const MAP_EDGES: Array<[string, string]> = [
  ['gcn', 'drm'], ['drm', 'mkt'], ['mkt', 'ewd'], ['gcn', 'ewd'],
  ['ewd', 'wsh'], ['wsh', 'ruin'],
]

/** 图上用短名：全名（「苍之学园 · 第12区 本校舍」）摊在节点边上会把图压没 */
const shortPlace = (name: string) => name.split('·').pop()?.trim() ?? name

/**
 * 地点名 → 图上那一格（没有落点的返回 null，宁可不标也不指错地方）。
 * 先用标定表那把严格尺子（regionOfPlace：区号与地名两段都得对上，
 * 「苍之学园 · 异端审问室」不许顶用本校舍的读数）；
 * 剧情地点比标定表细得多，对不上就退一步按地名前半截认（「苍之学园 · 学生会室」→ 苍之学园那一区），
 * 多个候选取前半截最长的那个 —— 短的（「第12区」）容易把整片都吞掉。
 */
function mapRegionOf(place: string): string | null {
  if (!place) return null
  const strict = regionOfPlace(place)
  if (strict?.xy) return strict.id
  const seg = place.split('·')[0]?.trim() ?? ''
  if (!seg) return null
  const stems = REGIONS.filter((g) => g.xy).map((g) => ({ id: g.id, s: g.name.split('·')[0]?.trim() ?? '' }))
  const exact = stems.find((x) => x.s && x.s === seg)
  if (exact) return exact.id
  return stems.filter((x) => x.s && seg.includes(x.s)).sort((a, b) => b.s.length - a.s.length)[0]?.id ?? null
}

/** epoch ms → 「08-14 21:07」；0（legacy 旧档回填）显示 — */
function stamp(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function Dashboard() {
  const {
    operatorName, navigate, requestSms, focusRegion, setFocusId, focusId,
    epDone, bondNow, unlocked, isMet, isEndReg, records,
  } = useTerminal()
  const name = operatorName.trim() ? operatorName : '言万心叶'
  const sit = opSituation(epDone)
  /* 总览上的八块面板都挂了折叠（默认摊开 —— 这一屏就是给人一眼扫的，
     折是随手收掉不看的那几块，不是默认藏起来）。 */
  const folds = useFolds(true)
  const sev = rSeverity(focusRegion.r)
  const doneEvents = useMemo(() => TIMELINE.filter((e) => epDone[e.id]).slice(-4).reverse(), [epDone])
  const f = clamp((focusRegion.r - 0.8) / 0.3, 0, 1)
  /** 观测点选择器是否展开（默认收起：扫描面板一次只显示当前那一个读数） */
  const [pickerOpen, setPickerOpen] = useState(false)

  /* ---- 威胁条：判「异常」看 R 值偏离区间（两侧同判），不是只看原定的危险度 ---- */
  const fac = useMemo(() => rFactor(focusRegion.r), [focusRegion.r])
  const out = fac.out
  const pct = Math.round((fac.mul - 1) * 100)
  const siteAnomaly = out > 0
  /* 分区行与推算行共用的增幅挂牌口径：正常就写「正常」，不许印成「+0%」 */
  const facTag = fac.out === 0 ? '正常' : `${fac.kind} ${pct >= 0 ? '+' : ''}${pct}%`

  /* ---- 进度：走到哪、下一段是哪一段 ---- */
  const furthest = furthestDone(epDone)
  const doneCount = Object.keys(epDone).length
  const volNow = TIMELINE[furthest]?.group ?? '卷1'
  const nextEv = useMemo(() => TIMELINE.find((e) => !epDone[e.id]), [epDone])
  const nextPlace = nextEv?.place ?? focusRegion.name
  /* 剧情此刻站在哪：最近收束那一段的地点，一段都没推过就取下一段的地点 */
  const storyPlace = (furthest >= 0 ? TIMELINE[furthest]?.place : nextEv?.place) ?? null
  /* 下一段的现场分级取该段的终末（entities ＋ 在场的人型终末，卷号不是危险度，见 manifestOf） */
  const nextSite = useMemo(() => manifestOf(nextEv ?? {}), [nextEv])
  const nextStage = nextSite.stage
  const nextR = useMemo(() => rBadgeOf(nextPlace, nextStage, nextSite.names), [nextPlace, nextStage, nextSite])
  /* 下一段所在的地点，若在侦察网标定表里就把它标出来（「下一段」角标） */
  const nextRegion = useMemo(() => (mapRegionOf(nextPlace)), [nextPlace])
  /**
   * 剧情**此刻**落在图上哪一格。
   * 取的是**剧情**的地点，不是 focusRegion —— 后者被手动点选钉住之后会跟着手指走，
   * 那再拿来当「你在这儿」就成了「点到哪算哪」，与箭头指的下一段也对不上了。
   */
  const hereRegion = useMemo(() => (mapRegionOf(storyPlace ?? '')), [storyPlace])

  /* ---- 作战域的活读数（点数 / 体力 / 记录 / 装具 / 补给 / 成长） ---- */
  const [live, setLive] = useState<{
    rec: BattleRecord[]; sp: StaminaState | null; coin: number; growth: Record<string, number>
    gearBag: Record<string, number>; equip: Record<string, string>; bag: Record<string, number>
  }>({ rec: [], sp: null, coin: 0, growth: {}, gearBag: {}, equip: {}, bag: {} })
  useEffect(() => {
    let on = true
    Promise.all([listRecords(), readStamina(doneCount), readCoin(), readGrowth(), readGearBag(), readEquip(), readBag()])
      .then(([rec, sp, coin, growth, gearBag, equip, bag]) => {
        if (on) setLive({ rec, sp, coin, growth, gearBag, equip, bag })
      })
      .catch(() => { /* 存档不可用时总览照常显示静态部分 */ })
    return () => { on = false }
  }, [doneCount])

  /* ---- 通讯：未读数会随来信自己变，两条订阅把总览挂在同一个版本号上 ---- */
  const [vSms, setVSms] = useState(0)
  const [logs, setLogs] = useState<Record<string, ChatMsg[]>>(() => loadSmsLogs())
  useEffect(() => subscribeUnread(() => setVSms((v) => v + 1)), [])
  useEffect(() => subscribeSmsLog(() => setLogs(loadSmsLogs())), [])
  const unreadTotal = useMemo(
    // vSms 是订阅给的版本号：未读表在订阅里改，这里靠它重取，不是多余的依赖
    () => totalUnread(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vSms, doneCount],
  )
  const logVersion = smsLogVersion()

  const lastSquad = live.rec[0]?.squad ?? []
  const squadShown = lastSquad.length ? lastSquad : CHARACTERS.slice(0, 4).map((c: Character) => c.id)
  /* 「已遇见」数的是**在册名册**（24 位），不是主役四人 —— 档案页列的是这一份名册，
     剧情里照过面的人也照这份登记（见 Terminal 的现场名册落账）。 */
  const metCount = useMemo(() => PERSON_IDS.filter((id) => isMet(id)).length, [isMet])

  /* 通讯中枢：只列已遇见的人（未解锁的联系人本来就不该出现在这台终端上），
     未读的排前面，其余按名录序。预览取该线最后一句。 */
  const contacts = useMemo(() => {
    const met = PERSON_IDS.map((id) => personOf(id)).filter((p): p is CastPerson => !!p && isMet(p.id))
    return met
      .map((c) => {
        const line = logs[c.id]
        const last = line && line.length ? line[line.length - 1] : null
        return {
          c,
          unread: unreadOf(c.id),
          preview: last ? (last.meta?.who ? `${last.meta.who}：${last.text}` : last.text) : '尚未联络 · 点开可发起对话',
        }
      })
      .sort((a, b) => b.unread - a.unread)
    // logVersion 是日志版本号：来信后本表要重排
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, isMet, logVersion])

  /* 观测通报：把「剧情收束」与「作战归档」两路事件按时间并成一条流 */
  const feed = useMemo(() => {
    const story = records.map((r) => {
      const ev = TIMELINE.find((e) => e.id === r.eventId)
      return {
        k: 'story' as const,
        ts: r.ts,
        title: ev ? `${ev.group} · ${ev.title}` : '剧情收束',
        body: r.digest,
      }
    })
    const battle = live.rec.map((r) => ({
      k: 'battle' as const,
      ts: r.at,
      title: `作战记录 · ${r.title}`,
      body: `${r.place} · 参战 ${r.squad.length} 人 · 历时 ${r.ticks} 拍 · 出力最重 ${r.mvp}`
        + (r.coin ? ` · 军需 +${r.coin}` : '')
        + (r.loot.length ? ` · 缴获 ${r.loot.length} 件` : ''),
    }))
    return [...story, ...battle].sort((a, b) => b.ts - a.ts).slice(0, 6)
  }, [records, live.rec])

  /* 收录进度：图鉴 / 档案 / 时间线三本册子各登了几条 */
  const codexDone = useMemo(() => CODEX.filter((e) => isEndReg(e.id)).length, [isEndReg])

  /* 装具库存条目按「件数多的在前」排，便于一眼看出主力装备 */
  const gearRows = useMemo(
    () => Object.entries(live.gearBag).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    [live.gearBag],
  )
  /* 装配那一行：**装具的持有人不一定是 CHARACTERS 里的人** —— 言万心叶自己就上阵、
     也穿装具，而他不在 CHARACTERS（那是同伴名册）。所以这里只按「装具认得出来」过滤，
     名字走 personOf 兜底（主役与登场者都在 castmeta 里）：
     早先那版只滤了 g，一旦主角穿了装具，c 就是 undefined，整页当场崩掉。 */
  const equipRows = useMemo(
    () => Object.entries(live.equip)
      .map(([cid, gid]) => ({
        id: cid,
        name: CHARACTERS.find((x: Character) => x.id === cid)?.name ?? personOf(cid)?.name ?? cid,
        g: GEAR_OF[gid],
      }))
      .filter((r) => !!r.g),
    [live.equip],
  )
  const bagRows = useMemo(
    () => Object.entries(live.bag).map(([id, n]) => ({ it: ITEM_OF[id], n })).filter((r) => !!r.it),
    [live.bag],
  )

  const staminaLow = !!live.sp && live.sp.cur < live.sp.max * 0.35

  return (
    <div className="vpage">
      <div className={css.hero}>
        {/* 主欢迎卡 */}
        <div className={css.heroMain}>
          <div className={css.heroKicker}>TERMINAL / DASHBOARD</div>
          <h2 className={css.heroGreet}>
            欢迎回来，<em>{name}</em>
          </h2>
          <p className={css.heroText}>
            {sit.stage === 0
              ? '你以「临时访问」身份接入这台终端——一个曾被旧黑手党利用、能窥探人心的少年，无学园所属，尚未被委员会收编。'
              : sit.stage === 1
                ? '你是被收留在苍之学园的体验入学低语者——终末潜力登记为 Stage4『活性化』。'
                : '你已是苍之学园的正式生（转校生）——终末潜力登记为 Stage4『活性化』。'}
            {doneCount === 0
              ? ' 以消息推进剧情，或切到离线通读原文；时间线正等待着你的落笔。'
              : ` 时间线已收束 ${doneCount} / ${TIMELINE.length} 段，如今停在第 ${volNow.replace('卷', '')} 卷。`}
          </p>
          <div className={css.heroChips}>
            {sit.adopted ? <span className="chip chip--on">低语者 Susurrador</span> : null}
            <span className="chip">{sit.standing}</span>
            {unlocked ? (
              <span className="chip chip--on">作战子系统已解锁</span>
            ) : (
              <span className="chip chip--warn">任务 / 武装图鉴 / 终末图鉴 / 短信待解锁</span>
            )}
          </div>
          {/* 实时读数：终端上真正在变的几个数 */}
          <div className={css.statStrip} data-dash-stats>
            <span className={css.stat} data-stat="coin">
              <b className="mono">{live.coin}</b>
              <small>终末点数</small>
            </span>
            <span className={css.stat} data-stat="stamina">
              <b className="mono">{live.sp ? `${Math.round(live.sp.cur)}/${live.sp.max}` : '—'}</b>
              <small>小队体力</small>
            </span>
            <span className={css.stat} data-stat="records">
              <b className="mono">{live.rec.length}</b>
              <small>作战记录</small>
            </span>
            <span className={css.stat} data-stat="unread">
              <b className="mono">{unreadTotal}</b>
              <small>未读讯息</small>
            </span>
            <span className={css.stat} data-stat="met">
              <b className="mono">{metCount}/{PERSON_IDS.length}</b>
              <small>已遇见</small>
            </span>
            <span className={css.stat} data-stat="progress">
              <b className="mono">{doneCount}/{TIMELINE.length}</b>
              <small>时间线</small>
            </span>
          </div>

          {/* 下一段：总览不再只是欢迎语，而是「你现在该去哪儿」 */}
          {nextEv ? (
            <div className={css.nextUp} data-dash-next>
              <span className={css.nextKicker}>
                <Crosshair size={12} weight="bold" /> 下一段
              </span>
              <div className={css.nextBody}>
                <b>{nextEv.title}</b>
                <small>
                  {nextEv.group} · {nextEv.phase} · {nextEv.place}
                </small>
                <span className={css.nextR} data-r-src={nextR.reading.src} title={nextR.reading.note}>
                  {nextR.text}
                </span>
              </div>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('plot')}>
                接着推进 <ArrowRight size={12} weight="bold" />
              </button>
            </div>
          ) : (
            <div className={css.nextUp} data-dash-next data-all-done>
              <span className={css.nextKicker}>
                <NoteBlank size={12} weight="bold" /> 已收束
              </span>
              <div className={css.nextBody}>
                <b>全部事件已归档</b>
                <small>{ALL_DONE}</small>
              </div>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('saga')}>
                查看编年史 <ArrowRight size={12} weight="bold" />
              </button>
            </div>
          )}

          <div className={css.heroActions}>
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => navigate('plot')}>
              进入剧情 · 推演或通读 <ArrowRight size={13} weight="bold" />
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('missions')}>
              <Target size={12} weight="bold" /> 出击任务
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('tavern')}>
              <ChatCircle size={12} weight="bold" /> 角色短信
              {unreadTotal > 0 ? <span className={css.badgeUnread} style={{ marginLeft: 6 }}>{unreadTotal}</span> : null}
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('codex')}>
              终末图鉴
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('archive')}>
              角色档案
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('lore')}>
              智库 · 世界观
            </button>
          </div>
        </div>

        {/* R 值仪表盘 */}
        <div className={css.gaugePanel}>
          <div className={css.gaugeWrap}>
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle
                className={css.ringFg}
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke={sev.color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - f)}
                style={{ filter: `drop-shadow(0 0 8px ${sev.color})` }}
              />
            </svg>
            <div className={css.gaugeCenter}>
              <span className={css.gaugeVal} style={{ color: sev.color }}>
                {focusRegion.r.toFixed(3)}<small>R</small>
              </span>
              <span className={css.gaugeTag} style={{ color: sev.color }}>{focusRegion.code}</span>
            </div>
          </div>
          <div className={css.gaugeName}>
            {focusRegion.name.split(' · ')[0]}
          </div>
          <div className={css.gaugeMeta}>
            <span>REALITY INDEX</span>
            <span className="mono" style={{ color: sev.color }}>{sev.label}</span>
          </div>
          <div className="tiny muted" style={{ textAlign: 'center', maxWidth: 300, lineHeight: 1.7, marginTop: 8 }}>
            {focusRegion.note}
          </div>
          <div className="tiny muted" style={{ textAlign: 'center', maxWidth: 300, lineHeight: 1.7, marginTop: 6 }}>
            {focusId
              ? '已钉住该观测点。'
              : '观测点跟着剧情走 —— 最近收束的那一段在哪，读的就是哪。'}
          </div>
        </div>
      </div>

      {/* 威胁通告 / 平稳条。
          判「异常」看的是 **R 值偏离区间**（两侧都算），不是只看原定的危险度 ——
          表里没有的地点没有原定危险度，可它的 R 值照样可能已经偏出区间。 */}
      {siteAnomaly ? (
        <div className={css.threat}>
          <div className={css.threatHazard} />
          <div className={css.threatBody}>
            <b>区域观测异常 · {focusRegion.name}</b>
            <p>
              R 值 {focusRegion.r.toFixed(3)}，{fac.kind === '低R' ? '现实偏薄' : '现实过厚'}，
              偏离正常区间 {out.toFixed(3)}（{focusRegion.code}）。
              {focusRegion.note}
            </p>
          </div>
          <div className={css.threatStage}>
            {focusRegion.threatStage > 0 ? (
              <>
                <div className="num">{focusRegion.threatStage}</div>
                <div className="tiny muted" style={{ letterSpacing: '0.2em' }}>STAGE</div>
              </>
            ) : (
              <>
                <div className="num">{pct > 0 ? '+' : ''}{pct}%</div>
                <div className="tiny muted" style={{ letterSpacing: '0.2em' }}>敌体增幅</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={css.threat} style={{ borderColor: 'rgba(63,224,160,0.4)', background: 'rgba(63,224,160,0.05)' }}>
          <div className={css.threatHazard} style={{ background: 'repeating-linear-gradient(-45deg, var(--jade) 0 10px, #0b0b13 10px 20px)' }} />
          <div className={css.threatBody}>
            <b style={{ color: 'var(--jade)' }}>本区观测平稳 · {focusRegion.name}</b>
            <p>
              R 值 {focusRegion.r.toFixed(3)} 落在正常区间内，未检出反现实干涉异常（{focusRegion.code}）。
              {focusRegion.threatStage > 0
                ? `该区原定危险度 ${focusRegion.threatStage} 级，仍在编。`
                : '观测信道保持畅通，等待下一段事件。'}
            </p>
          </div>
          <div className={css.threatStage}>
            <div className="num" style={{ color: 'var(--jade)' }}>{focusRegion.threatStage}</div>
            <div className="tiny muted" style={{ letterSpacing: '0.2em' }}>STAGE</div>
          </div>
        </div>
      )}

      <div className="grid grid--3" style={{ gap: 18, alignItems: 'start' }}>
        {/* 小队状态 */}
        <section className="panel">
          <PanelHead k="dash-squad" folds={folds}>
            <span className="panel__title">出击小队 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>
              {lastSquad.length ? '最近出战名单' : '尚未出战 · 名录前四人'}
            </span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            <div className={css.stack}>
              {squadShown
                .map((id) => CHARACTERS.find((x: Character) => x.id === id))
                .filter((c): c is Character => !!c)
                .map((c) => {
                const bond = bondNow(c.id)
                const g = live.equip[c.id] ? GEAR_OF[live.equip[c.id]] : undefined
                return (
                  <div key={c.id} className={css.squadRow} style={{ '--c': c.hue } as CSSProperties}>
                    <Portrait avatarId={c.id} name={c.name} hue={c.hue} sigil={c.sigil} size={38} style={{ borderRadius: 4 }} />
                    <div className={css.squadMeta}>
                      <b>{c.name} <span className="tiny muted" style={{ fontWeight: 400 }}>· {c.station}</span></b>
                      <small>{c.role} · {c.division.split(' · ').pop()}{g ? ` · 装具 ${g.name}` : ''}</small>
                      <div className={`${css.bondMini} meter`} style={{ height: 5 }}>
                        <div className="meter__fill" style={{ width: `${bond}%`, background: `linear-gradient(90deg, ${c.hue}66, ${c.hue})` }} />
                      </div>
                    </div>
                    <button
                      className={`${css.miniAction} btn--icon`}
                      style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="打开短信"
                      aria-label={`与 ${c.name} 短信`}
                      onClick={() => requestSms(c.id)}
                    >
                      <ChatCircle size={15} weight="bold" />
                    </button>
                  </div>
                )
              })}
              {metCount === 0 ? (
                <div className="tiny muted" style={{ lineHeight: 1.8 }}>
                  尚未与名录上的人照面。每推进一段剧情，遇见的人会自己走进这栏。
                </div>
              ) : null}
              <div className="tiny muted" style={{ marginTop: 2, letterSpacing: '0.04em' }}>
                小队体力 {live.sp ? `${Math.round(live.sp.cur)} / ${live.sp.max}` : '—'}
                {staminaLow ? ' · 不足三成，出击前先歇一段' : ''}
              </div>
            </div>
          </div>
        </section>

        {/* 区域 R 值 */}
        <section className="panel">
          <PanelHead k="dash-scan" folds={folds}>
            <span className="panel__title">区域干涉扫描 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>
              {focusId
                ? <><MapPin size={11} weight="bold" /> 已钉住观测点</>
                : <><Crosshair size={11} weight="bold" /> 跟随剧情</>}
            </span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            <div className={css.stack} data-dash-scan>
              {/* 观测点示意图：六个标定区摆在一张图上，点一格就等于换了观测地点。
                  摆法见 data/regions.ts 的 xy —— 相邻是「走得近」，不是距离测绘。 */}
              <div className={css.mapWrap} data-scan-map>
                <svg viewBox="0 0 100 100" className={css.mapSvg} role="img" aria-label="观测点示意图">
                  {MAP_EDGES.map(([a, b]) => {
                    const ra = REGIONS.find((g) => g.id === a)
                    const rb = REGIONS.find((g) => g.id === b)
                    if (!ra?.xy || !rb?.xy) return null
                    return (
                      <line
                        key={`${a}-${b}`}
                        className={css.mapEdge}
                        x1={ra.xy[0]} y1={ra.xy[1]} x2={rb.xy[0]} y2={rb.xy[1]}
                      />
                    )
                  })}
                  {REGIONS.filter((reg) => reg.xy).map((reg) => {
                    const [x, y] = reg.xy!
                    const rs = rSeverity(reg.r)
                    const on = focusRegion.id === reg.id
                    const here = hereRegion === reg.id
                    const isNext = nextRegion === reg.id
                    return (
                      <g
                        key={reg.id}
                        className={css.mapNode}
                        data-map-region={reg.id}
                        data-on={on ? '1' : undefined}
                        data-here={here ? '1' : undefined}
                        data-next={isNext ? '1' : undefined}
                        style={{ '--c': rs.color } as CSSProperties}
                        onClick={() => { setFocusId(reg.id); setPickerOpen(false) }}
                      >
                        <title>{`${reg.name}（${reg.code}）· R ${reg.r.toFixed(3)} · 危险度 S${reg.threatStage}\n${reg.note}`}</title>
                        {/* 「在此」这一圈不是选中态（选中是 data-on 那圈呼吸光），
                            是剧情现在走到哪；转得慢，跟 R 值高低的配色各说各的。 */}
                        {here ? <circle className={css.mapHere} cx={x} cy={y} r={6.4} /> : null}
                        <circle className={css.mapHalo} cx={x} cy={y} r={9.5} />
                        <circle className={css.mapDot} cx={x} cy={y} r={on ? 3.4 : 2.6} />
                        <text className={css.mapLabel} x={x} y={y - 6} textAnchor="middle">
                          {shortPlace(reg.name)}
                        </text>
                        <text className={css.mapR} x={x} y={y + 10.5} textAnchor="middle">
                          {reg.r.toFixed(3)}
                          {isNext ? ' · 下一段' : here ? ' · 在此' : ''}
                        </text>
                      </g>
                    )
                  })}
                </svg>
                <div className={css.mapFoot}>
                  <span className="tiny muted">
                    侦察网标定 · 六区 · 点位按走动关系摆，不是测绘
                  </span>
                  <span className="tiny muted">
                    {focusId
                      ? <><MapPin size={11} weight="bold" /> 已钉住 —— 点「恢复跟随剧情」放回</>
                      : <><Crosshair size={11} weight="bold" /> 跟随剧情 · 与箭头同一处</>}
                  </span>
                </div>
              </div>

              {/* 默认只列**当前观测点**这一个读数 —— 一次铺开六区是噪声不是情报。
                  要换地方，点上面的图，或按下面的按钮展开列表。 */}
              <div className={css.nowSite}>
                <span className={css.nowSiteBody}>
                  <b>
                    {focusRegion.name}
                    {nextRegion === focusRegion.id ? <i className={css.nextMark}>下一段</i> : null}
                  </b>
                  <small>
                    {focusRegion.code} · 敌方 {facTag}
                    {focusId ? '' : ' · 跟随剧情'}
                  </small>
                  <div className="meter" style={{ height: 5, marginTop: 7 }}>
                    <div
                      className="meter__fill"
                      style={{
                        width: `${clamp((focusRegion.r - 0.8) / 0.3, 0, 1) * 100}%`,
                        background: `linear-gradient(90deg, ${sev.color}55, ${sev.color})`,
                      }}
                    />
                  </div>
                  <small style={{ marginTop: 6, letterSpacing: 0, lineHeight: 1.6 }}>{focusRegion.note}</small>
                </span>
                <span className={css.nowSiteVal}>
                  <b style={{ color: sev.color }}>{focusRegion.r.toFixed(3)}</b>
                  <small style={{ color: sev.color }}>{sev.label}</small>
                  <small className="muted" style={{ letterSpacing: 0 }}>R 值</small>
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: 11.5 }}
                  onClick={() => setPickerOpen((v) => !v)}
                  data-scan-picker
                >
                  <Crosshair size={12} weight="bold" /> {pickerOpen ? '收起观测点列表' : '更换观测地点'}
                </button>
                {focusId ? (
                  <button className="btn btn--ghost" style={{ fontSize: 11.5 }} onClick={() => setFocusId(null)}>
                    <ArrowUUpLeft size={12} weight="bold" /> 恢复跟随剧情
                  </button>
                ) : null}
              </div>

              {pickerOpen ? (
                <div className={css.picker} data-scan-list>
                  <div className={css.pickerHead}>观测点 · 共 {REGIONS.length} 区</div>
                  <button
                    className={css.pickRow}
                    data-on={focusId ? '0' : '1'}
                    data-region="live"
                    data-r-src={focusRegion.src ?? 'table'}
                    title={focusRegion.note}
                    onClick={() => { setFocusId(null); setPickerOpen(false) }}
                  >
                    <b>跟随剧情 · {focusId ? '回到当前剧情地点' : `当前：${focusRegion.name}`}</b>
                    <code>{focusRegion.code}</code>
                    <i style={{ color: sev.color }}>{focusRegion.r.toFixed(3)}</i>
                  </button>
                  {REGIONS.map((reg) => {
                    const rs = rSeverity(reg.r)
                    const on = focusRegion.id === reg.id
                    const isNext = nextRegion === reg.id
                    const amp = rBadgeOf(reg.name, nextStage)
                    return (
                      <button
                        key={reg.id}
                        className={css.pickRow}
                        data-on={on ? '1' : '0'}
                        data-region={reg.id}
                        data-next-site={isNext ? '1' : undefined}
                        title={`${reg.note} · 敌方 ${amp.text.split(' · ').pop()}`}
                        onClick={() => { setFocusId(reg.id); setPickerOpen(false) }}
                      >
                        <b>
                          {reg.name}
                          {isNext ? <i className={css.nextMark}>下一段</i> : null}
                        </b>
                        <code>{reg.code}</code>
                        <i style={{ color: rs.color }}>{reg.r.toFixed(3)}</i>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* 最近推进 */}
        <section className="panel">
          <PanelHead k="dash-timeline" folds={folds}
            extra={<button className="linkGo" onClick={() => navigate('saga')}>全部 <ArrowRight size={11} /></button>}>
            <span className="panel__title">时间线 · 最近推进 <span className="slash" /></span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            {doneEvents.length === 0 ? (
              <div className="tiny muted" style={{ lineHeight: 1.8, padding: '4px 0' }}>
                尚未推进任何事件。前往「剧情推进」视图，在线推演或离线通读，第一段收束后这里就会长出记录。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {doneEvents.map((e) => (
                  <div key={e.id} className={css.tlItem}>
                    <span className={css.tlWhen}>
                      <b>{e.group.replace('·S1', '')}</b>
                      <small>{e.phase}</small>
                    </span>
                    <span className={css.tlBody}>
                      <b>{e.title}</b>
                      <p>{e.summary}</p>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ---- 第二屏：通讯 / 战报 / 军需 ---- */}
      <div className="grid grid--3" style={{ gap: 18, alignItems: 'start', marginTop: 18 }}>
        {/* 通讯中枢 */}
        <section className="panel" data-dash-msg>
          <PanelHead k="dash-msg" folds={folds}>
            <span className="panel__title">通讯中枢 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>
              {unreadTotal > 0
                ? <span style={{ color: 'var(--red)' }}>{unreadTotal} 条未读</span>
                : `${metCount} 位可联络`}
            </span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            <div className={css.stack}>
              {metCount === 0 ? (
                <div className="tiny muted" style={{ lineHeight: 1.8 }}>
                  通讯录空着。遇见一个人，他的线才会接进来 —— 解锁一份档案，就解锁一个人的短信。
                </div>
              ) : (
                contacts.slice(0, 6).map(({ c, unread, preview }) => (
                  <button
                    key={c.id}
                    className={css.msgRow}
                    data-unread={unread > 0 ? '1' : '0'}
                    data-thread={c.id}
                    onClick={() => requestSms(c.id)}
                  >
                    <Portrait avatarId={c.id} name={c.name} hue={c.hue} sigil={c.sigil} size={32} round />
                    <span className={css.msgRowBody}>
                      <b>{c.name}</b>
                      <small>{preview}</small>
                    </span>
                    {unread > 0 ? <span className={css.badgeUnread}>{unread}</span> : null}
                  </button>
                ))
              )}
              {contacts.length > 6 ? (
                <button className="linkGo" onClick={() => navigate('tavern')}>
                  还有 {contacts.length - 6} 位联系人 <ArrowRight size={11} />
                </button>
              ) : metCount > 0 ? (
                <button className="linkGo" onClick={() => navigate('tavern')}>
                  打开通讯记录 <PaperPlaneTilt size={11} />
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* 最近战报 */}
        <section className="panel" data-dash-rec>
          <PanelHead k="dash-rec" folds={folds}
            extra={<button className="linkGo" onClick={() => navigate('missions')}>简报板 <ArrowRight size={11} /></button>}>
            <span className="panel__title">最近战报 <span className="slash" /></span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            {live.rec.length === 0 ? (
              <div className="tiny muted" style={{ lineHeight: 1.8, padding: '4px 0' }}>
                尚无战报。前往「出击任务」选一处出阵，胜了这一栏会记下番号、历时与出力最重的人。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {live.rec.slice(0, 4).map((r) => (
                  <div key={r.id} className={css.recRow}>
                    <span className={css.recNo}>{r.no}</span>
                    <span className={css.recBody}>
                      <b>{r.title}</b>
                      <small>
                        {r.place} · 历时 {r.ticks} 拍 · 出力最重 {r.mvp}
                        {r.coin ? ` · 军需 +${r.coin}` : ''}
                        {r.loot.length ? ` · 缴获 ${r.loot.length} 件` : ''}
                      </small>
                    </span>
                    <span className={css.resTag} data-r={r.outcome}>{r.outcome}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 军需与装具 */}
        <section className="panel" data-dash-supply>
          <PanelHead k="dash-supply" folds={folds}
            extra={<button className="linkGo" onClick={() => navigate('missions')}>军需处 <ArrowRight size={11} /></button>}>
            <span className="panel__title">军需与装具 <span className="slash" /></span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            <div className={css.kv}>
              <span className={css.kvKey}>终末点数</span>
              <span className={css.kvVal}>
                <b style={{ color: 'var(--amber)' }}>{live.coin}</b>
                <span className="tiny muted"> · 出击与扫荡的结算货币</span>
              </span>
            </div>
            <div className={css.kv}>
              <span className={css.kvKey}>小队体力</span>
              <span className={css.kvVal}>
                <b style={{ color: staminaLow ? 'var(--red)' : 'var(--jade)' }}>
                  {live.sp ? `${Math.round(live.sp.cur)}/${live.sp.max}` : '—'}
                </b>
                <span className="tiny muted"> · 每收束一段观测回补</span>
              </span>
            </div>
            <div className={css.kv}>
              <span className={css.kvKey}>道具补给</span>
              <span className={css.kvVal}>
                {bagRows.length === 0 ? <span className="tiny muted">空</span> : bagRows.map(({ it, n }) => (
                  <span key={it.id} className={css.gearTag} title={it.desc}>
                    {it.name} <i>×{n}</i>
                  </span>
                ))}
              </span>
            </div>
            <div className={css.kv}>
              <span className={css.kvKey}>装具库存</span>
              <span className={css.kvVal}>
                {gearRows.length === 0 ? (
                  <span className="tiny muted">空 · 交战掉落或军需处购置</span>
                ) : gearRows.slice(0, 6).map(([id, n]) => (
                  <span key={id} className={css.gearTag} title={GEAR_OF[id]?.desc}>
                    {GEAR_OF[id]?.name ?? id} <i>×{n}</i>
                  </span>
                ))}
              </span>
            </div>
            <div className={css.kv}>
              <span className={css.kvKey}>装配</span>
              <span className={css.kvVal}>
                {equipRows.length === 0 ? (
                  <span className="tiny muted">全队均未装配 · 每人至多一件</span>
                ) : equipRows.map((r) => (
                  <span key={r.id} className={css.gearTag} title={r.g!.desc}>
                    {r.name} · {r.g!.name}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ---- 第三屏：观测通报 / 收录进度 ---- */}
      <div className="grid grid--2" style={{ gap: 18, alignItems: 'start', marginTop: 18 }}>
        {/* 观测通报 */}
        <section className="panel" data-dash-feed>
          <PanelHead k="dash-feed" folds={folds}>
            <span className="panel__title">观测通报 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>
              <ClockCounterClockwise size={11} weight="bold" /> 收束与归档
            </span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            {feed.length === 0 ? (
              <div className="tiny muted" style={{ lineHeight: 1.8, padding: '4px 0' }}>
                通报栏空着。剧情每收束一段、每归档一场作战，这里会自己长出一条。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {feed.map((it, i) => (
                  <div key={`${it.k}-${it.ts}-${i}`} className={css.feedRow}>
                    <span className={css.feedMark} data-k={it.k} />
                    <span className={css.feedBody}>
                      <b>{it.title}</b>
                      <p>{it.body}</p>
                    </span>
                    <span className={css.feedWhen}>{stamp(it.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 收录进度 */}
        <section className="panel" data-dash-collect>
          <PanelHead k="dash-collect" folds={folds}>
            <span className="panel__title">收录进度 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>
              <ShieldChevron size={11} weight="bold" /> 三本册子
            </span>
          </PanelHead>
          <div className="panel__body" data-fold-body>
            {[
              { k: '终末图鉴', n: codexDone, all: CODEX.length, go: 'codex' as const, c: 'var(--red)' },
              { k: '角色档案', n: metCount, all: PERSON_IDS.length, go: 'archive' as const, c: 'var(--steel)' },
              { k: '时间线', n: doneCount, all: TIMELINE.length, go: 'saga' as const, c: 'var(--amber)' },
            ].map((row) => (
              <div key={row.k} className={css.pRow}>
                <div className={css.pRowHead}>
                  <b>{row.k}</b>
                  <span style={{ color: row.c }}>{row.n} / {row.all}</span>
                  <button className="linkGo" onClick={() => navigate(row.go)}>
                    {row.n === row.all ? '已收全' : '继续收录'} <ArrowRight size={11} />
                  </button>
                </div>
                <div className="meter">
                  <div
                    className="meter__fill"
                    style={{ width: `${row.all ? (row.n / row.all) * 100 : 0}%`, background: row.c }}
                  />
                </div>
              </div>
            ))}
            <div className={css.kv} style={{ marginTop: 6 }}>
              <span className={css.kvKey}>联络解锁</span>
              <span className={css.kvVal}>
                <Package size={11} weight="bold" style={{ opacity: 0.6 }} />
                <span className="tiny muted">
                  {' '}每遇见一人即解锁其档案与短信线；当前 {metCount} / {PERSON_IDS.length}。
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
