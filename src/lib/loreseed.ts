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
import { SIDECAST, type SideCastEntry } from '../data/sidecast'
import { ARMS } from '../data/arms'
import { personaCardOf } from '../data/persona'
import { DOSSIER } from '../data/dossiers'
import { COMMITTEE_RANK, SIDE_POTENTIAL, SIDE_TRAIT } from '../data/roster'
import { ROSTER } from './battle/roster'
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

/* ---------- 词条骨架 ---------- */

/** 「字段：值」逐行排列 —— 设定条目按档案表写，不写成散文。 */
function spec(rows: Array<[string, string | undefined | false]>): string {
  const out: string[] = []
  for (const [k, v] of rows) {
    const val = (v ?? '').toString().trim()
    if (val && val !== '—') out.push(`${k}：${val}`)
  }
  return out.join('\n')
}

/** 使用边界：每条末尾同一句 —— 参考归参考，不据此推断后文，也不写进正文。 */
const BOUNDARY = '边界：只作设定参考；不据此推断未观测到的后文，也不改写正文里已经发生的事。'

/**
 * 条目一律第三人称：档案原文里的「你」指操作员本人，折算成「言万心叶」。
 * 引号里的台词原样保留 —— 台词里的「我」是角色在说话，不是叙述视角。
 */
function thirdPerson(text: string): string {
  return (text ?? '')
    .split(/(「[^」]*」)/)
    .map((seg) => (seg.startsWith('「') ? seg : seg.replace(/[你妳]/g, '言万心叶')))
    .join('')
}

/* ---------- 世界书：角色档案 ---------- */

/** 人物卡的一节原文摘录：只取前几行，把「你」折算成操作员（第三人称）。 */
function personaText(id: string, title: string, max: number): string {
  const sec = personaCardOf(id)?.sections.find((s) => s.title === title)
  if (!sec || !sec.lines.length) return ''
  return sec.lines.slice(0, max).map(thirdPerson).join('')
}

/** 登场者的出处：page 里已经带了卷次（「第2卷 · 卷首彩页」）就不再重复卷号。 */
function seenOf(s: SideCastEntry): string {
  return s.page.includes('卷') ? s.page : `${s.volLabel} · ${s.page}`
}

/** 挂在某角色名下的武装条目（图鉴里的弹痕／斩击／片羽／特殊武器）。 */
function armsOf(id: string) {
  return ARMS.filter((a) => a.holderId === id)
}

interface CastDossier {
  id: string
  name: string
  /** 首行字段名：角色 / 登场者 */
  nameLabel: string
  alias?: string
  /** 第二行字段名：代号 / 别称 */
  aliasLabel: string
  role?: string
  epithet?: string
  division?: string
  scar?: string
  potential?: string
  quote?: string
  bio?: string
  firstSeen?: string
}

/**
 * 角色与登场者共用的一副档案表：设定（身份、武装、能力、打法、战技）在前，
 * 性格与关系是**整理过的档案写法**（data/dossiers.ts），不整段搬原文。
 * 原文只留两处：说话方式的短引文、代表台词；外貌与雷区各取一行。
 */
function castContent(o: CastDossier): string {
  const dos = DOSSIER[o.id]
  const role = ROSTER[o.id]
  const arms = armsOf(o.id)
  const main = arms[0]
  const trait = SIDE_TRAIT[o.id]
  const armor = arms.length
    ? arms.map((a) => `${a.kind}「${a.name}」`).join('、')
    : trait
  const power = main ? main.power : (role?.trait ?? '')
  const rows: Array<[string, string | undefined | false]> = [
    [o.nameLabel, o.name],
    [o.aliasLabel, o.alias],
    ['身份', [o.role, o.epithet].filter(Boolean).join(' · ')],
    ['所属', o.division],
    ['委员会排名', COMMITTEE_RANK[o.id]],
    ['首次登场', o.firstSeen],
    ['终末 · 武装', o.scar ?? trait],
    ['终末潜力', o.potential ?? SIDE_POTENTIAL[o.id]],
    ['性格', dos?.persona],
    ['说话方式（原文）', personaText(o.id, '说话方式', 2) || personaText(o.id, '代表台词', 1)],
    ['关系', dos?.relations.join('；')],
    ['武装', armor],
    ['本相', main?.phrase],
    ['能力', power],
    ['到达点', main?.awakened],
    ['战斗方式', role ? [role.cls, role.duty].filter(Boolean).join(' · ') : ''],
    ['打法', role?.sub],
    ['机制', main ? role?.trait : ''],
    ['战技', role?.skills.map((s) => s.name).join('、')],
    ['外貌（原文）', personaText(o.id, '外貌', 1)],
    ['禁忌 · 雷区（原文）', personaText(o.id, '禁忌 · 雷区', 1)],
    ['代表台词（逐字）', o.quote ? `「${o.quote}」` : personaText(o.id, '代表台词', 1)],
    ['档案', o.bio ? thirdPerson(o.bio) : ''],
  ]
  return [spec(rows), BOUNDARY].filter(Boolean).join('\n')
}

function charEntry(c: Character): LorebookEntry {
  const content = castContent({
    id: c.id, name: c.name, nameLabel: '角色', alias: c.callsign, aliasLabel: '代号',
    role: c.role, epithet: c.epithet, division: c.division,
    scar: c.scar, potential: c.potential, quote: c.quote, bio: c.bio,
  })
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
    '角色档案：身份、所属、委员会排名、终末与武装、能力与到达点、战斗方式与战技；'
      + '性格与关系按档案写法整理，原文只保留说话方式的短引文与代表台词；主役与登场者同册。'
      + '命中人名／称号即注入。条目只写已确认的设定，不含未观测后文。',
    [...CHARACTERS.map(charEntry), ...SIDECAST.map(sidecastEntry)],
  )
}

/* ---------- 世界书：实体图鉴（登记过的才会放行，见 lorescan） ---------- */

function codexEntry(e: EndEntry): LorebookEntry {
  const content = [
    spec([
      ['条目', `No.${e.no || '？？？'}「${e.name}」`],
      ['阶段', `Stage ${e.stage >= 0 ? e.stage : '未解明'} · ${e.stageKw}`],
      ['别名', e.alias],
      ['来历', e.origin],
      ['记录', e.detail],
      ['应对', e.counter],
    ]),
    BOUNDARY,
  ].join('\n')
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
  return book(
    'book-canon-codex',
    '实体图鉴',
    '实体图鉴：编号、阶段、来历、记录与应对。只放行已登记的实体 —— 未遭遇过的不会出现在提示词里。',
    CODEX.map(codexEntry),
  )
}

/* ---------- 世界书：世界 · 势力 · 概念 ---------- */

function loreEntry(e: LoreEntry): LorebookEntry {
  const content = [
    spec([
      ['条目', e.title],
      ['分类', [e.cat, e.sub].filter(Boolean).join(' · ')],
      ['概述', e.body],
      ['出处', e.ref],
    ]),
    BOUNDARY,
  ].join('\n')
  return entry(
    `lw-${e.id}`,
    [e.title, e.sub, ...(e.tags ?? [])].filter(Boolean),
    content,
    30,
    e.title,
  )
}

function buildLoreBook(): Lorebook {
  return book(
    'book-canon-lore',
    '世界 · 势力 · 概念',
    '世界观、势力与概念：条目、分类、概述与出处。只作名词口径与背景参考，不据此推断后文。',
    LORE.map(loreEntry),
  )
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
  const content = [
    spec([
      ['事件', `${e.group} · ${e.title}`],
      ['地点', e.place],
      ['在场', e.entities.filter((x) => x !== '——').join('、')],
      ['经过', e.summary.trim()],
    ]),
    '边界：只记已经过去的这一段；日后走向不据此推断，也不改写正文里已经发生的事。',
  ].join('\n')
  return entry(
    `ev-${e.id}`,
    keys,
    content,
    reading,
    `${e.group} · ${e.title}`,
    { eventId: e.id },
  )
}

function buildEventBook(): Lorebook {
  return book(
    'book-canon-events',
    '事件回顾',
    '事件回顾：事件、地点、在场与经过，按阅读序排列。'
      + '只放行已完成或当前焦点的事件；未推进的事件不出现。',
    TIMELINE.map((e, i) => evEntry(e, i)),
  )
}

/* ---------- 登场者条目（并入「角色档案」同一册；无 meta → 门控恒放行） ---------- */

function sidecastEntry(s: SideCastEntry): LorebookEntry {
  // 与角色档案同一副表格：设定在前；性格与关系取整理稿，原文只留短引文与台词。
  const content = castContent({
    id: s.id, name: s.name, nameLabel: '登场者', alias: s.alias, aliasLabel: '别称',
    role: s.role, firstSeen: seenOf(s),
    quote: s.quote, bio: s.desc,
  })
  return entry(
    `sc-${s.id}`,
    [s.name, s.alias].filter(Boolean),
    content,
    40,
    s.name,
  )
}

/* ---------- 世界书：任务作战（回合制子系统的设定与主角位置） ---------- */

function buildOpsBook(): Lorebook {
  const e1 = entry(
    'ops-engage',
    ['任务', '任务简报', '作战', '出击', '交战', '讨伐', '反现实实体'],
    [
      '作战规则 · 交战',
      '· 任务简报上的每一条，对应一次可派出的作战；委员会以小队为单位处置反现实实体。',
      '· 出手序按敏捷度排定。',
      '· 常规接触、武装解放与「到达点」各自削减一定量的反现实反应；反应归零，作战达成。',
      '· 武装（弹痕、斩击一类）对反现实实体有效，对普通目标不占优。',
      '· 武装尚未解封时，体术按未解封口径结算。',
      BOUNDARY,
    ].join('\n'),
    10,
    '作战准则',
    { ops: true },
  )
  const e2 = entry(
    'ops-stamina',
    ['体力', '观测间隔', '出击', '撤出', '驻扎', '过载'],
    [
      '作战规则 · 体力',
      '两套体力，分开计算：',
      '· 小队体力：终端上那一池。出击时扣固定份额；不随休整立刻回满，只随观测推进（收束新的剧情段）缓慢回补。偏低时仍可出击，全场出力按比例下降。',
      '· 个人体力：战斗内每次出手单独消耗，普攻、技能、到达点各有份额。见底后只能防御；防御回复少量体力，回复量取决于意志力。',
      BOUNDARY,
    ].join('\n'),
    20,
    '体力与观测间隔',
    { ops: true },
  )
  const e3 = entry(
    'ops-operator',
    ['操作员', '指挥', '言万心叶', '低语者', '观测员', '下令'],
    [
      '作战规则 · 操作员',
      '· 操作员：言万心叶，本终端使用者；登记为 Stage4「活性化」，低语者（Susurrador）持有者。',
      '· 职责：决定出击人选、手数与目标，收束之后撰写作战记录。',
      '· 作战位置：本人可编入小队下场；五轴、武装与技能随观测进度换页。',
      '· 名称披露：低语者之名在体验入学、登记成立之后才对外示出。',
      BOUNDARY,
    ].join('\n'),
    30,
    '操作员的作战位置',
    { ops: true },
  )
  return book(
    'book-canon-ops',
    '任务作战',
    '回合制作战规则：交战、体力与观测间隔、操作员的作战位置。条目按规则条款写，不作叙述。',
    [e1, e2, e3],
  )
}

/* ---------- 世界书：主角专档（言万心叶本人 —— 与角色档案同一副面孔，逐段放行） ---------- */

function buildOperatorBook(): Lorebook {
  // 与角色档案同一副表格：姓名／称呼／所属／终末／潜力／经历／登记／能力／面板。
  // 分期词条同样按表写，未观测到的时期由 meta.eventId 闸门挡住。
  const head = entry(
    'op-self',
    ['言万心叶', '心叶', '操作员', '观测员', '主角', '低语者', 'Susurrador', '读心者'],
    [
      spec([
        ['姓名', '言万心叶'],
        ['称呼', '心叶 · 操作员 · 观测终端'],
        ['所属', '终末停滞委员会 · 观测终端（本终端使用者；本人也是战斗人员）'],
        ['终末', '低语者（Susurrador）· Stage4「活性化」'],
        ['终末潜力', 'Stage4「活性化」'],
        ['经历', '初中毕业前被墨西哥黑手党「桑克雷・奥库尔塔」绑架监禁、充当奴隶，前后三年；这段过去是他日后被登记为「低语者」的由来。落海那一夜，他被弃于货船甲板，游向不擅长游泳的拉斐尔・加西亚。被问到为什么不求饶时，他的回答是「因为希望这种东西，从来就没有拯救过我啊」。'],
        ['登记', '与露娜相遇、由艾莉芙・安纳托利亚担保入学苍之学园之后，终末潜力经测定并登记在册。'],
        ['能力', '异端审问室一百场猜拳全胜：对方心里先成形的那一手，他先读到。登记效果为攻击必中、闪避率提升 40%。'],
        ['面板', '不固定。随观测推进，武装、五轴与技能按时期换页，见分期条目。'],
      ]),
      BOUNDARY,
    ].join('\n'),
    5,
    '言万心叶',
    { ops: true },
  )
  const pages = OP_PERIODS.map((p, i) => entry(
    `op-p-${p.at}`,
    ['言万心叶', '心叶', p.title, p.arm, p.cls].filter((k) => k && k !== '无'),
    [
      spec([
        ['姓名', '言万心叶'],
        ['时期', p.title],
        ['职阶', p.cls],
        ['所处卷', p.vol],
        ['处境', p.note],
        ['武装', `${p.arm}${p.armSub && p.armSub !== '—' ? `（${p.armSub}）` : ''}。${p.armNote}`],
        ['被动', p.passive ? `${p.passive.name}：${p.passive.desc}` : ''],
        ['可用招式', p.abilities.map((a) => `${a.name}（${a.kind}）`).join('、')],
        ['所属', '终末停滞委员会 · 观测终端'],
      ]),
      BOUNDARY,
    ].join('\n'),
    6 + i,
    `言万心叶 · ${p.title}`,
    { ops: true, eventId: p.at },
  ))
  return book(
    'book-canon-operator',
    '主角专档 · 言万心叶',
    '言万心叶的档案：总档与按观测进度分页的时期面板。条目只写已确认的设定；'
      + '未观测到的时期由闸门挡住，不提前放行。',
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
        '底色是「公文式的冷 × 少年人的日常」：终末、沉降、收束这类足以让世界停摆的事，一律按事务处理 —— 像填表、像排班、像有人把一张写满编号的纸推到你面前。',
        '天塌下来的场面不激动：不呐喊、不替读者感慨、不写「仿佛世界都在颤抖」这类抬价句。写日常不刻意往轻松里调，写灾难不加形容词渲染 —— 两边用同一副嗓子说话。',
        '反差是这支笔的要害：委员会在讨论一处 Stage4 的沉降，隔壁还在为便当里少了一颗梅子吵架。',
        '冷幽默整卷至多一次（给一个词下定义、末尾缀「——摘自WIKI百科」），不当常规手法用。',
      ].join('\n'),
      1, '文风 · 底色', undefined, true,
    ),
    entry(
      'sty-syntax',
      ['文风', '写法', '句法'],
      [
        '段落极短：一个动作、一句观察就另起一段，一段二十五到三十来字；十二字以内的短句约占三成，四十字以上的长句只占一成上下。',
        '对白密集：含「」的段落占一半左右，叙述与对白交替推进。该说三分就说三分，剩下的交给对方的表情、手里那件东西、窗外的声音。',
        '标点：省略号约每一百字一处（停顿、迟疑、话没说完）；破折号约每两百字一处，只用来打断与插一句话，不拿来收尾表余韵；心里话用全角括号夹在叙述里 ——（这是什么……真是疯了……）。情绪上来用拖长的拟声与叠字（啊啊啊啊／唔……／哼），不加「非常」「无比」。',
        '少用形容词与副词；比喻一段至多一处，取身边之物（器材、便当、绷带、雨），不取宏大意象。推进靠动作与对白，不靠旁白解释；心里那句话可以直接写出来，但不替角色总结心情（「原来这就是孤独」这种不要写）。',
      ].join('\n'),
      2, '文风 · 句法', undefined, true,
    ),
    entry(
      'sty-register',
      ['文风', '写法', '术语口径'],
      [
        '术语照档案口径：终末、Stage、终末潜力、沉降、观测、收束、压制。角色说起它们像报一个班次、念一条规章 —— 不惊呼、不科普、不互相解释（在场的人本来就懂）。推理处「也就是说」「然而」「即便如此」「原来如此」照用。',
        '战斗与伤情只写实感：衣服破了、他退了半步、耳朵里嗡的一声。不出现血量、伤害、回合、数值、技能冷却这类界面口径，也不让角色议论自己或别人「有多强」。',
        '称呼一律「名字＋身份后缀」：露娜小姐、言万同学、心叶同学、恋兔学姐、西蒙会长、泰尔学长。不为亲昵擅自改口，也不用角色没有理由知道的名字；改口要有剧情上的理由（如立契之后）。',
      ].join('\n'),
      3, '文风 · 术语与称呼', undefined, true,
    ),
    entry(
      'sty-intim',
      ['文风', '写法', '私密场面'],
      [
        '私密场面（这一回合真走到那一档才照这条来）：段短、留白在、不写套话；**不许含糊带过** —— 写足是细节往前走，不是句子变长，也不是同一动作换三种说法。',
        '按顺序落笔：怎么起、谁先动、怎么换、怎么收，不跳步；不用「两人沉溺其中」带过，也不用省略号跳过该写的地方。身体写那一处此刻什么样、被碰到怎么应；声音照她本人口癖（会骂、会求、会别开脸还是不肯出声）；触感、温度、气味、体液照实写 —— 这一档不必回避任何词。',
        '**镜头要推近**：小穴、乳头、阴蒂、后穴当下什么样就写什么样 —— 颜色、软硬、开合、湿到哪一档、有没有红肿、被碰到的一瞬间怎么缩。不许拿「那里」「下面」糊过去，也不许每处都写成一样：状态随这一场往前走，每次被弄到都跟上一次不一样。推近夹在动作与感受中间，不另起一段做解剖。',
        '走到哪一步由气氛与对方的行动决定，不越过她此刻肯给的那条线；**还没走到这一档的场面，这一条不生效** —— 它不是要谁去开这一场。这是笔法，不是设定：正文里不点明，也不让角色议论。',
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
 *   v13 → v14 = 四条整篇重写成分行条目：把原本揉成散文的量化口径（段长、句长、标点频次、
 *              比喻上限、术语与称呼、交战写法）逐条搬到独立一行 —— 原来的写法一段就是一大坨，
 *              注入时挤成一条墙；同时每条压在 520 字内（lib/lorescan.ts 的 HOLD_CAP），
 *              让四条每次都完整带着，而不是被「条数平摊」截掉半条。
 *   v14 → v15 = 设定册整份重置：角色／登场者／图鉴／世界观／事件／作战／主角七册改成
 *              「字段：值」的档案表写法（不作比喻、不作叙述），每条末尾附同一句使用边界；
 *              角色与登场者不再收人物卡里的第一人称摘录，档案里的「你」折算成言万心叶，
 *              引号内的台词逐字保留。注入层同时改成 <词条名> … </词条名> 完全包裹。
 *   v15 → v16 = 角色与登场者条目加详：补性格、说话方式、关系、外貌、背景、日常一面、
 *              战斗场面（人物卡原文摘录，叙述人称随原文，「你」仍折算成言万心叶），
 *              并从武装图鉴与作战名册补武装／能力／到达点／战斗方式／战技。
 *   v16 → v17 = 性格与关系改成整理过的档案写法（data/dossiers.ts），不再整段搬原文；
 *              原文只留说话方式的短引文、代表台词，以及外貌／雷区各一行。
 *              每条在注入时还会补一行「此刻（本档）」—— 羁绊、关系档、称呼、行为偏移
 *              取自当前存档（lib/liverelation.ts），旧稿那份静态关系从此只是底账。
 */
export const CANON_SEED_VERSION = 17

/** 种子内容签名：库 id + 词条数（用于决定是否重播） */
export const CANON_SEED_KEY = 'zts-lore-seed-v1'
