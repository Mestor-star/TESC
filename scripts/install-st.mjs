/**
 * install-st — 把 release/zts-terminal/（整目录扩展）拷进本机 SillyTavern 扩展目录。
 *
 * 目标默认 C:\ai\SillyTavern\data\default-user\extensions\zts-terminal\
 * 可用环境变量 ST_DIR 覆盖 data 目录，如 ST_DIR="C:/ai/SillyTavern/data/default-user"。
 *
 * 不碰酒馆其它数据；扩展「启用」= 目录 + manifest（ST 自动发现，无需点开关）。
 * 复制后需刷新酒馆页面才会加载。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'release', 'zts-terminal')
const ST_DATA = process.env.ST_DIR ?? 'C:/ai/SillyTavern/data/default-user'
const dest = join(ST_DATA, 'extensions', 'zts-terminal')

if (!existsSync(src)) {
  console.error(`[install-st] 未找到 ${src} —— 请先 npm run st:dist`)
  process.exit(1)
}
if (!existsSync(ST_DATA)) {
  console.error(`[install-st] 找不到酒馆数据目录：${ST_DATA}\n[install-st] 请用 ST_DIR 指定，例如 ST_DIR="C:/ai/SillyTavern/data/default-user"。`)
  process.exit(1)
}
// 新装扩展：目录不存在时自动创建（含父级 extensions/）
mkdirSync(dest, { recursive: true })

cpSync(src, dest, { recursive: true })
console.log(`[install-st] 已复制 ${src} → ${dest}`)
console.log('[install-st] 刷新酒馆页面后生效；到扩展管理里确认「zts-terminal」已启用。')
