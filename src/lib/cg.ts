/**
 * lib/cg.ts — 场景 CG（插画）素材解析。
 *
 * 素材约定（把真图丢进 public/cg/ 即点亮，无需改码）：
 *   <cgId>.webp|.png|.jpg
 * 取图规则：每个 id 按 webp → png → jpg 的顺序试；全部 404 时由 <CgSlot>
 * 回退「待补」占位框（版位照旧占着，图补上之后版面不跳）。
 *
 * 换图只要**换个更靠前的扩展名**就能盖掉旧的：想替掉现成的 .jpg，
 * 丢一个同名的 .webp 或 .png 进去即可，不必先删旧文件。
 *
 * 与 charimg.ts 的分工：那边管「谁长什么样」（角色头像/立绘，按 avatarId），
 * 这边管「这一幕长什么样」（场景 CG，按 SagaScene.cg 里登记的 id）。
 * 两套 id 各走各的目录，互不覆盖。
 */

import { assetBase } from './assetbase'
import type { CgRef, CgWhen, FlagValue } from '../data/types'

/** 候选扩展名（按序试）。webp 在前：同画质下体积约为 png 的 1/3。 */
const EXTS = ['webp', 'png', 'jpg'] as const

function urlOf(file: string, ext: string): string {
  return `${assetBase()}cg/${encodeURIComponent(file)}.${ext}`
}

/** 候选 URL 列表：同一 id 先 webp 后 png 再 jpg，404 逐个顺延 */
export function cgCandidates(cgId: string): string[] {
  return EXTS.map((e) => urlOf(cgId, e))
}

/** 主候选 URL（快速预加载用） */
export function cgUrl(cgId: string): string {
  return urlOf(cgId, EXTS[0])
}

/* 素材是否到位：按 cgId 缓存探针结果，同一 id 只探一次。
   CG 位「缺图时摆占位框」与「到位时摆图」是两种版式，
   渲染完才知道有没有图就晚了 —— 这里提前问一句。 */
const probes = new Map<string, Promise<string | null>>()

/** 探出第一个真能加载的候选 URL；全 404 → null */
export function probeCg(cgId: string): Promise<string | null> {
  const hit = probes.get(cgId)
  if (hit) return hit
  const p = new Promise<string | null>((resolve) => {
    const list = cgCandidates(cgId)
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
  probes.set(cgId, p)
  return p
}

/** 测试钩子：清掉探针缓存（换素材后重探用） */
export function __clearCgProbes(): void {
  probes.clear()
}

/* ============================================================
   按上下文挑图
   ------------------------------------------------------------
   判据只看**主角做过什么**（world 里那本账：flags / pick / 好感），
   不看读到第几段 —— 和剧情推进、好感一个口径。所以同一段里，
   他做过的事不同，摆出来的图就不同；什么都没做就是兜底那张。
   ============================================================ */

/** 求值用的世界切片。只取这三样，好让调用方不必把整个 WorldState 递进来。 */
export interface CgContext {
  flags: Record<string, FlagValue>
  pick: Record<string, string>
  /** 某角色此刻的好感（一般直接传 Terminal 的 bondNow） */
  bond: (char: string) => number
}

/** 一个条件是否成立（各项为「与」；未写的项不参与判定） */
export function cgWhenHolds(when: CgWhen | undefined, ctx: CgContext): boolean {
  if (!when) return true
  for (const [id, key] of when.pick ?? []) {
    if (ctx.pick[id] !== key) return false
  }
  for (const [flag, want] of when.flag ?? []) {
    if (ctx.flags[flag] !== want) return false
  }
  for (const g of when.bond ?? []) {
    if (ctx.bond(g.char) < g.value) return false
  }
  return true
}

/** 取一个 CG 位的 id（字符串写法即无条件位） */
export function cgIdOf(ref: CgRef): string {
  return typeof ref === 'string' ? ref : ref.id
}

/** 取一个 CG 位的图注（字符串写法没有图注） */
export function cgNoteOf(ref: CgRef): string | undefined {
  return typeof ref === 'string' ? undefined : ref.note
}

/**
 * 从一段场景的候选位里挑出此刻该摆的。两条路，优先第一条：
 *
 *   ① **导演点名**（`chosen`，即 `WorldState.cg[事件id]`）—— 它读着当前这一回合的叙述，
 *      从候选清单里挑了一张。图就该跟着实际在演的这一幕走，所以这一条说了算。
 *      只认清单里有的 id：认不出来的当没点（见下）。
 *   ② **兜底**（导演还没点过名：新段刚铺开，或这一段走了离线通读）—— 按 `when` 过滤：
 *      `'all'` 把成立的都摆出来当分镜，`'one'` 只留最后一条成立的（数组从泛到专）。
 *
 * 一条都不成立时返回空数组 —— 该段此刻不摆图（缺图与「不摆」是两回事：
 * 位子成立但素材没到，仍会占一个「待补」框；位子不成立，整格不出现）。
 */
export function selectCg(
  refs: CgRef[] | undefined,
  ctx: CgContext,
  mode: 'all' | 'one' = 'all',
  chosen?: string | null,
  pool?: CgRef[],
): CgRef[] {
  const own = refs ?? []
  /* 导演点名时，本段的与**通用池**的一起找 —— 通用池就是为这一刻存在的。
     只认登记过的 id：认不出来（模型编的、或清单改过之后留下的旧值）就当没点，退回兜底。 */
  if (chosen) {
    const one = [...own, ...(pool ?? [])].find((r) => cgIdOf(r) === chosen)
    if (one) return [one]
  }
  /* 兜底只看本段自己登记的：通用池**不主动冒出来** ——
     否则每一段一铺开，都先摆出一张跟此刻无关的通用图，很吵。 */
  if (!own.length) return []
  const hit = own.filter((r) => cgWhenHolds(typeof r === 'string' ? undefined : r.when, ctx))
  if (mode === 'one') {
    if (!hit.length) return []
    /* 纯清单 —— 一条 `when` 都没写，整份清单就是等着导演点名的那份菜单。
       这种场景下导演还没点名时（新段刚铺开、或这段走的离线通读），总得先摆一张，
       摆**菜单的头一张**最合直觉：作者把它写在最前，本就是当「开场这张」用的。
       写了 `when` 的则照旧取最后一条成立的 —— 那是「从泛到专」的兜底排序。 */
    const hasWhen = own.some((r) => typeof r !== 'string' && r.when)
    return [hasWhen ? hit[hit.length - 1] : hit[0]]
  }
  return hit
}

/**
 * 通用池按出场阵容过一遍：带 `cast` 的位，只有本段在场的人里有其一才留下；
 * 不带 `cast` 的视为哪一段都能用。
 * `present` 传本段的现场名册（一般就是 `castOf(ev)` 的结果）。
 */
export function cgPoolFor(pool: CgRef[] | undefined, present: string[]): CgRef[] {
  if (!pool?.length) return []
  const who = new Set(present)
  return pool.filter((r) => {
    const cast = typeof r === 'string' ? undefined : r.cast
    return !cast?.length || cast.some((id) => who.has(id))
  })
}

/**
 * 把一段场景登记的 CG 位渲染成给导演看的候选清单（每行 `- id —— 说明`）。
 * 没有登记（或都没写说明）时返回空串 —— 调用方据此整节不注入。
 * 说明一个字都没有的位写成「（无说明）」，好让作者一眼看出漏填了 —— 那种位导演没法选。
 */
export function cgPaletteBlock(refs: CgRef[] | undefined): string {
  if (!refs?.length) return ''
  return refs
    .map((r) => `- ${cgIdOf(r)} —— ${cgNoteOf(r)?.trim() || '（无说明）'}`)
    .join('\n')
}

/**
 * 给导演看的完整候选清单：本段登记的与**通用池**分两节列，好让它知道哪些是这一段专属的。
 * 两节都空时返回空串 —— 调用方据此整节不注入。
 */
export function cgPaletteText(own: CgRef[] | undefined, pool: CgRef[] | undefined): string {
  const parts: string[] = []
  const a = cgPaletteBlock(own)
  const b = cgPaletteBlock(pool)
  if (a) parts.push(`【本段登记的图位】\n${a}`)
  if (b) parts.push(`【通用图位 · 哪一段都可能用得上】\n${b}`)
  return parts.join('\n\n')
}
