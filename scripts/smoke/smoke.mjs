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
/* P2（改动A）：收束栏出现 → 点「进入下一事件」才写记录并推进 */
const concludedGo = () => ev(`(()=>{const b=[...document.querySelectorAll('[data-concluded] button')].find(x=>x.textContent&&x.textContent.includes('进入下一事件'));if(!b)return false;b.click();return true})()`)

/* 开屏：长按指纹 1.5s → 自检约 3s → 标题菜单/终端挂载（用 CDP 真实鼠标事件）
   P7：认证通过后先进「标题菜单」；有进度走「行动继续」沿用，无进度走「行动开始」开新档。 */
async function boot() {
  await poll(`!!document.querySelector('[aria-label="认证开屏"]')`, 25000, 'boot screen')
  const rect = await ev(`(()=>{const el=document.querySelector('[aria-label="长按指纹以完成认证"]');if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  if (!rect) throw new Error('boot: fingerprint button not found')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await sleep(2200)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('.app--stage') || !!document.querySelector('[data-title="1"]')`, 30000, 'post-boot title/shell')
  const inTitle = await ev(`!!document.querySelector('[data-title="1"]')`)
  if (inTitle) {
    const action = await ev(`(()=>{const cont=[...document.querySelectorAll('button')].find(b=>b.textContent&&b.textContent.includes('行动继续'));if(cont&&!cont.disabled){cont.click();return 'continue'}const start=[...document.querySelectorAll('button')].find(b=>b.textContent&&b.textContent.includes('行动开始'));if(start){start.click();return 'start'}return 'none'})()`)
    if (action === 'none') throw new Error('boot: title screen has no usable action')
    await poll(`!!document.querySelector('.app--stage')`, 30000, 'shell mount after ' + action)
  }
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
  // A0：P9 角色档案受门禁保护——此时仍是全新世界、unlocked=false，档案不可调阅
  await goto('角色档案')
  await sleep(700)
  const a0 = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('角色档案'));const v=document.querySelector('.vpage');return {navLock:b?b.innerText.includes('LOCKED'):null,cards:document.querySelectorAll('[data-archive-card]').length,toast:document.body.innerText.includes('权限未解锁'),sub:v?v.innerText.slice(0,300):''}})()`)
  const preUnlock = await ev(`(${wState}).unlocked`)
  ok('A0 未解锁时角色档案被拦下（导航 LOCKED · 无档案卡 · 提示权限未解锁）',
    preUnlock === false && a0.navLock === true && a0.cards === 0 && a0.toast === true, 'unlocked=' + preUnlock + ' ' + JSON.stringify(a0))
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
  // A5b：门禁既开，角色档案随之可调阅
  await goto('角色档案')
  await poll(`document.querySelectorAll('[data-archive-card]').length===24`, 20000, 'A5b archive after unlock')
  const a5b = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('角色档案'));return {navLock:b?b.innerText.includes('LOCKED'):null,cards:document.querySelectorAll('[data-archive-card]').length}})()`)
  ok('A5b 解锁后角色档案开放（导航脱锁 · 24 卡）', a5b.navLock === false && a5b.cards === 24, JSON.stringify(a5b))
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

  /* ============ Phase C：在线推演（stub）→ 收束停留(不自动归档) → 点「进入下一事件」手动推进 + 短信羁绊 clamp ============ */
  console.log('\n[Phase C] 在线推演 → 收束停留 / 手动进入下一事件 / 自动衔接开场 / 未解析补发 / SMS clamp')
  await ev(`localStorage.clear()`)
  await clearIDB()
  await seedApi('main', `http://127.0.0.1:${STUB_PORT}`, 'stub')
  await seedApi('sms', `http://127.0.0.1:${STUB_PORT}`, 'stub-sms')
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('剧情推进')
  // v1-1 开场白自足完整（standby）→ 注入原文后原地待命，不自动发导演请求
  await poll(`document.body.innerText.includes('开场白 · 原文')`, 30000, 'C v1-1 opening injected')
  await sleep(800)
  ok('C0 v1-1 standby：开场已注入且无自动导演请求（rec=0 · plotReq=0）', (await state()).rec.length === 0 && plotReq === 0, 'plotReq=' + plotReq)
  // 操作员手动回话 → req1 导演回执 eventDone：正文完整停留当前事件，不自动归档、不自动跳走
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）我抓住浮木的残片，朝拉法挣扎的方向划去。')
  await poll(`!!document.querySelector('[data-concluded]')`, 40000, 'C v1-1 concluded bar')
  st = await state()
  ok('C1 收束回复完整停留：不自动归档/不跳走（rec=0 · 收束栏在 · 正文上屏）', st.rec.length === 0 && (await ev(`document.body.innerText.includes('【DIR1】') && document.body.innerText.includes('本事件已收束')`)), 'rec=' + st.rec.length + ' plotReq=' + plotReq)
  // 叙述已存进该事件会话（zts-plot:v1）——指令已剥离
  await poll(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');const l=o['v1-1']||[];return l.some(x=>x.text.includes('【DIR1】'))}catch(e){return false}})()`, 10000, 'C dir1 log')
  const log1 = await ev(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');return (o['v1-1']||[]).map(x=>x.text).join('\\n')}catch(e){return String(e)}})()`)
  ok('C2 叙述已写入 v1-1 会话且指令剥离', log1.includes('【DIR1】') && !log1.includes('```') && !log1.includes('eventDone'), '')
  // 点「进入下一事件」→ 此刻才写记录；同时自动为 v1-2 生成衔接开场（req2 eventDone → v1-2 收束栏现）
  await concludedGo()
  await poll(`(${wState}).rec.length===1`, 40000, 'C v1-1 archived (进入下一事件)')
  st = await state()
  ok('C2b 点按后归档 v1-1（online · ts>0）', st.rec.length === 1 && st.rec[0].mode === 'online' && st.rec[0].ts > 0, JSON.stringify(st.rec))
  // v1-2 / v1-3：同样收束栏 → 点「进入下一事件」推进（各自衔接开场已自动发往下一事件）
  // 注：v1-1/v1-2 的「上一事件已收束」横幅只在各自推进到衔接回执(下一段 eventDone)落定前闪现，
  //     是瞬时态；等到 v1-4 的 DIR4（叙述-only·无指令）后横幅才会稳定 —— 故横幅断言放在 C5b。
  for (const want of ['v1-2', 'v1-3']) {
    await poll(`!!document.querySelector('[data-concluded]')`, 30000, 'C bar ' + want)
    await concludedGo()
    await poll(`(${wState}).rec.length===${want === 'v1-2' ? 2 : 3}`, 40000, 'C archive ' + want)
    await sleep(600) // 等衔接回执收尾
  }
  st = await state()
  ok('C3 三段全部在线归档', st.rec.length === 3 && st.rec.every((r) => r.mode === 'online'), JSON.stringify(st.rec))
  ok('C4 v1-3 后解锁', st.unlocked === true, 'unlocked=' + st.unlocked)
  // v1-3 点按后自动衔接 v1-4 → 叙述-only（无指令）→ 未解析提示 + 补发按钮（v1-4 未被归档）
  await poll(`document.body.innerText.includes('未解析到事件指令') || document.body.innerText.includes('要求补发指令')`, 30000, 'C needDir notice')
  const bodyC = await ev(`document.body.innerText`)
  ok('C5 无指令回包 → 提示 + 补发按钮', bodyC.includes('未解析到事件指令') && bodyC.includes('要求补发指令'), '')
  // DIR4 叙述-only 不触碰 lastEnded → 「上一事件已收束(v1-3)」横幅此刻是稳定态（焦点已落到 v1-4，无收束栏）
  const stEnded = await ev(`(()=>{const t=document.body.innerText;return {bar:t.includes('上一事件已收束'), digest:t.includes('苍之学园'), noBar:!document.querySelector('[data-concluded]')}})()`)
  ok('C5b 收束横幅稳定呈现（上一事件已收束 · 含收束解读 · 无收束栏）', stEnded.bar === true && stEnded.digest === true && stEnded.noBar === true, JSON.stringify(stEnded))
  st = await state()
  ok('C6 v1-4 未误归档', st.rec.length === 3, 'rec=' + st.rec.length)
  // 补发指令 → flag 落地
  await goto('要求补发指令')
  await poll(`(${wState}).fl.resend_ok===true`, 30000, 'C flag resend_ok')
  st = await state()
  ok('C7 补发后 flag 落地', st.fl.resend_ok === true, JSON.stringify(st.fl))
  // 变量自动更新 toast（主角行为 → 回执 flag → 行内提示上屏）
  await poll(`document.body.innerText.includes('变量已自动更新') && document.body.innerText.includes('resend_ok = true')`, 12000, 'C var toast')
  ok('C7b 变量自动更新 toast（resend_ok = true）', true)
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
  // E1 播种幂等：A–D 已多次重载，canon 仍为 5 库、无重复累积（「登场者登记」已并入「角色档案」）
  await poll(`${loreCountSrc()}.then(n=>n===5)`, 10000, 'E canon=5 (char/codex/lore/events/ops)')
  ok('E1 播种幂等：多轮重载后 canon 仍为 5 库', true)
  const canonChar = await loreBook('book-canon-char')
  ok('E2 canon 主库齐备（角色/图鉴/世界/事件）', !!canonChar && (await loreBook('book-canon-codex')) !== null && (await loreBook('book-canon-lore')) !== null && (await loreBook('book-canon-events')) !== null)
  ok('E2b 角色档案世界书已并入全员 25 词条', !!canonChar && canonChar.count === 25, 'count=' + (canonChar && canonChar.count))
  ok('E2c 旧「登场者登记」世界书已迁移移除', (await loreBook('book-canon-sidecast')) === null, '')

  // 进入剧情推进：v1-1 开场自足完整（standby）→ 注入原文后原地待命；
  // 操作员手动回话 → 标签回执（<maintext>+<vars>）驱动 v1-1 收束：正文停留、不自动归档
  await goto('剧情推进')
  await poll(`document.body.innerText.includes('开场白 · 原文')`, 30000, 'E v1-1 opening injected (standby)')
  await sleep(800)
  ok('E2b v1-1 standby：注入后无自动请求（rec=0 · eSeq=0）', (await state()).rec.length === 0 && eSeq === 0, 'eSeq=' + eSeq)
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）我抱住浮木，回头去找拉法的手。')
  await poll(`!!document.querySelector('[data-concluded]')`, 40000, 'E v1-1 concluded (tag turn)')
  ok('E3 标签回执驱动收束：正文停留 · 未自动归档（rec=0 · eSeq=1）', (await state()).rec.length === 0 && eSeq === 1, 'eSeq=' + eSeq)
  ok('E4 标签路径确有且仅有一次剧情请求', eSeq === 1, 'eSeq=' + eSeq)
  const logV11 = await plotLogText('v1-1')
  ok('E5 正文入库且标签/围栏已剥离', logV11.includes('【E1】') && !logV11.includes('<maintext>') && !logV11.includes('<vars>') && !logV11.includes('```'), logV11.slice(0, 80))
  // 点「进入下一事件」→ v1-1 此刻才归档；随后自动为 v1-2 生成衔接开场并收束（标签 digest 落记录）
  await concludedGo()
  await poll(`(${wState}).rec.length===1`, 40000, 'E v1-1 archived (进入下一事件)')
  ok('E6 收束记录 digest 来自 <vars>（点按时刻才写）', ((await state()).rec[0] && (await state()).rec[0].mode === 'online') && (await recDigest('v1-1')).includes('E自动开场'), await recDigest('v1-1'))
  // 自动衔接开场到 v1-2（E2 eventDone → v1-2 收束栏现）→ 再点按归档 v1-2
  await poll(`!!document.querySelector('[data-concluded]')`, 30000, 'E v1-2 concluded (bridge)')
  await concludedGo()
  await poll(`(${wState}).rec.length===2`, 40000, 'E v1-2 archived (进入下一事件)')
  // 自动衔接 v1-3：E3 为叙述-only（无指令）→ v1-3 就位未归档、提示可补发（rec=2 · eSeq=3）
  await poll(`document.body.innerText.includes('上一回未解析到事件指令') || document.body.innerText.includes('要求补发指令')`, 30000, 'E v1-3 no-directive notice')
  ok('E6b v1-2 归档后自动衔接 v1-3（未归档 · eSeq=3 · rec=2）', eSeq === 3 && (await state()).rec.length === 2, 'eSeq=' + eSeq + ' rec=' + (await state()).rec.length)
  // P3：世界书按钮 → 智库页（管理器整页内嵌），验证编辑层可开合（不保存）
  await poll(`!!document.querySelector('button') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('世界书'))`, 15000, 'E lb btn')
  const opened = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('世界书'));if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-loremanager]') && document.body.innerText.includes('命中规则') && document.body.innerText.includes('世界书管理器')`, 15000, 'E lore manager embedded')
  ok('E7 世界书按钮 → 智库页 · 管理器整页内嵌', opened === true, '')
  await ev(clickTxt('浏览 / 编辑'))
  await poll(`document.body.innerText.includes('选择或新增一个词条')`, 10000, 'E lore editor open')
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('新增词条'));if(!b)return false;b.click();return true})()`)
  await poll(`document.body.innerText.includes('关键词（每行一个') && document.body.innerText.includes('内容')`, 8000, 'E lore entry form')
  ok('E8 内嵌编辑器可用（新增词条表单字段齐备）', true)
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='返回列表');if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-loremanager]') && document.body.innerText.includes('命中规则') && !document.body.innerText.includes('选择或新增一个词条')`, 10000, 'E lore back list')
  ok('E8b 编辑器可返回列表（未保存，DB 不变）', true)

  // 回剧情：当前事件 v1-3 已有衔接叙述 → 不再自动开场/无额外请求（世界进度延续）
  await goto('剧情推进')
  await poll(`!!document.querySelector('input[placeholder^="推进事件"]') && !document.body.innerText.includes('导演正在编织叙事…')`, 20000, 'E composer idle v1-3')
  await sleep(600)
  ok('E9 返回剧情不重复开场（v1-3 已就位 · eSeq 仍 3 · rec 仍 2）', eSeq === 3 && (await state()).rec.length === 2, 'eSeq=' + eSeq + ' rec=' + (await state()).rec.length)
  const lunaRaw = await loreEntry('book-canon-char', '露娜')
  const lunaNeed = String((lunaRaw && lunaRaw.content) || '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const sys1 = () => { const m = (eLast && eLast.messages || []).find((x) => x.role === 'system'); return String((m && m.content) || '') }
  // req（v1-3）：叙述里带角色名 → 世界书命中注入（露娜档案）
  await poll(`!!document.querySelector('input[placeholder^="推进事件"]') && !document.body.innerText.includes('导演正在编织叙事…')`, 20000, 'E composer v1-3')
  await sleep(700)
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）露娜把半盒布丁推到他面前，尾音压得很低。')
  await waitSeq(4)
  await poll(`document.body.innerText.includes('上一回未解析到事件指令')`, 30000, 'E injection needDir')
  ok('E10 命中注入：system 含世界书块与角色档案', sys1().includes('世界书 · 命中参考') && sys1().includes(lunaNeed), 'lunaNeed=' + lunaNeed.slice(0, 24))
  ok('E11 注入请求确为一次 · 无指令不误归档', eSeq === 4 && (await state()).rec.length === 2, 'eSeq=' + eSeq + ' rec=' + (await state()).rec.length)

  // req：反剧透闸门。同一条消息同时带 已做(v1-2) 与 未做(v1-9) 的事件专名
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
  await waitSeq(5)
  await poll(`document.body.innerText.includes('上一回未解析到事件指令')`, 30000, 'E req2 needDir')
  const sys3 = sys1()
  ok('E13 已做事件词条仍注入（证明扫描在工作）', sys3.includes(need12), '')
  ok('E14 反剧透：未做事件 v1-9 摘要被闸门挡下', !sys3.includes(need19), 'leak? ' + need19.slice(0, 30))
  ok('E15 无指令回合未误归档', (await state()).rec.length === 2, 'rec=' + (await state()).rec.length)
  ok('E16 反剧透回合确为一次注入请求', eSeq === 5, 'eSeq=' + eSeq)

  // 重写此回复：末条无世界变化 → 重发同文；世界记录数不变
  const preFx = await state()
  await poll(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('重写此回复'))`, 10000, 'E rewrite btn')
  await ev(clickTxt('重写此回复'))
  await waitSeq(6)
  await sleep(1200)
  let stNow = await state()
  ok('E17 重写此回复只重发、不动世界', stNow.rec.length === preFx.rec.length && stNow.rec.length === 2, JSON.stringify(stNow.rec))
  ok('E18 重写后仍无 v1-9 泄漏', !sys1().includes(need19), '')
  // 从此重来：只截断日志，世界记录仍不变
  await ev(clickTxt('从此重来'))
  await sleep(800)
  stNow = await state()
  ok('E19 从此重来只动日志不动世界', stNow.rec.length === 2 && stNow.rec.every((r) => r.mode === 'online'), JSON.stringify(stNow.rec))
  // 只扫事件会话区（data-session-area）：页眉的「世界书」按钮等导航文案不算泄漏
  const sessionBody = await ev(`(()=>{const el=document.querySelector('[data-session-area]');return el?el.innerText:document.body.innerText})()`)
  const banned = ['酒馆', '预设', '应答酒馆', '客官', '开席', '点单', '上菜']
  ok('E20 会话区无禁用词（酒馆风泄漏）', !banned.some((t) => sessionBody.includes(t)), '')
  ok('E21 会话区无残留标签围栏', !sessionBody.includes('<maintext>') && !sessionBody.includes('<vars>') && !sessionBody.includes('```json'), '')

  // P5 流式中止：慢流挂起（正文已上屏、[DONE] 未到）→ 点「中断推演」
  // 断言已生成部分保留为正式消息、半截 <vars> 指令不落地、无标签/围栏泄漏
  const recPre = (await state()).rec.length
  await poll(`!!document.querySelector('input[placeholder^="推进事件"]') && !document.body.innerText.includes('导演正在编织叙事…')`, 20000, 'E abt composer idle')
  await sleep(400)
  await typeEnter('input[placeholder^="推进事件"]', '（言万心叶）E-SLOW-ABORT 先把终端放到一边，听听夜风。终端里闪过「灵魂蓄积器TM」的字样。')
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

  // P6 气泡版式 + 关键词跳转：
  // 操作员消息已升级为「右头像」气泡（data-you，含头像 + 正文）；
  // 气泡内可点词 → 图鉴条目（requestCodex）应自动打开对应档案。
  const youInfo = await ev(`(()=>{const el=document.querySelector('[data-you]');if(!el)return null;return {text:el.innerText, hasAvatar:!!el.querySelector('[role="img"]'), hasLink:!!el.querySelector('span[role="link"]')}})()`)
  ok('EA5 操作员消息为右头像气泡（data-you 含头像+正文）', !!youInfo && youInfo.hasAvatar === true && (youInfo.text || '').includes('E-SLOW-ABORT'), JSON.stringify(youInfo))
  const hasLink = await ev(`!![...document.querySelectorAll('[data-you] span[role="link"]')].find(x=>x.textContent==='灵魂蓄积器TM')`)
  ok('EA6 气泡内图鉴名可点（Linkified 命中）', hasLink === true, 'hasLink=' + hasLink)

  // 播种非破坏：外插用户自建库 + 强制重播 canon（删种子标记 → 重载）
  const insUser = await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-lore');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return new Promise((res)=>{const tx=db.transaction(['lorebooks','meta'],'readwrite');tx.objectStore('lorebooks').put({id:'user-book-test-1',name:'E测试库',description:'user-sentinel-7',entries:[],createdAt:Date.now(),updatedAt:Date.now()});tx.objectStore('meta').delete('zts-lore-seed-v1');tx.oncomplete=()=>res(true);tx.onerror=()=>res(false)})})()`)
  ok('E22 外插用户库并清除种子标记', insUser === true, 'ins=' + insUser)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await poll(`${loreCountSrc()}.then(n=>n===6)`, 15000, 'E user book preserved')
  const ub = await loreBook('user-book-test-1')
  ok('E23 重播 canon 非破坏：4+用户1（无重复）', true)
  ok('E24 用户自建库在重播后保留', !!ub && ub.name === 'E测试库' && ub.description === 'user-sentinel-7', JSON.stringify(ub))
  ok('E25 重播未吞并激活标记/主库', (await loreEntry('book-canon-char', '露娜')) !== null, '')

  // Settings 视图挂载冒烟：防「首帧 effect 引用后置 const(TDZ)」类整页黑屏回归（曾致设置黑屏）
  await goto('终端设置')
  await sleep(900)
  const setProbe = await ev(`(()=>{const v=document.querySelector('.vpage');return {hasVpage:!!v,hasPanel:v?v.innerText.includes('世界书数据管理'):false,hasHead:v?v.innerText.includes('终端设置'):false,hasFetch:v?v.innerText.includes('拉取模型'):false,hasSt:v?v.innerText.includes('导入 ST 世界书'):false,hasPreset:v?v.innerText.includes('导入 ChatPreset'):false,hasBudget:v?v.innerText.includes('输出预算 MAX TOKENS'):false,len:v?v.innerText.length:0}})()`)
  ok('F1 设置视图挂载无黑屏（世界书数据管理面板可见）', setProbe.hasVpage === true && setProbe.hasPanel === true && setProbe.hasHead === true && setProbe.len > 400, JSON.stringify(setProbe))
  ok('F2 P3 增强就位：拉取模型 / 导入 ST 世界书 / 导入 ChatPreset', setProbe.hasFetch === true && setProbe.hasSt === true && setProbe.hasPreset === true, JSON.stringify(setProbe))
  ok('F2b P7 输出预算可配：设置卡片含 MAX TOKENS 输入', setProbe.hasBudget === true, JSON.stringify(setProbe))
  // 输出预算编辑并保存 → 随通道配置持久（思考型模型需调大预算时走这里）
  await ev(`(()=>{const i=document.querySelector('input[type="number"]');if(!i)return false;const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(i,'2000');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  await sleep(200)
  const saved = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置'));if(!b)return false;b.click();return true})()`)
  await poll(`(async()=>{try{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-terminal-store',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return new Promise((res)=>{const tx=db.transaction('kv','readonly');const g=tx.objectStore('kv').get('api:main');g.onsuccess=()=>res(g.result&&g.result.maxTokens===2000);g.onerror=()=>res(false)})}catch(e){return false}})()`, 8000, 'F maxTokens persist')
  ok('F2c 输出预算改动随通道配置持久（api:main.maxTokens=2000）', saved === true, 'saved=' + saved)

  /* ============ Phase G：P2 角色档案 —— 全员卡 / ∞ 无法测量 / 全员羁绊 / 就近弹窗 / 立绘查看 ============ */
  console.log('\n[Phase G] P2 Archive：24卡 · ∞无法测量 · 全员羁绊 · 就近弹窗 · 立绘查看')
  // 档案页已在门禁之后（Phase E 清过 localStorage，此处重新置位），本相聚焦档案本体
  await ev(`(()=>{const k='zts-terminal:v3';const s=JSON.parse(localStorage.getItem(k)||'{}');s.unlocked=true;localStorage.setItem(k,JSON.stringify(s));return true})()`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await poll(`document.body.innerText.includes('终端总览')`, 20000, 'G dash after unlock')
  await goto('角色档案')
  await poll(`!!document.querySelector('.vpage') && document.querySelectorAll('[data-archive-card]').length===24`, 20000, 'G archive 24 cards')
  ok('G1 全员 24 张档案卡（解锁后开放）', true)
  // P3b：未遇见 → 锁定保密。封存卡不得泄露姓名 / 武装 / 五轴 / 羁绊
  const lockProbe = await ev(`(()=>{const all=[...document.querySelectorAll('[data-archive-card]')];const lock=all.filter(c=>c.hasAttribute('data-locked-id'));return {all:all.length,lock:lock.length,named:lock.filter(c=>!c.innerText.includes('？？？')).length,axis:lock.filter(c=>c.querySelector('[data-axis-num],[data-axis-normal],[data-axis-limit]')).length,bond:lock.filter(c=>c.innerText.includes('当前羁绊')).length}})()`)
  ok('G1b 未遇见者一律封存（且封存卡不显姓名/五轴/羁绊）',
    !!lockProbe && lockProbe.lock > 0 && lockProbe.named === 0 && lockProbe.axis === 0 && lockProbe.bond === 0,
    JSON.stringify(lockProbe))
  // 后续断言需看全卡内容：把名录全体登记为「已遇见」后重载（封存门禁另由 G1b 覆盖）
  const seedMet = await ev(`(()=>{try{const k='zts-terminal:v3';const s=JSON.parse(localStorage.getItem(k)||'{}');const ids=[...document.querySelectorAll('[data-archive-card]')].map(c=>c.getAttribute('data-archive-card'));s.world=Object.assign({},s.world||{},{met:Object.fromEntries(ids.map(i=>[i,true]))});localStorage.setItem(k,JSON.stringify(s));return ids.length}catch(e){return String(e)}})()`)
  ok('G1c 播种「已遇见」名录（供全卡断言）', seedMet === 24, 'seed=' + seedMet)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('角色档案')
  await poll(`document.querySelectorAll('[data-archive-card]:not([data-locked-id])').length===24`, 20000, 'G archive unlocked')
  ok('G1d 全员已遇见后封存解除（24/24 可读）', true)
  // P2 起读数改为「常态/极限」双值，故不再数 ∞ 字符数（∞/∞ 本就算两个），改按 data 属性判定语义
  const infNorm = await ev(`(()=>{const c=document.querySelector('[data-archive-card="hikari"]');return c?c.querySelectorAll('[data-axis-normal="∞"]').length:-1})()`)
  const infLim = await ev(`(()=>{const c=document.querySelector('[data-archive-card="hikari"]');return c?c.querySelectorAll('[data-axis-limit="∞"]').length:-1})()`)
  ok('G2 恋兔光破坏力为唯一常态 ∞ 轴，且极限亦 ∞（读数「∞/∞」）', infNorm === 1 && infLim === 1, 'norm=' + infNorm + ' lim=' + infLim)
  const infOther = await ev(`(()=>{let n=0;document.querySelectorAll('[data-archive-card]').forEach(c=>{if(c.getAttribute('data-archive-card')!=='hikari')n+=c.querySelectorAll('[data-axis-normal="∞"]').length});return n})()`)
  ok('G2b 常态 ∞ 为恋兔光专属（其余 23 人常态皆为可测数值）', infOther === 0, 'other=' + infOther)
  // 双值不变式：凡已登记的轴（有 data-axis-limit）恒满足 极限 ≥ 常态；'∞' 视为最大，常态 '∞' 则极限必须亦为 '∞'
  const badLimit = await ev(`(()=>{const bad=[];document.querySelectorAll('[data-archive-card]').forEach(c=>{c.querySelectorAll('[data-axis-num]').forEach(s=>{const n=s.getAttribute('data-axis-normal'),l=s.getAttribute('data-axis-limit');if(!l)return;if(n==='∞'){if(l!=='∞')bad.push(c.getAttribute('data-archive-card')+':inf/'+l);return}if(l!=='∞'&&Number(l)<Number(n))bad.push(c.getAttribute('data-archive-card')+':'+n+'/'+l)})});return bad})()`)
  ok('G2c 全员极限 ≥ 常态（P2 双值不变式）', Array.isArray(badLimit) && badLimit.length === 0, JSON.stringify(badLimit))
  const bondChips = await ev(`(()=>[...document.querySelectorAll('[data-archive-card]')].filter(c=>c.innerText.includes('当前羁绊')).length)()`)
  ok('G3 24 张卡均带「当前羁绊」chip', bondChips === 24, 'n=' + bondChips)
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
  const hp = await ev(`(()=>{const p=document.querySelector('[data-vars-panel]');const t=p?p.innerText:'';return {hasA:t.includes('命名变量'),hasB:t.includes('终端派生')}})()`)
  ok('H1 变量面板开启（命名变量 + 终端派生两分区）', hp.hasA === true && hp.hasB === true, JSON.stringify(hp))
  const sysProbe = await ev(`(()=>{const p=document.querySelector('[data-vars-panel]');return {op:!!p.querySelector('[data-var-sys="operatorName"]'),bond:p.querySelectorAll('[data-var-sys^="bond:"]').length,met:!!p.querySelector('[data-var-sys="met"]'),cur:!!p.querySelector('[data-var-sys="cur"]')}})()`)
  ok('H2 系统派生列示 operatorName/24×bond/met/cur', sysProbe.op === true && sysProbe.bond === 24 && sysProbe.met === true && sysProbe.cur === true, JSON.stringify(sysProbe))
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

  /* ============ Phase I：P6 气泡版式 + 关键词跳转（图鉴子系统已解锁） ============ */
  console.log('\n[Phase I] P6 台词气泡 + 关键词跳转：解锁后 点正文图鉴名 → 图鉴页展开对应条目')
  // 冒烟本地放行图鉴子系统（不动剧情本体）：仅用于验证「可点词 → requestCodex」闭环
  await ev(`(()=>{const o=JSON.parse(localStorage.getItem('zts-terminal:v3')||'{}');o.unlocked=true;localStorage.setItem('zts-terminal:v3',JSON.stringify(o));return true})()`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  // 进剧情视图，读出当前聚焦事件 id（用于把一段「带台词+图鉴名」的叙述预置进该会话）
  await goto('剧情推进')
  await poll(`!!document.querySelector('.tag')`, 15000, 'I plot tag')
  const fid = await ev(`(()=>{const t=document.querySelector('.tag');return t?t.textContent.trim().toLowerCase():''})()`)
  const seedOk = await ev(`(()=>{try{const k=${JSON.stringify(fid)};if(!k)return 'no-key';const text=['夜风穿过甲板，她把终端搁在膝上，屏幕亮着。','露娜：别走神，先听我说。','她又提起那台「灵魂蓄积器TM」，说它不该再出现。'].join('\\n');const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');o[k]=[{id:'p6-'+Date.now().toString(36),from:'them',text:text,time:'20:00'}];localStorage.setItem('zts-plot:v1',JSON.stringify(o));return true}catch(e){return String(e)}})()`)
  ok('I1 预置含台词行的叙述到当前会话', seedOk === true, 'seed=' + seedOk)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('剧情推进')
  // 在线线程渲染：旁白 + 「露娜：……」→ 左头像 say 气泡；气泡带说话人头像
  await poll(`!!document.querySelector('[data-say]')`, 15000, 'I say bubble')
  const sayProbe = await ev(`(()=>{const el=document.querySelector('[data-say]');if(!el)return null;return {text:el.innerText,hasAvatar:!!el.querySelector('[role="img"]'),forWho:el.getAttribute('data-say-for')}})()`)
  ok('I2 台词行拆成左头像气泡（say 含说话人+正文）', !!sayProbe && sayProbe.hasAvatar === true && (sayProbe.text || '').includes('别走神'), JSON.stringify(sayProbe))
  // 点旁白中的图鉴名 → 图鉴页自动展开该条目
  const lnk = await ev(`(()=>{const s=[...document.querySelectorAll('span[role="link"]')].find(x=>x.textContent==='灵魂蓄积器TM');if(!s)return false;s.click();return true})()`)
  ok('I3 旁白图鉴名可点（Linkified）', lnk === true, 'lnk=' + lnk)
  await poll(`document.body.innerText.includes('CODEX / ENDINGS') && document.body.innerText.includes('应对要点')`, 12000, 'I codex open')
  const cxProbe = await ev(`(()=>{const t=document.body.innerText;return {codex:t.includes('CODEX / ENDINGS'), hasName:t.includes('灵魂蓄积器TM'), expanded:t.includes('应对要点')}})()`)
  ok('I4 点词 → 终末图鉴自动滚动并展开对应条目', cxProbe.codex === true && cxProbe.hasName === true && cxProbe.expanded === true, JSON.stringify(cxProbe))

  /* ============ Phase J：P7 标题菜单 + 8 槽存档读档 ============ */
  console.log('\n[Phase J] P7 标题菜单：无档禁用行动继续 / 存读档 / 覆盖二次确认 / 读取恢复含会话')
  // 全新态：清 storage（含可能残留的 zts-slots:v1）→ 重载 → 长按指纹 → 标题菜单
  await ev(`localStorage.clear()`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await poll(`!!document.querySelector('[aria-label="认证开屏"]')`, 25000, 'J boot screen')
  const jr = await ev(`(()=>{const el=document.querySelector('[aria-label="长按指纹以完成认证"]');if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: jr.x, y: jr.y, button: 'left', clickCount: 1 })
  await sleep(2200)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: jr.x, y: jr.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('[data-title="1"]')`, 30000, 'J title menu')
  const contDisabled = await ev(`(()=>{const b=[...document.querySelectorAll('[data-title="1"] button')].find(x=>x.textContent&&x.textContent.includes('行动继续'));return b?b.disabled:null})()`)
  ok('J0 全新无档 → 标题「行动继续」禁用', contDisabled === true, 'disabled=' + contDisabled)
  // P10：自动存档在标题页单独成条（有档可直读，无档禁用）
  const autoNone = await ev(`(()=>{const c=document.querySelector('[data-autosave-card]');if(!c)return null;const b=[...c.querySelectorAll('button')].find(x=>x.textContent.trim()==='读取');return {has:true,readDisabled:b?b.disabled:null,txt:c.innerText}})()`)
  ok('J0b 无自动档 → 自动存档条存在且「读取」禁用', !!autoNone && autoNone.has === true && autoNone.readDisabled === true, JSON.stringify(autoNone && { readDisabled: autoNone.readDisabled }))

  // 直接在标题态预置 run A（先不进 Plot：全新档 Plot 自动开场会消费陈旧 stub 回包、覆写 v1-1 会话）
  const seedA = await ev(`(()=>{localStorage.setItem('zts-terminal:v3',JSON.stringify({unlocked:false,epDone:{'v1-1':true},cur:'v1-1',operatorName:'存A',focusId:'gcn'}));localStorage.setItem('zts-plot:v1',JSON.stringify({'v1-1':[{id:'pa::1',from:'them',text:'【存A标记】夜风穿过甲板，她按下发送。',time:'20:01'}]}));localStorage.setItem('zts-tavern:v1',JSON.stringify({}));return true})()`)
  ok('J1 预置 存A 档（运行 + plot 会话）', seedA === true, '')
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()   // 有进度 → 行动继续 → 直达终端总览（dashboard，Plot 不挂载）
  await poll(`(()=>{try{return JSON.parse(localStorage.getItem('zts-terminal:v3')).operatorName==='存A'}catch(e){return false}})()`, 12000, 'J continue keeps 存A')
  ok('J2 有进度重载 → 行动继续沿用当前 run（存A）', true)

  // 旧档迁移断言：无槽文件 + 运行已有进度 → 首启自动留档 slots[0]「旧档留档」+ 自动档
  const mig0 = await ev(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1')||'null');const s=f&&f.slots&&f.slots[0];return s?{name:s.name,records:s.records,op:s.snapshot.operatorName}:null}catch(e){return {err:String(e)}}})()`)
  ok('J2b 旧档迁移：无槽文件+有进度 → slots[0] 自动留档「旧档留档」(存A)', !!mig0 && mig0.name === '旧档留档' && mig0.records === 1 && mig0.op === '存A', JSON.stringify(mig0))

  // 存读档 → 空槽 SLOT 02(index1)「保存到此槽」→ 命名 → 存档（index0 已被迁移占用）
  const openDialog = `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('存读档'));if(!b)return false;b.click();return true})()`
  const closeDialog = `(()=>{const b=[...document.querySelectorAll('[data-savedialog] button')].find(x=>x.getAttribute('aria-label')==='关闭存读档');if(!b)return false;b.click();return true})()`
  const clickEmptySave = (slotLabel) => `(()=>{const a=[...document.querySelectorAll('[data-savedialog] article')].find(x=>x.innerText.includes('SLOT ${slotLabel}')&&!x.innerText.includes('记录'));if(!a)return false;const b=[...a.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.trim().startsWith('保存'));if(!b)return false;b.click();return true})()`
  const clickBtnInArticle = (needle, label) => `(()=>{const a=[...document.querySelectorAll('[data-savedialog] article')].find(x=>x.innerText.includes(${JSON.stringify(needle)}));if(!a)return false;const b=[...a.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.trim()===${JSON.stringify(label)});if(!b)return false;b.click();return true})()`
  const clickBtnInArticleStarts = (needle, starts) => `(()=>{const a=[...document.querySelectorAll('[data-savedialog] article')].find(x=>x.innerText.includes(${JSON.stringify(needle)}));if(!a)return false;const b=[...a.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.trim().startsWith(${JSON.stringify(starts)}));if(!b)return false;b.click();return true})()`
  const fillInput = (ph, text) => `(()=>{const i=document.querySelector(${JSON.stringify('[data-savedialog] input[placeholder="' + ph + '"]')});if(!i)return false;const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`
  const fillGlobal = (ph, text) => `(()=>{const i=document.querySelector(${JSON.stringify('input[placeholder="' + ph + '"]')});if(!i)return false;const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`
  const clickExact = (label) => `(()=>{const b=[...document.querySelectorAll('[data-savedialog] button')].find(x=>x.textContent&&x.textContent.trim()===${JSON.stringify(label)});if(!b)return false;b.click();return true})()`

  await ev(openDialog)
  await poll(`!!document.querySelector('[data-savedialog]')`, 10000, 'J dialog open')
  await ev(clickEmptySave('02'))
  await poll(`!!document.querySelector('[data-savedialog] input[placeholder="存档名称"]')`, 8000, 'J slot editor open')
  await ev(fillInput('存档名称', '存档员A'))
  await ev(clickExact('保存'))
  await poll(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1')||'null');return !!(f&&f.slots&&f.slots[1]&&f.slots[1].name==='存档员A')}catch(e){return false}})()`, 8000, 'J slot1 saved')
  const sf1 = await ev(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1'));const s=f.slots[1];return {name:s.name,records:s.records,op:s.snapshot.operatorName,plot:(s.snapshot.plot&&s.snapshot.plot['v1-1']||[]).map(x=>x.text).join('\\n')}}catch(e){return {err:String(e)}}})()`)
  ok('J3 空槽保存成功（SLOT 02 · 存档员A · 1 记录 · 含 plot 会话）', sf1.name === '存档员A' && sf1.records === 1 && sf1.op === '存A' && (sf1.plot || '').includes('【存A标记】'), JSON.stringify(sf1))
  await ev(closeDialog)
  await poll(`!document.querySelector('[data-savedialog]')`, 8000, 'J dialog close 1')

  // 改动当前 run（改名 存B）→ 再读 SLOT 02 → 应恢复为 存A + 会话
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='修改代号');if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('input[placeholder="输入你的代号"]')`, 8000, 'J rename editor')
  await ev(fillGlobal('输入你的代号', '存B'))
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.trim()==='保存');if(!b)return false;b.click();return true})()`)
  await poll(`(()=>{try{return JSON.parse(localStorage.getItem('zts-terminal:v3')).operatorName==='存B'}catch(e){return false}})()`, 8000, 'J renamed 存B')
  ok('J4 当前 run 已改为 存B', true)
  await ev(openDialog)
  await poll(`!!document.querySelector('[data-savedialog]')`, 10000, 'J dialog open2')
  await ev(clickBtnInArticle('存档员A', '读取'))
  await poll(`(()=>{try{return JSON.parse(localStorage.getItem('zts-terminal:v3')).operatorName==='存A'}catch(e){return false}})()`, 15000, 'J slot load restores 存A')
  await poll(`(()=>{try{return JSON.parse(localStorage.getItem('zts-terminal:v3')).cur==='v1-1'}catch(e){return false}})()`, 8000, 'J slot load cur v1-1')
  const afterLoad = await ev(`(()=>{try{const o=JSON.parse(localStorage.getItem('zts-plot:v1')||'{}');return (o['v1-1']||[]).map(x=>x.text).join('\\n')}catch(e){return String(e)}})()`)
  ok('J5 读 SLOT 02 → 运行档恢复 存A / v1-1 / plot 会话仍带标记', (afterLoad || '').includes('【存A标记】'), 'plot=' + afterLoad.slice(0, 40))
  await ev(closeDialog)
  await poll(`!document.querySelector('[data-savedialog]')`, 8000, 'J dialog close 2')
  await poll(`document.body.innerText.includes('存档已读取') && document.body.innerText.includes('存档员A')`, 10000, 'J load toast')
  ok('J6 读档 toast 反馈（存档已读取 · 存档员A）', true)

  // 覆盖 SLOT 02：点「覆盖保存」→ 先现「再次确认覆盖」→ 再命名覆盖
  await ev(openDialog)
  await poll(`!!document.querySelector('[data-savedialog]')`, 10000, 'J dialog open3')
  await ev(clickBtnInArticleStarts('存档员A', '覆盖保存'))
  await poll(`(()=>[...document.querySelectorAll('[data-savedialog] article button')].some(x=>x.textContent&&x.textContent.includes('再次确认覆盖')))()`, 8000, 'J overwrite armed')
  ok('J7 覆盖占用槽先出「再次确认覆盖」（行内二次确认）', true)
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-savedialog] article button')].find(x=>x.textContent&&x.textContent.includes('再次确认覆盖'));if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('[data-savedialog] input[placeholder="存档名称"]')`, 8000, 'J overwrite editor')
  await ev(fillInput('存档名称', '存档员A·改'))
  await ev(clickExact('保存'))
  await poll(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1'));return f.slots[1].name==='存档员A·改'}catch(e){return false}})()`, 8000, 'J slot1 overwritten')
  const sf1b = await ev(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1'));const s=f.slots[1];return {name:s.name,records:s.records,op:s.snapshot.operatorName}}catch(e){return {err:String(e)}}})()`)
  ok('J8 覆盖保存生效（存档员A·改 · 仍 1 记录 · op 存A）', sf1b.name === '存档员A·改' && sf1b.records === 1 && sf1b.op === '存A', JSON.stringify(sf1b))

  // 自动档应已随当前 run 生成（迁移/读档后均为 run A：存A · 1 记录）
  await poll(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1'));return !!(f.autosave&&f.autosave.records===1&&f.autosave.snapshot.operatorName==='存A')}catch(e){return false}})()`, 12000, 'J autosave present')
  ok('J9 自动档随运行生成（records=1 · op 存A）', true)

  // 行动开始 → 全新档：手动档保留、运行归零（重载冷启 → 指纹 → 标题 → 行动开始）
  await cdp.send('Page.reload', { ignoreCache: true })
  await poll(`!!document.querySelector('[aria-label="认证开屏"]')`, 25000, 'J10 boot screen')
  const jr10 = await ev(`(()=>{const el=document.querySelector('[aria-label="长按指纹以完成认证"]');if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: jr10.x, y: jr10.y, button: 'left', clickCount: 1 })
  await sleep(2200)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: jr10.x, y: jr10.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('[data-title="1"]')`, 30000, 'J10 title menu')
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-title="1"] button')].find(x=>x.textContent&&x.textContent.includes('行动开始'));if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('.app--stage')`, 30000, 'J10 shell after 行动开始')
  ok('J10 标题「行动开始」→ 进入全新档', true)
  const keepSlots = await ev(`(()=>{try{const f=JSON.parse(localStorage.getItem('zts-slots:v1'));return {s0:f.slots[0]?f.slots[0].name:null,s1:f.slots[1]?f.slots[1].name:null}}catch(e){return {err:String(e)}}})()`)
  ok('J11 行动开始不清手动档（slots[0]=旧档留档 · slots[1]=存档员A·改）', keepSlots.s0 === '旧档留档' && keepSlots.s1 === '存档员A·改', JSON.stringify(keepSlots))
  await poll(`(()=>{try{return JSON.parse(localStorage.getItem('zts-terminal:v3')).operatorName==='言万心叶'}catch(e){return false}})()`, 12000, 'J10 fresh run default operator')
  ok('J12 行动开始 → 运行归零（操作员代号回到默认）', true)

  /* ============ Phase K：P8 武装图鉴门禁 —— noapusa / a Session. 在 v2-2 / v4-5 前灰卡、读毕点亮 ============ */
  console.log('\n[Phase K] P8 武装图鉴门禁：操作员武装 揭示前灰卡不泄 · 读毕点亮 · 计数过滤后算')
  // 播种：系统已解锁（读完 v1-3），但操作员双武装的揭示事件 v2-2 / v4-5 尚未完成 → 应灰卡
  const kSeed = await ev(`(()=>{localStorage.setItem('zts-terminal:v3',JSON.stringify({unlocked:true,epDone:{'v1-1':true,'v1-2':true,'v1-3':true},cur:'v1-3',operatorName:'图鉴观察员',focusId:'gcn'}));localStorage.setItem('zts-plot:v1',JSON.stringify({}));localStorage.setItem('zts-tavern:v1',JSON.stringify({}));return true})()`)
  ok('K0 播种「已解锁 v1-3 · 未达 v2-2/v4-5」的运行', kSeed === true, 'seed=' + kSeed)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()   // 行动继续 → 直达总览（Plot 不挂载，不消耗任何 stub 回包）
  await goto('武装图鉴')
  await poll(`!!document.querySelector('[data-arm-id]') || !!document.querySelector('[data-locked-id]')`, 20000, 'K arms mounted')
  const kBefore = await ev(`(()=>{const t=document.body.innerText;const lc=[...document.querySelectorAll('[data-locked-id]')];const leak=lc.some(c=>/noapusa|NOAPUSA|a Session\\\\.|A SESSION\\\\.|言万心叶/i.test(c.innerText));return {noapLocked:!!document.querySelector('[data-locked-id="kokoro-noapusa"]'),sessLocked:!!document.querySelector('[data-locked-id="kokoro-session"]'),lit:document.querySelectorAll('[data-arm-id]').length,locked:lc.length,leak,hasQ:!!document.querySelector('[data-locked-id]')&&document.querySelector('[data-locked-id]').innerText.includes('？？？'),chip:(t.match(/已点亮\\s*(\\d+)\\s*件/)||[])[1]}})()`)
  ok('K1 揭示前 → noapusa / a Session. 均为灰卡（data-locked-id）', kBefore.noapLocked === true && kBefore.sessLocked === true, JSON.stringify({ noap: kBefore.noapLocked, sess: kBefore.sessLocked }))
  ok('K2 灰卡不泄本体 / 持有者（？？？占位，内文无 noapusa/a Session./言万心叶）', kBefore.leak === false && kBefore.hasQ === true, 'leak=' + kBefore.leak + ' q=' + kBefore.hasQ)
  ok('K3 计数在过滤后算（chip=已点亮 N 件 = 页内实卡数）', kBefore.chip !== undefined && Number(kBefore.chip) === kBefore.lit && kBefore.lit > 0, JSON.stringify({ chip: kBefore.chip, lit: kBefore.lit }))

  // 补齐揭示事件（模拟读毕 v2-2 / v4-5）→ 两武装应点亮为实卡并显示本体
  const kReveal = await ev(`(()=>{const o=JSON.parse(localStorage.getItem('zts-terminal:v3'));o.epDone['v2-2']=true;o.epDone['v4-5']=true;o.cur='v4-5';localStorage.setItem('zts-terminal:v3',JSON.stringify(o));return true})()`)
  ok('K4 播种已读 v2-2/v4-5', kReveal === true, '')
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('武装图鉴')
  await poll(`!!document.querySelector('[data-arm-id="kokoro-noapusa"]') && !!document.querySelector('[data-arm-id="kokoro-session"]')`, 20000, 'K arms lit after reveal')
  const kAfter = await ev(`(()=>{const t=document.body.innerText;return {noap:!!document.querySelector('[data-arm-id="kokoro-noapusa"]'),sess:!!document.querySelector('[data-arm-id="kokoro-session"]'),stillLocked:!!document.querySelector('[data-locked-id="kokoro-noapusa"]')||!!document.querySelector('[data-locked-id="kokoro-session"]'),name:t.includes('noapusa')&&t.includes('a Session.'),lit:document.querySelectorAll('[data-arm-id]').length}})()`)
  ok('K5 读毕揭示事件 → 双武装点亮为实卡（灰卡移除）', kAfter.noap === true && kAfter.sess === true && kAfter.stillLocked === false, JSON.stringify(kAfter))
  ok('K6 点亮后显示本体（noapusa / a Session.）', kAfter.name === true, 'name=' + kAfter.name)
  ok('K7 点亮后计数随之上调（实卡数增加）', kAfter.lit > kBefore.lit, 'lit ' + kBefore.lit + ' → ' + kAfter.lit)

  /* ============ Phase L：标题「终端连接」→ 设置专用界面（无侧边栏）+ 返回标题按钮 ============ */
  console.log('\n[Phase L] P9 标题「终端连接」：仅设置一页（无侧边栏）· 返回标题按钮回标题')
  await cdp.send('Page.reload', { ignoreCache: true })
  await poll(`!!document.querySelector('[aria-label="认证开屏"]')`, 25000, 'L boot screen')
  const lr = await ev(`(()=>{const el=document.querySelector('[aria-label="长按指纹以完成认证"]');if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: lr.x, y: lr.y, button: 'left', clickCount: 1 })
  await sleep(2200)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lr.x, y: lr.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('[data-title="1"]')`, 30000, 'L title menu')
  await goto('终端连接')
  await poll(`document.body.innerText.includes('返回标题') && !document.querySelector('[data-title="1"]')`, 15000, 'L setup shell mounts')
  const setupProbe = await ev(`(()=>{const t=document.body.innerText;return {settings:t.includes('终端设置'),back:t.includes('返回标题'),rail:t.includes('Main System'),top:t.includes('配置推演通道'),titleLeft:!!document.querySelector('[data-title="1"]')}})()`)
  ok('L1 终端连接 → 仅设置一页（含返回标题 · 无侧边栏 Main System）', setupProbe.settings === true && setupProbe.back === true && setupProbe.rail === false && setupProbe.top === true && setupProbe.titleLeft === false, JSON.stringify(setupProbe))
  await goto('返回标题')
  await poll(`!!document.querySelector('[data-title="1"]')`, 15000, 'L back to title')
  const backProbe = await ev(`(()=>{const t=document.body.innerText;return {title:!!document.querySelector('[data-title="1"]'),gone:!t.includes('SETUP / CHANNEL')}})()`)
  ok('L2 返回标题按钮 → 回到标题菜单', backProbe.title === true && backProbe.gone === true, JSON.stringify(backProbe))
  // P10：标题页「自动存档 · 读取」直载（不必绕「行动继续」）
  const autoReady = await ev(`(()=>{const c=document.querySelector('[data-autosave-card]');if(!c)return null;const b=[...c.querySelectorAll('button')].find(x=>x.textContent.trim()==='读取');return {disabled:b?b.disabled:null,txt:c.innerText}})()`)
  ok('L3 有自动档 → 该条显示时间与段数、「读取」可用', !!autoReady && autoReady.disabled === false && /已收束\s*\d+\s*段/.test(autoReady.txt), JSON.stringify(autoReady))
  await ev(`(()=>{const c=document.querySelector('[data-autosave-card]');const b=c&&[...c.querySelectorAll('button')].find(x=>x.textContent.trim()==='读取');if(!b)return false;b.click();return true})()`)
  await poll(`!!document.querySelector('.app--stage')`, 30000, 'L4 autosave load mounts shell')
  const autoLoaded = await ev(`(()=>{const o=JSON.parse(localStorage.getItem('zts-terminal:v3')||'{}');return {shell:!!document.querySelector('.app--stage'),ep:Object.keys(o.epDone||{}).length,title:!!document.querySelector('[data-title="1"]')}})()`)
  ok('L4 点「读取」→ 以自动档进终端（含进度 · 离开标题页）', !!autoLoaded && autoLoaded.shell === true && autoLoaded.title === false && autoLoaded.ep > 0, JSON.stringify(autoLoaded))

  /* ============ Phase M：管理预设（指令条目 + 世界书调配） ============ */
  console.log('\n[Phase M] 管理预设：指令条目开关 · 世界书滤网独立 · 生效快照')
  const mSeed = await ev(`(()=>{
    const entries=[
      {id:'m1',name:'叙述人称',kind:'行为',position:'pre',content:'第三人称限知。',enabled:true,constant:true,keys:[],order:10},
      {id:'m2',name:'文本格式',kind:'格式',position:'post',content:'对白用「」。',enabled:true,constant:true,keys:[],order:20}
    ];
    localStorage.setItem('zts-schemes:v1',JSON.stringify([{id:'mscheme',name:'冒烟预设',
      main:{baseUrl:'http://x',model:'m',temperature:0.7,maxTokens:1500},
      sms:{baseUrl:'http://x',model:'m',temperature:0.7,maxTokens:1500},
      activeLoreIds:[],loreEntryOff:{},entries}]));
    localStorage.setItem('zts-active-preset:v1',JSON.stringify({id:'mscheme',name:'冒烟预设',entries}));
    localStorage.setItem('zts-terminal:v3',JSON.stringify({unlocked:true,epDone:{'v1-1':true,'v1-2':true},cur:'v1-2',operatorName:'预设管理员',focusId:'gcn'}));
    localStorage.setItem('zts-plot:v1',JSON.stringify({}));
    localStorage.setItem('zts-tavern:v1',JSON.stringify({}));
    return true})()`)
  ok('M0 播种一份带指令条目的预设（并使其生效）', mSeed === true, 'seed=' + mSeed)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('终端设置')
  await poll(`document.body.innerText.includes('管理预设')`, 15000, 'M settings mounted')
  ok('M1 设置页方案行出现「管理预设」入口', (await ev(clickTxt('管理预设'))) === true, '')
  await poll(`!!document.querySelector('[data-preset-panel]')`, 12000, 'M preset panel')
  const mOpen = await ev(`(()=>{const p=document.querySelector('[data-preset-panel]');if(!p)return {open:false};
    const rows=p.querySelectorAll('[data-preset-entry]');
    return {open:true,rows:rows.length,tabs:p.querySelectorAll('[data-preset-tab]').length,
      sw:!!p.querySelector('[data-preset-sw="m1"]'),txt:p.innerText.includes('叙述人称')}})()`)
  ok('M2 面板展开：两条指令条目 + 两个 Tab', mOpen.open === true && mOpen.rows === 2 && mOpen.tabs === 2 && mOpen.sw === true, JSON.stringify(mOpen))

  // 关掉一条 → 保存 → 生效快照里该条应为 enabled:false
  await ev(`(()=>{document.querySelector('[data-preset-sw="m1"]').click();return true})()`)
  await sleep(200)
  ok('M3 点开关 → 保存到预设', (await ev(clickTxt('保存到预设'))) === true, '')
  const mSaved = await ev(`(()=>{try{
    const sch=JSON.parse(localStorage.getItem('zts-schemes:v1'))[0];
    const act=JSON.parse(localStorage.getItem('zts-active-preset:v1'));
    const e1=(sch.entries||[]).find(x=>x.id==='m1'), a1=(act.entries||[]).find(x=>x.id==='m1');
    return {panelGone:!document.querySelector('[data-preset-panel]'),schOff:e1&&e1.enabled===false,actOff:a1&&a1.enabled===false,lore:!!sch.loreEntryOff}
  }catch(e){return {err:String(e)}}})()`)
  ok('M4 保存后：方案里的 m1 已关闭，且生效快照同步为关闭', mSaved.schOff === true && mSaved.actOff === true, JSON.stringify(mSaved))
  ok('M5 保存后关闭面板，世界书滤网字段仍在（两种配置互不覆盖）', mSaved.panelGone === true && mSaved.lore === true, JSON.stringify({ gone: mSaved.panelGone, lore: mSaved.lore }))

  // 再开一次 → 世界书 Tab 仍在（世界书调配未被本次改动破坏）
  await ev(clickTxt('管理预设'))
  await poll(`!!document.querySelector('[data-preset-panel]')`, 12000, 'M reopen panel')
  await ev(`(()=>{const b=document.querySelector('[data-preset-tab="lore"]');if(b)b.click();return true})()`)
  await sleep(300)
  const mLore = await ev(`(()=>{const p=document.querySelector('[data-preset-panel]');const t=p?p.innerText:'';return {on:!!document.querySelector('[data-preset-tab="lore"]'),body:t.includes('世界书')&&(t.includes('已接管')||t.includes('未接管')||t.includes('左列选择一本书'))}})()`)
  ok('M6 世界书调配 Tab 独立可用（滤网未被条目改动波及）', mLore.on === true && mLore.body === true, JSON.stringify(mLore))

  /* ============ Phase N：回合制任务作战（慢启动门 · 演出 · 成文归档） ============ */
  console.log('\n[Phase N] 回合制作战：出击 → 慢启动门 → 收场成文 → 作战记录')
  await ev(`(()=>{
    localStorage.setItem('zts-terminal:v3',JSON.stringify({
      unlocked:true,epDone:{'v1-1':true,'v1-2':true,'v1-3':true},cur:'v1-3',
      operatorName:'作战观察员',focusId:'gcn',
      world:{offset:{},flags:{},met:{hikari:true,luna:true,mefisa:true,nyau:true},ends:{},own:[],pick:{},records:[]}
    }));
    return true})()`)
  // 掐掉此前各段留下的接口存根 → 收场成文走模板路径（离线也要能成文）
  await ev(`(async()=>{try{const db=await new Promise(res=>{const r=indexedDB.open('zts-terminal-store');r.onsuccess=()=>res(r.result)});
    await new Promise(res=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').delete('api:main');t.oncomplete=()=>res(true)});return true}catch(e){return String(e)}})()`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await boot()
  await goto('任务简报')
  await poll(`!!document.querySelector('[data-squad-stamina]')`, 15000, 'N missions mounted')
  const nBoard = await ev(`(()=>{const b=document.querySelector('[data-battle-records]');const s=document.querySelector('[data-squad-stamina]');
    const card=document.querySelector('[data-mission="mst116"]');return {rec:!!b,stam:!!s,sortie:!!(card&&card.querySelector('[data-sortie]')),txt:s?s.innerText:''}})()`)
  ok('N1 任务板：体力条 + 作战记录区 + 每卡「出击」入口', nBoard.rec === true && nBoard.stam === true && nBoard.sortie === true, JSON.stringify(nBoard))
  const spBefore = (nBoard.txt.match(/(\d+)\/100/) || [])[1] || ''

  // 出击 → 编队（只留恋兔光，保证慢启动门可被完整观测）
  await ev(`(()=>{const b=document.querySelector('[data-mission="mst116"] [data-sortie]');if(b)b.click();return true})()`)
  await poll(`!!document.querySelector('[data-sortie-briefing]')`, 10000, 'N briefing')
  ok('N2 编队面板打开', true, '')
  for (let i = 0; i < 6; i++) {
    const off = await ev(`(()=>{const b=document.querySelector('[data-sortie-briefing] [data-pick][data-on]:not([data-pick="hikari"])');if(!b)return false;b.click();return true})()`)
    if (!off) break
    await sleep(120)
  }
  await ev(`(()=>{const b=document.querySelector('[data-sortie-briefing] [data-pick="hikari"]');if(b&&!b.hasAttribute('data-on'))b.click();return true})()`)
  await sleep(150)
  await ev(`(()=>{const b=document.querySelector('[data-launch]');if(b)b.click();return true})()`)
  await poll(`!!document.querySelector('[data-battle]')`, 12000, 'N battle mounted')
  ok('N3 出击 → 全屏作战界面挂载', true, '')

  // 驱动战斗：每轮挑「启动 → 普攻 → 技能 → 其余」中第一个可用的，再点敌阵选目标
  const until = async (expr, ms = 9000) => {
    const t0 = Date.now()
    for (;;) {
      const v = await ev(expr)
      if (v) return v
      if (Date.now() - t0 > ms) return null
      await sleep(180)
    }
  }
  let gateLocked = false, gateUnlocked = false, lastKindSet = []
  let steps = 0
  while (steps++ < 120) {
    const ready = await until(`(()=>{if(document.querySelector('[data-battle-result]'))return 'result';if(document.querySelector('[data-skill-list]'))return 'act';return ''})()`)
    if (!ready || ready === 'result') break
    const info = await ev(`(()=>{const l=document.querySelector('[data-skill-list]');if(!l)return null;
      return {who:l.getAttribute('data-actor'),kinds:[...l.querySelectorAll('[data-skill]')].map(b=>b.getAttribute('data-kind'))}})()`)
    if (!info) { await sleep(250); continue }
    if (info.who === 'hikari') {
      lastKindSet = info.kinds
      if (!info.kinds.includes('普攻') && !info.kinds.includes('技能')) gateLocked = true
      if (info.kinds.includes('普攻')) gateUnlocked = true
    }
    const clicked = await ev(`(()=>{const l=document.querySelector('[data-skill-list]');if(!l)return false;
      const pick=(k)=>{const b=l.querySelector('[data-skill][data-kind="'+k+'"]:not([disabled])');if(b){b.click();return true}return false};
      if(pick('启动')||pick('普攻')||pick('技能'))return true;
      const any=l.querySelector('[data-skill]:not([disabled])');if(any){any.click();return true}return false})()`)
    if (!clicked) { await sleep(300); continue }
    await sleep(220)
    const phase = await until(`(()=>{if(document.querySelector('[data-battle-result]'))return 'result';
      if(document.querySelector('[data-battle-aim]'))return 'aim';
      if(document.querySelector('[data-skill-list]'))return 'back';return ''})()`, 5000)
    if (phase === 'aim') {
      await ev(`(()=>{const u=document.querySelector('[data-unit][data-side="enemy"]:not([data-down])');if(u)u.click();return true})()`)
      await sleep(260)
    }
    if (phase === 'result') break
    if (!phase) await sleep(400)
  }
  ok('N4 恋兔光打满 5 次启动技前，普攻与技能均不解禁（慢启动门）', gateLocked === true && lastKindSet.length > 0, JSON.stringify(lastKindSet))
  ok('N5 打满 5 次后普攻解禁', gateUnlocked === true, JSON.stringify(lastKindSet))

  await until(`!!document.querySelector('[data-battle-result]')`, 25000)
  const nRes = await ev(`(()=>{const b=document.querySelector('[data-battle-result]');if(!b)return null;
    const n=document.querySelector('[data-battle-narrative]');const t=n?n.textContent:'';
    return {outcome:b.getAttribute('data-battle-result'),len:t.length,four:['部署意图','达成手段','动作经过','现场'].filter(k=>t.includes(k)).length}})()`)
  ok('N6 收场：战果面板出现，成文含四段式（部署意图/达成手段/动作经过/现场）', !!nRes && nRes.len > 60 && nRes.four === 4, JSON.stringify(nRes))
  ok('N6b 解禁后由「普攻」了结战斗（慢启动门不是摆设）', nRes && nRes.outcome === '胜', JSON.stringify(nRes && nRes.outcome))
  await ev(clickTxt('归档并返回任务板'))
  await poll(`!document.querySelector('[data-battle]')`, 12000, 'N battle closed')
  await poll(`document.querySelectorAll('[data-battle-record]').length>=1`, 12000, 'N record listed')
  const nRec = await ev(`(()=>{const r=document.querySelector('[data-battle-record]');const s=document.querySelector('[data-squad-stamina]');
    return {n:document.querySelectorAll('[data-battle-record]').length,out:r?r.getAttribute('data-outcome'):null,stam:s?s.innerText:''}})()`)
  ok('N7 归档后作战记录里出现该场（带胜负与成文）', nRec.n >= 1 && (nRec.out === '胜' || nRec.out === '败'), JSON.stringify({ n: nRec.n, out: nRec.out }))
  const spAfter = (nRec.stam.match(/(\d+)\/100/) || [])[1] || ''
  ok('N8 出战消耗体力（只在执行任务时扣）', spBefore !== '' && spAfter !== '' && Number(spAfter) < Number(spBefore), `before=${spBefore} after=${spAfter}`)

  // 展开该条 → 逐回合底稿应真实记录本场（成文的依据）
  await ev(`(()=>{const b=document.querySelector('[data-battle-record] button');if(b)b.click();return true})()`)
  await sleep(500)
  const nDig = await ev(`(()=>{const p=document.querySelector('[data-battle-record] pre');const t=p?p.textContent:'';
    return {hasTurn:t.includes('R1 '),hasNo:t.includes('MST-116'),hasUnseal:t.includes('解封试音')||t.includes('解禁'),len:t.length}})()`)
  ok('N9 作战记录里留档逐回合底稿（本场编号 + 回合动作，成文即据它而写）',
    !!nDig && nDig.hasTurn === true && nDig.hasNo === true && nDig.hasUnseal === true, JSON.stringify(nDig))

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
