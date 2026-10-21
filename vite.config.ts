import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/* base 缺省是站根 '/'（dev / preview / 自建主机都按站根走）。
   GitHub Pages 把站点挂在 /<仓库名>/ 底下，构建时用 `--mode pages` 覆盖 ——
   不覆盖的话产物里的 /assets/… 会指到域根去（域根没有那些文件）：
   index.html 拉得到、脚本 404，页面只剩一片空 body，看着就是「打不开」。
   运行时要取的资源（offtext / charimg）走 lib/assetbase.ts，读的就是 BASE_URL，
   所以只要这一处对上，那些也跟着一起对上。 */
const PAGES_BASE = '/TESC/'

/* 落盘工具（编辑器的原子写、各种 CLI 的「先落临时项再改名」）会在目标目录里
   先造一个 `.名字.<pid>.<随机>.tmpdir/` 或者 `xxx.tmp`，再原子替换。
   Vite 的 watcher 默认把项目根整个递归盯上，会伸手去 watch 那个临时项 ——
   而它往往正好**正被锁着**（替换还没走完就轮到 watcher 了），Windows 上
   node 的 fs.watch 直接抛 EBUSY；这个错误挂在 watcher 的 'error' 事件上没人接，
   **整个 dev server 当场退出**（2026-10-14 撞过一次：改 scripts/ 下的文件把
   5174 打没了）。临时项不是源码，改了也不需要重建 —— 一律挡在 watch 之外。
   注意 chokidar 4 已经不认 glob 字符串了，这里必须给正则。 */
const WATCH_GUARD = [
  /(?:^|[\\/])\.[^\\/]*\.tmpdir(?:[\\/]|$)/,
  /\.tmp$/,
]

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? PAGES_BASE : '/',
  server: {
    watch: { ignored: WATCH_GUARD },
  },
}))
