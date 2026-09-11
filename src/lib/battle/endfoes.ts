/* ============================================================
   终末图鉴实体 —— 正文里真的打过的那几只，站到对面来
   ------------------------------------------------------------
   bosses.ts 收的是「有档案的真人」：天空竞技祭那几位同行、卡乌斯学院的学生。
   可正文里的仗大多数不是跟人打的 —— 是跟图鉴上登记着的那只东西打的：
   灵魂蓄积器TM、脏器公寓、死骸机关之神、死灵舰队、星鲸、艾美莉亚……
   它们本来在作战板上的样子是「未分类观测体 甲 · 精英」：
   一个临时挂牌的通用件，手上拿的是通用机制包，跟图鉴上那一条对不上号。

   这个文件把那一类补上：**以 codex.ts 的条目为唯一依据**，
   给每一只实体制一份上场用的档案 —— 与 bosses.ts 的 NamedBoss 同一套形状，
   所以 derive 一行都不用改：任务挂上 bossId，场上的头一名就换成它。

   规矩（与 bosses.ts 同一条，只是取材处换了）：
     · 名字 = 图鉴登记名（NO.xxxx 名称），一个字都不改写；
     · 起手与到达点这两手、被动、破绽，说明栏里引的**必须是该条自己的原文**
       （origin / detail / counter 三栏，直接抄，不改写）；
     · 中间那两手走「性质分类套件」（下面 CLASS_KIT）—— 图鉴每一栏都写着
       ○性质分类（异法 / 死灵操法 / 仪式灾害 / ……），同一类的东西
       打起来本来就是同一路数：亡灵系喊人、机械系过载、旧神系压覆。
       这一层与 derive.ts 的 ENEMY_PROFILE 是同一种东西（型别套件），
       不是替谁新造招式 —— 所以它写在套件上，不写在实体上。
     · 图鉴上没登记的实体（时间线里那几个「丝绸小丑的残骸」之类）不在这儿：
       它们进不了这一张表，就照旧走现推的观测体。

   五轴与血量按**图鉴登记的危险度**算（见各条的 ratedAs），
   而不是按这一场任务的阶段 —— 理由写在 bosses.ts 的 codexStage 上：
   Stage8 是 Stage8，在卷一撞见与在卷六撞见是同一样东西。
   代价是同一场里现推的观测体吃了时期增幅、它会显得比它们薄一点：
   那一点差是故意的，不是漏掉的 —— 委员会那根标尺本来就不随你读到第几卷走。
   ============================================================ */

import { CODEX } from '../../data/codex'
import type { EndEntry } from '../../data/types'
import { place } from './atlas'
import type { NamedBoss } from './bosses'
import { TUNING, enemyAxesAt } from './tuning'
import type { AxisKey, FxKind, PassiveSpec, SkillEffect, Target } from './types'

/* ============================================================
   一、性质分类套件
   ------------------------------------------------------------
   键是图鉴条目 classes 里那几个词 —— 委员会自己那套分类，不是我另起的名字。
   每一套给：演出类别、破绽轴、一手打到全场的、一手顾自己的。
   实体自己那两手（起手 / 到达点）压在套件两头，所以同一类的两只东西
   打起来像同一路数，但各有各的开场与收场。
   ============================================================ */

interface KitSkill {
  name: string
  desc: string
  line: string
  /** 按 atlas 的框架打（决定类别、倍率带、基础效果） */
  arch: string
  power: number
  axis: AxisKey
  effect?: SkillEffect
  turns?: number
}

interface Kit {
  /** 套件名（注释口径） */
  label: string
  fx: FxKind
  cls: string
  hue: string
  /** 破绽轴：这一类「怕哪条轴」 */
  guardAxis: AxisKey
  /** 五轴的偏置（乘在统一曲线之上）—— 同一危险度下，各类的长短处 */
  bias: Partial<Record<AxisKey, number>>
  /** 两手看家 */
  skills: [KitSkill, KitSkill]
  /** 这一类共有的质地（实体自己没写被动时用它） */
  passive?: PassiveSpec
}

const CLASS_KIT: Record<string, Kit> = {
  死灵操法: {
    label: '死灵操法',
    fx: 'noise', cls: '死灵操法', hue: '#6f8f7a',
    guardAxis: '意志力',
    bias: { 意志力: 1.1, 物理抗性: 0.9, 敏捷度: 0.95 },
    skills: [
      {
        name: '亡灵 · 群起', arch: '扫荡', power: 1.5, axis: '反现实亲和',
        desc: '它抬起来的那只手不是自己的 —— 跟着抬起来的是它脚底那一整片。'
          + '（死灵操法：不死的兵，从死者里现取。）',
        effect: { mark: 0.2, slow: 0.2 }, turns: 2,
        line: '「——」地上那些东西，跟着它的手一起抬起来了。',
      },
      {
        name: '不死者 · 再起', arch: '自愈', power: 0, axis: '意志力',
        desc: '死灵操法最麻烦的一处：打散不等于打完 —— 散了的东西自己往回走。',
        line: '「——」散了一地的东西，又自己往回走。',
      },
    ],
    passive: {
      name: '不死者的躯壳',
      desc: '死灵操法系的共有一笔：身体是可以替换的部件（图鉴 No.819-A 狂热者・格尔 ——'
        + '「不死之身使其无法被杀死，只能被『放逐』」）。',
      regen: 0.025,
    },
  },

  反现实机械工学: {
    label: '反现实机械工学',
    fx: 'drone', cls: '工学制品', hue: '#4ea6c8',
    guardAxis: '破坏力',
    bias: { 物理抗性: 1.15, 敏捷度: 0.9, 反现实亲和: 0.95 },
    skills: [
      {
        name: '装置 · 全功率', arch: '穿甲', power: 2.1, axis: '反现实亲和',
        desc: '工学制品最本位的一手：按着一张图纸把功率推到底。'
          + '图纸上没有「停」这一档，所以它不吃减伤。',
        line: '「——」仪表上那根针，一路推到了底。',
      },
      {
        name: '工学 · 自检', arch: '自愈', power: 0, axis: '意志力',
        desc: '坏了就换、缺了就补：这一手不朝谁动手，它把自己修回来。',
        line: '「——」它停下来了一拍。那一拍是在修自己。',
      },
    ],
    passive: {
      name: '按图纸办事的躯壳',
      desc: '反现实机械工学系的共有一笔：它的行为是可推算的（图鉴 No.3922 ——'
        + '「以花言巧语夺走灵魂，将其保存于门扉内侧」，动作有固定的顺序）。',
      shield: 0.1,
    },
  },

  仪式灾害: {
    label: '仪式灾害',
    fx: 'seal', cls: '仪式灾害', hue: '#c8954e',
    guardAxis: '意志力',
    bias: { 反现实亲和: 1.15, 敏捷度: 0.85, 意志力: 1.05 },
    skills: [
      {
        name: '仪式 · 铺开', arch: '重压', power: 0, axis: '反现实亲和',
        desc: '仪式的可怕在于它是**铺开**的：不是打你一下，是把这一片都变成它的场。',
        line: '「——」线条从它脚下一圈一圈铺出去，铺到哪儿，哪儿就是仪式里。',
      },
      {
        name: '献祭 · 收取', arch: '增益', power: 0, axis: '反现实亲和',
        desc: '仪式要有祭品，也要有收成：它把这一场里已经发生的事折算成自己的力气。',
        line: '「——」它把这一场里掉的东西收走了。',
      },
    ],
  },

  异法: {
    label: '异法',
    fx: 'noise', cls: '异法', hue: '#a07fbf',
    guardAxis: '反现实亲和',
    bias: { 反现实亲和: 1.1 },
    skills: [
      {
        name: '异法 · 扭曲', arch: '驱逐', power: 1.8, axis: '反现实亲和',
        desc: '异法不讲力道：它讲的是「你刚才那一手，其实不是那样的」。'
          + '打完还把人的节奏一并打散。',
        effect: { frail: 0.3 },
        line: '「——」刚才那一下，好像本来不是这样的。',
      },
      {
        name: '显形 · 增殖', arch: '增益', power: 0, axis: '反现实亲和',
        desc: '异法实体越打越像它自己：每挨一下，它的形状就往外涨一点。',
        line: '「——」它比刚才大了一圈。',
      },
    ],
  },

  天使之律: {
    label: '天使之律',
    fx: 'seal', cls: '天使之律', hue: '#d8cfa0',
    guardAxis: '意志力',
    bias: { 意志力: 1.2, 物理抗性: 0.9, 反现实亲和: 1.05 },
    skills: [
      {
        name: '律纹 · 裁', arch: '穿甲', power: 2.0, axis: '反现实亲和',
        desc: '天使之律不讨论对错，只执行条文：律纹亮到哪里，那一处就被判了。'
          + '（图鉴 二级天使一栏：旧神不可理喻，任何接触都需上报会长。）',
        line: '「——」它念的不是话，是一行规则。',
      },
      {
        name: '旧神 · 万目', arch: '重压', power: 0, axis: '反现实亲和',
        desc: '被一条不解释的规则看着：全场都被标上，行动一并被拖慢。',
        line: '「——」被看着的时候，人是会慢下来的。',
      },
    ],
  },

  旧神: {
    label: '旧神',
    fx: 'noise', cls: '旧神', hue: '#8f7fb0',
    guardAxis: '意志力',
    bias: { 意志力: 1.25, 敏捷度: 0.9, 物理抗性: 1.05 },
    skills: [
      {
        name: '旧神 · 压覆', arch: '震退', power: 1.5, axis: '反现实亲和',
        desc: '旧神出手不像打斗，像天气：整片一起压下来，退都没地方退。',
        line: '「——」它没有冲着谁来。它只是压下来了。',
      },
      {
        name: '不可理喻 · 自持', arch: '自愈', power: 0, axis: '意志力',
        desc: '不可理喻这四个字是它的防御：讲不通的东西，也就打不软。',
        line: '「——」它不听。它也不需要听懂。',
      },
    ],
  },

  共同幻想: {
    label: '共同幻想',
    fx: 'guitar', cls: '共同幻想', hue: '#d8a04e',
    guardAxis: '反现实亲和',
    bias: { 意志力: 1.2, 反现实亲和: 1.1 },
    skills: [
      {
        name: '祈愿 · 齐声', arch: '扫荡', power: 1.5, axis: '反现实亲和',
        desc: '它不是一个东西在说话，是很多人一起：打在谁身上，谁听见的都是同一句。',
        effect: { mark: 0.2, slow: 0.25 }, turns: 2,
        line: '「——」那不是一声。那是很多声，同一句。',
      },
      {
        name: '共同幻想 · 不灭', arch: '自愈', power: 0, axis: '意志力',
        desc: '只要还有人在想它，它就还在 —— 共同幻想没有「清除」，只有「说服」。',
        line: '「——」你把它打散的那一部分，正在被谁想起来。',
      },
    ],
    passive: {
      name: '有人想着，就还在',
      desc: '共同幻想系的共有一笔（图鉴 No.0004 怪异之王 ——「不可消灭共同幻想，只能协商」、'
        + 'No.8389 星鲸 ——「不可用暴力清除共同幻想」）：散得开，但打不死。',
      endure: 1,
    },
  },

  侦探: {
    label: '侦探',
    fx: 'slash', cls: '侦探', hue: '#b08968',
    guardAxis: '破坏力',
    bias: { 敏捷度: 1.15, 物理抗性: 0.85 },
    skills: [
      {
        name: '侦查 · 断案', arch: '牵制', power: 0, axis: '破坏力',
        desc: '侦探不靠力气：它先把你这一手「定成」什么，再照着那个定性动手。'
          + '（图鉴 D-1293：「能力是令半径 10 米内被因果分为『杀人者/被害者』互相残杀」。）',
        line: '「——」它已经把这件案子定下来了。',
      },
      {
        name: '处决 · 蔷薇', arch: '穿甲', power: 1.9, axis: '破坏力',
        desc: '履行职责的那一手，不留余地（图鉴 D-289 蔷薇的侦探：'
          + '「杀害方式是『巨大的长矛贯穿胸口』——因挥洒的鲜血宛如红色蔷薇而得名」）。',
        effect: { bleed: 0.06 },
        line: '「——」一根长的东西，从背后穿了过来。',
      },
    ],
  },

  梵我合一: {
    label: '梵我合一',
    fx: 'seal', cls: '梵我合一', hue: '#9b8fd0',
    guardAxis: '反现实亲和',
    bias: { 反现实亲和: 1.15, 意志力: 1.1, 物理抗性: 0.95 },
    skills: [
      {
        name: '容纳 · 一体', arch: '重压', power: 0, axis: '反现实亲和',
        desc: '梵我合一摊开的那一拍：它既是你，也是这一片 ——'
          + '在场的人先分不清哪一下是冲自己来的。',
        line: '「——」这里也是它。你也是。',
      },
      {
        name: '梵我 · 无我', arch: '自愈', power: 0, axis: '意志力',
        desc: '「把『我』与『世界』视为同一、以一己容纳万象的法理」——'
          + '那么打在它身上的，就是打在这一片上的。',
        line: '「——」打进去的那一下，散开了。',
      },
    ],
  },

  线之律: {
    label: '线之律',
    fx: 'noise', cls: '线之律', hue: '#b07f9f',
    guardAxis: '意志力',
    bias: { 反现实亲和: 1.2, 意志力: 1.1 },
    skills: [
      {
        name: '因果之线 · 拨', arch: '驱逐', power: 1.8, axis: '反现实亲和',
        desc: '线之律不砍人，它拨线：拨过的那一处，因果自己会去补。',
        effect: { frail: 0.3, pushBack: 0.3 },
        line: '「——」有什么被拨了一下。后果还在后头。',
      },
      {
        name: '轮回 · 不死', arch: '自愈', power: 0, axis: '意志力',
        desc: '不死者不可斩杀 —— 只能「契约」（图鉴 No,951 线之人 的 counter 一栏）。',
        line: '「——」它又回来了。本来就杀不掉。',
      },
    ],
  },
}

/** 图鉴 classes 里的词 → 套件；对不上就按「异法」处理（图鉴里最多的那一类） */
function kitOf(e: EndEntry): Kit {
  for (const c of e.classes) if (CLASS_KIT[c]) return CLASS_KIT[c]!
  return CLASS_KIT.异法!
}

/* ============================================================
   二、实体自己那两笔（起手 / 到达点）+ 被动 + 破绽 + 形态链
   ============================================================ */

interface Hand {
  name: string
  /** 说明：引该条图鉴的原文 */
  desc: string
  line: string
  power: number
  axis?: AxisKey
  arch?: string
  effect?: SkillEffect
  turns?: number
  target?: Target
  fx?: FxKind
}

interface EndSpec {
  /** 图鉴条目 id —— 名字、危险度、性质分类、考据原文全从这一条取 */
  codex: string
  /** 它在牌面上按哪一档站（缺省取图鉴的 stage）。与图鉴不同处，理由写在下面 */
  ratedAs?: number
  /** 起手（普攻）—— 本来就是「它平时怎么动」 */
  atk: Hand
  /** 到达点 —— 它最本位的那一手 */
  ult: Hand
  /** 被动（图鉴原文里它「一直带着」的那一笔） */
  passive?: PassiveSpec
  /**
   * 破绽轴：缺省取套件那一份。
   * 写 `null` = 这一只**没有破绽** —— 与指名首领同一条口径，
   * 给不给那层「只有对上这条轴才削得动」的护盾，看的是图鉴上它难不难打：
   * counter 一栏写着「消灭并不困难」的那些（如 No.2873 魇视鳌虾），
   * 照套件糊一层护盾就是替它新造了一门它没有的机制。
   */
  guardAxis?: AxisKey | null
  /** 血量倍数（1 = 同危险度首领那一档） */
  hpMul?: number
  /** 五轴偏置（叠在套件之上） */
  bias?: Partial<Record<AxisKey, number>>
  /** 那一栏（界面上的「档案」标签） */
  cls?: string
  sigil?: string
  hue?: string
  /** 第一阶段倒下之后顶上来的那一位（图鉴条目 id） */
  next?: string
}

/**
 * 一手落进框架。
 *
 * `slot` 只用来拼 id —— 同一只实体身上四手必须各有各的 id
 * （面板与冷却都按 id 认手，撞了号就是同一手有两个名字）。
 * 到达点另外补上蓄势字段：它兼任这只实体的终结技能，
 * 照样蓄势、照样可以被打算（与 bosses.ts 的 asUlt 同一口径）。
 */
function handSkill(s: EndSpec, h: Hand, slot: string, arch: string, ult: boolean, fx: FxKind) {
  const k = place(arch, {
    id: `end-${s.codex}-${slot}`,
    name: h.name,
    desc: h.desc,
    line: h.line,
    power: h.power,
    // 起手一律打破坏力（那是「它平时怎么动」），到达点写自己那一手最本位的轴
    axis: h.axis ?? (ult ? undefined : '破坏力'),
    fx: h.fx ?? fx,
    target: h.target,
    effect: h.effect,
    turns: h.turns,
  })
  return ult ? { ...k, ult: TUNING.ultCharge, ultBreak: TUNING.ultBreak } : k
}

/** 图鉴条目 id → 上场档案。找不到条目直接炸掉：挂了一个不存在的 id 是写错了 */
function endFoeOf(s: EndSpec): NamedBoss {
  const e = CODEX.find((c) => c.id === s.codex)
  if (!e) throw new Error(`终末图鉴里没有这一条：${s.codex}`)
  const kit = kitOf(e)
  const rated = s.ratedAs ?? e.stage
  const base = enemyAxesAt(rated, { atkMul: TUNING.bossAtkMul, willMul: TUNING.bossWillMul })
  const bias = { ...kit.bias, ...s.bias }
  /* 五轴一律从 tuning 的 enemyAxesAt 取（与现推观测体同一条曲线，
     只是不用时期增幅）—— 再乘套件与实体自己那一点偏置。
     不写 axes 的话 derive 会回退去找 SIDE_AXIS[id]，而图鉴实体不在名录里，
     五轴会整片归零：一只 Stage8 的实体站上来，打不动也挨不住。 */
  const AXES: AxisKey[] = ['破坏力', '敏捷度', '物理抗性', '反现实亲和', '意志力']
  const axes = AXES.map((k) => Math.max(1, Math.round(base[k] * (bias[k] ?? 1)))) as
    [number, number, number, number, number]
  return {
    id: e.id,
    // 名字就是图鉴登记名 —— NO.xxxx 加原文那一栏的写法，不改写
    name: `NO.${e.no} ${e.name}`,
    sigil: s.sigil ?? kit.cls[0]!,
    hue: s.hue ?? kit.hue,
    cls: s.cls ?? kit.cls,
    trait: `${e.origin}　${e.detail}`,
    hpMul: s.hpMul ?? 1,
    axes,
    passive: s.passive ?? kit.passive,
    // null 是「明写没有」，不是「没写」——没写才回退到套件
    guardAxis: s.guardAxis === null ? undefined : (s.guardAxis ?? kit.guardAxis),
    skills: [
      handSkill(s, s.atk, 'atk', s.atk.arch ?? 'basic', false, kit.fx),
      ...kit.skills.map((k, i) => handSkill(s, {
        // 套件那两手挂上它自己的名字：同一类的东西打起来是同一路数，
        // 但牌面上写的是「脏器公寓 · 亡灵 · 群起」还是「星鲸 · 亡灵 · 群起」得看得出来
        name: `${e.name} · ${k.name}`,
        desc: k.desc, line: k.line, power: k.power, axis: k.axis,
        arch: k.arch, effect: k.effect, turns: k.turns,
      }, `kit${i}`, k.arch, false, kit.fx)),
      handSkill(s, s.ult, 'end', s.ult.arch ?? '到达点', true, kit.fx),
    ],
    from: `终末图鉴 No.${e.no}「${e.name}」· ${e.stageKw}（${e.ref}）`,
    codexStage: rated,
    ...(s.next ? { next: s.next } : {}),
  }
}

/* ============================================================
   三、一张一张来
   ------------------------------------------------------------
   顺序按图鉴自己的卷次排，读起来与 codex.ts 对得上。
   ============================================================ */

const SPECS: EndSpec[] = [
  /* ==================== 第 1 卷 ==================== */
  {
    codex: 'soul-reservoir',
    atk: {
      name: '门扉 · 收拢', power: 1.4,
      desc: '它身上那道门对着谁张开，谁就该往里走 ——'
        + '（图鉴 No.3922「以花言巧语夺走灵魂，将其保存于门扉内侧」）。',
      line: '「——」那道门是开着的。它一直都在等着谁走进去。',
    },
    ult: {
      name: '转生的女神 · 全台开放', power: 4.6, target: 'all', axis: '反现实亲和',
      desc: '它把自己扮成的东西整个放出来：本次遭遇的个体「曾胁迫商会製人偶露娜协助收集了数百个灵魂，'
        + '伪装成『转生的女神』诱骗死者」——这一手就是把那副面孔开到最大。',
      effect: { mark: 0.3, slow: 0.25, pushBack: 0.4 },
      line: '「来吧——这里就是你们该去的地方。」',
    },
    passive: {
      name: '门扉内侧',
      desc: '「物理抗性极强，须以超规格冲击一次性压制，避免与其门扉建立接触」（图鉴 counter 一栏）。',
      shield: 0.16,
    },
  },
  {
    codex: 'organ-apt',
    // 名册上写的是 Stage6『动摇』，照收；它是这一场的**第一形态**，
    // 倒下之后由布下它的那个不死者顶上来（见下面的 next）。
    atk: {
      name: '馆内 · 十二处', power: 1.5,
      desc: '「馆内每一具身体的颈椎都以十二处整齐的断裂方式固定」——'
        + '动手的是这座馆本身，不是里面哪一位。',
      line: '「——」又一处脖子，按同一个角度断了下去。',
    },
    ult: {
      name: '脏器公寓 · 同居', power: 4.4, target: 'all', axis: '反现实亲和',
      desc: '「以人类为『容器』豢养终末」：这一手是把在场的人一并算进它的房间数。',
      effect: { mark: 0.3, frail: 0.25, bleed: 0.06 },
      line: '「——」空房间不多了。你们几位，挤一挤。」',
    },
    passive: {
      name: '仪式灾害 · 圣路西亚',
      desc: '「巴塞罗那・圣路西亚公馆。狂热者・格尔生前布下的仪式灾害」——'
        + '仪式没有断，这座馆就没有打完的时候（图鉴 origin 一栏）。',
      regen: 0.03,
    },
    next: 'fanatic-ger',
  },
  {
    codex: 'fanatic-ger',
    // 图鉴 Stage6『动摇』，但它一个人就把联合小队打残过一次，
    // 又是第二形态：比上面那座馆高一档。
    ratedAs: 7,
    atk: {
      name: '言语命令', power: 1.5, axis: '反现实亲和',
      desc: '「以言语命令几乎团灭苍之学园与卡乌斯学院的联合小队」（图鉴 detail 一栏）——'
        + '他的每一句话都算数。',
      effect: { mark: 0.2 },
      line: '「跪下。」',
    },
    ult: {
      name: '不死者 · 无解', power: 4.8, target: 'all', axis: '反现实亲和',
      desc: '「不死之身使其无法被杀死，只能被『放逐』」——'
        + '这一手不解决任何人，它只是把「打不完」这件事摊给在场的人看。',
      effect: { mark: 0.35, frail: 0.3, pushBack: 0.35 },
      line: '「杀掉我？你们连让我停下来都做不到。」',
    },
    passive: {
      name: '不死・魔术师',
      desc: '「不可力敌。需制造物理位置交换，将其放逐到无氧气、无引力的死域」（图鉴 counter 一栏）——'
        + '他在被打到零之前，一直是满的。',
      regen: 0.05,
      endure: 1,
    },
    guardAxis: '意志力',
    next: 'obsidian',
  },
  {
    codex: 'obsidian',
    // 图鉴 Stage5『混乱』，但它接在格尔之后 —— 它是这一场最后揭开的那一层：
    // 「它证明——旧神・天使之律的势力早已渗透进事件的缝隙」（图鉴 detail 一栏）。
    // 于是按 7 站：与上面的格尔同档，收的是这一场真正的底。
    ratedAs: 7,
    atk: {
      name: '黑曜石 · 一瞥', power: 1.6, axis: '反现实亲和',
      desc: '「多数天使对人类文明漠不关心；黑曜石在脏器公寓事件中短暂现身并被击溃」——'
        + '它不恨谁，它只是看了一眼，那一眼就够把这一片判掉。',
      effect: { mark: 0.25 },
      line: '「——」它看了这一片一眼，像是核对一份名单。',
    },
    ult: {
      name: '律纹 · 判', power: 4.8, target: 'all', axis: '反现实亲和',
      desc: '「旧神不可理喻。观测纪律：记录其律纹，任何接触都需上报会长」'
        + '（图鉴 counter 一栏）——这一手是把那条它执行的条文整个摊出来。',
      effect: { mark: 0.4, frail: 0.3, stasis: 1 },
      line: '「——」它念的不是话，是一行规则。',
    },
    passive: {
      name: '渗透进事件的缝隙',
      desc: '「旧神・天使之律的势力早已渗透进事件的缝隙」——'
        + '它不是这场事件的一部分，它是从缝隙里伸进来的那一只手。',
      shield: 0.15,
    },
  },
  {
    codex: 'clay-mask',
    // 图鉴 Stage2『播种』，照收：研究所地下那一次它本来就不算硬，
    // 难的是「触碰者会遭其读取并试图篡夺人格」。
    atk: {
      name: '面具 · 触碰', power: 1.3, axis: '反现实亲和',
      desc: '「触碰者会遭其读取并试图『篡夺人格』占据躯壳」——'
        + '它不动手，它上手。',
      effect: { mark: 0.25 },
      line: '「——」它没有脸。可它凑过来了。',
    },
    ult: {
      name: '人格篡夺 · 换主', power: 3.4, axis: '反现实亲和',
      desc: '「低语者读取到的剧烈噪音反而救了心叶」——'
        + '对读心的人来说这一手是噪音，对别人是换一个人。',
      effect: { mark: 0.35, silence: true, slow: 0.25 },
      line: '「——」那一堆面具一起开口了，喊的是一个坐标。',
    },
    passive: {
      name: '成堆出现',
      desc: '「成堆出现、以坐标心声向人呼救」——打坏一个不算完，它本来就是一堆。',
      shield: 0.08,
    },
  },
  {
    codex: 'guardian',
    atk: {
      name: '守护者 · 猎捕', power: 1.5,
      desc: '「它把误入异界的言万心叶与梅芙视作复兴材料，欲将两人捕猎」（图鉴 detail 一栏）。',
      line: '「——」它弯下来了。它在挑。',
    },
    ult: {
      name: '旧人类 · 粉碎', power: 4.6, target: 'all', axis: '反现实亲和',
      desc: '「数千亿年前旧人类留下的守护者，把被时间冻结的旧人类一一粉碎、'
        + '制成『泥塑面具』以图复活族群」——这一手是它做了几千年的那件事。',
      effect: { mark: 0.3, frail: 0.2, pushBack: 0.4 },
      line: '「——」它把手上那一位，照原样放进了模具里。',
    },
    passive: {
      name: '深海二十万米',
      desc: '「深海 20 万米异界中沉睡的旧人类巨型机械生命体」——'
        + '在它的场子里，它比谁都不急。',
      shield: 0.15,
      spMax: 8,
    },
    next: 'death-god',
  },
  {
    codex: 'death-god',
    // 图鉴 Stage8『大火灾』，照收 —— 它是第 1 卷那一战真正的收尾。
    atk: {
      name: '吞尽 · 遗骸', power: 1.6,
      desc: '「会吞食遗骸无限增殖。必须在脱离异界的瞬间以到达点级攻击一击击破，不可拖延」'
        + '（图鉴 counter 一栏）——它的每一次张嘴都在变重。',
      effect: { bleed: 0.04 },
      line: '「——」它把地上那些一起收了进去。',
    },
    ult: {
      name: '旧人类全体 · 祈愿', power: 5.0, target: 'all', axis: '反现实亲和',
      desc: '「承载着旧人类全体祈愿的畸形神」——'
        + '这一手打出去的是几千亿年攒下来的那一份愿望，不是它的力气。',
      effect: { mark: 0.35, frail: 0.3, pushBack: 0.45 },
      line: '「——」那不是咆哮。那是很多人一起，说了同一句。',
    },
    passive: {
      name: '无限增殖',
      desc: '「吞尽旧人类遗骸、侵蚀整座异界后化作的最终形态」——'
        + '异界里每一具遗骸都算它身上的一块。',
      regen: 0.035,
      shield: 0.12,
    },
  },

  /* ==================== 第 2 卷 ==================== */
  {
    codex: 'deep-hole',
    atk: {
      name: '深穴 · 倒带', power: 1.2, axis: '反现实亲和',
      desc: '「它不是『死亡轮回』，而是『倒带』」——'
        + '死在里头的人会被退回进入之前，连自己死过都不记得。',
      line: '「——」刚才那一下，好像没有发生过。',
    },
    ult: {
      name: '最深层 · 对赌', power: 3.2, target: 'all', axis: '反现实亲和',
      desc: '「心叶与班长兰在此对赌，看谁能先抵达最深层」——'
        + '这一手是这座迷宫本来的玩法：它把「到得了到不了」摊到所有人面前。',
      effect: { mark: 0.25, slow: 0.35, pushBack: 0.3 },
      line: '「——」往下的路又长了一截。',
    },
    passive: {
      name: '学园设施',
      desc: '「在内部死亡并非终结——尸体被带出即可复原至进入前的状态」'
        + '（图鉴 counter 一栏）——它不杀谁，它只是不让你走完。',
      shield: 0.1,
    },
  },
  {
    codex: 'master-craft',
    // 图鉴 Stage7『破坏』。牌面上两处都要它：天空竞技祭（吞下黑之魔王）
    // 与 v4 序章（被达娜厄斩杀、又被骷髅假面之男救走）。两处都不是终局，
    // 所以按 6 站 —— 往上的那一档留给它放出来的那两位。
    ratedAs: 6,
    atk: {
      name: '石化言语', power: 1.5, axis: '反现实亲和',
      desc: '「以石化言语钉住心叶与梅芙」（图鉴 detail 一栏）——'
        + '被那句话点到的，就只剩下站着。',
      effect: { mark: 0.25, slow: 0.3 },
      line: '「站着别动。」',
    },
    ult: {
      name: '开辟者 · 永恒沉默', power: 4.4, target: 'all', axis: '反现实亲和',
      desc: '「『永恒沉默的狂热者』之开辟者，脏器公寓体系的源头不死者」——'
        + '这一手是把那一整套收回来。',
      effect: { mark: 0.3, silence: true, pushBack: 0.35 },
      line: '「——都别说话了。」',
    },
    passive: {
      name: '不死者需放逐',
      desc: '「不死者需放逐而非斩杀；其死后的『遗骸』仍能成为仪式灾害的种子」'
        + '（图鉴 counter 一栏）——他倒下不是结束，是下一件的开始。',
      regen: 0.04,
    },
    next: 'black-maou',
  },
  {
    codex: 'black-maou',
    // 图鉴 Stage5『混乱』，但她是「少数『愿意被说服』的终末」，
    // 牌面上不该比巨匠轻：吞进他肚子里的那一档从这里开始往上走。
    ratedAs: 7,
    atk: {
      name: '影 · 擦过', power: 1.6, fx: 'noise',
      desc: '「影可化作切开大海的巨大怪物」——先过来的只是影子的边。',
      line: '「……你在害怕。」',
    },
    ult: {
      name: '终末『混乱』', power: 5.0, target: 'all', axis: '反现实亲和',
      desc: '「他的身体从正面承受住了最新型的导弹的冲击」、'
        + '「被次元裂缝贯穿了黑之魔王的身体」后仍存活反杀 —— 她把这一份硬度整个压上来。',
      effect: { mark: 0.35, frail: 0.3, pushBack: 0.4 },
      line: '「——这样的结局，绝不是我的终末！」',
    },
    passive: {
      name: '影之巨人',
      desc: '「自囚于『施害者 / 恶 / 魔王』之位，期盼宇宙毁灭」——'
        + '她的躯壳只是外壳，真正在动的是影。',
      shield: 0.2,
      regen: 0.03,
    },
    next: 'hundred-wings',
  },
  {
    codex: 'hundred-wings',
    // 图鉴 Stage5『混乱』。「旧神系需人类抵达『斩击』级别的自觉才能正面对抗」——
    // 它接在黑之魔王之后，是天空竞技祭那一场最后压上来的东西，于是按 8 站。
    ratedAs: 8,
    atk: {
      name: '缝合的嘴 · 齐声', power: 1.6, axis: '反现实亲和',
      desc: '「满身缝合的嘴、遮天蔽日的羽翼」——它开口的时候，整片天都暗下来。',
      line: '「——」那些嘴一起动了。',
    },
    ult: {
      name: '旧神 · 百翼临', power: 5.2, target: 'all', axis: '反现实亲和',
      desc: '「它于黑之魔王降临之际现身，为会场再添混乱」——'
        + '这一手是把整个会场一并算进它的羽翼底下。',
      effect: { mark: 0.4, frail: 0.3, stasis: 1 },
      line: '「——」遮下来的那一片，不是云。',
    },
    passive: {
      name: '天使之律 · 二级',
      desc: '「『永恒沉默的狂热者』所信仰的二级天使之一」——'
        + '它不是来帮谁的，它是来看的：看完了再决定谁该被带走。',
      shield: 0.18,
    },
  },

  /* ==================== 第 3 卷 ==================== */
  {
    codex: 'chain-detective',
    atk: {
      name: '锁链 · 拖', power: 1.4, axis: '破坏力', fx: 'slash',
      desc: '侦探不带枪：她带的是那根锁链，以及它系着的那个结论。',
      line: '「——」锁链在那一段距离里绷直了。',
    },
    ult: {
      name: '因果 · 互相残杀', power: 4.2, target: 'all', axis: '反现实亲和',
      desc: '「能力是令半径 10 米内被因果分为『杀人者/被害者』互相残杀」——'
        + '这一手不需要她动手，她只需要把这一圈画完。',
      effect: { mark: 0.4, frail: 0.25, },
      line: '「——」圈子画完了。现在，谁是杀人者？',
    },
    passive: {
      name: '下级侦探「废道昏暗」',
      desc: '「为拯救死灵次元压境的故乡，背叛协会向樱次元示警」——'
        + '她站到对面来，本来就是为了被处理掉。',
      acc: 0.12,
    },
  },
  {
    codex: 'rose-detective',
    atk: {
      name: '蔷薇 · 木桩', power: 1.5, fx: 'slash', axis: '破坏力',
      desc: '「首击是一根鲜红木桩」——第一下从来是它。',
      effect: { bleed: 0.04 },
      line: '「——」一根红的，先钉了下来。',
    },
    ult: {
      name: '处决 · 每说一句', power: 4.2, target: 'one', axis: '破坏力',
      desc: '「她每说一句，便引来一根新的鲜红长矛贯穿对方身体」（详见图鉴 detail 一栏）——'
        + '她的话说到第几句，就是第几根。',
      effect: { pierce: true, bleed: 0.08, frail: 0.25 },
      line: '「——第一句。」',
    },
    passive: {
      name: '只履行职责',
      desc: '「对樱次元的存亡并无立场，只履行职责」（图鉴 detail 一栏）——'
        + '她不会追，也不会放，她只是把该做完的做完。',
      acc: 0.1,
    },
  },
  {
    codex: 'cape-mouth',
    atk: {
      name: '巨口 · 吸', power: 1.4, axis: '反现实亲和',
      desc: '「看似巨口的深洞，通往『另一个世界』」——它的每一次「吸」都是那道口在张。',
      effect: { pushBack: 0.25 },
      line: '「——」底下的风是往上来的。',
    },
    ult: {
      name: '喜望峰 · 请君入瓮', power: 4.2, target: 'one', axis: '反现实亲和',
      desc: '「骷髅假面之男曾诱露娜跳入。露娜拒绝跳入——她没有舍弃与心叶共度的现在」——'
        + '这一手是那道口最后的邀请。',
      effect: { mark: 0.35, stasis: 1, pushBack: 0.5 },
      line: '「——」它张得更开了。跳下来就好了。',
    },
    passive: {
      name: '不可窥探其底部',
      desc: '「不可窥探其底部。是连接异次元的稳定裂缝，需委员会与异厅共同布防」'
        + '（图鉴 counter 一栏）——它本来就不是能「打完」的东西。',
      shield: 0.14,
    },
  },
  {
    codex: 'death-fleet',
    atk: {
      name: '舰队 · 舷侧', power: 1.5,
      desc: '「操控亡灵的武装舰队，是『不死技术』的军事化」——'
        + '一排舷侧对过来，死掉的那些还在照着命令装填。',
      line: '「——」那一排炮口转过来的时候，船上没有一个人。',
    },
    ult: {
      name: '死灵次元 · 压境', power: 4.2, target: 'all', axis: '反现实亲和',
      desc: '「死灵次元跨越次元压境樱次元的亡灵舰队」——'
        + '这一手不是它一艘船的事，是整条战线一起往前压的那一下。',
      effect: { mark: 0.3, slow: 0.3, pushBack: 0.35 },
      line: '「——」海平线上那一排，又多了。',
    },
    passive: {
      name: '共同幻想是它的克星',
      desc: '「以共同幻想（百鬼夜行）对抗死灵操法最为有效」（图鉴 counter 一栏）——'
        + '常规火力对它只是把船打漏。',
      shield: 0.12,
    },
    next: 'sky-castle',
  },
  {
    codex: 'sky-castle',
    // 图鉴给三件东西同评 Stage4『活性化』——它们是同一场入侵的三件。
    // 牌面上按叙述推进分开站：舰队主战、浮游城压制、蝴蝶那一拍是
    // 「东京防卫战中最接近全灭的一刻」，所以三形态一路往上。
    ratedAs: 5,
    atk: {
      name: '头骨 · 死亡光束', power: 1.6, axis: '反现实亲和',
      desc: '「其头骨每隔 5 分钟释放一道死亡光束」（图鉴 detail 一栏）——'
        + '它不是每一拍都在打，它是每一拍都在等那五分钟。',
      effect: { pierce: true },
      line: '「——」那头骨上的眼窝亮起来了。',
    },
    ult: {
      name: '浮游城 · 全炮门', power: 4.6, target: 'all', axis: '反现实亲和',
      desc: '「死灵次元入侵时于津轻海峡上空展开的浮游要塞」——'
        + '这一手是把整座要塞对着下面那一块地开。',
      effect: { mark: 0.35, frail: 0.25, pushBack: 0.4 },
      line: '「——」津轻海峡上空那一片，全亮了。',
    },
    passive: {
      name: '高空目标',
      desc: '「需高机动弹痕持有者拦截主炮」——够不着它的人，只能挨它。',
      shield: 0.16,
    },
    next: 'red-butterfly',
  },
  {
    codex: 'red-butterfly',
    ratedAs: 6,
    atk: {
      name: '磷粉 · 腐雾', power: 1.6, axis: '反现实亲和',
      desc: '「其腐雾将人类溶解成无脸怪物」——'
        + '它不咬人，它只是把粉撒下来。',
      effect: { bleed: 0.06, mark: 0.15 },
      line: '「——」粉落下来的地方，站着的那个已经没有脸了。',
    },
    ult: {
      name: '上野 · 羽化', power: 5.0, target: 'all', axis: '反现实亲和',
      desc: '「于上野上空羽化展开的死灵灾厄」、'
        + '「是东京防卫战中最接近『全灭』的一刻」——这一手就是那一刻。',
      effect: { mark: 0.4, frail: 0.3, bleed: 0.06 },
      line: '「——」翅膀张开的时候，天是红的。',
    },
    passive: {
      name: '磷粉扩散',
      desc: '「此后苍之学园的精锐仍持续死守并抑制着磷粉扩散」——'
        + '它的伤不在场上，在它走了以后。',
      regen: 0.025,
    },
  },
  {
    codex: 'strange-king',
    // 图鉴 Stage0『种子』，那是「尚未解明／封印中」的分类，不是它的出力 ——
    // 「借万仙阵重现神仙时代的环境……数亿万人的古老的灵魂」写的是规模。
    ratedAs: 7,
    atk: {
      name: '万仙阵 · 一', power: 1.5, axis: '反现实亲和',
      desc: '「借万仙阵重现神仙时代的环境」——'
        + '它每一次出手，都是那一座阵里走出来的一位。',
      line: '「——」阵里走出一个来。后面还站着很多。',
    },
    ult: {
      name: '数亿万人 · 如雨', power: 5.0, target: 'all', axis: '反现实亲和',
      desc: '「『数亿万人的古老的灵魂』为复活一个怪异而全部聚集，自富士山如雨点般洒落东京，'
        + '为人类争取了重整的时间」——这一手砸的是整座城。',
      effect: { mark: 0.35, frail: 0.3, pushBack: 0.45 },
      line: '「——」富士山那边，下起来了。',
    },
    passive: {
      name: '只能协商',
      desc: '「不可消灭共同幻想，只能协商。怪异之王是『可以被说服』的存在」'
        + '（图鉴 counter 一栏）——打到最后一刻，它也没有非死不可的理由。',
      endure: 1,
      shield: 0.15,
    },
  },
  {
    codex: 'star-whale',
    // 图鉴 Stage10『终焉』——全书最高的一档，照收。
    atk: {
      name: '星鲸 · 横渡', power: 1.7, axis: '反现实亲和',
      desc: '「全长仅 100 米，却自原初宇宙（直径约 30 公里）横渡星河而来」——'
        + '它撞过来的那一下，是很多年的路。',
      effect: { pushBack: 0.3 },
      line: '「——」它没有减速。',
    },
    ult: {
      name: '回家的路', power: 5.2, target: 'all', axis: '反现实亲和',
      desc: '「它不是想毁灭，而是在找回家的路」——这一手是它把那份找不到的东西整个放出来。',
      effect: { mark: 0.4, frail: 0.35, stasis: 1 },
      line: '「——」那一声里有一件事，是它在问方向。',
    },
    passive: {
      name: '不可用暴力清除',
      desc: '「须以『理解』与其指向共鸣——这是低语者与共奏者的领域」'
        + '（图鉴 counter 一栏）——拳头对它只是把它推得更远。',
      shield: 0.25,
      endure: 1,
    },
  },

  /* ==================== 第 4 卷 ==================== */
  {
    codex: 'thread-person',
    atk: {
      name: '因果之线 · 拨', power: 1.6, axis: '反现实亲和',
      desc: '「拥有操纵『因果之线』、轮回不死与空间置换之力」——'
        + '它不砍人，它拨线：拨过的地方，后果自己会到。',
      effect: { mark: 0.2 },
      line: '「——」有什么被拨了一下。',
    },
    ult: {
      name: '宇宙最强的贤者', power: 5.0, target: 'all', axis: '反现实亲和',
      desc: '「全长约 3500 米，自称『宇宙最强的贤者』——委员会眼中的最大威胁」、'
        + '「扬言『下次一定要杀了终末』」——这一手是它把自己那一套摊开。',
      effect: { mark: 0.35, frail: 0.3, pushBack: 0.4 },
      line: '「——下一次，我要杀了终末。」',
    },
    passive: {
      name: '轮回不死',
      desc: '「不死者不可斩杀——只能『契约』。残响的盟剑提供一生一次绝对公平的决斗权，'
        + '是其唯一破绽」（图鉴 counter 一栏）。',
      regen: 0.045,
      endure: 1,
    },
    next: 'purple-tree',
  },
  {
    codex: 'purple-tree',
    // 图鉴 Stage1『始源』——它是「已化为秩序」，本就不是照着打的东西。
    // 但牌面上它是线之人之后顶上来的那一具：汲取线之人遗骸长成的世界树，
    // 于是按它借来的那一份能量站（8）。
    ratedAs: 8,
    atk: {
      name: '紫叶 · 落', power: 1.6, axis: '反现实亲和',
      desc: '「巨匠以自身为苗，汲取线之人遗骸的能量覆盖篝火之国长成的世界树」——'
        + '它落下来的每一片叶子，都是别人身上的东西。',
      effect: { mark: 0.2 },
      line: '「——」一片叶子落下来，落在谁身上谁就慢一拍。',
    },
    ult: {
      name: '沉默之律', power: 5.2, target: 'all', axis: '反现实亲和',
      desc: '「立下『沉默之律』：从此该地再无时间旅行、无人能操纵人类。'
        + '为失去回溯能力的线之人设下死局，也确立了世界的自律」——'
        + '这一手是那条法则本身压下来。',
      effect: { mark: 0.4, silence: true, stasis: 1 },
      line: '「——」从这一刻起，这里不认回头路。',
    },
    passive: {
      name: '它本身就是一条法则',
      desc: '「持续运转、无需战斗处置；档案旧标『收容』已不合用——它本身就是一条新的世界法则」'
        + '（图鉴 counter 一栏）。',
      shield: 0.22,
      regen: 0.03,
    },
  },

  /* ==================== 第 5 卷 ==================== */
  {
    codex: 'residue',
    // 图鉴 Stage2『播种』——它确实不嗜杀。但牌面上这一场是它撑起来的
    // 试炼宇宙（「以心叶『十七年的幸福记忆』为素材，构建了另一个真鹤町」），
    // 所以按中段那一档站：它不杀你，它留你。
    ratedAs: 6,
    atk: {
      name: '试炼宇宙 · 一页', power: 1.5, axis: '反现实亲和',
      desc: '「接触者会被拖入以『实现你的愿望』为名的试炼宇宙」——'
        + '它的每一手都是一页：翻过去，你就更想留在这儿。',
      effect: { mark: 0.25, slow: 0.25 },
      line: '「——」又翻过了一页。这一页上，你还没有离开。',
    },
    ult: {
      name: '另一个真鹤町', power: 4.4, target: 'all', axis: '反现实亲和',
      desc: '「在那里，心叶是普通学生、有妹妹、有日常」——'
        + '这一手是那个世界整个摊开：它不逼你，它只是把门开着。',
      effect: { mark: 0.35, frail: 0.25, stasis: 1 },
      line: '「——留下来也可以的。这里什么都有。」',
    },
    passive: {
      name: '极尽温柔的终末',
      desc: '「它不嗜杀，只让人『选择』。唯一的危险，是你自己愿意留在梦里」'
        + '（图鉴 counter 一栏）。',
      shield: 0.16,
    },
    // 「授予心叶加护【残响的盟剑】后，她仍在运转，并未消散」——
    // 打完之后她还在，所以它的收场不是「清除」，是这一场结束了。
    guardAxis: '意志力',
  },

  /* ==================== 第 6 卷 ==================== */
  {
    codex: 'emilya',
    // 图鉴登记 Stage6『动摇』，但 detail 一栏写着「最终形态升至 Stage10『终焉』：
    // 与数兆次元同化」——她是这一整部的收尾，牌面上按 9 站。
    ratedAs: 9,
    atk: {
      name: '注视着你', power: 1.7, axis: '反现实亲和',
      desc: '片羽「注视着你」——被她看着的那一处，已经在她的名单上了。',
      effect: { mark: 0.25 },
      line: '「——我看见了。你也在里面。」',
    },
    ult: {
      name: '我会让所有人，都获得幸福', power: 5.2, target: 'all', axis: '反现实亲和',
      desc: '「以『我会让所有人，都获得幸福』之名统一全人类，只身挑战宇宙根源」——'
        + '这一手没有恶意，那才是最难办的地方。',
      effect: { mark: 0.4, frail: 0.3, slow: 0.3 },
      line: '「——大家都进来吧。外面那么冷。」',
    },
    passive: {
      name: '与数兆次元同化',
      desc: '「最终形态升至 Stage10『终焉』：与数兆次元同化，运作年限最多不过约 2000 年」——'
        + '打在她身上的一下，是打在那一片里的。',
      shield: 0.24,
      regen: 0.03,
    },
    next: 'emilya-box',
  },
  {
    codex: 'emilya-box',
    // 图鉴 Stage2『播种』，那是这台生体计算机**本体**的定级。
    // 「位于哥伦比亚大学地下服务器室中央，是她同化计划的基石、也是遗骸的安放处」——
    // 作为第二形态，它按这一场真正的收尾站（10）。
    ratedAs: 10,
    atk: {
      name: '箱 · 增殖', power: 1.7, axis: '反现实亲和',
      desc: '「艾美莉亚自制的生体计算机，具备无限增殖能力」——'
        + '你打掉的那个个体，是从这个箱子里长出来的。',
      effect: { mark: 0.2 },
      line: '「——」箱子里又长出一个来。还是那张脸。',
    },
    ult: {
      name: '从未破开', power: 5.2, target: 'all', axis: '反现实亲和',
      desc: '「心叶以『a Session.』与失去五感的艾美莉亚相融，在精神世界吞食她的个体——'
        + '从未破开此箱」——这一手是那个箱子扣上的声音。',
      effect: { mark: 0.4, frail: 0.35, stasis: 1 },
      line: '「——」盖子合上了。里面还有那么多。',
    },
    passive: {
      name: '无限增殖',
      desc: '「她最终成了活在『艾美莉亚之箱』与人们神经之中的一个完全的概念」——'
        + '这个概念不怕拳头。',
      regen: 0.05,
      shield: 0.2,
      endure: 1,
    },
  },

  /* ==================== 外传 S1 ==================== */
  {
    codex: 'cherax',
    /* 图鉴 Stage4『活性化』，照收 —— 但它是全表里最薄的一只，这是照图鉴来的：
       counter 一栏写着「消灭并不困难（一发吉他即可）；困难在于识别并唤醒被拖入噩梦者」，
       所以血量压到同危险度首领的一半，破绽也不挂（它不「打不穿」，它只是难找）。
       它与 v6 那几位正相反：那几位的难处是打不动，它的难处是打之前得先醒过来。 */
    hpMul: 0.5,
    guardAxis: null,
    atk: {
      name: '魇视 · 一瞥', power: 1.2, axis: '反现实亲和',
      desc: '「拥有反现实性质的鳌虾，体长约 15 厘米」——'
        + '被它看过的那一下不疼，疼的是接下来那一觉。',
      effect: { mark: 0.2 },
      line: '「——」那只虾只有十五厘米。可它已经在你的梦里了。',
    },
    ult: {
      name: '噩梦中下的令', power: 3.4, target: 'all', axis: '反现实亲和',
      desc: '「会让半径 10 米内睡眠的对象看见自己『最恐惧的东西』，并在噩梦中对其下令——'
        + '一旦照办，对象便完全变成『最恐惧之物』的模样。副队长米拉即因此沦为丧尸」'
        + '（图鉴 detail 一栏）——这一手不伤人，它只是把那一句命令说给你听。',
      effect: { mark: 0.35, silence: true, slow: 0.3 },
      line: '「——」睡吧。睡着了我再告诉你该做什么。',
    },
    passive: {
      name: '梦里那一个不是你',
      desc: '「困难在于识别并唤醒被拖入噩梦者」（图鉴 counter 一栏）——'
        + '它先换掉站在你旁边的那个人，再让那一个来打你。',
      acc: 0.12,
    },
  },
]

/**
 * 图鉴实体表 —— 键是图鉴条目 id（与 codex.ts 同一套键），
 * 与 NAMED_BOSSES 合成同一个查找口（见 bosses.ts 的 namedBossOf）。
 */
export const END_FOES: Record<string, NamedBoss> = Object.fromEntries(
  SPECS.map((s) => [s.codex, endFoeOf(s)]),
)
