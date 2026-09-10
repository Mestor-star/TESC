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

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

let seq = 0

/** 现场交战 → 作战单（编号 OBS-xxx，性质缺省按反现实实体处理） */
export function battleMissionOf(b: PlotBattle, evId: string): Mission {
  seq += 1
  const stage = clamp(Math.round(b.stage ?? 5), 1, 10)
  return {
    id: `plot-${evId}-${seq}`,
    no: `OBS-${String(seq).padStart(3, '0')}`,
    title: b.name,
    place: b.place ?? '现场',
    stage,
    nature: b.nature ?? '反现实 · 遭遇',
    recommend: [],
    status: '压制中',
    deadline: '即刻',
    desc: `${b.name} 出现在现场。交战由观测现场触发——按在场的成员与眼前的敌人开打，打完即回到正文。`,
    reward: ['现场压制', '观测继续'],
  }
}
