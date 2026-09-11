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
   不经世界书关键词扫描，因此**每回合必达**。

   铁律（与全项目一致）：内容须**逐字摘录**自源文献（`public/offtext/<id>.txt`
   即该事件的原文切片），绝不新增、改写或补全；**拿不准就留空** ——
   留空即该节整节不渲染，导演退回 summary，行为零差异。

   内容**不在本文件里**：`scripts/briefs/*.json` 是唯一真源（摘录时按卷分片），
   由 `node scripts/briefgen.mjs` 逐字校验过原文切片后生成 `generated.ts`。
   校验有一条对不上就整块拒绝 —— 大纲是给导演当事实用的，
   掺一条编的就等于整本不可信，所以宁可不出，也不出一份半真的。
   ============================================================ */

import type { EventBrief } from '../types'
import { EVENT_BRIEFS as GENERATED } from './generated'

export const EVENT_BRIEFS: Record<string, EventBrief> = GENERATED

/** 这一事件的详细大纲；没摘就返回 undefined（调用方退回 summary） */
export function briefOf(evId: string): EventBrief | undefined {
  return EVENT_BRIEFS[evId]
}
