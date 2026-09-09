/* ============================================================
   操作员身份 = 随剧情推进的「变量」
   ------------------------------------------------------------
   言万心叶的学籍/身份不是开局即定，而是沿 .canon 剧情推进逐段成立：
     · 起点（异端审判收束前）：以「临时访问」身份接入观测端 —— 曾被旧黑手党利用、
       无学园所属的漂流少年；「低语者（Susurrador）」这个名号只属于他与旧黑手党，不对外示出。
     · 体验入学：v1 第1话末、异端审判收束后，会长艾莉芙以「苍之学园体验入学」
       名义收留他与露娜（timeline v1-3 收束）。
     · 正式转校：v2 第1话「转校生，登场！」以「一枚羽」正式入学苍之学园
       一年F班（timeline v2-2 收束后成立）。
   「低语者／Susurrador」与 Stage4『活性化』的登记在册口径，随体验入学才成立，
   开局阶段不示出（避免在启动界面提前泄露那个只属于他与旧黑手党的名字）。
   ============================================================ */

import { TIMELINE } from '../data/timeline'

const IDX: Record<string, number> = {}
TIMELINE.forEach((e, i) => {
  IDX[e.id] = i
})

/** 学籍推进的关键事件 id（按时间线顺序；缺位则回退安全值） */
const ADOPT_ID = 'v1-3'     // 异端审判收束 → 体验入学
const TRANSFER_ID = 'v2-2'  // 转校生/一枚羽 入学 → 苍之学园正式生
const ADOPT = IDX[ADOPT_ID] ?? 0
const TRANSFER = IDX[TRANSFER_ID] ?? ADOPT

export type OpStage = 0 | 1 | 2

export interface OpSituation {
  stage: OpStage
  /** 学籍所属（随时间线推进变化） */
  standing: string
  /** 低语者之名（开局保密；体验入学后登记在册才示出） */
  alias: string | null
  /** 终末潜力登记口径（同上，随登记成立） */
  nature: string | null
  adopted: boolean
  transferred: boolean
}

/** 已推进到的最远事件下标（按时间线顺序） */
export function furthestDone(epDone: Record<string, true>): number {
  let f = -1
  for (const id in epDone) {
    if (!epDone[id]) continue
    const k = IDX[id]
    if (k !== undefined && k > f) f = k
  }
  return f
}

export function opStageOf(epDone: Record<string, true>): OpStage {
  const f = furthestDone(epDone)
  if (f >= TRANSFER) return 2
  if (f >= ADOPT) return 1
  return 0
}

/** 依据当前推进阶段，给出操作员身份情势 */
export function opSituation(epDone: Record<string, true>): OpSituation {
  const stage = opStageOf(epDone)
  const adopted = stage >= 1
  const transferred = stage >= 2
  return {
    stage,
    standing: transferred
      ? '苍之学园 · 正式生（转校生）'
      : adopted
        ? '苍之学园 · 体验入学'
        : '临时访问',
    alias: adopted ? '低语者（Susurrador）' : null,
    nature: adopted ? "Stage4『活性化』" : null,
    adopted,
    transferred,
  }
}

/** 终端身份行（NavRail 底部 / operatorTitle / Boot 接入等单行展示用） */
export function opFull(epDone: Record<string, true>): string {
  const s = opSituation(epDone)
  if (!s.adopted) return s.standing
  return `${s.standing} · ${s.nature} · ${s.alias}`
}

/** 未推进任何事件（全新开始）时的默认身份：临时访问 */
export function opFreshFull(): string {
  return opFull({})
}
