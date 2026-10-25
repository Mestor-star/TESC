/* ============================================================
   成长系统 · 数据表（等级 / 技能与天赋 / 世界的色彩）
   ------------------------------------------------------------
   三样东西，三张表，全在文件里：

     ① 等级 —— **按原著的 Stage 做**（主人 2026-10 的口径）。
        每个角色的等级起点 = 他档案上那条终末潜力的 Stage（chars.ts 的
        `potential` / 名册的 `SIDE_POTENTIAL`），例如露娜 Stage3、艾莉芙 Stage8、
        言万心叶 Stage4。**买一级 = 把这个人的 Stage 推进 1**，于是界面上写的
        永远是「Stage 5」这种原著读数，而不是「等级 3」。

        ⚠️ 两件事必须分清（数据层就把名字写死在这儿，界面照抄）：
          · 原著 Stage 是那个人**命里带来的**东西（终末本体的分级），谁也不能改；
          · 这里能买的是**终端给出的推进读数** —— 委员会替在册者记的训练与校准，
            加在同一个刻度上。两件事共用一个数，但不是同一件事。
        所以 `levelOf(id) = 基线 Stage + 已买次数`，加成的**只有已买的那几次**
        （基线 Stage 本身一分数值都不给 —— 那是档案，不是强化）。
        这条规矩就是「零解锁时战斗数值与改动前逐字节相同」的来路。

     ② 技能 / 天赋 —— 每条线若干级：**第 1 级由剧情节点免费解锁**，
        第 2 级起只能拿终末点数买（较贵）。技能行由名册（lib/battle/roster.ts）
        的真技能表长出来 —— 名字、描述、能耗、冷却都是那一份，不另抄一遍；
        天赋行同理长在本人被动（`passive.talents`）上。

     ③ 世界的色彩 —— 原文那六种「奇迹」（樱/黄金/苍蓝/蓝/灰/黑），
        对应原著的圣遗物，但更简单：**每种奇迹只提升一项数值**，
        1→7 级，代价按主人的公式 `cost(n) = cost(n-1) × (4 × n)`
        （n = 当前累计升级次数）。获取两条路：拿终末点数买，或者击破具名首领掉落。

   ⚠️ 本模块**模块加载零副作用**（mech / balance 在 Node 里直接加载整条 import 链）：
     只建静态表，不碰 localStorage / IndexedDB。
   ============================================================ */

import { CHARACTERS } from './chars'
import { SIDE_POTENTIAL } from './roster'
import { TIMELINE } from './timeline'
import { OPERATOR_ID } from './castmeta'
import { ROSTER } from '../lib/battle/roster'

/* ============================================================
   〇、一份加成长什么样（技能 / 天赋 / 色彩都往这一格里写）
   ------------------------------------------------------------
   字段一律「比例」或「绝对值」，与 derive 那边的加法链同一个口径：
     · power  —— 本人技能倍率的乘算加成（0.12 = 这一手整体 +12%）
     · atk    —— 破坏力轴 ×(1 + atk)
     · hp     —— 生命上限 ×(1 + hp)
     · res    —— 物理抗性轴 ×(1 + res)
     · aff    —— 反现实亲和轴 ×(1 + aff)
     · will   —— 意志力轴 ×(1 + will)
     · evade  —— 闪避（绝对值，0.02 = +2%）
     · tempo  —— 节拍上限（绝对值，1 = 一场多出一手的钱）
   全零 = 一点加成都没有 —— **那时 derive 拿到的必须是它原来那个对象/那个数**，
   不许复制、不许乘 1、不许重新取整（见 derive 的 growthAxes / growthHp）。
   ============================================================ */
export interface GrowthBonus {
  power: number
  atk: number
  hp: number
  res: number
  aff: number
  will: number
  evade: number
  tempo: number
}

export const NO_BONUS: GrowthBonus = {
  power: 0, atk: 0, hp: 0, res: 0, aff: 0, will: 0, evade: 0, tempo: 0,
}

/* ============================================================
   一、等级 = 原著 Stage
   ------------------------------------------------------------
   基线取档案上的终末潜力读数（`Stage N「关键词」` 里的 N）。
   没有终末的人（弹痕 / 斩击 / 片羽 / 加护持有者，档案写着「—」）没有那个读数，
   基线按 DEFAULT_BASE_STAGE 起 —— 那不是「编一个 Stage 给他」，只是让刻度有个
   起点：终端仍然可以给在册者记推进次数，推进出来的那一档不再声称是原著的 Stage。
   ============================================================ */

/** 档案上没有终末潜力时，刻度的起点 */
export const DEFAULT_BASE_STAGE = 1

/** `Stage 8「大」` / `Stage3「成长」` → 8 / 3；认不出（「—」）→ null */
function stageIn(s: string | undefined): number | null {
  if (!s) return null
  const m = /Stage\s*([0-9]+(?:\.[0-9]+)?)/i.exec(s)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) ? v : null
}

const BASE_STAGE: Record<string, number> = {
  /* 操作员不在 CHARACTERS 里（他在 castmeta / operator-arc）。原文口径：
     「言万心叶——委员会登记在册、终末潜力 Stage4『活性化』的读心者」（chars.ts 头注）。 */
  [OPERATOR_ID]: 4,
}
for (const c of CHARACTERS) {
  const s = stageIn(c.potential)
  if (s !== null) BASE_STAGE[c.id] = s
}
for (const id in SIDE_POTENTIAL) {
  if (BASE_STAGE[id] !== undefined) continue
  const s = stageIn(SIDE_POTENTIAL[id])
  if (s !== null) BASE_STAGE[id] = s
}

/** 这个人在原著里被评定的 Stage（没有终末者 = DEFAULT_BASE_STAGE） */
export function baseStageOf(id: string): number {
  return BASE_STAGE[id] ?? DEFAULT_BASE_STAGE
}

/**
 * 等级价的曲线 —— **直接用 store 那一条**（`levelCostOf(n)`，3000 起、
 * 前三级线性、之后 ×2.3 指数）。
 *
 * 为什么不在这里另起一条：柜台（views/Research.tsx）与角色页卖的是**同一样东西**，
 * 两条曲线必然有一天对不上 —— 一边写着 3000、另一边写着 4200，玩家只会觉得
 * 有一个是坏的。所以等级这一头全仓只有一条曲线，出处是 `lib/battle/store.ts`。
 * 逐级的数（n = 已买次数，第二列是累计）：
 *
 *   n   本级        累计
 *   0   3000       3000      （早期主线一场 675 买不到、中期一场 2138 两场买得到）
 *   1   3600       6600
 *   2   4200      10800
 *   3   9660      20460
 *   4  22218      42678
 *   5  51101      93779
 *   6 117533     211312
 *   7 270326     481638
 *   8 621751    1103389
 *   9 1430027   2533416
 *
 * 换算到 Stage 上就是：**Stage4 的人买三级 → 显示 Stage7**，
 * 这三级的钱（10800）≈ 5 场中期主线。
 */
export const LEVEL_CURVE_NOTE = 'levelCostOf(n)（store.ts）· 前 3 级线性 +600 · 之后 ×2.3'

/* ============================================================
   二、技能 / 天赋
   ------------------------------------------------------------
   每条线 = 若干级（技能 3 级、天赋 2 级）。每级给：
     desc    这一级这一手是什么样（第 1 级就是名册上那一句原文描述）
     extra   卡底加粗的那一句附加效果
     energy  能耗（节拍）
     cd      冷却（拍）
     story   推进到这个剧情节点（时间线事件 id）就**免费解锁**
     cost    否则花这么多终末点数买（两者取其一即可达成）
     bonus   这一级给的那份数值（**是「到这一级为止的总加成」，不是增量**）
   ============================================================ */
export interface GrowthLevel {
  /** 第几级（1 起） */
  lv: number
  desc: string
  extra?: string
  energy: number
  cd: number
  story?: string
  cost?: number
  bonus?: Partial<GrowthBonus>
}

export interface GrowthLine {
  /** 这一条线的键：全局唯一（`<charId>|<kind>|<n>`） */
  key: string
  name: string
  /** skill = 技能 · talent = 天赋 */
  kind: 'skill' | 'talent'
  /** 一句话说明（原文锚 / 这条线是干什么的） */
  note: string
  levels: GrowthLevel[]
}

/** 技能：第 1 级免费（剧情）· 第 2、3 级只能买（较贵 —— 比等级贵一档） */
export const SKILL_COST_LV2 = 5000
export const SKILL_COST_LV3 = 14000

/** 技能等级上限（主人 2026-09-21：技能可以升级，上限 10 级） */
export const SKILL_MAX_LEVEL = 10

/** 第 2 级到第 10 级的价（第 1 级只认剧情、不要钱）。
 *  前两级是原来那两格（5000 / 14000，别动），之后每级约 ×1.8，
 *  到第 10 级要 82 万点 —— 一条技能线练满 ≈ 中期主线 60 场，是长期目标。 */
export const SKILL_COSTS: readonly number[] = [
  5000, 14000, 26000, 46000, 82000, 145000, 260000, 460000, 820000,
]
/** 天赋：两级，第 2 级只能买 */
export const TALENT_COST_LV2 = 4000

/** 技能三级的倍率加成（是「到这一级为止的总加成」，不是增量） */
/** 第 n 级的技能倍率加成：第 1 级 +6%，此后每级再 +3%（第 10 级 +33%）。
 *  加成是**到这一级为止的总量**（不是叠乘），所以 derive 只要拿当前级那一格。 */
function skillPowerOf(lv: number): number {
  return Number((0.06 + (Math.max(1, Math.min(SKILL_MAX_LEVEL, lv)) - 1) * 0.03).toFixed(4))
}
/** 天赋两级的加成 */
const TALENT_BONUS: [Partial<GrowthBonus>, Partial<GrowthBonus>] = [
  { power: 0.03, atk: 0.02 },
  { power: 0.05, atk: 0.04, tempo: 1 },
]

/** 附加效果那一句 —— 按这一手的框架（atlas 的 arch）说，不为每个人各编一句 */
const ARCH_EXTRA: Record<string, string> = {
  强袭: '正面打穿：对上目标的破绽轴时，额外多削 1 点',
  驱逐: '命中之后拖慢对手：充能降一档',
  牵制: '把人钉在原地：这一手之后它动不了',
  重压: '越打越松：目标身上再叠一层削防',
  屏障: '这一面更厚：减伤再抬一档',
  治愈: '这一口气更长：回复量再抬一档',
  解放: '规格再抬一档：解封之后的每一手都更重',
  到达点: '终结技的分量再抬一档',
}
const EXTRA_DEFAULT = '这一手的分量更重一档'

/**
 * 剧情解锁点：**确定性**地分给每个人每一条线（不许掷骰子 —— 同一条线
 * 每次刷新都得指向同一个节点，否则玩家读到的解锁条件会变）。
 * 分法：把「角色 id + 线键」哈希到时间线上的一段；技能先于天赋半档。
 */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function storyPointOf(charId: string, key: string, kind: 'skill' | 'talent'): string {
  const n = TIMELINE.length
  const h = hash32(charId + '#' + key)
  // 技能落在 0 ~ 80% 那一段，天赋落在 20% 之后 —— 天赋是晚一点才长出来的东西
  const lo = kind === 'skill' ? 0 : Math.floor(n * 0.2)
  const hi = kind === 'skill' ? Math.max(lo + 1, Math.floor(n * 0.8)) : n
  const span = Math.max(1, hi - lo)
  return TIMELINE[lo + (h % span)]!.id
}

/** 名册里一手技能 → 三级这一条线 */
function skillLevels(charId: string, key: string, base: {
  desc: string; cost: number; cd: number; arch?: string
}): GrowthLevel[] {
  const extra = (base.arch && ARCH_EXTRA[base.arch]) || EXTRA_DEFAULT
  const story = storyPointOf(charId, key, 'skill')
  /* 十级：第 1 级只认剧情（免费），第 2 级起按 SKILL_COSTS 花点数。
     每级的说明只在句尾加一句「这一手又熟了一层」，不另写十段文案 ——
     文案要能一眼看出「升了这一级多了什么」，那件事在 bonus 与 extra 里。 */
  const out: GrowthLevel[] = []
  for (let lv = 1; lv <= SKILL_MAX_LEVEL; lv++) {
    out.push({
      lv,
      ...(lv === 1 ? { story } : { cost: SKILL_COSTS[lv - 2] }),
      desc: lv === 1 ? base.desc : base.desc + `（第 ${lv} 级：这一手又熟了一层。）`,
      extra, energy: base.cost, cd: base.cd,
      bonus: { power: skillPowerOf(lv) },
    })
  }
  return out
}

function talentLevels(charId: string, key: string, desc: string): GrowthLevel[] {
  const story = storyPointOf(charId, key, 'talent')
  return [
    {
      lv: 1, story,
      desc, extra: '天赋是自动触发的，不用点',
      energy: 0, cd: 0,
      bonus: TALENT_BONUS[0],
    },
    {
      lv: 2, cost: TALENT_COST_LV2,
      desc: desc + '（第 2 级：响得更重、也更勤一点。）',
      extra: '天赋是自动触发的，不用点',
      energy: 0, cd: 0,
      bonus: TALENT_BONUS[1],
    },
  ]
}

/** 两条线的通用造法：名册里有谁就造谁 */
function buildLines(): { skill: Record<string, GrowthLine[]>; talent: Record<string, GrowthLine[]> } {
  const skill: Record<string, GrowthLine[]> = {}
  const talent: Record<string, GrowthLine[]> = {}
  for (const id in ROSTER) {
    const role = ROSTER[id]
    /* 技能行取本人**战技**里的前两门（解封门不算 —— 那是规格，不是伤害手）；
       战技不足两门的（理论上没有，`assertDutySlots` 钉着下限 2）拿终结技补。 */
    const arts = role.skills.filter((s) => s.kind === '战技' && !s.gate)
    const ends = role.skills.filter((s) => s.kind === '终结技')
    const picked = [...arts, ...ends].slice(0, 2)
    skill[id] = picked.map((s, i) => {
      const key = id + '|skill|' + i
      return {
        key, name: s.name, kind: 'skill' as const,
        note: role.trait,
        levels: skillLevels(id, key, {
          desc: s.desc, cost: s.cost, cd: s.cd ?? 0, arch: s.arch,
        }),
      }
    })
    /* 天赋行长在本人被动上：有 `talents` 就用它（那是四格制的第四格），
       没有就把被动本身当一条天赋念出来 —— 总之「每个人都有自己的天赋」。 */
    const tal = role.passive?.talents ?? []
    if (tal.length) {
      talent[id] = tal.slice(0, 2).map((t, i) => {
        const key = id + '|talent|' + i
        return {
          key, name: t.name, kind: 'talent' as const,
          note: role.passive?.name ?? role.trait,
          levels: talentLevels(id, key, t.desc),
        }
      })
    } else {
      const key = id + '|talent|0'
      const name = role.passive?.name ?? '观测校准'
      talent[id] = [{
        key, name, kind: 'talent' as const,
        note: role.trait,
        levels: talentLevels(id, key, role.passive?.desc ?? role.trait),
      }]
    }
  }
  return { skill, talent }
}

const LINES = buildLines()

/**
 * 操作员（言万心叶）**手写**，不走名册：他的技能表按时期整块换页
 * （operator-arc.ts），名册里根本没有他那一栏。这里取的是第一卷那一段的
 * 真技能名（`低语 · 读心` / `停滞观测 · 宣告`）。
 */
const OP_SKILL_LINES: GrowthLine[] = [
  {
    key: OPERATOR_ID + '|skill|0', name: '低语 · 读心', kind: 'skill',
    note: '低语者：他听见的东西，全队都能用',
    levels: skillLevels(OPERATOR_ID, OPERATOR_ID + '|skill|0', {
      desc: '他把听见的东西念给全队听——对方的「往左躲」不再是秘密。自身回避率上升，全队命中率一并上升。',
      cost: 3, cd: 2, arch: '屏障',
    }),
  },
  {
    key: OPERATOR_ID + '|skill|1', name: '停滞观测 · 宣告', kind: 'skill',
    note: '到达点：委员会的执行权在他手上',
    levels: skillLevels(OPERATOR_ID, OPERATOR_ID + '|skill|1', {
      desc: '以低语者把整片战场的心声一次读完，再反向灌回去：这份观测记录当场成立，'
        + '场上所有东西都被按在原地。',
      cost: 8, cd: 4, arch: '到达点',
    }),
  },
]

const OP_TALENT_LINES: GrowthLine[] = [
  {
    key: OPERATOR_ID + '|talent|0', name: '低语者', kind: 'talent',
    note: '他出手之前，对方心里那句「往左躲」已经先到了',
    levels: talentLevels(OPERATOR_ID, OPERATOR_ID + '|talent|0',
      '他出手之前，对方心里那句「往左躲」已经先到了——攻击必中，闪避率提升 40%。'),
  },
]

export const SKILL_LINES: Record<string, GrowthLine[]> = {
  ...LINES.skill, [OPERATOR_ID]: OP_SKILL_LINES,
}
export const TALENT_LINES: Record<string, GrowthLine[]> = {
  ...LINES.talent, [OPERATOR_ID]: OP_TALENT_LINES,
}

/** 所有人（名册 25 位 + 操作员）—— 成长系统覆盖的就是这些人 */
export const GROWTH_CHARS: string[] = [OPERATOR_ID, ...Object.keys(ROSTER)]

/* ============================================================
   三、世界的色彩 = 原文里那**六种「奇迹」**（对应圣遗物，但只提升一项数值）
   ------------------------------------------------------------
   名字与含义照原文，不另造：樱色（守护与慈爱）· 黄金（希望与不变）·
   苍蓝（战斗与冒险）· 蓝色（次元）· 灰色（执着）· 黑色（原文未明言）。
   每种奇迹**只抬一样东西**，1→7 级。加成是**全队共享**的（奇迹是世界的性质，
   不是某个人的装备）—— 所以 `growthBonusOf(charId)` 里那一份对谁都一样，
   各家不同的是他自己的技能 / 天赋。

   数值怎么对上去（按含义对，不是按颜色对）：
     樱色 → 生命上限（守护：先活得下去）
     黄金 → 意志力（不变：不肯低头的那一口气）
     苍蓝 → 破坏力（战斗与冒险）
     蓝色 → 反现实亲和（次元：够得着另一个次元）
     灰色 → 机动 / 闪避（执着：咬住不放，脚步先跟得上）
     黑色 → 抗性（**原文没有明说**，按寓意取：黑色＝侵蚀，那就是抗侵蚀。
             本作数值层里「抗性」只有一条轴 —— 物理抗性，它一头管生命、
             一头管挨打的削减，反现实实体的撞击也走这一条。见下面那一格的注。）

   代价照主人的公式：`cost(n) = cost(n-1) × (4 × n)`，n = 当前累计升级次数。
   首个价（第 1 级）由我定：**100**（8 × COIN_SCALE，与终末点数那一支笔同一条栅格）。
   于是整张表（n = 要买到第几级）：

     n   本级价             累计
     1   100                 100         ← 一场仗买得起
     2   800                 900         ← ×4×2
     3   9,600              10,500       ← ×4×3
     4   153,600           164,100       ← ×4×4
     5   3,072,000       3,236,100       ← ×4×5
     6   73,728,000     76,964,100       ← ×4×6
     7   2,064,384,000  2,141,348,100    ← ×4×7

   ⚠️ 这张表的**尾巴是天文数字**，不是笔误 —— 主人的公式就是这样长的（1→7 级
      一共乘了 4·8·12·16·20·24 ≈ 2.9×10⁶）。所以名义上「能买」，实际只有前三级
      买得起；4 级往上真正可行的那条路是**击破具名首领掉落**（见下）。
      这也正好把「色彩」摆成一个打出来的东西，而不是又一个柜台商品。
   ============================================================ */
export type ColorField = 'atk' | 'hp' | 'res' | 'aff' | 'will' | 'evade'

export interface ColorDef {
  id: string
  /** 色彩名（世界的色彩） */
  name: string
  /** 它只抬哪一样 */
  field: ColorField
  /** 每一级抬多少（比例 / 绝对值） */
  per: number
  /** 一句话 */
  note: string
}

export const COLOR_MAX_LEVEL = 7
/** 第 1 级的价（主人的公式从这里起乘） */
export const COLOR_BASE_COST = 100
/** 级别的倍率那一格：`cost(n) = cost(n-1) × (4 × n)` 里的 4 */
export const COLOR_STEP = 4

export const COLORS: ColorDef[] = [
  {
    id: 'miracle-sakura', name: '樱色奇迹', field: 'hp', per: 0.04,
    note: '守护与慈爱 —— 先活得下去。每级生命上限 +4%',
  },
  {
    id: 'miracle-gold', name: '黄金奇迹', field: 'will', per: 0.03,
    note: '希望与不变 —— 那口不肯低头的气。每级意志力 +3%',
  },
  {
    id: 'miracle-azure', name: '苍蓝奇迹', field: 'atk', per: 0.03,
    note: '战斗与冒险 —— 手更重。每级破坏力 +3%',
  },
  {
    id: 'miracle-blue', name: '蓝色奇迹', field: 'aff', per: 0.04,
    note: '次元 —— 够得着另一个次元。每级反现实亲和 +4%',
  },
  {
    id: 'miracle-gray', name: '灰色奇迹', field: 'evade', per: 0.015,
    note: '执着 —— 咬住不放，脚步先跟得上。每级闪避 +1.5%',
  },
  {
    /* ⚠️ 黑色奇迹**原文没明说**是什么（主人原话「你猜吧」）。
       按寓意取「抗侵蚀」：黑色＝被侵蚀，那它抬的就是抗性。
       本作数值层里抗性只有一条轴（物理抗性）—— 它一头经 hpPerResist 抬生命、
       一头在 resistCut 里削每次挨打，反现实实体的撞击同样走这一条，
       所以「抗侵蚀」落在这里，不另造第六条轴（见 tuning 的 AXIS_SCALE 头注）。 */
    id: 'miracle-black', name: '黑色奇迹', field: 'res', per: 0.04,
    note: '原文未明言 —— 按寓意取抗性（黑色＝侵蚀，抗侵蚀）。每级物理抗性 +4%',
  },
]

/**
 * 买到第 n 级的价（n 从 1 起）。
 * `cost(n) = cost(n-1) × (4 × n)`（n ≥ 2）；`cost(1)` = COLOR_BASE_COST。
 * 超过 COLOR_MAX_LEVEL 时按最高一级算（调用方本来也不该问 8 级）。
 */
export function colorCostOfLevel(n: number): number {
  const k = Math.max(1, Math.min(COLOR_MAX_LEVEL, Math.floor(n)))
  let c = COLOR_BASE_COST
  for (let i = 2; i <= k; i++) c = Math.round(c * COLOR_STEP * i)
  return c
}

/** 整张表（n = 1..7）—— mech 拿它逐格对公式 */
export const COLOR_COST_TABLE: number[] =
  Array.from({ length: COLOR_MAX_LEVEL }, (_, i) => colorCostOfLevel(i + 1))

/**
 * 具名首领的掉落。
 * ------------------------------------------------------------
 * 口径：**每场都可能掉**（不是「同一只只能掉一次」）—— 首领可以反复打，
 * 每打完一场都是一次掷骰；掷法**确定性**地由那一场作战记录的 id 决定，
 * 所以读档、重放、刷新都不会重掷一遍（见 lib/growth 的 awardColorDrops）。
 * 为什么不做成「每只首领只掉一次」：这一套是长期成长，而具名首领就那么几位，
 * 一次性掉落会让色彩在第 3 位首领之后彻底停止生长。
 */
export const COLOR_DROP_CHANCE = 0.5
/** 掉的是哪一支：按记录 id 哈希到 COLORS 上（同一场每次都掉同一支） */
export const COLOR_DROP_RULE =
  '击破具名首领（作战记录带 bossId 且胜）→ 50% 掉 1 级随机色彩，每场都可能掉'
