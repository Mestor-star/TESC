/* ============================================================
   界面兜底 · 一处出错不至于黑屏
   ------------------------------------------------------------
   终端是个长跑的东西：旧存档、旧作战记录都会跟着版本一起往前走。
   任何一次渲染抛错，React 会把整棵树卸载掉——屏幕上什么都不剩，
   看起来就是「黑屏，没有任何显示」。这里兜住那一下，把错误原文
   摊在屏幕上，并给两条能自救的路：重挂界面 / 清掉作战缓存。
   ============================================================ */

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

import css from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  err: Error | null
  info: string
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null, info: '', copied: false }

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // 控制台留一份完整栈：截图看不全时还能从这里翻
    console.error('[TESC] 界面渲染出错：', err, info)
    this.setState({ info: info.componentStack ?? '' })
  }

  private reset = () => {
    this.setState({ err: null, info: '', copied: false })
  }

  private wipeBattle = async () => {
    try {
      for (const k of ['zts-battle']) {
        // 作战缓存是独立的隐藏存档，清掉不牵动世界进度
        await new Promise<void>((res) => {
          const req = indexedDB.deleteDatabase(k)
          req.onsuccess = () => res()
          req.onerror = () => res()
          req.onblocked = () => res()
        })
      }
    } catch { /* 清不掉也照常重挂 */ }
    this.reset()
  }

  private copy = async () => {
    const { err, info } = this.state
    const text = `${err?.name ?? 'Error'}: ${err?.message ?? ''}\n\n${err?.stack ?? ''}\n\n--- 组件栈 ---${info}`
    try {
      await navigator.clipboard.writeText(text)
      this.setState({ copied: true })
    } catch {
      console.log(text)
    }
  }

  render() {
    const { err, copied } = this.state
    if (!err) return this.props.children
    return (
      <div className={css.wrap} data-error-boundary>
        <div className={css.box}>
          <div className={css.head}>
            <span className={css.mark}>!</span>
            <div>
              <b>界面中止</b>
              <i className="mono">RENDER HALTED</i>
            </div>
          </div>
          <p className={css.lead}>
            终端在处理这一段时停住了。世界进度与档案都还在，不必慌 ——
            先记下下面的原文，再选一条路走。
          </p>
          <pre className={css.err}>{err.name}: {err.message}{'\n\n'}{err.stack}</pre>
          <div className={css.acts}>
            <button className="btn btn--amber" onClick={this.reset}>重挂界面</button>
            <button className="btn btn--ghost" onClick={this.wipeBattle}>清空作战缓存</button>
            <button className="btn btn--ghost" onClick={this.copy}>{copied ? '已复制' : '复制错误信息'}</button>
          </div>
          <p className={css.foot}>
            「重挂界面」只把这一屏重新挂起来，不动任何存档；「清空作战缓存」会丢掉作战记录与军需 / 装具，
            世界进度、羁绊、观测记录不受影响。
          </p>
        </div>
      </div>
    )
  }
}
