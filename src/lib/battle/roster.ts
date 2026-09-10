/* ============================================================
   作战名册 —— 谁坐在框架的哪一格上
   ------------------------------------------------------------
   二十四名在册者，逐人给出「战斗定位」（职业）与专属技能。
   技能不再是各写各的：每一手都**放进框架里**（见 atlas.ts）——
   目标、耗体、冷却、持续拍数与倍率带由「类」定，
   角色只决定它叫什么、按哪条轴算、演成什么样、以及在这一类里取哪一档。
   于是「为什么她是 5.0 而他是 2.6」有得可答：他们在同一张带上的不同档位。

   名称与机制一律从原文（arms.ts 的武装考据 / sidecast.ts 的人物页 /
   chars.ts 的档案）里取，不新造设定：
     · 弹痕持者的机制写在「弹痕本相」上（樱之残影＝暴力的阀门、
       沙姆希尔＝子弹与目标换位、八脚马＝无论何处都能抵达）
     · 斩击持者写在兵刃的形状上（木钉的禁令、电锯、扩音器、球棒）
     · 片羽持者写在「被授予的渴望」上（不灭、最坚硬、无处不在）

   每人四手起步：普攻一手、技能两到三手、**到达点（End）一手**。
   到达点是这个人的终结技，出手蓄印，蓄满才列得出来 —— 没有例外。
   这里是唯一一处「谁是什么职业、会哪几手」的定义；引擎不认识角色，
   只认识技能表。
   ============================================================ */

import { place } from './atlas'
import type { PassiveSpec } from './types'

export interface RoleDef {
  /** 战斗定位（职业名，取自原文意象） */
  cls: string
  /** 定位一句话 */
  sub: string
  /** 专属机制（被动），一句话 */
  trait: string
  skills: ReturnType<typeof place>[]
  /** 被动技能（见文件末尾 PASSIVE 表） */
  passive?: PassiveSpec
}

/**
 * 倍率口径：power 以「对应轴的百分之多少」计。
 * 普攻 ≈ 100%–200%、技能 140%–260%、到达点更高 —— 出手就该是一次出手，
 * 而不是挠痒。全部倍率在此处一次抬高，逐条数据仍写原来那个「份」。
 */
export const POWER_SCALE = 2

/* ============================================================
   苍之学园 · 弹痕（枪）
   ============================================================ */

export const ROSTER: Record<string, RoleDef> = {
  hikari: {
    cls: '独奏者',
    sub: '把整座天空都市当作舞台弹主音的人 · 队伍的火力在她手上收束',
    trait: '樱色奇迹：一门同时司掌治愈、屏障与光束的机关——按需要拨到哪一档，就是哪一手的形状。',
    skills: [
      // 人类最强的一手普攻：全表唯一顶到普攻倍率带上限的（2.0）
      place('basic', {
        id: 'hikari-atk', name: '樱色奇迹 · 扫弦', power: 2.0, fx: 'guitar',
        desc: '恋兔光握着白吉他横扫出去，音压本身就是杀伤。这一手不必先动心神。',
        // 普攻是砸了一遍又一遍的那一手，她就是这么一边砸一边报的名号
        // （「樱之残影」那句在联动里出场，这里让位给同一场仗里的这一句）
        line: '「我是超越人类的最强美少女・恋兔光！区区神明，别太嚣张了！」',
      }),
      place('治愈', {
        id: 'hikari-heal', name: '樱色奇迹 · 治愈和音', axis: '意志力', fx: 'heal',
        effect: { heal: 0.55 },
        desc: '同一门奇迹拨到治愈档：全队回复（以意志力为准）。',
        line: '「大家都是我最重要的人。我谁也不想要失去。」',
      }),
      place('屏障', {
        id: 'hikari-wall', name: '樱色奇迹 · 屏障号角', axis: '意志力', fx: 'guard',
        effect: { shield: 0.45 },
        desc: '把和音压成一面屏障：全队获得减伤与一层护心。',
        // 屏障是她站在所有人前面说的那一句 —— 原文里她正是孤身拦在大家身前
        line: '「——只要我还活着，就不会让你伤害到大家——！」',
      }),
      /*
        旧吉他 · 解封 —— 不是伤害手，是**规格**。
        超模的写法不能是「这一下打得多重」，只能是「从此以后每一手都按新规格算」。
        所以它落在「解放」这一类：出手不给伤害，给自己一份全技能倍率乘算。
        代价有两头：耗体 6、冷却 5，而且**解封之后还要过两拍**才列得出来
        （openAfter 2）—— 门一解就能甩的话，那五下启动就只是纯亏的过场。
      */
      place('解放', {
        id: 'hikari-burst', name: '旧吉他 · 解封', axis: '意志力', fx: 'noise',
        openAfter: 2, cost: 6, cd: 5, turns: 3,
        desc: '到达点之前的那一步：把白吉他上最后一道锁拧开，阀门全开。'
          + '此后三拍里，她每一手打出去的分量都比原来重一倍。'
          + '解封之后还要先过两拍才压得住它 —— 这门东西不是拿起来就能甩的。',
        line: '「从小学四年级开始，我就分出自己的力量去封印吉他了。这种开放感，还真是久违了啊。」',
      }),
      // 人类最强的一击：全表单体倍率之首
      place('到达点', {
        id: 'hikari-peer', name: '樱色奇迹 · 对位强音', power: 5.0, fx: 'guitar',
        desc: '恋兔光把音压指向一个对手，全力挥下。被点名的那个，要独自承下她全部的琴音。',
        // 终结技的那一句：对着「以为人类伤不到神」的对手说完，才挥下吉他
        line: '「——给我像星屑一样，灰飞烟灭吧！」',
      }),
      place('启动', {
        id: 'hikari-start', name: '解封试音', fx: 'guitar',
        desc: '调准音、拧紧每一根弦。需先后打出 5 次，普攻与技能才会解禁。',
        line: '「来吧，摇滚要开始了！」',
      }),
    ],
  },

  luna: {
    cls: '织线者',
    sub: '把身体拆成丝线、再在别处织回来的支援位',
    trait: '解体—重组：丝线之躯没有要害。行动条的推进与回撤，都只是「移动了多少身体」而已。',
    skills: [
      place('basic', {
        id: 'luna-atk', name: '丝线 · 突刺', fx: 'seal',
        desc: '银色的铁丝以子弹般的速度飞出，准确地刺中要害。',
        line: '「——去死吧，混蛋！」',
      }),
      place('屏障', {
        id: 'luna-wall', name: '丝线 · 结界', axis: '物理抗性', fx: 'guard',
        desc: '织出一面网，替全队吃掉一部分冲力。',
        line: '「快走！这个结界撑不了太久！」',
      }),
      place('自愈', {
        id: 'luna-reweave', name: '解体 · 重组', axis: '反现实亲和', fx: 'seal',
        desc: '把九成九的身体移到别处再织回来：自身回复，并抢回一截行动条。',
        line: '「该说对不起的是我啦。我啊，光是心脏被打穿还死不了呢。」',
      }),
      place('强袭', {
        id: 'luna-blade', name: '银线西洋剑', power: 1.85, fx: 'slash',
        desc: '丝线变作银色西洋剑，一击瘫痪比自己大得多的对手。',
        line: '「去死。」',
      }),
      place('到达点', {
        id: 'luna-burst', name: '与主人同在', power: 0, axis: '反现实亲和',
        target: 'allyAll', fx: 'heal',
        effect: { heal: 0.7, shield: 0.5, cleanse: true },
        desc: '当那个人迎来死亡之时，无论距离、次元与法则，她都会出现在他身边。'
          + '这一手由她上前，替全队把这一难承下来。',
        line: '「——我将献上我的全部。所以，你也把一切都交给我吧。」',
      }),
    ],
  },

  mefisa: {
    cls: '骑手',
    sub: '以八脚马变形支援全队 · 决定谁先抵达战场',
    trait: '八脚马：为了「无论何处都能抵达」的弹痕。它会变成枪、变成装甲、变成载具——副官要什么，它就长成什么。',
    skills: [
      place('basic', {
        id: 'mefisa-atk', name: '八脚马 · 短点射', fx: 'guitar',
        desc: '变形步枪的短点射。', line: '「——你是我的翅膀，我的子弹。我的爱马啊，像暴风雨一样呼啸吧。」',
      }),
      place('提速', {
        id: 'mefisa-ride', name: '八脚马 · 载具', axis: '敏捷度', target: 'allyOne',
        fx: 'drone', cd: 3, effect: { spdUp: 0.55, pushBar: 0.4, selfToo: true },
        desc: '八脚马变形为一台交通工具，载上她自己与另一名同伴一起冲出去：'
          + '两人行动条前推、充能明显提速。冷却 3 拍。',
        line: '「……是的。因此它变成了载具。为了能够去往任何地方，哪怕是异界。」',
      }),
      place('屏障', {
        id: 'mefisa-armor', name: '八脚马 · 卸甲', axis: '物理抗性', fx: 'guard',
        effect: { shield: 0.42 },
        desc: '八脚马的装甲卸下来分给全队：弹珠都会被轻松弹开。',
        line: '「——这里，就由我们来争取时间。」',
      }),
      place('强袭', {
        id: 'mefisa-cannon', name: '吞噬我吧，我的爱马', power: 2.2, fx: 'blast',
        desc: '八脚马吞掉她的手臂，形成两把超过三米的巨大步枪。',
        line: '「吞噬我吧，我的爱马。让我们一起冲过死亡之湖吧！」',
      }),
      place('到达点', {
        id: 'mefisa-burst', name: '无论何处都能抵达', power: 0, axis: '反现实亲和',
        target: 'allyAll', fx: 'drone',
        effect: { pushBar: 0.85, spdUp: 0.3, pushBack: 0.5 },
        desc: '八脚马把全队直接载到「应有的位置」——全体回满行动条，并把敌人推离坐标。',
        line: '「八脚马是——为了『无论何处都能抵达』的弹痕。」',
      }),
    ],
  },

  nyau: {
    cls: '掷换手',
    sub: '用换位打乱坐标的护卫 · 队里最小的那只手',
    trait: '沙姆希尔：子弹不追求命中——弹匣里的子弹与「目标」的位置会被互换。小柴的小是小狗的小。',
    skills: [
      place('basic', {
        id: 'nyau-atk', name: '沙姆希尔 · 击发', fx: 'guitar',
        desc: '老式左轮的一响。命不命中，其实不打紧。', line: '「——沙姆希尔！」',
      }),
      place('提速', {
        id: 'nyau-swap', name: '换位 · 掩护', axis: '敏捷度', fx: 'seal',
        effect: { evade: 0.3, pushBar: 0.35 },
        desc: '把同伴从必死的坐标里换出来：全队闪避大幅提升，自身行动条一并前推。',
        line: '「沙，沙姆希尔……」',
      }),
      place('驱逐', {
        id: 'nyau-void', name: '掷入真空', power: 1.7, axis: '反现实亲和', fx: 'seal',
        effect: { pushBack: 0.6, hits: 1 },
        desc: '把远处的敌人直接与子弹换位，掷进无声的宇宙——伤害之外，还把它推出好远。',
        line: '「没关系。那里没有声音。因为是真空。」',
      }),
      place('到达点', {
        id: 'nyau-burst', name: '亚音速质量投送', power: 2.6, axis: '反现实亲和',
        target: 'all', fx: 'blast',
        desc: '把载着高压气体的二十吨油罐车与目标互换——火力有点搞错了，诶嘿。',
        line: '「火力有点搞错了……诶嘿☆」',
      }),
    ],
  },

  youshihan: {
    cls: '赌徒',
    sub: '效果随机、性能极端的前辈 · 你永远押不准她抽到哪一张',
    trait: '四大凶兽：四张牌里总有一张是极端的，可惜不知是哪张。',
    skills: [
      place('basic', {
        id: 'youshihan-atk', name: '打个哈欠 · 拂', fx: 'seal',
        desc: '一副没睡醒的样子，随手拍出去的一下。', line: '「……呼哇……好困……下一个出场的是我吗？」',
      }),
      // 四张牌里总有一张是极端的，可惜不知是哪张 —— 所以倍率摇得比谁都宽
      place('乱击', {
        id: 'youshihan-lot', name: '四大凶兽 · 抽签', power: 2.4, variance: 0.75,
        fx: 'noise', cd: 3,
        desc: '掷一次签：手气好能把目标一记打穿，手气差只够挠一下——凶兽的力量本来就不听话。',
        line: '「出来吧，四大凶兽之一——浑沌！」',
      }),
      place('自愈', {
        id: 'youshihan-fate', name: '留级的直觉', axis: '意志力', target: 'self',
        fx: 'guard', effect: { evade: 0.4, pushBar: 0.4, heal: 0, cleanse: false },
        desc: '懒得挪步，却总能站到不该站的地方：自身闪避提升并回一截气。',
        line: '「呼啊……这是哪？陌生的天花板？久违一年的阳光，好刺眼啊……」',
      }),
      place('到达点', {
        id: 'youshihan-end', name: '四大凶兽 · 全开', power: 3.0, variance: 0.4,
        fx: 'noise',
        desc: '四张牌一起翻开——凶兽的力量本来不听话，可四只一起压上来的时候，'
          + '不听不听话已经无所谓了。',
        line: '「『四大凶兽』是我精神特质的具现——即我的弹痕强烈地反映了我的四重人格。」',
      }),
    ],
  },

  'alive-anatolia': {
    cls: '撰史者',
    sub: '以「散文」撰写委员会的未来 · 会长席上的那一笔',
    trait: '如散文般：一击可贯穿过去，把干涉送往因果的开端。战场上她改的不是结果，是起因。',
    skills: [
      place('basic', {
        id: 'alive-atk', name: '散文 · 断句', fx: 'blast',
        desc: '把一句话拦腰截断。', line: '「——『「如散文般』。」',
      }),
      place('重压', {
        id: 'alive-past', name: '贯穿过去', axis: '反现实亲和', fx: 'noise',
        effect: { pushBack: 0.75, slow: 0.35, mark: 0.2 },
        desc: '把干涉送回三十年前、三百公里外，在开端处落下决定性的一笔——'
          + '敌人的行动条被从起因上抹去。',
        // 把干涉送回因果开端的那一手，用的是她自己那句话 —— 她早就把「放弃」两个字划掉了
        line: '「我已经——放弃『放弃』这件事了。」',
      }),
      place('增益', {
        id: 'alive-edit', name: '撰写', axis: '反现实亲和', fx: 'seal',
        effect: { atkUp: 0.3, spdUp: 0.3 },
        desc: '为全队补上一行注脚：攻击与充能一并上扬。',
        line: '「——让你成为我的俘虏，成为我可爱的狗狗吧。」',
      }),
      place('到达点', {
        id: 'alive-burst', name: '会长的一笔', power: 2.4, axis: '反现实亲和',
        target: 'all', fx: 'noise',
        desc: '直接改写这一战的结末。', line: '「——我在此宣判：对你，执行即刻销毁处分。」',
      }),
    ],
  },

  'vern-simon': {
    cls: '情报官',
    sub: '信息处理的极致 · 他休息五天，学园就会崩溃',
    trait: '调度：战场上没有他不知道的数。看一眼，就把对手的底数摊在桌面上。',
    skills: [
      place('basic', {
        id: 'vern-atk', name: '精准点射', fx: 'drone',
        desc: '不求多，只求打在算过的那一格。', line: '「不需要第二发。」',
      }),
      place('牵制', {
        id: 'vern-scan', name: '黑档库 · 解析', axis: '反现实亲和', fx: 'drone',
        effect: { mark: 0.35, slow: 0.25 },
        desc: '把目标的弱点摊成一张表：全队打它更重，且它充得更慢。',
        line: '「『死灵次元』所使用的传送门并不是物质性的东西，而是一种更接近现象的存在。」',
      }),
      place('提速', {
        id: 'vern-dispatch', name: '黑档库 · 调度', axis: '意志力', fx: 'drone',
        effect: { pushBar: 0.45 },
        desc: '把观测到的时机分发给全队：行动条一同前推。', line: '「A-11小队向后方撤退300米，支援部队已经部署在建筑高层。C-7小队，从东侧小巷穿越大道，掩护D-3中队。」',
      }),
      place('到达点', {
        id: 'vern-end', name: '黑档库 · 底数总清算', power: 2.6, axis: '反现实亲和',
        fx: 'drone', effect: { mark: 0.5 },
        desc: '把一整场观测到的全部弱点一次结算掉：那一手出去之后，'
          + '这个对手在他眼里就再也没有没被写过的地方了。',
        line: '「你们的命，我会以最高效率的方式加以使用。哪怕是为了将奇迹发生的概率提高0.001%。」',
      }),
    ],
  },

  'xiaochai-lin': {
    cls: '工造师',
    sub: '随身带着一台悬浮 3D 打印机 · 需要什么就当场造出来',
    trait: '爪：能用激光把照射到的物质塑造成任意形状——墙、乐器、通行证，皆可当场造出。',
    skills: [
      place('basic', {
        id: 'xiaochai-atk', name: '爪 · 激光塑形', fx: 'drone',
        desc: '把照射到的物质削下一块。', line: '「动手——爪。」',
      }),
      place('屏障', {
        id: 'xiaochai-wall', name: '现场造物 · 木墙', axis: '反现实亲和', fx: 'guard',
        effect: { shield: 0.44 },
        desc: '对着空气打一束激光，当场立起一堵墙。', line: '「上吧。爪！」',
      }),
      place('穿甲', {
        id: 'xiaochai-pierce', name: '神明为材', power: 1.9, axis: '反现实亲和', fx: 'drone',
        desc: '以旧神的神经制成的特别型号：无视护甲的一击。',
        line: '「这玩意是用存在于遥远彼方的神明为材料制成的……不是能解析然后再现出来的替代品。」',
      }),
      place('到达点', {
        id: 'xiaochai-end', name: '爪 · 万物皆为材', power: 2.8, axis: '反现实亲和',
        fx: 'drone', effect: { pierce: true },
        desc: '把照射范围内的一切——包括对面那具身体——当场改写成她要的形状。'
          + '这一类东西理论上什么都能造，只是造完就没有第二份材料了。',
        line: '「用我的爪，把她改造成可爱的泰迪熊好了。」',
      }),
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
      place('basic', {
        id: 'danae-atk', name: '黑锤 · 砸', fx: 'slash',
        desc: '不讲究的一记重砸。', line: '「啊哈哈哈哈！不错嘛！不过——还是我更快啊。」',
      }),
      place('增益', {
        id: 'danae-mode', name: '认真模式SSS', axis: '意志力', target: 'self',
        fx: 'slash', effect: { atkUp: 0.7, shield: 0.3 },
        desc: '挺直脊背、长高一截：攻击大幅上扬，并硬吃下一轮冲击。',
        line: '「我，选择相信艾梅·库尔·杜·琉米爱尔。」',
      }),
      place('强袭', {
        id: 'danae-crush', name: '黑锤 · 碎城', power: 2.05, fx: 'blast',
        desc: '高逾一米九的那一锤，落下时地面先塌。', line: '「神流式拔刀术——碎龙。」',
      }),
      place('到达点', {
        id: 'danae-end', name: '黑锤 · 落城', power: 2.9, fx: 'blast',
        desc: '一米九的那个人把锤子举过头顶，砸下去的是「黑锤部队」这四个字本身。',
        line: '「毕竟我也是『黑锤部队』的队长」',
      }),
    ],
  },

  'nana-kamiru': {
    cls: '称量者',
    sub: '能把重量自由增减的球棒 · 连终末都要先掂量掂量自己有多重',
    trait: '大麻烦：击中对象的重量任意增减。增物重至三倍，或把对方自重提至数十倍——寸步难行。',
    skills: [
      place('basic', {
        id: 'nana-atk', name: '大麻烦 · 挥', fx: 'slash',
        desc: '分量刚好的一棒。', line: '「『大・麻・烦』！」',
      }),
      place('重压', {
        id: 'nana-heavy', name: '大麻烦 · 增重', axis: '物理抗性', fx: 'blast',
        effect: { pushBack: 0.45, slow: 0.45 },
        desc: '把敌方全体的自重提到数十倍：它们几乎挪不动，充能大幅滞后。',
        line: '「吃我一招——『大麻烦』！」',
      }),
      place('驱逐', {
        id: 'nana-light', name: '大麻烦 · 减重', power: 1.8, fx: 'slash',
        effect: { pushBack: 0.5 },
        desc: '把对手体重降到几十分之一，一棒送它离场。',
        line: '「出发了哦——大麻烦！」',
      }),
      place('到达点', {
        id: 'nana-end', name: '大麻烦 · 掂量完毕', power: 2.6, axis: '物理抗性',
        target: 'all', fx: 'blast', effect: { pushBack: 0.6, slow: 0.3 },
        desc: '给全场每一个东西都称一遍：轻的送走，重的压住 —— '
          + '这一手过后，战场上谁站在哪里就由她说了。',
        line: '「都说别小瞧我了！『大麻烦』的能力可是能把接触到的物体的重量翻三倍呢！」',
      }),
    ],
  },

  reiya: {
    cls: '斩伐者',
    sub: '形如巨型电锯的斩击 · 轰鸣着切开一切低 R 值的幻想',
    trait: '热沃当的少女：被诅咒的巨兽之名。这把锯子最初为狩猎而转，直到有人教会它守护。',
    skills: [
      place('basic', {
        id: 'reiya-atk', name: '热沃当 · 咬', fx: 'slash',
        desc: '电锯咬进屏障的声响。', line: '「——热沃当的少女！」',
      }),
      place('扫荡', {
        id: 'reiya-cut', name: '热沃当的少女 · 全锯', power: 1.65, fx: 'slash',
        desc: '横抡一圈，把一切低 R 值的东西一并切开。',
        line: '「要杀死不死者，就必须切断其力量的供给源！——热沃当的少女！」',
      }),
      place('屏障', {
        id: 'reiya-oath', name: '共奏之约', axis: '意志力', fx: 'guard',
        effect: { shield: 0.4, pushBar: 0.2 },
        desc: '篝火之国那一夜的约定：这把锯子第一次为守护而转动。全队减伤并回气。',
        line: '「我是蕾雅·库尔·杜·琉米爱尔。我以我的骄傲起誓，我一定会保护你！」',
      }),
      /*
        到达点 = 「热沃当的少女 · 祈祷之歌」（斩衣电锯的那一手，不是合体形态）。
        原文的写法：这记的效力是「那把电锯能够反转接触到的现象」，
        代价是「她过去幸福的回忆」——所以它不认对面挂着什么，也不留自己的旧账。
        注：与心叶合体的「心蕾雅」是另一回事（合体形态，战绩不计入她的本轴），
        所以这一手不要心叶在场、也不带合体机制。
      */
      place('到达点', {
        id: 'reiya-end', name: '热沃当的少女 · 祈祷之歌', power: 3.2, fx: 'slash',
        effect: { pierce: true, cleanse: true },
        desc: '锯刃所过之处，现象倒过来走：对方的减伤与闪避在她这里都不算数，'
          + '缠在她自己身上的负面也一并反转掉。唱这一首歌的价钱是她过去幸福的回忆 ——'
          + '另一个次元的蕾雅已经付过一次了。',
        line: '「……小言。这首曲子，是我回忆里的歌。」',
      }),
    ],
  },

  emei: {
    cls: '统率者',
    sub: '被称为「王子殿下」的评议会副议长 · 完美的领队',
    trait: '号令：只要她还站着，队伍就不会先垮。',
    skills: [
      place('basic', {
        id: 'emei-atk', name: '佩剑 · 行礼', fx: 'slash',
        desc: '先执礼，再出手。', line: '「呵呵……那可真是荣幸之至呢。」',
      }),
      place('增益', {
        id: 'emei-order', name: '佩剑 · 号令', axis: '意志力', fx: 'seal',
        effect: { atkUp: 0.4, cleanse: true },
        desc: '一声令下，全队攻击与意志一并上扬。',
        line: '「就算有一天我们倒下了，名字也会刻在这把刀上，总会有人记得我们。」',
      }),
      place('屏障', {
        id: 'emei-guard', name: '佩剑 · 殿后', axis: '物理抗性', fx: 'guard',
        effect: { shield: 0.38, pushBar: 0.25 },
        desc: '副议长殿后：全队减伤，并甩开身后的追兵。', line: '「争取时间？错了！我是为了战胜你而来——为了守护我爱的人而来！」',
      }),
      // 统率者的到达点不落在敌人身上：她把整支队伍当这一手打出去
      place('到达点', {
        id: 'emei-end', name: '评议会 · 总攻', power: 0, axis: '意志力',
        target: 'allyAll', fx: 'seal',
        effect: { atkUp: 0.6, spdUp: 0.5, cleanse: true },
        desc: '把「王子殿下」这四个字立在这一拍上：全队攻击、充能与状态一次理清。'
          + '她自己不出手 —— 她出的是这支队伍。',
        line: '「好了，契约已经完成了。试炼要开始咯！大家，一秒钟都不能松懈！」',
      }),
    ],
  },

  'isis-halid': {
    cls: '取材者',
    sub: '卡乌斯的记者 · 追独家新闻时寸步不让',
    trait: '取材：她先记下来，队伍再打。被记录的目标没有秘密。',
    skills: [
      place('basic', {
        id: 'isis-atk', name: '快门 · 闪光', fx: 'drone',
        desc: '一记闪光，晃得人睁不开眼。', line: '「——号外号外。」',
      }),
      place('牵制', {
        id: 'isis-scoop', name: '独家取材', axis: '反现实亲和', fx: 'drone',
        effect: { mark: 0.3, slow: 0.2, pushBack: 0.2 },
        desc: '把目标的破绽写进稿子：全队打它更重，它的充能也跟着慢下来。',
        line: '「这可是一条超级劲爆的独家新闻☆我绝对会揪住你的尾巴，将真相公之于众！」',
      }),
      place('提速', {
        id: 'isis-live', name: '实况解说', axis: '敏捷度', fx: 'seal',
        effect: { spdUp: 0.45, pushBar: 0.2 },
        desc: '就像在天空竞技祭那样，把全场的节奏念出来：全队充能提速。',
        line: '『好的，吴选手发动穷奇……玛丽娅选手的「天下无双的公主大人 」也同时发动……然后——哇哦？！ 这是怎么回事——？！』',
      }),
      place('到达点', {
        id: 'isis-end', name: '独家 · 头版', power: 2.4, axis: '反现实亲和',
        target: 'all', fx: 'drone', effect: { mark: 0.5 },
        desc: '把一整场的取材一次付印、发到每一个人的手上——'
          + '被印出来的东西就没有秘密，也就没有躲得掉的余地。',
        line: '『能看到吗，这是10分钟前的记录世界！快进到比赛开始吧♪』',
      }),
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
      place('basic', {
        id: 'katherine-atk', name: '英雄不灭 · 拳', fx: 'blast',
        desc: '如雷电般的一拳。', line: '「振翅高飞！这是良机，同时，这也是战争！」',
      }),
      place('增益', {
        id: 'katherine-born', name: '英雄不灭', axis: '意志力', target: 'self',
        fx: 'guard', effect: { atkUp: 0.55, shield: 0.3 },
        desc: '把伤口的血当成燃料：自身攻击随已失血量上扬，并硬吃一轮。',
        line: '「看到比我更强的人——居然让我如此热血沸腾。」',
      }),
      place('强袭', {
        id: 'katherine-flame', name: '终焉的火焰', power: 2.35, axis: '意志力',
        fx: 'noise',
        desc: '不再以受伤变强，而是直接燃烧生命换取力量——英雄赌上性命的最后一击。',
        line: '「好啊。机会难得，那个称号，今天我就收下了。」',
      }),
      place('到达点', {
        id: 'katherine-end', name: '英雄不灭 · 最后一拳', power: 3.0, axis: '意志力',
        fx: 'blast',
        desc: '「英雄」这两个字不是称号，是她决定站着不倒的那一下。'
          + '血越薄越重 —— 这一拳按她现在还剩多少来算。',
        line: '「……要和我硬碰硬?没问题吗?看来你……很想比比力气啊?」',
      }),
    ],
  },

  'alex-cave': {
    cls: '盾',
    sub: '午夜降临时化为现世最坚硬的物质 · 企业联合的盾',
    trait: '午夜降临：任何攻击都无法在他身上留下划痕。他站着，后面的人就不必挨打。',
    skills: [
      place('basic', {
        id: 'alex-atk', name: '午夜降临 · 硬质', fx: 'blast',
        desc: '硬得像铁的一拳。', line: '「喂喂，怎么啦？你不是挺猛的吗？练得也太半吊子了吧。」',
      }),
      place('坚守', {
        id: 'alex-midnight', name: '午夜降临', axis: '物理抗性', fx: 'guard',
        effect: { shield: 0.7, taunt: true },
        desc: '身躯化为最坚硬之物：大幅减伤，并引着敌人往他这边打。',
        line: '「我可是能重塑身体的人啊？内脏什么的，稍微挪一下位置，也不是不能办到吧！」',
      }),
      place('屏障', {
        id: 'alex-wall', name: '午夜降临 · 盾墙', axis: '物理抗性', fx: 'guard',
        effect: { shield: 0.42 },
        desc: '把坚硬分给身边的人：全队减伤。', line: '「交给我吧。」',
      }),
      place('到达点', {
        id: 'alex-end', name: '午夜降临 · 全境', power: 0, axis: '物理抗性',
        target: 'allyAll', fx: 'guard',
        effect: { shield: 0.6, cleanse: true },
        desc: '把「最坚硬」这件事铺满整片战场：这一轮里，谁都不必挨打。',
        line: '「——打算在这种距离跟我打吗？别看不起人了！」',
      }),
    ],
  },

  phidra: {
    cls: '交涉者',
    sub: '被视为下一任会长的那种人 · 认识他的无不折服',
    trait: '好比赛：他从不逼人交手，只是让人自愿走进规则里。',
    skills: [
      place('basic', {
        id: 'phidra-atk', name: '利刃 · 掠', fx: 'slash',
        desc: '彬彬有礼的一刀。', line: '「——几日不见呢，言万同学。」',
      }),
      place('牵制', {
        id: 'phidra-match', name: '来一场好比赛吧', axis: '反现实亲和', fx: 'seal',
        effect: { pushBack: 0.55, mark: 0.25, slow: 0.2 },
        desc: '把目标请进他的规则：行动条大幅推后，攻击随之萎顿。',
        line: '「让我们来一场好比赛吧。」',
      }),
      place('增益', {
        id: 'phidra-stake', name: '赌注', axis: '意志力', fx: 'seal',
        effect: { atkUp: 0.35, cleanse: true },
        desc: '为全队垫上一笔底气：攻击上扬，并解除负面。',
        line: '「——世界正处于毁灭的边缘。我当然要拼死战斗。这是理所当然的吧？」',
      }),
      place('到达点', {
        id: 'phidra-end', name: '赌局结算', power: 2.5, axis: '反现实亲和',
        fx: 'seal', effect: { mark: 0.4, pushBack: 0.5 },
        desc: '走进他规则里的东西，最终都要按他的算法结一次账。',
        line: '「……呵呵。你真是个奇怪的人。好啊，来吧！言万心叶！」',
      }),
    ],
  },

  maria: {
    cls: '偶像',
    sub: '把感情唱成现实的舞台公主 · 也是第 6 区的镇痛剂',
    trait: '天下无双的公主大人：台下的欢呼、观众的心跳，都会在旋律中成真。',
    skills: [
      place('basic', {
        id: 'maria-atk', name: '麦克风 · 拍', fx: 'guitar',
        desc: '与楚楚可怜的外表相反的一下。', line: '「请多多支持我哦！音乐，开始！」',
      }),
      place('治愈', {
        id: 'maria-song', name: '公主的独唱', axis: '反现实亲和', fx: 'heal',
        effect: { heal: 0.45, atkUp: 0.25, cleanse: true },
        desc: '唱一支止痛的歌：全队回复并把士气提上去。',
        line: '「——如果明天会是晴天的话♪」',
      }),
      place('提速', {
        id: 'maria-encore', name: '安可', axis: '敏捷度', fx: 'guitar',
        effect: { pushBar: 0.5 },
        desc: '返场加演：全队立刻抢回一截行动条。', line: '「谢谢大家——！我会努力的！请多多支持我哦！」',
      }),
      place('到达点', {
        id: 'maria-end', name: '安可 · 最后一句', power: 0, axis: '反现实亲和',
        target: 'allyAll', fx: 'heal',
        effect: { heal: 0.6, atkUp: 0.4, pushBar: 0.3, cleanse: true },
        desc: '把整场演唱会一次唱完：台下的心跳全部变成现实，全队一起站起来。',
        line: '「我会以向您请教的心情全力迎战！来吧——『天下无双的公主大人』！」',
      }),
    ],
  },

  'merwen-gray': {
    cls: '瞬步者',
    sub: '外表文静的文学少女 · 实则狠辣的武斗派',
    trait: '愚者的足迹：只在想逃的地方留下脚印——她从不逃跑，只换坐标。',
    skills: [
      place('basic', {
        id: 'merwen-atk', name: '足迹 · 袭', fx: 'slash',
        desc: '不知不觉已经贴到面前。', line: '「那就是传说中的沙姆希尔吗。真是廉价的能力呢。」',
      }),
      place('提速', {
        id: 'merwen-step', name: '愚者的足迹', axis: '敏捷度', target: 'self',
        fx: 'drone', effect: { evade: 0.45, pushBar: 0.55, spdUp: 0.2 },
        desc: '瞬移到「刚刚想到的地方」：自身闪避大幅提升，并抢回行动条。',
        line: '「我可不喜欢一直输啊——来吧，第二回合！」',
      }),
      place('强袭', {
        id: 'merwen-hunt', name: '狠辣的一击', power: 1.95, fx: 'slash',
        desc: '踩着瞬移的余势打出去，专挑落点。',
        line: '「去死吧。」',
      }),
      place('到达点', {
        id: 'merwen-end', name: '愚者的足迹 · 终点', power: 3.0, axis: '敏捷度',
        fx: 'slash', effect: { pushBar: 0.4 },
        desc: '她说自己不逃，只换坐标。那这一下就是「换到对手身上」——'
          + '落点不在任何地方，在他背后。',
        line: '「——那么，开始反击吧。你应该已经做好被我痛扁一顿的准备了吧?」',
      }),
    ],
  },

  ameria: {
    cls: '守望者',
    sub: '以亡者的形态注视着第 6 区 · 无处不在的目光',
    trait: '注视着你：意识量子化、无限增殖——城市中的每一双眼、每一扇窗都是她的目光。',
    skills: [
      place('basic', {
        id: 'ameria-atk', name: '注视 · 凝', fx: 'seal',
        desc: '从某个窗口落下来的一道视线。', line: '「『呵呵。因为我是学生会长呀♪ 记住大家的名字可是我的特长哟——』」',
      }),
      place('扫荡', {
        id: 'ameria-all', name: '无处不在', power: 1.6, axis: '反现实亲和', fx: 'seal',
        effect: { pierce: true },
        desc: '每一扇窗同时睁开：对敌方全体造成无视闪避的一击。',
        line: '「『我可是无限存在于这座城市里的哟♪』」',
      }),
      place('牵制', {
        id: 'ameria-fix', name: '注视 · 定', axis: '反现实亲和', fx: 'drone',
        effect: { mark: 0.35, pushBack: 0.4, slow: 0.3 },
        desc: '把目光钉在目标身上：它再难挪动，也更容易被打中。',
        line: '「是呢。所以就由我，来代替你们去思考呀♡」',
      }),
      place('到达点', {
        id: 'ameria-end', name: '无处不在 · 全城睁眼', power: 2.7, axis: '反现实亲和',
        target: 'all', fx: 'seal', effect: { pierce: true },
        desc: '第 6 区的每一扇窗、每一只眼在同一拍里睁开，把整座城市的目光一起放出去。'
          + '杀掉一个还有别的 —— 这一手本来就不是一个人打的。',
        line: '「我——也会让你们幸福。」',
      }),
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
      place('basic', {
        id: 'kuro-atk', name: '风与沙 · 扬沙', fx: 'noise',
        desc: '抬手间，影子先动。沙砾比风晚一步到，却一定到。', line: '「那么——我上了，怪物。世界不需要像你这样的东西。」',
      }),
      place('扫荡', {
        id: 'kuro-wind', name: '风与沙 · 卷风', power: 1.75, axis: '反现实亲和',
        fx: 'noise',
        desc: '风那一支：把海面劈开的巨大影子随风暴一同压过来。',
        line: '「吾乃魔王！是与世界相对之人。绝不败北之人。不屈于光，勇往直前之人！」',
      }),
      place('重压', {
        id: 'kuro-sand', name: '风与沙 · 落沙', axis: '反现实亲和', fx: 'noise',
        effect: { slow: 0.3, mark: 0.25, pushBack: 0.3 },
        desc: '沙那一支：细密的沙落进每一道缝隙，把对手的脚步与节奏一并埋住。',
        line: '「像你这样的终末，我，绝不饶恕。」',
      }),
      place('解厄', {
        id: 'kuro-chain', name: '风与沙 · 解镣', axis: '意志力', fx: 'noise',
        desc: '两支合一，把束缚连同这一带的规则一并吹散：全队脱离减益，行动条前推。',
        line: '「——我会这么做。——你呢？」',
      }),
      place('到达点', {
        id: 'kuro-burst', name: '风与沙 · 沙暴', power: 2.6, axis: '反现实亲和',
        target: 'all', fx: 'noise',
        desc: '风和沙同时收拢——那是她在货船甲板上第一次抬手的样子。',
        line: '「我！不会放弃我的梦想！绝对不会舍弃希望！！」',
      }),
    ],
  },

  yiregel: {
    cls: '龙骑士',
    sub: '出身异界「龙之国」的心腹 · 持有名为「龙花」的加护',
    trait: '龙花：一种既非弹痕亦非斩击的加护。龙之国的东西，不按这边的规矩运转。',
    skills: [
      place('basic', {
        id: 'yiregel-atk', name: '龙花 · 斩', fx: 'noise',
        desc: '带着异界气息的一击。', line: '「……举起双手，趴在地上。敢再碰武器的话，下一发就杀了你。」',
      }),
      place('强袭', {
        id: 'yiregel-bloom', name: '龙花 · 开', power: 2.0, axis: '反现实亲和',
        fx: 'noise', effect: { pushBar: 0.35 },
        desc: '龙花绽放：一击贯穿，并顺势把自己的行动条推满一截。',
        line: '「但是抱歉。我要你死。妨碍她的所有人，全都一样。」',
      }),
      place('屏障', {
        id: 'yiregel-ward', name: '龙的加护', axis: '物理抗性', fx: 'guard',
        effect: { shield: 0.4, cleanse: true },
        desc: '以加护覆住同伴：减伤并解除异常。', line: '「不行。你必须要活下去……正因为是你这样的人，才——」',
      }),
      place('到达点', {
        id: 'yiregel-end', name: '龙花 · 满开', power: 3.1, axis: '反现实亲和',
        fx: 'noise',
        desc: '加护不是慢慢开的。那一瞬间它整朵撑开 —— 龙之国的东西不按这边的规矩运转，'
          + '包括「被打倒」这条。',
        line: '「不允许你们——碰这位高洁的人啊！」',
      }),
    ],
  },

  'touyi-caojiro': {
    cls: '浪人',
    sub: '总是开着玩笑、嬉皮笑脸 · 让人看不懂真意的少年',
    trait: '与世无争：他珍爱日常，所以出手时从不用尽全力——敌人也因此总摸不准他。',
    skills: [
      place('basic', {
        id: 'touyi-atk', name: '玩笑 · 拍', fx: 'slash',
        desc: '看着像在闹，其实打得不轻。', line: '「……我、我也是有好几下打中的好不好！」',
      }),
      place('牵制', {
        id: 'touyi-joke', name: '插科打诨', axis: '意志力', fx: 'seal',
        effect: { slow: 0.35, pushBack: 0.35, mark: 0.15 },
        desc: '把对手的节奏搅乱：攻击萎顿、行动条错位。',
        line: '「……………………开玩笑的啦。」',
      }),
      place('治愈', {
        id: 'touyi-daily', name: '守住日常', axis: '意志力', fx: 'heal',
        effect: { shield: 0.3, heal: 0.3, cleanse: true },
        desc: '他护住的是很普通的东西：全队减伤并回复。',
        line: '「彼此彼此，心叶……只有你，说过我是个普通人。」',
      }),
      place('到达点', {
        id: 'touyi-end', name: '今天的晚饭', power: 2.4, axis: '意志力', fx: 'slash',
        effect: { heal: 0.4, cleanse: true },
        desc: '他要守的东西一直很具体：一顿饭、一个晚上、一个人在等。'
          + '这一手打出去之后，全队身上的东西都会轻一点。',
        line: '「无论在哪个世界、哪个地方，我们都是朋友。这个理由，难道不够吗？」',
      }),
    ],
  },

  'huda-nayume': {
    cls: '领队',
    sub: '提前算好未来几步 · 深不可测的少女',
    trait: '预读：对内像姐姐，对外毫不留情。她已经在想第三步了。',
    skills: [
      place('basic', {
        id: 'huda-atk', name: '先手 · 制', fx: 'slash',
        desc: '等你反应过来时已经挨了。', line: '「……下次我会做得更隐蔽的。」',
      }),
      place('提速', {
        id: 'huda-read', name: '预读', axis: '敏捷度', fx: 'drone',
        effect: { pushBar: 0.8, spdUp: 0.35 },
        desc: '把未来几步摊开：全队行动条大幅前推，并抢在对手之前。',
        line: '「不过，我们也得考虑一下今后的立场了。」',
      }),
      place('牵制', {
        id: 'huda-lock', name: '算死', axis: '反现实亲和', fx: 'seal',
        effect: { pushBack: 1.0, mark: 0.4 },
        desc: '把目标的退路一步步堵上：行动条清零，并标记为全队靶子。',
        line: '「我们来谈谈吧。因为我是用手机在操控瞄准，所以也没把握只打穿腿之类的〜」',
      }),
      place('到达点', {
        id: 'huda-end', name: '终局预读', power: 2.5, axis: '反现实亲和', fx: 'seal',
        effect: { pushBack: 1.0, mark: 0.5 },
        desc: '她早就算到了这一拍。这一手不是「快」，是「本来就在那里」。',
        line: '「这个世界——是你的梦，小叶。」',
      }),
    ],
  },

  'yuina-yoshito': {
    cls: '斗士',
    sub: '宁可不吃饭，也要打上一架 · 顺从本能的野性派',
    trait: '本能：想都没想就已经冲出去了。抢得越早，打得越狠。',
    skills: [
      place('basic', {
        id: 'yuina-atk', name: '野性 · 扑', fx: 'blast',
        desc: '毫无预兆地贴近。', line: '「心叶。陪我练几招。」',
      }),
      place('连打', {
        id: 'yuina-rush', name: '顺从本能', power: 1.15, fx: 'blast',
        desc: '连打两下，中间没有停顿。', line: '「……啊。宰了你。」',
      }),
      place('提速', {
        id: 'yuina-flare', name: '锋芒毕露', axis: '敏捷度', fx: 'noise',
        effect: { spdUp: 0.4, pushBack: 0.25 },
        desc: '浑身锋芒炸开：全队充能提速，敌人被迫后退。',
        line: '「不。和他们敌对吧。那样就能和各种家伙战斗了。想想就爽。」',
      }),
      place('到达点', {
        id: 'yuina-end', name: '本能 · 全力', power: 2.9, fx: 'blast',
        effect: { hits: 3 },
        desc: '她从来没数过自己一拳打了几下。这一手也是 —— 停下来的时候对面已经输了。',
        line: '「该死……！该死……！该死啊！和我战斗啊！不是其他人，就和我啊！」',
      }),
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
   **每一条都必须留下至少一个有效果的字段** —— 只写名字与说明、
   一个数都不给的被动，在战场上等于不存在（passiveText 会在
   档案里把那几个数念出来，为空即视为漏写）。
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

/* ============================================================
   被动的读数 —— 把字段翻成人话
   ------------------------------------------------------------
   档案里以前只印被动的那句原文说明，一个数都不给：读的人没法学
   「他到底强在哪」。这里按字段逐条摊开，有几个念几个；
   一个都没有的会被标成「未写效果」——那是漏写，不是没有。
   ============================================================ */

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`

export function passiveText(p?: PassiveSpec): string[] {
  if (!p) return []
  const out: string[] = []
  if (p.regen) out.push(`每拍回复最大生命 ${pct(p.regen)}`)
  if (p.spRegen) out.push(`每拍回体 ${p.spRegen}`)
  if (p.spMax) out.push(`体力上限 ${p.spMax > 0 ? '+' : ''}${p.spMax}`)
  if (p.shield) out.push(`常驻减伤 ${pct(p.shield)}`)
  if (p.atk) out.push(`常驻攻击 ${pct(p.atk)}`)
  if (p.lowHpAtk) out.push(`残血时攻击再 ${pct(p.lowHpAtk)}`)
  if (p.spd) out.push(`常驻充能 ${pct(p.spd)}`)
  if (p.evade) out.push(`常驻闪避 ${pct(p.evade)}`)
  if (p.acc) out.push(`常驻命中 ${pct(p.acc)}`)
  if (p.sureHit) out.push('出手必中')
  if (p.headStart) out.push(`开场行动条领先 ${pct(p.headStart)}`)
  if (p.cdCut) out.push(`冷却每拍多减 ${p.cdCut}`)
  if (p.basicMul) out.push(`普攻倍率 ${pct(p.basicMul)}`)
  if (p.endure !== undefined) {
    out.push(p.endure < 0 ? '致命伤不死（不限次）' : `致命伤留 1 点（每场 ${p.endure} 次）`)
  }
  return out.length ? out : ['未写效果 —— 这一条要补']
}
