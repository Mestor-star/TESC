/**
 * st-manifest — 在 release/zts-terminal/ 内补齐 SillyTavern 扩展 manifest.json，
 * 并确保样式产出统一命名为 index.css（壳内 shadow <link> 按此名引用）。
 *
 * 说明：
 *  - manifest 不含 "css"：样式不进酒馆 document，全部经壳内 shadow <link> 载入，零污染。
 *  - auto_update:false：发布物 zip 直装，不触发联网更新检查。
 *
 * 顺带做两件发布物安全事：
 *  1) 把 docs/INSTALL-ST.md 拷成扩展内 INSTALL.md（随包玩家手册）。
 *  2) 密钥体检：递归扫扩展目录，若出现形如 sk-<16+ alnum> 的真实密钥串，或 .env 文件，
 *     直接失败退出——防发布物带 key 上路。
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'release', 'zts-terminal')
const installMd = join(root, 'docs', 'INSTALL-ST.md')

const CSS_NAME = 'index.css'
const MANIFEST = {
  name: 'zts-terminal',
  display_name: '终末停滞委员会 · 停滞观测终端',
  author: '终末停滞委员会',
  description: '停滞观测终端 —— 世界观/剧情卡前端：剧情推进走酒馆当前对话（用你自己的预设与世界书）。',
  version: '0.1.0',
  js: 'index.js',
  loading_order: 200,
  auto_update: false,
}

if (!existsSync(outDir)) {
  console.error(`[st-manifest] 未找到 ${outDir} —— 请先 npm run st:build`)
  process.exit(1)
}

// 样式产出可能叫 style.css（视 vite lib 版本）——统一改名成 index.css
for (const f of readdirSync(outDir)) {
  if (/^index\.css$/.test(f)) continue
  if (/^.*\.css$/.test(f) && f !== CSS_NAME) {
    renameSync(join(outDir, f), join(outDir, CSS_NAME))
    console.log(`[st-manifest] ${f} → ${CSS_NAME}`)
  }
}

writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`)
console.log(`[st-manifest] manifest.json 已写入 ${outDir}`)

if (existsSync(installMd)) {
  writeFileSync(join(outDir, 'INSTALL.md'), readFileSync(installMd))
  console.log(`[st-manifest] INSTALL.md 已拷入 ${outDir}`)
} else {
  console.warn(`[st-manifest] 未找到 ${installMd}，扩展内将无 INSTALL.md`)
}

/* —— 发布物密钥体检 —— */
const SECRET_RE = /sk-[A-Za-z0-9_-]{16,}/
const banned = []
function walk(dir) {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (/^\.env($|\.)/.test(ent)) banned.push(p)
      else walk(p)
      continue
    }
    if (/^\.env($|\.)/.test(ent)) { banned.push(p); continue }
    try {
      const text = readFileSync(p, 'utf8')
      if (SECRET_RE.test(text)) banned.push(p)
    } catch {
      /* 二进制资源（字体/图片）按文本读可能报错或乱码——乱码几乎不可能形成 sk-<16 alnum>，忽略 */
    }
  }
}
walk(outDir)
if (banned.length) {
  console.error('[st-manifest] 发现疑似密钥/敏感文件，发布物检查未通过：')
  for (const p of banned) console.error('  - ' + p)
  console.error('[st-manifest] 请清理后再打包（本卡运行时从不在仓库/产物落密钥）。')
  process.exit(1)
}
console.log('[st-manifest] 密钥体检通过：产物内无 sk- 密钥串、无 .env。')
