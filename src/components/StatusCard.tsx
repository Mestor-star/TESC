/* ============================================================
   人物状态卡（components/StatusCard.tsx）
   ------------------------------------------------------------
   主人两句话定下这一张卡：「约会右栏的状态栏改成可翻转 —— 正面四项 + 顶上好感度，
   背面四项 + 顶上情欲值；每一项给一句话概括」。那一句话由 **AI 生成**（见
   lib/plot.ts 的 `look` 字段与 lib/look.ts 的仓库），不是规则文案池 ——
   所以卡面只负责**读**：没有那一句就照实写「—— 还没细看」，绝不替它编。

   两面各四项、顶上各一根条：
     · 正面（好感度）：头部 / 上半身 / 下半身 / 约会氛围 —— 读数用羁绊（0–100）；
     · 背面（情欲值）：胸部 / 小穴 / 屁穴 / 心理状态 —— 读数用私密档案的色情度。

   翻面：点卡面，或让它拿到焦点之后按 F（Enter / 空格也认，那是按钮本来的键）。
   `prefers-reduced-motion: reduce` 时不做翻转动画、当场切换（见 StatusCard.module.css）。

   **非私密档那一面不许空白**：背面要谈的都是私密档里的事，没到那一步就照实写
   「还没到这一步」—— 与私密档案页「没到就整节不出现」是同一条分寸。
   ============================================================ */

import { useState } from 'react'

import { LOOK_BACK, LOOK_FIELD_META, LOOK_FRONT, LOOK_LOCKED, LOOK_PLACEHOLDER } from '../lib/look'
import type { LookEntry, LookField } from '../lib/look'
import { devStage } from '../data/intimate'
import { inkOf } from '../lib/hue'

import css from './StatusCard.module.css'

/** 卡面：正面（好感度）还是背面（情欲值） */
export type StatusFace = 'front' | 'back'

interface StatusCardProps {
  /** 这张卡是谁的（`data-status-card` 与 `data-status-row` 都挂在它上面） */
  charId: string
  /** 显示名（可选；约会右栏的署名在卡外，这里只是给读屏与标题用） */
  name?: string
  /** 她那一支主题色（字走 inkOf 压到 -deep 那一档） */
  hue?: string
  /** 正面顶上那根条：此刻的羁绊读数（0–100） */
  bond: number
  /** 背面顶上那根条：私密档案的色情度（0–100）；非私密档不给 */
  lewd?: number
  /** 私密档（kind === 'intimate' 或 hasIntimate）—— 背面的四项只在它成立时才有意义 */
  intimate: boolean
  /** 这一位此刻的那一份（缺项沿用上一次；没有 → 占位） */
  look?: LookEntry | null
  /** 一开始翻在哪一面（缺省正面） */
  defaultFace?: StatusFace
}

export function StatusCard({
  charId, name, hue, bond, lewd, intimate, look, defaultFace = 'front',
}: StatusCardProps) {
  const [face, setFace] = useState<StatusFace>(defaultFace)
  const front = face === 'front'
  const toggle = () => setFace(front ? 'back' : 'front')
  const color = inkOf(hue ?? 'var(--steel)')

  /* 两根条各读各的：正面一直是羁绊、背面一直是色情度 ——
     **不跟着当前哪一面走**。两面同时挂在 DOM 上（翻面只是转过去），
     若按当前面取值，藏起来的那一面会映出对面那个数，转过去的一瞬间还会跳一下。
     没有读数就照实写「——」（不编一个 0）。 */
  const num = (v?: number) => (typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(100, Math.round(v)))
    : null)
  const bondVal = num(bond)
  const lewdVal = num(lewd)

  const row = (f: LookField) => {
    const line = look?.[f]?.trim()
    return (
      <span className={css.row} key={f} data-status-row={f} data-status-label={LOOK_FIELD_META[f].label}>
        <span className={css.k}>{LOOK_FIELD_META[f].label}</span>
        <span className={css.one} data-status-given={line ? '1' : '0'} title={line || LOOK_PLACEHOLDER}>
          {line || LOOK_PLACEHOLDER}
        </span>
      </span>
    )
  }

  return (
    <button
      type="button"
      className={css.card}
      data-status-card={charId}
      data-face={face}
      data-status-intimate={intimate ? '1' : '0'}
      aria-label={(name ?? charId) + ' 的状态卡 · 点一下翻面（F）'}
      aria-pressed={!front}
      title="点卡面翻面（或按 F）"
      onClick={toggle}
      onKeyDown={(e) => {
        /* F 是主人点名的那个键；Enter / 空格是按钮自带的，别抢。 */
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault()
          toggle()
        }
      }}
    >
      <span className={css.inner}>
        {/* —— 正面：好感度 + 头部 / 上半身 / 下半身 / 约会氛围 —— */}
        <span className={css.face} data-status-face="front" aria-hidden={!front}>
          <span className={css.bar} data-status-bar="bond" data-status-value={bondVal ?? ''}>
            <span className={css.barHead}>
              <b style={{ color }}>好感度</b>
              <span className={css.num} style={{ color }}>{bondVal ?? '——'}</span>
            </span>
            <span className="meter">
              <span
                className="meter__fill"
                style={{
                  width: (bondVal ?? 0) + '%',
                  background: 'linear-gradient(90deg, ' + (hue ?? 'var(--steel)') + '66, ' + (hue ?? 'var(--steel)') + ')',
                }}
              />
            </span>
          </span>
          <span className={css.lines}>{LOOK_FRONT.map(row)}</span>
        </span>

        {/* —— 背面：情欲值 + 胸部 / 小穴 / 屁穴 / 心理状态（非私密档 → 那一句，不是空白）—— */}
        <span className={css.face} data-status-face="back" aria-hidden={front}>
          <span className={css.bar} data-status-bar="lewd" data-status-value={lewdVal ?? ''}>
            <span className={css.barHead}>
              <b style={{ color: 'var(--rose-deep)' }}>情欲值</b>
              <span className={css.num} style={{ color: 'var(--rose-deep)' }}>{lewdVal ?? '——'}</span>
              {lewdVal !== null ? <i className={css.word}>{devStage(lewdVal)}</i> : null}
            </span>
            <span className="meter">
              <span
                className="meter__fill"
                style={{
                  width: (lewdVal ?? 0) + '%',
                  background: 'linear-gradient(90deg, color-mix(in srgb, var(--rose) 35%, transparent), var(--rose))',
                }}
              />
            </span>
          </span>
          {intimate ? (
            <span className={css.lines}>{LOOK_BACK.map(row)}</span>
          ) : (
            <span className={css.locked} data-status-locked="1">{LOOK_LOCKED}</span>
          )}
        </span>
      </span>
    </button>
  )
}
