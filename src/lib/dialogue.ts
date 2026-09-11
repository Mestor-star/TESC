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

/** 行首的强调标记（模型偶尔把名字加粗：`**露娜**：……`）—— 剥掉再认，气泡不该因此失效。
    只认成对的（** / __ / ＊），单一个 * 或 _ 当作列表符号，不剥。 */
const LEAD_MARK = /^(?:\*\*|__|＊)+/
/** 名字与冒号之间可能还留着收尾的那半对标记（`**露娜**：` 的后一个 **） */
const TAIL_MARK = /^(?:\*\*|__|＊)+/

/** 名字后**直接**接引号的写法（`露娜「…….」`）→ 该开引号对应的收尾引号 */
const OPEN_CLOSE: Record<string, string> = { '「': '」', '『': '』', '“': '”', '"': '"' }

/** 若该行以某登记名/别名 + 冒号开头 → 返回匹配；否则 null（整行留旁白） */
function matchSpeaker(line: string): { id: string; body: string } | null {
  const head = line.replace(LEAD_MARK, '')
  for (const sp of SPEAKER_TABLE) {
    if (!head.startsWith(sp.text)) continue
    let k = sp.text.length
    const tail = TAIL_MARK.exec(head.slice(k))
    if (tail) k += tail[0].length
    const ch = head[k]
    if (ch === ':' || ch === '：') {
      const body = head.slice(k + 1).trim()
      if (!body) continue // 冒号后无内容 → 疑为叙述，保守留旁白
      return { id: sp.id, body }
    }
    // 名字后直接接引号（`露娜「小主人，你迟到了。」`）：**只在整行确实被同一对引号
    // 收住时**才认 —— 少了这一条，这种最省事的写法会整行掉回旁白，气泡凭空少一个；
    // 放开成「名字后见引号就认」则会把「露娜「影」是异端」这类叙述也切成台词，
    // 所以宁可留着这条尾巴不认，也别把旁白切碎。
    const close = ch ? OPEN_CLOSE[ch] : ''
    if (close && head.length >= k + 3 && head.endsWith(close)) {
      const body = head.slice(k + 1, -1).trim()
      if (!body) continue
      return { id: sp.id, body }
    }
  }
  return null
}

/** 成对的外括：整段被同一对包住才剥（保留行内引号与对话内引号）。
    半角双引号也收 —— 预设里若写了「对白用引号」，模型可能就写成 "…"。 */
const QUOTE_PAIRS: Array<[string, string]> = [
  ['「', '」'], ['『', '』'], ['“', '”'], ['"', '"'],
]

function stripOuterQuotes(s: string): string {
  const t = s.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if (QUOTE_PAIRS.some(([x, y]) => a === x && b === y)) {
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
