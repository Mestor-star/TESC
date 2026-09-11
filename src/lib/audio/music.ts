/* ============================================================
   背景音 —— 六段各自成曲的底噪，不是循环播放的曲子
   ------------------------------------------------------------
   每一段「床」（bed）不再只是一层嗡鸣：它有一句和弦进行、一条主旋律
   （motif / alt 两个乐句交替）、低音写法、打点，与一条垫在底下的正弦。
   调度器按小节往前排，排到哪算哪 —— 所以同一段床听久了也听不出接缝，
   因为它本来就没有「一遍」的概念；而每一条旋律线都是相对**本小节
   和弦根音**写的半音，进行走到哪一句，旋律就跟着换到那一个和弦上。

   口径：终末停滞委员会是个观测机构，不是乐队。
   界面上是冷色的、缓慢的、几乎不动的；作战时才让节奏进来 ——
   所以主旋律一律稀疏（半数格子是休止），只有作战与 boss 那两段排满。

   不带音频素材：全部由 Web Audio 现场合成，没有一份 mp3 / ogg。
   ============================================================ */

import { ac, bedsOn, musicOut, now } from './engine'
import { hz } from './sfx'

export type BedName = 'terminal' | 'plot' | 'battle' | 'boss' | 'menu' | 'tavern'

/** 主旋律的四种音色 */
type Voice = 'pluck' | 'flute' | 'glass' | 'brass'

/** 一个小节的和声：根音（半音，相对 A4）、叠在根音上的音程、低音落点 */
export interface Chord {
  r: number
  s: number[]
  /** 低音相对根音的半音差（缺省 -12，即根音低一个八度）。
     和弦走得低的那些（Bb、C）靠它把低音留在听得见的那个八度里。 */
  b?: number
}

interface Bed {
  /** 每分钟拍数 */
  bpm: number
  /** 和弦进行，一小节走一个，循环 */
  prog: Chord[]
  bass: 'hold' | 'pulse' | 'none'
  /** 垫在低音底下那条正弦的音量（0 = 不用） */
  sub: number
  beat: 'none' | 'brush' | 'soft' | 'hard'
  /** 主旋律音色（null = 这一段没有旋律，只走和声） */
  lead: Voice | null
  /** 主旋律：相对本小节根音的半音，null = 这一格空着。整小节正好排完 */
  motif: (number | null)[]
  /** 另一句。与 motif 轮流用：第 0 句走 motif，第 1 句走 alt */
  alt?: (number | null)[]
  /** 隔几小节来一句（缺省每小节） */
  leadEvery?: number
  leadGain: number
  /** pad 峰值的两个低通角（缺省 420 → 900，冷；作战的两段开得更亮） */
  padCut?: [number, number]
  /** 铃音可选音（相对根音的半音）—— 只写三和弦里都站得住的音程：
      八度、十二度、两个八度。写三度、七度的话，进行一换和弦就跑调了。 */
  bells: number[]
  /** 每小节出铃音的概率 */
  bellOdds: number
  /** pad 峰值音量 */
  pad: number
}

/**
 * 六段床的全部材料。**导出是为了复核**（见 scripts/mech 第 16 节）：
 * 进行里换和弦时，铃音与旋律会不会跑调、低音会不会掉到听不见，
 * 是看一眼听不出来的，得有一条断言替它守着。
 */
export const BEDS: Record<BedName, Bed> = {
  /* 终端里待着：A 小调，冷、缓、几乎不动，一句玻璃音偶尔划过去 */
  terminal: {
    bpm: 56,
    prog: [
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -16, s: [0, 4, 7, 12] },   // F
      { r: -21, s: [0, 4, 7, 12] },   // C
      { r: -17, s: [0, 3, 7, 12] },   // Em
    ],
    bass: 'hold', sub: 0.07, beat: 'none',
    lead: 'glass', leadEvery: 2,
    motif: [12, null, null, 10, null, null, 7, null],
    alt: [15, null, 12, null, null, 10, null, null],
    leadGain: 0.055,
    bells: [12, 19, 24], bellOdds: 0.45, pad: 0.085,
  },
  /* 剧情推进：D 小调，把 pad 再抽掉一半，四小节才来一句长笛 —— 留白给文字 */
  plot: {
    bpm: 50,
    prog: [
      { r: -19, s: [0, 3, 7] },             // Dm
      { r: -23, s: [0, 4, 7], b: 0 },       // Bb —— 低音够低了，不再往下走
      { r: -16, s: [0, 4, 7] },             // F
      { r: -21, s: [0, 4, 7] },             // C
    ],
    bass: 'hold', sub: 0.06, beat: 'none',
    lead: 'flute', leadEvery: 4,
    motif: [12, null, null, 15, null, null, 14, null],
    leadGain: 0.05,
    bells: [12, 19], bellOdds: 0.3, pad: 0.07,
  },
  /* 短信：比终端暖一点。拨弦走和弦音，刷子当拍子 */
  tavern: {
    bpm: 66,
    prog: [
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -16, s: [0, 4, 7, 12] },   // F
      { r: -21, s: [0, 4, 7, 12] },   // C
      { r: -14, s: [0, 4, 7, 12] },   // G
    ],
    bass: 'hold', sub: 0.06, beat: 'brush',
    lead: 'pluck',
    motif: [0, null, 4, null, 7, null, 4, null],
    alt: [7, null, 4, null, 0, null, 4, 7],
    leadGain: 0.05,
    bells: [12, 19, 24], bellOdds: 0.5, pad: 0.08,
  },
  /* 标题菜单：空场，只有空五度和回声 */
  menu: {
    bpm: 46,
    prog: [
      { r: -12, s: [0, 7, 12, 19] },  // Am（不写三度）
      { r: -17, s: [0, 7, 12, 19] },  // Em
      { r: -16, s: [0, 7, 12, 19] },  // F
      { r: -14, s: [0, 7, 12, 19] },  // G
    ],
    bass: 'hold', sub: 0.07, beat: 'none',
    lead: 'glass', leadEvery: 4,
    motif: [12, null, null, null, 19, null, null, null],
    alt: [24, null, null, 19, null, null, 12, null],
    leadGain: 0.055,
    bells: [12, 19, 24], bellOdds: 0.35, pad: 0.1,
  },
  /* 作战：低音开始脉冲，底鼓与噪声当拍子，八分音符的拨弦一路推着走 */
  battle: {
    bpm: 106,
    prog: [
      { r: -17, s: [0, 7, 12] },      // Em
      { r: -21, s: [0, 7, 12] },      // C
      { r: -14, s: [0, 7, 12] },      // G
      { r: -19, s: [0, 7, 12] },      // D
    ],
    bass: 'pulse', sub: 0.05, beat: 'soft',
    lead: 'pluck',
    motif: [0, 7, 12, 7, 0, 7, 12, 7],
    alt: [0, 7, 12, 15, 12, 7, 0, 7],
    leadGain: 0.04, padCut: [600, 1500],
    bells: [12, 19], bellOdds: 0.2, pad: 0.055,
  },
  /* boss：整条低音半音往下压，打点变实，铜管在头上悬着 */
  boss: {
    bpm: 120,
    prog: [
      { r: -12, s: [0, 3, 7] },   // Am
      { r: -13, s: [0, 4, 7] },   // Ab —— 半音滑下来那一下
      { r: -16, s: [0, 4, 7] },   // F
      { r: -17, s: [0, 4, 7] },   // E
    ],
    bass: 'pulse', sub: 0.08, beat: 'hard',
    lead: 'brass', leadEvery: 2,
    motif: [12, null, null, 12, null, 13, null, null],
    alt: [15, null, 13, null, 12, null, 11, null],
    leadGain: 0.06, padCut: [500, 1300],
    bells: [19, 24], bellOdds: 0.12, pad: 0.07,
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
function pad(
  c: AudioContext, out: AudioNode, freqs: number[],
  t: number, dur: number, gain: number, cut: [number, number] = [420, 900],
): void {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(cut[0], t)
  lp.frequency.linearRampToValueAtTime(cut[1], t + dur * 0.6)
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

/** 底：一条正弦，慢起慢落，只借厚度 —— 与低音同音高，包络不同 */
function subLine(c: AudioContext, out: AudioNode, f: number, t: number, dur: number, gain: number): void {
  if (f < 40) return   // 40Hz 以下在这个场景里只剩糊，不如不发声
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.value = f
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.3)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/**
 * 主旋律。四种音色差在「起音多快、衰减多长、低通多亮」上：
 *   pluck 拨弦 —— 极短的起音、三角波、半秒就落回去
 *   flute 长笛 —— 慢起音，气音噪声垫在下面，带一点点颤音
 *   glass 玻璃 —— 正弦加一个不谐的分音，亮、长、像敲了一下
 *   brass 铜管 —— 两把锯齿、高 Q 低通，起音时滤过去，颤得比长笛深
 */
function lead(c: AudioContext, out: AudioNode, voice: Voice, f: number, t: number, dur: number, gain: number): void {
  const g = c.createGain()
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.7
  lp.connect(g)
  g.connect(out)

  let wave: OscillatorType = 'triangle'
  let atk = 0.01
  let dec = Math.min(dur, 0.5)
  let vib = 0
  switch (voice) {
    case 'pluck': wave = 'triangle'; atk = 0.005; dec = Math.min(dur, 0.45); lp.frequency.value = 2800; break
    case 'flute': wave = 'sine'; atk = 0.09; dec = dur; vib = 3; lp.frequency.value = 1800; break
    case 'glass': wave = 'sine'; atk = 0.004; dec = Math.min(dur, 1.4); lp.frequency.value = 6000; break
    case 'brass': wave = 'sawtooth'; atk = 0.05; dec = dur; vib = 5; lp.frequency.value = 1100; lp.Q.value = 3.2; break
  }

  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec)

  // 铜管的低通要从暗处推上来，才像「吹出来」而不是「切出来」
  if (voice === 'brass') {
    lp.frequency.setValueAtTime(lp.frequency.value * 0.45, t)
    lp.frequency.linearRampToValueAtTime(1100, t + atk * 4)
  }

  const stop = t + atk + dec + 0.05
  const oscs: OscillatorNode[] = []
  const o1 = c.createOscillator()
  o1.type = wave
  o1.frequency.value = f
  o1.connect(lp)
  oscs.push(o1)

  if (voice === 'brass') {
    const o2 = c.createOscillator()
    o2.type = 'sawtooth'
    o2.frequency.value = f * (1 + 8 / 1200)
    o2.connect(lp)
    oscs.push(o2)
  } else if (voice === 'glass') {
    const o2 = c.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = f * 2.76
    const g2 = c.createGain()
    g2.gain.setValueAtTime(0.0001, t)
    g2.gain.exponentialRampToValueAtTime(gain * 0.22, t + 0.008)
    g2.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dec, 0.9))
    o2.connect(g2)
    g2.connect(out)
    o2.start(t)
    o2.stop(t + Math.min(dec, 0.9) + 0.05)
  } else if (voice === 'flute') {
    // 气音：一段很轻的噪声，带通在基频的两倍上
    const n = c.createBufferSource()
    n.buffer = noise(c)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f * 2
    bp.Q.value = 1.2
    const ng = c.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.linearRampToValueAtTime(gain * 0.12, t + atk)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + atk + Math.min(dec, 0.4))
    n.connect(bp)
    bp.connect(ng)
    ng.connect(out)
    n.start(t)
    n.stop(t + atk + 0.5)
  } else {
    // 拨弦：起音上一点噪声当拨片那一下
    const n = c.createBufferSource()
    n.buffer = noise(c)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f * 3
    bp.Q.value = 0.8
    const ng = c.createGain()
    ng.gain.setValueAtTime(gain * 0.35, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    n.connect(bp)
    bp.connect(ng)
    ng.connect(out)
    n.start(t)
    n.stop(t + 0.06)
  }

  if (vib) {
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 5.2
    const lg = c.createGain()
    lg.gain.value = f * (vib / 1200)
    lfo.connect(lg)
    lg.connect(o1.frequency)
    lfo.start(t)
    lfo.stop(stop)
  }

  for (const o of oscs) { o.start(t); o.stop(stop) }
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

/** 刷子：比 hats 软、比 hats 长的噪声，短信那一段当拍子用 */
function shaker(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const s = c.createBufferSource()
  s.buffer = noise(c)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3400
  bp.Q.value = 0.9
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  s.connect(bp)
  bp.connect(g)
  g.connect(out)
  s.start(t)
  s.stop(t + 0.2)
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

/** 桶鼓：比底鼓高一截、落得慢一点，boss 那一段收小节用 */
function tom(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(160, t)
  o.frequency.exponentialRampToValueAtTime(78, t + 0.26)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + 0.35)
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
    const ch = bed.prog[bar % bed.prog.length]
    const chordTones = ch.s.map((s) => hz(ch.r + s))
    pad(c, out, chordTones, t, barDur * 0.98, bed.pad, bed.padCut)

    const bassF = hz(ch.r + (ch.b ?? -12))
    if (bed.sub > 0) subLine(c, out, bassF, t, barDur * 0.95, bed.sub)

    if (bed.bass === 'hold') {
      bassLine(c, out, bassF, t, barDur * 0.9, 0.13)
    } else if (bed.bass === 'pulse') {
      for (let i = 0; i < 8; i++) bassLine(c, out, bassF, t + i * spb * 0.5, spb * 0.45, i % 4 === 0 ? 0.19 : 0.1)
    }

    if (bed.beat === 'brush') {
      for (let i = 0; i < 8; i++) shaker(c, out, t + i * spb * 0.5, i % 2 ? 0.055 : 0.03)
    } else if (bed.beat === 'soft') {
      kick(c, out, t, 0.22)
      kick(c, out, t + spb * 2, 0.18)
      for (let i = 0; i < 8; i++) hat(c, out, t + i * spb * 0.5, i % 2 ? 0.045 : 0.08)
    } else if (bed.beat === 'hard') {
      kick(c, out, t, 0.26)
      kick(c, out, t + spb * 1.5, 0.16)
      kick(c, out, t + spb * 2, 0.22)
      kick(c, out, t + spb * 3, 0.2)
      for (let i = 0; i < 16; i++) hat(c, out, t + i * spb * 0.25, i % 4 === 0 ? 0.09 : i % 2 ? 0.03 : 0.05)
      tom(c, out, t + spb * 3.5, 0.16)
      tom(c, out, t + spb * 3.75, 0.13)
    }

    // 主旋律：每 leadEvery 小节来一句，两句轮流 —— 听久了不算复读
    const voice = bed.lead
    const every = bed.leadEvery ?? 1
    if (voice && bar % every === 0) {
      const notes = bed.alt && Math.floor(bar / every) % 2 === 1 ? bed.alt : bed.motif
      const slot = barDur / notes.length
      notes.forEach((n, i) => {
        if (n === null) return
        lead(c, out, voice, hz(ch.r + n), t + i * slot, slot * 0.92, bed.leadGain)
      })
    }

    if (Math.random() < bed.bellOdds) {
      const b = bed.bells[Math.floor(Math.random() * bed.bells.length)]
      const at = t + spb * [0, 1, 2, 3][Math.floor(Math.random() * 4)]
      bell(c, out, hz(ch.r + b + 12), at, 0.075)
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
    /*
      换了人就不接着上一段的小节走：进行从头起，听感上像是「换了张碟」。
      时刻也要一并从头起 —— 上一段往前排到哪儿了，那是**它**的小节长度算出来的，
      跟着走的话（bpm 46 的菜单曲一拍 5.2 秒）新的一段的头一小节会被整个跳过，
      淡出之后接上来的是一片安静。只有回到同一段时才接着往后排。
    */
    if (prev !== name) { bar = 0; nextT = now() + 0.05 } else { nextT = Math.max(nextT, now() + 0.05) }
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
