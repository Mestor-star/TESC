/* 停滞观测终端 — 数据类型定义（内容按《这里是，终末停滞委员会。》原文修订） */

/**
 * 反现实干涉指数（通称 R 值）：终端本地的经验标定。
 * 正常区间 0.95 ~ 1.05；越低代表该区域「现实越薄」、反现实干扰越强。
 */
export interface RegionReading {
  id: string;
  name: string;          // 区域名（天空都市 · 弗尔克图斯 各区 / 学园内设施）
  code: string;          // 终端分区代码
  r: number;             // 当前 R 值（干涉指数）
  delta: number;         // 较上一轮变化（+回升 / -下滑）
  threatStage: number;   // 该区域危险度 0-10（终末潜力分级沿用学园标尺）
  threatName: string | null;
  note: string;          // 观测备注
}

export type StationStatus = '在场' | '出击' | '疗养' | '待命' | '未知';

/**
 * 能力五轴评定值。标尺：10 ≈ 普通成年人的该轴水准（高于 10 为超凡/武装加持）。
 * '∞' = 无法测量（该轴已超出委员会可评定的量级，如恋兔光的破坏力）。
 */
export type AxisVal = number | '∞'

/** 五轴数值在视觉 meter 上的参考刻度上限（仅供画条用，非语义上限） */
export const AXIS_MAX = 60

export interface CharacterStat {
  key: string;          // 中文标签
  value: AxisVal;       // 五轴评定：10≈普通成年人；'∞'=无法测量（满格+徽记）
}

export interface Character {
  id: string;
  no: string;            // 终端编号，如 01
  callsign: string;      // 终端呼号（拉丁代号）
  name: string;
  epithet: string;       // 一句称号/印象
  division: string;      // 所属（光明会 · 突击队 等）
  role: string;          // 定位
  scar: string;          // 弹痕 / 终末 / 特性
  potential: string;     // 终末潜力（Stage N『…』；未分级填 —）
  station: StationStatus;
  stationNote: string;   // 状态备注
  hue: string;           // 主题色（HTML 色）
  sigil: string;         // 文字纹章（1-2 字符）
  quote: string;         // 一句台词（原作）
  bio: string;           // 档案简介（按原作）
  defaultBond: number;   // 初始羁绊值 0-100
  stats: CharacterStat[];
}

/** 任务简报（光明会 · 突击队 的反现实实体处置） */
export interface Mission {
  id: string;
  no: string;            // 任务编号，如 MST-114
  title: string;
  place: string;         // 地点
  stage: number;         // 危险度/终末潜力分级
  nature: string;        // 目标性质
  recommend: string[];   // 推荐的角色名
  status: '待接取' | '已派遣' | '压制中' | '完成' | '锁定';
  deadline: string;      // 期限描述
  desc: string;
  reward: string[];      // 可能回报（用于氛围）
}

/** 终末图鉴条目（反现实实体 / 终端档案） */
export interface EndEntry {
  id: string;
  name: string;
  alias: string;         // 学名/观测代号，如 NO.3922
  no: string;            // 观测编号（如 3922；未编号留空）
  stage: number;         // Stage 0-10 分级（-1 = 未解明）
  stageKw: string;       // Stage 关键词，如 『活性化』 / 未解明
  classes: string[];     // 原法分类（贴合原著：异法/死灵操法/仪式灾害/反现实机械工学/梵我合一/世界的色彩/天使之律/旧神/共同幻想…）
  state: '活跃' | '抑制' | '收容' | '已清除';
  seen: boolean;         // 是否已遭遇（true=遭遇/高亮；false=仅已知情报）
  origin: string;        // ○来历
  detail: string;        // ○详细
  counter: string;       // 应对要点
  ref: string;           // 主要出处（如 V1 / S1）
}

export interface LogChoice {
  text: string;
  bondTo?: string;       // 影响羁绊的角色 id
  bondDelta?: number;    // 羁绊变化
  note: string;          // 该选择的影响说明（写进日志）
}

export interface LogEntry {
  id: string;
  day: string;           // 学园历 / 第几日
  time: string;
  node: string;          // 节点名（章节名）
  summary: string;       // 世界/自身变化描述
  choice?: {
    picked: string;      // 已做选择（若未选择则留空）
    options: LogChoice[];
  };
  rDelta: number | null; // 该节点引起的干涉指数变化
  tags: string[];
}

/** 会话消息的轻量元数据（纯增量；旧存档无 meta 照常解析） */
export interface ChatMsgMeta {
  /** 回执来源：json=事件指令围栏 / tags=标签化回执 / none=无指令 */
  source?: 'json' | 'tags' | 'none'
  /** 标签化回执中的「接续选项」（<option> 逐行） */
  options?: string[]
  /** 标签化回执中的「推演」文本（<thinking>/<think>） */
  thinking?: string
  /** 本条回复的指令是否实际改变了世界状态（决定可否「重写」） */
  hasFx?: boolean
}

export interface ChatMsg {
  id: string;
  from: 'user' | 'them';
  text: string;
  time: string;
  kind?: 'text' | 'decode';  // decode=加密讯息已解码
  meta?: ChatMsgMeta
}

export type ToastKind = 'info' | 'warn' | 'success' | 'danger' | 'decode';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  live?: boolean;        // 常驻（不自动消失）
}

/* ============================================================
   时间线 / 心声 / 智库（六卷 + 外传重制）数据类型
   ============================================================ */

export type CharId = 'hikari' | 'luna' | 'mefisa' | 'nyau';

/** 能力参数五轴（原作风格：破坏力/敏捷度/物理抗性/反现实亲和/意志力） */
export const STAT_KEYS = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** 某一时间线「段」（一个事件）下的角色好感快照。键为 Character.id */
export interface BondSnap {
  hikari?: number;
  luna?: number;
  mefisa?: number;
  nyau?: number;
}

/** 正文聊天行（原文逐字；who 为 'narration' 时是叙述，'you' 为可回应的缺口） */
export interface ScriptLine {
  who: 'narration' | CharId | 'you' | 'other';
  text: string;
  speaker?: string;      // 当 who==='other' 时的人物名（如 吴诗涵/西蒙/格蕾）
  note?: string;         // 出处/场景标注（如「— 第1卷 序章」）
}

/**
 * 时间线段 —— 以一个事件的开始为一段。
 * vol: 1-6 为正传卷；0 表示外传 S1 的插曲段（group 区分该插在卷几之间）。
 * bond: 该段结束时的角色好感快照（随时间线逐段不同）。
 */
export interface TimelineEvent {
  id: string;            // 如 'v1-03'
  vol: number;           // 0 = 外传
  ga: boolean;           // 是否外传插曲
  group: string;         // 渲染分组键：'卷1'…'卷6' / '外传'
  gaAfter?: number;      // 外传插曲安插在正传第几卷之后
  order: number;         // 组内序号
  phase: string;         // 卷内定位：序章 / 第 N 章 / 终章 / 外传章
  title: string;         // 事件名
  place: string;
  day: string;           // 卷内时间标（若有）
  summary: string;       // 概述（依原文）
  entities: string[];    // 关联【No.】编号（原文格式）
  chars: CharId[];       // 出场/受影响角色
  bond: BondSnap;        // 本段好感快照
  script?: ScriptLine[]; // 正文（逐字）
  unlock?: boolean;      // 完成本段即解锁四大视图（第1卷「欢迎来到」收束事件）
}

/** 低语者日志「段」的动态补充：开场白 + 抉择点 */
export type FlagValue = string | number | boolean

/** 单个抉择选项：做出与原著不同（或相同）的行为 → 不同的后续余波 */
export interface SagaChoice {
  key: string
  label: string           // 操作员可执行的行动（按钮文案）
  canon?: boolean         // 是否「原著实际选择」
  bond?: { char: CharId; delta: number }[]
  flag?: [string, FlagValue]
  after: string           // 该选择的余波描述（第三人称 · 按原文言行改写）
  hint?: string           // 可选：选择前的一行情境注记
}

/** 一个时间线段的现场：开场白（按原文第三人称）+ 可选抉择 */
export interface SagaScene {
  open: string            // 开场白
  openTag?: string        // 出处/章节标注，如「— 第1卷 序章」
  quote?: string          // 可选：该段最贴切的原文一句（语录）
  quoteWho?: string       // 语录说话人
  pick?: string           // 抉择提问语（若无 choices 则忽略）
  choices?: SagaChoice[]
}

/** 操作员自记的终末图鉴条目（persisted） */
export interface OwnEndEntry {
  id: string
  name: string
  alias: string
  no: string
  stage: number
  stageKw: string
  classes: string[]
  state: '活跃' | '抑制' | '收容' | '已清除'
  origin: string
  detail: string
  counter: string
  ref: string             // 恒为「操作员自记 · 档案扩充」
  ts: number
}

/** 「记录」的产生方式：online=AI 在线推演 · offline=离线通读原文 · legacy=旧存档回填 */
export type RecordMode = 'online' | 'offline' | 'legacy'

/** 低语者日志里归档的一条「记录」——一个事件收束后的摘录 */
export interface WorldRecord {
  eventId: string
  mode: RecordMode
  /** 第三人称记录/摘要（AI 收官结语；缺省回退原著 ev.summary，不虚构） */
  digest: string
  /** 该段收束是否为分歧路线 */
  diverged?: boolean
  /** 完成时间 epoch ms（legacy 旧档回填为 0） */
  ts: number
}

/** 持久化世界状态（随存档读写 · 全部为可增删变量） */
export interface WorldState {
  /** 与原著基准的偏差量（操作员抉择累积） */
  offset: Record<string, number>
  /** 剧情推进标记 / 抉择分支标志（布尔或档位） */
  flags: Record<string, FlagValue>
  /** 已遇见（解锁档案）的角色 id */
  met: Record<string, true>
  /** 已登记进图鉴的实体 id（剧情推进自动登记 / 操作员手动登记） */
  ends: Record<string, true>
  /** 操作员自记实体 */
  own: OwnEndEntry[]
  /** 各事件段的抉择记录：段 id → 选项 key */
  pick: Record<string, string>
  /** 已归档的「记录」（事件收束后追加；旧档缺此字段由 hydrate 回填 legacy） */
  records: WorldRecord[]
}

/** 低语者读到的心声（逐字原文） */
export interface MindVoice {
  id: string;
  group: string;         // 匹配 TimelineEvent.group（用于按卷归类）
  vol: number;
  who: CharId | 'other' | 'you';
  speaker: string;       // 显示名
  scene: string;         // 场景/出处
  text: string;          // 心声原文（不含『』，逐字）
}

/** 智库条目（世界观 / 势力 / 概念） */
export type LoreCat = '世界观' | '势力' | '概念';
export interface LoreEntry {
  id: string;
  cat: LoreCat;
  title: string;
  sub: string;           // 拉丁/副标
  body: string;
  tags: string[];
  ref?: string;          // 主要出自卷数，如 'V1'
}

/* ============================================================
   三学园系谱武装图鉴：弹痕 / 斩击 / 片羽
   苍之学园持「弹痕」（石像「弹痕的天使」授予）· 卡乌斯学院持「斩击」（石像「斩击的天使」授予）·
   Corporations 学生持有「片羽」翼状之力。反现实武装的本质只有一个——为持有者实现渴望。
   ============================================================ */

/** 三学园系谱：武装传统 */
export type ArmKind = '弹痕' | '斩击' | '片羽';

export interface ArmEntry {
  id: string;
  kind: ArmKind;
  name: string;          // 武装名（含『』）
  sub: string;           // 拉丁/副标，如 HOLY SCAR
  holder: string;        // 持有者
  holderNote: string;    // 持有者身份（所属/定位）
  phrase: string;        // 「核心句」——武装的本相
  power: string;         // 能力说明（原文考据）
  awakened?: string;     // 到达点（觉醒的深层核心力量）
  ref: string;           // 主要出处，如 'V1'
  /** 图鉴门禁：持有人 id（属于角色档案名录时）；玩家「遇见」该持有人即解锁本条目 */
  holderId?: string
  /** 图鉴门禁：完成该 eventId 事件后解锁（用于后期才出线的武装，如操作员的 noapusa / a Session.） */
  revealAt?: string
  /** 门禁取并/或：缺省 = holder 或 reveal 任一满足即显 */
  gate?: 'holder' | 'event'
}
