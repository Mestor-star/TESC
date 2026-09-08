/**
 * lib/assetbase.ts — 应用资源基址（带尾斜杠），区分两种运行形态：
 *  - 独立态（dev/preview/GitHub Pages，window.SillyTavern 不存在）：站点根 BASE_URL。
 *    spa 产物里离文本/资产在站根下（如 /offtext/、/assets/）。
 *  - 宿主态（作为酒馆扩展运行，ESM 注入 ST 页面）：import.meta.url 指向扩展
 *    index.js，取其所在目录即扩展根（/extensions/zts-terminal/），
 *    离文本/字体/内嵌 CSS 都相对该目录放置。
 */

import { isST } from '../st/host'

let cached: string | null = null

export function assetBase(): string {
  if (cached !== null) return cached
  if (isST()) {
    cached = new URL('./', import.meta.url).href
  } else {
    cached = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '') + '/'
  }
  return cached
}

/** 测试钩子：清掉基址缓存（换形态后重算用） */
export function __clearAssetBase(): void {
  cached = null
}
