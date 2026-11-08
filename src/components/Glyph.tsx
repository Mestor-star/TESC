/**
 * components/Glyph.tsx — 终端自绘图标。
 *
 * 全部 24×24、1.5px 描边、圆角只用在折线上，不用第三方图标集：
 * 这一版的外壳（侧轨 / 系统区 / 主页动作）只认这一套，尺寸与线宽都在这里定死。
 */
import type { CSSProperties } from 'react'

export type GlyphName =
  | 'terminal' | 'map' | 'log' | 'memory' | 'archive' | 'mission'
  | 'save' | 'settings' | 'tune' | 'reset' | 'message' | 'bell' | 'sound' | 'mute'

const PATHS: Record<GlyphName, string[]> = {
  /* 终端：一块屏 + 提示符 + 一行输入 */
  terminal: ['M3 5h18v14H3z', 'M6.5 9.5 9 12l-2.5 2.5', 'M11.5 14.5H16'],
  /* 地图：折起来的图纸，三道折线 */
  map: ['M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z', 'M9 4v13.5', 'M15 6.5V20'],
  /* 日志：一本带书脊的记录 */
  log: ['M6 3.5h11a2 2 0 0 1 2 2v15H8a2 2 0 0 1-2-2z', 'M6 3.5v15', 'M9.5 8h6', 'M9.5 11.5h6'],
  /* 记忆库：三层叠放的切片 */
  memory: ['M12 3 21 7.5 12 12 3 7.5z', 'M3 12l9 4.5 9-4.5', 'M3 16.5 12 21l9-4.5'],
  /* 图鉴：一册立着的书，右上角缺一口 */
  archive: ['M5 4h9l5 5v11H5z', 'M14 4v5h5', 'M8.5 13h7', 'M8.5 16.5h4.5'],
  /* 任务简报：一枚夹板 */
  mission: ['M7 4h10a1 1 0 0 1 1 1v15H6V5a1 1 0 0 1 1-1z', 'M9.5 4V2.8h5V4', 'M9 9h6', 'M9 12.5h6', 'M9 16h3.5'],
  /* 存读档：软盘 */
  save: ['M4 4h12l4 4v12H4z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  /* 设置：齿轮（八齿）+ 中心孔 */
  settings: ['M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M12 2.5v2.2', 'M12 19.3v2.2', 'M2.5 12h2.2', 'M19.3 12h2.2', 'M5.3 5.3l1.6 1.6', 'M17.1 17.1l1.6 1.6', 'M18.7 5.3l-1.6 1.6', 'M6.9 17.1l-1.6 1.6'],
  /* 变量：两条推子 */
  tune: ['M4 8h10', 'M18 8h2', 'M4 16h4', 'M12 16h8', 'M14 6v4', 'M8 14v4'],
  /* 重置：逆时针回转 */
  reset: ['M4 10a8 8 0 1 1 2.2 7.4', 'M4 4v6h6'],
  /* 短信：一只对话气泡 */
  message: ['M4 5h16v11H9l-5 4z', 'M8 9h8', 'M8 12h5'],
  /* 铃：观测信道 */
  bell: ['M12 3.5a5.5 5.5 0 0 1 5.5 5.5v4l1.5 3H5l1.5-3V9A5.5 5.5 0 0 1 12 3.5z', 'M10 19.5a2 2 0 0 0 4 0'],
  /* 声音：一只喇叭 + 两道弧 */
  sound: ['M4 9.5h3.5L12 6v12l-4.5-3.5H4z', 'M15.5 9a4.5 4.5 0 0 1 0 6', 'M18 6.5a8 8 0 0 1 0 11'],
  /* 静音：同一只喇叭，声波换成一道叉 */
  mute: ['M4 9.5h3.5L12 6v12l-4.5-3.5H4z', 'M15.5 9.5l5 5', 'M20.5 9.5l-5 5'],
}

export function Glyph({ name, size = 22, className, style }: {
  name: GlyphName
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}
