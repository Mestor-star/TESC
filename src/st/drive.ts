/**
 * st/drive.ts — 在线推进的端口层。
 *
 * 调用点（Plot/Tavern）只认识 driveReply，不感知走哪条通道：
 *  - directDrive：直连现有 api.ts chatCompletion（独立态基线行为逐字节不变）。
 *  - stDrive：宿主态驱动酒馆自身对话（ST-1 已在真机源码钉死习语，见 notes.md）：
 *      剧情推进 = 把「导演上下文」经 setExtensionPrompt 注入 → 把操作员回合写进
 *      #send_textarea → await context.generate('normal')（内部投用户消息 + 走当前
 *      角色/预设/世界书生成，await 在回复存档后 resolve）→ 读回正文。
 *      短信 v1 不接宿主（仍走直连），后续可把第二条短信聊天接到某酒馆角色。
 *
 * 下游（parseDirectorReply → applyReply → completeEvent / records / unlock）
 * 与本端口无关，全部不动。
 */

import type { ApiSettings, ChatTurn } from '../lib/api'
import { chatCompletion } from '../lib/api'
import { isST, stContext } from './host'

export type DriveKind = 'plot' | 'sms'

export interface DriveRequest {
  kind: DriveKind
  /** 本次作为「用户回合」送出的正文（剧情=操作员动作/开场指令；短信=玩家一句话） */
  userText: string
  /** 直连通道的完整消息序列（system+history+本次回合）。宿主态只取首条 system 当导演上下文 */
  messages: ChatTurn[]
  /** 直连配置；宿主态可空（密钥在酒馆，不在本卡） */
  cfg: ApiSettings | null
  /** 直连响应上限（宿主态忽略，由酒馆 preset 决定） */
  maxTokens?: number
  signal?: AbortSignal
  /** 会话线索：plot=事件 id；sms=角色 id（宿主态注入/提示用） */
  session?: { eventId?: string; charId?: string }
}

/** 宿主在线是否可用（某类 channel）。Plot/Tavern 用它代替「cfg 就绪」作为门禁。 */
export interface HostDriveState {
  ok: boolean
  why?: string
}

export function hostDriveState(kind: DriveKind = 'plot'): HostDriveState {
  if (!isST()) return { ok: false, why: '未运行在酒馆宿主' }
  const ctx = stContext()
  if (!ctx) return { ok: false, why: '酒馆上下文未就绪' }
  if (kind !== 'plot') return { ok: false, why: '宿主态短信暂未接入' }
  if (!ctx.characterId) return { ok: false, why: '请先在酒馆选择一名角色并进入对话' }
  if (!Array.isArray(ctx.chat)) return { ok: false, why: '酒馆聊天未就绪' }
  if (typeof document === 'undefined' || !document.querySelector('#send_textarea')) {
    return { ok: false, why: '酒馆发送框未就绪' }
  }
  return { ok: true }
}

/** 测试钩子：强切通道。null=按宿主自动判定（isST()） */
let forcedHost: boolean | null = null
export function __forceDriveHost(v: boolean | null): void {
  forcedHost = v
}

/** 是否为宿主通道（纯函数：普通函数与 hook 都可安全调用） */
export function hostDriveActive(): boolean {
  if (forcedHost !== null) return forcedHost
  return isST()
}

/** 供组件渲染期读取宿主通道（规则要求 hook 以 use 开头；内部不真正用 React 状态） */
export function useHostDrive(): boolean {
  return hostDriveActive()
}

/** 在线推进统一入口：返回本回合导演回执原文（含标签），下游解析不变 */
export async function driveReply(req: DriveRequest): Promise<string> {
  if (hostDriveActive()) return stDrive(req)
  return directDrive(req)
}

/** 直连实现：与重构前 Plot/Tavern 的 chatCompletion 调用逐字节等价 */
async function directDrive(req: DriveRequest): Promise<string> {
  if (!req.cfg) throw new Error('直连未配置：请先在「设置」填写模型接口')
  return chatCompletion(req.cfg, req.messages, {
    signal: req.signal,
    maxTokens: req.maxTokens,
  })
}

/* ============================ 宿主实现 ============================ */

/** 注入导演上下文（回执格式 + 当前事件大纲），生成后立刻清空，避免污染其他酒馆对话 */
function injectDirector(ctx: NonNullable<ReturnType<typeof stContext>>, system: string): void {
  if (!ctx.setExtensionPrompt) return
  const content = system.trim()
  ctx.setExtensionPrompt('zts-director', content, 0, 0, false, 0)
}

function clearDirector(ctx: NonNullable<ReturnType<typeof stContext>>): void {
  if (!ctx.setExtensionPrompt) return
  ctx.setExtensionPrompt('zts-director', '', 0, 0, false, 0)
}

/**
 * 驱动一次 ST 普通生成：把操作员回合写进 #send_textarea，再 await generate。
 * generate 内部读该框投用户消息 → 走当前角色/预设/世界书 → saveReply 后 resolve。
 * 结束后恢复用户原有草稿（若此前非空），读回正文。
 */
async function stGenerate(ctx: NonNullable<ReturnType<typeof stContext>>, userText: string, signal?: AbortSignal): Promise<string> {
  const ta = document.querySelector<HTMLTextAreaElement>('#send_textarea')
  const prev = ta?.value ?? ''
  if (ta) ta.value = userText
  try {
    const out = await ctx.generate('normal', signal ? { signal } : {})
    const text = typeof out === 'string' ? out : ''
    if (text.trim()) return text
    // 兜底：从聊天尾条读回
    const chat = ctx.chat as { is_user?: boolean; mes?: string }[]
    const last = chat[chat.length - 1]
    if (last && !last.is_user && typeof last.mes === 'string') return last.mes
    throw new Error('酒馆没有返回正文')
  } finally {
    if (ta) ta.value = prev
  }
}

/**
 * 宿主剧情推进：锚点=酒馆当前打开的角色/聊天（玩家自己预设/世界书生效）。
 * 步骤：注入导演上下文 → 投操作员回合 → await 生成 → 读回原文（交给下游解析）。
 */
async function stDrive(req: DriveRequest): Promise<string> {
  if (req.kind !== 'plot') {
    // 短信 v1 不接宿主：有直连 key 时降级直连，否则明确提示
    if (req.cfg) return directDrive(req)
    throw new Error('宿主态短信暂未接入：短信仍走直连，请为「角色短信」在独立版/设置里配置直连接口。')
  }

  const ctx = stContext()
  if (!ctx) throw new Error('未在酒馆宿主内，无法驱动酒馆对话')
  if (!ctx.characterId) throw new Error('请先在酒馆里选择一名角色并进入对话，再回来推演。')
  if (!Array.isArray(ctx.chat)) throw new Error('酒馆聊天尚未就绪，稍后重试。')

  // 1) 导演上下文：直连组装的首条 system 即「导演」指令（含事件大纲/格式/变量规则）
  const system = req.messages[0]?.role === 'system' ? req.messages[0].content : ''
  injectDirector(ctx, system)

  try {
    // 2) 驱动一次生成，读回正文
    return await stGenerate(ctx, req.userText, req.signal)
  } finally {
    // 3) 无论成败都清掉注入，避免影响用户其他酒馆对话
    clearDirector(ctx)
  }
}
