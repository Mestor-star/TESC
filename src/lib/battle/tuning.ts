/* ============================================================
   回合制作战 · 全部可调常量（只此一处）
   ------------------------------------------------------------
   数值口径：五轴 10 ≈ 普通成年人，观测上限 200（AXIS_MAX）。
   想改手感就改这里，不必碰引擎与视图。
   ============================================================ */

export const TUNING = {
  /* —— 我方 —— */
  /** 编队上限（含主角） */
  squadMax: 6,
  /** 羁绊档位的天花板：最高的那一档都是「凑够五个人」，
      整队连携也按它算「到齐」—— 名单再长也不往上加。 */
  traitMax: 5,
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

  /* —— 终末点数（货币；主要来自剧情任务的战果） —— */
  coinPerStage: 14,        // 阶段基数：阶段 × 此值
  coinMainlineMul: 2,      // 剧情任务（正史复盘）按基数加倍
  coinMainlineBase: 60,    // 剧情任务另加的固定份量 —— 一份正史换一笔点数
  coinPatrolMul: 0.35,     // 巡逻任务只是维持观测，给得少
  coinDropBonus: 0.5,      // 掉落装具时附带的点数比例
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

  /* —— 敌方的负面机制（沉默 / 流血 / 减攻） ——
     持续拍数沿用上面的 buffTurnsCap；frailFloor 是减攻的底，
     免得几层「磨蚀」叠起来把我方打成零输出。 */
  frailFloor: 0.35,
  stasisCap: 2,          // 停滞最长几拍（冻太久会变成干等，不是紧张）
  archiveCap: 2,         // 归档最长几拍
  echoPower: 0.75,       // 回响复写我方那手时的威力折扣

  /* —— 敌方（按任务阶段缩放） ——
     斜率刻意放缓、底子抬高：复核跑出来的老曲线是 70 + 26×阶段，
     危险度 1~4 在任何时期都是 1~2 拍结束——敌方一手都没出过，
     等于半个任务板是空场。改成 150 + 18×阶段：阶段 10 的血量分文不动
     （150+180 = 70+260 = 330），只把低档抬起来，让每一档都打得起来。 */
  enemyHpBase: 150,
  enemyHpPerStage: 18,
  enemyAtkBase: 14,
  enemyAtkPerStage: 5.2,
  enemyResistBase: 6,
  enemyResistPerStage: 3.0,
  enemySpdBase: 18,
  enemySpdPerStage: 3.4,
  enemyWillPerStage: 2.0,

  /* —— 地点 R 值（反现实干涉指数）对敌方的影响 ——
     只抬血量与「反现实亲和」：现实变薄是让实体「打不死、更抽象」，
     不改它的攻击与充能，好让这条设定不掀翻攻防平衡。 */
  rGain: 3.2,            // 每偏离正常区间 0.100 的增幅（×0.32）
  rMulMin: 0.85,         // 增幅下限（现实密实到反常时也不至于把它削没）
  rMulMax: 1.40,         // 增幅上限（不给低 R 地带叠出无解的血墙）
  rEstPerStage: 0.008,   // 未标定地点按危险度推算 R 值：每级 −0.008

  /* —— boss 的终结技能（大招）与其反制 —— */
  ultStage: 6,           // 危险度自此起视为 boss 级（配一记终结技能）

  /* —— 头目（每场至少一个） —— */
  eliteHpMul: 1.5,       // 精英怪：血量倍数
  eliteAtkMul: 1.15,     // 破坏力倍数
  eliteWillMul: 1.12,    // 意志力倍数（更硬的骨头，也能多扛几手）
  ultCharge: 4,          // 终结技能的咏唱拍数（每次自身出手 +1）
  ultBreak: 0.14,        // 咏唱期间一次被打掉最大生命的 14% 即打断
  ultDebuffCut: 0.12,    // 咏唱期间身上每层减益，大招威力 −12%
  ultMulFloor: 0.5,      // 削弱到最狠也只减半（大招不至于被挂成挠痒）

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
  // 梅芙不设启动：她的炮术是练出来的，不是解开来的 ——
  // 让她先站两拍热身，只是把副官从第一手就架空。
}

/** 无五轴档案的名录角色 → 一份明确的「未评定」通用面板（不冒充原作数值） */
export const UNRATED_AXES = {
  破坏力: 26,
  敏捷度: 26,
  物理抗性: 24,
  反现实亲和: 18,
  意志力: 26,
} as const
