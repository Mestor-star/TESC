/* ============================================================
   约会剧演（components/Galgame.tsx）
   ------------------------------------------------------------
   主人要的是「约会时用 galgame 那样的界面玩」：**左边站着当前约会的人**，
   同行的人**向右边推**开、越远越小越淡；底下一只通栏文本框，字一个一个出来，
   Z / Enter / 空格 / 点一下就往前走。

   这个组件**只管摆**（纯展示、props 驱动，不读也不写任何存储）：
     · 账（会话流）、这一场是谁、还带了谁、有没有 CG、接续选项 —— 全由
       components/DateLane.tsx 喂进来；
     · 它自己只拿「文本切成行」这一件事的中间态（打字进度、当前第几行、
       回想开没开、选项停在第几条）。
   为什么切行归它：一行一拍是 galgame 的节拍单位，切法（名字 + 冒号认人、
   其余算旁白）与上屏方式是一件事，两处各切一次必然对不上。

   排版上的几处取舍：
     · **立绘贴左、底部对齐、略出血（left: -2%）** —— 「说话的人站在左前方」，
       舞台左缘就是她的位置；出血是为了不像一张裱起来的图。
     · **同行者按 party 顺序自左向右、一档一档矮下去** —— 高度 63% / 51% / 41%，
       透明度 0.9 / 0.8 / 0.7、z-index 依次靠后，形成一条向右的纵深。
       人数到 4（这一刻还够不着，PARTY_MAX 是 3）就在最右挂一枚「+N」小牌。
     · **谁在说话谁亮**（who 认得出的那一位），别人压到 0.55；
       认不出是谁（旁白 / 操作员自己那句）就**整排亮回中性** —— 不猜。
     · **CG 铺成背景**，立绘压在它上面；底下一层自下而上、走 --bg-1 的
       透明渐变，文本框再压一层半透明底 —— 两件叠起来，字才压得住图。

   无障碍：整块 role="group" aria-label="约会剧演"；文本框那一格是
   aria-live="polite"，但递出去的是**整句**（逐字那一半 aria-hidden）——
   读屏不该把打字过程一句一句念一遍。全部交互都能纯键盘走完。
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { ChatMsg } from '../data/types'
import { probeCg } from '../lib/cg'

import { Portrait } from './Portrait'

import css from './Galgame.module.css'

/** 舞台上的一位（当前约会角色 / 同行者） */
export interface GalPerson {
  id: string
  name: string
  hue: string
  sigil: string
}

/** 切成「一拍」的一行：谁说的、说的是什么、属于账上哪一条 */
interface GalLine {
  key: string
  /** 账上那一条的 id —— 编辑入口要它 */
  msgId: string
  /** 说话人的 charId；认不出 = null（旁白 / 操作员自己） */
  who: string | null
  text: string
  kind: 'narration' | 'say' | 'you'
}

export interface GalgameProps {
  /** 当前约会角色（站在左边那一位） */
  cast: GalPerson
  /** 同行者，按 party 顺序（自左向右推开） */
  party: GalPerson[]
  /** 这一场至今的正文（只读镜像；不用它写任何东西） */
  log: ChatMsg[]
  /** 这一场此刻的 CG（有就铺成背景） */
  cgId?: string | null
  cgDir?: string
  /** 接续选项：只在「已经是最后一行、并且字显示完了」时铺出来 */
  options?: string[]
  /** 生成中：选项按住不让点（别的照旧能翻） */
  busy?: boolean
  /** 操作员那一句的名字牌写什么 */
  youName?: string
  onPickOption?: (op: string) => void
  /** 打开某一条的编辑（长按文本框 / 点右侧那枚小按钮） */
  onEditLine?: (msgId: string) => void
  /** 编辑框（由调用方渲染好递进来，盖在舞台上） */
  editor?: ReactNode
  /** 还没人开口时，舞台正中摆什么（「让对方先开口」那一块） */
  empty?: ReactNode
}

/** 打字速度：18–22 字/秒 → 每字 50ms（落在带子中间，慢一点也不至于等） */
const CHAR_MS = 50
/** 长按多久算「要编辑」（与触屏上「长按」的通行值同档） */
const LONG_PRESS_MS = 500

/**
 * 把账切成行：一行一拍。
 * 认人只认「名字 + 冒号」开头那一种（与 speechContract 交给模型的行首写法一致），
 * 认出的人必须**此刻在场**（当前角色或同行者）—— 不在场的人名一律当旁白，
 * 免得舞台上一排人谁也不是说话的那个。
 */
function toScript(log: ChatMsg[], people: GalPerson[]): GalLine[] {
  const out: GalLine[] = []
  for (const m of log) {
    const rows = (m.text ?? '').replace(/\r\n?/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean)
    if (!rows.length) continue
    rows.forEach((t, i) => {
      const key = m.id + '#' + i
      if (m.from === 'user') {
        out.push({ key, msgId: m.id, who: null, text: t, kind: 'you' })
        return
      }
      const hit = people.find((p) => t.startsWith(p.name + '：') || t.startsWith(p.name + ':'))
      if (hit) out.push({ key, msgId: m.id, who: hit.id, text: t.slice(hit.name.length + 1).trim(), kind: 'say' })
      else out.push({ key, msgId: m.id, who: null, text: t, kind: 'narration' })
    })
  }
  return out
}

export function Galgame({
  cast, party, log, cgId, cgDir, options, busy, youName = '你',
  onPickOption, onEditLine, editor, empty,
}: GalgameProps) {
  const people = useMemo(() => [cast, ...party], [cast, party])
  const script = useMemo(() => toScript(log, people), [log, people])

  /** 当前停在第几拍 */
  const [idx, setIdx] = useState(0)
  /** 已显示几个字 */
  const [shown, setShown] = useState(0)
  const [recall, setRecall] = useState(false)
  const [sel, setSel] = useState(0)
  /** 减少动态：整句直接摊开，不逐字 */
  const [reduced, setReduced] = useState(false)
  const timerRef = useRef<number | null>(null)
  const recallRef = useRef<HTMLDivElement>(null)
  /** 上一趟有几句（用来判「账上多了新的一条」） */
  const seenRef = useRef<number | null>(null)
  /** 长按已经开过编辑 → 松手那一下别再当成「继续」 */
  const pressConsumed = useRef(false)
  const pressTimer = useRef<number | null>(null)

  const cur = script.length ? script[Math.min(idx, script.length - 1)] : null
  const text = cur?.text ?? ''
  const typing = shown < text.length
  const speakerId = cur?.who ?? null
  /** 说话的人在场吗：不在场（旁白 / 操作员）就整排亮回中性 */
  const speakerHere = speakerId !== null && people.some((p) => p.id === speakerId)
  const plate = cur
    ? (cur.kind === 'you' ? youName : (people.find((p) => p.id === cur.who)?.name ?? '旁白'))
    : ''

  /* 减少动态 */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /* 账上多了新的一条 → 停在**新长出来的第一拍**（最后那一条回复的第一行），
     从头把它读懂；刚进来时同理 —— 不把整场从第一句重放一遍，
     也不一屁股坐到最后一行（那一条的第一句往往才是接着上文的那句）。 */
  useEffect(() => {
    const prev = seenRef.current
    seenRef.current = script.length
    if (script.length > prev! || prev === null) {
      const lastMsgId = log.length ? log[log.length - 1].id : ''
      const at = lastMsgId ? script.findIndex((l) => l.msgId === lastMsgId) : -1
      setIdx(at >= 0 ? at : Math.max(0, script.length - 1))
    }
  }, [script.length])

  /* 打字机：换了一拍就从头打；reduce 时直接给整句 */
  const stopTyping = useCallback(() => {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null }
  }, [])
  const curKey = cur?.key ?? ''
  const curText = cur?.text ?? ''
  useEffect(() => {
    stopTyping()
    setShown(0)
    if (!curKey) return
    if (reduced || !curText.length) { setShown(curText.length); return }
    let n = 0
    timerRef.current = window.setInterval(() => {
      n += 1
      setShown(n)
      if (n >= curText.length) stopTyping()
    }, CHAR_MS)
    return stopTyping
  }, [curKey, curText, reduced, stopTyping])

  useEffect(() => () => {
    stopTyping()
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
  }, [stopTyping])

  /* 选项换了就回到第一条 */
  const optKey = (options ?? []).join('｜')
  useEffect(() => { setSel(0) }, [optKey])

  /** 只在「已经是最后一行」才铺选项 —— 翻到前面去的时候不该还能点上 */
  const atTail = idx >= script.length - 1
  const showOptions = !!options?.length && !typing && atTail && !recall && !editor

  const complete = useCallback(() => {
    stopTyping()
    setShown(text.length)
  }, [stopTyping, text.length])

  const advance = useCallback(() => {
    if (!cur) return
    if (typing) { complete(); return }
    if (idx < script.length - 1) setIdx(idx + 1)
  }, [cur, typing, complete, idx, script.length])

  const pickOption = useCallback((op: string) => {
    if (busy) return
    onPickOption?.(op)
  }, [busy, onPickOption])

  /* 回想开的时候滚到底：它列的是「本场至今」，最后那条就在眼前 */
  useEffect(() => {
    if (!recall) return
    const el = recallRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [recall])

  /* 键盘：Z / Enter / 空格 = 继续，X = 回想，Esc = 收回想 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      /* 带修饰键的一律不接管：Ctrl+Z 是撤销、Ctrl+Space 是输入法，别把它们吞掉 */
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key
      /* 编辑框开着：按键归它（它自己管保存与取消） */
      if (editor) return
      if (recall) {
        if (k === 'Escape' || k === 'x' || k === 'X') { e.preventDefault(); setRecall(false) }
        return
      }
      if (k === 'x' || k === 'X') { e.preventDefault(); setRecall(true); return }
      if (showOptions) {
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          e.preventDefault()
          const n = options!.length
          setSel((s) => (k === 'ArrowDown' ? (s + 1) % n : (s - 1 + n) % n))
          return
        }
        if (k === 'z' || k === 'Z' || k === 'Enter') {
          e.preventDefault()
          const op = options![Math.min(sel, options!.length - 1)]
          if (op) pickOption(op)
          return
        }
        return
      }
      if (k === 'z' || k === 'Z' || k === 'Enter' || k === ' ' || k === 'Spacebar') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, editor, options, pickOption, recall, sel, showOptions])

  /* 长按文本框 = 打开当前这一条的编辑（短按仍是「继续」） */
  const pressStart = () => {
    pressConsumed.current = false
    if (!cur || !onEditLine) return
    const msgId = cur.msgId
    pressTimer.current = window.setTimeout(() => {
      pressConsumed.current = true
      onEditLine(msgId)
    }, LONG_PRESS_MS)
  }
  const pressEnd = (fire: boolean) => {
    if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null }
    if (pressConsumed.current) { pressConsumed.current = false; return }
    if (fire) advance()
  }

  /* CG 铺背景：**探到了才铺**（缺图时舞台不该顶着一行「CG 待补」） */
  const [cgUrl, setCgUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setCgUrl(null)
    if (!cgId) return
    void probeCg(cgId, cgDir).then((u) => { if (alive) setCgUrl(u) })
    return () => { alive = false }
  }, [cgId, cgDir])

  const visiblePeers = party.slice(0, 3)
  const overflow = party.length - visiblePeers.length

  return (
    <div
      className={css.gal}
      role="group"
      aria-label="约会剧演"
      data-gal-stage={cur ? '1' : '0'}
      data-gal-speaker={speakerHere ? speakerId : ''}
      data-gal-line={idx}
    >
      <div className={css.stage} onClick={() => { if (!editor) advance() }}>
        {cgUrl ? <img className={css.cg} src={cgUrl} alt="" aria-hidden="true" data-gal-cg={cgId} /> : null}
        <div className={css.scrim} aria-hidden="true" />

        <div className={css.figures} aria-hidden="true">
          <div
            className={[css.lead, speakerHere && speakerId !== cast.id ? css.dim : ''].filter(Boolean).join(' ')}
            data-gal-left={cast.id}
            data-gal-lit={!speakerHere || speakerId === cast.id ? '1' : '0'}
          >
            <Portrait
              avatarId={cast.id}
              name={cast.name}
              hue={cast.hue}
              sigil={cast.sigil}
              width={220}
              height={330}
              fit="contain"
              eager
              className={css.art}
              style={{ width: '100%', height: '100%', borderRadius: 0, background: 'none' }}
            />
          </div>

          {visiblePeers.map((p, i) => {
            const lit = !speakerHere || speakerId === p.id
            return (
              <div
                key={p.id}
                className={[css.peer, css['peer' + i], lit ? '' : css.dim].filter(Boolean).join(' ')}
                style={{ '--gal-op': String(0.9 - i * 0.1) } as CSSProperties}
                data-gal-peer={p.id}
                data-gal-lit={lit ? '1' : '0'}
              >
                <Portrait
                  avatarId={p.id}
                  name={p.name}
                  hue={p.hue}
                  sigil={p.sigil}
                  width={180}
                  height={270}
                  fit="contain"
                  className={css.art}
                  style={{ width: '100%', height: '100%', borderRadius: 0, background: 'none' }}
                />
              </div>
            )
          })}

          {overflow > 0 ? <div className={css.more} data-gal-more={overflow}>+{overflow}</div> : null}
        </div>

        {empty && !script.length ? <div className={css.empty}>{empty}</div> : null}

        {/* 底下那一格：选项在上、文本框在下，一起贴着舞台底走（.dock 里竖排） */}
        <div className={css.dock}>
          {/* 接续选项：竖排摆在文本框上头，↑↓ 选、Z 确认 */}
          {showOptions ? (
            <div className={css.opts} role="group" aria-label="接续选项" data-gal-options={options!.length}>
              {options!.map((op, i) => (
                <button
                  key={op + i}
                  type="button"
                  className={[css.opt, i === sel ? css.optOn : ''].filter(Boolean).join(' ')}
                  aria-current={i === sel ? 'true' : undefined}
                  disabled={busy}
                  data-gal-opt={i}
                  data-gal-opt-on={i === sel ? '1' : '0'}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pickOption(op)}
                >{op}</button>
              ))}
            </div>
          ) : null}

          {/* 文本框：底通栏。点击 / Z / Enter / 空格 都是「继续」，
              长按或右边那一枚小按钮是「编辑这一条」。 */}
          <div
            className={css.box}
          data-gal-box
          onPointerDown={pressStart}
          onPointerUp={() => pressEnd(false)}
          onPointerCancel={() => pressEnd(false)}
        >
          {plate ? <span className={css.plate} data-gal-name>{plate}</span> : null}

          <div className={css.text} aria-live="polite" aria-atomic="true">
            <span className={css.sr}>{cur?.text ?? ''}</span>
            <span aria-hidden="true">{text.slice(0, shown)}{typing ? <i className={css.caret} /> : null}</span>
          </div>

          <div className={css.boxActs}>
            {onEditLine && cur ? (
              <button
                type="button"
                className={css.micro}
                data-gal-act="edit"
                onClick={(e) => { e.stopPropagation(); pressEnd(false); onEditLine(cur.msgId) }}
                title="改这一条（长按文本框也行）"
              >编辑</button>
            ) : null}
            <button
              type="button"
              className={css.micro}
              data-gal-act="recall"
              aria-expanded={recall}
              onClick={(e) => { e.stopPropagation(); setRecall((v) => !v) }}
              title="本场至今的正文（X）"
            >回想</button>
          </div>

          {!typing && !showOptions && atTail ? <span className={css.next} aria-hidden="true">▼</span> : null}
          <span className={css.keys} aria-hidden="true">{typing ? 'Z 全部显示' : 'Z · 继续'}　·　X 回想</span>
          </div>
        </div>


        {editor ? <div className={css.editorLayer} data-gal-editor>{editor}</div> : null}

        {recall ? (
          <div className={css.recall} role="dialog" aria-modal="true" aria-label="回想 · 本场至今" data-gal-recall>
            <div className={css.recallHead}>
              <b>回想 · 本场至今</b>
              <button
                type="button"
                className={css.micro}
                data-gal-recall-close
                onClick={() => setRecall(false)}
              >关闭 · Esc</button>
            </div>
            <div className={css.recallBody} ref={recallRef}>
              {script.slice(0, Math.max(1, idx + 1)).map((l) => (
                <p key={l.key} className={css.recallRow}>
                  <b>{l.kind === 'you' ? youName : (people.find((p) => p.id === l.who)?.name ?? '旁白')}</b>
                  <span>{l.text}</span>
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
