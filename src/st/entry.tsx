/**
 * st/entry.ts — SillyTavern 网页扩展入口（ST 专用产物线，见 vite.st.config.ts）。
 *
 * 只在酒馆宿主内运行（window.SillyTavern.getContext 存在才挂载，宿主探测=host.ts isST）。
 * 形态：
 *   - document.body 挂一个浮动入口钮（light DOM，始终可点，用 [data-zts-shell] 选择器收窄样式）；
 *   - 一个全屏容器，内挂 closed-shadow，把既有 <App/> 整体复用进 shadow（含 Boot 开屏、
 *     各视图/词条库/设置），与酒馆页面 DOM/样式零污染。
 *   - 开启后 cover 酒馆；收起后回到酒馆页面。App 常驻不卸载，auth/剧情进度保持。
 *
 * 样式三路，全收在 shadow 内：
 *   1) tokens.css 经 ?inline 取原文 → scopeTokens() 把 :root/body/#root 落到壳根 .zts-root，
 *      因为 shadow 内这些顶层选择器不会匹配任何元素（shadow 根是 ShadowRoot，非元素）。
 *   2) index.css（字体 @font-face + 各 CSS Modules 哈希类）以 shadow 内 <link> 载入，url() 相对
 *      index.css 位置解析 → 字体资产可离线。不注入酒馆 document，零污染。
 *
 * 独立态从不 import 本文件（入口是 index.html → main.tsx）。
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 本地字体（避免依赖被墙 CDN；@font-face 进 index.css，由 shadow 内 <link> 载入）
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/jetbrains-mono/800.css'

import tokensCss from '../styles/tokens.css?inline'
import App from '../App'
import { isST } from './host'

const SHELL_CLASS = 'zts-root'
const CSS_FILE = 'index.css'

/** 浮动出入口样式：只收窄到 [data-zts-shell]，避免污染酒馆页面 */
const LIGHT_CSS = `
[data-zts-shell="toggle"] {
  position: fixed !important;
  right: 16px !important;
  bottom: 16px !important;
  z-index: 2147483001 !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 0 6px 0 14px !important;
  height: 40px !important;
  border: 1px solid #343652 !important;
  background: #12121f !important;
  color: #edebf6 !important;
  font: 700 12px/1 "Inter","Microsoft YaHei",system-ui,sans-serif !important;
  letter-spacing: 0.14em !important;
  cursor: pointer !important;
  clip-path: polygon(9px 0,100% 0,calc(100% - 9px) 100%,0 100%) !important;
  user-select: none !important;
}
[data-zts-shell="toggle"]:hover { border-color: #ff2e43 !important; }
[data-zts-shell="toggle"] i {
  font-style: normal !important;
  font-size: 10px !important;
  letter-spacing: 0.2em !important;
  color: #ff2e43 !important;
  border-left: 1px solid #232438 !important;
  padding-left: 9px !important;
  margin-left: 4px !important;
}
`

function scopeTokens(css: string): string {
  // :root/body/#root 顶层规则 → 壳根类；仅作用域化这些选择器，其余（.btn/.panel/*/::selection…）
  // 在 shadow 内本就只命中 shadow 子树，不动。
  let out = css
  out = out.split(':root').join(`.${SHELL_CLASS}`)
  out = out.replace(/(^|[,\s{])body(?=[\s,:{])/g, `$1.${SHELL_CLASS}`)
  out = out.replace(/(^|[,\s{])#root(?=[\s,:{])/g, `$1.${SHELL_CLASS}`)
  return out
}

let hostEl: HTMLDivElement | null = null
let toggleEl: HTMLButtonElement | null = null
let wrapEl: HTMLDivElement | null = null
let root: ReturnType<typeof createRoot> | null = null
let open = false

function appendLightCss(): void {
  if (document.querySelector('style[data-zts-shell="css"]')) return
  const s = document.createElement('style')
  s.setAttribute('data-zts-shell', 'css')
  s.textContent = LIGHT_CSS
  document.head.appendChild(s)
}

function applyToggleLabel(): void {
  if (!toggleEl) return
  toggleEl.innerHTML = open ? '收起终端<i>回酒馆</i>' : '停滞观测终端<i>进入</i>'
}

function setOpen(next: boolean): void {
  open = next
  if (hostEl) hostEl.style.display = next ? 'block' : 'none'
  applyToggleLabel()
}

function buildToggle(): void {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.setAttribute('data-zts-shell', 'toggle')
  btn.title = open ? '收起终端，回到酒馆' : '进入停滞观测终端'
  btn.addEventListener('click', () => setOpen(!open))
  document.body.appendChild(btn)
  toggleEl = btn
  applyToggleLabel()
}

function buildHost(): void {
  if (!hostEl) {
    const host = document.createElement('div')
    host.setAttribute('data-zts-shell', 'host')
    host.style.position = 'fixed'
    host.style.inset = '0'
    host.style.zIndex = '2147483000'
    host.style.display = 'none'
    document.body.appendChild(host)
    hostEl = host

    const shadow = host.attachShadow({ mode: 'closed' })

    // 1) scoped 设计令牌 + 顶层重置
    const st = document.createElement('style')
    st.textContent = scopeTokens(tokensCss)
    shadow.appendChild(st)

    // 2) 字体 @font-face + 各视图 CSS Modules 哈希类（url() 相对 index.css → 资产可离线）
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(CSS_FILE, import.meta.url).href
    shadow.appendChild(link)

    // 3) 复用整份 <App/>
    const wrap = document.createElement('div')
    wrap.className = SHELL_CLASS
    shadow.appendChild(wrap)
    wrapEl = wrap
    root = createRoot(wrap)
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }
}

/**
 * 挂载入口（幂等）。仅宿主态执行；独立态/无宿主页面不挂（也不该挂到陌生页面）。
 * 默认收起——酒馆页面照常可用，点浮动钮进入终端。
 */
export function mountShell(): void {
  if (!isST()) return
  if (document.querySelector('[data-zts-shell="host"]')) return
  appendLightCss()
  buildHost()
  buildToggle()
  setOpen(false)
}

/** 宿主态可由外部（Settings「展开」/测试桩）编程开合 */
export interface ShellApi {
  isHost: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const shellApi: ShellApi = {
  get isHost() {
    return isST()
  },
  open: () => {
    mountShell()
    setOpen(true)
  },
  close: () => setOpen(false),
  toggle: () => {
    if (!open) mountShell()
    setOpen(!open)
  },
}

// 扩展 js 作为 ESM 注入酒馆主 DOM：模块顶层即执行。早于 APP_READY 无妨（只挂 UI）。
mountShell()

/**
 * 测试桩驱动器（ST-5 宿主桩冒烟用）：封闭 shadow 外部无法 querySelector，桩页需要
 * 在壳内点按钮/输文字/长按指纹。生产无用也无害（仅在窗口侧挂一个引用）。
 */
function initDriver(): void {
  if (!wrapEl) return
  const w = () => wrapEl as HTMLDivElement
  const press = (el: Element | null, type: 'pointerdown' | 'pointerup'): void => {
    if (!el) return
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
        button: 0,
        clientX: 20,
        clientY: 20,
      }),
    )
  }
  const driver = {
    has: (t: string): boolean => w().textContent?.includes(t) ?? false,
    text: (): string => w().textContent ?? '',
    /** 点击 shadow 内文本含 label 的第一个按钮 */
    btn: (label: string): boolean => {
      const els = Array.from(w().querySelectorAll('button'))
      const b = els.find((x) => x.textContent?.includes(label))
      if (!b) return false
      ;(b as HTMLButtonElement).click()
      return true
    },
    /** 给 shadow 内受控输入赋 React 兼容值（原生 setter + input 事件） */
    setInput: (sel: string, text: string): boolean => {
      const el = w().querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)
      if (!el) return false
      const proto: unknown = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto as object, 'value')?.set
      if (setter) setter.call(el, text)
      else el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    key: (sel: string, k: string): boolean => {
      const el = w().querySelector(sel)
      if (!el) return false
      const opts: KeyboardEventInit = { key: k, code: k, bubbles: true, cancelable: true }
      el.dispatchEvent(new KeyboardEvent('keydown', opts))
      el.dispatchEvent(new KeyboardEvent('keyup', opts))
      return true
    },
    /** 开屏长按指纹：pointerdown → 等待 dur 毫秒 → pointerup */
    finger: async (dur = 2000): Promise<boolean> => {
      const el = w().querySelector('[aria-label*="指纹"], [data-fp]')
      if (!el) return false
      press(el, 'pointerdown')
      await new Promise((r) => setTimeout(r, dur))
      press(el, 'pointerup')
      return true
    },
  }
  try {
    ;(window as unknown as Record<string, unknown>).__ztsDriver = driver
  } catch {
    /* 忽略 */
  }
}

// 暴露给测试桩 / 后续宿主态代码（不打进独立态包）
try {
  ;(window as unknown as Record<string, unknown>).__ztsShell = shellApi
  initDriver()
} catch {
  /* 忽略 */
}
