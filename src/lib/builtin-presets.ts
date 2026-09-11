/* ============================================================
   内置预设 —— 开箱即用的「导演指令包」
   ------------------------------------------------------------
   presets/*.json 仍是唯一真源（也是给人手动导入的那两份），
   这里只在首启时把它们导一份进方案列表：用户不必先找文件、再点「导入预设」。
   转换走的是与「导入预设」完全相同的那一条路（parseChatPreset），
   所以内置的那份与手动导入的那份逐字一致 —— 不存在第二套写法。

   只播一次：播过就记账。之后你自己把它删了，不会下次开机又冒出来
   （想找回来就清掉这个 key，或直接从 presets/ 重新导入 json）。
   ============================================================ */

import protocolJson from '../../presets/终末停滞-协议预设.json'
import styleJson from '../../presets/终末停滞-文风参照原著.json'
import { readProfiles } from './api'
import { ensureSeeded, getActiveLorebookIds } from './lorestore'
import { listSchemes, parseChatPreset, storeSchemes } from './schemes'

export const BUILTIN_KEY = 'zts-builtin-presets:v1'

/** 内置预设的固定 id：认它就知道这一份是内置的（界面上挂「内置」标），重播也不会撞车 */
export const BUILTIN_IDS = ['builtin-ts-protocol', 'builtin-ts-style'] as const

const BUILTINS: { id: string; json: unknown }[] = [
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
 * 把还没播过的内置预设导进方案列表。幂等，可反复调。
 *
 * **同一时刻只跑一遍**：终端启动（Terminal）与设置页挂载都会喊它，
 * 而播种中途要 await 一串读写。没有这道闩，两边会各自读到「还没播过」的账、
 * 各播一遍 —— 内置预设当场翻倍（曾经列表里就是 4 份，两份一份的两份）。
 * @returns 这一次有没有真的改动（界面据此决定要不要重读列表）
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
  const todo = BUILTINS.filter((b) => !seeded.includes(b.id) && !seen.has(b.id))
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

  if (!changed) return false
  storeSchemes(kept)
  try {
    localStorage.setItem(BUILTIN_KEY, JSON.stringify({ v: 1, seeded: done }))
  } catch {
    /* 隐私模式：下次开机重播一遍 —— 上面两道闸（闩 + 按 id 平账）兜着，不会再翻倍 */
  }
  return true
}
