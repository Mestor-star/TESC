/* ============================================================
   私密档案底档（data/intimate.ts）
   ------------------------------------------------------------
   **这是一份游戏内档案，不是原文考据。** 原作没有这些读数 —— 字段、状态句与
   看法都是本终端自行拟制的（与 TAVERN_PERSONAS 的 greeting 同一性质：
   撰写样本，非原文台词）。因此：
     · 绝不冠以「· 原文」，也不进人物卡 / 导演提示词当事实喂；
     · 状态句一律**档案用词**，写在这一页上，不写成正文；情节由推演通道去写。

   分工：
     · 本文件 = **底档**（初见时的那一页）；
     · `WorldState.intim` = **推进**（约会与私密往来落下的开发度增量 / 状态改写 /
       破处对象 / 最近一回 / 看法改写）；
     · 合成规则在 `intimateOf`。

   一页上五根条：四处部位（口腔 / 胸部 / 小穴 / 菊穴）的**开发度**，加一根
   **色情度**（`lewd`）—— 后者不挂部位，说的是她这个人此刻的敏度与淫靡程度，
   与四处同一口径（0–100 的读数 + 一个档位词）。

   **读数一律从 0 起。** 初见那一页五根条全在 0（「未开发」）：谁都不是带着
   开发度登场的，往上走的每一格都得由主角在正文或见面里真的走出来。上限 100。

   状态句写各人**此刻的身体与反应**（用词直给，不绕开敏感词）——
   这是档案，不是正文，所以不避讳、也不煽情：说清楚哪一处是什么样、被碰到会怎样。

   **这一页不封存。** 它是本终端只给「你」看的那一份 —— 不随羁绊解封、也不等
   谁点头（羁绊到了才开口的，是**她本人**：私密话题与约会仍要 `INTIMATE_BOND`，
   那是两个人的事；这一页是你自己手里的东西）。只对**女角色**生效：
   `genderOf(id) !== 'f'` 的角色整节不出现（见 `hasIntimate`）。

   羁绊对它的影响是**间接**的一处：羁绊过线之后，「对这种事情的看法」换一句
   （`viewHigh`）—— 关系走到这一步，她自己对这一件事的态度也跟着松了。
   ============================================================ */

import type { IntimateBase, IntimatePart, IntimateProfile, IntimateProgress, IntimateSlot } from './types'
import { genderOf } from './castmeta'

/** 私密档案 / 私密话题的解锁门槛（羁绊读数） */
export const INTIMATE_BOND = 70

/** 部位的四栏顺序（界面与提示词都照它排列，别各自再写一套） */
export const INTIMATE_SLOTS: IntimateSlot[] = ['mouth', 'breast', 'vagina', 'anus']

/** 部位的中文标签与一行释义（档案面板与提示词共用） */
export const SLOT_META: Record<IntimateSlot, { label: string; hint: string }> = {
  mouth: { label: '口腔', hint: '唇、舌、口腔与咽喉的开发状况' },
  breast: { label: '胸部', hint: '乳房、乳晕与乳头的开发状况' },
  vagina: { label: '小穴', hint: '外阴与阴道的开发状况' },
  anus: { label: '菊穴', hint: '后庭与直肠的开发状况' },
}

/**
 * 第五根条：色情度。它不挂在哪个部位上 —— 四处开发度说的是「这处被开发到哪儿了」，
 * 色情度说的是**她这个人**此刻对这件事的敏度与淫靡程度：同样的 40，两个人的反应
 * 完全是两回事。所以它与四处并列成第五行，读数口径一致（0–100）。
 */
export const LEWD_META = { label: '色情度', hint: '对性事的敏度、淫靡程度与身体有多容易起来' } as const

/** 「最近的性行为」的缺省读数（还没发生过） */
export const NO_ACT = '—— 尚未发生过'

/**
 * 一条私密推进的显示名 —— 提示条上念的那一句：
 * 「口腔」/「色情度」/「口腔 · 色情度」/「最近一回」/「看法」。
 * 三路各记各的（见 lib/plot.ts 的 IntimateDirective），所以这里也可能几样都念。
 */
export function intimAdvanceLabel(
  it: { slot?: IntimateSlot; lewd?: number; lastAct?: string; view?: string },
): string {
  const out: string[] = []
  if (it.slot) out.push(SLOT_META[it.slot].label)
  if (it.lewd) out.push(LEWD_META.label)
  if (it.lastAct) out.push('最近一回')
  if (it.view) out.push('看法')
  return out.join(' · ')
}

/** 开发度的档位词（读数之外给一句人话；0 与满值各有专门说法） */
export function devStage(dev: number): string {
  if (dev <= 0) return '未开发'
  if (dev < 20) return '初识'
  if (dev < 40) return '渐熟'
  if (dev < 60) return '熟稔'
  if (dev < 80) return '深谙'
  if (dev < 100) return '沉溺'
  return '极深'
}

/** 破处对象的显示名（'you' = 操作员本人；其余为世界内人物名） */
export function firstByName(who: string | null, operatorName: string): string {
  if (!who) return ''
  return who === 'you' ? `${operatorName}（你）` : who
}

/** 底档的一句「未破处」标注（破处对象那一栏的缺省读数） */
export const VIRGIN = '—— 未破处（处女）'

/** 底档的一条读数：状态句 + 开发度（初见一律 0） */
const p = (state: string): IntimatePart => ({ state, dev: 0 })

/**
 * 女角色底档。键 = 档案角色 id（只收 `genderOf === 'f'` 的 18 位）。
 *
 * · `parts[].dev` 与 `lewd` **一律 0**：这是初见那一页，不预支任何开发度；
 * · `parts[].state` 写她的身体与反应（档案用词，直给）；
 * · `view` 是初见时她对这件事的看法；`viewHigh` 是**羁绊过线之后**的那一句
 *   （两句话要写得出「同一个人、关系不一样了」的差别，不能只是换个说法）；
 * · `lastAct` 初见恒为 `NO_ACT` —— 往后由推进覆盖。
 */
export const INTIMATE: Record<string, IntimateBase> = {
  /* —— 苍之学园 —— */
  hikari: {
    parts: {
      mouth: p('唇形饱满、唇色偏深，舌面从未被人碰过。接吻零经验 —— 被吻住会先愣两秒，再毫不退让地咬回来。口腔浅，手指压到舌根就会干呕，喉咙未曾被开发。'),
      breast: p('乳房分量十足，大到她自己嫌碍事；乳晕颜色浅，乳头一被含住就立刻立起来，隔着衣服也看得出形状。她不肯让人盯着看，被看了会瞪回来，可被摸到腰侧就先软了。'),
      vagina: p('外阴未经人事，大阴唇贴合、小阴唇颜色很浅，阴蒂被直接碰到会整个人弹一下。阴道口紧，一根手指都进得艰难；本人对这类话题意外地脸皮薄，说到一半必定岔开。'),
      anus: p('后庭全未开发，连触碰都未经设想。肛口紧得几乎看不见缝隙，被指尖擦过会立刻夹紧，整个人僵在原地。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '把这件事看作「最亲近的人之间才做的」—— 嘴上一定先抗拒两句，身体却先一步诚实。做完会装着什么都没发生过，第二天又自己凑上来。',
    viewHigh: '关系近了之后不再嘴硬：想要就自己说，事后也赖着不走。她把这回事当成两个人之间最直接的那句话 —— 别的说不出口的，都用这个说。',
  },
  luna: {
    parts: {
      mouth: p('唇上有烟草与咖啡的余味；舌面敏感度超出设计值，被滑过会起一层细微的战栗。吻技生涩 —— 她只从资料里学过，真用起来总慢半拍。'),
      breast: p('丝线织就的仿真乳房，触感偏凉、回弹很慢；乳头那点敏感是刻意保留的，被含住时整个胸口的织线都会绷紧。'),
      vagina: p('人造之躯，机能完备而从未被使用过：内壁会自行分泌润滑，温度比体温略低。她会直白地说「这里还没被用过」，语气像在念一串参数。'),
      anus: p('后庭全未开发。本人会一脸平静地问「要试这里吗」—— 不是挑逗，是真的在确认需求。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '不当作禁忌，也不当作义务：把它当成一项可以一起做、需要反馈的活动。她会直接问、直接记，下一次做得更准。',
    viewHigh: '越走近，越把这件事当成只对一个人开放的那部分：她开始记他喜欢什么、在意自己有没有做对。参数之外的东西，她第一次愿意自己定。',
  },
  mefisa: {
    parts: {
      mouth: p('唇干净、抿得很紧，从不轻易放什么进来。被深吻会先僵住、手指抓紧，随后反客为主地压回来；喉咙浅，吞得勉强。'),
      breast: p('高挑身量的相应分量，乳型偏尖、乳晕小而色浅。她从不谈论这处，被碰到会先把外套拢好 —— 但耳朵会红。'),
      vagina: p('未经人事：外阴干净、颜色很浅，阴道口紧闭，第一次进入会很难。她对这一步有自己那套审慎的判断 —— 要她点头，比要她动心难得多。'),
      anus: p('后庭全未开发，她从未把这处算进「可以考虑」的范围内。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '认为这件事要关系走到位才谈得上，草率是要付出代价的。一旦认定，反而一次比一次认真 —— 她不做半途而废的事。',
    viewHigh: '认定之后比谁都放得开：既然选定了，就不再留半分余地 —— 她会主动开口，也会在自己那套审慎里划出一块专门留给他的地方。',
  },
  nyau: {
    parts: {
      mouth: p('口腔里常年是草莓牛奶的甜味，唇很软、张合都慢。舌面怕痒，被吸住会边笑边躲；喉咙极浅，含到一半就要呛。'),
      breast: p('身形娇小，乳房分量轻盈得几乎一手能托住；乳晕小、颜色很粉，乳头怕冷，被吹口气就缩起来。整个人怕痒，摸到肋骨就会缩成一团。'),
      vagina: p('未经人事：外阴很小、颜色粉，阴蒂几乎藏在里面。连「这意味着什么」都还一知半解，被碰到会先问你在做什么，然后才反应过来脸红。'),
      anus: p('后庭全未开发，肛口小得几乎看不见，光是撑开一点点都会喊疼。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '好奇远大于羞耻 —— 什么都想问、想试，被拒绝了也不记仇，转头又凑上来。她把这件事和「一起吃甜的」归成一类。',
    viewHigh: '关系一近，好奇就变成了黏人：想试的都要试一遍，做完还要问好不好。她要的不只是新鲜，是被你一直带着。',
  },
  youshihan: {
    parts: {
      mouth: p('睡醒后唇总是软的、带着体温；吻到一半会打着哈欠黏上来，把重量全压给你。舌头懒，动得很慢，耐力却长得不像话 —— 她要的是消磨，不是结束。'),
      breast: p('乳房分量可观、质软下垂，本人懒得管；乳晕大、颜色深，睡姿压出的红印要好久才消。被摸到也只是眯着眼看你，不催也不拦。'),
      vagina: p('自陈「活得太久，这种事也没那么新鲜了」，实则疏于打理：外阴在体毛之下，阴道口松软、进去不难，湿得慢，一旦湿了就不肯停。'),
      anus: p('后庭未开发，本人表示「懒得试」—— 但没说死。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '见得多、看得淡，不觉得有什么好避讳，只是懒得张罗。真做起来又会很沉 —— 她要的是有人陪她慢慢地耗一整晚。',
    viewHigh: '不再只是陪她消磨时间：她开始挑时候、挑心情，也会在他不在的夜里自己想起这件事 —— 对活了这么久的人来说，那是很少见的事。',
  },
  'alive-anatolia': {
    parts: {
      mouth: p('谈笑间就把话说满；吻的时候也一样，绝不给退路 —— 舌是压进来的，不是探进来的。唇形与牙列无可挑剔，喉咙却意外地浅，深了会生理性地流泪，而她不介意让你看见。'),
      breast: p('仪态无可挑剔，衣装之下亦然：乳型饱满上挺、乳晕小而色浅；乳头几乎不受冷热影响，只有在她真的想要的时候才立起来。'),
      vagina: p('本人声称「我等你很久了」；档案不作旁证。外阴修整得干净、颜色浅，阴道内壁偏紧，第一次进入时她既不躲也不闭眼。'),
      anus: p('后庭未开发 —— 她把这处留着，没有说给谁。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '看得极清楚，也因此极从容：把这当作关系里最诚实的一环，说出口的每个字都算数。她不假装害羞，也不让你蒙混过去。',
    viewHigh: '她本来就不装。关系越近，越把那层从容收起来一点：会索要、会打断自己的话、会承认自己也有等不及的时候 —— 说过的字仍旧算数。',
  },
  'xiaochai-lin': {
    parts: {
      mouth: p('屏幕蓝光下没怎么说过软话；被亲会先报一句「进程出错」，然后自己把舌头伸回来。唇偏薄、偏凉，接吻的经验全部来自观测数据，做起来一板一眼。'),
      breast: p('与姐姐相仿的娇小分量，乳尖很小、颜色浅。她自己不碰，被碰到会下意识报一句读数，再慢慢安静下来。'),
      vagina: p('未经人事，知情程度却是队里最高的一个 —— 解剖图背得下来，实操为零。外阴干净、阴道口紧；被碰到会一边脸红一边替你报出该往哪儿。'),
      anus: p('后庭全未开发；她自己说过「这一处没有对应的使用说明」。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '用观测数据来理解这件事 —— 知道全部原理、没有全部经验。她会一边脸红一边把该做的事一件件列出来，然后照着做。',
    viewHigh: '从「按说明操作」到会自己凑上来：她开始有偏好、会提要求，也会在事后一本正经地记录「本次的偏差」。',
  },

  /* —— 卡乌斯学院 —— */
  'danae-whitmore': {
    parts: {
      mouth: p('平时结结巴巴，唇一紧张就抿成一条线；被吻住时「认真模式」会突然切换 —— 判若两人地反过来主导，吻得又深又准，直到自己先喘不上气再缩回去。'),
      breast: p('娇小身形下的分量出人意表，与她变身后的身量一样不合常理；乳晕偏大、颜色浅，被含住时整个上身都会抖。'),
      vagina: p('未经人事：外阴颜色很浅、阴道口紧得几乎进不去。对这类话题怯生生地回避，却又会在认真模式里突然直白地问「那一步到底要怎么做」。'),
      anus: p('后庭全未开发，光是听到这个词就要结巴。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '平时连这个词都说不完整，一进「认真模式」却比谁都直白：会当场问「这一步怎么做」，问完自己先僵住。',
    viewHigh: '认真模式不再需要触发条件：在他面前，她随时切得过去，也随时会红着脸退回原来的样子 —— 两副样子都要给他看。',
  },
  'nana-kamiru': {
    parts: {
      mouth: p('总是先问你要不要喝点什么；唇上带着温吞的糖分。吻得很慢、很照顾人 —— 先试探，确认你不躲才继续。'),
      breast: p('乳房分量中上，收在制服的护具里；乳晕颜色偏深、乳头很敏感，被含住会「啊」一声，然后咬住自己的手背。'),
      vagina: p('未经人事；照顾人的那一面远多过被照顾 —— 被碰到会先问你舒不舒服，自己湿了也察觉不到。外阴偏丰、颜色深，阴道口紧。'),
      anus: p('后庭未开发；她照顾过别人的伤口，却没想过这一处。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '把这件事也当成一种照顾 —— 先顾你是不是舒服，自己的感觉排在后面。得有人提醒她，她才想起来自己也该被照顾。',
    viewHigh: '终于肯被人照顾：她还是会先问你，但被你按住手的时候不再推开。她第一次知道，被人顾着是什么感觉。',
  },
  reiya: {
    parts: {
      mouth: p('见了你就雀跃，吻起来毫无保留 —— 舌头直接缠上来，技巧一般但热情足。唇保养得极好，软而甜。'),
      breast: p('名门娇养的分量，乳型圆挺、皮肤极白，乳晕是浅樱色；她对身材管理相当自得，不介意被看。乳头敏感，被含住会抱住你的头不放。'),
      vagina: p('未经人事；对「夫妻」一类说法毫无抵抗力 —— 光是被那样叫一句就会湿。外阴修整得干净整齐，阴道口紧而浅。'),
      anus: p('后庭全未开发；名门的教养让她光是提起这个词都觉得失礼。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '名门教出来的体面压着好奇心：嘴上说「这种事不能随便」，被叫一句「夫人」就全线动摇。她想要的是被当成唯一的那个。',
    viewHigh: '把「夫人」这个称呼坐实了：体面还在，只是不再用来挡他 —— 她会主动讨，也会在讨到之后得意好几天。',
  },
  emei: {
    parts: {
      mouth: p('姐姐式的话术滴水不漏，只有独处时才肯软下来 —— 吻起初是安抚式的，被回应之后会一寸一寸地失控，最后自己咬着下唇不出声。'),
      breast: p('与蕾雅相仿的家系，身量略高；乳房饱满、乳晕浅，被摸到会先轻轻按住你的手，然后才松开。'),
      vagina: p('未经人事；档案不作旁证。外阴颜色浅、阴道口紧，前戏做足了才会软；她习惯先让别人舒服。'),
      anus: p('后庭未开发 —— 姐姐当惯了，还没试过把这一面交给谁。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '姐姐当久了，习惯把别人的需求摆在前头。她不是不想要 —— 是要有人让她不必再当姐姐。',
    viewHigh: '不再当姐姐：只在他这里，她可以不管别人的事、可以要、可以赖。她把这当成两个人之间唯一不需要体面的地方。',
  },
  'isis-halid': {
    parts: {
      mouth: p('话头永远比人快；被堵住嘴的瞬间会安静得反常 —— 那是她少有的不说话的时候。舌头灵，学什么都快；喉咙浅。'),
      breast: p('中上；本人宣称这是「取材必要」。实测乳晕偏大、乳头极敏感，被含住会当场取消伪装。'),
      vagina: p('未经人事，却敢把这种事写进稿子 —— 写得很详细，实操为零。外阴颜色偏深、阴道口并不算紧；一被夸写得好就湿。'),
      anus: p('后庭未开发；她把这个写进过后来被删掉的那一段。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '写得出最露骨的文字，也真敢试。把这当成「必须亲历才写得准」的取材，写着写着就分不清是取材还是想要。',
    viewHigh: '取材变成了私事：稿子写不下去了 —— 她发现自己不想把这一段写出去。这是她头一次给自己留了一段不发表的东西。',
  },

  /* —— Corporations —— */
  katherine: {
    parts: {
      mouth: p('吻也带着队长的规矩：先请示，再准或不准。唇形利落、齿列整齐，接吻时手会先在背后扣好；被强吻则会先僵三秒，再反过来扣住你。'),
      breast: p('制服与礼节之下，分量相当可观；乳晕小、颜色浅，乳头硬起来会隔着衬衫顶着。她发现之后会立刻去换一件。'),
      vagina: p('未经人事；本人视之为「未开辟的战线」。外阴干净、阴道口紧，进入时她会索要一句明确的许可。'),
      anus: p('后庭未开发 —— 队长的规矩里没有这一项，她也还没打算改。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '当成一条必须守规矩的战线：要许可、要步骤、要事后复盘。规矩是她自己定的，所以她自己也会在最关键的那一步破例。',
    viewHigh: '规矩还在，但许可变成了常设的：她不再每回都问，也会在事后靠着他复盘 —— 复盘的内容与战线无关。',
  },
  maria: {
    parts: {
      mouth: p('台上是万人迷，台下却容易脸红；吻得笨拙 —— 牙齿会磕到，磕到之后红着眼道歉，然后又凑上来。唇保养得好，那是职业需要。'),
      breast: p('身形纤细，乳房分量轻盈；乳晕小、颜色浅粉。被镜头训出来的姿态在私下全没用，被含住就会缩起肩膀。'),
      vagina: p('未经人事；舞台上的媚态全是为镜头练的 —— 私下被碰到会先笑场。外阴颜色很浅，阴道口紧，湿得慢。'),
      anus: p('后庭全未开发，光是想想就要捂脸。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '台上演得比谁都放得开，私下听到这个词先笑场。她怕的不是这件事，是「做得不好」—— 需要有人告诉她不必表演。',
    viewHigh: '不再演了：她在他面前唱走调也不改回来，做不好也不再道歉。她终于敢把「不好看的那一面」交出去。',
  },
  'merwen-gray': {
    parts: {
      mouth: p('文学少女的唇；被吻时会先引一句书，再忘了后半句。唇软、齿列好，吻到一半会突然翻身压上来 —— 真空手道的底子让她在这件事上力气并不小。'),
      breast: p('中上；真空手道的底子让她不介意被掂量 —— 被摸了会一本正经地评比手感，然后自己先红透。乳晕偏大、颜色浅。'),
      vagina: p('未经人事；对她而言更像一章还没写的书。外阴干净、阴道口紧，第一次会疼，而她会咬着牙把这一点也念出来。'),
      anus: p('后庭未开发；她说这一处的「文本」她还没读过。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '拿书里的句子对照着看，发现全都不准。她愿意把这一章慢慢写，但拒绝跳过任何一页 —— 包括疼的那一页。',
    viewHigh: '这一章不再照着书里的句子写：她发现写得慢一点也没关系，甚至愿意为了他在某一页上多停几遍。',
  },
  ameria: {
    parts: {
      mouth: p('话语隔着记录世界传来；吻上去分不清虚实 —— 唇是有温度的，触感却在指尖散开。舌头很轻，像怕把你碰碎。'),
      breast: p('亡者的身姿，停在离去前的那一年：乳房饱满、皮肤近乎透明，乳晕是淡淡的灰粉。被含住时她会轻轻地吸气。'),
      vagina: p('未经人事；本人对此只是柔和地笑。外阴颜色浅到发白、阴道口紧，进入时里头是温的、极安静。'),
      anus: p('后庭未开发 —— 亡者不在这处留痕迹。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '已经不在了的人，对这件事只剩下温和的纵容：她知道自己留不住什么，所以愿意把还能给的都给你。',
    viewHigh: '不再只是纵容：她开始提要求、开始有想留下点什么的意思 —— 对已经不在了的人来说，那是最重的变化。',
  },

  /* —— 学园外 · 其它 —— */
  'kuro-no-maou': {
    parts: {
      mouth: p('甜食党的舌头；亲过你一次，就再也不打算认生 —— 一有机会就往你嘴里钻。嘴小、舌短，吻技其实很差，但她完全不在意。'),
      breast: p('看似纤弱，实则与她的执念一样不容动摇：乳房小巧而极挺，乳晕小、颜色深。她把这处当成「吾之所有」的一部分 —— 不许别人碰，却主动塞给你。'),
      vagina: p('如她所言，「吾乃魔王」—— 这一页尚未开启。外阴小巧、颜色偏深，阴道口紧；她自己会问「什么时候做」，问得像在下战书。'),
      anus: p('后庭未开发；本人表示「没兴趣，除非你想要」—— 后半句说得很小声。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '把这件事也归进「吾之所有」：不讲道理、不许分享、想要就直说。怕的从来不是做，而是你不承认她是第一个。',
    viewHigh: '不再需要「吾之所有」这个词撑着：她会直说要、会说想他，也会在意他有没有同样想她 —— 魔王也是会不安的。',
  },
  'huda-nayume': {
    parts: {
      mouth: p('算过千百种局面，唯独没算过这一种；被吻住会难得地少话。唇薄、抿得紧，吻起来先是一动不动，然后按她算好的那一步精确地回应。'),
      breast: p('中上；收在领队的外套里。乳晕偏小、乳头敏感，被摸到会先算一下「这个反应的成因」，算到一半就放弃了。'),
      vagina: p('未经人事；档案不作旁证。外阴颜色浅、阴道口紧。她会把前戏当成一份需要精确执行的流程，然后在中途全部忘掉。'),
      anus: p('后庭未开发 —— 她算过这一处的风险，结论是「暂时不收进计划」。'),
    },
    lewd: 0,
    virgin: true,
    firstBy: null,
    lastAct: NO_ACT,
    view: '算计一切的人，唯独算不准这个。嘴上说要按计划走，实际每次都把计划丢在门外 —— 那是她少数允许自己失控的地方。',
    viewHigh: '计划终于被彻底丢在门外：她不再算风险，也不再留退路 —— 在她那张永远算得清的表上，只有这一栏她愿意空着。',
  },
}

/** 该角色有没有私密档案（只对女角色生效；底档或性别任一不合即 false） */
export function hasIntimate(charId: string): boolean {
  return genderOf(charId) === 'f' && !!INTIMATE[charId]
}

/**
 * 底档 + 推进 → 此刻的一页。
 *
 * 合成规则（六处，缺一不可）：
 *   · 部位开发度 = 底档（0）+ 增量，夹在 0–100；
 *   · 色情度     = 同上，只是它不挂在哪个部位上（`IntimateProfile.lewd`）；
 *   · 状态句 = 推进里若有这一段就覆盖底档那一句（后写覆盖）；
 *   · 破处对象 = 第一次落下的那个说了算（`firstBy`）—— 之后再有改写也不顶掉它：
 *     「破处对象是谁」问的是第一回，不是最近一回；
 *   · 最近的性行为 / 看法 = 同上，后写覆盖（这两项说的是「此刻」，与第一回无关）。
 * 不是女角色 / 没有底档 → null（调用方整节不摆）。
 */
export function intimateOf(
  charId: string,
  progress?: IntimateProgress,
  /** 此刻的羁绊读数 —— 只用来决定「看法」取哪一层（见下方 view 的取舍） */
  bond = 0,
): IntimateProfile | null {
  const base = INTIMATE[charId]
  if (!hasIntimate(charId) || !base) return null
  const parts = {} as Record<IntimateSlot, IntimatePart>
  for (const slot of INTIMATE_SLOTS) {
    const b = base.parts[slot]
    const add = progress?.dev?.[slot] ?? 0
    const state = progress?.state?.[slot]
    parts[slot] = {
      state: state?.trim() ? state.trim() : b.state,
      dev: Math.max(0, Math.min(100, Math.round(b.dev + add))),
    }
  }
  const lewdAdd = progress?.lewd ?? 0
  const first = progress?.firstBy?.trim() || base.firstBy
  /* 「看法」取三层里最高的那一层：
       ① 推进里真的改写过的（情节里变了 —— 最硬的证据，压过一切）；
       ② 羁绊过了线的：关系走到这一步，她自己对这一件事的态度也跟着松了。
          这是**间接**影响 —— 不是把读数换算成一句话，只是换一句她本来就会说的话；
       ③ 底档那一句。 */
  const view = progress?.view?.trim()
    || (bond >= INTIMATE_BOND ? base.viewHigh : base.view)
  return {
    parts,
    lewd: Math.max(0, Math.min(100, Math.round(base.lewd + lewdAdd))),
    virgin: !first,
    firstBy: first ?? null,
    lastAct: progress?.lastAct?.trim() || base.lastAct,
    view,
  }
}

/** 该角色此刻的私密档案（`progress` 一般直接传 `world.intim?.[charId]`） */
export function intimateProfileOf(charId: string, progress?: IntimateProgress): IntimateProfile | null {
  return intimateOf(charId, progress)
}

/**
 * 把一次私密推进**并进**手里那一份（`world.intim[charId]`），返回新的那一份。
 *
 * 这里是「第一回」那条规矩真正落地的地方 —— 所以它必须是纯函数、独自可验：
 *   · 开发度与色情度**累加**（0 起步，只增不减：负数与非法数直接跳过）；
 *   · 状态句后写覆盖；
 *   · **破处对象只认第一次落下的那个**：已经落下过就不再改 —— 问的是第一回，
 *     不是最近一回。之后的情节里再怎么改写这一处，也顶不掉这一栏。
 *   · 最近一回与看法也是后写覆盖 —— 这两项问的是「此刻」，与第一回无关。
 *
 * 合成（底档 + 这一份 → 上屏的那一页）在 `intimateOf`；两者一一对应：
 * 这里怎么记，那边就怎么读。
 */
export function mergeIntim(cur: IntimateProgress | undefined, prog: IntimateProgress): IntimateProgress {
  const from = cur ?? {}
  const dev = { ...from.dev }
  for (const [slot, add] of Object.entries(prog.dev ?? {})) {
    /* 只增不减：负数、零、非数（NaN / Infinity）一律跳过。
       上头的 sanitizer 本来就把它夹成 0–8 了 —— 这里再守一道，是因为
       这一条是「谁都不该带着开发度登场」之外的另半句：登场之后也不该往回缩。 */
    if (typeof add !== 'number' || !Number.isFinite(add) || add <= 0) continue
    const key = slot as IntimateSlot
    dev[key] = (dev[key] ?? 0) + add
  }
  const next: IntimateProgress = { ...from }
  if (Object.keys(dev).length) next.dev = dev
  if (prog.state && Object.keys(prog.state).length) next.state = { ...from.state, ...prog.state }
  if (typeof prog.lewd === 'number' && Number.isFinite(prog.lewd) && prog.lewd > 0) {
    next.lewd = (from.lewd ?? 0) + prog.lewd
  }
  // 破处对象：已经落下过就不再改 —— 问的是第一回
  if (prog.firstBy?.trim() && !from.firstBy) next.firstBy = prog.firstBy.trim()
  // 这两项问的是「此刻」而不是「第一回」，所以照旧后写覆盖
  if (prog.lastAct?.trim()) next.lastAct = prog.lastAct.trim()
  if (prog.view?.trim()) next.view = prog.view.trim()
  return next
}
