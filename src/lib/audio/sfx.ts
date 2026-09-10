/* ============================================================
   音效 —— 一次性合成，全部现场算出来
   ------------------------------------------------------------
   音色口径：这台终端是**老式观测设备**，不是游戏机。
   所以界面上是继电器与继电器的余响（短、干、方波/三角），
   战斗里才允许出现噪声与低频（打击感从这里来）。
   ============================================================ */

import { ac, now, sfxOut } from './engine'

export type SfxName =
  /* —— 界面 —— */
  | 'tick' | 'key' | 'open' | 'back' | 'deny' | 'notify' | 'alert'
  /* —— 作战 —— */
  | 'hit' | 'crit' | 'guard' | 'heal' | 'down' | 'ult' | 'form' | 'guitar' | 'slash' | 'blast'
  /* —— 收场 —— */
  | 'win' | 'lose' | 'flee' | 'loot'

/** 一段噪声（白噪声缓冲共用，省去每次新建） */
let noiseBuf: AudioBuffer | null = null
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const len = Math.floor(c.sampleRate * 1.2)
  const b = c.createBuffer(1, len, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  noiseBuf = b
  return b
}

interface Blip {
  /** 起始频率（Hz） */
  f: number
  /** 终止频率；不给 = 不滑 */
  to?: number
  /** 时长（秒） */
  d: number
  /** 波形 */
  w?: OscillatorType
  /** 峰值音量 0–1 */
  g?: number
  /** 起点相对 now 的延迟（秒） */
  at?: number
  /** 低通截止（Hz）；给了就串一个 */
  lp?: number
}

function blip(o: Blip): void {
  const c = ac()
  const out = sfxOut()
  if (!c || !out) return
  const t = now() + (o.at ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.w ?? 'square'
  osc.frequency.setValueAtTime(Math.max(20, o.f), t)
  if (o.to && o.to !== o.f) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.d)
  const peak = Math.max(0.0001, o.g ?? 0.3)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, o.d * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.d)
  let tail: AudioNode = g
  if (o.lp) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = o.lp
    g.connect(f)
    tail = f
  }
  osc.connect(g)
  tail.connect(out)
  osc.start(t)
  osc.stop(t + o.d + 0.02)
}

interface Crunch {
  /** 时长（秒） */
  d: number
  /** 峰值音量 */
  g?: number
  /** 带通中心频率 */
  f?: number
  /** 品质因数（越大越窄、越像金属） */
  q?: number
  at?: number
  /** 扫频目标 */
  to?: number
  /** 高通兜底，削掉闷响 */
  hp?: number
}

function crunch(o: Crunch): void {
  const c = ac()
  const out = sfxOut()
  if (!c || !out) return
  const t = now() + (o.at ?? 0)
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(Math.max(40, o.f ?? 900), t)
  if (o.to) bp.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + o.d)
  bp.Q.value = o.q ?? 1.1
  const g = c.createGain()
  const peak = Math.max(0.0001, o.g ?? 0.22)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.006, o.d * 0.3))
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.d)
  src.connect(bp)
  bp.connect(g)
  let tail: AudioNode = g
  if (o.hp) {
    const h = c.createBiquadFilter()
    h.type = 'highpass'
    h.frequency.value = o.hp
    g.connect(h)
    tail = h
  }
  tail.connect(out)
  src.start(t)
  src.stop(t + o.d + 0.02)
}

/** 和弦：几个音一起按下去 */
function chord(freqs: number[], d: number, g = 0.16, w: OscillatorType = 'triangle', at = 0): void {
  freqs.forEach((f, i) => blip({ f, d, w, g: g / (1 + i * 0.35), at: at + i * 0.012 }))
}

/** 半音 → Hz（以 A2 = 110Hz 为基准，midi 号 45） */
export function hz(semitoneFromA4: number): number {
  return 440 * Math.pow(2, semitoneFromA4 / 12)
}

/* ------------------------------------------------------------------
   音色表
   ------------------------------------------------------------------ */

const BANK: Record<SfxName, () => void> = {
  /* —— 界面：继电器的一下 —— */
  tick: () => blip({ f: hz(4), to: hz(-4), d: 0.045, w: 'square', g: 0.16, lp: 2600 }),
  key: () => blip({ f: hz(9), d: 0.03, w: 'square', g: 0.1, lp: 3000 }),
  open: () => { blip({ f: hz(-5), to: hz(7), d: 0.13, w: 'triangle', g: 0.2, lp: 2200 }); crunch({ d: 0.09, f: 1800, g: 0.07, at: 0.01 }) },
  back: () => { blip({ f: hz(7), to: hz(-7), d: 0.11, w: 'triangle', g: 0.18, lp: 1800 }) },
  deny: () => { blip({ f: hz(-8), d: 0.07, w: 'square', g: 0.2, lp: 900 }); blip({ f: hz(-15), d: 0.13, w: 'square', g: 0.18, at: 0.08, lp: 800 }) },
  notify: () => { chord([hz(12), hz(19), hz(24)], 0.5, 0.13, 'sine') },
  alert: () => { chord([hz(6), hz(7)], 0.7, 0.15, 'sawtooth'); crunch({ d: 0.3, f: 300, g: 0.1, at: 0.02 }) },

  /* —— 作战 —— */
  hit: () => { crunch({ d: 0.13, f: 1400, to: 380, g: 0.28, q: 0.9, hp: 120 }); blip({ f: 180, to: 70, d: 0.11, w: 'triangle', g: 0.2 }) },
  crit: () => { crunch({ d: 0.26, f: 2600, to: 300, g: 0.36, q: 0.8, hp: 100 }); blip({ f: 300, to: 60, d: 0.24, w: 'sawtooth', g: 0.24, lp: 1400 }) },
  guard: () => { crunch({ d: 0.18, f: 900, q: 3.2, g: 0.2, hp: 300 }); blip({ f: 130, d: 0.14, w: 'triangle', g: 0.16 }) },
  heal: () => { chord([hz(0), hz(7), hz(12), hz(16)], 0.7, 0.14, 'sine') },
  down: () => { blip({ f: 150, to: 40, d: 0.5, w: 'sawtooth', g: 0.26, lp: 700 }); crunch({ d: 0.4, f: 500, to: 120, g: 0.16 }) },
  ult: () => {
    blip({ f: 90, to: 900, d: 0.7, w: 'sawtooth', g: 0.22, lp: 2000 })
    chord([hz(-12), hz(0), hz(7)], 0.9, 0.16, 'triangle', 0.14)
    crunch({ d: 0.6, f: 220, to: 3200, g: 0.2, at: 0.14 })
  },
  form: () => { chord([hz(-12), hz(-5), hz(0)], 0.9, 0.18, 'sawtooth'); blip({ f: hz(-12), to: hz(12), d: 0.5, w: 'triangle', g: 0.14, at: 0.1 }) },
  guitar: () => { blip({ f: hz(-17), to: hz(7), d: 0.3, w: 'sawtooth', g: 0.22, lp: 1800 }); crunch({ d: 0.2, f: 1600, to: 500, g: 0.18, at: 0.02 }) },
  slash: () => { crunch({ d: 0.17, f: 3600, to: 700, g: 0.3, q: 1.6, hp: 500 }); blip({ f: hz(-9), to: hz(-2), d: 0.12, w: 'triangle', g: 0.16 }) },
  blast: () => { crunch({ d: 0.38, f: 700, to: 140, g: 0.34, q: 0.6 }); blip({ f: 120, to: 48, d: 0.36, w: 'sawtooth', g: 0.24, lp: 600 }) },

  /* —— 收场 —— */
  win: () => { [0, 4, 7, 12].forEach((s, i) => blip({ f: hz(s), d: 0.5, w: 'triangle', g: 0.18, at: i * 0.1, lp: 3200 })) },
  lose: () => { [0, -3, -8].forEach((s, i) => blip({ f: hz(s - 12), d: 0.8, w: 'sine', g: 0.2, at: i * 0.16, lp: 900 })) },
  flee: () => { crunch({ d: 0.5, f: 1200, to: 200, g: 0.16, hp: 200 }); blip({ f: hz(-5), to: hz(-17), d: 0.45, w: 'triangle', g: 0.14 }) },
  loot: () => { [12, 19, 24].forEach((s, i) => blip({ f: hz(s), d: 0.34, w: 'sine', g: 0.16, at: i * 0.07 })) },
}

/** 放一声音效；没有音频上下文时静静什么都不做 */
export function sfx(name: SfxName): void {
  if (!ac()) return
  const fn = BANK[name]
  if (!fn) return
  try {
    fn()
  } catch {
    /* 一声没响而已，别把界面带下去 */
  }
}
