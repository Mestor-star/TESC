/* ============================================================
   羁绊 · 队伍协同与连携技
   ------------------------------------------------------------
   两套东西，走的是同一条口子：
     · 羁绊（队伍层）：按「同一出身的人在这支队伍里凑了几个」给档位加成 ——
       凑够 2 人一档、再凑够一档再上一阶，人越齐越强（同金铲铲的羁绊计数）。
       档位取「已达成的最高一档」，不叠加。
     · 连携技（人层）：双人（心叶 × 露娜／会长／黑之魔王）与整队（恋兔队全员）
       各有一记合击。它**不由玩家主动点**：羁绊里每人各出一手，共鸣槽就会满 ——
       满了自己就接上（见 BONDS 与 engine 的 chargeLinks / fireLinks）。
       所以「恋兔队全员才触发」不是一句 UI 提示，而是槽要四个人一人添一笔才满。
   加成只落在既有的常驻字段上（gearAtk / gearSpd / axes / evade），
   不改引擎口径：羁绊只是「这几个人站在一起时，本来就该更强」。
   数值与组合名一律取原文关系（弹痕、契约、婚约、队伍编制），不另立设定。
   ============================================================ */

import { OPERATOR_ID } from '../../data/castmeta'
import { ROSTER_GROUPS } from '../../data/roster'
import type { AxisKey, AxisSheet, Combatant, FxKind } from './types'

/** 一档羁绊给出的东西（人没凑够就不给） */
interface TraitTier {
  /** 需要几人 */
  need: number
  atk?: number
  spd?: number
  evade?: number
  axes?: Partial<AxisSheet>
}

export interface Trait {
  id: string
  name: string
  /** 这份加成的原文依据（一句话） */
  desc: string
  /** 算作「同一出身」的人 */
  ids: string[]
  /** 由低到高，取已达成的最高一档 */
  tiers: TraitTier[]
  /** 全员到齐才开的多人连携技（缺人就没有） */
  squadLink?: {
    name: string
    desc: string
    line: string
    power: number
    /** 每个参加者按同一轴再补几成 */
    linkPow: number
    axis: AxisKey
    fx: FxKind
    cost: number
    cd: number
  }
}

const group = (key: string): string[] => ROSTER_GROUPS.find((g) => g.key === key)?.ids ?? []

export const TRAITS: Trait[] = [
  {
    id: 'rabbit',
    name: '恋兔队',
    desc: '委员会排行榜多年的榜首所率的实战部队：队长恋兔光、副官梅芙莉莎、护卫小柴喵呜，'
      + '加上从商会转来的小柴琳 —— 名单上就这四个人。',
    ids: ['hikari', 'mefisa', 'nyau', 'xiaochai-lin'],
    tiers: [
      { need: 2, atk: 0.06, spd: 0.04 },
      { need: 3, atk: 0.11, spd: 0.08 },
      { need: 4, atk: 0.18, spd: 0.14, axes: { 意志力: 10 } },
    ],
    squadLink: {
      name: '恋兔队 · 全面出动',
      desc: '四个人一起上——恋兔开路、梅芙收口、喵呜钻缝、小琳把退路拆掉。'
        + '参加者各自按同一轴出力，合击为一手。（必须四名恋兔队成员全部在场）',
      line: '「恋兔队——出动！」「收到。」「小柴也上！」「……墙拆了哦。」',
      power: 1.6, linkPow: 1.5, axis: '破坏力', fx: 'slash', cost: 12, cd: 5,
    },
  },
  {
    id: 'ao',
    name: '苍之学园',
    desc: '同一所学园里念书的人。担保人、警备、学生会、以及体验入学的操作员本人 —— '
      + '他们的意志是互相看着长起来的。',
    // 操作员本人在苍之学园体验入学（担保人一栏写着）
    ids: [...group('ao'), OPERATOR_ID],
    tiers: [
      { need: 3, axes: { 意志力: 8 }, evade: 0.05 },
      { need: 5, axes: { 意志力: 14 }, evade: 0.08, atk: 0.08 },
    ],
  },
  {
    id: 'kaus',
    name: '卡乌斯学院',
    desc: '被放逐部队与名门千金同出一门：达娜厄、奈奈、蕾雅姐妹与伊西斯。',
    ids: group('kaus'),
    tiers: [
      { need: 3, axes: { 破坏力: 8 }, atk: 0.1 },
      { need: 5, axes: { 破坏力: 14 }, atk: 0.16 },
    ],
  },
  {
    id: 'corp',
    name: 'Corporations',
    desc: '第 6 区的巨企一系：警备队长、片羽、代理会长、文学少女 —— 他们的手段是制度。',
    ids: group('corp'),
    tiers: [
      { need: 3, axes: { 反现实亲和: 8 }, spd: 0.08 },
      { need: 5, axes: { 反现实亲和: 14, 意志力: 8 }, spd: 0.14 },
    ],
  },
]

/** 双人羁绊：两个人各自都在场上才成立 */
interface PairBond {
  id: string
  /** 组合名（原文措辞） */
  name: string
  desc: string
  a: string
  b: string
  atk?: number
  spd?: number
  evade?: number
  axes?: Partial<AxisSheet>
  link: {
    name: string
    desc: string
    line: string
    power: number
    linkPow: number
    axis: AxisKey
    fx: FxKind
    cost: number
    cd: number
  }
}

export const PAIRS: PairBond[] = [
  {
    id: 'golden-rabbit',
    name: '黄金之兔',
    desc: '原文里，恋兔队正是以「黄金之兔」（心叶 × 露娜）自鲸额触到了那颗「心」。'
      + '丝线拉住他不让他沉下去，低语替他读出对方往哪躲。',
    a: OPERATOR_ID, b: 'luna',
    atk: 0.1, spd: 0.08,
    link: {
      name: '黄金之兔',
      desc: '两人同时出手：她把他甩出去，他在半空里听见对方心里喊的那一声。合击由两人的对应轴相加。',
      line: '「——抓稳了。」「嗯。」',
      power: 2.2, linkPow: 1.6, axis: '反现实亲和', fx: 'noise', cost: 6, cd: 4,
    },
  },
  {
    id: 'president-dog',
    name: '会长与她的狗',
    desc: '灵魂蓄积器差一点把他吞掉的那一瞬，是会长把他拎出来的 —— 顺手让他做了自己的「狗」。'
      + '此后这层关系一直挂着，谁也没解开。',
    a: OPERATOR_ID, b: 'alive-anatolia',
    atk: 0.06, axes: { 反现实亲和: 10 },
    link: {
      name: '如散文般 · 补笔',
      desc: '她的弹痕「如散文般」能向过去开枪：那些他没能赶上的瞬间，由她一页一页补回来。',
      line: '「——这一页，我替你写。」',
      power: 1.6, linkPow: 1.8, axis: '反现实亲和', fx: 'seal', cost: 5, cd: 4,
    },
  },
  {
    id: 'betrothed',
    name: '婚约者',
    desc: '「我们既是朋友，又是敌人，既是伙伴，也是彼此的婚约者。」—— 第 3 卷夜里立下的那个约定。',
    a: OPERATOR_ID, b: 'kuro-no-maou',
    axes: { 意志力: 10 }, spd: 0.06,
    link: {
      name: '终末之前的婚约',
      desc: '「要是你最终没能够停滞终末的话。在世界毁灭之前……我们结婚吧」—— 两人把这句话当筹码压上去。',
      line: '「说好了。在那之前，先谈一场正常的恋爱。」',
      power: 1.8, linkPow: 1.8, axis: '意志力', fx: 'noise', cost: 5, cd: 4,
    },
  },
]

/** 一条正在生效的羁绊（界面挂牌用） */
export interface ActiveSynergy {
  id: string
  name: string
  /** 档位说明：『恋兔队 3/4』一类 */
  mark: string
  desc: string
  members: string[]
}

/** 本场生效的队伍羁绊（按人数取已达成的最高一档） */
export function traitsOf(ids: string[]): Array<{ trait: Trait; tier: TraitTier; members: string[] }> {
  const out: Array<{ trait: Trait; tier: TraitTier; members: string[] }> = []
  const on = new Set(ids)
  for (const t of TRAITS) {
    const members = t.ids.filter((x) => on.has(x))
    // 由高到低找第一档够人的
    const tier = [...t.tiers].sort((a, b) => b.need - a.need).find((x) => members.length >= x.need)
    if (tier) out.push({ trait: t, tier, members })
  }
  return out
}

/** 本场成立的双人羁绊（两人都在场上） */
export function pairsOf(ids: string[]): PairBond[] {
  const on = new Set(ids)
  return PAIRS.filter((p) => on.has(p.a) && on.has(p.b))
}

/** 界面挂牌：羁绊 / 双人各一行 */
export function synergiesOf(ids: string[]): ActiveSynergy[] {
  const out: ActiveSynergy[] = traitsOf(ids).map(({ trait, tier, members }) => ({
    id: trait.id,
    name: trait.name,
    mark: `${members.length}/${trait.ids.length} · 档 ${tier.need}`,
    desc: trait.desc,
    members,
  }))
  for (const p of pairsOf(ids)) {
    out.push({
      id: p.id, name: p.name, mark: '双人', desc: p.desc, members: [p.a, p.b],
    })
  }
  return out
}

/* ============================================================
   连携技 · 自动触发的口子
   ------------------------------------------------------------
   不由玩家点，而是「出手自己接上」：
     · 每一条羁绊有一槽（共鸣），羁绊里每有一个人出一手，槽就 +1；
     · 槽满（= 参加者各出一手）且全员都还在场上 → 自动接一记合击，
       打完槽清零，重新蓄。
   双人羁绊 3 拍满（两人加起来出三手），恋兔队全员 4 拍满（一人一手）。
   ============================================================ */

export interface BondLink {
  name: string
  desc: string
  line: string
  power: number
  linkPow: number
  axis: AxisKey
  fx: FxKind
  cost: number
  cd: number
}

/** 一条可自动触发的连携羁绊 */
export interface Bond {
  id: string
  name: string
  /** 参加者（全员到齐才触发） */
  members: string[]
  /** 共鸣槽要几拍才满 */
  need: number
  /** 满槽后由谁执手（成员里第一个还在场上的人） */
  link: BondLink
}

const PAIR_NEED = 3

/** 本场在场的连携羁绊（双人 + 整队） */
export function bondsOf(ids: string[]): Bond[] {
  const out: Bond[] = []
  const on = new Set(ids)
  for (const p of pairsOf(ids)) {
    out.push({
      id: p.id, name: p.name, members: [p.a, p.b].filter((x) => on.has(x)),
      need: PAIR_NEED,
      link: { ...p.link, linkPow: p.link.linkPow },
    })
  }
  for (const t of traitsOf(ids)) {
    const l = t.trait.squadLink
    if (!l) continue
    // 名单上一个不缺才算这条羁绊成立 —— 「必须全员都在」
    if (t.members.length < t.trait.ids.length) continue
    out.push({
      id: `${t.trait.id}-full`, name: l.name, members: t.members, need: t.members.length,
      link: { ...l },
    })
  }
  return out
}

/**
 * 把羁绊加成落到上阵者身上（只落常驻字段）。
 * 连携技不再进技能表 —— 它由共鸣槽自动触发（见 engine 的 chargeLinks / fireLinks）。
 * @param targets  要落加成的上阵者
 * @param squadIds 本场的队伍名单（换装重建单人时由调用方传全队，否则会算漏人）
 */
export function applySynergies(targets: Combatant[], squadIds?: string[]): void {
  const ids = squadIds ?? targets.map((c) => c.id)
  const traits = traitsOf(ids)
  const pairs = pairsOf(ids)

  for (const c of targets) {
    let atk = 0
    let spd = 0
    let evade = 0
    const axes: Partial<Record<AxisKey, number>> = {}
    const names: string[] = []

    for (const { trait, tier, members } of traits) {
      if (!members.includes(c.id)) continue
      names.push(trait.name)
      atk += tier.atk ?? 0
      spd += tier.spd ?? 0
      evade += tier.evade ?? 0
      for (const [k, v] of Object.entries(tier.axes ?? {})) {
        axes[k as AxisKey] = (axes[k as AxisKey] ?? 0) + (v as number)
      }
    }
    for (const p of pairs) {
      if (p.a !== c.id && p.b !== c.id) continue
      names.push(p.name)
      atk += p.atk ?? 0
      spd += p.spd ?? 0
      evade += p.evade ?? 0
      for (const [k, v] of Object.entries(p.axes ?? {})) {
        axes[k as AxisKey] = (axes[k as AxisKey] ?? 0) + (v as number)
      }
    }

    if (names.length) {
      c.gearAtk += atk
      c.gearSpd += spd
      c.evade += evade
      for (const [k, v] of Object.entries(axes)) c.axes[k as AxisKey] += v as number
      c.synergy = names
    }
  }
}
