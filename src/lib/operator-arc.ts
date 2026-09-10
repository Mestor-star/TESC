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
import type { AxisKey, AxisSheet, FxKind, SkillEffect, SkillKind, Target } from './battle/types'
import { OPERATOR_ID } from '../data/castmeta'

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
}

const A = (
  破坏力: number, 敏捷度: number, 物理抗性: number, 反现实亲和: number, 意志力: number,
): AxisSheet => ({ 破坏力, 敏捷度, 物理抗性, 反现实亲和, 意志力 })

const ab = (
  name: string, kind: SkillKind, desc: string, pow: number, axis: AxisKey, fx: FxKind,
  o: Omit<OpAbility, 'name' | 'kind' | 'desc' | 'pow' | 'axis' | 'fx'> = {},
) : OpAbility => ({ name, kind, desc, pow, axis, fx, target: kind === '启动' ? 'self' : 'one', ...o })

export const OP_PERIODS: OpPeriod[] = [
  {
    at: 'v1-1',
    vol: '第 1 卷 · 序章「船与影」',
    title: '落海的留学生',
    cls: '落难者',
    note: '被拘束服捆在货船甲板上、连游泳都不会的普通人。他唯一做对的事，是在落海时先救了别人。',
    axes: A(8, 22, 12, 0, 40),
    arm: '无',
    armSub: '—',
    armNote: '此刻他还没有任何武装。弹痕、斩击、片羽皆与他无关——能用的只有身体。',
    abilities: [
      ab('徒手 · 挣', '普攻', '挣开拘束服的一下。谈不上战法，只是不肯死。', 1, '破坏力', 'slash'),
      ab('先救别人', '技能', '落海时反手把不会游泳的人捞上来——代全队承下一次伤害。',
        0, '意志力', 'guard', { target: 'allyAll', turns: 1, effect: { taunt: true, shield: 0.3 } }),
    ],
  },
  {
    at: 'v1-9',
    vol: '第 1 卷 · 第 11 话「低语者」',
    title: '低语者（Susurrador）· Stage4『活性化』',
    cls: '读心者',
    note: '灵魂深处的噪音被测定为「低语者」。他能听见别人心里最响的那一句，也被别人听见——委员会因此把他登记在册。',
    axes: A(14, 28, 18, 35, 58),
    arm: '低语者（Susurrador）',
    armSub: 'SUSURRADOR · STAGE4「活性化」',
    armNote: '不是武装，而是一种反现实体质：读取半径约 500 米内的心声，并把读到的剧烈噪音反过来当作护身的杂音。'
      + '面具以坐标心声向他呼救、差点把他吞掉的那一次，正是这份噪音救了他。',
    abilities: [
      ab('低语 · 噪音', '普攻', '把灌进来的杂音丢回去。听者头痛欲裂。', 1, '反现实亲和', 'seal'),
      ab('读心 · 辨伪', '技能', '听见对方心里最响的那一句：全队闪避提升——他要喊的东西总在出手之前就到。',
        0, '反现实亲和', 'seal', { target: 'allyAll', turns: 3, effect: { evade: 0.3 } }),
      ab('Stage4 · 活性化', '技能', '把低语者的活性推上去：全队充能提速，代价是他自己会被听得更清楚。',
        0, '意志力', 'noise', { target: 'allyAll', turns: 3, effect: { spdUp: 0.35, mark: 0.1 } }),
    ],
  },
  {
    at: 'v2-2',
    vol: '第 2 卷 · 第 2 话「noapusa」',
    title: 'noapusa · 化身之戒',
    cls: '拟态者',
    note: '夜梦之后枕边多了一把手枪。它能让他变成任何人——曾被指为「会化作怪物的能力」。使用期间，他本人的意志不会反映出来。',
    axes: A(26, 34, 24, 62, 70),
    arm: 'noapusa',
    armSub: 'NOAPUSA · 弹痕',
    armNote: '弹痕「noapusa」：化为与目标完全一致之人的复制体——外貌、声音到能力皆为一致，'
      + '并获得「无论是谁也无法分辨真正的本人」这一反现实性质。觉醒于 v2-2 的夜梦。',
    abilities: [
      ab('noapusa · 借形', '普攻', '把对方的手借来用一次：照着他的战法打回去。', 1.05, '反现实亲和', 'guitar'),
      ab('noapusa · 同貌', '技能', '化为与目标一致之人的复制体。命中之外，还把自己的行动条抢回来。',
        1.7, '反现实亲和', 'guitar', { effect: { pushBar: 0.3 } }),
      ab('noapusa · 无从分辨', '技能', '连同全队一起变得「无法分辨真假」：全队闪避大幅提升。',
        0, '反现实亲和', 'guitar', { target: 'allyAll', turns: 3, effect: { evade: 0.4 } }),
      ab('夜梦 · 觉醒', '启动', '那一夜梦里的东西先要认他。需先后打出 2 次，复制的门才会打开。',
        0, '反现实亲和', 'seal'),
    ],
  },
  {
    at: 'v3-9',
    vol: '第 3 卷 · 第 9 话「星鲸」',
    title: '失却 · 不再复制的普通人',
    cls: '普通人',
    note: '为守护露娜他再冲阵、被万针刺穿濒死；露娜以己命为他缝伤输血，缔结使用者契约。星鲸之战后，noapusa 损坏、再也无法使用，与之相关的一段记忆也随之丢失。',
    axes: A(20, 36, 30, 48, 78),
    arm: 'noapusa（损坏）',
    armSub: 'NOAPUSA · BROKEN',
    armNote: '弹痕已碎，再也无法使用。他失去了那段与之相关的记忆——连自己曾变成过谁都不记得了。'
      + '能依仗的只剩下低语者，与「黄金狮子」契约留下的余温。',
    abilities: [
      ab('拳头 · 硬撑', '普攻', '没有武装的人，只能用身体挡在最前面。', 1, '物理抗性', 'blast'),
      ab('旁听 · 低语', '技能', '读到的不是敌意，而是恐惧：把目标的破绽标记给全队。',
        0, '反现实亲和', 'seal', { turns: 3, effect: { mark: 0.3, slow: 0.2 } }),
      ab('普通人的选择', '技能', '他只想做个普通的善良的人——全队减伤并回复。',
        0, '意志力', 'heal', { target: 'allyAll', effect: { shield: 0.3, heal: 0.3, cleanse: true } }),
    ],
  },
  {
    at: 'v4-5',
    vol: '第 4 卷 · 第 4 话「火之试炼」',
    title: 'a Session. · 灵魂共奏',
    cls: '共奏者',
    note: '篝火之国坠落后那一夜，他梦见满身伤痕的「斩击的天使」；醒来枕边多了一枚极其简朴的白金戒指——「a Session.」。他第一次明白，自己「被篝火喜欢着」。',
    axes: A(48, 46, 44, 84, 96),
    arm: 'a Session.',
    armSub: 'A SESSION. · 斩击之戒',
    armNote: '两枚成对的戒指相互共鸣，能让佩戴者灵魂共奏、合而为一。它酷似 noapusa「实现渴望」的本质，'
      + '却不再是那把把人复制成他人的可悲小手枪。（第 5 卷经胡道乃梦鉴定：密度 29g/cc，为地球上从未存在过的超重物质所制。）',
    abilities: [
      ab('a Session. · 共奏', '普攻', '戒指一响，两个人的动作合上拍子。', 1.1, '破坏力', 'slash'),
      ab('a Session. · 合而为一', '技能', '与同伴灵魂共奏：全队攻击与充能一并上扬。',
        0, '意志力', 'slash', { target: 'allyAll', turns: 3, effect: { atkUp: 0.35, spdUp: 0.3 } }),
      ab('戒指 · 共鸣', '技能', '两枚戒指共振，替全队卸掉一重负面。',
        0, '意志力', 'seal', { target: 'allyAll', effect: { cleanse: true, heal: 0.25 } }),
      ab('a Session. · 终曲', '技能', '到达点：把「两个人的渴望」合起来献出去。',
        2.6, '反现实亲和', 'slash', { needsStack: 3, target: 'all' }),
    ],
  },
  {
    at: 'v6-7',
    vol: '第 6 卷 · 第 10 话「死斗」',
    title: '心蕾雅 · 巴别塔顶',
    cls: '共奏者 · 心蕾雅',
    note: '与蕾雅合体为「心蕾雅」，在巴别塔顶击破终末化的黑金狮子；此后亦以共奏深入世界根源——那是「两个人的渴望」合在一起、献给彼此的赞歌。',
    axes: A(92, 60, 58, 120, 112),
    arm: 'a Session.（共奏态）',
    armSub: 'A SESSION. · 心蕾雅',
    armNote: '共奏态：与热沃当的少女合而为一。两个人都不是最强，但「两个人的渴望」合在一起时，连世界的根源都进得去。',
    abilities: [
      ab('心蕾雅 · 斩', '普攻', '同一把锯子，由两个人的手一起挥。', 1.15, '破坏力', 'slash'),
      ab('灵魂共奏 · 合体', '技能', '与同伴合而为一：全场我方攻击大幅上扬。',
        0, '意志力', 'slash', { target: 'allyAll', turns: 3, effect: { atkUp: 0.5, spdUp: 0.25 } }),
      ab('献给彼此的赞歌', '技能', '深入世界根源的那一支歌：全队回复并解除全部负面。',
        0, '意志力', 'heal', { target: 'allyAll', effect: { heal: 0.55, cleanse: true } }),
      ab('巴别塔顶', '技能', '到达点：终末化的黑金狮子，在此处被击破。',
        2.8, '反现实亲和', 'slash', { needsStack: 3, target: 'all' }),
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

export { OPERATOR_ID }
export const AXIS_KEYS: AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']
