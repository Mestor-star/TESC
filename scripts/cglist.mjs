/* ============================================================
   CG 补图清单导出 —— 跑法
   ------------------------------------------------------------
   把当前登记的全部插图槽位（约会常服立绘 + 私密立绘 + 见面约会）
   连同每个槽位「该画什么」的那一句 `note` 导成一份 Markdown，放进 `public/cg/`，
   好对着它收图 / 画图、补完在文件名上打勾。

   槽位分两种，摆的地方不一样（见 public/cg/README.md 那张表）：
     · **CG** —— 见面约会那一档，**由上下文自动放置**，导演按这一场进展点名；
     · **立绘** —— 约会常服与私密档案立绘，**一人一张、文件名写死**，不进导演候选。

     node scripts/cglist.mjs          # 写 public/cg/清单.md
     node scripts/cglist.mjs --check  # 只报告还缺哪些，不写文件

   **这是生成物**（同 scripts/briefs → src/data/briefs/generated.ts 的关系）：
   槽位在两处 —— `src/data/intimate.ts`（那份名单**两族立绘共用**：私密立绘
   `cg-intim-<角色id>`、约会常服 `cg-datewear-<角色id>`）、
   `src/lib/rendezvous.ts`（见面约会，`DATE_CG` + `DATE_CG_INTIMATE`）——
   改完重跑这一条，别手改那份 md。

   （曾经还有第三处 `src/data/cgs.ts` 的 `CG_POOL`，那 6 张定妆半身当情境 CG 用；
   2026-09-13 立绘正名，并进 `cg-datewear-*` 一档，那个表连着文件一起删了。）

   ⚠ 那两处就是本文件认得的**全部**槽位来源。当初只认 `data/` 下的那两处，见面约会
   那五张（`lib/rendezvous.ts`）就整整齐齐漏了 —— 而且**不报错**，清单只是少一截。
   所以日后新开一处槽位表，必须同时加到这里；末尾那道重名检查（同一个 id 被两处登记）
   算是替这件事补的一半防线。

   「已补 / 待补」按目录里真的有没有这个文件判（webp / png / jpg 三种都认，
   与 src/lib/cg.ts 的候选链一致），所以这份清单可以反复重跑当进度看。
   **递归扫子目录、比的是相对 public/cg/ 的整条路径** —— 素材分了文件夹（`dir`）
   之后，只扫顶层会把补好的图全判成待补，且不报错（见下面 walk 的说明）。
   ============================================================ */

import { createServer } from 'vite'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHECK = process.argv.includes('--check')
const OUT = join('public', 'cg', '清单.md')

/** 候选扩展名 —— 与 src/lib/cg.ts 的 EXTS 同序 */
const EXTS = ['webp', 'png', 'jpg']

/**
 * 目录里现有的素材，收成一组**相对 `public/cg/` 的路径**（`/` 分隔）。
 *
 * **必须递归**：素材按戏码分了文件夹（`lunaNSFW/正常位/…`）之后，只扫顶层
 * 会把已经补好的图全判成「待补」—— 而且不报错，清单只是集体变回 ⬜。
 * 判有没有图照旧按候选链（webp → png → jpg），只是比较的是带目录的整条路径。
 */
function walk(dir, base = '') {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), rel))
    else out.push(rel)
  }
  return out
}

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { INTIMATE } = await server.ssrLoadModule('/src/data/intimate.ts')
  const { personOf } = await server.ssrLoadModule('/src/data/castmeta.ts')
  const { DATE_CG, DATE_CG_INTIMATE, DATE_BEATS, dateWearId, intimArtDir } =
    await server.ssrLoadModule('/src/lib/rendezvous.ts')

  const have = new Set(walk(join('public', 'cg')))
  /** 这个 id（可带子目录）有没有图；返回实际命中的**相对路径** */
  const found = (id, dir) => EXTS
    .map((e) => `${dir ? `${dir}/` : ''}${id}.${e}`)
    .find((f) => have.has(f)) ?? null
  const mark = (id, dir) => (found(id, dir) ? '✅' : '⬜')
  /** 该往哪个路径补 —— 清单里写全（含子目录），照着一行行对着补 */
  const pathOf = (id, dir) => (dir ? `${dir}/${id}` : id)

  /* CgRef 允许写成裸字符串（等价 { id }）—— 两种都归一化 */
  const norm = (r) => (typeof r === 'string' ? { id: r } : r)
  const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|')

  /* ---- ① 约会常服立绘 / ② 私密立绘 / ③ 见面约会 ----
     ①②两族立绘都挂在同一份名单（INTIMATE，18 位）上：一人一张、id 由 charId 现算，
     所以不另立登记表 —— 常服那一族的 id 现算那一步与视图共用 `dateWearId`，
     免得脚本和 components/DateSide.tsx 各写各的字符串。 */
  const wear = Object.keys(INTIMATE).map((charId) => ({
    id: dateWearId(charId),
    charId,
    name: personOf(charId)?.name ?? charId,
  }))
  const intim = Object.keys(INTIMATE).map((charId) => ({
    id: `cg-intim-${charId}`,
    charId,
    name: personOf(charId)?.name ?? charId,
    /* 立绘的 id 一人一张写死，**目录是登记的**（`rendezvous.ts` 的 INTIM_ART_DIR）——
       与 view 那边（Archive.tsx → CgSlot）问的是同一张表，免得两边各写各的路径。 */
    dir: intimArtDir(charId),
  }))
  /* 见面那一档的图位住在 lib/rendezvous.ts（不在 data/ 下，所以当初漏了这一处）。
     两张表都要：「到私密那一档才进候选」的那两张也是真槽位，只是候选面窄。 */
  const date = [...DATE_CG, ...DATE_CG_INTIMATE].map(norm)
  const dateIntimIds = new Set(DATE_CG_INTIMATE.map((r) => norm(r).id))
  /* 「什么时候进候选」那一列 —— 与 lib/rendezvous.ts 的 `dateCgPalette` 同一把尺，
     **三道**窄法都写出来：档位（私密那几张）、认人（带 `cast` 的要人在场）、
     节拍（带 `needs` 的要这一场**先走到那一步**）。
     这一列是给人看的，多写的半个字不花谁的钱；漏了才要命 —— 会照着旧规矩收图。 */
  const beatOf = new Map(DATE_BEATS.map((b) => [b.id, b]))
  const scopeOf = (d) => {
    let s = dateIntimIds.has(d.id) ? '`kind: intimate` 才进候选' : '每一场见面都能点'
    const cast = d.cast ?? []
    if (cast.length) s += ` · 还要 ${cast.map((c) => personOf(c)?.name ?? c).join('、')} 在场`
    /* 节拍那一道：连「走到哪一步」一并写出来 —— 只写一个 id，补图的人不知道指的是什么。
       登记表里查不到这个 id 就当场挑明（对着那一行写 ⚠），别让它安静地永远进不了候选。 */
    if (d.needs) {
      const beat = beatOf.get(d.needs)
      s += beat
        ? ` · 且这一场先走到「${beat.when}」（节拍 \`${beat.id}\`）`
        : ` · ⚠ 节拍 \`${d.needs}\` **没登记** —— 这一张永远进不了候选`
    }
    return s
  }

  /* 每个槽位连同它登记的目录一起过 —— 图分文件夹收了之后，判有没有图得带路走 */
  const allSlots = [
    ...wear.map((w) => ({ id: w.id, dir: w.dir, variants: 1 })),
    ...intim.map((i) => ({ id: i.id, dir: i.dir, variants: 1 })),
    ...date.map((d) => ({ id: d.id, dir: d.dir, variants: d.variants ?? 1 })),
  ]
  const allIds = allSlots.map((s) => s.id)
  /** 一个槽位该有的文件（多变体逐个展开成 `-1`…`-n`）—— 补图是一张张补的 */
  const filesOf = (s) => {
    const n = Math.max(1, Math.floor(s.variants ?? 1))
    if (n <= 1) return [s.id]
    return Array.from({ length: n }, (_, i) => `${s.id}-${i + 1}`)
  }
  const allFiles = allSlots.flatMap((s) => filesOf(s).map((id) => ({ id, dir: s.dir })))
  const total = allFiles.length
  const missing = allFiles.filter((f) => !found(f.id, f.dir)).map((f) => pathOf(f.id, f.dir))
  /** 一个槽位的补齐情况：全在 ✅ / 缺一部分 ◐ / 一张没有 ⬜ */
  const slotMark = (s) => {
    const want = filesOf(s)
    const hit = want.filter((id) => found(id, s.dir)).length
    return hit === want.length ? '✅' : hit ? '◐' : '⬜'
  }

  const L = []
  L.push('# 插图补图清单（生成物 · 别手改）')
  L.push('')
  L.push('两种东西：**CG**（见面约会那一档，由上下文自动放置）与**立绘**'
    + '（约会常服 · 私密档案立绘，一人一张、文件名写死，摆进见面页右栏与角色档案）。')
  L.push('')
  L.push('> 这份清单由 `node scripts/cglist.mjs` 从 `src/data/intimate.ts`、'
    + '`src/lib/rendezvous.ts` 导出。**改槽位要改那两处再重跑**，'
    + '手改这里下一次重跑就没了。')
  L.push('')
  L.push('## 怎么补')
  L.push('')
  L.push(`1. 图放 \`public/cg/\` 下，**路径照下表「文件名」那一列逐字对**（含子目录）—— `
    + `分文件夹收图是可以的，路径写在登记表里（CG 的 \`dir\`、立绘的 \`INTIM_ART_DIR\`），`
    + `扩展名按 \`${EXTS.join('` → `')}\` 依次试，备一种即可（webp 体积最小）。`)
  L.push('2. **不用改任何代码**：放一张亮一张；没图的槽位只留一行小字，写着该补的文件路径（不占版位）。')
  L.push('3. 版位形状由代码定（**约会 CG 3:2 `cover`；约会常服约 2:3 `contain`；私密立绘约 1:2 `contain`**），'
    + '出图规格不随仓库走 —— 详细说明见同目录 `README.md`。')
  L.push('4. 一个槽位画了几版（同一场戏的细微差别）**就给它编号**：`<id>-1`、`<id>-2`…'
    + '每次被导演点到就换下一版，转着圈来（不是动画帧）。下表「变体」那一列写着要几版。')
  L.push('5. 改了图不生效：`Ctrl+F5`（`public/` 下的文件不带扩展名哈希，浏览器会吃旧缓存）。')
  L.push('')
  L.push(`**当前进度：${total - missing.length} / ${total} 张已补`
    + `（还缺 ${missing.length} 张）** —— ✅ = 已补，⬜ = 待补，◐ = 多变体只补了一部分。`)
  L.push('')

  L.push('## 一、约会常服立绘（见面页右栏 · 一人一张）')
  L.push('')
  L.push('**这一族不是 CG**：文件名写死（`cg-datewear-<角色id>`），跟着人走，'
    + '**不进导演候选**、不落 `world.cg` —— 她一出场就该在见面页右栏里（特大）。'
    + '版位约 2 : 3 竖构图、按 `contain` 摆，**画得方一点也不会被裁**，只是两侧留空。')
  L.push('')
  L.push('| | 角色 | 文件名 |')
  L.push('| --- | --- | --- |')
  for (const w of wear) {
    L.push(`| ${mark(w.id, w.dir)} | ${cell(w.name)} | \`${pathOf(w.id, w.dir)}\` |`)
  }
  L.push('')

  L.push('## 二、私密档案立绘（档案卡背面左栏 · 只对女角色生效）')
  L.push('')
  L.push('版位是左栏那一根**窄高条（约 1 : 2）**、按 `contain` 摆（与正面那一栏同一套版式，'
    + '翻面时版面不跳）—— 画得更方也不会被裁，只是两侧留空。文件名固定 `cg-intim-<角色id>`。')
  L.push('')
  L.push('| | 角色 | 文件名 |')
  L.push('| --- | --- | --- |')
  for (const i of intim) {
    L.push(`| ${mark(i.id, i.dir)} | ${cell(i.name)} | \`${pathOf(i.id, i.dir)}\` |`)
  }
  L.push('')

  L.push('## 三、见面约会的图位（`src/lib/rendezvous.ts`）')
  L.push('')
  L.push('版位 **3 : 2 横构图**（宽 520 px 封顶，按 `cover` 裁，主体别贴边）。')
  L.push('前三张哪一场都进候选；私密那几张**只有这一场走到私密那一档**才进候选 —— '
    + '所以它们可以画得比前面三张更直给。')
  L.push('再往下还有人**认人**的：带 `cast` 的那一张除了档位，**还要名单上那一位在场**'
    + '（主位与同场的都算）—— 只属于某一个人的画，缺了人就不摆。')
  L.push('')
  L.push('素材按戏码分了子目录的，`dir` 那一栏就是它的家（下表「文件名」已经带上了目录，'
    + '照抄即可）—— 目录变了只改登记表里的 `dir`，文件名照旧不用动。')
  L.push('')
  L.push('| | 文件名 | 该画什么（`note`） | 什么时候进候选 | 变体 |')
  L.push('| --- | --- | --- | --- | --- |')
  for (const d of date) {
    const dir = d.dir ? `${d.dir}/` : ''
    const n = Math.max(1, Math.floor(d.variants ?? 1))
    const file = n <= 1 ? `\`${dir}${d.id}\`` : `\`${dir}${d.id}-1\` … \`-${n}\``
    const vcell = n <= 1 ? '单张' : `${n} 版 · 每次触发换下一版`
    L.push(`| ${slotMark(d)} | ${file} | ${cell(d.note)} | ${scopeOf(d)} | ${vcell} |`)
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

  /* 进度按**文件**数（多变体的槽位一张算一张），重名按**槽位**数 —— 两回事，别混着报 */
  const done = total - missing.length
  if (CHECK) {
    process.stdout.write(`CG 清单：共 ${total} 张（${allIds.length} 个槽位），已补 ${done}，还缺 ${missing.length}\n`)
    if (dupes.length) process.stdout.write('  重名（两处登记了同一个 id）：' + dupes.join('、') + '\n')
    if (missing.length) process.stdout.write(missing.map((m) => '  ' + m).join('\n') + '\n')
  } else {
    writeFileSync(OUT, L.join('\n'), 'utf8')
    process.stdout.write(`已写出 ${OUT}\n`)
    process.stdout.write(`共 ${total} 张：约会常服 ${wear.length}`
      + ` · 私密立绘 ${intim.length} · 见面约会 ${date.length} 个槽位`
      + ` —— 已补 ${done}，还缺 ${missing.length}\n`)
    if (dupes.length) process.stdout.write('  重名：' + dupes.join('、') + '\n')
  }
} finally {
  await server.close()
}
