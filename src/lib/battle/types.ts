/* ============================================================
   任务作战子系统 · 类型层
   ------------------------------------------------------------
   只描述战斗本身。一切数值由 derive.ts 从既有档案
   （chars.ts 五轴 / arms.ts 武装 / roster.ts 定位 / missions.ts 任务）导出，
   本目录不改动那些数据的任何口径。
   ============================================================ */

/** 演出效果标签（ui 层按此播全屏特效） */
export type FxKind =
  | 'slash'    // 斩击：斜切白光
  | 'blast'    // 爆破：径向冲击环
  | 'guitar'   // 弹痕 · 声波：同心音环
  | 'seal'     // 封印 / 亲和：六边形网格脉冲
  | 'drone'    // 反现实机械：故障扫描线
  | 'noise'    // 终末：暗噪点 + 抖屏
  | 'guard'    // 防御：护盾折光
  | 'heal'     // 回复：上升光粒
  | 'item'     // 道具：补给闪光
  | 'gear'     // 装具：装填声

export type AxisKey = '破坏力' | '敏捷度' | '物理抗性' | '反现实亲和' | '意志力'

export type AxisSheet = Record<AxisKey, number>

/** 技能类别。防御 / 道具 / 更换装备 / 战略撤退 是「指令」而非技能，不在技能表内。 */
export type SkillKind = '普攻' | '技能' | '启动'

export type Target = 'one' | 'all' | 'self' | 'allyOne' | 'allyAll'

/** 一手技能除伤害之外能做的事（全部由 roster.ts 的数据驱动） */
export interface SkillEffect {
  /** 行动条充能速度 +（比例，0.5 = +50%） */
  spdUp?: number
  /** 立刻推动行动条（0.5 = 直接填半条） */
  pushBar?: number
  /** 闪避率 +（绝对值，0.3 = +30%） */
  evade?: number
  /** 减伤（这一段内持续） */
  shield?: number
  /** 回复（× 意志力） */
  heal?: number
  /** 攻击 +（比例） */
  atkUp?: number
  /** 被击时受伤 +（比例）——「标记」 */
  mark?: number
  /** 敌方充能 −（比例） */
  slow?: number
  /** 敌方行动条推后（比例，1 = 清零） */
  pushBack?: number
  /** 命中段数 */
  hits?: number
  /** 无视减伤与闪避 */
  pierce?: boolean
  /** 解除负面 */
  cleanse?: boolean
  /** 引仇：敌方优先打他（持续 turns） */
  taunt?: boolean
  /** 把目标的行动条清零（镇静剂一类） */
  clearBar?: boolean
  /** 把失能者拉回战列（复活类道具） */
  revive?: boolean
  /** 增益同时及于自己（载具一类「带上我」的技能） */
  selfToo?: boolean
}

export interface SkillSpec {
  id: string
  name: string
  kind: SkillKind
  desc: string
  /** 体力消耗 */
  cost: number
  /** 倍率（× 对应轴）；0 = 本手不造成伤害 */
  power: number
  axis: AxisKey
  fx: FxKind
  /** 出手时的一句台词（原作有则用原文） */
  line: string
  target: Target
  effect?: SkillEffect
  /** 增益持续（以自身行动次数计） */
  turns?: number
  /** 「到达点」：需先蓄到 N 层印记才可发动 */
  needsStack?: number
  /** 冷却：出手后 N 次自身行动之内不得再出（0 / 缺省 = 无冷却） */
  cd?: number
}

/** 增益 / 减益：k = 类别，v = 量（比例或绝对值），t = 剩余行动次数 */
export type BuffKey = 'atk' | 'spd' | 'evade' | 'shield' | 'mark' | 'slow'

export interface Buff {
  k: BuffKey
  v: number
  t: number
}

export interface Combatant {
  id: string
  side: 'ally' | 'enemy'
  name: string
  sigil: string
  hue: string
  avatarId?: string
  /** 战斗定位（职业）——取自原文意象；敌军为「反现实实体」等 */
  cls: string
  /** 专属机制（被动）一句话 */
  trait?: string
  hp: number
  hpMax: number
  axes: AxisSheet
  skills: SkillSpec[]
  /** 主演出效果（无技能专属时用） */
  fx: FxKind
  /** false = 无五轴档案的「未评定」面板（不冒充原作数值） */
  rated: boolean
  /** 行动条：0 → barMax（可溢出，出手后扣除一整条并保留余量） */
  bar: number
  /** 每节拍充能量（由敏捷度导出，可被 spd 增益改变） */
  spd: number
  /** 基础闪避率 */
  evade: number
  buffs: Buff[]
  /** 本段减伤（持续到自身下次行动前） */
  shield: number
  /** 引仇剩余行动次数 */
  taunt: number
  down: boolean
  /** 已使用的「启动技」次数 */
  startUsed: number
  /** 需要几次启动技才解禁普攻/技能（0 = 无门） */
  startNeed: number
  /** 本人这一场的体力（与终端上的小队体力是两回事：出手从这里扣） */
  sp: number
  spMax: number
  /** 已蓄印记层数（弹痕持有者 = 樱印） */
  stack: number
  /** 各技能剩余冷却（技能 id → 还需几次自身行动） */
  cds: Record<string, number>
  /** 持有「弹痕」类武装（决定对反现实实体的克制） */
  scar: boolean
  /** 装配的反现实辅助装备 id（每人至多一件） */
  gear?: string
  /** 装具常驻的攻击加成（比例） */
  gearAtk: number
  /** 装具常驻的充能加成（比例） */
  gearSpd: number
  /** 敌方性质标签（克制判定用） */
  tags: string[]
  note?: string
}

export interface LogEntry {
  round: number
  actorId: string
  actor: string
  side: 'ally' | 'enemy'
  skillId: string
  skill: string
  kind: SkillKind | '指令'
  fx: FxKind
  targetId?: string
  target?: string
  dmg?: number
  heal?: number
  down?: boolean
  miss?: boolean
  line?: string
  /** 特殊备注（解禁 / 到达点 / 力竭 / 回气 / 换装 …） */
  note?: string
}

export type Phase = 'select' | 'won' | 'lost' | 'fled'

export interface BattleState {
  missionId: string
  no: string
  title: string
  place: string
  stage: number
  /** 节拍数（行动条累积推进了多少拍） */
  tick: number
  /** 已经打出的手数（含敌方；log 里标为 T1 / T2 …） */
  hand: number
  /** 当前满条可行动者 id（null = 无人待命 / 已收场） */
  actor: string | null
  allies: Combatant[]
  enemies: Combatant[]
  log: LogEntry[]
  phase: Phase
  /** 过载出击（体力不足仍上阵）：全场我方输出打折 */
  overdrive: boolean
  sp: number
  spMax: number
  /** 本场携带的道具余量（id → 个数） */
  bag: Record<string, number>
  /** 军需点（结算后写回；商店消费） */
  coin: number
  /** 本场入手的装具（胜利掉落） */
  loot: string[]
  /** 当前撤退成功率（供 UI 展示） */
  fleeOdds: number
  /** 时期进度与成长（换装时重算面板要用） */
  progress: number
  growth: Record<string, number>
}

/** 一场作战的记录（写入隐藏存档，供作战记录页与后续生成取用） */
export interface BattleRecord {
  id: string
  missionId: string
  no: string
  title: string
  place: string
  stage: number
  /** 只有胜仗会被归档；败 / 撤不写记录、不推进剧情 */
  outcome: '胜' | '败' | '撤'
  rounds: number
  /** 战斗历时（节拍数） */
  ticks: number
  at: number
  /** 参战角色 id */
  squad: string[]
  /** 本场出力最重者的显示名 */
  mvp: string
  /** 逐回合做了什么 —— 给模型与作战记录共用的一份事实底稿 */
  digest: string
  turns: LogEntry[]
  narrative: string
  narrativeBy: '推演' | '模板'
  /** 本场入手的装具与军需点 */
  loot: string[]
  coin: number
}

/** 体力（小队共用一条；只在执行任务时消耗，平时随观测进度缓慢回复） */
export interface StaminaState {
  cur: number
  max: number
  /** 上次结算时已收束的事件数（用于按观测间隔补回体力） */
  chargeAt: number
}

/* ============================================================
   军需：道具 / 反现实辅助装备
   ------------------------------------------------------------
   装具与弹痕、斩击、片羽无关——它们是被造出来的物件，只改写数值，
   或给「特殊武器」补一手额外的用法。每人至多装配一件。
   ============================================================ */

export interface ItemDef {
  id: string
  name: string
  desc: string
  /** 目标：'one' = 选一名我方 · 'allyAll' = 全队 · 'enemyOne' = 选一名敌人 */
  target: 'one' | 'allyAll' | 'enemyOne'
  effect: SkillEffect
  /** 商店售价；0 = 非卖品（只能靠搜刮 / 掉落） */
  price: number
}

export interface GearDef {
  id: string
  name: string
  sub: string
  desc: string
  /** 装配后常驻的数值修正 */
  mods: Partial<Record<AxisKey, number>> & {
    /** 行动条充能 +（比例） */
    spd?: number
    /** 闪避 +（绝对值） */
    evade?: number
    /** 减伤（常驻） */
    shield?: number
    /** 攻击 +（比例） */
    atk?: number
  }
  /** 附带的一手额外用法（占用「技能」菜单，不消耗额外回合） */
  skill?: {
    name: string
    desc: string
    cost: number
    power: number
    axis: AxisKey
    fx: FxKind
    line: string
    effect?: SkillEffect
  }
  /** 商店售价；0 = 非卖品（只能靠交战掉落） */
  price: number
  /** 稀有度（用于掉落权重与标色） */
  rank: 1 | 2 | 3
}
