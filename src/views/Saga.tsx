import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, CaretDown, GitBranch, Lock, LockSimpleOpen } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { Linkified } from '../components/Linkified'
import { Portrait } from '../components/Portrait'
import { FoldHead, useFolds } from '../components/Fold'
import { TIMELINE, CHAR_ORDER } from '../data/timeline'
import { rosterRowOf, rosterRowsFor } from '../lib/cast'
import { personOf } from '../data/castmeta'
import { clock } from '../lib/format'
import { inkOf } from '../lib/hue'
import { buildWorldline } from '../lib/worldline'
import type { RecordMode } from '../data/types'

import css from './Saga.module.css'

const REC_MODE_LABEL: Record<RecordMode, string> = {
  online: '在线推演',
  offline: '离线通读',
  legacy: '旧档回填',
  manual: '人工判定',
}

/** 序号：按阅读序全局排序 1-based */
function seqOf(eventId: string): number {
  return TIMELINE.findIndex((e) => e.id === eventId) + 1
}

export function Saga() {
  const { operatorName, epDone, unlocked, navigate, bondNow, world, isMet, records, requestProfile, castOfEvent, rewindTo, push } = useTerminal()

  const focusIdx = useMemo(() => TIMELINE.findIndex((e) => !epDone[e.id]), [epDone])
  const doneCount = useMemo(() => TIMELINE.filter((e) => epDone[e.id]).length, [epDone])
  const focusEv = focusIdx >= 0 ? TIMELINE[focusIdx] : null
  /** 本段现场名册（含 roster 里的外场角色，**取此刻那一份**：导演实时改过就用改过的）；
      点一行 → 档案页就近展开 */
  const castRows = useMemo(
    () => (focusEv ? rosterRowsFor(castOfEvent(focusEv)) : []),
    [focusEv, castOfEvent],
  )
  const openProfile = useCallback((id: string) => {
    requestProfile(id)
    navigate('archive')
  }, [requestProfile, navigate])
  const displayOp = operatorName.trim() ? operatorName : '言万心叶'
  const pct = TIMELINE.length ? Math.round((doneCount / TIMELINE.length) * 100) : 0

  /* 分歧记录数：只看归档记录上的 diverged 标记 —— 那一个由导演在收束时判定，
     与原著相异才置 true。从前还并上「抉择记录里的非原著路线」，
     抉择点撤掉之后这一路没了，只剩记录。 */
  const divergeCount = useMemo(() => {
    const s = new Set<string>()
    for (const r of records) if (r.diverged) s.add(r.eventId)
    return s.size
  }, [records])

  /* —— 世界线脊梁 ——
     24 个真锚点 + 偏离账本，折成看得见的一页。折法在 lib/worldline.ts（纯函数，只读），
     这一页只负责摆：整段默认收着（折的机制与全终端其它栏同一套，见 components/Fold.tsx），
     点栏头展开；每一行再点开看那四项（不可动摇的那件事 / 可改的部分 / 替代形态 / 出处）。
     当前段那一行按 evId 命中高亮 —— 「我读到世界线的哪一格」得有地方看得出来。 */
  const folds = useFolds()
  const worldline = useMemo(
    () => buildWorldline({ world, epDone, curEvId: focusEv?.id ?? null }),
    [world, epDone, focusEv],
  )
  const [openAnchors, setOpenAnchors] = useState<Record<string, true>>({})
  const toggleAnchor = useCallback((id: string) => {
    setOpenAnchors((o) => {
      const next = { ...o }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }, [])

  const metCount = CHAR_ORDER.filter((id) => isMet(id)).length
  const regCount = Object.keys(world.ends).length

  const offsetOf = (char: string) => world.offset[char] ?? 0

  /* —— 「回到这一段之前」（多步回退）——
     两段式确认：第一次只把按钮变成「再按一次确认」并给一句说明，第二次才真的撤。
     撤多少归 `Terminal.rewindTo`（它照 `lib/rewind.ts` 的 planRewind 算），本页只负责
     两件事：① 把「撤了哪几段」写进观测记录（push 就是观测记录那一列）；
     ② 撤完让上下文带着新状态重渲染（epDone / records / world 都从 useTerminal 来，
        无须 requestRemount —— 那是换整个运行态时才做的事）。
     只有已归档（有记录）的段才有这一枚；自由段没有记录，自然不出现。 */
  const [rewindArm, setRewindArm] = useState<string | null>(null)
  const doRewind = useCallback((eventId: string) => {
    if (rewindArm !== eventId) {
      setRewindArm(eventId)
      return
    }
    setRewindArm(null)
    const at = seqOf(eventId)
    /* 名单在撤之前算 —— 撤完 records 里就没有它们了 */
    const names = records
      .filter((r) => seqOf(r.eventId) > 0 && seqOf(r.eventId) >= at)
      .map((r) => `《${TIMELINE.find((e) => e.id === r.eventId)?.title ?? r.eventId}》`)
    if (!rewindTo(eventId)) {
      push('warn', '回退未生效', '这一段不在读序里（旧档遗留段），没有撤任何东西。', false)
      return
    }
    push('info', '回退到这一段之前 · 已撤回',
      `${names.join('、') || '（无记录）'}已从低语者日志撤下，推演退回这一段之前。正文与已登记的角色 / 图鉴不会回滚；回退不回拨时钟。`, false)
  }, [rewindArm, records, rewindTo, push])

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

      {/* 进度条。两条 `min-width` 从前是**内联**的（170 / 220）——
          内联样式媒体查询够不着，390 屏上这两格加起来就 390，正好把整条顶出去。
          挪进类里之后，窄屏那一条在 Saga.module.css 末尾放开它们。 */}
      <div className={css.strip}>
        <div className={`${css.stripCell} ${css.stripCellEvent}`}>
          <span className="tiny muted" style={{ color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>当前事件</span>
          <b>{focusEv ? focusEv.title : '全部收束'}</b>
        </div>
        <div className={`${css.stripCell} ${css.stripCellPct}`}>
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

      {/* ============ 世界线 · 锚点脊梁（整段默认收着）============
          折的机制是公用的：栏头是按钮（aria-expanded），栏体是它紧跟的下一个兄弟并标着
          data-fold-body，收起由 tokens.css 的一条规则办 —— 栏体不卸 DOM，条数照旧读得到。
          冒烟那几个把手：data-worldline / data-anchor-row / data-anchor-state /
          data-diverged-row / data-diverged-empty。 */}
      <section className={`panel ${css.worldBox}`} data-worldline>
        <FoldHead k="worldline" open={folds.isOpen('worldline')} folds={folds} className="panel__head">
          <span className="panel__title">世界线 · 锚点脊梁 <span className="slash" /></span>
          <span className="muted tiny" style={{ color: 'var(--ink-faint)' }} data-worldline-count="1">
            锚点 {worldline.count.total} · 已落地 {worldline.count.landed} · 到期 {worldline.count.due}
          </span>
          <span className={css.grow} />
          <span
            className={`chip ${worldline.count.diverged > 0 ? 'chip--warn' : 'chip--off'}`}
            data-worldline-diverged={worldline.count.diverged}
          >
            偏离 {worldline.count.diverged} 段
          </span>
        </FoldHead>

        <div className="panel__body" data-fold-body>
          <div className={css.wlNote}>
            这 24 条是原文里绕不开的那几件事。结果不动，过程归你 —— 每条下面写着能改的那几样，
            以及「你把它绕开时，它怎么回来」。已落地 / 此刻到期 / 还没到 / 已错过，四档各自有记。
          </div>

          <ol className={css.ancList}>
            {worldline.rows.map((row) => {
              const open = !!openAnchors[row.id]
              return (
                <li
                  key={row.id}
                  className={`${css.ancRow} ${css['anc_' + row.state]} ${row.current ? css.ancCur : ''}`}
                  data-anchor-row={row.id}
                  data-anchor-state={row.state}
                  data-anchor-current={row.current ? '1' : undefined}
                  aria-current={row.current ? 'step' : undefined}
                >
                  <button
                    type="button"
                    className={css.ancBtn}
                    aria-expanded={open}
                    data-anchor-toggle={row.id}
                    onClick={() => toggleAnchor(row.id)}
                    title={open ? '收起这一条' : '展开：不可动摇的那件事 / 可改的部分 / 替代形态 / 原文出处'}
                  >
                    <span className={`${css.ancBadge} ${css['bd_' + row.state]}`} data-anchor-badge={row.state}>
                      {row.stateLabel}
                    </span>
                    <span className={css.ancTitle}>{row.title}</span>
                    {row.current ? <span className={css.ancHere} data-anchor-here="1">当前段</span> : null}
                    <span className={css.ancSide}>
                      {row.state === 'landed'
                        ? `第 ${row.tick} 格 · ${row.howLabel}`
                        : row.state === 'due'
                          ? '就在这一段'
                          : row.dayAfter !== null
                            ? `第 ${row.dayAfter} 日之后`
                            : row.state === 'missed'
                              ? '已错过'
                              : '时机未到'}
                    </span>
                    <CaretDown size={12} weight="bold" className={`${css.ancChev} ${open ? css.ancChevOn : ''}`} />
                  </button>

                  {/* 已错过的那一行：把 fallback 的首句直接摆在行上 —— 收着也看得见「它该怎么回来」 */}
                  {row.state === 'missed' && row.missedNote ? (
                    <p className={css.ancMiss} data-anchor-missed={row.id}>{row.missedNote}</p>
                  ) : null}

                  {open ? (
                    <div className={css.ancDetail} data-anchor-detail={row.id}>
                      <div className={css.ancField}>
                        <span className={css.ancLabel}>不可动摇的那一件事</span>
                        <p className={css.ancText} data-anchor-outcome={row.id}>{row.outcome}</p>
                      </div>
                      {row.variables.length > 0 ? (
                        <div className={css.ancField}>
                          <span className={css.ancLabel}>可以改的部分</span>
                          <div className={css.chipRow}>
                            {row.variables.map((v) => (
                              <span key={v} className="chip">{v}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className={css.ancField}>
                        <span className={css.ancLabel}>绕开时的替代形态</span>
                        <p className={css.ancText}>{row.fallback}</p>
                      </div>
                      <span className={css.ancSrc}>原文 · {row.sourceRef}</span>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>

          {/* —— 偏离账本：world.records 里 diverged === true 的那几条 —— */}
          <div className={css.divHead}>
            <span className="panel__title">偏离账本 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
              与原著相异的收束 · {worldline.count.diverged} 段
            </span>
          </div>

          {worldline.diverged.length === 0 ? (
            <div className={css.divEmpty} data-diverged-empty="1">
              <b>还没有偏离过原著</b>
              <span>偏离由导演在收束时判定：那一段收得与原文不一样才记一笔。记下来之后这里就会多一行。</span>
            </div>
          ) : (
            <div className={css.divTable}>
              <div className={css.divCols} aria-hidden="true">
                <span>时间线事件</span>
                <span>收束方式</span>
                <span>摘要首句</span>
              </div>
              {worldline.diverged.map((d) => (
                <div key={d.eventId} className={css.divRow} data-diverged-row={d.eventId} data-diverged-mode={d.mode}>
                  <b className={css.divTitle}>{d.title}</b>
                  <span className={`${css.md} ${d.mode === 'online' ? css.mdOn : d.mode === 'offline' ? css.mdOff : css.mdOld}`}>
                    {REC_MODE_LABEL[d.mode]}
                  </span>
                  <span className={css.divDigest}>{d.digestFirst || '（这一条没有留下摘要）'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

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
                          <Portrait avatarId={id} size={30} />
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
                        {/* 与右下那一栏同一个写法：本色当字要先过 inkOf（见 lib/hue.ts） */}
                        <span className={css.charVal} style={{ color: met ? inkOf(c.hue) : 'var(--ink-faint)' }}>
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: 12 }}
                        data-rewind-event={r.eventId}
                        data-rewind-arm={rewindArm === r.eventId ? '1' : undefined}
                        onClick={() => doRewind(r.eventId)}
                        title="把这一段与它之后的所有记录一并撤下，推演退回这一段之前"
                      >
                        {rewindArm === r.eventId ? '再按一次确认' : '回到这一段之前'}
                      </button>
                      {rewindArm === r.eventId ? (
                        <span className="tiny" data-rewind-note="1" style={{ color: 'var(--ink-mute)', lineHeight: 1.7 }}>
                          这一段与它之后的记录都会撤下；正文、已登记的角色 / 图鉴不会回滚。
                        </span>
                      ) : null}
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
                    <span className={css.nm} style={{ color: met ? inkOf(c.hue) : 'var(--ink-faint)' }}>
                      {met ? c.name : '？？？'}
                    </span>
                    {met ? (
                      <>
                        <div className="meter" style={{ height: 6 }}>
                          <div className="meter__fill" style={{ width: `${v}%`, background: `linear-gradient(90deg, ${c.hue}55, ${c.hue})` }} />
                        </div>
                        <span className={css.val} style={{ color: inkOf(c.hue) }}>
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
