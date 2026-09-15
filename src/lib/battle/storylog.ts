/* ============================================================
   交战成文 · 回填推演
   ------------------------------------------------------------
   与 narrate.ts 分工不同：
     · narrate.ts 写的是**归档文书**（部署意图 / 达成手段 / 现场…），
       落进作战记录，给委员会存档看。
     · 这里写的是**剧情正文** —— 与在线推演写出来的东西是同一件：
       一整段正文，接着上文往下读。内容就是刚打完的这一仗：
       战斗怎么打起来的、怎么打到收束、战斗里各人真正说出口的话、
       以及战后的现场与对话。
   两条口径相同：只写底稿里真发生过的事，不新增人物、招式与结果，
   胜负 / 伤害 / 手数 / 参战者一律照底稿。
   一处**不同**，且是用户点名要的：对话不再只许照抄底稿里现成的台词。
   底稿的 `line` 是技能语音（「以『××』出手」那种战报腔），按它写出来的
   对白不像人话 —— 所以这里要把战斗中的话**写出来**：谁在什么时候、
   对谁、说了什么，照其性子与此刻的处境写；底稿有台词的地方照抄，
   没有的地方补写出他们真会说的那一句（这是成文，不是抄录）。

   **别再让这一趟悄悄退回底稿**（主人 2026-09-15 撞见的那一次）。退回是允许的
   （没通道也得看得下去），但必须**说出来** —— 底稿看着像「写成了这样」，
   其实是一场失败的成文，这条界线得在界面上看得见。见 `narrateStorylog`。
   ============================================================ */

import { chatCompletion, isReady, loadProfile } from '../api'
import type { ApiSettings, ChatTurn } from '../api'
import { clampBudget } from '../budget'
import type { BattleRecord, LogEntry } from './types'

/**
 * 空正文时补发的那一句（与 `Plot.tsx:156` 的 RETRY_NUDGE 同一手，只是这儿要的是正文、
 * 不是事件指令，所以另写一句）。
 *
 * **为什么非有这一手不可。** 2026-09-15 主人打完一场，回填进来的是一段战报腔底稿 ——
 * 查下来不是写法问题，是**成文那一趟根本没通**：这一处从前硬写 `maxTokens: 2600`，
 * 而 `lib/budget.ts` 开头那段早就写明了「1500 那一档在思考型通道上根本不够 ——
 * 预算先被内部思考吃光，正文一个字没写就被长度掐断」。2600 对思考型通道正是这一档：
 * 思考吃完，`content` 是空串 → 落到 `text || fallback` → 端出底稿，
 * 而那句 `catch` 又把原因吞了，界面上只留一句「正在把这一仗写成正文」。
 * 现在：预算读通道自己配的那一份（与主线同源），空正文自动补发一次，失败**照实报**。
 */
const STORY_NUDGE =
  '（系统注：上一回的回复为空。请直接给出正文，不要再做长篇内部思考；'
  + '如需思考请压缩篇幅，别让思考占掉正文的额度。）'

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

/**
 * 无通道时的兜底：事实拼装 + 手头已有的台词照抄。
 * 它也是一段正文（不再是分节的文书），只是写不出新的话 —— 所以战斗里
 * 只有底稿真留下台词的出手才有对白，其余按动作与结果写。
 */
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
    const say = t.line ? `「${t.line}」` : ''
    return `${t.actor}${say}以「${t.skill}」出手${tail.join('，') ? '，' + tail.join('，') : ''}。`
  }

  const after = rec.outcome === '胜'
    ? `${foes.join('、') || '目标'}的动静归零，${rec.place} 恢复了本来的样子。`
      + `这一场由 ${rec.squad.length} 人打到收束，历时 ${rec.rounds} 手、${rec.ticks} 拍，出力最重的是 ${rec.mvp}。`
      + (rec.loot.length ? `残骸里翻出了 ${rec.loot.join('、')}。` : '')
      + `小队还没走，仗打完了，话才刚开始说。`
    : rec.outcome === '撤'
      ? `没有把 ${foes.join('、') || '目标'} 留下来。小队从 ${rec.place} 撤出，这一仗还欠着。`
      : `这一场没能收住。${rec.place} 的动静还在，${rec.squad.length} 人退了下来。`

  return [
    `${rec.place}。任务 ${rec.no}「${rec.title}」——${tierWord(tier)}。`
      + `${foes.join('、') || '目标'}先动了，${allies.join('、')}迎上去。`,
    hands.map(row).join('\n') || '（本场没有留下出手记录。）',
    after,
  ].join('\n\n')
}

/** 系统侧口径：没有导演通道时才用它（有通道时由剧情那一路的 system 顶上） */
function systemPrompt(): string {
  return [
    '你是终末停滞委员会观测现场的记录者。一场交战刚刚结束，你要把它写成**剧情正文**，接在故事的正文里往下读。',
    '写作口径：',
    '1）简体中文，第三人称，贴着已发生的事实写：不得新增未记载的人物、敌人、招式或结果；'
      + '不得改变胜负、伤害、出手顺序与回合数。',
    '2）不要小标题、不要分节符号、不要 markdown、不要任何解释或前言 —— 就是一整段可以接着读下去的正文。',
    '3）战斗里的话要写成**人话**：谁在什么时候、对谁、说了什么（提醒、下令、问、骂、逞强、担心那一句），'
      + '按各人的性子与此刻的处境写。**不要把技能名、招式名、技能语音当台词喊**，'
      + '也不要写成「以『××』出手」那种战报腔；底稿里已有的台词照抄，没有的地方补写出他们真会说的那一句。',
    '4）战后接着写下去：现场与各人的反应，以及言万心叶与他们之间的对话 —— 就当成推演的下一拍，他刚打完这一仗，人还在场。'
      + '称呼按关系阶段（露娜在缔结使用者契约之前称他「言万同学」）。',
    '5）对手越强，正文里越要写出压迫感与代价：首领级的对手要写出它那一记杀着的分量；'
      + '杂鱼级的遭遇战写得利落些，不要硬凑悲壮。',
    '6）总长 800-1500 字。',
  ].join('\n')
}

/**
 * 交战底稿 + 成文要求 —— 给导演通道读的那一份。
 *
 * 也是「回填正文」这一趟的扫描文本（世界书与预设命中要照它算），所以单独拆出来。
 */
export function battleStoryBrief(rec: BattleRecord): string {
  const tier = tierOf(rec)
  return [
    `【刚打完的这一仗】${rec.title} —— ${rec.place}`,
    `危险度 S${rec.stage}${tier === 'boss' ? '（首领级）' : tier === 'elite' ? '（精英级）' : ''}`,
    `参战 ${rec.squad.length} 人，结果 ${rec.outcome}，历时 ${rec.rounds} 手 / ${rec.ticks} 拍，出力最重者 ${rec.mvp}`,
    '',
    '【事实底稿 —— 只此一份，胜负 / 伤害 / 手数 / 参战者一律照它，不得改动】',
    rec.digest,
    '',
    '【成文要求】',
    '把这一仗写成一整段**正文**，与上面已有的正文同一副笔墨、同一种写法，接在它后面往下读：',
    '1）写清这一仗怎么打起来的（现场的处境、对手压上来的样子）、又怎么打到收束，'
      + '以及这一路谁在什么时候扭转了局面。',
    '2）战斗中要写出**人话**：谁喊了什么、对谁说的、说的时候是什么口气 —— '
      + '写他们真会说的话（提醒、下令、问、骂、逞强、担心的那一句），'
      + '**不是招式名、技能语音或战报腔**。「以『××』出手」那一类写法不要出现在正文里；'
      + '底稿里已有的台词照抄，底稿没写话的地方按这个口径补写出他们真会说的那一句。',
    '3）对手若有话说，照它的身份与档位写。',
    '4）战后要接着写下去：仗打完之后的现场与各人的反应，以及**言万心叶与他们之间的对话** —— '
      + '就当成推演的下一拍：他刚打完这一仗，人还在场，谁想说什么、谁要问什么，照关系与性子写。',
    '5）底稿里没有的人、招式与结果不许新增；胜负、伤害与手数不许改。',
    '6）篇幅 800-1500 字。不要小标题、不要分节符号、不要 markdown、不要任何解释或前言 —— '
      + '就是一整段可以接着读下去的正文。',
  ].join('\n')
}

function userPrompt(rec: BattleRecord): string {
  return `${battleStoryBrief(rec)}\n\n请据此写成正文。`
}

/** 导演通道那一侧传进来的东西（有它就连台词行格式、在场角色、底层规矩都一并带上） */
export interface StorylogOpts {
  /** 剧情通道的 system：给了就用它 —— 回填的正文与推演正文同一副笔墨、同一套规矩 */
  system?: string
  /** 这一段的对话上文：接在 system 之后，让正文接得上 */
  history?: ChatTurn[]
  /** 输出额度（留作各入口微调） */
  maxTokens?: number
}

/** 成文那一趟的结果 —— `ok: false` 时端的是底稿，`why` 里是照实记下的原因 */
export interface StorylogOutcome {
  text: string
  ok: boolean
  /** 没走通的原因（走通了就没有这一项）。界面上照着它说，别再吞 */
  why?: string
}

/**
 * 经推演通道成文；未接通或失败一律退回底稿，**并把原因带出来**。
 *
 * 两处与主线那一套对齐（从前这里是没有的，正是主人那次「收到战报」的根子）：
 *   · **预算读通道自己配的那一份**（`clampBudget(cfg.maxTokens)`，默认 30000），
 *     不再硬写 2600 —— 成文是八百到一千五百字的长篇，比一次普通回合还长，
 *     照主线「事件衔接」那一档再放宽 1.6 倍。思考型通道上，小预算等于没有预算。
 *   · **空正文补发一次**：思考把额度吃光是这一类通道最常见的失手，补发时加一句催告、
 *     并把预算抬到 1.8 倍（照 `Plot.tsx:902` 那一手）。
 *
 * 仍然**不抛**：成文失败不该把主人卡在作战屏上。但失败一定要说出来 ——
 * 返回 `ok:false` + `why`，由调用处弹给主人看。
 */
export async function narrateStorylog(rec: BattleRecord, opts: StorylogOpts = {}): Promise<StorylogOutcome> {
  const fallback = templateStorylog(rec)
  let cfg: ApiSettings
  try {
    cfg = await loadProfile('main')
  } catch {
    return { text: fallback, ok: false, why: '读不到推演通道的配置' }
  }
  if (!isReady(cfg)) {
    return { text: fallback, ok: false, why: '推演通道还没配（接口地址或模型名空着）' }
  }

  /* 预算：与主线同源。成文比普通回合长，照「事件衔接」那一档放宽 1.6 倍 */
  const budget = clampBudget(cfg.maxTokens)
  const first = opts.maxTokens ?? Math.max(2600, Math.round(budget * 1.6))

  const base: ChatTurn[] = [
    { role: 'system', content: opts.system ?? systemPrompt() },
    ...(opts.history ?? []),
    { role: 'user', content: userPrompt(rec) },
  ]

  let why = '通道未返回任何内容'
  for (let attempt = 1; attempt <= 2; attempt++) {
    const outbox = attempt === 1 ? base : [...base, { role: 'user' as const, content: STORY_NUDGE }]
    const cap = attempt === 1 ? first : Math.max(5000, Math.round(first * 1.8))
    try {
      const text = (await chatCompletion(cfg, outbox, {
        maxTokens: cap,
        temperature: 0.8,
        meta: { channel: '交战推演', act: `战报成文 · ${rec.place}` },
      })).trim()
      if (text) return { text, ok: true }
      /* 空答：多半是内部思考把预算吃光了（budget.ts 开头记的就是这一种）——补发一次 */
      why = attempt === 1
        ? '通道没写出正文（多半是内部思考把输出预算吃光了）'
        : '补发一次仍是空的 —— 该通道的输出预算可能还是不够'
    } catch (e) {
      why = e instanceof Error ? e.message : String(e)
      /* 网络那一下抖动值得再试；报错本身（地址 / 密钥 / 额度）就不必再撞一次 */
      if (attempt === 2) break
    }
  }
  return { text: fallback, ok: false, why }
}
