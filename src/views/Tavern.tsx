import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Lock, PaperPlaneTilt, Stop, Eraser } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TAVERN_PERSONAS, charOf } from '../data/personas'
import { genderOf } from '../data/castmeta'
import { Linkified } from '../components/Linkified'
import type { ApiSettings, ChatTurn } from '../lib/api'
import { chatCompletionStream, isReady, loadProfile } from '../lib/api'
import { clock, bondName } from '../lib/format'
import type { ChatMsg, CharId } from '../data/types'
import { extractLiveDisplay, parseDirectorReply, smsBondRule, smsDirective } from '../lib/plot'
import { loadActiveBooks } from '../lib/lorestore'
import { allowGateForTavern, buildLoreContext } from '../lib/lorescan'

import comm from './Comms.module.css'
import css from './Tavern.module.css'

const LOG_KEY = 'zts-tavern:v1'

function loadLogs(): Record<string, ChatMsg[]> {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ChatMsg[]>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function idFor(charId: string): string {
  return `${charId}::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`
}

/** 由现有档案（bio/quote/epithet）拼装人格系统提示，不虚构设定 */
function systemPrompt(
  charId: string,
  opName: string,
  bond: number,
  scenario: string,
): string {
  const c = charOf(charId)
  const you = opName === '言万心叶' ? '言万心叶' : `操作员「${opName}」`
  const core = c
    ? `你是《这里是，终末停滞委员会。》中的角色「${c.name}」（${c.role} · ${c.epithet}）。`
      + `\n档案设定：${c.bio}`
      + `\n标志性台词参考：${c.quote}`
    : '你是该作品中的一位角色。'
  return `${core}
\n此刻情境：${scenario}
\n当前与${you}的羁绊约 ${bond}/100（仅作语气参考，别把数字说出口）。
\n规则：
1. 始终以第一人称扮演，绝不脱离角色、绝不替${you}说话。
2. 使用简体中文，每次回复一到三句，口语自然，贴合上述档案的口癖与个性。
3. 不用 Markdown、不加星号动作、不发编号，像在聊天软件里直接打字。
4. 被问及剧透、真实世界、系统或 AI 时，用角色的口吻轻描淡写带过，并拉回当下情境。
5. 可以沿用原作台词与关系，但不要长篇复述设定。`
}

/** 聊天历史（剔除开场种子后的最近 N 条）转交给模型 */
function toTurns(log: ChatMsg[] | undefined, max = 12): ChatTurn[] {
  const list = (log ?? []).slice(-max)
  return list.map((m): ChatTurn =>
    m.from === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
  )
}

/** 羁绊增量的口语化注记 */
function bondNote(delta: number): string {
  if (delta >= 3) return '聊得火热'
  if (delta >= 1) return '更亲近了一点'
  if (delta <= -3) return '踩到了雷区'
  if (delta <= -1) return '起了点小摩擦'
  return ''
}

export function Tavern() {
  const { operatorName, isMet, bondNow, bumpBond, setFlag, navigate, push, epDone, world } = useTerminal()
  const [settings, setSettings] = useState<ApiSettings | null>(null)
  const [logs, setLogs] = useState<Record<string, ChatMsg[]>>(loadLogs)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** 流式生成中的未持久化活气泡（按联系人区分，切人即隐藏） */
  const [live, setLive] = useState<{ charId: string; text: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [foldOpen, setFoldOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggleFold = useCallback((id: string) => {
    setFoldOpen((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  useEffect(() => {
    loadProfile('sms').then(setSettings).catch(() => setSettings(null))
  }, [])

  // 会话持久化（仅聊天记录，不含任何密钥）
  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs))
    } catch {
      /* 隐私模式下降级为仅内存 */
    }
  }, [logs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs, activeId, busy])

  const metIds = useMemo(() => TAVERN_PERSONAS.map((p) => p.charId).filter((id) => isMet(id)), [isMet])

  /** 选中某个联系人；若其暂无会话则落一句开场白 */
  const enter = useCallback(
    (charId: string) => {
      if (!isMet(charId)) {
        push('warn', '尚未解锁', '需先在剧情中「遇见」该角色，方可发来第一条短信。')
        return
      }
      setActiveId(charId)
      setErr(null)
      setLogs((prev) => {
        if (prev[charId]) return prev
        const meta = TAVERN_PERSONAS.find((p) => p.charId === charId)
        const seed: ChatMsg = {
          id: idFor(charId),
          from: 'them',
          text: meta?.greeting ?? '……你来了。',
          time: clock(),
        }
        return { ...prev, [charId]: [seed] }
      })
    },
    [isMet, push],
  )

  // 初次渲染：若已有可聊角色，自动选第一位
  const inited = useRef(false)
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    if (metIds.length > 0) {
      setActiveId(metIds[0])
      setLogs((prev) => {
        const id = metIds[0]
        if (prev[id]) return prev
        const meta = TAVERN_PERSONAS.find((p) => p.charId === id)
        const seed: ChatMsg = { id: idFor(id), from: 'them', text: meta?.greeting ?? '……你来了。', time: clock() }
        return { ...prev, [id]: [seed] }
      })
    }
  }, [metIds])

  const activeChar = activeId ? charOf(activeId) : undefined
  const activeMeta = activeId ? TAVERN_PERSONAS.find((p) => p.charId === activeId) : undefined
  const activeLog = activeId ? logs[activeId] ?? [] : []

  /**
   * 发送核心：对某联系人用给定历史跑一次回复（历史末端需为操作员发言）。
   * 词条注入 + 双格式回执解析 + meta 记录 + 短信轻量指令落地。
   */
  const fire = useCallback(
    async (charId: string, log: ChatMsg[]) => {
      const c = charOf(charId)
      const meta = TAVERN_PERSONAS.find((p) => p.charId === charId)
      if (!c || !meta || busy) return
      const cfg = settings
      if (!cfg || !isReady(cfg)) {
        push('warn', 'AI 通道未配置', '请先在「设置」中为「角色短信」填入接口地址与模型，再回来发消息。')
        navigate('settings')
        return
      }
      setErr(null)
      setBusy(true)

      // 词条库命中注入（仅放行已登记实体 / 已完成事件；失败静默）
      let loreBlock = ''
      try {
        const books = await loadActiveBooks()
        if (books.length) {
          const recent = toTurns(log, 10).map((t) => t.content).join('\n')
          loreBlock = buildLoreContext(books, {
            scanText: recent,
            contextText: meta.scenario,
            gate: allowGateForTavern({ epDone, ends: world.ends }),
          })
        }
      } catch {
        loreBlock = ''
      }

      const bond = bondNow(charId)
      const system =
        systemPrompt(charId, operatorName, bond, meta.scenario)
        + (loreBlock ? `\n\n${loreBlock}` : '')
        + smsBondRule(charId)
      const messages: ChatTurn[] = [{ role: 'system', content: system }, ...toTurns(log)]

      const ctrl = new AbortController()
      abortRef.current = ctrl
      // 流式：途中只累积并以无副作用投影上屏活气泡；收尾才跑一次解析落地短信效果
      let acc = ''
      let settled = false
      try {
        const res = await chatCompletionStream(cfg, messages, {
          signal: ctrl.signal,
          onDelta: (chunk) => {
            if (settled || !chunk) return
            acc += chunk
            setLive({ charId, text: acc })
          },
        })
        settled = true
        setLive(null)

        const reply = (res.text ?? '').trim()
        if (!reply) {
          const why = res.refusal
            ? `模型拒绝作答${res.refusal ? ` · ${res.refusal}` : ''}`
            : res.finishReason === 'length'
              ? '回复已达长度上限，且未产出任何正文。'
              : '模型未返回任何内容。'
          setErr(`收发中断：${why}`)
          push('danger', '短信收发失败', why, false)
          return
        }
        if (res.finishReason === 'length') {
          const shown = extractLiveDisplay(acc).trim()
          if (shown) {
            setLogs((prev) => ({
              ...prev,
              [charId]: [...(prev[charId] ?? []), { id: idFor(charId), from: 'them', text: shown, time: clock() }],
            }))
          }
          push('warn', '回复已达长度上限', '短信正文可能被截断，本回合未落地任何短信效果。', false)
          return
        }

        // 回执正文照常上屏；JSON 或 <vars> 轻量指令经短信过滤后自动落地羁绊/标记
        const parsed = parseDirectorReply(reply)
        const shown = parsed.narrative.trim() || extractLiveDisplay(acc).trim() || reply
        const sd = smsDirective(parsed.directive, charId)
        let sum = 0
        for (const b of sd.bond ?? []) {
          bumpBond(b.char as CharId, b.delta)
          sum += b.delta
        }
        const flags = Object.entries(sd.flag ?? {})
        for (const [k, v] of flags) setFlag(k, v)
        const hasFx = sum !== 0 || flags.length > 0
        const ai: ChatMsg = {
          id: idFor(charId),
          from: 'them',
          text: shown,
          time: clock(),
          meta: {
            source: parsed.source,
            options: parsed.options.length ? parsed.options : undefined,
            thinking: parsed.thinking || undefined,
            hasFx,
          },
        }
        setLogs((prev) => ({ ...prev, [charId]: [...(prev[charId] ?? []), ai] }))

        if (sum !== 0) {
          push('success', '短信效果', `${c.name} · 羁绊 ${sum > 0 ? '+' : ''}${sum}${bondNote(sum) ? ` · ${bondNote(sum)}` : ''}`, false)
        } else if (flags.length > 0) {
          push('info', '短信效果', `${c.name} · 留下了一枚对话标记`, false)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          settled = true
          // 主动中断：保留已生成的部分上屏，但不落地任何（可能是半截的）短信效果
          const partial = extractLiveDisplay(acc).trim()
          setLive(null)
          if (partial) {
            setLogs((prev) => ({
              ...prev,
              [charId]: [...(prev[charId] ?? []), { id: idFor(charId), from: 'them', text: partial, time: clock() }],
            }))
          }
          return
        }
        settled = true
        setLive(null)
        const msg = e instanceof Error ? e.message : String(e)
        setErr(`收发中断：${msg}`)
        push('danger', '短信收发失败', msg, false)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [settings, busy, push, navigate, operatorName, bondNow, bumpBond, setFlag, epDone, world.ends],
  )

  const send = async () => {
    const text = draft.trim()
    if (!activeId || busy || !text) return
    setDraft('')
    const mine: ChatMsg = { id: idFor(activeId), from: 'user', text, time: clock() }
    const nextLog = [...activeLog, mine]
    setLogs((prev) => ({ ...prev, [activeId]: nextLog }))
    await fire(activeId, nextLog)
  }

  /** 重写末条回复（仅当末条为角色回复、上一条是操作员发言、且该回复无世界效果） */
  const rewriteLast = async (i: number) => {
    if (!activeId || busy || i !== activeLog.length - 1) return
    const prev = activeLog[i - 1]
    if (!prev || prev.from !== 'user') return
    const trimmed = activeLog.slice(0, i)
    setLogs((lg) => ({ ...lg, [activeId]: (lg[activeId] ?? []).slice(0, i) }))
    setErr(null)
    await fire(activeId, trimmed)
  }

  /** 点击「接续选项」→ 当作操作员发言发出 */
  const pickOptionText = async (text: string) => {
    const t = (text ?? '').trim()
    if (!activeId || busy || !t) return
    const mine: ChatMsg = { id: idFor(activeId), from: 'user', text: t, time: clock() }
    const nextLog = [...activeLog, mine]
    setLogs((prev) => ({ ...prev, [activeId]: nextLog }))
    await fire(activeId, nextLog)
  }

  const stop = () => {
    // 只中断：busy 交给 fire 的 finally 统一收口
    abortRef.current?.abort()
  }

  const clearThread = () => {
    if (!activeId) return
    setLogs((prev) => {
      const next = { ...prev }
      delete next[activeId]
      return next
    })
    setErr(null)
    push('info', '本线程已清空', '下次点入会重新落一句开场白。', false)
  }

  const linkState = !settings
    ? '读取本地设置…'
    : !isReady(settings)
      ? 'AI 通道未配置'
      : `已接入 · ${settings.model}`

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">SMS / CHARACTER CHAT</div>
          <h1>角色短信</h1>
          <div className="vhead__sub">
            与已「遇见」的角色一对一短信。回复由你自配的 OpenAI 兼容接口生成，人格取自角色档案与原文台词；
            走「角色短信」通道，可带轻量羁绊。密钥仅存本机。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip chip--on"><span className="chip__dot" /> {linkState}</span>
          <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('settings')}>
            前往设置
          </button>
        </div>
      </div>

      <div className={comm.wrap} style={{ gridTemplateColumns: '300px 1fr' }}>
        {/* 联系人 */}
        <aside className={`panel ${comm.contactList}`}>
          <div className="panel__head">
            <span className="panel__title">联系人 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>{metIds.length}/{TAVERN_PERSONAS.length}</span>
          </div>
          <div className={comm.listBody}>
            {TAVN_ALL.map((pid) => {
              const c = charOf(pid)
              const meta = TAVERN_PERSONAS.find((p) => p.charId === pid)
              if (!c || !meta) return null
              const met = metIds.includes(pid)
              const bond = bondNow(pid)
              const isActive = activeId === pid
              return (
                <button
                  key={pid}
                  className={`${comm.contact} ${isActive ? comm.isActive : ''}`}
                  onClick={() => enter(pid)}
                  style={{ opacity: met ? 1 : 0.55 }}
                >
                  <span className="glyph" style={{ '--g': c.hue, width: 40, height: 40 }}>
                    <span>{c.sigil}</span>
                  </span>
                  <span className={comm.contactMain}>
                    <span className={css.castName}>
                      {c.name}
                      {!met ? <Lock size={12} weight="bold" /> : null}
                    </span>
                    {met ? (
                      <>
                        <span className={css.castSub}>{c.epithet}</span>
                        <span className={css.castSub} style={{ color: 'var(--ink-faint)' }}>
                          {bondName(bond, { gender: genderOf(pid) })} {bond}/100
                        </span>
                      </>
                    ) : (
                      <span className={css.castLock}>未遇见 · 待剧情解锁</span>
                    )}
                  </span>
                </button>
              )
            })}
            <span className="muted tiny" style={{ padding: '6px 8px', lineHeight: 1.7, color: 'var(--ink-faint)' }}>
              回复由外部 AI 接口生成，非内置脚本。请勿在其中输入真实敏感信息。
            </span>
          </div>
          <div className="panel__body" style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
            <span className="tiny muted">联系人按「遇见解锁」变量点亮，随剧情推进增加。</span>
          </div>
        </aside>

        {/* 对谈区 */}
        <section className={`panel ${comm.chatPane}`}>
          {activeId && activeChar && activeMeta ? (
            <>
              <div className={comm.chatHead}>
                <span className="glyph" style={{ '--g': activeChar.hue, width: 44, height: 44 }}>
                  <span>{activeChar.sigil}</span>
                </span>
                <div className={comm.chatHeadMeta}>
                  <b>{activeChar.name} <span className={css.scenarioTag}>· 在线</span></b>
                  <small>{activeMeta.scenario}</small>
                </div>
                <span className={comm.channelTag}>SMS · {activeChar.id.toUpperCase()}</span>
                <button className="btn btn--ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={clearThread} title="清空本线程">
                  <Eraser size={13} weight="bold" /> 清空
                </button>
              </div>

              <div className={comm.thread}>
                <div className={comm.dayLabel}>苍之学园 · 今日 · 角色短信</div>
                {activeLog.map((m, i) => (
                  <Fragment key={m.id}>
                    <div className={`${comm.msg} ${m.from === 'user' ? comm['msg--user'] : comm['msg--them']}`}>
                      <span className={comm.msgAuthor}>{m.from === 'them' ? activeChar.name : operatorName}</span>
                      <span className={comm.bubble}><Linkified text={m.text} /></span>
                      <span className={comm.msgTime}>{m.time}</span>
                    </div>

                    {m.from === 'them' ? (
                      <div className={css.replyMeta}>
                        {m.meta?.thinking ? (
                          <div className={css.thinkFold}>
                            <button type="button" className={css.thinkHead} onClick={() => toggleFold(m.id)}>
                              <b>推演</b>
                              <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
                                {foldOpen.has(m.id) ? '收起' : `展开 · ${m.meta.thinking.length} 字`}
                              </span>
                            </button>
                            {foldOpen.has(m.id) ? (
                              <div className={css.thinkBody}>{m.meta.thinking}</div>
                            ) : null}
                          </div>
                        ) : null}

                        {m.meta?.options && m.meta.options.length ? (
                          <div className={css.optRow}>
                            {m.meta.options.map((op) => (
                              <button
                                key={op}
                                type="button"
                                className={`btn btn--ghost ${css.optChip}`}
                                style={{ fontSize: 12 }}
                                disabled={busy}
                                onClick={() => void pickOptionText(op)}
                              >
                                {op}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {i === activeLog.length - 1 && i > 0 && activeLog[i - 1].from === 'user' && m.meta?.hasFx !== true && !busy ? (
                          <div className={css.replyActs}>
                            <button type="button" className="linkGo" onClick={() => void rewriteLast(i)}>重写此回复</button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Fragment>
                ))}
                {live && live.charId === activeId && live.text ? (
                  <div className={`${comm.msg} ${comm['msg--them']}`} data-stream-live="1">
                    <span className={comm.msgAuthor}>{activeChar.name}</span>
                    <span className={comm.bubble}><Linkified text={extractLiveDisplay(live.text)} /></span>
                    <span className={comm.msgTime}>生成中…</span>
                  </div>
                ) : null}
                {err ? <div className={css.errLine}>{err}</div> : null}
                {busy && (!live || live.charId !== activeId || !live.text) ? (
                  <div className={comm.typing} aria-label="对方正在输入">
                    <i /><i /><i />
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              <div className={comm.composer}>
                <input
                  className="field"
                  placeholder={`给 ${activeChar.name} 发消息…（Enter 发送）`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (busy) stop()
                      else void send()
                    }
                  }}
                />
                {busy ? (
                  <button className={`btn btn--amber ${comm.composerBtn}`} onClick={stop} aria-label="中断回复">
                    <Stop size={18} weight="bold" />
                  </button>
                ) : (
                  <button
                    className={`btn btn--primary ${comm.composerBtn}`}
                    onClick={() => void send()}
                    disabled={!draft.trim()}
                    aria-label="发送"
                  >
                    <PaperPlaneTilt size={18} weight="bold" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className={css.hint}>
              <div>
                <b>{metIds.length === 0 ? '还没有可联系的角色' : '先选一位联系人'}</b>
                尚未「遇见」任何角色——先去剧情视图推进事件，遇见角色后即在此解锁。<br />
                解锁后，于「设置」的「角色短信」卡片中填好接口地址与模型即可开始 AI 对话。
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

const TAVN_ALL = TAVERN_PERSONAS.map((p) => p.charId)
