/* ============================================================
   角色档案统一名录（全员 25 人 · 同一张档案卡）
   — 主役四人（CHARACTERS，苍之学园光明会）与 21 名登场者（SIDECAST）
     合并为一份「按学院/所属分组」的名录。
   — 分组依据各卷卷首「登场人物」彩页与正文：凯特琳为 Corporations
     企业警备队队长（v2 天空竞技祭自报）；艾莉芙/弗恩/吴诗涵/小柴琳
     归苍之学园；蕾雅/艾梅/神流奈奈/伊西斯归卡乌斯学院；无学园身份者
     一律归「学园外 · 其它」。
   — 五轴数值为终端状态模拟的近似评定（非正文原文；供档案条显示）。
     标尺与主役一致：10 ≈ 普通成年人的该轴水准，精锐 20–35，超规格 50–60。
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

/**
 * 登场者(非主役)的近似五轴，键 = SIDECAST id，序与 AXIS 一致：[破, 敏, 物, 亲, 志]。
 * 新标尺：10 ≈ 普通成年人该轴水准，精锐 20–35，超规格/怪物 50–60。
 */
export const SIDE_AXIS: Record<string, number[]> = {
  'rafael-garcia': [35, 18, 40, 6, 26],
  youshihan: [43, 11, 25, 49, 13],
  katherine: [46, 42, 35, 44, 54],
  'alex-cave': [51, 21, 58, 28, 35],
  phidra: [26, 33, 26, 37, 51],
  maria: [32, 49, 24, 31, 46],
  'merwen-gray': [37, 54, 26, 42, 40],
  'alive-anatolia': [13, 21, 18, 49, 59],
  'vern-simon': [11, 26, 16, 51, 46],
  'kuro-no-maou': [54, 43, 51, 60, 26],
  'nana-kamiru': [40, 42, 33, 40, 49],
  reiya: [31, 49, 26, 42, 40],
  emei: [26, 35, 28, 44, 54],
  'skull-mask': [49, 49, 42, 53, 26],
  'xiaochai-lin': [8, 23, 6, 42, 46],
  'touyi-caojiro': [18, 33, 18, 26, 33],
  'huda-nayume': [28, 35, 25, 37, 49],
  'yuina-yoshito': [43, 49, 35, 23, 35],
  ameria: [46, 40, 49, 54, 54],
  'isis-halid': [11, 26, 13, 35, 43],
  yiregel: [46, 44, 40, 46, 49],
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
