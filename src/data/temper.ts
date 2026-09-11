/* ============================================================
   性情分期 —— 性格不是常量
   ------------------------------------------------------------
   人物卡（`persona.ts`）写的是那个人**底色**上的样子：怎么说话、什么脾气、
   踩哪一句会翻脸。这些整卷不变，所以每回合原样注入（见 `plot.ts` 的
   `temperSection`），当「锚」用 —— 防 OOC 靠的是事实，不是叮嘱。

   可底色之外还有一层：**同一个人在故事的不同阶段，是不同的人**。
   露娜在「使用者契约」之前与之后，对言万心叶的态度、说话的分寸、
   能忍与不能忍的东西，全都不一样；把前期的写法用到后期，或者反过来，
   都是走样 —— 而且是那种「单看每一句都像，连起来就是不对」的走样。

   所以这里按**事件分期**给一份叠加层，与人物卡的分工是：
     persona.ts —— 这一层整卷不变（锚）
     temper.ts  —— 这一层读到某一段就翻篇（叠加）

   分期写法与 `address.ts`（称呼）、`bondstage.ts`（关系上限）一致：
     from —— 读到这一段时间线事件（含）之后才适用；缺省 = 不限
     min  —— 羁绊达到该值起适用；缺省 = 不限
   一条规则适用即叠加，按数组顺序**后者覆盖前者**（写得越靠后越"晚"）。

   铁律（与全项目一致）：`note` / `forbid` 须**逐字摘录或严格转述**自源文献
   （`public/offtext/`、`.canon/` 里的原文）；绝不新增、改写或补全设定。
   **拿不准就留空** —— 没有分期规则的角色只吃人物卡那一层，行为零差异。

   键 = 角色 id（`chars.ts` / `sidecast.ts` 的 id）。
   ============================================================ */

import type { CharId } from './types'
import { TIMELINE } from './timeline'

export interface TemperStage {
  /** 读到这一段（含）之后才适用；缺省 = 不限 */
  from?: string
  /** 羁绊达到该值起适用；缺省 = 不限 */
  min?: number
  /** 这一阶段他/她的性情怎么样了 —— 一两句，逐字取自原文的口径 */
  note: string
  /** 这一阶段**明确不要写出去**的方向（越界即走样） */
  forbid?: string[]
}

/** 事件 id → 阅读序下标；不认得的事件返回 -1（当作「永远够不着」） */
const IDX = (evId: string) => TIMELINE.findIndex((e) => e.id === evId)

export const TEMPER: Partial<Record<CharId, TemperStage[]>> = {
  /* 当前为空：卷一的分期内容（尤其露娜在 v1-9 使用者契约前后的两种样子）
     待逐卷从原文摘录后补入。留空即不加这层叠加，导演只吃人物卡那一层。 */
}

/**
 * 这一角色**当下**该叠哪一层性情；没有分期规则、或一条都够不着时返回 null。
 *
 * @param done 已读到第几个事件（阅读序下标；`-1` = 还没开始读）。
 *             由调用方给 —— 它才知道剧情推到哪了。
 *
 * 按数组顺序扫，后一条覆盖前一条：写得越靠后就越"晚"。
 * 纯函数，好让复核把「前期 / 后期 / 边界那一天」三种情形都摆一遍。
 */
export function temperAt(charId: string, bond: number, done: number): TemperStage | null {
  const rules = TEMPER[charId as CharId]
  if (!rules?.length) return null
  let hit: TemperStage | null = null
  for (const r of rules) {
    if (r.from !== undefined && (IDX(r.from) < 0 || done < IDX(r.from))) continue
    if (r.min !== undefined && bond < r.min) continue
    hit = r
  }
  return hit
}
