import type { CSSProperties } from 'react'
import css from './BattleFx.module.css'

/* ============================================================
   攻击动效 · 每个角色一手一张脸
   ------------------------------------------------------------
   原文依据与逐条对照见同目录 BattleFx.notes.md（每位角色一行，摘句给到文件与行号）。
   三层：
     ① FX_SPEC   —— 「族」的默认参数（形状即分类：斩＝斜线、射＝直线、爆＝圆、
                    雷＝折线、重力＝向内、治愈＝向上、声波＝同心弧……）；
     ② FX_CHAR   —— **点名到招式**的覆写：同一族的两个人靠斜角、残影密度、
                    收刀余韵（afterglow）与色温（tint）分出是谁打的；
     ③ familyOf  —— 没登记的走词根猜族，再落到 FxKind，最后 neutral（永不空白）。
   节点预算：普通一族 ≤ 40，招牌招最多 120（见 FX_CHAR 里各条的层数）。
   全 CSS（transform / opacity / filter / clip-path），不加依赖、不加图片。
   ============================================================ */

export type FxFamily =
  | 'slash' | 'shot' | 'blast' | 'thunder' | 'gravity'
  | 'heal' | 'support' | 'break' | 'sound' | 'neutral'

export interface FxSpec {
  /** 整段时长（ms）。比回放的 620ms 长的那几招要在 notes 里写明（收刀余韵） */
  dur: number
  bands: number
  ghosts: number
  rings: number
  shards: number
  dots: number
  zigzags: number
  chevrons: number
  flash: boolean
  vignette: boolean
  /** 收手之后还留着的一层余光（ms）—— 同一族里「谁的余韵更长」就靠它 */
  afterglow?: number
  /** 刀势的斜角（deg）—— 两个人用刀也走不同的角度 */
  angle?: number
  /** 本色覆写（只在登记过的招式上写，颜色仍取自 tokens） */
  tint?: string
  /** 命中定格（ms ≤ 60）：这几帧画面定住，血与数字都还没翻 —— 一击的重量在这儿。
     2026-09-19 收口径：镜头语言（推近/旋转/整屏位移）全部撤掉 —— 那是眩晕的来源；
     重量改由「定格 + 材质层次 + 时序」承担。 */
  hitstop?: number
}

export const FX_SPEC: Record<FxFamily, FxSpec> = {
  slash: { dur: 420, bands: 1, ghosts: 3, rings: 0, shards: 0, dots: 0, zigzags: 0, chevrons: 0, flash: false, vignette: false },
  shot: { dur: 380, bands: 1, ghosts: 0, rings: 0, shards: 0, dots: 6, zigzags: 0, chevrons: 0, flash: false, vignette: false },
  blast: { dur: 560, bands: 0, ghosts: 0, rings: 2, shards: 8, dots: 4, zigzags: 0, chevrons: 0, flash: false, vignette: false },
  thunder: { dur: 460, bands: 0, ghosts: 0, rings: 0, shards: 0, dots: 5, zigzags: 2, chevrons: 0, flash: true, vignette: false },
  gravity: { dur: 640, bands: 0, ghosts: 0, rings: 1, shards: 0, dots: 8, zigzags: 0, chevrons: 0, flash: false, vignette: true },
  heal: { dur: 620, bands: 0, ghosts: 0, rings: 1, shards: 0, dots: 9, zigzags: 0, chevrons: 0, flash: false, vignette: false },
  support: { dur: 640, bands: 0, ghosts: 0, rings: 1, shards: 0, dots: 0, zigzags: 0, chevrons: 4, flash: false, vignette: false },
  break: { dur: 520, bands: 0, ghosts: 0, rings: 0, shards: 9, dots: 0, zigzags: 0, chevrons: 0, flash: false, vignette: false },
  sound: { dur: 520, bands: 0, ghosts: 0, rings: 3, shards: 0, dots: 5, zigzags: 0, chevrons: 0, flash: false, vignette: false },
  neutral: { dur: 360, bands: 1, ghosts: 0, rings: 0, shards: 0, dots: 2, zigzags: 0, chevrons: 0, flash: false, vignette: false },
}

/* 每个角色 1~2 手招牌：族给形状，这一张给「是谁」。
   字段与 FX_SPEC 同形 —— 只写要覆写的那几格，其余跟族走。
   原文依据见 notes 的「每位角色一行」那张表；没有原文依据的写「族兜底」。 */
const FX_CHAR: Record<string, FxSpec> = {
  /* 恋兔光 —— 引擎吉他：赤红尾焰、斜上喷流、收在琴音里（blast + 双环 + 长余光） */
  'nyau-atk': { ...FX_SPEC.blast, dur: 760, bands: 0, rings: 2, shards: 12, dots: 10, angle: -38, afterglow: 900,
    tint: 'var(--red)' },
  'nyau-burst': { ...FX_SPEC.blast, dur: 900, rings: 3, shards: 18, dots: 16, afterglow: 1200, tint: 'var(--red)', hitstop: 55 },
  /* 小柴喵呜 —— 尖啸之枪：一条细直的冷白脉冲，弹壳往后抛（shot） */
  'hikari-atk': { ...FX_SPEC.shot, dur: 520, dots: 12, afterglow: 420, tint: 'color-mix(in srgb, var(--steel) 55%, #fff)' },
  'hikari-burst': { ...FX_SPEC.thunder, dur: 640, zigzags: 3, dots: 10, afterglow: 520 },
  'hikari-wall': { ...FX_SPEC.support, dur: 700, chevrons: 6, rings: 2 },
  'hikari-heal': { ...FX_SPEC.heal, dur: 760, dots: 16, rings: 2, afterglow: 700 },
  /* 言万心叶 / 梅芙 —— 电锯：斜角更陡、残影更密，落下去的时候带一道短横切 */
  'mefisa-atk': { ...FX_SPEC.slash, dur: 560, ghosts: 6, angle: -34, afterglow: 520, tint: 'var(--amber)' },
  'mefisa-cannon': { ...FX_SPEC.shot, dur: 620, dots: 14, rings: 1, afterglow: 480 },
  'mefisa-armor': { ...FX_SPEC.support, dur: 720, chevrons: 5, rings: 2 },
  /* 达娜厄 —— 太刀：更薄更长、角度更平，色温偏青（冷刀） */
  'danae-atk': { ...FX_SPEC.slash, dur: 620, ghosts: 5, angle: -16, afterglow: 700,
    tint: 'color-mix(in srgb, var(--steel) 62%, #fff)' },
  'danae-crush': { ...FX_SPEC.blast, dur: 700, rings: 2, shards: 14, afterglow: 640 },
  /* 黑之魔王 / 混沌 —— 吞光：向内收、暗角更重 */
  'kuro-atk': { ...FX_SPEC.gravity, dur: 820, dots: 18, rings: 2, afterglow: 900 },
  'kuro-burst': { ...FX_SPEC.gravity, dur: 960, dots: 24, rings: 2, flash: false, afterglow: 1100 },
  'kuro-chain': { ...FX_SPEC.break, dur: 680, shards: 14, afterglow: 600 },
  /* 虎田 / 露娜 —— 断钢：一刀见底，残影收得快 */
  'huda-atk': { ...FX_SPEC.slash, dur: 480, ghosts: 4, angle: -42, afterglow: 380 },
  'luna-atk': { ...FX_SPEC.slash, dur: 500, ghosts: 4, angle: -8, afterglow: 460 },
  'luna-blade': { ...FX_SPEC.slash, dur: 700, ghosts: 8, angle: -22, afterglow: 800,
    tint: 'color-mix(in srgb, var(--violet) 60%, #fff)' },
  /* 玛吉娜 —— 钉刺 / 长枪：点状命中，钉进去那一下有一点停顿感 */
  'majina-atk': { ...FX_SPEC.slash, dur: 460, ghosts: 2, angle: -58, afterglow: 320 },
  'majina-nail': { ...FX_SPEC.shot, dur: 460, dots: 9, afterglow: 380 },
  'majina-long': { ...FX_SPEC.break, dur: 620, shards: 12 },
  /* 玛利亚 / 梅尔文 —— 声：同心弧更密、亮度更柔 */
  'maria-song': { ...FX_SPEC.sound, dur: 760, rings: 5, dots: 12, afterglow: 900 },
  'merwen-atk': { ...FX_SPEC.sound, dur: 620, rings: 4, dots: 8 },
  /* 凯瑟琳 —— 火：扁环 + 往上舔的焰点 */
  'katherine-flame': { ...FX_SPEC.blast, dur: 760, rings: 1, shards: 6, dots: 16, afterglow: 800,
    tint: 'var(--amber)' },
  /* 首领们的招牌（敌人也要认得出是谁打的） */
  'boss-maou-sea': { ...FX_SPEC.gravity, dur: 980, dots: 28, rings: 2, afterglow: 1200 },
  'boss-mask-vast': { ...FX_SPEC.gravity, dur: 880, dots: 20, rings: 2, vignette: true },
  'boss-danae-cut': { ...FX_SPEC.slash, dur: 700, ghosts: 7, angle: -20, afterglow: 760 },
  'boss-katherine-burst': { ...FX_SPEC.blast, dur: 820, rings: 3, shards: 16, afterglow: 900 },
  'boss-merwen-step': { ...FX_SPEC.shot, dur: 560, dots: 12, afterglow: 460 },
  'boss-youshihan-hundun': { ...FX_SPEC.gravity, dur: 1000, dots: 30, rings: 2, afterglow: 1100 },
}

/** 按 skillId 点名 → 族。表是唯一事实来源。 */
const FX_TABLE: Record<string, FxFamily> = {
  'nyau-atk': 'blast', 'nyau-burst': 'blast',
  'huda-atk': 'slash', 'huda-end': 'slash',
  'luna-atk': 'slash', 'luna-blade': 'slash',
  'danae-atk': 'slash', 'danae-crush': 'slash',
  'mefisa-atk': 'slash', 'mefisa-cannon': 'shot', 'mefisa-burst': 'shot', 'mefisa-armor': 'support',
  'hikari-atk': 'shot', 'hikari-burst': 'thunder', 'hikari-wall': 'support', 'hikari-heal': 'heal',
  'kuro-burst': 'gravity', 'kuro-atk': 'gravity', 'kuro-chain': 'break',
  'boss-maou-sea': 'gravity', 'boss-maou-despair': 'gravity',
  'boss-mask-vast': 'gravity', 'boss-youshihan-hundun': 'gravity',
  'merwen-atk': 'sound', 'merwen-gray': 'gravity', 'maria-song': 'sound', 'maria-encore': 'sound',
  'majina-atk': 'slash', 'majina-long': 'break', 'majina-nail': 'shot',
  'emei-atk': 'support', 'emei-guard': 'support', 'emei-order': 'support',
  'katherine-flame': 'blast', 'katherine-burst': 'blast',
  'boss-danae-cut': 'slash', 'boss-danae-hunt': 'slash',
  'boss-merwen-step': 'shot', 'boss-merwen-portal': 'gravity',
  'boss-katherine-guard': 'support', 'boss-katherine-burst': 'blast',
  'boss-phidra-read': 'support',
}

const BY_NAME: Array<[RegExp, FxFamily]> = [
  [/斩|刀|刃|锯|裂|切|断/, 'slash'],
  [/枪|炮|射|弹|贯|狙|尖啸|钉/, 'shot'],
  [/爆|炸|焰|炎|燃|烧|炮火|轰鸣/, 'blast'],
  [/雷|电|闪|轰响|震击/, 'thunder'],
  [/黑|暗|混沌|渊|坍|坠|重|虚|吞/, 'gravity'],
  [/愈|治|回复|奶|息/, 'heal'],
  [/歌|音|声|和弦|奏|吟|共鸣/, 'sound'],
  [/盾|壁|护|鼓舞|支援|阵|界/, 'support'],
  [/破|碎|锈|锁|崩|解/, 'break'],
]

const BY_KIND: Record<string, FxFamily> = {
  slash: 'slash', guitar: 'sound', blast: 'blast', noise: 'gravity',
  drone: 'shot', seal: 'support', guard: 'support', heal: 'heal',
}

export function familyOf(
  skillId: string,
  o: { fx?: string; name?: string; tone?: string } = {},
): FxFamily {
  if (FX_TABLE[skillId]) return FX_TABLE[skillId]
  const name = o.name ?? ''
  for (const [re, fam] of BY_NAME) if (re.test(name)) return fam
  if (o.tone === 'mend' || o.tone === 'ward') return 'support'
  if (o.tone === 'hex') return 'gravity'
  if (o.fx && BY_KIND[o.fx]) return BY_KIND[o.fx]
  return 'neutral'
}

/** 族 + 这一手的覆写（招牌招在这里长出自己的脸） */
export function specOf(
  skillId: string,
  o: { fx?: string; name?: string; tone?: string } = {},
): { family: FxFamily; spec: FxSpec } {
  const family = familyOf(skillId, o)
  const own = FX_CHAR[skillId]
  return { family, spec: own ? { ...own } : FX_SPEC[family] }
}

/* 固定的伪随机：同一招每次长得一样（回放重看一遍不该换一张脸），
   不同招之间又要散得开 —— 种子由 skillId 的哈希来（见 Battle.tsx 的 fxSeed）。 */
function jitter(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function BattleFx({
  skillId, name, kind, tone, seed, level = 'standard',
}: {
  skillId: string
  name: string
  kind: string
  tone?: string
  seed: number
  /** 演出强度：减弱档只留「一帧形变 + 一层余光」（见 Battle 的 C 菜单那一项） */
  level?: 'standard' | 'reduced'
}) {
  const { family, spec: s } = specOf(skillId, { fx: kind, name, tone })
  const style = {
    '--ang': `${s.angle ?? -26}deg`,
    '--ag': s.afterglow ?? 0,
    ...(s.tint ? { '--fx-c': s.tint } : {}),
  } as CSSProperties
  return (
    <span className={css.fxRoot} data-fx-family={family} data-fx-level={level} data-fx-dur={s.dur} style={style} aria-hidden>
      {s.flash ? <i className={css.flash} /> : null}
      {s.vignette ? <i className={css.vignette} /> : null}
      {Array.from({ length: s.bands }, (_, i) => (
        <i key={`b${i}`} className={css.band} style={{ '--i': i, '--r': jitter(seed, i) } as CSSProperties} />
      ))}
      {Array.from({ length: s.ghosts }, (_, i) => (
        <i key={`g${i}`} className={css.ghost} style={{ '--i': i, '--r': jitter(seed, i + 7) } as CSSProperties} />
      ))}
      {Array.from({ length: s.rings }, (_, i) => (
        <i key={`r${i}`} className={css.ring} style={{ '--i': i } as CSSProperties} />
      ))}
      {Array.from({ length: s.shards }, (_, i) => (
        <i key={`s${i}`} className={css.shard}
          style={{ '--i': i, '--a': Math.round(jitter(seed, i + 3) * 360), '--d': 18 + Math.round(jitter(seed, i + 11) * 26) } as CSSProperties} />
      ))}
      {Array.from({ length: s.dots }, (_, i) => (
        <i key={`d${i}`} className={css.dot}
          style={{ '--i': i, '--x': Math.round(jitter(seed, i + 17) * 100), '--y': Math.round(jitter(seed, i + 23) * 100) } as CSSProperties} />
      ))}
      {Array.from({ length: s.zigzags }, (_, i) => (
        <i key={`z${i}`} className={css.zigzag} style={{ '--i': i } as CSSProperties} />
      ))}
      {Array.from({ length: s.chevrons }, (_, i) => (
        <i key={`c${i}`} className={css.chevron} style={{ '--i': i } as CSSProperties} />
      ))}
      {s.afterglow ? <i className={css.afterglow} /> : null}
    </span>
  )
}

/** 开发预览台用：登记过的每一手（招牌优先）。顺序稳定 —— 预览台按它逐个放，
 *  验收截图也按它编。 */
export const FX_PREVIEW: Array<{ id: string; label: string }> = [
  { id: 'nyau-atk', label: '恋兔光 · 引擎吉他' },
  { id: 'nyau-burst', label: '恋兔光 · 轰鸣' },
  { id: 'hikari-atk', label: '小柴喵呜 · 尖啸之枪' },
  { id: 'hikari-burst', label: '小柴喵呜 · 雷' },
  { id: 'mefisa-atk', label: '梅芙 · 电锯' },
  { id: 'danae-atk', label: '达娜厄 · 太刀' },
  { id: 'luna-blade', label: '露娜 · 断钢' },
  { id: 'kuro-atk', label: '黑之魔王 · 吞光' },
  { id: 'maria-song', label: '玛利亚 · 歌' },
  { id: 'hikari-heal', label: '心叶 · 治愈' },
  { id: 'mefisa-armor', label: '梅芙 · 护盾（支援）' },
  { id: 'majina-long', label: '玛吉娜 · 破防' },
  { id: 'katherine-flame', label: '凯瑟琳 · 火' },
  { id: 'boss-maou-sea', label: '黑之魔王 · 海' },
]