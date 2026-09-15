/* ============================================================
   任务作战 · 引擎（纯函数，就地推进，无 React、无副作用）
   ------------------------------------------------------------
   行动条制（ATB）：
     每人一条 0 → 100% 的行动条，按「速度」逐窗口充能；
     满 100% 才能行动，出手后扣除整整一条、余量保留。
     速度由敏捷度导出，并被技能与装具改写 —— 所以快的人
     在同一段时间里能多打好几手，慢的人只能看着。
   六道指令（顺序即 UI 顺序）：
     攻击 / 技能 / 道具 / 防御 / 更换装备 / 战略撤退
     其中「更换装备」不消耗回合（执行委员长口径）。
   ============================================================ */

import { LION_PAIR_ID, RIVAL_LINK, applySynergies, bondFloorOf, bondsOf } from './synergy'
import type { Bond } from './synergy'
import { lineFor, poolFor } from './banter'
import { TUNING } from './tuning'
import {
  RIVAL_TAG, combatantOf, enemiesOf, minionOf, nextBossOf, rivalArchiveIdOf, rivalOf, speedOf,
} from './derive'
import { namedBossOf } from './bosses'
import { dutyOf } from './duty'
import { GEAR_OF, ITEM_OF } from './gear'
import { isDebuff, isSpec, toneOf } from './types'
import type {
  AxisKey, AxisSheet, BattleState, BuffKey, Combatant, LogEntry, PassiveSpec, SkillSpec,
  TalentSpec, TalentTrigger, EnemyIntent,
} from './types'
import type { Mission } from '../../data/types'

const AFFINITY: AxisKey = '反现实亲和'
const TERMINAL = { id: 'terminal', name: '停滞观测终端' }

export type Command =
  | { t: 'atk'; targetId: string }
  | { t: 'skill'; skillId: string; targetId?: string }
  | { t: 'item'; itemId: string; targetId?: string }
  | { t: 'guard' }
  | { t: 'equip'; gearId: string | null }
  | { t: 'flee' }

/* ---------- 基础查询 ---------- */

export function allOf(s: BattleState): Combatant[] {
  return [...s.allies, ...s.enemies]
}

export function find(s: BattleState, id: string): Combatant | undefined {
  return allOf(s).find((c) => c.id === id)
}

/** 还在场上的人：没倒，也没因合体蛰伏 */
export function aliveOf(list: Combatant[]): Combatant[] {
  return list.filter((c) => !c.down && c.gone <= 0)
}

/** 还站着的人：含合体蛰伏者（用来判「小队是否全灭」，蛰伏不算阵亡） */
export function standingOf(list: Combatant[]): Combatant[] {
  return list.filter((c) => !c.down)
}

/**
 * 战斗续行的次数上限：这个人这一场到底续得了几次。
 * `endure < 0` 是不限次；`endurePlus` 是**加算** —— 判据是此刻场上还有没有那个人
 * （站着、没蛰伏；倒在场上、被归档收走都不算），不是「这一队带没带他」。
 * 见 roster.luna：丝线是她自己织的，「回来」那一下是心叶站在那儿。
 */
export function endureCap(s: BattleState, p: PassiveSpec): number {
  if (p.endure === undefined) return 0
  if (p.endure < 0) return -1
  const plus = p.endurePlus
  const on = !!plus && aliveOf(allOf(s)).some((c) => c.id === plus.with)
  return p.endure + (on ? plus.extra : 0)
}

/* ---------- 增益读数 ---------- */

export function buffOf(c: Combatant, k: BuffKey): number {
  let v = 0
  for (const b of c.buffs) if (b.k === k) v += b.v
  return v
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** 攻击倍率（自身增益 + 装具常驻 + 被动；被动里的残血加成按当前血线算） */
export function atkMulOf(c: Combatant): number {
  const p = c.passive
  let mul = 1 + buffOf(c, 'atk') + c.gearAtk + (p?.atk ?? 0)
  if (p?.lowHpAtk && c.hpMax > 0 && c.hp / c.hpMax <= 0.5) mul += p.lowHpAtk
  // 全技能倍率乘算（旧吉他解封）：加的是「规格」，所以乘在最外层
  mul *= skillSpecOf(c)
  // 「磨蚀」一类：被磨软了打不出原来的分量。留个底，减攻不至于把人打成零输出
  mul -= buffOf(c, 'frail')
  return Math.max(TUNING.frailFloor, mul)
}

/** 技能效果倍率（旧吉他解封）：给的是「× N」，内部存 +（N−1），读数处 1 + v 即得乘数。
    伤害那一支走 atkMulOf；回复 / 护盾 / 各类增益与压制的「量」走这里。 */
export function skillSpecOf(c: Combatant): number {
  return 1 + buffOf(c, 'skillMul')
}

/** 被停滞了吗 —— 行动条完全冻住，一格都不涨 */
export function stasisOf(c: Combatant): number {
  return c.buffs.filter((b) => b.k === 'stasis').reduce((n, b) => Math.max(n, b.t), 0)
}

/** 充能速度（基础 × 自身 spd 增益 × 减速，减速下限留两成；停滞直接归零） */
export function chargeOf(c: Combatant): number {
  if (stasisOf(c) > 0) return 0
  const up = 1 + buffOf(c, 'spd') + c.gearSpd + (c.passive?.spd ?? 0)
  const slow = clamp(1 - buffOf(c, 'slow'), 0.2, 1)
  return Math.max(TUNING.spdFloor * 0.5, c.spd * up * slow)
}

/**
 * 一个「窗口」里涨多少条。
 *
 * = 常数项 + 充能速度。常数项（`TUNING.windowBase`）是这一层唯一的用处：
 * 把速度差**压进同一格** —— 快一点点与快很多的人落在同一档里抢手，
 * 快的人不会再靠速度一路连动（见 §3 行动条离散化）。
 *
 * 防御姿态的 ×1.5 只加在这一处 —— `chargeOf` 的签名与含义一个字节没动，
 * 「架盾 = 攒得快一点」这条读在档案里也看得见。
 */
function windowGainOf(c: Combatant): number {
  if (stasisOf(c) > 0) return 0
  return TUNING.windowBase + chargeOf(c) * (c.stance ? TUNING.stanceSpdMul : 1)
}

/**
 * 到满还差几窗口（0 = 已满；`Infinity` = 涨不动 —— 被停滞冻住了）。
 * 界面上的顺位读它，引擎的空转按下界逐格推它。
 */
export function etaOf(c: Combatant): number {
  if (c.bar >= TUNING.barMax) return 0
  const g = windowGainOf(c)
  if (g <= 0) return Infinity
  return (TUNING.barMax - c.bar) / g
}

/** 被沉默了吗 —— 沉默期间出不了技能，只剩普攻与防御 */
export function silenced(c: Combatant): boolean {
  return c.buffs.some((b) => b.k === 'silence')
}

/** 正在流血吗，每拍流掉多少（最大生命的比例） */
export function bleedOf(c: Combatant): number {
  return c.buffs.filter((b) => b.k === 'bleed').reduce((n, b) => n + b.v, 0)
}

/** 闪避率（上限封顶，pierce 一手另算） */
export function evadeOf(c: Combatant): number {
  /* 架着盾就是**必挨打**：防御姿态把闪避整个交出去。
     这一条与「减伤 / 免暴击 / 吃掉硬直」是一组买卖的两面 ——
     架盾换来的是硬扛，不是躲，所以代价写在明处（见 act 的 guard 分支）。 */
  if (c.stance) return 0
  return clamp(c.evade + buffOf(c, 'evade') + (c.passive?.evade ?? 0), 0, TUNING.evadeMax)
}

/** 命中（抵消对方闪避）：被动常驻 + 本手加成 */
export function accOf(c: Combatant): number {
  // 「观测封锁」压命中：看不见的东西，打出去也偏
  return Math.max(0, (c.passive?.acc ?? 0) + buffOf(c, 'acc') - buffOf(c, 'lockdown'))
}

/** 减伤（装具常驻 + 本段护罩 + 被动，封顶） */
export function shieldOf(c: Combatant): number {
  return clamp(c.shield + buffOf(c, 'shield') + (c.passive?.shield ?? 0), 0, TUNING.shieldCap)
}

/** 被击时额外承受的比例（标记） */
export function markOf(c: Combatant): number {
  return Math.max(0, buffOf(c, 'mark'))
}

/** 破绽成立中吗 —— 打穿的那几拍里它不出手，且挨打更重 */
export function brokenOf(c: Combatant): boolean {
  return c.broken > 0
}

/** 这一拍他要被划掉几次出手（断拍 + 破绽，取大的那个 —— 两种都由同一条路跳过） */
export function skipOf(c: Combatant): number {
  return Math.max(buffOf(c, 'stall') > 0 ? 1 : 0, c.broken > 0 ? 1 : 0)
}

/** 这个人身上还有没有削得动的破绽层 */
export function guardLeft(c: Combatant): number {
  return c.guardAxis ? Math.max(0, c.guardPts) : 0
}

/* ---------- 技能表 ---------- */

/** 指令菜单排序：终结技先、战技次、普攻最后（四格制的那个次序）。
    ⚠️ S1 换四格时这张表漏改了 —— 键还挂着旧名（`到达点`/`启动`/`技能`），
    一个都命不中，于是 `key()` 恒等于 9、排序静默失效。键必须与 `SkillKind` 逐字对齐。
    天赋不在表里：它不进 `SkillSpec`、`legalSkills` 也永不吐它（见 types 的 SkillKind）。 */
const KIND_ORDER: Record<string, number> = { 终结技: 0, 战技: 1, 普攻: 2 }

/**
 * 该单位此刻可用的技能：
 *   · 慢启动门未解 → 只剩启动技
 *   · 门既解 → 启动技退场；「到达点」需先蓄够印记
 */
export function legalSkills(c: Combatant, s?: BattleState): SkillSpec[] {
  const key = (k: SkillSpec) => KIND_ORDER[k.kind] ?? 9
  // 「需与某人同在」的一手：那人不在场上（或已失能 / 蛰伏），这一手就不列出来
  const together = (k: SkillSpec) => {
    if (!k.requireAlly && !k.requireAll?.length) return true
    if (!s) return true
    if (k.requireAlly) {
      const a = find(s, k.requireAlly)
      if (!a || a.down || a.gone > 0) return false
    }
    // 连携技：参加者一个都不能少 —— 少一个（倒了、蛰伏了、根本没来）就不列出来
    for (const id of k.requireAll ?? []) {
      const m = find(s, id)
      if (!m || m.down || m.gone > 0) return false
    }
    return true
  }
  if (c.startUsed < c.startNeed) {
    return c.skills.filter((k) => k.gate).sort((a, b) => key(a) - key(b))
  }
  // 「解封后还要过几拍」的手：门解了也先压着（旧吉他解封走这条）。
  // 没有门的人（startNeed 0）当「一直是解封状态」；拿不到战场状态时不拦。
  const opened = (k: SkillSpec) => {
    if (!k.openAfter || c.startNeed === 0) return true
    if (!s || c.unsealedAt <= 0) return false
    return s.hand - c.unsealedAt >= k.openAfter
  }
  return c.skills
    .filter((k) => !k.gate && !k.ult && opened(k)
      && (!k.needsStack || c.stack >= k.needsStack) && together(k))
    // 沉默：只剩普攻（与防御）可用。启动技不在此列 —— 那几手是「解封」，
    // 被沉默卡在解封前会把人锁死，不是设计意图。
    .filter((k) => !silenced(c) || k.kind === '普攻')
    .sort((a, b) => key(a) - key(b))
}

/** 该单位此刻的普攻（慢启动门未解时为空） */
export function basicOf(c: Combatant): SkillSpec | undefined {
  if (c.startUsed < c.startNeed) return undefined
  return c.skills.find((k) => k.kind === '普攻')
}

/** 这一手出得起吗 —— 吃的是**本人**的节拍（`Combatant.tempo`），不是终端那一池 */
export function affordable(k: SkillSpec, tempo: number): boolean {
  return k.cost <= tempo
}

/* ---------- 开局 ---------- */

export interface CreateOpts {
  mission: Mission
  squad: string[]
  progress: number
  growth: Record<string, number>
  /** 每人的反现实辅助装备 */
  gear?: Record<string, string>
  sp: number
  spMax: number
  /** 本场携带的道具（id → 个数）；缺省用补给池默认 */
  bag?: Record<string, number>
  /** 军需点（胜利结算时追加） */
  coin?: number
  /** 变身可借的档案池（已解锁、且不在本场队伍里的角色 id） */
  morphPool?: string[]
  /** 敌方由谁指挥：'ai' 时引擎会停在 'think' 等视图交回这一手（见 phase 注释） */
  command?: 'offline' | 'ai'
  /**
   * 每人与你的羁绊读数（0~100，终端里攒出来的那个数）。
   * 上了场它管两件事：连携的共鸣槽蓄多快（见 synergy.linkNeed）、本人五轴的临场加成。
   */
  bond?: Record<string, number>
  /**
   * 暴击开关（缺省 true）。**这是复核脚本的把手，不是平衡钮** ——
   * 伤害均值那几段断言必须能把随机性按住（与 sureHit / effect.noCrit 同一路数）。
   * 写 false 就是「这一场不暴击」，敌我都不暴。
   */
  crit?: boolean
}

export function createBattle(opts: CreateOpts): BattleState {
  const { mission, squad, progress, growth, gear = {}, sp, spMax } = opts
  const bond = opts.bond ?? {}
  const allies = squad.map((id) => combatantOf(id, progress, growth[id] ?? 0, gear[id]))
  // 羁绊：谁站在场上（队伍协同 + 双人）＋ 每人与你的交情攒到了哪一档
  applySynergies(allies, undefined, bond)
  // 敌方也读时期：同一档危险度，小队走到哪一卷，站上来的东西就硬到哪一档
  const enemies = enemiesOf(mission, progress)
  const base: BattleState = {
    missionId: mission.id,
    no: mission.no,
    title: mission.title,
    place: mission.place,
    // 留着给场中召唤用：喊上来的那一只得跟同场的是同一种东西
    //（敌体自己那份 trait 可能是指名首领的档案标签，不是这一场的性质）
    nature: mission.nature,
    stage: mission.stage,
    summoned: 0,
    /* 第二阶段：这一场的指名首领写了「他倒下之后谁顶上来」就记在这儿。
       只记 id、不预先造人 —— 顶上来的那一位的数值要照**顶上来的那一刻**算
       （地点 R 值与时期增幅都取当时那一份），提前造好就是拿开局的口径打收尾的仗。 */
    nextBoss: namedBossOf(mission.bossId)?.next,
    tick: 0,
    beatActs: 0,
    // 本回合已出过手的我方（endBeat 清空）—— 收拍的判据，见 types 的 BattleState.acted
    acted: [],
    hand: 0,
    actor: null,
    again: null,
    allies,
    enemies,
    log: [],
    phase: 'select',
    command: opts.command ?? 'offline',
    intent: null,
    overdrive: sp <= TUNING.overdriveAt,
    sp: Math.max(0, sp - TUNING.spPerSortie),
    spMax,
    bag: { ...(opts.bag ?? TUNING.bagDefault) },
    coin: opts.coin ?? 0,
    loot: [],
    fleeOdds: 0,
    morphPool: opts.morphPool ?? [],
    // 暴击总开关：复核脚本靠它把随机性按住（CreateOpts.crit），正式对局一律开着
    critOn: opts.crit !== false,
    // 两条「不消耗回合」的指令各有几次额度（endBeat 清零）
    freeUsed: { item: 0, gear: 0 },
    /* 追击：旧的 link / gauge / linkCd / rivalCd 四栏并到这两栏（见 §8）。
       `follow` 记的是**共鸣槽**（一人一条自己的能量，键是人的 id）——
       它只管团队羁绊连携那一条；双人那些走的是条件触发的追击，不攒槽。
       `followCd` 按 id 记冷却：团队连携 `xxx-full`、双人各条、对面那条 `rival-vow` 共用一张表。 */
    follow: {},
    followCd: {},
    lastBreak: [],
    // 天赋：响过的次数（按「人:下标」记）与重入深度（见 types 的 talentUsed / talentDepth）
    talentUsed: {},
    talentDepth: 0,
    bond,
    progress,
    growth,
    mainline: mission.mainline,
  }
  // 被动里的「开场领先」：有人本来就该先到
  for (const c of allies) {
    const h = c.passive?.headStart ?? 0
    if (h > 0) c.bar = Math.min(TUNING.barMax * 1.6, TUNING.barMax * h)
  }
  base.fleeOdds = fleeOddsOf(base)
  const line = (e: Partial<LogEntry> & { skill: string; note: string }) =>
    base.log.push({
      ...e,
      round: 0, actorId: TERMINAL.id, actor: TERMINAL.name, side: 'ally',
      skillId: 'note', kind: '指令', fx: 'seal',
    } as LogEntry)

  line({ skill: '作战开始', note: `小队进入 ${mission.place} · 目标 ${mission.nature}` })
  line({ skill: '阵位', note: allies.map((a) => `${a.name} · ${a.cls}`).join('／') })
  if (base.overdrive) {
    line({
      skill: '过载出击', fx: 'noise',
      note: `体力不足（余 ${base.sp}）仍强行出击 · 全场输出打 ${Math.round(TUNING.overdrivePenalty * 100)} 折`,
    })
  }
  /* 天赋 · 开场那一下（`on: 'battleStart'`）：造人、摆位、开局领先都落定之后才响，
     所以它读得到的是这一仗**真正**的开局面板。晚于上面那两行日志 —— 开场白先说完。 */
  for (const c of allOf(base)) fireTalents(base, c, 'battleStart', { tick: 0 })
  return advance(base)
}

/* ---------- 伤害与回复 ---------- */

function rollJitter(): number {
  return 1 + (Math.random() * 2 - 1) * TUNING.jitter
}

/**
 * 临场的暴击率 = 面板（造人时由 duty 的 critOf 算好，写进 `Combatant.crit`）
 * ＋ 身上的 `crit` 增益，兜顶。
 * 面板那一份为什么在造人时就算死：见 derive —— 职能在那时候已经定了，
 * 而场上的 `crit` 增益（天赋、装具技、队友给的）只有打出去的那一下才知道。
 */
function critChanceOf(c: Combatant, k?: SkillSpec): number {
  // 本手自带的 `crit` 与身上的 `crit` 增益**加算**在同一处（两者都是「这个人这一下更准」）
  return clamp(c.crit + buffOf(c, 'crit') + (k?.effect?.crit ?? 0), 0, TUNING.critCap)
}

/**
 * 这一手暴不暴击 —— 暴就返回倍数，不暴返回 0。
 *
 * 四道闸，顺序就是优先级：
 *   ① 总开关（`BattleState.critOn`）—— 复核脚本靠它把随机性按住，不是平衡钮
 *   ② 本手明写 `noCrit`（「这一手求的是稳，不是重」）
 *   ③ 目标**架着盾**（防御姿态免暴击 —— 架盾的代价是闪避归零，回报是挨不暴）
 *   ④ 本手明写 `sureCrit`（必暴：条件凑齐了的那一下）
 * 都没有才掷骰。倍数 = 面板那一份 ＋ 本手自己带的 `critMul`。
 * **敌我同一个函数** —— 敌人也掷，也挨。
 */
function rollCrit(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): number {
  const mul = atk.critMul + (k.effect?.critMul ?? 0)
  if (!s.critOn) return 0
  if (k.effect?.noCrit) return 0
  if (def.stance) return 0
  if (k.effect?.sureCrit) return mul
  return Math.random() < critChanceOf(atk, k) ? mul : 0
}

function damageOf(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): number {
  // 普攻倍率提升只认普攻：那一门「打起来更重」是说它自己，不是说每一手
  const basic = k.kind === '普攻' ? atk.gearBasic : 0
  // 连携技：参加者各自按同一轴补一份出力 —— 少一个人，这一手就轻一截
  let mate = 0
  if (k.linkUnits?.length && k.linkPow) {
    for (const id of k.linkUnits) {
      const m = find(s, id)
      if (m && !m.down && m.gone <= 0) mate += m.axes[k.axis] * k.linkPow * atkMulOf(m)
    }
  }
  // 终结技能：咏唱期间被挂上的减益，一层削它一截 —— 不打不断，也能打软
  const ultCut = k.ult
    ? Math.max(TUNING.ultMulFloor, 1 - ultDebuffs(atk) * TUNING.ultDebuffCut)
    : 1
  // 倍率浮动：抽签一类「性能极端」的手，每次出去轻重差很多
  const sway = k.variance ? 1 + (Math.random() * 2 - 1) * k.variance : 1
  // 蓄力：攒下来的那一口，在这一手上交出去（打完即清，见 resolve）
  const chg = atk.charge > 1 ? atk.charge : 1
  const raw = atk.axes[k.axis] * k.power * sway * (1 + basic) * atkMulOf(atk) * ultCut * chg + mate
  let mult = 1
  const anti = def.tags.includes('反现实')
  if (atk.scar) {
    // 弹痕 / 斩击：打反现实实体是本职，打纯物理目标反而不占优
    mult *= anti ? TUNING.scarVsAnti : TUNING.scarVsMundane
  } else {
    mult *= 1 + (atk.axes[AFFINITY] / 200) * TUNING.affinityWeight * (anti ? 1 : 0.3)
  }
  if (atk.side === 'ally' && s.overdrive) mult *= TUNING.overdrivePenalty
  let dmg = raw * mult * rollJitter() - def.axes.物理抗性 * TUNING.resistCut
  dmg = Math.max(TUNING.floor, Math.round(dmg))
  // 破绽成立：观测既已成立，打上去就是看得见的那种重（与「标记」同层，两者叠乘）
  dmg = Math.round(dmg * (1 + markOf(def)) * (brokenOf(def) ? TUNING.breakAmp : 1))
  dmg = Math.round(dmg * (1 - shieldOf(def)))
  /* 防御姿态：两笔都挂在这一层上，**与护罩分账**（护罩是装具与技能给的，姿态是这一手选的）。
     ① 克防御的手：写着 `stanceAmp` 的技能，打「架着盾」的目标加成 —— 在姿态还在时才乘得上去；
     ② 姿态自己的减伤（guardCut）—— 它随「盾被击溃」一起没（见 applyEffect 的 stanceBreak）。 */
  if (def.stance && k.effect?.stanceAmp) dmg = Math.round(dmg * (1 + k.effect.stanceAmp))
  if (def.stance) dmg = Math.round(dmg * (1 - TUNING.guardCut))
  return Math.max(TUNING.floor, dmg)
}

/** 回复量：以受治者的生命上限与施术者的意志力共同定（不至于奶不动） */
function healAmount(src: Combatant, t: Combatant, ratio: number): number {
  return Math.round((t.hpMax * 0.5 + src.axes.意志力 * 1.2) * ratio)
}

/**
 * 记一条日志。
 * 出手类条目在这里把台词补上：先按「同一个技能多说几句」换一句，
 * 再看上一个出手的是不是熟人 —— 是的话改成两人之间才有的接话。
 * （台词只影响观感，不改任何数值；见 banter.ts）
 *
 * **两条边都换**。档案里的人两边都站 —— 第二卷天空竞技祭的代表战里，
 * 梅尔文她们就是站在对面的；面具心叶唤来的异次元学生更是照搬本人那一份面板。
 * 台词池按档案身份取，所以对面那一位说的仍是他自己的话（见 banter 的 archiveIdOf）；
 * 杂兵与观测体的 id 不在名册上，取不到池子，照旧说技能自带的那一句。
 */
function pushLog(s: BattleState, e: LogEntry) {
  // 连携技有自己的那句（写在羁绊里），不参与日常台词轮换
  if (!e.skillId.startsWith('link-') && e.kind !== '指令') {
    const base = poolFor(e.actorId, e.skillId, e.line ?? '')
    // 刚才出手的队友（同阵营、新的在前）：接话顺着的对象
    const recent: Array<{ id: string; skill: string }> = []
    for (let i = s.log.length - 1; i >= 0 && recent.length < 4; i--) {
      const p = s.log[i]
      if (p.actorId === e.actorId || p.kind === '指令' || p.side !== e.side) continue
      if (recent.some((x) => x.id === p.actorId)) continue
      recent.push({ id: p.actorId, skill: p.skill })
    }
    e.line = lineFor(
      { actorId: e.actorId, recent, dmg: e.dmg, down: e.down, miss: e.miss },
      base,
    ) || undefined
  }
  s.log.push(e)
}

/* ---------- 增益落地 ---------- */

function addBuff(c: Combatant, k: BuffKey, v: number, turns: number) {
  if (!v) return
  const t = Math.min(TUNING.buffTurnsCap, Math.max(1, turns))
  const found = c.buffs.find((b) => b.k === k)
  if (found) {
    found.v = Math.max(found.v, v) // 同类取强，不叠加（防滚雪球）
    found.t = Math.max(found.t, t)
    // 续上时两条时限一起续：只续 t 的话，一条被续的增益可以绕开回合上限一直挂着
    found.rt = Math.max(found.rt ?? 0, TUNING.buffRoundsCap)
  } else {
    c.buffs.push({ k, v, t, rt: wearsByRound(k) ? TUNING.buffRoundsCap : undefined })
  }
}

/**
 * 这条 buff 吃不吃「回合上限」（TUNING.buffRoundsCap）。
 *
 * 只给**增益**加这道时限，两个例外都写在这里，别的地方不要各自判：
 *   · 负面（DEBUFF_KEYS）不吃 —— 那一边早有自己的一套时限（stasisCap / archiveCap），
 *     而且压制的价值就在于「挂着」，再加一道回合闸等于把敌人的手段一起削了。
 *     这一条要管的是增益，不是压制。
 *   · 「规格」类（旧吉他解封）不吃 —— 它改的是底子，不是一时的状态，
 *     挂上就不走；吃回合上限的话，解封链会在半路自己散掉，等于白解。
 */
function wearsByRound(k: BuffKey): boolean {
  return !isDebuff(k) && !isSpec(k)
}

/**
 * 动节拍：夹在下限 0 与本人上限之间，返回**真的**动了几分（日志要报这个数，
 * 不是报想动的数）。恢复途径②③④都从这里走 —— 一处夹，别处就不用各自记得夹。
 *
 * `n` 可以是**负数**：那是「抽一格」（`TalentSpec.tempo` 的注释写着正数=回、负数=抽）。
 * 从前这里写的是 `if (got > 0)`，负数一路算得出来却被那一句吞掉 ——
 * 于是「抽节拍」的天赋会静默地什么都不做。现在按实际差值落地（并夹在 0 以上）。
 * 正数那一路一个字节没动：`tempo += got` 与 `tempo = next` 是同一件事。
 */
function gainTempo(c: Combatant, n: number): number {
  const next = Math.max(0, Math.min(c.tempoMax, c.tempo + n))
  const got = next - c.tempo
  if (got !== 0) c.tempo = next
  return got
}

/** 硬直的名字（写日志用） */
const CONTROL_NAME: Partial<Record<BuffKey, string>> = { silence: '沉默', stall: '断拍' }

/**
 * 防御姿态吃掉的硬直 —— 架着盾的时候，`TUNING.stanceImmune` 里那几样压制定身落不下来。
 *
 * **不含停滞**：停滞是首领战三条反制链之一，免疫掉等于替玩家解掉一整关
 * （那一条写在 tuning 的 stanceImmune 里，这里只照读）。
 * 返回 true = 被咽下去了，调用方别再往下走那一条。
 *
 * 只挡「加一层新状态」这一路 —— 已经挂在身上的那几层照旧走时限，
 * 不会因为中途架了个盾就凭空消失。
 */
function stanceEats(s: BattleState, src: Combatant, t: Combatant, k: BuffKey): boolean {
  if (!t.stance) return false
  if (!(TUNING.stanceImmune as readonly string[]).includes(k)) return false
  pushLog(s, {
    round: s.hand, actorId: src.id, actor: src.name, side: src.side,
    skillId: 'stance-hold', skill: '架势 · 硬吃', kind: '指令', fx: 'guard',
    targetId: t.id, target: t.name, stance: 'on',
    note: `${t.name} 架着盾，这一记${CONTROL_NAME[k] ?? '压制'}硬吃了下来 —— 没被压住。`,
  })
  return true
}

/**
 * 削破绽。
 * ------------------------------------------------------------
 * 削到零 —— 「观测成立」：它当场停一拍，且这一拍里挨打加成（见 damageOf）。
 * 抽成函数是因为有两条路进得来：伤害手走 hit（对上轴即削，多段多次削），
 * 辅助手走 applyEffect 的 breakGuard（明写要削，不看轴）——
 * 而「拆破绽」这件事本来就该有专门的人在干，不该只有打得动的人才拆得开。
 */
function stripGuard(s: BattleState, src: Combatant, t: Combatant, n: number) {
  if (!t.guardAxis || n <= 0 || t.down || t.gone > 0 || t.guardPts <= 0) return
  t.guardPts = Math.max(0, t.guardPts - n)
  if (t.guardPts > 0 || t.broken > 0) return
  t.broken = Math.max(1, TUNING.breakTicks)
  // 打穿之后护盾重新凝起来：破绽给的是**一段窗口**，不是永久破防
  t.guardPts = t.guardMax
  /* 记一笔：这一手打穿了谁的破绽。追击的条件①读它（见 followCondition）。
     只留这一次出手里的（act 开头清），因为「搭档这一手打穿了」说的就是这一手。 */
  if (!s.lastBreak.includes(t.id)) s.lastBreak.push(t.id)
  /* 恢复途径③：打穿破绽给**出手者**回节拍。
     给出手者而不是给被打的：这一条是「取材」那类职能的活路 ——
     他一手敲下去、节拍回一点，于是敲破绽本身能滚起来（但仍要贴得上轴、削得动点）。 */
  gainTempo(src, TUNING.breakTempo)
  pushLog(s, {
    round: s.hand, actorId: t.id, actor: t.name, side: t.side,
    skillId: 'break', skill: '破绽 · 观测成立', kind: '指令', fx: 'noise',
    targetId: t.id, target: t.name,
    note: `${src.name} 打穿了 ${t.name} 的破绽 —— 「${t.guardAxis}」这一路是对的。`
      + `它停 ${t.broken} 拍，这期间挨打更重（×${TUNING.breakAmp}）。`,
  })
}

/**
 * 这一手有没有「打在别人身上的那一半」。
 * 单独抽出来是因为两处都要问：resolve 用它决定要不要挑敌人当目标，
 * applyEffect 用它决定护持挡不挡得住这一手。
 */
function hostileEffectOf(eff: SkillSpec['effect'] | undefined): boolean {
  if (!eff) return false
  return !!(eff.mark || eff.slow || eff.pushBack || eff.silence || eff.bleed
    || eff.frail || eff.stasis || eff.lockdown || eff.archive || eff.stall
    || eff.clearBar || eff.breakGuard || eff.stanceBreak)
}

/**
 * 一手的效果拆成「给自己的」与「打在别人身上的」两半。
 *
 * 原来这两栏只写在 resolve 的主路里，回响（`k.echo`）就把自己整份抄来的效果
 * 落在手上不了 —— 抄了、没接（见下面 echo 那一支）。两处各写一份的话，
 * 加了新键只改一处，另一处会安静地漏掉，所以抽成一处，谁要用谁来取。
 */
function splitEffect(e: NonNullable<SkillSpec['effect']>) {
  const friendly: typeof e = {
    heal: e.heal, cleanse: e.cleanse, shield: e.shield, evade: e.evade, accUp: e.accUp,
    atkUp: e.atkUp, skillMul: e.skillMul, spdUp: e.spdUp, pushBar: e.pushBar, taunt: e.taunt,
    ward: e.ward, charge: e.charge,
  }
  const hostile: typeof e = {
    mark: e.mark, slow: e.slow, pushBack: e.pushBack,
    silence: e.silence, bleed: e.bleed, frail: e.frail,
    stasis: e.stasis, lockdown: e.lockdown, archive: e.archive,
    stall: e.stall, clearBar: e.clearBar, breakGuard: e.breakGuard,
    // 击溃防御姿态：拆的是**对方**架着的那面盾，与 breakGuard（削破绽）同属打在别人身上的那一半
    stanceBreak: e.stanceBreak,
  }
  const hasFriendly = !!(e.heal || e.cleanse || e.shield || e.evade || e.accUp
    || e.atkUp || e.skillMul || e.spdUp || e.pushBar || e.taunt || e.ward || e.charge)
  return { friendly, hostile, hasFriendly, hasHostile: hostileEffectOf(e) }
}

/**
 * 一手的效果结算。
 * @param foes 受益方的敌方（用来施加压制）；缺省按施术者阵营取
 */
function applyEffect(
  s: BattleState,
  src: Combatant,
  eff: SkillSpec['effect'] | undefined,
  targets: Combatant[],
  hostileTargets: Combatant[],
  turns = 2,
  // 技能效果倍率（旧吉他解封）：伤害之外的每一种「量」都跟着翻。
  // 道具走的是默认值 1 —— 解封放大的是使用者的技术，不是手里那件东西。
  scale = 1,
) {
  if (!eff) return
  // 整数类的量（生命回复）取整；小数类的量（护盾系数、行动条推移、命中/闪避）留两位
  const iv = (v: number) => Math.round(v * scale)
  const fv = (v: number) => Math.round(v * scale * 100) / 100
  for (const t of targets) {
    if (t.down && !eff.heal) continue
    if (eff.heal) {
      const n = iv(healAmount(src, t, eff.heal))
      t.hp = Math.min(t.hpMax, t.hp + n)
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'heal', skill: '回复', kind: '指令', fx: 'heal',
        targetId: t.id, target: t.name, heal: n,
      })
    }
    // 解除负面：沉默 / 流血 / 减攻一并洗掉（见 types 的 DEBUFF_KEYS）
    if (eff.cleanse) t.buffs = t.buffs.filter((b) => !isDebuff(b.k))
    if (eff.clearBar) t.bar = 0
    if (eff.evade) addBuff(t, 'evade', fv(eff.evade), turns)
    if (eff.accUp) addBuff(t, 'acc', fv(eff.accUp), turns)
    if (eff.shield) addBuff(t, 'shield', fv(eff.shield), turns)
    if (eff.atkUp) addBuff(t, 'atk', fv(eff.atkUp), turns)
    // skillMul 给的是「× N」：内部存 +（N−1），读数处 1 + v 即得乘数。
    // 这条**不**跟着 scale 走 —— 否则解封叠解封会自己乘自己。
    if (eff.skillMul && eff.skillMul > 0) addBuff(t, 'skillMul', eff.skillMul - 1, turns)
    if (eff.spdUp) addBuff(t, 'spd', fv(eff.spdUp), turns)
    if (eff.pushBar) t.bar = Math.min(TUNING.barMax * 1.6, t.bar + TUNING.barMax * fv(eff.pushBar))
    if (eff.taunt) t.taunt = Math.max(t.taunt, turns)
    /* 护持：还没中的负面，接下来挡掉 N 次。与 cleanse 分工 ——
       cleanse 洗的是**已经中了**的，ward 挡的是**还没中**的。 */
    if (eff.ward) t.ward = Math.max(t.ward, Math.round(eff.ward * scale))
    /* 蓄力：不是 buff，是「存在这个人身上的一口气」——
       不按拍数走，只等他真的打出去（或被打散）。所以同一个人的蓄力取强者。

       这一条**不跟 scale 走**，是故意的：蓄力最终乘进下一手的伤害，而那份伤害
       自己已经过 atkMulOf 里的 skillSpecOf。两边都乘的话，×2 的规格配 ×1.8 的蓄力
       会打出 ×7.2 的下一手 —— 而正确的读数是 ×3.6（规格 ×2，蓄力 ×1.8，各乘一次）。
       解封抬的是「她这门东西的规格」，不是「她攒的这口气有多长」。 */
    if (eff.charge && eff.charge > 1) {
      t.charge = Math.max(t.charge, eff.charge)
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'charge', skill: '蓄力', kind: '指令', fx: 'seal',
        targetId: t.id, target: t.name,
        note: `${t.name} 把这一拍存了起来 —— 下一手伤害 ×${t.charge}，`
          + `但期间挨到最大生命 ${Math.round(TUNING.chargeBreak * 100)}% 的一下就会散。`,
      })
    }
  }
  for (const t of hostileTargets) {
    if (t.down) continue
    /* 护持：还没中的负面先挡掉一次。挡在**最前面**，且挡的是「这一手」而不是
       「这一手里的某一条」—— 中了护持的那一下是整条被咽下去，不挑条目。 */
    if (t.ward > 0 && hostileEffectOf(eff)) {
      t.ward -= 1
      pushLog(s, {
        round: s.hand, actorId: t.id, actor: t.name, side: t.side,
        skillId: 'ward', skill: '护持', kind: '指令', fx: 'guard',
        targetId: t.id, target: t.name,
        note: `${t.name} 的护持把这一手整个咽了下去 —— 还剩 ${t.ward} 次。`,
      })
      continue
    }
    if (eff.clearBar) {
      t.bar = 0
      // 「镇静剂」压住的不只是行动条：正在咏唱的大招也一并哑掉
      if (resetChant(s, t, '镇静')) { /* 已入日志 */ }
    }
    /* 击溃防御姿态：架着的盾被打脱手。
       脱手之后**三样一起没** —— 减伤（damageOf 里那一乘）、免暴击（rollCrit 那道闸）、
       以及吃掉硬直那件事；闪避也跟着回来（evadeOf 只看 stance）。
       不设「已经脱手过就不能再脱」：姿态本来就在本人下次出手时自动撤
       （见 beginAction），所以 `stanceBroken` 只是**留个痕迹**给日志与界面，不是第二道状态。 */
    if (eff.stanceBreak && t.stance) {
      t.stance = false
      t.stanceBroken = true
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'stance-break', skill: '架势 · 击溃', kind: '指令', fx: 'guard',
        targetId: t.id, target: t.name, stance: 'break',
        note: `${t.name} 架着的那面盾被打脱手了 —— 减伤与免暴击一并没了，闪避也回来了。`,
      })
    }
    /* 削破绽：辅助手拆盾的那条路 —— 不看这一手的轴，写了就削。
       （伤害手另有 hit 那条路：对上轴即削，多段多次削。） */
    if (eff.breakGuard) stripGuard(s, src, t, Math.max(1, Math.round(eff.breakGuard * scale)))
    if (eff.mark) addBuff(t, 'mark', fv(eff.mark), turns)
    if (eff.slow) addBuff(t, 'slow', fv(eff.slow), turns)
    if (eff.pushBack) t.bar = Math.max(0, t.bar - TUNING.barMax * fv(eff.pushBack))
    // 敌方专给我方的三种：沉默 / 流血 / 减攻
    if (eff.silence && !stanceEats(s, src, t, 'silence')) addBuff(t, 'silence', 1, turns)
    if (eff.bleed) addBuff(t, 'bleed', fv(eff.bleed), turns)
    if (eff.frail) addBuff(t, 'frail', fv(eff.frail), turns)
    if (eff.lockdown) addBuff(t, 'lockdown', fv(eff.lockdown), turns)
    /* 断拍：取消接下来 N 次出手。条照扣 —— 所以它不是「推后」，是「划掉」，
       也因此不碰行动条那一档（见 atlas.ts 头注）。上限压在 stallCap：
       在本系统里「不出手」是复合惩罚（连携、冷却、印记、咏唱四条一起少一格），
       放开了会变成唯一解。 */
    if (eff.stall && !stanceEats(s, src, t, 'stall')) {
      const n = Math.max(1, Math.min(TUNING.stallCap, Math.round(eff.stall * scale)))
      addBuff(t, 'stall', 1, n)
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'stall', skill: '断拍', kind: '指令', fx: 'seal',
        targetId: t.id, target: t.name,
        note: `${t.name} 的下一次出手被划掉了 —— 条照样扣，但这一拍他打不出来（${n} 次）。`,
      })
    }

    /* 停滞：不走 addBuff 那一套 —— 它的时长按「拍」算，而拍是要在
       心跳里自己往下数的（被冻住的人不会行动，也就没机会给自己减层）。
       见 advance 的拍子循环。 */
    if (eff.stasis) {
      const n = Math.max(1, Math.min(TUNING.stasisCap, Math.round(eff.stasis * scale)))
      const found = t.buffs.find((b) => b.k === 'stasis')
      if (found) {
        found.t = Math.max(found.t, n)
        found.rt = Math.max(found.rt ?? 0, TUNING.buffRoundsCap)
      } else t.buffs.push({ k: 'stasis', v: 1, t: n, rt: TUNING.buffRoundsCap })
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'stasis', skill: '停滞', kind: '指令', fx: 'seal',
        targetId: t.id, target: t.name,
        note: `${t.name} 被停滞住了 —— 行动条冻结 ${n} 拍，这一段时间他一步也走不动。`,
      })
    }

    /* 归档：把人从战场上收走几拍。用的是「合体」那套离场机制，
       所以列表、行动条、判定都会当他不在场上 —— 回来时行动条从零起。 */
    if (eff.archive) {
      const n = Math.max(1, Math.min(TUNING.archiveCap, Math.round(eff.archive * scale)))
      t.gone = Math.max(t.gone, n)
      t.bar = 0
      t.buffs = []
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'archive', skill: '归档', kind: '指令', fx: 'noise',
        targetId: t.id, target: t.name,
        note: `${t.name} 被归档了 —— 他暂时不在战场上，${n} 拍后重新入列。`,
      })
    }

    const what = [
      eff.silence ? '沉默' : '',
      eff.bleed ? '流血' : '',
      eff.frail ? '减攻' : '',
      eff.lockdown ? '观测封锁' : '',
    ].filter(Boolean).join(' · ')
    if (what) {
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'debuff', skill: what, kind: '指令', fx: 'seal',
        targetId: t.id, target: t.name,
        note: `${t.name} 中「${what}」—— 持续 ${Math.min(TUNING.buffTurnsCap, Math.max(1, turns))} 拍。`,
      })
    }
  }
}

/* ---------- 单次命中 ---------- */

/**
 * 这一手落在几个人身上 —— 演出据此决定「贴着谁放」还是「铺一整屏」。
 * 单体技打在一个人身上，却把整个屏幕糊一层光，是最招人烦的那种动静。
 */
function scopeOf(k: SkillSpec): 'one' | 'all' {
  return k.target === 'all' || k.target === 'allyAll' ? 'all' : 'one'
}

function hit(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): LogEntry {
  const pierce = k.effect?.pierce === true
  // 命中 = 对方的闪避减去出手者这一手的命中（被动常驻 + 本手加成）
  // 低语者「听得见往哪躲」：攻击必中，闪避再高也躲不掉
  const miss = atk.passive?.sureHit ? 0 : Math.max(0, evadeOf(def) - accOf(atk))
  if (!pierce && Math.random() < miss) {
    return {
      round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, gate: k.gate, fx: k.fx,
      tone: toneOf(k), scope: scopeOf(k),
      targetId: def.id, target: def.name, miss: true, line: k.line || undefined,
    }
  }
  /* 暴击：命中之后、结算之前掷 —— 掷出来的这一下要参与后面所有的判据
     （打散蓄力的门槛、破绽那层的厚度、打倒与否都是看**最终**这一下有多重） */
  const raw = damageOf(s, atk, def, k)
  const critMul = rollCrit(s, atk, def, k)
  const dmg = critMul > 0 ? Math.max(TUNING.floor, Math.round(raw * critMul)) : raw
  def.hp = Math.max(0, def.hp - dmg)
  breakChant(s, def, dmg)

  /* 破绽：只有**对上那条轴**的攻击才削得动这层护盾（每一段削一点，
     所以多段技天生是它的克星）；明写 breakGuard 的手另算，不看轴。 */
  stripGuard(s, atk, def, (k.effect?.breakGuard ?? 0) + (def.guardAxis === k.axis ? 1 : 0))

  // 蓄力被打散：攒着的那口气，挨到够重的一下就散了（轻碰不掉，重的才掉）
  if (def.charge > 1 && dmg >= def.hpMax * TUNING.chargeBreak) {
    const had = def.charge
    def.charge = 0
    pushLog(s, {
      round: s.hand, actorId: def.id, actor: def.name, side: def.side,
      skillId: 'charge-break', skill: '蓄力 · 中断', kind: '指令', fx: 'seal',
      targetId: def.id, target: def.name,
      note: `${def.name} 攒着的那一手被打散了 —— ×${had} 的那一下没能出手。`,
    })
  }
  let down = false
  if (def.hp === 0 && !def.down && def.gone <= 0) {
    // 战斗续行：原文里「心脏破了也照样站着」的人，致命伤只留一口气
    const p = def.passive
    const cap = p ? endureCap(s, p) : 0
    const canEndure = cap !== 0 && (cap < 0 || def.endured < cap)
    if (canEndure && p) {
      const base = p.endure ?? 0
      def.hp = 1
      def.endured += 1
      /* 这一下若是**加算**换来的（本场已经续过 base 次），把那个人点出来：
         「回来」这一下不是她自己织的，是有人在场上 —— 见 endurePlus。 */
      const plus = p.endurePlus
      const by = plus && base > 0 && def.endured > base
        ? aliveOf(allOf(s)).find((c) => c.id === plus.with)
        : undefined
      pushLog(s, {
        round: s.hand, actorId: def.id, actor: def.name, side: def.side,
        skillId: 'endure', skill: '战斗续行', kind: '指令', fx: 'guard',
        note: by
          ? `${p.name} —— ${p.desc.split('。')[0]}：${by.name}还在场上，这一下也没打穿。`
          : `${p.name} —— ${p.desc.split('。')[0]}：这一下没打穿。`,
      })
      return {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
        tone: toneOf(k), scope: scopeOf(k),
        targetId: def.id, target: def.name, dmg, line: k.line || undefined,
        crit: critMul > 0, critMul: critMul > 0 ? critMul : undefined,
      }
    }
    if (def.side === 'ally' && TUNING.downWillSave && def.axes.意志力 >= 60 && !def.note?.includes('不倒')) {
      // 意志力极强者：一次「不倒」——留一口气，记在 note 上，只保一次
      def.hp = 1
      def.note = `${def.note ?? ''}｜不倒`.trim()
      pushLog(s, {
        round: s.hand, actorId: def.id, actor: def.name, side: def.side,
        skillId: 'stand', skill: '不倒', kind: '指令', fx: 'heal',
        note: '被打倒的瞬间硬撑住了 —— 只此一次。',
      })
    } else {
      def.down = true
      down = true
    }
  }
  return {
    round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
    skillId: k.id, skill: k.name, kind: k.kind, gate: k.gate, fx: k.fx,
    tone: toneOf(k), scope: scopeOf(k),
    targetId: def.id, target: def.name, dmg, down, line: k.line || undefined,
    crit: critMul > 0, critMul: critMul > 0 ? critMul : undefined,
  }
}

/* ---------- 终结技能（boss 大招）的咏唱 ---------- */

/** 咏唱期间身上挂了几层减益（破绽 / 减速 / 被标记） */
function ultDebuffs(c: Combatant): number {
  return c.buffs.filter((b) => isDebuff(b.k)).length
}

/** 该单位身上那记终结技能（没有则 undefined） */
function ultOf(c: Combatant): SkillSpec | undefined {
  return c.skills.find((k) => k.ult)
}

/** 一次挨打够重就打断咏唱，并留下日志（返回是否打断） */
function breakChant(s: BattleState, def: Combatant, dmg: number): boolean {
  const u = ultOf(def)
  if (!u || def.side !== 'enemy') return false
  const need = (u.ultBreak ?? TUNING.ultBreak) * def.hpMax
  if (dmg < need) return false
  if ((def.chant[u.id] ?? 0) <= 0) return false
  def.chant[u.id] = 0
  pushLog(s, {
    round: s.hand, actorId: def.id, actor: def.name, side: def.side,
    skillId: 'chant-break', skill: '咏唱被打断', kind: '指令', fx: 'seal',
    note: `这一下打掉了 ${dmg}（阈值 ${Math.round(need)}）—— 「${u.name}」的咏唱被压了回去。`,
  })
  return true
}

/** 主动清零咏唱（镇静剂一类），返回是否真的清掉了什么 */
function resetChant(s: BattleState, t: Combatant, how: string): boolean {
  const u = ultOf(t)
  if (!u || (t.chant[u.id] ?? 0) <= 0) return false
  t.chant[u.id] = 0
  pushLog(s, {
    round: s.hand, actorId: t.id, actor: t.name, side: t.side,
    skillId: 'chant-seal', skill: '咏唱中止', kind: '指令', fx: 'seal',
    note: `${how}起效 —— 「${u.name}」的咏唱归零。`,
  })
  return true
}

/* ---------- 一手技能 ---------- */

function resolve(s: BattleState, atk: Combatant, k: SkillSpec, targetId?: string): BattleState {
  const foes = atk.side === 'ally' ? s.enemies : s.allies
  const friends = atk.side === 'ally' ? s.allies : s.enemies

  if (k.power > 0) {
    let targets: Combatant[]
    if (k.target === 'all') targets = aliveOf(foes)
    else if (k.target === 'self') targets = [atk]
    else if (k.target === 'allyAll') targets = aliveOf(friends)
    else if (k.target === 'allyOne') {
      const t = targetId ? find(s, targetId) : undefined
      // 必须是自己人：目标 id 万一是从对面挑来的，这一手宁可收回自己身上
      targets = t && t.side === atk.side && !t.down && t.gone <= 0 ? [t] : [atk]
    } else {
      const t = targetId ? find(s, targetId) : undefined
      targets = t && !t.down && t.gone <= 0 ? [t] : aliveOf(foes).slice(0, 1)
    }
    const hits = Math.max(1, k.effect?.hits ?? 1)
    for (const t of targets) {
      for (let i = 0; i < hits; i++) {
        if (t.down) break
        const e = hit(s, atk, t, k)
        pushLog(s, e)
        /* 天赋挂在**这一手结算完之后**：日志的次序是「先打完、天赋再响」，
           与玩家读到的先后一致。多段手每一段各问一次 —— 段段都能触发。 */
        fireHitTalents(s, atk, t, e)
      }
    }
    /* 蓄力交出去了：攒的那一口只在这一手上兑现。打在第一个目标身上时就已经
       进过 damageOf 了，所以这里只是把它清掉 —— 同一份力不该连吃两手。 */
    if (atk.charge > 1) {
      atk.charge = 0
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'charge-out', skill: '蓄力 · 交付', kind: '指令', fx: 'blast',
        note: `${atk.name} 把存着的那一拍交了出去。`,
      })
    }
  } else if (!k.gate && !k.echo && !k.copy) {
    // 不造成伤害的辅助手：调律、屏障、鼓舞之类（回响不在此列，它自己那一段会写日志）
    pushLog(s, {
      round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, gate: k.gate, fx: k.fx,
      tone: toneOf(k), scope: scopeOf(k),
      targetId: k.target === 'allyOne' || k.target === 'one' ? targetId : undefined,
      line: k.line || undefined,
      note: '调律 —— 本手不造成伤害',
    })
  }

  /* 回响：把我方上一手原样复写一遍，打到我们自己脸上。
     这一手不叠加在常规伤害上 —— 它本身就是「那一手」，
     所以倍率、轴、附带效果都照抄，只按 echoPower 打个折。

     附带效果要单独落地：`...stolen` 把 `effect` 一并抄了进来，但打伤害的
     `hit()` 只管算血，从不碰效果 —— 从前这一支只调 `hit()`，于是抄来的减益
     永远不生效（「照抄附带效果」这句在代码里落空）。分法照常规那一支走：
     给自己上的落在施术者身上，打在别人身上的落在那一个挨打的身上。 */
  if (k.echo && s.lastSkill) {
    const stolen = s.lastSkill
    const pool = aliveOf(s.allies)
    const t = pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined
    if (t) {
      const ek: SkillSpec = {
        ...stolen,
        id: `${k.id}-echo`, name: `${stolen.name} · 回响`,
        cost: 0, cd: 0, ult: undefined,
        power: stolen.power * TUNING.echoPower,
      }
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: k.id, skill: k.name, kind: k.kind, fx: 'noise',
        line: k.line || undefined,
        note: `${atk.name} 把「${stolen.name}」原样念了回来 —— 复写落在 ${t.name} 身上。`,
      })
      if (ek.power > 0) {
        const ee = hit(s, atk, t, ek)
        pushLog(s, ee)
        // 回响也是真打出去的一下 —— 天赋照问（与主路同一个口子）
        fireHitTalents(s, atk, t, ee)
      }
      if (ek.effect) {
        const sp = splitEffect(ek.effect)
        if (sp.hasFriendly) applyEffect(s, atk, sp.friendly, [atk], [], ek.turns)
        if (sp.hasHostile) applyEffect(s, atk, sp.hostile, [], [t], ek.turns)
      }
    }
  }

  /* 复写（片羽「申告虚伪」）：照抄**任意一个角色**的一手 ——
     不是「上一手」（那是回响），是她当场挑的那一手。
     原文里那三条硬限制照样成立：二十四小时的观测窗口、同一时间只能拿一手、
     以及减寿的代价，所以这里一次只抄一手，抄完就过。
     抄不来的那些也写明在数据上（SkillSpec.uncopyable）：
     恋兔的吉他抄得来一把琴，抄不来弹它的那股力 —— 那股力本来就不在吉他上。 */
  if (k.copy) {
    const pool: SkillSpec[] = []
    for (const c of allOf(s)) {
      if (c.down || c.gone > 0) continue
      for (const x of c.skills) {
        if (x.id === k.id || x.uncopyable || x.copy) continue
        // 门与印记抄不过来：「解封」要的是那五下启动，「到达点」要的是自己的印记，
        // 借来的手没有这两样。变身一类也不是「一手」，是「换个人」，同样不算。
        if (x.gate || x.kind === '终结技') continue
        if (x.form || x.morph) continue
        pool.push(x)
      }
    }
    const foes = atk.side === 'ally' ? aliveOf(s.enemies) : aliveOf(s.allies)
    if (pool.length && foes.length) {
      const stolen = pool[Math.floor(Math.random() * pool.length)]
      const t = foes[Math.floor(Math.random() * foes.length)]
      const ck: SkillSpec = {
        ...stolen,
        id: `${k.id}-copy`, name: `复写 · ${stolen.name}`,
        cost: 0, cd: 0, ult: undefined, openAfter: undefined, needsStack: undefined,
      }
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: k.id, skill: k.name, kind: k.kind, fx: 'seal',
        line: k.line || undefined,
        note: `${atk.name} 申告了那一手 —— 「${stolen.name}」原样落在 ${t.name} 身上。`
          + '二十四小时里她只拿得动这一手。',
      })
      resolve(s, atk, ck, t.id)
    }
  }

  // 效果：伤害之外的增益 / 压制。
  //   · 单体 / 全体 攻击手：增益留给自己，压制落在选中的那个（或全体）敌人身上
  //   · 辅助手：效果按 target 落在我方
  const e = k.effect
  if (e) {
    // 出手时点上的技能效果倍率（旧吉他解封）。在这里取一次定值：
    // 若这手本身就把 skillMul 加上去了，那也**从下一手**才生效，不自乘。
    const smul = skillSpecOf(atk)
    // 「打在别人身上的那一半」统一走一个判据 —— 两处各写一份的话，
    // 加了新键只改一处，另一处就会安静地漏掉（护持也会跟着挡不住）。
    const { friendly, hostile, hasFriendly, hasHostile } = splitEffect(e)

    if (k.target === 'all' || k.target === 'one') {
      if (hasFriendly) applyEffect(s, atk, friendly, [atk], [], k.turns, smul)
      if (hasHostile) {
        const ht = k.target === 'one'
          ? (() => { const t = targetId ? find(s, targetId) : undefined; return t && !t.down && t.gone <= 0 ? [t] : aliveOf(foes).slice(0, 1) })()
          : aliveOf(foes)
        applyEffect(s, atk, hostile, [], ht, k.turns, smul)
      }
    } else {
      const beneficiaries = k.target === 'self'
        ? [atk]
        : k.target === 'allyAll'
          ? aliveOf(friends)
          : (() => { const x = targetId ? find(s, targetId) : undefined; return x && x.side === atk.side && !x.down && x.gone <= 0 ? [x] : [atk] })()
      if (e.selfToo && !beneficiaries.includes(atk)) beneficiaries.push(atk)
      applyEffect(s, atk, e, beneficiaries, [], k.turns, smul)
    }
  }

  // 合体：把同在的那位暂时请下场，蛰伏若干拍后自行归位
  if (k.mergeAlly) {
    const mate = find(s, k.mergeAlly)
    if (mate && !mate.down && mate.gone <= 0) {
      mate.gone = Math.max(1, k.mergeTicks ?? 3)
      mate.bar = 0
      mate.buffs = []
      pushLog(s, {
        round: s.hand, actorId: mate.id, actor: mate.name, side: mate.side,
        skillId: 'merge-off', skill: '合体 · 离场', kind: '指令', fx: 'noise',
        note: `${mate.name} 与 ${atk.name} 合而为一 —— 她暂时不在场上了，${mate.gone} 拍后归位。`,
      })
    }
  }

  // 变身（noapusa「变成他人」）：只借敌阵的形与能力；队伍里的人复制不了。
  // 解除时才起算冷却，那几拍里手感发虚（见 advance 的拍子循环）。
  if (k.morph) {
    const src = targetId && s.morphPool.includes(targetId) ? targetId : undefined
    const t = src ? combatantOf(src, s.progress, s.growth[src] ?? 0) : undefined
    if (t) {
      const ticks = Math.max(1, k.morphTicks ?? 3)
      atk.morph = {
        kind: 'other',
        name: t.name,
        base: { axes: { ...atk.axes }, spd: atk.spd, skills: atk.skills.map((x) => ({ ...x })) },
        ticks, skillId: k.id, cd: k.morphCd ?? 3, ramp: 0,
      }
      // 「复制所有能力」= 五轴、速度与整份技能表一并借来
      atk.axes = { ...t.axes }
      atk.spd = t.spd
      atk.skills = t.skills.map((x) => ({ ...x }))
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'morph-on', skill: '变成他人', kind: '指令', fx: 'guitar',
        note: `${atk.name} 化作了 ${t.name} 的样子 —— 连能力一并借来用，${ticks} 拍后归还。`,
      })
    }
  }

  // 变身（黄金狮子）：变的是自己 —— 名字、五轴、整份技能表当场换掉。
  // 与 morph 同用一份状态（Combatant.morph），靠 kind 分辨解禁时报哪一句。
  if (k.form) {
    const f = k.form
    const ticks = Math.max(1, f.ticks)
    atk.morph = {
      kind: 'form',
      name: f.name,
      base: { axes: { ...atk.axes }, spd: atk.spd, skills: atk.skills.map((x) => ({ ...x })) },
      ticks, skillId: k.id, cd: f.cd ?? 3, ramp: f.basicRamp ?? 0,
    }
    /* 形是他的**另一副面目**，不是另一个人的面板 —— 本人练到哪，这副面目就跟着到哪。
       f.axes 是按「还没成长时的时期面板」写下的绝对值，覆写时必须把本人那一份
       成长补回去（与 derive 的 axisSheetOf 同一个 k）。不补是实测出来的坑：
       成长 +50% 时变身落到 ×0.92，+200% 时只剩 ×0.47 —— 玩家给自己练了一身本事，
       一按大招全丢。终末等级是能一路买上去的（见 store 的 effectiveGrowth），
       所以这条路一定会有人走到。 */
    if (f.axes) {
      const k = 1 + Math.max(0, s.growth[atk.id] ?? 0) / 100
      const grown: Partial<AxisSheet> = {}
      for (const [a, v] of Object.entries(f.axes)) grown[a as AxisKey] = Math.round((v as number) * k)
      atk.axes = { ...atk.axes, ...grown }
    }
    atk.spd = speedOf(atk.axes)
    atk.skills = f.skills.map((x) => ({ ...x }))
    pushLog(s, {
      round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: 'form-on', skill: '变身', kind: '指令', fx: 'guitar',
      note: `${atk.name} 换了一副面目 —— 「${f.name}」。${ticks} 拍之后归还。`,
    })
  }

  // 冷却：出手即上表，按「自身行动次数」递减（见 beginAction）
  if (k.cd && k.cd > 0) atk.cds[k.id] = k.cd

  /* 到达点的燃料：每真的出一手蓄一层（防御不算 —— 架势是省着力气的，
     蓄能的规矩是「出力才涨」）。所以谁都能等到自己的那一手，只是快慢不同：
     弹痕持者蓄得更快，印记本来就是他们的本相 —— 别人是攒出来的，他们是长出来的。 */
  atk.stack += atk.scar ? 2 : 1
  if (k.gate) {
    atk.startUsed += 1
    const n = atk.startUsed
    // 解封是「一层一层拧开」的过程，所以每一层有每一层的台词：
    // 第 n 次报 startLines 的第 n 句，最后一句留给「尽解」那一拍。
    const ladder = k.startLines
    const done = n >= atk.startNeed
    const line = ladder?.length
      ? ladder[Math.min(n, ladder.length) - 1]
      : undefined
    if (done) {
      // 记下解封这一拍：带 openAfter 的手要从这里起算（见 legalSkills）
      atk.unsealedAt = s.hand
      /* 尽解那一拍他立刻再动一次：五下启动把回合全让给了对面，
         门开了却轮不到自己出招的话，解封本身就只是白亏五拍 ——
         所以把行动条原位填满，并点名下一手仍旧是他（见 advance 的 again）。 */
      atk.bar = TUNING.barMax
      s.again = atk.id
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'unseal', skill: '解禁', kind: '指令', fx: 'noise',
        line: line || undefined,
        note: `封印尽解 —— 普攻与技能已可用（第 ${n}/${atk.startNeed} 重）。`
          + '门开的这一拍他顺势又出了一手。',
      })
    } else {
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'unseal', skill: `封印 ${n}/${atk.startNeed}`, kind: '指令', fx: atk.fx,
        line: line || undefined,
        note: `第 ${n} 重解开了 —— 还差 ${atk.startNeed - n} 下。`,
      })
    }
  }
  return s
}

/* ---------- 行动条推进 ---------- */

/** 出手的代价：扣掉一整条行动条，并让自己的增益走一格 */
function beginAction(s: BattleState, c: Combatant, extra = false) {
  c.bar = Math.max(0, c.bar - TUNING.barMax)
  /* 防御姿态在**本人下次出手时**自动撤 —— 它护的是「架起来的那一轮」，
     轮到自己动了，这一层就该收（被击溃过的痕迹也一起清掉）。
     放在这里而不是 endBeat：姿态是各人自己的事，与回合边界无关。 */
  c.stance = false
  c.stanceBroken = false
  if (c.taunt > 0) c.taunt -= 1
  const cut = 1 + (c.passive?.cdCut ?? 0)
  for (const id in c.cds) {
    c.cds[id] -= cut
    if (c.cds[id] <= 0) delete c.cds[id]
  }
  c.buffs = c.buffs.filter((b) => {
    b.t -= 1
    return b.t > 0
  })
  s.hand += 1
  /* 收拍的判据：**我方存活者各出过一手**（见 types 的 BattleState.acted）。
     不是不算敌人 —— 敌方的每一手照常打、照常记（s.hand 含敌方），
     也照常算在**当前这一回合里**；它只是**不推进回合边界**。边界由我方出手划。

     回手 / 拉条给的那一次（extra）不登记：主人明说「拉条不计入」。
     于是快的人一回合里出手两回也照收得齐，且不会提前收拍。
     旧口径按「出满场上这么多手」数，快的这一轮出两回、配额就永远凑不齐 —— 那才是卡住。 */
  if (c.side === 'ally' && !extra && !s.acted.includes(c.id)) s.acted.push(c.id)
  const live = s.allies.filter((x) => !x.down && x.gone <= 0)
  if (live.length > 0 && live.every((x) => s.acted.includes(x.id))) endBeat(s)
}

/**
 * 收一拍：一个轮回走完时结一次账。
 *
 * 这一摞原先挂在**充能脉冲**上（`advance` 里没人满格时的空转）：
 * 变身时长、停滞、流血、增益的按拍时限，都按脉冲数走。脉冲不是拍 ——
 * 双方速度差多大，一轮里就空转几格，同样写「3 拍」，快队与慢队差出好几倍。
 * 现在统一按拍算：一拍就是玩家眼里的一轮。
 *
 * ⚠️ 收拍判据是**我方存活者各出过一手**（`s.acted`，见 beginAction）——
 * 敌方的那几手照打照记，只是不参与划边界。于是同一段时长里的拍数比旧口径多，
 * 凡是按拍算的时限（`buffRoundsCap` / 变身 ticks / squadLinkTurns）都要按新尺度重标。
 */
function endBeat(s: BattleState) {
  s.tick += 1
  s.beatActs = 0
  s.acted = []
  /* 两条不耗回合的额度是**全队按回合**清的（不是按拍、也不是按人）：
     一回合里全队合起来各 1 次换装 / 1 次道具，谁先用谁占。 */
  s.freeUsed = { item: 0, gear: 0 }
  for (const c of allOf(s)) {
    // 合体蛰伏者：不充能、不回血，只数着拍子等归位
    if (c.gone > 0) {
      c.gone -= 1
      if (c.gone <= 0) {
        c.bar = 0
        pushLog(s, {
          round: s.hand, actorId: c.id, actor: c.name, side: c.side,
          skillId: 'merge-back', skill: '合体 · 归位', kind: '指令', fx: 'heal',
          note: `${c.name} 归位 —— 重新回到战列。`,
        })
      }
      continue
    }
    if (c.down) continue
    /* 停滞按拍数往下走 —— 被冻住的人不行动，也就轮不到 beginAction 给他减层，
       所以只能在这儿数。数到零就解开，行动条从他停下的地方接着涨。 */
    const st = c.buffs.find((b) => b.k === 'stasis')
    if (st) {
      st.t -= 1
      if (st.t <= 0) {
        c.buffs = c.buffs.filter((b) => b !== st)
        pushLog(s, {
          round: s.hand, actorId: c.id, actor: c.name, side: c.side,
          skillId: 'stasis-off', skill: '停滞 · 解除', kind: '指令', fx: 'heal',
          targetId: c.id, target: c.name,
          note: `${c.name} 动了 —— 停滞解开。`,
        })
      }
    }
    /* 流血：每一拍都掉，掉到失能为止。
       它不占出手、不看减伤 —— 治不了就得一路流下去，这是这一条的用意。 */
    const bl = bleedOf(c)
    if (bl > 0) {
      const dmg = Math.max(1, Math.round(c.hpMax * bl))
      c.hp = Math.max(0, c.hp - dmg)
      pushLog(s, {
        round: s.hand, actorId: c.id, actor: c.name, side: c.side,
        skillId: 'bleed', skill: '流血', kind: '指令', fx: 'slash',
        targetId: c.id, target: c.name, dmg,
        note: `${c.name} 在流血 —— 这一拍又少 ${dmg}。`,
      })
      if (c.hp <= 0 && !c.down) {
        c.down = true
        c.bar = 0
        pushLog(s, {
          round: s.hand, actorId: c.id, actor: c.name, side: c.side,
          skillId: 'down', skill: '失能', kind: '指令', fx: 'noise',
          targetId: c.id, target: c.name, down: true,
          note: `${c.name} 流尽了 —— 失去战力。`,
        })
        // 流血流倒的也照样牵天赋 ——「有人倒下」不问他是怎么倒的
        fireDownTalents(s, c)
      }
      /* 掉到线以下也算跌破（流血算真伤）—— 与 hit 里那一路同一个口子，
         少了这一句，「残血才响」的天赋会被一整段流血悄悄绕过去。 */
      if (!c.down) fireTalents(s, c, 'hpBelow', { tick: s.tick })
    }
    /* 增益的第二条时限：按拍数扣，扣完即散（见 TUNING.buffRoundsCap）。
       与 beginAction 里那份不冲突 —— 那份按「自身出场次数」扣。两条并行、谁先到零算谁，
       于是「这条增益还能挂多久」有一个按场上过了几拍算得出来的答案。
       放在停滞那一段之后：停滞有它自己的解除日志（stasis-off），
       别让这里抢先把人解冻，那样日志就漏了一笔。 */
    c.buffs = c.buffs.filter((b) => {
      if (b.rt == null) return true
      b.rt -= 1
      return b.rt > 0
    })
    // 变身的拍子：数满即解体，把借来的能力还回去，冷却从这一刻才起算
    if (c.morph) {
      /* 先长后数：这一拍他还顶着这副面目，那这一拍该涨的就该算上。
         涨的是技能表里那份拷贝的倍率，随解体一起还回去，不落到本体头上。 */
      if (c.morph.kind === 'form' && c.morph.ramp) {
        const b = c.skills.find((x) => x.kind === '普攻')
        if (b) b.power = Math.round((b.power + c.morph.ramp) * 100) / 100
      }
      c.morph.ticks -= 1
      if (c.morph.ticks <= 0) {
        const m = c.morph
        c.axes = { ...m.base.axes }
        c.spd = m.base.spd
        c.skills = m.base.skills
        c.cds[m.skillId] = m.cd
        c.buffs.push({ k: 'atk', v: -0.12, t: m.cd, rt: TUNING.buffRoundsCap })
        c.buffs.push({ k: 'slow', v: 0.12, t: m.cd, rt: TUNING.buffRoundsCap })
        pushLog(s, {
          round: s.hand, actorId: c.id, actor: c.name, side: c.side,
          skillId: m.kind === 'form' ? 'form-off' : 'morph-off',
          skill: m.kind === 'form' ? '变身 · 解体' : '变形 · 解除',
          kind: '指令', fx: 'seal',
          note: m.kind === 'form'
            ? `「${m.name}」散开了 —— ${c.name} 变回自己，接下来 ${m.cd} 拍发虚。`
            : `${c.name} 变回自己 —— 借来的东西还了回去，接下来 ${m.cd} 拍手感发虚。`,
        })
        c.morph = null
      }
    }
  }
  /* 天赋 · 每逢 N 个回合（`on: 'round'`）—— 排在整拍的账都结完之后：
     这一刻的「第几回合」与面板上顶栏那个读数是同一个数（见 advance 的 tick）。 */
  for (const c of allOf(s)) fireTalents(s, c, 'round', { tick: s.tick })
}

/**
 * 这一窗口谁先动。
 *
 * 门槛照旧是「条满」（`barMax`），改的只有**同窗口内怎么抢**：
 * 原先比的是 `bar - barMax` 的余量 —— 那是速度的线性映射，快的人一路插队。
 * 离散化之后大家按同一把尺子涨条，「满了多少」不再说明谁快，
 * 所以改按 `chargeOf` 降序：**真正快的人先手**。
 * 同速时我方先（玩家少等一次），再同就按 id，完全确定 —— 脚本跑得出同一个结果。
 */
function readyList(s: BattleState): Combatant[] {
  return allOf(s)
    .filter((c) => !c.down && c.gone <= 0 && c.bar >= TUNING.barMax)
    .sort(
      (a, b) =>
        chargeOf(b) - chargeOf(a) ||
        (a.side === b.side ? 0 : a.side === 'ally' ? -1 : 1) ||
        a.id.localeCompare(b.id),
    )
}

/** 推进到下一个「我方待选择」的时点；途中的敌方回合自动结算 */
export function advance(s: BattleState): BattleState {
  let guard = 0
  while (s.phase === 'select' && guard++ < 8000) {
    const ready = readyList(s)
    if (ready.length === 0) {
      /* 没人满格：只空转充能。
         拍子的结账不在这儿 —— 见 endBeat()，那摞原先挂在这段空转上的东西
         已经按「一个轮回」结算了。 */
      const live = allOf(s).filter((c) => !c.down && c.gone <= 0)
      /* 兜底：场上活着的人全被冻住时，谁都没法出手，配额永远填不满 ——
         那这一拍就自己往下走。少了这一条，停滞会卡在「还没数到零」上永远解不开。 */
      if (live.length > 0 && live.every((c) => stasisOf(c) > 0)) endBeat(s)
      /* 一次推足「最快那一位到满还差几窗口」格 —— 但**逐格推**：
         被动回血 / 回体是按格算的，一步乘上去会漏掉中间那几格。
         windowCap 兜底；有人满了就停，交回给上面重排。 */
      const eta = live.length ? Math.min(...live.map(etaOf)) : 1
      const steps = Math.max(1, Math.min(TUNING.windowCap, Number.isFinite(eta) ? Math.ceil(eta) : 1))
      for (let i = 0; i < steps; i++) {
        for (const c of live) {
          c.bar = Math.min(TUNING.barMax * 2, c.bar + windowGainOf(c))
          const p = c.passive
          if (p?.regen && c.hp < c.hpMax) {
            c.hp = Math.min(c.hpMax, c.hp + Math.max(1, Math.round(c.hpMax * p.regen)))
          }
          /* 恢复途径②：每空转一格回节拍。
             两个来源相加 —— 被动给的那个（PassiveSpec.tempoRegen）和**职能**给的
             （DutyDef.tempoRegen：护卫 / 和音 / 调度各回 1，主音 / 取材 回 0）。
             主音回 0 是有意的：他最缺节拍，而他的节拍只能从「打」里来（途径①③④）。 */
          const back = (p?.tempoRegen ?? 0) + dutyOf(c.duty).tempoRegen
          if (back > 0 && c.tempo < c.tempoMax) {
            c.tempo = Math.min(c.tempoMax, c.tempo + back)
          }
        }
        if (live.some((c) => c.bar >= TUNING.barMax)) break
      }
      continue
    }
    /* 「回手」：解封尽解的那一位下一手还是他，不看行动条先后。
       只认一次 —— 消费掉就清，免得他一路连着动下去。 */
    let cur = ready[0]
    /** 这一手是不是「回手」给的那一次 —— 只有它不收进 acted（见 beginAction） */
    let extra = false
    if (s.again) {
      const back = ready.find((c) => c.id === s.again)
      s.again = null
      if (back) { cur = back; extra = true }
    }
    /* 断拍 / 破绽：轮到他了，但这一拍被划掉。
       不是「没轮到他」—— 他确实轮到了，所以条要照扣（否则他会一直堵在队首，
       把后面所有人一起卡住）；但**不回冷却**，那正是这一手狠的地方。
       放在这里而不是在 readyList 里过滤，就是为了让「条被扣掉」这件事真的发生。 */
    if (skipOf(cur) > 0) {
      // 两样可能同时挂着（先被断拍、又挨了破绽）。日志要把**在场的都念出来**，
      // 只报头一个的话，玩家会以为自己那一下破绽没生效。
      const stalled = buffOf(cur, 'stall') > 0
      const broken = cur.broken > 0
      const why = stalled && broken ? '断拍 · 破绽' : stalled ? '断拍' : '破绽'
      cur.bar = Math.max(0, cur.bar - TUNING.barMax)
      if (cur.taunt > 0) cur.taunt -= 1
      cur.buffs = cur.buffs.filter((b) => { b.t -= 1; return b.t > 0 })
      if (broken) cur.broken -= 1
      pushLog(s, {
        round: s.hand, actorId: cur.id, actor: cur.name, side: cur.side,
        skillId: stalled ? 'stall-off' : 'break-off',
        skill: why, kind: '指令', fx: 'seal',
        targetId: cur.id, target: cur.name,
        note: `${cur.name} 这一次出手没了 —— 条照扣，这一拍什么也没打出来`
          + (broken ? '（身上还压着那道破绽）。' : '（断拍未解）。'),
      })
      continue
    }
    if (cur.side === 'enemy') {
      // 接通接口时，这一手不由引擎决定：停在 'think' 让视图去问，
      // 算完 enemysTurn() 把 intent 交回来，这里从同一个 cur 续上。
      if (s.command === 'ai' && !s.intent) {
        s.actor = cur.id
        s.phase = 'think'
        return s
      }
      beginAction(s, cur, extra)
      const it = s.intent
      s.intent = null
      if (it && it.foeId === cur.id) enemyActWith(s, cur, it)
      else enemyAct(s, cur)
      checkEnd(s)
      if (s.phase !== 'select') {
        s.actor = null
        return s
      }
      continue
    }
    s.actor = cur.id
    s.fleeOdds = fleeOddsOf(s)
    return s
  }
  s.actor = null
  return s
}

/* ---------- 我方指令 ---------- */

function cmdLog(s: BattleState, c: Combatant, skill: string, note: string, fx: LogEntry['fx'] = 'guard') {
  pushLog(s, {
    round: s.hand, actorId: c.id, actor: c.name, side: c.side,
    skillId: 'cmd', skill, kind: '指令', fx, note,
  })
}

/** 我方出手。equip 不消耗回合，其余五道各消耗一条行动条。 */
export function act(s: BattleState, cmd: Command): BattleState {
  if (s.phase !== 'select') return s
  const me = s.actor ? find(s, s.actor) : undefined
  if (!me || me.side !== 'ally' || me.down) return s
  /* 这一手里打穿的破绽 —— 追击的条件①读它，所以每手开头清。
     不清的话「上一手打穿过」会一直挂着，后来每一手都白接一记追击。 */
  s.lastBreak = []

  /* —— 两条不消耗回合的指令：换装 / 道具 ——
     BS2 的第四条。它们**不走 beginAction**：不扣行动条、不减冷却、不扣增益时限、
     不 hand++、不登记本回合已出手、不蓄追击槽 —— 换句话说，它们不算「出手」，
     这一拍仍然属于同一个人（他还能接着出真正的一手）。
     代价是**每回合各限几次**（TUNING.freePerBeat，endBeat 清零）：
     少了这道限，全队轮流甩道具就能在别人的回合里把仗打完。 */
  const spendFree = (slot: 'item' | 'gear'): boolean => {
    const cap = TUNING.freePerBeat[slot]
    if ((s.freeUsed[slot] ?? 0) >= cap) return false
    s.freeUsed[slot] = (s.freeUsed[slot] ?? 0) + 1
    return true
  }

  if (cmd.t === 'equip') {
    if (!spendFree('gear')) return s
    const next = cmd.gearId ?? undefined
    const g = next ? GEAR_OF[next] : undefined
    // 整块重算面板（轴值 / 充能 / 闪避 / 减伤 / 附带技能），只保留场上的临时状态
    const fresh = combatantOf(me.id, s.progress, s.growth[me.id] ?? 0, next)
    Object.assign(me, fresh, {
      hp: me.hp, bar: me.bar, buffs: me.buffs, taunt: me.taunt,
      down: me.down, startUsed: me.startUsed, stack: me.stack, cds: me.cds,
      // ⚠️ cds 必须原样保留：换装只重建面板，绝不碰冷却 ——
      // 否则装具技 A→B→A 就能把冷却刷掉（见 §6 两条不耗回合）
      tempo: me.tempo, note: me.note,
    })
    // 羁绊是队伍层的东西：重建后要按全队名单重新落一遍，不然换件装备就掉了
    applySynergies([me], s.allies.map((c) => c.id), s.bond)
    cmdLog(s, me, '更换装备', g
      ? `${g.name} 装配完毕 · 不消耗回合（本回合还剩 ${TUNING.freePerBeat.gear - s.freeUsed.gear} 次）`
      : '已卸下装具 · 不消耗回合', 'gear')
    return s
  }

  /* —— 道具：同样不消耗回合 ——
     存量（背包格数）是第一道限，额度是第二道。这一条是**强度上调**：
     从前丢一剂镇静剂要占掉一整拍，现在它可以和别人的出手叠在同一拍里。 */
  if (cmd.t === 'item') {
    const it = ITEM_OF[cmd.itemId]
    if (!it || (s.bag[cmd.itemId] ?? 0) <= 0) return s
    if (!spendFree('item')) return s
    s.bag[cmd.itemId] = (s.bag[cmd.itemId] ?? 0) - 1
    /* 恢复途径③：道具回节拍。丢药那一拍**不花节拍**（没走 beginAction），
       所以这里回的是「白赚」的 —— 于是药不该是攒节拍的路子，只回一点点，
       真指着它回节拍的人（主音）会发现自己一直在丢药、一直没出手。 */
    gainTempo(me, TUNING.itemTempo)
    const targets = it.target === 'allyAll' ? aliveOf(s.allies)
      : it.target === 'enemyOne' ? (() => { const t = cmd.targetId ? find(s, cmd.targetId) : undefined; return t && !t.down && t.gone <= 0 ? [t] : [] })()
      : (() => {
          const t = cmd.targetId ? find(s, cmd.targetId) : undefined
          if (it.effect.revive) return t ? [t] : []
          return t && !t.down && t.gone <= 0 ? [t] : [me]
        })()
    if (it.effect.revive) {
      for (const t of targets) {
        if (!t.down) continue
        t.down = false
        t.hp = Math.max(1, Math.round(t.hpMax * TUNING.reviveHp))
        t.bar = 0
      }
    }
    pushLog(s, {
      round: s.hand, actorId: me.id, actor: me.name, side: me.side,
      skillId: it.id, skill: `道具 · ${it.name}`, kind: '指令', fx: 'item',
      target: targets.map((t) => t.name).join('、') || undefined,
      note: `${it.desc} · 不消耗回合（本回合还剩 ${TUNING.freePerBeat.item - s.freeUsed.item} 次）`,
    })
    /* 敌向的道具（target: 'enemyOne'，现在只有镇静剂）要走 **hostileTargets** 那一栏：
       `clearBar` 的清咏唱、`mark` 这类压制，全都在 applyEffect 的敌向那一圈里。
       从前一律塞进友方那一栏、敌向给空数组 —— 于是镇静剂只把行动条清零、
       咏唱纹丝不动，与 types 里写死的设计（清条即破咏唱）对不上。 */
    const toFoe = it.target === 'enemyOne'
    applyEffect(s, me, it.effect, toFoe ? [] : targets, toFoe ? targets : [], 3)
    return s
  }

  /* —— 战略撤退 —— */
  if (cmd.t === 'flee') {
    beginAction(s, me)
    const odds = s.fleeOdds
    if (Math.random() < odds) {
      s.phase = 'fled'
      cmdLog(s, me, '战略撤退', `小队脱离交战区域（成功率 ${Math.round(odds * 100)}%）。`, 'drone')
      s.actor = null
      return s
    }
    cmdLog(s, me, '战略撤退 · 失败', `退路被封（成功率 ${Math.round(odds * 100)}%）—— 这一手白费了。`, 'noise')
    return advance(s)
  }

  /* —— 消耗回合的三手 —— */
  /* 出手之前他是不是已经顶着那头狮子 —— 变身那一手本身不算「攻击后」，
     所以这个状态要在 resolve 之前取（resolve 会把变身安上去）。 */
  const lionBefore = me.morph?.kind === 'form'
  /** 这一手是不是「攻击」（真的打出去了才算 —— 增益、变身、治疗都不算） */
  let attacked = false
  if (cmd.t === 'atk') {
    const k = basicOf(me)
    if (!k) return s
    me.tempo = Math.max(0, me.tempo - k.cost)
    /* 恢复途径①：普攻回节拍 —— 由**职能**给（主音 1、调度 2…见 DutyDef.basicTempo）。
       这一条是主音那条「离了节拍就哑火」的活路：打不动了还能靠普攻一点点攒回来，
       但攒得最慢的就是他 —— 于是「谁能一直普攻」不会变成最优解。 */
    gainTempo(me, dutyOf(me.duty).basicTempo)
    attacked = k.power > 0
    beginAction(s, me)
    resolve(s, me, k, cmd.targetId)
  } else if (cmd.t === 'skill') {
    const k = legalSkills(me, s).find((x) => x.id === cmd.skillId)
    if (!k || k.cost > me.tempo || (me.cds[k.id] ?? 0) > 0) return s
    me.tempo = Math.max(0, me.tempo - k.cost)
    attacked = k.power > 0
    // 记下这一手：boss 的「回响」会照着它原样打回来
    s.lastSkill = k
    beginAction(s, me)
    resolve(s, me, k, cmd.targetId)
  } else if (cmd.t === 'guard') {
    beginAction(s, me)
    /* 防御姿态：**架起来是一层状态，不是一条护罩 buff**。
       减伤、免暴击、吃掉硬直、充能 ×1.5 四件事都读 `stance`，闪避则整个交出去
       （见 evadeOf / damageOf / rollCrit / windowGainOf）。做成一层状态是为了
       「击溃」那一手能一次把四件事全收走 —— 拆 buff 的话还得去找是哪一条。
       它在**本人下次出手时自动撤**（见 beginAction），所以姿态只覆盖这一轮。 */
    me.stance = true
    me.stanceBroken = false
    const rec = Math.round(TUNING.guardRecover + me.axes.意志力 * TUNING.guardRecoverPerWill)
    const got = Math.min(me.tempoMax, me.tempo + rec) - me.tempo
    me.tempo += got
    // 槽满了却一直在防御 —— 把话说在日志里。
    // 防御只把这一拍交给搭档（照样蓄槽），**接**招要有人真的出手；
    // 不写这一句，玩家只看到槽停在上限，不知道差在哪。
    // 只报**团队**连携那一条：双人那些走条件追击，没有槽可满（见 linkReady）
    const waiting = bondsOf(s.allies.map((c) => c.id), s.bond).filter(
      (b) => b.squad && linkReady(s, b) && (s.followCd?.[b.id] ?? 0) <= 0,
    )
    pushLog(s, {
      round: s.hand, actorId: me.id, actor: me.name, side: me.side,
      skillId: 'cmd', skill: '防御', kind: '指令', fx: 'guard', stance: 'on',
      note: `架势架起 —— 减伤 ${Math.round(TUNING.guardCut * 100)}%、挨不暴击、`
        + `硬直硬吃，代价是这一轮闪避归零；喘息回了一口气（节拍 +${got}）。`
        + (waiting.length
          ? `　—— 全员能量满（${waiting.map((b) => b.name).join('、')}）：`
            + '这一拍只是架着，得有人真打出去，他们才接得上。'
          : ''),
    })
  }

  // 追击与连携：这一手算进共鸣槽，条件满足了就自己接上（都不由玩家点）
  // 两件事分开算：谁出手都给槽添笔（含防御 —— 架盾也是把这一拍交给了搭档），
  // 但**接**这一下要有人真的出手。分这一刀是因为连着算时，四个人一起龟缩
  // 反倒能一手接一手地放合击，把「连携」做成了缩着不动的奖励。
  // 现在缩着只会把槽蓄满 —— 谁先动，这一手就跟着谁出去。
  chargeLinks(s, me.id)
  // 「启动」也是调音，不是出手：那几手只把这一拍交给搭档（照蓄槽），不接招。
  // 与防御同一个道理 —— 拧弦的动作不该把搭档的合击甩出去。这一刀不切，
  // 恋兔光封印期的那五下启动就会替全队把合击提前打光，门还没解，敌人先死了。
  const isTune = cmd.t === 'skill'
    && me.skills.some((x) => x.id === cmd.skillId && x.gate)
  if (cmd.t !== 'guard' && !isTune) {
    // 顶着黄金狮子的那几拍，双人连携不看条件 —— 先接它，别的照旧
    // （否则同一手会把同一条连携接两遍）。
    if (lionBefore && attacked) fireLionFollow(s, me.id)
    // 两条出口：条件追击（双人那些）先走，团队连携（共鸣槽满）后走
    fireFollows(s, me.id)
    fireTeamLink(s, me.id)
  }

  /* 天赋 · 本人出手那一下（`on: 'act'`）—— 排在追击之后：
     「出完这一手，天赋再响」读起来才对；防御也算出手（`act` 的语义是「轮到他动」）。 */
  fireTalents(s, me, 'act', { tick: s.tick })

  checkEnd(s)
  if (s.phase !== 'select') {
    s.actor = null
    return s
  }
  return advance(s)
}

/* ---------- 追击与连携 · 自动触发 ----------
   两套东西，**触发机制不同**（主人 2026-09-15 定）：
     · 团队羁绊连携（`Bond.squad`，恋兔队那条）—— 走**共鸣槽**：
       一人一条自己的能量，全员都满才成立（`s.follow`，键是人的 id）。
     · 追击 —— 走**条件**：搭档这一手满足了条件，另一位就自己接一手
       （`fireFollows`，两条条件见 `followCondition`）。
       它包含双人连携（`PAIRS` 那几条）：双人的合击由追击这个机制带出去。
   两套都**不由玩家点**，都不占出手者的回合、不耗节拍 —— 打出来的自然接得上。
   `followCd` 是两套共用的限速（按 id），`link` 那三个旧字段已经并进来。
   ------------------------------------------------------------ */

/**
 * 冷却按「我方出手」计（与槽同一口径），与是谁出手无关。
 *
 * `link.cd` 本来就在每条连携上写着（黄金狮子 cd 4、恋兔队 cd 5），
 * 但 fireFollows 从来没读过它 —— 于是羁绊一深，合击就能一手接一手地连，
 * 一场仗打成了连续合击。冷却是这套东西真正的限速，槽只是「够不够格」。
 *
 * 与蓄槽拆开是为了让连携**自己**那一手也能蓄槽（见 fireTeamLink）：
 * 蓄槽要能单叫，不然接完连携再补一笔，会顺手把自己刚上的冷却减掉一拍。
 */
function tickFollowCd(s: BattleState) {
  s.followCd = s.followCd ?? {}
  for (const id of Object.keys(s.followCd)) {
    if (s.followCd[id] > 0) s.followCd[id] -= 1
  }
}

/**
 * 某个人出了一手 —— 把**团队羁绊连携**那些共鸣槽各添一笔。
 * 「恋兔队必须全员都在才能触发」不是提示文案 —— 是槽要满编的人一人添一笔才满。
 *
 * 只认 `b.squad` 那几条：双人那些走条件追击，不攒槽（见 followCondition）。
 */
function chargeGauge(s: BattleState, actorId: string) {
  s.follow = s.follow ?? {}
  const bonds = bondsOf(s.allies.map((c) => c.id), s.bond)
  if (!bonds.length) return
  for (const b of bonds) {
    if (!b.squad || !b.members.includes(actorId)) continue
    // 整队那条：添的是**出手者自己**那条能量 —— 别人替他攒不了
    s.follow[actorId] = Math.min(b.need, (s.follow[actorId] ?? 0) + 1)
  }
}

function chargeLinks(s: BattleState, actorId: string) {
  tickFollowCd(s)
  chargeGauge(s, actorId)
}

/**
 * 这条**团队**连携此刻够不够门槛。
 *
 * 看的不是拍数，是**名单上每个人自己的能量**：一人一条，别人替他攒不了，
 * 所以必须全员都满才成立；少一个人在场也凑不齐。
 *
 * 防御那一条提示与 fireTeamLink 都得读它。两处各写一遍的话，
 * 「槽满了」的提示与实际接不接得上迟早会打架 —— 玩家只信日志，日志不能撒谎。
 *
 * ⚠️ 双人那些**不在这儿**：它们没有槽，门槛在 `followCondition` 里。
 */
function linkReady(s: BattleState, b: Bond): boolean {
  if (!b.squad) return false
  // 先要「全员到场」：缺一个就凑不齐
  for (const id of b.members) {
    const c = find(s, id)
    if (!c || c.down || c.gone > 0) return false
  }
  // 再要「每个人都把自己那份攒满」：一人一条能量，别人替他攒不了
  return b.members.every((id) => (s.follow?.[id] ?? 0) >= b.need)
}

/** 一条追击/连携的参加者里，此刻还站着的那些（缺一个就凑不齐） */
function liveMembers(s: BattleState, b: Bond): Combatant[] {
  const live = b.members
    .map((id) => find(s, id))
    .filter((c): c is Combatant => !!c && !c.down && c.gone <= 0)
  return live.length === b.members.length ? live : []
}

/** 场上还站着的敌体里，正在咏唱的那些（槽里攒了、还没放出来） */
function chantingFoes(s: BattleState): Combatant[] {
  return aliveOf(s.enemies).filter((f) => Object.values(f.chant ?? {}).some((n) => n > 0))
}

/**
 * 双人追击的**触发条件**（初版两条）—— 搭档出手时问一次，答得上就由另一位接一手。
 *
 *   ① **打穿了破绽**：这一手削穿了哪个敌体的破绽（见 `s.lastBreak`）。
 *      破绽是「观测成立」的窗口，趁这个窗口补的一手本来就该更痛 ——
 *      敲破绽的人和搭档配合，正是这一条要长出来的东西。
 *   ② **对面正在咏唱**：场上有敌体攒着终结技能没放（见 `chantingFoes`）。
 *      咏唱那几拍是全队最该往上压的时候，搭档一动手，另一位就跟着上。
 *
 * 返回触发理由；没触发返回 null。理由要写进日志 —— 玩家得知道「为什么这次接上了」，
 * 不然追击读起来就是随机发生的东西。
 */
function followCondition(s: BattleState, actor: Combatant): string | null {
  const broke = s.lastBreak
    .map((id) => find(s, id))
    .filter((c): c is Combatant => !!c && c.side === 'enemy')
  if (broke.length) {
    return `${actor.name} 打穿了 ${broke.map((c) => c.name).join('、')} 的破绽`
  }
  const chanting = chantingFoes(s)
  if (chanting.length) {
    return `${chanting.map((c) => c.name).join('、')} 正在咏唱`
  }
  return null
}

/**
 * 接一手 —— 追击与团队连携**共用**的那一脚。
 *
 * 执手的人各不相同：团队连携由出手者带出去，双人追击由**另一位**接
 * （条件是你满足的，这一下是搭档补的）。两条都从这儿出去，
 * 是为了 `link-<id>` 那个技能 id 与 `link` 那份载荷只写一次 ——
 * 上层（作战屏右侧那张牌、冒烟、复核）钉的就是它们，两处各写一份迟早会漂。
 */
function fireLinkHand(
  s: BattleState, b: Bond, actor: Combatant, live: Combatant[],
  target: Combatant, note: string,
) {
  pushLog(s, {
    round: s.hand, actorId: actor.id, actor: actor.name, side: actor.side,
    skillId: `link-${b.id}`, skill: `连携 · ${b.name}`, kind: '战技', fx: b.link.fx,
    tone: 'strike', scope: b.squad ? 'all' : 'one',
    note,
    // 参加者与招式名整份带上：右侧那张连携牌直接照着这条日志立起来
    link: { id: b.id, name: b.link.name, members: live.map((c) => c.id) },
  })
  resolve(s, actor, {
    id: `link-${b.id}`,
    name: b.link.name,
    kind: '战技',
    desc: b.link.desc,
    cost: 0,
    power: b.link.power,
    axis: b.link.axis,
    fx: b.link.fx,
    line: b.link.line,
    target: 'one',
    linkUnits: live.filter((c) => c.id !== actor.id).map((c) => c.id),
    linkPow: b.link.linkPow,
  }, target.id)
}

/** 挑最薄的那个打（追击与连携都照这一条选靶） */
function pickLinkTarget(s: BattleState): Combatant | undefined {
  const foes = aliveOf(s.enemies)
  if (!foes.length) return undefined
  return [...foes].sort((a, c) => a.hp - c.hp)[0]
}

/**
 * **条件触发的追击**：搭档这一手满足了条件，另一位接一手。
 *
 * 双人连携就是从这里出去的 —— 它们没有共鸣槽，只看条件与冷却。
 * ⚠️ 黄金狮子那一条**不在此列**：它不是「打熟了自然接得上」，
 * 是「她此刻就在他手里」，由形态单独带（见 fireLionFollow）。
 *
 * ⚠️ **一手至多接一记**。条件挂在「这一手做了什么」上（打穿破绽 / 对面在咏唱），
 * 而操作员同时挂在六条双人羁绊上 —— 一个破绽打穿、一次对面起咏唱，
 * 六条会同时满足。全接下来就不是「搭档补一手」，是白送六拳，
 * 主人抱怨的那种「一手把整场拉走」又回来了。所以这儿的取舍是**一条**：
 * 谁跟你最熟，谁先接上（`bondFloorOf`，与槽/冷却的尺同一把）——
 * 攒羁绊于是看得见：同样一个破绽，接上来的是你这会儿最亲近的那位。
 */
function fireFollows(s: BattleState, actorId: string) {
  const bonds = bondsOf(s.allies.map((c) => c.id), s.bond)
  if (!bonds.length) return
  s.followCd = s.followCd ?? {}
  const actor = find(s, actorId)
  if (!actor) return
  const why = followCondition(s, actor)
  if (!why) return
  let pick: Bond | null = null
  let pickDepth = -1
  for (const b of bonds) {
    if (b.squad) continue                                  // 团队那条走共鸣槽
    if (b.id === LION_PAIR_ID) continue                    // 黄金狮子走形态那一路
    if ((s.followCd[b.id] ?? 0) > 0) continue              // 还在冷却
    if (!b.members.includes(actorId)) continue             // 得是这一对的参加者动的
    const live = liveMembers(s, b)
    if (!live.length) continue
    // 「另一位接」——出手的那位把这一下交给搭档，两人同轴相加的总量不变
    const mate = live.find((c) => c.id !== actorId)
    if (!mate) continue
    const depth = bondFloorOf(b.members, s.bond)
    // 并列时取前头那一条（`bondsOf` 的次序是定的）—— 结果完全确定，脚本可复现
    if (depth > pickDepth) { pick = b; pickDepth = depth }
  }
  if (!pick) return
  const live = liveMembers(s, pick)
  const mate = live.find((c) => c.id !== actorId)
  const target = pickLinkTarget(s)
  if (!mate || !target) return
  s.followCd[pick.id] = pick.cd
  fireLinkHand(s, pick, mate, live, target,
    `${why} —— ${mate.name} 顺着这一下接了上去（${live.map((c) => c.name).join('、')} 合击）。`
      + '（这一手只接得上一记：搭档里最熟的那位先上。）')
}

/**
 * **共鸣槽满即接**：整队连携（特殊连携）。
 * 它不是「再补一脚」，是全队一起吃的那一份 —— 全员到场、全员满能量才换得来的那几拍。
 */
function fireTeamLink(s: BattleState, actorId: string) {
  const bonds = bondsOf(s.allies.map((c) => c.id), s.bond)
  if (!bonds.length) return
  s.follow = s.follow ?? {}
  s.followCd = s.followCd ?? {}
  /** 这一手接上了连携的人 —— 收尾时按「他们也出了场」给共鸣补笔（见函数末） */
  const tookPart: string[] = []
  for (const b of bonds) {
    if (!b.squad) continue                                 // 双人那些走 followCondition
    if ((s.followCd[b.id] ?? 0) > 0) continue               // 还在冷却 —— 槽满了也接不上
    const live = liveMembers(s, b)
    if (!live.length) continue
    // 执手的人必须是这条羁绊的参加者 —— 这一手是「他们」接上的，
    // 旁人出招接不上（否则槽一满，随便谁动一下都能替他们打出来）。
    const actor = live.find((c) => c.id === actorId)
    if (!actor) continue
    const target = pickLinkTarget(s)
    if (!target) continue
    if (!linkReady(s, b)) continue                          // 门槛分开算，见 linkReady
    for (const c of live) s.follow[c.id] = 0
    s.followCd[b.id] = b.cd
    /* 整队连携（特殊连携）：把巨量加成按各人自己的持续拍数落下去 ——
       全员到场、全员满能量才换得来的那几拍。 */
    for (const c of live) {
      addBuff(c, 'atk', TUNING.squadLinkAtk, TUNING.squadLinkTurns)
      addBuff(c, 'spd', TUNING.squadLinkSpd, TUNING.squadLinkTurns)
      addBuff(c, 'shield', TUNING.squadLinkShield, TUNING.squadLinkTurns)
      addBuff(c, 'evade', TUNING.squadLinkEvade, TUNING.squadLinkTurns)
    }
    fireLinkHand(s, b, actor, live, target,
      `全员能量满 —— ${live.map((c) => c.name).join('、')} 一起压了上去。`
        + `接下来 ${TUNING.squadLinkTurns} 拍，参加者全体攻击 +${Math.round(TUNING.squadLinkAtk * 100)}%、`
        + `充能 +${Math.round(TUNING.squadLinkSpd * 100)}%、`
        + `减伤 ${Math.round(TUNING.squadLinkShield * 100)}%、`
        + `闪避 +${Math.round(TUNING.squadLinkEvade * 100)}%。`)
    tookPart.push(...live.map((c) => c.id))
  }
  /* 接上连携的这一手，本身也算参加者出过场 —— 所以连携**也**往共鸣里添笔。
     不然连携就是纯消耗：攒满、清空、再从零攒，接得越勤越像一次性的。
     补在整轮之后：同一条连携在一手里最多自己把自己续回一格，不会当场连着接第二下
     （冷却才是限速那一道，见 tickFollowCd）。 */
  for (const id of new Set(tookPart)) chargeGauge(s, id)
}

/**
 * 黄金狮子 · 每一手攻击都接得上的那一记双人连携。
 *
 * 它**不属于**条件追击那一路（见 fireFollows）：那不是「打熟了自然接得上」，
 * 是**她此刻就在他手里** —— 丝线缠在拳面上、缠在獠牙上，
 * 他每打出去一手，她那一份就跟着出去一次。
 * 所以这几拍里不看条件、不等槽，每一手攻击后自己接上，且不动槽里那一笔。
 *
 * 参加者按条规不能少人：露娜倒了、被归档收走了，这一记就接不上。
 * 它也有自己的冷却（连携上写的 cd）—— 那是「她跟得上几次」的限速。
 */
function fireLionFollow(s: BattleState, actorId: string) {
  const b = bondsOf(s.allies.map((c) => c.id), s.bond).find((x) => x.id === LION_PAIR_ID)
  if (!b) return
  s.followCd = s.followCd ?? {}
  if ((s.followCd[b.id] ?? 0) > 0) return
  const live = liveMembers(s, b)
  if (!live.length) return
  const actor = live.find((c) => c.id === actorId)
  if (!actor) return
  const target = pickLinkTarget(s)
  if (!target) return
  // 槽里那一笔留给他们自己攒：这几拍接的是「她在手上」，不是「槽满了」
  s.followCd[b.id] = b.cd
  fireLinkHand(s, b, actor, live, target,
    `${actor.name} 打出去的那一手还没收，丝线已经顺着同一个方向缠上去了 ——`
      + `${live.map((c) => c.name).join('、')} 又接了一记。`)
}

/* ---------- 敌方 AI ---------- */

function pickTarget(s: BattleState, foe: Combatant): Combatant | undefined {
  const live = aliveOf(s.allies)
  if (live.length === 0) return undefined
  // 引仇：有人架着盾就优先打他
  const taunting = live.filter((a) => a.taunt > 0)
  if (taunting.length) return taunting[Math.floor(Math.random() * taunting.length)]
  const tags = foe.tags.join('')
  if (tags.includes('机械')) return [...live].sort((a, b) => b.axes.破坏力 - a.axes.破坏力)[0]
  if (tags.includes('魔王')) return [...live].sort((a, b) => a.hp - b.hp)[0]
  return live[Math.floor(Math.random() * live.length)]
}

/**
 * 终结技能的咏唱推进。蓄满这一手就放它；没满则照常出手、顺带给咏唱添一拍。
 * @returns 这一手是否已被大招占掉
 */
function ultStep(s: BattleState, foe: Combatant, t: Combatant): boolean {
  const u = ultOf(foe)
  if (!u) return false
  if ((foe.chant[u.id] ?? 0) >= (u.ult ?? 1)) {
    foe.chant[u.id] = 0
    pushLog(s, {
      round: s.hand, actorId: foe.id, actor: foe.name, side: foe.side,
      skillId: 'chant-fire', skill: `终结技能 · ${u.name}`, kind: '战技', fx: u.fx,
      note: `咏唱完毕 —— 它把攒下的一切一次放了出来。`
        + (ultDebuffs(foe) ? `（身上 ${ultDebuffs(foe)} 层减益已把这一击削去一截）` : ''),
    })
    resolve(s, foe, u, t.id)
    return true
  }
  foe.chant[u.id] = Math.min(u.ult ?? 1, (foe.chant[u.id] ?? 0) + 1)
  return false
}

/**
 * 召唤：把一只半成形的同性质实体喊上场（首领与精英才带得了这一手，见 derive 的 SUMMON_MOVE）。
 *
 * 上限判的是 **s.enemies 的长度**，也就是「这一场打过多少东西」——
 * 不是「场上还剩几个」。后者会让「打掉一个补一个」成立，而收场判的正是
 * 「场上没人了」（见 checkEnd），于是这场仗永远收不了。
 * s.enemies 只增不减（倒下的也留在里面），所以它的长度天然是这一场的总数。
 *
 * 这一手喊的是**谁**，看技能上挂的是哪一份展开：
 *   · 没有 `summonPack` —— 喊的是这片现实里现推的半成形杂兵（derive 的 minionOf）；
 *   · 有 `summonPack` —— 喊的是**真正站在对面的人**，按名单依次出场
 *     （derive 的 rivalOf，五轴与技能照搬本人）。骷髅假面之男的亡灵军团走的是这一支。
 *
 * @returns 这一手是否真的用来喊人了（false = 它没这一手／到顶了／还在冷却）
 */
export function summonFoe(s: BattleState, foe: Combatant): boolean {
  const k = foe.skills.find((x) => x.summon)
  if (!k) return false
  if (s.enemies.length >= TUNING.enemyCap) return false
  if ((foe.cds[k.id] ?? 0) > 0) return false

  /* 名单走到第几个 —— 数场上**已有的同行者**，不另存一份进度。
     s.enemies 只增不减，倒下的同行者也在里面，所以数一遍就是进度：
     喊到「丙」就不会回头再喊「乙」，也不会同一个人站两次。 */
  const named = k.summonPack
  const nth = named
    ? s.enemies.filter((e) => e.tags.includes(RIVAL_TAG)).length
    : 0
  /* 名单喊空了 —— 这一手就到此为止，不必再冷却。留着它在牌面上，
     enemyAct 每次都白搭一手进去（见该函数第一行的分支）。 */
  if (named && nth >= named.length) return false

  const m = named
    ? rivalOf({
        id: named[nth]!, progress: s.progress, stage: s.stage, place: s.place,
      })
    : minionOf({
        missionId: s.missionId, nature: s.nature, place: s.place, stage: s.stage,
        progress: s.progress,
        // 排位取当下长度：它接下来就要占这个位置，甲乙丙丁也就接在这后面
        slot: s.enemies.length,
      })
  if (!named) s.summoned = (s.summoned ?? 0) + 1
  s.enemies.push(m)
  // 这一手自己也有冷却（走「自身出手次数」，见 beginAction）——
  // 不然首领每一手都在喊人，它自己一次都不打，那就不叫首领，叫传送门。
  foe.cds[k.id] = k.cd ?? 4
  pushLog(s, {
    round: s.hand, actorId: foe.id, actor: foe.name, side: foe.side,
    // skill 报这一手自己的名字（与其他技能同一口径），喊起来的是谁写在正文里
    skillId: k.id, skill: k.name, kind: '战技', fx: k.fx,
    note: named
      /* 同行者与杂兵在正文里必须读得出分别 —— 一个是被推出来的东西，
         一个是被叫回来的人。所以这一支的措辞不写「凝了出来」：
         那个世界的人已经不在了，是**认出来**才站到这一边的。 */
      ? `${foe.name}没有看谁，只朝空处念了一声名字 —— ${m.name}就这么站在了对面，`
        + `手里还是她自己那一件。`
      : `${foe.name}这一手没朝谁来 —— 它只是把旁边那一片还没成形的东西喊了一声，`
        + `${m.name}就这么站着凝了出来。`,
  })
  return true
}

/**
 * 对面那一记连携 —— 异次元的言万心叶 × 异次元的蕾雅（见 synergy 的 RIVAL_LINK）。
 *
 * 照黄金狮子那一处的写法：不看共鸣槽，只看**这两个人是不是都还站着**，
 * 以及它自己的冷却。对面只有这一条连携，参加者也就这一对 ——
 * 名单写在 synergy 里，这里不抄第二遍。
 *
 * 冷却记在 `s.followCd[RIVAL_LINK.id]` 上，**单开一格**：限速挂在**敌方**自己的出手上 ——
 * 对面每出一手减一格（下面第一句就是），与我方那张按我方出手统一减的表不是同一路。
 * 所以它不能混进 `tickFollowCd` 那张表（见 types 的注释），
 * 也别忘了它是**数敌人头**的：军团站满时这一记会转得很快。
 *
 * @param actorId 刚刚出过手的敌体（这一手由他执手）
 */
function fireRivalLink(s: BattleState, actorId: string) {
  s.followCd = s.followCd ?? {}
  if ((s.followCd[RIVAL_LINK.id] ?? 0) > 0) {
    s.followCd[RIVAL_LINK.id] = (s.followCd[RIVAL_LINK.id] ?? 0) - 1
    return
  }
  /* 两个人各按各的认法：本体是**指名首领**（id 里只有位次，认他靠 namedId），
     被唤上来的那一位是**同行者**（id 里带着档案 id，见 derive 的 rivalArchiveIdOf）。
     两种记号不能混用：同行者里没有本体，而本体也可能与同行者同姓同名。 */
  const part = [RIVAL_LINK.a, RIVAL_LINK.b]
    .map((base) => s.enemies.find((e) => !e.down && e.gone <= 0
      && (e.namedId === base || rivalArchiveIdOf(e) === base)))
  if (part.some((c) => !c)) return              // 少一个就凑不齐 —— 与双人连携同一条规矩
  const actor = part.find((c) => c!.id === actorId)
  if (!actor) return                            // 这一手得由他们两个之一接上
  /* 牌面上排的是**人**：link.members 一路都是「谁」（我方那几条填的就是档案 id），
     视图拿它查档案、取头像。所以这里交回去的是本体的档案 id 与同行者的档案 id，
     不是 `foe-…-0` / `rival-reiya`。打出去的那一手仍按场上的 id 算
     （见下面 resolve 的 linkUnits）—— 两张表各认各的。 */
  const faceIdOf = (c: Combatant | undefined) => c?.namedId ?? (c && rivalArchiveIdOf(c)) ?? c!.id
  const foes = aliveOf(s.allies)
  if (!foes.length) return
  const target = [...foes].sort((a, c) => a.hp - c.hp)[0]
  s.followCd[RIVAL_LINK.id] = RIVAL_LINK.cd
  pushLog(s, {
    round: s.hand, actorId: actor.id, actor: actor.name, side: actor.side,
    skillId: `link-${RIVAL_LINK.id}`, skill: `连携 · ${RIVAL_LINK.name}`,
    kind: '战技', fx: RIVAL_LINK.link.fx, tone: 'strike', scope: 'one',
    note: `两枚成对的戒指对上了 —— ${part.map((c) => c!.name).join('、')} 自己接上了这一手。`,
    link: { id: RIVAL_LINK.id, name: RIVAL_LINK.link.name, members: part.map(faceIdOf) },
  })
  resolve(s, actor, {
    id: `link-${RIVAL_LINK.id}`,
    name: RIVAL_LINK.link.name,
    kind: '战技',
    desc: RIVAL_LINK.link.desc,
    cost: 0,
    power: RIVAL_LINK.link.power,
    axis: RIVAL_LINK.link.axis,
    fx: RIVAL_LINK.link.fx,
    line: RIVAL_LINK.link.line,
    target: 'one',
    linkUnits: part.filter((c) => c!.id !== actor.id).map((c) => c!.id),
    linkPow: RIVAL_LINK.link.linkPow,
  }, target.id)
}

/* ============================================================
   天赋（四格制里的第四格）—— 全是**自动触发**，一格都不点
   ------------------------------------------------------------
   数据源是 `PassiveSpec.talents`，**不是** SkillSpec：它不进 legalSkills、不进技能表、
   没有 Command 变体（永远没有 `{t:'talent'}`），界面上只有一行只读的字。
   响的时机全是引擎自己看得见的事：开场、出手、打实、打出暴击、挨了暴击、
   有人倒下、自己跌破某条线、每逢 N 个回合。

   三条口径写死在这一层：
     · 「本人那些」（act / hit / crit / critTaken / hpBelow）只有**本人**的天赋响；
       「场上那些」（foeDown / allyDown）是**在场的我方任何一人**响 ——
       `to: 'trigger'` 指的就是倒下的那一位。
     · 天赋自己那一下**不再引爆天赋**（`talentDepth`，见 types 的注释）。
     · 名额按**这一场**算（`talentUsed`），换装重建面板不会把它洗回去。
   ============================================================ */

/** 天赋的触发现场：那一件事落在谁身上、此刻是第几个回合 */
interface TalentEvent {
  /** hit / crit / critTaken 是**被打的那一位**；foeDown / allyDown 是**倒下的那一位** */
  about?: Combatant
  /** 回合序号（`round` 那一条读它） */
  tick?: number
}

function talentKeyOf(id: string, i: number): string {
  return `${id}:${i}`
}

/**
 * 天赋落在谁身上。
 *   self 本人｜trigger 那一件事落在谁身上（`ev.about`）｜allyAll 我方全体存活
 *   {duty} 存活里这一职能的人 —— 恢复途径④「和音给主音递一节拍」就落在这儿
 *   {lowestTempo} 存活里节拍最低的那一位（并列取名单前头那一个，结果完全确定）
 * 落点按**触发者自己的阵营**取：天赋是「我们这边的事」，敌人那套将来照挂不误。
 */
function talentTargets(s: BattleState, subj: Combatant, t: TalentSpec, ev: TalentEvent): Combatant[] {
  const pool = (subj.side === 'ally' ? s.allies : s.enemies).filter((c) => !c.down && c.gone <= 0)
  const to = t.to ?? 'self'
  if (to === 'self') return [subj]
  if (to === 'trigger') return ev.about && !ev.about.down ? [ev.about] : []
  if (to === 'allyAll') return pool
  if ('duty' in to) return pool.filter((c) => c.duty === to.duty)
  let best: Combatant | undefined
  for (const c of pool) if (!best || c.tempo < best.tempo) best = c
  return best ? [best] : []
}

/**
 * 触发一次：把 `on` 这一档的天赋逐条问一遍，响得起来的就落地。
 *
 * 名额用完就不再响（`uses` 缺省 1 —— 天赋是「响一次」的东西，不是光环；
 * 要每 N 回合都响的（`round`）得自己在数据里写 `uses: -1`）。
 * 一条天赋响完不再回头问别的 —— 重入那道闸在入口就挡住了（见 types）。
 */
function fireTalents(s: BattleState, subj: Combatant, on: TalentTrigger['on'], ev: TalentEvent = {}): void {
  if (s.talentDepth > 0) return
  const list = subj.passive?.talents
  if (!list?.length || subj.down || subj.gone > 0) return
  s.talentUsed = s.talentUsed ?? {}
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (!t) continue
    const tr = t.trigger
    if (tr.on !== on) continue
    /* 「跌破某条线」读的是**此刻在不在线以下** —— 不在就整个不响。
       重复响由名额兜住（缺省 1），所以不必自己记「上一次在不在上面」。 */
    if (tr.on === 'hpBelow') {
      const r = subj.hp / subj.hpMax
      if (!(r > 0 && r <= tr.ratio)) continue
    }
    // 每逢 N 个回合：只在第 N、2N、3N… 个回合响
    if (tr.on === 'round' && (ev.tick ?? 0) % tr.every !== 0) continue
    const key = talentKeyOf(subj.id, i)
    const used = s.talentUsed[key] ?? 0
    const cap = t.uses ?? 1
    if (cap >= 0 && used >= cap) continue
    s.talentUsed[key] = used + 1
    applyTalent(s, subj, t, key, ev)
  }
}

/** 一条天赋的落地：节拍 → 增益 → 效果 → 记一笔。三样都可能有，也可以只有一样。 */
function applyTalent(s: BattleState, subj: Combatant, t: TalentSpec, key: string, ev: TalentEvent): void {
  const targets = talentTargets(s, subj, t, ev)
  s.talentDepth += 1
  try {
    if (t.tempo) for (const x of targets) gainTempo(x, t.tempo)
    if (t.buffs?.length) {
      for (const x of targets) for (const b of t.buffs) addBuff(x, b.k, b.v, b.rounds)
    }
    if (t.effect) {
      /* 天赋那一下也走与技能同一把拆法（splitEffect）：给自己的那一半、
         打在别人身上的那一半各落各的。**落点就是它要动手的人** ——
         取材的天赋记破绽，落点正是刚被她暴击的那个敌人。 */
      const { friendly, hostile, hasFriendly, hasHostile } = splitEffect(t.effect)
      if (hasFriendly) applyEffect(s, subj, friendly, targets, [], TUNING.talentTurns)
      if (hasHostile) applyEffect(s, subj, hostile, [], targets, TUNING.talentTurns)
    }
    pushLog(s, {
      round: s.hand, actorId: subj.id, actor: subj.name, side: subj.side,
      skillId: `talent-${key}`, skill: `天赋 · ${t.name}`, kind: '指令', fx: 'seal',
      targetId: targets.length === 1 ? targets[0]?.id : undefined,
      target: targets.length ? targets.map((x) => x.name).join('、') : undefined,
      note: t.desc + (t.to && t.to !== 'self' && targets.length
        ? `（落在 ${targets.map((x) => x.name).join('、')} 身上）`
        : ''),
    })
  } finally {
    /* 出错也要把闸放下 —— 否则一次异常会把这一场剩下来的天赋全锁死，
       而那是最难查的一种「怎么不响了」。 */
    s.talentDepth -= 1
  }
}

/** 有人倒下了 —— 在场的我方每人各问一次（`to: 'trigger'` 指的就是倒下的那一位） */
function fireDownTalents(s: BattleState, fallen: Combatant): void {
  const on: TalentTrigger['on'] = fallen.side === 'ally' ? 'allyDown' : 'foeDown'
  for (const c of s.allies) {
    if (c.down || c.gone > 0) continue
    fireTalents(s, c, on, { about: fallen, tick: s.tick })
  }
}

/** 一次命中牵得出来的天赋：打实 / 打出暴击 / 挨了暴击 / 跌破线 / 有人倒下 */
function fireHitTalents(s: BattleState, atk: Combatant, def: Combatant, e: LogEntry): void {
  if (e.miss) return
  if (e.dmg != null) fireTalents(s, atk, 'hit', { about: def, tick: s.tick })
  if (e.crit) {
    fireTalents(s, atk, 'crit', { about: def, tick: s.tick })
    if (def !== atk) fireTalents(s, def, 'critTaken', { about: atk, tick: s.tick })
  }
  // 挨了这一下掉到线以下的 —— 只问挨打的那一位（自己打自己时他就是挨打的那位）
  fireTalents(s, def, 'hpBelow', { tick: s.tick })
  if (e.down) fireDownTalents(s, def)
}

/** 离线判断：引擎自带的那套（没有接口、或接口没接上时用它） */
function enemyAct(s: BattleState, foe: Combatant) {
  const t = pickTarget(s, foe)
  if (!t) return
  if (ultStep(s, foe, t)) return
  // 首领与精英先把人喊来 —— 喊人算它这一手（有冷却，也有整场上限）
  if (summonFoe(s, foe)) return
  // 挑「重手」时跳过召唤那一手：它不造成伤害，被挑中等于白出一手
  const heavy = foe.skills.find((k) => k.kind === '战技' && !k.ult && !k.summon)
  const k = heavy && Math.random() < 0.35 ? heavy : foe.skills[0]
  resolve(s, foe, k, t.id)
  // 打完这一手才轮到那记连携 —— 它是「接在攻击后面」的，不是另起一手
  fireRivalLink(s, foe.id)
}

/**
 * 视图交回来的那一手。技能与目标都按 intent 走；
 * intent 里的东西不合法（技能被禁、体力不够、目标已倒）就整手退回离线判断 ——
 * 模型说什么都不会把战斗卡住。
 */
function enemyActWith(s: BattleState, foe: Combatant, it: EnemyIntent) {
  const t = (it.targetId ? find(s, it.targetId) : undefined) ?? pickTarget(s, foe)
  if (!t || t.down) return
  if (ultStep(s, foe, t)) return
  const k = legalSkills(foe, s).find((x) => x.id === it.skillId && !x.ult)
  if (!k || !affordable(k, foe.tempo)) {
    enemyAct(s, foe)
    return
  }
  /* 交回来的是一记召唤：喊得动就喊，喊不动（到顶了 / 冷却没走完）就退回常规一手。
     这一手不走 resolve —— 它没有目标、也不造成伤害（见 summonFoe）。 */
  if (k.summon) {
    if (summonFoe(s, foe)) {
      foe.tempo = Math.max(0, foe.tempo - k.cost)
      return
    }
    enemyAct(s, foe)
    return
  }
  // 战意先落纸，再出手 —— 日志里读起来才是「它为什么这么打」
  if (it.note) {
    pushLog(s, {
      round: s.hand, actorId: foe.id, actor: foe.name, side: foe.side,
      skillId: 'foe-cmd', skill: '敌方指挥', kind: '指令', fx: 'drone',
      note: it.note,
    })
  }
  foe.tempo = Math.max(0, foe.tempo - k.cost)
  resolve(s, foe, k, t.id)
  // 打完这一手才轮到那记连携 —— 它是「接在攻击后面」的，不是另起一手
  fireRivalLink(s, foe.id)
}

/* ---------- 敌方指挥权交给视图 ---------- */

/** 正在等视图决定的那一手（阶段不是 'think' 时为 null） */
export function pendingFoe(s: BattleState): Combatant | null {
  if (s.phase !== 'think' || !s.actor) return null
  return find(s, s.actor) ?? null
}

/** 这只敌体的终结技能（没有则 undefined）—— 判定「是不是 boss」看它 */
export function bossUltOf(c: Combatant): SkillSpec | undefined {
  return ultOf(c)
}

/**
 * 视图把敌方这一手交回来。
 * intent = null 表示退回离线判断（没接通接口、或这一问失败了）。
 * 只在 'think' 阶段有效。
 */
export function enemysTurn(s: BattleState, intent: EnemyIntent | null): BattleState {
  if (s.phase !== 'think') return s
  s.intent = intent
  s.phase = 'select'
  return advance(s)
}

/* ---------- 收场 ---------- */

/**
 * 第一阶段倒下之后，第二阶段站上来的那一拍。
 *
 * 触发点是「场上清空」，不是「本体倒下」——两件事在这一场里其实同一拍发生，
 * 因为本体一倒，他喊上来的亡灵军团跟着散（见 sweepLegion），
 * 而原文本来就是这么写的：codex 图鉴 No.8590 的 counter 一栏
 * 「（异次元体）可对话。其亡灵军团随本体意志消散。」。
 * 摆在这里而不是摆进 resolve，是因为这一手管的是**收场那一次清点**：
 * 本体没倒就不该散，本体倒了就不能让那几位还替他站着。
 *
 * @returns 是不是真的顶上来了（false = 这一场没有第二阶段，或者还没轮到他）
 */
function phaseTwo(s: BattleState): boolean {
  /* 「本体」= 场上**最后一位**认得出名字的那一具，不是 enemies[0]。
     形态链会一直接下去（巨匠 → 黑之魔王 → 二级天使・百翼，见 endfoes 的 next 栏），
     盯死头一位的写法在第三条链上就错了：第二位还站着的时候第一位早就 down 了，
     条件当场成立 —— 第三形态会在第二形态没死的时候就顶上来。
     所以取最后一位有 namedId 的敌体（杂兵与异次元同行者都没有 namedId）。 */
  const boss = lastNamedOf(s.enemies)
  if (!s.nextBoss || !boss?.down) return false
  sweepLegion(s)
  // 军团散尽是指挥官写的那一拍的事，散完这一场还是得等他 —— 那就在这儿接着往下走
  if (standingOf(s.enemies).length > 0) return false
  const next = nextBossOf({
    missionId: s.missionId, nature: s.nature, place: s.place, stage: s.stage,
    progress: s.progress,
    slot: s.enemies.length,
    id: s.nextBoss,
  })
  // 名单上写不出这个人（bosses 里没这一份档案）→ 当作没有第二阶段，照常收场
  if (!next) {
    // 名单上写不出这个人 —— 把这一栏收掉，免得每次清点都来试一遍
    s.nextBoss = undefined
    return false
  }
  /* 这一具也有下一形态的话，接着排下去 —— 不这么做的话，
     「多形态」就只到第二形态为止，而原文里巨匠那一条是走到底的。
     链子接在**顶上来的这一位自己**的 next 栏上，所以谁接谁由档案说了算。 */
  s.nextBoss = namedBossOf(next.namedId)?.next
  // 换了形态就是另一个场面了 —— 对面那一记连携的冷却跟着清（见 fireRivalLink）
  s.followCd[RIVAL_LINK.id] = 0
  s.enemies.push(next)
  /* 报一笔：形态切换必须自己占一行 —— 战报是一行一行读下来的，
     否则玩家读到的只是「敌人又满了」，读不出这是同一位的下一个形态。
     序号按场上已经站过几具有名有姓的算，所以第三形态报的是「第三阶段」，
     不会三条链都写着「第二阶段」。 */
  const formNo = s.enemies.filter((e) => e.namedId).length
  pushLog(s, {
    round: s.hand, actorId: TERMINAL.id, actor: TERMINAL.name, side: 'enemy',
    skillId: `phase-${formNo}`, skill: `第${CN_NUM[formNo] ?? formNo}阶段`, kind: '指令', fx: 'noise',
    note: `第${CN_NUM[formNo - 1] ?? formNo - 1}形态沉寂下去的那一瞬，`
      + `那一片的东西没有散干净 —— `
      + `它们朝同一个方向收拢，重新压成了一具躯体：${next.name}。`,
  })
  return true
}

/** 场上最后一位认得出名字的敌体（当前形态）。杂兵与异次元同行者都没有 namedId。 */
function lastNamedOf(list: Combatant[]): Combatant | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]!
    if (c.namedId) return c
  }
  return undefined
}

/** 形态的序号用字：写到「五」够了 —— 原文里最长的那条链是三条。 */
const CN_NUM = ['', '一', '二', '三', '四', '五']

/**
 * 本体一倒，他喊上来的那几位跟着散。
 *
 * 这不是平衡钮，是原文写明的收场方式（codex 图鉴 No.8590 的 counter）。
 * 少这一手会很难看：骷髅假面之男倒下之后，被他叫回来的人还替他把仗打下去 ——
 * 那一场就不是「异次元体的军团」，而是一群正好路过的强敌。
 */
function sweepLegion(s: BattleState) {
  // 这一次真正散掉了几个 —— 一个都没有就说明已经散过，不必再报一笔
  let swept = 0
  for (const e of s.enemies) {
    if (e.down || e.gone > 0) continue
    if (!e.tags.includes(RIVAL_TAG)) continue
    e.down = true
    e.hp = 0
    swept += 1
  }
  if (swept) {
    pushLog(s, {
      round: s.hand, actorId: TERMINAL.id, actor: TERMINAL.name, side: 'enemy',
      skillId: 'legion-gone', skill: '军团消散', kind: '指令', fx: 'noise',
      note: '喊他们回来的那一位已经不在了 —— 站在对面的那几位随他的意志一并散去。',
    })
  }
}

function checkEnd(s: BattleState) {
  /* 第二阶段判在**收场之前**，而且判的比「场上清空」更早一步：
     它的触发点是「本体倒下」（见 phaseTwo）。摆在这儿是因为这一次清点
     本来就要做两件事 —— 先让军团散、再看场上还剩谁；顺序倒了的话，
     军团还站着的那一拍根本进不了这一段，第二阶段就永远顶不上来。 */
  phaseTwo(s)
  if (standingOf(s.enemies).length === 0) {
    s.phase = 'won'
    s.actor = null
    pushLog(s, {
      round: s.hand, actorId: TERMINAL.id, actor: TERMINAL.name, side: 'ally',
      skillId: 'end', skill: '目标清除', kind: '指令', fx: 'seal',
      note: `${s.no}「${s.title}」敌方反现实反应归零 —— 作战成功。`,
    })
  } else if (standingOf(s.allies).length === 0) {
    s.phase = 'lost'
    s.actor = null
    pushLog(s, {
      round: s.hand, actorId: TERMINAL.id, actor: TERMINAL.name, side: 'enemy',
      skillId: 'end', skill: '全员失能', kind: '指令', fx: 'noise',
      note: '小队失去战斗能力 —— 建议撤出，重新观测后再来。',
    })
  }
}

/* ---------- 撤退成功率 ---------- */

function avgCharge(list: Combatant[]): number {
  const live = aliveOf(list)
  if (!live.length) return 0
  return live.reduce((n, c) => n + c.spd, 0) / live.length
}

export function fleeOddsOf(s: BattleState): number {
  const mine = avgCharge(s.allies)
  const theirs = avgCharge(s.enemies)
  const p = TUNING.fleeBase + (mine - theirs) * TUNING.fleeSpeedWeight
  return clamp(p, TUNING.fleeMin, TUNING.fleeMax)
}

/* ---------- 战利品 ---------- */

/** 装具掉落概率：阶段越高越容易从残骸里翻出东西，但**永远不是必出** */
export function lootOddsOf(stage: number): number {
  return clamp(TUNING.lootBase + stage * TUNING.lootPerStage, 0, TUNING.lootCap)
}

/**
 * 胜利可得：终末点数（必得）+ 装具（掷骰，不是一定出）。
 * ------------------------------------------------------------
 * 点数主要来自剧情任务：正史复盘按阶段加倍、另加一笔固定份量；
 * 巡逻任务只是维持观测，给得少 —— 想攒装备，就得往正史里走。
 */
export function rewardOf(s: BattleState): { coin: number; loot: boolean } {
  const base = s.stage * TUNING.coinPerStage
  const raw = s.mainline
    ? base * TUNING.coinMainlineMul + TUNING.coinMainlineBase
    : base * TUNING.coinPatrolMul
  const coin = Math.max(1, Math.round(raw * (1 + TUNING.coinDropBonus)))
  return { coin, loot: Math.random() < lootOddsOf(s.stage) }
}

/* ---------- 事实底稿（给模型 / 作战记录共用） ---------- */

export function digestOf(s: BattleState): string {
  const lines: string[] = []
  lines.push(`任务：${s.no}「${s.title}」（${s.place} · 危险度 S${s.stage}）`)
  lines.push(`我方：${s.allies.map((a) => `${a.name}（${a.cls}${a.rated ? '' : ' · 未评定'}）`).join('、')}`)
  lines.push(`敌方：${s.enemies.map((e) => `${e.name}（${e.cls}）`).join('、')}`)
  for (const e of s.log) {
    const head = `T${e.round} ${e.actor} → ${e.skill}`
    const tail: string[] = []
    if (e.target) tail.push(e.target)
    if (e.miss) tail.push('未命中')
    if (e.dmg) tail.push(`${e.dmg} 伤害`)
    if (e.heal) tail.push(`回复 ${e.heal}`)
    if (e.down) tail.push('目标失能')
    if (e.note) tail.push(e.note)
    lines.push(`${head}${tail.length ? '：' + tail.join(' · ') : ''}`)
  }
  const mvp = mvpOf(s)
  lines.push(
    `结算：${s.phase === 'won' ? '胜利' : s.phase === 'fled' ? '撤出' : '败退'} · 历时 ${s.hand} 手 / ${s.tick} 拍 · MVP ${mvp}`,
  )
  return lines.join('\n')
}

/** 本场打得最重的一个（作战记录里点名） */
export function mvpOf(s: BattleState): string {
  const tally: Record<string, number> = {}
  for (const e of s.log) {
    if (e.side !== 'ally' || !e.dmg) continue
    tally[e.actorId] = (tally[e.actorId] ?? 0) + e.dmg
  }
  let best = ''
  let bestV = -1
  for (const id in tally) if (tally[id] > bestV) { bestV = tally[id]; best = id }
  return (best && find(s, best)?.name) || '—'
}

/** 剩余体力（结算后写回持久池） */
export function spAfter(s: BattleState): number {
  return s.sp
}
