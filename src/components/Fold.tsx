/* ============================================================
   components/Fold.tsx — 可折叠的一栏（全终端共用一套）

   为什么要有这么一件公用的小东西：
   终端里「列东西」的地方很多（情景记忆库的七栏、总览的模块、档案的归组、
   智库的手册、图鉴的分类……）。每一处各自写一遍折叠，就会出现七八套
   点法、箭头方向和默认状态 —— 操作员得按每一页的习惯重新学。

   所以折这件事只有一套：
     · 栏头是一个 <button data-fold-head={k} aria-expanded={展开中?}>；
     · 栏体是它**紧跟的下一个兄弟**，标一个 data-fold-body；
     · 收起由一条全局规则办（styles/tokens.css）：
       [data-fold-head][aria-expanded='false'] + [data-fold-body] { display: none }
   于是「收起」不靠 React 卸载 —— 栏体仍在 DOM 里，只是不占版面。
   这一点是刻意的：这一页的读数（条数、行数、可见性）都还在，
   复核脚本与「目录上的数」不会因为收起而对不上。

   状态在调用方手里（useFolds），因为「默认折着还是开着」是每一页自己的事：
   账很长的地方默认折着（先给目录），表单类的地方默认开着（本来就要填）。
   ============================================================ */

import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'

import css from './Fold.module.css'

export interface Folds {
  /** 这一栏此刻是开的吗 */
  isOpen: (k: string) => boolean
  /** 开⇄合 */
  toggle: (k: string) => void
  /** 一次全开或全收（只动传进来的这几栏） */
  setAll: (keys: readonly string[], v: boolean) => void
  /** 传进来的这几栏是不是全开着（给「全部展开」按钮置灰用） */
  allOpen: (keys: readonly string[]) => boolean
}

/**
 * 一页的折叠状态。
 * @param defaultOpen 没被点过的栏默认是开是关。账长的地方给 false（默认折着）。
 */
export function useFolds(defaultOpen = false): Folds {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = useCallback((k: string) => open[k] ?? defaultOpen, [open, defaultOpen])
  const toggle = useCallback((k: string) => {
    setOpen((o) => ({ ...o, [k]: !(o[k] ?? defaultOpen) }))
  }, [defaultOpen])
  const setAll = useCallback((keys: readonly string[], v: boolean) => {
    setOpen((o) => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, v])) }))
  }, [])
  const allOpen = useCallback((keys: readonly string[]) => keys.every(isOpen), [isOpen])
  return useMemo(() => ({ isOpen, toggle, setAll, allOpen }), [isOpen, toggle, setAll, allOpen])
}

/**
 * 栏头。排版仍由所在页给（panel__head 的全局样式，或调用方自己的类）；
 * 这里只管三件事：整行可点、箭头跟着开合转向、把状态写进 aria-expanded。
 * 按钮自带的那点样式（边框、背景、内边距、字体）在 Fold.module.css 里抹平。
 */
export function FoldHead({ k, open, folds, children, className, plain }: {
  /** 这一栏的键（同一页内唯一） */
  k: string
  open: boolean
  folds: Folds
  children: ReactNode
  /** 追加的排版类（各页自己的栏头长什么样） */
  className?: string
  /** 栏头落在**卡片内部**时置真：卡片自带内边距，按钮再叠一层就成了卡里套卡 */
  plain?: boolean
}) {
  return (
    <button
      type="button"
      className={`${css.headBtn} ${plain ? css.plain : ''} ${className ?? ''}`}
      data-fold-head={k}
      aria-expanded={open}
      onClick={() => folds.toggle(k)}
    >
      {children}
      <CaretDown size={13} weight="bold" className={css.chev} />
    </button>
  )
}

/**
 * 栏头右端只有箭头的那一种：行里还有别的控件时用（「全部 →」这类跳转）。
 * 整行当按钮会套出「按钮里放按钮」，所以退一步 —— 开关退到行右端。
 * 两种看起来是一样的：箭头都在栏头右端。
 */
export function IconFold({ k, open, folds, className, title }: {
  k: string
  open: boolean
  folds: Folds
  className?: string
  /** 悬停提示，默认按开合状态自己写 */
  title?: string
}) {
  return (
    <button
      type="button"
      className={`${css.iconBtn} ${className ?? ''}`}
      data-fold-head={k}
      aria-expanded={open}
      title={title ?? (open ? '收起这一栏' : '展开这一栏')}
      onClick={() => folds.toggle(k)}
    >
      <CaretDown size={13} weight="bold" className={css.chev} />
    </button>
  )
}

/**
 * 通用面板（全局 .panel > .panel__head）的折叠栏头。
 * 行里没有别的控件时整行就是按钮；有的话（extra）退成右端一个箭头。
 * 栏体那边调用方自己写：<div className="panel__body" data-fold-body>。
 */
export function PanelHead({ k, folds, children, extra, className }: {
  k: string
  folds: Folds
  /** 栏头内容：标题、右端的说明文字。这里不要再放可点的东西 —— 整行就是一个按钮。 */
  children: ReactNode
  /** 行里除标题内容外的控件；给了它就改用右端箭头那一种（见 IconFold） */
  extra?: ReactNode
  className?: string
}) {
  const open = folds.isOpen(k)
  if (!extra) {
    return (
      <FoldHead k={k} open={open} folds={folds} className={`panel__head ${className ?? ''}`}>
        {children}
      </FoldHead>
    )
  }
  return (
    <div className={`panel__head ${className ?? ''}`}>
      {children}
      {extra}
      <IconFold k={k} open={open} folds={folds} />
    </div>
  )
}

/**
 * 「全部展开 / 全部收起」两颗按钮。
 * 折着的页面上给一条，省得七栏一栏一栏点；只有一栏的地方不必挂。
 */
export function FoldAll({ folds, keys, label, className, hint }: {
  folds: Folds
  keys: readonly string[]
  /** 这一组叫什么（「七栏」「模块」……），写进提示语 */
  label: string
  className?: string
  /** 提示语整句换掉。默认那句假定这一组是默认折着的（账长的地方）；
      默认就摊开的地方（表单、开关）得自己给一句，不然提示与实际相反。 */
  hint?: ReactNode
}) {
  const all = folds.allOpen(keys)
  return (
    <div className={`${css.bar} ${className ?? ''}`} data-fold-bar>
      <span className="tiny muted">{hint ?? `${label}都折着。点栏头展开任意一栏；要看全貌就一次摊开。`}</span>
      <span className={css.grow} />
      <button
        type="button"
        className="btn btn--ghost"
        style={{ fontSize: 11 }}
        data-fold-expand-all
        onClick={() => folds.setAll(keys, true)}
        disabled={all}
      >
        全部展开
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ fontSize: 11 }}
        data-fold-collapse-all
        onClick={() => folds.setAll(keys, false)}
        disabled={!all}
      >
        全部收起
      </button>
    </div>
  )
}
