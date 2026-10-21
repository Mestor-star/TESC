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

import { CAST, OPERATOR_ID, OPERATOR_PERSON, VOICE_ONLY, speakerOf } from '../data/castmeta'
import { nameKey } from './namekey'

export type DialogueSeg =
  | { kind: 'narr'; text: string }
  /** 非操作员角色的台词（左头像） */
  | { kind: 'say'; id: string; text: string }
  /** 操作员（言万心叶）的台词（右头像，恒为我们自己的回合） */
  | { kind: 'you'; text: string }
  /**
   * 无名台词：整段/整行被引号包住、却**没有写说话人**（模型常这么写）。
   * 从前这种整行落进旁白 —— 屏上就是「该出气泡的地方没出气泡」。
   * 这里只交出**文本**（已剥掉外层那一对引号），**不挂 id、不猜是谁说的**：
   * 猜错比不美化更糟。渲染层给它一枚中性气泡。
   */
  | { kind: 'quote'; text: string }

/** 最短变体长度：避免单字别名误伤普通叙述行（如「娜：……」首字撞「娜」） */
const SPEAKER_MIN = 2

interface SpeakerEntry {
  /** 归一后的名字（比较键，见 lib/namekey.ts） */
  key: string
  id: string
}

/** 台词识别表：全名 + 别名（含操作员与「开口但不在册」者），按比较键长度降序便于长名优先。
    表里存的是**比较键**（nameKey：NFKC + 去空白 + 四种中点统一 U+00B7），
    所以档案里写「・」、正文排印写「·」的同一个人是同一个键，编年史一类的
    **逐字原文**才不必为了切气泡去改标点。 */
const SPEAKER_TABLE: SpeakerEntry[] = (() => {
  const map = new Map<string, string>()
  const add = (id: string, names: string[]) => {
    for (const n of names) {
      const key = nameKey(n ?? '')
      if (key.length >= SPEAKER_MIN) map.set(key, id)
    }
  }
  for (const p of CAST) add(p.id, [p.name, ...p.names])
  for (const p of VOICE_ONLY) add(p.id, [p.name, ...p.names])
  add(OPERATOR_ID, [OPERATOR_PERSON.name, ...OPERATOR_PERSON.names])
  return [...map.entries()]
    .map(([key, id]) => ({ key, id }))
    .sort((a, b) => b.key.length - a.key.length)
})()

/**
 * 把一行按同一把尺（lib/namekey.ts）洗干净，并记住每个洗后字符在**原文**里到哪结束。
 *
 * 只洗出键、不改原行：气泡正文还得按原下标切，否则正文会被自己洗出来的空白错位。
 * 归一都是一对一（NFKC / 中点），空白是跳过 —— 所以键里第 n 个字符的末尾下标，
 * 就是「名字在原行里到哪一位为止」。
 */
function foldedHead(line: string): { key: string; end: number[] } {
  let key = ''
  const end: number[] = []
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (/\s/.test(c)) continue
    const f = nameKey(c)
    if (!f) continue
    key += f
    for (let j = 0; j < f.length; j++) end.push(i + 1)
  }
  return { key, end }
}

/** 行首的强调标记（模型偶尔把名字加粗：`**露娜**：……`）—— 剥掉再认，气泡不该因此失效。
    只认成对的（** / __ / ＊），单一个 * 或 _ 当作列表符号，不剥。 */
const LEAD_MARK = /^(?:\*\*|__|＊)+/
/** 名字与冒号之间可能还留着收尾的那半对标记（`**露娜**：` 的后一个 **） */
const TAIL_MARK = /^(?:\*\*|__|＊)+/

/** 名字后**直接**接引号的写法（`露娜「…….」`）→ 该开引号对应的收尾引号 */
const OPEN_CLOSE: Record<string, string> = { '「': '」', '『': '』', '“': '”', '"': '"' }

/** 若该行以某登记名/别名 + 冒号开头 → 返回匹配；否则 null（整行留旁白）。
    `colonOnly`：只认「名字 + 冒号」（嵌套前缀的解包用，见 unwrapNested）。 */
function matchSpeaker(line: string, colonOnly = false): { id: string; body: string } | null {
  const head = line.replace(LEAD_MARK, '')
  const folded = foldedHead(head)
  for (const sp of SPEAKER_TABLE) {
    if (!folded.key.startsWith(sp.key)) continue
    // 名字在原行里结束的位置（洗过的键 → 原文下标）
    let k = folded.end[sp.key.length - 1]
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
    if (!colonOnly && close && head.length >= k + 3 && head.endsWith(close)) {
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
 * 解一层（或几层）**嵌套前缀**：模型偶尔把两层名字串成一行 ——
 * `黑之魔王：言万心叶：……`。按外层算，整句会挂给错的人；这里按**内层**归属。
 *
 * 只认「名字 + 冒号」这一种、且内层必须**换人**才剥：
 *   · 名字后接引号的写法不剥，所以 `黑之魔王：「露娜：你怎么看？」` 原样是外层在说话；
 *   · 同一个名字连写两遍也停下（宁可留着，也不猜它写了两次是什么意思）；
 *   · 正文开头不是登记名（叙述、括号神态）本就匹配不上 —— 一条「猜谁在说话」的逻辑都没有。
 */
function unwrapNested(m: { id: string; body: string }): { id: string; body: string } {
  let cur = m
  for (let i = 0; i < 4; i++) {
    const inner = matchSpeaker(cur.body, true)
    if (!inner || inner.id === cur.id) break
    cur = inner
  }
  return cur
}

/**
 * 切好的段按**原文**存一把。
 *
 * 剧情推进那一页每敲一个字、每来一段流式回执都要重排整条历史，而每条正文都要重切一次
 * （切的过程里 `matchSpeaker` 还要逐行扫一遍发言人名册）。同一段正文切出来的结果是一样的，
 * 所以按原文认缓存 —— 与历史长短无关，长会话里省下的正是这一头。
 * 只留最近的一把（到顶整把清掉），免得挂机一整晚把正文都攒在内存里。
 */
const SPLIT_CACHE = new Map<string, DialogueSeg[]>()
const SPLIT_CACHE_MAX = 512

/**
 * 把一条完整正文（可能含多行旁白与台词）拆成「旁白 / 左气泡 / 右气泡」段。
 * narr 连续行会并成一段（用单个换行），台词行各自成段，空行切断旁白段。
 *
 * 返回的是**副本**：缓存里那一把谁都不许改（调用方真要排序、截断也动不到它）。
 */
export function splitSpeech(raw: unknown): DialogueSeg[] {
  const text = typeof raw === 'string' ? raw : ''
  const hit = SPLIT_CACHE.get(text)
  if (hit) return hit.slice()
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
    const hit = matchSpeaker(trimmed)
    if (!hit) {
      /* 认不出说话人，但整行**就是一句引号台词**（「……」「……」/『……』/“……”,整行被同一对包住）：
         交出去当一枚无名气泡，而不是埋进旁白。判据只有一条 —— 剥掉外层那一对引号后
         **文本变短了**，也就是整行确实被它包住；行内引号（旁白夹一句）照旧留旁白。 */
      const bare = stripOuterQuotes(trimmed)
      if (bare !== trimmed && bare.length >= 2) {
        flushNarr()
        out.push({ kind: 'quote', text: bare })
        continue
      }
      narrBuf.push(trimmed)
      continue
    }
    const m = unwrapNested(hit)
    flushNarr()
    const body = stripOuterQuotes(m.body)
    if (!body) continue // 剥引号后为空 → 不算台词，留旁白
    if (m.id === OPERATOR_ID) out.push({ kind: 'you', text: body })
    else out.push({ kind: 'say', id: m.id, text: body })
  }
  flushNarr()
  if (SPLIT_CACHE.size >= SPLIT_CACHE_MAX) SPLIT_CACHE.clear()
  SPLIT_CACHE.set(text, out)
  return out.slice()
}

/** 供气泡头显示说话人登记名（say 段；未收录则返回原 id） */
export function speakerNameOf(id: string): string {
  return speakerOf(id)?.name ?? id
}
