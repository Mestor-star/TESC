/* ============================================================
   预设 · 导演指令
   ------------------------------------------------------------
   角色卡是演员的剧本，预设是导演的拍摄指令。本文件管的是**预设自带的
   指令条目**——那些不属于任何世界书、却要决定「AI 如何理解角色卡、
   用何种方式讲故事」的话。

   生成时只读 localStorage 里的「生效快照」（ACTIVE_PRESET_KEY）：
   套用某个预设 ⇒ 把它的条目落成快照。视图层因此不必认识 Scheme。
   ============================================================ */

import type { ChatTurn } from './api'

export type PresetEntryKind = '行为' | '格式' | '其它'
export type PresetEntryPos = 'pre' | 'post'
/**
 * 适用范围 —— 条目**管哪一条通道**。
 *
 * 主线推演与角色短信是两种活：前者要写一千多字的散文长段，后者只发一到三句
 * 聊天。同一条指令压在两边，必有一边是错的 —— 「每回合 1000–2000 字」让短信
 * 变成长信，「一到三句、不加星号动作」让推演的正文散架。所以适用范围是条目
 * 自己的属性，而不是让每条内容去兼顾两边。
 *
 * 缺省视作 `all`：老存档里的条目没有这个字段，按「两边都进」读，与加这个维度之前一致。
 */
export type PresetEntryScope = 'all' | 'main' | 'sms'

export interface PresetEntry {
  id: string
  /** 条目标题（界面显示；也作为注入时的行首标签） */
  name: string
  /** 仅用于界面分组，不影响注入 */
  kind: PresetEntryKind
  /** 指令正文 —— 直接进提示词 */
  content: string
  /** 关闭则不参与注入 */
  enabled: boolean
  /** true = 常驻恒注入；false = 需关键词命中 */
  constant: boolean
  keys: string[]
  order: number
  /** 注入位置：导演指令说明之后（管「如何理解」）/ 事件指令 schema 之前（管「如何输出」） */
  position: PresetEntryPos
  /** 管哪条通道；缺省 = all（两边都进） */
  scope?: PresetEntryScope
  /** 分组标题（酒馆预设里「===xxx===」那种分隔行的名字）；仅用于界面归纳 */
  group?: string
  /** 占位条目：由本终端在运行时填充（角色档案、世界书、对话历史…），本身不含可注入文本 */
  placeholder?: boolean
}

/** 条目适用范围（缺省 all） */
export function scopeOf(e: PresetEntry): PresetEntryScope {
  return e.scope === 'main' || e.scope === 'sms' ? e.scope : 'all'
}


/** 新建预设时的起步条目：只谈结构性约定，不碰故事口径，用户可随意改删 */
export const DEFAULT_PRESET_ENTRIES: PresetEntry[] = [
  {
    id: 'pe-narration', name: '叙述人称', kind: '行为', position: 'pre',
    content: '以第三人称限知视角叙述，紧贴在场角色的所见所感；不越出任何人当下能知道的范围。',
    enabled: true, constant: true, keys: [], order: 10,
  },
  {
    id: 'pe-no-invent', name: '设定纪律', kind: '行为', position: 'pre',
    content: '不发明设定。事件大纲与角色档案之外的事实一律不写；需要新信息时留白，交由事件指令块推进。',
    enabled: true, constant: true, keys: [], order: 20,
  },
  {
    id: 'pe-format', name: '文本格式', kind: '格式', position: 'post',
    content: '对白用「」括起。不使用 Markdown 标题、表格与加粗；段落之间空一行。',
    enabled: true, constant: true, keys: [], order: 10,
  },
  {
    id: 'pe-length', name: '篇幅', kind: '格式', position: 'post',
    content: '每回合正文控制在 400–800 字：写足一个完整场景再收束，不铺陈未发生的后续。',
    enabled: true, constant: true, keys: [], order: 20,
  },
]

/** 新条目工厂（界面「＋ 新建条目」用） */
export function newPresetEntry(order = 100): PresetEntry {
  return {
    id: crypto.randomUUID(), name: '新条目', kind: '行为', position: 'pre',
    content: '', enabled: true, constant: true, keys: [], order,
  }
}

/**
 * 命中本回合应注入的条目：先剔关闭者与不归本通道管的，再按常驻／关键词判定，最后按 order 升序。
 *
 * `scope` 传调用方自己的通道（'main' / 'sms'）；传 'all'（或省略）表示不问通道，全收 ——
 * 界面预览与通联日志统计走这条，它们要的是「这套预设备了什么」，不是「这回合进了什么」。
 * 排序用 `order` 升序，同号时以数组下标兜底：`Array.prototype.sort` 自 ES2019 起稳定，
 * 同号条目于是保持预设文件里的先后 —— 顺序可预期，不随实现漂。
 */
export function matchPresetEntries(
  entries: PresetEntry[], scanText: string, scope: PresetEntryScope = 'all',
): PresetEntry[] {
  const text = (scanText || '').toLowerCase()
  return entries
    .filter((e) => e.enabled !== false && !e.placeholder)
    .filter((e) => scope === 'all' || scopeOf(e) === 'all' || scopeOf(e) === scope)
    .filter((e) => e.constant || e.keys.some((k) => !!k && text.includes(k.toLowerCase())))
    .slice()
    .sort((a, b) => a.order - b.order)
}

/* 两段注入的抬头。两个通道各写各的 —— 短信这边若也抬「本段叙事的硬性约定」，
   等于先给模型递一个「你在写小说」的话头，后面那几条「只发一到三句」就白写了。 */
const HEAD = {
  main: {
    pre: '【预设 · 导演指令】（本段叙事的硬性约定，与既有习惯冲突时以此为准）',
    post: '【预设 · 输出格式】（在写出事件指令块之前须满足）',
  },
  sms: {
    pre: '【预设 · 角色设定】（扮演这个人的硬性约定，与既有习惯冲突时以此为准）',
    post: '【预设 · 发言格式】（每条消息都须满足）',
  },
} as const

/**
 * 命中条目 → 两段注入文本（各自为空时返回 ''）。
 * `hits` 是**这一回合真的进了提示词**的条目名（按注入序）——
 * 通联日志拿它对账：「预设备了 22 条、这一回合进了 5 条」是两件事，
 * 页面上只说前者就成了「看着生效、其实没进」。
 *
 * `scope` 是**调用方所在通道**（Plot 传 'main'，Tavern / smsauto 传 'sms'）：
 * 不归本通道管的条目在这里就出局，连 hits 都不进 —— 日志上的数字与提示词里的
 * 实际内容才对得上是同一回事。
 */
export function buildPresetContext(
  entries: PresetEntry[], scanText: string, scope: PresetEntryScope = 'main',
): { pre: string; post: string; hits: string[] } {
  const hits = matchPresetEntries(entries, scanText, scope)
  const head = HEAD[scope === 'sms' ? 'sms' : 'main']
  const block = (pos: PresetEntryPos, text: string) => {
    const part = hits.filter((e) => e.position === pos && (e.content || '').trim())
    if (!part.length) return ''
    const body = part.map((e) => `▸ ${e.name}\n${e.content.trim()}`).join('\n')
    return `${text}\n${body}`
  }
  return {
    pre: block('pre', head.pre),
    post: block('post', head.post),
    hits: hits.filter((e) => (e.content || '').trim()).map((e) => e.name),
  }
}

/**
 * 生效预设的身份：id / 名 / 预填充有无。
 * 未套用过任何预设时 id 为 null —— 通联日志据此写「未套用预设」，
 * 而不是让一屏空条目看起来像「预设生效了但一条没进」。
 */
export function activePresetInfo(): { id: string | null; name: string; prefill: boolean } {
  try {
    const raw = localStorage.getItem(ACTIVE_PRESET_KEY)
    if (!raw) return { id: null, name: '', prefill: false }
    const p = JSON.parse(raw) as ActivePreset
    return {
      id: typeof p?.id === 'string' ? p.id : null,
      name: typeof p?.name === 'string' ? p.name : '',
      prefill: typeof p?.prefill === 'string' && p.prefill.trim() !== '',
    }
  } catch {
    return { id: null, name: '', prefill: false }
  }
}

/* ---------- 生效快照 ---------- */

export const ACTIVE_PRESET_KEY = 'zts-active-preset:v1'

export interface ActivePreset {
  id: string
  name: string
  entries: PresetEntry[]
  /** 预填充（酒馆的 assistant_prefill）：摆一个开头，让模型顺着它往下写 */
  prefill?: string
}

/** 套用预设时落一次快照：此后生成本回合的提示词只认它 */
export function snapshotActivePreset(
  id: string,
  name: string,
  entries: PresetEntry[],
  prefill = '',
): void {
  try {
    const p: ActivePreset = { id, name, entries }
    if (prefill.trim()) p.prefill = prefill
    localStorage.setItem(ACTIVE_PRESET_KEY, JSON.stringify(p))
  } catch {
    /* 隐私模式下降级：读回时自然为空 */
  }
}

/**
 * 预填充：把 assistant 的开头先摆上桌。
 * 走的是「最后一条消息是 assistant」这条标准路子 —— 模型接着它写，
 * 于是正文最终 = 预填 + 续写；预填本身也要先上屏，不然界面会像吞了半句。
 */
export function prefillTurns(messages: ChatTurn[], prefill: string): ChatTurn[] {
  return prefill ? [...messages, { role: 'assistant', content: prefill }] : messages
}

/** 当前生效的预填充（未套用预设 / 预设没写 → ''） */
export function readActivePrefill(): string {
  try {
    const raw = localStorage.getItem(ACTIVE_PRESET_KEY)
    if (!raw) return ''
    const p = JSON.parse(raw) as ActivePreset
    return typeof p?.prefill === 'string' ? p.prefill : ''
  } catch {
    return ''
  }
}

/** 当前生效的指令条目（未套用过任何预设 → []） */
export function readActivePreset(): PresetEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVE_PRESET_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    return parsePresetEntries((p as ActivePreset | null)?.entries) ?? []
  } catch {
    return []
  }
}

/** 当前生效预设的 id（用于判断「正在调配的就是生效中的那个」） */
export function activePresetId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PRESET_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as ActivePreset
    return typeof p?.id === 'string' ? p.id : null
  } catch {
    return null
  }
}

/* ---------- 酒馆预设 → 指令条目 ---------- */

/** 「===主要文风（选一开启）===」这类分隔行：带一对以上的等号 */
const isSeparator = (name: string) => /[=＝]{2,}[^=＝]*[=＝]{2,}/.test(name)
/** 去掉分隔行首尾的等号与引导符号，留作分组名 */
const groupLabelOf = (name: string) =>
  name.replace(/^[^\p{L}\p{N}=＝]*/u, '').replace(/[=＝]+/g, '').trim() || name.trim()

/**
 * 酒馆 ChatCompletion 预设的 `prompts` → 本终端的指令条目。
 *  - 分隔行（`===xxx===`）不成为条目，而是给后续条目当分组名；
 *  - `marker: true` 的占位条目（Char Description / World Info / Chat History…）
 *    保留下来只为让结构可见，标注 placeholder，不参与注入；
 *  - `role: 'user'` 视作靠后注入（贴近输出），其余归入前置。
 * 注：条目的 {{宏}} 不会被展开，原样保留。
 */
export function parseStPrompts(prompts: unknown, promptOrder?: unknown): PresetEntry[] | null {
  if (!Array.isArray(prompts)) return null
  /* 启用状态的真身在 prompt_order 里（prompts[].enabled 是旧版残留，两边会打架）。
     新酒馆的勾选只改 prompt_order[].order[].enabled —— 只读 prompts 的话，
     一份 95 条的预设会整册导成「全关」，看上去就像没导进来。 */
  const onOf = new Map<string, boolean>()
  if (Array.isArray(promptOrder)) {
    for (const po of promptOrder) {
      if (!po || typeof po !== 'object') continue
      const order = (po as Record<string, unknown>).order
      if (!Array.isArray(order)) continue
      for (const o of order) {
        if (!o || typeof o !== 'object') continue
        const it = o as Record<string, unknown>
        if (typeof it.identifier === 'string' && it.identifier) onOf.set(it.identifier, it.enabled === true)
      }
    }
  }
  const out: PresetEntry[] = []
  let group: string | undefined
  let idx = 0
  for (const raw of prompts) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) continue
    if (isSeparator(name)) { group = groupLabelOf(name); continue }
    idx += 1
    const marker = o.marker === true
    const ident = typeof o.identifier === 'string' && o.identifier ? o.identifier : ''
    /* 触发词：酒馆把「常驻」和「命中才注入」都写在这一个数组里 —— 开头的 🔵 表示常驻
       （🟢 / 无前缀 = 关键词命中）。照搬进来，别一律导成常驻，否则一份预设里
       那些「只在交战时生效」的条目会每一回合都压在提示词上。 */
    const trigRaw = Array.isArray(o.injection_trigger)
      ? (o.injection_trigger as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
    const always = trigRaw.some((k) => k.startsWith('🔵'))
    const keys = trigRaw
      .filter((k) => !k.startsWith('🔵'))
      .map((k) => k.replace(/^[🟢🔵]\s*/, '').trim())
      .filter(Boolean)
    out.push({
      id: ident ? `st-${ident}` : crypto.randomUUID(),
      name,
      kind: marker ? '其它' : /文风|格式|字数|排版/.test(name) ? '格式' : '行为',
      group,
      placeholder: marker || undefined,
      content: marker ? '' : (typeof o.content === 'string' ? o.content : ''),
      enabled: ident && onOf.has(ident) ? onOf.get(ident) === true : o.enabled === true,
      constant: always || !keys.length,
      keys,
      order: typeof o.injection_order === 'number' && Number.isFinite(o.injection_order) ? o.injection_order : idx * 10,
      // role:'user' 的酒馆条目挂在对话尾部，对应到本终端即「贴近输出」的后置段
      position: !marker && o.role === 'user' ? 'post' : 'pre',
      /* 适用范围是本终端给酒馆格式加的一个字段（酒馆读不懂也不报错，导回去无碍）：
         写 'main' / 'sms' 就把条目限在那一侧，不写 = 两侧都进。 */
      ...(o.scope === 'main' || o.scope === 'sms' ? { scope: o.scope } : {}),
    })
  }
  return out.length ? out : null
}

/* ---------- 容错解析 ---------- */

const KINDS: PresetEntryKind[] = ['行为', '格式', '其它']

/**
 * 方案文件／本地存档里的条目数组 → PresetEntry[]；无有效项返回 null。
 * 认不出 `scope` 就**不写这个字段**（而不是写成 'all'）：缺省本就是 all，
 * 显式写进去只会让老存档看起来像「被人改过」。
 */
export function parsePresetEntries(v: unknown): PresetEntry[] | null {
  if (!Array.isArray(v)) return null
  const out: PresetEntry[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const content = typeof o.content === 'string' ? o.content : ''
    const name = typeof o.name === 'string' ? o.name : ''
    if (!content && !name) continue
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
      name: name || '未命名条目',
      kind: KINDS.includes(o.kind as PresetEntryKind) ? (o.kind as PresetEntryKind) : '行为',
      position: o.position === 'post' ? 'post' : 'pre',
      content,
      enabled: o.enabled !== false,
      constant: o.constant !== false,
      keys: Array.isArray(o.keys) ? (o.keys as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      order: typeof o.order === 'number' && Number.isFinite(o.order) ? o.order : 100,
      ...(o.scope === 'main' || o.scope === 'sms' ? { scope: o.scope } : {}),
      ...(typeof o.group === 'string' && o.group ? { group: o.group } : {}),
      ...(o.placeholder === true ? { placeholder: true } : {}),
    })
  }
  return out.length ? out : null
}
