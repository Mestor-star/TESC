/**
 * 世界书数据层（改编自 tavernlike v3 的 database.ts）
 * ------------------------------------------------------------
 * 原版 DB 'SillyTavernWebDB' v3（lorebooks / presets / settings / chats）。
 * 本改编仅保留 cnm 需要的部分，并改用中性命名、中性数据库名：
 *   - DB 'zts-lore' v1
 *   - 表 lorebooks:'id, name, updatedAt'   —— 世界书
 *   - 表 meta:'key'                        —— 轻量 KV（激活库 id 集、种子版本号等）
 * 去掉 presets / settings / chats 与上游默认方案播种；密钥仍只存在于
 * zts-terminal-store（api:main / api:sms），本库永不写入任何密钥。
 * 保持惰性 getDatabase() 单例：模块加载不产生任何副作用。
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'

import type { Lorebook } from './types'

export const LORE_DB_NAME = 'zts-lore'
export const LORE_DB_VERSION = 1

export interface LoreMetaRow {
  key: string
  value: unknown
}

class LoreDatabase extends Dexie {
  lorebooks!: Table<Lorebook, string>
  meta!: Table<LoreMetaRow, string>

  constructor() {
    super(LORE_DB_NAME)
    this.version(LORE_DB_VERSION).stores({
      lorebooks: 'id, name, updatedAt',
      meta: 'key',
    })
  }
}

let dbInstance: LoreDatabase | null = null

/** 惰性单例：第一次调用才真正打开 Dexie 连接 */
export function getDatabase(): LoreDatabase {
  if (!dbInstance) dbInstance = new LoreDatabase()
  return dbInstance
}

export async function listLorebooks(): Promise<Lorebook[]> {
  return getDatabase().lorebooks.toArray()
}

export async function saveLorebook(book: Lorebook): Promise<void> {
  await getDatabase().lorebooks.put(book)
}

export async function bulkPutLorebooks(books: Lorebook[]): Promise<void> {
  if (!books.length) return
  await getDatabase().lorebooks.bulkPut(books)
}

export async function deleteLorebook(id: string): Promise<void> {
  await getDatabase().lorebooks.delete(id)
}

export async function clearLorebooks(): Promise<void> {
  await getDatabase().lorebooks.clear()
}

export async function metaGet(key: string): Promise<unknown> {
  const row = await getDatabase().meta.get(key)
  return row?.value
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  await getDatabase().meta.put({ key, value })
}

/** 删除整个 zts-lore 库并重置单例（用于「清空世界书」） */
export async function wipeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.delete()
    dbInstance = null
  } else {
    await Dexie.delete(LORE_DB_NAME)
  }
}
