/* ============================================================
   CG 补图清单导出 —— 跑法
   ------------------------------------------------------------
   把当前登记的全部 CG 槽位（各段自己的图位 + 通用池 + 私密立绘）连同
   每个槽位「该画什么」的那一句 `note` 导成一份 Markdown，放进 `public/cg/`，
   好对着它收图 / 画图、补完在文件名上打勾。

     node scripts/cglist.mjs          # 写 public/cg/清单.md
     node scripts/cglist.mjs --check  # 只报告还缺哪些，不写文件

   **这是生成物**（同 scripts/briefs → src/data/briefs/generated.ts 的关系）：
   槽位在 `src/data/scenes.ts`（各段）、`src/data/cgs.ts`（通用池）、
   `src/data/intimate.ts`（私密立绘）里改，改完重跑这一条 —— 别手改那份 md。

   「已补 / 待补」按目录里真的有没有同名文件判（webp / png / jpg 三种都认，
   与 src/lib/cg.ts 的候选链一致），所以这份清单可以反复重跑当进度看。
   ============================================================ */

import { createServer } from 'vite'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHECK = process.argv.includes('--check')
const OUT = join('public', 'cg', '清单.md')

/** 候选扩展名 —— 与 src/lib/cg.ts 的 EXTS 同序 */
const EXTS = ['webp', 'png', 'jpg']

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { TIMELINE } = await server.ssrLoadModule('/src/data/timeline.ts')
  const { SCENES } = await server.ssrLoadModule('/src/data/scenes.ts')
  const { CG_POOL } = await server.ssrLoadModule('/src/data/cgs.ts')
  const { INTIMATE } = await server.ssrLoadModule('/src/data/intimate.ts')
  const { personOf } = await server.ssrLoadModule('/src/data/castmeta.ts')

  const have = new Set(readdirSync(join('public', 'cg')))
  /** 这个 id 有没有图（按候选链找一个就算有；返回实际命中的文件名） */
  const found = (id) => EXTS.map((e) => `${id}.${e}`).find((f) => have.has(f)) ?? null
  const mark = (id) => (found(id) ? '✅' : '⬜')

  /* CgRef 允许写成裸字符串（等价 { id }）—— 两种都归一化 */
  const norm = (r) => (typeof r === 'string' ? { id: r } : r)
  const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|')

  /* ---- ① 各段自己的图位：照时间线顺序，一段一张表 ---- */
  const byGroup = new Map()
  for (const ev of TIMELINE) {
    const cgs = (SCENES[ev.id]?.cg ?? []).map(norm)
    if (!cgs.length) continue
    if (!byGroup.has(ev.group)) byGroup.set(ev.group, [])
    byGroup.get(ev.group).push({
      ev,
      mode: SCENES[ev.id]?.cgMode ?? 'all',
      cgs,
    })
  }

  /* ---- ② 通用池 / ③ 私密立绘 ---- */
  const pool = CG_POOL.map(norm)
  const intim = Object.keys(INTIMATE).map((charId) => ({
    id: `cg-intim-${charId}`,
    charId,
    name: personOf(charId)?.name ?? charId,
  }))

  const sceneIds = [...byGroup.values()].flat().flatMap((b) => b.cgs.map((c) => c.id))
  const allIds = [...sceneIds, ...pool.map((p) => p.id), ...intim.map((i) => i.id)]
  const missing = allIds.filter((id) => !found(id))

  const L = []
  L.push('# CG 补图清单（生成物 · 别手改）')
  L.push('')
  L.push('> 这份清单由 `node scripts/cglist.mjs` 从 `src/data/scenes.ts`、'
    + '`src/data/cgs.ts`、`src/data/intimate.ts` 导出。**改槽位要改那三处再重跑**，'
    + '手改这里下一次重跑就没了。')
  L.push('')
  L.push('## 怎么补')
  L.push('')
  L.push(`1. 图放进本目录（\`public/cg/\`），文件名 = 下表「文件名」那一列，`
    + `扩展名按 \`${EXTS.join('` → `')}\` 依次试，备一种即可（webp 体积最小）。`)
  L.push('2. **不用改任何代码**：放一张亮一张；没图的槽位摆「CG 待补」虚线框，框里写着该补的文件名。')
  L.push('3. 规格：场景 CG / 通用图位 **16:9 横构图**（1280×720 或 1920×1080，按 `cover` 裁，主体别贴边）；'
    + '私密立绘 **3:4 竖构图**（按 `contain` 摆）。单张压在 **300 KB** 以内。')
  L.push('4. 改了图不生效：`Ctrl+F5`（`public/` 下的文件不带哈希，浏览器会吃旧缓存）。')
  L.push('')
  L.push(`**当前进度：${allIds.length - missing.length} / ${allIds.length} 已补`
    + `（还缺 ${missing.length} 张）** —— ✅ = 目录里已有图，⬜ = 待补。`)
  L.push('')
  L.push('## 一、各段自己的图位')
  L.push('')
  L.push('一段一格：`cgMode: \'one\'` 的段只摆最后一条成立的（兜底放最前、越具体的越靠后），'
    + '`\'all\'`（缺省）则成立的全部横排摆出。**这一段没被导演点名时，兜底摆第一张。**')
  L.push('')

  for (const [group, blocks] of byGroup) {
    L.push(`### ${group}`)
    L.push('')
    for (const b of blocks) {
      L.push(`**${b.ev.id} · ${b.ev.title}**${b.mode === 'one' ? '（`cgMode: one`）' : ''}`)
      L.push('')
      L.push('| | 文件名 | 该画什么（`note`） | 触发条件 |')
      L.push('| --- | --- | --- | --- |')
      for (const c of b.cgs) {
        const when = c.when
          ? Object.entries(c.when)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(' 且 ')
          : '兜底（恒成立）'
        L.push(`| ${mark(c.id)} | \`${c.id}\` | ${cell(c.note)} | ${cell(when)} |`)
      }
      L.push('')
    }
  }

  L.push('## 二、通用图位（`CG_POOL` · 各段共用）')
  L.push('')
  L.push('**只在导演点名时才出，不参与兜底**；带 `cast` 的位只在本段出场阵容里有其中之一时才进候选。')
  L.push('')
  L.push('| | 文件名 | 该画什么（`note`） | 只在哪位在场时可选 |')
  L.push('| --- | --- | --- | --- |')
  for (const p of pool) {
    const cast = p.cast?.length
      ? p.cast.map((id) => personOf(id)?.name ?? id).join(' / ')
      : '哪一段都能用'
    L.push(`| ${mark(p.id)} | \`${p.id}\` | ${cell(p.note)} | ${cell(cast)} |`)
  }
  L.push('')

  L.push('## 三、私密档案立绘（档案卡背面左栏 · 只对女角色生效）')
  L.push('')
  L.push('版位 **3:4 竖构图**、按 `contain` 摆。文件名固定 `cg-intim-<角色id>`。')
  L.push('')
  L.push('| | 角色 | 文件名 |')
  L.push('| --- | --- | --- |')
  for (const i of intim) {
    L.push(`| ${mark(i.id)} | ${cell(i.name)} | \`${i.id}\` |`)
  }
  L.push('')

  L.push('## 四、还缺哪些（一条条对着补）')
  L.push('')
  if (!missing.length) L.push('**一张不缺。**')
  else {
    L.push('```')
    for (const id of missing) L.push(id)
    L.push('```')
  }
  L.push('')

  if (CHECK) {
    process.stdout.write(`CG 清单：共 ${allIds.length} 张，已补 ${allIds.length - missing.length}，还缺 ${missing.length}\n`)
    if (missing.length) process.stdout.write(missing.map((m) => '  ' + m).join('\n') + '\n')
  } else {
    writeFileSync(OUT, L.join('\n'), 'utf8')
    process.stdout.write(`已写出 ${OUT}\n`)
    process.stdout.write(`共 ${allIds.length} 张：各段 ${sceneIds.length} · 通用 ${pool.length} · 私密立绘 ${intim.length}`
      + ` —— 已补 ${allIds.length - missing.length}，还缺 ${missing.length}\n`)
  }
} finally {
  await server.close()
}
