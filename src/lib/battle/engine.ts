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

export function aliveOf(list: Combatant[]): Combatant[] {
  return list.filter((c) => !c.down)
}

/* ---------- 增益读数 ---------- */

export function buffOf(c: Combatant, k: BuffKey): number {
  let v = 0
  for (const b of c.buffs) if (b.k === k) v += b.v
  return v
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** 攻击倍率（自身增益 + 装具常驻） */
export function atkMulOf(c: Combatant): number {
  return 1 + buffOf(c, 'atk') + c.gearAtk
}

/** 充能速度（基础 × 自身 spd 增益 × 减速，减速下限留两成） */
export function chargeOf(c: Combatant): number {
  const up = 1 + buffOf(c, 'spd') + c.gearSpd
  const slow = clamp(1 - buffOf(c, 'slow'), 0.2, 1)
  return Math.max(TUNING.spdFloor * 0.5, c.spd * up * slow)
}

/** 闪避率（上限封顶，pierce 一手另算） */
export function evadeOf(c: Combatant): number {
  return clamp(c.evade + buffOf(c, 'evade'), 0, TUNING.evadeMax)
}

/** 减伤（装具常驻 + 本段护罩，封顶） */
export function shieldOf(c: Combatant): number {
  return clamp(c.shield + buffOf(c, 'shield'), 0, TUNING.shieldCap)
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
export function legalSkills(c: Combatant): SkillSpec[] {
  const key = (k: SkillSpec) => KIND_ORDER[k.kind] ?? 9
  if (c.startUsed < c.startNeed) {
    return c.skills.filter((k) => k.kind === '启动').sort((a, b) => key(a) - key(b))
  }
  return c.skills
    .filter((k) => k.kind !== '启动' && (!k.needsStack || c.stack >= k.needsStack))
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
}

export function createBattle(opts: CreateOpts): BattleState {
  const { mission, squad, progress, growth, gear = {}, sp, spMax } = opts
  const allies = squad.map((id) => combatantOf(id, progress, growth[id] ?? 0, gear[id]))
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
    progress,
    growth,
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
  const raw = atk.axes[k.axis] * k.power * atkMulOf(atk)
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

function pushLog(s: BattleState, e: LogEntry) {
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
    if (eff.shield) addBuff(t, 'shield', eff.shield, turns)
    if (eff.atkUp) addBuff(t, 'atk', eff.atkUp, turns)
    if (eff.spdUp) addBuff(t, 'spd', eff.spdUp, turns)
    if (eff.pushBar) t.bar = Math.min(TUNING.barMax * 1.6, t.bar + TUNING.barMax * eff.pushBar)
    if (eff.taunt) t.taunt = Math.max(t.taunt, turns)
  }
  for (const t of hostileTargets) {
    if (t.down) continue
    if (eff.clearBar) t.bar = 0
    if (eff.mark) addBuff(t, 'mark', eff.mark, turns)
    if (eff.slow) addBuff(t, 'slow', eff.slow, turns)
    if (eff.pushBack) t.bar = Math.max(0, t.bar - TUNING.barMax * eff.pushBack)
  }
}

/* ---------- 单次命中 ---------- */

function hit(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): LogEntry {
  const pierce = k.effect?.pierce === true
  if (!pierce && Math.random() < evadeOf(def)) {
    return {
      round: s.hand, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
      targetId: def.id, target: def.name, miss: true, line: k.line || undefined,
    }
  }
  const dmg = damageOf(s, atk, def, k)
  def.hp = Math.max(0, def.hp - dmg)
  let down = false
  if (def.hp === 0 && !def.down) {
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
      targets = t && !t.down ? [t] : [atk]
    } else {
      const t = targetId ? find(s, targetId) : undefined
      targets = t && !t.down ? [t] : aliveOf(foes).slice(0, 1)
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
      heal: e.heal, cleanse: e.cleanse, shield: e.shield, evade: e.evade,
      atkUp: e.atkUp, spdUp: e.spdUp, pushBar: e.pushBar, taunt: e.taunt,
    }
    const hostile: typeof e = { mark: e.mark, slow: e.slow, pushBack: e.pushBack }
    const hasFriendly = !!(e.heal || e.cleanse || e.shield || e.evade || e.atkUp || e.spdUp || e.pushBar || e.taunt)
    const hasHostile = !!(e.mark || e.slow || e.pushBack)

    if (k.target === 'all' || k.target === 'one') {
      if (hasFriendly) applyEffect(s, atk, friendly, [atk], [], k.turns)
      if (hasHostile) {
        const ht = k.target === 'one'
          ? (() => { const t = targetId ? find(s, targetId) : undefined; return t && !t.down ? [t] : aliveOf(foes).slice(0, 1) })()
          : aliveOf(foes)
        applyEffect(s, atk, hostile, [], ht, k.turns)
      }
    } else {
      const beneficiaries = k.target === 'self'
        ? [atk]
        : k.target === 'allyAll'
          ? aliveOf(friends)
          : (() => { const x = targetId ? find(s, targetId) : undefined; return x && !x.down ? [x] : [atk] })()
      if (e.selfToo && !beneficiaries.includes(atk)) beneficiaries.push(atk)
      applyEffect(s, atk, e, beneficiaries, [], k.turns)
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
  for (const id in c.cds) {
    c.cds[id] -= 1
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
    .filter((c) => !c.down && c.bar >= TUNING.barMax)
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
        if (!c.down) c.bar = Math.min(TUNING.barMax * 2, c.bar + chargeOf(c))
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
    const k = legalSkills(me).find((x) => x.id === cmd.skillId)
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
      : it.target === 'enemyOne' ? (() => { const t = cmd.targetId ? find(s, cmd.targetId) : undefined; return t && !t.down ? [t] : [] })()
      : (() => {
          const t = cmd.targetId ? find(s, cmd.targetId) : undefined
          if (it.effect.revive) return t ? [t] : []
          return t && !t.down ? [t] : [me]
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

  checkEnd(s)
  if (s.phase !== 'select') {
    s.actor = null
    return s
  }
  return advance(s)
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
  const heavy = foe.skills.find((k) => k.kind === '技能')
  const k = heavy && Math.random() < 0.35 ? heavy : foe.skills[0]
  resolve(s, foe, k, t.id)
}

/* ---------- 收场 ---------- */

function checkEnd(s: BattleState) {
  if (aliveOf(s.enemies).length === 0) {
    s.phase = 'won'
    s.actor = null
    pushLog(s, {
      round: s.hand, actorId: TERMINAL.id, actor: TERMINAL.name, side: 'ally',
      skillId: 'end', skill: '目标清除', kind: '指令', fx: 'seal',
      note: `${s.no}「${s.title}」敌方反现实反应归零 —— 作战成功。`,
    })
  } else if (aliveOf(s.allies).length === 0) {
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

/** 胜利可得：军需点（必得）+ 装具（掷骰，不是一定出） */
export function rewardOf(s: BattleState): { coin: number; loot: boolean } {
  const coin = Math.round(s.stage * TUNING.coinPerStage * (1 + TUNING.coinDropBonus))
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
