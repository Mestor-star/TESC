/* ============================================================
   角色本色的「浅底可读」版
   ------------------------------------------------------------
   底档里的 `hue`（`data/chars.ts`、`data/castmeta.ts`、`battle/bosses.ts` …）
   是**给黑底挑的**：浅粉、浅青、浅金那一批，压在 #07070c 上正好发亮。
   2026-09-15 整体改版把底换成晨光白之后，同一批颜色**当文字**用就糊了 ——
   最浅的 `#cfcfef` 在白底上只有 1.52:1，写出来几乎看不见。

   所以：**当装饰照旧用原色**（边框、底纹、渐变、进度条 —— 那些地方浅一点没关系），
   **当文字**才走这里过一道。

   压深的方式是往墨色那一头兑，**色相不动** —— 兑完仍认得出是本人那个颜色。
   目标是 WCAG 正文级对比（默认 4.5:1，对白底与近白底都够用）。

   （不改底档本身：那是「登场序定的主题色」，是设定，不是这一版外形的事。）
   ============================================================ */

/** 墨色 —— 与 tokens.css 的 `--ink` 同值。此处不读 CSS 变量：
 *  这个函数要能在任何字符串上下文里算出确定的结果（也便于 mech 直接量）。 */
const INK = { r: 0x24, g: 0x1f, b: 0x3a }
const REF = { r: 0xff, g: 0xff, b: 0xff }

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

const toHex = (c: { r: number; g: number; b: number }) =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** 相对亮度（WCAG 2.1） */
function lum(c: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

function contrast(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const l1 = lum(a)
  const l2 = lum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/**
 * 兑墨时**多退的一点余量**（对比度，不是比例）。
 *
 * 为什么非得留这一手：二分找的是「刚好过线」的那一点，而 `toHex` 最后要把
 * 结果**四舍五入到 8bit** —— 那一下可能把刚过线的值推回线下一点点。
 * 实测 `inkOf('#ff4d79')` 不带余量时算出 4.4996:1（看着是 4.50，其实没过），
 * 于是 mech 里那条「退完必须 ≥ 4.5」的断言就红在一处四位小数上。
 * 留 0.15 之后落在 4.6 上下 —— 肉眼看不出来，量得出来。
 */
const HEADROOM = 0.15

/**
 * 把一个本色换成**当文字能用**的那一支。
 *
 * 认不出的色（空串、`var(--x)`、`rgba(...)`）原样返回 —— 这个函数只负责
 * 「已知是十六进制本色」的那一种，别的地方该由 CSS 变量管。
 *
 * @param hue 底档里的本色（`#rrggbb` / `#rgb`）
 * @param min 目标对比度，默认 4.5（正文级）。要更亮（大字号、标签）可传小些。
 *            实际退到的是 `min + HEADROOM`。
 */
export function inkOf(hue: string | undefined, min = 4.5): string {
  const c = hue ? parseHex(hue) : null
  if (!c) return hue ?? ''
  if (contrast(c, REF) >= min) return hue as string
  const target = min + HEADROOM
  /* 二分兑墨比例：兑得越深对比越高。0 = 原色，1 = 全墨 */
  let lo = 0
  let hi = 1
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2
    const mixed = {
      r: c.r + (INK.r - c.r) * t,
      g: c.g + (INK.g - c.g) * t,
      b: c.b + (INK.b - c.b) * t,
    }
    if (contrast(mixed, REF) >= target) hi = t
    else lo = t
  }
  return toHex({ r: c.r + (INK.r - c.r) * hi, g: c.g + (INK.g - c.g) * hi, b: c.b + (INK.b - c.b) * hi })
}
