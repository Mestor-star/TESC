import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * SillyTavern 网页扩展产物线 —— src/st/entry.ts → release/zts-terminal/
 *
 * 产出整目录（即「可直接放进 data/<user>/extensions/zts-terminal/ 的扩展」）：
 *   - index.js        单文件 ESM（React/图标/词条库引擎全打进，宿主不提供 React）
 *   - index.css       全部样式（字体 @font-face + CSS Modules 哈希类，经壳内 <link> 载入）
 *   - assets/*.woff2  本地字体（css url() 相对 index.css 解析）
 *   - offtext/*.txt   离线原文（public 直拷；assetBase 宿主态指向本目录）
 *
 * 关键点：base 用 './'、css 关 code-split；壳内用 import.meta.url 取 index.css/离文本。
 * 与独立态（index.html → main.tsx，站点根 /assets）互不相干。
 */
export default defineConfig({
  plugins: [react()],
  // lib 模式不自动代换 process.env.NODE_ENV（web 版走 html 注入）——显式钉成 production，
  // 否则 bundle 运行时读 process 直接 ReferenceError
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  base: './',
  build: {
    outDir: 'release/zts-terminal',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    // lib 模式默认把资产内联成 data URI，会把字体都塞进 css（数 MB）——
    // 改为外链 assets/*.woff2，css url() 相对自身解析，字体仍可离线。
    assetsInlineLimit: 0,
    lib: {
      entry: fileURLToPath(new URL('./src/st/entry.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'index',
    },
  },
})
