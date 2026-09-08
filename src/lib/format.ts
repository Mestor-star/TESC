/* 通用格式化与严重度分级助手 */

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

/** R 值（现实密度）→ 状态 */
export function rSeverity(r: number): { cls: 'sev-ok' | 'sev-warn' | 'sev-hi'; color: string; label: string } {
  if (r >= 0.95 && r <= 1.05) return { cls: 'sev-ok', color: 'var(--steel)', label: '稳定' }
  if (r >= 0.88) return { cls: 'sev-warn', color: 'var(--amber)', label: '稀薄' }
  return { cls: 'sev-hi', color: 'var(--red)', label: '崩坏' }
}

/** 羁绊值 → 关系阶段名 */
export function bondName(v: number): string {
  if (v >= 95) return '约定'
  if (v >= 80) return '羁绊'
  if (v >= 60) return '信任'
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
