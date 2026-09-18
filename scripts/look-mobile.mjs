/* ============================================================
   手机档看一眼 —— 真手机视口下走一遍「任务简报 → 编队面板 → 作战屏」，
   落几张图，顺带**自己报出谁横向溢出了**。

   用法: node scripts/look-mobile.mjs [width] [height] [outDir]
         node scripts/look-mobile.mjs 390 844
         node scripts/look-mobile.mjs 430 932
   与 look.mjs 的区别：那个是桌面全流程刷图（且停在改版前的把手上），
   这个是手机档专用 —— 只走战斗那两条路，把「撑破屏幕的东西」点名报出来。
   ============================================================ */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL_ = process.env.ZTS_URL || 'http://127.0.0.1:5174/'
const VW = Number(process.argv[2] || 390)
const VH = Number(process.argv[3] || 844)
const OUT = process.argv[4] || path.join(tmpdir(), 'zts-mobile')
const DBG = 9247
const TAG = `${VW}x${VH}`
/* 横屏档（宽 > 高）**不从横屏启动**：那是真机不会走的路径 ——
   人是竖着拿手机把应用打开的，只有进了作战屏才转横（见 lib/landscape.ts）。
   而且 390 高确实装不下标题菜单那几枚按钮，从横屏启动会卡在开机流程上，
   把「作战屏的横屏排布」这条要验的事挡在后面。
   所以先按竖屏尺寸走完开机 + 编队，**点出击之前**再切成横屏 ——
   既照真机的次序，也顺带验证了 resize 之后的重新布局。 */
const LAND = VW > VH
const BOOT_VW = LAND ? VH : VW
const BOOT_VH = LAND ? VW : VH
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
  const p = path.join(OUT, `${TAG}-${name}.png`)
  writeFileSync(p, Buffer.from(r.data, 'base64'))
  console.log('  shot  ' + p)
}
async function poll(expr, ms = 30000, label = 'poll') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const v = await ev(expr); if (v) return v; await sleep(200) }
  throw new Error('poll timeout: ' + label)
}

/* ---------- 横向溢出点名 ----------
   手机档最常见、也最难一眼看出来的毛病就是「有个东西撑宽了页面」：
   屏幕本身看着正常，右边缘却多出一截能左右滑的空白。
   这里把「谁比视口宽 / 谁的右边缘伸到视口外」逐个列出来，带上它自己的类名与尺寸。 */
const OVERFLOW_PROBE = `(()=>{
  const vw = document.documentElement.clientWidth;
  /* 祖先里只要有一个**自己就能横滑**的容器（overflow-x: auto/scroll），
     里面的东西「伸得比视口宽」就是它存在的方式，不是毛病 ——
     底部那条模块横滑条整排都比视口宽，全报出来是纯噪音。 */
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
  const scrollers = [];
  const walk = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) {
      const cls = (el.className && typeof el.className === 'string')
        ? el.className.split(/\\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      // 能横滑的容器单独记一笔：它内部的东西「比视口宽」是应当的
      if (el.scrollWidth > el.clientWidth + 2 && ['auto','scroll'].includes(getComputedStyle(el).overflowX)) {
        scrollers.push({ cls, w: Math.round(r.width), scrollW: el.scrollWidth });
      }
      const over = Math.round(Math.max(r.right - vw, -r.left));
      if ((r.width > vw + 2 || over > 2) && !inScroller(el)) {
        out.push({ tag: el.tagName.toLowerCase(), cls, w: Math.round(r.width), over,
          txt: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 28) });
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  // 只留「最外层的那几个」—— 父级溢出了，子级必然跟着报，全列出来是噪音
  const seen = new Set();
  const top = out.filter((o) => {
    const k = o.tag + '|' + o.cls + '|' + o.w;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return {
    vw,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    spills: top.slice(0, 14),
    scrollers: scrollers.slice(0, 8),
  };
})()`

async function spill(label) {
  const r = await ev(OVERFLOW_PROBE)
  const bad = r.docScrollW > r.vw + 1 || r.bodyScrollW > r.vw + 1
  console.log(`  [${label}] vw=${r.vw} docScrollW=${r.docScrollW} bodyScrollW=${r.bodyScrollW}  ${bad ? '← 横向溢出' : 'ok'}`)
  for (const s of r.spills) console.log(`      溢出 ${s.tag}.${s.cls}  w=${s.w} 超出=${s.over}  «${s.txt}»`)
  for (const s of r.scrollers) console.log(`      可横滑（应当）${s.cls || '(无名)'} ${s.w}→${s.scrollW}`)
  return r
}

/* 手机上「一屏里够不够得着」也要看一眼：作战屏是定高 flex/grid，窄屏最容易把
   某一栏压成 0 高或者顶出屏幕 —— 这里把几个关键块的实际高度报出来。 */
const BOX_PROBE = (sels) => `(()=>{
  const o = {};
  for (const s of ${JSON.stringify(sels)}) {
    const el = document.querySelector(s);
    if (!el) { o[s] = null; continue; }
    const r = el.getBoundingClientRect();
    o[s] = { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  }
  return { vh: window.innerHeight, boxes: o };
})()`

/* 敌阵体检：敌卡是**要点的**（onClick 挂在自己的 [data-foe-body] 上），
   而 .arena 是 overflow: hidden —— 卡一旦比战场高，多出来的那截既看不见、
   也按不到（见 Battle.module.css 的 .enemyRow 注）。这里把「卡实际多高、
   战场给了多高、上下各被切掉多少」逐张报出来，别再去猜。 */
const FOE_PROBE = `(()=>{
  const arena = document.querySelector('[data-enemy-field]');
  if (!arena) return null;
  const ar = arena.getBoundingClientRect();
  const cards = [...document.querySelectorAll('[data-foe-card]')].map((c) => {
    const r = c.getBoundingClientRect();
    const body = c.querySelector('[data-foe-body]');
    const br = body ? body.getBoundingClientRect() : null;
    return {
      id: c.dataset.foeCard,
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      bodyW: br ? Math.round(br.width) : null,
      bodyH: br ? Math.round(br.height) : null,
      cutTop: Math.round(Math.max(0, ar.top - r.top)),
      cutBottom: Math.round(Math.max(0, r.bottom - ar.bottom)),
    };
  });
  return { arenaTop: Math.round(ar.top), arenaH: Math.round(ar.height), cards };
})()`

/* 作战屏是定高 grid（行高由 `grid-template-rows` 那几支分），窄屏/矮屏下
   最容易出的岔子是「某一行把别人的份额吃了」—— 光看元素高度看不出是谁吃的，
   得把 stage 自己的**行高表**与每个 grid 子项的实际高一起报出来。
   `.stage` 是模块作用域类名（选择器写 `.stage` 选不中），所以按「display: grid
   且写过 grid-template-areas」这个特征认它。 */
const GRID_PROBE = `(()=>{
  const root = document.querySelector('[data-battle]');
  if (!root) return null;
  const stage = [...root.querySelectorAll('div')].find((d) => {
    const c = getComputedStyle(d);
    return c.display === 'grid' && c.gridTemplateAreas && c.gridTemplateAreas !== 'none';
  });
  if (!stage) return { err: '找不到 stage' };
  const kids = [...stage.children].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      area: getComputedStyle(el).gridArea,
      h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top),
    };
  });
  return {
    rows: getComputedStyle(stage).gridTemplateRows,
    cols: getComputedStyle(stage).gridTemplateColumns,
    stageH: Math.round(stage.getBoundingClientRect().height),
    /* 纵向够不够放：放不下时 stage 自己会滚（见横屏档那条兜底），
       滚了多少这一支报出来 —— 只报横向溢出的话这事儿看不见。 */
    scrollH: stage.scrollHeight,
    clientH: stage.clientHeight,
    kids,
  };
})()`

async function gridBox(label) {
  const r = await ev(GRID_PROBE)
  if (!r || r.err) { console.log(`  [${label}] ${r ? r.err : '不在'}`); return r }
  console.log(`  [${label}] stage 高=${r.stageH}  行=${r.rows}  列=${r.cols}` +
    (r.scrollH > r.clientH + 1 ? `  ← 纵向要滚 ${r.scrollH - r.clientH}px` : '  一屏放得下'))
  for (const k of r.kids) console.log(`      ${k.area}  ${k.w}×${k.h}@${k.top}`)
  return r
}

async function foes(label) {
  const r = await ev(FOE_PROBE)
  if (!r) { console.log(`  [${label}] 敌阵不在`); return r }
  console.log(`  [${label}] 战场 top=${r.arenaTop} 高=${r.arenaH}`)
  for (const c of r.cards) {
    const cut = c.cutTop + c.cutBottom
    console.log(`      ${c.id}  卡 ${c.w}×${c.h}@${c.top}  画框 ${c.bodyW}×${c.bodyH}` +
      (cut ? `  ← 被裁 ${cut}px（上 ${c.cutTop} / 下 ${c.cutBottom}）` : '  完整'))
  }
  return r
}

/* 全屏浮层（`.modal` 那一套）靠 `position: fixed; inset: 0` 撑满视口。
   可 **fixed 认的包含块是「最近的带 transform/filter/contain 的祖先」** ——
   任务板外面正好套着会动的那一层，于是它撑的就不再是视口，
   而是那个**很长**的滚动容器；`place-items: center` 再把面板居中到它的正中间，
   一屏的高度就够不着了。这把探针就是把这个「谁当了我的包含块」点名出来。 */
const MODAL_PROBE = `(()=>{
  const m = document.querySelector('[data-sortie-briefing]');
  if (!m) return null;
  const box = m.firstElementChild;
  const chain = [];
  let p = m.parentElement;
  let guard = 0;
  while (p && p !== document.documentElement && guard++ < 12) {
    const c = getComputedStyle(p);
    const bits = [];
    if (c.transform !== 'none') bits.push('transform:' + c.transform);
    if (c.filter !== 'none') bits.push('filter:' + c.filter);
    if (c.perspective !== 'none') bits.push('perspective');
    if (c.contain !== 'none') bits.push('contain:' + c.contain);
    if (c.willChange !== 'auto') bits.push('will-change:' + c.willChange);
    if (c.overflowY === 'auto' || c.overflowY === 'scroll') bits.push('overflow-y:' + c.overflowY);
    if (bits.length) {
      const cls = String(p.className || '').split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
      chain.push(p.tagName.toLowerCase() + (cls ? '.' + cls : '') + '  [' + bits.join(' ') + ']  h=' + Math.round(p.getBoundingClientRect().height));
    }
    p = p.parentElement;
  }
  const mr = m.getBoundingClientRect();
  const br = box ? box.getBoundingClientRect() : null;
  // vpage 自己那份 animation / transform —— 排查「到底是谁给的矩阵」
  const vp = document.querySelector('.vpage');
  const vcs = vp ? getComputedStyle(vp) : null;
  return {
    mPos: getComputedStyle(m).position,
    mRect: { top: Math.round(mr.top), h: Math.round(mr.height) },
    boxRect: br ? { top: Math.round(br.top), h: Math.round(br.height), w: Math.round(br.width) } : null,
    boxMaxH: box ? getComputedStyle(box).maxHeight : null,
    vpageAnim: vcs ? vcs.animationName + ' ' + vcs.animationFillMode + ' ' + vcs.animationDuration : null,
    /* .vpage 那条 riseIn 曾经是**整个手机档最要命的一处**：
       fill-mode: both 让动画收尾后仍把计算值钉在元素上，Chrome 钉的是
       单位矩阵 matrix(1,0,0,1,0,0) —— 一个 transform 不为 none 的元素会成为
       position: fixed 后代的**包含块**，于是编队面板的 inset: 0 从视口
       改成量 .vpage 那个 3227px 高的盒子，一跟头翻到屏幕外。
       已改成 backwards（tokens.css 有注）。这两支留着当哨兵：
       transform 只要不是 none，这病就可能复发。
       ⚠️ 别在这儿做「把动画摘掉再量一次」的对照实验 —— 摘了再装会**重启动画**，
       紧随其后的测量全被那次重启污染（量出来的 top 会跑到几千去）。
       ⚠️ 这段注在模板字面量**里面**，反引号会当场把字符串截断 —— 别写。 */
    vpageTf: vcs ? vcs.transform : null,
    chain,
  };
})()`

async function modalDiag(label) {
  const r = await ev(MODAL_PROBE)
  if (!r) { console.log(`  [${label}] 面板不在`); return r }
  console.log(`  [${label}] .modal position=${r.mPos} 盒=${r.mRect.h}高@${r.mRect.top}` +
    `  panel=${r.boxRect ? r.boxRect.w + '×' + r.boxRect.h + '@' + r.boxRect.top : '—'} maxH=${r.boxMaxH}`)
  console.log(`      .vpage animation=${r.vpageAnim}  transform=${r.vpageTf}`)
  for (const c of r.chain) console.log(`      祖先 ${c}`)
  return r
}

async function boxes(label, sels) {
  const r = await ev(BOX_PROBE(sels))
  const parts = Object.entries(r.boxes).map(([k, v]) => v ? `${k}=${v.w}×${v.h}@${v.top}` : `${k}=—`)
  console.log(`  [${label}] vh=${r.vh}  ${parts.join('  ')}`)
  return r
}

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
  console.log('  标题动作 = ' + pick.kind)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pick.x, y: pick.y, button: 'left', clickCount: 1 })
  await sleep(80)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pick.x, y: pick.y, button: 'left', clickCount: 1 })
  await poll(`!!document.querySelector('[data-boot-seq]')`, 20000, '接入序列')
  await poll(`!!document.querySelector('.app--stage')`, 30000, '外壳')
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

/* 种一份「打得起来」的档：v1-5 结清 → 看板才派单（未结清只挂牌）。
   引导种成已跳过 —— 探针是来看排版不是来看教程的，气泡会挡住截图。 */
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

const profile = mkdtempSync(path.join(tmpdir(), 'zts-mobile-'))
const edge = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--disable-gpu', '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + DBG, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, `--window-size=${VW},${VH}`, URL_,
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
  /* 真视口：--window-size 只是窗口，`mobile:true` 才让页面按手机那套摆放
     （含 `viewport-fit=cover` 与 dvh 的口径），截图也按这个尺寸出。 */
  const metrics = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 2, mobile: true,
  })
  await metrics(BOOT_VW, BOOT_VH)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  console.log(`\n== 手机档看一眼 · ${TAG} ==`)
  await SEED()
  await reloadFresh()
  await boot()
  await goto('任务简报')
  await poll(`!!document.querySelector('[data-squad-stamina]')`, 20000, '任务简报挂载')
  await sleep(500)
  await shot('00-missions')
  await spill('任务简报')

  // 接取 → 出击 → 编队面板
  const picked = await ev(`(()=>{const b=document.querySelector('[data-act="接取"]');if(!b)return false;b.click();return true})()`)
  console.log('  接取 = ' + picked)
  await sleep(700)
  /* 「出击」要挑**巡逻卡**上那一枚（`[data-mission]` 里）。
     主线卡（`data-mainline-mission`）上同名的那颗走的是 `navigate('plot')`，
     点错了会一头扎进剧情页，编队面板根本不出现。 */
  const sortie = await ev(`(()=>{
    const card=[...document.querySelectorAll('[data-mission]')].find(c=>c.querySelector('[data-sortie]:not([disabled])'));
    if(!card)return false;
    card.querySelector('[data-sortie]:not([disabled])').click();return true})()`)
  console.log('  出击 = ' + sortie)
  if (!sortie) {
    await shot('01-no-sortie')
    await spill('没找到出击')
    throw new Error('看板上没有可出击的任务 —— 编队面板打不开')
  }
  await poll(`!!document.querySelector('[data-sortie-briefing]')`, 12000, '编队面板')
  await sleep(600)
  await shot('01-sortie-top')
  await spill('编队面板·顶部')
  await modalDiag('编队面板')
  await boxes('编队面板', ['[data-sortie-briefing]', '[data-bond-pane]', '[data-briefing-gear]', '[data-launch]'])

  // 左栏羁绊 / 右栏名单 / 装备 三段各自滚到底再拍
  await ev(`(()=>{const p=document.querySelector('[data-bond-pane]');if(p)p.scrollTop=p.scrollHeight;return true})()`)
  await sleep(300)
  await shot('02-sortie-bond-bottom')
  await ev(`(()=>{const m=document.querySelector('[data-sortie-briefing] [class*=briefMain]');if(m)m.scrollTop=m.scrollHeight;return true})()`)
  await sleep(300)
  await shot('03-sortie-main-bottom')
  await spill('编队面板·滚到底')

  // 横屏档：到这里才转（真机的次序 —— 竖着拿进来，出击那一下才转过去）
  if (LAND) {
    await metrics(VW, VH)
    await sleep(500)
    await shot('03b-land-sortie')
  }

  // 出击 → 作战屏
  await ev(`(()=>{const b=document.querySelector('[data-launch]');if(b)b.click();return true})()`)
  await poll(`!!document.querySelector('[data-battle]')`, 20000, '作战屏')
  await sleep(1500)
  await shot('04-battle')
  await spill('作战屏')
  await boxes('作战屏', ['.stage', 'header', '[data-enemy-field]', '[data-battle-log]', '[data-battle-cmd]'])
  await gridBox('作战屏')
  await foes('作战屏')

  console.log('\n  完成，图在 ' + OUT)
} catch (e) {
  console.error('LOOK-MOBILE ERROR: ' + e.message)
  try { await shot('99-error') } catch { /* ignore */ }
  process.exitCode = 1
} finally {
  try { edge.kill() } catch { /* ignore */ }
  await sleep(300)
}
