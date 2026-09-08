/* ============================================================
   全角色聚合索引（castmeta）
   — 供「羁绊全 25 人 / 性别化称谓 / 头像与立绘 / 台词识别 /
     关键词跳转」共同消费的稳定表；不替代 chars / sidecast / roster，
     它们仍是唯一内容源，这里只做聚合与查表。
   — 21 名登场者的性别按各卷卷首「登场人物」彩页 / 正文逐字措辞考据
     （她／他／少女／千金／姐姐／少年…）；确实无法判定的标 '?'，
     UI 依 '?' 走无性别文案。
   — 羁绊「起步值」为终端近似（非正文原文）：初见≈20、随性格小幅浮动；
     升高由主角行为驱动（剧情推演抉择 / 导演好感回执 / 短信往来 → offset）。
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
  /** 羁绊「起步值」＝初见≈20±性格（core 取自 chars.defaultBond；side 见 SIDE_BOND） */
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

/* 21 名登场者的羁绊「起步值」—— 皆按初见（陌生≈20、因性格小有浮动）标定。
   此值只在主角尚未与之深交时作为基线；升高一律由「主角行为」驱动：
   在线推演中的抉择/导演好感回执、短信往来等 → 写入 world.offset 累积，
   绝不因单纯读过剧情段就自动抬升。（core 主役另由已读段的原著快照随剧情推进。） */
const SIDE_BOND: Record<string, number> = {
  'rafael-garcia': 26,   // 旧识重逢 · 仍受命诀别，愧疚又无力
  youshihan: 26,         // 慵懒照应你的万年留级学姐
  katherine: 22,         // 规行矩步的警备队长 · 初交锋是公事对手
  phidra: 16,            // 来历不明 · 一开口就让人警觉
  'alex-cave': 18,       // 一较高下的竞争心
  maria: 20,
  'merwen-gray': 16,     // 嘴不饶人的武斗派文学少女
  'alive-anatolia': 20,  // 居高临下、让你「做狗」的会长 · 态度难测
  'vern-simon': 18,      // 实用主义、说话不绕弯的副会长
  'kuro-no-maou': 24,    // 同船相识的漆黑少女 · 初见就口出「结婚」
  'nana-kamiru': 24,     // 卡乌斯黑锤部队中难得温和的一人
  reiya: 26,             // 名门千金 · 重逢即雀跃的旧识
  emei: 24,              // 姐姐式照拂 · 评议会副议长
  'isis-halid': 16,      // 盯上独家新闻、寸步不让的记者
  'skull-mask': 12,      // 敌意而来的「另一个你」
  'xiaochai-lin': 22,    // 喵呜的天才妹妹 · 初见就机灵
  'touyi-caojiro': 24,   // 自来熟、爱开玩笑的共战友人
  'huda-nayume': 14,     // 对外毫不留情、纪律严明的领队
  'yuina-yoshito': 18,   // 野性派少年 · 试探着接近
  ameria: 20,            // 自另一时代注视着的亡者会长
  yiregel: 14,           // 冷面心腹 · 公事公办
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

/** 羁绊「起步值」：初见≈20±性格。core → chars.defaultBond；side → SIDE_BOND；未知 → 0 */
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
