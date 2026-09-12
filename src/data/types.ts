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
  /**
   * 在观测点示意图上的落点（0~100 的归一化坐标，见 views/Dashboard 那张图）。
   * 不写就不上图 —— 侦察网标定表里那六区都要有。
   * 图上挨得近 = 故事里走动的关系近，不是投影测绘，别拿它当经纬度用。
   * **图的形状由这里定死，视图里不许再写一套坐标。**
   */
  xy?: [number, number];
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
  /**
   * 本段好感快照 —— **只作原著对照的读数，不再当基准**。
   *
   * 从前它是好感的基准：读到哪一段，好感就跟到那一段的原著数值，主角做过什么
   * 只是在这之上加减一个偏移。结果是「好感度 = 进度的影子」—— 一集不看也涨，
   * 什么都没做也涨，涨的还不是这段关系里的任何一件事。
   * 现在好感只从主角的行为里来（`WorldState.offset`），这一栏退回去当考据：
   * 界面上可以拿它对照「你这一段走到的位置，比原著亲近还是疏远」。
   */
  bond: BondSnap
  /**
   * 进入本事件的**门槛**：这些角色对言万心叶的好感得先到某个数，这一段才开得了。
   * 未达成时推进指针会停在前一段（见 Terminal.tsx 的 markRead），界面上说明差多少。
   */
  gate?: BondGate[]
  /**
   * 完成本事件即**锁定**好感：此后不论主角再做什么，读出来都是这个值。
   * 用在「这件事之后这段关系就再也回不去了」的节点上（如卷一的契约事件锁 100）。
   */
  lock?: BondGate[]
  script?: ScriptLine[]; // 正文（逐字）
  unlock?: boolean;      // 完成本段即解锁受门禁保护的五个视图（第1卷「欢迎来到」收束事件）
}

/** 一条好感门槛 / 锁定：某角色的好感达到某个值 */
export interface BondGate {
  char: CharId
  value: number
}

/**
 * 事件的**详细大纲** —— 隐藏的那一份。
 *
 * 与 `summary` 的分工：summary 是给操作员看的一句话概述（也上屏、也进任务板），
 * 下面是给导演看的**逐拍实施细则**。两者都只出自原文，但粒度差一个数量级：
 * summary 说「这一仗怎么收的」，brief 说「谁在什么时候说了哪一句、他此刻知道什么、
 * 说了哪句话就算走样了」。
 *
 * 为什么要单开一份：正文跑偏（OOC）几乎都不是模型不会写，而是**它手上没有够细的事实** ——
 * 只有一句话的概述时，人物关系、谁知道什么、关键台词长什么样，全靠它自己编。
 *
 * 铁律与 `eventnotes.ts` 完全一致：**逐字摘录自源文献，绝不新增/改写/补全；
 * 拿不准就留空，留空即零副作用**（渲染时整节不出现，导演退回 summary）。
 */
export interface EventBrief {
  /** 逐拍情节线：按原文先后，谁做了什么、为什么这么做、结果如何。比 summary 细一个数量级 */
  beats: string[]
  /**
   * 原文关键台词（逐字；who 用其本名或常用称呼）。
   *
   * **只有 key 标了的那几句进提示词** —— 没标的留在数据里当摘录证据，但不写进大纲。
   * 理由：一节的对话若整段照搬，大纲就从「参照系」变成了「剧本」，
   * 导演照着复述原文，人也就不是那个人了（同一个角色换个场合说法本就不同）。
   * 进大纲的只留**绕不开的那几句**：
   *   · 伏笔 —— 后文要靠它回收的；
   *   · 影响大的话 —— 立约、宣告、转折、一句话把关系或局势定死的那种。
   * 分寸拿不准就**别标**：少写一句只是留给导演发挥，多写一句是替他把话说了。
   */
  lines?: { who: string; text: string; key?: boolean }[]
  /**
   * 在场角色此刻的**知识边界**：这一节他知道了什么、还不知道什么。
   * 用途是防「角色说出他不该知道的事」——这是最伤也最容易发生的一种 OOC。
   */
  knows?: { char: string; knows?: string[]; unknown?: string[] }[]
  /** 收束条件：达成这几条才算这一事件完成（eventDone 的判据） */
  done?: string[]
  /** 禁忌：不能提前抖的包袱、不能写出的方向（防剧透、防性格走样） */
  taboo?: string[]
  /** 出处：逐字摘录切自哪一章（供核对，不上屏、不进提示词） */
  ref?: string
}

export type FlagValue = string | number | boolean

/** 一个时间线段的现场：开场白（按原文第三人称） */
export interface SagaScene {
  /**
   * 开场白。**可选**，且只有第一卷第一章（v1-1）写 —— 那一段是逐字原文的排印。
   * 其余段不给：开场白顶着「· 原文」的名头注入到会话最前，转述一摆出来就是伪原文。
   */
  open?: string
  /** 开场白是否「自足完整」：注入后停在开场等操作员回话，不再自动让导演续写 */
  standby?: boolean
  openTag?: string        // 出处/章节标注，如「— 第1卷 序章」
  quote?: string          // 可选：该段最贴切的原文一句（语录）
  quoteWho?: string       // 语录说话人
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

/* ============================================================
   私密档案（只对女角色生效）
   ------------------------------------------------------------
   这是一份**游戏内档案**，不是原文考据：原作没有这些读数，字段与取值都由本终端
   自行拟制（与 TAVERN_PERSONAS 的 greeting 同一性质 —— 撰写样本，非原文台词）。
   因此不许在任何地方把它当作「原文」引用，也不进人物卡的提示词。
   底档见 data/intimate.ts；随剧情推进的变动落在 WorldState.intim。
   ============================================================ */

/** 私密部位（口腔 / 胸部 / 小穴 / 菊穴） */
export type IntimateSlot = 'mouth' | 'breast' | 'vagina' | 'anus'

/** 一个部位的私密读数（**底档**里的那一份） */
export interface IntimatePart {
  /** 开发度 0-100（底档恒 0 = 未开发；上限 100） */
  dev: number
  /**
   * **四档状态句** —— 与 `data/intimate.ts` 的 `DEV_STAGES` 同一条梯子：
   * 第 i 句就是第 i 档（那个档位词）说着的那一段。读数走到哪一档，
   * 上屏的就是哪一句（见 `intimateOf`）。
   *
   * **只写这一处此刻的样子**：形态 / 颜色 / 软硬 / 松紧 / 湿润 / 敏感度 /
   * 开发到哪一档 —— 不写她的动作与反应（「会推开」「会脸红」是反应，不是状态）。
   *
   * 第 0 档（未开发）一律是**抗拒**，也写作形态：紧闭、干涩、绷着、未开 ——
   * 谁都不是带着开发度登场的；往上每一档换一句，越走越开。
   */
  states: readonly string[]
}

/** 合成之后一个部位的读数（上屏用）：此刻那一档的状态句 + 开发度 */
export interface IntimateReadout {
  /** 开发度 0-100 */
  dev: number
  /** 此刻那一档的状态句（推进里改写过的优先，见 `intimateOf`） */
  state: string
}

/**
 * 一名角色的私密档案（底档 + 已落地的推进合成之后的结果）。
 *
 * **合成之后**的这一份里没有 `viewHigh`：羁绊够不够、该取哪一句，在
 * `data/intimate.ts` 的 `intimateOf` 里就定了 —— 调用方拿到的 `view` 就是要显示的那一句。
 */
export interface IntimateProfile {
  parts: Record<IntimateSlot, IntimateReadout>
  /**
   * 色情度 0-100 —— 不挂在某个部位上，说的是**她这个人**此刻对这件事的
   * 敏度与淫靡程度：同样是开发度 40，色情度高的人反应完全是另一回事。
   * 与四处开发度并列成第五根条，底档恒 0、上限 100。
   */
  lewd: number
  /** 是否仍为处女 */
  virgin: boolean
  /** 破处对象（未破处 → null；'you' = 言万心叶本人） */
  firstBy: string | null
  /** 最近的性行为：最近这一回做了什么（尚未发生 → `data/intimate.ts` 的 NO_ACT） */
  lastAct: string
  /**
   * 她对这件事的看法（一句话）。
   *
   * 取值分三层，后一层盖前一层：
   *   ① 底档那一句（初见时的她）；
   *   ② **羁绊过线之后另起的那一句**（底档里的 `viewHigh`）—— 关系走到这一步，
   *      她自己对这一件事的态度也跟着松了；这是「间接」影响，不是把读数换算成文字；
   *   ③ 推进里的改写（`IntimateProgress.view`）—— 真的在情节里变了才落这一层。
   */
  view: string
}

/**
 * 私密档案的**底档**（data/intimate.ts 的 `INTIMATE` 一项）。
 * 比合成后的那一份多一句：羁绊过线之后要换上的那句「看法」。
 */
export interface IntimateBase extends Omit<IntimateProfile, 'parts' | 'view'> {
  /** 底档里每一处存的是**四句**（不是合成后的那一句）—— 见 `IntimatePart` */
  parts: Record<IntimateSlot, IntimatePart>
  /** 初见时她对这件事的看法 */
  view: string
  /** 羁绊过线之后的那一句（关系走到这一步，态度也跟着松了） */
  viewHigh: string
}

/**
 * 私密档案的**动态推进** —— 由约会/私密往来落下（WorldState.intim 的一项）。
 * 与底档的合成规则见 data/intimate.ts 的 `intimateOf`：开发度累加、状态句后写覆盖、
 * `firstBy` 一旦落下即视为已破处，且**只认第一次**（后来的改写不再顶掉它）；
 * `lastAct` / `view` 同样是后写覆盖，但它们说的是「此刻」，不认第一回。
 */
export interface IntimateProgress {
  /** 各部位开发度**增量**（累加到该部底档开发度上） */
  dev?: Partial<Record<IntimateSlot, number>>
  /** 各部位状态改写（后写覆盖**此刻那一档**的句子） */
  state?: Partial<Record<IntimateSlot, string>>
  /** 色情度**增量**（与 dev 同理累加，只是它不挂在哪个部位上） */
  lewd?: number
  /** 破处对象（落下即非处女；只认第一次落下的那个） */
  firstBy?: string
  /** 最近的性行为改写（后写覆盖；说的是此刻发生过什么） */
  lastAct?: string
  /** 「看法」改写（后写覆盖） */
  view?: string
}

/* ============================================================
   贴身衣物（私密档案的第七栏）
   ------------------------------------------------------------
   与私密档案同一性质：**游戏内档案，不是原文考据**（原作不给这些读数）。
   两半：
     · `AttireBase`（data/attire-table.ts）= **底档**：她身上那几件是什么样；
     · `AttireProgress`（`WorldState.attire`）= **推进**：此刻穿到什么程度、
       内裤湿成什么样、最近几次是怎么变的。
   合成规则在 `data/attire.ts` 的 `attireOf`。
   ============================================================ */

/** 两个贴身槽位（顺序即档案上的排列顺序：先内衣，后内裤） */
export type AttireSlot = 'bra' | 'panties'

/**
 * 一件此刻穿到什么程度。三档，**由剧情给**（不是按别处的读数换算出来的）。
 *
 * 它只描述**这一件东西在哪儿**：还穿在身上 / 半褪下来 / 已经离开了身上。
 * 「半褪」落在哪一处，两件各说各的（内衣是解开挂在胸前，内裤是褪到膝弯）——
 * 那几句短语在 `data/attire.ts` 的 `WEAR_PHRASE` 里，与具体是哪一件无关。
 */
export type AttireWear = 'worn' | 'half' | 'off'

/**
 * 底档里的一件：她身上这一件是什么样。
 *
 * `look` **只写物件**（款式 / 颜色 / 材质 / 贴到什么程度），不写她 ——
 * 「衬得她皮肤白」「勾勒出腰线」那一类是反应与评价，不是这一件的样子。
 * 「最近的性行为」那一栏的规矩在这儿同样适用：状态里只写状态。
 */
export interface AttirePiece {
  /** 这一件的名字（「金属线织的白衬衫」）—— 档案与提示条都念它 */
  name: string
  /** 这一件此刻的样子（40–80 字）：款式 / 颜色 / 材质 / 贴身程度 */
  look: string
  /**
   * **只有内裤有这一项**：湿润的四档状态句（`data/attire.ts` 的 `WET_STAGES`）。
   * 与 `look` 同一口径 —— 只写这条内裤此刻的样子（布料、湿到哪儿、看得见的痕迹），
   * 不写她的动作与反应。四句各写各的，逐步递进（干爽 / 潮意 / 洇湿 / 透湿）。
   */
  wet?: readonly string[]
}

/** 一位角色的衣物**底档**（缺某个槽位 = 她身上没有这一件，整条不出现） */
export type AttireBase = Partial<Record<AttireSlot, AttirePiece>>

/** 合成之后一件此刻的读数（上屏用） */
export interface AttirePieceReadout {
  slot: AttireSlot
  /** 这一件的名字 */
  name: string
  /** 此刻穿到什么程度（三档） */
  wear: AttireWear
  /** 那一档的档位词（「穿着」/「半褪」/「褪下」） */
  wearWord: string
  /**
   * 这一件此刻的状态句：穿得整齐时就是 `look` 那一句；
   * 半褪 / 褪下时前面接上那一档的短语（「褪到膝弯」），说的是**同一件东西此刻在哪儿**。
   */
  state: string
  /** 只有内裤有：湿润读数 0–100 */
  wet?: number
  /** 湿润的档位词（干爽 / 潮意 / 洇湿 / 透湿） */
  wetWord?: string
  /** 湿润那一档的状态句 */
  wetState?: string
}

/** 「这一场的变化」里的一条流水（一次落下的变化合成一句） */
export interface AttireLogEntry {
  /** 落下的时刻（Date.now；只用来排序与去重，不上屏） */
  ts: number
  /** 这一句人话（「上衣敞开、内裤褪到膝弯 · 湿润到洇湿」） */
  text: string
}

/**
 * 贴身衣物的**动态推进**（`WorldState.attire` 的一项）。
 *
 * 与私密档案那份推进（`IntimateProgress`）并排，但规矩有两处不同，
 * 都是因为这一栏记的是**此刻**而不是「开发到哪儿了」：
 *   · `wear` 是**后写覆盖**（她可以又穿回去）—— 不是只增不减的账；
 *   · `wet` 是**此刻的读数**，增量允许为负（缓过来了、擦干净了就往下走），夹 0–100。
 * 开发度与色情度是「她这人被开发到哪儿了」，所以只增不减；湿润不是那一类。
 */
export interface AttireProgress {
  /** 某一槽位此刻穿到什么程度（后写覆盖；缺省 = 底档那一档 = 穿着） */
  wear?: Partial<Record<AttireSlot, AttireWear>>
  /**
   * 湿润读数的**增量**（可以为负：缓过来了就回落）。夹在 0–100。
   *
   * 另有一条耦合写在 `mergeAttire` 里：同一次里色情度涨了，湿润跟着涨一半
   * ——「因为发情而湿润」是这条读数的来路之一，不必让模型把同一件事报两遍。
   */
  wet?: number
  /** 「这一场的变化」流水（新的在前，封顶 `ATTIRE_LOG_MAX` 条） */
  log?: AttireLogEntry[]
}

/** 合成之后：这一刻她身上那几件（上屏与提示词共用这一份） */
export interface AttireProfile {
  /** 只有底档里有的槽位，按 `ATTIRE_SLOTS` 的顺序 */
  pieces: AttirePieceReadout[]
  /** 内裤那一件的湿润读数（她没有内裤这一件时为 null） */
  wet: number | null
  /** 湿润档位词（同上） */
  wetWord: string
  /** 流水（新的在前） */
  log: AttireLogEntry[]
}

/* ============================================================
   次数统计 · 关系档位（私密那一档的另外两本账）
   ------------------------------------------------------------
   与私密档案同一性质：**游戏内档案，不是原文考据** —— 原作不给这些读数。
   两者都与 `WorldState.intim` 并列住进世界状态：
     · `acts` —— **只增不减**的一本次数账（谁、哪一栏、加了几回）；
     · `rel`  —— **关系档位**，由剧情给（不是按读数换算出来的），可以上下挪。
   ============================================================ */

/**
 * 次数的八个栏位。
 *
 * 前七栏按**她做了什么**分，最后一栏按**他怎么收的**分 —— 所以
 * 「内射」与「性交 / 肛交」是各记各的：同一次里可以两栏同时加一，
 * 也可以只有交合而没有内射。八栏互不换算、互不推导，一格一格记。
 */
export type ActKind = 'kiss' | 'oral' | 'sex' | 'anal' | 'hand' | 'foot' | 'breast' | 'creampie'

/** 一名角色的次数账（累加值；没记过的栏位整项不出现，不写 0） */
export type ActCount = Partial<Record<ActKind, number>>

/**
 * 关系档位 —— 由**剧情**给的九级梯子（`data/rel.ts` 是唯一定义处）。
 *
 * 「按照剧情给予」是这一栏的规矩：它**不从羁绊读数换算**（羁绊是读数，
 * 这一栏是两个人之间到底走到哪儿了）。导演在剧情真走到那一步时才给一次
 * `PlotDirective.rel`，给的是**此刻的档位**（绝对值）—— 所以可以往上走，
 * 也可以因为一场翻脸往回掉。
 */
export type RelId =
  | 'stranger'   // 萍水
  | 'known'      // 认得
  | 'friend'     // 朋友
  | 'close'      // 亲近
  | 'heart'      // 交心
  | 'lover'      // 恋人
  | 'mate'       // 情人（身体关系已经发生且持续）
  | 'exclusive'  // 独占
  | 'pledged'    // 誓约

/** 持久化世界状态（随存档读写 · 全部为可增删变量） */
export interface WorldState {
  /**
   * 与原著基准的偏差量（操作员抉择累积）。
   *
   * 这是好感的**唯一来源**：主角在对话里做了什么，这里就加减多少。
   * 它不从进度来、不从别的任何地方来 —— 什么都不做就是 0。
   */
  offset: Record<string, number>
  /**
   * 已被事件**锁定**的好感（角色 id → 锁定的值）。
   *
   * 由事件的 `lock` 写入（见 `TimelineEvent.lock`）：那件事发生之后，
   * 这段关系就再也回不去了 —— 此后不论主角再做什么（包括说错话扣分），
   * 读出来都是这个值。锁定值优先于 `offset`，且只增不减：
   * 已被锁过的角色再撞上更低的锁定值，取高的那个。
   */
  locked?: Record<string, number>
  /** 剧情推进标记 / 抉择分支标志（布尔或档位） */
  flags: Record<string, FlagValue>
  /** 已遇见（解锁档案）的角色 id */
  met: Record<string, true>
  /** 已登记进图鉴的实体 id（剧情推进自动登记 / 操作员手动登记） */
  ends: Record<string, true>
  /** 操作员自记实体 */
  own: OwnEndEntry[]
  /**
   * 各事件段**此刻**在场的人：段 id → 角色 id 列表。
   *
   * 由导演在事件指令里实时修正（`PlotDirective.cast`）—— 事件的静态名册
   * （`TimelineEvent.cast`，见 lib/cast.ts）说的是「这一段大体上有谁」，
   * 可这一段里人会走会来：谁先离席、谁刚赶到，右栏得跟着变，不能等到下一段。
   * **没给过的段没有这一项**，那时右栏照静态名册摆（`rosterRowsOf`）。
   */
  cast?: Record<string, string[]>
  /** 已归档的「记录」（事件收束后追加；旧档缺此字段由 hydrate 回填 legacy） */
  records: WorldRecord[]
  /**
   * 私密档案的推进（角色 id → 各部位开发度增量 / 状态改写 / 破处对象）。
   * 由约会与私密往来落下（PlotDirective.intim）；旧档没有这一栏 → 空表，
   * 底档照常可读，只是没有推进的痕迹。
   */
  intim?: Record<string, IntimateProgress>
  /**
   * **贴身衣物**（角色 id → 这两件此刻的状态与流水）。由约会与私密往来落下
   * （`PlotDirective.attire`）。
   *
   * 与 `intim` 并排住进同一页私密档案，但它是**此刻的读数**而不是账：穿着档位
   * 后写覆盖（她可以又穿回去），湿润的增量可正可负（缓过来了就回落）。
   * 旧档没有这一栏 → 空表，两件照底档读作「穿着」、湿润读作 0（干爽）。
   */
  attire?: Record<string, AttireProgress>
  /**
   * **次数账**（角色 id → 八栏累加值）。由约会与私密往来落下（`PlotDirective.acts`）。
   *
   * **只增不减**：导演给的是一次一个增量（`{ "kiss": 1 }` 这种），由 `mergeActs`
   * 加到同名栏位上；旧档没有这一栏 → 空表，八栏全读作 0。
   */
  acts?: Record<string, ActCount>
  /**
   * **关系档位**（角色 id → 档位 id）。由剧情给（`PlotDirective.rel`）——
   * 给的是**此刻的档位**（绝对值，不是增量），所以可以上下挪。
   * 旧档没有这一栏 → 空表，档案上读作「尚未定下」。
   */
  rel?: Record<string, RelId>
  /**
   * **自由活动**（卷与卷之间的空档 / 操作员自己按下的那一枚开关）。
   *
   * 开着的时候推进**不照大纲走**，想干什么都行（闲逛、找人说说话、接个任务、
   * 赴一场约、私密往来）—— 但有一条硬规矩：**好感一律不动**。
   *
   * 这条规矩不是在提示词里求模型别给，是在落地那一层拦住的
   * （见 lib/plot.ts 的 `applyDirective` 第三个参数 `freezeBond`）：
   * 提示词只是把话说明白，免得模型白写一段。羁绊只从主线长出来 ——
   * 这是「自由时间里刷不出好感」这句设计意图的落点。
   *
   * 开发度 / 次数账 / 关系档位都不受影响：那些走各自的账，
   * 一场赴约该记的照记。**只有羁绊这一条线不在这儿长。**
   */
  free?: boolean
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
