/* ============================================================
   详细事件大纲 —— 校验 + 生成

   输入：scripts/briefs/*.json
     形如
       { "v1-1": { beats: [...], lines: [{who,text}], knows: [...], done: [...], taboo: [...], ref } }
   输出：src/data/briefs/generated.ts

   校验（逐字铁律的机器版本）：
     · lines[].text 必须**逐字**能在 public/offtext/<id>.txt 里找到
       （归一化：去掉所有空白字符。对不上就是编的，直接判不合格）
     · beats 不得为空、不得含空白项
     · knows[].char / knows[] 数组非空
     · done / taboo 不强制，但给了就得有字

   有一条对不上就**整个文件整块拒绝**，不半推半就 —— 大纲是给导演当事实
   用的，掺一条编的就等于整本不可信。

   用法：node scripts/briefgen.mjs [--check]
     --check  只校验，不写文件（CI / 改完大纲先跑这个）
   ============================================================ */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IN_DIR = path.join(ROOT, 'scripts', 'briefs')
const OUT = path.join(ROOT, 'src', 'data', 'briefs', 'generated.ts')
const OFFTEXT = path.join(ROOT, 'public', 'offtext')

const CHECK_ONLY = process.argv.includes('--check')

/** 归一化：去掉所有空白（全角半角都算）与零宽字符 */
const norm = (s) => String(s).replace(/[\s　​-‍⁠﻿]+/g, '')

/** 逐字校验用：连同「」『』也去掉再比 —— 小说里的引号包法五花八门 */
const loose = (s) => norm(s).replace(/[「」『』“”"]/g, '')

const errors = []
const warnings = []
const briefs = {}

/* ── 说话人标签（lines[].who）规范化 ──────────────────────────
   摘录时人按原文叙述里的叫法写（「泰尔学长」「恋兔学姐」），这没错 ——
   原文里就是这么叫的。但这一行进提示词时是 `谁：台词` 的格式，
   导演会照着它写台词行；写出来的名字若对不上档案表，前端切气泡时
   认不出，那一句就掉成旁白 —— 好台词白写。

   所以这里按档案表把它们归一到**档案全名**：变体在下面逐条列出，
   归一的结果会作为「归一 N 处」报出来，不悄悄改。

   档案表之外的（女神 / 守护者 / 八脚马 / 泥塑面具…）原样留着：
   它们本来就不是登记在册的角色，原文怎么称就怎么称。 */
const WHO_ALIAS = {
  泰尔学长: '泰尔米别克・简别科娃',
  弗恩: '弗恩・西蒙',
  弗恩学长: '弗恩・西蒙',
  恋兔学姐: '恋兔光',
  梅芙: '梅芙莉莎・简别科娃',
  小柴: '小柴喵呜',
  艾莉芙: '艾莉芙・安纳托利亚',
  老头子子: '老头子', // 笔误
}

/** 档案表里登记过的名字（chars.ts 的 name / sidecast.ts 的 card 全名与别名） */
function castNames() {
  const out = new Set(['言万心叶']) // 操作员（不在档案表里，但当然是合法说话人）
  for (const rel of ['data/chars.ts', 'data/sidecast.ts']) {
    const p = path.join(ROOT, 'src', rel)
    if (!fs.existsSync(p)) continue
    const s = fs.readFileSync(p, 'utf8')
    for (const m of s.matchAll(/name: '([^']+)'/g)) out.add(m[1])
    for (const m of s.matchAll(/card\(\s*'[^']+',\s*'([^']+)',\s*'([^']+)'/g)) {
      out.add(m[1])
      out.add(m[2])
    }
  }
  return out
}
const CAST_NAMES = castNames()
const whoFixes = new Map() // 变体 → 出现次数（生成时报出来）

const offtextCache = new Map()
function offtextOf(id) {
  if (offtextCache.has(id)) return offtextCache.get(id)
  const p = path.join(OFFTEXT, `${id}.txt`)
  let text = null
  try {
    text = fs.readFileSync(p, 'utf8')
  } catch {
    text = null
  }
  offtextCache.set(id, text)
  return text
}

const files = fs.existsSync(IN_DIR)
  ? fs.readdirSync(IN_DIR).filter((f) => f.endsWith('.json')).sort()
  : []

if (!files.length) {
  // 一份都没摘也要把文件写上（空的）—— 生成物是**始终存在**的，
  // 调用方（src/data/briefs/index.ts）才不必为「还没摘」写一条分支。
  console.log('· scripts/briefs/ 下没有 .json —— 写一份空的 generated.ts')
}

for (const f of files) {
  const raw = fs.readFileSync(path.join(IN_DIR, f), 'utf8')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    errors.push(`${f}: 不是合法 JSON —— ${e.message}`)
    continue
  }
  for (const [id, b] of Object.entries(parsed)) {
    if (!/^[vs]\d-\d+$/.test(id)) {
      errors.push(`${f}: 键 ${id} 不像事件 id`)
      continue
    }
    if (briefs[id]) {
      errors.push(`${f}: ${id} 重复定义（上一处在别的文件里）`)
      continue
    }
    const src = offtextOf(id)
    if (src === null) {
      errors.push(`${f}: ${id} 没有对应原文切片 public/offtext/${id}.txt，无从校验`)
      continue
    }
    const hay = loose(src)

    // 一、beats
    if (!Array.isArray(b.beats) || !b.beats.length) {
      errors.push(`${f}: ${id}.beats 为空 —— 大纲的骨头就是它`)
      continue
    }
    b.beats.forEach((x, i) => {
      if (typeof x !== 'string' || !x.trim()) errors.push(`${f}: ${id}.beats[${i}] 是空的`)
    })

    // 二、lines：逐字
    if (b.lines !== undefined) {
      if (!Array.isArray(b.lines)) {
        errors.push(`${f}: ${id}.lines 不是数组`)
      } else {
        b.lines.forEach((l, i) => {
          if (!l || typeof l.who !== 'string' || !l.who.trim()) errors.push(`${f}: ${id}.lines[${i}].who 缺失`)
          else {
            const w = l.who.trim()
            const canon = WHO_ALIAS[w]
            if (canon) {
              whoFixes.set(w, (whoFixes.get(w) ?? 0) + 1)
              l.who = canon
            } else if (!CAST_NAMES.has(w)) {
              // 不在档案表里 —— 可能是原文里的次要人物（泰尔、玛吉娜…），
              // 也可能只是写岔了。不拦，但要说出来让人看一眼。
              warnings.push(`${f}: ${id}.lines[${i}].who「${w}」不在档案表内（确属原文里的次要人物则无需处理）`)
            }
          }
          if (!l || typeof l.text !== 'string' || !l.text.trim()) {
            errors.push(`${f}: ${id}.lines[${i}].text 缺失`)
            return
          }
          const needle = loose(l.text)
          if (needle.length < 4) {
            errors.push(`${f}: ${id}.lines[${i}] 太短（「${l.text}」），短到没法验、也没法用`)
            return
          }
          if (!hay.includes(needle)) {
            errors.push(`${f}: ${id}.lines[${i}] **对不上原文**，像是改写过：「${l.text.slice(0, 30)}…」`)
          }
        })
      }
    }

    // 三、knows
    if (b.knows !== undefined) {
      if (!Array.isArray(b.knows)) {
        errors.push(`${f}: ${id}.knows 不是数组`)
      } else {
        b.knows.forEach((k, i) => {
          if (!k || typeof k.char !== 'string' || !k.char.trim()) {
            errors.push(`${f}: ${id}.knows[${i}].char 缺失`)
            return
          }
          const kk = Array.isArray(k.knows) ? k.knows : []
          const un = Array.isArray(k.unknown) ? k.unknown : []
          if (!kk.length && !un.length) errors.push(`${f}: ${id}.knows[${i}]（${k.char}）知道与不知道两栏都是空的`)
          ;[...kk, ...un].forEach((x) => {
            if (typeof x !== 'string' || !x.trim()) errors.push(`${f}: ${id}.knows[${i}] 里有空白条目`)
          })
        })
      }
    }

    // 四、done / taboo
    for (const key of ['done', 'taboo']) {
      if (b[key] === undefined) continue
      if (!Array.isArray(b[key])) {
        errors.push(`${f}: ${id}.${key} 不是数组`)
        continue
      }
      b[key].forEach((x, i) => {
        if (typeof x !== 'string' || !x.trim()) errors.push(`${f}: ${id}.${key}[${i}] 是空的`)
      })
    }

    if (!b.lines?.length) warnings.push(`${id} 没有关键台词 —— 正文最容易在这上面走样`)
    if (!b.knows?.length) warnings.push(`${id} 没写谁知道什么 —— 最容易「忽然失忆」的一环`)

    briefs[id] = {
      beats: b.beats.map((x) => x.trim()),
      ...(b.lines?.length ? { lines: b.lines.map((l) => ({ who: l.who.trim(), text: l.text })) } : {}),
      ...(b.knows?.length
        ? {
            knows: b.knows.map((k) => ({
              char: k.char.trim(),
              ...(k.knows?.length ? { knows: k.knows.map((x) => x.trim()) } : {}),
              ...(k.unknown?.length ? { unknown: k.unknown.map((x) => x.trim()) } : {}),
            })),
          }
        : {}),
      ...(b.done?.length ? { done: b.done.map((x) => x.trim()) } : {}),
      ...(b.taboo?.length ? { taboo: b.taboo.map((x) => x.trim()) } : {}),
      ...(b.ref ? { ref: String(b.ref).trim() } : {}),
    }
  }
}

for (const w of warnings) console.log(`  warn  ${w}`)
for (const e of errors) console.log(`  FAIL  ${e}`)

if (whoFixes.size) {
  console.log('· 说话人标签归一（照着档案表，好让前端切得出气泡）：')
  for (const [from, n] of [...whoFixes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${from} → ${WHO_ALIAS[from]}　×${n}`)
  }
}

if (errors.length) {
  console.log(`\n=== 大纲校验不通过：${errors.length} 条 ===\n（一条都不写盘。修完 scripts/briefs/*.json 再来）`)
  process.exit(1)
}

const ids = Object.keys(briefs).sort((a, b) => {
  const k = (s) => [s[0] === 's' ? 9 : Number(s[1]), Number(s.split('-')[1])]
  const [x, y] = [k(a), k(b)]
  return x[0] - y[0] || x[1] - y[1]
})

const body = ids
  .map((id) => {
    const b = briefs[id]
    const j = (v) => JSON.stringify(v)
    const seg = [`  ${j(id)}: {`]
    seg.push(`    beats: ${j(b.beats)},`)
    if (b.lines) seg.push(`    lines: ${j(b.lines)},`)
    if (b.knows) seg.push(`    knows: ${j(b.knows)},`)
    if (b.done) seg.push(`    done: ${j(b.done)},`)
    if (b.taboo) seg.push(`    taboo: ${j(b.taboo)},`)
    seg.push(`  },`)
    return seg.join('\n')
  })
  .join('\n')

const out = `/* 本文件由 scripts/briefgen.mjs 生成 —— 手改会被下次生成覆盖。
   内容来自 scripts/briefs/*.json，逐字校验过原文切片才过得了。 */
import type { EventBrief } from '../types'

export const EVENT_BRIEFS: Record<string, EventBrief> = {
${body}
}
`

if (CHECK_ONLY) {
  console.log(`\n=== 大纲校验通过：${ids.length} 个事件（--check，未写盘）===`)
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, out, 'utf8')
  console.log(`\n=== 大纲校验通过：${ids.length} 个事件 → ${path.relative(ROOT, OUT).replace(/\\/g, '/')} ===`)
}
