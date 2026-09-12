/* ============================================================
   地点 R 值 → 敌方强度
   ------------------------------------------------------------
   原文口径（lore.ts「R 值与恒常性」/ types.ts 头）：
     R 值（反现实干涉指数）正常为「1」，**高于 1.02 或低于 0.98 即为异常**（V2 第2话，梅芙），
     两侧同判：
     偏低 → 该处现实薄、反现实干涉强，终末容易显形；
     偏高 → 现实过厚，是「高 R 存在」的主场。
     codex 亦载：低 R 值地带会压制「高 R 存在」（凯特琳在拉普达低 R 地带迎战恋兔光）。
     两侧偏离得越远，这地方就越站在敌人那边 —— 不是敌人变强，是这条街本身不站在正常世界里。
   于是同一级的实体，站在越不像「正常世界」的地方，就越难对付 ——
   这不是敌人变强了，是那条街本身已经站到了它那边。

   做法（取值次序不得颠倒）：
     · 地点名先对 CANON_R（原文**明写了数**的地方）取读数 —— 深海异界 0.99→0.97→0.89、
       深穴 0.967、线之人内部 30.55。原文给了数就读原文的数，标 CN-，界面挂「原文」；
     · 再对 REGIONS（侦察网标定表，天空都市那六区）取读数，标 FLK-，界面挂「标定」；
     · 都对不上（任务模板里那些原文只一笔带过的场所）才由**现场终末**推算一个，
       标 EST-，界面挂「推算」，不冒充实测数据。
       **有终末的地方，R 值必有变动** —— 现场分级取自 manifestOf：
       本段要对付的终末（entities）＋ 在场名册里的人型终末（cast），取最高一级。
       于是开场那艘漂在太平洋上的货船不再读成 1.000：黑之魔王就在甲板上，
       她以反现实的终末扰乱着那片海 —— 那里现实偏薄，R 值该往下走。
     · 偏离正常区间的量 `out` → 只抬高敌人的血量与「反现实亲和」，
       不动它的攻击与充能：现实变薄是让「打不死」和「更抽象」，
       不是让它出手更快更重 —— 攻击侧的平衡因此不被这条设定掀翻。
   ============================================================ */

import { canonReadingOf, currentStop } from '../../data/rreadings'

import { CODEX, resolveEntityToCodexId } from '../../data/codex'
import { REGIONS } from '../../data/regions'
import { SIDE_POTENTIAL, SIDE_TRAIT } from '../../data/roster'
import { R_NORMAL_HI, R_NORMAL_LO, rOutOf } from '../../data/types'
import { TUNING } from './tuning'

/* 正常区间与偏离量的定义在 data/types.ts（唯一真源），这里只再导出一次便于本域引用 */
export { R_NORMAL_HI, R_NORMAL_LO, rOutOf }

export interface RReading {
  /** 该地当前 R 值 */
  r: number
  /** 读数挂牌：侦察网标定为分区代码（FLK-xx）、推算记 EST-xx、原文实测写该地短名 */
  code: string
  /** 读数是否实测（原文或标定表）；false = 由危险度推算 */
  known: boolean
  /** 一句话说明（给界面挂牌用） */
  note: string
  /** 出处细分：canon 原文实测 / table 侦察网标定表 / est 推算 */
  src: 'canon' | 'table' | 'est'
  /** 原文一路读数（仅 canon） */
  series?: { r: number; naxa: number | null; quote: string }[]
  /** 纳克萨指数（原文同批报出时才有） */
  naxa?: number | null
  /** 原文引句与出处（仅 canon） */
  quote?: string
  book?: string
  /** 超出六占式盘量程（仅 canon，如线之人内部 30.55） */
  over?: boolean
}

/**
 * 读数出处挂牌：原文 / 标定 / 推算 —— 三种读数在界面上必须分得开。
 * src 缺省 = 标定表（REGIONS 那六区），这是 RegionReading 的默认出身；
 * 推算的读数由 rOfPlace 显式标 'est'，不会漏。
 */
export function rSourceTag(rd: Pick<RReading, 'src'>): string {
  return rd.src === 'canon' ? '实读' : rd.src === 'est' ? '推算' : '标定'
}

/**
 * 地点名 → 观测点。
 * 观测点的正式名由「区号 + 地名」两段组成（「苍之学园 · 第12区 本校舍」），
 * **两段都得在待查地点里出现**才算命中。
 * 早先只按前缀认，于是「苍之学园 · 恋兔宿舍」「苍之学园 · 异端审问室」
 * 全被当成本校舍，拿本校舍的读数冒充那些地方的读数 —— 这不是标定，是张冠李戴。
 */
export function regionOfPlace(place: string): (typeof REGIONS)[number] | undefined {
  const norm = (s: string) => s.replace(/[\s·・，,、]/g, '')
  const p = norm(place)
  const tokens = (name: string) => norm(name).split(/(?=第\d+区)/).filter(Boolean)
  return REGIONS.find((g) => {
    const ts = tokens(g.name)
    return ts.length > 0 && ts.every((t) => p.includes(t))
  })
}

/** 抹掉空白与分隔符 —— 与 regionOfPlace 用同一把尺子，两处对同一串字的判断才分得开 */
const squash = (s: string) => s.replace(/[\s·・，,、]/g, '')

/**
 * 剧情里用惯的叫法 → 标定表那一格。
 * 这些名字与标定表**毫无字面重叠**，靠前缀、靠区号都认不出来，只能点名认。
 * 只收**确凿同址**的：写作「女神神殿 · 第 6 区近郊」的那一处就是「女神神殿遗址 · 第 6 区近郊」；
 * 「恋兔宿舍」在剧情里本就以「苍之学园 · 恋兔宿舍」的写法出现过，与前半截那把尺子认出来的是同一格。
 * 拿不准的（如「第13区 · 骨之圣堂」）宁可空着 —— 见下面 mapRegionOf 的口径。
 */
const PLACE_ALIASES: Array<[string, string]> = [
  ['女神神殿', 'ruin'],
  ['恋兔宿舍', 'gcn'],
]

/**
 * 地点名 → 总览那张观测点示意图上的哪一格；没有落点的返回 null。
 *
 * **宁可不标，也不指错地方** —— 这张图只管「亮点落在谁身上」，不供读数
 * （读数一律走 regionOfPlace / rOfPlace 那条严格的口径，认不出来就挂牌「推算」）。
 * 所以这里可以比读数松，但松得有据：
 *   ① 严格尺子（regionOfPlace：区号与地名两段都得对上）；
 *   ② 别名表（剧情叫法与标定表名字对不上，但确是同一处）；
 *   ③ 按地名前半截认（「苍之学园 · 学生会室」→ 苍之学园那一区），多个候选取前半截最长的。
 *
 * 比字面之前先 squash 抹平空白：标定表写「第 6 区」（区号中间带空格），
 * 剧情里写「第6区」「第6区竞技场」「第6区 · 各地」—— 不抹平的话后者一个都落不到第 6 区的两点上，
 * 而它们在图上是同一个地方。regionOfPlace 本来就是抹平了比的，这里没理由另用一把尺子。
 */
export function mapRegionOf(place: string): string | null {
  if (!place) return null
  const strict = regionOfPlace(place)
  if (strict?.xy) return strict.id
  const seg = squash(place.split('·')[0] ?? '')
  if (seg) {
    const stems = REGIONS.filter((g) => g.xy).map((g) => ({ id: g.id, s: squash(g.name.split('·')[0] ?? '') }))
    const exact = stems.find((x) => x.s && x.s === seg)
    if (exact) return exact.id
    const byStem = stems
      .filter((x) => x.s && seg.includes(x.s))
      .sort((a, b) => b.s.length - a.s.length)[0]?.id
    if (byStem) return byStem
  }
  const p = squash(place)
  return PLACE_ALIASES.find(([k]) => p.includes(squash(k)))?.[1] ?? null
}

/** 现场的终末清单 */
export interface SiteTerminals {
  /** 现场终末的最高分级（0 = 现场没有已登记的终末） */
  stage: number
  /** 现场终末的登记名，按分级从高到低 */
  names: string[]
  /** 与最高级同名次的「关键词」，挂牌用（如 『混乱』）；无终末时为空串 */
  stageKw: string
}

const STAGE_NUM = /Stage\s*(\d+)/

/**
 * 这一段现场有哪些终末、最高几级 —— **有终末的地方，R 值必有变动**，所以要从两处一起点：
 *   · entities：本段要对付／正在显形的那个终末，取图鉴登记值；
 *   · cast：在场名册里的**人型终末**（SIDE_POTENTIAL 登记过 Stage 的人）。
 *     人型终末的终末本体即其自身，走到哪儿就把终末带到哪儿 —— 开场的黑之魔王
 *     （No.5000 · Stage5『混乱』）正是此类：她只是站在甲板上，那片海就已经不是正常世界了。
 *     名册里其余人是弹痕／斩击／片羽／加护的持有者，**不是终末**，故不计
 *     （口径见 roster.ts：没有终末的人就没有终末潜力）。
 * 取最高的一级作该段的现场分级：终末的显露由最强的那个定义，
 * 其余同场终末只记名、不叠加 —— 两个 Stage5 不等于一个 Stage10。
 * 「根据实际情况计算 R 值」取的就是这个数：**不能拿卷号当危险度** ——
 * 卷号说的是讲到第几本书，不是此刻这条街有多危险。
 * （『未解明』记 −1，比不过 0，自动落到「现场无已登记终末」。）
 */
export function manifestOf(ev: { entities?: string[]; cast?: string[] }): SiteTerminals {
  const found: { stage: number; kw: string; name: string }[] = []
  for (const ent of ev.entities ?? []) {
    const id = resolveEntityToCodexId(ent)
    const e = id ? CODEX.find((x) => x.id === id) : undefined
    if (e) found.push({ stage: e.stage, kw: e.stageKw, name: `No.${e.no}「${e.name}」` })
  }
  for (const c of ev.cast ?? []) {
    const pot = SIDE_POTENTIAL[c]
    const m = pot ? STAGE_NUM.exec(pot) : null
    if (!m) continue
    const nm = SIDE_TRAIT[c]
    // 登记名可能是「终末「黑之魔王」」，也可能兼着武装（「片羽「…」 / 终末「…」」）——只取终末那一段
    const only = nm && nm.includes('终末') ? (nm.split(' / ').find((s) => s.includes('终末')) ?? nm) : nm
    found.push({ stage: Number(m[1]), kw: (pot.split('「')[1] ?? '').replace('」', ''), name: only ? `${only}（${pot}）` : pot })
  }
  found.sort((a, b) => b.stage - a.stage)
  const stage = found.length ? Math.max(0, found[0].stage) : 0
  return {
    stage,
    names: found.filter((f) => f.stage === stage).map((f) => f.name),
    stageKw: found.length && found[0].stage > 0 ? `『${found[0].kw}』` : '',
  }
}

/** 只取现场分级（不关心是谁在场的调用点用） */
export function stageOfEvent(ev: { entities?: string[]; cast?: string[] }): number {
  return manifestOf(ev).stage
}

/**
 * 「高 R 存在」的驻地。
 * 同一份危险度，落在不同性质的街上会推向**相反**两侧：终末显形之处现实偏薄，
 * 而高 R 存在群聚之处现实偏厚（学园与委员会就是这样的地方 —— 恋兔光本人即高 R 存在）。
 * 两侧都算出区间就是异常，且偏离越远危险度越高，见 data/types.ts 的 rOutOf。
 */
const HIGH_R_GROUND = /苍之学园|委员会|研究所|宿舍|会议室|审讯室|审问室|学生会室|集市|竞技场|深穴|大堂|走廊|纽约|时代广场|哥伦比亚大学|自由女神像/

/**
 * 地点 R 值。取值次序不许颠倒：**原文实测 → 侦察网标定表 → 按现场终末推算**。
 * 原文写明了数的地方（CANON_R）就读原文那个数：深海异界一路 0.99 → 0.97 → 0.89、
 * 深穴 0.967、线之人内部 30.55 —— 拿推算值盖掉书上写明的读数，是把实测当成估算。
 * 标定表命中（REGIONS 六区）取表里的读数。
 * 两者都对不上才推：偏离量 = 现场最高分级 × TUNING.rEstPerStage，
 * 偏离方向看这地方的性质（见 HIGH_R_GROUND），并附上原文的定性旁注（CANON_QUAL）——
 * 「拉普达 R 值也低的厉害」这类只有话没有数的地方，照着那句话判方向，数还是推的，挂牌仍是「推算」。
 * 现场无终末（stage 0）就不偏离：1.000 不是「没算」，是「这里确实没有终末在动」。
 * 2 级起出区间、6 级上下判重度 —— 这个梯度由 TUNING.rEstPerStage 与正常区间宽窄共同决定，
 * 别在这里另写常数。names 只进备注（是谁在这儿），不参与算数：叠加两个终末会算出不存在的级数。
 */
export function rOfPlace(place: string, stage = 0, names: string[] = []): RReading {
  const c = canonReadingOf(place)
  if (c) {
    const cur = currentStop(c)
    const over = c.over === true
    /* 备注只说这地方意味着什么 —— 不解释取值过程、不提出处（终端读数就是终端读数） */
    const note = c.note
    return {
      r: cur.r,
      code: c.short,
      known: true,
      src: 'canon',
      note,
      series: c.stops.map((s) => ({ ...s })),
      naxa: [...c.stops].reverse().find((s) => s.naxa != null)?.naxa ?? null,
      quote: cur.quote,
      book: c.book,
      over,
    }
  }
  const g = regionOfPlace(place)
  if (g) return { r: g.r, code: g.code, known: true, src: 'table', note: g.note }
  const lv = Math.max(0, Math.min(10, Math.round(stage)))
  const dev = lv * TUNING.rEstPerStage
  const hi = HIGH_R_GROUND.test(place)
  const r = Math.round(Math.max(0.84, Math.min(1.16, hi ? 1 + dev : 1 - dev)) * 1000) / 1000
  const head = '本地点未列入光明会侦察网的标定表'
  const who = names.length
    ? `现场有 ${names.join('、')}`
    : '现场未见已登记的终末'
  const note = !lv
    ? `${head}，${who} —— 未检出现实密度偏移，读数按常态 1.000 记。`
    : hi
      ? `${head}。${who}；此处又是「高 R 存在」的驻地，现实偏厚 —— `
        + `R 值由常态 1.000 向高侧偏离 ${dev.toFixed(3)}（Stage ${lv} × ${TUNING.rEstPerStage}）。`
      : `${head}。${who}，终末显露之处现实偏薄 —— `
        + `R 值由常态 1.000 向低侧偏离 ${dev.toFixed(3)}（Stage ${lv} × ${TUNING.rEstPerStage}）。`
  return { r, code: `EST-${String(lv).padStart(2, '0')}`, known: false, src: 'est', note }
}

export interface RFactor {
  /** 偏离量为 0 时 = 1 */
  mul: number
  out: number
  /** 低 R（现实薄 · 反现实显形）/ 高 R（现实过厚 · 高 R 存在的主场）/ 正常 */
  kind: '低R' | '高R' | '正常'
  /** 一句话：这处地方把它抬高了几成 */
  word: string
}

/** 偏离量 → 敌方增幅（只用于血量与反现实亲和，见文件头） */
export function rFactor(r: number): RFactor {
  const out = rOutOf(r)
  const raw = 1 + out * TUNING.rGain
  const mul = Math.max(TUNING.rMulMin, Math.min(TUNING.rMulMax, raw))
  const kind: RFactor['kind'] = r < R_NORMAL_LO ? '低R' : r > R_NORMAL_HI ? '高R' : '正常'
  const pct = Math.round((mul - 1) * 100)
  const word = !out
    ? '现实密度在正常区间内，实体未受该地加成。'
    : kind === '低R'
      ? `现实偏薄（低 R），此处的反现实实体更凝实：血量与亲和 +${pct}%。`
      : `现实过厚（高 R），此处的「高 R 存在」更盛：血量与亲和 +${pct}%。`
  return { mul, out, kind, word }
}

/** 界面挂牌：`FLK-06W · 0.902 · 低R +19%` / `CN-DS7 · 0.890 · 低R +26%` */
export function rBadgeOf(place: string, stage = 1, names: string[] = []): { text: string; reading: RReading; f: RFactor } {
  const reading = rOfPlace(place, stage, names)
  const f = rFactor(reading.r)
  const pct = Math.round((f.mul - 1) * 100)
  /* 量程外的读数不折成百分比：30.55 那档印成「+40%」是在撒谎，只挂牌不折算 */
  const tag = reading.over
    ? '量程外'
    : f.out === 0 ? '正常' : `${f.kind} ${pct >= 0 ? '+' : ''}${pct}%`
  return { text: `${reading.code} · ${reading.r.toFixed(3)} · ${tag}`, reading, f }
}
