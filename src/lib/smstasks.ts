/* ============================================================
   角色短信 · 任务列表（lib/smstasks.ts）
   ------------------------------------------------------------
   电话里的另一页：**别人托付给你的事**。
   两种来源 ——
   ① 角色在短信里亲口派下来的（模型在回执里给 task 字段，经 smsDirective 过滤后落地）；
   ② 操作员自己添的一条。
   与「任务简报」（Missions）不同：那边是主线大纲，这边是此刻挂在手边的小事，
   做完即勾掉，不进世界状态、不影响主线判定。
   ============================================================ */

import type { CharId } from '../data/types'
import { charOf } from '../data/personas'

export interface SmsTask {
  id: string
  title: string
  detail?: string
  /** 派活的人（角色 id；操作员自添则缺省） */
  from?: CharId
  ts: number
  done: boolean
}

export const TASKS_KEY = 'zts-sms-tasks:v1'

let version = 0
const subs = new Set<() => void>()

export function subscribeTasks(fn: () => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

export function tasksVersion(): number {
  return version
}

export function listTasks(): SmsTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    const out: SmsTask[] = []
    for (const t of p) {
      if (!t || typeof t !== 'object') continue
      const o = t as Record<string, unknown>
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      if (!title) continue
      out.push({
        id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
        title,
        ...(typeof o.detail === 'string' && o.detail.trim() ? { detail: o.detail.trim() } : {}),
        ...(typeof o.from === 'string' && charOf(o.from) ? { from: o.from as CharId } : {}),
        ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : 0,
        done: o.done === true,
      })
    }
    return out.sort((a, b) => Number(a.done) - Number(b.done) || b.ts - a.ts)
  } catch {
    return []
  }
}

function commit(next: SmsTask[]): SmsTask[] {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下降级 */
  }
  version += 1
  for (const fn of subs) fn()
  return next
}

/** 记下一条托付；同名未完成的任务不重复登记（同一件事被反复提起是常态） */
export function addTask(title: string, opts: { detail?: string; from?: CharId } = {}): SmsTask[] {
  const t = title.trim()
  if (!t) return listTasks()
  const cur = listTasks()
  if (cur.some((x) => !x.done && x.title === t)) return cur
  const task: SmsTask = {
    id: crypto.randomUUID(),
    title: t.slice(0, 60),
    ...(opts.detail?.trim() ? { detail: opts.detail.trim().slice(0, 240) } : {}),
    ...(opts.from ? { from: opts.from } : {}),
    ts: Date.now(),
    done: false,
  }
  return commit([task, ...cur])
}

export function toggleTask(id: string, done?: boolean): SmsTask[] {
  return commit(listTasks().map((t) => (t.id === id ? { ...t, done: done ?? !t.done } : t)))
}

export function removeTask(id: string): SmsTask[] {
  return commit(listTasks().filter((t) => t.id !== id))
}

/** 未完成条数（电话页签角标用） */
export function pendingTaskCount(): number {
  return listTasks().filter((t) => !t.done).length
}
