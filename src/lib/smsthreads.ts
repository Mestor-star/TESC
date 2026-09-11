/* ============================================================
   角色短信 · 群聊名册（lib/smsthreads.ts）
   ------------------------------------------------------------
   单聊线程的 id 就是角色 id，不必登记；这里只记**群聊**：
   `{ id: 'g:<uuid>', name, charIds }`。名单里的角色必须在会话里真的存在，
   否则系统提示会替一个不存在的成员写台词。
   ============================================================ */

import { charOf } from '../data/personas'
import { GROUP_PREFIX } from './sms'

export interface GroupThread {
  id: string
  name: string
  /**
   * 群成员（人物档案 id，`charOf` 认得即可）。
   *
   * 早先这里写死成 `CharId`（主役那四位）—— 那是个误会：群聊本来就要拉得进
   * 会长、副官、恋兔队老前辈这些人，`groupSystemPrompt` 与 `parseGroupReply`
   * 收的也一直是宽表；把类型收窄在名册这一层，等于亲手把「恋兔队」限制成
   * 只能有四个人。成员是否在册由 `charOf` 说了算（见 listGroups 的过滤）。
   */
  charIds: string[]
  /** 建群时为群取的名（成员名拼的那串另存一份，供改名后仍能看出原始成员） */
  named?: boolean
}

export const THREADS_KEY = 'zts-sms-threads:v1'

/* ------------------------------------------------------------
   内置群聊：终端自带两个群，其余一律由观测者自己建。

   这两个不是随手起的名 —— 名单照 `roster.ts` 的分组与各卷正文里写死的所属关系：
     · 「恋兔队」＝ 苍之学园委员会的两翼之一（恋人队本身）：恋兔光（队长）、
       梅芙莉莎（战术副官）、小柴喵呜（护卫）、小柴琳（恋兔队）、吴诗涵（队里资历最老
       的成员 —— 见 persona.ts「名义上也还是恋兔队资历最老的成员」）。
     · 「苍之学园」＝ 学园那一档：上面几位 + 会长艾莉芙・安纳托利亚、副会长弗恩・西蒙、
       以及作为体验入学担保人一方的露娜。
   名单只准从这两处引，不新增人物；某位将来若不在了（正文里退场），删的是名册那一行，
   这里跟着空掉一个人，不改群名。
   ------------------------------------------------------------ */

export const BUILTIN_GROUPS_KEY = 'zts-sms-builtin-groups:v1'
/** 内置群聊的**内容**版本号：名单或群名改过就 +1，老装机下一轮启动时换稿。 */
const BUILTIN_GV = 1

export const BUILTIN_GROUPS: GroupThread[] = [
  {
    id: `${GROUP_PREFIX}builtin-koito`,
    name: '恋兔队',
    named: true,
    charIds: ['hikari', 'mefisa', 'nyau', 'xiaochai-lin', 'youshihan'],
  },
  {
    id: `${GROUP_PREFIX}builtin-ao`,
    name: '苍之学园',
    named: true,
    charIds: ['hikari', 'luna', 'mefisa', 'nyau', 'youshihan', 'alive-anatolia', 'vern-simon', 'xiaochai-lin'],
  },
]

export const BUILTIN_GROUP_IDS: string[] = BUILTIN_GROUPS.map((g) => g.id)

/** 该不该补种：账上没记、列表里也没有 —— 才补。用户删掉的那个（账上记过）不塞回来。 */
export function shouldSeedGroup(
  seeded: readonly string[], id: string, idsInList: readonly string[],
): boolean {
  return !seeded.includes(id) && !idsInList.includes(id)
}

/** 该不该换稿：账本比当前版本旧、且那一份还在列表里（删了的就是删了）。 */
export function needsGroupRefresh(
  ledgerV: number, id: string, idsInList: readonly string[],
): boolean {
  return ledgerV < BUILTIN_GV && idsInList.includes(id)
}

interface GroupLedger {
  v?: number
  seeded?: string[]
  /** 上次播下去时**我给的群名**：用来分辨「用户改过名」与「还没改」——
      换稿时只把没改过名的那些跟着新版走，改过名的按用户写的留着。 */
  names?: Record<string, string>
}

function readGroupLedger(): GroupLedger {
  try {
    const raw = localStorage.getItem(BUILTIN_GROUPS_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return {}
    const o = p as Record<string, unknown>
    const names: Record<string, string> = {}
    if (o.names && typeof o.names === 'object') {
      for (const [k, v] of Object.entries(o.names as Record<string, unknown>)) {
        if (typeof v === 'string') names[k] = v
      }
    }
    return {
      ...(typeof o.v === 'number' ? { v: o.v } : {}),
      ...(Array.isArray(o.seeded) ? { seeded: (o.seeded as unknown[]).filter((x): x is string => typeof x === 'string') } : {}),
      ...(Object.keys(names).length ? { names } : {}),
    }
  } catch { return {} }
}

/**
 * 播内置群聊。幂等，可反复调；返回这一次有没有真的写入（界面据此决定要不要重读名册）。
 *
 * 与 `builtin-presets` 同一套路数，理由也一样：只补不重播（同一 id 只认一份）、
 * 记版本号（改过名单的老装机才换得上稿）、**尊重删除**（用户把内置那个群解散了，
 * 再启动不给他塞回来 —— 否则「删掉」这个动作在这个终端里就不算数）。
 */
export function ensureBuiltinGroups(): boolean {
  const led = readGroupLedger()
  const seeded = led.seeded ?? []
  const cur = listGroups()
  const have = cur.map((g) => g.id)

  const todo = BUILTIN_GROUPS.filter((g) => shouldSeedGroup(seeded, g.id, have))
  const stale = BUILTIN_GROUPS.filter((g) => needsGroupRefresh(led.v ?? 0, g.id, have))
  const keptIds = [...new Set([
    ...seeded,
    ...have.filter((id) => BUILTIN_GROUP_IDS.includes(id)),
  ])]
  if (!todo.length && !stale.length) {
    // 账本版本还是要落到当前这一版：不然每次启动都要重算一遍名单
    if ((led.v ?? 0) !== BUILTIN_GV) writeGroupLedger(BUILTIN_GV, keptIds, led.names ?? {})
    return false
  }

  const next = [...cur]
  for (const g of todo) next.push({ ...g, charIds: [...g.charIds] })
  for (const g of stale) {
    const i = next.findIndex((x) => x.id === g.id)
    if (i < 0) continue
    /* 换稿只换**名单**（外加「用户没改过名」时的群名）：这个群的聊天记录挂在自己的 id 上，
       一条都不会因此丢。用户改过名的那些，名字按他写的留着。 */
    const userRenamed = led.names?.[g.id] != null && next[i].name !== led.names?.[g.id]
    next[i] = userRenamed ? { ...next[i], charIds: [...g.charIds] } : { ...g, charIds: [...g.charIds] }
  }
  storeGroups(next)
  writeGroupLedger(
    BUILTIN_GV,
    [...new Set([...keptIds, ...todo.map((g) => g.id)])],
    { ...(led.names ?? {}), ...Object.fromEntries(BUILTIN_GROUPS.map((g) => [g.id, g.name])) },
  )
  return true
}

function writeGroupLedger(v: number, seeded: string[], names: Record<string, string>): void {
  try {
    localStorage.setItem(BUILTIN_GROUPS_KEY, JSON.stringify({ v, seeded, names }))
  } catch {
    /* 隐私模式下降级：下一次启动再补 */
  }
}

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
        ? (o.charIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!charOf(x))
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
export function nameOf(ids: string[]): string {
  const names = ids.map((id) => charOf(id)?.name ?? id)
  if (names.length <= 3) return names.join('、')
  return `${names[0]}・${names[1]} 等 ${names.length} 人`
}

export function makeGroup(charIds: string[], name?: string): GroupThread {
  const id = `${GROUP_PREFIX}${crypto.randomUUID()}`
  return {
    id,
    name: name?.trim() || nameOf(charIds),
    charIds,
    ...(name?.trim() ? { named: true } : {}),
  }
}
