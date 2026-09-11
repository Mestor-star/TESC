/* ============================================================
   技能框架 —— 「一个人可以做到的事情」的清单
   ------------------------------------------------------------
   在这之前，二十四个人各写各的：同样是「打一下」，有人写 1.6、有人写 1.85；
   同样叫「减伤」，有人 0.38、有人 0.45 —— 谁也说不清哪个数才是对的，
   因为那根本不是一套东西，只是二十几份手稿。
   现在换一个写法：先把「战场上能做的事」列成一张清单（这张表），
   每一类定死它的目标、耗体、冷却、持续拍数与倍率带；角色再往里面坐。
     · 类决定这一手**怎么打**（打谁、多大代价、多长冷却）；
     · 角色决定这一手**是什么**（名字、原文出处、轴、演出、台词），
       并在倍率带里挑一个自己的档位。
   于是「二十四个人都不一样」变成了「同一类里各有各的档位」——
   不一样的是档位与来历，不是规则本身。
   要加一类之前先问：它跟已有的某一类**在打法上**不同吗？
   只是数值大小不同的，一律并进同一类，靠倍率带分档。
   ============================================================ */

import type { AxisKey, FxKind, SkillEffect, SkillKind, SkillSpec, Target } from './types'

export interface Arch {
  id: string
  /** 这一类的名字（「强袭」「扫荡」…；界面与档案都念它） */
  name: string
  /** 这一类做什么（一句话） */
  desc: string
  /** 这一类属于哪一种出手 */
  kind: SkillKind
  target: Target
  cost: number
  cd: number
  /** 增益 / 减益类的持续拍数 */
  turns?: number
  /** 倍率带（「份」，即 POWER_SCALE 之前的那个数）：这一类只能落在这一档之间 */
  band: [number, number]
  /** 到达点的印记层数 */
  needsStack?: number
  /** 骨架效果 —— 角色在这一层之上追加自己的那几笔 */
  effect?: SkillEffect
  axis?: AxisKey
  /** 默认演出 */
  fx?: FxKind
}

export const ARCH: Record<string, Arch> = {
  /* —— 出手：造成伤害的那几种 —— */

  basic: {
    id: 'basic', name: '普攻', kind: '普攻',
    desc: '不耗心神的常规一击。谁都有，也谁都能一直用。',
    target: 'one', cost: 1, cd: 0, band: [1.0, 2.0],
  },
  强袭: {
    id: '强袭', name: '强袭', kind: '技能',
    desc: '把这一拍的全部力气压在一个人身上：单体，倍率最高的一类。',
    target: 'one', cost: 5, cd: 2, band: [1.7, 2.6],
  },
  扫荡: {
    id: '扫荡', name: '扫荡', kind: '技能',
    desc: '一次打到敌方全体：单体倍率低一档，但人越多越值。',
    target: 'all', cost: 5, cd: 3, band: [1.1, 1.8],
  },
  穿甲: {
    id: '穿甲', name: '穿甲', kind: '技能',
    desc: '无视护甲与减伤的一击：倍率不高，但它不吃对方的防。',
    target: 'one', cost: 5, cd: 2, band: [1.5, 2.2], effect: { pierce: true },
  },
  连打: {
    id: '连打', name: '连打', kind: '技能',
    desc: '两下连着出去：单下轻，合起来重，也更容易打穿闪避。',
    target: 'one', cost: 5, cd: 3, band: [0.85, 1.3], effect: { hits: 2 },
  },
  乱击: {
    id: '乱击', name: '乱击', kind: '技能',
    desc: '效果随机、性能极端：掷到高点能一记打穿，掷到低点连普攻都不如。',
    target: 'one', cost: 4, cd: 3, band: [1.6, 3.0],
  },
  驱逐: {
    id: '驱逐', name: '驱逐', kind: '技能',
    desc: '打出去的同时把目标推离这一轮：伤害中等，但它的行动条要重排。',
    target: 'one', cost: 5, cd: 2, band: [1.4, 2.0], effect: { pushBack: 0.55 },
  },
  震退: {
    id: '震退', name: '震退', kind: '技能',
    desc: '一下打到敌方全体，并一起震退：清小幅兵与拆蓄势都用它。',
    target: 'all', cost: 4, cd: 3, band: [1.0, 1.6], effect: { pushBack: 0.5, slow: 0.3 },
  },

  /* —— 保住人：往上加的那种 —— */

  治愈: {
    id: '治愈', name: '治愈', kind: '技能',
    desc: '全队回复（以意志力为准），并把身上的负面一并刮掉。',
    target: 'allyAll', cost: 4, cd: 2, band: [0, 0], effect: { heal: 0.5, cleanse: true },
  },
  自愈: {
    id: '自愈', name: '自愈', kind: '技能',
    desc: '只修自己：回血、回气、回行动条 —— 一个人把这一拍找回来。',
    target: 'self', cost: 3, cd: 2, band: [0, 0], effect: { heal: 0.3, pushBar: 0.5, cleanse: true },
  },
  屏障: {
    id: '屏障', name: '屏障', kind: '技能',
    desc: '给全队一层减伤：挡在前面的人负责把这一轮吃掉。',
    target: 'allyAll', cost: 4, cd: 2, turns: 2, band: [0, 0], effect: { shield: 0.4 },
  },
  坚守: {
    id: '坚守', name: '坚守', kind: '技能',
    desc: '只护自己，但护得极厚 —— 再顺手把敌人的注意力引过来。',
    target: 'self', cost: 4, cd: 3, turns: 3, band: [0, 0], effect: { shield: 0.62, taunt: true },
  },

  /* —— 推着走：改节奏的那种 —— */

  增益: {
    id: '增益', name: '增益', kind: '技能',
    desc: '全队打得更重：给的是攻击，不是这一下。',
    target: 'allyAll', cost: 4, cd: 3, turns: 3, band: [0, 0], effect: { atkUp: 0.35 },
  },
  提速: {
    id: '提速', name: '提速', kind: '技能',
    desc: '全队立刻抢回一截行动条，并跑得更快：先手是这一类给的。',
    target: 'allyAll', cost: 4, cd: 2, band: [0, 0], effect: { spdUp: 0.4, pushBar: 0.35 },
  },
  牵制: {
    id: '牵制', name: '牵制', kind: '技能',
    desc: '压在一个人身上：打它更重、它充得更慢，退路也一并堵上。',
    target: 'one', cost: 4, cd: 3, turns: 3, band: [0, 0], effect: { mark: 0.3, slow: 0.25 },
  },
  重压: {
    id: '重压', name: '重压', kind: '技能',
    desc: '对敌方全体下手：一起慢下来、一起往后挪、一起被标上。',
    target: 'all', cost: 5, cd: 3, turns: 3, band: [0, 0], effect: { mark: 0.2, slow: 0.35, pushBack: 0.4 },
  },
  解厄: {
    id: '解厄', name: '解厄', kind: '技能',
    desc: '只做一件事：把全队身上的负面全刮掉，并让他们立刻往前挪。',
    target: 'allyAll', cost: 4, cd: 3, band: [0, 0], effect: { cleanse: true, pushBar: 0.45 },
  },

  /* —— 规格：改自己底子的那一类 —— */

  解放: {
    id: '解放', name: '解放', kind: '技能',
    desc: '不碰敌人，也不碰同伴：解开自己的某一重限制，此后每一手都按新的规格算。'
      + '这一类是全表最贵的一手 —— 它买的不是这一拍，是接下来的每一拍。',
    target: 'self', cost: 6, cd: 5, turns: 3, band: [0, 0], effect: { skillMul: 2 },
  },

  /* —— 慢启动门的解封手 —— */

  启动: {
    id: '启动', name: '启动', kind: '启动',
    desc: '解封用的起手：不造成伤害，纯粹是「把封印一层一层拧开」的代价。'
      + '打满次数之前，普攻与技能都列不出来。',
    target: 'self', cost: 2, cd: 0, band: [0, 0],
  },

  /* —— 到达点：每个人的终结技 —— */

  到达点: {
    id: '到达点', name: '到达点', kind: '到达点',
    desc: '终结技（End）。出手每蓄一层印记，蓄满才列得出来 ——'
      + '那一手是这个人全部的东西，所以代价最高、冷却最长、样式由他自己定。'
      + '守护型的到达点不带伤害（倍率写 0），规格与辅助手无异。',
    target: 'one', cost: 8, cd: 4, needsStack: 3, band: [2.2, 5.2],
  },
}

/** 一类的默认倍率（带内取中；档位由角色自己挑） */
export function archPower(a: Arch): number {
  return (a.band[0] + a.band[1]) / 2
}

export interface PlaceOpt {
  /** 技能 id（引擎与战斗语音都认它，不要改） */
  id: string
  /** 名字（原文措辞） */
  name: string
  /** 说明：这一手在这个角色身上是什么 */
  desc: string
  /** 战斗语音 */
  line?: string
  /** 这一手按哪条轴算 */
  axis?: AxisKey
  /** 演出 */
  fx?: FxKind
  /** 倍率（「份」）。落在本类的带外会被夹回带内；写 0 = 明说这一手不带伤害 */
  power?: number
  /** 覆盖目标（少数几手确实要打别人） */
  target?: Target
  /** 覆盖耗体 / 冷却 / 持续 */
  cost?: number
  cd?: number
  turns?: number
  /** 在本类骨架上追加的效果（同名键以这里为准） */
  effect?: SkillEffect
  /** 到达点的印记层数 */
  needsStack?: number
  /** 解封之后还要过几拍才放得出来 */
  openAfter?: number
  /** 启动（解封）类专有：每一层的台词（见 SkillSpec.startLines） */
  startLines?: string[]
  /** 倍率浮动（乱击一类） */
  variance?: number
  /** 复写：把小队方才用过的那一手原样念回来（见 engine 的回响分支） */
  echo?: boolean
  /** 复写（申告虚伪）：当场照抄任意一个角色的一手（见 engine 的 copy 分支） */
  copy?: boolean
  /** 抄不过来（见 SkillSpec.uncopyable） */
  uncopyable?: boolean
  /** 需与某位同伴同队 */
  requireAlly?: string
  /** 合体：出这一手时把 requireAlly 那位暂时请下场，蛰伏 N 拍后自行归位 */
  mergeAlly?: string
  mergeTicks?: number
}

/**
 * 把一个角色的一手技能**放进框架里**。
 * 数值先过本类的带：写超了会被夹回边界 —— 这样既保留了「谁比谁更重一点」，
 * 又不会出现某一手凭空比同类高出三倍的情况。
 * 唯一的例外是**明写 0**：那是「这一手不造成伤害」的意思（守护型的到达点、
 * 纯辅助与增益），不受带约束；倍率带管的是伤害，不是这一类手的存在与否。
 */
export function place(archId: string, o: PlaceOpt): SkillSpec {
  const a = ARCH[archId]
  if (!a) throw new Error(`技能框架里没有这一类：${archId}`)
  const raw = o.power ?? archPower(a)
  const power = raw === 0 ? 0 : Math.max(a.band[0], Math.min(a.band[1], raw))
  const effect = a.effect || o.effect ? { ...a.effect, ...o.effect } : undefined
  return {
    id: o.id,
    name: o.name,
    kind: a.kind,
    desc: o.desc,
    cost: o.cost ?? a.cost,
    power,
    axis: o.axis ?? a.axis ?? '破坏力',
    fx: o.fx ?? a.fx ?? 'slash',
    line: o.line ?? '',
    target: o.target ?? a.target,
    effect,
    turns: o.turns ?? a.turns,
    needsStack: o.needsStack ?? a.needsStack,
    cd: o.cd ?? a.cd,
    openAfter: o.openAfter,
    startLines: o.startLines,
    variance: o.variance,
    echo: o.echo,
    copy: o.copy,
    uncopyable: o.uncopyable,
    requireAlly: o.requireAlly,
    mergeAlly: o.mergeAlly,
    mergeTicks: o.mergeTicks,
    /** 这一手按框架里的哪一类打的（档案与作战面板都会写出来） */
    arch: a.id,
  }
}

/** 框架里一类的名字（界面挂牌用） */
export function archNameOf(id?: string): string | undefined {
  return id ? ARCH[id]?.name : undefined
}
