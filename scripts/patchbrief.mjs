/* 单事件回写工具：把 payload 覆盖进 scripts/briefs/<file>.json 的某个事件键。
   用法：node scripts/patchbrief.mjs <file.json> <事件id> <payload.mjs>
   payload.mjs 默认导出 { beats, lines, knows, done, taboo }（未给的键保持原样）。
   写完立刻对该事件做一次逐字校验（每条 line 必须在 offtext 原文里找得到），
   对不上就回滚 + 报错退出 —— 免得把没校验过的东西留在盘上。 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/* 与 briefgen.mjs 同款归一：去空白/零宽；loose 再连引号一起去 */
const norm = (s) => String(s).replace(/[\s　​-‍⁠﻿]+/g, '')
const loose = (s) => norm(s).replace(/[「」『』“”"]/g, '')

const [file, evId, payloadPath] = process.argv.slice(2)
if (!file || !evId || !payloadPath) {
  console.error('用法：node scripts/patchbrief.mjs <file.json> <事件id> <payload.mjs>')
  process.exit(1)
}
const abs = path.resolve(file)
const before = fs.readFileSync(abs, 'utf8')
const j = JSON.parse(before)
if (!j[evId]) { console.error(`没有事件 ${evId}（现有：${Object.keys(j).join(', ')}）`); process.exit(1) }

const mod = await import(pathToFileURL(path.resolve(payloadPath)).href)
const p = mod.default
if (!p || typeof p !== 'object') { console.error('payload 没有默认导出对象'); process.exit(1) }

const src = norm(fs.readFileSync(`public/offtext/${evId}.txt`, 'utf8'))
const bad = []
for (const l of (p.lines ?? [])) {
  if (!src.includes(norm(l.text)) && !src.includes(loose(l.text))) bad.push(l.text)
}
if (bad.length) {
  console.error(`× ${evId} 有 ${bad.length} 条台词对不上原文，未写盘：`)
  for (const b of bad.slice(0, 5)) console.error('   ' + b.slice(0, 40) + '…')
  process.exit(1)
}

const next = { ...j[evId], ...p }
const out = { ...j, [evId]: next }
fs.writeFileSync(abs, JSON.stringify(out, null, 2) + '\n', 'utf8')
const chars = next.beats.reduce((a, s) => a + String(s).length, 0)
console.log(`√ ${evId}：拍 ${next.beats.length}（${chars} 字）｜台词 ${next.lines.length}｜原文 ${src.length} 字`)
