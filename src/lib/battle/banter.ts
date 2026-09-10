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
     · 羁绊（PAIRS：黄金之兔 / 会长与她的狗 / 婚约者）
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
  'hikari-burst': ['「——这是我非做到不可的事。」', '「别拦我。这一次谁也别拦我。」'],
  'hikari-peer': ['「区区神明，别太嚣张了！」', '「让开——不然连你一起。」'],
  'luna-blade': ['「丝线，收紧。」', '「——别动，会断的。」'],
  'mefisa-cannon': ['「主炮，装填。」', '「弹道清零。放。」'],
  'nyau-void': ['「小柴要钻进去咯！」', '「缝在这儿——找到了！」'],
  'alive-edit': ['「这一页，我替你写。」', '「已经发生过的事，我可以再写一遍。」'],
  'kuro-burst': ['「——退后。」', '「别挡在路上。」'],
}

/**
 * 按**角色**写的备选台词。
 * 招式 id 会随时期变（操作员的手枪与戒指各是一份表），角色却是同一个人 ——
 * 所以「这个人平时怎么说话」挂在这里，同一手每次挑一句，不至于句句复读。
 */
export const CHAR_LINES: Record<string, string[]> = {
  [OPERATOR_ID]: [
    '「——你心里那句，我听见了。」',
    '「别装了。你嘴上说的和心里想的不是一句。」',
    '「往左。你刚才想的是往左。」',
    '「……这次我听清了。」',
  ],
  hikari: [
    '「要上咯，我的吉他——」',
    '「别死啊。谁准你们死了！」',
    '「站到我后面去。」',
    '「——不够响。再来。」',
  ],
  luna: [
    '「——抓紧了。」',
    '「丝线拉得住你。」',
    '「你的关节，现在归我管。」',
    '「摔下去之前，先抓住这个。」',
  ],
  mefisa: [
    '「弹道修正。」',
    '「我在你后面。往前走。」',
    '「这一枪不会偏。」',
    '「队长身后，照旧由我来收。」',
  ],
  nyau: ['「小柴也上！」', '「跟着队长的！」', '「缝在这里，我钻了哦。」'],
  'xiaochai-lin': ['「墙拆了哦。」', '「这条线，划掉。」'],
  'alive-anatolia': ['「叫得不错。——继续。」', '「这一页，我替你写。」', '「已经发生过的事，我可以再写一遍。」'],
  'kuro-no-maou': ['「——说好了的。你可别先倒下。」', '「你不够重。」', '「看好了。」'],
  'danae-whitmore': ['「被放逐的部队，也不许后退。」', '「列队。压上去。」'],
  reiya: ['「这一刀，不给第二次。」', '「斩断就好。」'],
  'isis-halid': ['「——姐姐打完了，换我。」', '「名门的刀，也不是摆设。」'],
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
  /* 心叶 → 露娜：黄金之兔，一个把她甩出去、一个在半空听对方的心声 */
  { by: 'luna', after: OPERATOR_ID, skill: /读心|低语/, when: 'any', line: '「听见了。——那我就往那儿打。」' },
  { by: 'luna', after: OPERATOR_ID, when: 'hit', line: '「你读你的，我打我的。凑一起正好。」' },
  { by: 'luna', after: OPERATOR_ID, when: 'miss', line: '「偏了？再来一次，这回我拉紧一点。」' },
  /* 露娜 → 心叶 */
  { by: OPERATOR_ID, after: 'luna', when: 'any', line: '「丝线还在——那我就不用看路了。」' },
  { by: OPERATOR_ID, after: 'luna', when: 'hit', line: '「你甩得动，我就接得住。」' },
  /* 心叶 → 会长：会长与她的狗 */
  { by: 'alive-anatolia', after: OPERATOR_ID, when: 'any', line: '「叫得不错。——继续。」' },
  { by: 'alive-anatolia', after: OPERATOR_ID, when: 'miss', line: '「连一句都听不准？再练。」' },
  { by: OPERATOR_ID, after: 'alive-anatolia', when: 'any', line: '「……会长。这次我听清了。」' },
  /* 心叶 → 黑之魔王：婚约者 */
  { by: 'kuro-no-maou', after: OPERATOR_ID, when: 'any', line: '「——说好了的。你可别先倒下。」' },
  { by: 'kuro-no-maou', after: OPERATOR_ID, when: 'hit', line: '「这一下，算在约定里。」' },
  { by: OPERATOR_ID, after: 'kuro-no-maou', when: 'any', line: '「——我们的账，还没算完呢。」' },
  /* 恋兔队内部：队长 / 副官 / 护卫 / 小柴琳 */
  { by: 'hikari', after: 'mefisa', when: 'any', line: '「掩护得不错。接下来交给我。」' },
  { by: 'mefisa', after: 'hikari', when: 'any', line: '「——队长身后，照旧由我来收。」' },
  { by: 'nyau', after: 'hikari', when: 'any', line: '「小柴也上！跟着队长的！」' },
  { by: 'hikari', after: 'nyau', when: 'any', line: '「喵呜，别钻太深。」' },
  { by: 'xiaochai-lin', after: 'mefisa', when: 'any', line: '「副官，墙我拆了哦。」' },
  { by: 'mefisa', after: 'xiaochai-lin', when: 'any', line: '「……拆完记得砌回去。」' },
  /* 恋兔光 ↔ 露娜 / 梅芙：同一所学园里长起来的战友 */
  { by: 'luna', after: 'hikari', when: 'any', line: '「——队长打头，我收尾。」' },
  { by: 'hikari', after: 'luna', when: 'any', line: '「丝线拉住了？那就别松手。」' },
  { by: 'mefisa', after: OPERATOR_ID, when: 'any', line: '「心叶，后面交给我。」' },
  { by: OPERATOR_ID, after: 'mefisa', when: 'any', line: '「梅芙 —— 那我往前一步。」' },
  /* 卡乌斯学院：达娜厄 / 奈奈 / 蕾雅姐妹 / 伊西斯（被放逐部队与名门同门） */
  { by: 'isis-halid', after: 'reiya', when: 'any', line: '「——姐姐打完了，换我。」' },
  { by: 'reiya', after: 'isis-halid', when: 'any', line: '「伊西斯，别站太前。」' },
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
