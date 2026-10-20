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

   出去与回来的每一趟都在这里留一份记录（见 lib/ailog.ts）：
   调用方传 opts.meta 说明「谁在问、问什么、生效预设进了哪几条」，
   成功与失败都落一条，终端设置里的「通联日志」据此核对后台 AI 到底吃到了什么。
   ============================================================ */

import { digestPrompt, pushAiLog, replyHeadOf } from './ailog'
import { DEFAULT_BUDGET } from './budget'
import type { AiLogMeta } from './ailog'

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
  maxTokens: DEFAULT_BUDGET,
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
  /** 通联日志用的身份：谁在问、问什么、预设与世界书各进了多少（见 lib/ailog.ts） */
  meta?: AiLogMeta
  /**
   * 这一趟的收尾读数（**非流式也给**）—— 只读，不改变返回值，也不吞错。
   *
   * 给「正文被长度掐断」这一类判断用：`finishReason === 'length'` 的意思不是
   * 「写完了」，是**写到一半被输出上限掐了**。从前只有流式那一支记得下它，
   * 于是非流式那几条路（比如交战成文）拿到的半截正文与一整篇长得一模一样 ——
   * 端上桌谁也不知道那是断的（主人 2026-09-15 撞见的那一次）。
   */
  onFinish?: (r: { finishReason?: string; text: string }) => void
}

/** 一趟请求的结局：成了给正文，没成给原因 */
export type AiOutcome =
  | { ok: true; text: string; finishReason?: string; reasoning?: string }
  | { ok: false; error: string }

/** 一趟请求的收尾记账（成功失败都记；记账本身绝不抛） */
function settle(
  cfg: ApiSettings,
  messages: ChatTurn[],
  meta: AiLogMeta | undefined,
  stream: boolean,
  t0: number,
  temperature: number,
  maxTokens: number,
  r: AiOutcome,
): void {
  const d = digestPrompt(messages)
  pushAiLog({
    channel: meta?.channel ?? '未标注',
    act: meta?.act,
    preset: meta?.preset,
    lore: meta?.lore,
    model: cfg.model.trim(),
    baseUrl: cfg.baseUrl.trim(),
    stream,
    temperature,
    maxTokens,
    turns: d.turns,
    chars: d.chars,
    prompt: d.text,
    ok: r.ok,
    ms: Date.now() - t0,
    replyChars: r.ok ? r.text.length : 0,
    replyHead: r.ok ? replyHeadOf(r.text) : '',
    finishReason: r.ok ? r.finishReason : undefined,
    reasoningChars: r.ok && r.reasoning ? r.reasoning.length : undefined,
    error: r.ok ? undefined : r.error,
  })
}

/* ============================================================
   失败路径的归一（全是给人读的）
   ------------------------------------------------------------
   上游回来的失败形状千奇百怪：JSON 里一句 `error.message`、nginx 的整页
   HTML、一段纯文本、空包、连接直接断。原样塞进界面就是
   「推演中断：Failed to fetch」那样 —— 看得见，读不懂。
   这里只做两件事：① 状态码翻成人话，正文只留能读的那一截（HTML 去标签、
   压空白、截断）；② fetch 那一层的网络异常换一句有出路的说法。
   注意：**AbortError 一律原样放行** —— 那是操作员按的停止，不是失败。
   ============================================================ */

/** 这一趟是不是操作员主动中断（调用方按名字认，别把它折成错误） */
function isAbortError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as Error).name === 'AbortError'
}

/** 正文里能读的那一截：JSON 取 error.message；HTML 去标签；纯文本压空白；都截到 120 字 */
function readableBody(body: string): string {
  const raw = (body ?? '').trim()
  if (!raw) return ''
  try {
    const j = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown }
    const m = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message)
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 120)
  } catch { /* 不是 JSON —— 往下走纯文本那一路 */ }
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.slice(0, 120)
}

/** 非 2xx 的一句话说明：状态码先说清是哪一类，再附上游自己的那句话 */
function httpReason(status: number, body: string): string {
  const hint =
    status === 401 ? '密钥被拒（未授权）'
      : status === 403 ? '密钥没有这个模型的权限'
        : status === 404 ? '接口地址不对（找不到 /chat/completions）'
          : status === 429 ? '请求太密被限流，稍等再试'
            : status >= 500 ? '通道自己出错了'
              : status >= 400 ? '请求被通道拒绝'
                : '通道返回了异常状态'
  const detail = readableBody(body)
  return `HTTP ${status} · ${hint}${detail ? `：${detail}` : ''}`
}

/** 连不上 / 传到一半断了 —— 换一句有出路的说法。
    浏览器那几句原文（Failed to fetch / network error / Load failed）一个字也读不出
    所以然，塞给主人只是噪音；真正有信息量的（比如代理报的那句）才原样附上。 */
function netReason(e: unknown, what: string): Error {
  const raw = (e instanceof Error ? e.message : String(e)).trim()
  const opaque = !raw || /failed to fetch|network ?error|load failed|fetch failed|terminated/i.test(raw)
  return new Error(`${what}${opaque ? '' : `（${raw}）`} —— 检查网络、接口地址与本地代理后重试`)
}

/** fetch 那一层：网络异常换成可读说法；中断原样放行 */
function netErr(e: unknown, what: string): never {
  if (isAbortError(e)) throw e
  throw netReason(e, what)
}

/** 调起一次 OpenAI 兼容的 chat/completions */
export async function chatCompletion(
  cfg: ApiSettings,
  messages: ChatTurn[],
  opts?: ChatOpts,
): Promise<string> {
  const t0 = Date.now()
  const temperature = opts?.temperature ?? cfg.temperature
  const maxTokens = opts?.maxTokens ?? 640
  const done = (r: Parameters<typeof settle>[7]) =>
    settle(cfg, messages, opts?.meta, false, t0, temperature, maxTokens, r)
  try {
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
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    }).catch((e: unknown) => netErr(e, '连不上推演通道'))
    if (!res.ok) throw new Error(httpReason(res.status, await res.text().catch(() => '')))
    /* 先读正文再解析：空包与「回了个网页」是两种事，界面上该分得开 */
    const body = await res.text().catch(() => '')
    type ChatBody = {
      choices?: {
        message?: { content?: string | null; reasoning_content?: string | null }
        finish_reason?: unknown
      }[]
    }
    let data: ChatBody | null = null
    try {
      data = body.trim() ? (JSON.parse(body) as ChatBody) : null
    } catch {
      data = null
    }
    if (!data) {
      const head = readableBody(body)
      throw new Error(
        body.trim()
          ? `通道的回包不是 JSON（HTTP 200）：${head || '正文无法解析'}`
          : '通道返回了空包（HTTP 200，正文 0 字节）',
      )
    }
    const text = data?.choices?.[0]?.message?.content?.trim() ?? ''
    /* 收尾读数先报出去（正文空不空都报）：空的那一路下面会抛，
       而「为什么空」的答案常常就写在这儿（length = 预算被思考吃光了）。 */
    const fr = typeof data?.choices?.[0]?.finish_reason === 'string'
      ? (data.choices[0].finish_reason as string)
      : undefined
    opts?.onFinish?.({ finishReason: fr, text })
    if (!text) {
      const thought = data?.choices?.[0]?.message?.reasoning_content?.trim() ?? ''
      throw new Error(
        thought
          ? `通道只产出了内部思考、未输出正文（思考约 ${thought.length} 字，可能触发了长度上限）。可调高该通道的输出预算后重试。`
          : '通道未返回可用内容',
      )
    }
    // finishReason 一并进通联日志：非流式从前只记 ok，掐断与写完在日志里看不出差别
    done({ ok: true, text, finishReason: fr })
    return text
  } catch (e) {
    done({ ok: false, error: e instanceof Error ? e.message : String(e) })
    throw e
  }
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
  const t0 = Date.now()
  const temperature = opts?.temperature ?? cfg.temperature
  const maxTokens = opts?.maxTokens ?? 640
  const done = (r: AiOutcome) =>
    settle(cfg, messages, opts?.meta, true, t0, temperature, maxTokens, r)
  try {
    const out = await streamBody(cfg, messages, opts, temperature, maxTokens)
    done({ ok: true, text: out.text, finishReason: out.finishReason, reasoning: out.reasoning })
    return out
  } catch (e) {
    done({ ok: false, error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

/** 发流式请求并逐行读回（chatCompletionStream 的本体，含全部 await 与解析） */
async function streamBody(
  cfg: ApiSettings,
  messages: ChatTurn[],
  opts: StreamOpts | undefined,
  temperature: number,
  maxTokens: number,
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
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  }).catch((e: unknown) => netErr(e, '连不上推演通道'))
  if (!res.ok) throw new Error(httpReason(res.status, await res.text().catch(() => '')))
  if (!res.body) throw new Error('当前环境不支持流式读取')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const out: StreamResult = { text: '' }
  let buf = ''
  /** 有没有真的收到过 SSE 事件行 —— 没有就是「回了 200，但不是流」 */
  let sawEvent = false

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) return
    sawEvent = true
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
    /* 流读到一半断掉（网关超时、代理掐线、断网）抛的是 TypeError，
       而这里只认 AbortError 是「操作员按的停止」；别的都换成一句可读的话，
       好让上层把已经收到的半段正文保住、把原因说清楚。 */
    const { done, value } = await reader
      .read()
      .catch((e: unknown) => netErr(e, '流式回包中途断开'))
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
  /* 一条 data: 都没收到 = 回的是 200 却不是流（中继把 stream:true 吞了、
     塞回来一个整包 JSON 或一张网页）。这跟「流发完但正文为空」是两种事，
     对应的出路也不同（关掉流式再试），所以在这儿分开报。 */
  if (!sawEvent) {
    throw new Error('通道没有回可读的流式内容（HTTP 200，但正文里一条 data: 都没有）：多半是这个中继不支持 stream，可在终端设置里关掉该通道的「流式生成」后重试')
  }
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
    .catch((e: unknown) => netErr(e, '连不上推演通道的模型列表'))
  if (!res.ok) throw new Error(httpReason(res.status, await res.text().catch(() => '')))
  const data = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
  const ids = (data?.data ?? [])
    .map((m) => m.id)
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .map((x) => x.trim())
  return ids
}
