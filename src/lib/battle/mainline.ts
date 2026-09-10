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

export interface MainlineOpts {
  /** 已收束事件（只有走到了的事件才能复盘） */
  epDone: Record<string, true>
}

/**
 * 可复盘的主线作战，按时间线正序。
 * 只列「已收束事件」——没走到的地方，作战还没发生，自然也无从复盘。
 */
export function mainlineMissions(epDone: Record<string, true>): Mission[] {
  const out: Mission[] = []
  const last = Math.max(1, TIMELINE.length - 1)
  TIMELINE.forEach((e, i) => {
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
      status: '待接取',
      deadline: '正史 · 可随时复盘',
      desc: `${e.summary}`
        + `\n\n本作战为正史第 ${i + 1} 段「${e.phase}」的复盘：对手是 ${foes.join('、')}。`
        + `\n战果以档案为准，不与正史冲突；记录会按「详细战斗过程」逐手归档。`,
      reward: [`${targetLine(foes)} · 处置确认`, '正史复盘记录'],
      mainline: true,
    })
  })
  return out
}
