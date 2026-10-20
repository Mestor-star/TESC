/* ============================================================
   敌方指挥 · 行为规划（纯函数，只读盘面，不落任何副作用）
   ------------------------------------------------------------
   为什么单开一个文件：engine 的 enemyAct 是**执行**（扣钱、结算、记日志），
   这里只回答「这一手打谁、动哪一手、为什么」。

   ⚠️ **这里不许偷偷给敌方加输出。** 这一条是这一批改动里最要紧的一条纪律：
   改动前的 enemyAct 是「35% 出重手、否则普攻」（TUNING.foeHeavyRate 就是那个 0.35）。
   如果规划器每次都挑「打分最高的那一手」，敌方的出手就恒为重手 ——
   等于把 1.35 倍的输出悄悄塞给对面，而面板上一个数都没改。实测那一下
   把卷末胜率从 83% 压到 70%（同 seed 同场次）。所以分工是**死的**：
     · 规划器只决定「打谁」「哪一记重手」「要不要先治 / 先护」；
     · **多重手**这一枚硬币仍由 engine 掷，概率仍是 foeHeavyRate。
   于是「更聪明的敌人」不等于「更强的敌人」—— 聪明的部分落在选靶与选招上。

   三条底线：只读；可关（TUNING.foeAI 关掉就返回 null）；不抛（挑不出就 null）。
   ============================================================ */

import { TUNING } from './tuning'
import { axisHits, axisReadOf } from './derive'
import type { BattleState, Combatant, SkillSpec } from './types'

/** 这一手打算做什么 */
export type FoeMode = 'heal' | 'ward' | 'attack'

export interface FoePlan {
  mode: FoeMode
  /**
   * heal / ward 要立刻出的那一手。
   * attack 时**不给** —— 那一路由 engine 掷硬币（见下面 engine 的 foeHeavyRate）。
   */
  skillId?: string
  /** 打谁 / 治谁 / 护谁 */
  targetId: string
  /** attack 挑中的那一记「重手」（掷输就改打普攻，靶子不变） */
  heavyId?: string
  /** 这一手换没换招（上一手用过的那一招，这一手不再是最优） */
  swapped: boolean
  /** 写进战报的理由（一句话，念得出来） */
  note: string
}

const CN: Record<FoeMode, string> = { heal: '治疗', ward: '危机应对', attack: '攻击' }

/** 还站着的那些（不认已倒 / 蛰伏的） */
function live(list: Combatant[]): Combatant[] {
  return list.filter((c) => !c.down && c.gone <= 0)
}

/** 这个人的血还剩几成 */
function hpFrac(c: Combatant): number {
  return c.hpMax > 0 ? c.hp / c.hpMax : 1
}

/** 这一手是不是「治人的」—— 有 heal 且落点是自己人 */
function isHeal(k: SkillSpec): boolean {
  if (!k.effect?.heal) return false
  return k.target === 'allyOne' || k.target === 'allyAll' || k.target === 'self'
}

/** 这一手是不是「保命的」—— 护罩 / 护持 / 闪避 / 抬攻速那一路，落在自己身上 */
function isWard(k: SkillSpec): boolean {
  const e = k.effect
  if (!e) return false
  if (!(e.shield || e.ward || e.evade || e.atkUp || e.spdUp || e.taunt)) return false
  return k.target === 'allyOne' || k.target === 'allyAll' || k.target === 'self'
}

/**
 * 这一手此刻出不出得去 —— engine 的 legalSkills 的**简化版**。
 * 少抄几道（沉默 / 门 / 印记 / 连携参加者）是有意的：这里只要「别挑一手根本放不出来的」。
 * 挑错了也不致命 —— engine 拿到之后还要在 legalSkills 里再找一遍，找不到就退回老路。
 */
function usable(foe: Combatant, k: SkillSpec): boolean {
  if (k.gate || k.ult || k.summon) return false
  if ((foe.cds[k.id] ?? 0) > 0) return false
  return k.cost <= foe.tempo
}

/**
 * 一记重手的估值 —— 只要**排序**，不要精确伤害（那要 damageOf，带随机）。
 * 轴读数 × 倍率，对上目标破绽轴再加一份权重；已经打穿（broken > 0）的就减回去 ——
 * 壳都开了，再敲同一条轴是浪费。于是「换招」换出来的那一手是真的更贴，不是换个名字。
 */
function score(foe: Combatant, k: SkillSpec, t: Combatant): number {
  if (k.power <= 0) return 0
  const matched = !!t.guardAxis && axisHits(t.guardAxis, k.axis)
  let v = k.power * Math.max(1, axisReadOf(foe.axes, k.axis))
  if (matched) v *= t.broken > 0 ? 1 / (1 + TUNING.foeBreakWeight) : 1 + TUNING.foeBreakWeight
  return v
}

/**
 * 集火的焦点 —— **补刀式**：只咬已经跌破开咬线（TUNING.foeFocusBelow）的那一个。
 *
 * 为什么不是「从一开始就咬死血最少的」：那是完美集火，人手一少我方就崩，
 * 而这一轮作战屏不动，玩家手里没有对应的反制（拉人 / 换位 / 嘲讽都要 UI）。
 * 实测从第一拍咬死同一个人的版本把卷末胜率从 83% 压到 70%。
 * 改成「谁快不行了才一拥而上」之后，读起来也更像打仗 ——
 * 而且它天然给了玩家一个可读的信号：有人跌破六成，就是被围的开始。
 *
 * @returns 没人跌破开咬线时返回 undefined —— 那就照旧随机挑（它在乱打，玩家看得见）
 */
function pickFocus(s: BattleState): Combatant | undefined {
  const pool = live(s.allies)
  if (!pool.length) return undefined
  const weak = pool
    .filter((a) => hpFrac(a) <= TUNING.foeFocusBelow)
    .sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))
  return weak[0]
}

/**
 * 这一手怎么打 —— 规划的唯一出口。
 * @returns 没有可出的一手时返回 null（engine 退回改动前那套）
 */
export function planFoeAct(s: BattleState, foe: Combatant): FoePlan | null {
  if (!TUNING.foeAI) return null
  if (foe.down || foe.gone > 0) return null

  const theirs = live(s.allies)
  if (!theirs.length) return null
  const friends = live(s.enemies)
  const skills = foe.skills.filter((k) => usable(foe, k))

  /* ① 治疗：友军跌破门槛就把这一手交出去，排在集火之前 ——
     少一个人比多打一下要紧，这一点敌人也该懂。挑血最残的那个。
     条件是 TUNING.foeHealBelow（关掉 foeAI 就整段不走）。 */
  const healers = skills.filter(isHeal)
  if (healers.length) {
    const hurt = friends
      .filter((c) => c.hp < c.hpMax && hpFrac(c) <= TUNING.foeHealBelow)
      .sort((a, b) => hpFrac(a) - hpFrac(b) || a.id.localeCompare(b.id))
    const t = hurt[0]
    if (t) {
      const k = healers.find((x) => x.target === 'allyAll' || x.target === 'self') ?? healers[0]!
      return {
        mode: 'heal',
        skillId: k.id,
        targetId: t.id,
        swapped: true,
        note: CN.heal + '：' + t.name + ' 只剩 ' + Math.round(hpFrac(t) * 100) + '%，'
          + foe.name + ' 把这一手交去把人拉回来。',
      }
    }
  }

  /* ② 危机应对：自己跌破门槛。先保命再谈输出 ——
     这一条让「残血的首领」不是「快死的首领」，它会先给自己套一层。
     它同时也是我方的机会：敌方这一手没打人。 */
  if (hpFrac(foe) <= TUNING.foeCrisisAt) {
    const wards = skills.filter(isWard)
    if (wards.length) {
      const k = wards.sort(
        (a, b) => (b.effect?.shield ?? 0) - (a.effect?.shield ?? 0) || a.id.localeCompare(b.id),
      )[0]!
      return {
        mode: 'ward',
        skillId: k.id,
        targetId: foe.id,
        swapped: true,
        note: CN.ward + '：' + foe.name + ' 只剩 ' + Math.round(hpFrac(foe) * 100) + '%，'
          + '它先把这一层护在自己身上 —— 接下来那几下不会轻易落地。',
      }
    }
  }

  /* ③ 挑靶：集火认焦点（还站着就继续咬）；焦点没了、或没开集火就随机 ——
     随机那一路照旧不挑血最少的，玩家才看得见「它在乱打」。 */
  let target: Combatant | undefined
  if (TUNING.foeFocusOn) {
    /* 已经咬住的靶还站着、且还在开咬线以下 → 继续咬（「直到他倒下才改口」）；
       否则重新挑一次。补刀式集火在**咬住之后**才是不松口的 —— 见 pickFocus。 */
    const held = s.focus ? theirs.find((c) => c.id === s.focus) : undefined
    target = held && hpFrac(held) <= TUNING.foeFocusBelow ? held : pickFocus(s)
  }
  if (!target) target = theirs[Math.floor(Math.random() * theirs.length)]
  if (!target) return null

  /* ④ 选招：只挑**重手**（战技、有伤害、出得起）。打不打重手由 engine 掷硬币，
     这里不替它决定 —— 见文件头那一段纪律。同一招连着放要打折（换招）。 */
  const last = s.foeLast?.[foe.id]
  const ranked = skills
    .filter((k) => k.power > 0 && k.kind !== '普攻')
    .map((k) => {
      let v = score(foe, k, target)
      if (k.id === last) v *= TUNING.foeSwapPenalty
      return { k, v }
    })
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.k.id.localeCompare(b.k.id))
  const pick = ranked[0]
  const swapped = !!pick && pick.k.id !== last
  return {
    mode: 'attack',
    targetId: target.id,
    heavyId: pick?.k.id,
    swapped,
    note: (TUNING.foeFocusOn ? '集火 ' + target.name : '点名 ' + target.name)
      + '：' + foe.name + ' 把这一手压了过去'
      + (pick ? ' —— ' + pick.k.name : '')
      + (swapped ? '（它换了招：上一手那一下已经不好使了）。' : '。'),
  }
}

/** 这一手打算做什么 —— 屏上要挂牌时读它（下一批做演出的人用得上） */
export function foeModeName(m: FoeMode): string {
  return CN[m]
}
