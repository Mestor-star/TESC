/* ============================================================
   收场 · 作战记录成文
   ------------------------------------------------------------
   把「本场逐回合做了什么」交给推演通道成文（为何如此部署 / 如何做到 /
   动作细节 / 场景），落成一份可归档的作战记录；通道未接通时退回模板成文，
   功能不依赖接口。
   成文与原始底稿一并写入隐藏存档，并在后续生成里作为上下文取回 ——
   这样前后文不会打架。
   ============================================================ */

import { chatCompletion, isReady, loadProfile } from '../api'
import type { ChatTurn } from '../api'
import { mvpOf } from './engine'
import type { BattleRecord, BattleState } from './types'

/** 系统侧口径：终端在替委员会起草文书，不是「AI 写小说」 */
function systemPrompt(main = false): string {
  const common = [
    '你是终末停滞委员会·恋兔队的作战记录员。任务结束后，你要归档一份作战记录。',
    '写作口径：',
    '1）以委员会文书口吻第三人称叙述，冷静、克制，允许少量现场细节，不要旁白式抒情。',
    '2）只写下面给的事实，不得新增未记载的人物、敌人或结果；不得改变胜负、伤害与回合数。',
    '3）角色说话要贴其档案性格，可引原作台词，但不许编造新设定。',
  ]
  // 主线作战：要走「详细战斗过程」——逐手复现，一手都不许并、不许省
  if (main) {
    return common.concat([
      '4）这是一场**主线作战**，归档后归入正史，因此必须写成详细战斗过程：'
        + '按底稿的 T1、T2、T3…… 顺序逐手复现，每一手都要交代「谁 · 出了哪一手 · 打向谁 · 结果如何」。',
      '5）五个小标题，依次为：**接战**（任务、地点、双方阵容与部署意图）、'
        + '**逐手经过**（T1 起每一手一段，写明出手者、技能名、目标、伤害或回复数值、'
        + '命中与否、以及该手带来的转折）、**关键节点**（哪一手改了局势：解禁、到达点、'
        + '合体离场、失能、续行、援护）、**收束**（最后一手与胜负如何定下）、'
        + '**现场与善后**（场景、战利品、缴获）。',
      '6）**逐手经过**一节是主体，篇幅不得少于全文的一半；总长 1200-2000 字。',
      '7）不要输出任何解释、前言或 markdown 代码块。',
    ]).join('\n')
  }
  return common.concat([
    '4）四个小标题，依次为：**部署意图**（为什么这么打）、**达成手段**（怎么做到的）、'
      + '**动作经过**（交锋的具体动作）、**现场**（场景与收束）。',
    '5）每节 2-4 句，总长 400-700 字。不要输出任何解释、前言或 markdown 代码块。',
  ]).join('\n')
}

function userPrompt(rec: BattleRecord): string {
  const req = [
    `任务 ${rec.no}「${rec.title}」，地点 ${rec.place}，结果 ${rec.outcome}，`
      + `历时 ${rec.rounds} 手（行动条共推进 ${rec.ticks} 拍）。`
      + (rec.loot.length ? `战后搜刮到：${rec.loot.join('、')}；` : '战后未搜刮到可用装具；')
      + `缴获军需点 ${rec.coin}。`,
  ]
  if (rec.mainline) {
    req.push(
      '本场为主线作战，请按「详细战斗过程」逐手成文：底稿里 T 编号的每一手都要单独落到文中，'
        + '不得合并、不得略过；数值照抄，不许四舍五入成「重创」这类模糊说法。',
    )
  }
  return [`【作战底稿】`, rec.digest, '', `【成文要求】`, ...req, `请据此成文。`].join('\n')
}

/** 无通道时的兜底：直接用事实底稿拼一份可归档的四段式 */
export function templateNarrative(rec: BattleRecord): string {
  const actors = Array.from(new Set(rec.turns.filter((t) => t.side === 'ally').map((t) => t.actor)))
  const hands = rec.turns.filter((t) => t.skillId !== 'sortie' && t.skillId !== 'end')
  const rows = hands.map((t) => {
    const tail: string[] = []
    if (t.target) tail.push(t.target)
    if (t.miss) tail.push('未命中')
    if (t.dmg) tail.push(`${t.dmg} 伤害`)
    if (t.heal) tail.push(`回复 ${t.heal}`)
    if (t.down) tail.push('目标失能')
    if (t.note) tail.push(t.note)
    return `T${t.round} ${t.actor} 以「${t.skill}」作用于 ${tail.join(' · ') || '自身'}。`
  })
  const mvp = mvpId(rec)

  // 主线作战：归档进正史，兜底也要出「详细战斗过程」——逐手一段，不许并
  if (rec.mainline) {
    const detail = hands.map((t) => {
      const tail: string[] = []
      if (t.target) tail.push(`目标 ${t.target}`)
      else tail.push('目标 自身')
      tail.push(t.miss ? '未命中' : t.kind === '普攻' || t.kind === '技能' ? '命中' : '—')
      if (t.dmg) tail.push(`伤害 ${t.dmg}`)
      if (t.heal) tail.push(`回复 ${t.heal}`)
      if (t.down) tail.push('目标就此失能')
      const head = `**T${t.round}** ${t.actor}（${t.kind}·${t.side === 'ally' ? '我方' : '敌阵'}）施展「${t.skill}」。`
      return [head, `　${tail.join(' · ')}。`, t.note ? `　附注：${t.note}` : ''].filter(Boolean).join('\n')
    })
    const beats = rec.turns.filter((t) => t.kind === '指令' && t.note).map((t) => `· ${t.skill}：${t.note}`)
    return [
      `**接战**`,
      `本作战为主线作战，编号 ${rec.no}，由 ${actors.join('、')} 执行，地点 ${rec.place}，`
        + `目标「${rec.title}」。按危险度 S${rec.stage} 评估，采取正面压制、逐次消耗的方式收束；`
        + `${rec.outcome === '胜' ? '以清除目标告终' : '未能清除，按撤出处理'}。`,
      ``,
      `**逐手经过**`,
      detail.length ? detail.join('\n') : '（本场未留下有效交手记录。）',
      ``,
      `**关键节点**`,
      beats.length ? beats.join('\n') : '（本场无额外调度记录。）',
      ``,
      `**收束**`,
      `全场历时 ${rec.rounds} 手，行动条共推进 ${rec.ticks} 拍。` +
        `最后一手由 ${hands.length ? hands[hands.length - 1].actor : '—'} 打出，`
        + `${rec.outcome === '胜' ? '目标反应归零，作战达成' : '未达成压制指标，按撤出处理'}。`,
      ``,
      `**现场与善后**`,
      `${rec.place} —— 反现实反应已归零。出力最重者为 ${mvp}。` +
        (rec.loot.length ? `从残骸中搜刮到 ${rec.loot.join('、')}，` : '') +
        `缴获军需点 ${rec.coin}。作战记录归档完毕，善后移交观测科。`,
    ].join('\n')
  }

  return [
    `**部署意图**`,
    `本作战由 ${actors.join('、')} 执行，针对 ${rec.place} 的 ${rec.title}。` +
      `按危险度 S${rec.stage} 评估，采取正面压制、逐次消耗的方式收束；${rec.outcome === '胜' ? '以清除目标告终' : '未能清除，按撤出处理'}。`,
    ``,
    `**达成手段**`,
    `行动条按敏捷度充能，满条者方能出手 —— 快的人在这段时间里多打了好几手。` +
      `期间以「架势」稳住阵形，弹痕持有者逐重解开封印后转入正式输出。`,
    ``,
    `**动作经过**`,
    rows.length ? rows.join('\n') : '（本场未留下有效交手记录。）',
    ``,
    `**现场**`,
    `${rec.place} ——反现实反应已归零。全场历时 ${rec.rounds} 手 / ${rec.ticks} 拍，出力最重者为 ${mvp}。` +
      (rec.loot.length ? `从残骸中搜刮到 ${rec.loot.join('、')}，` : '') +
      `缴获军需点 ${rec.coin}。作战记录归档完毕，善后移交观测科。`,
  ].join('\n')
}

function mvpId(rec: BattleRecord): string {
  const tally: Record<string, number> = {}
  for (const t of rec.turns) {
    if (t.side !== 'ally' || !t.dmg) continue
    tally[t.actor] = (tally[t.actor] ?? 0) + t.dmg
  }
  let best = '—'
  let v = -1
  for (const k in tally) if (tally[k] > v) { v = tally[k]; best = k }
  return best
}

/** 由一场结束的战斗组装记录对象（成文之前） */
export function recordOf(s: BattleState, digest: string): BattleRecord {
  return {
    id: `${s.missionId}-${Date.now().toString(36)}`,
    missionId: s.missionId,
    no: s.no,
    title: s.title,
    place: s.place,
    stage: s.stage,
    outcome: s.phase === 'won' ? '胜' : s.phase === 'fled' ? '撤' : '败',
    rounds: s.hand,
    ticks: s.tick,
    at: Date.now(),
    squad: s.allies.map((a) => a.id),
    mvp: mvpOf(s),
    digest,
    turns: s.log,
    narrative: '',
    narrativeBy: '模板',
    loot: [...s.loot],
    coin: s.coin,
    mainline: s.mainline,
  }
}

/** 经推演通道成文；未接通或推演失败一律退回模板，不抛错 */
export async function narrateBattle(rec: BattleRecord): Promise<BattleRecord> {
  const fallback = templateNarrative(rec)
  try {
    const cfg = await loadProfile('main')
    if (!isReady(cfg)) {
      return { ...rec, narrative: fallback, narrativeBy: '模板' }
    }
    const messages: ChatTurn[] = [
      { role: 'system', content: systemPrompt(rec.mainline) },
      { role: 'user', content: userPrompt(rec) },
    ]
    // 主线作战要出详细过程，给足额度；随机任务按原样
    const maxTokens = rec.mainline ? 3000 : 1200
    const text = (await chatCompletion(cfg, messages, { maxTokens, temperature: 0.75 })).trim()
    if (!text) return { ...rec, narrative: fallback, narrativeBy: '模板' }
    return { ...rec, narrative: text, narrativeBy: '推演' }
  } catch {
    return { ...rec, narrative: fallback, narrativeBy: '模板' }
  }
}

/**
 * 取最近若干场作战的摘要 —— 生成剧情/对话时注入，防前后文不搭。
 * 返回空串表示无可注入内容。
 */
export function recentBattleContext(records: BattleRecord[], n = 3): string {
  const rows = records.slice(0, n)
  if (rows.length === 0) return ''
  return ['【近期作战记录 · 已归档的既成事实（可作延续性背景，勿逐条复述）】',
    ...rows.map(
      (r) => `· ${r.no}「${r.title}」已 ${r.outcome}（${r.rounds} 手 / ${r.ticks} 拍，`
        + `出力最重 ${mvpId(r)}${r.loot.length ? `，缴获 ${r.loot.join('、')}` : ''}）：${firstLine(r.narrative)}`,
    )].join('\n')
}

function firstLine(s: string): string {
  const t = s.replace(/\*\*/g, '').split('\n').map((x) => x.trim()).filter(Boolean)
  return (t[0] ?? '').slice(0, 80)
}
