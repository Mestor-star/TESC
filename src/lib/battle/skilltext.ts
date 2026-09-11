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

import type { SkillSpec } from './types'

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
 */
export function effectTextsOf(k: SkillSpec): string[] {
  const out: string[] = []
  const e = k.effect
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
  if (e.taunt) out.push(`引仇 ${k.turns ?? 2} 拍`)
  if (e.selfToo) out.push('增益同时及于自身')
  if (e.pierce) out.push('无视闪避与减伤')
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
  const eff = effectTextsOf(k)
  if (k.power <= 0) return eff.length ? eff.join(' · ') : '不造成伤害'
  return eff.join(' · ')
}
