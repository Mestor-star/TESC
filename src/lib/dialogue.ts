/* ============================================================
   lib/dialogue.ts — 台词拆行（气泡版式用）

   保守策略：只有「整行行首 = 已登记角色名/常用别名 + 半角或全角冒号」
   的台词行才抽成一条对话气泡（say；说话人若为操作员 → you，靠右）。
   其余整行一律留在旁白（narr）里。识别不出说话人绝不臆造、绝不把
   叙述切碎——拿不准就整段留旁白。

   —— 不做分词、不建人物事实，只按行前缀做变体匹配；长名优先。
      Side 角色全名（人物页用名）与别名都入表（正文/导演偶尔会以
      「角色：……」「别名：……」两种写法标台词行）。
   ============================================================ */

import { CAST, OPERATOR_ID, OPERATOR_PERSON, personOf } from '../data/castmeta'

export type DialogueSeg =
  | { kind: 'narr'; text: string }
  /** 非操作员角色的台词（左头像） */
  | { kind: 'say'; id: string; text: string }
  /** 操作员（言万心叶）的台词（右头像，恒为我们自己的回合） */
  | { kind: 'you'; text: string }

/** 最短变体长度：避免单字别名误伤普通叙述行（如「娜：……」首字撞「娜」） */
const SPEAKER_MIN = 2

interface SpeakerEntry {
  text: string
  id: string
}

/** 台词识别表：全名 + 别名（含操作员），按长度降序便于长名优先 */
const SPEAKER_TABLE: SpeakerEntry[] = (() => {
  const map = new Map<string, string>()
  const add = (id: string, names: string[]) => {
    for (const n of names) {
      const s = (n ?? '').trim()
      if (s.length >= SPEAKER_MIN) map.set(s, id)
    }
  }
  for (const p of CAST) add(p.id, [p.name, ...p.names])
  add(OPERATOR_ID, [OPERATOR_PERSON.name, ...OPERATOR_PERSON.names])
  return [...map.entries()]
    .map(([text, id]) => ({ text, id }))
    .sort((a, b) => b.text.length - a.text.length)
})()

/** 若该行以某登记名/别名 + 冒号开头 → 返回匹配；否则 null（整行留旁白） */
function matchSpeaker(line: string): { id: string; body: string } | null {
  for (const sp of SPEAKER_TABLE) {
    if (!line.startsWith(sp.text)) continue
    const ch = line[sp.text.length]
    if (ch !== ':' && ch !== '：') continue
    const body = line.slice(sp.text.length + 1).trim()
    if (!body) continue // 冒号后无内容 → 疑为叙述，保守留旁白
    return { id: sp.id, body }
  }
  return null
}

/** 剥一层外括：整段被一对「」或『』包住才剥（保留行内引号与对话内引号） */
function stripOuterQuotes(s: string): string {
  const t = s.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === '「' && b === '」') || (a === '『' && b === '』')) {
      return t.slice(1, -1).trim()
    }
  }
  return t
}

/**
 * 把一条完整正文（可能含多行旁白与台词）拆成「旁白 / 左气泡 / 右气泡」段。
 * narr 连续行会并成一段（用单个换行），台词行各自成段，空行切断旁白段。
 */
export function splitSpeech(raw: unknown): DialogueSeg[] {
  const text = typeof raw === 'string' ? raw : ''
  const out: DialogueSeg[] = []
  let narrBuf: string[] = []

  const flushNarr = () => {
    if (!narrBuf.length) return
    out.push({ kind: 'narr', text: narrBuf.join('\n').replace(/\n{3,}/g, '\n\n').trim() })
    narrBuf = []
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushNarr()
      continue
    }
    const m = matchSpeaker(trimmed)
    if (!m) {
      narrBuf.push(trimmed)
      continue
    }
    flushNarr()
    const body = stripOuterQuotes(m.body)
    if (!body) continue // 剥引号后为空 → 不算台词，留旁白
    if (m.id === OPERATOR_ID) out.push({ kind: 'you', text: body })
    else out.push({ kind: 'say', id: m.id, text: body })
  }
  flushNarr()
  return out
}

/** 供气泡头显示说话人登记名（say 段；未收录则返回原 id） */
export function speakerNameOf(id: string): string {
  return personOf(id)?.name ?? id
}
