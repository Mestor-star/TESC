/* ============================================================
   贴身衣物（data/attire.ts）
   ------------------------------------------------------------
   **这一栏记的是「此刻」，不是「开发到哪儿了」。** 与私密档案并排放在同一页私密
   档案里，但它的三根读数各有各的时间尺度 —— 这是它与 `world.intim` 最大的分别，
   也是本文件里每一条规矩的来处：

     · 私密档案那五根条（四处开发度 + 色情度）是**账**：只增不减，走过的每一格
       都算数；
     · 这里的两件是**此刻穿成什么样**：她可以脱了又穿回去、可以缓过来重新干爽。
       所以穿着档位是**后写覆盖**（不是累加），湿润读数的增量**允许为负**。

   两半：
     · `AttireBase`（data/attire-table.ts）= **底档**：她这两件是什么样（款式 /
       颜色 / 材质 / 贴身程度 / 新旧）—— 每人一份，**照性格写**，谁也不许与
       别人撞款：严整的人成套浆挺，招摇的人蕾丝缎面，随性的人不成套、起球，
       常年经手血腥的人深色好洗，战场上长大的够牢够紧。
       底档 **只有两件**：内衣（`bra`）与内裤（`panties`）。
     · `WorldState.attire[charId]` = **推进**：此刻穿到什么程度、内裤湿成什么样、
       最近几次是怎么变的（流水）。
     · 合成规则在 `attireOf`。

   **两件都是「穿在身上」还是「脱下来」由情节给。** 触点从来只有一处：导演指令里的
   `attire` 那一项（正文里真的写了脱 / 解开 / 湿了，才给这一项）——不存在按别的
   读数自动推断的路子。这一条是照着好感那一课的教训立的：**不许白涨**。
   唯一一处例外写在 `mergeAttire` 里，且它也有来路：同一次里色情度涨了，湿润跟着
   涨一半 ——「因为发情而湿润」本来就是这么来的，模型报一次「她起来了」，不必把
   同一件事拆成两处再报一遍。

   **退也是自己退的**（`dryAttire` / `WET_DRY_STEP`）：一回合里什么都没往上走
   （没有私密推进、也没有衣物推进），湿润就自己退一档 —— 用户口径「内裤湿不可能
   一直湿润」。它是**此刻**，不是勋章：凉下来了、擦干净了、换了一条，读数就该往下走。
   涨只认指令（外加耦合那一半），退不必谁下命令。

   湿润读数 0–100，配 `WET_STAGES` 那条四档梯子（干爽 / 潮意 / 洇湿 / 透湿）。
   梯子与内裤底档里的四句状态句一一对应：读数落在第几档，上屏的就是第几句
   ——那句只写**这条内裤此刻的样子**（布料、湿到哪儿、看得见的痕迹），不写她的
   动作与反应。第 0 档是干爽，往上每一档递进一层。

   **底档那一页是拟制的**（与 data/intimate.ts 同一性质）：原作不给这些读数，
   所以绝不冠以「· 原文」、也不进人物卡当事实。但它必须**对得上这个人的设定**：
   材质、颜色、新旧、成套与否照 `chars.ts` / `sidecast.ts` / `persona.ts` 的口径来，
   不许多出原文里没有的东西（不会有谁凭空穿着这个世上没有的料子）。

   只对**女角色**生效：`genderOf(id) !== 'f'` 的角色整节不出现（见 `hasAttire`）。

   规矩在本文件；18 位女角色 × 2 件的底档正文在 `data/attire-table.ts`。
   ============================================================ */

import type {
  AttirePieceReadout,
  AttireProfile,
  AttireProgress,
  AttireSlot,
  AttireWear,
  AttireLogEntry,
} from './types'
import { genderOf } from './castmeta'

// 底档那张长表在 data/attire-table.ts（那儿只放表，不放规矩）；这里转出去，
// 别处照旧从 data/attire 取 ATTIRE，不必改 importing。
import { ATTIRE } from './attire-table'

export { ATTIRE }

/** 贴身衣物的两栏顺序（界面与提示词都照它排列，别各自再写一套） */
export const ATTIRE_SLOTS: AttireSlot[] = ['bra', 'panties']

/** 两栏的中文标签与一行释义（档案面板与提示词共用） */
export const ATTIRE_META: Record<AttireSlot, { label: string; hint: string }> = {
  bra: { label: '内衣', hint: '胸罩此刻穿在身上还是脱下来 —— 这一件不管湿润' },
  panties: { label: '内裤', hint: '内裤此刻穿在身上还是脱下来，以及湿润读数与四档状态句' },
}

/**
 * 穿着三档 —— 说的是**这一件此刻在哪儿**：
 *   还穿在身上 / 半褪下来 / 已经离开了身上。
 * 三档由情节给（见 lib/plot.ts 的 IntimateDirective.attire），不是按读数换算的。
 */
export const WEAR_STAGES: readonly { id: AttireWear; word: string }[] = [
  { id: 'worn', word: '穿着' },
  { id: 'half', word: '半褪' },
  { id: 'off', word: '褪下' },
]

/** 穿着档位的档位词（读数之外给一句人话） */
export function wearWord(wear: AttireWear): string {
  return WEAR_STAGES.find((s) => s.id === wear)?.word ?? WEAR_STAGES[0].word
}

/**
 * 「半褪」落在哪一处，两件各说各的 —— 与具体是哪一件无关（她这一件是什么颜色、
 * 什么材质，由底档的 `name` / `look` 说），所以这两句是常数，不进底档。
 * `worn` 那一档不在这张表里：穿得整整齐齐时不必再补一句（见 `attireOf`）。
 */
export const WEAR_PHRASE: Record<AttireSlot, Record<'half' | 'off', string>> = {
  bra: {
    half: '解开挂在胸前，一根肩带滑到臂弯',
    off: '已经解开取下，不在身上了',
  },
  panties: {
    half: '褪到膝弯，挂在那儿',
    off: '已经褪下，不在身上了',
  },
}

/**
 * 湿润读数的**四档梯子** —— 与每一件内裤底档里的 `wet` 四句一一对应：
 * 读数落在第几档，上屏的就是第几句（改这里就要把 18 位的内裤各补齐四句 ——
 * mech 里有一条哨兵盯着这个数）。
 *
 * 一条从**干爽**走到**透湿**的线：
 *   0 干爽（wet 0-14） —— 没什么异样，布料还是原来的样子；
 *   1 潮意（15-39）   —— 有一点，贴着的那一小片颜色深了一丝；
 *   2 洇湿（40-69）   —— 看得出来，晕开一片，边界是软的；
 *   3 透湿（70-100）  —— 湿透，从里到外，透到外层，沾了手。
 */
export const WET_STAGES: readonly { from: number; word: string }[] = [
  { from: 0, word: '干爽' },
  { from: 15, word: '潮意' },
  { from: 40, word: '洇湿' },
  { from: 70, word: '透湿' },
]

/** 梯子有几档（每一件内裤的状态句就得写几句） */
export const WET_STAGE_COUNT = WET_STAGES.length

/** 读数落在第几档（夹在 0–100 之后按各档的下界取最高那一档） */
export function wetStageIndex(wet: number): number {
  const v = clampWet(wet)
  let at = 0
  for (let i = 0; i < WET_STAGES.length; i++) if (v >= WET_STAGES[i].from) at = i
  return at
}

/** 湿润的档位词（读数之外给一句人话；与状态句同一档） */
export function wetStage(wet: number): string {
  return WET_STAGES[wetStageIndex(wet)].word
}

/** 湿润那一栏的抬头（档案面板与提示词共用） */
export const WET_META = {
  label: '湿润',
  hint: '内裤此刻湿到什么程度（0–100 读数 + 干爽 / 潮意 / 洇湿 / 透湿 四档）',
} as const

/** 湿润读数的上下限 */
function clampWet(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

/**
 * 色情度每涨这么多，湿润跟着涨一分 ——「因为发情而湿润」。
 * 落点在 `mergeAttire`：她这一回真的起来了（`lewd` 涨了），内裤就跟着湿一点，
 * 不必让模型把同一件事分两处各报一遍（拆开报只会两边都报不全）。
 * 除得尽的部分才计（向下取整），所以报个小数目不会凭空生出一分湿。
 */
export const WET_PER_LEWD = 2

/** 「这一场的变化」流水封顶（新的在前）—— 只留最近这些次，不无限长 */
export const ATTIRE_LOG_MAX = 12

/**
 * 回落：**一回合什么都没往上走**的那一次，湿润往下退这么多。
 *
 * 用户口径：「内裤湿不可能一直湿润」—— 湿是**此刻**，不是勋章：人凉下来了、
 * 擦干净了、换了一条，读数就该往下走。所以它比「涨」多一条来路，而且这一条
 * 不必谁给指令（`WET_PER_LEWD` 那条耦合说的是涨，这条说的是退）。
 * 与耦合同一个分寸：只动读数与流水，不改穿着 —— 衣服穿没穿着由情节给。
 */
export const WET_DRY_STEP = 12

/**
 * 这一回合没有任何私密推进时，让湿润退一档（退到 0 就停）。
 * 已经干爽（0）→ null：没得退，也不必留一条空转的流水（空转不记账）。
 * 其余规矩（夹取 / 跨档才念档位词 / 流水）全在 `mergeAttire` 里，这里只递数。
 */
export function dryAttire(cur?: AttireProgress): AttireProgress | null {
  if (clampWet(cur?.wet ?? 0) <= 0) return null
  return mergeAttire(cur, { wet: -WET_DRY_STEP })
}

/** 该角色有没有贴身衣物这一节（只对女角色生效；底档或性别任一不合即 false） */
export function hasAttire(charId: string): boolean {
  return genderOf(charId) === 'f' && !!ATTIRE[charId]
}

/**
 * 底档 + 推进 → 此刻的两件。
 *
 * 合成规则（缺一不可）：
 *   · 穿着档位 = 推进里写过的那一档，没写过就是**穿着**（`worn`）——
 *     底档记的是「她这两件是什么样」，「此刻穿没穿着」不归底档管；
 *   · 状态句 = 穿得整齐时就是 `look` 那一句（她这两件本来就是什么样）；
 *     半褪 / 褪下时前面接上那一档的短语（「褪到膝弯，挂在那儿」），
 *     说的是**同一件东西此刻在哪儿**；
 *   · 湿润读数 = 底档从 0 起（谁都不是湿着登场的）累加推进里的增量，
 *     夹 0–100；状态句 = 读数落在第几档就取内裤底档 `wet` 里的第几句；
 *   · 流水 = 推进里记下的那几条（新的在前），原样透传上屏。
 * 不是女角色 / 没有底档 → null（调用方整节不摆）。
 */
export function attireOf(charId: string, progress?: AttireProgress): AttireProfile | null {
  const base = ATTIRE[charId]
  if (!hasAttire(charId) || !base) return null
  const pieces: AttirePieceReadout[] = []
  for (const slot of ATTIRE_SLOTS) {
    const p = base[slot]
    if (!p) continue // 底档里没有这一件 → 整条不出现（她身上没有这件东西）
    const wear: AttireWear = progress?.wear?.[slot] ?? 'worn'
    /* 穿得整齐时不补短语 —— 那句短语说的是「它此刻挂在哪儿」，
       整整齐齐穿在身上就没什么可说的，`look` 那一句本身就是它此刻的样子。 */
    const state = wear === 'worn' ? p.look : `${WEAR_PHRASE[slot][wear]}。${p.look}`
    const out: AttirePieceReadout = { slot, name: p.name, wear, wearWord: wearWord(wear), state }
    if (slot === 'panties') {
      const wet = clampWet(progress?.wet ?? 0)
      out.wet = wet
      out.wetWord = wetStage(wet)
      out.wetState = p.wet?.[wetStageIndex(wet)] ?? ''
    }
    pieces.push(out)
  }
  const hasPanties = !!base.panties
  const wet = hasPanties ? clampWet(progress?.wet ?? 0) : null
  return {
    pieces,
    wet,
    wetWord: wet === null ? '' : wetStage(wet),
    log: progress?.log ? [...progress.log] : [],
  }
}

/** 该角色此刻的贴身衣物（`progress` 一般直接传 `world.attire?.[charId]`） */
export function attireProfileOf(charId: string, progress?: AttireProgress): AttireProfile | null {
  return attireOf(charId, progress)
}

/**
 * 一次穿着变化的一句话（流水与提示条都用它）——
 * 「内衣解开挂着、内裤褪到膝弯」。空数组 → 空串。
 */
export function wearChangeText(changes: readonly { slot: AttireSlot; wear: AttireWear }[]): string {
  return changes
    .map((c) => {
      const label = ATTIRE_META[c.slot].label
      if (c.wear === 'worn') return `${label}穿了回去`
      if (c.wear === 'half') return c.slot === 'bra' ? `${label}解开挂着` : `${label}褪到膝弯`
      return `${label}脱了`
    })
    .join('、')
}

/**
 * 一条推进的显示名 —— 提示条上念的那一句：
 * 「内衣」/「内裤」/「湿润」/「内衣 · 内裤」…
 * 三路各记各的，所以这里也可能几样都念（照 `attireAdvanceLabel` 的顺序排）。
 */
export function attireAdvanceLabel(
  p: { bra?: AttireWear; panties?: AttireWear; wet?: number },
): string {
  const out: string[] = []
  if (p.bra) out.push(ATTIRE_META.bra.label)
  if (p.panties) out.push(ATTIRE_META.panties.label)
  if (p.wet) out.push(WET_META.label)
  return out.join(' · ')
}

/**
 * 把一次贴身衣物的推进**并进**手里那一份（`world.attire[charId]`），返回新的那一份。
 *
 * 这里是三条与私密档案**不一样**的规矩真正落地的地方 —— 所以它必须是纯函数、独自可验：
 *   · 穿着档位**后写覆盖**（不是累加）：她可以又穿回去，一次里也可以两件各走各的；
 *   · 湿润读数是**此刻的读数**，增量**允许为负**（缓过来了、擦干净了就往下走），
 *     夹在 0–100。这一条与开发度/色情度恰好相反 —— 那两样是「她这人被开发到哪儿了」，
 *     走过的每一格都算数，所以只增不减；湿润不是那一类；
 *   · **色情度耦合**：同一次里 `lewd` 涨了，湿润跟着涨 `WET_PER_LEWD` 分之一
 *     （除得尽的整份才计）——「因为发情而湿润」。这是湿润另一条来路，
 *     所以模型不必把同一件事拆开报两遍。
 *   · 流水只记**真的变了**的那些：两件都没动、湿润也没动，就不留一条
 *     （空转不记账）；一次里两件加湿润一起变了，合**一条**（新的在前，封顶）。
 *
 * `arouse` 由调用方给（lib/plot.ts 把同一次里的 `lewd` 增量递进来）——
 * 规矩留在这里，调用方只负责递数。
 */
export function mergeAttire(
  cur: AttireProgress | undefined,
  prog: AttireProgress,
  arouse = 0,
): AttireProgress {
  const from = cur ?? {}
  const next: AttireProgress = { ...from }

  // ── 穿着：后写覆盖，只收三档里的合法值 ──────────────────────
  const wear = { ...from.wear }
  const changes: { slot: AttireSlot; wear: AttireWear }[] = []
  for (const slot of ATTIRE_SLOTS) {
    const to = prog.wear?.[slot]
    if (to !== 'worn' && to !== 'half' && to !== 'off') continue
    // 与此刻那一档相同 → 不记（她本来就穿着，再报一次「穿着」不是变化）
    if ((from.wear?.[slot] ?? 'worn') === to) continue
    wear[slot] = to
    changes.push({ slot, wear: to })
  }
  if (Object.keys(wear).length) next.wear = wear

  // ── 湿润：累加 + 耦合 + 夹取（增量可以为负）────────────────
  const wetAdd = typeof prog.wet === 'number' && Number.isFinite(prog.wet) ? prog.wet : 0
  const coupled = Math.floor(Math.max(0, arouse) / WET_PER_LEWD)
  const before = clampWet(from.wet ?? 0)
  const after = clampWet(before + wetAdd + coupled)
  const wetMoved = after !== before
  if (from.wet !== undefined || wetAdd !== 0 || coupled !== 0) next.wet = after

  // ── 流水：只在真的变了的时候留一条（新的在前）─────────────
  if (changes.length || wetMoved) {
    const head = wearChangeText(changes)
    /* 湿润那一句：跨了档才念档位词（「湿润到洇湿」）；同一档里上下挪，只说得出来是
       哪一边 —— 否则从 0 涨到 3 会念成「湿润到干爽」，读着像退回去了。 */
    const tail = !wetMoved
      ? ''
      : wetStageIndex(after) !== wetStageIndex(before)
        ? `湿润到${wetStage(after)}`
        : after > before ? '湿润略增' : '湿润略退'
    const text = [head, tail].filter(Boolean).join(' · ')
    const entry: AttireLogEntry = { ts: Date.now(), text }
    next.log = [entry, ...(from.log ?? [])].slice(0, ATTIRE_LOG_MAX)
  }
  return next
}
