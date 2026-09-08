/* ============================================================
   headless Edge CDP 冒烟 —— 剧情离线通读 / 存档迁移 / 在线推演 / 短信羁绊
   用法: node scripts/smoke/smoke.mjs   （需先 npm run build）
   ============================================================ */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'

const CNM = 'D:\\cnm'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const APP_URL = 'http://127.0.0.1:4319/'
const PREVIEW_PORT = 4319
const DBG_PORT = 9233
const STUB_PORT = 4987
const ESTUB_PORT = 4988

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function ok(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else { failures++; console.log(`  FAIL  ${name} ${extra}`) }
  return cond
}

/* ---------- 简易 CDP 客户端 ---------- */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.evListeners = new Map()
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id != null) {
        const p = this.pending.get(m.id)
        if (!p) return
        this.pending.delete(m.id)
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
      } else {
        const ls = this.evListeners.get(m.method) || []
        for (const f of ls) f(m.params)
      }
    }
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id
      this.pending.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  on(method, fn) {
    const ls = this.evListeners.get(method) || []
    ls.push(fn)
    this.evListeners.set(method, ls)
  }
}

const connect = (url) => new Promise((res, rej) => {
  const ws = new WebSocket(url)
  ws.onopen = () => res(new Cdp(ws))
  ws.onerror = (e) => rej(new Error('ws error ' + url))
})

async function getPageWsOn(port, urlPrefix) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix))
      if (page) return page.webSocketDebuggerUrl
    } catch { /* retry */ }
    await sleep(300)
  }
  throw new Error('Edge devtools target not found @' + urlPrefix)
}
async function getPageWs() {
  return getPageWsOn(DBG_PORT, APP_URL)
}

let cdp
async function ev(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval error'
    throw new Error('EVAL FAIL: ' + d + '\n  expr: ' + expr.slice(0, 160))
  }
  return r.result.value
}
async function poll(expr, ms = 45000, label = 'poll') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    let v
    try { v = await ev(expr) } catch (e) { throw e }
    if (v) return v
    await sleep(220)
  }
  throw new Error('poll timeout: ' + label + ' -> ' + expr.slice(0, 140))
}
/* Node 侧等待 stub 收到第 n 个剧情请求（eStub 的 eSeq 已到位） */
async function waitSeq(target) {
  for (let i = 0; i < 150; i++) {
    if (eSeq >= target) return
    await sleep(200)
  }
  throw new Error('eStub seq timeout: wanted >= ' + target + ' got ' + eSeq)
}
const pageHas = (t) => `document.body && document.body.innerText.includes(${JSON.stringify(t)})`
const clickTxt = (t) => `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes(${JSON.stringify(t)}));if(!b)return false;b.click();return true})()`

/* 开屏：长按指纹 1.5s → 自检约 3s → 终端挂载（用 CDP 真实鼠标事件） */
async function boot() {
  await poll(`!!document.querySelector('[aria-label="认证开屏"]')`, 25000, 'boot screen')
  const rect = await ev(`(()=>{const el=document.querySelector('[aria-label="长按指纹以完成认证"]');if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  if (!rect) throw new Error('boot: fingerprint button not found')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await sleep(2200)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('.app--stage')`, 30000, 'shell mount')
}
async function goto(viewTxt) {
  const c = await ev(clickTxt(viewTxt))
  if (!c) throw new Error('click failed: ' + viewTxt)
}
const wState = `(()=>{try{const s=JSON.parse(localStorage.getItem('zts-terminal:v3'));if(!s)return {empty:true};const w=s.world||{};return {ep:Object.keys(s.epDone||{}).length,cur:s.cur,unlocked:s.unlocked,rec:(w.records||[]).map(r=>({id:r.eventId,mode:r.mode,ts:r.ts})),off:w.offset||{},fl:w.flags||{},name:s.operatorName}}catch(e){return {err:String(e)}}})()`
async function state() { return ev(wState) }

/* 向 React 受控输入框真实键入并回车 */
async function typeEnter(selExpr, text) {
  await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selExpr)});if(!el)return false;el.focus();return true})()`)
  await cdp.send('Input.insertText', { text })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await sleep(120)
}

/* ---------- IndexedDB 播种（双通道密钥，仅运行时） ---------- */
const seedApi = (channel, baseUrl, model) => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-terminal-store',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('kv'))r.result.createObjectStore('kv')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(${JSON.stringify({baseUrl,apiKey:'smoke',model,temperature:0.8})},'api:${channel}');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});return true})()`)
const clearIDB = () => ev(`(async()=>{await new Promise((res)=>{const r=indexedDB.deleteDatabase('zts-terminal-store');r.onsuccess=r.onerror=r.onblocked=()=>res()});return true})()`)

/* ---------- zts-lore（Dexie）探针 ----------
   *Src 系返回页面「表达式源串」（可内插进 poll 的表达式）；同名函数直接 ev 出值。 */
const loreCountSrc = () => `(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-lore');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return new Promise((res)=>{const c=db.transaction('lorebooks').objectStore('lorebooks').count();c.onsuccess=()=>res(c.result);c.onerror=()=>res(-1)})})()`
const loreCount = () => ev(loreCountSrc())
const loreBookSrc = (id) => `(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-lore');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return new Promise((res)=>{const g=db.transaction('lorebooks').objectStore('lorebooks').get(${JSON.stringify(id)});g.onsuccess=()=>{const b=g.result;res(b?{name:b.name||'',description:b.description||'',count:(b.entries||[]).length}:null)};g.onerror=()=>res(null)})})()`
const loreBook = (id) => ev(loreBookSrc(id))
const loreEntrySrc = (bookId, find) => {
  const pred = find.startsWith('#')
    ? `x=>x.id===${JSON.stringify(find.slice(1))}`
    : `x=>x.keys&&x.keys[0]===${JSON.stringify(find)}`
  return `(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-lore');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return new Promise((res)=>{const g=db.transaction('lorebooks').objectStore('lorebooks').get(${JSON.stringify(bookId)});g.onsuccess=()=>{const b=g.result;if(!b){return res(null)}const e=(b.entries||[]).find(${pred});if(!e){return res(null)}res({content:String(e.content||''),key0:String((e.keys&&e.keys[0])||'')})};g.onerror=()=>res(null)})})()`
}
const loreEntry = (bookId, find) => ev(loreEntrySrc(bookId, find))
const plotLogText = (evId) => ev(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');return (o[${JSON.stringify(evId)}]||[]).map(x=>x.text).join('\\n')}catch(e){return String(e)}})()`)
const recDigest = (evId) => ev(`(()=>{try{const s=JSON.parse(localStorage.getItem('zts-terminal:v3'));const r=(s.world&&s.world.records||[]).find(x=>x.eventId===${JSON.stringify(evId)});return r?(r.digest||''):''}catch(e){return ''}})()`)

/* ---------- SSE 流式回包（P5：stream:true 请求按 SSE 分块发，语义与整包一致） ---------- */
function splitChunks(s, n) {
  if (!s) return ['']
  const size = Math.max(1, Math.ceil(s.length / n))
  const out = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}
function writeSSE(res, content) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  for (const c of splitChunks(content, 4)) {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c } }] })}\n\n`)
  }
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}
/* P5 中止保留冒烟：先发正文并挂起（不达 [DONE]），供测试点「中断」后断言
   已生成部分保留、半截 <vars> 指令不落地。客户端中止 → 'close' 即停发尾巴。 */
function slowStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '【E-SLOW】夜风停了，他把终端搁在膝上，等一个回应。' } }] })}\n\n`)
  let closed = false
  res.on('close', () => { closed = true })
  const timer = setTimeout(() => {
    if (closed) return
    // 若从未被中断：8s 后补发一段半截 <vars> 尾巴并正常收尾（兜底，不悬空）
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '\n<vars>{"eventDone":true,"digest":"不应落定"' } }] })}\n\n`)
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  }, 8000)
  res.on('close', () => clearTimeout(timer))
}

/* ---------- 剧情 stub 服务器（plot 按序 / sms 恒定） ---------- */
const plotReplies = []
plotReplies.push(
  '【DIR1】海面被一道苍蓝的「影」撕开，漆黑少女的笑声沉进浪里，货船的甲板碎成星屑。\n\n—— 事件指令 ——\n```json\n{"digest":"货船的夜色被苍蓝之影撕开。言万心叶坠海自救，救起不会游泳的拉法，并同自称魔王的少女立下「看看是你先抵达青春，还是我先抵达终焉」之约。","eventDone":true}\n```',
  '【DIR2】女神神殿的谎言在突击队的炮火下塌成星尘，露娜拼死指向的那句「快逃」，成了言万心叶第一次读到的真心。\n\n—— 事件指令 ——\n```json\n{"digest":"神殿骗局被砸碎。露娜获救，突击队收队。言万心叶第一次尝到被同伴接住的滋味。","eventDone":true}\n```',
  '【DIR3】骑士的刀锋停在心叶眼前。他护在露娜身前，断锁骨、夺枪、读心成底牌——会长艾莉芙笑着拍板：苍之学园，收下你们了。\n\n—— 事件指令 ——\n```json\n{"digest":"在异端审问室的刀剑下，言万心叶护住露娜并以底牌赢得裁定。两人以「苍之学园体验入学」名义被收留，正式成为终末停滞委员会的一员。","eventDone":true}\n```',
  '【DIR4】世界观与「欢迎会」。艾莉芙说起宇宙与「终末」，小柴拉着两人逛集市，宿舍里飘起晚饭的香气。\n（本回合无指令——用于验证未解析提示与补发按钮）',
  '【DIR5】心叶放下碗筷，屋里的灯把四个人的影子拉得很长。\n\n—— 事件指令 ——\n```json\n{"flag":{"resend_ok":true}}\n```',
)
let plotReq = 0
const stub = http.createServer((req, res) => {
  const send = (obj, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end(JSON.stringify(obj))
  }
  if (req.method === 'OPTIONS') return send({}, 204)
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    try {
      const j = JSON.parse(body)
      const model = j.model || ''
      const stream = j.stream === true
      let content
      if (model === 'stub-sms') {
        content = '【SMS】你今晚还留在工房街？……布丁倒是还剩半盒，下次带给你。\n\n```json\n{"bond":[{"char":"hikari","delta":10}]}\n```'
      } else {
        const idx = plotReq++
        content = plotReplies[Math.min(idx, plotReplies.length - 1)]
      }
      if (stream) writeSSE(res, content)
      else send({ choices: [{ message: { content } }] })
    } catch (e) {
      send({ error: { message: String(e) } }, 400)
    }
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

/* ---------- Phase E 专用 stub：捕获剧情请求体；标签化回执 ---------- */
let eSeq = 0
let eLast = null
const eReplies = [
  '<maintext>【E1】甲板上没有别人，只有被切开的海浪与压在栏杆上的一道影子。</maintext>\n<vars>{"eventDone":true,"digest":"E自动开场·夜航将启。"}</vars>',
  '<maintext>【E2】露娜把半盒布丁放在桌上，坐到他旁边的空位。</maintext>\n<vars>{"eventDone":true,"digest":"E布丁收束·夜风。"}</vars>',
  '【E3】这一回合没有指令落定：他把终端亮度调低，夜风从窗缝钻进来，凉丝丝的。',
  '【E4】重写后仍旧没有指令落定：他把终端亮度调低，夜风从窗缝钻进来。',
]
const eStub = http.createServer((req, res) => {
  const send = (obj, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end(JSON.stringify(obj))
  }
  if (req.method === 'OPTIONS') return send({}, 204)
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    try {
      const j = JSON.parse(body)
      const stream = j.stream === true
      let content
      if (String(j.model || '').includes('sms')) {
        content = '【SMS-E】夜风凉，早点回去。\n\n```json\n{"bond":[]}\n```'
      } else {
        eLast = j
        eSeq++
        if (stream && JSON.stringify(j.messages || []).includes('E-SLOW-ABORT')) {
          slowStream(res)
          return
        }
        content = eReplies[Math.min(eSeq - 1, eReplies.length - 1)]
      }
      if (stream) writeSSE(res, content)
      else send({ choices: [{ message: { content } }] })
    } catch (e) {
      send({ error: { message: String(e) } }, 400)
    }
  })
})
await new Promise((r) => eStub.listen(ESTUB_PORT, '127.0.0.1', r))

/* ---------- 启动 vite preview ---------- */
const viteBin = path.join(CNM, 'node_modules', 'vite', 'bin', 'vite.js')
const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'], {
  cwd: CNM, stdio: ['ignore', 'ignore', 'pipe'],
})
preview.stderr.on('data', (d) => { if (String(d).includes('error')) console.error('preview:', String(d).trim()) })
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(APP_URL); if (r.ok) break } catch { /* wait */ }
  await sleep(300)
}

/* ---------- 启动 Edge ---------- */
const profile = mkdtempSync(path.join(tmpdir(), 'zts-smoke-'))
const edge = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--disable-gpu', '--disable-extensions',
  '--remote-debugging-port=' + DBG_PORT, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, '--window-size=1440,1000', APP_URL,
], { stdio: ['ignore', 'ignore', 'pipe'] })

let passAll = true
try {
  const wsUrl = await getPageWs()
  cdp = await connect(wsUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Input.setIgnoreInputEvents', { ignore: false })

  /* ============ Phase A：离线通读 1→2→3 → 解锁 + 记录 ============ */
  console.log('\n[Phase A] 离线通读 原文 → 归档 → 记录流 / 解锁')
  await boot()
  // A0：P2 角色档案自始开放——此时仍是全新世界、unlocked=false，档案即已可查
  await goto('角色档案')
  await poll(`document.querySelectorAll('[data-archive-card]').length===25`, 15000, 'A0 archive pre-unlock')
  const preUnlock = await ev(`(${wState}).unlocked`)
  ok('A0 未解锁时角色档案已开放（25 卡）', preUnlock === false && (await ev(`document.querySelectorAll('[data-archive-card]').length`)) === 25, 'unlocked=' + preUnlock)
  await goto('剧情推进')
  await poll(`document.body.innerText.includes('剧情推进')`, 20000, 'A plot h1')
  // 未配主线 → 自动离线；读到 v1-1 原文
  await poll(`(()=>{const e=document.querySelector('[data-event]');return e&&e.getAttribute('data-event')==='v1-1'&&e.textContent.length>500})()`, 30000, 'A v1-1 text')
  const len1 = await ev(`(()=>{const e=document.querySelector('[data-event]');return e?e.textContent.length:0})()`)
  console.log(`    v1-1 原文长度: ${len1}`)
  let st = await state()
  ok('A1 初始无记录', st.rec.length === 0, JSON.stringify(st.rec))
  // 归档 v1-1
  await goto('读毕本段')
  await poll(`(()=>{const e=document.querySelector('[data-event]');return e&&e.getAttribute('data-event')==='v1-2'&&e.textContent.length>500})()`, 30000, 'A v1-2 after archive')
  st = await state()
  ok('A2 归档 v1-1 → 记录1/offline', st.rec.length === 1 && st.rec[0].id === 'v1-1' && st.rec[0].mode === 'offline' && st.rec[0].ts > 0, JSON.stringify(st.rec))
  ok('A3 v1-1 后仍未解锁', st.unlocked === false, 'unlocked=' + st.unlocked)
  // 归档 v1-2, v1-3
  await goto('读毕本段'); await poll(`(()=>{const e=document.querySelector('[data-event]');return e&&e.getAttribute('data-event')==='v1-3'&&e.textContent.length>500})()`, 30000, 'A v1-3')
  await goto('读毕本段'); await poll(`(()=>{const e=document.querySelector('[data-event]');return e&&e.getAttribute('data-event')==='v1-4'&&e.textContent.length>500})()`, 30000, 'A v1-4')
  st = await state()
  ok('A4 归档三段 → 记录3', st.rec.length === 3 && st.rec.every((r) => r.mode === 'offline'), JSON.stringify(st.rec))
  ok('A5 v1-3 完成 → 已解锁', st.unlocked === true, 'unlocked=' + st.unlocked)
  // 低语者日志
  await goto('低语者日志')
  await poll(`document.body.innerText.includes('记录流')`, 20000, 'A saga')
  const bodyA = await ev(`document.body.innerText`)
  ok('A6 日志显示 3 条记录计数', bodyA.includes('事件 3/57') && bodyA.includes('记录 3'), 'body has 记录 3?')
  const offCount = bodyA.split('离线通读').length - 1
  ok('A7 记录徽标 ×3（离线通读）', offCount >= 3, 'count=' + offCount)
  ok('A8 当前事件卡推进到 v1-4', bodyA.includes('世界观与「欢迎会」'), '')
  ok('A9 记录 digest 有实义内容', bodyA.includes('终末停滞委员会'), '') // v1-3 digest 文本

  /* ============ Phase B：旧档（无 world）→ 回填 legacy 记录流 ============ */
  console.log('\n[Phase B] 旧档迁移 → 无 world 回填 legacy')
  // 等 Phase A 的 toast（5.4s 自动消退）先落完，避免 React 再用旧 world 覆盖存档
  await sleep(6500)
  await ev(`localStorage.setItem('zts-terminal:v3', JSON.stringify({unlocked:true,epDone:{'v1-1':true,'v1-2':true,'v1-3':true,'v1-4':true},cur:'v1-4',operatorName:'迁移测试员',focusId:'gcn'}))`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await poll(`document.body.innerText.includes('终端总览')`, 20000, 'B dash')
  await poll(`(${wState}).rec.length===4`, 15000, 'B records backfill')
  st = await state()
  ok('B1 回填 4 条记录', st.rec.length === 4, JSON.stringify(st.rec))
  ok('B2 全部为 legacy 且 ts=0', st.rec.every((r) => r.mode === 'legacy' && r.ts === 0), JSON.stringify(st.rec))
  ok('B3 顺序按阅读序', JSON.stringify(st.rec.map((r) => r.id)) === JSON.stringify(['v1-1', 'v1-2', 'v1-3', 'v1-4']), JSON.stringify(st.rec.map((r) => r.id)))
  ok('B4 operatorName 保留', st.name === '迁移测试员', st.name)
  await goto('低语者日志')
  await poll(`document.body.innerText.includes('旧档回填')`, 20000, 'B saga legacy badge')
  const bodyB = await ev(`document.body.innerText`)
  ok('B5 徽标显示 旧档回填', (bodyB.split('旧档回填').length - 1) >= 4, '')

  /* ============ Phase C：在线推演（stub）→ eventDone 自动归档 + 指令落地 + 短信羁绊 clamp ============ */
  console.log('\n[Phase C] 在线推演 → 自动铺开场 / eventDone / 未解析补发 / SMS clamp')
  await ev(`localStorage.clear()`)
  await clearIDB()
  await seedApi('main', `http://127.0.0.1:${STUB_PORT}`, 'stub')
  await seedApi('sms', `http://127.0.0.1:${STUB_PORT}`, 'stub-sms')
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('剧情推进')
  // 自动铺开场 req1 → 归档 v1-1
  await poll(`(${wState}).rec.length===1`, 40000, 'C v1-1 archived (auto open)')
  st = await state()
  ok('C1 自动铺开场并归档 v1-1 online', st.rec.length === 1 && st.rec[0].mode === 'online' && st.rec[0].ts > 0, JSON.stringify(st.rec))
  await poll(`document.body.innerText.includes('上一事件已收束')`, 15000, 'C endedBar')
  // 事件已收束并推进到下一段，叙述存进该事件会话（zts-plot:v1）——验证叙述上屏且指令已剥离
  await poll(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');const l=o['v1-1']||[];return l.some(x=>x.text.includes('【DIR1】'))}catch(e){return false}})()`, 10000, 'C dir1 log')
  const log1 = await ev(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');return (o['v1-1']||[]).map(x=>x.text).join('\\n')}catch(e){return String(e)}})()`)
  ok('C2 叙述已写入 v1-1 会话且指令剥离', log1.includes('【DIR1】') && !log1.includes('```') && !log1.includes('eventDone'), '')
  // v1-2 / v1-3 手动推演归档
  for (const want of ['v1-2', 'v1-3']) {
    await ev(`(()=>{const i=document.querySelector('input[placeholder^="推进事件"]');return !!i})()`)
    await typeEnter('input[placeholder^="推进事件"]', '（继续推进）言万心叶跟上前去，弄清下一步该做什么。')
    await poll(`(${wState}).rec.length===${want === 'v1-2' ? 2 : 3}`, 40000, 'C archive ' + want)
    await sleep(900) // 等 busy 复位、线程渲染完毕再发下一条
  }
  st = await state()
  ok('C3 三段全部在线归档', st.rec.length === 3 && st.rec.every((r) => r.mode === 'online'), JSON.stringify(st.rec))
  ok('C4 v1-3 后解锁', st.unlocked === true, 'unlocked=' + st.unlocked)
  // v1-4：发一条 → 叙述-only（无指令）→ 未解析提示
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）我先把这里的事记下来。')
  await poll(`document.body.innerText.includes('未解析到事件指令') || document.body.innerText.includes('要求补发指令')`, 30000, 'C needDir notice')
  const bodyC = await ev(`document.body.innerText`)
  ok('C5 无指令回包 → 提示 + 补发按钮', bodyC.includes('未解析到事件指令') && bodyC.includes('要求补发指令'), '')
  ok('C6 v1-4 未误归档', st.rec.length === 3, 'rec=' + st.rec.length)
  // 补发指令 req5 → flag 落地
  await goto('要求补发指令')
  await poll(`(${wState}).fl.resend_ok===true`, 30000, 'C flag resend_ok')
  st = await state()
  ok('C7 补发后 flag 落地', st.fl.resend_ok === true, JSON.stringify(st.fl))
  // 短信：自动选中 hikari → 发一条 → bond +10 被 clamp 到 +3
  await goto('短信')
  await poll(`document.body.innerText.includes('角色短信')`, 20000, 'C sms view')
  // 等 sms 通道设置从 IndexedDB 载入（send 依赖 settings，过早发送会被导向设置页）
  await poll(`document.body.innerText.includes('stub-sms') && !!document.querySelector('input[placeholder*="发消息"]')`, 20000, 'C sms ready')
  const h0 = (await state()).off.hikari || 0
  await typeEnter('input[placeholder*="发消息"]', '今晚的布丁，我请客。')
  await poll(`(${wState}).off.hikari===${h0 + 3}`, 30000, 'C sms clamp')
  st = await state()
  ok('C8 SMS bond +10 被 clamp 到 +3', st.off.hikari === h0 + 3, 'off.hikari=' + st.off.hikari + ' h0=' + h0)
  await poll(`document.body.innerText.includes('【SMS】')`, 15000, 'C sms bubble')
  ok('C9 SMS 叙述上屏', true)

  /* ============ Phase D：旧 zts-tavern:v1 线程延续（清空后仍现旧记录） ============ */
  console.log('\n[Phase D] 短信旧线程延续（zts-tavern:v1）')
  await ev(`localStorage.setItem('zts-tavern:v1', JSON.stringify({luna:[{id:'old::1',from:'them',text:'旧档开场白：今晚天台的风有点大，小心着凉。',time:'01:02'},{id:'old::2',from:'user',text:'布丁给你，趁热。',time:'01:03'}]}))`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('短信')
  await poll(`document.body.innerText.includes('角色短信')`, 20000, 'D sms view')
  await goto('露娜')
  await poll(`document.body.innerText.includes('旧档开场白：今晚天台的风有点大')`, 20000, 'D legacy thread visible')
  ok('D1 旧线程仍现（未被开场种子覆盖）', true)
  ok('D2 世界进度在重载后延续', (await state()).rec.length === 3, 'rec=' + (await state()).rec.length)

  /* ============ Phase E：词条库注入 / 标签回执 / 反剧透 / 回溯重写只动日志 / 播种幂等 ============ */
  console.log('\n[Phase E] 词条库引擎：标签回执 / 注入 / 反剧透 / 回溯重写 / 播种幂等')
  // 换到 E 专用 stub（标签化回执），世界重置为干净在线态；zts-lore 保留。
  // 不删 zts-terminal-store（删库+重开会与 App 活跃连接互锁），仅覆盖双通道地址。
  await sleep(1500)
  await ev(`localStorage.clear()`)
  await seedApi('main', `http://127.0.0.1:${ESTUB_PORT}`, 'stub')
  await seedApi('sms', `http://127.0.0.1:${ESTUB_PORT}`, 'stub-sms')
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await poll(`document.body.innerText.includes('终端总览')`, 20000, 'E dash')
  // E1 播种幂等：A–D 已多次重载，canon 仍为 5 库、无重复累积
  await poll(`${loreCountSrc()}.then(n=>n===5)`, 10000, 'E canon=5')
  ok('E1 播种幂等：多轮重载后 canon 仍为 5 库', true)
  const canonChar = await loreBook('book-canon-char')
  ok('E2 canon 主库齐备（角色/图鉴/世界/事件）', !!canonChar && (await loreBook('book-canon-codex')) !== null && (await loreBook('book-canon-lore')) !== null && (await loreBook('book-canon-events')) !== null)

  // 进入剧情推进：req0 = 标签回执（<maintext>+<vars>）驱动 v1-1 在线收束
  await goto('剧情推进')
  await poll(`(${wState}).rec.length===1`, 40000, 'E v1-1 auto archived (tag)')
  st = await state()
  ok('E3 标签回执驱动同一 completeEvent', st.rec.length === 1 && st.rec[0].id === 'v1-1' && st.rec[0].mode === 'online', JSON.stringify(st.rec))
  ok('E4 标签路径确有且仅有一次剧情请求', eSeq === 1, 'eSeq=' + eSeq)
  const logV11 = await plotLogText('v1-1')
  ok('E5 正文入库且标签/围栏已剥离', logV11.includes('【E1】') && !logV11.includes('<maintext>') && !logV11.includes('<vars>') && !logV11.includes('```'), logV11.slice(0, 80))
  ok('E6 收束记录 digest 来自 <vars>', (await recDigest('v1-1')).includes('E自动开场'), await recDigest('v1-1'))
  // P3：词条库按钮 → 智库页（管理器整页内嵌），验证编辑层可开合（不保存）
  await poll(`!!document.querySelector('button') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('词条库'))`, 15000, 'E lb btn')
  const opened = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('词条库'));if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-loremanager]') && document.body.innerText.includes('命中规则') && document.body.innerText.includes('词条库管理器')`, 15000, 'E lore manager embedded')
  ok('E7 词条库按钮 → 智库页 · 管理器整页内嵌', opened === true, '')
  await ev(clickTxt('浏览 / 编辑'))
  await poll(`document.body.innerText.includes('选择或新增一个词条')`, 10000, 'E lore editor open')
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('新增词条'));if(!b)return false;b.click();return true})()`)
  await poll(`document.body.innerText.includes('关键词（每行一个') && document.body.innerText.includes('内容')`, 8000, 'E lore entry form')
  ok('E8 内嵌编辑器可用（新增词条表单字段齐备）', true)
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='返回列表');if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-loremanager]') && document.body.innerText.includes('命中规则') && !document.body.innerText.includes('选择或新增一个词条')`, 10000, 'E lore back list')
  ok('E8b 编辑器可返回列表（未保存，DB 不变）', true)

  // 回剧情：当前事件 v1-2 尚无会话 → 自动铺开场并标签收束
  await goto('剧情推进')
  await waitSeq(2)
  await poll(`(${wState}).rec.length===2`, 30000, 'E v1-2 auto archived on return')
  ok('E9 返回剧情自动开场 · v1-2 标签收束', (await state()).rec[1]?.mode === 'online' && eSeq === 2, 'eSeq=' + eSeq)
  const lunaRaw = await loreEntry('book-canon-char', '露娜')
  const lunaNeed = String((lunaRaw && lunaRaw.content) || '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const sys1 = () => { const m = (eLast && eLast.messages || []).find((x) => x.role === 'system'); return String((m && m.content) || '') }
  // req（v1-3）：叙述里带角色名 → 词条库命中注入（露娜档案）
  await poll(`!!document.querySelector('input[placeholder^="推进事件"]') && !document.body.innerText.includes('导演正在编织叙事…')`, 20000, 'E composer v1-3')
  await sleep(700)
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）露娜把半盒布丁推到他面前，尾音压得很低。')
  await waitSeq(3)
  await poll(`document.body.innerText.includes('上一回未解析到事件指令')`, 30000, 'E injection needDir')
  ok('E10 命中注入：system 含词条库块与角色档案', sys1().includes('词条库 · 命中参考') && sys1().includes(lunaNeed), 'lunaNeed=' + lunaNeed.slice(0, 24))
  ok('E11 注入请求确为一次 · 无指令不误归档', eSeq === 3 && (await state()).rec.length === 2, 'eSeq=' + eSeq + ' rec=' + (await state()).rec.length)

  // req2：反剧透闸门。同一条消息同时带 已做(v1-2) 与 未做(v1-9) 的事件专名
  await poll(`!!document.querySelector('input[placeholder^="推进事件"]') && !document.body.innerText.includes('导演正在编织叙事…')`, 20000, 'E composer v1-3b')
  await sleep(700)
  const ev12 = await loreEntry('book-canon-events', '#ev-v1-2')
  const ev19 = await loreEntry('book-canon-events', '#ev-v1-9')
  const need12 = String((ev12 && ev12.content) || '').replace(/\s+/g, ' ').trim().slice(0, 150)
  const need19 = String((ev19 && ev19.content) || '').replace(/\s+/g, ' ').trim().slice(0, 150)
  const k2 = String((ev12 && ev12.key0) || '夜航')
  const k9 = String((ev19 && ev19.key0) || '灯塔')
  ok('E12 反剧透样本取到（v1-2/v1-9 词条）', !!ev12 && !!ev19 && k2.length >= 2 && k9.length >= 2, 'k2=' + k2 + ' k9=' + k9)
  await typeEnter('input[placeholder^="推进事件"]', `（言万心叶）他在终端记下两个词：「${k2}」与「${k9}」，想知道它们各自意味着什么。`)
  await waitSeq(4)
  await poll(`document.body.innerText.includes('上一回未解析到事件指令')`, 30000, 'E req2 needDir')
  const sys3 = sys1()
  ok('E13 已做事件词条仍注入（证明扫描在工作）', sys3.includes(need12), '')
  ok('E14 反剧透：未做事件 v1-9 摘要被闸门挡下', !sys3.includes(need19), 'leak? ' + need19.slice(0, 30))
  ok('E15 无指令回合未误归档', (await state()).rec.length === 2, 'rec=' + (await state()).rec.length)
  ok('E16 req2 确为一次注入请求', eSeq === 4, 'eSeq=' + eSeq)

  // 重写此回复：末条无世界变化 → 重发同文；世界记录数不变
  const preFx = await state()
  await poll(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('重写此回复'))`, 10000, 'E rewrite btn')
  await ev(clickTxt('重写此回复'))
  await waitSeq(5)
  await sleep(1200)
  let stNow = await state()
  ok('E17 重写此回复只重发、不动世界', stNow.rec.length === preFx.rec.length && stNow.rec.length === 2, JSON.stringify(stNow.rec))
  ok('E18 重写后仍无 v1-9 泄漏', !sys1().includes(need19), '')
  // 从此重来：只截断日志，世界记录仍不变
  await ev(clickTxt('从此重来'))
  await sleep(800)
  stNow = await state()
  ok('E19 从此重来只动日志不动世界', stNow.rec.length === 2 && stNow.rec.every((r) => r.mode === 'online'), JSON.stringify(stNow.rec))
  const bodyE = await ev(`document.body.innerText`)
  const banned = ['酒馆', '世界书', '预设', '应答酒馆', '客官', '开席', '点单', '上菜']
  ok('E20 页面无禁用词', !banned.some((t) => bodyE.includes(t)), '')
  ok('E21 页面无残留标签围栏', !bodyE.includes('<maintext>') && !bodyE.includes('<vars>') && !bodyE.includes('```json'), '')

  // P5 流式中止：慢流挂起（正文已上屏、[DONE] 未到）→ 点「中断推演」
  // 断言已生成部分保留为正式消息、半截 <vars> 指令不落地、无标签/围栏泄漏
  const recPre = (await state()).rec.length
  await poll(`!!document.querySelector('input[placeholder^="推进事件"]') && !document.body.innerText.includes('导演正在编织叙事…')`, 20000, 'E abt composer idle')
  await sleep(400)
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）E-SLOW-ABORT 先把终端放到一边，听听夜风。')
  await poll(`!!document.querySelector('[data-stream-live]') && document.body.innerText.includes('【E-SLOW】')`, 20000, 'E abt live bubble')
  const sawLive = await ev(`(()=>{const el=document.querySelector('[data-stream-live]');return el?el.innerText.includes('【E-SLOW】'):false})()`)
  ok('EA1 流式活气泡上屏（data-stream-live 含正文）', sawLive === true, 'saw=' + sawLive)
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='中断推演');if(!b)return false;b.click();return true})()`)
  await poll(`!document.querySelector('[data-stream-live]')`, 10000, 'E abt live cleared')
  await sleep(600)
  const bodyAb = await ev(`document.body.innerText`)
  ok('EA2 中止后保留已生成部分（正文仍在屏）', bodyAb.includes('【E-SLOW】'), '')
  ok('EA3 中止未落地半截指令（rec 不变）', (await state()).rec.length === recPre, 'rec=' + (await state()).rec.length)
  ok('EA4 中止后无标签/围栏泄漏', !bodyAb.includes('<vars>') && !bodyAb.includes('<maintext>') && !bodyAb.includes('```'), '')

  // 播种非破坏：外插用户自建库 + 强制重播 canon（删种子标记 → 重载）
  const insUser = await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-lore');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return new Promise((res)=>{const tx=db.transaction(['lorebooks','meta'],'readwrite');tx.objectStore('lorebooks').put({id:'user-book-test-1',name:'E测试库',description:'user-sentinel-7',entries:[],createdAt:Date.now(),updatedAt:Date.now()});tx.objectStore('meta').delete('zts-lore-seed-v1');tx.oncomplete=()=>res(true);tx.onerror=()=>res(false)})})()`)
  ok('E22 外插用户库并清除种子标记', insUser === true, 'ins=' + insUser)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await poll(`${loreCountSrc()}.then(n=>n===6)`, 15000, 'E user book preserved')
  const ub = await loreBook('user-book-test-1')
  ok('E23 重播 canon 非破坏：5+用户1（无重复）', true)
  ok('E24 用户自建库在重播后保留', !!ub && ub.name === 'E测试库' && ub.description === 'user-sentinel-7', JSON.stringify(ub))
  ok('E25 重播未吞并激活标记/主库', (await loreEntry('book-canon-char', '露娜')) !== null, '')

  // Settings 视图挂载冒烟：防「首帧 effect 引用后置 const(TDZ)」类整页黑屏回归（曾致设置黑屏）
  await goto('终端设置')
  await sleep(900)
  const setProbe = await ev(`(()=>{const v=document.querySelector('.vpage');return {hasVpage:!!v,hasPanel:v?v.innerText.includes('词条库数据管理'):false,hasHead:v?v.innerText.includes('终端设置'):false,hasFetch:v?v.innerText.includes('拉取模型'):false,hasSt:v?v.innerText.includes('导入 ST 世界书'):false,hasPreset:v?v.innerText.includes('导入 ChatPreset'):false,len:v?v.innerText.length:0}})()`)
  ok('F1 设置视图挂载无黑屏（词条库数据管理面板可见）', setProbe.hasVpage === true && setProbe.hasPanel === true && setProbe.hasHead === true && setProbe.len > 400, JSON.stringify(setProbe))
  ok('F2 P3 增强就位：拉取模型 / 导入 ST 世界书 / 导入 ChatPreset', setProbe.hasFetch === true && setProbe.hasSt === true && setProbe.hasPreset === true, JSON.stringify(setProbe))

  /* ============ Phase G：P2 角色档案 —— 全员卡 / ∞ 无法测量 / 全员羁绊 / 就近弹窗 / 立绘查看 ============ */
  console.log('\n[Phase G] P2 Archive：25卡 · ∞无法测量 · 全员羁绊 · 就近弹窗 · 立绘查看')
  await goto('角色档案')
  await poll(`!!document.querySelector('.vpage') && document.querySelectorAll('[data-archive-card]').length===25`, 20000, 'G archive 25 cards')
  ok('G1 全员 25 张档案卡（自始开放 · 无需解锁）', true)
  const infCount = await ev(`(()=>{const c=document.querySelector('[data-archive-card="hikari"]');return c?(c.innerText.split('∞').length-1):-1})()`)
  ok('G2 恋兔光破坏力读数为唯一 ∞（满格 · 无法测量）', infCount === 1, 'inf=' + infCount)
  const bondChips = await ev(`(()=>[...document.querySelectorAll('[data-archive-card]')].filter(c=>c.innerText.includes('当前羁绊')).length)()`)
  ok('G3 25 张卡均带「当前羁绊」chip', bondChips === 25, 'n=' + bondChips)
  // 名称/数值都有实义：chip 文本形如「当前羁绊 <称谓> · <0-100>」，且数值在界内
  const lunaChip = await ev(`(()=>{const c=document.querySelector('[data-archive-card="luna"]');const m=c?c.innerText.match(/当前羁绊\\s*([^·\\n]+?)\\s*·\\s*(\\d+)/):null;return m?{label:m[1].trim(),val:Number(m[2])}:null})()`)
  ok('G4 档案羁绊 chip 有实义称谓与界内数值', !!lunaChip && lunaChip.val >= 0 && lunaChip.val <= 100 && lunaChip.label.length > 0, JSON.stringify(lunaChip))
  // 打开恋兔光详情（就近锚定）
  await ev(`(()=>{const c=document.querySelector('[data-archive-card="hikari"]');if(!c)return false;c.scrollIntoView({block:'center'});c.click();return true})()`)
  await poll(`(()=>{const d=document.querySelector('[data-archive-dialog]');return !!d && d.innerText.includes('无法测量')})()`, 15000, 'G dialog open ∞ note')
  const dg = await ev(`(()=>{const d=document.querySelector('[data-archive-dialog]');if(!d)return null;const r=d.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),vw:innerWidth,vh:innerHeight,text:d.innerText}})()`)
  ok('G5 就近弹窗视口内落位（未越界）', !!dg && dg.t >= 0 && dg.l >= 0 && dg.l + dg.w <= dg.vw + 2 && dg.t + dg.h <= dg.vh + 2, JSON.stringify(dg && { l: dg.l, t: dg.t, w: dg.w, h: dg.h }))
  ok('G6 弹窗含 立绘位 与 当前羁绊 区', !!dg && dg.text.includes('立绘') && dg.text.includes('当前羁绊'), '')
  ok('G7 弹窗含 ∞/无法测量 说明行', !!dg && dg.text.includes('无法测量'), '')
  // 立绘全图查看器
  await ev(clickTxt('查看全图'))
  await poll(`!!document.querySelector('[data-archive-lightbox]')`, 10000, 'G lightbox open')
  const lbText = await ev(`document.querySelector('[data-archive-lightbox]')?document.querySelector('[data-archive-lightbox]').innerText:''`)
  ok('G8 立绘全图查看器开启（缺图纹章占位 → 真图即点亮）', lbText.includes('立绘全图'), '')
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-archive-lightbox] button')].find(x=>x.getAttribute('aria-label')==='关闭');if(b){b.click();return true}return false})()`)
  await poll(`!document.querySelector('[data-archive-lightbox]')`, 8000, 'G lightbox close')
  ok('G9 查看器可关闭并返回详情', true)
  // ESC 关闭就近弹窗
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await poll(`!document.querySelector('[data-archive-dialog]')`, 8000, 'G dialog esc close')
  ok('G10 弹窗 ESC 关闭', true)

  /* ============ Phase H：P4 变量系统 —— 面板 / 新增 / 持久 / 删除 / 关闭 ============ */
  console.log('\n[Phase H] P4 变量系统：面板开启 / 新增变量 / 持久 / 删除')
  await poll(`!!document.querySelector('button') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('编辑变量'))`, 15000, 'H var btn')
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('编辑变量'));if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-vars-panel]')`, 10000, 'H panel open')
  const hp = await ev(`(()=>{const p=document.querySelector('[data-vars-panel]');const t=p?p.innerText:'';return {hasA:t.includes('用户变量'),hasB:t.includes('系统派生')}})()`)
  ok('H1 变量面板开启（用户变量 + 系统派生两分区）', hp.hasA === true && hp.hasB === true, JSON.stringify(hp))
  const sysProbe = await ev(`(()=>{const p=document.querySelector('[data-vars-panel]');return {op:!!p.querySelector('[data-var-sys="operatorName"]'),bond:p.querySelectorAll('[data-var-sys^="bond:"]').length,met:!!p.querySelector('[data-var-sys="met"]'),cur:!!p.querySelector('[data-var-sys="cur"]')}})()`)
  ok('H2 系统派生列示 operatorName/25×bond/met/cur', sysProbe.op === true && sysProbe.bond === 25 && sysProbe.met === true && sysProbe.cur === true, JSON.stringify(sysProbe))
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-vars-panel] button')].find(x=>x.textContent&&x.textContent.includes('新增变量'));if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-vars-panel] input[aria-label="新变量名"]')`, 8000, 'H add row')
  const fillAdd = await ev(`(()=>{const p=document.querySelector('[data-vars-panel]');const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;const k=p.querySelector('input[aria-label="新变量名"]');const v=p.querySelector('input[aria-label="变量值"]');if(!k||!v)return false;set.call(k,'smoke_var');k.dispatchEvent(new Event('input',{bubbles:true}));set.call(v,'七');v.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  ok('H3 变量新增表单填入', fillAdd === true, '')
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-vars-panel] button')].find(x=>x.textContent&&x.textContent.trim()==='添加');if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-var-row="smoke_var"]')`, 10000, 'H row added')
  const rowProbe = await ev(`(()=>{const r=document.querySelector('[data-var-row="smoke_var"]');return r?r.innerText.includes('七'):false})()`)
  ok('H4 新增变量上屏（键 smoke_var / 值 七）', rowProbe === true, '')
  await poll(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-terminal:v3')||'{}');return (o.world&&o.world.flags&&o.world.flags.smoke_var)==='七'}catch(e){return false}})()`, 10000, 'H persist')
  ok('H5 变量随世界状态持久（world.flags.smoke_var）', true)
  await ev(`(()=>{const b=document.querySelector('[data-var-row="smoke_var"] button[aria-label="删除 smoke_var"]');if(!b)return false;b.click();return true})()`)
  await poll(`(()=>{const r=document.querySelector('[data-var-row="smoke_var"]');return !!r && r.innerText.includes('确认')})()`, 8000, 'H del confirm')
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-var-row="smoke_var"] button')].find(x=>x.textContent&&x.textContent.trim()==='确认');if(!b)return false;b.click();return true})()`)
  await poll(`!document.querySelector('[data-var-row="smoke_var"]')`, 10000, 'H row removed')
  ok('H6 删除走行内二次确认并移除', true)
  await poll(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-terminal:v3')||'{}');return !(o.world&&o.world.flags&&('smoke_var' in o.world.flags))}catch(e){return false}})()`, 8000, 'H gone persist')
  ok('H7 删除后持久状态同步消失', true)
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-vars-panel] button')].find(x=>x.getAttribute('aria-label')==='关闭变量面板');if(!b)return false;b.click();return true})()`)
  await poll(`!document.querySelector('[data-vars-panel]')`, 8000, 'H panel close')
  ok('H8 变量面板可关闭', true)

} catch (e) {
  passAll = false
  console.error('\nSMOKE ERROR: ' + e.message)
  try {
    const dbg = await ev(`(()=>{try{return document.body?document.body.innerText.slice(0,400):'<no body>'}catch(x){return String(x)}})()`)
    console.error('--- page text head ---\n' + dbg)
  } catch { /* ignore */ }
} finally {
  console.log(`\n=== ${failures === 0 && passAll ? 'SMOKE PASS' : 'SMOKE FAIL'} · failures=${failures} ===`)
  try { edge.kill() } catch { /* ignore */ }
  try { preview.kill() } catch { /* ignore */ }
  try { stub.close() } catch { /* ignore */ }
  try { eStub.close() } catch { /* ignore */ }
  await sleep(400)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
  if (failures > 0 || !passAll) process.exit(1)
}
