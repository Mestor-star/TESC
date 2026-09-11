/* ============================================================
   交战成文 · 回填推演
   ------------------------------------------------------------
   与 narrate.ts 分工不同：
     · narrate.ts 写的是**归档文书**（部署意图 / 达成手段 / 现场…），
       落进作战记录，给委员会存档看。
     · 这里写的是**剧情正文**（战斗开始 / 角色的行动 / 敌方的行动 /
       战斗中的对话 / 战斗之后），交完手就回填到在线推演，
       接着往下读 —— 一场仗不该只在记录里留一份公文。
   两条口径相同：只写底稿里真发生过的事，不新增人物、招式与结果；
   对话只引已经出现过的台词，照抄，不补话。对手越强，正文里的代价越大。
   ============================================================ */

import { chatCompletion, isReady, loadProfile } from '../api'
import type { ChatTurn } from '../api'
import type { BattleRecord, LogEntry } from './types'

/** 对手的档位 —— 记录里怎么留的档，正文就按哪一档写 */
export type FoeTier = 'elite' | 'boss' | null

export function tierOf(rec: BattleRecord): FoeTier {
  return rec.tier ?? null
}

/** 档位的说法（正文里怎么交代这个对手的分量） */
function tierWord(t: FoeTier): string {
  if (t === 'boss') return '这一档是首领级：它架着一记要防的杀着，代价是实打实的'
  if (t === 'elite') return '这一档是精英：比常规观测体更硬、更能扛'
  return '按常规观测体处置'
}

/** 五段式剧情底稿（无通道时的兜底：事实拼装 + 原文台词照抄） */
export function templateStorylog(rec: BattleRecord): string {
  const hands = rec.turns.filter((t) => t.skillId !== 'sortie' && t.skillId !== 'end' && t.kind !== '指令')
  const allies = [...new Set(hands.filter((t) => t.side === 'ally').map((t) => t.actor))]
  const foes = [...new Set(hands.filter((t) => t.side === 'enemy').map((t) => t.actor))]
  const tier = tierOf(rec)

  const row = (t: LogEntry) => {
    const tail: string[] = []
    if (t.target) tail.push(`对着 ${t.target}`)
    if (t.miss) tail.push('没有命中')
    if (t.dmg) tail.push(`${t.dmg} 点伤害`)
    if (t.heal) tail.push(`回复 ${t.heal}`)
    if (t.down) tail.push('当场失能')
    if (t.note) tail.push(t.note)
    return `T${t.round} ${t.actor} 以「${t.skill}」${tail.join('，') || '出手'}。`
  }

  const talk = hands.filter((t) => t.line).map((t) => `${t.actor}：${t.line}`)

  const after = rec.outcome === '胜'
    ? `${foes.join('、') || '目标'}的动静归零，${rec.place} 恢复了本来的样子。`
      + `这一场由 ${rec.squad.length} 人打到收束，历时 ${rec.rounds} 手、${rec.ticks} 拍，出力最重的是 ${rec.mvp}。`
      + (rec.loot.length ? `残骸里翻出了 ${rec.loot.join('、')}。` : '')
    : rec.outcome === '撤'
      ? `没有把 ${foes.join('、') || '目标'} 留下来。小队从 ${rec.place} 撤出，这一仗还欠着。`
      : `这一场没能收住。${rec.place} 的动静还在，${rec.squad.length} 人退了下来。`

  return [
    `【战斗开始】`,
    `${rec.place}。任务 ${rec.no}「${rec.title}」——${tierWord(tier)}。`
      + `${foes.join('、') || '目标'}先动了，${allies.join('、')}迎上去。`,
    ``,
    `【角色的行动】`,
    hands.filter((t) => t.side === 'ally').map(row).join('\n') || '（本场我方没有留下出手记录。）',
    ``,
    `【敌方的行动】`,
    hands.filter((t) => t.side === 'enemy').map(row).join('\n') || '（对手还没来得及出手。）',
    ``,
    `【战斗中的对话】`,
    talk.length ? talk.join('\n') : '（这一场没有人喊话。）',
    ``,
    `【战斗之后】`,
    after,
  ].join('\n')
}

/** 系统侧口径：把刚打完的这一场写成能接着读的正文，不是文书 */
function systemPrompt(): string {
  return [
    '你是终末停滞委员会观测现场的记录者。一场交战刚刚结束，你要把它写成**剧情正文**，接在故事的正文里往下读。',
    '写作口径：',
    '1）简体中文，第三人称，贴着已发生的事实写：不得新增未记载的人物、敌人、招式或结果；'
      + '不得改变胜负、伤害、出手顺序与回合数。',
    '2）五个小标题，依次为：【战斗开始】【角色的行动】【敌方的行动】【战斗中的对话】【战斗之后】。',
    '3）对话只能照抄底稿里已经出现的台词，不许凭空给谁补话；没有台词的出手就写动作与结果。',
    '4）【战斗之后】写收束时的现场与参战者的反应 —— 按各人档案里的性格、口癖与彼此关系写，'
      + '不新造设定，称呼按关系阶段（露娜在缔结使用者契约之前称他「言万同学」）。',
    '5）对手越强，正文里越要写出压迫感与代价：首领级的对手要写出它那一记杀着的分量；'
      + '杂鱼级的遭遇战写得利落些，不要硬凑悲壮。',
    '6）总长 500-900 字，不要输出任何解释、前言或 markdown 代码块。',
  ].join('\n')
}

function userPrompt(rec: BattleRecord): string {
  const tier = tierOf(rec)
  return [
    `【交战对象】${rec.title}`,
    `【地点】${rec.place}`,
    `【危险度】S${rec.stage}${tier === 'boss' ? '（首领级）' : tier === 'elite' ? '（精英级）' : ''}`,
    `【参战】${rec.squad.length} 人，结果 ${rec.outcome}，历时 ${rec.rounds} 手 / ${rec.ticks} 拍，出力最重者 ${rec.mvp}`,
    '',
    '【逐手底稿】',
    rec.digest,
    '',
    '请据此写成剧情正文。',
  ].join('\n')
}

/** 经推演通道成文；未接通或失败一律退回模板，不抛错 */
export async function narrateStorylog(rec: BattleRecord): Promise<string> {
  const fallback = templateStorylog(rec)
  try {
    const cfg = await loadProfile('main')
    if (!isReady(cfg)) return fallback
    const messages: ChatTurn[] = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(rec) },
    ]
    const text = (await chatCompletion(cfg, messages, {
      maxTokens: 1600,
      temperature: 0.8,
      meta: { channel: '交战推演', act: `战报成文 · ${rec.place}` },
    })).trim()
    return text || fallback
  } catch {
    return fallback
  }
}
