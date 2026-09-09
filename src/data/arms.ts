import type { ArmEntry } from './types'

/**
 * 三学园系谱武装图鉴 —— 弹痕 / 斩击 / 片羽。
 * 苍之学园持「弹痕」（石像「弹痕的天使」授予）· 卡乌斯学院持「斩击」（石像「斩击的天使」授予）·
 * Corporations（企业联合）学生持有「片羽」。
 * 这些反现实存在的本质只有一个——为持有者实现渴望。即，与绝望战斗。
 * 当持有者真正面对终极的绝望，深层的核心力量便会被唤醒（到达点）。
 * 内容按《这里是，终末停滞委员会。》第1-6卷 + 外传 S1 原文考据；出处为语料首见卷。
 */

/** 各系谱的传统说明：授予天使像 / 基型 / 所属 */
export const ARM_TRADITIONS: {
  kind: ArmEntry['kind']
  sub: string
  school: string
  color: string
  statue: string
  basis: string
  note: string
  quote: string
}[] = [
  {
    kind: '弹痕',
    sub: 'HOLY SCAR · GUNS',
    school: '苍之学园',
    color: '#ff2e43',
    statue: '由石像「弹痕的天使」授予——那尊只余左半身与腰部、手中握枪的女性石像（Stage6『动摇』）被供奉于园内。',
    basis: '基型为「枪」：将持有者的指向性具现化而成的特殊枪械，亦会化作吉他、盾、锤等异形。',
    note: '苍学生用它战斗，也用它歌唱——恋兔光的「樱之残影」与小柴喵呜的老式左轮，都只是持有者内心的形状。',
    quote: '「弹痕。」',
  },
  {
    kind: '斩击',
    sub: 'THE CUT · SWORDS',
    school: '卡乌斯学院',
    color: '#cfcfef',
    statue: '由学院礼拜堂中的石像「斩击的天使」授予——只余右半身与腰部、执剑姿态的神像。',
    basis: '基型为「剑」，亦化作巨大的木钉、电锯、扩音器与金属球棍等千奇百怪的形态。',
    note: '卡乌斯技术长于抑制反现实；斩击的持有者们穿黑袍、持兵刃，以评议会为纲在橡木回廊间裁决。',
    quote: '「斩击。」',
  },
  {
    kind: '片羽',
    sub: 'FEATHERED WINGS',
    school: 'Corporations（企业联合）',
    color: '#d2a2ff',
    statue: '由「单翼的天使」授予——三大学园的天使系谱中，独此一尊不以“半身”示人，只余一只展开的翅膀；Corporations 的学生们，正是从它那里承接名为「片羽」的力量。',
    basis: '将持有者的性状与欲望化为翼状的超常之力：变得更强、无处不在、把心声唱成现实——那是「单翼的天使」依照每个孩子最深的渴望，披在他们背上的形状。',
    note: '在三大学园中，只有 Corporations 的孩子以实力至上、以利益为信条——片羽是「单翼的天使」所赐的武装，并非生而有之；它是渴望被授予之后的具象。',
    quote: '「片羽。」',
  },
]

export const ARMS: ArmEntry[] = [
  /* ———————— 弹痕 · 苍之学园 ———————— */
  {
    id: 'hikari-zankei', kind: '弹痕', name: '樱之残影', sub: 'SAKURA AFTERIMAGE',
    holder: '恋兔光', holderNote: '苍之学园学生会两翼之一・恋兔队队长',
    holderId: 'hikari',
    phrase: '纯白的吉他 · 「要上咯，我的吉他——」',
    power: '由「弹痕的天使」所赐、恋兔光从掌心召唤出的纯白吉他。它在弗尔克图斯拥有超群的威力，成因却无人知晓——'
      + '因果波长与普通弹痕截然不同，部分人甚至怀疑它并非来自天使的馈赠。她踏着吉他在天空横冲直撞，以樱色的「樱色奇迹」'
      + '同时司掌治愈、屏障与光束，把整座天空都市当作舞台，也把灵魂蓄积器TM 的本体连同神像一起轰成星尘。',
    awakened: '樱色奇迹的真相——吉他的内部封印着「旧吉他」，那才是混沌与暴力本身；樱色奇迹只是覆盖其上、调节其输出的阀门。'
      + '当阀门因「天使光环」暴走而完全解除，她甚至能借敌人的无限能量压制混沌之力：一个放开到极限的恋兔光，是连世界都要为之屏息的存在。',
    ref: 'V1 / V2 / V6',
  },
  {
    id: 'nyau-shamshir', kind: '弹痕', name: '沙姆希尔', sub: 'SHAMSHIR',
    holder: '小柴喵呜', holderNote: '苍之学园学生会・异端审问室所属',
    holderId: 'nyau',
    phrase: '替换子弹与目标',
    power: '一把老旧得看不出年代的左轮手枪。其子弹不追求命中——弹匣里的子弹与「目标」的位置会被互换，'
      + '将远处的敌人直接掷入真空、或是让同伴脱离必死的坐标。小柴喵呜以此把不死者狂热者・格尔放逐进了无声的宇宙。',
    ref: 'V1',
  },
  {
    id: 'mefisa-horse', kind: '弹痕', name: '八脚马', sub: 'EIGHT-LEGGED HORSE',
    holder: '梅芙莉莎', holderNote: '苍之学园学生会',
    holderId: 'mefisa',
    phrase: '会说话的、属于自己的枪',
    power: '一柄拥有自我意识、浑身滴着黏液般异质的活体枪械，是梅芙莉莎形影不离的搭档兼话痨。'
      + '它陪梅芙潜入深海异界、在守护者的围猎中并肩而战——枪与主人互相吐槽，也互相信任。',
    ref: 'V1',
  },
  {
    id: 'till-crying-bird', kind: '弹痕', name: '泣泪巨鸟', sub: 'CRYING GREAT BIRD',
    holder: '泰尔米别克・简别科娃', holderNote: '苍之学园・前辈研究员（昵称泰尔学长，梅芙莉莎之兄）',
    phrase: '「归来」——单发手枪',
    power: '只在持有者的心脏停止跳动时，才会填入一发子弹的手枪。击发后，子弹会成长为与目标完全相同的存在——'
      + '那是一声穿越生死的呼唤：让已经回不来的人，再一次回到这个世界上。',
    ref: 'S1/V3',
  },
  {
    id: 'ellif-prose', kind: '弹痕', name: '如散文般', sub: 'LIKE PROSE',
    holder: '艾莉芙・安纳托利亚', holderNote: '苍之学园学生会长 · 终末停滞委员会之长',
    holderId: 'alive-anatolia',
    phrase: '贯穿过去',
    power: '一击可「贯穿过去」的弹痕：将自己的干涉送往最多 30 年前、300 公里外的过去，'
      + '在因果的开端处提前落下决定性的一笔。作为学生会长的艾莉芙，正是以这把「散文」撰写着委员会的未来。',
    ref: 'V3',
  },
  {
    id: 'kokoro-noapusa', kind: '弹痕', name: 'noapusa', sub: 'NOAPUSA',
    holder: '言万心叶', holderNote: '苍之学园・体验入学 · 低语者（Susurrador）',
    revealAt: 'v2-2',
    phrase: '变成与目标完全一致的人',
    power: '让持有者化为与目标完全一致之人的复制体——从外貌、声音到能力皆为一致。使用期间，言万心叶本人的意志不会反映出来，'
      + '并获得「无论是谁也无法分辨真正的本人」这一反现实性质。它于第2卷第2话（第6区天空竞技祭之前）的夜梦中觉醒，'
      + '曾被指为「会化作怪物的能力」；星鲸之战后损坏、再也无法使用，与之相关的一段记忆也随之丢失。',
    awakened: '在与东夷草次郎的共战中抵达过「让渴望成真」的深渊之底——那一次，他不复制任何人，只把心交给朋友。',
    ref: 'V2 / V3',
  },

  /* ———————— 斩击 · 卡乌斯学院 ———————— */
  {
    id: 'majina-curse', kind: '斩击', name: '森林的诅咒', sub: 'CURSE OF THE FOREST',
    holder: '玛吉娜・阿布拉姆', holderNote: '卡乌斯学院',
    phrase: '以口头禁令束缚罪人',
    power: '一根巨大如树的木钉，也长于口舌：对目标下达「禁止」的口头命令，违者即受诅咒反噬。'
      + '命令的句子越长、越是郑重其事，束缚的力量就越强——她的每一句话都像在森林里立下一道不可逾越的界碑。',
    ref: 'V1',
  },
  {
    id: 'reya-beast', kind: '斩击', name: '热沃当的少女', sub: 'MAIDEN OF GÉVAUDAN',
    holder: '蕾雅・库尔・杜・琉米爱尔', holderNote: '卡乌斯学院评议会・副议长之妹',
    holderId: 'reiya',
    phrase: '被诅咒的巨兽之名',
    power: '形如巨型电锯的斩击，轰鸣着切开一切低 R 值的幻想与屏障。蕾雅挥舞它时毫不留情——'
      + '直到她在篝火之国与心叶立下「a Session.」的共奏之约，这把锯子才第一次学会为守护而转动。',
    ref: 'V1',
  },
  {
    id: 'nadia-news', kind: '斩击', name: '喜讯喜讯', sub: 'GOOD NEWS, GOOD NEWS',
    holder: '娜蒂雅・哈利德', holderNote: '卡乌斯学院',
    phrase: '全体化——把祝福喊给所有人听',
    power: '一具扩音器形状的斩击：将持有者说出的「喜讯」以广播之力全体化，覆盖在场每一个人的心智。'
      + '她的声音可以是一句玩笑，也可以是一道让全军振奋、或让敌阵瘫痪的命令。',
    ref: 'V3',
  },
  {
    id: 'nana-trouble', kind: '斩击', name: '大麻烦', sub: 'BIG TROUBLE',
    holder: '神流奈奈', holderNote: '卡乌斯学院',
    holderId: 'nana-kamiru',
    phrase: '重量自由增减的金属球棒',
    power: '一根金属球棒，可将击中对象的重量任意增减——增物重至三倍、或把对方自重提至数十倍，令其寸步难行；'
      + '把体重降到几十分之一，则令其一击即飞。奈奈抡起它时，连终末都要先掂量掂量自己有多重。',
    ref: 'V4',
  },
  {
    id: 'kokoro-session', kind: '斩击', name: 'a Session.', sub: 'A SESSION.',
    holder: '言万心叶', holderNote: '苍之学园・体验入学 · 斩击之戒（低语者）',
    revealAt: 'v4-5',
    phrase: '灵魂共奏 · 合而为一',
    power: '篝火之国坠落后的那一夜，心叶梦见满身伤痕的「斩击的天使」，醒来枕边多了一枚极其简朴的白金戒指——「a Session.」。'
      + '它酷似「noapusa」的实现渴望的本质，却不再是那把把人复制成他人的可悲小手枪：两枚成对的戒指相互共鸣，能让佩戴者灵魂共奏、合而为一。'
      + '（第5卷经胡道乃梦鉴定：密度 29g/cc，为地球上从未存在过的超重物质所制。）'
      + '他第一次明白，自己「被篝火喜欢着」。',
    awakened: '与蕾雅合体为「心蕾雅」，在巴别塔顶击破终末化的黑金狮子；此后亦以共奏深入世界根源——那是「两个人的渴望」合在一起、献给彼此的赞歌。',
    ref: 'V4 / V5 / V6',
  },

  /* ———————— 片羽 · Corporations ———————— */
  {
    id: 'kate-immortal', kind: '片羽', name: '英雄不灭', sub: 'THE HERO NEVER DIES',
    holder: '凯特琳・安・奥斯汀', holderNote: 'Corporations・学园内部警察队长',
    holderId: 'katherine',
    phrase: '变强——越受伤，越强大',
    power: '将「英雄不灭」的渴望化为片羽：受到的伤害越重，凯特琳便越强——濒死即是她的完全体。'
      + '这份力量让她能以凡人之躯正面迎战天空竞技祭的大将，也让 Corporations 学会了敬畏她。',
    awakened: '终焉的火焰——不再以「受伤变强」，而是直接燃烧自己的生命换取力量；那是英雄赌上性命的最后加护。',
    ref: 'V2',
  },
  {
    id: 'alex-midnight', kind: '片羽', name: '午夜降临', sub: 'MIDNIGHT FALLS',
    holder: '亚历克斯・凯夫', holderNote: 'Corporations',
    holderId: 'alex-cave',
    phrase: '把身体变成世上最坚硬之物',
    power: '午夜降临时，亚历克斯的身躯会化为现世最坚硬的物质——任何攻击都无法在他身上留下划痕。'
      + '他是企业联合的盾，以沉默的坚硬守护着想要守护的东西。',
    ref: 'V2',
  },
  {
    id: 'gray-footprint', kind: '片羽', name: '愚者的足迹', sub: 'FOOL’S FOOTPRINTS',
    holder: '梅尔文・格蕾', holderNote: 'Corporations（企业联合）',
    holderId: 'merwen-gray',
    phrase: '只在想逃的地方留下脚印',
    power: '让持有者瞬间移动至「刚刚想到的地方」的片羽——就像愚者在每个念头里都踩下足迹，却从不回头。'
      + '格蕾用它跨越无人岛、跨越战场，也一次次出现在心叶意想不到的身后。',
    ref: 'V2',
  },
  {
    id: 'maria-princess', kind: '片羽', name: '天下无双的公主大人', sub: 'THE UNPARALLELED PRINCESS',
    holder: '玛丽娅', holderNote: 'Corporations・学园偶像',
    holderId: 'maria',
    phrase: '把感情唱成现实',
    power: '身为偶像的玛丽娅，其片羽能让「歌中寄托的感情」化为现实——台下的欢呼、观众的心跳，'
      + '都会在旋律中成真。她是舞台上天下无双的公主，也是用歌声为第6区止痛的镇痛剂。',
    ref: 'V2',
  },
  {
    id: 'drisk-chaos', kind: '片羽', name: '赞颂混沌吧', sub: 'PRAISE THE CHAOS',
    holder: '黛丝克・格莉塔', holderNote: 'Corporations（S1 后遭弗恩挖角，转学苍之学园）',
    phrase: '共享世界',
    power: '背着恶魔之翼的修女。她的片羽能把任意生物的「五感」映射到另一个目标身上——让对方亲眼看见'
      + '自己所见的景色、感受自己所承受的痛楚。那并非杀戮的术，而是「把世界分享给你」的诅咒与祈祷。',
    awakened: '为联系上被困在异次元的挚友而觉醒——她用混沌，把一个回不来的人的声音再次传回了人间。',
    ref: 'V3',
  },
  {
    id: 'emilya-gaze', kind: '片羽', name: '注视着你', sub: 'WATCHING YOU',
    holder: '艾美莉亚・玛克比尔', holderNote: 'Corporations・前学生会长（No.8999 天使律）',
    holderId: 'ameria',
    phrase: '无处不在',
    power: '让持有者的意识量子化、无限增殖，化作「无处不在」的注视——以半径约 30 公里内的世界为领域，'
      + '城市中的每一双眼、每一扇窗都是她的目光。艾美莉亚「亲手扼杀了自己」，以亡者的形态永远注视着、守护着第6区。',
    ref: 'V2',
  },
]
