/* ============================================================
   回合制作战 · 全部可调常量（只此一处）
   ------------------------------------------------------------
   数值口径：五轴 10 ≈ 普通成年人，观测上限 200（AXIS_MAX）。
   想改手感就改这里，不必碰引擎与视图。
   ============================================================ */

export const TUNING = {
  /* —— 我方 —— */
  hpBase: 28,
  hpPerResist: 2.2,      // 物理抗性 → 生命
  hpPerWill: 1.4,        // 意志力 → 生命

  /* —— 伤害 —— */
  resistCut: 0.35,       // 目标物理抗性对伤害的削减系数
  jitter: 0.12,          // 伤害浮动 ±12%
  floor: 1,              // 命中即至少这些伤害
  guardCut: 0.45,        // 防御姿态的当回合减伤
  scarVsAnti: 1.45,      // 弹痕 / 斩击 打「反现实」实体：克制
  scarVsMundane: 0.85,   // 打非反现实目标：反而不占优（原作口径）
  affinityWeight: 0.55,  // 反现实亲和每满 200 提供的加成
  downWillSave: true,    // 意志力高者被打倒时有一次「不倒」

  /* —— 行动条（ATB） —— */
  barMax: 100,           // 满 100% 才能行动；出手后扣除一整条，余量保留
  spdBase: 4.2,          // 每节拍的基础充能量
  spdPerAgi: 0.155,      // 每点敏捷度追加的充能量 → 快的人一回合能多打好几手
  spdFloor: 2.5,         // 充能下限（再慢也不会卡死）
  evadeBase: 0.05,       // 基础闪避
  evadeMax: 0.75,        // 闪避上限（再高也留一成命中）
  shieldCap: 0.8,        // 减伤上限
  buffTurnsCap: 5,       // 增益最长持续（以自身行动次数计）

  /* —— 技能 —— */
  atkPower: 1.0,
  atkCost: 1,
  skillPower: 1.55,
  skillCost: 4,
  burstPower: 2.6,       // 「到达点」
  burstCost: 8,
  burstStack: 3,         // 发动到达点所需的印记层数
  startPower: 0,         // 启动技（解封）——不造成伤害，纯粹是解封的代价
  startCost: 2,
  guardCost: 0,          // 防御指令不额外耗体力

  /* —— 战略撤退 —— */
  fleeBase: 0.45,        // 基础成功率
  fleeMin: 0.12,
  fleeMax: 0.92,
  fleeSpeedWeight: 0.012, // 双方平均速度差每 1 点的权重

  /* —— 军需 —— */
  coinPerStage: 14,      // 每胜一场的军需点 = 阶段 × 此值
  coinDropBonus: 0.5,    // 掉落装具时附带的军需点比例
  lootBase: 0.28,        // 战后搜刮到装具的基础概率
  lootPerStage: 0.045,   // 阶段每高一级的追加概率
  lootCap: 0.85,         // 再高也不会必出
  reviveHp: 0.35,        // 复活类道具拉回时的生命比例
  bagDefault: { ration: 3, sedative: 2, stabilizer: 2, soulcell: 1 } as Record<string, number>,

  /* —— 角色体力（各人自带，出手从这里扣；防御回一点，但不多） —— */
  chSpBase: 22,          // 底子
  chSpPerWill: 0.55,     // 每点意志力的追加
  guardRecover: 3,       // 防御每手回复
  guardRecoverPerWill: 0.06,

  /* —— 体力（小队共用，只在出击时消耗；出手另算各人自己的） —— */
  spMax: 100,
  spPerSortie: 5,        // 每次出击的固定消耗
  spRegenPerEvent: 2.5,  // 每收束一段剧情补回
  overdriveAt: 30,       // 体力低于此值仍要出击 → 过载
  overdrivePenalty: 0.8, // 过载全场我方输出打折

  /* —— 敌方（按任务阶段缩放） —— */
  enemyHpBase: 70,
  enemyHpPerStage: 26,
  enemyAtkBase: 14,
  enemyAtkPerStage: 5.2,
  enemyResistBase: 6,
  enemyResistPerStage: 3.0,
  enemySpdBase: 18,
  enemySpdPerStage: 3.4,
  enemyWillPerStage: 2.0,

  /* —— 结算 —— */
  growthHpWeight: 0.8,   // 成长点数对生命的追加权重
  growthPerWin: 0.6,     // 胜利给参战者的成长点数（百分比，写隐藏存档）
  growthPerLoss: 0.2,
  bondPerWin: 2,         // 胜利给参战者的羁绊
  bondMvp: 2,            // 给 MVP 的额外羁绊
} as const

/**
 * 慢启动门（执行委员长指定口径）：
 *   恋兔光必须先打出 5 次「解封试音」，普攻与技能才解禁 —— 否则她第一回合就把战斗结束掉。
 * 其余人按同一机制给短门（特别强者才需要），改这张表即可调整。
 */
export const START_GATE: Record<string, number> = {
  hikari: 5,   // 人类最强：弹痕『樱之残影』是封印，须逐重解开
  mefisa: 2,   // 委员会两翼之一，起手需稳住封印
}

/** 无五轴档案的名录角色 → 一份明确的「未评定」通用面板（不冒充原作数值） */
export const UNRATED_AXES = {
  破坏力: 26,
  敏捷度: 26,
  物理抗性: 24,
  反现实亲和: 18,
  意志力: 26,
} as const
