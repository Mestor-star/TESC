/* ============================================================
   任务作战 · 引擎（纯函数，就地推进，无 React、无副作用）
   ------------------------------------------------------------
   行动条制（ATB）：
     每人一条 0 → 100% 的行动条，按「速度」逐节拍充能；
     满 100% 才能行动，出手后扣除整整一条、余量保留。
     速度由敏捷度导出，并被技能与装具改写 —— 所以快的人
     在同一段时间里能多打好几手，慢的人只能看着。
   六道指令（顺序即 UI 顺序）：
     攻击 / 技能 / 道具 / 防御 / 更换装备 / 战略撤退
     其中「更换装备」不消耗回合（执行委员长口径）。
   ============================================================ */

import { applySynergies, bondsOf } from './synergy'
import { lineFor, poolFor } from './banter'
import { TUNING } from './tuning'
import { combatantOf, enemiesOf } from './derive'
import { GEAR_OF, ITEM_OF } from './gear'
import type {
  AxisKey, BattleState, BuffKey, Combatant, LogEntry, SkillSpec,
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
  return mul
}

/** 充能速度（基础 × 自身 spd 增益 × 减速，减速下限留两成） */
export function chargeOf(c: Combatant): number {
  const up = 1 + buffOf(c, 'spd') + c.gearSpd + (c.passive?.spd ?? 0)
  const slow = clamp(1 - buffOf(c, 'slow'), 0.2, 1)
  return Math.max(TUNING.spdFloor * 0.5, c.spd * up * slow)
}

/** 闪避率（上限封顶，pierce 一手另算） */
export function evadeOf(c: Combatant): number {
  return clamp(c.evade + buffOf(c, 'evade') + (c.passive?.evade ?? 0), 0, TUNING.evadeMax)
}

/** 命中（抵消对方闪避）：被动常驻 + 本手加成 */
export function accOf(c: Combatant): number {
  return Math.max(0, (c.passive?.acc ?? 0) + buffOf(c, 'acc'))
}

/** 减伤（装具常驻 + 本段护罩 + 被动，封顶） */
export function shieldOf(c: Combatant): number {
  return clamp(c.shield + buffOf(c, 'shield') + (c.passive?.shield ?? 0), 0, TUNING.shieldCap)
}

/** 被击时额外承受的比例（标记） */
export function markOf(c: Combatant): number {
  return Math.max(0, buffOf(c, 'mark'))
}

/* ---------- 技能表 ---------- */

/** 指令菜单排序：启动先、技能次、普攻后 */
const KIND_ORDER: Record<string, number> = { 启动: 0, 技能: 1, 普攻: 2 }

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
    return c.skills.filter((k) => k.kind === '启动').sort((a, b) => key(a) - key(b))
  }
  return c.skills
    .filter((k) => k.kind !== '启动' && !k.ult && (!k.needsStack || c.stack >= k.needsStack) && together(k))
    .sort((a, b) => key(a) - key(b))
}

/** 该单位此刻的普攻（慢启动门未解时为空） */
export function basicOf(c: Combatant): SkillSpec | undefined {
  if (c.startUsed < c.startNeed) return undefined
  return c.skills.find((k) => k.kind === '普攻')
}

export function affordable(k: SkillSpec, sp: number): boolean {
  return k.cost <= sp
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
}

export function createBattle(opts: CreateOpts): BattleState {
  const { mission, squad, progress, growth, gear = {}, sp, spMax } = opts
  const allies = squad.map((id) => combatantOf(id, progress, growth[id] ?? 0, gear[id]))
  // 羁绊（队伍协同 + 双人）与连携技：只看这一场谁站在场上
  applySynergies(allies)
  const enemies = enemiesOf(mission)
  const base: BattleState = {
    missionId: mission.id,
    no: mission.no,
    title: mission.title,
    place: mission.place,
    stage: mission.stage,
    tick: 0,
    hand: 0,
    actor: null,
    allies,
    enemies,
    log: [],
    phase: 'select',
    overdrive: sp <= TUNING.overdriveAt,
    sp: Math.max(0, sp - TUNING.spPerSortie),
    spMax,
    bag: { ...(opts.bag ?? TUNING.bagDefault) },
    coin: opts.coin ?? 0,
    loot: [],
    fleeOdds: 0,
    morphPool: opts.morphPool ?? [],
    link: {},
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
  return advance(base)
}

/* ---------- 伤害与回复 ---------- */

function rollJitter(): number {
  return 1 + (Math.random() * 2 - 1) * TUNING.jitter
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
  const raw = atk.axes[k.axis] * k.power * (1 + basic) * atkMulOf(atk) * ultCut + mate
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
  dmg = Math.round(dmg * (1 + markOf(def)))
  dmg = Math.round(dmg * (1 - shieldOf(def)))
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
  } else {
    c.buffs.push({ k, v, t })
  }
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
) {
  if (!eff) return
  for (const t of targets) {
    if (t.down && !eff.heal) continue
    if (eff.heal) {
      const n = healAmount(src, t, eff.heal)
      t.hp = Math.min(t.hpMax, t.hp + n)
      pushLog(s, {
        round: s.hand, actorId: src.id, actor: src.name, side: src.side,
        skillId: 'heal', skill: '回复', kind: '指令', fx: 'heal',
        targetId: t.id, target: t.name, heal: n,
      })
    }
    if (eff.cleanse) t.buffs = t.buffs.filter((b) => b.k !== 'mark' && b.k !== 'slow')
    if (eff.clearBar) t.bar = 0
    if (eff.evade) addBuff(t, 'evade', eff.evade, turns)
    if (eff.accUp) addBuff(t, 'acc', eff.accUp, turns)
    if (eff.shield) addBuff(t, 'shield', eff.shield, turns)
    if (eff.atkUp) addBuff(t, 'atk', eff.atkUp, turns)
    if (eff.spdUp) addBuff(t, 'spd', eff.spdUp, turns)
    if (eff.pushBar) t.bar = Math.min(TUNING.barMax * 1.6, t.bar + TUNING.barMax * eff.pushBar)
    if (eff.taunt) t.taunt = Math.max(t.taunt, turns)
  }
  for (const t of hostileTargets) {
    if (t.down) continue
    if (eff.clearBar) {
      t.bar = 0
      // 「镇静剂」压住的不只是行动条：正在咏唱的大招也一并哑掉
      if (resetChant(s, t, '镇静')) { /* 已入日志 */ }
    }
    if (eff.mark) addBuff(t, 'mark', eff.mark, turns)
    if (eff.slow) addBuff(t, 'slow', eff.slow, turns)
    if (eff.pushBack) t.bar = Math.max(0, t.bar - TUNING.barMax * eff.pushBack)
  }
}

/* ---------- 单次命中 ---------- */

function hit(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): LogEntry {
  const pierce = k.effect?.pierce === true
  // 命中 = 对方的闪避减去出手者这一手的命中（被动常驻 + 本手加成）
  // 低语者「听得见往哪躲」：攻击必中，闪避再高也躲不掉
  const miss = atk.passive?.sureHit ? 0 : Math.max(0, evadeOf(def) - accOf(atk))
  if (!pierce && Math.random() < miss) {
    return {
      round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
      targetId: def.id, target: def.name, miss: true, line: k.line || undefined,
    }
  }
  const dmg = damageOf(s, atk, def, k)
  def.hp = Math.max(0, def.hp - dmg)
  breakChant(s, def, dmg)
  let down = false
  if (def.hp === 0 && !def.down && def.gone <= 0) {
    // 战斗续行：原文里「心脏破了也照样站着」的人，致命伤只留一口气
    const p = def.passive
    const canEndure = !!p?.endure && (p.endure < 0 || def.endured < p.endure)
    if (canEndure) {
      def.hp = 1
      def.endured += 1
      pushLog(s, {
        round: s.hand, actorId: def.id, actor: def.name, side: def.side,
        skillId: 'endure', skill: '战斗续行', kind: '指令', fx: 'guard',
        note: `${p!.name} —— ${p!.desc.split('。')[0]}：这一下没打穿。`,
      })
      return {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
        targetId: def.id, target: def.name, dmg, line: k.line || undefined,
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
    skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
    targetId: def.id, target: def.name, dmg, down, line: k.line || undefined,
  }
}

/* ---------- 终结技能（boss 大招）的咏唱 ---------- */

/** 咏唱期间身上挂了几层减益（破绽 / 减速 / 被标记） */
function ultDebuffs(c: Combatant): number {
  return c.buffs.filter((b) => b.k === 'mark' || b.k === 'slow').length
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
      targets = t && !t.down && t.gone <= 0 ? [t] : [atk]
    } else {
      const t = targetId ? find(s, targetId) : undefined
      targets = t && !t.down && t.gone <= 0 ? [t] : aliveOf(foes).slice(0, 1)
    }
    const hits = Math.max(1, k.effect?.hits ?? 1)
    for (const t of targets) {
      for (let i = 0; i < hits; i++) {
        if (t.down) break
        pushLog(s, hit(s, atk, t, k))
      }
    }
  } else if (k.kind !== '启动') {
    // 不造成伤害的辅助手：调律、屏障、鼓舞之类
    pushLog(s, {
      round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
      line: k.line || undefined,
      note: '调律 —— 本手不造成伤害',
    })
  }

  // 效果：伤害之外的增益 / 压制。
  //   · 单体 / 全体 攻击手：增益留给自己，压制落在选中的那个（或全体）敌人身上
  //   · 辅助手：效果按 target 落在我方
  const e = k.effect
  if (e) {
    const friendly: typeof e = {
      heal: e.heal, cleanse: e.cleanse, shield: e.shield, evade: e.evade, accUp: e.accUp,
      atkUp: e.atkUp, spdUp: e.spdUp, pushBar: e.pushBar, taunt: e.taunt,
    }
    const hostile: typeof e = { mark: e.mark, slow: e.slow, pushBack: e.pushBack }
    const hasFriendly = !!(e.heal || e.cleanse || e.shield || e.evade || e.accUp || e.atkUp || e.spdUp || e.pushBar || e.taunt)
    const hasHostile = !!(e.mark || e.slow || e.pushBack)

    if (k.target === 'all' || k.target === 'one') {
      if (hasFriendly) applyEffect(s, atk, friendly, [atk], [], k.turns)
      if (hasHostile) {
        const ht = k.target === 'one'
          ? (() => { const t = targetId ? find(s, targetId) : undefined; return t && !t.down && t.gone <= 0 ? [t] : aliveOf(foes).slice(0, 1) })()
          : aliveOf(foes)
        applyEffect(s, atk, hostile, [], ht, k.turns)
      }
    } else {
      const beneficiaries = k.target === 'self'
        ? [atk]
        : k.target === 'allyAll'
          ? aliveOf(friends)
          : (() => { const x = targetId ? find(s, targetId) : undefined; return x && !x.down && x.gone <= 0 ? [x] : [atk] })()
      if (e.selfToo && !beneficiaries.includes(atk)) beneficiaries.push(atk)
      applyEffect(s, atk, e, beneficiaries, [], k.turns)
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
        name: t.name,
        base: { axes: { ...atk.axes }, spd: atk.spd, skills: atk.skills.map((x) => ({ ...x })) },
        ticks, skillId: k.id, cd: k.morphCd ?? 3,
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

  // 冷却：出手即上表，按「自身行动次数」递减（见 beginAction）
  if (k.cd && k.cd > 0) atk.cds[k.id] = k.cd

  // 弹痕持有者：每出一手蓄一层印记（到达点的燃料）
  if (atk.scar) atk.stack += 1
  if (k.kind === '启动') {
    atk.startUsed += 1
    const n = atk.startUsed
    if (n >= atk.startNeed) {
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'unseal', skill: '解禁', kind: '指令', fx: 'noise',
        note: `封印尽解 —— 普攻与技能已可用（第 ${n}/${atk.startNeed} 重）。`,
      })
    } else {
      pushLog(s, {
        round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'unseal', skill: `封印 ${n}/${atk.startNeed}`, kind: '指令', fx: atk.fx,
        note: '还没解开。',
      })
    }
  }
  return s
}

/* ---------- 行动条推进 ---------- */

/** 出手的代价：扣掉一整条行动条，并让自己的增益走一格 */
function beginAction(s: BattleState, c: Combatant) {
  c.bar = Math.max(0, c.bar - TUNING.barMax)
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
}

function readyList(s: BattleState): Combatant[] {
  return allOf(s)
    .filter((c) => !c.down && c.gone <= 0 && c.bar >= TUNING.barMax)
    .sort(
      (a, b) =>
        b.bar - a.bar ||
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
      s.tick += 1
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
        c.bar = Math.min(TUNING.barMax * 2, c.bar + chargeOf(c))
        const p = c.passive
        if (p?.regen && c.hp < c.hpMax) {
          c.hp = Math.min(c.hpMax, c.hp + Math.max(1, Math.round(c.hpMax * p.regen)))
        }
        if (p?.spRegen && c.sp < c.spMax) {
          c.sp = Math.min(c.spMax, c.sp + p.spRegen)
        }
        // 变身的拍子：数满即解除，把借来的能力还回去，冷却从这一刻才起算
        if (c.morph) {
          c.morph.ticks -= 1
          if (c.morph.ticks <= 0) {
            const m = c.morph
            c.axes = { ...m.base.axes }
            c.spd = m.base.spd
            c.skills = m.base.skills
            c.cds[m.skillId] = m.cd
            c.buffs.push({ k: 'atk', v: -0.12, t: m.cd })
            c.buffs.push({ k: 'slow', v: 0.12, t: m.cd })
            pushLog(s, {
              round: s.hand, actorId: c.id, actor: c.name, side: c.side,
              skillId: 'morph-off', skill: '变身 · 解除', kind: '指令', fx: 'seal',
              note: `${c.name} 变回自己 —— 借来的东西还了回去，接下来 ${m.cd} 拍手感发虚。`,
            })
            c.morph = null
          }
        }
      }
      continue
    }
    const cur = ready[0]
    if (cur.side === 'enemy') {
      beginAction(s, cur)
      enemyAct(s, cur)
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

  /* —— 更换装备：不消耗回合，随时可换 —— */
  if (cmd.t === 'equip') {
    const next = cmd.gearId ?? undefined
    const g = next ? GEAR_OF[next] : undefined
    // 整块重算面板（轴值 / 充能 / 闪避 / 减伤 / 附带技能），只保留场上的临时状态
    const fresh = combatantOf(me.id, s.progress, s.growth[me.id] ?? 0, next)
    Object.assign(me, fresh, {
      hp: me.hp, bar: me.bar, buffs: me.buffs, taunt: me.taunt,
      down: me.down, startUsed: me.startUsed, stack: me.stack, cds: me.cds, sp: me.sp, note: me.note,
    })
    // 羁绊是队伍层的东西：重建后要按全队名单重新落一遍，不然换件装备就掉了
    applySynergies([me], s.allies.map((c) => c.id))
    cmdLog(s, me, '更换装备', g ? `${g.name} 装配完毕 · 不消耗回合` : '已卸下装具', 'gear')
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
  if (cmd.t === 'atk') {
    const k = basicOf(me)
    if (!k) return s
    me.sp = Math.max(0, me.sp - k.cost)
    beginAction(s, me)
    resolve(s, me, k, cmd.targetId)
  } else if (cmd.t === 'skill') {
    const k = legalSkills(me, s).find((x) => x.id === cmd.skillId)
    if (!k || k.cost > me.sp || (me.cds[k.id] ?? 0) > 0) return s
    me.sp = Math.max(0, me.sp - k.cost)
    beginAction(s, me)
    resolve(s, me, k, cmd.targetId)
  } else if (cmd.t === 'item') {
    const it = ITEM_OF[cmd.itemId]
    if (!it || (s.bag[cmd.itemId] ?? 0) <= 0) return s
    s.bag[cmd.itemId] = (s.bag[cmd.itemId] ?? 0) - 1
    beginAction(s, me)
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
      note: it.desc,
    })
    applyEffect(s, me, it.effect, targets, [], 3)
  } else if (cmd.t === 'guard') {
    beginAction(s, me)
    const rec = Math.round(TUNING.guardRecover + me.axes.意志力 * TUNING.guardRecoverPerWill)
    const got = Math.min(me.spMax, me.sp + rec) - me.sp
    me.sp += got
    addBuff(me, 'shield', TUNING.guardCut, 1)
    cmdLog(s, me, '防御', `架势架起 —— 减伤 ${Math.round(TUNING.guardCut * 100)}%`
      + `，喘息回了一口气（体力 +${got}）`, 'guard')
  }

  // 连携：这一手算进羁绊的共鸣槽；槽满就自己接上（不由玩家点）
  chargeLinks(s, me.id)
  fireLinks(s, me.id)

  checkEnd(s)
  if (s.phase !== 'select') {
    s.actor = null
    return s
  }
  return advance(s)
}

/* ---------- 连携 · 自动触发 ---------- */

/**
 * 共鸣槽：羁绊里每有人出一手就 +1（满则封顶）。
 * 「恋兔队必须全员都在才能触发」不是提示文案 —— 是槽要四个人一人添一笔才满。
 */
function chargeLinks(s: BattleState, actorId: string) {
  const bonds = bondsOf(s.allies.map((c) => c.id))
  if (!bonds.length) return
  s.link = s.link ?? {}
  for (const b of bonds) {
    if (!b.members.includes(actorId)) continue
    s.link[b.id] = Math.min(b.need, (s.link[b.id] ?? 0) + 1)
  }
}

/**
 * 槽满即接：出手者执手，其余参加者一起出力（linkPow），打最薄的那个。
 * 不占出手者的回合、不耗体力 —— 打熟了自然接得上，这一下是羁绊给的。
 */
function fireLinks(s: BattleState, actorId: string) {
  const bonds = bondsOf(s.allies.map((c) => c.id))
  if (!bonds.length) return
  s.link = s.link ?? {}
  for (const b of bonds) {
    if ((s.link[b.id] ?? 0) < b.need) continue
    const live = b.members
      .map((id) => find(s, id))
      .filter((c): c is Combatant => !!c && !c.down && c.gone <= 0)
    if (live.length < b.members.length) continue
    const foes = aliveOf(s.enemies)
    if (!foes.length) continue
    const actor = live.find((c) => c.id === actorId) ?? live[0]
    const target = [...foes].sort((a, c) => a.hp - c.hp)[0]
    s.link[b.id] = 0
    pushLog(s, {
      round: s.hand, actorId: actor.id, actor: actor.name, side: actor.side,
      skillId: `link-${b.id}`, skill: `连携 · ${b.name}`, kind: '技能', fx: b.link.fx,
      note: `共鸣满了 —— ${live.map((c) => c.name).join('、')} 自己接上了这一手。`,
    })
    resolve(s, actor, {
      id: `link-${b.id}`,
      name: b.link.name,
      kind: '技能',
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

function enemyAct(s: BattleState, foe: Combatant) {
  const t = pickTarget(s, foe)
  if (!t) return
  const u = ultOf(foe)
  if (u) {
    // 蓄满了：这一手不放别的，放它
    if ((foe.chant[u.id] ?? 0) >= (u.ult ?? 1)) {
      foe.chant[u.id] = 0
      pushLog(s, {
        round: s.hand, actorId: foe.id, actor: foe.name, side: foe.side,
        skillId: 'chant-fire', skill: `终结技能 · ${u.name}`, kind: '技能', fx: u.fx,
        note: `咏唱完毕 —— 它把攒下的一切一次放了出来。`
          + (ultDebuffs(foe) ? `（身上 ${ultDebuffs(foe)} 层减益已把这一击削去一截）` : ''),
      })
      resolve(s, foe, u, t.id)
      return
    }
    // 还没蓄满：这手照常打，同时给咏唱添一拍
    foe.chant[u.id] = Math.min(u.ult ?? 1, (foe.chant[u.id] ?? 0) + 1)
  }
  const heavy = foe.skills.find((k) => k.kind === '技能' && !k.ult)
  const k = heavy && Math.random() < 0.35 ? heavy : foe.skills[0]
  resolve(s, foe, k, t.id)
}

/* ---------- 收场 ---------- */

function checkEnd(s: BattleState) {
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
