/* ============================================================
   看一眼：真浏览器打开开发服务器，走一遍主流程并截图
   用法: node scripts/look.mjs [url] [outDir]
   与 smoke 的区别：smoke 是断言，这个只是**看** —— 落几张图给人看。
   ============================================================ */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL_ = process.argv[2] || 'http://localhost:5174/'
const OUT = process.argv[3] || 'C:\\Users\\matebook14\\AppData\\Local\\Temp\\zts-look'
const DBG = 9244
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

let cdp
const ev = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
const shot = async (name) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const p = path.join(OUT, name + '.png')
  writeFileSync(p, Buffer.from(r.data, 'base64'))
  console.log('  shot  ' + p)
}
async function poll(expr, ms = 30000, label = 'poll') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const v = await ev(expr); if (v) return v; await sleep(200) }
  throw new Error('poll timeout: ' + label)
}

const profile = mkdtempSync(path.join(tmpdir(), 'zts-look-'))
/* --mute-audio：看一眼也不该在用户机器上出声 */
const edge = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--disable-gpu', '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + DBG, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, '--window-size=1440,1000', URL_,
], { stdio: ['ignore', 'ignore', 'ignore'] })

try {
  let wsUrl = null
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && t.url.startsWith(URL_.replace(/\/$/, '')))
      if (page) wsUrl = page.webSocketDebuggerUrl
    } catch { /* retry */ }
    if (!wsUrl) await sleep(300)
  }
  if (!wsUrl) throw new Error('devtools target not found')
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
  cdp = {
    id: 0, pending: new Map(),
    send(method, params = {}) {
      return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
    },
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id == null) return
    const p = cdp.pending.get(m.id); if (!p) return
    cdp.pending.delete(m.id)
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
  }
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  await poll(`!!document.querySelector('[aria-label="认证开屏"]')`, 30000, 'boot screen')
  await sleep(800)
  await shot('01-boot')

  // 长按指纹：按住 2.2 秒再松手
  const r = await ev(`(()=>{const el=document.querySelector('[aria-label="长按指纹以完成认证"]');if(!el)return null;const b=el.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`)
  if (!r) throw new Error('fingerprint button not found')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
  await sleep(2200)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('[data-title="1"]')`, 30000, 'title menu')
  await sleep(900)
  await shot('02-title')

  const act = await ev(`(()=>{const c=[...document.querySelectorAll('button')].find(b=>b.textContent&&b.textContent.includes('行动继续')&&!b.disabled);
    if(c){c.click();return 'continue'}const s=[...document.querySelectorAll('button')].find(b=>b.textContent&&b.textContent.includes('行动开始'));
    if(s){s.click();return 'start'}return 'none'})()`)
  console.log('  title action = ' + act)
  await poll(`!!document.querySelector('.app--stage')`, 30000, 'shell')
  await sleep(1800)
  await shot('03-dashboard')

  const nav = async (label, file) => {
    await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes(${JSON.stringify(label)}));if(!b)return false;b.click();return true})()`)
    await sleep(1400)
    await shot(file)
    const head = await ev(`(()=>{const m=document.querySelector('main');return m?m.innerText.replace(/\\s+/g,' ').slice(0,220):''})()`)
    console.log('  ' + file + ' :: ' + head)
  }
  await nav('剧情推进', '04-plot')
  await nav('角色档案', '05-archive')
  await nav('任务简报', '06-missions')
  await nav('短信', '07-tavern')
  await nav('终端设置', '08-settings')
  const errs = await ev(`(()=>{const e=[];return e})()`)
  console.log('  ok, screenshots in ' + OUT)
} catch (e) {
  console.error('LOOK ERROR: ' + e.message)
  process.exitCode = 1
} finally {
  try { edge.kill() } catch { /* ignore */ }
  await sleep(300)
}
