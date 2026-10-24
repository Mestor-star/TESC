/* ============================================================
   手机档逐屏点名 —— 13 个视图在真手机视口下各看一遍，
   **自己报出谁横向溢出**，不靠人眼扫截图。

   用法: node scripts/look-screens.mjs [width] [height]
         node scripts/look-screens.mjs 390 844
         node scripts/look-screens.mjs 430 932
         node scripts/look-screens.mjs 360 800

   与 look-mobile.mjs 的分工：那个走「任务简报 → 编队面板 → 作战屏」
   那两条深路（量高度、量 grid、拍图）；这个是**铺满 11 屏**的横切面，
   只问一句「这屏在手机上撑破了吗」，答完就下一屏。

   输出是给人也给脚本看的：每屏一行 VIEW <名> ... ok|SPILL，
   溢出的东西接着缩进列出（tag.类名 宽 超出 文字）。
   退出码 1 表示至少有一屏溢出。
   ============================================================ */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
/* 默认 localhost 不是 127.0.0.1：本机 node 把 localhost 解析到 ::1，vite dev 只绑 [::1]。 */
const URL_ = process.env.ZTS_URL || 'http://localhost:5174/'
const VW = Number(process.argv[2] || 390)
const VH = Number(process.argv[3] || 844)
const OUT = process.argv[4] || path.join(tmpdir(), 'zts-screens')
const DBG = Number(process.env.DBG || 9248)
const TAG = VW + 'x' + VH
const SHOTS = process.env.SHOTS !== '0'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

/* 13 屏，按导航那一排的原名点名（goto 就是按按钮文字找）。
   名字与 src/App.tsx 的 NAV 一字不差 —— 那儿改了名，这儿跟着改。 */
const SCREENS = [
  '终端总览', '剧情推进', '地图', '低语者日志', '情景记忆库', '智库', '武装图鉴',
  '研究', '角色', '任务简报', '终末图鉴', '短信', '终端设置',
]

let cdp
const ev = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
const shot = async (name) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const p = path.join(OUT, TAG + '-' + name + '.png')
  writeFileSync(p, Buffer.from(r.data, 'base64'))
  return p
}
async function poll(expr, ms = 30000, label = 'poll') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const v = await ev(expr); if (v) return v; await sleep(200) }
  throw new Error('poll timeout: ' + label)
}

/* ---------- 横向溢出点名（与 look-mobile.mjs 同一把尺，两处口径不许分叉） ----------
   手机档最常见、也最难一眼看出来的毛病就是「有个东西撑宽了页面」：
   屏幕本身看着正常，右边缘却多出一截能左右滑的空白。
   祖先里只要有一个自己就能横滑的容器（overflow-x: auto/scroll），
   里面的东西伸得比视口宽就是它存在的方式，不算毛病 —— 底部那条模块横滑条
   整排都比视口宽，全报出来是纯噪音。 */
const OVERFLOW_PROBE = `(()=>{
  const vw = document.documentElement.clientWidth;
  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  const out = [];
  const walk = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) {
      const cls = (el.className && typeof el.className === 'string')
        ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      const over = Math.round(Math.max(r.right - vw, -r.left));
      if ((r.width > vw + 2 || over > 2) && !inScroller(el)) {
        out.push({ tag: el.tagName.toLowerCase(), cls, w: Math.round(r.width), over,
          left: Math.round(r.left), top: Math.round(r.top),
          txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) });
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  const seen = new Set();
  const top = out.filter((o) => {
    const k = o.tag + '|' + o.cls + '|' + o.w;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return { vw, docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, spills: top.slice(0, 12) };
})()`

/* 一屏再看两件事：正文宽度、正文左右内边距。后一个是「手机档到底吃没吃到宽」
   的读数 —— 28px 的边距在 390 屏上就是 14% 的正文。 */
const PAD_PROBE = `(()=>{
  const v = document.querySelector('.vpage');
  if (!v) return null;
  const r = v.getBoundingClientRect();
  const cs = getComputedStyle(v);
  return { vw: document.documentElement.clientWidth, w: Math.round(r.width), left: Math.round(r.left),
    padL: cs.paddingLeft, padR: cs.paddingRight, padB: cs.paddingBottom };
})()`

/* ---------- 触控目标点名 ----------
   手指头上 44×44 是舒服，24×24 是抠门的下限（WCAG 2.2 AA 的 Target Size）。
   这里把整屏的可点件量一遍，按「标签 + 类名 + 尺寸」归并成几组报出来 ——
   一屏三十枚 28px 高的图标钮，逐条列是噪音，归并之后才看得见「是哪一套控件小」。 */
const TAP_PROBE = `(()=>{
  const SEL = 'button, a[href], [role="button"], [role="tab"], input, select, textarea, summary';
  const all = new Map();
  let total = 0;
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    if (r.bottom < -40 || r.top > window.innerHeight + 3000) continue;
    const cls = (el.className && typeof el.className === 'string') ? el.className.split(/\s+/).filter(Boolean).slice(0,2).join('.') : '';
    /* 输入件要带上 type / name / 父级类名，否则「一个 18px 高的 input」根本定位不到。 */
    const what = el.tagName.toLowerCase() === 'input'
      ? el.tagName.toLowerCase() + '[' + (el.getAttribute('type') || 'text') + (el.getAttribute('name') ? ' name=' + el.getAttribute('name') : '') + ']' +
        (el.parentElement && typeof el.parentElement.className === 'string' ? '@' + el.parentElement.className.split(/\s+/).filter(Boolean).slice(0,1) : '')
      : el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    const key = what + '|' + Math.round(r.width) + 'x' + Math.round(r.height);
    const g = all.get(key) || { key, w: Math.round(r.width), h: Math.round(r.height), n: 0,
      txt: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,18), aria: el.getAttribute('aria-label') || '' };
    g.n++; all.set(key, g); total++;
  }
  const list = [...all.values()];
  const under = (w) => list.filter(g => (g.w < w || g.h < w)).sort((a,b) => b.n - a.n);
  return { total, tiny: under(24).slice(0, 8), small: under(44).filter(g => g.w >= 24 && g.h >= 24).slice(0, 10),
    tinyN: under(24).reduce((s,g)=>s+g.n,0), smallN: under(44).reduce((s,g)=>s+g.n,0) };
})()`

/* ---------- 字号点名 ----------
   桌面 11px 的标签在手机上是「看着累但能读」和「根本读不了」之间的那一条。
   这里只抓 <12px 的文字块，按「标签 + 类名 + 字号」归并。 */
const FONT_PROBE = `(()=>{
  const bad = new Map();
  let n = 0;
  const walk = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const t = (node.textContent || '').trim();
        if (t.length < 2) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12) {
          const cls = (el.className && typeof el.className === 'string') ? el.className.split(/\s+/).filter(Boolean).slice(0,2).join('.') : '';
          const key = el.tagName.toLowerCase() + (cls ? '.' + cls : '') + '|' + fs + 'px';
          const g = bad.get(key) || { key, n: 0, txt: t.slice(0,20) };
          g.n++; bad.set(key, g); n++;
        }
      } else if (node.nodeType === 1) walk(node);
    }
  };
  walk(document.body);
  return { n, groups: [...bad.values()].sort((a,b) => b.n - a.n).slice(0, 10) };
})()`

async function skipPv() {
  for (let i = 0; i < 60; i++) {
    const r = await ev(`(()=>{
      if (!document.querySelector('[data-pv]')) return 'clear'
      const b = document.querySelector('[data-pv-skip]')
      if (b) { b.click(); return 'skip' }
      return 'wait'
    })()`)
    if (r === 'clear') return
    await sleep(120)
  }
  throw new Error('skipPv: 开场影像没退场')
}
async function pressAt(sel) {
  const r = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;const b=el.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`)
  if (!r) return null
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
  await sleep(80)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
  return r
}
async function reachTitle() {
  await poll(`!!document.querySelector('[data-boot-card]') || !!document.querySelector('[data-title="1"]')`, 25000, 'boot card')
  await skipPv()
  if (await ev(`!!document.querySelector('[data-title="1"]')`)) return
  if (!(await pressAt('[data-start-game]'))) throw new Error('reachTitle: 「点击进入游戏」不在')
  await poll(`!!document.querySelector('[data-title="1"]')`, 25000, 'title menu')
}
async function boot() {
  await reachTitle()
  const pick = await ev(`(()=>{const bs=[...document.querySelectorAll('[data-title="1"] button')];
    const cont=bs.find(b=>b.textContent&&b.textContent.includes('行动继续'));
    const el=(cont&&!cont.disabled)?cont:bs.find(b=>b.textContent&&b.textContent.includes('行动开始'));
    if(!el)return null;const r=el.getBoundingClientRect();
    return {kind:el===cont?'continue':'start',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  if (!pick) throw new Error('boot: 标题菜单上没有可用的动作')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pick.x, y: pick.y, button: 'left', clickCount: 1 })
  await sleep(80)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pick.x, y: pick.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('[data-boot-seq]')`, 20000, '接入序列')
  await poll(`!!document.querySelector('.app--stage')`, 30000, '外壳')
  return pick.kind
}
async function goto(viewTxt) {
  const c = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes(${JSON.stringify(viewTxt)}));if(!b)return false;b.click();return true})()`)
  if (!c) throw new Error('goto failed: ' + viewTxt)
  await poll(`!document.querySelector('[data-view-loading]')`, 20000, '视图 chunk: ' + viewTxt)
}
async function reloadFresh() {
  await cdp.send('Page.reload', { ignoreCache: false })
  await sleep(1200)
  await poll(`!!document.querySelector('[data-boot-card]') || !!document.querySelector('[data-title="1"]') || !!document.querySelector('.app--stage')`, 25000, 'reload')
  await skipPv()
}

/* 种子档：与 look-mobile 同一份 —— 结到 v1-5、引导标记跳过（气泡会盖住量尺）。
   各屏要长得满才量得准，所以给足已解锁的人。 */
const SEED = () => ev(`(async()=>{
  localStorage.setItem('zts-terminal:v3', JSON.stringify({
    unlocked:true, epDone:{'v1-1':true,'v1-2':true,'v1-3':true,'v1-4':true,'v1-5':true}, cur:'v1-5',
    operatorName:'手机档观察员', focusId:'gcn',
    world:{offset:{},flags:{},met:{hikari:true,luna:true,mefisa:true,nyau:true,youshihan:true,
      'alive-anatolia':true,'kuro-no-maou':true,reiya:true,'danae-whitmore':true},ends:{},own:[],records:[]}
  }));
  localStorage.setItem('zts-plot:v1', JSON.stringify({}));
  localStorage.setItem('zts-tavern:v1', JSON.stringify({}));
  localStorage.setItem('zts-guide:v1', JSON.stringify({skipped:true}));
  try{const db=await new Promise((res,rej)=>{const r=indexedDB.open('zts-battle');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');
      tx.objectStore('meta').put({key:'gear',value:{brace:1,scope:1,filter:1}});tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
  }catch(e){}
  return true})()`)

const profile = mkdtempSync(path.join(tmpdir(), 'zts-screens-'))
const edge = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--disable-gpu', '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + DBG, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, '--window-size=' + VW + ',' + VH, URL_,
], { stdio: ['ignore', 'ignore', 'ignore'] })

let bad = 0
try {
  let wsUrl = null
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + DBG + '/json/list')).json()
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  console.log('\n== 手机档逐屏点名 · ' + TAG + ' ==')
  await SEED()
  await reloadFresh()
  const kind = await boot()
  console.log('  标题动作 = ' + kind)

  const rows = []
  /* ONLY=终端设置,终末图鉴 只跑点名的几屏，量细节时省一遍全表。 */
  const only = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const name of (only.length ? SCREENS.filter((s) => only.includes(s)) : SCREENS)) {
    await goto(name)
    /* 视图是懒加载的，切过去那一下正文要等一块 chunk；把手给的是
       data-view-loading，但它消失之后还有一次布局 + 字体跟上，量之前各屏统一歇一拍。 */
    await sleep(700)
    const r = await ev(OVERFLOW_PROBE)
    const pad = await ev(PAD_PROBE)
    const isBad = r.docScrollW > r.vw + 1 || r.bodyScrollW > r.vw + 1
    if (isBad) bad++
    const padTxt = pad ? ('vpage=' + pad.w + ' 边距 ' + pad.padL + '/' + pad.padR) : 'vpage=—'
    console.log('VIEW ' + name + '  vw=' + r.vw + ' doc=' + r.docScrollW + ' body=' + r.bodyScrollW +
      '  ' + (isBad ? 'SPILL' : 'ok') + '  ' + padTxt)
    for (const s of r.spills) {
      console.log('      ' + s.tag + '.' + s.cls + '  w=' + s.w + ' 超出=' + s.over + ' left=' + s.left + ' top=' + s.top + '  «' + s.txt + '»')
    }
    const tap = await ev(TAP_PROBE)
    const fo = await ev(FONT_PROBE)
    console.log('      tap 可点=' + tap.total + '  不足24=' + tap.tinyN + '  不足44=' + tap.smallN)
    for (const g of tap.tiny) console.log('        ✗ ' + g.key + ' ×' + g.n + ' «' + (g.txt || g.aria) + '»')
    for (const g of tap.small) console.log('        ~ ' + g.key + ' ×' + g.n + ' «' + (g.txt || g.aria) + '»')
    if (fo.n) {
      console.log('      字号<12px 文字块=' + fo.n)
      for (const g of fo.groups) console.log('        ' + g.key + ' ×' + g.n + ' «' + g.txt + '»')
    }
    rows.push({ name, isBad })
    if (isBad && SHOTS) console.log('      图 ' + (await shot('spill-' + name)))
  }

  const spilled = rows.filter((x) => x.isBad)
  console.log('\n---- 小结 ' + TAG + ' ----')
  console.log('  溢出屏: ' + (spilled.length ? spilled.map((x) => x.name).join(' / ') : '无'))
  console.log('  横向溢出总数 = ' + bad)
  if (bad) process.exitCode = 1
} catch (e) {
  console.error('LOOK-SCREENS ERROR: ' + e.message)
  process.exitCode = 1
} finally {
  try { edge.kill() } catch { /* ignore */ }
  await sleep(300)
}
