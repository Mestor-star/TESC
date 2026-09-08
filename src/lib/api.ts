/* ============================================================
   双通道 AI —— 主线剧情 / 角色短信 的通道配置与请求
   ------------------------------------------------------------
   只做「OpenAI 兼容」接口（/chat/completions），无论上游是官方、
   one-api / new-api 之类的中继、还是本地 vLLM / Ollama 网关，
   都能以 baseUrl + apiKey + model 一套覆盖。

   两条通道各自独立配置（可同可异）：主键 api:main / api:sms。
   旧版单一键 api（早期聊天在用）只在两键皆缺时一次性播种给
   api:sms（旧聊天即角色短信的前身），播种后删除旧键。

   密钥只存 IndexedDB（浏览器本地），绝不写入代码或任何明文文件。
   ============================================================ */

export interface ApiSettings {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export const API_DEFAULTS: ApiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  temperature: 0.8,
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const AI_CHANNELS = ['main', 'sms'] as const
export type AiChannel = (typeof AI_CHANNELS)[number]

const DB_NAME = 'zts-terminal-store'
const DB_VER = 1
const KEY_LEGACY = 'api'
const CH_KEY: Record<AiChannel, string> = { main: 'api:main', sms: 'api:sms' }

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
  return dbPromise
}

async function kvGet(key: string): Promise<unknown> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly')
    const req = tx.objectStore('kv').get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('读取 IndexedDB 失败'))
  })
}

async function kvSet(key: string, val: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(val, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('写入 IndexedDB 失败'))
  })
}

async function kvDel(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('删除 IndexedDB 失败'))
  })
}

function defaults(): ApiSettings {
  return { ...API_DEFAULTS }
}

/** 载入双通道配置；首次运行时执行旧键 → 角色短信的一次性迁移 */
export async function readProfiles(): Promise<Record<AiChannel, ApiSettings>> {
  const out: Record<AiChannel, ApiSettings> = { main: defaults(), sms: defaults() }
  const [legacy, mainRaw, smsRaw] = await Promise.all([
    kvGet(KEY_LEGACY).catch(() => null),
    kvGet(CH_KEY.main).catch(() => null),
    kvGet(CH_KEY.sms).catch(() => null),
  ])
  if (mainRaw == null && smsRaw == null && legacy != null) {
    // 旧版仅一份配置（早期聊天在用）→ 播种给角色短信（其前身）
    out.sms = { ...defaults(), ...(legacy as Partial<ApiSettings>) }
    await kvSet(CH_KEY.sms, out.sms).catch(() => {})
    await kvDel(KEY_LEGACY).catch(() => {})
  } else {
    out.main = { ...defaults(), ...((mainRaw as Partial<ApiSettings> | null) ?? {}) }
    out.sms = { ...defaults(), ...((smsRaw as Partial<ApiSettings> | null) ?? {}) }
  }
  return out
}

/** 载入某通道配置（缺省合并默认值） */
export async function loadProfile(ch: AiChannel): Promise<ApiSettings> {
  return (await readProfiles())[ch]
}

export async function saveProfile(ch: AiChannel, cfg: ApiSettings): Promise<void> {
  await kvSet(CH_KEY[ch], cfg)
}

/** 当前是否已具备可发起请求的最小配置 */
export function isReady(cfg: ApiSettings): boolean {
  return cfg.baseUrl.trim() !== '' && cfg.model.trim() !== ''
}

/**
 * @deprecated 旧版单一配置 → 已收敛为「角色短信」通道。请改用 loadProfile('sms')/saveProfile。
 */
export async function loadApi(): Promise<ApiSettings> {
  return loadProfile('sms')
}

/**
 * @deprecated 见 loadApi。
 */
export async function saveApi(cfg: ApiSettings): Promise<void> {
  return saveProfile('sms', cfg)
}

export interface ChatOpts {
  signal?: AbortSignal
  /** 覆盖 max_tokens（默认 640；主线剧情叙述可调大） */
  maxTokens?: number
  /** 覆盖温度（默认取 cfg.temperature） */
  temperature?: number
}

/** 调起一次 OpenAI 兼容的 chat/completions */
export async function chatCompletion(
  cfg: ApiSettings,
  messages: ChatTurn[],
  opts?: ChatOpts,
): Promise<string> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('接口地址（baseUrl）为空')
  if (!cfg.model.trim()) throw new Error('模型名称为空')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal: opts?.signal,
    body: JSON.stringify({
      model: cfg.model.trim(),
      messages,
      temperature: opts?.temperature ?? cfg.temperature,
      max_tokens: opts?.maxTokens ?? 640,
      stream: false,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const detail = (() => {
      try {
        const j = JSON.parse(body) as { error?: { message?: string } }
        return j.error?.message ?? ''
      } catch {
        return ''
      }
    })()
    throw new Error(`HTTP ${res.status}${detail ? ` · ${detail}` : body ? ` · ${body.slice(0, 200)}` : ''}`)
  }
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | null } }[]
  } | null
  const text = data?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('模型未返回可用内容')
  return text
}
