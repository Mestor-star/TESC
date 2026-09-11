/* ============================================================
   战斗机制定点复核 —— 跑法
   ------------------------------------------------------------
   复核的内容写在 scripts/mech/run.ts 里（那份要读源码模块，所以得由 vite 编译）。
   这里只负责把 vite 的 SSR 加载器架起来、把结果打印出来、定退出码。

     node scripts/mech.mjs
   ============================================================ */

import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

let code = 0
try {
  const mod = await server.ssrLoadModule('/scripts/mech/run.ts')
  const { pass, fail, info } = mod.run()

  for (const line of info) process.stdout.write('  --  ' + line + '\n')
  process.stdout.write(`\n通过 ${pass.length} 项：\n`)
  for (const line of pass) process.stdout.write('  ok  ' + line + '\n')
  if (fail.length) {
    process.stdout.write(`\n失败 ${fail.length} 项：\n`)
    for (const line of fail) process.stdout.write('  XX  ' + line + '\n')
    code = 1
  }
  process.stdout.write(`\n=== MECH ${code === 0 ? 'PASS' : 'FAIL'} · ${pass.length} 通过 / ${fail.length} 失败 ===\n`)
} catch (e) {
  console.error('MECH ERROR:', e && e.stack ? e.stack : String(e))
  code = 1
} finally {
  await server.close()
}
process.exit(code)
