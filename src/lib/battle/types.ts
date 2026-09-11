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

/**
 * 演出的「调子」。
 * ------------------------------------------------------------
 * FxKind 说的是这一手**怎么动**（斜切、冲击环、音环…），调子说的是它**是什么性质**：
 * 同样是「一圈光」，治疗该是青的、增益该是暖的、压制该是红的 —— 不看字也认得出这一手在干嘛。
 * 由技能自己的 effect 推出来（见 toneOf），不看动画类别，所以「治疗技被配上斩击动画」
 * 这种本来就是数据的毛病也不会串到观感上。
 */
export type FxTone =
  | 'strike'   // 纯伤：用技能自己的色相，招招不同
  | 'mend'     // 回复 / 解除负面：青
  | 'ward'     // 增益 / 护盾 / 提速：暖金
  | 'hex'      // 压制 / 负面：红

/** 这一手是什么性质 —— 治疗的观感和压制绝不能长一个样 */
export function toneOf(k: SkillSpec): FxTone {
  const e = k.effect
  if (!e) return 'strike'
  if (e.heal || e.cleanse || e.revive) return 'mend'
  if (e.mark || e.slow || e.pushBack || e.silence || e.bleed || e.frail
    || e.stasis || e.archive || e.lockdown) return 'hex'
  if (e.atkUp || e.spdUp || e.shield || e.evade || e.accUp || e.pushBar || e.taunt) return 'ward'
  return 'strike'
}

/**
 * 这个人的到达点（终结技）。
 * 现在每个人都有且只有一手 —— 战斗面板要印「印记 2/3」得先知道门槛是几层，
 * 门槛写在到达点自己身上（arch 的 needsStack），所以从这里取，不另设常量。
 */
export function endOf(c: { skills: SkillSpec[] }): SkillSpec | undefined {
  return c.skills.find((k) => k.kind === '到达点')
}

export type AxisKey = '破坏力' | '敏捷度' | '物理抗性' | '反现实亲和' | '意志力'

export type AxisSheet = Record<AxisKey, number>

/** 技能类别。防御 / 道具 / 更换装备 / 战略撤退 是「指令」而非技能，不在技能表内。 */
export type SkillKind = '普攻' | '技能' | '启动' | '到达点'

export type Target = 'one' | 'all' | 'self' | 'allyOne' | 'allyAll'

/**
 * 被动技能。
 * ------------------------------------------------------------
 * 不是「一手」，是那个人一直带着的东西：原文里他怎么站着、
 * 身子是什么做的、别人为什么打不中他 —— 逐条落成这里的数。
 * 全部只作用于本人（不做光环），引擎在读数处各加一笔即可。
 */
export interface PassiveSpec {
  /** 被动名（原文措辞） */
  name: string
  /** 一句话说明它从原文哪儿来 */
  desc: string
  /** 每节拍回复的最大生命比例（丝线之躯自己往回长） */
  regen?: number
  /** 每节拍回复的体力（角色自身体力，不是终端那一池） */
  spRegen?: number
  /**
   * 战斗续行：致命伤只留 1 点，每场可触发几次（-1 = 不限次）。
   * 原文里心脏破了也照样站着的那些人走这条。
   */
  endure?: number
  /** 常驻闪避（绝对值） */
  evade?: number
  /** 常驻命中：抵消对方闪避（绝对值） */
  acc?: number
  /** 攻击必中：出手不打空（低语者听得见对方往哪躲） */
  sureHit?: boolean
  /** 常驻减伤 */
  shield?: number
  /** 常驻攻击加成（比例） */
  atk?: number
  /** 常驻充能加成（比例） */
  spd?: number
  /** 体力上限加成（绝对值） */
  spMax?: number
  /** 开场行动条领先（0..1，占一整条的比例） */
  headStart?: number
  /** 冷却缩短：每次自身行动多减几拍 */
  cdCut?: number
  /** 残血时的攻击加成（比例）——「血越薄，拳头越重」 */
  lowHpAtk?: number
  /** 普攻倍率提升（比例）——「这门东西打起来比别人重」 */
  basicMul?: number
}

/** 一手技能除伤害之外能做的事（全部由 roster.ts 的数据驱动） */
export interface SkillEffect {
  /** 行动条充能速度 +（比例，0.5 = +50%） */
  spdUp?: number
  /** 立刻推动行动条（0.5 = 直接填半条） */
  pushBar?: number
  /** 闪避率 +（绝对值，0.3 = +30%） */
  evade?: number
  /** 命中率 +（绝对值，抵消对方闪避） */
  accUp?: number
  /** 减伤（这一段内持续） */
  shield?: number
  /** 回复（× 意志力） */
  heal?: number
  /** 攻击 +（比例） */
  atkUp?: number
  /**
   * 全技能倍率**乘算**（2 = 全部翻倍）。
   * 与 atkUp 分开是为了让它说得清：atkUp 加的是「打得重一点」，
   * 这一条改的是「他这门东西本身的规格」—— 旧吉他一解封就该是后者。
   */
  skillMul?: number
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

  /* —— 敌方向我方施加的负面（持续拍数取 turns） —— */
  /** 沉默：这段时间里出不了技能，只剩普攻与防御 */
  silence?: boolean
  /** 流血：每拍掉最大生命的这个比例，攒着不治会一路流下去 */
  bleed?: number
  /** 减攻：破坏力 −（比例） */
  frail?: number

  /* —— boss 专属，只有危险度到顶的那几只才有 —— */
  /** 停滞：目标行动条冻结这么多拍（不按行动次数算，按拍算） */
  stasis?: number
  /** 观测封锁：目标命中 −（绝对值），持续 turns */
  lockdown?: number
  /** 归档：把目标暂时从战场上收走这么多拍（与「合体」同一套离场机制） */
  archive?: number
  /* 回响不在这一层：它是「这一手整手照抄」，是技能自己的性质，写在 SkillSpec 上 */
}

/** 变身后的那副面目（黄金狮子一类：出手者当场换一副样子，连打法一起换） */
export interface SkillForm {
  /** 变身后顶上来的名字 */
  name: string
  /** 名字底下的注（本体是谁、这份力从哪来） */
  note?: string
  /** 持续拍数：数满自行还原本相 */
  ticks: number
  /** 解除之后这一手的冷却 */
  cd?: number
  /** 变身期间覆写的五轴（缺省沿用本体） */
  axes?: Partial<AxisSheet>
  /** 变身期间的技能表 —— 整份替换，不是追加 */
  skills: SkillSpec[]
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
  /** 需场上同在者（角色 id）：此人不在场或已失能，这一手就不可用 */
  requireAlly?: string
  /**
   * 解封之后还要过几拍才放得出来（慢启动门的角色用）。
   * 旧吉他解封就是这一条：门一解不等于立刻能甩，得先过两拍 ——
   * 一解封就丢出去的话，那五下启动就只是纯亏的过场。
   */
  openAfter?: number
  /**
   * 「启动」类专有：解封是一层一层拧开的，所以每一层有每一层的台词。
   * 第 n 次启动报 startLines[n-1]，最后一句留给「尽解」那一拍（见 engine 的解封分支）。
   * 比 startNeed 短就连报最后一句 —— 中途没词了不算错，只是那几层不吭声。
   */
  startLines?: string[]
  /** 这一手在技能框架里按哪一类打的（见 atlas.ts；档案与作战面板都写它） */
  arch?: string
  /**
   * 连携技：参加者名单（角色 id）—— 一个都不能少，少一个这一手就不列出来。
   * 出手时参加者各自按同一轴再补一份出力（见 linkPow），事后把先手让出去。
   */
  requireAll?: string[]
  /** 连携技：参与合击的人（不含出手者本人） */
  linkUnits?: string[]
  /**
   * 连携技里「别人替我出多少」：每位参加者按本手同一轴 × 此比例补进伤害。
   * 缺省 0 —— 只有出手者出力的「连携」不算连携。
   */
  linkPow?: number
  /**
   * 回响：不复写自己的倍率，而是把我方上一手（BattleState.lastSkill）原样打回来。
   * 只有 boss 的「回响 · 复写」用它 —— 见 engine 的 resolve。
   */
  echo?: boolean
  /**
   * 复写（片羽「申告虚伪」）：出手时当场照抄**任意一个角色**的一手，原样打出去。
   * 与回响的分工：回响抄的是「我方刚出的那一手」，复写抄的是「她挑的那一手」。
   * 门（启动）与印记（到达点）抄不过来 —— 借来的手没有那五下启动、也没有印记；
   * `uncopyable` 的那些同样抄不过来。
   */
  copy?: boolean
  /**
   * 抄不过来。恋兔的吉他写的就是这一条：
   * 那把琴是弹痕「樱之残影」的形状，真正出力的是她本人 ——
   * 抄得来一把琴，抄不来弹它的那股力，因为那股力本来就不在吉他上。
   */
  uncopyable?: boolean
  /** 合体：出这一手时把 requireAlly 那位暂时请下场，蛰伏 N 拍后自行归位 */
  mergeAlly?: string
  mergeTicks?: number
  /**
   * 终结技能（boss 级的大招）：不占常规出手、也不由玩家点 ——
   * 持有者每出一手给咏唱 +1，蓄满 `ult` 拍的那一手改成放它。
   * 反制有三条：① 咏唱期间一次打掉最大生命 ultBreak 的比例即打断；
   * ② 咏唱期间它身上每挂一层减益，威力少一截（见 TUNING.ultDebuffCut）；
   * ③ 「镇静剂」一类能清行动条的效果同时把咏唱清零。
   */
  ult?: number
  /** 打断阈值：咏唱期间一次被打掉自身最大生命的这个比例（0.14 = 14%） */
  ultBreak?: number
  /**
   * 变身（noapusa「变成他人」）：照着一份「已解锁的档案角色」变成对方，
   * 连能力（五轴与技能表）一并复制过来；队伍里的人复制不了。
   * morphTicks 拍后自行解除，解除当时才起算冷却 morphCd 拍，
   * 且这几拍里自身出力与充能略降——借来的东西还回去，总要缓一缓。
   */
  morph?: boolean
  morphTicks?: number
  morphCd?: number
  /**
   * 变自己（黄金狮子）：出手当场换成另一副面目，连带名字、五轴与整份技能表
   * 一起换掉，form.ticks 拍后自行还原本相。与 morph 的区别写在 SkillForm 上。
   */
  form?: SkillForm
  /**
   * 倍率浮动：这一手每次出去的轻重差很多（出力在 power × (1 ± variance) 之间摇）。
   * 给「性能极端、全凭运气」的手用；缺省 0 = 稳定。
   */
  variance?: number
}

/**
 * 增益 / 减益：k = 类别，v = 量（比例或绝对值），t = 剩余行动次数。
 * 后三种是敌方专给我方的：沉默 / 流血 / 减攻 ——
 * 它们同时算作「负面」，能喂给 boss 的终结技能（咏唱期间挂得越多，大招越软）。
 */
export type BuffKey =
  | 'atk' | 'spd' | 'evade' | 'acc' | 'shield' | 'mark' | 'slow'
  | 'silence' | 'bleed' | 'frail'
  /**
   * 全技能倍率乘算（旧吉他解封：+1 即全部翻倍）。
   * 不是「打得重一点」那种加算 —— 它改的是这个人这门东西的规格，
   * 所以单独占一个键，也**不算负面**（不是 DEBUFF_KEYS 的成员）。
   */
  | 'skillMul'
  /* —— boss 的看家机制 —— */
  /** 停滞：行动条原地冻结，一格都不涨（终末停滞委员会这个名字，指的是这东西） */
  | 'stasis'
  /** 观测封锁：命中率被压下去 —— 看不见，就打不准 */
  | 'lockdown'

/** 负面减益一览：能喂终结技能、也能被「解除负面」一并清掉 */
export const DEBUFF_KEYS: BuffKey[] = [
  'mark', 'slow', 'silence', 'bleed', 'frail', 'stasis', 'lockdown',
]

/** 这条 buff 是不是负面的 */
export function isDebuff(k: BuffKey): boolean {
  return DEBUFF_KEYS.includes(k)
}

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
  /** 敌阵里的头目档：每场至少一个 —— 低危是精英，危险度到顶换成首领（Boss）。
      我方不带这个字段（谁强谁弱写在名册的五轴上，不靠贴标签）。 */
  tier?: 'elite' | 'boss'
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
  /** 被动技能（本人常驻；缺省 = 无名录条目） */
  passive?: PassiveSpec
  /** 战斗续行已触发的次数 */
  endured: number
  /** 合体蛰伏：>0 表示此人暂时不在场上（不充能、不可选、不算失能），归零即归位 */
  gone: number
  /**
   * 变身（noapusa）：借来的五轴 / 借来的名字 / 还剩几拍 / 变回来时该还到哪里。
   * 解除时把 base 还回 axes，并把 morphCd 记到 skillId 的冷却上。
   */
  morph?: {
    /** 'other' = 借来的形（变成他人）；'form' = 自己的另一副面目（变身） */
    kind: 'other' | 'form'
    /** 顶着的名字（界面上标「化身 · X · N 拍」） */
    name: string
    /** 变回来要还到哪里：自己的五轴、速度与技能表 */
    base: { axes: AxisSheet; spd: number; skills: SkillSpec[] }
    ticks: number
    skillId: string
    cd: number
  } | null
  /** 本场生效的羁绊名（队伍羁绊与双人羁绊；供界面挂牌，不改数值） */
  synergy?: string[]
  /** 已使用的「启动技」次数 */
  startUsed: number
  /** 需要几次启动技才解禁普攻/技能（0 = 无门） */
  startNeed: number
  /** 解封发生在第几拍（s.hand）；没解封过是 0。带 openAfter 的手按它算解禁时间 */
  unsealedAt: number
  /** 本人这一场的体力（与终端上的小队体力是两回事：出手从这里扣） */
  sp: number
  spMax: number
  /** 已蓄印记层数（弹痕持有者 = 樱印） */
  stack: number
  /** 终结技能的咏唱进度（大招技能 id → 已蓄拍数）；蓄满即当手放出 */
  chant: Record<string, number>
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
  /** 常驻的普攻倍率提升（比例，含装具与被动） */
  gearBasic: number
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
  /** 这一手的性质（回复 / 增益 / 压制 / 纯伤）—— 演出按它上色，不按动画类别 */
  tone?: FxTone
  /** 这一手落在几个人身上：'all' = 全体，演出走全屏；'one' = 单体，演出贴着挨打的那个 */
  scope?: 'one' | 'all'
  targetId?: string
  target?: string
  dmg?: number
  heal?: number
  down?: boolean
  miss?: boolean
  line?: string
  /** 特殊备注（解禁 / 到达点 / 力竭 / 回气 / 换装 …） */
  note?: string
  /**
   * 这一手是「连携」—— 参加者与招式名整份带上。
   * 不由视图拿 skillId 去反查：作战记录是唯一的事实来源，回放时也得独立成立。
   */
  link?: { id: string; name: string; members: string[] }
}

/**
 * 'think' = 轮到敌方、但这一手要由「视图那边算」（接通接口时交给模型决定）。
 * 引擎在这里让出控制权，视图算完用 enemysTurn() 续上，引擎本身始终是同步的。
 */
export type Phase = 'select' | 'think' | 'won' | 'lost' | 'fled'

/** 敌方这一手的决定：由谁指挥、出哪一门、打谁 */
export interface EnemyIntent {
  /** 出手者 id */
  foeId: string
  /** 选定的技能 id（必须是 legalSkills 里列得出来的一个） */
  skillId: string
  /** 目标 id（缺省 = 交给引擎按离线规则挑） */
  targetId?: string
  /** 谁指挥的这一手：'ai' = 接通接口由模型决定；'offline' = 引擎自带的判断 */
  by: 'ai' | 'offline'
  /** 模型给出的战意一句话（可空；作战记录里看得见） */
  note?: string
}

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
  /**
   * 「回手」：下一手仍旧是这一位，不看行动条先后（用完即清）。
   * 只有一处会写它 —— 解封尽解的那一拍（见 engine 的 k.kind === '启动' 分支）：
   * 五下启动把回合全让出去了，尽解不给一手回手的话，解封本身就是白亏五拍。
   */
  again: string | null
  allies: Combatant[]
  enemies: Combatant[]
  log: LogEntry[]
  phase: Phase
  /**
   * 敌方由谁指挥：'offline' = 引擎自带的离线判断（缺省，永远可用）；
   * 'ai' = 接通接口时交给模型 —— 引擎会停在 'think' 等视图把这一手交回来。
   */
  command: 'offline' | 'ai'
  /** 视图算好、待引擎消费的这一手（用完即清） */
  intent: EnemyIntent | null
  /**
   * 我方上一手用过的技能（整份留下，不是只留 id）。
   * boss 的「回响」要照着它原样复写一遍，所以连倍率、轴、目标口径都得在手上。
   */
  lastSkill?: SkillSpec
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
  /** 变身可借的档案池（已解锁、且不在本场队伍里的角色 id） */
  morphPool: string[]
  /**
   * 连携共鸣槽（羁绊 id → 已蓄拍数）：羁绊里每有人出一手 +1，
   * 满槽且全员在场即自动接一记连携技，打完清零（见 engine 的 chargeLinks / fireLinks）。
   * 不由玩家主动点 —— 打熟了自然接得上。
   */
  link: Record<string, number>
  /**
   * 各人自己的共鸣能量（角色 id → 已蓄拍数）。**只有整队连携（特殊连携）读它**。
   * 双人连携看的是 s.link 那条共享的槽；整队那条不一样 ——
   * 名单上每个人都得把自己的能量攒满，一手都不许少，这才凑得出「全员到齐」。
   * 见 engine 的 chargeLinks / fireLinks、synergy 的 Bond.squad。
   */
  gauge: Record<string, number>
  /**
   * 连携冷却（羁绊 id → 还剩几拍）：每条连携自带 cd（见 synergy 的 BondLink.cd），
   * 接完一手就进冷却，我方每出一手减一。槽满不等于能接 —— 冷却没走完也接不上。
   */
  linkCd: Record<string, number>
  /**
   * 每人与你的羁绊读数（0~100）。整场只读不写 —— 仗打完了才回写（见 settle 的 bondPerWin）。
   * 场上只有两处用到它：共鸣槽的拍数、本人五轴的加成，两处都在 synergy 里。
   */
  bond: Record<string, number>
  /** 时期进度与成长（换装时重算面板要用） */
  progress: number
  growth: Record<string, number>
  /** 主线作战：记录要求出「详细战斗过程」 */
  mainline?: boolean
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
  /** 主线作战：归入正史，成文按「逐手复现全过程」写 */
  mainline?: boolean
  /** 本场对手的档位（首领 / 精英 / 常规）——回填推演的剧情正文按它定分寸 */
  tier?: 'elite' | 'boss'
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
    /** 普攻倍率提升（比例，0.5 = 普攻 ×1.5） */
    basicMul?: number
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
  /** 不入掉落池：某个人身上的私物，别人捡到也没用 */
  noDrop?: boolean
  /**
   * 特殊装备：须先完成这一段主线（时间线事件 id）才在军需处上架。
   * 未完成时只挂牌、不出货，也不进交战的掉落池 —— 它不是捡来的，是拿正史换的。
   */
  unlockMain?: string
  /**
   * 专属：只有名单上的人装得上（露娜的丝线是系在他手腕上的，
   * 换个人拿在手里就是一团废丝）。缺省 = 谁都能装。
   */
  onlyFor?: string[]
  /**
   * 商店限购件数（缺省不限）。研究所产出的特殊装备一人只兑一件 ——
   * 它是「拿贡献点换的配给」，不是货架上的商品。
   */
  maxOwn?: number
}
