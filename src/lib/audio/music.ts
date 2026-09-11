/* ============================================================
   背景音 —— 六段各自成曲的底噪
   ------------------------------------------------------------
   上一版有三处不成立，这一版是照着这三处重写的：

   ① **旋律写在调上，不写在和弦上。** 上一版的乐句值是「相对本小节和弦根音」
      的半音，和弦一换，同一句就被整体拖到另一个音上 —— 听感是「跑调」，
      因为一句旋律的**音程结构**被每次换和弦改写了（小三度转过去变成大三度）。
      现在每段床写一个调（主音 + 音阶），旋律是相对**主音**的半音，
      和弦在底下走，旋律不走调。代价是旋律与和弦偶尔顶出挂留音 ——
      那是正常的，而且正是它好听的来源。
   ② **铃是写在谱面上的，不是掷骰子。** 上一版每小节按概率随机挑一个音、
      随机挑一拍落一下 —— 那不是配器，那是噪声。现在一两声铃写在
      「第几小节第几拍哪个音」上，而且必须是那一小节和弦的和弦音（复核钉住）。
   ③ **有空间。** 上一版每一件乐器都直接怼在总线上，干得发涩。
      现在有一间**现场合成的混响**（用噪声乘指数衰减现搓一段脉冲响应，
      不带任何音频素材）与一条附点八分的点延，走 mel 那条母线，
      鼓与低音保持干 —— 湿的鼓是糊的。

   另外：和声一律在本调音阶内（不复核不放过），每段一句八小节的主题，
   重复才是「曲子」；上一版四小节一循环、没有任何东西可记，听着就是嗡鸣。

   口径没变：终末停滞委员会是个观测机构，不是乐队。
   界面上是冷色的、缓慢的、几乎不动的；作战时才让节奏进来。
   ============================================================ */

import { ac, bedsOn, musicOut, now } from './engine'
import { hz } from './sfx'

export type BedName = 'terminal' | 'plot' | 'battle' | 'boss' | 'menu' | 'tavern'

/** 主旋律的四种音色 */
type Voice = 'pluck' | 'flute' | 'glass' | 'brass'

/** 一个小节的和声：根音（半音，相对 A4）与叠在它上面的音程 */
export interface Chord {
  r: number
  s: number[]
}

/** 一声铃：写在第几小节（0 起，按进行长度取模）、第几拍（四分音符为单位，可带小数）、哪个音 */
export interface Bell { bar: number; beat: number; note: number }

export interface Bed {
  /** 每分钟拍数 */
  bpm: number
  /** 本段的调：主音（半音，相对 A4）与音阶（相对主音的半音）。
      旋律与和声都从这里取音 —— 复核逐音查这一条。 */
  key: { root: number; scale: number[] }
  /** 和弦进行，一小节走一个；长度就是这一段的形式长度（八小节一句） */
  prog: Chord[]
  /** 主题：一小节八格（八分音符），整句连写；值是相对 A4 的半音，null = 留白。
      长度必须是 进行长度 × 8（复核钉住），循环即「一遍曲子」。 */
  melody: (number | null)[]
  voice: Voice
  leadGain: number
  /** 写出来的铃（可以一声都没有） */
  bells: Bell[]
  bass: 'hold' | 'pulse' | 'none'
  /** 垫在低音底下那条正弦的音量（0 = 不用） */
  sub: number
  beat: 'none' | 'brush' | 'soft' | 'hard'
  /** 混响湿度（0–1，走 mel 母线） */
  verb: number
  /** 点延声部的量（0–1，同上） */
  delay: number
  /** pad 峰值音量 */
  pad: number
}

/** 自然小调与多利亚 —— 六段只用这两条，都是冷的 */
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]

/**
 * 六段床的全部材料。**导出是为了复核**（见 scripts/mech 第 16 节）：
   旋律有没有出调、铃是不是和弦音、低音有没有掉到听不见的八度去 ——
   这些看一眼听不出来，得有一条断言替它守着。
 */
export const BEDS: Record<BedName, Bed> = {
  /* 终端里待着：A 小调，玻璃音，冷、缓。
     进行 Am F C G | Am F Dm Em —— 第二句落到 Dm 再被 Em 抬回主音，
     主题就是那条 E→D→C→B→A→C→D→B 的弧。 */
  terminal: {
    bpm: 56,
    key: { root: 0, scale: MINOR },
    prog: [
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -16, s: [0, 4, 7, 12] },   // F
      { r: -9, s: [0, 4, 7, 12] },    // C
      { r: -14, s: [0, 4, 7, 12] },   // G
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -16, s: [0, 4, 7, 12] },   // F
      { r: -19, s: [0, 3, 7, 12] },   // Dm
      { r: -17, s: [0, 3, 7, 12] },   // Em
    ],
    melody: [
      7, null, null, null, null, null, null, null,
      3, null, null, null, null, null, null, null,
      7, null, null, null, 5, null, 3, null,
      2, null, null, null, null, null, null, null,
      0, null, null, null, null, null, null, null,
      3, null, null, null, null, null, null, null,
      5, null, null, null, null, null, null, null,
      2, null, null, null, null, null, null, null,
    ],
    voice: 'glass', leadGain: 0.055,
    bells: [{ bar: 0, beat: 0, note: 12 }, { bar: 6, beat: 2, note: 5 }],
    bass: 'hold', sub: 0.07, beat: 'none', verb: 0.5, delay: 0.22, pad: 0.05,
  },

  /* 剧情推进：D 小调，长笛，四小节才一句 —— 留白给文字。
     主音落在 D4，整句都在 290–590Hz 这个说得出话的八度里。 */
  plot: {
    bpm: 50,
    key: { root: -7, scale: MINOR },
    prog: [
      { r: -19, s: [0, 3, 7, 12] },   // Dm
      { r: -23, s: [0, 4, 7, 12] },   // Bb
      { r: -16, s: [0, 4, 7, 12] },   // F
      { r: -21, s: [0, 4, 7, 12] },   // C
      { r: -19, s: [0, 3, 7, 12] },   // Dm
      { r: -23, s: [0, 4, 7, 12] },   // Bb
      { r: -14, s: [0, 3, 7, 12] },   // Gm
      { r: -12, s: [0, 3, 7, 12] },   // Am
    ],
    melody: [
      0, null, null, null, null, null, null, null,
      -4, null, null, null, null, null, null, null,
      0, null, null, null, -2, null, null, null,
      3, null, null, null, null, null, null, null,
      5, null, null, null, 3, null, null, null,
      1, null, null, null, null, null, null, null,
      -2, null, null, null, -4, null, null, null,
      0, null, null, null, null, null, null, null,
    ],
    voice: 'flute', leadGain: 0.06,
    bells: [{ bar: 3, beat: 0, note: 3 }],
    bass: 'hold', sub: 0.06, beat: 'none', verb: 0.62, delay: 0.26, pad: 0.05,
  },

  /* 短信：A 多利亚（多一个升六度，比小调暖），拨弦配刷子。
     主音落低一个八度，A3 —— 拨弦在那个位置才暖。 */
  tavern: {
    bpm: 66,
    key: { root: -12, scale: DORIAN },
    prog: [
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -14, s: [0, 4, 7, 12] },   // G
      { r: -9, s: [0, 4, 7, 12] },    // C
      { r: -19, s: [0, 4, 7, 12] },   // D
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -14, s: [0, 4, 7, 12] },   // G
      { r: -17, s: [0, 3, 7, 12] },   // Em
      { r: -19, s: [0, 4, 7, 12] },   // D
    ],
    melody: [
      0, null, 3, null, 5, null, 3, null,
      2, null, 2, null, 0, null, null, null,
      3, null, 7, null, 5, null, 3, null,
      5, null, 2, null, 0, null, null, null,
      0, null, 3, null, 5, null, 9, null,
      7, null, 5, null, 3, null, null, null,
      2, null, 3, null, 2, null, 0, null,
      0, null, 2, null, 5, null, null, null,
    ],
    voice: 'pluck', leadGain: 0.06,
    bells: [{ bar: 1, beat: 2, note: 10 }, { bar: 5, beat: 2, note: 10 }, { bar: 7, beat: 0, note: 5 }],
    bass: 'hold', sub: 0.06, beat: 'brush', verb: 0.32, delay: 0.14, pad: 0.05,
  },

  /* 标题菜单：空场。pad 只叠五度与八度，不写三度 —— 大三还是小三留给空气去猜；
     主题一句一个音（一小节才落一下），从 E 升到 B 再落回来。 */
  menu: {
    bpm: 46,
    key: { root: 0, scale: MINOR },
    prog: [
      { r: -12, s: [0, 7, 12, 19] },
      { r: -16, s: [0, 7, 12, 19] },
      { r: -9, s: [0, 7, 12, 19] },
      { r: -14, s: [0, 7, 12, 19] },
      { r: -12, s: [0, 7, 12, 19] },
      { r: -19, s: [0, 7, 12, 19] },
      { r: -16, s: [0, 7, 12, 19] },
      { r: -17, s: [0, 7, 12, 19] },
    ],
    melody: [
      7, null, null, null, null, null, null, null,
      8, null, null, null, null, null, null, null,
      10, null, null, null, null, null, null, null,
      14, null, null, null, null, null, null, null,
      12, null, null, null, null, null, null, null,
      5, null, null, null, null, null, null, null,
      8, null, null, null, null, null, null, null,
      7, null, null, null, null, null, null, null,
    ],
    voice: 'glass', leadGain: 0.055,
    bells: [{ bar: 3, beat: 0, note: 10 }, { bar: 7, beat: 0, note: 7 }],
    bass: 'hold', sub: 0.07, beat: 'none', verb: 0.7, delay: 0.25, pad: 0.055,
  },

  /* 作战：E 小调，底鼓与军鼓把拍子立住，拨弦先走四小节固定音型，
     后四小节把它推开 —— 八小节一句，重复才是主题。 */
  battle: {
    bpm: 106,
    key: { root: -5, scale: MINOR },
    prog: [
      { r: -17, s: [0, 7, 12] },      // Em
      { r: -9, s: [0, 7, 12] },       // C
      { r: -14, s: [0, 7, 12] },      // G
      { r: -19, s: [0, 7, 12] },      // D
      { r: -17, s: [0, 7, 12] },      // Em
      { r: -9, s: [0, 7, 12] },       // C
      { r: -12, s: [0, 7, 12] },      // Am
      { r: -19, s: [0, 7, 12] },      // D
    ],
    melody: [
      -5, 2, 7, 2, -5, 2, 7, 2,
      -5, 2, 7, 2, -5, 2, 7, 2,
      -5, 2, 7, 2, -5, 2, 7, 2,
      -5, 2, 7, 2, -5, 2, 7, 2,
      7, 10, 14, 10, 7, 10, 7, 2,
      10, 7, 3, 7, 10, 14, 10, 7,
      7, 3, 0, 3, 7, 12, 7, 3,
      9, 7, 5, 2, 9, 7, 5, 2,
    ],
    voice: 'pluck', leadGain: 0.045,
    bells: [],
    bass: 'pulse', sub: 0.05, beat: 'soft', verb: 0.22, delay: 0.16, pad: 0.045,
  },

  /* boss：A 小调，低音半音往下压的安达卢西亚下行 Am G F Em —— 全在调内，
     压得住是因为低音一路落，不是因为加了变化音。铜管在下半句抬起来。 */
  boss: {
    bpm: 120,
    key: { root: -12, scale: MINOR },
    prog: [
      { r: -12, s: [0, 3, 7, 12] },   // Am
      { r: -14, s: [0, 4, 7, 12] },   // G
      { r: -16, s: [0, 4, 7, 12] },   // F
      { r: -17, s: [0, 3, 7, 12] },   // Em
      { r: -12, s: [0, 3, 7, 12] },
      { r: -14, s: [0, 4, 7, 12] },
      { r: -16, s: [0, 4, 7, 12] },
      { r: -17, s: [0, 3, 7, 12] },
    ],
    melody: [
      0, null, null, null, 3, null, null, null,
      2, null, null, null, 0, null, null, null,
      3, null, null, null, 0, null, null, null,
      -2, null, null, null, -5, null, null, null,
      0, null, 3, null, 7, null, null, null,
      2, null, 5, null, 7, null, null, null,
      3, null, 0, null, -4, null, null, null,
      -2, null, -5, null, 2, null, null, null,
    ],
    voice: 'brass', leadGain: 0.065,
    bells: [{ bar: 0, beat: 0, note: 12 }, { bar: 4, beat: 2, note: 3 }],
    bass: 'pulse', sub: 0.08, beat: 'hard', verb: 0.3, delay: 0.15, pad: 0.06,
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
   空间：一间现搓的混响 + 一条附点八分的点延

   不带音频素材这条是硬的 —— 所以脉冲响应也是算出来的：
   两声道各自一段噪声，过一阶低通磨软，前面留 18ms 空白，
   尾巴按 2.6 次方衰减。磨不磨那一下差别很大：
   不磨，混响头是「嘶」的一声；磨了，才是空气。
   ------------------------------------------------------------------ */

function makeIR(c: AudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const pre = Math.floor(c.sampleRate * 0.018)
  const b = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.34
      const tail = Math.pow(1 - i / len, 2.6)
      d[i] = i < pre ? 0 : lp * tail
    }
  }
  return b
}

/* ------------------------------------------------------------------
   几件乐器
   ------------------------------------------------------------------ */

/** 声像。老三样里没有 createStereoPanner 的话原样传下去，至少不炸 */
function panTo(c: AudioContext, out: AudioNode, pan: number): AudioNode {
  if (typeof c.createStereoPanner !== 'function') return out
  const p = c.createStereoPanner()
  p.pan.value = pan
  p.connect(out)
  return p
}

/** 一点点人味：音量与时刻各抖一下。机器打到每一拍都一模一样，是「假」的来源 */
const vel = (v: number, amt = 0.12) => v * (1 + (Math.random() * 2 - 1) * amt)
const human = (t: number, amt = 0.006) => t + (Math.random() * 2 - 1) * amt

/** 垫底的和声：每个音一把锯齿加一把三角，各自站一边，低通缓缓推上去再收回 */
function pad(c: AudioContext, out: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(520, t)
  lp.frequency.linearRampToValueAtTime(1150, t + dur * 0.5)
  lp.frequency.linearRampToValueAtTime(620, t + dur)
  lp.Q.value = 0.6
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.3)
  g.gain.linearRampToValueAtTime(gain * 0.72, t + dur * 0.72)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  lp.connect(g)
  g.connect(out)
  freqs.forEach((f, i) => {
    const p = panTo(c, lp, i % 2 ? 0.4 : -0.4)
    // 失谐只要几个音分。上一版一边 4 音分，四五个音一起晃就成了「嗡」
    for (const [type, lvl, det] of [['sawtooth', 0.62, 3], ['triangle', 0.5, -3]] as const) {
      const o = c.createOscillator()
      o.type = type
      o.frequency.value = f * (1 + det / 1200)
      const og = c.createGain()
      og.gain.value = lvl
      o.connect(og)
      og.connect(p)
      o.start(t)
      o.stop(t + dur + 0.12)
    }
  })
}

/** 低音：三角加正弦，一下就是一下，缓出 */
function bassLine(c: AudioContext, out: AudioNode, f: number, t: number, dur: number, gain: number): void {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 320
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  lp.connect(g)
  g.connect(out)
  for (const [type, lvl] of [['triangle', 1], ['sine', 0.45]] as const) {
    const o = c.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    const og = c.createGain()
    og.gain.value = lvl
    o.connect(og)
    og.connect(lp)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
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
 * 主旋律。四种音色差在起音、衰减、低通与分音上：
 *   pluck 拨弦 —— 极短的起音、半秒落回，另加一点拨片噪声
 *   flute 长笛 —— 慢起音，气音垫在下面，五赫兹的颤音
 *   glass 玻璃 —— 正弦加一个不谐分音，亮、长
 *   brass 铜管 —— 两把锯齿、高 Q 低通，起音时滤过去，颤得深一点
 */
function lead(c: AudioContext, out: AudioNode, voice: Voice, f: number, t: number, dur: number, gain: number): void {
  gain = vel(gain, voice === 'brass' ? 0.06 : 0.12)
  const p = panTo(c, out, voice === 'pluck' ? 0.16 : 0.06)
  const g = c.createGain()
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.7
  lp.connect(g)
  g.connect(p)

  let wave: OscillatorType = 'triangle'
  let atk = 0.01
  let dec = Math.min(dur, 0.5)
  let vib = 0
  let bend = 1
  switch (voice) {
    case 'pluck': wave = 'triangle'; atk = 0.005; dec = Math.min(dur, 0.42); lp.frequency.value = 3000; bend = 2; break
    case 'flute': wave = 'sine'; atk = 0.12; dec = dur; vib = 5; lp.frequency.value = 1900; break
    case 'glass': wave = 'sine'; atk = 0.004; dec = Math.min(dur, 1.3); lp.frequency.value = 6500; break
    case 'brass': wave = 'sawtooth'; atk = 0.055; dec = dur; vib = 7; lp.frequency.value = 1250; lp.Q.value = 3; break
  }

  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec)

  // 铜管的低通要从暗处推上来，才像「吹出来」而不是「切出来」
  if (voice === 'brass') {
    lp.frequency.setValueAtTime(lp.frequency.value * 0.45, t)
    lp.frequency.linearRampToValueAtTime(1250, t + atk * 4)
  }

  const stop = t + atk + dec + 0.05
  const o1 = c.createOscillator()
  o1.type = wave
  o1.frequency.setValueAtTime(f, t)
  if (bend > 1) o1.frequency.linearRampToValueAtTime(f * (1 + bend / 1200), t + 0.03)
  o1.connect(lp)

  if (voice === 'brass') {
    const o2 = c.createOscillator()
    o2.type = 'sawtooth'
    o2.frequency.value = f * (1 + 7 / 1200)
    o2.connect(lp)
    o2.start(t)
    o2.stop(stop)
  } else if (voice === 'glass') {
    const o2 = c.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = f * 2.76
    const g2 = c.createGain()
    g2.gain.setValueAtTime(0.0001, t)
    g2.gain.exponentialRampToValueAtTime(gain * 0.2, t + 0.008)
    g2.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dec, 0.85))
    o2.connect(g2)
    g2.connect(p)
    o2.start(t)
    o2.stop(t + Math.min(dec, 0.85) + 0.05)
  } else {
    // 拨弦 / 长笛的起音噪声：拨弦短而亮（拨片），长笛长而闷（气）
    const n = c.createBufferSource()
    n.buffer = noise(c)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = voice === 'flute' ? f * 2 : f * 3
    bp.Q.value = voice === 'flute' ? 1.2 : 0.8
    const ng = c.createGain()
    const ngain = gain * (voice === 'flute' ? 0.12 : 0.3)
    ng.gain.setValueAtTime(voice === 'flute' ? 0.0001 : ngain, t)
    if (voice === 'flute') ng.gain.linearRampToValueAtTime(ngain, t + atk)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + (voice === 'flute' ? atk + 0.4 : 0.03))
    n.connect(bp)
    bp.connect(ng)
    ng.connect(p)
    n.start(t)
    n.stop(t + 0.5)
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

  o1.start(t)
  o1.stop(stop)
}

/** 铃：正弦加一个不谐的分音，像敲了一下金属 */
function bell(c: AudioContext, out: AudioNode, f: number, t: number, gain: number): void {
  const p = panTo(c, out, 0.18)
  for (const [mul, mul2, dec] of [[1, 1, 2.2], [2.76, 0.26, 1.2]] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f * mul
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain * mul2, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
    o.connect(g)
    g.connect(p)
    o.start(t)
    o.stop(t + dec + 0.05)
  }
}

/** 踩镲：一声很短的噪声 */
function hat(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const s = c.createBufferSource()
  s.buffer = noise(c)
  const h = c.createBiquadFilter()
  h.type = 'highpass'
  h.frequency.value = 7200
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035)
  s.connect(h)
  h.connect(g)
  g.connect(out)
  s.start(t)
  s.stop(t + 0.08)
}

/** 刷子：比踩镲软、比踩镲长的噪声，短信那一段当拍子用 */
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

/** 军鼓：一段带通噪声加一具 190Hz 的鼓身 —— 有它，作战才像「一首曲子」 */
function snare(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const s = c.createBufferSource()
  s.buffer = noise(c)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1900
  bp.Q.value = 0.7
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  s.connect(bp)
  bp.connect(g)
  g.connect(out)
  s.start(t)
  s.stop(t + 0.2)

  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(190, t)
  o.frequency.exponentialRampToValueAtTime(140, t + 0.1)
  const og = c.createGain()
  og.gain.setValueAtTime(gain * 0.5, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
  o.connect(og)
  og.connect(out)
  o.start(t)
  o.stop(t + 0.14)
}

/** 底鼓：一个从 110Hz 滑到 45Hz 的正弦，起音上再点一下 */
function kick(c: AudioContext, out: AudioNode, t: number, gain: number): void {
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + 0.26)

  const s = c.createBufferSource()
  s.buffer = noise(c)
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1400
  const sg = c.createGain()
  sg.gain.setValueAtTime(gain * 0.25, t)
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012)
  s.connect(hp)
  hp.connect(sg)
  sg.connect(out)
  s.start(t)
  s.stop(t + 0.03)
}

/** 桶鼓：比底鼓高一截、落得慢一点，收小节用 */
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
/** 淡入淡出那一层，进 musicOut */
let bus: GainNode | null = null
/** 干的：鼓与低音走这条 —— 湿的鼓是糊的 */
let dryBus: GainNode | null = null
/** 湿的：和声与旋律走这条，从这里分一路给混响、一路给点延 */
let melBus: GainNode | null = null
let verbSend: GainNode | null = null
let delaySend: GainNode | null = null
let delayNode: DelayNode | null = null
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
  const mel = melBus
  const dry = dryBus
  if (!c || !out || !mel || !dry) return
  const bed = BEDS[name]
  const spb = 60 / bed.bpm
  const barDur = spb * 4
  const slot = barDur / 8      // 主题一格 = 一个八分音符
  const form = bed.prog.length

  while (nextT < c.currentTime + LOOKAHEAD) {
    const t = nextT
    const cycle = bar % form
    const ch = bed.prog[cycle]
    const bassF = hz(ch.r - 12)

    pad(c, mel, ch.s.map((s) => hz(ch.r + s)), t, barDur * 0.98, bed.pad)
    if (bed.sub > 0) subLine(c, dry, bassF, t, barDur * 0.95, bed.sub)

    if (bed.bass === 'hold') {
      bassLine(c, dry, bassF, t, barDur * 0.9, 0.12)
    } else if (bed.bass === 'pulse') {
      // 一小节八下：落在正拍上的重一些，其余是垫着的
      for (let i = 0; i < 8; i++) {
        bassLine(c, dry, bassF, human(t + i * spb * 0.5, 0.003), spb * 0.45, i % 4 === 0 ? 0.18 : 0.1)
      }
    }

    if (bed.beat === 'brush') {
      // 刷子走八分，二四拍上垫一记很轻的军鼓 —— 暖和，但不推人
      for (let i = 0; i < 8; i++) {
        shaker(c, dry, human(t + i * spb * 0.5), vel(i % 2 ? 0.05 : 0.028))
      }
      snare(c, dry, human(t + spb), 0.05)
      snare(c, dry, human(t + spb * 3), 0.055)
    } else if (bed.beat === 'soft') {
      kick(c, dry, human(t), 0.2)
      kick(c, dry, human(t + spb * 2), 0.16)
      snare(c, dry, human(t + spb), 0.1)
      snare(c, dry, human(t + spb * 3), 0.105)
      for (let i = 0; i < 8; i++) hat(c, dry, human(t + i * spb * 0.5), vel(i % 2 ? 0.035 : 0.055))
    } else if (bed.beat === 'hard') {
      kick(c, dry, human(t), 0.24)
      kick(c, dry, human(t + spb * 1.5), 0.13)
      kick(c, dry, human(t + spb * 2), 0.2)
      kick(c, dry, human(t + spb * 3), 0.17)
      snare(c, dry, human(t + spb), 0.12)
      snare(c, dry, human(t + spb * 3), 0.125)
      snare(c, dry, human(t + spb * 3.75), 0.04)   // 一记鬼音
      for (let i = 0; i < 16; i++) hat(c, dry, human(t + i * spb * 0.25), vel(i % 4 === 0 ? 0.07 : i % 2 ? 0.025 : 0.04))
      // 一句走完（第八小节）加两下桶鼓，把下一句接上
      if (cycle === form - 1) {
        tom(c, dry, human(t + spb * 3.5), 0.14)
        tom(c, dry, human(t + spb * 3.75), 0.11)
      }
    }

    // 主题：整句连写，一小节八格；写在哪一格就落在哪一格
    for (let i = 0; i < 8; i++) {
      const n = bed.melody[cycle * 8 + i]
      if (n === null || n === undefined) continue
      const dur = bed.voice === 'pluck' ? slot * 0.9 : slot * 2.4
      lead(c, mel, bed.voice, hz(n), human(t + i * slot, 0.005), dur, bed.leadGain)
    }

    for (const bl of bed.bells) {
      if (bl.bar === cycle) bell(c, mel, hz(bl.note), t + bl.beat * spb, 0.055)
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

    dryBus = c.createGain()
    dryBus.connect(bus)
    melBus = c.createGain()
    melBus.connect(bus)

    // 混响：mel → 送出 → 卷积 → 回总线
    const verb = c.createConvolver()
    verb.buffer = makeIR(c, 2.4)
    const wet = c.createGain()
    wet.gain.value = 1
    verb.connect(wet)
    wet.connect(bus)
    verbSend = c.createGain()
    verbSend.gain.value = 0
    verbSend.connect(verb)
    melBus.connect(verbSend)

    // 点延：附点八分，回授里垫一层低通，免得越滚越刺
    delayNode = c.createDelay(2)
    const fb = c.createGain()
    fb.gain.value = 0.3
    const damp = c.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    delaySend = c.createGain()
    delaySend.gain.value = 0
    delaySend.connect(delayNode)
    delayNode.connect(damp)
    damp.connect(fb)
    fb.connect(delayNode)
    delayNode.connect(bus)
    melBus.connect(delaySend)
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
    const bed = BEDS[name]
    const spb = 60 / bed.bpm
    if (verbSend) verbSend.gain.value = bed.verb
    if (delaySend) delaySend.gain.value = bed.delay
    if (delayNode) delayNode.delayTime.value = spb * 0.75   // 附点八分
    /*
      换了人就不接着上一段的小节走：进行从头起，听感上像是「换了张碟」。
      时刻也要一并从头起 —— 上一段往前排到哪儿了，那是**它**的小节长度算出来的，
      跟着走的话（bpm 46 的菜单曲一拍 5.2 秒）新的一段的头一小节会被整个跳过，
      淡出之后接上来是一片安静。只有回到同一段时才接着往后排。
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
