import { useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, GitBranch, Lock, LockSimpleOpen } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CgSlot } from '../components/CgSlot'
import { Linkified } from '../components/Linkified'
import { Portrait } from '../components/Portrait'
import { TIMELINE, CHAR_ORDER } from '../data/timeline'
import { castOf, rosterRowOf, rosterRowsOf } from '../lib/cast'
import { SCENES } from '../data/scenes'
import { CG_POOL } from '../data/cgs'
import { personOf } from '../data/castmeta'
import { cgIdOf, cgNoteOf, cgPoolFor, selectCg } from '../lib/cg'
import { clock } from '../lib/format'
import type { RecordMode } from '../data/types'

import css from './Saga.module.css'

const REC_MODE_LABEL: Record<RecordMode, string> = {
  online: '在线推演',
  offline: '离线通读',
  legacy: '旧档回填',
}

/** 序号：按阅读序全局排序 1-based */
function seqOf(eventId: string): number {
  return TIMELINE.findIndex((e) => e.id === eventId) + 1
}

export function Saga() {
  const { operatorName, epDone, unlocked, navigate, bondNow, world, isMet, records, requestProfile, cgOf } = useTerminal()

  const focusIdx = useMemo(() => TIMELINE.findIndex((e) => !epDone[e.id]), [epDone])
  const doneCount = useMemo(() => TIMELINE.filter((e) => epDone[e.id]).length, [epDone])
  const focusEv = focusIdx >= 0 ? TIMELINE[focusIdx] : null
  /** 本段的场景数据（只为取 CG 位；开场白等正文不在此页露出） */
  const focusScene = focusEv ? SCENES[focusEv.id] : undefined
  /** 本段现场名册（含 roster 里的外场角色）；点一行 → 档案页就近展开 */
  const castRows = useMemo(() => (focusEv ? rosterRowsOf(focusEv) : []), [focusEv])
  const openProfile = useCallback((id: string) => {
    requestProfile(id)
    navigate('archive')
  }, [requestProfile, navigate])
  const displayOp = operatorName.trim() ? operatorName : '言万心叶'
  const pct = TIMELINE.length ? Math.round((doneCount / TIMELINE.length) * 100) : 0

  // 分歧记录数：diverged 记录 ∪ 旧抉择中的非原著路线
  const divergeCount = useMemo(() => {
    const s = new Set<string>()
    for (const r of records) if (r.diverged) s.add(r.eventId)
    for (const [id, key] of Object.entries(world.pick)) {
      const sc = SCENES[id]
      const opt = sc?.choices?.find((o) => o.key === key)
      if (opt && opt.canon !== true) s.add(id)
    }
    return s.size
  }, [records, world.pick])

  const metCount = CHAR_ORDER.filter((id) => isMet(id)).length
  const regCount = Object.keys(world.ends).length

  const offsetOf = (char: string) => world.offset[char] ?? 0

  /* 此刻该摆的 CG。以**导演点名**为准 —— 它读着当前这一回合在演什么，从候选清单里挑了一张
     （本段登记的 ∪ 通用池里跟本段出场阵容对得上的那些）；
     它还没点名（新段刚铺开 / 这段走的离线通读）才退回按世界状态过滤（见 lib/cg.ts）。 */
  const cgNow = useMemo(
    () => selectCg(
      focusScene?.cg,
      { flags: world.flags, pick: world.pick, bond: bondNow },
      focusScene?.cgMode ?? 'all',
      focusEv ? cgOf(focusEv.id) : null,
      focusEv ? cgPoolFor(CG_POOL, castOf(focusEv)) : [],
    ),
    [focusScene, focusEv, world.flags, world.pick, bondNow, cgOf],
  )

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">RECORD / WHISPERER LOG</div>
          <h1>低语者日志</h1>
          <div className="vhead__sub">
            正文的推演与通读都在「剧情推进」进行——本页只读：上方为当前事件，下方为已收束事件陆续归档的记录流。
            读到的人心连成事件，事件落地成记录。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip" style={{ borderColor: 'var(--line-3)' }}>事件 {doneCount}/{TIMELINE.length} · 记录 {records.length}</span>
          <span className={unlocked ? 'chip chip--on' : 'chip chip--warn'}>
            {unlocked ? <><LockSimpleOpen size={13} weight="bold" /> 作战子系统已解锁</> : <><Lock size={13} weight="bold" /> 任务 / 武装图鉴 / 终末图鉴 / 短信待解锁</>}
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div className={css.strip}>
        <div className={css.stripCell} style={{ minWidth: 170 }}>
          <span className="tiny muted" style={{ color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>当前事件</span>
          <b>{focusEv ? focusEv.title : '全部收束'}</b>
        </div>
        <div className={css.stripCell} style={{ flex: 1, minWidth: 220 }}>
          <div className={css.pctLine}>
            <span>收束进度 · {doneCount}/{TIMELINE.length}</span>
            <span>{pct}%</span>
          </div>
          <div className="meter meter--thick">
            <div className="meter__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className={css.stripCell} style={{ gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => navigate('plot')} disabled={!focusEv}>
            前往剧情 · 推进此段 <ArrowRight size={13} weight="bold" />
          </button>
          {!focusEv ? (
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('dashboard')}>返回总览</button>
          ) : null}
        </div>
      </div>

      {!unlocked ? (
        <div className={css.gate}>
          门禁提示：角色档案 / 武装图鉴 / 任务简报 / 终末图鉴 / 角色短信 需先完成事件「欢迎来到，终末停滞委员会」（第 1 卷 · 序章至第 1 章）。
          于「剧情推进」中收束该事件后自动解锁。
        </div>
      ) : null}

      <div className={css.layout}>
        {/* ============ 主栏：当前事件 + 记录流 ============ */}
        <div className={css.col}>
          {/* 当前事件卡 */}
          {focusEv ? (
            <section className={`panel ${css.curBox}`}>
              <div className="panel__head">
                <span className="panel__title">当前事件 · 未收束 <span className="slash" /></span>
                <span className="muted tiny" style={{ marginLeft: 'auto' }}>{focusEv.id.toUpperCase()}</span>
              </div>
              <div className={css.curBody}>
                <span className="vhead__kicker" style={{ fontSize: 9 }}>{focusEv.group} · {focusEv.phase}</span>
                <b className={css.curTitle}>{focusEv.title}</b>
                <div className="muted tiny" style={{ color: 'var(--ink-mute)', marginTop: 2 }}>
                  {focusEv.place}{focusEv.day ? ` · ${focusEv.day}` : ''}
                </div>
                <p className={css.curSummary}>{focusEv.summary}</p>

                {/* 场景 CG 位：本段登记了 cg 才摆，且要条件成立；图补进 public/cg/ 即点亮 */}
                {cgNow.length ? (
                  <>
                    <div className={css.secLabel}>场景 CG · {cgNow.length} 位</div>
                    <div className={css.cgRow}>
                      {cgNow.map((r) => (
                        <CgSlot key={cgIdOf(r)} cgId={cgIdOf(r)} caption={cgNoteOf(r)} />
                      ))}
                    </div>
                  </>
                ) : null}

                {focusEv.entities.some((x) => x !== '——') ? (
                  <div className={css.secLabel}>关联实体 · 收束时自动登记</div>
                ) : null}
                {focusEv.entities.some((x) => x !== '——') ? (
                  <div className={css.chipRow}>
                    {focusEv.entities.filter((x) => x !== '——').map((ent) => (
                      <span key={ent} className="chip">{ent}</span>
                    ))}
                  </div>
                ) : null}

                {/* 门槛摆在最前：这一格点不进去的时候，得让人一眼看见差在哪 */}
                {focusEv.gate?.length ? (
                  <div className={css.chipRow} style={{ marginTop: 10 }}>
                    {focusEv.gate.map((g) => {
                      const now = bondNow(g.char)
                      const pass = now >= g.value
                      return (
                        <span
                          key={g.char}
                          className="chip"
                          data-gate={g.char}
                          style={{ color: pass ? 'var(--jade)' : 'var(--amber)' }}
                          title={pass ? '门槛已达成' : '这一段要先把关系走到这儿才开得了'}
                        >
                          进入需 · {personOf(g.char)?.name ?? g.char} 好感 ≥ {g.value}（现 {now}）
                        </span>
                      )
                    })}
                  </div>
                ) : null}

                {castRows.length > 0 ? (
                  <div className={css.secLabel}>出场角色 · 羁绊（只由言万心叶的行为累积，不随进度白涨）</div>
                ) : null}
                <div className={css.charGrid}>
                  {castRows.map((c) => {
                    const id = c.id
                    const met = isMet(id)
                    const base = focusEv.bond[id as keyof typeof focusEv.bond]
                    const canon = typeof base === 'number' ? base : 0
                    const off = offsetOf(id)
                    const cur = bondNow(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        data-saga-cast={id}
                        className={css.charRow}
                        style={{ '--c': c.hue } as CSSProperties}
                        onClick={() => openProfile(id)}
                        title={met ? `调阅 ${c.name} 的档案` : `${c.name} 的档案尚未显影`}
                      >
                        {met ? (
                          <Portrait avatarId={id} size={30} style={{ borderRadius: 4 }} />
                        ) : (
                          /* 未遇见的人不露脸，与「？？？」同口径 */
                          <span className="glyph" style={{ '--g': c.hue, width: 30, height: 30 }}>
                            <span>{c.sigil}</span>
                          </span>
                        )}
                        <div className={css.charMain}>
                          <b>{met ? c.name : '？？？'}</b>
                          <div className="meter" style={{ height: 5, marginTop: 4 }}>
                            <div className="meter__fill" style={{ width: `${cur}%`, background: `linear-gradient(90deg, ${c.hue}55, ${c.hue})` }} />
                          </div>
                        </div>
                        <span className={css.charVal} style={{ color: met ? c.hue : 'var(--ink-faint)' }}>
                          {met ? cur : '?'}
                          {met && off !== 0 ? (
                            <i className={css.miniOff} style={{ color: off > 0 ? 'var(--jade)' : 'var(--red)' }}>
                              {off > 0 ? `+${off}` : off}
                            </i>
                          ) : null}
                        </span>
                        {/* 原著同段只是对照：走到这一段，主角比他更亲近还是更疏远 */}
                        <span className="tiny muted" style={{ color: 'var(--ink-faint)' }}>
                          {met ? `原著同段 ${canon}${cur > canon ? ' · 更亲近' : cur < canon ? ' · 更疏远' : ''}` : '未遇见'}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className={css.curAction}>
                  <p>
                    本段尚未收束。前往剧情视图——<b>{operatorName || '言万心叶'}</b>以消息推演推进（回执自动落地变量），
                    或在无接口时离线通读原文后归档；收束后自动在此追加一条记录并解锁下一段。
                  </p>
                  <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => navigate('plot')}>
                    进入剧情 · 推演或通读 <ArrowRight size={13} weight="bold" />
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className={`panel ${css.curBox}`}>
              <div className="panel__body" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                <b style={{ fontSize: 18 }}>时间线已全部收束</b>
                <p className="muted" style={{ margin: 0, lineHeight: 1.9, color: 'var(--ink-mute)' }}>
                  {TIMELINE.length} 个事件均已归档为记录。若想重新开始，可回终端总览执行「重置世界进度」。
                </p>
              </div>
            </section>
          )}

          {/* 已归档记录流 */}
          <div className={css.feedHead}>
            <span className="panel__title">已归档 · 记录流 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
              按阅读序 · 共 {records.length} 条
            </span>
          </div>

          {records.length === 0 ? (
            <div className={css.feedEmpty}>
              <b>尚无归档记录</b>
              <span>每收束一个事件，这里就会多出一条摘录。开始吧——前往「剧情推进」，在线推演或离线通读当前事件。</span>
            </div>
          ) : (
            <div className={css.recList}>
              {records.map((r) => {
                const ev = TIMELINE.find((e) => e.id === r.eventId)
                const md = r.mode
                return (
                  <article key={r.eventId} className={css.rec}>
                    <div className={css.recHead}>
                      <span className={css.recNo}>{String(seqOf(r.eventId)).padStart(2, '0')}</span>
                      <b className={css.recTitle}>{ev?.title ?? r.eventId}</b>
                      <span className={`${css.md} ${md === 'online' ? css.mdOn : md === 'offline' ? css.mdOff : css.mdOld}`}>
                        {REC_MODE_LABEL[md]}
                      </span>
                      {r.diverged ? (
                        <span className={css.diverge}><GitBranch size={11} weight="bold" /> 分歧</span>
                      ) : null}
                      <span className={`muted tiny ${css.recTime}`}>
                        {r.ts > 0 ? clock(new Date(r.ts)) : '回填'}
                      </span>
                    </div>
                    <p className={css.recDigest}><Linkified text={r.digest} /></p>
                    <div className={css.recMeta}>
                      <span>{ev ? `${ev.group} · ${ev.phase}` : r.eventId}</span>
                      {ev ? <span>{ev.place}</span> : null}
                      {ev && ev.entities.some((x) => x !== '——') ? <span>实体：{ev.entities.filter((x) => x !== '——').slice(0, 3).join('、')}</span> : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {focusIdx < 0 && records.length > 0 ? (
            <div className={css.allDone}>
              <b>全部事件收束 · 记录流在此截止</b>
              <span>低语者一路读到此处。任何一段皆可回到剧情或重置世界重新推演。</span>
            </div>
          ) : null}
        </div>

        {/* ============ 侧栏：变量只读 ============ */}
        <div className={css.side}>
          <div className={css.widget}>
            <div className={css.widgetHead}>
              当前羁绊 · 实时变量
              <span className={css.grow} />
              <span className="muted tiny">BOND · {focusEv ? focusEv.phase : '卷未定'}</span>
            </div>
            <div className={css.widgetBody}>
              {CHAR_ORDER.map((id) => {
                const c = rosterRowOf(id)
                if (!c) return null
                const met = isMet(id)
                const v = bondNow(id)
                const off = offsetOf(id)
                return (
                  <div key={id} className={css.bondRow} style={{ opacity: met ? 1 : 0.45 }}>
                    <span className={css.nm} style={{ color: met ? c.hue : 'var(--ink-faint)' }}>
                      {met ? c.name : '？？？'}
                    </span>
                    {met ? (
                      <>
                        <div className="meter" style={{ height: 6 }}>
                          <div className="meter__fill" style={{ width: `${v}%`, background: `linear-gradient(90deg, ${c.hue}55, ${c.hue})` }} />
                        </div>
                        <span className={css.val} style={{ color: c.hue }}>
                          {v}
                          {off !== 0 ? (
                            <i className={css.miniOff} style={{ color: off > 0 ? 'var(--jade)' : 'var(--red)' }}>{off > 0 ? `+${off}` : off}</i>
                          ) : null}
                        </span>
                      </>
                    ) : (
                      <span className={css.val} style={{ color: 'var(--ink-faint)' }}>未遇见</span>
                    )}
                  </div>
                )
              })}
              <div className={css.noteLine}>
                好感起步为「初见」（陌生≈20，按性格浮动），此后**只由言万心叶的行为累积**——
                推演中的抉择、回执与短信往来，说错话会往下掉。读过哪一段、走到哪一天都不涨。
                少数事件另有门槛（关系先到某个数才进得去）与锁定（那件事之后关系再也回不去，固定满值）。
              </div>
            </div>
          </div>

          <div className={css.widget}>
            <div className={css.widgetHead}>观测记录 · 只读</div>
            <div className={css.widgetBody}>
              <div className={css.varGrid}>
                <span className={css.varCell}><b>{metCount}</b><small>已遇见 / 档案</small></span>
                <span className={css.varCell}><b>{regCount}</b><small>已登记 / 图鉴</small></span>
                <span className={css.varCell}><b>{records.length}</b><small>归档记录</small></span>
                <span className={css.varCell}><b>{divergeCount}</b><small>分歧路线</small></span>
              </div>
              <div className={css.noteLine}>
                <b>{displayOp}，</b>记录一旦写入便不可在此处删改——如需重来，使用终端总览的「重置世界进度」。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
