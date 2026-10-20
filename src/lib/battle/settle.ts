/* ============================================================
   作战结算 · 一处收口
   ------------------------------------------------------------
   任务板与剧情交战两条入口共用这一段：只有胜仗落库，
   成长 / 羁绊 / 体力 / 装具 / 补给 / 终末点数一并写回隐藏存档。
   败与撤不写记录、不推进剧情（执行委员长口径）。
   ============================================================ */

import { TUNING } from './tuning'
import { squadIdsFrom } from './derive'
import { addCoin, addGear, addGrowth, putRecord, writeBag, writeEquip, writeStamina } from './store'
import type { FlagValue } from '../../data/types'
import type { BattleRecord, StaminaState } from './types'

export interface SettleArgs {
  rec: BattleRecord
  spLeft: number
  /** 收场时每人的装配（战斗中可换） */
  equip: Record<string, string>
  /** 战斗结束时剩下的补给 */
  bag: Record<string, number>
  stamina: StaminaState
  /** 羁绊加成（由终端上下文提供） */
  bumpBond: (id: string, n: number) => void
}

/** 归档一场胜仗，并把一切写回。返回给 toast 用的一句话。 */
export async function settleWin(a: SettleArgs): Promise<string> {
  const { rec, spLeft, equip, bag, stamina, bumpBond } = a
  await putRecord(rec)
  const patch: Record<string, number> = {}
  for (const id of rec.squad) patch[id] = TUNING.growthPerWin
  await addGrowth(patch)
  /* MVP 那一格多算一份羁绊。**认 id，不认名牌** ——
     `rec.mvp` 是屏幕上的那一行字（会带时期后缀、会带「甲 / 乙」编号），
     拿它反查名录是碰运气：认不出就静默少发一份，谁也不报错。
     旧档（这一栏立起来之前写的）没有 id，才退回按名字认那一手。 */
  const mvpId = rec.mvpId ?? squadIdsFrom([rec.mvp])[0]
  for (const id of rec.squad) {
    bumpBond(id, TUNING.bondPerWin + (id === mvpId ? TUNING.bondMvp : 0))
  }
  await writeStamina({ ...stamina, cur: Math.max(0, spLeft) })
  await writeEquip(equip)
  await writeBag(bag)
  for (const g of rec.loot) await addGear(g)
  await addCoin(rec.coin)
  return `${rec.no}「${rec.title}」· ${rec.rounds} 手 / ${rec.ticks} 拍 · 出力最重 ${rec.mvp}`
    + ` · 终末点数 +${rec.coin}`
}


/* ============================================================
   战果 → 主线（数据侧，2026-09-19）
   ------------------------------------------------------------
   这里只**产出**一份「这一场留下了什么」，一个字都不写存档、
   也不改任何调用方 —— 作战屏与推演这一轮没动，所以这份东西现在的读者是 0。
   立它的理由：上一场仗发生过什么（打红了眼的首领 / 被敲开的破绽 / 换过几个形态 /
   哪一条连携真的接上了），本来就是主线该接着写的东西；
   但它得先**成为数据**，否则下一批做剧情联动的人还得回头去解析战报正文。

   两段式：plotTieInOf 给数据（flags + 读数），tieLineOf 给一句话。
   关掉 TUNING.plotTieOn 就只返回老的那三样（胜负 / 档位），不带任何新 flag。
   ============================================================ */

export interface PlotTie {
  /** 这一场是不是正史（主线作战） */
  mainline: boolean
  /** 胜负 —— 只有胜的那一格会写进 flags（败与撤不推进任何东西，执行委员长口径） */
  won: boolean
  tier?: 'elite' | 'boss'
  /** 写回存档的 flag（键值都是数）—— 键名照 flagname 的规矩：小写、点分、不带中文 */
  flags: Record<string, number>
  /** 给人读的一行一行（主线正文 / 简报可以直接抄） */
  lines: string[]
}

/**
 * 一场作战的结算记录 → 主线可以吃掉的那一份。
 *
 * **纯函数**：不读存档、不写存档、不碰网络。调用方想什么时候取都行 ——
 * 打完立刻取（当场推进剧情），或者从作战记录簿里取（补写旧账）都一样。
 *
 * flag 的名字一律 battle. 开头：世界状态里那一片（world.flags）本来是平的，
 * 加一截前缀才认得出「这些数是打出来的」。**只写固定几格**，
 * 不往每个任务上各长一格 —— 那会长出几百个一次性 flag，谁也读不动。
 */
export function plotTieInOf(rec: BattleRecord): PlotTie {
  const won = rec.outcome === '胜'
  const tier = rec.tier
  const flags: Record<string, number> = {}
  const lines: string[] = []
  if (won) {
    flags['battle.wins'] = 1
    flags['battle.lastStage'] = rec.stage
    if (tier === 'boss') flags['battle.lastBoss'] = 1
    if (tier === 'elite') flags['battle.lastElite'] = 1
    if (rec.mainline) flags['battle.mainlineWin'] = 1
  } else if (rec.outcome === '败') {
    flags['battle.losses'] = 1
  } else {
    flags['battle.fled'] = 1
  }
  if (!TUNING.plotTieOn) {
    return { mainline: !!rec.mainline, won, tier, flags, lines }
  }
  /* —— 以下全是新机制留下的读数（旧档没有就是没有，一律按 0 处理）—— */
  const chainPeak = rec.chainPeak ?? 0
  const syncs = rec.syncs ?? 0
  const phases = rec.phases ?? 1
  const enraged = rec.enraged ?? 0
  const breaks = rec.breaks ?? 0
  if (chainPeak > 0) flags['battle.chainPeak'] = Math.max(flags['battle.chainPeak'] ?? 0, chainPeak)
  if (syncs > 0) flags['battle.syncs'] = (flags['battle.syncs'] ?? 0) + syncs
  if (breaks > 0) flags['battle.breaks'] = (flags['battle.breaks'] ?? 0) + breaks
  /* 打穿阶段这件事值得单独一格：它意味着主线里对面**已经换过形态了**，
     正文不能还照第一形态写 —— 下一批做联动的人从这里就看得出来。 */
  if (phases > 1) flags['battle.phases'] = Math.max(flags['battle.phases'] ?? 0, phases)
  if (enraged > 0) flags['battle.enraged'] = (flags['battle.enraged'] ?? 0) + enraged
  for (const t of rec.ties ?? []) flags['battle.tie.' + t] = 1
  if (rec.bossId) flags['battle.boss.' + rec.bossId] = 1
  if (chainPeak >= 5) lines.push('这一场小队把观测口径并到了同一件事上（连携点峰值 ' + chainPeak + '）')
  if (syncs > 0) lines.push('「同调」放出去 ' + syncs + ' 次')
  if (phases > 1) lines.push('对面换了 ' + phases + ' 个形态')
  if (enraged > 0) lines.push('有 ' + enraged + ' 次敌方打红了眼（狂暴）')
  if (breaks > 0) lines.push('敲穿破绽 ' + breaks + ' 次')
  return { mainline: !!rec.mainline, won, tier, flags, lines }
}

/** 同上，但要的是**一句话**（短信 / 简报 / 旁白用）—— 没什么可说的就返回空串 */
export function tieLineOf(rec: BattleRecord): string {
  return plotTieInOf(rec).lines.join('；')
}

/* ============================================================
   把战果并进世界变量（2026-09-19 接上读者）
   ------------------------------------------------------------
   上一批只**产出** flag，读者是 0；这一批由 views/Plot 在打完一场之后
   把 plotTieInOf 的结果并进 world.flags（走 setFlag 那道门，不手写 localStorage）。

   合并口径由产出方定，别让调用方各自猜：同一格 flag 在这一场上到底是
   「加一」「取大」还是「覆盖」，只有写它的人知道。
   ============================================================ */

/**
 * 幂等键那一格：存**最近一次**已经并进世界变量的 `BattleRecord.id`。
 *
 * 为什么拿 rec.id 当键：作战记录表（store 的 records）以它为**主键**，
 * `putRecord` 是 upsert —— 同一场结算两次，写回的仍是同一条记录。
 * 它不是每场都新起一个名字的计数器，所以刷新之后重放同一个 rec 也认得出。
 *
 * 只留最近一条（不按场次一格一格长），是照《battle-design-notes》§7.2
 * 「别往每个任务上各长一格」同一个理由：变量面板是给人看的，不是流水账。
 */
export const TIE_ONCE_KEY = 'battle.settled'

/** 累加型：这些是账（打过几场 / 放过几次），一场进一份 */
const TIE_ADD = new Set([
  'battle.wins', 'battle.losses', 'battle.fled', 'battle.mainlineWin',
  'battle.syncs', 'battle.breaks', 'battle.enraged',
])

/** 取大型：这些是读数（峰值 / 打穿过几个形态），后来的不能把它压小 */
const TIE_PEAK = new Set(['battle.chainPeak', 'battle.phases'])

/**
 * 把一份 `plotTieInOf` 的 flags 并进现有的世界变量（**纯函数**，返回新表）。
 *
 * 三类分开收：账（累加）/ 读数（取大）/ 记号（覆盖）。
 * 「最近一场的档位」那两枚互斥 —— 这一场是首领，上一场的精英记号就该撤掉，
 * 否则世界变量里会同时挂着「最近是首领」与「最近是精英」。
 */
export function mergePlotTie(
  cur: Record<string, FlagValue>,
  flags: Record<string, number>,
): Record<string, FlagValue> {
  const out: Record<string, FlagValue> = { ...cur }
  const num = (k: string) => (typeof out[k] === 'number' ? (out[k] as number) : 0)
  for (const [k, v] of Object.entries(flags)) {
    if (TIE_ADD.has(k)) out[k] = num(k) + v
    else if (TIE_PEAK.has(k)) out[k] = Math.max(num(k), v)
    else out[k] = v
  }
  /* 「最近一场的档位」那两枚互斥：写成显式的 0 而不是删键 —— 调用方是照
     `world.flags[k] !== v` 往下写的（setFlag 只覆盖、不删除），删键等于删不掉。
     只压**已经有过**的那一枚：一场首领仗不该顺手在变量表里长出 `battle.lastElite = 0`。 */
  if ('battle.lastBoss' in flags && 'battle.lastElite' in out) out['battle.lastElite'] = 0
  if ('battle.lastElite' in flags && 'battle.lastBoss' in out) out['battle.lastBoss'] = 0
  return out
}

/** 撤出 / 未打过：只把消耗与装配写回，不落档 */
export async function settleExit(
  spLeft: number, equip: Record<string, string>, stamina: StaminaState,
): Promise<void> {
  await writeStamina({ ...stamina, cur: Math.max(0, spLeft) })
  await writeEquip(equip)
}
