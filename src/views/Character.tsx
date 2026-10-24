/* ============================================================
   「角色」页 —— 星铁风四栏
   ------------------------------------------------------------
   这一格从前是「角色档案」（views/Archive.tsx 那一屏）。现在的主面换成了这一页，
   旧的整屏一个字没动，收在左栏底那枚「旧版显示」后面（开关在 App.tsx 的
   CharacterPage 里，模块变量，不进存档）。

   四栏：
     · 顶：横向可滑的角色切换栏 —— **只有头像与所属分类**，点一下换人；
     · 左：深色竖排页签（详情 / 能力体系 / 战术执行 / 世界的色彩 / 反现实武装 / 附属档案）；
     · 中：立绘。名下有私密立绘的人**点得动**：探针走 lib/cg 的 probeCg，id 与目录
           照抄私密档案立绘那一套（cg-intim-<id> · lib/rendezvous 的 intimArtDir）；
           没素材就退回定妆立绘，**不留一个点不动的按钮**；
     · 右：主内容区（占这一格的大半）。

   数据一律照抄现有那几张表，缺的写「暂无」：
     · 读数：derive 的 combatantOf —— 与作战里点开同一个人是同一组数
       （生命 / 节拍 / 五轴；「机动」就是名册五轴里的「敏捷度」）；
     · 武装：data/arms.ts（ARMS 按 holderId 关联；同一人名下后几件是「到达点」那一档）；
     · 成长：lib/growth.ts 的 skillUpsOf / talentUpsOf / canUnlock / unlockWithPoints /
       colorsOf / buyColor —— 买一级，这一页当场跟着变；
     · 附属档案：chars/sidecast 的来历、personas 的语音、lore/codex 的智库条目。

   ⚠️ 这一页**不自己算任何战斗数值**：一个数都不造，全部从 derive 与成长表读出来。
      主角那枚「切换天使之律」只是**呈现层**的翻页（见 LITURGY 那一段），
      不写存档、不改编成、不进战斗。
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { OPERATOR_ID, personOf } from '../data/castmeta'
import { CHARACTERS } from '../data/chars'
import { SIDECAST } from '../data/sidecast'
import { TIMELINE } from '../data/timeline'
import { LORE } from '../data/lore'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { ROSTER_GROUPS, SIDE_POTENTIAL, SIDE_TRAIT, committeeRankOf } from '../data/roster'
import { ARMS, ARM_TRADITIONS } from '../data/arms'
import { OP_PERIODS, opPeriodAt } from '../lib/operator-arc'
import type { OpPeriod } from '../lib/operator-arc'
import { combatantOf, periodProgress } from '../lib/battle/derive'
import { archNameOf } from '../lib/battle/atlas'
import { effectTextsOf, modsTextsOf, mulTextOf } from '../lib/battle/skilltext'
import { passiveText } from '../lib/battle/roster'
import { GEAR_OF, GEARS, canEquip } from '../lib/battle/gear'
import { readCoin, readEquip, readGearBag, writeEquip } from '../lib/battle/store'
import { COLOR_DROP_CHANCE, COLOR_DROP_RULE, COLOR_MAX_LEVEL } from '../data/growth'
import {
  buyColor, canUnlock, colorsOf, linesOf, skillUpsOf, talentUpsOf, unlockWithPoints,
} from '../lib/growth'
import type { GrowthKind, UpState } from '../lib/growth'
import { probeCg } from '../lib/cg'
import { intimArtDir } from '../lib/rendezvous'
import { voiceLinesOf } from '../data/personas'
import { Portrait, useCharImg } from '../components/Portrait'
import { inkOf } from '../lib/hue'
import type { Combatant, GearDef, SkillSpec } from '../lib/battle/types'
import type { ArmEntry } from '../data/types'

import css from './Character.module.css'

/* ============================================================
   〇、切换栏的一行
   ============================================================ */

/** 阵营四类（主人给的分类口径 —— 与 ROSTER_GROUPS 的组键对得上，'out' 归「非归属」） */
const CAMP_OF: Record<string, string> = {
  ao: '苍之学园',
  kaus: '卡乌斯',
  corp: 'Corporations',
  out: '非归属',
}

interface Row {
  kind: 'core' | 'side' | 'operator'
  id: string
  name: string
  groupKey: string
  groupLabel: string
  /** 切换栏下面那一行小字 = 所属分类 */
  camp: string
  hue: string
  sigil: string
  division: string
  role: string
  epithet: string
  /** 档案上那条武装／终末（chars.scar / sidecast 的登记） */
  trait: string
  potential: string
  rank?: string
  bio: string
  quote: string
  station: string
  page?: string
}

/** 名录 → 切换栏。次序与旧的档案页同一份（ROSTER_GROUPS），操作员另摆在最前。 */
function buildRows(): Row[] {
  const core = new Map(CHARACTERS.map((c) => [c.id, c]))
  const side = new Map(SIDECAST.map((e) => [e.id, e]))
  const rows: Row[] = []
  for (const g of ROSTER_GROUPS) {
    for (const id of g.ids) {
      const c = core.get(id)
      if (c) {
        rows.push({
          kind: 'core', id: c.id, name: c.name,
          groupKey: g.key, groupLabel: g.label,
          camp: CAMP_OF[g.key] ?? '非归属',
          hue: inkOf(c.hue), sigil: c.sigil,
          division: c.division, role: c.role, epithet: c.epithet,
          trait: c.scar, potential: c.potential,
          rank: committeeRankOf(c.id),
          bio: c.bio, quote: c.quote, station: c.station,
        })
        continue
      }
      const e = side.get(id)
      if (e) {
        rows.push({
          kind: 'side', id: e.id, name: e.name,
          groupKey: g.key, groupLabel: g.label,
          camp: CAMP_OF[g.key] ?? '非归属',
          hue: inkOf(personOf(e.id)?.hue ?? '#8b93a7'),
          sigil: e.name.slice(0, 1),
          division: g.label, role: e.alias, epithet: e.role,
          trait: SIDE_TRAIT[id] ?? '—', potential: SIDE_POTENTIAL[id] ?? '—',
          rank: committeeRankOf(e.id),
          bio: e.desc, quote: e.quote, station: '第 ' + e.vol + ' 卷 · 登场',
          page: e.page,
        })
      }
    }
  }
  return rows
}

/** 操作员那一条（不在 25 人名册里；切换栏摆他最前 —— 主角） */
const OP_ROW: Row = {
  kind: 'operator', id: OPERATOR_ID, name: '言万心叶',
  groupKey: 'op', groupLabel: '终端', camp: '苍之学园',
  hue: inkOf('#58c6ff'), sigil: '心',
  division: '苍之学园 · 一年（留学生）· 终末停滞委员会观测对象',
  role: '观测者 · 低语者', epithet: '主角',
  trait: '低语者（Susurrador）', potential: 'Stage4「活性化」',
  bio: '他把听见的东西念给全队听。名字是他自己写的，其余每一栏都随观测进度换页。',
  quote: '「……我先听见了。」', station: '在场',
}

/* ============================================================
   一、核心属性条那七栏
   ------------------------------------------------------------
   七栏照主人给的口径排：生命 · 节拍 · 反现实抗性 · 破坏力 · 机动 · 意志力 · 反现实亲和。
   「机动」就是名册五轴里的「敏捷度」（同一个数，两个叫法：档案叫敏捷度，场上叫机动）；
   「反现实抗性」走「物理抗性」那条轴 —— 本作数值层里抗性只有一条轴，
   反现实实体的撞击也走这一条（见 data/growth.ts 黑色奇迹那一格的注）。
   ============================================================ */
const CORE_ROWS: { key: string; from: (c: Combatant) => number; hint: string }[] = [
  { key: '生命', from: (c) => c.hpMax, hint: '生命上限（含装具、科研与成长）' },
  { key: '节拍', from: (c) => c.tempoMax, hint: '本人那一池节拍的上限' },
  { key: '反现实抗性', from: (c) => c.axes['物理抗性'], hint: '数值层里的抗性轴 —— 反现实的撞击也走这一条' },
  { key: '破坏力', from: (c) => c.axes['破坏力'], hint: '主攻轴的读数' },
  { key: '机动', from: (c) => c.axes['敏捷度'], hint: '即名册五轴里的「敏捷度」：出手与走位' },
  { key: '意志力', from: (c) => c.axes['意志力'], hint: '精神韧性；回应与屏障那一类按它算' },
  { key: '反现实亲和', from: (c) => c.axes['反现实亲和'], hint: '与反现实的亲和与介入深度' },
]

/* ============================================================
   二、「切换天使之律」的呈现层
   ------------------------------------------------------------
   主角在原文里有两副武装面目：弹痕「noapusa」（化身之枪）与斩击之戒「a Session.」
   （灵魂共奏）。这两副在 lib/operator-arc.ts 的 OP_PERIODS 里各是一段**时期**，
   数据齐全（五轴、武装、技能表都在）—— 所以这里按它来，不另造一套形态表。

   这一枚按钮只做一件事：**把这一页翻到那一段时期的读数上**。
   它不写存档、不改编成、不进战斗 —— 战斗侧读的仍是剧情推进到的那一段
   （opPeriodAt(epDone)）。写在明处，免得有人以为按一下上阵就换了形态。
   ============================================================ */
type Liturgy = 'scar' | 'cut'

function periodOfLiturgy(f: Liturgy): OpPeriod {
  const hit = OP_PERIODS.find((p) =>
    f === 'scar' ? p.armSub.indexOf('弹痕') >= 0 : p.armSub.indexOf('斩击') >= 0)
  return hit ?? OP_PERIODS[0]!
}

/** 某一时期在时间线上的位置（0..1）—— 与 derive 的 periodProgress 同一把尺 */
function progressAtEvent(eventId: string): number {
  const i = TIMELINE.findIndex((e) => e.id === eventId)
  if (i < 0) return 0
  return Math.max(0, Math.min(1, i / Math.max(1, TIMELINE.length - 1)))
}

/* ============================================================
   三、武装那一套（同一人名下可能不止一件：后几件是到达点那一档）
   ============================================================ */
function armsOf(id: string): ArmEntry[] {
  return ARMS.filter((a) => a.holderId === id)
}

/** 特殊武器在「能力体系」那五类里的名字是「异常遗物」 */
const CAT_OF_KIND: Record<string, string> = {
  弹痕: '弹痕', 斩击: '斩击', 片羽: '片羽', 特殊武器: '异常遗物',
}
const SYSTEM_CATS = ['弹痕', '片羽', '斩击', '异常遗物', '终末']

/** 一手技能归哪个标签（攻击 / 牵制 / 辅助）—— 按它挂的框架归纳，不为每个人各编一句 */
const TAG_OF_ARCH: Record<string, string> = {
  强袭: '攻击', 扫荡: '攻击', 穿甲: '攻击', 连打: '攻击', 乱击: '攻击', 驱逐: '攻击', 震退: '攻击',
  到达点: '攻击', basic: '攻击',
  牵制: '牵制', 重压: '牵制', 解厄: '牵制', 增益: '牵制', 提速: '牵制', 解放: '牵制', 启动: '牵制',
  治愈: '辅助', 自愈: '辅助', 屏障: '辅助', 坚守: '辅助',
}

function tagOfSkill(arch?: string, kind?: string): string {
  if (kind === '终结技') return '终结'
  return (arch && TAG_OF_ARCH[arch]) || '攻击'
}

/* ============================================================
   四、一页
   ============================================================ */
type TabKey = 'detail' | 'system' | 'tactics' | 'colors' | 'arm' | 'extra'

const TABS: { key: TabKey; cn: string; en: string }[] = [
  { key: 'detail', cn: '详情', en: 'PROFILE' },
  { key: 'system', cn: '能力体系', en: 'SYSTEM' },
  { key: 'tactics', cn: '战术执行', en: 'TACTICS' },
  { key: 'colors', cn: '世界的色彩', en: 'COLORS' },
  { key: 'arm', cn: '反现实武装', en: 'ARMAMENT' },
  { key: 'extra', cn: '附属档案', en: 'ANNEX' },
]

const cx = (...xs: Array<string | false | undefined>) => xs.filter(Boolean).join(' ')

export function Character({ onShowOld }: { onShowOld?: () => void }) {
  const { epDone, isMet, profileRequest, clearProfileRequest } = useTerminal()

  const rows = useMemo(buildRows, [])
  const catalog = useMemo(() => [OP_ROW, ...rows], [rows])

  const [selId, setSelId] = useState<string>(OPERATOR_ID)
  const [tab, setTab] = useState<TabKey>('detail')
  const [liturgy, setLiturgy] = useState<Liturgy>('scar')
  const [nsfwOn, setNsfwOn] = useState(false)
  const [equip, setEquip] = useState<Record<string, string>>({})
  const [owned, setOwned] = useState<Record<string, number>>({})
  const [coin, setCoin] = useState(0)
  const [note, setNote] = useState('')
  /** 买完一级要重读成长表 —— 那几张表是同步读 localStorage 的，靠它把这一页推醒 */
  const [ver, setVer] = useState(0)

  const sel = catalog.find((r) => r.id === selId) ?? catalog[0]!
  const unlocked = sel.kind === 'operator' || isMet(sel.id)

  useEffect(() => {
    void readEquip().then(setEquip)
    void readGearBag().then(setOwned)
    void readCoin().then(setCoin)
  }, [ver])

  /* 别处点「打开某人的档案」跳进来：切到那个人、停在详情 */
  useEffect(() => {
    if (!profileRequest) return
    if (!isMet(profileRequest.id)) { clearProfileRequest(); return }
    setSelId(profileRequest.id)
    setTab('detail')
    clearProfileRequest()
  }, [profileRequest, isMet, clearProfileRequest])

  /* 换人就回到详情、私密立绘收回去 —— 那是**某一个人**身上的一层，不该跟着走 */
  useEffect(() => { setNsfwOn(false); setNote('') }, [selId])

  const progress = useMemo(() => periodProgress(epDone), [epDone])
  const livePeriod = useMemo(() => opPeriodAt(epDone), [epDone])
  /**
   * 这一页此刻量的是哪一段：
   *   · 主角：按「天使之律」那一枚翻，默认停在**进度推进到的那一段**上；
   *   · 其余人：就是此刻的推进进度，一段不动。
   * 翻出来的那一段用它自己的进度去造人 —— 于是五轴、技能表、带出来的手全是**真数据**，
   * 不是照着现值乘一个系数。
   */
  const shownPeriod = sel.kind === 'operator' && liturgy === 'cut' ? periodOfLiturgy('cut') : livePeriod
  const opProg = sel.kind === 'operator' ? progressAtEvent(shownPeriod.at) : progress

  const c = useMemo(
    () => combatantOf(sel.id, opProg, 0, equip[sel.id]),
    [sel.id, opProg, equip],
  )

  /* ---- 立绘：定妆那张 + （有素材时）私密那张 ---- */
  const sfwArt = useCharImg(sel.id, 'full')
  const [nsfwArt, setNsfwArt] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setNsfwArt(null)
    void probeCg('cg-intim-' + sel.id, intimArtDir(sel.id)).then((u) => { if (alive) setNsfwArt(u) })
    return () => { alive = false }
  }, [sel.id])
  const artSrc = nsfwOn && nsfwArt ? nsfwArt : sfwArt

  /* ---- 成长：技能 / 天赋 / 色彩 ---- */
  const skills = useMemo(() => skillUpsOf(sel.id, epDone), [sel.id, epDone, ver])
  const talents = useMemo(() => talentUpsOf(sel.id, epDone), [sel.id, epDone, ver])
  const colors = useMemo(() => colorsOf(), [ver])
  const colorSum = colors.reduce(
    (s, x) => s + Object.keys(x.bonus).reduce((a, k) => a + (x.bonus[k as keyof typeof x.bonus] ?? 0), 0),
    0,
  )

  const setGear = useCallback((charId: string, gearId: string | null) => {
    setEquip((prev) => {
      const next = { ...prev }
      if (gearId) next[charId] = gearId
      else delete next[charId]
      void writeEquip(next)
      return next
    })
  }, [])

  const buyUp = useCallback(async (kind: GrowthKind, key: string) => {
    const st = await canUnlock(sel.id, kind, key, { coin, epDone })
    if (!st.ok) { setNote(st.reason || '现在还买不了'); return }
    const r = await unlockWithPoints(sel.id, kind, key)
    setCoin(r.coin)
    setNote(r.ok ? '已解锁。' : r.reason)
    if (r.ok) setVer((v) => v + 1)
  }, [sel.id, coin, epDone])

  const buyColorUp = useCallback(async (id: string) => {
    const r = await buyColor(id)
    setCoin(r.coin)
    setNote(r.ok ? '已升到第 ' + r.lv + ' 级。' : r.reason)
    if (r.ok) setVer((v) => v + 1)
  }, [])

  const arms = useMemo(() => armsOf(sel.id), [sel.id])
  const gear: GearDef | undefined = c.gear ? GEAR_OF[c.gear] : undefined
  const specs = useMemo(() => {
    const m: Record<string, SkillSpec> = {}
    for (const k of c.skills) m[k.name] = k
    return m
  }, [c])

  return (
    <div className="vpage" data-character-page>
      {/* ---- 顶：横向切换栏。只摆头像与分类，别的什么也不摆 ---- */}
      <div className={css.bar} data-char-bar role="tablist" aria-label="角色切换">
        {catalog.map((r) => {
          const on = r.id === sel.id
          const met = r.kind === 'operator' || isMet(r.id)
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-char-switch={r.id}
              data-char-sealed={met ? undefined : '1'}
              className={cx(css.slot, on && css.slotOn)}
              onClick={() => { setSelId(r.id); setTab('detail') }}
            >
              <Portrait
                avatarId={r.id}
                name={met ? r.name : '？？？'}
                hue={r.hue}
                sigil={met ? r.sigil : '？'}
                size={44}
              />
              <span className={css.slotCamp}>{met ? r.camp : '未登记'}</span>
            </button>
          )
        })}
      </div>

      <div className={css.stage}>
        {/* ---- 左：深色竖排页签 ---- */}
        <nav className={css.rail} data-char-tabs aria-label="角色模块">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              data-char-tab={t.key}
              data-char-tab-on={t.key === tab ? '1' : undefined}
              className={cx(css.railBtn, t.key === tab && css.railOn)}
              onClick={() => { setTab(t.key); setNote('') }}
            >
              <i className="mono">{String(i + 1).padStart(2, '0')}</i>
              <b>{t.cn}</b>
              <small>{t.en}</small>
            </button>
          ))}
          {onShowOld ? (
            <button type="button" className={css.railOld} data-char-old onClick={onShowOld}>
              旧版显示
            </button>
          ) : null}
        </nav>

        {/* ---- 中：立绘。有私密立绘的人才点得动 ---- */}
        <div className={css.artCol}>
          <button
            type="button"
            className={cx(css.artBox, !!nsfwArt && css.artLive)}
            data-char-art={sel.id}
            data-char-nsfw={nsfwOn ? '1' : '0'}
            data-char-art-ready={nsfwArt ? '1' : undefined}
            disabled={!nsfwArt}
            title={nsfwArt ? (nsfwOn ? '点一下换回定妆立绘' : '点一下换私密立绘') : '此人名下还没有另一张立绘'}
            onClick={() => { if (nsfwArt) setNsfwOn((v) => !v) }}
          >
            {artSrc ? (
              <img src={artSrc} alt={sel.name} loading="eager" decoding="async" />
            ) : (
              <span className={css.artGlyph} style={{ color: inkOf(sel.hue) }}>{unlocked ? sel.sigil : '？'}</span>
            )}
            {nsfwArt ? (
              <span className={css.artTip}>
                {nsfwOn ? '私密立绘 · 点一下翻回去' : '另有私密立绘 · 点一下看'}
              </span>
            ) : null}
          </button>
          <div className={css.artName}>
            <b>{unlocked ? sel.name : '？？？'}</b>
            <small>{unlocked ? sel.epithet : '尚未登记'}</small>
          </div>
        </div>

        {/* ---- 右：主内容区 ---- */}
        <div className={css.main} data-char-panel={tab}>
          {!unlocked ? (
            <div className={css.sealed} data-char-sealed-panel>
              <b>封存</b>
              <span>此人还没照过面 —— 名册上不显名、不泄数值。遇见了再看。</span>
            </div>
          ) : tab === 'detail' ? (
            <DetailTab
              row={sel} c={c} gear={gear} arms={arms}
              isOp={sel.kind === 'operator'} liturgy={liturgy}
              onLiturgy={() => setLiturgy((v) => (v === 'scar' ? 'cut' : 'scar'))}
              shownPeriod={shownPeriod} livePeriod={livePeriod}
              onArm={() => setTab('arm')}
            />
          ) : tab === 'system' ? (
            <SystemTab row={sel} c={c} arms={arms} ups={skills} />
          ) : tab === 'tactics' ? (
            <TacticsTab id={sel.id} skills={skills} talents={talents} specs={specs}
              coin={coin} note={note} onBuy={buyUp} />
          ) : tab === 'colors' ? (
            <ColorsTab colors={colors} coin={coin} note={note} sum={colorSum} onBuy={buyColorUp} />
          ) : tab === 'arm' ? (
            <ArmTab
              row={sel} c={c} arms={arms} gear={gear} equip={equip[sel.id]}
              owned={owned} onPick={(g) => setGear(sel.id, g)}
            />
          ) : (
            <ExtraTab row={sel} arms={arms} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   五、详情
   ============================================================ */
function DetailTab({ row, c, gear, arms, isOp, liturgy, onLiturgy, shownPeriod, livePeriod, onArm }: {
  row: Row
  c: Combatant
  gear?: GearDef
  arms: ArmEntry[]
  isOp: boolean
  liturgy: Liturgy
  onLiturgy: () => void
  shownPeriod: OpPeriod
  livePeriod: OpPeriod
  onArm: () => void
}) {
  const maxV = Math.max(1, ...CORE_ROWS.map((r) => r.from(c)))
  return (
    <div className={css.panel} data-char-detail={row.id}>
      {/* 模块一：身份识别与核心面板 */}
      <section className={css.card}>
        <div className={css.head}>
          <div>
            <small className="mono">{row.groupLabel} · {row.role}</small>
            <h2>{row.name}</h2>
            <p className={css.epithet}>{row.epithet}</p>
          </div>
          <span className={css.camp} data-char-camp={row.camp}>{row.camp}</span>
        </div>

        <div className={css.kv}>
          <div><small>阵营</small><b data-char-faction>{row.camp}</b></div>
          <div><small>战术定位</small><b>{c.cls}</b></div>
          <div><small>所属</small><b>{row.division}</b></div>
          <div><small>终末潜力</small><b>{row.potential}</b></div>
        </div>

        <div className={css.bars}>
          {CORE_ROWS.map((r) => {
            const v = r.from(c)
            const pct = Math.max(2, Math.min(100, (v / maxV) * 100))
            return (
              <div key={r.key} className={css.stat} data-char-stat={r.key} title={r.hint}>
                <span className={css.statName}>{r.key}</span>
                <span className={css.statTrack}>
                  <i style={{ width: pct + '%', background: row.hue }} />
                </span>
                <b className="mono">{v}</b>
              </div>
            )
          })}
        </div>
        <p className={css.foot}>
          这七个读数与作战里点开同一个人看到的是同一组（同一个 derive）；条宽按本人最高的那一栏归一 ——
          条满只说明「他这一栏最高」，不是到顶。
        </p>
      </section>

      {/* 模块二：固有能力与装载 */}
      <section className={css.card}>
        <h3 className={css.cardTitle}>自带装具</h3>
        {gear ? (
          <button type="button" className={css.gearCard} data-char-gear={gear.id} onClick={onArm}>
            <b>{gear.name}</b>
            <span>{gear.desc}</span>
            <em>点一下进「反现实武装」换装</em>
          </button>
        ) : arms[0] ? (
          /* 没另外装配的时候，「自带装具」读的就是**他身上那件反现实武装**（arms.ts 按 holderId 关联）。
             这不是装具位那件可换的东西 —— 它是本相，所以这里只把他引到武装页去。 */
          <button type="button" className={css.gearCard} data-char-gear={arms[0].id} onClick={onArm}>
            <b>{arms[0].name}</b>
            <span>{arms[0].kind} · {arms[0].sub}</span>
            <em>他身上自带的那件 —— 点一下进「反现实武装」</em>
          </button>
        ) : (
          <div className={css.gearCard} data-char-gear="__none">
            <b>未装配</b>
            <span>他身上既没有登记过的武装，也没有装配具 —— 点开「反现实武装」挑一件。</span>
          </div>
        )}

        {isOp ? (
          <div className={css.liturgy} data-char-liturgy={liturgy}>
            <button type="button" className={css.liturgyBtn} data-char-liturgy-toggle onClick={onLiturgy}>
              切换天使之律
            </button>
            <div className={css.liturgyBody}>
              <b>{liturgy === 'scar' ? '弹痕时期' : '斩击时期'} · {shownPeriod.arm}</b>
              <span>{shownPeriod.armSub}</span>
              <span>{shownPeriod.armNote}</span>
              <small>
                这一枚只翻这一页：呈现层，不改存档、不改编成、不进战斗 ——
                战斗侧读的仍是剧情推进到的那一段（现在是「{livePeriod.title}」）。
              </small>
            </div>
          </div>
        ) : null}

        {c.passive ? (
          <div className={css.passive} data-char-passive>
            <b>被动 · {c.passive.name}</b>
            <span>{c.passive.desc}</span>
            <span className={css.passiveNums}>
              {passiveText(c.passive).map((t) => <i key={t}>{t}</i>)}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  )
}

/* ============================================================
   六、能力体系
   ============================================================ */
function SystemTab({ row, c, arms, ups }: {
  row: Row
  c: Combatant
  arms: ArmEntry[]
  ups: UpState[]
}) {
  const base = arms[0]
  const cat = base ? (CAT_OF_KIND[base.kind] ?? base.kind) : null
  const tradition = base ? ARM_TRADITIONS.find((t) => t.kind === base.kind) : undefined
  /** 技能名 → 指向性那一条线（成长表按技能名建线，见 data/growth 的 buildLines） */
  const upOf = (name: string) => ups.find((u) => u.name === name)
  return (
    <div className={css.panel} data-char-system={row.id}>
      <section className={css.card}>
        <h3 className={css.cardTitle}>体系归属</h3>
        <div className={css.cats}>
          {SYSTEM_CATS.map((k) => {
            const on = k === cat || (k === '终末' && row.potential !== '—')
            return (
              <span
                key={k}
                className={cx(css.cat, on && css.catOn)}
                data-char-cat={k}
                data-char-cat-on={on ? '1' : undefined}
              >
                {k}
              </span>
            )
          })}
        </div>
        {tradition ? (
          <div className={css.trad}>
            <b>{tradition.kind} · {tradition.sub}</b>
            <span>{tradition.school}</span>
            <span>{tradition.statue}</span>
            <span>{tradition.basis}</span>
          </div>
        ) : null}
        <div className={css.note2}>
          <b>终末</b>
          <span>
            {row.trait} ｜ 潜力 {row.potential}
            {row.rank ? ' ｜ 委员会排行 ' + row.rank : ''}
          </span>
        </div>
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>指向性 · 从本相到到达点</h3>
        {base ? (
          <>
            <ol className={css.ladder}>
              {arms.map((a, i) => (
                <li key={a.id} data-char-ring={a.id}>
                  <div className={css.ringTop}>
                    <b>{a.name}</b>
                    <span className="mono">{a.sub}</span>
                    <em>{i === 0 ? '本相' : i === arms.length - 1 ? '到达点 / 超限' : '指向性升级'}</em>
                  </div>
                  <p>{i === 0 ? a.power : a.awakened}</p>
                  {a.phrase ? <p className={css.ringLine}>{a.phrase}</p> : null}
                  <small className="mono">{a.ref}</small>
                </li>
              ))}
            </ol>
            <p className={css.foot}>
              同一人名下的后几件是「到达点」那一档 —— 本相走到尽头才露出来的那副样子，不是另一件东西。
            </p>
          </>
        ) : (
          <div className={css.sealed}>
            <b>暂无</b>
            <span>此人名下没有登记过的反现实武装考据（arms.ts 只收有本相可考的人）。</span>
          </div>
        )}
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>技能带的指向性档</h3>
        <div className={css.skillLadder}>
          {c.skills.map((k) => {
            const u = upOf(k.name)
            const lv = u ? u.lv : 0
            const max = u ? u.max : 0
            return (
              <div key={k.id} className={css.skillSeg} data-char-seg={k.id}>
                <span className={css.tag2}>{tagOfSkill(k.arch, k.kind)}</span>
                <b>{k.name}</b>
                <small className="mono">{archNameOf(k.arch) ?? k.arch ?? k.kind}</small>
                <span className={css.segLv}>
                  {max ? lv + '/' + max : '—'}
                  {max && lv >= max ? <i>超限</i> : null}
                </span>
              </div>
            )
          })}
        </div>
        <p className={css.foot}>
          「超限」= 那条线已经练到顶（指向性升级一共三级；终结技另走一条路：到达点）。
          名册里没有成长线的手（普攻、解封门）不标档。
        </p>
      </section>
    </div>
  )
}

/* ============================================================
   七、战术执行
   ------------------------------------------------------------
   每条 = 【标签】+ 技能名；右上角统一「能耗: X / 冷却: X」；
   正文是视觉表现 + 机制效果；有附加效果的，卡片底部用一条分割线隔开并加粗
   —— 那一句就是升级会往上抬的那一项（growth 表的 GrowthLevel.extra）。
   ============================================================ */
function UpCard({ st, kind, spec, coin, note, onBuy }: {
  st: UpState
  kind: GrowthKind
  spec?: SkillSpec
  coin: number
  note: string
  onBuy: (kind: GrowthKind, key: string) => void
}) {
  const line = linesOf(st.key.split('|')[0] ?? '', kind).find((l) => l.key === st.key)
  const lv = st.lv
  const lvData = line?.levels.find((l) => l.lv === Math.max(1, lv)) ?? line?.levels[0]
  const next = st.next
  const affordable = !!next && !st.free && coin >= (next.cost ?? 0)
  const mech: string[] = []
  if (spec) {
    const mul = mulTextOf(spec)
    if (mul) mech.push(mul)
    mech.push(...effectTextsOf(spec.effect, spec.turns))
  }
  return (
    <div className={css.upCard} data-char-up={st.key} data-char-up-kind={kind}>
      <div className={css.upTop}>
        <span className={css.tag2}>{kind === 'talent' ? '天赋' : tagOfSkill(spec?.arch, spec?.kind)}</span>
        <b>{st.name}</b>
        <span className={css.rate} data-char-rate>
          能耗: {lvData?.energy ?? 0} / 冷却: {lvData?.cd ?? 0}
        </span>
      </div>
      <div className={css.upBody}>
        <p>{lvData?.desc ?? st.note}</p>
        {mech.length ? (
          <p className={css.mech} data-char-mech>{mech.join(' · ')}</p>
        ) : null}
      </div>
      {lvData?.extra ? (
        <div className={css.extra} data-char-extra>
          <b>{lvData.extra}</b>
        </div>
      ) : null}
      <div className={css.upFoot}>
        <span className="mono">Lv.{lv}/{st.max}</span>
        {!next ? (
          <span className={css.done}>已满级</span>
        ) : st.free ? (
          <span className={css.sealed2}>剧情解锁 · 读到那一段自动到位</span>
        ) : (
          <button
            type="button"
            className={css.buy}
            data-char-buy={st.key}
            disabled={!affordable}
            onClick={() => onBuy(kind, st.key)}
            title={affordable ? '花终末点数解锁这一级' : '点数不足：还差 ' + ((next.cost ?? 0) - coin) + ' 点'}
          >
            {affordable ? '解锁下一级 · ' + next.cost : '点数不足 · 需 ' + next.cost}
          </button>
        )}
      </div>
      {note ? <div className={css.noteLine}>{note}</div> : null}
    </div>
  )
}

function TacticsTab({ id, skills, talents, specs, coin, note, onBuy }: {
  id: string
  skills: UpState[]
  talents: UpState[]
  specs: Record<string, SkillSpec>
  coin: number
  note: string
  onBuy: (kind: GrowthKind, key: string) => void
}) {
  return (
    <div className={css.panel} data-char-tactics={id}>
      <section className={css.card}>
        <h3 className={css.cardTitle}>技能</h3>
        {skills.length ? (
          <div className={css.upList}>
            {skills.map((st) => (
              <UpCard key={st.key} st={st} kind="skill" spec={specs[st.name]}
                coin={coin} note={note} onBuy={onBuy} />
            ))}
          </div>
        ) : (
          <div className={css.sealed}>
            <b>暂无</b><span>成长表里没有这个人的技能线（它不是名册上的人）。</span>
          </div>
        )}
      </section>
      <section className={css.card}>
        <h3 className={css.cardTitle}>天赋</h3>
        {talents.length ? (
          <div className={css.upList}>
            {talents.map((st) => (
              <UpCard key={st.key} st={st} kind="talent" coin={coin} note={note} onBuy={onBuy} />
            ))}
          </div>
        ) : (
          <div className={css.sealed}>
            <b>暂无</b><span>这个人的天赋还没有登记成成长线。</span>
          </div>
        )}
      </section>
      <p className={css.foot}>
        第 1 级由剧情节点白送（读到那一段自动到位），往上的几级走终末点数。手上：{coin} 点。
      </p>
    </div>
  )
}

/* ============================================================
   八、世界的色彩
   ------------------------------------------------------------
   六支原文奇迹，每支只抬一项数值，1→7 级。两条来路：拿终末点数买（价走 growth 的公式），
   或者击破具名首领掉落（账记在 growth 的 drops 里 —— 这一页不重复记账，只把规则摆出来）。
   ============================================================ */
const FIELD_NAME: Record<string, string> = {
  atk: '破坏力', hp: '生命上限', res: '物理抗性', aff: '反现实亲和', will: '意志力', evade: '闪避',
}

function ColorsTab({ colors, coin, note, sum, onBuy }: {
  colors: ReturnType<typeof colorsOf>
  coin: number
  note: string
  sum: number
  onBuy: (id: string) => void
}) {
  return (
    <div className={css.panel} data-char-colors>
      <section className={css.card}>
        <div className={css.head}>
          <div>
            <small className="mono">世界的色彩 · 六支原文奇迹</small>
            <h2>每支只抬一项，最高 {COLOR_MAX_LEVEL} 级</h2>
          </div>
          <span className={css.camp}>全队共享 · 合计 +{(sum * 100).toFixed(1)}%</span>
        </div>
        <div className={css.colorList}>
          {colors.map((x) => {
            const full = x.nextCost === null
            const ok = !full && coin >= (x.nextCost ?? 0)
            return (
              <div key={x.id} className={css.colorRow} data-char-color={x.id} data-char-color-lv={x.lv}>
                <div className={css.colorTop}>
                  <b>{x.name}</b>
                  <span className="mono">Lv.{x.lv}/{x.max}</span>
                </div>
                <p className={css.colorNote}>{x.note}</p>
                <div className={css.pips}>
                  {Array.from({ length: x.max }, (_, i) => (
                    <i key={i} className={i < x.lv ? css.pipOn : undefined} />
                  ))}
                </div>
                <div className={css.colorFoot}>
                  <span className="mono">
                    效果 {FIELD_NAME[x.field] ?? x.field} +{(x.per * Math.max(1, x.lv) * 100).toFixed(1)}%
                    {x.lv ? '（' + x.lv + ' × ' + (x.per * 100).toFixed(1) + '%）' : '（还没点）'}
                  </span>
                  {full ? (
                    <span className={css.done}>已满级</span>
                  ) : (
                    <button
                      type="button"
                      className={css.buy}
                      data-char-color-buy={x.id}
                      disabled={!ok}
                      onClick={() => onBuy(x.id)}
                      title={ok ? '花终末点数升一级' : '点数不足：还差 ' + ((x.nextCost ?? 0) - coin) + ' 点'}
                    >
                      {'下一级 ' + x.nextCost + ' · ' + (ok ? '购买' : '点数不足')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className={css.foot}>{COLOR_DROP_RULE}</p>
        <p className={css.foot}>
          击破具名首领掉落判定 {(COLOR_DROP_CHANCE * 100).toFixed(0)}%（账记在成长那一支，这一页不另记）。
        </p>
      </section>
      {note ? <div className={css.noteLine}>{note}</div> : null}
    </div>
  )
}

/* ============================================================
   九、反现实武装
   ------------------------------------------------------------
   这一页两半：**武装本身**（arms.ts，按 holderId 关联，只读）与**装具**（编成里那件，
   点一下就换 —— 与档案页、作战屏「更换装备」写的是同一份记录，见 battle/store 的 writeEquip）。
   ============================================================ */
function ArmTab({ row, c, arms, gear, equip, owned, onPick }: {
  row: Row
  c: Combatant
  arms: ArmEntry[]
  gear?: GearDef
  equip?: string
  owned: Record<string, number>
  onPick: (g: string | null) => void
}) {
  const pool = GEARS.filter((g) => (owned[g.id] ?? 0) > 0)
  return (
    <div className={css.panel} data-char-arm={row.id}>
      <section className={css.card}>
        <h3 className={css.cardTitle}>武装 · {arms[0]?.name ?? '暂无'}</h3>
        {arms.length ? (
          arms.map((a, i) => (
            <div key={a.id} className={css.armBlock} data-char-arm-entry={a.id}>
              <div className={css.armTop}>
                <b>{a.name}</b>
                <span className="mono">{a.sub}</span>
                <em>{i === 0 ? a.kind : '到达点'}</em>
              </div>
              {a.phrase ? <p className={css.ringLine}>{a.phrase}</p> : null}
              <p>{i === 0 ? a.power : a.awakened}</p>
            </div>
          ))
        ) : (
          <div className={css.sealed}>
            <b>暂无</b>
            <span>此人名下没有登记过的武装考据 —— 他的入口是终端，不是石像。</span>
          </div>
        )}
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>武装解锁的手与加成</h3>
        <div className={css.armSkills}>
          {c.skills.map((k) => (
            <div key={k.id} className={css.armSkill} data-char-armskill={k.id}>
              <span className={css.tag2}>{tagOfSkill(k.arch, k.kind)}</span>
              <b>{k.name}</b>
              <span className="mono tiny">
                {(mulTextOf(k) ?? '不造成伤害') + ' · 耗 ' + k.cost + (k.cd ? ' · 冷却 ' + k.cd : '')}
              </span>
              {effectTextsOf(k.effect, k.turns).length ? (
                <small>{effectTextsOf(k.effect, k.turns).join(' · ')}</small>
              ) : null}
            </div>
          ))}
        </div>
        {gear ? (
          <div className={css.gearMods} data-char-gearmods={gear.id}>
            <b>装具加成 · {gear.name}</b>
            <span>{modsTextsOf(gear.mods).join(' · ') || '无修正'}</span>
            {gear.skill ? <small>附带一手「{gear.skill.name}」</small> : null}
          </div>
        ) : null}
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>换装具</h3>
        <p className={css.foot}>每人至多一件 · 不消耗回合、不花点数 · 换完出击就是这一套。</p>
        {pool.length ? (
          <div className={css.gearList}>
            <button
              type="button"
              data-arm-gear="__none"
              className={cx(css.gearRow, !equip && css.gearOn)}
              onClick={() => onPick(null)}
            >
              <b>不装配</b>
              <span>空着也是空着，但空着不挨罚。</span>
            </button>
            {pool.map((g) => {
              const ok = canEquip(row.id, g.id)
              const on = equip === g.id
              const who = g.onlyFor?.map((x) => personOf(x)?.name ?? x).join('、')
              return (
                <button
                  key={g.id}
                  type="button"
                  data-arm-gear={g.id}
                  disabled={!ok}
                  className={cx(css.gearRow, on && css.gearOn)}
                  title={ok ? g.desc : g.name + ' 只认 ' + (who ?? '本人')}
                  onClick={() => { if (ok) onPick(on ? null : g.id) }}
                >
                  <b>{g.name}<i>{g.sub}</i></b>
                  <span>{ok ? (modsTextsOf(g.mods).join(' · ') || '无修正') : '认人 · 仅限 ' + (who ?? '本人')}</span>
                  <span>{g.desc}</span>
                  {on ? <em>装配中</em> : null}
                </button>
              )
            })}
          </div>
        ) : (
          <div className={css.sealed}>
            <b>暂无</b>
            <span>军需处还没换到能装的东西 —— 拿贡献点去兑，或者从打过的敌人身上搜。</span>
          </div>
        )}
      </section>
    </div>
  )
}

/* ============================================================
   十、附属档案
   ------------------------------------------------------------
   来历与语录取档案表；语音取 personas 的分层人物卡；委员会评语**没有数据源**
   （名册只登记了学生排行 RANK），所以写「暂无」。
   智库那几格按阵营关键词从 lore.ts 里挑真条目；武装能对上 codex 的另摆一条。
   ============================================================ */
const LORE_KEYS: Record<string, string[]> = {
  ao: ['苍之学园', '终末停滞委员会'],
  kaus: ['卡乌斯学院'],
  corp: ['Corporations'],
  out: ['异端审问', '终末'],
  op: ['终末停滞委员会', '低语'],
}

function ExtraTab({ row, arms }: { row: Row; arms: ArmEntry[] }) {
  const voice = useMemo(() => voiceLinesOf(row.id), [row.id])
  const keys = LORE_KEYS[row.groupKey] ?? []
  const lore = useMemo(
    () => LORE.filter((e) => keys.some((k) => e.title.indexOf(k) >= 0 || e.tags.some((t) => t.indexOf(k) >= 0))).slice(0, 3),
    [keys],
  )
  const codexId = arms[0] ? resolveEntityToCodexId(arms[0].name) : null
  const codex = codexId ? CODEX.find((e) => e.id === codexId) : undefined
  return (
    <div className={css.panel} data-char-extra={row.id}>
      <section className={css.card}>
        <h3 className={css.cardTitle}>背景故事</h3>
        <p className={css.bio}>{row.bio || '暂无'}</p>
        {row.quote ? <blockquote className={css.quote}>{row.quote}</blockquote> : null}
        <div className={css.kv}>
          <div><small>状态</small><b>{row.station}</b></div>
          <div><small>武装／终末</small><b>{row.trait}</b></div>
          {row.page ? <div><small>出处</small><b>{row.page}</b></div> : null}
        </div>
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>语音</h3>
        {voice.length ? (
          <ul className={css.voice}>
            {voice.map((v) => <li key={v}>{v}</li>)}
          </ul>
        ) : (
          <div className={css.sealed} data-char-voice-empty>
            <b>暂无</b><span>这个人还没有录入的台词档。</span>
          </div>
        )}
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>委员会评语</h3>
        <div className={css.sealed} data-char-comment>
          <b>暂无</b>
          <span>
            名册只登记了学生排行{row.rank ? '（此人 RANK ' + row.rank + '）' : '（此人没有 RANK）'}，
            没有逐人的委员会评语可引 —— 不替它编。
          </span>
        </div>
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>智库 · 关联条目</h3>
        {lore.length ? (
          <div className={css.loreList}>
            {lore.map((e) => (
              <div key={e.id} className={css.loreRow} data-char-lore={e.id}>
                <b>{e.title}<i>{e.sub}</i></b>
                <span>{e.cat}{e.ref ? ' · ' + e.ref : ''}</span>
                <p>{e.body.length > 180 ? e.body.slice(0, 180) + '…' : e.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className={css.sealed}><b>暂无</b><span>智库按阵营挑不到指向此人的条目。</span></div>
        )}
        {codex ? (
          <div className={css.loreRow} data-char-codex={codex.id}>
            <b>{codex.name}<i>{codex.alias}</i></b>
            <span>终末图鉴 · {codex.stageKw}{codex.stage >= 0 ? ' · Stage ' + codex.stage : ''}</span>
            <p>{codex.origin}</p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
