/* ============================================================
   预设 · 导演指令
   ------------------------------------------------------------
   角色卡是演员的剧本，预设是导演的拍摄指令。本文件管的是**预设自带的
   指令条目**——那些不属于任何世界书、却要决定「AI 如何理解角色卡、
   用何种方式讲故事」的话。

   生成时只读 localStorage 里的「生效快照」（ACTIVE_PRESET_KEY）：
   套用某个预设 ⇒ 把它的条目落成快照。视图层因此不必认识 Scheme。
   ============================================================ */

export type PresetEntryKind = '行为' | '格式' | '其它'
export type PresetEntryPos = 'pre' | 'post'

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
  /** 分组标题（酒馆预设里「===xxx===」那种分隔行的名字）；仅用于界面归纳 */
  group?: string
  /** 占位条目：由本终端在运行时填充（角色档案、世界书、对话历史…），本身不含可注入文本 */
  placeholder?: boolean
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

/** 命中本回合应注入的条目：先剔关闭者，再按常驻／关键词判定，最后按order 升序 */
export function matchPresetEntries(entries: PresetEntry[], scanText: string): PresetEntry[] {
  const text = (scanText || '').toLowerCase()
  return entries
    .filter((e) => e.enabled !== false && !e.placeholder)
    .filter((e) => e.constant || e.keys.some((k) => !!k && text.includes(k.toLowerCase())))
    .slice()
    .sort((a, b) => a.order - b.order)
}

const HEAD_PRE = '【预设 · 导演指令】（本段叙事的硬性约定，与既有习惯冲突时以此为准）'
const HEAD_POST = '【预设 · 输出格式】（在写出事件指令块之前须满足）'

/** 命中条目 → 两段注入文本（各自为空时返回 ''） */
export function buildPresetContext(
  entries: PresetEntry[], scanText: string,
): { pre: string; post: string } {
  const hits = matchPresetEntries(entries, scanText)
  const block = (pos: PresetEntryPos, head: string) => {
    const part = hits.filter((e) => e.position === pos && (e.content || '').trim())
    if (!part.length) return ''
    const body = part.map((e) => `▸ ${e.name}\n${e.content.trim()}`).join('\n')
    return `${head}\n${body}`
  }
  return { pre: block('pre', HEAD_PRE), post: block('post', HEAD_POST) }
}

/* ---------- 生效快照 ---------- */

export const ACTIVE_PRESET_KEY = 'zts-active-preset:v1'

export interface ActivePreset {
  id: string
  name: string
  entries: PresetEntry[]
}

/** 套用预设时落一次快照：此后生成本回合的提示词只认它 */
export function snapshotActivePreset(id: string, name: string, entries: PresetEntry[]): void {
  try {
    localStorage.setItem(ACTIVE_PRESET_KEY, JSON.stringify({ id, name, entries } satisfies ActivePreset))
  } catch {
    /* 隐私模式下降级：读回时自然为空 */
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
export function parseStPrompts(prompts: unknown): PresetEntry[] | null {
  if (!Array.isArray(prompts)) return null
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
    out.push({
      id: typeof o.identifier === 'string' && o.identifier ? `st-${o.identifier}` : crypto.randomUUID(),
      name,
      kind: marker ? '其它' : /文风|格式|字数|排版/.test(name) ? '格式' : '行为',
      group,
      placeholder: marker || undefined,
      content: marker ? '' : (typeof o.content === 'string' ? o.content : ''),
      enabled: o.enabled === true,
      constant: true,
      keys: [],
      order: typeof o.injection_order === 'number' && Number.isFinite(o.injection_order) ? o.injection_order : idx * 10,
      // role:'user' 的酒馆条目挂在对话尾部，对应到本终端即「贴近输出」的后置段
      position: !marker && o.role === 'user' ? 'post' : 'pre',
    })
  }
  return out.length ? out : null
}

/* ---------- 容错解析 ---------- */

const KINDS: PresetEntryKind[] = ['行为', '格式', '其它']

/** 方案文件／本地存档里的条目数组 → PresetEntry[]；无有效项返回 null */
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
      ...(typeof o.group === 'string' && o.group ? { group: o.group } : {}),
      ...(o.placeholder === true ? { placeholder: true } : {}),
    })
  }
  return out.length ? out : null
}
