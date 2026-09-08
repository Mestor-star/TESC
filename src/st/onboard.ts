/**
 * st/onboard.ts — 宿主态「推演锚点」体检与一键就绪（ST-5b）。
 *
 * 剧情推进（宿主态）的锚点 = 酒馆「当前选中的角色 + 其当前对话」（见 drive.ts stDrive，
 * 以及 notes.md §3：不擅自换角、驱动玩家已在酒馆打开的对话）。陌生人首次安装本卡，
 * 可能还没在酒馆选角/开对话，直接推演会报「请先在酒馆选择一名角色并进入对话」。
 *
 * 本模块在 Settings 的酒馆宿主横幅里给出：
 *   - 锚点体检（anchorState）：只读快照 —— 角色是否已选、对话是否已加载、发送框是否在位，
 *     以及当前角色/对话有多少消息；chip 语义与 drive.ts 的 hostDriveState 对齐，
 *     保证「设置里看就绪、剧情推进就能推」。
 *   - 一键就绪（makeAnchor）：在角色表里取当前已选（否则第一位）当作推演锚点，
 *     经 ST 公开 API selectCharacterById(id, { switchMenu:false }) 选中并加载其对话
 *     （真实酒馆里选中即会 getChat/getChatResult，chat 为空且角色有问候语时自动种上第一句）。
 *   - 指定某名角色（pickAnchor）与「另起一段新对话」（freshChat，走 /newchat，旧对话保留不删）。
 *
 * 边界（与 notes.md ST-5b 一致）：酒馆没有官方公开的「新建角色」API，故本卡不替你造角；
 * 若酒馆里一个角色都没有，就明确引导去酒馆新建/导入一张角色卡，README 兜底。
 */

import { isST, stContext } from './host'

export interface StChar {
  /** 酒馆角色表索引（this_chid 是字符串化索引；编号从 0 起） */
  id: string
  name: string
  avatar: string
}

export type OnboardStepKey = 'role' | 'chat' | 'send'

export interface OnboardStep {
  key: OnboardStepKey
  label: string
  done: boolean
}

export interface OnboardState {
  host: boolean
  ctx: boolean
  chars: StChar[]
  /** 当前锚点角色：characterId 能映射到角色表时的展示对象；无法映射（异常态/测试桩）为 null */
  cur: StChar | null
  /** 是否有「当前选中角色」（characterId 非空即算 = 可驱动，与 hostDriveState 一致） */
  hasActive: boolean
  /** 酒馆是否已加载一段对话（chat 为数组） */
  chatLoaded: boolean
  chatLen: number
  /** 酒馆发送框 #send_textarea 是否在 DOM（可投用户回合） */
  sendBox: boolean
  ok: boolean
  why: string
  steps: OnboardStep[]
}

export type AnchorResult = { ok: boolean; why?: string; name?: string }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function hasSendBox(): boolean {
  try {
    return !!document.querySelector('#send_textarea')
  } catch {
    return false
  }
}

/** 当前锚点状态（只读）。chip 就绪语义 = drive.ts hostDriveState 的同一组门。 */
export function anchorState(): OnboardState {
  const host = isST()
  const ctx = stContext()
  const base: OnboardState = {
    host,
    ctx: !!ctx,
    chars: [],
    cur: null,
    hasActive: false,
    chatLoaded: false,
    chatLen: -1,
    sendBox: false,
    ok: false,
    why: host ? '酒馆上下文未就绪' : '未运行在酒馆宿主',
    steps: [],
  }
  if (!ctx) return base

  const raw = Array.isArray(ctx.characters) ? (ctx.characters as { name?: unknown; avatar?: unknown }[]) : []
  const chars: StChar[] = []
  raw.forEach((c, i) => {
    const name = String(c?.name ?? '').trim()
    if (name) chars.push({ id: String(i), name, avatar: String(c?.avatar ?? '') })
  })

  const activeRaw = ctx.characterId != null && ctx.characterId !== ''
  const hasActive = !!activeRaw
  const cur = hasActive ? chars.find((c) => c.id === String(ctx.characterId)) ?? null : null

  const chatLoaded = Array.isArray(ctx.chat)
  const chatLen = chatLoaded ? (ctx.chat as unknown[]).length : -1
  const sendBox = hasSendBox()

  const roleOk = hasActive
  const chatOk = chatLoaded
  const sendOk = sendBox
  const steps: OnboardStep[] = [
    { key: 'role', label: '推演锚点角色', done: roleOk },
    { key: 'chat', label: '当前对话', done: chatOk },
    { key: 'send', label: '发送框', done: sendOk },
  ]

  const ok = roleOk && chatOk && sendOk
  let why = ''
  if (!ok) {
    if (!roleOk) why = '尚无推演锚点：在下方选一名现有角色，或收起终端去酒馆开一段对话。'
    else if (!chatOk) why = '角色已选中，但对话尚未加载，稍候重试。'
    else why = '酒馆发送框不可用：请收起终端回到酒馆聊天界面，再回来推演。'
  }

  return { host, ctx: true, chars, cur, hasActive, chatLoaded, chatLen, sendBox, ok, why, steps }
}

/** 调酒馆 selectCharacterById 选中锚点角色并加载其对话（真实 ST 会顺带 getChat/种子问候语） */
async function selectInto(id: string): Promise<boolean> {
  const ctx = stContext()
  if (!ctx) return false
  try {
    const fn = (ctx as { selectCharacterById?: unknown }).selectCharacterById
    if (typeof fn !== 'function') return false
    await (fn as (i: number, o: Record<string, unknown>) => Promise<unknown>).call(ctx, Number(id), {
      switchMenu: false,
    })
    return true
  } catch {
    return false
  }
}

/** 轮询等 ST 就位：选中后 getChat 是异步的，最多等 ~1.8s */
async function waitSeated(id: string): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    await sleep(120)
    if (anchorState().cur?.id === id) return true
  }
  return anchorState().cur?.id === id
}

/** 指定一名现有角色为推演锚点。成功返回其名；就绪门不足时带上 why。 */
export async function pickAnchor(id: string): Promise<AnchorResult> {
  const s = anchorState()
  const target = s.chars.find((c) => c.id === id)
  if (!s.host) return { ok: false, why: '未运行在酒馆宿主' }
  if (!target) return { ok: false, why: '找不到该角色，请刷新后重试。' }

  if (s.cur?.id !== target.id) {
    const sel = await selectInto(target.id)
    if (!sel) return { ok: false, why: '酒馆拒绝了切换请求，请收起终端后手动选择角色。' }
    const seated = await waitSeated(target.id)
    if (!seated) return { ok: false, why: '切换角色后未就位，请收起终端手动操作。' }
  }

  const after = anchorState()
  if (after.cur?.id !== target.id) return { ok: false, why: '锚点未能就位，请收起终端手动选角。' }
  if (!after.ok) return { ok: false, why: after.why }
  return { ok: true, name: target.name }
}

/** 一键就绪：当前已选则保留，否则取角色表第一位；选中并确认三项门齐备。 */
export async function makeAnchor(): Promise<AnchorResult> {
  const s = anchorState()
  if (!s.host) return { ok: false, why: '未运行在酒馆宿主' }
  if (s.ok && s.cur) return { ok: true, name: s.cur.name }
  if (s.chars.length === 0) {
    return {
      ok: false,
      why: '酒馆里还没有任何角色。本终端不能替你造角：先在酒馆导入/新建一张角色卡，再回来一键就绪。',
    }
  }
  return pickAnchor(s.cur?.id ?? s.chars[0].id)
}

/** 给当前锚点另起一段全新对话（/newchat，旧对话存档保留不删），用于从头开始一段干净的推演。 */
export async function freshChat(): Promise<AnchorResult> {
  const ctx = stContext()
  if (!ctx) return { ok: false, why: '酒馆上下文未就绪' }
  const s = anchorState()
  if (!s.hasActive) return { ok: false, why: '先选定一名推演锚点角色，再另起对话。' }
  try {
    const cmd = (ctx as { executeSlashCommandsWithOptions?: unknown }).executeSlashCommandsWithOptions
    if (typeof cmd !== 'function') {
      return { ok: false, why: '酒馆未开放命令通道；可收起终端后在酒馆手动开新对话。' }
    }
    await (cmd as (t: string) => unknown).call(ctx, '/newchat')
    await sleep(300)
    const after = anchorState()
    return { ok: after.ok, why: after.ok ? undefined : after.why, name: after.cur?.name }
  } catch {
    return { ok: false, why: '开新对话失败，请收起终端后手动操作。' }
  }
}
