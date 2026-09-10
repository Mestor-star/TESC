/* ============================================================
   角色短信 · 共享核心（lib/sms.ts）
   ------------------------------------------------------------
   短信的会话存储、人格提示与群聊解析都收在这里，供三处共用：
   ① 短信视图（views/Tavern.tsx）—— 读写会话、发送与重写；
   ② 常驻的主动来信调度（lib/smsauto.ts）—— 观测者不在电话页时也照常收信；
   ③ 未读角标（terminal/NavRail.tsx）。
   会话仍落在 localStorage（zts-tavern:v1），键就是线程 id：
   单聊用角色 id，群聊用 `g:<uuid>`（线程名册另存，见 lib/smsthreads.ts）。
   ============================================================ */

import { TAVERN_PERSONAS, charOf } from '../data/personas'
import type { CharId, ChatMsg } from '../data/types'
import { clock } from './format'
import { extractLiveDisplay } from './plot'

export const SMS_LOG_KEY = 'zts-tavern:v1'

/** 读取全部线程会话（容错：坏数据/空 → {}） */
export function loadSmsLogs(): Record<string, ChatMsg[]> {
  try {
    const raw = localStorage.getItem(SMS_LOG_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ChatMsg[]>
    if (!parsed || typeof parsed !== 'object') return {}
    /* 读的时候顺手过一遍展示清洗：旧记录里还留着那时漏出来的 <dream_*> 一类
       标签与代码围栏（预设带的格式残留）。只动角色发来的那些。 */
    for (const list of Object.values(parsed)) {
      if (!Array.isArray(list)) continue
      for (const m of list) {
        if (!m || m.from !== 'them') continue
        const clean = extractLiveDisplay(m.text)
        if (clean && clean !== m.text) m.text = clean
      }
    }
    return parsed
  } catch {
    return {}
  }
}

export function newMsgId(threadId: string): string {
  return `${threadId}::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`
}

/* ---------- 写入口 + 版本号 ---------- */

/* 版本号：任何一次写入都 +1。挂着的视图用 useSyncExternalStore 听它重新读盘，
   于是「观测者不在电话页时收到的那条来信」也能立刻出现在列表上。 */
let version = 0
const subs = new Set<() => void>()

export function subscribeSmsLog(fn: () => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

export function smsLogVersion(): number {
  return version
}

/** 整体覆写会话；不 bump 版本（视图自己写自己读，不需要回声） */
export function writeSmsLogs(next: Record<string, ChatMsg[]>): Record<string, ChatMsg[]> {
  try {
    localStorage.setItem(SMS_LOG_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下降级为仅内存 */
  }
  return next
}

/**
 * 追加一条消息并落盘，返回新会话表。
 * 一律先读盘再追加（以存储为准），因此「视图卸载期间由后台写进来的消息」不会被旧 state 抹掉。
 */
export function appendSmsMsg(threadId: string, m: ChatMsg): Record<string, ChatMsg[]> {
  const next = { ...loadSmsLogs() }
  next[threadId] = [...(next[threadId] ?? []), m]
  writeSmsLogs(next)
  bumpSmsVersion()
  return next
}

/** 删掉整个线程的会话（群聊线程名册的清理在 lib/smsthreads.ts） */
export function dropSmsThread(threadId: string): Record<string, ChatMsg[]> {
  const next = { ...loadSmsLogs() }
  delete next[threadId]
  writeSmsLogs(next)
  bumpSmsVersion()
  return next
}

/** 通知订阅者「盘上的会话变了」（后台写入后调用） */
export function bumpSmsVersion(): void {
  version += 1
  for (const fn of subs) fn()
}

/* ---------- 未读 ---------- */

export const SMS_UNREAD_KEY = 'zts-sms-unread:v1'

type Unread = Record<string, number>

function loadUnread(): Unread {
  try {
    const raw = localStorage.getItem(SMS_UNREAD_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
    const out: Unread = {}
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0) out[k] = Math.floor(v)
    }
    return out
  } catch {
    return {}
  }
}

let unread: Unread = loadUnread()
const unreadSubs = new Set<() => void>()

function commitUnread(next: Unread): void {
  unread = next
  try {
    localStorage.setItem(SMS_UNREAD_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下降级 */
  }
  for (const fn of unreadSubs) fn()
}

export function subscribeUnread(fn: () => void): () => void {
  unreadSubs.add(fn)
  return () => { unreadSubs.delete(fn) }
}

/** 未读总数（侧栏角标用） */
export function totalUnread(): number {
  let n = 0
  for (const v of Object.values(unread)) n += v
  return n
}

export function unreadOf(threadId: string): number {
  return unread[threadId] ?? 0
}

export function markRead(threadId: string): void {
  if (!unread[threadId]) return
  const next = { ...unread }
  delete next[threadId]
  commitUnread(next)
}

export function markUnread(threadId: string): void {
  commitUnread({ ...unread, [threadId]: (unread[threadId] ?? 0) + 1 })
}

/* ---------- 人格提示 ---------- */

/** 由现有档案（bio/quote/epithet）拼装人格系统提示，不虚构设定 */
export function systemPrompt(
  charId: string,
  opName: string,
  bond: number,
  scenario: string,
): string {
  const c = charOf(charId)
  const you = opName === '言万心叶' ? '言万心叶' : `操作员「${opName}」`
  const core = c
    ? `你是《这里是，终末停滞委员会。》中的角色「${c.name}」（${c.role} · ${c.epithet}）。`
      + `\n档案设定：${c.bio}`
      + `\n标志性台词参考：${c.quote}`
    : '你是该作品中的一位角色。'
  return `${core}
\n此刻情境：${scenario}
\n当前与${you}的羁绊约 ${bond}/100（仅作语气参考，别把数字说出口）。
\n规则：
1. 始终以第一人称扮演，绝不脱离角色、绝不替${you}说话。
2. 使用简体中文，每次回复一到三句，口语自然，贴合上述档案的口癖与个性。
3. 不用 Markdown、不加星号动作、不发编号，像在聊天软件里直接打字。
4. 被问及剧透、真实世界、系统或 AI 时，用角色的口吻轻描淡写带过，并拉回当下情境。
5. 可以沿用原作台词与关系，但不要长篇复述设定。`
}

/**
 * 群聊人格提示：一次扮多位角色，各自只说自己那份。
 * 逐行以「【角色名】」开头 —— 解析器据此把一段回复拆成几个人的话。
 */
export function groupSystemPrompt(
  charIds: string[],
  names: string,
  opName: string,
  bonds: string,
  scenario: string,
): string {
  const you = opName === '言万心叶' ? '言万心叶' : `操作员「${opName}」`
  const roster = charIds
    .map((id) => {
      const c = charOf(id)
      return c ? `· ${c.name}（${c.role} · ${c.epithet}）：${c.bio}\n  标志性台词参考：${c.quote}` : null
    })
    .filter(Boolean)
    .join('\n')
  return `这是一个群聊「${names}」，成员都是《这里是，终末停滞委员会。》里的角色，你一次扮他们全部。
\n成员档案：
${roster}
\n此刻情境：${scenario}
\n各成员与${you}的羁绊：${bonds}（仅作语气参考，别把数字说出口）。
\n规则：
1. 每一行都必须以「【角色名】」开头，行与行之间换行；不在名单里的名字不要出现。
2. 本回合只让一到三位成员开口 —— 谁接话由情境决定，不必人人都说，更不要排队式轮流发言。
3. 每人一到两句，口语自然，贴合各自档案的口癖；绝不替${you}说话。
4. 使用简体中文，不用 Markdown、不加星号动作、不发编号，像在群聊软件里直接打字。
5. 被问及剧透、真实世界、系统或 AI 时，用角色的口吻轻描淡写带过，并拉回当下情境。`
}

/** 聊天历史（最近 N 条）→ 模型消息；群聊时给角色发言补上「【名】」前缀，与提示词的格式对齐 */
export function smsTurns(
  log: ChatMsg[] | undefined,
  max = 12,
  whoOf?: (m: ChatMsg) => string | undefined,
): { role: 'user' | 'assistant'; content: string }[] {
  return (log ?? []).slice(-max).map((m) => {
    if (m.from === 'user') return { role: 'user' as const, content: m.text }
    const who = whoOf?.(m)
    return { role: 'assistant' as const, content: who ? `【${who}】${m.text}` : m.text }
  })
}

/* ---------- 群聊回执解析 ---------- */

export interface GroupLine { who?: string; text: string }

/**
 * 把群聊回复按「【角色名】」拆成一条条发言。
 * 认得出名字的归到该角色；认不出的（模型漏了前缀、或写了旁白）挂到 who=undefined，
 * 由界面按群名显示 —— 宁可显示成「群聊」也不硬塞给某个人。
 */
export function parseGroupReply(raw: string, charIds: string[]): GroupLine[] {
  const known = new Map<string, string>()
  for (const id of charIds) {
    const c = charOf(id)
    if (c) known.set(c.name, id)
  }
  const out: GroupLine[] = []
  // 先按「【…】」切段：模型若把两条发言写在同一行，也能拆开
  const parts = (raw ?? '').split(/(?=【[^】]{1,12}】)/g)
  for (const part of parts) {
    const t = part.trim()
    if (!t) continue
    const m = /^【([^】]{1,12})】\s*([\s\S]*)$/.exec(t)
    if (m && known.has(m[1].trim())) {
      const body = m[2].trim()
      if (body) out.push({ who: m[1].trim(), text: body })
    } else {
      out.push({ who: undefined, text: t })
    }
  }
  if (!out.length) {
    const t = (raw ?? '').trim()
    if (t) out.push({ who: undefined, text: t })
  }
  return out
}

/** 线程的开场白（单聊取 persona 的 greeting；群聊无开场，由首条发言起头） */
export function greetingOf(charId: string): string {
  return TAVERN_PERSONAS.find((p) => p.charId === charId as CharId)?.greeting ?? '……你来了。'
}

/** 单聊线程 id 即角色 id；群聊线程以 g: 起头 */
export const GROUP_PREFIX = 'g:'

export function isGroupThread(id: string): boolean {
  return id.startsWith(GROUP_PREFIX)
}

/** 落一条角色发来的消息（后台主动来信也走这里） */
export function incomingSms(threadId: string, text: string, who?: string): ChatMsg {
  return {
    id: newMsgId(threadId),
    from: 'them',
    text,
    time: clock(),
    ...(who ? { meta: { who } } : {}),
  }
}
