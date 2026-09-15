/* ============================================================
   角色短信 · 主动来信（lib/smsauto.ts）
   ------------------------------------------------------------
   已经「遇见」过、档案解锁、却**不在眼前这段事件里**的角色，
   会隔一阵子自己发一条短信过来 —— 不是回应、不是任务，就是随手发来的一句话。

   调度器挂在常驻的 Shell 上（不在电话页也照跑），所以：
   ① 来信与观测者在哪个模块无关；
   ② 收下的这条直接落盘（lib/sms.ts），侧栏与联系人行上的未读角标立刻亮。

   频率是刻意的克制：**每 20 分钟滚一格，格子上再过一道 45% 的骰**
   （滚过就算用掉，不中的格子不补掷 —— 所以是「每格 45%」不是「每格至少一条」），
   同一个人至少隔 45 分钟 —— 免得一打开终端就涌进来一堆寒暄。
   ============================================================ */

import { useEffect, useRef } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { EPISODES } from './freetime'
import { castOf } from './cast'
import { TAVERN_PERSONAS, charOf } from '../data/personas'
import { chatCompletion, isReady, loadProfile } from './api'
import { activePresetInfo, buildPresetContext, readActivePreset } from './preset'
import { dateReady, extractLiveDisplay, parseDirectorReply, replyDisplayText, smsDirective } from './plot'
import { appendSmsMsg, incomingSms, loadSmsLogs, markUnread, smsTurns, systemPrompt } from './sms'
import { INTIMATE_BOND } from '../data/intimate'
import { openDateOf, openRendezvous } from './rendezvous'
import { plotContextFor } from './crosslink'

export const AUTO_KEY = 'zts-sms-auto:v1'

/** 一格有多长：每 20 分钟滚一格（一格 = 一次判定） */
export const ROLL_EVERY_MS = 20 * 60 * 1000
/** 每一格命中的概率 —— **中没中，这一格都用掉**（见 `rollStep` 与文件头） */
export const HIT_CHANCE = 0.45
/** 同一个人两次主动来信之间 */
export const SAME_CHAR_MS = 45 * 60 * 1000
/** 巡查间隔 */
const TICK_MS = 45 * 1000

export interface AutoState {
  /**
   * 上一次**滚格**的时刻（epoch ms）—— 注意不是「上一次来信」：
   * 那一格掷偏了也照样记，否则下一 tick 会拿同一次 45% 反复掷，
   * 实际频率就退化成「每 45 秒一次骰」（见 `rollStep` 的注释）。
   */
  roll: number
  /** 每个人上一次主动来信的时刻 */
  per: Record<string, number>
}

/** 这一刻该怎么走 —— 调度器的规矩全在这儿，与 React / localStorage 无关（mech 直接验它） */
export type RollStep =
  /** 钟还没对上（首次进游戏 / 旧档没有这一项）：只对钟，**当场不掷** */
  | 'seed'
  /** 还没到下一格 */
  | 'wait'
  /** 到格了，该掷骰 */
  | 'roll'

export function rollStep(state: AutoState, now: number): RollStep {
  if (!state.roll) return 'seed'
  return now - state.roll >= ROLL_EVERY_MS ? 'roll' : 'wait'
}

/** 存档里那个数是「滚格时刻」，得是有限数才算数 */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function loadState(): AutoState {
  try {
    const raw = localStorage.getItem(AUTO_KEY)
    if (!raw) return { roll: 0, per: {} }
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return { roll: 0, per: {} }
    const o = p as Record<string, unknown>
    const per: Record<string, number> = {}
    if (o.per && typeof o.per === 'object' && !Array.isArray(o.per)) {
      for (const [k, v] of Object.entries(o.per as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) per[k] = v
      }
    }
    /* 旧档里那一项叫 `last`（当年是「到点必发」的上一次来信时刻），含义与现在这一格
       不同但**同样是「上一轮是什么时候」** —— 直接续上，等于把改版前的等待接过来，
       不必让升级的人白等一格，也不必清档。 */
    const roll = num(o.roll) || num(o.last)
    return { roll, per }
  } catch {
    return { roll: 0, per: {} }
  }
}

function saveState(s: AutoState): void {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式下降级：退化为「本次会话内不重复」 */
  }
}

/**
 * 本段事件里的在场者（这些人在眼前，不主动发短信）。
 *
 * 走 `EPISODES` 而不是 `TIMELINE`：卷间那几格自由时间也有一段「此刻在场上的是谁」
 * （它续着上卷末尾那一节，见 lib/freetime.ts），照 `TIMELINE` 找会跳过那一格、
 * 落到**下一卷开头**的名册上 —— 那就会出现「这一格演的是谁都不对」的错位。
 */
function onStageIds(epDone: Record<string, boolean>): Set<string> {
  const focus = EPISODES.find((e) => !epDone[e.id])
  return new Set(focus ? castOf(focus) : [])
}

/**
 * 这一位此刻可不可以主动发一条 —— **四道条件叠着，全过了才发**。
 *
 *   ① **短信页开着**（`unlocked`）。卷一「欢迎来到，终末停滞委员会」走完之前，
 *      短信是受门禁保护的那一档（`LOCKED_VIEWS` 里就有 `tavern`）：信收不到、
 *      页点不进去，可来信仍会把未读角标挂在**锁着的**模块上 —— 那一段**谁都不发**。
 *   ② 遇见过（`met`）—— 没见过的人不该有你的号码。
 *   ③ 不在眼前这一段事件里（`!onStage`）—— 人站在面前，不会同时给你发短信。
 *   ④ 距她上一次来信够久（`SAME_CHAR_MS`）—— 免得同一位连着刷屏。
 *
 * 单独拎出来，是因为这四条是**规矩**、不是流程：mech 直接验它（§37）。
 * 写在挑选那一步的 `filter` 里、而不是 tick 顶上提前 return ——
 * 这样没解锁的那一段照样滚格、照样掷骰（掷空而已），解锁之后不必白等一格。
 */
export interface SendGate {
  /** 短信页解锁了没（卷一门禁） */
  unlocked: boolean
  /** 遇见过、档案已解锁 */
  met: boolean
  /** 此刻就在眼前这一段事件里 */
  onStage: boolean
  /** 她上一次主动来信的时刻（0 = 从没发过） */
  last: number
  now: number
}

export function canSendNow(g: SendGate): boolean {
  return g.unlocked && g.met && !g.onStage && g.now - g.last >= SAME_CHAR_MS
}

/**
 * 主动来信的调度钩子。挂在常驻的 Shell 上，全局只有一份。
 */
export function useProactiveSms(): void {
  const { operatorName, isMet, bondNow, epDone, push, world, unlocked } = useTerminal()
  /* 上下文放进 ref：调度是「到点才看」的，闭包不该因为依赖变化而重启计时 */
  const ctx = useRef({ operatorName, isMet, bondNow, epDone, push, world, unlocked })
  ctx.current = { operatorName, isMet, bondNow, epDone, push, world, unlocked }

  const inFlight = useRef(false)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      if (!alive || inFlight.current) return
      if (document.visibilityState !== 'visible') return
      const c = ctx.current
      const now = Date.now()
      const state = loadState()
      const step = rollStep(state, now)
      /* 钟还没对上：只记下此刻，**当场不掷** —— 否则刚进游戏那一下就等于白捡一次 45% */
      if (step === 'seed') {
        saveState({ roll: now, per: state.per })
        return
      }
      if (step === 'wait') return

      /* 到格了，先掷这一骰，**中没中这一格都用掉**：掷完先落盘，下面无论从哪一处提前返回
         （没人在名单上、通道没配好、生成失败），这一格都不再重掷 ——
         「每 20 分钟 45%」与「每 20 分钟至少一条」的分界就在这一笔。 */
      const hit = Math.random() < HIT_CHANCE
      saveState({ roll: now, per: state.per })
      if (!hit) return

      // 在「短信已解锁、遇见过、且不在眼前这段事件里」的人中挑一个（规矩见 `canSendNow`）
      const stage = onStageIds(c.epDone)
      const metas = TAVERN_PERSONAS.map((p) => p.charId).filter((id) => canSendNow({
        unlocked: c.unlocked,
        met: c.isMet(id),
        onStage: stage.has(id),
        last: state.per[id] ?? 0,
        now,
      }))
      if (!metas.length) return

      const cfg = await loadProfile('sms').catch(() => null)
      if (!alive || !cfg || !isReady(cfg)) return

      // 挑人：优先挑最久没来信的，再在其中随机，避免总是同一位先开口
      const oldest = metas
        .slice()
        .sort((a, b) => (state.per[a] ?? 0) - (state.per[b] ?? 0))
        .slice(0, Math.min(3, metas.length))
      const charId = oldest[Math.floor(Math.random() * oldest.length)]

      inFlight.current = true
      /* 记她这一笔：同一个人 45 分钟内不接第二条（这一格本身早已用掉，见上）。 */
      saveState({ roll: now, per: { ...state.per, [charId]: now } })
      try {
        const logs = loadSmsLogs()
        const meta = TAVERN_PERSONAS.find((p) => p.charId === charId)
        const scan = (logs[charId] ?? []).slice(-6).map((m) => m.text).join('\n')
        // scope='sms'：主动来信也是一条短信，只取管短信的那一支
        const preset = buildPresetContext(readActivePreset(), scan, 'sms')
        const bond = c.bondNow(charId)
        /* 正文里与她有关的那一截（她不在场的段落一句不给）—— 主动来信是她说起
           「最近怎么样」的那一类，接得上正文才像同一个人。读不动（隐私模式）就整节不出现。 */
        const plotCtx = plotContextFor(charId, { records: c.world.records, epDone: c.epDone })
        const system =
          systemPrompt(charId, c.operatorName, bond, meta?.scenario ?? '各自的日常', plotCtx || undefined)
          + (preset.pre ? `\n\n${preset.pre}` : '')
          + proactiveRule(bond)
          + (preset.post ? `\n\n${preset.post}` : '')
        const messages = [
          { role: 'system' as const, content: system },
          ...smsTurns(logs[charId], 6),
          { role: 'user' as const, content: PROACTIVE_PROMPT },
        ]
        const pi = activePresetInfo()
        const text = (await chatCompletion(cfg, messages, {
          maxTokens: Math.min(400, cfg.maxTokens || 400),
          meta: {
            channel: '角色短信',
            act: `主动来信 · ${charOf(charId)?.name ?? charId}`,
            preset: { id: pi.id, name: pi.name, hits: preset.hits, prefill: pi.prefill },
          },
        }) ?? '').trim()
        if (!alive || !text) return
        /* 回执末尾那一块 JSON 照剥：主动来信本来只该是正文，
           但关系近了之后她可能顺手在信里约一句 —— 那一条要落地成一场见面。
           （只认邀约：主动来信照旧不改羁绊、不落标记 —— 它没有前因，不该拿它刷关系。） */
        const parsed = parseDirectorReply(text)
        const sd = smsDirective(parsed.directive, charId)
        // 过一遍展示清洗：外来标签（dream_* 一类）、代码围栏、行首的「【名】」都不该露给观测者
        const body = replyDisplayText(parsed, text) || text
        const clean = extractLiveDisplay(body.replace(/^[【\[][^】\]]{1,12}[】\]]\s*/, '')) || body
        if (!clean) return
        appendSmsMsg(charId, incomingSms(charId, clean))
        markUnread(charId)
        c.push('decode', '新的角色短信', `${charOf(charId)?.name ?? charId} 发来一条消息，在「角色短信」里。`, false)
        /* 她在信里约了：落成一场待人赴的见面（「在线推演 · 约会专线」那一路上会亮起来）。
           门槛两道：羁绊到了 INTIMATE_BOND，且这一条**真把时间与地点都说出口了**
           （`dateReady`）—— 「改天一起出来嘛」那种没有落点的客气话不另开一场，
           否则每封闲聊都会长出一场没头没尾的见面来。 */
        if (dateReady(sd.date) && bond >= INTIMATE_BOND && !openDateOf(charId)) {
          const d = sd.date!
          const rv = openRendezvous(charId, {
            kind: d.kind === 'intimate' ? 'intimate' : 'date',
            title: d.title,
            place: d.place,
            time: d.time,
            from: 'them',
          })
          c.push('decode', '有人约你', `${charOf(charId)?.name ?? charId} · ${rv.title}（${rv.place}${rv.time ? ` · ${rv.time}` : ''}）—— 在「在线推演 · 约会专线」赴这一场。`, false)
        }
      } catch {
        /* 通道不给力就安静跳过，下一轮再说 */
      } finally {
        inFlight.current = false
      }
    }

    const id = window.setInterval(() => void tick(), TICK_MS)
    /* 开局先巡一次：这一下是**对钟**（见 `rollStep` 的 'seed'），把第一格钉在此刻，
       首条来信于是落在 20 分钟之后 —— 而不是刚进游戏就被掷一次骰。 */
    const first = window.setTimeout(() => void tick(), 20 * 1000)
    return () => {
      alive = false
      window.clearInterval(id)
      window.clearTimeout(first)
    }
  }, [])
}

/** 去掉开头可能被模型带上的「【名】」，单聊不需要它 */
const PROACTIVE_RULE = `

规则补一条（这一条由你主动发来）：
6. 这是没有前因的一条。不要说「在吗」「有事找你」这类空话，也不要解释你为什么突然发消息 ——
   直接从一件具体的小事、一句现场感受或一段没头没尾的抱怨说起，落点自然，就像随手按下的发送键。`

/**
 * 主动来信的规则。羁绊过了 INTIMATE_BOND 之后再补两条：
 * 可以露一点私人的那一层，也可以自己开这个口把人约出来。
 *
 * 约出去那一条要落在末尾的 date 字段上（形状见 lib/plot.ts 的 smsBondRule）——
 * 调度器读它开一场见面。**别在信里就把整场写完**：信只到「说定了」。
 */
function proactiveRule(bond: number): string {
  if (bond < INTIMATE_BOND) return PROACTIVE_RULE
  return PROACTIVE_RULE + `
7. 你与对方的交情已经很深，这一条可以**说得更私人一点** ——
   一句没对别人说过的心事、身体或情绪上的不适、想见你的念头都行；但别写成一份告白清单，
   一句一条，留白比说满更贴近真实的短信。
8. 你也可以**自己在信里约**对方出来：想见就直说，别绕圈子。
   若这一条确实把约开出来了，在整条短信的最末尾另起一行放一个纯 JSON 对象：
   { "date": { "kind": "date", "title": "这一场的名目", "place": "见面的地方", "time": "什么时候" } }
   **时间与地点两样都得在信里说出口** —— time 写「明天放学后」「周六下午三点」这种，
   place 写去哪；缺一样就当没约成，那一条不会生成。只有真的开口约了才给
   （随口说说、只是想念不算）；约会这一条也不要每封都提。`
}

const PROACTIVE_PROMPT = '（现在请你主动发一条短信过来。只写发出去的那一两句话，不要旁白、不要加引号。）'
