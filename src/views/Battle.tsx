import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, CaretRight, Crosshair, Lightning, Shield, Sparkle } from '@phosphor-icons/react'

import { act, createBattle, digestOf, legalSkills } from '../lib/battle/engine'
import { narrateBattle, recordOf } from '../lib/battle/narrate'
import type { BattleRecord, BattleState, Combatant, FxKind, SkillSpec, StaminaState } from '../lib/battle/types'
import type { Mission } from '../data/types'

import css from './Battle.module.css'

interface Props {
  mission: Mission
  squad: string[]
  progress: number
  growth: Record<string, number>
  stamina: StaminaState
  /** 撤退：消耗已扣，不结算任务 */
  onExit: (spLeft: number) => void
  /** 归档：把已写完作战记录的一场交回上层落库 */
  onSettled: (rec: BattleRecord, spLeft: number) => void
}

interface FxView {
  n: number
  kind: FxKind
  actorId: string
  targetId?: string
  dmg?: number
  down?: boolean
}

const KIND_ICON: Record<string, typeof Lightning> = {
  普攻: CaretRight,
  技能: Lightning,
  启动: Sparkle,
  防御: Shield,
}

export function Battle({ mission, squad, progress, growth, stamina, onExit, onSettled }: Props) {
  const [st, setSt] = useState<BattleState>(() =>
    createBattle({ mission, squad, progress, growth, sp: stamina.cur, spMax: stamina.max }),
  )
  const [shown, setShown] = useState(0)
  const [fx, setFx] = useState<FxView | null>(null)
  const [aim, setAim] = useState<SkillSpec | null>(null)
  const [rec, setRec] = useState<BattleRecord | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [filed, setFiled] = useState(false)

  const playing = shown < st.log.length
  const over = st.phase !== 'select'
  const actor = useMemo(() => {
    const id = st.queue[st.at]
    return id ? [...st.allies, ...st.enemies].find((c) => c.id === id) : undefined
  }, [st])

  /* ---- 逐条回放战斗日志（每条配一次演出） ---- */
  useEffect(() => {
    if (shown >= st.log.length) {
      setFx(null)
      return
    }
    const e = st.log[shown]
    setFx({ n: shown, kind: e.fx, actorId: e.actorId, targetId: e.targetId, dmg: e.dmg, down: e.down })
    const hold = e.dmg || e.down ? 660 : 420
    const t = window.setTimeout(() => setShown((n) => n + 1), hold)
    return () => window.clearTimeout(t)
    // 依赖记在长度上：log 数组由引擎就地追加，引用不变
  }, [shown, st.log.length])

  /* ---- 收场即成文 ---- */
  useEffect(() => {
    if (!over || playing || rec || narrating) return
    setNarrating(true)
    const base = recordOf(st, digestOf(st))
    narrateBattle(base).then((done) => {
      setRec(done)
      setNarrating(false)
    })
  }, [over, playing, rec, narrating, st])

  const doAct = useCallback(
    (skillId: string, targetId?: string) => {
      if (playing || over) return
      setAim(null)
      // 引擎是就地推进的纯逻辑，这里换一个新引用交给 React ——
      // 否则 Object.is 判等会让下面的回放 effect 与 actor 记忆都不更新。
      setSt((s) => ({ ...act(s, skillId, targetId) }))
    },
    [playing, over],
  )

  const cast = (k: SkillSpec) => {
    if (k.cost > st.sp) return
    if (k.target === 'one') setAim(k)
    else doAct(k.id)
  }

  const recent = st.log.slice(Math.max(0, shown - 4), shown)
  const shake = fx && (fx.kind === 'blast' || fx.kind === 'noise')

  return (
    <div className={css.root} data-battle="1" data-phase={st.phase} data-shake={shake ? '1' : undefined}>
      {/* 全屏演出层 */}
      {fx ? <div key={fx.n} className={css.fx} data-fx={fx.kind} aria-hidden /> : null}

      {/* HUD */}
      <header className={css.hud}>
        <div className={css.hudL}>
          <span className={`${css.no} mono`}>{st.no} / S{st.stage}</span>
          <b className={css.title}>{st.title}</b>
          <span className="tiny muted">{st.place}</span>
        </div>
        <div className={css.hudR}>
          <span className={css.round} data-round={st.round}>回合 <b>{st.round}</b></span>
          <div className={css.spWrap} title="小队体力 · 只在执行任务时消耗">
            <span className="tiny mono" style={{ letterSpacing: '0.14em' }}>体力</span>
            <div className={css.spBar}>
              <i style={{ width: `${(st.sp / st.spMax) * 100}%` }} data-low={st.sp <= 30 ? '1' : undefined} />
            </div>
            <span className="tiny mono">{st.sp}/{st.spMax}</span>
          </div>
          {over ? null : (
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => onExit(st.sp)}>
              <ArrowLeft size={13} /> 撤出
            </button>
          )}
        </div>
      </header>

      {/* 敌阵 */}
      <div className={css.ranks}>
        <div className={css.rankLabel}>敌方 · {st.enemies.length}</div>
        <div className={css.rank}>
          {st.enemies.map((c) => (
            <Unit
              key={c.id}
              c={c}
              fx={fx}
              active={!over && actor?.id === c.id}
              targetable={!!aim && !c.down && !playing}
              onPick={() => aim && doAct(aim.id, c.id)}
            />
          ))}
        </div>
      </div>

      {/* 我方 */}
      <div className={css.ranks}>
        <div className={css.rank}>
          {st.allies.map((c) => (
            <Unit key={c.id} c={c} fx={fx} active={!over && actor?.id === c.id} />
          ))}
        </div>
        <div className={css.rankLabel}>我方 · 小队</div>
      </div>

      {/* 控制台：左日志 / 右指令 */}
      <div className={css.console}>
        <div className={css.logBox} data-battle-log>
          {recent.length === 0 ? (
            <div className="tiny muted">观测频道静默。</div>
          ) : (
            recent.map((e, i) => (
              <div key={`${e.actorId}-${e.skillId}-${i}`} className={css.logLine} data-log-side={e.side}>
                {e.line ? <span className={css.line}>{e.line}</span> : null}
                <span className={css.logTxt}>
                  <b>{e.actor}</b> · {e.skill}
                  {e.target ? <span className="muted"> → {e.target}</span> : null}
                  {e.dmg ? <span className={css.dmgTag}> {e.dmg}</span> : null}
                  {e.down ? <span className={css.downTag}> 失能</span> : null}
                  {e.note ? <span className="muted"> · {e.note}</span> : null}
                </span>
              </div>
            ))
          )}
        </div>

        <div className={css.cmd}>
          {over ? (
            <Result rec={rec} narrating={narrating} filed={filed} st={st}
              onFile={() => { if (rec && !filed) { setFiled(true); onSettled(rec, st.sp) } }} />
          ) : playing ? (
            <div className={css.wait}>
              <span className="mono tiny" style={{ letterSpacing: '0.2em' }}>OBSERVING…</span>
              <span className="tiny muted">记录回放中。</span>
            </div>
          ) : aim ? (
            <div className={css.aimBox} data-battle-aim>
              <div className={css.aimHead}>
                <Crosshair size={14} weight="bold" />
                <b>{aim.name}</b>
                <span className="tiny muted">选择目标 · 点敌阵中任一单位</span>
              </div>
              <div className="tiny muted">{aim.desc}</div>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setAim(null)}>取消</button>
            </div>
          ) : actor ? (
            <>
              <div className={css.who}>
                <span className="glyph" style={{ '--g': actor.hue } as CSSProperties}>
                  <span style={{ fontSize: 14 }}>{actor.sigil}</span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{actor.name}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {actor.startNeed > 0 && actor.startUsed < actor.startNeed
                      ? `封印 ${actor.startUsed}/${actor.startNeed} · 普攻与技能尚未解禁`
                      : actor.scar ? `樱印 ${actor.stack}` : actor.note ?? '待命'}
                  </span>
                </span>
              </div>
              <div className={css.skillList} data-skill-list data-actor={actor.id}>
                {legalSkills(actor).map((k) => {
                  const poor = k.cost > st.sp
                  const Icon = KIND_ICON[k.kind] ?? CaretRight
                  return (
                    <button
                      key={k.id}
                      type="button"
                      data-skill={k.id}
                      data-kind={k.kind}
                      className={`${css.skill} ${k.kind === '启动' ? css.skillStart : ''} ${poor ? css.skillPoor : ''}`}
                      disabled={poor}
                      title={k.desc + (poor ? '（体力不足）' : '')}
                      onClick={() => cast(k)}
                    >
                      <span className={css.skillIc} data-kind={k.kind}><Icon size={13} weight="bold" /></span>
                      <span className={css.skillName}>{k.name}</span>
                      <span className={css.skillCost}>{k.cost ? `${k.cost} 体力` : '无耗'}</span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ---------- 单位卡 ---------- */

function Unit({
  c, fx, active, targetable, onPick,
}: {
  c: Combatant
  fx: FxView | null
  active?: boolean
  targetable?: boolean
  onPick?: () => void
}) {
  const hit = fx && fx.targetId === c.id
  const hpPct = (c.hp / c.hpMax) * 100
  return (
    <div
      className={`${css.unit} ${c.down ? css.unitDown : ''} ${active ? css.unitActive : ''} ${targetable ? css.unitAim : ''}`}
      data-unit={c.id}
      data-side={c.side}
      data-down={c.down ? '1' : undefined}
      style={{ '--u': c.hue } as CSSProperties}
      onClick={targetable ? onPick : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
    >
      <div className={css.unitFace}>
        <span className="glyph" style={{ '--g': c.hue } as CSSProperties}>
          <span style={{ fontSize: 16 }}>{c.sigil}</span>
        </span>
        {c.startNeed > 0 ? (
          <span className={css.unitGate} title={`解封 ${c.startUsed}/${c.startNeed}`}>
            {c.startUsed}/{c.startNeed}
          </span>
        ) : null}
      </div>
      <div className={css.unitBody}>
        <div className={css.unitName}>
          <b>{c.name}</b>
          {c.rated ? null : <span className={css.unitUnrated}>未评定</span>}
        </div>
        <div className={css.hpBar}>
          <i style={{ width: `${hpPct}%` }} data-low={hpPct <= 30 ? '1' : undefined} />
        </div>
        <div className={`${css.unitMeta} mono`}>
          <span>{c.hp}/{c.hpMax}</span>
          {c.side === 'enemy' ? <span title={c.tags.join(' · ')}>{c.tags.join('·')}</span> : <span>敏 {c.axes.敏捷度}</span>}
        </div>
      </div>
      {hit && fx.dmg ? <span key={fx.n} className={css.dmgNum}>{fx.dmg}</span> : null}
      {hit && fx.down ? <span className={css.downMark}>失能</span> : null}
    </div>
  )
}

/* ---------- 收场面板 ---------- */

function Result({
  rec, narrating, filed, st, onFile,
}: {
  rec: BattleRecord | null
  narrating: boolean
  filed: boolean
  st: BattleState
  onFile: () => void
}) {
  const win = st.phase === 'won'
  if (narrating || !rec) {
    return (
      <div className={css.wait}>
        <span className="mono tiny" style={{ letterSpacing: '0.2em' }}>COMPILING…</span>
        <span className="tiny muted">正在成文作战记录。</span>
      </div>
    )
  }
  return (
    <div className={css.result} data-battle-result={rec.outcome}>
      <div className={css.resultHead}>
        <b data-outcome={rec.outcome}>{win ? '作战成功' : '撤出 · 未达成'}</b>
        <span className="tiny muted">
          {rec.rounds} 回合 · 出力最重 {rec.mvp} · 成文方式 {rec.narrativeBy}
        </span>
      </div>
      <div className={css.resultBody} data-battle-narrative>
        {rec.narrative}
      </div>
      <button className="btn btn--primary" style={{ fontSize: 12 }} disabled={filed} onClick={onFile}>
        {filed ? '已归档' : '归档并返回任务板'}
      </button>
    </div>
  )
}
