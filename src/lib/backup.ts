/**
 * 整份备份 · 导出 / 预览 / 恢复
 * ------------------------------------------------------------
 * 一份 .json 装下**整个本终端进度**，供「清浏览器数据前先存一份」用：
 *   · localStorage 里全部 `zts-` 前缀键（运行档 / 会话日志 / 存档槽 / 约会名册 /
 *     待落盘状态 / 方案 / 预设 / 通联日志 …）；
 *   · IndexedDB 三库全部表：'zts-lore'（世界书）、'zts-terminal-store'（终端态）、
 *     'zts-battle'（军需 / 体力 / 作战记录 —— 它也是进度，别漏）。
 *
 * ⚠️ **密钥永不进文件**：接口密钥只住在 'zts-terminal-store' 的 kv 里
 *    （键 api:main / api:sms / 旧键 api）。导出时这几格显式剔除；
 *    导入时也不清 kv、不覆盖既有密钥（见 writeDb 的 preserveSecrets）。
 *    另外全量做一遍字段级脱敏（apiKey / authorization / token …）兜底。
 *
 * ⚠️ **恢复必须能退回**：动手前先把现状整份抓进内存，写回中途任何一步抛错，
 *    就用那份快照原样还原，再把错误抛出去（调用方据此报错）。
 *
 * 大文件（≥5MB）：解析结果留在调用方的模块作用域，界面只拿一份「摘要」渲染，
 * 绝不把整份备份塞进 React state 反复重渲染。
 */

import { adoptSlotsFileFromBackup, SLOTS_KEY } from './slots'

export const BACKUP_MAGIC = 'ZTS-BACKUP'
export const BACKUP_VERSION = 1
/** localStorage 里属于本终端的键前缀 */
export const LS_PREFIX = 'zts-'
const APP_NAME = 'zts-terminal'
const APP_VERSION = '1.0.0'

/**
 * 三个本地库的**表结构**（事实源在各自的 database 模块里；这里抄的是 schema，
 * 只用于「浏览器里还没有这个库时，把它按原样建出来」—— 比如清完缓存直接导入）。
 * 写法照 Dexie 的 stores()：'键路径, 索引…'；null = 无键路径（out-of-line key）。
 */
const DB_SCHEMAS: Record<string, Record<string, string | null>> = {
  'zts-lore': { lorebooks: 'id, name, updatedAt', meta: 'key' },
  'zts-terminal-store': { kv: null },
  'zts-battle': { records: 'id, missionId, at', meta: 'key' },
}

/** 备份覆盖的库名（顺序稳定，便于对读） */
export const BACKUP_DB_NAMES = Object.keys(DB_SCHEMAS)
/** 密钥所在库 */
const SECRET_DB = 'zts-terminal-store'
/** 密钥键名（api:main / api:sms / 旧键 api）—— 一律不导 */
const SECRET_KV_KEY = /^api(?:$|[:._-])/i
/** 字段级脱敏兜底：任何对象里叫这些名字的字段都不写出去 */
const SECRET_FIELD = /^(api[_-]?key|authorization|auth|token|access[_-]?token|secret|password)$/i

/* ---------- 文件格式 ---------- */

/** 一行记录：k = 键（表自带键路径时省略），v = 值 */
export interface BackupRow {
  k?: string | number
  v: unknown
}
export interface BackupDb {
  [table: string]: BackupRow[]
}
export interface BackupCounts {
  /** localStorage 键数 */
  localKeys: number
  /** localStorage 字符数（体积参考） */
  localChars: number
  /** IndexedDB 行数合计 */
  idbRows: number
  /** 逐库行数 */
  byDb: Record<string, number>
}
export interface BackupFile {
  magic: string
  v: number
  exportedAt: number
  app: { name: string; version: string }
  counts: BackupCounts
  local: Record<string, string>
  idb: Record<string, BackupDb>
}

/** 给界面看的摘要 —— 只含数字与字符串，可安全放进 state */
export interface BackupPreview {
  exportedAt: number
  version: number
  app: { name: string; version: string }
  bytes: number
  localKeys: number
  dbs: { name: string; rows: number; tables: { table: string; rows: number }[] }[]
  totalRows: number
}

export type ParseResult =
  | { ok: true; file: BackupFile; preview: BackupPreview; name: string }
  | { ok: false; error: string }

/* ---------- 小工具 ---------- */

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('本地存储区事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('本地存储区事务中断'))
  })
}

/** JSON 键 → 可序列化的键（本终端的键只有 string / number 两种） */
function asKey(k: IDBValidKey): string | number {
  return typeof k === 'number' ? k : String(k)
}

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && Object.getPrototypeOf(x) === Object.prototype

/** 字段级脱敏：深拷一遍，砍掉叫 apiKey / authorization / token 的字段 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 24 || value === null || typeof value !== 'object') return value
  if (!isPlainObject(value) && !Array.isArray(value)) return value
  if (Array.isArray(value)) return value.map((x) => redact(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_FIELD.test(k)) continue
    out[k] = redact(v, depth + 1)
  }
  return out
}

/* ---------- localStorage ---------- */

/** 抓全部 zts- 键（原样字符串，读回时原样写） */
function readLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(LS_PREFIX)) continue
      const val = localStorage.getItem(k)
      if (val != null) out[k] = val
    }
  } catch {
    /* 隐私模式：当作一份都没有 */
  }
  return out
}

/** 用备份覆盖 localStorage：先删掉备份里没有的 zts- 键，再逐条写回 */
function writeLocal(local: Record<string, string>): void {
  const current = Object.keys(readLocal())
  for (const k of current) {
    if (k in local) continue
    try {
      localStorage.removeItem(k)
    } catch {
      /* 删不掉就算了，写回那一步会覆盖 */
    }
  }
  for (const [k, v] of Object.entries(local)) {
    try {
      localStorage.setItem(k, v)
    } catch {
      throw new Error(`写入 ${k} 失败（浏览器存储配额已满？）`)
    }
  }
}

/* ---------- IndexedDB ---------- */

/** 已存在的库名（不支持 databases() 的老浏览器返回 null） */
async function existingDbs(): Promise<string[] | null> {
  try {
    if (typeof indexedDB.databases !== 'function') return null
    const list = await indexedDB.databases()
    return list.map((d) => d.name ?? '').filter(Boolean)
  } catch {
    return null
  }
}

/** 打开已有库（不存在就当场建成空库，由调用方按「没有」处理） */
function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(`打开本地库 ${name} 失败`))
    // 别的标签页还压着旧版本时，打开会被挂住 —— 既不成功也不报错，不接这一把就是永不 settle
    req.onblocked = () => reject(new Error(`本地库 ${name} 被别的标签页占着（旧版本没关），请先关掉那边再重试`))
  })
}

/** 按 schema 建表（含索引）—— 只补缺，不动已有的 */
function applySchema(db: IDBDatabase, stores: Record<string, string | null>): void {
  for (const [table, spec] of Object.entries(stores)) {
    if (db.objectStoreNames.contains(table)) continue
    if (spec == null) {
      db.createObjectStore(table)
      continue
    }
    const [keyPath, ...rest] = spec.split(',').map((s) => s.trim())
    const st = db.createObjectStore(table, { keyPath })
    for (const raw of rest) {
      if (!raw) continue
      const idxName = raw.replace(/^[&*]/, '').trim()
      if (!idxName) continue
      st.createIndex(idxName, idxName, { unique: raw.startsWith('&') })
    }
  }
}

function openWithSchema(name: string, schema: Record<string, string | null>, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version)
    req.onupgradeneeded = () => applySchema(req.result, schema)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(`打开本地库 ${name} 失败`))
    // 升版本时若别的标签页没关，`onblocked` 是唯一会到的那一下（同样是不 settle 的老路）
    req.onblocked = () => reject(new Error(`本地库 ${name} 正在升级，被别的标签页占着 —— 请先关掉那边再重试`))
  })
}

/** 打开（必要时补齐表后）可写的库 */
async function openForWrite(name: string): Promise<IDBDatabase> {
  const schema = DB_SCHEMAS[name]
  if (!schema) throw new Error(`未知的本地库 ${name}`)
  const db = await openWithSchema(name, schema)
  const missing = Object.keys(schema).filter((t) => !db.objectStoreNames.contains(t))
  if (!missing.length) return db
  // 库是旧的 / 缺表：升一版把缺的表补齐
  const nextVer = db.version + 1
  db.close()
  return openWithSchema(name, schema, nextVer)
}

/** 读一张表（含 out-of-line 键） */
async function readTable(db: IDBDatabase, table: string): Promise<BackupRow[]> {
  const tx = db.transaction(table, 'readonly')
  const st = tx.objectStore(table)
  const inline = st.keyPath != null
  const keysReq = st.getAllKeys()
  const valsReq = st.getAll()
  await txDone(tx)
  const keys = keysReq.result
  const vals = valsReq.result
  const rows: BackupRow[] = []
  for (let i = 0; i < vals.length; i += 1) {
    rows.push(inline ? { v: vals[i] } : { k: asKey(keys[i]), v: vals[i] })
  }
  return rows
}

/**
 * 把一份 idb 数据写回本地库。
 * preserveSecrets = true 时：'zts-terminal-store' 的 kv **不清空**，
 * 只按备份里的键逐条覆盖 —— 于是现存的 api:main / api:sms 一根汗毛都不动。
 */
async function writeDb(dbName: string, data: BackupDb, preserveSecrets: boolean): Promise<void> {
  const keepSecrets = preserveSecrets && dbName === SECRET_DB
  const db = await openForWrite(dbName)
  try {
    const schema = DB_SCHEMAS[dbName] ?? {}
    const tables = Object.keys(schema).filter((t) => db.objectStoreNames.contains(t))
    if (!tables.length) return
    const tx = db.transaction(tables, 'readwrite')
    for (const table of tables) {
      const st = tx.objectStore(table)
      const inline = st.keyPath != null
      const rows = data[table] ?? []
      if (!keepSecrets) st.clear()
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        if (keepSecrets && row.k != null && SECRET_KV_KEY.test(String(row.k))) continue
        // 写回一律原样：脱敏只发生在**导出**那一侧（snapshotAll(false)），
        // 否则「导入失败 → 回滚」这条路会把用户现存的密钥一并抹掉。
        if (inline) st.put(row.v)
        else st.put(row.v, (row.k ?? '') as IDBValidKey)
      }
    }
    await txDone(tx)
  } finally {
    db.close()
  }
}

/* ---------- 抓取 / 写回 ---------- */

export interface BackupSnapshot {
  local: Record<string, string>
  idb: Record<string, BackupDb>
}

/**
 * 把现状整份抓出来。
 * includeSecrets = true 时连密钥一起抓 —— **只给回滚用的内存快照**，永不落文件；
 * 写成 false 才是导出用的那份。
 */
export async function snapshotAll(includeSecrets: boolean): Promise<BackupSnapshot> {
  const local = readLocal()
  const idb: Record<string, BackupDb> = {}
  const known = await existingDbs()
  for (const name of BACKUP_DB_NAMES) {
    if (known && !known.includes(name)) {
      idb[name] = {}
      continue
    }
    let db: IDBDatabase | null = null
    try {
      db = await openDb(name)
    } catch {
      idb[name] = {}
      continue
    }
    const stores = Object.keys(DB_SCHEMAS[name]).filter((t) => db!.objectStoreNames.contains(t))
    if (!stores.length) {
      db.close()
      idb[name] = {}
      continue
    }
    const out: BackupDb = {}
    for (const table of stores) {
      try {
        out[table] = await readTable(db, table)
      } catch {
        out[table] = []
      }
    }
    db.close()
    if (!includeSecrets) {
      // 导出侧：密钥键剔掉 + 字段级脱敏兜底
      for (const table of Object.keys(out)) {
        let rows = out[table]
        if (name === SECRET_DB && table === 'kv') {
          rows = rows.filter((r) => r.k == null || !SECRET_KV_KEY.test(String(r.k)))
        }
        out[table] = rows.map((r) => ({ k: r.k, v: redact(r.v) }))
      }
    }
    idb[name] = out
  }
  return { local, idb }
}

function countIdb(idb: Record<string, BackupDb>): { total: number; byDb: Record<string, number> } {
  const byDb: Record<string, number> = {}
  let total = 0
  for (const [name, tables] of Object.entries(idb)) {
    let n = 0
    for (const rows of Object.values(tables)) n += Array.isArray(rows) ? rows.length : 0
    byDb[name] = n
    total += n
  }
  return { total, byDb }
}

/** 组装一份可导出的备份（密钥已剔除） */
export async function buildBackup(): Promise<BackupFile> {
  const snap = await snapshotAll(false)
  const localChars = Object.values(snap.local).reduce((n, s) => n + s.length, 0)
  const { total, byDb } = countIdb(snap.idb)
  return {
    magic: BACKUP_MAGIC,
    v: BACKUP_VERSION,
    exportedAt: Date.now(),
    app: { name: APP_NAME, version: APP_VERSION },
    counts: { localKeys: Object.keys(snap.local).length, localChars, idbRows: total, byDb },
    local: snap.local,
    idb: snap.idb,
  }
}

/** `zts-backup-YYYYMMDD-HHmm.json` */
export function backupFileName(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `zts-backup-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.json`
}

/** Blob + createObjectURL 下载（不引任何依赖） */
export function downloadBackup(file: BackupFile): string {
  const name = backupFileName()
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return name
}

/**
 * 自检：备份文本里有没有密钥字样。
 * 空数组 = 导出文件里确实一个密钥都没有（验收 ②）。
 */
export function auditBackupText(text: string): string[] {
  const hits: string[] = []
  const patterns: [RegExp, string][] = [
    [/"apiKey"\s*:/i, 'apiKey 字段'],
    [/"api_key"\s*:/i, 'api_key 字段'],
    [/"authorization"\s*:/i, 'authorization 字段'],
    [/Bearer\s+[A-Za-z0-9._-]{4,}/, 'Bearer 令牌'],
    [/"api:main"|"api:sms"|"api"\s*:/, 'kv 密钥键（api:main / api:sms）'],
    [/\bsk-[A-Za-z0-9]{8,}/, 'sk- 密钥'],
  ]
  for (const [re, label] of patterns) if (re.test(text)) hits.push(label)
  return hits
}

/* ---------- 校验 / 预览 ---------- */

function summarize(file: BackupFile, bytes: number): BackupPreview {
  const dbs = BACKUP_DB_NAMES.map((name) => {
    const tables = file.idb[name] ?? {}
    const list = Object.keys(tables).map((table) => ({
      table,
      rows: Array.isArray(tables[table]) ? tables[table].length : 0,
    }))
    return { name, rows: list.reduce((n, t) => n + t.rows, 0), tables: list }
  })
  return {
    exportedAt: file.exportedAt,
    version: file.v,
    app: file.app,
    bytes,
    localKeys: Object.keys(file.local).length,
    dbs,
    totalRows: dbs.reduce((n, d) => n + d.rows, 0),
  }
}

/**
 * 解析 + 校验备份文本。**不猜**：
 * 乱码 / 非 JSON / magic 不对 / 版本过高，一律返回具体理由，绝不「先试试看」。
 */
export function parseBackupText(text: string, bytes = text.length): ParseResult {
  if (!text.trim()) return { ok: false, error: '文件是空的。' }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, error: '文件不是有效的 JSON —— 可能已损坏，或者根本不是备份文件。' }
  }
  if (!isPlainObject(raw)) return { ok: false, error: '备份文件的顶层不是对象。' }
  if (raw.magic !== BACKUP_MAGIC) {
    return {
      ok: false,
      error: `不是本终端的整份备份（magic 应为 ${BACKUP_MAGIC}，实际是 ${JSON.stringify(raw.magic ?? null)}）。`,
    }
  }
  const v = raw.v
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { ok: false, error: '备份文件缺少版本号（v），无法确定格式。' }
  }
  if (v > BACKUP_VERSION) {
    return {
      ok: false,
      error: `备份文件是 v${v}，本终端只认到 v${BACKUP_VERSION} —— 版本过新，拒绝导入（请先更新终端）。当前进度未改动。`,
    }
  }
  if (v < 1) return { ok: false, error: `备份文件版本号 v${v} 不合法。` }
  if (!isPlainObject(raw.local)) return { ok: false, error: '备份文件缺少 local（localStorage 段）。' }
  if (!isPlainObject(raw.idb)) return { ok: false, error: '备份文件缺少 idb（IndexedDB 段）。' }
  /* local 段：值必须是字符串，键必须落在本终端的 `zts-` 命名空间里。
     这一道是**写回**那侧的边界 —— restoreBackup 的 writeLocal 是逐条 setItem，
     不认前缀的话一份编造的备份就能往**同源的别人家** localStorage 里塞键
     （本机 fuzz：local 里给 {"evil-key":"x","__proto__":"PWN"}，恢复之后
     这两个键原样躺在本终端的 localStorage 里）。不认识 → 直接拒绝，不猜、不丢。 */
  for (const [k, val] of Object.entries(raw.local)) {
    if (typeof val !== 'string') return { ok: false, error: `localStorage 段里的 ${k} 不是字符串。` }
    if (!k.startsWith(LS_PREFIX)) {
      return {
        ok: false,
        error: `localStorage 段里出现了不属于本终端的键 ${JSON.stringify(k)}（只认 ${LS_PREFIX} 前缀）—— 拒绝导入，当前进度未改动。`,
      }
    }
  }
  const idb: Record<string, BackupDb> = {}
  for (const name of BACKUP_DB_NAMES) {
    const tables = raw.idb[name]
    if (tables == null) continue
    if (!isPlainObject(tables)) return { ok: false, error: `idb.${name} 不是表集合。` }
    /* 无原型对象：表名是文件里写的字符串，叫 `__proto__` 时普通对象的赋值会走
       setter 把**这张表的原型**换成那个数组 —— 于是这张表在预览里整行消失、
       Object.keys 也数不出来（本机 fuzz 复现：ownKeys 为空、原型成了 Array）。
       表名属于数据，不该改写原型。 */
    const clean: BackupDb = Object.create(null)
    for (const [table, rows] of Object.entries(tables)) {
      if (!Array.isArray(rows)) return { ok: false, error: `idb.${name}.${table} 不是数组。` }
      clean[table] = rows as BackupRow[]
    }
    idb[name] = clean
  }
  const file: BackupFile = {
    magic: BACKUP_MAGIC,
    v,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    app: isPlainObject(raw.app)
      ? {
          name: typeof raw.app.name === 'string' ? raw.app.name : APP_NAME,
          version: typeof raw.app.version === 'string' ? raw.app.version : '',
        }
      : { name: APP_NAME, version: '' },
    counts: { localKeys: Object.keys(raw.local).length, localChars: 0, idbRows: 0, byDb: {} },
    local: raw.local as Record<string, string>,
    idb,
  }
  const preview = summarize(file, bytes)
  file.counts.idbRows = preview.totalRows
  file.counts.byDb = Object.fromEntries(preview.dbs.map((d) => [d.name, d.rows]))
  return { ok: true, file, preview, name: '' }
}

/**
 * 选文件这一步的兜底时长（默认 10 分钟）。
 *
 * 为什么不是 30 秒：主人在文件管理器里翻目录、翻到一半去干别的，都是正常用法 ——
 * 太短会在他真在挑文件时把对话框之外的按钮先复位掉，反而更像 bug。
 * 探针（`scripts/smoke` 与验收脚本）可以把 `globalThis.__ztsPickTimeoutMs` 调小来验超时那一路。
 */
const PICK_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 选文件这一步的结果。
 *
 * **取消与超时都不是失败** —— 它们和「选中了、但文件是坏的」必须分开：
 * 前者什么都不该发生（按钮复位、不弹错误 toast），后者才要红字 + toast。
 */
export type PickOutcome =
  | { state: 'cancel' }
  | { state: 'timeout' }
  | { state: 'parsed'; result: ParseResult }

function pickTimeoutMs(): number {
  const hook = (globalThis as { __ztsPickTimeoutMs?: unknown }).__ztsPickTimeoutMs
  return typeof hook === 'number' && Number.isFinite(hook) && hook > 0 ? hook : PICK_TIMEOUT_MS
}

/**
 * 选文件 → 读文本 → 校验。**每一条路都会 settle**，不 reject。
 *
 * 从前只挂 `onchange`：用户一按取消、或 `input.click()` 根本没弹出（非用户手势被浏览器拒），
 * 这个 Promise 就永远悬着 → 调用方的 `finally` 不跑 → 两枚按钮永久灰在「读取中…」。
 * 现在三条路各接一把：
 *  ① `change` —— 选中文件（读失败也有 `error` / `abort` 两把）；
 *  ② `cancel` —— Chrome 113+ 在用户点取消时对同一个 input 派发（事件名就是 `cancel`）；
 *  ③ 超时 —— 老浏览器不发 `cancel`、或者对话框压根没弹出时的最后一道兜底。
 */
export function pickBackupFile(): Promise<PickOutcome> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    /** 只 settle 一次：change / cancel / 超时，谁先到谁算 */
    let done = false
    let timer = 0
    function finish(out: PickOutcome) {
      if (done) return
      done = true
      if (timer) window.clearTimeout(timer)
      input.removeEventListener('cancel', onCancel)
      input.onchange = null
      resolve(out)
    }
    function onCancel() {
      finish({ state: 'cancel' })
    }
    timer = window.setTimeout(() => finish({ state: 'timeout' }), pickTimeoutMs())
    input.addEventListener('cancel', onCancel)
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) {
        finish({ state: 'cancel' })
        return
      }
      const reader = new FileReader()
      reader.onerror = () => finish({ state: 'parsed', result: { ok: false, error: '文件读取失败（权限或被占用）。' } })
      reader.onabort = () => finish({ state: 'cancel' })
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        const r = parseBackupText(text, f.size)
        finish({ state: 'parsed', result: r.ok ? { ...r, name: f.name } : r })
      }
      reader.readAsText(f)
    }
    input.click()
  })
}

/* ---------- 恢复（带回滚） ---------- */

export interface RestoreReport {
  localKeys: number
  idbRows: number
}

/**
 * 用备份覆盖当前进度。
 * ① 先整份抓现状（含密钥，只进内存）；② 写回；③ 任何一步抛错 → 用快照还原后再抛。
 */
export async function restoreBackup(file: BackupFile): Promise<RestoreReport> {
  const before = await snapshotAll(true)
  try {
    writeLocal(file.local)
    /* 存档槽**整份换成备份里的那一份**（8 手动槽 + 自动档 + 自动档历史 + 读档前快照）。
       writeLocal 已经是整份替换，这一句把口径落到实处：两格历史在备份里没有就落成
       空数组 —— 否则「换设备恢复」之后，这一台的历史/快照还挂在面板上，
       点「读回这份」能读回**别人家**的进度（备份里那一份坏壳也一并收成空档）。 */
    adoptSlotsFileFromBackup(file.local[SLOTS_KEY] ?? null)
    for (const name of BACKUP_DB_NAMES) {
      await writeDb(name, file.idb[name] ?? {}, true)
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    let rolledBack = false
    try {
      writeLocal(before.local)
      for (const name of BACKUP_DB_NAMES) await writeDb(name, before.idb[name] ?? {}, false)
      rolledBack = true
    } catch {
      rolledBack = false
    }
    throw new Error(
      rolledBack
        ? `恢复失败：${why}。已把当前进度原样还原（未改动）。`
        : `恢复失败：${why}。并且回滚也失败了 —— 请立刻用这份备份重新导入，或手动检查浏览器存储。`,
    )
  }
  const { total } = countIdb(file.idb)
  return { localKeys: Object.keys(file.local).length, idbRows: total }
}

/** 人类可读的文件大小 */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
