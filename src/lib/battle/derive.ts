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
import { opPeriodAtProgress } from '../operator-arc'
import type { OpPeriod } from '../operator-arc'
import { TIMELINE } from '../../data/timeline'
import { furthestDone } from '../operator'
import { ROSTER } from './roster'
import { GEAR_OF, gearSkillOf } from './gear'
import { START_GATE, TUNING, UNRATED_AXES } from './tuning'
import type { AxisKey, AxisSheet, Combatant, FxKind, SkillSpec } from './types'

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
      cost: TUNING.skillCost, power: TUNING.skillPower, axis: '破坏力', fx,
      line: '「让开——」', target: 'one',
    },
  ]
}

/**
 * 技能表 = 该角色的专属技能（roster.ts）+ 装具附带的一手。
 * 慢启动门（START_GATE）由引擎按 kind === '启动' 的次数把关，此处只负责出表。
 */
/** 言万心叶的技能表 = 该时期的「所能做的事」（原文原名） */
function opSkillsOf(per: OpPeriod): SkillSpec[] {
  return per.abilities.map((a, i) => ({
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
  }))
}

export function skillsOf(id: string, gearId?: string): SkillSpec[] {
  if (id === OPERATOR_ID) {
    const list = opSkillsOf(opPeriodAtProgress(0))
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
    const axes = gearAxes(gearId, axisSheetOf(id, progress, growthPct))
    const gear = gearId ? GEAR_OF[gearId] : undefined
    const hpMax = Math.round(
      (TUNING.hpBase + axes.物理抗性 * TUNING.hpPerResist + axes.意志力 * TUNING.hpPerWill)
      * (1 + (TUNING.growthHpWeight * (growthPct || 0)) / 100),
    )
    const skills = opSkillsOf(per)
    const gs = gearId ? gearSkillOf(gearId, id) : null
    if (gs) skills.push({ ...(gs as SkillSpec), id: `${id}-gear-${gearId}` })
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
      sp: chSpMax(axes.意志力),
      spMax: chSpMax(axes.意志力),
      startUsed: 0,
      startNeed: START_GATE[id] ?? 0,
      stack: 0,
      cds: {},
      scar: false,
      gear: gearId,
      gearAtk: gear?.mods.atk ?? 0,
      gearSpd: gear?.mods.spd ?? 0,
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
    sp: chSpMax(axes.意志力),
    spMax: chSpMax(axes.意志力),
    startUsed: 0,
    startNeed: START_GATE[id] ?? 0,
    stack: 0,
    cds: {},
    scar: isScar(id),
    gear: gearId,
    gearAtk: gear?.mods.atk ?? 0,
    gearSpd: gear?.mods.spd ?? 0,
    tags: ['委员会'],
    note: arm ? `${arm.kind} ${arm.name}` : role ? role.cls : undefined,
  }
}

/* ---------- 任务 → 敌阵 ---------- */

const ENEMY_PROFILE: { match: RegExp; name: string; cls: string; fx: FxKind; tags: string[] }[] = [
  { match: /魔王/, name: '漆黑的影', cls: '魔王之影', fx: 'noise', tags: ['反现实', '异端', '魔王'] },
  { match: /异端/, name: '异端显形', cls: '异端', fx: 'noise', tags: ['反现实', '异端'] },
  { match: /机械|工学|制品/, name: '反现实制成品', cls: '造物', fx: 'drone', tags: ['反现实', '机械'] },
  { match: /残渣|残留|清点|清缴|旧物/, name: '反现实残渣', cls: '残渣', fx: 'seal', tags: ['反现实', '残渣'] },
  { match: /低语/, name: '低语聚合体', cls: '低语', fx: 'seal', tags: ['反现实', '残渣'] },
]
const FALLBACK_PROFILE = { name: '反现实实体', cls: '实体', fx: 'noise' as FxKind, tags: ['反现实'] }

const SUFFIX = ['甲', '乙', '丙', '丁']

/** 按任务阶段生成敌阵（阶段越高，数量与数值越强） */
export function enemiesOf(m: Mission): Combatant[] {
  const prof = ENEMY_PROFILE.find((p) => p.match.test(m.nature)) ?? FALLBACK_PROFILE
  const count = m.stage >= 8 ? 3 : m.stage >= 5 ? 2 : 1
  const out: Combatant[] = []
  for (let i = 0; i < count; i++) {
    const hpMax = Math.round(TUNING.enemyHpBase + m.stage * TUNING.enemyHpPerStage)
    const axes: AxisSheet = {
      破坏力: Math.round(TUNING.enemyAtkBase + m.stage * TUNING.enemyAtkPerStage),
      敏捷度: Math.round(TUNING.enemySpdBase + m.stage * TUNING.enemySpdPerStage),
      物理抗性: Math.round(TUNING.enemyResistBase + m.stage * TUNING.enemyResistPerStage),
      反现实亲和: Math.round(10 + m.stage * 4),
      意志力: Math.round(10 + m.stage * TUNING.enemyWillPerStage),
    }
    const ename = count > 1 ? `${prof.name} ${SUFFIX[i]}` : prof.name
    out.push({
      id: `foe-${m.id}-${i}`,
      side: 'enemy',
      name: ename,
      sigil: prof.tags.includes('魔王') ? '王' : prof.tags.includes('机械') ? '械' : '末',
      hue: prof.tags.includes('魔王') ? '#7a4de0' : prof.tags.includes('机械') ? '#4ea6c8' : '#c8554e',
      cls: prof.cls,
      trait: m.nature,
      hp: hpMax,
      hpMax,
      axes,
      skills: [
        {
          id: 'foe-atk', name: '侵袭', kind: '普攻', desc: '反现实的一击。',
          cost: 0, power: 1, axis: '破坏力', fx: prof.fx, line: '', target: 'one',
        },
        {
          id: 'foe-heavy', name: '反现实的重量', kind: '技能', desc: '把这一带的现实密度压下来。',
          cost: 3, power: 1.5, axis: '反现实亲和', fx: prof.fx, line: '', target: 'all',
        },
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
      startUsed: 0,
      sp: chSpMax(60),
      spMax: chSpMax(60),
      startNeed: 0,
      stack: 0,
      cds: {},
      scar: false,
      gearAtk: 0,
      gearSpd: 0,
      tags: prof.tags,
      note: m.nature,
    })
  }
  return out
}
