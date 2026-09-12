/**
 * lib/charimg.ts — 角色头像 / 立绘素材解析。
 *
 * 素材约定（把真图丢进 public/charimg/ 即点亮，无需改码）：
 *   <avatarId>.webp|.png|.jpg        立绘：竖构图整身（档案大图、剧情区人物框用）
 *   <avatarId>-face.webp|.png|.jpg   头像：方构图、脸居中偏上（小圆头像、行动表用）
 *   档案角色 = 其 id；操作员 = operator。同目录允许少量异名（alias）作为备用候选。
 *
 * 取图规则：<变体名> 找不到就退回同名主名（只放了立绘也能用），再顺延 alias；
 * 每个名字按 webp → png → jpg 的顺序试。全部 404 时由 <Portrait> 回退「hue 底 + sigil」占位纹章。
 *
 * 换图只要**换个更靠前的扩展名**就能盖掉旧的：想替掉现成的 .jpg 头像，
 * 丢一个同名的 .webp 或 .png 进去即可，不必先删旧文件（webp/png 排在 jpg 前面）。
 */

import { assetBase } from './assetbase'

/** 素材变体：face = 方构图头像（小圆位），full = 竖构图立绘（大图位） */
export type CharImgVariant = 'face' | 'full'

/**
 * 候选扩展名（按序试）。webp 在前：同画质下体积约为 png 的 1/3。
 * jpg 排最后，只作兜底 —— 它没有透明通道，透明区会露出深色底（见 Portrait.tsx）。
 * 只备一种扩展名时，前面几种会让每个槽位各多几次 404；想省掉就把常用的那种挪到最前。
 */
const EXTS = ['webp', 'png', 'jpg'] as const

/** 每个 avatarId 的候选主名（不含扩展名；主名在前，alias 兜底） */
const ALIASES: Record<string, string[]> = {
  operator: ['operator', 'yanwan-xinye', 'yanwan', 'yan-wan-xinye'],
}

/** cover 槽位的缺省取景重心：官方立绘多是整身，脸在画面上部 */
export const FACE_FOCUS = 'center 20%'

/* 曾经有过一档 BUST_FOCUS（'50% 6%'）：给「手上只有整身立绘、版位却是方框」的
   操作员版位重新对位用的（Archive 横幅、App 侧栏身份卡）。operator-face.webp 补上
   之后这两处都用方图了，取景不再是问题 —— 于是把它撤掉。若哪天操作员的方图没了、
   又退回拿 675×1200 整身稿填方框，这两处就得把那一档重新立起来。 */

function urlOf(file: string, ext: string): string {
  return `${assetBase()}charimg/${encodeURIComponent(file)}.${ext}`
}

/** 候选 URL 列表：变体名 → 主名 → alias，各自先 webp 后 png；404 逐个顺延 */
export function charImgCandidates(avatarId: string, variant: CharImgVariant = 'full'): string[] {
  const alias = (ALIASES[avatarId] ?? []).filter((a) => a !== avatarId)
  const names = [...new Set([
    ...(variant === 'face' ? [`${avatarId}-face`] : []),
    avatarId,
    ...alias,
  ])]
  return names.flatMap((n) => EXTS.map((e) => urlOf(n, e)))
}

/** 主候选 URL（快速预加载用） */
export function charImgUrl(avatarId: string, variant: CharImgVariant = 'full'): string {
  return urlOf(variant === 'face' ? `${avatarId}-face` : avatarId, EXTS[0])
}

/* 素材是否到位：按「变体:id」缓存探针结果。
   有些版位（档案卡顶图）在缺图时宁可不摆 —— 一个空纹章带比没有带更难看。
   Portrait 自己能回退，但它的回退结果在渲染完才知道；这里提前问一句，好决定摆不摆。 */
const probes = new Map<string, Promise<string | null>>()

/** 探出第一个真能加载的候选 URL；全 404 → null。同一 id 只探一次 */
export function probeCharImg(avatarId: string, variant: CharImgVariant = 'full'): Promise<string | null> {
  const key = `${variant}:${avatarId}`
  const hit = probes.get(key)
  if (hit) return hit
  const p = new Promise<string | null>((resolve) => {
    const list = charImgCandidates(avatarId, variant)
    let i = 0
    const next = (): void => {
      if (i >= list.length) { resolve(null); return }
      const url = list[i++]
      const img = new Image()
      img.onload = () => resolve(url)
      img.onerror = next
      img.src = url
    }
    next()
  })
  probes.set(key, p)
  return p
}
