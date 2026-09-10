/* ============================================================
   主角档案 · 言万心叶
   ------------------------------------------------------------
   他是战斗人员，不是只坐在后面看的人：五轴、武装、技能一样齐全，
   只是每一段时期都不一样——原文里他从「不会游泳的留学生」一路
   走到「与蕾雅共奏的心蕾雅」。所以这里按时间线的事件段切成若干
   「时期」，读到哪一段，档案与面板就停在哪一页。
   锚点取自 arms.ts 的 revealAt（noapusa = v2-2 / a Session. = v4-5）
   与各卷正文，不另立考据。
   ============================================================ */

import { TIMELINE } from '../data/timeline'
import { furthestDone } from './operator'
import type { AxisKey, AxisSheet, FxKind, PassiveSpec, SkillEffect, SkillKind, Target } from './battle/types'
import { OPERATOR_ID } from '../data/castmeta'
/** 与名册同一口径：power 以「对应轴的百分之多少」计（见 roster.ts 的 POWER_SCALE） */
import { POWER_SCALE } from './battle/roster'

/** 他的一手技能（原文有则用原名，分支即同一门的变奏） */
export interface OpAbility {
  name: string
  kind: SkillKind
  desc: string
  pow: number
  axis: AxisKey
  fx: FxKind
  target?: Target
  cost?: number
  effect?: SkillEffect
  turns?: number
  needsStack?: number
  /** 冷却：出手后 N 次自身行动之内不得再出 */
  cd?: number
  /** 需场上同在者（角色 id）——人不在，这一手就不列出来 */
  requireAlly?: string
  /** 合体：出这一手时把 requireAlly 那位暂时请下场，mergeTicks 拍后自行归位 */
  mergeAlly?: string
  mergeTicks?: number
  /** 解锁点：读到这一段时间线事件（含）之后，这一手才进他的技能组 */
  unlockAt?: string
  /** 变身（noapusa「变成他人」）：照一份已解锁的档案角色变身，复制其全部能力 */
  morph?: boolean
  morphTicks?: number
  morphCd?: number
}

export interface OpPeriod {
  /** 时间线事件 id：收到此段即进入该时期 */
  at: string
  vol: string
  /** 时期名（原文措辞） */
  title: string
  /** 战斗定位（职业） */
  cls: string
  /** 此刻的处境一句话 */
  note: string
  axes: AxisSheet
  /** 该时期持有的武装（无则写「无」） */
  arm: string
  armSub: string
  armNote: string
  abilities: OpAbility[]
  /** 被动技能：这一段时期里他「一直带着的东西」 */
  passive?: PassiveSpec
  /**
   * 自带装备：他身上本来就带着的那件东西（gear.ts 的 id）。
   * 只在玩家没另外装配时生效 —— 他自己买的那件比身上的旧物更贴手。
   */
  builtin?: string
  /**
   * 自带装备的解锁点：读到这一段时间线事件才算真正到他手上。
   * 缺省 = 该时期一进入就有；给了就按进度卡 ——
   * 露娜的丝线是「第一卷全部内容走完」那一刻才系上手腕的。
   */
  builtinFrom?: string
}

const A = (
  破坏力: number, 敏捷度: number, 物理抗性: number, 反现实亲和: number, 意志力: number,
): AxisSheet => ({ 破坏力, 敏捷度, 物理抗性, 反现实亲和, 意志力 })

/** 第一卷的最后一节：走完它，露娜的丝线才算真的系在他手腕上 */
const VOL1_END = 'v1-9'

const ab = (
  name: string, kind: SkillKind, desc: string, pow: number, axis: AxisKey, fx: FxKind,
  o: Omit<OpAbility, 'name' | 'kind' | 'desc' | 'pow' | 'axis' | 'fx'> = {},
) : OpAbility => ({
  name, kind, desc, pow: pow * POWER_SCALE, axis, fx,
  target: kind === '启动' ? 'self' : 'one', ...o,
})

/**
 * 「黄金狮子」——露娜的本源终末。
 * 她是「境界领域商会」以金属丝线织成的机器人偶，狮形是她被造出来时的样子；
 * 合体出力远超两人相加，代价是此刻必须由他一个人站着：她在三拍之内不在场上。
 */
const GOLDEN_LION = (pow: number): OpAbility => ab(
  '黄金狮子', '技能',
  '与露娜合而为一——丝线织成的狮。她暂时从他身上消失，三拍之后自行归位；'
  + '这一击的出力远超两人相加。（需露娜在场）',
  pow, '反现实亲和', 'noise',
  // 不设「到达点」：这门合体的门槛是「露娜在场」与「契约已立」，
  // 不是攒印记——代价已经写在「三拍之内她不在场上」上了。
  { target: 'all', cd: 5, requireAlly: 'luna', mergeAlly: 'luna', mergeTicks: 3 },
)

export const OP_PERIODS: OpPeriod[] = [
  {
    at: 'v1-1',
    vol: '第 1—2 卷 · 从落海到「低语者」',
    title: '言万心叶 · 低语者',
    cls: '低语者',
    note: '他不会游泳、也不穿武装，一身本事都长在一双拳头与那台关不掉的收音机上。'
      + '低语者不是武器，是一种反现实体质——听得见别人心里最响的那一句，'
      + '所以他的拳总比对方先到半步，也总先挪开半步。',
    axes: A(12, 26, 14, 20, 46),
    builtin: 'luna-thread', builtinFrom: VOL1_END,
    arm: '低语者（Susurrador）',
    armSub: 'SUSURRADOR · STAGE4「活性化」',
    armNote: '读取半径约 500 米内的心声，并把读到的剧烈噪音反过来当作护身的杂音。'
      + '面具以坐标心声向他呼救、差点把他吞掉的那一次，正是这份噪音救了他。',
    passive: {
      name: '低语者',
      desc: '他出手之前，对方心里那句「往左躲」已经先到了——攻击必中，闪避率提升 40%。',
      sureHit: true, evade: 0.4,
    },
    abilities: [
      ab('拳法 · 直', '普攻', '他没有武装，只有一双手——可拳头落下之前，他已经知道你要往哪躲。',
        1, '破坏力', 'slash'),
      ab('拳法 · 狮子', '普攻',
        '「黄金狮子」立下契约之后，丝线缠上拳面：同一记直拳，架式与出力都换了副模样。'
        + '（需已解锁「黄金狮子」，且露娜在场）',
        2.2, '破坏力', 'slash', { requireAlly: 'luna', unlockAt: 'v1-9' }),
      ab('低语 · 读心', '技能', '听见对方心里最响的那一句：自身闪避与命中一并上升——'
        + '他要喊的东西总在出手之前就到。',
        0, '反现实亲和', 'seal', { target: 'self', turns: 3, effect: { evade: 0.25, accUp: 0.3 } }),
      ab('先救别人', '技能', '落海时反手把不会游泳的人捞上来——代全队承下一次伤害。',
        0, '意志力', 'guard', { target: 'allyAll', turns: 1, effect: { taunt: true, shield: 0.3 } }),
      GOLDEN_LION(2.6),
    ],
  },
  {
    at: 'v2-2',
    vol: '第 2—3 卷 · 弹痕「noapusa」',
    title: '言万心叶 · noapusa · 化身之枪',
    cls: '化身之枪',
    note: '夜梦之后枕边多了一把手枪。它能让他变成任何人——曾被指为「会化作怪物的能力」。'
      + '使用期间，他本人的意志不会反映出来；而借来的东西总要还，还得缓一缓。',
    axes: A(26, 34, 24, 62, 70),
    builtin: 'luna-thread', builtinFrom: VOL1_END,
    arm: 'noapusa',
    armSub: 'NOAPUSA · 弹痕 · 化身之枪',
    armNote: '弹痕「noapusa」：化为与目标完全一致之人的复制体——外貌、声音到能力皆为一致，'
      + '并获得「无论是谁也无法分辨真正的本人」这一反现实性质。觉醒于 v2-2 的夜梦。',
    passive: {
      name: '低语者',
      desc: '他出手之前，对方心里那句「往左躲」已经先到了——攻击必中，闪避率提升 40%。',
      sureHit: true, evade: 0.4,
    },
    abilities: [
      ab('拳法 · 直', '普攻', '他没有武装，只有一双手——可拳头落下之前，他已经知道你要往哪躲。',
        1, '破坏力', 'slash'),
      ab('拳法 · 狮子', '普攻',
        '「黄金狮子」立下契约之后，丝线缠上拳面：同一记直拳，架式与出力都换了副模样。'
        + '（需已解锁「黄金狮子」，且露娜在场）',
        2.2, '破坏力', 'slash', { requireAlly: 'luna', unlockAt: 'v1-9' }),
      ab('低语 · 读心', '技能', '听见对方心里最响的那一句：自身闪避与命中一并上升——'
        + '他要喊的东西总在出手之前就到。',
        0, '反现实亲和', 'seal', { target: 'self', turns: 3, effect: { evade: 0.25, accUp: 0.3 } }),
      ab('先救别人', '技能', '落海时反手把不会游泳的人捞上来——代全队承下一次伤害。',
        0, '意志力', 'guard', { target: 'allyAll', turns: 1, effect: { taunt: true, shield: 0.3 } }),
      ab('变成他人', '技能',
        '照着一份已解锁的档案变成对方：外貌、声音到能力（五轴与技能表）全部借来用。'
        + '队伍里的人复制不了——那是他还不肯弄丢的东西。'
        + '解除之后的三拍里手感发虚，出力与充能略降。',
        0, '反现实亲和', 'guitar',
        // 出手当时不上冷却：冷却从「变身解除」那一刻才起算（见 engine 的拍子循环）
        { cost: 3, cd: 0, target: 'one', morph: true, morphTicks: 3, morphCd: 3 }),
      GOLDEN_LION(2.8),
    ],
  },
  {
    at: 'v4-5',
    vol: '第 4 卷起 · 斩击之戒「a Session.」',
    title: '言万心叶 · a Session. · 灵魂共奏',
    cls: '灵魂共奏',
    note: '篝火之国坠落后那一夜，他梦见满身伤痕的「斩击的天使」；醒来枕边多了一枚极其简朴的白金戒指。'
      + '「变成他人」已经随 noapusa 一起碎掉了——现在他要做的是合而为一，不是变成别人。',
    axes: A(48, 46, 44, 84, 96),
    builtin: 'luna-thread', builtinFrom: VOL1_END,
    arm: 'a Session.',
    armSub: 'A SESSION. · 斩击之戒',
    armNote: '两枚成对的戒指相互共鸣，能让佩戴者灵魂共奏、合而为一。它酷似 noapusa「实现渴望」的本质，'
      + '却不再是那把把人复制成他人的可悲小手枪。（第 5 卷经胡道乃梦鉴定：密度 29g/cc，为地球上从未存在过的超重物质所制。）',
    passive: {
      name: '低语者',
      desc: '他出手之前，对方心里那句「往左躲」已经先到了——攻击必中，闪避率提升 40%。',
      sureHit: true, evade: 0.4,
    },
    abilities: [
      ab('拳法 · 直', '普攻', '他没有武装，只有一双手——可拳头落下之前，他已经知道你要往哪躲。',
        1, '破坏力', 'slash'),
      ab('拳法 · 狮子', '普攻',
        '「黄金狮子」立下契约之后，丝线缠上拳面：同一记直拳，架式与出力都换了副模样。'
        + '（需已解锁「黄金狮子」，且露娜在场）',
        2.2, '破坏力', 'slash', { requireAlly: 'luna', unlockAt: 'v1-9' }),
      ab('低语 · 读心', '技能', '听见对方心里最响的那一句：自身闪避与命中一并上升——'
        + '他要喊的东西总在出手之前就到。',
        0, '反现实亲和', 'seal', { target: 'self', turns: 3, effect: { evade: 0.25, accUp: 0.3 } }),
      ab('先救别人', '技能', '落海时反手把不会游泳的人捞上来——代全队承下一次伤害。',
        0, '意志力', 'guard', { target: 'allyAll', turns: 1, effect: { taunt: true, shield: 0.3 } }),
      ab('a Session. · 合而为一', '技能', '与同伴灵魂共奏：全队攻击与充能一并上扬。',
        0, '意志力', 'slash', { target: 'allyAll', turns: 3, effect: { atkUp: 0.35, spdUp: 0.3 } }),
      GOLDEN_LION(3.2),
    ],
  },
]

/** 各时期的时间线位置（0..1），供「按时期进度取面板」用 */
const AT_P = OP_PERIODS.map((p) => {
  const i = TIMELINE.findIndex((e) => e.id === p.at)
  return i < 0 ? 0 : i / Math.max(1, TIMELINE.length - 1)
})

/** 此刻的言万心叶（按已收束事件读页） */
export function opPeriodAt(epDone: Record<string, true>): OpPeriod {
  let cur = OP_PERIODS[0]
  for (let i = 0; i < OP_PERIODS.length; i++) {
    if (furthestDone(epDone) >= TIMELINE.findIndex((e) => e.id === OP_PERIODS[i].at)) cur = OP_PERIODS[i]
  }
  return cur
}

/** 此刻的言万心叶（按 0..1 的时期进度读页 —— 作战面板走这条） */
export function opPeriodAtProgress(p: number): OpPeriod {
  let cur = OP_PERIODS[0]
  for (let i = 0; i < OP_PERIODS.length; i++) if (p + 1e-6 >= AT_P[i]) cur = OP_PERIODS[i]
  return cur
}

/**
 * 此刻他身上带着的那件自带装备（若有）。
 * 有 builtinFrom 的按进度卡：读到那一节才算真的到他手上。
 */
export function opBuiltinOf(per: OpPeriod, progress: number): string | undefined {
  if (!per.builtin) return undefined
  if (!per.builtinFrom) return per.builtin
  const i = TIMELINE.findIndex((e) => e.id === per.builtinFrom)
  if (i < 0) return per.builtin
  const need = i / Math.max(1, TIMELINE.length - 1)
  return progress + 1e-6 >= need ? per.builtin : undefined
}

/** 同上，但按「已收束事件」判定（档案页走这条） */
export function opBuiltinAt(per: OpPeriod, epDone: Record<string, true>): string | undefined {
  if (!per.builtin) return undefined
  if (!per.builtinFrom) return per.builtin
  const i = TIMELINE.findIndex((e) => e.id === per.builtinFrom)
  if (i < 0) return per.builtin
  return furthestDone(epDone) >= i ? per.builtin : undefined
}

export { OPERATOR_ID }
export const AXIS_KEYS: AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']
