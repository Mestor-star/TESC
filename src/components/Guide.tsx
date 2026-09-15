/**
 * components/Guide.tsx — 梅芙的引导气泡。
 *
 * 方形头像 + 对话气泡，锚在界面上某个元素旁边，底下一层把其余部分压暗。
 * 讲的是操作，不是剧情：一句一步，「下一步」走完，「跳过教程」直接闭嘴。
 * 文案与出场顺序全在 lib/guide.ts，这里只管怎么摆。
 *
 * **必须 portal 到 document.body**（和存读档 / 变量面板 / 作战屏同一个写法）：
 * App 根挂着开屏动画 `.bootPop`，它的 `animation-fill-mode: both` 让 100% 帧里的
 * `transform` / `filter` 在动画结束后继续生效 —— 而那两样只要不是 `none`，
 * 就会把 App 根变成**层叠上下文**。气泡的 `z-index: 900` 是 App 根的后代，
 * 只能在这个上下文内部比大小；作战屏是 portal 到 body、`z-index: 90` 的兄弟节点，
 * 在 body 那一层稳稳压住整个 App 根。于是「讲这一场怎么打」的 boss 讲解
 * 一进作战屏就被整块盖住 —— 讲了，但一个字也看不见。
 * 换到 body 这一层之后 900 与 90 才真的同场竞技。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { guideVoiceOf, markDone, nextTour, skipTutorial } from '../lib/guide'
import type { GuideLine, GuideTour } from '../lib/guide'
import { useTerminal } from '../terminal/Terminal'
import { Portrait } from './Portrait'
import { inkOf } from '../lib/hue'

import css from './Guide.module.css'

/** 气泡宽度：首次渲染（还没量到）时按它占位，量到之后以实测为准 */
const W = 332
/** 同上，首次渲染用的高度估数。真实高度由 ref 量 —— 词条多的那一步会长出一大截，
 *  按估数夹位置会把「下一步」顶出屏幕，点不着。 */
const H = 210
/** 气泡四周至少留的边距（与 CSS 里的 max-height 用同一个数） */
const PAD = 12

interface Spot {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 这一步的正文**按说话人分成两组**：光字符串归梅芙，署了名的各自成一组（保序）。
 *
 * 「别人插话」在数据里就是那一条署了名的（`GuideSay`），但**摆法上不跟梅芙挤一张气泡** ——
 * 插话那位有自己的一张：自己的脸、自己的尖角、自己的名字（颜色照 castmeta 的主题色），
 * 横着并到梅芙旁边（主人 2026-09-15：「并排在旁边」，像两个人对着说话）。
 * 数据里每一步至多一位插话者，并排那一路摆不下第三张 —— mech 有一条断言钉着。
 */
function splitLines(lines: GuideLine[], say: (s: string) => string) {
  const meave: string[] = []
  const guests: { by: string; text: string[] }[] = []
  for (const l of lines) {
    if (typeof l === 'string') { meave.push(say(l)); continue }
    const last = guests[guests.length - 1]
    if (last && last.by === l.by) last.text.push(say(l.text))
    else guests.push({ by: l.by, text: [say(l.text)] })
  }
  return { meave, guests }
}

function sameSpot(a: Spot | null, b: Spot | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.left - b.left) < 1.5 && Math.abs(a.top - b.top) < 1.5
    && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5
}

export function Guide() {
  const { view, epDone, operatorName } = useTerminal()
  const [tour, setTour] = useState<GuideTour | null>(null)
  const [i, setI] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)
  /** 作战屏、boss、约会专线、军需处都长在文档里，不在 React 树上 —— 从 DOM 上读回来 */
  const [field, setField] = useState({ inBattle: false, bossUp: false, dateUp: false, shopUp: false })
  const startedIn = useRef(view)

  /* ---- 哪几块界面开着：气泡要等条件够了才出来讲那一段 ---- */
  useEffect(() => {
    const tick = () => {
      const inBattle = !!document.querySelector('[data-battle]')
      const bossUp = inBattle && !!document.querySelector('[data-chant]')
      // 约会专线：这一路的面板挂上来了（`Plot.tsx` 只在 lane === 'date' 且有一场在的时候挂它）
      const dateUp = !!document.querySelector('[data-date-lane-area]')
      // 军需处：柜台展开的那一层（`Missions.tsx` 点开「打开军需处」才挂它）
      const shopUp = !!document.querySelector('[data-shop-modal]')
      setField((f) => (f.inBattle === inBattle && f.bossUp === bossUp && f.dateUp === dateUp
        && f.shopUp === shopUp ? f : { inBattle, bossUp, dateUp, shopUp }))
    }
    tick()
    const id = window.setInterval(tick, 800)
    return () => window.clearInterval(id)
  }, [])

  /* ---- 该讲哪一段 ---- */
  useEffect(() => {
    if (tour) return
    const t = nextTour(view, epDone, field)
    if (t) {
      startedIn.current = view
      setTour(t)
      setI(0)
    }
  }, [tour, view, epDone, field])

  /* ---- 换模块了就撤：当前这一段是讲给上一屏的，讲完再回来 ---- */
  useEffect(() => {
    if (tour?.view && view !== startedIn.current) setTour(null)
  }, [view, tour])

  /* ---- 绑界面的那几段：那一屏收走了就撤 ----
     它们没有 view，上面那条 `tour?.view` 的守卫对它们整个短路；
     玩家打到一半撤退、或者把约会那一路切回主线，气泡会赖在终端菜单上不走。 */
  useEffect(() => {
    if (tour?.field === 'battle' && !field.inBattle) setTour(null)
    if (tour?.field === 'date' && !field.dateUp) setTour(null)
    if (tour?.field === 'shop' && !field.shopUp) setTour(null)
  }, [tour, field.inBattle, field.dateUp, field.shopUp])

  const step = tour && i < tour.steps.length ? tour.steps[i] : undefined

  /* ---- 量气泡自身：这一步有几条字、折几行，都得量出来才算得准位置 ---- */
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: W, h: H })
  /* 布局期就量：换到一条长的，第一帧就得按新高度夹好位置，
     不然会先按上一条的高度摆一次、再跳回来 */
  useLayoutEffect(() => {
    const measure = () => {
      const el = bubbleRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const next = { w: r.width || W, h: r.height || H }
      setSize((s) => (Math.abs(s.w - next.w) < 1 && Math.abs(s.h - next.h) < 1 ? s : next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, tour])

  /* ---- 跟着锚点走：窗口大小 / 内部滚动 / 布局变动都要重新量 ---- */
  useEffect(() => {
    if (!step?.at) { setSpot(null); return }
    const measure = () => {
      const el = document.querySelector(step.at as string)
      if (!el) { setSpot(null); return }
      const r = el.getBoundingClientRect()
      const next: Spot = { left: r.left, top: r.top, width: r.width, height: r.height }
      setSpot((s) => (sameSpot(s, next) ? s : next))
    }
    measure()
    const id = window.setInterval(measure, 400)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  const box = useMemo(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    /* 夹位置一律按**实测**尺寸来：气泡是 translate(-50%,-50%) 居中的，
       所以上下左右各留半个身位，按钮才不会被顶出屏幕 */
    const hw = size.w / 2
    const hh = size.h / 2
    if (!spot) {
      return { left: vw / 2, top: vh / 2, transform: 'translate(-50%, -50%)' }
    }
    const side = step?.side ?? 'bottom'
    /* 「挪到锚点旁边」＝挪出**整个**身位，不是挪半个。
       气泡是 `translate(-50%,-50%)` 居中的，`left/top` 是**中心**；从前这里写的是
       `spot.right + 16`，于是中心压在锚点边线上 —— 气泡有一半盖在锚点上。
       `.bubble` 是 `pointer-events: auto`，盖住谁谁就点不着：开屏那一步锚的正是左栏，
       十一个模块的中间六个当场按不动（主人 2026-09-14：「很多模块都点不开」）。
       所以右/左、上/下各自要把半个身位加回来。 */
    if (side === 'right' || side === 'left') {
      const left = side === 'right'
        ? spot.left + spot.width + 16 + hw
        : spot.left - 16 - hw
      return {
        left: clamp(left, hw + PAD, vw - hw - PAD),
        top: clamp(spot.top + spot.height / 2, hh + PAD, vh - hh - PAD),
        transform: 'translate(-50%, -50%)',
      }
    }
    const top = side === 'top'
      ? spot.top - 16 - hh
      : spot.top + spot.height + 16 + hh
    return {
      left: clamp(spot.left + spot.width / 2, hw + PAD, vw - hw - PAD),
      top: clamp(top, hh + PAD, vh - hh - PAD),
      transform: 'translate(-50%, -50%)',
    }
  }, [spot, step, size])

  if (!tour || !step) return null

  /* 文案里的 `{op}` 换成操作员自己填的名字。
     梅芙叫的是那个人的名字（原著里是「言万同学」），而名字是玩家在开屏自己填的 ——
     写死在文案里的话，改了名的人就会听见她在叫别人。 */
  const say = (l: string) => l.replace(/\{op\}/g, operatorName)

  /* 正文按说话人分好组：梅芙一组，插话那位（若有）自己一组 */
  const { meave, guests } = splitLines(step.lines, say)

  const last = i >= tour.steps.length - 1
  /* 「跳过教程」只给教程那几条 —— 绑在界面上、又不算教程的（boss 讲解）不给：
     打到那一场的时候，跳过等于让人摸黑挨打。作战基础那一段算教程，
     它与模块介绍在同一条线上（见 GuideTour.tutorial）。 */
  const tutorialPart = tour.id === 'boot' || !!tour.view || tour.tutorial === true

  const finish = () => {
    markDone(tour.id)
    setTour(null)
    setI(0)
  }

  return createPortal(
    <div className={css.layer} data-guide-layer={tour.id} data-guide-step={i}>
      {spot ? (
        <div
          className={css.dim}
          style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }}
        />
      ) : (
        <div className={css.scrim} />
      )}

      {/* 一排：梅芙那张在前，插话那位并排在后。
          定位与入场动画挂在**这一排**上（`box` 算的也是这一排的中心），
          里头每一张各自是一整张气泡。`data-guide-bubble` 只挂在梅芙这一张上 ——
          冒烟那几条几何断言量的就是她这张与锚点的关系。 */}
      <div className={css.row} style={box} ref={bubbleRef} data-guide-row>
        <div className={css.bubble} data-guide-bubble>
          <span className={css.faceWrap} data-guide-face>
            <Portrait avatarId="mefisa" size={52} className={css.face} />
          </span>
          <div className={css.tail} aria-hidden />
          <div className={css.body}>
            <div className={css.who}>
              <b>梅芙莉莎 · 简别科娃</b>
              <span className="tiny muted">恋兔队 · 战术副官</span>
            </div>
            <div className={css.title}>{step.title}</div>
            <ul className={css.lines}>
              {meave.map((l, n) => <li key={n}>{l}</li>)}
            </ul>
            <div className={css.foot}>
              <span className={`${css.pager} mono`}>{i + 1} / {tour.steps.length}</span>
              {tutorialPart ? (
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: 12 }}
                  data-guide-skip
                  onClick={() => { skipTutorial(); setTour(null); setI(0) }}
                >
                  跳过教程
                </button>
              ) : null}
              <button className="btn btn--amber" style={{ fontSize: 12 }} data-guide-next onClick={() => (last ? finish() : setI(i + 1))}>
                {last ? '知道了' : '下一步'}
              </button>
            </div>
          </div>
        </div>

        {guests.map((g) => {
          /* 查不到这个人（castmeta 里没登记、也不在 GUIDE_GUESTS 里）就只剩正文：
             宁可不署名，也不把 id 摆到脸上 —— 见 guide.guideVoiceOf 上那一段 */
          const v = guideVoiceOf(g.by)
          return (
            <div key={g.by} className={css.bubble} data-guide-say={g.by}>
              {v ? (
                <span className={css.faceWrap} data-guide-guest-face>
                  <Portrait
                    avatarId={v.avatarId} name={v.name} hue={v.hue} sigil={v.sigil}
                    size={52} className={css.face}
                  />
                </span>
              ) : null}
              {v ? <div className={css.tail} aria-hidden /> : null}
              <div className={css.body}>
                {v ? (
                  <div className={css.who}>
                    <b style={{ color: inkOf(v.hue) }}>{v.name}</b>
                  </div>
                ) : null}
                <ul className={css.lines}>
                  {g.text.map((t, n) => <li key={n}>{t}</li>)}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
