/* ============================================================
   回合制作战 · 引擎（纯函数，无 React、无副作用）
   ------------------------------------------------------------
   一次「出手」＝ act()；随后 advance() 把出手位推到下一个我方单位，
   途中的敌方回合自动结算 —— 视图因此永远只面对「我方该做选择」的状态。
   ============================================================ */

import { TUNING } from './tuning'
import { combatantOf, enemiesOf } from './derive'
import type { AxisKey, BattleState, Combatant, LogEntry, SkillSpec } from './types'
import type { Mission } from '../../data/types'

const AFFINITY: AxisKey = '反现实亲和'

export function allOf(s: BattleState): Combatant[] {
  return [...s.allies, ...s.enemies]
}

export function find(s: BattleState, id: string): Combatant | undefined {
  return allOf(s).find((c) => c.id === id)
}

export function aliveOf(list: Combatant[]): Combatant[] {
  return list.filter((c) => !c.down)
}

/** 出手序：敏捷度降序；同速我方先手；再同则按 id 稳定排序 */
function orderOf(s: BattleState): string[] {
  return [...aliveOf(s.allies), ...aliveOf(s.enemies)]
    .sort(
      (a, b) =>
        b.axes.敏捷度 - a.axes.敏捷度 ||
        (a.side === b.side ? 0 : a.side === 'ally' ? -1 : 1) ||
        a.id.localeCompare(b.id),
    )
    .map((c) => c.id)
}

/** 指令菜单排序：该出手的排前面，防御永远垫底 */
const KIND_ORDER: Record<string, number> = { 启动: 0, 技能: 1, 普攻: 2, 防御: 3 }

/** 该单位此刻可用的技能（不含体力校验；体力不足由 UI 置灰） */
export function legalSkills(c: Combatant): SkillSpec[] {
  const key = (k: SkillSpec) => KIND_ORDER[k.kind] ?? 9
  // 慢启动门：未打满启动技次数 → 只剩启动技与防御
  if (c.startUsed < c.startNeed) {
    return c.skills
      .filter((k) => k.kind === '启动' || k.kind === '防御')
      .sort((a, b) => key(a) - key(b))
  }
  // 封印既解，启动技即从菜单退场；「到达点」需先蓄够印记
  return c.skills
    .filter((k) => (k.kind !== '启动' || c.startUsed < c.startNeed) && (!k.needsStack || c.stack >= k.needsStack))
    .sort((a, b) => key(a) - key(b))
}

export function affordable(k: SkillSpec, sp: number): boolean {
  return k.cost <= sp
}

export function createBattle(opts: {
  mission: Mission
  squad: string[]
  progress: number
  growth: Record<string, number>
  sp: number
  spMax: number
}): BattleState {
  const { mission, squad, progress, growth, sp, spMax } = opts
  const allies = squad.map((id) => combatantOf(id, progress, growth[id] ?? 0))
  const enemies = enemiesOf(mission)
  const base: BattleState = {
    missionId: mission.id,
    no: mission.no,
    title: mission.title,
    place: mission.place,
    stage: mission.stage,
    round: 1,
    queue: [],
    at: 0,
    allies,
    enemies,
    log: [],
    phase: 'select',
    overdrive: sp <= TUNING.overdriveAt,
    sp: Math.max(0, sp - TUNING.spPerSortie),
    spMax,
  }
  base.queue = orderOf(base)
  base.log.push({
    round: 1,
    actorId: 'terminal',
    actor: '停滞观测终端',
    side: 'ally',
    skillId: 'sortie',
    skill: '作战开始',
    kind: '普攻',
    fx: 'seal',
    note: `小队进入 ${mission.place} · 目标 ${mission.nature}`,
  })
  if (base.overdrive) {
    base.log.push({
      round: 1,
      actorId: 'terminal',
      actor: '停滞观测终端',
      side: 'ally',
      skillId: 'overdrive',
      skill: '过载出击',
      kind: '普攻',
      fx: 'noise',
      note: `体力不足（余 ${base.sp}）仍强行出击 · 全场输出打 ${Math.round(TUNING.overdrivePenalty * 100)} 折`,
    })
  }
  return advance(base)
}

/* ---------- 伤害 ---------- */

function rollJitter(): number {
  return 1 + (Math.random() * 2 - 1) * TUNING.jitter
}

function damageOf(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): number {
  const raw = atk.axes[k.axis] * k.power
  let mult = 1
  const anti = def.tags.includes('反现实')
  if (atk.scar) {
    // 弹痕 / 斩击：打反现实实体是本职，打纯物理目标反而不占优
    mult *= anti ? TUNING.scarVsAnti : TUNING.scarVsMundane
  } else {
    mult *= 1 + (atk.axes[AFFINITY] / 200) * TUNING.affinityWeight * (anti ? 1 : 0.3)
  }
  if (atk.side === 'ally' && s.overdrive) mult *= TUNING.overdrivePenalty
  const dmg = raw * mult * rollJitter() - def.axes.物理抗性 * TUNING.resistCut
  return Math.max(side(k) ? TUNING.floor : 0, Math.round(dmg))
}

/** 防御姿态那一格本身不造成伤害 */
function side(k: SkillSpec): boolean {
  return k.kind !== '防御'
}

/* ---------- 出手 ---------- */

function pushLog(s: BattleState, e: LogEntry) {
  s.log.push(e)
}

function hit(s: BattleState, atk: Combatant, def: Combatant, k: SkillSpec): LogEntry {
  const dmg = damageOf(s, atk, def, k)
  def.hp = Math.max(0, def.hp - dmg)
  let down = false
  if (def.hp === 0 && !def.down) {
    if (def.side === 'ally' && TUNING.downWillSave && def.axes.意志力 >= 60 && !def.note?.includes('不倒')) {
      // 意志力极强者：一次「不倒」——留一口气，记在 note 上，只保一次
      def.hp = 1
      def.note = `${def.note ?? ''}｜不倒`.trim()
      pushLog(s, {
        round: s.round, actorId: def.id, actor: def.name, side: def.side,
        skillId: 'stand', skill: '不倒', kind: '防御', fx: 'heal',
        note: '被打倒的瞬间硬撑住了 —— 只此一次。',
      })
    } else {
      def.down = true
      down = true
    }
  }
  return {
    round: s.round,
    actorId: atk.id,
    actor: atk.name,
    side: atk.side,
    skillId: k.id,
    skill: k.name,
    kind: k.kind,
    fx: k.fx,
    targetId: def.id,
    target: def.name,
    dmg,
    down,
    line: k.line || undefined,
  }
}

function resolve(s: BattleState, atk: Combatant, k: SkillSpec, targetId?: string): BattleState {
  atk.guard = k.guard ?? 0
  if (k.kind === '防御') {
    pushLog(s, {
      round: s.round, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx, line: k.line || undefined,
      note: `减伤 ${Math.round(TUNING.guardCut * 100)}%`,
    })
    return s
  }

  if (k.power > 0) {
    const foes = atk.side === 'ally' ? s.enemies : s.allies
    let targets = aliveOf(foes)
    if (k.target === 'one') {
      const t = targetId ? find(s, targetId) : undefined
      targets = t && !t.down ? [t] : targets.slice(0, 1)
    }
    for (const t of targets) {
      const e = hit(s, atk, t, k)
      // 减伤：目标处于防御姿态时削减
      if (t.guard > 0 && e.dmg) {
        const cut = Math.round(e.dmg * t.guard)
        t.hp = Math.min(t.hpMax, t.hp + cut)
        e.dmg -= cut
        e.note = `被架势卸掉 ${cut}`
      }
      pushLog(s, e)
    }
  } else {
    // 不造成伤害的一手（启动技：调律不攻击，只为解开封印）
    pushLog(s, {
      round: s.round, actorId: atk.id, actor: atk.name, side: atk.side,
      skillId: k.id, skill: k.name, kind: k.kind, fx: k.fx,
      line: k.line || undefined,
      note: '调律 —— 本手不造成伤害',
    })
  }

  // 弹痕持有者：每出一手蓄一层印记（到达点的燃料）
  if (atk.scar) atk.stack += 1
  if (k.kind === '启动') {
    atk.startUsed += 1
    const n = atk.startUsed
    if (n >= atk.startNeed) {
      pushLog(s, {
        round: s.round, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'unseal', skill: '解禁', kind: '启动', fx: 'noise',
        note: `封印尽解 —— 普攻与技能已可用（第 ${n}/${atk.startNeed} 重）。`,
      })
    } else {
      pushLog(s, {
        round: s.round, actorId: atk.id, actor: atk.name, side: atk.side,
        skillId: 'unseal', skill: `封印 ${n}/${atk.startNeed}`, kind: '启动', fx: atk.fx,
        note: '还没解开。',
      })
    }
  }
  return s
}

/** 我方出手（视图唯一入口）。返回新状态，并自动推进到下一个我方选择点。 */
export function act(s: BattleState, skillId: string, targetId?: string): BattleState {
  if (s.phase !== 'select') return s
  const cur = s.queue[s.at]
  const me = cur ? find(s, cur) : undefined
  if (!me || me.side !== 'ally' || me.down) return s
  const k = legalSkills(me).find((x) => x.id === skillId)
  if (!k || k.cost > s.sp) return s
  s.sp = Math.max(0, s.sp - k.cost)
  resolve(s, me, k, targetId)
  checkEnd(s)
  if (s.phase !== 'select') return s
  return advance(bump(s))
}

/* ---------- 敌方 AI ---------- */

function pickTarget(s: BattleState, foe: Combatant): Combatant | undefined {
  const live = aliveOf(s.allies)
  if (live.length === 0) return undefined
  const tags = foe.tags.join('')
  if (tags.includes('机械')) return [...live].sort((a, b) => b.axes.破坏力 - a.axes.破坏力)[0]
  if (tags.includes('魔王')) return [...live].sort((a, b) => a.hp - b.hp)[0]
  return live[Math.floor(Math.random() * live.length)]
}

function enemyTurn(s: BattleState, foe: Combatant): BattleState {
  const t = pickTarget(s, foe)
  if (!t) return s
  const k = foe.skills[0]
  return resolve(s, foe, k, t.id)
}

/* ---------- 推进 ---------- */

function bump(s: BattleState): BattleState {
  s.at += 1
  if (s.at >= s.queue.length) {
    s.round += 1
    for (const c of allOf(s)) c.guard = 0
    s.queue = orderOf(s)
    s.at = 0
  }
  return s
}

function advance(s: BattleState): BattleState {
  let guard = 0
  while (s.phase === 'select' && guard++ < 500) {
    const cur = s.queue[s.at]
    const c = cur ? find(s, cur) : undefined
    if (!c || c.down) {
      bump(s)
      checkEnd(s)
      continue
    }
    if (c.side === 'enemy') {
      enemyTurn(s, c)
      checkEnd(s)
      if (s.phase !== 'select') return s
      bump(s)
      continue
    }
    break
  }
  return s
}

function checkEnd(s: BattleState) {
  if (aliveOf(s.enemies).length === 0) {
    s.phase = 'won'
    pushLog(s, {
      round: s.round, actorId: 'terminal', actor: '停滞观测终端', side: 'ally',
      skillId: 'end', skill: '目标清除', kind: '普攻', fx: 'seal',
      note: `${s.no}「${s.title}」敌方反现实反应归零 —— 作战成功。`,
    })
  } else if (aliveOf(s.allies).length === 0) {
    s.phase = 'lost'
    pushLog(s, {
      round: s.round, actorId: 'terminal', actor: '停滞观测终端', side: 'enemy',
      skillId: 'end', skill: '全员失能', kind: '普攻', fx: 'noise',
      note: '小队失去战斗能力 —— 建议撤出，重新观测后再来。',
    })
  }
}

/* ---------- 事实底稿（给模型 / 作战记录共用） ---------- */

export function digestOf(s: BattleState): string {
  const lines: string[] = []
  lines.push(`任务：${s.no}「${s.title}」（${s.place} · 危险度 S${s.stage}）`)
  lines.push(`我方：${s.allies.map((a) => `${a.name}（${a.rated ? '五轴在册' : '未评定'}）`).join('、')}`)
  lines.push(`敌方：${s.enemies.map((e) => e.name).join('、')}`)
  for (const e of s.log) {
    const head = `R${e.round} ${e.actor} → ${e.skill}`
    const tail: string[] = []
    if (e.target) tail.push(e.target)
    if (e.dmg) tail.push(`${e.dmg} 伤害`)
    if (e.down) tail.push('目标失能')
    if (e.note) tail.push(e.note)
    lines.push(`${head}${tail.length ? '：' + tail.join(' · ') : ''}`)
  }
  const mvp = mvpOf(s)
  lines.push(`结算：${s.phase === 'won' ? '胜利' : '败退'} · 历时 ${s.round} 回合 · MVP ${mvp}`)
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
