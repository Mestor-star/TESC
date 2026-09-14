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
   id 形如 `d:<uuid>` —— 这样存档、未读、流式生成全都能照旧复用；
   这里只存**那一点线程元数据**（跟谁、去哪、算不算私密、走完没有）。
   （**上屏不是短信那副样子**：写出来的是正文剧情推演，见的见 `rendezvousPrompt`。）

   与短信的两处区别（都落在 lib/plot.ts 的 dateDirective）：
     · 羁绊一次可 ±5（一条短信只有 ±3）；
     · **只有这里能推进私密档案与次数账**（intim / acts）—— 身体上的事发生在
       见面时，不在打字里；关系档位（rel）也在这儿给。

   一场可以**不止两个人**（`Rendezvous.party`）：主位之外再带几位，就是多女同场。
   提示词那边多挂一份 HAREM_RULE，指令那边也放开这几位各自的账。
   ============================================================ */

import { charOf, profileLinesOf } from '../data/personas'
import { INTIMATE_BOND, INTIMATE_SLOTS, SLOT_META } from '../data/intimate'
import { ACT_KINDS, ACT_META } from '../data/acts'
import { REL_IDS } from '../data/rel'
import type { CgRef } from '../data/types'
import { PROSE_RULES, HAREM_RULE } from './worldrules'

/** 同场的某一位（手册那一侧现算，本模块不读存档） */
export interface RendezvousParty {
  id: string
  /** 显示名 */
  name: string
  /** 此刻与主角的羁绊读数（仅作语气参考） */
  bond: number
}

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
  /**
   * 什么时候（「明天放学后」「周六下午三点」这类）。
   *
   * 这一栏是与 `place` **成对**的：短信里那条 `date` 指令要两样都有才算说定
   * （见 lib/plot.ts 的 `dateReady`）—— 只有地点没有时间是「改天出来玩」那种
   * 没有落点的客气话，那样就不该另开一场。开出来之后它照旧可以是空的
   * （旧档、操作员自己按「约 TA」开的），所以上屏时**没给就不念**。
   */
  time?: string
  /** 谁起的头：'you' = 操作员约的 · 'them' = 对方在短信里先开的口 */
  from: 'you' | 'them'
  /**
   * **这一场还带着谁**（1 男多女的那种见面）—— 不含 `charId` 本人（她算主位）。
   *
   * 空数组（缺省）= 只有她一个人，行为与从前一模一样。带人时这一场就是
   * 多女同场：提示词那边会多挂一份 `HAREM_RULE`（见 lib/worldrules.ts），
   * 指令那边也放开这几位各自的 intim / acts / rel（见 lib/plot.ts 的 dateDirective）。
   */
  party?: string[]
  ts: number
  /** 走完了（会话里点「结束这一场」） */
  done: boolean
}

/** 同场的人数上限（主位之外最多再带几位）—— 再多就不是一场戏，是点名单了 */
export const PARTY_MAX = 3

/** 这一场**所有人**的 id（主位在前，同场的按登记顺序去重跟上） */
export function rvAllIds(rv: Rendezvous): string[] {
  return [rv.charId, ...(rv.party ?? [])].filter((id, i, a) => a.indexOf(id) === i)
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
      /* 同场的几位：只认同场的档案角色（认不出来的丢掉），去掉主位本人、
         去重、封顶 —— 旧档没有这一项 → 空数组，行为与从前一致。 */
      const party = Array.isArray(o.party)
        ? [...new Set(o.party.filter((x): x is string => typeof x === 'string' && !!charOf(x) && x !== o.charId))]
            .slice(0, PARTY_MAX)
        : []
      out.push({
        id: o.id,
        charId: o.charId,
        kind: o.kind === 'intimate' ? 'intimate' : 'date',
        title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : '一次见面',
        place: typeof o.place === 'string' && o.place.trim() ? o.place.trim() : '学园外',
        /* 旧档没有这一栏 → 不写这个键（`time` 缺省即「没说定什么时候」） */
        ...(typeof o.time === 'string' && o.time.trim() ? { time: o.time.trim().slice(0, 40) } : {}),
        from: o.from === 'them' ? 'them' : 'you',
        ...(party.length ? { party } : {}),
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
  opts: {
    kind?: 'date' | 'intimate'; title?: string; place?: string; time?: string; from?: 'you' | 'them'
    /** 一并带着去的几位（1 男多女的那一场；主位之外的） */
    party?: string[]
  } = {},
): Rendezvous {
  /* 同场的几位在这儿也过一道：只认档案角色、去掉主位本人、去重、封顶 ——
     别处（补丁、旧档回填）也各过各的，四处口径一致。 */
  const party = (opts.party ?? [])
    .filter((x) => !!charOf(x) && x !== charId)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, PARTY_MAX)
  const rv: Rendezvous = {
    id: `${DATE_PREFIX}${crypto.randomUUID()}`,
    charId,
    kind: opts.kind === 'intimate' ? 'intimate' : 'date',
    title: opts.title?.trim() || '一次见面',
    place: opts.place?.trim() || '学园外',
    ...(opts.time?.trim() ? { time: opts.time.trim().slice(0, 40) } : {}),
    from: opts.from === 'them' ? 'them' : 'you',
    ...(party.length ? { party } : {}),
    ts: Date.now(),
    done: false,
  }
  store([rv, ...listRendezvous()])
  return rv
}

export function patchRendezvous(
  id: string,
  patch: Partial<Pick<Rendezvous, 'kind' | 'title' | 'place' | 'time' | 'done' | 'party'>>,
): void {
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
   图：CG 一档，立绘一档
   ------------------------------------------------------------
   **两者不是一回事**（主人立的规矩）：
     · **CG** —— 「这一场画出来的那一张」，**由上下文自动放置**：id 登记在下面的
       `DATE_CG` / `DATE_CG_INTIMATE`，导演从清单里点名（落进 `world.cg[约会id]`）；
     · **立绘** —— 「这个人长什么样」，一人一张、文件名写死、**不进导演候选**
       （`dateWearId` 现算 id，右手边那一栏摆特大 —— 见 components/DateSide.tsx）。

   取图 / 探针 / 扩展名候选链见 lib/cg.ts，图照旧丢 `public/cg/<id>.webp|png|jpg`。
   缺图时 <CgSlot> 只留一行「待补」提示，**不占版位**（29 个槽位一张都没补，
   按比例占空框会满屏虚线 —— 那条规矩见 components/CgSlot.tsx 文件头）。

   越私密的那几张只有走到私密那一档才进候选；**再往下还有一种窄法** ——
   `cast` 钉住某一个人（只属于她的那张，缺了人就不进候选，见 `dateCgPalette`）。
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
  /* 这一档里**只有它认人**（`cast`）。上面那两张是谁走到私密那一档都能点，
     可这张画的是露娜一个人 —— 没她在场时摆出来就成了「凭空多一个人」。
     所以除了「到私密那一档」，还多一道：**她本人得在场**（主位或同场都算）。 */
  {
    id: 'cg-date-intim-luna-oral',
    note: '露娜仰躺着含弄你的那一刻 · 一只手攥着底下、一只手在自己腿间',
    cast: ['luna'],
    dir: 'lunaNSFW/满羁绊加满等级CG',
  },
  /* 露娜这一档：**一个戏码一个槽位**，每个都带 `cast` —— 缺了她就不进候选。
     素材按戏码分在 `public/cg/lunaNSFW/<戏码>/`（`dir`），换图不用改这里。
     带 `variants` 的是同一张画的多版：每次被触发就轮着换下一版，不是动画帧
     （见 lib/cg.ts 的 `cgVariantId`）。 */
  { id: 'cg-date-intim-luna-missionary', note: '私密的场面 · 正常位', cast: ['luna'], dir: 'lunaNSFW/正常位', variants: 3 },
  { id: 'cg-date-intim-luna-spooning', note: '私密的场面 · 侧入式', cast: ['luna'], dir: 'lunaNSFW/侧入式', variants: 3 },
  { id: 'cg-date-intim-luna-doggystyle', note: '私密的场面 · 后入式', cast: ['luna'], dir: 'lunaNSFW/后入式', variants: 3 },
  { id: 'cg-date-intim-luna-cowgirl', note: '私密的场面 · 骑乘位', cast: ['luna'], dir: 'lunaNSFW/骑乘位', variants: 3 },
  { id: 'cg-date-intim-luna-straddle', note: '私密的场面 · 对面座位', cast: ['luna'], dir: 'lunaNSFW/对面座位式' },
  { id: 'cg-date-intim-luna-paizuri', note: '私密的场面 · 乳交', cast: ['luna'], dir: 'lunaNSFW/乳交', variants: 2 },
  { id: 'cg-date-intim-luna-oral-b', note: '私密的场面 · 口交', cast: ['luna'], dir: 'lunaNSFW/口交', variants: 2 },
  { id: 'cg-date-intim-luna-handjob', note: '私密的场面 · 手交', cast: ['luna'], dir: 'lunaNSFW/手交' },
]

/**
 * 一位角色的**约会常服立绘**的 id —— 右手边那一栏摆的那张（特大）。
 *
 * 写法与私密档案立绘（`cg-intim-<角色id>`）同构：**一人一张，id 由 charId 现算**，
 * 不另立登记表。所以它**不进 `dateCgPalette`** —— 立绘不是导演点名的东西，
 * 它跟着人走，人一上场就该在那一栏里（见 components/DateSide.tsx）。
 */
export function dateWearId(charId: string): string {
  return `cg-datewear-${charId}`
}

/**
 * **私密档案立绘**（`cg-intim-<角色id>`）的素材子目录（相对 `public/cg/`）。缺省 = 顶层。
 *
 * 立绘的 id 一人一张、由 charId 现算，但**文件可以按人分文件夹收** —— 这批私密立绘
 * 与日常素材画风不同，主人按 `lunaNSFW/` 归了档。取图那一侧（CgSlot → probeCg）
 * 就靠这一张表问路：**id 照旧写死，只有目录是登记的**，往后换图仍然不用改码。
 * 没登记过的人 = 顶层（与先前一致，老素材不受影响）。
 */
const INTIM_ART_DIR: Record<string, string> = {
  luna: 'lunaNSFW/NSFW立绘',
}

/** 取某人的私密档案立绘在哪个子目录；没登记过 → undefined（顶层） */
export function intimArtDir(charId: string): string | undefined {
  return INTIM_ART_DIR[charId]
}

/**
 * 这一场此刻能点的 **CG** 清单：街景那几张（走到私密那一档再添几张）。
 *
 * 两处共用同一份：喂给 `rendezvousPrompt` 的 `cgPalette`，以及视图那一层
 * 「导演点名的 id 认不认」的判断 —— 认不出来（模型编的、或清单改过之后留下的旧值）
 * 就当没点，不摆图。
 *
 * **两道窄法**（都收在这一处，调用方不用各判各的）：
 *   · 档位 —— 私密那几张要 `kind: 'intimate'` 才进来；
 *   · 认人 —— 带 `cast` 的那几张还要**名单上这几位真的在场**才算数
 *     （`cast` 里有一个在人堆里就进候选。主位与同场的都算 —— 见 `rvAllIds`）。
 *     这一条是替「只属于某一个人的那张」把关：缺了人还摆，等于凭空多一个人。
 *
 * **立绘不在这里面** —— 它不进候选、不由导演挑（要那张脸就去 `dateWearId`）。
 */
export function dateCgPalette(rv: Rendezvous): CgRef[] {
  const here = new Set(rvAllIds(rv))
  const base = rv.kind === 'intimate' ? [...DATE_CG, ...DATE_CG_INTIMATE] : [...DATE_CG]
  return base.filter((r) => {
    const cast = typeof r === 'string' ? undefined : r.cast
    return !cast?.length || cast.some((id) => here.has(id))
  })
}

/** 把一张表的位渲染成 `- id —— 说明`（就是喂给导演的候选清单那一节） */
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
 * 与短信那条的区别写在明面上：**这不是在打字，是此刻同一处的正文**。
 * 所以口径与主线推演同路 —— 第三人称全局叙述 + 「」对白，
 * 而不是短信那种「一到三句、口语自然」的隔屏聊天（主人 2026-09-14：
 * 「转换约会了就不要是短信对话了，而是真正的正文剧情推演」）。
 * 对白写成一整行「名字：……」时会被 lib/dialogue.ts 切成台词框，与主线同一套。
 *
 * 也正因为在同一处，推进必须跟着对方走。
 *
 * 私密那一节只在 `rv.kind === 'intimate'` 时注入 —— 一般的见面不该被这一节带跑。
 */
export function rendezvousPrompt(
  charId: string,
  opName: string,
  bond: number,
  rv: Rendezvous,
  /**
   * 这一场能点的 CG 清单，已渲染成 `- id —— 说明` 的文本（`cgListText(dateCgPalette(rv))`）。
   *
   * 给了才注入【这一场的场景 CG】一节 —— 那一节同时交代 `cg` 字段怎么用。
   * 清单由调用方传进来，是因为本模块只管**登记**（DATE_CG 那几张），
   * 认不认导演点回来的那个 id 是视图那一层的事。
   */
  cgPalette: string,
  /** 正文里与她有关的那一截（lib/crosslink.ts 的 plotContextFor；她不在场的一句不给）。
      见面不是凭空来的：她答应这一场，多半是正文里刚走过的那一段在起作用。 */
  plotContext?: string,
  /**
   * **同场的其余几位**（1 男多女那一场；不含 `charId` 本人，空 = 只有她一个）。
   *
   * 由调用方从 `rv.party` 现算（手册那边把羁绊一并取好递进来，本模块不读存档）：
   * 带了人就多挂一份 `HAREM_RULE`，并且把「谁在场、各自与他到哪一步」逐条列出来 ——
   * 多人同场最容易出的毛病就是把她们合流成一个「她们」，所以名单要给到人。
   */
  party: RendezvousParty[] = [],
): string {
  const c = charOf(charId)
  const you = opName === '言万心叶' ? '言万心叶' : `操作员「${opName}」`
  /* 这一场在座的每一位都给一张卡：主位在前，同场跟上。
     导演要把她们**一个个演出来**，只摆主位那一张，同场的几位就只剩名字 —— 那正是
     多人同场最容易出的毛病（合流成一个「她们」）。 */
  const castLines = [charId, ...party.map((p) => p.id)]
    .map((id) => {
      const p = charOf(id)
      if (!p) return ''
      const card = profileLinesOf(id)
      return `· ${p.name}（${p.role}）${card.length ? `\n${card.map((l) => `  ${l}`).join('\n')}` : ''}`
    })
    .filter(Boolean)
  const core = castLines.length
    ? `你是《这里是，终末停滞委员会。》的剧情导演，同时扮演这一场在场的全部角色。\n在场角色：\n${castLines.join('\n')}`
    : '你是《这里是，终末停滞委员会。》的剧情导演。'
  const intimate = rv.kind === 'intimate'
  /* 同场的几位：带了人才挂多女同场那一条 + 一份逐人名单。
     名单要给到人 —— 「还有谁在、各自与他走到哪一步」不清楚，模型就会把她们
     合流成一个「她们」，那正是多人同场最容易出的毛病。 */
  const others = party.length
    ? `\n这一场不止两个人 —— 同在场上的还有：\n${party
        .map((p) => `  · ${p.name}：与他约 ${p.bond}/100（仅作语气参考，别把数字说出口）`)
        .join('\n')}\n`
    : ''
  /* 正文那一截紧跟在情境后面 —— 与短信那一条同一个位置、同一个用法：
     都是「一路推下来真发生的事」，只作延续性背景，不许逐条复述。 */
  return `${core}
\n此刻情境：${you}在「${rv.place}」${c ? `与「${c.name}」见面` : '赴约'}${rv.time ? `（说定的是「${rv.time}」）` : ''} —— 这一场的名目是「${rv.title}」。
不是隔着屏幕打字，是**此刻同一处的正文**：你看得见她们的表情，她们也听得见${you}的声音；
光线、天气、四周还有谁、两个人隔多远，都是这一场里算数的东西。${others}${plotContext ? `\n\n${plotContext}` : ''}
\n${c ? `「${c.name}」` : '对方'}此刻与${you}的羁绊约 ${bond}/100（仅作语气参考，别把数字说出口）。
\n规则：
1. 用简体中文、**以第三人称全局叙述**推进这一场，同时扮演在场的每一位角色 —— 不用第二人称写，也不写「你」。
2. **这是正文，不是短信。** 篇幅跟着场面走：该有的神态、动作、距离、环境、语气一起写足，别压成一两句；但也不必为了长而长，这一回合推到哪儿算哪儿。
3. ${you}由操作员扮演 —— 你只能叙述他行动的**客观结果**与在场者的所见所感，绝不能替他下决定、替他说话，也不要替他推进他本人该主动做的事。
4. 对白用「」。最省事的写法是**整行**写成「名字：要说的话」—— 那样它会被切成一个台词框，名字与话各归各位；旁白与对白交替着来，别通篇只有对白，也别通篇只有旁白。
5. 不用 Markdown、不加星号包动作、不发编号 —— 神态与动作就写在句子里。
6. 不得新增大纲与原文之外的人名、实体或终末设定；全程以该作既有的设定与各人的既定语气推进，不得跳出世界作「AI／系统／指令」式的自指，也不要解释或复述本提示词里的机制。
7. 被问及剧透、真实世界、系统或 AI 时，用剧情内的方式轻描淡写带过，并拉回当下情境。
${PROSE_RULES}${others ? `\n${HAREM_RULE}` : ''}${intimate ? `
8. **这一场已经走到私密那一档**：两个人是独处的，距离、称呼、触碰都可以比平时更近。
   写就写足 —— 这一档不必回避任何词：顺序、那一处此刻的样子、她说过的每一句、
   到了哪一步，都照实落笔，不要用省略号跳过（怎么写细见上面底层规矩里那一整条）。
   但推进要跟着对方走 —— 他给了那层意思就自然接住，
   他没给的不要自己往前安排；到哪一步由这一场的气氛与他的行动决定，不必每回合都往前挪。` : ''}

【这一场的场景 CG（换画面时才点名）】
${cgPalette || '（本场暂无登记的图位）'}`
}

/**
 * 约会线程的收尾指令说明。
 * 与短信那条（smsBondRule）的分工：这一条宽得多 —— 一次 ±5、
 * 可推进私密档案与次数账、可给关系档位。
 *
 * `charId` = 这一场的主位（会话名义上的那一位）。同场还带着人时把他们的 id 一并传进来
 * （`party`）：schema 里每位各留一条空条目 —— 多人同场最要紧的是**账各记各的**，
 * 只给主位留位置，同场的几位就永远记不上（见 worldrules 的 HAREM_RULE）。
 */
export function dateBondRule(charId: string, party: string[] = []): string {
  const slots = INTIMATE_SLOTS.map((s) => `${s}（${SLOT_META[s].label}）`).join(' / ')
  const acts = ACT_KINDS.map((k) => `${k}（${ACT_META[k].label}）`).join(' / ')
  const ids = [charId, ...party]
  /* schema 里逐人摆一条 —— 顺带把「谁在这一场里」又说了一遍，两处口径不会打架 */
  const intimLines = ids
    .map((id) => `    { "char": "${id}", "slot": "mouth", "dev": 1, "lewd": 1,
      "state": "改写该部位状态的一句话（可选）", "lastAct": "这一回到底做了什么（可选）",
      "view": "她对性行为的看法（变了才给，可选）" }`)
    .join(',\n')
  const actLines = ids.map((id) => `    "${id}": { "kiss": 1 }`).join(',\n')
  const attireLines = ids
    .map((id) => `    { "char": "${id}", "bra": "half", "panties": "off", "wet": 10 }`)
    .join(',\n')
  return `\n（可选 · 本回合的推进：若这一场让这段关系或气氛有明显变化，可在回复最末尾另起一行放一个纯 JSON 对象，形如
{ "bond": [{ "char": "${charId}", "delta": 1 }], "flag": { "some_state": 值 }, "cg": "上面清单里的一个 id",
  "rel": { "${charId}": "${REL_IDS.join('|')}" },
  "intim": [
${intimLines}
  ],
  "acts": {
${actLines}
  },
  "attire": [
${attireLines}
  ] }
说明：
· bond.delta 只针对该角色取 ±1~5（正=更亲近）；flag 为可选的分支标记；
· cg 只从上面那份【这一场的场景 CG】清单里挑，且**画面真的换了**才给，一直同画面就别重复给；
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
    · **intim 里 "char" 填谁，就记在谁名下** —— 同场有几位就分几条写，
      别把两个人的推进合成一条（合成的那一条只落得到一个人身上）。
· acts 是**次数账**：这一回合真的做成了几回，逐栏给增量（${acts}）。
    它与 intim 不是一回事：只是多亲了几回、多要了一回，就只动 acts、不动 dev；
    内射那一栏与性交 / 肛交各记各的（同一次里可以两栏都动，也可以只有交合而没有内射）。
    **只增不减、数不清就不给** —— 拿不准的整栏省略，宁可少记一笔，也不要虚报。
    同场有几位就分几条写，同样别合成一条。
· attire 是**贴身衣物**（内衣与内裤）：这一处的两件给的是**此刻那一档** ——
    "worn" 穿着 / "half" 半褪 / "off" 褪下（不是「脱掉一层」这种增量：她脱了又穿回去，
    照此刻那一档给）；没动的那一件就省掉，两件都没动、也没湿就整条省略。
    只有正文里真的脱了、解开了、湿了才给 —— 她穿着好好的就别报「穿着」。
    wet 是内裤**湿润读数的增量**（±30；正 = 更湿，负 = 缓过来了、擦干净了）——
    **发情带起来的那一份不必报**：她的色情度一涨，内裤自己会跟着湿一分，
    同一件事报两遍就成了两分。同场有几位就分几条写。
· rel 是**关系档位**：只在剧情真的挪了一步时给，给的是**此刻的档位**（绝对值，
  不是增量），往上、往下都给同一个字段。可填：${REL_IDS.join(' / ')}。
  拿不准就整条省略 —— 省略即维持此刻那一档。
· 拿不准就整条不给 —— 不给即这一场什么也没推进。）`
}

/** 刚开一场时喂给模型的第一句（操作员还没开口时用；写成给对方的动作提示，不上屏） */
export function dateOpeningPrompt(rv: Rendezvous): string {
  const her = charOf(rv.charId)?.name
  return rv.from === 'them'
    ? `（这一场是${her ? `「${her}」` : '对方'}先开的口。请照上面那套正文口径，把这一场的**开场**写出来：${her ? `${her}` : '对方'}先到了「${rv.place}」，${rv.time ? `说定的是「${rv.time}」` : '没把钟点说死'}，此刻他寻过来 —— 周围是什么样子、${her ? `${her}在那儿是什么神态` : '那儿是什么情形'}，再让她开口说第一句。两三段以内。）`
    : `（是${her ? `「${her}」` : '对方'}先约的这一场，现在轮到他赴约。请照上面那套正文口径，把这一场的**开场**写出来：他到了「${rv.place}」，${rv.time ? `说定的是「${rv.time}」` : '没把钟点说死'} —— 周围是什么样子、${her ? `${her}是已经等在哪儿还是还没到` : '那儿是什么情形'}。两三段以内。）`
}

/** 门槛：能不能约（羁绊读数；会长一类恒满值一并算过） */
export function canDate(bond: number): boolean {
  return bond >= INTIMATE_BOND
}
