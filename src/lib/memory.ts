/* ============================================================
   情景记忆库（lib/memory.ts）
   ------------------------------------------------------------
   七栏：人物关系 / 事迹 / 伏笔 / 见闻 / 心迹 / 技能 / 大事记。

   这一层**不自己记东西** —— 终端里早就有一摞各管一摊的账：
     world.offset / world.locked …… 关系此刻到了哪一步（只从行为里来）
     world.records ………………… 每一段收束时留下的经过（含分歧标记）
     world.ends + CODEX ………… 他见过、登记过的终末
     MINDS ………………………… 低语者读到的那些心声（逐字原文）
     opPeriodAt …………………… 此刻的他是谁（时期、武装、技能）
     TIMELINE + epDone ………… 走到哪一段了、还剩哪几段
     smstasks …………………… 短信里应下的托付
   记忆库只做一件事：**把这些账按「他此刻记得什么」重排一遍**，
   让人一眼看清这一路发生过什么、此刻身在何处、还欠着什么。

   所以这里全是纯函数：同一份世界状态排出来的一定是同一份记忆。
   没有第二份副本，也就没有「记忆跟事实对不上」这种坏法。

   两条硬规矩：
     · 不虚构 —— 每一行都能指回上面某一本账；账上没有的，这里一个字都不补。
     · 不剧透 —— 没走到的地方一律以「未观测」占位（心声尤其：整卷读完才回放）。
   ============================================================ */

import { addressOf } from '../data/address'
import { genderOf, personOf, PERSON_IDS } from '../data/castmeta'
import { charOf } from '../data/personas'
import { CODEX } from '../data/codex'
import { MINDS } from '../data/minds'
import { SCENES } from '../data/scenes'
import { TIMELINE } from '../data/timeline'
import { bondName } from './format'
import { furthestDone } from './operator'
import { opPeriodAt } from './operator-arc'
import type { MindVoice, WorldRecord, WorldState } from '../data/types'
import type { SmsTask } from './smstasks'

export const MEM_SECTIONS = ['人物关系', '事迹', '伏笔', '见闻', '心迹', '技能', '大事记'] as const
export type MemSection = (typeof MEM_SECTIONS)[number]

/** 七栏共用的输入：世界状态 + 归档记录 + 此刻的羁绊读数 + 未了结的托付 */
export interface MemInput {
  world: WorldState
  epDone: Record<string, true>
  records: WorldRecord[]
  /** 与终端同一处读数（`bondNow`）——记忆库不另算一份好感 */
  bondNow: (id: string) => number
  tasks?: SmsTask[]
}

const SEQ = new Map(TIMELINE.map((e, i) => [e.id, i + 1]))
const evOf = (id: string) => TIMELINE.find((e) => e.id === id)

/** 事件在阅读序里的序号（1-based；表外 id 记 0） */
export function seqOfStrict(id: string): number {
  return SEQ.get(id) ?? 0
}

/* ————————————————— 一、人物关系 ————————————————— */

export interface MemRelation {
  id: string
  name: string
  role: string
  /** 此刻的羁绊读数（含阶段封顶，与档案页同一处） */
  bond: number
  /** 关系阶段名（按对方性别取称谓，见 format.bondName） */
  stage: string
  /** 此刻他该怎么称呼对方（address.ts；没有规则则为 null） */
  call: string | null
  /** 行为偏移：这一段关系比初见高/低了多少（0 = 一路没做过什么） */
  drift: number
  /** 被事件锁定的值（锁定之后不再按行为增减）；未锁定为 null */
  locked: number | null
}

/** 已遇见的角色，按羁绊从高到低排 —— 谁在他心里占的分量重，谁就在前面 */
export function relationsOf(inp: MemInput): MemRelation[] {
  const done = furthestDone(inp.epDone)
  const out: MemRelation[] = []
  for (const id of PERSON_IDS) {
    if (!inp.world.met[id]) continue
    const p = personOf(id)
    if (!p || p.kind === 'operator') continue
    const bond = Math.round(inp.bondNow(id))
    const lockedRaw = inp.world.locked?.[id]
    out.push({
      id,
      name: p.name,
      role: charOf(id)?.role ?? '',
      bond,
      stage: bondName(bond, { gender: genderOf(id) }),
      call: addressOf(id, bond, done),
      drift: Math.round(inp.world.offset[id] ?? 0),
      locked: typeof lockedRaw === 'number' ? Math.round(lockedRaw) : null,
    })
  }
  return out.sort((a, b) => b.bond - a.bond || a.name.localeCompare(b.name, 'zh-Hans'))
}

/* ————————————————— 二、事迹 ————————————————— */

export interface MemDeed {
  eventId: string
  seq: number
  group: string
  title: string
  place: string
  /** 收束时写下的经过（导演结语；旧档缺省时为空串，不拿原著摘要冒充） */
  digest: string
  /** 这一段的走向与原著不同 */
  diverged: boolean
  ts: number
}

/**
 * 他做下的事 = 已归档的每一段。
 * 倒序排（最近发生的在最上面）——「事迹」是用来看「我做过什么」的，
 * 编年那种读法交给第七栏的「大事记」。
 */
export function deedsOf(inp: MemInput): MemDeed[] {
  const out: MemDeed[] = []
  for (const r of inp.records) {
    const ev = evOf(r.eventId)
    if (!ev) continue
    out.push({
      eventId: r.eventId,
      seq: seqOfStrict(r.eventId),
      group: ev.group,
      title: ev.title,
      place: ev.place,
      digest: r.digest ?? '',
      diverged: r.diverged === true,
      ts: r.ts,
    })
  }
  return out.sort((a, b) => b.seq - a.seq)
}

/* ————————————————— 三、伏笔 ————————————————— */

export interface MemThread {
  kind: '进行中' | '分歧' | '托付'
  title: string
  detail: string
}

/**
 * 还悬着的东西。三种，各有各的出处，一个都不是猜的：
 *   进行中 —— 时间线上第一段还没归档的（正卡在这一节里）
 *   分歧   —— 已经选了非原著路线、却还没走到落点的那些（走了另一条路，账还没结）
 *   托付   —— 短信里应下、还没了结的事（smstasks）
 * 已经了结的不在这里出现 —— 那属于「事迹」。
 */
export function threadsOf(inp: MemInput): MemThread[] {
  const out: MemThread[] = []

  const focus = TIMELINE.find((e) => !inp.epDone[e.id])
  if (focus) {
    out.push({ kind: '进行中', title: focus.title, detail: `${focus.group} · ${focus.place}` })
  }

  for (const [id, key] of Object.entries(inp.world.pick)) {
    if (inp.epDone[id]) continue
    const ev = evOf(id)
    const opt = SCENES[id]?.choices?.find((o) => o.key === key)
    if (!ev || !opt || opt.canon === true) continue
    out.push({ kind: '分歧', title: ev.title, detail: `选择了「${opt.label}」—— 原著里不是这一条。` })
  }

  for (const t of inp.tasks ?? []) {
    if (t.done) continue
    out.push({ kind: '托付', title: t.title, detail: t.detail ?? '' })
  }

  return out
}

/* ————————————————— 四、见闻 ————————————————— */

export interface MemSight {
  id: string
  name: string
  alias: string
  no: string
  stage: number
  stageKw: string
  state: string
  /** 出处 / 来历（原文字段，不加工） */
  origin: string
}

/** 见过的终末 = 已登记进图鉴的那些条目（剧情推进自动登记 + 操作员自记） */
export function sightsOf(inp: MemInput): MemSight[] {
  const own = new Map(inp.world.own.map((o) => [o.id, o]))
  const out: MemSight[] = []
  for (const id of Object.keys(inp.world.ends)) {
    const c = CODEX.find((x) => x.id === id)
    if (c) {
      out.push({
        id, name: c.name, alias: c.alias, no: c.no, stage: c.stage,
        stageKw: c.stageKw, state: c.state, origin: c.origin,
      })
      continue
    }
    const o = own.get(id)
    if (o) {
      out.push({
        id, name: o.name, alias: o.alias, no: o.no, stage: o.stage,
        stageKw: o.stageKw, state: o.state, origin: o.origin,
      })
    }
  }
  // 重的排在前面（Stage 高 = 越接近终焉），同级按编号
  return out.sort((a, b) => b.stage - a.stage || a.no.localeCompare(b.no))
}

/* ————————————————— 五、心迹 ————————————————— */

export interface MemMind {
  group: string
  vol: number
  speaker: string
  scene: string
  /** 读到的原文（逐字，不含『』） */
  text: string
}

export interface MemMindGroup {
  group: string
  /** 这一卷读完了没有 —— 没读完，本卷的心声一条都不回放（回放等于剧透） */
  done: boolean
  /** 本卷读到过几条（没读完时只报这个数，正文一字不给） */
  total: number
  rows: MemMind[]
}

/**
 * 低语者读到的心声。
 *
 * **整卷读完才回放这一卷的** —— 心声在原文里散落在各话之中，按「读到第一话
 * 就把全卷心声摆出来」的算法，等于提前把这一卷后面谁在想什么全交代了。
 * 所以闸门开在卷上：本卷每一段都归档了，这一卷的心声才现形；否则只报条数。
 */
export function mindsOf(inp: MemInput): MemMindGroup[] {
  const groups: MemMindGroup[] = []
  const byGroup = new Map<string, MindVoice[]>()
  for (const m of MINDS) {
    const arr = byGroup.get(m.group)
    if (arr) arr.push(m)
    else byGroup.set(m.group, [m])
  }
  for (const [group, list] of byGroup) {
    const evs = TIMELINE.filter((e) => e.group === group)
    const done = evs.length > 0 && evs.every((e) => inp.epDone[e.id])
    groups.push({
      group,
      done,
      total: list.length,
      rows: done
        ? list.map((m) => ({ group: m.group, vol: m.vol, speaker: m.speaker, scene: m.scene, text: m.text }))
        : [],
    })
  }
  // 按时间线的卷序排（外传排在最前，与时间线一致）
  const order = new Map(TIMELINE.map((e, i) => [e.group, i]))
  return groups.sort((a, b) => (order.get(a.group) ?? 1e9) - (order.get(b.group) ?? 1e9))
}

/* ————————————————— 六、技能 ————————————————— */

export interface MemSkill {
  name: string
  kind: string
  desc: string
  /** 解锁点还没到（读到那一段之后才列得出来） */
  locked: boolean
}

export interface MemSkills {
  vol: string
  title: string
  cls: string
  note: string
  arm: string
  armSub: string
  armNote: string
  passive: string | null
  skills: MemSkill[]
}

/** 此刻的他：时期、手里的武装、会使的那几手（含还没解锁的，标出来） */
export function skillsOf(inp: MemInput): MemSkills {
  const done = furthestDone(inp.epDone)
  const per = opPeriodAt(inp.epDone)
  // 解锁点先落在时间线上再比下标 —— 口径与 derive.opSkillsOf 一致，不另立一套
  const open = (at?: string): boolean => {
    if (!at) return true
    const i = TIMELINE.findIndex((e) => e.id === at)
    return i < 0 || done >= i
  }
  return {
    vol: per.vol,
    title: per.title,
    cls: per.cls,
    note: per.note,
    arm: per.arm,
    armSub: per.armSub,
    armNote: per.armNote,
    passive: per.passive ? `${per.passive.name} —— ${per.passive.desc}` : null,
    skills: per.abilities.map((a) => ({
      name: a.name,
      kind: a.kind,
      desc: a.desc,
      locked: !open(a.unlockAt),
    })),
  }
}

/* ————————————————— 七、大事记 ————————————————— */

export interface MemChronRow {
  id: string
  seq: number
  title: string
  place: string
  day: string
  done: boolean
  diverged: boolean
  /**
   * 还没观测到（未归档、也不是正卡着的那一段）—— 这一行的内容以「未观测」占位。
   * 行本身照列（编年不瞒着「还有多少段」），只是名字与地点一个字都不给。
   */
  unseen: boolean
  /** 归档时间（0 = 旧档回填，没有确切时刻） */
  ts: number
}

export interface MemChron {
  group: string
  rows: MemChronRow[]
  doneCount: number
}

/**
 * 编年：按卷列出全部段落 —— 行一条不少（「还剩多少段」不是秘密），
 * 但**没观测到的那几行不给内容**：已归档的照实写，正卡着的那一段照实写
 * （它与「当前事件」是同一处读数），再往后的以「未观测」占位。
 * 这与终端其它地方一个口径：没遇见的人写「？？？」，没登记的条目翻不开。
 */
export function chronicleOf(inp: MemInput): MemChron[] {
  const recOf = new Map(inp.records.map((r) => [r.eventId, r]))
  const focusId = TIMELINE.find((e) => !inp.epDone[e.id])?.id ?? null
  const out: MemChron[] = []
  for (const ev of TIMELINE) {
    const rec = recOf.get(ev.id)
    const done = inp.epDone[ev.id] === true
    const seen = done || ev.id === focusId
    const row: MemChronRow = {
      id: ev.id,
      seq: seqOfStrict(ev.id),
      title: seen ? ev.title : '未观测',
      place: seen ? ev.place : '——',
      day: seen ? ev.day ?? '' : '',
      done,
      diverged: rec?.diverged === true,
      unseen: !seen,
      ts: rec?.ts ?? 0,
    }
    const g = out.find((x) => x.group === ev.group)
    if (g) {
      g.rows.push(row)
      if (row.done) g.doneCount += 1
    } else {
      out.push({ group: ev.group, rows: [row], doneCount: row.done ? 1 : 0 })
    }
  }
  return out
}

/** 七栏的计数（导航与摘要行用）：空栏不必点进去 */
export function memCounts(inp: MemInput): Record<MemSection, number> {
  return {
    人物关系: relationsOf(inp).length,
    事迹: deedsOf(inp).length,
    伏笔: threadsOf(inp).length,
    见闻: sightsOf(inp).length,
    心迹: mindsOf(inp).reduce((n, g) => n + g.rows.length, 0),
    技能: skillsOf(inp).skills.length,
    大事记: chronicleOf(inp).reduce((n, g) => n + g.doneCount, 0),
  }
}
