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
    constant: false,
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
    '小队体力只在执行任务时消耗：一次出击先扣固定份额，出手另计。'
      + '它不会因休整而立刻回满——只有操作员继续推进观测、收束新的剧情段，它才随观测间隔缓慢回补。'
      + '体力偏低时仍可强行出击，代价是全场出力打折；撤出并不退档，任务只回到「压制中」，另留一条伤情记录。',
    20,
    '体力与观测间隔',
    { ops: true },
  )
  const e3 = entry(
    'ops-operator',
    ['操作员', '指挥', '言万心叶', '低语者', '观测员', '下令'],
    '言万心叶是这台终端的操作员，也是登记在册的 Stage4『活性化』、低语者（Susurrador）的持有者。'
      + '他不在战斗序列里直接出手：作战时他是下令的一方——决定由谁出击、以何等手数应敌、目标指向何处，'
      + '并在每一次收束之后撰写作战记录。他的位置是指挥与观测，不是刀锋。'
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

export function buildCanonLorebooks(): Lorebook[] {
  return [buildCharBook(), buildCodexBook(), buildLoreBook(), buildEventBook(), buildOpsBook()]
}

/** 默认激活的 canon 库 id（全 5 本默认激活） */
export const CANON_BOOK_ACTIVE_IDS = [
  'book-canon-char',
  'book-canon-codex',
  'book-canon-lore',
  'book-canon-events',
  'book-canon-ops',
]

/** 旧版种子里的废弃库 id（迁移时删除：v1 的独立「登场者登记」） */
export const OBSOLETE_CANON_IDS = ['book-canon-sidecast']

/** 种子内容版本：v3 → v4 = 新增「任务作战」canon 库（交战准则 / 体力与观测间隔 / 操作员的作战位置），触发一次性重播升级 */
export const CANON_SEED_VERSION = 4

/** 种子内容签名：库 id + 词条数（用于决定是否重播） */
export const CANON_SEED_KEY = 'zts-lore-seed-v1'
