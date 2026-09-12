/* ============================================================
   在场名册
   ------------------------------------------------------------
   一个事件的「谁在场」有两条来源：
     ev.cast —— 依原文逐事件判定的现场名册（可含 roster 里的外场角色）
     ev.chars —— 老字段，只有四位主角，且含「受影响但未到场」者
   castOf 是唯一的读取入口：有 cast 用 cast，没有则回落到 chars。
   这样数据回填可以逐事件进行，没填的事件行为不变。
   ============================================================ */

import type { TimelineEvent } from '../data/types'
import { personOf } from '../data/castmeta'

/** 本事件现场在场者的 id 列表（cast 缺省时回落 chars） */
export function castOf(ev: Pick<TimelineEvent, 'cast' | 'chars'>): string[] {
  return ev.cast && ev.cast.length ? ev.cast : (ev.chars as string[])
}

/** 名录里存在的人才保留（防止原文笔误的 id 渗进界面） */
export function knownCastOf(ev: Pick<TimelineEvent, 'cast' | 'chars'>): string[] {
  return castOf(ev).filter((id) => !!personOf(id))
}

/** id → 显示名（名录查不到时原样返回 id） */
export const castName = (id: string): string => personOf(id)?.name ?? id

/** 侧栏/快照里的一行：只带名录能提供的显示字段 */
export interface CastRow {
  id: string
  name: string
  sigil: string
  hue: string
}

/** 单个 id → 展示行（名录查不到 → null，调用方自行丢弃） */
export function rosterRowOf(id: string): CastRow | null {
  const p = personOf(id)
  return p ? { id: p.id, name: p.name, sigil: p.sigil, hue: p.hue } : null
}

/** 一组 id → 展示行（按给到的顺序；名录外的 id 丢弃） */
export function rosterRowsFor(ids: string[]): CastRow[] {
  const out: CastRow[] = []
  for (const id of ids) {
    const r = rosterRowOf(id)
    if (r) out.push(r)
  }
  return out
}

/**
 * 某事件的在场展示行（按在场顺序；名录外的 id 丢弃）。
 * 剧情右栏与低语者日志的「出场角色」共用此一处，不再各自写死名单。
 *
 * 这是**静态**名册（`ev.cast`）。要摆「此刻真的在场上的人」，先过
 * `world.cast` 那一层实时修正（Terminal 的 `castOfEvent`），再喂给 `rosterRowsFor`。
 */
export function rosterRowsOf(ev: Pick<TimelineEvent, 'cast' | 'chars'>): CastRow[] {
  return rosterRowsFor(knownCastOf(ev))
}
