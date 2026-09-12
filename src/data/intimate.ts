/* ============================================================
   私密档案底档（data/intimate.ts）
   ------------------------------------------------------------
   **这是一份游戏内档案，不是原文考据。** 原作没有这些读数 —— 字段、状态句与
   看法都是本终端自行拟制的（与 TAVERN_PERSONAS 的 greeting 同一性质：
   撰写样本，非原文台词）。因此：
     · 绝不冠以「· 原文」，也不进人物卡 / 导演提示词当事实喂；
     · 状态句一律**档案用词**，写在这一页上，不写成正文；情节由推演通道去写。

   分工：
     · 本文件 = **底档**（初见时的那一页）；
     · `WorldState.intim` = **推进**（约会与私密往来落下的开发度增量 / 状态改写 /
       破处对象 / 最近一回 / 看法改写）；
     · 合成规则在 `intimateOf`。

   一页上五根条：四处部位（口腔 / 胸部 / 小穴 / 菊穴）的**开发度**，加一根
   **色情度**（`lewd`）—— 后者不挂部位，说的是她这个人此刻的敏度与淫靡程度，
   与四处同一口径（0–100 的读数 + 一个档位词）。

   **读数一律从 0 起。** 初见那一页五根条全在 0（「未开发」）：谁都不是带着
   开发度登场的，往上走的每一格都得由主角在正文或见面里真的走出来。上限 100。

   状态句**只写这一处的状态**（用词直给，不绕开敏感词）—— 这是档案，不是正文，
   所以不避讳、也不煽情：说清楚这一处此刻是什么样 —— 形态 / 颜色 / 软硬 / 松紧 /
   湿润 / 敏感度 / 开发到哪一档。**不写她的动作与反应**：不写「会推开」「会脸红」
   「会自己凑上来」—— 那些是反应，不是状态；要写反应，那是正文里推演通道的事。

   **状态句是动的。** 每一处不是一句话，而是**四句**（`DEV_STAGES` 那条梯子）：
   读数走到哪一档，上屏的就是哪一句。第 0 档（未开发）一律是**抗拒** ——
   抗拒也写作形态：紧闭、干涩、绷着、未开、合死的一道缝；往上每一档递进一层，
   到第 3 档是湿透、软热、贴合，轻轻一碰就有反应。四句各写各的，不是同一句话换几个词。

   每一句都要**对得上这个人的设定与体型** ——「身量、肤色、体质」照原文与
   人物卡（`chars.ts` / `sidecast.ts` / `persona.ts`）来：咖啡牛奶色肌肤的梅芙、
   金属丝线织成的露娜、娇小的达娜厄、怕烫的恋兔……都不许写成同一个人。
   原文没写到的地方按人物卡的口径拟制（本页本来就是拟制），但不许与原文相抵。

   **这一页不封存。** 它是本终端只给「你」看的那一份 —— 不随羁绊解封、也不等
   谁点头（羁绊到了才开口的，是**她本人**：私密话题与约会仍要 `INTIMATE_BOND`，
   那是两个人的事；这一页是你自己手里的东西）。只对**女角色**生效：
   `genderOf(id) !== 'f'` 的角色整节不出现（见 `hasIntimate`）。

   羁绊对它的影响是**间接**的一处：羁绊过线之后，「对性行为的看法」换一句
   （`viewHigh`）—— 关系走到这一步，她自己对这一件事的态度也跟着松了。
   起初她一定是克制、害羞且保守的（那是底档那一句），往后松动也是写她自己
   改了口径，不必假设中间发生过什么 —— **看法就直接写看法**，不写那些事。
   `INTIMATE` 的正文（18 位女角色 × 4 处 × 4 档状态句）在 `data/intimate-table.ts` ——
   本文件只管规矩：档梯 `DEV_STAGES`、合成 `intimateOf`、并账 `mergeIntim`。
   ============================================================ */

import type { IntimateProfile, IntimateProgress, IntimateReadout, IntimateSlot } from './types'
import { genderOf } from './castmeta'

// 底档那张长表在 data/intimate-table.ts（那儿只放表，不放规矩）；这里转出去，
// 别处照旧从 data/intimate 取 INTIMATE / NO_ACT，不必改 importing。
import { INTIMATE, NO_ACT, PHYSIQUE } from './intimate-table'

export { INTIMATE, NO_ACT, PHYSIQUE }

/** 私密档案 / 私密话题的解锁门槛（羁绊读数） */
export const INTIMATE_BOND = 70

/** 部位的四栏顺序（界面与提示词都照它排列，别各自再写一套） */
export const INTIMATE_SLOTS: IntimateSlot[] = ['mouth', 'breast', 'vagina', 'anus']

/** 部位的中文标签与一行释义（档案面板与提示词共用） */
export const SLOT_META: Record<IntimateSlot, { label: string; hint: string }> = {
  mouth: { label: '口腔', hint: '唇、舌、口腔与咽喉的开发状况' },
  breast: { label: '胸部', hint: '乳房、乳晕与乳头的开发状况' },
  vagina: { label: '小穴', hint: '外阴与阴道的开发状况' },
  anus: { label: '菊穴', hint: '后庭与直肠的开发状况' },
}

/**
 * 第五根条：色情度。它不挂在哪个部位上 —— 四处开发度说的是「这处被开发到哪儿了」，
 * 色情度说的是**她这个人**此刻对这件事的敏度与淫靡程度：同样的 40，两个人的反应
 * 完全是两回事。所以它与四处并列成第五行，读数口径一致（0–100）。
 */
export const LEWD_META = { label: '色情度', hint: '对性事的敏度、淫靡程度与身体有多容易起来' } as const

/**
 * 一条私密推进的显示名 —— 提示条上念的那一句：
 * 「口腔」/「色情度」/「口腔 · 色情度」/「最近一回」/「看法」。
 * 三路各记各的（见 lib/plot.ts 的 IntimateDirective），所以这里也可能几样都念。
 */
export function intimAdvanceLabel(
  it: { slot?: IntimateSlot; lewd?: number; lastAct?: string; view?: string },
): string {
  const out: string[] = []
  if (it.slot) out.push(SLOT_META[it.slot].label)
  if (it.lewd) out.push(LEWD_META.label)
  if (it.lastAct) out.push('最近一回')
  if (it.view) out.push('看法')
  return out.join(' · ')
}

/**
 * 开发度的**档梯** —— 档位词与状态句共用同一条梯子：第 i 档的档位词，
 * 配的就是每一处 `parts[slot].states[i]` 那一句。梯子分几档，四处就得各写几句
 * （改这里就要一并补齐 18 位 × 4 处 —— mech 里有一条哨兵盯着这个数）。
 *
 * 四档是一条从**抗拒**走到**沉溺**的线。每一句**只写这一处此刻的样子** ——
 * 形态 / 颜色 / 软硬 / 松紧 / 湿润 / 敏感度 / 开发到哪一档；不写她的动作与反应
 * （「会推开」「会脸红」是反应，不是状态。第 0 档的抗拒也写作形态：紧闭、干涩、绷着）：
 *   0 未开发（dev 0）—— 抗拒：未经人事，紧、干、绷着、未开；
 *   1 生涩（1-34）   —— 被开发过几回：开始有湿意，仍旧紧、仍旧撑；
 *   2 渐熟（35-69）  —— 开发过半：湿意到得早、量也足，往里已经认得他的形状；
 *   3 沉溺（70-100） —— 开发度很高：湿透、热、贴合，轻轻一碰就能出水。
 * 状态句正文在 data/intimate-table.ts；梯子分几档，四处就得各写几句。
 */
export const DEV_STAGES: readonly { from: number; word: string }[] = [
  { from: 0, word: '未开发' },
  { from: 1, word: '生涩' },
  { from: 35, word: '渐熟' },
  { from: 70, word: '沉溺' },
]

/** 梯子有几档（每一处的状态句就得写几句） */
export const DEV_STAGE_COUNT = DEV_STAGES.length

/** 读数落在第几档（夹在 0–100 之后按各档的下界取最高那一档） */
export function devStageIndex(dev: number): number {
  const v = Math.max(0, Math.min(100, dev))
  let at = 0
  for (let i = 0; i < DEV_STAGES.length; i++) if (v >= DEV_STAGES[i].from) at = i
  return at
}

/** 开发度的档位词（读数之外给一句人话；与状态句同一档） */
export function devStage(dev: number): string {
  return DEV_STAGES[devStageIndex(dev)].word
}

/** 破处对象的显示名（'you' = 操作员本人；其余为世界内人物名） */
export function firstByName(who: string | null, operatorName: string): string {
  if (!who) return ''
  return who === 'you' ? `${operatorName}（你）` : who
}

/** 底档的一句「未破处」标注（破处对象那一栏的缺省读数） */
export const VIRGIN = '—— 未破处（处女）'


/** 该角色有没有私密档案（只对女角色生效；底档或性别任一不合即 false） */
export function hasIntimate(charId: string): boolean {
  return genderOf(charId) === 'f' && !!INTIMATE[charId]
}

/**
 * 底档 + 推进 → 此刻的一页。
 *
 * 合成规则（六处，缺一不可）：
 *   · 部位开发度 = 底档（0）+ 增量，夹在 0–100；
 *   · 色情度     = 同上，只是它不挂在哪个部位上（`IntimateProfile.lewd`）；
 *   · 状态句 = **跟着读数走**：算出来的开发度落在 `DEV_STAGES` 第几档，取的就是
 *     `parts[slot].states` 里的第几句（第 0 档 = 未开发，那一段写的是抗拒）；
 *     推进里若有改写整句，则压过它（后写覆盖 —— 情节里真变了，比档位推算准）；
 *   · 破处对象 = 第一次落下的那个说了算（`firstBy`）—— 之后再有改写也不顶掉它：
 *     「破处对象是谁」问的是第一回，不是最近一回；
 *   · 最近的性行为 / 看法 = 同上，后写覆盖（这两项说的是「此刻」，与第一回无关）。
 * 不是女角色 / 没有底档 → null（调用方整节不摆）。
 */
export function intimateOf(
  charId: string,
  progress?: IntimateProgress,
  /** 此刻的羁绊读数 —— 只用来决定「看法」取哪一层（见下方 view 的取舍） */
  bond = 0,
): IntimateProfile | null {
  const base = INTIMATE[charId]
  if (!hasIntimate(charId) || !base) return null
  const parts = {} as Record<IntimateSlot, IntimateReadout>
  for (const slot of INTIMATE_SLOTS) {
    const b = base.parts[slot]
    const add = progress?.dev?.[slot] ?? 0
    const state = progress?.state?.[slot]
    const dev = Math.max(0, Math.min(100, Math.round(b.dev + add)))
    /* 状态句**跟着读数走**：开发度落在第几档，取的就是那一档的那一句
       （第 0 档是「未开发」—— 那一段写的是抗拒）。
       推进里改写过的整句压过它：情节里真的变了，比档位推算准。 */
    parts[slot] = {
      dev,
      state: state?.trim() ? state.trim() : b.states[devStageIndex(dev)] ?? b.states[0] ?? '',
    }
  }
  const lewdAdd = progress?.lewd ?? 0
  const first = progress?.firstBy?.trim() || base.firstBy
  /* 「看法」取三层里最高的那一层：
       ① 推进里真的改写过的（情节里变了 —— 最硬的证据，压过一切）；
       ② 羁绊过了线的：关系走到这一步，她自己对这一件事的态度也跟着松了。
          这是**间接**影响 —— 不是把读数换算成一句话，只是换一句她本来就会说的话；
       ③ 底档那一句。 */
  const view = progress?.view?.trim()
    || (bond >= INTIMATE_BOND ? base.viewHigh : base.view)
  return {
    parts,
    lewd: Math.max(0, Math.min(100, Math.round(base.lewd + lewdAdd))),
    virgin: !first,
    firstBy: first ?? null,
    lastAct: progress?.lastAct?.trim() || base.lastAct,
    view,
  }
}

/** 该角色此刻的私密档案（`progress` 一般直接传 `world.intim?.[charId]`） */
export function intimateProfileOf(charId: string, progress?: IntimateProgress): IntimateProfile | null {
  return intimateOf(charId, progress)
}

/**
 * 把一次私密推进**并进**手里那一份（`world.intim[charId]`），返回新的那一份。
 *
 * 这里是「第一回」那条规矩真正落地的地方 —— 所以它必须是纯函数、独自可验：
 *   · 开发度与色情度**累加**（0 起步，只增不减：负数与非法数直接跳过）；
 *   · 状态句后写覆盖；
 *   · **破处对象只认第一次落下的那个**：已经落下过就不再改 —— 问的是第一回，
 *     不是最近一回。之后的情节里再怎么改写这一处，也顶不掉这一栏。
 *   · 最近一回与看法也是后写覆盖 —— 这两项问的是「此刻」，与第一回无关。
 *
 * 合成（底档 + 这一份 → 上屏的那一页）在 `intimateOf`；两者一一对应：
 * 这里怎么记，那边就怎么读。
 */
export function mergeIntim(cur: IntimateProgress | undefined, prog: IntimateProgress): IntimateProgress {
  const from = cur ?? {}
  const dev = { ...from.dev }
  for (const [slot, add] of Object.entries(prog.dev ?? {})) {
    /* 只增不减：负数、零、非数（NaN / Infinity）一律跳过。
       上头的 sanitizer 本来就把它夹成 0–8 了 —— 这里再守一道，是因为
       这一条是「谁都不该带着开发度登场」之外的另半句：登场之后也不该往回缩。 */
    if (typeof add !== 'number' || !Number.isFinite(add) || add <= 0) continue
    const key = slot as IntimateSlot
    dev[key] = (dev[key] ?? 0) + add
  }
  const next: IntimateProgress = { ...from }
  if (Object.keys(dev).length) next.dev = dev
  if (prog.state && Object.keys(prog.state).length) next.state = { ...from.state, ...prog.state }
  if (typeof prog.lewd === 'number' && Number.isFinite(prog.lewd) && prog.lewd > 0) {
    next.lewd = (from.lewd ?? 0) + prog.lewd
  }
  // 破处对象：已经落下过就不再改 —— 问的是第一回
  if (prog.firstBy?.trim() && !from.firstBy) next.firstBy = prog.firstBy.trim()
  // 这两项问的是「此刻」而不是「第一回」，所以照旧后写覆盖
  if (prog.lastAct?.trim()) next.lastAct = prog.lastAct.trim()
  if (prog.view?.trim()) next.view = prog.view.trim()
  return next
}
