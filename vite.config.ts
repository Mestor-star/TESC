import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/* base 缺省是站根 '/'（dev / preview / 自建主机都按站根走）。
   GitHub Pages 把站点挂在 /<仓库名>/ 底下，构建时用 `--mode pages` 覆盖 ——
   不覆盖的话产物里的 /assets/… 会指到域根去（域根没有那些文件）：
   index.html 拉得到、脚本 404，页面只剩一片空 body，看着就是「打不开」。
   运行时要取的资源（offtext / charimg）走 lib/assetbase.ts，读的就是 BASE_URL，
   所以只要这一处对上，那些也跟着一起对上。 */
const PAGES_BASE = '/TESC/'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? PAGES_BASE : '/',
}))
