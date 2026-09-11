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

import {
  act, advance, aliveOf, basicOf, brokenOf, buffOf, createBattle, enemysTurn, find,
  guardLeft, legalSkills, pendingFoe, skipOf,
} from '../../src/lib/battle/engine'
import { enemiesOf } from '../../src/lib/battle/derive'
import { MISSIONS } from '../../src/data/missions'
import { TUNING } from '../../src/lib/battle/tuning'
import { ROSTER } from '../../src/lib/battle/roster'
import { effectLineOf, mulTextOf } from '../../src/lib/battle/skilltext'
import { DEBUFF_KEYS } from '../../src/lib/battle/types'
import type { AxisKey, BuffKey, Combatant, EnemyIntent, SkillSpec } from '../../src/lib/battle/types'

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

/** 把「反现实制成品 甲 · 首领」还原成型别名 */
function profileOf(name: string): string {
  return name.replace(/ · (精英|首领)$/, '').replace(/ [甲乙丙丁]$/, '')
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

  return { pass, fail, info }
}
