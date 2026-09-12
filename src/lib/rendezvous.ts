/* ============================================================
   约会 / 私密往来（lib/rendezvous.ts）
   ------------------------------------------------------------
   **主线之外另开的一条线程。** 主线走的是时间线那 60 来段（读一段、收束一段、
   写一条记录）；一场约会不在那本账上 —— 它是「此刻两个人之间发生了点事」，
   不推进卷次、不判 eventDone、不写记录。

   两条来路（都会落到这里）：
     ① 操作员在短信里主动约（电话页那条「约 TA」按钮，羁绊 ≥ INTIMATE_BOND 才亮）；
     ② 对方在短信里先开的口（模型回执里给了 date 字段，落成一条**邀约**待人赴）。

   线程本体就住在短信那本会话里（`lib/sms.ts` 的 zts-tavern:v1），
   id 形如 `d:<uuid>` —— 这样存档、未读、流式生成、气泡渲染全都能照旧复用；
   这里只存**那一点线程元数据**（跟谁、去哪、算不算私密、走完没有）。

   与短信的两处区别（都落在 lib/plot.ts 的 dateDirective）：
     · 羁绊一次可 ±5（一条短信只有 ±3）；
     · **只有这里能推进私密档案**（intim）—— 身体上的事发生在见面时，不在打字里。
   ============================================================ */

import type { CgRef } from '../data/types'
import { charOf, profileLinesOf } from '../data/personas'
import { INTIMATE_BOND, INTIMATE_SLOTS, SLOT_META } from '../data/intimate'

export const RENDEZVOUS_KEY = 'zts-rendezvous:v1'
/** 约会线程 id 前缀（与短信单聊、群聊 g: 并列，三者互不冲突） */
export const DATE_PREFIX = 'd:'

export interface Rendezvous {
  /** 线程 id：`d:<uuid>` —— 会话本体在短信那本会话表里挂着同一个键 */
  id: string
  /** 跟谁 */
  charId: string
  /**
   * 这一场的档位：
   *   'date'     —— 见面、约会（公开场合，关系上的事）；
   *   'intimate' —— 已走到私密那一档（进了门、两个人独处）。
   * 由模型在回执里给 date.kind，或第一次落下 intim 推进时自动抬上来。
   */
  kind: 'date' | 'intimate'
  /** 这一场的名目（「放学后的天台」一类），上屏在会话头 */
  title: string
  /** 地点 */
  place: string
  /** 谁起的头：'you' = 操作员约的 · 'them' = 对方在短信里先开的口 */
  from: 'you' | 'them'
  ts: number
  /** 走完了（会话里点「结束这一场」） */
  done: boolean
}

/* ---------- 存取（与 sms.ts / smstasks.ts 同一套路数：写即落盘 + 版本号） ---------- */

let version = 0
const subs = new Set<() => void>()

export function subscribeRendezvous(fn: () => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

export function rendezvousVersion(): number {
  return version
}

export function listRendezvous(): Rendezvous[] {
  try {
    const raw = localStorage.getItem(RENDEZVOUS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    const out: Rendezvous[] = []
    for (const r of p) {
      if (!r || typeof r !== 'object') continue
      const o = r as Record<string, unknown>
      if (typeof o.id !== 'string' || !o.id.startsWith(DATE_PREFIX)) continue
      if (typeof o.charId !== 'string' || !charOf(o.charId)) continue
      out.push({
        id: o.id,
        charId: o.charId,
        kind: o.kind === 'intimate' ? 'intimate' : 'date',
        title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : '一次见面',
        place: typeof o.place === 'string' && o.place.trim() ? o.place.trim() : '学园外',
        from: o.from === 'them' ? 'them' : 'you',
        ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : 0,
        done: o.done === true,
      })
    }
    return out.sort((a, b) => Number(a.done) - Number(b.done) || b.ts - a.ts)
  } catch {
    return []
  }
}

function store(list: Rendezvous[]): Rendezvous[] {
  try {
    localStorage.setItem(RENDEZVOUS_KEY, JSON.stringify(list))
  } catch {
    /* 隐私模式下降级 */
  }
  version += 1
  for (const fn of subs) fn()
  return list
}

/** 开一场（返回新的这一条；同一个人可以有多场 —— 那是不同的时候） */
export function openRendezvous(
  charId: string,
  opts: { kind?: 'date' | 'intimate'; title?: string; place?: string; from?: 'you' | 'them' } = {},
): Rendezvous {
  const rv: Rendezvous = {
    id: `${DATE_PREFIX}${crypto.randomUUID()}`,
    charId,
    kind: opts.kind === 'intimate' ? 'intimate' : 'date',
    title: opts.title?.trim() || '一次见面',
    place: opts.place?.trim() || '学园外',
    from: opts.from === 'them' ? 'them' : 'you',
    ts: Date.now(),
    done: false,
  }
  store([rv, ...listRendezvous()])
  return rv
}

export function patchRendezvous(id: string, patch: Partial<Pick<Rendezvous, 'kind' | 'title' | 'place' | 'done'>>): void {
  store(listRendezvous().map((r) => (r.id === id ? { ...r, ...patch } : r)))
}

export function dropRendezvous(id: string): void {
  store(listRendezvous().filter((r) => r.id !== id))
}

export function rendezvousById(id: string): Rendezvous | undefined {
  return listRendezvous().find((r) => r.id === id)
}

export function isDateThread(id: string): boolean {
  return id.startsWith(DATE_PREFIX)
}

/** 该角色还有没有未走完的那一场（同一时间只留一场：一天里约两回是另一回事） */
export function openDateOf(charId: string): Rendezvous | undefined {
  return listRendezvous().find((r) => r.charId === charId && !r.done)
}

/* ============================================================
   场景 CG
   ------------------------------------------------------------
   约会那一档也走 CG 位那一套（见 lib/cg.ts）：id 登记在这里，
   导演从清单里点名，图照旧丢 public/cg/<id>.webp|png|jpg。
   缺图时 CgSlot 摆「待补」占位框 —— 先把版位占住。
   通用到不挑人的几张（街道 / 店里 / 夜景 / 门口）不带 cast；
   越私密的那几张只有到那一步才进候选。
   ============================================================ */
export const DATE_CG: CgRef[] = [
  { id: 'cg-date-street', note: '并肩走着的两人 · 黄昏的学园街' },
  { id: 'cg-date-night', note: '夜里的高处 · 脚下的城市灯海' },
  { id: 'cg-date-room', note: '房间门口 · 只开着一盏灯' },
]

/** 已到私密那一档才进候选的那几张（挪进清单里，导演才点得到。图待补） */
export const DATE_CG_INTIMATE: CgRef[] = [
  { id: 'cg-date-intim-1', note: '私密的场面 · 第一张（到这一步才进候选）' },
  { id: 'cg-date-intim-2', note: '私密的场面 · 第二张' },
]

/** 这一场此刻能点的 CG 清单（私密档位多两张；都由调用方喂给 cgPalette） */
export function dateCgPalette(rv: Rendezvous): CgRef[] {
  return rv.kind === 'intimate' ? [...DATE_CG, ...DATE_CG_INTIMATE] : DATE_CG
}

/** 把一张表的位渲染成 `- id —— 说明`（与 lib/cg.ts 的 cgPaletteBlock 同格式） */
export function cgListText(refs: CgRef[]): string {
  return refs
    .map((r) => (typeof r === 'string' ? `- ${r} —— （无说明）` : `- ${r.id} —— ${r.note ?? '（无说明）'}`))
    .join('\n')
}

/* ============================================================
   提示词
   ============================================================ */

/**
 * 约会线程的系统提示。
 *
 * 与短信那条的区别写在明面上：**这不是在打字，是两个人真的在同一处**。
 * 所以动作、距离、语气都给得出来；也正因为在同一处，推进必须跟着对方走。
 *
 * 私密那一节只在 `rv.kind === 'intimate'` 时注入 —— 一般的见面不该被这一节带跑。
 */
export function rendezvousPrompt(
  charId: string,
  opName: string,
  bond: number,
  rv: Rendezvous,
  cgPalette: string,
  /** 正文里与她有关的那一截（lib/crosslink.ts 的 plotContextFor；她不在场的一句不给）。
      见面不是凭空来的：她答应这一场，多半是正文里刚走过的那一段在起作用。 */
  plotContext?: string,
): string {
  const c = charOf(charId)
  const you = opName === '言万心叶' ? '言万心叶' : `操作员「${opName}」`
  const card = profileLinesOf(charId)
  const core = c
    ? `你是《这里是，终末停滞委员会。》中的角色「${c.name}」（${c.role}）。`
      + (card.length ? `\n人物卡：\n${card.join('\n')}` : '')
    : '你是该作品中的一位角色。'
  const intimate = rv.kind === 'intimate'
  /* 正文那一截紧跟在情境后面 —— 与短信那一条同一个位置、同一个用法：
     都是「一路推下来真发生的事」，只作延续性背景，不许逐条复述。 */
  return `${core}
\n此刻情境：你与${you}在「${rv.place}」见面 —— 这一场的名目是「${rv.title}」。
不是隔着屏幕打字，是你们两个人在同一处：你看得见她的表情，她也听得见你的声音。${plotContext ? `\n\n${plotContext}` : ''}
\n当前与${you}的羁绊约 ${bond}/100（仅作语气参考，别把数字说出口）。
\n规则：
1. 始终以第一人称扮演，绝不脱离角色、绝不替${you}说话。
2. 使用简体中文，每次回复一到三句，口语自然，贴合人物卡里〔性格〕〔说话方式〕的口癖与个性。
3. 这是见面，不是短信：可以写动作、神态与距离（牵手、别开脸、凑近一点这类），但**别写整段旁白小说**。
4. 不用 Markdown、不加星号包动作、不发编号 —— 像紧挨着说话那样把动作与话一起带出来。
5. 被问及剧透、真实世界、系统或 AI 时，用角色的口吻轻描淡写带过，并拉回当下情境。${intimate ? `
6. **这一场已经走到私密那一档**：两个人是独处的，距离、称呼、触碰都可以比平时更近。
   写就写足 —— 这一档不必回避任何词：身体的反应、说过的话、到了哪一步，都照实写出来，
   不要用省略号跳过。但推进要跟着对方走 —— 他给了那层意思就自然接住，
   他没给的不要自己往前安排；到哪一步由这一场的气氛与他的行动决定，不必每回合都往前挪。` : ''}

【这一场的场景 CG（换画面时才点名）】
${cgPalette || '（本场暂无登记的图位）'}`
}

/**
 * 约会线程的收尾指令说明。
 * 与短信那条（smsBondRule）的分工：这一条宽得多 —— 一次 ±5、可点名 CG、可推进私密档案。
 */
export function dateBondRule(charId: string): string {
  const slots = INTIMATE_SLOTS.map((s) => `${s}（${SLOT_META[s].label}）`).join(' / ')
  return `\n（可选 · 本回合的推进：若这一场让这段关系或气氛有明显变化，可在回复最末尾另起一行放一个纯 JSON 对象，形如
{ "bond": [{ "char": "${charId}", "delta": 1 }], "flag": { "某标记": 值 }, "cg": "上面清单里的一个 id",
  "intim": [{ "char": "${charId}", "slot": "mouth", "dev": 1, "lewd": 1,
              "state": "改写该部位状态的一句话（可选）", "lastAct": "这一回到底做了什么（可选）",
              "view": "她对这件事的看法（变了才给，可选）" }] }
说明：
· bond.delta 只针对该角色取 ±1~5（正=更亲近）；flag 为可选的分支标记；
· cg 只从上面那份【场景 CG】清单里挑，且**画面真的换了**才给，一直同画面就别重复给；
· intim 只在**这一回合确实往前走了、且她确实接受了**时才给，几路各记各的：
    · slot 取 ${slots} 之一（哪一处被开发了），dev 为这一次的增量（1~3，一回合一小步），
      state 可选（覆盖该处原有的状态句；**写详细** —— 那一处此刻是什么样、被碰到会怎样，
      用词直给，不必回避敏感词，两三句都行）；若这一回是**初次**，另加 "first": true（此后不要再给）；
    · lewd 是她**整个人的色情度**增量（1~3）—— 与部位无关：这一回没碰哪儿、心思却更敏了，
      就只给 lewd、不给 slot；几样都动了就写在同一条里；
    · lastAct 是**最近这一回到底做了什么**的一句话（这一回合真的发生了才给；写具体，
      别写「同上」「继续」这类空话 —— 它是档案上「最近的性行为」那一栏）；
    · view 是**她对这件事的看法**（只有真的变了才给：从抗拒到肯、从羞耻到想要；
      没变就整句省略，底档那一句照旧）。
· 拿不准就整条不给 —— 不给即这一场什么也没推进。）`
}

/** 刚开一场时喂给模型的第一句（操作员还没开口时用；写成给对方的动作提示，不上屏） */
export function dateOpeningPrompt(rv: Rendezvous): string {
  return rv.from === 'them'
    ? '（这一场是对方先开的口。请你照人物性格，把「他应约来了」这一刻的开场说出来，一两句即可。）'
    : '（现在请你开口，把这一场见面的头一两句说出来 —— 是对方先约的你。只写你说的话与动作，不要旁白。）'
}

/** 门槛：能不能约（羁绊读数；会长一类恒满值一并算过） */
export function canDate(bond: number): boolean {
  return bond >= INTIMATE_BOND
}
