/**
 * 原文实测的 R 值读数
 * ------------------------------------------------------------
 * 侦察网标定表（data/regions.ts）只覆盖天空都市·弗尔克图斯那六区；
 * 但**部分地点是原文明写了数的** —— 卷一守护者那一段，梅芙一边下潜一边报读数，
 * 一路 0.99（纳克萨 82.4）→ 0.97（80.2）→ 0.89。深穴报过 0.967。
 * 那些地方不该再让终端「按危险度推算」：原文给了数，就该读原文的数。
 *
 * 于是取值次序（见 lib/battle/rvalue.ts 的 rOfPlace）：
 *   ① 本表命中     → 读原文的数（挂牌写地名本身）
 *   ② REGIONS 命中 → 侦察网标定表读数（FLK-xx）
 *   ③ 都没命中     → 按现场终末推算（EST-xx）
 * 界面只印读数与一句这地方意味着什么，不解释取值过程、不提出处。
 *
 * 纳克萨指数：原文与 R 值成对报出（「R值是现实的强度指标。纳克萨指数是R值的变动程度。」），
 * 故一并留档 —— 有数的照记，没报的记 null，不拿 0 冒充。
 */

/** 原文沿途的一档读数 */
export interface CanonStop {
  /** 该处的 R 值 */
  r: number
  /** 同批报出的纳克萨指数（现实易变程度）；原文没报记 null */
  naxa: number | null
  /** 原文原句（逐字摘录） */
  quote: string
}

/** 一处原文明写过的读数 */
export interface CanonReading {
  id: string
  /** 正式观测名 */
  name: string
  /**
   * 挂牌短名。
   * 这些地方不在天空都市的分区表上（没有 FLK- 区号），也不该现编一个 ——
   * 挂了号就等于宣称它在侦察网的分区体系里，那是编的。故挂牌写地名本身。
   */
  short: string
  /** 地点名命中规则（对战段落的 place 串） */
  match: RegExp
  /** 原文一路读数，末档 = 交战当时的读数 */
  stops: CanonStop[]
  /** 出处 */
  book: string
  /** 一句话说明（挂牌/备注用） */
  note: string
  /** 读数已超出六占式盘的量程（原文如此，照记不缩） */
  over?: boolean
}

export const CANON_R: CanonReading[] = [
  {
    id: 'deepsea',
    name: '深海异界 · 守护者之域',
    short: '深海异界',
    match: /深海|守护者之域|20\s*万米/,
    stops: [
      { r: 0.99, naxa: 82.4, quote: '「R值0.99。纳克萨指数82.4。」' },
      { r: 0.97, naxa: 80.2, quote: '「R值0.97。纳克萨指数80.2」' },
      { r: 0.89, naxa: null, quote: '「R值0.89。这说明我们所在的地方——比起现实已经更接近幻想了。」' },
    ],
    book: 'V1 第 7 话',
    note: '比起现实，这里已经更接近幻想。',
  },
  {
    id: 'noapusa',
    name: '苍之学园 第12区 · 深穴',
    short: '深穴',
    match: /深穴|noapusa/i,
    stops: [
      { r: 0.967, naxa: null, quote: '「真的欸。现在的R值是0.967。比刚才略微升高了。你是怎么知道的？」' },
    ],
    book: 'V2 第 2 话',
    note: '现实比常态薄一线 —— 有什么东西正在观测这里。',
  },
  {
    id: 'itomono',
    name: '篝火之国地下 · 「线之人」内部',
    short: '线之人',
    match: /线之人|巨人的内部/,
    stops: [
      {
        r: 30.55, naxa: null,
        quote: '「『线之人』的内部R值和篝火密度都过高，因此会扰乱距离以及时间的法则。」',
      },
    ],
    book: 'V4 第 2 话 / 第 8 话',
    over: true,
    note: '读数远超六占式盘量程 —— 这里的距离与时间都不作数了。',
  },
]

/** 地点名 → 原文实测读数（未命中返回 undefined） */
export function canonReadingOf(place: string): CanonReading | undefined {
  return CANON_R.find((c) => c.match.test(place))
}

/** 末档（交战当时）的读数 */
export function currentStop(c: CanonReading): CanonStop {
  return c.stops[c.stops.length - 1]
}
