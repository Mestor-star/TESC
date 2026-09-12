import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight, CalendarDots, Eye, Footprints, GitBranch, LockSimple, Quotes, Sword, UsersThree,
} from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { FoldAll, FoldHead, useFolds } from '../components/Fold'
import { Portrait } from '../components/Portrait'
import { Linkified } from '../components/Linkified'
import { listTasks, subscribeTasks, tasksVersion } from '../lib/smstasks'
import { TIMELINE } from '../data/timeline'
import {
  MEM_SECTIONS, memCounts, relationsOf, deedsOf, threadsOf, sightsOf, mindsOf, skillsOf, chronicleOf,
} from '../lib/memory'
import type { MemInput, MemSection } from '../lib/memory'

import css from './Memory.module.css'

/*
  情景记忆库 —— 七栏：人物关系 / 事迹 / 伏笔 / 见闻 / 心迹 / 技能 / 大事记。

  **本页不记东西**：一句话都不新写。七栏全部由 lib/memory.ts 的纯函数从终端已有的那几本账
  现场排出来（世界状态 / 归档记录 / 图鉴 / 心声 / 时期 / 托付），所以这一页永远与事实同源，
  不会出现「记忆跟存档对不上」。

  两条规矩落在界面上：
    · 没观测到的位置留白（未遇见的人不露名、未读完的卷不放心声、没走到的段写「未观测」），
      与终端别处的「？？？」一个口径；
    · 每一栏都能点回它真正的出处（关系 → 角色档案，见闻 → 终末图鉴，事迹 → 低语者日志）。
*/

const SEC_ICON: Record<MemSection, ReactNode> = {
  人物关系: <UsersThree size={15} weight="bold" />,
  事迹: <Footprints size={15} weight="bold" />,
  伏笔: <GitBranch size={15} weight="bold" />,
  见闻: <Eye size={15} weight="bold" />,
  心迹: <Quotes size={15} weight="bold" />,
  技能: <Sword size={15} weight="bold" />,
  大事记: <CalendarDots size={15} weight="bold" />,
}

const SEC_NOTE: Record<MemSection, string> = {
  人物关系: '已遇见的人，按此刻的分量排 —— 分母是这一路做过的事，不是读过多少段。',
  事迹: '已归档的每一段：收束当时写下的经过。最近的排在最前。',
  伏笔: '还悬着的东西：正卡着的一段、走了另一条路的那些、短信里应下的托付。',
  见闻: '已登记进图鉴的终末，重的排在前面。',
  心迹: '低语者读到的心声。整卷读完才回放 —— 没读完的只报条数。',
  技能: '此刻的他：时期、手里的武装、会使的那几手（还没解锁的也列着，标出来）。',
  大事记: '按卷编年。已归档的照实写，正卡着的一段照实写，再往后的只留位置。',
}

/** 归档时刻（0 = 旧档回填，没有确切时刻） */
function stamp(ts: number): string {
  if (!ts) return '回填'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function off(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? String(v) : '±0'
}

export function Memory() {
  const { world, epDone, records, bondNow, navigate, requestProfile, operatorName } = useTerminal()
  /* 托付（短信里应下的事）不在终端上下文里，由它自己的账本供给 */
  const taskVer = useSyncExternalStore(subscribeTasks, tasksVersion)
  const tasks = useMemo(() => listTasks(), [taskVer])

  const inp = useMemo<MemInput>(() => ({ world, epDone, records, bondNow, tasks }), [world, epDone, records, bondNow, tasks])

  const rels = useMemo(() => relationsOf(inp), [inp])
  const deeds = useMemo(() => deedsOf(inp), [inp])
  const threads = useMemo(() => threadsOf(inp), [inp])
  const sights = useMemo(() => sightsOf(inp), [inp])
  const minds = useMemo(() => mindsOf(inp), [inp])
  const skills = useMemo(() => skillsOf(inp), [inp])
  const chron = useMemo(() => chronicleOf(inp), [inp])
  const counts = useMemo(() => memCounts(inp), [inp])

  const mindRows = minds.reduce((n, g) => n + g.rows.length, 0)
  const mindSealed = minds.reduce((n, g) => n + (g.done ? 0 : g.total), 0)
  const displayOp = operatorName.trim() ? operatorName : '言万心叶'

  /* 七栏的收合。**默认全收起** —— 七栏叠起来是本很长的账，一屏放不下，
     先给目录与栏头（每栏都有计数），要看哪栏点哪栏。
     折这件事的机制是公用的（components/Fold.tsx）：栏头是按钮，栏体是它紧跟的
     下一个兄弟并标着 data-fold-body，收起由 tokens.css 的一条规则办。 */
  const folds = useFolds()
  /** 目录跳过去：那一栏若还收着，先展开再滚 —— 否则跳过去只剩一条栏头 */
  const jump = useCallback((s: MemSection) => {
    if (!folds.isOpen(s)) folds.toggle(s)
    const el = document.getElementById(`mem-${MEM_SECTIONS.indexOf(s)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [folds])

  /* 七栏的头：序号 + 名 + 一句「这一栏是什么」+ 计数（整行可点，点它就折叠 / 展开） */
  const head = (s: MemSection, n: number, extra?: ReactNode) => (
    <FoldHead k={s} open={folds.isOpen(s)} folds={folds} className="panel__head">
      <span className="panel__title">
        <i className={css.secIc}>{SEC_ICON[s]}</i>
        {s}
        <span className="slash" />
      </span>
      <span className="muted tiny" style={{ color: 'var(--ink-faint)' }}>{SEC_NOTE[s]}</span>
      <span className={css.grow} />
      {extra}
      <span className={`chip ${n > 0 ? 'chip--on' : 'chip--off'}`} data-mem-count={s}>{n}</span>
    </FoldHead>
  )

  return (
    <div className="vpage" data-mem>
      <div className="vhead">
        <div>
          <div className="vhead__kicker">MEMORY / SITUATIONAL</div>
          <h1>情景记忆库</h1>
          <div className="vhead__sub">
            这一页不新记东西。世上早有一摞各管一摊的账 —— 关系、记录、图鉴、心声、时期、托付 ——
            这里只是把它们按「{displayOp}此刻记得什么」重排一遍。没观测到的位置就空着，不替谁补。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip">遇见 {rels.length} 人</span>
          <span className="chip">收束 {counts.大事记}/{TIMELINE.length} 段</span>
          <span className="chip">记录 {records.length} 条</span>
          <span className={mindRows > 0 ? 'chip chip--on' : 'chip chip--off'}>心迹 {mindRows} 条</span>
          <span className={threads.length > 0 ? 'chip chip--warn' : 'chip chip--off'}>悬着 {threads.length} 件</span>
        </div>
      </div>

      <div className={css.layout}>
        {/* 索引：七栏的目录。空栏也留着 —— 「这一栏还空着」本身就是一条读数 */}
        <aside className={css.index} data-mem-nav>
          <div className={css.indexHead}>目录 · INDEX</div>
          {MEM_SECTIONS.map((s, i) => (
            <button key={s} className={css.indexRow} data-mem-jump={s} onClick={() => jump(s)} type="button">
              <span className={css.indexNo}>{String(i + 1).padStart(2, '0')}</span>
              <span className={css.indexIc}>{SEC_ICON[s]}</span>
              <span className={css.indexName}>{s}</span>
              <span className={css.indexVal} data-jump-count={s}>{counts[s]}</span>
            </button>
          ))}
          <div className={css.indexNote}>
            本页只读。要改动，去它各自的出处：关系在剧情里做出来，事迹在收束时写下，
            见闻在图鉴里登记，托付在短信里应下。
          </div>
        </aside>

        <div className={css.col}>
          {/* 折叠条：七栏默认都折着，这里一键摊开 / 收回（栏头自己也能逐栏点） */}
          <FoldAll folds={folds} keys={MEM_SECTIONS} label="七栏" />

          {/* —————————— 一、人物关系 —————————— */}
          <section className="panel" id="mem-0" data-mem-section="人物关系">
            {head('人物关系', rels.length)}
            <div className="panel__body" data-fold-body>
              {rels.length === 0 ? (
                <div className={css.empty}>
                  <b>还没有遇见谁</b>
                  <span>遇见的人会在这里按分量排队。分量只由行为累积 —— 读过哪一段、走到哪一天都不算。</span>
                </div>
              ) : (
                <div className={css.relList}>
                  {rels.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={css.relRow}
                      data-mem-rel={r.id}
                      onClick={() => { requestProfile(r.id); navigate('archive') }}
                      title={`调阅 ${r.name} 的档案`}
                    >
                      <Portrait avatarId={r.id} size={36} style={{ borderRadius: 4 }} />
                      <div className={css.relMain}>
                        <div className={css.relTop}>
                          <b>{r.name}</b>
                          {r.role ? <span className="tiny muted">{r.role}</span> : null}
                          <span className={css.grow} />
                          <span className={css.relStage}>{r.stage}</span>
                        </div>
                        <div className="meter" style={{ height: 6, marginTop: 5 }}>
                          <div className="meter__fill" style={{ width: `${Math.max(0, Math.min(100, r.bond))}%` }} />
                        </div>
                        <div className={css.relFoot}>
                          <span>羁绊 {r.bond}</span>
                          <span className={r.drift > 0 ? css.up : r.drift < 0 ? css.down : undefined}>
                            行为偏移 {off(r.drift)}
                          </span>
                          <span>{r.call ? `称「${r.call}」` : '称呼未定'}</span>
                          {r.locked !== null ? (
                            <span className={css.locked} title="那件事之后关系固定在这个值，不再随行为增减">
                              <LockSimple size={11} weight="bold" /> 已定 {r.locked}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <ArrowRight size={13} weight="bold" className={css.relGo} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* —————————— 二、事迹 —————————— */}
          <section className="panel" id="mem-1" data-mem-section="事迹">
            {head('事迹', deeds.length)}
            <div className="panel__body" data-fold-body>
              {deeds.length === 0 ? (
                <div className={css.empty}>
                  <b>还没有做下什么</b>
                  <span>每收束一段，这里就多一条：收束当时写下的经过。最近的排在最前。</span>
                </div>
              ) : (
                <div className={css.deedList}>
                  {deeds.map((d) => (
                    <article key={d.eventId} className={css.deed} data-mem-deed={d.eventId}>
                      <div className={css.deedHead}>
                        <span className={css.no}>{String(d.seq).padStart(2, '0')}</span>
                        <b>{d.title}</b>
                        {d.diverged ? (
                          <span className={css.diverge}><GitBranch size={11} weight="bold" /> 分歧</span>
                        ) : null}
                        <span className={css.grow} />
                        <span className={css.stamp}>{stamp(d.ts)}</span>
                      </div>
                      <div className={css.deedMeta}>{d.group} · {d.place}</div>
                      {d.digest ? (
                        <p className={css.digest}><Linkified text={d.digest} /></p>
                      ) : (
                        <p className={css.digestEmpty}>这一段没有留下经过（旧档只看得到它被收束过）。</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* —————————— 三、伏笔 —————————— */}
          <section className="panel" id="mem-2" data-mem-section="伏笔">
            {head('伏笔', threads.length)}
            <div className="panel__body" data-fold-body>
              {threads.length === 0 ? (
                <div className={css.empty}>
                  <b>眼下没有悬着的事</b>
                  <span>正卡着的一段、短信里应下的托付 —— 有一样，这里就多一条。</span>
                </div>
              ) : (
                <div className={css.threadList}>
                  {threads.map((t, i) => (
                    <div key={`${t.kind}-${i}`} className={css.thread} data-mem-thread={t.kind}>
                      <span
                        className={`chip ${t.kind === '进行中' ? 'chip--warn' : ''}`}
                        style={t.kind === '托付' ? { color: 'var(--violet, var(--steel))' } : undefined}
                      >
                        {t.kind}
                      </span>
                      <div className={css.threadMain}>
                        <b>{t.title}</b>
                        {t.detail ? <span className="tiny muted">{t.detail}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* —————————— 四、见闻 —————————— */}
          <section className="panel" id="mem-3" data-mem-section="见闻">
            {head('见闻', sights.length)}
            <div className="panel__body" data-fold-body>
              {sights.length === 0 ? (
                <div className={css.empty}>
                  <b>还没有登记过终末</b>
                  <span>遇到、并登记进终末图鉴的条目会在这里留下：出处、性质、危险度评定。</span>
                </div>
              ) : (
                <div className={css.sightList}>
                  {sights.map((s) => (
                    <article key={s.id} className={css.sight} data-mem-sight={s.id}>
                      <div className={css.sightHead}>
                        <span className="mono tiny" style={{ color: 'var(--ink-faint)' }}>No.{s.no}</span>
                        <b>{s.name}</b>
                        {s.alias ? <span className="tiny muted">{s.alias}</span> : null}
                        <span className={css.grow} />
                        <span className={css.stageChip}>Stage {s.stage}{s.stageKw}</span>
                        <span className="chip chip--off">{s.state}</span>
                      </div>
                      {s.origin ? <p className={css.origin}>{s.origin}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* —————————— 五、心迹 —————————— */}
          <section className="panel" id="mem-4" data-mem-section="心迹">
            {head('心迹', mindRows, mindSealed > 0 ? (
              <span className="chip chip--off" title="整卷读完才回放">封存 {mindSealed} 条</span>
            ) : null)}
            <div className="panel__body" data-fold-body>
              {minds.length === 0 ? (
                <div className={css.empty}>
                  <b>还没有读到谁的心声</b>
                  <span>心声按卷存放。整卷的每一段都归档了，这一卷的心声才现形 —— 提前摆出来就是剧透。</span>
                </div>
              ) : (
                <div className={css.mindList}>
                  {minds.map((g) => (
                    <div key={g.group} className={css.mindGroup} data-mem-mind-group={g.group} data-sealed={g.done ? '0' : '1'}>
                      <div className={css.mindHead}>
                        <b>{g.group}</b>
                        <span className={g.done ? 'chip chip--on' : 'chip chip--off'}>
                          {g.done ? `已读完 · ${g.rows.length} 条` : `未读完 · 封存 ${g.total} 条`}
                        </span>
                      </div>
                      {g.done ? (
                        g.rows.map((m, i) => (
                          <div key={`${g.group}-${i}`} className={css.mind} data-mem-mind={m.speaker}>
                            <div className={css.mindWho}>
                              <b>{m.speaker}</b>
                              <span className="tiny muted">{m.scene}</span>
                            </div>
                            <p className={css.mindText}>『<Linkified text={m.text} />』</p>
                          </div>
                        ))
                      ) : (
                        <div className={css.sealed}>
                          低语者在这一卷读到过 {g.total} 条心声，全部封存 —— 这一卷读完，一并回放。
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* —————————— 六、技能 —————————— */}
          <section className="panel" id="mem-5" data-mem-section="技能">
            {head('技能', skills.skills.length)}
            <div className="panel__body" data-fold-body>
              <div className={css.skillTop}>
                <div className={css.skillPeriod}>
                  <span className="vhead__kicker" style={{ fontSize: 9 }}>{skills.vol}</span>
                  <b className={css.skillTitle}>{skills.title}</b>
                  <span className="tiny muted">{skills.cls}</span>
                </div>
                <div className={css.skillNote}>{skills.note}</div>
              </div>

              <div className={css.armBox}>
                <div className={css.armHead}>
                  <Sword size={14} weight="bold" />
                  <b>{skills.arm}</b>
                  {skills.armSub ? <span className="tiny muted">{skills.armSub}</span> : null}
                </div>
                {skills.armNote ? <p className={css.armNote}>{skills.armNote}</p> : null}
                {skills.passive ? <div className={css.passive}>{skills.passive}</div> : null}
              </div>

              <div className={css.skillList}>
                {skills.skills.map((k) => (
                  <div key={k.name} className={css.skillRow} data-mem-skill={k.name} data-locked={k.locked ? '1' : '0'}>
                    <div className={css.skillName}>
                      <b>{k.name}</b>
                      <span className="chip chip--off">{k.kind}</span>
                      {k.locked ? (
                        <span className={css.locked}><LockSimple size={11} weight="bold" /> 未解锁</span>
                      ) : null}
                    </div>
                    <p className={css.skillDesc}>{k.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* —————————— 七、大事记 —————————— */}
          <section className="panel" id="mem-6" data-mem-section="大事记">
            {head('大事记', counts.大事记, <span className="chip chip--off">共 {TIMELINE.length} 段</span>)}
            <div className="panel__body" data-fold-body>
              <div className={css.chronList}>
                {chron.map((g) => (
                  <div key={g.group} className={css.chronGroup}>
                    <div className={css.chronHead}>
                      <b>{g.group}</b>
                      <span className="tiny muted">{g.doneCount}/{g.rows.length}</span>
                    </div>
                    {g.rows.map((r) => (
                      <div key={r.id} className={css.chronRow} data-mem-chron={r.id}
                        data-done={r.done ? '1' : '0'} data-unseen={r.unseen ? '1' : '0'}>
                        <span className={css.no}>{String(r.seq).padStart(2, '0')}</span>
                        <b className={r.unseen ? css.unseenTitle : undefined}>{r.title}</b>
                        <span className={css.chronPlace}>{r.place}{r.day ? ` · ${r.day}` : ''}</span>
                        <span className={css.grow} />
                        {r.diverged ? (
                          <span className={css.diverge}><GitBranch size={11} weight="bold" /> 分歧</span>
                        ) : null}
                        <span className={r.done ? css.chronTs : css.chronSealed}>
                          {r.done ? stamp(r.ts) : r.unseen ? '未观测' : '尚未收束'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
