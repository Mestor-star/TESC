/* ============================================================
   lib/castinfer.ts — 在场名册推断（纯函数）

   右栏「在场名册」有两个来源：事件静态名册 \`ev.cast\`、导演每回合给的 \`cast\`
   指令（整份覆盖）。后者一旦把名册写成一个名字，画面就只剩一个人
   （真实案例：v1-5「脏器公寓」只剩小柴）。这一层从**本回合正文**里找证据，
   把名册往回修正一点点 —— 只修正拿得准的那几笔。

   保守优先：**宁可不动，也不许猜错**。所以
     · 只认三种信号（说过话 / 到场 / 离场），且都要有出处片段；
     · 同一句里到场与离场撞车 → 两边都不动；
     · 否定（没有走 / 还没离开）→ 不判离场；
     · 一回合最多动三笔（spoke > arrived > left）；
     · 越界一律丢（id 必须在 \`known\` 里），结果为空回退 \`prev\`。

   这里不碰 React、不碰存储、不改别的模块：输入输出都是普通值。
   ============================================================ */

import { CAST, OPERATOR_PERSON, VOICE_ONLY } from '../data/castmeta'
import { splitSpeech } from './dialogue'
import { nameKey } from './namekey'

export interface InferRosterInput {
  /** 上一回合的名册（world.cast[evId] ?? ev.cast）——顺序基准 */
  prev: readonly string[]
  /** 本段原文名册 ev.cast。只作参考（同强度时排序偏好），**不作唯一依据** */
  canon: readonly string[]
  /** 操作员 id（'operator'），永不移除 */
  operatorId: string
  /** 本回合模型正文（已剥离指令块） */
  text: string
  /** 名录里认识的 id（白名单）：next 里的 id 必须在这里 */
  known: ReadonlySet<string>
}

export interface CastEvidence {
  id: string
  kind: 'spoke' | 'arrived' | 'left'
  /** 出处片段，≤40 字 */
  quote: string
}

export interface InferRosterResult {
  next: string[]
  added: string[]
  removed: string[]
  evidence: CastEvidence[]
}

/** 单回合改动上限（added + removed 合计） */
const MAX_OPS = 3
/** 证据强度：spoke > arrived > left */
const KIND_RANK: Record<CastEvidence['kind'], number> = { spoke: 0, arrived: 1, left: 2 }
/** 出处片段长度上限 */
const QUOTE_MAX = 40
/** 别名最短长度：单字别名会把普通叙述算成名字（与 lib/dialogue.ts 的 SPEAKER_MIN 同口径） */
const ALIAS_MIN = 2

/** 到场动词 */
const ARRIVE_VERBS = [
  '走进', '进来', '赶到', '出现', '推门', '回来',
  '追上来', '落在后面', '跟上来',
] as const

/** 离场动词 */
const LEAVE_VERBS = [
  '离开', '走了', '出去', '退下', '不见了', '转身走', '消失在', '送出门',
] as const

/** 否定词：出现在动词前几个字内就不算数（「还没有离开」的『有』挡不住，所以看窗口而不是紧邻一个字） */
const NEG_WORDS = /[没未不别莫]/
const NEG_LOOKBACK = 3

/**
 * 别名表：登记名 + 别名 → id。名字一律过 \`nameKey\`（全仓唯一那把尺），长词优先。
 * 同一个别名指向两个人 → 整条放弃（宁可漏记，不许记错人），与 terminal 那边的口径一致。
 */
const ALIAS_TABLE: Array<{ key: string; id: string }> = (() => {
  const slots = new Map<string, Set<string>>()
  const add = (id: string, names: readonly string[]) => {
    for (const n of names) {
      const key = nameKey(n ?? '')
      if (key.length < ALIAS_MIN) continue
      const slot = slots.get(key) ?? new Set<string>()
      slot.add(id)
      slots.set(key, slot)
    }
  }
  for (const p of CAST) add(p.id, [p.name, ...p.names])
  for (const p of VOICE_ONLY) add(p.id, [p.name, ...p.names])
  add(OPERATOR_PERSON.id, [OPERATOR_PERSON.name, ...OPERATOR_PERSON.names])
  return [...slots.entries()]
    .filter(([, ids]) => ids.size === 1)
    .map(([key, ids]) => ({ key, id: [...ids][0] }))
    .sort((a, b) => b.key.length - a.key.length)
})()

/** 某 id 的全部别名键（找它在正文里的位置用） */
const KEYS_BY_ID: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>()
  for (const a of ALIAS_TABLE) {
    const list = m.get(a.id) ?? []
    list.push(a.key)
    m.set(a.id, list)
  }
  return m
})()

/** 句子切分：。！？\n（半角标点一并认，模型偶尔写半角） */
const SENTENCE_SPLIT = /[。！？!?\n]+/

/**
 * 这句里有没有这个动词（\`guardNegation\` 时跳过被否定的那些出现）。
 * 逐个出现地查：一句里可能「离开」出现两次、只否定前一次。
 */
function hasVerb(sentence: string, verbs: readonly string[], guardNegation: boolean): boolean {
  for (const v of verbs) {
    let from = sentence.indexOf(v)
    while (from >= 0) {
      if (!guardNegation) return true
      const before = sentence.slice(Math.max(0, from - NEG_LOOKBACK), from)
      if (!NEG_WORDS.test(before)) return true
      from = sentence.indexOf(v, from + 1)
    }
  }
  return false
}

/** 句子 → 句子里出现的登记人（按别名表，一人一条） */
function peopleIn(sentence: string): string[] {
  const ns = nameKey(sentence)
  const hit = new Set<string>()
  for (const a of ALIAS_TABLE) {
    if (ns.includes(a.key)) hit.add(a.id)
  }
  return [...hit]
}

function quoteOf(sentence: string): string {
  return sentence.trim().slice(0, QUOTE_MAX)
}

interface Candidate {
  id: string
  kind: CastEvidence['kind']
  quote: string
  /** 正文里首次出现的位置（排序用） */
  pos: number
  /** 同一位置时的稳定序 */
  seq: number
}

export function inferRoster(input: InferRosterInput): InferRosterResult {
  const prev = Array.isArray(input.prev) ? input.prev.filter((x) => typeof x === 'string' && x) : []
  const canon = new Set(Array.isArray(input.canon) ? input.canon : [])
  const known = input.known ?? new Set<string>()
  const operatorId = input.operatorId || OPERATOR_PERSON.id
  const text = typeof input.text === 'string' ? input.text : ''

  /** 一处边界：不在 known 里的 id 一律不认（含别名表里但名录外的人） */
  const inBounds = (id: string) => known.has(id)

  const segs = splitSpeech(text)
  const normText = nameKey(text)

  /** 正文里首次出现的位置 */
  const posOf = (id: string): number => {
    let best = Number.MAX_SAFE_INTEGER
    for (const key of KEYS_BY_ID.get(id) ?? []) {
      const i = normText.indexOf(key)
      if (i >= 0 && i < best) best = i
    }
    return best
  }

  let seq = 0
  const candidates: Candidate[] = []
  const push = (id: string, kind: CastEvidence['kind'], quote: string, pos?: number) => {
    candidates.push({ id, kind, quote, pos: pos ?? posOf(id), seq: seq++ })
  }

  /* —— ① 发言即在场：最强信号，直接采用 —— */
  const spokeIds = new Set<string>()
  for (const s of segs) {
    if (s.kind !== 'say') continue
    if (!inBounds(s.id)) continue
    if (spokeIds.has(s.id)) continue
    spokeIds.add(s.id)
    push(s.id, 'spoke', s.text.trim().slice(0, QUOTE_MAX))
  }
  /* —— ②③ 到场 / 离场：只看叙述（旁白段），台词行不参与 —— */
  const narr = segs
    .filter((s) => s.kind === 'narr')
    .map((s) => s.text)
    .join('\n')

  /** 本回合「像到场」的人：同回合别处又像离场时不摘（宁可不动） */
  const arrivedIds = new Set<string>()

  for (const raw of narr.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim()
    if (!sentence) continue
    const people = peopleIn(sentence)
    if (!people.length) continue

    const arrived = hasVerb(nameKey(sentence), ARRIVE_VERBS, false)
    const left = hasVerb(nameKey(sentence), LEAVE_VERBS, true)
    // 同一句里既像到场又像离场 → 两边都不动
    if (arrived && left) continue

    for (const id of people) {
      if (!inBounds(id)) continue
      if (arrived) {
        arrivedIds.add(id)
        push(id, 'arrived', quoteOf(sentence))
      } else if (left) push(id, 'left', quoteOf(sentence))
    }
  }

  /* —— 排序：spoke > arrived > left；同强度里 canon 内的优先，再按正文出现位置 —— */
  candidates.sort((a, b) => {
    const k = KIND_RANK[a.kind] - KIND_RANK[b.kind]
    if (k) return k
    const c = Number(canon.has(b.id)) - Number(canon.has(a.id))
    if (c) return c
    if (a.pos !== b.pos) return a.pos - b.pos
    return a.seq - b.seq
  })

  /* —— 按强度截断到 MAX_OPS；一人只留最强的那一笔 —— */
  const added: string[] = []
  const removed: string[] = []
  const evidence: CastEvidence[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    if (added.length + removed.length >= MAX_OPS) break
    if (seen.has(c.id)) continue
    if (c.kind === 'left') {
      // 操作员永不移除；本回合有台词的不移除；同回合另有一句像到场的不移除
      if (c.id === operatorId || spokeIds.has(c.id) || arrivedIds.has(c.id)) continue
      // 已经在名册上的才谈得上「移除」
      if (!prev.includes(c.id)) continue
      removed.push(c.id)
    } else {
      if (prev.includes(c.id)) continue
      added.push(c.id)
    }
    seen.add(c.id)
    evidence.push({ id: c.id, kind: c.kind, quote: c.quote })
  }
  /* —— 组装 next：prev 的相对顺序不变，新加入的按正文出现先后追加 —— */
  const removedSet = new Set(removed)
  const next: string[] = []
  for (const id of prev) {
    if (!id || removedSet.has(id)) continue
    // 越界：不在 known 里的旧名不往后带（操作员除外 —— 永不移除）
    if (!inBounds(id) && id !== operatorId) continue
    if (!next.includes(id)) next.push(id)
  }
  for (const id of added) {
    if (!next.includes(id)) next.push(id)
  }

  /* —— 不许为空：推断结果为空 → 回退 prev —— */
  if (!next.length) {
    for (const id of prev) {
      if (id && (inBounds(id) || id === operatorId) && !next.includes(id)) next.push(id)
    }
  }

  // 被回退掉的那些不该再挂在 removed 里（next 里还有的人不算「移除」）
  const still = new Set(next)
  const finalRemoved = removed.filter((id) => !still.has(id))
  const finalEvidence = evidence.filter(
    (e) => (e.kind === 'left' ? finalRemoved.includes(e.id) : still.has(e.id)),
  )
  return {
    next,
    added: added.filter((id) => still.has(id)),
    removed: finalRemoved,
    evidence: finalEvidence,
  }
}
