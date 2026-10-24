/* ============================================================
   军需 —— 道具 与 反现实辅助装备
   ------------------------------------------------------------
   装具的定位（执行委员长口径）：
     · 与弹痕 / 斩击 / 片羽**无关**——它们是被造出来的物件，不改持有者的本相
     · 只改数值，或给「特殊武器」补一手额外的用法
     · 每人至多装配一件；更换装备**不消耗回合**
     · 来源两条：军需处购买（终末点数）／交战后从敌人身上搜刮；
       其中「特殊装备」另加一道门 —— 须先完成对应的主线才上架
   道具是消耗品，出击时按补给池携带。

   **价位**：这两张表与 `store.ts` 的终末等级、`tuning.ts` 的 coin 收入是**同一支笔** ——
   2026-09-15 主人把整支终末点数 ×12.5（终末等级底价 80→1000、收入同步放大），
   价格跟着同乘，所以数看着大，买起来的快慢与从前**一模一样**。
   改价的人先看 `tuning.ts` 的 coin 那一段，别只动这里 ——
   单边动一张表，等于把某一类东西悄悄变贵或变便宜。
   ============================================================ */

import { OPERATOR_ID } from '../../data/castmeta'
import type { AxisKey, FxKind, GearDef, ItemDef, SkillEffect } from './types'

/* ---------- 道具 ---------- */

export const ITEMS: ItemDef[] = [
  {
    id: 'ration',
    name: '观测口粮',
    desc: '委员会制式的压缩口粮。不美味，但能让人重新站起来。',
    target: 'one',
    price: 500,
    effect: { heal: 0.35 },
  },
  {
    id: 'sedative',
    name: '镇静剂',
    desc: '小柴给心叶扎过的那种。扎进去，对方的动作会慢下来——行动条归零。',
    target: 'enemyOne',
    price: 875,
    effect: { clearBar: true, mark: 0.2 },
  },
  {
    id: 'stabilizer',
    name: '现实稳定剂',
    desc: '把被反现实搅乱的五感按回原位：解除全队负面，并小幅回复。',
    target: 'allyAll',
    price: 1250,
    effect: { cleanse: true, heal: 0.2 },
  },
  {
    id: 'soulcell',
    name: '灵魂流动体 · 残液',
    desc: '从灵魂蓄积器TM 的残骸里回收的一管。谁也不知道它原本属于谁。',
    target: 'allyAll',
    price: 2250,
    effect: { heal: 0.6, cleanse: true },
  },
  /* ————— 2026-09-21 扩编：4 种 → 10 种，补的是四个空着的战术格 —————
     原有四样（口粮 / 镇静剂 / 稳定剂 / 残液）一件没动 —— 语义、数值、价都照旧，
     只在下半张里**另加六样**：护盾 / 缓速 / 破绽（显影、掀壳）/ 战场预读 / 顶层治疗。
     配发的那四样压在 1250~1875（一件低阶装具的价），柜台那两样 2500 / 3000 ——
     也就是「买一件装具」与「备一批药」之间真的是同一笔钱在选（见 tuning 的 bagDefault）。
     每一格的机制都**走引擎既有的效果键**（shield / slow / mark / breakGuard /
     guardClear / accUp / evade / heal），没有一处新开引擎分支 —— 道具这一路本来就落
     applyEffect，加一格不需要碰 engine。 */
  {
    // 护盾格：一次性箔膜。效果键 shield 与「反现实护板」那件装具同源，只是不占装备位
    id: 'wardfilm',
    name: '反现实护膜',
    desc: '观测科配发的一次性箔膜。展开后几拍里，打上来的东西会先被压回薄薄一层现实。',
    target: 'allyAll',
    price: 1500,
    effect: { shield: 0.3 },
  },
  {
    // 缓速格：把目标那一片的现实密度压厚 → 充能慢下来（slow 走的是敌向那一圈）
    id: 'settler',
    name: '惰性沉降剂',
    desc: '打碎了撒在目标脚下。那一片的现实密度变厚，它的动作跟着沉下去。',
    target: 'enemyOne',
    price: 1250,
    effect: { slow: 0.4 },
  },
  {
    // 破防 · 显影：借审问目镜那一款，把破绽钉在视野里并当场削掉两点壳
    id: 'revealer',
    name: '破绽显影弹',
    desc: '审问目镜的同源装药。打上去，对方的破绽会自己浮出来，壳也跟着掉一层。',
    target: 'enemyOne',
    price: 1875,
    effect: { mark: 0.3, breakGuard: 2 },
  },
  {
    // 情报格：把观测科的战场记录发给全队 —— 命中与闪避一起抬（照着它记下的动作打）
    id: 'record',
    name: '观测记录 · 战场预读',
    desc: '观测科这一轮的战场记录，压成一小段。丢给全队：照着它记下的动作打，就打得中，也躲得开。',
    target: 'allyAll',
    price: 1750,
    effect: { accUp: 0.3, evade: 0.1 },
  },
  {
    // 破防 · 掀壳：护盾一次清到零、这一整段不许重凝（与「破绽尽碎」同一条引擎路）
    id: 'breach',
    name: '破片装药',
    desc: '整块壳一起掀掉：护盾清零，且这一整段不许重凝。只卖不配发 —— 它是柜台上的货。',
    target: 'enemyOne',
    price: 2500,
    effect: { guardClear: true, mark: 0.15 },
  },
  {
    // 顶层治疗：没兑过残渣的一管，全队回一大截并洗掉负面
    id: 'soulstock',
    name: '灵魂流动体 · 原液',
    desc: '没有兑过残渣的一管原液。从魂的底子上把整队拉回来 —— 只卖不配发。',
    target: 'allyAll',
    price: 3000,
    effect: { heal: 0.8, cleanse: true },
  },
]

export const ITEM_OF: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

/* ---------- 反现实辅助装备 ---------- */

export const GEARS: GearDef[] = [
  {
    // 非卖品，也不是捡来的：第一卷最后一节那一仗打完，她自己抽了一束丝线
    // 系在他手腕上。此后它一直在他身上，与他是不是拿着弹痕无关 ——
    // 全属性上升，出手也比别人重。换个人拿在手里，只是一团冷掉的丝。
    id: 'luna-thread',
    name: '露娜的丝线',
    sub: 'THREAD OF LUNA',
    desc: '一束银色的丝线，绕过手腕系成结。它自己会收紧、会把人往回拽；'
      + '系着它的人，比原来更站得住，出手也更重。'
      + '——它认人。除了言万心叶，别人系上也只是一条普通的线。',
    mods: { 破坏力: 8, 敏捷度: 6, 物理抗性: 10, 反现实亲和: 8, 意志力: 10, atk: 0.1, basicMul: 0.6 },
    price: 0,
    rank: 3,
    noDrop: true,
    onlyFor: [OPERATOR_ID],
    /* 依主人要求新增（2026-09-21，「武装特殊技能」）：这件装具原本文里只写数值，
       没有自己的招。招式照它自己的记录来 —— 「它自己会收紧、会把人往回拽」，
       所以是「拽回来」：把全队的行动条一起往前推，系着丝线的人出手也更重。
       数值按既有的三件装具技那一档取（cost 3、无冷却、靠行动条节流）。 */
    /* 2026-09-21：**这一件故意不给招**。
       它是言万心叶的常驻内置件（operator-arc 的 `opBuiltinOf`，读到第一卷末就系上），
       不是玩家在战斗里换得来的那一类；而「武装特殊技能」这一轮要的正是
       「换一件装具 = 换一门能放的招」那件事。试过给它写一门（回拽：推条 + 抬攻），
       代价是行动条口径里那 3 点节拍抢不过他自己的招 ——
       balance（RUNS=200）三期胜率 92/92/84 → 85/89/83，
       开局 1~4 档从 100/100/100/98 掉到 97/95/96/95，**掉出带外**。
       所以这里留空：其余六件各配一门（见下面 scope / brace / booster / accumulator /
       skates / fragment）。 */
  },
  {
    id: 'scope',
    name: '观测镜',
    sub: 'OBSERVER SCOPE',
    desc: '委员会观测科的制式目镜。看得清，就打得准。',
    mods: { 破坏力: 6 },
    price: 1250,
    rank: 1,
    /* 依主人要求新增（2026-09-21）：记录里那句「看得清，就打得准」落成一记 ——
       量好的那一点打进去，不吃减伤也不吃闪避，并且更容得下暴击。 */
    skill: {
      name: '测距 · 定点',
      desc: '按目镜量好的那一点打进去：无视减伤与闪避，且更容易打实。',
      cost: 3, power: 1.5, axis: '破坏力', fx: 'blast', line: '「三千二，量好了。」',
      effect: { pierce: true, crit: 0.15 },
    },
  },
  {
    id: 'brace',
    name: '反现实护板',
    sub: 'WARD PLATE',
    desc: '从被压制的反现实实体身上剥下的板片，重新铆成护胸。沉，但顶用。',
    mods: { 物理抗性: 12, shield: 0.06 },
    price: 1875,
    rank: 1,
    /* 依主人要求新增（2026-09-21）：一块「沉，但顶用」的板 —— 顶上去替全队挡一段。
       与「便携塑形器」的墙分工：那面墙更高（0.4）但要四拍起手，这块板拍子是够的。 */
    skill: {
      name: '顶上去',
      desc: '把板面横在前头：全队减伤，一段之内压得住。',
      cost: 3, power: 0, axis: '物理抗性', fx: 'guard', line: '「到我后面去。」',
      effect: { shield: 0.3 },
    },
  },
  {
    id: 'booster',
    name: '加速义肢',
    sub: 'BOOSTER RIG',
    desc: '装在小腿外侧的干涉装置。它不管你怎么走，只负责让你更快到。',
    mods: { spd: 0.18, 敏捷度: 4 },
    price: 3125,
    rank: 2,
    /* 依主人要求新增（2026-09-21）：「只负责让你更快到」—— 那就把全队的充能一起抬起来。
       给的是**充能**（行动条涨得快），不是「推一下条」：推条是狙击，抬充能是节奏。 */
    skill: {
      name: '抢拍',
      desc: '义肢把这一段的节奏整体提前：全队充能加快。',
      cost: 3, power: 0, axis: '敏捷度', fx: 'drone', line: '「先到的是我。」',
      effect: { spdUp: 0.35 },
    },
  },
  {
    id: 'filter',
    name: '净化滤芯',
    sub: 'SCRUBBER',
    desc: '异端审问室的随身滤芯。把灌进肺里的杂音滤掉。',
    mods: { 意志力: 8 },
    price: 3750,
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
    price: 4375,
    rank: 2,
    /* 依主人要求新增（2026-09-21）：残件里还存着从别人那儿收来的魂 ——
       放出来就是一段「全队出手更重」。不给伤害：它是蓄积器，不是武器。 */
    skill: {
      name: '残响',
      desc: '把残件里存着的那些声音放出来：全队攻击上升。',
      cost: 3, power: 0, axis: '意志力', fx: 'noise', line: '「这东西还记得怎么用。」',
      effect: { atkUp: 0.3 },
    },
  },
  {
    id: 'visor',
    name: '审问目镜',
    sub: 'INQUISITOR VISOR',
    desc: '异端审问室用的那一款。戴上它，对方的破绽会自己浮出来。',
    mods: { 反现实亲和: 12 },
    price: 5000,
    rank: 2,
    skill: {
      name: '标记破绽',
      desc: '把目标的破绽钉在全队视野里：全队打它更重，它也更难充能。',
      cost: 3, power: 0, axis: '反现实亲和', fx: 'drone', line: '「看到了，白痴青春期混蛋露出来的破绽！」',
      effect: { mark: 0.3, slow: 0.25 },
    },
  },
  {
    id: 'skates',
    name: '滑步靴',
    sub: 'GLIDE BOOTS',
    desc: '鞋底嵌了一层反现实薄膜。踩下去时，地面会先让开。',
    mods: { evade: 0.15, 敏捷度: 6 },
    price: 6375,
    rank: 3,
    /* 依主人要求新增（2026-09-21）：「踩下去时，地面会先让开」—— 全队脚下一起让开。
       闪避是绝对值（与 evadeOf 同一把尺），配一点点充能：它终究是双靴子。 */
    skill: {
      name: '让开',
      desc: '薄膜让地面先让开：全队闪避上升，脚下的节奏也快一点。',
      cost: 3, power: 0, axis: '敏捷度', fx: 'drone', line: '「踩不到我。」',
      effect: { evade: 0.2, spdUp: 0.1 },
    },
    // 脏器公寓那一案的现场缴获被复刻成了制式件：正史走到那里才配发
    unlockMain: 'v1-5',
    maxOwn: 1,   // 研究所产出的配给：一人一件，兑完为止
  },
  {
    id: 'printer',
    name: '便携塑形器',
    sub: 'FIELD FABRICATOR',
    desc: '境界领域商会流出的小型打印机，比小柴琳那台差得远，但也能立起一堵墙。',
    mods: { 反现实亲和: 8 },
    price: 7875,
    rank: 3,
    // 商会的制品：天空要塞一役之后，委员会才拿到可供拆解的同源件
    unlockMain: 'v2-8',
    maxOwn: 1,   // 研究所产出的配给：一人一件，兑完为止
    skill: {
      name: '塑形 · 屏障',
      desc: '当场塑出一面墙：全队减伤。',
      cost: 4, power: 0, axis: '反现实亲和', fx: 'guard', line: '「要来了！准备防御！」',
      effect: { shield: 0.4 },
    },
  },
  {
    id: 'fragment',
    name: '单翼的碎羽',
    sub: 'FEATHER FRAGMENT',
    desc: '不知从何处剥落的一小片翼羽，被仔细地包在树脂里。它不是天使给的——它只是从那儿掉下来的。',
    mods: { 破坏力: 12, atk: 0.22, 反现实亲和: 6 },
    price: 9375,
    rank: 3,
    /* 依主人要求新增（2026-09-21）：全表最贵的一件，配一记能把它那 12 点破坏力打出去的招 ——
       片羽本来就是「划出去」的东西，所以写得轻、穿得深（不吃减伤与闪避）。 */
    skill: {
      name: '碎羽 · 一记',
      desc: '把那片翼羽划出去：一记轻而穿的斩击，无视减伤与闪避。',
      cost: 4, power: 1.8, axis: '破坏力', fx: 'slash', line: '「——还给你。」',
      effect: { pierce: true },
    },
    // 斩击的天使落下的那一片：直到戴上 a Session. 才有人看懂它是什么
    unlockMain: 'v4-5',
    maxOwn: 1,   // 研究所产出的配给：一人一件，兑完为止
  },
]

export const GEAR_OF: Record<string, GearDef> = Object.fromEntries(GEARS.map((g) => [g.id, g]))

/**
 * 这件装具，这个人装不装得上。
 * 大部分件谁都能装；「露娜的丝线」一类只认名单上的人 ——
 * 它不是数值门槛，是它本身认人。
 */
export function canEquip(charId: string, gearId: string): boolean {
  const g = GEAR_OF[gearId]
  if (!g) return false
  return !g.onlyFor || g.onlyFor.includes(charId)
}

/** 军需处货架（可购买的装具；非卖品 price=0 不在此列 —— 含须主线解锁的特殊装备） */
export const GEAR_SHOP: GearDef[] = GEARS.filter((g) => g.price > 0).sort((a, b) => a.price - b.price)

/** 交战后可搜刮的装具（按稀有度加权；阶段越高越容易出好东西） */
export function rollLoot(stage: number, rnd: () => number = Math.random): GearDef {
  const w3 = Math.min(0.42, 0.04 + stage * 0.035)
  const w2 = Math.min(0.55, 0.18 + stage * 0.045)
  const r = rnd()
  const rank: 1 | 2 | 3 = r < w3 ? 3 : r < w3 + w2 ? 2 : 1
  // 特殊装备不进掉落池：它是拿正史换的，不该从杂兵身上滚出来
  const pool = GEARS.filter((g) => g.rank === rank && !g.noDrop && !g.unlockMain)
  return pool[Math.floor(rnd() * pool.length)] ?? GEARS[0]
}

/** 装具附带技能 → 统一成一手可入菜单的技能（由 derive.ts 组装）。
    落在四格制的「战技」格里 —— 换装不消耗回合，所以它不占普攻那格。 */
export function gearSkillOf(gearId: string, _charId?: string): {
  id: string; name: string; kind: '战技'; desc: string; cost: number; power: number
  axis: AxisKey; fx: FxKind; line: string; target: 'one' | 'allyAll'; effect?: SkillEffect; turns?: number
} | null {
  const g = GEAR_OF[gearId]
  if (!g?.skill) return null
  const s = g.skill
  /* 目标的判据只看**这一手写了什么**，不看名字：写了「友方那几支效果」、
     又没写伤害（power 0）的，就是一手给全队的辅助 —— 后面新加一件装具的招
     不必回来改这里。原先只有 cleanse / shield 两支，2026-09-21 补齐其余几支
     （推条 / 抬充能 / 抬攻 / 抬闪避 / 抬命中 / 护持），否则新写的辅助招
     会被当单体、还得去敌方阵列里挑人。 */
  const friendly = !!s.effect && (
    s.effect.cleanse || (s.effect.shield ?? 0) > 0 || !!s.effect.pushBar
    || !!s.effect.spdUp || !!s.effect.atkUp || !!s.effect.evade
    || !!s.effect.accUp || !!s.effect.ward
  )
  const ally = friendly && s.power === 0
  // id 只挂在装备上、不掺角色：同一件装的技能图标与冷却口径前后一致
  return {
    id: `gear-${gearId}`,
    name: s.name,
    kind: '战技',
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
