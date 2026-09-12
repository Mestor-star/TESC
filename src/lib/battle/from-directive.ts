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
import { namedBossOf } from './bosses'
import { headFoeOf, isMainlineEvent } from './mainline'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

let seq = 0

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
