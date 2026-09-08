/* ============================================================
   components/Linkified.tsx — 正文关键词跳转

   把正文里的可点词渲染成跳转链接，仅视觉拆词、不改原文、不持久化。
   词典 = 档案角色（name+names，→ requestProfile，操作员除外）
         ＋ 终末图鉴条目（name/alias，→ requestCodex）。
   长词优先、单字符不链（避免误命中）；同一位置只匹配最长的词。
   ============================================================ */

import { useMemo } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { CAST } from '../data/castmeta'
import { CODEX } from '../data/codex'

import css from './Linkified.module.css'

type Target = { text: string; kind: 'profile' | 'codex'; id: string }

/** 最短词长：2 字符以上才可点，杜绝单字/标点误链 */
const MIN_LEN = 2

const LINKS: Target[] = (() => {
  const seen = new Set<string>()
  const list: Target[] = []
  const push = (text: string, kind: 'profile' | 'codex', id: string) => {
    const t = (text ?? '').trim()
    if (t.length < MIN_LEN || seen.has(t)) return
    seen.add(t)
    list.push({ text: t, kind, id })
  }
  // 档案角色：全名 + 别名（CAST 不含操作员 → 操作员名字不会自链）
  for (const p of CAST) {
    push(p.name, 'profile', p.id)
    for (const n of p.names) push(n, 'profile', p.id)
  }
  // 终末图鉴：名称 + 别名
  for (const e of CODEX) {
    push(e.name, 'codex', e.id)
    if (e.alias && e.alias !== e.name) push(e.alias, 'codex', e.id)
  }
  return list.sort((a, b) => b.text.length - a.text.length)
})()

export function Linkified({ text }: { text: string }) {
  const { requestProfile, requestCodex } = useTerminal()

  const open = useMemo(
    () => (t: Target) => {
      if (t.kind === 'profile') requestProfile(t.id)
      else requestCodex(t.id)
    },
    [requestProfile, requestCodex],
  )

  const parts = useMemo(() => {
    const s = text ?? ''
    const nodes: (string | Target)[] = []
    let plain = ''
    let i = 0
    const flush = () => {
      if (plain) {
        nodes.push(plain)
        plain = ''
      }
    }
    outer: while (i < s.length) {
      for (const t of LINKS) {
        if (t.text.length > s.length - i) continue
        if (s.startsWith(t.text, i)) {
          flush()
          nodes.push(t)
          i += t.text.length
          continue outer
        }
      }
      plain += s[i]
      i++
    }
    flush()
    return nodes
  }, [text])

  const onClick = (e: MouseEvent, t: Target) => {
    // 气泡/折叠行等父级点击不该被词跳转吞掉
    e.stopPropagation()
    e.preventDefault()
    open(t)
  }
  const onKey = (e: KeyboardEvent, t: Target) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.stopPropagation()
    e.preventDefault()
    open(t)
  }

  return (
    <>
      {parts.map((p, idx) =>
        typeof p === 'string' ? (
          <span key={idx}>{p}</span>
        ) : (
          <span
            key={idx}
            role="link"
            tabIndex={0}
            className={css.lk}
            title={p.kind === 'profile' ? `打开角色档案 · ${p.text}` : `打开图鉴条目 · ${p.text}`}
            onClick={(e) => onClick(e, p)}
            onKeyDown={(e) => onKey(e, p)}
          >
            {p.text}
          </span>
        ),
      )}
    </>
  )
}
