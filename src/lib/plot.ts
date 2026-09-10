/* ============================================================
   剧情推进 —— 结构化事件指令
   ------------------------------------------------------------
   AI 回执的正文是第三人称叙述；其末尾可携带一个 JSON「事件指令」块，
   由前端自动落地（解锁角色 / 增减羁绊 / 登记图鉴 / 分歧标记 /
   事件完结 → 写「记录」并解锁下一段）。

   本模块只做纯函数与拼装，不碰 React / IndexedDB，便于单测与复用。
   canon 约束：buildDirectorSystem 只用事件「大纲」（summary / entities /
   chars / bond / place / day）拼装，绝不喂 SCENES 的开场白正文。
   唯一例外：用户显式录入的 EVENT_NOTES 原文摘录（见 data/eventnotes.ts），
   按事件逐字注入——那是项目「原文细节通道」，非自动喂正文。
   ============================================================ */

import type { CharId, FlagValue, TimelineEvent } from '../data/types'
import { CHARACTERS } from '../data/chars'
import { eventNotesOf } from '../data/eventnotes'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { genderOf, PERSON_IDS } from '../data/castmeta'
import { addressOf } from '../data/address'
import { furthestDone } from './operator'
import { bondName, clamp } from './format'
import { StreamTagParser } from './tavernlike/stream-parser'
import { aggregateEvents } from './tavernlike/variables'

/* ============================================================
   指令 schema
   ============================================================ */

export interface PlotDirective {
  /** 新遇见并解锁档案的角色（接受档案名录内全部 id：4 主役 + 21 登场者） */
  met?: string[]
  /** 羁绊偏移：只接受档案角色，delta 为有限数值 */
  bond?: { char: string; delta: number }[]
  /** 新遭遇并登记进终末图鉴的实体（接受图鉴 id 或「NO.x 名称」原文标注） */
  ends?: string[]
  /** 分支标记（布尔 / 有限数值 / 字符串） */
  flag?: Record<string, FlagValue>
  /** 该段收束是否为分歧路线（与原著相异时置 true） */
  diverged?: boolean
  /** 关键收束达成 → 完结当前事件并写记录（缺省 false） */
  eventDone?: boolean
  /** 收官的第三人称记录（缺省回退原著 summary，不虚构） */
  digest?: string
  /** 本段触发交战：按现场的角色与敌人开战（缺省 = 无战事） */
  battle?: PlotBattle
}

/** 剧情触发的交战规格 —— 由模型在事件指令里输出 */
export interface PlotBattle {
  /** 敌方名称（也是这场作战的标题） */
  name: string
  /** 性质标签，决定敌阵档案（异端 / 残渣 / 机械 / 低语 / 魔王 …） */
  nature?: string
  /** 危险度 1..10 */
  stage?: number
  place?: string
  /** 在场参战者（角色 id；缺省 = 已遇见的成员） */
  squad?: string[]
  /** true = 本段必然开打（收束正文之后立刻进入交战） */
  force?: boolean
}

/** 档案角色 id 白名单（角色档案全员 24 人，不含操作员） */
const CHAR_IDS = new Set<string>(PERSON_IDS)

const KNOWN_FIELDS = new Set([
  'met', 'bond', 'ends', 'flag', 'diverged', 'eventDone', 'digest', 'battle',
])

/** 把「图鉴 id 或原文实体标注」归一化为图鉴条目 id；无法识别返回 null */
export function resolveEndKey(key: string): string | null {
  const k = String(key ?? '').trim()
  if (!k) return null
  if (CODEX.some((e) => e.id === k)) return k
  return resolveEntityToCodexId(k)
}

function finiteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function sanitizeFlagValue(v: unknown): FlagValue | null {
  if (typeof v === 'boolean' || typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

/**
 * 白名单校验：去掉未知字段、坏标量；绝不 throw。
 * 返回的指令对象可能为空 {}（仍视为「解析成功、无变化」）。
 */
export function sanitizeDirective(v: unknown): PlotDirective {
  const out: PlotDirective = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  const src = v as Record<string, unknown>

  if (Array.isArray(src.met)) {
    const met = src.met
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => CHAR_IDS.has(x))
    if (met.length) out.met = [...new Set(met)]
  }

  if (Array.isArray(src.bond)) {
    const bond: { char: string; delta: number }[] = []
    for (const item of src.bond) {
      if (!item || typeof item !== 'object') continue
      const b = item as Record<string, unknown>
      const char = typeof b.char === 'string' ? b.char.trim() : ''
      if (!CHAR_IDS.has(char)) continue
      const delta = finiteNum(b.delta)
      if (delta === null) continue
      bond.push({ char, delta: clamp(Math.round(delta * 10) / 10, -100, 100) })
    }
    if (bond.length) out.bond = bond
  }

  if (Array.isArray(src.ends)) {
    const ends = src.ends
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean)
    if (ends.length) out.ends = [...new Set(ends)]
  }

  if (src.battle && typeof src.battle === 'object' && !Array.isArray(src.battle)) {
    const b = src.battle as Record<string, unknown>
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : ''
    if (name) {
      const out2: PlotBattle = { name }
      if (b.force === true) out2.force = true
      const nature = typeof b.nature === 'string' ? b.nature.trim().slice(0, 40) : ''
      if (nature) out2.nature = nature
      const place = typeof b.place === 'string' ? b.place.trim().slice(0, 40) : ''
      if (place) out2.place = place
      const st = finiteNum(b.stage)
      if (st !== null) out2.stage = clamp(Math.round(st), 1, 10)
      if (Array.isArray(b.squad)) {
        const sq = b.squad
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => CHAR_IDS.has(x))
        if (sq.length) out2.squad = [...new Set(sq)]
      }
      out.battle = out2
    }
  }

  if (src.flag && typeof src.flag === 'object' && !Array.isArray(src.flag)) {
    const flag: Record<string, FlagValue> = {}
    for (const [k, raw] of Object.entries(src.flag as Record<string, unknown>)) {
      const key = k.trim()
      if (!key) continue
      const sv = sanitizeFlagValue(raw)
      if (sv !== null) flag[key] = sv
    }
    if (Object.keys(flag).length) out.flag = flag
  }

  if (src.diverged === true) out.diverged = true
  if (src.eventDone === true) out.eventDone = true

  const digest = typeof src.digest === 'string' ? src.digest.trim() : ''
  if (digest) out.digest = digest.slice(0, 600)

  // 只保留被认识且非空的字段
  for (const k of Object.keys(out)) {
    if (!KNOWN_FIELDS.has(k)) delete (out as Record<string, unknown>)[k]
  }
  return out
}

/* ============================================================
   回执解析
   ============================================================ */

export interface PlotReply {
  /** 上屏正文（已剥掉指令块与标签行） */
  narrative: string
  /** 解析并白名单校验后的指令对象；找不到 JSON 时为 null */
  directive: PlotDirective | null
  /** 是否真的从回执里定位到了可解析的指令块 */
  found: boolean
}

/** 标签行：……事件指令…… 或 指令 / directives 等（可带 —— 装饰） */
const LABEL_RE = /^\s*(——+\s*)?(?:事件指令|指令|directives?)\s*(?:——+)?\s*$/i

function firstBalancedJsonCandidate(text: string): string | null {
  // 从最后一个 '{' 往前试探平衡括号，最多试探 6 个起点
  const starts: number[] = []
  for (let i = text.length - 1; i >= 0 && starts.length < 6; i--) {
    if (text[i] === '{') starts.push(i)
  }
  for (const start of starts) {
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (esc) { esc = false; continue }
      if (ch === '\\' && inStr) { esc = true; continue }
      if (ch === '"') inStr = !inStr
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
  }
  return null
}

/**
 * 容错解析：优先取「最后一个 ```json 围栏块」；其次退化扫描平衡 {…}。
 * 永不 throw。directive 恒为净化后的对象（可能为空 {}）；找不到返回 null。
 */
export function parsePlotReply(raw: string): PlotReply {
  const text = typeof raw === 'string' ? raw : ''
  if (!text.trim()) return { narrative: '', directive: null, found: false }

  let segment: string | null = null
  let segStart = -1
  let segEnd = -1

  // 1) 围栏块（含语言标注 json / JSON）
  const fenceRe = /```[ \t]*([a-zA-Z]*)[ \t]*\r?\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  let lastFence: { start: number; end: number; content: string } | null = null
  while ((m = fenceRe.exec(text)) !== null) {
    const content = m[2]
    const lang = (m[1] ?? '').toLowerCase()
    if (lang === 'json' || lang === '' || /json/i.test(content.slice(0, 60))) {
      lastFence = { start: m.index, end: fenceRe.lastIndex, content }
    }
  }
  if (lastFence) {
    segment = lastFence.content
    segStart = lastFence.start
    segEnd = lastFence.end
  } else {
    // 2) 平衡括号退化
    segment = firstBalancedJsonCandidate(text)
    if (segment !== null) {
      segStart = text.indexOf(segment)
      segEnd = segStart + segment.length
    }
  }

  let directive: PlotDirective | null = null
  let found = false
  if (segment !== null) {
    try {
      const parsed: unknown = JSON.parse(segment)
      directive = sanitizeDirective(parsed)
      found = true
    } catch {
      directive = null
    }
  }

  // 正文：剥掉指令区间与紧邻的标签行
  let narrative = text
  if (segStart >= 0) {
    const before = text.slice(0, segStart)
    const after = text.slice(segEnd)
    narrative = before.replace(/\s*$/, '') + '\n' + after.replace(/^\s*/, '')
    const lines = narrative.split('\n')
    // 去掉恰好承接在指令块之前的标签行（如 —— 事件指令 ——）
    for (let i = lines.length - 1; i >= 0; i--) {
      if (LABEL_RE.test(lines[i])) { lines.splice(i, 1); break }
      if (lines[i].trim() === '') continue
      break
    }
    narrative = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  return { narrative: narrative.trim(), directive, found }
}

/* ============================================================
   标签化回执（双格式协议，见 buildDirectorSystem 末尾）
   ------------------------------------------------------------
   JSON 围栏仍是默认；当回执里确有 <maintext>/<option>/<vars> 时才走
   标签路径。标签路径的指令字段与 JSON 完全同 schema，仍经
   sanitizeDirective 白名单净化后，与 JSON 路径汇合到 applyDirective
   同一条落地管线。混合输出（标签正文 + 尾随 JSON 指令）也能落地。
   ============================================================ */

export interface DirectorReply extends PlotReply {
  /** 标签化回执的正文（<maintext>；无则用剥净后的正文） */
  options: string[]
  /** <thinking>/<think> 推演（不展示给操作员也不参与正文） */
  thinking: string
  /** <vars> 原文（可为 ''） */
  varsRaw: string
  /** 本回合是否带有可落地的 <vars> 指令 */
  hasVars: boolean
  /** 回执来源：tags=标签化 · json=JSON 围栏 · none=无指令 */
  source: 'tags' | 'json' | 'none'
}

const TAG_BLOCK_RE = /<\s*(?:maintext|option|vars|thinking|think)\b[\s\S]*?<\s*\/\s*(?:maintext|option|vars|thinking|think)\s*>/gi

/** 剥离已知标签块（用于标签缺席 <maintext> 时的正文兜底） */
function stripBlockTags(s: string): string {
  return s.replace(TAG_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 容错双格式解析：先按原 JSON 路径兜底；检测到标签则叠加标签解析。
 * 永不 throw。directive/found 语义与 parsePlotReply 一致，供 needDir 复用。
 */
export function parseDirectorReply(raw: string): DirectorReply {
  const text = typeof raw === 'string' ? raw : ''
  const json = parsePlotReply(text)
  const base: DirectorReply = {
    ...json,
    options: [],
    thinking: '',
    varsRaw: '',
    hasVars: false,
    source: json.found ? 'json' : 'none',
  }
  if (!/<(maintext|option|vars|thinking|think)\b[\s>]/i.test(text)) {
    return base
  }

  const parser = new StreamTagParser(['maintext', 'option', 'vars'], ['thinking', 'think'])
  const events = [...parser.feed(text), ...parser.finish()]
  const parsed = aggregateEvents(events)

  const maintext = parsed.maintext.trim()
  const thinking = parsed.thinking.trim()
  const options = parsed.options.map((o) => o.trim()).filter(Boolean)
  const varsRaw = parsed.varsRaw.trim()
  const hasVars = varsRaw.length > 0

  let directive: PlotDirective | null
  let found: boolean
  if (hasVars) {
    directive = sanitizeDirective(parsed.varsCommands.merge)
    found = true
  } else {
    directive = json.directive
    found = json.found
  }

  const narrative = maintext || stripBlockTags(json.narrative) || json.narrative

  const usedTags = Boolean(maintext || hasVars || options.length || thinking)
  return {
    narrative: narrative.trim(),
    directive,
    found,
    options,
    thinking,
    varsRaw,
    hasVars,
    source: usedTags ? 'tags' : base.source,
  }
}

/* ============================================================
   流式「活气泡」投影
   ------------------------------------------------------------
   导演回执在生成途中是未闭合的原文：<vars>/<thinking> 等结构块
   只写到一半、JSON 围栏只开了头。extractLiveDisplay 只做「显示」
   用的无副作用投影——把已生成部分剥成可看的正文，绝不参与落地
   （落地永远只跑一次 parseDirectorReply(full) 权威收口）。
   - 完整或半截的隐藏块（thinking/think/vars/option）整块剔除；
   - 完整或悬空的 JSON 围栏剔除；文末孤立的「事件指令」标签行剔除；
   - <maintext> 区只剥开合标记、区内内容（含进行中）保留；
   - 其余裸文原样保留。
   ============================================================ */

export function extractLiveDisplay(raw: string): string {
  let s = typeof raw === 'string' ? raw : ''
  if (!s) return ''

  // 1) JSON 围栏：完整 ```…``` 或从第一个 ``` 到文末的悬空围栏，整体摘除
  s = s.replace(/```[\s\S]*?(?:```|$)/g, '')

  // 2) 完整闭合的隐藏标签块整块剔除
  s = s.replace(/<\s*(?:thinking|think|vars|option)\b[^>]*>[\s\S]*?<\s*\/\s*(?:thinking|think|vars|option)\s*>/gi, '')

  // 3) 悬空半截的隐藏块（有开头没结尾）→ 自开头剔到文末
  s = s.replace(/<\s*(?:thinking|think|vars|option)\b[\s\S]*$/gi, '')

  // 4) <maintext> 只剥开合标记，区内正文保留（含未闭合的进行中内容）
  s = s.replace(/<\s*\/?\s*maintext\b[^>]*>/gi, '')

  // 5) 剥掉围栏/标签后仍露出的文末「—— 事件指令 ——」等孤立行
  const lines = s.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (LABEL_RE.test(t)) { lines.pop(); continue }
    if (t === '') { lines.pop(); continue }
    break
  }
  s = lines.join('\n')

  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/* ============================================================
   指令落地（由视图把 Terminal 的写操作注入进来）
   ============================================================ */

export interface DirectiveApi {
  meetChar: (charId: string) => void
  bumpBond: (charId: string, delta: number) => void
  registerEnd: (id: string) => void
  setFlag: (k: string, v: FlagValue) => void
}

export interface DirectiveEffects {
  met: string[]
  bonds: { char: string; delta: number }[]
  ends: { key: string; id: string }[]
  flags: [string, FlagValue][]
  diverged: boolean
  eventDone: boolean
  digest?: string
}

/** 把净化后的指令落地到世界状态；返回实际产生的影响（供视图 toast/结算） */
export function applyDirective(d: PlotDirective, api: DirectiveApi): DirectiveEffects {
  const fx: DirectiveEffects = { met: [], bonds: [], ends: [], flags: [], diverged: false, eventDone: false }

  for (const id of d.met ?? []) {
    api.meetChar(id)
    fx.met.push(id)
  }
  for (const b of d.bond ?? []) {
    const delta = clamp(Math.round(b.delta), -100, 100)
    api.bumpBond(b.char, delta)
    fx.bonds.push({ char: b.char, delta })
  }
  for (const key of d.ends ?? []) {
    const id = resolveEndKey(key)
    if (id) {
      api.registerEnd(id)
      fx.ends.push({ key, id })
    }
  }
  for (const [k, v] of Object.entries(d.flag ?? {})) {
    api.setFlag(k, v)
    fx.flags.push([k, v])
  }
  fx.diverged = d.diverged === true
  fx.eventDone = d.eventDone === true
  if (d.digest) fx.digest = d.digest

  return fx
}

/** 指令里是否存在会造成世界变化的内容（决定可否提供「重写此回复」） */
export function directiveHasFx(d: PlotDirective | null): boolean {
  if (!d) return false
  return Boolean(
    (d.met && d.met.length) ||
      (d.bond && d.bond.length) ||
      (d.ends && d.ends.length) ||
      (d.flag && Object.keys(d.flag).length) ||
      d.diverged === true ||
      d.eventDone === true ||
      Boolean(d.battle?.name),
  )
}

/**
 * 短信专用过滤：只放行「当前角色」的小幅羁绊（±3）与分支标记；
 * 不放行 met / ends / eventDone。无可放行内容返回空指令 {}。
 */
export function smsDirective(d: PlotDirective | null, charId: string): PlotDirective {
  if (!d) return {}
  const out: PlotDirective = {}
  if (d.bond) {
    const bond = d.bond
      .filter((b) => b.char === charId)
      .map((b) => ({ char: b.char, delta: clamp(Math.round(b.delta), -3, 3) }))
    if (bond.length) out.bond = bond
  }
  if (d.flag && Object.keys(d.flag).length) out.flag = d.flag
  return out
}

/* ============================================================
   导演系统提示词（只用大纲，不喂开场白正文）
   ============================================================ */

export interface DirectorCtx {
  /** 操作员显示名（剧情本体固定为 言万心叶） */
  operatorName: string
  /** 当前各角色羁绊取值（用于在提示词里注明关系阶段）；缺省取事件基准 */
  bondNow?: (charId: string) => number
  /** 已收束事件表：用来判断剧情读到哪一段，从而决定该角色此刻怎么称呼主角 */
  epDone?: Record<string, true>
  /** 已存在的分支标记（可选，供模型感知已偏离的状态） */
  flags?: Record<string, FlagValue> | null
  /** 是否处于「重试补发指令」：要求本回合必须带指令块 */
  needDirective?: boolean
  /** 世界书命中参考段（由 lorescan 生成；置顶在指令说明之前，仅作延续性背景） */
  loreContext?: string
  /** 后接事件锚（软门禁）：在线整回合推演时给出；让导演判断收束能否自然引向后接事件，才允许 eventDone */
  nextEvent?: TimelineEvent | null
  /** 预设指令（管「如何理解」）：紧贴导演规则之后注入 */
  presetPre?: string
  /** 预设指令（管「如何输出」）：紧贴事件指令 schema 之前注入 */
  presetPost?: string
  /** 近期作战记录摘要（取自隐藏存档；用来承接已打过的任务，防前后文不搭） */
  battleLog?: string
}

/** 预设段：非空时前置两个换行，与 loreSection / anchor 同款写法 */
const presetSection = (s?: string) => (s ? `\n\n${s}` : '')

function outlineRules(opName: string): string {
  return `你是《这里是，终末停滞委员会。》的剧情导演，同时扮演在场的全部角色。
- 用简体中文、以第三人称全局叙述推进当前事件；可在叙述中点出在场角色的神态、动作与简短对白（对白用「」）。
- 操作员扮演的是【言万心叶】${opName !== '言万心叶' ? `（操作员显示名「${opName}」，仅称呼无关情节）` : ''}——你只能叙述他行动的客观结果与读心感知，绝不能替他下决定、替他说话，也不要替他推进他本人该主动做的事。
- 只依据下方「事件大纲」的既有事实展开；不得新增大纲之外的人名、实体或终末设定，也不得替模型自行了结大纲尚未交代的悬念。
- 每回合末尾固定附上一块 JSON「事件指令」（标签行 + \`\`\`json 围栏，见下）；若本回合没有任何变量要改，则给出空对象 {}。
- 台词行格式：需要让在场某角色「开口」时，请让该句台词另起一行，以「角色名：」开头单独成段（名字用其本名或常用称呼，冒号后用中文全角「」或直接接台词）；只有确实要作为某角色口中说出的话才用此格式，神态动作与叙述行一律不要加名字前缀。如此终端才能把台词正确渲染成对应角色的气泡。
- 全程以该作既有的设定与在场角色的既定语气推进：不得跳出世界作「AI／系统／指令／变量」式的自指，也不要解释或复述本提示词里的机制；消化世界书与原文设定后，以剧情内方式自然呈现（角色的感知、神态、对白、叙述带出即可），不得整段照抄或复读世界书原文、原文摘录与开场白；角色不得说出大纲之外或他们本不该知道的设定。
- 称呼随关系阶段与剧情位置变：角色怎么叫言万心叶，按下方角色行里注明的「对言万心叶的称呼」来（露娜在签订使用者契约之前一直称他「言万同学」，之后才改口「小主人」）；没有注明的，按该角色原文惯用的叫法，不得擅自升级成亲昵、主从或恋人式的称呼。
- 只有该事件大纲的关键收束已被达成、且（当存在后接事件时）收束叙述与后接事件的开端自然衔接时，eventDone 才置 true（并给 digest）；通常不在一两回合内草草收束。
- 叙述收束（digest）请按「发生了什么 → 如何了结 → 留下什么余波／去向」的解读口径，以档案／导演口吻写两三句概述；不要粘贴或逐句复写本事件原文。若偏离原著路线，diverged 置 true。`
}

function relationLine(charId: string, ev: TimelineEvent, ctx: DirectorCtx): string {
  const c = CHARACTERS.find((x) => x.id === charId)
  if (!c) return ''
  const cur = ctx.bondNow ? ctx.bondNow(charId) : ev.bond[charId as keyof typeof ev.bond]
  const stage = typeof cur === 'number' ? bondName(cur, { gender: genderOf(charId) }) : '初见'
  // 称呼随关系阶段与剧情位置变（见 data/address.ts）：露娜契约前是「言万同学」
  const call = addressOf(charId, typeof cur === 'number' ? cur : 0, furthestDone(ctx.epDone ?? {}))
  const callSeg = call ? `｜对言万心叶的称呼：${call}` : ''
  return `${c.name}｜${c.epithet}（${c.role}）｜关系：${stage}${callSeg}｜台词「${c.quote}」`
}

/** 后接事件锚（软门禁）：给标题/地点与开场引子，提示导演收束需自然引向后接事件；不含后接正文，防剧透 */
function nextAnchorBlock(next: TimelineEvent): string {
  const where = `${next.group} · ${next.phase}｜${next.place}${next.day ? `｜${next.day}` : ''}`
  const raw = (next.summary || '').trim().replace(/\s+/g, ' ')
  const prem = raw.slice(0, 200)
  const ellipsis = raw.length > 200 ? '…' : ''
  return `【收束衔接 · 后接事件（软门禁）】
本事件按阅读序之后将进入：《${next.title}》（${where}）
开场引子：${prem || '（无）'}${ellipsis}
软门禁：仅当本事件大纲的关键收束已达成、且你能把当下局面自然引向这后接事件的入口时，才把 eventDone 置 true 并给 digest；收束叙述应呈现顺承／悬念／转场，暗示「下一幕将至」，不要生硬宣告完结，也不要抢跑叙述后接事件的正文。若还接不上，就不要置 eventDone，继续推进本事件。`
}

/** 当前事件的原文摘录段（EVENT_NOTES 通道；逐字、不经关键词扫描，每回合必达） */
function notesSectionFor(ev: TimelineEvent): string {
  const notes = eventNotesOf(ev.id)
  if (!notes.length) return ''
  return `\n\n【本事件补充设定 · 原文摘录】\n${notes.map((n) => `· ${n}`).join('\n')}`
}

/** 拼装导演系统提示词（单事件） */
export function buildDirectorSystem(ev: TimelineEvent, ctx: DirectorCtx): string {
  const present = ev.chars.length ? ev.chars : (CHARACTERS.map((c) => c.id) as CharId[])
  const roster = present
    .map((id) => relationLine(id, ev, ctx))
    .filter(Boolean)
    .join('\n')

  const entList = ev.entities.filter((e) => e !== '——').join('、') || '（本事件暂无新实体）'
  const baseline = Object.entries(ev.bond)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n')

  // 用户变量登记：把「主角行为改变了什么」稳定地写回同名变量（world.flags = 变量面板 A 区）
  const varEntries = ctx.flags ? Object.entries(ctx.flags) : []
  const varList = varEntries.length
    ? varEntries.map(([k, v]) => `  ${k} = ${typeof v === 'string' ? `「${v}」` : String(v)}`).join('\n')
    : '  （暂无登记）'
  const varBlock = `

【用户变量 · 依主角行为自动更新】
当前登记表（每次写回后会持久化，并在下一回合前回显现值）：
${varList}

更新规则：本回合言万心叶的行动若改变了某登记键所指的状态，就把该键连同新值写进下方事件指令的 flag（未变化的键不要写）；先前登记过的键要更新其值、不要另建同名键；若行动带来值得长期记录的新状态（约定／承诺／隐瞒／共同秘密／称号／处境档位等）可新建键，键名用英文小写加下划线、无空格、≤48 字符；不要为了写而写。`

  const reask = ctx.needDirective
    ? '\n- 注意：上一回合你没有给出可解析的事件指令块。本回合请务必补发一个事件指令块。'
    : ''

  const loreSection = ctx.loreContext
    ? `\n\n${ctx.loreContext}`
    : ''

  const notesSection = notesSectionFor(ev)
  const anchor = ctx.nextEvent ? `\n\n${nextAnchorBlock(ctx.nextEvent)}` : ''
  // 近期作战：与 loreContext 同格（都是「已发生的事实」，只作延续性背景）
  const opsSection = ctx.battleLog ? `\n\n${ctx.battleLog}` : ''

  return `${outlineRules(ctx.operatorName || '言万心叶')}${presetSection(ctx.presetPre)}

【当前事件】${ev.group} · ${ev.phase}｜${ev.place}${ev.day ? `｜${ev.day}` : ''}
标题：${ev.title}

【事件大纲 · 唯一事实来源】
${ev.summary}${notesSection}

【本事件相关实体】
${entList}

【本事件出场角色】${
    roster ? `\n${roster}` : '\n（暂无已建立关系的角色在场）'
  }

【羁绊基准（数值仅参考，勿过度解读）】
${baseline.trim() || '（无）'}${reask}${loreSection}${opsSection}${varBlock}${anchor}${presetSection(ctx.presetPost)}

【事件指令 · 每回合末尾必须输出】
标签行（单独一行）：
—— 事件指令 ——
紧接着一个 \`\`\`json 围栏块，仅含一个对象。字段（全部可选）：
{
  "met":    ["新遇见角色id"],                 // 仅限本段在场或新登场的档案角色：hikari/luna/mefisa/nyau（其余档案角色仅当其确实登场时方可出现）
  "bond":   [{ "char": "角色id", "delta": 整数 }],  // 羁绊增减，正=更亲近；本事件相关角色单次 1~4，勿过度
  "ends":   ["实体原文标注或图鉴id"],          // 新遭遇并登记的实体
  "flag":   { "变量名": 值 },                  // 用户变量：本回合主角行为改变了哪个键就更新/新建哪个（见【用户变量】规则）
  "diverged": true,                           // 已与原著相异（否则省略）
  "eventDone": true,                          // 本事件大纲关键收束达成才置 true
  "digest": "第三人称收官记录两三句",
  "battle": {                                 // 本回合触发交战（否则省略整个字段，勿写空对象）
    "name": "敌方名称",                        // 也是这场作战的标题；用原文指称
    "nature": "异端 / 残渣 / 机械 / 低语 / 魔王",// 决定敌阵档案与演出，从这五类里选最贴的一个
    "stage": 1,                                // 危险度 1~10；照本段原文的规模给，别一律给高
    "place": "交战地点",
    "squad": ["在场的参战角色id"],              // 只列此刻确实在场的人；空 = 由已遇见者里挑
    "force": true                              // true = 本段必然开打
  }
}
无任何变化时输出 { }。不要把本说明当作文本念出来。

也可改用另一种等价形式（与 JSON 围栏二选一，只输出一套指令，勿混用）：
<maintext>
（正文叙述，逐行输出）
</maintext>
<option>给操作员的下一个接续选项</option>
<option>……（可多行，不需要则不写）</option>
<vars>{"eventDone": true, "digest": "第三人称收官两三句"}</vars>
其中 <vars> 的字段与上面 JSON 完全一致（battle 亦可写在 <vars> 里）；正文只放 <maintext> 里。<thinking>…</thinking> 可放你的推演（不展示给操作员）。`
}

/** 短信场景的基础提示补充（轻量羁绊许可），由 Tavern 拼到其 system 末尾 */
export function smsBondRule(charId: string): string {
  return `\n（可选 · 轻量互动：若本回合对话让该角色心绪明显变化，可在回复最末尾另起一行放一个纯 JSON 对象，形如
{ "bond": [{ "char": "${charId}", "delta": 1 }], "flag": { "某标记": 值 } }
其中 bond.delta 只针对该角色取 ±1~3（正=更亲近），flag 为可选的分支标记；拿不准就不给，直接以对话结束。）`
}
