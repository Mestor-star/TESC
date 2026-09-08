/**
 * zip-st — 把 release/zts-terminal/ 打成发布 zip（供 GitHub release / 分享）。
 * 用系统 PowerShell 的 Compress-Archive（Windows 11 自带）——比裸 tar 跨环境稳。
 * 不含任何密钥（st-manifest 在打包前已做密钥体检）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'release')
const dir = join(dist, 'zts-terminal')
const zip = join(dist, 'zts-terminal.zip')

if (!existsSync(dir)) {
  console.error(`[zip-st] 未找到 ${dir} —— 请先 npm run st:dist`)
  process.exit(1)
}
if (existsSync(zip)) rmSync(zip, { force: true })

// Compress-Archive 压缩目录本身会带一层 zts-terminal/ 前缀，正好是「解压进 extensions/」的形态。
execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -Path '${dir}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force`], {
  stdio: 'inherit',
})
console.log(`[zip-st] 已打包 → ${zip}`)

// 复核 zip 内容清单（用 .NET ZipFile 只读列出，避免依赖 unzip）
const listPs = [
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  `$z=[IO.Compression.ZipFile]::OpenRead('${zip}')`,
  "$z.Entries | ForEach-Object { $_.FullName }",
  "$z.Dispose()",
].join('; ')
try {
  const listing = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', listPs], { encoding: 'utf8' })
  const names = listing.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const n = names.length
  const hasManifest = names.some((s) => /manifest\.json$/.test(s))
  const hasInstall = names.some((s) => /INSTALL\.md$/.test(s))
  const offText = names.filter((s) => /offtext[\\/].*\.txt$/i.test(s)).length
  console.log(`[zip-st] 复核：${n} 个文件 · manifest=${hasManifest} · INSTALL.md=${hasInstall} · offtext 原文=${offText}`)
  if (!hasManifest || !hasInstall || offText === 0) {
    console.error('[zip-st] 复核异常：zip 缺少 manifest.json / INSTALL.md / offtext 原文')
    process.exit(1)
  }
} catch (e) {
  console.warn('[zip-st] zip 清单复核失败（不影响产物）：' + e.message)
}
