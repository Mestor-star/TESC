import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, ChatCircle, MapPin } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { CHARACTERS } from '../data/chars'
import { REGIONS } from '../data/regions'
import { TIMELINE } from '../data/timeline'
import { clamp, rSeverity } from '../lib/format'
import { opSituation } from '../lib/operator'
import type { Character } from '../data/types'

import css from './Dashboard.module.css'

const CIRC = 2 * Math.PI * 90

export function Dashboard() {
  const { operatorName, navigate, requestSms, focusRegion, setFocusId, epDone, bondNow, unlocked } = useTerminal()
  const name = operatorName.trim() ? operatorName : '言万心叶'
  const sit = opSituation(epDone)
  const sev = rSeverity(focusRegion.r)
  const doneEvents = useMemo(() => TIMELINE.filter((e) => epDone[e.id]).slice(-4).reverse(), [epDone])
  const f = clamp((focusRegion.r - 0.8) / 0.3, 0, 1)

  return (
    <div className="vpage">
      <div className={css.hero}>
        {/* 主欢迎卡 */}
        <div className={css.heroMain}>
          <div className={css.heroKicker}>TERMINAL / DASHBOARD</div>
          <h2 className={css.heroGreet}>
            欢迎回来，<em>{name}</em>
          </h2>
          <p className={css.heroText}>
            {sit.stage === 0
              ? '你以「临时访问」身份接入这台终端——一个曾被旧黑手党利用、能窥探人心的少年，无学园所属，尚未被委员会收编。'
              : sit.stage === 1
                ? '你是被收留在苍之学园的体验入学低语者——终末潜力登记为 Stage4『活性化』。'
                : '你已是苍之学园的正式生（转校生）——终末潜力登记为 Stage4『活性化』。'}
            以消息推进剧情，或切到离线通读原文；时间线正从第 1 卷等待你的落笔。
          </p>
          <div className={css.heroChips}>
            {sit.adopted ? <span className="chip chip--on">低语者 Susurrador</span> : null}
            <span className="chip">{sit.standing}</span>
            {unlocked ? (
              <span className="chip chip--on">作战子系统已解锁</span>
            ) : (
              <span className="chip chip--warn">任务 / 武装图鉴 / 终末图鉴 / 短信待解锁</span>
            )}
          </div>
          <div className={css.heroActions}>
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => navigate('plot')}>
              进入剧情 · 推演或通读 <ArrowRight size={13} weight="bold" />
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('lore')}>
              智库 · 世界观
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('archive')}>
              角色档案
            </button>
          </div>
        </div>

        {/* R 值仪表盘 */}
        <div className={css.gaugePanel}>
          <div className={css.gaugeWrap}>
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle
                className={css.ringFg}
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke={sev.color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - f)}
                style={{ filter: `drop-shadow(0 0 8px ${sev.color})` }}
              />
            </svg>
            <div className={css.gaugeCenter}>
              <span className={css.gaugeVal} style={{ color: sev.color }}>
                {focusRegion.r.toFixed(3)}<small>R</small>
              </span>
              <span className={css.gaugeTag} style={{ color: sev.color }}>{focusRegion.code}</span>
            </div>
          </div>
          <div className={css.gaugeName}>{focusRegion.name.split(' · ')[0]}</div>
          <div className={css.gaugeMeta}>
            <span>REALITY INDEX</span>
            <span className="mono" style={{ color: sev.color }}>{sev.label}</span>
          </div>
          <div className="tiny muted" style={{ textAlign: 'center', maxWidth: 300, lineHeight: 1.7, marginTop: 8 }}>
            {focusRegion.note}
          </div>
        </div>
      </div>

      {/* 威胁通告 / 平稳条 */}
      {focusRegion.threatStage > 0 ? (
        <div className={css.threat}>
          <div className={css.threatHazard} />
          <div className={css.threatBody}>
            <b>区域警戒 · {focusRegion.name}</b>
            <p>{focusRegion.note}</p>
          </div>
          <div className={css.threatStage}>
            <div className="num">{focusRegion.threatStage}</div>
            <div className="tiny muted" style={{ letterSpacing: '0.2em' }}>STAGE</div>
          </div>
        </div>
      ) : (
        <div className={css.threat} style={{ borderColor: 'rgba(63,224,160,0.4)', background: 'rgba(63,224,160,0.05)' }}>
          <div className={css.threatHazard} style={{ background: 'repeating-linear-gradient(-45deg, var(--jade) 0 10px, #0b0b13 10px 20px)' }} />
          <div className={css.threatBody}>
            <b style={{ color: 'var(--jade)' }}>本区观测平稳 · {focusRegion.name}</b>
            <p>未检出反现实干涉异常。观测信道保持畅通，等待下一段事件。</p>
          </div>
          <div className={css.threatStage}>
            <div className="num" style={{ color: 'var(--jade)' }}>0</div>
            <div className="tiny muted" style={{ letterSpacing: '0.2em' }}>STAGE</div>
          </div>
        </div>
      )}

      <div className="grid grid--3" style={{ gap: 18, alignItems: 'start' }}>
        {/* 小队状态 */}
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">出击小队 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}>委员会 · 恋兔队</span>
          </div>
          <div className="panel__body">
            <div className={css.stack}>
              {CHARACTERS.map((c: Character) => {
                const bond = bondNow(c.id)
                return (
                  <div key={c.id} className={css.squadRow} style={{ '--c': c.hue } as CSSProperties}>
                    <span className="glyph" style={{ '--g': c.hue, width: 38, height: 38 }}>
                      <span>{c.sigil}</span>
                    </span>
                    <div className={css.squadMeta}>
                      <b>{c.name} <span className="tiny muted" style={{ fontWeight: 400 }}>· {c.station}</span></b>
                      <small>{c.role} · {c.division.split(' · ').pop()}</small>
                      <div className={`${css.bondMini} meter`} style={{ height: 5 }}>
                        <div className="meter__fill" style={{ width: `${bond}%`, background: `linear-gradient(90deg, ${c.hue}66, ${c.hue})` }} />
                      </div>
                    </div>
                    <button
                      className={`${css.miniAction} btn--icon`}
                      style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="打开短信"
                      aria-label={`与 ${c.name} 短信`}
                      onClick={() => requestSms(c.id)}
                    >
                      <ChatCircle size={15} weight="bold" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* 区域 R 值 */}
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">区域干涉扫描 <span className="slash" /></span>
            <span className="muted tiny" style={{ marginLeft: 'auto' }}><MapPin size={11} weight="bold" /> {REGIONS.length} 区</span>
          </div>
          <div className="panel__body">
            <div className={css.stack}>
              {REGIONS.map((reg) => {
                const rs = rSeverity(reg.r)
                const focus = focusRegion.id === reg.id
                return (
                  <button
                    key={reg.id}
                    className={`${css.rRow} ${focus ? css.isFocus : ''}`}
                    style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}
                    onClick={() => setFocusId(reg.id)}
                  >
                    <span className={css.rRowName}>
                      <b>{reg.name}</b>
                      <small>{reg.code} · 现实密度</small>
                      <div className="meter" style={{ height: 5, marginTop: 5 }}>
                        <div
                          className="meter__fill"
                          style={{
                            width: `${clamp((reg.r - 0.8) / 0.3, 0, 1) * 100}%`,
                            background: `linear-gradient(90deg, ${rs.color}55, ${rs.color})`,
                          }}
                        />
                      </div>
                    </span>
                    <span className={css.rRowVal} style={{ color: rs.color }}>{reg.r.toFixed(3)}</span>
                    <span className={css.rRowDelta} style={{ color: reg.delta < 0 ? 'var(--red)' : 'var(--jade)' }}>
                      {reg.delta >= 0 ? '+' : ''}{reg.delta.toFixed(3)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* 最近推进 */}
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">时间线 · 最近推进 <span className="slash" /></span>
            <button className="linkGo" onClick={() => navigate('saga')}>全部 <ArrowRight size={11} /></button>
          </div>
          <div className="panel__body">
            {doneEvents.length === 0 ? (
              <div className="tiny muted" style={{ lineHeight: 1.8, padding: '4px 0' }}>
                尚未推进任何事件。前往「剧情推进」视图，从第 1 卷开始在线推演或离线通读。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {doneEvents.map((e) => (
                  <div key={e.id} className={css.tlItem}>
                    <span className={css.tlWhen}>
                      <b>{e.group.replace('·S1', '')}</b>
                      <small>{e.phase}</small>
                    </span>
                    <span className={css.tlBody}>
                      <b>{e.title}</b>
                      <p>{e.summary}</p>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
