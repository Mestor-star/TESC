import { useEffect, useMemo, useRef, useState } from 'react'
import { Lightning, PaperPlaneTilt } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CONTACTS, REPLY_POOL, SEED_THREADS } from '../data/comms'
import { clock } from '../lib/format'
import type { ChatMsg } from '../data/types'

import css from './Comms.module.css'

interface Thread {
  id: string
  messages: ChatMsg[]
  poolIndex: number
  unread: number
  lastActive: string
}

export function Comms() {
  const { operatorName } = useTerminal()
  const seed = useMemo(() => {
    const map: Record<string, Thread> = {}
    for (const c of CONTACTS) {
      map[c.charId] = {
        id: c.charId,
        messages: (SEED_THREADS[c.charId] ?? []).map((m) => ({ ...m })),
        poolIndex: 0,
        unread: c.unread,
        lastActive: c.lastActive,
      }
    }
    return map
  }, [])

  const [threads, setThreads] = useState<Record<string, Thread>>(seed)
  const [activeId, setActiveId] = useState<string>(CONTACTS[0].charId)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState<string | null>(null)
  const msgId = useRef(1000)
  const endRef = useRef<HTMLDivElement>(null)

  // 跨视图跳转：zts:comms
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (!threads[id]) return
      setActiveId(id)
      setThreads((prev) => ({ ...prev, [id]: { ...prev[id], unread: 0 } }))
    }
    window.addEventListener('zts:comms', h)
    return () => window.removeEventListener('zts:comms', h)
  }, [threads])

  // 自动滚动到底部
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [threads, activeId, typing])

  const active = threads[activeId]
  const contact = CONTACTS.find((c) => c.charId === activeId)!
  const displayOp = operatorName === '{{user}}' ? '你' : operatorName

  const send = () => {
    const text = draft.trim()
    if (!text || !active || typing) return
    const t = clock()
    const mine: ChatMsg = { id: `u${msgId.current++}`, from: 'user', text, time: t }
    const updated: Thread = { ...active, messages: [...active.messages, mine], lastActive: '刚刚' }
    setThreads((prev) => ({ ...prev, [activeId]: updated }))
    setDraft('')
    setTyping(activeId)

    window.setTimeout(() => {
      const pool = REPLY_POOL[activeId] ?? ['收到。']
      const cur = threads[activeId]
      const idx = cur.poolIndex % pool.length
      const replyText = pool[idx].replace(/\{op\}/g, displayOp)
      const reply: ChatMsg = { id: `r${msgId.current++}`, from: 'them', text: replyText, time: clock() }
      setThreads((prev) => {
        const th = prev[activeId]
        return { ...prev, [activeId]: { ...th, messages: [...th.messages, reply], poolIndex: idx + 1, lastActive: '刚刚' } }
      })
      setTyping(null)
    }, 1100 + Math.random() * 900)
  }

  const handleSelect = (id: string) => {
    if (id === activeId) return
    setActiveId(id)
    setThreads((prev) => ({ ...prev, [id]: { ...prev[id], unread: 0 } }))
  }

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">LINK / COMMS</div>
          <h1>通讯终端</h1>
          <div className="vhead__sub">停滞观测信道全双工。加密讯息会在解码后以紫色标注显示。</div>
        </div>
        <div className="vhead__right">
          <span className="chip chip--on"><span className="chip__dot" /> 信道在线 4/4</span>
          <span className="chip">加密层 AES-1024（观测标准）</span>
        </div>
      </div>

      <div className={css.wrap}>
        {/* 会话列表 */}
        <aside className={`panel ${css.contactList}`}>
          <div className="panel__head">
            <span className="panel__title">会话信道 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>CHANNELS</span>
          </div>
          <div className={css.listBody}>
            {CONTACTS.map((c) => {
              const th = threads[c.charId]
              const last = th.messages[th.messages.length - 1]
              const isActive = activeId === c.charId
              return (
                <button key={c.charId} className={`${css.contact} ${isActive ? css.isActive : ''}`} onClick={() => handleSelect(c.charId)}>
                  <span className="glyph" style={{ '--g': c.hue, width: 40, height: 40 }}>
                    <span>{c.sigil}</span>
                  </span>
                  <span className={css.contactMain}>
                    <b>
                      {c.name}
                      {th.unread > 0 && <span className={css.unread}>{th.unread}</span>}
                    </b>
                    <small>{last ? `${last.from === 'them' ? c.name : '你'}：${last.text}` : c.topic}</small>
                  </span>
                  <span className={css.contactMeta}>
                    <span className={css.contactTime}>{last?.time ?? th.lastActive}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="panel__body" style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
            <div className="tiny muted" style={{ lineHeight: 1.7 }}>
              讯息内容仅在本终端内模拟流转，<br />不经过任何后端服务器。
            </div>
          </div>
        </aside>

        {/* 会话区 */}
        <section className={`panel ${css.chatPane}`}>
          <div className={css.chatHead}>
            <span className="glyph" style={{ '--g': contact.hue, width: 44, height: 44 }}>
              <span>{contact.sigil}</span>
            </span>
            <div className={css.chatHeadMeta}>
              <b>{contact.name}</b>
              <small>{contact.topic}</small>
            </div>
            <span className={css.channelTag}>CH-{contact.charId.toUpperCase().padStart(4, '0')}</span>
            <span className={css.online}>在线 · 停滞观测信道</span>
          </div>

          <div className={css.thread}>
            <div className={css.dayLabel}>苍之学园 · 今日</div>
            {active.messages.map((m) =>
              m.kind === 'decode' ? (
                <div key={m.id} className={css.decodeMsg}>
                  <Lightning size={13} weight="fill" /> {m.text}
                </div>
              ) : (
                <div key={m.id} className={`${css.msg} ${m.from === 'user' ? css['msg--user'] : css['msg--them']}`}>
                  <span className={css.msgAuthor}>{m.from === 'them' ? contact.name : displayOp}</span>
                  <span className={css.bubble}>{m.text}</span>
                  <span className={css.msgTime}>{m.time}</span>
                </div>
              ),
            )}
            {typing === activeId && (
              <div className={css.typing} aria-label="对方正在输入">
                <i /><i /><i />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className={css.composer}>
            <input
              className="field"
              placeholder={`发送给 ${contact.name}…（Enter 发送，本端为模拟信道）`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            />
            <button className={`btn btn--primary ${css.composerBtn}`} onClick={send} disabled={!draft.trim() || typing === activeId} aria-label="发送">
              <PaperPlaneTilt size={18} weight="bold" />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
