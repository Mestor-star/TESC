/* ============================================================
   科研树 —— 书架曼荼罗那一侧的知识交易
   ------------------------------------------------------------
   设定口径：委员会与「书架曼荼罗」（无限图书馆 · 四司书，见 lore 的 lf-kyoten）
   换知识的门路一直是通的 —— 主人在 v5 里就是搭那条门路去的。这里把它落成**研究室**：
   拿观测攒下的东西去换别人的目录，换回来的不是新武器，是**全队都受用的一层读数**。

   三条线，各自对上一件原文里就有的东西：
     · 反现实解析 —— 反现实实体为什么打不穿、怕哪条轴。对上的是「反现实」「终末等级」；
     · 武装改良   —— 军械录与商会的成品怎么用才不浪费。对上的是「弹痕 / 斩击 / 片羽」与
                     「灵魂蓄积器TM」「人造仿生人类观测套件」（见 lore 的 lf-guild）；
     · 体能训练   —— 面板那一半里最土的两项：站得住、扛得下。对上的是「终末等级」的分级。

   ⚠️ 这里只有**数据**：研究点怎么来、档位怎么算、存档怎么写，全在 lib/research.ts。
   ⚠️ 加节点只往这张表里加 —— 别在界面或引擎里另写一份系数（那张表是唯一的出处）。
   ============================================================ */

/**
 * 三条线。
 * `sub` 是线上那一句话，`note` 是「读它换回来的是什么」—— 界面两处都要摆，别只摆名字。
 */
export type ResearchLineId = '反现实解析' | '武装改良' | '体能训练'

/**
 * 一个节点给全队的那一份加成。
 * 字段与 `lib/research.ts` 的 `researchBonus()` **一一对应**（那边是把全树的同类项加起来）：
 *   · atk         —— 攻击（`atkMulOf` 那条加法链，与装具 / 增益同一处）
 *   · hp          —— 最大生命
 *   · resPhysical —— 物理抗性（既减伤，也经 hpPerResist 再抬一点生命）
 *   · aff         —— 反现实亲和
 * 写比例，不写绝对值：绝对值会被阶段与时期系数吞掉，比例不会。
 */
export interface ResearchEffect {
  atk?: number
  hp?: number
  resPhysical?: number
  aff?: number
}

export interface ResearchNode {
  id: string
  name: string
  line: ResearchLineId
  /** 层（1~4）。界面按层排，成本也按层走。 */
  tier: 1 | 2 | 3 | 4
  /** 研成它要花的研究点 */
  cost: number
  /** 前置节点 id（没写 = 线上第一层） */
  require?: string
  effect: ResearchEffect
  /** 一句话。原文语气，不写「科技树」那套黑话。 */
  desc: string
}

export const RESEARCH_LINES: { id: ResearchLineId; sub: string; note: string }[] = [
  {
    id: '反现实解析',
    sub: '反现实的东西为什么打不穿',
    note: '读它换回来的不是新招，是「它怕哪条轴」这件事本身 —— 全队的反现实亲和一起往上抬。',
  },
  {
    id: '武装改良',
    sub: '军械录与商会的成品，怎么用才不算浪费',
    note: '弹痕、斩击、片羽都是别人做出来的东西；知道它为什么长这样，落下去的那一下才不白花。',
  },
  {
    id: '体能训练',
    sub: '站得住、扛得下',
    note: '最土的那两项。反现实不跟人讲道理，那就把自己练到挨得住它讲的那几句。',
  },
]

export const RESEARCH: ResearchNode[] = [
  /* —— 反现实解析 ——
     反现实实体的「打不穿」在原作里从来不是血厚，是没人知道它怕什么；
     读出来的每一条都是**对手身上少一层壳**，所以这一线加亲和。 */
  {
    id: 'parse-rite', name: '观测仪轨', line: '反现实解析', tier: 1, cost: 5,
    effect: { aff: 0.015 },
    desc: '委员会发下来的那套观测仪轨，队里谁都当格式在读；仪轨本身是照着反现实那一侧写下的，读熟了，出手就落在它身上。',
  },
  {
    id: 'parse-remain', name: '残留解析', line: '反现实解析', tier: 2, cost: 8,
    require: 'parse-rite',
    effect: { aff: 0.02 },
    desc: '打完一场留下的残渣，是唯一能反复读的样本 —— 散了一地的东西，比重整过的老实。',
  },
  {
    id: 'parse-whisper', name: '低语登记', line: '反现实解析', tier: 2, cost: 9,
    require: 'parse-rite',
    effect: { aff: 0.015 },
    desc: '低语者读到的那些心声，本来就称得上是原件；把原件按目录登进研究室，值钱的是目录。',
  },
  {
    id: 'parse-grade', name: '终末分级比照', line: '反现实解析', tier: 3, cost: 12,
    require: 'parse-remain',
    effect: { aff: 0.025 },
    desc: '终末等级是一把量尺。拿它去比照实体，高出几级的那些，队里就照着那一级的打法出手。',
  },
  {
    id: 'parse-density', name: '现实密度换算', line: '反现实解析', tier: 4, cost: 18,
    require: 'parse-grade',
    effect: { aff: 0.025 },
    desc: '单位面积里还剩多少现实，是算得出来的。算出来之后，反现实的东西就不再是无解的 —— 它只是贵。',
  },

  /* —— 武装改良 ——
     口径：改的是「这门东西本身的规格」（与 gearAtk 同一条加法链），
     所以是攻击那一栏，不是命中那一栏 —— 命中在引擎里走被动，不在这一层。 */
  {
    id: 'arm-care', name: '枪械养护', line: '武装改良', tier: 1, cost: 5,
    effect: { atk: 0.015 },
    desc: '军械录上的每一件东西都有人保养，可没人按着它本来的用法保养 —— 按着用法来，同一发子弹会重一点。',
  },
  {
    id: 'arm-ballistic', name: '弹道标定', line: '武装改良', tier: 2, cost: 8,
    require: 'arm-care',
    effect: { atk: 0.02 },
    desc: '反现实里的弹道会歪。标定不是把歪的掰直，是把歪掉的那一截事先算进去。',
  },
  {
    id: 'arm-edge', name: '白刃再研磨', line: '武装改良', tier: 2, cost: 9,
    require: 'arm-care',
    effect: { atk: 0.015 },
    desc: '斩击那一路的道理最短：刃口钝一分，落下去就差一截。研一遍，队里每一把都跟着重一点。',
  },
  {
    id: 'arm-optics', name: '观测套件改装', line: '武装改良', tier: 3, cost: 12,
    require: 'arm-ballistic',
    effect: { atk: 0.025 },
    desc: '商会卖的人造仿生人类观测套件，拆开重装一遍：看得清的地方，打出去的那一下也跟着清楚。',
  },
  {
    id: 'arm-accumulator', name: '蓄积器 · 反照', line: '武装改良', tier: 4, cost: 18,
    require: 'arm-optics',
    effect: { atk: 0.03 },
    desc: '灵魂蓄积器TM 的回路反着读一遍 —— 它收走的东西怎么走，照着那条路把队里的出力推回去。',
  },

  /* —— 体能训练 ——
     这一线是面板上最土的两项：生命与物理抗性。
     物理抗性在 derive 里一头管减伤、一头管生命（hpPerResist），所以它每次都给得比别的小。 */
  {
    id: 'body-drill', name: '晨间体能', line: '体能训练', tier: 1, cost: 5,
    effect: { hp: 0.03 },
    desc: '委员会给每个人排的体能表，从前只在登记簿上占一行 —— 真照着练，挨得住的那几下是会变的。',
  },
  {
    id: 'body-march', name: '负重行军', line: '体能训练', tier: 2, cost: 8,
    require: 'body-drill',
    effect: { hp: 0.03 },
    desc: '背着全副装具走完一整条海岸线。装具本来就是给人背的，背不动的人打不动。',
  },
  {
    id: 'body-tolerance', name: '耐性检定', line: '体能训练', tier: 2, cost: 9,
    require: 'body-drill',
    effect: { resPhysical: 0.03 },
    desc: '耐性检定那份表不是拿来筛人的 —— 量出来差在哪一格，那一格就可以练。',
  },
  {
    id: 'body-bulwark', name: '防壁演练', line: '体能训练', tier: 3, cost: 12,
    require: 'body-march',
    effect: { hp: 0.03, resPhysical: 0.02 },
    desc: '架盾那一下是练出来的，不是想出来的：盾举得住的人，才轮得到他替后面的人挡。',
  },
  {
    id: 'body-grade', name: '终末耐性 · 分级', line: '体能训练', tier: 4, cost: 18,
    require: 'body-bulwark',
    effect: { hp: 0.05, resPhysical: 0.02 },
    desc: '照终末等级一级一级往上练：哪一级的东西能把人怎么样，练过的人心里有数，身上也有。',
  },
]
