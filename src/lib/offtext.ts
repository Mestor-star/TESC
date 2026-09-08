/* ============================================================
   离线通读 —— 按事件懒加载 .canon 语料切出的原文片段
   ------------------------------------------------------------
   切片在构建期由 scripts/slice_events.py 生成到
   public/offtext/{eventId}.txt（不进 JS 包），运行时 fetch 一次并缓存。
   文件缺失时 throw，由视图行内呈现「未收录」，进度绝不硬卡。
   ============================================================ */

import { assetBase } from './assetbase'

const DIR = 'offtext'
const cache = new Map<string, string>()

/** 事件 id 形如 v1-1 / s1-3；白名单校验，避免拼出异常路径 */
const ID_RE = /^[a-z]\d-\d+$/

export async function loadOfflineText(eventId: string): Promise<string> {
  if (!ID_RE.test(eventId)) throw new Error(`非法的段位 id：${eventId}`)
  const hit = cache.get(eventId)
  if (hit !== undefined) return hit
  // 独立态=站根；宿主态=扩展目录（assetBase 按运行形态给出）
  const base = assetBase()
  const res = await fetch(`${base}${DIR}/${eventId}.txt`)
  if (!res.ok) throw new Error(`本段离线原文未收录（${eventId}）`)
  const text = await res.text()
  cache.set(eventId, text)
  return text
}

/** 供状态提示用：是否曾缓存过某段原文 */
export function hasOfflineCache(eventId: string): boolean {
  return cache.has(eventId)
}
