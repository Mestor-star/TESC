import { readFileSync, readdirSync } from 'node:fs'
const norm = (s) => String(s).replace(/[\s　​-‍﻿]+/g, '')
const dir = 'scripts/briefs'
const rows = []
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  for (const [id, ev] of Object.entries(j)) {
    let src = ''
    try { src = readFileSync(`public/offtext/${id}.txt`, 'utf8') } catch { rows.push([f, id, -1, 0, 0]); continue }
    const n = norm(src).length
    const beats = (ev.beats ?? []).reduce((a, b) => a + norm(b).length, 0)
    rows.push([f, id, n ? Math.round((beats / n) * 100) : 0, beats, n])
  }
}
rows.sort((a, b) => a[2] - b[2])
for (const r of rows) if (r[2] < 60) console.log(`${String(r[2]).padStart(4)}%  ${r[1].padEnd(10)} 拍${r[3]} / 原文${r[4]}   [${r[0]}]`)
console.log(`\n低覆盖 ${rows.filter((r) => r[2] < 60).length} 段 / 共 ${rows.length} 段`)
