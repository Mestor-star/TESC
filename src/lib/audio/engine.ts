/* ============================================================
   音频引擎 —— 一台终端该有的动静，全部现场合成，不带音频素材
   ------------------------------------------------------------
   为什么是合成而不是放 mp3：这个项目的素材目录是空的（立绘也全是
   占位回退），再挂一堆二进制进去只会让仓库变重。用 Web Audio 现场
   合成，改一段旋律就是改几行数字，也省掉加载与解码。

   三条总线：master → 目的地，music / sfx 挂在其下。
   浏览器不许没有用户手势就出声，所以 Context 是**懒建**的：
   第一次真的有人按了什么（unlockAudio），才把上下文拉起来。

   整块音频都是**可选的**：没有 AudioContext、被策略挡下、播放抛错 ——
   一律静默降级，绝不把界面拖下水。
   ============================================================ */

export interface AudioSettings {
  /** 总音量 0–1 */
  master: number
  /** 背景音 0–1 */
  music: number
  /** 音效 0–1 */
  sfx: number
  /** 一键静音（保留上面三个值，不丢用户调好的份） */
  muted: boolean
  /**
   * 底噪（背景音那几段会自己走的垫乐）要不要响。
   * **默认为 false**：终端进来是安静的，用户自己在设置里把它打开才起 ——
   * 没点过任何音频设置的人，第一次随手点一下按钮就被一段氛围音乐糊上来，
   * 那不叫「有氛围」，那叫擅自出声。
   */
  beds: boolean
}

export const AUDIO_DEFAULTS: AudioSettings = {
  master: 0.7,
  music: 0.34,
  sfx: 0.5,
  muted: false,
  beds: false,
}

const KEY = 'zts-audio:v1'

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.max(0, Math.min(1, n))
}

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...AUDIO_DEFAULTS }
    const p = JSON.parse(raw) as Partial<AudioSettings>
    return {
      master: clamp01(p.master, AUDIO_DEFAULTS.master),
      music: clamp01(p.music, AUDIO_DEFAULTS.music),
      sfx: clamp01(p.sfx, AUDIO_DEFAULTS.sfx),
      muted: p.muted === true,
      // 老档里没有这一项 —— 缺省按「关」算：宁可安静，也不要一进来就替人决定
      beds: p.beds === true,
    }
  } catch {
    return { ...AUDIO_DEFAULTS }
  }
}

let settings: AudioSettings = load()
const subs = new Set<(s: AudioSettings) => void>()

export function audioSettings(): AudioSettings {
  return settings
}

/** 订阅设置变化（滑块用）；返回退订函数 */
export function onAudio(fn: (s: AudioSettings) => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

export function setAudio(patch: Partial<AudioSettings>): AudioSettings {
  settings = { ...settings, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* 隐私模式：这一次作数就行 */ }
  apply()
  for (const fn of subs) fn(settings)
  return settings
}

/* ------------------------------------------------------------------
   上下文与总线
   ------------------------------------------------------------------ */

let ctx: AudioContext | null = null
let masterBus: GainNode | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
/** 这台机器就是出不了声 —— 试过一次就别再试了 */
let dead = false
let volume = 0
let volumeTold = ''

/** 已建立上下文（能出声）吗 */
export function audioOn(): boolean {
  return !!ctx && !dead
}

/** 底噪开了吗 —— 没开就一段都别起（见 AudioSettings.beds） */
export function bedsOn(): boolean {
  return settings.beds
}

/** 上下文（未建立时为 null） */
export function ac(): AudioContext | null {
  return ctx
}

/** 背景音 / 音效总线的输入口：合成器接到这里，音量由上面三个值统一管 */
export function musicOut(): GainNode | null {
  return musicBus
}

export function sfxOut(): GainNode | null {
  return sfxBus
}

export function now(): number {
  return ctx ? ctx.currentTime : 0
}

/** 把设置推给总线 —— 静音时总音量归零，但三个滑块的值原样留着 */
function apply(): void {
  if (!ctx || !masterBus || !musicBus || !sfxBus) return
  const t = ctx.currentTime
  const ramp = (g: GainNode, v: number) => {
    const target = Math.max(0.0001, v)
    try { g.gain.setTargetAtTime(target, t, 0.08) } catch { g.gain.value = target }
  }
  const g = settings.muted ? 0 : settings.master
  ramp(masterBus, g)
  ramp(musicBus, settings.music)
  ramp(sfxBus, settings.sfx)
  volume = g
}

/** 让音量跟着系统/标签页走：切到后台就把总音量压下去，回来再抬起来 */
export function followVisibility(): () => void {
  const on = () => {
    if (!ctx || !masterBus) return
    const g = document.hidden ? 0.0001 : (settings.muted ? 0.0001 : Math.max(0.0001, settings.master))
    try { masterBus.gain.setTargetAtTime(g, ctx.currentTime, 0.2) } catch { masterBus.gain.value = g }
  }
  document.addEventListener('visibilitychange', on)
  return () => document.removeEventListener('visibilitychange', on)
}

/**
 * 建上下文 / 唤醒它。必须在用户手势里调用（浏览器策略）。
 * @returns 能不能出声
 */
export function unlockAudio(): boolean {
  if (dead) return false
  if (ctx) {
    if (ctx.state === 'suspended') { try { void ctx.resume() } catch { /* 唤不醒就算了 */ } }
    if (volumeTold !== 'ok') { volumeTold = 'ok'; apply() }
    return true
  }
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const AC = W.AudioContext ?? W.webkitAudioContext
    if (!AC) { dead = true; return false }
    ctx = new AC()
    masterBus = ctx.createGain()
    musicBus = ctx.createGain()
    sfxBus = ctx.createGain()
    musicBus.connect(masterBus)
    sfxBus.connect(masterBus)
    masterBus.connect(ctx.destination)
    apply()
    volumeTold = 'ok'
    return true
  } catch {
    dead = true
    ctx = null
    return false
  }
}

/** 当前总音量（给界面上的电平指示用） */
export function masterLevel(): number {
  return volume
}
