/* 通用格式化与严重度分级助手 */

import { R_SEVERE_OUT, rOutOf } from '../data/types'

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 终末 Stage 0-10 → 视觉严重度（低/中/高/极） */
export function stageSeverity(stage: number): { cls: 'sev-ok' | 'sev-warn' | 'sev-hi'; color: string; label: string } {
  if (stage <= 2) return { cls: 'sev-ok', color: 'var(--steel)', label: '低' }
  if (stage <= 4) return { cls: 'sev-warn', color: 'var(--amber)', label: '中' }
  if (stage <= 6) return { cls: 'sev-hi', color: 'var(--red)', label: '高' }
  return { cls: 'sev-hi', color: '#ff5470', label: '极危' }
}

/**
 * R 值（现实密度）→ 状态。
 * 判的是**偏离正常区间多少**，两侧同判：低于 0.98 与高于 1.02 一样是异常，
 * 且偏离越远越重。早先只判偏低一侧，R 值偏高会掉进「中危」那一档被当成轻微 —— 那是不对的。
 * 区间取 data/types.ts 的 R_NORMAL_LO / R_NORMAL_HI，勿在此另写一份。
 */
export function rSeverity(r: number): { cls: 'sev-ok' | 'sev-warn' | 'sev-hi'; color: string; label: string } {
  const out = rOutOf(r)
  if (out === 0) return { cls: 'sev-ok', color: 'var(--steel)', label: '稳定' }
  if (out <= R_SEVERE_OUT) return { cls: 'sev-warn', color: 'var(--amber)', label: '轻度异常' }
  return { cls: 'sev-hi', color: 'var(--red)', label: '重度异常' }
}

/** 羁绊目标角色的性别视角：女性高羁绊 → 恋爱类称谓；男性 → 友情类；缺省/未知 → 中性旧文案 */
export type BondGender = 'f' | 'm' | '?'

/** 羁绊值 → 关系阶段名（按目标性别取称谓；女性→爱慕/倾心/心动，男性→挚友/信赖/投缘） */
export function bondName(v: number, opts?: { gender?: BondGender }): string {
  const g = opts?.gender
  if (v >= 95) return g === 'f' ? '爱慕' : g === 'm' ? '挚友' : '约定'
  if (v >= 80) return g === 'f' ? '倾心' : g === 'm' ? '信赖' : '羁绊'
  if (v >= 60) return g === 'f' ? '心动' : g === 'm' ? '投缘' : '信任'
  if (v >= 40) return '熟识'
  return '初见'
}

export function clock(now?: Date): string {
  const d = now ?? new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}
