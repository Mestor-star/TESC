/**
 * st/host.ts — SillyTavern 宿主探测与上下文访问。
 *
 * 只在「本包作为酒馆扩展运行」时有效：宿主把扩展 js 以 ESM 注入酒馆主 DOM，
 * 并向 window.SillyTavern 挂 getContext()。独立态（dev/preview/GitHub Pages）
 * 没有该全局，isST() 恒 false，一切照旧走直连。
 *
 * 契约真源：C:\ai\SillyTavern\data\default-user\extensions\JS-Slash-Runner\
 *   @types\iframe\exported.sillytavern.d.ts（708 行）。
 * 我们用到的成员先在下方松散声明，ST-1 刺探定案后再收紧。
 */

export interface STContext {
  /** 当前聊天消息数组（读尾条兜底用；ST 1.18 里是实时引用） */
  chat: unknown[]
  /** 角色表（内存）；characterId = 当前选中角色 */
  characters: unknown[]
  characterId: string | null | undefined
  groupId: string | null | undefined
  chatId: string | null | undefined
  /**
   * 触发一次生成（ST 1.18 `Generate`，见 src/st/notes.md ST-1 结论）：
   * type='normal' 会先读 #send_textarea 的值并投成一条用户消息，
   * 用当前角色/预设/世界书生成，**await 在回复存档后 resolve**（返回正文）。
   */
  generate: (
    type?: string,
    opts?: Record<string, unknown>,
  ) => string | Promise<string> | void
  /** STscript 通道（/send /go 等）；正常流程不用 */
  executeSlashCommandsWithOptions?: (text: string) => unknown
  eventSource?: unknown
  eventTypes?: unknown
  /** 扩展提示词注入：我们把「导演回执格式 + 当前事件大纲」注到这里，不覆写预设 */
  setExtensionPrompt?: (
    prompt_id: string,
    content: string,
    position?: number,
    depth?: number,
    scan?: boolean,
    role?: number,
    filter?: unknown,
  ) => unknown
  getPresetManager?: unknown
  loadWorldInfo?: (name: string) => Promise<unknown>
  saveWorldInfo?: (name: string, data: unknown, immediately?: boolean) => Promise<unknown>
  extensionSettings?: Record<string, unknown>
  openCharacterChat?: (file_name: string) => unknown
  selectCharacterById?: (id: unknown, opts?: unknown) => unknown
  saveSettingsDebounced?: () => void
}

/** 是否运行在酒馆宿主内（有可用的 getContext 才算数） */
export function isST(): boolean {
  try {
    const g = (window as any)?.SillyTavern
    return Boolean(g && typeof g.getContext === 'function')
  } catch {
    return false
  }
}

/** 取酒馆上下文；非宿主态返回 null。 */
export function stContext(): STContext | null {
  try {
    if (!isST()) return null
    const ctx = (window as any).SillyTavern.getContext()
    return (ctx && typeof ctx === 'object') ? (ctx as STContext) : null
  } catch {
    return null
  }
}

/** 扩展自身挂载点：宿主预留给第三方扩展读自己 manifest/settings 的命名空间 */
export function extensionSelf<T = unknown>(): T | null {
  try {
    const self = (window as any)?.SillyTavern?.extensionSettings?.['zts-terminal']
    return (self ?? null) as T | null
  } catch {
    return null
  }
}
