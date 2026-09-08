/**
 * lib/charimg.ts — 角色头像 / 立绘素材解析。
 *
 * 素材约定（后续把真图丢进来即点亮，无需改码）：
 *   public/charimg/<avatarId>.png   档案角色 = 其 id；操作员 = operator.png
 *   同目录允许少量异名（alias）作为备用候选。
 * 全部缺省时由 <Portrait> 回退到「hue 底 + sigil」占位纹章。
 */

import { assetBase } from './assetbase'

/** 每个 avatarId 的候选文件名（主名在前，alias 兜底） */
const ALIASES: Record<string, string[]> = {
  operator: ['operator', 'yanwan-xinye', 'yanwan', 'yan-wan-xinye'],
}

function urlOf(file: string): string {
  return `${assetBase()}charimg/${encodeURIComponent(file)}.png`
}

/** 头像候选 URL 列表（先试主名，404 后顺延 alias） */
export function charImgCandidates(avatarId: string): string[] {
  const base = [avatarId]
  const alias = ALIASES[avatarId] ?? []
  return [...base, ...alias.filter((a) => a !== avatarId)].map(urlOf)
}

/** 主候选 URL（快速预加载用） */
export function charImgUrl(avatarId: string): string {
  return urlOf(avatarId)
}
