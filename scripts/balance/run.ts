/* ============================================================
   战斗力平衡复核 —— 让引擎自己打一遍，把结果摊成表
   ------------------------------------------------------------
   复核口径：数值手感不该靠「我觉得」，该靠跑出来的分布。
   所以这里不接界面、不接接口，直接把作战引擎当纯函数反复调用，
   用一个**中等水平的玩家**（不是最优解，也不是乱点）打满全场。

   玩家策略（policyOf）刻意写得笨一点 —— 但要笨得像**一个人**，
   而不是像「只会按倍率最高的那个键」的机器：
     · 有解封门就先解封 —— 那是开锁，不是浪费回合
     · 能一击带走血最少的敌体就打它，打不动就挑倍率最高的
     · 全队有伤且手里有群体回血，就先回一口
     · **能给全队挂上的增益 / 护盾，队里没挂着就挂上去**（三期补）
       —— 少了这一条，会奶会加盾的人整场都在打普攻，
       而「他打普攻」又会被算成他的伤害份额，读数就骗人
     · **普攻挑倍率最高的那一手**，不是技能表里排第一的那一手（三期补）
     · 什么都出不起就防御（这一条出现的频率本身就是「节拍够不够」的读数）

   看什么：
     胜率随危险度的走势、平均拍数、平均存活人数、
     伤害份额（有没有一枝独秀）、体力枯竭率、boss 终结技能的实际发生率。
   ============================================================ */

import { genBoard } from '../../src/lib/battle/missiongen'
import { combatantOf, squadIdsFrom } from '../../src/lib/battle/derive'
import { dutyOf } from '../../src/lib/battle/duty'
import type { DutyId } from '../../src/lib/battle/duty'
import { TUNING } from '../../src/lib/battle/tuning'
import {
  act, affordable, allOf, bossUltOf, buffOf, createBattle, legalSkills, standingOf,
} from '../../src/lib/battle/engine'
import type { BuffKey, BattleState, Combatant, SkillEffect, SkillSpec } from '../../src/lib/battle/types'
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

/** `effect` 里那几个数字键，落成的是哪个 BuffKey（其余键不是挂身上的东西） */
const BUFF_KEY: Partial<Record<keyof SkillEffect, BuffKey>> = {
  atkUp: 'atk', spdUp: 'spd', evade: 'evade', accUp: 'acc', shield: 'shield', crit: 'crit',
}

/** 这一手要挂的那几样，队里是不是**已经全有了** —— 有就不重复放 */
function alreadyUp(k: SkillSpec, mates: Combatant[]): boolean {
  const e = k.effect
  if (!e) return true
  const keys = (Object.keys(BUFF_KEY) as Array<keyof SkillEffect>).filter((x) => (e[x] as number | undefined) ?? 0)
  if (!keys.length) return false
  return keys.every((x) => mates.every((c) => buffOf(c, BUFF_KEY[x]!) > 0))
}

function policyOf(s: BattleState, me: Combatant): { t: 'skill'; skillId: string; targetId?: string } | { t: 'guard' } {
  const foes = standingOf(s.enemies)
  const mates = standingOf(s.allies)
  if (!foes.length) return { t: 'guard' }

  /* 关键：legalSkills 不问冷却（界面上是用按钮上的读秒来表示的），
     所以要在这里自己剔掉还在转的那几手 —— 否则 act 会原样退回来，回合白转。 */
  const mine = legalSkills(me, s).filter((k) => affordable(k, me.tempo) && (me.cds[k.id] ?? 0) <= 0)
  const roster = mine.filter((k) => k.kind !== '普攻')

  const pick = (k: SkillSpec) => ({ t: 'skill' as const, skillId: k.id, targetId: targetFor(k, s) })

  // 1）解封优先：解封门是第一手该做的事
  const start = roster.find((k) => k.gate)
  if (start) return pick(start)

  // 2）全队有伤，先回一口（一半血才治太晚了 —— 真人会早一点）
  const hurt = mates.reduce((n, c) => n + c.hp, 0) / Math.max(1, mates.reduce((n, c) => n + c.hpMax, 0))
  const heal = roster.find(isHeal)
  if (heal && hurt < 0.6) return pick(heal)

  /* 3）能给全队挂上的增益 / 护盾：队里还挂着一份就别重复放。
     这一条不在「打得重不重」上，而在**让队友活到打完**上 ——
     少了它，会加盾会加攻的人整场只剩普攻，读数也跟着把他记成「上场等于少一个人」。 */
  const buff = roster.find((k) => k.target === 'allyAll' && k.power === 0 && k.effect && !alreadyUp(k, mates))
  if (buff) return pick(buff)

  // 4）打手：单体挑血最少的（能一击带走最好），群体技看总收益
  const dps = roster.filter((k) => k.power > 0)
  if (dps.length) {
    // 群体技按「打中几个」折算，单体按实际倍率
    const score = (k: SkillSpec) => (k.target === 'all' ? k.power * foes.length : k.power)
    const best = [...dps].sort((a, b) => score(b) - score(a))[0]
    return pick(best)
  }

  // 5）普攻兜底：**挑倍率最高的那一手**（技能表里可能排着不止一手普攻）；
  //     连普攻都出不起（或还在冷却）就防御 —— mine 已经滤过一轮，这里不会空转
  const basic = [...mine.filter((k) => k.kind === '普攻')].sort((a, b) => b.power - a.power)[0]
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
  /** 每人回复出去的总量（`heal` 那一栏相加）—— 和音那一职的读数 */
  healed: Record<string, number>
  /** 每人架起来的护盾 / 减伤手数（`tone === 'ward'`）—— 护卫那一职的读数之二 */
  warded: Record<string, number>
  /** 每人**上过场的场次** —— 份额要按它折算，不然「很少被推荐出场」会被读成「废物」 */
  appeared: Record<string, number>
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
  const healed: Record<string, number> = {}
  const warded: Record<string, number> = {}
  const appeared: Record<string, number> = {}
  const swings: Record<string, number> = {}
  const skills: Record<string, number> = {}
  for (const id of squad) appeared[id] = 1
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
      if (e.side !== 'ally') continue
      if (e.dmg) dealt[e.actorId] = (dealt[e.actorId] ?? 0) + e.dmg
      if (e.heal) healed[e.actorId] = (healed[e.actorId] ?? 0) + e.heal
      if (e.tone === 'ward') warded[e.actorId] = (warded[e.actorId] ?? 0) + 1
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
    healed,
    warded,
    appeared,
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

/** 逐人的一行读数 —— 判据按职能分栏读它（见 Band 的注释） */
export interface ShareRow {
  id: string
  /** 伤害份额（只在主音那一栏拿它作判据） */
  share: number
  /** 治疗份额 */
  healShare: number
  swings: number
  heal: number
  /** 架盾手数（`tone === 'ward'`） */
  ward: number
  /** 上过场的场次 */
  appearances: number
  /** 每场平均出手（按上过场的场次折算，不是按总场次） */
  swingsPer: number
  duty: DutyId
}

export interface BalanceReport {
  rows: Row[]
  /** 全场逐人读数 */
  share: ShareRow[]
  /** 只算危险度 ≥ 5 的场次 —— 前几档常常是一手就完，混进来会把份额带偏 */
  shareHard: ShareRow[]
  totals: { runs: number; win: number; stuck: number; guards: number; thin: number; locked: number }
  flags: string[]
  /** 不判伤害的那几职，逐条把理由与自己的读数写出来 —— **不藏** */
  exempt: string[]
}

/** 低于这一档的敌人往往活不过一手，份额统计和「一人成军」判据都不该把它算进来 */
const HARD_STAGE = 5

/**
 * 逐人的一本账。
 *
 * 为什么要摊成这么几栏：**一把尺量不了五个职能**。原来是拿伤害份额一把尺量所有人，
 * 可设定里调度「自身伤害全队最低」、取材「不直接杀人」—— 拿伤害去量他们，
 * 量出来的必然是「上场等于少一个人」，那不是他们的毛病，是尺子的毛病。
 * 所以每人照自己那一职的栏读：主音看 dmg，和音看 heal，护卫看 ward，调度看出手率，
 * 取材另有台账（见下方判据）。**份额按 `appearances` 折算** —— 一人只在上过场的
 * 那些场次里分摊，不然「很少被推荐出场」会被读成「上去也没用」。
 */
interface Band {
  dmg: number
  swings: number
  heal: number
  ward: number
  appearances: number
}

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
  const share = new Map<string, Band>()
  const shareHard = new Map<string, Band>()
  let runs0 = 0, win0 = 0, stuck0 = 0, guards0 = 0, locked0 = 0

  for (let i = 0; i < runs; i++) {
    const seed = seedBase + i
    /* 本时期的看板 —— 走**同一个** `progress`，签署放行线也跟着这一档走。
       ⚠️ 挂「等待签署」的那几张**跳过不打**：那是玩家按不动的牌
       （Missions 的 `act` 只弹一句提示，`data/mission` 上根本没有出击钮）。
       从前它们照打，于是复核一直在给「开局危险度 9/10 胜率 13%」这类
       谁也开不了的仗打分 —— 见 2026-09-16 那条 `SIGN_OFF`。 */
    const board = genBoard(seed, progress, 10)
    for (const m of board) {
      if (m.status === '锁定') { locked0 += 1; continue }
      const t = fight(m, progress, {})
      runs0 += 1
      if (t.outcome === 'won') win0 += 1
      if (t.outcome === 'stuck') stuck0 += 1
      guards0 += t.guards
      const list = buckets.get(t.stage) ?? []
      list.push(t)
      buckets.set(t.stage, list)
      const bands: Array<Map<string, Band>> =
        t.stage >= HARD_STAGE ? [share, shareHard] : [share]
      for (const band of bands) {
        // 名册是逐人摊的：没打出伤害的人（和音 / 调度）也得进账本，
        // 不然他们在伤害份额里根本不出现，「按职能分栏」就没有栏可读。
        for (const id of Object.keys(t.appeared)) {
          const cur = band.get(id) ?? { dmg: 0, swings: 0, heal: 0, ward: 0, appearances: 0 }
          cur.dmg += t.dealt[id] ?? 0
          cur.heal += t.healed[id] ?? 0
          cur.ward += t.warded[id] ?? 0
          cur.swings += t.swings[id] ?? 0
          cur.appearances += t.appeared[id] ?? 0
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

  const sharesOf = (m: Map<string, Band>): ShareRow[] => {
    /* 份额按**上过场的场次**折算 —— 一人只在他上过场的那些场次里分摊。
       不折算的话，每场都在的那一位（主角）总量必然最大，读出来就是「一人成军」：
       那不是他强，是他出场多。名册是轮换的，总量与强度不是一回事。 */
    const per = (v: Band, k: 'dmg' | 'heal') => v[k] / Math.max(1, v.appearances)
    const total = [...m.values()].reduce((a, b) => a + per(b, 'dmg'), 0) || 1
    const totalHeal = [...m.values()].reduce((a, b) => a + per(b, 'heal'), 0) || 1
    return [...m.entries()]
      .map(([id, v]) => ({
        id,
        share: per(v, 'dmg') / total,
        healShare: per(v, 'heal') / totalHeal,
        swings: v.swings,
        heal: v.heal,
        ward: v.ward,
        appearances: v.appearances,
        swingsPer: v.swings / Math.max(1, v.appearances),
        duty: dutyOf(combatantOf(id, progress, 0).duty).id,
      }))
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
  /* 判据按**职能**分栏读 —— 一把尺量不了五个职能（见 Band 的注释）。
     主音判伤害份额；和音判治疗；护卫判护盾＋治疗；调度与取材**不判伤害**
     （设定里就是「自身伤害全队最低」「不直接杀人」），只把他们自己的那一栏读数
     连同理由写进 report —— **不藏**，免得看起来像漏判。 */
  const exempt: string[] = []
  for (const x of hard) {
    if (x.swings < 40) continue
    const pctOf = (v: number) => `${(v * 100).toFixed(1)}%`
    if (x.duty === '主音') {
      if (x.share < 0.05) flags.push(`伤害偏低（主音）：${x.id} 出手 ${x.swings} 次只占 ${pctOf(x.share)}——上场等于少一个人`)
    } else if (x.duty === '和音') {
      if (x.heal <= 0) flags.push(`治疗为零（和音）：${x.id} 出手 ${x.swings} 次一口没回——她那一栏是空的`)
    } else if (x.duty === '护卫') {
      if (x.ward + x.heal <= 0) flags.push(`护持为零（护卫）：${x.id} 出手 ${x.swings} 次没架过一次盾、也没回过一口血`)
    } else {
      exempt.push(`${x.id}（${x.duty}）每场出手 ${x.swingsPer.toFixed(1)} 次 · 伤害份额 ${pctOf(x.share)}`
        + ` · 治疗 ${x.heal} · 架盾 ${x.ward} 手 —— ${x.duty === '调度' ? '设定即自身伤害全队最低' : '设定即不直接杀人'}，不判伤害`)
    }
  }
  const bossRows = rows.filter((r) => r.bossRuns >= 8)
  for (const r of bossRows) {
    if (r.bossWin < 0.35) flags.push(`boss 档（危险度 ${r.stage}）：胜率 ${(r.bossWin * 100).toFixed(0)}%——终结技能可能没得解`)
  }

  return {
    rows,
    share: shares,
    shareHard: sharesHard,
    totals: { runs: runs0, win: runs0 ? win0 / runs0 : 0, stuck: stuck0, guards: guards0, thin, locked: locked0 },
    flags,
    exempt,
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
  out.push(`  本时期看板上另有 ${r.totals.locked} 张挂「等待签署」，按不动 —— 未计入上表`)
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
  /* 不判伤害的那几职，逐条摆出来 —— 不藏。
     判据是按职能分栏读的：拿伤害去量和音、调度、取材，量出来的必然是「没用」，
     那不是他们的毛病，是尺子的毛病。所以这里连理由带读数一起摊开，
     要检的人自己看得见哪几栏没判、为什么没判。 */
  if (r.exempt.length) {
    out.push('  按职能分栏 · 不判伤害的那几职（不藏）')
    out.push('  ────────────────────────────────────────────────')
    for (const e of r.exempt.slice(0, 16)) out.push('  · ' + e)
    if (r.exempt.length > 16) out.push(`  · （另有 ${r.exempt.length - 16} 条同款，略）`)
    out.push('')
  }
  if (r.flags.length) {
    out.push('  ⚠ 越界项')
    for (const f of r.flags) out.push('    · ' + f)
  } else {
    out.push('  ✓ 各项都在设定区间内')
  }
  out.push('')
  return out.join('\n')
}
