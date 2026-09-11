/* ============================================================
   内置预设 —— 开箱即用的「导演指令包」
   ------------------------------------------------------------
   presets/*.json 仍是唯一真源（也是给人手动导入的那两份），
   这里只在首启时把它们导一份进方案列表：用户不必先找文件、再点「导入预设」。
   转换走的是与「导入预设」完全相同的那一条路（parseChatPreset），
   所以内置的那份与手动导入的那份逐字一致 —— 不存在第二套写法。

   **播进来还不算数，得能用上**：光把两份预设摆进列表，用户还得自己找到那一行、
   点一下「套用」，此前生成读到的仍是空快照（没有导演指令、预算还是通道缺省）。
   所以这里再走一步：**只要列表里没有一份真正在生效的预设**，就把协议预设套上
   （见 autoStart）。判据是纯函数（shouldAutoStart），好让复核把各种情形都摆一遍。

   分寸在于「生效着的那一份永远归用户」：你自己套过别的预设、或者你把它删了，
   这里一律不动 —— 直接生效不等于自动覆盖。反过来，本机没有生效目标时
   （从没套过、生效的那份被删了、快照没落成），它就自己补上，
   用户不必先找到那一行、更不必知道有「套用」这个按钮。
   ============================================================ */

import protocolJson from '../../presets/终末停滞-协议预设.json'
import styleJson from '../../presets/终末停滞-文风参照原著.json'
import { readProfiles, saveProfile } from './api'
import { DEFAULT_BUDGET, MAX_BUDGET } from './budget'
import { ensureSeeded, getActiveLorebookIds } from './lorestore'
import { activePresetId, readActivePreset, snapshotActivePreset } from './preset'
import { applySchemePersisted, listSchemes, parseChatPreset, storeSchemes } from './schemes'
import type { Scheme } from './schemes'

export const BUILTIN_KEY = 'zts-builtin-presets:v1'
/**
 * 预算抬顶那一步的账。**记版本号**：抬的目标值改过一代（30000 → 上限），
 * 老账本（v1）记的是一次已经过时的动作，得让它再走一遍；
 * 记到 v2 之后才真的只做一次。
 */
export const BUDGET_FLOOR_KEY = 'zts-budget-floor:v1'
const BUDGET_FLOOR_V = 2

/**
 * 这个通道上存的输出预算该不该抬到**上限**那一档 —— **纯函数**，好让复核把各种值摆一遍。
 *
 * 只认**我们自己写进去过的**那些值：0 / 非数字（从没设过）、1500（旧缺省）、
 * 30000（上一代建议值）。用户自己打的数（比如 4096）一律不动 —— 那是他选的，
 * 不是我们塞的；他若嫌小，界面上那一格随时改。
 *
 * 为什么抬到上限而不是建议值：这个数管的是**单次生成最多吐多少 token**。
 * 思考型通道先花掉一部分，正文再被长度掐断时，界面上看不出异常 ——
 * 它能生成，只是每一段都在半句上停住。留足比掐住强；真超过某条通道自己的
 * 输出上限时，上游会明确报错（照它说的往下调即可），而不是悄悄截断。
 */
export function needsBudgetFloor(n: unknown): boolean {
  return typeof n !== 'number' || !Number.isFinite(n) || n === 0 || n === 1500 || n === DEFAULT_BUDGET
}

function readFloorLedger(): number {
  try {
    const raw = localStorage.getItem(BUDGET_FLOOR_KEY)
    if (!raw) return 0
    const p = JSON.parse(raw) as { v?: unknown }
    return typeof p?.v === 'number' && Number.isFinite(p.v) ? p.v : 1
  } catch {
    /* 隐私模式：读不到账就当作没做过 —— 下面写账也会失败，下次开机再来一遍，无害 */
    return 0
  }
}

/**
 * 把还停在我们自己写的缺省上的输出预算抬到上限（每台机器只做一次，按版本号记账）。
 *
 * 为什么要有这一步：自动启动只认「没有生效目标」的机器（那是它的分寸）。
 * 已经套用过别的预设的机器，预算可能留在旧缺省上 —— 那条通道上正文很容易
 * 被长度掐断，而界面上看不出异常。所以这里单独补一次。
 */
export async function ensureBudgetFloor(): Promise<boolean> {
  if (readFloorLedger() >= BUDGET_FLOOR_V) return false
  try {
    const p = await readProfiles()
    const raiseMain = needsBudgetFloor(p.main.maxTokens)
    const raiseSms = needsBudgetFloor(p.sms.maxTokens)
    if (raiseMain || raiseSms) {
      await Promise.all([
        raiseMain ? saveProfile('main', { ...p.main, maxTokens: MAX_BUDGET }) : Promise.resolve(),
        raiseSms ? saveProfile('sms', { ...p.sms, maxTokens: MAX_BUDGET }) : Promise.resolve(),
      ])
    }
    localStorage.setItem(BUDGET_FLOOR_KEY, JSON.stringify({
      v: BUDGET_FLOOR_V, at: Date.now(), to: MAX_BUDGET, from: { main: p.main.maxTokens, sms: p.sms.maxTokens },
    }))
    return raiseMain || raiseSms
  } catch {
    return false
  }
}

/** 内置预设的固定 id：认它就知道这一份是内置的（界面上挂「内置」标），重播也不会撞车 */
export const BUILTIN_IDS = ['builtin-ts-protocol', 'builtin-ts-style'] as const

/** 内置预设的原文（导出是为复核读它：解析出来的输出预算够不够写一段正文，见 mech 第 17 节） */
export const BUILTIN_SOURCE: { id: string; json: unknown }[] = [
  { id: BUILTIN_IDS[0], json: protocolJson },
  { id: BUILTIN_IDS[1], json: styleJson },
]

export function isBuiltinScheme(id: string): boolean {
  return (BUILTIN_IDS as readonly string[]).includes(id)
}

function readSeeded(): string[] {
  try {
    const raw = localStorage.getItem(BUILTIN_KEY)
    const p = raw ? (JSON.parse(raw) as { seeded?: unknown }) : null
    return p && Array.isArray(p.seeded)
      ? (p.seeded as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * 该不该自动启动内置预设 —— **纯函数**，把「本机状态」整个作为输入。
 *
 * 只有一条闸门：**本机有没有一份确实在生效的预设**。
 *   · 有（active 非空且那一份还在列表里）→ 不动。用户自己配好的东西，
 *     不该被一份「自带的」在下次开机时盖掉 —— 直接生效不是自动覆盖。
 *   · 没有 → 启动。从没套过、生效的那份被你删了，都算「没有」：
 *     这两种情形下提示词里读到的都是空快照，界面上却看不出少了什么。
 *   · 列表里根本没有内置那一份（被删了）→ 无事可做（尊重这个删除）。
 * @returns 要自动启动的那一份的 id；不该启动时为 null
 */
export function shouldAutoStart(state: {
  /** 本机当前生效的预设 id（没套过任何预设为 null） */
  activeId: string | null
  /** 方案列表里现有的 id */
  ids: string[]
}): string | null {
  if (state.activeId && state.ids.includes(state.activeId)) return null
  return state.ids.includes(BUILTIN_IDS[0]) ? BUILTIN_IDS[0] : null
}

/**
 * 生效目标在列表里，快照却是空的 —— 补落一次。
 *
 * 「方案列表里躺着、提示词里一条没进」是本终端最难自查的一种失效：
 * 界面上那一行看着好好的，生成时却既没有导演指令、也没有预填充。
 * 成因是快照与方案列表两本账，套用只写前者、后来改的却只动后者。
 * 这里不猜是哪一步漏的，只认事实：**方案里有条目，快照里没有**，就重落一遍。
 * @returns 有没有补落
 */
export function ensureActiveSnapshot(): boolean {
  const id = activePresetId()
  if (!id) return false
  const s = listSchemes().find((x) => x.id === id)
  if (!s) return false
  const entries = s.entries ?? []
  if (!entries.length) return false
  if (readActivePreset().length) return false
  snapshotActivePreset(s.id, s.name, entries, s.prefill ?? '')
  return true
}

/**
 * 把还没播过的内置预设导进方案列表，并让「从没套过预设」的机器直接生效。幂等，可反复调。
 *
 * **同一时刻只跑一遍**：终端启动（Terminal）与设置页挂载都会喊它，
 * 而播种中途要 await 一串读写。没有这道闩，两边会各自读到「还没播过」的账、
 * 各播一遍 —— 内置预设当场翻倍（曾经列表里就是 4 份，两份一份的两份）。
 * @returns 这一次有没有真的改动（界面据此决定要不要重读列表与通道配置）
 */
let inflight: Promise<boolean> | null = null

export function ensureBuiltinPresets(): Promise<boolean> {
  if (!inflight) inflight = seedBuiltins().finally(() => { inflight = null })
  return inflight
}

async function seedBuiltins(): Promise<boolean> {
  const seeded = readSeeded()
  const list = listSchemes()

  // 一、先平账：同一个内置 id 只认第一份 —— 早先播重过的档，在这里顺手清掉多余的
  const seen = new Set<string>()
  const kept = list.filter((s) => {
    if (!isBuiltinScheme(s.id)) return true
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
  let changed = kept.length !== list.length

  // 二、再补种：账上没记、列表里也没有的才播（两处都认，重复导入也不会再加一份）
  const todo = BUILTIN_SOURCE.filter((b) => !seeded.includes(b.id) && !seen.has(b.id))
  const done = [...new Set([...seeded, ...BUILTIN_IDS.filter((id) => seen.has(id))])]

  if (todo.length) {
    // 世界书先落库：内置预设要带上「当前激活集」，
    // 否则套用它会把 canon 世界书整片关掉（applySchemeTo 以方案里的集合为准）
    await ensureSeeded()
    const [cfgs, active] = [await readProfiles(), await getActiveLorebookIds()]
    for (const b of todo) {
      const r = parseChatPreset(b.json, cfgs)
      // 解析不出来（字段形状变了）就不记账，留待下次再试，别把一份空预设塞进列表
      if (!r.ok) continue
      // 固定 id + 补上激活集：内置的那份与手动导入的那份差别只在这里
      kept.push({ ...r.scheme, id: b.id, builtin: true, activeLoreIds: active, ...(typeof r.stream === 'boolean' ? { stream: r.stream } : {}) })
      done.push(b.id)
      changed = true
    }
  }

  if (changed) {
    storeSchemes(kept)
    try {
      localStorage.setItem(BUILTIN_KEY, JSON.stringify({ v: 1, seeded: done }))
    } catch {
      /* 隐私模式：下次开机重播一遍 —— 上面两道闸（闩 + 按 id 平账）兜着，不会再翻倍 */
    }
  }

  // 顺序要紧：先自动启动（它会把快照整个写一遍），再看有没有「有方案、没快照」的漏
  return (await autoStart(kept)) || ensureActiveSnapshot() || changed
}

/**
 * 让内置预设**生效**（不只是躺在列表里）。
 * 走的是与「套用」按钮完全相同的那一条路（applySchemePersisted → applySchemeTo）：
 * 两通道参数、激活世界书、词条滤网、生效快照一并落地 —— 不存在第二套写法。
 *
 * 只认列表里 real 的那一份（可能刚播进来、也可能早就在），被删了就当无事发生。
 * @returns 有没有真的启动
 */
async function autoStart(list: Scheme[]): Promise<boolean> {
  const id = shouldAutoStart({ activeId: activePresetId(), ids: list.map((s) => s.id) })
  if (!id) return false
  const target = list.find((s) => s.id === id)
  if (!target) return false
  await applySchemePersisted(target)
  return true
}
