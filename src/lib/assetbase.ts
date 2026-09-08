/**
 * lib/assetbase.ts — 应用资源基址（带尾斜杠）。
 * 独立 SPA 形态（dev/preview/GitHub Pages）：站点根 BASE_URL。
 * 离文本/资产在站根下（如 /offtext/、/assets/）。
 */

let cached: string | null = null

export function assetBase(): string {
  if (cached !== null) return cached
  cached = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '') + '/'
  return cached
}

/** 测试钩子：清掉基址缓存（基址口径变动后重算用） */
export function __clearAssetBase(): void {
  cached = null
}
