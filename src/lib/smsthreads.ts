/* ============================================================
   角色短信 · 群聊名册（lib/smsthreads.ts）
   ------------------------------------------------------------
   单聊线程的 id 就是角色 id，不必登记；这里只记**群聊**：
   `{ id: 'g:<uuid>', name, charIds }`。名单里的角色必须在会话里真的存在，
   否则系统提示会替一个不存在的成员写台词。
   ============================================================ */

import { charOf } from '../data/personas'
import type { CharId } from '../data/types'
import { GROUP_PREFIX } from './sms'

export interface GroupThread {
  id: string
  name: string
  charIds: CharId[]
  /** 建群时为群取的名（成员名拼的那串另存一份，供改名后仍能看出原始成员） */
  named?: boolean
}

export const THREADS_KEY = 'zts-sms-threads:v1'

export function listGroups(): GroupThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    const out: GroupThread[] = []
    for (const g of p) {
      if (!g || typeof g !== 'object') continue
      const o = g as Record<string, unknown>
      if (typeof o.id !== 'string' || !o.id.startsWith(GROUP_PREFIX)) continue
      const ids = Array.isArray(o.charIds)
        ? (o.charIds as unknown[]).filter((x): x is CharId => typeof x === 'string' && !!charOf(x))
        : []
      if (ids.length < 2) continue
      out.push({
        id: o.id,
        name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : nameOf(ids),
        charIds: ids,
        ...(o.named === true ? { named: true } : {}),
      })
    }
    return out
  } catch {
    return []
  }
}

export function storeGroups(list: GroupThread[]): void {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(list))
  } catch {
    /* 隐私模式下降级 */
  }
}

/** 群名默认取成员名（两三位用「、」连；多于三位收成「A・B 等 N 人」） */
export function nameOf(ids: CharId[]): string {
  const names = ids.map((id) => charOf(id)?.name ?? id)
  if (names.length <= 3) return names.join('、')
  return `${names[0]}・${names[1]} 等 ${names.length} 人`
}

export function makeGroup(charIds: CharId[], name?: string): GroupThread {
  const id = `${GROUP_PREFIX}${crypto.randomUUID()}`
  return {
    id,
    name: name?.trim() || nameOf(charIds),
    charIds,
    ...(name?.trim() ? { named: true } : {}),
  }
}
