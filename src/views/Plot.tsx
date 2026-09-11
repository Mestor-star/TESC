import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Key } from 'react'
import { ArrowRight, Check, Eraser, FloppyDisk, MagicWand, PaperPlaneTilt, SlidersHorizontal, Stop, Sword, UploadSimple } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { OPERATOR_ID, PERSON_IDS, personOf } from '../data/castmeta'
import { rosterRowsOf } from '../lib/cast'
import { SCENES } from '../data/scenes'
import type { ApiSettings, ChatTurn } from '../lib/api'
import { chatCompletion, chatCompletionStream, isReady, loadProfile } from '../lib/api'
import type { StreamResult } from '../lib/api'
import { loadOfflineText } from '../lib/offtext'
import { clock } from '../lib/format'
import type { ChatMsg, RecordMode } from '../data/types'
import { applyDirective, buildDirectorSystem, directiveHasFx, extractLiveDisplay, parseDirectorReply } from '../lib/plot'
import {
  effectiveGrowth, listRecords, readBag, readCoin, readEquip, readGearBag, readGrowth,
  readLevels, readStamina,
} from '../lib/battle/store'
import { settleExit, settleWin } from '../lib/battle/settle'
import { battleMissionOf } from '../lib/battle/from-directive'
import { periodProgress } from '../lib/battle/derive'
import { TUNING } from '../lib/battle/tuning'
import type { BattleRecord, StaminaState } from '../lib/battle/types'
import type { Mission } from '../data/types'
import { Battle } from './Battle'
import { recentBattleContext } from '../lib/battle/narrate'
import { narrateStorylog } from '../lib/battle/storylog'
import type { PlotReply } from '../lib/plot'
import { loadActiveBooks } from '../lib/lorestore'
import { applySchemePersisted, capturePersisted, importChatPresetFile, listSchemes, patchScheme, readJsonFile, storeSchemes } from '../lib/schemes'
import type { Scheme } from '../lib/schemes'
import PresetManager from './PresetManager'
import type { PresetEntry } from '../lib/preset'
import { activePresetId } from '../lib/preset'
import { allowGateFor, buildLoreContext } from '../lib/lorescan'
import { activePresetInfo, buildPresetContext, prefillTurns, readActivePrefill, readActivePreset } from '../lib/preset'
import { loreHitsOf } from '../lib/ailog'
import type { AiLogMeta } from '../lib/ailog'
import { splitSpeech } from '../lib/dialogue'
import { Linkified } from '../components/Linkified'
import { Portrait } from '../components/Portrait'

import css from './Plot.module.css'

const LOG_KEY = 'zts-plot:v1'

/**
 * 侧栏是否展出本段大纲。
 * 默认关：还没发生的收束摆在观测者眼前就是剧透。
 * 导演仍然照常拿到大纲（plot.ts 的【事件大纲 · 唯一事实来源】），
 * 这里只是决定要不要把它摊在界面上；想恢复成旧样子把它改回 true 即可。
 */
const SHOW_OUTLINE = false

/**
 * 在线推演「自动生成正文」的截止事件（含）。
 * 只有第一卷开头（序章与第 1 话）会由导演自动铺陈开场叙述；
 * 读到这一段之后，每一段都不再自动生成——一律等操作员发话，
 * 导演不抢在观测者之前把故事写掉。（原文开场白仍照常注入，那是原文、非生成。）
 */
const AUTO_OPEN_THRU = 'v1-3'
const AUTO_OPEN_THRU_IDX = TIMELINE.findIndex((e) => e.id === AUTO_OPEN_THRU)

/** 进入一个尚无会话的事件时，喂给导演的「开场请求」（不入历史） */
const OPEN_PROMPT =
  '（开场）请依据「事件大纲」与在场角色，铺陈这一事件的开端：写清此时此地、在场者的状态与正悬而未决的局面，'
  + '然后停在一个言万心叶可以回应、可以行动的地方。先不要收束事件；本回合若无变量变化，指令块给 {} 即可。'

/** 当原文「开场白」已注入为首条消息时，让导演接着开场续写、而非另起一段开场 */
const CONTINUE_PROMPT =
  '（接续开场）上面那条「开场白 · 原文」即是本事件的起点。请接着它继续铺陈此刻的局势：写清言万心叶身在何地、'
  + '在场者的状态与正悬而未决的局面，然后停在言万心叶可以回应、可以行动的地方。不要重复或改写过开场白本身；'
  + '先不要收束事件；本回合若无变量变化，指令块给 {} 即可。'

/** 事件衔接请求：上一事件已收束，用其解读式收束 + 言万心叶最后发言，让导演为下一事件生成自然开场（同一段故事的余波延续） */
function bridgePrompt(prevTitle: string, prevGroup: string, digest: string, diverged: boolean, lastUser?: string): string {
  return `（衔接）《${prevTitle}》已经收束（${prevGroup}），下面进入它之后的事件——这是同一条故事线的自然延续，不是新开一段，更不是又冒出新的麻烦（不要写成「一波刚平一波又起」那种另起炉灶、事件里再生事件的割裂转场）。
上一段如何了结（解读口径）：${digest.trim() || '（导演未给出收束概述）'}${diverged ? '\n（该段已偏离原著路线。）' : ''}${lastUser ? `\n言万心叶在上一段末尾的话语／行动：${lastUser}` : ''}
请把上面这些全部当作已经发生的既定事实。依下方「当前事件」的大纲，把它作为承接上一段结果的延续来铺陈开场：若场景、在场者或处境随上一段的收束而发生了变化，就把这变化写成从上一段的结果中自然到来；承接言万心叶此刻的处境、在场者的状态与仍然悬而未决的局面，写清此时此地。
这段衔接可以写得较长、有画面与氛围，但不要复述或重复上一段的收束过程，不要照抄世界书／原文／开场白，所有角色保持在设定之内（不要 OOC）。写完后停在言万心叶可以回应、可以行动的地方；先不要收束当前事件；若本回合无变量变化，事件指令块给 {} 即可。`
}

/** 「AI 起草」的请求：站在言万心叶视角草拟下一步可说的话/行动（仅供操作员择一填入，不落导演状态） */
const DRAFT_PROMPT =
  '（起草助手）请暂时站在言万心叶的视角，依据当前事件与最近的对话，为言万心叶草拟 2~3 个下一步可以说出口的话或可以做的行动。\n'
  + '要求：一行一条，以「- 」开头；每条须是一句可以直接照说的完整话或一个明确的小行动，贴合当前局势与角色语气；'
  + '不要用导演叙述口吻，不要写成小说段落，不要输出事件指令或变量，也不要带「言万心叶：」之类的前缀。'

/** 自动补发提示：上一回正文为空（多为思考型模型把预算耗在内部思考上）时，用它催模型直接作答 */
const RETRY_NUDGE =
  '（系统注：上一回你的回复为空。请直接给出正文叙述并附事件指令作答；如需内部思考请压缩篇幅，不要让思考超过正文。）'

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
    if (!parsed || typeof parsed !== 'object') return {}
    /* 读的时候顺手过一遍展示清洗：清洗规则是后加的，旧记录里还留着那时漏出来的
       <dream_*> 一类标签与代码围栏。只动模型写的那些（from==='them'），
       开场白是原文、观测者自己的话更不该被改写。 */
    for (const list of Object.values(parsed)) {
      if (!Array.isArray(list)) continue
      for (const m of list) {
        if (!m || m.from !== 'them' || m.meta?.opening || m.meta?.battle) continue
        const clean = extractLiveDisplay(m.text)
        if (clean && clean !== m.text) m.text = clean
      }
    }
    return parsed
  } catch {
    return {}
  }
}

function idFor(): string {
  return `${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 后台推演：正文一律经这里落盘。
 * 观测者切去别的模块时本视图已卸载，setLogs 变成空操作 —— 但这一句仍把模型返回的
 * 正文写进本地会话，回到剧情推进时 loadLogs() 自然读得回来，这一回合不会白跑。
 * 先落盘再回写状态（以存储为准），免得「卸载期间写进去的消息」被手上的旧 state 盖掉。
 */
function persistMsg(evId: string, m: ChatMsg): Record<string, ChatMsg[]> {
  const next = { ...loadLogs() }
  next[evId] = [...(next[evId] ?? []), m]
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下降级为仅内存 */
  }
  return next
}

/** 当前挂载中的剧情推进视图数：0 = 观测者不在本页，这一回合是在后台跑完的 */
let plotMounts = 0

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
    epDone, bondNow, world, isMet,
    bumpBond, registerEnd, meetChar, setFlag, recordPick, completeEvent,
    records, requestProfile,
  } = useTerminal()

  /** 上阵名单 → 羁绊读数表。作战屏只读它，仗打完了才由 settle 回写。 */
  const bondOfSquad = useCallback(
    (ids: string[]) => Object.fromEntries(ids.map((id) => [id, bondNow(id)])),
    [bondNow],
  )

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
  /** 「事件已收束、待手动推进」：收束正文留在原地不消失；点「进入下一事件」才写记录并推进（期间不锁输入，继续回话即留在本事件） */
  const [concluded, setConcluded] = useState<{ evId: string; title: string; digest: string; diverged: boolean } | null>(null)
  /* —— 剧情交战：指令里带 battle 时，按现场角色与敌人开打 —— */
  const [plotBattle, setPlotBattle] = useState<{ mission: Mission; squad: string[] } | null>(null)
  /**
   * 正文里出现的交战。
   * 不自动接管屏幕 —— 先落成一个「进入战斗」按钮，由操作员决定什么时候打。
   * 这一格必须**打赢**才走得下去：撤退或战败回到正文时按钮还在，
   * 「进入下一事件」会拦下来。带的这份编成就是现场那几个人，不能另叫别人来。
   */
  const [pendingBattle, setPendingBattle] = useState<{
    evId: string; name: string; mission: Mission; squad: string[]
  } | null>(null)
  const [stamina, setStamina] = useState<StaminaState>({ cur: TUNING.spMax, max: TUNING.spMax, chargeAt: 0 })
  const [growth, setGrowth] = useState<Record<string, number>>({})
  /** 买来的终末等级（与任务成长合流后才进战斗 —— 见 store 的 effectiveGrowth） */
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [coin, setCoin] = useState(0)
  const [gearBag, setGearBag] = useState<Record<string, number>>({})
  const [equip, setEquip] = useState<Record<string, string>>({})
  const [bag, setBag] = useState<Record<string, number>>({ ...TUNING.bagDefault })
  const eventsDone = Object.keys(epDone).length

  const loadKit = useCallback(async () => {
    const [sp, g, c, gb, eq, bg, lv] = await Promise.all([
      readStamina(eventsDone), readGrowth(), readCoin(), readGearBag(), readEquip(), readBag(),
      readLevels(),
    ])
    setStamina(sp)
    setGrowth(g)
    setLevels(lv)
    setCoin(c)
    setGearBag(gb)
    setEquip(eq)
    setBag(bg)
  }, [eventsDone])
  useEffect(() => { void loadKit() }, [loadKit])

  /** 「AI 起草」：起草中 / 候选行动 / 失败提示（纯呈现，不落导演状态） */
  const [drafting, setDrafting] = useState(false)
  const [draftSugg, setDraftSugg] = useState<string[] | null>(null)
  const [draftErr, setDraftErr] = useState<string | null>(null)
  /** 内嵌预设条：本机方案列表 + 存当前参数用的命名输入 */
  const [schemes, setSchemes] = useState<Scheme[]>(listSchemes)
  const [presetName, setPresetName] = useState('')
  /** 正在「管理预设」的方案（null = 未开面板） */
  const [manageOf, setManageOf] = useState<Scheme | null>(null)
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

  // 近期作战记录（隐藏存档）：作为延续性背景注入本回合推演，防前后文不搭
  const [battleLog, setBattleLog] = useState('')
  useEffect(() => {
    let alive = true
    void listRecords().then((rs) => { if (alive) setBattleLog(recentBattleContext(rs)) })
    return () => { alive = false }
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
  /* 本段是否由导演自动开篇（只有序章与第 1 话） */
  const autoOpens = !!focusEv && TIMELINE.findIndex((e) => e.id === focusEv.id) <= AUTO_OPEN_THRU_IDX

  /* 本段现场名册（含 roster 里的外场角色）；点一行 → 档案页就近展开 */
  const castRows = useMemo(() => (focusEv ? rosterRowsOf(focusEv) : []), [focusEv])
  const openProfile = useCallback((id: string) => {
    requestProfile(id)
    navigate('archive')
  }, [requestProfile, navigate])

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
    setLogs(persistMsg(evId, m))
  }, [])

  /* 记一份在场与否：不在场时跑完的回合，收口要另外报一声（否则观测者以为它中断了） */
  useEffect(() => {
    plotMounts += 1
    return () => { plotMounts -= 1 }
  }, [])

  /** 指令落地 + 结算：写变量、toast；eventDone→标记「已收束待手动推进」（正文停留，点按钮才写记录） */
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
      // 交战先于收束结算：本段打完，再由操作员点「进入下一事件」推进
      if (d.battle?.name) {
        const want = (d.battle.squad ?? []).filter((id) => isMet(id))
        const squad = want.length ? want.slice(0, 4) : PERSON_IDS.filter((id) => isMet(id)).slice(0, 4)
        if (squad.length) {
          // 落成待战，而不是当场开打：点「进入战斗」才进；打赢了本段才继续
          setPendingBattle({ evId, name: d.battle.name, mission: battleMissionOf(d.battle, evId), squad })
          push('danger', '交战', `${d.battle.name} 出现在现场 —— 由在场的 ${squad.length} 名成员应敌。点「进入战斗」开始。`, false)
        } else {
          push('warn', '无可应敌者', `${d.battle.name} 出现在现场，但此刻没有可派遣的成员。`, false)
        }
      }
      if (fx.eventDone) {
        const digest = (fx.digest?.trim() || ev?.summary || '').trim()
        // 收束不再立即归档推进：正文留在当前事件不消失，等操作员点「进入下一事件」才写记录；
        // 期间不锁输入——直接继续回话即视为留在本事件，取消收束标记（未归档故无副作用）。
        setConcluded({ evId, title: ev?.title ?? evId, digest: digest || ev?.summary || '', diverged: fx.diverged })
        setLastEnded({ id: evId, title: ev?.title ?? evId, digest: digest || ev?.summary || '', diverged: fx.diverged, mode: 'online' })
        push('decode', '事件收束', '结尾叙述已完整上屏：点「进入下一事件」写入记录并衔接下一段；亦可继续回话留在本事件。', false)
        return
      }
      if (fx.diverged) {
        push('warn', '路线偏离', '本段已偏离原著走向，相关分歧以标记为准。', false)
      }
    },
    [meetChar, bumpBond, registerEnd, setFlag, push],
  )

  /**
   * 对某事件发起一次在线推演请求。
   * userMsg 可选：操作员发言（正常回合）；baseOverride 可选：重写时用截断后的历史当 base。
   */
  const pushTurn = useCallback(
    async (evId: string, userMsg?: string, baseOverride?: ChatMsg[], opts?: { long?: boolean }) => {
      const ev = TIMELINE.find((e) => e.id === evId)
      if (!ev || busy || !ready) return
      setBusy(true)
      setErr(null)
      // 后接事件锚（软门禁）：当前事件之后第一个尚未完成的事件；无则 null
      const evIdx = TIMELINE.findIndex((t) => t.id === ev.id)
      const nextEv = evIdx >= 0 ? (TIMELINE.slice(evIdx + 1).find((t) => !epDone[t.id]) ?? null) : null

      // 世界书命中注入（仅就绪在线；失败静默，主线不受影响）
      const scanLog = baseOverride ?? logs[evId]
      const scanText = `${toTurns(scanLog, 10).map((t) => t.content).join('\n')}${userMsg ? `\n${userMsg}` : ''}`
      let loreBlock = ''
      try {
        const books = await loadActiveBooks()
        if (books.length) {
          loreBlock = buildLoreContext(books, {
            scanText,
            contextText: `${ev.group} · ${ev.title} · ${ev.place} ${ev.summary}`,
            gate: allowGateFor({ epDone, ends: world.ends }, evId),
          })
        }
      } catch {
        loreBlock = ''
      }

      // 预设导演指令：由「管理预设」套用后落下的生效快照提供；与本回合扫描同一份文本
      // scope='main' —— 只取管主线叙事的那一支；短信专用条目（篇幅、发言格式）在这里出局
      const preset = buildPresetContext(readActivePreset(), scanText, 'main')

      // 通联日志身份：这一趟是谁在问、预设实际进了哪几条、世界书命中多少
      const presetInfo = activePresetInfo()
      const logMeta: AiLogMeta = {
        channel: '主线剧情',
        act: opts?.long ? '事件衔接' : '回合推演',
        preset: { id: presetInfo.id, name: presetInfo.name, hits: preset.hits, prefill: presetInfo.prefill },
        lore: { chars: loreBlock.length, hits: loreHitsOf(loreBlock) },
      }

      const system = buildDirectorSystem(ev, {
        operatorName,
        bondNow,
        epDone,
        flags: world.flags,
        needDirective: needDir.current,
        loreContext: loreBlock || undefined,
        nextEvent: nextEv,
        presetPre: preset.pre || undefined,
        presetPost: preset.post || undefined,
        battleLog: battleLog || undefined,
      })
      const base = toTurns(baseOverride ?? logs[evId])
      const messages: ChatTurn[] = [{ role: 'system', content: system }, ...base]
      if (userMsg) messages.push({ role: 'user', content: userMsg })
      // 预填充（酒馆的 assistant_prefill）：先替模型摆个开头，它顺着这句往下写。
      // 结尾挂一条 assistant 消息是标准路子；预填本身也要先上屏，否则界面像吞了半句。
      const prefill = readActivePrefill()
      const outbox = prefillTurns(messages, prefill)

      // 单回合输出预算：可在终端设置里按通道调高（思考型模型容易先把预算耗在内部思考上）。
      // 事件衔接回合（opts.long）放宽预算——衔接文本「可以长」。
      const budget = Math.max(800, cfgMain!.maxTokens || 1500)
      const turnBudget = opts?.long ? Math.max(2600, Math.round(budget * 1.6)) : budget
      // 正文为空且疑似思考耗尽预算 → 自动加大预算补发一次，避免动辄卡在手动「要求补发」
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const ctrl = new AbortController()
          abortRef.current = ctrl
          // 流式：途中只累积原文并以无副作用投影上屏活气泡；
          // 收尾（或长度上限/中断）才落正式消息，指令只在完整收口时落地一次。
          let acc = prefill
          let settled = false
          try {
            const budget = attempt === 1 ? turnBudget : Math.max(5000, Math.round(turnBudget * 1.8))
            // 流式开关（终端设置 · 主线剧情通道）：关掉即整段接收，后续解析路径完全一致
            const res: StreamResult = cfgMain!.stream === false
              ? { text: await chatCompletion(cfgMain!, outbox, { signal: ctrl.signal, maxTokens: budget, meta: logMeta }) }
              : await chatCompletionStream(cfgMain!, outbox, {
                signal: ctrl.signal,
                maxTokens: budget,
                meta: logMeta,
                onDelta: (chunk) => {
                  if (settled || !chunk) return
                  acc += chunk
                  setLive({ evId, text: acc })
                },
              })
            settled = true
            setLive(null)

            // 预填那一截也算正文的一部分 —— 模型只写后半句，拼回去才是完整的一条
            const full = (prefill + (res.text ?? '')).trim()

            // 空答 / 拒答诊断；若是思考把预算吃光，先自动重试一次
            if (!full) {
              const thought = (res.reasoning ?? '').trim()
              const why = res.refusal
                ? `推演通道拒绝作答${res.refusal ? ` · ${res.refusal}` : ''}`
                : res.finishReason === 'length'
                  ? (thought
                      ? `通道在内部思考上花费过久（约 ${thought.length} 字）把输出预算耗尽，正文为空。`
                      : '回复已达长度上限，且未产出任何正文。')
                  : '通道未返回任何内容。'
              if (attempt < 2) {
                push('info', '正文为空，自动重试', '已催通道直接作答并加大输出预算，正在补发一次。', false)
                // 催的是 outbox（预填挂在它末尾），别推回 messages —— 那一份不会再发出去
                outbox.push({ role: 'user', content: RETRY_NUDGE })
                continue
              }
              needDir.current = true
              setErr(why)
              push('danger', '推演中断', why, false)
              return
            }

            // 到达长度上限：指令块可能被截断在半途 → 只保留叙述、绝不落地半截指令
            if (res.finishReason === 'length') {
              const shown = extractLiveDisplay(acc)
              if (shown) {
                appendMsg(evId, { id: idFor(), from: 'them', text: shown, time: clock() })
                needDir.current = true
              }
              push('warn', '回复已达长度上限', '正文可能被截断；本回合未自动落地指令，可点「要求补发指令」补收，或在终端设置里调高该通道的输出预算。', false)
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
            // 观测者已切到别的模块：这一回合是在后台跑完的，报一声，别忘了它
            if (plotMounts === 0) {
              const evTitle = TIMELINE.find((e) => e.id === evId)?.title ?? '本段'
              push('decode', '推演已完成', `《${evTitle}》的新一段已写定，回到剧情推进即可查看。`, false)
            }
            return
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
            push('danger', '推演中断', msg, false)
            return
          } finally {
            abortRef.current = null
          }
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, ready, cfgMain, operatorName, bondNow, world.flags, world.ends, epDone, logs, appendMsg, applyReply, push],
  )

  const send = async () => {
    const text = draft.trim()
    if (!focusEv || busy || !text) return
    // 收束态下继续发话 = 留在本事件继续推演 → 取消收束标记
    setConcluded(null)
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
      const system = buildDirectorSystem(ev, { operatorName, bondNow, epDone, flags: world.flags, needDirective: false })
      const messages: ChatTurn[] = [
        { role: 'system', content: system },
        ...toTurns(logs[ev.id]),
        { role: 'user', content: DRAFT_PROMPT },
      ]
      const res = await chatCompletion(cfgMain!, messages, {
        signal: ctrl.signal,
        maxTokens: cfgMain!.maxTokens || 1500,
        meta: { channel: '主线剧情', act: '行动起草' },
      })
      const text = (res ?? '').trim()
      if (!text) {
        setDraftErr('通道没有返回可用内容，可再试一次。')
        return
      }
      const sugg = parseDraftLines(text)
      if (!sugg.length) {
        setDraftErr('未解析出可用的候选，可再试一次。')
        return
      }
      setDraftSugg(sugg)
      push('info', '代拟', `已草拟 ${sugg.length} 条可发送的行动/话语，点选一条填入。`, false)
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
    setConcluded(null)
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
    setConcluded(null)
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
    setConcluded(null)
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
    setConcluded(null)
    appendMsg(focusEv.id, { id: idFor(), from: 'user', text: t, time: clock() })
    await pushTurn(focusEv.id, t)
  }

  /* —— 既定行动快捷槽（若该事件有 choices） —— */
  const scene = focusEv ? SCENES[focusEv.id] : undefined
  const choices = scene?.choices?.filter((ch) => ch && world.pick[focusEv!.id] !== ch.key) ?? []
  const alreadyPicked = focusEv ? !!scene?.choices?.length && !!world.pick[focusEv.id] : false

  const quickAct = async (key: string) => {
    if (!focusEv || busy) return
    setConcluded(null)
    const ch = SCENES[focusEv.id]?.choices?.find((c) => c.key === key)
    if (!ch) return
    // 依原著既定余波确定性落地（等价旧 choose 语义）
    // 先落本地，再发消息让模型据「已发生事实」续写，避免重复累计
    recordPick(focusEv.id, ch.key)
    if (ch.bond) for (const b of ch.bond) bumpBond(b.char, b.delta)
    if (ch.flag) setFlag(ch.flag[0], ch.flag[1])
    push('decode', '行动已定 · 终端留存', ch.label, false)
    const text =
      `（言万心叶的行动已定，并已由终端自动存档：）${ch.label}。\n`
      + `（该行动的既定余波：${ch.after}）\n`
      + '请把上述视为已经发生的事实，从此刻的局势接续叙述；不要重复该行动本身，也不要再次累计随该行动记录过的羁绊或标记。'
    appendMsg(focusEv.id, { id: idFor(), from: 'user', text, time: clock() })
    await pushTurn(focusEv.id, text)
  }

  /** 「进入下一事件」（收束栏主按钮）：此刻才写记录并推进到下一事件，随后让导演生成自然衔接开场 */
  const advanceFromConcluded = async () => {
    const ev = focusEv
    if (!ev || busy || !ready || !concluded || concluded.evId !== ev.id) return
    // 这一格里有还没了结的交战：打赢它，才走得下去
    if (pendingBattle && pendingBattle.evId === ev.id) {
      push('warn', '尚有交战未了', `《${pendingBattle.name}》还在现场 —— 打赢它，这一段才继续。`, false)
      return
    }
    const digest = concluded.digest || ev.summary
    completeEvent(ev.id, digest, 'online', concluded.diverged) // 此刻才写记录 + epDone → focus 落到下一事件
    setConcluded(null)
    push('decode', '事件收束 · 已写入记录', `${ev.title}（已写入低语者日志）`, false)
    const evIdx = TIMELINE.findIndex((t) => t.id === ev.id)
    const nextEv = evIdx >= 0 ? (TIMELINE.slice(evIdx + 1).find((t) => !epDone[t.id] && t.id !== ev.id) ?? null) : null
    if (nextEv && showOnline && ready) {
      const lastUser = [...(logs[ev.id] ?? [])].reverse().find((m) => m.from === 'user')?.text
      skipAutoOpen.current = true // 先按住自动开场，避免抢跑
      try {
        await pushTurn(nextEv.id, bridgePrompt(ev.title, ev.group, digest, concluded.diverged, lastUser), undefined, { long: true })
      } finally {
        skipAutoOpen.current = false // 失败时放行 → 自动开场兜底
      }
    }
  }

  /** 补发指令：仅要求模型回一个事件指令块 */
  const resendDirective = async () => {
    if (!focusEv || busy || !ready) return
    setBusy(true)
    setErr(null)
    const ev = focusEv
    const system = buildDirectorSystem(ev, { operatorName, bondNow, epDone, flags: world.flags, needDirective: true })
    const messages: ChatTurn[] = [
      { role: 'system', content: system },
      ...toTurns(logs[ev.id]),
      { role: 'user', content: '（终端自动请求）请补发本回合的事件指令（JSON 围栏或 <vars> 标签皆可）：仅输出指令本身，无需展开叙述；若无任何变化则输出 {}。' },
    ]
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await chatCompletion(cfgMain!, messages, { signal: ctrl.signal, maxTokens: cfgMain!.maxTokens || 1500 })
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
      push('danger', '推演中断', msg, false)
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

    // 序章与第 1 话之外，导演一律不自动开篇
    const auto = TIMELINE.findIndex((e) => e.id === evId) <= AUTO_OPEN_THRU_IDX

    const scOpen = SCENES[evId]?.open?.trim()
    if (!openings.length && scOpen) {
      const opening: ChatMsg = { id: idFor(), from: 'them', text: scOpen, time: clock(), meta: { opening: true } }
      appendMsg(evId, opening)
      // 自足完整的开场（SagaScene.standby）注入后原地待命，等操作员回话，不再自动让导演续写
      if (auto && !skipAutoOpen.current && !SCENES[evId]?.standby) void pushTurn(evId, CONTINUE_PROMPT, [opening])
    } else if (auto && !skipAutoOpen.current) {
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
    setConcluded(null)
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

  /* —— 内嵌预设条：套用/另存/导入「方案」（不含密钥，存于本机 zts-schemes:v1） —— */

  /** 同步方案下拉的数据源（打开时重读一次，兼容在设置页刚新增/删除的情形） */
  const refreshSchemes = () => {
    const cur = listSchemes()
    setSchemes((prev) => (prev.length === cur.length && prev.every((s, i) => s.id === cur[i]?.id) ? prev : cur))
  }

  /** 打开「管理预设」：优先调正在生效的那个，否则第一份；没有方案就提示 */
  const openPresetManager = () => {
    const list = listSchemes()
    setSchemes(list)
    if (!list.length) {
      push('warn', '尚无方案', '先在下方命名并存一份方案，再回来调它的指令条目。', false)
      return
    }
    const act = activePresetId()
    setManageOf(list.find((s) => s.id === act) ?? list[0])
  }

  /** 管理预设 · 保存：只改本地方案记录（patchScheme 会同步生效快照） */
  const savePresetFromPlot = (s: Scheme, patch: { entries: PresetEntry[]; loreEntryOff: Record<string, string[]> }) => {
    setSchemes(patchScheme(s.id, patch))
    setManageOf(null)
    const on = patch.entries.filter((e) => e.enabled !== false && !e.placeholder).length
    const all = patch.entries.filter((e) => !e.placeholder).length
    push('success', '已保存预设', `${s.name} · 指令条目 ${on}/${all} 启用`, false)
  }

  const applySchemePreset = async (s: Scheme) => {
    try {
      const cfg = await applySchemePersisted(s)
      if (cfg && cfgMain !== undefined) setCfgMain(cfg.main)
      push('success', '已应用方案', `${s.name} · 主线/短信两通道参数与世界书启用已套用`, false)
    } catch (e) {
      push('danger', '应用失败', e instanceof Error ? e.message : String(e), false)
    }
  }

  const saveCurrentAsScheme = async () => {
    const n = presetName.trim()
    if (!n) {
      push('warn', '方案名不能为空', '先为当前两通道参数命名。', false)
      return
    }
    try {
      const s = await capturePersisted(n)
      const next = [...schemes.filter((x) => x.id !== s.id), s]
      setSchemes(next)
      storeSchemes(next)
      setPresetName('')
      push('success', '已存为方案', `${n}（不含接口密钥）`, false)
    } catch (e) {
      push('danger', '保存失败', e instanceof Error ? e.message : String(e), false)
    }
  }

  /** 导入外部 ST ChatPreset：解析并整体落地（加入本机方案 + 套用），顺带刷新本页主线配置 */
  const importPresetFile = async () => {
    const picked = await readJsonFile()
    if (picked === null) {
      push('warn', '未能读取文件', '所选文件不是可解析的 JSON。', false)
      return
    }
    try {
      const r = await importChatPresetFile(picked.json, picked.name)
      if (!r.ok) {
        push('warn', '无法识别为 ChatPreset', r.warn, false)
        return
      }
      const next = [...schemes.filter((x) => x.id !== r.scheme.id), r.scheme]
      setSchemes(next)
      storeSchemes(next)
      if (r.cfg && cfgMain !== undefined) setCfgMain(r.cfg.main)
      push('success', '已导入并应用 ChatPreset', `${r.scheme.name}${r.model ? ` · ${r.model}` : ''}${r.note ? `（${r.note}）` : ''}`, false)
    } catch (e) {
      push('danger', '导入失败', e instanceof Error ? e.message : String(e), false)
    }
  }

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
        {/* 大纲默认不显示（尚未发生的收束摆在侧栏＝剧透），但代码留着：
            把 SHOW_OUTLINE 改回 true 即可恢复。导演照常拿到它，见 plot.ts 的事件大纲。 */}
        {SHOW_OUTLINE ? (
          <div>
            <div className="tiny muted" style={{ marginBottom: 6, color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>大纲 · 唯一事实来源</div>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.85, margin: 0, color: 'var(--ink-mute)' }}>{focusEv.summary}</p>
          </div>
        ) : null}
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
            {castRows.map((r) => {
              const bond = bondNow(r.id)
              const met = isMet(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  data-plot-cast={r.id}
                  className={css.castRow}
                  style={{ '--c': r.hue } as CSSProperties}
                  onClick={() => openProfile(r.id)}
                  title={met ? `调阅 ${r.name} 的档案` : `${r.name} 的档案尚未显影`}
                >
                  {met ? (
                    <Portrait avatarId={r.id} name={r.name} hue={r.hue} sigil={r.sigil} size={26} round />
                  ) : (
                    /* 未遇见的不露脸，与档案页「？？？」同口径 */
                    <span className="glyph" style={{ '--g': r.hue, width: 26, height: 26 }}>
                      <span style={{ fontSize: 12 }}>{r.sigil}</span>
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 12.5 }}>{r.name}</b>
                  </span>
                  <span className="tiny mono" style={{ color: 'var(--ink-mute)' }}>{met ? bond : '?'}</span>
                </button>
              )
            })}
            {castRows.length === 0 ? (
              <span className="tiny muted" style={{ color: 'var(--ink-faint)' }}>本段无在册在场者。</span>
            ) : null}
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

  /* —— 台词框渲染辅助 —— */
  const opName = operatorName.trim() ? operatorName : '言万心叶'
  /** 把一段正文按「旁白 / 台词框」逐段渲染：
      narr → 通栏叙述行（不分侧）；say(其它角色) → 整框靠左、立绘嵌左缘、名字嵌左上顶边；
      you(操作员) → 整框镜像、立绘嵌右缘、名字嵌右上顶边。 */
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
          <div className={`${css.frame} ${css.youFrame}`}>
            <span className={css.dlgName}>{opName}</span>
            <div className={css.frameRow}>
              <span className={css.bubble}>
                <Linkified text={seg.text} />
              </span>
              <Portrait avatarId="operator" width={64} style={{ width: 64, height: '100%', borderRadius: 0 }} className={css.framePortrait} />
            </div>
          </div>
        </div>
      )
    }
    const c = personOf(seg.id)
    const hue = c?.hue ?? '#7fb4ff'
    return (
      <div key={key} className={css.sayRow} data-say="1" data-say-for={seg.id}>
        <div className={`${css.frame} ${css.sayFrame}`}>
          <span className={css.dlgName} style={{ color: hue }}>{c?.name ?? seg.id}</span>
          <div className={css.frameRow}>
            <Portrait avatarId={seg.id} width={64} style={{ width: 64, height: '100%', borderRadius: 0 }} className={css.framePortrait} />
            <span className={css.bubble}>
              <Linkified text={seg.text} />
            </span>
          </div>
        </div>
      </div>
    )
  }

  /* 往期正文的只读渲染：台词与叙述照旧，但不再挂「从此重来／接续选项」这些按钮——
     那些只对当前这一段有意义。 */
  const histMsg = (m: ChatMsg, key: Key) => {
    if (m.from === 'user') {
      return (
        <div key={key} className={css.youRow} data-you="1">
          <div className={`${css.frame} ${css.youFrame}`}>
            <span className={css.dlgName}>{opName}</span>
            <div className={css.frameRow}>
              <span className={css.bubble}>
                <Linkified text={m.text} />
              </span>
              <Portrait avatarId="operator" width={64} style={{ width: 64, height: '100%', borderRadius: 0 }} className={css.framePortrait} />
            </div>
          </div>
          <span className={`muted tiny ${css.youFoot}`}>{m.time}</span>
        </div>
      )
    }
    return (
      <div
        key={key}
        className={m.meta?.opening ? `${css.narr} ${css.open}`
          : m.meta?.battle ? `${css.narr} ${css.fight}` : css.narr}
        data-narration={m.meta?.opening ? 'opening' : m.meta?.battle ? 'battle' : 'director'}
      >
        <div className={css.narrMeta}>
          <b>{m.meta?.opening ? '开场白 · 原文' : m.meta?.battle ? '交战 · 成文' : '导演叙述'}</b>
          <span className="muted tiny">{m.time}</span>
        </div>
        {splitSpeech(m.text).map((seg, si) => segNode(seg, si))}
      </div>
    )
  }

  /* 往期正文：推过的事件不从版面上撤走，玩家要能一直往回翻（不缓存，代价可忽略） */
  const pastBlocks = TIMELINE
    .filter((e) => e.id !== focusEv?.id && (logs[e.id]?.length ?? 0) > 0)
    .map((e) => ({ ev: e, msgs: logs[e.id] }))

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
                if (!ready) push('warn', '主线通道未配置', '请先在「终端设置 · 剧情推演通道」中填入接口地址与模型。')
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

      {/* 内嵌预设条：套用/另存/导入方案（不含密钥；随时可在「设置」里做更细的方案管理） */}
      <div className={css.presetBar}>
        <span className={`tiny muted ${css.presetKicker}`}>方案 · PRESET</span>
        <select
          className="field"
          style={{ width: 'auto', maxWidth: 220, fontSize: 12 }}
          aria-label="套用终端方案"
          title="把方案参数一键套用到主线/短信两通道（不含密钥）"
          defaultValue=""
          onFocus={refreshSchemes}
          onChange={(e) => {
            const id = e.currentTarget.value
            e.currentTarget.value = ''
            const s = schemes.find((x) => x.id === id)
            if (s) void applySchemePreset(s)
          }}
        >
          <option value="">{schemes.length ? `选择方案套用（${schemes.length}）…` : '暂无终端方案'}</option>
          {schemes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className={css.presetDivider} />
        <input
          className="field"
          style={{ width: 'auto', maxWidth: 150, fontSize: 12 }}
          placeholder="存当前参数为方案…"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveCurrentAsScheme() } }}
        />
        <button
          className="btn btn--ghost"
          style={{ fontSize: 12, padding: '6px 11px', flex: '0 0 auto' }}
          onClick={() => void saveCurrentAsScheme()}
          title="把当前主线/短信参数存成命名方案（密钥不进方案）"
        >
          <FloppyDisk size={13} weight="bold" /> 存
        </button>
        <button
          className="btn btn--ghost"
          style={{ fontSize: 12, padding: '6px 11px', flex: '0 0 auto' }}
          onClick={() => void importPresetFile()}
          title="导入外部 SillyTavern ChatPreset 为方案并套用"
        >
          <UploadSimple size={13} weight="bold" /> 导入预设
        </button>
        <button
          className="btn btn--ghost"
          style={{ fontSize: 12, padding: '6px 11px', flex: '0 0 auto' }}
          onClick={openPresetManager}
          title="管理预设：调本预设自带的指令条目（生成行为 / 文本格式）与世界书词条开关"
        >
          <SlidersHorizontal size={13} weight="bold" /> 管理预设
        </button>
        <span className={`tiny muted ${css.presetHint}`}>密钥不进方案，只留本终端</span>
      </div>

      {manageOf && (
        <PresetManager
          scheme={manageOf}
          onSave={(patch) => savePresetFromPlot(manageOf, patch)}
          onClose={() => setManageOf(null)}
        />
      )}

      <div className={css.layout}>
        <section className="panel" data-session-area="1">
          <div className="panel__head">
            <span className="panel__title">事件会话 <span className="slash" /></span>
            {showOnline ? (
              <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
                {busy ? '推演中…' : activeLog.length ? '回车送出' : '尚未开始'}
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
                  <span>当前为离线环境。填入接口地址与模型后即可在线推演；或按下方「离线通读」读本段原文。</span>
                  <button className="btn btn--amber" style={{ fontSize: 12 }} onClick={() => navigate('settings')}>
                    前往设置
                  </button>
                </div>
              ) : null}

              {showOnline && ready && autoOpens && !skipAutoOpen.current && activeLog.length === 0 && !busy ? (
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
                {pastBlocks.map((b) => (
                  <div key={b.ev.id} className={css.pastBlock} data-past={b.ev.id}>
                    <div className={css.pastHead}>
                      <b>{b.ev.title}</b>
                      <span className="muted tiny">{b.ev.group} · {b.ev.phase}</span>
                    </div>
                    {b.msgs.map((m, i) => histMsg(m, `${b.ev.id}-${i}`))}
                  </div>
                ))}
                {pastBlocks.length ? (
                  <div className={css.pastHead} data-cur-head="1">
                    <b>{focusEv?.title}</b>
                    <span className="muted tiny">{focusEv?.group} · {focusEv?.phase}</span>
                  </div>
                ) : null}
                {activeLog.length === 0 ? (
                  <div className={css.emptyHint}>
                    <b>{ready ? '从头推演这一事件' : '此段尚无会话'}</b>
                    <span>
                      {ready
                        ? (pastBlocks.length
                          ? '写下的都留在上面了。本段由你起头——输入任意消息开始这一事件。'
                          : '输入任意消息，导演会依据大纲铺陈局势并由你接续行动；亦可点上方「既定行动」直接走关键抉择。')
                        : '配置主线通道后即可在线推演；当前可切「离线通读」阅读本段原文。'}
                    </span>
                  </div>
                ) : (
                  activeLog.map((m, i) =>
                    m.from === 'them' ? (
                      <div key={m.id}
                        className={m.meta?.opening ? `${css.narr} ${css.open}`
                          : m.meta?.battle ? `${css.narr} ${css.fight}` : css.narr}
                        data-narration={m.meta?.opening ? 'opening' : m.meta?.battle ? 'battle' : 'director'}
                      >
                        <div className={css.narrMeta}>
                          <b>{m.meta?.opening ? '开场白 · 原文' : m.meta?.battle ? '交战 · 成文' : '导演叙述'}</b>
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
                        <div className={`${css.frame} ${css.youFrame}`}>
                          <span className={css.dlgName}>{opName}</span>
                          <div className={css.frameRow}>
                            <span className={css.bubble}>
                              <Linkified text={m.text} />
                            </span>
                            <Portrait avatarId="operator" width={64} style={{ width: 64, height: '100%', borderRadius: 0 }} className={css.framePortrait} />
                          </div>
                        </div>
                        <span className={`muted tiny ${css.youFoot}`}>
                          {m.time}
                          {showOnline && ready && !busy ? (
                            <button type="button" className="linkGo" onClick={() => rollbackAt(i)}>从此重来</button>
                          ) : null}
                        </span>
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

              {pendingBattle && pendingBattle.evId === focusEv.id && ready && !busy ? (
                <div className={css.battleBar} data-plot-battle={pendingBattle.mission.id}>
                  <div className={css.battleHead}>
                    <b>交战 · {pendingBattle.name}</b>
                    <div className={css.battleActs}>
                      <button
                        className="btn btn--primary"
                        style={{ fontSize: 12 }}
                        data-enter-battle="1"
                        onClick={() => setPlotBattle({ mission: pendingBattle.mission, squad: pendingBattle.squad })}
                        title="按现场这几个人开打；打赢了本事件才继续"
                      >
                        <Sword size={14} weight="bold" /> 进入战斗
                      </button>
                    </div>
                  </div>
                  <div className={css.battleRoster}>
                    {pendingBattle.squad.map((id) => (
                      <span key={id} className={css.battleWho}>{personOf(id)?.name ?? id}</span>
                    ))}
                  </div>
                  <span className={css.battleNote}>
                    这一仗要打赢：撤退或战败都回到正文，按钮还在。应敌的只有现场这几个人，别处的人调不过来。
                  </span>
                </div>
              ) : null}

              {concluded && concluded.evId === focusEv.id && ready && !busy ? (
                <div className={css.concludedBar} data-concluded="1">
                  <div className={css.concludedHead}>
                    <b>本事件已收束 · 《{concluded.title}》</b>
                    <div className={css.concludedActs}>
                      <button
                        className="btn btn--primary"
                        style={{ fontSize: 12 }}
                        onClick={() => void advanceFromConcluded()}
                        title="写入记录并推进到下一事件，自动生成衔接开场"
                      >
                        进入下一事件 <ArrowRight size={13} weight="bold" />
                      </button>
                      <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('saga')}>
                        查看记录
                      </button>
                    </div>
                  </div>
                  <div className={css.concludedDigest} title={concluded.digest}>{concluded.digest}</div>
                  <span className={css.concludedNote}>
                    {concluded.diverged ? '分歧路线 · ' : ''}结尾叙述已完整上屏。点「进入下一事件」即写入记录并衔接下一段；正文不会消失，也可继续发话留在此事件。
                  </span>
                </div>
              ) : null}

              {ready ? (
                <>
                  {draftSugg && draftSugg.length ? (
                    <div className={css.draftSugg}>
                      <div className={css.draftSuggHead}>
                        <b>代拟 · 言万心叶可说的下一步</b>
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
                      placeholder={`推进事件：向导演传达言万心叶的行动…（回车送出）`}
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
                      aria-label="代拟行动候选"
                    >
                      {drafting ? <span className={css.draftSpin} aria-hidden="true" /> : null}
                      <MagicWand size={16} weight="bold" />
                      <span>{drafting ? '起草中…' : '代拟'}</span>
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
                  {/* 与后面生成的正文同一种排法：旁白走 narrText、台词走气泡 ——
                      以前这里单开了一套「书」的字号，同一段正史两种长相。 */}
                  {splitSpeech(offState.text).map((seg, si) =>
                    seg.kind === 'narr' ? (
                      <div key={si} className={css.narrText}>
                        <Linkified text={seg.text} />
                      </div>
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

      {/* 剧情交战：指令输出 battle 时按现场的角色与敌人开打；打完回到正文 */}
      {plotBattle ? (
        <Battle
          key={plotBattle.mission.id}
          mission={plotBattle.mission}
          squad={plotBattle.squad}
          /* 「变成他人」可借的档案：已遇见、且不在这支队伍里 */
          morphPool={PERSON_IDS.filter((id) => id !== OPERATOR_ID && isMet(id) && !plotBattle.squad.includes(id))}
          progress={periodProgress(epDone)}
          growth={effectiveGrowth(growth, levels)}
          stamina={stamina}
          equip={equip}
          owned={gearBag}
          bag={bag}
          /* 上阵这几个人跟你的羁绊 —— 连携接得多快、本人多硬气都看它 */
          bond={bondOfSquad(plotBattle.squad)}
          coin={coin}
          /* 撤退或战败：回到正文，这一仗还没了结 —— pendingBattle 留着，按钮还在 */
          onExit={async (spLeft, eq) => {
            await settleExit(spLeft, eq, stamina)
            setEquip(eq)
            setPlotBattle(null)
            await loadKit()
          }}
          /* 打赢：这一仗翻篇，收束栏的「进入下一事件」这才放行 */
          onSettled={async (rec: BattleRecord, spLeft, eq, bagLeft) => {
            const line = await settleWin({ rec, spLeft, equip: eq, bag: bagLeft, stamina, bumpBond })
            push('success', '交战归档', line, false)
            /* 归档文书之外的这一份：把这一场写成剧情正文，回填到本事件的推演里 ——
               故事要接着往下读，不能只在作战记录里留一份公文。
               成文归成文，底稿照旧：只写真发生过的事，对话照抄已经喊过的台词。 */
            const evId = pendingBattle?.evId
            if (evId) {
              const story = await narrateStorylog(rec)
              setLogs(persistMsg(evId, {
                id: idFor(), from: 'them', text: story, time: clock(), meta: { battle: true },
              }))
            }
            setPlotBattle(null)
            setPendingBattle(null)
            await loadKit()
          }}
        />
      ) : null}
    </div>
  )
}
