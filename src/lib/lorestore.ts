/* ============================================================
   词条库 · 数据层门面
   ------------------------------------------------------------
   正面使用 tavernlike/database（Dexie 'zts-lore'）+ importer，
   向视图层暴露窄而稳的符号。绝不 export * from './tavernlike'
   （避免与 src/lib/api.ts 的 ApiSettings 撞名）。
   密钥从不落本库：备份/整库导出只含词条库与激活标记。
   ============================================================ */

import type { Lorebook, SillyTavernLorebookExport } from './tavernlike/types'
import * as db from './tavernlike/database'
import { importLorebook, importMultipleLorebooks, exportLorebook } from './tavernlike/importer'
import type { MultiImportInput } from './tavernlike/importer'
import { buildCanonLorebooks, CANON_BOOK_ACTIVE_IDS, CANON_SEED_KEY } from './loreseed'

export const ACTIVE_META_KEY = 'activeLorebookIds'

let activeCache: string[] | null = null

/* ---------- 播种 ---------- */

/** 幂等播种 canon 词条库（首次写库 + 记录种子版本；绝不覆盖既有 meta/用户库） */
export async function ensureSeeded(): Promise<void> {
  const seeded = await db.metaGet(CANON_SEED_KEY)
  if (seeded) return
  await db.bulkPutLorebooks(buildCanonLorebooks())
  const existing = await db.metaGet(ACTIVE_META_KEY)
  if (!Array.isArray(existing) || !(existing as unknown[]).length) {
    await db.metaSet(ACTIVE_META_KEY, CANON_BOOK_ACTIVE_IDS)
  }
  await db.metaSet(CANON_SEED_KEY, { v: 1, at: Date.now() })
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

/** 恢复整库：先清空 zts-lore（词条库 + meta），再写入备份内容 */
export async function restoreAll(data: LoreBackupFile): Promise<void> {
  if (!data || data.kind !== 'zts-lore-backup' || !Array.isArray(data.books)) {
    throw new Error('不是有效的词条库备份文件')
  }
  await db.wipeDatabase()
  await db.bulkPutLorebooks(data.books)
  const ids = Array.isArray(data.activeIds) ? data.activeIds : []
  await db.metaSet(ACTIVE_META_KEY, ids)
  await db.metaSet(CANON_SEED_KEY, { v: 1, at: Date.now(), restored: true })
  activeCache = null
}

/** 清空全部词条库数据（含种子版本标记）→ 下次挂载 ensureSeeded 自动重播 canon */
export async function clearAll(): Promise<void> {
  await db.wipeDatabase()
  activeCache = null
}
