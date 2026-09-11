/* ============================================================
   作战数值导出层
   ------------------------------------------------------------
   「档案 → 战斗面板」的唯一翻译处：
     · 五轴（常态评定 × 时期系数 × 成长 + 装具修正） → 战斗用轴值
     · 武装（arms.ts）+ 战斗定位（roster.ts）+ 装具（gear.ts） → 技能表与演出
     · 任务（missions.ts 的 stage / nature）        → 敌阵
   不改原文考据，不改数据口径；这里只做读数。
   ============================================================ */

import { CHARACTERS } from '../../data/chars'
import { SIDE_AXIS } from '../../data/roster'
import { ARMS } from '../../data/arms'
import { AXIS_INF } from '../../data/types'
import type { Character, Mission } from '../../data/types'
import { CAST, OPERATOR_ID, avatarIdOf, personOf } from '../../data/castmeta'
import { opBuiltinOf, opPeriodAtProgress } from '../operator-arc'
import type { OpAbility, OpPeriod } from '../operator-arc'
import { TIMELINE } from '../../data/timeline'
import { furthestDone } from '../operator'
import { POWER_SCALE, ROSTER } from './roster'
import { namedBossOf } from './bosses'
import type { NamedBoss } from './bosses'
import { GEAR_OF, gearSkillOf } from './gear'
import { START_GATE, TUNING, UNRATED_AXES } from './tuning'
import { rFactor, rOfPlace } from './rvalue'
import type { AxisKey, AxisSheet, Combatant, FxKind, SkillEffect, SkillSpec, Target } from './types'

const AXES: AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']

const CORE: Record<string, Character> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]))

/**
 * 名录 id / 全名 / 别名 → id。
 * 任务简报的 recommend 两种写法都有：派单（missions.ts）写的是中文名，
 * 剧情作战（mainline.ts）直接搬事件在场者的 id —— 两边都要认，
 * 否则剧情那一栏挂出来的就是 'kuro-no-maou' 这种原文 id。
 */
const NAME2ID = (() => {
  const m = new Map<string, string>()
  for (const p of CAST) {
    m.set(p.id, p.id)
    for (const n of [p.name, ...p.names]) if (!m.has(n)) m.set(n, p.id)
  }
  return m
})()

/** 单个名字 / id → 名录 id；认不出返回 null */
export function personIdOf(token: string): string | null {
  return NAME2ID.get(token) ?? null
}

/** 任务简报的推荐名单（中文名或 id）→ 名录 id（认不出的丢弃） */
export function squadIdsFrom(names: string[]): string[] {
  const out: string[] = []
  for (const n of names) {
    const id = NAME2ID.get(n)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** 本人的体力上限：意志力越高越耐打（防御时按同一根轴回复，回得不多） */
export function chSpMax(will: number): number {
  return Math.round(TUNING.chSpBase + will * TUNING.chSpPerWill)
}

/**
 * '∞' → 代入值（数学上代入 AXIS_INF；UI 另标「不可测」）。
 * 战斗数值不设上限：这里只做「读不出数 → 一个数」的翻译，不做钳制。
 */
function numOf(v: number | '∞' | undefined): number {
  if (v === undefined) return 0
  return v === '∞' ? AXIS_INF : v
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * 时期进度 0..1：以「已推进到的最远事件段」在时间线上的位置为准。
 * 这是「能力值按时期变化」的锚 —— 读得越靠后，成长期的角色越接近本身峰值。
 */
export function periodProgress(epDone: Record<string, true>): number {
  const idx = furthestDone(epDone)
  if (idx < 0) return 0
  return clamp01(idx / Math.max(1, TIMELINE.length - 1))
}

/**
 * 逐人的时期曲线 [起点系数, 终点系数]：
 * 已成年／设定上开场即巅峰者恒 1 —— 她们的强不随剧情成长。
 */
const CURVE: Record<string, [number, number]> = {
  hikari: [1, 1],      // 人类最强：从小学六年级起就没变过
  mefisa: [0.92, 1],   // 委员会两翼之一，起手就接近完成形
  luna: [0.74, 1],     // 商会制人偶 → 体验入学 → 一件件取回自己
  nyau: [0.7, 1],      // 后辈：随出战与观测成长最快
}
const DEFAULT_CURVE: [number, number] = [0.8, 1]

/** 某人此刻的五轴（常态评定 × 时期系数 × 任务成长；不含装具） */
export function axisSheetOf(id: string, progress: number, growthPct = 0): AxisSheet {
  // 言万心叶：他不走「档案 × 时期系数」那一套——原文里每个时期的面板本身就不一样
  if (id === OPERATOR_ID) {
    const per = opPeriodAtProgress(progress)
    const k = 1 + growthPct / 100
    const out = {} as AxisSheet
    for (const a of AXES) out[a] = Math.round(per.axes[a] * k)
    return out
  }
  const c = CORE[id]
  const [a, b] = CURVE[id] ?? DEFAULT_CURVE
  const f = (a + (b - a) * clamp01(progress)) * (1 + growthPct / 100)
  const out = {} as AxisSheet
  if (!c) {
    /* 名录（chars.ts）只收核心几位；侧翼那二十来号人的五轴定在 SIDE_AXIS 里，
       逐条依原文锚过（见该表上方注释）。这里必须接上它 —— 不然整支侧翼
       全掉进同一个 UNRATED 占位面板：角色档案上写着破 42 的人，
       上了战场是破 26，查档案看到的和打起来用的对不上。 */
    const side = SIDE_AXIS[id]
    if (side) {
      AXES.forEach((k, i) => { out[k] = Math.round((side[i] ?? UNRATED_AXES[k]) * f) })
      return out
    }
    for (const k of AXES) out[k] = Math.round(UNRATED_AXES[k] * f)
    return out
  }
  for (const k of AXES) {
    out[k] = Math.round(numOf(c.stats.find((s) => s.key === k)?.value) * f)
  }
  return out
}

/** 装具的数值修正（累加到轴上；另有 spd/evade/shield/atk 走别处） */
function gearAxes(gearId: string | undefined, axes: AxisSheet): AxisSheet {
  if (!gearId) return axes
  const g = GEAR_OF[gearId]
  if (!g) return axes
  const out = { ...axes }
  for (const k of AXES) {
    const add = g.mods[k]
    if (typeof add === 'number') out[k] = out[k] + add
  }
  return out
}

/* ---------- 武装 → 技能 ---------- */

const FX_OF_KIND: Record<string, FxKind> = {
  弹痕: 'guitar',
  斩击: 'slash',
  片羽: 'seal',
  龙花: 'noise',
  特殊武器: 'drone',
}

/** 该角色持有的武装（arms.ts 以 holderId 关联） */
export function armOf(id: string) {
  return ARMS.find((a) => a.holderId === id)
}

/** 弹痕持有者：其武装本相是「封印」，故普攻/技能走克制口径 */
function isScar(id: string): boolean {
  return ARMS.some((a) => a.holderId === id && a.kind === '弹痕')
}

/** 无名册者的退路：一手通用普攻 + 一手协同压制（不冒充原作技能） */
function fallbackSkills(id: string, armName: string, fx: FxKind): SkillSpec[] {
  const base = armName ? `${armName} · ` : ''
  /* 名册里没写的人（临时编入的侧翼）也照着框架给：普攻、技能、**到达点**。
     终结技现在是人人都有的一份，缺它的那一个上战场就只能看着别人放 ——
     所以这条兜底也必须落到「到达点」这一类上，而不是只补两手伤害。 */
  return [
    {
      id: `${id}-atk`, name: `${base}横扫`, kind: '普攻', desc: '不耗心神的常规一击。',
      cost: TUNING.atkCost, power: TUNING.atkPower, axis: '破坏力', fx, line: '——上了。', target: 'one',
      arch: 'basic',
    },
    {
      id: `${id}-skill`, name: armName ? `${base}解放` : '协同压制', kind: '技能',
      desc: '把观测到的弱点一次打穿。',
      cost: TUNING.skillCost, power: TUNING.skillPower * POWER_SCALE, axis: '破坏力', fx,
      line: '「让开——」', target: 'one',
      arch: '强袭',
    },
    {
      id: `${id}-end`, name: armName ? `${base}全开` : '全力协同', kind: '到达点',
      desc: '攒够印记之后的那一手：把这一仗交了结。',
      cost: 8, power: 2.6 * POWER_SCALE, axis: '破坏力', fx,
      line: '「——到此为止。」', target: 'one', cd: 4, needsStack: 3,
      arch: '到达点',
    },
  ]
}

/**
 * 技能表 = 该角色的专属技能（roster.ts）+ 装具附带的一手。
 * 慢启动门（START_GATE）由引擎按 kind === '启动' 的次数把关，此处只负责出表。
 */
/** 言万心叶的技能表 = 该时期的「所能做的事」（原文原名） */
function opSkillsOf(per: OpPeriod, progress = 1): SkillSpec[] {
  // 解锁点：还没读到那一段的，这一手此刻不列出来（如「黄金狮子」契约 v1-9）
  const open = per.abilities.filter((a) => {
    if (!a.unlockAt) return true
    const i = TIMELINE.findIndex((e) => e.id === a.unlockAt)
    return i < 0 || progress + 1e-6 >= i / Math.max(1, TIMELINE.length - 1)
  })
  // 一手 OpAbility → 一份 SkillSpec。变身的技能表是同一种写法套一层，
  // 所以这里递归一次，id 挂在父技能下面（`…-fm0`），免得与常规手撞号。
  const spec = (a: OpAbility, id: string): SkillSpec => ({
    id,
    name: a.name,
    kind: a.kind,
    desc: a.desc,
    cost: a.cost ?? (a.kind === '普攻' ? 1 : a.kind === '启动' ? 2 : a.kind === '到达点' ? 8 : 4),
    power: a.pow,
    axis: a.axis,
    fx: a.fx,
    line: a.line ?? '',
    target: a.target ?? (a.kind === '启动' ? 'self' : 'one'),
    effect: a.effect,
    turns: a.turns,
    needsStack: a.needsStack,
    // 冷却与名册同一口径：普攻 / 启动无冷却，到达点 4 拍，其余 2 拍
    cd: a.cd ?? (a.kind === '普攻' || a.kind === '启动' ? 0 : a.needsStack ? 4 : 2),
    // 框架：这一手按哪一类打的（operator-arc 的 OpAbility 也可以自己标注）
    arch: a.arch,
    openAfter: a.openAfter,
    // 「合体」类：需同伴在场才可出，出手时把人请下场、若干拍后归位
    requireAlly: a.requireAlly,
    mergeAlly: a.mergeAlly,
    mergeTicks: a.mergeTicks,
    morph: a.morph,
    morphTicks: a.morphTicks,
    morphCd: a.morphCd,
    // 变身（黄金狮子）：名字／五轴／技能表整套换掉，数拍之后还原
    form: a.form
      ? {
        name: a.form.name, note: a.form.note, ticks: a.form.ticks,
        cd: a.form.cd, axes: a.form.axes, basicRamp: a.form.basicRamp,
        skills: a.form.skills.map((k, j) => spec(k, `${id}-fm${j}`)),
      }
      : undefined,
    variance: a.variance,
  })
  return open.map((a, i) => spec(a, `op-${per.at}-${i}`))
}

export function skillsOf(id: string, gearId?: string): SkillSpec[] {
  if (id === OPERATOR_ID) {
    const list = opSkillsOf(opPeriodAtProgress(0), 1)
    return list
  }
  const arm = armOf(id)
  const fx = (arm && FX_OF_KIND[arm.kind]) || 'slash'
  const role = ROSTER[id]
  const list: SkillSpec[] = role ? role.skills.map((s) => ({ ...s })) : fallbackSkills(id, arm?.name ?? '', fx)

  // 名册里没写启动技却设了门 → 补一手通用启动（防呆）
  const gate = START_GATE[id] ?? 0
  if (gate > 0 && !list.some((s) => s.kind === '启动')) {
    list.push({
      id: `${id}-start`, name: '镇封起手', kind: '启动',
      desc: `解开武装上的一重封印。需先后打出 ${gate} 次，普攻与技能才会解禁。`,
      cost: TUNING.startCost, power: 0, axis: '破坏力', fx, line: '「先按住它。」', target: 'one',
    })
  }

  const gs = gearId ? gearSkillOf(gearId, id) : null
  if (gs) list.push(gs as SkillSpec)
  return list
}

/* ---------- 角色 → 战斗单位 ---------- */

/** 行动条充能：由敏捷度导出（每节拍能攒多少） */
export function speedOf(axes: AxisSheet): number {
  return Math.max(TUNING.spdFloor, TUNING.spdBase + axes.敏捷度 * TUNING.spdPerAgi)
}

export function combatantOf(id: string, progress: number, growthPct = 0, gearId?: string): Combatant {
  const p = personOf(id)
  // 主角：面板整块按时期换页，其余照旧走档案
  if (id === OPERATOR_ID) {
    const per = opPeriodAtProgress(progress)
    // 自带装备：某几段时期他身上本来就带着一件东西（如露娜的丝线），
    // 玩家另外装配的优先——那是他自己买的，比身上的旧物更贴手。
    const gid = gearId ?? opBuiltinOf(per, progress)
    const axes = gearAxes(gid, axisSheetOf(id, progress, growthPct))
    const gear = gid ? GEAR_OF[gid] : undefined
    const hpMax = Math.round(
      (TUNING.hpBase + axes.物理抗性 * TUNING.hpPerResist + axes.意志力 * TUNING.hpPerWill)
      * (1 + (TUNING.growthHpWeight * (growthPct || 0)) / 100),
    )
    const skills = opSkillsOf(per, progress)
    const gs = gid ? gearSkillOf(gid, id) : null
    // 装具技的 id 不掺角色：与名册那边同一件装通用一枚图标、一份冷却
    if (gs) skills.push(gs as SkillSpec)
    return {
      id,
      side: 'ally',
      name: p?.name ?? '言万心叶',
      sigil: p?.sigil ?? '心',
      hue: p?.hue ?? '#c8a24e',
      avatarId: avatarIdOf(id),
      cls: per.cls,
      trait: per.title,
      hp: hpMax,
      hpMax,
      axes,
      skills,
      fx: per.abilities[0]?.fx ?? 'slash',
      rated: true,
      bar: 0,
      spd: speedOf(axes),
      evade: TUNING.evadeBase + (gear?.mods.evade ?? 0),
      buffs: [],
      shield: gear?.mods.shield ?? 0,
      taunt: 0,
      down: false,
      passive: per.passive,
      endured: 0,
      gone: 0,
      // 破绽 / 护持 / 蓄力：主角三样都没有 —— 破绽是敌方那层「打不穿」
      guardPts: 0,
      guardMax: 0,
      broken: 0,
      ward: 0,
      charge: 0,
      morph: null,
      sp: chSpMax(axes.意志力) + (per.passive?.spMax ?? 0),
      spMax: chSpMax(axes.意志力) + (per.passive?.spMax ?? 0),
      startUsed: 0,
      unsealedAt: 0,
      startNeed: START_GATE[id] ?? 0,
      stack: 0,
    chant: {},
      cds: {},
      // 弹痕持有者才蓄印记：主角身上是不是弹痕，看他这一段时期拿的是什么
      scar: /弹痕/.test(per.armSub),
      gear: gid,
      gearAtk: gear?.mods.atk ?? 0,
      gearSpd: gear?.mods.spd ?? 0,
      gearBasic: (gear?.mods.basicMul ?? 0) + (per.passive?.basicMul ?? 0),
      tags: ['委员会'],
      note: `${per.vol.split(' · ')[0]} · ${per.arm}`,
    }
  }
  const axes = gearAxes(gearId, axisSheetOf(id, progress, growthPct))
  const gear = gearId ? GEAR_OF[gearId] : undefined
  const hpMax = Math.round(
    (TUNING.hpBase + axes.物理抗性 * TUNING.hpPerResist + axes.意志力 * TUNING.hpPerWill)
    * (1 + (TUNING.growthHpWeight * (growthPct || 0)) / 100),
  )
  const name = p?.name ?? id
  const role = ROSTER[id]
  const arm = armOf(id)
  return {
    id,
    side: 'ally',
    name,
    sigil: p?.sigil ?? '？',
    hue: p?.hue ?? '#8d8d99',
    avatarId: avatarIdOf(id),
    cls: role?.cls ?? '见习',
    trait: role?.trait,
    hp: hpMax,
    hpMax,
    axes,
    skills: skillsOf(id, gearId),
    fx: role?.skills[0]?.fx ?? ((arm && FX_OF_KIND[arm.kind]) || 'slash'),
    rated: !!CORE[id],
    bar: 0,
    spd: speedOf(axes),
    evade: TUNING.evadeBase + (gear?.mods.evade ?? 0),
    buffs: [],
    shield: gear?.mods.shield ?? 0,
    taunt: 0,
    down: false,
    passive: role?.passive,
    endured: 0,
    gone: 0,
    // 破绽 / 护持 / 蓄力：同主角那一支，我方默认三样都没有
    guardPts: 0,
    guardMax: 0,
    broken: 0,
    ward: 0,
    charge: 0,
    morph: null,
    sp: chSpMax(axes.意志力) + (role?.passive?.spMax ?? 0),
    spMax: chSpMax(axes.意志力) + (role?.passive?.spMax ?? 0),
    startUsed: 0,
    unsealedAt: 0,
    startNeed: START_GATE[id] ?? 0,
    stack: 0,
    chant: {},
    cds: {},
    scar: isScar(id),
    gear: gearId,
    gearAtk: gear?.mods.atk ?? 0,
    gearSpd: gear?.mods.spd ?? 0,
    gearBasic: (gear?.mods.basicMul ?? 0) + (role?.passive?.basicMul ?? 0),
    tags: ['委员会'],
    note: arm ? `${arm.kind} ${arm.name}` : role ? role.cls : undefined,
  }
}

/* ---------- 任务 → 敌阵 ---------- */

/**
 * 敌方型别：任务性质 → 敌方身份与它自己的一套打法。
 * 每一型都有自己的普攻与两门看家技能，各自带冷却 —— 现场打起来
 * 该型该做什么是可预期的，而不是所有敌人共用同一招。
 */
interface FoeSkill {
  id: string
  name: string
  kind: '普攻' | '技能'
  desc: string
  cost: number
  power: number
  axis: AxisKey
  target: Target
  effect?: SkillEffect
  turns?: number
  cd?: number
  /** 召唤：不造成伤害，出手时把一只同场性质的成形体喊上场（见 engine 的 summonFoe） */
  summon?: boolean
  /** 回响：复写我方上一手（整手照抄，所以是技能自己的性质，不在 effect 里） */
  echo?: boolean
  /**
   * 这一手自己的出手话。缺省才退回该型那一句通用的。
   * 普攻也算一手 —— 敌人打出来的每一下都该有名字、有动静，
   * 不能让日志里敌方那几行比小队那几行秃。
   */
  line?: string
}

interface FoeProfile {
  match: RegExp
  name: string
  cls: string
  fx: FxKind
  tags: string[]
  sigil: string
  hue: string
  /** 出手时的一句话（原文语气） */
  line: string
  skills: FoeSkill[]
  /**
   * 终结技能（大招）：只在 boss 级任务（危险度 ≥ TUNING.ultStage）配发。
   * 详见 types.ts 的 SkillSpec.ult 与 engine 的咏唱 / 打断 / 削弱三段反制。
   */
  ult?: { name: string; desc: string; power: number; axis: AxisKey; target: Target; line: string; effect?: SkillEffect; turns?: number }
}

/**
 * 普攻公用形态：每型的普攻名字、轴与出手话不同，其余口径一致。
 * 出手话是必给的 —— 敌方的普攻也要说得出「它做了什么」。
 */
const foeAtk = (id: string, name: string, desc: string, axis: AxisKey, power: number, line: string): FoeSkill =>
  ({ id, name, kind: '普攻', desc, line, cost: 0, power, axis, target: 'one', cd: 0 })

/**
 * boss 级专属的机制包。
 * ------------------------------------------------------------
 * 口径：**不是每只怪物都有**。只有危险度到顶（≥ TUNING.ultStage）的那几只，
 * 在自己本就有的那几手之外，再挂上这一套「观测机构级别的处置手段」——
 * 普通遭遇战里的小股敌人永远见不到这些。
 *
 * 五手分别对应五种不同的压迫：
 *   停滞   —— 冻结行动条。名字就叫终末停滞，这是它最本位的一手
 *   归档   —— 把人从战场上收走几拍，等于临时少一个人
 *   封锁   —— 压命中：看不见的东西打不准
 *   断拍   —— 把你这一拍从记录里划掉：轮到了也打不出来（与停滞互补：
 *             停滞冻的是条，断拍删的是那一手 —— 被冻住的人还可以先攒着，
 *             被划掉的人条是满的，就那么没了）
 *   回响   —— 把我方刚用过的那招原样打回来
 */
const BOSS_MOVES: FoeSkill[] = [
  {
    id: 'foe-boss-stasis', name: '停滞 · 观测冻结', kind: '技能',
    desc: '把一个人按在原地：行动条冻结两拍，这段时间他一步也走不动。',
    cost: 4, power: 0, axis: '反现实亲和', target: 'one', cd: 4,
    line: '「——」它把谁从记录里按住了，那个人就动不了。',
    effect: { stasis: 2 }, turns: 2,
  },
  {
    id: 'foe-boss-stall', name: '断拍 · 观测中止', kind: '技能',
    desc: '把某个人这一拍从记录里划掉：轮到他了也打不出来，条照样扣掉。',
    cost: 4, power: 0, axis: '反现实亲和', target: 'one', cd: 4,
    line: '「——」它把那一拍划掉了。轮到你了，可你打不出来。',
    effect: { stall: 1 },
  },
  {
    id: 'foe-boss-archive', name: '归档 · 静默收容', kind: '技能',
    desc: '把一名我方从战场上收走两拍：这段时间他不算在场，回来时行动条从零起。',
    cost: 4, power: 0, axis: '反现实亲和', target: 'one', cd: 5,
    line: '「——」不打了。有人被收进档案，场上少了一个。',
    effect: { archive: 2 }, turns: 2,
  },
  {
    id: 'foe-boss-lockdown', name: '观测封锁', kind: '技能',
    desc: '把这一带从观测记录里抹掉：我方全体命中下降 —— 不在记录里的东西，打不准东西。',
    cost: 4, power: 0, axis: '反现实亲和', target: 'all', cd: 4,
    line: '「——」这一带被从记录里抹掉了。不在记录里的东西，打不准东西。',
    effect: { lockdown: 0.25 }, turns: 3,
  },
  {
    id: 'foe-boss-echo', name: '回响 · 复写', kind: '技能',
    desc: '它把小队方才用过的那一手原样念回来，照着同样的分量落回小队自己人身上。',
    cost: 3, power: 0, axis: '反现实亲和', target: 'one', cd: 3, echo: true,
    line: '「——」它把小队方才那一手，原样念了回来。',
  },
]

const ENEMY_PROFILE: FoeProfile[] = [
  {
    match: /魔王/,
    name: '漆黑的影', cls: '魔王之影', fx: 'noise', tags: ['反现实', '异端', '魔王'],
    sigil: '王', hue: '#7a4de0',
    line: '「——」黑金的狮子低下来，那不是咆哮，是重量。',
    skills: [
      foeAtk('foe-maou-bite', '狮子 · 咬碎', '终末化之后仍在咬的那张嘴。', '破坏力', 1.1,
        '「——」那张嘴合上的动静，比咬本身迟一步才到。'),
      {
        id: 'foe-maou-roar', name: '终末化 · 咆哮', kind: '技能',
        desc: '把这一带的现实密度整体压下去：全场受伤，且所有人的行动条被推后。',
        cost: 4, power: 1.4, axis: '反现实亲和', target: 'all', cd: 3,
        effect: { pushBack: 0.35, mark: 0.2 }, turns: 2,
      },
      {
        id: 'foe-maou-crown', name: '黑金的重量', kind: '技能',
        desc: '黑金化的躯体砸落：单体重击，且这个人此后更容易被咬。',
        cost: 3, power: 2.2, axis: '破坏力', target: 'one', cd: 2,
        effect: { mark: 0.35, pushBack: 0.5, bleed: 0.05 }, turns: 2,
      },
    ],
  },
  {
    match: /异端/,
    name: '异端显形', cls: '异端', fx: 'noise', tags: ['反现实', '异端'],
    sigil: '异', hue: '#c8554e',
    line: '「它没有脸，但它在看你。」',
    skills: [
      foeAtk('foe-hetan-hold', '触须 · 掼', '不成形的手抡过来。', '破坏力', 1,
        '「——」那条没有形状的手抡下来，风比它先到。'),
      {
        id: 'foe-hetan-gaze', name: '异端的注视', kind: '技能',
        desc: '被它盯上的人会一直被盯着：标记一名我方，并让其充能变慢。',
        cost: 3, power: 0.9, axis: '反现实亲和', target: 'one', cd: 3,
        effect: { mark: 0.4, slow: 0.3 }, turns: 2,
      },
      {
        id: 'foe-hetan-swarm', name: '显形 · 增殖', kind: '技能',
        desc: '越打越多：它自己的攻击与充能一并抬高。',
        cost: 4, power: 0, axis: '反现实亲和', target: 'self', cd: 4,
        effect: { atkUp: 0.4, spdUp: 0.35 }, turns: 3,
      },
    ],
  },
  {
    match: /机械|工学|制品/,
    name: '反现实制成品', cls: '造物', fx: 'drone', tags: ['反现实', '机械'],
    sigil: '械', hue: '#4ea6c8',
    line: '「它按着图纸办事，图纸上没有『停』。」',
    skills: [
      foeAtk('foe-mech-arm', '机械臂 · 碾压', '工学制品的标准出力。', '破坏力', 1.05,
        '「——」机械臂按着同一个角度落下来。一次，再一次。'),
      {
        id: 'foe-mech-drain', name: '灵魂保存 · 抽离', kind: '技能',
        desc: '工学装置对着人抽一口：单体高伤并直接抹掉一部分行动条。',
        cost: 4, power: 1.8, axis: '反现实亲和', target: 'one', cd: 3,
        effect: { clearBar: true, pierce: true },
      },
      {
        id: 'foe-mech-overload', name: '工学 · 过载放电', kind: '技能',
        desc: '过载一瞬，全场吃电。',
        cost: 4, power: 1.5, axis: '破坏力', target: 'all', cd: 4,
      },
    ],
  },
  {
    match: /残渣|残留|清点|清缴|旧物/,
    name: '反现实残渣', cls: '残渣', fx: 'seal', tags: ['反现实', '残渣'],
    sigil: '末', hue: '#c8a04e',
    line: '「扫不干净的那种东西。」',
    skills: [
      foeAtk('foe-dregs-wear', '残渣 · 磨蚀', '蹭上来的一下，不重，但一直在。', '破坏力', 0.9,
        '「——」蹭上来的一下不重。难办的是它一直在。'),
      {
        id: 'foe-dregs-regather', name: '再聚拢', kind: '技能',
        desc: '被打散的部分重新聚回来：它给自己回一口气，并架起一重减伤。',
        cost: 3, power: 0, axis: '意志力', target: 'self', cd: 3,
        effect: { heal: 0.5, shield: 0.35 }, turns: 2,
      },
      {
        id: 'foe-dregs-wear-down', name: '磨蚀 · 积', kind: '技能',
        desc: '黏上来的东西越积越厚：一名我方被磨软，打不出原来的分量。',
        cost: 3, power: 0.5, axis: '破坏力', target: 'one', cd: 3,
        effect: { frail: 0.3 }, turns: 3,
      },
      {
        id: 'foe-dregs-crush', name: '高密度 · 压覆', kind: '技能',
        desc: '密度堆到一定程度就会压下来：全场受伤并减速。',
        cost: 4, power: 1.4, axis: '反现实亲和', target: 'all', cd: 3,
        effect: { slow: 0.3 }, turns: 2,
      },
    ],
  },
  {
    match: /低语/,
    name: '低语聚合体', cls: '低语', fx: 'seal', tags: ['反现实', '低语', '残渣'],
    sigil: '语', hue: '#3f9c86',
    line: '「很多人同时在你耳朵里说话，但你听得清每一句。」',
    skills: [
      foeAtk('foe-whisper-din', '低语 · 灌耳', '把杂音直接倒进脑子里。', '反现实亲和', 1,
        '「——」几十句话同时钻进同一只耳朵。'),
      {
        id: 'foe-whisper-chorus', name: '杂音 · 共鸣', kind: '技能',
        desc: '全场一起响：我方全体充能变慢，且更容易被听见（易伤）。',
        cost: 4, power: 0.8, axis: '反现实亲和', target: 'all', cd: 3,
        effect: { slow: 0.3, mark: 0.25 }, turns: 3,
      },
      {
        id: 'foe-whisper-mute', name: '杂音 · 封口', kind: '技能',
        desc: '把话从你嘴里拿走：沉默一名我方，这段时间他只剩普攻。',
        cost: 3, power: 0, axis: '反现实亲和', target: 'one', cd: 3,
        effect: { silence: true }, turns: 2,
      },
      {
        id: 'foe-whisper-refold', name: '再聚合 · 齐声', kind: '技能',
        desc: '所有低语合到一处喊出来：全场重击。',
        cost: 4, power: 1.6, axis: '反现实亲和', target: 'all', cd: 4,
      },
    ],
  },
  {
    match: /龙花|异界/,
    name: '异界龙花', cls: '异界龙花', fx: 'slash', tags: ['反现实', '异界', '龙花'],
    sigil: '龙', hue: '#c86a9a',
    line: '「异界开了口，从里面开出来的是花。」',
    skills: [
      foeAtk('foe-ryuka-bloom', '龙花 · 绽', '花瓣边缘是割人的。', '破坏力', 1.05,
        '「——」花瓣张开的那一下，边缘是割人的。'),
      {
        id: 'foe-ryuka-cut', name: '花瓣 · 割伤', kind: '技能',
        desc: '被花瓣边缘带过的地方一直在流血：每拍掉一截生命，不治就一路流下去。',
        cost: 3, power: 0.6, axis: '破坏力', target: 'one', cd: 3,
        effect: { bleed: 0.06 }, turns: 3,
      },
      {
        id: 'foe-ryuka-vine', name: '异界 · 蔓生', kind: '技能',
        desc: '异界的藤从地面铺开：全场受伤，并被缠住慢下来。',
        cost: 4, power: 1.3, axis: '反现实亲和', target: 'all', cd: 3,
        effect: { slow: 0.35 }, turns: 2,
      },
      {
        id: 'foe-ryuka-scale', name: '龙鳞 · 硬质化', kind: '技能',
        desc: '花瓣收拢成龙鳞的硬度：大幅减伤，并回一口气。',
        cost: 3, power: 0, axis: '物理抗性', target: 'self', cd: 4,
        effect: { shield: 0.5, heal: 0.3 }, turns: 3,
      },
    ],
  },
  {
    match: /未分类|观测记录/,
    name: '未分类观测体', cls: '未分类', fx: 'noise', tags: ['反现实', '未分类'],
    sigil: '未', hue: '#8a8f9c',
    line: '「图鉴上没有它。它也没有等你登记。」',
    skills: [
      foeAtk('foe-unk-touch', '记录外 · 触碰', '没被登记过的一次接触。', '反现实亲和', 1,
        '「——」它碰了你一下。图鉴上仍然没有它。'),
      {
        id: 'foe-unk-warp', name: '未分类 · 扭曲', kind: '技能',
        desc: '把观测到的事实扭一下：全场受伤，行动条一并被推后。',
        cost: 4, power: 1.4, axis: '反现实亲和', target: 'all', cd: 3,
        effect: { pushBack: 0.3, mark: 0.2 }, turns: 2,
      },
      {
        id: 'foe-unk-paradox', name: '观测悖论', kind: '技能',
        desc: '「它被观测到」这件事本身就是它的力量：自抬充能，并抹掉自己身上的负面。',
        cost: 3, power: 0, axis: '意志力', target: 'self', cd: 4,
        effect: { spdUp: 0.5, cleanse: true }, turns: 3,
      },
    ],
  },
]

/**
 * 各型敌体的**终结技能**（大招）。按档案名索引，只在 boss 级任务配发。
 * 名字与语气一律取该型在原文里的最高光那一手，不另立设定。
 */
const FOE_ULT: Record<string, NonNullable<FoeProfile['ult']>> = {
  漆黑的影: {
    name: '终末降临 · 黑金的黄昏', desc: '它把这一带的现实整体压低：全场重创，行动条被推后，全员开始流血。',
    power: 2.6, axis: '反现实亲和', target: 'all',
    line: '「——看好了。这就是终末的样子。」',
    effect: { pushBack: 0.45, mark: 0.25, bleed: 0.05 }, turns: 3,
  },
  异端显形: {
    name: '异端审问 · 万目', desc: '无数只眼睛同时睁开：单体审判，无视减伤与闪避。',
    power: 3.2, axis: '反现实亲和', target: 'one',
    line: '「它没有脸 —— 可它把你看完了。」', effect: { pierce: true, mark: 0.3 }, turns: 2,
  },
  反现实制成品: {
    name: '灵魂蓄积器TM · 全功率', desc: '装置开到顶：全场抽离，行动条一并被抹掉。',
    power: 2.4, axis: '反现实亲和', target: 'all',
    line: '「——抽离进度：百分之一百。」', effect: { clearBar: true, pierce: true }, turns: 2,
  },
  反现实残渣: {
    name: '残余再聚拢 · 结晶', desc: '碎屑在同一瞬间重新长成一样东西：全场重创。',
    power: 2.2, axis: '反现实亲和', target: 'all',
    line: '「散了一地的东西，又自己站起来了。」', effect: { mark: 0.3 }, turns: 3,
  },
  低语聚合体: {
    name: '万声齐鸣', desc: '所有低语同时开口：全场受创，充能一并被拖慢。',
    power: 2.3, axis: '反现实亲和', target: 'all',
    line: '「你听见的每一句，都是它说的。」', effect: { slow: 0.4, mark: 0.25 }, turns: 3,
  },
  异界龙花: {
    name: '异界龙花 · 满开', desc: '花在同一瞬开满整片地：全场斩击，护罩被一并抹去。',
    power: 2.5, axis: '破坏力', target: 'all',
    line: '「开花的动静，比雷还大。」', effect: { pierce: true }, turns: 2,
  },
  未分类观测体: {
    name: '观测终止 · 悖论坍缩', desc: '它把「自己被观测到」这件事一并了结：全场受到重创，它自己身上的不利也随之消去。',
    power: 2.4, axis: '意志力', target: 'all',
    line: '「记录到这里为止。」', effect: { cleanse: true, mark: 0.25 }, turns: 3,
  },
}

/** 兜底：性质对不上任何型别时，按「未分类观测体」处理 */
const FALLBACK_PROFILE = ENEMY_PROFILE[ENEMY_PROFILE.length - 1]

/**
 * 破绽：每一型反现实实体「怕哪条轴」。
 * ------------------------------------------------------------
 * 反现实实体的难缠不该只写成血厚 —— 血厚只是「多打几下」，
 * 而它该是「打不穿」：身上挂着一层护盾，只有**对上这条轴**的攻击才削得动。
 * 削穿之后它停一拍、且这一拍里挨打加成（见 engine 的破绽三段）。
 *
 * 这么定是为了让五轴各自有活干：从前除了破坏力，另外四条轴只影响
 * 充能、减伤、克制系数这些「背后的数」；有了破绽，「它怕什么」就成了
 * 一件要读、要记、要带对的人上场的事 —— 也正好是委员会的本职动作（观测）。
 *
 * 轴照型别本身的质地取，不掷骰子 —— 同一型每一场都一样，
 * 这样玩家才学得会，balance.mjs 也才复现得了。
 */
const GUARD_AXIS: Record<string, AxisKey> = {
  漆黑的影: '意志力',       // 魔王之影压的是人心：撑住它的不是拳头，是不肯低头
  异端显形: '反现实亲和',   // 不成形的东西，得用同一条轴去够它
  反现实制成品: '破坏力',   // 图纸造得再精，也是被砸坏的那一类
  反现实残渣: '意志力',     // 磨人的不是痛，是「它一直在」—— 拼的是谁先烦
  低语聚合体: '意志力',     // 万声齐鸣：只要还听得见自己那一句，就散不了
  异界龙花: '破坏力',       // 花开花落是物理的事，斩下去就断
  未分类观测体: '反现实亲和', // 观测体本身是「被看见」才成立的，那就用亲和对上它
}

/* 同型多只时的排行用字。要够长：一场仗最多 6 只（TUNING.enemyCap），
   初始最多 3 只，所以召唤物会排在丁之后 —— 只写到丁的话，后面几只全叫「丁」。 */
const SUFFIX = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛']

/**
 * 召唤 · 成形体诱出：首领与精英那一档才带的一手。
 * 它自己不造成伤害（power 0）—— 出手权换一个站场的人，这是它全部的意义。
 * 冷却走「自身出手次数」（见 engine 的 beginAction），所以首领大致是
 * 打几手、喊一个，而不是每一手都在喊。
 */
const SUMMON_MOVE: FoeSkill = {
  id: 'foe-summon', name: '召唤 · 成形体诱出', kind: '技能',
  desc: '不朝谁动手：把旁边那一片还没成形的东西喊起来，场上多一个。',
  cost: 2, power: 0, axis: '反现实亲和', target: 'self', cd: 5,
  line: '「——」它没看谁。它只是把旁边的什么喊醒了。',
  summon: true,
}

/**
 * 按任务阶段生成敌阵（阶段越高，数量与数值越强）。
 * 再按**该地 R 值**加一层：偏离正常区间越远，实体越凝实 ——
 * 只抬血量与「反现实亲和」，不动攻击与充能（理由见 rvalue.ts 文件头）。
 *
 * 再再按**时期**加一层（`progress`）——
 * 这一层是复核跑出来的，不是设计时想到的：在此之前敌方只认任务阶段，
 * 与小队推进到哪一卷毫无关系。而小队是会长的（言万叶的五轴整块按时期换页，
 * 卷末那几段的出力是开局的五倍多）。两边一错开，同一个危险度的含义
 * 就随着读到的卷数一路贬值：时期 0.15 时危险度 9/10 胜率 42%/38%（打不过），
 * 时期 0.90 时危险度 5/6/7/8 胜率 100%/100%/100%/99%（没得打）。
 * 一套数值在不同时期指向完全不同的难度，那它就不算一套数值。
 *
 * 所以实体也随现实变薄而凝实：越往后，同样一档危险度站上来的东西越硬。
 * 增益只给血量与破坏力 —— 充能不给，免得快起来的是「出手次数」，
 * 那一条已经在血量的马拉松里被算过一遍了（见 tuning 的 enemyAtkPerStage）。
 */
export function enemiesOf(m: Mission, progress = 0): Combatant[] {
  const count = m.stage >= 8 ? 3 : m.stage >= 5 ? 2 : 1
  const seed: FoeSeed = {
    missionId: m.id, nature: m.nature, place: m.place, stage: m.stage, progress,
    // 只站一只的时候不挂「甲」—— 甲乙丙丁是拿来分彼此的，只有一只就没得分
    solo: count === 1,
  }
  const out: Combatant[] = []
  for (let i = 0; i < count; i++) {
    // 每一场都得有一个拿得出的对手：头一名是「精英」；危险度到顶时它升格为「首领」。
    // 一支小队清完一整场却没碰上一个像样的东西，那不算作战，只算打扫。
    const tier: Combatant['tier'] = i > 0
      ? undefined
      : m.stage >= TUNING.ultStage ? 'boss' : 'elite'
    // 指名首领：任务挂了 bossId、且那份档案对得上时，场上的头一名就换成他
    // （见 bosses.ts —— 那一类对手是有名有姓有 RANK 的真人，不是现推的观测体）。
    out.push(buildFoe(seed, i, tier, i === 0 ? namedBossOf(m.bossId) : undefined))
  }
  return out
}

/**
 * 造一只敌体。`enemiesOf` 与 `minionOf`（召唤）共用这一份 ——
 * 召唤物不能是另写一套的「影子数值」：同一场里站着的两种东西若各按各的口径缩放，
 * 血量、护盾、体力、R 值、时期增幅就会悄悄分成两套，迟早对不上。
 */
interface FoeSeed {
  /** 原始任务 id（拼进敌体 id：同一场里所有敌体同源） */
  missionId: string
  /** 这一场的敌方性质 —— 召唤物得跟同场的是同一种东西 */
  nature: string
  place: string
  stage: number
  progress: number
  /** 单只上场的型别：名字不挂甲乙丙丁 */
  solo: boolean
  /** 召唤物：半成形（成形体诱出喊起来的东西还没站稳），血量与出力打折 */
  half?: boolean
}

function buildFoe(seed: FoeSeed, i: number, tier: Combatant['tier'], named?: NamedBoss): Combatant {
  const { nature, stage, solo } = seed
  const prof = ENEMY_PROFILE.find((p) => p.match.test(nature)) ?? FALLBACK_PROFILE
  const r = rOfPlace(seed.place, stage)
  const rf = rFactor(r.r)
  // 时期增幅：开局 ×1，卷末 ×(1 + enemyProgressGain)
  const pf = 1 + Math.max(0, Math.min(1, seed.progress)) * TUNING.enemyProgressGain
  // 半成形的那一档：血量与出力各打一个折（来由见 TUNING.summonHpMul）
  const halfHp = seed.half ? TUNING.summonHpMul : 1
  const halfAtk = seed.half ? TUNING.summonAtkMul : 1
  {
    // 首领与精英各走各的倍数：只写 elite 那一支的话，升格成首领反而掉回 ×1
    const hpMul = (tier === 'boss' ? TUNING.bossHpMul : tier === 'elite' ? TUNING.eliteHpMul : 1) * halfHp
    const atkMul = (tier === 'boss' ? TUNING.bossAtkMul : tier === 'elite' ? TUNING.eliteAtkMul : 1) * halfAtk
    const willMul = tier === 'boss' ? TUNING.bossWillMul : tier === 'elite' ? TUNING.eliteWillMul : 1
    const hpMax = named
      // 有名有姓的那位按自己的档案读数站场：血量走同一套曲线，
      // 但再乘一次他自己的 hpMul —— RANK6 与 RANK47 不该一样硬。
      // 指名首领**不吃时期增幅**：他是档案里的人，读数就该跟档案页一致，
      // 不能因为玩家多读了一卷，同一个人在档案上还是那个数、打起来却更厚。
      ? Math.round((TUNING.enemyHpBase + stage * TUNING.enemyHpPerStage)
        * rf.mul * TUNING.bossHpMul * named.hpMul)
      : Math.round((TUNING.enemyHpBase + stage * TUNING.enemyHpPerStage) * rf.mul * hpMul * pf)
    const axes: AxisSheet = named
      // 五轴照档案：与档案页读的是同一组数（roster 的 SIDE_AXIS 口径）
      ? {
        破坏力: named.axes?.[0] ?? SIDE_AXIS[named.id]?.[0] ?? 0,
        敏捷度: named.axes?.[1] ?? SIDE_AXIS[named.id]?.[1] ?? 0,
        物理抗性: named.axes?.[2] ?? SIDE_AXIS[named.id]?.[2] ?? 0,
        反现实亲和: named.axes?.[3] ?? SIDE_AXIS[named.id]?.[3] ?? 0,
        意志力: named.axes?.[4] ?? SIDE_AXIS[named.id]?.[4] ?? 0,
      }
      : {
        // 破坏力跟血量一起随时期走：只抬血的话，晚期的仗会变成
        // 「打不动我、我也打不死它」的干耗，那不是难度，是拖时间。
        破坏力: Math.round((TUNING.enemyAtkBase + stage * TUNING.enemyAtkPerStage) * atkMul * pf),
        敏捷度: Math.round(TUNING.enemySpdBase + stage * TUNING.enemySpdPerStage),
        物理抗性: Math.round(TUNING.enemyResistBase + stage * TUNING.enemyResistPerStage),
        反现实亲和: Math.round((10 + stage * 4) * rf.mul),
        意志力: Math.round((10 + stage * TUNING.enemyWillPerStage) * willMul),
      }
    const tag = tier === 'boss' ? '首领' : tier === 'elite' ? '精英' : ''
    const ename = named
      ? named.name
      : !solo
        ? `${prof.name} ${SUFFIX[i]}${tag ? ` · ${tag}` : ''}`
        : tag ? `${prof.name} · ${tag}` : prof.name
    // 敌方体力随其意志力走：意志越硬，这一场能出的手越多（与角色同一口径）
    const spMax = chSpMax(axes.意志力)
    /* 破绽：型别定轴、档位定点数。
       指名首领**只认自己写的那一份** —— 不能回退到型别那张表：
       天空竞技祭那几位是同行、是弹痕持有者，不是「打不穿的反现实实体」，
       给他们糊一层护盾等于替他们新造了机制（bosses.ts 的规矩：
       每一个名字、每一句台词、每一手机制都得有原文依据）。
       所以 named 在场时，没写 guardAxis 就是没有破绽。 */
    const guardAxis = named ? named.guardAxis : GUARD_AXIS[prof.name]
    const guardPts = !guardAxis ? 0
      : named?.guardPts
        ?? (tier === 'boss' ? TUNING.guardBoss : tier === 'elite' ? TUNING.guardElite : TUNING.guardMinion)
    return {
      id: `foe-${seed.missionId}-${i}`,
      side: 'enemy',
      name: ename,
      sigil: named?.sigil ?? prof.sigil,
      hue: named?.hue ?? prof.hue,
      cls: named?.cls ?? prof.cls,
      trait: named?.trait ?? nature,
      tier,
      hp: hpMax,
      hpMax,
      axes,
      passive: named?.passive,
      skills: named ? [
        // 指名首领：整套手都是他自己的（含兼任终结技能的到达点）。
        // 不挂通用机制包，也不挂「未分类观测体」的那记大招 ——
        // 他是谁，就该拿谁的招式打。
        ...named.skills,
      ] : [
        ...prof.skills.map((k) => ({
          id: k.id, name: k.name, kind: k.kind, desc: k.desc,
          cost: k.cost, power: k.power, axis: k.axis, fx: prof.fx,
          // 每一手都带自己的话：普攻也算一手，缺省才退回该型那一句
          line: k.line ?? prof.line,
          target: k.target, effect: k.effect, turns: k.turns, cd: k.cd ?? 0,
        } satisfies SkillSpec)),
        // boss 级的机制包：只有「首领」这一档才配这套（见 BOSS_MOVES）——
        // 判的是头上那一档，不是危险度：低危场的精英照样是正经对手，只是不带机制包。
        ...(tier === 'boss'
          ? BOSS_MOVES.map((k) => ({
              id: k.id, name: k.name, kind: k.kind, desc: k.desc,
              cost: k.cost, power: k.power, axis: k.axis, fx: prof.fx,
              line: k.line ?? prof.line, target: k.target, effect: k.effect, turns: k.turns,
              cd: k.cd ?? 0, echo: k.echo,
            } satisfies SkillSpec))
          : []),
        /* 召唤：首领与精英都带这一手（危险度底下的小兵不带 —— 见 SUMMON_MOVE）。
           注意排在这儿而不是型别技能表里：`enemyAct` 挑「重手」时取的是
           skills 里**第一手** kind === '技能' 的，召唤排到后面去，
           它才不会把首领的常规重手顶掉。
           指名首领也不带：那几位是同行、是弹痕持有者，不是「从这片现实里拆出人来」
           的东西 —— 他们的每一手机制都得有原文依据，不替他们新造（bosses.ts 的规矩）。 */
        ...(tier === 'boss' || tier === 'elite'
          ? [{
              id: SUMMON_MOVE.id, name: SUMMON_MOVE.name, kind: SUMMON_MOVE.kind,
              desc: SUMMON_MOVE.desc, cost: SUMMON_MOVE.cost, power: SUMMON_MOVE.power,
              axis: SUMMON_MOVE.axis, fx: prof.fx, line: SUMMON_MOVE.line ?? prof.line,
              target: SUMMON_MOVE.target, cd: SUMMON_MOVE.cd ?? 0,
              summon: true,
            } satisfies SkillSpec]
          : []),
        // boss 级的终结技能：不占常规出手，蓄满自己放（见 engine 的咏唱三段）
        ...(tier === 'boss'
          ? [{
              id: 'foe-ult',
              name: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).name,
              kind: '技能' as const,
              desc: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).desc,
              cost: 0,
              power: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).power,
              axis: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).axis,
              fx: prof.fx,
              line: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).line,
              target: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).target,
              effect: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).effect,
              turns: (FOE_ULT[prof.name] ?? FOE_ULT.未分类观测体).turns,
              cd: 0,
              ult: TUNING.ultCharge,
              ultBreak: TUNING.ultBreak,
            } satisfies SkillSpec]
          : []),
      ],
      fx: named?.skills[0]?.fx ?? prof.fx,
      rated: true,
      bar: 0,
      spd: speedOf(axes),
      evade: 0,
      buffs: [],
      shield: 0,
      taunt: 0,
      down: false,
      endured: 0,
      gone: 0,
      /* 破绽：反现实实体身上那层「只有对上这条轴才削得动」的护盾。
         轴由型别定（见 GUARD_AXIS），点数按档位给：小兵一层、精英三层、首领五层 ——
         越像样的对手，越值得先读懂它怕什么。指名首领可以自带自己那份。 */
      guardPts: guardPts,
      guardMax: guardPts,
      guardAxis: guardAxis,
      broken: 0,
      ward: 0,
      charge: 0,
      morph: null,
      startUsed: 0,
      unsealedAt: 0,
      sp: spMax,
      spMax,
      startNeed: 0,
      stack: 0,
    chant: {},
      cds: {},
      scar: false,
      gearAtk: 0,
      gearSpd: 0,
      gearBasic: 0,
      tags: prof.tags,
      note: rf.out
        ? `${nature} · ${r.known ? '' : '推算 '}R ${r.r.toFixed(3)}`
        : nature,
    }
  }
}

/**
 * 场中召唤出来的那一只（见 engine 的 summonFoe）。
 *
 * 与 `enemiesOf` 共用 `buildFoe`，所以它跟场上其余敌体走的是**同一套**口径：
 * 同一个型别、同一个地点的 R 值、同一个时期增幅、同样的护盾轴与体力换算。
 * 两处唯一的差别是名字与档位 ——
 *   · 它是小兵档（`tier` 留空）：首领喊来的不会是第二个首领，
 *     不然「首领」这个头衔就成了可以复制的量词；
 *   · 它是**半成形**的（`half`）：成形体诱出喊起来的东西还没站稳，
 *     血量与出力各打一个折（见 TUNING.summonHpMul）。
 *
 * `slot` 决定它叫「戊」还是「己」：接着场上已有的往下排，免得同一场里两个「丙」。
 */
export function minionOf(a: {
  missionId: string
  nature: string
  place: string
  stage: number
  progress: number
  /**
   * 它在这一场敌体里的排位 —— 就是召唤那一刻的 `s.enemies.length`。
   * 一个数同时管两件事：id 的后缀、以及甲乙丙丁排到第几个。
   * 之所以直接拿长度当排位，是因为 s.enemies 只增不减（倒下的也留着），
   * 长度天然就是「这一场站过多少东西」，不会重号。
   */
  slot: number
}): Combatant {
  return buildFoe(
    {
      missionId: a.missionId, nature: a.nature, place: a.place, stage: a.stage,
      progress: a.progress,
      // 召唤物一定带排行字：场上本来就还有别的东西，甲乙丙丁正是拿来分它们的
      solo: false,
      half: true,
    },
    a.slot,
    undefined,
    undefined,
  )
}
