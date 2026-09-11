/* ============================================================
   指名首领 —— 档案里的那个人，站到对面来
   ------------------------------------------------------------
   作战板上的敌人平时是「观测体」：按危险度与地点 R 值现推的通用件，
   名字是「未分类观测体 甲 · 精英」这种临时挂牌。
   但正文里有好几场，对面站的是**有档案、有 RANK、有武装**的真人 ——
   第 2 卷天空竞技祭的先锋 / 中坚 / 副将三战是最典型的一批：
   小柴对的是 RANK47 梅尔文・格蕾，梅芙对的是亚历克斯・凯夫，
   心叶对的是 RANK14 菲德拉・雷诺兹。他们不是「观测体」，
   是终末停滞委员会的同行、Corporations 的代表选手。

   所以这个文件把那一类对手**单独写出来**：
     · 五轴取 roster 的档案读数（与档案页同一个数，不另编）
     · 技能是这个人自己的手（不是通用件 + 机制包），带他自己的台词
     · 到达点兼任他的「终结技能」：照样蓄势、照样可以被打算
   任务只要挂上 bossId，derive 就会把场上的头一名换成他。

   规则：这里的每一个名字、每一句台词、每一手机制，都得从
   arms.ts（武装考据）/ sidecast.ts（人物页）/ chars.ts 里取，
   一个字都不许新造。写不出来就说明这一手没有原文依据，不该有。
   ============================================================ */

import { place } from './atlas'
import type { AxisKey, PassiveSpec, SkillSpec } from './types'
import { TUNING } from './tuning'

export interface NamedBoss {
  /** 档案 id —— 与 roster / sidecast / 档案页同一套键 */
  id: string
  /** 战场名牌（挂在他头上的那一行） */
  name: string
  sigil: string
  hue: string
  /** 战斗定位（在这个人身上是什么） */
  cls: string
  /** 一行：他为什么站在这里 */
  trait: string
  /** 危险度之外的额外血量倍数（1 = 就是一个标准首领） */
  hpMul: number
  /** 五轴。缺省取 roster 的档案读数 */
  axes?: [number, number, number, number, number]
  /** 被动（有原文依据的才写） */
  passive?: PassiveSpec
  /**
   * 破绽：他怕哪条轴（对上这条轴才削得动那层护盾，削穿停一拍、挨打加成）。
   * 缺省 = 不进破绽那一套 —— 「打不穿的反现实实体」得由设定说了算，
   * 不能给每个对手都糊一层，否则「读懂它怕什么」会变成普遍作业而不是判断。
   */
  guardAxis?: AxisKey
  /** 破绽点数（缺省按档位给：精英 3 / 首领 5） */
  guardPts?: number
  /** 四手：普攻 / 技能两手 / 到达点（到达点兼任他的终结技能） */
  skills: SkillSpec[]
  /** 出处：为什么这一场该由他站（注释口径，界面不显示） */
  from: string
  /**
   * 他唤上场的**是谁**（档案 id，依次喊出）。
   *
   * 与 derive 那记通用的「成形体诱出」不是一套东西：那一记喊的是这片现实里
   * 现推的半成形杂兵，随便哪个首领与精英都带得动；这一栏喊的是**真正站在对面的人** ——
   * 五轴、技能表、被动照搬本人，一个字不改（见 derive 的 rivalOf）。
   * 所以它只写在「对面来的不是观测体」的那几位身上。
   *
   * 名单里的 id 依次出场，喊到第几个由场上已有的同行者数决定（见 engine 的 summonFoe）——
   * 不用另存一份进度：s.enemies 只增不减，数一遍就是进度。
   */
  summonPack?: string[]
  /**
   * 第一阶段倒下之后接上来的那一位（档案 id）。
   *
   * 「经过剧情还有第二阶段」在引擎里的落点就是这一栏：本体一倒，
   * 他的亡灵军团跟着散，场上清空的那一拍由这一位顶上（见 engine 的 phaseTwo）。
   * 不写就没有第二阶段 —— 绝大多数指名首领只打一场。
   */
  next?: string
}

/* —— 把小品手接上「首领的终结技能」这套机制 ——
   首领那记大招不占常规出手，是自己在心跳里蓄、被打断就哑掉（见 engine 的咏唱三段）。
   指名首领的到达点就是他的那一记 —— 所以在这里补上蓄势字段。 */
function asUlt(k: SkillSpec): SkillSpec {
  return { ...k, ult: TUNING.ultCharge, ultBreak: TUNING.ultBreak }
}

export const NAMED_BOSSES: Record<string, NamedBoss> = {
  /* ============================================================
     第 2 卷 · 天空竞技祭 代表战
     ============================================================ */

  'merwen-gray': {
    id: 'merwen-gray',
    name: '梅尔文・格蕾 · Corporations 先锋',
    sigil: '格',
    hue: '#7fd1c4',
    cls: '传送门游击',
    trait: '弹痕「愚者的足迹」—— 门开在哪里，她的下一步就在哪里。'
      + '格蕾用它跨越无人岛、跨越战场，也一次次出现在心叶意想不到的身后。',
    hpMul: 1,
    passive: {
      name: '愚者的足迹',
      desc: '「格蕾用它跨越无人岛、跨越战场，也一次次出现在心叶意想不到的身后」'
        + '（arms.ts 武装考据）—— 站在门上的那个人，先手永远是她的。',
      headStart: 0.35,
      evade: 0.08,
    },
    skills: [
      place('basic', {
        id: 'boss-merwen-basic', name: '愚者的足迹 · 错身', axis: '破坏力', power: 1.6,
        fx: 'slash',
        desc: '从身后那道门里出来的一击：不是正面接下的，是背后递到的。',
        effect: { pushBack: 0.25 },
        line: '「呜哇，偏偏被最不想碰上的人搭话了。」',
      }),
      place('连打', {
        id: 'boss-merwen-portal', name: '门径连投 · 砂砾加速', axis: '破坏力', power: 1.3,
        desc: '两道门对着丢：砂砾在门里循环加速，出来就是一场石雨。'
          + '先锋战时她就是靠这一手把对手压得抬不起头。',
        effect: { hits: 2, mark: 0.2 },
        line: '「——这一手，我可是练了很久的。」',
      }),
      place('提速', {
        id: 'boss-merwen-step', name: '无人岛的一步', axis: '敏捷度',
        desc: '一步跨过整片战场：门开在自己脚下，关在对手面前。',
        effect: { spdUp: 0.5, pushBar: 0.4, evade: 0.15 },
        line: '「别眨眼哦。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-merwen-end', name: '愚者的足迹 · 无人岛的尽头', axis: '破坏力', power: 4.8,
        desc: '把对手身后那条退路整个换成一颗砂砾：门一开，人就到了没人到过的地方。'
          + '外传话 4 里她与心叶被卷进的那场以数年计的「无人岛人生」，就是从这一步开始的。',
        effect: { pierce: true, pushBack: 0.6, stasis: 1 },
        line: '「那么——你打算怎么回去呢？」',
      })),
    ],
    from: 'v2-5 先锋战 · 废校（小柴喵呜 对 格蕾）',
  },

  maria: {
    id: 'maria',
    name: '玛丽娅 · Corporations 次锋',
    sigil: '玛',
    hue: '#d98fb0',
    cls: '情感系歌者',
    trait: '片羽「天下无双的公主大人」—— 她的歌声就是她的反现实。'
      + '情感入歌的那一类，亲和最高、直面最脆。',
    hpMul: 0.9,
    skills: [
      place('basic', {
        id: 'boss-maria-basic', name: '无双的公主大人 · 音击', axis: '反现实亲和', power: 1.5,
        fx: 'guitar',
        desc: '一段短音压过来：不重，但它直接落在情感上。',
        line: '「听好了——这才是我的歌。」',
      }),
      place('强袭', {
        id: 'boss-maria-aria', name: '祈祷之歌 · 独唱', axis: '反现实亲和', power: 2.5,
        desc: '把整首歌压在一个人身上。次锋战时，穷奇的力被她这一手整个颠倒过来。',
        effect: { mark: 0.25 },
        line: '「我自己也不知道，这首歌唱完之后会怎么样。」',
      }),
      place('治愈', {
        id: 'boss-maria-chorus', name: '祈祷之歌 · 共唱', axis: '反现实亲和',
        desc: '同一首歌拨到和声档：她自己与同伴一起往回长出力气。'
          + '副将战打到最后，她唱的正是这一档。',
        effect: { heal: 0.6, cleanse: true },
        line: '「——大家一起唱吧。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-maria-end', name: '天下无双的公主大人 · 落幕', axis: '反现实亲和', power: 4.4,
        desc: '「玛丽娅现在，正如字面意义上赌上了性命在歌唱」〔v2 第10话〕——'
          + '这一手对她自己也是对全场：唱完，舞台上不留人。',
        effect: { mark: 0.3, slow: 0.2, pushBack: 0.3 },
        line: '「这就是，我的全部了。」',
      })),
    ],
    from: 'v2-5 次锋战（吴诗涵 对 玛丽娅）',
  },

  'alex-cave': {
    id: 'alex-cave',
    name: '亚历克斯・凯夫 · Corporations 中坚',
    sigil: '亚',
    hue: '#8f9bd9',
    cls: '硬质化突击',
    trait: '片羽「午夜降临」——「肉体将变换成为『夜』的形式。其性质表现为硬质化与粒子化。'
      + '但是，心脏不可被转化」〔v2 第8话〕。硬到连导弹都吃得下，但那颗心脏一直是肉做的。',
    hpMul: 1.15,
    passive: {
      name: '午夜降临',
      desc: '「但是，心脏不可被转化」〔v2 第8话〕—— 躯体能硬到什么都能吃，'
        + '唯独那颗心脏始终是肉。所以他的硬不是不死：血薄到一定份上，那一处就露出来了。',
      shield: 0.18,
      lowHpAtk: 0.35,
    },
    skills: [
      place('basic', {
        id: 'boss-alex-basic', name: '午夜降临 · 硬化拳', axis: '破坏力', power: 1.5,
        fx: 'slash',
        desc: '把手臂换成夜的形式再打出去：这一拳比看上去重得多。',
        line: '「——我上了。」',
      }),
      place('坚守', {
        id: 'boss-alex-night', name: '夜之形态 · 硬质化', axis: '物理抗性',
        desc: '整个人散成粒子再凝回来：中坚战时，他独自承受了「摩耶」所受的全部攻击〔v3 第9话〕。'
          + '凝住的那几拍，他就是那面墙。',
        effect: { shield: 0.62, taunt: true },
        line: '「打吧。看看你们能打穿多少。」',
      }),
      place('穿甲', {
        id: 'boss-alex-fist', name: '十米之拳', axis: '破坏力', power: 2.2,
        desc: '「亚历克斯将翅膀的所有体积压缩进右拳……那只拳头的大小——足足超过了10米」'
          + '「那一击，劈开了大海」〔v2 第8话〕。这一手不吃任何减伤。',
        effect: { pierce: true, pushBack: 0.3 },
        line: '「——退开。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-alex-end', name: '午夜降临 · 心脏那一处', axis: '破坏力', power: 5.0,
        desc: '把整场拖进夜里的那一手：1 万米、-55℃ 的高空，躯体会硬，心脏不会。'
          + '他自己也知道这一手的代价在哪里。',
        target: 'all',
        effect: { mark: 0.25, slow: 0.3 },
        line: '「作为交换，我将献出一切！」',
      })),
    ],
    from: 'v2-6 中坚战 · 夜之街（梅芙莉莎 对 亚历克斯）',
  },

  phidra: {
    id: 'phidra',
    name: '菲德拉・雷诺兹 · Corporations 副将',
    sigil: '菲',
    hue: '#c8a2e0',
    cls: '能力复制',
    trait: '片羽「申告虚伪」—— 二十四小时内复制他人的能力。'
      + '但三条硬限制并列：二十四小时的观测窗口、同一时间只能用一种、以及减寿的代价。',
    hpMul: 1,
    passive: {
      name: '申告虚伪',
      desc: '「二十四小时之内，可以复制他人的能力」—— 但也「同一时间只能使用一种」'
        + '（roster 的 SIDE_AXIS_LIMIT 注）。所以她读得越多，越没法同时握住。',
      acc: 0.12,
      evade: 0.06,
    },
    skills: [
      place('basic', {
        id: 'boss-phidra-basic', name: '申告虚伪 · 借来的一手', axis: '破坏力', power: 1.5,
        fx: 'slash',
        desc: '借来的那点东西，用得比本人还顺手。',
        line: '「这一手，我还给你。」',
      }),
      place('牵制', {
        id: 'boss-phidra-read', name: '读心 · 先读', axis: '反现实亲和',
        desc: '副将战里她一直在读心 —— 只是读到的是心叶反侦察摆出来的假货。'
          + '读准了的那几拍，对手的每一步都在她前面。',
        effect: { mark: 0.35, slow: 0.3 },
        line: '「你现在想什么，我全都知道。」',
      }),
      place('连打', {
        id: 'boss-phidra-copy', name: '虚伪申告 · 复写', power: 0,
        desc: '当场挑在场的任意一个角色，照抄他的一手，原样打出来 ——'
          + '抄到位的那一手，和本人打的一样重。'
          + '三条硬限制也在：二十四小时的观测窗口、同一时间只拿得动一手、以及减寿的代价。'
          + '另外门与印记抄不过来（「解封」要那五下启动、「到达点」要自己的印记），'
          + '恋兔的吉他更抄不过来 —— 那把琴只是形状，出力的是她本人。',
        copy: true,
        line: '「你刚才是这么打的吧。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-phidra-end', name: '第二个菲德拉', axis: '破坏力', power: 4.6,
        desc: '副将战的最后：心叶开枪自射太阳穴发动 noapusa，'
          + '变成与她完全相同的「第二个菲德拉」，把「谁是真我」这个问题砸回她自己身上〔v2 第9话〕。'
          + '这一手是她把这个问题照原样打出去。',
        effect: { mark: 0.3, frail: 0.25, pierce: true },
        line: '「——那你说，哪一个才是我？」',
      })),
    ],
    from: 'v2-7 副将战 · 罗马斗兽场（言万心叶 对 菲德拉）',
  },

  /* ============================================================
     其他卷次里站到对面的档案角色
     ============================================================ */

  katherine: {
    id: 'katherine',
    name: '凯特琳・安・奥斯汀 · 企业警备队队长',
    sigil: '凯',
    hue: '#e0b860',
    cls: '越伤越强',
    trait: '片羽「英雄不灭」——「受伤的程度越严重，肉体就会越强大」〔v2 第10话〕。'
      + 'RANK6。她不是越打越弱的那种对手，是越打越重的。',
    hpMul: 1.35,
    passive: {
      name: '英雄不灭',
      desc: '「受伤的程度越严重，肉体就会越强大」〔v2 第10话〕—— '
        + '血线越薄，这只拳头越重。所以对 RANK6 要嘛早早压死，要嘛别拖。',
      atk: 0.1,
      lowHpAtk: 0.8,
    },
    skills: [
      place('basic', {
        id: 'boss-katherine-basic', name: '英雄不灭 · 雷速拳', axis: '破坏力', power: 1.7,
        fx: 'slash',
        desc: '雷速出拳 —— 快得能抢先压制 RANK1 的恋兔〔v2 第10话〕。',
        line: '「这里是 Corporations 的警备管辖。」',
      }),
      place('强袭', {
        id: 'boss-katherine-burst', name: '片羽全开 · 越伤越强', axis: '破坏力', power: 2.5,
        desc: '把已经裂开的那些地方一并算进这一拳里：伤是她的燃料。',
        effect: { atkUp: 0.4 },
        line: '「——还不够。再来。」',
      }),
      place('坚守', {
        id: 'boss-katherine-guard', name: '警备委员长的架势', axis: '物理抗性',
        desc: '「此次天空竞技祭，我将担任警备委员会的首席负责人」〔v2 第5话〕—— '
          + '站在这块地上的时候，她是防守的那一方。',
        effect: { shield: 0.55, taunt: true },
        line: '「让开。这里由我负责。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-katherine-end', name: '英雄不灭 · 最后一拳', axis: '破坏力', power: 5.0,
        desc: 'RANK6 的全部：这一拳打出去之前，她已经不在乎自己还剩多少。'
          + '档案页上写着「企业警备队队长」，正文里写着「此刻还站着的，只有她」。',
        effect: { pierce: true, pushBack: 0.4 },
        line: '「——英雄，是不会倒下的。」',
      })),
    ],
    from: 'v2 第10话 天台的正面冲突（恋兔光 对 凯特琳）',
  },

  youshihan: {
    id: 'youshihan',
    name: '吴诗涵 · 弹痕「四大凶兽」',
    sigil: '吴',
    hue: '#9ad0a0',
    cls: '召唤 · 法则改写',
    trait: '弹痕「四大凶兽」—— 穷奇「上变下，快变慢，明变暗，非人变人，世界变非世界」，'
      + '「连小吴自己也无法控制」「无人能预见结局」〔v2 第7话〕。'
      + '限的是数量不是规模：单日最多召一只。',
    hpMul: 0.95,
    passive: {
      name: '四大凶兽',
      desc: '「被称作『四大凶兽』的能力，将所有进入苍之学园的存在全部变成了怪物」'
        + '〔v4 第4话〕—— 她的破与亲两轴记的是弹痕侧，本体是个困睡的少女。',
      acc: 0.1,
    },
    skills: [
      place('basic', {
        id: 'boss-youshihan-basic', name: '凶兽的爪牙', axis: '破坏力', power: 1.5,
        fx: 'slash',
        desc: '不必她自己动手：召出来的东西替她伸爪。',
        line: '「……去吧。」',
      }),
      place('扫荡', {
        id: 'boss-youshihan-qiongqi', name: '四大凶兽 · 穷奇', axis: '反现实亲和', power: 1.6,
        desc: '穷奇落地就是一次法则改写：上变下、快变慢、明变暗 —— 打在谁身上，谁的规则变。',
        effect: { mark: 0.25, slow: 0.3 },
        line: '「它一出来，我就管不住了。」',
      }),
      place('重压', {
        id: 'boss-youshihan-hundun', name: '四大凶兽 · 浑沌', axis: '反现实亲和',
        desc: '「能将无化为有的空间」—— 天空竞技祭那一次，她把三个人一起吞了进去。'
          + '不伤人，先把场地换掉。',
        effect: { mark: 0.2, slow: 0.35, pushBack: 0.4 },
        line: '「接纳浑沌吧。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-youshihan-end', name: '四大凶兽 · 全召', axis: '反现实亲和', power: 4.6,
        desc: '四只一并放出来 —— 她自己也说过「无人能预见结局」。'
          + '这一手打完会变成什么，连她都不知道。',
        target: 'all',
        effect: { mark: 0.3, frail: 0.25, stasis: 1 },
        line: '「——我说过了，我控制不了它们。」',
      })),
    ],
    from: 'v2 第5话 体育馆（被恋兔踢醒之后）／v2-5 次锋战',
  },

  'kuro-no-maou': {
    id: 'kuro-no-maou',
    name: '黑之魔王',
    sigil: '魔',
    hue: '#7b6fd0',
    cls: '自我同一性崩坏',
    trait: '终末「黑之魔王」Stage5『混乱』—— 影可化作切开大海的巨大怪物，'
      + '「那点小子弹……对我来说也就只是稍微有点疼的程度」〔v3 第3话〕。'
      + '自囚于「施害者 / 恶 / 魔王」之位，期盼宇宙毁灭。',
    hpMul: 1.5,
    passive: {
      name: '影之巨人',
      desc: '「他的身体从正面承受住了最新型的导弹的冲击」〔v3 第6话〕、'
        + '被「次元裂缝贯穿了黑之魔王的身体」后仍存活反杀〔v3 第9话〕—— '
        + '她的躯壳只是外壳，真正在动的是影。',
      shield: 0.22,
      regen: 0.03,
    },
    skills: [
      place('basic', {
        id: 'boss-maou-basic', name: '影 · 擦过', axis: '破坏力', power: 1.6,
        fx: 'noise',
        desc: '一片影子从脚边擦过去。像被蛇爬过一样。',
        line: '「……你在害怕。」',
      }),
      place('扫荡', {
        id: 'boss-maou-sea', name: '影之巨人 · 切开大海', axis: '破坏力', power: 1.7,
        desc: '太平洋货船那一夜，她从船的影子里拉出一个能把大海切开的巨人。'
          + '那一击打的是全场。',
        effect: { pushBack: 0.45, mark: 0.2 },
        line: '「这种程度，是挡不住的。」',
      }),
      place('重压', {
        id: 'boss-maou-despair', name: '混沌 · 期盼毁灭', axis: '反现实亲和',
        desc: '把她自囚的那份东西摊开：在场的每一个人都开始觉得，毁灭也挺好的。',
        effect: { mark: 0.25, slow: 0.4, frail: 0.2 },
        line: '「世界本来就是会结束的。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-maou-end', name: '终末『混乱』', axis: '反现实亲和', power: 4.8,
        desc: 'Stage5 的终末全部放开的那一记：她自己也知道这会让「自我同一性」塌掉，'
          + '但她求的就是这个。',
        target: 'all',
        effect: { mark: 0.3, frail: 0.3, pushBack: 0.4 },
        line: '「——这样的结局，绝不是我的终末！」',
      })),
    ],
    from: 'v3 太平洋货船（mst011）／v3 第9话 次元裂缝',
  },

  'danae-whitmore': {
    id: 'danae-whitmore',
    name: '达娜厄・惠特摩尔 · 黑锤部队队长',
    sigil: '达',
    hue: '#d07f7f',
    cls: '对人处刑',
    trait: '斩击「认真模式SSS」。RANK7。放逐部队出身，专业是「对人」——'
      + '她的每一手都是冲着人身上最经不起打的那一处去的。',
    hpMul: 1.3,
    passive: {
      name: '认真模式SSS',
      desc: '「达娜厄・惠特摩尔」在 v4 序章就已经是在斩人的那一方 —— '
        + '她的出手不留余地，所以她的攻击带穿透。',
      atk: 0.15,
    },
    skills: [
      place('basic', {
        id: 'boss-danae-basic', name: '认真模式 · 削', axis: '破坏力', power: 1.7,
        fx: 'slash',
        desc: '先是削：不急着杀，先把能动的部分一一去掉。',
        effect: { bleed: 0.06 },
        line: '「我不需要你完整。」',
      }),
      place('穿甲', {
        id: 'boss-danae-cut', name: '认真模式SSS · 贯穿', axis: '破坏力', power: 2.2,
        desc: '对着反现实实体最怕的那种打法：不看硬度，只找接缝。',
        effect: { pierce: true, bleed: 0.05 },
        line: '「——这里。就是这里。」',
      }),
      place('牵制', {
        id: 'boss-danae-hunt', name: '黑锤部队 · 围猎', axis: '敏捷度',
        desc: '黑锤部队的队长不会一个人动手：她把退路与出手的时机一起封掉。',
        effect: { mark: 0.3, slow: 0.3, pushBack: 0.3 },
        line: '「跑吧。跑起来更有意思。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-danae-end', name: '认真模式SSS · 处刑', axis: '破坏力', power: 5.2,
        desc: 'V4 中斩杀黑之魔王的那一刀就在这一手上：不留余地的、'
          + '冲着「人」去的最后一击。',
        effect: { pierce: true, bleed: 0.08, frail: 0.3 },
        line: '「结束。」',
      })),
    ],
    from: 'v4 序章（放逐部队对人特种）／黑之魔王斩杀战',
  },

  /* ============================================================
     第 4 卷 · 篝火之国 巴别塔顶（两阶段）
     ============================================================ */

  'masked-kokonoha': {
    id: 'masked-kokonoha',
    name: '骷髅假面之男 · 面具心叶',
    sigil: '假',
    hue: '#9b8fd0',
    cls: '异法 · 梵我合一',
    trait: '异次元世界的言万心叶 —— 在「露娜小姐已死的世界」里长大、把挚友当作全世界的人。'
      + '他证明了「低语者」在任何一个世界，都会选择成为温柔的怪物。'
      + '（No.8590 Stage4『活性化』）',
    /* 他不是观测体，是另一个自己的**完成形**：那一边的心叶没有停下终末，
       所以面板必须比这一场里任何一个观测体都厚 —— 这一场要打的是两阶段，
       第一阶段就得站够久，否则「经过剧情还有第二阶段」根本来不及发生。 */
    hpMul: 2.6,
    passive: {
      name: '梵我合一',
      desc: '「把「我」与「世界」视为同一、以一己容纳万象的法理……骷髅假面之男的异法・梵我合一皆属此类」'
        + '（lore.ts 法理考据）—— 他站在那儿，那一片东西就都算他身上的一部分。',
      shield: 0.18,
    },
    /* 破绽不挂：他是「人」，不是打不穿的反现实实体。可对话、可被理解 ——
       原文那一场他是自己阖目的。 */
    skills: [
      place('basic', {
        id: 'boss-mask-bard', name: '「鸟与诗」', axis: '反现实亲和', power: 1.5,
        fx: 'noise',
        desc: '「一名戴骷髅面具的男人唤出「鸟与诗」的亡灵挡下全员，救走了巨匠的尸骸」（v4 序章）——'
          + '挡在身前的那一位，先替他挨下这一手。',
        line: '「——去吧。」',
      }),
      place('扫荡', {
        id: 'boss-mask-legion', name: '亡灵军团 · 成形体诱出', axis: '反现实亲和', power: 0,
        desc: '「以「鸟与诗」「复活的小蕾雅」等亡灵战斗」（图鉴 No.8590 考据）。'
          + '那个世界里的人已经不在了 —— 他把他们一个个喊回来，站到对面。'
          + '唤上来的每一位，技能与能力都还是本人那一份。',
        // 名单取自 roster 的「卡乌斯学院」一组：与脏器公寓那一役
        // 「需与卡乌斯学院放逐部队协同」是同一批人（codex 的 counter 栏）。
        summon: true,
        summonPack: ['danae-whitmore', 'nana-kamiru', 'reiya', 'emei', 'isis-halid'],
        line: '「一个人打不完的仗 —— 那就都回来吧。」',
      }),
      place('重压', {
        id: 'boss-mask-vast', name: '容纳万象', axis: '反现实亲和', power: 1.3,
        desc: '梵我合一摊开的那一拍：他既是他自己，也是那一片东西。'
          + '在场的人会先分不清哪一下是冲自己来的。',
        effect: { mark: 0.3, slow: 0.3, frail: 0.2 },
        line: '「这里也是我。你也是。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-mask-end', name: '温柔的怪物', axis: '反现实亲和', power: 4.6,
        desc: '「他证明了「低语者」在任何一个世界，都会选择成为温柔的怪物」（图鉴 No.8590 考据）——'
          + '把这一整个世界压上来的那一记。',
        target: 'all',
        effect: { mark: 0.35, frail: 0.25, pushBack: 0.35 },
        line: '「谢谢你……相信我……」',
      })),
    ],
    from: 'v3 第3话 永田町（拦下露娜）／v4 序章（救走巨匠尸骸）／v4 第3话（身份揭穿）',
    /* 第二阶段：那位本体倒下之后，由终末化的黑金狮子顶上。 */
    next: 'black-gold-lion',
  },

  'black-gold-lion': {
    id: 'black-gold-lion',
    name: '终末化的黑金狮子',
    sigil: '狮',
    hue: '#c8a24e',
    cls: '终末 · 融合',
    trait: '卡乌斯学院全员能力的融合体 —— 那五位各自那套手一并长在一具躯体上。'
      + '「言万心叶发动「a Session.」与蕾雅合体为「心蕾雅」，分解了终末化的黑金狮子」（v4 尾声-a）。',
    /* 第二阶段要压得住：这一场打到这儿，玩家已经清了一整轮亡灵军团，
       血量与出力都得再抬一档，否则「第二形态」只是换个名字再打一遍。 */
    hpMul: 3.6,
    passive: {
      name: '融合 · 全体化',
      desc: '五个人的手长在同一具躯体上 —— 它会的东西比场上任何人都会得多（v4 尾声-a 的融合设定）。',
      shield: 0.2,
      endure: 1,
    },
    skills: [
      place('basic', {
        id: 'boss-lion-danae', name: '认真模式SSS', axis: '破坏力', power: 1.7,
        desc: '黑锤部队队长达娜厄的那一具：平时是娇小的朋克少女，'
          + '这一式下来高逾一米九 —— 融合体先学的是她那一刀。',
        line: '「——结束。」',
      }),
      place('穿甲', {
        id: 'boss-lion-reya', name: '热沃当的少女', axis: '破坏力', power: 1.9,
        desc: '「形如巨型电锯的斩击，轰鸣着切开一切低 R 值的幻想与屏障」（arms.ts 蕾雅・库尔・杜・琉米爱尔）——'
          + '融合体把这把锯子一并带上了。',
        effect: { pierce: true, bleed: 0.06 },
        line: '「锯开。」',
      }),
      place('重压', {
        id: 'boss-lion-nana', name: '大麻烦', axis: '破坏力', power: 1.6,
        desc: '「一根金属球棒，可将击中对象的重量任意增减——增物重至三倍、或把对方自重提至数十倍，令其寸步难行」'
          + '（arms.ts 神流奈奈）。被压住的人先发现，自己抬不起自己的脚。',
        effect: { slow: 0.45, mark: 0.2 },
        line: '「你，变重了。」',
      }),
      asUlt(place('到达点', {
        id: 'boss-lion-end', name: '号外号外 · 记录世界', axis: '反现实亲和', power: 5.0,
        desc: '「伊西丝・哈利德持有的银色克赫帕什镰形刀。可以将她半径500米内的景象转写进记录世界」'
          + '（roster 伊西丝・哈利德 武装考据）—— 融合体把这一手拿来做收尾：'
          + '在场的所有人，连同这一场本身，一起被写进去。',
        target: 'all',
        effect: { mark: 0.35, frail: 0.3, stasis: 1 },
        line: '「——号外号外。」',
      })),
    ],
    from: 'v4 尾声-a 巴别塔顶（终末化）／卡乌斯学院五人武装的融合',
  },
}

/** 任务挂的 bossId 能不能对上一位指名首领 */
export function namedBossOf(id?: string): NamedBoss | undefined {
  return id ? NAMED_BOSSES[id] : undefined
}
