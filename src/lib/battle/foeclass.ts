/* ============================================================
   图鉴实体 · 敌阵资格（谁站得上对面）
   ------------------------------------------------------------
   终末图鉴里收的不全是「怪物」：也有地点（脏器公寓、天空要塞）、
   设施（学园实习迷宫深穴、死灵的浮游城）、现象（电线杆病、世界之种）
   与器物（铁之心脏、艾美莉亚之箱）。这些东西在正文里或是战场本身，
   或是一件被人争抢的东西 —— **没有一样是能站到对面挨打的个体**。

   判据写在这里，只此一处：
     · 默认放行（生物 / 人型）：图鉴登记的是个有躯体的个体；
     · 黑名单明写：凡是 nature 落在『地点 / 现象 / 设施 / 器物』的，
       一律不进敌阵（生成目标池、按场面补的变体、主线头名都过这一道）；
     · 名字兜底：就算将来新添条目忘了登记，『…公寓 / …要塞 / …之箱 /
       …之种 / …病 / …心脏』这几个后缀也拦得住。

   ⚠️ 图鉴内容（src/data/codex.ts）一个字都不改 —— 分类是**读**出来的，
   不是往档案里塞字段。名单与理由留在这里，可复核（scripts/foegen-check.mjs）。
   ============================================================ */

import { CODEX } from '../../data/codex'
import type { EndEntry } from '../../data/types'

/** 图鉴实体的「性质归属」—— 只有前两档站得上敌阵 */
export type FoeNature = '生物' | '人型' | '地点' | '现象' | '设施' | '器物'

interface NonCombat {
  nature: FoeNature
  /** 一句话：为什么不站到对面（界面与复核都读它） */
  why: string
}

/**
 * 非战斗实体（黑名单）。键是图鉴条目 id，与 codex.ts 同一套。
 * 名单只收「档案里自己写着它不是个体」的那些，理由逐条附上。
 */
export const NON_COMBAT_CODEX: Readonly<Record<string, NonCombat>> = {
  'organ-apt': {
    nature: '地点',
    why: '巴塞罗那・圣路西亚公馆 —— 狂热者格尔布下的仪式灾害本身，是战场不是对手。',
  },
  'laputa': {
    nature: '设施',
    why: '由超古代文明建造的天空都市（要塞），凯特琳在它上面迎战，本体未参战。',
  },
  'sky-castle': {
    nature: '设施',
    why: '死灵次元的浮游要塞：每隔五分钟放一道死亡光束，是被拦截的高空目标。',
  },
  'deep-hole': {
    nature: '设施',
    why: '苍之学园实习用的迷宫（counter 栏明写「学园设施」），不是活物。',
  },
  'telephone-pole': {
    nature: '现象',
    why: '借媒体扩散的感染型仪式灾害 —— 传播本身即灾害，没有可打的躯体。',
  },
  'world-seed': {
    nature: '现象',
    why: '宇宙意志之种：counter 栏写着「不可阅读、不可介入」，只可收容。',
  },
  'iron-heart': {
    nature: '器物',
    why: '上野不忍池底的机密终末，是死灵次元入侵的争夺目标 —— 被保住，不是被打倒。',
  },
  'emilya-box': {
    nature: '设施',
    why: '艾美莉亚自制的生体计算机（服务器室中央），是据点与安放处，不是个体。',
  },
}

/** 名字兜底：新条目忘了登记名单时，这几个后缀也拦得住 */
const NON_FOE_NAME = /(公寓|要塞|浮游城|深穴|之箱|之种|电线杆病|之心脏)$/

/** 这一条图鉴实体的性质归属 */
export function foeNatureOf(e: EndEntry): FoeNature {
  const listed = NON_COMBAT_CODEX[e.id]
  if (listed) return listed.nature
  if (NON_FOE_NAME.test(e.name)) return '设施'
  return '生物'
}

/** 它站不站得上敌阵 */
export function isFoeEntity(e: EndEntry): boolean {
  const n = foeNatureOf(e)
  return n === '生物' || n === '人型'
}

/** 不进敌阵的那一条理由（放行时返回 undefined） */
export function nonFoeReasonOf(id: string): string | undefined {
  const listed = NON_COMBAT_CODEX[id]
  if (listed) return listed.why
  const e = CODEX.find((c) => c.id === id)
  if (!e) return undefined
  return isFoeEntity(e) ? undefined : ('名字判成' + foeNatureOf(e) + '：不进敌阵。')
}

/** 按 id 取图鉴条目（找不到返回 undefined） */
export function codexEntityOf(id: string): EndEntry | undefined {
  return CODEX.find((c) => c.id === id)
}