/* 停滞观测终端 — 「方案」共享核心（lib/schemes.ts）
   方案 = 双通道参数（baseUrl/model/temperature/maxTokens，不含密钥）+ 激活世界书 id。
   本地存 localStorage（zts-schemes:v1），供 设置页 与 剧情推进页内嵌控件 共用同一套读写与套用语义。 */

import type { AiChannel, ApiSettings } from './api'
import { readProfiles, saveProfile } from './api'
import * as lore from './lorestore'
import type { PresetEntry } from './preset'
import { activePresetId, DEFAULT_PRESET_ENTRIES, parsePresetEntries, parseStPrompts, snapshotActivePreset } from './preset'

export type ChannelCfg = Record<AiChannel, ApiSettings>

export interface SchemePart { baseUrl: string; model: string; temperature: number; maxTokens: number }
export interface Scheme {
  id: string
  name: string
  main: SchemePart
  sms: SchemePart
  activeLoreIds: string[]
  /**
   * 预设自带的词条滤网：bookId → 本预设下**关闭**的词条 id。
   * 与世界书自身的 enabled 解耦——书上是「上一笔」，这里是「本预设的一笔」；
   * 套用时整层覆盖（未列入的词条一律启用），缺省则整层不动。
   * 未在此出现的书 = 本预设不管它，套用时保持原样。
   */
  loreEntryOff?: Record<string, string[]>
  /**
   * 预设自带的**导演指令条目**（生成行为 / 文本格式 …），不属于任何世界书。
   * 套用本预设时落成「生效快照」（见 preset.ts），由 plot/tavern 直接注入提示词。
   * 缺省 = 该预设不含指令条目。
   */
  entries?: PresetEntry[]
  /**
   * 预填充（酒馆的 assistant_prefill）：每次生成先摆上的那个开头。
   * 套用本预设时随指令条目一并落进生效快照（见 preset.ts）。
   */
  prefill?: string
  /**
   * 随预设带入的流式开关（酒馆的 stream_openai）。套用时一并落到两通道；
   * 未带该字段则不动通道现值。
   */
  stream?: boolean
  /** 随终端一起发的内置预设（见 builtin-presets.ts）：界面挂标，删了不再重播 */
  builtin?: boolean
}

export const SCHEME_KEY = 'zts-schemes:v1'
export const DEFAULT_PART: SchemePart = { baseUrl: '', model: '', temperature: 0.7, maxTokens: 1500 }

/** 读取本地方案列表（容错：坏数据/空 → []） */
export function listSchemes(): Scheme[] {
  try {
    const raw = localStorage.getItem(SCHEME_KEY)
    const p = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(p) ? p as Scheme[] : []
  } catch {
    return []
  }
}

/** 整体覆写本地方案列表 */
export function storeSchemes(list: Scheme[]): void {
  try {
    localStorage.setItem(SCHEME_KEY, JSON.stringify(list))
  } catch {
    /* 隐私模式下降级 */
  }
}

/** 通道配置 → 方案分量（不含密钥） */
export function schemePart(cfg: ApiSettings): SchemePart {
  return { baseUrl: cfg.baseUrl, model: cfg.model, temperature: cfg.temperature, maxTokens: cfg.maxTokens }
}

export function makeScheme(
  name: string, main: SchemePart, sms: SchemePart, activeLoreIds: string[],
  loreEntryOff?: Record<string, string[]>, entries?: PresetEntry[], prefill?: string,
): Scheme {
  return {
    id: crypto.randomUUID(), name, main, sms, activeLoreIds,
    ...(loreEntryOff ? { loreEntryOff } : {}),
    ...(entries ? { entries } : {}),
    ...(prefill && prefill.trim() ? { prefill: prefill.trim() } : {}),
  }
}

/** 读取单个本地 .json 文件（返回解析值与文件名；非 JSON 时为 null） */
export function readJsonFile(): Promise<{ name: string; json: unknown } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) { resolve(null); return }
      try {
        const nm = typeof f.name === 'string' ? f.name.replace(/\.json$/i, '') : ''
        resolve({ name: nm, json: JSON.parse(await f.text()) as unknown })
      } catch {
        resolve(null)
      }
    }
    input.click()
  })
}

/** 把当前两通道配置存成命名方案（顺带捕捉当前激活世界书 + 其逐条开关滤网） */
export async function captureFrom(cfgs: ChannelCfg, name: string): Promise<Scheme> {
  const ids = await lore.getActiveLorebookIds()
  const off = await lore.snapshotEntryOff(ids)
  // 起步指令条目：新建的预设先带上一套结构性约定，用户可在「管理预设」里改删
  return makeScheme(
    name.trim(), schemePart(cfgs.main), schemePart(cfgs.sms), ids, off,
    DEFAULT_PRESET_ENTRIES.map((e) => ({ ...e, id: crypto.randomUUID() })),
  )
}

/** 从本机持久配置直接捕捉（无需组件持有双通道编辑态） */
export async function capturePersisted(name: string): Promise<Scheme> {
  return captureFrom(await readProfiles(), name)
}

/** 合并方案分量到某通道（保留密钥等方案不记录的字段） */
function merge(cfg: ApiSettings, p: SchemePart, fb: number): ApiSettings {
  return {
    ...cfg,
    // 方案没带地址/模型名时沿用通道现值 —— 否则「导入一份不含模型名的预设」
    // 会把手上填好的终端地址连同模型一起抹掉
    baseUrl: p.baseUrl || cfg.baseUrl,
    model: p.model || cfg.model,
    temperature: p.temperature,
    maxTokens: p.maxTokens || cfg.maxTokens || fb,
  }
}

/** 套用方案：写双通道 + 协调激活世界书 + 覆上词条滤网；返回套用后的双通道配置 */
export async function applySchemeTo(cfgs: ChannelCfg, s: Scheme): Promise<ChannelCfg> {
  const nextMain = merge(cfgs.main, s.main, 1500)
  const nextSms = merge(cfgs.sms, s.sms, 1500)
  // 预设带了流式开关就一并落下去（酒馆的 stream_openai 语义；导入时也是这么做的）
  if (typeof s.stream === 'boolean') {
    nextMain.stream = s.stream
    nextSms.stream = s.stream
  }
  await Promise.all([saveProfile('main', nextMain), saveProfile('sms', nextSms)])
  const cur = await lore.getActiveLorebookIds()
  const want = new Set(s.activeLoreIds)
  for (const id of cur) if (!want.has(id)) await lore.setBookActive(id, false)
  for (const id of s.activeLoreIds) if (!cur.includes(id)) await lore.setBookActive(id, true)
  // 词条滤网：只有本预设亲自记过的书才覆盖，其余保持书上的原样
  if (s.loreEntryOff) await lore.applyEntryOff(s.loreEntryOff)
  // 导演指令：套用即落生效快照，此后生成只认它（预填充一并落进去）
  snapshotActivePreset(s.id, s.name, s.entries ?? [], s.prefill ?? '')
  return { main: nextMain, sms: nextSms }
}

/**
 * 管理预设 · 局部改写某个方案（指令条目 / 词条滤网 …）。
 * 若该方案正是当前生效的那个，顺手刷新生效快照——界面上的开关因此立刻对下一次生成生效。
 */
export function patchScheme(
  id: string,
  patch: Partial<Pick<Scheme, 'name' | 'entries' | 'loreEntryOff' | 'prefill'>>,
): Scheme[] {
  const next = listSchemes().map((s) => (s.id === id ? { ...s, ...patch } : s))
  storeSchemes(next)
  const cur = next.find((s) => s.id === id)
  if (cur && activePresetId() === id) snapshotActivePreset(cur.id, cur.name, cur.entries ?? [], cur.prefill ?? '')
  return next
}

/** 从本机持久配置直接套用方案（剧情推进页内嵌控件用） */
export async function applySchemePersisted(s: Scheme): Promise<ChannelCfg> {
  return applySchemeTo(await readProfiles(), s)
}

/* ---------- 预设调配 · 词条滤网 ---------- */

/** 词条滤网容错解析：只留「书 id → 字符串数组」，非法项丢弃；无有效项返回 null */
export function parseEntryOff(v: unknown): Record<string, string[]> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: Record<string, string[]> = {}
  for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue
    const ids = arr.filter((x): x is string => typeof x === 'string')
    if (ids.length) out[k] = ids
  }
  return Object.keys(out).length ? out : null
}

/** 首次调配某本书：以该书当前的关闭集为基线落键，之后才谈增减（避免「一开整本」的意外覆盖） */
export function seedEntryOff(
  off: Record<string, string[]> | undefined, bookId: string, currentOffIds: string[],
): Record<string, string[]> {
  const cur = off ?? {}
  return cur[bookId] ? cur : { ...cur, [bookId]: [...currentOffIds] }
}

/** 在滤网上翻转某条（on=true 即该条启用，从关闭集中移除）；书目为空则删键 */
export function toggleEntryOff(
  off: Record<string, string[]> | undefined, bookId: string, entryId: string, on: boolean,
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...(off ?? {}) }
  const set = new Set(next[bookId] ?? [])
  if (on) set.delete(entryId)
  else set.add(entryId)
  if (set.size) next[bookId] = [...set]
  else delete next[bookId]
  return next
}

/** 方案 JSON 文件 → 新 Scheme（id 重生成，字段容错）；不是方案返回 null */
export function parseSchemeFile(data: unknown): Scheme | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  if (typeof d.name !== 'string' || !d.name.trim()) return null
  const mk = (p: unknown, fb: SchemePart): SchemePart => {
    const o = (p && typeof p === 'object' ? p as Record<string, unknown> : {}) as Record<string, unknown>
    return {
      baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : fb.baseUrl,
      model: typeof o.model === 'string' ? o.model : fb.model,
      temperature: typeof o.temperature === 'number' ? o.temperature : fb.temperature,
      maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : fb.maxTokens,
    }
  }
  return {
    id: crypto.randomUUID(),
    name: d.name.trim(),
    main: mk(d.main, DEFAULT_PART),
    sms: mk(d.sms, DEFAULT_PART),
    activeLoreIds: Array.isArray(d.activeLoreIds) ? (d.activeLoreIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    ...(parseEntryOff(d.loreEntryOff) ? { loreEntryOff: parseEntryOff(d.loreEntryOff)! } : {}),
    ...(parsePresetEntries(d.entries) ? { entries: parsePresetEntries(d.entries)! } : {}),
  }
}

export type ChatPresetResult =
  | {
      ok: true
      scheme: Scheme
      model: string
      note: string
      /** 预设里的流式开关（酒馆 stream_openai）；未带该字段为 undefined */
      stream?: boolean
      /** 随预设带入的指令条目数（已扣除分隔行与占位条目），供提示语显示 */
      entryCount: number
    }
  | { ok: false; warn: string }

/** ChatPreset JSON → 映射为「方案」（模型/温度/输出预算；baseUrl 沿用当前通道）。不落盘，由调用方 store+apply */
export function parseChatPreset(data: unknown, cfgs: ChannelCfg, fileHint?: string): ChatPresetResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, warn: '所选文件不是 ChatPreset JSON。' }
  }
  const d = data as Record<string, unknown>
  // 现行酒馆 ChatCompletion 预设结构：顶层即设置对象 / 包一层 settings（分享包再包 data.settings）。两级都扫。
  const settingsRaw =
    (d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings)
      ? d.settings
      : (d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? (d.data as Record<string, unknown>).settings : null)) ?? {}
  const settings = (settingsRaw && typeof settingsRaw === 'object' && !Array.isArray(settingsRaw) ? settingsRaw : {}) as Record<string, unknown>
  const MODEL_KEYS = ['oai_model', 'openai_model', 'claude_model', 'anthropic_model']
  const TEMP_KEYS = ['temp_openai', 'temperature', 'temp']

  const pickFrom = (src: Record<string, unknown>) => {
    const mKey = MODEL_KEYS.find((k) => typeof src[k] === 'string' && (src[k] as string).trim().length > 0)
      ?? Object.keys(src).find((k) => /_model$/i.test(k) && typeof src[k] === 'string' && (src[k] as string).trim().length > 0)
      ?? (typeof src.model === 'string' && src.model.trim() ? 'model' : undefined)
    const tKey = TEMP_KEYS.find((k) => typeof src[k] === 'number')
    return {
      model: mKey ? (src[mKey] as string).trim() : '',
      temp: tKey ? (src[tKey] as number) : null,
      modelKey: mKey ?? null,
    }
  }
  let pf = pickFrom(settings)
  if (!pf.model) pf = pickFrom(d)
  let model = pf.model
  const temp = pf.temp ?? cfgs.main.temperature ?? 0.8
  let note = pf.modelKey ? (MODEL_KEYS.includes(pf.modelKey) ? '' : `读自 ${pf.modelKey}`) : ''

  const budgetKey = (['openai_max_tokens', 'oai_max_tokens', 'max_tokens'] as const)
    .find((k) => typeof settings[k] === 'number' || typeof d[k] === 'number')
  const rawBudget = budgetKey ? (typeof settings[budgetKey] === 'number' ? settings[budgetKey] : d[budgetKey]) as number : NaN
  const maxTokens = Number.isFinite(rawBudget) && rawBudget > 0
    ? Math.max(256, Math.min(64000, Math.round(rawBudget)))
    : (cfgs.main.maxTokens || cfgs.sms.maxTokens || 1500)
  const budgetNote = Number.isFinite(rawBudget) && rawBudget > 0 ? `输出预算 ${maxTokens}` : ''

  if (!model) {
    // 确属预设（含采样器键）但没带模型名 → 沿用当前通道模型，仅应用温度等参数（同酒馆「导入即套用」语义）
    // 注意：模型名本来就不是预设的必填项 —— 酒馆里模型是在连接面板选的，预设只管采样器与指令。
    // 所以「文件无模型名」不构成拒收理由，通道也是空的就照空着导进来，由终端设置去填。
    const samplerish = Object.keys(settings).some((k) => /^(top_p|top_k|rep_pen|min_p|presence_penalty|frequency_penalty|stream_|temp|temperature)/i.test(k))
      || Object.keys(d).some((k) => /^(top_p|top_k|rep_pen|temp|temperature|stream_)/i.test(k))
    const isLorebook = Array.isArray(d.entries)
      || (d.data && typeof d.data === 'object' && !Array.isArray(d.data) && Array.isArray((d.data as Record<string, unknown>).entries))
    const curModel = cfgs.main.model.trim() || cfgs.sms.model.trim()
    if (samplerish && !isLorebook) {
      model = curModel
      note = curModel ? '预设未含模型名，已沿用当前通道模型' : '预设未含模型名，导入后在终端设置里填模型'
    } else {
      const keysShown = (Object.keys(settings).length ? Object.keys(settings) : Object.keys(d)).slice(0, 8).join('、')
      const warn = isLorebook
        ? '这份是酒馆的世界书（world info）——请改用「导入 ST 世界书」。'
        : `未找到模型名。文件里的字段：${keysShown || '（空对象）'}；可识别 ${MODEL_KEYS.join(' / ')} 或以 _model 收尾的字段。`
      return { ok: false, warn }
    }
  }
  const name = typeof d.name === 'string' && d.name.trim()
    ? d.name.trim()
    : (fileHint?.trim() || `ChatPreset · ${model || '未含模型名'}`)
  // 预设自带的指令条目（酒馆 prompts 数组）：分隔行归组、marker 记占位、其余原样入册
  const promptsRaw = Array.isArray(d.prompts)
    ? d.prompts
    : (d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? (d.data as Record<string, unknown>).prompts : null)
  // 启用状态：老预设写在 prompts[].enabled，新预设写在 prompt_order[].order[].enabled（以它为准）
  const entries = parseStPrompts(promptsRaw, d.prompt_order)
  const entryCount = entries?.filter((e) => !e.placeholder).length ?? 0
  // 预填充（assistant_prefill）：酒馆里是「先替模型写个开头」，本终端照搬语义。
  // 有的预设把它写在采样器层，有的写在顶层，两处都认。
  const prefillRaw = typeof d.assistant_prefill === 'string'
    ? d.assistant_prefill
    : (typeof settings.assistant_prefill === 'string' ? settings.assistant_prefill : '')
  const prefill = (prefillRaw ?? '').trim().slice(0, 400)
  const scheme: Scheme = {
    id: crypto.randomUUID(),
    name,
    main: { baseUrl: cfgs.main.baseUrl, model, temperature: temp, maxTokens },
    sms: { baseUrl: cfgs.sms.baseUrl, model, temperature: temp, maxTokens },
    activeLoreIds: [],
    ...(entries ? { entries } : {}),
    ...(prefill ? { prefill } : {}),
  }
  const stream = typeof d.stream_openai === 'boolean'
    ? d.stream_openai
    : (settings.stream_openai as boolean | undefined)
  const noteFull = [note, budgetNote, entryCount ? `指令条目 ${entryCount}` : '', prefill ? '含预填充' : '']
    .filter(Boolean).join(' · ')
  return { ok: true, scheme, model, note: noteFull, entryCount, ...(typeof stream === 'boolean' ? { stream } : {}) }
}

/** 导入 ChatPreset 并整体落地（加入方案列表 + 套用两通道）——两页共用 */
export async function importChatPresetFile(data: unknown, fileHint?: string): Promise<ChatPresetResult & { cfg?: ChannelCfg }> {
  const cfgs = await readProfiles()
  const r = parseChatPreset(data, cfgs, fileHint)
  if (!r.ok) return r
  const act = await lore.getActiveLorebookIds()
  r.scheme.activeLoreIds = act
  let cfg = await applySchemeTo(cfgs, r.scheme)
  // 预设里的流式开关一并落到两通道（酒馆的 stream_openai 语义）
  if (typeof r.stream === 'boolean') {
    cfg = { main: { ...cfg.main, stream: r.stream }, sms: { ...cfg.sms, stream: r.stream } }
    await Promise.all([saveProfile('main', cfg.main), saveProfile('sms', cfg.sms)])
  }
  return { ...r, cfg }
}
