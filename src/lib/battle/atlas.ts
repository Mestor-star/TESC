/* ============================================================
   技能框架 —— 「一个人可以做到的事情」的清单
   ------------------------------------------------------------
   在这之前，二十五个人各写各的：同样是「打一下」，有人写 1.6、有人写 1.85；
   同样叫「减伤」，有人 0.38、有人 0.45 —— 谁也说不清哪个数才是对的，
   因为那根本不是一套东西，只是二十几份手稿。
   现在换一个写法：先把「战场上能做的事」列成一张清单（这张表），
   每一类定死它的目标、节拍消耗、冷却、持续回合数与倍率带；角色再往里面坐。
     · 类决定这一手**怎么打**（打谁、多大代价、多长冷却）；
     · 角色决定这一手**是什么**（名字、原文出处、轴、演出、台词），
       并在倍率带里挑一个自己的档位。
   于是「二十五个人都不一样」变成了「同一类里各有各的档位」——
   不一样的是档位与来历，不是规则本身。
   要加一类之前先问：它跟已有的某一类**在打法上**不同吗？
   只是数值大小不同的，一律并进同一类，靠倍率带分档。

   ------------------------------------------------------------
   「行动条」这一条不许再往下发
   ------------------------------------------------------------
   能直接挪动行动条的效果只有三个键：
     · pushBar   把自己这边往前推
     · pushBack  把对手往后推
     · clearBar  把目标的条清零（打断咏唱）
   这三样**只有梅芙（mefisa）与会长（alive-anatolia）**能碰 ——
   因为她俩的设定本身就是这件事：梅芙的八脚马是「无论何处都能抵达」，
   她决定谁先到场；会长的「如散文般」在因果的开端处落笔，她决定谁的那一拍被划掉。
   其余人只能在自己那一拍里做事。

   所以：**本表的骨架效果一律不带这三个键**，谁也不能靠「挑一个类」白拿一条。
   需要的那两位在 roster.ts 里自己往 effect 上写（place 的 effect 是同名覆盖，
   角色层压得过骨架层）。
   为什么这么收：条一旦人人能推，条就不代表「这一拍轮到谁」了 ——
   所有人都在抢顺位，就没有人在打输出。
   敌方的推条不受此限（见 bosses.ts 与 derive.ts 的杂兵技）：那是他们施压的手段，
   不是给玩家挑的选项。道具的打断也不算在内 —— 「镇静剂」（gear.ts）压掉的是
   对面正在咏唱的那一发，它是首领战的三种解法之一，拆了就没得解了。
   ============================================================ */

import type { AxisKey, FlagEffectKey, FxKind, NumericEffectKey, SkillEffect, SkillKind, SkillSpec, Target } from './types'
import { EFF_BAND } from './tuning'

export interface Arch {
  id: string
  /** 这一类的名字（「强袭」「扫荡」…；界面与档案都念它） */
  name: string
  /** 这一类做什么（一句话） */
  desc: string
  /** 这一类落在四格制的哪一格（普攻 / 战技 / 终结技）。天赋不占框架类 —— 见 §天赋 */
  slot: SkillKind
  /**
   * 「解封门」这一类：不造成伤害，纯粹是把封印一层一层拧开。
   * 它**不是单独一格**，而是「战技」格里的一个性质（原先的 `kind: '启动'`）——
   * 引擎一律读 `SkillSpec.gate`。置位由这一栏自动落，档案里不手写。
   */
  gate?: boolean
  target: Target
  cost: number
  cd: number
  /** 增益 / 减益类的持续**回合数**（不是拍 —— 主人 2026-09-14） */
  turns?: number
  /** 倍率带：这一类只能落在这一档之间。带里的数就是最终倍率（「对应轴的百分之多少」）——
   *  `place()` 只夹不乘，所以别在数据里预先放大。 */

  band: [number, number]
  /**
   * 效果带：这一类里某个数字键许落在哪一档（缺省走 tuning 的 `EFF_BAND` 全表）。
   * 有了它，「倍率有上限」这句话才管到了附带的那几笔上 —— 见 §效果带。
   */
  effBand?: Partial<Record<NumericEffectKey, [number, number]>>
  /**
   * 许带的**布尔**键。布尔没有「多大」可言，夹不了，所以只有放行与不放行两种：
   * 不在名单里的，角色层写了也一律丢掉 —— 不是悄悄丢掉，`place()` 当场抛。
   *
   * 名单按「这一类的手本来就该有这几样」来写，不是按现在谁写了什么来写。
   */
  allow?: FlagEffectKey[]
  /**
   * 认不认「行动条三键」（pushBar / pushBack / clearBar）。
   * 一整类都以动条为打法的写 true；只某一手要用的，写那一手自己的 `PlaceOpt.bar`。
   * **两处都没认领而写了三键 → place 抛** —— 这就是「行动条只许谁碰」那条规矩的机制化身。
   */
  bar?: boolean
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
    id: 'basic', name: '普攻', slot: '普攻',
    desc: '不耗心神的常规一击。谁都有，也谁都能一直用。',
    target: 'one', cost: 1, cd: 0, band: [1.0, 2.0],
    allow: ['pierce'],
  },
  强袭: {
    id: '强袭', name: '强袭', slot: '战技',
    desc: '把这一拍的全部力气压在一个人身上：单体，倍率最高的一类。',
    target: 'one', cost: 5, cd: 2, band: [1.7, 2.6],
    allow: ['pierce', 'sureCrit'],
  },
  扫荡: {
    id: '扫荡', name: '扫荡', slot: '战技',
    desc: '一次打到敌方全体：单体倍率低一档，但人越多越值。',
    target: 'all', cost: 5, cd: 3, band: [1.1, 1.8],
    allow: ['pierce', 'noCrit'],
  },
  穿甲: {
    id: '穿甲', name: '穿甲', slot: '战技',
    desc: '无视闪避与护甲的一击：倍率不高，但它不吃对方那身防。',
    target: 'one', cost: 5, cd: 2, band: [1.5, 2.2], effect: { pierce: true },
    allow: ['pierce'],
  },
  连打: {
    id: '连打', name: '连打', slot: '战技',
    desc: '两下连着出去：单下轻，合起来重，也更容易打穿闪避。',
    target: 'one', cost: 5, cd: 3, band: [0.85, 1.3], effect: { hits: 2 },
    allow: ['noCrit'],
  },
  乱击: {
    id: '乱击', name: '乱击', slot: '战技',
    desc: '效果随机、性能极端：掷到高点能一记打穿，掷到低点连普攻都不如。',
    target: 'one', cost: 4, cd: 3, band: [1.6, 3.0],
    allow: ['sureCrit', 'noCrit'],
  },
  驱逐: {
    id: '驱逐', name: '驱逐', slot: '战技',
    desc: '打出去的同时把它赶出射程：伤害中等，但它的节奏被打散了。',
    target: 'one', cost: 5, cd: 2, band: [1.4, 2.0], effect: { slow: 0.4 },
    allow: ['pierce', 'silence'],
  },
  震退: {
    id: '震退', name: '震退', slot: '战技',
    desc: '一下打到敌方全体，把它们的节奏一起震散：清小幅兵与拆蓄势都用它。',
    target: 'all', cost: 4, cd: 3, band: [1.0, 1.6], effect: { slow: 0.5, mark: 0.15 },
    allow: ['stanceBreak'],
  },

  /* —— 保住人：往上加的那种 —— */

  治愈: {
    id: '治愈', name: '治愈', slot: '战技',
    desc: '全队回复（以意志力为准），并把身上的负面一并刮掉。',
    target: 'allyAll', cost: 4, cd: 2, band: [0, 0], effect: { heal: 0.5, cleanse: true },
    allow: ['cleanse', 'revive'],
  },
  自愈: {
    id: '自愈', name: '自愈', slot: '战技',
    desc: '只修自己：回一截血、刮掉身上的负面，再扣上一层薄甲 —— 一个人把这条命找回来。',
    target: 'self', cost: 3, cd: 2, band: [0, 0], effect: { heal: 0.45, cleanse: true, shield: 0.18 },
    allow: ['cleanse'],
  },
  屏障: {
    id: '屏障', name: '屏障', slot: '战技',
    desc: '给全队一层减伤：挡在前面的人负责把这一轮吃掉。',
    target: 'allyAll', cost: 4, cd: 2, turns: 2, band: [0, 0], effect: { shield: 0.4 },
    allow: ['cleanse'],
  },
  坚守: {
    id: '坚守', name: '坚守', slot: '战技',
    desc: '只护自己，但护得极厚 —— 再顺手把敌人的注意力引过来。',
    target: 'self', cost: 4, cd: 3, turns: 3, band: [0, 0], effect: { shield: 0.62, taunt: true },
    allow: ['taunt'],
  },

  /* —— 推着走：改节奏的那种 —— */

  增益: {
    id: '增益', name: '增益', slot: '战技',
    desc: '全队打得更重：给的是攻击，不是这一下。',
    target: 'allyAll', cost: 4, cd: 3, turns: 3, band: [0, 0], effect: { atkUp: 0.35 },
    allow: ['cleanse'],
    bar: true,   // 这一整类都以动条为打法
  },
  提速: {
    id: '提速', name: '提速', slot: '战技',
    desc: '全队跑得更快：先手是这一类给的 —— 但它只改充能的速度，不替谁把行动条挪过去。',
    target: 'allyAll', cost: 4, cd: 2, band: [0, 0], effect: { spdUp: 0.6 },
    allow: ['selfToo'],
    bar: true,   // 这一整类都以动条为打法
  },
  牵制: {
    id: '牵制', name: '牵制', slot: '战技',
    desc: '压在一个人身上：打它更重、它充得更慢，退路也一并堵上。',
    target: 'one', cost: 4, cd: 3, turns: 3, band: [0, 0], effect: { mark: 0.3, slow: 0.25 },
    /* 放行 guardClear（破绽尽碎，2026-09-17）：这一类本来就是「**压在一个人身上**」——
       打它更重、它充得更慢、退路一并堵上。把它的防也一并掀开，是同一句话往下说完：
       压住它 → 它动不了 → 它也没得挡。单点、辅助手、贵且长冷却，都在这一类的本分里。
       别的框架不放：拆盾是**专人的活**（本来就有 breakGuard 那条通用的路），
       尽碎要的是「真的零」，给出去就没人再读首领怕哪条轴了（见 tuning 的 guardClearRounds 头注）。 */
    allow: ['guardClear'],
    bar: true,   // 这一整类都以动条为打法
  },
  重压: {
    id: '重压', name: '重压', slot: '战技',
    desc: '对敌方全体下手：一起慢下来、一起被标上 —— 谁也跑不掉。',
    target: 'all', cost: 5, cd: 3, turns: 3, band: [0, 0], effect: { mark: 0.25, slow: 0.5 },
    allow: [],
    bar: true,   // 这一整类都以动条为打法
  },
  解厄: {
    id: '解厄', name: '解厄', slot: '战技',
    desc: '只做一件事：把全队身上的负面全刮掉 —— 刮干净之后，敌人这一段的出手也一起落空。',
    target: 'allyAll', cost: 4, cd: 3, band: [0, 0], effect: { cleanse: true, evade: 0.2 },
    allow: ['cleanse'],
  },

  /* —— 规格：改自己底子的那一类 —— */

  解放: {
    id: '解放', name: '解放', slot: '战技',
    desc: '不碰敌人，也不碰同伴：解开自己的某一重限制，此后每一手都按新的规格算。'
      + '这一类是全表最贵的一手 —— 它买的不是这一拍，是接下来的每一拍。',
    target: 'self', cost: 6, cd: 5, turns: 3, band: [0, 0], effect: { skillMul: 2 },
    allow: [],
  },

  /* —— 慢启动门的解封手 —— */

  启动: {
    id: '启动', name: '启动', slot: '战技', gate: true,
    desc: '解封用的起手：不造成伤害，纯粹是「把封印一层一层拧开」的代价。'
      + '打满次数之前，普攻与技能都列不出来。',
    target: 'self', cost: 2, cd: 0, band: [0, 0],
    allow: [],
  },

  /* —— 到达点：每个人的终结技 —— */

  到达点: {
    id: '到达点', name: '到达点', slot: '终结技',
    desc: '终结技（End）。出手每蓄一层印记，蓄满才列得出来 ——'
      + '那一手是这个人全部的东西，所以代价最高、冷却最长、样式由他自己定。'
      + '守护型的到达点不带伤害（倍率写 0），规格与辅助手无异。',
    target: 'one', cost: 8, cd: 4, needsStack: 3, band: [2.2, 5.2],
    /* `clearBar` 是**漏写**不是设计：下面 `bar: true` 已经把整条行动条认领了
       （见头注「条只许认领过的人碰」），而清条是这条上最重的那一笔 ——
       漏着它的话，谁写出 `{ clearBar: true }` 谁就在 **import 期**当场抛，
       只能去改语义或改表结构，两样都比补一个白名单贵。 */
    allow: ['pierce', 'cleanse', 'silence', 'sureCrit', 'stanceBreak', 'clearBar'],
    bar: true,   // 这一整类都以动条为打法
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
  /** 这一手落下的东西**也走回合钟**（见 `SkillSpec.rounds` 的头注） */
  rounds?: number
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
  /**
   * 这一手**认领了行动条三键**。
   * 本表的骨架一律不带那三键（见头注），所以要用就得在这一行上写明是谁认的 ——
   * 于是「谁把谁的条推了」在档案里是看得见的，不再是谁都能白拿的一条。
   * 没认领而 effect 里带了三键，`place()` 当场抛。
   */
  bar?: boolean
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
  /* —— 召唤（首领与精英那一记通用的「成形体诱出」不走这儿，见 derive 的 SUMMON_MOVE）——
     这一栏是给「对面喊上来的不是观测体，而是档案里的真人」那一种写的：
     骷髅假面之男的亡灵军团。两个字段一起填，见 SkillSpec 的同名两条。 */
  /** 这一手不造成伤害，出手时把一只喊上场 */
  summon?: boolean
  /** 喊的是**谁**：按名单依次喊出这些档案 id（缺省 = 这片现实里现推的杂兵） */
  summonPack?: string[]
}

/* 行动条三键 —— 骨架与角色层都不许白拿，认领了才放行（见 Arch.bar / PlaceOpt.bar） */
const BAR_KEYS: Array<keyof SkillEffect> = ['pushBar', 'pushBack', 'clearBar']

/**
 * 把一时手的效果逐条过闸：**布尔走白名单，数字走效果带，动条三键要认领**。
 *
 * 这三道闸是同一件事的三个面 —— 「一手技能能附带多少东西」得有个说得清的上界：
 *   · 布尔：夹不了量，所以只有放行与不放行（`Arch.allow`）；
 *   · 数字：逐条夹回带内（本类 `effBand` 优先，其次全表 `EFF_BAND`）；
 *   · 动条三键：本表骨架一律不带（见头注），谁要用谁在那一行上认领。
 *
 * 越界一律**抛**，不悄悄改数：档案里写了一个框架不认的东西，
 * 那是数据错了，不是「引擎该替它收拾」。夹回带内的那一种不算越界 ——
 * 倍率本来就这个规矩（「同一类里各有各的档位」），效果带只是把同一句话说完。
 *
 * 只对**过 place 的手**生效。敌方那几份不按 place 走的表（endfoes 的图鉴实体、
 * derive 的杂兵技）与道具（gear.ts）不受此限 —— 推条是他们施压的手段，
 * 不是给玩家挑的选项；道具的打断是首领战的三种解法之一，拆了就没得解。
 */
function tidyEffect(a: Arch, o: PlaceOpt, merged: SkillEffect): SkillEffect {
  const out: SkillEffect = {}
  const allow = new Set<string>(a.allow ?? [])
  const barred = new Set<string>(BAR_KEYS)
  for (const [key, v] of Object.entries(merged)) {
    if (v === undefined) continue
    // 认领先于分流：clearBar 是**布尔**的行动条键，混在布尔那一支里就漏检了
    if (barred.has(key) && !a.bar && !o.bar) {
      throw new Error(
        `「${o.id}」带了 ${key} 却没人认领行动条 ——` +
        '要碰条就在这一手上写 `bar: true`（见 atlas 头注：条只许认领过的人碰）。')
    }
    if (typeof v === 'boolean') {
      if (!allow.has(key)) {
        throw new Error(
          `技能框架「${a.name}」不许带 ${key} 这一笔（${o.id}）——` +
          '要带就把它写进这一类的 allow 里，并说清这一类为什么该有它。')
      }
      ;(out as Record<string, unknown>)[key] = v
      continue
    }
    const band = a.effBand?.[key as NumericEffectKey] ?? EFF_BAND[key as NumericEffectKey]
    if (!band) {
      throw new Error(`技能框架「${a.name}」的 effect 里有 ${key}，但它没有效果带（${o.id}）`)
    }
    const num = Math.max(band[0], Math.min(band[1], v as number))
    ;(out as Record<string, unknown>)[key] = num
  }
  return out
}

/**
 * 天赋那一路的数夹法 —— **只过数字那一道闸**（全表 `EFF_BAND`，逐条夹回带内）。
 *
 * 天赋不走 `place()`：它不是「从技能表里挑的一手」，没有框架类可认，所以没有
 * `Arch.allow` 那一道布尔白名单，也**不过行动条三键的认领** —— 那三键的闸是
 * `duty.arch` 的事（「行动条归调度」），天赋是职能本身的本事，与那一栏正交
 * （见 roster 里 mefisa 那一条的注释）。
 *
 * 但「数字有上界」这一条对它一样成立：`TalentSpec.effect` 从前一个数都不过闸，
 * 谁在天赋里写 `shield: 1.5` 都照收。带上限是**全层**的规矩，不是只有技能那一格。
 *
 * 没带可夹的键一律**抛** —— 那是数据写错了，不是引擎该替它收拾。
 */
export function bandedEffect(e: SkillEffect): SkillEffect {
  const out: SkillEffect = {}
  for (const [key, v] of Object.entries(e)) {
    if (v === undefined) continue
    if (typeof v === 'boolean') {
      ;(out as Record<string, unknown>)[key] = v
      continue
    }
    const band = EFF_BAND[key as NumericEffectKey]
    if (!band) throw new Error(`天赋的 effect 里有 ${key}，但它没有效果带`)
    ;(out as Record<string, unknown>)[key] = Math.max(band[0], Math.min(band[1], v as number))
  }
  return out
}

/**
 * 把一个角色的一手技能**放进框架里**。
 * 数值先过本类的带：写超了会被夹回边界 —— 这样既保留了「谁比谁更重一点」，
 * 又不会出现某一手凭空比同类高出三倍的情况。
 * 唯一的例外是**明写 0**：那是「这一手不造成伤害」的意思（守护型的到达点、
 * 纯辅助与增益），不受带约束；倍率带管的是伤害，不是这一类手的存在与否。
 *
 * 附带的那几笔走 `tidyEffect` 那三道闸（布尔白名单 / 数字效果带 / 动条认领）。
 */
export function place(archId: string, o: PlaceOpt): SkillSpec {
  const a = ARCH[archId]
  if (!a) throw new Error(`技能框架里没有这一类：${archId}`)
  const raw = o.power ?? archPower(a)
  const power = raw === 0 ? 0 : Math.max(a.band[0], Math.min(a.band[1], raw))
  const merged = a.effect || o.effect ? { ...a.effect, ...o.effect } : undefined
  const effect = merged ? tidyEffect(a, o, merged) : undefined
  return {
    id: o.id,
    name: o.name,
    kind: a.slot,
    gate: a.gate,
    desc: o.desc,
    cost: o.cost ?? a.cost,
    power,
    axis: o.axis ?? a.axis ?? '破坏力',
    fx: o.fx ?? a.fx ?? 'slash',
    line: o.line ?? '',
    target: o.target ?? a.target,
    effect,
    turns: o.turns ?? a.turns,
    // 回合钟只有这一手自己能点名：架构骨架不带（那是「这个技能怎么打」，
    // 不是「这一手为什么在这个人身上要挂满一个回合」）
    rounds: o.rounds,
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
    // 召唤：整份照抄交回来的那一对（框架里没有「召唤」这一类，它是这一手的性质，不是打法）
    summon: o.summon,
    summonPack: o.summonPack,
    /** 这一手按框架里的哪一类打的（档案与作战面板都会写出来） */
    arch: a.id,
  }
}

/** 框架里一类的名字（界面挂牌用） */
export function archNameOf(id?: string): string | undefined {
  return id ? ARCH[id]?.name : undefined
}
