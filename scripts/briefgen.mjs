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
  console.log('· scripts/briefs/ 下没有 .json，什么都没做')
  process.exit(0)
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
