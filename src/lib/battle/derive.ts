/* ============================================================
   作战数值导出层
   ------------------------------------------------------------
   「档案 → 战斗面板」的唯一翻译处：
     · 五轴（常态评定）× 时期系数 × 成长加成     → 战斗用轴值
     · 武装（arms.ts，含弹痕）                    → 技能表与演出效果
     · 任务（missions.ts 的 stage / nature）      → 敌阵
   不改原文考据，不改数据口径；这里只做读数。
   ============================================================ */

import { CHARACTERS } from '../../data/chars'
import { ARMS } from '../../data/arms'
import { AXIS_MAX } from '../../data/types'
import type { Character, Mission } from '../../data/types'
import { CAST, avatarIdOf, personOf } from '../../data/castmeta'
import { TIMELINE } from '../../data/timeline'
import { furthestDone } from '../operator'
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

/** 某人此刻的五轴（常态评定 × 时期系数 × 任务成长） */
export function axisSheetOf(id: string, progress: number, growthPct = 0): AxisSheet {
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

/* ---------- 武装 → 技能 ---------- */

const FX_OF_KIND: Record<string, FxKind> = {
  弹痕: 'guitar',
  斩击: 'slash',
  片羽: 'seal',
  龙花: 'noise',
  特殊武器: 'drone',
}

/** 该角色持有的武装（arms.ts 以 holderId 关联） */
function armOf(id: string) {
  return ARMS.find((a) => a.holderId === id)
}

/** 弹痕持有者：其武装本相是「封印」，故普攻/技能走克制口径 */
function isScar(id: string): boolean {
  return ARMS.some((a) => a.holderId === id && a.kind === '弹痕')
}

/**
 * 技能表（每人固定三到四格）：
 *   普攻（无门 · 低耗） / 技能（耗体力） / 到达点（须蓄印记） / 防御
 * 弹痕持有者另有一格「启动技」—— 门上写着要打几次才解禁普攻与技能。
 */
export function skillsOf(id: string, name: string): SkillSpec[] {
  const arm = armOf(id)
  const fx = (arm && FX_OF_KIND[arm.kind]) || 'slash'
  const armName = arm?.name ?? ''
  const base = armName ? `${armName} · ` : ''
  const list: SkillSpec[] = []

  list.push({
    id: `${id}-atk`,
    name: `${base}横扫`,
    kind: '普攻',
    desc: '不耗心神的常规一击。',
    cost: TUNING.atkCost,
    power: TUNING.atkPower,
    axis: '破坏力',
    fx,
    line: '——上了。',
    target: 'one',
  })

  list.push({
    id: `${id}-skill`,
    name: armName ? `${base}解放` : '协同压制',
    kind: '技能',
    desc: arm?.power ? arm.power.slice(0, 60) + '…' : '把观测到的弱点一次打穿。',
    cost: TUNING.skillCost,
    power: TUNING.skillPower,
    axis: '破坏力',
    fx,
    line: arm?.phrase ? `「${arm.phrase}」` : '「让开——」',
    target: 'one',
  })

  if (arm?.awakened) {
    list.push({
      id: `${id}-burst`,
      name: `${base}到达点`,
      kind: '技能',
      desc: `到达点：${arm.awakened.slice(0, 54)}…`,
      cost: TUNING.burstCost,
      power: TUNING.burstPower,
      axis: '意志力',
      fx: 'noise',
      line: '「——这是我非做到不可的事。」',
      target: 'one',
      needsStack: TUNING.burstStack,
    })
  }

  list.push({
    id: `${id}-guard`,
    name: '架势',
    kind: '防御',
    desc: '稳住呼吸，本回合大幅减伤。',
    cost: TUNING.guardCost,
    power: 0,
    axis: '物理抗性',
    fx: 'guard',
    line: '……先站住。',
    target: 'self',
    guard: TUNING.guardCut,
  })

  const gate = START_GATE[id] ?? 0
  if (gate > 0) {
    list.push({
      id: `${id}-start`,
      name: name === '恋兔光' ? '解封试音' : '镇封起手',
      kind: '启动',
      desc: `解开武装上的一重封印。需先后打出 ${gate} 次，普攻与技能才会解禁。`,
      cost: TUNING.startCost,
      power: TUNING.startPower,
      axis: '破坏力',
      fx,
      line: '「先调准音。——一之弦。」',
      target: 'one',
    })
  }

  return list
}

/* ---------- 角色 → 战斗单位 ---------- */

export function combatantOf(id: string, progress: number, growthPct = 0): Combatant {
  const p = personOf(id)
  const axes = axisSheetOf(id, progress, growthPct)
  const hpMax = Math.round(
    TUNING.hpBase + axes.物理抗性 * TUNING.hpPerResist + axes.意志力 * TUNING.hpPerWill,
  )
  const name = p?.name ?? id
  const arm = armOf(id)
  return {
    id,
    side: 'ally',
    name,
    sigil: p?.sigil ?? '？',
    hue: p?.hue ?? '#8d8d99',
    avatarId: avatarIdOf(id),
    hp: hpMax,
    hpMax,
    axes,
    skills: skillsOf(id, name),
    fx: (arm && FX_OF_KIND[arm.kind]) || 'slash',
    rated: !!CORE[id],
    guard: 0,
    down: false,
    startUsed: 0,
    startNeed: START_GATE[id] ?? 0,
    stack: 0,
    scar: isScar(id),
    tags: ['委员会'],
    note: arm ? `${arm.kind} ${arm.name}` : p ? '未评定面板' : undefined,
  }
}

/* ---------- 任务 → 敌阵 ---------- */

const ENEMY_PROFILE: { match: RegExp; name: string; fx: FxKind; tags: string[] }[] = [
  { match: /魔王/, name: '漆黑的影', fx: 'noise', tags: ['反现实', '异端', '魔王'] },
  { match: /异端/, name: '异端显形', fx: 'noise', tags: ['反现实', '异端'] },
  { match: /机械|工学|制品/, name: '反现实制成品', fx: 'drone', tags: ['反现实', '机械'] },
  { match: /残渣|残留|清点|清缴|旧物/, name: '反现实残渣', fx: 'seal', tags: ['反现实', '残渣'] },
  { match: /低语/, name: '低语聚合体', fx: 'seal', tags: ['反现实', '残渣'] },
]
const FALLBACK_PROFILE = { name: '反现实实体', fx: 'noise' as FxKind, tags: ['反现实'] }

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
      hp: hpMax,
      hpMax,
      axes,
      skills: [
        {
          id: 'foe-atk',
          name: '侵袭',
          kind: '普攻',
          desc: '反现实的一击。',
          cost: 0,
          power: 1,
          axis: '破坏力',
          fx: prof.fx,
          line: '',
          target: 'one',
        },
      ],
      fx: prof.fx,
      rated: true,
      guard: 0,
      down: false,
      startUsed: 0,
      startNeed: 0,
      stack: 0,
      scar: false,
      tags: prof.tags,
      note: m.nature,
    })
  }
  return out
}
