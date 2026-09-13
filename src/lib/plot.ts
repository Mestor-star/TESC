/* ============================================================
   剧情推进 —— 结构化事件指令
   ------------------------------------------------------------
   AI 回执的正文是第三人称叙述；其末尾可携带一个 JSON「事件指令」块，
   由前端自动落地（解锁角色 / 增减羁绊 / 登记图鉴 / 分歧标记 /
   事件完结 → 写「记录」并解锁下一段）。

   本模块只做纯函数与拼装，不碰 React / IndexedDB，便于单测与复用。
   canon 约束：buildDirectorSystem 只用事件「大纲」（summary / entities /
   chars / bond / place / day）拼装，绝不喂 SCENES 的开场白正文。
   唯一例外：用户显式录入的 EVENT_NOTES 原文摘录（见 data/eventnotes.ts），
   按事件逐字注入——那是项目「原文细节通道」，非自动喂正文。
   ============================================================ */

import type {
  ActCount, ActKind, AttireProgress, AttireSlot, AttireWear, FlagValue, IntimateProgress,
  IntimateSlot, RelId, TimelineEvent,
} from '../data/types'
import { INTIMATE_BOND, INTIMATE_SLOTS, hasIntimate } from '../data/intimate'
import { ATTIRE_SLOTS, WET_PER_LEWD, hasAttire } from '../data/attire'
import { ACT_KINDS, ACT_META } from '../data/acts'
import { isRelId, relLadderText, relTier, REL_IDS } from '../data/rel'
import { CHARACTERS } from '../data/chars'
import { eventNotesOf } from '../data/eventnotes'
import { briefOf } from '../data/briefs'
import { personaCardOf } from '../data/persona'
import { temperAt } from '../data/temper'
import { CODEX, resolveEntityToCodexId } from '../data/codex'
import { genderOf, personOf, PERSON_IDS } from '../data/castmeta'
import { addressOf } from '../data/address'
import { furthestDone } from './operator'
import { castOf } from './cast'
import { bondName, clamp } from './format'
import { PROSE_RULES, haremRule } from './worldrules'
import { FREE_BOND_NOTE, FREE_FRAME, isFreeId } from './freetime'
import { StreamTagParser } from './tavernlike/stream-parser'
import { aggregateEvents } from './tavernlike/variables'

/* ============================================================
   指令 schema
   ============================================================ */

export interface PlotDirective {
  /** 新遇见并解锁档案的角色（接受档案名录内全部 id：4 主役 + 21 登场者） */
  met?: string[]
  /** 羁绊偏移：只接受档案角色，delta 为有限数值 */
  bond?: { char: string; delta: number }[]
  /** 新遭遇并登记进终末图鉴的实体（接受图鉴 id 或「NO.x 名称」原文标注） */
  ends?: string[]
  /** 分支标记（布尔 / 有限数值 / 字符串） */
  flag?: Record<string, FlagValue>
  /**
   * 这一场该摆哪张 CG —— 从**约会那一档**的候选清单里挑一个 id
   * （清单连同每张的一行说明由 lib/rendezvous.ts 的 `dateCgPalette` 拼出来，
   * 摆在那一场的提示词里）。只在「画面真的换了」时给；一直同画面就别重复给。
   *
   * **只有约会那一路放行**（`dateDirective`）—— 主线导演不给这个字段。
   */
  cg?: string
  /**
   * **此刻真的在场上的人**（角色 id）：剧情右栏那份在场名册的实时修正。
   * 事件静态名册（`ev.cast`）说的是「这一段大体上有谁」，可这一段里人会走会来 ——
   * 走了的不该继续挂在右栏，中途进场的也不该等到下一段才出现。
   * 所以导演**只在在场的人变了的时候**给这一项（换了个房间、谁先离席、谁刚赶到），
   * 给的就是「此刻这一场里都有谁」的全量名单；局势没变就省略，别每回合都给。
   * 缺省（从没给过）时右栏照静态名册摆。
   */
  cast?: string[]
  /** 该段收束是否为分歧路线（与原著相异时置 true） */
  diverged?: boolean
  /** 关键收束达成 → 完结当前事件并写记录（缺省 false） */
  eventDone?: boolean
  /** 收官的第三人称记录（缺省回退原著 summary，不虚构） */
  digest?: string
  /** 本段触发交战：按现场的角色与敌人开战（缺省 = 无战事） */
  battle?: PlotBattle
  /** 角色在对话里派下的托付（短信场景用；进「电话 · 任务列表」，不进世界状态） */
  task?: { title: string; detail?: string }[]
  /**
   * 角色的**邀约**（短信场景用）：她在信里把人约出去 —— 落成一场「约会」，
   * 独立于主线时间线另开一条线程（见 lib/rendezvous.ts）。
   * 只认短信那一路（`smsDirective` 放行）；主线导演不给这个字段。
   */
  date?: { kind?: 'date' | 'intimate'; title?: string; place?: string; time?: string }
  /**
   * **私密档案的推进**（约会 / 私密往来时用）：这一场确实推进了某个部位才给。
   * 只认女角色（`hasIntimate`）；开发度按增量累加、状态句后写覆盖、
   * `first` 只在初次破处那一回置 true（此后不再改写「破处对象」）；
   * `lastAct` / `view` 后写覆盖（这两项说的是「此刻」，与第一回无关）。
   */
  intim?: IntimateDirective[]
  /**
   * **贴身衣物的推进**（约会 / 私密往来时用）：这一场里真的脱了 / 解开 / 湿了才给。
   * 与 `intim` 同一道门槛（只认女角色），但记的是**此刻**而不是账 ——
   * 穿着档位后写覆盖（她可以又穿回去），湿润增量可正可负（缓过来了就回落）。
   * 给的湿润只是**这一回的增量**，不是总数；另外那条「因发情而湿润」的耦合
   * 不必在这儿报（见 data/attire.ts 的 mergeAttire）。
   */
  attire?: AttireDirective[]
  /**
   * **次数账的增量**（约会 / 私密往来时用）：角色 id → 八栏里哪几栏、各加几回。
   *
   * 与 `intim` 的分工写在 data/acts.ts 的开头：intim 是「这一处此刻是什么样」
   * （开发度 / 状态句，可以被改写与覆盖），acts 是「**一共**多少回」（只累加）。
   * 所以这里给的是**增量**而不是总数 —— 一次一个「这一次做了几回」，
   * 由 `mergeActs` 逐栏累加。多女同场时逐人各给一条（见 worldrules 的 HAREM_RULE）。
   */
  acts?: Record<string, ActCount>
  /**
   * **关系档位**（角色 id → 此刻的档位 id）—— 由剧情给，不从羁绊读数换算。
   *
   * 给的是**绝对值不是增量**：往上走给更高的那一级，翻脸了也给（往下的那一级）。
   * 只认 `data/rel.ts` 梯子上的九级（`isRelId`）；认不出来整条丢掉。
   * 拿不准就别给 —— 不给即维持此刻那一档。
   */
  rel?: Record<string, RelId>
}

/** 一条私密推进：某角色的某个部位，这一次走到了哪儿 */
export interface IntimateDirective {
  char: string
  /**
   * 推进的部位。**只有推的是色情度 / 最近一回 / 看法时可以不给** ——
   * 那几样都不挂在部位上（见 data/intimate.ts 的 LEWD_META）：她这一回没被碰到
   * 哪儿、心思却更敏了，或者只是两人之间发生了什么、她怎么想，都算这一种。
   */
  slot?: IntimateSlot
  /** 开发度增量（一次一小步；上限见 INTIM_DEV_MAX） */
  dev?: number
  /**
   * 色情度增量（可选）—— 与部位推进是两件事，可以并列在同一条里给，
   * 也可以单独给一条（这一回只动了心思、没动身体）。
   */
  lewd?: number
  /** 状态句改写（可选；缺省不动底档那一句） */
  state?: string
  /** 这一次是初次破处（'破处对象' 落成言万叶本人） */
  first?: boolean
  /** 「最近的性行为」改写（可选；最近这一回到底做了什么，后写覆盖） */
  lastAct?: string
  /** 「对性行为的看法」改写（可选；她对这件事的看法变了才给，后写覆盖） */
  view?: string
}

/**
 * 一条贴身衣物的推进：某角色这两件此刻穿成什么样 / 内裤湿了几分。
 *
 * 三路各记各的（与 IntimateDirective 同一写法）：
 *   · `bra` / `panties`：**此刻那一档**（绝对值，不是「脱掉了一层」这种增量）——
 *     给的就是她此刻穿成什么样，与上一回合无关。两件可以只给一件。
 *   · `wet`：湿润读数的**增量**（可正可负）。它只在**真的湿了 / 缓过来了**的
 *     时候给；「因为发情而湿润」那一半不必给 —— 同一次里色情度涨了，湿润跟着
 *     涨一半（见 data/attire.ts 的 WET_PER_LEWD 与 mergeAttire）。
 *
 * 一条里两样都没有就是空话，丢掉。
 */
export interface AttireDirective {
  char: string
  /** 内衣此刻穿成什么样（三档；不给即维持此刻那一档） */
  bra?: AttireWear
  /** 内裤此刻穿成什么样（三档；不给即维持此刻那一档） */
  panties?: AttireWear
  /** 湿润增量（可正可负：缓过来了、擦干净了就往下走） */
  wet?: number
}

/** 剧情触发的交战规格 —— 由模型在事件指令里输出 */
export interface PlotBattle {
  /** 敌方名称（也是这场作战的标题） */
  name: string
  /** 性质标签，决定敌阵档案（异端 / 残渣 / 机械 / 低语 / 魔王 …） */
  nature?: string
  /** 危险度 1..10 */
  stage?: number
  place?: string
  /** 在场参战者（角色 id；缺省 = 已遇见的成员） */
  squad?: string[]
  /** true = 本段必然开打（收束正文之后立刻进入交战） */
  force?: boolean
}

/** 档案角色 id 白名单（角色档案全员 24 人，不含操作员） */
const CHAR_IDS = new Set<string>(PERSON_IDS)

const KNOWN_FIELDS = new Set([
  'met', 'bond', 'ends', 'flag', 'cg', 'cast', 'diverged', 'eventDone', 'digest', 'battle',
  // 短信/群聊的「托付」用这一条。漏在名单外的话，sanitizeDirective 末尾那道
  // 「只留认识的字段」会把它连同已净化好的内容一起删掉 —— 写信写得好好的，
  // 任务却永远落不了地，而且一声不吭。
  'task',
  // 私密那一支（约会 / 私密往来）：同样是漏一个就整条安静地丢
  'date', 'intim', 'attire',
  // 次数账与关系档位：同上 —— 漏在名单外就整条安静地丢，账永远记不上
  'acts', 'rel',
])

/** 一次私密推进的开发度增量上限（一次一小步：一回合跳满等于没有过程） */
const INTIM_DEV_MAX = 8

/** 一回合里最多记几个人 / 最多记几栏 —— 多女同场（多P）时够用，又不至于被灌爆 */
const ACT_CHARS_MAX = 6
const ACT_KINDS_MAX = 8
/** 单栏一次报的回数上限（一次报十回等于没数） */
const ACT_TIMES_MAX = 9
/** 一回合最多落下几条私密推进（多女同场时逐人分条，所以比从前宽） */
const INTIM_ITEMS_MAX = 8

/** 约会指令里 cg id 的长度上限（够长到写得下 `cg-date-street`，短到拦得住整段串词） */
const CG_ID_MAX = 64

/**
 * 湿润读数一次能挪多少（绝对值）。
 *
 * 比开发度那 8 给得宽，是因为它记的东西不一样：开发度是**账**，一次一小步；
 * 湿润是**此刻的读数**，同一场里从干爽到透湿本来就可以是一段连续的过程
 * （所以它也不止往上走 —— 增量可以是负的，缓过来了就往下）。
 * 上下各 30 是「一次不用报满」，不是「一共能有多少」。
 */
const ATTIRE_WET_MAX = 30

/** 把「图鉴 id 或原文实体标注」归一化为图鉴条目 id；无法识别返回 null */
export function resolveEndKey(key: string): string | null {
  const k = String(key ?? '').trim()
  if (!k) return null
  if (CODEX.some((e) => e.id === k)) return k
  return resolveEntityToCodexId(k)
}

function finiteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function sanitizeFlagValue(v: unknown): FlagValue | null {
  if (typeof v === 'boolean' || typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

/**
 * 白名单校验：去掉未知字段、坏标量；绝不 throw。
 * 返回的指令对象可能为空 {}（仍视为「解析成功、无变化」）。
 */
export function sanitizeDirective(v: unknown): PlotDirective {
  const out: PlotDirective = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  const src = v as Record<string, unknown>

  if (Array.isArray(src.met)) {
    const met = src.met
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => CHAR_IDS.has(x))
    if (met.length) out.met = [...new Set(met)]
  }

  if (Array.isArray(src.bond)) {
    const bond: { char: string; delta: number }[] = []
    for (const item of src.bond) {
      if (!item || typeof item !== 'object') continue
      const b = item as Record<string, unknown>
      const char = typeof b.char === 'string' ? b.char.trim() : ''
      if (!CHAR_IDS.has(char)) continue
      const delta = finiteNum(b.delta)
      if (delta === null) continue
      bond.push({ char, delta: clamp(Math.round(delta * 10) / 10, -100, 100) })
    }
    if (bond.length) out.bond = bond
  }

  if (Array.isArray(src.task)) {
    const task: { title: string; detail?: string }[] = []
    for (const item of src.task) {
      // 也接受字符串写法
      const title = typeof item === 'string'
        ? item.trim()
        : (item && typeof item === 'object' && typeof (item as Record<string, unknown>).title === 'string'
            ? ((item as Record<string, unknown>).title as string).trim()
            : '')
      if (!title) continue
      const detail = item && typeof item === 'object' && typeof (item as Record<string, unknown>).detail === 'string'
        ? ((item as Record<string, unknown>).detail as string).trim()
        : ''
      task.push({ title: title.slice(0, 60), ...(detail ? { detail: detail.slice(0, 240) } : {}) })
      if (task.length >= 2) break
    }
    if (task.length) out.task = task
  }

  /* 邀约：形状是短串（kind / title / place / time 都可选）。
     是不是「够格约会」由调用方按羁绊判（这儿手里没有 bondNow）；
     **时间与地点齐不齐**也由调用方判（见下面的 `dateReady`）—— 那一刀切在
     「能不能生成这一条」上，不该被一个净化函数悄悄决定。

     不在这里丢掉缺时间/缺地点的邀约：这条指令还要进短信正文的清洗与展示，
     丢掉它等于把「她约了一句」这件事从回执里抹掉。守门的是 `dateReady`。 */
  if (src.date && typeof src.date === 'object' && !Array.isArray(src.date)) {
    const d = src.date as Record<string, unknown>
    const title = typeof d.title === 'string' ? d.title.trim().slice(0, 40) : ''
    const place = typeof d.place === 'string' ? d.place.trim().slice(0, 40) : ''
    const time = typeof d.time === 'string' ? d.time.trim().slice(0, 40) : ''
    out.date = {
      ...(d.kind === 'intimate' ? { kind: 'intimate' as const } : { kind: 'date' as const }),
      ...(title ? { title } : {}),
      ...(place ? { place } : {}),
      ...(time ? { time } : {}),
    }
  }

  /* 私密推进：只认女角色；部位那一路还要认四个槽位之一。开发度与色情度都按增量收
     （负数抹平 —— 这一档只增不减），状态句与另两句封顶，避免整段正文塞进来。
     一条里若既没有合法的部位、又没有色情度增量、也没有最近一回 / 看法，就是空话，丢掉。 */
  if (Array.isArray(src.intim)) {
    const intim: IntimateDirective[] = []
    for (const item of src.intim) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const char = typeof o.char === 'string' ? o.char.trim() : ''
      const raw = typeof o.slot === 'string' ? (o.slot.trim() as IntimateSlot) : null
      const slot = raw && INTIMATE_SLOTS.includes(raw) ? raw : null
      if (!hasIntimate(char)) continue
      const dev = finiteNum(o.dev)
      const lewd = finiteNum(o.lewd)
      const state = typeof o.state === 'string' ? o.state.trim().slice(0, 120) : ''
      const first = o.first === true
      /* 部位那一支：dev / state / first 都得挂在槽位上才落得下去 */
      const onSlot = slot !== null && (dev !== null || Boolean(state) || first)
      const gain = lewd !== null ? clamp(Math.round(lewd * 10) / 10, 0, INTIM_DEV_MAX) : 0
      /* 「最近一回」与「看法」不挂部位（说的是她这个人此刻的状态），比状态句给宽一点。 */
      const lastAct = typeof o.lastAct === 'string' ? o.lastAct.trim().slice(0, 160) : ''
      const view = typeof o.view === 'string' ? o.view.trim().slice(0, 160) : ''
      if (!onSlot && !gain && !lastAct && !view) continue
      intim.push({
        char,
        ...(slot ? { slot } : {}),
        ...(onSlot && dev !== null ? { dev: clamp(Math.round(dev * 10) / 10, 0, INTIM_DEV_MAX) } : {}),
        ...(gain ? { lewd: gain } : {}),
        ...(onSlot && state ? { state } : {}),
        ...(onSlot && first ? { first: true } : {}),
        ...(lastAct ? { lastAct } : {}),
        ...(view ? { view } : {}),
      })
      if (intim.length >= INTIM_ITEMS_MAX) break
    }
    if (intim.length) out.intim = intim
  }

  /* 贴身衣物：两件此刻穿成什么样 / 内裤湿了几分。与 intim 同一道门槛（只认女角色），
     但收法有两处不一样，都因为这一栏记的是**此刻**而不是账：
       · 两件收的是**绝对值**（三档），不是增量 —— 编出来的档位直接丢，不落；
       · 湿润收的是**增量**，且**允许为负**（缓过来了、擦干净了就往下走），
         夹 ±ATTIRE_WET_MAX。这一条与开发度只增不减恰好相反，见 data/attire.ts。
     一条里两件都没给、湿润也没有，就是空话，丢掉。 */
  if (Array.isArray(src.attire)) {
    const attire: AttireDirective[] = []
    for (const item of src.attire) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const char = typeof o.char === 'string' ? o.char.trim() : ''
      if (!hasAttire(char)) continue
      const one: AttireDirective = { char }
      for (const slot of ATTIRE_SLOTS) {
        const v = o[slot]
        if (v === 'worn' || v === 'half' || v === 'off') one[slot] = v
      }
      const wet = finiteNum(o.wet)
      if (wet !== null && wet !== 0) {
        one.wet = clamp(Math.round(wet * 10) / 10, -ATTIRE_WET_MAX, ATTIRE_WET_MAX)
      }
      if (!one.bra && !one.panties && one.wet === undefined) continue
      attire.push(one)
      if (attire.length >= INTIM_ITEMS_MAX) break
    }
    if (attire.length) out.attire = attire
  }

  /* 次数账：角色 → 八栏里哪几栏各加几回。三样都得对上才落：
     ① 角色在档案名录里、且**有私密档案**（这本账挂在那一页背面，只对女角色生效）；
     ② 栏位是八栏之一（`ACT_KINDS`）；
     ③ 回数取 1–9 的整数增量（负数抹平、小数四舍五入 —— 这本账只增不减，
        一次报十回等于没数，所以封顶压得比开发度低）。 */
  if (src.acts && typeof src.acts === 'object' && !Array.isArray(src.acts)) {
    const acts: Record<string, ActCount> = {}
    let chars = 0
    for (const [rawId, rawCount] of Object.entries(src.acts as Record<string, unknown>)) {
      const char = rawId.trim()
      if (!hasIntimate(char)) continue
      if (!rawCount || typeof rawCount !== 'object' || Array.isArray(rawCount)) continue
      const one: ActCount = {}
      let kinds = 0
      for (const [rawKind, rawTimes] of Object.entries(rawCount as Record<string, unknown>)) {
        const kind = rawKind.trim() as ActKind
        if (!ACT_KINDS.includes(kind)) continue
        const times = finiteNum(rawTimes)
        if (times === null || times <= 0) continue
        one[kind] = clamp(Math.round(times), 1, ACT_TIMES_MAX)
        kinds += 1
        if (kinds >= ACT_KINDS_MAX) break
      }
      if (!Object.keys(one).length) continue
      acts[char] = one
      chars += 1
      if (chars >= ACT_CHARS_MAX) break
    }
    if (Object.keys(acts).length) out.acts = acts
  }

  /* 关系档位：只认梯子上那九级。给的是**绝对档位**（不是增量），所以这里
     只做一件事 —— 把认不出来的整条丢掉：编出来的档位落不下去，也不该落到
     「比此刻更低」那一级上去。 */
  if (src.rel && typeof src.rel === 'object' && !Array.isArray(src.rel)) {
    const rel: Record<string, RelId> = {}
    for (const [rawId, rawTier] of Object.entries(src.rel as Record<string, unknown>)) {
      const char = rawId.trim()
      if (!CHAR_IDS.has(char)) continue
      if (!isRelId(rawTier)) continue
      rel[char] = rawTier
    }
    if (Object.keys(rel).length) out.rel = rel
  }

  if (Array.isArray(src.ends)) {
    const ends = src.ends
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean)
    if (ends.length) out.ends = [...new Set(ends)]
  }

  if (src.battle && typeof src.battle === 'object' && !Array.isArray(src.battle)) {
    const b = src.battle as Record<string, unknown>
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : ''
    if (name) {
      const out2: PlotBattle = { name }
      if (b.force === true) out2.force = true
      const nature = typeof b.nature === 'string' ? b.nature.trim().slice(0, 40) : ''
      if (nature) out2.nature = nature
      const place = typeof b.place === 'string' ? b.place.trim().slice(0, 40) : ''
      if (place) out2.place = place
      const st = finiteNum(b.stage)
      if (st !== null) out2.stage = clamp(Math.round(st), 1, 10)
      if (Array.isArray(b.squad)) {
        const sq = b.squad
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => CHAR_IDS.has(x))
        if (sq.length) out2.squad = [...new Set(sq)]
      }
      out.battle = out2
    }
  }

  /* 在场的实时名册：只收名录里认识的角色 id（与 met / bond 同一套白名单），
     去重、封顶 12 人。**空数组不算数** —— 给出空名单等于把右栏清空，
     而「此刻一个人都不在」这种情况由「省略这一项」表达，不由空数组表达。 */
  if (Array.isArray(src.cast)) {
    const cast = src.cast
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => CHAR_IDS.has(x))
    if (cast.length) out.cast = [...new Set(cast)].slice(0, 12)
  }

  /* 约会那一档的 CG 点名。这里**只做形状校验**（非空字符串、长度封顶），不做清单校验 ——
     净化阶段手里没有「这一场是哪个约会」这个上下文。是不是候选清单里登记的 id，
     留到视图那一层判（认不出来就当没点，不摆图）。两处分工：这儿拦垃圾，那儿拦幻觉。 */
  if (typeof src.cg === 'string') {
    const id = src.cg.trim().slice(0, CG_ID_MAX)
    if (id) out.cg = id
  }

  if (src.flag && typeof src.flag === 'object' && !Array.isArray(src.flag)) {
    const flag: Record<string, FlagValue> = {}
    for (const [k, raw] of Object.entries(src.flag as Record<string, unknown>)) {
      const key = k.trim()
      if (!key) continue
      const sv = sanitizeFlagValue(raw)
      if (sv !== null) flag[key] = sv
    }
    if (Object.keys(flag).length) out.flag = flag
  }

  if (src.diverged === true) out.diverged = true
  if (src.eventDone === true) out.eventDone = true

  const digest = typeof src.digest === 'string' ? src.digest.trim() : ''
  if (digest) out.digest = digest.slice(0, 600)

  // 只保留被认识且非空的字段
  for (const k of Object.keys(out)) {
    if (!KNOWN_FIELDS.has(k)) delete (out as Record<string, unknown>)[k]
  }
  return out
}

/* ============================================================
   回执解析
   ============================================================ */

export interface PlotReply {
  /** 上屏正文（已剥掉指令块与标签行） */
  narrative: string
  /** 解析并白名单校验后的指令对象；找不到 JSON 时为 null */
  directive: PlotDirective | null
  /** 是否真的从回执里定位到了可解析的指令块 */
  found: boolean
}

/**
 * 标签行：……事件指令…… 或 指令 / directives 等。
 * 装饰一律容忍 —— 模型爱写成 `**事件指令**`、`【事件指令】`、`## 指令`，
 * 早先只认光秃秃的那一种，剩下的会连装饰一起漏进正文当旁白。
 */
const LABEL_RE = /^\s*[*_~#>\s]*(?:——+\s*)?(?:【\s*)?(?:事件指令|指令块|指令|directives?)(?:\s*】)?\s*(?:——+)?[*_~]*\s*$/i

/**
 * 「接口处的残迹」：把指令块从正文里摘走之后，紧挨着它的那一头还剩什么。
 * 空行不算数；标签行（—— 事件指令 ——）不算数；孤零零一个围栏行（```json 或 ```）也不算数。
 * 被输出预算截断的回执就长这样：标签行 + 半个围栏 + 半截 JSON ——
 * 摘掉 JSON 之后，标签行和那个开着的围栏会原地留下，当旁白上屏。
 */
const seamNoise = (l: string) => l.trim() === '' || LABEL_RE.test(l) || /^\s*```[a-zA-Z]*\s*$/.test(l)

/** 从尾部收：把贴在指令块**之前**的标签行、围栏行、空行一路摘掉 */
function trimSeamEnd(s: string): string {
  const lines = s.split('\n')
  while (lines.length && seamNoise(lines[lines.length - 1])) lines.pop()
  return lines.join('\n').trim()
}

/** 从头部收：指令块**之后**若还跟着一个孤立的收尾围栏或空行，一并摘掉 */
function trimSeamHead(s: string): string {
  const lines = s.split('\n')
  while (lines.length && seamNoise(lines[0])) lines.shift()
  return lines.join('\n').trim()
}

/** start 处必须是 '{'；返回配平的那个 '}' 的下一位，配不平返回 -1 */
function balancedEnd(text: string, start: number): number {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (esc) { esc = false; continue }
    if (ch === '\\' && inStr) { esc = true; continue }
    if (ch === '"') inStr = !inStr
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** 对象收尾之后只剩这些，就算「这一块说到这儿了」：空白、围栏残渣、markdown 装饰 */
const TAIL_NOISE_RE = /^[\s`*_~]*$/

/**
 * 从裸文本里挑出**整块**指令，而不是它里面的一小节。
 *
 * 为什么不能只认「最后一个 '{'」：指令一旦带嵌套（bond / flag / battle 全是对象），
 * 最后那个 '{' 恰好是**里层**那个 —— 拿 {"flag":{"trust":5}} 来说，从 {"trust":5}
 * 起算照样配平、照样 JSON.parse 得动，白名单一过就成了 {}：面板报「已收到事件指令」，
 * 可什么也没落地，正文里还留一截 {"flag": 的残骸。这就是「事件指令总是出错」的主因。
 *
 * 所以先按「收尾之后只剩噪声」筛一遍，再从命中的起心里取**最靠前**的那个 ——
 * 起心越靠前，对象越大，越可能是整块指令。筛不出（模型在 JSON 后面还絮叨了两句）
 * 再退回旧口径，至少不比以前差。
 */
function firstBalancedJsonCandidate(text: string): string | null {
  const starts: number[] = []
  // 从后往前收起点。裸指令就在文末，64 个足够覆盖正文里的零散花括号
  for (let i = text.length - 1; i >= 0 && starts.length < 64; i--) {
    if (text[i] === '{') starts.push(i)
  }
  let best: string | null = null
  for (const start of starts) {
    const end = balancedEnd(text, start)
    if (end < 0) continue
    if (!TAIL_NOISE_RE.test(text.slice(end))) continue
    // starts 是从后往前攒的：越晚遍历到，起心越靠前 —— 最后落定的就是最外层那个
    best = text.slice(start, end)
  }
  if (best !== null) return best
  for (const start of starts) {
    const end = balancedEnd(text, start)
    if (end > 0) return text.slice(start, end)
  }
  return null
}

/* 字符串原样留着；字符串外的注释删掉；} 或 ] 之前的尾逗号删掉 —— 分组 1 是字符串 */
const JSON_NOISE_RE = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\/|,(\s*[}\]])/g

/* 字符串外头的这些全角标点，模型（尤其中文模型）一顺手就写出来了：
   {"met"：["luna"]}、{"bond":[{"char"："luna"，"delta"：2}]}。
   JSON.parse 见了直接抛，抛了整块指令就丢 —— 玩家看到的就是「事件指令出错」。
   弯引号也算在内：模型拿它当字符串定界符时，得先换成直引号，
   后面那道「字符串里不许动」才认得出哪儿是字符串。 */
const FULLWIDTH_STRUCT: Record<string, string> = {
  '：': ':', '，': ',', '｛': '{', '｝': '}', '［': '[', '］': ']',
  '“': '"', '”': '"', '＂': '"',
}
/* 字符串原样留着，字符串外逐字替换 —— 分组 1 是字符串，分组 2 是待换的全角标点 */
const OUTSIDE_STRING_RE = /("(?:[^"\\]|\\.)*")|([：，｛｝［］“”＂])/g

/** `<vars>` 里那块 JSON：按上面那套容错解一遍；解不动返回 null（交给上游的兜底） */
function parseVarsRaw(raw: string): Record<string, unknown> | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const v: unknown = JSON.parse(repairJson(t))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function fixFullwidthStruct(m: string, str?: string, ch?: string): string {
  if (str !== undefined) return str
  if (ch !== undefined) return FULLWIDTH_STRUCT[ch] ?? ch
  return m
}

/**
 * 修「差一点点」的 JSON：全角结构标点、尾逗号、`//` 注释、BOM 与零宽字符。
 * 这几样在 JSON.parse 那里是直接抛的，抛了整块指令就丢 —— 正文照旧上屏，
 * 玩家看到的是「叙述有了、变量没落地」，也就是「事件指令出错」。
 * 只修格式，不猜语义：不动键名、不改字符串里的一个字（全角标点也只换字符串外头的）。
 */
function repairJson(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .replace(/[\u200b-\u200d\u2060]/g, '')
    // 先把全角结构标点归正：下面那道「认字符串」靠的是直引号，定界符得先摆正
    .replace(OUTSIDE_STRING_RE, fixFullwidthStruct)
    .replace(JSON_NOISE_RE, (_m, str: string | undefined, tail: string | undefined) => {
      if (str !== undefined) return str
      if (tail !== undefined) return tail
      return ''
    })
}

/**
 * 容错解析：优先取「最后一个 ```json 围栏块」；其次退化扫描平衡 {…}。
 * 永不 throw。directive 恒为净化后的对象（可能为空 {}）；找不到返回 null。
 */
export function parsePlotReply(raw: string): PlotReply {
  const text = typeof raw === 'string' ? raw : ''
  if (!text.trim()) return { narrative: '', directive: null, found: false }

  let segment: string | null = null
  let segStart = -1
  let segEnd = -1

  // 1) 围栏块（含语言标注 json / JSON）—— 换行可有可无：```json{…}``` 也是一样的意思
  const fenceRe = /```[ \t]*([a-zA-Z]*)[ \t]*\r?\n?([\s\S]*?)```/g
  let m: RegExpExecArray | null
  let lastFence: { start: number; end: number; content: string } | null = null
  while ((m = fenceRe.exec(text)) !== null) {
    const content = m[2]
    const lang = (m[1] ?? '').toLowerCase()
    if (lang === 'json' || lang === '' || /json/i.test(content.slice(0, 60))) {
      lastFence = { start: m.index, end: fenceRe.lastIndex, content }
    }
  }
  if (lastFence) {
    segment = lastFence.content
    segStart = lastFence.start
    segEnd = lastFence.end
  } else {
    // 2) 平衡括号退化
    segment = firstBalancedJsonCandidate(text)
    if (segment !== null) {
      segStart = text.indexOf(segment)
      segEnd = segStart + segment.length
    }
  }

  let directive: PlotDirective | null = null
  let found = false
  if (segment !== null) {
    try {
      // 修过格式再 parse：尾逗号 / 注释 / 零宽字符只让 JSON.parse 抛，不该让整块指令陪着丢
      const parsed: unknown = JSON.parse(repairJson(segment))
      directive = sanitizeDirective(parsed)
      found = true
    } catch {
      directive = null
    }
  }

  // 正文：剥掉指令区间，并把接口处那几行残迹一并收干净
  let narrative = text
  if (segStart >= 0) {
    const before = text.slice(0, segStart)
    const after = text.slice(segEnd)
    narrative = [trimSeamEnd(before), trimSeamHead(after)].filter(Boolean).join('\n')
  } else {
    // 指令区没能认出来（裸写又没配平、或被输出预算截断），但正文里还留着指令的**界标**：
    // 最后一条「—— 事件指令 ——」标签行，或者最后一个落单的围栏行。
    // 界标之后就是指令的地盘 —— 一律不往正文里放。否则 {"flag": 这样的残骸会当旁白上屏。
    // 注意要从**整篇**里找最后一条界标，不能只看文末那一串：
    // 残骸本身既不是标签行也不是空行，只看文末的话第一行就被它挡回来了。
    const lines = narrative.split('\n')
    let cut = -1
    for (let i = lines.length - 1; i >= 0; i--) if (LABEL_RE.test(lines[i])) { cut = i; break }
    if (cut < 0) for (let i = lines.length - 1; i >= 0; i--) if (/^\s*```/.test(lines[i])) { cut = i; break }
    if (cut >= 0) narrative = lines.slice(0, cut).join('\n')
  }

  return { narrative: narrative.replace(/\n{3,}/g, '\n\n').trim(), directive, found }
}

/* ============================================================
   标签化回执（双格式协议，见 buildDirectorSystem 末尾）
   ------------------------------------------------------------
   JSON 围栏仍是默认；当回执里确有 <maintext>/<option>/<vars> 时才走
   标签路径。标签路径的指令字段与 JSON 完全同 schema，仍经
   sanitizeDirective 白名单净化后，与 JSON 路径汇合到 applyDirective
   同一条落地管线。混合输出（标签正文 + 尾随 JSON 指令）也能落地。
   ============================================================ */

export interface DirectorReply extends PlotReply {
  /** 标签化回执的正文（<maintext>；无则用剥净后的正文） */
  options: string[]
  /** <thinking>/<think> 推演（不展示给操作员也不参与正文） */
  thinking: string
  /** <vars> 原文（可为 ''） */
  varsRaw: string
  /** 本回合是否带有可落地的 <vars> 指令 */
  hasVars: boolean
  /** 回执来源：tags=标签化 · json=JSON 围栏 · none=无指令 */
  source: 'tags' | 'json' | 'none'
}

/**
 * 外来标签（酒馆预设自带的那一整套）。
 * 预设把回执写成 <dream_body>…</dream_body>，外面再套 <dream_after_format>、
 * <dream_history>、<dream_setting>、<thought_of_chain>、<UpdateVariable>… 这些旁注块。
 * 换一份预设就换一套名字（本机那份 114 条里至少十几个），所以**不写死名单，反过来认自己人**：
 *   · 本终端自己的协议（maintext / option / vars / thinking）原样留着；
 *   · body 类（dream_body / dream_maintext）只脱壳，壳里的字就是正文；
 *   · 其余成对出现的标签块一律整块丢掉 —— 那是导演写给自己的批注，不是给观测者读的话；
 *   · 少数 HTML 行内标签只留字（正文里真用它做强调时，不至于连内容一起吃掉）。
 * 不这么做，那些标签名会原样漏进正文、流式气泡与短信里。
 */
const OWN_TAG_RE = /^(?:maintext|option|vars|thinking)$/i
/** 行内 HTML：只当标记，内容留下 */
const HTML_TAG_RE = /^(?:a|b|i|u|s|em|strong|span|code|small|sub|sup|ruby|rt|br|p)$/i
/** body 类标签：只脱壳，内容留下当正文 */
const BODY_TAG_RE = /<\s*\/?\s*(?:dream_body|dream_maintext)\b[^>]*>/gi
/** 成对标签块：名字取反 —— 不是自己人、也不是行内 HTML，就连内容一起去掉 */
const PAIR_RE = /<\s*([a-zA-Z][a-zA-Z0-9_:-]*)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/g
/** 收尾处没闭合的外来开标签（只认旁注那几个家族，免得误吃正文里的尖括号） */
const ALIEN_OPEN_RE = /<\s*(?:simple_thinking|thought_of_chain|think|dream_[a-z_]+|dreamer_[a-z_]+)\b[^>]*>(?:(?!<\s*\/)[\s\S])*$/i

/** 把外来的 body 标签与旁注块清掉（正文保留） */
function stripAlienTags(s: string): string {
  if (!s) return ''
  const t = s
    .replace(BODY_TAG_RE, '')
    .replace(PAIR_RE, (m, name: string) => (OWN_TAG_RE.test(name) || HTML_TAG_RE.test(name) ? m : ''))
    .replace(ALIEN_OPEN_RE, '')
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 展示层清洗（**只用于要显示出去的文本**，绝不放在解析之前）。
 * 剥掉代码围栏与零零散散漏进来的尖括号标签 —— 预设带来的格式残留、模型偶尔
 * 夹带的 ```json 块，都不该出现在观测者读的正文里。
 * 注意：指令 JSON 本身是写在 ``` 围栏里的，所以这一步只能在展示路径上做。
 */
function scrubDisplay(s: string): string {
  return s
    .replace(/```[\s\S]*?(?:```|$)/g, '')
    .replace(/<\/?[a-zA-Z][^<>]{0,200}>/g, '')
    // 生成途中被截断、还没等到 '>' 的半截标签：只在文末出现时摘掉。
    // 名字至少三个字符 —— 免得把「a<b 也行」这种正文里的比较符号当成标签切掉
    .replace(/<[a-zA-Z][a-zA-Z0-9_:-]{2,}(?:\s[^<>]*)?$/, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const TAG_BLOCK_RE = /<\s*(?:maintext|option|vars|thinking|think)\b[\s\S]*?<\s*\/\s*(?:maintext|option|vars|thinking|think)\s*>/gi

/** 剥离已知标签块（用于标签缺席 <maintext> 时的正文兜底） */
function stripBlockTags(s: string): string {
  return stripAlienTags(s).replace(TAG_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 容错双格式解析：先按原 JSON 路径兜底；检测到标签则叠加标签解析。
 * 永不 throw。directive/found 语义与 parsePlotReply 一致，供 needDir 复用。
 */
export function parseDirectorReply(raw: string): DirectorReply {
  // 先把外来标签清干净：body 脱壳，旁注块整块去掉，再走本终端自己的协议
  const text = stripAlienTags(typeof raw === 'string' ? raw : '')
  const json = parsePlotReply(text)
  const base: DirectorReply = {
    ...json,
    options: [],
    thinking: '',
    varsRaw: '',
    hasVars: false,
    source: json.found ? 'json' : 'none',
  }
  if (!/<(maintext|option|vars|thinking|think)\b[\s>]/i.test(text)) {
    return base
  }

  const parser = new StreamTagParser(['maintext', 'option', 'vars'], ['thinking', 'think'])
  const events = [...parser.feed(text), ...parser.finish()]
  const parsed = aggregateEvents(events)

  const maintext = parsed.maintext.trim()
  const thinking = parsed.thinking.trim()
  const options = parsed.options.map((o) => o.trim()).filter(Boolean)
  const varsRaw = parsed.varsRaw.trim()
  const hasVars = varsRaw.length > 0

  let directive: PlotDirective | null
  let found: boolean
  if (hasVars) {
    /* <vars> 里那块 JSON 走**本终端同一套容错**（全角标点、尾逗号、注释、零宽）。
       tavernlike 那边的 parseVarsBlock 是通用件、只认标准 JSON，坏了就当空补丁 ——
       坏在「found 仍然是 true、directive 是 {}」：面板报「已收到指令」，什么也没落地，
       查都没处查。这里自己再解一遍，解得动就用它。 */
    const loose = parseVarsRaw(varsRaw)
    directive = sanitizeDirective(loose ?? parsed.varsCommands.merge)
    found = true
  } else {
    directive = json.directive
    found = json.found
  }

  const narrative = maintext || stripBlockTags(json.narrative) || json.narrative

  const usedTags = Boolean(maintext || hasVars || options.length || thinking)
  return {
    narrative: scrubDisplay(narrative),
    directive,
    found,
    options,
    thinking,
    varsRaw,
    hasVars,
    source: usedTags ? 'tags' : base.source,
  }
}

/**
 * 一条回执里「能上屏的那部分正文」。
 *
 * **绝不回落到原文**。原文兜底看着稳妥，实则是最难查的一种坏法：回执如果整份就是一块指令
 * （补发那一路正是如此 —— 提示词明说「仅输出指令本身，无需展开叙述」，模型照办），
 * 回落到原文就是把 {"bond":[{"char":"luna","delta":2}]} 原样摊进气泡给玩家看。
 * 效果其实落地了，可屏幕上是这么一坨，谁看都以为「事件指令出错」。
 *
 * 剥干净之后仍是空串，就说明这一条本来就没有正文可上屏 —— 交给调用方当「空」处理，
 * 别替它硬凑一行字出来（凑出来的每一个字都不在设定里）。
 */
export function replyDisplayText(r: DirectorReply, raw: string): string {
  return r.narrative.trim() || extractLiveDisplay(raw).trim()
}

/* ============================================================
   流式「活气泡」投影
   ------------------------------------------------------------
   导演回执在生成途中是未闭合的原文：<vars>/<thinking> 等结构块
   只写到一半、JSON 围栏只开了头。extractLiveDisplay 只做「显示」
   用的无副作用投影——把已生成部分剥成可看的正文，绝不参与落地
   （落地永远只跑一次 parseDirectorReply(full) 权威收口）。
   - 完整或半截的隐藏块（thinking/think/vars/option）整块剔除；
   - 完整或悬空的 JSON 围栏剔除；文末孤立的「事件指令」标签行剔除；
   - <maintext> 区只剥开合标记、区内内容（含进行中）保留；
   - 其余裸文原样保留。
   ============================================================ */

export function extractLiveDisplay(raw: string): string {
  let s = stripAlienTags(typeof raw === 'string' ? raw : '')
  if (!s) return ''

  // 1) JSON 围栏：完整 ```…``` 或从第一个 ``` 到文末的悬空围栏，整体摘除
  s = s.replace(/```[\s\S]*?(?:```|$)/g, '')

  // 2) 完整闭合的隐藏标签块整块剔除
  s = s.replace(/<\s*(?:thinking|think|vars|option)\b[^>]*>[\s\S]*?<\s*\/\s*(?:thinking|think|vars|option)\s*>/gi, '')

  // 3) 悬空半截的隐藏块（有开头没结尾）→ 自开头剔到文末
  s = s.replace(/<\s*(?:thinking|think|vars|option)\b[\s\S]*$/gi, '')

  // 4) <maintext> 只剥开合标记，区内正文保留（含未闭合的进行中内容）
  s = s.replace(/<\s*\/?\s*maintext\b[^>]*>/gi, '')

  // 5) 剥掉围栏/标签后仍露出的文末「—— 事件指令 ——」等孤立行
  const lines = s.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (LABEL_RE.test(t)) { lines.pop(); continue }
    if (t === '') { lines.pop(); continue }
    break
  }
  s = lines.join('\n')

  // 6) 收尾再走一遍展示清洗：漏网的尖括号标签、半截标签、多余空行
  return scrubDisplay(s)
}

/* ============================================================
   指令落地（由视图把 Terminal 的写操作注入进来）
   ============================================================ */

export interface DirectiveApi {
  meetChar: (charId: string) => void
  bumpBond: (charId: string, delta: number) => void
  registerEnd: (id: string) => void
  setFlag: (k: string, v: FlagValue) => void
  /** 私密档案推进（约会 / 私密往来落下的开发度与状态；见 data/intimate.ts） */
  bumpIntim: (charId: string, p: IntimateProgress) => void
  /**
   * 贴身衣物推进（穿着档位 / 湿润增量；见 data/attire.ts）。
   *
   * `arouse` = 同一次里这个人涨了多少色情度 —— 「因为发情而湿润」那一半的耦合
   * 落在 `mergeAttire` 里（规矩在那儿，这里只负责把数递下去）。
   */
  bumpAttire: (charId: string, p: AttireProgress, arouse: number) => void
  /** 次数账推进（八栏增量；见 data/acts.ts） */
  bumpActs: (charId: string, add: ActCount) => void
  /** 关系档位（**绝对**档位，不是增量；见 data/rel.ts） */
  setRel: (charId: string, tier: RelId) => void
}

export interface DirectiveEffects {
  met: string[]
  bonds: { char: string; delta: number }[]
  ends: { key: string; id: string }[]
  flags: [string, FlagValue][]
  /** 导演点名的 CG id（约会那一路：调用方按**这一场约会**落到 world.cg[d:uuid]） */
  cg?: string
  /** 导演修正的在场名册（调用方按**当前事件**落到 world.cast[evId]，全量覆盖） */
  cast?: string[]
  diverged: boolean
  eventDone: boolean
  digest?: string
  /** 角色发出的邀约（调用方落成一场约会线程） */
  date?: { kind?: 'date' | 'intimate'; title?: string; place?: string; time?: string }
  /** 本次实际推进的私密读数（供提示条念一句；部位与色情度可以只来其一） */
  intim: { char: string; slot?: IntimateSlot; lewd?: number }[]
  /**
   * 本次实际落下的贴身衣物推进（供提示条念一句）。
   * 含**只由色情度带出来**的那一半 —— 那一半也是真的落了，不该瞒着操作员。
   */
  attire: AttireDirective[]
  /** 本次实际记下的次数（逐人一条；供提示条念一句） */
  acts: { char: string; add: ActCount }[]
  /** 本次实际落下的关系档位（逐人一条；绝对档位） */
  rel: { char: string; tier: RelId }[]
}

export interface ApplyOpts {
  /**
   * **这一回合的羁绊一律不落**（自由活动：卷间那一格，或操作员按下的另一枚开关）。
   *
   * 拦在这一层、而不是只写在提示词里 —— 「自由时间里好感不动」是这条设计的
   * 规矩本身，不能只靠模型听话。给了也不落，且**不进 `fx.bonds`**：
   * 兜里那条提示不该报一件没发生的事。
   */
  freezeBond?: boolean
}

/** 把净化后的指令落地到世界状态；返回实际产生的影响（供视图 toast/结算） */
export function applyDirective(
  d: PlotDirective,
  api: DirectiveApi,
  opts: ApplyOpts = {},
): DirectiveEffects {
  const fx: DirectiveEffects = {
    met: [], bonds: [], ends: [], flags: [], diverged: false, eventDone: false,
    intim: [], attire: [], acts: [], rel: [],
  }

  for (const id of d.met ?? []) {
    api.meetChar(id)
    fx.met.push(id)
  }
  /* 自由活动：整条 bond 跳过（连 fx 都不记 —— 提示条不该念一件没落的事） */
  for (const b of opts.freezeBond ? [] : d.bond ?? []) {
    const delta = clamp(Math.round(b.delta), -100, 100)
    api.bumpBond(b.char, delta)
    fx.bonds.push({ char: b.char, delta })
  }
  for (const key of d.ends ?? []) {
    const id = resolveEndKey(key)
    if (id) {
      api.registerEnd(id)
      fx.ends.push({ key, id })
    }
  }
  for (const [k, v] of Object.entries(d.flag ?? {})) {
    api.setFlag(k, v)
    fx.flags.push([k, v])
  }
  // CG 点名不在这儿落盘：applyDirective 手里没有「这一场是哪个约会」，
  // 硬塞就得给 DirectiveApi 再加一层。改由调用方读 fx.cg，配着自己知道的约会 id 写。
  if (d.cg) fx.cg = d.cg
  // 在场的实时名册同理：手里没有「当前事件 id」，由调用方读 fx.cast 自己写
  if (d.cast?.length) fx.cast = d.cast
  /* 私密推进：一条一项地合成成 IntimateProgress 递下去。
     破处对象由这一层定 —— `first` 置位即记为「言万心叶」（'you'），
     底下的合成规则只认第一次落下的那个，之后再给也改不动；
     「最近的性行为」与「看法」照旧后写覆盖。 */
  for (const it of d.intim ?? []) {
    const prog: IntimateProgress = {}
    if (it.slot) {
      if (typeof it.dev === 'number' && it.dev !== 0) prog.dev = { [it.slot]: it.dev }
      if (it.state) prog.state = { [it.slot]: it.state }
      if (it.first) prog.firstBy = 'you'
    }
    if (typeof it.lewd === 'number' && it.lewd !== 0) prog.lewd = it.lewd
    if (it.lastAct) prog.lastAct = it.lastAct
    if (it.view) prog.view = it.view
    if (!prog.dev && !prog.state && !prog.firstBy && !prog.lewd && !prog.lastAct && !prog.view) continue
    api.bumpIntim(it.char, prog)
    fx.intim.push({
      char: it.char,
      ...(it.slot ? { slot: it.slot } : {}),
      ...(it.lewd ? { lewd: it.lewd } : {}),
      /* 提示条上要念得出「最近一回 / 看法也动了」—— 只传布尔以外的原话，让 intimAdvanceLabel 认得 */
      ...(it.lastAct ? { lastAct: it.lastAct } : {}),
      ...(it.view ? { view: it.view } : {}),
    })
  }
  /* 贴身衣物：先收一遍这一回合各人的色情度增量 —— 湿润的另一半来路是它
     （「因为发情而湿润」；规矩在 data/attire.ts 的 mergeAttire 里，这里只递数）。 */
  const arouse = new Map<string, number>()
  for (const it of d.intim ?? []) {
    if (it.lewd) arouse.set(it.char, (arouse.get(it.char) ?? 0) + it.lewd)
  }
  const dressed = new Set<string>()
  for (const at of d.attire ?? []) {
    dressed.add(at.char)
    const prog: AttireProgress = {}
    const wear: Partial<Record<AttireSlot, AttireWear>> = {}
    if (at.bra) wear.bra = at.bra
    if (at.panties) wear.panties = at.panties
    if (Object.keys(wear).length) prog.wear = wear
    if (typeof at.wet === 'number' && at.wet !== 0) prog.wet = at.wet
    api.bumpAttire(at.char, prog, arouse.get(at.char) ?? 0)
    fx.attire.push(at)
  }
  /* 没给 attire 那一条、色情度却真的涨了的人：补一次**只带耦合那一半**的推进。
     发情本来就该把内裤洇开 —— 让模型为这件事再报第二遍是白费一次机会
     （它同一次里报得越少，别处就报得越准）；涨不够一分的（WET_PER_LEWD）不补。
     递下去的是空推进 + `arouse`，湿润那一分由 mergeAttire 自己算，不重复计。 */
  for (const [char, amount] of arouse) {
    if (dressed.has(char)) continue
    const coupled = Math.floor(amount / WET_PER_LEWD)
    if (coupled <= 0) continue
    api.bumpAttire(char, {}, amount)
    fx.attire.push({ char, wet: coupled })
  }
  /* 次数账：逐人并进那本累计账（`mergeActs` 只加不减，这里只负责递下去）。
     与 intim 各自独立 —— 同一次里可以只动次数不动开发度（例如只是多亲了几回），
     也可以只动开发度而没有新的回数（第一次那一下未必由增量带出来）。 */
  for (const [char, add] of Object.entries(d.acts ?? {})) {
    if (!Object.keys(add).length) continue
    api.bumpActs(char, add)
    fx.acts.push({ char, add })
  }
  /* 关系档位：给的是绝对档位，所以这里原样透传 —— 比较与去重交给下面那一层
     （视图知道自己手里此刻是哪一档，能顺带判断「真的变了没有」）。 */
  for (const [char, tier] of Object.entries(d.rel ?? {})) {
    api.setRel(char, tier)
    fx.rel.push({ char, tier })
  }
  if (d.date) fx.date = d.date
  fx.diverged = d.diverged === true
  fx.eventDone = d.eventDone === true
  if (d.digest) fx.digest = d.digest

  return fx
}

/** 指令里是否存在会造成世界变化的内容（决定可否提供「重写此回复」） */
export function directiveHasFx(d: PlotDirective | null): boolean {
  if (!d) return false
  return Boolean(
    (d.met && d.met.length) ||
      (d.bond && d.bond.length) ||
      (d.ends && d.ends.length) ||
      (d.flag && Object.keys(d.flag).length) ||
      Boolean(d.cg) ||
      (d.cast && d.cast.length) ||
      d.diverged === true ||
      d.eventDone === true ||
      Boolean(d.battle?.name) ||
      Boolean(d.date) ||
      Boolean(d.intim?.length) ||
      Boolean(d.attire?.length) ||
      Boolean(d.acts && Object.keys(d.acts).length) ||
      Boolean(d.rel && Object.keys(d.rel).length),
  )
}

/**
 * 短信专用过滤：只放行「当前角色」的小幅羁绊（±3）与分支标记；
 * 不放行 met / ends / eventDone。无可放行内容返回空指令 {}。
 *
 * **放行 `date`（邀约）而不放行 `intim`**：一条短信可以把人约出去，
 * 但**身体上的推进不发生在短信里** —— 那是见了面、在约会线程里落的事
 * （见 dateDirective 与 lib/rendezvous.ts）。这样「档案上的开发度」永远对得上
 * 「确实见过的那几面」，不会靠一条文字就跳。
 */
export function smsDirective(d: PlotDirective | null, charId: string): PlotDirective {
  if (!d) return {}
  const out: PlotDirective = {}
  if (d.bond) {
    const bond = d.bond
      .filter((b) => b.char === charId)
      .map((b) => ({ char: b.char, delta: clamp(Math.round(b.delta), -3, 3) }))
    if (bond.length) out.bond = bond
  }
  if (d.flag && Object.keys(d.flag).length) out.flag = d.flag
  // 托付：短信里被正式交代下来的事，落到「电话 · 任务列表」
  if (d.task && d.task.length) out.task = d.task
  // 邀约：她在信里把人约出去 —— 落成一场独立的约会线程
  if (d.date) out.date = d.date
  return out
}

/**
 * 约会专用过滤（约会线程里的一轮）：走到这一步人已经在眼前了，
 * 放行的比短信宽 ——
 *   · bond：只认**对方**，一次 ±5（一场约会里的分量比一条短信重）；
 *   · met / ends / flag / task：照放（约会也能遇见人、撞见图鉴实体、被托付事）；
 *   · cg：照放（这一场该摆哪张画，由调用方落到 world.cg[d:uuid]）；
 *   · intim / acts：**只有这一路放行**（私密档案与次数账都只发生在见面的时候），
 *     intim 的开发度增量再收一道到 ±3 一回合（sanitize 那道 8 是单项上限）。
 *   · rel：照放（关系档位由剧情给 —— 见面正是一段关系往前走的地方）。
 *   · eventDone / diverged / digest：**不放行** —— 约会是主线之外另开的一条线程，
 *     不能替主线把那一段判成走完。
 *
 * `party` 是**这一场还带着谁**（1 男多女的那种见面，见 lib/rendezvous.ts 的
 * `Rendezvous.party`）：给了就把这几个人一并放进许可名单 —— 不然同场那几位
 * 既写不进正文的读数，档案上也留不下痕迹。
 */
export function dateDirective(d: PlotDirective | null, charId: string, party: string[] = []): PlotDirective {
  if (!d) return {}
  const out: PlotDirective = {}
  /** 这一场允许记谁：主角约的那一位 + 同场的几位 */
  const allowed = new Set<string>([charId, ...party])
  if (d.bond) {
    const bond = d.bond
      .filter((b) => allowed.has(b.char))
      .map((b) => ({ char: b.char, delta: clamp(Math.round(b.delta), -5, 5) }))
    if (bond.length) out.bond = bond
  }
  if (d.met && d.met.length) out.met = d.met
  if (d.ends && d.ends.length) out.ends = d.ends
  if (d.flag && Object.keys(d.flag).length) out.flag = d.flag
  if (d.task && d.task.length) out.task = d.task
  if (d.cg) out.cg = d.cg
  if (d.intim && d.intim.length) {
    const intim = d.intim
      .filter((it) => allowed.has(it.char))
      .map((it) => ({
        ...it,
        ...(typeof it.dev === 'number' ? { dev: clamp(Math.round(it.dev), 1, 3) } : {}),
        ...(typeof it.lewd === 'number' ? { lewd: clamp(Math.round(it.lewd), 1, 3) } : {}),
      }))
    if (intim.length) out.intim = intim
  }
  if (d.attire && d.attire.length) {
    /* 贴身衣物照放（与 intim 同一道门：人都已经在眼前了），湿润再收一道到 ±10
       —— sanitize 那道 ±30 是单项上限；一场见面里挪太多，等于一次跳完。 */
    const attire = d.attire
      .filter((at) => allowed.has(at.char))
      .map((at) => ({
        ...at,
        ...(typeof at.wet === 'number' ? { wet: clamp(Math.round(at.wet), -10, 10) } : {}),
      }))
    if (attire.length) out.attire = attire
  }
  if (d.acts) {
    const acts: Record<string, ActCount> = {}
    for (const [char, add] of Object.entries(d.acts)) {
      if (allowed.has(char)) acts[char] = add
    }
    if (Object.keys(acts).length) out.acts = acts
  }
  if (d.rel) {
    const rel: Record<string, RelId> = {}
    for (const [char, tier] of Object.entries(d.rel)) {
      if (allowed.has(char)) rel[char] = tier
    }
    if (Object.keys(rel).length) out.rel = rel
  }
  return out
}

/* ============================================================
   导演系统提示词（只用大纲，不喂开场白正文）
   ============================================================ */

export interface DirectorCtx {
  /** 操作员显示名（剧情本体固定为 言万心叶） */
  operatorName: string
  /** 当前各角色羁绊取值（此刻真实的关系：初见值 + 主角行为）；缺省退回原著同段读数 */
  bondNow?: (charId: string) => number
  /** 已收束事件表：用来判断剧情读到哪一段，从而决定该角色此刻怎么称呼主角 */
  epDone?: Record<string, true>
  /** 已存在的分支标记（可选，供模型感知已偏离的状态） */
  flags?: Record<string, FlagValue> | null
  /**
   * **此刻**在场上的人（`world.cast[ev.id]` 那一层实时修正）。
   *
   * 给了就以它为准、不给才退回事件静态名册（`ev.cast`）—— 于是这一段里
   * 谁先离席、谁刚赶到，下一回合的提示词里也就跟着变了。
   * 【在场角色 · 性情锚】与前面那份关系读数都读同一个名单，两处不会各说各话。
   */
  castNow?: string[]
  /**
   * 此刻各角色的**关系档位**（`world.rel[charId]`，由剧情给过的那一档）。
   *
   * 与 `bondNow` 并列：羁绊是读数，这一栏是「两个人之间到底走到哪儿了」——
   * 两者可以不同（同样 80 的羁绊，可以是并肩的战友，也可以是把话挑明的恋人）。
   * 没给过的那几位返回 undefined，提示词里照实读作「尚未定下」。
   */
  relOf?: (charId: string) => RelId | undefined
  /** 是否处于「重试补发指令」：要求本回合必须带指令块 */
  needDirective?: boolean
  /**
   * **自由活动**（卷与卷之间的空档，或操作员自己按下的那一枚开关）。
   *
   * 只影响提示词这一侧：换掉主线那份【事件大纲】、把 bond 从指令里去掉、
   * 明写「羁绊一律不动」。**真正拦住 bond 的不是这里** ——
   * 是落地那一层的 `applyDirective(d, api, { freezeBond: true })`。
   * 提示词只是别让模型白写一条会被丢掉的 bond。
   */
  freeMode?: boolean
  /** 世界书命中参考段（由 lorescan 生成；置顶在指令说明之前，仅作延续性背景） */
  loreContext?: string
  /** 后接事件锚（软门禁）：在线整回合推演时给出；让导演判断收束能否自然引向后接事件，才允许 eventDone */
  nextEvent?: TimelineEvent | null
  /** 预设指令（管「如何理解」）：紧贴导演规则之后注入 */
  presetPre?: string
  /** 预设指令（管「如何输出」）：紧贴事件指令 schema 之前注入 */
  presetPost?: string
  /** 近期作战记录摘要（取自隐藏存档；用来承接已打过的任务，防前后文不搭） */
  battleLog?: string
  /**
   * 近期短信摘要 —— **只取与此刻在场者有关的那几本**（由 lib/crosslink.ts 的
   * `smsContextFor` 生成；无关的线程一个字都不给）。
   *
   * 与 battleLog 同格：都是「已经发生的事」，只作延续性背景、不许逐条复述。
   * 单开一格的理由是它带来的**另一类**事实 —— 作战记录说的是「打过什么」，
   * 短信说的是「两个人之间说定了什么」（约好的见面就在这一格里）。
   */
  smsLog?: string
  /**
   * 本回合操作员在操作栏里写下的原话（言万心叶的行动）。
   *
   * 给出来时，提示词**末尾**会摆一节【本回合 · 他的意志】，逐字引它并声明压过以上一切
   * （含事件大纲、原文情节线、落点、后接事件）。位置的用意就是分量：最后读到的是他的话。
   * 不给（AI 起草那一路）则整节不出现，行为与从前一致。
   */
  operatorAction?: string
  /**
   * 这一回合操作栏是空的（他没有新写下什么）。
   * 与 operatorAction 互斥、且各占提示词最末的同一个位置：
   * 给了 operatorAction 就走 willSection，只给 idle 就走 idleSection，两个都不给则整节不出现。
   */
  idle?: boolean
}

/** 预设段：非空时前置两个换行，与 loreSection / anchor 同款写法 */
const presetSection = (s?: string) => (s ? `\n\n${s}` : '')

function outlineRules(opName: string, free = false): string {
  return `你是《这里是，终末停滞委员会。》的剧情导演，同时扮演在场的全部角色。
- 用简体中文、以第三人称全局叙述推进当前事件；可在叙述中点出在场角色的神态、动作与简短对白（对白用「」）。
- 操作员扮演的是【言万心叶】${opName !== '言万心叶' ? `（操作员显示名「${opName}」，仅称呼无关情节）` : ''}——你只能叙述他行动的客观结果与读心感知，绝不能替他下决定、替他说话，也不要替他推进他本人该主动做的事。
- **这一回合以言万心叶的意志为中心。** 他明确说了要做什么、要达成什么，那句话就是**既成前提**、**压过本节的一切**，不是待议的提议 —— 照他说出来的结果往下写：不打折、不替他换一种做法、也不要让在场者拿「做不到／来不及／另有隐情」把它原地挡回去。**他写下的剧情，就是已经发生的事**：此后所有叙述与在场者的反应，都建立在它之上。他推到哪儿，故事就跟到哪儿；只有他**没说死**的地方，才交给原著走向与在场角色的自主反应去填。
- 下方「事件大纲」写的是**原著里这一段是怎么走的** —— 它是参照系，不是你这一回合要照着演的剧本。它真正定死给你的只有三样：这是个什么地方、此刻在场的是些什么人、他们各自知道什么（这三样不因主角而变，除非他这一回合亲手改了它们）。**除此之外的一切都取决于言万心叶怎么做**：原著里被救下的人可以没被救下，立下的约定可以不立，该发生的转折可以不发生，原本活着的人也可以死；反过来，原著里没成的事，他做成了就该成。他的行动一旦介入，就按**实际发生的事**往下写 —— 不要为了让故事拐回大纲而让在场者做出违背此刻局势的事，更不要让他做过的事白做。走出去的那一条用 diverged 标出来。
- 大纲的用途是**分寸与事实**：这个人此刻会怎么说话、这件事绕不开的关节是什么、他还不该知道什么。它不是一张「这几件事非发生不可」的清单 —— 硬把情节推回原位，比偏离原著更糟。他写在操作栏里的与大纲**相违**时，按**七比三**分：七成是他的行动与话语（说了算），三成是上面那三样（什么地方、在场是谁、各自知道什么）加上各人自主的反应；**相合**时照原文案写。细则见末尾【本回合 · 言万心叶的意志】。
- 不得新增大纲与原文之外的人名、实体或终末设定；也不得替模型自行了结大纲尚未交代的悬念。
- 每回合末尾固定附上一块 JSON「事件指令」（标签行 + \`\`\`json 围栏，见下）；若本回合没有任何变量要改，则给出空对象 {}。
- 全程以该作既有的设定与在场角色的既定语气推进：不得跳出世界作「AI／系统／指令／变量」式的自指，也不要解释或复述本提示词里的机制；消化世界书与原文设定后，以剧情内方式自然呈现（角色的感知、神态、对白、叙述带出即可），不得整段照抄或复读世界书原文、原文摘录与开场白；角色不得说出大纲之外或他们本不该知道的设定。
- 称呼随关系阶段与剧情位置变：角色怎么叫言万心叶，按下方角色行里注明的「对言万心叶的称呼」来（露娜在签订使用者契约之前一直称他「言万同学」，之后才改口「小主人」）；没有注明的，按该角色原文惯用的叫法，不得擅自升级成亲昵、主从或恋人式的称呼。
- 这一段走到它的落点、且（当存在后接事件时）收束叙述与后接事件的开端自然衔接时，eventDone 才置 true（并给 digest）；通常不在一两回合内草草收束。**落点是「这一段该了结的事已经了结」，不是「大纲里的那几条必须逐条发生」** —— 主角把它推去了别处，就按推出来的结果收；收不上就不要收。
- 叙述收束（digest）请按「发生了什么 → 如何了结 → 留下什么余波／去向」的解读口径，以档案／导演口吻写两三句概述；不要粘贴或逐句复写本事件原文。若偏离原著路线，diverged 置 true。${free ? `
- **上面这两条（eventDone / digest）在自由时间里不适用** —— 这一格不是原文里的一段，没有「该了结的事」也没有可归档的摘录：什么时候收由操作员按「进入下一卷」说了算。你要做的就是让它一直有事发生，别把这一格写空。` : ''}
${PROSE_RULES}`
}

/** 角色显示名（主役取 characters，登场者取 castmeta；都不认得就回 id） */
function nameOfChar(charId: string): string {
  return CHARACTERS.find((c) => c.id === charId)?.name ?? personOf(charId)?.name ?? charId
}

function relationLine(charId: string, ev: TimelineEvent, ctx: DirectorCtx): string {
  const c = CHARACTERS.find((x) => x.id === charId)
  if (!c) return ''
  const cur = ctx.bondNow ? ctx.bondNow(charId) : ev.bond[charId as keyof typeof ev.bond]
  const stage = typeof cur === 'number' ? bondName(cur, { gender: genderOf(charId) }) : '初见'
  // 称呼随关系阶段与剧情位置变（见 data/address.ts）：露娜契约前是「言万同学」
  const call = addressOf(charId, typeof cur === 'number' ? cur : 0, furthestDone(ctx.epDone ?? {}))
  const callSeg = call ? `｜对言万心叶的称呼：${call}` : ''
  /* 关系档位与羁绊并列摆出来：一个是读数、一个是「两个人到底走到哪儿了」。
     还没定下就照实写「尚未定下」—— 那正好是这一栏此刻真实的样子。 */
  const tier = relTier(ctx.relOf?.(charId))
  const relSeg = `｜关系档位：${tier ? `${tier.name}（${tier.id}）` : '尚未定下'}`
  return `${c.name}｜${c.epithet}（${c.role}）｜关系：${stage}${relSeg}${callSeg}｜台词「${c.quote}」`
}

/** 后接事件锚（软门禁）：给标题/地点与开场引子，提示导演收束需自然引向后接事件；不含后接正文，防剧透 */
function nextAnchorBlock(next: TimelineEvent): string {
  const where = `${next.group} · ${next.phase}｜${next.place}${next.day ? `｜${next.day}` : ''}`
  const raw = (next.summary || '').trim().replace(/\s+/g, ' ')
  const prem = raw.slice(0, 200)
  const ellipsis = raw.length > 200 ? '…' : ''
  return `【收束衔接 · 后接事件（软门禁）】
本事件按阅读序之后将进入：《${next.title}》（${where}）
开场引子：${prem || '（无）'}${ellipsis}
软门禁：仅当这一段该了结的事已经了结（**以此刻实际发生的为准，不是以大纲里那几条为准**）、且你能把当下局面自然引向这后接事件的入口时，才把 eventDone 置 true 并给 digest；收束叙述应呈现顺承／悬念／转场，暗示「下一幕将至」，不要生硬宣告完结，也不要抢跑叙述后接事件的正文。若还接不上，就不要置 eventDone，继续推进本事件。`
}

/**
 * 台词行契约（终端把正文渲染成角色气泡的唯一依据）。
 *
 * 为什么单独成段、且压在预设段**之后**：
 *   气泡版式不是「文风」，是终端读正文的方式 —— 正文里没有「角色名：」起行，
 *   拆行器就一条 say 段也认不出来，整段正文一丝不差地落进旁白，气泡版式看着像坏了。
 *   这话原先写在导演规则的中间（第 5 条），可预设段整段压在规则之后注入，
 *   而自带预设开机就自动套用（见 lib/builtin-presets.ts）——
 *   预设里但凡有一句「文本格式」把行首写法收走了，规则里那条就被盖掉。
 *   于是把它拎出来，摆在离输出最近的位置，并且明说「冲突时以此为准」。
 */
function speechContract(): string {
  return `【台词行格式 · 终端渲染约定】（本条只管「正文怎么写」，与上方预设的「文本格式」「输出格式」冲突时，一律以本条为准）
终端按**行首**的「角色名：」把正文拆成角色气泡（角色＝左气泡，言万心叶＝右气泡）。要让在场某角色开口时，请让该句台词另起一行，以「角色名：」开头单独成段：
· 名字用其**全名**（与上方【本事件出场角色】里的写法一致），冒号用中文全角「：」；
· 冒号后可直接接台词，也可用「」把台词括起；
· 台词与名字之间不换行，也不要把旁白与台词挤在同一行。
· 不要缩成简称、也不要带称呼后缀 —— 别人怎么叫他与署名无关：言万心叶开口就写「言万心叶：」，
  写成「言万：」「言万同学：」终端认不出来，那一句会整行掉回旁白（正史里主角的话就是这么漏掉气泡的）。
只有确实作为某角色口中说出的话才用此格式；神态、动作与叙述行一律不要加名字前缀，否则会被终端当成台词，切出不该有的气泡。

一回合里的**配比**：旁白（叙述、动作、神态、场景、心理）可以多写，台词也不能少 —— 不要整段只有叙述、一句台词都没有，也不要通篇都是对白、没有旁白垫着。
台词要**多样**：按在场各人自己的性子、身份、此刻的心境来写，各人说话的用词、句子长短、称呼习惯要分得开；不要反复引用原文里的原句，也不要把几个人写成同一个腔调 —— 对着大纲里的原文台词照抄，正文就成了复述。`
}

/**
 * 本回合 · 言万心叶的意志 —— 摆在提示词**最后一节**（正文与事件指令 schema 之前）。
 *
 * 为什么单开一节、且非摆在这个位置不可：
 *   前面已经有三处在说「大纲不锁结局、以他为中心」（导演铁律第二条、内置预设的思考纪律、
 *   实施细则的抬头），可它们**都是散的** —— 要么夹在几节大纲中间，要么落在大纲之前。
 *   模型读到的最多、最像剧本的东西仍是那两处：①【事件大纲 · 原文走向】连同逐条编号的
 *   情节线，②实施细则的「四、落点」清单；再往下还有【收束衔接 · 后接事件】在往前拽。
 *   于是它读了半天「以他为中心」，落笔时手里攥着的还是一张待办表，照原著把情节推回原位 ——
 *   玩家写的行动等于白做，而表面上一切正常（文风对、人名对、大纲里每一拍都发生了）。
 *   这一节把他的原话**端到最末**，并点名让上面那几节让位：位置本身就是分量。
 *   让位不是「全废」：相违时按**七比三** —— 七成是他的行动与话语，三成是导演铁律里
 *   本来就不随他变的那三样（什么地方、在场是谁、各自知道什么）加上各人自主的反应。
 *   写成「一切以他为准」会把在场的人一起抹掉（大纲撑着的正是人物与事实那半边），
 *   写成「以大纲为准」又把人拽回原著那条线 —— 两个极端都试过，七比三是那句铁律的量化。
 *
 * 为什么逐字引、而不是转述：转述一次就多一次走样的机会。他写「我不去」，这里就该是「我不去」。
 *
 * 超长的输入截断到 600 字并写明「完整一条见本轮操作栏输入」—— 免得一段长文每回合被塞两遍
 * （一遍在这里、一遍在本回合的 user 消息里），把输出预算挤掉。
 */
function willSection(opName: string, action: string): string {
  const t = action.trim()
  if (!t) return ''
  const body = t.length > 600 ? `${t.slice(0, 600)}…（原文较长，完整一条见本轮操作栏输入）` : t
  /* 主语一律是言万心叶。显示名是终端界面上的标签，不是另一个人 ——
     拿它当主语（「记忆观察员的意志」），模型会顺手把它写成场上的第二个角色。 */
  const alias = opName && opName !== '言万心叶' ? `（显示名「${opName}」）` : ''
  return `\n\n【本回合 · 言万心叶的意志 —— 这一节压过以上一切】
操作员${alias}在操作栏里写下的原话 —— 写的就是言万心叶这一回合的行动（逐字引用，不得改写、不得替他换成另一件事）：
「${body}」
落笔之前先判一件事：他这一笔与【事件大纲 · 原文走向】（连同实施细则里的情节线与落点）是**相合**还是**相违**。

· 相违 —— 以他写的为准，按 **七比三分**，那条线让位：
  七分给**他写下的行动与话语**。它已经发生：结果照他写的算，他做成了就是做成了 —— 不要写成「他试了，但没成」，不要让在场者把它驳回、替他换一种做法，也不要拿「做不到／来不及／另有隐情」原地挡回去。他推到哪儿，就以哪儿为这一段的了结处收束（那正是把 diverged 置 true 的时候）。
  三分留给大纲里**不是情节的那一半**：地点与时间、已成立的设定与事实、在场者各自的性格与说话方式、谁知道什么／谁不知道什么，以及他们对这一笔**自主的反应**。这些照原著走，别因为他改了走向，就连人带景一起换掉。
  唯独大纲里的**情节顺序**（那几条按先后排好的事）就此作废：没发生就是没发生，不要为凑齐它们把人往回拽，也不要替他把没写到的场面补发生。
· 相合 —— 照**原文案**写：台词与措辞用【本事件补充设定 · 原文摘录】与实施细则里的原文（逐字，不改写、不润色、不续写），情节按原著那几步走。

只有他**没有写到**的地方，才轮到原著走向与在场者的自主反应去填。`
}

/**
 * 本回合 · 他没有指示 —— 操作栏空着的那一趟（见 views/Plot.tsx 的 send）。
 *
 * 空输入不等于「什么都没发生」：那是「这一回合不由他起头」。这一节的用处只有一个 ——
 * 别让模型把这当成提问的间歇：停下来问「你接下来要怎么做」、把上一回合重演一遍，
 * 或者干脆只写一两句就交差。他要的是这段剧情自己往前走一步。
 *
 * 与 willSection 同一位置、同一分量（都摆在提示词最末），但方向相反：
 * 有他写的一笔就听他的（七比三），没有就照原著走向走 —— 这与「相合时照原文案」是同一条规矩。
 */
function idleSection(): string {
  return `\n\n【本回合 · 他没有指示】
这一回合操作栏是空的：他没有新写下什么。
· 不要停下来问他，不要写「接下来你想怎么做」这类把话头递回去的句子，也不要重演上一回合。
· 接着此刻的场面往下推一步：在场者照各自的性情与目的自己动作，时间与地点照常往前走，眼前真发生点什么。
· 没有他新写的一笔要照顾，这一段就照【事件大纲 · 原文走向】与实施细则走（该照原文案的地方照原文案）；
他此前已经写下、已经发生的事仍然成立，只是这一回合不由他起头。`
}

/** 当前事件的原文摘录段（EVENT_NOTES 通道；逐字、不经关键词扫描，每回合必达） */
function notesSectionFor(ev: TimelineEvent): string {
  const notes = eventNotesOf(ev.id)
  if (!notes.length) return ''
  return `\n\n【本事件补充设定 · 原文摘录】\n${notes.map((n) => `· ${n}`).join('\n')}`
}

/**
 * 当前事件的**详细大纲**（EVENT_BRIEFS 通道；与 eventnotes 同一条路：逐字、直读、每回合必达）。
 *
 * 为什么单开这一节、且要压在概述之后：
 *   概述只有两三句。模型拿到两三句去写一整段正文，人物关系、谁知道什么、关键台词
 *   长什么样，全得它自己补 —— 补出来的当然不是原文里那个人（这就是 OOC 的来源）。
 *   这一节把「怎么走、谁说什么、谁不知道什么、什么算走完」逐条摊开。
 *
 * 缺这一份的事件整节不出现，导演照旧只看概述（零副作用）。
 */
function briefSection(ev: TimelineEvent): string {
  const b = briefOf(ev.id)
  if (!b) return ''
  const seg: string[] = []

  if (b.beats.length) {
    seg.push('一、原文情节线（**原著里的先后顺序 —— 不是这几件事非发生不可的清单**；'
      + '它的用途是对人物、事实与分寸。言万心叶若把其中哪一步推去了别处、'
      + '或自己指定了这一段怎么走，一律**以他说出来、做出来的为准**，不要硬拐回来；'
      + '他写的与这一条线相违时按七比三让位 —— 他的行动与话语七成，这条线里的人物与事实三成）\n'
      + b.beats.map((x, i) => ` ${i + 1}. ${x}`).join('\n'))
  }
  /* 只给标了 key 的那几句。没标的留在 brief 数据里当摘录证据，但不进大纲 ——
     一节对话整段照搬，大纲就从「参照系」变成了「剧本」：导演照着复述原文，
     同一个角色换个场合说话也变成同一套腔调，人也就不是那个人了。
     底下这几句是**绕不开的**（伏笔要靠它回收、或一句话把关系与局势定死），
     所以连说法一起给；其余对话导演照人设自己写。 */
  const keyLines = b.lines?.filter((l) => l.key === true) ?? []
  if (keyLines.length) {
    seg.push('二、绕不开的几句原文（**原文锚点，不是要你照抄的剧本**）\n'
      + '下面这几句是原文里确实说过的，给你两样东西：一是这几个人此刻说话的分寸与用词，二是这一节绕不开的事实。\n'
      + '正文里的对话请**按各自人设另写**：同一个人在不同场合说法不同，照抄会变成复述原文。'
      + '这几句是例外 —— 那种「非这一句不可」的宣告、转折、立约，用原文原句（用也不得改它的意思）。\n'
      + keyLines.map((l) => ` ${l.who}：${l.text}`).join('\n'))
  }
  if (b.knows?.length) {
    const rows = b.knows.map((k) => {
      const yes = k.knows?.length ? `知道：${k.knows.join('；')}` : ''
      const no = k.unknown?.length ? `还不知道：${k.unknown.join('；')}` : ''
      return ` ${k.char} —— ${[yes, no].filter(Boolean).join('　｜　')}`
    })
    seg.push('三、在场的谁知道什么、还不知道什么（越过这条线就是写错——'
      + '让他说出「还不知道」里的任何一件，都算这一节崩了。'
      + '唯一一条例外：**言万心叶这一回合亲口告诉了他** —— 那这条线就真的挪了，照新的写）\n' + rows.join('\n'))
  }
  if (b.done?.length) {
    seg.push('四、原文里这一段的落点（原著是在这几条上收的；言万心叶若把它推到别处，'
      + '就按**实际结果**收束并给 diverged，不要为了凑上这几条而硬拉 —— 相违时按七比三，'
      + '落点听实际结果的）\n'
      + b.done.map((x) => ` · ${x}`).join('\n'))
  }
  if (b.taboo?.length) {
    seg.push(`五、禁忌（明确不要写出去的方向）\n${b.taboo.map((x) => ` · ${x}`).join('\n')}`)
  }

  if (!seg.length) return ''
  return `\n\n【本事件实施细则】（比上面那句概述细一个数量级；**人物、事实、信息差**以本节为准 ——
但「这几件事非发生不可」不在其列：言万心叶的行动可以把这一段的走向推开，那就照推出来的写。
分法见末尾【本回合 · 言万心叶的意志】那一节：他写的与大纲**相违**时按**七比三** ——
他的行动与话语占七成、说了算，本节的人物、事实、信息差占三成、仍然有效；
**相合**时照原文案走）\n\n`
    + seg.join('\n\n')
}

/**
 * 在场角色的**性情锚**：这一层治的是「人物走样」本身。
 *
 * 两类东西合起来，是这一节存在的全部理由：
 *   ① 底色 —— `persona.ts` 的人物卡里那几节（性格 / 说话方式 / 禁忌·雷区），
 *      逐字来自原作的考据，整卷不变。对上位角色的叮嘱（「不要 OOC」）没有用，
 *      有用的只有「这个人在原文里就是这么说、这么想的」这一条条事实。
 *   ② 分期 —— `temper.ts` 的叠加层。同一个人在故事的不同阶段是不同的人：
 *      露娜在「使用者契约」之前与之后，分寸完全不同；拿前期的写法写后期，
 *      单看每句都像，连起来就是不对。哪一层生效由**剧情读到哪**决定，不由模型猜。
 *
 * 两处都取不到的角色（没登记卡面、也没有分期）整条不出现 —— 宁可少一层，
 * 也不要拿一句自己编的性格去顶。
 */
const TEMPER_SECTIONS = ['性格', '说话方式', '禁忌·雷区']

/**
 * 本事件的在场者 —— **以 `ev.cast` 为准**（`lib/cast.castOf`，逐事件依原文判定的现场名册）。
 *
 * 从前这里读的是 `ev.chars`：那栏只有四位主役，且是「受影响」的口径，
 * 于是序章的船上也会被塞进恋兔队四个人，而恋兔光本人在场的段落反而漏了她 ——
 * 卡面与提示词两边都跟着错。名册为空时才退回全体主役。
 */
function presentOf(ev: TimelineEvent, ctx?: DirectorCtx): string[] {
  // 导演实时改过的名册优先（谁走了、谁刚来），没改过才照静态名册
  const live = ctx?.castNow
  const ids = live && live.length ? live : castOf(ev)
  return ids.length ? ids : (CHARACTERS.map((c) => c.id) as string[])
}

function temperSection(ev: TimelineEvent, ctx: DirectorCtx): string {
  const present = presentOf(ev, ctx)
  const done = furthestDone(ctx.epDone ?? {})
  const blocks: string[] = []

  for (const id of present) {
    const c = CHARACTERS.find((x) => x.id === id)
    const bond = ctx.bondNow
      ? ctx.bondNow(id)
      : (ev.bond[id as keyof typeof ev.bond] ?? 0)
    const stage = temperAt(id, typeof bond === 'number' ? bond : 0, done)

    const lines: string[] = []
    for (const s of personaCardOf(id)?.sections ?? []) {
      if (!TEMPER_SECTIONS.includes(s.title) || !s.lines.length) continue
      lines.push(`〔${s.title}〕`)
      for (const l of s.lines) lines.push(`· ${l}`)
    }
    const now = stage?.note ? [`〔此刻的性情 · 已随剧情翻过一层〕`, stage.note] : []
    const forb = stage?.forbid?.length ? ['〔此刻不要写出去的方向〕', ...stage.forbid.map((x) => `× ${x}`)] : []
    if (!lines.length && !now.length && !forb.length) continue
    blocks.push(`▸ ${c?.name ?? id}\n${[...lines, ...now, ...forb].join('\n')}`)
  }

  if (!blocks.length) return ''
  return `\n\n【在场角色 · 性情锚】（逐字取自原作考据；与他处的人设描述冲突时，以本节为准）
下面是这些人**各自怎么说话、什么脾气、踩到哪一句会翻脸**。照此写 —— 不要按一般印象替他们改性子，也不要让所有人用同一种腔调说话。\n\n${blocks.join('\n\n')}`
}

/** 拼装导演系统提示词（单事件） */
export function buildDirectorSystem(ev: TimelineEvent, ctx: DirectorCtx): string {
  /* 自由活动：卷间那一格（`free:` 段）或操作员自己按下的开关，两者走同一条规矩。
     它换掉的只有两处 —— 大纲那一节、以及羁绊那一条指令；其余（在场名册 / 私密 /
     关系档位 / 用户变量）照旧，自由时间里那些事一样发生。 */
  const free = ctx.freeMode === true || isFreeId(ev.id)
  const present = presentOf(ev, ctx)
  const roster = present
    .map((id) => relationLine(id, ev, ctx))
    .filter(Boolean)
    .join('\n')

  const entList = ev.entities.filter((e) => e !== '——').join('、') || '（本事件暂无新实体）'

  /**
   * 羁绊读数 —— 导演照着这个写关系。
   *
   * 数值取**此刻真实的羁绊**（`ctx.bondNow`：初见值 + 主角一路的行为），
   * 不是这一段原著里的数值。差别很要紧：原著读数只是考据（`ev.bond`），
   * 主角要是把话说砸了，真实羁绊比原著低得多 —— 照原著数值写，对方就会
   * 无缘无故地对他熟络，正是要防的那种走样。
   *
   * 原著读数附在后面一行作对照，供导演判断「这儿比原著亲近还是疏远」，
   * 但不作准。
   */
  const bondRows = Object.entries(ev.bond).filter(([, v]) => typeof v === 'number')
  const baseline = bondRows.length
    ? bondRows
        .map(([k, v]) => {
          const now = ctx.bondNow?.(k)
          const name = nameOfChar(k)
          if (typeof now !== 'number') return `  ${name}（${k}）：${v}`
          const diff = now - (v as number)
          const mark = diff >= 8 ? ' ↑比原著亲近' : diff <= -8 ? ' ↓比原著疏远' : ''
          return `  ${name}（${k}）：${now}（原著同段约 ${v}${mark}）`
        })
        .join('\n')
    : ''

  // 用户变量登记：把「主角行为改变了什么」稳定地写回同名变量（world.flags = 变量面板 A 区）
  const varEntries = ctx.flags ? Object.entries(ctx.flags) : []
  const varList = varEntries.length
    ? varEntries.map(([k, v]) => `  ${k} = ${typeof v === 'string' ? `「${v}」` : String(v)}`).join('\n')
    : '  （暂无登记）'
  const varBlock = `

【用户变量 · 依主角行为自动更新】
当前登记表（每次写回后会持久化，并在下一回合前回显现值）：
${varList}

更新规则：本回合言万心叶的行动若改变了某登记键所指的状态，就把该键连同新值写进下方事件指令的 flag（未变化的键不要写）；先前登记过的键要更新其值、不要另建同名键；若行动带来值得长期记录的新状态（约定／承诺／隐瞒／共同秘密／称号／处境档位等）可新建键，键名用英文小写加下划线、无空格、≤48 字符；不要为了写而写。`

  const reask = ctx.needDirective
    ? '\n- 注意：上一回合你没有给出可解析的事件指令块。本回合请务必补发一个事件指令块。'
    : ''

  const loreSection = ctx.loreContext
    ? `\n\n${ctx.loreContext}`
    : ''

  /* 私密往来 —— 只在「本人就在场、且关系已经走到那一步」时开这一节。
     名单由 bondNow 现算（不是原著读数）：主角没把这段关系走出来，她就不在这张名单上，
     导演也就不该替他开这一档。名单为空则整节不出现（行为与从前一致）。 */
  const intimIds = present.filter(
    (id) => hasIntimate(id) && (ctx.bondNow?.(id) ?? 0) >= INTIMATE_BOND,
  )
  /* 八栏的标签串（顺序照 ACT_KINDS，别在这里另排一套） */
  const actList = ACT_KINDS.map((k) => `${k}（${ACT_META[k].label}）`).join(' / ')
  /* 多女同场那一条只在**真的不止一位**时取得到（`haremRule` 一对一回空串） */
  const harem = haremRule(intimIds.length)
  const intimSection = intimIds.length
    ? `

【私密往来 · 已在场且关系走到这一步的人】
${intimIds.map((id) => `  ${nameOfChar(id)}（${id}）`).join('\n')}
这几位的羁绊在 ${INTIMATE_BOND} 以上 —— 到了这一步，私密的话题就开得了口：
她会说些平时不说的个人事，也可能提出或答应一次单独的见面。
分寸：
· **只对上面列的人开这一档**；名单外的人照【此刻的羁绊】那一节的分寸写，不越界。
· 她给到哪一步，由她此刻的关系与性格定 —— 有的只肯说，有的肯赴约，有的已不在意距离。
· 推进要**跟着言万心叶的行动走**：他给了那层意思、她也接得住，才往前挪一步；
  他没给的就别替她安排。拿不准就停在当下，不必每回合都往前推。
· 私密场面照常上屏、**写就写足**（怎么写细见上面底层规矩里那一整条）：这一档不必回避
  任何词 —— 顺序、那一处此刻的样子、她说的每一句、到什么程度，都照实落笔，不用省略号跳过。
  真正推进到哪一步，用下面事件指令里的 intim 落成读数
  （这几个数进的是档案页「私密档案」的背面，不是正文）：
  部位那一路给 dev；她整个人的敏度往前挪了就另外给 lewd；这一回到底做了什么，
  给 lastAct 一句话记下来（比照原样改写，不要写「同上」）。两件事各记各的。
· **次数另记一本账**（下面事件指令里的 acts）：这一回合真的做成了几回，逐栏给增量 ——
  ${actList}。
  它与开发度不是一回事：只是多亲了几回、多要了一回，就只动 acts、不动 dev；
  内射那一栏与性交 / 肛交各记各的（同一次里可以两栏都动，也可以只有交合而没有内射）。
  **数不清就不给** —— 拿不准的整栏省略，宁可少记一笔，也不要虚报。
· **贴身衣物另记一处**（下面事件指令里的 attire）：内衣与内裤此刻穿成什么样、内裤湿到什么
  程度。这一处记的是**此刻**，不是账 —— 只有正文里真的脱了、解开了、湿了才给，没动就整条省。
  两件给的是**此刻那一档**（穿着 / 半褪 / 褪下），不是「脱掉一层」这样的增量：
  她脱了又穿回去，照此刻那一档给；两件各记各的（只剩一件解开了就只给那一件）。
  湿的那一路给的是**增量**，可正可负（缓过来了、擦干净了就往下走）。
  **发情带起来的那一份不必报** —— 她的色情度一涨，终端自己会让内裤跟着湿一分；
  你把同一件事再报一遍，这一分就记成了两分。写「此刻是什么样」，不写她的反应。${harem ? `
· ${harem.replace(/^· \*\*/, '**')}` : ''}`
    : ''

  /* 关系档位 —— 只由剧情给，不从羁绊读数换算（见 data/rel.ts）。
     九级的口径整张列出来：导演得看得见上面还有哪几级，才知道此刻这一档是刚起步
     还是已经很深。各人此刻在哪一档，上面【本事件出场角色】那几行里已经写了。 */
  const relSection = present.length
    ? `

【关系档位 · 只由剧情给，不从羁绊读数换算】
这一栏问的是「这两个人之间到底走到哪儿了」，不是好感读数：同样 80 的羁绊，
可以是并肩的战友，也可以是把话挑明的恋人 —— 所以它不由数换算，由**这一段真的
发生了什么**定。九级由生到熟（各人此刻在哪一档，见上面【本事件出场角色】）：
${relLadderText()}
什么时候给：这一段真的发生了够格挪一步的事，才在下面事件指令里给 rel。
给的是**此刻的档位**（绝对值，不是增量）；往上、往下都给同一个字段 ——
翻脸了、把话说绝了，照给，那就是低的那一级。
只对**本段确实在场**的人给（不在场的别替他们记）；拿不准就整条省略 ——
省略即维持此刻那一档，不必每段都动。`
    : ''

  const notesSection = notesSectionFor(ev)
  /* 后接事件锚在自由时间里换一副说法：那一段还是要来的，但**这一格不该往它收**
     （收不收由操作员按「进入下一卷」说了算）。照原样摆出「软门禁 · 置 eventDone」
     会与上面那两条「自由时间里不给 eventDone」正面打架。 */
  const anchor = ctx.nextEvent
    ? free
      ? `\n\n【这一格之后去哪（只作参照，别往那儿收）】
自由时间终会结束，之后接回：《${ctx.nextEvent.title}》（${ctx.nextEvent.group} · ${ctx.nextEvent.phase}｜${ctx.nextEvent.place}）。
**但这一格不收束** —— 什么时候结束由操作员按「进入下一卷」说了算。你只管让眼下这段时间一直有事发生：
该说的话说掉、该办的事办掉、该赴的约赴掉，别为了衔接下一卷而把这一格草草收尾。`
      : `\n\n${nextAnchorBlock(ctx.nextEvent)}`
    : ''
  /* 他的话摆在最末：大纲 / 情节线 / 落点 / 后接事件全都读完之后，最后读到的是他这一句话。
     他没写的那一趟（idle）换成「他没有指示」—— 同一位置、同一分量，方向相反。 */
  const will = ctx.operatorAction
    ? willSection(ctx.operatorName || '言万心叶', ctx.operatorAction)
    : ctx.idle ? idleSection() : ''
  // 近期作战：与 loreContext 同格（都是「已发生的事实」，只作延续性背景）
  const opsSection = ctx.battleLog ? `\n\n${ctx.battleLog}` : ''
  // 近期短信：同一格，紧挨着它 —— 两边都是「他做过什么、与谁说过什么」
  const smsSection = ctx.smsLog ? `\n\n${ctx.smsLog}` : ''

  return `${outlineRules(ctx.operatorName || '言万心叶', free)}${presetSection(ctx.presetPre)}

【当前事件】${ev.group} · ${ev.phase}｜${ev.place}${ev.day ? `｜${ev.day}` : ''}
标题：${ev.title}

【事件大纲 · 原文走向（参照系，不锁结局）】
${free ? FREE_FRAME
    : `（下面是**原著里**这一段怎么走的。人物、地名、设定以它为准；**结局不归它管** ——
言万心叶的行动可以把它推到别处，那时就按实际发生的写，并把 diverged 置 true。
他怎么写这一段就怎么走：他写的与本大纲**相违**时按**七比三** —— 他的行动与话语占七成、
说了算，本节剩下的人物、事实、信息差占三成、仍然有效；**相合**时照原文案写。
分法与两个分支的写法见末尾【本回合 · 言万心叶的意志】那一节。）
${ev.summary}${briefSection(ev)}${notesSection}`}

【本事件相关实体】
${entList}

【本事件出场角色】${
    roster ? `\n${roster}` : '\n（暂无已建立关系的角色在场）'
  }${temperSection(ev, ctx)}

【此刻的羁绊 · 照此写关系，不要照原著写】
${baseline.trim() || '（无）'}
数值是**此刻真实的关系**（初见值 + 言万心叶一路说过的、做过的一切），不是这一段原著里的数值：
主角把话说砸了，对方就是真的跟他生分，别按原著里两人多亲近去写。
括号里的「原著同段约 N」只作对照，不作准。
关系松紧直接决定分寸：好感低就客气、疏远、留一手；高才轮得到掏心窝的口气。
${free ? `\n${FREE_BOND_NOTE}\n` : ''}${reask}${loreSection}${opsSection}${smsSection}${varBlock}${intimSection}${relSection}${anchor}${presetSection(ctx.presetPost)}${will}

${speechContract()}

【事件指令 · 每回合末尾必须输出】
标签行（单独一行）：
—— 事件指令 ——
紧接着一个 \`\`\`json 围栏块，仅含一个对象。字段（全部可选）：
{
  "met":    ["新遇见角色id"],                 // 仅限本段在场或新登场的档案角色：hikari/luna/mefisa/nyau（其余档案角色仅当其确实登场时方可出现）
${free ? '' : `  "bond":   [{ "char": "角色id", "delta": 整数 }],  // 羁绊**只由本回合言万心叶的行为决定**：正=更亲近，负=生分（说错话、越界、失信就该给负数）
                                                   // 本事件相关角色单次 ±1~4，勿过度；什么都没发生就别给这条
                                                   // 数值是关系本身，不随剧情进度自动涨 —— 不给就不会变
`}
  "ends":   ["实体原文标注或图鉴id"],          // 新遭遇并登记的实体
  "flag":   { "变量名": 值 },                  // 用户变量：本回合主角行为改变了哪个键就更新/新建哪个（见【用户变量】规则）
  "cast":   ["此刻真在场上的人id"],            // **只在在场的人变了的时候给**（谁先离席、谁刚赶到、换了个房间）：给的是此刻这一场的**全量**名单，不是增减
                                               // 名单照本节【在场角色】那一份的 id 写；人都还在原处就整条省略，别每回合都给
  "diverged": true,                           // 已与原著相异（否则省略）
${free ? '' : `  "eventDone": true,                          // 这一段该了结的事已经了结才置 true —— 以**此刻实际发生的**为准，不是以大纲里那几条为准；他把它推去了别处，就以那个别处为落点收束，别为凑齐大纲往回拽
  "digest": "第三人称收官记录两三句",
`}  "battle": {                                 // 本回合触发交战（否则省略整个字段，勿写空对象）
    "name": "敌方名称",                        // 也是这场作战的标题；用原文指称
    "nature": "异端 / 残渣 / 机械 / 低语 / 魔王",// 决定敌阵档案与演出，从这五类里选最贴的一个
    "stage": 1,                                // 危险度 1~10；照本段原文的规模给，别一律给高
    "place": "交战地点",
    "squad": ["在场的参战角色id"],              // 只列此刻确实在场的人；空 = 由已遇见者里挑
    "force": true                              // true = 本段必然开打
  }${intimIds.length ? `,
  "intim": [                                  // 私密档案推进（仅【私密往来】名单上的人；本回合确实推进了才给）
    { "char": "角色id", "slot": "mouth|breast|vagina|anus",
      "dev": 1,                               // 这一次的开发度增量，1~3（一回合一小步）
      "lewd": 1,                              // 色情度增量，1~3（可选；说不清就别给）
      "state": "改写该部位状态的一句话（可选，不写就沿用原句）",
      "first": true }                         // 仅当**这一回是初次破处**时置 true（此后不要再给）
  ]                                             // slot 可以省：这一回没碰哪儿、心思却更敏了，就只给 lewd` : ''}${intimIds.length ? `,
  "attire": [                                 // 贴身衣物（仅【私密往来】名单上的人；正文里真的脱了/解开/湿了才给）
    { "char": "角色id",
      "bra": "worn|half|off",                 // 内衣此刻穿成什么样（worn 穿着 / half 半褪 / off 褪下；没变就省）
      "panties": "worn|half|off",             // 内裤同上
      "wet": 10 }                             // 湿润增量 ±30（正=更湿，负=缓过来了；发情带起来的那份不必报）
  ]                                           // 这两件给的是**此刻那一档**（不是增量）：只会给真的变了的那一件` : ''}${intimIds.length ? `,
  "acts": {                                   // 次数账的**增量**（仅【私密往来】名单上的人）：做了几回就给几，1~9
    "角色id": { "kiss": 1, "oral": 1, "sex": 1, "creampie": 1 }
  }                                             // 八栏：${ACT_KINDS.join(' / ')}
                                                // 只给**这一回合真的做成了**的那几栏；只增不减、数不清就不给
                                                // 多女同场时逐人各给一条 —— 谁做了什么记在谁名下，不要合成一条` : ''}${present.length ? `,
  "rel": {                                    // 关系档位（仅本段确实在场的人）：给的是**此刻的档位**，绝对值不是增量
    "角色id": "${REL_IDS.join('|')}"
  }                                             // 只在剧情真的挪了一步时给；往上、往下都给同一个字段；拿不准就整条省略` : ''}
}
无任何变化时输出 { }。不要把本说明当作文本念出来。

也可改用另一种等价形式（与 JSON 围栏二选一，只输出一套指令，勿混用）：
<maintext>
（正文叙述，逐行输出）
</maintext>
<option>给操作员的下一个接续选项</option>
<option>……（可多行，不需要则不写）</option>
<vars>${free ? '{"flag": {"某标记": 值}}' : '{"eventDone": true, "digest": "第三人称收官两三句"}'}</vars>
其中 <vars> 的字段与上面 JSON 完全一致（battle 亦可写在 <vars> 里）；正文只放 <maintext> 里。<thinking>…</thinking> 可放你的推演（不展示给操作员）。${free ? `
自由时间里**没有 eventDone / digest 这两个字段**：这一格什么时候收由操作员按「进入下一卷」说了算，
不由你宣告。（他明说了要收，也照样由他按那个按钮。）` : ''}

【收尾自检 · 落笔前最后看一眼】
你这一回合回复的**最后一样东西**，必须是上面那块事件指令（\`—— 事件指令 ——\` 标签行 + 随后的 \`\`\`json 围栏，或 <vars>）。不是场景写完就停、不是把话说圆就停 —— 写完之后回头补上它。
哪怕这一回合什么都没变，也要给出 {} 的空块：**没有它，这一回合的变量、${free ? '图鉴与推进' : '羁绊、图鉴与收束'}全部作废**，操作员只能喊你重发一次。这一段正文写得再好，少了它也是白写。`
}

/**
 * 这一条邀约**成不成**：时间与地点都得说清。
 *
 * 这是操作员定下的门槛 —— 「必须在说出时间和地点后才能生成这个指令」。
 * 拦在这一层而不是拦在提示词里：模型漏说一项是常事，漏了就该当**没约成**，
 * 不该拿一条半截的邀约去开一场没有时间、没有地方的见面。
 *
 * 称呼、名目（title）都不作数：title 缺了可以照地点兜一个，
 * **时间与地点缺一不可** —— 那两样是「约」这件事的实体。
 */
export function dateReady(d: PlotDirective['date'] | undefined | null): boolean {
  if (!d) return false
  return Boolean(d.time?.trim() && d.place?.trim())
}

/**
 * 短信场景的基础提示补充（轻量羁绊许可），由 Tavern 拼到其 system 末尾。
 *
 * 羁绊过了 INTIMATE_BOND 之后多一段：**可以在信里把人约出去**。
 * 只放行 `date`（落成一场约会线程，见 lib/rendezvous.ts），
 * **不放行 intim** —— 身体上的推进不发生在短信里，得见了面才算数。
 */
export function smsBondRule(charId: string, bond = 0): string {  const open = bond >= INTIMATE_BOND
  return `\n（可选 · 轻量互动：若本回合对话让该角色心绪明显变化，可在回复最末尾另起一行放一个纯 JSON 对象，形如
{ "bond": [{ "char": "${charId}", "delta": 1 }], "flag": { "某标记": 值 }, "task": [{ "title": "要办的事", "detail": "可选的细节" }]${open ? `,
  "date": { "kind": "date", "title": "这一场的名目", "place": "见面的地方", "time": "什么时候" }` : ''} }
其中 bond.delta 只针对该角色取 ±1~3（正=更亲近）；flag 为可选的分支标记；
task 只在这条短信**确实交代了一件要你去办的事**时才给（最多两条，标题一句话说清，别把闲聊或问候写成任务）。${open ? `
date 只在她**真的在信里开口约了**（或答应了对方的约）时才给 —— 这时**时间与地点都得在信里说出口**：
time 写什么时候（「明天放学后」「周六下午三点」这种），place 写去哪。**两样缺一样就当没约成** ——
只有「改天一起出来嘛」这种没有落点的客气话，就不要给 date，那条指令不会生成；
说定了才会另开一场单独的见面，与你原本的相处分开算（身体上的事只在见面时才算数）。` : ''}
拿不准就不给，直接以对话结束。）`
}
