/* ============================================================
   内置预设 —— 开箱即用的「导演指令包」
   ------------------------------------------------------------
   presets/*.json 仍是唯一真源（也是给人手动导入的那两份），
   这里只在首启时把它们导一份进方案列表：用户不必先找文件、再点「导入预设」。
   转换走的是与「导入预设」完全相同的那一条路（parseChatPreset），
   所以内置的那份与手动导入的那份逐字一致 —— 不存在第二套写法。

   **播进来还不算数，得能用上**：光把两份预设摆进列表，用户还得自己找到那一行、
   点一下「套用」，此前生成读到的仍是空快照（没有导演指令、预算还是通道缺省）。
   所以这里再走一步：本机**从没套用过任何预设**时，自动把协议预设套上（见 autoStart）。
   判据是纯函数（shouldAutoStart），好让复核把四种情形都摆一遍。

   只播一次、也只自动启动一次：两件事各记一本账。之后你自己把它删了、
   或换成别的预设，都不会下次开机又冒出来
   （想找回来就清掉这两个 key，或直接从 presets/ 重新导入 json）。
   ============================================================ */

import protocolJson from '../../presets/终末停滞-协议预设.json'
import styleJson from '../../presets/终末停滞-文风参照原著.json'
import { readProfiles, saveProfile } from './api'
import { DEFAULT_BUDGET } from './budget'
import { ensureSeeded, getActiveLorebookIds } from './lorestore'
import { activePresetId } from './preset'
import { applySchemePersisted, listSchemes, parseChatPreset, storeSchemes } from './schemes'
import type { Scheme } from './schemes'

export const BUILTIN_KEY = 'zts-builtin-presets:v1'
/** 自动启动那一步的账：只做一次，且只对「从没套过任何预设」的机器做 */
export const BUILTIN_START_KEY = 'zts-builtin-start:v1'
/** 预算抬底那一步的账：同样只做一次 */
export const BUDGET_FLOOR_KEY = 'zts-budget-floor:v1'

/**
 * 这个通道上存的输出预算该不该抬到缺省那一档 —— **纯函数**，好让复核把各种值摆一遍。
 *
 * 只认**我们自己写进去过的**那些值：0 / 非数字（从没设过）与 1500（旧缺省）。
 * 用户自己打的数（比如 4096）一律不动 —— 那是他选的，不是我们塞的。
 */
export function needsBudgetFloor(n: unknown): boolean {
  return typeof n !== 'number' || !Number.isFinite(n) || n === 0 || n === 1500
}

/**
 * 把还停在旧缺省上的输出预算抬到建议值（一次性）。
 *
 * 为什么要有这一步：自动启动只对「从没套过任何预设」的机器生效（那是它的分寸）。
 * 已经套用过别的预设的机器，预算留在旧缺省 1500 上 —— 那条通道上什么都写不出来，
 * 而界面上看不出异常（它能生成，只是每一段都被长度掐断）。所以这里单独补一次。
 */
export async function ensureBudgetFloor(): Promise<boolean> {
  let done = false
  try {
    done = localStorage.getItem(BUDGET_FLOOR_KEY) !== null
  } catch {
    /* 隐私模式：读不到账就当作没做过 —— 下面写账也会失败，下次开机再来一遍，无害 */
  }
  if (done) return false
  try {
    const p = await readProfiles()
    const raiseMain = needsBudgetFloor(p.main.maxTokens)
    const raiseSms = needsBudgetFloor(p.sms.maxTokens)
    if (raiseMain || raiseSms) {
      await Promise.all([
        raiseMain ? saveProfile('main', { ...p.main, maxTokens: DEFAULT_BUDGET }) : Promise.resolve(),
        raiseSms ? saveProfile('sms', { ...p.sms, maxTokens: DEFAULT_BUDGET }) : Promise.resolve(),
      ])
    }
    localStorage.setItem(BUDGET_FLOOR_KEY, JSON.stringify({
      v: 1, at: Date.now(), from: { main: p.main.maxTokens, sms: p.sms.maxTokens },
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
 * 三处都要拦住：
 *   · 已经套用过任何预设（active 非空）→ 不动。用户自己配好的东西，
 *     不该被一份「自带的」在下次开机时盖掉 —— 自动启动不是自动覆盖。
 *   · 这个机制此前做过一次 → 不再做。只对新机器生效。
 *   · 列表里根本没有内置那一份（被删了）→ 无事可做。
 * @returns 要自动启动的那一份的 id；不该启动时为 null
 */
export function shouldAutoStart(state: {
  /** 本机当前生效的预设 id（没套过任何预设为 null） */
  activeId: string | null
  /** 本机制此前自动启动过没有 */
  started: boolean
  /** 方案列表里现有的 id */
  ids: string[]
}): string | null {
  if (state.started) return null
  if (state.activeId) return null
  return state.ids.includes(BUILTIN_IDS[0]) ? BUILTIN_IDS[0] : null
}

function readStarted(): boolean {
  try {
    return localStorage.getItem(BUILTIN_START_KEY) !== null
  } catch {
    return false
  }
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

  return (await autoStart(kept)) || changed
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
  const id = shouldAutoStart({
    activeId: activePresetId(),
    started: readStarted(),
    ids: list.map((s) => s.id),
  })
  if (!id) return false
  const target = list.find((s) => s.id === id)
  if (!target) return false
  // 先落账再套用：套用中途失败（配额、隐私模式）不该在下次开机重来一遍 ——
  // 那时用户可能已经配好了别的东西，重来就是覆盖。
  try {
    localStorage.setItem(BUILTIN_START_KEY, JSON.stringify({ v: 1, id, at: Date.now() }))
  } catch {
    /* 记不上账就当作已启动过：宁可少启动一次，也不要以后每次都来覆盖一遍 */
  }
  await applySchemePersisted(target)
  return true
}
