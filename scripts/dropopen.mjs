/* ============================================================
   只留「第一卷第一章」的开场白 —— 一次性手术刀
   ------------------------------------------------------------
   口径（用户 2026-09-12）：除了 v1-1，其余段都不要开场白。
   开场白是**原文**，只有 v1-1 那一段是逐字核对过的原文排印；
   别的段那些是转述，顶着「开场白 · 原文」的名头摆出来就成了伪原文。

     node scripts/dropopen.mjs
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs'

const f = new URL('../src/data/scenes.ts', import.meta.url)
const lines = readFileSync(f, 'utf8').split('\n')

const KEEP_UNTIL = lines.findIndex((l, i) => i > 0 && /^  'v1-2': \{/.test(l))
if (KEEP_UNTIL < 0) throw new Error('找不到 v1-2 的块起点')

const HEAD = /^      \+\s'[^']*'/
const PART = /^      (?:\+\s)?'[^']*'/
const out = lines.slice(0, KEEP_UNTIL)
let removed = 0
let i = KEEP_UNTIL
while (i < lines.length) {
  const l = lines[i]
  if (!/^    open:$/.test(l)) {
    out.push(l)
    i += 1
    continue
  }
  // 形如：  open:\n      '…'\n      + '…',
  let j = i + 1
  if (!PART.test(lines[j] ?? '')) throw new Error(`第 ${i + 1} 行的 open 形状不认识：${lines[j]}`)
  while (HEAD.test(lines[j + 1] ?? '') || !/,$/.test(lines[j])) {
    if (!PART.test(lines[j] ?? '')) throw new Error(`第 ${j + 1} 行不像续行：${lines[j]}`)
    j += 1
    if (j - i > 60) throw new Error('删得太长了，八成是判断错了')
  }
  if (!/,$/.test(lines[j])) throw new Error(`第 ${j + 1} 行没以逗号收尾：${lines[j]}`)
  removed += 1
  i = j + 1
}

if (removed !== 56) throw new Error(`删掉 ${removed} 处 open，预期 56 处 —— 数目不对就不写盘`)
writeFileSync(f, out.join('\n'), 'utf8')
console.log(`√ 删掉 ${removed} 处开场白，只留 v1-1`)
