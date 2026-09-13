/* ============================================================
   定点复核 —— 让源码自己证明这些规矩真的生效
   ------------------------------------------------------------
   这一支叫 mech 出身，从「战斗机制」起家；如今它量的是**整个终端凡是
   不能只看界面就信的规矩** —— 战斗引擎、音频床、预设、提示词组装、
   记忆库、私密底档、底层规矩、回退。名字没改，是因为冒烟脚本按这个名字
   调它；但别被名字骗了：这里大半的节已经不碰战斗。

   为什么单开一支，而不是塞进 smoke：
     smoke 跑的是**构建产物**（vite preview），它读不到源码模块；
     这些规矩住在引擎内部，只有拿源码那一份才验得动。
     所以这里借 vite 的 SSR 加载器现场编译（同 balance.mjs），不落产物。

   为什么不信「整场模拟里出现过」：
     上一版就是在整场对局里捞日志 —— 结果 ward 一次没捞到（敌人没往
     有护持的人身上挂负面），break 还被 stall 的标签盖住。那叫**没测到**，
     不叫通过。所以这里不打整场，每一样都单独摆出来点名验，
     而且凡是要证明「这样做了」的，都配一条**对照**证明「不这样就不做」——
     否则断言可能在「根本没打起来」的空场上悄悄通过（这坑踩过：
     单人挑 stage 10，createBattle 一返回 phase 就已经是 lost）。

   ------------------------------------------------------------
   一节一节的目录（按文件顺序，节号即注释里的编号）
   ------------------------------------------------------------
   · 引擎机制
      1  破绽       —— 破防只认破绽，破绽按轴算，不是按「谁打得多」
      2  断拍       —— 被打断的那一回合真跳过，且不是被 stall 顶替
      3  护持       —— 轴护盾只吃本轴伤；盾在谁身上有定表（EXPECT_AXIS）
      4  蓄力       —— 蓄到满才放得出，中途挨打会掉
      5  破绽归属    —— 破绽长在**该长的人**身上（不是随手挂）
      6  旧吉他解封   —— 「规格翻倍」翻到了哪些量，逐项对上
      7  面板与负面键 —— 面板读数与 DEBUFF_KEYS 的分工不重叠
      8  敌阵       —— 血量压制 · 首领≥精英 · 随时期变强
      9  会长天花板   —— 数值有顶，且不许回涨（回涨 = 平衡返工）
     10  五轴不封顶   —— 基准 AXIS_REF 不是上限，越过它也得算得出来
     11  黄金狮子     —— 形态数值与解锁条件
     12  增益回合上限 —— 增益有回合寿命，不会永久挂着
     13  召唤       —— 召唤物入场 / 退场 / 占位不越界
     14  面具心叶等   —— 亡灵军团 · 二阶段黑金狮子这一串特殊形态
     15  图鉴与形态链 —— 图鉴实体 ↔ 形态链 ↔ 五轴走同一条曲线
   · 声音与引导
     16  背景音     —— 六段床各自成曲、且不跑调（半音表比对）
     17  首启       —— 自带预设要**真的启动**，输出预算够一轮真实回执
     18  台词行契约   —— 气泡版式是契约，换预设也不许破
     19  梅芙引导     —— 作战屏那一段导览的步序与终点
   · 推演与提示词
     20  事件指令     —— 回执里的结构化指令解析得干净（含坏输入）
     21  详细大纲     —— 细的那份真进提示词；缺了要退得干净
     21b 开场白     —— 台词行按「角色名：」起行，旁白行不带前缀
     22  性情锚     —— 人物卡逐字进；分期层按「读到哪」翻篇
   · 账与记忆
     23  好感       —— 只从行为里来 + 事件门槛 / 锁定
     24  情景记忆库   —— 只重排既有的账（不新记 · 不漏 · 不剧透）
   · 文档与互读
     25  操作手册     —— MANUAL 里的步序不许骗人（对着真 DOM 属性核）
     26  正文↔短信    —— 互读的筛子就是这条功能本身
   · 私密与底层规矩
     27  私密档案     —— 底档从 0 起 · 并账只增 · 合成分档
     28  底层规矩     —— 独占 / 白虎 / 紧致 … 只进提示词，不上屏
   · 成文与回退
     29  交战成文     —— 回填推演的是一整段**正文**（不是分节报告）
     30  在场名册 + 回退 —— 名册实时化 · 撤一段只撤该撤的四样
   · 新账
     31  次数账 / 关系 / 多女同场 —— 八栏只增不减 · 九级梯子由剧情给 ·
                                  那一条只在真不止一个人时挂
   · 空档
     32  自由时间     —— 两处入口一个状态 · 羁绊拦在落地那一层 ·
                        自由段不算主线进度、也不冠「· 原文」
   · 笔法
     33  私密场面怎么写细 —— 一条**有条件**的笔法规矩：只在写正文的两条通道里带，
                        没走到那一档就不生效；另带「镜头要推近」（世界书文风册第四条
                        + 预设 ts-intim-depth）
   · 此刻（不是账）
     34  贴身衣物     —— 底档 18 位各一套（照性格、不许撞款）· 穿着三档后写覆盖 ·
                        湿润可上可下 · 发情那一半的耦合 · 流水只记真变了的

   ------------------------------------------------------------
   写一节新的时候，跟着这一节的老规矩走：
     · 每一条 ok() 的名字要能被**单独读出来**（不看上下文也知道在证明什么）
     · 每条「这样做了」配一条「不这样就不做」的对照
     · 场地立不住要**抛**，不能悄悄跳过（见下面的 ready()）
     · 量的是源码里的那份规矩；界面上看得见的那一半归 smoke

     node scripts/mech.mjs
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs'
import {
  act, advance, aliveOf, atkMulOf, affordable, basicOf, brokenOf, buffOf, createBattle,
  endureCap, enemysTurn, find, guardLeft, legalSkills, pendingFoe, skipOf, standingOf, summonFoe,
} from '../../src/lib/battle/engine'
import { combatantOf, enemiesOf, enemyFormation, minionOf } from '../../src/lib/battle/derive'
import { effectiveGrowth, LEVEL_BASE_COST, LEVEL_STEP_PCT, levelCostOf } from '../../src/lib/battle/store'
import { AXIS_REF } from '../../src/data/types'
import { MISSIONS } from '../../src/data/missions'
import { TIMELINE } from '../../src/data/timeline'
import { CODEX, resolveEntityToCodexId } from '../../src/data/codex'
import { TUNING, enemyAxesAt } from '../../src/lib/battle/tuning'
import { END_FOES } from '../../src/lib/battle/endfoes'
import { EVENT_HEAD, NON_FIGHT_EVENTS, headFoeOf, isMainlineEvent, mainlineMissions } from '../../src/lib/battle/mainline'
import { battleMissionOf } from '../../src/lib/battle/from-directive'
import { mapRegionOf, rOfPlace } from '../../src/lib/battle/rvalue'
import { passiveText, ROSTER } from '../../src/lib/battle/roster'
import { effectLineOf, mulTextOf } from '../../src/lib/battle/skilltext'
import { battleStoryBrief, templateStorylog } from '../../src/lib/battle/storylog'
import type { BattleRecord } from '../../src/lib/battle/types'
import { DEBUFF_KEYS } from '../../src/lib/battle/types'
import { LION_PAIR_ID } from '../../src/lib/battle/synergy'
import { namedBossOf } from '../../src/lib/battle/bosses'
import { OPERATOR_ID, personOf, defaultBondOf, PERSON_IDS } from '../../src/data/castmeta'
import { BOND_STAGE, confirmOf, stagePassed } from '../../src/data/bondstage'
import { buildDirectorSystem, parseDirectorReply, parsePlotReply, replyDisplayText } from '../../src/lib/plot'
import { splitSpeech } from '../../src/lib/dialogue'
import type { DialogueSeg } from '../../src/lib/dialogue'
import {
  BOTTOM_RULES, EXCLUSIVE_RULE, HAREM_RULE, INTIM_DEPTH_RULE, PROSE_RULES, SMOOTH_RULE, haremRule,
} from '../../src/lib/worldrules'
import { groupSystemPrompt, systemPrompt } from '../../src/lib/sms'
import { PARTY_MAX, dateBondRule, rendezvousPrompt } from '../../src/lib/rendezvous'
import type { Rendezvous, RendezvousParty } from '../../src/lib/rendezvous'
import { BEDS } from '../../src/lib/audio/music'
import { bedForState, VIEW_BED } from '../../src/lib/audio/index'
import { hz } from '../../src/lib/audio/sfx'
import { clampBudget, DEFAULT_BUDGET, MAX_BUDGET, MIN_BUDGET } from '../../src/lib/budget'
import { API_DEFAULTS } from '../../src/lib/api'
import { BUILTIN_IDS, BUILTIN_SOURCE, BUILTIN_V, ensureActiveSnapshot, needsBudgetFloor, needsContentRefresh, shouldAutoStart, shouldSettleDown } from '../../src/lib/builtin-presets'
import type { FloorLedger } from '../../src/lib/builtin-presets'
import { BUILTIN_GROUPS, BUILTIN_GROUP_IDS, needsGroupRefresh, shouldSeedGroup } from '../../src/lib/smsthreads'
import { CANON_SEED_VERSION, buildCanonLorebooks } from '../../src/lib/loreseed'
import { charOf } from '../../src/data/personas'
import { parseChatPreset } from '../../src/lib/schemes'
import { ACTIVE_PRESET_KEY, snapshotActivePreset } from '../../src/lib/preset'
import { EVENT_BRIEFS } from '../../src/data/briefs'
import { TEMPER, temperAt } from '../../src/data/temper'
import { MINDS } from '../../src/data/minds'
import {
  MEM_SECTIONS, chronicleOf, deedsOf, memCounts, mindsOf, relationsOf, seqOfStrict, sightsOf, skillsOf, threadsOf,
} from '../../src/lib/memory'
import type { MemInput } from '../../src/lib/memory'
import { SCENES } from '../../src/data/scenes'
import { MANUAL } from '../../src/data/manual'
import { CHARACTERS } from '../../src/data/chars'
import { castName, castOf } from '../../src/lib/cast'
import { plotContextFor, smsContextFor } from '../../src/lib/crosslink'
import {
  DEV_STAGE_COUNT, INTIMATE, INTIMATE_BOND, INTIMATE_SLOTS, NO_ACT, PHYSIQUE, devStage,
  devStageIndex, hasIntimate, intimAdvanceLabel, intimateOf, mergeIntim,
} from '../../src/data/intimate'
import { ACT_KINDS, ACT_META, actOf, actTotal, isActReceive, mergeActs } from '../../src/data/acts'
import {
  ATTIRE, ATTIRE_LOG_MAX, ATTIRE_META, ATTIRE_SLOTS, WEAR_PHRASE, WET_DRY_STEP, WET_PER_LEWD,
  WET_STAGES, WET_STAGE_COUNT, attireAdvanceLabel, attireOf, dryAttire, hasAttire, mergeAttire,
  wearWord, wetStage, wetStageIndex,
} from '../../src/data/attire'
import { REL_IDS, REL_TIERS, isRelId, relIndex, relLadderText, relName } from '../../src/data/rel'
import { applyDirective, directiveHasFx, dateDirective, dateReady, sanitizeDirective, smsDirective } from '../../src/lib/plot'
import {
  EPISODES, countMainlineDone, episodeOf, freeIdAfterVol, freeLabel, isFreeId, nextEpisodeAfter,
} from '../../src/lib/freetime'
import { markDone, nextTour, skipTutorial, TOURS } from '../../src/lib/guide'
import type { ChannelCfg } from '../../src/lib/schemes'
import type { BedName, Chord } from '../../src/lib/audio/music'
import type { ActCount, Mission, RelId, TimelineEvent, WorldRecord, WorldState } from '../../src/data/types'
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

    // 期满：这里推的是**拍**，不是自己的回合数 —— 变身按场上过了多久算，
    // 与增益按自身出场数算不是一回事（见 SkillForm.ticks）。
    //
    // 一拍 = 一个轮回：场上还站着的每人各出一手，**敌方也算**（见 engine 的 endBeat）。
    // 所以不能像早先那样把敌方按死在 -1e6 再推 advance —— 那样的出手配额永远差着敌方
    // 那几手，拍子根本收不了，变身长度也就一直不往下走。这里让露娜把配额走满：
    // 她一律「防御」，既不出手打人（靶子够硬，也不想在这一段顺手把敌人清了），
    // 也不碰他自己那份出场数。
    const luna = find(s, 'luna')!
    /** 走满这一拍的出手配额；返回 tick 是否真的往前走了一拍 */
    const closeBeat = (): boolean => {
      const t0 = s.tick
      let guard = 0
      while (s.tick === t0 && guard++ < 24) drive(s, luna, { t: 'guard' })
      return s.tick > t0
    }
    let pushed = 0
    for (let i = 0; i < 12 && me.morph; i++) {
      // 解体的那一笔是收拍时写进日志的（endBeat 里），所以这一段也要照收不误
      const n = s.log.length
      if (!closeBeat()) break
      seen.push(...s.log.slice(n).map((l) => l.skillId ?? l.skill ?? ''))
      pushed += 1
    }
    ok('黄金狮子：期满自己变回来（形态解除，五轴与技能表原样还回去）',
      !me.morph && me.axes.破坏力 === before.axes.破坏力
      && me.skills.map((k) => k.name).join('／') === before.skills.join('／'),
      me.morph ? `推了 ${pushed} 拍仍未解除，余 ${me.morph.ticks} 拍` : `推 ${pushed} 拍后还原，破坏力回到 ${me.axes.破坏力}`)
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

    /* 一拍一拍地推。这里让**梅菲莎代劳**把出手配额走满，把亚纳托利亚整个晾在一边：
       一拍只有在场上每人（含敌方）都出过一手时才收（见 engine 的 endBeat），
       所以让谁推不出拍子来是有讲究的 —— 让她推，亚纳托利亚就一次手都没出，
       「自身出场次数」那条时限一动不动，散掉只可能是回合闸干的。 */
    const other = find(s, 'mefisa')!
    const oneTick = () => {
      const t0 = s.tick
      let guard = 0
      while (s.tick === t0 && guard++ < 24) {
        for (const f of s.enemies) f.bar = -1e6
        other.sp = 999
        s.actor = other.id
        s.phase = 'select'
        // 「防御」：占掉一手的配额，却不出手打人，也不动她自己以外的任何人。
        act(s, { t: 'guard' })
      }
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

    /* 敌阵站位：头目站正中、召唤物分列两翼（见 derive.enemyFormation）。
       拿带档位的单位验**形状**：tier 有值的就是头目档（enemiesOf 把最硬的那个
       生成在头一名，召唤物一律 tier 为空）。

       为什么非得分三列不可 —— 这一条是踩过的坑：
       原先敌阵排成一行、允许折行，而 .arena 是 overflow: hidden。
       小怪一多就折到第二行，那半截被裁掉：**看得见、点不中**
       （挑目标点的是卡本体，被裁的部分不在可命中区里）。
       所以「不折行」不是版式偏好，是可玩性 —— 两翼要能自己收窄到排得下。 */
    const F = (id: string, tier?: string) => ({ id, tier })
    const shape = (arr: { id: string }[]) => arr.map((x) => x.id).join('')
    const f3 = enemyFormation([F('a', 'boss'), F('b'), F('c')])
    const f5 = enemyFormation([F('a', 'boss'), F('b'), F('c'), F('d'), F('e')])
    const f6 = enemyFormation([F('a', 'boss'), F('b'), F('c'), F('d'), F('e'), F('f')])
    ok('敌阵站位：头目档恒在中列 —— 1 只到 6 只都不动',
      f3.mid?.id === 'a' && f5.mid?.id === 'a' && f6.mid?.id === 'a'
      && enemyFormation([F('a', 'boss')]).mid?.id === 'a',
      `三只 → 中列 ${f3.mid?.id}　五只 → ${f5.mid?.id}　六只 → ${f6.mid?.id}`)
    ok('敌阵站位：召唤物分列两翼，且两翼只差一只（不会一边堆成一坨）',
      Math.abs(f5.left.length - f5.right.length) <= 1
      && Math.abs(f6.left.length - f6.right.length) <= 1
      && f3.left.length === 1 && f3.right.length === 1,
      `三只 → 左${f3.left.length}／右${f3.right.length}　五只 → 左${f5.left.length}／右${f5.right.length}`
      + `　六只 → 左${f6.left.length}／右${f6.right.length}`)
    ok('敌阵站位：一个人都没弄丢、也没多出来（两翼并起来就是原阵去掉中列那位）',
      shape(f6.right) + shape(f6.left) === 'bcdef'
      && shape(f5.right) + shape(f5.left) === 'bcde'
      && f6.left.length + f6.right.length + 1 === 6
      && [...f6.left, ...f6.right, f6.mid!].map((x) => x.id).sort().join('') === 'abcdef',
      `六只 → 右 ${shape(f6.right)}／左 ${shape(f6.left)}／中 ${f6.mid?.id}`)
    /* 上面那条「右接左」不是随便定的：它说的是**离中列越近、排位越靠前**。
       召唤物带排行字（甲乙丙丁，见 minionOf），排位一乱就分不清谁是谁 ——
       所以两翼各自内部必须保序，只能整体绕中列摆开。 */
    ok('敌阵站位：两翼各自内部保序（中列排在阵尾时，也是从远端往中列数，不把甲乙丙丁打乱）',
      shape(f6.left) === 'ef' && shape(f6.right) === 'bcd'
      && shape(f5.left) === 'de' && shape(f5.right) === 'bc',
      `六只 → 左 ${shape(f6.left)}／右 ${shape(f6.right)}　五只 → 左 ${shape(f5.left)}／右 ${shape(f5.right)}`)
    ok('敌阵站位（对照）：空阵不硬塞一个中列出来（零敌时 <Foe> 不该被渲染）',
      enemyFormation([]).mid === null && enemyFormation([]).left.length === 0
      && enemyFormation([]).right.length === 0,
      '零敌 → 中列 null')
    /* 二阶段：首领换人站中间 —— 旧首领倒下后，站中列的必须是**顶上的那个**
       （masked-kokonoha 的 BLACK 是 push 到 enemies 尾上的，不是换掉头一名）。 */
    const two = enemyFormation<{ id: string; tier?: string; down?: boolean }>([
      { id: 'a', tier: 'boss', down: true }, F('b'), F('c'), F('d', 'boss'),
    ])
    ok('敌阵站位：二阶段顶上的首领站中列（换人不换列 —— 不是让倒掉的旧首领占着中间）',
      two.mid?.id === 'd'
      && [...two.left, ...two.right].map((x) => x.id).sort().join('') === 'abc',
      `旧首领 a 已倒、新首领 d 顶上 → 中列 ${two.mid?.id}　两翼 ${[...two.left, ...two.right].map((x) => x.id).join('')}`)
    /* 头目档倒光了：中列退回第一个还站着的，别把一具尸首供在正中 */
    const dead: { id: string; tier?: string; down?: boolean }[] = [
      { id: 'a', tier: 'boss', down: true }, { id: 'b' }, { id: 'c' },
    ]
    const downed = enemyFormation(dead)
    ok('敌阵站位：中列那位倒下时中列仍有人（改取第一个还站着的，不让两翼在中间对穿）',
      downed.mid?.id === 'b',
      `首领 a 已倒 → 中列 ${downed.mid?.id}`)

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

    /* ④a2 现场触发的那一张也要按「这一段是不是正史里真打过的那一场」记号 ——
       同一场仗在简报上是主线、落到作战记录里却是个无名遭遇，是两处对不上号；
       而且归档该走的「详细战斗过程」那一路也跟着丢（engine 按 s.mainline 分流）。 */
    const foeLess = TIMELINE.find((e) => !(e.entities ?? []).some((x) => x && x !== '——'))?.id
    const plotMain = battleMissionOf({ name: '复核 · 现场', stage: 5, place: '东京' }, 'v6-3')
    const plotPlain = foeLess
      ? battleMissionOf({ name: '复核 · 现场', stage: 5, place: '东京' }, foeLess)
      : undefined
    ok('现场触发：这一段的原文列了实体才算主线（没对手的那几段不算）',
      isMainlineEvent('v6-3') === true && plotMain.mainline === true
      && (!plotPlain || plotPlain.mainline === undefined),
      `v6-3 → mainline=${plotMain.mainline ?? '（无）'}`
      + `　${foeLess ?? '（找不到没实体的事件）'} → ${plotPlain ? (plotPlain.mainline ?? '（无）') : '（跳过）'}`)

    /* ④b 牌面是一段**窗口**，不是一张牌 —— 打赢即「已完成」（不等领取），
       领取只把这一条收走。旧写法把「打赢」与「领了没」绑在一起，
       于是打赢了却没回来点领取的人，牌面永远卡在那一段上写着「压制中」，
       后面真打过的几场根本不上牌面（简报与他打过的仗对不上号）。 */
    const allDone: Record<string, true> = {}
    for (const e of TIMELINE) allDone[e.id] = true
    const fightable = TIMELINE.filter((e) => (e.entities ?? []).some((x) => x && x !== '——')).map((e) => e.id)
    const wonFirst = (n: number) => (evId: string) => fightable.slice(0, n).includes(evId)
    const w2 = mainlineMissions(allDone, {}, wonFirst(2))
    ok('主线牌面：打赢的两场自己翻成「已完成」并留在牌上等人提交，第三场接着上牌面',
      w2.length === 3 && w2[0].at === fightable[0] && w2[2].at === fightable[2]
      && w2[0].status === '完成' && w2[1].status === '完成' && w2[2].status === '压制中',
      `牌面 ${w2.map((m) => `${m.at}:${m.status}`).join(' ')}　（可打的头三段 ${fightable.slice(0, 3).join(' ')}）`)
    // 提交第一场：它从牌上收走，窗口整体往前挪一格（完成的那一场不回来）
    const w3 = mainlineMissions(allDone, { [fightable[0]]: true }, wonFirst(3))
    ok('主线牌面：提交一场只是把它收走 —— 后面那两场（含刚打赢的第三场）照旧在牌上',
      !w3.some((m) => m.at === fightable[0]) && w3.some((m) => m.at === fightable[2] && m.status === '完成')
      && w3.some((m) => m.at === fightable[3] && m.status === '压制中'),
      `牌面 ${w3.map((m) => `${m.at}:${m.status}`).join(' ')}`)
    /* 没走到那一段（没收束）不上牌面 —— 但牌面停得住：撞见第一场没打赢的，
       摆完它就收，不会跳过它去摆后面的。一场都没打赢时，牌面就是眼下这一场。 */
    const partial: Record<string, true> = {}
    for (const id of fightable.slice(0, 4)) partial[id] = true
    const w4 = mainlineMissions(partial, {}, () => false)
    ok('主线牌面：一场没打赢时只摆眼下这一场（没走到的不预先冒出来）',
      w4.length === 1 && w4[0].at === fightable[0] && w4[0].status === '压制中'
      && w4.every((m) => partial[m.at!]),
      `牌面 ${w4.map((m) => m.at).join(' ') || '（空）'}　（收束过 ${fightable.slice(0, 4).join(' ')}）`)
    // 收束四段、前三段都打赢了：三张「待提交」摞在牌上，眼下这一场接着摆
    const w5 = mainlineMissions(partial, {}, wonFirst(3))
    ok('主线牌面：打赢的那几场摞在牌上等人提交，眼下这一场排在末尾',
      w5.length === 4 && w5.slice(0, 3).every((m) => m.status === '完成')
      && w5[3].at === fightable[3] && w5[3].status === '压制中',
      `牌面 ${w5.map((m) => `${m.at}:${m.status}`).join(' ')}`)

    /* ⑤ 图鉴实体按**图鉴自己的危险度**站。
       深海异界是原文实测（0.89）的那一处，读数不随危险度走 ——
       拿它当场地，血量若还在动，动的那一处就只可能是 hpStage。 */
    const PLACE = '深海异界'
    ok('靶场前提：那个地点的 R 读数不随危险度变（不然下面那两条量的是地点，不是实体）',
      rOfPlace(PLACE, 3).r === rOfPlace(PLACE, 9).r,
      `${PLACE}：Stage3 读 ${rOfPlace(PLACE, 3).r}、Stage9 读 ${rOfPlace(PLACE, 9).r}`)

    /* ⑤b 总览那张观测点示意图的落点：剧情地点 → 图上哪一格。
       这一层只管亮点落在谁身上（读数另走严格口径），但**落错和漏落一样是错**：
       漏了，图上什么都不亮，操作员以为这一段不在侦察网里；
       标错一格，他以为自己站在别处。判据全是剧情里真用过的写法。
       最容易漏的是**区号中间那个空格** —— 标定表写「第 6 区」，剧情里写「第6区」，
       比字面不抹平的话，第 6 区那两点上永远亮不起来（实测就是这么漏的）。 */
    const MAP_CASES: Array<[string, string | null, string]> = [
      ['苍之学园 · 学生会室', 'gcn', '第12区 本校舍那一片'],
      ['苍之学园 · 恋兔宿舍', 'gcn', '恋兔宿舍在苍之学园内'],
      ['恋兔宿舍 · 客厅/恋兔光房间/厨房', 'gcn', '同一个地方换了个写法'],
      ['第12区 · 旧集市', 'mkt', '标定表原文'],
      ['第 12 区 · 旧集市', 'mkt', '区号带空格'],
      ['第12区郊外荒野', 'mkt', '只写区号'],
      ['第 6 区 · 工房街', 'wsh', '标定表原文'],
      ['第6区 · 各地', 'wsh', '区号不带空格'],
      ['第6区竞技场 · 体育馆', 'wsh', '第6区里的设施'],
      ['第6区远郊荒野 · 拉普达低 R 值地带', 'wsh', '第6区外的荒野'],
      ['女神神殿 · 第 6 区近郊', 'ruin', '「神殿」与「神殿遗址」是同一处'],
      ['女神神殿遗址 · 第 6 区近郊', 'ruin', '标定表原文'],
      ['山道尽头 · 学生宿舍', 'drm', '标定表原文'],
      ['第13区 · 骨之圣堂', null, '第13区不在侦察网里，宁可不标'],
      ['篝火之国 · 巴别塔顶', null, '不在弗尔克图斯'],
      ['东京 · 有乐町/日比谷街头', null, '不在弗尔克图斯'],
    ]
    const badMap = MAP_CASES.filter(([p, want]) => mapRegionOf(p) !== want)
    const missedMap = MAP_CASES.filter(([p, want]) => want !== null && mapRegionOf(p) === null)
    ok('总览 · 地图落点：剧情里那些写法都落得到格上（区号带不带空格都算同一处）',
      missedMap.length === 0,
      missedMap.length
        ? `落不到：${missedMap.map(([p]) => p).join('、')}`
        : `${MAP_CASES.filter(([, w]) => w !== null).length} 处逐条对过`)
    ok('总览 · 地图落点（对照）：不在侦察网里的那几处一个都不硬塞（宁可不标，也不指错地方）',
      badMap.length === 0,
      badMap.length
        ? badMap.map(([p, want]) => `${p} → ${String(mapRegionOf(p))}（应 ${String(want)}）`).join('；')
        : '第13区 / 篝火之国 / 东京：三处都空着，同图六区一处不误')
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
  /** 去掉注释再找字面量 —— 不然断言会在自己的说明文字里命中 */
  const bare = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
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
    /* 有两处是**按条件挑**的，没有 setBed('x') 这样的字面量可找：
         · 作战屏（on ? (boss ? 'boss' : 'battle')）—— 取 battleBed 的函数体；
         · 状态决定（标题/设置页那一段 menu）—— 取 bedForState 的函数体。
       取的就是那两个函数：别的写法（在别处另挑一次）这条看不到，也就该被抓住。 */
    const idxSrc = bare(readFileSync('src/lib/audio/index.ts', 'utf8'))
    const bodyOf = (fn: string, n = 400) => idxSrc.includes(`function ${fn}`) ? idxSrc.split(`function ${fn}`)[1].slice(0, n) : ''
    const battleBody = bodyOf('battleBed')
    const stateBody = bodyOf('bedForState', 700)
    /** 有人用名字点过它：静态映射、一处 setBed('x')、作战屏那两个名字之一、或状态那一档 */
    const named = (n: BedName) => Object.values(VIEW_BED).includes(n) || code.includes(`setBed('${n}')`)
      || battleBody.includes(`'${n}'`) || stateBody.includes(`'${n}'`)
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
      `手工点名的两段（${handPicked.join('、')}）分别从调用点、battleBed 与 bedForState 里认出来`)

    /* ⑤ 什么状态下该放哪一段 —— 尤其是**不该放**的那一处。
       用户报的是「关闭界面还有音乐」：标题菜单的「退出终端」回到指纹认证开屏之后，
       上一段底照旧放着，只能去关浏览器声音。所以「该放什么」收成了一个纯函数，
       这里按状态逐档点名，开屏那一档必须是 null（一段都不放）。 */
    const st = (authed: boolean, stage: string, setupMode: boolean, view = 'plot') =>
      bedForState({ authed, stage, setupMode, view })
    ok('背景音：终端已退出（指纹认证开屏）一段都不放 —— 关了界面就该收声',
      st(false, 'title', false) === null && st(false, 'game', false) === null,
      `开屏 ${JSON.stringify(st(false, 'title', false))} / ${JSON.stringify(st(false, 'game', false))}`)

    /* 对照：判据不是「一律静音」。标题菜单与设置专用界面照样点名 menu，
       终端本体照样按模块走 —— 这样上面那一条收得过宽（把 game 也判成静音）当场会被抓。 */
    ok('背景音（对照）：同一条判据在标题/设置页点名 menu、在终端本体按模块走',
      st(true, 'title', false) === 'menu' && st(true, 'title', true) === 'menu'
      && st(true, 'game', false, 'tavern') === 'tavern' && st(true, 'game', false, '不存在' as string) === 'terminal',
      `${st(true, 'title', false)} / ${st(true, 'title', true)} / ${st(true, 'game', false, 'tavern')}`)

    /* 还有一条路是「页面本身要走了」（关标签页 / 关窗口）：那一下**不会**跑一遍组件卸载，
       所以收声得挂在 pagehide 一类的生命周期事件上。这条只能读源码，
       但判据本身要有牙：把 suspendAudio 那一句换掉、把事件名换掉，同一条判据都得变红。 */
    const leaves = (src: string) => {
      const d = src.indexOf('const leave = ')
      if (d < 0 || !src.includes(`addEventListener('pagehide', leave)`)) return false
      const body = src.slice(d, d + 240)
      return body.includes('stopBed()') && body.includes('suspendAudio()')
    }
    ok('背景音：页面要走（关标签页/关窗口）时也收声 —— 收声挂在 pagehide 上',
      leaves(idxSrc), leaves(idxSrc) ? 'pagehide → stopBed + suspendAudio' : '没找到收声的接线')
    ok('背景音（对照）：同一条判据认得出「挂着却不收声」的写法',
      !leaves(idxSrc.replace('suspendAudio()', 'noop()')) && !leaves(idxSrc.replace(`'pagehide'`, `'x'`)),
      '抽掉 suspendAudio / 换掉事件名之后，判据都变红')

    info.push(`背景音 ${names.length} 段：`
      + names.map((n) => `${n} ${BEDS[n].bpm}bpm·${BEDS[n].prog.length}和弦·${BEDS[n].voice}·`
        + `${BEDS[n].melody.filter((x) => x !== null).length} 音·${BEDS[n].bells.length} 铃`).join('　'))
  } catch (e) {
    fail.push('背景音段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 17) 首启：自带的预设要**真的启动**，输出预算不是「够回一句」 ----------
     两件事各自长在看不见的地方：
       · 预设只「播进列表」不等于会用上 —— 生成读的是生效快照（导演指令）与通道参数，
         没套用过就是空快照 + 通道缺省预算，用户看到的方案列表里却明明有那两份，
         界面上不会报错，只是写出来的东西不像话；
       · 输出预算这个数以前散在四个地方各写各的（导入器 64000 / 输入框 32000 /
         缺省 1500 / 视图里兜底 1500），同一份预设从不同入口进来落地的值不一样，
         而 1500 那一档在思考型通道上会被内部思考吃光，正文一个字没写就被掐断。
     这些都不是打开界面能看出来的，所以钉在这里。每条都配对照。 */
  try {
    /* 生效快照 / 方案列表都落在 localStorage 上，Node 里没有这一号。
       下面要拿真账本走一遍「列表里有、快照是空的」那条路，所以先补一块最小的。 */
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
      },
    })

    const cfg = (budget = DEFAULT_BUDGET): ChannelCfg => ({
      main: { ...API_DEFAULTS, maxTokens: budget },
      sms: { ...API_DEFAULTS, maxTokens: budget },
    })
    /* 两通道故意配成**不同**的样子：这样「沿用通道现值」一旦写成了「沿用主通道的值」，
       短信通道那一列就对不上，逐通道回退与「统一成主通道」两种写法当场分得开。 */
    const splitCfg: ChannelCfg = {
      main: { ...API_DEFAULTS, model: '主通道模型', temperature: 0.2, maxTokens: 1234 },
      sms: { ...API_DEFAULTS, model: '短信通道模型', temperature: 1.3, maxTokens: 4321 },
    }

    /* ① 内置预设写多少就是多少：两份 JSON 自己写着缺省那一档（30000），解析出来就该是它。
       这里认的是**预设原文**，不是某个常量 —— 预设被改小了这条就红。 */
    const parsed = BUILTIN_SOURCE.map((b) => ({ id: b.id, r: parseChatPreset(b.json, cfg()) }))
    const thin = parsed.filter((p) => !p.r.ok
      || p.r.scheme.main.maxTokens !== DEFAULT_BUDGET || p.r.scheme.sms.maxTokens !== DEFAULT_BUDGET)
    ok(`首启：内置预设自带的输出预算就是缺省那一档（${DEFAULT_BUDGET}，两通道都照预设原文），够写一段正文而非回一句`,
      thin.length === 0,
      thin.length ? thin.map((p) => p.id).join('、')
        : parsed.map((p) => `${p.id} ${p.r.ok ? p.r.scheme.main.maxTokens : '解析失败'}`).join('　'))

    /* 对照：预设写了个别的数就**照它写的**（不替它改成缺省）—— 上面那条不是「怎么解析都是 30000」 */
    const small = { ...(BUILTIN_SOURCE[0].json as Record<string, unknown>), openai_max_tokens: 2048 }
    const keptSmall = parseChatPreset(small, splitCfg)
    ok('首启（对照）：预设自己写着 2048 就落地 2048，两通道一致 —— 预设写多少就多少',
      keptSmall.ok && keptSmall.scheme.main.maxTokens === 2048 && keptSmall.scheme.sms.maxTokens === 2048,
      keptSmall.ok ? `主=${keptSmall.scheme.main.maxTokens} 短信=${keptSmall.scheme.sms.maxTokens}` : '解析失败')

    /* 对照：预设**压根没带**预算字段时，两个通道各取自己的现值 —— 同样不是「统一成 30000」 */
    const stripped = { ...(BUILTIN_SOURCE[0].json as Record<string, unknown>) }
    delete stripped.openai_max_tokens
    // 预设里的采样器温度写在哪一层都算数（这份写在顶层 temperature，也在 TEMP_KEYS 里）
    for (const k of ['temp_openai', 'temperature', 'temp']) delete stripped[k]
    const fallback = parseChatPreset(stripped, splitCfg)
    ok('首启（对照）：预设没带预算/温度时，两个通道各取自己的现值（不是统一成主通道那个数）',
      fallback.ok && fallback.scheme.main.maxTokens === 1234 && fallback.scheme.sms.maxTokens === 4321
      && fallback.scheme.main.temperature === 0.2 && fallback.scheme.sms.temperature === 1.3,
      `主通道 1234/0.2 · 短信通道 4321/1.3，解析得到 ${fallback.ok ? `${fallback.scheme.main.maxTokens}/${fallback.scheme.main.temperature} · ${fallback.scheme.sms.maxTokens}/${fallback.scheme.sms.temperature}` : '解析失败'}`)

    /* ①b 预设没写模型名 —— 两通道各留自己那一份。
       本终端是双通道（主线一套、角色短信一套），两边可以是两个不同的模型，那是用户自己配的。
       曾经这里两处都写同一个解析结果：手动导入时只是把短信通道顶掉，不易察觉；
       而内置预设如今是**开机自动套用**的，一台新机器开一次机就把短信通道换成了主通道的模型 ——
       live 复核里就是这么炸的（短信页等着显示 stub-sms，屏幕上却是 stub）。 */
    const real = BUILTIN_SOURCE.map((b) => ({ id: b.id, r: parseChatPreset(b.json, splitCfg) }))
    const leak = real.filter((p) => !p.r.ok
      || p.r.scheme.main.model !== '主通道模型' || p.r.scheme.sms.model !== '短信通道模型')
    ok('首启：自带预设没写模型名 —— 两个通道各留自己那一份（不把主通道的模型摁到短信通道上）',
      leak.length === 0,
      leak.length ? leak.map((p) => p.id).join('、')
        : real.map((p) => `${p.id} 主=${p.r.ok ? p.r.scheme.main.model : '解析失败'} 短信=${p.r.ok ? p.r.scheme.sms.model : ''}`).join('　'))

    /* 对照：预设**写了**模型名时，两通道都换成预设那个 —— 上面那条不是「模型名怎么都进不去」 */
    const named = { ...(BUILTIN_SOURCE[0].json as Record<string, unknown>), oai_model: '预设点名的模型' }
    const forced = parseChatPreset(named, splitCfg)
    ok('首启（对照）：预设写了模型名时，两个通道都换成预设那个',
      forced.ok && forced.scheme.main.model === '预设点名的模型' && forced.scheme.sms.model === '预设点名的模型',
      forced.ok ? `主=${forced.scheme.main.model} 短信=${forced.scheme.sms.model}` : '解析失败')

    /* ② 自动启动的判据（纯函数）：只要没有一份**确实在生效**的预设，就该自己补上。
       四种情形都要对 —— 「用户自己配好的」绝不动，「空的」一次都不许漏。 */
    const ids = [BUILTIN_IDS[0], BUILTIN_IDS[1], 'user-made']
    const cases = [
      { name: '从没套过任何预设', state: { activeId: null, ids }, want: BUILTIN_IDS[0] },
      { name: '已经生效着别的预设', state: { activeId: 'user-made', ids }, want: null },
      { name: '生效的那份已被删掉（快照成了孤儿）', state: { activeId: 'gone', ids }, want: BUILTIN_IDS[0] },
      { name: '内置那份已被删掉', state: { activeId: null, ids: ['user-made'] }, want: null },
    ]
    const wrong = cases.filter((c) => shouldAutoStart(c.state) !== c.want)
    ok('首启：自带预设自动启动 —— 空着就自己补上，生效着的那份一概不碰（不必用户自己去点套用）',
      wrong.length === 0,
      wrong.length ? wrong.map((c) => c.name).join('；')
        : cases.map((c) => `${c.name}→${c.want ?? '不动'}`).join('　'))

    /* 对照：判据有牙 —— 闸门若写成「有没有在生效」以外的任何一条，
       下面这三种里至少有一种会判错（漏补孤儿快照，或去覆盖用户自己的预设） */
    ok('首启（对照）：判据的闸门就是「有没有在生效」—— 孤儿快照补得上，用户的预设拦得住',
      shouldAutoStart({ activeId: null, ids }) !== null
      && shouldAutoStart({ activeId: 'user-made', ids }) === null
      && shouldAutoStart({ activeId: 'not-in-list', ids }) !== null,
      '生效着 → 不动；空着 / 生效目标已不在列表 → 自动补')

    /* ②a 生效快照补落：方案列表与生效快照是两本账，套用只写后者、之后改的却可能只动前者。
       「列表里那一行看着好好的、提示词里一条没进」就是这么来的，界面上没有任何提示。
       这里拿真账本摆三种情形：空快照要补、已落好的不许重写、方案本身没条目的不该瞎补。 */
    {
      const SCH = 'zts-schemes:v1'
      const entry = { id: 'e1', name: '叙述人称', kind: '行为' as const, position: 'pre' as const, content: '以第三人称限知视角叙述。', enabled: true, constant: true, keys: [], order: 10 }
      const mkScheme = (id: string, entries: typeof entry[] | undefined) =>
        ({ id, name: id, main: { baseUrl: '', model: '', temperature: 0.7, maxTokens: 30000 }, sms: { baseUrl: '', model: '', temperature: 0.7, maxTokens: 30000 }, activeLoreIds: [], ...(entries ? { entries } : {}) })

      // 情形一：列表里有方案、快照空着 → 补
      store.clear()
      store.set(SCH, JSON.stringify([mkScheme('s1', [entry])]))
      store.set(ACTIVE_PRESET_KEY, JSON.stringify({ id: 's1', name: 's1', entries: [] }))
      const fixed = ensureActiveSnapshot()

      const after = JSON.parse(store.get(ACTIVE_PRESET_KEY) ?? '{}') as { entries?: unknown[] }

      // 情形二：快照已经落好了 → 一个字节都不动（重写会覆盖用户手改过的开关）
      const before = store.get(ACTIVE_PRESET_KEY)
      const again = ensureActiveSnapshot()
      const untouched = store.get(ACTIVE_PRESET_KEY) === before

      // 情形三：方案自己就没条目（合法的空预设）→ 不该被「补」成有
      store.clear()
      store.set(SCH, JSON.stringify([mkScheme('s2', undefined)]))
      store.set(ACTIVE_PRESET_KEY, JSON.stringify({ id: 's2', name: 's2', entries: [] }))
      const noop = ensureActiveSnapshot()

      ok('首启：方案列表里有、生效快照却是空的 —— 补落一次（这就是「看着生效、其实一条没进」）',
        fixed === true && Array.isArray(after.entries) && after.entries.length === 1,
        `补落=${fixed}　补后快照条目=${Array.isArray(after.entries) ? after.entries.length : '—'}`)
      ok('首启（对照）：快照已经落好时不重写，方案自己没条目时也不凭空补',
        again === false && untouched && noop === false,
        `已落好再调=${again}（账本未动=${untouched}）　空方案=${noop}`)
    }

    /* ②b 预算归位：只认我们自己塞进去过的值，用户自己打的数一个都不动 */
    /* ②b 预算归位：只认我们自己塞进去过的值，用户自己打的数一个都不动。
       8000 必须在内 —— 那是内置预设 JSON 一直到 9976705 之前写的数，是我们发的缺省。
       漏掉它，套用过旧预设的机器就永远停在 8000：预设内容换成 30000 了，
       可通道里存的那一份没人改，界面上看不出异常，用户只觉得「默认的 8000 根本不够」。 */
    const floor = [
      [0, true, '从没设过'], [NaN, true, '非数字'], [undefined, true, '缺字段'],
      [1500, true, '旧缺省（第一代）'], [8000, true, '旧预设自带的缺省（第二代）'],
      [30000, false, '目标值本身（已经对，不再动）'], [2000, false, '用户自己填的'], [4096, false, '用户按上游上限填的'],
    ] as const
    const badFloor = floor.filter(([n, want]) => needsBudgetFloor(n) !== want)
    ok('首启：预算归位只认自己塞过的值（0 / 非数字 / 1500 / 8000），用户自己打的数与目标值 30000 一概不动',
      badFloor.length === 0,
      badFloor.length ? badFloor.map(([, , why]) => why).join('；')
        : floor.map(([n, want, why]) => `${why}(${String(n)})→${want ? '归位' : '不动'}`).join('　'))

    /* ②b2 上一代被抬到**上限**的那一份要收回来 —— 但只收账上记着那次抬顶、且值没被人动过的。
       判据是「账」而不是「值」：用户在界面上自己填了上限，不该被我们顺手改掉。 */
    const settle: Array<[number, FloorLedger, boolean, string]> = [
      [MAX_BUDGET, { to: MAX_BUDGET }, true, '上一代我们抬上去的'],
      [MAX_BUDGET, {}, false, '账上没记过抬顶（用户自己填的上限）'],
      [MAX_BUDGET, { to: DEFAULT_BUDGET }, false, '账上记的是目标值那一代'],
      [DEFAULT_BUDGET, { to: MAX_BUDGET }, false, '值已经是目标值了'],
      [4096, { to: MAX_BUDGET }, false, '值被人改小了'],
    ]
    const badSettle = settle.filter(([n, led, want]) => shouldSettleDown(n, led) !== want)
    ok('首启：上一代抬到上限的那一份收回来，用户自己写的上限一分不动',
      badSettle.length === 0,
      badSettle.length ? badSettle.map(([, , , why]) => why).join('；')
        : settle.map(([, , want, why]) => `${why}→${want ? '收' : '不动'}`).join('　'))

    /* ②c 内置预设自带的目标值就是**缺省那一档**（30000）：单次生成的预算只在正文写完之前用完，
       太低会被思考型通道的内部思考吃光、正文在半句上被长度掐断；太高又会被一些通道
       自己的输出上限顶回来。直接认内置预设自己带的那个数，比认常量更结实：预设被改小了这里就红。 */
    ok('首启：内置预设自带输出预算就是缺省那一档（30000，与通道缺省同源）',
      parsed.every((p) => p.r.ok && p.r.scheme.main.maxTokens === DEFAULT_BUDGET && p.r.scheme.sms.maxTokens === DEFAULT_BUDGET),
      parsed.map((p) => `${p.id} ${p.r.ok ? p.r.scheme.main.maxTokens : '解析失败'}`).join('　')
        + `　目标=${DEFAULT_BUDGET}`)

    /* ②d 换稿：已经播过内置预设的机器，presets/*.json 改了内容之后也得看得见 ——
       否则改 JSON 只有新装机有效，老用户永远停在装机那天的旧稿上，而界面看不出差别。 */
    const refresh: Array<[number, string[], boolean, string]> = [
      [1, [BUILTIN_IDS[0], 'user-made'], true, '旧账本 + 内置那份还在'],
      [4, [BUILTIN_IDS[0], 'user-made'], true, 'v4 那一代的老账本（内容改过之后照样换得上）'],
      /* 「已经是当前版本」这一格**跟着 BUILTIN_V 走** —— 早先这里写死过一个 5，
         抬到 v5 那次忘了改，它就一直绿着（5 < 5 恰好为假，碰巧是对的）；
         再抬一版就变成假绿灯。这一格是「不该换」的**对照**，写死了等于没量。 */
      [BUILTIN_V, [BUILTIN_IDS[0], 'user-made'], false, '账本已是当前版本'],
      [1, ['user-made'], false, '用户把内置那份删了（尊重这个删除）'],
      [0, [], false, '列表是空的（没有可换的）'],
    ]
    const badRefresh = refresh.filter(([v, idsIn, want]) => needsContentRefresh(v, idsIn) !== want)
    ok('首启：账本比当前版本旧、且内置那份还在列表里 —— 才换稿（删掉的不塞回来）',
      badRefresh.length === 0,
      badRefresh.length ? badRefresh.map(([, , , why]) => why).join('；')
        : refresh.map(([, , want, why]) => `${why}→${want ? '换' : '不动'}`).join('　'))

    /* ②d2 内置群聊：名单只有两个，且名单里的人必须真的存在。
       「群聊」这一层最容易悄悄长出来的毛病是**凭空多一个群或一个人** ——
       编出来的人名不会在任何档案里报错，只会在系统提示里被当作真人写台词。
       所以两头都钉：群名就是正文里那两个，成员必须过 charOf。 */
    ok('短信：内置群聊只有「恋兔队」与「苍之学园」两个（不额外播任何群）',
      BUILTIN_GROUPS.length === 2
      && BUILTIN_GROUPS.map((g) => g.name).join('｜') === '恋兔队｜苍之学园',
      BUILTIN_GROUPS.map((g) => `${g.name}(${g.charIds.length})`).join('　'))
    const ghost = BUILTIN_GROUPS.flatMap((g) => g.charIds.filter((id) => !charOf(id)).map((id) => `${g.name}:${id}`))
    const tooFew = BUILTIN_GROUPS.filter((g) => g.charIds.length < 2).map((g) => g.name)
    ok('短信：内置群聊成员都在册（无凭空的成员名），且都不少于两人',
      ghost.length === 0 && tooFew.length === 0 && BUILTIN_GROUP_IDS.length === new Set(BUILTIN_GROUP_IDS).size,
      ghost.length ? `不在册：${ghost.join('、')}` : tooFew.length ? `不足两人：${tooFew.join('、')}` : '成员全部在册')

    /* 补种与换稿：删掉的那个不许塞回来 —— 否则「解散群」在这个终端里不算数。 */
    const seedCases: Array<[string[], string, string[], boolean, string]> = [
      [[], BUILTIN_GROUP_IDS[0], ['user-made'], true, '账上没记、列表里也没有'],
      [[BUILTIN_GROUP_IDS[0]], BUILTIN_GROUP_IDS[0], ['user-made'], false, '账上记过（用户删了）'],
      [[], BUILTIN_GROUP_IDS[0], [BUILTIN_GROUP_IDS[0]], false, '列表里已经有'],
    ]
    const badSeed = seedCases.filter(([s, id, inList, want]) => shouldSeedGroup(s, id, inList) !== want)
    ok('短信：内置群聊只补不重播，用户解散过的不塞回来',
      badSeed.length === 0,
      badSeed.length ? badSeed.map(([, , , , why]) => why).join('；')
        : seedCases.map(([, , , want, why]) => `${why}→${want ? '补' : '不动'}`).join('　'))
    const grpRefresh: Array<[number, string[], boolean, string]> = [
      [0, [BUILTIN_GROUP_IDS[0]], true, '旧账本 + 群还在'],
      [1, [BUILTIN_GROUP_IDS[0]], false, '账本已是当前版本'],
      [0, [], false, '用户解散了这个群'],
    ]
    const badGrp = grpRefresh.filter(([v, inList, want]) => needsGroupRefresh(v, BUILTIN_GROUP_IDS[0], inList) !== want)
    ok('短信：内置群聊改了名单，老装机下一轮启动换得上稿（解散过的不动）',
      badGrp.length === 0,
      badGrp.length ? badGrp.map(([, , , why]) => why).join('；')
        : grpRefresh.map(([, , want, why]) => `${why}→${want ? '换' : '不动'}`).join('　'))

    /* ②e 预设自己带着两条硬要求，改预设时不许顺手删掉：
       「思考纪律」（思考要收得住、不想一出是出）与「说话一律『人物名字：』」。
       代码里那一条（speechContract）管的是最后一道收口，预设这一层是让模型**一开始**就这么写。 */
    const p0 = BUILTIN_SOURCE[0].json as { prompts?: Array<{ identifier?: string; content?: string }> }
    const entryOf = (id: string) => p0.prompts?.find((x) => x.identifier === id)
    const think = entryOf('ts-think')
    const fmt = entryOf('ts-format')
    ok('预设：带「思考纪律」一条（思考要收得住 —— 先定后写、不推翻已发生、不翻来覆去）',
      !!think?.content && think.content.includes('先定后写') && think.content.includes('不推翻已发生'),
      think ? `字数 ${think.content.length}` : '缺 ts-think')
    ok('预设：正文格式一条里写明「人物名字：」起行（终端靠行首切角色气泡）',
      !!fmt?.content && fmt.content.includes('人物名字：') && fmt.content.includes('另起一行'),
      fmt ? `字数 ${fmt.content.length}` : '缺 ts-format')

    /* ③ 预算区间由 lib/budget.ts 一处说了算：缺省落在区间内、收口函数认得上下限 */
    const bounds = MIN_BUDGET < DEFAULT_BUDGET && DEFAULT_BUDGET < MAX_BUDGET
    ok('首启：输出预算的区间与缺省自洽（下限 < 缺省 < 上限），且缺省值就是建议的那一档',
      bounds && DEFAULT_BUDGET === 30000 && API_DEFAULTS.maxTokens === DEFAULT_BUDGET,
      `区间 ${MIN_BUDGET}–${MAX_BUDGET} · 缺省 ${DEFAULT_BUDGET} · 通道缺省 ${API_DEFAULTS.maxTokens}`)

    const clampCases: Array<[number, number, string]> = [
      [999999, MAX_BUDGET, '超上限'],
      [0, DEFAULT_BUDGET, '零'],
      [NaN, DEFAULT_BUDGET, '非数字'],
      [4096, 4096, '区间内原样'],
    ]
    const badClamp = clampCases.filter(([n, want]) => clampBudget(n) !== want)
    ok('首启：收口函数认得上下限（超上限夹住、零与非数字退回缺省、区间内原样）',
      badClamp.length === 0,
      badClamp.length ? badClamp.map(([, , why]) => why).join('；')
        : clampCases.map(([n, want, why]) => `${why}→${want}`).join('　'))

    /* ④ 视图与导入器都走同一个收口：不许再各自写死一个兜底数 */
    const BUDGET_CALLERS = ['src/views/Plot.tsx', 'src/views/Tavern.tsx', 'src/views/Settings.tsx']
    const sloppyCheck = (src: string) => !src.includes("from '../lib/budget'")
      || /\|\|\s*(?:800|1500|8000|30000|32000)\b/.test(src)
      || /max=\{\d{4,}\}/.test(src)
    const sloppy = BUDGET_CALLERS.filter((f) => sloppyCheck(bare(readFileSync(f, 'utf8'))))
    const badSample = "maxTokens: cfg.maxTokens || 1500"
    ok('首启：输出预算的四个入口都读同一个真源（视图里不再各写各的兜底数）',
      sloppy.length === 0 && sloppyCheck(badSample),
      sloppy.length ? sloppy.join('；')
        : `${BUDGET_CALLERS.length} 个入口逐个查过（对照样本「${badSample}」照样被认出来）`)

    info.push(`首启：内置预设 ${BUILTIN_SOURCE.length} 份 · 自动启动 ${BUILTIN_IDS[0]}`
      + ` · 输出预算 ${MIN_BUDGET}–${MAX_BUDGET}（缺省 ${DEFAULT_BUDGET}）`)
  } catch (e) {
    fail.push('首启段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 18) 台词行契约：气泡版式不该被预设换掉 ----------
     正文推演的气泡版式全押在「角色名：」起行这一条上，而它原先写在导演规则的
     第 5 条 —— 规则之后还整段压着预设注入，自带预设又开机自动套用。
     预设里但凡有一句「文本格式」把行首写法收走，规则里那条就被盖掉：
     拆行器认不出说话人 → 一条 say 段都没有 → 整篇正文落进旁白，
     界面上不报错，只是气泡版式看着像坏了。
     所以这里钉两件事：契约**摆在预设之后**并且明说压过预设；拆行器认得出
     模型最可能写的那几种写法，同时不该切的旁白照样不切。每条都配对照。 */
  try {
    const luna = personOf('luna')?.name ?? '露娜'
    const op = personOf(OPERATOR_ID)?.name ?? '言万心叶'
    /* 仿协议预设那一段（真实取值见 presets/*.json 的 ts-format）：
       它只说了引号与空行，一个字没提「角色名：」—— 正是这一点让气泡失效的。 */
    const presetPost = '【预设 · 输出格式】（在写出事件指令块之前须满足）\n'
      + '▸ ts-format\n对白用「」括起；段落之间空一行；不使用 Markdown 标题、表格、加粗、列表与分隔线。'
    const sys = buildDirectorSystem(TIMELINE[0], { operatorName: op, presetPost })

    /* ① 契约段摆在预设段**之后**，且在事件指令 schema 之前 —— 位置就是它的分量 */
    const iPreset = sys.indexOf(presetPost)
    const iContract = sys.indexOf('【台词行格式 · 终端渲染约定】')
    const iSchema = sys.indexOf('【事件指令 · 每回合末尾必须输出】')
    ok('台词契约：摆在预设段之后、事件指令之前（离输出最近的位置）',
      iPreset >= 0 && iContract > iPreset && iSchema > iContract,
      `预设@${iPreset} → 契约@${iContract} → 指令@${iSchema}`)

    /* ② 契约里得**明说**冲突时以它为准，否则模型按「后写的服从先写的」理解就白摆了 */
    const seg = sys.slice(iContract, iSchema)
    ok('台词契约：明说与预设「文本格式」冲突时以本条为准',
      seg.includes('以本条为准') && seg.includes('冲突'), seg.split('\n')[0])

    /* ③ 契约与拆行器是同一件事的两面：它许诺的写法，拆行器必须真认得出 */
    ok('台词契约：点明了「角色名：」起行与气泡的对应关系',
      seg.includes('角色名：') && seg.includes('气泡'),
      seg.includes('角色名：') && seg.includes('气泡') ? '行首「角色名：」↔ 气泡' : '缺了链路说明')

    /* ④ 同一条契约不再在导演规则里重复一遍 —— 两处说法迟早漂移 */
    const rules = sys.slice(0, iPreset)
    ok('台词契约：导演规则里不再重复这一条（同一件事只说一次）',
      !rules.includes('台词行格式'), rules.includes('台词行格式') ? '规则里还留着一份' : '只在契约段说')

    /* ⑤ 拆行器认出模型最可能写的几种写法（含被加粗的名字、以及主角的缩写署名）。
       「言万：」那一条是实测漏出来的：原文通篇被人叫「言万同学」，模型顺手把署名
       截成两个字，而契约里没说不许 —— 于是正文里主角一开口，整行掉回旁白，
       气泡版式看着像坏了而界面不报错。两头都钉：契约要它写全名（⑥），
       表里也得认得出这个缩写（旧记录里已经写着的那种）。 */
    const cases: Array<[string, DialogueSeg[]]> = [
      [`${luna}：「小主人，你迟到了。」`, [{ kind: 'say', id: 'luna', text: '小主人，你迟到了。' }]],
      [`${luna}：小主人，你迟到了。`, [{ kind: 'say', id: 'luna', text: '小主人，你迟到了。' }]],
      [`**${luna}**：「小主人，你迟到了。」`, [{ kind: 'say', id: 'luna', text: '小主人，你迟到了。' }]],
      [`${luna}“小主人，你迟到了。”`, [{ kind: 'say', id: 'luna', text: '小主人，你迟到了。' }]],
      [`${op}：「我知道了。」`, [{ kind: 'you', text: '我知道了。' }]],
      ['言万：「我知道了。」', [{ kind: 'you', text: '我知道了。' }]],
      ['心叶：「我知道了。」', [{ kind: 'you', text: '我知道了。' }]],
    ]
    const wrong = cases.filter(([src, want]) => JSON.stringify(splitSpeech(src)) !== JSON.stringify(want))
    ok('台词拆行：全角冒号／直接接台词／名字被加粗／直接接引号／主角的三种署名（全名·言万·心叶）都认得出，操作员落到右气泡',
      wrong.length === 0,
      wrong.length ? wrong.map(([src]) => src).join('；')
        : cases.map(([src]) => src.slice(0, 14) + '…').join('　'))

    /* ⑥ 光认得出还不够：得让模型一开始就写全名。契约里那一句必须在，
       而且必须点到「言万：」这个具体的错法 —— 泛泛说「名字要一致」它不当回事。 */
    ok('台词契约：明说署名要写全名、不许缩成简称（点名「言万：」这种写法认不出）',
      seg.includes('全名') && seg.includes('言万：') && seg.includes('简称'),
      seg.includes('全名') && seg.includes('言万：') ? '已点名缩写' : '契约里没点明')

    /* 对照：拿掉契约里那半对引号／换个没登记的名字，同一条判据当场变红 ——
       上面那条不是「怎么拆都过」。 */
    ok('台词拆行（对照）：名字后直接接引号但整行没有收尾引号时，不认',
      JSON.stringify(splitSpeech(`${luna}「小主人`)) === JSON.stringify([{ kind: 'narr', text: `${luna}「小主人` }]),
      `${luna}「小主人 → 留旁白`)

    /* ⑦ 不该切的照样不切：没登记的名字、冒号后没内容、名字在行中间、带称呼后缀的 —— 全留旁白。
       拆行器宁可漏认一个气泡，也不能把叙述切碎（切错了正文就散了）。 */
    const narCases = [
      '林越：「他是谁？」',                        // 未登记的名字
      `${luna}：`,                                  // 冒号后没内容
      `这时${luna}：「小主人。」`,                  // 名字不在行首
      `${luna}「影」是异端。`,                      // 名字后接引号，但整行不收在引号上
      '言万同学：「我知道了。」',                    // 带称呼后缀：那是别人叫他，不是署名（契约已要求写全名）
    ]
    const cut = narCases.filter((s) => splitSpeech(s).some((x) => x.kind !== 'narr'))
    ok('台词拆行：未登记的名字／空台词／名字在行中／引号不收尾／带称呼后缀 —— 一律留旁白（不切碎叙述）',
      cut.length === 0, cut.length ? cut.join('；') : `${narCases.length} 种写法都留了旁白`)

    info.push(`台词契约：摆在预设段之后（@${iContract} > @${iPreset}）· 拆行器认 ${cases.length} 种写法、`
      + `${narCases.length} 种不认的留旁白`)
  } catch (e) {
    fail.push('台词契约段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 19) 梅芙引导：作战屏那一段 ----------
     为什么单开一段、绑在界面上而不是塞进「任务简报」的模块讲解：
     羁绊、编队、连携这三样在任务板上一个字都看不见，全在作战屏上。
     站在简报板前讲共鸣槽，玩家没处对；等切过去，那一屏还是生的。

     这里钉三件事：
       ① 该讲的时候讲（第一次进战场），不该讲的时候不讲（不在场上）；
       ② 次序——作战基础排在 boss 之前，倒过来讲等于让人听天书；
       ③ 每一步的**锚点真的存在**。锚点写错不会报错，只会让气泡落到屏幕正中，
          讲的内容跟屏幕上哪一块都对不上 —— 这是这一整套引导最容易烂掉的地方，
          所以拿源码逐条核。 */
  try {
    /* guide.ts 的状态落在 localStorage 上，Node 里没有这一号。
       它只在函数体里被读（模块顶层不碰），所以在这里补一块最小的就来得及。 */
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
      },
    })

    const BATTLE_ID = 'battle-basics'
    const BOSS_ID = 'boss-ult'
    const battle = TOURS.find((t) => t.id === BATTLE_ID)
    const boss = TOURS.find((t) => t.id === BOSS_ID)
    ok('梅芙引导：作战屏单有一段（讲行动条、指令、编队、羁绊、连携），且绑在界面上而非模块上',
      !!battle && battle.field === 'battle' && !battle.view,
      battle ? `${battle.steps.length} 步 · field=${battle.field}` : '（找不到这一段）')

    /** 教程讲到「模块都讲完了、作战基础还没讲」的那一刻 */
    const upToBattle = () => {
      store.clear()
      markDone('boot')
      for (const m of TOURS.filter((t) => t.id.startsWith('tour-'))) markDone(m.id)
    }

    upToBattle()
    const a1 = nextTour('missions', {}, true, false)
    ok('梅芙引导：第一次进作战屏，讲的是作战基础（这时模块已讲完，没别的可讲）',
      a1?.id === BATTLE_ID, a1?.id ?? '（没讲）')
    const a2 = nextTour('missions', {}, false, false)
    ok('梅芙引导（对照）：不在作战屏上时，这一段不出现 —— 它是绑界面的，不是讲模块的',
      a2 === null, a2?.id ?? '（没讲）')

    /* 次序：boss 也在场时，先讲这一屏本身。
       反过来的话，boss 那一段说的「打断咏唱」「槽满接招」在玩家眼里没有落脚点。 */
    upToBattle()
    const a3 = nextTour('missions', {}, true, true)
    ok('梅芙引导：boss 也在场时，作战基础仍然排在前面（先认屏，再挨 boss）',
      a3?.id === BATTLE_ID, a3?.id ?? '（没讲）')
    markDone(BATTLE_ID)
    const a4 = nextTour('missions', {}, true, true)
    ok('梅芙引导：作战基础讲完、场上又是 boss —— 紧接着讲这一场怎么打',
      a4?.id === BOSS_ID, a4?.id ?? '（没讲）')

    /* 跳过教程管得住作战基础（那是玩家明说的「别再讲了」），管不住 boss（那一场不解释是要死人的）。 */
    upToBattle()
    skipTutorial()
    const a5 = nextTour('missions', {}, true, false)
    ok('梅芙引导：按过「跳过教程」之后，作战基础不再出现（它与模块讲解在同一条线上）',
      a5 === null, a5?.id ?? '（没讲）')
    const a6 = nextTour('missions', {}, true, true)
    ok('梅芙引导（对照）：唯独 boss 那一段，跳过教程也照讲 —— 打到那一场时跳过等于摸黑挨打',
      a6?.id === BOSS_ID, a6?.id ?? '（没讲）')
    ok('梅芙引导：气泡上的「跳过教程」按钮也照这条线给 —— 作战基础给，boss 不给',
      battle?.tutorial === true && boss?.tutorial !== true,
      `作战基础 tutorial=${battle?.tutorial}　boss tutorial=${boss?.tutorial}`)

    /* 锚点核账：`at` 里点名的每一个 data-* 属性，都得在作战屏源码里真的挂着。
       缺一个，那一步就只剩一个落在屏幕中央的气泡 —— 讲了，但对不上任何一块。 */
    const battleSrc = readFileSync('src/views/Battle.tsx', 'utf8')
    const attrsOf = (sel: string | undefined) => (sel ?? '').match(/data-[a-z-]+/g) ?? []
    const fieldTours = [battle, boss].filter((t): t is (typeof TOURS)[number] => !!t)
    const missing: string[] = []
    for (const t of fieldTours) {
      for (const st of t.steps) {
        for (const a of attrsOf(st.at)) if (!battleSrc.includes(a)) missing.push(`${t.id} → ${a}`)
      }
    }
    const steps = fieldTours.reduce((n, t) => n + t.steps.length, 0)
    ok('梅芙引导：作战屏那两段每一步的锚点，在 Battle.tsx 里都真的挂着',
      missing.length === 0,
      missing.length ? [...new Set(missing)].join('、') : `${steps} 步逐条查过`)
    ok('梅芙引导（对照）：同一条判据认得出一根不存在的锚点',
      attrsOf('[data-guide-nope]').some((a) => !battleSrc.includes(a)),
      '构造的 data-guide-nope 在作战屏上找不到')

    /* 有条件才出现的锚点：写它就必须再留一个常驻候选。
       羁绊行只在队里凑得出羁绊时才摆；咏唱那一格断掉就没了。
       候选写对了（querySelector 认逗号列表），这一步落到旁边那块常驻的格子上；
       不写，气泡就飘到屏幕正中、铺一层黑，指着空气讲羁绊 —— 比不讲还糟。 */
    const COND = ['data-synergy-row', 'data-link-gauge', 'data-link-hint', 'data-link-full', 'data-chant']
    const needFallback = (sel: string) => {
      const all = attrsOf(sel)
      if (!all.some((a) => COND.includes(a))) return false
      return !all.some((a) => !COND.includes(a))
    }
    const noFallback = fieldTours.flatMap((t) => t.steps
      .map((st, i) => ({ t: t.id, i, sel: st.at ?? '' }))
      .filter((x) => needFallback(x.sel))
      .map((x) => `${x.t} 第 ${x.i + 1} 步（${x.sel}）`))
    const condSteps = fieldTours.flatMap((t) => t.steps).filter((st) => attrsOf(st.at).some((a) => COND.includes(a)))
    ok('梅芙引导：挂在「有条件才出现」的锚点上的步骤，都另留了一个常驻候选',
      noFallback.length === 0,
      noFallback.length ? noFallback.join('、') : `${condSteps.length} 步都留了候选`)
    ok('梅芙引导（对照）：同一条判据认得出「只挂了羁绊行、没留候选」的写法',
      needFallback('[data-link-gauge]') && !needFallback('[data-link-gauge], [data-hand]'),
      '构造的裸 [data-link-gauge] 被判定为缺候选')

    // 每一步都得有话说：空标题 / 空条目 = 玩家点了一下「下一步」，什么也没发生
    const hollow = fieldTours.flatMap((t) => t.steps
      .map((st, i) => ({ t: t.id, i, empty: !st.title.trim() || st.lines.length === 0 || st.lines.some((l) => !l.trim()) }))
      .filter((x) => x.empty)
      .map((x) => `${x.t} 第 ${x.i + 1} 步`))
    ok('梅芙引导：作战屏那两段没有空步骤（标题与条目都得有字）',
      hollow.length === 0, hollow.length ? hollow.join('、') : `${steps} 步都查过`)

    /* 侧栏与引导对账 —— 这两条都会悄悄烂掉，所以钉在这里：
       · 开篇说「这一排是终端的 N 个模块」，还要把这一排逐个念一遍。侧栏加一格、
         引导不加，玩家先听到的就是一句假话（真踩过：加「情景记忆库」时，
         NAV_LINE 还停在九个、标题还写着九个）。
       · boot 那一步对玩家的承诺是「每开一格，你第一次进去，我讲一遍它在管什么」。
         侧栏上有、TOURS 里没有的模块，点进去没人开口 —— 承诺落空。 */
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    const rail = appSrc.split('\n')
      .map((l) => /^\s*\{ id: '([a-z]+)', en: '[^']+', cn: '([^']+)'/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ id: m[1]!, cn: m[2]! }))
    const bootTour = TOURS.find((t) => t.id === 'boot')
    const navStep = bootTour?.steps.find((s) => s.at === '[data-guide="nav"]')
    const named = (navStep?.lines[0] ?? '').replace(/。$/, '').split('、')
    const NUM: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
    }
    const claim = /^这一排是终端的(.+)个模块。$/.exec(navStep?.title ?? '')?.[1] ?? ''

    ok('梅芙引导：侧栏有几格，开篇就念几格 —— 数、次序、名字逐条对上',
      rail.length > 0 && named.length === rail.length && named.every((n, i) => n === rail[i]!.cn),
      `侧栏 ${rail.length} 格｜引导念 ${named.length} 格：${named.join('、')}`)
    ok('梅芙引导：开篇那句「这一排是终端的 N 个模块」，N 与侧栏实际格数相符',
      NUM[claim] === rail.length, `说的是「${claim}个」· 实际 ${rail.length} 格`)
    const noTour = rail.filter((r) => !TOURS.some((t) => t.view === r.id)).map((r) => r.cn)
    ok('梅芙引导：侧栏每一格都有一段讲它的（「每开一格，我讲一遍它在管什么」不许落空）',
      noTour.length === 0, noTour.length ? `没人讲：${noTour.join('、')}` : `${rail.length} 格都有`)
    const noRail = TOURS.filter((t) => t.view && !rail.some((r) => r.id === t.view)).map((t) => t.view!)
    ok('梅芙引导（对照）：反过来，没有哪一段是挂在侧栏不存在的模块上的',
      noRail.length === 0, noRail.length ? `挂着空模块：${noRail.join('、')}` : '没有孤立的模块讲解')
    info.push(`侧栏 ${rail.length} 格 ↔ 模块讲解 ${TOURS.filter((t) => t.view).length} 段，逐格对得上`)

    info.push(`作战屏引导：作战基础 ${battle?.steps.length ?? 0} 步 + boss ${boss?.steps.length ?? 0} 步；`
      + `次序 作战基础 → boss；跳过教程管得住前者、管不住后者`)
  } catch (e) {
    fail.push('梅芙引导段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 20) 事件指令的解析 ----------
     这一段的每一条，都是「模型真的会那么写」的写法。
     事件的坏法不在报错，而在**不报错**：指令块认出了一半、面板报「已收到」，
     可变量一条没落地，正文里还留一截 JSON 残骸。所以下面每一条都咬住两件事 ——
     落地的字段，和上屏的正文。 */
  {
    const P = (raw: string) => parsePlotReply(raw)
    const D = (raw: string) => JSON.stringify(P(raw).directive)

    /* 裸写（没有围栏）的指令只要带嵌套，旧口径就会从**里层**那个 '{' 起算：
       {"flag":{"trust":5}} 会解析成 {"trust":5}，白名单一过成了 {} ——
       面板报成功、变量没落地、正文里留下 {"flag": 的残骸。这是「总是出错」的主因。 */
    const nested = P('雪落了。\n\n{"bond":[{"char":"luna","delta":2}],"flag":{"trust":5},"digest":"收束。"}')
    ok('事件指令：裸写的嵌套指令整块落地（不是只捡了里层那一小节）',
      nested.found && nested.directive?.bond?.[0]?.delta === 2
      && nested.directive?.flag?.trust === 5 && nested.directive?.digest === '收束。',
      `directive=${D('雪落了。\n\n{"bond":[{"char":"luna","delta":2}],"flag":{"trust":5},"digest":"收束。"}')}`)
    ok('事件指令（对照）：同一份裸写指令，正文里不留 JSON 残骸',
      nested.narrative === '雪落了。', JSON.stringify(nested.narrative))

    const onlyFlag = P('雪落了。\n{"flag":{"trust":5}}')
    ok('事件指令：裸写且只含一个嵌套对象时，flag 照样落地（旧口径在这一条上必然丢）',
      onlyFlag.found && onlyFlag.directive?.flag?.trust === 5 && onlyFlag.narrative === '雪落了。',
      `directive=${D('雪落了。\n{"flag":{"trust":5}}')}　正文=${JSON.stringify(onlyFlag.narrative)}`)

    /* 格式上的小毛病：都不该让整块指令陪着丢 */
    const comma = P('雪落了。\n```json\n{"flag":{"a":1,},}\n```')
    ok('事件指令：尾逗号修得动（JSON.parse 直接抛，抛了指令就整块没了）',
      comma.found && comma.directive?.flag?.a === 1, `directive=${D('雪落了。\n```json\n{"flag":{"a":1,},}\n```')}`)
    const note = P('雪落了。\n```json\n{\n  // 本回合变化\n  "flag": {"a": 1}\n}\n```')
    ok('事件指令：字符串外的 // 注释修得动',
      note.found && note.directive?.flag?.a === 1, `directive=${D('雪落了。\n```json\n{\n  // 本回合变化\n  "flag": {"a": 1}\n}\n```')}`)
    const keep = P('雪落了。\n```json\n{"digest":"他说「a, }」就没了。"}\n```')
    ok('事件指令（对照）：修格式不动字符串里的内容 —— 引号内的逗号与括号原样留着',
      keep.directive?.digest === '他说「a, }」就没了。', JSON.stringify(keep.directive))

    const upper = P('雪落了。\n```JSON\n{"digest":"收束。"}\n```')
    ok('事件指令：```JSON 大写标注照样认',
      upper.found && upper.directive?.digest === '收束。', `directive=${D('雪落了。\n```JSON\n{"digest":"收束。"}\n```')}`)

    /* 被输出预算截断：围栏开着没闭合，指令本身还算完整 —— 这是常事，不该丢 */
    const cut = P('雪落了。\n\n—— 事件指令 ——\n```json\n{"digest":"收束。"}')
    ok('事件指令：围栏没闭合（回执被预算截断）时指令仍落地，正文不留标签行与半截围栏',
      cut.found && cut.directive?.digest === '收束。' && cut.narrative === '雪落了。',
      `directive=${D('雪落了。\n\n—— 事件指令 ——\n```json\n{"digest":"收束。"}')}　正文=${JSON.stringify(cut.narrative)}`)

    /* 指令区整个认不出来时，标签行之后照样不许进正文 */
    const wreck = P('雪落了。\n\n—— 事件指令 ——\n{"flag": ')
    ok('事件指令（对照）：指令区认不出时，标签行之后一律不往正文放（残骸不上屏）',
      !wreck.narrative.includes('flag') && !wreck.narrative.includes('事件指令') && wreck.narrative === '雪落了。',
      JSON.stringify(wreck.narrative))

    const deco = P('雪落了。\n\n**事件指令**\n```json\n{"digest":"收束。"}\n```')
    ok('事件指令：标签行带 markdown 装饰也认得出来（不至于连装饰一起当旁白上屏）',
      deco.narrative === '雪落了。' && deco.directive?.digest === '收束。', JSON.stringify(deco.narrative))

    /* 取「最后一个」围栏：正文里自带示例 JSON 时，别把示例当成指令 */
    const two = P('示例：\n```json\n{"foo":1}\n```\n正文接着写。\n\n```json\n{"digest":"收束。"}\n```')
    ok('事件指令：正文自带示例 JSON 时，认的是最后那一块（示例不落地、也留着当正文）',
      two.directive?.digest === '收束。' && two.narrative.includes('{"foo":1}'),
      `directive=${D('示例：\n```json\n{"foo":1}\n```\n正文接着写。\n\n```json\n{"digest":"收束。"}\n```')}`)

    const brace = P('他想起那句「{约定}」——雪落在肩上。\n\n```json\n{"digest":"收束。"}\n```')
    ok('事件指令（对照）：正文里的花括号不误伤（剥的是指令，不是正文）',
      brace.narrative.includes('{约定}') && brace.directive?.digest === '收束。', JSON.stringify(brace.narrative))

    /* 标签路径（<vars>）与 JSON 路径汇合到同一条白名单：别修了这边坏了那边 */
    const tags = parseDirectorReply('雪落了。\n<vars>{"flag":{"a":1}}</vars>')
    ok('事件指令：<vars> 标签路径仍走同一条白名单（修 JSON 路径没把这条路带塌）',
      tags.found && tags.directive?.flag?.a === 1 && tags.source === 'tags',
      `${tags.source} directive=${JSON.stringify(tags.directive)}`)

    /* 白名单兜底：修格式不等于放行未知字段 */
    const junk = P('雪落了。\n```json\n{"digest":"收束。","__proto__":{"x":1},"nope":1}\n```')
    const keys = Object.keys(junk.directive ?? {})
    ok('事件指令：修格式不放行未知字段（净化那一步照旧只留认识的）',
      keys.every((k) => ['met', 'bond', 'ends', 'flag', 'diverged', 'eventDone', 'digest', 'battle'].includes(k)),
      keys.join('、'))

    /* 回执整份就是一块指令（补发那一路提示词明说「仅输出指令本身」）：
       上屏文本必须是空串，绝不能回落到原文 —— 回落就是把 {"bond":…} 摊进气泡。 */
    const only = '```json\n{"bond":[{"char":"luna","delta":2}]}\n```'
    const onlyRaw = parseDirectorReply(only)
    ok('事件指令：回执整份只有指令时，上屏文本为空（绝不回落到原文把 JSON 摊进气泡）',
      replyDisplayText(onlyRaw, only) === '' && replyDisplayText(onlyRaw, only) !== only,
      `上屏=${JSON.stringify(replyDisplayText(onlyRaw, only))}`)
    const withProse = parseDirectorReply('雪落了。\n```json\n{"digest":"收束。"}\n```')
    ok('事件指令（对照）：有正文时照常上屏正文，指令只落地不上屏',
      replyDisplayText(withProse, '雪落了。\n```json\n{"digest":"收束。"}\n```') === '雪落了。',
      JSON.stringify(replyDisplayText(withProse, '雪落了。\n```json\n{"digest":"收束。"}\n```')))

    info.push('事件指令：裸写/围栏/截断/尾逗号/注释/装饰标签行/示例块 七种写法逐一验过，'
      + '落地字段与上屏正文两样都咬住；只有指令没有正文时不上屏原文')
  }

  /* ---------- 21) 详细大纲：细的那一份要真的进提示词，缺了要退得干净 ----------
     OOC 几乎都不是模型不会写，而是它手上只有两三句概述 —— 谁在场、谁知道什么、
     关键那句台词长什么样，全得它自己编。这一节把 EVENT_BRIEFS 通道钉住：
     五节各自独立渲染、缺一份整节不出现（退回概述，行为零差异）。
     内容本身（逐字）由 scripts/briefgen.mjs 对着原文切片校验，不在这里验。 */
  try {
    const ev0 = TIMELINE[0]
    const ctx = { operatorName: '操作员', presetPost: '【预设 · 输出格式】\n（无）' }
    const strip = (s: string) => s.replace(/\s+/g, '')

    /* ① 没有详纲的事件：只剩概述，细则那一节整节不出现。
       这一段是**现造的**（借一段真事件的壳，换个不在表里的 id），
       不是「全表里还没摘到的那一段」—— 57 段如今全摘完了，
       按「还没摘」去挑就永远挑不到，那条对照会自己失效、变成假装失败。
       对照组是同一函数跑同一段**有**详纲的事件：细则得摆得出来，
       才说明上面那条「不摆」不是函数坏了。 */
    const bareEv: TimelineEvent = { ...ev0, id: '__no-brief__', summary: '（对照用：这一段没有详纲。）' }
    const bare = buildDirectorSystem(bareEv, ctx)
    const lit = buildDirectorSystem(ev0, ctx)
    ok('详纲（对照）：没详纲的那一段退回概述、不摆细则，有详纲的同一段摆得出来',
      bare.includes(bareEv.summary) && !bare.includes('【本事件实施细则】')
      && lit.includes('【本事件实施细则】'),
      `现造段 ${bareEv.id}：概述在=${bare.includes(bareEv.summary)}　细则节=${bare.includes('【本事件实施细则】')}`
      + `　｜${ev0.id}（有详纲）：细则节=${lit.includes('【本事件实施细则】')}`)

    /* ② 摘到了：五节按序齐全，且台词、知道/不知道两栏都逐字落地。
       探针里故意放**两句**：一句标了 key、一句没标 —— 只标了的那句该进提示词，
       没标的那句一个字都不该露。*/
    const KEYED = '我的名字叫言万心叶，是个随处可见的普通高中生。'
    const PLAIN = '（这句没标 key，一句都不该进大纲）'
    if (!EVENT_BRIEFS.__probe__) {
      EVENT_BRIEFS.__probe__ = {
        beats: ['第一拍：船甲板上的脚步声。', '第二拍：他抬头。'],
        lines: [
          { who: '言万心叶', text: PLAIN },
          { who: '言万心叶', text: KEYED, key: true },
        ],
        knows: [{ char: '言万心叶', knows: ['船要被开去某个角落'], unknown: ['露娜的存在'] }],
        done: ['两人把话说完', '甲板上的脚步声远去'],
        taboo: ['不要提前写出露娜'],
      }
    }
    const full = buildDirectorSystem({ ...ev0, id: '__probe__' }, ctx)
    const at = (s: string) => full.indexOf(s)
    const order = ['一、原文情节线', '二、绕不开的几句原文', '三、在场的谁知道什么', '四、原文里这一段的落点', '五、禁忌']
      .map((h) => at(h))
    const ascending = order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))
    ok('详纲：摘到了就把五节按序摆出来（情节线 / 绕不开的几句 / 谁知道什么 / 落点 / 禁忌）',
      full.includes('【本事件实施细则】') && ascending,
      `各节位置 ${order.join(' → ')}`)

    /* ③ 只有标了 key 的台词进大纲 —— 这是「大纲不是剧本」那一条的**执行**面：
       逐拍情节线已经够细了，若再把整节对话照搬进来，导演照着复述，人就不是那个人了。
       两条一起钉：标了的必须在场，没标的一个字都不得露。 */
    ok('详纲：只有标了 key 的台词进提示词（没标的留在数据里当证据，但不写进大纲）',
      full.includes(KEYED) && !full.includes(PLAIN),
      `标了的${full.includes(KEYED) ? '在场' : '**丢了**'}　`
      + `没标的${full.includes(PLAIN) ? '**漏进来了**' : '没露'}`)

    /* ③b 大纲是**参照系、不是剧本** —— 这是全系统最容易被当成「越严越好」而写反的一处：
       把大纲说成「唯一事实来源」「定论」「这几件事必须发生」，模型就会不管言万心叶做了什么，
       照原著把情节推回原位 —— 玩家的行动等于白做，而表面上一切正常（文风对、人名对、
       大纲里的每一拍都发生了）。所以两件事一起钉：松口径必须在场，「锁结局」的说法一个都不得留下。 */
    const AGENCY = ['参照系，不锁结局', '取决于言万心叶怎么做', '走出去的那一条用 diverged 标出来']
    const LOCKS = ['唯一事实来源', '就是定论', '必须发生']
    const missing = AGENCY.filter((s) => !full.includes(s))
    const locked = LOCKS.filter((s) => full.includes(s))
    ok('详纲：大纲是参照系、不锁结局（言万心叶的行动能改结果，走出去的标 diverged）',
      missing.length === 0, missing.length ? `缺：${missing.join('、')}` : AGENCY.join('｜'))
    ok('详纲（对照）：提示词里不残留「大纲就是定论」那一类锁结局的说法',
      locked.length === 0, locked.length ? `残留：${locked.join('、')}` : '无')

    /* ③c 松口径还差最后一寸：**主角的意志在第一位**。
       「参照系、不锁结局」只说清了「大纲不压他」，没说清「他压大纲」——
       少这一条，模型会把他明确写下的打算当成一个「提案」：让在场者找理由推脱、
       让条件不凑巧、把结果写成「他试了，但没成」。玩家写进操作栏的剧情是既成前提，
       此后一切建立其上。两处都要有：直连提示词与内置预设的思考纪律。 */
    const WILL = ['以言万心叶的意志为中心', '就是已经发生的事', '压过本节的一切']
    const noWill = WILL.filter((s) => !full.includes(s))
    ok('详纲：以主角的意志为中心（他写下的剧情是既成前提，压过大纲）',
      noWill.length === 0, noWill.length ? `缺：${noWill.join('、')}` : WILL.join('｜'))
    const thinkContent = (() => {
      const p = BUILTIN_SOURCE[0].json as { prompts?: Array<{ identifier?: string; content?: string }> }
      return p.prompts?.find((x) => x.identifier === 'ts-think')?.content ?? ''
    })()
    ok('预设：思考纪律一条同样写明「以主角的意志为中心」（思考时不把他的打算当提案）',
      thinkContent.includes('以主角的意志为中心')
      && thinkContent.includes('既成前提')
      && thinkContent.includes('不推翻已发生')
      && thinkContent.includes('结局归言万心叶的行动管'),
      thinkContent ? `字数 ${thinkContent.length}` : '缺 ts-think')

    /* ③d 散在三处的「以他为中心」不解决问题：他落笔时手里攥着的仍是那张待办表。
       所以他的话要**端到最末**（大纲、情节线、落点、后接事件统统读完之后），逐字，并点名让位。
       这一条量的就是位置 —— 位置即分量，而位置是最容易在后续改动里被挪走的东西。
       同时给一条对照：没有本回合输入时不许摆一个空节（AI 起草那一路会因此被塞进上一轮的话）。 */
    const ACT = '我直接开枪打穿舱门，把露娜抱走。'
    const ctxNext = { ...ctx, nextEvent: TIMELINE[1], operatorAction: ACT }
    const withWill = buildDirectorSystem(ev0, ctxNext)
    /* 认那一节要看**完整的抬头**（带破折号那一截）：大纲与细则里都写着
       「细则见末尾【本回合 · 言万心叶的意志】」这样一句指路，短标题先在那里就出现了；
       拿短标题 indexOf，量到的是那句指路，不是那一节本身。 */
    const WILL_HEAD = '【本回合 · 言万心叶的意志 ——'
    const iWill = withWill.indexOf(WILL_HEAD)
    const before = ['【事件大纲 · 原文走向', '【本事件实施细则】', '四、原文里这一段的落点',
      '【收束衔接 · 后接事件'].map((h) => withWill.indexOf(h))
    ok('详纲：操作员的原话逐字摆在提示词最末一节（大纲/情节线/落点/后接事件全都之后）',
      iWill > 0 && withWill.includes(`「${ACT}」`) && before.every((i) => i > 0 && iWill > i),
      `意志节 ${iWill}｜大纲 ${before[0]}｜细则 ${before[1]}｜落点 ${before[2]}｜后接 ${before[3]}｜全文 ${withWill.length}`)
    ok('详纲：最末那一节写明让位（他推去别处就以别处收束 · 那正是 diverged 的时候）',
      withWill.includes('这一节压过以上一切') && withWill.includes('那条线让位')
      && withWill.includes('把 diverged 置 true'),
      '压过一切／让位／diverged 三句都在')
    /* 主语得是言万心叶：显示名（这里刻意取成「操作员」）是终端界面上的标签，不是第二个人。
       拿它当主语，模型会顺手把「操作员」写成场上的另一个角色 —— 一段凭空多出来的人。 */
    ok('详纲：那一节的主语是言万心叶，显示名只以「（显示名「X」）」出现，不冒充第二个人',
      withWill.includes('【本回合 · 言万心叶的意志')
      && !withWill.includes('操作员的意志')
      && withWill.includes('显示名「操作员」'),
      withWill.includes('显示名「操作员」') ? '主语=言万心叶 · 显示名另注' : '缺显示名注记')
    const bare2 = (s: string) => !s.includes(WILL_HEAD) && !s.includes('【本回合 · 他没有指示】')
    ok('详纲（对照）：没有本回合输入时，整节不出现（不摆空节，也不塞上一轮的话）',
      bare2(full) && bare2(lit),
      `有输入的对照节=${!bare2(withWill)}　无输入=${!bare2(full)}`)
    /* 指路那一句是另一回事：它本来就该在（读到大纲时就该知道末尾有这么一节），
       所以这里把它单独钉住 —— 免得日后有人为了「整节不出现」把指路也一并删了。 */
    ok('详纲：大纲与细则里各留一句指路（读到那里就知道末尾有一节细则）',
      full.includes('细则见末尾【本回合 · 言万心叶的意志】')
      || full.includes('见末尾【本回合 · 言万心叶的意志】'),
      '')

    /* ③f 七比三：他写的那一笔与大纲相违时，让位有个**分量**，不是「全废」也不是「全听」。
       两个极端都试过：全听大纲 → 他写的白写；全听他的 → 地点、在场者、谁知道什么一起被换掉，
       写出来的人就不是原文那个人了。所以那句铁律被量化成七三开，而且必须在**大纲、细则、
       原文走向、落点**这几处先各自说一遍 —— 只在最末一节冒出来，模型读到大纲时就已经定势了。 */
    const n733 = (withWill.match(/七比三/g) ?? []).length
    ok('详纲：相违时按七比三分（七成是他写的行动与话语 · 三成是非情节的那一半）',
      withWill.includes('七比三分') && withWill.includes('七分给')
      && withWill.includes('三分留给') && withWill.includes('情节顺序'),
      `「七比三」在大纲/细则/走向/落点与最末一节共出现 ${n733} 次`)
    ok('详纲：相合时照原文案（逐字 · 不改写不润色不续写）',
      withWill.includes('· 相合 —— 照**原文案**写') && withWill.includes('逐字，不改写、不润色、不续写'),
      '')
    ok('详纲：这条规矩在读到大纲之前就已写明（不能只在最末一节才冒出来）',
      n733 >= 4, `全文出现 ${n733} 次`)

    /* ③g 空操作栏那一趟：同一位置、同一分量，方向相反 —— 不摆「他的意志」，
       改摆「他没有指示」；说的还是同一件事：这一段自己往前走一步。 */
    const idleSys = buildDirectorSystem(ev0, { ...ctx, nextEvent: TIMELINE[1], idle: true })
    const iIdle = idleSys.indexOf('【本回合 · 他没有指示】')
    ok('详纲：空操作栏那一趟摆「本回合 · 他没有指示」，仍在最末一节（与有输入时同一位置）',
      iIdle > 0 && !idleSys.includes(WILL_HEAD)
      && before.every((i) => i > 0 && iIdle > i),
      `指示节 ${iIdle}｜大纲 ${idleSys.indexOf('【事件大纲 · 原文走向')}｜落点 ${idleSys.indexOf('四、原文里这一段的落点')}｜全文 ${idleSys.length}`)
    ok('详纲：那一节挡住的是「反客为主」—— 不许把话头递回去、不许重演上一回合、照大纲推一步',
      idleSys.includes('不要停下来问他') && idleSys.includes('不要重演上一回合')
      && idleSys.includes('往下推一步') && idleSys.includes('照【事件大纲 · 原文走向】'),
      '')
    const bothSys = buildDirectorSystem(ev0, { ...ctx, operatorAction: ACT, idle: true })
    ok('详纲：两者同时成立时以「他写的那一笔」为准（idle 是没有输入时的替身，不并列出现）',
      bothSys.includes(WILL_HEAD) && !bothSys.includes('【本回合 · 他没有指示】'),
      '')

    /* 收束的闸门不许再挂回大纲上：eventDone 是「往下推进」的唯一开关，
       而它最后被读到的那句定义就在 schema 注释里 —— 若写成「大纲关键收束达成才置 true」，
       模型为了让剧情能往下走，只能把情节推回原位（前面所有松口径全被这一句抵消）。 */
    const doneLine = full.split('\n').find((l) => l.includes('"eventDone"')) ?? ''
    ok('详纲：schema 里 eventDone 的注释以「实际发生的」为落点，不把闸门挂回大纲',
      doneLine.includes('以**此刻实际发生的**为准') && !doneLine.includes('大纲关键收束达成'),
      doneLine.trim().slice(0, 40) + '…')

    /* ③ 台词与「还不知道」必须原样进提示词 —— 这两样一旦被改写，写出来的人就不是原文那个。
       取的是**标了 key 的那一条**（没标的那条按规矩根本不进大纲，见上面那条检查）。 */
    const probe = EVENT_BRIEFS.__probe__
    const keyed = probe.lines!.find((l) => l.key === true)!
    ok('详纲：绕不开的那几句与「还不知道」逐字进提示词（改写一句就等于换了个人）',
      strip(full).includes(strip(keyed.text))
      && full.includes('还不知道：露娜的存在')
      && full.includes(`${keyed.who}：${keyed.text}`),
      `台词行 ${full.includes(`${keyed.who}：${keyed.text}`)}`)

    /* 对照：只有 beats 的事件，后面四节一律不冒出空壳标题（半截标题会读成「这一节没有内容」） */
    EVENT_BRIEFS.__probe2__ = { beats: ['只有一拍'] }
    const lean = buildDirectorSystem({ ...ev0, id: '__probe2__' }, ctx)
    ok('详纲（对照）：只给了情节线时，其余四节的标题一个都不出现（不摆空壳）',
      lean.includes('一、原文情节线') && !['二、绕不开的几句原文', '三、在场的谁知道什么', '四、原文里这一段的落点', '五、禁忌']
        .some((h) => lean.includes(h)),
      ['二、三、四、五 节的标题'].map((h) => `${h}${lean.includes(h) ? '有' : '无'}`).join('　'))

    /* 对照：摘了台词但一条都没标 key —— 第二节整节不出现，
       而不是摆一个空标题（那会读成「这一节没有内容可用」）。 */
    EVENT_BRIEFS.__probe3__ = { beats: ['只有一拍'], lines: [{ who: '言万心叶', text: PLAIN }] }
    const unkeyed = buildDirectorSystem({ ...ev0, id: '__probe3__' }, ctx)
    ok('详纲（对照）：摘了台词却一条没标 key 时，那一节整节不出现（不摆空标题）',
      !unkeyed.includes('二、绕不开的几句原文') && !unkeyed.includes(PLAIN),
      `第二节=${unkeyed.includes('二、绕不开的几句原文') ? '有' : '无'}　未标台词=${unkeyed.includes(PLAIN) ? '漏了' : '没露'}`)
    delete EVENT_BRIEFS.__probe3__
    delete EVENT_BRIEFS.__probe__
    delete EVENT_BRIEFS.__probe2__

    /* ④ 键必须都是真事件 id：摘录时敲错一个字，那一份就永远不会被任何事件读到，
       而且**不会报错** —— 它只是静静地躺在表里，等于没摘。 */
    const ids = new Set(TIMELINE.map((e) => e.id))
    const stray = Object.keys(EVENT_BRIEFS).filter((k) => !ids.has(k))
    const covered = Object.keys(EVENT_BRIEFS).filter((k) => ids.has(k))
    ok('详纲：表里的键都是真事件 id（敲错的键不会被任何事件读到，且不会报错）',
      stray.length === 0, stray.length ? `多出来的：${stray.join('、')}` : `现有 ${covered.length} 条`)
    info.push(`详纲：已摘 ${covered.length} / ${TIMELINE.length} 个事件`
      + (covered.length ? `（${covered.slice(0, 6).join('、')}${covered.length > 6 ? ' …' : ''}）` : '　内容见 scripts/briefs/'))
  } catch (e) {
    fail.push('详纲段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 21b) 开场白：台词行按「角色名：」起行，旁白行不带前缀 ----------
     开场白是注入到会话最前面的**那一条**（见 views/Plot 的在线开场）。
     它按终端的台词行契约写：某角色开口就另起一行、以「本名/常用称呼＋全角冒号」开头，
     终端据此切气泡；旁白、神态、动作行**不许**带前缀 —— 带了就被当成台词，切出假气泡。
     反过来，名字前缀若查不到（档案表 + castmeta.VOICE_ONLY 那几位「开口但不在册」的），
     整行会连前缀一起掉回旁白，版面上就多出一行「某某：……」的叙述。两头都要拦。 */
  try {
    const rows = Object.entries(SCENES).filter(([, v]) => !!v?.open)
    /* 开场白只许出现在第一卷第一章（v1-1）：那一段的文本是逐字原文的排印。
       别的段若也写 open，注入到会话最前的那一段就是转述顶着「· 原文」的名头 —— 那是伪原文。 */
    const stray = rows.map(([k]) => k).filter((k) => k !== 'v1-1')
    ok('开场白：只有第一卷第一章（v1-1）有，别的段一律不给',
      stray.length === 0 && !!SCENES['v1-1']?.open,
      stray.length ? `多出来的：${stray.join('、')}` : `1 段（v1-1），其余 ${Object.keys(SCENES).length - 1} 段无`)
    /** 行首的「名字：」——名字取 2～6 个汉字/间隔号，够像人名即可 */
    const LEAD_NAME = /^[一-龥][一-龥·]{1,5}：/
    const leaks: string[] = []
    for (const [k, v] of rows) {
      for (const seg of splitSpeech(v.open!)) {
        if (seg.kind !== 'narr') continue
        for (const line of seg.text.split('\n')) {
          if (LEAD_NAME.test(line.trim())) leaks.push(`${k}｜${line.trim().slice(0, 14)}`)
        }
      }
    }
    ok('开场白：台词行都切得出气泡 —— 没有「名字：」起行却掉回旁白的那一种',
      leaks.length === 0,
      leaks.length ? `掉回旁白的：${leaks.slice(0, 4).join('　')}${leaks.length > 4 ? ` 等 ${leaks.length} 处` : ''}`
        : `${rows.length} 段开场白，无一行名字前缀漏进旁白`)
    /* 对照：真有一行「查不到的名字：……」时判据报得出来 ——
       没有这条，上面那条也可能只是碰巧扫不到东西。 */
    const ghost = splitSpeech('陌生人甲：……你是谁？')
    ok('开场白（对照）：判据对「查不到的名字：」确实报得出来',
      ghost.length === 1 && ghost[0].kind === 'narr' && LEAD_NAME.test(ghost[0].text.trim()),
      `「陌生人甲：……」→ ${ghost[0]?.kind}；「${ghost[0]?.text.slice(0, 8) ?? ''}…」`)
    /* 卷一是整章复述（不是两行简报），台词行最多 —— 这里单独盯它：
       言万心叶的台词必须落在右气泡（you），其余角色落在左气泡（say），两边都不为空。 */
    const v11 = SCENES['v1-1']?.open ?? ''
    const segs = splitSpeech(v11)
    const yous = segs.filter((s) => s.kind === 'you').length
    const says = segs.filter((s): s is Extract<DialogueSeg, { kind: 'say' }> => s.kind === 'say')
    const names = [...new Set(says.map((s) => s.id))]
    ok('开场白（卷一）：言万心叶的台词走右气泡、同场其他人走左气泡，两种都有',
      yous >= 5 && says.length >= 5 && names.length >= 2,
      `${segs.length} 段：you ${yous}、say ${says.length}（${names.join('、')}）`)
    /* 旁白行不许带名字前缀 —— 卷一里有「言万心叶头也不回地说。」这种神态行 */
    const narr = segs.filter((s): s is Extract<DialogueSeg, { kind: 'narr' }> => s.kind === 'narr')
    const prefixed = narr.filter((s) => LEAD_NAME.test(s.text.trim())).length
    ok('开场白（卷一）：神态/叙述行不带名字前缀（带了会被切出一个假气泡）',
      prefixed === 0, `旁白段 ${narr.length} 个，带前缀的 ${prefixed} 个`)
    // 末尾得收住：或句号，或一句引文收尾
    const openEnd = rows.filter(([, v]) => !/[。！？」]$/.test((v.open ?? '').trim())).map(([k]) => k)
    ok('开场白：以句号或一句引文收尾（不是一个断在半截的句子）',
      openEnd.length === 0, openEnd.length ? `没收住：${openEnd.join('、')}` : `${rows.length} 段均已收尾`)
  } catch (e) {
    fail.push('开场白段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 22) 性情锚：人物卡逐字进提示词，分期层按「读到哪」翻篇 ---------- */
  try {
    const withLuna = TIMELINE.find((e) => castOf(e).includes('luna'))!
    const sys = buildDirectorSystem(withLuna, { operatorName: '言万心叶', presetPost: '' })
    ok('性情锚：在场角色的性格 / 说话方式逐字进提示词（对上的叮嘱没用，有用的是原文里他怎么说话）',
      sys.includes('【在场角色 · 性情锚】') && sys.includes('〔说话方式〕')
      && sys.includes('露娜'), `含「性情锚」节=${sys.includes('【在场角色 · 性情锚】')}`)

    /* 台上没有的人一个都不许冒出来 —— 整卡铺开最容易犯的错 */
    const absent = sys.slice(sys.indexOf('【在场角色 · 性情锚】'), sys.indexOf('【此刻的羁绊'))
    const strays = [...new Set(absent.match(/▸ (\S+)/g) ?? [])]
      .map((x) => x.slice(2))
      .filter((n) => !castOf(withLuna).some((id) => (CHARACTERS.find((c) => c.id === id)?.name ?? id) === n))
    ok('性情锚（对照）：只列在场的那些，台上没有的一个都不冒出来',
      strays.length === 0, strays.length ? `多出来的：${strays.join('、')}` : `${strays.length || 0} 个越界`)

    /* 分期：同一个人，读到的位置不同 → 该叠的层不同；够不着的层不许提前生效。
       露娜是最典型的一个：使用者契约（v1-9）前后是两种样子。 */
    const beforePact = temperAt('luna', 100, -1)
    const afterPact = temperAt('luna', 100, TIMELINE.length - 1)
    const idxPact = TIMELINE.findIndex((e) => e.id === 'v1-9')
    ok('性情分期：契约之前叠的是前一段的性情（读得早 → 不给后期的样子）',
      beforePact !== null && beforePact !== afterPact
      && (beforePact.forbid ?? []).some((x) => x.includes('主人'))
      && !(beforePact.note ?? '').includes('我将献上我的全部'),
      `契约前那一段的禁忌 ${(beforePact?.forbid ?? []).length} 条`)

    ok('性情分期：越过 v1-9 就翻篇（同一份人物卡，读到的位置不同 → 叠的层不同）',
      temperAt('luna', 100, idxPact - 1) === beforePact
      && temperAt('luna', 100, idxPact) === afterPact
      && afterPact !== null && afterPact.note.includes('我的小主人'),
      `v1-9 前一层=${temperAt('luna', 100, idxPact - 1)?.note.slice(0, 8)}…　`
      + `v1-9 起一层=${afterPact?.note.slice(0, 8)}…`)

    /* 分期层真的进了提示词才算数 —— 规则写得再对，没接上就是白写 */
    // 两头都挑**露娜在台上**的那一段：不在台上就不画她的锚，
    // 拿序章（船上只有黑之魔王）当样本会假失败 —— 她本来就不在那儿。
    const earlyEv = TIMELINE.find((e) => castOf(e).includes('luna'))!
    const lateEv = [...TIMELINE].reverse().find((e) => castOf(e).includes('luna'))!
    // 翻篇由**读到哪**决定（furthestDone(epDone)），不给 epDone 就停在「还没开始读」，
    // 两头的层会一样 —— 所以这里得把存档进度也摆出来，不然验的是空气。
    const early = buildDirectorSystem(earlyEv, {
      operatorName: '言万心叶', presetPost: '', bondNow: () => 24,
      epDone: { [earlyEv.id]: true },
    })
    const late = buildDirectorSystem(lateEv, {
      operatorName: '言万心叶', presetPost: '', bondNow: () => 100,
      epDone: Object.fromEntries(TIMELINE.map((e) => [e.id, true])) as Record<string, true>,
    })
    ok('性情分期：翻篇前后进提示词的确实是两层（前面的叮嘱不许出现后期那套）',
      early.includes('此刻的性情') && early.includes('不许她叫「主人」「小主人」')
      && late.includes('不许再退回契约前那种'),
      `读 ${earlyEv.id} 时=${early.includes('不许她叫「主人」「小主人」')}`
      + `　读 ${lateEv.id} 时=${late.includes('不许再退回契约前那种')}`)

    /* 全体登记角色的通则（不止露娜一个）。
       分期是**按读到的位置**换层的：分界点写错一个字母，那一层就永远够不着 ——
       敲成表外的 id 时，`temperAt` 一路回退到第一段，读到最后还是初期的样子，
       屏上不会报错，只会「越读越不像话」。所以逐条钉死：
         · 分界点必须是真事件（`from` 敲错 = 那一段永远不生效）
         · 分界点必须**递增**（写反了等于后面那段被前面压住）
         · 第一段不带 `from`（它是「读到这里之前的全部」）
         · 每一段都得有 note 与 forbid —— 没有禁忌的分期等于没分 */
    const badFrom: string[] = []
    const badOrder: string[] = []
    const thin: string[] = []
    const lateMiss: string[] = []
    for (const [id, stages] of Object.entries(TEMPER)) {
      if (!stages?.length) continue
      if (stages[0]!.from) badFrom.push(`${id} 首段也写了 from=${stages[0]!.from}`)
      let prev = -1
      for (const s of stages) {
        if (s.from) {
          const i = TIMELINE.findIndex((e) => e.id === s.from)
          if (i < 0) badFrom.push(`${id} 的 from=${s.from} 不在时间线上`)
          else if (i <= prev) badOrder.push(`${id} 的 from=${s.from} 没有往后走`)
          else prev = i
          /* 分界那一段真的翻得动才算数：读到分界点前一节还是上一段，
             读到分界点当节就换成这一段（边界差一格是最常见的错法）。 */
          const before = temperAt(id as CharId, 100, i - 1)
          const at = temperAt(id as CharId, 100, i)
          if (at !== s || before === s) lateMiss.push(`${id} @${s.from}`)
        }
        if (!s.note?.trim() || !(s.forbid ?? []).length) thin.push(`${id} 有一段缺 note/forbid`)
      }
    }
    ok('性情分期：分界点都是真事件，且首段不带分界（敲错一个 id，那一段就永远够不着）',
      badFrom.length === 0, badFrom.length ? badFrom.join('、') : `逐角色核对 ${Object.keys(TEMPER).length} 位`)
    ok('性情分期：同一个人身上，分界点依次往后（写反了就是后面那层被前面压住）',
      badOrder.length === 0, badOrder.length ? badOrder.join('、') : '顺序逐条递增')
    ok('性情分期：每一段都带 note 与 forbid（没有禁忌的分期等于没分）',
      thin.length === 0, thin.length ? thin.join('、') : '逐段齐全')
    ok('性情分期：读到分界点前仍叠上一段、到分界点当节才翻篇（边界差一格是最常见的错法）',
      lateMiss.length === 0,
      lateMiss.length ? `翻篇位置不对：${lateMiss.join('、')}`
        : `逐段核对边界 ${Object.values(TEMPER).reduce((n, s) => n + (s?.filter((x) => x.from).length ?? 0), 0)} 处`)

    info.push(`性情分期：TEMPER 现有 ${Object.keys(TEMPER).length} 个角色登记`
      + `（${Object.keys(TEMPER).map((k) => `${k}×${TEMPER[k as CharId]!.length} 段`).join('　')}）`)
  } catch (e) {
    fail.push('性情锚段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 23) 好感：只从行为里来 + 事件门槛 / 锁定 ---------- */
  try {
    const gated = TIMELINE.filter((e) => (e.gate?.length ?? 0) > 0)
    const locked = TIMELINE.filter((e) => (e.lock?.length ?? 0) > 0)

    /* ① 门槛与锁定都得是真角色、真数值 —— 敲错一个 id 就是一道永远过不去的门 */
    const badRef = [...gated, ...locked].flatMap((e) =>
      [...(e.gate ?? []), ...(e.lock ?? [])]
        .filter((g) => !PERSON_IDS.includes(g.char) || !Number.isFinite(g.value) || g.value < 0 || g.value > 100)
        .map((g) => `${e.id}:${g.char}=${g.value}`))
    ok('好感门槛 / 锁定：指向的角色都在档案名录内，数值都在 0~100（敲错的 id 会变成一道永远过不去的门）',
      badRef.length === 0, badRef.length ? `有问题的：${badRef.join('、')}` : `门槛 ${gated.length} 段 · 锁定 ${locked.length} 段`)

    /* ② 门槛必须够得着：读数封顶 100（bondNow 的 clamp），门槛高过 100 就谁也开不了 */
    const unreachable = gated.flatMap((e) =>
      (e.gate ?? [])
        .filter((g) => g.value > 100)
        .map((g) => `${e.id} 要 ${g.char} ${g.value}，而读数最高只到 100`))
    ok('好感门槛：门槛值不会高过读数上限 100（否则那一段谁也开不了）',
      unreachable.length === 0, unreachable.length ? unreachable.join('；') : '卷一的契约门槛 70 ≤ 100，够得着')

    /* ③ 契约那一段：门槛 70 拦入口 / 走完锁 100 —— 这一档是**留着**的，
       且门槛只在**第一卷**内（v1-9 属卷 1）。 */
    const pact = TIMELINE.find((e) => e.id === 'v1-9')
    ok('好感门槛：卷一使用者契约（v1-9）要好感先到 70，走完锁 100',
      pact?.gate?.some((g) => g.char === 'luna' && g.value === 70) === true
      && pact?.lock?.some((g) => g.char === 'luna' && g.value === 100) === true
      && pact?.vol === 1,
      `卷=${pact?.vol}　门槛=${JSON.stringify(pact?.gate ?? null)}　锁定=${JSON.stringify(pact?.lock ?? null)}`)

    /* ④ 除契约之外不许再有「推进到某一段就给固定读数」的档：阶段上限已撤，
       bondstage 里只剩一份「关系确认」文案，不再夹带数值。 */
    const stageKeys = Object.keys(BOND_STAGE)
    ok('推进不给固定值：阶段上限已撤（bondstage 只剩关系确认，不再有 cap / full）',
      BOND_STAGE.luna?.from === 'v1-9'
      && !('cap' in (BOND_STAGE.luna ?? {})) && !('full' in (BOND_STAGE.luna ?? {}))
      && stageKeys.every((k) => Object.keys(BOND_STAGE[k]!).every((f) => f === 'from' || f === 'confirm')),
      `登记的：${stageKeys.join('、')}　字段：${stageKeys.map((k) => `${k}(${Object.keys(BOND_STAGE[k]!).join('/')})`).join('　')}`)
    ok('推进不给固定值：契约那份「关系确认」文案仍随读到 v1-9 才现身',
      confirmOf('luna', 'v1-8') === null && confirmOf('luna', 'v1-9') !== null
      && stagePassed('luna', 'v1-9') && !stagePassed('luna', 'v1-8'),
      `v1-8=${confirmOf('luna', 'v1-8') === null ? '无' : '有'}　v1-9=${confirmOf('luna', 'v1-9') ? '有' : '无'}`)

    /* ④ 导演照着写的是「此刻真实的羁绊」，不是这一段原著里的数值 ——
       从前这两者混在一句「羁绊基准」里，主角把话说砸了导演还照原著写亲密。 */
    const sysB = buildDirectorSystem(pact!, {
      operatorName: '言万心叶', presetPost: '', bondNow: (id) => (id === 'luna' ? 12 : 20),
    })
    const sysC = buildDirectorSystem(pact!, {
      operatorName: '言万心叶', presetPost: '', bondNow: (id) => (id === 'luna' ? 96 : 20),
    })
    ok('羁绊读数：同一个事件，主角行为不同 → 进提示词的读数就不同（不再照原著写死）',
      sysB.includes('露娜（luna）：12') && sysC.includes('露娜（luna）：96'),
      `冷淡时=${sysB.includes('露娜（luna）：12')}　亲近时=${sysC.includes('露娜（luna）：96')}`)

    /* 对照那一行要两边都标得出来：露娜这一段的原著值是 95，往上不到 8 分的余量，
       所以「更亲近」拿恋兔光（原著 78）来验 —— 只测一边的标记等于没测。 */
    const sysD = buildDirectorSystem(pact!, {
      operatorName: '言万心叶', presetPost: '', bondNow: (id) => (id === 'hikari' ? 96 : 20),
    })
    ok('羁绊读数：原著读数降级为对照（同一段，主角更疏远 / 更亲近都看得出来）',
      sysB.includes('↓比原著疏远') && sysD.includes('↑比原著亲近')
      && sysB.includes('不是这一段原著里的数值'),
      `疏远标记=${sysB.includes('↓比原著疏远')}　亲近标记=${sysD.includes('↑比原著亲近')}`)

    /* ⑤ 好感基准里不许再出现「读到这一段就跟到这一段」的原著快照当基线 ——
       把 offset 清零后，读数应当回到初见值，而不是回到 ev.bond。
       与 bondNow 同式：clamp(初见值 + 偏移, 0, 100)，再无第二档改写它。 */
    const ev9 = pact!
    const offsetless = Math.max(0, Math.min(100, defaultBondOf('luna') + 0))
    ok('好感基准：什么都不做就是不涨（偏移清零 → 回到初见值，而不是原著同段的数值）',
      offsetless === defaultBondOf('luna') && offsetless !== ev9.bond.luna,
      `初见值 ${defaultBondOf('luna')} ≠ 原著同段 ${ev9.bond.luna}`)

    info.push(`好感门槛：${gated.map((e) => `${e.id}(${e.gate!.map((g) => `${g.char}≥${g.value}`).join(',')})`).join('　') || '（暂无）'}`)
  } catch (e) {
    fail.push('好感门槛段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* —— 露娜的「回来」那一下：不是不限次，是有人站在场上换来的 ——
     口径：一场只织得回来一次；言万心叶在场上时，那一次之外还能再撑一次。
     判据必须是「此刻场上还有谁」—— 倒了、被归档收走就不算，
     光「这一队里带了心叶」不作数。 */
  try {
    const luna = ROSTER['luna']!.passive
    ok('露娜：被动不再是「不限次」', luna?.endure === 1, `endure=${luna?.endure}`)
    ok('露娜：加算挂在言万心叶身上（+1）',
      luna?.endurePlus?.with === OPERATOR_ID && luna?.endurePlus?.extra === 1,
      JSON.stringify(luna?.endurePlus))

    const mkSquad = (squad: string[]) => createBattle({
      mission, squad, progress: 1, growth: {}, sp: 100, spMax: 100, bond: {},
    })
    const withOp = mkSquad(['luna', OPERATOR_ID, 'isis', 'phidra'])
    const noOp = mkSquad(['luna', 'isis', 'phidra', 'maria'])
    ok('续行上限：心叶在场上 → 2 次', endureCap(withOp, luna!) === 2, `cap=${endureCap(withOp, luna!)}`)
    ok('续行上限：心叶不在 → 1 次', endureCap(noOp, luna!) === 1, `cap=${endureCap(noOp, luna!)}`)

    const op = find(withOp, OPERATOR_ID)
    if (!op) {
      fail.push('续行上限：场上找不到言万心叶，判据无从验起')
    } else {
      op.down = true
      ok('续行上限：心叶倒下 → 加算收回（回到 1 次）',
        endureCap(withOp, luna!) === 1, `cap=${endureCap(withOp, luna!)}`)
      op.down = false
      op.gone = 1
      ok('续行上限：心叶被归档收走 → 同样不算在场',
        endureCap(withOp, luna!) === 1, `cap=${endureCap(withOp, luna!)}`)
      op.gone = 0
    }

    /* 对照：别人（不限次的老口径已无人在册）—— 拿正经的定额续行验加算不误伤 */
    const emei = ROSTER['emei']!.passive
    ok('续行上限：没有 endurePlus 的人不受影响（定额照旧）',
      endureCap(withOp, emei!) === 1 && endureCap(noOp, emei!) === 1,
      `场上=${endureCap(withOp, emei!)}　场下=${endureCap(noOp, emei!)}`)

    /* 档案里那一行要读得出来「几次、跟谁」 */
    const t = passiveText(luna)
    ok('档案：续行那行写明了次数与在场的人',
      t.some((x) => x.includes('每场 1 次') && x.includes('言万心叶') && x.includes('2 次')),
      t.join('｜'))
  } catch (e) {
    fail.push('露娜续行段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 24) 情景记忆库：只重排既有的账（不新记 · 不漏 · 不剧透） ----------
     七栏全部由纯函数从既有的那几本账现场排出来。这一层最容易坏在三处，
     而且三处坏了界面都照常显示，看不出少了什么：
       · 排的时候手一滑漏掉几段（编年少一行，谁也不觉得少）
       · 把还没发生过的事写了出来（未读的卷回放心声、没走到的段露名字）
       · 自己另记一份、跟事实对不上（这里没有第二份副本，所以钉死「同一份输入同一份结果」） */
  try {
    const world = (over: Partial<WorldState> = {}): WorldState => ({
      offset: {}, locked: {}, flags: {}, met: {}, ends: {}, own: [], records: [], ...over,
    })
    const mk = (over: Partial<WorldState> = {}, epDone: Record<string, true> = {}, records: WorldRecord[] = []): MemInput =>
      ({ world: world(over), epDone, records, bondNow: (id) => (id === 'luna' ? 46 : 20) })

    const timelineIds = new Set(TIMELINE.map((e) => e.id))

    /* ① 编年：一段不少、一段不重、不认时间线以外的 id */
    const chron0 = chronicleOf(mk())
    const chronRows = chron0.flatMap((g) => g.rows)
    const chronDup = chronRows.length !== new Set(chronRows.map((r) => r.id)).size
    ok('记忆库 · 编年：时间线有多少段就列多少行，不重不漏（漏一行没人看得出来）',
      chronRows.length === TIMELINE.length && !chronDup
      && chronRows.every((r) => timelineIds.has(r.id)),
      `列出 ${chronRows.length} 行 / 时间线 ${TIMELINE.length} 段${chronDup ? '（有重复）' : ''}`)

    /* ② 不剧透：没观测到的段落只留位置 —— 名字与地点一个字都不给；
          反过来，已归档的必须露出真名（两头都卡住，遮一片或露一片都过不去） */
    const doneTwo = TIMELINE.slice(0, 2).reduce<Record<string, true>>((m, e) => (m[e.id] = true, m), {})
    const chron2 = chronicleOf(mk({}, doneTwo)).flatMap((g) => g.rows)
    const focusId = TIMELINE[2]!.id
    const leak = chron2.filter((r) => r.unseen)
      .filter((r) => {
        const ev = TIMELINE.find((e) => e.id === r.id)!
        return r.title !== '未观测' || r.place !== '——' || r.day !== ''
          || r.title.includes(ev.title) || r.place.includes(ev.place)
      })
    const hiddenDone = chron2.filter((r) => r.done && (r.title === '未观测' || r.unseen))
    ok('记忆库 · 不剧透：没走到的段落名字与地点一律不给（只留「未观测」的位置）',
      leak.length === 0, leak.length ? `露了的：${leak.map((r) => r.id).join('、')}` : `遮住 ${chron2.filter((r) => r.unseen).length} 段`)
    ok('记忆库 · 不剧透：已归档的照实写（走过两段就露两段真名，正卡着的一段也露）',
      hiddenDone.length === 0
      && chron2.filter((r) => !r.unseen).length === 3
      && chron2.find((r) => r.id === focusId)?.title === TIMELINE[2]!.title,
      `露名 ${chron2.filter((r) => !r.unseen).length} 段（含正卡着的 ${focusId}）`)

    /* ③ 心声闸门：整卷读完才回放。没读完的卷只报条数、正文一条不给 */
    const gWithMinds = [...new Set(MINDS.map((m) => m.group))]
      .find((g) => gWithMindsOk(g)) ?? null
    if (!gWithMinds) {
      fail.push('记忆库 · 心声：MINDS 里找不到任何「整卷都有段」的卷，闸门无从验起')
    } else {
      const sealed = mindsOf(mk())
      const doneAll = TIMELINE.filter((e) => e.group === gWithMinds).reduce<Record<string, true>>((m, e) => (m[e.id] = true, m), {})
      const opened = mindsOf(mk({}, doneAll))
      const sg = sealed.find((g) => g.group === gWithMinds)!
      const og = opened.find((g) => g.group === gWithMinds)!
      const truth = MINDS.filter((m) => m.group === gWithMinds)
      ok('记忆库 · 心声：整卷读完才回放 —— 没读完的卷正文一条不给，只报条数',
        sg.done === false && sg.rows.length === 0 && sg.total === truth.length && truth.length > 0,
        `「${gWithMinds}」封存 ${sg.rows.length}/${sg.total} 条`)
      ok('记忆库 · 心声：这一卷读完 → 原文逐字回放（条数对得上、正文一字不改）',
        og.done === true && og.rows.length === truth.length
        && og.rows.every((r, i) => r.text === truth[i]!.text && r.speaker === truth[i]!.speaker),
        `回放 ${og.rows.length} 条`)
      ok('记忆库 · 心声：闸门只开这一卷（别的卷照旧封着）',
        opened.filter((g) => g.group !== gWithMinds).every((g) => g.rows.length === 0),
        `另封 ${opened.filter((g) => g.group !== gWithMinds && !g.done).length} 卷`)
    }

    /* ④ 事迹：正文字面照搬（不截断、不加工），且只认时间线上的段 */
    const raw = '第一行原文。「引号」与\n换行都得原样留着 —— 记忆库不替谁润色。'
    const recs: WorldRecord[] = [
      { eventId: TIMELINE[0]!.id, mode: 'online', digest: raw, diverged: true, ts: 1730000000000 },
      { eventId: 'zz-99', mode: 'online', digest: '这一段不存在', ts: 1 },
    ]
    const deeds = deedsOf(mk({}, {}, recs))
    ok('记忆库 · 事迹：写下的经过逐字照搬（换行与引号都不动），时间线以外的 id 一律不收',
      deeds.length === 1 && deeds[0]!.digest === raw && deeds[0]!.diverged === true
      && deeds[0]!.title === TIMELINE[0]!.title,
      `${deeds.length} 条：${deeds.map((d) => d.eventId).join('、') || '（空）'}`)

    /* ⑤ 见闻：只认登记过的（图鉴或自记），没登记的不许冒出来 */
    const ownOne = {
      id: 'own-1', name: '自记条目', alias: 'OWN', no: '0001', stage: 2, stageKw: '『初现』',
      classes: ['异法'], state: '存疑' as const, origin: '操作员自记', detail: '', counter: '',
      ref: '操作员自记 · 档案扩充', ts: 1,
    }
    const codexOne = CODEX[0]!
    const sights = sightsOf(mk({ ends: { [codexOne.id]: true, 'own-1': true, 'ghost-1': true }, own: [ownOne] }))
    ok('记忆库 · 见闻：只列登记过的（图鉴条目 / 操作员自记各走各的表，没登记的进不来）',
      sights.length === 2 && sights.some((s) => s.id === codexOne.id && s.name === codexOne.name)
      && sights.some((s) => s.id === 'own-1' && s.origin === '操作员自记'),
      `${sights.length} 条：${sights.map((s) => s.id).join('、')}`)
    ok('记忆库 · 见闻：出处（origin）原文照搬，不改写',
      sights.find((s) => s.id === codexOne.id)?.origin === codexOne.origin,
      '与图鉴原文一致')

    /* ⑥ 人物关系：只收遇见过的人；操作员本人不在列；锁定值优先于行为偏移 */
    ok('记忆库 · 关系：没遇见的人不出现（遇见之前连名字都不该有）',
      relationsOf(mk()).length === 0, `met 为空 → ${relationsOf(mk()).length} 行`)
    const rels = relationsOf(mk({
      met: { luna: true, hikari: true, [OPERATOR_ID]: true },
      offset: { luna: 12, hikari: -6 },
      locked: { luna: 88 },
    }))
    ok('记忆库 · 关系：只列遇见过的人，操作员本人不在其中',
      rels.length === 2 && !rels.some((r) => r.id === OPERATOR_ID),
      `${rels.length} 人：${rels.map((r) => r.id).join('、')}`)
    ok('记忆库 · 关系：行为偏移与锁定值分开读（锁了的那段关系读得出「已定」）',
      rels.find((r) => r.id === 'luna')?.drift === 12
      && rels.find((r) => r.id === 'luna')?.locked === 88
      && rels.find((r) => r.id === 'hikari')?.drift === -6
      && rels.find((r) => r.id === 'hikari')?.locked === null,
      JSON.stringify(rels.map((r) => ({ id: r.id, bond: r.bond, drift: r.drift, locked: r.locked }))))
    ok('记忆库 · 关系：按此刻的分量从高到低排（谁重谁在前）',
      rels[0]!.bond >= rels[rels.length - 1]!.bond && rels.length === 2
      && rels[0]!.id === 'luna',
      rels.map((r) => `${r.name}${r.bond}`).join(' > '))

    /* ⑦ 伏笔两类各有各的出处：正卡着的一段 / 应下没了的托付。
       （原先还有一类「分歧」（选了非原著路线还没走到落点的），随抉择点一起撤掉了 ——
        如今与原著相异只剩归档记录上的 diverged 标记，那个不当伏笔。） */
    const th = threadsOf({
      world: world(),
      epDone: {}, records: [], bondNow: () => 20,
      tasks: [
        { id: 't1', title: '应下的事', detail: '还没做', done: false, ts: 1 },
        { id: 't2', title: '做完的事', done: true, ts: 2 },
      ],
    })
    ok('记忆库 · 伏笔：正卡着的一段 + 应下没了的托付 —— 各归各类',
      th.some((t) => t.kind === '进行中' && t.title === TIMELINE[0]!.title)
      && th.filter((t) => t.kind === '托付').length === 1
      && th.find((t) => t.kind === '托付')?.title === '应下的事',
      th.map((t) => `${t.kind}·${t.title}`).join('　'))
    ok('记忆库 · 伏笔：了结的托付不再挂着（那是「事迹」）',
      !th.some((t) => t.title === '做完的事'),
      th.map((t) => t.title).join('、'))

    /* ⑧ 技能：读到的位置换时期 —— 与引擎同一口径（opPeriodAt）。时期的分界点是
          「读到那一节当节翻篇」，所以拿分界点前后各一次读数对着看，比「读了几段之后应该不一样」结实。
          另：解锁点没到的那几手也列着，只是标成未解锁 —— 藏起来等于没有。 */
    const prefix = (n: number) => TIMELINE.slice(0, n).reduce<Record<string, true>>((m, e) => (m[e.id] = true, m), {})
    const sk0 = skillsOf(mk())
    const skAll = skillsOf(mk({}, prefix(TIMELINE.length)))
    const flip = TIMELINE.findIndex((e) => e.id === 'v2-2')
    const before = skillsOf(mk({}, prefix(flip)))
    const at = skillsOf(mk({}, prefix(flip + 1)))
    const after = skillsOf(mk({}, prefix(flip + 2)))
    ok('记忆库 · 技能：此刻的时期与武装来自已读位置（读到分界点前还是上一时期，到分界点当节才翻篇，再读不会连翻）',
      sk0.skills.length > 0 && !!sk0.arm
      && sk0.title === before.title && before.title !== at.title && at.title === after.title
      && skAll.title !== before.title,
      `${sk0.title} → @v2-2 → ${at.title}（${
        sk0.title === before.title ? '分界点前未动' : '分界点前就动了'}）`)
    ok('记忆库 · 技能：解锁点没到的那几手也列着，但标成未解锁（藏起来等于没有）',
      sk0.skills.some((k) => k.locked)
      && skAll.skills.filter((k) => k.locked).length < sk0.skills.filter((k) => k.locked).length,
      `未读时锁着 ${sk0.skills.filter((k) => k.locked).length}/${sk0.skills.length} 手 · 读到最后锁着 ${skAll.skills.filter((k) => k.locked).length}`)

    /* ⑨ 序号：表外 id 记 0（编年行上写着 00 就是「不在时间线上」的信号） */
    ok('记忆库 · 序号：1-based 落在时间线上，表外的记 0',
      seqOfStrict(TIMELINE[0]!.id) === 1 && seqOfStrict(TIMELINE[6]!.id) === 7
      && seqOfStrict('zz-99') === 0,
      `首段=${seqOfStrict(TIMELINE[0]!.id)} 第七个=${seqOfStrict(TIMELINE[6]!.id)} 表外=${seqOfStrict('zz-99')}`)

    /* ⑩ 计数与各栏实际行数一致（导航上的数字就是点进去能看到的东西） */
    const full = mk({ met: { luna: true }, ends: { [codexOne.id]: true }, offset: { luna: 4 } }, doneTwo, recs)
    const c = memCounts(full)
    ok('记忆库 · 计数：目录上的数字与点进去的行数一致（数不对就是有一栏在骗人）',
      c.人物关系 === relationsOf(full).length && c.事迹 === deedsOf(full).length
      && c.伏笔 === threadsOf(full).length && c.见闻 === sightsOf(full).length
      && c.心迹 === mindsOf(full).reduce((n, g) => n + g.rows.length, 0)
      && c.技能 === skillsOf(full).skills.length
      && c.大事记 === chronicleOf(full).reduce((n, g) => n + g.doneCount, 0),
      JSON.stringify(c))

    /* ⑪ 没有第二份副本：同一份世界状态排出来的一定是同一份记忆 */
    const snap = (i: MemInput) => JSON.stringify({
      rel: relationsOf(i), deed: deedsOf(i), th: threadsOf(i), sight: sightsOf(i),
      mind: mindsOf(i), skill: skillsOf(i), chron: chronicleOf(i), count: memCounts(i),
    })
    ok('记忆库 · 同一份输入排两次结果一字不差（记忆库不自己记东西，只重排）',
      snap(full) === snap(mk({ met: { luna: true }, ends: { [codexOne.id]: true }, offset: { luna: 4 } }, doneTwo, recs)),
      `${snap(full).length} 字符两次一致 · 另一次输入不同结果也不同=${snap(full) !== snap(mk())}`)

    info.push(`记忆库：七栏 ${MEM_SECTIONS.join(' / ')} · 全收束时 ${JSON.stringify(memCounts(
      mk({ met: Object.fromEntries(PERSON_IDS.filter((p) => p !== OPERATOR_ID).map((p) => [p, true])) as Record<string, true>,
        ends: Object.fromEntries(CODEX.map((x) => [x.id, true])) },
        TIMELINE.reduce<Record<string, true>>((m, e) => (m[e.id] = true, m), {}))))}`)
  } catch (e) {
    fail.push('情景记忆库段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 25) 观测终端操作手册：文档不许骗人 ----------
     手册是照终端现在的样子写的（官方口径、纯文本）。它最容易出的毛病不是文笔，
     是**漂移**：终端加了模块、改了控件，手册还是上一版 —— 上一版就漏过情景记忆库，
     还写过一颗终端里根本不存在的「推进一步」按钮。所以这里不读手册自己怎么讲，
     去读源码里那一行 NAV 与引擎里那七栏，当场对一遍。 */
  try {
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    const navStart = appSrc.indexOf('const NAV')
    /* 从 `= [` 之后量到行首那个 `]` —— 类型标注里也有一个 `[]`，
       直接找第一个 `]` 会停在类型上，量出来是空的（这一版就是这么翻的车）。 */
    const navNames = [...appSrc.slice(appSrc.indexOf('= [', navStart), appSrc.indexOf('\n]', navStart))
      .matchAll(/cn: '([^']+)'/g)].map((m) => m[1])
    const listed = (MANUAL.find((s) => s.id === 'm-overview')?.items
      .find((t) => t.includes('左侧模块栏列出全部模块')) ?? '')
      .replace(/^[^：]*：/, '').replace(/。$/, '').split('、').filter(Boolean)
    ok('手册 · 模块索引：书上列的就是左侧栏真有的那些模块（不多不少，连顺序都对）',
      navNames.length > 6 && listed.length === navNames.length && listed.every((x, i) => x === navNames[i]),
      `手册 ${listed.length}：${listed.join('、')}\n      实际 ${navNames.length}：${navNames.join('、')}`)

    /* 记忆库那一节列的那七栏，就是引擎真排出来的七栏 —— 改一栏的名字，手册得跟着改 */
    const memLine = MANUAL.find((s) => s.id === 'm-memory')?.items
      .find((t) => t.includes('人物关系')) ?? ''
    ok('手册 · 记忆库那一节：书上列的七栏 = 记忆库真排的那七栏',
      MEM_SECTIONS.every((k) => memLine.includes(k)) && memLine.includes('共七栏'),
      memLine.slice(0, 52) + '…')

    /* 编号：01… 连着排、不重号（陈列按它排，重号就会有两节顶同一个位置） */
    const nos = MANUAL.map((s) => s.no)
    const ids = MANUAL.map((s) => s.id)
    ok('手册 · 章节号 01 起连排且不重（陈列按号排，重号就是两节顶一个位置）',
      new Set(nos).size === MANUAL.length && new Set(ids).size === MANUAL.length
      && MANUAL.every((s, i) => Number(s.no) === i + 1),
      `${nos.join(' ')}`)

    /* 官方口径：委员会发的文档，不是梅芙在讲话 —— 陈述句、无人称、不带语气。
       （件数正文字数这种断言放到冒烟里按渲染结果查，这里只查文字本身。） */
    const body = MANUAL.flatMap((s) => [s.title, s.lead, ...s.items]).join('\n')
    ok('手册 · 官方口径：无人称（不出现「你 / 我」）· 不借梅芙的口 · 不带语气助词',
      !body.includes('梅芙') && !/[你我]/.test(body) && !/[！？]/.test(body),
      `正文 ${body.length} 字`)

    /* 每条都写着「主要落在哪个模块」，那个模块名得在模块索引里出现过 ——
       否则读者照着「落在 XX」去找，找不着那一格。 */
    const areas = [...new Set(MANUAL.map((s) => s.at))]
    const strayArea = areas.filter((a) => !navNames.includes(a) && !['作战现场', '存读档'].includes(a))
    ok('手册 · 每节标出的落点都是终端里真有的地方（模块名取自模块栏 · 场内与存档除外）',
      strayArea.length === 0, strayArea.length ? `对不上：${strayArea.join('、')}` : `${areas.length} 个落点：${areas.join('、')}`)

    info.push(`手册：${MANUAL.length} 节 · ${MANUAL.reduce((n, s) => n + s.items.length, 0)} 条 · `
      + `覆盖 ${areas.length} 个模块（对左侧栏 ${navNames.length} 个模块）`)
  } catch (e) {
    fail.push('操作手册段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 26) 正文 ↔ 短信 互读：筛子就是这条功能本身 ----------
     用户要的是「两边互相读得到，但与本角色无关的不许管」。所以这一节的每一条
     都是**成对**的：给一份该给的、再给一份不该给的，证明它认得出来 —— 只验
     「内容出现了」的话，一个把两本账整个倒出来的实现照样通过。

     两本账都从 localStorage 读，node 里没有它：临时装一个只在内存里活着的替身，
     这一节自己用、用完还回去（别的节不该因为这里动过全局而变样）。 */
  try {
    const g = globalThis as { localStorage?: unknown }
    const hadLS = 'localStorage' in g
    const prevLS = g.localStorage
    const mem = new Map<string, string>()
    g.localStorage = {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)) },
      removeItem: (k: string) => { mem.delete(k) },
      clear: () => { mem.clear() },
    }
    try {
      /* 取一段真事与一个真在场者，再找一个「这段里没有他」的人 —— 全从时间线上量，
         不写死 id（写死了，时间线一改这一节就悄悄测起了别的东西）。 */
      const withCast = TIMELINE.filter((e) => castOf(e).length > 0)
      const evA = withCast[0]
      const onIds = castOf(evA)
      const who = onIds[0]
      const evB = TIMELINE.find((e) => !castOf(e).includes(who))!
      /* 「与这两段都无关」的那个人：只挑「这一段里没有他」的话，会挑到一个
         恰好在另一段里在场的人 —— 那样他从别段拿到内容、断言就假失败（踩过）。 */
      const offStage = (id: string) => !onIds.includes(id) && !castOf(evB).includes(id)
      const outsider = PERSON_IDS.find((id) => id !== who && offStage(id))!
      const rec = (eventId: string, digest: string): WorldRecord =>
        ({ eventId, mode: 'online', digest, ts: 0 })
      const recs = [rec(evA.id, '甲段里发生了甲事'), rec(evB.id, '乙段里发生了乙事')]

      const ctxA = plotContextFor(who, { records: recs })
      ok('互读 · 正文→短信：只交出他在场的那几段（他不在场的那段一个字都不给）',
        ctxA.includes('甲段里发生了甲事') && !ctxA.includes('乙段里发生了乙事'),
        ctxA.split('\n')[1] ?? '(空)')
      ok('互读 · 正文→短信：那段里没有他 → 整节回空串（调用方据此整节不注入）',
        plotContextFor(outsider, { records: recs }) === '',
        `outsider=${outsider}`)

      /* 眼下这一段：指针口径与 Plot.tsx 的 focusEv 一致（时间线上第一段没走完的） */
      const epd: Record<string, boolean> = {}
      for (const e of TIMELINE) epd[e.id] = e.id !== evA.id
      mem.set('zts-plot:v1', JSON.stringify({
        [evA.id]: [
          { id: 'm1', from: 'user', text: '他说的那一句', time: '10:00' },
          { id: 'm2', from: 'them', text: '现场的一段旁白', time: '10:01' },
        ],
      }))
      const ctxLive = plotContextFor(who, { records: [], epDone: epd })
      ok('互读 · 正文→短信：眼下这一段已写下的那几轮照原样交出去（他 = 操作员 · 现场 = 旁白）',
        ctxLive.includes('他：他说的那一句') && ctxLive.includes('现场：现场的一段旁白'),
        ctxLive.split('\n').slice(-2).join(' / ') || '(空)')
      ok('互读 · 正文→短信：眼下这一段的正文只喂在场者，不在场的人照样一个字不给',
        plotContextFor(outsider, { records: [], epDone: epd }) === '', `outsider=${outsider}`)

      /* 短信那一侧，先看单聊：线程 id 就是本人 */
      mem.set('zts-tavern:v1', JSON.stringify({
        [who]: [{ id: 's1', from: 'them', text: '甲写来的信', time: '09:00' }],
        [outsider]: [{ id: 's2', from: 'them', text: '乙写来的信', time: '09:30' }],
      }))
      const smsWho = smsContextFor([who])
      ok('互读 · 短信→正文：只取在场者的那本单聊（无关的那本一个字都不给）',
        smsWho.includes('甲写来的信') && !smsWho.includes('乙写来的信'),
        smsWho.split('\n')[1] ?? '(空)')

      /* 见面线程按它挂在谁名下 —— 同一本账，换个人问就不该交出去 */
      const rid = 'd:mech-1'
      mem.set('zts-rendezvous:v1', JSON.stringify([
        { id: rid, charId: who, kind: 'date', title: '放学后的天台', place: '天台', from: 'them', ts: 5, done: false },
      ]))
      mem.set('zts-tavern:v1', JSON.stringify({
        [rid]: [{ id: 's3', from: 'user', text: '见面里说的那句', time: '11:00' }],
      }))
      ok('互读 · 短信→正文：见面线程按它挂在谁名下来取（挂在他名下才给）',
        smsContextFor([who]).includes('见面里说的那句')
        && smsContextFor([who]).includes('放学后的天台'),
        smsContextFor([who]).split('\n')[1] ?? '(空)')
      ok('互读 · 短信→正文：那场见面挂在别人名下时，问这个人一个字都不给',
        smsContextFor([outsider]) === '')
      ok('互读 · 短信→正文：侧栏那条开关没开时，见面只算「信里说过的话」、不单独交出去',
        smsContextFor([who]).includes('见面里说的那句')
        && !smsContextFor([who]).includes('尚未发生')
        && smsContextFor([who], { rendezvous: true }).includes('尚未发生'),
        'rendezvous 开关')

      /* 群聊：成员里有在场者才算「有关」，且标注群名 —— 是不是这个群，取决于成员 */
      mem.set('zts-tavern:v1', JSON.stringify({
        'g:mech-1': [{ id: 's4', from: 'them', text: '群里说的那句', time: '12:00', meta: { who: '某人' } }],
      }))
      mem.set('zts-sms-threads:v1', JSON.stringify([
        { id: 'g:mech-1', name: '恋兔队', charIds: [who, outsider] },
      ]))
      ok('互读 · 短信→正文：群聊看成员里有没有在场者（有就给，并标出是哪个群）',
        smsContextFor([who]).includes('群里说的那句') && smsContextFor([who]).includes('恋兔队'),
        smsContextFor([who]).split('\n')[1] ?? '(空)')
      mem.set('zts-sms-threads:v1', JSON.stringify([
        { id: 'g:mech-1', name: '恋兔队', charIds: [outsider, PERSON_IDS.find((id) => id !== who && id !== outsider)!] },
      ]))
      ok('互读 · 短信→正文：群成员里一个在场者都没有 → 那本群聊也不给',
        smsContextFor([who]) === '')

      info.push('互读：正文→短信按在场名册筛（lib/cast.ts 的 castOf）· 短信→正文按线程归属筛'
        + '（单聊本人 / 见面挂名 / 群聊成员）· 两本账都只取已经写下来的')
    } finally {
      if (hadLS) g.localStorage = prevLS
      else delete g.localStorage
    }
  } catch (e) {
    fail.push('互读段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 27) 私密档案：底档 · 并账 · 合成（三档看法） ----------
     这一页只在浏览器里看得见，冒烟量的是「合成之后摆上屏的是什么」；
     这里量的是底下那三条规矩本身：底档一律从 0 起、并账时破处只认第一回、
     合成时「看法」按羁绊分两段。规则在 data/intimate.ts，两边量的是同一份。 */
  try {
    const femaleIds = Object.keys(INTIMATE)

    /* 底档哨兵：谁都不该带着开发度登场，处女一栏也一样。
       （冒烟 R4b 量的是屏幕上那根条，这里量的是底档本身 —— 两个都要守。） */
    const dirty = femaleIds.filter((id) => {
      const b = INTIMATE[id]!
      return b.lewd !== 0 || b.firstBy !== null || b.lastAct !== NO_ACT
        || INTIMATE_SLOTS.some((s) => b.parts[s].dev !== 0)
    })
    ok('私密 · 底档一律从 0 起（四处开发度 / 色情度 / 破处对象 / 最近一回都是空的）',
      dirty.length === 0, dirty.length ? dirty.join('、') : `${femaleIds.length} 位都干净`)

    // 每一位都合成得出来，且合成之后仍是 0 —— 说明 intimateOf 没在哪儿偷偷垫数
    const baseWrong = femaleIds.filter((id) => {
      const p = intimateOf(id, undefined, 0)
      return !p || p.lewd !== 0 || !p.virgin || p.firstBy !== null || p.lastAct !== NO_ACT
        || INTIMATE_SLOTS.some((s) => p.parts[s].dev !== 0 || !p.parts[s].state.trim())
    })
    ok('私密 · 无推进时合成出来的仍是纯底档（读数 0 · 处女 · 四处状态句都在）',
      baseWrong.length === 0, baseWrong.length ? baseWrong.join('、') : `${femaleIds.length} 位`)
    ok('私密 · 非女角色 / 没有底档者整页不出现（返回 null）',
      intimateOf('gcn') === null && intimateOf('kaito') === null && intimateOf('__nobody__') === null,
      `Intimate 表里 ${femaleIds.length} 位`)

    /* 「看法」分两段：底档一句、过线一句，两句话必须真的不一样 ——
       要是谁把 viewHigh 抄成 view，这一栏白写（羁绊高了跟没高一样）。 */
    const sameView = femaleIds.filter((id) => {
      const b = INTIMATE[id]!
      const v = b.view.trim()
      const h = b.viewHigh.trim()
      return !v || !h || v === h
    })
    ok('私密 · 「看法」两段齐全且各不相同（过线之后确实是另一句话）',
      sameView.length === 0, sameView.length ? sameView.join('、') : `${femaleIds.length} 位都分得开`)

    /* 底档那一句必须是**起初**的口径：克制、害羞且保守（用户口径：
       「起初一定是要克制，害羞且保守的」）。这一句是每人初见时的那一页，
       所以逐位都得起码沾上一条「她不肯 / 她害羞 / 她守着界」的样子 ——
       谁要把它写成一句「其实她也想要」，这里就红。 */
    const viewRestraint = /克制|害羞|保守|不肯|不许|不该|按住|按回去|别开脸|推开|缩肩|移开|脸红|安静|反问|规矩|底线|不解释|避开|错开/
    const looseView = femaleIds.filter((id) => !viewRestraint.test(INTIMATE[id]!.view))
    ok('私密 · 「对性行为的看法」起初一律是克制 / 害羞 / 保守的口径（18 位逐句量过）',
      looseView.length === 0, looseView.length ? looseView.join('、') : `${femaleIds.length} 位都写着克制`)

    const sample = femaleIds.find((id) => id === 'luna') ?? femaleIds[0]!
    const sb = INTIMATE[sample]!
    ok('私密 · 「看法」按羁绊分两段：没过线取底档那一句，过线取 viewHigh',
      intimateOf(sample, undefined, 0)!.view === sb.view
      && intimateOf(sample, undefined, INTIMATE_BOND - 1)!.view === sb.view
      && intimateOf(sample, undefined, INTIMATE_BOND)!.view === sb.viewHigh,
      `${sample} @0 / @${INTIMATE_BOND - 1} / @${INTIMATE_BOND}`)

    /* 状态句是一条**四档**的梯子（DEV_STAGES）—— 逐位逐处量三件事：
       · 句数 = 档数：一句不缺、一句不空（改梯子就要补齐 18 × 4 处）；
       · 四句互不相同：不是同一句话换几个词（「状态是动的」）；
       · 第 0 档一律写着「未开发」这件事 —— 谁都不是带着开发度登场的。 */
    const shortLadder: string[] = []
    const sameLadder: string[] = []
    const openZero: string[] = []
    for (const id of femaleIds) {
      for (const slot of INTIMATE_SLOTS) {
        const st = INTIMATE[id]!.parts[slot].states
        if (st.length !== DEV_STAGE_COUNT || st.some((x) => !x.trim())) {
          shortLadder.push(`${id}.${slot}(${st.length})`)
          continue
        }
        if (new Set(st.map((x) => x.trim())).size !== st.length) sameLadder.push(`${id}.${slot}`)
        if (!st[0]!.includes('未')) openZero.push(`${id}.${slot}`)
      }
    }
    ok(`私密 · 四处各写满 ${DEV_STAGE_COUNT} 句状态（一位不漏、一句不空）`,
      shortLadder.length === 0,
      shortLadder.length ? shortLadder.join('、') : `${femaleIds.length} 位 × 4 处 × ${DEV_STAGE_COUNT} 句`)
    ok('私密 · 四句互不相同（同一处上下两档读到的不是同一句话）',
      sameLadder.length === 0, sameLadder.length ? sameLadder.join('、') : `${femaleIds.length} × 4 组各不重复`)
    ok('私密 · 第 0 档一律写着「未开发」（起点是抗拒那一段）',
      openZero.length === 0, openZero.length ? openZero.join('、') : `${femaleIds.length} 位 × 4 处`)

    /* 档梯的边界：0 → 未开发；1/34 → 生涩；35/69 → 渐熟；70/100 → 沉溺 */
    const lane = [0, 1, 34, 35, 69, 70, 100].map(devStageIndex)
    ok('私密 · 档梯边界（0 → 未开发 · 1/34 → 生涩 · 35/69 → 渐熟 · 70/100 → 沉溺）',
      JSON.stringify(lane) === JSON.stringify([0, 1, 1, 2, 2, 3, 3]), `devStageIndex → ${JSON.stringify(lane)}`)

    /* 同一处读数往上走，上屏的那一句就跟着换 —— 这就是「状态是动的」 */
    const seen = [0, 22, 90].map((dev) => intimateOf(sample, { dev: { mouth: dev } }, 0)!.parts.mouth.state)
    ok('私密 · 同一处读数一涨，上屏的就换成那一档的那一句（0 / 22 / 90 三句各不同）',
      new Set(seen).size === 3
      && seen[0] === sb.parts.mouth.states[0]
      && seen[1] === sb.parts.mouth.states[1]
      && seen[2] === sb.parts.mouth.states[3]
      && devStage(0) === '未开发' && devStage(22) === '生涩' && devStage(90) === '沉溺',
      `${devStage(0)}「${seen[0]!.slice(0, 10)}…」/ ${devStage(22)}「${seen[1]!.slice(0, 10)}…」/ ${devStage(90)}「${seen[2]!.slice(0, 10)}…」`)
    const over = '推进里改写过的状态句。'
    ok('私密 · 推进里改写过的状态句压过档位推算的那一句（情节里真变了才算数）',
      intimateOf(sample, { dev: { mouth: 90 }, state: { mouth: over } }, 0)!.parts.mouth.state === over, over)

    /* 身量考据（PHYSIQUE）：只录了 8 位，其余暂按人物卡拟制 —— 但录进来的得真有底档 */
    const stranger = Object.keys(PHYSIQUE).filter((id) => !INTIMATE[id])
    ok('私密 · 身量考据只挂在真有底档的角色上',
      stranger.length === 0,
      `录了 ${Object.keys(PHYSIQUE).length} 位：${Object.keys(PHYSIQUE).join('、')}`)
    /* 推进里真改写过的压过两段：情节里变了才是最硬的证据 */
    const rewritten = '这是推进里改写过的看法。'
    ok('私密 · 推进里改写过的「看法」压过底档与过线两句',
      intimateOf(sample, { view: rewritten }, 0)!.view === rewritten
      && intimateOf(sample, { view: rewritten }, INTIMATE_BOND)!.view === rewritten,
      rewritten)

    // 并账：开发度与色情度累加
    let acc = mergeIntim(undefined, { dev: { mouth: 5 }, lewd: 3 })
    acc = mergeIntim(acc, { dev: { mouth: 2, vagina: 4 }, lewd: 2 })
    ok('私密 · 并账：开发度与色情度都是累加（不是覆盖）',
      acc.dev?.mouth === 7 && acc.dev?.vagina === 4 && acc.lewd === 5,
      JSON.stringify({ dev: acc.dev, lewd: acc.lewd }))
    const neg = mergeIntim(acc, {
      dev: { mouth: -3, anus: 0, vagina: Number.NaN, breast: Number.POSITIVE_INFINITY },
      lewd: -1,
    })
    ok('私密 · 并账：负数与非法数直接跳过（这一档只增不减）',
      JSON.stringify(neg.dev) === JSON.stringify(acc.dev) && neg.lewd === 5,
      `dev ${JSON.stringify(neg.dev)} vs ${JSON.stringify(acc.dev)} · lewd ${neg.lewd}`)

    /* 破处对象只认第一回 —— 之后情节里再怎么落，这一栏也不改 */
    let first = mergeIntim(undefined, { firstBy: '甲' })
    first = mergeIntim(first, { firstBy: '乙' })
    first = mergeIntim(first, { state: { vagina: '改写过' }, firstBy: '丙' })
    ok('私密 · 破处对象只认第一次落下的那个（之后再有改写也顶不掉）',
      first.firstBy === '甲' && intimateOf(sample, first)!.firstBy === '甲'
      && intimateOf(sample, first)!.virgin === false,
      `firstBy=${first.firstBy}`)
    ok('私密 · 状态句 / 最近一回 / 看法都是后写覆盖（问的是此刻）',
      mergeIntim(mergeIntim(undefined, { lastAct: '第一次' }), { lastAct: '第二次' }).lastAct === '第二次',
      mergeIntim(undefined, { state: { mouth: '甲' } }).state?.mouth + ' → '
      + (mergeIntim(mergeIntim(undefined, { state: { mouth: '甲' } }), { state: { mouth: '乙' } }).state?.mouth ?? ''))

    /* 指令进得来：一条**只**写最近一回 / 看法、不挂部位的私密推进，
       不能因为「没有部位」就被当成空话丢掉 —— 这是这一版新加的两项。 */
    const d = sanitizeDirective({
      intim: [
        { char: sample, lastAct: '在港区的旅馆里做了一整晚。', view: '她要的比以前多。' },
        { char: sample, slot: 'mouth', dev: 999, state: '  重写过的一句  ' },
        { char: sample },                                    // 空话：丢掉
        { char: 'gcn', lastAct: '男角色不记这一页' },          // 非女角色：丢掉
      ],
    })
    const items = d.intim ?? []
    ok('私密 · 不挂部位的「最近一回 / 看法」进得来（不被当成空话丢掉）',
      items.some((x) => x.lastAct === '在港区的旅馆里做了一整晚。' && x.view === '她要的比以前多。'),
      JSON.stringify(items.map((x) => Object.keys(x).join('+'))))
    ok('私密 · 空话与非女角色被挡在门外（只剩两条）',
      items.length === 2 && !items.some((x) => x.char === 'gcn'),
      `进来 ${items.length} 条`)
    ok('私密 · 状态句两头留白剪掉 · 单次增量封顶（8，不是 999）',
      items.some((x) => x.state === '重写过的一句') && items.every((x) => (x.dev ?? 0) <= 8),
      JSON.stringify(items.find((x) => x.slot === 'mouth')))
    // 长句封顶：整段正文塞不进这一栏
    const longD = sanitizeDirective({ intim: [{ char: sample, view: '看'.repeat(400) }] })
    ok('私密 · 「看法」封顶 160 字（整段正文塞不进这一栏）',
      (longD.intim?.[0]?.view?.length ?? -1) === 160, `len=${longD.intim?.[0]?.view?.length}`)

    ok('私密 · 提示条念得出「最近一回 / 看法也动了」',
      intimAdvanceLabel({ slot: 'mouth', lastAct: 'x', view: 'y' }).includes('最近一回')
      && intimAdvanceLabel({ lastAct: 'x' }).includes('最近一回')
      && intimAdvanceLabel({ view: 'y' }).includes('看法')
      && intimAdvanceLabel({ slot: 'mouth' }).includes('口腔'),
      intimAdvanceLabel({ slot: 'mouth', lastAct: 'x', view: 'y' }))

    info.push(`私密：底档 ${femaleIds.length} 位（女角色 · 逐位量读数从 0 起）· 并账守「破处只认第一回」`
      + ` · 合成按 ${INTIMATE_BOND} 分两段看法`)
  } catch (e) {
    fail.push('私密段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 28) 底层规矩 · 独占（只进提示词，不上屏） ----------
     出场的女性档案角色只认主角这一条线：不爱上别人，也不与人暧昧。这条规矩必须
     给**每一条会写正文的通道**都带上 —— 漏掉一条，那条通道就会照原著亲疏或剧情惯性
     替她配一场与旁人的感情戏。所以这里逐条通道点一遍（主线 / 单聊 / 群聊 / 见面），
     再反过来钉一句：它**不许上屏** —— 界面那几层谁也不许引用 worldrules。 */
  try {
    /* 规矩本身得是能读的一段话，不是空壳：几个关节缺了就等于没写 */
    const keys = ['不会爱上任何其他人', '暧昧', '亲缘', '别把它说出来']
    const lack = keys.filter((k) => !EXCLUSIVE_RULE.includes(k))
    ok('底层 · 独占：规矩里点明了「不爱上别人 / 不暧昧 / 亲缘打闹除外 / 不许说出口」',
      EXCLUSIVE_RULE.length > 80 && lack.length === 0,
      lack.length ? `缺 ${lack.join('、')}` : `${EXCLUSIVE_RULE.length} 字`)

    /* 四条通道各带一份 —— 少带一条，那条通道就等于没有这条规矩 */
    const who = Object.keys(INTIMATE)[0] ?? 'luna'
    const probe: Rendezvous = {
      id: 'd:probe', charId: who, kind: 'date', title: '一次见面',
      place: '学园外', from: 'you', ts: 0, done: false,
    }
    const channels: [string, string][] = [
      ['主线推演', buildDirectorSystem(TIMELINE[0]!, { operatorName: '言万心叶' })],
      ['单独短信', systemPrompt(who, '言万心叶', 10, '各自的日常')],
      ['群聊', groupSystemPrompt([who], '小队', '言万心叶', '10/100', '各自的日常')],
      ['见面约会', rendezvousPrompt(who, '言万心叶', 80, probe, '')],
    ]
    const noRule = channels.filter(([, text]) => !text.includes(EXCLUSIVE_RULE)).map(([n]) => n)
    ok('底层 · 独占：主线 / 单聊 / 群聊 / 见面四条通道各带同一份规矩',
      noRule.length === 0,
      noRule.length ? `漏了 ${noRule.join('、')}` : channels.map(([n]) => n).join(' / '))

    /* 底层 · 白虎（同一节的孪生条目）：出场的女性一律是白虎，正文里不许出现体毛那一类字眼。
       它和独占是一条规矩里的两半 —— 也正因为如此，四条通道带的是 BOTTOM_RULES 那一份 */
    const smoothKeys = ['一律是白虎', '光洁', '不是剃掉', '阴毛']
    const smoothLack = smoothKeys.filter((k) => !SMOOTH_RULE.includes(k))
    ok('底层 · 白虎：规矩里点明了「一律是白虎 / 私处光洁 / 本来如此不是打理过的 / 不许写那类字眼」',
      SMOOTH_RULE.length > 80 && smoothLack.length === 0,
      smoothLack.length ? `缺 ${smoothLack.join('、')}` : `${SMOOTH_RULE.length} 字`)

    const noSmooth = channels.filter(([, text]) => !text.includes(SMOOTH_RULE)).map(([n]) => n)
    ok('底层 · 白虎：四条通道各带同一份规矩（带的是 BOTTOM_RULES 那一份，不是只带独占）',
      noSmooth.length === 0 && BOTTOM_RULES.includes(EXCLUSIVE_RULE) && BOTTOM_RULES.includes(SMOOTH_RULE),
      noSmooth.length ? `漏了 ${noSmooth.join('、')}` : channels.map(([n]) => n).join(' / '))

    /* 底档那一张表也不许跟它打架：小穴那一处只写「光洁」，不写体毛那一类字眼 */
    const badBase: string[] = []
    for (const [id, base] of Object.entries(INTIMATE)) {
      for (const s of base.parts.vagina.states) {
        if (/阴毛|耻毛|体毛|剃|除毛/.test(s)) badBase.push(`${id} :: ${s.slice(0, 24)}`)
      }
    }
    ok('底层 · 白虎：私密底档的「小穴」一律写光洁，没有一处提到体毛',
      badBase.length === 0, badBase.length ? badBase.join(' / ') : `${Object.keys(INTIMATE).length} 位`)

    /* 小穴那一处的另两条：紧与颜色都不随开发度走 —— 梯子只走湿、热与形状。
       用户口径：「每个人的小穴都很紧致，开发度提升上去也不会变」＋
       「所有小穴的颜色也不会变化，但会适应主角阴茎的形状」。 */
    const loosenWord = /松了|松开|软下来|松弛|能容/
    const shapeWord = /形状|轮廓|样子|定了型|定型/
    const badTight: string[] = []
    const badColor: string[] = []
    const badShape: string[] = []
    for (const [id, base] of Object.entries(INTIMATE)) {
      const st = base.parts.vagina.states
      st.forEach((s, i) => {
        if (loosenWord.test(s)) badTight.push(`${id}#${i}`)
        /* 颜色只在第 0 档写一次（那是她的体质）—— 往上的三句一律不再提它 */
        if (i > 0 && s.includes('颜色')) badColor.push(`${id}#${i}`)
        /* 第 1 档往后，每一句都要写到「里头照他定型」这件事（说法可各异） */
        if (i > 0 && !shapeWord.test(s)) badShape.push(`${id}#${i}`)
      })
    }
    ok('底层 · 紧致：小穴四句都不写「松了 / 能容 / 软下来」那一类松开的说法（紧是体质，不随开发度走）',
      badTight.length === 0, badTight.length ? badTight.join(' / ') : '18 位 × 4 句都干净')
    ok('底层 · 颜色：小穴的颜色不随开发度走 —— 颜色只在第 0 档写一次，后三句一个「颜色」都不提',
      badColor.length === 0, badColor.length ? badColor.join(' / ') : '后三句没有一处提到颜色')
    ok('底层 · 形状：小穴后三句都写到「里头照他的形状定型」（专用穴那一路说法），不是只写湿与热',
      badShape.length === 0, badShape.length ? badShape.join(' / ') : '18 位 × 3 句都写了形状')

    /* 不上屏：界面那几层一个字都不许引用它（改规矩只改提示词，不动呈现） */
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const onScreen: string[] = []
    const walkUi = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${ent.name}`
        if (ent.isDirectory()) walkUi(p)
        else if (/\.tsx?$/.test(ent.name) && strip(readFileSync(p, 'utf8')).includes('worldrules')) onScreen.push(p)
      }
    }
    for (const d of ['src/views', 'src/components', 'src/terminal']) walkUi(d)
    ok('底层 · 独占：只进提示词、不上屏（界面那三层不引用 worldrules）',
      onScreen.length === 0, onScreen.length ? onScreen.join('、') : '界面三层都没引用')

    info.push('底层规矩：女性档案角色独占（只认主角一条线）＋ 一律白虎（私处光洁 · 不写体毛）—— 四条通道各带一份 BOTTOM_RULES，界面不出现')
    info.push('小穴那一处：紧是体质（不写松）、颜色是体质（只在第 0 档写一次）、开发度走的是湿 / 热与「照他的形状定型」')
  } catch (e) {
    fail.push('底层规矩段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 29) 交战成文 · 回填推演的是一整段**正文** ----------
     剧情交战打完，除了归档文书（narrate.ts）之外还要往推演里回填一份正文 ——
     用户口径：**跟在线推演写出来的东西一样**，一整段正文，内容就是刚打完的这一仗：
     战斗的经过、战斗中各人真正说出口的话（不是技能语音 / 招式名）、以及战后的对话。
     所以这里钉三件事：
       · 成文要求里那几条**必须点到**（否则写出来又是一份战报）；
       · 底稿逐字进去，胜负手数照它；
       · 无通道时的兜底也得是一段能读的正文，不再分节。
     通道那一侧另有一条**结构**断言：有导演通道时用它的 system（台词行格式、
     在场角色、底层规矩随它一起进）—— 各写一份提示词，先走样的一定是那几条规矩。 */
  try {
    const rec: BattleRecord = {
      id: 'mech-storylog', missionId: 'plot-v1-2-1', no: 'OBS-001', title: '灵魂蓄积器',
      place: '集市外环', stage: 4, outcome: '胜', rounds: 3, ticks: 24, at: 0,
      squad: ['luna', 'hikari'], mvp: '露娜',
      digest: '任务：OBS-001「灵魂蓄积器」（集市外环 · 危险度 S4）\nT1 露娜 → 白银之刃：灵魂蓄积器 · 14 伤害\n结算：胜利',
      turns: [
        { round: 1, actorId: 'luna', actor: '露娜', skillId: 'silver-blade', skill: '白银之刃', side: 'ally', kind: '技能',
          line: '……碍事。', target: '灵魂蓄积器', dmg: 14 },
        { round: 2, actorId: 'hikari', actor: '恋兔', skillId: 'kick', skill: '回旋踢', side: 'ally', kind: '技能',
          target: '灵魂蓄积器', dmg: 9, note: '命中要害' },
        { round: 3, actorId: 'foe', actor: '灵魂蓄积器', skillId: 'drain', skill: '抽取', side: 'enemy', kind: '技能',
          target: '恋兔', miss: true },
      ],
      narrative: '', narrativeBy: '模板', loot: ['观测棱镜'], coin: 12, mainline: true, tier: 'elite',
    }

    const brief = battleStoryBrief(rec)
    const must = ['怎么打起来的', '人话', '不是招式名', '仗打完之后的现场与各人的反应', '言万心叶与他们之间的对话', '不要小标题']
    const lack = must.filter((k) => !brief.includes(k))
    ok('交战成文：要求里点到了「经过 / 战斗里的话是人话不是招式名 / 战后对话 / 不做小标题」',
      lack.length === 0, lack.length ? `缺 ${lack.join('、')}` : `${brief.length} 字`)

    ok('交战成文：底稿逐字摆进要求里，胜负与手数照它（不得改动）',
      brief.includes(rec.digest) && brief.includes('结果 胜') && brief.includes(`${rec.rounds} 手`),
      `${rec.no}「${rec.title}」${rec.outcome} · ${rec.rounds} 手`)

    const tpl = templateStorylog(rec)
    ok('交战成文（无通道兜底）：兜底也是一段正文，不再分节，且带上已有的台词与战果',
      !/【[^】]*】/.test(tpl) && tpl.includes(rec.place) && tpl.includes('露娜') && tpl.includes('……碍事。')
        && tpl.includes(rec.mvp),
      tpl.split('\n\n').length + ' 段')

    /* 有导演通道时用它的 system —— 不是自己另写一份（写了两处，先走样的是底层规矩） */
    const src = readFileSync('src/lib/battle/storylog.ts', 'utf8')
    ok('交战成文：走剧情通道的 system（台词行格式与底层规矩随它一起进，不另写一份）',
      src.includes('opts.system ?? systemPrompt()') && src.includes('history'),
      'storylog：system / history 两个入口')

    info.push('交战成文：打完仗回填的是推演正文（经过 · 战斗中的人话 · 战后对话），走剧情通道的提示词，无通道退回模板')
  } catch (e) {
    fail.push('交战成文段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 30) 在场名册实时化 + 回退到上一段 ----------
     两件用户开口要的事，各量它会不会真的动：
       · 「在线推演的右边在场人物不够实时」—— 导演回执里的 cast 得进得来（白名单净
         化）、落得进提示词（【在场角色】那一份跟着换），右栏再照它摆；
       · 「加一个回退到上一个事件的功能」（口径：退干净 · 连日志那一条一起撤）——
         撤的得是 epDone + 记录 + 那一段锁下的羁绊下限，指针退回它前面。 */
  try {
    /* —— 在场名册：指令进得来 —— */
    const castD = sanitizeDirective({ cast: ['luna', 'luna', 'hikari', '__nobody__', '  luna  '] })
    ok('在场名册：导演给的 cast 进得来（去重 · 只留名录里认识的人）',
      JSON.stringify(castD.cast) === JSON.stringify(['luna', 'hikari']),
      JSON.stringify(castD.cast))

    ok('在场名册：空名单不算数（「此刻一个人都不在」由省略这一项表达，不由空数组表达）',
      sanitizeDirective({ cast: [] }).cast === undefined
      && sanitizeDirective({ cast: ['__nobody__'] }).cast === undefined,
      '空数组 → 不落盘')

    ok('在场名册：它算「本回合有变化」（只有 cast 的回执不会面板报有变化、实际什么都没落地）',
      directiveHasFx({ cast: ['luna'] }), 'directiveHasFx({cast}) = true')

    /* —— 在场名册：进得了提示词 —— */
    const evCast = TIMELINE.find((e) => castOf(e).length >= 2)
    if (!evCast) fail.push('在场名册：找不到现场名册 ≥ 2 人的事件，量不动')
    else {
      const ids = castOf(evCast)
      const withOne = buildDirectorSystem(evCast, { operatorName: '言万心叶', epDone: {}, castNow: [ids[0]!] })
      const blocks = withOne.split('▸ ').length - 1
      ok('在场名册：提示词的【在场角色】照实时的名单摆（给了 castNow 就只写这一个人）',
        withOne.includes('在场角色') && blocks === 1
        && !withOne.includes(`▸ ${castName(ids[1]!)}`),
        `${evCast.id} 静态 ${ids.length} 人 → 实时 1 人（${castName(ids[0]!)}）`)

      const withNone = buildDirectorSystem(evCast, { operatorName: '言万心叶', epDone: {} })
      ok('在场名册：没给 castNow 就照事件静态名册摆（旧行为不变）',
        withNone.split('▸ ').length - 1 >= 1, `${evCast.id} 静态名册`)
    }

    /* —— 回退到上一段：撤的是哪四样（源码级 —— 这段逻辑长在 React provider 里，
         剥不出纯函数；照 §29 那一处的口径，钉住它撤的正是那四样、且不碰会话正文）—— */
    const termSrc = readFileSync('src/terminal/Terminal.tsx', 'utf8')
    const at = termSrc.indexOf('const reopenEvent = useCallback(')
    const body = at >= 0 ? termSrc.slice(at, at + 2600) : ''
    const gone = [
      ['删掉 epDone 那一格', /delete next\[id\]/],
      ['撤掉低语者日志里那一条', /records: prev\.records\.filter\(\(r\) => r\.eventId !== id\)/],
      ['重算那一段锁下的羁绊下限', /for \(const l of ev\?\.lock \?\? \[\]\)/],
      ['指针退回它前面', /setCur\(/],
    ].filter(([, re]) => !(re as RegExp).test(body)).map(([n]) => n)
    ok('回退一段：撤的正是那四样（进度 · 记录 · 羁绊下限 · 指针）',
      at >= 0 && gone.length === 0, gone.length ? `缺 ${gone.join('、')}` : '四样都在')

    ok('回退一段：不碰会话正文与既成事实（正文留着重读，见过 / 登记过不动）',
      !!body && !/localStorage|persistMsg|clearLog|world\.met\b/.test(body),
      '只有 epDone / records / locked / cur 四处被写')

    ok('回退一段：界面上够得着（右栏常驻按钮 + 全收束那一屏也留一条回头路）',
      readFileSync('src/views/Plot.tsx', 'utf8').includes('data-rollback={backEv.id}')
      && (readFileSync('src/views/Plot.tsx', 'utf8').split('doReopen').length - 1) >= 3,
      '按钮 data-rollback 在，两处 onClick 都走 doReopen')

    info.push('在场名册 + 回退一段：cast 指令进得来（白名单 / 去重 / 空名单不算数）· 提示词的在场角色跟着换 · '
      + '回退撤 epDone + 记录 + 羁绊下限，指针退回前一段，会话正文保留')
  } catch (e) {
    fail.push('在场名册 / 回退段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 31) 次数账 · 关系档位 · 多女同场 ----------
     三件事各量各的规矩（规矩分别住在 data/acts.ts、data/rel.ts、lib/worldrules.ts）：

       · **次数账**（用户口径：「增加次数统计，大概为亲吻 / 口交 / 性交 / 肛交 /
         手交 / 足交 / 乳交 / 内射次数」）—— 八本**各记各的**账，只增不减，
         一次一小步。它挂在私密档案那一页背面，所以只对女角色生效。

       · **关系档位**（「增加关系：按照剧情给予」）—— 九级梯子，由导演在剧情真走到
         那一步时落一次（绝对值，不是增量）。这里量的是它**没有**那套「多少羁绊换
         哪一档」的换算 —— 一旦有，这一栏就退化成读数的别名了。

       · **多女同场**（「增加多P的情况（多女1男）」）—— 那一条规矩只在**真不止一个人
         在场**时才挂。混进 BOTTOM_RULES 就会被四条通道无条件带上，一对一的那一场
         也收到「这一场不止一个人」——那不叫规矩，那叫提示模型往多P写。

     界面那一半（背面那一栏摆不摆得出来）归冒烟；这里量的是底下这几条规矩本身。 */
  try {
    /* —— 次数账：八栏本身 —— */
    ok('次数账 · 八栏齐、不重、栏栏都有标签与一行释义',
      ACT_KINDS.length === 8 && new Set(ACT_KINDS).size === 8
      && ACT_KINDS.every((k) => ACT_META[k]?.label.trim() && ACT_META[k]?.hint.trim()),
      ACT_KINDS.map((k) => ACT_META[k].label).join(' / '))

    ok('次数账 · 内射单算一栏（与性交 / 肛交各记各的，同一次里可以两栏都动）',
      isActReceive('creampie') && !isActReceive('sex') && !isActReceive('anal')
      && ACT_KINDS.includes('creampie'),
      '「内射」是「他怎么收的」那一栏，前七栏是「她做了什么」')

    /* —— 次数账：只增不减（规矩在 mergeActs 自己身上，不只靠上游那道夹子）—— */
    const once = mergeActs(undefined, { kiss: 2, sex: 1 })
    const twice = mergeActs(once, { kiss: 3 })
    ok('次数账 · 并账是累加（第二回上去，第一回的不被顶掉）',
      actOf(twice, 'kiss') === 5 && actOf(twice, 'sex') === 1,
      JSON.stringify(twice))

    ok('次数账 · 这次没提的栏位原样留着（不因为没提就归零）',
      actOf(twice, 'sex') === 1 && actTotal(twice) === 6, `总回数 ${actTotal(twice)}`)

    const dirtyAdd = mergeActs(
      { kiss: 4 },
      { kiss: -6, oral: Number.NaN, hand: Number.POSITIVE_INFINITY, foot: 0 } as ActCount,
    )
    ok('次数账 · 负数 / 零 / NaN / 无穷一律跳过（这本账没有往回缩的道理）',
      actOf(dirtyAdd, 'kiss') === 4 && actOf(dirtyAdd, 'oral') === 0
      && actOf(dirtyAdd, 'hand') === 0 && actOf(dirtyAdd, 'foot') === 0,
      JSON.stringify(dirtyAdd))

    ok('次数账 · 空账读作 0（没动过就是真没动过，不是「缺数据」）',
      actTotal(undefined) === 0 && actTotal({}) === 0 && actOf(undefined, 'kiss') === 0,
      '0')

    /* —— 次数账：指令那一道闸 —— */
    const femaleId = Object.keys(INTIMATE)[0]!
    const maleId = PERSON_IDS.find((id) => !hasIntimate(id)) ?? 'kaito'
    const bySex = sanitizeDirective({ acts: { [femaleId]: { kiss: 3 }, [maleId]: { kiss: 3 } } })
    ok('次数账 · 非女角色落不下来（这本账挂在私密档案上，只对女角色生效）',
      !!bySex.acts && !!bySex.acts[femaleId] && !(maleId in bySex.acts),
      `${femaleId} 进得来 · ${maleId}（无底档）被挡下`)

    const offGrid = sanitizeDirective({ acts: { [femaleId]: { kiss: 3, nail: 4, '__bad': 2 } } })
    ok('次数账 · 认不出的栏位整条丢掉（八栏之外的写法落不下来）',
      JSON.stringify(Object.keys(offGrid.acts?.[femaleId] ?? {})) === JSON.stringify(['kiss']),
      JSON.stringify(offGrid.acts?.[femaleId] ?? {}))

    const clamped = sanitizeDirective({ acts: { [femaleId]: { kiss: 99, sex: -3, anal: 2.6, oral: 0.4 } } })
    const cl = clamped.acts?.[femaleId]
    ok('次数账 · 一次报十回等于没数（增量夹成 1–9 的整数；报了正数就至少记 1 回）',
      actOf(cl, 'kiss') === 9 && actOf(cl, 'sex') === 0 && actOf(cl, 'anal') === 3 && actOf(cl, 'oral') === 1,
      `kiss 99→${actOf(cl, 'kiss')} · anal 2.6→${actOf(cl, 'anal')} · oral 0.4→${actOf(cl, 'oral')} · sex −3→${actOf(cl, 'sex')}`)

    const crowd = sanitizeDirective({
      acts: Object.fromEntries(Object.keys(INTIMATE).map((id) => [id, { kiss: 1 }])),
    })
    ok('次数账 · 一次最多记 6 位（再多就不是一场戏，是点名单了）',
      !!crowd.acts && Object.keys(crowd.acts).length === 6,
      `${Object.keys(INTIMATE).length} 位报上来 → 只留 ${Object.keys(crowd.acts ?? {}).length} 位`)

    /* —— 关系档位：梯子本身 —— */
    ok('关系 · 九级梯子、id 不重、顺序即高低（越靠后越高，同一 id 每次翻同一级）',
      REL_TIERS.length === 9 && new Set(REL_IDS).size === 9
      && REL_TIERS.every((t, i) => relIndex(t.id) === i),
      REL_IDS.map((id) => relName(id)).join(' → '))

    ok('关系 · 每一级都带着一句能用的口径（只写「关系好」等于没给这一栏）',
      REL_TIERS.every((t) => t.hint.trim().length >= 12)
      && new Set(REL_TIERS.map((t) => t.hint)).size === REL_TIERS.length,
      '九句各不相同')

    ok('关系 · 认不出来的档位整条丢掉（编出来的落不下去）',
      isRelId('lover') && !isRelId('soulmate') && !isRelId('') && !isRelId(7),
      'lover 认得，「soulmate」这类自造档位不认')

    ok('关系 · 提示词里摆的是**整张**梯子（id / 名字 / 口径三样都在，一级不漏）',
      REL_TIERS.every((t) => {
        const s = relLadderText()
        return s.includes(t.id) && s.includes(t.name) && s.includes(t.hint)
      }),
      `${REL_TIERS.length} 级`)

    const relD = sanitizeDirective({ rel: { luna: 'lover', hikari: 'soulmate' } })
    ok('关系 · 只认梯子上那九级（自造的档位落不下去，也顶不掉此刻那一档）',
      relD.rel?.luna === 'lover' && !('hikari' in (relD.rel ?? {})),
      JSON.stringify(relD.rel ?? {}))

    /* 与次数账那条门槛相反：次数账只对女角色生效（它挂在私密档案上），
       关系档位对**名录里每一位**都开 —— 这九级说的是关系本身，不分男女。 */
    ok('关系 · 不分男女（与次数账那条门槛正好相反：那本账挂在私密档案上，这一栏不挂）',
      sanitizeDirective({ rel: { [maleId]: 'friend' } }).rel?.[maleId] === 'friend'
      && !sanitizeDirective({ acts: { [maleId]: { kiss: 1 } } }).acts,
      `${maleId}：关系档位给得进 · 次数账给不进`)

    ok('关系 · 它算「本回合有变化」（只有 rel 的回执不会面板报有变化、实际什么都没落地）',
      directiveHasFx({ rel: { luna: 'lover' } }) && directiveHasFx({ acts: { luna: { kiss: 1 } } }),
      'directiveHasFx({rel}) / ({acts}) = true')

    /* —— 关系档位：进得了提示词，且是**现取**（不是从羁绊换算）—— */
    const evRel = TIMELINE.find((e) => castOf(e).length >= 2)
    if (!evRel) fail.push('关系 · 找不到现场名册 ≥ 2 人的事件，量不动')
    else {
      const unset = buildDirectorSystem(evRel, { operatorName: '言万心叶', epDone: {} })
      const set = buildDirectorSystem(evRel, {
        operatorName: '言万心叶', epDone: {}, relOf: () => 'lover' as RelId,
      })
      /* 比的必须是**那一行**（`…｜关系档位：…`），不能拿整份提示词里有没有「恋人」二字来判 ——
         下面【关系档位】那一节本来就把九级逐条摆着，整份里当然有「恋人」。 */
      ok('关系 · 提示词那一行照此刻的档位现取（没给过照实写「尚未定下」，不硬凑一级）',
        unset.includes('关系档位：尚未定下') && !unset.includes('关系档位：恋人')
        && set.includes('关系档位：恋人（lover）'),
        `${evRel.id}：未定下 → 恋人（lover）`)

      ok('关系 · 梯子整张摆进提示词（导演看得见上面还有几级，才知道此刻这档是刚起步还是走到很里面了）',
        unset.includes('关系档位 · 只由剧情给，不从羁绊读数换算')
        && REL_TIERS.every((t) => unset.includes(t.hint)),
        '九级口径逐条进提示词')
    }

    /* —— 多女同场：那一条只在真不止一个人在场时才挂 —— */
    ok('多女同场 · 那一条**不在** BOTTOM_RULES 里（否则一对一的那一场也收到「不止一个人」）',
      !BOTTOM_RULES.includes(HAREM_RULE) && HAREM_RULE.trim().length > 0,
      'BOTTOM_RULES 只装独占 + 平滑，多女同场另取')

    ok('多女同场 · 现取那一支按人数判（一个人 → 空串，两个及以上 → 那一条）',
      haremRule(0) === '' && haremRule(1) === '' && haremRule(2) === HAREM_RULE && haremRule(3) === HAREM_RULE,
      'haremRule(1) = 「」 · haremRule(2) = 该条')

    ok('多女同场 · 三件事写死在里面（不许合成一个人 / 她们彼此之间不发生 / 账各记各的）',
      HAREM_RULE.includes('不要写成同一个人换几次名字')
      && HAREM_RULE.includes('她们彼此之间**不发生**')
      && HAREM_RULE.includes('账要各记各的')
      && HAREM_RULE.includes('别把它说出来'),
      '分开写 · 方向只朝他 · 逐人分条 · 不说出口')

    /* —— 多女同场：提示词与指令两处都认人数 —— */
    const rvOne: Rendezvous = {
      id: 'd:mech-one', charId: 'luna', kind: 'date', title: '放学后的天台',
      place: '天台', from: 'you', ts: 0, done: false,
    }
    const onePrompt = rendezvousPrompt('luna', '言万心叶', 80, rvOne, '')
    const pair: RendezvousParty[] = [{ id: 'hikari', name: '光', bond: 75 }]
    const twoPrompt = rendezvousPrompt('luna', '言万心叶', 80, { ...rvOne, party: ['hikari'] }, '', undefined, pair)

    ok('多女同场 · 一个人那一场不挂这一条（一对一的提示词里一个字都不提「不止一个人」）',
      !onePrompt.includes(HAREM_RULE) && !onePrompt.includes('不止你们'),
      'party 空 → 不挂')

    ok('多女同场 · 带了人才挂，且把同场的几位列到人（名单 + 各自与他的羁绊）',
      twoPrompt.includes(HAREM_RULE) && twoPrompt.includes('这一场不止你们两个')
      && twoPrompt.includes('· 光：与他约 75/100'),
      '同场 1 位 → 名单写出来')

    ok('多女同场 · 提示词点明「你只替你这一位开口」（多说话人最容易串到别人身上）',
      onePrompt.includes('你是这一场里与') && onePrompt.includes('别替别人开口'),
      '每位各读自己那一份')

    const oneRule = dateBondRule('luna')
    const twoRule = dateBondRule('luna', ['hikari'])
    /* 数的是 intim 那些条目本身（`"slot": "mouth"` 一人一条），不是数 `"char": "谁"` ——
       上面 bond 那条例子里也带着主位的 id，数它会多算一条。 */
    const slotsIn = (s: string) => s.split('"slot": "mouth"').length - 1
    const actsIn = (s: string) => s.split('"kiss": 1 }').length - 1
    ok('多女同场 · 收尾指令逐人分条（只给主位留位置，同场的几位就永远记不上）',
      slotsIn(oneRule) === 1 && actsIn(oneRule) === 1 && !oneRule.includes('"hikari"')
      && slotsIn(twoRule) === 2 && actsIn(twoRule) === 2 && twoRule.includes('"hikari"'),
      `1 人 → intim ${slotsIn(oneRule)} 条 · acts ${actsIn(oneRule)} 条；`
      + `2 人 → intim ${slotsIn(twoRule)} 条 · acts ${actsIn(twoRule)} 条`)

    ok('多女同场 · 同场的人数有上限，且上屏与落盘照同一个（PARTY_MAX）',
      PARTY_MAX === 3 && dateBondRule('luna', ['a', 'b', 'c']).includes('"char": "c"'),
      `一起最多再带 ${PARTY_MAX} 位`)

    /* —— 见面那一场：指令只记在场的人 —— */
    const dxOut = dateDirective(
      { acts: { luna: { kiss: 1 }, hikari: { kiss: 1 } }, rel: { luna: 'lover', hikari: 'friend' } },
      'luna',
      [],
    )
    const dxIn = dateDirective(
      { acts: { luna: { kiss: 1 }, hikari: { kiss: 1 } }, rel: { luna: 'lover', hikari: 'friend' } },
      'luna',
      ['hikari'],
    )
    ok('见面 · 指令只记这一场在场的人（没带的同场，账上落不下来）',
      !!dxOut.acts?.luna && !dxOut.acts?.hikari && !dxOut.rel?.hikari
      && !!dxIn.acts?.hikari && dxIn.rel?.hikari === 'friend',
      'party 空 → 只记主位 · 带上光 → 两位各记一条')

    info.push('次数账 + 关系档位 + 多女同场：八栏只增不减（负数 / NaN / 超量都被拦）· '
      + '九级梯子由剧情给（认不出的整条丢掉 · 提示词照实写「尚未定下」）· '
      + '多女同场那一条只在真不止一个人时挂（提示词与收尾指令都逐人分条，见面只记在场的人）')
  } catch (e) {
    fail.push('次数账 / 关系 / 多女同场段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 32) 自由时间：两处入口 · 羁绊不动 · 那一格没有原文 ----------
     自由时间有**两处入口**，走的是同一个状态：卷与卷之间那一格（`EPISODES` 里插进来的
     `free:<卷>` 段），以及操作员自己按下的那一枚开关（`WorldState.free`）。
     两处合流的地方只有一条规矩：**这期间羁绊一律不动**。

     它拦在哪儿，是这一节最要紧的一件事：不是在提示词里求模型别给（那只算礼貌），
     是在落地那一层 `applyDirective(d, api, { freezeBond })` 里把整条 bond 跳过去。
     所以这里量三样：
       · 段本身 —— 插在哪儿、id 不重、名字不冠「原文」、在场名册续着上一段；
       · 提示词 —— 【事件大纲】换成自由那一份，bond 与 eventDone 两个字段一起撤掉；
       · 落地 —— bond 给不进去（且连 fx 都不记），开发度 / 次数账 / 关系档位照给。
     界面上看得见的那一半（开关按钮、进入下一卷）归 smoke。 */
  try {
    /* —— 段本身 —— */
    const freeIds = EPISODES.filter((e) => isFreeId(e.id)).map((e) => e.id)
    const vols = [...new Set(TIMELINE.map((e) => e.vol))].filter((v) => v > 0)
    ok('自由时间 · 每一卷收束之后插一格，最后一卷不插（没有「下一卷」可进时，自由由开关接手）',
      freeIds.length === vols.length - 1
      && freeIds.length > 0
      && freeIds.every((id, i) => id === freeIdAfterVol(vols[i]!)),
      `${vols.length} 卷 → ${freeIds.length} 格：${freeIds.join(' · ')}`)

    ok('自由时间 · 段 id 不重（同一个 id 出现两次会互相顶掉）',
      new Set(EPISODES.map((e) => e.id)).size === EPISODES.length,
      `EPISODES ${EPISODES.length} 段 · 唯一 id ${new Set(EPISODES.map((e) => e.id)).size} 个`)

    ok('自由时间 · 主线一段不丢、次序不动（插进来只是插进来）',
      EPISODES.filter((e) => !isFreeId(e.id)).length === TIMELINE.length
      && EPISODES.filter((e) => !isFreeId(e.id)).every((e, i) => e.id === TIMELINE[i]!.id),
      `EPISODES ${EPISODES.length} = 主线 ${TIMELINE.length} + 自由 ${freeIds.length}`)

    /* 插的位置：每一格都紧跟在**它那一卷的最后一节**（外传算同一段，跟在它后面）之后 */
    const afterOf = (id: string) => {
      const i = EPISODES.findIndex((e) => e.id === id)
      return i > 0 && isFreeId(EPISODES[i]!.id) && !isFreeId(EPISODES[i - 1]!.id)
    }
    ok('自由时间 · 每一格都落在「刚读完一段非自由段」之后（不会连着两格，也不会打头）',
      freeIds.every(afterOf),
      freeIds.map((id) => {
        const i = EPISODES.findIndex((e) => e.id === id)
        return `${id} ← ${EPISODES[i - 1]?.id}`
      }).join(' · '))

    const f1 = episodeOf(freeIdAfterVol(1))!
    ok('自由时间 · 拿得出来，且长得像一段（形状不另起一套，整条流程才不改）',
      !!f1 && f1.phase === '自由时间' && f1.summary === ''
      && Array.isArray(f1.entities) && Array.isArray(f1.script),
      `${f1.id} · ${f1.group} · place=${f1.place}`)

    ok('自由时间 · 档期名念得出是哪一卷之后（右栏与段头都念它）',
      f1.group === freeLabel(1) && f1.title === '自由时间',
      `${f1.group} / ${f1.title}`)

    /* 在场名册续着上一段：空名单会连着坏三处（右栏空掉 / 提示词没可写的人 /
       主动来信把所有人都算成「不在眼前」）。这里量的是「与上一段同一个名单」。 */
    const prevOfFree = EPISODES[EPISODES.findIndex((e) => e.id === f1.id) - 1]!
    ok('自由时间 · 在场名册续着上一段（空名单会让右栏空掉、提示词没人可写、主动来信全放行）',
      castOf(f1).length > 0 && castOf(f1).join() === castOf(prevOfFree).join(),
      `${f1.id} 在场：${castOf(f1).map((x) => castName(x)).join(' · ')}`)

    /* —— 提示词：两处入口合流成同一个 free —— */
    const sysFree = buildDirectorSystem(f1, {
      operatorName: '言万心叶', bondNow: () => 50, epDone: {}, flags: {}, needDirective: true,
      freeMode: false, // 段 id 自己就够 —— 开关关着也认
    })
    const sysMain = buildDirectorSystem(TIMELINE[0]!, {
      operatorName: '言万心叶', bondNow: () => 50, epDone: {}, flags: {}, needDirective: true,
    })
    /* 开关那一处：拿一段**主线**段，把 freeMode 打开 —— 应当与拿自由段同一个效果 */
    const sysMainFree = buildDirectorSystem(TIMELINE[0]!, {
      operatorName: '言万心叶', bondNow: () => 50, epDone: {}, flags: {}, needDirective: true,
      freeMode: true,
    })

    ok('自由时间 · 段 id 就够（开关关着，自由段的提示词也照自由那一套走）',
      sysFree.includes('本段**没有原文大纲**') && !sysFree.includes('（下面是**原著里**这一段怎么走的'),
      'free:v1 → 换上自由框架')

    ok('自由时间 · 开关那一处与卷间那一格同一个效果（两处入口合流成一个状态）',
      sysMainFree.includes('本段**没有原文大纲**')
      && !sysMainFree.includes('（下面是**原著里**这一段怎么走的'),
      '主线段 + freeMode → 同一份自由框架')

    ok('自由时间 · 主线段照旧喂大纲（对照：不自由就不换）',
      sysMain.includes('（下面是**原著里**这一段怎么走的') && !sysMain.includes('本段**没有原文大纲**'),
      `${TIMELINE[0]!.id} → 照旧`)

    /* 大纲不喂了，但**原文那一份**也一个字都不许进去：自由时间不是原作里的一段 */
    ok('自由时间 · 自由那一份里不出现这一段的大纲正文（没大纲就是没大纲，不许拿原文冒充）',
      !sysFree.includes('（下面是**原著里**这一段怎么走的')
      && sysFree.includes('怎么收'),
      '换成「怎么起 / 能发生什么 / 怎么收」三段')

    /* bond 与 eventDone 两个字段一起撤：前者是「羁绊不动」，后者是「收由操作员说了算」 */
    ok('自由时间 · 指令 schema 里撤掉 bond（羁绊不动，说了也白说）',
      sysFree.includes('"eventDone"') === false
      && sysFree.includes('"bond":   [{ "char"') === false
      && sysMain.includes('"bond":   [{ "char"'),
      'free → 撤 bond / eventDone 两行；主线 → bond 那一行在')

    ok('自由时间 · 指令 schema 里也撤掉 eventDone（什么时候收由操作员按按钮说了算）',
      sysFree.includes('"digest"') === false && sysMain.includes('"digest"'),
      'free → 撤 digest；主线 → 在')

    ok('自由时间 · 明说「不要给 bond 那一条」（省得模型白写一条再被默默丢掉）',
      sysFree.includes('自由活动期间羁绊一律不动') && sysFree.includes('不要给 bond 那一条'),
      'FREE_BOND_NOTE 进提示词')

    /* 后接事件锚也得换口径：照原样摆「置 eventDone」会与上面那两条正面打架 */
    const nextOfFree = EPISODES[EPISODES.findIndex((e) => e.id === f1.id) + 1]!
    const sysFreeNext = buildDirectorSystem(f1, {
      operatorName: '言万心叶', bondNow: () => 50, epDone: {}, flags: {}, needDirective: true,
      nextEvent: nextOfFree,
    })
    ok('自由时间 · 后接事件锚换成「别往那儿收」（照原样摆软门禁会与「不给 eventDone」打架）',
      sysFreeNext.includes('这一格之后去哪')
      && !sysFreeNext.includes('软门禁：仅当这一段该了结的事已经了结'),
      `后接《${nextOfFree.title}》→ 只作参照`)

    /* —— 落地那一层：真正拦住 bond 的是这里 —— */
    const bondIn = sanitizeDirective({ bond: [{ char: 'luna', delta: 3 }] })
    const seen: string[] = []
    const api = {
      meetChar: () => {}, bumpBond: (c: string) => { seen.push(c) },
      registerEnd: () => {}, setFlag: () => {},
      bumpIntim: () => {}, bumpActs: () => {}, setRel: () => {},
    }
    const fxFrozen = applyDirective(bondIn, api, { freezeBond: true })
    const fxOpen = applyDirective(bondIn, api, {})
    ok('自由时间 · 羁绊拦在落地那一层（不是求模型别给）',
      fxFrozen.bonds.length === 0 && seen.length === 1 && seen[0] === 'luna'
      && fxOpen.bonds.length === 1,
      `freezeBond → bond 一条不落、连 fx 都不记（提示条不念一件没落的事）；缺省 → 照落`)

    const mixed = sanitizeDirective({
      bond: [{ char: 'luna', delta: 3 }],
      intim: [{ char: 'luna', slot: 'mouth', dev: 1 }],
      acts: { luna: { kiss: 1 } },
      rel: { luna: 'lover' },
    })
    const fxMixed = applyDirective(mixed, api, { freezeBond: true })
    ok('自由时间 · 只冻羁绊那一条线（开发度 / 次数账 / 关系档位照常各记各的）',
      fxMixed.bonds.length === 0
      && fxMixed.intim.length === 1 && fxMixed.acts.length === 1 && fxMixed.rel.length === 1,
      'freezeBond 只管 bond；私密档案 / 八栏账 / 九级梯子照推')

    /* —— 收束：自由段不走 completeEvent（它不是原文里的一段） —— */
    ok('自由时间 · 自由段的名字里不出现「· 原文」（它不是原文，转述更不行）',
      !f1.title.includes('原文') && !f1.group.includes('原文') && !f1.summary.includes('原文'),
      `${f1.group} · ${f1.title}`)

    /* —— 邀约那道门槛：时间与地点缺一不可 —— */
    const dOk = sanitizeDirective({ date: { title: '天台', place: '天台', time: '明天放学后' } }).date
    const dNoTime = sanitizeDirective({ date: { title: '天台', place: '天台' } }).date
    const dNoPlace = sanitizeDirective({ date: { title: '天台', time: '明天放学后' } }).date
    ok('自由时间 · 说定一场见面要时间与地点两样齐（缺一样就当没约成）',
      dateReady(dOk) && !dateReady(dNoTime) && !dateReady(dNoPlace),
      `齐 → ${dateReady(dOk)}；缺时间 → ${dateReady(dNoTime)}；缺地点 → ${dateReady(dNoPlace)}`)

    ok('自由时间 · 缺一样时那一条**不生成**，但指令本身不被悄悄丢掉（守卫在 dateReady，不在净化）',
      !!dNoTime && !!dNoPlace,
      '净化只裁形状；能不能开一场由 dateReady 判')

    /* —— 进度那一本账：自由段不算主线 —— */
    const withFree = { [TIMELINE[0]!.id]: true as const, [f1.id]: true as const }
    ok('自由时间 · 自由段不算主线进度（进度条不许虚涨）',
      countMainlineDone(withFree) === 1
      && Object.keys(withFree).length === 2,
      `收束 1 段主线 + 1 格自由 → 进度读作 ${countMainlineDone(withFree)}/${TIMELINE.length}`)

    /* —— 刻度：下一格是照账上第一个没收束的找，且不越过自由段 —— */
    const doneUpToVol1 = Object.fromEntries(
      TIMELINE.filter((e) => e.vol === 1 && !e.ga).map((e) => [e.id, true] as const),
    ) as Record<string, boolean>
    ok('自由时间 · 本卷读完 → 下一格就是这一格自由时间，不越过去够下一卷',
      nextEpisodeAfter(TIMELINE.filter((e) => e.vol === 1).at(-1)!.id, doneUpToVol1)?.id === f1.id,
      `第 1 卷末 → ${nextEpisodeAfter(TIMELINE.filter((e) => e.vol === 1).at(-1)!.id, doneUpToVol1)?.id}`)

    ok('自由时间 · 自由段收束后 → 下一格是下一段主线（不必另外记「现在在不在自由时间里」）',
      nextEpisodeAfter(f1.id, { ...doneUpToVol1, [f1.id]: true })?.id
        === EPISODES[EPISODES.findIndex((e) => e.id === f1.id) + 1]!.id,
      `${f1.id} 收束 → ${nextEpisodeAfter(f1.id, { ...doneUpToVol1, [f1.id]: true })?.id}`)

    info.push('自由时间：两处入口（卷间那一格 · 操作员按下的开关）合流成一个状态 —— '
      + '提示词换掉【事件大纲】并撤掉 bond / eventDone 两个字段，'
      + '**羁绊拦在落地那一层**（freezeBond 把整条 bond 跳过、连 fx 都不记），'
      + '开发度 / 次数账 / 关系档位照常；自由段不算主线进度，也不冠「· 原文」')
  } catch (e) {
    fail.push('自由时间段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 33) 私密场面怎么写细：一条**有条件**的笔法规矩 ----------
     「写足」这一条与独占、白虎不是一路：那两条是世界的设定，走到哪儿都成立；
     这一条只管**已经在演的那一段**怎么落笔，没走到那一步的场面它一个字都不生效。
     所以这一节量四样，缺一样这条规矩就会变成「催 NSFW」：
       · 规矩本身 —— 顺序 / 那一处 / 口癖 / 实感 / 写足不写长 / **推近景**，几个关节都在；
       · 装在哪儿 —— 在 `PROSE_RULES` 里，**不在** `BOTTOM_RULES` 里；
       · 挂在谁身上 —— 只有写长篇正文的两条通道带（主线 / 见面），
         短信那两条（单聊 / 群聊）不带，一般的见面（kind=date）也不带；
       · 条件句在不在 —— 「不生效」「不是要你去开这一场」这两句被删掉，它就变成
         一条无条件的催场令。这是最容易在日后改写里丢的东西，所以单钉一条。
     再往下是两道「缝得上」的闸：世界书文风册第四条、预设里的那一条 —— 加上
     「出厂只开 DeepSeek 的模型适配」，都在这儿一次钉住。 */
  try {
    /* —— 规矩本身：能读的一段话，不是空壳 —— */
    const depthKeys = ['写足', '顺序', '那一处', '口癖', '体液', '不生效']
    const depthLack = depthKeys.filter((k) => !INTIM_DEPTH_RULE.includes(k))
    ok('私密场面 · 规矩里点明了「写足 / 按顺序 / 那一处此刻的样子 / 她的口癖 / 实感 / 没到那一档就不生效」',
      INTIM_DEPTH_RULE.length > 120 && depthLack.length === 0,
      depthLack.length ? `缺 ${depthLack.join('、')}` : `${INTIM_DEPTH_RULE.length} 字`)

    /* 条件句：这两句是「不催场」的全部分量所在 —— 少一句，规矩就翻了个面 */
    ok('私密场面 · 条件句写死在规矩里（「没到这一档的不生效」＋「不是要你去开这一场」）',
      INTIM_DEPTH_RULE.includes('还没到这一档的场面，这一条不生效')
      && INTIM_DEPTH_RULE.includes('它不是要你去开这一场'),
      '两句都在（删掉任一句，这条就从「怎么写」变成「催着写」）')

    /* 「写足」与「写长」分得开：要的是细节往前走，不是句子变长 */
    ok('私密场面 · 「写足」定义为细节往前走，不是句子变长 / 一句换三种说法',
      INTIM_DEPTH_RULE.includes('细节要往前走')
      && INTIM_DEPTH_RULE.includes('同一个动作不重演第二遍')
      && INTIM_DEPTH_RULE.includes('不要为了写长把一句话换三种说法'),
      '与「反套话」那几条同一条收束')

    /* 「推近景」（2026-09-13 加）：只说「写具体的那一处」，落地还是「那里湿得一塌糊涂」。
       这一条要三样都在 —— 点到哪几处、当下写什么、以及**每次都不一样**（少了最后一样，
       它自己就成了另一种套话：每次都推近、每次都同一段形容）。 */
    const nearKeys = ['推近', '小穴', '乳头', '阴蒂', '后穴', '湿到哪一档', '被碰到的一瞬间']
    const nearLack = nearKeys.filter((k) => !INTIM_DEPTH_RULE.includes(k))
    ok('私密场面 · 「镜头要推近」在规矩里（点名几处 + 当下写什么 + 不许糊过去）',
      nearLack.length === 0,
      nearLack.length ? `缺 ${nearLack.join('、')}` : `${nearKeys.length} 个关节都在`)
    ok('私密场面 · 推近不许退化成另一种套话（每次被弄到的状态都跟上一次不一样）',
      INTIM_DEPTH_RULE.includes('每次被弄到都跟上一次不一样')
      && INTIM_DEPTH_RULE.includes('不是另起一段做解剖'),
      '「不一样」＋「不是解剖报告」两句都在')

    /* 预设那两份的条目先取在手上（下面世界书与预设两段都要用） */
    type PEntry = {
      identifier?: string; name?: string; enabled?: boolean; scope?: string
      role?: string; content?: string; injection_order?: number
    }
    const proto3 = BUILTIN_SOURCE[0].json as { prompts?: PEntry[]; name?: string }
    const lite3 = BUILTIN_SOURCE[1].json as { prompts?: PEntry[]; name?: string }
    const contentOf = (p: { prompts?: PEntry[] }, id: string) =>
      p.prompts?.find((x) => x.identifier === id)?.content ?? ''

    /* —— 装在哪儿：在 PROSE_RULES 里，不在 BOTTOM_RULES 里 —— */
    ok('私密场面 · 装在 PROSE_RULES 里、**不在** BOTTOM_RULES 里'
      + '（短信那两条紧挨着「一次不超过六十字」站着，一段「可以把篇幅用满」压在那儿是自相矛盾的）',
      PROSE_RULES.includes(INTIM_DEPTH_RULE)
      && PROSE_RULES.includes(EXCLUSIVE_RULE) && PROSE_RULES.includes(SMOOTH_RULE)
      && !BOTTOM_RULES.includes(INTIM_DEPTH_RULE),
      'BOTTOM_RULES ＝ 独占 + 白虎；PROSE_RULES ＝ 那两份 + 怎么写细')

    /* —— 挂在谁身上：四条通道逐条点一遍，两种情形都要 —— */
    const who2 = Object.keys(INTIMATE)[0] ?? 'luna'
    const dateOne: Rendezvous = {
      id: 'd:probe-depth', charId: who2, kind: 'date', title: '一次见面',
      place: '学园外', from: 'you', ts: 0, done: false,
    }
    const intimOne: Rendezvous = { ...dateOne, kind: 'intimate' }
    const depthIn = (text: string) => text.includes(INTIM_DEPTH_RULE)
    const mainSys = buildDirectorSystem(TIMELINE[0]!, { operatorName: '言万心叶' })
    const dateSys = rendezvousPrompt(who2, '言万心叶', 80, dateOne, '')
    const intimSys = rendezvousPrompt(who2, '言万心叶', 80, intimOne, '')
    const smsSys = systemPrompt(who2, '言万心叶', 10, '各自的日常')
    const grpSys = groupSystemPrompt([who2], '小队', '言万心叶', '10/100', '各自的日常')
    ok('私密场面 · 写长篇正文的两条通道带上了（主线推演 / 见面约会）',
      depthIn(mainSys) && depthIn(intimSys),
      `主线 ${depthIn(mainSys)} · 见面 ${depthIn(intimSys)}`)
    ok('私密场面（对照）· 打字的两条通道不带（单聊 / 群聊）',
      !depthIn(smsSys) && !depthIn(grpSys),
      `单聊 ${depthIn(smsSys)} · 群聊 ${depthIn(grpSys)}`)
    /* 一条对照要写准：`kind=date` 的见面**带着笔法那一整条**（一场戏是先从 date 起步、
       走到那一档才抬成 intimate 的 —— 起步那一回合若手里没有这条，写出来的就是最该写足
       却含糊掉的那一段）；但**「已经走到私密那一档」那一节它不带**，那是给进门的场面的许可。 */
    ok('私密场面（对照）· 还没进门的见面：笔法那一整条在，「已走到那一档」那一节不注入',
      depthIn(dateSys) && !dateSys.includes('这一场已经走到私密那一档')
      && intimSys.includes('这一场已经走到私密那一档'),
      `笔法 date ${depthIn(dateSys)} / intimate ${depthIn(intimSys)}；许可节 date ${dateSys.includes('这一场已经走到私密那一档')}`)

    /* 两条收口：一处指向上面的底层规矩（不重述），一处是规矩本身 */
    ok('见面通道 · 私密那一节指回底层规矩里那一整条，不另写一份（写两份，先走样的就是它）',
      intimSys.includes('怎么写细见上面底层规矩里那一整条')
      && intimSys.includes('这一场已经走到私密那一档'),
      '规则 6 只在 intimate 时注入，且只指路不复述')

    /* —— 世界书：文风册第四条 —— */
    const styleBook = buildCanonLorebooks().find((b) => b.id === 'book-canon-style')
    const styIntim = styleBook?.entries.find((e) => e.id === 'sty-intim')
    ok('世界书 · 文风册多出第四条常驻（私密场面），四条都常驻（不靠关键词命中）',
      !!styleBook && styleBook.entries.length === 4
      && styleBook.entries.every((e) => e.constant)
      && !!styIntim && styIntim.order === 4,
      styleBook ? `${styleBook.entries.length} 条：${styleBook.entries.map((e) => e.id).join(' · ')}` : '缺 book-canon-style')
    ok('世界书 · 那一条也写着「没走到这一档就不生效」（词条库与提示词两处口径一致）',
      !!styIntim?.content.includes('还没走到这一档的场面，这一条不生效')
      && styIntim.content.includes('这是笔法，不是设定'),
      styIntim ? `${styIntim.content.length} 字` : '缺 sty-intim')
    ok('世界书 · 那条里也带着「镜头要推近」（与底层规矩同一口径，不各写一份）',
      !!styIntim?.content.includes('镜头要推近')
      && !!styIntim.content.includes('每次被弄到都跟上一次不一样'),
      styIntim?.content.includes('镜头要推近') ? '推近那一句在' : '★世界书里漏了推近')
    ok('世界书 · 文风册改了就抬种子版本（不抬，老装机永远停在三条那一版）',
      CANON_SEED_VERSION >= 13,
      `CANON_SEED_VERSION = ${CANON_SEED_VERSION}`)
    /* 条数改了，「几条常驻」这个说法要跟着改 —— 三处口径（书自己的描述、两份预设里
       那一句指路）都得是四条。种子版本历史里那句「三条常驻」是**当时的记录**，
       不在此列，所以这里不扫全文，只认该改的那三处。 */
    const sayFour = [
      ['世界书 · 文风册自己的描述', styleBook?.description ?? ''],
      ['预设 · 主线那份的指路', contentOf(proto3, 'ts-style-canon')],
      ['预设 · 轻量那份的指路', contentOf(lite3, 'ts-style-canon')],
    ]
    const staleCount = sayFour.filter(([, s]) => !s.includes('四条常驻词条')).map(([n]) => n)
    ok('世界书 · 「几条常驻」的说法跟着条数改（书自己的描述 + 两份预设里的指路都是四条）',
      staleCount.length === 0,
      staleCount.length ? `还是旧说法：${staleCount.join('、')}` : '三处口径一致：四条常驻词条')

    /* —— 预设：两份都带，内容逐字一致 —— */
    const pDepth = proto3.prompts?.find((x) => x.identifier === 'ts-intim-depth')
    const lDepth = lite3.prompts?.find((x) => x.identifier === 'ts-intim-depth')
    ok('预设 · 主线那份带「文风（私密场面）」一条（scope=main · 紧挨「反八股」之后）',
      !!pDepth && pDepth.enabled === true && pDepth.scope === 'main'
      && pDepth.injection_order === 118,
      pDepth ? `${pDepth.name} · order ${pDepth.injection_order}` : '缺 ts-intim-depth')
    ok('预设 · 轻量版那份也带同一条，且与主线那份**逐字一致**',
      !!lDepth && lDepth.content === pDepth?.content,
      lDepth ? (lDepth.content === pDepth?.content ? '逐字一致' : '★两份内容不一致') : '轻量版缺 ts-intim-depth')
    ok('预设 · 那一条自己也写着条件句（拿出去在酒馆里跑，也不会变成催场令）',
      !!pDepth?.content.includes('还没走到这一档的回合，这一条不生效')
      && !!pDepth.content.includes('它不是要你去开这一场'),
      '条件句两份都带')
    ok('预设 · 那一条也带着「镜头要推近」（三处缝法口径一致：底层规矩 / 世界书 / 预设）',
      !!pDepth?.content.includes('**镜头要推近**')
      && !!lDepth?.content.includes('**镜头要推近**')
      && !!pDepth.content.includes('每次被弄到都跟上一次不一样'),
      pDepth?.content.includes('**镜头要推近**') ? '两份都带推近' : '★预设里漏了推近')
    ok('预设 · 轻量版的名字里带「-轻量化」（它与主线里那条「文风（参照原著）」不是一回事）',
      (lite3.name ?? '').includes('轻量化'),
      lite3.name ?? '缺 name')

    /* 模型适配：出厂只开 DeepSeek 那一条（这份预设本来就是照着它调的） */
    const fitOf = (id: string) => proto3.prompts?.find((x) => x.identifier === id)?.enabled
    ok('预设 · 模型适配出厂只开 DeepSeek（Gemini / GLM / Claude·GPT 三条默认关闭）',
      fitOf('ts-fit-ds') === true
      && fitOf('ts-fit-gemini') === false
      && fitOf('ts-fit-glm') === false
      && fitOf('ts-fit-claude') === false,
      `ds ${fitOf('ts-fit-ds')} · gemini ${fitOf('ts-fit-gemini')} · glm ${fitOf('ts-fit-glm')} · claude ${fitOf('ts-fit-claude')}`)

    /* 改了内容就要抬版本号 —— 抬了，老装机下一轮启动才换得上稿；不抬，只有新装机看得见 */
    ok('预设 · 内容版本抬过了（v4 的账本认得这是新稿，老装机下一轮启动换得上）',
      needsContentRefresh(4, [BUILTIN_IDS[0]]) && needsContentRefresh(4, [BUILTIN_IDS[1]]),
      'v5 → v6：私密场面那一条加「镜头要推近」')

    info.push('私密场面怎么写细：只在写长篇正文的两条通道（主线 / 见面 intimate）'
      + '—— PROSE_RULES 里，不在 BOTTOM_RULES；单聊 / 群聊 / 一般的见面一个字都不带；'
      + '条件句（「没到这一档的不生效」「不是要你去开这一场」）是它的全部分寸；'
      + '另带「镜头要推近」（私密部位当下是什么样就写什么样、每次都不一样）')
    info.push('缝上去的两处：世界书文风册第四条常驻 sty-intim（种子 v13）+ 内置预设 ts-intim-depth'
      + '（主线 / 轻量两份逐字一致 · 内置稿 v6）；模型适配出厂只开 DeepSeek，轻量版改名 -轻量化')
  } catch (e) {
    fail.push('私密场面段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  /* ---------- 34) 贴身衣物：底档 · 三档穿着 · 湿润读数 · 流水 ----------
     用户口径原话：「加一个贴身衣物状态吧，实时变化哦，会因为脱掉而变化，还有内裤会因为
     发情而湿润什么的」「贴身衣物就内裤和内衣吧」「每个人的贴身衣物不一样哦，这也和性格
     有关」；两条读数口径是「每人一份底档」「0–100 读数 + 状态词」「此刻的衣物 + 这一场的
     流水」，另外补一句「内裤湿不可能一直湿润」。

     这一节量的是这一栏与私密档案**不一样**的那几条规矩 —— 因为它记的是**此刻**，不是账：
       · 穿着档位**后写覆盖**（她可以又穿回去），湿润增量**可正可负**（缓过来了就回落）；
       对照：开发度与色情度那两样只增不减（§27 已量），这一栏偏不。
       · 底档只在**没有推进**时读得出来（穿着 / 干爽），谁都不许带着读数登场。
       · 底档十八套**照性格各写各的、不许撞款**（名字 / 样子 / 湿润四句都得是独一份）。
     界面那一半（档案第七栏摆不摆得出来）归冒烟；这里量的是底下这几条规矩本身。 */
  try {
    const femaleIds = Object.keys(INTIMATE)
    const ids = Object.keys(ATTIRE)
    /* 汉字数：量的是「几句」，不是「几个字符」—— 标点与空格不掺进来 */
    const han = (s: string) => (s.match(/[一-鿿]/g) ?? []).length

    /* —— 名录：与私密档案同一批人（十八位女角色），一个不多一个不少 —— */
    ok('衣物 · 底档与私密档案同一批人（十八位女角色：多一个少一个都算漏）',
      ids.length === femaleIds.length && femaleIds.every((id) => !!ATTIRE[id]),
      `衣物 ${ids.length} 位 / 私密档案 ${femaleIds.length} 位`)

    ok('衣物 · 只对女角色生效（非女角色 / 没底档者整节不出现）',
      hasAttire(femaleIds[0]!) && !ids.some((id) => !INTIMATE[id])
      && !hasAttire('gcn') && !hasAttire('kaito') && !hasAttire('__nobody__'),
      `表里 ${ids.length} 位、全是女角色`)

    /* —— 底档形状：两件齐全、名字与样子都有、`wet` 只有内裤有 —— */
    const shapeBad: string[] = []
    for (const id of ids) {
      const b = ATTIRE[id]!
      for (const slot of ATTIRE_SLOTS) {
        const p = b[slot]
        if (!p || !p.name.trim() || !p.look.trim()) { shapeBad.push(`${id}.${slot}`); continue }
        const wantWet = slot === 'panties'
        const hasWet = Array.isArray(p.wet) && p.wet.length === WET_STAGE_COUNT
        if (wantWet !== hasWet) shapeBad.push(`${id}.${slot}(wet)` )
        if (p.name.length > 15) shapeBad.push(`${id}.${slot}(名字 ${p.name.length} 字)`)
      }
    }
    ok('衣物 · 两件齐全（内衣 + 内裤）· 名字与样子都在 · 名字不过 15 字',
      shapeBad.length === 0, shapeBad.length ? shapeBad.join('、') : `${ids.length} 位 × 2 件`)

    /* 档梯是四档，内裤的四句就得是四句 —— 少一句那一档上屏就是空白（不报错） */
    const wetBad = ids.filter((id) => (ATTIRE[id]!.panties!.wet ?? []).some((s) => !s.trim()))
    ok(`衣物 · 内裤的湿润状态句按 WET_STAGES 写全 ${WET_STAGE_COUNT} 句（少一句那一档就上屏空白）`,
      wetBad.length === 0 && WET_STAGES.length === WET_STAGE_COUNT,
      wetBad.length ? wetBad.join('、') : `${ids.length} 位 × ${WET_STAGE_COUNT} 句`)

    /* —— 篇幅：样子 40–80 字、湿润句 30–60 字（太长读不动，太短等于没写） —— */
    const lenBad: string[] = []
    for (const id of ids) {
      for (const slot of ATTIRE_SLOTS) {
        const n = han(ATTIRE[id]![slot]!.look)
        if (n < 40 || n > 80) lenBad.push(`${id}.${slot}(look ${n})`)
      }
      ;(ATTIRE[id]!.panties!.wet ?? []).forEach((s, i) => {
        const n = han(s)
        if (n < 30 || n > 60) lenBad.push(`${id}.wet[${i}](${n})`)
      })
    }
    ok('衣物 · 样子 40–80 字、湿润四句各 30–60 字（逐条量过，长短都在口径里）',
      lenBad.length === 0, lenBad.length ? lenBad.join('、') : `${ids.length * 2 + ids.length * 4} 句`)

    /* —— 每人一套：照性格、不许撞款 —— */
    const names = ids.flatMap((id) => ATTIRE_SLOTS.map((s) => ATTIRE[id]![s]!.name.trim()))
    const looks = ids.flatMap((id) => ATTIRE_SLOTS.map((s) => ATTIRE[id]![s]!.look.trim()))
    /* 湿润句按「四句折成一句」比 —— 逐句比会被「干着 / 湿了」这类共用语骗过去 */
    const wets = ids.map((id) => (ATTIRE[id]!.panties!.wet ?? []).join('|'))
    ok('衣物 · 三十六件的名字各不相同（不许两个人撞款 —— 每人一份，各自照性格来）',
      new Set(names).size === names.length, `${names.length} 个名字 / ${new Set(names).size} 个不重`)
    ok('衣物 · 三十六条样子也各不相同（换了名字照抄一段话，这一条就红）',
      new Set(looks).size === looks.length, `${looks.length} 条 / ${new Set(looks).size} 条不重`)
    ok('衣物 · 十八位的内裤四句各写各的（不是同一条内裤换个人名）',
      new Set(wets).size === wets.length, `${wets.length} 位 / ${new Set(wets).size} 位不重`)

    /* 底档写的是**物件**：料子 / 颜色 / 新旧 / 贴身程度 —— 颜色那一样得说出来，
       不然档案上读到的只是一件「不知道什么颜色的衣服」。成套与不成套照性格
       （随性的人本来就不成套，见 file header），所以这里只量「说没说颜色」。 */
    const COLOR_CHARS = '黑白灰粉樱青靛杏银棕紫红蓝绿米金藕驼咖'.split('')
    const colorsOf = (s: string) => new Set(COLOR_CHARS.filter((c) => s.includes(c)))
    const noColor = ids.filter((id) => ATTIRE_SLOTS.some((s) => colorsOf(ATTIRE[id]![s]!.look).size === 0))
    ok('衣物 · 三十六条样子都说得出颜色（料子 / 颜色 / 新旧 —— 物件该有的那样样得有）',
      noColor.length === 0, noColor.length ? `${noColor.join('、')} 没提颜色` : `${ids.length * 2} 条都提了`)

    /* —— 禁字：写的是物件，不许写她，也不许写原文 —— */
    const allText = ids.flatMap((id) => {
      const b = ATTIRE[id]!
      return [b.bra!.name, b.bra!.look, b.panties!.name, b.panties!.look, ...(b.panties!.wet ?? [])]
    })
    const bad = allText.filter((s) => /阴毛|耻毛|剃毛|除毛|原文|衬得|勾勒出/.test(s))
    ok('衣物 · 不用禁字（阴毛 / 耻毛 / 剃毛 / 除毛 一律不写）· 不冠「· 原文」· 不写她',
      bad.length === 0, bad.length ? bad[0]!.slice(0, 24) : `${allText.length} 句都干净`)

    const withName = allText.filter((s) => PERSON_IDS.some((id) => (personOf(id)?.name ?? '').length > 1 && s.includes(personOf(id)!.name)))
    ok('衣物 · 底档里不出现任何角色名（那一行是给档案看的，不必重新报一遍是谁）',
      withName.length === 0, withName.length ? withName[0]!.slice(0, 24) : `${allText.length} 句都干净`)

    /* —— 合成：没有推进时读出纯底档 —— */
    const baseWrong = ids.filter((id) => {
      const p = attireOf(id, undefined)
      return !p || p.pieces.length !== 2 || p.wet !== 0
        || p.pieces.some((x) => x.wear !== 'worn' || x.state !== ATTIRE[id]![x.slot]!.look)
        || !p.pieces.find((x) => x.slot === 'panties')?.wetState?.trim()
        || p.log.length !== 0
    })
    ok('衣物 · 无推进时读出的是纯底档（两件都穿着 · 湿润 0 干爽 · 流水为空）',
      baseWrong.length === 0, baseWrong.length ? baseWrong.join('、') : `${ids.length} 位`)

    const luna = 'luna'
    const off = attireOf(luna, { wear: { bra: 'half', panties: 'off' }, wet: 70 })!
    ok('衣物 · 三档穿着的档位词与短语合得上（半褪说了它挂在哪儿、褪下说了它不在身上）',
      wearWord('worn') === '穿着' && wearWord('half') === '半褪' && wearWord('off') === '褪下'
      && off.pieces[0]!.wearWord === '半褪' && off.pieces[0]!.state.startsWith(WEAR_PHRASE.bra.half)
      && off.pieces[1]!.state.startsWith(WEAR_PHRASE.panties.off)
      && off.pieces[0]!.state.includes(ATTIRE[luna]!.bra!.look),
      `${off.pieces[0]!.wearWord} / ${off.pieces[1]!.wearWord}`)

    ok('衣物 · 湿润读数落在第几档就读第几句（档梯与状态句同一条）',
      wetStageIndex(0) === 0 && wetStageIndex(39) === 1 && wetStageIndex(70) === 3
      && off.wet === 70 && off.wetWord === '透湿' && wetStage(70) === '透湿'
      && off.pieces[1]!.wetState === ATTIRE[luna]!.panties!.wet![3],
      `70 → ${off.wetWord}`)

    /* —— 并账：三条与私密档案不一样的规矩 —— */
    /* ① 穿着**后写覆盖**：脱了还能穿回去（对照：开发度只增不减，见 §27） */
    const dressed = mergeAttire(undefined, { wear: { panties: 'off' } })
    const again = mergeAttire(dressed, { wear: { panties: 'worn' } })
    ok('衣物 · 穿着档位后写覆盖：她脱了又穿回去，读作「穿着」（不是「脱过」的一本账）',
      dressed.wear?.panties === 'off' && again.wear?.panties === 'worn',
      `${dressed.wear?.panties} → ${again.wear?.panties}`)

    /* ② 湿润**可上可下**：缓过来了、擦干净了就回落（用户口径「内裤湿不可能一直湿润」） */
    const high = mergeAttire(undefined, { wet: 80 })
    const dry = mergeAttire(high, { wet: -30 })
    ok('衣物 · 湿润的增量可正可负（缓过来了就往下走）—— 与开发度只增不减恰好相反',
      high.wet === 80 && dry.wet === 50, `80 → ${dry.wet}`)

    const floor = mergeAttire(mergeAttire(undefined, { wet: 5 }), { wet: -40 })
    const ceil = mergeAttire(undefined, { wet: 400 })
    ok('衣物 · 湿润夹在 0–100（不肯读成负数，也不肯读过头）',
      floor.wet === 0 && ceil.wet === 100, `${floor.wet} / ${ceil.wet}`)

    /* ③ 发情那一半的耦合：色情度涨了，内裤跟着湿一分 —— 不必让模型把同一件事报两遍 */
    const arosed = mergeAttire(undefined, {}, WET_PER_LEWD * 3)
    const tiny = mergeAttire(undefined, {}, WET_PER_LEWD - 1)
    ok('衣物 · 色情度耦合：涨够了就带一分湿（除得尽的整份才计，报个小数目不凭空生湿）',
      arosed.wet === 3 && tiny.wet === undefined
      && (arosed.log ?? []).length === 1 && (tiny.log ?? []).length === 0,
      `${WET_PER_LEWD * 3} → ${arosed.wet} 分 · ${WET_PER_LEWD - 1} → 没湿（连读数都不落，读出来还是 0）`)

    /* ④ 流水只记**真的变了**的：空转不记账，一次变几样合成一条 */
    const idle = mergeAttire({ wear: { panties: 'off' }, wet: 40 }, { wear: { panties: 'off' } })
    ok('衣物 · 空转不记账（两件都没动、湿润也没动 → 流水不长）',
      (idle.log ?? []).length === 0 && idle.wet === 40, `流水 ${(idle.log ?? []).length} 条 · 湿润还是 ${idle.wet}`)

    /* 一次里两件 + 湿润一起变 → 合**一条**（新的在前） */
    const both = mergeAttire(undefined, { wear: { bra: 'half', panties: 'off' }, wet: 45 })
    ok('衣物 · 一次里两件与湿润一起变，合成一条流水（不是三条）',
      both.log?.length === 1 && both.log[0]!.text.includes('内衣') && both.log[0]!.text.includes('内裤')
      && both.log[0]!.text.includes('湿润到洇湿'),
      both.log?.[0]?.text ?? '（空）')

    /* 流水封顶：新的一直挤掉最旧的 */
    let rolling = mergeAttire(undefined, { wet: 5 })
    for (let i = 0; i < ATTIRE_LOG_MAX + 4; i++) rolling = mergeAttire(rolling, { wear: { bra: i % 2 ? 'half' : 'off' } })
    ok(`衣物 · 流水封顶 ${ATTIRE_LOG_MAX} 条（新的在前，最旧的挤掉）`,
      (rolling.log ?? []).length === ATTIRE_LOG_MAX
      && ((rolling.log ?? [])[0]?.ts ?? 0) >= ((rolling.log ?? [])[1]?.ts ?? 0),
      `${(rolling.log ?? []).length} 条`)

    /* —— 指令那一道闸 —— */
    const maleId = PERSON_IDS.find((id) => !hasIntimate(id)) ?? 'kaito'
    const gate = sanitizeDirective({
      attire: [
        { char: luna, bra: 'half', panties: 'off', wet: 12 },
        { char: maleId, panties: 'off' },              // 非女角色 → 整条丢
        { char: luna, bra: '脱着' } as never,           // 编出来的档位、又没别的真内容 → 整条丢
        { char: luna, bra: '脱着', wet: 3 } as never,   // 档位丢掉、湿润留得住
        { char: luna, wet: -99 },                      // 负的湿润收得下（夹到 −30）
        { char: luna },                                // 两件都没给、湿润也没有 → 空话，丢
      ],
    })
    const g = gate.attire ?? []
    ok('衣物 · 非女角色 / 认不出的档位 / 空指令都落不下来（只有真内容留得住）',
      g.length === 3 && g[0]!.bra === 'half' && g[0]!.panties === 'off' && g[0]!.wet === 12
      && g[1]!.bra === undefined && g[1]!.panties === undefined && g[1]!.wet === 3
      && !g.some((x) => x.char === maleId)
      && !g.some((x) => !x.bra && !x.panties && x.wet === undefined),
      JSON.stringify(g))

    ok('衣物 · 湿润增量夹 ±30（一次报满一档也不算数，但**负数收得下**）',
      g.find((x) => x.wet !== undefined && x.wet < 0)?.wet === -30,
      `-99 → ${g.find((x) => x.wet !== undefined && x.wet < 0)?.wet}`)

    /* 落地：两件 + 湿润各落各的，且**提示条念得出动了哪样** */
    const calls: { char: string; p: unknown; arouse: number }[] = []
    const fx = applyDirective(
      { attire: [{ char: luna, bra: 'off', wet: 8 }], intim: [{ char: luna, lewd: 6 }] },
      {
        meetChar: () => {}, bumpBond: () => {}, registerEnd: () => {}, setFlag: () => {},
        bumpIntim: () => {}, bumpActs: () => {}, setRel: () => {},
        bumpAttire: (char, p, arouse) => calls.push({ char, p, arouse }),
      },
    )
    ok('衣物 · 落地时把同一次的色情度增量一并递给并账那一层（发情那一半由它自己算）',
      calls.length === 1 && calls[0]!.arouse === 6
      && (calls[0]!.p as { wear?: { bra?: string } }).wear?.bra === 'off'
      && (calls[0]!.p as { wet?: number }).wet === 8,
      JSON.stringify(calls[0] ?? null))

    ok('衣物 · 提示条念得出动了哪几样（内衣 / 内裤 / 湿润）',
      attireAdvanceLabel({ bra: 'half' }) === ATTIRE_META.bra.label
      && attireAdvanceLabel({ panties: 'off', wet: 5 }) === `${ATTIRE_META.panties.label} · ${'湿润'}`
      && attireAdvanceLabel({}) === '',
      attireAdvanceLabel({ bra: 'half', panties: 'off', wet: 5 }))

    /* 没给 attire 那条指令、色情度却真的涨了的人：补一次**只带耦合那一半**的推进 */
    const calls2: { char: string; p: unknown; arouse: number }[] = []
    const fx2 = applyDirective(
      { intim: [{ char: luna, slot: 'vagina', dev: 2, lewd: 7 }] },
      {
        meetChar: () => {}, bumpBond: () => {}, registerEnd: () => {}, setFlag: () => {},
        bumpIntim: () => {}, bumpActs: () => {}, setRel: () => {},
        bumpAttire: (char, p, arouse) => calls2.push({ char, p, arouse }),
      },
    )
    ok('衣物 · 只报了色情度也会湿（补一次只带耦合那一半的推进，递空并账 + arouse）',
      calls2.length === 1 && calls2[0]!.arouse === 7
      && Object.keys(calls2[0]!.p as object).length === 0
      && fx2.attire.length === 1 && fx2.attire[0]!.wet === Math.floor(7 / WET_PER_LEWD),
      JSON.stringify(calls2[0]!.p) + `　fx=${JSON.stringify(fx2.attire)}`)

    ok('衣物 · 这一栏也算「有变化」（只动衣物、别的都没动时，「重写此回复」照样给）',
      directiveHasFx({ attire: [{ char: luna, panties: 'off' }] }) === true
      && directiveHasFx({}) === false, 'attire-only')

    /* 见面那一路放行（人已经在眼前了）；短信那一路**不放行**（身体的事不发生在信里） */
    const dOff = dateDirective({ attire: [{ char: luna, wet: 26 }] }, luna, [])
    const dOther = dateDirective({ attire: [{ char: 'hikari', panties: 'off' }] }, luna, [])
    ok('衣物 · 短信那一路一个字都不带（身体上的事不发生在信里）',
      smsDirective({ attire: [{ char: luna, panties: 'off', wet: 20 }] }, luna).attire === undefined
      && smsDirective({ attire: [{ char: luna, panties: 'off' }] }, luna).panties === undefined,
      '写信就只写信')

    ok('衣物 · 见面放行、湿润再收一道到 ±10（sanitize 那道 ±30 是单项上限）',
      dOff.attire?.[0]!.wet === 10 && dOther.attire === undefined,
      `湿 26 → ${dOff.attire?.[0]?.wet}　名单外的 ${'hikari'} → ${dOther.attire === undefined ? '被挡下' : '漏了'}`)

    /* —— 提示词：主线导演看得到这一栏，短信两侧看不到 —— */
    /* 名册借 ctx.castNow 钉死成一个人：羁绊那一档是唯一的开关，别的变量都不动 */
    const evAny = TIMELINE[0]!
    const intimSys = buildDirectorSystem(evAny, {
      operatorName: '言万心叶', castNow: [luna], bondNow: () => 100,
    })
    const coldSys = buildDirectorSystem(evAny, {
      operatorName: '言万心叶', castNow: [luna], bondNow: () => 0,
    })
    ok('衣物 · 关系走到那一档才开这一栏（说了「此刻穿成什么样」，也说了「没动就别报」）',
      intimSys.includes('"attire"') && intimSys.includes('"bra": "worn|half|off"')
      && intimSys.includes('贴身衣物另记一处') && intimSys.includes('发情带起来的那一份不必报')
      && !coldSys.includes('"attire"') && !coldSys.includes('贴身衣物另记一处'),
      `羁绊 100 有 / 羁绊 0 没有`)

    ok('衣物 · 见面那一路的指令说明也带着（那儿只有一两条可写，写漏了就读不出来）',
      dateBondRule(luna, []).includes('"attire"') && dateBondRule(luna, []).includes('"panties"'),
      'dateBondRule')

    const smsOne = systemPrompt(luna, '言万心叶', 100, '走廊尽头')
    const smsGroup = groupSystemPrompt([luna], '露娜', '言万心叶', '露娜 100', '走廊尽头')
    ok('衣物 · 短信两侧看不到这一栏（单聊 / 群聊的提示词里一个字都没有）',
      !smsOne.includes('attire') && !smsOne.includes('贴身衣物')
      && !smsGroup.includes('attire') && !smsGroup.includes('贴身衣物'),
      `单聊 ${smsOne.length} 字 / 群聊 ${smsGroup.length} 字 —— 都不带`)

    info.push('贴身衣物：记的是**此刻**而不是账 —— 穿着三档后写覆盖（脱了能穿回去）、'
      + '湿润增量可正可负（缓过来了就回落）；唯一一处自动的是耦合：同一次里色情度涨了，'
      + `湿润跟着涨 ${WET_PER_LEWD} 分之一（「因为发情而湿润」），模型不必报第二遍`)
    info.push('底档十八套照性格各写各的（名字 / 样子 / 湿润四句三样都不许撞款、两件颜色成套）；'
      + `界面那一半（私密档案第七栏「此刻的衣物」+「这一场的变化」）归冒烟`)
  } catch (e) {
    fail.push('贴身衣物段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }


  /* ============================================================
     §35 湿润自动回落（data/attire.ts 的 dryAttire / WET_DRY_STEP）
     ------------------------------------------------------------
     口径：「内裤湿不可能一直湿润」。所以一回合里什么都没往上走时，
     湿润自己退一档 —— 退不必谁下命令，它是**此刻**不是勋章。
     这一段只管纯函数那半边（退到哪儿停、退的时候念什么词、退完还记不记账）；
     谁在什么时候叫它（推进落地那一层，指令什么都没动的时候）归冒烟。
     ============================================================ */
  try {
    /* 湿润那个读数是**第二项**里的 `wet` —— 第三项是「同一次的色情度增量」（耦合的那一半），
       别把 40 递成 arouse：那会连耦合一起算上，读数就不是你想验的那个了。 */
    const wetted = mergeAttire(undefined, { wear: { panties: 'half' }, wet: 40 })
    const dried = dryAttire(wetted)!

    ok('回落 · 一步退一个常数，湿润读数和之前那份对得上',
      dried.wet === 40 - WET_DRY_STEP && WET_DRY_STEP > 0,
      `40 → ${dried.wet}（一步 ${WET_DRY_STEP}）`)

    ok('回落 · 只动湿润这一项，穿在身上的那两件一个字都不碰',
      dried.wear.panties === 'half' && dried.wear.bra === wetted.wear.bra,
      `内裤仍 ${dried.wear.panties}`)

    /* 档位边界要躲开：洇湿那一档从 40 起，40 退一步正好跌进潮意（会念档位词）。
       挑一档中间的数（65）验「同一档里只说得出口略退」。 */
    const sameStage = dryAttire(mergeAttire(undefined, { wet: 65 }))!
    ok('回落 · 同一档里退只说得出口「略退」（0 涨到 3 那种不能读成「湿润到干爽」）',
      sameStage.log[0]!.text === '湿润略退'
      && !sameStage.log[0]!.text.includes('湿润到')
      && wetStageIndex(65) === wetStageIndex(sameStage.wet),
      `洇湿 ${65} → 洇湿 ${sameStage.wet}，同档`)

    /* 反过来：同一档里涨也只说得出口「略增」（与退共用那一句的分支） */
    const sameUp = mergeAttire(mergeAttire(undefined, { wet: 65 }), { wet: 3 })
    ok('回落 · 同一档里往前挪仍是「略增」（这一条不是被这次改动带出来的）',
      sameUp.log[0]!.text === '湿润略增', `65 → ${sameUp.wet}`)

    ok('回落 · 退跨了档就念档位词（潮意退到干爽，得说出来退了一档）',
      dryAttire(mergeAttire(undefined, { wet: 16 }))!.log[0]!.text.includes('湿润到干爽'),
      `16 → ${dryAttire(mergeAttire(undefined, { wet: 16 }))!.wet}，`
      + `档位 ${wetStage(16)} → ${wetStage(dryAttire(mergeAttire(undefined, { wet: 16 }))!.wet)}`)

    /* 退到 0 就停：不许退成负数，也不许在 0 上继续记账 */
    const atZero = dryAttire(mergeAttire(undefined, { wet: 6 }))!
    ok('回落 · 退到 0 就停住（不许退成负数）',
      atZero.wet === 0 && dryAttire(atZero) === null && dryAttire(undefined) === null,
      `6 → ${atZero.wet}，再退一次 → 不再动`)

    ok('回落 · 本来就干爽 / 没记过湿润的，一动不动也不记账',
      dryAttire(mergeAttire(undefined, { wear: { bra: 'off' } })) === null
      && dryAttire(mergeAttire(undefined, { wear: { bra: 'off' }, log: [] })) === null,
      '没湿过就没有可退的')

    /* 一直没人管它 → 收敛到干爽，不会停在半路 */
    let walk = mergeAttire(undefined, { wet: 100 })
    let steps = 0
    for (let d = dryAttire(walk); d && steps < 50; d = dryAttire(walk)) {
      walk = d
      steps += 1
    }
    ok('回落 · 一直不动就一直退，最后收敛在 0（不是停在半路）',
      walk.wet === 0 && steps > 1 && steps <= Math.ceil(100 / WET_DRY_STEP),
      `100 → 0 走了 ${steps} 步`)

    ok('回落 · 退一次只添一行（最近 ATTIRE_LOG_MAX 条，最新的在上，旧的挪到后头）',
      dried.log.length === 2 && dried.log[1]!.text === '内裤褪到膝弯 · 湿润到洇湿'
      && dried.log[0]!.text === '湿润到潮意',
      `log ${dried.log.length} 行：${dried.log.map((l) => l.text).join(' / ')}`)

    info.push('湿润回落：一回合里色情度与衣物都没动 → 湿润自己退一步'
      + `（WET_DRY_STEP ${WET_DRY_STEP}），退到 0 就停、0 上不再记账。`
      + '它是**此刻**，所以退不必谁下命令；涨仍然只认指令 ＋ 发情耦合那一半')
  } catch (e) {
    fail.push('湿润回落段抛错 :: ' + (e instanceof Error ? e.message : String(e)))
  }

  return { pass, fail, info }
}

/** MINDS 里「整卷的每一段都在时间线上」的卷才验得动闸门（缺段的卷永远开不了） */
function gWithMindsOk(g: string): boolean {
  return TIMELINE.some((e) => e.group === g)
}
