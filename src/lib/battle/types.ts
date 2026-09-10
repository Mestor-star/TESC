/* ============================================================
   回合制任务作战子系统 · 类型层
   ------------------------------------------------------------
   只描述战斗本身。一切数值由 derive.ts 从既有档案
   （chars.ts 五轴 / arms.ts 武装 / missions.ts 任务）导出，
   本目录不改动那三份数据的任何口径。
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

export type AxisKey = '破坏力' | '敏捷度' | '物理抗性' | '反现实亲和' | '意志力'

export type AxisSheet = Record<AxisKey, number>

export type SkillKind = '普攻' | '技能' | '启动' | '防御'

export interface SkillSpec {
  id: string
  name: string
  kind: SkillKind
  desc: string
  /** 体力消耗 */
  cost: number
  /** 倍率（× 对应轴） */
  power: number
  axis: AxisKey
  fx: FxKind
  /** 出手时的一句台词（原作有则用原文） */
  line: string
  target: 'one' | 'all' | 'self'
  /** 减伤比例（本回合内生效） */
  guard?: number
  /** 「到达点」：需先蓄到 N 层印记才可发动 */
  needsStack?: number
}

export interface Combatant {
  id: string
  side: 'ally' | 'enemy'
  name: string
  sigil: string
  hue: string
  avatarId?: string
  hp: number
  hpMax: number
  axes: AxisSheet
  skills: SkillSpec[]
  /** 主演出效果（无技能专属时用） */
  fx: FxKind
  /** false = 无五轴档案的「未评定」面板（不冒充原作数值） */
  rated: boolean
  /** 本回合减伤（回合开始清零） */
  guard: number
  down: boolean
  /** 已使用的「启动技」次数 */
  startUsed: number
  /** 需要几次启动技才解禁普攻/技能（0 = 无门） */
  startNeed: number
  /** 已蓄印记层数（弹痕持有者 = 樱印） */
  stack: number
  /** 持有「弹痕」类武装（决定对反现实实体的克制） */
  scar: boolean
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
  kind: SkillKind
  fx: FxKind
  targetId?: string
  target?: string
  dmg?: number
  heal?: number
  down?: boolean
  line?: string
  /** 特殊备注（解禁 / 到达点 / 力竭 / 回气 …） */
  note?: string
}

export interface BattleState {
  missionId: string
  no: string
  title: string
  place: string
  stage: number
  round: number
  /** 本回合出手序（id） */
  queue: string[]
  /** 当前出手位 */
  at: number
  allies: Combatant[]
  enemies: Combatant[]
  log: LogEntry[]
  phase: 'select' | 'won' | 'lost'
  /** 过载出击（体力不足仍上阵）：全场我方输出打折 */
  overdrive: boolean
  sp: number
  spMax: number
}

/** 一场作战的记录（写入隐藏存档，供作战记录页与后续生成取用） */
export interface BattleRecord {
  id: string
  missionId: string
  no: string
  title: string
  place: string
  stage: number
  outcome: '胜' | '败'
  rounds: number
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
}

/** 体力（小队共用一条；只在执行任务时消耗，平时随观测进度缓慢回复） */
export interface StaminaState {
  cur: number
  max: number
  /** 上次结算时已收束的事件数（用于按观测间隔补回体力） */
  chargeAt: number
}
