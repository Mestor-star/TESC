/* ============================================================
   音频 —— 对外只开这一个口
   ------------------------------------------------------------
   界面里只该出现三件事：
     · useAudioSettings()  —— 读三个滑块的值
     · sfx('hit')          —— 放一声
     · setBed('battle')    —— 换一段底
   其余的调度、合成、淡入淡出都在下面几层，外面不必知道。
   ============================================================ */

import { useSyncExternalStore } from 'react'

import { audioOn, audioSettings, bedsOn, followVisibility, onAudio, setAudio, suspendAudio, unlockAudio } from './engine'
import { currentBed, resumeBed, setBed, stopBed, wakeBed } from './music'
import { sfx } from './sfx'
import type { SfxName } from './sfx'
import type { AudioSettings } from './engine'
import type { BedName } from './music'

export { AUDIO_DEFAULTS, audioOn, audioSettings, bedsOn, masterLevel, setAudio, unlockAudio } from './engine'
export type { AudioSettings } from './engine'
export { sfx } from './sfx'
export type { SfxName } from './sfx'
export { currentBed, setBed, stopBed } from './music'
export type { BedName } from './music'

/** 三个滑块绑这个：任何一处改了，别处跟着动 */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(
    (cb) => onAudio(() => cb()),
    audioSettings,
    audioSettings,
  )
}

/** 每个模块配的底（导出是为复核读它 —— 见 scripts/mech 第 16 节：
    有没有哪一段床是写好了却没人放的，或者哪一处指向一段不存在的床） */
export const VIEW_BED: Record<string, BedName> = {
  dashboard: 'terminal',
  plot: 'plot',
  saga: 'plot',
  lore: 'terminal',
  arms: 'terminal',
  archive: 'terminal',
  missions: 'terminal',
  codex: 'terminal',
  tavern: 'tavern',
  settings: 'terminal',
}

/** 上一次待着的模块 —— 作战屏盖上来之后，退出时得知道该回到哪一段底 */
let lastView = 'dashboard'

export function bedForView(view: string): BedName {
  lastView = view
  return VIEW_BED[view] ?? 'terminal'
}

/**
 * 「眼下这个状态该放哪一段底」—— null 就是**一段都不放**（收声）。
 *
 * 之所以要把它收成一处：背景音同时有三层想决定它 —— 模块（按 view 换）、
 * 标题菜单与设置专用界面（压在 menu 上）、以及指纹认证开屏。
 * 前两层以前各写各的 `if`，而**开屏那一层没人写**：用户点「退出终端」回到开屏之后，
 * 上一段 menu 照旧一直放着 —— 界面已经关了、声音还在，只能去关浏览器声音。
 * 现在「该放什么」只在这里判一次，界面按它的返回值决定 setBed 还是 stopBed。
 */
export function bedForState(s: { authed: boolean; stage: string; setupMode: boolean; view: string }): BedName | null {
  if (!s.authed) return null                                // 终端已退出（指纹认证开屏）：收声
  if (s.stage !== 'game' || s.setupMode) return 'menu'      // 标题菜单 / 设置专用界面
  return bedForView(s.view)                                 // 终端本体：按模块
}

/** 当前是不是正压在作战屏上（作战屏盖在终端上面，底也要跟着换） */
let inBattle = false

/**
 * 作战屏开合。
 * @param on   true = 进战斗，false = 退出（回到上一个模块的底）
 * @param boss 场上有没有 boss —— 有就压重一层
 */
export function battleBed(on: boolean, boss = false): void {
  inBattle = on
  setBed(on ? (boss ? 'boss' : 'battle') : bedForView(lastView))
}

export function isInBattleBed(): boolean {
  return inBattle
}

/* ------------------------------------------------------------------
   全局接线：一次就够
   ------------------------------------------------------------------ */

let installed = false

/**
 * 装上全局音频：首次手势解锁、按钮点击的统一音效、切后台自动压低。
 * @returns 拆除函数
 */
export function installAudio(): () => void {
  if (installed) return () => { /* 已经装过了 */ }
  installed = true

  const wake = () => {
    // 只把上下文拉起来。底噪要不要跟着起，由 bedsOn 说了算 ——
    // 以前这里无条件 resumeBed()，于是「随手点一下按钮」就换来一段氛围音乐。
    if (unlockAudio() && bedsOn()) resumeBed()
    window.removeEventListener('pointerdown', wake, true)
    window.removeEventListener('keydown', wake, true)
  }
  window.addEventListener('pointerdown', wake, true)
  window.addEventListener('keydown', wake, true)

  /*
    按钮音效：只给「有后果的操作」出声。
    以前是「任何 <button> 一律继电器一下」，于是翻个页、切个页签、关个浮层、
    点一下引导的「下一步」全都咔一声 —— 声音多到听不出哪一下是自己在做事。
    现在改成**报名字**：按钮自己带 _SFX_BTN 里那一串属性之一，才有响。
    想让某个按钮出声，在它身上挂个属性即可；没挂的默认安静。
  */
  const SFX_BTN: Array<[string, SfxName]> = [
    ['data-shop-open', 'open'],
    ['data-shop-tab', 'open'],
    ['data-launch', 'open'],
    ['data-sortie', 'open'],
    ['data-buy', 'loot'],
    ['data-guide-next', 'key'],
    ['data-sfx', 'tick'],      // 通用：挂 data-sfx="tick|open|..."
  ]
  const onClick = (e: MouseEvent) => {
    if (!audioOn()) return
    const el = e.target as Element | null
    const btn = el?.closest?.('button')
    if (!btn) return
    // 作战指令是这套界面里最需要「按到了」的反馈，整排 data-cmd 都出声
    const cmd = btn.getAttribute('data-cmd')
    if (cmd) {
      if ((btn as HTMLButtonElement).disabled) { sfx('deny'); return }
      sfx(cmd === 'flee' ? 'back' : 'tick')
      return
    }
    const hit = SFX_BTN.find(([attr]) => btn.hasAttribute(attr))
    if (!hit) return
    if ((btn as HTMLButtonElement).disabled) { sfx('deny'); return }
    // data-sfx 可以自带音名（data-sfx="open" 一类），其余按属性表的默认
    const named = btn.getAttribute('data-sfx') as SfxName | null
    sfx(hit[0] === 'data-sfx' && named ? named : hit[1])
  }
  document.addEventListener('click', onClick, true)

  /*
    打字音没了。
    以前每敲一个字符（与每一个退格）都响一声 —— 在剧情页写一段话、
    在设置里填 API KEY，都是几十声连打。那不是「有反馈」，那是噪音。
  */

  const offVis = followVisibility()

  /*
    页面要走了（关标签页 / 关窗口 / 离开本页）就得收声。
    只靠 React 的卸载是不保险的：关标签页并不会跑一遍组件卸载，
    而浏览器「关窗后继续运行后台应用」一类的设置还会把这个文档留着 ——
    于是调度器照旧往后排音符，人已经看不到界面了，音乐却还在响。
    freeze 是页面生命周期里的「被冻结」，同样按「走了」处理。
    回来（pageshow，含从往返缓存恢复）再把刚才那一段补上。
  */
  let lastBed: BedName | null = null
  const leave = () => {
    lastBed = currentBed()
    stopBed()
    suspendAudio()
  }
  const back = () => {
    if (!lastBed) return
    const want = lastBed
    lastBed = null
    if (unlockAudio() && bedsOn()) setBed(want)
  }
  window.addEventListener('pagehide', leave)
  window.addEventListener('beforeunload', leave)
  window.addEventListener('freeze', leave)
  window.addEventListener('pageshow', back)

  return () => {
    window.removeEventListener('pointerdown', wake, true)
    window.removeEventListener('keydown', wake, true)
    document.removeEventListener('click', onClick, true)
    window.removeEventListener('pagehide', leave)
    window.removeEventListener('beforeunload', leave)
    window.removeEventListener('freeze', leave)
    window.removeEventListener('pageshow', back)
    offVis()
    stopBed()
    installed = false
  }
}

/**
 * 底噪开关。设置页那枚开关走这里 ——
 * 打开时要做的比 setAudio 多一步：把「本来该放的那一段」补上（此前一直被 bedsOn 挡着）。
 */
export function setBeds(on: boolean): void {
  setAudio({ beds: on })
  if (on) {
    if (unlockAudio()) wakeBed()
  } else {
    stopBed()
  }
}

