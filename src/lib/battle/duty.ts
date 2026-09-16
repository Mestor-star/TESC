/* ============================================================
   职能（五档）—— 「这个人在队里干哪一摊」
   ------------------------------------------------------------
   与 `RoleDef.cls`（独奏者 / 织线者 / 骑手 / 黑锤 / 王子殿下…）叠着，不互相顶替：
   `cls` 说的是**原文里他是谁**（一个字不改），职能说的是**他在队里靠哪条轴吃饭**。
   名字全用原文名词，五档各占一条轴：

     主音（攻击轴 · 主攻输出）  护卫（体力轴 · 承伤）  和音（精神轴 · 疗伤）
     调度（速度轴 · 辅助，**行动条归它**）  取材（感知轴 · 压制与敲破绽）

   这一层是**真的管机制**的，不是挂牌子：
     · `axis`      —— 面板与战技格的倍率往这条轴上偏
     · `arch`      —— 战技格只许从这几类框架里挑：**这就是卡住「谁都能写 0.4 推条」的闸**
                      （效果带管「写多大」，这一栏管「谁能写」—— 两道一起才叫规矩）
                      本职之外还许捎**一手通用**（见 `UNIVERSAL_ARCH`）
     · `crit` 一组 —— 暴击的底子（面板 = TUNING 的常数项 + 这一份）
     · `basicTempo` —— 普攻回几点节拍（恢复途径①，见 engine）
     · `arts`      —— 战技格手数（2~3 手，各不相同）

   ⚠️ **职能不再给空转回（2026-09-16）。** 从前这里还有一栏 `tempoRegen`（护卫 / 和音 /
   调度各 1，主音 / 取材 0），是「恢复途径②」的职能那一半。主人拍「下一刀砍恢复路径」
   之后整条撤走 —— 理由与读数见 engine 里恢复途径②那一段。**那一档不再回来**，
   空转回从此只认写在人自己被动上的那一份（`PassiveSpec.tempoRegen`）。

   ⚠️ **恋兔光一人破例**：她归主音，但 `RoleDef.dutyExempt` 让她整个不听 `arch` 那道闸
   （六手原样挂着，数值与手感一个数不改）。她是「主音兼多手」，像星铁的主角。
   ============================================================ */

import { TUNING } from './tuning'
import type { AxisKey, DutyId } from './types'

/**
 * 「一手通用」—— 本职之外唯一许捎的那一手（**五个档共用这一份，一人只有一个名额**）。
 *
 * 主人 2026-09-15 拍的口径：**本职 ＋ 一手通用**。五档各有一摊本职（主音打、护卫扛、
 * 和音拉、调度排序、取材敲破绽），但这五样里有两样本来就是「谁都能搭一手」的 ——
 * 挡一下、拉一把 —— 所以单独留出这一档：
 *
 *     屏障 / 坚守 —— 把这一轮的冲力分走一点
 *     治愈 / 自愈 —— 把这条命找回来一点
 *     解厄       —— 把身上的东西刮掉一点
 *
 * ⚠️ 护卫与和音的**本职**本来就落在这五类里（一个承伤、一个疗伤），所以对那一档来说，
 *    这一栏真正开的是「跨出本职的那一步」：护卫可以捎一手解厄，主音可以捎一手屏障。
 *    交叉过来算的 —— 本职名单先认，认不上才轮到这一栏（见 roster 的 assertDutySlots）。
 *
 * 名额只有 `UNIVERSAL_MAX` 个，而且**至少得留一手本职**：
 *    全挑通用手，这个人就等于没有职能 —— 那五档的名字也就白起了。
 */
export const UNIVERSAL_ARCH: readonly string[] = ['屏障', '坚守', '治愈', '自愈', '解厄']
export const UNIVERSAL_MAX = 1

export interface DutyDef {
  id: DutyId
  /** 显示名（原文的「〜担当」体例；`DutyId` 是它简写，界面用这一个） */
  name: string
  /** 一句话说清他干什么 */
  desc: string
  /** 主攻轴：面板与战技格的倍率往这条轴上偏 */
  axis: AxisKey
  /** 暴击底子（绝对值，0.06 = 面板上 +6%）。面板 = `TUNING.critBase` + 这一份 */
  crit: number
  /** 暴击倍数的追加。面板 = `TUNING.critMul` + 这一份 */
  critMul: number
  /** 恢复途径①：这一档的普攻打出去回几点节拍（主音回得最少 —— 他是全队最大借节拍户） */
  basicTempo: number
  /**
   * **本职**：战技格许挑哪几类框架（`atlas` 的 ARCH id）。
   * 本职之外还许捎一手通用的 —— 见 `UNIVERSAL_ARCH` / `UNIVERSAL_MAX`。
   * 只有**战技格**受它管：普攻 / 终结技 / 天赋各有自己的来路，不看这一栏。
   * 解封门（`gate`）也不看 —— 那是这个人自己的「醒」，与职能正交，谁都能有。
   */
  arch: string[]
  /** 战技格手数上限（2~3）—— 少了两手拼不出战术，多了就没有「固定技能组」可言 */
  arts: number
}

export const DUTY: Record<DutyId, DutyDef> = {
  主音: {
    id: '主音',
    name: '主音担当',
    desc: '把这一场轰开的那一声 —— 全队的主攻手。',
    axis: '破坏力',
    crit: 0.06,
    critMul: 0.15,
    basicTempo: 1,
    arch: ['强袭', '扫荡', '穿甲', '连打', '乱击'],
    arts: 3,
  },
  护卫: {
    id: '护卫',
    name: '护卫担当',
    desc: '顶在最前面，替全队把那几手接住。',
    axis: '物理抗性',
    crit: 0,
    critMul: 0.1,
    basicTempo: 1,
    arch: ['坚守', '屏障', '震退'],
    arts: 2,
  },
  和音: {
    id: '和音',
    name: '和音担当',
    desc: '谁掉下去了就把谁拉回来 —— 队里那口活气。',
    axis: '意志力',
    crit: 0.02,
    critMul: 0,
    basicTempo: 1,
    arch: ['治愈', '自愈', '解厄'],
    arts: 2,
  },
  调度: {
    id: '调度',
    name: '调度担当',
    desc: '改的是顺序 —— 谁先动、谁能动，**行动条归他**。',
    axis: '敏捷度',
    crit: 0.03,
    critMul: 0,
    basicTempo: 2,
    arch: ['提速', '增益', '牵制'],
    arts: 3,
  },
  取材: {
    id: '取材',
    name: '取材担当',
    desc: '先看清这是什么，再决定从哪儿敲 —— 压制与敲破绽。',
    axis: '反现实亲和',
    crit: 0.08,
    critMul: 0.25,
    basicTempo: 2,
    arch: ['重压', '驱逐', '牵制'],
    arts: 3,
  },
}

/** 缺省按主音算 —— 档案上没写职能的都当主攻手（见 derive 造人那两处） */
export function dutyOf(id: DutyId | undefined): DutyDef {
  return (id && DUTY[id]) || DUTY.主音
}

/**
 * 面板暴击率 = 常数项 + 职能那一份。
 * **造人时**由它算一次写进 `Combatant.crit`（见 derive），临场那一路（`crit` 增益）
 * 在引擎的 `critChanceOf` 上叠 —— 所以这里只认职能，不认场上状态。
 * 参数收 `DutyId` 而不是 `Combatant`：derive 那边是在对象字面量里造人，
 * 人还没造出来、只有职能这一个数在手上。
 */
export function critOf(duty: DutyId | undefined): number {
  return TUNING.critBase + dutyOf(duty).crit
}

/** 面板暴击倍数 = 常数项 + 职能那一份（同上：造人时算一次写进 `Combatant.critMul`） */
export function critMulOf(duty: DutyId | undefined): number {
  return TUNING.critMul + dutyOf(duty).critMul
}
