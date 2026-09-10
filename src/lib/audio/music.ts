/* ============================================================
   背景音 —— 几段会自己走的底噪，不是循环播放的曲子
   ------------------------------------------------------------
   每段「床」（bed）是一小组参数：和弦进行 + 低音写法 + 打点 + 铃音概率。
   调度器按小节往前排，排到哪算哪 —— 所以同一段床听久了也不会
   听出接缝，因为它本来就没有「一遍」的概念。

   口径：终末停滞委员会是个观测机构，不是乐队。
   界面上是冷色的、缓慢的、几乎不动的；作战时才让节奏进来。
   ============================================================ */

import { ac, bedsOn, musicOut, now } from './engine'
import { hz } from './sfx'

export type BedName = 'terminal' | 'plot' | 'battle' | 'boss' | 'menu' | 'tavern'

interface Bed {
  /** 每分钟拍数 */
  bpm: number
  /** 和弦根音（半音，相对 A4），每小节取一个，循环 */
  roots: number[]
  /** 叠在根音上的音程 —— 一起构成那一小节的和声 */
  stack: number[]
  bass: 'hold' | 'pulse' | 'none'
  beat: 'none' | 'soft' | 'hard'
  /** 铃音可选音（相对根音的半音） */
  bells: number[]
  /** 每小节出铃音的概率 */
  bellOdds: number
  /** pad 峰值音量 */
  pad: number
}

const BEDS: Record<BedName, Bed> = {
  /* 终端里待着：一架冷色的、几乎不动的嗡鸣 */
  terminal: {
    bpm: 58, roots: [-12, -12, -15, -17], stack: [0, 7, 12],
    bass: 'hold', beat: 'none', bells: [12, 15, 19, 24], bellOdds: 0.5, pad: 0.1,
  },
  /* 剧情推进：把 pad 再抽掉一半，留白给文字 */
  plot: {
    bpm: 52, roots: [-15, -17, -20, -17], stack: [0, 7],
    bass: 'hold', beat: 'none', bells: [12, 19, 24], bellOdds: 0.34, pad: 0.075,
  },
  /* 短信：比终端暖一点，多一点铃 */
  tavern: {
    bpm: 64, roots: [-10, -14, -12, -17], stack: [0, 4, 9],
    bass: 'hold', beat: 'none', bells: [12, 16, 19, 23], bellOdds: 0.66, pad: 0.085,
  },
  /* 标题菜单：空场，只有回声 */
  menu: {
    bpm: 48, roots: [-17, -17, -22, -15], stack: [0, 12],
    bass: 'hold', beat: 'none', bells: [12, 24], bellOdds: 0.4, pad: 0.11,
  },
  /* 作战：低音开始脉冲，噪声当拍子 */
  battle: {
    bpm: 104, roots: [-12, -12, -10, -14], stack: [0, 7],
    bass: 'pulse', beat: 'soft', bells: [12, 19], bellOdds: 0.22, pad: 0.06,
  },
  /* boss：整条低音往下压，打点变实 */
  boss: {
    bpm: 118, roots: [-12, -13, -17, -16], stack: [0, 6, 11],
    bass: 'pulse', beat: 'hard', bells: [13, 19], bellOdds: 0.3, pad: 0.07,
  },
}

let noiseBuf: AudioBuffer | null = null
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const len = Math.floor(c.sampleRate * 0.5)
  const b = c.createBuffer(1, len, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  noiseBuf = b
  return b
}

/* ------------------------------------------------------------------
   几件乐器
   ------------------------------------------------------------------ */

/** 垫底的和声：每个音两把失谐的锯齿，过低通，起落都很慢 */
function pad(c: AudioContext, out: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(420, t)
  lp.frequency.linearRampToValueAtTime(900, t + dur * 0.6)
  lp.Q.value = 0.7
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  lp.connect(g)
  g.connect(out)
  for (const f of freqs) {
    for (const det of [-4, 4]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f * (1 + det / 1200)
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.1)
    }
  }
}

/** 低音：一下就是一下，缓出 */
function bassLine(c: AudioContext, out: AudioNode, f: number, t: number, dur: number, gain: number): void {
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(f, t)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 380
  o.connect(lp)
  lp.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** 铃：正弦加一个不谐的分音，像敲了一下金属 */
function bell(c: AudioContext, out: AudioNode, f: number, t: number, gain: number): void {
  for (const [mul, mul2, dec] of [[1, 1, 1.6], [2.76, 0.28, 0.9]] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f * mul
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain * mul2, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
    o.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + dec + 0.05)
  }
}

/** 拍子：一声短噪声 */
function hat(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const s = c.createBufferSource()
  s.buffer = noise(c)
  const h = c.createBiquadFilter()
  h.type = 'highpass'
  h.frequency.value = 5200
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  s.connect(h)
  h.connect(g)
  g.connect(out)
  s.start(t)
  s.stop(t + 0.12)
}

/** 底鼓：一个从 120Hz 滑到 45Hz 的正弦 */
function kick(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(120, t)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.14)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + 0.25)
}

/* ------------------------------------------------------------------
   调度
   ------------------------------------------------------------------ */

let current: BedName | null = null
let pending: BedName | null = null
let bus: GainNode | null = null
let timer: number | null = null
/** 已经排到第几个小节 */
let bar = 0
/** 排到的时刻 */
let nextT = 0

const LOOKAHEAD = 0.7   // 往前排这么多秒
const TICK = 180        // 每这么久检查一次

function schedule(name: BedName): void {
  const c = ac()
  const out = bus
  if (!c || !out) return
  const bed = BEDS[name]
  const spb = 60 / bed.bpm
  const barDur = spb * 4

  while (nextT < c.currentTime + LOOKAHEAD) {
    const t = nextT
    const root = bed.roots[bar % bed.roots.length]
    const chordTones = bed.stack.map((s) => hz(root + s))
    pad(c, out, chordTones, t, barDur * 0.98, bed.pad)

    if (bed.bass === 'hold') {
      bassLine(c, out, hz(root - 12), t, barDur * 0.9, 0.14)
    } else if (bed.bass === 'pulse') {
      for (let i = 0; i < 8; i++) bassLine(c, out, hz(root - 12), t + i * spb * 0.5, spb * 0.45, i % 4 === 0 ? 0.2 : 0.1)
    }

    if (bed.beat === 'soft') {
      for (let i = 0; i < 8; i++) hat(c, out, t + i * spb * 0.5, i % 2 ? 0.05 : 0.09)
    } else if (bed.beat === 'hard') {
      kick(c, out, t, 0.26)
      kick(c, out, t + spb * 2, 0.22)
      for (let i = 0; i < 8; i++) hat(c, out, t + i * spb * 0.5, i % 2 ? 0.06 : 0.11)
    }

    if (Math.random() < bed.bellOdds) {
      const b = bed.bells[Math.floor(Math.random() * bed.bells.length)]
      const at = t + spb * [0, 1, 2, 3][Math.floor(Math.random() * 4)]
      bell(c, out, hz(root + b + 12), at, 0.075)
    }

    bar++
    nextT += barDur
  }
}

function ensureBus(): GainNode | null {
  const c = ac()
  const parent = musicOut()
  if (!c || !parent) return null
  if (!bus) {
    bus = c.createGain()
    bus.gain.value = 0.0001
    bus.connect(parent)
  }
  return bus
}

/**
 * 换一段背景音。同一段重复调用无副作用。
 * 没有音频上下文时先记下来，等 unlockAudio 之后自动接上。
 */
export function setBed(name: BedName | null): void {
  /*
    底噪没开就一段都不起 —— 只把「本来该放哪一段」记下来，
    等用户在设置里把它打开（wakeBed）再补上。
    这条是「莫名出声」的主要来源：以前只要在任意处点过一下，
    底噪就自己淡进来了，而用户从没说过要听音乐。
  */
  if (!bedsOn()) { pending = name; return }
  if (name === current) return
  if (!ac()) { pending = name; current = name; return }
  const c = ac()
  const b = ensureBus()
  if (!c || !b) return

  // 旧的一层先淡掉，再换新的 —— 直接切会有明显的一下
  b.gain.cancelScheduledValues(c.currentTime)
  b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), c.currentTime)
  b.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6)

  const prev = current
  current = name
  pending = name
  window.setTimeout(() => {
    if (current !== name) return
    if (!name) {
      if (timer !== null) { window.clearInterval(timer); timer = null }
      return
    }
    // 换了人就不接着上一段的小节走：根音进行从头起，听感上像是「换了张碟」
    if (prev !== name) bar = 0
    nextT = Math.max(nextT, now() + 0.05)
    b.gain.cancelScheduledValues(now())
    b.gain.setValueAtTime(0.0001, now())
    b.gain.exponentialRampToValueAtTime(1, now() + 0.8)
    schedule(name)
    if (timer === null) timer = window.setInterval(() => schedule(name), TICK)
  }, 620)
}

/** 上下文建立之后把之前记下的那一段接上 */
export function resumeBed(): void {
  const want = pending
  current = null
  pending = null
  if (want) setBed(want)
}

/**
 * 用户在设置里把底噪打开了：把「本来该放的那一段」补上。
 * 与 resumeBed 分开，是因为这里**必须**绕开 bedsOn —— 它就是在 bedsOn 变 true 之后才调的。
 */
export function wakeBed(): void {
  const want = pending
  current = null
  if (!want) return
  pending = null
  setBed(want)
}

/** 彻底停下（关掉声音或离开时用） */
export function stopBed(): void {
  if (timer !== null) { window.clearInterval(timer); timer = null }
  current = null
  pending = null
  const c = ac()
  if (bus && c) {
    try { bus.gain.setTargetAtTime(0.0001, c.currentTime, 0.1) } catch { bus.gain.value = 0.0001 }
  }
}

/** 现在放的是哪一段 */
export function currentBed(): BedName | null {
  return current
}
