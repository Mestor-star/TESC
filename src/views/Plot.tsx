import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Key } from 'react'
import { ArrowRight, Check, Eraser, MagicWand, PaperPlaneTilt, Stop } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { CHARACTERS } from '../data/chars'
import { personOf } from '../data/castmeta'
import { SCENES } from '../data/scenes'
import type { ApiSettings, ChatTurn } from '../lib/api'
import { chatCompletion, chatCompletionStream, isReady, loadProfile } from '../lib/api'
import { loadOfflineText } from '../lib/offtext'
import { clock } from '../lib/format'
import type { ChatMsg, CharId, RecordMode } from '../data/types'
import { applyDirective, buildDirectorSystem, directiveHasFx, extractLiveDisplay, parseDirectorReply } from '../lib/plot'
import type { PlotReply } from '../lib/plot'
import { loadActiveBooks } from '../lib/lorestore'
import { allowGateFor, buildLoreContext } from '../lib/lorescan'
import { splitSpeech } from '../lib/dialogue'
import { Linkified } from '../components/Linkified'
import { Portrait } from '../components/Portrait'

import css from './Plot.module.css'

const LOG_KEY = 'zts-plot:v1'

/** 进入一个尚无会话的事件时，喂给导演的「开场请求」（不入历史） */
const OPEN_PROMPT =
  '（开场）请依据「事件大纲」与在场角色，铺陈这一事件的开端：写清此时此地、在场者的状态与正悬而未决的局面，'
  + '然后停在一个言万心叶可以回应、可以行动的地方。先不要收束事件；本回合若无变量变化，指令块给 {} 即可。'

/** 当原文「开场白」已注入为首条消息时，让导演接着开场续写、而非另起一段开场 */
const CONTINUE_PROMPT =
  '（接续开场）上面那条「开场白 · 原文」即是本事件的起点。请接着它继续铺陈此刻的局势：写清言万心叶身在何地、'
  + '在场者的状态与正悬而未决的局面，然后停在言万心叶可以回应、可以行动的地方。不要重复或改写过开场白本身；'
  + '先不要收束事件；本回合若无变量变化，指令块给 {} 即可。'

/** 「AI 起草」的请求：站在言万心叶视角草拟下一步可说的话/行动（仅供操作员择一填入，不落导演状态） */
const DRAFT_PROMPT =
  '（起草助手）请暂时站在言万心叶的视角，依据当前事件与最近的对话，为言万心叶草拟 2~3 个下一步可以说出口的话或可以做的行动。\n'
  + '要求：一行一条，以「- 」开头；每条须是一句可以直接照说的完整话或一个明确的小行动，贴合当前局势与角色语气；'
  + '不要用导演叙述口吻，不要写成小说段落，不要输出事件指令或变量，也不要带「言万心叶：」之类的前缀。'

const MODE_LABEL: Record<RecordMode, string> = {
  online: '在线推演',
  offline: '离线通读',
  legacy: '旧档回填',
}

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

function idFor(): string {
  return `${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`
}

/** 剧情会话历史（最近 N 条）→ 模型消息 */
function toTurns(log: ChatMsg[] | undefined, max = 16): ChatTurn[] {
  const list = (log ?? []).slice(-max)
  return list.map((m): ChatTurn =>
    m.from === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
  )
}

/** 把「AI 起草」的原始返回切成一句句可直接填入的候选行动（条理性 best-effort） */
function parseDraftLines(raw: string): string[] {
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const cleaned = t
      .replace(/^[-–—•·*▪‣]\s*/, '')
      .replace(/^\(\d+\s*\)\s*/, '')
      .replace(/^\d+[.)、]\s*/, '')
      .replace(/^[①②③④⑤]\s*/, '')
      .trim()
    if (!cleaned || cleaned.length < 2 || cleaned.length > 90) continue
    out.push(cleaned)
    if (out.length >= 4) break
  }
  if (out.length) return out
  // 兜底：模型没按行给 → 按句子切前三条
  return raw
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 90)
    .slice(0, 4)
}

export function Plot() {
  const {
    operatorName, navigate, push,
    epDone, bondNow, world,
    bumpBond, registerEnd, meetChar, setFlag, recordPick, completeEvent,
    records,
  } = useTerminal()

  const [cfgMain, setCfgMain] = useState<ApiSettings | null | undefined>(undefined)
  const [mode, setMode] = useState<'online' | 'offline'>('online')
  const [logs, setLogs] = useState<Record<string, ChatMsg[]>>(loadLogs)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** 流式生成中的未持久化活气泡（无副作用投影，终态落地后清空） */
  const [live, setLive] = useState<{ evId: string; text: string } | null>(null)
  const [offState, setOffState] = useState<{ id: string | null; state: 'idle' | 'loading' | 'ok' | 'miss'; text?: string; msg?: string }>({ id: null, state: 'idle' })
  const [lastEnded, setLastEnded] = useState<{ id: string; title: string; digest: string; diverged: boolean; mode: RecordMode } | null>(null)
  /** 「AI 起草」：起草中 / 候选行动 / 失败提示（纯呈现，不落导演状态） */
  const [drafting, setDrafting] = useState(false)
  const [draftSugg, setDraftSugg] = useState<string[] | null>(null)
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const draftAbortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  /** 事件收束后自动推进到下一段时，先不自动铺开场（等操作员发话） */
  const skipAutoOpen = useRef(false)
  const lastOpen = useRef<string | null>(null)
  const needDir = useRef(false)
  const [foldOpen, setFoldOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggleFold = useCallback((id: string) => {
    setFoldOpen((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  // 在线门禁 = 主线直连通道已配置（密钥仅运行时存于本机，不入库）
  const ready = !!cfgMain && isReady(cfgMain)
  const showOnline = mode === 'online'

  const total = TIMELINE.length
  const doneCount = useMemo(() => TIMELINE.filter((e) => epDone[e.id]).length, [epDone])
  const allDone = doneCount === total
  const focusEv = useMemo(
    () => (allDone ? null : TIMELINE.find((e) => !epDone[e.id]) ?? null),
    [epDone, allDone],
  )
  const activeLog = focusEv ? logs[focusEv.id] ?? [] : []

  /* —— 通道配置：读取主线直连配置 —— */
  useEffect(() => {
    let on = true
    loadProfile('main')
      .then((c) => on && setCfgMain(c))
      .catch(() => on && setCfgMain(null))
    return () => { on = false }
  }, [])

  // 主线通道未配置时，默认落到离线通读
  useEffect(() => {
    if (cfgMain && !isReady(cfgMain)) setMode('offline')
  }, [cfgMain])

  /* —— 会话持久化（不含密钥） —— */
  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs))
    } catch {
      /* 隐私模式下降级为仅内存 */
    }
  }, [logs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs, busy, focusEv?.id])

  const appendMsg = useCallback((evId: string, m: ChatMsg) => {
    setLogs((prev) => ({ ...prev, [evId]: [...(prev[evId] ?? []), m] }))
  }, [])

  /** 指令落地 + 结算：写变量、toast、eventDone→收束记录并推进下一段 */
  const applyReply = useCallback(
    (parsed: PlotReply, evId: string) => {
      const d = parsed.directive
      if (!d || Object.keys(d).length === 0) return
      const fx = applyDirective(d, { meetChar, bumpBond, registerEnd, setFlag })
      const ev = TIMELINE.find((e) => e.id === evId)
      if (fx.met.length) {
        const names = fx.met.map((id) => personOf(id)?.name ?? id).join(' · ')
        push('decode', '档案解锁 · 新遇见', `${names}，已录入角色档案。`, false)
      }
      if (fx.bonds.length) {
        const parts = fx.bonds.map((b) => {
          const nm = personOf(b.char)?.name ?? b.char
          return `${nm} ${b.delta > 0 ? '+' : ''}${b.delta}`
        }).join(' · ')
        push('success', '羁绊变化', parts, false)
      }
      if (fx.ends.length) {
        push('info', '图鉴登记', `${fx.ends.length} 条实体已登记进终末图鉴。`, false)
      }
      if (fx.flags.length) {
        const shown = fx.flags
          .map(([k, v]) => `${k} = ${typeof v === 'string' ? v : String(v)}`)
          .slice(0, 3)
          .join(' · ')
        push('info', '变量已自动更新', fx.flags.length > 3 ? `${shown} 等 ${fx.flags.length} 项` : shown, false)
      }
      if (fx.eventDone) {
        const digest = (fx.digest?.trim() || ev?.summary || '').trim()
        completeEvent(evId, digest || ev?.summary || '', 'online', fx.diverged)
        skipAutoOpen.current = true
        setLastEnded({ id: evId, title: ev?.title ?? evId, digest: digest || ev?.summary || '', diverged: fx.diverged, mode: 'online' })
        push('decode', '事件收束 · 已写入记录', ev?.title ?? evId, false)
        return
      }
      if (fx.diverged) {
        push('warn', '路线偏离', '本段已偏离原著走向，相关分歧以标记为准。', false)
      }
    },
    [meetChar, bumpBond, registerEnd, setFlag, completeEvent, push],
  )

  /**
   * 对某事件发起一次在线推演请求。
   * userMsg 可选：操作员发言（正常回合）；baseOverride 可选：重写时用截断后的历史当 base。
   */
  const pushTurn = useCallback(
    async (evId: string, userMsg?: string, baseOverride?: ChatMsg[]) => {
      const ev = TIMELINE.find((e) => e.id === evId)
      if (!ev || busy || !ready) return
      setBusy(true)
      setErr(null)

      // 世界书命中注入（仅就绪在线；失败静默，主线不受影响）
      let loreBlock = ''
      try {
        const books = await loadActiveBooks()
        if (books.length) {
          const scanLog = baseOverride ?? logs[evId]
          const recent = toTurns(scanLog, 10).map((t) => t.content).join('\n')
          loreBlock = buildLoreContext(books, {
            scanText: `${recent}${userMsg ? `\n${userMsg}` : ''}`,
            contextText: `${ev.group} · ${ev.title} · ${ev.place} ${ev.summary}`,
            gate: allowGateFor({ epDone, ends: world.ends }, evId),
          })
        }
      } catch {
        loreBlock = ''
      }

      const system = buildDirectorSystem(ev, {
        operatorName,
        bondNow,
        flags: world.flags,
        needDirective: needDir.current,
        loreContext: loreBlock || undefined,
      })
      const base = toTurns(baseOverride ?? logs[evId])
      const messages: ChatTurn[] = [{ role: 'system', content: system }, ...base]
      if (userMsg) messages.push({ role: 'user', content: userMsg })

      const ctrl = new AbortController()
      abortRef.current = ctrl
      // 流式：途中只累积原文并以无副作用投影上屏活气泡；
      // 收尾（或长度上限/中断）才落正式消息，指令只在完整收口时落地一次。
      let acc = ''
      let settled = false
      try {
        const res = await chatCompletionStream(cfgMain!, messages, {
          signal: ctrl.signal,
          maxTokens: 1500,
          onDelta: (chunk) => {
            if (settled || !chunk) return
            acc += chunk
            setLive({ evId, text: acc })
          },
        })
        settled = true
        setLive(null)

        const full = (res.text ?? '').trim()

        // 空答 / 拒答诊断
        if (!full) {
          const why = res.refusal
            ? `模型拒绝作答${res.refusal ? ` · ${res.refusal}` : ''}`
            : res.finishReason === 'length'
              ? '回复已达长度上限，且未产出任何正文。'
              : '模型未返回任何内容。'
          needDir.current = true
          setErr(why)
          push('danger', 'AI 推演失败', why, false)
          return
        }

        // 到达长度上限：指令块可能被截断在半途 → 只保留叙述、绝不落地半截指令
        if (res.finishReason === 'length') {
          const shown = extractLiveDisplay(acc)
          if (shown) {
            appendMsg(evId, { id: idFor(), from: 'them', text: shown, time: clock() })
            needDir.current = true
          }
          push('warn', '回复已达长度上限', '正文可能被截断；本回合未自动落地指令，可点「要求补发指令」补收。', false)
          return
        }

        const parsed = parseDirectorReply(full)
        needDir.current = !parsed.found
        if (!parsed.found) {
          push('warn', '未解析到事件指令', '叙述已上屏；本回合无变量自动落地，下一回会附带补发提醒。', false)
        }
        const shown = parsed.narrative.trim() || extractLiveDisplay(acc).trim()
        if (shown) {
          appendMsg(evId, {
            id: idFor(),
            from: 'them',
            text: shown,
            time: clock(),
            meta: {
              source: parsed.source,
              options: parsed.options.length ? parsed.options : undefined,
              thinking: parsed.thinking || undefined,
              hasFx: directiveHasFx(parsed.directive),
            },
          })
        }
        applyReply(parsed, evId)
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          settled = true
          // 主动中断：保留已生成的部分叙述上屏，但不落地任何（可能是半截的）指令
          const partial = extractLiveDisplay(acc).trim()
          setLive(null)
          if (partial) {
            appendMsg(evId, { id: idFor(), from: 'them', text: partial, time: clock() })
            push('info', '生成已中断', '已保留到当前生成的部分，未落地任何指令。', false)
          }
          return
        }
        settled = true
        setLive(null)
        const msg = e instanceof Error ? e.message : String(e)
        setErr(`推演中断：${msg}`)
        push('danger', 'AI 推演失败', msg, false)
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, ready, cfgMain, operatorName, bondNow, world.flags, world.ends, epDone, logs, appendMsg, applyReply, push],
  )

  const send = async () => {
    const text = draft.trim()
    if (!focusEv || busy || !text) return
    // 若「AI 起草」仍在跑，先中断它，让位给操作员的实际发言
    if (drafting) { draftAbortRef.current?.abort(); setDrafting(false) }
    setDraft('')
    appendMsg(focusEv.id, { id: idFor(), from: 'user', text, time: clock() })
    await pushTurn(focusEv.id, text)
  }

  /** 「AI 起草」：让模型从言万心叶视角草拟下一步行动候选 → 点选填入输入框（可编辑后再发送） */
  const draftCandidates = async () => {
    const ev = focusEv
    if (!ev || busy || drafting || !ready) return
    setDrafting(true)
    setDraftErr(null)
    setDraftSugg(null)
    const ctrl = new AbortController()
    draftAbortRef.current = ctrl
    try {
      const system = buildDirectorSystem(ev, { operatorName, bondNow, flags: world.flags, needDirective: false })
      const messages: ChatTurn[] = [
        { role: 'system', content: system },
        ...toTurns(logs[ev.id]),
        { role: 'user', content: DRAFT_PROMPT },
      ]
      const res = await chatCompletion(cfgMain!, messages, { signal: ctrl.signal, maxTokens: 320 })
      const text = (res ?? '').trim()
      if (!text) {
        setDraftErr('模型没有返回可用内容，可再试一次。')
        return
      }
      const sugg = parseDraftLines(text)
      if (!sugg.length) {
        setDraftErr('未解析出可用的候选，可再试一次。')
        return
      }
      setDraftSugg(sugg)
      push('info', 'AI 起草', `已草拟 ${sugg.length} 条可发送的行动/话语，点选一条填入。`, false)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      setDraftErr(`起草失败：${msg}`)
    } finally {
      draftAbortRef.current = null
      setDrafting(false)
    }
  }

  const stop = () => {
    // 只中断：busy 交给 pushTurn 的 finally 统一收口，避免中断未落定时并发新一轮
    abortRef.current?.abort()
  }

  const clearThread = () => {
    if (!focusEv) return
    setLogs((prev) => {
      const next = { ...prev }
      delete next[focusEv.id]
      return next
    })
    setErr(null)
    push('info', '本段会话已清空', '重新发消息即从头推演。', false)
  }

  /** 楼层回退：截断到第 i 条之前，本段会话从该条重新起步（只动日志，不回滚已落地变量） */
  const rollbackAt = (i: number) => {
    if (!focusEv || busy) return
    const cur = logs[focusEv.id] ?? []
    if (i < 0 || i > cur.length) return
    setLogs((prev) => ({ ...prev, [focusEv.id]: (prev[focusEv.id] ?? []).slice(0, i) }))
    needDir.current = false
    setErr(null)
    push('info', '从此重来', '已截断至此，本段会话从这一条重新起步。此前已落地的羁绊/图鉴/记录不会回滚。', false)
  }

  /** 重写此回复：仅当末条为导演叙述、上一条是操作员发言、且该叙述未产生世界变化 */
  const rewriteReply = async (i: number) => {
    if (!focusEv || busy || !ready) return
    const cur = logs[focusEv.id] ?? []
    if (i !== cur.length - 1) return
    const prev = cur[i - 1]
    if (!prev || prev.from !== 'user') return
    const trimmed = cur.slice(0, i)
    setLogs((lg) => ({ ...lg, [focusEv.id]: (lg[focusEv.id] ?? []).slice(0, i) }))
    needDir.current = false
    setErr(null)
    await pushTurn(focusEv.id, undefined, trimmed)
  }

  /** 点击某条「接续选项」→ 作为操作员发言发出并推进 */
  const pickOption = async (text: string) => {
    const t = (text ?? '').trim()
    if (!focusEv || busy || !ready || !t) return
    appendMsg(focusEv.id, { id: idFor(), from: 'user', text: t, time: clock() })
    await pushTurn(focusEv.id, t)
  }

  /* —— 既定行动快捷槽（若该事件有 choices） —— */
  const scene = focusEv ? SCENES[focusEv.id] : undefined
  const choices = scene?.choices?.filter((ch) => ch && world.pick[focusEv!.id] !== ch.key) ?? []
  const alreadyPicked = focusEv ? !!scene?.choices?.length && !!world.pick[focusEv.id] : false

  const quickAct = async (key: string) => {
    if (!focusEv || busy) return
    const ch = SCENES[focusEv.id]?.choices?.find((c) => c.key === key)
    if (!ch) return
    // 依原著既定余波确定性落地（等价旧 choose 语义）
    // 先落本地，再发消息让模型据「已发生事实」续写，避免重复累计
    recordPick(focusEv.id, ch.key)
    if (ch.bond) for (const b of ch.bond) bumpBond(b.char, b.delta)
    if (ch.flag) setFlag(ch.flag[0], ch.flag[1])
    push('decode', '行动已定 · 系统存档', ch.label, false)
    const text =
      `（言万心叶的行动已定，并已由终端自动存档：）${ch.label}。\n`
      + `（该行动的既定余波：${ch.after}）\n`
      + '请把上述视为已经发生的事实，从此刻的局势接续叙述；不要重复该行动本身，也不要再次累计随该行动记录过的羁绊或标记。'
    appendMsg(focusEv.id, { id: idFor(), from: 'user', text, time: clock() })
    await pushTurn(focusEv.id, text)
  }

  /** 补发指令：仅要求模型回一个事件指令块 */
  const resendDirective = async () => {
    if (!focusEv || busy || !ready) return
    setBusy(true)
    setErr(null)
    const ev = focusEv
    const system = buildDirectorSystem(ev, { operatorName, bondNow, flags: world.flags, needDirective: true })
    const messages: ChatTurn[] = [
      { role: 'system', content: system },
      ...toTurns(logs[ev.id]),
      { role: 'user', content: '（终端自动请求）请补发本回合的事件指令（JSON 围栏或 <vars> 标签皆可）：仅输出指令本身，无需展开叙述；若无任何变化则输出 {}。' },
    ]
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await chatCompletion(cfgMain!, messages, { signal: ctrl.signal, maxTokens: 900 })
      const parsed = parseDirectorReply(res)
      needDir.current = !parsed.found
      if (parsed.found) {
        push('success', '已收到事件指令', '指令已自动落地。', false)
      } else {
        push('warn', '仍未解析到事件指令', '可再试一次，或继续发消息推进。', false)
      }
      applyReply(parsed, ev.id)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      setErr(`补发失败：${msg}`)
      push('danger', 'AI 推演失败', msg, false)
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  /* —— 在线开场：某事件尚无实质会话且刚进入在线时 ——
     优先注入原文「开场白」（SCENES.open，无 AI 参与、随会话持久化）作为首条；
     只有「开场白」而尚无 AI/操作员回合，视为未开篇：若未被收束跳过，仍让导演接着开场续写；
     事件收束推进后自动铺的下一段开场白（skipAutoOpen）则只注入、等操作员发话；
     无开场白的段沿用导演自拟开场。 */
  useEffect(() => {
    if (!focusEv || !showOnline || !ready || busy) return
    const evId = focusEv.id
    const lg = logs[evId] ?? []
    const openings = lg.filter((m) => m.meta?.opening)
    // 已开篇 = 开场白之外还有 AI 回执或操作员回合（首条开场白单独存在不算会话）
    if (lg.length > openings.length) return
    if (lastOpen.current === evId) return
    lastOpen.current = evId

    const scOpen = SCENES[evId]?.open?.trim()
    if (!openings.length && scOpen) {
      const opening: ChatMsg = { id: idFor(), from: 'them', text: scOpen, time: clock(), meta: { opening: true } }
      appendMsg(evId, opening)
      if (!skipAutoOpen.current) void pushTurn(evId, CONTINUE_PROMPT, [opening])
    } else if (!skipAutoOpen.current) {
      // 已有开场白（此前只铺了原文）→ 接续；或本段无开场白 → 导演自拟
      void pushTurn(evId, openings.length ? CONTINUE_PROMPT : OPEN_PROMPT)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEv?.id, showOnline, ready, busy])

  /* 切换事件/离线时清掉上一段的起草结果 */
  useEffect(() => {
    setDraftSugg(null)
    setDraftErr(null)
  }, [focusEv?.id, showOnline])

  /* —— 离线原文加载 —— */
  useEffect(() => {
    let on = true
    if (!focusEv || showOnline) {
      setOffState({ id: null, state: 'idle' })
      return
    }
    setOffState((s) => (s.id === focusEv.id && (s.state === 'ok' || s.state === 'miss') ? s : { id: focusEv.id, state: 'loading' }))
    loadOfflineText(focusEv.id)
      .then((text) => on && setOffState({ id: focusEv!.id, state: 'ok', text }))
      .catch((e) => on && setOffState({ id: focusEv!.id, state: 'miss', msg: e instanceof Error ? e.message : String(e) }))
    return () => { on = false }
  }, [focusEv?.id, showOnline])

  const finishOffline = () => {
    if (!focusEv) return
    const ev = focusEv
    completeEvent(ev.id, ev.summary, 'offline')
    skipAutoOpen.current = false
    setLastEnded({ id: ev.id, title: ev.title, digest: ev.summary, diverged: false, mode: 'offline' })
    push('decode', '事件收束 · 已写入记录', `${ev.title}（离线通读）`, false)
  }

  const modelChip = !showOnline
    ? '离线通读'
    : cfgMain === undefined
      ? '读取配置…'
      : ready
        ? `在线推演 · ${cfgMain?.model ?? '—'}`
        : '主线通道未配置'

  /* —— 事件卡片（侧栏）：只读大纲信息 —— */
  const eventCard = focusEv ? (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">当前事件 <span className="slash" /></span>
        <span className="muted tiny" style={{ marginLeft: 'auto' }}>{focusEv.group} · {focusEv.phase}</span>
      </div>
      <div className="panel__body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="vhead__kicker" style={{ fontSize: 9 }}>EVENT / {focusEv.id.toUpperCase()}</div>
          <b style={{ fontSize: 17, lineHeight: 1.4 }}>{focusEv.title}</b>
          <div className="muted tiny" style={{ marginTop: 3, color: 'var(--ink-mute)' }}>
            {focusEv.place}{focusEv.day ? ` · ${focusEv.day}` : ''}
          </div>
        </div>
        <div>
          <div className="tiny muted" style={{ marginBottom: 6, color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>大纲 · 唯一事实来源</div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.85, margin: 0, color: 'var(--ink-mute)' }}>{focusEv.summary}</p>
        </div>
        {focusEv.entities.some((x) => x !== '——') ? (
          <div>
            <div className="tiny muted" style={{ marginBottom: 6, color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>关联实体</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {focusEv.entities.filter((x) => x !== '——').map((ent) => (
                <span key={ent} className="chip">{ent}</span>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <div className="tiny muted" style={{ marginBottom: 6, color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>在场角色 · 羁绊</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(focusEv.chars.length ? focusEv.chars : (CHARACTERS.map((c) => c.id) as CharId[])).map((id) => {
              const c = CHARACTERS.find((x) => x.id === id)
              if (!c) return null
              const bond = bondNow(id)
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="glyph" style={{ '--g': c.hue, width: 26, height: 26 }}>
                    <span style={{ fontSize: 12 }}>{c.sigil}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 12.5 }}>{c.name}</b>
                    <span className="tiny muted" style={{ marginLeft: 6, color: 'var(--ink-faint)' }}>{c.epithet}</span>
                  </span>
                  <span className="tiny mono" style={{ color: 'var(--ink-mute)' }}>{bond}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  ) : null

  /* —— 完结态（全部事件已收束） —— */
  if (!focusEv) {
    return (
      <div className="vpage">
        <div className="vhead">
          <div>
            <div className="vhead__kicker">STORY / DIRECTOR</div>
            <h1>剧情推进</h1>
            <div className="vhead__sub">全部事件已收束。记录与摘录保存在低语者日志。</div>
          </div>
        </div>
        <section className="panel">
          <div className="panel__body" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <b style={{ fontSize: 22 }}>主线与插曲全部推演完毕</b>
            <p className="muted" style={{ maxWidth: 520, lineHeight: 1.9, margin: 0, color: 'var(--ink-mute)' }}>
              已收束 {total} 个事件，写入 {records.length} 条记录。你可以回到低语者日志回顾整个记录流，或重置世界进度重新开始。
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => navigate('saga')}>
                低语者日志 · 记录流 <ArrowRight size={13} weight="bold" />
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('dashboard')}>
                返回终端总览
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const quickReady = !busy && showOnline && ready

  /* —— P6 气泡渲染辅助 —— */
  const opName = operatorName.trim() ? operatorName : '言万心叶'
  /** 把一段正文按「旁白 / 台词气泡」逐段渲染（narr→纯文本行；say→左头像；you→右头像操作员） */
  const segNode = (seg: ReturnType<typeof splitSpeech>[number], key: Key) => {
    if (seg.kind === 'narr') {
      return (
        <div key={key} className={css.narrText}>
          <Linkified text={seg.text} />
        </div>
      )
    }
    if (seg.kind === 'you') {
      return (
        <div key={key} className={css.youRow} data-you="1">
          <Portrait avatarId="operator" size={30} round />
          <div className={css.youMain}>
            <span className={css.opName}>{opName}</span>
            <span className={css.youBubble}>
              <Linkified text={seg.text} />
            </span>
          </div>
        </div>
      )
    }
    const c = personOf(seg.id)
    const hue = c?.hue ?? '#7fb4ff'
    return (
      <div key={key} className={css.sayRow} data-say="1" data-say-for={seg.id}>
        <Portrait avatarId={seg.id} size={30} round />
        <div className={css.sayMain}>
          <span className={css.sayName} style={{ color: hue }}>{c?.name ?? seg.id}</span>
          <span
            className={css.sayBubble}
            style={{ borderColor: `${hue}66`, background: `linear-gradient(150deg, ${hue}24, ${hue}0d)` }}
          >
            <Linkified text={seg.text} />
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">STORY / DIRECTOR</div>
          <h1>剧情推进</h1>
          <div className="vhead__sub">
            以消息推进当前事件：AI 以第三人称「导演 + 在场角色」展开，回执自动落地羁绊与图鉴。也可切到离线通读本段原文后归档。
          </div>
        </div>
        <div className="vhead__right">
          <span className={showOnline ? 'chip chip--on' : 'chip chip--warn'}>
            <span className="chip__dot" /> {modelChip}
          </span>
          <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('lore')} title="世界书：智库页管理命中词条与启用开关">
            世界书
          </button>
          <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('settings')}>
            前往设置
          </button>
        </div>
      </div>

      {lastEnded && lastEnded.id !== focusEv.id ? (
        <div className={css.endedBar}>
          <b>上一事件已收束</b>
          <span>《{lastEnded.title}》· {MODE_LABEL[lastEnded.mode]} · 已写入低语者日志{lastEnded.diverged ? ' · 分歧路线' : ''}</span>
          <span className="muted tiny" style={{ flex: 1 }}>{lastEnded.digest}</span>
          <button className="linkGo" onClick={() => navigate('saga')}>查看记录 <ArrowRight size={11} /></button>
        </div>
      ) : null}

      <div className={css.bar}>
        <div className={css.barMain}>
          <span className="tag">{focusEv.id.toUpperCase()}</span>
          <b>{focusEv.title}</b>
          <span className="muted tiny" style={{ color: 'var(--ink-mute)' }}>
            {focusEv.group} · {focusEv.phase} · {focusEv.place}{focusEv.day ? ` · ${focusEv.day}` : ''}
          </span>
        </div>
        <div className={css.barRight}>
          <span className="chip">{doneCount}/{total} 事件</span>
          <span className="chip">{records.length} 记录</span>
          <div className={css.seg} role="tablist" aria-label="推进方式">
            <button
              className={`${css.segBtn} ${showOnline ? css.isOn : ''}`}
              onClick={() => {
                if (!ready) push('warn', '主线通道未配置', '请先在「设置」中为主线剧情填入接口地址与模型。')
                setMode('online')
              }}
            >
              在线推演
            </button>
            <button
              className={`${css.segBtn} ${!showOnline ? css.isOn : ''}`}
              onClick={() => { stop(); setMode('offline'); setErr(null) }}
            >
              离线通读
            </button>
          </div>
        </div>
      </div>

      <div className={css.layout}>
        <section className="panel" data-session-area="1">
          <div className="panel__head">
            <span className="panel__title">事件会话 <span className="slash" /></span>
            {showOnline ? (
              <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
                {busy ? '推演中…' : activeLog.length ? '回车或按钮发送' : '尚未开始'}
              </span>
            ) : (
              <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>第三人称原文通读</span>
            )}
            {showOnline && activeLog.length > 0 ? (
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={clearThread} title="清空本段会话">
                <Eraser size={13} weight="bold" /> 清空
              </button>
            ) : null}
          </div>

          {showOnline ? (
            <div className={css.onBody}>
              {cfgMain !== undefined && !ready ? (
                <div className={css.warn}>
                  <b>主线通道未配置</b>
                  <span>当前为离线环境。填入接口地址与模型后即可在线推演；或点下方「离线通读」读本段原文。</span>
                  <button className="btn btn--amber" style={{ fontSize: 12 }} onClick={() => navigate('settings')}>
                    前往设置
                  </button>
                </div>
              ) : null}

              {showOnline && ready && !skipAutoOpen.current && activeLog.length === 0 && !busy ? (
                <div className={css.hintLine}>
                  <span className={css.typingDot} /> 正在读取事件大纲并铺陈开场叙述…
                </div>
              ) : null}

              {scene?.choices && showOnline && ready && !alreadyPicked ? (
                <div className={css.quickRow}>
                  <span className="tiny muted" style={{ color: 'var(--ink-faint)', letterSpacing: '0.12em' }}>既定行动</span>
                  {choices.map((ch) => (
                    <button
                      key={ch.key}
                      className={`btn btn--ghost ${css.quick}`}
                      style={{ fontSize: 12 }}
                      disabled={!quickReady}
                      onClick={() => void quickAct(ch.key)}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className={css.thread}>
                {activeLog.length === 0 ? (
                  <div className={css.emptyHint}>
                    <b>{ready ? '从头推演这一事件' : '此段尚无会话'}</b>
                    <span>
                      {ready
                        ? '输入任意消息，导演会依据大纲铺陈局势并由你接续行动；亦可点上方「既定行动」直接走关键抉择。'
                        : '配置主线通道后即可在线推演；当前可切「离线通读」阅读本段原文。'}
                    </span>
                  </div>
                ) : (
                  activeLog.map((m, i) =>
                    m.from === 'them' ? (
                      <div key={m.id} className={m.meta?.opening ? `${css.narr} ${css.open}` : css.narr}>
                        <div className={css.narrMeta}>
                          <b>{m.meta?.opening ? '开场白 · 原文' : '导演叙述'}</b>
                          <span className="muted tiny">{m.time}</span>
                        </div>
                        {splitSpeech(m.text).map((seg, si) => segNode(seg, si))}

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
                            <span className="tiny" style={{ color: 'var(--ink-faint)', letterSpacing: '0.12em' }}>接续选项</span>
                            {m.meta.options.map((op) => (
                              <button
                                key={op}
                                type="button"
                                className={`btn btn--ghost ${css.optChip}`}
                                style={{ fontSize: 12 }}
                                disabled={!quickReady}
                                onClick={() => void pickOption(op)}
                              >
                                {op}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {showOnline && ready && !busy && !m.meta?.opening ? (
                          <div className={css.rowActs}>
                            <button type="button" className="linkGo" onClick={() => rollbackAt(i)}>从此重来</button>
                            {i === activeLog.length - 1 && i > 0 && activeLog[i - 1].from === 'user' && m.meta?.hasFx !== true ? (
                              <button type="button" className="linkGo" onClick={() => void rewriteReply(i)}>重写此回复</button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div key={m.id} className={css.youRow} data-you="1">
                        <Portrait avatarId="operator" size={30} round />
                        <div className={css.youMain}>
                          <span className={css.opName}>{opName}</span>
                          <span className={css.youBubble}>
                            <Linkified text={m.text} />
                          </span>
                          <span className={`muted tiny ${css.youFoot}`}>
                            {m.time}
                            {showOnline && ready && !busy ? (
                              <button type="button" className="linkGo" onClick={() => rollbackAt(i)}>从此重来</button>
                            ) : null}
                          </span>
                        </div>
                      </div>
                    ),
                  )
                )}
                {live && live.evId === focusEv.id && live.text ? (
                  <div className={css.narr} data-stream-live="1">
                    <div className={css.narrMeta}>
                      <b>导演叙述</b>
                      <span className="muted tiny">生成中…</span>
                    </div>
                    <div className={css.narrText}>
                      <Linkified text={extractLiveDisplay(live.text)} />
                    </div>
                  </div>
                ) : null}
                {err ? <div className={css.errLine}>{err}</div> : null}
                {busy && (!live || !live.text) ? <div className={css.thinking}>导演正在编织叙事…</div> : null}
                {needDir.current ? (
                  <div className={css.dirNotice}>
                    <span>上一回未解析到事件指令（叙述已保留）。</span>
                    <button className="linkGo" disabled={busy} onClick={() => void resendDirective()}>要求补发指令</button>
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              {ready ? (
                <>
                  {draftSugg && draftSugg.length ? (
                    <div className={css.draftSugg}>
                      <div className={css.draftSuggHead}>
                        <b>AI 起草 · 言万心叶可说的下一步</b>
                        <button type="button" className="linkGo" onClick={() => setDraftSugg(null)}>收起</button>
                      </div>
                      <div className={css.draftRow}>
                        {draftSugg.map((s, si) => (
                          <button
                            key={si}
                            type="button"
                            className={css.draftOpt}
                            onClick={() => { setDraft(s); setDraftSugg(null); }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {draftErr ? <div className={css.draftErr}>{draftErr}</div> : null}
                  <div className={css.composer}>
                    <input
                      className="field"
                      placeholder={`推进事件：向导演传达言万心叶的行动…（Enter 发送）`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (busy) stop()
                          else void send()
                        }
                      }}
                      disabled={!ready}
                    />
                    <button
                      className={`btn btn--ghost ${css.draftBtn}`}
                      onClick={() => void draftCandidates()}
                      disabled={busy || drafting}
                      aria-label="AI 起草行动候选"
                    >
                      {drafting ? <span className={css.draftSpin} aria-hidden="true" /> : null}
                      <MagicWand size={16} weight="bold" />
                      <span>{drafting ? '起草中…' : 'AI 起草'}</span>
                    </button>
                    {busy ? (
                      <button className={`btn btn--amber ${css.composerBtn}`} onClick={stop} aria-label="中断推演">
                        <Stop size={18} weight="bold" />
                      </button>
                    ) : (
                      <button
                        className={`btn btn--primary ${css.composerBtn}`}
                        onClick={() => void send()}
                        disabled={!draft.trim()}
                        aria-label="发送"
                      >
                        <PaperPlaneTilt size={18} weight="bold" />
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className={css.offBody}>
              {cfgMain !== undefined && !ready ? (
                <div className={css.offNote}>
                  <b>离线通读</b> 主线通道未配置，故按「原剧本逐段直读」模式呈现当前事件的真实原文；读完点下方按钮归档并推进。
                </div>
              ) : null}
              <div className={css.offSummary}>
                <span className="tiny muted" style={{ color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>本段大纲 · 简述</span>
                <p>{focusEv.summary}</p>
              </div>
              {offState.id === focusEv.id && offState.state === 'loading' ? (
                <div className={css.thinking}>正在载入离线原文…</div>
              ) : offState.id === focusEv.id && offState.state === 'miss' ? (
                <div className={css.warn}>
                  <b>本段离线原文未收录</b>
                  <span>{offState.msg ?? '缺少切片文件。'}进度不会卡死——仍可直接归档本段。</span>
                </div>
              ) : (
                <div className={css.offText} data-event={focusEv.id}>
                  {splitSpeech(offState.text).map((seg, si) =>
                    seg.kind === 'narr' ? (
                      <p key={si} className={css.offP}>
                        <Linkified text={seg.text} />
                      </p>
                    ) : (
                      segNode(seg, si)
                    ),
                  )}
                </div>
              )}
              <div className={css.offFoot}>
                <span className="muted tiny" style={{ color: 'var(--ink-faint)' }}>
                  {offState.id === focusEv.id && offState.text ? `本段原文 · 约 ${offState.text.replace(/\s/g, '').length} 字` : '读毕原文后归档'}
                </span>
                <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={finishOffline}>
                  <Check size={14} weight="bold" /> 读毕本段 · 写入记录并推进
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className={css.aside}>
          {eventCard}
        </aside>
      </div>
    </div>
  )
}
