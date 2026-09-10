/* ============================================================
   世界书 · 数据层门面
   ------------------------------------------------------------
   正面使用 tavernlike/database（Dexie 'zts-lore'）+ importer，
   向视图层暴露窄而稳的符号。绝不 export * from './tavernlike'
   （避免与 src/lib/api.ts 的 ApiSettings 撞名）。
   密钥从不落本库：备份/整库导出只含世界书与激活标记。
   ============================================================ */

import type { Lorebook, SillyTavernLorebookExport } from './tavernlike/types'
import * as db from './tavernlike/database'
import { importLorebook, importMultipleLorebooks, exportLorebook } from './tavernlike/importer'
import type { MultiImportInput } from './tavernlike/importer'
import {
  buildCanonLorebooks,
  CANON_BOOK_ACTIVE_IDS,
  CANON_SEED_KEY,
  CANON_SEED_VERSION,
  OBSOLETE_CANON_IDS,
} from './loreseed'

export const ACTIVE_META_KEY = 'activeLorebookIds'

let activeCache: string[] | null = null

/* ---------- 播种 ---------- */

/**
 * 幂等播种 canon 世界书：
 *  1) 每次挂载清理已废弃的旧版 canon 库（v1 独立「登场者登记」并入「角色档案」后的残留）；
 *  2) 仅当种子标记缺失或版本落后（v < CANON_SEED_VERSION）才重播 canon——
 *     bulkPut 按 id 逐库 upsert，绝不触碰用户自建库与既有激活集；版本一致后不再重复覆盖。
 */
export async function ensureSeeded(): Promise<void> {
  const existingBooks = await db.listLorebooks()
  const obsolete = new Set(OBSOLETE_CANON_IDS)
  for (const b of existingBooks) {
    if (obsolete.has(b.id)) await deleteBook(b.id)
  }
  const seeded = await db.metaGet(CANON_SEED_KEY)
  const ver = seeded && typeof seeded === 'object'
    ? Number((seeded as { v?: unknown }).v ?? 0) || 0
    : 0
  if (ver >= CANON_SEED_VERSION) return
  await db.bulkPutLorebooks(buildCanonLorebooks())
  // canon 库一律全开：既有的激活集保留（用户自建库的选择不动），
  // 但每次重播都把 canon 全集并进来 —— 否则新加的 canon 库
  // （如 v5 的「主角专档」）在旧安装上永远停在未激活。
  const existing = await db.metaGet(ACTIVE_META_KEY)
  const kept = Array.isArray(existing)
    ? (existing as unknown[]).filter((x): x is string => typeof x === 'string' && !obsolete.has(x))
    : []
  await db.metaSet(ACTIVE_META_KEY, [...new Set([...kept, ...CANON_BOOK_ACTIVE_IDS])])
  await db.metaSet(CANON_SEED_KEY, { v: CANON_SEED_VERSION, at: Date.now() })
  activeCache = null
}

/* ---------- 激活集 ---------- */

export function invalidateActiveCache(): void {
  activeCache = null
}

export async function getActiveLorebookIds(): Promise<string[]> {
  if (activeCache) return activeCache
  const raw = await db.metaGet(ACTIVE_META_KEY)
  activeCache = Array.isArray(raw) ? (raw as string[]) : []
  return activeCache
}

export async function setBookActive(id: string, on: boolean): Promise<void> {
  const cur = await getActiveLorebookIds()
  const next = on
    ? cur.includes(id) ? cur : [...cur, id]
    : cur.filter((x) => x !== id)
  await db.metaSet(ACTIVE_META_KEY, next)
  activeCache = next
}

/* ---------- 查询 ---------- */

export async function listAllBooks(): Promise<Lorebook[]> {
  return db.listLorebooks()
}

export async function loadActiveBooks(): Promise<Lorebook[]> {
  const [ids, books] = await Promise.all([getActiveLorebookIds(), db.listLorebooks()])
  const byId = new Map(books.map((b) => [b.id, b]))
  return ids
    .map((id) => byId.get(id))
    .filter((b): b is Lorebook => Boolean(b))
}

/* ---------- 增删改 ---------- */

export async function saveBook(book: Lorebook): Promise<void> {
  await db.saveLorebook({ ...book, updatedAt: Date.now() })
}

export async function deleteBook(id: string): Promise<void> {
  await db.deleteLorebook(id)
  const cur = await getActiveLorebookIds()
  if (cur.includes(id)) await setBookActive(id, false)
}

/* ---------- 预设调配 · 逐条开关 ----------
   世界书自身的 enabled 是「书上的笔迹」；预设自带的开关集是「套用时才覆上去的一层滤网」。
   套用之前预设只是本地一份记录，不碰任何书；套用之时整层覆盖（这正是预设的意义）。 */

/** 快照指定世界书的「关闭词条」集（bookId → 已关闭的条目 id）；供预设捕捉 */
export async function snapshotEntryOff(bookIds: string[]): Promise<Record<string, string[]>> {
  const want = new Set(bookIds)
  const out: Record<string, string[]> = {}
  for (const b of await listAllBooks()) {
    if (!want.has(b.id)) continue
    out[b.id] = b.entries.filter((e) => e.enabled === false).map((e) => e.id)
  }
  return out
}

/** 以预设的「关闭词条」集覆盖世界书（未列入者一律启用）；只动集合中出现的书 */
export async function applyEntryOff(off: Record<string, string[]>): Promise<void> {
  for (const b of await listAllBooks()) {
    const offIds = off[b.id]
    if (!offIds) continue
    const dead = new Set(offIds)
    let changed = false
    const entries = b.entries.map((e) => {
      const on = !dead.has(e.id)
      if ((e.enabled !== false) === on) return e
      changed = true
      return { ...e, enabled: on }
    })
    if (changed) await saveBook({ ...b, entries })
  }
}

/** 当前激活世界书的「关闭词条」集（供 UI 显示预设滤网是否与现状一致） */
export async function activeEntryOff(): Promise<Record<string, string[]>> {
  return snapshotEntryOff(await getActiveLorebookIds())
}

/* ---------- ST JSON 导入导出（中性文案在 importer 内兜底） ---------- */

export async function importStLorebook(data: SillyTavernLorebookExport): Promise<Lorebook> {
  const partial = importLorebook(data)
  const t = Date.now()
  const lb: Lorebook = { id: crypto.randomUUID(), ...partial, createdAt: t, updatedAt: t }
  await db.saveLorebook(lb)
  return lb
}

export interface ImportMultiResult {
  book?: Lorebook
  fileName: string
  error?: string
}

export async function importStLorebookMulti(inputs: MultiImportInput[]): Promise<ImportMultiResult[]> {
  const result = importMultipleLorebooks(inputs)
  const out: ImportMultiResult[] = []
  for (const s of result.successes) {
    const t = Date.now()
    const lb: Lorebook = {
      id: crypto.randomUUID(),
      name: s.lorebook.name,
      description: s.lorebook.description,
      entries: s.lorebook.entries,
      recursiveScanning: s.lorebook.recursiveScanning,
      caseSensitive: s.lorebook.caseSensitive,
      matchWholeWords: s.lorebook.matchWholeWords,
      createdAt: t,
      updatedAt: t,
    }
    await db.saveLorebook(lb)
    out.push({ fileName: s.fileName, book: lb })
  }
  for (const f of result.failures) out.push({ fileName: f.fileName, error: f.error })
  return out
}

export function exportBookAsStJson(lb: Lorebook): SillyTavernLorebookExport {
  return exportLorebook(lb)
}

/* ---------- 整库备份 / 恢复 / 清空（绝不触碰密钥存储） ---------- */

export interface LoreBackupFile {
  kind: 'zts-lore-backup'
  v: 1
  books: Lorebook[]
  activeIds: string[]
  exportedAt: number
}

export async function backupAll(): Promise<LoreBackupFile> {
  const [books, activeIds] = await Promise.all([db.listLorebooks(), getActiveLorebookIds()])
  return { kind: 'zts-lore-backup', v: 1, books, activeIds, exportedAt: Date.now() }
}

/** 恢复整库：先清空 zts-lore（世界书 + meta），再写入备份内容 */
export async function restoreAll(data: LoreBackupFile): Promise<void> {
  if (!data || data.kind !== 'zts-lore-backup' || !Array.isArray(data.books)) {
    throw new Error('不是有效的世界书备份文件')
  }
  await db.wipeDatabase()
  await db.bulkPutLorebooks(data.books)
  const ids = Array.isArray(data.activeIds) ? data.activeIds : []
  await db.metaSet(ACTIVE_META_KEY, ids)
  await db.metaSet(CANON_SEED_KEY, { v: CANON_SEED_VERSION, at: Date.now(), restored: true })
  activeCache = null
}

/** 清空全部世界书数据（含种子版本标记）→ 下次挂载 ensureSeeded 自动重播 canon */
export async function clearAll(): Promise<void> {
  await db.wipeDatabase()
  activeCache = null
}
