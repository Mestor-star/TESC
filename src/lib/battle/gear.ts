/* ============================================================
   军需 —— 道具 与 反现实辅助装备
   ------------------------------------------------------------
   装具的定位（执行委员长口径）：
     · 与弹痕 / 斩击 / 片羽**无关**——它们是被造出来的物件，不改持有者的本相
     · 只改数值，或给「特殊武器」补一手额外的用法
     · 每人至多装配一件；更换装备**不消耗回合**
     · 来源两条：军需处购买（军需点）／交战后从敌人身上搜刮
   道具是消耗品，出击时按补给池携带。
   ============================================================ */

import type { AxisKey, FxKind, GearDef, ItemDef, SkillEffect } from './types'

/* ---------- 道具 ---------- */

export const ITEMS: ItemDef[] = [
  {
    id: 'ration',
    name: '观测口粮',
    desc: '委员会制式的压缩口粮。不美味，但能让人重新站起来。',
    target: 'one',
    price: 40,
    effect: { heal: 0.35 },
  },
  {
    id: 'sedative',
    name: '镇静剂',
    desc: '小柴给心叶扎过的那种。扎进去，对方的动作会慢下来——行动条归零。',
    target: 'enemyOne',
    price: 70,
    effect: { clearBar: true, mark: 0.2 },
  },
  {
    id: 'stabilizer',
    name: '现实稳定剂',
    desc: '把被反现实搅乱的五感按回原位：解除全队负面，并小幅回复。',
    target: 'allyAll',
    price: 100,
    effect: { cleanse: true, heal: 0.2 },
  },
  {
    id: 'soulcell',
    name: '灵魂流动体 · 残液',
    desc: '从灵魂蓄积器TM 的残骸里回收的一管。谁也不知道它原本属于谁。',
    target: 'allyAll',
    price: 180,
    effect: { heal: 0.6, cleanse: true },
  },
]

export const ITEM_OF: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

/* ---------- 反现实辅助装备 ---------- */

export const GEARS: GearDef[] = [
  {
    // 非卖品：露娜抽了自己一束丝线给他系上。此后它一直在他身上，
    // 与他是不是拿着弹痕无关 —— 全属性上升，出手也比别人重。
    id: 'luna-thread',
    name: '露娜的丝线',
    sub: 'THREAD OF LUNA',
    desc: '一束银色的丝线，绕过手腕系成结。它自己会收紧、会把人往回拽；'
      + '系着它的人，比原来更站得住，出手也更重。',
    mods: { 破坏力: 8, 敏捷度: 6, 物理抗性: 10, 反现实亲和: 8, 意志力: 10, atk: 0.1, basicMul: 0.6 },
    price: 0,
    rank: 3,
    noDrop: true,
  },
  {
    id: 'scope',
    name: '观测镜',
    sub: 'OBSERVER SCOPE',
    desc: '委员会观测科的制式目镜。看得清，就打得准。',
    mods: { 破坏力: 6 },
    price: 120,
    rank: 1,
  },
  {
    id: 'brace',
    name: '反现实护板',
    sub: 'WARD PLATE',
    desc: '从被压制的反现实实体身上剥下的板片，重新铆成护胸。沉，但顶用。',
    mods: { 物理抗性: 12, shield: 0.06 },
    price: 180,
    rank: 1,
  },
  {
    id: 'booster',
    name: '加速义肢',
    sub: 'BOOSTER RIG',
    desc: '装在小腿外侧的干涉装置。它不管你怎么走，只负责让你更快到。',
    mods: { spd: 0.18, 敏捷度: 4 },
    price: 220,
    rank: 2,
  },
  {
    id: 'filter',
    name: '净化滤芯',
    sub: 'SCRUBBER',
    desc: '异端审问室的随身滤芯。把灌进肺里的杂音滤掉。',
    mods: { 意志力: 8 },
    price: 260,
    rank: 2,
    skill: {
      name: '滤净',
      desc: '把全队身上的负面一并滤掉，并回复一截。',
      cost: 3, power: 0, axis: '意志力', fx: 'guard', line: '「吸一口干净的。」',
      effect: { cleanse: true, heal: 0.22 },
    },
  },
  {
    id: 'accumulator',
    name: '蓄积器残件',
    sub: 'ACCUMULATOR PART',
    desc: '灵魂蓄积器TM 被砸碎后的核心残件。委员会回收了它，装了条背带。',
    mods: { 意志力: 10, atk: 0.1 },
    price: 300,
    rank: 2,
  },
  {
    id: 'visor',
    name: '审问目镜',
    sub: 'INQUISITOR VISOR',
    desc: '异端审问室用的那一款。戴上它，对方的破绽会自己浮出来。',
    mods: { 反现实亲和: 12 },
    price: 340,
    rank: 2,
    skill: {
      name: '标记破绽',
      desc: '把目标的破绽钉在全队视野里：全队打它更重，它也更难充能。',
      cost: 3, power: 0, axis: '反现实亲和', fx: 'drone', line: '「——看到了。」',
      effect: { mark: 0.3, slow: 0.25 },
    },
  },
  {
    id: 'skates',
    name: '滑步靴',
    sub: 'GLIDE BOOTS',
    desc: '鞋底嵌了一层反现实薄膜。踩下去时，地面会先让开。',
    mods: { evade: 0.15, 敏捷度: 6 },
    price: 380,
    rank: 3,
  },
  {
    id: 'printer',
    name: '便携塑形器',
    sub: 'FIELD FABRICATOR',
    desc: '境界领域商会流出的小型打印机，比小柴琳那台差得远，但也能立起一堵墙。',
    mods: { 反现实亲和: 8 },
    price: 560,
    rank: 3,
    skill: {
      name: '塑形 · 屏障',
      desc: '当场塑出一面墙：全队减伤。',
      cost: 4, power: 0, axis: '反现实亲和', fx: 'guard', line: '「墙。……现在有了。」',
      effect: { shield: 0.4 },
    },
  },
  {
    id: 'fragment',
    name: '单翼的碎羽',
    sub: 'FEATHER FRAGMENT',
    desc: '不知从何处剥落的一小片翼羽，被仔细地包在树脂里。它不是天使给的——它只是从那儿掉下来的。',
    mods: { 破坏力: 12, atk: 0.22, 反现实亲和: 6 },
    price: 620,
    rank: 3,
  },
]

export const GEAR_OF: Record<string, GearDef> = Object.fromEntries(GEARS.map((g) => [g.id, g]))

/** 军需处货架（可购买的装具；非卖品 price=0 不在此列） */
export const GEAR_SHOP: GearDef[] = GEARS.filter((g) => g.price > 0).sort((a, b) => a.price - b.price)

/** 交战后可搜刮的装具（按稀有度加权；阶段越高越容易出好东西） */
export function rollLoot(stage: number, rnd: () => number = Math.random): GearDef {
  const w3 = Math.min(0.42, 0.04 + stage * 0.035)
  const w2 = Math.min(0.55, 0.18 + stage * 0.045)
  const r = rnd()
  const rank: 1 | 2 | 3 = r < w3 ? 3 : r < w3 + w2 ? 2 : 1
  const pool = GEARS.filter((g) => g.rank === rank && !g.noDrop)
  return pool[Math.floor(rnd() * pool.length)] ?? GEARS[0]
}

/** 装具附带技能 → 统一成一手可入菜单的技能（由 derive.ts 组装） */
export function gearSkillOf(gearId: string, _charId?: string): {
  id: string; name: string; kind: '技能'; desc: string; cost: number; power: number
  axis: AxisKey; fx: FxKind; line: string; target: 'one' | 'allyAll'; effect?: SkillEffect; turns?: number
} | null {
  const g = GEAR_OF[gearId]
  if (!g?.skill) return null
  const s = g.skill
  const ally = !!s.effect?.cleanse || (s.effect?.shield ?? 0) > 0
  // id 只挂在装备上、不掺角色：同一件装的技能图标与冷却口径前后一致
  return {
    id: `gear-${gearId}`,
    name: s.name,
    kind: '技能',
    desc: s.desc,
    cost: s.cost,
    power: s.power,
    axis: s.axis,
    fx: s.fx,
    line: s.line,
    target: ally ? 'allyAll' : 'one',
    effect: s.effect,
    turns: s.effect?.mark || s.effect?.slow ? 3 : undefined,
  }
}
