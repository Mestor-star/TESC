/* ============================================================
   角色短信 · 主动来信（lib/smsauto.ts）
   ------------------------------------------------------------
   已经「遇见」过、档案解锁、却**不在眼前这段事件里**的角色，
   会隔一阵子自己发一条短信过来 —— 不是回应、不是任务，就是随手发来的一句话。

   调度器挂在常驻的 Shell 上（不在电话页也照跑），所以：
   ① 来信与观测者在哪个模块无关；
   ② 收下的这条直接落盘（lib/sms.ts），侧栏与联系人行上的未读角标立刻亮。

   频率是刻意的克制：全局至少隔 4 分钟（再加 0–6 分钟抖动），
   同一个人至少隔 45 分钟 —— 免得一打开终端就涌进来一堆寒暄。
   ============================================================ */

import { useEffect, useRef } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { castOf } from './cast'
import { TAVERN_PERSONAS, charOf } from '../data/personas'
import { chatCompletion, isReady, loadProfile } from './api'
import { activePresetInfo, buildPresetContext, readActivePreset } from './preset'
import { extractLiveDisplay, parseDirectorReply, replyDisplayText, smsDirective } from './plot'
import { appendSmsMsg, incomingSms, loadSmsLogs, markUnread, smsTurns, systemPrompt } from './sms'
import { INTIMATE_BOND } from '../data/intimate'
import { openDateOf, openRendezvous } from './rendezvous'

export const AUTO_KEY = 'zts-sms-auto:v1'

/** 两次主动来信之间：下限 + 随机抖动 */
const GAP_MIN_MS = 4 * 60 * 1000
const GAP_JITTER_MS = 6 * 60 * 1000
/** 同一个人两次主动来信之间 */
const SAME_CHAR_MS = 45 * 60 * 1000
/** 巡查间隔 */
const TICK_MS = 45 * 1000

interface AutoState {
  /** 上一次主动来信的时刻（epoch ms） */
  last: number
  /** 每个人上一次主动来信的时刻 */
  per: Record<string, number>
}

function loadState(): AutoState {
  try {
    const raw = localStorage.getItem(AUTO_KEY)
    if (!raw) return { last: 0, per: {} }
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return { last: 0, per: {} }
    const o = p as Record<string, unknown>
    const per: Record<string, number> = {}
    if (o.per && typeof o.per === 'object' && !Array.isArray(o.per)) {
      for (const [k, v] of Object.entries(o.per as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) per[k] = v
      }
    }
    return { last: typeof o.last === 'number' && Number.isFinite(o.last) ? o.last : 0, per }
  } catch {
    return { last: 0, per: {} }
  }
}

function saveState(s: AutoState): void {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式下降级：退化为「本次会话内不重复」 */
  }
}

/** 距下一次可以来信还差多久（毫秒；0 = 现在就可以） */
function waitFor(state: AutoState, now: number): number {
  const gap = GAP_MIN_MS + jitter(state.last)
  const due = state.last + gap
  return Math.max(0, due - now)
}

/** 用 last 时刻推一个确定性的抖动，避免同一台机器每次刷新都算出不同结果导致反复重置 */
function jitter(last: number): number {
  if (!last) return 0
  return (last % 7) * (GAP_JITTER_MS / 7)
}

/** 本段事件里的在场者（这些人在眼前，不主动发短信） */
function onStageIds(epDone: Record<string, boolean>): Set<string> {
  const focus = TIMELINE.find((e) => !epDone[e.id])
  return new Set(focus ? castOf(focus) : [])
}

/**
 * 主动来信的调度钩子。挂在常驻的 Shell 上，全局只有一份。
 */
export function useProactiveSms(): void {
  const { operatorName, isMet, bondNow, epDone, push, world } = useTerminal()
  /* 上下文放进 ref：调度是「到点才看」的，闭包不该因为依赖变化而重启计时 */
  const ctx = useRef({ operatorName, isMet, bondNow, epDone, push, world })
  ctx.current = { operatorName, isMet, bondNow, epDone, push, world }

  const inFlight = useRef(false)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      if (!alive || inFlight.current) return
      if (document.visibilityState !== 'visible') return
      const c = ctx.current
      const now = Date.now()
      const state = loadState()
      if (waitFor(state, now) > 0) return

      // 在「遇见过、且不在眼前这段事件里」的人中挑一个
      const stage = onStageIds(c.epDone)
      const metas = TAVERN_PERSONAS.map((p) => p.charId)
        .filter((id) => c.isMet(id) && !stage.has(id))
        .filter((id) => now - (state.per[id] ?? 0) >= SAME_CHAR_MS)
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
      // 先记时刻：哪怕这一条生成失败，也要等过这一轮，不要每 45 秒重试一次
      saveState({ last: now, per: { ...state.per, [charId]: now } })
      try {
        const logs = loadSmsLogs()
        const meta = TAVERN_PERSONAS.find((p) => p.charId === charId)
        const scan = (logs[charId] ?? []).slice(-6).map((m) => m.text).join('\n')
        // scope='sms'：主动来信也是一条短信，只取管短信的那一支
        const preset = buildPresetContext(readActivePreset(), scan, 'sms')
        const bond = c.bondNow(charId)
        const system =
          systemPrompt(charId, c.operatorName, bond, meta?.scenario ?? '各自的日常')
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
        // 她在信里约了：落成一场待人赴的见面（「约会」一栏里会亮起来）
        if (sd.date && bond >= INTIMATE_BOND && !openDateOf(charId)) {
          const rv = openRendezvous(charId, {
            kind: sd.date.kind === 'intimate' ? 'intimate' : 'date',
            title: sd.date.title,
            place: sd.date.place,
            from: 'them',
          })
          c.push('decode', '有人约你', `${charOf(charId)?.name ?? charId} · ${rv.title}（${rv.place}）—— 在「角色短信 · 约会」里应约。`, false)
        }
      } catch {
        /* 通道不给力就安静跳过，下一轮再说 */
      } finally {
        inFlight.current = false
      }
    }

    const id = window.setInterval(() => void tick(), TICK_MS)
    // 开局先等一会儿再开始巡（免得刚进游戏就弹）
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
   { "date": { "kind": "date", "title": "这一场的名目", "place": "见面的地方" } }
   只有真的开口约了才给（随口说说、只是想念不算）；约会这一条也不要每封都提。`
}

const PROACTIVE_PROMPT = '（现在请你主动发一条短信过来。只写发出去的那一两句话，不要旁白、不要加引号。）'
