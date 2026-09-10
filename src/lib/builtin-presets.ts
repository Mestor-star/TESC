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
 * @returns 这一次有没有真的新加（界面据此决定要不要重读列表）
 */
export async function ensureBuiltinPresets(): Promise<boolean> {
  const seeded = readSeeded()
  const todo = BUILTINS.filter((b) => !seeded.includes(b.id))
  if (!todo.length) return false

  // 世界书先落库：内置预设要带上「当前激活集」，
  // 否则套用它会把 canon 世界书整片关掉（applySchemeTo 以方案里的集合为准）
  await ensureSeeded()
  const [cfgs, active] = [await readProfiles(), await getActiveLorebookIds()]

  const list = listSchemes()
  const done = [...seeded]
  for (const b of todo) {
    const r = parseChatPreset(b.json, cfgs)
    // 解析不出来（字段形状变了）就不记账，留待下次再试，别把一份空预设塞进列表
    if (!r.ok) continue
    // 固定 id + 补上激活集：内置的那份与手动导入的那份差别只在这里
    list.push({ ...r.scheme, id: b.id, builtin: true, activeLoreIds: active, ...(typeof r.stream === 'boolean' ? { stream: r.stream } : {}) })
    done.push(b.id)
  }
  if (done.length !== seeded.length) {
    storeSchemes(list)
    try {
      localStorage.setItem(BUILTIN_KEY, JSON.stringify({ v: 1, seeded: done }))
    } catch {
      /* 隐私模式：下次开机重播一遍，多出一份重复的内置预设，不算错 */
    }
    return true
  }
  return false
}
