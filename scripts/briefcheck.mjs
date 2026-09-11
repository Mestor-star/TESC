/* ============================================================
   单段详纲**载荷**自检 —— 摘完了先自己量一遍
   ------------------------------------------------------------
   载荷是 `scripts/briefs/_p_<事件id>.mjs`（默认导出 beats/lines/knows/done/taboo），
   还没进 JSON。这个脚本量两件事：

     ① 覆盖：beats 去掉空白后的字数 ÷ 原文（public/offtext/<id>.txt）的字数
     ② 逐字：lines 里每一句 text 必须真是原文的子串
        （按 whitespace 归一后比对；再放宽一档，把「」『』“” 也去掉再比）

     node scripts/briefcheck.mjs v3-9
     node scripts/briefcheck.mjs v3-9 scripts/briefs/_p_v3-9.mjs
   ============================================================ */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const norm = (s) => String(s).replace(/[\s　​-‍﻿]+/g, '')
const loose = (s) => norm(s).replace(/[「」『』“”"]/g, '')

const id = process.argv[2]
if (!id) {
  console.error('用法：node scripts/briefcheck.mjs <事件id> [载荷路径]')
  process.exit(2)
}
const payloadPath = resolve(process.argv[3] ?? `scripts/briefs/_p_${id}.mjs`)

const srcRaw = readFileSync(`public/offtext/${id}.txt`, 'utf8')
const src = norm(srcRaw)
const mod = await import(pathToFileURL(payloadPath).href)
const p = mod.default ?? mod
if (!p || typeof p !== 'object') {
  console.error(`载荷没读到东西：${payloadPath}`)
  process.exit(2)
}

const beats = p.beats ?? []
const beatLen = beats.reduce((a, b) => a + norm(b).length, 0)
const pct = src.length ? Math.round((beatLen / src.length) * 100) : 0

const badLines = []
for (const l of p.lines ?? []) {
  const t = l?.text ?? ''
  if (!src.includes(norm(t)) && !src.includes(loose(t))) badLines.push(l)
}
const badWho = (p.lines ?? []).filter((l) => !l?.who || !String(l.who).trim()).length
const badKnows = (p.knows ?? []).filter((k) => !k || typeof k !== 'object' || !k.char).length

console.log(`${id}`)
console.log(`  覆盖：拍 ${beats.length} 条 · ${beatLen} 字 / 原文 ${src.length} 字 = ${pct}%`)
console.log(`  台词：${(p.lines ?? []).length} 条 · 对不上原文 ${badLines.length} 条 · 缺 who ${badWho} 条`)
console.log(`  谁知道什么：${(p.knows ?? []).length} 条 · 形状不对 ${badKnows} 条`)
console.log(`  收束条件：${(p.done ?? []).length} 条 · 禁忌：${(p.taboo ?? []).length} 条`)
if (badLines.length) {
  console.log('  —— 这几句对不上原文（逐字铁律：不能改、不能补、拿不准就删）：')
  for (const l of badLines.slice(0, 10)) console.log(`     [${l?.who}] ${String(l?.text).slice(0, 60)}`)
}
if (!beats.length) console.log('  —— beats 是空的')
if (pct < 45) console.log(`  —— 覆盖偏低：${pct}% < 45%，多半有整段被跳过了`)
process.exit(badLines.length || !beats.length ? 1 : 0)
