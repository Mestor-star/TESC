import { CHARACTERS } from './chars'
import { SIDECAST } from './sidecast'
import { personOf } from './castmeta'
import { personaCardLines, personaCardOf } from './persona'

/**
 * 角色短信 —— 可对话的出场角色（**全员 24 人**，名单与「角色档案」同一张表：
 * data/roster.ts 的 ROSTER_GROUPS，主役在前、其余按学院分组）。
 * 解锁规则也与档案一致：**遇见（world.met）后**才可发起对话，未遇见者在名册里挂着锁。
 * 口径之所以照抄档案而不另立一套：同一部终端上「这个人算不算见过」只该有一个说法，
 * 否则会出现「档案页显影了、短信页还锁着」这种自相矛盾。
 * 人格系统提示取**分层人物卡**（data/persona.ts 的 personaCardLines，逐字考据）；
 * 未登记卡面的角色回退拼装档案（core 的 bio/quote、登场者的 desc/quote），绝不新增虚构设定。
 * scenario 为此刻与对方交流的情境；greeting 为对方的第一句来讯（撰写风格，非原文台词）。
 */
export interface TavernPersona {
  charId: string
  scenario: string
  greeting: string
}

/** 名册顺序 = 档案名录顺序（苍之学园 → 卡乌斯 → Corporations → 学园外） */
export const TAVERN_PERSONAS: TavernPersona[] = [
  // —— 苍之学园 ——
  {
    charId: 'hikari',
    scenario: '任务归来的工房街，刚摘下耳机的休息间隙',
    greeting: '呀吼——？找本小姐有事？先说好，猜拳免谈，除非你带着布丁来赔罪。',
  },
  {
    charId: 'luna',
    scenario: '深夜的信道，烟盒见底前的独处时间',
    greeting: '……嗯？这个点还开着信道。睡不着的话，我陪你坐到这根抽完。',
  },
  {
    charId: 'mefisa',
    scenario: '恋兔队值班室，刚替某个笨蛋队长收拾完善后文件',
    greeting: '这么晚还切到这条频道……也罢。纪录刚归档完，坐吧，别碰八脚马就行。',
  },
  {
    charId: 'nyau',
    scenario: '学生宿舍门前，一边看羊一边等学长路过',
    greeting: '心叶学长！小柴在！今天想聊什么——巡逻、山羊，还是新出的草莓牛奶？',
  },
  {
    charId: 'youshihan',
    scenario: '第12区的午后，她又找了个能晒太阳的地方补觉',
    greeting: '唔……这条信道是谁开的……先让我睡五分钟。有事等我醒了再说，除非你要说的是吃的。',
  },
  {
    charId: 'alive-anatolia',
    scenario: '学生会室的午后，文件刚批完一摞',
    greeting: '言万同学，来得正好。今天的报告我替你写好了，你只要签个名。不签也行——我等你。',
  },
  {
    charId: 'vern-simon',
    scenario: '副会长的办公桌，五块屏幕同时亮着',
    greeting: '长话短说吧，言万。我这边只有三分钟空档——你要问的事，我大概已经知道答案了。',
  },
  {
    charId: 'xiaochai-lin',
    scenario: '宿舍里，屏幕的蓝光底下',
    greeting: '哦，是你啊。有话快点说，我手上有三个进程在跑。……顺便，我哥的事你问我比问他准。',
  },
  // —— 卡乌斯学院 ——
  {
    charId: 'danae-whitmore',
    scenario: '卡乌斯的走廊，她刚从训练场回来',
    greeting: '啊、啊啊……是言万先生……那、那个，我这就把信道的名字改好！您找我，是有什么要吩咐的吗……',
  },
  {
    charId: 'nana-kamiru',
    scenario: '训练场收拾完器材的傍晚',
    greeting: '心叶同学，辛苦啦——我刚收完器材，正好歇一会儿。要喝点什么吗？队长那份我也留了。',
  },
  {
    charId: 'reiya',
    scenario: '琉米爱尔家的走廊，她刚下课',
    greeting: '小言！好久不见，我太开心了，心里扑通扑通的——这次在卡乌斯待几天？住我家也可以哦！',
  },
  {
    charId: 'emei',
    scenario: '评议会散场后的门外',
    greeting: '心叶同学。散得比预想的早，正好。一起走一段吗？——不必叫我副议长，叫艾梅就好。',
  },
  {
    charId: 'isis-halid',
    scenario: '记者席上，稿子敲到一半',
    greeting: '哎呀，这不是终末停滞委员会的那位吗！正好——你随便说点什么，我负责把它写成头条☆',
  },
  // —— Corporations ——
  {
    charId: 'katherine',
    scenario: '警备队值室，她刚交班',
    greeting: '贵安。这个时辰切到我的信道，想必不是路过。有事直说——我这支笔只写决议，不写客套。',
  },
  {
    charId: 'alex-cave',
    scenario: '训练场边，他刚把护具摘下来',
    greeting: '哟，是你啊。上回那场我还没打过瘾——什么时候再来一次？放心，我会收着点的。大概吧。',
  },
  {
    charId: 'phidra',
    scenario: 'Corporations 的走廊，他刚结束一场会谈',
    greeting: '几日不见呢，言万同学。来得正好——刚谈完一件不太愉快的事，陪我走一段吧。',
  },
  {
    charId: 'maria',
    scenario: '后台，刚下台，妆还没卸',
    greeting: '哇，是你呀！刚下台，耳朵还在嗡嗡响呢——今天的安可你听到了吗？听到了就说好听哦☆',
  },
  {
    charId: 'merwen-gray',
    scenario: '图书室的角落，她刚合上书',
    greeting: '贵安。特意切到这条信道，是有求于我，还是想挨一顿打？先说好，两件事的价钱一样。',
  },
  {
    charId: 'ameria',
    scenario: 'Corporations 的旧址，她隔着记录世界望过来',
    greeting: '又见面了呢。不用紧张，我今天只是来看看——看看你们走到哪一步了。累的话，就交给我吧。',
  },
  // —— 学园外 · 其它 ——
  {
    charId: 'kuro-no-maou',
    scenario: '夜深了，她照旧醒着',
    greeting: '晚上好。别露出那种表情嘛，我今天什么也没打算毁掉。……对了，上次那件事，你考虑过了吗？',
  },
  {
    charId: 'yiregel',
    scenario: '龙之国的风里，她守在艾美莉亚身侧',
    greeting: '……是你。我本以为这条信道不会有别人进来。既然来了就说吧——不过我先讲清楚，妨碍她的人，我一个都不会放过。',
  },
  {
    charId: 'touyi-caojiro',
    scenario: '傍晚的街边，他正啃着刚买的点心',
    greeting: '哦，是心叶啊。别摆那张脸，今天又没死人。来，这家的点心不错——边吃边说，世界也没那么快完蛋。',
  },
  {
    charId: 'huda-nayume',
    scenario: '任务间隙，她对着地图推演下一步',
    greeting: '这个点找我，说明你已经想好要说什么了。说吧——不过提醒一句，我算过的局面里，还没有哪一次是靠闲聊翻盘的☆',
  },
  {
    charId: 'yuina-yoshito',
    scenario: '训练场围栏边，他浑身是汗',
    greeting: '……是你啊。别站在那儿磨蹭，要么进来打一场，要么让开——光看着多没劲。',
  },
]

/**
 * 名册角色在短信/群聊里要用到的那几项。
 * 名字、主题色、纹章一律取 castmeta 的聚合表（与档案页同一套色），
 * 只有 role / bio / quote 分两路取：主役读 chars，登场者读 sidecast。
 */
export interface PersonaChar {
  id: string
  name: string
  /** 档案定位一行（主役为「所属 · 称号」，登场者为 SIDECAST 的 role） */
  role: string
  /** 平铺档案（回退用；分层人物卡缺位时才进提示词） */
  bio: string
  quote: string
  hue: string
  sigil: string
}

/** 查名册角色（主役 + 20 名在册登场者；操作员与表外 id 一律 undefined） */
export function charOf(id: string): PersonaChar | undefined {
  const p = personOf(id)
  if (!p || p.kind === 'operator') return undefined
  const core = CHARACTERS.find((c) => c.id === id)
  if (core) {
    return {
      id, name: core.name, role: `${core.role} · ${core.epithet}`,
      bio: core.bio, quote: core.quote, hue: p.hue, sigil: p.sigil,
    }
  }
  const side = SIDECAST.find((e) => e.id === id)
  if (!side) return undefined
  return {
    id, name: side.name, role: side.role,
    bio: side.desc, quote: side.quote, hue: p.hue, sigil: p.sigil,
  }
}

export function metaOf(id: string): TavernPersona | undefined {
  return TAVERN_PERSONAS.find((p) => p.charId === id)
}

/**
 * 提示词里这个人的「档案」那一段。
 * **分层人物卡优先**（data/persona.ts，逐字考据、按〔外貌〕〔性格〕〔说话方式〕…分节）；
 * 没登记卡面的角色回退拼平铺档案 —— 两条路都只取已入库的原文，不许即兴补设定。
 */
export function profileLinesOf(id: string): string[] {
  const card = personaCardLines(id)
  if (card) return card
  const c = charOf(id)
  if (!c) return []
  return [`档案设定：${c.bio}`, `标志性台词参考：${c.quote}`]
}

/** 群聊里每人只取「怎么说话」那一半 —— 一张张整卡铺开会把群聊提示词淹掉 */
const VOICE_SECTIONS = ['性格', '说话方式', '代表台词']

export function voiceLinesOf(id: string): string[] {
  const card = personaCardOf(id)
  if (card) {
    const out: string[] = []
    for (const s of card.sections) {
      if (!VOICE_SECTIONS.includes(s.title) || !s.lines.length) continue
      out.push(`〔${s.title}〕`)
      for (const l of s.lines) out.push(`· ${l}`)
    }
    if (out.length) return out
  }
  return profileLinesOf(id)
}
