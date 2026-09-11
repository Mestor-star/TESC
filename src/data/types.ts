/* 停滞观测终端 — 数据类型定义（内容按《这里是，终末停滞委员会。》原文修订） */

/**
 * 反现实干涉指数（通称 R 值）：终端本地的经验标定。
 *
 * **区间照原文**（V2 第 2 话『noapusa』，梅芙给出判据）：
 * 「R值在正常情况下为「1」。如果R值高于1.02或者低于0.98，就说明存在着异常。」
 * 故正常区间 = 0.98 ~ 1.02，**偏离即异常，两侧同判**，且偏离得越远危险度越高 ——
 * 不是「只判低的一侧」，也不是终端早先自拟的 0.95 ~ 1.05（那个区间书上没有，已作废）。
 *   · 低于 0.98 → 现实偏薄，反现实实体更凝实、更容易显形；
 *   · 高于 1.02 → 现实过厚，是「高 R 存在」的主场（codex：低 R 地带会压制高 R 存在）。
 * 区间与偏离量的唯一算法见下面 R_NORMAL_LO / R_NORMAL_HI / rOutOf ——
 * 不要在别处再写一遍 0.98 / 1.02 的字面量。
 */
export interface RegionReading {
  id: string;
  name: string;          // 区域名（天空都市 · 弗尔克图斯 各区 / 学园内设施）
  code: string;          // 终端分区代码（CN- 原文实测 / FLK- 标定表 / EST- 推算）
  r: number;             // 当前 R 值（干涉指数）
  delta: number;         // 较上一轮变化（+回升 / -下滑）
  threatStage: number;   // 该区域危险度 0-10（终末潜力分级沿用学园标尺）
  threatName: string | null;
  note: string;          // 观测备注
  /**
   * 读数来源：'canon' = 原文明写了数（data/rreadings.ts，界面标「原文」）；
   * 缺省 / true = 在侦察网标定表上（REGIONS 那六区，终端标定过）；false = 按现场危险度**推算**（EST-）。
   * 界面须按它挂牌 —— 推算数不能冒充实测数，原文数也不该被推成另一个样子。
   */
  known?: boolean;
  /** 读数出处：canon 原文实测 / table 侦察网标定表 / est 推算 */
  src?: 'canon' | 'table' | 'est';
  /** 原文一路读数（仅 canon：0.99 → 0.97 → 0.89） */
  series?: { r: number; naxa: number | null; quote: string }[];
  /** 纳克萨指数（现实的易变程度；原文同批报出时才有） */
  naxa?: number | null;
  /** 原文引句与出处（仅 canon；给界面订正口径用） */
  quote?: string;
  book?: string;
  /** 读数超出六占式盘量程（如「线之人」内部 30.55 —— 照记不缩） */
  over?: boolean;
}

/**
 * R 值正常区间的下沿（低于它即「现实偏薄」）—— 原文判据，见本文件头。
 */
export const R_NORMAL_LO = 0.98
/** R 值正常区间的上沿（高于它即「现实过厚」）—— 原文判据，见本文件头。 */
export const R_NORMAL_HI = 1.02
/**
 * 偏离量达到此值即判「重度异常」。
 * 区间由 0.95~1.05 收到原文的 0.98~1.02 之后，同一根尺子上刻度变紧：
 * 0.07 的偏离落在 Stage 6.4 上下，仍是「6 级起判重度」那档（见 battle/tuning.ts 的推算梯度）。
 */
export const R_SEVERE_OUT = 0.07

/**
 * 偏离正常区间多少 —— 区间内记 0，两侧同取绝对值。
 * 「与正常值相差越大，此值越大」：不论现实偏薄还是过厚，危险度都随之上升。
 */
export function rOutOf(r: number): number {
  if (r < R_NORMAL_LO) return R_NORMAL_LO - r
  if (r > R_NORMAL_HI) return r - R_NORMAL_HI
  return 0
}

export type StationStatus = '在场' | '出击' | '疗养' | '待命' | '未知';

/**
 * 能力五轴评定值。标尺：10 ≈ 普通成年人的该轴水准（高于 10 为超凡/武装加持）。
 * '∞' = 无法测量（该轴已超出委员会可评定的量级，如恋兔光的破坏力）。
 */
export type AxisVal = number | '∞'

/**
 * 五轴 meter 的量表基准 = 200。
 * ------------------------------------------------------------
 * **这不是上限。** 终端不再给任何战斗数值封顶：升级、装具、极限值一路推上去，
 * 读数就照实往上涨（超出量表基准的以「超限」标出，条宽仍是满格）。
 * 它只做两件事：① 画条时的归一化参考；② 给人一个「200 以上即超出常规观测」的直觉。
 */
export const AXIS_REF = 200

/**
 * '∞' 在数值模型里的代入值 —— 数学上算不出的读数总得有个数，
 * 取一个明显高于量表基准的数，好让「无法测量」在交战里也确实是最高的一档。
 * （档案上仍读作「∞」；此处只供引擎算伤害、生命与充能。）
 */
export const AXIS_INF = 300

export interface CharacterStat {
  key: string;          // 中文标签
  value: AxisVal;       // 常态评定：10≈普通成年人；'∞'=无法测量（满格+徽记）
  /**
   * 极限评定：该轴在「机制全开 / 变身 / 限时爆发」下的最强表现（恒 ≥ value）。
   * 档案页以红色条叠加于常态条之后示出，读数记为「常态/极限」。
   * 缺省 = 未登记（该轴无更强表现可考），UI 退回单值显示。'∞' = 极限亦无法测量。
   */
  limit?: AxisVal
}

export interface Character {
  id: string;
  no: string;            // 终端编号，如 01
  callsign: string;      // 终端呼号（拉丁代号）
  name: string;
  epithet: string;       // 一句称号/印象
  division: string;      // 所属（终末停滞委员会 · 恋兔队 等）
  role: string;          // 定位
  scar: string;          // 武装 / 终末（弹痕·斩击·片羽·龙花·特殊武器，或其所背负终末之名；兼有者以 / 分隔）
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

/** 任务简报（终末停滞委员会 · 恋兔队 的反现实实体处置） */
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
  /** 主线作战：取自时间线上确曾交过手的事件，可反复复盘（记录里出详细战斗过程） */
  mainline?: boolean;
  /** 主线作战锚定的事件 id（时间线） */
  at?: string;
  /**
   * 指名首领的档案 id（见 lib/battle/bosses.ts）。
   * 挂上之后，场上头一名不再是现推的「观测体 · 首领」，而是档案里那个有名有姓的人 ——
   * 五轴照他的档案读数、招式是他自己那一套、到达点兼任他的终结技能。
   * 例：第 2 卷天空竞技祭的先锋 / 中坚 / 副将三战。
   */
  bossId?: string;
}

/** 图鉴「处置状态」。基础四态来自委员会口径；后三态为考据后新增：
 *  「运转中」＝残响一类仍在运作、未消亡亦非威胁的持续存在；
 *  「去向不明」＝正文未见歼灭/收束、当前下落未定的实体（如死灵舰队）；
 *  「存疑」＝档案旧标与正文不符、暂无法在基础口径内安放（如仅存在于模拟装置者）。 */
export type EndState = '活跃' | '抑制' | '收容' | '已清除' | '运转中' | '去向不明' | '存疑'

/** 终末图鉴条目（反现实实体 / 终端档案） */
export interface EndEntry {
  id: string;
  name: string;
  alias: string;         // 学名/观测代号，如 NO.3922
  no: string;            // 观测编号（如 3922；未编号留空）
  stage: number;         // Stage 0-10 分级（-1 = 未解明）
  stageKw: string;       // Stage 关键词，如 『活性化』 / 未解明
  classes: string[];     // 原法分类（贴合原著：异法/死灵操法/仪式灾害/反现实机械工学/梵我合一/世界的色彩/天使之律/旧神/共同幻想…）
  state: EndState;
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
  /** 开场白标记：由终端按原文注入的事件开场（无 AI 参与，渲染为「开场白 · 原文」） */
  opening?: boolean
  /** 交战成文：一场仗打完之后回填的那段剧情正文（渲染为「交战 · 成文」） */
  battle?: boolean
  /** 群聊发言者名（单聊为空；群聊里谁是这一句的作者） */
  who?: string
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
  /**
   * 本事件**现场在场**的名册（含 roster 里的外场角色，如恋兔队/卡乌斯/终末持有者）。
   * 与 chars 的区别：chars 只有四位主角且含「受影响但未到场」者；
   * cast 依原文逐事件判定，只收现场出现的人。缺省时回落到 chars（见 lib/cast.ts 的 castOf）。
   */
  cast?: string[];
  bond: BondSnap;        // 本段好感快照
  script?: ScriptLine[]; // 正文（逐字）
  unlock?: boolean;      // 完成本段即解锁受门禁保护的五个视图（第1卷「欢迎来到」收束事件）
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
  /** 开场白是否「自足完整」：注入后停在开场等操作员回话，不再自动让导演续写 */
  standby?: boolean
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
  state: EndState
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

/**
 * 武装传统分类。前三者为三学园的天使系谱；「特殊武器」为系谱之外的造物／遗物
 * （不入任何石像的赠予，如小柴琳自境界领域商会所得的「爪」）。
 */
export type ArmKind = '弹痕' | '斩击' | '片羽' | '特殊武器';

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
