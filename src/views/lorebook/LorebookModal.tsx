/* ============================================================
   世界书管理器 · 浮层形态（薄壳）
   ------------------------------------------------------------
   全部管理逻辑已上收至 LoreManager（本目录），剧情推进等处仍
   沿用 <LorebookModal open onClose> 的浮层语义。
   ============================================================ */

import { LoreManager } from './LoreManager'

interface LorebookModalProps {
  open: boolean
  onClose: () => void
}

export function LorebookModal({ open, onClose }: LorebookModalProps) {
  return <LoreManager embedded={false} open={open} onClose={onClose} />
}
