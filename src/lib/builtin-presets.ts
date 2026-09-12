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
import { DEFAULT_BUDGET, LEGACY_BUDGETS, MAX_BUDGET } from './budget'
import { ensureSeeded, getActiveLorebookIds } from './lorestore'
import { activePresetId, readActivePreset, snapshotActivePreset } from './preset'
import { applySchemePersisted, listSchemes, parseChatPreset, storeSchemes } from './schemes'
import type { Scheme } from './schemes'

export const BUILTIN_KEY = 'zts-builtin-presets:v1'
/**
 * 内置预设**内容**的版本号。账本上记的比它小，就说明列表里躺着的是上一代的内置预设 ——
 * 那时照着 presets/*.json 重读一遍，把内容换上去（不是重播一份新的：id 是固定的，
 * 换的是那一份里的条目）。不这么做的话，改过的 JSON 只有**新装机**看得见，
 * 已经开过机的用户永远停在装机那天的旧稿上 —— 而界面上完全看不出差别。
 */
const BUILTIN_V = 4
/**
 * 预算归位那一步的账。**记版本号**：目标值改过两代
 * （1500 → 上限 65536 → 30000），老账本记的是一次已经过时的动作，
 * 得让它再走一遍；记到当前这一版之后才真的只做一次。
 */
export const BUDGET_FLOOR_KEY = 'zts-budget-floor:v1'
const BUDGET_FLOOR_V = 4

/**
 * 这个通道上存的输出预算该不该归到**目标值**（30000）—— **纯函数**，好让复核把各种值摆一遍。
 *
 * 只认**我们自己写进去过的**那些值：0 / 非数字（从没设过），以及 LEGACY_BUDGETS
 * 里我们发过的历史缺省（1500 那一代、8000 那一代）。
 * 用户自己打的数（比如 4096 或 65536）一律不动 —— 那是他选的，不是我们塞的；
 * 他若嫌小，界面上那一格随时改。
 *
 * 为什么是 30000 而不是上限：这个数管的是**单次生成最多吐多少 token**。
 * 太低（1500 / 8000）在思考型通道上会被内部思考吃光，正文一个字没写就被长度掐断；
 * 太高又会被一些通道自己的输出上限顶回来、报错。30000 是两边都留了余量的那一档。
 */
export function needsBudgetFloor(n: unknown): boolean {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return true
  return LEGACY_BUDGETS.includes(n)
}

export type FloorLedger = { v?: number; to?: number; from?: { main?: number; sms?: number } }

function readFloorLedger(): FloorLedger {
  try {
    const raw = localStorage.getItem(BUDGET_FLOOR_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as FloorLedger
  } catch {
    /* 隐私模式：读不到账就当作没做过 —— 下面写账也会失败，下次开机再来一遍，无害 */
    return {}
  }
}

/**
 * 列表里躺着的那一份是不是**上一代的内置稿** —— **纯函数**，好让复核把各种值摆一遍。
 *
 * 判据两条，缺一不可：
 *   · 账本版本号比当前的小（这台机器上播过的是旧稿）；
 *   · 列表里**确实有**内置那一份（用户把它删了就不该再塞回来）。
 * 只要这两条成立，就照 presets/*.json 重读一遍换上内容。
 */
export function needsContentRefresh(ledgerV: number, idsInList: string[]): boolean {
  return ledgerV < BUILTIN_V && BUILTIN_SOURCE.some((b) => idsInList.includes(b.id))
}

/**
 * 这台机器上这一格（存的是上一代我们抬上去的**上限**）该不该收回目标值。
 * 只认「账上记着那次抬顶、且当前值仍是抬上去的那个数」—— 值没被人动过，才收。
 */
export function shouldSettleDown(n: number, led: FloorLedger): boolean {
  return n === MAX_BUDGET && led.to === MAX_BUDGET
}

/**
 * 把输出预算归到目标值（每台机器只做一次，按版本号记账）：
 * 还停在我们自己写的旧缺省（0 / 1500 / 8000）上的抬上来，上一代被我们抬到上限的收回来。
 *
 * 为什么要有这一步：自动启动只认「没有生效目标」的机器（那是它的分寸）。
 * 已经套用过别的预设的机器，预算可能停在旧值上 —— 要么太短（正文被长度掐断），
 * 要么是上一代抬过头的上限，而界面上都看不出异常。所以这里单独补一次。
 */
export async function ensureBudgetFloor(): Promise<boolean> {
  const led = readFloorLedger()
  if (typeof led.v === 'number' && led.v >= BUDGET_FLOOR_V) return false
  try {
    const p = await readProfiles()
    const fix = (n: number) => needsBudgetFloor(n) || shouldSettleDown(n, led)
    const fixMain = fix(p.main.maxTokens)
    const fixSms = fix(p.sms.maxTokens)
    if (fixMain || fixSms) {
      await Promise.all([
        fixMain ? saveProfile('main', { ...p.main, maxTokens: DEFAULT_BUDGET }) : Promise.resolve(),
        fixSms ? saveProfile('sms', { ...p.sms, maxTokens: DEFAULT_BUDGET }) : Promise.resolve(),
      ])
    }
    localStorage.setItem(BUDGET_FLOOR_KEY, JSON.stringify({
      v: BUDGET_FLOOR_V, at: Date.now(), to: DEFAULT_BUDGET, from: { main: p.main.maxTokens, sms: p.sms.maxTokens },
    }))
    return fixMain || fixSms
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

/** 账本：播过哪些 id，以及**照哪一版内置稿播的**（版本号小 = 列表里那份是旧稿） */
function readLedger(): { v: number; seeded: string[] } {
  try {
    const raw = localStorage.getItem(BUILTIN_KEY)
    const p = raw ? (JSON.parse(raw) as { v?: unknown; seeded?: unknown }) : null
    const seeded = p && Array.isArray(p.seeded)
      ? (p.seeded as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    const v = typeof p?.v === 'number' && Number.isFinite(p.v) ? p.v : (seeded.length ? 1 : 0)
    return { v, seeded }
  } catch {
    return { v: 0, seeded: [] }
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
  const led = readLedger()
  const seeded = led.seeded
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

  // 三、换稿：列表里那份还是**旧版内置稿**时，照 presets/*.json 重读一遍换上内容。
  // 只换内置那一份的内容，用户自己导的预设一律不动；换的也不是新的一行 —— id 固定，
  // 换完列表里还是原来那一行，用户套用的仍是它。
  const stale = needsContentRefresh(led.v, kept.map((s) => s.id)) && !todo.length
    ? BUILTIN_SOURCE.filter((b) => kept.some((s) => s.id === b.id))
    : []

  /** 补种/换稿这一步有没有走完。没走完就不记版本号 —— 记了就等于认定「已经换过了」，
      而列表里躺着的仍是旧稿，用户再也等不到那一次换稿。 */
  let seededOk = true
  if (todo.length || stale.length) {
    try {
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
      for (const b of stale) {
        const i = kept.findIndex((s) => s.id === b.id)
        const r = parseChatPreset(b.json, cfgs)
        if (i < 0 || !r.ok) continue
        const old = kept[i]
        // 换的是内容（条目、预填充、通道参数），留下的是这一份在本机的归属：
        // 它开着的世界书（用户可能自己调过），以及「内置」这个标
        kept[i] = {
          ...r.scheme, id: b.id, builtin: true,
          activeLoreIds: old.activeLoreIds ?? active,
          ...(typeof r.stream === 'boolean' ? { stream: r.stream } : {}),
        }
        changed = true
      }
    } catch {
      /* 读世界书 / 读通道配置这一段落空（存储不可用、还没初始化完）：
         这一轮就不播不换，列表原样留着、账本也不记，下次开机再来一遍。
         **但绝不能因此跳过下面的自动启动** —— 「一份在生效的预设」是这条链上
         真正要紧的那一步，前面是补料，后面是让它起作用。 */
      seededOk = false
    }
  }

  const writeV = seededOk ? BUILTIN_V : led.v
  if (changed || writeV !== led.v) {
    storeSchemes(kept)
    try {
      localStorage.setItem(BUILTIN_KEY, JSON.stringify({ v: writeV, seeded: done }))
    } catch {
      /* 隐私模式：下次开机重播一遍 —— 上面两道闸（闩 + 按 id 平账）兜着，不会再翻倍 */
    }
  }

  // 换成稿子的那一份若正生效着，快照还停在旧内容上 —— 补落一次，否则生成读到的仍是旧指令
  if (stale.length) refreshActiveSnapshot(kept)

  // 顺序要紧：先自动启动（它会把快照整个写一遍），再看有没有「有方案、没快照」的漏
  return (await autoStart(kept)) || ensureActiveSnapshot() || changed
}

/** 生效的那一份刚换了内容：重落一次快照（套用的仍是同一份，只是内容新了） */
function refreshActiveSnapshot(list: Scheme[]): void {
  const id = activePresetId()
  if (!id || !list.some((s) => s.id === id)) return
  const s = list.find((x) => x.id === id)!
  snapshotActivePreset(s.id, s.name, s.entries ?? [], s.prefill ?? '')
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
