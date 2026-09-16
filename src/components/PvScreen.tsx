import { useEffect, useRef, useState } from 'react'
import { SkipForward, SpeakerHigh } from '@phosphor-icons/react'

import { markPvSeen, notePvOk, pvUrl } from '../lib/pv'
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
 */
export function PvScreen({ onClose }: { onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [started, setStarted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const closing = useRef(false)

  /** 收场：`seen` 决定要不要记「看过」，`fade` 是淡出时长（放不出来时不给淡） */
  const close = (seen: boolean, fade = 400) => {
    if (closing.current) return
    closing.current = true
    if (seen) markPvSeen()
    if (fade > 0) setLeaving(true)
    window.setTimeout(onClose, fade)
  }

  /* 起播 + 一次手势解锁声音 */
  useEffect(() => {
    const v = vid.current
    if (!v) return
    let alive = true

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
    void kick()

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
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`${css.pv} ${leaving ? css.isLeaving : ''}`}
      data-pv="1"
      role="dialog"
      aria-modal="true"
      aria-label="开场影像"
    >
      <video
        ref={vid}
        className={css.vid}
        src={pvUrl()}
        playsInline
        preload="auto"
        onPlaying={() => {
          setStarted(true)
          notePvOk(true)
        }}
        onEnded={() => close(true)}
        onError={() => {
          notePvOk(false)
          close(false, 0)
        }}
      />

      {/* 载入那一下垫一句话，别让黑底先愣着 */}
      {started ? null : <div className={css.loading}>开场影像 · 正在载入</div>}

      <button
        className={css.skip}
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
