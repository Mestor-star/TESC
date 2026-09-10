import type { MindVoice } from './types'

/* ============================================================
   心声监听（低语者 Susurrador 读取到的心声）
   — 均为原文逐字（引号已去掉）；vol: 卷数；group 与时间线分组一致。
   — who: 四名成员用 CharId；非成员心声用 'other'（speaker 记名）。
   ============================================================ */

type M = Omit<MindVoice, 'vol' | 'group'>;

const one = (vol: number, group: string, ms: M[]): MindVoice[] =>
  ms.map((m) => ({ vol, group, ...m }));

export const MINDS: MindVoice[] = [
  /* ——— 第1卷 ——— */
  ...one(1, '卷1', [
    { id: 'm1-1', who: 'other', speaker: '拉斐尔', scene: '序章 · 货船', text: '对不起，言万……我没有办法违背命令。' },
    { id: 'm1-2', who: 'other', speaker: '魔王', scene: '序章 · 货船', text: '我好害怕……可是……我才不会输给恐惧。' },
    { id: 'm1-3', who: 'other', speaker: '露娜（伪装身份）', scene: '女神殿 · 照料', text: '……我，并不是真心想服侍你。' },
    { id: 'm1-4', who: 'luna', speaker: '露娜', scene: '异端审问 · 判决', text: '要是再和你待在一起，我怕自己会对你产生不该有的感情。' },
    { id: 'm1-5', who: 'luna', speaker: '露娜', scene: '契约前 · 濒死', text: '好可怕……有了重要的人。' },
    { id: 'm1-6', who: 'mefisa', speaker: '梅芙莉莎', scene: '浴室驱逐后 · 道歉', text: '呜呜，言万同学好体贴……啊呜啊呜。' },
    { id: 'm1-7', who: 'mefisa', speaker: '梅芙莉莎', scene: '研究所 · 兄长', text: '我也想……像哥哥那样被需要着。' },
    { id: 'm1-8', who: 'nyau', speaker: '小柴喵呜', scene: '巴塞罗那 · 事后', text: '今天……学长还算挺帅的哦。' },
    { id: 'm1-9', who: 'you', speaker: '言万心叶', scene: '达沃 · 深夜', text: '嘴里一直有血的味道……想在这里赎罪。' },
    { id: 'm1-10', who: 'hikari', speaker: '恋兔光', scene: '异界 · 决战前夜', text: '你可别死啊，我们才刚成为朋友。' },
  ]),

  /* ——— 第2卷 · 天空竞技祭 ——— */
  ...one(2, '卷2', [
    { id: 'm2-1', who: 'hikari', speaker: '恋兔光', scene: '集市 · 扭蛋', text: '呜哇……在这家伙面前买扭蛋，被看穿了吧。' },
    { id: 'm2-2', who: 'other', speaker: '弗恩·西蒙', scene: '旅路 · 忠诚', text: '为了学园，为了委员会，我什么都能做。' },
    { id: 'm2-3', who: 'other', speaker: '吴诗涵（珊）', scene: '特训 · 宣言', text: '就算你读心也没用……看着我的眼睛。' },
    { id: 'm2-4', who: 'hikari', speaker: '恋兔光', scene: '宿舍 · 交心', text: '别再让我一个人孤零零的了，行吗。' },
    { id: 'm2-5', who: 'other', speaker: '菲德拉', scene: '副将战 · 复制渴望', text: '你和我，谁才是真正的菲德拉？' },
    { id: 'm2-6', who: 'mefisa', speaker: '梅芙莉莎', scene: '副将战 · 脱机', text: '太好了……你还活着……吓死我了。' },
    { id: 'm2-7', who: 'other', speaker: '凯特琳', scene: '大将战 · 战前', text: '那家伙，简直不像人类。' },
    { id: 'm2-8', who: 'nyau', speaker: '小柴喵呜', scene: '医院 · 苏醒', text: '呜……明明是我赢的……为什么大家一副要哭的样子。' },
  ]),

  /* ——— 第3卷 · 樱次元决战 ——— */
  ...one(3, '卷3', [
    { id: 'm3-1', who: 'other', speaker: '废道昏暗', scene: '坠落 · 呐喊', text: '谁来……救救我的故乡——！' },
    { id: 'm3-2', who: 'other', speaker: '艾莉芙（发烧）', scene: '照料 · 呓语', text: '好寂寞……哥哥以前……总是握着我的手。……哥哥……对不起。' },
    { id: 'm3-3', who: 'hikari', speaker: '恋兔光', scene: '上野 · 人群', text: '好多人……好可怕……不要挤过来……' },
    { id: 'm3-4', who: 'other', speaker: '蓝兔', scene: '舰桥 · 胜率', text: '一成……不，连一成都没有。但总要有人去试。' },
    { id: 'm3-5', who: 'other', speaker: '星鲸', scene: '孤鲸 · 祈愿', text: '好想……回家。可是已经……回不去了。' },
    { id: 'm3-6', who: 'luna', speaker: '露娜', scene: '黄金兔子 · 告别', text: '……对不起，小主人……' },
    { id: 'm3-7', who: 'other', speaker: '六十亿人', scene: '星鲸战 · 共鸣', text: '想要幸福……想要活下去……想要有人记得我。' },
    { id: 'm3-8', who: 'nyau', speaker: '小柴喵呜', scene: '津轻 · 高空', text: '哥哥……再陪喵呜一会儿……' },
  ]),

  /* ——— 第4卷 · 篝火之国留学 ——— */
  ...one(4, '卷4', [
    { id: 'm4-1', who: 'hikari', speaker: '恋兔光', scene: '出发前 · 宿舍', text: '心叶要是不知道又跑去哪里……我不想……再经历那种悲伤的事了。' },
    { id: 'm4-2', who: 'hikari', speaker: '恋兔光', scene: '王宫 · 夜谈', text: '哼哼，心叶。读我的心可是没用的哟。' },
    { id: 'm4-3', who: 'other', speaker: '达娜厄', scene: '伦敦 · 哭诉', text: '呜哇——七亿……我把运营资金全赔光了……' },
    { id: 'm4-4', who: 'other', speaker: '蕾雅', scene: '篝火之国 · 宣言', text: '我是蕾雅·库尔·杜·琉米爱尔。我以我的骄傲起誓，我一定会保护你！' },
    { id: 'm4-5', who: 'other', speaker: '艾梅', scene: '背叛 · 诀别', text: '——我，相信他的冒险。' },
    { id: 'm4-6', who: 'other', speaker: '假面心叶', scene: '塔顶 · 决战', text: '所以你——哭着去死吧。' },
    { id: 'm4-7', who: 'hikari', speaker: '恋兔光', scene: '救场 · 掌掴', text: '笨蛋……为什么不叫我……！' },
    { id: 'm4-8', who: 'mefisa', speaker: '梅芙莉莎', scene: '家书', text: '心叶同学，在外面也要好好吃饭啊。' },
  ]),

  /* ——— 第5卷 · 残响的遗骸 ——— */
  ...one(5, '卷5', [
    { id: 'm5-1', who: 'luna', speaker: '露娜', scene: '流星夜', text: '──要幸福啊。' },
    { id: 'm5-2', who: 'other', speaker: '琳', scene: '初次见面', text: '实在很难相信这种呆头呆脑的人跟线之人战斗过。……但喵呜也很亲近他……' },
    { id: 'm5-3', who: 'other', speaker: '残响', scene: '真相', text: '残响的目的是什么？──实现你的愿望。' },
    { id: 'm5-4', who: 'other', speaker: '回响', scene: '告别', text: '再见了，言万心叶——愿你获得幸福。' },
    { id: 'm5-5', who: 'nyau', speaker: '小柴喵呜', scene: '儿时回忆', text: '真想一直和他在一起呀。' },
    { id: 'm5-6', who: 'nyau', speaker: '小柴喵呜', scene: '流星夜 · 星下', text: '无论过了多久，喵呜都永远是你的妹妹！' },
    { id: 'm5-7', who: 'luna', speaker: '露娜', scene: '约定', text: '如果你死了，我也会跟着死去。' },
    { id: 'm5-8', who: 'other', speaker: '东夷草次郎', scene: '转生 · 异界', text: '无论在哪个世界、哪个地方，我们都是朋友。' },
  ]),

  /* ——— 第6卷 · 艾美莉亚·玛克比尔事件 ——— */
  ...one(6, '卷6', [
    { id: 'm6-1', who: 'other', speaker: '圣诞老人', scene: '时代广场 · 悔意', text: '……不用帮忙，就在那看着吧。' },
    { id: 'm6-2', who: 'other', speaker: '奈奈', scene: '酒店 · 告白', text: '……其实还挺喜欢你的哦？' },
    { id: 'm6-3', who: 'other', speaker: '黑之魔王', scene: '海上 · 临终', text: '……对不起……之后就交给你了……亲爱的……' },
    { id: 'm6-4', who: 'other', speaker: '凯特琳', scene: '自由女神像 · 战意', text: '看到比我更强的人——居然让我如此热血沸腾。' },
    { id: 'm6-5', who: 'other', speaker: '伊西丝', scene: '同化 · 觉醒', text: '我——成为了——我。' },
    { id: 'm6-6', who: 'hikari', speaker: '恋兔光', scene: '病房 · 嘴硬', text: '才……才不是特意来照顾你的！' },
    { id: 'm6-7', who: 'nyau', speaker: '小柴喵呜', scene: '告白 · 妹妹', text: '哥哥有了重要的人……喵呜、喵呜真的替你高兴……' },
    { id: 'm6-8', who: 'luna', speaker: '露娜', scene: '归途', text: '无论你变成什么样，我都会在你身边。' },
  ]),

  /* ——— 外传 S1 ——— */
  ...one(0, '外传·S1', [
    { id: 'mga-1', who: 'other', speaker: '格蕾', scene: '走廊 · 初见', text: '呜哇，偏偏被最不想碰上的人搭话了。' },
    { id: 'mga-2', who: 'other', speaker: '格蕾', scene: '带路 · 提防', text: '太自来熟了吧这人。该不会有什么企图吧。我可是很可爱的。' },
    { id: 'mga-3', who: 'other', speaker: '恋兔光', scene: '现框 · 宿舍同床', text: '……啊。有小吴的味道。能被人放在心上……有多让人安心。' },
    { id: 'mga-4', who: 'other', speaker: '泰尔', scene: '送别格蕾', text: '这俩该怎么办好呢。算了，看起来挺幸福的，就让他们随心所欲地过完这一生吧。' },
    { id: 'mga-5', who: 'nyau', speaker: '小柴喵呜', scene: '打游戏 · 心动', text: '（胸口轻轻一紧）……大概是肚子饿了吧。' },
    { id: 'mga-6', who: 'luna', speaker: '露娜', scene: '年末 · 空教室', text: '只有在战场上，才不觉得冷……总觉得，会变得很寂寞。' },
  ]),
];
