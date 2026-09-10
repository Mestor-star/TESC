/* ============================================================
   战斗力平衡复核 —— 跑法
   ------------------------------------------------------------
   引擎是 TypeScript，Node 直接读不了（项目里的 import 不带扩展名）。
   所以借 vite 自己的 SSR 加载器现场编译这一个入口：
   不落任何构建产物，跑完就关，跟 `npm run dev` 读的是同一份源码。

     node scripts/balance.mjs            # 默认三档时期各 60 轮
     RUNS=200 node scripts/balance.mjs   # 加量
   ============================================================ */

import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const RUNS = Number(process.env.RUNS ?? 60)
/** 三个取样时期：开局 / 中盘 / 卷末 */
const STAGES = [
  { progress: 0.15, label: '开局（第一卷前段）' },
  { progress: 0.5, label: '中盘（第二卷前后）' },
  { progress: 0.9, label: '卷末（第四卷前后）' },
]

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

let code = 0
try {
  const mod = await server.ssrLoadModule('/scripts/balance/run.ts')
  const chunks = []
  for (const st of STAGES) {
    const rep = mod.run({ runs: RUNS, seedBase: 1, progress: st.progress })
    chunks.push(`\n【${st.label}】` + mod.report(rep, st.progress))
    if (rep.flags.length) code = 0
  }
  const text = chunks.join('\n')
  writeFileSync('scripts/balance/report.txt', text, 'utf8')
  process.stdout.write(text)
} catch (e) {
  console.error('BALANCE ERROR:', e && e.stack ? e.stack : String(e))
  code = 1
} finally {
  await server.close()
}
process.exit(code)
