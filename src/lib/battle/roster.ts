/* ============================================================
   作战名册 —— 战斗定位与专属技能
   ------------------------------------------------------------
   二十四名在册者，逐人给出「战斗定位」（职业）与专属技能，
   名称与机制一律从原文（arms.ts 的武装考据 / sidecast.ts 的人物页 /
   chars.ts 的档案）里取，不新造设定：
     · 弹痕持者的机制写在「弹痕本相」上（樱之残影＝暴力的阀门、
       沙姆希尔＝子弹与目标换位、八脚马＝无论何处都能抵达）
     · 斩击持者写在兵刃的形状上（木钉的禁令、电锯、扩音器、球棒）
     · 片羽持者写在「被授予的渴望」上（不灭、最坚硬、无处不在）
   这里是唯一一处「谁是什么职业、会哪几手」的定义；引擎不认识
   角色，只认识技能表。
   ============================================================ */

import type { AxisKey, FxKind, PassiveSpec, SkillEffect, SkillKind, SkillSpec, Target } from './types'

export interface RoleDef {
  /** 战斗定位（职业名，取自原文意象） */
  cls: string
  /** 定位一句话 */
  sub: string
  /** 专属机制（被动），一句话 */
  trait: string
  skills: SkillSpec[]
  /** 被动技能（见文件末尾 PASSIVE 表） */
  passive?: PassiveSpec
}

interface Opt extends Partial<SkillSpec> {
  effect?: SkillEffect
}

/**
 * 倍率口径：power 以「对应轴的百分之多少」计。
 * 普攻 ≈ 200%、技能 300% 起、到达点更高 —— 出手就该是一次出手，
 * 而不是挠痒。全部倍率在此处一次抬高，逐条数据仍写原来那个「份」。
 */
export const POWER_SCALE = 2

/** 技能工厂：缺省值按类别给，其余逐项覆盖 */
const sk = (id: string, name: string, kind: SkillKind, desc: string, o: Opt = {}): SkillSpec => ({
  id,
  name,
  kind,
  desc,
  cost: o.cost ?? (kind === '普攻' ? 1 : kind === '启动' ? 2 : 4),
  power: (o.power ?? (kind === '普攻' ? 1 : 1.5)) * POWER_SCALE,
  axis: (o.axis ?? '破坏力') as AxisKey,
  fx: (o.fx ?? 'slash') as FxKind,
  line: o.line ?? '',
  target: (o.target ?? (kind === '启动' ? 'self' : 'one')) as Target,
  effect: o.effect,
  turns: o.turns,
  needsStack: o.needsStack,
  // 冷却：普攻与启动技无冷却；「到达点」冷却最长；其余技能一律 2 拍
  cd: o.cd ?? (kind === '普攻' || kind === '启动' ? 0 : o.needsStack ? 4 : 2),
})

/* ============================================================
   苍之学园 · 弹痕（枪）
   ============================================================ */

export const ROSTER: Record<string, RoleDef> = {
  hikari: {
    cls: '独奏者',
    sub: '把整座天空都市当作舞台的主音 · 全队火力的终点',
    trait: '樱色奇迹：一门同时司掌治愈、屏障与光束的机关——按需要拨到哪一档，就是哪一手的形状。',
    skills: [
      sk('hikari-atk', '樱色奇迹 · 扫弦', '普攻', '白吉他的横扫。不耗心神，音压自带杀伤——普攻之中没有比这更重的一手。',
        { power: 1.3, fx: 'guitar', line: '「要上咯，我的吉他——」' }),
      sk('hikari-heal', '樱色奇迹 · 治愈和音', '技能', '同一门奇迹拨到治愈档：全队回复（以意志力为准）。',
        { cost: 4, power: 0, axis: '意志力', fx: 'heal', target: 'allyAll', line: '「别死啊——谁准你们死了！」',
          effect: { heal: 0.55, cleanse: true } }),
      sk('hikari-wall', '樱色奇迹 · 屏障号角', '技能', '把和音压成一面屏障：全队获得减伤与一层护心。',
        { cost: 4, power: 0, axis: '意志力', fx: 'guard', target: 'allyAll', turns: 2, line: '「我来挡。你们都站到我后面去。」',
          effect: { shield: 0.45 } }),
      sk('hikari-peer', '樱色奇迹 · 对位强音', '技能', '指向性的一击。她是人类最强，出手就是终点——单人倍率居全表之首。',
        { cost: 5, power: 2.5, fx: 'guitar', line: '「区区神明，别太嚣张了！」' }),
      sk('hikari-burst', '旧吉他 · 解封', '技能', '到达点：阀门全开，混沌与暴力本身露出来。代价是这一手之后她会哑一阵。',
        { cost: 8, power: 3.4, axis: '意志力', fx: 'noise', needsStack: 3, line: '「——这是我非做到不可的事。」' }),
      sk('hikari-start', '解封试音', '启动', '调准音、拧紧每一根弦。需先后打出 5 次，普攻与技能才会解禁。',
        { cost: 2, power: 0, fx: 'guitar', line: '「先调准音。——一之弦。」' }),
    ],
  },

  luna: {
    cls: '织线者',
    sub: '把身体拆成丝线、再在别处织回来的支援位',
    trait: '解体—重组：丝线之躯没有要害。行动条的推进与回撤，都只是「移动了多少身体」而已。',
    skills: [
      sk('luna-atk', '丝线 · 突刺', '普攻', '银色的铁丝以子弹般的速度飞出，准确地刺中要害。',
        { fx: 'seal', line: '「别动。会扎歪的。」' }),
      sk('luna-wall', '丝线 · 结界', '技能', '织出一面网，替全队吃掉一部分冲力。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'guard', target: 'allyAll', turns: 2, line: '「这种丝线，能像切豆腐一样切开水泥。」',
          effect: { shield: 0.4 } }),
      sk('luna-reweave', '解体 · 重组', '技能', '把九成九的身体移到别处再织回来：自身回复，并抢回一截行动条。',
        { cost: 3, power: 0, axis: '反现实亲和', fx: 'seal', target: 'self', line: '「再织一次就好。」',
          effect: { heal: 0.3, pushBar: 0.5, cleanse: true } }),
      sk('luna-blade', '银线西洋剑', '技能', '丝线变作银色西洋剑，一击瘫痪比自己大得多的对手。',
        { cost: 5, power: 1.85, fx: 'slash', line: '「从我手腕伸出的丝线——变。」' }),
      sk('luna-burst', '与主人同在', '技能', '到达点：当那个人迎来死亡之时，无论距离、次元与法则，她都会出现在他身边。此手代全队承下这一难。',
        { cost: 8, power: 0, axis: '反现实亲和', fx: 'heal', target: 'allyAll', needsStack: 3,
          line: '「——我将献上我的全部。」', effect: { heal: 0.7, shield: 0.5, cleanse: true } }),
    ],
  },

  mefisa: {
    cls: '骑手',
    sub: '以八脚马变形支援全队 · 决定谁先抵达战场',
    trait: '八脚马：为了「无论何处都能抵达」的弹痕。它会变成枪、变成装甲、变成载具——副官要什么，它就长成什么。',
    skills: [
      sk('mefisa-atk', '八脚马 · 短点射', '普攻', '变形步枪的短点射。',
        { fx: 'guitar', line: '「瞄准好了。」' }),
      sk('mefisa-ride', '八脚马 · 载具', '技能', '八脚马变形为一台交通工具，载上她自己与另一名同伴一起冲出去：'
        + '两人行动条前推、充能明显提速。冷却 3 拍。',
        { cost: 4, power: 0, axis: '敏捷度', fx: 'drone', target: 'allyOne', turns: 2, cd: 3,
          line: '「上车。——走了。」',
          effect: { spdUp: 0.55, pushBar: 0.4, selfToo: true } }),
      sk('mefisa-armor', '八脚马 · 卸甲', '技能', '八脚马的装甲卸下来分给全队：弹珠都会被轻松弹开。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'guard', target: 'allyAll', turns: 2, line: '「耐久力非常之高——借你们用。」',
          effect: { shield: 0.42 } }),
      sk('mefisa-cannon', '吞噬我吧，我的爱马', '技能', '八脚马吞掉她的手臂，形成两把超过三米的巨大步枪。',
        { cost: 5, power: 2.2, fx: 'blast', line: '「吞噬我吧，我的爱马。」' }),
      sk('mefisa-burst', '无论何处都能抵达', '技能', '到达点：八脚马把全队直接载到「应有的位置」——全体回满行动条，并把敌人推离坐标。',
        { cost: 8, power: 0, axis: '反现实亲和', fx: 'drone', target: 'allyAll', needsStack: 3,
          line: '「为了能够去往任何地方，哪怕是异界。」',
          effect: { pushBar: 0.85, spdUp: 0.3, pushBack: 0.5 } }),
      sk('mefisa-start', '镇封起手', '启动', '先稳住八脚马里的封印。需先后打出 2 次，普攻与技能才会解禁。',
        { cost: 2, power: 0, fx: 'guitar', line: '「别急。——先把它按住。」' }),
    ],
  },

  nyau: {
    cls: '掷换手',
    sub: '用换位打乱坐标的护卫 · 队里最小的那只手',
    trait: '沙姆希尔：子弹不追求命中——弹匣里的子弹与「目标」的位置会被互换。小柴的小是小狗的小。',
    skills: [
      sk('nyau-atk', '沙姆希尔 · 击发', '普攻', '老式左轮的一响。命不命中，其实不打紧。',
        { fx: 'guitar', line: '「要开枪咯——！」' }),
      sk('nyau-swap', '换位 · 掩护', '技能', '把同伴从必死的坐标里换出来：全队闪避大幅提升，自身行动条一并前推。',
        { cost: 3, power: 0, axis: '敏捷度', fx: 'seal', target: 'allyAll', turns: 2, line: '「小柴的沙姆希尔，能随时撤退！」',
          effect: { evade: 0.3, pushBar: 0.35 } }),
      sk('nyau-void', '掷入真空', '技能', '把远处的敌人直接与子弹换位，掷进无声的宇宙——伤害之外，还把它推出好远。',
        { cost: 5, power: 1.7, axis: '反现实亲和', fx: 'seal', line: '「逃不掉了。一旦被标记，射程就是无限的。」',
          effect: { pushBack: 0.6, hits: 1 } }),
      sk('nyau-burst', '亚音速质量投送', '技能', '到达点：把载着高压气体的二十吨油罐车与目标互换——火力有点搞错了，诶嘿。',
        { cost: 8, power: 2.6, axis: '反现实亲和', fx: 'blast', target: 'all', needsStack: 3,
          line: '「（全长2米！时速2000千米以上！这威力完全是另一个层级！）」' }),
    ],
  },

  youshihan: {
    cls: '赌徒',
    sub: '效果随机、性能极端的前辈 · 你永远押不准她抽到哪一张',
    trait: '四大凶兽：四张牌里总有一张是极端的，可惜不知是哪张。',
    skills: [
      sk('youshihan-atk', '打个哈欠 · 拂', '普攻', '一副没睡醒的样子，随手拍出去的一下。',
        { fx: 'seal', line: '「呼啊……」' }),
      sk('youshihan-lot', '四大凶兽 · 抽签', '技能', '掷一次签：大伤／全场／重甲／回气，中哪张全凭运气。',
        { cost: 4, power: 1.4, fx: 'noise', line: '「唔……今天手气怎么样呢。」' }),
      sk('youshihan-fate', '留级的直觉', '技能', '懒得挪步，却总能站到不该站的地方：自身闪避提升并回一截气。',
        { cost: 3, power: 0, axis: '意志力', fx: 'guard', target: 'self', line: '「久违一年的阳光，好刺眼啊……」',
          effect: { evade: 0.4, pushBar: 0.4 } }),
    ],
  },

  'alive-anatolia': {
    cls: '撰史者',
    sub: '以「散文」撰写委员会的未来 · 会长席上的那一笔',
    trait: '如散文般：一击可贯穿过去，把干涉送往因果的开端。战场上她改的不是结果，是起因。',
    skills: [
      sk('alive-atk', '散文 · 断句', '普攻', '把一句话拦腰截断。',
        { fx: 'blast', line: '「读到这里就够了。」' }),
      sk('alive-past', '贯穿过去', '技能', '把干涉送回三十年前、三百公里外，在开端处落下决定性的一笔——敌人的行动条被从起因上抹去。',
        { cost: 5, power: 0, axis: '反现实亲和', fx: 'noise', target: 'all', line: '「——往回写三十行。」',
          effect: { pushBack: 0.75, slow: 0.35, mark: 0.2 } }),
      sk('alive-edit', '撰写', '技能', '为全队补上一行注脚：攻击与充能一并上扬。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'seal', target: 'allyAll', turns: 2, line: '「做我的狗——好处是有的。」',
          effect: { atkUp: 0.3, spdUp: 0.3 } }),
      sk('alive-burst', '会长的一笔', '技能', '到达点：直接改写这一战的结末。',
        { cost: 8, power: 2.4, axis: '反现实亲和', fx: 'noise', target: 'all', needsStack: 3, line: '「结末由我写。」' }),
    ],
  },

  'vern-simon': {
    cls: '情报官',
    sub: '信息处理的极致 · 他休息五天，学园就会崩溃',
    trait: '调度：战场上没有他不知道的数。看一眼，就把对手的底数摊在桌面上。',
    skills: [
      sk('vern-atk', '精准点射', '普攻', '不求多，只求打在算过的那一格。',
        { fx: 'drone', line: '「不需要第二发。」' }),
      sk('vern-scan', '黑档库 · 解析', '技能', '把目标的弱点摊成一张表：全队打它更重，且它充得更慢。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'drone', turns: 3, line: '「底数我收下了。」',
          effect: { mark: 0.35, slow: 0.25 } }),
      sk('vern-dispatch', '黑档库 · 调度', '技能', '把观测到的时机分发给全队：行动条一同前推。',
        { cost: 4, power: 0, axis: '意志力', fx: 'drone', target: 'allyAll', line: '「按这个次序走。」',
          effect: { pushBar: 0.45 } }),
    ],
  },

  'xiaochai-lin': {
    cls: '工造师',
    sub: '随身带着一台悬浮 3D 打印机 · 需要什么就当场造出来',
    trait: '爪：能用激光把照射到的物质塑造成任意形状——墙、乐器、通行证，皆可当场造出。',
    skills: [
      sk('xiaochai-atk', '爪 · 激光塑形', '普攻', '把照射到的物质削下一块。',
        { fx: 'drone', line: '「上吧。爪！」' }),
      sk('xiaochai-wall', '现场造物 · 木墙', '技能', '对着空气打一束激光，当场立起一堵墙。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'guard', target: 'allyAll', turns: 2, line: '「墙。……现在有了。」',
          effect: { shield: 0.44 } }),
      sk('xiaochai-pierce', '神明为材', '技能', '以旧神的神经制成的特别型号：无视护甲的一击。',
        { cost: 5, power: 1.9, axis: '反现实亲和', fx: 'drone', line: '「这玩意……不是能解析然后再现出来的替代品。」',
          effect: { pierce: true } }),
    ],
  },

  /* ============================================================
     卡乌斯学院 · 斩击（剑）
     ============================================================ */

  'danae-whitmore': {
    cls: '黑锤',
    sub: '平时怯生生的朋克少女 · 一变身就高逾一米九',
    trait: '认真模式SSS：越是怯场，越要变成那个够得着的人。',
    skills: [
      sk('danae-atk', '黑锤 · 砸', '普攻', '不讲究的一记重砸。',
        { fx: 'slash', line: '「……对、对不起了！」' }),
      sk('danae-mode', '认真模式SSS', '技能', '挺直脊背、长高一截：攻击大幅上扬，并硬吃下一轮冲击。',
        { cost: 4, power: 0, axis: '意志力', fx: 'slash', target: 'self', turns: 3, line: '「——我是黑锤部队的队长。」',
          effect: { atkUp: 0.7, shield: 0.3 } }),
      sk('danae-crush', '黑锤 · 碎城', '技能', '高逾一米九的那一锤，落下时地面先塌。',
        { cost: 5, power: 2.05, fx: 'blast', line: '「这次……不会失手。」' }),
    ],
  },

  'nana-kamiru': {
    cls: '称量者',
    sub: '能把重量自由增减的球棒 · 连终末都要先掂量掂量自己有多重',
    trait: '大麻烦：击中对象的重量任意增减。增物重至三倍，或把对方自重提至数十倍——寸步难行。',
    skills: [
      sk('nana-atk', '大麻烦 · 挥', '普攻', '分量刚好的一棒。',
        { fx: 'slash', line: '「慢慢来也可以的哦。」' }),
      sk('nana-heavy', '大麻烦 · 增重', '技能', '把敌方全体的自重提到数十倍：它们几乎挪不动，充能大幅滞后。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'blast', target: 'all', turns: 3, line: '「先掂量掂量自己有多重吧。」',
          effect: { pushBack: 0.45, slow: 0.45 } }),
      sk('nana-light', '大麻烦 · 减重', '技能', '把对手体重降到几十分之一，一棒送它离场。',
        { cost: 5, power: 1.8, fx: 'slash', line: '「轻一点，飞得远一点。」', effect: { pushBack: 0.5 } }),
    ],
  },

  reiya: {
    cls: '斩伐者',
    sub: '形如巨型电锯的斩击 · 轰鸣着切开一切低 R 值的幻想',
    trait: '热沃当的少女：被诅咒的巨兽之名。这把锯子最初为狩猎而转，直到有人教会它守护。',
    skills: [
      sk('reiya-atk', '热沃当 · 咬', '普攻', '电锯咬进屏障的声响。',
        { fx: 'slash', line: '「吵死了——让开！」' }),
      sk('reiya-cut', '热沃当的少女 · 全锯', '技能', '横抡一圈，把一切低 R 值的东西一并切开。',
        { cost: 5, power: 1.65, fx: 'slash', target: 'all', line: '「a Session.——记住了。」' }),
      sk('reiya-oath', '共奏之约', '技能', '篝火之国那一夜的约定：这把锯子第一次为守护而转动。全队减伤并回气。',
        { cost: 4, power: 0, axis: '意志力', fx: 'guard', target: 'allyAll', turns: 2, line: '「我会守住。这次一定。」',
          effect: { shield: 0.4, pushBar: 0.2 } }),
    ],
  },

  emei: {
    cls: '统率者',
    sub: '被称为「王子殿下」的评议会副议长 · 完美的领队',
    trait: '号令：只要她还站着，队伍就不会先垮。',
    skills: [
      sk('emei-atk', '佩剑 · 行礼', '普攻', '先执礼，再出手。',
        { fx: 'slash', line: '「失礼了。」' }),
      sk('emei-order', '佩剑 · 号令', '技能', '一声令下，全队攻击与意志一并上扬。',
        { cost: 4, power: 0, axis: '意志力', fx: 'seal', target: 'allyAll', turns: 3, line: '「——评议会，前进。」',
          effect: { atkUp: 0.4, cleanse: true } }),
      sk('emei-guard', '佩剑 · 殿后', '技能', '副议长殿后：全队减伤，并甩开身后的追兵。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'guard', target: 'allyAll', turns: 2, line: '「我最后走。」',
          effect: { shield: 0.38, pushBar: 0.25 } }),
    ],
  },

  'isis-halid': {
    cls: '取材者',
    sub: '卡乌斯的记者 · 追独家新闻时寸步不让',
    trait: '取材：她先记下来，队伍再打。被记录的目标没有秘密。',
    skills: [
      sk('isis-atk', '快门 · 闪光', '普攻', '一记闪光，晃得人睁不开眼。',
        { fx: 'drone', line: '「——拍到咯。」' }),
      sk('isis-scoop', '独家取材', '技能', '把目标的破绽写进稿子：全队打它更重，它的充能也跟着慢下来。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'drone', turns: 3, line: '「这条，我要定了。」',
          effect: { mark: 0.3, slow: 0.2, pushBack: 0.2 } }),
      sk('isis-live', '实况解说', '技能', '就像在天空竞技祭那样，把全场的节奏念出来：全队充能提速。',
        { cost: 4, power: 0, axis: '敏捷度', fx: 'seal', target: 'allyAll', turns: 2, line: '「各位听众——请看这里！」',
          effect: { spdUp: 0.45, pushBar: 0.2 } }),
    ],
  },

  /* ============================================================
     Corporations · 片羽（渴望的具象）
     ============================================================ */

  katherine: {
    cls: '英雄',
    sub: '受到的伤害越重就越强 · 濒死即是她的完全体',
    trait: '英雄不灭：血越薄，拳头越重。她是凡人之躯正面迎战大将的那种人。',
    skills: [
      sk('katherine-atk', '英雄不灭 · 拳', '普攻', '如雷电般的一拳。',
        { fx: 'blast', line: '「喂喂，怎么啦？」' }),
      sk('katherine-born', '英雄不灭', '技能', '把伤口的血当成燃料：自身攻击随已失血量上扬，并硬吃一轮。',
        { cost: 4, power: 0, axis: '意志力', fx: 'guard', target: 'self', turns: 3,
          line: '「振翅高飞！这是良机，同时，这也是战争！」', effect: { atkUp: 0.55, shield: 0.3 } }),
      sk('katherine-flame', '终焉的火焰', '技能', '不再以受伤变强，而是直接燃烧生命换取力量——英雄赌上性命的最后一击。',
        { cost: 6, power: 2.35, axis: '意志力', fx: 'noise', line: '「这条命，就当是押上了。」' }),
    ],
  },

  'alex-cave': {
    cls: '盾',
    sub: '午夜降临时化为现世最坚硬的物质 · 企业联合的盾',
    trait: '午夜降临：任何攻击都无法在他身上留下划痕。他站着，后面的人就不必挨打。',
    skills: [
      sk('alex-atk', '午夜降临 · 硬质', '普攻', '硬得像铁的一拳。',
        { fx: 'blast', line: '「练得也太半吊子了吧。」' }),
      sk('alex-midnight', '午夜降临', '技能', '身躯化为最坚硬之物：大幅减伤，并引着敌人往他这边打。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'guard', target: 'self', turns: 3, line: '「打吧。打完你就知道了。」',
          effect: { shield: 0.7, taunt: true } }),
      sk('alex-wall', '午夜降临 · 盾墙', '技能', '把坚硬分给身边的人：全队减伤。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'guard', target: 'allyAll', turns: 2, line: '「都躲我后面。」',
          effect: { shield: 0.42 } }),
    ],
  },

  phidra: {
    cls: '交涉者',
    sub: '被视为下一任会长的那种人 · 认识他的无不折服',
    trait: '好比赛：他从不逼人交手，只是让人自愿走进规则里。',
    skills: [
      sk('phidra-atk', '利刃 · 掠', '普攻', '彬彬有礼的一刀。',
        { fx: 'slash', line: '「几日不见呢，言万同学。」' }),
      sk('phidra-match', '来一场好比赛吧', '技能', '把目标请进他的规则：行动条大幅推后，攻击随之萎顿。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'seal', turns: 3, line: '「——让我们来一场好比赛吧。」',
          effect: { pushBack: 0.55, mark: 0.25, slow: 0.2 } }),
      sk('phidra-stake', '赌注', '技能', '为全队垫上一笔底气：攻击上扬，并解除负面。',
        { cost: 4, power: 0, axis: '意志力', fx: 'seal', target: 'allyAll', turns: 3, line: '「赢面在我这边。」',
          effect: { atkUp: 0.35, cleanse: true } }),
    ],
  },

  maria: {
    cls: '偶像',
    sub: '把感情唱成现实的舞台公主 · 也是第 6 区的镇痛剂',
    trait: '天下无双的公主大人：台下的欢呼、观众的心跳，都会在旋律中成真。',
    skills: [
      sk('maria-atk', '麦克风 · 拍', '普攻', '与楚楚可怜的外表相反的一下。',
        { fx: 'guitar', line: '「要到最后一句哦。」' }),
      sk('maria-song', '公主的独唱', '技能', '唱一支止痛的歌：全队回复并把士气提上去。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'heal', target: 'allyAll', turns: 2, line: '「——为你们唱的。」',
          effect: { heal: 0.45, atkUp: 0.25, cleanse: true } }),
      sk('maria-encore', '安可', '技能', '返场加演：全队立刻抢回一截行动条。',
        { cost: 3, power: 0, axis: '敏捷度', fx: 'guitar', target: 'allyAll', line: '「再来一首！」',
          effect: { pushBar: 0.5 } }),
    ],
  },

  'merwen-gray': {
    cls: '瞬步者',
    sub: '外表文静的文学少女 · 实则狠辣的武斗派',
    trait: '愚者的足迹：只在想逃的地方留下脚印——她从不逃跑，只换坐标。',
    skills: [
      sk('merwen-atk', '足迹 · 袭', '普攻', '不知不觉已经贴到面前。',
        { fx: 'slash', line: '「我在你后面哦。」' }),
      sk('merwen-step', '愚者的足迹', '技能', '瞬移到「刚刚想到的地方」：自身闪避大幅提升，并抢回行动条。',
        { cost: 3, power: 0, axis: '敏捷度', fx: 'drone', target: 'self', turns: 3, line: '「——想到了。」',
          effect: { evade: 0.45, pushBar: 0.55 } }),
      sk('merwen-hunt', '狠辣的一击', '技能', '踩着瞬移的余势打出去，专挑落点。',
        { cost: 5, power: 1.95, fx: 'slash', line: '「别指望我手下留情。」' }),
    ],
  },

  ameria: {
    cls: '守望者',
    sub: '以亡者的形态注视着第 6 区 · 无处不在的目光',
    trait: '注视着你：意识量子化、无限增殖——城市中的每一双眼、每一扇窗都是她的目光。',
    skills: [
      sk('ameria-atk', '注视 · 凝', '普攻', '从某个窗口落下来的一道视线。',
        { fx: 'seal', line: '「看着你。」' }),
      sk('ameria-all', '无处不在', '技能', '每一扇窗同时睁开：对敌方全体造成无视闪避的一击。',
        { cost: 5, power: 1.6, axis: '反现实亲和', fx: 'seal', target: 'all', line: '「这里，也看得到。」',
          effect: { pierce: true } }),
      sk('ameria-fix', '注视 · 定', '技能', '把目光钉在目标身上：它再难挪动，也更容易被打中。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'drone', turns: 3, line: '「——已经，逃不掉了。」',
          effect: { mark: 0.35, pushBack: 0.4, slow: 0.3 } }),
    ],
  },

  /* ============================================================
     学园外 · 其它
     ============================================================ */

  'kuro-no-maou': {
    cls: '魔王',
    sub: 'Stage5 的人型终末 · 与心叶同船相识的那位少女',
    trait: '漆黑之影：她的力量不属于三大学园任何一尊天使——反现实性对她不构成克制，也不构成弱点。'
      + '「风与沙」是同一门力量的两支：风先到，沙随后。',
    skills: [
      sk('kuro-atk', '风与沙 · 扬沙', '普攻', '抬手间，影子先动。沙砾比风晚一步到，却一定到。',
        { fx: 'noise', line: '「碍事。」' }),
      sk('kuro-wind', '风与沙 · 卷风', '技能', '风那一支：把海面劈开的巨大影子随风暴一同压过来。',
        { cost: 5, power: 1.75, axis: '反现实亲和', fx: 'noise', target: 'all', line: '「我说过，我要毁灭世界与宇宙。」' }),
      sk('kuro-sand', '风与沙 · 落沙', '技能', '沙那一支：细密的沙落进每一道缝隙，把对手的脚步与节奏一并埋住。',
        { cost: 4, power: 0, axis: '反现实亲和', fx: 'noise', target: 'all', turns: 3, line: '「慢慢沉下去吧。」',
          effect: { slow: 0.3, mark: 0.25, pushBack: 0.3 } }),
      sk('kuro-chain', '风与沙 · 解镣', '技能', '两支合一，把束缚连同这一带的规则一并吹散：全队脱离减益，行动条前推。',
        { cost: 4, power: 0, axis: '意志力', fx: 'noise', target: 'allyAll', line: '「走吧。你自由了。」',
          effect: { cleanse: true, pushBar: 0.45 } }),
      sk('kuro-burst', '风与沙 · 沙暴', '技能', '到达点：风和沙同时收拢——那是她在货船甲板上第一次抬手的样子。',
        { cost: 8, power: 2.6, axis: '反现实亲和', fx: 'noise', target: 'all', needsStack: 3,
          line: '「我说过，我要毁灭世界与宇宙。」' }),
    ],
  },

  yiregel: {
    cls: '龙骑士',
    sub: '出身异界「龙之国」的心腹 · 持有名为「龙花」的加护',
    trait: '龙花：一种既非弹痕亦非斩击的加护。龙之国的东西，不按这边的规矩运转。',
    skills: [
      sk('yiregel-atk', '龙花 · 斩', '普攻', '带着异界气息的一击。',
        { fx: 'noise', line: '「公事公办。」' }),
      sk('yiregel-bloom', '龙花 · 开', '技能', '龙花绽放：一击贯穿，并顺势把自己的行动条推满一截。',
        { cost: 5, power: 2.0, axis: '反现实亲和', fx: 'noise', line: '「——开花吧。」',
          effect: { pushBar: 0.35 } }),
      sk('yiregel-ward', '龙的加护', '技能', '以加护覆住同伴：减伤并解除异常。',
        { cost: 4, power: 0, axis: '物理抗性', fx: 'guard', target: 'allyAll', turns: 2, line: '「别死在这里。」',
          effect: { shield: 0.4, cleanse: true } }),
    ],
  },

  'touyi-caojiro': {
    cls: '浪人',
    sub: '总是开着玩笑、嬉皮笑脸 · 让人看不懂真意的少年',
    trait: '与世无争：他珍爱日常，所以出手时从不用尽全力——敌人也因此总摸不准他。',
    skills: [
      sk('touyi-atk', '玩笑 · 拍', '普攻', '看着像在闹，其实打得不轻。',
        { fx: 'slash', line: '「诶——好凶哦。」' }),
      sk('touyi-joke', '插科打诨', '技能', '把对手的节奏搅乱：攻击萎顿、行动条错位。',
        { cost: 4, power: 0, axis: '意志力', fx: 'seal', turns: 3, line: '「认真你就输咯。」',
          effect: { slow: 0.35, pushBack: 0.35, mark: 0.15 } }),
      sk('touyi-daily', '守住日常', '技能', '他护住的是很普通的东西：全队减伤并回复。',
        { cost: 4, power: 0, axis: '意志力', fx: 'heal', target: 'allyAll', line: '「这日子，我还想过下去。」',
          effect: { shield: 0.3, heal: 0.3, cleanse: true } }),
    ],
  },

  'huda-nayume': {
    cls: '领队',
    sub: '提前算好未来几步 · 深不可测的少女',
    trait: '预读：对内像姐姐，对外毫不留情。她已经在想第三步了。',
    skills: [
      sk('huda-atk', '先手 · 制', '普攻', '等你反应过来时已经挨了。',
        { fx: 'slash', line: '「第一步。」' }),
      sk('huda-read', '预读', '技能', '把未来几步摊开：全队行动条大幅前推，并抢在对手之前。',
        { cost: 4, power: 0, axis: '敏捷度', fx: 'drone', target: 'allyAll', turns: 2, line: '「按这个走，会赢。」',
          effect: { pushBar: 0.8, spdUp: 0.35 } }),
      sk('huda-lock', '算死', '技能', '把目标的退路一步步堵上：行动条清零，并标记为全队靶子。',
        { cost: 5, power: 0, axis: '反现实亲和', fx: 'seal', line: '「第三步——你已经没地方去了。」',
          effect: { pushBack: 1.0, mark: 0.4 } }),
    ],
  },

  'yuina-yoshito': {
    cls: '斗士',
    sub: '宁可不吃饭，也要打上一架 · 顺从本能的野性派',
    trait: '本能：想都没想就已经冲出去了。抢得越早，打得越狠。',
    skills: [
      sk('yuina-atk', '野性 · 扑', '普攻', '毫无预兆地贴近。',
        { fx: 'blast', line: '「来打一架吧。」' }),
      sk('yuina-rush', '顺从本能', '技能', '连打两下，中间没有停顿。',
        { cost: 5, power: 1.15, fx: 'blast', line: '「我在想之前就动了。」', effect: { hits: 2 } }),
      sk('yuina-flare', '锋芒毕露', '技能', '浑身锋芒炸开：全队充能提速，敌人被迫后退。',
        { cost: 4, power: 0, axis: '敏捷度', fx: 'noise', target: 'allyAll', turns: 2, line: '「别拦着我。」',
          effect: { spdUp: 0.4, pushBack: 0.25 } }),
    ],
  },
}

/** 战斗定位（未知者退回「见习」） */
export function roleOf(id: string): RoleDef | undefined {
  return ROSTER[id]
}

/* ============================================================
   被动技能表 —— 二十四人的「一直带着的东西」
   ------------------------------------------------------------
   技能是出手，被动是那个人本身：身子是什么做的、别人为什么
   打不中他、原文里他为什么打不倒。逐条对着原文写，宁少不编。
   单独成表（而不是塞进每人条目里）只为一眼能横着读、互相校对。
   ============================================================ */

const PASSIVE: Record<string, PassiveSpec> = {
  /* —— 恋兔队 —— */
  hikari: {
    name: '主音',
    desc: '一门樱色奇迹同时司掌治愈、屏障与光束：她自己在和音里回血，也歇得比谁都快。',
    regen: 0.06, cdCut: 1,
  },
  luna: {
    name: '丝线之躯',
    desc: '由「境界领域商会」以金属丝线织成的机器人偶——没有要害，也没有心脏可破：'
      + '丝线断了再织回去就是，血一直在往回长；而无论被打穿多少次，她都不会死。',
    regen: 0.09, endure: -1,
  },
  mefisa: {
    name: '无论何处都能抵达',
    desc: '八脚马的引擎从不熄火：开场她就已经先走了半条行动条——副官决定谁先抵达战场。',
    headStart: 0.5,
  },
  nyau: {
    name: '位置互换',
    desc: '沙姆希尔的子弹与「目标」的位置会被互换：打中她的那一枪，落在的是别处。',
    evade: 0.13,
  },
  youshihan: {
    name: '押不准',
    desc: '四大凶兽——效果随机、性能极端，连她自己都押不准下一张是什么。对手更押不准。',
    acc: 0.25, evade: 0.05,
  },

  /* —— 委员会本部 —— */
  'alive-anatolia': {
    name: '如散文般',
    desc: '一击可贯穿过去，把干涉送往因果的开端：她出手之后，因果自己会把後面补齐。',
    cdCut: 1,
  },
  'vern-simon': {
    name: '黑档库',
    desc: '战场上没有他不知道的数：看一眼就把对手的底数摊在桌面上，也因此总先到一步。',
    acc: 0.2, headStart: 0.2,
  },
  'xiaochai-lin': {
    name: '随身工房',
    desc: '随身带着一台悬浮 3D 打印机：需要什么就当场造出来——包括当下挡住这一下的东西。',
    shield: 0.09,
  },
  'danae-whitmore': {
    name: '认真模式',
    desc: '平时怯生生的朋克少女，越是怯场，越要变成那个高逾一米九、够得着的人。',
    atk: 0.1, lowHpAtk: 0.4,
  },
  'nana-kamiru': {
    name: '掂量',
    desc: '大麻烦能任意增减重量：她把自身的重量调到最适——打上来的力道先被卸掉一截。',
    shield: 0.12,
  },
  reiya: {
    name: '狩猎的锯齿',
    desc: '这把锯子最初为狩猎而转，直到有人教会它守护：开始转之后，它就只会往上走。',
    atk: 0.15,
  },
  emei: {
    name: '王子殿下',
    desc: '只要她还站着，队伍就不会先垮——所以她本人也不会先垮。',
    shield: 0.09, endure: 1,
  },
  'isis-halid': {
    name: '先记下来',
    desc: '她先记下来，队伍再打：被记录的目标没有秘密，也就没有躲得掉的余地。',
    acc: 0.16,
  },
  katherine: {
    name: '英雄不灭',
    desc: '血越薄，拳头越重——濒死即是她的完全体。',
    lowHpAtk: 0.7,
  },
  'alex-cave': {
    name: '午夜降临',
    desc: '化为现世最坚硬的物质：任何攻击都无法在他身上留下划痕。他站着，後面的人就不必挨打。',
    shield: 0.16, endure: 1,
  },
  phidra: {
    name: '赢面',
    desc: '他从不逼人交手，只是让人自愿走进规则里——走进来的，就躲不开他。',
    acc: 0.16,
  },
  maria: {
    name: '镇痛剂',
    desc: '台下的欢呼、观众的心跳都会在旋律中成真：第 6 区的镇痛剂，也在给自己镇痛。',
    regen: 0.05, spRegen: 2,
  },
  'merwen-gray': {
    name: '愚者的足迹',
    desc: '只在想逃的地方留下脚印——她从不逃跑，只换坐标。',
    evade: 0.16, headStart: 0.25,
  },
  ameria: {
    name: '无处不在',
    desc: '意识量子化、无限增殖：城市中的每一双眼、每一扇窗都是她的目光——杀掉一个，还有别的。',
    regen: 0.04, endure: 2,
  },

  /* —— 三大学园 / 外围 —— */
  'kuro-no-maou': {
    name: '漆黑之影',
    desc: 'Stage5 的人型终末：她的力量不属于三大学园任何一尊天使——反现实性对她不构成克制，也不构成弱点。',
    shield: 0.12, atk: 0.12,
  },
  yiregel: {
    name: '异界的法理',
    desc: '龙之国的加护「龙花」——那边的东西不按这边的规矩运转，包括「被打倒」这条规矩。',
    shield: 0.1, endure: 1,
  },
  'touyi-caojiro': {
    name: '与世无争',
    desc: '他珍爱日常，所以出手时从不用尽全力——敌人也因此总摸不准他。',
    evade: 0.13,
  },
  'huda-nayume': {
    name: '预读',
    desc: '提前算好未来几步：她已经在想第三步了，出手自然比别人快半拍。',
    headStart: 0.4, cdCut: 1,
  },
  'yuina-yoshito': {
    name: '本能',
    desc: '想都没想就已经冲出去了——抢得越早，打得越狠。',
    atk: 0.1, spd: 0.1,
  },
}

/* 挂回名册：ROSTER 是「谁是什么定位、会哪几手」的唯一出处，
   被动同属那一份档案，故在此处一并合上，不再另建一张 id → 被动的表。 */
for (const id in PASSIVE) {
  const r = ROSTER[id]
  if (r) r.passive = PASSIVE[id]
}
