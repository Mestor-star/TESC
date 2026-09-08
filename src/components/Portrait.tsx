/**
 * components/Portrait.tsx — 角色头像 / 立绘统一渲染。
 *
 * 素材即插即用：public/charimg/<avatarId>.png（operator → operator.png）。
 * 全部候选 404 / 尚无真图时，自动回退「主题色底 + sigil」纹章占位，
 * 因此无论有没有素材，本组件都可以直接投入聊天头像、气泡、档案卡与立绘位。
 */

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { charImgCandidates } from '../lib/charimg'
import { personOf } from '../data/castmeta'

export interface PortraitProps {
  /** 素材 id（= public/charimg/<id>.png 的 <id>；操作员传 'operator'） */
  avatarId: string
  /** 回退占位用的显示名（缺省按 avatarId 查 castmeta） */
  name?: string
  /** 回退占位主题色（缺省按 avatarId 查 castmeta） */
  hue?: string
  /** 回退占位纹章字（缺省按 avatarId 查 castmeta） */
  sigil?: string
  /** 盒宽 px：缺省取 size；头像等方形用 */
  width?: number
  /** 盒高 px：缺省取 size；立绘整图（如 150×212）用 */
  height?: number
  /** 方形边长兜底（width/height 皆缺省时使用） */
  size?: number
  /** 圆形头像（聊天用）；缺省方形小圆角 */
  round?: boolean
  /** 图像裁切：cover 填满裁剪 · contain 完整可见（立绘用） */
  fit?: 'cover' | 'contain'
  eager?: boolean
  className?: string
  style?: CSSProperties
}

/** 回退 meta：显式 prop 优先，否则 castmeta 兜底 */
function metaOf(props: PortraitProps) {
  const p = personOf(props.avatarId)
  return {
    name: props.name ?? p?.name ?? props.avatarId,
    hue: props.hue ?? p?.hue ?? '#8b93a7',
    sigil: props.sigil ?? p?.sigil ?? props.avatarId.slice(0, 1),
  }
}

export function Portrait(props: PortraitProps) {
  const { avatarId, size = 44, width, height, round, fit = 'cover', className, style, eager } = props

  const candidates = useMemo(() => charImgCandidates(avatarId), [avatarId])
  const meta = useMemo(() => metaOf(props), [avatarId, props.name, props.hue, props.sigil])

  const w = width ?? size
  const h = height ?? size

  // 候选命中进度：-1 = 全部 404，回退纹章
  const [idx, setIdx] = useState(0)
  useEffect(() => { setIdx(0) }, [avatarId])

  const box: CSSProperties = {
    width: w,
    height: h,
    flex: 'none',
    overflow: 'hidden',
    borderRadius: round ? '50%' : 8,
    background: `linear-gradient(150deg, ${meta.hue}2e 0%, ${meta.hue}55 100%)`,
    ...style,
  }

  const shown = candidates[idx]

  return (
    <span className={className} style={box} role="img" aria-label={meta.name}>
      {shown ? (
        <img
          src={shown}
          alt={meta.name}
          width={w}
          height={h}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setIdx((i) => (i + 1 >= candidates.length ? -1 : i + 1))}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            display: 'block',
            background: '#0b0e14',
          }}
        />
      ) : (
        <span
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: meta.hue,
            fontSize: Math.max(12, Math.round(Math.min(w, h) * 0.46)),
            fontWeight: 700,
            fontFamily: 'var(--font-serif, serif)',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {meta.sigil}
        </span>
      )}
    </span>
  )
}
