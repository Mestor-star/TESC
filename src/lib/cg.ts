/**
 * lib/cg.ts — CG（插画）素材解析。
 *
 * 素材约定（把真图丢进 public/cg/ 即点亮，无需改码）：
 *   <cgId>.webp|.png|.jpg
 * 取图规则：每个 id 按 webp → png → jpg 的顺序试；全部 404 时由 <CgSlot>
 * 走同一条**舞台兜底链**（见下面 `probeSceneCg`），三档全空才整块不出。
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
 *     （候选清单见 lib/rendezvous.ts 的 `dateCgPalette`；见 components/DateLane.tsx）
 *   · **立绘**：见面右栏的约会常服 —— 写死的 `cg-datewear-<角色id>`
 *     （id 由 lib/rendezvous.ts 的 `dateWearId` 现算；见 components/DateSide.tsx）
 *   · **立绘**：私密档案左栏 —— 写死的 `cg-intim-<角色id>`（见 views/Archive.tsx）
 *
 * **CG 由上下文自动放置，立绘不进候选**：立绘跟着人走，一人一张、文件名写死。
 *
 * 除了「取一张图」（`probeCg`），这里还有**舞台兜底链**（`probeSceneCg`）：
 * 选中的 CG → 该角色的**立绘**（`public/charimg/<id>`）。剧演舞台（Galgame）与
 * 见面右栏（DateSide）共用它 —— 两处各写一套，退到哪一档必然对不上。
 * 私密素材（`lunaNSFW/**`）在这条链上另有自己的闸，见那个函数的头注。
 *
 * ⚠ **没有「逐人的 SFW 图」这一档**（2026-… 撤掉）：主人给的那张
 * `lunaSFW/cg-date-shop-luna` 是**CG**（换上新衣那一刻的镜头），不是立绘 ——
 * 拿它当舞台/右栏的常驻兜底，等于把一张情节画铺到每一场见面里。
 * 兜底只往**立绘**退，退不到就整块不出。
 */

import { assetBase } from './assetbase'
import { probeCharImg } from './charimg'
import type { CgRef } from '../data/types'

/** 候选扩展名（按序试）。webp 在前：同画质下体积约为 png 的 1/3。 */
const EXTS = ['webp', 'png', 'jpg'] as const

/** 开发期（断言 / 提示只在开发期出声） */
const DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

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

/**
 * 探出第一个真能加载的候选 URL；全 404 → null。缓存键带上目录：同 id 换了文件夹要重探。
 *
 * 入参收 `CgRef | string`：**给 CgRef 时自己走 `cgFileOf`**（`file` 别名一并生效，
 * `dir` 也照它的登记走）。于是「忘了用 cgFileOf」在类型层就不成立 —— 从前只能靠
 * 调用方记得，谁直接拿 `cgIdOf(ref)` 进来就静默 404，再被兜底链悄悄盖住，错得不出声。
 * 传字符串照旧（旧调用一律可编译）。
 */
export function probeCg(ref: CgRef | string, dir?: string): Promise<string | null> {
  const file = typeof ref === 'string' ? ref : (ref.file ?? ref.id)
  const where = dir ?? (typeof ref === 'string' ? undefined : ref.dir)
  const key = `${where ?? ''}/${file}`
  const hit = probes.get(key)
  if (hit) return hit
  const p = new Promise<string | null>((resolve) => {
    const list = cgCandidates(file, where)
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

/* ============================================================
   开发期断言：CgRef.file 别名不许静默失败
   ------------------------------------------------------------
   `file` 别名（例：某个「另一条前提」的登记位 → 真文件另指一个 id）是**登记位**与
   **文件名**两套身份。取图那一侧只认文件名，所以谁把 `cgIdOf(ref)` 直接递进
   `probeCg` 就是一次静默 404 —— 探针照旧返回 null，兜底链再把它盖住，屏上看着没事，
   素材却一直没被读到。`probeCg` 那一侧已经靠入参类型收窄堵住了（给 CgRef 就自动走
   `cgFileOf`）；这里再加一道**人选**：装配候选时跑一遍，把漏网的登记位喊出来。
   只在 DEV 下生效，同一对（id → file）只喊一次。
   ============================================================ */
const warnedAlias = new Set<string>()

/** 逐个检查 CgRef：登记了 file 别名且与 id 不一致的，DEV 下 console.warn 一次（去重） */
export function assertCgRefs(refs: CgRef[]): void {
  if (!DEV) return
  for (const ref of refs) {
    if (typeof ref === 'string') continue
    if (!ref.file || ref.file === ref.id) continue
    const key = `${ref.id}→${ref.file}`
    if (warnedAlias.has(key)) continue
    warnedAlias.add(key)
    console.warn(
      `[cg] ${ref.id} 的素材文件名是 ${ref.file}（CgRef.file 别名）—— 取图请用 cgFileOf` +
      `（直接拿 cgIdOf 去 probeCg 会静默 404，还会被兜底链盖住）。`,
    )
  }
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


/** 取一个 CG 位**实际要的文件名**：登记了 file 别名就用别名，否则就是 id 本身。
 *  （别名存在的理由见 CgRef.file：同一份素材要在两种前提下各登记一次，又不许复制素材。） */
export function cgFileOf(ref: CgRef): string {
  return typeof ref === 'string' ? ref : (ref.file ?? ref.id)
}

/* ============================================================
   舞台兜底链（probeSceneCg）
   ------------------------------------------------------------
   问题：导演点的那张**没素材**（清单里有 id、public/cg 里没文件），
   或者这一场压根没人点名 —— 先前那两处就什么都不铺（舞台空着、右栏写「CG 待补」）。
   主人要的是「别留空」：退到**这一场真有的那张**上去。

   链子两档，**顺序即优先级**，第一档探通就用它：
     ① 选中的 CG（调用方已经过 dateCgPalette 三道窄法：档位 / 认人 / 节拍）；
     ② 该场角色的**立绘**（public/charimg/<id>.webp|png|jpg，走 probeCharImg）。
   两档全空 → null（调用方自己决定「那就什么都不摆」）。

   **CG 与立绘不混**（主人 2026-… ）：从前中间还夹着一档「每人的 SFW 图」，
   实际只有露娜一条 —— 而且那张 `cg-date-shop-luna` 画的是**换上新衣那一刻**，
   是 CG 不是立绘。把它当兜底，舞台与右栏每一场都在铺那张情节画。
   那一档整表已删：兜底一律往立绘退（charimg 才是「这个人长什么样」）。

   **不把私密图漏进普通约会**：这条链自己带一道闸 ——
   凡是 dir 落在 lunaNSFW/** 那种目录里的素材，只有调用方明说
   intimate: true（这一场确实到了私密那一档）才取；否则连试都不试。
   这道闸是**兜底链自己的**，与 dateCgPalette 那三道叠着 —— 两头各锁一次：
   这一层拿不到 Rendezvous，只拿到「谁是这一场的人」。
   ============================================================ */

/** 兜底命中的是第几档 */
export type SceneCgKind = 'cg' | 'portrait'

export interface SceneCg {
  /** 真能加载的 URL（已经探通，不是候选链） */
  url: string
  /** 摆上屏的素材 id（第一档是选中的那个 id，兜底档是兜底素材自己的 id） */
  id: string
  /** 是兜底来的（选中的那张没探到） */
  isFallback: boolean
  kind: SceneCgKind
  /** 这张画归谁 —— 图注里写名字用 */
  charId?: string
  /** 图注（选中的那条 CgRef.note，或兜底表里那一句） */
  note?: string
}


/** 目录名里带 nsfw（lunaNSFW/...）= 私密档素材 */
function isNsfwDir(dir?: string): boolean {
  return /nsfw/i.test(dir ?? '')
}

/**
 * 舞台 / 右栏那一格到底摆哪张：选中的 CG → 该角色的立绘（charimg）。
 *
 * @param refs          选中的那几张（按优先级；一般就一张。空 = 这一场没人点名）
 * @param charIds       这一场在场的人（**主位在前**）—— 兜底只在这几个人身上找
 * @param opts.intimate 这一场是不是已经到了私密那一档（kind === 'intimate'）。
 *                      只给「私密目录里的素材」放行，**不是**「到了就随便摆」的许可。
 */
export async function probeSceneCg(
  refs: CgRef[],
  charIds: string[],
  opts: { intimate?: boolean } = {},
): Promise<SceneCg | null> {
  const intimate = opts.intimate === true
  const here = charIds.filter(Boolean)

  /* ① 选中的那几张。私密目录里的素材没过 intimate 这一道就不试 —— 这是兜底层
        自己的闸（dateCgPalette 那三道之上再锁一次）。 */
  for (const ref of refs) {
    const dir = cgDirOf(ref)
    if (isNsfwDir(dir) && !intimate) continue
    const url = await probeCg(ref)
    if (url) return { url, id: cgIdOf(ref), isFallback: false, kind: 'cg', charId: here[0], note: cgNoteOf(ref) }
  }

  /* ② 立绘：public/charimg/<id>.webp|png|jpg（主位优先，主位缺图才轮到同场的人）。
     这一档是链子的**地板** —— 「这个人长什么样」只有立绘说得准，CG 说的是一幕。
     ⚠ 别在它前面再加一档「某人的某张画」：那正是 `cg-date-shop-luna` 当兜底时
     铺满每一场见面的来路（已撤）。 */
  for (const cid of [...here]) {
    const url = await probeCharImg(cid)
    if (url) {
      if (DEV) console.info('[cg] 兜底：退到 ' + cid + ' 的立绘')
      return { url, id: cid, isFallback: true, kind: 'portrait', charId: cid }
    }
  }

  return null
}
