/* ============================================================
   角色档案统一名录（全员 25 人 · 同一张档案卡）
   — 主役四人（CHARACTERS，苍之学园光明会）与 21 名登场者（SIDECAST）
     合并为一份「按学院/所属分组」的名录。
   — 分组依据各卷卷首「登场人物」彩页与正文：凯特琳为 Corporations
     企业警备队队长（v2 天空竞技祭自报）；艾莉芙/弗恩/吴诗涵/小柴琳
     归苍之学园；蕾雅/艾梅/神流奈奈/伊西斯归卡乌斯学院；无学园身份者
     一律归「学园外 · 其它」。
   — 五轴数值为终端状态模拟的近似评定（非正文原文；供档案条显示）。
   ============================================================ */

export const AXIS = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力'] as const

export interface RosterGroup {
  key: string
  label: string
  ids: string[]
}

/** 分组顺序即显示顺序。成员顺序即卡内顺序（主役在前）。 */
export const ROSTER_GROUPS: RosterGroup[] = [
  {
    key: 'ao',
    label: '苍之学园',
    ids: ['hikari', 'luna', 'mefisa', 'nyau', 'youshihan', 'alive-anatolia', 'vern-simon', 'xiaochai-lin'],
  },
  {
    key: 'kaus',
    label: '卡乌斯学院',
    ids: ['nana-kamiru', 'reiya', 'emei', 'isis-halid'],
  },
  {
    key: 'corp',
    label: 'Corporations',
    ids: ['katherine', 'alex-cave', 'phidra', 'maria', 'merwen-gray', 'ameria'],
  },
  {
    key: 'out',
    label: '学园外 · 其它',
    ids: ['rafael-garcia', 'kuro-no-maou', 'skull-mask', 'yiregel', 'touyi-caojiro', 'huda-nayume', 'yuina-yoshito'],
  },
]

/** 登场者(非主役)的近似五轴，键 = SIDECAST id，序与 AXIS 一致：[破, 敏, 物, 亲, 志] */
export const SIDE_AXIS: Record<string, number[]> = {
  'rafael-garcia': [78, 55, 82, 30, 70],
  youshihan: [85, 40, 68, 90, 45],
  katherine: [88, 84, 78, 86, 95],
  'alex-cave': [92, 60, 98, 72, 78],
  phidra: [70, 76, 70, 80, 92],
  maria: [76, 88, 66, 74, 88],
  'merwen-gray': [80, 95, 70, 84, 82],
  'alive-anatolia': [45, 60, 55, 90, 99],
  'vern-simon': [40, 70, 50, 92, 88],
  'kuro-no-maou': [95, 85, 92, 100, 70],
  'nana-kamiru': [82, 84, 76, 82, 90],
  reiya: [74, 88, 70, 84, 82],
  emei: [70, 78, 72, 86, 95],
  'skull-mask': [90, 90, 84, 96, 70],
  'xiaochai-lin': [35, 65, 32, 84, 88],
  'touyi-caojiro': [55, 75, 55, 70, 75],
  'huda-nayume': [72, 78, 68, 80, 90],
  'yuina-yoshito': [85, 90, 80, 65, 78],
  ameria: [88, 82, 90, 95, 95],
  'isis-halid': [40, 70, 45, 78, 85],
  yiregel: [88, 86, 82, 88, 90],
}

/** 登场者的「武装/特性」专名（仅正文明确者；无则显示 —）。 */
export const SIDE_TRAIT: Record<string, string> = {
  youshihan: '弹痕「四大凶兽」',
  'alex-cave': '片羽「午夜降临」',
  'merwen-gray': '片羽「愚者的足迹」',
  reiya: '斩击「热沃当的少女」',
  ameria: '片羽（增殖）',
  yiregel: '加护「龙花」',
  'kuro-no-maou': '—',
  'alive-anatolia': '灵魂蓄积器™ 关联者',
  'vern-simon': '信息处理极致',
}
