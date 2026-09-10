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
import { ARMS } from '../../data/arms'
import { AXIS_MAX } from '../../data/types'
import type { Character, Mission } from '../../data/types'
import { CAST, OPERATOR_ID, avatarIdOf, personOf } from '../../data/castmeta'
import { opBuiltinOf, opPeriodAtProgress } from '../operator-arc'
import type { OpPeriod } from '../operator-arc'
import { TIMELINE } from '../../data/timeline'
import { furthestDone } from '../operator'
import { POWER_SCALE, ROSTER } from './roster'
import { GEAR_OF, gearSkillOf } from './gear'
import { START_GATE, TUNING, UNRATED_AXES } from './tuning'
import { rFactor, rOfPlace } from './rvalue'
import type { AxisKey, AxisSheet, Combatant, FxKind, SkillEffect, SkillSpec, Target } from './types'

const AXES: AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']

const CORE: Record<string, Character> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]))

/** 名录全名/别名 → id（任务简报的 recommend 里写的是中文名） */
const NAME2ID = (() => {
  const m = new Map<string, string>()
  for (const p of CAST) {
    for (const n of [p.name, ...p.names]) if (!m.has(n)) m.set(n, p.id)
  }
  return m
})()

/** 任务简报的推荐名单（中文名）→ 名录 id（认不出的丢弃） */
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

/** '∞' → 观测上限（数学上代入 AXIS_MAX；UI 另标「不可测」） */
function numOf(v: number | '∞' | undefined): number {
  if (v === undefined) return 0
  return v === '∞' ? AXIS_MAX : v
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
  return [
    {
      id: `${id}-atk`, name: `${base}横扫`, kind: '普攻', desc: '不耗心神的常规一击。',
      cost: TUNING.atkCost, power: TUNING.atkPower, axis: '破坏力', fx, line: '——上了。', target: 'one',
    },
    {
      id: `${id}-skill`, name: armName ? `${base}解放` : '协同压制', kind: '技能',
      desc: '把观测到的弱点一次打穿。',
      cost: TUNING.skillCost, power: TUNING.skillPower * POWER_SCALE, axis: '破坏力', fx,
      line: '「让开——」', target: 'one',
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
  return open.map((a, i) => ({
    id: `op-${per.at}-${i}`,
    name: a.name,
    kind: a.kind,
    desc: a.desc,
    cost: a.cost ?? (a.kind === '普攻' ? 1 : a.kind === '启动' ? 2 : 4),
    power: a.pow,
    axis: a.axis,
    fx: a.fx,
    line: '',
    target: a.target ?? (a.kind === '启动' ? 'self' : 'one'),
    effect: a.effect,
    turns: a.turns,
    needsStack: a.needsStack,
    // 冷却与名册同一口径：普攻 / 启动无冷却，到达点 4 拍，其余 2 拍
    cd: a.cd ?? (a.kind === '普攻' || a.kind === '启动' ? 0 : a.needsStack ? 4 : 2),
    // 「合体」类：需同伴在场才可出，出手时把人请下场、若干拍后归位
    requireAlly: a.requireAlly,
    mergeAlly: a.mergeAlly,
    mergeTicks: a.mergeTicks,
    morph: a.morph,
    morphTicks: a.morphTicks,
    morphCd: a.morphCd,
  }))
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
      morph: null,
      sp: chSpMax(axes.意志力) + (per.passive?.spMax ?? 0),
      spMax: chSpMax(axes.意志力) + (per.passive?.spMax ?? 0),
      startUsed: 0,
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
    morph: null,
    sp: chSpMax(axes.意志力) + (role?.passive?.spMax ?? 0),
    spMax: chSpMax(axes.意志力) + (role?.passive?.spMax ?? 0),
    startUsed: 0,
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

/** 普攻公用形态：每型的普攻名字与轴不同，其余口径一致 */
const foeAtk = (id: string, name: string, desc: string, axis: AxisKey, power = 1): FoeSkill =>
  ({ id, name, kind: '普攻', desc, cost: 0, power, axis, target: 'one', cd: 0 })

const ENEMY_PROFILE: FoeProfile[] = [
  {
    match: /魔王/,
    name: '漆黑的影', cls: '魔王之影', fx: 'noise', tags: ['反现实', '异端', '魔王'],
    sigil: '王', hue: '#7a4de0',
    line: '「——」黑金的狮子低下来，那不是咆哮，是重量。',
    skills: [
      foeAtk('foe-maou-bite', '狮子 · 咬碎', '终末化之后仍在咬的那张嘴。', '破坏力', 1.1),
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
        effect: { mark: 0.35, pushBack: 0.5 }, turns: 2,
      },
    ],
  },
  {
    match: /异端/,
    name: '异端显形', cls: '异端', fx: 'noise', tags: ['反现实', '异端'],
    sigil: '异', hue: '#c8554e',
    line: '「它没有脸，但它在看你。」',
    skills: [
      foeAtk('foe-hetan-hold', '触须 · 掼', '不成形的手抡过来。', '破坏力'),
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
      foeAtk('foe-mech-arm', '机械臂 · 碾压', '工学制品的标准出力。', '破坏力', 1.05),
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
      foeAtk('foe-dregs-wear', '残渣 · 磨蚀', '蹭上来的一下，不重，但一直在。', '破坏力', 0.9),
      {
        id: 'foe-dregs-regather', name: '再聚拢', kind: '技能',
        desc: '被打散的部分重新聚回来：它给自己回一口气，并架起一重减伤。',
        cost: 3, power: 0, axis: '意志力', target: 'self', cd: 3,
        effect: { heal: 0.5, shield: 0.35 }, turns: 2,
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
      foeAtk('foe-whisper-din', '低语 · 灌耳', '把杂音直接倒进脑子里。', '反现实亲和', 1),
      {
        id: 'foe-whisper-chorus', name: '杂音 · 共鸣', kind: '技能',
        desc: '全场一起响：我方全体充能变慢，且更容易被听见（易伤）。',
        cost: 4, power: 0.8, axis: '反现实亲和', target: 'all', cd: 3,
        effect: { slow: 0.3, mark: 0.25 }, turns: 3,
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
      foeAtk('foe-ryuka-bloom', '龙花 · 绽', '花瓣边缘是割人的。', '破坏力', 1.05),
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
      foeAtk('foe-unk-touch', '记录外 · 触碰', '没被登记过的一次接触。', '反现实亲和', 1),
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
    name: '终末降临 · 黑金的黄昏', desc: '它把这一带的现实整体压低：全场重创，行动条一并被推后。',
    power: 2.6, axis: '反现实亲和', target: 'all',
    line: '「——看好了。这就是终末的样子。」', effect: { pushBack: 0.45, mark: 0.25 }, turns: 3,
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
    name: '观测终止 · 悖论坍缩', desc: '它把「自己被观测到」这件事结算掉：全场重创，并抹掉自身的负面。',
    power: 2.4, axis: '意志力', target: 'all',
    line: '「记录到这里为止。」', effect: { cleanse: true, mark: 0.25 }, turns: 3,
  },
}

/** 兜底：性质对不上任何型别时，按「未分类观测体」处理 */
const FALLBACK_PROFILE = ENEMY_PROFILE[ENEMY_PROFILE.length - 1]

const SUFFIX = ['甲', '乙', '丙', '丁']

/**
 * 按任务阶段生成敌阵（阶段越高，数量与数值越强）。
 * 再按**该地 R 值**加一层：偏离正常区间越远，实体越凝实 ——
 * 只抬血量与「反现实亲和」，不动攻击与充能（理由见 rvalue.ts 文件头）。
 */
export function enemiesOf(m: Mission): Combatant[] {
  const prof = ENEMY_PROFILE.find((p) => p.match.test(m.nature)) ?? FALLBACK_PROFILE
  const count = m.stage >= 8 ? 3 : m.stage >= 5 ? 2 : 1
  const r = rOfPlace(m.place, m.stage)
  const rf = rFactor(r.r)
  const out: Combatant[] = []
  for (let i = 0; i < count; i++) {
    const hpMax = Math.round((TUNING.enemyHpBase + m.stage * TUNING.enemyHpPerStage) * rf.mul)
    const axes: AxisSheet = {
      破坏力: Math.round(TUNING.enemyAtkBase + m.stage * TUNING.enemyAtkPerStage),
      敏捷度: Math.round(TUNING.enemySpdBase + m.stage * TUNING.enemySpdPerStage),
      物理抗性: Math.round(TUNING.enemyResistBase + m.stage * TUNING.enemyResistPerStage),
      反现实亲和: Math.round((10 + m.stage * 4) * rf.mul),
      意志力: Math.round(10 + m.stage * TUNING.enemyWillPerStage),
    }
    const ename = count > 1 ? `${prof.name} ${SUFFIX[i]}` : prof.name
    // 敌方体力随其意志力走：意志越硬，这一场能出的手越多（与角色同一口径）
    const spMax = chSpMax(axes.意志力)
    out.push({
      id: `foe-${m.id}-${i}`,
      side: 'enemy',
      name: ename,
      sigil: prof.sigil,
      hue: prof.hue,
      cls: prof.cls,
      trait: m.nature,
      hp: hpMax,
      hpMax,
      axes,
      skills: [
        ...prof.skills.map((k) => ({
          id: k.id, name: k.name, kind: k.kind, desc: k.desc,
          cost: k.cost, power: k.power, axis: k.axis, fx: prof.fx,
          line: k.kind === '普攻' ? '' : prof.line,
          target: k.target, effect: k.effect, turns: k.turns, cd: k.cd ?? 0,
        } satisfies SkillSpec)),
        // boss 级的终结技能：不占常规出手，蓄满自己放（见 engine 的咏唱三段）
        ...(m.stage >= TUNING.ultStage
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
      fx: prof.fx,
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
      morph: null,
      startUsed: 0,
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
        ? `${m.nature} · ${r.known ? '' : '推算 '}R ${r.r.toFixed(3)}`
        : m.nature,
    })
  }
  return out
}
