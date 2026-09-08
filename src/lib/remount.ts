/**
 * 应用级全量重挂载通道。
 * 读档 / 重置世界 需要把各 localStorage key 写回后，让整个
 * TerminalProvider 从存储重建（否则 Plot/Tavern 等以 useState 初始化的
 * 会话不会读到新档）。App 根节点持有 nonce key，经此处登记回调触发。
 */
type Handler = () => void

let handler: Handler | null = null

export function registerRemount(fn: Handler): void {
  handler = fn
}

export function clearRemount(): void {
  handler = null
}

export function requestRemount(): void {
  try {
    handler?.()
  } catch {
    /* noop */
  }
}
