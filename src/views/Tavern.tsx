import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Lock, PaperPlaneTilt, Stop, Eraser, Plus, Check, Trash, UsersThree, ListChecks, X, HeartStraight, MapPin } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TAVERN_PERSONAS, charOf } from '../data/personas'
import { isCharId } from '../data/chars'
import { OPERATOR_ID, genderOf, speakerVariants } from '../data/castmeta'
import { INTIMATE_BOND, SLOT_META } from '../data/intimate'
import { CgSlot } from '../components/CgSlot'
import { Linkified } from '../components/Linkified'
import { Portrait } from '../components/Portrait'
import type { ApiSettings, ChatTurn } from '../lib/api'
import { chatCompletion, chatCompletionStream, isReady, loadProfile } from '../lib/api'
import type { StreamResult } from '../lib/api'
import { clampBudget } from '../lib/budget'
import { cgIdOf, cgNoteOf } from '../lib/cg'
import { clock, bondName } from '../lib/format'
import type { ChatMsg, CharId } from '../data/types'
import {
  applyDirective, dateDirective, extractLiveDisplay, parseDirectorReply, replyDisplayText, smsBondRule, smsDirective,
} from '../lib/plot'
import type { Rendezvous } from '../lib/rendezvous'
import {
  cgListText, dateBondRule, dateCgPalette, dateOpeningPrompt, dropRendezvous, isDateThread,
  listRendezvous, openDateOf, openRendezvous, patchRendezvous, rendezvousPrompt,
  rendezvousVersion, subscribeRendezvous,
} from '../lib/rendezvous'
import { loadActiveBooks } from '../lib/lorestore'
import { allowGateForTavern, buildLoreContext } from '../lib/lorescan'
import { activePresetInfo, buildPresetContext, readActivePreset } from '../lib/preset'
import { loreHitsOf } from '../lib/ailog'
import type { AiLogMeta } from '../lib/ailog'
import type { GroupThread } from '../lib/smsthreads'
import { ensureBuiltinGroups, listGroups, makeGroup, nameOf, storeGroups } from '../lib/smsthreads'
import {
  groupSystemPrompt, isGroupThread, loadSmsLogs, markRead, newMsgId,
  parseGroupReply, smsLogVersion, smsTurns, subscribeSmsLog, subscribeUnread, systemPrompt,
  totalUnread, unreadOf, writeSmsLogs,
} from '../lib/sms'
import { addTask, listTasks, removeTask, subscribeTasks, tasksVersion, toggleTask } from '../lib/smstasks'

import comm from './Comms.module.css'
import css from './Tavern.module.css'

/** 线程 id：单聊就是角色 id，群聊是 g:<uuid>（名册见 lib/smsthreads.ts） */
const idFor = newMsgId

/** 羁绊增量的口语化注记 */
function bondNote(delta: number): string {
  if (delta >= 3) return '聊得火热'
  if (delta >= 1) return '更亲近了一点'
  if (delta <= -3) return '踩到了雷区'
  if (delta <= -1) return '起了点小摩擦'
  return ''
}

export function Tavern() {
  const {
    operatorName, isMet, bondNow, bumpBond, setFlag, navigate, push, epDone, world,
    smsRequest, clearSmsRequest, cgOf, setCg, bumpIntim, meetChar, registerEnd,
  } = useTerminal()
  const [settings, setSettings] = useState<ApiSettings | null>(null)
  const [logs, setLogs] = useState<Record<string, ChatMsg[]>>(loadSmsLogs)
  /* 群聊名册与电话页的两个页签（会话 / 任务） */
  const [groups, setGroups] = useState<GroupThread[]>(listGroups)
  const [tab, setTab] = useState<'chat' | 'tasks'>('chat')
  const [groupPick, setGroupPick] = useState<string[] | null>(null)
  const [groupName, setGroupName] = useState('')
  const [taskDraft, setTaskDraft] = useState('')
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

  /* 内置群聊（恋兔队 / 苍之学园）在这里入册：名册是同步读 localStorage 的，
     启动那一步写在别的页面上也可能还没走过（直接开短信页时），所以这里再兜一次 ——
     播种幂等，走过就不再写盘。 */
  useEffect(() => {
    if (ensureBuiltinGroups()) setGroups(listGroups())
  }, [])

  /* 会话落盘一律经 lib/sms.ts（写入即落盘，不再靠 state 副作用回写）——
     这样观测者切走本页时，后台主动来信与这里的读写走的是同一条路，不会互相覆盖。 */
  const persist = useCallback(
    (mut: (all: Record<string, ChatMsg[]>) => Record<string, ChatMsg[]>) => {
      setLogs(writeSmsLogs(mut(loadSmsLogs())))
    },
    [],
  )
  const setThread = useCallback(
    (id: string, up: (prev: ChatMsg[]) => ChatMsg[]) => {
      persist((all) => ({ ...all, [id]: up(all[id] ?? []) }))
    },
    [persist],
  )

  /* 盘上的会话被别处改过（后台来信）→ 重新读回 */
  const logVer = useSyncExternalStore(subscribeSmsLog, smsLogVersion)
  useEffect(() => { setLogs(loadSmsLogs()) }, [logVer])

  /* 任务列表：与「电话」同页的另一个页签 */
  const taskVer = useSyncExternalStore(subscribeTasks, tasksVersion)
  const tasks = useMemo(() => listTasks(), [taskVer])

  /* 约会名册（lib/rendezvous.ts 的本地档）：与短信同一套路数 —— 写即落盘，
     版本号变了就重读，好让后台主动来信开出来的那一场立刻出现在「约会」一栏。 */
  const [rvs, setRvs] = useState<Rendezvous[]>(listRendezvous)
  const rvVer = useSyncExternalStore(subscribeRendezvous, rendezvousVersion)
  useEffect(() => { setRvs(listRendezvous()) }, [rvVer])
  /** 未走完的那几场（名单与角标只认这些；走完的留在会话里当记录） */
  const liveRvs = useMemo(() => rvs.filter((r) => !r.done), [rvs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs, activeId, busy])

  const metIds = useMemo(() => TAVERN_PERSONAS.map((p) => p.charId).filter((id) => isMet(id)), [isMet])

  /** 选中某个线程（单聊 = 角色 id，群聊 = g:uuid，见面 = d:uuid）。
      新线程是**空的** —— 不再替对方垫一句开场白：
      谁先开口是玩家自己的事，上来就有一条躺着，「初始没有消息」这个前提就没了。
      （见面那一档另说：那一场本来就开场了，由 fireDate 让对面先说话。） */
  const enter = useCallback(
    (threadId: string) => {
      if (!isGroupThread(threadId) && !isDateThread(threadId) && !isMet(threadId)) {
        push('warn', '尚未解锁', '需先在剧情中「遇见」该角色，方可发来第一条短信。')
        return
      }
      setActiveId(threadId)
      setErr(null)
      markRead(threadId)
    },
    [isMet, push],
  )

  // 初次渲染：若已有可聊角色，自动选第一位
  const inited = useRef(false)
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    if (metIds.length > 0) enter(metIds[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metIds])

  /* 跨视图意图：由档案卡 / 出击小队等请求打开某联系人（未遇见则由 enter 提示解锁） */
  const smsReqHandled = useRef(0)
  useEffect(() => {
    if (!smsRequest) return
    if (smsReqHandled.current === smsRequest.ts) return
    smsReqHandled.current = smsRequest.ts
    const id = smsRequest.id
    clearSmsRequest()
    if (TAVERN_PERSONAS.some((p) => p.charId === id)) enter(id)
  }, [smsRequest, clearSmsRequest, enter])

  const activeGroup = activeId && isGroupThread(activeId)
    ? groups.find((g) => g.id === activeId)
    : undefined
  /** 见面那一档（d:uuid）：线程元数据在 lib/rendezvous.ts，人还是那一位 */
  const activeRv = activeId && isDateThread(activeId)
    ? rvs.find((r) => r.id === activeId)
    : undefined
  const activeChar = activeId && !activeGroup ? charOf(activeRv ? activeRv.charId : activeId) : undefined
  const activeMeta = activeId && !activeGroup
    ? TAVERN_PERSONAS.find((p) => p.charId === (activeRv ? activeRv.charId : activeId))
    : undefined
  const activeLog = activeId ? logs[activeId] ?? [] : []
  /** 见面场景此刻摆的那张图：导演点名记在 world.cg[d:uuid] 下（见 fireDate）。
      没点名就不摆 —— 一进来就顶一张图，把开场那两句挤到屏幕外，不划算。 */
  const activeCg = activeRv ? cgOf(activeRv.id) : null
  const activeCgNote = useMemo(() => {
    if (!activeRv || !activeCg) return undefined
    const hit = dateCgPalette(activeRv).find((r) => cgIdOf(r) === activeCg)
    return hit ? cgNoteOf(hit) : undefined
  }, [activeRv, activeCg])
  /** 群里某条发言的作者名（单聊直接取角色名） */
  const whoOf = useCallback(
    (m: ChatMsg): string => m.meta?.who ?? activeChar?.name ?? '群聊',
    [activeChar],
  )
  /** 显示名 → 角色 id：群聊里 meta.who 是名字，而头像要的是素材 id */
  const idOfName = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of speakerVariants()) if (!m.has(v.text)) m.set(v.text, v.id)
    return m
  }, [])
  /** 该条消息挂谁的头像；解析不出就空串（未登记的说话人不硬凑一张脸） */
  const avatarOf = useCallback(
    (m: ChatMsg): string => {
      if (m.from === 'user') return OPERATOR_ID
      if (m.meta?.who) return idOfName.get(m.meta.who) ?? ''
      /* 取 activeChar.id 而不是 activeId：见面线程的 id 是 d:uuid，那是素材里没有的东西 */
      return activeChar?.id ?? ''
    },
    [activeChar, idOfName],
  )
  /** 流式气泡的头像：一对一（含见面）才是此人；群聊是多说话人剧本，落定前不知道谁在说，故留白 */
  const liveAvatarId = activeGroup ? '' : activeChar?.id ?? ''

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
        push('warn', '推演通道未配置', '请先在「终端设置 · 角色短信」中填入接口地址与模型，再回来发消息。')
        navigate('settings')
        return
      }
      setErr(null)
      setBusy(true)

      // 世界书命中注入（仅放行已登记实体 / 已完成事件；失败静默）
      const scanText = smsTurns(log, 10).map((x) => x.content).join('\n')
      let loreBlock = ''
      try {
        const books = await loadActiveBooks()
        if (books.length) {
          loreBlock = buildLoreContext(books, {
            scanText,
            contextText: meta.scenario,
            gate: allowGateForTavern({ epDone, ends: world.ends }),
          })
        }
      } catch {
        loreBlock = ''
      }

      // 预设导演指令（短信侧同样受「管理预设」的生效快照管辖）
      // scope='sms' —— 长文那一支（篇幅 1000–2000 字、段落空行、交战文风…）不往这儿进
      const preset = buildPresetContext(readActivePreset(), scanText, 'sms')

      // 通联日志身份：短信侧这一趟问的是谁
      const presetInfo = activePresetInfo()
      const logMeta: AiLogMeta = {
        channel: '角色短信',
        act: '回信',
        preset: { id: presetInfo.id, name: presetInfo.name, hits: preset.hits, prefill: presetInfo.prefill },
        lore: { chars: loreBlock.length, hits: loreHitsOf(loreBlock) },
      }

      const bond = bondNow(charId)
      const system =
        systemPrompt(charId, operatorName, bond, meta.scenario)
        + (preset.pre ? `\n\n${preset.pre}` : '')
        + (loreBlock ? `\n\n${loreBlock}` : '')
        + (preset.post ? `\n\n${preset.post}` : '')
        + smsBondRule(charId, bond)
      const messages: ChatTurn[] = [{ role: 'system', content: system }, ...smsTurns(log)]

      const ctrl = new AbortController()
      abortRef.current = ctrl
      // 流式：途中只累积并以无副作用投影上屏活气泡；收尾才跑一次解析落地短信效果
      let acc = ''
      let settled = false
      try {
        // 流式开关（终端设置 · 角色短信通道）：关掉即整段接收
        const res: StreamResult = cfg.stream === false
          ? { text: await chatCompletion(cfg, messages, { signal: ctrl.signal, maxTokens: clampBudget(cfg.maxTokens), meta: logMeta }) }
          : await chatCompletionStream(cfg, messages, {
            signal: ctrl.signal,
            maxTokens: clampBudget(cfg.maxTokens),
            meta: logMeta,
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
          const thought = (res.reasoning ?? '').trim()
          const why = res.refusal
            ? `推演通道拒绝作答${res.refusal ? ` · ${res.refusal}` : ''}`
            : res.finishReason === 'length'
              ? (thought
                  ? `通道在内部思考上花费过久（约 ${thought.length} 字）把输出预算耗尽，短信正文为空。可在终端设置调高该通道输出预算后重发。`
                  : '回复已达长度上限，且未产出任何正文。')
              : '通道未返回任何内容。'
          setErr(`收发中断：${why}`)
          push('danger', '短信收发失败', why, false)
          return
        }
        if (res.finishReason === 'length') {
          const shown = extractLiveDisplay(acc).trim()
          if (shown) {
            setThread(charId, (prev) => [...prev, { id: idFor(charId), from: 'them', text: shown, time: clock() }])
          }
          push('warn', '回复已达长度上限', '短信正文可能被截断，本回合未落地任何短信效果。', false)
          return
        }

        // 回执正文照常上屏；JSON 或 <vars> 轻量指令经短信过滤后自动落地羁绊/标记
        const parsed = parseDirectorReply(reply)
        /* 只剥、不回落到原文：回执万一整份就是一块指令（补发那一路正是如此），
           回落到原文等于把 {"bond":…} 原样摊进气泡。没有正文就没有正文 —— 效果照旧落地。 */
        const shown = replyDisplayText(parsed, acc)
        const sd = smsDirective(parsed.directive, charId)
        let sum = 0
        for (const b of sd.bond ?? []) {
          bumpBond(b.char as CharId, b.delta)
          sum += b.delta
        }
        const flags = Object.entries(sd.flag ?? {})
        for (const [k, v] of flags) setFlag(k, v)
        /* 她在信里把人约出去了（羁绊过线才认）：落成一场**待人赴**的见面。
           同一时间只留一场 —— 手边还有没走完的那一场时，这一条不另开。 */
        let invited: Rendezvous | null = null
        if (sd.date && bond >= INTIMATE_BOND && !openDateOf(charId)) {
          invited = openRendezvous(charId, {
            kind: sd.date.kind === 'intimate' ? 'intimate' : 'date',
            title: sd.date.title,
            place: sd.date.place,
            from: 'them',
          })
          setRvs(listRendezvous())
        }
        const hasFx = sum !== 0 || flags.length > 0 || invited !== null
        // 整份回执只有指令、没有正文：不出气泡（空气泡比一坨 JSON 更像坏了），提醒一句就走
        if (!shown) {
          if (hasFx) push('info', '短信效果', `${c.name} · 本回合只有指令、没有正文；效果已落地。`, false)
          return
        }
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
        setThread(charId, (prev) => [...prev, ai])

        if (sum !== 0) {
          push('success', '短信效果', `${c.name} · 羁绊 ${sum > 0 ? '+' : ''}${sum}${bondNote(sum) ? ` · ${bondNote(sum)}` : ''}`, false)
        } else if (flags.length > 0) {
          push('info', '短信效果', `${c.name} · 变量更新：${flags.map(([k]) => k).join('、')}`, false)
        }
        if (invited) {
          push('decode', 'TA 约你出去', `${c.name} · ${invited.title}（${invited.place}）—— 在左侧「约会」一栏应约。`, false)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          settled = true
          // 主动中断：保留已生成的部分上屏，但不落地任何（可能是半截的）短信效果
          const partial = extractLiveDisplay(acc).trim()
          setLive(null)
          if (partial) {
            setThread(charId, (prev) => [...prev, { id: idFor(charId), from: 'them', text: partial, time: clock() }])
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
    [settings, busy, push, navigate, operatorName, bondNow, bumpBond, setFlag, epDone, world.ends, setThread],
  )

  /**
   * 群聊发一轮：一次生成里让一到三位成员开口（提示词已交代格式）。
   * 回复按「【角色名】」拆成一条条发言分别落库、各自带作者名；
   * 轻量指令与单聊同一套过滤 —— flag 与托付照常落地，羁绊只认群成员、逐个按 ±3 收。
   */
  const fireGroup = useCallback(
    async (groupId: string, log: ChatMsg[]) => {
      const g = groups.find((x) => x.id === groupId)
      if (!g || busy) return
      const cfg = settings
      if (!cfg || !isReady(cfg)) {
        push('warn', '推演通道未配置', '请先在「终端设置 · 角色短信」中填入接口地址与模型，再回来发消息。')
        navigate('settings')
        return
      }
      setErr(null)
      setBusy(true)

      const scanText = smsTurns(log, 10, (m) => m.meta?.who).map((x) => x.content).join('\n')
      let loreBlock = ''
      try {
        const books = await loadActiveBooks()
        if (books.length) {
          loreBlock = buildLoreContext(books, {
            scanText,
            contextText: nameOf(g.charIds),
            gate: allowGateForTavern({ epDone, ends: world.ends }),
          })
        }
      } catch {
        loreBlock = ''
      }

      const preset = buildPresetContext(readActivePreset(), scanText, 'sms')
      const presetInfo = activePresetInfo()
      const logMeta: AiLogMeta = {
        channel: '角色短信',
        act: `群聊 · ${g.name}`,
        preset: { id: presetInfo.id, name: presetInfo.name, hits: preset.hits, prefill: presetInfo.prefill },
        lore: { chars: loreBlock.length, hits: loreHitsOf(loreBlock) },
      }
      const bonds = g.charIds.map((id) => `${charOf(id)?.name ?? id} ${bondNow(id)}`).join(' · ')
      const system =
        groupSystemPrompt(g.charIds, g.name, operatorName, bonds, '各自所在的日常，此刻同时看着这一屏')
        + (preset.pre ? `

${preset.pre}` : '')
        + (loreBlock ? `

${loreBlock}` : '')
        + (preset.post ? `

${preset.post}` : '')
        + smsBondRule(g.charIds[0])
      const messages: ChatTurn[] = [{ role: 'system', content: system }, ...smsTurns(log, 12, (m) => m.meta?.who)]

      const ctrl = new AbortController()
      abortRef.current = ctrl
      let acc = ''
      let settled = false
      try {
        const res: StreamResult = cfg.stream === false
          ? { text: await chatCompletion(cfg, messages, { signal: ctrl.signal, maxTokens: clampBudget(cfg.maxTokens), meta: logMeta }) }
          : await chatCompletionStream(cfg, messages, {
            signal: ctrl.signal,
            maxTokens: clampBudget(cfg.maxTokens),
            meta: logMeta,
            onDelta: (chunk) => {
              if (settled || !chunk) return
              acc += chunk
              setLive({ charId: groupId, text: acc })
            },
          })
        settled = true
        setLive(null)

        const reply = (res.text ?? '').trim()
        if (!reply) {
          setErr('收发中断：通道未返回任何内容。')
          push('danger', '短信收发失败', '通道未返回任何内容。', false)
          return
        }
        const parsed = parseDirectorReply(reply)
        // 同上：只剥、不回落到原文。群回执整份只有指令时，拆行结果自然为空 —— 一条不发。
        const shown = replyDisplayText(parsed, acc)
        const lines = parseGroupReply(shown, g.charIds)

        // 轻量指令：flag 与托付照常；羁绊只认群成员，逐个按 ±3 收
        const sd = smsDirective(parsed.directive, '')
        const bondFx: { name: string; delta: number }[] = []
        for (const b of parsed.directive?.bond ?? []) {
          if (!g.charIds.includes(b.char)) continue
          const delta = Math.max(-3, Math.min(3, Math.round(b.delta)))
          if (!delta) continue
          bumpBond(b.char, delta)
          bondFx.push({ name: charOf(b.char)?.name ?? b.char, delta })
        }
        const flags = Object.entries(sd.flag ?? {})
        for (const [k, v] of flags) setFlag(k, v)
        const newTasks = parsed.directive?.task ?? []
        const speakerId = lines.find((l) => l.who)?.who
        /* 托付的「来自谁」照旧只认主役那四位（SmsTask.from 是 CharId，电话页那枚头像照它取立绘）。
           群里由会长或副官托付时，落到第一位主役成员名下 —— 是谁说的，正文里写着，不丢。 */
        const spoke = speakerId ? g.charIds.find((id) => charOf(id)?.name === speakerId) : undefined
        const from = (spoke && isCharId(spoke) ? spoke : g.charIds.find(isCharId))
        for (const task of newTasks) addTask(task.title, { detail: task.detail, ...(from ? { from } : {}) })

        const hasFx = bondFx.length > 0 || flags.length > 0 || newTasks.length > 0
        for (const line of lines) {
          setThread(groupId, (prev) => [...prev, {
            id: idFor(groupId),
            from: 'them',
            text: line.text,
            time: clock(),
            ...(line.who ? { meta: { who: line.who } } : {}),
          }])
        }
        // 世界效果记在最后一条上：决定这条回复能不能被「重写」
        if (hasFx) {
          setThread(groupId, (prev) => {
            const next = prev.slice()
            const last = next[next.length - 1]
            if (last && last.from === 'them') {
              next[next.length - 1] = { ...last, meta: { ...(last.meta ?? {}), hasFx: true } }
            }
            return next
          })
        }

        const fxParts: string[] = []
        if (bondFx.length) fxParts.push(bondFx.map((b) => `${b.name} ${b.delta > 0 ? '+' : ''}${b.delta}`).join(' · '))
        if (flags.length) fxParts.push(`变量更新：${flags.map(([k]) => k).join('、')}`)
        if (newTasks.length) fxParts.push(`托付 ${newTasks.length} 件`)
        if (fxParts.length) push('info', `群聊 · ${g.name}`, fxParts.join(' · '), false)
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          settled = true
          const partial = extractLiveDisplay(acc).trim()
          setLive(null)
          for (const line of parseGroupReply(partial, g.charIds)) {
            setThread(groupId, (prev) => [...prev, {
              id: idFor(groupId), from: 'them', text: line.text, time: clock(),
              ...(line.who ? { meta: { who: line.who } } : {}),
            }])
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
    [settings, busy, groups, push, navigate, operatorName, bondNow, bumpBond, setFlag, epDone, world.ends, setThread],
  )

  /**
   * 见面发一轮（约会线程，id 形如 `d:uuid`）。
   *
   * 与短信那条的分工：人已经**在眼前**了，所以放得开 ——
   *   · 羁绊一次 ±5（一条短信只有 ±3）；
   *   · 可点名场景 CG（换画面时点一张，记在这一场名下）；
   *   · **只有这一路能推进私密档案**（intim）—— 身体上的事发生在见面时，不在打字里。
   * 反过来也收着：**不动主线** —— 不判 eventDone、不写记录、不推卷次（见 dateDirective）。
   */
  const fireDate = useCallback(
    async (rvId: string, log: ChatMsg[]) => {
      const rv = listRendezvous().find((x) => x.id === rvId)
      if (!rv || busy) return
      const charId = rv.charId
      const c = charOf(charId)
      const meta = TAVERN_PERSONAS.find((p) => p.charId === charId)
      if (!c || !meta) return
      const cfg = settings
      if (!cfg || !isReady(cfg)) {
        push('warn', '推演通道未配置', '请先在「终端设置 · 角色短信」中填入接口地址与模型，再回来赴约。')
        navigate('settings')
        return
      }
      setErr(null)
      setBusy(true)

      const scanText = smsTurns(log, 10).map((x) => x.content).join('\n')
      let loreBlock = ''
      try {
        const books = await loadActiveBooks()
        if (books.length) {
          loreBlock = buildLoreContext(books, {
            scanText,
            contextText: `${rv.title} · ${rv.place}`,
            gate: allowGateForTavern({ epDone, ends: world.ends }),
          })
        }
      } catch {
        loreBlock = ''
      }

      const preset = buildPresetContext(readActivePreset(), scanText, 'sms')
      const presetInfo = activePresetInfo()
      const logMeta: AiLogMeta = {
        channel: '角色见面',
        act: `见面 · ${c.name}`,
        preset: { id: presetInfo.id, name: presetInfo.name, hits: preset.hits, prefill: presetInfo.prefill },
        lore: { chars: loreBlock.length, hits: loreHitsOf(loreBlock) },
      }

      const bond = bondNow(charId)
      const system =
        rendezvousPrompt(charId, operatorName, bond, rv, cgListText(dateCgPalette(rv)))
        + (preset.pre ? `\n\n${preset.pre}` : '')
        + (loreBlock ? `\n\n${loreBlock}` : '')
        + (preset.post ? `\n\n${preset.post}` : '')
        + dateBondRule(charId)
      const turns = smsTurns(log, 12)
      /* 空线程 = 这一场刚开场：不给它留白，直接让对面把第一句说出来
         （谁先开的口由 rv.from 决定，措辞见 lib/rendezvous.ts 的 dateOpeningPrompt） */
      if (!turns.length) turns.push({ role: 'user', content: dateOpeningPrompt(rv) })
      const messages: ChatTurn[] = [{ role: 'system', content: system }, ...turns]

      const ctrl = new AbortController()
      abortRef.current = ctrl
      let acc = ''
      let settled = false
      try {
        const res: StreamResult = cfg.stream === false
          ? { text: await chatCompletion(cfg, messages, { signal: ctrl.signal, maxTokens: clampBudget(cfg.maxTokens), meta: logMeta }) }
          : await chatCompletionStream(cfg, messages, {
            signal: ctrl.signal,
            maxTokens: clampBudget(cfg.maxTokens),
            meta: logMeta,
            onDelta: (chunk) => {
              if (settled || !chunk) return
              acc += chunk
              setLive({ charId: rv.id, text: acc })
            },
          })
        settled = true
        setLive(null)

        const reply = (res.text ?? '').trim()
        if (!reply) {
          setErr('收发中断：通道未返回任何内容。')
          push('danger', '见面推演失败', '通道未返回任何内容。', false)
          return
        }
        if (res.finishReason === 'length') {
          const short = extractLiveDisplay(acc).trim()
          if (short) setThread(rv.id, (prev) => [...prev, { id: idFor(rv.id), from: 'them', text: short, time: clock() }])
          push('warn', '回复已达长度上限', '这一回合被截断了，本回合未落地任何推进。', false)
          return
        }

        const parsed = parseDirectorReply(reply)
        const shown = replyDisplayText(parsed, acc)
        const fx = applyDirective(dateDirective(parsed.directive, charId), {
          meetChar, bumpBond, registerEnd, setFlag, bumpIntim,
        })
        // 换画面：点名的 CG 记在**这一场**名下（world.cg[d:uuid]），与主线那本账各存各的
        if (fx.cg) setCg(rv.id, fx.cg)
        // 这一场自己认领名目与地点：模型给出了更好的就地改写（第一次推进私密时顺带抬档位）
        const patch: Parameters<typeof patchRendezvous>[1] = {}
        if (fx.date?.title?.trim()) patch.title = fx.date.title.trim()
        if (fx.date?.place?.trim()) patch.place = fx.date.place.trim()
        if (fx.date?.kind === 'intimate') patch.kind = 'intimate'
        if (fx.intim.length) patch.kind = 'intimate'
        if (Object.keys(patch).length) {
          patchRendezvous(rv.id, patch)
          setRvs(listRendezvous())
        }
        const newTasks = parsed.directive?.task ?? []
        for (const t of newTasks) addTask(t.title, { detail: t.detail, ...(isCharId(charId) ? { from: charId } : {}) })
        const hasFx = fx.bonds.length > 0 || fx.flags.length > 0 || fx.met.length > 0
          || fx.ends.length > 0 || fx.intim.length > 0 || Boolean(fx.cg) || newTasks.length > 0

        // 整份回执只有指令、没有正文：不出气泡（空气泡比一坨 JSON 更像坏了），提醒一句就走
        if (!shown) {
          if (hasFx) push('info', '见面的推进', `${c.name} · 本回合只有指令、没有正文；效果已落地。`, false)
          return
        }
        setThread(rv.id, (prev) => [...prev, {
          id: idFor(rv.id),
          from: 'them',
          text: shown,
          time: clock(),
          meta: {
            source: parsed.source,
            options: parsed.options.length ? parsed.options : undefined,
            thinking: parsed.thinking || undefined,
            hasFx,
          },
        }])

        const fxParts: string[] = []
        const sum = fx.bonds.reduce((n, b) => n + b.delta, 0)
        if (sum !== 0) fxParts.push(`羁绊 ${sum > 0 ? '+' : ''}${sum}${bondNote(sum) ? ` · ${bondNote(sum)}` : ''}`)
        if (fx.flags.length) fxParts.push(`变量更新：${fx.flags.map(([k]) => k).join('、')}`)
        if (fx.met.length) fxParts.push(`遇见 ${fx.met.length} 位`)
        if (fx.ends.length) fxParts.push(`图鉴 ${fx.ends.length} 条`)
        if (newTasks.length) fxParts.push(`托付 ${newTasks.length} 件`)
        if (fx.cg) fxParts.push('换了画面')
        if (fxParts.length) push('success', '见面的推进', `${c.name} · ${fxParts.join(' · ')}`, false)
        if (fx.intim.length) {
          const parts = fx.intim.map((x) => SLOT_META[x.slot].label).join('、')
          push('decode', '私密档案 · 有更新', `${c.name} · ${parts} —— 角色档案的「私密档案」一栏可见。`, false)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          settled = true
          const partial = extractLiveDisplay(acc).trim()
          setLive(null)
          if (partial) setThread(rv.id, (prev) => [...prev, { id: idFor(rv.id), from: 'them', text: partial, time: clock() }])
          return
        }
        settled = true
        setLive(null)
        const msg = e instanceof Error ? e.message : String(e)
        setErr(`收发中断：${msg}`)
        push('danger', '见面推演失败', msg, false)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [
      settings, busy, push, navigate, operatorName, bondNow, bumpBond, setFlag, epDone, world.ends, setThread,
      meetChar, registerEnd, bumpIntim, setCg,
    ],
  )

  /** 发一轮：单聊 / 群聊 / 见面各走各的生成路径，界面只认这一个入口 */
  const runTurn = useCallback(
    (threadId: string, log: ChatMsg[]) =>
      isDateThread(threadId)
        ? fireDate(threadId, log)
        : isGroupThread(threadId) ? fireGroup(threadId, log) : fire(threadId, log),
    [fire, fireGroup, fireDate],
  )

  /**
   * 赴一场：切到这条线程，**没开场就让它开场**。
   * 一进来就凭空生出几句对白很怪，所以开场那一下是问一次推演通道 ——
   * 由对面照着两个人的交情把第一句说出来，此后就照常一来一往。
   */
  const enterDate = useCallback(
    async (rv: Rendezvous) => {
      setTab('chat')
      enter(rv.id)
      if ((loadSmsLogs()[rv.id] ?? []).length === 0) await fireDate(rv.id, [])
    },
    [enter, fireDate],
  )

  /** 操作员主动约：先开一场空见面（名目待定），由对面开口时自己认领 */
  const startDate = useCallback(
    async (charId: string) => {
      const c = charOf(charId)
      if (!c) return
      if (bondNow(charId) < INTIMATE_BOND) {
        push('warn', '还约不出来', `${c.name} 与你的羁绊到 ${INTIMATE_BOND} 才愿意单独见面（当前 ${bondNow(charId)}/100）。`)
        return
      }
      const open = openDateOf(charId)
      if (open) {
        push('info', '已经约着了', `${c.name} · ${open.title}（${open.place}）—— 先把这一场走完。`, false)
        await enterDate(open)
        return
      }
      const rv = openRendezvous(charId, { from: 'you', title: '一次见面', place: '学园外' })
      setRvs(listRendezvous())
      push('decode', '约了 TA', `${c.name} —— 名目还没定，看对面怎么接。`, false)
      await enterDate(rv)
    },
    [bondNow, push, enterDate],
  )

  /** 收场：这一场到此为止（线程留着当记录，名单上不再挂着） */
  const endDate = useCallback(() => {
    if (!activeRv) return
    patchRendezvous(activeRv.id, { done: true })
    setRvs(listRendezvous())
    push('info', '这一场走完了', `${charOf(activeRv.charId)?.name ?? activeRv.charId} · ${activeRv.title}`, false)
  }, [activeRv, push])

  const send = async () => {
    const text = draft.trim()
    if (!activeId || busy || !text) return
    setDraft('')
    const mine: ChatMsg = { id: idFor(activeId), from: 'user', text, time: clock() }
    const nextLog = [...activeLog, mine]
    setLogs((prev) => ({ ...prev, [activeId]: nextLog }))
    await runTurn(activeId, nextLog)
  }

  /** 重写末条回复（仅当末条为角色回复、上一条是操作员发言、且该回复无世界效果） */
  const rewriteLast = async (i: number) => {
    if (!activeId || busy || i !== activeLog.length - 1) return
    const prev = activeLog[i - 1]
    if (!prev || prev.from !== 'user') return
    const trimmed = activeLog.slice(0, i)
    setLogs((lg) => ({ ...lg, [activeId]: (lg[activeId] ?? []).slice(0, i) }))
    setErr(null)
    await runTurn(activeId, trimmed)
  }

  /** 点击「接续选项」→ 当作操作员发言发出 */
  const pickOptionText = async (text: string) => {
    const t = (text ?? '').trim()
    if (!activeId || busy || !t) return
    const mine: ChatMsg = { id: idFor(activeId), from: 'user', text: t, time: clock() }
    const nextLog = [...activeLog, mine]
    setLogs((prev) => ({ ...prev, [activeId]: nextLog }))
    await runTurn(activeId, nextLog)
  }

  const stop = () => {
    // 只中断：busy 交给 fire 的 finally 统一收口
    abortRef.current?.abort()
  }

  const clearThread = () => {
    if (!activeId) return
    const id = activeId
    if (isGroupThread(id)) {
      const next = groups.filter((g) => g.id !== id)
      setGroups(next)
      storeGroups(next)
      setActiveId(null)
    }
    // 见面线程清空 = 这一场作罢：名册上的那一条一并撤掉，别留个点不开的空壳
    if (isDateThread(id)) {
      dropRendezvous(id)
      setRvs(listRendezvous())
      setActiveId(null)
    }
    persist((all) => {
      const next = { ...all }
      delete next[id]
      return next
    })
    setErr(null)
    const what = isGroupThread(id) ? '本群已解散' : isDateThread(id) ? '这一场作罢' : '本线程已清空'
    const sub = isGroupThread(id) ? '群聊记录一并清除。'
      : isDateThread(id) ? '见面记录与名册上的那一条一并清除。'
        : '线程回到一条消息都没有的状态。'
    push('info', what, sub, false)
  }

  /** 会话页签上的未读数：后台来信也会让它立刻变 */
  const unreadTotal = useSyncExternalStore(subscribeUnread, totalUnread)
  const pending = tasks.filter((t) => !t.done).length

  const linkState = !settings
    ? '读取本地设置…'
    : !isReady(settings)
      ? '推演通道未配置'
      : `已接入 · ${settings.model}`

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">SMS / CHARACTER CHAT</div>
          <h1>角色短信</h1>
          <div className="vhead__sub">
            名册即角色档案的全员，解锁口径也与档案一致 —— 剧情里「遇见」过的才发得出去，其余在名册上挂着锁。
            人格取自各自的分层人物卡（逐字考据的外貌 / 性格 / 说话方式 / 关系…），回复由你在终端设置里配好的推演通道生成；
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
                {/* 电话左栏：会话 / 任务 两个页签 */}
        <aside className={`panel ${comm.contactList}`}>
          <div className={css.tabs}>
            <button
              className={`${css.tab} ${tab === 'chat' ? css.tabOn : ''}`}
              onClick={() => setTab('chat')}
              data-sms-tab="chat"
            >
              会话{unreadTotal > 0 ? <i className={css.tabDot}>{unreadTotal}</i> : null}
            </button>
            <button
              className={`${css.tab} ${tab === 'tasks' ? css.tabOn : ''}`}
              onClick={() => setTab('tasks')}
              data-sms-tab="tasks"
            >
              <ListChecks size={13} weight="bold" /> 任务{pending > 0 ? <i className={css.tabDot}>{pending}</i> : null}
            </button>
          </div>

          {tab === 'chat' ? (
            <>
              <div className={comm.listBody}>
                {TAVN_ALL.map((pid) => {
                  const c = charOf(pid)
                  const meta = TAVERN_PERSONAS.find((p) => p.charId === pid)
                  if (!c || !meta) return null
                  const met = metIds.includes(pid)
                  const bond = bondNow(pid)
                  const isActive = activeId === pid
                  const un = unreadOf(pid)
                  return (
                    <button
                      key={pid}
                      className={`${comm.contact} ${isActive ? comm.isActive : ''}`}
                      onClick={() => enter(pid)}
                      style={{ opacity: met ? 1 : 0.55 }}
                    >
                      {/* 遇见过的用真头像；没遇见的照旧只有一枚纹章 —— 与档案/剧情同口径：
                          未遇见的人不露脸（见 Saga 的登场人物行） */}
                      {met ? (
                        <Portrait avatarId={pid} name={c.name} hue={c.hue} sigil={c.sigil} size={40} round />
                      ) : (
                        <span className="glyph" style={{ '--g': c.hue, width: 40, height: 40 }}>
                          <span>{c.sigil}</span>
                        </span>
                      )}
                      <span className={comm.contactMain}>
                        <span className={css.castName}>
                          {c.name}
                          {!met ? <Lock size={12} weight="bold" /> : null}
                          {un > 0 ? <i className={css.unreadDot}>{un > 99 ? '99+' : un}</i> : null}
                        </span>
                        {met ? (
                          <>
                            <span className={css.castSub}>{c.role}</span>
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

                <div className={css.sectHead}>
                  <span><UsersThree size={13} weight="bold" /> 群聊</span>
                  <button className={css.sectBtn} onClick={() => { setGroupPick([]); setGroupName('') }} data-sms-newgroup>
                    <Plus size={12} weight="bold" /> 新建
                  </button>
                </div>
                {groups.length === 0 ? (
                  <span className="muted tiny" style={{ padding: '2px 8px 8px', lineHeight: 1.7, color: 'var(--ink-faint)' }}>
                    把两三位已遇见的角色拉进一个群，回执会按「谁在说话」分行落成各自的发言。
                  </span>
                ) : null}
                {groups.map((g) => {
                  const un = unreadOf(g.id)
                  return (
                    <button
                      key={g.id}
                      className={`${comm.contact} ${activeId === g.id ? comm.isActive : ''}`}
                      onClick={() => enter(g.id)}
                    >
                      <span className="glyph" style={{ '--g': 205, width: 40, height: 40 }}>
                        <span>群</span>
                      </span>
                      <span className={comm.contactMain}>
                        <span className={css.castName}>
                          {g.name}
                          {un > 0 ? <i className={css.unreadDot}>{un > 99 ? '99+' : un}</i> : null}
                        </span>
                        <span className={css.castSub}>
                          {g.charIds.map((id) => charOf(id)?.name ?? id).join('、')}
                        </span>
                      </span>
                    </button>
                  )
                })}

                {/* 约会：主线之外另开的那条线（见 lib/rendezvous.ts）。
                    羁绊过 INTIMATE_BOND 才约得动；对面先开口的那几条在这里等人赴。 */}
                <div className={css.sectHead}>
                  <span><HeartStraight size={13} weight="bold" /> 约会</span>
                  {liveRvs.length ? <span className="muted tiny">{liveRvs.length} 场未完</span> : null}
                </div>
                {liveRvs.length === 0 ? (
                  <span className="muted tiny" style={{ padding: '2px 8px 8px', lineHeight: 1.7, color: 'var(--ink-faint)' }}>
                    羁绊到 {INTIMATE_BOND} 之后，可以在单聊右上角把对方约出来；对方也可能自己在信里开口。
                  </span>
                ) : null}
                {liveRvs.map((rv) => {
                  const c = charOf(rv.charId)
                  const un = unreadOf(rv.id)
                  return (
                    <button
                      key={rv.id}
                      className={`${comm.contact} ${activeId === rv.id ? comm.isActive : ''}`}
                      onClick={() => void enterDate(rv)}
                      data-sms-date={rv.kind}
                    >
                      {c ? <Portrait avatarId={rv.charId} name={c.name} hue={c.hue} sigil={c.sigil} size={40} round /> : null}
                      <span className={comm.contactMain}>
                        <span className={css.castName}>
                          {c?.name ?? rv.charId}
                          {rv.kind === 'intimate' ? <HeartStraight size={12} weight="fill" /> : null}
                          {un > 0 ? <i className={css.unreadDot}>{un > 99 ? '99+' : un}</i> : null}
                        </span>
                        <span className={css.castSub}>
                          {rv.title}
                          {rv.from === 'them' ? ' · TA 约的你' : ''}
                        </span>
                        <span className={css.castSub} style={{ color: 'var(--ink-faint)' }}>
                          <MapPin size={10} weight="bold" /> {rv.place}
                        </span>
                      </span>
                    </button>
                  )
                })}

                <span className="muted tiny" style={{ padding: '6px 8px', lineHeight: 1.7, color: 'var(--ink-faint)' }}>
                  回复由外部推演通道生成，非内置脚本。请勿在其中输入真实敏感信息。
                </span>
              </div>
              <div className="panel__body" style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
                <span className="tiny muted">联系人按「遇见解锁」变量点亮；没在眼前这段事件里的角色，也会自己发消息过来。</span>
              </div>
            </>
          ) : (
            <>
              <div className="panel__head">
                <span className="panel__title">托付 <span className="slash" /></span>
                <span className="muted tiny" style={{ marginLeft: 'auto' }}>{pending} 件未完成</span>
              </div>
              <div className={comm.listBody} data-sms-tasks>
                <input
                  className="field"
                  style={{ margin: '2px 8px 6px', width: 'auto' }}
                  placeholder="添一件要办的事…（Enter 记下）"
                  value={taskDraft}
                  onChange={(e) => setTaskDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (taskDraft.trim()) addTask(taskDraft)
                    setTaskDraft('')
                  }}
                />
                {tasks.length === 0 ? (
                  <span className="muted tiny" style={{ padding: '2px 8px', lineHeight: 1.7, color: 'var(--ink-faint)' }}>
                    还没有人托付你什么。角色在短信里正经交代要办的事，会落在这里 —— 闲聊与问候不会。
                  </span>
                ) : null}
                {tasks.map((t) => (
                  <div key={t.id} className={`${css.taskRow} ${t.done ? css.taskDone : ''}`} data-sms-task>
                    <button
                      className={css.taskBox}
                      onClick={() => toggleTask(t.id)}
                      aria-label={t.done ? '标为未完成' : '标为已完成'}
                    >
                      {t.done ? <Check size={12} weight="bold" /> : null}
                    </button>
                    <span className={css.taskMain}>
                      <b>{t.title}</b>
                      {t.detail ? <span className={css.taskDetail}>{t.detail}</span> : null}
                      {t.from ? <span className={css.taskFrom}>{charOf(t.from)?.name ?? t.from} 交代</span> : null}
                    </span>
                    <button className={css.taskDel} onClick={() => removeTask(t.id)} aria-label="删除这条">
                      <Trash size={13} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="panel__body" style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
                <span className="tiny muted">这一页只管手边的小事，不进世界状态；主线仍看「任务简报」。</span>
              </div>
            </>
          )}
        </aside>

        {/* 对谈区 */}
        <section className={`panel ${comm.chatPane}`}>
          {activeId && activeChar && activeMeta ? (
            <>
              <div className={comm.chatHead}>
                {/* 群聊没有一张脸可摆（成员各有各的），照旧用「群」字纹章 */}
                {activeGroup ? (
                  <span className="glyph" style={{ '--g': 205, width: 44, height: 44 }}>
                    <span>群</span>
                  </span>
                ) : (
                  <Portrait
                    avatarId={activeChar.id} name={activeChar.name} hue={activeChar.hue} sigil={activeChar.sigil}
                    size={44} round
                  />
                )}
                <div className={comm.chatHeadMeta}>
                  <b>
                    {activeGroup ? activeGroup.name : activeChar.name}{' '}
                    <span className={css.scenarioTag}>{activeRv ? '· 见面' : '· 在线'}</span>
                  </b>
                  <small>
                    {activeGroup
                      ? activeGroup.charIds.map((id) => charOf(id)?.name ?? id).join('、')
                      : activeRv
                        ? `${activeRv.title} · ${activeRv.place}`
                        : activeMeta.scenario}
                  </small>
                </div>
                <span className={comm.channelTag}>
                  {activeRv ? 'DATE' : activeGroup ? 'GROUP' : 'SMS'} ·{' '}
                  {activeGroup ? activeGroup.charIds.length : activeChar.id.toUpperCase()}
                </span>
                {/* 约得动才亮：羁绊没到 INTIMATE_BOND，这一枚不出现（免得点了才知道不行） */}
                {!activeGroup && !activeRv && bondNow(activeChar.id) >= INTIMATE_BOND ? (
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 11, padding: '6px 10px' }}
                    onClick={() => void startDate(activeChar.id)}
                    title="把 TA 约出来单独见一面"
                    data-sms-invite
                  >
                    <HeartStraight size={13} weight="bold" /> 约 TA
                  </button>
                ) : null}
                {activeRv && !activeRv.done ? (
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 11, padding: '6px 10px' }}
                    onClick={endDate}
                    title="这一场到此为止"
                    data-sms-enddate
                  >
                    <Check size={13} weight="bold" /> 散场
                  </button>
                ) : null}
                <button className="btn btn--ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={clearThread} title="清空本线程">
                  <Eraser size={13} weight="bold" /> 清空
                </button>
              </div>

              <div className={comm.thread} data-sms-thread>
                <div className={comm.dayLabel}>
                  {activeRv ? `${activeRv.place} · ${activeRv.title}` : '苍之学园 · 今日 · 角色短信'}
                </div>
                {activeCg ? (
                  <div className={css.threadCg}>
                    <CgSlot cgId={activeCg} caption={activeCgNote} ratio="3 / 2" />
                  </div>
                ) : null}
                {activeLog.length === 0 && !busy ? (
                  <div className={css.threadEmpty} data-sms-empty>
                    {activeRv
                      ? '还没人开口。'
                      : '本线程还没有消息 —— 先说点什么过去，或者等对方先开口。'}
                  </div>
                ) : null}
                {activeLog.map((m, i) => (
                  <Fragment key={m.id}>
                    <div className={`${comm.msg} ${m.from === 'user' ? comm['msg--user'] : comm['msg--them']}`} data-sms-msg={m.from}>
                      <span className={comm.msgHead}>
                        {avatarOf(m) ? <Portrait avatarId={avatarOf(m)} size={26} round /> : null}
                        <span className={comm.msgAuthor}>{m.from === 'them' ? whoOf(m) : operatorName}</span>
                      </span>
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
                    <span className={comm.msgHead}>
                      {liveAvatarId ? <Portrait avatarId={liveAvatarId} size={26} round /> : null}
                      <span className={comm.msgAuthor}>{activeGroup ? '群聊' : activeChar.name}</span>
                    </span>
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
                  placeholder={`${
                    activeGroup ? `在「${activeGroup.name}」里说…`
                      : activeRv ? `面对着 ${activeChar.name} 说…`
                        : `给 ${activeChar.name} 发消息…`
                  }（Enter 发送）`}
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
                解锁后，于「终端设置 · 角色短信」中填好接口地址与模型，即可开始推演对话。
              </div>
            </div>
          )}
        </section>
      </div>

      {groupPick !== null ? (
        <div className={css.modal} data-sms-groupmodal>
          <div className={css.modalCard}>
            <div className={css.modalHead}>
              <b>新建群聊</b>
              <button className={css.modalX} onClick={() => setGroupPick(null)} aria-label="关闭">
                <X size={14} weight="bold" />
              </button>
            </div>
            <div className={css.modalNote}>
              只列已「遇见」的角色。群里至少两位，回执会让其中一到三位开口。
            </div>
            <input
              className="field"
              placeholder="群名（留空就按成员名拼）"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <div className={css.pickList}>
              {metIds.length === 0 ? (
                <span className="muted tiny" style={{ lineHeight: 1.7 }}>
                  还没有可拉进群的角色 —— 先去剧情里遇见几位。
                </span>
              ) : null}
              {metIds.map((id) => {
                const c = charOf(id)
                if (!c) return null
                const on = groupPick.includes(id)
                return (
                  <button
                    key={id}
                    className={`${css.pickRow} ${on ? css.pickOn : ''}`}
                    onClick={() =>
                      setGroupPick((prev) =>
                        (prev ?? []).includes(id) ? (prev ?? []).filter((x) => x !== id) : [...(prev ?? []), id],
                      )
                    }
                  >
                    <Portrait avatarId={id} name={c.name} hue={c.hue} sigil={c.sigil} size={26} round />
                    <span>{c.name}</span>
                    {on ? <Check size={13} weight="bold" /> : null}
                  </button>
                )
              })}
            </div>
            <div className={css.modalFoot}>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setGroupPick(null)}>
                取消
              </button>
              <button
                className="btn btn--primary"
                style={{ fontSize: 12 }}
                disabled={groupPick.length < 2}
                onClick={() => {
                  const g = makeGroup(groupPick as CharId[], groupName)
                  const next = [...groups, g]
                  setGroups(next)
                  storeGroups(next)
                  setGroupPick(null)
                  setGroupName('')
                  enter(g.id)
                  push('info', '群聊已建立', `${g.name} · ${g.charIds.length} 人。第一句由你起头。`, false)
                }}
              >
                建群（{groupPick.length}）
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const TAVN_ALL = TAVERN_PERSONAS.map((p) => p.charId)
