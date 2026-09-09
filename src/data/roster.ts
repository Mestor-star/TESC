/* ============================================================
   角色档案统一名录（全员 24 人 · 同一张档案卡）
   — 主役四人（CHARACTERS，苍之学园委员会・恋兔队）与 20 名在册登场者（SIDECAST 子集）
     合并为一份「按学院/所属分组」的名录。
   — 说明：拉斐尔・加西亚（rafael-garcia）仅在 SIDECAST 世界书条目保留（供角色档案库注入），
     不入本名录；敌对性实体「骷髅假面之男（假面心叶）」不入档案，由实体图鉴 No.8590 覆盖。
   — 分组依据各卷卷首「登场人物」彩页与正文：凯特琳为 Corporations
     企业警备队队长（v2 天空竞技祭自报）；艾莉芙/弗恩/吴诗涵/小柴琳
     归苍之学园；蕾雅/艾梅/神流奈奈/伊西斯归卡乌斯学院；无学园身份者
     一律归「学园外 · 其它」。
   — 五轴数值为终端综合评定（非正文直给），强弱排序以「委员会学生排行 RANK」与正文战绩、
     称号为参照，杜绝与 RANK/正文相悖（见 COMMITTEE_RANK 与下方 SIDE_AXIS 各键原文锚）。
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
    ids: ['danae-whitmore', 'nana-kamiru', 'reiya', 'emei', 'isis-halid'],
  },
  {
    key: 'corp',
    label: 'Corporations',
    ids: ['katherine', 'alex-cave', 'phidra', 'maria', 'merwen-gray', 'ameria'],
  },
  {
    key: 'out',
    label: '学园外 · 其它',
    ids: ['kuro-no-maou', 'yiregel', 'touyi-caojiro', 'huda-nayume', 'yuina-yoshito'],
  },
]

/**
 * 登场者(非主役)的五轴评定，键 = SIDECAST id，序与 AXIS 一致：[破, 敏, 物, 亲, 志]。
 * 标尺与主役一致：10 ≈ 普通成年人该轴水准，精锐 20–35，超规格 50–60。
 * 数值为终端综合评定（非正文直给）：强弱排序以「委员会排行 RANK + 正文战绩/称号」
 * 为参照——杜绝与 RANK 相悖（如：RANK6 凯特琳不该低于 RANK72 玛丽娅的对应轴、
 * 非武装常人反现实亲和不当高于 RANK6 精锐）。各键注释附逐字原文锚。
 * 例外：达娜厄的破/敏/物按「未变身平常态」可测体评（其「转为暴力」变身三分钟
 * 「比交战对象更强」为机制性无上限、无法静态测定，故不以 RANK7 直接推算这三维）。
 */
export const SIDE_AXIS: Record<string, number[]> = {
  // —— 苍之学园 ——
  youshihan: [42, 9, 14, 56, 18],          // 四大凶兽、无 RANK「自然是没排名呢」、常时困睡体弱
  'alive-anatolia': [34, 28, 20, 60, 58],  // 弹痕「如散文般」跨时间、No.87865 Stage8「大」
  'vern-simon': [18, 28, 14, 55, 48],      // 信息处理极致 · 作战总指挥
  'xiaochai-lin': [6, 22, 4, 26, 44],      // 13 岁跳级天才程序员、肉身病弱
  // —— 卡乌斯学院 ——
  'danae-whitmore': [8, 18, 10, 46, 50],   // RANK7(v4 序章)。破/敏/物记「未变身平常态」：破坏力锚「我的握力只有8公斤。已经到极限了」、体力差走久即趴、
                                            //   物理抗性低、怯生生娇小；「转为暴力」变身三分钟「比交战对象更强」属机制性无上限，无法静态测定故不入轴
                                            //   （奈奈「与恋兔单挑未必输」是认真模式评价）。亲 46/志 50 为不随变身变化的固有值。
  'nana-kamiru': [42, 44, 36, 44, 52],     // 斩击「大麻烦」减重 + 神流式拔刀术
  reiya: [36, 46, 30, 44, 50],             // 放逐部队对人特种、斩击「热沃当的少女」电锯
  emei: [34, 38, 30, 56, 56],              // 评议会副议长、斩击「奥尔良的盟约」50% 奇迹 + 海军刀
  'isis-halid': [12, 24, 10, 40, 46],      // 记者、斩击「铭刻记忆」
  // —— Corporations ——
  katherine: [52, 46, 48, 52, 58],         // 企业警备队队长、片羽「英雄不灭」越伤越强、RANK6
  'alex-cave': [48, 24, 56, 26, 34],       // 片羽「午夜降临」硬质化、心脏不可转化
  phidra: [40, 40, 34, 48, 56],            // 片羽「申告虚伪」复制、代价自我同一性崩溃、RANK14
  maria: [28, 34, 22, 54, 44],             // 片羽「天下无双的公主大人」情感入歌、RANK72
  'merwen-gray': [40, 50, 30, 46, 50],     // 片羽「愚者的足迹」双环传送、无限制格斗冠军、RANK47
  ameria: [38, 36, 44, 58, 56],            // 片羽「注视着你」意识量子化无限增殖 30km
  // —— 学园外 · 其它 ——
  'kuro-no-maou': [54, 44, 50, 60, 30],    // No.5000 Stage5「混乱」、操控大巨人
  yiregel: [48, 46, 44, 50, 52],           // 龙之国加护「龙花」压缩宇宙、力敌凯特琳
  'touyi-caojiro': [20, 32, 18, 40, 40],   // 噬鯱者、心叶评「强得令人恐惧，能够吞噬渴望」
  'huda-nayume': [28, 34, 24, 36, 54],     // 噬鯱者领队、战术先读
  'yuina-yoshito': [40, 48, 34, 20, 42],   // 噬鯱者、肉搏狂人
}

/**
 * 委员会排行 RANK —— 终末停滞委员会制定的「学生排行榜」（依据个人实力与贡献度）。
 * 只登记正文/人物页有明确 RANK 的人（键 = roster id）；无则查不到 → 显示 —。
 * 出处均为逐字：RANK6 凯特琳（v2 人物页「在终末停滞委员会排名RANK6」）；
 * RANK7 达娜厄（v4 序章）；RANK14 菲德拉、RANK47 梅尔文・格蕾、RANK72 玛丽娅、
 * RANK102 小柴喵呜（v2 天空竞技祭实况播报）；RANK1 恋兔光（v2「弗尔克图斯的顶点」）。
 */
export const COMMITTEE_RANK: Record<string, string> = {
  hikari: 'RANK1',            // 天空都市遥遥领先 · 人类最强（v2 / v3 / s1）
  katherine: 'RANK6',         // v2 卷首人物页
  'danae-whitmore': 'RANK7',  // v4 序章
  phidra: 'RANK14',           // v2 天空竞技祭播报
  'merwen-gray': 'RANK47',    // v2 天空竞技祭播报
  maria: 'RANK72',            // v2 天空竞技祭播报
  nyau: 'RANK102',            // v2 天空竞技祭播报
}

/** 查委员会排行；无原文明确 RANK → undefined（UI 显示 —）。 */
export function committeeRankOf(id: string): string | undefined {
  return COMMITTEE_RANK[id]
}

/** 登场者的「武装/特性」专名（仅正文明确者；无则显示 —）。 */
export const SIDE_TRAIT: Record<string, string> = {
  youshihan: '弹痕「四大凶兽」',
  'alex-cave': '片羽「午夜降临」',
  'merwen-gray': '片羽「愚者的足迹」',
  reiya: '斩击「热沃当的少女」',
  'danae-whitmore': '斩击「转为暴力」',
  ameria: '片羽（增殖）',
  yiregel: '加护「龙花」',
  'kuro-no-maou': '—',
  'alive-anatolia': '弹痕「如散文般」',
  'vern-simon': '信息处理极致',
}
