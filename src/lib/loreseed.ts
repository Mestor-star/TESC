/* ============================================================
   词条库 · canon 种子 —— 把既有 canon 数据编译为开箱即用的词条库
   ------------------------------------------------------------
   纯函数、确定性 id：每次重建产出相同 id 的书与词条，重复播种
   （bulkPut）幂等，绝不覆盖用户自建的词条库（不同 id 互不相干）。
   内容一律取自 src/data 下的原文考据数据，不新增任何设定。
   反剧透靠词条 meta 标注（eventId / codexId）＋ lorescan 的闸门，
   不在本文件里做剧透判断。
   ============================================================ */

import type { Lorebook, LorebookEntry } from './tavernlike/types'
import { CHARACTERS } from '../data/chars'
import { CODEX } from '../data/codex'
import { LORE } from '../data/lore'
import { SIDECAST, type SideCastEntry } from '../data/sidecast'
import { TIMELINE } from '../data/timeline'
import type { Character, EndEntry, LoreEntry, TimelineEvent } from '../data/types'

/** 停用词：分句后仍太泛、不宜作关键词的字串 */
const STOP = new Set(['是', '的', '了', '与', '和', '在', '为', '之', '而', '——', '一', '中', '的', '世界', '天空', '欢迎', '来到'])

function now(): number {
  return Date.now()
}

function book(id: string, name: string, description: string, entries: LorebookEntry[]): Lorebook {
  const t = now()
  return {
    id,
    name,
    description,
    entries,
    recursiveScanning: false,
    caseSensitive: false,
    matchWholeWords: false,
    createdAt: t,
    updatedAt: t,
  }
}

function entry(
  id: string,
  keys: string[],
  content: string,
  order: number,
  comment?: string,
  meta?: Record<string, unknown>,
): LorebookEntry {
  const uniq: string[] = []
  for (const k of keys) {
    const s = (k ?? '').trim()
    if (s && !uniq.includes(s)) uniq.push(s)
  }
  return {
    id,
    keys: uniq,
    secondaryKeys: [],
    content,
    comment,
    order,
    position: 'after_char',
    selective: false,
    selectiveLogic: 'and_any',
    constant: false,
    probability: 100,
    useProbability: false,
    addMemo: false,
    meta,
  }
}

/** 把标题/地点/实体等长串切成「有信息量的关键词」 */
function splitKeywords(...parts: Array<string | undefined>): string[] {
  const out: string[] = []
  for (const raw of parts) {
    if (!raw) continue
    const segs = raw
      .replace(/[()（）]/g, ' ')
      .split(/[，。、；：！？·・／/\s]/)
    for (const s of segs) {
      const t = s.trim()
      if (t.length < 2) continue
      if (STOP.has(t)) continue
      if (/^\d+$/.test(t)) continue
      out.push(t)
    }
  }
  return out
}

/* ---------- 词条库：角色档案 ---------- */

function charEntry(c: Character): LorebookEntry {
  const content = [
    `${c.name}（${c.callsign} · ${c.role} · ${c.epithet}）`,
    c.bio,
    c.quote ? `标志性台词：「${c.quote}」` : '',
  ].filter(Boolean).join('\n')
  return entry(
    `ch-${c.id}`,
    [c.name, c.callsign, c.role, c.epithet].filter(Boolean),
    content,
    10,
    c.name,
  )
}

function buildCharBook(): Lorebook {
  return book('book-canon-char', '角色档案', '四名核心角色：按原文档案生成。命中角色名/称号时提供其设定参考。', CHARACTERS.map(charEntry))
}

/* ---------- 词条库：实体图鉴（登记过的才会放行，见 lorescan） ---------- */

function codexEntry(e: EndEntry): LorebookEntry {
  const content = [
    `No.${e.no || '？？？'}「${e.name}」· Stage ${e.stage >= 0 ? e.stage : '未解明'} ${e.stageKw}`,
    e.origin ? `来历：${e.origin}` : '',
    e.detail ? `详细：${e.detail}` : '',
    e.counter ? `应对要点：${e.counter}` : '',
  ].filter(Boolean).join('\n')
  return entry(
    `cx-${e.id}`,
    [e.name, e.alias, ...(e.no && e.no !== '？？？' ? [`NO.${e.no}`, e.no] : [])].filter(Boolean),
    content,
    20,
    `No.${e.no} ${e.name}`,
    { codexId: e.id },
  )
}

function buildCodexBook(): Lorebook {
  return book('book-canon-codex', '实体图鉴', '已登记进终末图鉴的实体（仅遭遇登记过的会被放行，避免剧透）。', CODEX.map(codexEntry))
}

/* ---------- 词条库：世界 · 势力 · 概念 ---------- */

function loreEntry(e: LoreEntry): LorebookEntry {
  const content = [`${e.title}（${e.cat} · ${e.sub || ''}）`.trim(), e.body, e.ref ? `出处：${e.ref}` : ''].join('\n')
  return entry(
    `lw-${e.id}`,
    [e.title, e.sub, ...(e.tags ?? [])].filter(Boolean),
    content,
    30,
    e.title,
  )
}

function buildLoreBook(): Lorebook {
  return book('book-canon-lore', '世界 · 势力 · 概念', '智库条目：世界观/势力/概念的背景参考。', LORE.map(loreEntry))
}

/* ---------- 词条库：事件回顾（已完成/当前事件才会放行，见 lorescan） ---------- */

function evTitleKeys(title: string): string[] {
  // 取标题里较有辨识度的段（去掉卷副题与泛用词），最多 5 段
  return splitKeywords(title).slice(0, 5)
}

function evEntry(e: TimelineEvent, reading: number): LorebookEntry {
  const keys = [
    ...evTitleKeys(e.title),
    ...splitKeywords(e.place),
    ...e.entities.filter((x) => x !== '——'),
  ]
  const digestable = e.summary.trim()
  return entry(
    `ev-${e.id}`,
    keys,
    digestable,
    reading,
    `${e.group} · ${e.title}`,
    { eventId: e.id },
  )
}

function buildEventBook(): Lorebook {
  return book(
    'book-canon-events',
    '事件回顾',
    '各事件的第三人称回顾（按阅读序）：仅当该事件已完成或是当前焦点事件时放行，绝不剧透未推进的事件。',
    TIMELINE.map((e, i) => evEntry(e, i)),
  )
}

/* ---------- 词条库：登场者登记 ---------- */

function sidecastEntry(s: SideCastEntry): LorebookEntry {
  const content = [
    `${s.name}（${s.alias} · ${s.role}）`,
    s.desc,
    s.quote ? `台词：「${s.quote}」` : '',
    `登场：${s.volLabel} · ${s.page}`,
  ].filter(Boolean).join('\n')
  return entry(
    `sc-${s.id}`,
    [s.name, s.alias].filter(Boolean),
    content,
    40,
    s.name,
  )
}

function buildSidecastBook(): Lorebook {
  return book('book-canon-sidecast', '登场者登记', '协力者/敌对者/重要他人（默认不激活）。', SIDECAST.map(sidecastEntry))
}

/** 全部 canon 种子词条库 */
export function buildCanonLorebooks(): Lorebook[] {
  return [buildCharBook(), buildCodexBook(), buildLoreBook(), buildEventBook(), buildSidecastBook()]
}

/** 默认激活的 canon 库 id（登场者登记默认关，可按需打开） */
export const CANON_BOOK_ACTIVE_IDS = [
  'book-canon-char',
  'book-canon-codex',
  'book-canon-lore',
  'book-canon-events',
]

/** 种子内容签名：库 id + 词条数（用于决定是否重播） */
export const CANON_SEED_KEY = 'zts-lore-seed-v1'
