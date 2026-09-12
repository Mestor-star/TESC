/* ============================================================
   正文 ↔ 短信 互读
   ------------------------------------------------------------
   两条通道各记各的账：
     正文写在 `zts-plot:v1`（按事件分段），短信写在 `zts-tavern:v1`（按线程分册）。
   在此之前两边互不相识 —— 人在短信里说定了一场见面，正文里那个人照旧当他
   没提过；正文里刚走过的那一段，短信里她一开口还是「今天怎么样」。
   这里补的就是互读：一边各取「与此刻这个人有关」的那一小截，交给另一边当
   延续性背景 —— 与 lib/battle/narrate.ts 的近期作战记录同一路数（都只作背景，
   不许逐条复述）。

   过滤是这条功能的**主体**，不是装饰：两本账里都夹着大量与眼前这个人无关的
   往来，一律不喂。正文那一侧按事件的在场名册筛（lib/cast.ts 的 castOf）；
   短信这一侧按线程归属筛（单聊是本人、见面线程看它挂在谁名下、群聊看成员里
   有没有在场者）。

   两边都只取**已经写下来的**：已收束段落的 digest、当前这一段正文里已写下的
   那几轮、已经发出去了的短信、以及已经说定的那一场见面。尚未发生的走向一律
   不给 —— 这条功能接通的是两条通道，不是给模型开一扇偷看结局的窗。

   一路单向缺口（刻意留的）：**群聊不接正文**。正文能读群聊（成员里有人在场
   就算「有关」，标成「群聊『某某群』」照原话摆出来）；反过来不喂 —— 群聊的
   「有关」无从按一个人判起，按成员逐个摊开只会把几份『与他有关的既成事实』
   堆在同一段提示里。调用点见 views/Tavern.tsx 的 fireGroup。
   ============================================================ */

import { TIMELINE } from '../data/timeline'
import { castOf, castName } from './cast'
import { PLOT_KEY } from './slots'
import { SMS_LOG_KEY, isGroupThread } from './sms'
import { listGroups } from './smsthreads'
import { isDateThread, listRendezvous } from './rendezvous'
import type { ChatMsg, TimelineEvent, WorldRecord } from '../data/types'

/** 一条底账上的话最多摊多少字 —— 这是背景，不是正文，别把上下文喂成第二份剧本 */
const CLIP = 90

function clip(s: string, n = CLIP): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 读一本会话账（两本账同一个形状：键 → 消息组）。读不动就当空 —— 隐私模式不该炸掉推演 */
function readLogs(key: string): Record<string, ChatMsg[]> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const p = JSON.parse(raw) as Record<string, ChatMsg[]>
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

/** 这个人在不在这一段的现场（正文那一侧的筛子） */
function onStage(ev: TimelineEvent | undefined, charId: string): boolean {
  return !!ev && castOf(ev).includes(charId)
}

/* ============================================================
   正文 → 短信
   ============================================================ */

export interface PlotLinkOpts {
  /** 已收束事件的账（world.records）：收束摘要从它取 */
  records?: WorldRecord[]
  /** 走完各段的进度（终端态里的 epDone）：由此定位「此刻指针停在哪一段」 */
  epDone?: Record<string, boolean>
  /** 已收束的段落最多列几段（按阅读序取最近的那几段） */
  maxEvents?: number
  /** 眼下这一段最多引几轮 */
  maxTurns?: number
}

/**
 * 正文里**与他有关**的那一截：已收束各段的收束摘要（只取他在场的），
 * 加上眼下这一段正文里已经写下来的那几轮。
 *
 * 他不在场的那几段一句都不给 —— 短信里的人不该知道她没在场的事。
 * 返回空串表示无可注入内容（调用方据此整节不出现）。
 */
export function plotContextFor(charId: string, opts: PlotLinkOpts = {}): string {
  const maxEvents = opts.maxEvents ?? 3
  const maxTurns = opts.maxTurns ?? 3
  const byId = new Map(TIMELINE.map((e) => [e.id, e]))
  const seqOf = (id: string) => TIMELINE.findIndex((e) => e.id === id)

  /* ① 已收束的段落 —— 按阅读序切片，只留他在场的 */
  const done = (opts.records ?? [])
    .filter((r) => onStage(byId.get(r.eventId), charId))
    .sort((a, b) => seqOf(a.eventId) - seqOf(b.eventId))
    .slice(-maxEvents)
  const rows = done.map((r) => {
    const ev = byId.get(r.eventId) as TimelineEvent
    const dig = clip(r.digest) || clip(ev.summary)
    return `· 《${ev.title}》（${ev.place}）已经走过：${dig}`
  })

  /* ② 眼下这一段 —— 正文里已经写下的那几轮（指令块在写入前已剥离）。
     指针的定位与 views/Plot.tsx 的 focusEv 同一口径：时间线上第一段还没走完的。
     那一段若一条正文都还没写下来，下面自然为空 —— 不必另判「开没开过头」。 */
  const curEv = opts.epDone ? TIMELINE.find((e) => !opts.epDone?.[e.id]) : undefined
  const live: string[] = []
  if (curEv && onStage(curEv, charId)) {
    for (const m of (readLogs(PLOT_KEY)[curEv.id] ?? []).slice(-maxTurns)) {
      const t = clip(m.text)
      if (!t) continue
      live.push(m.from === 'user' ? `  · 他：${t}` : `  · 现场：${t}`)
    }
  }

  if (!rows.length && !live.length) return ''
  const lines = [
    '【近期正文 · 与他有关的既成事实（只作延续性背景，勿逐条复述，也别当作他此刻正在做的事）】',
    ...rows,
  ]
  if (live.length && curEv) {
    lines.push(`眼下这一段《${curEv.title}》里已经写下的：`, ...live)
  }
  return lines.join('\n')
}

/* ============================================================
   短信 → 正文
   ============================================================ */

export interface SmsLinkOpts {
  /** 每个线程最多引几条 */
  maxPer?: number
  /** 一共最多引几个线程 */
  maxThreads?: number
  /** 要不要把「已经说定、还没走完」的那一场见面一并交出去（正文侧要 · 短信侧不必） */
  rendezvous?: boolean
}

/**
 * 短信里**与这些在场者有关**的那一截：各线程最近几条往来，逐条照原话摆出来
 * （不转述 —— 转述就会替她把话说成另一种样子）。
 *
 * 线程归属这样判：
 *   · 单聊 —— 线程 id 就是角色 id，只取在场者的那几本；
 *   · 见面 —— `d:<uuid>` 看它挂在谁名下（lib/rendezvous.ts）；
 *   · 群聊 —— `g:<uuid>` 看成员里有没有在场者，有就是「有关」。
 * 与在场者全都无关的那几本一个字都不给。返回空串表示无可注入内容。
 */
export function smsContextFor(charIds: string[], opts: SmsLinkOpts = {}): string {
  const maxPer = opts.maxPer ?? 4
  const maxThreads = opts.maxThreads ?? 3
  const want = new Set(charIds)
  if (!want.size) return ''

  const logs = readLogs(SMS_LOG_KEY)
  const groups = new Map(listGroups().map((g) => [g.id, g]))
  const rvById = new Map(listRendezvous().map((r) => [r.id, r]))

  const threads: { who: string; msgs: ChatMsg[]; last: string }[] = []
  for (const [key, msgs] of Object.entries(logs)) {
    if (!msgs?.length) continue
    let who = ''
    if (isDateThread(key)) {
      const rv = rvById.get(key)
      if (!rv || !want.has(rv.charId)) continue
      who = `与${castName(rv.charId)}${rv.title ? `（见面「${rv.title}」）` : '（见面）'}`
    } else if (isGroupThread(key)) {
      const g = groups.get(key)
      if (!g || !g.charIds.some((id) => want.has(id))) continue
      who = `群聊「${g.name}」`
    } else {
      if (!want.has(key)) continue
      who = `与${castName(key)}`
    }
    const tail = msgs.slice(-maxPer)
    threads.push({ who, msgs: tail, last: tail[tail.length - 1]?.time ?? '' })
  }
  /* 按最后一条的时刻倒排。时刻是「HH:MM」这种钟点字串：同一日内准，
     跨了日只是顺序先后有别 —— 顺序不影响喂进去的内容，故不另做日期换算。 */
  threads.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))

  const picked = threads.slice(0, maxThreads)
  const rows: string[] = []
  for (const t of picked) {
    rows.push(`· ${t.who}（最后 ${t.msgs.length} 条）：`)
    for (const m of t.msgs) {
      const text = clip(m.text)
      if (!text) continue
      const who = m.from === 'user' ? '他' : (m.meta?.who || '对方')
      rows.push(`    ${who}：${text}`)
    }
  }

  /* 已经说定、还没走完的那一场见面：那是「两人之间已经成立的事」，
     正文里该知道它悬着 —— 但只交出这件事本身，不替它安排什么时候兑现。 */
  if (opts.rendezvous) {
    for (const rv of listRendezvous()) {
      if (rv.done || !want.has(rv.charId)) continue
      rows.push(`· 已经说定、还没走完的一场见面：与${castName(rv.charId)}`
        + `${rv.title ? `「${rv.title}」` : ''}${rv.place ? `（${rv.place}）` : ''}`
        + ` —— ${rv.from === 'them' ? '她' : '他'}先开的口，见面本身尚未发生。`)
    }
  }

  if (!rows.length) return ''
  return ['【近期短信 · 与此处在场者有关的往来（已发生的事实，只作延续性背景，勿逐条复述）】', ...rows].join('\n')
}
