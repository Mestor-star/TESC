/* ============================================================
   components/Linkified.tsx — 正文关键词跳转

   把正文里的可点词渲染成跳转链接，仅视觉拆词、不改原文、不持久化。
   词典 = 档案角色（name+names，→ requestProfile，操作员除外）
         ＋ 终末图鉴条目（name/alias，→ requestCodex）。
   长词优先、单字符不链（避免误命中）；同一位置只匹配最长的词。

   顺带一件事：**台词要看得出来是台词**。
   写成一整段的正文里，被「」或『』括住的那几句就是有人在说话 ——
   这里把它们单独分出一段、单独上色，好与旁白分开。
   按「角色名：」开头的那种整行台词走 lib/dialogue 的气泡版式，
   而在旁白中间夹着的这几句走这里 —— 两条路都通到「对话比旁白显眼」。
   深度计数：引号可嵌套（「……『……』……」），收尾那一下算在台词里。
   ============================================================ */

import { useMemo } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { CAST } from '../data/castmeta'
import { CODEX } from '../data/codex'

import css from './Linkified.module.css'

type Target = { text: string; kind: 'profile' | 'codex'; id: string }

/** 拆出来的游程：普通文字（可能落在引号里）或一个可点词 */
type Run =
  | { kind: 'text'; s: string; q: boolean }
  | { kind: 'link'; t: Target; q: boolean }

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

  /** 一段正文拆成若干游程：可点词另算一条，引号里的对话另算一条 */
  const parts = useMemo(() => {
    const s = text ?? ''
    const nodes: Run[] = []
    let plain = ''
    let depth = 0
    let i = 0
    const flush = () => {
      if (plain) {
        nodes.push({ kind: 'text', s: plain, q: depth > 0 })
        plain = ''
      }
    }
    outer: while (i < s.length) {
      const ch = s[i]
      if (ch === '「' || ch === '『') {
        flush()
        depth++
        plain = ch
        i++
        continue
      }
      if (ch === '」' || ch === '』') {
        // 收尾这一下也算在台词里 —— 引号本身跟着台词一起上色
        plain += ch
        nodes.push({ kind: 'text', s: plain, q: depth > 0 })
        plain = ''
        depth = Math.max(0, depth - 1)
        i++
        continue
      }
      for (const t of LINKS) {
        if (t.text.length > s.length - i) continue
        if (s.startsWith(t.text, i)) {
          flush()
          nodes.push({ kind: 'link', t, q: depth > 0 })
          i += t.text.length
          continue outer
        }
      }
      plain += ch
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
        p.kind === 'text' ? (
          <span key={idx} className={p.q ? css.q : undefined}>{p.s}</span>
        ) : (
          <span
            key={idx}
            role="link"
            tabIndex={0}
            className={p.q ? `${css.lk} ${css.q}` : css.lk}
            title={p.t.kind === 'profile' ? `打开角色档案 · ${p.t.text}` : `打开图鉴条目 · ${p.t.text}`}
            onClick={(e) => onClick(e, p.t)}
            onKeyDown={(e) => onKey(e, p.t)}
          >
            {p.t.text}
          </span>
        ),
      )}
    </>
  )
}
