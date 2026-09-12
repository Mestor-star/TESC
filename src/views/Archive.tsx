import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowUUpLeft, LockKey } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { SIDECAST } from '../data/sidecast'
import { ROSTER_GROUPS, SIDE_AXIS, SIDE_AXIS_LIMIT, SIDE_TRAIT, SIDE_POTENTIAL, committeeRankOf } from '../data/roster'
import { personOf } from '../data/castmeta'
import { confirmOf } from '../data/bondstage'
import { bondName } from '../lib/format'
import type { BondGender } from '../lib/format'
import { opSituation } from '../lib/operator'
import { iconNameOf, iconOf } from '../lib/battle/icons'
import { AXIS_KEYS, OP_PERIODS, opBuiltinAt, opPeriodAt } from '../lib/operator-arc'
import { GEAR_OF, GEARS, canEquip } from '../lib/battle/gear'
import { passiveText } from '../lib/battle/roster'
import { effectTextsOf, mulTextOf } from '../lib/battle/skilltext'
import { archNameOf } from '../lib/battle/atlas'
import { combatantOf, periodProgress } from '../lib/battle/derive'
import { readEquip, readGearBag, writeEquip } from '../lib/battle/store'
import { AXIS_REF } from '../data/types'
import type { GearDef } from '../lib/battle/types'
import type { AxisVal, Character, CharacterStat } from '../data/types'
import { personaCardOf } from '../data/persona'
import {
  INTIMATE_SLOTS, LEWD_META, SLOT_META, VIRGIN, devStage, firstByName,
} from '../data/intimate'
import { Portrait, useCharImg } from '../components/Portrait'
import { CgSlot } from '../components/CgSlot'

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

/**
 * 五轴读数 / 条宽（'∞' → 满格）。
 * 条宽按量表基准（AXIS_REF = 200）归一化 —— 基准**不是上限**：
 * 战斗数值本身不封顶，越过基准的一律满格，并另标「超限」，
 * 免得把「条满了」误读成「这个人到顶了」。
 */
function axisW(v: AxisVal): number {
  return v === '∞' ? 100 : Math.min(100, (v / AXIS_REF) * 100)
}

/** 是否已越过量表基准（'∞' 单算 —— 它有条纹与「不可测」的说明） */
function axisOver(v: AxisVal | null | undefined): boolean {
  return typeof v === 'number' && v > AXIS_REF
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
  trait: string       // 弹痕 / 片羽 / 斩击 / 终末
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

/** 立绘全图查看器看的是谁。档案角色丢一个 Row 就够；操作员没有 Row，故只取这四个字段 */
type ViewTarget = Pick<Row, 'id' | 'name' | 'hue' | 'sigil'>

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
/**
 * 档案卡顶图：拿同一张立绘裁到半身（cover + full + 取景偏上）。
 * 展开的那份档案看的是全身，卡面上先给一半 —— 认人靠的是脸与身量，
 * 竖着塞进窄卡会把整身缩成一根；缺图则整条不摆（见 useCharImg）。
 */
function CardArt({ id, name }: { id: string; name: string }) {
  const url = useCharImg(id, 'full')
  if (!url) return null
  return (
    <div className={css.cardArt} aria-hidden>
      <img src={url} alt="" loading="lazy" decoding="async" />
      <span className={css.cardArtFade} />
      <span className={css.cardArtName}>{name}</span>
    </div>
  )
}

/**
 * 展开档案的左三分之一：立绘整身。
 * 有图就把这一栏铺满 —— 尺寸交给 CSS（栏宽是弹性的，钉死像素会在窄屏留出空档），
 * 整身完整可见（contain），右缘渐隐进档案；
 * 没图只摆一小块纹章占位：那一格的字号是跟着盒子算的，撑满整栏会变成一个巨大的字，像出了故障。
 */
function DossierArt({ focus, onView }: { focus: Row; onView: () => void }) {
  const url = useCharImg(focus.id, 'full')
  return (
    <div className={css.dossierArt} data-dossier-art={url ? 'img' : 'sigil'}>
      <Portrait
        avatarId={focus.id}
        name={focus.name}
        hue={focus.hue}
        sigil={focus.sigil}
        fit="contain"
        variant="full"
        width={168}
        height={224}
        /* 有图时把内联的像素尺寸交回 CSS：铺满左栏靠 .artImg 的 inset，不靠 width/height */
        style={url ? { width: 'auto', height: 'auto' } : undefined}
        className={css.artImg}
      />
      <span className={css.artFade} aria-hidden />
      <div className={css.artCap}>
        <span className="vhead__kicker" style={{ fontSize: 9 }}>PORTRAIT / 全身</span>
        <span className="tiny muted">
          {url ? '立绘整身。点「查看全图」放大到整屏。' : '尚无立绘素材，此位为纹章占位。'}
        </span>
        <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={onView}>
          查看全图
        </button>
      </div>
    </div>
  )
}

/**
 * 外形：取人物卡里「外貌」那一节的逐字摘录。
 * 人物卡是按原文考据写下的分层小传，外貌一节正是「长什么样」的正面记录；
 * 没有这一节（或角色未登记人物卡）→ 整节不摆，不编。
 */
function appearanceOf(id: string): string[] {
  const sec = personaCardOf(id)?.sections.find((s) => s.title === '外貌')
  return sec ? [...sec.lines] : []
}

function Meters({ row }: { row: Row }) {
  return (
    <>
      {AXIS_ORDER.map((k, i) => {
        const v = row.axis[i] ?? 0
        const lim = row.axisLimit[i] ?? null
        const vW = axisW(v)
        const limW = lim === null ? vW : Math.max(vW, axisW(lim))
        // 已登记的轴恒记双值「常态/极限」（含 200/∞）；未登记的轴退回单值
        const showLimit = lim !== null
        // '∞' 那一侧单独用条纹：「读不出数」与「数很大」不是一回事
        const inf = v === '∞'
        const limInf = lim === '∞'
        const stripe = (c: string) => `repeating-linear-gradient(-45deg, ${c} 0 5px, transparent 5px 10px)`
        const fillBg = inf ? stripe(row.hue) : `linear-gradient(90deg, ${row.hue}66, ${row.hue})`
        return (
          <div key={k} className={css.stat}>
            <small>{k}</small>
            <div className="meter" title={showLimit ? `常态 ${axisText(v)} · 极限 ${axisText(lim)}` : undefined}>
              {lim !== null && limW > vW ? (
                <div
                  className={`meter__fill ${limInf ? css.infFill : css.limitFill}`}
                  style={{ width: `${limW}%`, background: limInf ? stripe('var(--red)') : undefined }}
                />
              ) : null}
              <div
                className={`meter__fill ${inf ? css.infFill : ''}`}
                style={{ width: `${vW}%`, background: fillBg }}
              />
            </div>
            <span
              className="num"
              data-axis-num
              data-axis-normal={axisText(v)}
              data-axis-limit={showLimit ? axisText(lim) : ''}
              data-axis-over={axisOver(v) || axisOver(lim) ? '1' : undefined}
            >
              {showLimit ? `${axisText(v)}/${axisText(lim)}` : axisText(v)}
              {axisOver(v) || axisOver(lim) ? <i className={css.overMark}>超限</i> : null}
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

/** 技能图标：与作战面板同一套分配，档案里看到的和下场时看到的是同一枚 */
function SkillIcon({ id }: { id: string }) {
  const Ico = iconOf(id)
  return <Ico size={14} weight="bold" className={css.opAbilIco} data-skill-ico={iconNameOf(id)} />
}

/* ---------------- 私密档案（只对女角色生效 · 写在卡的背面） ---------------- */
/**
 * 私密档案的入口 —— 摆在正面档案最末。
 *
 * 这一页不是「展开一段」而是**把整张卡翻过来**（见 Archive 里的 flip 状态）：
 * 背面另起一版，左栏一个立绘位、右栏五根读数条。所以这里只留一个门：
 *   · 只对女角色生效 —— 非女角色 / 无底档者整节不出现（`hasIntimate`）；
 *   · **不封存**：这是本机只给「你」看的那一份，随时翻得开。羁绊到不到
 *     `INTIMATE_BOND` 管的是她本人肯不肯开口（私密话题与约会），不管这一页；
 *   · 这一节里**只有一颗写着「私密档案」的按钮**：不写抬头、不写背面记着什么 ——
 *     那一页是什么样子，翻开自己看。
 */
function IntimateGate({ charId, onFlip }: { charId: string; onFlip: () => void }) {
  const { intimOf } = useTerminal()
  if (!intimOf(charId)) return null

  return (
    <div className={css.dialogSection} data-intimate="open" data-intimate-ready>
      <button type="button" className={css.intimEnter} data-intimate-toggle onClick={onFlip}>
        <LockKey size={14} weight="bold" />
        私密档案
      </button>
    </div>
  )
}

/**
 * 卡的背面 —— 私密档案本体。
 *
 * 版面与正面同构（左立绘 / 右档案）。读数是**五根条**：四处部位开发度 + 色情度，
 * 与「能力参数」用同一套条（`.stat` + `.meter`），只是那五轴说的是战斗力，
 * 这五根说的是这一件事。另有三节不是读数：最近的性行为、对这种事情的看法、破处 ——
 * 它们各是一句话（破处是一个事实），照实写出来即可。
 *
 * 立绘位走 CgSlot：素材丢 `public/cg/cg-intim-<角色id>.webp|png|jpg` 即点亮，
 * 缺图时摆「待补」虚线框 —— 版位先占住，补图之后版面不跳。
 *
 * 底档在 `data/intimate.ts`（游戏内拟制，非原文考据），推进在 `world.intim`
 * （约会与私密往来落下）—— 这一页只把两者合成之后照搬上屏，自己不算任何数；
 * 栏位上也不写「这一栏是怎么来的」那种说明 —— 读的人要看的是她，不是这份档案的规则。
 */
function IntimateBack({ charId, hue, name, onBack }: { charId: string; hue: string; name: string; onBack: () => void }) {
  const { intimOf, operatorName } = useTerminal()
  const prof = intimOf(charId)
  if (!prof) return null
  const opName = operatorName.trim() || '言万心叶'

  /**
   * 一根条：标签 / 条 / 读数 / 档位词 —— 与「能力参数（五轴评定）」同一副骨架。
   * 底下那行状态句只有部位条有（色情度不挂部位，没有「那一处的状态」这回事）。
   */
  const bar = (key: string, label: string, hint: string, dev: number, color: string, state?: string) => (
    <div className={css.intimStat} key={key} data-intimate-slot={key}>
      <div className={css.stat} title={hint}>
        <small>{label}</small>
        <div className="meter">
          <div
            className="meter__fill"
            style={{ width: `${dev}%`, background: `linear-gradient(90deg, ${color}66, ${color})` }}
          />
        </div>
        <span className="num">{dev}</span>
        <i className={css.intimStage}>{devStage(dev)}</i>
      </div>
      {state ? (
        <p className={css.intimState}>
          <span className={css.intimStateK}>状态</span>{state}
        </p>
      ) : null}
    </div>
  )

  return (
    <div className={css.intimBack} data-intimate-back>
      {/* 左栏：私密档案的立绘位。图待补 —— 丢一张同名图进 public/cg/ 即点亮 */}
      <div className={css.intimBackArt}>
        <CgSlot
          cgId={`cg-intim-${charId}`}
          caption={`${name} · 私密档案立绘（图待补）`}
          ratio="3 / 4"
        />
      </div>

      <div className={css.intimBackText}>
        <div className={css.dialogHead}>
          <Portrait avatarId={charId} name={name} hue={hue} sigil="密" size={54} round />
          <div className={css.dialogTitle}>
            <small>PRIVATE DOSSIER · 背面</small>
            <h3>{name}</h3>
            <div style={{ color: hue, fontSize: 13, marginTop: 2 }}>私密档案（非原文考据 · 本终端拟制）</div>
          </div>
          <button className={css.dialogClose} onClick={onBack} aria-label="翻回正面" data-intimate-back-close>
            <ArrowUUpLeft size={18} weight="bold" />
          </button>
        </div>

        <div className={css.dialogBody}>
          {/* 五根读数条：先单独一根色情度（不挂部位，整幅一条长条），
              再是四处部位的开发度 —— 每一处「条」与「那一处的状态句」分开摆：
              条给数，状态句给话，两样不是一回事。 */}
          <div className={css.dialogSection}>
            <h4>{LEWD_META.label}</h4>
            {/* 第五根条也挂 data-intimate-slot —— 读数条一共五根，DOM 自己把它说全，
                外部的量尺（冒烟）才不必靠猜哪一根是它 */}
            <div className={css.intimLewd} data-intimate-slot="lewd" data-intimate-lewd={prof.lewd}>
              <div className="meter meter--thick">
                <div
                  className="meter__fill"
                  style={{ width: `${prof.lewd}%`, background: 'linear-gradient(90deg, var(--red-deep), var(--red))' }}
                />
              </div>
              <b className="num">{prof.lewd}</b>
              <i className={css.intimStage}>{devStage(prof.lewd)}</i>
            </div>
          </div>

          <div className={css.dialogSection}>
            <h4>开发度（四处）</h4>
            <div className={css.intimBars}>
              {INTIMATE_SLOTS.map((slot) => {
                const meta = SLOT_META[slot]
                const part = prof.parts[slot]
                return bar(slot, meta.label, meta.hint, part.dev, hue, part.state)
              })}
            </div>
          </div>

          {/* 最近一回与看法：都不挂部位，说的是一件事此刻的样子 */}
          <div className={css.dialogSection}>
            <h4>最近的性行为</h4>
            <p className={css.intimAct} data-intimate-lastact>{prof.lastAct}</p>
          </div>

          <div className={css.dialogSection}>
            <h4>对这种事情的看法</h4>
            <p className={css.intimAct} data-intimate-view>{prof.view}</p>
          </div>

          <div className={css.dialogSection}>
            <h4>破处</h4>
            <div className={css.intimFoot}>
              <div className={css.intimFootCell} data-intimate-virgin={prof.virgin ? '1' : '0'}>
                <small>处女</small>
                <b>{prof.virgin ? '是' : '否'}</b>
              </div>
              <div className={css.intimFootCell} data-intimate-first>
                <small>破处对象</small>
                <b>{prof.virgin ? VIRGIN : firstByName(prof.firstBy, opName)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 战斗数值：档案里也能看见他/她下场的面板 ---------------- */
/**
 * 档案卷宗上只有「评定」（五轴常态与极限），没有「下场时究竟是什么数」。
 * 这一段把 derive 真正喂给引擎的那份面板照抄一份出来：
 * 生命 / 体力 / 出手速度 / 战斗五轴 / 技能表 / 被动 / 自带装具，
 * 与作战里点开同一个人看到的是同一组数字。
 * 唯一不还原的是你在作战中临时装配的装具 —— 那件按当前编成读进来。
 */
function CombatPanel({ id, progress, gearId }: { id: string; progress: number; gearId?: string }) {
  const c = combatantOf(id, progress, 0, gearId)
  return (
    <div className={css.combat} data-archive-combat={id}>
      <div className={css.combatNums}>
        <div className={css.combatNum}><small>生命</small><b className="mono">{c.hpMax}</b></div>
        <div className={css.combatNum}><small>体力</small><b className="mono">{c.spMax}</b></div>
        <div className={css.combatNum}><small>出手速度</small><b className="mono">{Math.round(c.spd)}</b></div>
        <div className={css.combatNum}><small>定位</small><b>{c.cls}</b></div>
      </div>

      <div className={css.combatAxes}>
        {AXIS_KEYS.map((k) => (
          <div key={k} className={css.combatAxis}>
            <small>{k}</small>
            <b className="mono">{c.axes[k]}</b>
          </div>
        ))}
      </div>

      {c.passive ? (
        <div className={css.combatPassive}>
          <b>被动 · {c.passive.name}</b>
          <span>{c.passive.desc}</span>
          {/* 只写说明不写数，等于没写 —— 这里逐条把它的读数念出来 */}
          <span className={css.combatNums2}>
            {passiveText(c.passive).map((t) => <i key={t}>{t}</i>)}
          </span>
        </div>
      ) : null}

      {c.gear ? (
        <div className={css.combatGear}>
          <b>自带装具 · {GEAR_OF[c.gear]?.name ?? c.gear}</b>
          <span>{GEAR_OF[c.gear]?.desc}</span>
        </div>
      ) : null}

      <div className={css.combatSkills}>
        {c.skills.map((k) => (
          <div key={k.id} className={css.combatSkill} data-kind={k.kind}>
            <div className={css.combatSkillTop}>
              <b>{k.name}</b>
              <span className={css.combatKind}>{k.kind === '到达点' ? 'End' : k.kind}</span>
              {/* 这一手按框架里的哪一类打的：同类的两个人可以对着看 */}
              {k.arch ? <span className={css.combatArch}>{archNameOf(k.arch) ?? k.arch}</span> : null}
              <span className="mono tiny">
                {mulTextOf(k) ?? '不造成伤害'}
                {k.cost ? ` · 耗 ${k.cost}` : ''}
                {k.cd ? ` · 冷却 ${k.cd}` : ''}
              </span>
            </div>
            <p>{k.desc}</p>
            {/* 效果逐条写出来 —— 面板读的就是引擎算的数（skilltext 一份口径） */}
            <p className={css.combatEffect} data-skill-effect>
              {effectTextsOf(k).length ? effectTextsOf(k).join(' · ') : '本手无附带效果'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 装具改了哪几个数（直接读 GearDef.mods，不另写一份口径） */
function gearModText(g: GearDef): string {
  const out: string[] = []
  const axisMods = g.mods as Record<string, number | undefined>
  for (const k of AXIS_ORDER) {
    const v = axisMods[k]
    if (typeof v === 'number' && v) out.push(`${k} ${v > 0 ? '+' : ''}${v}`)
  }
  if (g.mods.atk) out.push(`攻击 ${pct(g.mods.atk)}`)
  if (g.mods.basicMul) out.push(`普攻倍率 ${pct(g.mods.basicMul)}`)
  if (g.mods.spd) out.push(`充能 ${pct(g.mods.spd)}`)
  if (g.mods.evade) out.push(`闪避 ${pct(g.mods.evade)}`)
  if (g.mods.shield) out.push(`减伤 ${pct(g.mods.shield)}`)
  if (g.skill) out.push(`附带一手「${g.skill.name}」`)
  return out.join(' · ') || '无修正'
}
const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`

/**
 * 在档案里换反现实辅助装备。
 * 与作战中点开的「更换装备」是同一份编成（同一把 key），
 * 所以在这里换完直接出击就是这套 —— 换装备本身不消耗任何东西。
 */
function GearSwap({ id, gearId, owned, onPick }: {
  id: string
  gearId?: string
  owned: Record<string, number>
  onPick: (g: string | null) => void
}) {
  const pool = GEARS.filter((g) => (owned[g.id] ?? 0) > 0)
  const cur = gearId ? GEAR_OF[gearId] : undefined
  return (
    <div className={css.gearSwap} data-gear-swap={id}>
      <div className={css.gearSwapHead}>
        <small className="tiny muted">
          每人至多一件 · 换装备不消耗回合
          {cur ? ` · 当前：${cur.name}` : ' · 当前：不装配'}
        </small>
      </div>
      {pool.length ? (
        <div className={css.gearList}>
          <button
            type="button"
            data-gear="__none"
            className={`${css.gearRow} ${!gearId ? css.gearOn : ''}`}
            onClick={() => onPick(null)}
          >
            <span className={css.gearName}>不装配</span>
            <span className={css.gearNote}>空着也是空着，但空着不挨罚。</span>
          </button>
          {pool.map((g) => {
            const ok = canEquip(id, g.id)
            const on = gearId === g.id
            const who = g.onlyFor?.map((x) => personOf(x)?.name ?? x).join('、')
            return (
              <button
                key={g.id}
                type="button"
                data-gear={g.id}
                data-gear-only-for={ok ? undefined : g.onlyFor?.join(',')}
                disabled={!ok}
                className={`${css.gearRow} ${on ? css.gearOn : ''}`}
                title={ok ? g.desc : `${g.name} 只认 ${who} —— 别人拿在手里也只是一件普通的东西。`}
                onClick={() => ok && onPick(on ? null : g.id)}
              >
                <span className={css.gearName}>
                  {g.name}
                  <i className={css.gearSub}>{g.sub}</i>
                </span>
                <span className={css.gearMod}>{ok ? gearModText(g) : `认人 · 仅限 ${who}`}</span>
                <span className={css.gearNote}>{g.desc}</span>
                {on ? <span className={css.gearOn2}>装配中</span> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="tiny muted">军需处还没换到能装的东西 —— 拿贡献点去兑，或者从打过的敌人身上搜。</div>
      )}
    </div>
  )
}

/** 翻面那两拍的时长（与 Archive.module.css 的 cardTurn* 对齐：每拍各一半） */
const FLIP_MS = 240

export function Archive() {
  const {
    operatorName, epDone, cur, bondNow, push, profileRequest, clearProfileRequest, isMet,
    intimOf,
  } = useTerminal()
  const [openId, setOpenId] = useState<string | null>(null)
  const [openRect, setOpenRect] = useState<DOMRect | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  /**
   * 档案卡的正反两面。'front' = 平常那份档案，'back' = 私密档案。
   * `turn` 是翻面动画的两拍：'out' 把当前这面转出去，'in' 把另一面转回来 ——
   * 中间那一拍（两张都立着、卡片正侧着身）才是换内容的时候，所以只看得到「翻过去」，
   * 看不到「跳一下」。两拍各占 FLIP_MS 的一半。
   */
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [turn, setTurn] = useState<'' | 'out' | 'in'>('')
  const turnTimers = useRef<number[]>([])
  /** 翻面这道闸门（翻的过程中不接第二下）。用 ref：同一拍里连点两下时 state 还没落地 */
  const turning = useRef(false)
  /* 立绘全图查看器：看的那个人（档案里点开的那位，或操作员自己）。
     从前是个 bool —— 只有档案弹窗会用到；主角专档也要看全图之后，
     得记下「看的是谁的」，否则关弹窗那一刻图就没了。 */
  const [viewer, setViewer] = useState<ViewTarget | null>(null)
  const dlgRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(buildRows, [])
  const focus = rows.find((r) => r.id === openId) ?? null
  /**
   * 这一张卡翻不翻得过去：只要**有底档**（女角色）就翻得开 —— 私密档案不封存。
   * 门槛在翻之前就判 —— 翻到一半被人拦下会剩一张空白的背面。
   */
  const backOk = side === 'back' && !!focus && intimOf(focus.id) !== null
  const name = operatorName.trim() ? operatorName : '言万心叶'
  const sit = opSituation(epDone)
  /** 主角档案：随已收束的事件换页（原文里他每一段时期都不同） */
  const opArc = opPeriodAt(epDone)
  /** 他身上自带的那件东西（露娜的丝线 —— 第一卷走完才系上手腕） */
  const opBuiltin = opBuiltinAt(opArc, epDone)
  /* 操作员自己的素材（public/charimg/operator.*）。
     两档分开探：'face' 是方框（横幅的胸像），'full' 是竖框（专档左栏的整身）。
     缺图时对应的版位各自退回原样 —— 横幅回到字块、专档不摆左栏，不留空洞。 */
  const opFace = useCharImg('operator', 'face')
  const opArt = useCharImg('operator', 'full')
  /** 全图查看器要看的那个人（没有 Row 可借，就地拼一个） */
  const opTarget: ViewTarget = { id: 'operator', name, hue: '#ff2e43', sigil: '心' }
  const [opOpen, setOpOpen] = useState(false)
  /** 作战中装的装具：档案里的面板要把当前编成一并算上 */
  const [equip, setEquip] = useState<Record<string, string>>({})
  /** 库存：能换的只有手上真有的那几件 */
  const [owned, setOwned] = useState<Record<string, number>>({})
  useEffect(() => {
    void readEquip().then(setEquip)
    void readGearBag().then(setOwned)
  }, [])
  /* 在档案里换装具：与作战中「更换装备」写的是同一份编成，不消耗任何东西 */
  const setGear = useCallback((charId: string, gearId: string | null) => {
    setEquip((prev) => {
      const next = { ...prev }
      if (gearId) next[charId] = gearId
      else delete next[charId]
      void writeEquip(next)
      return next
    })
  }, [])
  const progress = useMemo(() => periodProgress(epDone), [epDone])

  /* 把翻面收回原位 —— 换一个人看、关掉弹窗都得走这里：
     翻面是某一张卡上的动作，不是模块级的开关，上一张停在哪一面都不该跟着走。
     排出去的两拍也要一并撤掉，否则那一拍会落到新点开的这张卡上。 */
  const resetFlip = useCallback(() => {
    for (const t of turnTimers.current) window.clearTimeout(t)
    turnTimers.current = []
    turning.current = false
    setSide('front')
    setTurn('')
  }, [])
  /* 展开某档案（卡片就近） */
  const openFromId = useCallback((id: string) => {
    const el = rootRef.current?.querySelector(`[data-archive-card="${id}"]`) as HTMLElement | null
    setOpenRect(el ? el.getBoundingClientRect() : null)
    setPos(null)
    resetFlip()
    setOpenId(id)
  }, [resetFlip])
  const onCardOpen = useCallback((id: string, e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement
    setOpenRect(el.getBoundingClientRect())
    setPos(null)
    setViewer(null)
    resetFlip()
    setOpenId(id)
  }, [resetFlip])
  const close = useCallback(() => {
    setOpenId(null); setViewer(null); setOpenRect(null); setPos(null)
    resetFlip()
  }, [resetFlip])
  useEffect(() => resetFlip, [resetFlip])

  /**
   * 翻面。两拍各 FLIP_MS/2：先转出去，中间那一拍换内容，再转回来。
   * 动画进行中不接第二次点击（转到一半再翻会从正侧面弹回去，很难看）。
   *
   * 两拍**各自排定**，第二拍不嵌在第一拍的回调里 —— 嵌在里头的话，中间那点杂事
   * （换页、滚动）出一丁点岔子，`turn` 就永远停在 'in'：动画看着是翻完了，
   * 可这道闸门就此卡死，卡只出得去、回不来。排成两条平铺的定时器，归位那一拍
   * 无论如何都会到。（闸门用 ref 不用 state：同一拍里连点两下时，state 还没落地。）
   */
  const flipTo = useCallback((to: 'front' | 'back') => {
    if (turning.current) return
    turning.current = true
    setTurn('out')
    const t1 = window.setTimeout(() => {
      setSide(to)
      setTurn('in')
      dlgRef.current?.scrollTo({ top: 0 })
    }, FLIP_MS / 2)
    const t2 = window.setTimeout(() => {
      turning.current = false
      setTurn('')
    }, FLIP_MS)
    turnTimers.current.push(t1, t2)
  }, [])

  /* 打开后测量真实尺寸再就近落位。
     尺寸**要跟着长**：落位那一刻量到的高度未必是最终高度（立绘解码、装具区与作战面板随后撑开），
     照旧尺寸算出来的位置会让弹窗挂出视口下沿。故挂一个 ResizeObserver，内容每长一次就按新尺寸重算。

     还有两道保险 —— 未定位的弹窗会停在文档流末尾，整个掉出视口（这一步的浏览器复核真跑出来过）：
       · 没有锚点（openRect 缺失）时按视口中央落位，而不是「没有锚点就不落位」；
       · 只要还没落位，每次渲染后再试一次 —— 该跑而没跑成的那一次（量到 0 高、锚点晚到）
         不会就此定格，弹窗自己接着找机会落位。 */
  const anchor = openRect ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0)
  const placeNow = () => {
    const el = dlgRef.current
    if (el) setPos(placeDialog(el.offsetWidth, el.offsetHeight, anchor))
  }
  useLayoutEffect(() => {
    if (!openId || !dlgRef.current) return
    const el = dlgRef.current
    const t = window.setTimeout(placeNow, 0)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(placeNow)
      ro.observe(el)
    }
    return () => { window.clearTimeout(t); ro?.disconnect() }
  }, [openId, openRect]) // eslint-disable-line react-hooks/exhaustive-deps -- placeNow 每次渲染都是新的，进依赖会自激
  /* 没落位就继续试（防御式收口，正常情况下上面那一次就够了） */
  useEffect(() => {
    if (!openId || pos || !dlgRef.current) return
    const t = window.setTimeout(placeNow, 0)
    return () => window.clearTimeout(t)
  })

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
              量表读数到 200 为止（那是档案给的格子，不是能力的天花板——战斗数值不封顶，超出量表的另标「超限」），『∞』为无法测量；凡观测记录载明委员会排行者，已在其档案标示 RANK。羁绊起步皆为「初见」
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
          五轴标尺：10 ≈ 普通成年人的该轴水准；精锐约 45–80；超规格约 110–130；量表读数到 200 为止（那是档案给的格子，不是能力的天花板——越过基准的另标「超限」）；『∞』表示该轴已超出委员会可评定范围（无法测量），读数以满格示出。
          <br />
          每轴并记两值：<b style={{ color: 'var(--ink-dim)' }}>常态</b>（紫条 · 平常态可测体评）与
          <b style={{ color: 'var(--red)' }}>极限</b>（红条 · 机制全开／变身／限时爆发下的最强表现），读数为「常态/极限」。
          红条只在极限确实高于常态时露出——重合处仍读常态；两值皆不可测者记『∞/∞』。未登记极限的轴退回单值。
        </div>

        {/* 操作员横幅。左侧那一格：有图就摆他的头像（operator-face 方图；缺了退回整身稿，
            见 charimg 的取图顺延），没有才回到「姓」的字块 —— 字块是缺图时的占位，不是常态。 */}
        <div className={css.opBanner}>
          {opFace ? (
            <Portrait
              avatarId="operator"
              name={name}
              fit="cover"
              width={84}
              height={84}
              eager
              className={css.opFace}
              style={{ borderRadius: 0 }}
            />
          ) : (
            <div className={css.opGlyph}>{name.slice(0, 1).toUpperCase()}</div>
          )}
          <div className={css.opBannerMain}>
            <h2>言万心叶 <em>（你 · 操作员本人）</em></h2>
            <div className={css.opArcLine} data-op-arc={opArc.at}>
              <span className={css.opArcVol}>{opArc.vol}</span>
              <b>{opArc.title}</b>
            </div>
            <p>{opArc.note}</p>
            <div className={css.opChips}>
              <span className="chip chip--on">{sit.standing}</span>
              <span className="chip">战斗定位 · {opArc.cls}</span>
              <span className="chip">武装 · {opArc.arm}</span>
              {sit.nature ? <span className="chip">{sit.nature}</span> : null}
              <span className="chip">担保人 · 学生会长 艾莉芙・安纳托利亚</span>
            </div>
          </div>
          <div className={css.opAction}>
            <button
              className="btn btn--ghost"
              style={{ fontSize: 12 }}
              data-op-arc-toggle
              onClick={() => setOpOpen((v) => !v)}
            >
              {opOpen ? '收起档案' : '我是谁？'}
            </button>
          </div>
        </div>

        {/* 主角档案：五轴 · 武装 · 所能做的事 · 已经历的时期。
            有立绘时左边多一栏整身（其余角色档案的左三分之一也是这个）；没立绘就整页一列。 */}
        {opOpen ? (
          <section className={css.opArc} data-op-arc-panel data-op-card={opArc.at} data-op-art={opArt ? 'img' : 'none'}>
            {opArt ? (
              <div className={css.opArt} data-op-portrait>
                <Portrait
                  avatarId="operator"
                  name={name}
                  fit="contain"
                  variant="full"
                  width={200}
                  height={280}
                  eager
                  /* 尺寸交回 CSS：铺满栏宽、高度随图（见 .opArtImg），不钉像素 */
                  style={{ width: '100%', height: 'auto' }}
                  className={css.opArtImg}
                />
                <span className={css.opArtFade} aria-hidden />
                <div className={css.opArtCap}>
                  <span className="vhead__kicker" style={{ fontSize: 9 }}>PORTRAIT / 全身</span>
                  <button className="btn btn--ghost" style={{ fontSize: 12 }} data-op-portrait-view onClick={() => setViewer(opTarget)}>
                    查看全图
                  </button>
                </div>
              </div>
            ) : null}
            <div className={css.opArcBody}>
            <div className={css.opCardHead}>
              <div className={css.opCardGlyph}>心</div>
              <div className={css.opCardTitle}>
                <h3>{name.trim() || '言万心叶'}</h3>
                <span className="tiny muted">OP-000 · 委员会观测科 · 本终端操作员</span>
              </div>
              <span className="chip chip--on">{opArc.cls}</span>
            </div>
            <div className={css.kvBlock} data-op-kv>
              <div className={css.kvCell}><small>所属</small><b>{sit.standing}</b></div>
              <div className={css.kvCell}><small>定位 / 呼号</small><b>{opArc.cls}{sit.alias ? ` / ${sit.alias}` : ''}</b></div>
              <div className={css.kvCell}><small>武装 / 终末</small><b>{opArc.arm}{opArc.armSub && opArc.armSub !== '—' ? `（${opArc.armSub}）` : ''}</b></div>
              <div className={css.kvCell}><small>终末潜力</small><b>{sit.nature ?? '未测定'}</b></div>
              <div className={css.kvCell}><small>担保人</small><b>学生会长 艾莉芙・安纳托利亚</b></div>
              <div className={css.kvCell}><small>时期</small><b>{opArc.vol}</b></div>
            </div>
            <div className={css.opArcAxes}>
              {AXIS_KEYS.map((k) => (
                <div key={k} className={css.opAxis}>
                  <span className="tiny muted">{k}</span>
                  <div className={css.opAxisBar}>
                    <i style={{ width: `${Math.min(100, (opArc.axes[k] / 200) * 100)}%` }} />
                  </div>
                  <b className="mono">{opArc.axes[k]}</b>
                </div>
              ))}
            </div>
            {opBuiltin ? (
              <div className={css.opPas} data-op-builtin={GEAR_OF[opBuiltin]?.name ?? opBuiltin}>
                <span className={css.opAbilKind} data-kind="装备">装备</span>
                <b>{GEAR_OF[opBuiltin]?.name ?? opBuiltin}</b>
                <span className="tiny muted">
                  {(GEAR_OF[opBuiltin]?.desc ?? '') + '（自带 · 不占装配位）'}
                </span>
              </div>
            ) : null}
            <div className={css.opArm}>
              <b>{opArc.arm}</b>
              <i className="mono">{opArc.armSub}</i>
              <p>{opArc.armNote}</p>
            </div>
            {/* 被动：不是「一手」，是这一段时期里他一直带着的东西 */}
            {opArc.passive ? (
              <div className={css.opPas} data-op-passive={opArc.passive.name}>
                <span className={css.opAbilKind} data-kind="被动">被动</span>
                <b>{opArc.passive.name}</b>
                <span className="tiny muted">{opArc.passive.desc}</span>
              </div>
            ) : null}
            <div className={css.opAbil}>
              {opArc.abilities.map((a, i) => (
                <div key={a.name} className={css.opAbilRow} data-op-abil={a.name}>
                  <SkillIcon id={`op-${opArc.at}-${i}`} />
                  <span className={css.opAbilKind} data-kind={a.kind}>{a.kind}</span>
                  <b>{a.name}</b>
                  <span className="tiny muted">{a.desc}</span>
                </div>
              ))}
            </div>
            <ol className={css.opLine} data-op-periods>
              {OP_PERIODS.map((p) => {
                const cur = p.at === opArc.at
                const idx = OP_PERIODS.indexOf(p)
                const nowIdx = OP_PERIODS.indexOf(opArc)
                const seen = idx <= nowIdx
                return (
                  <li key={p.at} className={cur ? css.opLineOn : ''} data-op-period={p.at} data-seen={seen ? '1' : undefined}>
                    <span className="mono tiny">{p.at}</span>
                    <b>{seen ? p.title : '？？？'}</b>
                    <span className="tiny muted">{seen ? p.vol : '尚未观测到的时期'}</span>
                  </li>
                )
              })}
            </ol>
            <div className="tiny muted" style={{ lineHeight: 1.7 }}>
              他也是战斗人员：上面的五轴、武装与技能就是他在该时期的面板，
              编队时可以直接把他放进小队（作战位置仍兼指挥与观测）。观测每推进一步，这一页就换一次。
            </div>
            </div>
          </section>
        ) : null}

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
                      <CardArt id={r.id} name={r.name} />

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
            data-side={side}
            data-turn={turn || undefined}
            className={`${css.dialog} ${pos ? css.open : ''}`}
            style={{ '--c': focus.hue, ...(pos ? { left: pos.left, top: pos.top } : {}) } as CSSProperties}
            role="dialog"
            aria-modal="true"
          >
            {backOk ? (
              <IntimateBack charId={focus.id} hue={focus.hue} name={focus.name} onBack={() => flipTo('front')} />
            ) : (
            <div className={css.dossier}>
              {/* 左三分之一：立绘整身。右缘渐隐进档案底色，两张纸拼成一张 */}
              <DossierArt focus={focus} onView={() => setViewer(focus)} />

              <div className={css.dossierText}>
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

            <div className={css.dialogBody}>
              <p className={css.dialogBio}>{focus.bio}</p>

              {/* 外形：人物卡「外貌」一节的逐字摘录 —— 左边看形，右边看字 */}
              {(() => {
                const look = appearanceOf(focus.id)
                return (
                  <div className={css.dialogSection} data-archive-look>
                    <h4>外形</h4>
                    {look.length ? (
                      <ul className={css.lookList}>
                        {look.map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                    ) : (
                      <div className="tiny muted">原书人物页未记其外貌，本终端不代为编造；立绘位所见的即全部。</div>
                    )}
                  </div>
                )
              })()}

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
                {/* 说明行跟着**画出来的条纹**走：常态判不可测（整条条纹）与极限判不可测
                    （极限那截红条纹）都会在图上有条纹，就得都解释。曾只认常态那一侧 ——
                    「常态顶格 200 / 极限 ∞」这类轴（恋兔光的破坏力、露娜的反现实亲和）
                    画着红条纹却没有任何说明。 */}
                {focus.axis.includes('∞') || focus.axisLimit.includes('∞') ? (
                  <div className="tiny muted" style={{ marginTop: 8 }}>带条纹的『∞』读数无法测量——已超出委员会可评定的量程。</div>
                ) : null}
              </div>

              <div className={css.dialogSection}>
                <h4>反现实辅助装备</h4>
                <GearSwap
                  id={focus.id}
                  gearId={equip[focus.id]}
                  owned={owned}
                  onPick={(g) => setGear(focus.id, g)}
                />
              </div>

              <div className={css.dialogSection}>
                <h4>战斗数值（下场时的那份面板）</h4>
                <CombatPanel id={focus.id} progress={progress} gearId={equip[focus.id]} />
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  与作战中点开同一人看到的是同一组数字；面板里的那件装具按上面这份编成计算 ——
                  在这里换完，出击时就是这套。
                </div>
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
                {/* 关系确认：到满值才现身的那一栏 —— 关系走到头了，档案里要留一句白纸黑字 */}
                {(() => {
                  const c = confirmOf(focus.id, cur)
                  if (!c || bondNow(focus.id) < 100) return null
                  return (
                    <div className={css.bondConfirm} data-bond-confirm={focus.id} style={{ borderColor: `${focus.hue}55` }}>
                      <b style={{ color: focus.hue }}>{c.title}</b>
                      <p>{c.body}</p>
                    </div>
                  )
                })()}
              </div>

              {/* 私密档案：只对女角色生效。解封之后这儿是翻到背面的门 */}
              <IntimateGate charId={focus.id} onFlip={() => flipTo('back')} />
            </div>
              </div>
            </div>
            )}
          </div>
        </>
      ) : null}

      {/* 立绘全图查看器（大尺寸、contain，关闭即还原）。
          看的是 viewer 记下的那位 —— 档案弹窗里的人，或主角专档里的操作员自己。 */}
      {viewer ? (
        <div className={css.lightbox} data-archive-lightbox onClick={() => setViewer(null)} role="dialog" aria-modal="true">
          <div className={css.lightboxStage} onClick={(e) => e.stopPropagation()}>
            <Portrait
              avatarId={viewer.id}
              name={viewer.name}
              hue={viewer.hue}
              sigil={viewer.sigil}
              fit="contain"
              width={Math.min(760, window.innerWidth - 48)}
              height={Math.min(720, window.innerHeight - 120)}
            />
            <div className={css.lightboxMeta}>
              <b>{viewer.name}</b>
              <span className="tiny muted">立绘全图 · 点按任意处合上</span>
              <button className={css.dialogClose} onClick={() => setViewer(null)} aria-label="关闭">
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
