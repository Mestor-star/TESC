/* ============================================================
   约会专线（components/DateLane.tsx）
   ------------------------------------------------------------
   主人把这一档的形态重新定过一次：**约会不是短信页里挂出来的一条线程**，
   它是「在线推演」里另开的一路 —— 平时进不去，只有**事件指令开出来的一场**
   才让它出现；进去了，生成框右边才长出那一栏（正常一面是「这一场」，
   翻转过来是色情状态栏）。

   所以这个组件的地位是**一条车道**，不是一张卡片：
     · 入口在 views/Plot.tsx 的段头（有未散场的一场才摆那一枚），
       以及 Terminal 的 `requestDate()` —— 短信或正文里聊成一场时由它跳过来；
     · 车道本体自成一体：会话流、输入框、生成、落地、右栏全在这儿，
       与短信那一套**不共用任何 state**（只共用同一本会话账 `lib/sms.ts`，
       因为线程 id 还是 `d:<uuid>` —— 存档、未读照旧复用）。
       **会话流只与在线推演共用**（`components/PlotFlow.tsx`）：写出来的是正文剧情
       推演（第三人称叙述 + 「」对白），不是短信那种一来一往的气泡。

   为什么从 views/Tavern.tsx 搬过来：那一版把约会塞在短信页里，右栏一挂
   看着就像「短信旁边加了个侧边栏」。规矩是**移到在线推演**，那就得连人带账
   一起搬，不能只改个位置。

   **不能直接点一下把她约出来**（主人原话）—— 这一版没有「约 TA」按钮了：
   开一场的路只有两条，都在**对话**里：短信里对方先开口、或推演回执里给出
   `date` 指令（两条都走 `dateReady`：时间与地点都说定才算数，见 lib/plot.ts）。
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Eraser, HeartStraight, UsersThree, X } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TAVERN_PERSONAS, charOf } from '../data/personas'
import { isCharId } from '../data/chars'
import { PERSON_IDS } from '../data/castmeta'
import { hasIntimate, INTIMATE_BOND, intimAdvanceLabel } from '../data/intimate'
import { attireAdvanceLabel } from '../data/attire'
import { relName } from '../data/rel'
import { plotContextFor } from '../lib/crosslink'
import { Portrait } from './Portrait'
/* 会话流那一套壳（旁白块 / 台词框 / 推演折叠 / 接续选项 / 输入带）与**在线推演
   同一份** —— 主人定的：两边原模原样，只有右栏与里面的内容不一样。
   排法住在 components/PlotFlow.tsx，样式用的就是 views/Plot.module.css 本身。 */
import {
  Composer, EmptyHint, MsgEditChip, MsgEditor, NarrBlock, OptRow, RowActs, ThinkFold, Thinking, YouFrame,
  editedOf, opNameOf,
} from './PlotFlow'
import { CgSlot } from './CgSlot'
import { Galgame } from './Galgame'
import { IntimateHud } from './IntimateHud'
import { DateSide } from './DateSide'
import type { ApiSettings, ChatTurn, StreamResult } from '../lib/api'
import { chatCompletion, chatCompletionStream, isReady, loadProfile } from '../lib/api'
import { clampBudget } from '../lib/budget'
import { cgDirOf, cgFileOf, cgIdOf, cgNoteOf, cgVariantId, cgVariantsOf } from '../lib/cg'
import { clock } from '../lib/format'
import { inkOf } from '../lib/hue'
import type { ChatMsg } from '../data/types'
import {
  applyDirective, dateDirective, extractLiveDisplay, lookContract, parseDirectorReply, replyDisplayText,
  speechContract,
} from '../lib/plot'
import { applyLooks } from '../lib/look'
import type { Rendezvous } from '../lib/rendezvous'
import {
  OUTFIT_BEAT, PARTY_MAX, cgListText, dateBondRule, dateCgPalette, dateOpeningPrompt, dropRendezvous,
  isDateBeat, listRendezvous, outfitTryonCg, patchRendezvous, rendezvousPrompt, rendezvousVersion,
  rvAllIds, subscribeRendezvous,
} from '../lib/rendezvous'
import { loadActiveBooks } from '../lib/lorestore'
import { allowGateForTavern, buildLoreContext } from '../lib/lorescan'
import { activePresetInfo, buildPresetContext, readActivePreset } from '../lib/preset'
import { loreHitsOf } from '../lib/ailog'
import type { AiLogMeta } from '../lib/ailog'
import {
  appendSmsMsgs, applySmsEdit, loadSmsLogs, markRead, newMsgId, retextSmsMsg, smsLogVersion,
  smsTurns, subscribeSmsLog, writeSmsLogs,
} from '../lib/sms'
import { addTask } from '../lib/smstasks'

import plot from '../views/Plot.module.css'
import css from './DateLane.module.css'

const idFor = newMsgId

/* ---------- 界面两套：剧演 / 对话 ----------
   主人要的是「约会时用 galgame 那样的界面玩」—— 所以**默认剧演**，
   对话流（与主线同一份壳子）留在那一枚切换后面，随时切回来。
   存在 localStorage：'1' = 剧演、'0' = 对话；读不到按剧演算（宁可摆新的那一套）。 */
const GALGAME_KEY = 'zts-galgame:v1'
type DateMode = 'galgame' | 'chat'

function readDateMode(): DateMode {
  try {
    return localStorage.getItem(GALGAME_KEY) === '0' ? 'chat' : 'galgame'
  } catch {
    return 'galgame'
  }
}

function writeDateMode(m: DateMode): void {
  try {
    localStorage.setItem(GALGAME_KEY, m === 'galgame' ? '1' : '0')
  } catch { /* 存不下就只当这一屏的选择 */ }
}

/** 羁绊增量的口语化注记（与短信那条同一句） */
function bondNote(delta: number): string {
  if (delta >= 3) return '聊得火热'
  if (delta >= 1) return '更亲近了一点'
  if (delta <= -3) return '踩到了雷区'
  if (delta <= -1) return '起了点小摩擦'
  return ''
}

/**
 * 这一趟里**已经播过「换上新衣」那个镜头**的场次（键是 `Rendezvous.id`）。
 *
 * 为什么不拿 `beats` 当依据就够了：`beats` 只增不减，一旦落到名册上，往后每次进这一场
 * 都还看得见它 —— 那就成了**常驻**背景，而主人要的是「换上新衣那一刻」的一次性镜头。
 * 所以「播过没有」得另记一笔：记在模块上（换页签、切剧演↔对话都不重播；刷新页面算新的一趟，
 * 这一场再演一次也不算错），且只认**这一场**（`d:<uuid>`）—— 下一场是另一条记录。
 */
const tryonPlayed = new Set<string>()

export interface DateLaneProps {
  /** 这一路此刻该开哪一场（Plot 持有；给 null / 认不出就落到头一场没散场的） */
  rvId?: string | null
  /** 主人在这一路里换了场（换场那枚下拉报上去，由 Plot 记住） */
  onPick?: (rvId: string) => void
}

export function DateLane({ rvId, onPick }: DateLaneProps = {}) {
  const {
    operatorName, isMet, bondNow, bumpBond, setFlag, flagKeys, navigate, push, epDone, world,
    cgOf, cgTurnOf, setCg, bumpIntim, bumpAttire, dryAttireAll, meetChar, registerEnd, bumpActs, setRel,
  } = useTerminal()

  /* 台词框铭牌上要写操作员叫什么 —— 与主线同一句口径（见 PlotFlow.opNameOf） */
  const opName = opNameOf(operatorName)

  const [settings, setSettings] = useState<ApiSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  /** 流式生成中的未持久化活气泡（按线程区分） */
  const [live, setLive] = useState<{ charId: string; text: string } | null>(null)
  /** 右栏两面：正常一面（这一场）· 翻过来（色情状态栏） */
  const [face, setFace] = useState<'scene' | 'hud'>('scene')
  const [foldOpen, setFoldOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggleFold = useCallback((id: string) => {
    setFoldOpen((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])
  const [pickOpen, setPickOpen] = useState(false)
  const [pick, setPick] = useState<string[]>([])
  /** 正在原位编辑的那一条（id），与它此刻的草稿 */
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  /**
   * 这一路用哪一套界面：剧演（galgame）还是对话流（与主线同一份）。
   * 默认**剧演**，选择存 localStorage 的 `zts-galgame:v1`（'1' / '0'）——
   * 它记的是「这台设备上偏好哪一种」，不进存档（换档不该把它翻出来）。
   */
  const [mode, setMode] = useState<DateMode>(() => readDateMode())
  /** 「改口重来」的第二段：第一次点只摊开提醒，再点才真截断重推 */
  const [retryArm, setRetryArm] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProfile('sms').then(setSettings).catch(() => setSettings(null))
  }, [])

  /* 约会名册：与短信同一套路数（写即落盘、版本号变了就重读）。
     开的是哪一场由 Plot 说了算（它才是「事件指令跳到这里」的落点）——
     这一路自己只认「哪几场还开着」，认不出主人点的那一场就落到头一场。 */
  const [rvs, setRvs] = useState<Rendezvous[]>(listRendezvous)
  const rvVer = useSyncExternalStore(subscribeRendezvous, rendezvousVersion)
  useEffect(() => { setRvs(listRendezvous()) }, [rvVer])
  const liveRvs = useMemo(() => rvs.filter((r) => !r.done), [rvs])
  const rv = liveRvs.find((x) => x.id === rvId) ?? liveRvs[0]

  /* 会话落盘一律经 lib/sms.ts（同 Tavern）。
     `logs` 是**只读镜像** —— 写一律走 append，免得两处 state 互相覆盖。 */
  const [, setLogs] = useState<Record<string, ChatMsg[]>>(loadSmsLogs)
  const logVer = useSyncExternalStore(subscribeSmsLog, smsLogVersion)
  const logs = useMemo(() => loadSmsLogs(), [logVer])
  useEffect(() => { setLogs(loadSmsLogs()) }, [logVer])
  const activeLog = rv ? logs[rv.id] ?? [] : []

  /* 落盘走 `appendSmsMsgs`（写盘 **+ 回声**），不是光 `writeSmsLogs`。
     这一路与短信页共用同一本会话账，但**读法不一样**：短信页写完自己
     `setLogs` 留了一份镜像，这一路没有 —— `activeLog` 是从 `logs` 上读的，
     而 `logs` 只认 `logVer`（`useSyncExternalStore`）。
     少这一声就是「导演刚回的那一段在 `setLive(null)` 之后当场消失，
     重进这一路才从盘上读回来」（主人 2026-09-15 报的那一条）。 */
  const append = useCallback((id: string, up: (prev: ChatMsg[]) => ChatMsg[]) => {
    appendSmsMsgs(id, up)
  }, [])

  /* 导演点名的那张：**认不认它由 dateCgPalette 说了算**。
     `world.cg` 里存着什么就直接摆什么是不够的 —— 档位不到、该在场的人不在，
     或者压根是模型编出来的 id，都得在这儿拦下（不然一张只属于某人的画，
     会在没有她的场面里照样顶在会话流头上）。图注也从这一份里取。 */
  const activeCg = useMemo(() => {
    if (!rv) return null
    const named = cgOf(rv.id)
    if (!named) return null
    return dateCgPalette(rv).find((r) => cgIdOf(r) === named) ?? null
  }, [rv, cgOf])

  /* 换上新衣那一刻的**一次性镜头**：这一场走到 `outfit-tryon` 那一拍（或本回合刚记下它）
     → 剧演舞台把那张 CG 铺满、立绘全部让开，继续一下就收（见 components/Galgame.tsx 的
     `showcase`）。播过没有记在模块上（`tryonPlayed`），同一场不重播。
     ⚠ 只在**剧演**那一套里演：对话流那一套没有「舞台」，也就没有可让开的立绘。 */
  const [tryonOn, setTryonOn] = useState(false)
  const tryonBeat = !!rv && (rv.beats ?? []).includes(OUTFIT_BEAT)
  useEffect(() => {
    /* 对话流那一套没有舞台，也就不演 —— 这一条同时省掉一次白白的重渲染。 */
    if (mode !== 'galgame' || !rv || !tryonBeat) { setTryonOn(false); return }
    if (tryonPlayed.has(rv.id)) return
    tryonPlayed.add(rv.id)
    setTryonOn(true)
  }, [rv, tryonBeat, mode])

  /* 色情状态栏的名单：这一场在场的每一位（主位在前，同场跟上）。
     够不够格看的是关系本身（hasIntimate + 羁绊过线），与主线那一栏同一把尺。 */
  const hudIds = useMemo(
    () => (rv ? rvAllIds(rv).filter((id) => hasIntimate(id) && bondNow(id) >= INTIMATE_BOND) : []),
    [rv, bondNow],
  )

  /** 同场还带谁：只列同样够格的几位（与主线那一栏同一把尺） */
  const partyPool = useMemo(() => {
    if (!rv) return []
    return PERSON_IDS
      .filter((id) => id !== rv.charId && isMet(id) && hasIntimate(id) && bondNow(id) >= INTIMATE_BOND
        && !(rv.party ?? []).includes(id))
      .map((id) => ({ id, name: charOf(id)?.name ?? id, hue: charOf(id)?.hue ?? '#8ad' }))
  }, [rv, isMet, bondNow])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeLog.length, live, busy, rv])

  useEffect(() => {
    if (rv) markRead(rv.id)
  }, [rv])

  /**
   * 这一场发一轮。
   *
   * 与短信那条的分工：人已经**在眼前**了，所以放得开 ——
   *   · 羁绊一次 ±5（一条短信只有 ±3）；
   *   · **只有这一路能推进私密档案**（intim）—— 身体上的事发生在见面时，不在打字里。
   * 反过来也收着：**不动主线** —— 不判 eventDone、不写记录、不推卷次（见 dateDirective）。
   */
  const fireDate = useCallback(
    async (rvId: string, log: ChatMsg[]) => {
      const cur = listRendezvous().find((x) => x.id === rvId)
      if (!cur || busy) return
      const charId = cur.charId
      const c = charOf(charId)
      const meta = TAVERN_PERSONAS.find((p) => p.charId === charId)
      if (!c || !meta) return
      const cfg = settings
      /* 通道没配好**只报一句、不换视图** —— 从前这里是 push 完紧跟一句
         navigate('settings')，点进「约会专线」那一下整页就被换成了终端设置
         （BUG-03）。换页面是主人点「去配置」那一枚时才发生的事，不是这一路
         自己代劳的。 */
      if (!cfg || !isReady(cfg)) {
        push('warn', '推演通道未配置', '请先在「终端设置 · 角色短信」中填入接口地址与模型，再回来赴约。', false)
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
            contextText: `${cur.title} · ${cur.place}`,
            gate: allowGateForTavern({ epDone, ends: world.ends }),
          })
        }
      } catch {
        loreBlock = ''
      }

      const preset = buildPresetContext(readActivePreset(), scanText, 'sms')
      const presetInfo = activePresetInfo()
      const logMeta: AiLogMeta = {
        channel: '约会专线',
        act: `见面 · ${c.name}`,
        preset: { id: presetInfo.id, name: presetInfo.name, hits: preset.hits, prefill: presetInfo.prefill },
        lore: { chars: loreBlock.length, hits: loreHitsOf(loreBlock) },
      }

      const bond = bondNow(charId)
      /* 同场的其余几位（1 男多女那一场）：羁绊在这里现读 —— 提示词里要按人给口气 */
      const partyIds = cur.party ?? []
      const party = partyIds
        .map((id) => ({ id, name: charOf(id)?.name ?? '', bond: bondNow(id) }))
        .filter((pt) => !!pt.name)
      const plotCtx = plotContextFor(charId, { records: world.records, epDone })
      const system =
        rendezvousPrompt(charId, operatorName, bond, cur, cgListText(dateCgPalette(cur)), plotCtx || undefined, party)
        + (preset.pre ? `\n\n${preset.pre}` : '')
        + (loreBlock ? `\n\n${loreBlock}` : '')
        + (preset.post ? `\n\n${preset.post}` : '')
        /* 台词行契约压在**预设之后**：预设里但凡有一句「文本格式」把行首写法收走，
           上面 rendezvousPrompt 的第 4 条就被盖掉，整段台词会一丝不差落进旁白 ——
           「没有和正文推演一样美化」就是这一条漏了（主人 2026-09-15 报的那一条）。
           摆法照主线：契约在预设之后、收尾的指令块之前。 */
        + `\n\n${speechContract('「在场角色」那一节')}`
        /* 状态卡那一节：右栏那张卡上的一句话由模型写，而且**不许写进正文** ——
           与主线同一个口子（plot.ts 的 lookContract），两边的分寸一个字都不差。 */
        + `\n\n${lookContract('这一场在场的这几位')}`
        + dateBondRule(charId, party.map((p) => p.id))
      const turns = smsTurns(log, 12)
      /* 空线程 = 这一场刚开场：不给它留白，直接让对面把第一句说出来 */
      if (!turns.length) turns.push({ role: 'user', content: dateOpeningPrompt(cur) })
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
              setLive({ charId: rvId, text: acc })
            },
          })
        settled = true
        setLive(null)

        const reply = (res.text ?? '').trim()
        if (!reply) {
          setErr('收发中断：通道未返回任何内容。')
          push('danger', '约会推演失败', '通道未返回任何内容。', false)
          return
        }
        if (res.finishReason === 'length') {
          const short = extractLiveDisplay(acc).trim()
          if (short) append(rvId, (prev) => [...prev, { id: idFor(rvId), from: 'them', text: short, time: clock() }])
          push('warn', '回复已达长度上限', '这一回合被截断了，本回合未落地任何推进。', false)
          return
        }

        const parsed = parseDirectorReply(reply)
        const shown = replyDisplayText(parsed, acc)
        const fx = applyDirective(dateDirective(parsed.directive, charId, cur.party ?? []), {
          meetChar, bumpBond, registerEnd, setFlag, flagKeys, bumpIntim, bumpAttire, bumpActs, setRel,
        })
        /* 状态卡那一句话：按人并进 zts-look:v1（缺的那几项沿用上一次）。
           与 cg / beat 同一分工 —— 落地那一层只把它递出来，写盘由这一层做。 */
        if (fx.look?.length) applyLooks(fx.look)
        /* 这一回合什么都没往上走 → 湿润自己退一档（与主线那一路同一条规矩） */
        if (!fx.intim.length && !fx.attire.length) dryAttireAll()
        if (fx.cg) setCg(rvId, fx.cg)
        /* 这一场自己认领名目与地点：模型给出了更好的就地改写（第一次推进私密时顺带抬档位） */
        const patch: Parameters<typeof patchRendezvous>[1] = {}
        if (fx.date?.title?.trim()) patch.title = fx.date.title.trim()
        if (fx.date?.place?.trim()) patch.place = fx.date.place.trim()
        if (fx.date?.kind === 'intimate') patch.kind = 'intimate'
        if (fx.intim.length) patch.kind = 'intimate'
        /* 节拍：**只认登记过的那个 id**（模型编的、或换个写法写的，一律不写进名册）——
           净化那一道只拦垃圾，认不认得出是「登记过的节拍」是这一层的事。
           走过的就不重复写（这一栏只增不减）。
           ⚠ 并进**上面这同一个 patch**，别另开一次写：同一回合里模型很可能既写走完试穿、
           又点名那张画（正文说的是同一幕），而「认不认这个 cg id」的那一判
           （`activeCg` → `dateCgPalette`）读的就是名册上这一栏 —— 一次写齐，
           两件事在同一笔账上落地，不靠下一次读盘才凑到一起。 */
        const beat = fx.beat && isDateBeat(fx.beat) && !(cur.beats ?? []).includes(fx.beat)
          ? fx.beat
          : null
        if (beat) patch.beats = [...(cur.beats ?? []), beat]
        if (Object.keys(patch).length) {
          patchRendezvous(rvId, patch)
          setRvs(listRendezvous())
        }
        const newTasks = parsed.directive?.task ?? []
        for (const t of newTasks) addTask(t.title, { detail: t.detail, ...(isCharId(charId) ? { from: charId } : {}) })
        const hasFx = fx.bonds.length > 0 || fx.flags.length > 0 || fx.met.length > 0
          || fx.ends.length > 0 || fx.intim.length > 0 || fx.attire.length > 0
          || fx.acts.length > 0 || fx.rel.length > 0
          || beat !== null
          || newTasks.length > 0
        if (fx.intim.length || fx.attire.length || fx.acts.length || fx.rel.length) {
          const parts: string[] = []
          if (fx.intim.length) parts.push(fx.intim.map((x) => `${charOf(x.char)?.name ?? x.char} · ${intimAdvanceLabel(x)}`).join(' · '))
          if (fx.attire.length) parts.push(fx.attire.map((x) => `${charOf(x.char)?.name ?? x.char} · ${attireAdvanceLabel(x)}`).join(' · '))
          if (fx.acts.length) parts.push(fx.acts.map((x) => `${charOf(x.char)?.name ?? x.char}（次数）`).join(' · '))
          if (fx.rel.length) parts.push(fx.rel.map((x) => `${charOf(x.char)?.name ?? x.char} —— 「${relName(x.tier)}」`).join(' · '))
          push('decode', '这一场的推进', `${parts.join(' · ')} —— 角色档案的「私密档案」可见。`, false)
        }

        if (!shown) {
          if (hasFx) push('info', '见面的推进', `${c.name} · 本回合只有指令、没有正文；效果已落地。`, false)
          return
        }
        append(rvId, (prev) => [...prev, {
          id: idFor(rvId),
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
        if (fxParts.length) push('success', '见面的推进', `${c.name} · ${fxParts.join(' · ')}`, false)
        if (fx.intim.length) {
          const parts = fx.intim.map((x) => intimAdvanceLabel(x)).join('、')
          push('decode', '私密档案 · 有更新', `${c.name} · ${parts} —— 角色档案的「私密档案」一栏可见。`, false)
        }
        if (fx.attire.length) {
          const parts = fx.attire.map((x) => attireAdvanceLabel(x)).join('、')
          push('decode', '贴身衣物 · 有更新', `${c.name} · ${parts} —— 角色档案的「私密档案」一栏可见。`, false)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          settled = true
          const partial = extractLiveDisplay(acc).trim()
          setLive(null)
          if (partial) append(rvId, (prev) => [...prev, { id: idFor(rvId), from: 'them', text: partial, time: clock() }])
          return
        }
        settled = true
        setLive(null)
        const msg = e instanceof Error ? e.message : String(e)
        setErr(`收发中断：${msg}`)
        push('danger', '约会推演失败', msg, false)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [
      settings, busy, push, operatorName, bondNow, bumpBond, setFlag, flagKeys, epDone, world,
      append, meetChar, registerEnd, bumpIntim, bumpAttire, dryAttireAll, bumpActs, setRel, setCg,
    ],
  )

  /* 让对面先开口：**只有点了那一枚才发**。
     从前这是一只进车道就跑一次的效果（空线程即 `fireDate`）—— 用户一个字没写，
     额度就先花掉了一回（BUG-03）。现在它是一枚摆在空档上的显式动作，
     要不要花这一回由主人自己按。 */
  const openFirst = useCallback(() => {
    if (!rv || busy) return
    void fireDate(rv.id, [])
  }, [rv, busy, fireDate])

  const send = async () => {
    const text = draft.trim()
    if (!rv || busy || !text) return
    setDraft('')
    const mine: ChatMsg = { id: idFor(rv.id), from: 'user', text, time: clock() }
    const nextLog = [...(loadSmsLogs()[rv.id] ?? []), mine]
    append(rv.id, () => nextLog)
    await fireDate(rv.id, nextLog)
  }

  const pickOptionText = async (text: string) => {
    const t = (text ?? '').trim()
    if (!rv || busy || !t) return
    const mine: ChatMsg = { id: idFor(rv.id), from: 'user', text: t, time: clock() }
    const nextLog = [...(loadSmsLogs()[rv.id] ?? []), mine]
    append(rv.id, () => nextLog)
    await fireDate(rv.id, nextLog)
  }

  const rewriteLast = async (i: number) => {
    if (!rv || busy || i !== activeLog.length - 1) return
    const prev = activeLog[i - 1]
    if (!prev || prev.from !== 'user') return
    const trimmed = activeLog.slice(0, i)
    append(rv.id, () => trimmed)
    setErr(null)
    await fireDate(rv.id, trimmed)
  }

  /* ---------- 消息编辑（两类，与主线同一套口令） ---------- */

  /** 进入编辑态：预填该条此刻的文本；`arm` = 直接带着「改口重来」的第二段提醒进来 */
  const startEdit = (m: ChatMsg, arm = false) => {
    if (busy) return
    setEditId(m.id)
    setEditText(m.text)
    setRetryArm(arm)
    setErr(null)
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditText('')
    setRetryArm(false)
  }

  /**
   * 保存：走 `retextSmsMsg`（读盘 → 换这一条的文字 → 写盘 → 回声）——
   * **只换文字 + 打 `meta.edited`**，不重跑指令、不重新生成，条数与序号一个字不动。
   * 那一本账与短信页共用，所以回声一到，这一路与电话页同时重读。
   */
  const saveEdit = () => {
    if (!rv || !editId) return
    const text = editText.replace(/\s+$/, '')
    if (!text.trim()) {
      setErr('改完不能是空的 —— 想撤掉这一条，请用「作罢」清掉这一场。')
      return
    }
    if (!retextSmsMsg(rv.id, editId, text, true)) {
      setErr('这一条已经不在账上了（可能被别处截断）—— 重新打开这一场再看看。')
      return
    }
    setEditId(null)
    setEditText('')
    setRetryArm(false)
    setErr(null)
    push('info', '消息已手改', '只换了文字，没有重跑指令、也没有重新生成。', false)
  }

  /**
   * 改口重来（只给自己的发言）：改写这一条 → 截断它之后的所有内容 → **重新推进一次**。
   *
   * 两段式确认：第一次点只把提醒摊开（文案写死「此前已落地的羁绊 / 亲密 / 服饰变化
   * 不会回滚」），再点才动手。落地口径与主线同一条 —— 换文字与截断合成**一笔事务**
   * （applySmsEdit），然后拿截断后那本账当历史再发**一次**请求（`fireDate` 只在这里调一回）。
   */
  const retryEdit = async () => {
    if (!rv || !editId || busy) return
    if (!retryArm) { setRetryArm(true); return }
    const text = editText.trim()
    if (!text) {
      setErr('改口重来得留下话说 —— 想整条撤掉，请用「作罢」清掉这一场。')
      return
    }
    /* 改文字 + 截断其后的全部 = **一笔事务**（lib/sms.ts 的 applySmsEdit）：
       一次读盘、一次就地改、一次写盘、一次回声。从前拆成 retextSmsMsg +
       truncateSmsAfter 两次写盘，中途崩了会留下「文字改好了、后面几条还在」的半截账。 */
    if (!applySmsEdit(rv.id, editId, text, { truncate: true, edited: true })) {
      setErr('这一条已经不在账上了（可能被别处截断）—— 重新打开这一场再看看。')
      return
    }
    const nextLog = loadSmsLogs()[rv.id] ?? []
    setEditId(null)
    setEditText('')
    setRetryArm(false)
    setErr(null)
    push('info', '改口重来', '这一条已改写、其后内容已截断，正在重新推进。此前已落地的羁绊 / 亲密 / 服饰变化不会回滚。', false)
    await fireDate(rv.id, nextLog)
  }

  const stop = () => abortRef.current?.abort()

  /** 清空这一场 = 这一场作罢：名册上那一条一并撤掉，别留个点不开的空壳 */
  const clearScene = () => {
    if (!rv) return
    dropRendezvous(rv.id)
    const all = loadSmsLogs()
    const next = { ...all }
    delete next[rv.id]
    writeSmsLogs(next)
    setRvs(listRendezvous())
    setErr(null)
    push('info', '这一场作罢', '见面记录与名册上的那一条一并清除。', false)
  }

  /** 收场：这一场到此为止（线程留着当记录，名单上不再挂着） */
  const endScene = useCallback(() => {
    if (!rv) return
    patchRendezvous(rv.id, { done: true })
    setRvs(listRendezvous())
    push('info', '这一场走完了', `${charOf(rv.charId)?.name ?? rv.charId} · ${rv.title}`, false)
  }, [rv, push])

  /* 带人一起：**只在还没开口之前**给 —— 名单一改，提示词里的账就得跟着重算，
     已经聊起来的一场再改人，两边对不上（见 lib/rendezvous.ts 的 party 一节）。 */
  const canPickParty = !!rv && activeLog.length === 0 && !busy && partyPool.length > 0
  const commitParty = () => {
    if (!rv || !pick.length) { setPickOpen(false); return }
    patchRendezvous(rv.id, { party: pick.slice(0, PARTY_MAX) })
    setRvs(listRendezvous())
    setPickOpen(false)
    setPick([])
    push('info', '同场加上了几位', pick.map((id) => charOf(id)?.name ?? id).join('、'), false)
  }

  if (!rv) {
    return (
      /* 空档也占满整行：这一路没有左右两栏可分，留一条 330px 的空列只是白扣宽度 */
      <section className="panel" data-date-lane-empty="1" style={{ gridColumn: '1 / -1' }}>
        <div className={css.empty}>
          <b>此刻没有开着的约会</b>
          <span className="muted tiny" style={{ lineHeight: 1.8 }}>
            这一路只在有一场待人赴的见面时才通 —— 在角色短信里聊到约会，或者推演正文里
            对方开的口，两样都得把时间与地点说定，才会落下一条事件指令，把这一场送到这儿来。
          </span>
        </div>
      </section>
    )
  }

  const c = charOf(rv.charId)
  const partyNames = (rv.party ?? []).map((id) => charOf(id)?.name ?? id)

  /* ---------- 剧演那一套要喂的东西 ----------
     舞台只认「此刻在台上的是谁」：主位 + 同场（party 的顺序就是往右推的顺序）。
     名字 / 色 / 纹章照 castmeta 取，缺了就退回 id 与一支中性色（与 Portrait 同一条兜底）。 */
  const galCast = {
    id: rv.charId,
    name: c?.name ?? rv.charId,
    hue: c?.hue ?? '#8ad',
    sigil: c?.sigil ?? rv.charId.slice(0, 1),
  }
  const galParty = (rv.party ?? []).map((id) => {
    const p = charOf(id)
    return { id, name: p?.name ?? id, hue: p?.hue ?? '#8ad', sigil: p?.sigil ?? id.slice(0, 1) }
  })
  /* 与上面那只 3:2 的 CG 位同一张、同一版（变体按「这场被点过几次名」换）。
     取的是**文件名**（cgFileOf）：登记位可能用 CgRef.file 把文件名指到另一个 id 上
     （同一份素材两种前提各登记一次），取图那一侧只认文件名。 */
  const galCg = activeCg
    ? {
        id: cgVariantId(cgFileOf(activeCg), cgVariantsOf(activeCg), cgTurnOf(rv.id)),
        dir: cgDirOf(activeCg),
        note: cgNoteOf(activeCg),
      }
    : null
  /* 接续选项：只认**最后一条**对面说的那条（选项是那一回合的续法） */
  const galOptions = (() => {
    const last = activeLog[activeLog.length - 1]
    return last && last.from === 'them' ? last.meta?.options : undefined
  })()

  /* 还没人开口时那一块（两套界面共用；剧演里摆舞台正中） */
  const emptyNodes = activeLog.length === 0 && !busy ? (
    <>
      <EmptyHint
        title="还没人开口"
        body={`${c?.name ?? rv.charId} 还没出声 —— 写一句递过去，或者等对方先开口。`}
      />
      {settings && !isReady(settings) ? (
        /* 通道没配好：就地说明，留一枚「去配置」**可选入口** —— 点它才换页 */
        <div className={plot.warn} data-date-cfg-missing="1">
          <b>推演通道未配置</b>
          <span>请先在「终端设置 · 角色短信」中填入接口地址与模型，再回来赴约。</span>
          <button
            className="btn btn--amber"
            style={{ fontSize: 12 }}
            onClick={() => navigate('settings')}
            data-date-cfg
          >
            去配置
          </button>
        </div>
      ) : (
        <div className={plot.hintLine} data-date-await="1">
          <button
            className="btn btn--ghost"
            style={{ fontSize: 12 }}
            onClick={openFirst}
            disabled={busy || !settings}
            title="让对面把这一场的第一句说出来（消耗一次推演额度）"
            data-date-open
          >
            让对方先开口
          </button>
          <span>空着递过去，先听对面怎么开这个口 —— 也算一次推演。</span>
        </div>
      )}
    </>
  ) : null

  /* 编辑框：两套界面同一个共享件（只换文字，不重跑指令）。
     剧演里它盖在舞台下半，对话流里原位顶掉那一条 —— 壳子不一样，件是同一个。 */
  const editorFor = (m: ChatMsg) => (
    <MsgEditor
      key={m.id}
      isUser={m.from === 'user'}
      value={editText}
      onChange={setEditText}
      onSave={saveEdit}
      onCancel={cancelEdit}
      retryArmed={retryArm}
      onRetry={() => void retryEdit()}
      retryNote={<>改口重来会截断这一条之后的所有内容并重新推进一次 —— <b>此前已落地的羁绊 / 亲密 / 服饰变化不会回滚</b>。</>}
    />
  )
  const galEditorMsg = editId ? activeLog.find((m) => m.id === editId) ?? null : null

  /* 返回的是**两块**（会话板 + 右栏），正好坐在主线那两块坐的两个格子上
     （`Plot.module.css` 的 `.layout`：`minmax(0,1fr) 330px`）—— 所以宽度与主线一模一样。
     从前这一路是**整个塞进一个 panel 里、自己再劈左右**，于是
     ① 主线那一栏空占的 330px 白白扣在头上（比主线窄 346px）；
     ② 里外两层 `flex:1; min-height:0` 在**高度不定**的壳里把内容体对父级的内在高度贡献
        压成 0，面板塌得只剩一条头，而被 `.panel{overflow:hidden}` 一裁 —— 正文整段看不见。
     现在按主线的排法来：面板随内容长（内容体不再 flex:1），右栏退回格子里那一列。 */
  return (
    <>
      <section className="panel" data-date-lane-area="1" data-date-lane={rv.id} data-date-mode={mode}>
        <div className={`panel__head ${css.head}`}>
          {c ? <Portrait avatarId={rv.charId} name={c.name} hue={c.hue} sigil={c.sigil} size={28} round /> : null}
          <span className="panel__title">{c?.name ?? rv.charId} <span className="slash" /></span>
          {rv.kind === 'intimate' ? <HeartStraight size={12} weight="fill" /> : null}
          <span className="muted tiny" style={{ color: 'var(--ink-faint)' }}>
            {rv.title} · {rv.place}
            {rv.time ? ` · ${rv.time}` : ''}
            {partyNames.length ? ` · 同场：${partyNames.join('、')}` : ''}
          </span>
          <span className={css.tag}>约会专线</span>
          <div className={css.headActs}>
            {/* 剧演 / 对话：两套界面，一套在台前、一套在幕后，切换时才换 DOM。
                默认剧演（galgame 样式的舞台）；对话流与主线原模原样，
                编辑入口、推演折叠那些都还在那一套里。 */}
            <div className={css.modeSwitch} role="group" aria-label="约会界面">
              <button
                type="button"
                className={[css.modeBtn, mode === 'galgame' ? css.modeOn : ''].filter(Boolean).join(' ')}
                aria-pressed={mode === 'galgame'}
                data-date-mode-btn="galgame"
                onClick={() => { setMode('galgame'); writeDateMode('galgame') }}
                title="剧演：galgame 样式的舞台，左边站着这一场的人"
              >剧演</button>
              <button
                type="button"
                className={[css.modeBtn, mode === 'chat' ? css.modeOn : ''].filter(Boolean).join(' ')}
                aria-pressed={mode === 'chat'}
                data-date-mode-btn="chat"
                onClick={() => { setMode('chat'); writeDateMode('chat') }}
                title="对话：与主线同一套对话流（编辑 / 推演折叠都在这儿）"
              >对话</button>
            </div>
            {/* 换场：手上不止一场时（同一位可以有多场，那是不同的时候） */}
            {liveRvs.length > 1 ? (
              <select
                className="field"
                style={{ width: 'auto', maxWidth: 220, fontSize: 12 }}
                aria-label="换一场"
                value={rv.id}
                onChange={(e) => { onPick?.(e.currentTarget.value); setFace('scene') }}
                data-date-switch
              >
                {liveRvs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {charOf(x.charId)?.name ?? x.charId} · {x.title}
                  </option>
                ))}
              </select>
            ) : null}
            {canPickParty ? (
              <button
                className="btn btn--ghost"
                style={{ fontSize: 11, padding: '6px 10px' }}
                onClick={() => setPickOpen((v) => !v)}
                title="把别的几位一起带上 —— 多女同场"
                data-date-party-open
              >
                <UsersThree size={13} weight="bold" /> 带人一起
              </button>
            ) : null}
            <button
              className="btn btn--ghost"
              style={{ fontSize: 11, padding: '6px 10px' }}
              onClick={clearScene}
              title="这一场作罢（名册上那一条一并撤掉）"
              data-date-clear
            >
              <Eraser size={13} weight="bold" /> 作罢
            </button>
            <button
              className="btn btn--ghost"
              style={{ fontSize: 11, padding: '6px 10px' }}
              onClick={endScene}
              title="这一场到此为止（记录留着）"
              data-date-end
            >
              <Check size={13} weight="bold" /> 散场
            </button>
          </div>
        </div>

        {pickOpen ? (
          <div className={css.partyPick} data-date-party-pick>
            <div className="tiny muted">
              这一场还带谁去（可多选，最多 {PARTY_MAX} 位）—— 带上的人与 {c?.name ?? rv.charId} 同场，各记各的账。
            </div>
            <div className={css.partyPickRow}>
              {partyPool.map((p) => {
                const on = pick.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip ${on ? 'chip--on' : ''}`}
                    style={on ? { borderColor: `${p.hue}88`, color: inkOf(p.hue) } : undefined}
                    onClick={() => setPick((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                    data-date-party={p.id}
                    data-date-party-on={on ? '1' : '0'}
                  >
                    {p.name}
                  </button>
                )
              })}
              <button className="btn btn--primary" style={{ fontSize: 11, padding: '6px 10px' }} onClick={commitParty} data-date-party-go>
                就这么去
              </button>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => { setPickOpen(false); setPick([]) }}>
                <X size={12} weight="bold" /> 算了
              </button>
            </div>
          </div>
        ) : null}

        {/* 会话体与会话流：**壳子与在线推演同一份**（`Plot.module.css` 的
            `.onBody` / `.thread`，外壳那一段的理由见文件头注释）。这一路的不同
            只剩右栏与里面的内容 —— 排法一个字都不另立。 */}
        <div className={plot.onBody}>
          {mode === 'galgame' ? (
            <Galgame
              cast={galCast}
              party={galParty}
              log={activeLog}
              cgId={galCg ? galCg.id : null}
              cgDir={galCg ? galCg.dir : undefined}
              cgNote={galCg ? galCg.note : undefined}
              intimate={rv.kind === 'intimate'}
              showcase={tryonOn && mode === 'galgame' ? (outfitTryonCg() ?? null) : null}
              onShowcaseDone={() => setTryonOn(false)}
              options={galOptions}
              busy={busy}
              youName={opName}
              onPickOption={(op) => void pickOptionText(op)}
              onEditLine={(id) => {
                const m = activeLog.find((x) => x.id === id)
                if (m) startEdit(m)
              }}
              editor={galEditorMsg ? editorFor(galEditorMsg) : null}
              empty={emptyNodes}
            />
          ) : (
          <div className={plot.thread} data-date-thread>
            {/* 「换上新衣」这一刻：不论在剧演还是对话流，那张 CG 都该当场出现 ——
                剧演那边走 showcase（连立绘一起让开），对话流这边就摆进这一格。 */}
            {tryonOn ? (
              <div className={css.threadCg} data-cg-slot="cg-date-shop-luna">
                <CgSlot
                  cgId="cg-date-shop-luna"
                  dir="lunaSFW"
                  caption="换上新的一身，站在你面前"
                  charIds={rvAllIds(rv)}
                  ratio="3 / 2"
                />
              </div>
            ) : null}
            {activeCg ? (
              <div className={css.threadCg}>
                {/* 同一张画有多版时（`CgRef.variants`）换着摆：拿这场约会**被点过几次名**
                    取模，第 1、2、3 次依次是 -1、-2、-3，越界绕回第一版。
                    计的是「这场换过几次图」，不是「屏幕刷了几帧」—— 同一张连点两回不计数
                    （见 `Terminal` 的 `setCg`），所以原地打转那几回合不会把变体白转过去。 */}
                {/* 缺图时这一格走 lib/cg.ts 的兜底链，与剧演舞台、右栏同一口径 ——
                    所以得把「这一场归谁」递进去（主位在前的全员），外加私密那一档的闸。
                    组件自己不读全局：这些人是由这一场（rv）算出来的。 */}
                <CgSlot
                  cgId={cgVariantId(cgFileOf(activeCg), cgVariantsOf(activeCg), cgTurnOf(rv.id))}
                  dir={cgDirOf(activeCg)}
                  caption={cgNoteOf(activeCg)}
                  charIds={rvAllIds(rv)}
                  intimate={rv.kind === 'intimate'}
                  ratio="3 / 2"
                />
              </div>
            ) : null}
            {emptyNodes}
            {activeLog.map((m, i) => {
              /* 正在编辑的那一条：原位顶掉气泡，长成编辑框（与主线同一个共享件 ——
                 `components/PlotFlow.tsx` 的 MsgEditor）。保存只换文字，不重跑指令。
                 底下的输入带不受影响：焦点落进这一格，不是被它挪走。 */
              if (editId === m.id) return editorFor(m)
              return m.from === 'them' ? (
                <NarrBlock
                  key={m.id}
                  label="导演叙述"
                  time={m.time}
                  text={m.text}
                  opName={opName}
                >
                  {editedOf(m) ? <MsgEditChip /> : null}

                  {m.meta?.thinking ? (
                    <ThinkFold
                      open={foldOpen.has(m.id)}
                      text={m.meta.thinking}
                      onToggle={() => toggleFold(m.id)}
                    />
                  ) : null}

                  <OptRow
                    options={m.meta?.options}
                    disabled={busy}
                    onPick={(op) => void pickOptionText(op)}
                  />

                  {/* 对面这一段也能手改（只换文字）—— 与主线那一枚同一个位置 */}
                  {!busy ? (
                    <RowActs>
                      <button type="button" className="linkGo" data-date-edit="1" onClick={() => startEdit(m)}>编辑</button>
                      {i === activeLog.length - 1 && i > 0 && activeLog[i - 1].from === 'user' && m.meta?.hasFx !== true ? (
                        <button type="button" className="linkGo" onClick={() => void rewriteLast(i)}>重写此回复</button>
                      ) : null}
                    </RowActs>
                  ) : null}
                </NarrBlock>
              ) : (
                <YouFrame
                  key={m.id}
                  text={m.text}
                  opName={opName}
                  foot={
                    <span className={`muted tiny ${plot.youFoot}`}>
                      {m.time}
                      {editedOf(m) ? <MsgEditChip /> : null}
                      {!busy ? (
                        <>
                          <button type="button" className="linkGo" data-you-edit="1" onClick={() => startEdit(m)}>编辑</button>
                          {/* 改口重来：点这一下只摊开提醒（第二段确认在编辑框里） */}
                          <button type="button" className="linkGo" data-you-retry="1" onClick={() => startEdit(m, true)}>改口重来</button>
                        </>
                      ) : null}
                    </span>
                  }
                />
              )
            })}
            {live && live.charId === rv.id && live.text ? (
              <NarrBlock
                label="导演叙述"
                time="生成中…"
                plain
                text={extractLiveDisplay(live.text)}
                opName={opName}
              />
            ) : null}
            {err ? <div className={plot.errLine}>{err}</div> : null}
            {busy && (!live || live.charId !== rv.id || !live.text) ? (
              <Thinking text="导演正在铺这一场…" />
            ) : null}
            <div ref={endRef} />
          </div>
          )}

          {mode === 'galgame' ? (
            <>
              {err ? <div className={plot.errLine}>{err}</div> : null}
              {busy && (!live || live.charId !== rv.id || !live.text) ? (
                <Thinking text="导演正在铺这一场…" />
              ) : null}
            </>
          ) : null}

          <Composer
            draft={draft}
            onDraft={setDraft}
            onSend={() => void send()}
            onStop={stop}
            busy={busy}
            placeholder="这一场：向导演传达言万心叶的行动…（回车送出）"
            rootProps={{ 'data-date-composer': '1' }}
            sendTitle="把这一步写下去，导演接着往下铺"
          />
        </div>
      </section>

      {/* 右栏两面：正常一面是「这一场」（人 + 常服立绘），翻过来是色情状态栏。
          翻转的那一枚摆在这一栏自己头上 —— 它翻的是这一栏，不是整个页面。
          它坐的是主线 `aside` 那一个格子（`.layout` 第 2 列，330px），所以宽度由格子给，
          自己不写死（从前写死 380px，又塞在面板里，才把正文那一列挤瘦）。 */}
      <aside className={css.aside} data-date-side-pane>
        <div className={css.sideTabs} role="tablist" aria-label="这一栏看哪一面">
          <button
            role="tab"
            aria-selected={face === 'scene'}
            className={`${css.sideTab} ${face === 'scene' ? css.sideTabOn : ''}`}
            onClick={() => setFace('scene')}
            data-date-face="scene"
          >这一场</button>
          <button
            role="tab"
            aria-selected={face === 'hud'}
            className={`${css.sideTab} ${face === 'hud' ? css.sideTabOn : ''}`}
            onClick={() => setFace('hud')}
            data-date-face="hud"
            disabled={!hudIds.length}
            title={hudIds.length ? '翻转过来：此刻的色情状态栏' : '这一场还没有走到那一步'}
          >色情状态栏</button>
        </div>
        <div className={css.sideBody} data-date-side-body>
          {face === 'hud'
            ? <IntimateHud ids={hudIds} hint="此刻 · 这一场在场的人" />
            : <DateSide rv={rv} />}
        </div>
      </aside>
    </>
  )
}
