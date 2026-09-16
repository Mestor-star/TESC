/* ============================================================
   PlotFlow —— 在线推演那条会话流的**唯一一份**渲染
   ------------------------------------------------------------
   主人定过一条：约会专线的生成界面要和在线推演**原模原样**，只有右栏与里面的
   内容不一样。两份「长得像」的 JSX 撑不了几天 —— 改了一边忘了另一边，就又不
   一样了。所以排法只写这一次，主线（views/Plot.tsx）与约会专线
   （components/DateLane.tsx）都从这儿取。

   样式用的**就是** `views/Plot.module.css` 那个文件本身 —— 不是「另写一套参数
   一样的」。所以「原模原样」不是靠照着抄维持的，是同一个文件说了算。

   里面这几块，两边都是一样的：
     旁白块 `.narr`（名字铭牌在 `.narrMeta`）· 台词框 `.sayRow` / `.youRow`
     · 推演折叠 `.thinkFold` · 接续选项 `.optRow` · 每条底下的操作行 `.rowActs`
     · 还没开口时的 `.emptyHint` · 生成中的 `.thinking` · 底下那条 `.composer`
   ============================================================ */

import type { Key, ReactNode } from 'react'
import { PaperPlaneTilt, Stop } from '@phosphor-icons/react'

import { OPERATOR_ID, speakerOf } from '../data/castmeta'
import { splitSpeech } from '../lib/dialogue'
import { inkOf } from '../lib/hue'
import { Linkified } from './Linkified'
import { Portrait } from './Portrait'
import css from '../views/Plot.module.css'

/** 操作员没填名字时的默认（与主线同一句） */
export const OP_FALLBACK = '言万心叶'

export function opNameOf(name?: string): string {
  const t = (name ?? '').trim()
  return t || OP_FALLBACK
}

/** 立绘方块在台词框里的那一份固定尺寸 / 圆角（两条路必须一致，抽成常量）。
 *  宽度走一枚**变量**而不是字面 64：这一句是行内样式（`Portrait` 会把它铺在
 *  `box` 最后一层，比任何类都硬），媒体查询够不着 —— 写成 `var()` 之后，
 *  窄屏那条规则在 `.framePortrait` 上改 `--frame-portrait-w` 就管得住它。
 *  宽屏取到的仍是兜底那 64px，一个像素不动。 */
const framePortrait = { width: 'var(--frame-portrait-w, 64px)', height: '100%', borderRadius: 0 } as const

/* ---------- 台词框 ---------- */

/**
 * 操作员那一行：整框镜像、立绘嵌右缘、名字嵌右上顶边。
 * `foot` 是框底下那一条（时刻 / 操作），在 `.youRow` **里面** —— 与主线同一个位置。
 */
export function YouFrame({ text, opName, foot }: { text: string; opName: string; foot?: ReactNode }) {
  return (
    <div className={css.youRow} data-you="1">
      <div className={`${css.frame} ${css.youFrame}`}>
        <span className={css.dlgName}>{opName}</span>
        <div className={css.frameRow}>
          <span className={css.bubble}><Linkified text={text} /></span>
          <Portrait avatarId={OPERATOR_ID} width={64} style={framePortrait} className={css.framePortrait} />
        </div>
      </div>
      {foot}
    </div>
  )
}

/** 别的角色那一行：整框靠左、立绘嵌左缘、名字嵌左上顶边（颜色取她本人的本色） */
export function SayFrame({ id, text }: { id: string; text: string }) {
  const c = speakerOf(id)
  return (
    <div className={css.sayRow} data-say="1" data-say-for={id}>
      <div className={`${css.frame} ${css.sayFrame}`}>
        <span className={css.dlgName} style={{ color: inkOf(c?.hue) || 'var(--steel)' }}>{c?.name ?? id}</span>
        <div className={css.frameRow}>
          <Portrait avatarId={id} width={64} style={framePortrait} className={css.framePortrait} />
          <span className={css.bubble}><Linkified text={text} /></span>
        </div>
      </div>
    </div>
  )
}

/**
 * 一条完整正文按「旁白 / 台词框」逐段铺开 —— 主线里的正文（导演叙述、开场白、
 * 往期正文）与约会专线里对面那一段，走的都是这一条。
 *
 * `keyPrefix` 只是给 React 认键用（同一条正文在历史里出现两次时别撞），
 * 与排版无关。
 */
export function Speech({ text, opName, keyPrefix }: { text: string; opName: string; keyPrefix?: string }) {
  return (
    <>
      {splitSpeech(text).map((seg, si) => {
        const key: Key = keyPrefix === undefined ? si : `${keyPrefix}-${si}`
        if (seg.kind === 'narr') {
          return <div key={key} className={css.narrText}><Linkified text={seg.text} /></div>
        }
        if (seg.kind === 'you') return <YouFrame key={key} text={seg.text} opName={opName} />
        return <SayFrame key={key} id={seg.id} text={seg.text} />
      })}
    </>
  )
}

/* ---------- 旁白块 ---------- */

/** 旁白块的三种口径（与主线的 `data-narration` 一致） */
export type NarrTone = 'director' | 'opening' | 'battle'

export interface NarrBlockProps {
  /** 名字铭牌上那一行（主线是「导演叙述 / 开场白 · 原文 / 交战 · 成文」） */
  label: string
  /** 铭牌右边那枚小字（时刻） */
  time?: string
  text: string
  opName: string
  tone?: NarrTone
  /**
   * 流式生成中的半截正文：**不切段**，整条走一个旁白行 ——
   * 切到一半的正文每来一个字就重排一次段，读起来会跳。
   */
  plain?: boolean
  /** 铭牌下面、正文后面可以再挂东西（推演折叠 / 接续选项 / 操作行） */
  children?: ReactNode
}

export function NarrBlock({ label, time, text, opName, tone = 'director', plain, children }: NarrBlockProps) {
  const cls = tone === 'opening' ? `${css.narr} ${css.open}`
    : tone === 'battle' ? `${css.narr} ${css.fight}` : css.narr
  return (
    <div className={cls} data-narration={tone} data-stream-live={plain ? '1' : undefined}>
      <div className={css.narrMeta}>
        <b>{label}</b>
        {time ? <span className="muted tiny">{time}</span> : null}
      </div>
      {plain
        ? <div className={css.narrText}><Linkified text={text} /></div>
        : <Speech text={text} opName={opName} />}
      {children}
    </div>
  )
}

/* ---------- 旁白块里挂的那几小块 ---------- */

/** 推演（思考）折叠条 */
export function ThinkFold({ open, text, onToggle }: { open: boolean; text: string; onToggle: () => void }) {
  return (
    <div className={css.thinkFold}>
      <button type="button" className={css.thinkHead} onClick={onToggle}>
        <b>推演</b>
        <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
          {open ? '收起' : `展开 · ${text.length} 字`}
        </span>
      </button>
      {open ? <div className={css.thinkBody}>{text}</div> : null}
    </div>
  )
}

/** 接续选项（回执里给的那几条） */
export function OptRow({ options, disabled, onPick, title = '接续选项' }: {
  options?: string[]
  disabled?: boolean
  onPick: (op: string) => void
  title?: string
}) {
  if (!options || !options.length) return null
  return (
    <div className={css.optRow}>
      <span className="tiny" style={{ color: 'var(--ink-faint)', letterSpacing: '0.12em' }}>{title}</span>
      {options.map((op) => (
        <button
          key={op}
          type="button"
          className={`btn btn--ghost ${css.optChip}`}
          style={{ fontSize: 12 }}
          disabled={disabled}
          onClick={() => onPick(op)}
        >
          {op}
        </button>
      ))}
    </div>
  )
}

/** 一条底下的操作行（从此重来 / 重写此回复）—— 平时淡着，鼠标压上去才亮 */
export function RowActs({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <div className={css.rowActs}>{children}</div>
}

/* ---------- 还没开口 / 正在生成 ---------- */

/** 一条都没有时的提示块（主线的原样，只是话由调用方给） */
export function EmptyHint({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className={css.emptyHint}>
      <b>{title}</b>
      <span>{body}</span>
    </div>
  )
}

/** 生成中的那行字（主线写「导演正在编织叙事…」） */
export function Thinking({ text }: { text: string }) {
  return <div className={css.thinking}>{text}</div>
}

/* ---------- 底下那条输入带 ---------- */

export interface ComposerProps {
  draft: string
  onDraft: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  /** 通道没配好之类的：整个输入带禁用 */
  disabled?: boolean
  /** 送出那一枚要不要在有字时才亮（主线空着也送得出去，这一路不是） */
  sendWhenEmpty?: boolean
  placeholder: string
  /** 送出按钮左边还可以再塞东西（主线的「代拟」就摆这儿） */
  acts?: ReactNode
  /** 想在这条带子上挂把手（比如 `data-date-composer`）时给 */
  rootProps?: Record<string, string>
  /** 送出那一枚上再挂的把手（主线那条 `data-composer-send` 就靠它） */
  sendAttrs?: Record<string, string>
  /** 送出那一枚的提示语随「写没写」变（主线原样：空着也送得出去） */
  sendLabel?: string
  sendTitle?: string
}

export function Composer({
  draft, onDraft, onSend, onStop, busy, disabled, sendWhenEmpty, placeholder, acts, rootProps,
  sendAttrs, sendLabel, sendTitle,
}: ComposerProps) {
  return (
    <div className={css.composer} {...rootProps}>
      <input
        className="field"
        placeholder={placeholder}
        value={draft}
        disabled={disabled}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (busy) onStop()
            else onSend()
          }
        }}
      />
      {acts}
      {busy ? (
        <button className={`btn btn--amber ${css.composerBtn}`} onClick={onStop} aria-label="中断">
          <Stop size={18} weight="bold" />
        </button>
      ) : (
        <button
          className={`btn btn--primary ${css.composerBtn}`}
          onClick={onSend}
          disabled={disabled || (!sendWhenEmpty && !draft.trim())}
          aria-label={sendLabel ?? '送出'}
          title={sendTitle}
          {...sendAttrs}
        >
          <PaperPlaneTilt size={18} weight="bold" />
        </button>
      )}
    </div>
  )
}
