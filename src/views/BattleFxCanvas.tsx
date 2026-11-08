import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import css from './BattleFx.module.css'
import type { FxFamily, FxSpec } from './BattleFx'

/* ============================================================
   作战特效 · 全屏一层（Canvas）
   ------------------------------------------------------------
   与 BattleFx（DOM 层，贴着挨打的人画形状）分工：
     · BattleFx  —— 这一手「长什么样」：斜线 / 弹道 / 环 / 折线，位置跟着目标；
     · 这一层    —— 这一下「有多重」：冲击波、火星、碎屑、色散、压边、整屏闪。
   只在「一手真正落地」时放一次，铺满整个作战窗口；不常驻、不空转
   （没有元素时 rAF 直接停掉）。
   画法全部是 Canvas 2D 的合成运算（lighter 叠加 + 渐变辉光），没有图片、
   没有依赖、不读 DOM —— 所以缩放与 DPR 都按容器实时算。
   ============================================================ */

export interface FxBurst {
  family: FxFamily
  spec: FxSpec
  /** 色相（0–360，取自招式的 fxSeed） */
  hue: number
  /** 分量 0–1.4：伤害占对方上限的比例，决定粒子数与扩散半径 */
  power?: number
  crit?: boolean
  down?: boolean
  ult?: boolean
  /** 打出去的是哪一边：我方出手 → 落点在右半（敌阵）；敌方出手落在左半 */
  side?: 'ally' | 'enemy'
  /** 低档 / 减少动态：只留一闪与一圈，不铺粒子 */
  calm?: boolean
  seed?: number
}

export interface FxCanvasHandle {
  play: (r: FxBurst) => void
  clear: () => void
}

type Kind = 'mote' | 'shard' | 'ring' | 'arc' | 'flash' | 'bolt' | 'veil' | 'band' | 'blob' | 'streak'

interface El {
  k: Kind
  t: number
  ttl: number
  x: number
  y: number
  vx: number
  vy: number
  hue: number
  a: number
  size: number
  rot: number
  vr: number
  grav: number
  drag: number
  r0: number
  r1: number
  w: number
  a0: number
  a1: number
  pts: number[]
  split: number
}

const TAU = Math.PI * 2
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

function rng(seed: number): () => number {
  let s = (seed || 1) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function el(k: Kind, x: number, y: number, ttl: number, hue: number): El {
  return {
    k, t: 0, ttl, x, y, vx: 0, vy: 0, hue, a: 1, size: 2,
    rot: 0, vr: 0, grav: 0, drag: 0.9, r0: 0, r1: 0, w: 1, a0: 0, a1: TAU,
    pts: [], split: 0,
  }
}

class Engine {
  private cv: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private ro: ResizeObserver | null = null
  private els: El[] = []
  private raf = 0
  private last = 0
  private w = 0
  private h = 0
  private dpr = 1
  private low = false

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv
    const ctx = cv.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('canvas 2d unavailable')
    this.ctx = ctx
    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(cv)
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.ro?.disconnect()
    this.ro = null
    this.els = []
  }

  private resize() {
    const rect = this.cv.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = w
    this.h = h
    this.cv.width = Math.round(w * this.dpr)
    this.cv.height = Math.round(h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    /* 小屏与低档：粒子数按面积缩，别让一场战斗的两次出手就掉帧 */
    this.low = w < 720
  }

  clear() {
    this.els = []
    this.ctx.clearRect(0, 0, this.w, this.h)
  }

  fire(req: FxBurst) {
    const R = rng(req.seed ?? 7)
    const p = clamp(req.power ?? 0.5, 0.12, 1.4)
    const heavy = clamp(p * 1.1, 0.25, 1.5) * (req.crit ? 1.25 : 1) * (req.ult ? 1.5 : 1)
    const cx = this.w * (req.side === 'enemy' ? 0.33 : 0.67)
    const cy = this.h * (0.44 + (R() - 0.5) * 0.1)
    const hue = req.hue
    const area = this.low ? 0.62 : 1
    const spec = req.spec

    /* 每一次落地都有的三件：命中核、冲击环、一点极轻的整屏闪 */
    const core = el('blob', cx, cy, req.ult ? 560 : 340, hue)
    core.r0 = 10
    core.r1 = (70 + 210 * p) * (req.ult ? 1.5 : 1)
    core.a = 0.95
    this.els.push(core)
    const flash = el('flash', 0, 0, req.ult ? 380 : 200, hue)
    flash.a = 0.14 + 0.2 * Math.min(1, heavy)
    this.els.push(flash)

    const ring = el('ring', cx, cy, 620, hue)
    ring.r0 = 8
    ring.r1 = (90 + 320 * p) * (req.ult ? 1.35 : 1)
    ring.w = 2.4 + 3.6 * p
    ring.a = 0.9
    this.els.push(ring)

    if (req.ult || req.down) {
      const v = el('veil', 0, 0, req.ult ? 900 : 620, hue)
      v.a = req.ult ? 0.55 : 0.34
      this.els.push(v)
    }

    /* 低档：闪一下 + 一圈到此为止，信息不丢、动态全撤 */
    if (req.calm) {
      if (!this.raf) {
        this.last = performance.now()
        this.raf = requestAnimationFrame(this.tick)
      }
      return
    }

    /* 火花：沿散开方向甩出去，越重越多 */
    const sparks = Math.round((spec.dots || 6) * 3 * area * (0.6 + heavy))
    for (let i = 0; i < sparks; i++) {
      const a = R() * TAU
      const sp = (120 + R() * 620) * (0.5 + p)
      const m = el('mote', cx, cy, 320 + R() * 520, hue + (R() - 0.5) * 34)
      m.vx = Math.cos(a) * sp
      m.vy = Math.sin(a) * sp * 0.72 - 40
      m.size = 1.6 + R() * 2.8
      m.drag = 0.86 + R() * 0.08
      m.grav = 420
      this.els.push(m)
    }

    switch (req.family) {
      case 'slash': {
        const ang = ((spec.angle ?? -30) * Math.PI) / 180
        for (let i = 0; i < 3; i++) {
          const arc = el('arc', cx, cy, 200 + i * 70, hue)
          arc.r0 = 40 + i * 18
          arc.r1 = (120 + 260 * p) * (1 + i * 0.16)
          arc.a0 = ang - 0.7 + i * 0.1
          arc.a1 = ang + 0.55 + i * 0.1
          arc.w = 22 - i * 5
          arc.split = 8 + i * 4
          arc.a = 0.9 - i * 0.16
          this.els.push(arc)
        }
        for (let i = 0; i < Math.round(10 * area); i++) {
          const d = ang + (R() - 0.5) * 0.5
          const s = el('streak', cx, cy, 260 + R() * 240, hue)
          s.vx = Math.cos(d) * (520 + R() * 700)
          s.vy = Math.sin(d) * (520 + R() * 700)
          s.w = 1.2 + R() * 2.4
          s.a = 0.8
          this.els.push(s)
        }
        break
      }
      case 'shot': {
        const dir = req.side === 'enemy' ? -1 : 1
        for (let i = 0; i < 3; i++) {
          const b = el('band', cx - dir * 240, cy + (R() - 0.5) * 26, 220, hue)
          b.vx = dir * (900 + R() * 500)
          b.w = 2 + R() * 3
          b.a = 0.9
          this.els.push(b)
        }
        const ringShot = el('ring', cx, cy, 300, hue)
        ringShot.r0 = 2
        ringShot.r1 = 70 + 120 * p
        ringShot.w = 6
        this.els.push(ringShot)
        break
      }
      case 'blast': {
        for (let i = 0; i < Math.round(12 * area * (0.6 + p)); i++) {
          const a = R() * TAU
          const s = el('shard', cx, cy, 460 + R() * 420, hue + (R() - 0.5) * 20)
          const sp = 180 + R() * 560
          s.vx = Math.cos(a) * sp
          s.vy = Math.sin(a) * sp - 220
          s.size = 4 + R() * 9
          s.rot = R() * TAU
          s.vr = (R() - 0.5) * 0.5
          s.grav = 1100
          s.drag = 0.997
          this.els.push(s)
        }
        for (let i = 0; i < 2; i++) {
          const r2 = el('ring', cx + (R() - 0.5) * 40, cy + (R() - 0.5) * 40, 520 + i * 180, hue + i * 12)
          r2.r0 = 10 + i * 20
          r2.r1 = (60 + 200 * p) * (1 + i * 0.4)
          r2.w = 3 + 4 * p
          this.els.push(r2)
        }
        break
      }
      case 'thunder': {
        for (let i = 0; i < 3; i++) {
          const pts: number[] = []
          let x = cx - 120 + R() * 240
          let y = -20
          pts.push(x, y)
          const steps = 7
          for (let s = 0; s < steps; s++) {
            x += (R() - 0.5) * 90
            y += (this.h * 0.9) / steps
            pts.push(x, y)
          }
          const b = el('bolt', 0, 0, 220 + i * 60, hue)
          b.pts = pts
          b.w = 3.2 - i * 0.7
          b.split = 7
          this.els.push(b)
        }
        break
      }
      case 'gravity': {
        for (let i = 0; i < Math.round(26 * area); i++) {
          const a = R() * TAU
          const rad = 220 + R() * 260
          const m = el('mote', cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.8, 420 + R() * 380, hue)
          const k = 1.6 + R()
          m.vx = -Math.cos(a) * rad * k
          m.vy = -Math.sin(a) * rad * k * 0.8
          m.size = 1.2 + R() * 2
          m.drag = 0.965
          m.grav = 0
          this.els.push(m)
        }
        const collapse = el('ring', cx, cy, 520, hue)
        collapse.r0 = 260
        collapse.r1 = 14
        collapse.w = 5
        this.els.push(collapse)
        break
      }
      case 'heal': {
        for (let i = 0; i < Math.round(30 * area); i++) {
          const m = el('mote', cx + (R() - 0.5) * 260, cy + (R() - 0.5) * 120, 700 + R() * 600, hue + (R() - 0.5) * 26)
          m.vx = (R() - 0.5) * 40
          m.vy = -60 - R() * 110
          m.size = 1.4 + R() * 2.4
          m.grav = -30
          m.drag = 0.995
          this.els.push(m)
        }
        for (let i = 0; i < 2; i++) {
          const r2 = el('ring', cx, cy, 700 + i * 240, hue)
          r2.r0 = 30 + i * 40
          r2.r1 = 150 + i * 90
          r2.w = 1.6
          r2.a = 0.5
          this.els.push(r2)
        }
        break
      }
      case 'support': {
        for (let i = 0; i < 4; i++) {
          const arc = el('arc', cx, cy, 620 + i * 120, hue)
          arc.r0 = 60 + i * 34
          arc.r1 = 100 + i * 40
          arc.a0 = 0
          arc.a1 = TAU * 0.82
          arc.w = 1.6
          arc.rot = i * 0.5
          arc.vr = 0.0022
          arc.a = 0.55
          this.els.push(arc)
        }
        break
      }
      case 'break': {
        for (let i = 0; i < Math.round(22 * area * (0.7 + p)); i++) {
          const a = R() * TAU
          const sp = 140 + R() * 520
          const s = el('shard', cx, cy, 480 + R() * 460, hue)
          s.vx = Math.cos(a) * sp
          s.vy = Math.sin(a) * sp - 120
          s.size = 5 + R() * 12
          s.rot = R() * TAU
          s.vr = (R() - 0.5) * 0.4
          s.grav = 900
          s.drag = 0.995
          this.els.push(s)
        }
        break
      }
      case 'sound': {
        for (let i = 0; i < 4; i++) {
          const r2 = el('ring', cx, cy, 520 + i * 140, hue)
          r2.r0 = 20 + i * 10
          r2.r1 = 120 + 260 * p + i * 60
          r2.w = 2
          r2.a = 0.7 - i * 0.12
          this.els.push(r2)
        }
        break
      }
      default: {
        const r2 = el('ring', cx, cy, 360, hue)
        r2.r0 = 6
        r2.r1 = 70 + 140 * p
        r2.w = 2
        this.els.push(r2)
      }
    }

    /* 终结技：多一层向内收的冲击 + 全屏扫过的一道光带 */
    if (req.ult) {
      const vein = el('ring', cx, cy, 1100, hue)
      vein.r0 = Math.max(this.w, this.h) * 0.7
      vein.r1 = 40
      vein.w = 2.5
      vein.a = 0.6
      this.els.push(vein)
      const band = el('band', -this.w * 0.2, cy, 620, hue)
      band.vx = this.w * 2.4
      band.w = 46
      band.a = 0.28
      this.els.push(band)
    }

    if (!this.raf) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  private tick = (ts: number) => {
    const dt = clamp(ts - this.last, 0, 48) / 1000
    this.last = ts
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)
    ctx.globalCompositeOperation = 'lighter'

    for (let i = this.els.length - 1; i >= 0; i--) {
      const e = this.els[i]
      e.t += dt
      if (e.t >= e.ttl / 1000) {
        this.els.splice(i, 1)
        continue
      }
      const life = e.t / (e.ttl / 1000)
      this.step(e, dt)
      this.draw(e, life)
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    if (this.els.length) {
      this.raf = requestAnimationFrame(this.tick)
    } else {
      this.raf = 0
    }
  }

  private step(e: El, dt: number) {
    if (e.k === 'ring' || e.k === 'arc' || e.k === 'flash' || e.k === 'veil' || e.k === 'bolt' || e.k === 'blob') {
      if (e.vr) e.rot += e.vr * 60 * dt
      return
    }
    e.vy += e.grav * dt
    const d = Math.pow(e.drag, dt * 60)
    e.vx *= d
    e.vy *= d
    e.x += e.vx * dt
    e.y += e.vy * dt
    if (e.vr) e.rot += e.vr * dt
  }

  private color(hue: number, alpha: number, light = 62) {
    return `hsla(${hue.toFixed(1)}, 92%, ${light}%, ${clamp(alpha, 0, 1).toFixed(3)})`
  }

  private draw(e: El, life: number) {
    const ctx = this.ctx
    const fade = 1 - life
    switch (e.k) {
      case 'mote': {
        const speed = Math.hypot(e.vx, e.vy)
        const len = clamp(speed * 0.03, 1, 26)
        ctx.save()
        ctx.shadowColor = this.color(e.hue, 0.9 * fade, 60)
        ctx.shadowBlur = 7 * fade + 2
        ctx.strokeStyle = this.color(e.hue, fade, 76)
        ctx.lineWidth = e.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(e.x, e.y)
        ctx.lineTo(e.x - (e.vx / (speed || 1)) * len, e.y - (e.vy / (speed || 1)) * len)
        ctx.stroke()
        ctx.restore()
        break
      }
      case 'shard': {
        const s = e.size * (0.6 + 0.4 * fade)
        ctx.save()
        ctx.translate(e.x, e.y)
        ctx.rotate(e.rot)
        ctx.fillStyle = this.color(e.hue, 0.6 * fade, 78)
        ctx.beginPath()
        ctx.moveTo(-s, -s * 0.4)
        ctx.lineTo(s, -s * 0.1)
        ctx.lineTo(s * 0.2, s)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break
      }
      case 'ring': {
        const r = e.r0 + (e.r1 - e.r0) * (1 - Math.pow(1 - life, 2.2))
        const alpha = e.a * (1 - life) * (1 - life)
        const lw = e.w * (1 - life * 0.6)
        /* 冲击波画成一圈「有厚度的光带」，不是一根几何圆线：
           半径带固定相位的抖动，前后沿用径向渐变化开 —— 这样它像被顶开的一层空气，
           而不是画了个圈。 */
        const seg = 72
        const wob = (a: number) => 1 + Math.sin(a * 5 + e.hue) * 0.018 + Math.sin(a * 11 - e.hue) * 0.01
        const band = Math.max(lw, r * 0.14)
        const path = () => {
          ctx.beginPath()
          for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * TAU
            const rr = Math.max(0.5, r * wob(a))
            const x = e.x + Math.cos(a) * rr
            const y = e.y + Math.sin(a) * rr
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
        }
        const g = ctx.createRadialGradient(e.x, e.y, Math.max(0, r - band * 1.5), e.x, e.y, r + band * 1.5)
        g.addColorStop(0, this.color(e.hue, 0, 60))
        g.addColorStop(0.42, this.color(e.hue, alpha * 0.28, 66))
        g.addColorStop(0.56, this.color(e.hue, alpha * 0.95, 84))
        g.addColorStop(0.66, this.color(e.hue, alpha * 0.6, 68))
        g.addColorStop(1, this.color(e.hue, 0, 60))
        ctx.save()
        ctx.shadowColor = this.color(e.hue, alpha * 0.8, 58)
        ctx.shadowBlur = Math.min(34, band * 2.2)
        ctx.fillStyle = g
        path()
        ctx.fill()
        ctx.restore()
        /* 前沿再压一道窄的高光，重量落在「边」上 */
        ctx.strokeStyle = this.color(e.hue, alpha * 0.85, 92)
        ctx.lineWidth = Math.max(1, lw * 0.35)
        ctx.beginPath()
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * TAU
          const rr = Math.max(0.5, r * wob(a))
          const x = e.x + Math.cos(a) * rr
          const y = e.y + Math.sin(a) * rr
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
        /* 色散：偏红与偏青各错开一点点，冲击环才像「打过这一下」而不是画了个圈 */
        if (e.w > 2.4) {
          const off = 2 + 4 * (1 - life)
          ctx.strokeStyle = `hsla(0, 90%, 62%, ${(alpha * 0.5).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(e.x - off, e.y, Math.max(0.5, r), 0, TAU)
          ctx.stroke()
          ctx.strokeStyle = `hsla(190, 95%, 65%, ${(alpha * 0.5).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(e.x + off, e.y, Math.max(0.5, r), 0, TAU)
          ctx.stroke()
        }
        break
      }
      case 'arc': {
        const grow = 1 - Math.pow(1 - life, 1.6)
        const r = e.r0 + (e.r1 - e.r0) * grow
        const alpha = e.a * (1 - life)
        ctx.lineCap = 'round'
        ctx.strokeStyle = this.color(e.hue, alpha * 0.85, 72)
        ctx.lineWidth = e.w * (1 - life * 0.55)
        ctx.beginPath()
        ctx.arc(e.x, e.y, Math.max(1, r), e.a0 + e.rot, e.a1 + e.rot)
        ctx.stroke()
        if (e.split) {
          ctx.lineWidth = Math.max(0.8, e.w * 0.4)
          ctx.strokeStyle = `hsla(0, 90%, 64%, ${(alpha * 0.5).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(e.x - e.split, e.y, Math.max(1, r), e.a0 + e.rot, e.a1 + e.rot)
          ctx.stroke()
          ctx.strokeStyle = `hsla(192, 95%, 66%, ${(alpha * 0.5).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(e.x + e.split, e.y, Math.max(1, r), e.a0 + e.rot, e.a1 + e.rot)
          ctx.stroke()
        }
        break
      }
      case 'bolt': {
        const alpha = e.a * Math.sin(Math.PI * clamps(life))
        const pts = e.pts
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass === 0
            ? this.color(e.hue, alpha * 0.35, 58)
            : this.color(e.hue, alpha, 88)
          ctx.lineWidth = pass === 0 ? e.w * 6 : e.w
          ctx.beginPath()
          ctx.moveTo(pts[0], pts[1])
          for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
          ctx.stroke()
        }
        break
      }
      case 'band': {
        const alpha = e.a * (1 - life) * (1 - life)
        const g = ctx.createLinearGradient(e.x, 0, e.x + e.w, 0)
        g.addColorStop(0, this.color(e.hue, 0))
        g.addColorStop(0.5, this.color(e.hue, alpha, 82))
        g.addColorStop(1, this.color(e.hue, 0))
        ctx.fillStyle = g
        ctx.fillRect(e.x - e.w, e.y - this.h, e.w * 2, this.h * 2)
        break
      }
      case 'blob': {
        const r = e.r0 + (e.r1 - e.r0) * (1 - Math.pow(1 - life, 2.6))
        const a = e.a * Math.pow(1 - life, 2.2)
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, Math.max(1, r))
        g.addColorStop(0, `rgba(255,255,255,${clamp(a, 0, 1).toFixed(3)})`)
        g.addColorStop(0.22, this.color(e.hue, a * 0.92, 88))
        g.addColorStop(0.55, this.color(e.hue, a * 0.45, 64))
        g.addColorStop(1, this.color(e.hue, 0, 60))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(e.x, e.y, Math.max(1, r), 0, TAU)
        ctx.fill()
        break
      }
      case 'streak': {
        const speed = Math.hypot(e.vx, e.vy) || 1
        const len = clamp(speed * 0.09, 8, 120) * (1 - life * 0.4)
        ctx.strokeStyle = this.color(e.hue, e.a * (1 - life), 82)
        ctx.lineWidth = e.w * (1 - life * 0.5)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(e.x, e.y)
        ctx.lineTo(e.x - (e.vx / speed) * len, e.y - (e.vy / speed) * len)
        ctx.stroke()
        break
      }
      case 'flash': {
        const a = e.a * Math.pow(1 - life, 2.4)
        ctx.fillStyle = this.color(e.hue, a * 0.5, 78)
        ctx.fillRect(0, 0, this.w, this.h)
        break
      }
      case 'veil': {
        const a = e.a * Math.sin(Math.PI * clamp(life, 0, 1)) * 0.9
        const g = ctx.createRadialGradient(
          this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.18,
          this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72,
        )
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(0.7, `hsla(${e.hue.toFixed(0)}, 55%, 12%, ${(a * 0.35).toFixed(3)})`)
        g.addColorStop(1, `hsla(${e.hue.toFixed(0)}, 65%, 8%, ${(a * 0.8).toFixed(3)})`)
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = g
        ctx.fillRect(0, 0, this.w, this.h)
        ctx.globalCompositeOperation = 'lighter'
        break
      }
    }
  }
}

function clamps(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

interface Props {
  level: 'standard' | 'reduced'
  className?: string
  style?: CSSProperties
}

export const FxCanvas = forwardRef<FxCanvasHandle, Props>(function FxCanvas({ level, className, style }, ref) {
  const cv = useRef<HTMLCanvasElement | null>(null)
  const engine = useRef<Engine | null>(null)

  useEffect(() => {
    if (!cv.current) return
    const e = new Engine(cv.current)
    engine.current = e
    return () => {
      e.dispose()
      engine.current = null
    }
  }, [])

  useImperativeHandle(ref, () => ({
    play(r: FxBurst) {
      const e = engine.current
      if (!e) return
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (level === 'reduced' || calm) {
        /* 低档只留「闪一下 + 一圈」：信息（打中了）不丢，动效全撤 */
        e.clear()
        e.fire({ ...r, calm: true, spec: { ...r.spec, dots: 0, shards: 0, ghosts: 0, bands: 0, rings: 1 } })
        return
      }
      e.fire(r)
    },
    clear() {
      engine.current?.clear()
    },
  }), [level])

  return <canvas ref={cv} className={className ?? css.canvasLayer} style={style} data-fx-canvas aria-hidden="true" />
})
