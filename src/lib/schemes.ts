/* 停滞观测终端 — 「方案」共享核心（lib/schemes.ts）
   方案 = 双通道参数（baseUrl/model/temperature/maxTokens，不含密钥）+ 激活世界书 id。
   本地存 localStorage（zts-schemes:v1），供 设置页 与 剧情推进页内嵌控件 共用同一套读写与套用语义。 */

import type { AiChannel, ApiSettings } from './api'
import { readProfiles, saveProfile } from './api'
import * as lore from './lorestore'

export type ChannelCfg = Record<AiChannel, ApiSettings>

export interface SchemePart { baseUrl: string; model: string; temperature: number; maxTokens: number }
export interface Scheme {
  id: string
  name: string
  main: SchemePart
  sms: SchemePart
  activeLoreIds: string[]
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

export function makeScheme(name: string, main: SchemePart, sms: SchemePart, activeLoreIds: string[]): Scheme {
  return { id: crypto.randomUUID(), name, main, sms, activeLoreIds }
}

/** 读取单个本地 .json 文件（返回解析值；非 JSON 时为 null） */
export function readJsonFile(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) { resolve(null); return }
      try {
        resolve(JSON.parse(await f.text()) as unknown)
      } catch {
        resolve(null)
      }
    }
    input.click()
  })
}

/** 把当前两通道配置存成命名方案（顺带捕捉当前激活世界书） */
export async function captureFrom(cfgs: ChannelCfg, name: string): Promise<Scheme> {
  const ids = await lore.getActiveLorebookIds()
  return makeScheme(name.trim(), schemePart(cfgs.main), schemePart(cfgs.sms), ids)
}

/** 从本机持久配置直接捕捉（无需组件持有双通道编辑态） */
export async function capturePersisted(name: string): Promise<Scheme> {
  return captureFrom(await readProfiles(), name)
}

/** 合并方案分量到某通道（保留密钥等方案不记录的字段） */
function merge(cfg: ApiSettings, p: SchemePart, fb: number): ApiSettings {
  return {
    ...cfg,
    baseUrl: p.baseUrl,
    model: p.model,
    temperature: p.temperature,
    maxTokens: p.maxTokens || cfg.maxTokens || fb,
  }
}

/** 套用方案：写双通道 + 协调激活世界书；返回套用后的双通道配置 */
export async function applySchemeTo(cfgs: ChannelCfg, s: Scheme): Promise<ChannelCfg> {
  const nextMain = merge(cfgs.main, s.main, 1500)
  const nextSms = merge(cfgs.sms, s.sms, 1500)
  await Promise.all([saveProfile('main', nextMain), saveProfile('sms', nextSms)])
  const cur = await lore.getActiveLorebookIds()
  const want = new Set(s.activeLoreIds)
  for (const id of cur) if (!want.has(id)) await lore.setBookActive(id, false)
  for (const id of s.activeLoreIds) if (!cur.includes(id)) await lore.setBookActive(id, true)
  return { main: nextMain, sms: nextSms }
}

/** 从本机持久配置直接套用方案（剧情推进页内嵌控件用） */
export async function applySchemePersisted(s: Scheme): Promise<ChannelCfg> {
  return applySchemeTo(await readProfiles(), s)
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
  }
}

export type ChatPresetResult =
  | { ok: true; scheme: Scheme; model: string; note: string }
  | { ok: false; warn: string }

/** ChatPreset JSON → 映射为「方案」（模型/温度/输出预算；baseUrl 沿用当前通道）。不落盘，由调用方 store+apply */
export function parseChatPreset(data: unknown, cfgs: ChannelCfg): ChatPresetResult {
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
    const samplerish = Object.keys(settings).some((k) => /^(top_p|top_k|rep_pen|min_p|presence_penalty|frequency_penalty|stream_|temp|temperature)/i.test(k))
      || Object.keys(d).some((k) => /^(top_p|top_k|rep_pen|temp|temperature|stream_)/i.test(k))
    const curModel = cfgs.main.model.trim() || cfgs.sms.model.trim()
    if (samplerish && curModel) {
      model = curModel
      note = '预设未含模型名，已沿用当前通道模型'
    } else {
      const isLorebook = Array.isArray(d.entries)
        || (d.data && typeof d.data === 'object' && !Array.isArray(d.data) && Array.isArray((d.data as Record<string, unknown>).entries))
      const keysShown = (Object.keys(settings).length ? Object.keys(settings) : Object.keys(d)).slice(0, 8).join('、')
      const warn = isLorebook
        ? '这份是酒馆世界书（world info，含 entries）——请改用「导入 ST 世界书」。'
        : `未找到模型名。文件键：${keysShown || '（空对象）'}；可识别 ${MODEL_KEYS.join(' / ')} 或以 _model 结尾的字段。`
      return { ok: false, warn }
    }
  }
  const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : `ChatPreset · ${model}`
  const scheme: Scheme = {
    id: crypto.randomUUID(),
    name,
    main: { baseUrl: cfgs.main.baseUrl, model, temperature: temp, maxTokens },
    sms: { baseUrl: cfgs.sms.baseUrl, model, temperature: temp, maxTokens },
    activeLoreIds: [],
  }
  const noteFull = [note, budgetNote].filter(Boolean).join(' · ')
  return { ok: true, scheme, model, note: noteFull }
}

/** 导入 ChatPreset 并整体落地（加入方案列表 + 套用两通道）——两页共用 */
export async function importChatPresetFile(data: unknown): Promise<ChatPresetResult & { cfg?: ChannelCfg }> {
  const cfgs = await readProfiles()
  const r = parseChatPreset(data, cfgs)
  if (!r.ok) return r
  const act = await lore.getActiveLorebookIds()
  r.scheme.activeLoreIds = act
  const cfg = await applySchemeTo(cfgs, r.scheme)
  return { ...r, cfg }
}
