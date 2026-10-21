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

import { charOf, profileLinesOf, voiceLinesOf } from '../data/personas'
import { INTIMATE_BOND } from '../data/intimate'
import type { ChatMsg, ChatMsgMeta } from '../data/types'
import { clock } from './format'
import { nameKey } from './namekey'
import { extractLiveDisplay } from './plot'
import { BOTTOM_RULES } from './worldrules'
import { ANTI_AI_STYLE_SHORT } from './writing-rules'

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

/**
 * 按**更新函数**改写某一线程并落盘（读盘 → 改 → 写 → **回声**）。
 *
 * 与 appendSmsMsg 只差入参形状（那一条收一整条消息，这一条收 `prev => next`），
 * 与下面的 writeSmsLogs 差在**回不回这一声**。这一条是给「自己不存一份镜像、
 * 直接读盘」的视图用的 —— 约会专线（components/DateLane.tsx）就是这样：
 * 它的会话流从 `loadSmsLogs()` 现读，靠 `smsLogVersion` 这个版本号驱动重算。
 *
 * ⚠️ 少了 `bumpSmsVersion()` 那一声，症状是「**写进去了、盘上有、屏上没有**」：
 * 视图那头版本号没动，重算就不会发生，刚落地的一条当场看不见 ——
 * 要等这一路卸载重开（或别处写一次）才从盘上读回来。
 * 短信页自己有 state 镜像（写完当场 `setLogs`），所以它继续走不回声明的那一条。
 */
export function appendSmsMsgs(
  threadId: string, up: (prev: ChatMsg[]) => ChatMsg[],
): Record<string, ChatMsg[]> {
  const next = { ...loadSmsLogs() }
  next[threadId] = up(next[threadId] ?? [])
  writeSmsLogs(next)
  bumpSmsVersion()
  return next
}

/**
 * **改一条**的通用骨架：读盘 → 就地改 → 写盘 → **回声**，与 appendSmsMsgs 同一套口径。
 *
 * 与 appendSmsMsgs 的差别只在「改哪一段」由调用方给：`up` 收到这一线程的账，
 * 交回新的一份；交回 `null` = **没认领到那一条**（id 不在账上），此时**盘上不动、
 * 也不回声** —— 宁可什么都没发生，也不要凭一个失效的 id 把整本账重写一遍。
 *
 * 落盘失败（隐私模式 / 配额满）由 writeSmsLogs 照旧静默吞掉：与 appendSmsMsgs
 * 完全同一条路，这一层不另立规矩。**回声照发** —— 那一声才是「盘上变了，
 * 挂着的人重读」的信号（约会专线就是这么吃账的，见文件头那一节）。
 */
function editSmsThread(
  threadId: string, up: (list: ChatMsg[]) => ChatMsg[] | null,
): boolean {
  const all = loadSmsLogs()
  const next = up(all[threadId] ?? [])
  if (!next) return false
  writeSmsLogs({ ...all, [threadId]: next })
  bumpSmsVersion()
  return true
}

/**
 * 换掉某一线程里**那一条**的文本（可选打 `meta.edited` 记号 → 界面显一枚「手改」）。
 *
 * 规矩（与主线 `Plot.tsx` 的 retextMsg 同一条）：**只换这一条的文字** ——
 * 不增删、不改序号、不重跑指令、不重新生成。要重推请先 truncateSmsAfter 再发一次。
 * 旧档没有 `meta` 时照常工作（现补一格）；找不到那一条 → 返回 false，盘上不动。
 */
export function retextSmsMsg(
  threadId: string, msgId: string, text: string, edited?: boolean,
): boolean {
  return editSmsThread(threadId, (list) => {
    let hit = false
    const next = list.map((m) => {
      /* 坏行（旧档里混进来的 null / 非对象）原样放过：逐条跳过，不为一条脏数据
         把整本账弄崩 —— 与 loadSmsLogs 的容错口径一致。 */
      if (!m || m.id !== msgId) return m
      hit = true
      if (!edited) return { ...m, text }
      const meta = { ...(m.meta ?? {}) } as ChatMsgMeta & { edited?: boolean }
      meta.edited = true
      return { ...m, text, meta }
    })
    return hit ? next : null
  })
}

/**
 * 截断到某一条（**含**它），其后全删 —— 给「改口重来」用。
 *
 * 保留的那一条原样留着（文字自己先用 retextSmsMsg 换好）：两句各管一件事，
 * 谁先谁后都读得懂，合在一起就分不清「截断」到底动不动文字了。
 * 找不到那一条 → 返回 false，一条都不删。
 */
export function truncateSmsAfter(threadId: string, msgId: string): boolean {
  return editSmsThread(threadId, (list) => {
    const at = list.findIndex((m) => !!m && m.id === msgId)
    if (at < 0) return null
    return list.slice(0, at + 1)
  })
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

/**
 * 人格系统提示：**分层人物卡优先**（data/personas.ts 的 profileLinesOf），
 * 没登记卡面的角色回退平铺档案。两条路都只写已入库的原文，不虚构设定。
 *
 * `plotContext` 是正文那一侧已经发生过、**且与她有关**的那一截（由
 * lib/crosslink.ts 的 `plotContextFor` 生成；她不在场的事一句都不给）。
 * 与「此刻情境」（data/personas 里写死的日常场景）不是一回事：那个是常驻布景，
 * 这个是**一路推下来真发生的事** —— 有了它，信里才接得上正文里刚走过的那一段。
 */
export function systemPrompt(
  charId: string,
  opName: string,
  bond: number,
  scenario: string,
  plotContext?: string,
): string {
  const c = charOf(charId)
  const you = opName === '言万心叶' ? '言万心叶' : `操作员「${opName}」`
  const card = profileLinesOf(charId)
  const core = c
    ? `你是《这里是，终末停滞委员会。》中的角色「${c.name}」（${c.role}）。`
      + (card.length ? `\n人物卡：\n${card.join('\n')}` : '')
    : '你是该作品中的一位角色。'
  /* 羁绊过了 INTIMATE_BOND：才允许聊到私人的那一层，也才约得动人。
     这一段只写「她可以说什么」—— 具体到哪里、到哪一步，由这一场的气氛与对方的回应决定，
     所以措辞上把主动权交回给对方，不写成一份推进清单。 */
  const intimate = bond >= INTIMATE_BOND
  return `${core}
\n此刻情境：${scenario}${plotContext ? `\n\n${plotContext}` : ''}
\n当前与${you}的羁绊约 ${bond}/100（仅作语气参考，别把数字说出口）。
\n规则：
1. 始终以第一人称扮演，绝不脱离角色、绝不替${you}说话。
2. 使用简体中文，每次回复一到三句，口语自然，贴合人物卡里〔说话方式〕〔性格〕那几节的口癖与个性。
3. 不用 Markdown、不加星号动作、不发编号，像在聊天软件里直接打字。
4. 被问及剧透、真实世界、系统或 AI 时，用角色的口吻轻描淡写带过，并拉回当下情境。
5. 可以沿用原作台词与关系，但不要长篇复述设定。
${BOTTOM_RULES}${intimate ? `
6. 你们的关系已经走到很近的地方：**她可以说些不对外人说的话** ——
   私人的事、在意过的什么、身体或心事上的困扰、想见你、想单独待一会儿。
   这些话要顺着两个人的交情**自然**地露出来，不必每句都往那儿靠，也不要一次说完；
   对方问起时坦然接住，对方没那层意思时不硬拐过去。
7. 她可以**直接开口约**（或答应对方的约）。约成了由她在末尾给出 date 字段（见下），
   见面时的推进不在信里发生 —— 信里只到「说定了」为止。` : ''}

${ANTI_AI_STYLE_SHORT}`
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
      if (!c) return null
      /* 群聊里每人只带「怎么说话」的一半卡面（voiceLinesOf）——
         二十几张整卡一字排开，群聊那点情境会被压得看不见。 */
      const voice = voiceLinesOf(id).map((l) => `  ${l}`).join('\n')
      return `· ${c.name}（${c.role}）${voice ? `\n${voice}` : ''}`
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
3. 每人一到两句，口语自然，贴合各自人物卡的口癖；绝不替${you}说话。
4. 使用简体中文，不用 Markdown、不加星号动作、不发编号，像在群聊软件里直接打字。
5. 被问及剧透、真实世界、系统或 AI 时，用角色的口吻轻描淡写带过，并拉回当下情境。
${BOTTOM_RULES}

${ANTI_AI_STYLE_SHORT}`
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
  /* 建表与查表共用 lib/namekey.ts 那把尺：回执里的名字与档案全名的中点写法常不一致
     （U+00B7 / U+2027 / U+30FB / U+FF65），精确相等会把整条发言认成旁白。
     表里存**比较键 → charId**，往外传的仍是回执原文的写法。 */
  const known = new Map<string, string>()
  for (const id of charIds) {
    const c = charOf(id)
    if (c) known.set(nameKey(c.name), id)
  }
  const out: GroupLine[] = []
  // 先按「【…】」切段：模型若把两条发言写在同一行，也能拆开
  const parts = (raw ?? '').split(/(?=【[^】]{1,12}】)/g)
  for (const part of parts) {
    const t = part.trim()
    if (!t) continue
    const m = /^【([^】]{1,12})】\s*([\s\S]*)$/.exec(t)
    if (m && known.has(nameKey(m[1]))) {
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

/* 这里原先有一个 greetingOf()：新线程落一句 persona 的 greeting 垫底。
   现在线程**初始没有消息** —— 谁先开口是玩家自己的事。
   persona 上的 greeting 留着（撰写风格样本、也是那几句来讯的出处），只是不再自动发出去。 */

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
