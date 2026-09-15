/**
 * components/CgSlot.tsx — CG 位（约会场景图）与立绘位（私密档案左栏）。
 *
 * 素材即插即用：public/cg/<cgId>.webp|png|jpg 到位就显示（约定见 lib/cg.ts）。
 *
 * **缺图时不占版位，只留一条细提示**（2026-09-13 改）。
 * 先前是「按比例占一个空框，图补上之后版面不跳」—— 那条规矩在 29 个槽位
 * **一个都没补**的时候反噬得厉害：约会页顶上一条 3:2 的大虚线框、私密档案背面
 * 整根左栏都是斜纹底，比正文还抢眼，看着像界面坏了，而不像「等着补图」。
 * 现在的取舍：**先顾眼前这一屏** —— 缺图就塌成一行小字（`CG 待补 · 文件路径`），
 * 该往哪个文件名补图照样一眼看得到。代价是图补上那一刻版面会长一下；
 * 等图补齐了，这条规矩可以再翻回来。
 *
 * 两种摆法（**都只在有图时生效**）：
 *   · 默认（自带比例）—— 约会页那种横图位，`ratio` 定形状，自己占一块地方；
 *   · `fill`（铺满）—— 不带走自己的比例，绝对定位填满**有定位的**父容器。
 *     档案卡左栏那种「立绘整身铺满 + 右缘渐隐」用它，留白与底色归父栏管。
 *
 * 与 Portrait 的分工：Portrait 缺图会回退成纹章（必须摆一个位子的地方用），
 * CgSlot 缺图塌成一条提示。两者都不参与推演，纯展示。
 *
 * 两个分支（有图 / 缺图）都挂 `data-cg-slot="<素材 id>"`：说的是「这一格此刻摆的是
 * 哪个素材」，**与有没有图无关**。冒烟靠它判某一格认没认下某个 id —— 不带这个把手
 * 就只能去认图注那一行文字，而图注是写给人看的、随时会改。
 * （叫 `cg-slot` 而不是 `cg`：立绘也走这个组件，而「立绘 ≠ CG」是立过的规矩。）
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { probeCg } from '../lib/cg'

import css from './CgSlot.module.css'

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
  /** 图片填充方式：`cover`（缺省，裁满一格）／ `contain`（整张完整可见，立绘与整身用这个） */
  fit?: 'cover' | 'contain'
  /** 铺满模式：绝对定位填满有定位的父容器，宽高与留白交给父栏的 CSS */
  fill?: boolean
  className?: string
  style?: CSSProperties
}

export function CgSlot({
  cgId,
  dir,
  caption,
  ratio = '16 / 9',
  maxWidth,
  fit = 'cover',
  fill,
  className,
  style,
}: CgSlotProps) {
  // 命中进度：null = 尚未探完（先按占位框渲染），'' = 全部 404（仍是占位框），否则为真能加载的 URL
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    void probeCg(cgId, dir).then((u) => { if (alive) setUrl(u ?? '') })
    return () => { alive = false }
  }, [cgId, dir])

  const label = caption ?? cgId
  /* 铺满模式下不摆图注：那一带留给父栏底部的说明带，摆两处会叠在一起 */
  const cap = fill ? undefined : caption
  /* 有图：照原样占位（`fill` 铺满父栏 / 否则按 `ratio` 自带比例）。
     没图：**版位一律不占** —— `fill` 的那套绝对定位、`ratio` 的那条长宽比
     全部作废，塌成一条贴着父栏的细提示（见文件头的说明）。 */
  const box: CSSProperties = !url
    ? { ...style }
    : fill
      ? { ...style }
      : { aspectRatio: ratio, ...(maxWidth ? { maxWidth } : null), ...style }
  const cls = [
    css.slot,
    url ? (fill ? css.slotFill : '') : css.slotEmpty,
    className ?? '',
  ].filter(Boolean).join(' ')

  if (url) {
    return (
      <figure className={cls} style={box} data-cg-slot={cgId}>
        <img className={css.img} style={{ objectFit: fit }} src={url} alt={label} loading="lazy" decoding="async" />
        {cap ? <figcaption className={css.cap}>{cap}</figcaption> : null}
      </figure>
    )
  }

  return (
    <figure className={cls} style={box} data-cg-slot={cgId}>
      {/* 一行说清两件事：这一格等着图，以及该往哪个文件名补。 */}
      <span className={css.ph}>
        <b>CG 待补</b>
        <code>public/cg/{dir ? `${dir}/` : ''}{cgId}.webp</code>
      </span>
      {cap ? <figcaption className={css.cap}>{cap}</figcaption> : null}
    </figure>
  )
}
