/* ============================================================
   技能读数与效果文案 —— 档案 / 作战面板 / 统一口径的唯一出处
   ------------------------------------------------------------
   两条规矩，只在这里写一次：
     1) **倍率读实值**。k.power 本身就是「几倍于该轴」——
        引擎的伤害就是 axes × power（见 engine.damageOf）。
        所以面板上必须写同一个数：2.00 就是 2.00 × 破坏力，
        不许再折成什么「份」。分子分母两套口径，玩家只会以为自己在挠痒。
     2) **每一手都写出效果**。伤害之外的回复、护盾、加速、压制、代价，
        一样不落；零伤害的手尤其要写全 —— 不然面板上只剩「不造成伤害」
        几个字，玩家根本看不出这一手是干什么用的。
   ============================================================ */

import type { GearDef, SkillEffect, SkillSpec, TalentSpec } from './types'

/** 倍率读数：实值 × 轴（有摇摆幅度的写成区间）。不造成伤害的手返回 null */
export function mulTextOf(k: SkillSpec): string | null {
  if (k.power <= 0) return null
  if (k.variance) {
    const lo = k.power * (1 - k.variance)
    const hi = k.power * (1 + k.variance)
    return `倍率 ${lo.toFixed(2)}~${hi.toFixed(2)} 摇摆 × ${k.axis}`
  }
  return `倍率 ${k.power.toFixed(2)} × ${k.axis}`
}

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * 这一手究竟做了什么 —— 逐条列全。
 * 顺序照「先自己、后对手，先数值、后机制」：回复 / 减伤 / 增益 → 压制 → 机制。
 *
 * 收的是**效果本体**而不是整条技能：一手技能、一件补给、一条天赋、
 * 装具附带的那一手，效果都是同一个 SkillEffect —— 翻法只该有一套，
 * 所以这里是唯一的出处，`SkillSpec` 那一路（effectLineOf）只是多传一个 turns。
 * `turns` 只有「引仇」读它（技能手上是 `k.turns`，别的场合没有就按 2 拍）。
 */
export function effectTextsOf(e: SkillEffect | undefined, turns?: number): string[] {
  const out: string[] = []
  if (!e) return out
  if (e.hits && e.hits > 1) out.push(`${e.hits} 段`)
  if (e.revive) out.push('把失能者拉回战列')
  if (e.heal) out.push(`回复 ${pct(e.heal)} × 意志力`)
  if (e.shield) out.push(`减伤 ${pct(e.shield)}`)
  if (e.atkUp) out.push(`攻击 +${pct(e.atkUp)}`)
  /* 这一条写的就是乘数本身（2 = 全部翻倍；引擎内部存 +1，见 engine 的 applyEffect）。
     解封改的是「规格」而不是某一下的伤害，所以后面跟一句把范围说死：
     读面板的人得知道它连回复、屏障、增益、压制的量一起乘。 */
  if (e.skillMul) {
    out.push(`此后自身全部技能的效果 ×${e.skillMul}`)
    out.push('伤害倍率与回复 / 屏障 / 增益 / 压制的量一并乘算')
  }
  if (e.spdUp) out.push(`充能 +${pct(e.spdUp)}`)
  if (e.pushBar) out.push(`立刻充能 ${pct(e.pushBar)}`)
  if (e.evade) out.push(`闪避 +${pct(e.evade)}`)
  if (e.accUp) out.push(`命中 +${pct(e.accUp)}`)
  if (e.cleanse) out.push('解除负面')
  /* 护持与解除负面是两头：一个挡还没中的，一个洗已经中的。
     写清楚各自管哪一头，免得读的人以为两条是同一件事的强弱版。 */
  if (e.ward) out.push(`护持：接下来 ${e.ward} 次负面无效`)
  /* 蓄力写的是「这一拍存起来」而不是「打得更重」——
     顺带把中断条件也写出来，不然玩家不知道还能被打散。 */
  if (e.charge) out.push(`蓄力：本手不出手，下一手伤害 ×${e.charge}（挨到最大生命 10% 即中断）`)
  if (e.taunt) out.push(`引仇 ${turns ?? 2} 拍`)
  if (e.selfToo) out.push('增益同时及于自身')
  /* 暴击那几笔写的是**出手者自己**（见 types 的 SkillEffect.crit）——
     不是给目标上的状态，所以既不进 buff 表、也不挨「解除负面」。
     必暴与绝不暴互斥，合并成一句写，免得面板上同时挂着两条自相矛盾的话。 */
  if (e.sureCrit) out.push('必定暴击')
  else if (e.noCrit) out.push('绝不暴击（求稳不求重）')
  if (e.crit) out.push(`暴击率 +${pct(e.crit)}`)
  if (e.critMul) out.push(`暴击伤害 +${pct(e.critMul)}`)
  if (e.pierce) out.push('无视闪避与减伤')
  /* 架着盾的目标：一个专门打它（加成），一个把盾打脱手（击溃） */
  if (e.stanceAmp) out.push(`打「架着盾」的目标 +${pct(e.stanceAmp)}`)
  if (e.stanceBreak) out.push('击溃防御姿态（架着的盾当场脱手）')
  if (e.mark) out.push(`目标受伤 +${pct(e.mark)}`)
  if (e.slow) out.push(`敌方充能 −${pct(e.slow)}`)
  if (e.pushBack) out.push(`击退行动条 ${pct(e.pushBack)}`)
  if (e.clearBar) out.push('清空行动条 · 打断咏唱')
  if (e.silence) out.push('沉默：只余普攻与防御')
  /* 断拍与停滞读起来像，得把界限写死：停滞冻的是**条**，断拍删的是**那一手** */
  if (e.stall) out.push(`断拍：取消接下来 ${e.stall} 次出手（条照扣）`)
  if (e.breakGuard) out.push(`削破绽 ${e.breakGuard} 点`)
  if (e.bleed) out.push(`流血：每拍掉最大生命 ${pct(e.bleed)}`)
  if (e.frail) out.push(`减攻 ${pct(e.frail)}`)
  if (e.stasis) out.push(`停滞 ${e.stasis} 拍`)
  if (e.lockdown) out.push(`观测封锁：命中 −${pct(e.lockdown)}`)
  if (e.archive) out.push(`归档 ${e.archive} 拍`)
  return out
}

/**
 * 面板上那一行的「效果」总述。
 * 不造成伤害的手要把机制写全；伤害手若另有附带效果，接在倍率之后。
 */
export function effectLineOf(k: SkillSpec): string {
  const eff = effectTextsOf(k.effect, k.turns)
  if (k.power <= 0) return eff.length ? eff.join(' · ') : '不造成伤害'
  return eff.join(' · ')
}

/* ============================================================
   装具改了哪几个数 —— 军需处（Missions）/ 编成（Battle）/ 档案（Archive）
   ------------------------------------------------------------
   从前这三处各写了一套翻法，同一件「普攻倍率 +0.6」在两个地方读成
   「普攻倍率 +60%」和「普攻 ×1.6」—— 数值上都是同一支笔，读起来却像两件东西。
   口径收在这里：**轴走加法、成数走「+n%」、普攻倍率走乘数**
   （类型里写死了 0.5 = 普攻 ×1.5，见 types.GearDef.mods.basicMul）。
   ============================================================ */

/** 装具常驻的那几笔修正，逐条读出来（没有修正返回空数组） */
export function modsTextsOf(mods: GearDef['mods']): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(mods)) {
    if (typeof v !== 'number' || !v) continue
    if (k === 'spd') out.push(`充能 +${pct(v)}`)
    else if (k === 'evade') out.push(`闪避 +${pct(v)}`)
    else if (k === 'shield') out.push(`减伤 ${pct(v)}`)
    else if (k === 'atk') out.push(`攻击 +${pct(v)}`)
    else if (k === 'basicMul') out.push(`普攻 ×${(1 + v).toFixed(1)}`)
    else out.push(`${k} ${v > 0 ? '+' : ''}${v}`)
  }
  return out
}

/* ============================================================
   状态那一格的字 —— 增益 / 减益的标签
   ------------------------------------------------------------
   作战屏状态条与天赋读数读同一份。原先这份表只长在 Battle.tsx 的
   BuffTags 里，灯下黑：天赋那条「攻势 +20% · 3 回合」要读它，就得再抄一遍。
   ============================================================ */

export const BUFF_LABEL: Record<string, string> = {
  /* `mark` 读作「易伤」不是「破绽」——
     它是一条「被打更重」的减益，而「破绽」是反现实实体身上那层轴护盾
     （guardPts / guardAxis）。两个词从前混用过，这里分开。 */
  atk: '攻势', spd: '加速', evade: '闪避', acc: '命中', shield: '护罩', mark: '易伤', slow: '减速',
  // 敌方向我方挂的：标签直说后果，不必让玩家去翻说明
  silence: '沉默', bleed: '流血', frail: '减攻',
  stasis: '停滞', lockdown: '观测封锁', stall: '断拍',
  // 解封那一路：整门技能翻倍，不是「打得重一点」
  skillMul: '技能强化', crit: '暴击',
}

/**
 * 补给的目标读法 —— ⚠️ 与技能那张表**键同义反**：
 * 技能里的 `one` 是「单体敌人」（出手打谁），补给里的 `one` 是「选一名我方」（往谁身上用）。
 * 两张表合成一张就会读反，所以各写各的，键都在这儿写死。
 */
export const ITEM_TARGET_LABEL: Record<string, string> = {
  one: '对我方一人', allyAll: '对我方全员', enemyOne: '对敌方一人',
}

/** 一条状态读数：`攻势 +20% · 3 回合`（v 为 0 时只念名字） */
export function buffTextOf(k: string, v?: number, rounds?: number): string {
  const head = `${BUFF_LABEL[k] ?? k}${v ? ` ${v > 0 ? '+' : ''}${pct(v)}` : ''}`
  return rounds ? `${head} · ${rounds} 回合` : head
}

/* ============================================================
   天赋读数 —— 四格制里第四格的那一行字
   ------------------------------------------------------------
   天赋**全是自动触发的，一格都不点**，所以它没有倍率、没有代价、没有冷却；
   要读的只有三件事：**什么时候响、落在谁身上、这一场响几次**。
   作战屏那一格（Battle.tsx）与档案里的被动那一块（roster 的 passiveText）
   读的都是这里 —— 一处口径，两处用，省得两边各写一套翻法。
   ============================================================ */

/** 什么时候响（触发档翻成人话） */
export function talentWhenText(t: TalentSpec): string {
  const tr = t.trigger
  switch (tr.on) {
    case 'battleStart': return '开场'
    case 'act': return '自己出手之后'
    case 'hit': return '自己这一手打实'
    case 'crit': return '自己打出暴击'
    case 'critTaken': return '自己挨了暴击'
    case 'foeDown': return '场上倒下一个敌人'
    case 'allyDown': return '场上倒下一个同伴'
    case 'hpBelow': return `自己跌破 ${Math.round(tr.ratio * 100)}% 血`
    case 'round': return `每逢第 ${tr.every} 个回合`
  }
}

/** 落在谁身上（缺省是自己 —— 那就没什么可念的） */
export function talentToText(t: TalentSpec): string {
  const to = t.to ?? 'self'
  if (to === 'self') return ''
  if (to === 'trigger') return '落在事发的那一位身上'
  if (to === 'allyAll') return '落在全队'
  if ('duty' in to) return `落在${to.duty}担当那一档`
  return '落在节拍最紧的那一位'
}

/** 这一场响几次（缺省 1 —— 天赋是「响一次」的东西，不是光环） */
export function talentUsesText(t: TalentSpec): string {
  const n = t.uses ?? 1
  if (n < 0) return '不限次'
  return n === 1 ? '每场一次' : `每场 ${n} 次`
}

/**
 * 这一条天赋**具体给了什么数** —— 效果本体、节拍、挂上去的增益，一件不落。
 *
 * 主人 2026-09-15：「天赋的描述问题，效果什么的要写出来」。
 * 从前天赋那一格只有名字、触发档与次数（when / uses / to），
 * 「丝线记事：自己打出暴击 → 目标受伤 +15%」里的 **+15%** 根本不落屏 ——
 * 玩家只知道它什么时候响，不知道响了有什么用。
 * 三样东西各有各的读法：effect 走技能那一套翻法（同一把尺），
 * tempo 是节拍账（正回负抽），buffs 是挂上去的状态（回合计，见 types）。
 */
export function talentEffectTexts(t: TalentSpec): string[] {
  const out = effectTextsOf(t.effect)
  if (t.tempo) out.push(t.tempo > 0 ? `回 ${t.tempo} 节拍` : `抽走 ${-t.tempo} 节拍`)
  for (const b of t.buffs ?? []) out.push(buffTextOf(b.k, b.v, b.rounds))
  return out
}

/** 一句话读完一条天赋：`天赋「换到别处」· 场上倒下一个敌人 · 每场 3 次 · 落在全队` */
export function talentLineOf(t: TalentSpec): string {
  const to = talentToText(t)
  const tail = [talentUsesText(t), to, ...talentEffectTexts(t)].filter(Boolean).join(' · ')
  return `天赋「${t.name}」· ${talentWhenText(t)} · ${tail}`
}
