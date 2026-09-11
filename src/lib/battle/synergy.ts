/* ============================================================
   羁绊 · 队伍协同与连携技
   ------------------------------------------------------------
   两套东西，走的是同一条口子：
     · 羁绊（队伍层）：按「同一出身的人在这支队伍里凑了几个」给档位加成 ——
       凑够 3 人开档、满 5 人封顶（TUNING.traitMax），人越齐越强（同金铲铲的羁绊计数）。
       档位取「已达成的最高一档」，不叠加。
     · 连携技（人层）：双人（心叶 × 露娜／会长／黑之魔王）与整队（恋兔队全员）
       各有一记合击。它**不由玩家主动点**：羁绊里每人各出一手，共鸣槽就会满 ——
       满了自己就接上（见 BONDS 与 engine 的 chargeLinks / fireLinks）。
       所以「恋兔队全员才触发」不是一句 UI 提示，而是槽要满编的人一人添一笔才满。
   加成只落在既有的常驻字段上（gearAtk / gearSpd / axes / evade），
   不改引擎口径：羁绊只是「这几个人站在一起时，本来就该更强」。
   数值与组合名一律取原文关系（弹痕、契约、婚约、队伍编制），不另立设定。
   ============================================================ */

import { OPERATOR_ID } from '../../data/castmeta'
import { ROSTER_GROUPS } from '../../data/roster'
import { TUNING } from './tuning'
import type { AxisKey, AxisSheet, Combatant, FxKind } from './types'

/**
 * 连携技的份量：**每位参加者**按本手那条轴出这么多份。
 * 一手连携的总额 = 0.75 ×（参加者各人该轴读数之和）—— 两个人接就是
 * 0.75 ×（甲 + 乙），整队接就是 0.75 × 全员之和。
 *
 * 为什么压这么低：连携**不占出手**。它是自己接上去的一记白送的合击，
 * 槽满了就来一下 —— 按普攻的倍率给，场上就成了「谁出手都顺便白打一拳」，
 * 玩家该点的那几手反倒不重要了。0.75 的意思是：它值得等，但等不来胜负。
 *
 * 出手者那一份走 SkillSpec.power，其余参加者那一份走 linkPow —— 两边必须同值，
 * 否则「谁先动」会改变同一记连携的总量。
 */
export const LINK_SHARE = 0.75

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
      + '加上从商会转来的小柴琳，同住恋兔宿舍的心叶与露娜，'
      + '以及「年年留级的老生」、「即使到现在，名义上也还是恋兔队资历最老的成员」——吴诗涵学姐。'
      + '（原文里「心叶可是恋兔队的一员！」是小柴对不认得他的人喊的）。名单上就这七个人。',
    ids: ['hikari', 'mefisa', 'nyau', 'xiaochai-lin', 'luna', 'youshihan', OPERATOR_ID],
    tiers: [
      { need: 3, atk: 0.06, spd: 0.04 },
      // 顶档就是天花板那一档（TUNING.traitMax）—— 恋兔队的顶档给得比别队厚：
      // 它是全表最强的队伍羁绊，也给那记整队连携垫底。
      { need: TUNING.traitMax, atk: 0.18, spd: 0.14, axes: { 意志力: 10 } },
    ],
    squadLink: {
      name: '恋兔队 · 全面出动',
      desc: '整队连携 —— 与双人那条不是一回事：不看一条共享的共鸣槽，'
        + '看的是名单上每个人自己的能量。各人出一手就给自己添一笔（防御也算），'
        + '全员都蓄满的那一刻，由当下出手的那一位带出去 ——'
        + '恋兔开路、梅芙收口、喵呜钻缝、小琳拆退路、心叶读位、露娜牵线、学姐压阵，'
        + '合击为一手，且之后几拍全队一起吃一份巨量加成（攻击、充能、减伤、闪避一并抬）。'
        + `（凑够 ${TUNING.traitMax} 个人就成立 —— 与档位天花板是同一个数：`
        + '名单七个人，一队上不了这么多，所以「到齐」指的是把最高那一档凑满）',
      line: '「队长！」「梅芙、喵呜、心叶！这里就交给你们了！」「了解！」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '破坏力', fx: 'slash', cost: 12, cd: 5,
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
      { need: TUNING.traitMax, axes: { 意志力: 14 }, evade: 0.08, atk: 0.08 },
    ],
  },
  {
    id: 'kaus',
    name: '卡乌斯学院',
    desc: '被放逐部队与名门千金同出一门：达娜厄、奈奈、蕾雅姐妹与伊西斯。',
    ids: group('kaus'),
    tiers: [
      { need: 3, axes: { 破坏力: 8 }, atk: 0.1 },
      { need: TUNING.traitMax, axes: { 破坏力: 14 }, atk: 0.16 },
    ],
  },
  {
    id: 'corp',
    name: 'Corporations',
    desc: '第 6 区的巨企一系：警备队长、片羽、代理会长、文学少女 —— 他们的手段是制度。',
    ids: group('corp'),
    tiers: [
      { need: 3, axes: { 反现实亲和: 8 }, spd: 0.08 },
      { need: TUNING.traitMax, axes: { 反现实亲和: 14, 意志力: 8 }, spd: 0.14 },
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

/**
 * 黄金狮子那一记双人连携的 id。
 * 引擎单独认它一处：顶着黄金狮子形态时，**每一手攻击**都自己接上这一记，
 * 不走共鸣槽（见 engine 的 fireLionLink）。所以这个键不许改。
 */
export const LION_PAIR_ID = 'golden-lion'

export const PAIRS: PairBond[] = [
  {
    id: LION_PAIR_ID,
    name: '黄金狮子',
    desc: '【No.8288「黄金狮子」】—— 心叶 × 露娜合击的编号名（异法）。'
      + '原文那一战里，那道金色的光「简直，就像被读心了一样」地游走于视野之外；'
      + '丝线拉住他不让他沉下去，低语替他读出对方往哪躲。',
    a: OPERATOR_ID, b: 'luna',
    atk: 0.1, spd: 0.08,
    link: {
      name: '黄金狮子',
      desc: '两人同时出手：她把他甩出去，他在半空里听见对方心里喊的那一声。合击由两人的对应轴相加。',
      line: '「「我！」」「「会保护你！」」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '反现实亲和', fx: 'noise', cost: 6, cd: 4,
    },
  },
  {
    id: 'prose',
    name: '如散文般',
    desc: '会长的弹痕「如散文般」—— 能向过去开枪的那一页纸。'
      + '灵魂蓄积器差一点把他吞掉的那一瞬，是她把他拎出来的，顺手让他做了自己的「狗」；'
      + '此后这层关系一直挂着，谁也没解开。',
    a: OPERATOR_ID, b: 'alive-anatolia',
    atk: 0.06, axes: { 反现实亲和: 10 },
    link: {
      name: '如散文般 · 补笔',
      desc: '她的弹痕「如散文般」能向过去开枪：那些他没能赶上的瞬间，由她一页一页补回来。',
      line: '「——你要不要成为我的猎犬？」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '反现实亲和', fx: 'seal', cost: 5, cd: 4,
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
      line: '「要是你最终没能够停滞终末的话……在世界毁灭之前——」「——我们结婚吧。」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '意志力', fx: 'noise', cost: 5, cd: 4,
    },
  },
  {
    id: 'sakura-afterimage',
    name: '樱之残影',
    desc: '队长的弹痕「樱之残影」—— 一把从掌心召唤出来的白色吉他。'
      + '他是她亲手收下的部下（「不，是仆人」），也是她一句话就带进委员会的人；'
      + '那一手挥下去，等于把队长的调子接到他这边来。',
    a: OPERATOR_ID, b: 'hikari',
    atk: 0.1, axes: { 意志力: 8 },
    link: {
      name: '樱之残影 · 白色吉他',
      desc: '队长起了个前奏，他顺着那声把整段收掉 —— 参加的两人各按同一轴出力。',
      line: '「要上了哦——樱之残影！」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '破坏力', fx: 'guitar', cost: 6, cd: 4,
    },
  },
  {
    id: 'shamshir',
    name: '沙姆希尔',
    desc: '喵呜的弹痕「沙姆希尔」—— 把子弹与贴纸的位置对调。'
      + '「靠着成为了我妹妹的喵呜的弹痕——沙姆希尔——其将子弹与贴纸交换位置的能力」'
      + '（原文里那一趟书架曼荼罗的回程就是靠它眨眼间走完的）。',
    a: OPERATOR_ID, b: 'nyau',
    spd: 0.08, axes: { 反现实亲和: 8 },
    link: {
      name: '沙姆希尔 · 换位',
      desc: '他读准了要落在哪，小柴便把那一发直接换到对面身上。',
      line: '「——沙姆希尔！」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '反现实亲和', fx: 'seal', cost: 5, cd: 4,
    },
  },
  {
    id: 'eight-legged-horse',
    name: '八脚马',
    desc: '梅芙的弹痕「八脚马」—— 一头不讲道理的黏液巨兽，听话得离谱。'
      + '她一边嫌麻烦一边照旧由她来收口，他负责把前面的账算清楚。',
    a: OPERATOR_ID, b: 'mefisa',
    axes: { 意志力: 8 }, spd: 0.05,
    link: {
      name: '八脚马 · 收口',
      desc: '她放出八脚马把场子围住，他趁那一下把该了结的收掉。',
      line: '「……事到如今也没办法了呢——八脚马！」',
      power: LINK_SHARE, linkPow: LINK_SHARE, axis: '意志力', fx: 'blast', cost: 5, cd: 4,
    },
  },
]

/* ============================================================
   对面那一记连携 —— 只有这一条
   ------------------------------------------------------------
   上面那两套（TRAITS / PAIRS）都是**我方**的：名单取自 s.allies，
   参加者得在自己的队伍里。骷髅假面之男与他的亡灵军团不在我方 ——
   他们站在对面，而且在那个世界里他们已经不在了。所以这一记单开一份，
   由引擎照着黄金狮子那一处的写法自己接（见 engine 的 fireRivalLink）。

   对面**只有这一条**，而且只有那两个人接得起来：异次元的言万心叶 ×
   异次元的蕾雅。原文依据是 arms.ts 的两条：
     · 「a Session.」——「两枚成对的戒指相互共鸣，能让佩戴者灵魂共奏、合而为一」；
     · 蕾雅的「热沃当的少女」——「直到她在篝火之国与心叶立下「a Session.」的共奏之约，
       这把锯子才第一次学会为守护而转动」。
   在那个「露娜小姐已死」的世界里，心叶没能停下终末，却照样与她立过那个约 ——
   所以他把亡灵军团喊回来的那一刻，那两枚戒指又对上了。

   它不是「凑够人就有」的整队连携，也不是「打熟了自然接得上」的共鸣槽：
   是两个人之间的一件既定的事。所以不看槽、不看人数，只看这两个人
   是不是都还站着，以及它自己的冷却（按他们的出手次数减）。
   ============================================================ */
export const RIVAL_LINK = {
  id: 'rival-session',
  name: '共奏 · a Session.',
  /** 执手的那一位 —— 本体的档案 id（异次元的言万心叶） */
  a: 'masked-kokonoha',
  /** 另一个参加者 —— 被唤上来的那一位（异次元的蕾雅・库尔・杜・琉米爱尔） */
  b: 'reiya',
  /** 冷却：按这两个人自己的出手次数减（见 engine 的 fireRivalLink） */
  cd: 3,
  link: {
    name: '共奏 · a Session.',
    desc: '两枚成对的戒指相互共鸣 —— 灵魂共奏、合而为一。'
      + '那一刀被接住的那一瞬，锯齿上的守护与低语读出的位置合在同一个方向上。'
      + '（原文口径见 arms.ts「a Session.」与「热沃当的少女」两条。）',
    line: '「——共奏。」「嗯。」',
    power: LINK_SHARE,
    linkPow: LINK_SHARE,
    axis: '反现实亲和' as AxisKey,
    fx: 'noise' as FxKind,
    cost: 0,
    cd: 3,
  },
}

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
   不由玩家点，而是「出手自己接上」。两条口径分开（见 engine 的 chargeGauge / linkReady）：
     · 双人羁绊 —— 一条共享的槽（共鸣），参加者谁出一手都添一笔（防御也算）；
     · 整队连携（特殊连携，Bond.squad）—— 不看共享的槽，看**名单上每个人自己的能量**：
       一人一条，别人替他攒不了，全员都满、且全员都还在场上，才成立。换来的不是
       补一脚，是全队一起吃的那几拍巨量加成。
   两条都要「全员到场」；某个人倒了、被归档收走了，这一手就凑不齐。
   接完不清零：参加者按「他们也出了场」各添一笔（见 engine 里 fireLinks 末的补笔）——
   否则连携就是一次性消耗，接得越勤越像白接。
   这笔账只在手册里讲（见 manual 的「作战现场」），不写进观测频道 ——
   战报是现场记录，不该混进机制说明。
   ============================================================ */

/* ============================================================
   羁绊深度 —— 终端里一点一点攒起来的那个数
   ------------------------------------------------------------
   引导里梅芙说过「人跟人熟不熟，是会影响打起来的配合的」。
   在那之前这句话是空头支票：羁绊只在档案里当个读数看，上了战场一点用没有。
   现在它落在两处：
     · 连携技的共鸣槽蓄得更快（主要收益：合击来得更早，这是攒羁绊最大的回报）；
     · 本人五轴里的「意志力 / 反现实亲和」跟着抬一点（相处久了，人也硬气起来）。
   算的是**参加者里跟你最生疏的那一个** —— 搭伙这件事，快慢由最生的那节说了算。
   操作员本人不算数：他不是一段关系，他就是你。
   ============================================================ */

/** 羁绊档位：到了 at 这一档，共鸣槽按 cut 缩短 */
export const BOND_TIERS = [
  { at: 45, cut: 1, name: '过命的交情' },
  { at: 75, cut: 2, name: '生死与共' },
] as const

/** 这份交情能把共鸣槽缩短几拍（0 = 还没到档） */
export function bondCut(v: number): number {
  let cut = 0
  for (const t of BOND_TIERS) if (v >= t.at) cut = Math.max(cut, t.cut)
  return cut
}

/** 离下一档还差多少（界面挂牌用；已到顶则 null） */
export function bondNext(v: number): { at: number; left: number; name: string } | null {
  const t = BOND_TIERS.find((x) => v < x.at)
  return t ? { at: t.at, left: t.at - v, name: t.name } : null
}

/** 羁绊给本人的五轴加成 —— 有上限，攒不出怪物 */
export function bondAxes(v: number): Partial<AxisSheet> {
  const will = Math.min(8, Math.floor(v / 12))
  const aff = Math.min(6, Math.floor(v / 16))
  if (!will && !aff) return {}
  return { 意志力: will, 反现实亲和: aff }
}

/**
 * 一条连携的共鸣槽要几拍 —— 由「跟你最生疏的那个参加者」的羁绊决定。
 * @param members 参加者 id（含操作员则自动略过）
 * @param bond    羁绊读数（0~100）
 */
export function linkNeed(members: string[], base: number, bond?: Record<string, number>): number {
  if (!bond) return base
  const others = members.filter((id) => id !== OPERATOR_ID)
  if (!others.length) return base
  const weakest = Math.min(...others.map((id) => bond[id] ?? 0))
  return Math.max(2, base - bondCut(weakest))
}

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
  /**
   * 整队连携（特殊连携）。
   * 与双人那条的分野在**槽记在谁头上**：
   *   双人 —— 一条共享的槽，谁出手都添一笔，满了就接（见 engine 的 s.link）。
   *   整队 —— 每人一条自己的能量，**全员都满**才成立（见 engine 的 s.gauge）。
   * 所以整队那条不是「凑够拍数」，是「每个人都把自己那份攒满」。
   */
  squad?: boolean
}

/*
  一对搭档的共鸣槽底数。
  从 3 提到 4 是为了给羁绊留出「缩短」的余地：3 拍再缩就只剩 2 拍，
  两档羁绊（45 / 75）会缩到同一个数上 —— 那这一档就是白设的。
  底数 4 之下：没交情 4 拍、过命 3 拍、生死与共 2 拍，档档分得开。
  （没交情比原先的 3 拍慢一拍：合击本来就是羁绊给的，不该是白送的。）
*/
const PAIR_NEED = 4

/**
 * 本场在场的连携羁绊（双人 + 整队）。
 * @param bond 羁绊读数 —— 给了就按交情缩短共鸣槽（见 linkNeed）
 */
export function bondsOf(ids: string[], bond?: Record<string, number>): Bond[] {
  const out: Bond[] = []
  const on = new Set(ids)
  for (const p of pairsOf(ids)) {
    const members = [p.a, p.b].filter((x) => on.has(x))
    out.push({
      id: p.id, name: p.name, members,
      need: linkNeed(members, PAIR_NEED, bond),
      link: { ...p.link, linkPow: p.link.linkPow },
    })
  }
  for (const t of traitsOf(ids)) {
    const l = t.trait.squadLink
    if (!l) continue
    // 「全员到场」按档位天花板封顶（TUNING.traitMax）—— 名单七个人、最高档只要五个，
    // 真要「一个不缺」这条羁绊就永远亮不起来：到齐 = 把最高那一档凑满。
    const cap = Math.min(t.trait.ids.length, TUNING.traitMax)
    if (t.members.length < cap) continue
    out.push({
      id: `${t.trait.id}-full`, name: l.name, members: t.members,
      need: linkNeed(t.members, cap, bond),
      link: { ...l },
      squad: true,
    })
  }
  return out
}

/**
 * 把羁绊加成落到上阵者身上（只落常驻字段）。
 * 连携技不再进技能表 —— 它由共鸣槽自动触发（见 engine 的 chargeLinks / fireLinks）。
 * @param targets  要落加成的上阵者
 * @param squadIds 本场的队伍名单（换装重建单人时由调用方传全队，否则会算漏人）
 * @param bond     羁绊读数（0~100）—— 给了再叠一层「交情」的五轴加成（见 bondAxes）
 */
export function applySynergies(
  targets: Combatant[], squadIds?: string[], bond?: Record<string, number>,
): void {
  const ids = squadIds ?? targets.map((c) => c.id)
  const traits = traitsOf(ids)
  const pairs = pairsOf(ids)

  for (const c of targets) {
    let atk = 0
    let spd = 0
    let evade = 0
    const axes: Partial<Record<AxisKey, number>> = {}
    const names: string[] = []

    // 交情：这一栏是攒出来的，不是站在一起就有的
    const own = bond?.[c.id] ?? 0
    const bAxes = bondAxes(own)
    if (Object.keys(bAxes).length) {
      names.push(`羁绊 ${own}`)
      for (const [k, v] of Object.entries(bAxes)) {
        axes[k as AxisKey] = (axes[k as AxisKey] ?? 0) + (v as number)
      }
    }

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
