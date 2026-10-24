/* ============================================================
   邀请约会（components/InviteDate.tsx）
   ------------------------------------------------------------
   操作员**自己**开一场：不用等短信里对方先开口，也不必先聊到「dateReady」。
   剧情推进页段头右上角那枚「邀请约会」开出这一张浮层，四组输入：

     · 对象 —— 这一场跟谁（名册上**已遇见**的人）；
     · 地点 —— 只从地图表的**场所节点**里挑（`lib/rendezvous.ts` 的 `datePlaces()`），
       可搜；落进 `Rendezvous.place` 的就是节点名，往后与地图对得上账；
     · 时间 —— 今天 / 明天 / 周末 / 自定义（日期 + 时段），落成一句 `Rendezvous.time`
       （「明天下午」「3 月 14 日傍晚」这类，与已有那几场同一个写法）；
     · 流程（可选）—— 从 `DATE_BEATS` 里多选几拍，写进 `Rendezvous.plan`
       （**打算走的**，与「已经走到过的」`beats` 两件事，别混）；
     · 多人（可选）—— 同行的几位，写进 `Rendezvous.party`，上限 `PARTY_MAX`。

   校验在 `lib/rendezvous.ts` 的 `validateInvite()` 里（不静默、给一句人话）：
   地点必须在表里、时间得说定、同一个人同一时间只留一场、同行者不能有本人/不能重复/封顶。
   界面这一侧只做「挡不住的那一半」（没遇见的人不列出来），判据仍以 lib 那一份为准。

   成事之后与短信里那一路**同一口径**：`requestDate(rv.id)` —— Terminal 记一条跨视图意图，
   Plot 消费后把约会专线打开、并且正好选中这一场。
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { charOf } from '../data/personas'
import { PERSON_IDS } from '../data/castmeta'
import {
  DATE_BEATS, PARTY_MAX, datePlaces, openDateOf, openRendezvous, validateInvite,
} from '../lib/rendezvous'
import type { DatePlace } from '../lib/rendezvous'

import css from './InviteDate.module.css'

/** 时段（一天里最常约的五档）—— 与「今天 / 明天 / 周末」拼成一句 `time` */
const SLOTS = ['上午', '中午', '下午', '傍晚', '夜里'] as const
type Slot = (typeof SLOTS)[number]

/** 时间的三档预设 + 自定义 */
type TimeKind = 'today' | 'tomorrow' | 'weekend' | 'custom'
const TIME_KINDS: { id: TimeKind; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'tomorrow', label: '明天' },
  { id: 'weekend', label: '周末' },
  { id: 'custom', label: '自定义' },
]

/**
 * 节拍在界面上的一句短名。
 *
 * `DATE_BEATS[].when` 是**给导演照着判真假**的整句（「这一场里真的买了新衣服、
 * 并且已经试穿上了」），摆进勾选清单太长。这里只给短名，整句放 `title` 里当说明。
 * 登记了新节拍而这里没跟上 → 回落到 id（不至于凭空消失），只是不好读。
 */
const BEAT_LABEL: Record<string, string> = {
  'outfit-tryon': '买新衣 · 试穿',
  'intim-handjob': '手交',
  'intim-oral': '口交',
  'intim-oral-b': '口交 · 第二轮',
  'intim-paizuri': '乳交',
  'intim-missionary': '正常位',
  'intim-spooning': '侧入式',
  'intim-doggystyle': '后入式',
  'intim-cowgirl': '骑乘位',
  'intim-straddle': '对面座位',
}

/** 自定义日期那一格（`<input type="date">`）→ 「3 月 14 日」 */
function customDayText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ''
  return `${Number(m[2])} 月 ${Number(m[3])} 日`
}

/** 四档时间 → 一句 `Rendezvous.time`（没说定就是空串，由校验拦下来） */
function timeTextOf(kind: TimeKind, slot: Slot, custom: string): string {
  if (kind === 'today') return `今天${slot}`
  if (kind === 'tomorrow') return `明天${slot}`
  if (kind === 'weekend') return `周末${slot}`
  const day = customDayText(custom)
  return day ? `${day}${slot}` : ''
}

/** 名单上已遇见的人（操作员本身不在 PERSON_IDS 里，天然排除） */
interface Pick {
  id: string
  name: string
}

export function InviteDate({ onClose }: { onClose: () => void }) {
  const { isMet, push, requestDate } = useTerminal()

  const met = useMemo<Pick[]>(
    () => PERSON_IDS.filter((id) => isMet(id)).map((id) => ({ id, name: charOf(id)?.name ?? id })),
    [isMet],
  )

  const [to, setTo] = useState<string>('')
  const [place, setPlace] = useState<string>('')
  const [q, setQ] = useState('')
  const [timeKind, setTimeKind] = useState<TimeKind>('tomorrow')
  const [slot, setSlot] = useState<Slot>('下午')
  const [custom, setCustom] = useState('')
  const [plan, setPlan] = useState<string[]>([])
  const [party, setParty] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)

  const places = useMemo(() => datePlaces(), [])
  const placeHits = useMemo(() => {
    const k = q.trim()
    if (!k) return places
    return places.filter((p: DatePlace) => p.name.includes(k) || p.district.includes(k))
  }, [places, q])

  /** 这一场的在座（主位 + 同行）—— 节拍清单按它筛（`DateBeat.cast`：谁在场才提哪几拍） */
  const castIds = useMemo(() => (to ? [to, ...party] : []), [to, party])
  const beatChoices = useMemo(() => {
    if (!castIds.length) return DATE_BEATS
    return DATE_BEATS.filter((b) => !b.cast?.length || b.cast.some((id) => castIds.includes(id)))
  }, [castIds])
  /* 换了人之后，勾过但这一位不搭的节拍自己落下去（否则会留下一截点不着的选择） */
  useEffect(() => {
    const ok = new Set(beatChoices.map((b) => b.id))
    setPlan((prev) => (prev.every((id) => ok.has(id)) ? prev : prev.filter((id) => ok.has(id))))
  }, [beatChoices])
  /* 主位一换，本人要是有「没散的一场」，行内提示跟着换（校验那一道也会拦） */
  const liveOfTo = useMemo(() => (to ? openDateOf(to) : undefined), [to])
  const selectedPlace = places.find((p) => p.name === place)
  const timeText = timeTextOf(timeKind, slot, custom)

  const toggle = (list: string[], id: string, max = Infinity): string[] => {
    if (list.includes(id)) return list.filter((x) => x !== id)
    if (list.length >= max) return list
    return [...list, id]
  }

  const submit = () => {
    const why = validateInvite({ to, place, time: timeText, party })
    if (why) { setErr(why); return }
    /* 界面这一侧的唯一一道额外闸：**没见过的人不约**（lib 那层读不到世界状态） */
    if (!met.some((p) => p.id === to)) { setErr('这个人还没遇见过 —— 先在主线里见过面，才约得出来。'); return }
    const names = [to, ...party].map((id) => charOf(id)?.name ?? id)
    const rv = openRendezvous(to, {
      kind: 'date',
      title: `与${names.join('、')}的约会`,
      place,
      time: timeText,
      /* 'you' = 操作员自己约的这一场（`Rendezvous.from` 只有这两档）
         —— 与短信里对方先开口的 'them' 相对。 */
      from: 'you',
      ...(party.length ? { party } : {}),
      ...(plan.length ? { plan } : {}),
    })
    setErr(null)
    push('success', '约会已定',
      `${names[0]} · ${place} · ${timeText}${party.length ? ` · 同行 ${party.length} 位` : ''}${plan.length ? ` · 流程 ${plan.length} 拍` : ''}`,
      false)
    /* 与短信「约 TA」同一个跳法：Terminal 记意图 → Plot 打开约会专线并选中这一场 */
    requestDate(rv.id)
    onClose()
  }

  /* Esc 收作「关」；关掉之后把焦点还给打开它的那枚按钮（与 SaveDialog 同一条手感）。
     另外把焦点**收进浮层**、Tab 在浮层里绕圈 —— 这张浮层是 portal，挂在 body 末尾，
     不这么做的话从 body 起按 Tab 会先把整页十来个按钮走一遍才轮到它（等于键盘进不来）。 */
  const opener = useRef<Element | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    opener.current = document.activeElement
    panelRef.current?.focus()
    const focusables = () => {
      const el = panelRef.current
      if (!el) return []
      return [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((x) => x.offsetParent !== null || x === document.activeElement)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const list = focusables()
        if (!list.length) return
        const at = list.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey) {
          if (at <= 0) { e.preventDefault(); list[list.length - 1]!.focus() }
        } else if (at === -1 || at === list.length - 1) {
          e.preventDefault()
          list[0]!.focus()
        }
        return
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const el = opener.current
      opener.current = null
      if (el instanceof HTMLElement && el.isConnected) el.focus()
    }
  }, [onClose])

  return createPortal(
    <div
      className={css.mask}
      data-invite-panel="1"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={css.panel} role="dialog" aria-modal="true" aria-label="邀请约会" tabIndex={-1} ref={panelRef}>
        <div className={css.head}>
          <div>
            <div className={css.kicker}>DATE / INVITE</div>
            <b className={css.title}>邀请约会</b>
          </div>
          <div className={css.headActs}>
            <button className={`btn btn--ghost ${css.iconBtn}`} onClick={onClose} aria-label="关闭邀请约会">
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className={css.body}>
          {/* ① 对象 */}
          <section className={css.group} data-invite-group="to">
            <div className={css.groupHead}>
              <b>对象</b>
              <span className={css.groupHint}>这一场跟谁去（只列已经遇见过的人）</span>
            </div>
            {met.length === 0 ? (
              <p className={css.empty}>还没遇见过谁 —— 先在主线里见上一面，再回来约。</p>
            ) : (
              <div className={css.chips}>
                {met.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${css.chip} ${to === p.id ? css.isOn : ''}`}
                    aria-pressed={to === p.id}
                    data-invite-to={p.id}
                    data-invite-to-on={to === p.id ? '1' : '0'}
                    onClick={() => { setTo(p.id); setErr(null) }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {liveOfTo ? (
              <p className={css.note} data-invite-live={liveOfTo.id}>
                {charOf(to)?.name ?? to}身上还有一场没散（{liveOfTo.title} · {liveOfTo.place}）—— 先把它走完，再约新的。
              </p>
            ) : null}
          </section>

          {/* ② 地点 */}
          <section className={css.group} data-invite-group="place">
            <div className={css.groupHead}>
              <b>地点</b>
              <span className={css.groupHint}>地图上的场所 · {places.length} 处</span>
            </div>
            <input
              className={`field ${css.search}`}
              type="search"
              value={q}
              placeholder="搜地名或大区…"
              aria-label="搜索地点"
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            <div className={css.placeList} role="listbox" aria-label="约会地点">
              {placeHits.length === 0 ? (
                <p className={css.empty}>没有对得上的地名。</p>
              ) : placeHits.map((p) => {
                const on = place === p.name
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`${css.place} ${on ? css.placeOn : ''}`}
                    data-invite-place={p.id}
                    data-invite-place-on={on ? '1' : '0'}
                    title={p.district ? `${p.district} · ${p.layer}` : p.layer}
                    onClick={() => { setPlace(p.name); setErr(null) }}
                  >
                    <span className={css.placeName}>{on ? <Check size={12} weight="bold" /> : null}{p.name}</span>
                    <span className={css.placeMeta}>{p.district ? `${p.district} · ` : ''}{p.layer}</span>
                  </button>
                )
              })}
            </div>
            {selectedPlace ? (
              <p className={css.note} data-invite-place-picked={selectedPlace.id}>已选 · {selectedPlace.name}</p>
            ) : null}
          </section>

          {/* ③ 时间 */}
          <section className={css.group} data-invite-group="time">
            <div className={css.groupHead}>
              <b>时间</b>
              <span className={css.groupHint}>落成一句「{timeText || '……'}」</span>
            </div>
            <div className={css.seg} role="group" aria-label="哪一天">
              {TIME_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`${css.segBtn} ${timeKind === k.id ? css.isOn : ''}`}
                  aria-pressed={timeKind === k.id}
                  data-invite-when={k.id}
                  data-invite-when-on={timeKind === k.id ? '1' : '0'}
                  onClick={() => { setTimeKind(k.id); setErr(null) }}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {timeKind === 'custom' ? (
              <input
                className={`field ${css.dateField}`}
                type="date"
                value={custom}
                aria-label="哪一天"
                data-invite-date
                onChange={(e) => { setCustom(e.currentTarget.value); setErr(null) }}
              />
            ) : null}
            <div className={css.chips} role="group" aria-label="时段">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${css.chip} ${slot === s ? css.isOn : ''}`}
                  aria-pressed={slot === s}
                  data-invite-slot={s}
                  data-invite-slot-on={slot === s ? '1' : '0'}
                  onClick={() => { setSlot(s); setErr(null) }}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          {/* ④ 流程（可选） */}
          <section className={css.group} data-invite-group="plan">
            <div className={css.groupHead}>
              <b>流程<span className={css.opt}>（可选）</span></b>
              <span className={css.groupHint}>
                {plan.length ? `选了 ${plan.length} 拍` : '不选 = 自由约会，走到哪儿算哪儿'}
              </span>
            </div>
            <div className={css.chips}>
              {beatChoices.map((b) => {
                const on = plan.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`${css.chip} ${on ? css.isOn : ''}`}
                    aria-pressed={on}
                    data-invite-beat={b.id}
                    data-invite-beat-on={on ? '1' : '0'}
                    title={b.when}
                    onClick={() => { setPlan((prev) => toggle(prev, b.id)); setErr(null) }}
                  >
                    {BEAT_LABEL[b.id] ?? b.id}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ⑤ 多人（可选） */}
          <section className={css.group} data-invite-group="party">
            <div className={css.groupHead}>
              <b>多人<span className={css.opt}>（可选）</span></b>
              <span className={css.groupHint}>
                同行的几位 · {party.length}/{PARTY_MAX}
                {party.length >= PARTY_MAX ? ' · 已满' : ''}
              </span>
            </div>
            {met.filter((p) => p.id !== to).length === 0 ? (
              <p className={css.empty}>除了主位没有别人可带 —— 或者先选一位主位。</p>
            ) : (
              <div className={css.chips}>
                {met.filter((p) => p.id !== to).map((p) => {
                  const on = party.includes(p.id)
                  const full = party.length >= PARTY_MAX
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`${css.chip} ${on ? css.isOn : ''}`}
                      aria-pressed={on}
                      data-invite-party={p.id}
                      data-invite-party-on={on ? '1' : '0'}
                      disabled={!on && full}
                      title={!on && full ? `一起最多再带 ${PARTY_MAX} 位` : undefined}
                      onClick={() => { setParty((prev) => toggle(prev, p.id, PARTY_MAX)); setErr(null) }}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {err ? <p className={css.err} role="alert" data-invite-err>{err}</p> : null}
        </div>

        <div className={css.foot}>
          <span className={css.summary} data-invite-summary>
            {to ? charOf(to)?.name : '未选对象'} · {place || '未选地点'} · {timeText || '未定时间'}
          </span>
          <span className={css.grow} />
          <button className="btn btn--ghost" onClick={onClose}>取消</button>
          <button className="btn btn--primary" data-invite-submit onClick={submit}>
            生成这一场
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
