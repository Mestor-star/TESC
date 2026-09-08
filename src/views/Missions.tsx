import { useMemo, useState } from 'react'
import { ArrowRight, Check, PaperPlaneTilt } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { MISSIONS } from '../data/missions'
import { CHARACTERS } from '../data/chars'
import type { Mission } from '../data/types'
import { stageSeverity } from '../lib/format'

import css from './Missions.module.css'

type FilterKey = '全部' | '待接取' | '已派遣' | '压制中' | '完成' | '高威胁'
type LocalStatus = Mission['status']

const FILTERS: FilterKey[] = ['全部', '待接取', '已派遣', '压制中', '完成', '高威胁']

const STATUS_META: Record<LocalStatus, { cls: string; color: string; label: string }> = {
  待接取: { cls: 'chip', color: 'var(--steel)', label: '待接取' },
  已派遣: { cls: 'chip chip--warn', color: 'var(--amber)', label: '已派遣' },
  压制中: { cls: 'chip chip--danger', color: 'var(--red)', label: '压制中' },
  完成: { cls: 'chip chip--on', color: 'var(--jade)', label: '已完成' },
  锁定: { cls: 'chip chip--off', color: 'var(--ink-mute)', label: '等待签署' },
}

const CHAR_HUE: Record<string, string> = Object.fromEntries(CHARACTERS.map((c) => [c.name, c.hue]))

export function Missions() {
  const { push } = useTerminal()
  const [filter, setFilter] = useState<FilterKey>('全部')
  const [status, setStatus] = useState<Record<string, LocalStatus>>({})
  const [openId, setOpenId] = useState<string | null>(null)

  const set = (id: string, s: LocalStatus) => setStatus((prev) => ({ ...prev, [id]: s }))

  const list = useMemo(() => {
    const rows = MISSIONS.map((m) => ({ ...m, status: status[m.id] ?? m.status }))
    const sorted = [...rows].sort((a, b) => (filter === '高威胁' ? a.stage - b.stage : b.stage - a.stage))
    if (filter === '全部') return sorted
    if (filter === '高威胁') return sorted.filter((m) => m.stage >= 6)
    return sorted.filter((m) => m.status === filter)
  }, [filter, status])

  const counts = useMemo(() => {
    const s: Record<string, number> = {}
    for (const m of MISSIONS) {
      const st = status[m.id] ?? m.status
      s[st] = (s[st] ?? 0) + 1
    }
    return s
  }, [status])

  const act = (m: Mission) => {
    const cur = status[m.id] ?? m.status
    if (cur === '待接取') {
      set(m.id, '已派遣')
      push('success', '任务已接取', `${m.no}「${m.title}」已派遣至 ${m.place}`, false)
    } else if (cur === '已派遣') {
      set(m.id, '压制中')
      push('danger', '交战中', `${m.no}「${m.title}」与 ${m.nature} 交火，请求频道保持畅通`, false)
    } else if (cur === '压制中') {
      set(m.id, '完成')
      push('success', '任务完成', `${m.no}「${m.title}」已归档，简报更新`, false)
    } else if (cur === '锁定') {
      push('warn', '等待签署', '本任务需要执行委员长签署，目前无法由你直接下达。', false)
    }
  }

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">FIELD / MISSIONS</div>
          <h1>任务简报板</h1>
          <div className="vhead__sub">动态生成处置卡片。接取、派遣、压制、归档——每条任务都有它的编号与代价。</div>
        </div>
        <div className={css.filters}>
          {FILTERS.map((f) => (
            <button key={f} className={`${css.filterBtn} ${filter === f ? css.isOn : ''}`} onClick={() => setFilter(f)}>
              {f}
              {f !== '全部' && f !== '高威胁' ? <span className="muted" style={{ marginLeft: 5 }}>{counts[f] ?? 0}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className={css.empty}>
          <div style={{ fontSize: 26, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>NO ACTIVE TASKS</div>
          <div className="mono tiny" style={{ letterSpacing: '0.2em' }}>当前筛选下没有任务。第 12 区暂时平稳——去休息一下吧。</div>
        </div>
      ) : (
        <div className={css.board}>
          {list.map((m) => {
            const sev = stageSeverity(m.stage)
            const sm = STATUS_META[m.status]
            const ribbonCls = m.status === '完成' ? css.done : m.status === '压制中' ? css.danger : m.status === '锁定' ? css.warn : m.stage >= 6 ? css.danger : m.stage >= 3 ? css.warn : css.ok
            return (
              <article key={m.id} className={css.card} style={{ '--s': m.stage >= 6 ? 'var(--red)' : m.stage >= 3 ? 'var(--amber)' : 'var(--steel)' }}>
                <div className={`${css.cardRibbon} ${ribbonCls}`} />
                <div className={css.cardMain}>
                  <div className={css.cardTop}>
                    <span className={css.cardNo}>档案 {m.no} / 阶段 S{m.stage}</span>
                    <span className="num badge" style={{ color: sev.color, borderColor: sev.color }}>{sev.label}</span>
                    <span className={`${sm.cls}`}><span className={css.statusBadge}><span className={css.dot} style={{ background: sm.color, boxShadow: `0 0 6px ${sm.color}` }} />{sm.label}</span></span>
                    <span className={`chip`} style={{ borderColor: 'transparent', background: 'var(--bg-2)' }}>{m.nature}</span>
                  </div>
                  <h3 className={css.cardTitle} style={{ marginTop: 6 }}>{m.title}</h3>
                  <div className={css.cardSub}>
                    <span>地点 {m.place}</span>
                    <span className={css.sep}>/</span>
                    <span className={css.deadline}>期限 · {m.deadline}</span>
                    <span className={css.sep}>/</span>
                    <span>编号 {m.no}</span>
                  </div>
                  <p className={`${css.cardDesc} ${openId === m.id ? css.open : ''}`}>{m.desc}</p>
                  <div className={css.crew}>
                    <span className="tag tiny" style={{ padding: '4px 8px' }}>推荐小队</span>
                    {m.recommend.map((r) => (
                      <span key={r} className={css.crewChip} style={{ '--crew': CHAR_HUE[r] ?? 'var(--violet)' }}>
                        <i>{CHAR_HUE[r] ? CHARACTERS.find((c) => c.name === r)?.sigil ?? '?' : '?'}</i>
                        {r}
                      </span>
                    ))}
                    <button className="linkGo" onClick={() => setOpenId(openId === m.id ? null : m.id)} style={{ marginLeft: 'auto' }}>
                      {openId === m.id ? '收起' : '展开详情'}
                    </button>
                  </div>
                </div>

                <div className={css.cardAside}>
                  <div className={css.rewards}>
                    {m.reward.map((rw) => (
                      <span key={rw} className={css.rewardLine}>{rw}</span>
                    ))}
                  </div>
                  <div className={css.asideAction}>
                    {m.status === '锁定' ? (
                      <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => act(m)}>
                        <PaperPlaneTilt size={13} /> 等待签署
                      </button>
                    ) : m.status === '完成' ? (
                      <button className="btn btn--ghost" style={{ fontSize: 12 }} disabled>已归档</button>
                    ) : (
                      <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => act(m)}>
                        {m.status === '待接取' && <>接取任务 <Check size={13} weight="bold" /></>}
                        {m.status === '已派遣' && <>下令压制 <ArrowRight size={13} /></>}
                        {m.status === '压制中' && <>标记完成 <Check size={13} weight="bold" /></>}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
