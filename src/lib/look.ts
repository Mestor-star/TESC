/* ============================================================
   状态卡的那一句话（lib/look.ts）
   ------------------------------------------------------------
   主人要的是「每一项给一句话概括」，而那句话**由 AI 生成**（不是规则文案池）。
   于是它得有个落脚的地方：跟别的运行态一样，住 localStorage、跟着会话账走。

   三条界线（这一份的全部理由）：
     · **只进状态卡，绝不进正文。** 这里收的是「此刻她这个样子」的一句概括 ——
       头部 / 上半身 / 下半身 / 约会氛围，加背面的胸部 / 小穴 / 屁穴 / 心理状态。
       正文里复述它，就等于把右栏的一张卡摊进叙述里，读起来像旁白在背档案。
     · **缺的沿用上一次。** 模型不必每回合把八项凑齐：给哪几项就换哪几项，
       没给的照上一回那一条读 —— 状态是渐变的，不必为了完整而重写没变的部分。
     · **一人一份、按角色 id 挂。** 与私密档案同一个口径（挂人，不挂段）：
       这一场散了她此刻的样子也还在，下一场接着改。

   收法的规矩在 lib/plot.ts 的 `sanitizeDirective`（char 只认名录、与在场名册交叉校验、
   一回合至多三人、每项一句 ≤30 字）；这里只管**存、读、订阅、合并**。
   ============================================================ */

/** 存储键（沿用 `zts-` 前缀；已登记进 lib/slots.ts 的 RUN_STATE_KEYS） */
export const LOOK_KEY = 'zts-look:v1'

/** 八项（正面四项在前、背面四项在后 —— 提示词与卡面都照这个次序，别各自排一套） */
export type LookField = 'head' | 'upper' | 'lower' | 'mood' | 'chest' | 'vagina' | 'anus' | 'mind'

/** 正面四项（好感度那一面）：她这个人与这一场的气氛 */
export const LOOK_FRONT: readonly LookField[] = ['head', 'upper', 'lower', 'mood']

/** 背面四项（情欲值那一面）：私密那一档才谈得上 */
export const LOOK_BACK: readonly LookField[] = ['chest', 'vagina', 'anus', 'mind']

/** 八项的全序 */
export const LOOK_FIELDS: readonly LookField[] = [...LOOK_FRONT, ...LOOK_BACK]

/** 每一项的标签（卡面与提示词共用；`back` 说的是它落在哪一面） */
export const LOOK_FIELD_META: Record<LookField, { label: string; back: boolean }> = {
  head: { label: '头部', back: false },
  upper: { label: '上半身', back: false },
  lower: { label: '下半身', back: false },
  mood: { label: '约会氛围', back: false },
  chest: { label: '胸部', back: true },
  vagina: { label: '小穴', back: true },
  anus: { label: '屁穴', back: true },
  mind: { label: '心理状态', back: true },
}

/** 没有 AI 文案时卡面上的占位 —— **不编造**：没看过就写没看过 */
export const LOOK_PLACEHOLDER = '—— 还没细看'

/** 非私密档翻到背面时的那一句（不是空白） */
export const LOOK_LOCKED = '还没到这一步'

/** 一条已经落下的状态（缺的那几项沿用上一次，所以八项都可选） */
export interface LookEntry {
  head?: string
  upper?: string
  lower?: string
  mood?: string
  chest?: string
  vagina?: string
  anus?: string
  mind?: string
  /** 最后落下的时刻（ms） */
  at: number
}

/** 一条推进：谁、哪几项（与 lib/plot.ts 的 LookDirective 是同一份，那边直接引这一份） */
export interface LookDirective extends Partial<Record<LookField, string>> {
  char: string
}

const subs = new Set<() => void>()
let version = 0

/** 订阅（`useSyncExternalStore` 的入口）—— 写一次就通知一次 */
export function subscribeLooks(fn: () => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

/** 版本号（`useSyncExternalStore` 的快照） */
export function looksVersion(): number {
  return version
}

function bump(): void {
  version += 1
  for (const fn of [...subs]) fn()
}

/**
 * 读整本。坏档 / 读不到 / 隐私模式一律读作空 —— 这一栏少了不耽误任何一条别的路。
 * 只认八项里的字符串；别的一律不进内存（手改过的旧档也照这条筛）。
 */
export function readLooks(): Record<string, LookEntry> {
  const out: Record<string, LookEntry> = {}
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LOOK_KEY)
  } catch {
    return out
  }
  if (!raw) return out
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  for (const [rawId, rawOne] of Object.entries(parsed as Record<string, unknown>)) {
    const id = rawId.trim()
    if (!id || !rawOne || typeof rawOne !== 'object' || Array.isArray(rawOne)) continue
    const o = rawOne as Record<string, unknown>
    const one: LookEntry = { at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0 }
    for (const f of LOOK_FIELDS) {
      const v = o[f]
      if (typeof v === 'string' && v.trim()) one[f] = v.trim()
    }
    out[id] = one
  }
  return out
}

/** 某个人此刻那一份（没有 → null；调用方自己决定摆占位还是整块不摆） */
export function lookOf(charId: string): LookEntry | null {
  if (!charId) return null
  return readLooks()[charId] ?? null
}

function writeAll(all: Record<string, LookEntry>): void {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(all))
  } catch {
    /* 配额 / 隐私模式：这一栏掉一句不耽误别的（与其它运行态同一口径） */
  }
  bump()
}

/**
 * 把一回合的推进并进账里：**给哪几项就换哪几项，没给的照上一回那一句**
 * （见文件头那三条界线里的第二条）。
 *
 * 一条里一项都没有的、char 为空的，直接跳过 —— 那不是推进。
 * 返回真的动了的那几个人（供调用方念一句 / 供测试断言）。
 */
export function applyLooks(list: readonly LookDirective[], at = Date.now()): string[] {
  if (!list.length) return []
  const all = readLooks()
  const touched: string[] = []
  for (const one of list) {
    const id = String(one?.char ?? '').trim()
    if (!id) continue
    const fields = LOOK_FIELDS.filter((f) => {
      const v = one[f]
      return typeof v === 'string' && v.trim().length > 0
    })
    if (!fields.length) continue
    const next: LookEntry = { ...(all[id] ?? { at }) }
    for (const f of fields) next[f] = String(one[f]).trim()
    next.at = at
    all[id] = next
    touched.push(id)
  }
  if (!touched.length) return []
  writeAll(all)
  return touched
}
