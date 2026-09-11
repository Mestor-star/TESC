/* ============================================================
   AI 通联日志
   ------------------------------------------------------------
   每一次向推演通道发问都留一条记录：**发出去的是什么**（通道 / 模型 / 生效预设进了哪几条 /
   世界书命中多少字 / 提示词全文）与**回来的又是什么**（耗时 / 字数 / 终止原因 / 错误）。

   用途只有一个：核对「设置里配的东西到底有没有送到后台 AI」。
   预设套用了却一条没进提示词、世界书一本都没命中、密钥不对被网关挡回来 ——
   这些都属于「界面看着正常、后台其实没起作用」，只有把报文摊开才看得出来。

   存 localStorage（键 zts-ailog:v1），环形缓冲，最多 AILOG_MAX 条；
   提示词截断保存，免得吃光配额 —— 超了丢最老的，不影响这一次生成。
   ============================================================ */

export const AILOG_KEY = 'zts-ailog:v1'
/** 最多留多少条（够回溯最近几轮，又不至于把配额吃掉） */
export const AILOG_MAX = 30
/** 单条提示词的保存上限（字符），超出只留头尾 */
const PROMPT_CAP = 16000
/** 回复保存的开头长度 */
const REPLY_CAP = 400

/** 发问者身份：谁在问、问的是什么 */
export interface AiLogMeta {
  /** 通道：主线剧情 / 角色短信 / 主动来信 */
  channel: string
  /** 这一趟在做什么：推演 / 衔接 / 通读 / 回信 … */
  act?: string
  /** 生效预设（管理预设套用后落下的快照）与**实际注入**的条目名 */
  preset?: { id: string | null; name: string; hits: string[]; prefill?: boolean }
  /** 世界书命中块的字数与词条名 */
  lore?: { chars: number; hits: string[] }
}

export interface AiLogRecord extends AiLogMeta {
  id: string
  ts: number
  model: string
  baseUrl: string
  stream: boolean
  temperature: number
  maxTokens: number
  /** 提示词的条数与总字数 */
  turns: number
  chars: number
  /** 提示词全文（截断保存；头尾都在，中间省略） */
  prompt: string
  ok: boolean
  /** 往返耗时 ms */
  ms: number
  replyChars: number
  replyHead: string
  finishReason?: string
  /** 内部思考通道的字数（思考型模型把预算吃光时，问题就在这儿） */
  reasoningChars?: number
  error?: string
}

type Listener = () => void

const listeners = new Set<Listener>()
let version = 0

export function subscribeAiLog(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 版本号：每次写入 +1。界面既可订阅，也可在渲染时直接比对它 */
export function aiLogVersion(): number {
  return version
}

function notify(): void {
  version += 1
  for (const fn of listeners) {
    try { fn() } catch { /* 订阅者自己的错不该拖垮写日志 */ }
  }
}

function trim(s: string, cap: number): string {
  if (s.length <= cap) return s
  const head = s.slice(0, Math.floor(cap * 0.7))
  const tail = s.slice(-Math.floor(cap * 0.25))
  return `${head}\n…（中略 ${s.length - head.length - tail.length} 字）…\n${tail}`
}

export function listAiLogs(): AiLogRecord[] {
  try {
    const raw = localStorage.getItem(AILOG_KEY)
    const p = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(p) ? (p as AiLogRecord[]) : []
  } catch {
    return []
  }
}

export function clearAiLogs(): void {
  try { localStorage.removeItem(AILOG_KEY) } catch { /* 隐私模式 */ }
  notify()
}

/**
 * 落一条通联记录。**任何情况下都不许抛** ——
 * 日志坏了不能把这一趟生成带下水，所以读写全部吞异常。
 */
export function pushAiLog(rec: Omit<AiLogRecord, 'id' | 'ts'>): void {
  try {
    const full: AiLogRecord = { ...rec, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now() }
    const list = [full, ...listAiLogs()].slice(0, AILOG_MAX)
    localStorage.setItem(AILOG_KEY, JSON.stringify(list))
    notify()
  } catch {
    /* 配额满 / 隐私模式：静默降级，生成照常 */
  }
}

/** 回复留档：只留开头 —— 日志是用来核对「通道答没答、答了多少」的，不替会话存档 */
export function replyHeadOf(text: string): string {
  return text.slice(0, REPLY_CAP)
}

/** 提示词 → 单条记录用的 { 文本, 条数, 字数 } */
export function digestPrompt(messages: { role: string; content: string }[]): { text: string; turns: number; chars: number } {
  const text = messages
    .map((m) => `── ${m.role} ──\n${m.content ?? ''}`)
    .join('\n\n')
  return { text: trim(text, PROMPT_CAP), turns: messages.length, chars: text.length }
}

/** 世界书注入块 → 命中的词条名（块里每条都以「▸ 名字」起头 —— 与预设条目同一个记号） */
export function loreHitsOf(block: string): string[] {
  if (!block) return []
  return block
    .split('\n')
    .filter((l) => l.startsWith('▸ '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean)
}

/** 一条记录留给界面的一行摘要 */
export function logLine(r: AiLogRecord): string {
  const t = new Date(r.ts)
  const p = (n: number) => String(n).padStart(2, '0')
  const when = `${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
  return `${when} · ${r.channel}${r.act ? ` · ${r.act}` : ''} · ${r.model || '未填模型'} · ${r.ok ? `${r.replyChars} 字` : '失败'} · ${r.ms}ms`
}
