/* ============================================================
   任务简报 · 看板重掷
   ------------------------------------------------------------
   任务不再是一张写死的表：以「已收束的事件数」为种子随机拼装，
   剧情每推进一段，看板自然换血；也可手动点「刷新看板」立刻重掷。
   拼装件（地点 / 性质 / 摘要 / 酬劳）全部取自原文出现过的场所与
   事件类型，不新造地名；同一 seed 必得同一批任务（可复现）。
   ============================================================ */

import type { Mission } from '../../data/types'

interface Template {
  key: string
  place: string
  nature: string
  title: string
  desc: string
  /** 推荐小队的候选（中文名，取自名录） */
  pool: string[]
  reward: string[]
  /** 该模板适合的危险度区间 */
  stages: [number, number]
}

const TEMPLATES: Template[] = [
  {
    key: 'shrine',
    place: '女神神殿遗址 · 第 6 区近郊',
    nature: '残渣型 · 再聚拢观察',
    title: '神殿遗址 · 残留反现实清点',
    desc: '灵魂蓄积器TM 被讨伐后的清点区。被砸成碎屑的「女神」脚下，细碎的反现实仍在缓慢聚拢。'
      + '逐片编号归档后移交观测科——趁它们还没重新连成一片。',
    pool: ['梅芙莉莎', '露娜', '小柴喵呜', '小柴琳'],
    reward: ['残渣采样归档', 'R 值回升'],
    stages: [1, 4],
  },
  {
    key: 'workshop',
    place: '第 6 区 · 工房街',
    nature: '流通型 · 反现实旧物',
    title: '工房街 · 商会制品盯梢',
    desc: '境界领域商会的制品正在工房街暗中流通，反现实机械的嗡鸣比昨日更近。'
      + '确认交货节点后一网打尽——切记：只收人，不碰货。',
    pool: ['梅芙莉莎', '恋兔光', '弗恩・西蒙', '伊西斯・哈利德'],
    reward: ['切断一条商会流通线', '商会接头人情报'],
    stages: [2, 6],
  },
  {
    key: 'market',
    place: '第 12 区 · 旧集市',
    nature: '残留型 · 低语源',
    title: '旧集市 · 反现实旧物清缴',
    desc: '东侧早已无人光顾的集市里，反现实旧物残留着轻微的「低语」，野狗在成排卷帘门前游荡。'
      + '逐间排查卷帘门后的旧物，趁低语尚未连成一片前清缴归档。',
    pool: ['小柴喵呜', '露娜', '勇鱼义人', '东夷草次郎'],
    reward: ['旧物归档一批', '低语源暂时哑火'],
    stages: [1, 3],
  },
  {
    key: 'organ',
    place: '第 4 区 · 脏器公寓',
    nature: '异端 · 讨伐',
    title: '脏器公寓 · 不死者狂热者余党',
    desc: '曾在脏器公寓掀起血案的狂热者残党，又在那栋会呼吸的楼里聚了起来。'
      + '本次许可：交战、讨伐、清场。',
    pool: ['恋兔光', '蕾雅・库尔・杜・琉米爱尔', '凯特琳・安・奥斯汀', '小柴喵呜'],
    reward: ['狂热者残党覆灭', '脏器公寓恢复观测'],
    stages: [4, 8],
  },
  {
    key: 'ship',
    place: '太平洋公海 · 货船',
    nature: '异端 · 魔王',
    title: '公海货船 · 「黑之魔王」观测',
    desc: '同型货船上再次观测到异样 R 值。上级指令为「禁止交战、仅记录」——'
      + '但一旦她抬手，规则就由不得委员会了。',
    pool: ['露娜', '梅芙莉莎', '黑之魔王', '言万心叶'],
    reward: ['魔王行踪记录', '太平洋观测线更新'],
    stages: [7, 10],
  },
  {
    key: 'arena',
    place: '第 6 区 · 天空竞技祭会场',
    nature: '反现实机械工学 · 灵魂保存型',
    title: '竞技祭会场 · 灵魂保存装置拆除',
    desc: '祭典散场后，看台底下还压着一台没来得及运走的保存装置。'
      + '拆解时务必小心——里面可能还有没被放出来的东西。',
    pool: ['梅芙莉莎', '小柴琳', '弗恩・西蒙', '玛丽娅'],
    reward: ['装置完整回收', '灵魂流动体样本'],
    stages: [5, 9],
  },
  {
    key: 'bonfire',
    place: '篝火之国 · 边境',
    nature: '龙花 · 异界',
    title: '篝火之国 · 异界裂隙巡查',
    desc: '篝火之国坠落后留下的裂隙仍未闭合。那边吹来的风带着龙花的味道，'
      + '巡查途中若遇上走过来的东西——先问它从哪来。',
    pool: ['伊=雷格', '蕾雅・库尔・杜・琉米爱尔', '艾梅・库尔・杜・琉米爱尔', '胡道乃梦'],
    reward: ['裂隙坐标测绘', '龙花样本'],
    stages: [6, 10],
  },
  {
    key: 'archive',
    place: '异端审问室 · 黑档库',
    nature: '未分类 · 观测记录',
    title: '黑档库 · 涂改残页复读',
    desc: '黑名单残页上的涂改又变了一次。「倒着走的人，会先到」——'
      + '委员会决定派人现场复读，看看这一页到底是谁在改。',
    pool: ['露娜', '艾莉芙・安纳托利亚', '吴诗涵', '胡道乃梦'],
    reward: ['残页复读记录', '旧档编号拼图'],
    stages: [6, 10],
  },
  {
    key: 'coast',
    place: '第 3 区 · 旧海岸线',
    nature: '低语 · 再聚合',
    title: '旧海岸线 · 低语聚合体清除',
    desc: '退潮后的滩涂上，低语正沿着旧防波堤聚成一个人形。'
      + '在它彻底站起来之前把它拆散。',
    pool: ['小柴喵呜', '恋兔光', '梅尔文・格蕾', '亚历克斯・凯夫'],
    reward: ['聚合体瓦解', '海岸线观测点复位'],
    stages: [3, 7],
  },
  {
    key: 'ruin',
    place: '第 9 区 · 塌陷带',
    nature: '反现实残渣 · 高密度',
    title: '塌陷带 · 高密度残渣压制',
    desc: '塌陷带下方的残渣密度高到能让邻近街区的重力读数抖起来。'
      + '这活儿需要能扛的人——以及能把它按住的人。',
    pool: ['亚历克斯・凯夫', '达娜厄・惠特摩尔', '神流奈奈', '凯特琳・安・奥斯汀'],
    reward: ['重力读数复位', '高密度残渣封存'],
    stages: [5, 9],
  },
]

/** 32 位可复现伪随机（xorshift） */
function rng(seed: number): () => number {
  let x = (seed | 0) || 0x2f6e2b1
  return () => {
    x ^= x << 13; x |= 0
    x ^= x >>> 17
    x ^= x << 5; x |= 0
    return ((x >>> 0) % 100000) / 100000
  }
}

const pick = <T,>(rnd: () => number, arr: T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length]

const DURATION = [
  '今晚 23:00 换班', '今日 21:00 交班', '48 小时内 · 越晚越难办',
  '本日内 · 观测窗很短', '72 小时内 · 允许延期一次', '即刻出发',
]

/**
 * 重掷一批任务。
 * @param seed  以「已收束事件数」为主，叠加手动刷新的计数
 * @param count 看板条数
 */
export function genBoard(seed: number, count = 5): Mission[] {
  const rnd = rng(seed * 2654435761)
  const pool = [...TEMPLATES]
  const out: Mission[] = []
  for (let i = 0; i < count && pool.length; i++) {
    const t = pool.splice(Math.floor(rnd() * pool.length) % pool.length, 1)[0]
    const [lo, hi] = t.stages
    const stage = lo + Math.floor(rnd() * (hi - lo + 1))
    const crew: string[] = []
    const cp = [...t.pool]
    const n = Math.min(cp.length, 2 + Math.floor(rnd() * 2))
    while (crew.length < n && cp.length) crew.push(cp.splice(Math.floor(rnd() * cp.length) % cp.length, 1)[0])
    out.push({
      id: `gen-${t.key}-${seed}-${i}`,
      no: `MST-${String(100 + ((seed * 37 + i * 13) % 800)).padStart(3, '0')}`,
      title: t.title,
      place: t.place,
      stage,
      nature: t.nature,
      recommend: crew,
      status: stage >= 7 ? '锁定' : stage <= 2 ? '待接取' : '待接取',
      deadline: pick(rnd, DURATION),
      desc: t.desc,
      reward: t.reward,
    })
  }
  return out.sort((a, b) => b.stage - a.stage)
}
