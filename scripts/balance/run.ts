/* ============================================================
   战斗力平衡复核 —— 让引擎自己打一遍，把结果摊成表
   ------------------------------------------------------------
   复核口径：数值手感不该靠「我觉得」，该靠跑出来的分布。
   所以这里不接界面、不接接口，直接把作战引擎当纯函数反复调用，
   用一个**中等水平的玩家**（不是最优解，也不是乱点）打满全场。

   玩家策略（policyOf）刻意写得笨一点：
     · 有启动技就先启动 —— 那是解封，不是浪费回合
     · 能一击带走血最少的敌体就打它，打不动就挑倍率最高的
     · 全队掉血过半且手里有群体回血，就先回一口
     · 什么都出不起就防御（这一条出现的频率本身就是「体力够不够」的读数）

   看什么：
     胜率随危险度的走势、平均拍数、平均存活人数、
     伤害份额（有没有一枝独秀）、体力枯竭率、boss 终结技能的实际发生率。
   ============================================================ */

import { genBoard } from '../../src/lib/battle/missiongen'
import { squadIdsFrom } from '../../src/lib/battle/derive'
import { POWER_SCALE } from '../../src/lib/battle/roster'
import { TUNING } from '../../src/lib/battle/tuning'
import {
  act, affordable, allOf, bossUltOf, createBattle, legalSkills, standingOf,
} from '../../src/lib/battle/engine'
import type { BattleState, Combatant, SkillSpec } from '../../src/lib/battle/types'
import type { Mission } from '../../src/data/types'

const OPERATOR = 'operator'
const SQUAD_MAX = 6

/* ------------------------------------------------------------------
   一个「中等玩家」
   ------------------------------------------------------------------ */

function isHeal(k: SkillSpec): boolean {
  return k.power === 0 && (k.target === 'allyAll' || k.target === 'allyOne') && (k.effect?.heal ?? 0) > 0
}

/** 按技能自己的目标口径挑人 —— 给治疗技递一个敌人 id 是要出事的 */
function targetFor(k: SkillSpec, s: BattleState): string | undefined {
  if (k.target === 'one') {
    const foes = standingOf(s.enemies)
    return [...foes].sort((a, b) => a.hp - b.hp)[0]?.id
  }
  if (k.target === 'allyOne') {
    const mates = standingOf(s.allies)
    // 有人倒了就优先拉起来，否则照顾血线最低的
    return (mates.find((c) => c.down) ?? [...mates].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0])?.id
  }
  return undefined   // all / self / allyAll 不吃目标
}

function policyOf(s: BattleState, me: Combatant): { t: 'skill'; skillId: string; targetId?: string } | { t: 'guard' } {
  const foes = standingOf(s.enemies)
  const mates = standingOf(s.allies)
  if (!foes.length) return { t: 'guard' }

  /* 关键：legalSkills 不问冷却（界面上是用按钮上的读秒来表示的），
     所以要在这里自己剔掉还在转的那几手 —— 否则 act 会原样退回来，回合白转。 */
  const mine = legalSkills(me, s).filter((k) => affordable(k, me.sp) && (me.cds[k.id] ?? 0) <= 0)
  const roster = mine.filter((k) => k.kind !== '普攻')

  const pick = (k: SkillSpec) => ({ t: 'skill' as const, skillId: k.id, targetId: targetFor(k, s) })

  // 1）解封优先：启动技是第一手该做的事
  const start = roster.find((k) => k.kind === '启动')
  if (start) return pick(start)

  // 2）全队掉过半血，先回一口
  const hurt = mates.reduce((n, c) => n + c.hp, 0) / Math.max(1, mates.reduce((n, c) => n + c.hpMax, 0))
  const heal = roster.find(isHeal)
  if (heal && hurt < 0.5) return pick(heal)

  // 3）打手：单体挑血最少的（能一击带走最好），群体技看总收益
  const dps = roster.filter((k) => k.power > 0)
  if (dps.length) {
    // 群体技按「打中几个」折算，单体按实际倍率
    const score = (k: SkillSpec) => (k.target === 'all' ? k.power * foes.length : k.power)
    const best = [...dps].sort((a, b) => score(b) - score(a))[0]
    return pick(best)
  }

  // 4）普攻兜底；连普攻都出不起（或还在冷却）就防御 —— mine 已经滤过一轮，这里不会空转
  const basic = mine.find((k) => k.kind === '普攻')
  if (basic) return pick(basic)
  return { t: 'guard' }
}

/* ------------------------------------------------------------------
   打一场
   ------------------------------------------------------------------ */

interface Tally {
  outcome: 'won' | 'lost' | 'fled' | 'stuck'
  /** 全场拍数：一拍 = 一个轮回（场上还站着的每人各出过一手，含敌方） */
  ticks: number
  actors: number
  survivors: number
  /** 每人打出去的总伤害（含溢出） */
  dealt: Record<string, number>
  /** 每人的出手次数与技能出手次数 */
  swings: Record<string, number>
  skills: Record<string, number>
  /** 出不起任何技能、只能防御的次数 */
  guards: number
  /** 我方总耗体 */
  spUsed: number
  boss: boolean
  ultFired: number
  /** 危险度 */
  stage: number
  place: string
}

function fight(m: Mission, progress: number, growth: Record<string, number>): Tally {
  const rec = squadIdsFrom(m.recommend).filter((id) => id !== OPERATOR)
  const squad = [OPERATOR, ...rec].slice(0, SQUAD_MAX)
  const s = createBattle({
    mission: m, squad, progress, growth,
    sp: TUNING.spMax, spMax: TUNING.spMax,
    bag: { ...TUNING.bagDefault },
  })

  const dealt: Record<string, number> = {}
  const swings: Record<string, number> = {}
  const skills: Record<string, number> = {}
  let guards = 0
  let seen = 0

  // 敌方大招的实际发生率：从日志里数
  const ultFired = () => s.log.filter((e) => e.skillId === 'chant-fire').length

  let guard = 0
  let stalled = false
  while (s.phase === 'select' && guard++ < 1200) {
    const me = s.actor ? allOf(s).find((c) => c.id === s.actor) : undefined
    if (!me || me.side !== 'ally' || me.down) break
    const cmd = policyOf(s, me)
    if (cmd.t === 'guard') guards += 1
    if (cmd.t === 'skill') skills[cmd.skillId] = (skills[cmd.skillId] ?? 0) + 1
    swings[me.id] = (swings[me.id] ?? 0) + 1
    const before = s.hand
    act(s, cmd)
    // 指令没被接收（技能非法 / 体力不够 / 还在冷却）时 act 会原样退回，
    // 这时候回合不往前走 —— 停下来报「卡死」，别在这儿空转。
    if (s.hand === before) { stalled = true; break }
    // 逐条结算本段新增日志里的伤害
    for (; seen < s.log.length; seen++) {
      const e = s.log[seen]
      if (e.side === 'ally' && e.dmg) dealt[e.actorId] = (dealt[e.actorId] ?? 0) + e.dmg
    }
  }

  const survivors = s.allies.filter((c) => !c.down).length
  const done = s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled'
  return {
    outcome: done && !stalled ? s.phase : 'stuck',
    ticks: s.tick,
    actors: s.allies.length,
    survivors,
    dealt,
    swings,
    skills,
    guards,
    spUsed: TUNING.spPerSortie,
    boss: s.enemies.some((c) => !!bossUltOf(c)),
    ultFired: ultFired(),
    stage: m.stage,
    place: m.place,
  }
}

/* ------------------------------------------------------------------
   跑一轮并摊平
   ------------------------------------------------------------------ */

interface Row {
  stage: number
  runs: number
  win: number
  loss: number
  flee: number
  stuck: number
  beats: number
  alive: number
  guards: number
  ult: number
  bossRuns: number
  bossWin: number
  name: string
  title: string
}

export interface BalanceReport {
  rows: Row[]
  /** 全场伤害份额 */
  share: Array<{ id: string; share: number; swings: number }>
  /** 只算危险度 ≥ 5 的场次 —— 前几档常常是一手就完，混进来会把份额带偏 */
  shareHard: Array<{ id: string; share: number; swings: number }>
  totals: { runs: number; win: number; stuck: number; guards: number; thin: number }
  flags: string[]
}

/** 低于这一档的敌人往往活不过一手，份额统计和「一人成军」判据都不该把它算进来 */
const HARD_STAGE = 5

/** 固定的成长值：复核的是面板本身，不是运气 */
function growthFor(progress: number): Record<string, number> {
  const g = TUNING.growthPerWin * 10 * progress
  return { __all: g }
}

export function run(opts: { runs?: number; seedBase?: number; progress?: number } = {}): BalanceReport {
  const runs = opts.runs ?? 60
  const seedBase = opts.seedBase ?? 1
  const progress = opts.progress ?? 0.5

  const buckets = new Map<number, Tally[]>()
  const share = new Map<string, { dmg: number; swings: number }>()
  const shareHard = new Map<string, { dmg: number; swings: number }>()
  let runs0 = 0, win0 = 0, stuck0 = 0, guards0 = 0

  for (let i = 0; i < runs; i++) {
    const seed = seedBase + i
    const board = genBoard(seed, 10)
    for (const m of board) {
      const t = fight(m, progress, {})
      runs0 += 1
      if (t.outcome === 'won') win0 += 1
      if (t.outcome === 'stuck') stuck0 += 1
      guards0 += t.guards
      const list = buckets.get(t.stage) ?? []
      list.push(t)
      buckets.set(t.stage, list)
      const bands: Array<Map<string, { dmg: number; swings: number }>> =
        t.stage >= HARD_STAGE ? [share, shareHard] : [share]
      for (const band of bands) {
        for (const [id, d] of Object.entries(t.dealt)) {
          const cur = band.get(id) ?? { dmg: 0, swings: 0 }
          cur.dmg += d
          cur.swings += t.swings[id] ?? 0
          band.set(id, cur)
        }
      }
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  const rows: Row[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stage, ts]) => {
      const bosses = ts.filter((t) => t.boss)
      const sample = ts[0]
      return {
        stage,
        runs: ts.length,
        win: ts.filter((t) => t.outcome === 'won').length / ts.length,
        loss: ts.filter((t) => t.outcome === 'lost').length / ts.length,
        flee: ts.filter((t) => t.outcome === 'fled').length / ts.length,
        stuck: ts.filter((t) => t.outcome === 'stuck').length / ts.length,
        beats: avg(ts.map((t) => t.ticks)),
        alive: avg(ts.map((t) => t.survivors / Math.max(1, t.actors))),
        guards: avg(ts.map((t) => t.guards)),
        ult: avg(ts.map((t) => t.ultFired)),
        bossRuns: bosses.length,
        bossWin: bosses.length ? bosses.filter((t) => t.outcome === 'won').length / bosses.length : 0,
        name: sample.place,
        title: sample.stage >= TUNING.ultStage ? '（boss 级）' : '',
      }
    })

  const sharesOf = (m: Map<string, { dmg: number; swings: number }>) => {
    const total = [...m.values()].reduce((a, b) => a + b.dmg, 0) || 1
    return [...m.entries()]
      .map(([id, v]) => ({ id, share: v.dmg / total, swings: v.swings }))
      .sort((a, b) => b.share - a.share)
  }
  const shares = sharesOf(share)
  const sharesHard = sharesOf(shareHard)

  /* ---- 判据：越界的挑出来，没越界的就闭嘴 ---- */
  const flags: string[] = []
  let thin = 0
  for (const r of rows) {
    if (r.runs < 12) continue
    if (r.win < 0.45) flags.push(`危险度 ${r.stage}：胜率 ${(r.win * 100).toFixed(0)}% 偏低（低于 45%）——这一档偏难`)
    // 「没有张力」得是打得起来却没输过：一手就结束的场次归下面那条「没打起来」管
    if (r.win > 0.97 && r.stage >= HARD_STAGE && r.beats >= 6) flags.push(`危险度 ${r.stage}：胜率 ${(r.win * 100).toFixed(0)}%、平均 ${r.beats.toFixed(0)} 拍——这一档没有张力`)
    if (r.beats > 60) flags.push(`危险度 ${r.stage}：平均 ${r.beats.toFixed(0)} 拍，拖得太长（> 60）`)
    if (r.beats < 3) { thin += r.runs; flags.push(`危险度 ${r.stage}：平均 ${r.beats.toFixed(1)} 拍——敌人还没出手就结束了（${r.runs} 场）`) }
    if (r.guards > 8) flags.push(`危险度 ${r.stage}：平均每场 ${r.guards.toFixed(1)} 次「出不起任何技能」——体力偏紧`)
    if (r.alive < 0.25) flags.push(`危险度 ${r.stage}：平均存活 ${(r.alive * 100).toFixed(0)}%，团灭边缘`)
  }
  /* 集中度只看打得起来的档 —— 前几档一手清场，谁快谁独占，那不是「一人成军」 */
  const hard = sharesHard.length ? sharesHard : shares
  const hardSwings = hard.reduce((n, x) => n + x.swings, 0)
  const top = hard[0]
  if (top && hardSwings >= 120 && top.share > 0.5) {
    flags.push(`伤害集中（危险度 ≥ ${HARD_STAGE}）：${top.id} 独占 ${(top.share * 100).toFixed(0)}%——一人成军`)
  }
  for (const x of hard) {
    if (x.swings >= 40 && x.share < 0.05) flags.push(`伤害偏低：${x.id} 出手 ${x.swings} 次只占 ${(x.share * 100).toFixed(1)}%——上场等于少一个人`)
  }
  const bossRows = rows.filter((r) => r.bossRuns >= 8)
  for (const r of bossRows) {
    if (r.bossWin < 0.35) flags.push(`boss 档（危险度 ${r.stage}）：胜率 ${(r.bossWin * 100).toFixed(0)}%——终结技能可能没得解`)
  }

  return {
    rows,
    share: shares,
    shareHard: sharesHard,
    totals: { runs: runs0, win: runs0 ? win0 / runs0 : 0, stuck: stuck0, guards: guards0, thin },
    flags,
  }
}

export function report(r: BalanceReport, progress: number): string {
  const pc = (v: number) => `${(v * 100).toFixed(0)}%`.padStart(4)
  const out: string[] = []
  out.push('')
  out.push(`  ══ 战斗力平衡复核 · 时期系数 ${progress.toFixed(2)} · 共 ${r.totals.runs} 场 ══`)
  out.push('')
  out.push('  危险度  场次   胜率   败率   撤离   卡死   平均拍数  平均存活  防御次数  大招/场  地点')
  out.push('  ────────────────────────────────────────────────────────────────────────────────────')
  for (const x of r.rows) {
    out.push(
      '  ' + String(x.stage).padStart(4) + '  ' + String(x.runs).padStart(5) + '  ' + pc(x.win) + '  ' + pc(x.loss)
      + '  ' + pc(x.flee) + '  ' + pc(x.stuck) + '   ' + x.beats.toFixed(1).padStart(7) + '   '
      + pc(x.alive) + '    ' + x.guards.toFixed(1).padStart(6) + '   ' + x.ult.toFixed(2).padStart(6)
      + '   ' + x.name + x.title,
    )
  }
  out.push('')
  out.push(`  总体胜率 ${pc(r.totals.win)} · 卡死 ${r.totals.stuck} 场 · 全场共 ${r.totals.guards} 次只能防御`)
  out.push('')
  const table = (label: string, list: BalanceReport['share']) => {
    out.push(`  伤害份额 · ${label}`)
    out.push('  ────────────────────────────────────────────────')
    for (const x of list.slice(0, 14)) {
      const bar = '█'.repeat(Math.max(1, Math.round(x.share * 40)))
      out.push('  ' + x.id.padEnd(22) + pc(x.share) + '  ' + bar + '  (' + x.swings + ' 手)')
    }
    out.push('')
  }
  table(`危险度 ≥ ${HARD_STAGE}`, r.shareHard)
  table('全部场次', r.share)
  if (r.flags.length) {
    out.push('  ⚠ 越界项')
    for (const f of r.flags) out.push('    · ' + f)
  } else {
    out.push('  ✓ 各项都在设定区间内')
  }
  out.push('')
  return out.join('\n')
}

export { POWER_SCALE }
