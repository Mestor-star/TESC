/* ============================================================
   主线作战 —— 正史里确实交过手的那几场
   ------------------------------------------------------------
   时间线上的每一个事件都写着「在哪里、对上的是什么」，本文件把
   其中真打过一场的抽出来做成可复盘的作战：编号 MAIN-xx，
   敌人取事件原文列出的实体，地点取事件原文地点，难度随事件在
   时间线上的位置递增。
   与随机任务的区别只有一条，但很要紧：主线作战归档时会写成
   「详细战斗过程」，逐手复现，不压缩。
   ============================================================ */

import { TIMELINE } from '../../data/timeline'
import type { Mission } from '../../data/types'
import { namedBossOf } from './bosses'

/** 事件里没有实体（'——'）就不成其为一场作战 */
const NO_FOE = '——'

/**
 * 事件 → 它那一场的**头名**（终末图鉴条目 id，见 endfoes.ts）。
 * ------------------------------------------------------------
 * 时间线的每一个事件都写着自己遇上了哪些实体；在此之前，牌面上那几个名字
 * 只被拿去算「敌方性质」（natureOf）与作战目标那一行 —— 真正站到对面去的
 * 还是「未分类观测体 甲 · 精英」，与事件原文对不上号。
 * 于是玩家在正史里读到「对上的是死灵的浮游城」，打起来是一只临时挂牌的杂兵。
 *
 * 这一张表补的就是这一步：把「这一场领头的到底是哪一只」写下来。
 * 为什么是一张手写的表，而不是从 entities 里自动挑一个：
 *   · 清单的顺序不是主次（v1-5 首位写的是「脏器公寓」那座馆，可动手的是格尔；）
 *   · 图鉴的危险度也不能当尺子（v1-9 把「黄金狮子」列在前面，那是露娜的终末，
 *     是站在这边的；v3-8 的「怪异之王」图鉴评 Stage0『种子』，
 *     可那是封印中的分类，不是它的出力）；
 *   · 而「谁领头」本来就是叙述的事：v3-7 三个实体同评 Stage4，
 *     领头的是舰队，蝴蝶是它之后的那一拍。
 * 所以一个事件一行，理由写在行上。取的是图鉴条目 id ——
 * 有这一份的（endfoes / bosses）才写，写不出来的（原文没名没姓的残骸一类）
 * 就留空，那一场照旧走现推的观测体。
 *
 * 这一张表本身也被复核读（见 scripts/mech 第 15 节）：
 * 键必须是真登了实体的事件（不留错位与失效行），
 * 而所指的那一位**必须是这一段自己列出来的实体之一**——
 * 上一版写这张表时整片错开了一行（entities 那一行压在它所属事件的 id 之下，
 * 抄的时候按视觉位置对，于是 v3-3 拿了 v3-4 的对手），
 * 那条断言就是为此立的。
 */
export const EVENT_HEAD: Record<string, string> = {
  'v1-2': 'soul-reservoir',   // 灵魂蓄积器TM —— 这一场就它一个
  'v1-5': 'organ-apt',        // 脏器公寓。第一形态，倒下之后依次顶上格尔与黑曜石（三形态，见 endfoes 的 next）
  'v1-6': 'clay-mask',        // 泥塑面具（「丝绸小丑的残骸」图鉴未收录，进不了这一张表）
  'v1-8': 'guardian',         // 守护者 —— 深海异界里挡在路上的那一具
  'v1-9': 'death-god',        // 死骸机关之神。黄金狮子是露娜的终末，站在这边，不能算对手
  'v2-2': 'deep-hole',        // 深穴 —— 心叶与兰对赌的那座迷宫
  'v2-8': 'master-craft',     // 巨匠。他吞下黑之魔王、又招来二级天使（三形态，见 endfoes）
  'v3-2': 'chain-detective',  // 锁链的侦探 —— 自天坠落、把集市变成地狱的那一位
  'v3-3': 'rose-detective',   // 蔷薇的侦探。这一话是她处决了侦探；铁之心脏是争夺的对象，不是对手
  'v3-4': 'cape-mouth',       // 喜望峰的大口 —— 那道通往异次元的口
  'v3-7': 'death-fleet',      // 死灵舰队。浮游城与蝴蝶是它之后的两拍（三形态）
  'v3-8': 'strange-king',     // 怪异之王 —— 借万仙阵来的那一位
  'v3-9': 'star-whale',       // 星鲸。艾莉芙是来救心叶的，图鉴的 counter 也写着「不可对抗，只可铭记」
  'v4-1': 'master-craft',     // 巨匠（v4 序章再登场，被斩之后由骷髅假面之男救走）
  'v4-3': 'thread-person',    // 线之人 —— 篝火之国每年一度封印的那一位
  'v4-4': 'masked-kokonoha',  // 骷髅假面之男 —— 身份揭穿的那一话（bosses.ts 的那一份）
  'v4-5': 'thread-person',
  'v4-7': 'thread-person',
  'v4-8': 'thread-person',    // 四场终局。紫之大树是它遁走之后的那一拍（见 endfoes 的 next）
  'v5-4': 'residue',          // 残响的遗骸 —— 那个「实现你的愿望」的试炼宇宙
  'v5-7': 'residue',
  'v6-3': 'emilya',
  'v6-4': 'emilya',
  'v6-5': 'emilya',
  'v6-6': 'emilya',           // 「世界之种」图鉴写着「不可阅读、不可介入」，不是对手
  'v6-7': 'emilya',
  'v6-8': 'emilya',           // 终局。艾美莉亚之箱是她之后的那一拍（见 endfoes 的 next）

  /* 外传 S1。与 v1~v6 同一张表：正传的分段记 v，外传记 s，
     而「全文会触发的战斗」里的全文本来就包括外传 —— 那几话里也确实打过。 */
  's1-2': 'cherax',           // 魇视鳌虾 —— 六年前卢因沙漠那一场（同话另一件是商品，不是对手）
}

/**
 * 那几段**不指派头名**的实体事件。
 * ------------------------------------------------------------
 * 不是每一段登着实体的事象都是一场仗：No.823 人造仿生人类观测套件
 * 是一台「解析接触者、生成极小型人造人来观测」的商品，图鉴 counter 一栏
 * 写得明白 ——「（商品）制造的是『观测人生』，非现实干涉」。
 * 外传话4 里心叶与格蕾在岛上过了数年，现实中泰尔一解就开了，没有谁站到对面。
 * 所以这里明写一笔豁免，而不是让它悬着：不是「没写完」，
 * 是这一段的答案本来就是「没有对手」。那一段的牌面照旧立着，
 * 站上来的是现推的观测体 —— 给它临时指派一位图鉴实体才是真的编。
 */
const NO_FIGHT: Record<string, string> = {
  's1-4': '人造仿生人类观测套件 —— 制造的是「观测人生」，非现实干涉（图鉴 counter 一栏）。',
}

/**
 * 这个事件的那一场，头名是谁（找不到就是没有 —— 照旧走现推的观测体）。
 *
 * 只吐得出**认得出档案**的那一个：表上写了 id、而 id 在 bosses / endfoes
 * 里查得到，才会被交出去。写了名字却没那一份档案的话，
 * derive 会拿不到人、又不再是「没挂 bossId」，那一场反而更难看 ——
 * 所以这里替它把话咽回去。
 *
 * 明写豁免的那几段（NO_FIGHT）连表都不查：那几段本来就该是空的。
 */
export function headFoeOf(evId: string): string | undefined {
  if (NO_FIGHT[evId]) return undefined
  const id = EVENT_HEAD[evId]
  return id && namedBossOf(id) ? id : undefined
}

/** 那几段「登了实体但不是一场仗」的事件与它们的理由（复核读它） */
export const NON_FIGHT_EVENTS = NO_FIGHT

/**
 * 敌方性质：直接喂给 derive.ts 的 ENEMY_PROFILE 关键词匹配。
 * 只做「把原文名词翻成档案口吻」这一件事，不另立设定。
 */
function natureOf(foes: string[]): string {
  const s = foes.join(' ')
  if (/魔王/.test(s)) return '魔王 · 终末化'
  if (/天使|守护者|侦探|骑士|巨匠|大口|面具|小丑/.test(s)) return '异端 · 显形'
  if (/蓄积器|机械|机关|要塞|浮游城|舰队|公寓|心脏/.test(s)) return '反现实机械工学 · 制成品'
  if (/残骸|残渣|旧物|死骸/.test(s)) return '反现实残渣 · 残留'
  if (/低语/.test(s)) return '低语 · 再聚合'
  if (/龙花|异界/.test(s)) return '龙花 · 异界'
  return '未分类 · 观测记录'
}

/** 作战目标性质的一句话（记录与简报都读它） */
function targetLine(foes: string[]): string {
  return foes.length === 1 ? foes[0] : `${foes[0]} 等 ${foes.length} 个实体`
}

/**
 * 可复盘的剧情作战 —— 一场一场来。
 *
 * 摆出来的永远只有眼下这一场：按时间线正序，取第一个还没「领取归档」的事件
 * （从 v1-1 灵魂蓄积器TM 讨伐起）。前一场没在推演里打赢，后一场就不上牌面。
 * 打赢了它才变成「待领取」，去任务简报点一下归档，牌面才翻到下一场。
 *
 * 收束过没走过（epDone）不再作为展示条件：牌面要一直在，人才知道
 * 眼下该打完的是哪一场 —— 但没走到那一段时，作战无从谈起，所以要等收束。
 */
export function mainlineMissions(epDone: Record<string, true>, claimed: Record<string, true> = {}): Mission[] {
  const out: Mission[] = []
  const last = Math.max(1, TIMELINE.length - 1)
  TIMELINE.forEach((e, i) => {
    if (out.length) return
    if (claimed[e.id]) return
    if (!epDone[e.id]) return
    const foes = (e.entities ?? []).filter((x) => x && x !== NO_FOE)
    if (!foes.length) return
    // 头名：认得出档案的那一只（见 EVENT_HEAD）。认不出就照旧是现推的观测体
    const bossId = headFoeOf(e.id)
    const head = namedBossOf(bossId)
    out.push({
      id: `main-${e.id}`,
      at: e.id,
      no: `MAIN-${String(i + 1).padStart(2, '0')}`,
      title: e.title,
      place: e.place,
      // 难度随事件在时间线上的位置走：越靠后的仗越硬
      stage: Math.min(10, Math.max(2, Math.round(2 + (i / last) * 8))),
      nature: natureOf(foes),
      ...(bossId ? { bossId } : {}),
      recommend: (e.chars ?? []).map((id) => id),
      // 剧情作战不是派单，没得接取：它只在推演里发生，牌面只负责告诉你眼下该打哪一场
      status: '压制中',
      deadline: '剧情战斗 · 在推演现场发生',
      desc: `${e.summary}`
        + `\n\n本作战为主线第 ${i + 1} 段「${e.phase}」：对手是 ${foes.join('、')}。`
        + (head ? `\n站在对面的头一位是 ${head.name}；${head.from}。` : '')
        + `\n它不在这里下令开打 —— 到剧情推进里走到这一段，现场自然会撞上；那一仗赢了，再回这里点「领取归档」。`
        + `\n战果以档案为准，不与观测记录冲突；记录会按「详细战斗过程」逐手归档。`,
      reward: [`${targetLine(foes)} · 处置确认`, '剧情战斗归档'],
      mainline: true,
    })
  })
  return out
}
