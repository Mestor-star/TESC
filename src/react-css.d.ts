import 'react'

declare module 'react' {
  interface CSSProperties {
    /** CSS 自定义属性（如 '--c'、'--g'、'--crew'、'--s'） */
    [key: `--${string}`]: string | number
  }
}
