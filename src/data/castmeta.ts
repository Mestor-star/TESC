/* ============================================================
   全角色聚合索引（castmeta）
   — 供「羁绊全 25 人 / 性别化称谓 / 头像与立绘 / 台词识别 /
     关键词跳转」共同消费的稳定表；不替代 chars / sidecast / roster，
     它们仍是唯一内容源，这里只做聚合与查表。
   — 21 名登场者的性别按各卷卷首「登场人物」彩页 / 正文逐字措辞考据
     （她／他／少女／千金／姐姐／少年…）；确实无法判定的标 '?'，
     UI 依 '?' 走无性别文案。羁绊基线为终端近似值（非正文原文）。
   ============================================================ */

import { CHARACTERS } from './chars'
import { SIDECAST } from './sidecast'
import { ROSTER_GROUPS } from './roster'

export type PersonKind = 'core' | 'side' | 'operator'
export type Gender = 'f' | 'm' | '?'

export interface CastPerson {
  id: string
  kind: PersonKind
  /** 档案全名（正文人物页用名） */
  name: string
  /** 全名 + 常用别名/昵称（台词识别与关键词跳转；长词优先匹配） */
  names: string[]
  gender: Gender
  /** 羁绊基线（core 取自 chars.defaultBond；side 为终端近似） */
  defaultBond: number
  /** 主题色（core 取 chars.hue；side 按登场顺序取用调色板，与档案页一致） */
  hue: string
  /** 文字纹章（1 字符） */
  sigil: string
  /** 头像/立绘素材 id：public/charimg/<id>.png；操作员恒为 'operator' */
  avatarId: string
}

/** 操作员（言万心叶）固定 id */
export const OPERATOR_ID = 'operator'

/* 性别考据（键 = 角色 id）。依据各卷卷首人物页/正文措辞；未知 → '?' */
const GENDER: Record<string, Gender> = {
  // 四位主役均为女性（原文少女/姐姐/幼犬系少女；操作员视角 → 女性高羁绊走爱慕）
  hikari: 'f',
  luna: 'f',
  mefisa: 'f',
  nyau: 'f',
  // 苍之学园
  'rafael-garcia': 'm',   // 肌肉发达的高大男人
  youshihan: 'f',         // 原文「关于她…」＋「学姐」
  'alive-anatolia': 'f',  // 会长（担保人；原文为女性口吻）
  'vern-simon': 'm',      // 「他则是信息处理的极致」
  'xiaochai-lin': 'f',    // 喵呜的双胞胎妹妹
  // 卡乌斯学院
  'nana-kamiru': 'f',
  reiya: 'f',             // 名门千金
  emei: 'f',              // 蕾雅的姐姐
  'isis-halid': 'f',
  // Corporations
  katherine: 'f',
  'alex-cave': 'm',       // 「他的片羽」
  phidra: 'm',            // 「认识他的人…他的利刃」
  maria: 'f',
  'merwen-gray': 'f',     // 文学少女
  ameria: 'f',
  // 学园外 · 其它
  'kuro-no-maou': 'f',    // 与心叶同船的少女；企盼结婚
  'skull-mask': 'm',      // 另一个次元的言万心叶
  yiregel: '?',
  'touyi-caojiro': 'm',   // 少年
  'huda-nayume': 'f',     // 深不可测的少女
  'yuina-yoshito': 'm',   // 野性派少年
}

/* 21 名登场者的羁绊基线（终端近似；core 主役直接读 chars.defaultBond） */
const SIDE_BOND: Record<string, number> = {
  'rafael-garcia': 70,   // 叔父辈旧识，心存歉意
  youshihan: 46,         // 万年留级的前辈，慵懒但照应你
  katherine: 66,         // 并肩过的企业警备队长，惺惺相惜
  phidra: 42,
  'alex-cave': 36,
  maria: 30,
  'merwen-gray': 40,     // 针锋相对的武斗派文学少女
  'alive-anatolia': 54,  // 让你做「狗」的会长，态度复杂
  'vern-simon': 50,      // 实用主义副会长
  'kuro-no-maou': 70,    // 期盼与你结婚的 Stage5 少女
  'nana-kamiru': 58,     // 卡乌斯黑锤部队中难得柔和的人
  reiya: 78,             // 名门千金「挚友」，见面就扑通扑通
  emei: 54,              // 姐姐式照拂，评议会副议长
  'isis-halid': 24,      // 盯上你的独家新闻的记者
  'skull-mask': 18,      // 敌意的异次元「另一个你」
  'xiaochai-lin': 40,    // 喵呜的天才妹妹
  'touyi-caojiro': 64,   // 爱开玩笑的共战友人
  'huda-nayume': 26,     // 对外毫不留情的领队
  'yuina-yoshito': 30,
  ameria: 56,            // 注视着的亡者会长
  yiregel: 20,           // 艾美莉亚的心腹
}

/** 登场者登记主题色（按 SIDECAST 登场顺序取用；与档案页一致） */
const SIDE_PALETTE = [
  '#8fd8ff', '#ffb454', '#54d2a0', '#ff7a9b', '#c9b2ff',
  '#f0a35e', '#5fe6c8', '#ff5d73', '#9fd0ff', '#e2d27c',
  '#b48cff', '#6fe0e0', '#ff9a8a', '#a7e06f',
]

const CORE = new Map<string, (typeof CHARACTERS)[number]>()
for (const c of CHARACTERS) CORE.set(c.id, c)
const SIDE = new Map<string, (typeof SIDECAST)[number]>()
for (const e of SIDECAST) SIDE.set(e.id, e)
/** 登场顺序下标（取登记主题色用） */
const SIDE_INDEX = new Map<string, number>()
SIDECAST.forEach((e, i) => SIDE_INDEX.set(e.id, i))

/** 组装：core 与 side 都按 ROSTER_GROUPS 的成员顺序排列（即档案页顺序） */
function buildCast(): CastPerson[] {
  const out: CastPerson[] = []
  for (const g of ROSTER_GROUPS) {
    for (const id of g.ids) {
      const c = CORE.get(id)
      if (c) {
        out.push({
          id: c.id, kind: 'core', name: c.name,
          names: unique(coreNames(c.id)),
          gender: GENDER[c.id] ?? '?', defaultBond: c.defaultBond,
          hue: c.hue, sigil: c.sigil, avatarId: c.id,
        })
        continue
      }
      const e = SIDE.get(id)
      if (e) {
        const i = SIDE_INDEX.get(id) ?? 0
        const hue = SIDE_PALETTE[i % SIDE_PALETTE.length]
        out.push({
          id: e.id, kind: 'side', name: e.name,
          names: unique([e.name, e.alias].filter((x) => x && x !== e.name)),
          gender: GENDER[e.id] ?? '?', defaultBond: SIDE_BOND[e.id] ?? 40,
          hue, sigil: e.name.slice(0, 1), avatarId: e.id,
        })
      }
    }
  }
  return out
}

function unique(a: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of a) {
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** 四位主役的规范称呼（正文常用全名 + 昵称；不做截断/职位词，避免误归属） */
function coreNames(id: string): string[] {
  switch (id) {
    case 'hikari': return ['恋兔光', '恋兔']
    case 'luna': return ['露娜']
    case 'mefisa': return ['梅芙莉莎', '梅芙']
    case 'nyau': return ['小柴喵呜', '喵呜', '小柴']
    default: return []
  }
}

/** 全员（25 人，按档案页分组顺序；不含操作员） */
export const CAST: CastPerson[] = buildCast()

/** 25 位档案角色 id（供羁绊/图鉴白名单遍历） */
export const PERSON_IDS: string[] = CAST.map((p) => p.id)

/** 操作员条目 */
export const OPERATOR_PERSON: CastPerson = {
  id: OPERATOR_ID, kind: 'operator', name: '言万心叶',
  names: ['言万心叶', '心叶'],
  gender: 'm', defaultBond: 0,
  hue: '#58c6ff', sigil: '心', avatarId: OPERATOR_ID,
}

/** 查角色（含操作员） */
export function personOf(id: string): CastPerson | undefined {
  if (id === OPERATOR_ID) return OPERATOR_PERSON
  return CAST.find((p) => p.id === id)
}

/** 羁绊基线（core → chars.defaultBond；side → 近似基线；未知 → 0） */
export function defaultBondOf(id: string): number {
  if (id === OPERATOR_ID) return 0
  const c = CORE.get(id)
  if (c) return c.defaultBond
  return SIDE_BOND[id] ?? 0
}

/** 目标性别（档案角色/操作员；未知 → '?'） */
export function genderOf(id: string): Gender {
  if (id === OPERATOR_ID) return 'm'
  return GENDER[id] ?? '?'
}

/** 头像素材 id（操作员恒 'operator'；档案角色 = 自身 id） */
export function avatarIdOf(id: string): string {
  return id === OPERATOR_ID ? OPERATOR_ID : id
}

export interface SpeakerVariant {
  /** 匹配用显示名/别名 */
  text: string
  /** 该名属于哪个角色（'operator' = 言万心叶） */
  id: string
}

/**
 * 台词识别/关键词跳转用变体表：全名+别名，长词优先。
 * 含操作员（言万心叶 / 心叶），供「第一人称 → you 气泡」识别。
 */
export function speakerVariants(): SpeakerVariant[] {
  const list: SpeakerVariant[] = []
  const seen = new Set<string>()
  const push = (id: string, names: string[]) => {
    for (const n of names) {
      if (!n || seen.has(n)) continue
      seen.add(n)
      list.push({ text: n, id })
    }
  }
  for (const p of CAST) push(p.id, p.names)
  push(OPERATOR_ID, OPERATOR_PERSON.names)
  return list.sort((a, b) => b.text.length - a.text.length)
}
