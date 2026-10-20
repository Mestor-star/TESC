/* ============================================================
   收束栏 / 待战按钮的落盘（lib/plotpending.ts）
   ------------------------------------------------------------
   剧情推进页用两格状态记「这一段模型已经写完、等操作员点『进入下一事件』」
   （收束栏）与「正文里打起来的那一场还没开打」（待战按钮）。这两格从前只住在
   组件里 —— 一切走视图（`App.tsx` 按 `case` 换 lazy view），Plot 整体卸载，
   状态全丢：切去低语者日志再切回来，收束栏与「进入下一事件」就没了，待战那一枚
   连同「进入战斗」一起消失（2026-09-19 主人撞见）。

   所以把这两格搬到这里落盘（键 `zts-plot-pending:v1`，沿用 zts- 前缀；
   `slots.ts` 的 `clearRunStorage` 里登记了它 —— 重置 / 开新档一并清）。

   **读回一律白名单重建。** 这一份是「上次渲染留下的界面状态」，不是世界进度：
   谁手改过存档、哪个字段是上一版写的，都不该把收束栏糊到别的段上。认不出来的
   字段丢掉；任务单（Mission）按字段重建，缺了必填项就整格作废 —— 宁可这一次
   不显示，也不要带着半张作战单进作战屏。

   校验的另一半在 Plot 那一侧：收束栏 / 待战按钮都只在 `evId === focusEv.id`
   且该段尚未归档时上屏（`epDone` 现算的指针），读到过期记录当场清掉。

   本模块无 React，只读写 localStorage。
   ============================================================ */

import type { Mission } from '../data/types'

export const PLOT_PENDING_KEY = 'zts-plot-pending:v1'

/** 收束栏：「这一段模型的收官叙述已经写完，等操作员点『进入下一事件』」 */
export interface ConcludedMark {
  evId: string
  title: string
  digest: string
  diverged: boolean
}

/** 待战按钮：正文里出现的交战，点「进入战斗」才开打 */
export interface PendingBattleMark {
  evId: string
  name: string
  mission: Mission
  squad: string[]
}

interface File {
  v: 1
  concluded: ConcludedMark | null
  battle: PendingBattleMark | null
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/** 收束栏那一格：认不出 evId 就整格丢掉（其余字段缺了给空串，栏照样立得住） */
function concludedOf(v: unknown): ConcludedMark | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.evId !== 'string' || !o.evId) return null
  return {
    evId: o.evId,
    title: str(o.title, o.evId),
    digest: str(o.digest),
    diverged: o.diverged === true,
  }
}

/** 作战单：id / no / title 缺一就当没写（作战屏拿它开场，半张单子进去只会炸） */
function missionOf(v: unknown): Mission | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return null
  if (typeof o.no !== 'string' || !o.no) return null
  if (typeof o.title !== 'string' || !o.title) return null
  const status = o.status
  return {
    id: o.id,
    no: o.no,
    title: o.title,
    place: str(o.place, '现场'),
    stage: typeof o.stage === 'number' && Number.isFinite(o.stage) ? o.stage : 5,
    nature: str(o.nature, '反现实 · 遭遇'),
    recommend: Array.isArray(o.recommend) ? o.recommend.filter((x): x is string => typeof x === 'string') : [],
    status: status === '待接取' || status === '已派遣' || status === '压制中' || status === '完成' || status === '锁定'
      ? status
      : '压制中',
    deadline: str(o.deadline, '即刻'),
    desc: str(o.desc),
    reward: Array.isArray(o.reward) ? o.reward.filter((x): x is string => typeof x === 'string') : [],
    ...(o.mainline === true ? { mainline: true } : {}),
    ...(typeof o.at === 'string' && o.at ? { at: o.at } : {}),
    ...(typeof o.bossId === 'string' && o.bossId ? { bossId: o.bossId } : {}),
  }
}

function battleOf(v: unknown): PendingBattleMark | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.evId !== 'string' || !o.evId) return null
  const mission = missionOf(o.mission)
  if (!mission) return null
  const squad = Array.isArray(o.squad)
    ? [...new Set(o.squad.filter((x): x is string => typeof x === 'string' && !!x))]
    : []
  if (!squad.length) return null
  return { evId: o.evId, name: str(o.name, mission.title), mission, squad }
}

function readFile(): File {
  const empty: File = { v: 1, concluded: null, battle: null }
  try {
    const raw = localStorage.getItem(PLOT_PENDING_KEY)
    if (!raw) return empty
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object' || Array.isArray(p)) return empty
    const o = p as Record<string, unknown>
    return { v: 1, concluded: concludedOf(o.concluded), battle: battleOf(o.battle) }
  } catch {
    // 隐私模式 / 存档被写坏：当作没有过这一份，界面照常态走
    return empty
  }
}

/** 只换其中一半，另一半原样留住（读写各一次，两格互不覆盖） */
function patch(part: Partial<Pick<File, 'concluded' | 'battle'>>): void {
  const cur = readFile()
  const next: File = { v: 1, concluded: cur.concluded, battle: cur.battle, ...part }
  try {
    localStorage.setItem(PLOT_PENDING_KEY, JSON.stringify(next))
  } catch {
    /* 写不进去就只活在这一次渲染里 —— 与从前一样，不炸 */
  }
}

export function readConcluded(): ConcludedMark | null {
  return readFile().concluded
}

export function readPendingBattle(): PendingBattleMark | null {
  return readFile().battle
}

export function writeConcluded(m: ConcludedMark | null): void {
  patch({ concluded: m })
}

export function writePendingBattle(m: PendingBattleMark | null): void {
  patch({ battle: m })
}
