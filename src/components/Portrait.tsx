/**
 * components/Portrait.tsx — 角色头像 / 立绘统一渲染。
 *
 * 素材即插即用：public/charimg/<avatarId>.webp|.png 为立绘，<avatarId>-face.* 为头像
 * （变体约定见 lib/charimg.ts；operator → operator）。
 * 全部候选 404 / 尚无真图时，自动回退「主题色底 + sigil」纹章占位，
 * 因此无论有没有素材，本组件都可以直接投入聊天头像、气泡、档案卡与立绘位。
 */

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { charImgCandidates, FACE_FOCUS, probeCharImg } from '../lib/charimg'
import type { CharImgVariant } from '../lib/charimg'
import { personOf } from '../data/castmeta'

/**
 * 素材是否到位（真能加载的那张 URL；全 404 → null）。
 * 给「缺图宁可不摆」的版位用（档案卡顶图）—— Portrait 的回退是给必须摆一个位子的
 * 地方（头像、立绘位）准备的，那里摆纹章占位是对的；整条卡面上的装饰带不是。
 */
export function useCharImg(avatarId: string, variant: CharImgVariant = 'full'): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    void probeCharImg(avatarId, variant).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [avatarId, variant])
  return url
}

export interface PortraitProps {
  /** 素材 id（= public/charimg/<id>.* 的 <id>；操作员传 'operator'） */
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
  /**
   * 图像裁切：cover 填满裁剪 · contain 完整可见（立绘用）。
   * 同时决定取哪套素材：cover（小头像 / 人物框）优先 <id>-face，contain（档案大立绘）取 <id>。
   */
  fit?: 'cover' | 'contain'
  /**
   * 覆盖素材选择：'face' 头像 / 'full' 立绘。
   * 需要「拿立绘裁出半身」时用（档案卡顶图：cover + full + focus 取到胸像），
   * 缺省仍按 fit 推断 —— 方框取头像、大立绘取整图。
   */
  variant?: CharImgVariant
  /** cover 裁切的取景重心（CSS object-position）；缺省偏上取脸，官方整身立绘才切得对 */
  focus?: string
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
  const { avatarId, size = 44, width, height, round, fit = 'cover', focus, className, style, eager } = props

  // cover 的槽位默认都是小头像 / 人物框 → 取头像变体；contain 只有档案大立绘 → 取立绘。
  // 显式给 variant 时以它为准（档案卡顶图要的是「立绘裁半身」，不是头像）。
  const variant: CharImgVariant = props.variant ?? (fit === 'cover' ? 'face' : 'full')
  const candidates = useMemo(() => charImgCandidates(avatarId, variant), [avatarId, variant])
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
            objectPosition: fit === 'cover' ? (focus ?? FACE_FOCUS) : undefined,
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
