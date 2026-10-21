/* ============================================================
   lib/voices.ts — 本次推演读到的心声（运行时存档）
   ------------------------------------------------------------
   与 data/minds.ts 的 MINDS 是**两本账**，别混：
     · MINDS 是原作里低语者读到的那几句（逐字原文，按卷封存，整卷读完才回放）；
     · 这一本是**本次推演**里导演给的 voices（见 lib/plot.ts 的 VoiceDirective），
       推一回合记一条，按段落在哪一卷归组。
   原作那本不许改，所以推演里读到的心声另存一份 —— 记忆库的「心迹」栏把两本并着摆。

   存储：localStorage 的 `zts-voices:v1`（沿用 zts- 前缀）。旧档没有这个键 → 空表，不报错。
   写不进去（配额满 / 隐私模式）就**安静地**不写：心声不该因为存不下而打断推演。
   ============================================================ */

import type { VoiceKind } from './plot'

/** 一条推演里读到的心声 */
export interface RuntimeVoice {
  /** 本条自己的 id（不是消息 id：同一个 msgId 下可能有好几条） */
  id: string
  /** 读到的段落（TimelineEvent.id） */
  evId: string
  /** 段落所在的卷（与 MINDS 同口径，例如 '卷1'） */
  group: string
  /** 角色 id；名录之外的人一律 'other' */
  who: string
  /** 显示名 */
  speaker: string
  /** 出处：段落标题 */
  scene: string
  /** 那一句心声（≤60 字，不含『』） */
  text: string
  /** 表层 / 伪装 / 深声 */
  kind: VoiceKind
  /** 记下的时刻 */
  ts: number
}

/** 记账时只需要给这些 —— id 与时刻由本模块补（调用方不必自己编） */
export type VoiceInput = Omit<RuntimeVoice, 'id' | 'ts'> & { id?: string; ts?: number }

export const VOICES_KEY = 'zts-voices:v1'

/** 一本小账，不给它无限长：推演几十回合也不会读到这么多条 */
const MAX_ITEMS = 240

/** 三层的闭集（与 lib/plot.ts 的 VOICE_KINDS 同一份口径，这边是读档时的兜底校验） */
const KINDS = new Set<string>(['表层', '伪装', '深声'])

const newId = (): string =>
  `${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`

/** 一条读得回来的记录才算数（旧档、手改过的 localStorage 都可能缺字段） */
function valid(x: unknown): x is RuntimeVoice {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string'
    && typeof o.evId === 'string'
    && typeof o.group === 'string'
    && typeof o.speaker === 'string'
    && typeof o.text === 'string'
    && typeof o.kind === 'string' && KINDS.has(o.kind)
}

/** 整本读出来（旧档没有这个键 → 空表；坏行逐条丢掉，不让一行坏账带倒整本） */
export function listRuntimeVoices(): RuntimeVoice[] {
  try {
    const raw = localStorage.getItem(VOICES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(valid).map((v) => ({
      id: v.id,
      evId: v.evId,
      group: v.group,
      who: typeof v.who === 'string' ? v.who : 'other',
      speaker: v.speaker,
      scene: typeof v.scene === 'string' ? v.scene : '',
      text: v.text,
      kind: v.kind,
      ts: typeof v.ts === 'number' && Number.isFinite(v.ts) ? v.ts : 0,
    }))
  } catch {
    return []
  }
}

function write(list: RuntimeVoice[]): void {
  try {
    localStorage.setItem(VOICES_KEY, JSON.stringify(list.slice(-MAX_ITEMS)))
  } catch {
    /* 存不下就算了：心声记账不该把推演打断（正文与指令都已经落地了） */
  }
}

/**
 * 追加几条（推一回合记几条）。
 *
 * 去重口径：**同 evId + speaker + text 只记一次** —— 补收指令、重试、同一回合被解析两遍
 * 都会把同一条再送进来一次；按内容认，比按 id 认可靠（调用方不一定有稳定 id）。
 * @returns 真正新记下的那几条（被去重掉的不在里面）
 */
export function appendVoices(list: VoiceInput[]): RuntimeVoice[] {
  if (!Array.isArray(list) || !list.length) return []
  const all = listRuntimeVoices()
  const seen = new Set(all.map((v) => `${v.evId}\u0000${v.speaker}\u0000${v.text}`))
  const added: RuntimeVoice[] = []
  for (const item of list) {
    const text = String(item.text ?? '').trim()
    if (!text) continue
    const speaker = String(item.speaker ?? '').trim() || item.who
    const key = `${item.evId}\u0000${speaker}\u0000${text}`
    if (seen.has(key)) continue
    seen.add(key)
    added.push({
      id: item.id ?? newId(),
      evId: item.evId,
      group: item.group,
      who: item.who,
      speaker,
      scene: item.scene ?? '',
      text,
      kind: item.kind,
      ts: item.ts ?? Date.now(),
    })
  }
  if (!added.length) return []
  write([...all, ...added])
  return added
}

/** 某一卷里这次推演读到的心声（按时间倒序：最近读到的排在最前） */
export function voicesOfGroup(group: string): RuntimeVoice[] {
  return listRuntimeVoices()
    .filter((v) => v.group === group)
    .sort((a, b) => b.ts - a.ts)
}

/** 清空这一本（换档 / 重置进度时用） */
export function clearRuntimeVoices(): void {
  try {
    localStorage.removeItem(VOICES_KEY)
  } catch {
    /* 读不到也删不掉 —— 与读那一路同一口径：不报错 */
  }
}