/* ============================================================
   敌体 · 现场生成
   ------------------------------------------------------------
   敌人不再从原文档案里点名。进战斗之前，拿这一场的现场条件
   （编号、地点、阶段、性质）问一次推演通道，让它现造三名
   「这一段可能撞上的对手」；玩家挑一位开打。
   原文里的具名对手不再作为对手出场。

   两条硬规矩：
     · 通道没配 / 调不通 / 回包读不出来 → 作战系统按同一套档位现推三名后备，
       战斗入口不会因为没网卡住；
     · 模型只给名字、定位、偏置与三手技能的名字，**数值一律在本地算**。
       五轴、血量、时期增幅都走 tuning 的同一把尺，模型改不动平衡。

   生成出来的这一组存在 FoeTarget.pack 里；选谁，谁排第 0 位
   （见 lib/battle/foegen 的 packBossOf）。
   ============================================================ */

import { chatCompletion, isReady } from '../api'
import type { ApiSettings, ChatTurn } from '../api'
import type { Mission } from '../../data/types'
import { place } from './atlas'
import type { AxisKey, FoeTarget, FxKind, GenFoe, SkillSpec } from './types'

const AXES: readonly AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']
const FX: readonly FxKind[] = ['slash', 'blast', 'guitar', 'seal', 'drone', 'noise']

/** 模型这头只收三行一句话。写得越长越容易跑题，也越容易被输出上限掐断。 */
const SYSTEM = [
  '你在为一场战斗现场生成敌体。',
  '不要引用任何已有作品、原作、既有角色或既有剧情里的名字、地名、事件。',
  '只依据下面这份现场条件，造三个这一场可能撞上的对手。',
  '每个对手都要像这一场里真的会长出来的东西：性质、地点、危险度对得上。',
  '不要写比喻，不要写解释，不要写「不是 A 而是 B」。',
  '只输出 JSON 数组，不要围栏，不要多余的字。',
].join('\n')

interface RawSkill {
  name?: unknown
  desc?: unknown
  line?: unknown
  axis?: unknown
  fx?: unknown
  power?: unknown
}

interface RawFoe {
  name?: unknown
  sigil?: unknown
  cls?: unknown
  trait?: unknown
  why?: unknown
  hue?: unknown
  hpBias?: unknown
  bias?: Record<string, unknown>
  skills?: RawSkill[]
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 去掉标签、围栏与破折号；模型偶尔会把这些当语气写进来。 */
function clean(v: unknown, max: number, fallback: string): string {
  let s = typeof v === 'string' ? v : ''
  s = s.replace(/[<>\u0060]/g, '').replace(/[\u2014\u2013]+/g, '，').replace(/\s+/g, ' ').trim()
  if (!s) return fallback
  return s.length > max ? s.slice(0, max).trim() : s
}

function axisOf(v: unknown, fallback: AxisKey): AxisKey {
  return AXES.includes(v as AxisKey) ? (v as AxisKey) : fallback
}

function fxOf(v: unknown, fallback: FxKind): FxKind {
  return FX.includes(v as FxKind) ? (v as FxKind) : fallback
}

function hueOf(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#8f9cb8'
}

function biasOf(v: unknown): Partial<Record<AxisKey, number>> {
  const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: Partial<Record<AxisKey, number>> = {}
  for (const k of AXES) {
    if (!(k in src)) continue
    const n = num(src[k], 1)
    if (n !== 1) out[k] = clamp(n, 0.82, 1.2)
  }
  return out
}

/** 三手：0 普攻 / 1 伤害战技 / 2 机制或防御。索引 1 必须造成伤害，离线只挑它。 */
function skillsOf(raw: RawFoe, key: string): SkillSpec[] {
  const list = Array.isArray(raw.skills) ? raw.skills : []
  const s0 = list[0] ?? {}
  const s1 = list[1] ?? {}
  const s2 = list[2] ?? {}
  return [
    place('basic', {
      id: key + '-0',
      name: clean(s0.name, 16, '近身一击'),
      desc: clean(s0.desc, 70, '贴近了打，不给对面拉开的空当。'),
      axis: axisOf(s0.axis, '破坏力'),
      fx: fxOf(s0.fx, 'slash'),
      power: clamp(num(s0.power, 1.2), 0.8, 1.8),
      line: clean(s0.line, 40, '看见你了。'),
    }),
    place('强袭', {
      id: key + '-1',
      name: clean(s1.name, 16, '压上来的重手'),
      desc: clean(s1.desc, 70, '把这一场的力气全压在一处。'),
      axis: axisOf(s1.axis, '破坏力'),
      fx: fxOf(s1.fx, 'blast'),
      power: clamp(num(s1.power, 2.0), 1.2, 3.2),
      effect: { mark: 0.18 },
      line: clean(s1.line, 40, '这一下躲不开。'),
    }),
    place('坚守', {
      id: key + '-2',
      name: clean(s2.name, 16, '收拢防线'),
      desc: clean(s2.desc, 70, '把露在外面的地方收回去，等下一拍。'),
      axis: axisOf(s2.axis, '物理抗性'),
      effect: { shield: 0.32, taunt: true },
      line: clean(s2.line, 40, '再等一拍。'),
    }),
  ]
}

function foeOf(raw: RawFoe, key: string, origin: string, fallbackName: string): GenFoe {
  return {
    name: clean(raw.name, 18, fallbackName),
    sigil: clean(raw.sigil, 1, fallbackName.slice(0, 1) || '敌'),
    cls: clean(raw.cls, 10, '现场观测体'),
    trait: clean(raw.trait, 64, '这一场里凝出来的对手，按自己的性质出手。'),
    why: clean(raw.why, 56, '按这一段的性质、地点与危险度现场推定的对手。'),
    hue: hueOf(raw.hue),
    origin,
    hpBias: clamp(num(raw.hpBias, 1), 0.85, 1.2),
    bias: biasOf(raw.bias),
    skills: skillsOf(raw, key),
  }
}

function packOf(mission: Mission, raws: RawFoe[], origin: string, fallbackNames: readonly string[]): GenFoe[] {
  return [0, 1, 2].map((i) =>
    foeOf(raws[i] ?? {}, 'gen-' + mission.id + '-' + i, origin, fallbackNames[i] ?? '现场观测体'),
  )
}

/** 把一个 pack 转成池里的一条：选中的那一位排到第 0 位，其余仍跟着它上场。 */
function targetOf(mission: Mission, progress: number, pack: GenFoe[], at: number, key: string): FoeTarget {
  const head = pack[at] ?? pack[0]!
  const ordered = [head, ...pack.filter((g) => g !== head)]
  return {
    key,
    name: head.name,
    stage: mission.stage,
    tier: 'boss',
    origin: head.origin,
    why: head.why,
    forced: mission.forced === true,
    pack: ordered,
    progress: clamp(progress, 0, 1),
  }
}

/* ------------------------------------------------------------------
   后备：没有通道 / 调不通时，作战系统按同一套档位现推三位
   ------------------------------------------------------------------ */
interface FallbackRaw extends RawFoe {
  name: string
  sigil: string
  cls: string
  trait: string
  why: string
  hue: string
  hpBias: number
  bias: Partial<Record<AxisKey, number>>
  skills: RawSkill[]
}

function familyOf(nature: string): '机械' | '死灵' | '仪式' | '异界' | '混成' {
  if (/机械|机关|人偶|炉|齿轮/.test(nature)) return '机械'
  if (/死|骨|葬|亡|灵/.test(nature)) return '死灵'
  if (/仪式|神|祷|祭|教/.test(nature)) return '仪式'
  if (/异界|次元|门|虚空|星/.test(nature)) return '异界'
  return '混成'
}

function fallbackRaws(nature: string): FallbackRaw[] {
  const fam = familyOf(nature)
  const bank: Record<typeof fam, { names: string[]; cls: string; trait: string; hue: string; fx: FxKind }> = {
    机械: {
      names: ['锈蚀巡察机', '断链装填手', '废料绞盘'],
      cls: '机械制成品',
      trait: '铁壳、铆钉与不合规的传动轴。打起来先压火力，再靠外壳硬吃。',
      hue: '#8f9cb8',
      fx: 'drone',
    },
    死灵: {
      names: ['无名葬列', '骨塔守夜人', '空白悼词'],
      cls: '死灵残余',
      trait: '没有呼吸的东西，靠数量与不肯散场撑着。近身之后越拖越沉。',
      hue: '#8f7f9c',
      fx: 'noise',
    },
    仪式: {
      names: ['空祷者', '残响祭司', '蜡封见证人'],
      cls: '仪式灾害',
      trait: '把这一场当成祭坛。它不急着打，先在地上摆出下一手的形状。',
      hue: '#c2a26a',
      fx: 'seal',
    },
    异界: {
      names: ['界隙游荡者', '折光观测体', '低语载体'],
      cls: '异界显形',
      trait: '轮廓不稳定的东西，靠近时先听见声音，再看见它。',
      hue: '#7f9fc2',
      fx: 'guitar',
    },
    混成: {
      names: ['未定形观测体', '灰潮聚合体', '现场残响'],
      cls: '未分类观测体',
      trait: '这一场自己长出来的东西，形状与出手都跟着现场走。',
      hue: '#9c9c9c',
      fx: 'blast',
    },
  }
  const b = bank[fam]
  const patterns: Array<{ bias: Partial<Record<AxisKey, number>>; hp: number; power: number }> = [
    { bias: { 破坏力: 1.12, 物理抗性: 0.92 }, hp: 1.05, power: 2.15 },
    { bias: { 敏捷度: 1.15, 意志力: 0.92 }, hp: 0.92, power: 1.85 },
    { bias: { 物理抗性: 1.12, 意志力: 1.08 }, hp: 1.12, power: 1.95 },
  ]
  return b.names.map((name, i) => ({
    name,
    sigil: name.slice(0, 1),
    cls: b.cls,
    trait: b.trait,
    why: '按这一段的性质、地点与危险度现场推定的对手。',
    hue: b.hue,
    hpBias: patterns[i]!.hp,
    bias: patterns[i]!.bias,
    skills: [
      { name: '近身一击', desc: '贴近了打，不给对面拉开的空当。', line: '看见你了。', axis: '破坏力', fx: b.fx, power: 1.2 },
      { name: '压上来的重手', desc: '把这一场的力气全压在一处。', line: '这一下躲不开。', axis: '破坏力', fx: b.fx, power: patterns[i]!.power },
      { name: '收拢防线', desc: '把露在外面的地方收回去，等下一拍。', line: '再等一拍。', axis: '物理抗性', fx: b.fx, power: 0 },
    ],
  }))
}

export function fallbackFoePool(mission: Mission, progress = 0.5): FoeTarget[] {
  const pack = packOf(mission, fallbackRaws(mission.nature), '作战系统现推', ['现场观测体', '现场观测体 乙', '现场观测体 丙'])
  return [0, 1, 2].map((i) => targetOf(mission, progress, pack, i, 'sys-' + mission.id + '-' + i))
}

/* ------------------------------------------------------------------
   模型那一趟
   ------------------------------------------------------------------ */
function promptOf(mission: Mission): string {
  return [
    '现场编号：' + mission.no,
    '地点：' + mission.place,
    '危险度：' + mission.stage + ' / 10',
    '敌体性质：' + mission.nature,
    '',
    '不要使用任务标题、档案、原文人物或原文事件的任何专名。',
    '',
    '输出 JSON 数组，恰好三项。每项字段：',
    'name 字符串，不超过 18 字；sigil 单字；cls 不超过 10 字；',
    'trait 字符串，不超过 64 字，写它是什么、怎么打，不写比喻；',
    'why 字符串，不超过 56 字，写它为什么在这一场；',
    'hue 十六进制颜色 #rrggbb；hpBias 数字 0.85~1.2；',
    'bias 对象，键只能取 破坏力 / 敏捷度 / 物理抗性 / 反现实亲和 / 意志力，值为 0.82~1.2，可省略；',
    'skills 数组，恰好三项，每项 { name 不超过 16 字, desc 不超过 70 字, line 不超过 40 字（这一手出手时它说的一句话）, axis 五轴之一, fx 只能取 slash / blast / guitar / seal / drone / noise, power 0.8~3.2 }；',
    '第 1 手是普攻，第 2 手是造成伤害的战技，第 3 手是防御或减益。',
    '三个对手之间要分得开：出手快慢、硬软、远近各偏一边。',
  ].join('\n')
}

function parseList(text: string): RawFoe[] | null {
  let s = text.trim()
  const fence = /^\u0060\u0060\u0060[A-Za-z]*\s*([\s\S]*?)\s*\u0060\u0060\u0060$/.exec(s)
  if (fence) s = fence[1]!.trim()
  const cut = (a: string, b: string) => {
    const i = s.indexOf(a)
    const j = s.lastIndexOf(b)
    return i >= 0 && j > i ? s.slice(i, j + 1) : ''
  }
  for (const candidate of [s, cut('[', ']'), cut('{', '}')]) {
    if (!candidate) continue
    try {
      const v = JSON.parse(candidate) as unknown
      if (Array.isArray(v)) return v as RawFoe[]
      if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>
        for (const key of ['foes', 'enemies', 'list', 'data']) {
          if (Array.isArray(rec[key])) return rec[key] as RawFoe[]
        }
      }
    } catch {
      // 下一档
    }
  }
  return null
}

/**
 * 问一次模型，造三名这一场的对手。失败时**不抛**：返回作战系统的后备池，
 * 调用方不需要再写一层 catch。
 */
export async function generateFoePool(
  mission: Mission,
  progress: number,
  cfg: ApiSettings | null,
): Promise<FoeTarget[]> {
  if (!cfg || !isReady(cfg)) return fallbackFoePool(mission, progress)
  const messages: ChatTurn[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: promptOf(mission) },
  ]
  try {
    const text = await chatCompletion(cfg, messages, {
      maxTokens: 1800,
      temperature: 0.9,
      // 进场要等这一趟，但不等到底：30 秒还没开口就退回后备阵容。
      firstPacketTimeoutMs: 30000,
      idleTimeoutMs: 30000,
      meta: { channel: '交战推演', act: '现场生成敌体' },
    })
    const raws = parseList(text)
    if (!raws || raws.length === 0) return fallbackFoePool(mission, progress)
    const pack = packOf(mission, raws, '模型现推', ['现场观测体', '现场观测体 乙', '现场观测体 丙'])
    return [0, 1, 2].map((i) => targetOf(mission, progress, pack, i, 'ai-' + mission.id + '-' + i))
  } catch {
    return fallbackFoePool(mission, progress)
  }
}
