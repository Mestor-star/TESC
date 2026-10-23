/**
 * components/CgSlot.tsx — CG 位（约会场景图）与立绘位（私密档案左栏）。
 *
 * 素材即插即用：public/cg/<cgId>.webp|png|jpg 到位就显示（约定见 lib/cg.ts）。
 *
 * **缺图不再写「CG 待补」**（2026-10-21 改）。先前这里缺图会塌成一行小字
 * （`CG 待补 · 文件路径`）—— 剧演舞台与见面右栏那两处早已改走 lib/cg.ts 的
 * **兜底链**，只剩这一处还在报缺，同一个「没素材」在两处说两种话。
 * 现在这一格也走 `probeSceneCg`：选中的 CG → 在场主位的 SFW 图 → 她的立绘。
 * 探不到任何一档时**整块不出**（不渲染占位文案，连 figure 都不长），
 * 只在开发期 console.info 留一行 —— 「缺图」这件事归开发期知道，不归玩家看。
 *
 * 兜底链要认得「这一格归谁」，**从 props 传**（`charIds` / `intimate`），
 * 组件自己不读全局：同一份组件在私密档案左栏那种没有「在场人」的地方就只探第一档，
 * 探不到就整块不出。
 *
 * 两种摆法（**都只在有图时生效**）：
 *   · 默认（自带比例）—— 约会页那种横图位，`ratio` 定形状，自己占一块地方；
 *   · `fill`（铺满）—— 不带走自己的比例，绝对定位填满**有定位的**父容器。
 *     档案卡左栏那种「立绘整身铺满 + 右缘渐隐」用它，留白与底色归父栏管。
 *
 * 与 Portrait 的分工：Portrait 缺图会回退成纹章（必须摆一个位子的地方用），
 * CgSlot 缺图整块不出。两者都不参与推演，纯展示。
 *
 * 两个分支（有图 / 兜底来的图）都挂 `data-cg-slot="<实际摆上去的素材 id>"`：
 * 说的是「这一格此刻摆的是哪个素材」，**与有没有图无关**（兜底命中时记的是兜底那张）。
 * 另有 `data-cg-ref="<调用方点的登记位>"`（兜底前后都是同一个，便于对照）与
 * `data-cg-fallback="<档位>"`（只在兜底命中时挂）。冒烟靠 `data-cg-slot` 判
 * 某一格认没认下某个 id —— 不带这个把手就只能去认图注那一行文字，
 * 而图注是写给人看的、随时会改。
 * （叫 `cg-slot` 而不是 `cg`：立绘也走这个组件，而「立绘 ≠ CG」是立过的规矩。）
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { probeCg, probeSceneCg } from '../lib/cg'
import type { SceneCgKind } from '../lib/cg'

import css from './CgSlot.module.css'

const DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

export interface CgSlotProps {
  /** 素材 id（= public/cg/<id>.* 的 <id>） */
  cgId: string
  /** 素材所在的子目录（相对 public/cg/，如 `lunaNSFW/正常位`）。缺省 = 顶层 */
  dir?: string
  /** 图注；缺省显示 id，好让人一眼知道该往哪个文件名补图。`fill` 模式下由调用方写在父栏底部 */
  caption?: string
  /** 版位宽高比（CSS aspect-ratio），缺省 16/9。`fill` 模式下不起作用 */
  ratio?: string
  /** 单张最大宽度 px */
  maxWidth?: number
  /** 图片填充方式：`cover`（缺省，裁满一格）／`contain`（整张完整可见，立绘与整身用这个） */
  fit?: 'cover' | 'contain'
  /** 铺满模式：绝对定位填满有定位的父容器，宽高与留白交给父栏的 CSS */
  fill?: boolean
  /**
   * 兜底链的**在场人**（角色 id，主位在前）。
   *
   * 只有调用方知道「这一格归谁」—— 舞台是这一场的主位，右栏是那一位的常服立绘。
   * 不给 = 只探第一档（这一格点的那张），探不到就整块不出。
   */
  charIds?: string[]
  /** 这一格是不是**私密**那一档（只给兜底链放行 `lunaNSFW/**` 里的素材，见 probeSceneCg） */
  intimate?: boolean
  className?: string
  style?: CSSProperties
}

/** 这一格最终摆上去的那张图 */
interface CgHit {
  url: string
  /** 实际摆上去的素材 id（兜底命中时是兜底那张自己的 id） */
  id: string
  /** 兜底命中的档位（没兜底 = undefined） */
  fallback?: SceneCgKind
}

export function CgSlot({
  cgId,
  dir,
  caption,
  ratio = '16 / 9',
  maxWidth,
  fit = 'cover',
  fill,
  charIds,
  intimate,
  className,
  style,
}: CgSlotProps) {
  /** 探完之前不摆任何东西（从前这里先摆占位框，才有了「缺图闪一行字」那回事） */
  const [hit, setHit] = useState<CgHit | null>(null)
  const [settled, setSettled] = useState(false)
  /** 在场人的稳定键：数组每次渲染都是新引用，拿它当依赖会无限重探 */
  const people = (charIds ?? []).filter(Boolean).join(',')

  useEffect(() => {
    let alive = true
    setHit(null)
    setSettled(false)
    void (async () => {
      /* 第一档：这一格点的那张。登记位带 `file` 别名时 probeCg 自己走 cgFileOf，
         所以这里递 id 与递整个 CgRef 是一回事（见 lib/cg.ts 的入参说明）。 */
      const direct = await probeCg(cgId, dir)
      if (!alive) return
      if (direct) { setHit({ url: direct, id: cgId }); setSettled(true); return }

      /* 第二、三档：该角色的 SFW 图 → 她的立绘。没有在场人就没什么可退 ——
         链子自己会返回 null，这里只是把「这一格归谁」递进去。 */
      const scene = await probeSceneCg(
        [{ id: cgId, dir, note: caption }],
        people ? people.split(',') : [],
        { intimate },
      )
      if (!alive) return
      setSettled(true)
      if (scene) setHit({ url: scene.url, id: scene.id, fallback: scene.isFallback ? scene.kind : undefined })
      else if (DEV) console.info(`[cg] 没素材也没兜底：${dir ? dir + '/' : ''}${cgId} —— 这一格不摆了`)
    })()
    return () => { alive = false }
  }, [cgId, dir, caption, intimate, people])

  /* 探完仍无图：**整块不出**（不写占位文案，也不占版位）。 */
  if (!settled || !hit) return null

  const label = caption ?? hit.id
  /* 铺满模式下不摆图注：那一带留给父栏底部的说明带，摆两处会叠在一起 */
  const cap = fill ? undefined : caption
  /* 有图：照原样占位（`fill` 铺满父栏 / 否则按 `ratio` 自带比例）。 */
  const box: CSSProperties = fill
    ? { ...style }
    : { aspectRatio: ratio, ...(maxWidth ? { maxWidth } : null), ...style }
  const cls = [
    css.slot,
    fill ? css.slotFill : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <figure className={cls} style={box} data-cg-slot={hit.id} data-cg-ref={cgId}
      data-cg-fallback={hit.fallback}>
      <img className={css.img} style={{ objectFit: fit }} src={hit.url} alt={label} loading="lazy" decoding="async" />
      {cap ? <figcaption className={css.cap}>{cap}</figcaption> : null}
    </figure>
  )
}
