import { useCallback, useEffect, useRef, useState } from 'react'
import { SkipForward, SpeakerHigh } from '@phosphor-icons/react'

import { markPvSeen, notePvOk, pvSources } from '../lib/pv'
import css from './PvScreen.module.css'

/**
 * 开场影像那一层（2026-09-16）—— 全屏压在最上面，放完自己退场。
 *
 * 由 `App.tsx` 的 `Gate` 挂：**只在没认证过那一屏**（指纹开屏）之上，
 * 头一遍进终端自动弹一次；之后靠开屏右上角那枚播放键点开。
 *
 * 三处不好顺手的，写在这儿：
 *
 * ① **出声要一次手势。** 浏览器不许没有交互就放声音，冷启动那一下
 *    `play()` 十有八九被 `NotAllowedError` 拦下来。所以先试原声起播，
 *    被拦就退回**静音播**（画面照放，不能让它卡成一张黑底），
 *    然后挂一对 `pointerdown` / `keydown` —— 主人第一次点任何地方（包括
 *    按「跳过」）就把声音接回去。
 *
 * ② **退场要淡。** 放完直接拔掉会「啪」地跳回开屏。先盖一层 400ms 的淡出再交还。
 *
 * ③ **「跳过」算看过。** 主人说的是「第一次强制看」，跳过也是看过一遍；
 *    不然每次都弹，反而比不放更烦。片子**没放出来**（`onError`）则不算 ——
 *    那种情况下不写 `zts-pv-seen`，将来文件补上了还放得成。
 *
 * ④ **网络救不回来，就别把人锁在这一屏**（2026-09-16 加，主人报的「先是断断续续、
 *    再完全卡死不动」）。那支片子是 29 秒的 mp4，站点架在 Cloudflare Workers 上，
 *    从墙内过去是断断续续的 —— 片子放不完不是这一屏的错，但**卡在这儿出不去**是。
 *    所以两条看门狗：起播迟迟不来（`GIVE_UP_MS`）、放起来之后卡住不动（`STALL_MS`），
 *    到点就按「跳过」处理，把主人交还给开屏。看门狗只管**放不出来**这一种，
 *    放得出来就一次都不插手。
 *
 * ⑤ **取片两条路，按「谁一定取得到」排**（2026-09-17，主人报「电脑上视频卡」）。
 *    `pvSources()` 给的是 `[本站, CDN]` —— 本站就是**页面自己来的那条路**：
 *    页面打开过，它就一定取得到片子，所以排头；CDN 只在本站真的出错（`onError`）时才试。
 *    ⚠ **别改成「谁快谁在前」。** 那条国际线的快慢在抖（同一天量到过 274.7 KB/s，
 *    也量到过 0 B/s），本鱼拿一次采样排过一次，换个钟点就是反的 ——
 *    口径与教训写在 `lib/pv.ts` 的文件头。
 *    两条都试过还是放不出来，才算「这一趟没看成」（`notePvOk(false)`）。
 *
 * ⑥ **攒够了再起播，不逐帧顿**（2026-09-17，同上）。原先 buffered 一到就 `play()`，
 *    管子比码率慢的时候就是**一路顿着走**；现在等**闸门开了**才起播 ——
 *    闸门 = **实打实的缓冲领先**够 `GATE_S` 秒（`runway()` 量的那个数）。
 *    等闸门那几秒画面不黑着，底下那行字报进度（`xx%`）。
 *    `GATE_MAX_MS` 是闸门的死线：再怎么慢也不能让主人对着黑底干等，到点照放。
 *
 *    ⚠ **别拿 `readyState >= 4` 当闸门的另一半。** 头一版那么写的，本鱼拿涓流管子
 *    （70 KB/s）量出来**当场就露馅**：管子比码率快一丁点（573 kbps vs 498 kbps）时，
 *    浏览器**猜**「我放得完」猜得特别早 —— 起播于 1.14s、缓冲才 1.0 秒，
 *    之后连卡四次。`readyState 4` 是**估计**，不是**攒够**；闸门要的是后者。
 *
 *    三条时间线各管各的，别搅在一起（口径见下）：
 *    · **一个字节都没来过**（`DEAD_MS`）= 这一支源**是死的**，才换下一支；
 *    · **数据在来、只是慢**（`TIP_MS`）= 只摆「载入较慢」，**不换源**（换了也一样慢）；
 *    · **到点还没起播**（`GIVE_UP_MS`）= 这一趟放不出来，收场。
 */
const GATE_S = 6 /* 起播闸门：缓冲**实打实**领先够这么多秒才开画（片子更短就以片长为够） */
const GATE_MAX_MS = 12000 /* 闸门的死线：等这么久还没开就照放 —— 别让人对着黑底干等 */
const DEAD_MS = 10000 /* 一个字节都没来过 → 这一支源是死的，换下一支 */
const TIP_MS = 8000 /* 还在等闸门 → 摆出「载入较慢」（数据在来，不换源） */
const GIVE_UP_MS = 28000 /* 到点还没起播 → 当这一趟放不出来，收场 */
const STALL_MS = 9000 /* 已经在放了，卡住这么久没缓过来 → 收场 */

/** 缓冲领先多少秒（后半段没缓冲时是 0） */
function runway(v: HTMLVideoElement): number {
  const b = v.buffered
  return b.length ? b.end(b.length - 1) - v.currentTime : 0
}

/**
 * 闸门开没开：缓冲**实打实**领先够 `GATE_S` 秒（片子比 `GATE_S` 还短就以片长为够）。
 *
 * ⚠ 这儿**只认 `runway()`**，别把 `readyState >= 4` 加进来当「快路」——
 *    那是浏览器的**估计**，管子勉强够时会估得极早（量过：1.0 秒缓冲就报 4），
 *    闸门当场短路。见文件头 ⑥。
 */
function gateOpen(v: HTMLVideoElement): boolean {
  const d = v.duration
  const need = d && Number.isFinite(d) ? Math.min(GATE_S, d) : GATE_S
  return runway(v) >= need
}

/** 候选源：模块级取一次 —— 它只认 `PV_PIN` 与 `assetBase()`，跟这一屏的 state 无关 */
const SRC = pvSources()

export function PvScreen({ onClose }: { onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [started, setStarted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [slow, setSlow] = useState(false)
  /* 等闸门那几秒给主人一个读数（缓冲攒到哪儿了）。只在**整数百分比变了**才 setState ——
     进度事件一秒能来几十下，每下都重渲染就是自己给自己添堵 */
  const [pct, setPct] = useState(0)
  const pctRef = useRef(0)
  /* 这一趟用的是第几支源（`SRC` 的下标）。换它 = 换 `<video>` 的 `src`，重来一遍 */
  const [srcIdx, setSrcIdx] = useState(0)
  /* 看门狗活在 effect 里，读的是**当下**的起播状态 —— state 在闭包里会一直是初值 */
  const startedRef = useRef(false)
  const closing = useRef(false)
  /* 下标也留一份 ref：`onError` 与看门狗都要在**不等重渲染**的前提下判「还有没有下一支」 */
  const idxRef = useRef(0)

  /** 收场：`seen` 决定要不要记「看过」，`fade` 是淡出时长（放不出来时不给淡） */
  const close = (seen: boolean, fade = 400) => {
    if (closing.current) return
    closing.current = true
    if (seen) markPvSeen()
    if (fade > 0) setLeaving(true)
    window.setTimeout(onClose, fade)
  }

  /** 换下一支源（还有才换）。叫它的一共两处：`onError`，以及起播超时那条看门狗 */
  const advance = useCallback(() => {
    if (idxRef.current + 1 >= SRC.length) return false
    idxRef.current += 1
    setSrcIdx(idxRef.current)
    return true
  }, [])

  /* 起播 + 一次手势解锁声音 */
  useEffect(() => {
    const v = vid.current
    if (!v) return
    let alive = true
    /* 这一支源有没有来过数据 —— 换源判的是**这个**，不是「等了多久」。
       它是 effect 的局部量：换源会改 `srcIdx`，effect 收摊重来，它跟着清零。 */
    let gotData = false
    /* 起播只放一枪（闸门那条路与死线那条路都会来叫 `start()`） */
    let fired = false

    const kick = async () => {
      v.muted = false
      try {
        await v.play()
        if (alive) setMuted(false)
      } catch {
        /* 原声被拦 —— 退回静音，画面先走起来 */
        v.muted = true
        try {
          await v.play()
          if (alive) setMuted(true)
        } catch {
          /* 连静音都不让放：当这一层没来过，立刻交还开屏 */
          if (alive) close(false, 0)
        }
      }
    }

    /** 开闸起播。攒够与死线都走它，只放一枪 */
    const start = () => {
      if (!alive || fired) return
      fired = true
      if (alive) setSlow(false)
      void kick()
    }

    /** 数据每来一点：记「来过数据」、报进度、够格就开闸 */
    const onProgress = () => {
      if (!alive) return
      if (v.buffered.length) gotData = true
      const d = v.duration
      if (d && Number.isFinite(d)) {
        const p = Math.min(99, Math.round((runway(v) / d) * 100))
        if (p !== pctRef.current) {
          pctRef.current = p
          setPct(p)
        }
      }
      if (gateOpen(v)) start()
    }
    v.addEventListener('progress', onProgress)
    /* 一次性事件：`readyState` 跳 4 的那一下不保证再补一个 `progress` */
    v.addEventListener('canplaythrough', onProgress)
    onProgress() /* 装上先看一眼 —— 整支可能已经躺在缓存里了 */

    /* ---- 看门狗：网络慢到放不出来时，别把主人锁在这一屏 ----
       三条时间线各管各的（口径见文件头 ⑥）：**没来过数据**才换源；**数据在来、
       只是慢**只摆「较慢」；**到点还没起播**才收场。收场走 `close(true)`：
       主人这一趟没看成，但也不该被罚每刷一次页面就再等一趟 ——
       想重看，开屏右上角那枚播放键一直在。 */
    let giveUp = window.setTimeout(() => {
      if (alive && !startedRef.current) close(true)
    }, GIVE_UP_MS)
    let tipSlow = window.setTimeout(() => {
      if (alive && !fired) setSlow(true)
    }, TIP_MS)
    /* 一个字节都没来过 = 这一支源**是死的**（不是慢）→ 换下一支；
       换源会改 `srcIdx`，这一趟 effect 收摊重来，计时跟着重排。 */
    let deadSrc = window.setTimeout(() => {
      if (alive && !gotData && !advance()) setSlow(true)
    }, DEAD_MS)
    /* 闸门的死线：再怎么慢也不能让主人对着黑底干等，到点照放 */
    let gateMax = window.setTimeout(start, GATE_MAX_MS)

    let stall = 0
    const onWaiting = () => {
      if (stall || !startedRef.current) return
      stall = window.setTimeout(() => {
        if (alive) close(true)
      }, STALL_MS)
    }
    const onPlaying = () => {
      startedRef.current = true
      if (stall) {
        window.clearTimeout(stall)
        stall = 0
      }
    }
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onPlaying)

    const unlock = () => {
      if (!v.muted) return
      v.muted = false
      v.play()
        .then(() => {
          if (alive) setMuted(false)
        })
        .catch(() => {
          v.muted = true /* 这一下还是不让出声：把静音键按回去，别装作开了 */
        })
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      alive = false
      window.clearTimeout(giveUp)
      window.clearTimeout(tipSlow)
      window.clearTimeout(deadSrc)
      window.clearTimeout(gateMax)
      if (stall) window.clearTimeout(stall)
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('canplaythrough', onProgress)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('playing', onPlaying)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcIdx, advance])

  return (
    <div
      className={`${css.pv} ${leaving ? css.isLeaving : ''}`}
      data-pv="1"
      data-pv-slow={slow ? '1' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="开场影像"
    >
      <video
        ref={vid}
        className={css.vid}
        src={SRC[srcIdx]}
        playsInline
        preload="auto"
        onPlaying={() => {
          startedRef.current = true
          setSlow(false)
          setStarted(true)
          notePvOk(true)
        }}
        onEnded={() => close(true)}
        onError={() => {
          /* 这一支当场拉不动（CDN 不可达 / 文件缺了）：还有备选就换过去再来，
             换到最后一支还是不行，才算「这一趟放不出来」—— 那种情况不记「看过」。 */
          if (advance()) return
          notePvOk(false)
          close(false, 0)
        }}
      />

      {/* 载入那一下垫一句话，别让黑底先愣着。
          攒够之前报个进度 —— 有读数就说明它在动，不是死了；
          迟迟不来的时候改口径，别让主人对着「正在载入」干等，把跳过说明白。 */}
      {started ? null : (
        <div className={css.loading} data-pv-wait={slow ? 'slow' : 'ok'}>
          {slow ? '影像载入较慢 · 可直接跳过' : `开场影像 · 正在载入${pct > 0 ? ` ${pct}%` : ''}`}
        </div>
      )}

      <button
        className={`${css.skip} ${slow ? css.skipHot : ''}`}
        data-pv-skip
        onClick={() => close(true)}
        aria-label="跳过开场影像"
      >
        跳过 <SkipForward size={12} weight="fill" />
      </button>

      {muted && started ? (
        <div className={css.sound} data-pv-sound>
          <SpeakerHigh size={13} weight="bold" /> 点击任意处开启声音
        </div>
      ) : null}
    </div>
  )
}
