/**
 * lib/cg.ts — CG（插画）素材解析。
 *
 * 素材约定（把真图丢进 public/cg/ 即点亮，无需改码）：
 *   <cgId>.webp|.png|.jpg
 * 取图规则：每个 id 按 webp → png → jpg 的顺序试；全部 404 时由 <CgSlot>
 * 回退成一行「待补」提示（**不占版位**，见该组件文件头）。
 *
 * 换图只要**换个更靠前的扩展名**就能盖掉旧的：想替掉现成的 .jpg，
 * 丢一个同名的 .webp 或 .png 进去即可，不必先删旧文件。
 *
 * 与 charimg.ts 的分工：那边管「谁长什么样」（角色头像/立绘，按 avatarId），
 * 这边管「画出来的那一张图」。两套 id 各走各的目录，互不覆盖。
 *
 * 这里只管**取图**（候选链 + 探针缓存）——「哪一张该上屏」由各调用方自己定。
 * 上屏三处，**CG 与立绘不是一回事**（主人立的规矩）：
 *   · **CG**：见面约会顶部那张 —— 导演点名，记在 `world.cg[d:uuid]`
 *     （候选清单见 lib/rendezvous.ts 的 `dateCgPalette`；见 views/Tavern.tsx）
 *   · **立绘**：见面右栏的约会常服 —— 写死的 `cg-datewear-<角色id>`
 *     （id 由 lib/rendezvous.ts 的 `dateWearId` 现算；见 components/DateSide.tsx）
 *   · **立绘**：私密档案左栏 —— 写死的 `cg-intim-<角色id>`（见 views/Archive.tsx）
 *
 * **CG 由上下文自动放置，立绘不进候选**：立绘跟着人走，一人一张、文件名写死。
 */

import { assetBase } from './assetbase'
import type { CgRef } from '../data/types'

/** 候选扩展名（按序试）。webp 在前：同画质下体积约为 png 的 1/3。 */
const EXTS = ['webp', 'png', 'jpg'] as const

/** 把 `分类/子分类` 逐段编码再拼成前缀 —— 整串 encode 会把 `/` 也吃掉 */
function dirPrefix(dir?: string): string {
  return dir ? dir.split('/').map(encodeURIComponent).join('/') + '/' : ''
}

function urlOf(file: string, ext: string, dir?: string): string {
  return `${assetBase()}cg/${dirPrefix(dir)}${encodeURIComponent(file)}.${ext}`
}

/** 候选 URL 列表：同一 id 先 webp 后 png 再 jpg，404 逐个顺延 */
export function cgCandidates(cgId: string, dir?: string): string[] {
  return EXTS.map((e) => urlOf(cgId, e, dir))
}

/** 主候选 URL（快速预加载用） */
export function cgUrl(cgId: string, dir?: string): string {
  return urlOf(cgId, EXTS[0], dir)
}

/* 素材是否到位：按 cgId 缓存探针结果，同一 id 只探一次。
   CG 位「缺图时摆占位框」与「到位时摆图」是两种版式，
   渲染完才知道有没有图就晚了 —— 这里提前问一句。 */
const probes = new Map<string, Promise<string | null>>()

/** 探出第一个真能加载的候选 URL；全 404 → null。缓存键带上目录：同 id 换了文件夹要重探 */
export function probeCg(cgId: string, dir?: string): Promise<string | null> {
  const key = `${dir ?? ''}/${cgId}`
  const hit = probes.get(key)
  if (hit) return hit
  const p = new Promise<string | null>((resolve) => {
    const list = cgCandidates(cgId, dir)
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

/** 测试钩子：清掉探针缓存（换素材后重探用） */
export function __clearCgProbes(): void {
  probes.clear()
}

/** 取一个 CG 位的 id（字符串写法即只有 id） */
export function cgIdOf(ref: CgRef): string {
  return typeof ref === 'string' ? ref : ref.id
}

/** 取一个 CG 位的图注（字符串写法没有图注） */
export function cgNoteOf(ref: CgRef): string | undefined {
  return typeof ref === 'string' ? undefined : ref.note
}

/** 取一个 CG 位的素材子目录（字符串写法 = 顶层） */
export function cgDirOf(ref: CgRef): string | undefined {
  return typeof ref === 'string' ? undefined : ref.dir
}

/** 取一个 CG 位有几个变体（字符串写法 = 单张） */
export function cgVariantsOf(ref: CgRef): number {
  return typeof ref === 'string' ? 1 : Math.max(1, Math.floor(ref.variants ?? 1))
}

/**
 * 多变体槽位的**第 k 张**的文件 id（k 从 1 数，越界绕回）。
 * 单变体槽位原样返回 —— 文件名不带 `-1`。
 */
export function cgVariantId(cgId: string, variants: number, k: number): string {
  if (variants <= 1) return cgId
  return `${cgId}-${((k - 1) % variants) + 1}`
}
