/**
 * 世界线锚点表 —— 24 个真锚点（docs/大事件锚点.md §9.1 那一份名单，逐条回填）。
 *
 * 一行一个锚点，字段口径见 docs/自由度改造方案.md 第 6 节的 10 字段契约：
 *   id / sourceRef / evId / title / outcome / variable / when / fallback / guard / span。
 *
 * 三条自己守的规矩（契约里写死的那三条）：
 *   ① `outcome` 只写**状态句**（谁—变成—什么），不写过程、不写谁说了什么 ——
 *      过程归导演，玩家能改，所以一个字都不许钉在这里。
 *   ② 每条都必须答得出「玩家绕开它时，它怎么回来」（`fallback`）——
 *      答不上来的不登记成锚点。**不许落到「取消」**，只许偏移 / 延后 / 换衣。
 *   ③ `id` 一旦进存档就不改（`WorldState.anchors` 靠它记落地）；
 *      `outcome` / `guard` 只是提示词，改文案不伤档。
 *
 * `when` 的填法（这一批的实际口径，别在别处另编一套）：
 *   · `afterDone` 一律填**紧邻的前一段** —— 锚点到来的那一刻，正好是它自己那一段
 *     变成当前段的那一刻，于是「已到期」总能被导演看见。
 *   · `minTick` 只填原文有明确日标的那几条（卷一）；卷二起 timeline 的 day 全是空串，
 *     `tickGapFor` 一格都不走，硬填一个 minTick 会让旧档永远到不了期 —— 宁可不填。
 *   · `place` 一个都不用：现场地点玩家随时能改（`world.place`），拿它当门槛等于
 *     「他走开一次，这条锚点就永远不来」。`cast` 只用在原文写明「没这个人这件事就不成」的
 *     那两条（v1-3 / v1-9 的露娜）。
 *   · `playerAct` 只给原文写「玩家主动」、且文档给了替代形态的那几条 ——
 *     绕开时靠 `fallback` 补，不靠取消。
 *
 * 没登记的（37 条里有 13 条落在名单外）：准锚点 17 条与过场 16 条一条都不进这张表 ——
 * 它们只留残渣、载体可整体替换，钉成锚点等于把「可以换的外衣」变成「必须穿的戏服」。
 */
import type { Anchor } from './types'

export const ANCHORS: Anchor[] = [
  // 文档 §1.1 A1（v1-2）
  {
    id: "anc-v1-02-goddess",
    sourceRef: { vol: 1, ch: "序章「船与影」／第1话" },
    evId: "v1-2",
    title: "女神神殿 · 露娜登场，转生之门破裂",
    outcome: "露娜成为心叶在第二次人生里的侍奉者；「转生之门」被认定为吞人灵魂的蓄积器，而心叶身上没有任何神授能力 —— 他这一世只是普通人。",
    variable: ["who", "form", "cost", "relation"],
    when: { afterDone: ["v1-1"], minTick: 0 },
    fallback: "他不肯离开神殿 → 装置自行启动、把两人强行推出：这层关系照样成立，只是露娜把它记成「被这个人拖累」。",
    guard: "露娜还没登场 —— 别让任何人先认他当使用者，也别提前给出「转生之门」的真相。",
    span: { min: 1, max: 2 },
  },
  // 文档 §1.1 A2（v1-3）
  {
    id: "anc-v1-03-tribunal",
    sourceRef: { vol: 1, ch: "第1话「这里是，终末停滞委员会」" },
    evId: "v1-3",
    title: "异端审问室 · 两人被收留（委员会成立）",
    outcome: "心叶与露娜以「苍之学园 体验入学」的名义被收留、由弗恩监视 —— 两人从此是苍之学园的一员，艾莉芙与弗恩成为他们的长期关系。",
    variable: ["form", "cost", "relation", "who"],
    when: { afterDone: ["v1-2"], minTick: 2, cast: ["luna"] },
    fallback: "他不护露娜 → 露娜由研究所接管，可两人仍被绑在一起：此后那段契约的前提变成「把她夺回来」。",
    guard: "审问还没到 —— 别提前把「委员会的一员」这个身份发给他。",
    span: { min: 1, max: 3 },
  },
  // 文档 §1.1 A3（v1-8）
  {
    id: "anc-v1-08-guardian",
    sourceRef: { vol: 1, ch: "第7–8话「最深处，再之下的深渊」" },
    evId: "v1-8",
    title: "深海异界 · 守护者与泥塑面目的来源",
    outcome: "「守护者」被确认是旧人类留下的巨型机械，正把被时间冻结的旧人类粉碎成「泥塑面具」以求复活 —— 「终末＝失控的旧文明遗产」这条线由此接上。",
    variable: ["who", "form", "cost"],
    when: { afterDone: ["v1-7"], minTick: 14 },
    fallback: "他不下潜 → 梅芙单走，他只通过通讯参与；这份真相延后到契约那一段由露娜口述。",
    guard: "潜航还没发生 —— 别提前把「守护者」的来路说破。",
    span: { min: 2, max: 3 },
  },
  // 文档 §1.1 A4（v1-9）
  {
    id: "anc-v1-09-contract",
    sourceRef: { vol: 1, ch: "第10–12话＋尾声" },
    evId: "v1-9",
    title: "黄金狮子与「使用者契约」",
    outcome: "使用者契约成立：露娜成为心叶的「使用者」、心叶成为她的「小主人」，这层隶属与称呼此后不再改动；「黄金狮子」被解放，冲进现实的「死骸机关之神」在天空中被击落。",
    variable: ["cost", "form", "who", "relation"],
    when: { afterDone: ["v1-8"], minTick: 20, cast: ["luna"] },
    fallback: "他拒绝契约 → 露娜自行发动、以自身为代价：锁照样落下，只是这层关系从此带愧疚的底色（不许无代价通关）。",
    guard: "契约还没签 —— 别让露娜提前改口叫他「小主人」。",
    span: { min: 2, max: 4 },
  },
  // 文档 §2.1 B2（v2-2）
  {
    id: "anc-v2-02-noapusa",
    sourceRef: { vol: 2, ch: "第2话「noapusa」" },
    evId: "v2-2",
    title: "转校与弹痕「noapusa」觉醒",
    outcome: "心叶的弹痕「noapusa」觉醒 —— 他能把自己变成与目标完全一致的人；此后一切替身、越界与「变成别人」都以此为凭。",
    variable: ["form", "who", "when"],
    when: { afterDone: ["v2-1"] },
    fallback: "入学手续那一步没走 → 觉醒挪到竞技祭的实战里；但那之后就没有「第一次变成别人」的余裕了。",
    guard: "他还没有心之形 —— 别让他提前变成别人。",
    span: { min: 1, max: 2 },
  },
  // 文档 §2.1 B3（v2-3）
  {
    id: "anc-v2-03-expedition",
    sourceRef: { vol: 2, ch: "第3话「第6区」" },
    evId: "v2-3",
    title: "第 6 区远征 · 恋兔队成军",
    outcome: "恋兔队以「恋兔、心叶、露娜、梅芙、小柴」这套编制成军并开赴第 6 区：舞台从苍之学园移到 Corporations，艾莉芙「为了他才当学生会长」的动机公开。",
    variable: ["who", "form", "when"],
    when: { afterDone: ["v2-2"] },
    fallback: "他拒绝出征 → 被点名强制征召：暗杀的风险照样落在头上，只是没有准备期。",
    guard: "远征还没成行 —— 别让戏先在第六区开演。",
    span: { min: 1, max: 3 },
  },
  // 文档 §2.1 B4（v2-8）
  {
    id: "anc-v2-08-finishline",
    sourceRef: { vol: 2, ch: "第10话「Finish Line」" },
    evId: "v2-8",
    title: "Finish Line · 巨匠现身、魔王被告白与被吞",
    outcome: "巨匠首次正面现身并吞下黑之魔王，两人随即双双失踪；魔王当场告白强吻，凯特琳被擒 —— 巨匠成为心叶与魔王的共同仇敌，恋兔那句「我就是人类」被世界听见。",
    variable: ["who", "form", "relation", "when"],
    when: { afterDone: ["v2-7"] },
    fallback: "他不参赛 → 恋兔单走、告白挪到战后重逢；巨匠现身照旧（那是世界侧）。",
    guard: "大将战还没到 —— 别提前让巨匠或凯特琳登场。",
    span: { min: 2, max: 4 },
  },
  // 文档 §3.1 C1（v3-1）
  {
    id: "anc-v3-01-council",
    sourceRef: { vol: 3, ch: "序章「未知威胁对策会议」" },
    evId: "v3-1",
    title: "未知威胁对策会议（异厅与苍学园结盟）",
    outcome: "异厅与苍之学园结盟：巨型传送门被判定为远超文明规模的入侵，黑之魔王以「妻子的特权」促成求援，她的政治位置公开化。",
    variable: ["who", "form", "cost"],
    when: { afterDone: ["v2-9"] },
    fallback: "他不在场 → 只以事后简报呈现；情报的缺口由后面的战场补。",
    guard: "会议还没开 —— 别让官方已经和学园站到一起。",
    span: { min: 1, max: 2 },
  },
  // 文档 §3.1 C2（v3-3）
  {
    id: "anc-v3-03-truth",
    sourceRef: { vol: 3, ch: "第2话「锁链的侦探」" },
    evId: "v3-3",
    title: "真相：死灵次元 → 铁之心脏 → 星鲸",
    outcome: "死灵次元的尸兵瞄准上野不忍池底的「铁之心脏」，一旦被毁，「星鲸」的路线就改向樱次元、致其全灭 —— 敌人为什么打、打哪里、打坏的后果全部公开。",
    variable: ["who", "form", "cost"],
    when: { afterDone: ["v3-2"] },
    fallback: "他没听审讯 → 情报改由敌人在战场上喊出（多付一份准备时间的代价）。",
    guard: "审讯还没到 —— 别提前说出「铁之心脏」与星鲸的路线。",
    span: { min: 1, max: 2 },
  },
  // 文档 §3.1 C3（v3-6）
  {
    id: "anc-v3-06-hometown",
    sourceRef: { vol: 3, ch: "第5话「真鹤町」" },
    evId: "v3-6",
    title: "真鹤町 · 老屋空无一人",
    outcome: "「言万心叶这个人已被世界抹去过一次」有了第一份物证：老屋人去楼空，桌上压着一张「他是我最重要的人」的寻人传单，全城无人记得「三三」。",
    variable: ["who", "form", "when"],
    when: { afterDone: ["v3-5"], playerAct: true },
    fallback: "他不回去 → 传单由梅芙代取转交：事实不变，冲击与情报延后。",
    guard: "回乡还没发生 —— 别提前让「他被世界抹去过」这件事露出来。",
    span: { min: 1, max: 2 },
  },
  // 文档 §3.1 C4（v3-7）
  {
    id: "anc-v3-07-invasion",
    sourceRef: { vol: 3, ch: "第6话「从死灵次元来」" },
    evId: "v3-7",
    title: "死灵次元全面入侵（东京防卫战）",
    outcome: "第一次全次元战争爆发：死灵舰队、浮游城与猩红腐蝶同时压境，苍之学园动员 328 名学生走上防线 —— 学园从此是一个军事主体。",
    variable: ["who", "cost", "form"],
    when: { afterDone: ["v3-6"] },
    fallback: "他不上前线 → 编入后方指挥与救援：防线照样要守，代价由别人承担（这是关系后果，不是跳过）。",
    guard: "舰队还没压境 —— 别提前把上野写成战场。",
    span: { min: 2, max: 4 },
  },
  // 文档 §3.1 C5（v3-9）
  {
    id: "anc-v3-09-starwhale",
    sourceRef: { vol: 3, ch: "第9话「星鲸」＋尾声-a/b" },
    evId: "v3-9",
    title: "星鲸：欢迎回家",
    outcome: "星鲸（人类祈愿凝结、失控暴走的共同幻想）在变身的「恋兔」与它的死斗后被收束消散；心叶替她登箭 —— 主角第一次代替她去死，而另一个次元的心叶带着名字的缺失走进沙漠。",
    variable: ["who", "cost", "form", "when"],
    when: { afterDone: ["v3-8"] },
    fallback: "他不替她 → 发射取消或星鲸改道：这是「坏结局分支」，锚点本身仍算发生。",
    guard: "发射窗口还没到 —— 别提前把星鲸写掉。",
    span: { min: 2, max: 4 },
  },
  // 文档 §4.1 D1（v4-2）
  {
    id: "anc-v4-02-studyabroad",
    sourceRef: { vol: 4, ch: "第1话「让可爱的主人，前去旅行吧」" },
    evId: "v4-2",
    title: "留学决定（舞台搬到卡乌斯）",
    outcome: "卡乌斯学院短期留学定案：整卷的舞台与人员由此确定，而「必须想起某个人的名字」这句被交到他手上。",
    variable: ["who", "form", "when"],
    when: { afterDone: ["v4-1"] },
    fallback: "他拒绝 → 改成被指名派遣；露娜若争取到同行，后面「抑视眼镜」那一场改由别人承担。",
    guard: "留学还没定 —— 别让卡乌斯的人与地名先上场。",
    span: { min: 1, max: 2 },
  },
  // 文档 §4.1 D2（v4-4）
  {
    id: "anc-v4-04-masktruth",
    sourceRef: { vol: 4, ch: "第3话「前往那最具典范的学院」" },
    evId: "v4-4",
    title: "真相：骷髅假面＝另一个次元的我",
    outcome: "「骷髅假面之男」被确认为露娜死去的那个次元里的言万心叶 —— 全书最大的悬念落地，心叶欠另一个自己一条命的债由此开账，蕾雅进入核心关系。",
    variable: ["who", "form", "relation"],
    when: { afterDone: ["v4-3"] },
    fallback: "他没推理出来 → 由假面自己在四场决斗那一段揭穿：冲击更大，少了「这是我想出来的」那一层。",
    guard: "审讯还没到 —— 别提前让假面报名号。",
    span: { min: 1, max: 2 },
  },
  // 文档 §4.1 D3（v4-5）
  {
    id: "anc-v4-05-aring",
    sourceRef: { vol: 4, ch: "第4话「火之试炼」" },
    evId: "v4-5",
    title: "a Session.：白金戒指与「听不见」",
    outcome: "心叶得到第二把武器「a Session.」（枕边那枚白金戒指）；而此前的「抑视眼镜」让他的读心第一次失效 —— 他得用普通人的方式听懂别人。",
    variable: ["form", "who", "when"],
    when: { afterDone: ["v4-4"] },
    fallback: "可以延后到恋兔试戴那一段，但必须在四场决斗之前到手。",
    guard: "他还没戴上戒指 —— 别提前给出「a Session.」。",
    span: { min: 1, max: 2 },
  },
  // 文档 §4.1 D4（v4-7）
  {
    id: "anc-v4-07-firerite",
    sourceRef: { vol: 4, ch: "第7–8话「火之仪式」" },
    evId: "v4-7",
    title: "火之仪式：艾梅的背叛",
    outcome: "封印「线之人」的火之仪式被搅断：艾梅被确认是放走巨匠、藏匿假面心叶的人 —— 此后那道封印只能另找解法，恋兔手背上的伤成了记号。",
    variable: ["who", "cost", "relation", "form"],
    when: { afterDone: ["v4-6"] },
    fallback: "谁挡下她可以换 —— 仪式被打断这件事不变（那是世界侧）。",
    guard: "篝火之夜还没到 —— 别让封印先被解开。",
    span: { min: 2, max: 3 },
  },
  // 文档 §4.1 D5（v4-8）
  {
    id: "anc-v4-08-silencelaw",
    sourceRef: { vol: 4, ch: "第9–12话＋尾声" },
    evId: "v4-8",
    title: "紫之大树与「沉默之律」",
    outcome: "世界法则被改写：巨匠以自身为苗长成覆盖此国的「紫之大树」，立下「沉默之律」—— 此国再无时间旅行、无人能操纵人类；失去回溯能力的线之人遁入裂缝，成为此后长期敌手。",
    variable: ["who", "form", "cost"],
    when: { afterDone: ["v4-7"] },
    fallback: "他不合体 → 改由蕾雅独立执行：代价更重，关系后果更硬。",
    guard: "四场决斗还没终局 —— 别提前立下「沉默之律」。",
    span: { min: 2, max: 4 },
  },
  // 文档 §5.1 E1（v5-1）
  {
    id: "anc-v5-01-confession",
    sourceRef: { vol: 5, ch: "序章／第1话" },
    evId: "v5-1",
    title: "告白被拒，与深夜的女仆幽灵",
    outcome: "告白被明确回绝（「我没有把心叶当成那样的对象来看过」）——「未成」这个事实留在两人之间；深夜一名半透明、穿女仆装的大姐姐含泪把戒指戴在他的左手无名指上。",
    variable: ["when", "form", "relation"],
    when: { afterDone: ["v4-8"], playerAct: true },
    fallback: "他不告白 → 改成「友情的边界被点明」：事实照样留下；女仆登场不得晚于校内试胆那一格。",
    guard: "告白还没发生 —— 别让恋兔先给出恋人的答案，女仆也别提前现身。",
    span: { min: 1, max: 2 },
  },
  // 文档 §5.1 E2（v5-5）
  {
    id: "anc-v5-05-trial",
    sourceRef: { vol: 5, ch: "第7话「言万心叶」" },
    evId: "v5-5",
    title: "想起一切：世界即试炼",
    outcome: "十七年的幸福被确认为「残响」造的拟似世界 —— 「日常」不再是安全区；他决意回到会战斗的那一边。",
    variable: ["who", "form", "cost"],
    when: { afterDone: ["v5-4"] },
    fallback: "他抗拒 → 只想起一半：动力打折，但那笔债保留。",
    guard: "别提前把「日常是拟似世界」说破 —— 这一层是卷五的底。",
    span: { min: 1, max: 2 },
  },
  // 文档 §5.1 E3（v5-7）
  {
    id: "anc-v5-07-echo",
    sourceRef: { vol: 5, ch: "第10–13话＋尾声" },
    evId: "v5-7",
    title: "残响之门与「残响的盟剑」",
    outcome: "残响之门在湘南海上现出，心叶从门后的「回响」手里得到加护【残响的盟剑】—— 一生一次、绝对公平的决斗权；露娜为此缩小成幼女，留在那边的恋兔与梅芙成了回声。",
    variable: ["who", "form", "cost", "when"],
    when: { afterDone: ["v5-6"] },
    fallback: "不演奏 → 改由恋兔队独奏：加护仍在，只是有人缺席成了永久缺口。",
    guard: "音乐节还没到 —— 别提前给出盟剑，也别让露娜变小。",
    span: { min: 2, max: 4 },
  },
  // 文档 §6.1 F1（v6-1）
  {
    id: "anc-v6-01-duel",
    sourceRef: { vol: 6, ch: "序章「黑白的爱丽丝」" },
    evId: "v6-1",
    title: "决斗契约：一个月后，第零区的尸肉神殿",
    outcome: "决斗契约成立：四名协力者、一个月后、第零区「尸肉神殿」，开赛前杀任何人即判负 —— 全系列唯一一处明文的期限与地点落到他手上。",
    variable: ["who", "when", "form"],
    when: { afterDone: ["v5-7"], playerAct: true },
    fallback: "他不宣战 → 线之人自己找上门：日期改成「对方定的」，主动权与准备时间一起丢掉。",
    guard: "盟剑还没举起 —— 别让决斗的日期先定下来。",
    span: { min: 1, max: 2 },
  },
  // 文档 §6.1 F2（v6-3）
  {
    id: "anc-v6-03-america",
    sourceRef: { vol: 6, ch: "第2话「美国，毁灭」" },
    evId: "v6-3",
    title: "美国，毁灭",
    outcome: "「能成为天使的歌」这一世界观级灾害公开：看过录像的人会渐渐变成天使；Corporations 主张派刺客并招揽「圣诞老人」，恋兔被点名出战。",
    variable: ["who", "form", "cost"],
    when: { afterDone: ["v6-2"] },
    fallback: "世界侧不可绕开 —— 他没看到影片也照样发生，只是他知道得更晚。",
    guard: "影片还没公开 —— 别提前让「变成天使」这件事发生。",
    span: { min: 1, max: 2 },
  },
  // 文档 §6.1 F3（v6-7）
  {
    id: "anc-v6-07-solo",
    sourceRef: { vol: 6, ch: "第9–12话" },
    evId: "v6-7",
    title: "恋兔的「独断恐怖袭击」",
    outcome: "恋兔把这一场定性为自己一个人的「私人闹剧 / 恐怖袭击」并独自留下断后：委员会与她从此被分开记账，而心叶得以潜入自由女神像地下。",
    variable: ["who", "cost", "form"],
    when: { afterDone: ["v6-6"] },
    fallback: "他阻止她 → 改成委员会名义的正式作战：代价是她与学园一起被写进档案（名声与关系的偏移，锚点仍发生）。",
    guard: "会谈还没破裂 —— 别让她提前把罪名揽到自己身上。",
    span: { min: 2, max: 4 },
  },
  // 文档 §6.1 F4（v6-8）
  {
    id: "anc-v6-08-devour",
    sourceRef: { vol: 6, ch: "第13–15话＋尾声" },
    evId: "v6-8",
    title: "吞食艾美莉亚，与她的消失",
    outcome: "心叶在精神世界吞食艾美莉亚到三亿、因自我同一性崩溃而败北，化作矿物球体；艾美莉亚统一全人类、只身挑战宇宙根源，败于无限后抹除自身、令世人遗忘她 —— 世界恢复日常。",
    variable: ["cost", "form", "who"],
    when: { afterDone: ["v6-7"] },
    fallback: "败北的形态可以更轻也可以更重（原文是矿物化），但「主角在这里第一次输」不变。",
    guard: "地下决战还没到 —— 别提前让她消失。",
    span: { min: 2, max: 4 },
  },
]

/** id → 锚点（同一张表，认 id 时不必每次 filter） */
export const ANCHOR_BY_ID: Record<string, Anchor> = Object.fromEntries(
  ANCHORS.map((a) => [a.id, a]),
)
