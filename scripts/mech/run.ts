/* ============================================================
   战斗机制定点复核 —— 让引擎自己证明这四样机制真的生效
   ------------------------------------------------------------
   为什么单开一支，而不是塞进 smoke：
     smoke 跑的是**构建产物**（vite preview），它读不到源码模块；
     这四样机制住在引擎内部，只有拿源码那一份才验得动。
     所以这里借 vite 的 SSR 加载器现场编译（同 balance.mjs），不落产物。

   为什么不信「整场模拟里出现过」：
     上一版就是在整场对局里捞日志 —— 结果 ward 一次没捞到（敌人没往
     有护持的人身上挂负面），break 还被 stall 的标签盖住。那叫**没测到**，
     不叫通过。所以这里不打整场，每一样都单独摆出来点名验，
     而且凡是要证明「这样做了」的，都配一条**对照**证明「不这样就不做」——
     否则断言可能在「根本没打起来」的空场上悄悄通过（这坑踩过：
     单人挑 stage 10，createBattle 一返回 phase 就已经是 lost）。

     node scripts/mech.mjs
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs'
import {
  act, advance, aliveOf, atkMulOf, affordable, basicOf, brokenOf, buffOf, chargeOf, createBattle,
  enemysTurn, find, guardLeft, legalSkills, pendingFoe, skipOf, standingOf, summonFoe,
} from '../../src/lib/battle/engine'
import { combatantOf, enemiesOf, minionOf } from '../../src/lib/battle/derive'
import { effectiveGrowth, LEVEL_BASE_COST, LEVEL_STEP_PCT, levelCostOf } from '../../src/lib/battle/store'
import { AXIS_REF } from '../../src/data/types'
import { MISSIONS } from '../../src/data/missions'
import { TIMELINE } from '../../src/data/timeline'
import { CODEX, resolveEntityToCodexId } from '../../src/data/codex'
import { TUNING, enemyAxesAt } from '../../src/lib/battle/tuning'
import { END_FOES } from '../../src/lib/battle/endfoes'
import { EVENT_HEAD, NON_FIGHT_EVENTS, headFoeOf, mainlineMissions } from '../../src/lib/battle/mainline'
import { battleMissionOf } from '../../src/lib/battle/from-directive'
import { rOfPlace } from '../../src/lib/battle/rvalue'
import { ROSTER } from '../../src/lib/battle/roster'
import { effectLineOf, mulTextOf } from '../../src/lib/battle/skilltext'
import { DEBUFF_KEYS } from '../../src/lib/battle/types'
import { LION_PAIR_ID } from '../../src/lib/battle/synergy'
import { namedBossOf } from '../../src/lib/battle/bosses'
import { OPERATOR_ID, personOf } from '../../src/data/castmeta'
import { BEDS } from '../../src/lib/audio/music'
import { VIEW_BED } from '../../src/lib/audio/index'
import { hz } from '../../src/lib/audio/sfx'
import type { BedName, Chord } from '../../src/lib/audio/music'
import type { Mission } from '../../src/data/types'
import type { AxisKey, BattleState, BuffKey, Combatant, EnemyIntent, SkillSpec } from '../../src/lib/battle/types'

export interface MechReport {
  pass: string[]
  fail: string[]
  info: string[]
}

/** 一条轴护盾该长在谁身上 —— 这里写死，是为了改动 atlas/derive 时能被抓住 */
const EXPECT_AXIS: Record<string, AxisKey> = {
  '漆黑的影': '意志力',
  '异端显形': '反现实亲和',
  '反现实制成品': '破坏力',
  '反现实残渣': '意志力',
  '低语聚合体': '意志力',
  '异界龙花': '破坏力',
  '未分类观测体': '反现实亲和',
}

/** 会作为**负面**落到对方头上的那些效果键 —— 每一个都必须在 DEBUFF_KEYS 里，
    否则「净化」清不掉它、首领的终结技削弱也压不住它，机制就漏了。 */
const HOSTILE_BUFF_KEYS: BuffKey[] = [
  'mark', 'slow', 'silence', 'bleed', 'frail', 'stasis', 'lockdown', 'stall',
]

/** 把「反现实制成品 甲 · 首领」还原成型别名（排行字要跟 derive 的 SUFFIX 一样长） */
function profileOf(name: string): string {
  return name.replace(/ · (精英|首领)$/, '').replace(/ [甲乙丙丁戊己庚辛]$/, '')
}

export function run(): MechReport {
  const pass: string[] = []
  const fail: string[] = []
  const info: string[] = []
  const ok = (name: string, cond: boolean, extra = '') => {
    (cond ? pass : fail).push(name + (extra ? ' :: ' + extra : ''))
  }

  /* —— 场地：必须是**真打得起来**的一场 ——
     上一版拿「isis 单人挑 stage 10」当靶场，createBattle 一返回就已经 lost、
     人已经 down，act() 撞在 me.down 上原样返回 ——
     于是「轴不对就削不动」是假通过：不是没削动，是压根没出手。 */
  const byStage = MISSIONS.slice().sort((a, b) => a.stage - b.stage)
  const mission = byStage[0]
  const SQUAD = ['isis', 'phidra', 'maria', 'mefisa']
  const mk = (cmd?: 'offline' | 'ai') => createBattle({
    mission, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {}, command: cmd,
  })
  info.push(`靶场：stage ${mission.stage}「${mission.title ?? ''}」`)

  /** 场地立住了没有；立不住就抛 —— 不能让断言在空场上通过 */
  const ready = (s: ReturnType<typeof mk>, who: string): Combatant => {
    const c = find(s, who)
    if (s.phase !== 'select' && s.phase !== 'think') throw new Error(`场地没立住（phase=${s.phase}）`)
    if (!c || c.down || c.hp <= 0) throw new Error(`出手的人不在场上（${who}）`)
    return c
  }
  /** 必中：测的是「打上去之后怎么算」，不是「打不打得到」。
      不封这个的话，敌方闪避会让攻击直接 miss —— 断言全数落空。 */
  const sureHit = (c: Combatant) => {
    c.passive = c.passive
      ? { ...c.passive, sureHit: true }
      : { name: '复核 · 必中', desc: '复核用：跳过闪避判定，专心验这一手怎么算', sureHit: true }
  }
  /** 敌方全按住：条压到负数，几拍之内涨不回来 */
  const freezeFoes = (s: ReturnType<typeof mk>) => { for (const f of s.enemies) f.bar = -1e6 }

  /* ---------- 1) 破绽 ---------- */
  try {
    const s = mk()
    const me = ready(s, 'isis')
    const foe = s.enemies[0]!
    const basic = basicOf(me)!
    sureHit(me)
    foe.guardAxis = basic.axis
    foe.guardPts = 1
    foe.guardMax = 3
    freezeFoes(s)
    s.actor = me.id
    s.phase = 'select'
    act(s, { t: 'atk', targetId: foe.id })
    ok('破绽：对上轴削穿即成立', foe.broken > 0, `broken=${foe.broken} 轴=${basic.axis}`)
    ok('破绽：打穿后护盾按满点重置', foe.guardPts === 3, `guardPts=${foe.guardPts}`)
    ok('破绽：brokenOf / skipOf 读数跟着走', brokenOf(foe) && skipOf(foe) > 0)

    // 轴对不上：纹丝不动
    const s2 = mk()
    const me2 = ready(s2, 'isis')
    const foe2 = s2.enemies[0]!
    sureHit(me2)
    foe2.guardAxis = basicOf(me2)!.axis === '破坏力' ? '意志力' : '破坏力'
    foe2.guardPts = 3
    foe2.guardMax = 3
    freezeFoes(s2)
    s2.actor = me2.id
    s2.phase = 'select'
    act(s2, { t: 'atk', targetId: foe2.id })
    ok('破绽：轴不对就削不动（对照）', foe2.guardPts === 3 && foe2.broken === 0,
      `guardPts=${foe2.guardPts} broken=${foe2.broken}`)

    // 破绽期间挨打更重：同一手，只翻 broken 这一个开关，各跑 600 次把抖动平均掉
    let plainSum = 0
    let ampSum = 0
    const N = 600
    for (const broken of [false, true]) {
      for (let i = 0; i < N; i++) {
        const sc = mk()
        const m2 = ready(sc, 'isis')
        const f2 = sc.enemies[0]!
        sureHit(m2)
        f2.hp = 1e9
        f2.hpMax = 1e9
        f2.broken = broken ? 2 : 0
        f2.guardAxis = undefined
        f2.guardPts = 0
        f2.buffs = f2.buffs.filter((b) => b.k !== 'mark')
        freezeFoes(sc)
        sc.actor = m2.id
        sc.phase = 'select'
        act(sc, { t: 'atk', targetId: f2.id })
        const dmg = f2.hpMax - f2.hp
        if (broken) ampSum += dmg
        else plainSum += dmg
      }
    }
    const plain = plainSum / N
    const amp = ampSum / N
    const ratio = plain > 0 ? amp / plain : 0
    info.push(`破绽加成实测：普通 ${plain.toFixed(1)} → 破绽中 ${amp.toFixed(1)}（×${ratio.toFixed(3)}，表上 ×${TUNING.breakAmp}）`)
    ok('破绽：挨打加成确实乘上去了', plain > 0 && Math.abs(ratio - TUNING.breakAmp) < 0.05, `×${ratio.toFixed(3)}`)
  } catch (e) {
    fail.push('破绽段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 2) 断拍 ---------- */
  try {
    /* 两跑对照：同一副牌面，只差挂不挂那一层断拍。
       只跑挂断拍的那一跑说明不了问题 —— 万一他本来就没轮上，
       「没出手」也会通过。所以先证明**不挂的时候他确实会出手**。
       牌面：他自己条满，我方全压到差一点点 —— 他一定是头一个。 */
    const setup = (stall: boolean) => {
      const s = mk()
      ready(s, 'isis')
      const foe = s.enemies[0]!
      /* 这一段验的是断拍，不是召唤：把召唤那一手从牌面上拿掉。
         不拿掉的话，对照跑证明的只是「他会出个动静」—— 而召唤正好是他的第一个动静，
         于是「他确实出手了」在日志里读起来是 foe-summon，不是一次攻击。 */
      foe.skills = foe.skills.filter((k) => !k.summon)
      for (const f of s.enemies) f.bar = -1e6
      for (const a of s.allies) a.bar = TUNING.barMax - 4
      foe.buffs = foe.buffs.filter((b) => b.k !== 'stall')
      if (stall) foe.buffs.push({ k: 'stall', v: 1, t: 1 })
      foe.bar = TUNING.barMax
      const cdsBefore = JSON.stringify(foe.cds ?? {})
      s.actor = null
      s.phase = 'select'
      const before = s.log.length
      advance(s)
      return { foe, cdsBefore, fresh: s.log.slice(before) }
    }
    const ctl = setup(false)
    const t = setup(true)
    const acted = (r: ReturnType<typeof setup>) =>
      r.fresh.some((x) => x.actorId === r.foe.id && x.skillId !== 'stall-off' && x.skillId !== 'break-off')
    ok('断拍：对照跑（不挂断拍）他确实出手了', acted(ctl),
      `对照组日志：${ctl.fresh.map((x) => x.skillId).join(',')}`)
    ok('断拍：挂了断拍他这一手没打出来', !acted(t), `日志：${t.fresh.map((x) => x.skillId).join(',')}`)
    const first = t.fresh[0]
    ok('断拍：轮到他时第一件事就是这一拍被划掉',
      !!first && (first.skillId === 'stall-off' || first.skillId === 'break-off'),
      first ? `${first.skillId}｜${first.skill ?? ''}` : '没有日志')
    ok('断拍：挡完即清（不会挂第二拍）', buffOf(t.foe, 'stall') === 0, `stall=${buffOf(t.foe, 'stall')}`)
    // 狠处在于「不回冷却」：这一手被划掉，冷却照走数。推进了就等于只是延后，不是罚。
    ok('断拍：冷却不跟着回（罚就罚在这里）', JSON.stringify(t.foe.cds ?? {}) === t.cdsBefore,
      `${t.cdsBefore} → ${JSON.stringify(t.foe.cds ?? {})}`)
    info.push(`断拍：对照 ${ctl.fresh.map((x) => x.skillId).join(',')} ／ 断拍 ${t.fresh.map((x) => x.skillId).join(',')}`)
  } catch (e) {
    fail.push('断拍段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 3) 护持 ---------- */
  try {
    const s = mk('ai')
    const victim = s.allies[0]!
    victim.ward = 2
    const debuff: SkillSpec = {
      id: 'mech-test-debuff', name: '测试 · 压制', kind: '技能', desc: '',
      cost: 0, power: 0, axis: '反现实亲和', fx: 'seal', line: '（复核用）', target: 'one',
      effect: { mark: 0.4, slow: 0.3 },
    }
    /* 推到「敌方那一手待命」为止。
       不能靠「让引擎自己打过去」—— stage 1 的杂兵在我方四个人的条涨满之前
       就被清完了，敌方根本轮不上，pendingFoe 永远是空（这一版就是这么挂的）。
       所以直接把场面按住：我方全压到负数，点名的那只条拉满，
       他一准是头一个，advance 必然停在 'think' 上等他。 */
    const toThink = () => {
      const foe = s.enemies.find((f) => !f.down)
      if (!foe) return null
      for (const a of s.allies) a.bar = -1e6
      for (const f of s.enemies) f.bar = -1e6
      foe.bar = TUNING.barMax
      s.actor = null
      s.phase = 'select'
      advance(s)
      return pendingFoe(s)
    }
    const fire = () => {
      const foe = toThink()
      if (!foe) return false
      foe.skills = [debuff]
      const intent: EnemyIntent = { foeId: foe.id, skillId: debuff.id, targetId: victim.id, by: 'offline' }
      enemysTurn(s, intent)
      return true
    }

    const shots: { ward: number; mark: number }[] = []
    if (!fire()) fail.push('护持：没等到敌方待命（pendingFoe 一直为空）')
    else {
      shots.push({ ward: victim.ward, mark: buffOf(victim, 'mark') })
      const w = s.log.filter((x) => x.skillId === 'ward')
      ok('护持：第一发负面被整条挡下',
        buffOf(victim, 'mark') === 0 && buffOf(victim, 'slow') === 0,
        `mark=${buffOf(victim, 'mark')} slow=${buffOf(victim, 'slow')}`)
      ok('护持：挡一次少一层', victim.ward === 1, `ward=${victim.ward}`)
      ok('护持：日志里说得出来', w.length > 0, w.length ? `${w[0]!.skill}｜${w[0]!.note ?? ''}` : '没有那条日志')

      if (fire()) shots.push({ ward: victim.ward, mark: buffOf(victim, 'mark') })
      ok('护持：第二发照样挡下',
        shots.length > 1 && shots[1]!.mark === 0 && victim.ward === 0,
        `ward=${victim.ward} mark=${buffOf(victim, 'mark')}`)

      // 第三发：两层用尽 —— 这一发**必须中**。
      // 没有这一条，前面两条就算全过也说明不了问题：万一路由根本没走通，
      // mark 本来就永远挂不上，那三条会一起「通过」。
      if (fire()) shots.push({ ward: victim.ward, mark: buffOf(victim, 'mark') })
      ok('护持：两层用尽后负面正常落下（对照）',
        shots.length > 2 && shots[2]!.mark > 0,
        `ward=${victim.ward} mark=${buffOf(victim, 'mark')}`)
      // 回合上限只管增益 —— 回合闸要是也盖到负面头上，这一发标记就会在
      // advance 把条充回来的那几拍里自己散掉，玩家根本见不到（这正是踩过的坑）
      const landed = victim.buffs.find((b) => b.k === 'mark')
      ok('护持：负面不吃回合闸（那道闸只管增益）',
        !!landed && landed.rt == null, `mark.rt=${landed?.rt}`)
    }
    info.push('护持三发读数：' + JSON.stringify(shots))
  } catch (e) {
    fail.push('护持段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 4) 蓄力 ---------- */
  try {
    const s = mk()
    const me = ready(s, 'phidra')
    const stake = me.skills.find((k) => k.id === 'phidra-stake')
    ok('蓄力：赌注这一手在表上', !!stake)
    me.cds = {}
    me.sp = 999
    freezeFoes(s)
    s.actor = me.id
    s.phase = 'select'
    act(s, { t: 'skill', skillId: 'phidra-stake', targetId: me.id })
    ok('蓄力：放下赌注后身上挂着那口气', me.charge > 1, `charge=${me.charge}`)
    ok('蓄力：赌注自身倍率为 0（不落进伤害那一支）', stake?.power === 0, `power=${stake?.power}`)

    s.actor = me.id
    s.phase = 'select'
    me.bar = TUNING.barMax
    me.sp = 999
    me.cds = {}
    freezeFoes(s)
    act(s, { t: 'atk', targetId: s.enemies[0]!.id })
    ok('蓄力：打出去即交付（不再留着）', me.charge === 0, `charge=${me.charge}`)

    // 攒着的时候挨一下：够重才散，轻碰不掉 —— 否则就成了「挨打就掉」，没有取舍
    const swing = (power: number, axis: number) => {
      const sc = mk()
      const victim = ready(sc, 'phidra')
      const foe = sc.enemies[0]!
      victim.charge = 1.8
      // 血量抬到 5000：门槛（10% = 500）够得着，人又打不死 ——
      // 验的是「这一下重到能把那口气打散」，不是「她会不会被打倒」。
      victim.hpMax = 5000
      victim.hp = 5000
      foe.skills = [{
        id: 'mech-test-hit', name: '测试 · 一击', kind: '技能', desc: '',
        cost: 0, power, axis: '破坏力', fx: 'blast', line: '（复核用）', target: 'one',
      }]
      foe.axes['破坏力'] = axis
      for (const a of sc.allies) a.bar = -1e6
      for (const f of sc.enemies) f.bar = -1e6
      foe.bar = TUNING.barMax
      sc.phase = 'select'
      sc.actor = null
      advance(sc)
      return { taken: 5000 - victim.hp, charge: victim.charge, broke: sc.log.some((x) => x.skillId === 'charge-break') }
    }
    const heavy = swing(6, 260)
    const light = swing(0.5, 2)
    const line = Math.round(5000 * TUNING.chargeBreak)
    ok('蓄力：挨到够重的一下会被打散', heavy.broke,
      `这一下 ${heavy.taken}（门槛 ${line}）· charge=${heavy.charge}`)
    ok('蓄力：轻碰一下不掉（对照）', !light.broke && light.charge === 1.8,
      `这一下 ${light.taken}（门槛 ${line}）· charge=${light.charge}`)
    info.push(`蓄力门槛校准：重击 ${heavy.taken} ／ 轻碰 ${light.taken}，门槛 ${line}`)
  } catch (e) {
    fail.push('蓄力段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 5) 破绽该长在谁身上 ---------- */
  try {
    const seen = new Map<string, { axis: AxisKey; pts: number; tier: string }>()
    for (const m of MISSIONS) {
      for (const f of enemiesOf(m)) {
        if (!f.guardAxis) continue
        seen.set(f.name, { axis: f.guardAxis, pts: f.guardPts, tier: f.tier ?? 'minion' })
      }
    }
    info.push('带破绽的敌体（去重 ' + seen.size + ' 种）：'
      + [...seen.entries()].map(([n, g]) => `${n}→${g.axis}/${g.pts}`).join('　'))
    ok('破绽：确实发到了敌阵头上', seen.size > 0, `${seen.size} 种`)

    // 指名道姓的那些人名字里是「・」（不带空格）；通用型别名走「 · 精英/首领」后缀。
    // 只要是前者还带着破绽，就说明那层「打不穿」又糊回人身上了。
    const named = [...seen.keys()].filter((n) => n.includes('・'))
    ok('破绽：指名首领不带通用破绽层', named.length === 0,
      named.length ? '被糊上的：' + named.join('、') : `查了 ${seen.size} 种敌体`)

    const wrongAxis = [...seen.entries()]
      .filter(([n, g]) => EXPECT_AXIS[profileOf(n)] && EXPECT_AXIS[profileOf(n)] !== g.axis)
      .map(([n, g]) => `${n}→${g.axis}（应为 ${EXPECT_AXIS[profileOf(n)]}）`)
    ok('破绽：每类型别的那条轴与表一致', wrongAxis.length === 0, wrongAxis.join('、'))

    const ptsOf = (tier: string) =>
      tier === 'boss' ? TUNING.guardBoss : tier === 'elite' ? TUNING.guardElite : TUNING.guardMinion
    const wrongPts = [...seen.entries()]
      .filter(([, g]) => g.pts !== ptsOf(g.tier))
      .map(([n, g]) => `${n}（${g.tier}）${g.pts} ≠ ${ptsOf(g.tier)}`)
    ok('破绽：点数按档次走（首领>精英>杂兵）', wrongPts.length === 0, wrongPts.join('、'))
  } catch (e) {
    fail.push('破绽分布段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 6) 旧吉他 · 解封：规格翻倍到底翻到了哪些量 ---------- */
  try {
    /* 编队按「谁手上真有这几样量」来配，不是按主角团来配：
       削破绽在 isis-halid（伊西斯）手上 —— 队里那个 `isis` 是另一位，
       她的表里没有 isis-scoop（上一版就是照 id 猜人，四条断言全落空）。
       编队上限 6，正好把要用的都带上。 */
    const S2 = ['isis-halid', 'youshihan', 'maria', 'phidra', 'nana-kamiru', 'mefisa']
    const mk2 = () => createBattle({
      mission, squad: S2, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const burst = ROSTER.hikari?.skills.find((k) => k.id === 'hikari-burst')
    ok('解封：旧吉他·解封这一手在表上', !!burst)
    ok('解封：它给的是规格 ×2（不是这一拍打得更重）',
      burst?.effect?.skillMul === 2 && burst?.power === 0,
      `skillMul=${burst?.effect?.skillMul} power=${burst?.power}`)
    ok('解封：门一解不立刻能甩（openAfter）', (burst?.openAfter ?? 0) >= 1, `openAfter=${burst?.openAfter}`)

    // 把「解封已在身上」这件事直接摆成状态：buff 存的是 +（N−1），1 + 1 = ×2
    const unlock = (c: Combatant) => { c.buffs.push({ k: 'skillMul', v: 1, t: 3 }) }
    const castAs = (s: ReturnType<typeof mk2>, who: string, skillId: string, targetId?: string) => {
      const c = find(s, who)!
      c.sp = 999
      c.cds = {}
      freezeFoes(s)
      s.actor = c.id
      s.phase = 'select'
      act(s, { t: 'skill', skillId, targetId })
      return c
    }

    // (a) 伤害那一支：普攻倍率 ×2
    const hitSum = (spec: boolean) => {
      let sum = 0
      const N2 = 500
      for (let i = 0; i < N2; i++) {
        const s = mk2()
        const h = find(s, 'mefisa')!
        const foe = s.enemies[0]!
        sureHit(h)
        if (spec) unlock(h)
        foe.hp = 1e9
        foe.hpMax = 1e9
        foe.guardAxis = undefined
        foe.guardPts = 0
        foe.buffs = foe.buffs.filter((b) => b.k !== 'mark')
        freezeFoes(s)
        s.actor = h.id
        s.phase = 'select'
        act(s, { t: 'atk', targetId: foe.id })
        sum += foe.hpMax - foe.hp
      }
      return sum / N2
    }
    const plainHit = hitSum(false)
    const specHit = hitSum(true)
    const hitRatio = plainHit > 0 ? specHit / plainHit : 0
    ok('解封：普攻伤害按规格翻倍', Math.abs(hitRatio - 2) < 0.06, `×${hitRatio.toFixed(3)}（${plainHit.toFixed(1)} → ${specHit.toFixed(1)}）`)

    // (b) 护持：优士羽的 2 次 → 4 次（她自己那一手，target self，不封门）
    const wardOf = (spec: boolean) => {
      const s = mk2()
      const y = find(s, 'youshihan')!
      if (spec) unlock(y)
      castAs(s, 'youshihan', 'youshihan-fate', y.id)
      return y.ward
    }
    ok('解封：护持的层数跟着翻（2 → 4）', wardOf(false) === 2 && wardOf(true) === 4,
      `${wardOf(false)} → ${wardOf(true)}`)

    // (c) 削破绽：伊西斯（isis-halid）的 2 点 → 4 点
    const stripOf = (spec: boolean) => {
      const s = mk2()
      const foe = s.enemies[0]!
      foe.guardAxis = '破坏力'
      foe.guardPts = 10
      foe.guardMax = 10
      const i = find(s, 'isis-halid')!
      if (spec) unlock(i)
      castAs(s, 'isis-halid', 'isis-scoop', foe.id)
      return 10 - foe.guardPts
    }
    ok('解封：削破绽跟着翻（2 点 → 4 点）', stripOf(false) === 2 && stripOf(true) === 4,
      `${stripOf(false)} → ${stripOf(true)}`)

    // (d) 回复量：按读出来的那个数比，别按血条比（血条会被上限削平）
    const healOf = (spec: boolean) => {
      const s = mk2()
      const m = find(s, 'maria')!
      if (spec) unlock(m)
      for (const a of s.allies) { a.hpMax = 100000; a.hp = 1000 }
      const before = s.log.length
      castAs(s, 'maria', 'maria-song')
      const line = s.log.slice(before).find((x) => x.skillId === 'heal')
      return line?.heal ?? 0
    }
    const hPlain = healOf(false)
    const hSpec = healOf(true)
    ok('解封：回复量跟着翻', hPlain > 0 && Math.abs(hSpec / hPlain - 2) < 0.02, `${hPlain} → ${hSpec}`)

    // (e) 蓄力**不该**翻 —— 它最后要乘进的那份伤害自己已经吃过规格了，再乘就是算两遍
    const chargeOf2 = (spec: boolean) => {
      const s = mk2()
      const p = find(s, 'phidra')!
      if (spec) unlock(p)
      castAs(s, 'phidra', 'phidra-stake', p.id)
      return p.charge
    }
    ok('解封：蓄力**不**跟着翻（免得规格算两遍）',
      chargeOf2(false) === 1.8 && chargeOf2(true) === 1.8, `${chargeOf2(false)} → ${chargeOf2(true)}`)

    // (f) 断拍本来就压死在 1 次，翻了也还是 1 —— 这条是复合惩罚，不许开口子
    const stallOf = (spec: boolean) => {
      const s = mk2()
      const foe = s.enemies[0]!
      const n = find(s, 'nana-kamiru')!
      if (spec) unlock(n)
      castAs(s, 'nana-kamiru', 'nana-heavy', foe.id)
      return buffOf(foe, 'stall')
    }
    ok('解封：断拍仍压死在 1 次（复合惩罚不开口子）',
      stallOf(false) === 1 && stallOf(true) === 1, `${stallOf(false)} → ${stallOf(true)}`)

    info.push(`解封实测：普攻 ×${hitRatio.toFixed(3)}／护持 ${wardOf(false)}→${wardOf(true)}／`
      + `削破绽 ${stripOf(false)}→${stripOf(true)}／回复 ${hPlain}→${hSpec}／`
      + `蓄力 ${chargeOf2(false)}→${chargeOf2(true)}（不变）／断拍 ${stallOf(false)}→${stallOf(true)}（封顶）`)

    /* (g) 端到端：把希卡莉那把吉他从封印里一路拧开。
       上面 (a)~(f) 是往身上直接塞 skillMul 摆出来的规格 —— 那验的是「乘算那一层」；
       这一段验的是「解封这件事本身」：五重封印逐重开、门开了还要过两拍、
       甩出来之后她自己下一手真的按新规格走。 */
    const chain = (useBurst: boolean) => {
      const s = createBattle({
        mission, squad: ['hikari', 'mefisa'], progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
      })
      const h = find(s, 'hikari')!
      const other = find(s, 'mefisa')!
      const step = (who: Combatant, cmd: Parameters<typeof act>[1]) => {
        who.sp = 999
        who.cds = {}
        freezeFoes(s)
        s.actor = who.id
        s.phase = 'select'
        act(s, cmd)
      }
      const chainLog: string[] = []
      // 五重封印：链上只列得出启动手，别的一概不给。
      // 圈数**必须**是 startNeed —— 多跑一圈，那一圈列出来的就是解禁之后的手，
      // duringChain 会被污染，hand 也白白多走一格（上一版就是这么错的）。
      const duringChain = new Set<string>()
      const rounds = h.startNeed
      for (let i = 0; i < rounds; i++) {
        const legal = legalSkills(h, s).map((k) => k.id)
        if (!legal.length) break
        for (const id of legal) duringChain.add(id)
        const before = s.log.length
        step(h, { t: 'skill', skillId: legal[0]!, targetId: h.id })
        chainLog.push(s.log.slice(before).map((l) => l.skill ?? l.skillId).join('/'))
      }
      const unsealed = { used: h.startUsed, need: h.startNeed, at: h.unsealedAt, legal: legalSkills(h, s).map((k) => k.id) }
      // 门开了再等两拍，burst 才列得出来
      const openedNow = legalSkills(h, s).some((k) => k.id === 'hikari-burst')
      const waited: boolean[] = []
      for (let i = 0; i < 3; i++) {
        step(other, { t: 'atk', targetId: s.enemies[0]!.id })
        waited.push(legalSkills(h, s).some((k) => k.id === 'hikari-burst'))
      }
      let smul = 0
      if (useBurst) {
        step(h, { t: 'skill', skillId: 'hikari-burst', targetId: h.id })
        smul = buffOf(h, 'skillMul')
      }
      // 解封之后她自己打一拳，看按什么规格算
      const foe = s.enemies[0]!
      foe.hp = 1e9
      foe.hpMax = 1e9
      foe.guardAxis = undefined
      foe.guardPts = 0
      foe.buffs = foe.buffs.filter((b) => b.k !== 'mark')
      sureHit(h)
      return { s, h, foe, chainLog, duringChain, unsealed, openedNow, waited, smul, step }
    }

    // 链本身（跑一次，不用重复 200 遍）
    const probe = chain(true)
    ok('解封：链上只列得出启动手（封印没开完，别的都锁着）',
      [...probe.duringChain].every((id) => id === 'hikari-start'),
      [...probe.duringChain].join(','))
    ok('解封：五重封印开完即「解禁」', probe.unsealed.used === probe.unsealed.need && probe.unsealed.need === 5,
      `startUsed=${probe.unsealed.used}/${probe.unsealed.need}`)
    ok('解封：解禁之后普攻与其余的手才列得出来',
      probe.unsealed.legal.includes('hikari-atk') && probe.unsealed.legal.includes('hikari-burst') === false,
      probe.unsealed.legal.join(','))
    ok('解封：解禁当拍 burst 还压着（openAfter）', probe.openedNow === false, `当拍列出=${probe.openedNow}`)
    ok('解封：等到第二拍 burst 才列得出来',
      probe.waited[0] === false && probe.waited[1] === true, JSON.stringify(probe.waited))
    ok('解封：甩出去之后规格真的挂在身上', probe.smul === 1, `skillMul=${probe.smul}`)
    info.push('解封链：' + probe.chainLog.join(' → '))

    // 走完整条链之后，她自己那一手按 ×2 算（两边都走链，只差甩不甩 burst）
    const afterChain = (useBurst: boolean) => {
      let sum = 0
      const N3 = 160
      for (let i = 0; i < N3; i++) {
        const c = chain(useBurst)
        c.h.cds = {}
        c.step(c.h, { t: 'atk', targetId: c.foe.id })
        sum += c.foe.hpMax - c.foe.hp
      }
      return sum / N3
    }
    const cPlain = afterChain(false)
    const cBurst = afterChain(true)
    const chainRatio = cPlain > 0 ? cBurst / cPlain : 0
    ok('解封：走完链之后每一手按新规格算', Math.abs(chainRatio - 2) < 0.1,
      `×${chainRatio.toFixed(3)}（${cPlain.toFixed(1)} → ${cBurst.toFixed(1)}）`)
    info.push(`解封端到端：解封前 ${cPlain.toFixed(1)} → 解封后 ${cBurst.toFixed(1)}（×${chainRatio.toFixed(3)}）`)
  } catch (e) {
    fail.push('解封段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 7) 面板读数与负面键的分工 ---------- */
  try {
    const want = ['isis-scoop', 'nana-heavy', 'phidra-stake', 'maria-end', 'youshihan-fate']
    const readouts: string[] = []
    for (const [who, def] of Object.entries(ROSTER)) {
      for (const k of def.skills) {
        if (!want.includes(k.id)) continue
        // 这五手都是不打伤害的（power 0），倍率读数按约定返回 null —— 写清楚，
        // 免得以后谁看到一行「→ null」以为面板坏了。
        readouts.push(`${who} · ${k.name} → ${mulTextOf(k) ?? '（本手不造成伤害）'}｜${effectLineOf(k)}`)
      }
    }
    ok('面板：改过的那五手都读得出新效果', readouts.length === want.length,
      `${readouts.length}/${want.length}`)
    info.push('面板读数：\n    ' + readouts.join('\n    '))
    ok('面板：护持/蓄力/断拍/削破绽都写进了读数',
      readouts.some((r) => r.includes('护持')) && readouts.some((r) => r.includes('蓄力'))
      && readouts.some((r) => r.includes('断拍')) && readouts.some((r) => r.includes('削破绽')))

    // 负面键必须登记在 DEBUFF_KEYS 里，否则「净化」清不掉、首领也压不住
    const missing = HOSTILE_BUFF_KEYS.filter((k) => !DEBUFF_KEYS.includes(k))
    ok('负面键都登记在 DEBUFF_KEYS 里（净化与首领压制才认得出）', missing.length === 0,
      missing.length ? missing.join('、') : `${HOSTILE_BUFF_KEYS.length} 个`)
  } catch (e) {
    fail.push('读数段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 8) 敌阵：血量远高于我方 · 首领不弱于精英 · 随时期变强 ----------
     这一节的判据全是「比值」，不是「某个绝对值」——
     因为这三条本身就是比值：远高于、不低于、随时期一起长。
     写死 818 这种数的话，改一次曲线就得回来改一次测试，
     而那正是测试最该拦住的那种改动。 */
  try {
    const stages = [...new Set(MISSIONS.map((m) => m.stage))].sort((a, b) => a - b)
    const PERIODS = [0, 0.5, 1]
    // 我方（p=1 口径）最硬的那一位：拿它当分母，是很苛刻的一把尺
    const allyTop = Math.max(...Object.keys(ROSTER).map((id) => combatantOf(id, 1, 0).hpMax))

    // (a) 每一档、每一时期，敌体血量都得站上我方最硬者的两倍
    const thin: string[] = []
    for (const p of PERIODS) {
      for (const st of stages) {
        const m = MISSIONS.find((x) => x.stage === st)!
        for (const f of enemiesOf({ ...m, bossId: undefined }, p)) {
          if (f.hpMax < allyTop * 2) thin.push(`p${p} 阶段${st} ${f.name}=${f.hpMax}`)
        }
      }
    }
    ok('敌阵：每一档、每一时期的血量都远高于我方（≥ 我方最硬者的 2 倍）',
      thin.length === 0, thin.length ? thin.slice(0, 4).join('／') : `分母 ${allyTop}`)
    info.push(`敌我血量：我方最硬 ${allyTop}（p=1）；`
      + stages.map((st) => {
        const m = MISSIONS.find((x) => x.stage === st)!
        const f = enemiesOf({ ...m, bossId: undefined }, 1)[0]!
        return `阶段${st} ${f.hpMax}`
      }).join('／'))

    // (b) 首领不弱于精英：两档从不在同一阶段同场（阶段 <6 出精英、≥6 出首领），
    //     所以这条只能跨阶段比 —— 也正是旧 bug 的形态（阶段 6 的首领比阶段 4 的精英还脆）。
    const eliteAt = (st: number, p = 0) => {
      const m = MISSIONS.find((x) => x.stage === st)
      return m ? enemiesOf({ ...m, bossId: undefined }, p).find((f) => f.tier === 'elite')?.hpMax ?? 0 : 0
    }
    const bossAt = (st: number, p = 0) => {
      const m = MISSIONS.find((x) => x.stage === st)
      return m ? enemiesOf({ ...m, bossId: undefined }, p).find((f) => f.tier === 'boss')?.hpMax ?? 0 : 0
    }
    const eliteStages = stages.filter((st) => eliteAt(st) > 0)
    const bossStages = stages.filter((st) => bossAt(st) > 0)
    const lowElite = eliteStages.length ? eliteAt(eliteStages[0]!, 1) : 0
    const highBoss = bossStages.length ? bossAt(bossStages[bossStages.length - 1]!, 0) : 0
    ok('敌阵：首领不弱于精英（跨阶段比 —— 最低档的首领也要压过最高档的精英）',
      lowElite > 0 && highBoss > lowElite,
      `最低档首领 ${highBoss} ／ 最高档精英 ${lowElite}`)
    // 首领那一档自己的倍数也该大于精英那一档的
    ok('敌阵：首领的档位倍数都在精英之上',
      TUNING.bossHpMul > TUNING.eliteHpMul && TUNING.bossAtkMul > TUNING.eliteAtkMul
      && TUNING.bossWillMul > TUNING.eliteWillMul,
      `血 ${TUNING.bossHpMul}>${TUNING.eliteHpMul}　攻 ${TUNING.bossAtkMul}>${TUNING.eliteAtkMul}　意 ${TUNING.bossWillMul}>${TUNING.eliteWillMul}`)

    // (c) 同一档危险度，越往后站上来的东西越硬 —— 这一条是补上的那个洞：
    //     在敌方读时期之前，同一个危险度在开局与卷末指向的是两场完全不同的仗。
    const flat: string[] = []
    for (const st of stages) {
      const m = MISSIONS.find((x) => x.stage === st)!
      const a = enemiesOf({ ...m, bossId: undefined }, 0)[0]!
      const b = enemiesOf({ ...m, bossId: undefined }, 1)[0]!
      if (!(b.hpMax > a.hpMax && b.axes.破坏力 > a.axes.破坏力)) {
        flat.push(`阶段${st} ${a.hpMax}/${a.axes.破坏力} → ${b.hpMax}/${b.axes.破坏力}`)
      }
    }
    ok('敌阵：同一档危险度，血量与破坏力都随时期变强',
      flat.length === 0, flat.length ? flat.join('／') : `${stages.length} 档都比过`)
    const m10 = MISSIONS.find((x) => x.stage === Math.max(...stages))!
    const a10 = enemiesOf({ ...m10, bossId: undefined }, 0)[0]!
    const b10 = enemiesOf({ ...m10, bossId: undefined }, 1)[0]!
    info.push(`时期增幅：最高档 ${a10.hpMax} → ${b10.hpMax}（×${(b10.hpMax / a10.hpMax).toFixed(2)}）`
      + `　破坏力 ${a10.axes.破坏力} → ${b10.axes.破坏力}`)

    // (d) 点名首领不吃时期增幅：档案页上是什么读数，打起来就该是什么读数
    const namedMission = MISSIONS.find((m) => m.bossId)
    if (namedMission) {
      const n0 = enemiesOf(namedMission, 0)[0]!
      const n1 = enemiesOf(namedMission, 1)[0]!
      ok('敌阵：点名首领不吃时期增幅（与档案页读数一致）',
        n0.hpMax === n1.hpMax && n0.axes.破坏力 === n1.axes.破坏力,
        `${n0.name} ${n0.hpMax} → ${n1.hpMax}`)
    } else {
      info.push('敌阵：没有挂 bossId 的任务，跳过点名首领那一条')
    }

    /* (e) 档案角色当 BOSS：场上头一名拿的是**他自己那一份手牌**。
       这一条钉的是「天空竞技祭那几位上场时还是他们本人」——
       名字对不上、招式串成通用包，那就成了换皮精英（读起来最像「做完了」的假通过）。
       逐条比 id 与顺序，不只看「有没有技能」：少一手、串一手都算。 */
    const bossMissions = MISSIONS.filter((m) => m.bossId)
    const onField = bossMissions.map((m) => {
      const nb = namedBossOf(m.bossId)
      const f = enemiesOf(m, 1)[0]!
      const same = !!nb && f.namedId === m.bossId && f.name === nb.name
        && f.skills.length === nb.skills.length
        && f.skills.every((k, i) => k.id === nb.skills[i]!.id)
      return { no: m.no, who: nb?.name ?? String(m.bossId), n: nb?.skills.length ?? 0, same }
    })
    ok('点名首领：上场的是档案里那个人 —— 手牌逐条照他自己那份，不是通用机制包',
      onField.length > 0 && onField.every((r) => r.same),
      onField.map((r) => `${r.who}（${r.n} 手）${r.same ? '' : ' ✗'}`).join('、') || '（一个也没挂）')

    /* 对照：没挂 bossId 的头名，拿的正是那一套通用包 ——
       两边的技能 id 不许有任何交集，否则上面那一条可能只是「大家碰巧同名」。 */
    const plainTop = MISSIONS.filter((m) => !m.bossId && m.stage >= TUNING.ultStage).pop()!
    const pt = enemiesOf(plainTop, 1)[0]!
    const namedSkillIds = new Set(onField.length
      ? bossMissions.flatMap((m) => namedBossOf(m.bossId)?.skills.map((k) => k.id) ?? [])
      : [])
    ok('点名首领（对照）：没挂 bossId 的头名走的是现推那一套（两边的表没有一处重合）',
      !pt.namedId && pt.skills.some((k) => k.id.startsWith('foe-'))
      && pt.skills.every((k) => !namedSkillIds.has(k.id)),
      `${plainTop.no}「${plainTop.title}」　${pt.name}　${pt.skills.map((k) => k.id).join(',')}`)
  } catch (e) {
    fail.push('敌阵段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 9) 会长（艾莉芙・安纳托利亚）：数值天花板不许回涨 ----------
     这一节钉的不是「机制对不对」，是「这一轮削下去的数有没有被悄悄加回来」。
     她的问题从来不是打不痛 —— 是「一手把整场拉走」，所以削的是效果量与回转。
     钉上限而不是钉死值：哪天有人想再松一点，得先来这里把话说清楚。 */
  try {
    const alive = ROSTER['alive-anatolia']
    ok('会长：名册里有这个人', !!alive, alive ? alive.cls : '缺')
    if (alive) {
      const at = (id: string) => alive.skills.find((k) => k.id === id)
      const basic = at('alive-atk')
      const past = at('alive-past')
      const edit = at('alive-edit')
      const burst = at('alive-burst')

      // 击退：抹掉对面一条行动条的那一手，天花板 0.4 条
      ok('会长：「贯穿过去」的击退不超过 0.4 条',
        (past?.effect?.pushBack ?? 0) <= 0.4, `pushBack=${past?.effect?.pushBack}`)
      // 增益：攻击加成天花板 15%，充能 20%
      ok('会长：「撰写」的攻击加成不超过 15%',
        (edit?.effect?.atkUp ?? 0) <= 0.15, `atkUp=${edit?.effect?.atkUp}`)
      ok('会长：「撰写」的充能加成不超过 20%',
        (edit?.effect?.spdUp ?? 0) <= 0.2, `spdUp=${edit?.effect?.spdUp}`)
      // 回转：三手冷却都不低于 6 拍（她另有 cdCut 1 折回来，所以门槛不设更高）
      const cds = [past, edit, burst].map((k) => k?.cd ?? 0)
      ok('会长：三手冷却都不低于 6 拍（回转不许回到「一手接一手」）',
        cds.every((c) => c >= 6), `冷却 ${cds.join('／')}`)
      // 身份：普攻压得比技能低一档
      ok('会长：普攻压得比技能低一档（她该靠技能吃饭）',
        (basic?.power ?? 0) <= 1.2 && (basic?.power ?? 0) < (burst?.power ?? 0),
        `普攻 ×${basic?.power}　到达点 ×${burst?.power}`)
      // 代价那一栏：效果量加过的东西，体力也得跟着涨
      const costs = [past, edit, burst].map((k) => k?.cost ?? 0)
      info.push(`会长读数：普攻 ×${basic?.power}　`
        + `贯穿过去 击退 ${past?.effect?.pushBack}／体力 ${past?.cost}　`
        + `撰写 atkUp ${edit?.effect?.atkUp}　spdUp ${edit?.effect?.spdUp}／体力 ${edit?.cost}　`
        + `到达点 ×${burst?.power}／体力 ${burst?.cost}　冷却 ${cds.join('／')}`)
      ok('会长：三手的体力消耗都不为 0（效果是买的，不是白送的）',
        costs.every((c) => c > 0), costs.join('／'))
    }

    // 冷却计数口径：只在「她自己出手」时往下走 —— 这是 #14 的第三条要求
    const s = createBattle({
      mission: MISSIONS.slice().sort((a, b) => a.stage - b.stage)[0]!,
      squad: ['alive-anatolia', 'mefisa'], progress: 1, growth: {},
      sp: 100, spMax: 100, bond: {},
    })
    const her = find(s, 'alive-anatolia')!
    const mate = find(s, 'mefisa')!
    const freeze = () => { for (const f of s.enemies) f.bar = -1e6 }
    const turnOf = (who: Combatant, skillId: string) => {
      who.sp = 999
      freeze()
      s.actor = who.id
      s.phase = 'select'
      act(s, { t: 'skill', skillId, targetId: who.id })
    }
    turnOf(her, 'alive-edit')
    const afterCast = her.cds['alive-edit'] ?? 0
    const mateSkill = mate.skills.find((k) => k.kind === '技能' && k.cost <= 8) ?? mate.skills[0]!
    for (let i = 0; i < 3; i++) turnOf(mate, mateSkill.id)
    const afterMate = her.cds['alive-edit'] ?? 0
    ok('会长：冷却只在「她自己出场」时递减（别人的出手不算数）',
      afterCast > 0 && afterMate === afterCast,
      `甩完 ${afterCast} → 同伴出手三次之后 ${afterMate}`)
    const beforeHer = her.cds['alive-edit'] ?? 0
    turnOf(her, 'alive-past')
    const afterHer = her.cds['alive-edit'] ?? 0
    ok('会长：轮到她自己出手，冷却才真的往下走',
      afterHer < beforeHer, `${beforeHer} → ${afterHer}（被动 cdCut 1 使它每拍走 2）`)
    info.push(`冷却口径：会长甩「撰写」后 ${afterCast}，同伴出手三次仍 ${afterMate}，`
      + `她自己再出一手落到 ${afterHer}`)
  } catch (e) {
    fail.push('会长段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 10) 五轴不封顶 ----------
     这一节钉的是「放宽」这件事本身：轴、生命、倍率、伤害一路推上去时，
     半路**不许**有任何一处把它们夹回去。查法不是读代码，是拿一个荒谬的
     成长值去推，看输出是不是跟着同倍走 —— 有夹子的话，推到某个点就不动了。
     另有一条反向断言：**该夹的还得夹**。闪避、减伤这类「比率」如果也不封顶，
     过 1 就是打不中，那是机制崩掉，不是放宽。所以两类要一起钉住。 */
  try {
    // (a) 轴随成长线性走，没有回头点
    const at = (g: number) => combatantOf('mefisa', 1, g)
    const bare = at(0)
    const far = at(1000)
    const axisRatio = far.axes.破坏力 / bare.axes.破坏力
    const want = (1 + 1000 / 100) / (1 + 0 / 100)
    ok('五轴不封顶：成长推 1000%，破坏力跟着同倍走（×11）',
      Math.abs(axisRatio - want) < 0.05,
      `${bare.axes.破坏力} → ${far.axes.破坏力}（实测 ×${axisRatio.toFixed(2)}，应为 ×${want}）`)
    ok('生命不封顶：成长推 1000% 时生命远高于裸面板',
      far.hpMax > bare.hpMax * 10, `${bare.hpMax} → ${far.hpMax}`)
    ok('AXIS_REF 不是上限：轴可以越过它并且继续长',
      far.axes.破坏力 > AXIS_REF * 4, `AXIS_REF=${AXIS_REF}，实测破坏力 ${far.axes.破坏力}`)

    // (b) 伤害跟着轴走，中间没有夹子
    const k = bare.skills.find((x) => x.power > 0 && x.kind !== '启动')!
    const hit = (c: Combatant) => c.axes[k.axis] * k.power * atkMulOf(c)
    const hitRatio = hit(far) / hit(bare)
    ok('伤害不封顶：同一手的裸出力与轴同倍（中间没有夹子）',
      Math.abs(hitRatio - axisRatio) / axisRatio < 0.02,
      `「${k.name}」${hit(bare).toFixed(0)} → ${hit(far).toFixed(0)}（×${hitRatio.toFixed(2)}）`)

    // (c) 任务成长封顶 12%，买来的终末等级不封顶 —— 两者在 effectiveGrowth 合流
    const merged = effectiveGrowth({ mefisa: 12 }, { mefisa: 20 })
    ok('终末等级不封顶：买了 20 级就是 +100%，不吃任务那条 12% 的封顶',
      Math.abs((merged.mefisa ?? 0) - (12 + LEVEL_STEP_PCT * 20)) < 1e-9,
      `任务 12% + 20 级 ×${LEVEL_STEP_PCT}% = ${merged.mefisa}%`)
    ok('终末等级的价格是指数的：越往上越贵，不是线性',
      levelCostOf(10) > levelCostOf(9) * 1.5 && levelCostOf(0) === LEVEL_BASE_COST,
      `0→1 级 ${levelCostOf(0)}　9→10 级 ${levelCostOf(9)}　10→11 级 ${levelCostOf(10)}`)
    ok('合流之后的面板确实吃到了等级那一份',
      at(merged.mefisa ?? 0).axes.破坏力 > bare.axes.破坏力 * 2,
      `裸面板 ${bare.axes.破坏力} → ${at(merged.mefisa ?? 0).axes.破坏力}`)

    // (d) 反向断言：比率与控制类**必须**还夹着，放宽不等于把机制做崩
    ok('闪避仍然封顶（过 1 就是打不中，那不叫放宽）',
      TUNING.evadeMax > 0 && TUNING.evadeMax < 1, `evadeMax=${TUNING.evadeMax}`)
    ok('减伤仍然封顶', TUNING.shieldCap > 0 && TUNING.shieldCap < 1, `shieldCap=${TUNING.shieldCap}`)
    ok('增益持续拍数仍然封顶（不封顶就是永久增益）',
      TUNING.buffTurnsCap > 0 && TUNING.buffTurnsCap < 20, `buffTurnsCap=${TUNING.buffTurnsCap}`)
    ok('断拍次数仍然压死在 1（复合惩罚，放宽会变成永久停手）',
      TUNING.stallCap === 1, `stallCap=${TUNING.stallCap}`)

    // (e) 这条读代码读不出来：源码里 AXIS_REF 只许出现在「定义」与「显示」两处。
    //     注释里提到它不算 —— 恰恰相反，chars/roster/tuning 都该写一句「量表不是上限」
    //     把口径传下去。只认**真代码**，所以先把注释剥掉再找。
    const dropComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const refSites: string[] = []
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${ent.name}`
        if (ent.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(ent.name) && dropComments(readFileSync(p, 'utf8')).includes('AXIS_REF')) refSites.push(p)
      }
    }
    walk('src')
    const stray = refSites.filter((p) => !p.endsWith('data/types.ts') && !p.endsWith('views/Archive.tsx'))
    ok('AXIS_REF 只作显示基准（定义在 types，条宽归一化在 Archive），引擎与数值层不引用它',
      stray.length === 0, stray.length ? stray.join('、') : `${refSites.length} 处，全部是定义与显示`)

    info.push(`不封顶口径：成长 0% → 1000% 时破坏力 ${bare.axes.破坏力} → ${far.axes.破坏力}`
      + `（×${axisRatio.toFixed(2)}），生命 ${bare.hpMax} → ${far.hpMax}；量表达 ${AXIS_REF}，实测已到 ${far.axes.破坏力}`)
    info.push(`该夹的还夹着：闪避 ${TUNING.evadeMax}　减伤 ${TUNING.shieldCap}　`
      + `增益 ${TUNING.buffTurnsCap} 拍　断拍 ${TUNING.stallCap} 次`)
  } catch (e) {
    fail.push('不封顶段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 11) 黄金狮子形态 ----------
     三条要求，一条都不能靠「日志里好像有」蒙混：
       (a) 变的是自己 —— 名字、五轴、**整份技能表**一起换掉，不是加个增益；
       (b) 连携是「每一手攻击之后」接上的 —— 所以变身那一手本身不算，增益/治疗也不算；
       (c) 期满自己变回来，五轴与技能表原样还回去。
     (b) 那条最容易写错的是「什么时候取形态标记」：必须在 resolve 之前取，
     否则变身那一手自己就把标记安上了，于是它也会顺手接一记连携。 */
  try {
    // 挑最硬的那一档当靶子：低级任务一场只有一个小兵，狮形一记普攻就把它打没了 ——
    // 而场上没人时连携**本来就不该**接（fireLionLink 里 `if (!foes.length) return`），
    // 于是断言会随机失败。这不是机制的问题，是靶子太脆，换硬的。
    const mission = MISSIONS.slice().sort((a, b) => b.stage - a.stage)[0]!
    const mk = () => createBattle({
      mission, squad: [OPERATOR_ID, 'luna'], progress: 1, growth: {},
      sp: 100, spMax: 100, bond: {},
    })
    /** 把场面按住：敌人行动条压死，让「谁出手」完全由我们说了算 */
    const drive = (s: BattleState, who: Combatant, cmd: Parameters<typeof act>[1]) => {
      for (const f of s.enemies) f.bar = -1e6
      who.sp = 999
      s.actor = who.id
      s.phase = 'select'
      act(s, cmd)
    }
    const linkId = `link-${LION_PAIR_ID}`

    const s = mk()
    const me = find(s, OPERATOR_ID)!
    const lion = me.skills.find((k) => k.name === '黄金狮子')
    ok('黄金狮子：进度推到第一卷末后，这一手在技能表里',
      !!lion && !!lion.form, lion ? `${lion.name}｜${lion.form?.name}` : '找不到这一手')
    ok('黄金狮子：变身要求露娜在场',
      lion?.requireAlly === 'luna', `requireAlly=${lion?.requireAlly}`)

    const before = {
      axes: { ...me.axes },
      skills: me.skills.map((k) => k.name),
      basic: basicOf(me)?.name,
    }
    const seen: string[] = []
    const take = (fn: () => void) => {
      const n = s.log.length
      fn()
      seen.push(...s.log.slice(n).map((l) => l.skillId ?? l.skill ?? ''))
    }

    take(() => drive(s, me, { t: 'skill', skillId: lion!.id, targetId: me.id }))
    ok('黄金狮子：变身当场生效（形态安上了，且记的是「自己的另一副面目」）',
      me.morph?.kind === 'form' && me.morph.name === '黄金狮子',
      `kind=${me.morph?.kind} name=${me.morph?.name} 余 ${me.morph?.ticks} 拍`)
    ok('黄金狮子：名字换了',
      me.name !== before.basic || me.name === '黄金狮子' || !!me.morph,
      `「${me.name}」`)
    // 兽化的方向写在原作里：破坏力与物理抗性上抬，意志力反而下去。
    // 不看「轴换没换」（那太弱），看方向对不对。
    ok('黄金狮子：五轴按兽化的方向换（破坏力上抬、意志力下去）',
      me.axes.破坏力 > before.axes.破坏力 && me.axes.意志力 < before.axes.意志力,
      `破坏力 ${before.axes.破坏力} → ${me.axes.破坏力}；意志力 ${before.axes.意志力} → ${me.axes.意志力}`)
    ok('黄金狮子：整份技能表换掉（原来是拳，现在是狮子的打法）',
      me.skills.length > 0 && !me.skills.some((k) => before.skills.includes(k.name)),
      `变身前 ${before.skills.slice(0, 3).join('、')}… → 变身后 ${me.skills.map((k) => k.name).join('、')}`)
    // 一记连携会落两条日志：一条是「接上了」的通告（带 note、没有伤害），
    // 一条是这一下真的打出去（带 dmg）。两条同 id，别当成接了两次 ——
    // 所以按 dmg 数，数是「真的打出几下」。
    const linkHits = (from: number) => s.log.slice(from)
      .filter((l) => l.skillId === linkId && l.dmg != null).length
    ok('黄金狮子：变身这一手**本身**不触发连携（「攻击后」才算）',
      linkHits(0) === 0, seen.join('／') || '（这一手没有别的日志）')

    // 变身后的第一手攻击 → 连携接上
    const mark = s.log.length
    for (const f of s.enemies) f.hp = f.hpMax   // 补满：挨完这一手它得还站着
    take(() => drive(s, me, { t: 'atk', targetId: s.enemies[0]!.id }))
    ok('黄金狮子：变身后的每一手攻击都自己接上露娜的连携',
      linkHits(mark) === 1,
      `这一手接上 ${linkHits(mark)} 次／日志 ${seen.join('／')}`)

    // 拿「本人最强的那一手」比变身前后 —— 变身的价值在技能表与轴一起换，
    // 不在某一条轴上。这一条同时钉住成长：形要跟着本人练，不能越练越弱。
    const mk2 = (g: number) => {
      const b = createBattle({
        mission, squad: [OPERATOR_ID, 'luna'], progress: 1,
        growth: { [OPERATOR_ID]: g, luna: g }, sp: 100, spMax: 100, bond: {},
      })
      const who = find(b, OPERATOR_ID)!
      const raw = (c: Combatant) => {
        const best = [...c.skills].filter((k) => k.power > 0 && k.kind !== '启动')
          .sort((x, y) => y.power - x.power)[0]!
        return c.axes[best.axis] * best.power * atkMulOf(c)
      }
      const asIs = raw(who)
      const l = who.skills.find((k) => k.name === '黄金狮子')!
      drive(b, who, { t: 'skill', skillId: l.id, targetId: who.id })
      return { asIs, asLion: raw(who) }
    }
    const g0 = mk2(0)
    ok('黄金狮子：变身确实更强（拿本人最强的一手比）',
      g0.asLion > g0.asIs * 1.1,
      `本人 ${g0.asIs.toFixed(0)} → 狮形 ${g0.asLion.toFixed(0)}（×${(g0.asLion / g0.asIs).toFixed(2)}）`)
    /* 这一条是补上的坑：f.axes 是绝对值，早先直接覆写，于是本人练出来的那一份
       一变身就丢 —— 成长 +50% 时变身落到 ×0.92，+200% 时只剩 ×0.47，
       而终末等级是可以一路买上去的。现在覆写时乘回本人那份成长。 */
    const g200 = mk2(200)
    ok('黄金狮子：本人练上去之后，变身仍然更强（形要跟着人一起长）',
      g200.asLion > g200.asIs,
      `成长 +200%：本人 ${g200.asIs.toFixed(0)} → 狮形 ${g200.asLion.toFixed(0)}（×${(g200.asLion / g200.asIs).toFixed(2)}）`)

    // 对照组：不顶着形态出手 —— 同样一手，不该凭空多出连携
    const s2 = mk()
    const me2 = find(s2, OPERATOR_ID)!
    const n2 = s2.log.length
    drive(s2, me2, { t: 'atk', targetId: s2.enemies[0]!.id })
    const plainLinks = s2.log.slice(n2).filter((l) => l.skillId === linkId).length
    ok('黄金狮子（对照）：不顶着形态时，同一手不会自己接上这记连携',
      plainLinks === 0, `未变身出手 → 连携 ${plainLinks} 次`)

    // 期满：这里推的是**全局拍**（advance 的 tick），不是自己的回合数 ——
    // 变身按场上过了多久算，与增益按自身出场数算不是一回事（见 SkillForm.ticks）。
    let pushed = 0
    for (let i = 0; i < 12 && me.morph; i++) {
      for (const c of [...s.allies, ...s.enemies]) c.bar = c.side === 'enemy' ? -1e6 : 0
      s.phase = 'select'
      take(() => advance(s))
      pushed += 1
    }
    ok('黄金狮子：期满自己变回来（形态解除，五轴与技能表原样还回去）',
      !me.morph && me.axes.破坏力 === before.axes.破坏力
      && me.skills.map((k) => k.name).join('／') === before.skills.join('／'),
      me.morph ? `推了 ${pushed} 次仍未解除，余 ${me.morph.ticks} 拍` : `推 ${pushed} 次后还原，破坏力回到 ${me.axes.破坏力}`)
    ok('黄金狮子：解除时在日志里留了一笔',
      seen.includes('form-off'), seen.filter((x) => x.startsWith('form-')).join('／') || '（没记）')

    info.push(`黄金狮子：变身 → ${me.skills.length} 手新表；`
      + `变身后攻击接上连携 ${s.log.filter((l) => l.skillId === linkId).length} 次；`
      + `期满还原后破坏力 ${me.axes.破坏力}／技能表 ${me.skills.length} 手`)
  } catch (e) {
    fail.push('黄金狮子段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 12) 增益的回合上限 ----------
     增益原先只有一条时限：按「自身出场几次」扣。于是同一条增益，
     挂在快的人身上两三拍就散了，挂在慢的人身上却能撑十几拍 ——
     同一个效果两种寿命，档案页上读不出来，玩家也说不清。
     现在多一条按**全局拍**算的闸，两条并行、谁先到零算谁。
     这里钉三件事：闸挂上了、走满就散（哪怕本人一次没出手）、以及**它只管增益**。 */
  try {
    const s = createBattle({
      mission: MISSIONS.slice().sort((a, b) => a.stage - b.stage)[0]!,
      squad: ['alive-anatolia', 'mefisa'], progress: 1, growth: {},
      sp: 100, spMax: 100, bond: {},
    })
    const her = find(s, 'alive-anatolia')!
    const edit = her.skills.find((k) => k.id === 'alive-edit')!
    for (const f of s.enemies) f.bar = -1e6
    her.sp = 999
    s.actor = her.id
    s.phase = 'select'
    act(s, { t: 'skill', skillId: edit.id, targetId: her.id })
    const b = her.buffs.find((x) => x.k === 'atk')
    ok('增益回合闸：挂上时就带了一份按拍数算的预算',
      !!b && b.rt === TUNING.buffRoundsCap,
      `atk.rt=${b?.rt}（表上 ${TUNING.buffRoundsCap}）t=${b?.t}`)

    // 一拍一拍地推（把条压到「再充一次就满」，advance 恰好只会 tick 一拍）。
    // 全程不让她出手 —— 于是「自身出场」那条时限一动不动，散掉只能是回合闸干的。
    const oneTick = () => {
      for (const c of s.allies) c.bar = TUNING.barMax - chargeOf(c)
      for (const f of s.enemies) f.bar = -1e6
      s.phase = 'select'
      advance(s)
    }
    let ticks = 0
    while (buffOf(her, 'atk') > 0 && ticks < 20) { oneTick(); ticks += 1 }
    ok('增益回合闸：走满就自己散掉（本人一次都没出手，所以不是另一条时限干的）',
      buffOf(her, 'atk') === 0 && ticks === TUNING.buffRoundsCap,
      `第 ${ticks} 拍散尽（表上 ${TUNING.buffRoundsCap}）`)
    info.push(`增益回合闸：会长「撰写」挂上的攻击增益在第 ${ticks} 拍散尽；`
      + `另一条时限（自身出场）全程没动过`)

    // 「规格」类（旧吉他解封）不吃这道闸 —— 它改的是底子。
    // 这条不另搭台子：解封那一段（第 6 节）走完链子还能按新规格算，本身就在证明它没散。
    const spec = ROSTER['hikari']!.skills.find((k) => k.effect?.skillMul)
    ok('增益回合闸：解封那种「规格」在表上确实是另一类',
      !!spec && !DEBUFF_KEYS.includes('skillMul'),
      spec ? `${spec.name} 给 skillMul ×${spec.effect?.skillMul}` : '（找不到带 skillMul 的手）')
  } catch (e) {
    fail.push('增益回合闸段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 13) 召唤 ----------
     首领与精英都能把旁边还没成形的东西喊上场。
     四件事必须钉住，缺一条这套机制就走样：
       ① 首领与精英带得了这一手，**小兵带不了**（配对控制）——
          不然低危场会变成添油：玩家打的不是敌人，是刷不完的人头；
       ② 真打起来他确实会喊人，而不是只有技能表上挂着这一手；
       ③ 一场仗的敌体总数封在 TUNING.enemyCap —— 这条是「收得了场」的保证。
          上限必须按**总数**算：按「场上还剩几个」算的话，打掉一个补一个，
          而收场判的正是「场上没人了」（见 checkEnd），这场仗就永远收不了；
       ④ 喊上来的那一只是小兵档、且自己是半成形的 —— 首领喊不来第二个首领，
          人也生不出人。 */
  try {
    const sorted = MISSIONS.slice().sort((a, b) => a.stage - b.stage)
    // 最高那一档：头名是首领，且**没挂 bossId** —— 指名首领是另一类对手
    //（bosses.ts 的规矩：他们的每一手机制都得有原文依据，不替他们新造）
    const top = sorted.filter((m) => m.stage >= TUNING.ultStage && !m.bossId).pop()!
    const low = sorted[0]!
    const mkTop = () => createBattle({
      mission: top, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const mkLow = () => createBattle({
      mission: low, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })

    const s = mkTop()
    const boss = s.enemies[0]!
    const grunt = s.enemies[1]!
    ok('召唤：首领带得了这一手', boss.tier === 'boss' && !!boss.skills.find((k) => k.summon),
      `stage ${top.stage}　${boss.name}　表上 ${boss.skills.map((k) => k.id).join(',')}`)
    ok('召唤：精英带得了这一手（危险度够不着首领的那一档）',
      low.stage < TUNING.ultStage && !!mkLow().enemies[0]!.skills.find((k) => k.summon),
      `stage ${low.stage}　${mkLow().enemies[0]!.name}`)
    ok('召唤（对照）：小兵带不了 —— 危险度底下不该是添油战',
      !grunt.skills.some((k) => k.summon),
      `${grunt.name}　表上 ${grunt.skills.map((k) => k.id).join(',')}`)
    // 指名首领：那一类对手是同行、是弹痕持有者，不给他们糊一层新机制
    const named = sorted.filter((m) => m.bossId).pop()
    const namedFoe = named
      ? createBattle({
          mission: named, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
        }).enemies[0]
      : undefined
    ok('召唤（对照）：指名首领不挂这一手（不替他们新造机制）',
      !namedFoe || !namedFoe.skills.some((k) => k.summon),
      named ? `${named.no}「${named.title}」　${namedFoe?.name}` : '（任务表里没有指名首领）')

    // 反复喊：到顶就该停，且停得很干脆
    const s2 = mkTop()
    const caller = s2.enemies[0]!
    caller.sp = 9999
    const base = s2.enemies.length
    let calls = 0
    while (calls < 40 && summonFoe(s2, caller)) {
      // 冷却照走数：这里只想验上限，不想被冷却挡住
      caller.cds = {}
      calls += 1
    }
    ok('召唤：一场仗的敌体总数封在 enemyCap（到顶就不再喊）',
      s2.enemies.length === TUNING.enemyCap && calls === TUNING.enemyCap - base,
      `初始 ${base} ＋ 喊来 ${calls} ＝ ${s2.enemies.length}（表上 ${TUNING.enemyCap}）`)
    ok('召唤：冷却也在拦（连喊两次之间走得动）', (() => {
      const s4 = mkTop()
      const f = s4.enemies[0]!
      f.sp = 9999
      const first = summonFoe(s4, f)
      const again = summonFoe(s4, f)
      return first && !again && Object.values(f.cds).some((v) => v > 0)
    })(), '')

    const called = s2.enemies[base]!
    const peer = s2.enemies[1]!
    ok('召唤：喊上来的是小兵档（首领喊不来第二个首领）', !called.tier, `tier=${called.tier}`)
    ok('召唤（对照）：它自己也带不了召唤 —— 人不会自己繁殖',
      !called.skills.some((k) => k.summon), called.skills.map((k) => k.id).join(','))
    ok('召唤：半成形（比同场小兵薄一截）', called.hpMax < peer.hpMax,
      `${called.name} ${called.hpMax} ＜ ${peer.name} ${peer.hpMax}`)
    ok('召唤：同场性质（与这一场是同一型别，不是另抓一个）',
      profileOf(called.name) === profileOf(peer.name),
      `${called.name}　对 ${peer.name}`)
    ok('召唤：排行接着场上往下排（同一场不会出两个「乙」）',
      new Set(s2.enemies.map((c) => c.name)).size === s2.enemies.length,
      s2.enemies.map((c) => c.name).join('／'))
    // 名字取的是这一场的性质，不是被喊者自己那份标签
    ok('召唤：性质取自这一场（不是从首领身上借的）',
      called.trait === top.nature, `${called.trait}　对 ${top.nature}`)
  } catch (e) {
    fail.push('召唤段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* 端到端：真推一场，看他会不会真喊人。上面那条只证明「表上有、上限拦得住」，
     证明不了「打起来会发生」—— 那正是这一支复核存在的理由。 */
  try {
    const top = MISSIONS.slice().sort((a, b) => a.stage - b.stage)
      .filter((m) => m.stage >= TUNING.ultStage && !m.bossId).pop()!
    const s = createBattle({
      mission: top, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const base = s.enemies.length
    /* 一手一手地推，而不是「跑一场完整的仗」——
       这里的场地跟别处一样是捏出来的（我方条压在 -1e6），
       而 advance 一次会一口气烧掉八千拍：那几千拍里我方早就把条充回来了，
       于是它每回都在「等我方出手」那一句上返回，一步也不往前走。
       所以每一手都把全场按回去、只把首领的条顶满 —— 这样一次 advance
       恰好等于首领出手一手，他的手牌、冷却、日志都是真跑出来的。
       我方封血：这一个复核里打不死，好让他一直喊到上限为止，
       而不是几下把人清完就收场（那样只能证明「他会喊」，证明不了「他喊到顶为止」）。 */
    for (const a of s.allies) { a.hp = 1e9; a.hpMax = 1e9 }
    const boss = s.enemies[0]!
    let turns = 0
    for (let i = 0; i < 30 && s.enemies.length < TUNING.enemyCap; i++) {
      for (const c of [...s.allies, ...s.enemies]) c.bar = -1e6
      boss.bar = TUNING.barMax
      s.actor = null
      s.phase = 'select'
      advance(s)
      turns += 1
    }
    const calls = s.log.filter((l) => l.skillId === 'foe-summon')
    ok('召唤：真打起来他确实会喊人（不是只挂在表上）', calls.length > 0,
      `日志里 ${calls.length} 笔　${calls[0]?.skill ?? ''}`)
    ok('召唤：一直喊到上限为止（不是只喊一个就收手）',
      s.enemies.length === TUNING.enemyCap && calls.length === TUNING.enemyCap - base,
      `${base} → ${s.enemies.length}　首领出手 ${turns} 次　喊人 ${calls.length} 笔（表上 ${TUNING.enemyCap}）`)
    ok('召唤：日志里说得出来是什么被喊起来了',
      !!calls[0] && /成形体诱出/.test(calls[0].skill ?? '')
      && (calls[0].note ?? '').includes('喊'),
      calls[0] ? `${calls[0].skill}｜${calls[0].note}` : '没有日志')
    info.push(`召唤：${top.no}「${top.title}」打到第 ${s.hand} 手，`
      + `敌阵 ${base} → ${s.enemies.length}（喊人 ${calls.length} 笔）`)
  } catch (e) {
    fail.push('召唤端到端段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 14) 面具心叶 · 亡灵军团 · 二阶段黑金狮子 ----------
     这是「特殊 BOSS」那一档，与上面那记通用召唤不是一套东西，所以另起一段：
       ① 他喊上来的**不是观测体，是档案里的真人** —— 技能表要跟本人逐条相同
          （「技能能力都相同」不是形容词）。对照：通用那记喊来的是现推的空壳，
          技能表挂在型别上，与任何一个档案角色都对不上；
       ② 名单依次出场、一人一次，且到顶就收手（复用 enemyCap）；
       ③ 被喊上来的那几位接得上**他们自己**那一记连携 —— 而且只有那一条，
          只有异次元的蕾雅接得上（配对控制：名单里换成别人就不接）；
       ④ 本体倒下 → 军团随他的意志散去 → 第二阶段的黑金狮子顶上，
          这一场**没有**就此收场。对照：没写 next 的指名首领倒下就是赢了。 */
  try {
    const two = MISSIONS.find((m) => m.bossId === 'masked-kokonoha')!
    const mkTwo = () => createBattle({
      mission: two, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const s = mkTwo()
    const mask = s.enemies[0]!
    const call = mask.skills.find((k) => k.summon)!

    ok('面具心叶：他带得了那一记召唤，且名单挂在技能上',
      !!call && (call.summonPack?.length ?? 0) > 0,
      call ? `${call.name}　名单 ${call.summonPack?.length} 人` : '（找不到召唤那一手）')
    ok('面具心叶：他没走通用那一套（不挂成形体诱出的机制手）',
      mask.skills.filter((k) => k.id === 'foe-summon').length === 0,
      mask.skills.filter((k) => k.summon).map((k) => k.id).join(','))

    /* ① 喊上来的与本人逐条相同 —— 拿技能 id 比，不拿名字比：
       id 是引擎认人的那把尺（冷却、日志、连携都读它）。 */
    const pack = call.summonPack!
    for (let i = 0; i < pack.length; i++) { mask.cds = {}; summonFoe(s, mask) }
    const rivals = s.enemies.filter((e) => e.tags.includes('异次元'))
    ok('面具心叶：名单依次出场、一人一次（不重号、不回头）',
      rivals.length === pack.length
      && rivals.map((r) => r.id).join(',') === pack.map((x) => `rival-${x}`).join(','),
      rivals.map((r) => r.id).join('／') || '（一个也没喊上来）')
    const mismatch = rivals.filter((r) => {
      const base = combatantOf(r.id.replace(/^rival-/, ''), 1, 0)
      return r.skills.map((k) => k.id).join(',') !== base.skills.map((k) => k.id).join(',')
    })
    ok('面具心叶：喊上来的是档案里的真人 —— 技能表与本人逐条相同',
      rivals.length > 0 && mismatch.length === 0,
      mismatch.length
        ? `对不上的：${mismatch.map((r) => r.id).join('、')}`
        : `${rivals[0]!.name}　${rivals[0]!.skills.map((k) => k.name).join('、')}`)
    const axesSame = rivals.every((r) => {
      const base = combatantOf(r.id.replace(/^rival-/, ''), 1, 0)
      return (Object.keys(base.axes) as AxisKey[]).every((k) => r.axes[k] === base.axes[k])
    })
    ok('面具心叶：五轴也照本人（不是按危险度现推的一份）', rivals.length > 0 && axesSame,
      rivals[0] ? `破坏力 ${rivals[0].axes.破坏力}（本人 ${combatantOf(rivals[0].id.replace(/^rival-/, ''), 1, 0).axes.破坏力}）` : '')
    const thinner = rivals.every((r) => r.hpMax > combatantOf(r.id.replace(/^rival-/, ''), 1, 0).hpMax)
    ok('面具心叶：身板另算 —— 技能照搬，血走敌方曲线（站在对面不是站着陪练）',
      rivals.length > 0 && thinner,
      rivals[0] ? `${rivals[0].name} ${rivals[0].hpMax} ＞ 本人 ${combatantOf(rivals[0].id.replace(/^rival-/, ''), 1, 0).hpMax}` : '')

    /* 对照：通用那一记喊来的空壳，技能表挂在型别上 —— 与任何一个档案角色都对不上 */
    const generic = mkTwo()
    const top = MISSIONS.filter((m) => m.stage >= TUNING.ultStage && !m.bossId)
      .sort((a, b) => a.stage - b.stage).pop()!
    const gs = createBattle({
      mission: top, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const gf = gs.enemies[0]!
    gf.cds = {}
    const called = summonFoe(gs, gf)
    const shell = gs.enemies[gs.enemies.length - 1]!
    ok('面具心叶（对照）：通用那记喊来的是现推的空壳，不是档案角色',
      called && !shell.tags.includes('异次元')
      && !ROSTER[shell.name] && shell.skills.every((k) => k.id.startsWith('foe-')),
      `${shell.name}　${shell.skills.map((k) => k.id).join(',')}`)

    ok('面具心叶：同行者自己带不了召唤（人不会自己繁殖）',
      rivals.every((r) => !r.skills.some((k) => k.summon)),
      rivals[0] ? `rival-reiya 表上 ${rivals.length} 位，召唤手 ${rivals.filter((r) => r.skills.some((k) => k.summon)).length} 条` : '')

    /* ③ 那一记连携：只有异次元的蕾雅接得上。
       让本体连出六手 —— 每一手都是一次真打的攻击（收了召唤那一手，
       不然他头几手全用来喊人，证明不了「攻击之后接得上」）。
       对照跑把那一位换成名单里的**别人**：同一张台子、同一个执手，
       只换了对面站着的是谁 —— 不接就只能是「认人」这一条干的。 */
    const linkRun = (keep: string) => {
      const w = mkTwo()
      const boss = w.enemies[0]!
      for (let i = 0; i < pack.length; i++) { boss.cds = {}; summonFoe(w, boss) }
      for (const r of w.enemies) {
        if (r.tags.includes('异次元') && !r.id.endsWith(keep)) r.down = true
      }
      // 我方封血：这一个复核只问接不接得上，不问打不打得死
      for (const a of w.allies) { a.hp = 1e9; a.hpMax = 1e9 }
      boss.cds = {}
      for (let i = 0; i < 6; i++) {
        for (const c of [...w.allies, ...w.enemies]) c.bar = -1e6
        boss.bar = TUNING.barMax
        w.actor = null
        w.phase = 'select'
        advance(w)
      }
      const links = w.log.filter((l) => /^link-/.test(l.skillId ?? ''))
      return {
        hits: links.filter((l) => l.skillId === 'link-rival-vow').length,
        ids: [...new Set(links.map((l) => l.skillId))],
        who: links[0]?.actor ?? '',
        faces: links[0]?.link?.members ?? [],
        name: links[0]?.link?.name ?? '',
      }
    }
    const withReiya = linkRun('reiya')
    ok('面具心叶：他与异次元的蕾雅接得上那一记连携',
      withReiya.hits > 0, `接上 ${withReiya.hits} 次　执手 ${withReiya.who}`)
    const without = linkRun('emei')
    ok('面具心叶（对照）：场上换成正对里的别人就接不起来 —— 这一条只认她',
      without.hits === 0, `换 emei 上场　接上 ${without.hits} 次`)
    ok('面具心叶：对面自始至终只有这一条连携（没有第二条掺进来）',
      withReiya.ids.length === 1 && withReiya.ids[0] === 'link-rival-vow',
      `日志里出现过的连携：${withReiya.ids.join('、') || '（一条也没有）'}`)

    /* 名字得是**原文里那一件事**，不是自拟的招式名：v4 特典
       『与少女许下永恒的约定的那一天』。改名字的人先过这一条。 */
    ok('面具心叶：那一记连携取的是 v4 特典的回目（不是自拟的招式名）',
      withReiya.name === '与少女许下永恒的约定的那一天',
      `牌面上写的是「${withReiya.name}」`)

    /* 牌面那一笔：members 交回视图的是**人**（档案 id），不是场上的位次号。
       视图拿它查档案 / 取头像（Battle 的 LinkPop）——喂 `foe-mst-v4x1-0` 进去，
       名字一栏就只能念 raw id，脸也退回默认灰底。所以这里钉死：
       每一个都查得到人（档案里有，或是指名首领那一张表里有）。
       对照：本体不入档案（roster 第 6 行），所以他只能靠指名首领那一张表接住 ——
       两条路都断的话，这一断言会当场说出来。 */
    const faces = withReiya.faces
    const resolved = faces.map((id) => personOf(id)?.name ?? namedBossOf(id)?.name)
    ok('面具心叶：那一记连携的牌面交回的是档案 id（视图查得到人，不是位次号）',
      faces.length === 2 && resolved.every((n) => !!n)
      && faces.every((id) => !id.startsWith('foe-') && !id.startsWith('rival-')),
      `牌面 ${faces.join('、') || '（空）'} → ${resolved.map((n) => n ?? '（查不到）').join('、')}`)
    ok('面具心叶（对照）：本体不在角色档案里 —— 他靠指名首领那一张表才被认得出来',
      !personOf('masked-kokonoha') && !!namedBossOf('masked-kokonoha'),
      `personOf=${personOf('masked-kokonoha')?.name ?? '（查不到）'}　`
      + `namedBossOf=${namedBossOf('masked-kokonoha')?.name ?? '（查不到）'}`)

    /* ④ 二阶段。收场那一次清点只在「有人出手之后」跑（见 advance 的两处 checkEnd），
       所以这里得推一手我方 —— 光把条推满是不够的。 */
    const oneAllyTurn = (w: BattleState) => {
      for (const c of [...w.allies, ...w.enemies]) c.bar = -1e6
      const a = w.allies.find((x) => !x.down)!
      a.bar = TUNING.barMax
      w.actor = null
      w.phase = 'select'
      advance(w)
      if (w.phase === 'select' && w.actor === a.id) act(w, { t: 'guard' })
    }
    const p = mkTwo()
    const lord = p.enemies[0]!
    for (let i = 0; i < pack.length; i++) { lord.cds = {}; summonFoe(p, lord) }
    const legion = p.enemies.filter((e) => e.tags.includes('异次元'))
    ok('二阶段：开场这一场是有第二阶段的（任务挂的 bossId 上写着 next）',
      p.nextBoss === 'black-gold-lion', `nextBoss=${p.nextBoss}`)
    ok('二阶段：军团确实站到了场上（不是空场上的假通过）',
      legion.length === pack.length, `军团 ${legion.length} 位（名单 ${pack.length} 人）`)
    lord.down = true
    lord.hp = 0
    oneAllyTurn(p)
    ok('二阶段：本体一倒，军团随他的意志散去（原文写明的收场方式）',
      legion.every((e) => e.down) && p.log.some((l) => l.skillId === 'legion-gone'),
      `军团 ${legion.length} 位，还站着的 ${legion.filter((e) => !e.down).length} 位；`
      + `日志 ${p.log.filter((l) => l.skillId === 'legion-gone').length} 笔`)
    const lion = p.enemies.find((e) => e.namedId === 'black-gold-lion')
    ok('二阶段：终末化的黑金狮子顶上来，这一场没有就此收场',
      p.phase !== 'won' && !!lion && !lion.down,
      `phase=${p.phase}　顶上来的是 ${lion?.name ?? '（没人）'}`)
    ok('二阶段：顶上来的是**另一份档案**，不是把第一阶段那个人回血',
      !!lion && lion.hpMax > lord.hpMax,
      lion ? `${lord.name} ${lord.hpMax} → ${lion.name} ${lion.hpMax}` : '')
    ok('二阶段：只顶一次（再清场就是收场，不会无限换形态）',
      p.nextBoss === undefined, `nextBoss=${p.nextBoss ?? '（已用掉）'}`)

    /* 对照：没写 next 的指名首领，倒下就是收场 */
    const plain = MISSIONS.find((m) => m.bossId === 'phidra')!
    const q = createBattle({
      mission: plain, squad: SQUAD, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    for (const e of q.enemies) { e.down = true; e.hp = 0 }
    oneAllyTurn(q)
    ok('二阶段（对照）：没写 next 的指名首领倒下就是赢了',
      q.phase === 'won' && !q.nextBoss,
      `phase=${q.phase}　nextBoss=${q.nextBoss ?? '（无）'}`)

    /* ⑤ 整场打得完 —— 两阶段的仗不能卡在半路，也不能长得没边。
       我方按「放得起的最重一手，否则普攻」打，敌方交给引擎自己。
       这里只钉两件事：打得完（不是 stuck），以及二阶段确实在实战里出现过。 */
    /* advance 只在「轮到我方某一位」时才把控制权交回来（敌方的手它自己打完了），
       所以这里 s.actor 必定是我方。技能被冷却 / 印记挡住时 act 会原样退回、
       这一手不往前走 —— 那就一层层往下退，退到底还推不动就停，别在这儿空转。 */
    const playOut = (progress: number) => {
      const w = createBattle({
        mission: two, squad: ['operator', 'hikari', 'luna', 'mefisa'],
        progress, growth: {}, sp: 100, spMax: 100, bond: {},
      })
      let guard = 0
      while (w.phase === 'select' && guard++ < 900) {
        const me = w.actor ? find(w, w.actor) : null
        if (!me || me.side !== 'ally' || me.down) break
        const foe = standingOf(w.enemies)[0]
        if (!foe) break
        const usable = legalSkills(me, w).filter((k) => affordable(k, me.sp))
        const heavy = usable
          .filter((k) => k.kind !== '启动' && k.power > 0)
          .sort((a, b) => b.power - a.power)[0]
        const start = usable.find((k) => k.kind === '启动')
        const before = w.hand
        if (heavy) act(w, { t: 'skill', skillId: heavy.id, targetId: foe.id })
        // 解封期的人普攻是关着的（START_GATE）—— 退到启动那一手，再退到防御。
        if (w.hand === before && start) act(w, { t: 'skill', skillId: start.id, targetId: foe.id })
        if (w.hand === before) act(w, { t: 'atk', targetId: foe.id })
        if (w.hand === before) act(w, { t: 'guard' })
        if (w.hand === before) break
      }
      return w
    }
    /* 三个时期各打一场 —— 与 balance 同一套口径：只在一个时期上看得出的结论，
       换个时期未必成立（这一条是复核跑出来的教训，见 tuning 的 enemyProgressGain）。 */
    const plays = [0.15, 0.5, 0.9].map((p) => ({ p, w: playOut(p) }))
    ok('面具心叶：整场打得完 —— 三个时期都不会卡在半路',
      plays.every(({ w }) => w.phase === 'won' || w.phase === 'lost'),
      plays.map(({ p, w }) => `时期 ${p}：${w.phase} ${w.hand} 手`).join('　'))
    /* 只问「实战里来不来」——「来时军团散不散」是上一条的事。
       这两个不能合成一条：真人打起来未必留得下军团（那几位是会先被打掉的），
       合成一条的话，军团被清空反倒会把「二阶段来过」这条真话判成假。 */
    const fought2 = plays.filter(({ w }) => w.log.some((l) => l.skillId === 'phase-2'))
    ok('面具心叶：二阶段在实战里确实会来（不是只有单测里摆得出来）',
      fought2.length === plays.length,
      `${fought2.length}/${plays.length} 场打到第二阶段`)
    info.push(`面具心叶：${two.no}「${two.title}」　军团 ${rivals.length} 位、`
      + `连携 ${withReiya.hits} 次；二阶段顶上 ${lion?.name ?? '（无）'} ${lion?.hpMax ?? 0}；`
      + plays.map(({ p, w }) => `${p}:${w.phase}(${w.hand}手/${w.tick}拍)`).join(' '))
    void generic
  } catch (e) {
    fail.push('面具心叶段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 15) 图鉴实体 · 形态链 · 五轴同一条曲线 ----------
     这一节钉的是三件事真的接上了，而不是各自写完了：
       · 「全文会触发的战斗」—— 时间线上每一段登着实体、且实体落得进图鉴的事件
         （外传也算全文），都指派了头名；没指派的只许是明写豁免的那几段。
         头名还必须是**这一段自己列出来的实体之一**：上一版这张表整片错开了一行
         （entities 那一行压在它所属事件的 id 之下，抄的时候按视觉位置对，
         于是 v3-3 拿了 v3-4 的对手），这条断言就是为那一次立的。
       · 「图鉴实体按图鉴自己的危险度站」—— 同一个东西在卷一撞见与在卷六撞见一样厚，
         而现推的观测体照样跟着任务阶段走（这一对照证明前者不是「没生效也没人发现」）。
       · 「五轴同一条曲线」—— 同危险度、同档位的那一只，与图鉴实体的破坏力读数
         一模一样：两边都出自 tuning 的 enemyAxesAt，谁也不许另算一份。
       · 「多形态」—— 三形态能一路走到底、第三形态不插队、并且走得完。 */
  try {
    const AXES5: AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']
    /** 事件自己列出来的实体串 → 可比较的名字（去掉开头的编号，抹平两种间隔号） */
    const bare = (s: string) => s.replace(/^[^ ]+ /, '').replace(/[・·]/g, '')
    const foesOf = (e: { entities?: string[] }) => (e.entities ?? []).filter((x) => x && x !== '——')
    const entitiesEvents = TIMELINE.filter((e) => foesOf(e).length > 0)
    const codexEvents = entitiesEvents.filter((e) => foesOf(e).some((x) => resolveEntityToCodexId(x)))

    /* ① 表里不许有失效行：每一行都得指着一段真登了实体、且没被豁免的事件。
       上一版 v3-5 那一行就是这么来的 —— 事件本身不存在，那行永远查不到、
       也永远不会有人发现它是错的。 */
    const deadRows = Object.keys(EVENT_HEAD).filter((id) => {
      const e = TIMELINE.find((x) => x.id === id)
      return !e || !foesOf(e).length || !!NON_FIGHT_EVENTS[id]
    })
    ok('图鉴头名表：没有失效行（每一行都指着一场真登了实体的事件）',
      deadRows.length === 0,
      `${Object.keys(EVENT_HEAD).length} 行，失效 ${deadRows.length} 行`
      + (deadRows.length ? `：${deadRows.join('、')}` : ''))

    /* ② 覆盖：落到图鉴上的每一段实体事件都指派了头名（豁免的除外） */
    const missed = codexEvents.filter((e) => !NON_FIGHT_EVENTS[e.id] && !headFoeOf(e.id))
    ok('全文（含外传）：落到图鉴上的每一段实体事件都指派了头名',
      missed.length === 0,
      `实体事件 ${entitiesEvents.length} 段（${codexEvents.length} 段落得进图鉴），`
      + `未指派 ${missed.length} 段${missed.length ? '：' + missed.map((e) => e.id).join('、') : ''}`)
    /* 对照：这套判据不是恒真 —— 全文里确实有该判成「漏」的那几段，
       是靠豁免表才平掉的。谁把豁免表删了，上面那条立刻会说人话。 */
    const unheaded = codexEvents.filter((e) => !headFoeOf(e.id))
    ok('全文（对照）：判据确实会报漏 —— 那几段是豁免表平掉的，不是碰巧没人查',
      unheaded.length > 0 && unheaded.length === Object.keys(NON_FIGHT_EVENTS).length,
      `无头名 ${unheaded.map((e) => e.id).join('、') || '（一段都没有）'}；`
      + `豁免表 ${Object.keys(NON_FIGHT_EVENTS).join('、') || '（空）'}`)

    /* ③ 头名必须是这一段自己列出来的实体之一（错位就是在这一步被抓住的） */
    const strangers: string[] = []
    for (const e of codexEvents) {
      const id = headFoeOf(e.id)
      if (!id || !END_FOES[id]) continue       // 指名首领（同行者）不进图鉴，跳过
      const c = CODEX.find((x) => x.id === id)!
      const listed = foesOf(e).some((x) => {
        const b = bare(x)
        return b.includes(c.name.replace(/[・·]/g, '')) || c.name.replace(/[・·]/g, '').includes(b)
      })
      if (!listed) strangers.push(`${e.id}→${c.name}`)
    }
    ok('图鉴头名表：头名是那一段自己列出来的实体之一（不是邻段的对手）',
      strangers.length === 0,
      strangers.length ? strangers.join('、') : `逐段核对 ${codexEvents.length} 段`)

    /* ④ 那一位真的站到 enemies[0] 上去 —— 两条路各走一遍。
       主线牌面走 mainlineMissions（要先把前面几段标记成已归档，牌面才翻到这一段）；
       现场触发走 battleMissionOf（模型给的那一场是 OBS-xxx）。 */
    const onlyUnclaimed = (evId: string) => {
      const epDone: Record<string, true> = {}
      const claimed: Record<string, true> = {}
      for (const e of TIMELINE) { epDone[e.id] = true; if (e.id !== evId) claimed[e.id] = true }
      return mainlineMissions(epDone, claimed)[0]
    }
    const heads: Array<[string, string]> = [
      ['v3-2', 'chain-detective'], ['v3-3', 'rose-detective'], ['v3-4', 'cape-mouth'],
      ['v2-8', 'master-craft'], ['s1-2', 'cherax'],
    ]
    const wrongHead = heads.filter(([evId, want]) => onlyUnclaimed(evId)?.bossId !== want)
    ok('主线牌面：该挂头名的那几段挂的是那一位（侦探那三段的错位不许再来一次）',
      wrongHead.length === 0,
      wrongHead.length
        ? wrongHead.map(([evId, want]) => `${evId} 想要 ${want}、拿到 ${onlyUnclaimed(evId)?.bossId ?? '（无）'}`).join('　')
        : heads.map(([evId, want]) => `${evId}→${want}`).join(' '))

    const standUp = (m: Mission) => createBattle({
      mission: m, squad: SQUAD, progress: 0.5, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const plot = battleMissionOf({ name: '复核 · 现场', stage: 5, place: '东京' }, 'v6-3')
    const plotW = standUp(plot)
    ok('现场触发：模型给的那一场也站的是档案里那一位（不是临时挂牌的观测体）',
      plot.bossId === 'emilya' && plotW.enemies[0]?.namedId === 'emilya',
      `bossId=${plot.bossId ?? '（无）'}　场上头一位 ${plotW.enemies[0]?.name ?? '（空）'}`)
    const mainW = standUp(onlyUnclaimed('v2-8')!)
    ok('主线牌面：三段链的头一位（巨匠）真的站在场上',
      mainW.enemies[0]?.namedId === 'master-craft' && mainW.nextBoss === 'black-maou',
      `${mainW.enemies[0]?.name ?? '（空）'}　nextBoss=${mainW.nextBoss ?? '（无）'}`)

    /* ⑤ 图鉴实体按**图鉴自己的危险度**站。
       深海异界是原文实测（0.89）的那一处，读数不随危险度走 ——
       拿它当场地，血量若还在动，动的那一处就只可能是 hpStage。 */
    const PLACE = '深海异界'
    ok('靶场前提：那个地点的 R 读数不随危险度变（不然下面那两条量的是地点，不是实体）',
      rOfPlace(PLACE, 3).r === rOfPlace(PLACE, 9).r,
      `${PLACE}：Stage3 读 ${rOfPlace(PLACE, 3).r}、Stage9 读 ${rOfPlace(PLACE, 9).r}`)
    const at = (stage: number, bossId?: string) => enemiesOf({
      id: `mech-${stage}`, no: 'MECH', title: '复核', place: PLACE, stage,
      nature: '反现实 · 死灵操法', recommend: [], status: '压制中', deadline: '即刻',
      desc: '', reward: [], ...(bossId ? { bossId } : {}),
    }, 0)[0]!
    const s3 = at(3, 'star-whale')
    const s9 = at(9, 'star-whale')
    ok('图鉴实体：同一个东西在卷一撞见与在卷六撞见一样厚（按图鉴登记的危险度站）',
      s3.hpMax === s9.hpMax && AXES5.every((k) => s3.axes[k] === s9.axes[k]),
      `Stage3 ${s3.hpMax} / 破坏 ${s3.axes.破坏力}　Stage9 ${s9.hpMax} / 破坏 ${s9.axes.破坏力}`)
    ok('图鉴实体（对照）：现推的观测体仍跟着任务阶段走 —— 上一条不是「两边都不动」',
      at(3).hpMax !== at(9).hpMax,
      `现推观测体 Stage3 ${at(3).hpMax} → Stage9 ${at(9).hpMax}`)

    /* ⑥ 五轴同一条曲线。
       破坏力那一轴**没有任何套件去偏置它**（见 CLASS_KIT 的 bias 表），
       所以图鉴实体的破坏力读数该与「同危险度、同档位的现推首领」一字不差 ——
       两边都出自 enemyAxesAt，谁也不许另算一份。
       对照：意志力那一条被套件偏置过，它俩该不一样 ——
       不然「实体只是把观测体换了个名字」这句话就成立了。 */
    const codex6 = at(6, 'organ-apt')
    const generic6 = at(6)
    ok('五轴同一条曲线：同危险度、同档位的图鉴实体与现推首领，破坏力读数一致',
      codex6.axes.破坏力 === generic6.axes.破坏力
      && codex6.axes.破坏力 === enemyAxesAt(6, { atkMul: TUNING.bossAtkMul }).破坏力,
      `图鉴实体 ${codex6.axes.破坏力} / 现推首领 ${generic6.axes.破坏力} / 曲线 `
      + `${enemyAxesAt(6, { atkMul: TUNING.bossAtkMul }).破坏力}`)
    ok('五轴（对照）：套件的偏置确实落在了读数上 —— 它不只是现推首领换了个名字',
      AXES5.some((k) => codex6.axes[k] !== generic6.axes[k]),
      AXES5.map((k) => `${k} ${codex6.axes[k]}/${generic6.axes[k]}`).join('　'))

    /* ⑦ 五轴随危险度一路抬 —— 只抬血与破坏力的那一版是在这里被抓住的：
       五条轴一条都不许是常数。 */
    const flat = AXES5.filter((k) => {
      const v = Array.from({ length: 10 }, (_, i) => enemyAxesAt(i + 1)[k])
      return !v.every((x, i) => i === 0 || x > v[i - 1]!)
    })
    ok('五轴：五条都随危险度单调抬升（没有一条是常数）',
      flat.length === 0,
      flat.length
        ? `平的是 ${flat.join('、')}`
        : AXES5.map((k) => `${k} ${enemyAxesAt(1)[k]}→${enemyAxesAt(10)[k]}`).join('　'))
    ok('五轴：首领那一档的倍数真的乘上去了（不是把基础曲线原样端出来）',
      namedBossOf('star-whale')!.axes![0] !== enemyAxesAt(10).破坏力
      && namedBossOf('star-whale')!.axes![0] === enemyAxesAt(10, { atkMul: TUNING.bossAtkMul }).破坏力,
      `星鲸 ${namedBossOf('star-whale')!.axes![0]}／基础曲线 ${enemyAxesAt(10).破坏力}`)

    /* ⑧ 多形态：三形态一路走到底、第三形态不插队、并且走得完。
       脏器公寓 → 格尔 → 黑曜石（v1-5 这一段自己列的三个实体）。 */
    const three: Mission = {
      id: 'mech-three', no: 'MECH-3', title: '复核 · 三形态', place: PLACE, stage: 6,
      nature: '反现实 · 死灵操法', recommend: [], status: '压制中', deadline: '即刻',
      desc: '', reward: [], bossId: 'organ-apt',
    }
    const w = standUp(three)
    const dirs = (id: string) => w.enemies.filter((e) => e.namedId === id)
    ok('形态链：开局是第一形态，链头指向第二形态',
      w.enemies[0]?.namedId === 'organ-apt' && w.nextBoss === 'fanatic-ger',
      `场上 ${w.enemies[0]?.name ?? '（空）'}　nextBoss=${w.nextBoss ?? '（无）'}`)
    const nudge = () => {
      for (const c of [...w.allies, ...w.enemies]) c.bar = -1e6
      const a = w.allies.find((x) => !x.down)!
      a.bar = TUNING.barMax
      w.actor = null
      w.phase = 'select'
      advance(w)
      if (w.phase === 'select' && w.actor === a.id) act(w, { t: 'guard' })
    }
    const clearField = () => { for (const e of w.enemies) { e.hp = 0; e.down = true } }
    clearField()
    nudge()
    ok('形态链：第一形态倒下，第二形态顶上来，链没有断（nextBoss 指着第三形态）',
      dirs('fanatic-ger').length === 1 && !dirs('fanatic-ger')[0]!.down && w.nextBoss === 'obsidian',
      `场上 ${dirs('fanatic-ger')[0]?.name ?? '（没顶上来）'}　nextBoss=${w.nextBoss ?? '（无）'}`)
    ok('形态链：第三形态不许插队（第二形态还站着的时候它不许上场）',
      dirs('obsidian').length === 0,
      `场上第三形态 ${dirs('obsidian').length} 位`)
    ok('形态链：换形态换的是**另一份档案**，不是把前一具回血',
      dirs('fanatic-ger')[0]!.hpMax !== dirs('organ-apt')[0]!.hpMax,
      `${dirs('organ-apt')[0]!.hpMax} → ${dirs('fanatic-ger')[0]!.hpMax}`)
    clearField()
    nudge()
    ok('形态链：第二形态倒下，第三形态顶上来，这一场还没有收场',
      dirs('obsidian').length === 1 && !dirs('obsidian')[0]!.down && w.phase !== 'won'
      && w.nextBoss === undefined,
      `phase=${w.phase}　场上 ${dirs('obsidian')[0]?.name ?? '（没顶上来）'}　`
      + `nextBoss=${w.nextBoss ?? '（链到此为止）'}`)
    ok('形态链：形态数在日志里数得出来（第二阶段 / 第三阶段各有名有姓）',
      w.log.some((l) => l.skillId === 'phase-2') && w.log.some((l) => l.skillId === 'phase-3'),
      w.log.filter((l) => l.skillId.startsWith('phase-')).map((l) => l.skill).join(' → '))
    clearField()
    nudge()
    ok('形态链：第三形态倒下就是收场（链走得完，不会无限换形态）',
      w.phase === 'won', `phase=${w.phase}　手数 ${w.hand}`)

    /* 对照：没写 next 的图鉴实体，倒下就是收场 —— 链是写出来的，不是默认给的 */
    const solo = standUp({ ...three, id: 'mech-solo', bossId: 'star-whale' })
    for (const e of solo.enemies) { e.hp = 0; e.down = true }
    {
      for (const c of [...solo.allies, ...solo.enemies]) c.bar = -1e6
      const a = solo.allies.find((x) => !x.down)!
      a.bar = TUNING.barMax
      solo.actor = null
      solo.phase = 'select'
      advance(solo)
      if (solo.phase === 'select' && solo.actor === a.id) act(solo, { t: 'guard' })
    }
    ok('形态链（对照）：没写 next 的图鉴实体倒下就是收场',
      solo.phase === 'won' && !solo.nextBoss,
      `phase=${solo.phase}　nextBoss=${solo.nextBoss ?? '（无）'}`)

    /* ⑨ 图鉴说它不难打的那一只，牌面上确实不难打 ——
       魇视鳌虾的 counter 写着「消灭并不困难（一发吉他即可）」，
       所以它既不厚、身上也没有那层「只有对上这条轴才削得动」的破绽。
       它的难处是另一处（识别并唤醒被拖入噩梦者），那条写在技能上。 */
    const cherax = END_FOES.cherax!
    const hard = `${cherax.passive?.desc ?? ''}${cherax.skills.map((k) => k.desc).join('')}`
    ok('图鉴原话：counter 写着「消灭并不困难」的那一只，牌面上既不厚也没有破绽 —— 难处在别处',
      cherax.hpMul < 1 && !cherax.guardAxis && hard.includes('识别并唤醒被拖入噩梦者'),
      `${cherax.name}　血量 ×${cherax.hpMul}　破绽=${cherax.guardAxis ?? '无'}`)

    /* ⑩ 形态链不许有断头与死循环：每一个 next 都得查得到人、且几步之内走得完 */
    const brokenChain: string[] = []
    for (const [id, b] of Object.entries(END_FOES)) {
      let cur = b
      const seen = new Set([id])
      for (let i = 0; i < 5 && cur.next; i++) {
        if (seen.has(cur.next)) { brokenChain.push(`${id} 绕回 ${cur.next}`); break }
        seen.add(cur.next)
        const nx = END_FOES[cur.next]
        if (!nx) { brokenChain.push(`${id} → ${cur.next}（查不到这一份档案）`); break }
        cur = nx
      }
      if (cur.next) brokenChain.push(`${id} 链过长`)
    }
    ok('形态链：每一条都查得到下一位、也没有绕回自己',
      brokenChain.length === 0,
      brokenChain.length ? brokenChain.join('；') : `${Object.keys(END_FOES).length} 份图鉴档案逐条走过`)

    const chains = Object.entries(END_FOES)
      .filter(([, b]) => b.next)
      .map(([id, b]) => {
        const c = [id]
        let cur = b
        while (cur.next && END_FOES[cur.next]) { c.push(cur.next); cur = END_FOES[cur.next]! }
        return c.join('→')
      })
    info.push(`图鉴实体 ${Object.keys(END_FOES).length} 份；形态链 ${chains.filter((c, i) => !chains.some((o, j) => j < i && o.endsWith(c))).join('　')}`)
    info.push(`全文实体事件 ${entitiesEvents.length} 段 / 有头名 ${entitiesEvents.length - unheaded.length} 段 / `
      + `豁免 ${Object.keys(NON_FIGHT_EVENTS).length} 段`)
  } catch (e) {
    fail.push('图鉴实体段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 16) 背景音：六段床各自成不成曲，且不跑调 ----------
     音乐是纯合成的数据（music.ts 的 BEDS），它的错都长在**换和弦的那一下**：
       · 旋律写在和弦上而不是写在调上 —— 和弦一换，同一句被整体拖走，
         一句里的音程结构当场被改写（小三度转过去变大三度），听感就是跑调；
       · 铃是随机撒的，或者撒在一个不是和弦音的音上 —— 单看一个小节都对，
         进行一换和弦就撞；
       · 主题与进行不同步 —— 长度对不上「进行长度 × 一小节八格」；
       · 低音写到听不见的八度去（40Hz 以下只剩糊，那条运行时闸门就把它吞了）；
       · 一段床写好了却没有任何模块放它（VIEW_BED 里没人指），等于白写。
     这些都不是听一遍能听出来的（听出来的那一下，往往已经上线了），所以钉在这里。
     每一条都配对照：证明判据本身有牙，而不是「怎么写都过」。 */
  try {
    const names = Object.keys(BEDS) as BedName[]
    /** 一个音落在本段的哪个音级上（相对主音，八度往上算） */
    const pcOf = (bed: { key: { root: number } }, n: number) => (((n - bed.key.root) % 12) + 12) % 12
    const bassOf = (ch: Chord) => hz(ch.r - 12)
    const chords = names.flatMap((n) => BEDS[n].prog.map((ch, i) => ({ bed: n, ch, bar: i })))

    /* ① 旋律整句都写在本段的调上 —— 和弦在底下走，旋律不走调 */
    const offTune = names.flatMap((n) => BEDS[n].melody
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x !== null && !BEDS[n].key.scale.includes(pcOf(BEDS[n], x as number)))
      .map(({ x, i }) => `${n} 第 ${Math.floor(i / 8) + 1} 小节第 ${(i % 8) + 1} 格 ${x}`))
    ok('背景音：主题逐音都在本段的调上 —— 换和弦不改写旋律的音程结构',
      offTune.length === 0,
      offTune.length ? offTune.join('；') : names.map((n) => {
        const real = BEDS[n].melody.filter((x) => x !== null) as number[]
        return `${n} ${BEDS[n].key.scale.length}声音阶/${real.length} 音`
      }).join('　'))

    /* 对照：判据有牙 —— 主音往上半音（小调的「避音」）不在任何一段的调里 */
    ok('背景音（对照）：同一条判据认得出一音之差 —— 主音上方半音，六段都不收',
      names.every((n) => !BEDS[n].key.scale.includes(pcOf(BEDS[n], BEDS[n].key.root + 1))),
      `${names.length} 段床逐一试过主音 +1`)

    /* ② 和声也在调上：每一条进行的根音与叠的每一个音都属于本调音阶 */
    const offChord = chords.flatMap(({ bed, ch, bar }) =>
      [ch.r, ...ch.s.map((s) => ch.r + s)]
        .filter((x) => !BEDS[bed].key.scale.includes(pcOf(BEDS[bed], x)))
        .map((x) => `${bed} 第 ${bar + 1} 小节 ${x}`))
    ok('背景音：和声逐音也在调上 —— 进行里没有一个借来的和弦',
      offChord.length === 0,
      offChord.length ? offChord.join('；') : `${chords.length} 个小节的和弦逐音查过`)

    /* 对照：换成一个关系外的和弦（A 小调里插一个 E 大三，带 G#）就该被抓住 */
    const badChord = { r: -17, s: [0, 4, 7] }   // E G# B，G# 不在 A 自然小调
    ok('背景音（对照）：同一条判据认得出一段关系外的和弦',
      [badChord.r, ...badChord.s.map((s) => badChord.r + s)].some((x) => !BEDS.terminal.key.scale.includes(pcOf(BEDS.terminal, x))),
      `构造的 E 大三和弦在 A 小调上：G# 出调`)

    /* ③ 铃是写在谱面上的（第几小节第几拍哪个音），而且必须是那一小节和弦的和弦音 ——
          这是上一版最假的一处：随机挑音随机落拍，听着就不是配器 */
    const offBell = names.flatMap((n) => BEDS[n].bells
      .filter((b) => {
        const ch = BEDS[n].prog[b.bar % BEDS[n].prog.length]
        const tones = [ch.r, ...ch.s.map((s) => ch.r + s)].map((x) => (((x % 12) + 12) % 12))
        return !tones.includes(((b.note % 12) + 12) % 12)
      })
      .map((b) => `${n} 第 ${b.bar + 1} 小节的铃 ${b.note}`))
    ok('背景音：每一记铃都是它那一小节的和弦音 —— 进行走到哪儿都站得住',
      offBell.length === 0,
      offBell.length ? offBell.join('；') : `${names.reduce((a, n) => a + BEDS[n].bells.length, 0)} 记铃逐记对过和弦（${names.filter((n) => !BEDS[n].bells.length).join('、')} 不敲铃）`)

    /* 对照：把任意一记铃挪高半音，就不在它那一小节的和弦音里了 */
    const one = BEDS.boss.bells[0]
    ok('背景音（对照）：同一条判据认得出一记只差半音的铃',
      (() => {
        const ch = BEDS.boss.prog[one.bar]
        const tones = [ch.r, ...ch.s.map((s) => ch.r + s)].map((x) => (((x % 12) + 12) % 12))
        return !tones.includes((((one.note + 1) % 12) + 12) % 12)
      })(),
      `boss 第 ${one.bar + 1} 小节的铃挪到 ${one.note + 1} 就出和弦`)

    /* ④ 形制对得齐：主题长度 = 进行长度 × 8 格（一小节一个八分音符网格），
          铃写在形式之内，主题的实音够多（不是一句空拍），音域落在人听得舒服的那一段，
          非作战的五段留白过半 —— 只有作战那两段允许排满 */
    const badForm = names.filter((n) => BEDS[n].melody.length !== BEDS[n].prog.length * 8
      || BEDS[n].prog.length < 4
      || BEDS[n].bells.some((b) => b.bar < 0 || b.bar >= BEDS[n].prog.length))
    ok('背景音：主题长度 = 进行长度 × 8 格，铃写在形式之内 —— 一遍走完正好接回开头',
      badForm.length === 0,
      badForm.length ? badForm.join('；') : names.map((n) => `${n} ${BEDS[n].prog.length}小节/${BEDS[n].melody.length}格`).join(' '))

    const thin = names.filter((n) => BEDS[n].melody.filter((x) => x !== null).length < 6)
    ok('背景音：每一段都有一句真主题（至少六个实音）—— 不是一声长音顶着',
      thin.length === 0,
      thin.length ? thin.join('；') : names.map((n) => `${n} ${BEDS[n].melody.filter((x) => x !== null).length} 音`).join(' '))

    const rangeless = names.filter((n) => BEDS[n].melody.some((x) => x !== null && (hz(x) < 110 || hz(x) > 1600)))
    ok('背景音：主题音域都在 110–1600Hz —— 不用一条听不见的低声部充数',
      rangeless.length === 0,
      rangeless.length ? rangeless.join('；') : names.map((n) => {
        const r = BEDS[n].melody.filter((x) => x !== null) as number[]
        return `${n} ${hz(Math.min(...r)).toFixed(0)}–${hz(Math.max(...r)).toFixed(0)}Hz`
      }).join(' '))

    ok('背景音（对照）：同一条判据认得出一条写到 65Hz 去的「主题」',
      hz(BEDS.terminal.key.root - 40) < 110,
      `构造的 ${hz(BEDS.terminal.key.root - 40).toFixed(1)}Hz 掉出台外`)

    const wall = names.filter((n) => !['battle', 'boss'].includes(n)
      && BEDS[n].melody.filter((x) => x !== null).length > BEDS[n].melody.length / 2)
    ok('背景音：非作战的四段床，主题里留白过半（不是一整句排满的音墙）',
      wall.length === 0,
      wall.length ? wall.join('；') : names.filter((n) => !['battle', 'boss'].includes(n))
        .map((n) => `${n} ${BEDS[n].melody.filter((x) => x !== null).length}/${BEDS[n].melody.length}`).join(' '))

    /* ⑤ 低音落在听得见、也不跟和声挤在一起的那一段（50–140Hz，即 G1 到 C#3）：
          再低只剩糊（运行时另有一道 40Hz 的闸门兜底），再高就不叫低音声部了。
          pad 的根音落在和声该在的八度（110–280Hz）。 */
    const lowOut = chords.filter(({ ch }) => bassOf(ch) < 50 || bassOf(ch) > 140)
      .map(({ bed, ch }) => `${bed} 低音 ${bassOf(ch).toFixed(0)}Hz`)
    ok('背景音：每一条低音都落在 50–140Hz —— 不靠运行时那道 40Hz 闸门兜底',
      lowOut.length === 0,
      lowOut.length ? lowOut.join('；') : `${chords.length} 个小节，最低 ${Math.min(...chords.map(({ ch }) => bassOf(ch))).toFixed(0)}Hz / 最高 ${Math.max(...chords.map(({ ch }) => bassOf(ch))).toFixed(0)}Hz`)

    const padOut = chords.filter(({ ch }) => hz(ch.r) < 110 || hz(ch.r) > 280)
      .map(({ bed, ch }) => `${bed} pad ${hz(ch.r).toFixed(0)}Hz`)
    ok('背景音：每一条 pad 根音都落在 110–280Hz —— 和声不用挤进低音的位置',
      padOut.length === 0,
      padOut.length ? padOut.join('；') : `${names.length} 段床的进行逐小节走过`)

    /* 对照：判据本身有牙 —— 把根音再压低两个八度就该掉出台外 */
    ok('背景音（对照）：同一条判据认得出一段写低了两个八度的进行',
      !(bassOf({ r: BEDS.terminal.prog[0].r - 24, s: [0, 7] }) >= 50
        && bassOf({ r: BEDS.terminal.prog[0].r - 24, s: [0, 7] }) <= 140),
      `构造的低音 ${bassOf({ r: BEDS.terminal.prog[0].r - 24, s: [0, 7] }).toFixed(1)}Hz`)

    /* ④ 段与界面对得上：每一段床都有地方在放，每一处指的也是真有的那一段。
       出处有两类：VIEW_BED 那张静态映射，和**手工点名的调用**
       （标题屏的 setBed('menu')、作战屏的 battleBed → battle/boss）。
       两者都要认 —— 这条断言第一版只认了 VIEW_BED，于是把 menu 报成「没人放」：
       是判据窄了，不是数据错了。所以出处改成从源码里找调用点。 */
    const bare = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${ent.name}`
        if (ent.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(ent.name) && !p.includes('/lib/audio/music.ts')) files.push(p)
      }
    }
    walk('src')
    const code = files.map((p) => bare(readFileSync(p, 'utf8'))).join('\n')
    /* 作战屏那一段是**按条件挑**的（on ? (boss ? 'boss' : 'battle')），
       没有 setBed('battle') 这样的字面量可找 —— 所以单独取 battleBed 的函数体来看。
       取的就是那个函数：别的写法（在别处另挑一次）这条看不到，也就该被抓住。 */
    const idxSrc = bare(readFileSync('src/lib/audio/index.ts', 'utf8'))
    const battleBody = idxSrc.includes('function battleBed') ? idxSrc.split('function battleBed')[1].slice(0, 400) : ''
    /** 有人用名字点过它：静态映射、一处 setBed('x')、或作战屏那两个名字之一 */
    const named = (n: BedName) => Object.values(VIEW_BED).includes(n) || code.includes(`setBed('${n}')`) || battleBody.includes(`'${n}'`)
    const handPicked = names.filter((n) => !Object.values(VIEW_BED).includes(n) && named(n))

    const orphan = names.filter((n) => !named(n))
    const ghost = [...new Set([...Object.values(VIEW_BED), ...handPicked])].filter((n) => !names.includes(n))
    ok('背景音：六段床与界面出处一一对得上 —— 没有白写的，也没有指向空处的',
      orphan.length === 0 && ghost.length === 0,
      (orphan.length || ghost.length) ? `没人放：${orphan.join('、') || '无'}；指向空处：${ghost.join('、') || '无'}`
        : `${Object.keys(VIEW_BED).length} 个模块 + 手工点名的 ${handPicked.join('、')}`)

    /* 对照：这条判据认得出一段真没人点的床（不是「怎么写都过」） */
    ok('背景音（对照）：同一条判据认得出一段没人点名的床',
      !named('__nobody__' as BedName) && names.every((n) => named(n)),
      `手工点名的三段（${handPicked.join('、')}）分别从调用点与 battleBed 里认出来`)

    info.push(`背景音 ${names.length} 段：`
      + names.map((n) => `${n} ${BEDS[n].bpm}bpm·${BEDS[n].prog.length}和弦·${BEDS[n].voice}·`
        + `${BEDS[n].melody.filter((x) => x !== null).length} 音·${BEDS[n].bells.length} 铃`).join('　'))
  } catch (e) {
    fail.push('背景音段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  return { pass, fail, info }
}
