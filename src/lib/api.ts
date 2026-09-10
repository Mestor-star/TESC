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
  /** 单回合最大输出 token（max_tokens）。思考型模型（DeepSeek reasoner 等经中继）
   *  会把预算先耗在内部思考上，正文可能被饿死 —— 值偏小就会出现“达长度上限但正文为空”。 */
  maxTokens: number
  /** 流式生成（SSE，逐字上屏）。对应酒馆预设的 stream_openai。
   *  缺省视为开启；部分中转网关不支持 SSE，关掉即回退整段接收。 */
  stream: boolean
}

export const API_DEFAULTS: ApiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  temperature: 0.8,
  maxTokens: 1500,
  stream: true,
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
      reject(new Error('本终端不支持本地存储区'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('本地存储区打开失败'))
  })
  return dbPromise
}

async function kvGet(key: string): Promise<unknown> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly')
    const req = tx.objectStore('kv').get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('读取本地存储区失败'))
  })
}

async function kvSet(key: string, val: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(val, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('写入本地存储区失败'))
  })
}

async function kvDel(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('删除本地存储区失败'))
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
  if (!base) throw new Error('推演通道未填接口地址')
  if (!cfg.model.trim()) throw new Error('推演通道未填模型名称')
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
    choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[]
  } | null
  const text = data?.choices?.[0]?.message?.content?.trim()
  if (!text) {
    const thought = data?.choices?.[0]?.message?.reasoning_content?.trim() ?? ''
    throw new Error(
      thought
        ? `通道只产出了内部思考、未输出正文（思考约 ${thought.length} 字，可能触发了长度上限）。可调高该通道的输出预算后重试。`
        : '通道未返回可用内容',
    )
  }
  return text
}

/* ============================================================
   SSE 流式（stream:true）
   ------------------------------------------------------------
   自写 reader 逐行解析 `data:` 事件：累积 delta.content → text；
   遇 finish_reason 记录（stop / length 等）；遇 [DONE] 收尾。
   refusal / model 一并透出供诊断。中止（signal）时 reader.read()
   抛 AbortError 向上传播，由调用方决定是否保留已生成的部分。
   ============================================================ */

export interface StreamResult {
  /** 累积拼接后的完整正文（与流中 onDelta 片段之和一致） */
  text: string
  /** 终止原因：stop / length …（网关给到才有） */
  finishReason?: string
  /** 模型侧拒答理由（OpenAI 兼容 refusal 字段） */
  refusal?: string
  /** 回包里的模型名（部分网关回显） */
  model?: string
  /** 内部思考原文（delta.reasoning_content；DeepSeek 系等思考型模型的独立通道，
   *  不计入正文也不上屏）。可用于诊断“预算被思考吃光、正文为空”。 */
  reasoning?: string
}

export interface StreamOpts extends ChatOpts {
  /** 每收到一段 delta.content 时回调（追加显示用，仅做无副作用投影） */
  onDelta?: (delta: string) => void
}

/** OpenAI 兼容 chat/completions 的流式版 */
export async function chatCompletionStream(
  cfg: ApiSettings,
  messages: ChatTurn[],
  opts?: StreamOpts,
): Promise<StreamResult> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('推演通道未填接口地址')
  if (!cfg.model.trim()) throw new Error('推演通道未填模型名称')
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
      stream: true,
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
  if (!res.body) throw new Error('当前环境不支持流式读取')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const out: StreamResult = { text: '' }
  let buf = ''

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') return true
    let j: { model?: unknown; choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; refusal?: unknown }; finish_reason?: unknown; refusal?: unknown }> }
    try {
      j = JSON.parse(payload) as typeof j
    } catch {
      return false
    }
    if (typeof j.model === 'string') out.model = j.model
    const choice = j.choices?.[0]
    if (!choice) return false
    if (typeof choice.finish_reason === 'string') out.finishReason = choice.finish_reason
    if (typeof choice.refusal === 'string') out.refusal = choice.refusal
    const d = choice.delta
    if (d) {
      if (typeof d.refusal === 'string') out.refusal = d.refusal
      // 思考通道单独累积（不触发 onDelta，避免思考被误当正文上屏）
      if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
        out.reasoning = (out.reasoning ?? '') + d.reasoning_content
      }
      if (typeof d.content === 'string' && d.content) {
        out.text += d.content
        opts?.onDelta?.(d.content)
      }
    }
    return false
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (handleLine(line)) return out
    }
  }
  if (buf.trim()) handleLine(buf)
  return out
}

/**
 * 拉取网关可用模型列表（OpenAI 兼容 GET {base}/models）。
 * 返回 data[].id 数组（空串滤除）；非 2xx 抛带响应正文的 Error，供设置页行内展示。
 */
export async function listModels(cfg: ApiSettings, opts?: { signal?: AbortSignal }): Promise<string[]> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('推演通道未填接口地址')
  const headers: Record<string, string> = {}
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`
  const res = await fetch(`${base}/models`, { method: 'GET', headers, signal: opts?.signal })
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
  const data = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
  const ids = (data?.data ?? [])
    .map((m) => m.id)
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .map((x) => x.trim())
  return ids
}
