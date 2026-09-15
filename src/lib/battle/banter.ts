/* ============================================================
   战斗语音 · 台词池与联动台词
   ------------------------------------------------------------
   四件事：
     1. **多说几句**。同一手技能不该每次都是同一句话 —— 每个技能可以有
        一组台词，出手时挑一句（按「这一手是谁打的、打的是谁、结果如何」选）。
     2. **联动台词**。熟人之间接得上：上一个人刚出了什么手，下一个人的台词
        就不是常态那一句。心叶甩完一招，露娜接话的语气和陌生人完全不同 ——
        「认识的、熟悉的角色才有的特殊台词」。
     3. **每一句都得是哪一场都用得上的**。战斗语音是照着**这一场**在打的时候说的，
        不是从某一幕里搬出来的旁白 —— 一句台词要是只在「那一场」成立（点着谁的名字、
        说着当时才对得上的事），它一挪到别的仗里就突兀。所以本表里的句子一律：
       **不点队友的名字、不指某一场、不带一段叙事**；点名与关系全交给下面的联动表，
        它本来就看得见「谁在场、刚才谁出的手」。
     4. **这一池只服务我方名册**。敌阵说它自己那一手的话（写在技能自带的那一句上）——
        哪怕对面站着的是同名的那一位（`bosses.ts` 里的首领与名册共用 id），
        也不该拿这里的池子去换掉她那一手的台词。闸在 `engine` 的 `pushLog` 里。

   熟悉与否不发散判定，只看既有关系：
     · 羁绊（PAIRS：黄金狮子 / 如散文般 / 婚约者）
     · 同队（ROSTER_GROUPS 里的同一编制，含恋兔队）
     · 本场成立的队伍羁绊（synergy.ts 的 traitsOf）
   台词一律按原文关系写（称呼、口癖、相处方式），不新造设定。

   ⚠️ 这些句子**不是引文**。从正文整句搬来的（「天上天下唯我独尊」那一类）照旧逐字；
   其余是照各人的口癖与专名新写的战斗短句 —— **别把它们当原文引用**，
   档案 / 词条 / 世界书里要引原文，另找逐字出处。
   ============================================================ */

import { OPERATOR_ID } from '../../data/castmeta'
import { ROSTER_GROUPS } from '../../data/roster'
import { PAIRS } from './synergy'

/** 事件（本次出手）的上下文 —— 只取判定台词要用到的那几样 */
export interface BanterCtx {
  actorId: string
  /**
   * 刚才出手的队友（同阵营，新的在前，不含自己）。
   * 看最近几手而不是只看上一手：接话是「顺着前一手说」，
   * 中间夹着敌方回合或第三人时，仍然接得上。
   */
  recent?: Array<{ id: string; skill: string }>
  /** 这一手打出去了多少（0 = 没造成伤害） */
  dmg?: number
  /** 这一手把目标打倒了 */
  down?: boolean
  /** 打空了 */
  miss?: boolean
}

/* ---------- 1. 台词池：同一个技能，多句可选 ---------- */

/**
 * 按**技能 id** 精确指定的备选台词。
 * 键取技能 id 而非招式名 —— 名册的技能 id 是稳定的。
 *
 * ⚠️ 登进来的那一手，**技能自带的那一句就不进池了**（见 `poolFor`）：
 * 这一手的台词以这里为准。所以给某一手写池子时，想留的那句原文要自己抄进来。
 * 登记它的理由只有两条：① 这一手是这一位的招牌，值得单开一组；
 * ② 技能自带的那句只在某一幕成立（整段对白、某一场的指挥口令、对着某个人的话），
 * 一挪到别的仗里就不对了 —— 这一类必须补一组通用的。
 */
export const LINE_POOL: Record<string, string[]> = {
  /* —— 招牌那几手 —— */
  'hikari-burst': ['「要上了——解封。」', '「久违了，这种开放感。」', '「——只要我还活着，就不会让你伤害到大家——！」'],
  'hikari-peer': ['「就此——结束吧！！」', '「——樱之残影。」', '「给我像星屑一样，灰飞烟灭吧！」'],
  'luna-blade': ['「你这家伙！恶心死了！去死！」', '「别挡路。」', '「线，收紧了。」'],
  'mefisa-cannon': ['「走吧，八脚马！」', '「……哼。在那里吗！」', '「吞噬我吧，我的爱马！」'],
  'nyau-void': ['「没问题！小柴对力量很有自信！」', '「是！小柴保证完成任务！」', '「那里没有声音哦。因为是真空。」'],
  'alive-edit': ['「——你要不要成为我的猎犬？」', '「这一页，我替你写。」', '「已经发生过的事，我可以再写一遍。」'],
  'kuro-burst': ['「你的影子，我收下咯。」', '「来吧……沙与风！」', '「像你这样的终末，我绝不饶恕。」'],

  /* —— 自带的那句是「某一幕」的，这一组是挪到哪一场都能说的 —— */
  // 弗恩：原句是「死灵次元」那一战的通讯与全军部署口令（`data` 里那句七十多字）
  'vern-scan': ['「查到了。」', '「弱点在这里。」', '「数据不会说谎。」'],
  'vern-dispatch': ['「全军，按这个走。」', '「坐标已经发下去了。」', '「这一手，够用了。」'],
  'vern-end': ['「你们的命，我会用得最有效率。」', '「奇迹的概率，我来抬。」', '「算到底了。」'],
  // 琳：原句是在解释「爪」的来历（对着那一场的对手说的）
  'xiaochai-pierce': ['「解析完毕。切开。」', '「这堵墙，挡不住我。」', '「爪——横断。」'],
  // 伊西斯：原句是天空竞技祭的那一段实况播报
  'isis-scoop': ['「这条新闻，我收下了☆」', '「拍到了☆」', '「真相可不会等你。」'],
  'isis-live': ['「实况解说——开始！」', '「请看这里☆」', '「这是直播哦☆」'],
  'isis-end': ['「这是十分钟前的记录世界♪」', '「头版，我拿定了。」', '「定格。」'],
  // 达娜厄：原句点着艾梅的名字（那一场才成立）
  'danae-mode': ['「认真模式SSS。」', '「我，要动真格了。」', '「变身——三分钟，够了。」'],
  // 蕾雅 / 菲德拉：原句点着心叶（那一场才成立）
  'reiya-end': ['「这首曲子，是我回忆里的歌。」', '「——直到最后一刻，我都会唱歌。」'],
  'phidra-end': ['「赌局——结算。」', '「你真是个奇怪的人。好啊，来吧。」', '「我押上了全部。」'],
  // 伊=雷格：原句是护着某人时说的半句（那一场才成立）
  'yiregel-ward': ['「不行。你必须要活下去……」', '「龙的加护，分给你们。」'],
  // 吴诗涵 / 艾梅 / 奈奈：原句整段是设定说明或长篇号召
  'youshihan-end': ['「四大凶兽——全开。」', '「这就是我的四重人格。」', '「出来吧。随你们挑一个。」'],
  'emei-end': ['「以评议会之名——总攻。」', '「刀锋所向，无人可挡。」'],
  'nana-end': ['「掂量完毕——就这样结束吧。」', '「『大麻烦』的能力，可不止增重。」'],
  // 草次郎 / 乃梦 / 玛丽娅：原句点着心叶、或拖着后半段
  'touyi-daily': ['「守住日常。就这一件事。」', '「大家都还好好的，那就够了。」'],
  'huda-end': ['「终局，我已经读完了。」', '「结束了。」'],
  'maria-end': ['「来吧——『天下无双的公主大人』！」', '「这是最后一曲。」'],
}

/**
 * 按**角色**写的备选台词。
 * 招式 id 会随时期变（操作员的手枪与戒指各是一份表），角色却是同一个人 ——
 * 所以「这个人平时怎么说话」挂在这里，同一手每次挑一句，不至于句句复读。
 *
 * 名册二十四位一人一组，外加操作员。每组三到四句，条条都是**任何一场都说得出口**的
 * 战斗短句（见头注第 3 条）—— 谁的名字都不点，谁的场都不指。
 */
export const CHAR_LINES: Record<string, string[]> = {
  [OPERATOR_ID]: [
    '「——破坏掉。」',
    '「上了。」',
    '「还站得住。」',
    '「不会让你再往前一步。」',
  ],
  hikari: [
    '「区区神明，别太嚣张了！」',
    '「要上咯，我的吉他——」',
    '「这种程度，连热身都算不上。」',
    '「因为这个世界有这么美丽的我存在。」',
  ],
  luna: [
    '「……啧。麻烦死了。」',
    '「这种活，还是交给我吧。」',
    '「放心，我的线没那么容易断。」',
    '「抽完这根就来收尾。」',
  ],
  mefisa: [
    '「任务了解。开始吧。」',
    '「对手的下一步，已经读到了。」',
    '「八脚马，展开。」',
    '「笨蛋。就凭这样也想拦住我们？」',
  ],
  nyau: [
    '「小柴上了！喵！」',
    '「沙姆希尔，拜托了！」',
    '「小柴才不会输呢！」',
    '「那种程度的终末，根本小菜一碟！」',
  ],
  youshihan: [
    '「……呼啊。还没睡够呢。」',
    '「出来吧——四大凶兽。」',
    '「随便挑一个吧。反正都差不多。」',
    '「只要没有人受伤，那就好了。」',
  ],
  'alive-anatolia': [
    '「——跪下。」',
    '「这一页，我替你写。」',
    '「如散文般——有时亦如诗歌。」',
    '「真乖。」',
  ],
  'vern-simon': [
    '「已经算完了。」',
    '「按我的指示动。」',
    '「这一手，在我的预料之内。」',
    '「去死。」',
  ],
  'xiaochai-lin': [
    '「少啰嗦。本小姐很忙。」',
    '「爪——动手。」',
    '「这种程度，不值得我站起来。」',
    '「算完了。你没有下一步了。」',
  ],
  'danae-whitmore': [
    '「黑锤——落下！」',
    '「我、我会挡住的……！」',
    '「认真模式SSS——开始。」',
    '「别小看『黑锤部队』的队长。」',
  ],
  'nana-kamiru': [
    '「『大麻烦』——增重！」',
    '「少看不起人了！」',
    '「抱歉，这一下会很重。」',
    '「掂量完毕。就这样结束吧。」',
  ],
  reiya: [
    '「——热沃当的少女！」',
    '「正确就是正确。所以我不会退。」',
    '「请交给我吧！」',
    '「喝啊啊啊啊！」',
  ],
  emei: [
    '「失礼了。」',
    '「以评议会之名——总攻。」',
    '「这一刀，只为守护而挥。」',
    '「退下吧。这是忠告。」',
  ],
  'isis-halid': [
    '「——号外号外！」',
    '「这是独家新闻☆」',
    '「绝对公平——取材开始！」',
    '「拍下来了哦☆」',
  ],
  katherine: [
    '「振翅高飞！」',
    '「拔枪！刺剑！」',
    '「我，想要变强。」',
    '「这点伤，只会让我更强。」',
  ],
  'alex-cave': [
    '「喂喂，就这？」',
    '「让我把你打个稀巴烂。」',
    '「午夜——降临！」',
    '「内脏什么的，挪一下就行了。」',
  ],
  phidra: [
    '「让我们来一场好比赛吧。」',
    '「赌注，我押上。」',
    '「这一手，我见过。」',
    '「世界正处于毁灭的边缘。理所当然吧？」',
  ],
  maria: [
    '「请多多支持我哦！」',
    '「——我将赌上性命，放声歌唱。」',
    '「来听最后一句吧♡」',
    '「音乐，开始！」',
  ],
  'merwen-gray': [
    '「贵安。」',
    '「落点，我选好了。」',
    '「你跑不掉的。」',
    '「愚者的足迹——终点。」',
  ],
  ameria: [
    '「我会让所有人，都获得幸福。」',
    '「别担心。我来代替你们思考♡」',
    '「我，无处不在哟♡」',
    '「把一切都交给我吧♡」',
  ],
  'kuro-no-maou': [
    '「吾乃魔王。」',
    '「来吧——沙与风！」',
    '「像你这样的终末，我绝不饶恕。」',
    '「世界不需要像你这样的东西。」',
  ],
  yiregel: [
    '「抱歉吓到你了。」',
    '「这是合理的结论。」',
    '「妨碍她的所有人，全都一样。」',
    '「——『视死苔生』。」',
  ],
  'touyi-caojiro': [
    '「别太用力嘛。」',
    '「——别给我装什么正义的伙伴啊。」',
    '「开开心心地过日子，不就好了吗？」',
    '「守住日常。就这一件事。」',
  ],
  'huda-nayume': [
    '「别动。你已经被算死了。」',
    '「——少女总得有点秘密嘛。」',
    '「我会好好照顾你的☆」',
    '「碍事的话，就让开。」',
  ],
  'yuina-yoshito': [
    '「看着——我啊！」',
    '「眼前有强的家伙不挑战，那还算男人吗。」',
    '「哼。你想太多了。」',
    '「我啊，从小就直觉很准。」',
  ],
}

/* ---------- 2. 联动台词：熟人接得上 ---------- */

interface FollowLine {
  /** 谁接话（角色 id） */
  by: string
  /** 前一手是谁打的；'*' = 只要是这个人就行 */
  after: string
  /** 前一手技能 id 的正则（缺省 = 任意一手） */
  skill?: RegExp
  /** 这一手是不是「打空了 / 没打出伤害」才说的 */
  when?: 'hit' | 'miss' | 'any'
  /** 接的这句 */
  line: string
}

/**
 * 联动台词表。写的是「上一个人刚做了什么 → 这个人接什么」，
 * 关系取自原文（婚约、契约、队长与副官、搭档），不是随机搭对。
 *
 * 语气可以带关系，句子仍然要短 —— 它出现在战斗记录里，只占一行。
 * 谁在场由 `recent` 保证：前一手不是表里那个人的时候，这一条根本不会响，
 * 所以「点着某个人的名字说」在这里是安全的。
 */
const FOLLOW: FollowLine[] = [
  /* 心叶 → 露娜：黄金狮子，一个把她甩出去、一个在半空听对方的心声 */
  { by: 'luna', after: OPERATOR_ID, skill: /读心|低语/, when: 'any', line: '「集中精神，小主人！」' },
  { by: 'luna', after: OPERATOR_ID, when: 'hit', line: '「干得漂亮，小主人。」' },
  { by: 'luna', after: OPERATOR_ID, when: 'miss', line: '「小主人！没事吧？」' },
  /* 露娜 → 心叶 */
  { by: OPERATOR_ID, after: 'luna', when: 'any', line: '「上吧，露娜小姐！」' },
  { by: OPERATOR_ID, after: 'luna', when: 'hit', line: '「……漂亮，露娜小姐。」' },
  /* 心叶 → 会长：如散文般 */
  { by: 'alive-anatolia', after: OPERATOR_ID, when: 'any', line: '「好啊。到那时，就停战吧。」' },
  { by: 'alive-anatolia', after: OPERATOR_ID, when: 'miss', line: '「——言万同学。跪下来。」' },
  { by: OPERATOR_ID, after: 'alive-anatolia', when: 'any', line: '「咕呜呜……完全被玩弄了。」' },
  /* 心叶 → 黑之魔王：婚约者 */
  { by: 'kuro-no-maou', after: OPERATOR_ID, when: 'any', line: '「心叶。我们结婚吧。」' },
  { by: 'kuro-no-maou', after: OPERATOR_ID, when: 'hit', line: '「你可是勇者哦。怎么能哀求啊。」' },
  { by: OPERATOR_ID, after: 'kuro-no-maou', when: 'any', line: '「……魔王。是你吗？」' },
  /* 恋兔队内部：队长 / 副官 / 护卫 / 小柴琳 */
  { by: 'hikari', after: 'mefisa', when: 'any', line: '「梅芙，后面交给你了！」' },
  { by: 'mefisa', after: 'hikari', when: 'any', line: '「——真正的决胜时刻，从现在开始。」' },
  { by: 'nyau', after: 'hikari', when: 'any', line: '「队长！小柴绝对要赢！」' },
  { by: 'hikari', after: 'nyau', when: 'any', line: '「不错嘛，小柴。」' },
  /* 八脚马 ↔ 沙姆希尔：探索与归还，本来就是一对 */
  { by: 'nyau', after: 'mefisa', when: 'any', line: '「沙姆希尔，拜托了！」' },
  { by: 'mefisa', after: 'nyau', when: 'any', line: '「坐标收到。」' },
  { by: 'xiaochai-lin', after: 'mefisa', when: 'any', line: '「──把那家伙扯下来痛扁一顿。」' },
  { by: 'mefisa', after: 'xiaochai-lin', when: 'any', line: '「就这样把他拖进海里！」' },
  { by: 'mefisa', after: OPERATOR_ID, when: 'any', line: '「言万同学，配合我！」' },
  { by: OPERATOR_ID, after: 'mefisa', when: 'any', line: '「了解！」' },
  /* 恋兔光 ↔ 露娜：同一所学园里长起来的战友 */
  { by: 'luna', after: 'hikari', when: 'any', line: '「那你想怎样？！要放弃吗？！」' },
  { by: 'hikari', after: 'luna', when: 'any', line: '「天上天下唯我独尊！」' },
  /* 苍之学园学生会：会长与鬼之副会长 */
  { by: 'vern-simon', after: 'alive-anatolia', when: 'any', line: '「遵命。」' },
  { by: 'alive-anatolia', after: 'vern-simon', when: 'any', line: '「按计划来。」' },
  { by: 'youshihan', after: 'hikari', when: 'any', line: '「年轻人真有精神啊……」' },
  /* 卡乌斯学院：黑锤的队长与心腹 / 琉米爱尔姐妹 / 记者 */
  { by: 'nana-kamiru', after: 'danae-whitmore', when: 'any', line: '「交给我吧，队长。」' },
  { by: 'danae-whitmore', after: 'nana-kamiru', when: 'any', line: '「奈奈，掩护我。」' },
  { by: 'emei', after: 'reiya', when: 'any', line: '「别担心，蕾雅。」' },
  { by: 'reiya', after: 'emei', when: 'any', line: '「姐姐——！」' },
  { by: 'isis-halid', after: 'reiya', when: 'any', line: '「出发吧——号外号外。」' },
  { by: 'reiya', after: 'isis-halid', when: 'any', line: '「好的！——热沃当的少女！」' },
  { by: 'isis-halid', after: 'emei', when: 'any', line: '「副议长，这条我要写进头版。」' },
  { by: 'emei', after: 'isis-halid', when: 'any', line: '「随你写。」' },
  /* Corporations：警备队长与她的部下 / 互为仇敌的那两位 */
  { by: 'alex-cave', after: 'katherine', when: 'any', line: '「来吧，大姐。让我打个稀巴烂。」' },
  { by: 'katherine', after: 'alex-cave', when: 'any', line: '「跟上，亚历克斯。」' },
  { by: 'phidra', after: 'alex-cave', when: 'any', line: '「亚历克前辈。」' },
  { by: 'alex-cave', after: 'phidra', when: 'any', line: '「别碍事啊，菲德拉。」' },
  { by: 'merwen-gray', after: 'maria', when: 'any', line: '「唱吧。我来开道。」' },
  { by: 'maria', after: 'merwen-gray', when: 'any', line: '「格蕾，我唱了哦。」' },
  { by: 'phidra', after: 'ameria', when: 'any', line: '「艾美莉亚。我否定你。」' },
  { by: 'ameria', after: 'phidra', when: 'any', line: '「……你真是让人无法理解呢♡」' },
  { by: 'merwen-gray', after: 'katherine', when: 'any', line: '「队长。」' },
  /* 噬鯱者：乃梦姐 / 草次郎 / 义人 */
  { by: 'touyi-caojiro', after: 'huda-nayume', when: 'any', line: '「乃梦姐，交给我吧。」' },
  { by: 'huda-nayume', after: 'touyi-caojiro', when: 'any', line: '「别死了啊。」' },
  { by: 'yuina-yoshito', after: 'touyi-caojiro', when: 'any', line: '「草次郎，别挡道。」' },
  { by: 'touyi-caojiro', after: 'yuina-yoshito', when: 'any', line: '「打完了记得去吃饭。」' },
  { by: 'huda-nayume', after: 'yuina-yoshito', when: 'any', line: '「碍事的话，我就宰了你。」' },
]

/**
 * 同一编制里的都算熟悉（恋兔队、苍之学园、卡乌斯、Corporations，
 * 外加下面那一行手工补的：操作员）。
 *
 * 操作员不在 `ROSTER_GROUPS` 里 —— 那张表列的是**可编入的档案角色**，
 * 他是主角、自己一条线。可他实实在在是恋兔队的人（宿舍、副官、同班），
 * 不补这一行，「心叶 ↔ 梅芙」这种同队接话一次都响不了：
 * `familiar` 认不出他们同编制，联动表里写好的那几条就全是死条。
 */
const GROUP_OF: Record<string, string> = (() => {
  const m: Record<string, string> = { [OPERATOR_ID]: 'ao' }
  for (const g of ROSTER_GROUPS) for (const id of g.ids) m[id] = g.key
  return m
})()

/** 熟人：婚约 / 羁绊 / 同一编制，三者之一即可 */
export function familiar(a: string, b: string): boolean {
  if (!a || !b || a === b) return false
  if (GROUP_OF[a] && GROUP_OF[a] === GROUP_OF[b]) return true
  return PAIRS.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))
}

/* ---------- 3. 挑句子 ---------- */

let seed = 0
/** 出手时的随机挑句：同一手不总说同一句，但也不必可复现（战斗本就带骰） */
function pick(pool: string[], key: string): string {
  seed = (seed + 1) % 9973
  const i = Math.floor(Math.random() * pool.length) + key.length + seed
  return pool[i % pool.length]
}

/**
 * 这一手该说什么。
 * 优先联动台词（熟人接得上），其次技能自己的台词池，最后回落到原台词。
 * @param ctx 出手上下文
 * @param base 技能自带的台词（无池或池里为空时用它）
 */
/** 最近几手之内有没有谁的接话能用上（新的优先） */
const RECENT_LOOKBACK = 3

export function lineFor(ctx: BanterCtx, base: string): string {
  const { actorId, recent, dmg, miss } = ctx
  const outcome: 'hit' | 'miss' = miss || !dmg ? 'miss' : 'hit'

  for (const r of (recent ?? []).slice(0, RECENT_LOOKBACK)) {
    if (!familiar(actorId, r.id)) continue
    const hit = FOLLOW.filter(
      (f) => f.by === actorId && (f.after === r.id || f.after === '*') && (!f.skill || f.skill.test(r.skill)),
    )
    if (!hit.length) continue
    const exact = hit.filter((f) => f.when === outcome)
    const any = hit.filter((f) => !f.when || f.when === 'any')
    const pool = exact.length ? exact : any.length ? any : []
    if (pool.length) return pick(pool.map((f) => f.line), actorId)
  }
  return base
}

/**
 * 台词池里给这一手挑一句。
 * 这一手专写过（LINE_POOL）就以那儿为准 —— **技能自带的那句不进池**：
 * 给某一手登记台词的理由，本来就是因为原来那句只在某一幕成立（见 LINE_POOL 头注），
 * 再把原句掺回去，等于没改。想留的那句原文，抄进池子里就是。
 * 没专写过才回落到这个人的常驻几句，这时候技能自带的那一句仍然算一手 ——
 * 它是这一手自己的话，留着。
 */
export function poolFor(actorId: string, skillId: string, base: string): string {
  const own = LINE_POOL[skillId]
  if (own?.length) return pick(own, skillId + actorId)
  const pool = CHAR_LINES[actorId]
  if (!pool?.length) return base
  return pick(base ? [base, ...pool] : pool, skillId + actorId)
}
