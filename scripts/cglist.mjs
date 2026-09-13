/* ============================================================
   CG 补图清单导出 —— 跑法
   ------------------------------------------------------------
   把当前登记的全部 CG 槽位（定妆池 + 私密立绘 + 见面约会）
   连同每个槽位「该画什么」的那一句 `note` 导成一份 Markdown，放进 `public/cg/`，
   好对着它收图 / 画图、补完在文件名上打勾。

     node scripts/cglist.mjs          # 写 public/cg/清单.md
     node scripts/cglist.mjs --check  # 只报告还缺哪些，不写文件

   **这是生成物**（同 scripts/briefs → src/data/briefs/generated.ts 的关系）：
   槽位在三处 —— `src/data/cgs.ts`（定妆池）、`src/data/intimate.ts`（私密立绘）、
   `src/lib/rendezvous.ts`（见面约会，`DATE_CG` + `DATE_CG_INTIMATE`）——
   改完重跑这一条，别手改那份 md。

   ⚠ 那三处就是本文件认得的**全部**槽位来源。当初只认 `data/` 下的那两处，见面约会
   那五张（`lib/rendezvous.ts`）就整整齐齐漏了 —— 而且**不报错**，清单只是少一截。
   所以日后新开一处槽位表，必须同时加到这里；末尾那道重名检查（同一个 id 被两处登记）
   算是替这件事补的一半防线。

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
  const { CG_POOL } = await server.ssrLoadModule('/src/data/cgs.ts')
  const { INTIMATE } = await server.ssrLoadModule('/src/data/intimate.ts')
  const { personOf } = await server.ssrLoadModule('/src/data/castmeta.ts')
  const { DATE_CG, DATE_CG_INTIMATE } = await server.ssrLoadModule('/src/lib/rendezvous.ts')

  const have = new Set(readdirSync(join('public', 'cg')))
  /** 这个 id 有没有图（按候选链找一个就算有；返回实际命中的文件名） */
  const found = (id) => EXTS.map((e) => `${id}.${e}`).find((f) => have.has(f)) ?? null
  const mark = (id) => (found(id) ? '✅' : '⬜')

  /* CgRef 允许写成裸字符串（等价 { id }）—— 两种都归一化 */
  const norm = (r) => (typeof r === 'string' ? { id: r } : r)
  const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|')

  /* ---- ① 定妆池 / ② 私密立绘 / ③ 见面约会 ---- */
  const pool = CG_POOL.map(norm)
  const intim = Object.keys(INTIMATE).map((charId) => ({
    id: `cg-intim-${charId}`,
    charId,
    name: personOf(charId)?.name ?? charId,
  }))
  /* 见面那一档的图位住在 lib/rendezvous.ts（不在 data/ 下，所以当初漏了这一处）。
     两张表都要：「到私密那一档才进候选」的那两张也是真槽位，只是候选面窄。 */
  const date = [...DATE_CG, ...DATE_CG_INTIMATE].map(norm)
  const dateIntimIds = new Set(DATE_CG_INTIMATE.map((r) => norm(r).id))

  const allIds = [
    ...pool.map((p) => p.id),
    ...intim.map((i) => i.id),
    ...date.map((d) => d.id),
  ]
  const missing = allIds.filter((id) => !found(id))

  const L = []
  L.push('# CG 补图清单（生成物 · 别手改）')
  L.push('')
  L.push('> 这份清单由 `node scripts/cglist.mjs` 从 `src/data/cgs.ts`、'
    + '`src/data/intimate.ts`、`src/lib/rendezvous.ts` 导出。'
    + '**改槽位要改那三处再重跑**，手改这里下一次重跑就没了。')
  L.push('')
  L.push('## 怎么补')
  L.push('')
  L.push(`1. 图放进本目录（\`public/cg/\`），文件名 = 下表「文件名」那一列，`
    + `扩展名按 \`${EXTS.join('` → `')}\` 依次试，备一种即可（webp 体积最小）。`)
  L.push('2. **不用改任何代码**：放一张亮一张；没图的槽位摆「CG 待补」虚线框，框里写着该补的文件名。')
  L.push('3. 规格：约会那几张 **16:9 横构图**（1280×720 或 1920×1080，按 `cover` 裁，主体别贴边）；'
    + '定妆半身 **3:4 竖构图**（按 `contain` 摆）；私密立绘 **3:4 竖构图**。单张压在 **300 KB** 以内。')
  L.push('4. 改了图不生效：`Ctrl+F5`（`public/` 下的文件不带扩展名哈希，浏览器会吃旧缓存）。')
  L.push('')
  L.push(`**当前进度：${allIds.length - missing.length} / ${allIds.length} 已补`
    + `（还缺 ${missing.length} 张）** —— ✅ = 目录里已有图，⬜ = 待补。`)
  L.push('')

  L.push('## 一、定妆半身（`CG_POOL` · 只在本人在场时才进候选）')
  L.push('')
  L.push('当前唯一的消费方是**见面约会那一档**：与本人在场的那一场里的街景并列进候选。'
    + '带 `cast` 的位只在本场名册里有她时才可选。')
  L.push('')
  L.push('版位是约会线程头部那一张：**3:2 横构图、按 `cover` 裁** —— '
    + '跟街景摆的是同一个位子，所以出图也按横构图来。')
  L.push('')
  L.push('| | 文件名 | 该画什么（`note`） | 只在哪位在场时可选 |')
  L.push('| --- | --- | --- | --- |')
  for (const p of pool) {
    const cast = p.cast?.length
      ? p.cast.map((id) => personOf(id)?.name ?? id).join(' / ')
      : '哪一场都能用'
    L.push(`| ${mark(p.id)} | \`${p.id}\` | ${cell(p.note)} | ${cell(cast)} |`)
  }
  L.push('')

  L.push('## 二、私密档案立绘（档案卡背面左栏 · 只对女角色生效）')
  L.push('')
  L.push('版位 **3:4 竖构图**、按 `contain` 摆、**铺满整栏**（与正面那一栏同一套版式，'
    + '翻面时版面不跳）。文件名固定 `cg-intim-<角色id>`。')
  L.push('')
  L.push('**画风口径：暧昧、情色、风趣。** 这一栏是私密档案，不是定妆照 ——'
    + '神态勾人（含羞带笑、眼角挂人、咬唇），姿态放松带挑逗（倚着、半躺、指尖勾着衣料），'
    + '衣料少而有戏（半褪／松垮／滑到臂弯／勾在指间），氛围是「私下里被单独看着」的那点黏糊。'
    + '暴露程度跟着该角色的色情度与穿着档走。'
    + '**但别直接画成明场性交** —— 那是约会那两张私密场面的事：她是在给你看，不是在做。')
  L.push('')
  L.push('| | 角色 | 文件名 |')
  L.push('| --- | --- | --- |')
  for (const i of intim) {
    L.push(`| ${mark(i.id)} | ${cell(i.name)} | \`${i.id}\` |`)
  }
  L.push('')

  L.push('## 三、见面约会的图位（`src/lib/rendezvous.ts`）')
  L.push('')
  L.push('版位 **16:9 横构图**（按 `cover` 裁）。')
  L.push('前三张哪一场都进候选；后两张**只有这一场走到私密那一档**才进候选 —— '
    + '所以它们可以画得比前面三张更直给。')
  L.push('')
  L.push('| | 文件名 | 该画什么（`note`） | 什么时候进候选 |')
  L.push('| --- | --- | --- | --- |')
  for (const d of date) {
    const scope = dateIntimIds.has(d.id) ? '`kind: intimate` 才进候选' : '每一场见面都能点'
    L.push(`| ${mark(d.id)} | \`${d.id}\` | ${cell(d.note)} | ${scope} |`)
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

  /* 重名 = 两处登记了同一个 id（改了文件名却没改旧的那一处，或复制粘贴漏改）。
     它不算「多一张」，会让清单把同一张数两遍、进度也跟着虚高，所以直接报出来。 */
  const dupes = [...new Set(allIds.filter((id, i) => allIds.indexOf(id) !== i))]

  if (CHECK) {
    process.stdout.write(`CG 清单：共 ${allIds.length} 张，已补 ${allIds.length - missing.length}，还缺 ${missing.length}\n`)
    if (dupes.length) process.stdout.write('  重名（两处登记了同一个 id）：' + dupes.join('、') + '\n')
    if (missing.length) process.stdout.write(missing.map((m) => '  ' + m).join('\n') + '\n')
  } else {
    writeFileSync(OUT, L.join('\n'), 'utf8')
    process.stdout.write(`已写出 ${OUT}\n`)
    process.stdout.write(`共 ${allIds.length} 张：定妆 ${pool.length}`
      + ` · 私密立绘 ${intim.length} · 见面约会 ${date.length}`
      + ` —— 已补 ${allIds.length - missing.length}，还缺 ${missing.length}\n`)
    if (dupes.length) process.stdout.write('  重名：' + dupes.join('、') + '\n')
  }
} finally {
  await server.close()
}
