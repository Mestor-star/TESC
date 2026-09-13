/**
 * components/CgSlot.tsx — 场景 CG 位。
 *
 * 素材即插即用：public/cg/<cgId>.webp|.png|jpg 到位就显示（约定见 lib/cg.ts）。
 * 缺图时摆一个固定比例的「待补」占位框 —— 版位先占住，图补上之后版面不跳。
 *
 * 两种摆法：
 *   · 默认（自带比例）—— 约会页那种横图位，`ratio` 定形状，自己占一块地方；
 *   · `fill`（铺满）—— 不带走自己的比例，绝对定位填满**有定位的**父容器。
 *     档案卡左栏那种「立绘整身铺满 + 右缘渐隐」用它，留白与底色归父栏管。
 *
 * 与 Portrait 的分工：Portrait 缺图会回退成纹章（必须摆一个位子的地方用），
 * CgSlot 缺图摆的是空框（这一格本来就等着补图）。两者都不参与推演，纯展示。
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { probeCg } from '../lib/cg'

import css from './CgSlot.module.css'

export interface CgSlotProps {
  /** 素材 id（= public/cg/<id>.* 的 <id>） */
  cgId: string
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
    void probeCg(cgId).then((u) => { if (alive) setUrl(u ?? '') })
    return () => { alive = false }
  }, [cgId])

  const box: CSSProperties = fill
    ? { ...style }
    : { aspectRatio: ratio, ...(maxWidth ? { maxWidth } : null), ...style }
  const label = caption ?? cgId
  /* 铺满模式下不摆图注：那一带留给父栏底部的说明带，摆两处会叠在一起 */
  const cap = fill ? undefined : caption
  const cls = [css.slot, fill ? css.slotFill : '', url ? '' : css.slotEmpty, className ?? '']
    .filter(Boolean)
    .join(' ')

  if (url) {
    return (
      <figure className={cls} style={box}>
        <img className={css.img} style={{ objectFit: fit }} src={url} alt={label} loading="lazy" decoding="async" />
        {cap ? <figcaption className={css.cap}>{cap}</figcaption> : null}
      </figure>
    )
  }

  return (
    <figure className={cls} style={box}>
      <span className={css.ph}>
        <b>CG 待补</b>
        <code>public/cg/{cgId}.webp</code>
      </span>
      {cap ? <figcaption className={css.cap}>{cap}</figcaption> : null}
    </figure>
  )
}
