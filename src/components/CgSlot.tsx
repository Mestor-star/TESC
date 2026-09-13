/**
 * components/CgSlot.tsx — 场景 CG 位。
 *
 * 素材即插即用：public/cg/<cgId>.webp|.png|jpg 到位就显示（约定见 lib/cg.ts）。
 * 缺图时摆一个固定比例的「待补」占位框 —— 版位先占住，图补上之后版面不跳。
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
  /** 图注；缺省显示 id，好让人一眼知道该往哪个文件名补图 */
  caption?: string
  /** 版位宽高比（CSS aspect-ratio），缺省 16/9 */
  ratio?: string
  /** 单张最大宽度 px */
  maxWidth?: number
  className?: string
  style?: CSSProperties
}

export function CgSlot({ cgId, caption, ratio = '16 / 9', maxWidth, className, style }: CgSlotProps) {
  // 命中进度：null = 尚未探完（先按占位框渲染），'' = 全部 404（仍是占位框），否则为真能加载的 URL
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    void probeCg(cgId).then((u) => { if (alive) setUrl(u ?? '') })
    return () => { alive = false }
  }, [cgId])

  const box: CSSProperties = { aspectRatio: ratio, ...(maxWidth ? { maxWidth } : null), ...style }
  const label = caption ?? cgId

  if (url) {
    return (
      <figure className={`${css.slot} ${className ?? ''}`} style={box}>
        <img className={css.img} src={url} alt={label} loading="lazy" decoding="async" />
        {caption ? <figcaption className={css.cap}>{caption}</figcaption> : null}
      </figure>
    )
  }

  return (
    <figure className={`${css.slot} ${css.slotEmpty} ${className ?? ''}`} style={box}>
      <span className={css.ph}>
        <b>CG 待补</b>
        <code>public/cg/{cgId}.webp</code>
      </span>
      {caption ? <figcaption className={css.cap}>{caption}</figcaption> : null}
    </figure>
  )
}
