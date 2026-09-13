/* ============================================================
   世界书 · canon 种子 —— 把既有 canon 数据编译为开箱即用的世界书
   ------------------------------------------------------------
   纯函数、确定性 id：每次重建产出相同 id 的书与词条，重复播种
   （bulkPut）幂等，绝不覆盖用户自建的世界书（不同 id 互不相干）。
   内容一律取自 src/data 下的原文考据数据，不新增任何设定。
   反剧透靠词条 meta 标注（eventId / codexId）＋ lorescan 的闸门，
   不在本文件里做剧透判断。
   ============================================================ */

import type { Lorebook, LorebookEntry } from './tavernlike/types'
import { CHARACTERS } from '../data/chars'
import { CODEX } from '../data/codex'
import { LORE } from '../data/lore'
import { personaCardLines } from '../data/persona'
import { SIDECAST, type SideCastEntry } from '../data/sidecast'
import { OP_PERIODS } from './operator-arc'
import { TIMELINE } from '../data/timeline'
import type { Character, EndEntry, LoreEntry, TimelineEvent } from '../data/types'

/** 停用词：分句后仍太泛、不宜作关键词的字串 */
const STOP = new Set(['是', '的', '了', '与', '和', '在', '为', '之', '而', '——', '一', '中', '的', '世界', '天空', '欢迎', '来到'])

function now(): number {
  return Date.now()
}

function book(id: string, name: string, description: string, entries: LorebookEntry[]): Lorebook {
  const t = now()
  return {
    id,
    name,
    description,
    entries,
    recursiveScanning: false,
    caseSensitive: false,
    matchWholeWords: false,
    createdAt: t,
    updatedAt: t,
  }
}

function entry(
  id: string,
  keys: string[],
  content: string,
  order: number,
  comment?: string,
  meta?: Record<string, unknown>,
  /** 常驻：不看关键词，命中即注入（文风一类「每一段都该带着」的词条走这条） */
  constant = false,
): LorebookEntry {
  const uniq: string[] = []
  for (const k of keys) {
    const s = (k ?? '').trim()
    if (s && !uniq.includes(s)) uniq.push(s)
  }
  return {
    id,
    keys: uniq,
    secondaryKeys: [],
    content,
    comment,
    order,
    position: 'after_char',
    selective: false,
    selectiveLogic: 'and_any',
    constant,
    probability: 100,
    useProbability: false,
    addMemo: false,
    meta,
  }
}

/** 把标题/地点/实体等长串切成「有信息量的关键词」 */
function splitKeywords(...parts: Array<string | undefined>): string[] {
  const out: string[] = []
  for (const raw of parts) {
    if (!raw) continue
    const segs = raw
      .replace(/[()（）]/g, ' ')
      .split(/[，。、；：！？·・／/\s]/)
    for (const s of segs) {
      const t = s.trim()
      if (t.length < 2) continue
      if (STOP.has(t)) continue
      if (/^\d+$/.test(t)) continue
      out.push(t)
    }
  }
  return out
}

/* ---------- 世界书：角色档案 ---------- */

function charEntry(c: Character): LorebookEntry {
  // 有人物卡（分层卡）则以卡代 bio／台词；无卡回退既有 flat 档案
  const persona = personaCardLines(c.id)
  const content = [
    `${c.name}（${c.callsign} · ${c.role} · ${c.epithet}）`,
    `所属：${c.division}`,
    c.scar ? `终末：${c.scar}` : '',
    c.potential && c.potential !== '—' ? `终末潜力：${c.potential}` : '',
    ...(persona ?? [c.bio]),
    ...(!persona && c.quote ? [`标志性台词：「${c.quote}」`] : []),
  ].filter(Boolean).join('\n')
  return entry(
    `ch-${c.id}`,
    [c.name, c.callsign, c.role, c.epithet].filter(Boolean),
    content,
    10,
    c.name,
  )
}

function buildCharBook(): Lorebook {
  // 主役（ch-<id>）+ 登场者（sc-<id>）同册：全员合一，登场者默认随本库激活。
  return book(
    'book-canon-char',
    '角色档案',
    '档案全员（主役 + 登场者）：按原文档案/人物卡生成，命中人名/称号/别名即注入其设定参考。',
    [...CHARACTERS.map(charEntry), ...SIDECAST.map(sidecastEntry)],
  )
}

/* ---------- 世界书：实体图鉴（登记过的才会放行，见 lorescan） ---------- */

function codexEntry(e: EndEntry): LorebookEntry {
  const content = [
    `No.${e.no || '？？？'}「${e.name}」· Stage ${e.stage >= 0 ? e.stage : '未解明'} ${e.stageKw}`,
    e.origin ? `来历：${e.origin}` : '',
    e.detail ? `详细：${e.detail}` : '',
    e.counter ? `应对要点：${e.counter}` : '',
  ].filter(Boolean).join('\n')
  return entry(
    `cx-${e.id}`,
    [e.name, e.alias, ...(e.no && e.no !== '？？？' ? [`NO.${e.no}`, e.no] : [])].filter(Boolean),
    content,
    20,
    `No.${e.no} ${e.name}`,
    { codexId: e.id },
  )
}

function buildCodexBook(): Lorebook {
  return book('book-canon-codex', '实体图鉴', '已登记进终末图鉴的实体（仅遭遇登记过的会被放行，避免剧透）。', CODEX.map(codexEntry))
}

/* ---------- 世界书：世界 · 势力 · 概念 ---------- */

function loreEntry(e: LoreEntry): LorebookEntry {
  const content = [`${e.title}（${e.cat} · ${e.sub || ''}）`.trim(), e.body, e.ref ? `出处：${e.ref}` : ''].join('\n')
  return entry(
    `lw-${e.id}`,
    [e.title, e.sub, ...(e.tags ?? [])].filter(Boolean),
    content,
    30,
    e.title,
  )
}

function buildLoreBook(): Lorebook {
  return book('book-canon-lore', '世界 · 势力 · 概念', '智库条目：世界观/势力/概念的背景参考。', LORE.map(loreEntry))
}

/* ---------- 世界书：事件回顾（已完成/当前事件才会放行，见 lorescan） ---------- */

function evTitleKeys(title: string): string[] {
  // 取标题里较有辨识度的段（去掉卷副题与泛用词），最多 5 段
  return splitKeywords(title).slice(0, 5)
}

function evEntry(e: TimelineEvent, reading: number): LorebookEntry {
  const keys = [
    ...evTitleKeys(e.title),
    ...splitKeywords(e.place),
    ...e.entities.filter((x) => x !== '——'),
  ]
  // 事件回顾 = 解读式摘要（大纲概述），不再往世界书里拼逐字【原文摘录】——
  // 智库词条属「收束记录落解读口径」，原文细节走导演提示词的 EVENT_NOTES 通道，不进词条。
  const digestable = e.summary.trim()
  return entry(
    `ev-${e.id}`,
    keys,
    digestable,
    reading,
    `${e.group} · ${e.title}`,
    { eventId: e.id },
  )
}

function buildEventBook(): Lorebook {
  return book(
    'book-canon-events',
    '事件回顾',
    '各事件的第三人称回顾（按阅读序）：仅当该事件已完成或是当前焦点事件时放行，绝不剧透未推进的事件。',
    TIMELINE.map((e, i) => evEntry(e, i)),
  )
}

/* ---------- 登场者条目（并入「角色档案」同一册；无 meta → 门控恒放行） ---------- */

function sidecastEntry(s: SideCastEntry): LorebookEntry {
  // 有人物卡（分层卡）则以卡代 desc／quote；无卡回退既有 flat 档案
  const persona = personaCardLines(s.id)
  const content = [
    `${s.name}（${s.alias} · ${s.role}）`,
    ...(persona ?? [s.desc, s.quote ? `台词：「${s.quote}」` : '']),
    `登场：${s.volLabel} · ${s.page}`,
  ].filter(Boolean).join('\n')
  return entry(
    `sc-${s.id}`,
    [s.name, s.alias].filter(Boolean),
    content,
    40,
    s.name,
  )
}

/** 全部 canon 种子世界书（4 本；「登场者登记」已并入「角色档案」） */
/* ---------- 世界书：任务作战（回合制子系统的设定与主角位置） ---------- */

function buildOpsBook(): Lorebook {
  const e1 = entry(
    'ops-engage',
    ['任务', '任务简报', '作战', '出击', '交战', '讨伐', '反现实实体'],
    '任务简报板上的每一条，都是一次可派出的作战。委员会以小队为单位处置反现实实体：'
      + '按敏捷度排定出手序，以常规接触、武装解放与「到达点」逐次削减敌方的反现实反应，归零即为达成。'
      + '弹痕、斩击一类武装对反现实实体是本职，打普通目标反而不占优；'
      + '反过来，体术再强的人，若其武装尚未解封，也打不出应有的分量。',
    10,
    '作战准则',
    { ops: true },
  )
  const e2 = entry(
    'ops-stamina',
    ['体力', '观测间隔', '出击', '撤出', '驻扎', '过载'],
    '有两本体力账，别混。小队体力是终端上那一池：只在出击时扣一次固定份额，'
      + '不会因休整而立刻回满——只有操作员继续推进观测、收束新的剧情段，它才随观测间隔缓慢回补；'
      + '它偏低时仍可强行出击，代价是全场出力打折。'
      + '而战斗里每一次出手消耗的不是那一池，是各人自己的体力：意志力越厚，本人这一场能出的手越多，'
      + '普攻、技能、到达点各按自己的份额扣。本人的体力见底时便只剩防御可出——'
      + '防御会回一口气，但不多，回不回得来要看意志力。',
    20,
    '体力与观测间隔',
    { ops: true },
  )
  const e3 = entry(
    'ops-operator',
    ['操作员', '指挥', '言万心叶', '低语者', '观测员', '下令'],
    '言万心叶是这台终端的操作员，也是登记在册的 Stage4『活性化』、低语者（Susurrador）的持有者。'
      + '他兼指挥与观测——决定由谁出击、以何等手数应敌、目标指向何处，并在每一次收束之后撰写作战记录；'
      + '但他本人同样是战斗人员：五轴、武装与技能随观测进度换页，编队时可以直接把他放进小队下场出手。'
      + '（注：低语者之名在体验入学、登记成立之后才对外示出。）',
    30,
    '操作员的作战位置',
    { ops: true },
  )
  return book(
    'book-canon-ops',
    '任务作战',
    '回合制作战子系统的设定：交战准则、体力与观测间隔、操作员在作战中的位置。',
    [e1, e2, e3],
  )
}

/* ---------- 世界书：主角专档（言万心叶本人 —— 与角色档案同一副面孔，逐段放行） ---------- */

function buildOperatorBook(): Lorebook {
  // 行文与 charEntry 同一口径：姓名（别称 · 身份）／所属／终末／终末潜力／本人自述。
  // 他不是另一个物种的条目 —— 只是把「所属」写成本终端、把面板写成随时期换页。
  const head = entry(
    'op-self',
    ['言万心叶', '心叶', '操作员', '观测员', '主角', '低语者', 'Susurrador', '读心者'],
    [
      '言万心叶（心叶 · 操作员 · 观测终端）',
      '所属：终末停滞委员会 · 观测终端（本终端的使用者；本人也是战斗人员）',
      '终末：低语者（Susurrador）· Stage4「活性化」',
      '终末潜力：Stage4「活性化」',
      '落海的留学生出身：墨西哥黑手党「卡特尔」曾把他当作读心工具役使三年，'
        + '那段过去是他日后被登记为「低语者」的由来。'
        + '他不会游泳，却在落海时先救了别人；他想做的始终是一个普通的、善良的人。',
      '与露娜相遇、被艾莉芙担保入学苍之学园之后，他的终末潜力经测定并登记在册。',
      '他出手之前，对方心里那句「往左躲」已经先到了 —— 攻击必中，闪避率提升 40%。'
        + '他的面板不固定：随观测推进的每一段时期，武装、五轴与技能都换一页 —— 详见分期词条。',
    ].join('\n'),
    5,
    '言万心叶',
    { ops: true },
  )
  const pages = OP_PERIODS.map((p, i) => entry(
    `op-p-${p.at}`,
    ['言万心叶', '心叶', p.title, p.arm, p.cls].filter((k) => k && k !== '无'),
    [
      `${p.title}（${p.cls}）`,
      '所属：终末停滞委员会 · 观测终端',
      `所处时期：${p.vol}`,
      `处境：${p.note}`,
      `武装：${p.arm}${p.armSub && p.armSub !== '—' ? `（${p.armSub}）` : ''} —— ${p.armNote}`,
      p.passive ? `被动 · ${p.passive.name}：${p.passive.desc}` : '',
      `此刻所能做的事：${p.abilities.map((a) => `${a.name}（${a.kind}）`).join('、')}`,
    ].filter(Boolean).join('\n'),
    6 + i,
    `言万心叶 · ${p.title}`,
    { ops: true, eventId: p.at },
  ))
  return book(
    'book-canon-operator',
    '主角专档 · 言万心叶',
    '言万心叶本人的档案：总档 + 按观测进度分页的时期面板（定位／武装／技能）。'
      + '未观测到的时期词条不放行，绝不剧透后文。',
    [head, ...pages],
  )
}

/* ---------- 世界书：文风（原作腔调 —— 四条常驻，改的是「怎么写」，不涉设定） ---------- */

/**
 * 文风条目一律常驻：它们不靠关键词命中，而是每一段正文都该带着的那支笔。
 * 内容只谈笔法（怎么下笔、怎么收），不新增任何设定，也不改写任何角色的语气。
 *
 * 第四条（`sty-intim`）与头三条不同的地方只在一处：**它管的是一个场面档位**。
 * 所以它是几条笔法里唯一带条件的 —— 那一档没到，它一个字都不生效。写它不是为了
 * 多写这一档（那由剧情与她的反应说了算），是因为前面三条全在往短里收，收到这一档
 * 就成了「一句『两人沉溺其中』带过」：该细的地方细，规矩才不会把场面写丢。
 */
function buildStyleBook(): Lorebook {
  const voices = [
    entry(
      'sty-voice',
      ['文风', '写法', '叙述口吻'],
      [
        '底色是「公文式的冷 × 少年人的日常」。终末、观测、沉降、收束——这些足以让世界停摆的事，'
          + '在这部作品里一律按事务处理：像填表、像排班、像有人把一张写满编号的纸推到你面前。',
        '越是天塌下来的场面，叙述越不激动：不呐喊、不替读者感慨、不写「仿佛世界都在颤抖」这类抬价句。'
          + '委员会在讨论一处 Stage4 的沉降，隔壁还在为便当里少了一颗梅子吵架 —— 反差是这支笔的要害，'
          + '写日常不刻意往轻松里调，写灾难不加形容词渲染，两边用同一副嗓子说话。',
        '偶一为之的冷幽默：原作里出现过给一个词下定义、末尾缀上「——摘自WIKI百科」这种旁插。'
          + '整卷点一次就够，别当成常规手法。',
      ].join('\n'),
      1, '文风 · 底色', undefined, true,
    ),
    entry(
      'sty-syntax',
      ['文风', '写法', '句法'],
      [
        '段落极短：原作一段平均二十五到三十来个字，一个动作、一句观察就另起一段；句子也短，'
          + '十二字以内的短句约占三成，四十字以上的长句只占一成上下。对白密集——含「」的段落'
          + '占一半左右，叙述与对白交替推进。留白比说明重要：该说三分就说三分，剩下的交给对方的'
          + '表情、手里那件东西、窗外的声音去补。',
        '标点有它自己的习惯：省略号用得密（约每一百字一处），表示停顿、迟疑、话没说完；'
          + '破折号约每两百字一处，用来打断、插一句补充说明，但不拿来收尾表余韵。'
          + '人物的心里话直接用全角括号夹在叙述里 ——（这是什么……真是疯了……）。'
          + '情绪上来时用拖长的拟声与叠字（啊啊啊啊／唔……／哼），不靠「非常」「无比」这类加码词。',
        '少用形容词与副词；比喻一段至多一处，而且取身边之物（器材、便当、绷带、雨），'
          + '不取宏大意象。推进靠动作与对白，不靠旁白解释。心里那句话可以直接写出来，'
          + '但不要替角色总结自己的心情（「他忽然明白，原来这就是孤独」——这种句子不要写）。',
      ].join('\n'),
      2, '文风 · 句法', undefined, true,
    ),
    entry(
      'sty-register',
      ['文风', '写法', '术语口径'],
      [
        '术语照档案口径用：终末、Stage、终末潜力、沉降、观测、收束、压制。'
          + '角色说起这些词时，语气跟报一个班次、念一条规章没有区别——不惊呼、不科普、不互相解释'
          + '（在场的人本来就懂，读者从情境里读得出来）。推理与说明处，原作爱用「也就是说」「然而」'
          + '「即便如此」「原来如此」这类连接词，照用即可。',
        '战斗与伤情只写发生了什么的实感：衣服破了、他退了半步、耳朵里嗡的一声。'
          + '不出现血量、伤害、回合、数值、技能冷却这类界面口径，也不要让角色议论自己或别人「有多强」。',
        '称呼一律「名字＋身份后缀」：露娜小姐、言万同学、恋兔学姐、西蒙会长、泰尔学长。'
          + '不要为了亲昵擅自改口，也不要让角色用他没有理由知道的名字；改口要有剧情上的理由'
          + '（如立契之后才换称呼）。',
      ].join('\n'),
      3, '文风 · 术语与称呼', undefined, true,
    ),
    entry(
      'sty-intim',
      ['文风', '写法', '私密场面'],
      [
        '私密场面：这一回合真的走到了那一档时，头几条照旧成立 —— 段落照样短、留白照样在、'
          + '不写套话；但**不许含糊带过**。所谓写足，是细节往前走，不是句子变长，'
          + '也不是同一个动作换三种说法（见反八股那几条）。',
        '一来一往按顺序落笔 —— 怎么起、谁先动、怎么换、怎么收，不跳步，也不用「两人沉溺其中」'
          + '一句把整段带过，更不用省略号跳过该写的地方。身体写那一处此刻是什么样、被碰到时怎么应，'
          + '不换成谁都适用的通用句；声音与话照她本人的口癖写（会骂、会求、会别开脸还是不肯出声，'
          + '各人各样，不许写成同一个她）；触感、温度、气味、体液照实写 —— '
          + '这一档的实感全在这些东西上，这一档不必回避任何词。',
        '镜头要推近：小穴、乳头、阴蒂、后穴这些私密部位，当下是什么样就写什么样 —— 颜色、软硬、'
          + '开合、湿到哪一档、有没有红肿、留下了什么痕迹、被碰到的一瞬间怎么缩。'
          + '不许拿「那里」「下面」一句糊过去，也不许每一处都写成同一个样子：'
          + '状态随这一场往前走，每次被弄到都跟上一次不一样。'
          + '推近是夹在动作与感受中间落笔，不是另起一段做解剖。',
        '分寸不归这一条管：这一档可以把篇幅用满，但走到哪一步由气氛与对方的行动决定，'
          + '不越过她此刻肯给的那条线；**还没走到这一档的场面，这一条不生效** —— '
          + '它不是要谁去开这一场。这是笔法，不是设定：正文里不要点明它，也不让角色议论它。',
      ].join('\n'),
      4, '文风 · 私密场面', undefined, true,
    ),
  ]
  return book(
    'book-canon-style',
    '文风 · 终末停滞委员会',
    '原作腔调：底色、句法、术语口径、私密场面。四条常驻词条，改的是「怎么写」，不含任何设定，也不改角色语气。'
      + '嫌笔调太重时，把其中任意一条关掉即可。',
    voices,
  )
}

export function buildCanonLorebooks(): Lorebook[] {
  return [
    buildCharBook(), buildCodexBook(), buildLoreBook(), buildEventBook(),
    buildOpsBook(), buildOperatorBook(), buildStyleBook(),
  ]
}

/** 默认激活的 canon 库 id（全 7 本默认激活） */
export const CANON_BOOK_ACTIVE_IDS = [
  'book-canon-char',
  'book-canon-codex',
  'book-canon-lore',
  'book-canon-events',
  'book-canon-ops',
  'book-canon-operator',
  'book-canon-style',
]

/** 旧版种子里的废弃库 id（迁移时删除：v1 的独立「登场者登记」） */
export const OBSOLETE_CANON_IDS = ['book-canon-sidecast']

/**
 * 种子内容版本：
 *   v4 → v5 = 新增「主角专档 · 言万心叶」canon 库（总档 + 时期分页），并改正操作员条目口径（他也是战斗人员）
 *   v5 → v6 = 主角档案收成三段（低语者 / 化身之枪 / 灵魂共奏），并把 canon 库的激活集整份并回（全开）
 *   v6 → v7 = 新增「文风 · 终末停滞委员会」canon 库（三条常驻词条），并把主角专档改成与角色档案同一副面孔
 *   v7 → v8 = 文风三条按原作实测口径重写（第 1 / 第 6 卷对读：段长、句长、对白占比、标点习惯、称呼式样）
 *   v8 → v9 = 伊西斯层卡补回状态卡专名行【号外号外】［斩击］（「铭刻记忆」是效果说明槽位，不是斩击名）
 *   v9 → v10 = R 值口径改正：偏离正常区间**两侧同判**（偏低现实偏薄 / 偏高现实过厚），
 *              并写明「偏离越远危险度越高」。旧种子里写的是「低于 0.95 即为异常」的一侧口径。
 *   v10 → v11 = R 值区间改按原文判据 0.98 ~ 1.02（原为自拟的 0.95 ~ 1.05），
 *              并补上纳克萨指数（R 值的变动程度）与「深穴 0.967」这类实测读数。
 *   v11 → v12 = 文风库加第四条常驻（私密场面怎么写细）—— 前面三条都在往短里收，
 *              收到这一档会变成一句「两人沉溺其中」带过；这一条只说「写足」，
 *              且没走到那一档的场面它一个字都不生效。
 *   v12 → v13 = 那第四条里加「镜头要推近」（私密部位当下是什么样就写什么样，且每次都不一样）——
 *              只有「写足」没有「推近」，落到模型手里还是「那里湿得一塌糊涂」一句带过。
 */
export const CANON_SEED_VERSION = 13

/** 种子内容签名：库 id + 词条数（用于决定是否重播） */
export const CANON_SEED_KEY = 'zts-lore-seed-v1'
