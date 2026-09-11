import type { RegionReading } from './types'

/**
 * 天空都市・弗尔克图斯 — 反现实干涉指数（R 值）分区扫描
 * R 值正常为「1」，高于 1.02 或低于 0.98 即为异常（原文判据，见 data/types.ts 头）。
 * **偏离即异常，两侧同判**：偏低该处「现实偏薄」、反现实干扰强；
 * 偏高则「现实过厚」、是高 R 存在的主场。偏离越远，危险度越高。
 * 区间与偏离量的算法在 data/types.ts（R_NORMAL_LO / R_NORMAL_HI / rOutOf），勿在此另写一份。
 * 分区为光明会侦察网标定的观测点（FLK-），编号沿用终端分区代码。
 * 表里没有的地点不代表 R 值为 1：原文明写了数的读原文（CN-，见 data/rreadings.ts），
 * 其余由 lib/battle/rvalue.ts 按现场危险度推算（EST-）。三者界面挂牌不同，不许混印。
 *
 * `xy` 是这六区在总览那张观测点示意图上的落点（0~100）。
 * 摆法按故事里的走动关系：苍之学园第 12 区三个点在西侧成一片（本校舍—山道宿舍—旧集市—东侧废屋街），
 * 第 6 区两个点在东侧（工房街—女神神殿遗址），中间那条长线就是「从第 12 区去第 6 区」的行程。
 * 是示意图不是测绘 —— 相邻表示走得近，不表示距离。
 */
export const REGIONS: RegionReading[] = [
  {
    id: 'gcn',
    name: '苍之学园 · 第12区 本校舍',
    code: 'FLK-12A',
    r: 1.008,
    delta: 0.001,
    threatStage: 0,
    threatName: null,
    note: '基准稳定。白墙蓝顶的浮空校舍一切如常，骑士团的木制面具正与日常安静地共存。',
    xy: [18, 22],
  },
  {
    id: 'drm',
    name: '山道尽头 · 学生宿舍',
    code: 'FLK-12D',
    r: 0.985,
    delta: 0.002,
    threatStage: 0,
    threatName: null,
    note: '栖身之所。鸡舍与山羊正常，门口晾着某位副官的战斗服——以及不知谁留下的狗爪印。',
    xy: [10, 54],
  },
  {
    id: 'mkt',
    name: '第12区 · 旧集市',
    code: 'FLK-12M',
    r: 0.964,
    delta: -0.005,
    threatStage: 1,
    threatName: null,
    note: '东侧早已无人光顾的集市，反现实旧物残留着轻微的「低语」，野狗在成排卷帘门前游荡。',
    xy: [26, 82],
  },
  {
    id: 'ewd',
    name: '第12区 · 东侧废屋街',
    code: 'FLK-12E',
    r: 0.931,
    delta: -0.012,
    threatStage: 3,
    threatName: null,
    note: '铁皮屋顶的废屋与零星路灯。夜间偶有「不该存在的脚步声」折返，正由恋兔队加派夜间巡哨。',
    xy: [44, 52],
  },
  {
    id: 'wsh',
    name: '第 6 区 · 工房街',
    code: 'FLK-06W',
    r: 0.902,
    delta: -0.016,
    threatStage: 4,
    threatName: null,
    note: '境界领域商会的制品暗中流通的街区。反现实机械的嗡鸣比昨日更近，光明会已派员盯梢。',
    xy: [70, 74],
  },
  {
    id: 'ruin',
    name: '女神神殿遗址 · 第 6 区近郊',
    code: 'FLK-06R',
    r: 0.876,
    delta: -0.021,
    threatStage: 5,
    threatName: null,
    note: '灵魂蓄积器TM 被讨伐后的清点区。被恋兔光砸成碎屑的「女神」脚下，仍有细碎反现实正缓缓聚拢。',
    xy: [84, 34],
  },
]
