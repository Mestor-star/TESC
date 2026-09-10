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

/** 事件里没有实体（'——'）就不成其为一场作战 */
const NO_FOE = '——'

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
    out.push({
      id: `main-${e.id}`,
      at: e.id,
      no: `MAIN-${String(i + 1).padStart(2, '0')}`,
      title: e.title,
      place: e.place,
      // 难度随事件在时间线上的位置走：越靠后的仗越硬
      stage: Math.min(10, Math.max(2, Math.round(2 + (i / last) * 8))),
      nature: natureOf(foes),
      recommend: (e.chars ?? []).map((id) => id),
      // 剧情作战不是派单，没得接取：它只在推演里发生，牌面只负责告诉你眼下该打哪一场
      status: '压制中',
      deadline: '剧情战斗 · 在推演现场发生',
      desc: `${e.summary}`
        + `\n\n本作战为主线第 ${i + 1} 段「${e.phase}」：对手是 ${foes.join('、')}。`
        + `\n它不在这里下令开打 —— 到剧情推进里走到这一段，现场自然会撞上；那一仗赢了，再回这里点「领取归档」。`
        + `\n战果以档案为准，不与观测记录冲突；记录会按「详细战斗过程」逐手归档。`,
      reward: [`${targetLine(foes)} · 处置确认`, '剧情战斗归档'],
      mainline: true,
    })
  })
  return out
}
