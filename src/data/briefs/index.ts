/* ============================================================
   事件详细大纲 —— 隐藏的那一份（按事件粒度喂导演）
   ------------------------------------------------------------
   与 `timeline.ts` 的 `summary` 分工：
     summary —— 一句话概述，给操作员看（剧情推进屏、任务板）。
     brief   —— 逐拍实施细则，**只给导演看**，不上屏。

   为什么要单开一份：
     OOC（人物走样）几乎都不是模型不会写，而是它手上没有够细的事实。
     只给一句话概述时，「这一节谁在场、他此刻知道什么、不知道什么、
     关键那句台词长什么样、什么算把这一节走完」全得靠模型自己编 ——
     编出来的当然不是原文里那个人。

   通道与 `eventnotes.ts` 一致：由 `buildDirectorSystem` 直接读 `briefOf(evId)`，
   不经世界书关键词扫描，因此**每回合必达**（表还没拉进来那一下除外 ——
   调用方拼提示词前会 `await ensureBriefs()`，见下面那一段）。

   铁律（与全项目一致）：内容须**逐字摘录**自源文献（`public/offtext/<id>.txt`
   即该事件的原文切片），绝不新增、改写或补全；**拿不准就留空** ——
   留空即该节整节不渲染，导演退回 summary，行为零差异。

   内容**不在本文件里**：`scripts/briefs/*.json` 是唯一真源（摘录时按卷分片），
   由 `node scripts/briefgen.mjs` 逐字校验过原文切片后生成 `generated.ts`。
   校验有一条对不上就整块拒绝 —— 大纲是给导演当事实用的，
   掺一条编的就等于整本不可信，所以宁可不出，也不出一份半真的。
   ============================================================ */

import type { EventBrief } from '../types'

/* ------------------------------------------------------------
   为什么要**懒加载**，而不是像原来那样静态 `import`
   ------------------------------------------------------------
   `generated.ts` 是两千多行中文，编译进包里 2.1 MB（gzip 880 KB）——
   主包 4.3 MB 里有**一半**是它。可它不是首屏要用的东西：只有真去推一回合、
   拼导演提示词那一刻才读得到。静态导入等于让每个打开终端的人先下完这一整本
   才看得见界面。改成动态导入之后，它自己一块 chunk，**要用的时候才拉**。

   与之配套的两件事：
     · `Terminal` 挂载时先 `void ensureBriefs()` 把它预热上 —— 于是「拉」发生在
       开屏之后、第一次推进之前那段空闲里，真到用的时候多半已经在了；
     · `Plot` 拼提示词前各 `await ensureBriefs()` 一次 —— 预热没赶上也不出错，
       那一下等的是同一块 chunk。
   拉不到时 `briefOf` 返回 undefined，导演**退回 summary**（这条退路本来就在，
   见上面「铁律」那一段：留空即该节整节不渲染，行为零差异）。
   ------------------------------------------------------------ */

let cache: Record<string, EventBrief> | null = null
let inflight: Promise<void> | null = null

/** 把大纲表拉进来（幂等，重复调用共用同一个 Promise）。 */
export function ensureBriefs(): Promise<void> {
  if (!inflight) {
    inflight = import('./generated').then((m) => { cache = m.EVENT_BRIEFS })
  }
  return inflight
}

/** 表到了没有。给调用方判「这一回合是有详纲可给，还是退回 summary」。 */
export function briefsLoaded(): boolean {
  return cache !== null
}

/**
 * 把表**直接交进来**，不走动态导入。
 *
 * 只给构建期脚本用（`scripts/mech/run.ts`）：它们是在 Node 里跑同步代码的，
 * 没有「等一块 chunk 落地」这回事，而且本来就能直接 `import './generated'`。
 * 让它们把**同一个对象**递进来还有个要紧的好处 —— 它们往表里插探针
 * （`EVENT_BRIEFS.__probe__ = …`）之后，`briefOf` 读到的是同一个引用。
 */
export function seedBriefs(table: Record<string, EventBrief>): void {
  cache = table
  inflight = Promise.resolve()
}

/** 这一事件的详细大纲；没摘 / 还没拉进来就返回 undefined（调用方退回 summary） */
export function briefOf(evId: string): EventBrief | undefined {
  return cache ? cache[evId] : undefined
}
