/* ============================================================
   战斗语音 · 台词池与联动台词
   ------------------------------------------------------------
   两件事：
     1. **多说几句**。同一手技能不该每次都是同一句话 —— 每个技能可以有
        一组台词，出手时挑一句（按「这一手是谁打的、打的是谁、结果如何」选）。
     2. **联动台词**。熟人之间接得上：上一个人刚出了什么手，下一个人的台词
        就不是常态那一句。心叶甩完一招，露娜接话的语气和陌生人完全不同 ——
        「认识的、熟悉的角色才有的特殊台词」。
   熟悉与否不发散判定，只看既有关系：
     · 羁绊（PAIRS：黄金狮子 / 如散文般 / 婚约者）
     · 同队（ROSTER_GROUPS 里的同一编制，含恋兔队）
     · 本场成立的队伍羁绊（synergy.ts 的 traitsOf）
   台词一律按原文关系写（称呼、口癖、相处方式），不新造设定。
   ============================================================ */

import { OPERATOR_ID } from '../../data/castmeta'
import { ROSTER_GROUPS } from '../../data/roster'
import { PAIRS } from './synergy'

/** 事件（本次出手）的上下文 —— 只取判定台词要用到的那几样 */
export interface BanterCtx {
  actorId: string
  /**
   * 刚才出手的队友（同阵营，新的在前，不含自己）。
   * 看最近几手而不是只看上一手：接话是「顺着前一手说」，
   * 中间夹着敌方回合或第三人时，仍然接得上。
   */
  recent?: Array<{ id: string; skill: string }>
  /** 这一手打出去了多少（0 = 没造成伤害） */
  dmg?: number
  /** 这一手把目标打倒了 */
  down?: boolean
  /** 打空了 */
  miss?: boolean
}

/* ---------- 1. 台词池：同一个技能，多句可选 ---------- */

/**
 * 按**技能 id** 精确指定的备选台词（少数几手值得专门写）。
 * 键取技能 id 而非招式名 —— 名册的技能 id 是稳定的。
 */
export const LINE_POOL: Record<string, string[]> = {
  'hikari-burst': ['「你以为……我是谁啊……！」', '「——只要我还活着，就不会让你伤害到大家——！」'],
  'hikari-peer': ['「就此——结束吧！！」', '「——樱之残影。」'],
  'luna-blade': ['「你这家伙！恶心死了！去死！」', '「但这个孩子不一样。他只是个普通的孩子。一直以来，他遭遇的都是痛苦和磨难。从今往后，他必须幸福。如果你们要阻碍这一切——我绝不允许。」'],
  'mefisa-cannon': ['「走吧，八脚马！」', '「……哼。在那里吗！」'],
  'nyau-void': ['「没问题！小柴对力量很有自信！」', '「是！小柴保证完成任务！」'],
  'alive-edit': ['「——你要不要成为我的猎犬？」', '「我希望你保护言万同学。」'],
  'kuro-burst': ['「你的影子，我收下咯。」', '「来吧……沙与风！」'],
}

/**
 * 按**角色**写的备选台词。
 * 招式 id 会随时期变（操作员的手枪与戒指各是一份表），角色却是同一个人 ——
 * 所以「这个人平时怎么说话」挂在这里，同一手每次挑一句，不至于句句复读。
 */
export const CHAR_LINES: Record<string, string[]> = {
  [OPERATOR_ID]: [
    '「露娜小姐，退后！」',
    '「露娜小姐！请退后！」',
    '「——破坏掉！！」',
    '「露娜小姐。拜托了。」',
  ],
  hikari: [
    '「——4号打手，恋兔光！要上了！」',
    '「你们几个快走。我把这个杂鱼收拾掉，很快就能追上你们。」',
    '「现在一秒都不能浪费！快走！」',
    '「天上天下唯我独尊！过去未来独一无二的最强美少女──恋兔光！」',
  ],
  luna: [
    '「这里就交给我吧小主人。话说这种话好像死亡Flag哦（笑）。」',
    '「把手放开！我来！」',
    '「我养育长大的小主人才不会输呢。」',
    '「你看吧？我就说过的，我家小主人一定没问题的。」',
  ],
  mefisa: [
    '「队长！那家伙有物理抗性——」',
    '「言万同学！配合我！」',
    '「别给他开口的机会！连续进攻」',
    '「队长！笨蛋！」',
  ],
  nyau: ['「小柴喵呜，登场！」', '「沙姆希尔！」', '「现在还不能乱动哦！」'],
  'xiaochai-lin': ['「不好意思要打扰你们的兴致了。我要占用你们一点时间。」', '「少啰嗦。我这人一被抱怨就会立刻干劲全无。而且也没办法吧，回收这家伙可要了不少时间。」'],
  'alive-anatolia': ['「呵呵，你真的像只可爱的小狗呢。好啦人心掌握大成功～～距离你成为我的忠犬也不远了哦。」', '「这一页，我替你写。」', '「已经发生过的事，我可以再写一遍。」'],
  'kuro-no-maou': ['「你……就由我在这里终结。」', '「——还没完呢，上吧！！」', '「——这就是命运啊！」'],
  'danae-whitmore': ['「我是你的护卫，所以，放心吧。」', '「那么，最后一击——」'],
  reiya: ['「——搞定。」', '「喝啊啊啊啊！」'],
  'isis-halid': ['「哈——好麻烦啊。吃『魔』去吧！——『饕餮 』！」', '「娜蒂雅妹妹，这么急是要去哪呀。坦白从宽，是不是有事瞒着姐姐我呀——☆」'],
}

/* ---------- 2. 联动台词：熟人接得上 ---------- */

interface FollowLine {
  /** 谁接话（角色 id） */
  by: string
  /** 前一手是谁打的；'*' = 只要是这个人就行 */
  after: string
  /** 前一手技能 id 的正则（缺省 = 任意一手） */
  skill?: RegExp
  /** 这一手是不是「打空了 / 没打出伤害」才说的 */
  when?: 'hit' | 'miss' | 'any'
  /** 接的这句 */
  line: string
}

/**
 * 联动台词表。写的是「上一个人刚做了什么 → 这个人接什么」，
 * 关系取自原文（婚约、契约、队长与副官、搭档），不是随机搭对。
 */
const FOLLOW: FollowLine[] = [
  /* 心叶 → 露娜：黄金狮子，一个把她甩出去、一个在半空听对方的心声 */
  { by: 'luna', after: OPERATOR_ID, skill: /读心|低语/, when: 'any', line: '「集中精神，小主人！我也撑不了太久！」' },
  { by: 'luna', after: OPERATOR_ID, when: 'hit', line: '「小主人，真能干呢。」' },
  { by: 'luna', after: OPERATOR_ID, when: 'miss', line: '「小主人！没事吧？」' },
  /* 露娜 → 心叶 */
  { by: OPERATOR_ID, after: 'luna', when: 'any', line: '「上吧，露娜小姐！」' },
  { by: OPERATOR_ID, after: 'luna', when: 'hit', line: '「哈啊……哈啊……呼……干得漂亮，露娜小姐……」' },
  /* 心叶 → 会长：如散文般 */
  { by: 'alive-anatolia', after: OPERATOR_ID, when: 'any', line: '「好啊。到那时，就停战吧。」' },
  { by: 'alive-anatolia', after: OPERATOR_ID, when: 'miss', line: '「——言万同学。请你现在立刻跪下来，亲吻我的脚尖。」' },
  { by: OPERATOR_ID, after: 'alive-anatolia', when: 'any', line: '「咕呜呜……完全被玩弄了。」' },
  /* 心叶 → 黑之魔王：婚约者 */
  { by: 'kuro-no-maou', after: OPERATOR_ID, when: 'any', line: '「心叶！我们结婚吧！」' },
  { by: 'kuro-no-maou', after: OPERATOR_ID, when: 'hit', line: '「怎么能哀求啊。你可是勇者哦，面对我这样的魔王。」' },
  { by: OPERATOR_ID, after: 'kuro-no-maou', when: 'any', line: '「……魔王。是你……在攻击大家吗？」' },
  /* 恋兔队内部：队长 / 副官 / 护卫 / 小柴琳 */
  { by: 'hikari', after: 'mefisa', when: 'any', line: '「梅芙、喵呜、心叶！这里就交给你们了！」' },
  { by: 'mefisa', after: 'hikari', when: 'any', line: '「——真正的决胜时刻，从现在开始。」' },
  { by: 'nyau', after: 'hikari', when: 'any', line: '「队长！小柴绝对要赢！燃烧吧！呜哦哦哦哦！」' },
  { by: 'hikari', after: 'nyau', when: 'any', line: '「梅芙。喵呜。你们俩扣工资哦。」' },
  { by: 'xiaochai-lin', after: 'mefisa', when: 'any', line: '「──把那家伙扯下来痛扁一顿。我就是为此而来的。」' },
  { by: 'mefisa', after: 'xiaochai-lin', when: 'any', line: '「就这样把他拖进海里！」' },
  /* 恋兔光 ↔ 露娜 / 梅芙：同一所学园里长起来的战友 */
  { by: 'luna', after: 'hikari', when: 'any', line: '「……那你想怎样？！要放弃吗？！那才是最不可能的吧。那可是我们啊！」' },
  { by: 'hikari', after: 'luna', when: 'any', line: '「天上天下唯我独尊！过去未来独一无二的最强美少女──恋兔光！」' },
  { by: 'mefisa', after: OPERATOR_ID, when: 'any', line: '「等会再解释！观众席的人员太密集，根本没法战斗！我们在大舞台这边的人必须掩护他们！」' },
  { by: OPERATOR_ID, after: 'mefisa', when: 'any', line: '「了解！」' },
  /* 卡乌斯学院：达娜厄 / 奈奈 / 蕾雅姐妹 / 伊西斯（被放逐部队与名门同门） */
  { by: 'isis-halid', after: 'reiya', when: 'any', line: '「出发吧——号外号外。」' },
  { by: 'reiya', after: 'isis-halid', when: 'any', line: '「好的！——热沃当的少女！」' },
]

/** 同一编制里的都算熟悉（恋兔队、苍之学园、卡乌斯、Corporations） */
const GROUP_OF: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const g of ROSTER_GROUPS) for (const id of g.ids) m[id] = g.key
  return m
})()

/** 熟人：婚约 / 羁绊 / 同一编制，三者之一即可 */
export function familiar(a: string, b: string): boolean {
  if (!a || !b || a === b) return false
  if (GROUP_OF[a] && GROUP_OF[a] === GROUP_OF[b]) return true
  return PAIRS.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))
}

/* ---------- 3. 挑句子 ---------- */

let seed = 0
/** 出手时的随机挑句：同一手不总说同一句，但也不必可复现（战斗本就带骰） */
function pick(pool: string[], key: string): string {
  seed = (seed + 1) % 9973
  const i = Math.floor(Math.random() * pool.length) + key.length + seed
  return pool[i % pool.length]
}

/**
 * 这一手该说什么。
 * 优先联动台词（熟人接得上），其次技能自己的台词池，最后回落到原台词。
 * @param ctx 出手上下文
 * @param base 技能自带的台词（无池或池里为空时用它）
 */
/** 最近几手之内有没有谁的接话能用上（新的优先） */
const RECENT_LOOKBACK = 3

export function lineFor(ctx: BanterCtx, base: string): string {
  const { actorId, recent, dmg, miss } = ctx
  const outcome: 'hit' | 'miss' = miss || !dmg ? 'miss' : 'hit'

  for (const r of (recent ?? []).slice(0, RECENT_LOOKBACK)) {
    if (!familiar(actorId, r.id)) continue
    const hit = FOLLOW.filter(
      (f) => f.by === actorId && (f.after === r.id || f.after === '*') && (!f.skill || f.skill.test(r.skill)),
    )
    if (!hit.length) continue
    const exact = hit.filter((f) => f.when === outcome)
    const any = hit.filter((f) => !f.when || f.when === 'any')
    const pool = exact.length ? exact : any.length ? any : []
    if (pool.length) return pick(pool.map((f) => f.line), actorId)
  }
  return base
}

/**
 * 台词池里给这一手挑一句。
 * 先看该技能有没有专写的备选，再看这个人平时怎么说话 —— 都没有就原样返回。
 * 与 lineFor 分开：这个是「同一个技能多说几句」，不涉及前后手。
 */
export function poolFor(actorId: string, skillId: string, base: string): string {
  const pool = LINE_POOL[skillId] ?? CHAR_LINES[actorId]
  if (!pool?.length) return base
  const all = base ? [base, ...pool] : pool
  return pick(all, skillId + actorId)
}
