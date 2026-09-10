/* ============================================================
   世界书 · 扫描闸门 + 上下文拼块
   ------------------------------------------------------------
   反剧透的「单点闸门」就在本文件：把命中词条在格式化成块
   **之前**按 gate 过滤。词条的 meta 标注约定：
     meta.eventId —— 词条是一段「事件回顾」，只放行已完成事件，
                     （Plot 侧另放行「当前焦点事件」自身）。
     meta.codexId —— 词条是「实体图鉴」，只放行已登记（遭遇过）的实体。
   seed 由 src/lib/loreseed.ts 打好这两类标注；用户自建/导入的词条
   不带 meta → gate 恒放行（关键词命中即注入）。
   ============================================================ */

import type { Lorebook, LorebookEntry } from './tavernlike/types'
import { LorebookEngine } from './tavernlike/lorebook-engine'

/** 一条命中是否放行进入上下文（由调用方按世界状态构造） */
export type LoreGate = (entry: LorebookEntry) => boolean

export interface LoreWorldRefs {
  epDone: Record<string, true>
  ends: Record<string, true>
}

/** Plot（剧情推进）闸门：事件回顾放行「已完成或正是当前焦点」；实体图鉴放行「已登记」。 */
export function allowGateFor(world: LoreWorldRefs, focusEventId: string): LoreGate {
  return (entry) => {
    const ev = entry.meta?.eventId
    if (typeof ev === 'string' && ev) {
      return !!world.epDone[ev] || ev === focusEventId
    }
    const cx = entry.meta?.codexId
    if (typeof cx === 'string' && cx) {
      return !!world.ends[cx]
    }
    return true
  }
}

/** Tavern（角色短信）闸门：事件回顾只放行已完成事件；实体图鉴放行已登记。 */
export function allowGateForTavern(world: LoreWorldRefs): LoreGate {
  return (entry) => {
    const ev = entry.meta?.eventId
    if (typeof ev === 'string' && ev) {
      return !!world.epDone[ev]
    }
    const cx = entry.meta?.codexId
    if (typeof cx === 'string' && cx) {
      return !!world.ends[cx]
    }
    return true
  }
}

export interface LoreContextOpts {
  scanText: string
  contextText?: string
  gate: LoreGate
  /** 命中词条上限（默认 8） */
  maxEntries?: number
  /** 拼块总字数上限（默认 2400） */
  maxChars?: number
}

const LABEL_HEAD = '【世界书 · 命中参考】'
const LABEL_TAIL = '（仅作延续性背景，与本段事件大纲冲突时以大纲为准）'

/**
 * 对激活世界书做一次有界扫描 → 命中块文本（或 ''）。
 * 排序：关键词命中的按 order 升序在前；constant 词条（文风一类，本就该每段都带着）
 * 先占住名额，余下的才轮到关键词命中。
 */
export function buildLoreContext(books: Lorebook[], opts: LoreContextOpts): string {
  const maxEntries = opts.maxEntries ?? 8
  const maxChars = opts.maxChars ?? 2400
  const text = (opts.scanText || '').trim()
  if (!books.length || !text) return ''

  const seen = new Set<string>()
  const hits: Array<{ book: Lorebook; entry: LorebookEntry }> = []

  for (const book of books) {
    if (!book || !book.entries || !book.entries.length) continue
    const engine = new LorebookEngine(book)
    let matched
    try {
      matched = engine.scan(text, opts.contextText)
    } catch {
      continue
    }
    for (const m of matched) {
      const key = book.id + ':' + m.entry.id
      if (seen.has(key)) continue
      seen.add(key)
      if (!opts.gate(m.entry)) continue
      hits.push({ book, entry: m.entry })
    }
  }

  if (!hits.length) return ''

  hits.sort((a, b) => {
    const ac = a.entry.constant ? 1 : 0
    const bc = b.entry.constant ? 1 : 0
    if (ac !== bc) return ac - bc
    return a.entry.order - b.entry.order
  })

  // 常驻词条先占名额，余下的再给关键词命中 ——
  // 否则命中一多，最该一直带着的那几条反而被挤出去。
  const holds = hits.filter((h) => h.entry.constant)
  const keyed = hits.filter((h) => !h.entry.constant)
  const chosen = [
    ...keyed.slice(0, Math.max(0, maxEntries - holds.length)),
    ...holds,
  ].slice(0, maxEntries)
  const PER_ENTRY = Math.max(160, Math.floor(maxChars / Math.max(chosen.length, 1)))

  const parts: string[] = [`${LABEL_HEAD}${LABEL_TAIL}`]
  let used = parts[0].length
  for (const { entry } of chosen) {
    if (used >= maxChars) break
    const label = entry.comment?.trim() || entry.keys[0] || ''
    const head = label ? `▸ ${label}` : '▸ 词条'
    const body = (entry.content || '').replace(/\s+/g, ' ').trim()
    const bodyCapped = body.length > PER_ENTRY ? body.slice(0, PER_ENTRY) + '…' : body
    const block = `${head}\n${bodyCapped}`
    parts.push(block)
    used += block.length
  }
  return parts.join('\n')
}

/** 世界书摘要：id → { name, count, active }（供头部 chip 与管理器列表） */
export interface LorebookSummary {
  id: string
  name: string
  description?: string
  count: number
  active: boolean
}

export function summarizeBooks(books: Lorebook[], activeIds: string[]): LorebookSummary[] {
  const active = new Set(activeIds)
  return books.map((b) => ({
    id: b.id,
    name: b.name || '未命名世界书',
    description: b.description,
    count: b.entries?.length ?? 0,
    active: active.has(b.id),
  }))
}
