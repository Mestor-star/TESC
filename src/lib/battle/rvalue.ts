/* ============================================================
   地点 R 值 → 敌方强度
   ------------------------------------------------------------
   原文口径（lore.ts「R 值与恒常性」/ regions.ts 表头）：
     R 值（反现实干涉指数）正常区间约 0.95 ~ 1.05；越低，该处现实越薄、
     反现实干涉越强，终末越容易显形。codex 亦载：低 R 值地带会压制
     「高 R 存在」（凯特琳在拉普达低 R 地带迎战恋兔光）。
   于是同一级的实体，站在越不像「正常世界」的地方，就越难对付 ——
   这不是敌人变强了，是那条街本身已经站到了它那边。

   做法：
     · 地点名先对 REGIONS（原文标定的观测点）取读数；
     · 对不上（任务模板里那些原文只一笔带过的场所）就由危险度推算一个，
       并在界面上标明「推算」，不冒充原文数据。
     · 偏离正常区间的量 `out` → 只抬高敌人的血量与「反现实亲和」，
       不动它的攻击与充能：现实变薄是让「打不死」和「更抽象」，
       不是让它出手更快更重 —— 攻击侧的平衡因此不被这条设定掀翻。
   ============================================================ */

import { REGIONS } from '../../data/regions'
import { TUNING } from './tuning'

/** R 值正常区间的下沿（低于它即为「现实变薄」） */
export const R_NORMAL_LO = 0.95
/** R 值正常区间的上沿（高于它即为「现实过厚」） */
export const R_NORMAL_HI = 1.05

export interface RReading {
  /** 该地当前 R 值 */
  r: number
  /** 分区代码（推算的记 EST-） */
  code: string
  /** 读数来源：原文标定的观测点 / 由危险度推算 */
  known: boolean
  /** 一句话说明（给界面挂牌用） */
  note: string
}

/**
 * 地点名 → 观测点。任务模板里的地点写法与 REGIONS 的正式名未必逐字相同
 * （「第6区工房街」对「第 6 区 · 工房街」），故按「关键地名 + 区号」双条件比对。
 */
function regionOf(place: string): (typeof REGIONS)[number] | undefined {
  const norm = (s: string) => s.replace(/[\s·・，,、]/g, '')
  const p = norm(place)
  const zone = (p.match(/第(\d+)区/) ?? [])[1]
  // 先按「区号相同且关键地名命中」找，找不到再退回只看关键地名
  const hit = REGIONS.find((g) => {
    const n = norm(g.name)
    const gz = (n.match(/第(\d+)区/) ?? [])[1]
    const key = n.split('第')[0]
    return (!!key && p.includes(key)) && (!zone || !gz || zone === gz)
  })
  return hit ?? REGIONS.find((g) => {
    const key = norm(g.name).split('第')[0]
    return !!key && p.includes(key)
  })
}

/**
 * 地点 R 值。
 * 原文标定过的地点直接取读数；没标定的按危险度推算 ——
 * 危险度越高，该处越是「现实薄」的地方，故 R 值随 stage 单调下滑。
 */
export function rOfPlace(place: string, stage = 1): RReading {
  const g = regionOf(place)
  if (g) return { r: g.r, code: g.code, known: true, note: g.note }
  const r = Math.max(0.84, Math.min(1.02, 1.0 - Math.max(0, stage) * TUNING.rEstPerStage))
  return {
    r: Math.round(r * 1000) / 1000,
    code: `EST-${String(Math.max(0, Math.round(stage))).padStart(2, '0')}`,
    known: false,
    note: '本地点未列入光明会侦察网的标定表，R 值由该处危险度推算。',
  }
}

/**
 * 偏离量：超出正常区间多少（区间内记 0）。
 * 「与正常值相差越大」即此值越大 —— 不论现实变薄还是过厚。
 */
export function rOutOf(r: number): number {
  if (r < R_NORMAL_LO) return R_NORMAL_LO - r
  if (r > R_NORMAL_HI) return r - R_NORMAL_HI
  return 0
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

/** 界面挂牌：`FLK-06W · 0.902 · 低R +19%` */
export function rBadgeOf(place: string, stage = 1): { text: string; reading: RReading; f: RFactor } {
  const reading = rOfPlace(place, stage)
  const f = rFactor(reading.r)
  const pct = Math.round((f.mul - 1) * 100)
  const tag = f.out === 0 ? '正常' : `${f.kind} ${pct >= 0 ? '+' : ''}${pct}%`
  return { text: `${reading.code} · ${reading.r.toFixed(3)} · ${tag}`, reading, f }
}
