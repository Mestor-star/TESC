/* ============================================================
   私密档案底档（data/intimate.ts）
   ------------------------------------------------------------
   **这是一份游戏内档案，不是原文考据。** 原作没有这些读数 —— 字段、状态句与
   初始开发度都是本终端自行拟制的（与 TAVERN_PERSONAS 的 greeting 同一性质：
   撰写样本，非原文台词）。因此：
     · 绝不冠以「· 原文」，也不进人物卡 / 导演提示词当事实喂；
     · 状态句一律**临床/档案用词**，不写成正文；真正的情节由推演通道去写。

   分工：
     · 本文件 = **底档**（初见时的那一页）；
     · `WorldState.intim` = **推进**（约会与私密往来落下的开发度增量 / 状态改写 / 破处对象）；
     · 合成规则在 `intimateOf`：开发度累加、状态后写覆盖、破处对象只认第一次落下的那个。

   一页上五根条：四处部位（口腔 / 胸部 / 小穴 / 菊穴）的**开发度**，加一根
   **色情度**（`lewd`）—— 后者不挂部位，说的是她这个人此刻的敏度与淫靡程度，
   与四处同一口径（0–100 的读数 + 一个档位词）。

   门槛：私密档案与私密话题都在羁绊 `INTIMATE_BOND`（70）以上解锁 ——
   与时间线里那道 70 的契约门槛同源：关系没走到这儿，这一页不翻开。

   只对**女角色**生效：`genderOf(id) !== 'f'` 的角色整节不出现（见 `hasIntimate`）。
   ============================================================ */

import type { IntimatePart, IntimateProfile, IntimateProgress, IntimateSlot } from './types'
import { genderOf } from './castmeta'

/** 私密档案 / 私密话题的解锁门槛（羁绊读数） */
export const INTIMATE_BOND = 70

/** 部位的四栏顺序（界面与提示词都照它排列，别各自再写一套） */
export const INTIMATE_SLOTS: IntimateSlot[] = ['mouth', 'breast', 'vagina', 'anus']

/** 部位的中文标签与一行释义（档案面板与提示词共用） */
export const SLOT_META: Record<IntimateSlot, { label: string; hint: string }> = {
  mouth: { label: '口腔', hint: '唇舌与咽喉的开发状况' },
  breast: { label: '胸部', hint: '胸部的敏感与开发状况' },
  vagina: { label: '小穴', hint: '前庭与内部的开发状况' },
  anus: { label: '菊穴', hint: '后庭的开发状况' },
}

/**
 * 第五根条：色情度。它不挂在哪个部位上 —— 四处开发度说的是「这处被开发到哪儿了」，
 * 色情度说的是**她这个人**此刻对这件事的敏度与淫靡程度：同样的 40，两个人的反应
 * 完全是两回事。所以它与四处并列成第五行，读数口径一致（0–100）。
 */
export const LEWD_META = { label: '色情度', hint: '对这件事的敏度与淫靡程度' } as const

/**
 * 一条私密推进的显示名 —— 提示条上念的那一句：「口腔」/「色情度」/「口腔 · 色情度」。
 * 两路各记各的（见 lib/plot.ts 的 IntimateDirective），所以这里也可能两样都念。
 */
export function intimAdvanceLabel(it: { slot?: IntimateSlot; lewd?: number }): string {
  const out: string[] = []
  if (it.slot) out.push(SLOT_META[it.slot].label)
  if (it.lewd) out.push(LEWD_META.label)
  return out.join(' · ')
}

/** 开发度的档位词（读数之外给一句人话；0 与满值各有专门说法） */
export function devStage(dev: number): string {
  if (dev <= 0) return '未开发'
  if (dev < 20) return '初识'
  if (dev < 40) return '渐熟'
  if (dev < 60) return '熟稔'
  if (dev < 80) return '深谙'
  if (dev < 100) return '沉溺'
  return '极深'
}

/** 破处对象的显示名（'you' = 操作员本人；其余为世界内人物名） */
export function firstByName(who: string | null, operatorName: string): string {
  if (!who) return ''
  return who === 'you' ? `${operatorName}（你）` : who
}

/** 底档的一句「未破处」标注（破处对象那一栏的缺省读数） */
export const VIRGIN = '—— 未破处（处女）'

const p = (state: string, dev: number): IntimatePart => ({ state, dev })

/**
 * 女角色底档。键 = 档案角色 id（只收 genderOf === 'f' 的 18 位）。
 * 开发度一律给低值（0–20）：这些是**初见那一页**的读数，往后怎么走看主角做过什么。
 * 状态句写各人的性情，不写情节 —— 情节由推演通道生成。
 */
export const INTIMATE: Record<string, IntimateProfile> = {
  /* —— 苍之学园 —— */
  hikari: {
    parts: {
      mouth: p('嘴唇饱满，接吻零经验；被碰到会愣一下再笑出来', 4),
      breast: p('分量十足，自己嫌碍事；隔着衣服被看会瞪回来', 6),
      vagina: p('未经人事，本人对这类话题意外地脸皮薄', 2),
      anus: p('全未开发，连触碰都未经设想', 0),
    },
    lewd: 5,
    virgin: true,
    firstBy: null,
  },
  luna: {
    parts: {
      mouth: p('烟草与咖啡的味道；舌面敏感，吻技尚生涩', 10),
      breast: p('丝线织就的仿真躯体，触感偏凉；开发中', 8),
      vagina: p('人造之躯，机能完备而未经使用', 4),
      anus: p('未开发；本人会直白地问「要试这里吗」', 0),
    },
    lewd: 9,
    virgin: true,
    firstBy: null,
  },
  mefisa: {
    parts: {
      mouth: p('一本正经的唇；被深吻会先僵住，随后反客为主', 6),
      breast: p('高挑身量的相应分量；本人从不谈论', 4),
      vagina: p('未经人事；对这一步有她自己那套审慎的判断', 2),
      anus: p('全未开发', 0),
    },
    lewd: 5,
    virgin: true,
    firstBy: null,
  },
  nyau: {
    parts: {
      mouth: p('总含着草莓牛奶的甜味；吻起来像在舔糖', 3),
      breast: p('身形娇小，分量轻盈；怕痒', 2),
      vagina: p('未经人事，本人甚至没太懂这意味着什么', 1),
      anus: p('全未开发', 0),
    },
    lewd: 3,
    virgin: true,
    firstBy: null,
  },
  youshihan: {
    parts: {
      mouth: p('睡醒后总是软的；吻到一半会打着哈欠黏上来', 12),
      breast: p('分量可观，本人懒得管；睡姿压出的印子要好久才消', 10),
      vagina: p('自陈「活得太久，这种事也没那么新鲜了」；实则疏于打理', 8),
      anus: p('未开发；本人表示「懒得试」', 0),
    },
    lewd: 9,
    virgin: true,
    firstBy: null,
  },
  'alive-anatolia': {
    parts: {
      mouth: p('谈笑间就把话说满；吻的时候也一样，绝不给退路', 14),
      breast: p('仪态无可挑剔，衣装之下亦然', 12),
      vagina: p('本人声称「我等你很久了」；档案不作旁证', 10),
      anus: p('未开发', 0),
    },
    lewd: 13,
    virgin: true,
    firstBy: null,
  },
  'xiaochai-lin': {
    parts: {
      mouth: p('屏幕蓝光下没怎么说过软话；被亲会先报一句「进程出错」', 4),
      breast: p('与姐姐相仿的娇小分量', 4),
      vagina: p('未经人事；知情程度却是队里最高的一个', 2),
      anus: p('全未开发', 0),
    },
    lewd: 4,
    virgin: true,
    firstBy: null,
  },

  /* —— 卡乌斯学院 —— */
  'danae-whitmore': {
    parts: {
      mouth: p('平时结结巴巴；认真模式下会突然判若两人', 6),
      breast: p('娇小身形下的分量，与她变身后的身量同样出人意表', 4),
      vagina: p('未经人事；对这一类话题怯生生地回避', 2),
      anus: p('全未开发', 0),
    },
    lewd: 5,
    virgin: true,
    firstBy: null,
  },
  'nana-kamiru': {
    parts: {
      mouth: p('总是先问你要不要喝点什么；唇上带着温吞的糖分', 8),
      breast: p('分量中上，收在制服的护具里', 6),
      vagina: p('未经人事；照顾人的那一面远多过被照顾', 3),
      anus: p('未开发', 0),
    },
    lewd: 7,
    virgin: true,
    firstBy: null,
  },
  reiya: {
    parts: {
      mouth: p('见了你就雀跃；吻起来毫无保留', 10),
      breast: p('名门娇养的分量；本人对身材管理相当自得', 8),
      vagina: p('未经人事；对「夫妻」一类说法毫无抵抗力', 4),
      anus: p('全未开发', 0),
    },
    lewd: 8,
    virgin: true,
    firstBy: null,
  },
  emei: {
    parts: {
      mouth: p('姐姐式的话术滴水不漏；只有独处时才肯软下来', 8),
      breast: p('与蕾雅相仿的家系，身量略高', 6),
      vagina: p('未经人事；档案不作旁证', 3),
      anus: p('未开发', 0),
    },
    lewd: 7,
    virgin: true,
    firstBy: null,
  },
  'isis-halid': {
    parts: {
      mouth: p('话头永远比人快；被堵住嘴的瞬间会安静得反常', 8),
      breast: p('中上；本人宣称这是「取材必要」', 6),
      vagina: p('未经人事，却敢把这种事写进稿子', 4),
      anus: p('未开发', 0),
    },
    lewd: 8,
    virgin: true,
    firstBy: null,
  },

  /* —— Corporations —— */
  katherine: {
    parts: {
      mouth: p('吻也带着队长的规矩：先请示，再准或不准', 10),
      breast: p('制服与礼节之下，分量相当可观', 8),
      vagina: p('未经人事；本人视之为「未开辟的战线」', 4),
      anus: p('未开发', 0),
    },
    lewd: 8,
    virgin: true,
    firstBy: null,
  },
  maria: {
    parts: {
      mouth: p('台上是万人迷，台下却容易脸红；吻得笨拙', 6),
      breast: p('身形纤细，分量轻盈', 5),
      vagina: p('未经人事；舞台上的媚态全是为镜头练的', 2),
      anus: p('全未开发', 0),
    },
    lewd: 5,
    virgin: true,
    firstBy: null,
  },
  'merwen-gray': {
    parts: {
      mouth: p('文学少女的唇；被吻时会先引一句书，再忘了后半句', 8),
      breast: p('中上；真空手道的底子让她不介意被掂量', 6),
      vagina: p('未经人事；对她而言更像一章还没写的书', 3),
      anus: p('未开发', 0),
    },
    lewd: 6,
    virgin: true,
    firstBy: null,
  },
  ameria: {
    parts: {
      mouth: p('话语隔着记录世界传来；吻上去分不清虚实', 10),
      breast: p('亡者的身姿，停在离去前的那一年', 8),
      vagina: p('未经人事；本人对此只是柔和地笑', 4),
      anus: p('未开发', 0),
    },
    lewd: 8,
    virgin: true,
    firstBy: null,
  },

  /* —— 学园外 · 其它 —— */
  'kuro-no-maou': {
    parts: {
      mouth: p('甜食党的舌头；亲过你一次，就再也不打算认生', 14),
      breast: p('看似纤弱，实则与她的执念一样不容动摇', 10),
      vagina: p('如她所言，「吾乃魔王」——这一页尚未开启', 6),
      anus: p('未开发；本人表示「没兴趣，除非你想要」', 0),
    },
    lewd: 12,
    virgin: true,
    firstBy: null,
  },
  'huda-nayume': {
    parts: {
      mouth: p('算过千百种局面，唯独没算过这一种；会难得地少话', 6),
      breast: p('中上；收在领队的外套里', 5),
      vagina: p('未经人事；档案不作旁证', 3),
      anus: p('未开发', 0),
    },
    lewd: 5,
    virgin: true,
    firstBy: null,
  },
}

/** 该角色有没有私密档案（只对女角色生效；底档或性别任一不合即 false） */
export function hasIntimate(charId: string): boolean {
  return genderOf(charId) === 'f' && !!INTIMATE[charId]
}

/**
 * 底档 + 推进 → 此刻的一页。
 *
 * 合成规则（四处，缺一不可）：
 *   · 部位开发度 = 底档 + 增量，夹在 0–100；
 *   · 色情度     = 同上，只是它不挂在哪个部位上（`IntimateProfile.lewd`）；
 *   · 状态句 = 推进里若有这一段就覆盖底档那一句（后写覆盖）；
 *   · 破处对象 = 第一次落下的那个说了算（`firstBy`）—— 之后再有改写也不顶掉它：
 *     「破处对象是谁」问的是第一回，不是最近一回。
 * 不是女角色 / 没有底档 → null（调用方整节不摆）。
 */
export function intimateOf(charId: string, progress?: IntimateProgress): IntimateProfile | null {
  const base = INTIMATE[charId]
  if (!hasIntimate(charId) || !base) return null
  const parts = {} as Record<IntimateSlot, IntimatePart>
  for (const slot of INTIMATE_SLOTS) {
    const b = base.parts[slot]
    const add = progress?.dev?.[slot] ?? 0
    const state = progress?.state?.[slot]
    parts[slot] = {
      state: state?.trim() ? state.trim() : b.state,
      dev: Math.max(0, Math.min(100, Math.round(b.dev + add))),
    }
  }
  const lewdAdd = progress?.lewd ?? 0
  const first = progress?.firstBy?.trim() || base.firstBy
  return {
    parts,
    lewd: Math.max(0, Math.min(100, Math.round(base.lewd + lewdAdd))),
    virgin: !first,
    firstBy: first ?? null,
  }
}

/** 该角色此刻的私密档案（`progress` 一般直接传 `world.intim?.[charId]`） */
export function intimateProfileOf(charId: string, progress?: IntimateProgress): IntimateProfile | null {
  return intimateOf(charId, progress)
}
