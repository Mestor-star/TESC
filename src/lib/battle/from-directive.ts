/* ============================================================
   剧情 → 交战
   ------------------------------------------------------------
   模型在事件指令里输出 battle 字段（敌方名称 / 性质 / 危险度 /
   地点 / 在场参战者），这里把它翻译成一张可开打的作战单。
   不新造任务编号体系：剧情交战一律记 OBS-xxx，与任务板的 MST-xxx
   分列，在作战记录里一眼看得出这场是故事里打起来的。
   ============================================================ */

import type { PlotBattle } from '../plot'
import type { Mission } from '../../data/types'
import { OPERATOR_ID } from '../../data/castmeta'
import { namedBossOf } from './bosses'
import { headFoeOf, isMainlineEvent } from './mainline'
import { TUNING } from './tuning'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

let seq = 0

/**
 * 剧情交战的参战名单：模型点的那一份 → 真能上场的那一份。
 *
 * 依次做三件事：**放行 → 去重 → 封顶**。
 *
 * **为什么操作员要单独放行。** 他不在那二十四人的档案名录里（`castmeta` 的操作员
 * 条目单列一条线），`met` 里也没有他那一格 —— 所以 `isMet('operator')` 恒为 false。
 * 从前这里就是照 isMet 一筛，于是**主角永远进不了在线推演打起来的这一场**：
 * 人少了不说，露娜 / 梅芙那几条双人追击、七人整队连携（`synergy.ts` 里带着
 * OPERATOR_ID）、还有挂在他身上的战斗语音，全都一次不响。2026-09-15 主人撞见的
 * 就是这一条。
 * 他与不上由**模型自己点**（主人 2026-09-15 拍）：他这一场在场就写进 squad，
 * 不在场就别写 —— 这儿只放行，**不保送**，所以 `named` 里没有他就真的没有他。
 *
 * 封顶读 `TUNING.squadMax` —— 与作战屏编队那一边**同一个数**（从前这里硬写 4，
 * 两条路的上限对不上，平衡一动就得记着改第二处）。
 *
 * @param named 模型写下的参战 id（`sanitizeDirective` 已过一道白名单，认得操作员）
 * @param isMet 这个人此刻算不算「已遇见」——操作员不走它，由常量直接放行
 */
export function plotSquadOf(named: string[], isMet: (id: string) => boolean): string[] {
  const out: string[] = []
  for (const id of named) {
    if (id !== OPERATOR_ID && !isMet(id)) continue
    if (!out.includes(id)) out.push(id)
  }
  return out.slice(0, TUNING.squadMax)
}

/**
 * 现场交战 → 作战单（编号 OBS-xxx，性质缺省按反现实实体处理）
 *
 * 头名不由指令说了算：事件本身写着这一场对上的是哪一只（见 mainline 的 EVENT_HEAD），
 * 所以只要这一段的正文里确实有对手，站上来的就是那一位 ——
 * 图鉴上写着「死灵的浮游城」的那一段，打到的不该是一只临时挂牌的观测体。
 * 模型给的 stage / nature 照样用（它读的是这一段的现场），
 * 但**头名与它的血量**归档案：指令是模型写的，图鉴不是。
 */
export function battleMissionOf(b: PlotBattle, evId: string): Mission {
  seq += 1
  const stage = clamp(Math.round(b.stage ?? 5), 1, 10)
  const bossId = headFoeOf(evId)
  const head = namedBossOf(bossId)
  return {
    id: `plot-${evId}-${seq}`,
    no: `OBS-${String(seq).padStart(3, '0')}`,
    title: b.name,
    place: b.place ?? '现场',
    stage,
    nature: b.nature ?? '反现实 · 遭遇',
    ...(bossId ? { bossId } : {}),
    recommend: [],
    status: '压制中',
    deadline: '即刻',
    desc: `${b.name} 出现在现场。交战由观测现场触发——按在场的成员与眼前的敌人开打，打完即回到正文。`
      + (head ? `\n档案上这一段的头一位是 ${head.name}；${head.from}。` : ''),
    reward: ['现场压制', '观测继续'],
    /* 这一段是正史里真打过的那一场（事件原文列了实体）→ 它就是任务简报上
       那一段主线。带上这个记号，归档才会走「详细战斗过程」那一路，
       作战记录里也会挂着「主线」—— 与简报上的那一条对得上号。 */
    ...(isMainlineEvent(evId) ? { mainline: true } : {}),
  }
}
