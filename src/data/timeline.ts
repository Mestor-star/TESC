import type { BondSnap, CharId, TimelineEvent } from './types'

/* ============================================================
   时间线：全六卷（第1卷 ~ 第6卷）＋ 外传插曲
   — 以一个事件的开始为一段；每段记录在该事件收束时，与四名成员的好感快照。
   — 内容逐卷按《这里是，终末停滞委员会。》原文考据整理（见各卷精读报告）。
   — 好感为终端内状态模拟值（原文无数字），走势与关键节点依各卷原文言行校准。
   ============================================================ */

type Evt = Omit<TimelineEvent, 'ga' | 'vol'>;

const B = (b: BondSnap): BondSnap => b;

const v1: Evt[] = [
  {
    id: 'v1-1', group: '卷1', order: 1, phase: '序章「船与影」', day: '第 0 日',
    title: '船与影', place: '太平洋 · 被弃的货船',
    summary: '因「知道太多秘密」，言万心叶被墨西哥黑手党「桑克雷・奥库尔塔」拴在货船甲板上准备抛海。前来诀别的干部拉斐尔・加西亚无力违抗命令。'
      + '一名被拘束服捆缚的漆黑少女自称「魔王」，与他分食糖果，随即其苍蓝「影」血洗全船；心叶落海自救，还反手救了不会游泳的拉法。'
      + '魔王临别立约：「看看是你先抵达青春，还是我先抵达终焉。」',
    entities: ['——'], chars: [], bond: {},
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['kuro-no-maou'],
  },
  {
    id: 'v1-2', group: '卷1', order: 2, phase: '序章「船与影」／第1话「这里是，终末停滞委员会」', day: '第 0 日',
    title: '女神神殿 · 转生之门的骗局', place: '命运与转生的女神・佩尔西奥涅 神殿',
    summary: '已溺死的心叶被「女神」召唤。自称女仆的丝线人偶露娜悉心照料他，却藏着一句被读到的恐惧心声。心叶拒绝神授能力，只想做个「普通的善良的人」。'
      + '他识破转生之门内是灵魂蓄积器TM 的「肉块」——所谓永恒的幸福梦，实为吞人的骗局。露娜拼死指向「快逃」被坠石压碎，恋兔光率恋兔队（梅芙、小柴喵呜随行）破门而入，把女神像连同骗局一起砸成星尘。',
    entities: ['NO.3922 灵魂蓄积器TM'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau'],
    bond: B({ luna: 55, hikari: 18, mefisa: 14, nyau: 10 }),
  },
  {
    id: 'v1-3', group: '卷1', order: 3, phase: '第1话「这里是，终末停滞委员会」', day: '第 1 日',
    title: '欢迎来到，终末停滞委员会', place: '苍之学园 · 异端审问室',
    summary: '露娜以「境界领域商会制造的反现实实体」受审，被判处即刻销毁。心叶一跃护在她身前——在骑士的刀剑下搏斗、断锁骨夺枪，靠读心伪装出「能预知未来」的底牌。'
      + '会长艾莉芙・安纳托利亚笑着裁定：两人以「苍之学园 体验入学」名义收留，由弗恩・西蒙监视。事件至此完成——你正式成为终末停滞委员会的一员。',
    entities: ['——'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'alive-anatolia', 'vern-simon'],
    bond: B({ luna: 78, hikari: 38, mefisa: 45, nyau: 40 }),
    unlock: true,
  },
  {
    id: 'v1-4', group: '卷1', order: 4, phase: '第2话「欢迎来到光明会」／第3话「出发，去集市！」', day: '第 1 日',
    title: '世界观与「欢迎会」', place: '苍之学园 · 学生会室 / 第12区集市 / 学生宿舍',
    summary: '艾莉芙向心叶讲述「终末」的真面目——宇宙因寿命将尽，「终末即科学的漏洞、强烈指向性的显露」，而委员会只是想让世界「停滞」下来。'
      + '小柴拉着他与露娜逛集市买菜，宿舍里吃她与露娜合做的晚餐；梅芙为浴室驱逐一事深夜入房道歉，替他按摩满身旧伤。心叶第一次尝到「朋友、吃饭、疗伤」的普通生活。',
    entities: ['——'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'alive-anatolia', 'vern-simon'],
    bond: B({ luna: 86, hikari: 48, mefisa: 55, nyau: 50 }),
  },
  {
    id: 'v1-5', group: '卷1', order: 5, phase: '第4话「脏器公寓」', day: '第 2 日',
    title: '脏器公寓 · 永恒沉默的狂热者', place: '巴塞罗那 · 圣路西亚公馆',
    summary: '心叶随初中生小柴「一人出差」赴巴塞罗那，与卡乌斯学院放逐部队的蕾雅、玛吉娜会合，调查「脏器公寓」。'
      + '狂热者・格尔以言语命令几乎团灭四人——小柴最后用沙姆希尔，把子弹与「新视野号」探测器的载荷舱交换位置，将不死者放逐进无声的真空宇宙。'
      + '小柴认可了他：「今天……还算挺帅的哦。」',
    entities: ['NO.819 脏器公寓', 'NO.819-A 狂热者・格尔', 'NO.2420 二级天使・黑曜石'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'reiya'],
    bond: B({ luna: 86, hikari: 52, mefisa: 57, nyau: 68 }),
  },
  {
    id: 'v1-6', group: '卷1', order: 6, phase: '第5话「去研究所吧！」／第6话「泥塑面具」', day: '第 3 日',
    title: '地下研究所 · 泥塑面具', place: '苍之学园地下 B-267 · 泰尔的研究所',
    summary: '心叶与露娜作为「无羽・小白鼠」受命调查研究所，回避丝绸小丑的残骸后，撞见成堆的「泥塑面具」。'
      + '面具以坐标心声向心叶呼救，他滴血尝试，差点被「人格篡夺」吞噬内心——低语者读取到的剧烈噪音反而救了他。露娜以铁丝贯穿面具。'
      + '两人在研究所深处互诉了此生最初的信任：「你相信我吗？」「……我相信你啦。」这里的主人是梅芙的兄长——泰尔米别克・简别科娃。',
    entities: ['NO.1821 丝绸小丑的残骸', 'NO.228 泥塑面具'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    // 出发那早恋兔学姐在客厅缠着心叶、小柴在厨房做早餐（两人都在场）；
    // 弗恩只被泰尔一句「那个废物弗恩・西蒙说的新人」提到，人不在研究所，不入名册。
    cast: ['luna', 'hikari', 'mefisa', 'nyau'],
    bond: B({ luna: 93, hikari: 54, mefisa: 62, nyau: 68 }),
  },
  {
    id: 'v1-7', group: '卷1', order: 7, phase: '第6话「泥塑面具」', day: '第 5 日',
    title: '达沃之夜 · 逃走吗？', place: '菲律宾 · 达沃 酒店',
    summary: '出发前夕，恋兔提着「布奇」点心来探望梅芙，一句话点破她对心叶的在意。深夜，露娜发现小柴「沙姆希尔」的追踪贴纸，认定委员会给两人上了保险，'
      + '遂劝心叶一起逃走：「我可以赌上一生来保护你。」心叶摇头——「嘴里一直有血的味道，想在这里赎罪」。露娜强忍泪意离去，却并未真的逃，而是以丝线尾随舰队。',
    entities: ['——'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    // 这一夜是恋兔光的视角：她带小柴逛达沃夜市、分头回房，再去犒劳梅芙 —— 三个人都在。
    cast: ['luna', 'hikari', 'mefisa', 'nyau'],
    bond: B({ luna: 95, hikari: 58, mefisa: 64, nyau: 68 }),
  },
  {
    id: 'v1-8', group: '卷1', order: 8, phase: '第7话「最深处，再之下的深渊」／第8话「曾是，人类之物」／第9话「草原的骑手」', day: '第 7 日',
    title: '深海异界 · 守护者', place: '菲律宾海 · 20 万米深海 → 异界',
    summary: '心叶与梅芙乘弹痕「八脚马」潜航，误入 R 值崩坏的异界，会见数千亿年前旧人类留下的巨型机械「守护者」——它正把被时间冻结的旧人类粉碎制成「泥塑面具」以求复活。'
      + '守护者将两人视为复兴材料。梅芙驾驶八脚马断后，露娜变作丝线「心血来潮」现身，解放了天幕下被缚的旧人类。',
    entities: ['NO.228-A 守护者'], chars: ['luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    // 小柴在八脚马的水中光无线里一直在线（「你们那边怎么样了？」），算本次行动的在场者；
    // 恋兔光只在文中被提到一句（在别处联络寻找失踪的露娜），本人不在潜航现场，不入名册。
    cast: ['luna', 'mefisa', 'nyau'],
    bond: B({ luna: 95, hikari: 60, mefisa: 76, nyau: 68 }),
  },
  {
    id: 'v1-9', group: '卷1', order: 9, phase: '第10话「褶边骑士」／第11话「低语者」／第12话「钢铁的新娘」／尾声-a「笑着，前进吧」／尾声-b「独自一人，伫立着」', day: '第 10 日',
    title: '黄金狮子 · 你的名字', place: '异界 → 弗尔克图斯上空',
    summary: '为守护露娜，心叶再冲阵、被万针刺穿濒死。露娜以己命为他缝伤输血，在「我……可以坚持到最后吗」「可以哦」的遗言中缔结使用者契约，解放本源终末「黄金狮子」歼灭守护者群。'
      + '幸存的最大守护者吞尽旧人类化为「死骸机关之神」冲向现实，被恋兔光一记「樱之残影」当空击成星屑。尾声：心叶住院一周，出院夜露娜迁入宿舍，唤他「我的小主人」。',
    entities: ['NO.8288 黄金狮子', 'NO.228-B 死骸机关之神'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'alive-anatolia', 'vern-simon', 'kuro-no-maou'],
    // 结成使用者契约是人自己走到的，不是读到这儿就该发生的：好感先到 70，这一段才开得了。
    // 走完即锁定 100 —— 契约之后这段关系回不去了，主角再说什么做什么都不会再低于满值。
    gate: [{ char: 'luna', value: 70 }],
    lock: [{ char: 'luna', value: 100 }],
    bond: B({ luna: 95, hikari: 78, mefisa: 80, nyau: 72 }),
  },
];

const v2: Evt[] = [
  {
    id: 'v2-1', group: '卷2', order: 1, phase: '序章「守护者们的声音」', day: '',
    title: '守护者们的声音', place: '匿名者集会 · 圆桌厅',
    summary: '「匿名者集会」围绕第 1123 号案件「恋兔光」议定动手之日。一名绯红色长发的少女放话能杀「怪物」恋兔，并指出新近入队的言万心叶'
      + '「似乎具备预知未来的能力，必须优先排除」。心叶与恋兔自此并列成为暗杀目标。',
    entities: ['——'], chars: [], bond: B({ hikari: 78, luna: 95, mefisa: 80, nyau: 72 }),
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['katherine'],
  },
  {
    id: 'v2-2', group: '卷2', order: 2, phase: '第1话「转校生，登场！」／第2话「noapusa」', day: '',
    title: '转校生与弹痕「noapusa」', place: '苍之学园 第12区 · 深穴',
    summary: '心叶以模拟装置试炼换得「一枚羽」入学苍之学园 1 年 F 班。集市巧遇扭蛋失败的恋兔，被她拉去做模拟战，见识其碾压级实力。'
      + '当夜他梦见白翼少女，觉醒弹痕「noapusa」——使自己变成与目标完全一致的人，使用期间本人的意志不会反映出来。他与兰在实习迷宫「深穴」对赌，用蛮勇打法救了她。',
    entities: ['NO.192 深穴'], chars: ['hikari', 'luna'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'alive-anatolia', 'vern-simon'],
    bond: B({ hikari: 82, luna: 96, mefisa: 80, nyau: 72 }),
  },
  {
    id: 'v2-3', group: '卷2', order: 3, phase: '第3话「第6区」', day: '',
    title: '第六区 · 恋兔队的远征', place: '银河电车 · 第6区 Corporations',
    summary: '会长艾莉芙向恋兔坦白自己「为了他才当上学生会长」，并把心叶托付给她。恋兔队（恋兔、心叶、露娜、梅芙、小柴，外加被卷进来的吴诗涵）'
      + '乘银河铁道前往第 6 区 Corporations，参加三大学园联合的「天空竞技祭」代表战。深夜，恋兔把心叶叫进房间交心，指认暗杀主谋是凯特琳。',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'alive-anatolia', 'youshihan'],
    bond: B({ hikari: 86, luna: 96, mefisa: 82, nyau: 74 }),
  },
  {
    id: 'v2-4', group: '卷2', order: 4, phase: '第4话「天空竞技祭」／第5话「接纳浑沌吧」', day: '',
    title: '天空竞技祭 · 开幕与浑沌', place: '第6区竞技场 · 体育馆',
    summary: '开幕式人潮几乎冲垮心叶，露娜让他枕膝。利维坦购物车厢上，小柴与 Corporations 先锋格蕾为晕车药斗法，梅芙与中坚亚历克斯言语结怨。'
      + '回到体育馆，恋兔踢醒藏在被子里、真正的前任队长吴诗涵，发动弹痕「四大凶兽・浑沌」，把三人吞入特训世界。',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'youshihan', 'merwen-gray', 'alex-cave', 'maria'],
    bond: B({ hikari: 88, luna: 96, mefisa: 83, nyau: 75 }),
  },
  {
    id: 'v2-5', group: '卷2', order: 5, phase: "第6话「You're Gonna Go Far, Kid」／第7话「沉默的异形们」", day: '',
    title: '先锋战 · 小柴喵呜对格蕾', place: '模拟装置 · 废校',
    summary: '代表战开幕。先锋战小柴对格蕾：格蕾以传送门循环加速砂砾占尽上风，小柴被射穿左肩，却以「通水的废校＋贴纸水攻＋供水箱」反转战局，'
      + '时速 2000 公里撞墙取胜，为恋兔队拿下首胜后力竭昏迷。次锋战吴诗涵对玛丽娅：穷奇被反制，其力颠倒胜负，让玛丽娅拿下了胜局。'
      + '四人围在担架边的「队友命」意识自此定型。',
    entities: ['——'], chars: ['nyau', 'hikari', 'mefisa'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['nyau', 'hikari', 'mefisa', 'merwen-gray', 'maria', 'youshihan', 'isis-halid', 'ameria'],
    bond: B({ hikari: 88, luna: 96, mefisa: 83, nyau: 80 }),
  },
  {
    id: 'v2-6', group: '卷2', order: 6, phase: '第8话「午夜降临！」', day: '',
    title: '中坚战 · 梅芙的万米高空', place: '模拟装置 · 夜之街',
    summary: '梅芙对亚历克斯：八脚马空海两栖游斗，亚历克斯化身「午夜降临」的硬质化之躯。梅芙舍身把八脚马变形为喷射机，将亚历克斯拖上 1 万米、-55℃ 高空，'
      + '冻碎其心脏——自己却早一步溺死，惜败。她打出了全卷最强的一战，也让心叶明白：再输一局，队伍就完了。',
    entities: ['——'], chars: ['mefisa', 'hikari', 'luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['mefisa', 'hikari', 'luna', 'nyau', 'alex-cave'],
    bond: B({ hikari: 90, luna: 96, mefisa: 88, nyau: 80 }),
  },
  {
    id: 'v2-7', group: '卷2', order: 7, phase: '第9话「祈祷之歌」', day: '',
    title: '副将战 · 祈祷之歌', place: '模拟装置 · 罗马斗兽场',
    summary: '副将战心叶对菲德拉・雷诺兹。菲德拉能 24 小时内复制他人能力，读心反被他反侦察。心叶终于承认自己的渴望——「我一直想变成你那样帅气的人」——'
      + '开枪自射太阳穴发动 noapusa，变成与菲德拉完全相同的「第二个菲德拉」，令她陷入「谁是真我」的崩坏。两人拼至最后一击，心叶仅凭运气惨胜。'
      + '梅芙含泪抱住脱机的他；吴诗涵留下一句：「当他真的化作怪物时，杀掉他，就是朋友的职责。」',
    entities: ['——'], chars: ['mefisa', 'hikari', 'luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['mefisa', 'hikari', 'luna', 'nyau', 'phidra', 'katherine', 'merwen-gray', 'maria', 'alex-cave', 'ameria'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 82 }),
  },
  {
    id: 'v2-8', group: '卷2', order: 8, phase: '第10话「Finish Line」', day: '',
    title: '大将战 · Finish Line', place: '第6区远郊荒野 · 拉普达低 R 值地带',
    summary: '凯特琳借沙姆希尔贴纸把恋兔传至荒野，会场落下缝合人嘴的「二级天使・百翼」，巨匠现身吞下黑之魔王，又以石化语钉住心叶与梅芙。'
      + '露娜假逃回援、蕾雅潜线爆破巨匠；黑之魔王脱困，与心叶重逢后当场告白强吻，随即与巨匠双双行踪不明。'
      + '恋兔在拉普达迎战凯特琳与车轮联军，断臂仍反杀全场——一句「我就是人类」终结了整场战争，凯特琳被擒。',
    entities: ['NO.819-Z 巨匠', 'NO.5000 黑之魔王', 'NO.2421 二级天使・百翼', 'NO.84 天空要塞・拉普达'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'katherine', 'kuro-no-maou', 'reiya', 'merwen-gray', 'alex-cave', 'maria'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 82 }),
  },
  {
    id: 'v2-9', group: '卷2', order: 9, phase: '尾声-a「祭典的开幕」／尾声-b「祭典的落幕」', day: '',
    title: '邀约', place: '第6区 · 各地',
    summary: '凯特琳因涉恐被捕（刑期估逾四百年）；艾美莉亚辞去会长一职，邀她同行去建「漂浮在沙漠上的夜之城」。'
      + '心叶鼓起勇气请梅芙出去玩，恋兔识趣地拖走小柴撮合，梅芙应约。露娜则与蕾雅一拍即合，同游赌场。',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'reiya', 'katherine', 'ameria'],
    bond: B({ hikari: 90, luna: 96, mefisa: 90, nyau: 82 }),
  },
];

const v3: Evt[] = [
  {
    id: 'v3-1', group: '卷3', order: 1, phase: '序章「未知威胁对策会议」', day: '',
    title: '未知威胁对策会议', place: '东京都千代田区永田町 · 首相官邸',
    summary: '日本近郊与上野周围检测到巨型传送门预兆，异厅厅长天草清麿向要员说明：这是远超文明规模的外次元入侵。'
      + '被异厅收容的终末「黑之魔王」自称「我家亲爱的最近正好入学苍之学园」，凭「妻子特权」促成了向苍之学园求援的谈判。',
    entities: ['——'], chars: [], bond: B({ hikari: 90, luna: 96, mefisa: 90, nyau: 82 }),
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['kuro-no-maou'],
  },
  {
    id: 'v3-2', group: '卷3', order: 2, phase: '第1话「一定，会很开心的」', day: '',
    title: '锁链的侦探', place: '苍之学园 → 第12区集市',
    summary: '心叶奉会长之命，把从 Corporations 敲诈转学来的歌姬玛莉亚从狂热粉丝中护送到学生会室，露娜以丝线结界断后。'
      + '一名自称「侦探」的少女自天坠落——她的能力使半径 10 米内的人被因果分为「杀人者／被害者」互相残杀，集市瞬间地狱化。玛莉亚以歌声镇场，死亡人数最终为零。',
    entities: ['D-1293 锁链的侦探'], chars: ['luna', 'hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'alive-anatolia', 'maria'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 82 }),
  },
  {
    id: 'v3-3', group: '卷3', order: 3, phase: '第2话「锁链的侦探」', day: '',
    title: '审讯 · 废道昏暗', place: '苍之学园 审讯室',
    summary: '被拘捕的侦探「废道昏暗」道出全部真相：本境次元称「樱次元」，远端「死灵次元」的尸兵部队瞄准东京上野不忍池底的机密终末「铁之心脏」——'
      + '一旦被毁，「星鲸」的行进路线将改向樱次元，使其全灭。她为救故乡背叛侦探协会而来，随即被「蔷薇的侦探」以木桩穿胸处决。',
    entities: ['D-289 蔷薇的侦探', 'D-1293 锁链的侦探', 'NO.1000 铁之心脏'], chars: [],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['alive-anatolia'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 82 }),
  },
  {
    id: 'v3-4', group: '卷3', order: 4, phase: '第3话「永田町」', day: '',
    title: '骷髅假面之男 · 街头拦路', place: '东京 · 有乐町/日比谷街头',
    summary: '恋兔队随会长赴永田町地下300米·异厅怪异研究所会谈。归途的深夜，露娜独自在街头买烟，遭一名戴骷髅面具、自认「你的同伴」的神秘男拦路——'
      + '他赠她通往异次元的「通行证」劝她逃走，并以复活的半透明「小蕾雅」之电锯断后遁入亚空间。露娜拒绝跳入「喜望峰的大口」，回到心叶身边。',
    entities: ['NO.19 喜望峰的大口'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'alive-anatolia', 'vern-simon', 'kuro-no-maou', 'reiya'],
    bond: B({ hikari: 91, luna: 97, mefisa: 90, nyau: 82 }),
  },
  {
    id: 'v3-5', group: '卷3', order: 5, phase: '第3话「永田町」／第4话「回到故乡」', day: '',
    title: '魔王夜袭与「婚约」', place: '东京 · 豪华酒店',
    summary: '第3话，连日劳累的会长艾莉芙发烧倒下，心叶彻夜照料喂粥，却在她化妆包里翻出 11 支注射器与安瓿瓶——「短期局部记忆处理剂」，以及用途不明的药。'
      + '第4话，黑之魔王夜宿他床上闹出「夫妻相声」，随后认真求婚立约：「要是你最终没能停滞终末……在世界毁灭之前——我们结婚吧。」心叶答应，但在终末前坚持正常恋爱；'
      + '撞见两人差点逆推的艾莉芙拔出「如散文般」，却只开出一记空枪。',
    entities: ['——'], chars: ['luna'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'alive-anatolia', 'kuro-no-maou'],
    bond: B({ hikari: 92, luna: 97, mefisa: 90, nyau: 82 }),
  },
  {
    id: 'v3-6', group: '卷3', order: 6, phase: '第5话「真鹤町」', day: '',
    title: '真鹤町 · 回乡与烟火', place: '神奈川县真鹤町',
    summary: '心叶被准假回到三年未归的故乡。老屋已人去楼空，屋内却印着某人端正字迹的寻人传单：「我正在找我的家人，他叫言万心叶」——他崩溃大哭，全城无人记得「三三」。'
      + '夜里，提前完成任务的恋兔队全员赶到，温泉、烟花与聚餐。心叶与梅芙并肩玩着烟花棒，小柴和露娜在海边二刀流——这是全卷最治愈的集体羁绊场景。',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau'],
    bond: B({ hikari: 94, luna: 97, mefisa: 92, nyau: 84 }),
  },
  {
    id: 'v3-7', group: '卷3', order: 7, phase: '第6话「从死灵次元来」', day: '',
    title: '死灵次元 · 全面入侵', place: '东京上野最终防卫线 · 津轻海峡',
    summary: '死灵舰队、死灵的浮游城与猩红腐蝶同时压境，苍之学园动员 328 名学生开战。近海龙臂船长的海盗船对轰「摩耶」；'
      + '津轻浮游城的死亡光束由白金・斯托里安德独力拦截；上野上空羽化的猩红蝴蝶，其腐雾把人类溶解成无脸怪物。'
      + '梅芙与小柴驾八脚马在高空狙击贴纸目标——小柴一度过度呼吸陷入恐慌，梅芙在绝境中成为她的支柱。',
    entities: ['NO.8401 死灵舰队', 'NO.8402 死灵的浮游城', 'NO.8403 猩红腐败的巨大蝴蝶'], chars: ['mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['mefisa', 'nyau', 'alive-anatolia', 'vern-simon', 'merwen-gray', 'phidra', 'kuro-no-maou'],
    bond: B({ hikari: 94, luna: 97, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v3-8', group: '卷3', order: 8, phase: '第6话「从死灵次元来」', day: '',
    title: '百鬼夜行', place: '富士山地下300米 · 浅间神社 → 东京夜空',
    summary: '异厅厅长天草清麿与两名自愿献身的少女以活人祭祀解开七支刀封印，召唤出千年前被封印的「怪异之王」——泰尔并未参与行祭，只在事后向怪异之王恳请。'
      + '借「万仙阵」再现神仙时代的环境，「数亿万人的古老的灵魂」如雨点般洒落东京——鬼、犬神、天狗等共同幻想自「最后一战」复苏，为人类争取了重整的时间。',
    entities: ['NO.0004 怪异之王', 'NO.无 鬼', 'NO.无 犬神'], chars: [],
    bond: B({ hikari: 94, luna: 97, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v3-9', group: '卷3', order: 9, phase: '第7话「自樱次元去」／第8话「来自那曾经毁灭的次元」／第9话「星鲸」／第10话「小小的祈愿之章」／尾声-a「于是，世界继续转动下去」／尾声-b「然而，那条道路，无比艰辛」', day: '',
    title: '星鲸 · 欢迎回家', place: '直径约30公里 · 刚诞生的原初宇宙',
    summary: '恋兔被选为唯一能打星鲸的人，却在走廊遭骷髅假面之男拖入亚空间。真正的恋兔未赶上发射——心叶以 noapusa 变身「恋兔光」登箭，露娜化手套暗中随行。'
      + '阮宝兰以「被压缩的胜利」燃尽生命把火箭推至光速二十倍。变身的「恋兔」与星鲸死斗，显形的两人合体为「黄金兔子」，'
      + '收束六十亿人心声，以一缕金线触到鲸额——原来星鲸是无数人类祈愿凝结、失控暴走的共同幻想。他们说「欢迎回家」，令其含泪消散。',
    entities: ['NO.8389 星鲸', 'NO.87865 艾莉芙・安纳托利亚'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'alive-anatolia', 'vern-simon', 'reiya', 'kuro-no-maou', 'phidra', 'merwen-gray', 'alex-cave'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 86 }),
  },
];

const v4: Evt[] = [
  {
    id: 'v4-1', group: '卷4', order: 1, phase: '序章「梦的终结」', day: '',
    title: '巨匠之死与骷髅面具', place: '第13区 · 骨之圣堂',
    summary: '黑锤部队队长达娜厄・惠特摩尔以神流式拔刀术斩杀「永恒沉默的狂热者」的开辟者巨匠，正要拘捕时，一名戴骷髅面具的男人唤出「鸟与诗」的亡灵挡下全员、救走巨匠。'
      + '蕾雅闻声认出：「心叶先生……小言？」——全卷最大的悬念由此展开：异次元的心叶，竟与挚友蕾雅牵绊极深。',
    entities: ['NO.819-Z 巨匠', 'NO.8590 骷髅假面之男'], chars: [],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['danae-whitmore', 'nana-kamiru', 'reiya'],
    bond: B({ hikari: 92, luna: 97, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v4-2', group: '卷4', order: 2, phase: '第1话「让可爱的主人，前去旅行吧」', day: '',
    title: '留学决定与三个烦恼', place: '苍之学园 · 恋兔宿舍',
    summary: '心叶自陈三个烦恼：被恋兔当作抱枕赖床一个月（其实她因他代己赴异次元而恐惧失去他）、弹痕 noapusa 无法使用、以及必须想起「某人」的名字。'
      + '泰尔学长给出单人任务：去卡乌斯学院短期留学。露娜强烈反对，开出「三小时联系一次＋开 GPS」的条件；梅芙冷静解释露娜作为异法机械生命体进不了卡乌斯。'
      + '心叶想读恋兔的心，却被她「防备好」——她嘴上放行：「就让可爱的孩子前去旅行吧。」',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau'],
    bond: B({ hikari: 92, luna: 98, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v4-3', group: '卷4', order: 3, phase: '第2话「伦敦·布里克巷」', day: '',
    title: '伦敦 · 抑视眼镜', place: '伦敦布里克巷 → 卡乌斯学院（第9区）',
    summary: '心叶路遇迷路又哭亏七亿的朋克少女达娜厄（实为黑锤部队队长），随后被艾梅与蕾雅接应。任务揭晓：三日后的「篝火之夜」实为封印「线之人」的火之仪式。'
      + '艾梅强制给他戴上会发讯号的「抑视眼镜」，读心就此失效——心叶第一次体会到听不见心声的寂静。',
    entities: ['NO,951 线之人'], chars: ['hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'danae-whitmore', 'emei', 'reiya'],
    bond: B({ hikari: 92, luna: 98, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v4-4', group: '卷4', order: 4, phase: '第3话「前往那最具典范的学院」', day: '',
    title: '审讯与「另一个我」', place: '卡乌斯学院 礼拜堂 · 琉米爱尔公馆',
    summary: '议长丘库斯以斩击「人类天秤」设公平契约审讯心叶。心叶亲口推理出真相：骷髅假面之男，是「露娜小姐死去的那个次元的我」——另一个次元的言万心叶。'
      + '蕾雅以高洁的气魄力保他过关。当夜神流奈奈自曝真正的委托；蕾雅夜告心叶：异次元的他与她结为夫妻，幽灵蕾雅还戴着同款婚戒。',
    entities: ['NO,8590 骷髅假面之男'], chars: ['hikari', 'luna'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'reiya', 'danae-whitmore', 'emei', 'nana-kamiru'],
    bond: B({ hikari: 92, luna: 98, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v4-5', group: '卷4', order: 5, phase: '第4话「火之试炼」', day: '',
    title: '篝火之国 · 坠落与初战', place: '篝火之国 蘑菇森林',
    summary: '心叶五人组以涂画签订契约进入篝火之国，遭烈焰吞没后从两千余米高空坠落，靠艾梅「奥尔良的盟约」（奇迹概率最多 50%）与蘑菇林缓冲生还。'
      + '夜里心叶梦见满身伤痕的「斩击的天使」，枕边多了一枚白金戒指——新的斩击「a Session.」。他第一次知道，自己「被篝火喜欢着」。',
    entities: ['NO,951 线之人'], chars: [],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['reiya', 'danae-whitmore', 'nana-kamiru', 'emei'],
    bond: B({ hikari: 92, luna: 98, mefisa: 92, nyau: 86 }),
  },
  {
    id: 'v4-6', group: '卷4', order: 6, phase: '第5话「深夜故事」／第6话「篝火之国」', day: '',
    title: '恋兔救场与魔女解封', place: '篝火之国 王宫',
    summary: '心叶重伤濒死时，恋兔光以「来宾」之姿乱入救场。羊之魔女治好他，并点破「妾身还是第一次遇见这般被篝火宠爱之人」。'
      + '恋兔夜谈：请心叶把白金戒指戴在自己手上试验，毫无反应——回到房间后，她自白「跟他在一起的时候，心跳老是会加速」，又因「还有梅芙在」而强行压下。'
      + '心叶向她坦承失去战力后的自卑，被她一把抱住安慰。',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'reiya', 'danae-whitmore', 'nana-kamiru', 'emei'],
    bond: B({ hikari: 94, luna: 98, mefisa: 92, nyau: 87 }),
  },
  {
    id: 'v4-7', group: '卷4', order: 7, phase: '第7话「火之仪式」／第8话「守住封印！」', day: '',
    title: '仪式背叛 · 白银的王子', place: '篝火之国 王宫地下祭祀场',
    summary: '火之仪式上，当恋兔要轰藏匿于天花板的假面心叶时，艾梅以海军刀贯穿恋兔手背——她就是放走巨匠、藏匿假面心叶的背叛者。'
      + '艾梅视角揭晓其身世：她自出生起便继承异次元自己托付的记忆，那句「我，相信他的冒险」赌上了整个世界。众人破入线之人巨体，追往塔顶。',
    entities: ['NO,951 线之人'], chars: ['hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'reiya', 'danae-whitmore', 'nana-kamiru', 'emei'],
    bond: B({ hikari: 94, luna: 98, mefisa: 92, nyau: 87 }),
  },
  {
    id: 'v4-8', group: '卷4', order: 8, phase: '第9话「四场决斗」／第10话「四场终局」／第11话「a Session.」／第12话「敬启，致所有的英雄们」／尾声-a「归处」／尾声-b「应往」', day: '',
    title: '沉默之律 · 紫之大树', place: '篝火之国 · 巴别塔顶',
    summary: '心叶发动「a Session.」与蕾雅合体为「心蕾雅」，分解终末化的黑金狮子。巨匠以自身为苗，汲取线之人遗骸的能量长成覆盖此国的「紫之大树」No,9510，'
      + '立下「沉默之律」——从此此国再无时间旅行、无人能操纵人类。失去回溯能力的线之人被恋兔重创，遁入异次元裂缝，扬言「下次一定要杀了终末」。'
      + '假面心叶将女儿托付给艾梅、嘱其营救，留下「谢谢你……相信我……」后阖目。卡乌斯众人访苍叙旧——心叶与蕾雅在星夜立下再会之约。',
    entities: ['NO,9510 紫之大树', 'NO,8590 骷髅假面之男', 'NO,951 线之人'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'reiya', 'emei', 'danae-whitmore', 'nana-kamiru', 'alive-anatolia', 'vern-simon'],
    bond: B({ hikari: 94, luna: 98, mefisa: 92, nyau: 87 }),
  },
];

const v5: Evt[] = [
  {
    id: 'v5-1', group: '卷5', order: 1, phase: '序章「比如说，这样一段日常的故事。」／第1话「命中注定的人竟然是女仆小姐_」', day: '',
    title: '失恋与幽灵女仆', place: '真鹤町 · 高中教学楼后',
    summary: '心叶向恋兔学姐告白被拒——「我没有把心叶当成那样的对象来看过」。回家与妹妹看恐怖片后，深夜一名半透明、缠苍蓝磷光、穿女仆装的大姐姐含泪现身，'
      + '用银丝往他左手无名指戴上戒指后，他昏了过去。',
    entities: ['——'], chars: ['hikari', 'luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'nyau', 'touyi-caojiro', 'huda-nayume', 'yuina-yoshito'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 88 }),
  },
  {
    id: 'v5-2', group: '卷5', order: 2, phase: '第2话「School For Rock」／第3话「噬鯱者」', day: '',
    title: '戒指之梦与异厅的黑衣', place: '真鹤町 → 东京大学研究室 → 异厅',
    summary: '乃梦姐鉴定出戒指（内刻「a Session.」）是密度 29g/cc、地球不存在的物质。异厅检测到现实变动波长而至，逮捕乃梦姐——但她早备好一枚假戒指任其查获；'
      + '真戒指在事发前已交由草次郎保管，并未落入异厅手中。心叶由此窥见噬鯱者众的另一段人生：乃梦见新长官利光・温彻斯特与怪异之王；草次郎见自己在蓝花岛为少女「空」赴死。',
    entities: ['——'], chars: ['nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['nyau', 'huda-nayume', 'touyi-caojiro', 'yuina-yoshito'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 88 }),
  },
  {
    id: 'v5-3', group: '卷5', order: 3, phase: '第4话「仅此一心」／第5话「在异厅之中」', day: '',
    title: '校内幽灵与梅芙家', place: '真鹤高中 · 梅芙家诊所',
    summary: '试胆分组令心叶与恋兔同行，发烧的他不愿惊动他人，恋兔学姐便带他到开诊所的梅芙家过夜。梅芙听见他说梦话喊「瑠奈」，'
      + '他又无端念出她哥哥「泰尔」的名字令她恐惧，腕上银丝更弹开了她。他羞愧逃离——记忆的裂痕正在把他撕开。',
    entities: ['——'], chars: ['hikari', 'mefisa', 'luna'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'mefisa', 'luna', 'huda-nayume'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 88 }),
  },
  {
    id: 'v5-4', group: '卷5', order: 4, phase: '第6话「小柴琳」', day: '',
    title: '小柴琳的过去', place: '书架曼荼罗 · 藏书房',
    summary: '琳回忆：她幼时被线之人溺杀，被「艾梅学姐」的幽灵救走，在境界领域商会长大，如今借墨西哥黑帮 Voice 之手袭击书架曼荼罗复仇——Voice 的首领，其实是艾莉芙・安纳托利亚。'
      + '她与喵呜重逢：她一直以为喵呜已死，喵呜也以为她早在十年前便已死去；重逢后她才知道，故乡实为苍之学园所救。㐰八请苍之学园攻略禁书「残响的遗骸」——心叶趁夜与琳走下那本书的阶梯（露娜留在书外地面充当救生索，喵呜也悄悄跟了下去）。',
    entities: ['NO,357 残响的遗骸'], chars: ['luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'nyau', 'xiaochai-lin', 'alive-anatolia'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 92 }),
  },
  {
    id: 'v5-5', group: '卷5', order: 5, phase: '第7话「言万心叶」', day: '',
    title: '觉悟 · 世界即试炼', place: '模拟「真鹤」',
    summary: '心叶与琳在试炼中先后「想起一切」——十七年的幸福记忆，被确认为残响制造的拟似世界。两人抱头痛哭后仍互相扶持。'
      + '心叶拜访把「异厅」「自我同一性崩坏耐性」讲给他听的养父，获赠黑色惠比寿「梦想与希望」的祝福。他决意回到会战斗的世界。',
    entities: ['——'], chars: ['luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'nyau', 'xiaochai-lin'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 93 }),
  },
  {
    id: 'v5-6', group: '卷5', order: 6, phase: '第8话「海色。风声」／第9话「潮声。夜晚」', day: '',
    title: '噬鯱者的抉择与流星夜', place: '三石海岸',
    summary: '乃梦姐为「保护弟弟妹妹」欲废心叶四肢囚禁一生，被琳与义人打破僵局。出发前夜，喵呜约心叶看流星，女仆小姐自宇宙彼端以丝线传话：「要幸福啊。」'
      + '喵呜在星空下拥抱他、坦白「喵呜一直、一直最喜欢哥哥了」。',
    entities: ['——'], chars: ['luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'nyau', 'huda-nayume', 'yuina-yoshito', 'xiaochai-lin'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v5-7', group: '卷5', order: 7, phase: '第10话「潜藏于黑暗中的怪物们的赞歌」／第11话「英雄之路，不过常人之途」／第12话「为了迎接结局，所能做的一切」／第13话「Last Song」／尾声-a「愿望的残响」／尾声-b「我回来了！」', day: '',
    title: '告别演出 · 残响', place: '真鹤海岸「湘南音乐节」→ 书架曼荼罗',
    summary: '四人共奏以模拟同心、放大「低语者」感知，怪异之王以富士地下的灵魂流动体击穿海面，现出残响之门。心叶与门后白发红兜帽的少女「回响」对谈，'
      + '获加护【残响的盟剑】——一生一次、绝对公平的决斗权。归返后，露娜为跨越宇宙救主缩小成幼女；喵呜其实也是走下阶梯的苍之学园本尊。'
      + '留在那世界以音乐相送的恋兔学姐与梅芙，成了心叶心头抹不去的回声。',
    entities: ['NO,357 残响的遗骸'], chars: ['luna', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'nyau', 'huda-nayume', 'touyi-caojiro', 'yuina-yoshito', 'kuro-no-maou'],
    bond: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 95 }),
  },
];

const v6: Evt[] = [
  {
    id: 'v6-1', group: '卷6', order: 1, phase: '序章「黑白的爱丽丝」', day: '',
    title: '决斗契约 · 黑白的爱丽丝', place: '第12区郊外荒野',
    summary: '心叶以「残响的盟剑」向线之人宣战。被残响的遗骸选中的裁判「黑白的爱丽丝」现身，抽签定局：协力者四名、一个月后、第零区「尸肉神殿」，'
      + '开赛前杀任何人即败。缩小后的露娜束缚 Voice 俘虏并扶住他，喵呜以沙姆希尔传送归家——琳、喵呜、露娜、奈奈先后出言为他壮胆。',
    entities: ['——'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau', 'xiaochai-lin', 'nana-kamiru', 'vern-simon'],
    bond: B({ hikari: 92, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-2', group: '卷6', order: 2, phase: '第1话「这可不是谈论决斗的时候」', day: '',
    title: '归宅与「妹妹」入门', place: '苍之学园 · 恋兔宿舍',
    summary: '心叶误闯出浴被恋兔揍飞；晚餐介绍琳、解释露娜变小的缘由，奈奈留宿。睡衣派对聊恋爱八卦时，喵呜正式确立「妹妹」的身份。'
      + '梅芙以理性消去尴尬的记忆，露娜仍是贴身女仆。',
    entities: ['——'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'nana-kamiru', 'xiaochai-lin'],
    bond: B({ hikari: 92, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-3', group: '卷6', order: 3, phase: '第2话「美国，毁灭」', day: '',
    title: '美国，毁灭', place: '苍之学园 会议室',
    summary: '网红直播的「能成为天使的歌」录像被公开——据说看过的人，会渐渐变成天使。Corporations 代理会长菲德拉・雷诺兹分析遗骸与「注视着你」的片羽，主张派刺客并招揽「圣诞老人」。'
      + '恋兔以队长身份被点名出战，心叶同行。',
    entities: ['NO.8999 艾美莉亚·玛克比尔'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'phidra', 'vern-simon'],
    bond: B({ hikari: 93, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-4', group: '卷6', order: 4, phase: '第3话「纽约·纽约」', day: '',
    title: '纽约 · 纽约', place: '北极 → 时代广场',
    summary: '菲德拉以「十轮的铁线莲」千年前的约定请出圣诞老人。纽约用快闪演出「欢迎」艾美莉亚——她现身自辩「没有支配，只是强化并使人幸福」，没收了喵呜的沙姆希尔。'
      + '心叶读得圣诞老人对艾美莉亚隐约的悔意与厌烦。',
    entities: ['NO.8999 艾美莉亚·玛克比尔'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'phidra', 'ameria', 'alex-cave'],
    bond: B({ hikari: 93, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-5', group: '卷6', order: 5, phase: '第4话「天使的心得」／第5话「碳化的羽翼」／第6话「圣诞老人的魔法」', day: '',
    title: '天使的心得 · 圣诞老人的魔法', place: '纽约 餐厅与酒店',
    summary: '艾美莉亚个体制裁圣诞老人；圣诞老人点破她「八岁想当弟子」的旧缘，劝她回家被拒。夜里奈奈向心叶坦承骗局、让他读尽内心，「要不要抱我」遭他以'
      + '「你并非真的爱到赌命」婉拒。窗外，恋兔看见两人亲密，误会悄然升起。',
    entities: ['NO.8999 艾美莉亚·玛克比尔'], chars: ['hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'nana-kamiru', 'ameria'],
    bond: B({ hikari: 94, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-6', group: '卷6', order: 6, phase: '第7话「黑暗中蠢蠢欲动的无数光芒」／第8话「铭刻时光之歌」', day: '',
    title: '黑暗中蠢蠢欲动的光', place: '墨西哥湾 → 圣帕特里克教堂',
    summary: '黑之魔王袭击美国第四舰队，放出瞄准遗骸的灵气炮，被凯特琳徒手挡下、落海败走。晚九时的作战会议定下哥伦比亚大学／自由女神像二选一的判断；'
      + '心叶读众人记忆后与恋兔夜赴教堂，触碰了那道「伤痕」。',
    entities: ['NO.8999 艾美莉亚·玛克比尔', 'NO.0001 世界之种'], chars: ['hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'mefisa', 'nyau', 'kuro-no-maou', 'katherine', 'isis-halid'],
    bond: B({ hikari: 95, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-7', group: '卷6', order: 7, phase: '第9话「战斗的开始」／第10话「死斗—a」／第11话「死斗—ｂ」／第12话「Dance with Myself」', day: '',
    title: '战斗的开始', place: '自由女神像 / 哥伦比亚大学',
    summary: '会谈破裂，心叶判言「与杀人无异」。恋兔宣布「独断的恐怖袭击」破窗而出，圣诞魔法之雪使数万人丧失战意；凯特琳截击恋兔，心叶与奈奈潜入自由女神像地下。'
      + '恋兔为掩护二人独自留下——这份守护式的爱，是她从未说出口的。',
    entities: ['NO.8999 艾美莉亚·玛克比尔', 'NO.9014 艾美莉亚之箱'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'katherine', 'nana-kamiru', 'ameria', 'merwen-gray', 'yiregel', 'alex-cave', 'phidra'],
    bond: B({ hikari: 96, luna: 98, mefisa: 90, nyau: 95 }),
  },
  {
    id: 'v6-8', group: '卷6', order: 8, phase: '第13话「你好，再见」／第14话「比如，倘若星星坠落。」／第15话「艾美莉亚・玛克比尔的冒险」／尾声-a「在失去星星的世界」／尾声-b「为了再下个奇迹」', day: '',
    title: '你好，再见 · 艾美莉亚的冒险', place: '纽约全城 / 宇宙根源',
    summary: '圣诞老人被艾美莉亚刺死，临终赠铃铛遗言「不要舍弃那颗向往魔法的心」。心叶在地下与「失去五感」的艾美莉亚以 a Session. 相融，于精神世界吞食她的个体——'
      + '吞至一亿个，被告知「还有三十亿个」，续吞向三亿，终将化作矿物球体而败北。'
      + '艾美莉亚遂统一全人类、只身挑战宇宙根源，败于无限后以到达点抹除自身，令世人遗忘。世界恢复日常，恋兔在病房照料心叶直至出院，嘴上却死不承认。'
      + '喵呜向恋兔剖白「以妹妹的身份爱着哥哥」；露娜始终牵着心叶的手。深夜居酒屋里，西蒙与心叶讨论线之人决斗的五人名单——心叶写下挚友「东夷草次郎」。',
    entities: ['NO.8999 艾美莉亚·玛克比尔', 'NO.0001 世界之种'], chars: ['hikari', 'luna', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'luna', 'mefisa', 'nyau', 'ameria', 'vern-simon'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 96 }),
  },
];

/* ============================================================
   外传 S1（短篇集）拆解为卷间插曲：
   — 话3《第12区购物旅行记》：舞台锚定「天空竞技祭结束几天后」→ 第2卷卷末（gaAfter:2）。
   — 话1/2/4/5/6/7：舞台锚定「东京防卫战落幕、自宇宙归来、未满两月」→ 第3卷卷末（gaAfter:3）。
   — 话8《银色少女与红线。》为卡乌斯学院・蕾雅恋爱别线前史，与正史时间线不接续，不入主线。
   ============================================================ */
const ga2t3: Evt[] = [
  {
    id: 's1-3', group: '外传·S1', order: 1, phase: '第3话「第12区购物旅行记」', day: '', gaAfter: 2,
    title: '第12区购物旅行记', place: '学生会室 → Grand12 → 茶会',
    summary: '天空竞技祭结束数日，会长艾莉芙以「替两翼挑茶点」为名约心叶同逛第12区大型综合设施 Grand12——实为变装约会。'
      + '心叶买了一大堆：平底锅（小柴）、马克杯（梅芙）、助眠眼罩（吴学姐）、手办（恋兔）、香薰蜡烛（露娜）。咖啡店里艾莉芙逼问他「八面玲珑」的原因，'
      + '心叶剖白「我只是拼命地，不想被讨厌而已」，获赠十二万手镯并被表白「我想让你喜欢上我」。数日后茶会，恋兔与西蒙就「第一次约会送12万」「不携护卫」轮番吐槽会长；'
      + '艾莉芙坦白眼叶陪她复刻亡母唯一做过的甜点「塔什·卡代夫」。',
    entities: ['——'], chars: ['hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'alive-anatolia', 'vern-simon'],
    bond: B({ hikari: 91, luna: 96, mefisa: 90, nyau: 82 }),
    script: [
      { who: 'you', text: '……我只是拼命地，不想被讨厌而已。', note: '— 第12区咖啡店 · 对会长剖白' },
    ],
  },
];

const ga3t4: Evt[] = [
  {
    id: 's1-1', group: '外传·S1', order: 1, phase: '第1话「怀旧游戏与宫廷料理」', day: '', gaAfter: 3,
    title: '怀旧游戏与宫廷料理', place: '恋兔宿舍 · 客厅/恋兔光房间/厨房',
    summary: '心叶休假尚余三日，与小柴两人独处。无意拉开恋兔带锁的抽屉撞见「18」标识成人游戏，二人装没看见；挑了款 94 年 RPG 玩起。'
      + '心叶讲起小学进寺院带走叔叔贴满贴纸的游戏机、靠帮孩子攻略 BOSS 获得归属感的往事；小柴也想起奶奶每年生日做的「猪肉纱笼卷」与九岁那年让奶奶难过的事。'
      + '日落前约定「一定要再一起玩」，随后两人下厨做宫廷料理。小柴胸口「轻轻一紧」，却自欺为「大概是肚子饿了吧」。',
    entities: ['——'], chars: ['nyau', 'hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['nyau', 'hikari'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 87 }),
    script: [
      { who: 'nyau', text: '一定要再一起玩……这是约定哦。', note: '— 恋兔宿舍 · 对心叶学长' },
    ],
  },
  {
    id: 's1-2', group: '外传·S1', order: 2, phase: '第2话「于是，少女沉溺于慵眠之中」', day: '', gaAfter: 3,
    title: '于是，少女沉溺于慵眠之中', place: '六年前 卢因沙漠 / 现框 恋兔宿舍',
    summary: '六年前，小学六年级的恋兔光随「成绩最差」的诗涵队赴沙漠讨伐能使人梦见「最恐惧之物」的魇视鳌虾。副队长米拉坠入噩梦沦为丧尸；'
      + '恋兔光以掌中小吉他轰出陨石坑消灭终末，却被副会长派系「尖啸之枪」从天而降灭口。队长吴诗涵以盾相护、抵达「到达点」，巨翼黑光吞没白光，救下恋兔光后倒下。'
      + '现框：小吴每周来访，恋兔光抽走文件给她看鳌虾条目，二人同塌睡午觉——「……啊。有小吴的味道。」',
    entities: ['NO.2873 魇视鳌虾', 'NO.1897 99％圣诞帽'], chars: ['hikari'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['hikari', 'youshihan'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 87 }),
    script: [
      { who: 'hikari', text: '——不管对手有多么可怕，爱和勇气都是无敌的！', note: '— 沙漠决战 · 恋兔光（六年前）' },
    ],
  },
  {
    id: 's1-4', group: '外传·S1', order: 3, phase: '第4话「梅尔文·格蕾的超长无人岛生活」', day: '', gaAfter: 3,
    title: '梅尔文·格蕾的超长无人岛生活', place: '泰尔研究室 → 「无人岛」（观测场景）',
    summary: '战后访问期，心叶为迷路的 Corporations 研发员格蕾（右臂于卷3东京防卫战被菲德拉斩断、已装义肢——外传话4自陈卷起的是「左臂」，与卷3互斥，此处从卷3）带路找泰尔学长，'
      + '二人被一只烧瓶粘住手掌，「漂流」到热带无人岛。'
      + '心叶弹痕 noapusa 已坏且记忆被抹，只能靠读心（连动物之心都读）带格蕾找水觅食。长居日久，二人在树屋相恋数年、直至格蕾怀孕……'
      + '文末揭示真相：那是 No.823 生成的极小型人造人在「无人岛模式」下的观测人生；现实中泰尔立刻解开二人，格蕾客套告辞。',
    entities: ['NO.823 人造仿生人类观测套件'], chars: ['luna'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'merwen-gray'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 87 }),
    script: [
      { who: 'other', text: '明明只是从漫画里学来的半吊子知识，还一脸头头是道的样子。', speaker: '格蕾（心声）', note: '— 无人岛 · 读心' },
      { who: 'you', text: '到了那种世界，不知道会被露娜小姐怎么收拾……', note: '— 心叶唯一挂念（被读到的念想）' },
    ],
  },
  {
    id: 's1-5', group: '外传·S1', order: 4, phase: '第5话「草原骑手的琐碎生活」', day: '', gaAfter: 3,
    title: '草原骑手的琐碎生活', place: '研究所 → 泰尔漆黑公寓',
    summary: '研究所「问题儿童」泰尔（心叶之友、梅芙之兄）刚被学园警察「树木骑士团」说教完，妹妹梅芙来送文件并「验货」。'
      + '她用弹痕「八脚马」执行正义，把他拖回四个月没回的公寓强制大扫除，又用「无限图书馆」逼问出哥哥正碰触连发源地书架曼荼罗都未能掌握的禁忌课题。'
      + '吃炒乌冬（拉格曼）时，梅芙才得知想趁「八脚马还在身边」去旅行，泰尔则打算留校继续研究终末。',
    entities: ['——'], chars: ['mefisa'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['mefisa'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 87 }),
    script: [
      { who: 'mefisa', text: '恋兔总是会唠叨要吃肉……想给心叶同学喂胖一点。', note: '— 做饭时的心里话' },
    ],
  },
  {
    id: 's1-6', group: '外传·S1', order: 5, phase: '第6话「CP厨想要撮合」', day: '', gaAfter: 3,
    title: 'CP厨想要撮合', place: 'Corporations 仓库改建的派对会场',
    summary: '战后未满两个月，卡乌斯媒体人娜蒂雅坚信修女黛丝克对苍学园副会长弗恩·西蒙有意，清空其行程组局聚餐。西蒙照旧冷淡、黛丝克穷追猛打；'
      + '席间西蒙坦白家里寄来婚约候补名单，却突然对黛丝克告白式挖角——「我今天，是为了见你而来的」「黛丝克。我，想要你」，请她转学苍之学园加入学生会。'
      + '黛丝克以「拒绝全部婚约候补」「每月一次两人 AA 的会后例会」为条件应允，并揭穿娜蒂雅白操忙——她早料到会被挖角、打算主动出击。',
    entities: ['——'], chars: [],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['vern-simon'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 87 }),
    script: [
      { who: 'other', text: '黛丝克。我，想要你。', speaker: '弗恩·西蒙', note: '— 派对会场 · 挖角告白' },
    ],
  },
  {
    id: 's1-7', group: '外传·S1', order: 6, phase: '第7话「女仆心与冬日的天空」', day: '', gaAfter: 3,
    title: '女仆心与冬日的天空', place: '第12区集市 → 苍之学园空教室',
    summary: '第12区年末，五人逛彩绘玻璃灯笼集市。露娜以银色丝线强牵心叶的手「护送」，遭恋兔起哄、梅芙忠告「保护过头」；心叶放话「我想好好做人，想成为一个真正的大人」，'
      + '露娜赌气跃上屋顶消失。心叶独自在空教室等——露娜果然来了，坦承不爱冬天：故乡是宇宙飞船，「只有在战场上」才有寒冷，「总觉得，会变得很寂寞」。'
      + '二人和好相拥，跨年烟花绽放。',
    entities: ['——'], chars: ['luna', 'hikari', 'mefisa', 'nyau'],
    // 现场在场名册（依原文逐事件判定；含 roster 里的外场角色）
    cast: ['luna', 'hikari', 'mefisa', 'nyau'],
    bond: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 88 }),
    script: [
      { who: 'luna', text: '……别……别太急着变成大人啊……别把我一个人丢下。', note: '— 空教室 · 跨年烟花' },
      { who: 'you', text: '怎么可能觉得你碍事。你是我最重要的人。', note: '— 空教室 · 和好（心叶对露娜；露娜回「……哼。」「这种话，平时要多说点。」）' },
    ],
  },
];

/** 卷末好感（用于跨卷过渡插曲的无变化基准，以及图例） */
export const VOLUME_END_BOND: Record<string, BondSnap> = {
  卷1: B({ hikari: 78, luna: 95, mefisa: 80, nyau: 72 }),
  卷2: B({ hikari: 90, luna: 96, mefisa: 90, nyau: 82 }),
  卷3: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 86 }),
  卷4: B({ hikari: 94, luna: 98, mefisa: 92, nyau: 87 }),
  卷5: B({ hikari: 90, luna: 97, mefisa: 90, nyau: 95 }),
  卷6: B({ hikari: 96, luna: 100, mefisa: 92, nyau: 96 }),
  '外传·S1': B({ hikari: 96, luna: 100, mefisa: 92, nyau: 88 }),
};

/** 卷组显示信息 */
export const VOLUME_META: Record<string, { code: string; title: string; tag: string }> = {
  卷1: { code: 'VOL.1', title: '欢迎来到，终末停滞委员会', tag: '序章 · 女神殿 → 苍之学园' },
  卷2: { code: 'VOL.2', title: '天空竞技祭', tag: '第6区 Corporations 代表战' },
  卷3: { code: 'VOL.3', title: '樱次元的决战', tag: '死灵次元入侵 · 星鲸' },
  卷4: { code: 'VOL.4', title: '篝火之国的留学', tag: '卡乌斯学院 · 线之人' },
  卷5: { code: 'VOL.5', title: '残响的遗骸', tag: '噬鯱者 · 真鹤的试炼' },
  卷6: { code: 'VOL.6', title: '艾美莉亚·玛克比尔事件', tag: '纽约终末 · 世界之种' },
  '外传·S1': { code: 'SIDE STORY', title: '外传 S1', tag: '卷间短篇集 · 战后休整' },
};

/**
 * 阅读顺序的全量时间线：
 *   第1卷 → 第2卷 →〔话3〕→ 第3卷 →〔话1·2·4·5·6·7〕→ 第4卷 → 第5卷 → 第6卷
 * 外传插曲只在该卷最后一段之后各插入一次。
 */
function build(): TimelineEvent[] {
  const vols: Evt[][] = [v1, v2, v3, v4, v5, v6]
  const res: TimelineEvent[] = []
  vols.forEach((volEvents, idx) => {
    const vol = idx + 1
    for (const e of volEvents) res.push({ ...e, vol, ga: false })
    if (vol === 2) for (const g of ga2t3) res.push({ ...g, vol: 0, ga: true })
    if (vol === 3) for (const g of ga3t4) res.push({ ...g, vol: 0, ga: true })
  })
  return res
}

export const TIMELINE: TimelineEvent[] = build()

/** 解锁事件：第1卷「欢迎来到，终末停滞委员会」（从女神殿被接、加入苍之学园） */
export const unlockEventId: string | null = ((): string | null => {
  const e = TIMELINE.find((x) => x.unlock)
  return e ? e.id : null
})()

export const firstMainId: string | null = TIMELINE.find((e) => !e.ga && e.vol === 1)?.id ?? null

export function readingIndexOf(id: string): number {
  return TIMELINE.findIndex((e) => e.id === id)
}

export function isIntroGroup(g: string): boolean {
  return g === '卷1'
}

export const CHAR_ORDER: CharId[] = ['hikari', 'luna', 'mefisa', 'nyau']
