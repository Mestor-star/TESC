/* ============================================================
   敌阵 · 按场面生成目标池
   ------------------------------------------------------------
   敌人不再是一张固定名单。这一份只做一件事：给定**这一段**
   （任务 / 现场交战 / 巡逻看板），列出「这一段里可遭遇的对手」，
   每一条都说得出：
     · 从哪份档案来（NamedBoss.from，或「现推观测体」）；
     · 为什么在这一段出现（原文实体 / 任务种子 / 同族同卷补的变体）。

   池子的三层来源，按优先级：
     ① 这一段原文列出的实体（mission.at → timeline.entities → 图鉴）；
     ② 任务自己登记的种子（mission.bossId / mission.foeSeeds）；
     ③ 没有前两层时，按 nature 的同族、按卷次与危险度补一两个 ——
        这一层才是「生成」，前两层是「原文里真实的那几位」。

   两条硬规矩：
     · 非生物一律不进池（地点 / 现象 / 设施 / 器物，见 foeclass.ts）；
     · 同一段多次进入必得同一批（键是 mission.id，确定性哈希，不掷骰）。

   玩家挑中的那一条交给 createBattle({ target })，derive 拿它当场上头名；
   不挑（平衡脚本 / 旧入口）就照旧走现推的观测体 —— 数值一口都不动。
   ============================================================ */

import { CODEX } from '../../data/codex'
import { TIMELINE } from '../../data/timeline'
import type { Mission } from '../../data/types'
import { resolveEntityToCodexId } from '../../data/codex'
import { namedBossOf } from './bosses'
import type { NamedBoss } from './bosses'
import { isFoeEntity, nonFoeReasonOf } from './foeclass'
import type { AxisKey, FoeTarget, FoeTargetVariant } from './types'

const AXES: readonly AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']

/** 确定性哈希（FNV-1a）—— 同一段必得同一批，不读 Math.random */
function hashOf(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/* ------------------------------------------------------------------
   变体：同一份档案的另一种观测形态（换皮 / 换招 / 换弱点）
   ------------------------------------------------------------------
   只改「它此刻以什么形态站在这儿」，不改它原本是谁 —— 名字、五轴底子、
   招式都仍出自那一份档案；变体只把血量与一手的性质偏一偏。
   换来换去都在这三样里，不做第四套数值。
   ------------------------------------------------------------------ */
const VARIANTS: readonly FoeTargetVariant[] = [
  {
    label: '残响形态',
    hpMul: 0.9,
    bias: { 敏捷度: 1.08 },
    tune: { index: 1, effect: { slow: 0.3 }, note: '这一形态落下的东西更拖人。' },
  },
  {
    label: '过载形态',
    hpMul: 1.12,
    bias: { 破坏力: 1.08 },
    tune: { index: 2, effect: { frail: 0.3 }, note: '这一形态把出力推过头，壳先裂的是挨打的人。' },
  },
  {
    label: '缝隙形态',
    hpMul: 1.0,
    bias: { 意志力: 1.1 },
    guardAxis: null,
    tune: { index: 1, effect: { mark: 0.3 }, note: '这一形态没有那层壳，它把标记直接贴上来。' },
  },
]

/** 给这一位挑一个变体（同一个种子恒得同一个） */
function variantFor(seed: string, base: NamedBoss): FoeTargetVariant {
  const v = VARIANTS[hashOf(seed) % VARIANTS.length]!
  // 只有本来就有破绽的才换轴：没有破绽的，不替它新造一层
  return { ...v, guardAxis: base.guardAxis ? v.guardAxis : undefined }
}

/** 档案 + 变体 → 上场用的那一份（derive 仍走同一条 buildFoe） */
export function targetBossOf(t: FoeTarget): NamedBoss | undefined {
  if (!t.bossId) return undefined
  const base = namedBossOf(t.bossId)
  if (!base || !t.variant) return base
  const v = t.variant
  const axes = base.axes
    ? (base.axes.map((x, i) => Math.max(1, Math.round(x * (v.bias?.[AXES[i]!] ?? 1)))) as
      [number, number, number, number, number])
    : undefined
  const skills = base.skills.map((k, i) => (i === v.tune?.index
    ? {
      ...k,
      name: k.name + ' · ' + v.label,
      desc: k.desc + '（' + v.tune.note + '）',
      effect: v.tune.effect ? { ...k.effect, ...v.tune.effect } : k.effect,
    }
    : k))
  return {
    ...base,
    name: base.name + ' · ' + v.label,
    hpMul: (base.hpMul ?? 1) * v.hpMul,
    axes,
    skills,
    ...(v.guardAxis === null ? { guardAxis: undefined } : v.guardAxis ? { guardAxis: v.guardAxis } : {}),
  }
}

/* ------------------------------------------------------------------
   场面 → 种子
   ------------------------------------------------------------------ */

/**
 * 原文里「这一场不算他」的那几笔 —— 与「不是生物」是两回事。
 * 脏器公寓那一场（2026-09-17 主人定）只打狂热者格尔：公寓本体与黑曜石
 * 都不站到对面。公寓本体由 foeclass 的黑名单拦（地点），黑曜石写在这里。
 */
const SCENE_EXCLUDE: Readonly<Record<string, readonly { id: string; why: string }[]>> = {
  'v1-5': [
    { id: 'obsidian', why: '原文里它只是短暂现身并被击溃；这一场只打狂热者格尔（2026-09-17 定）。' },
  ],
}

/**
 * 这一段里「明写着不上场」的那一位（见 SCENE_EXCLUDE）。
 * 主线简报也读它：简报上那句「对手是……」不该把不上场的那位算进去。
 */
export function sceneExcludes(evId: string, id: string): boolean {
  return (SCENE_EXCLUDE[evId] ?? []).some((x) => x.id === id)
}

/** 这一段属于第几卷（外传按第一卷算；巡逻任务按进度推） */
function volumeOf(m: Mission, progress: number): number {
  const v = /^v(\d+)-/.exec(m.at ?? '')
  if (v) return Number(v[1])
  if ((m.at ?? '').startsWith('s')) return 1
  return Math.min(6, Math.max(1, Math.round(1 + progress * 5)))
}

/** nature 里的关键词 → 图鉴的 classes（同族 / 同阵营） */
const NATURE_FAMILY: readonly [RegExp, readonly string[]][] = [
  [/魔王|异端|显形|面具|小丑|侦探|骑士|巨匠|大口|魔法/, ['异法', '天使之律', '旧神']],
  [/机械|装置|蓄积器|制成品|工学|人偶|机关/, ['反现实机械工学']],
  [/死灵|亡灵|不死|尸|骸|舰队/, ['死灵操法', '不死・魔术师']],
  [/仪式|灾害|祭祀|圣|律/, ['仪式灾害', '天使之律']],
  [/天使|旧神|守护者|降临/, ['天使之律', '旧神']],
  [/残渣|残骸|低语|残留|旧物|残响/, ['异法', '旧神', '梵我合一']],
  [/龙花|异界|共同幻想|鬼|神/, ['共同幻想', '梵我合一']],
]

function familyOf(nature: string): string[] {
  const out: string[] = []
  for (const e of CODEX) for (const c of e.classes) if (nature.includes(c)) out.push(c)
  for (const [re, cls] of NATURE_FAMILY) if (re.test(nature)) out.push(...cls)
  return [...new Set(out)]
}

/** 同族、同卷、危险度相邻的候选（生成层用） */
function relativesOf(m: Mission, vol: number): string[] {
  const fam = familyOf(m.nature)
  const scored = CODEX.filter((e) => isFoeEntity(e) && e.stage >= 0)
    .map((e) => {
      const hit = fam.length === 0 ? 0 : e.classes.filter((c) => fam.includes(c)).length
      const sameVol = e.ref === 'V' + vol ? 0 : 2
      const gap = Math.abs(e.stage - m.stage)
      return { id: e.id, hit, gap, score: (hit > 0 ? 0 : 10) + sameVol + gap }
    })
    .filter((x) => (x.hit > 0 || fam.length === 0) && x.gap <= 3)
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
  return scored.slice(0, 2).map((x) => x.id)
}

/* ------------------------------------------------------------------
   出口
   ------------------------------------------------------------------ */

/** 这一段的实体名字（给 why 用） */
function sceneOf(m: Mission) {
  return m.at ? TIMELINE.find((e) => e.id === m.at) : undefined
}

function makeTarget(a: {
  key: string; id?: string; name: string; stage: number; origin: string; why: string
  forced: boolean; variant?: FoeTargetVariant
}): FoeTarget {
  return {
    key: a.key,
    ...(a.id ? { bossId: a.id } : {}),
    name: a.name,
    stage: a.stage,
    tier: 'boss',
    origin: a.origin,
    why: a.why,
    forced: a.forced,
    ...(a.variant ? { variant: a.variant } : {}),
  }
}

/**
 * 这一段的敌阵目标池。
 *
 * @param m        任务 / 现场交战（含 at / bossId / foeSeeds / forced）
 * @param progress 观测进度（0..1；只有没有 at 的巡逻任务读它推卷次）
 */
export function foePoolOf(m: Mission, progress = 0.5): FoeTarget[] {
  const p = Math.max(0, Math.min(1, progress))
  const forced = m.forced === true
  const vol = volumeOf(m, p)
  const pool: FoeTarget[] = []
  /** 按档案 id 去重（同一份档案只当一次原文种子） */
  const seenIds = new Set<string>()
  /** 按池内键去重（同一份档案的不同观测形态是两条） */
  const seenKeys = new Set<string>()
  const dropped: string[] = []

  const add = (id: string, why: string, variant?: FoeTargetVariant) => {
    const key = 'seed-' + id + (variant ? ':' + variant.label : '')
    if (seenKeys.has(key)) return
    if (!variant && seenIds.has(id)) return
    /* 图鉴里登了的才查「是不是生物」；不在图鉴里的是**有档案的真人**
       （天空竞技祭那几位、卡乌斯学院的学生），他们没有 nature 一栏 —— 放行。 */
    const ent = CODEX.find((c) => c.id === id)
    if (ent && !isFoeEntity(ent)) {
      dropped.push(id + '（' + (nonFoeReasonOf(id) ?? '非生物') + '）')
      return
    }
    const base = namedBossOf(id)
    if (!base) { dropped.push(id + '（没有上场档案）'); return }
    seenIds.add(id)
    seenKeys.add(key)
    pool.push(makeTarget({
      key,
      id,
      name: variant ? base.name + ' · ' + variant.label : base.name,
      stage: base.codexStage ?? m.stage,
      origin: base.from,
      why,
      forced,
      variant,
    }))
  }

  /* ① 这一段原文列出的实体 */
  const scene = sceneOf(m)
  const excluded = scene ? (SCENE_EXCLUDE[scene.id] ?? []) : []
  const listed = (scene?.entities ?? []).filter((x) => x && x !== '——')
  for (const ent of listed) {
    const id = resolveEntityToCodexId(ent)
    if (!id) continue
    const skip = excluded.find((x) => x.id === id)
    if (skip) { dropped.push(id + '（这一段不算对手：' + skip.why + '）'); continue }
    add(id, '原文这一段列出的实体：「' + ent + '」。')
  }

  /* ② 任务自己登记的种子 */
  for (const id of [m.bossId, ...(m.foeSeeds ?? [])]) {
    if (id) add(id, '任务目标池登记的种子（' + (m.no || m.id) + '）。')
  }

  /* ③ 生成层：
     · 有原文 / 任务种子时**不另拉同族进来**（那会替这一段编出原文没有的对手）；
       只在巡逻任务（没有 at）且只有一条种子时，给同一条加一个观测形态。
     · 一条种子都没有时，才按同族、同卷、危险度相邻补两位，各带一个变体。 */
  if (pool.length === 0 && !scene) {
    for (const id of relativesOf(m, vol)) {
      if (pool.length >= 3) break
      const base = namedBossOf(id)
      if (!base) continue
      add(id, '这一段没有指名对手：按同族（' + (familyOf(m.nature).slice(0, 2).join(' / ') || '同卷')
        + '）与卷次 V' + vol + '、危险度 ' + m.stage + ' 补的观测实体。')
      if (pool.length < 3) add(id, '同一份档案的另一种观测形态。', variantFor(m.id + ':' + id, base))
    }
  } else if (pool.length === 1 && !m.at) {
    const id = pool[0]!.bossId
    const base = id ? namedBossOf(id) : undefined
    if (id && base) add(id, '同一份档案的另一种观测形态。', variantFor(m.id + ':' + id, base))
  }

  /* ④ 实在没有可归档的对手：上现推的观测体（仍是一条可挑的目标） */
  if (pool.length === 0) {
    pool.push(makeTarget({
      key: 'generic',
      name: '未分类观测体',
      stage: m.stage,
      origin: '无档案 —— 这一段原文没有指名实体',
      why: '按这一场的性质与危险度现推的观测体（与旧口径一致）。',
      forced,
    }))
  }

  if (import.meta.env?.DEV) {
    console.info('[敌阵种子] ' + (m.no || m.id) + ' → '
      + pool.map((t) => t.name + '（' + t.why + '）').join('；')
      + (dropped.length ? ' ｜剔除：' + dropped.join('、') : ''))
  }
  return pool
}