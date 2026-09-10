import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowLeft, Backpack, CaretRight, Crosshair, Lightning, Shield, Sneaker, Swap, X,
} from '@phosphor-icons/react'

import {
  act, chargeOf, createBattle, digestOf, legalSkills, lootOddsOf, rewardOf,
} from '../lib/battle/engine'
import type { Command } from '../lib/battle/engine'
import { iconNameOf, iconOf } from '../lib/battle/icons'
import { narrateBattle, recordOf } from '../lib/battle/narrate'
import { GEAR_OF, ITEMS, ITEM_OF, rollLoot } from '../lib/battle/gear'
import type { GearDef } from '../lib/battle/types'
import { POWER_SCALE } from '../lib/battle/roster'
import { bondsOf, synergiesOf } from '../lib/battle/synergy'
import { rBadgeOf } from '../lib/battle/rvalue'
import { TUNING } from '../lib/battle/tuning'
import type { BattleRecord, BattleState, Combatant, FxKind, SkillSpec, StaminaState } from '../lib/battle/types'
import type { Mission } from '../data/types'
import { personOf } from '../data/castmeta'
import { Portrait } from '../components/Portrait'

import css from './Battle.module.css'

interface Props {
  mission: Mission
  squad: string[]
  progress: number
  growth: Record<string, number>
  stamina: StaminaState
  /** 每人的反现实辅助装备（开局带入；收场写回） */
  equip: Record<string, string>
  /** 装具库存（决定换装面板里能选什么） */
  owned: Record<string, number>
  /** 携带的道具余量 */
  bag: Record<string, number>
  /** 「变成他人」可借的档案池（已解锁、且不在本场队伍里的角色 id） */
  morphPool?: string[]
  /** 终末点数（结算后写回） */
  coin: number
  /** 撤出：消耗已扣，不结算任务 */
  onExit: (spLeft: number, equip: Record<string, string>) => void
  /** 归档：把已写完作战记录的一场交回上层落库 */
  onSettled: (
    rec: BattleRecord, spLeft: number, equip: Record<string, string>, bag: Record<string, number>,
  ) => void
}

interface FxView {
  n: number
  kind: FxKind
  actorId: string
  /** 这一手是谁的哪一招 —— 特效按技能 id 取色与变奏，招招不同 */
  skillId: string
  skill: string
  targetId?: string
  dmg?: number
  down?: boolean
}

/** 技能 id → 稳定的色相与变奏号（同一招永远同一副样子，不同招互不相同） */
function fxSeed(skillId: string): { hue: number; variant: number; dir: number } {
  let h = 2166136261
  for (let i = 0; i < skillId.length; i++) {
    h ^= skillId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = Math.abs(h)
  return { hue: u % 360, variant: u % 4, dir: (u >> 3) % 2 === 0 ? 1 : -1 }
}

/** 指令菜单 —— 顺序即固定顺序：攻击 / 技能 / 道具 / 防御 / 更换装备 / 战略撤退 */
type Panel = 'root' | 'skill' | 'item' | 'gear' | 'flee' | 'aim' | 'morph'

const SEQ = [
  { id: 'atk', label: '攻击', Icon: CaretRight },
  { id: 'skill', label: '技能', Icon: Lightning },
  { id: 'item', label: '道具', Icon: Backpack },
  { id: 'guard', label: '防御', Icon: Shield },
  { id: 'gear', label: '更换装备', Icon: Swap },
  { id: 'flee', label: '战略撤退', Icon: Sneaker },
] as const

export function Battle({
  mission, squad, progress, growth, stamina, equip, owned, bag, coin, morphPool, onExit, onSettled,
}: Props) {
  const [st, setSt] = useState<BattleState>(() =>
    createBattle({
      mission, squad, progress, growth, gear: equip,
      sp: stamina.cur, spMax: stamina.max, bag, coin, morphPool,
    }),
  )
  const [shown, setShown] = useState(0)
  const [fx, setFx] = useState<FxView | null>(null)
  const [panel, setPanel] = useState<Panel>('root')
  /** 待选目标的指令（攻击 / 单体技能 / 单体道具 / 单体装具技） */
  const [pending, setPending] = useState<Command | null>(null)
  const [rec, setRec] = useState<BattleRecord | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [filed, setFiled] = useState(false)
  const [equipMap, setEquipMap] = useState<Record<string, string>>(equip)
  /** 结算只走一次（严格模式下 effect 会被重放） */
  const settled = useRef(false)

  /* 战场所在的 R 值（与任务简报同一口径）：出招前知道这地方把敌人抬了多少 */
  const siteR = useMemo(() => rBadgeOf(st.place, st.stage), [st.place, st.stage])
  const playing = shown < st.log.length
  const over = st.phase !== 'select'
  const actor = useMemo(
    () => (st.actor ? [...st.allies, ...st.enemies].find((c) => c.id === st.actor) : undefined),
    [st],
  )

  /* ---- 羁绊挂牌：本场成立了哪几条，连携的共鸣槽蓄到几拍 ---- */
  const synergyRow = useMemo(() => {
    const ids = st.allies.map((c) => c.id)
    const bonds = new Map<string, ReturnType<typeof bondsOf>[number]>()
    for (const b of bondsOf(ids)) {
      bonds.set(b.id, b)
      // 整队连携（xxx-full）挂在同一条羁绊名下
      if (b.id.endsWith('-full')) bonds.set(b.id.slice(0, -5), b)
    }
    return synergiesOf(ids).map((s) => {
      const b = bonds.get(s.id)
      return {
        id: s.id, name: s.name, desc: s.desc, mark: s.mark,
        link: b
          ? { name: b.link.name, desc: b.link.desc, need: b.need, cur: Math.min(b.need, st.link?.[b.id] ?? 0) }
          : null,
      }
    })
  }, [st])

  /* ---- 行动顺位：还差几拍轮到自己 ---- */
  const order = useMemo(() => {
    return [...st.allies, ...st.enemies]
      .filter((c) => !c.down && c.gone <= 0)
      .map((c) => {
        const pct = Math.min(100, (c.bar / TUNING.barMax) * 100)
        const ready = c.bar >= TUNING.barMax
        const eta = ready ? 0 : Math.max(1, Math.ceil((TUNING.barMax - c.bar) / Math.max(0.5, chargeOf(c))))
        return { c, pct, ready, eta }
      })
      .sort((a, b) => a.eta - b.eta || b.pct - a.pct)
  }, [st])

  /* ---- 逐条回放战斗日志（每条配一次演出） ---- */
  useEffect(() => {
    if (shown >= st.log.length) {
      setFx(null)
      return
    }
    const e = st.log[shown]
    setFx({
      n: shown, kind: e.fx, actorId: e.actorId, skillId: e.skillId, skill: e.skill,
      targetId: e.targetId, dmg: e.dmg, down: e.down,
    })
    const hold = e.dmg || e.down ? 620 : 380
    const t = window.setTimeout(() => setShown((n) => n + 1), hold)
    return () => window.clearTimeout(t)
    // 依赖记在长度上：log 数组由引擎就地追加，引用不变
  }, [shown, st.log.length])

  /* ---- 收场：结算战利品，然后成文 ---- */
  useEffect(() => {
    if (!over || playing || narrating || settled.current) return
    settled.current = true
    {
      // 没打过就什么都不留：败 / 撤不结算、不归档
      if (st.phase === 'won') {
        const r = rewardOf(st)
        st.coin += r.coin
        if (r.loot) st.loot.push(rollLoot(st.stage).id)
      }
      setNarrating(true)
      const base = recordOf(st, digestOf(st))
      narrateBattle(base).then((done) => {
        setRec(done)
        setNarrating(false)
      })
    }
  }, [over, playing, rec, narrating, st])

  const play = useCallback(
    (cmd: Command) => {
      setPending(null)
      setPanel('root')
      // 引擎就地推进：这里换一个新引用交给 React —— 否则 Object.is 判等会让回放与 actor 记忆都不更新
      setSt((s) => ({ ...act(s, cmd) }))
    },
    [],
  )

  /** 指令需要选目标吗 */
  const needsTarget = (cmd: Command): boolean => {
    if (cmd.t === 'atk') return true
    if (cmd.t === 'skill') {
      const k = actor ? legalSkills(actor, st).find((x) => x.id === cmd.skillId) : undefined
      return !!k && (k.target === 'one' || k.target === 'allyOne')
    }
    if (cmd.t === 'item') {
      const it = ITEM_OF[cmd.itemId]
      return !!it && (it.target === 'one' || it.target === 'enemyOne')
    }
    return false
  }

  /** 「变成他人」不点战场单位，而是从可借的档案里挑一个人 */
  const morphOf = (cmd: Command | null) => {
    if (!cmd || cmd.t !== 'skill' || !actor) return undefined
    return legalSkills(actor, st).find((x) => x.id === cmd.skillId)?.morph ? cmd : undefined
  }

  const issue = (cmd: Command) => {
    if (playing || over) return
    if (morphOf(cmd)) {
      setPending(cmd)
      setPanel('morph')
      return
    }
    if (needsTarget(cmd)) {
      setPending(cmd)
      setPanel('aim')
      return
    }
    play(cmd)
  }

  const pickTarget = (id: string) => {
    if (!pending) return
    play({ ...pending, targetId: id } as Command)
  }

  /** 换装：不消耗回合 —— 引擎改完面板后仍是本人待令 */
  const doEquip = (gearId: string | null) => {
    if (!actor) return
    const next = { ...equipMap }
    if (gearId) next[actor.id] = gearId
    else delete next[actor.id]
    setEquipMap(next)
    setSt((s) => ({ ...act(s, { t: 'equip', gearId }) }))
  }

  const recent = st.log.slice(Math.max(0, shown - 5), shown)
  const shake = !!fx && (fx.kind === 'blast' || fx.kind === 'noise')
  const aimEnemies = panel === 'aim' && (!pending || pending.t !== 'item' || ITEM_OF[pending.itemId].target === 'enemyOne')
  const aimAllies = panel === 'aim' && !aimEnemies

  /*
    作战屏走 portal 挂到 body 上。
    任务板 / 剧情页的容器带 transform，fixed 会被它当成包含块 ——
    直接渲染的话，作战界面会被压进简报那一栏里，还得上下翻。
    挂到 body 之后它才是一块真正独占视图的界面：1920×1080 一屏装得下。
  */
  return createPortal(
    <div className={css.root} data-battle="1" data-phase={st.phase} data-shake={shake ? '1' : undefined}>
      {/* 全屏演出层 */}
      {fx ? (
        <div
          key={fx.n}
          className={css.fx}
          data-fx={fx.kind}
          data-fx-var={fxSeed(fx.skillId).variant}
          data-fx-dir={fxSeed(fx.skillId).dir === 1 ? 'r' : 'l'}
          style={{
            '--fx-hue': fxSeed(fx.skillId).hue,
            '--fx-rot': `${fxSeed(fx.skillId).variant * 45}deg`,
          } as CSSProperties}
          aria-hidden
        >
          <span className={css.fxTag} data-fx-tag={fx.skillId}>{fx.skill}</span>
        </div>
      ) : null}

      {/* 作战屏 —— 自成一块「游戏窗口」，不铺满整个浏览器宽度
          （铺满会让指令窗与小队列隔得太远，出招时眼睛要横跨半屏） */}
      <div className={css.stage}>

      {/* HUD */}
      <header className={css.hud}>
        <div className={css.hudL}>
          <span className={`${css.no} mono`}>{st.no} / S{st.stage}</span>
          <b className={css.title}>{st.title}</b>
          <span className="tiny muted">{st.place}</span>
          <span className={css.siteR} data-r-badge title={`${siteR.reading.note}
${siteR.f.word}`}>
            R {siteR.reading.r.toFixed(3)}
            {siteR.f.out ? ` · 敌 +${Math.round((siteR.f.mul - 1) * 100)}%` : ' · 常规'}
          </span>
        </div>
        <div className={css.hudR}>
          {/* 羁绊：谁跟谁一起上阵、连携的共鸣槽还差几拍（连携不由玩家点，槽满自己接上） */}
          {synergyRow ? (
            <div className={css.traitRow} data-synergy-row>
              {synergyRow.map((t) => (
                <span
                  key={t.id}
                  className={css.traitChip}
                  data-synergy={t.id}
                  title={`${t.desc}${t.link ? `　连携：${t.link.name} —— ${t.link.desc}` : ''}`}
                >
                  <b>{t.name}</b>
                  {t.link ? (
                    <i className={css.linkGauge} data-link-gauge={t.id} data-full={t.link.cur >= t.link.need ? '1' : undefined}>
                      {t.link.cur}/{t.link.need}
                    </i>
                  ) : (
                    <i className={css.traitMark}>{t.mark}</i>
                  )}
                </span>
              ))}
            </div>
          ) : null}
          <span className={css.round} data-hand={st.hand}>
            第 <b>{st.hand}</b> 手 <span className="tiny muted">/ {st.tick} 拍</span>
          </span>
          <div className={css.spWrap} title="小队体力 · 只在出击时扣，随观测间隔回补；出手消耗的是各人自己的体力">
            <span className="tiny mono" style={{ letterSpacing: '0.14em' }}>小队体力</span>
            <div className={css.spBar}>
              <i style={{ width: `${(st.sp / st.spMax) * 100}%` }} data-low={st.sp <= 30 ? '1' : undefined} />
            </div>
            <span className="tiny mono">{st.sp}/{st.spMax}</span>
          </div>
          {over ? null : (
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => onExit(st.sp, equipMap)}>
              <ArrowLeft size={13} /> 撤出
            </button>
          )}
        </div>
      </header>

      {/* 行动顺位 —— 把每个人的行动条摊开排一行：谁先动、还差几拍，出招前一眼看得清 */}
      <div className={css.orderStrip} data-order-strip>
        <span className={`${css.orderCap} tiny mono`}>
          <Sneaker size={13} /> 行动顺位
        </span>
        <div className={css.orderCards}>
          {order.map(({ c, pct, ready, eta }, i) => (
            <span
              key={c.id}
              className={css.orderCard}
              data-order={c.id}
              data-side={c.side}
              data-ready={ready ? '1' : undefined}
              data-next={i === 0 && !ready ? '1' : undefined}
              style={{ '--u': c.hue } as CSSProperties}
              title={`${c.name} · 行动条 ${Math.round(pct)}%${ready ? ' · 已待命' : ` · 约 ${eta} 拍后出手`}`}
            >
              <i className={css.orderSigil}>{c.sigil}</i>
              <b>{c.name}</b>
              <span className={css.orderBar}>
                <i style={{ width: `${pct}%` }} />
              </span>
              <em className="mono">{ready ? '待命' : `${eta} 拍`}</em>
            </span>
          ))}
        </div>
      </div>

      {/* 敌阵 —— 居中、放大；名字在头顶，数值与状态在脚下 */}
      <div className={css.arena} data-enemy-field>
        <div className={css.enemyRow}>
          {st.enemies.map((c) => (
            <Foe
              key={c.id}
              c={c}
              fx={fx}
              active={!over && actor?.id === c.id}
              targetable={aimEnemies && !c.down && !playing}
              onPick={() => pickTarget(c.id)}
            />
          ))}
        </div>
      </div>

      {/* 战报条 —— 贴着敌阵脚下的一条滚动字幕，出战况不占地方 */}
      <div className={css.logStrip} data-battle-log>
        <div className={css.logCap}>
          观测频道
          <i className={css.logSlash} />
        </div>
        <div className={css.logLines}>
          {recent.length === 0 ? (
            <div className="tiny muted">观测频道静默。</div>
          ) : (
            recent.map((e, i) => (
              <div
                key={`${e.actorId}-${e.skillId}-${i}`}
                className={`${css.logLine} ${e.skillId.startsWith('link-') ? css.logLink : ''}`}
                data-log-side={e.side}
                data-log-link={e.skillId.startsWith('link-') ? '1' : undefined}
              >
                {e.line ? <span className={css.line} data-log-line>{e.line}</span> : null}
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
      </div>

      {/* 下窗 —— 左指令 / 右小队（black souls 式：出招与看血在同一块里） */}
      <div className={css.console}>
        <div className={css.cmd} data-battle-cmd data-actor={!over && !playing && actor ? actor.id : undefined}>
          {over ? (
            <Result
              rec={rec}
              narrating={narrating}
              filed={filed}
              st={st}
              onFile={() => {
                if (!rec || filed) return
                if (st.phase !== 'won') { onExit(st.sp, equipMap); return }
                setFiled(true)
                onSettled(rec, st.sp, equipMap, st.bag)
              }}
            />
          ) : playing ? (
            <div className={css.wait}>
              <span className="mono tiny" style={{ letterSpacing: '0.2em' }}>OBSERVING…</span>
              <span className="tiny muted">记录回放中。</span>
            </div>
          ) : !actor ? (
            <div className={css.wait}>
              <span className="tiny muted">等待行动条充能。</span>
            </div>
          ) : (
            <>
              <div className={css.who}>
                <span className="glyph" style={{ '--g': actor.hue } as CSSProperties}>
                  <span style={{ fontSize: 14 }}>{actor.sigil}</span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{actor.name}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {actor.cls}
                    {actor.startNeed > 0 && actor.startUsed < actor.startNeed
                      ? ` · 封印 ${actor.startUsed}/${actor.startNeed} · 普攻与技能尚未解禁`
                      : actor.scar ? ` · 樱印 ${actor.stack}` : actor.note ? ` · ${actor.note}` : ''}
                  </span>
                </span>
              </div>

              {panel === 'root' ? (
                <div className={css.seq} data-command-menu>
                  {SEQ.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      data-cmd={b.id}
                      className={css.seqBtn}
                      onClick={() => {
                        if (b.id === 'atk') {
                          const k = legalSkills(actor, st).find((x) => x.kind === '普攻')
                          if (k) issue({ t: 'atk', targetId: '' })
                        } else if (b.id === 'guard') issue({ t: 'guard' })
                        else setPanel(b.id as Panel)
                      }}
                    >
                      <b.Icon size={14} weight="bold" />
                      <span>{b.label}</span>
                      {b.id === 'flee' ? <span className={css.seqSub}>{Math.round(st.fleeOdds * 100)}%</span> : null}
                      {b.id === 'gear' ? <span className={css.seqSub}>不耗回合</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}

              {panel === 'skill' ? (
                <SubPanel title="技能" onBack={() => setPanel('root')}>
                  <div className={css.list} data-skill-list data-actor={actor.id}>
                    {legalSkills(actor, st).map((k) => (
                      <SkillBtn
                        key={k.id}
                        k={k}
                        sp={actor.sp}
                        cd={actor.cds[k.id] ?? 0}
                        onClick={() => { setPanel('root'); issue({ t: 'skill', skillId: k.id }) }}
                      />
                    ))}
                  </div>
                </SubPanel>
              ) : null}

              {panel === 'item' ? (
                <SubPanel title="道具" onBack={() => setPanel('root')}>
                  <div className={css.list} data-item-list>
                    {ITEMS.map((it) => {
                      const n = st.bag[it.id] ?? 0
                      return (
                        <button
                          key={it.id}
                          type="button"
                          data-item={it.id}
                          className={`${css.row} ${n <= 0 ? css.rowPoor : ''}`}
                          disabled={n <= 0}
                          title={it.desc}
                          onClick={() => issue({ t: 'item', itemId: it.id })}
                        >
                          <SkillIcon id={`item-${it.id}`} />
                          <span className={css.rowName}>{it.name}</span>
                          <span className={css.rowCost}>×{n}</span>
                          <span className={css.rowDesc} data-item-desc>{it.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </SubPanel>
              ) : null}

              {panel === 'gear' ? (
                <SubPanel title="更换装备 · 不消耗回合" onBack={() => setPanel('root')}>
                  <div className={css.list} data-gear-list data-actor={actor.id}>
                    <button
                      type="button"
                      data-gear="__none"
                      className={`${css.row} ${!actor.gear ? css.rowOn : ''}`}
                      onClick={() => doEquip(null)}
                    >
                      <span className={css.rowName}>不装配</span>
                      <span className={css.rowCost}>—</span>
                    </button>
                    {Object.keys(owned)
                      .filter((gid) => (owned[gid] ?? 0) > 0 && GEAR_OF[gid])
                      .map((gid) => {
                        const g = GEAR_OF[gid]
                        const on = actor.gear === gid
                        return (
                          <button
                            key={gid}
                            type="button"
                            data-gear={gid}
                            className={`${css.row} ${on ? css.rowOn : ''}`}
                            title={g.desc}
                            onClick={() => doEquip(gid)}
                          >
                            <SkillIcon id={`gear-${gid}`} />
                            <span className={css.rowName}>
                              {g.name}
                              <i className={css.rowSub}>{g.sub}</i>
                            </span>
                            <span className={css.rowCost}>{on ? '装配中' : `×${owned[gid]}`}</span>
                            <span className={css.rowDesc} data-gear-desc>{g.desc}</span>
                            <span className={css.rowNotes} data-gear-notes>
                              {gearNotes(g).map((n, i) => <i key={`${i}-${n}`}>{n}</i>)}
                            </span>
                          </button>
                        )
                      })}
                  </div>
                </SubPanel>
              ) : null}

              {panel === 'flee' ? (
                <SubPanel title="战略撤退" onBack={() => setPanel('root')}>
                  <div className={css.fleeBox} data-flee-panel>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      脱出成功率按双方行动条速度差评估：<b>{Math.round(st.fleeOdds * 100)}%</b>。
                      撤退失败这一手即告作废，敌方照常行动。
                    </p>
                    <button className={css.risk} type="button" data-flee-go onClick={() => play({ t: 'flee' })}>
                      执行撤退
                    </button>
                  </div>
                </SubPanel>
              ) : null}

              {panel === 'morph' ? (
                <div className={css.aimBox} data-battle-morph>
                  <div className={css.aimHead}>
                    <Crosshair size={14} weight="bold" />
                    <b>变成他人 · 选择要借的档案</b>
                    <button className={css.x} type="button" onClick={() => { setPending(null); setPanel('root') }}>
                      <X size={13} />
                    </button>
                  </div>
                  <span className="tiny muted">
                    只借已经解锁、且此刻不在队伍里的档案。变身期间连能力一并复制，三拍后归还。
                  </span>
                  <div className={css.morphRow}>
                    {st.morphPool.length === 0 ? (
                      <span className="tiny muted" style={{ color: 'var(--ink-faint)' }}>
                        此刻没有可借的档案 —— 已解锁的人都在这支队伍里。
                      </span>
                    ) : null}
                    {st.morphPool.map((id) => {
                      const p = personOf(id)
                      return (
                        <button
                          key={id}
                          type="button"
                          data-morph-pick={id}
                          className={css.morphChip}
                          style={{ '--c': p?.hue ?? 'var(--line)' } as CSSProperties}
                          onClick={() => { setPending(null); setPanel('root'); play({ ...(pending as Command), targetId: id } as Command) }}
                        >
                          <Portrait avatarId={id} width={28} style={{ width: 28, height: 28, borderRadius: 2 }} />
                          <span>{p?.name ?? id}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {panel === 'aim' ? (
                <div className={css.aimBox} data-battle-aim>
                  <div className={css.aimHead}>
                    <Crosshair size={14} weight="bold" />
                    <b>{aimLabel(st, pending)}</b>
                    <button className={css.x} type="button" onClick={() => { setPending(null); setPanel('root') }}>
                      <X size={13} />
                    </button>
                  </div>
                  <span className="tiny muted">
                    {aimEnemies ? '点敌阵中任一单位确定目标。' : '点我方任一成员确定目标。'}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* 小队列 —— 谁的血还剩几成、体力还剩几口，出招前就在手边 */}
        <div className={css.party} data-party-field>
          <div className={css.partyCap}>
            小队
            <span className="tiny muted">点名字可指定为目标</span>
          </div>
          <div className={css.partyCol}>
            {st.allies.map((c) => (
              <Unit
                key={c.id}
                c={c}
                fx={fx}
                active={!over && actor?.id === c.id}
                targetable={aimAllies && !c.down && !playing}
                onPick={() => pickTarget(c.id)}
              />
            ))}
          </div>
        </div>
      </div>

      </div>
    </div>,
    document.body,
  )
}

function aimLabel(s: BattleState, cmd: Command | null): string {
  if (!cmd) return '选择目标'
  const me = s.actor ? [...s.allies, ...s.enemies].find((c) => c.id === s.actor) : undefined
  if (cmd.t === 'atk') return '攻击 · 选择目标'
  if (cmd.t === 'skill') return `${me ? legalSkills(me, s).find((k) => k.id === cmd.skillId)?.name ?? '技能' : '技能'} · 选择目标`
  if (cmd.t === 'item') return `${ITEM_OF[cmd.itemId]?.name ?? '道具'} · 选择目标`
  return '选择目标'
}

/* ---------- 指令子面板外壳 ---------- */

function SubPanel({
  title, onBack, children,
}: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className={css.sub} data-sub-panel>
      <div className={css.subHead}>
        <button className={css.x} type="button" data-sub-back onClick={onBack}>
          <ArrowLeft size={13} />
        </button>
        <b style={{ fontSize: 12 }}>{title}</b>
      </div>
      {children}
    </div>
  )
}

/** 技能图标：由技能 id 确定性分配（见 lib/battle/icons），同一技能永远同一枚 */
function SkillIcon({ id, size = 15 }: { id: string; size?: number }) {
  const Ico = iconOf(id)
  return <Ico size={size} weight="bold" className={css.rowIco} data-skill-ico={iconNameOf(id)} />
}

const TARGET_LABEL: Record<string, string> = {
  one: '单体敌人', all: '全体敌人', self: '自身', allyOne: '单体队友', allyAll: '全队',
}

/**
 * 把一手技能拆成看得懂的要点。
 * 数值一律从技能本身读（倍率 / 消耗 / 命中段数 / 附带效果），不另写一份说明 ——
 * 免得文案与引擎各说各的。
 */
function notesOf(k: SkillSpec): string[] {
  const out: string[] = []
  if (k.power > 0) out.push(`倍率 ${(k.power / POWER_SCALE).toFixed(2)} × ${k.axis}`)
  else out.push('本手不造成伤害')
  out.push(TARGET_LABEL[k.target] ?? k.target)
  if (k.cost) out.push(`耗 ${k.cost} 体力`)
  if (k.cd) out.push(`冷却 ${k.cd} 拍`)

  const e = k.effect
  if (e) {
    if (e.hits && e.hits > 1) out.push(`${e.hits} 段`)
    if (e.heal) out.push(`回复 ×${e.heal} 意志力`)
    if (e.shield) out.push(`减伤 ${Math.round(e.shield * 100)}%`)
    if (e.mark) out.push(`目标受伤 +${Math.round(e.mark * 100)}%`)
    if (e.slow) out.push(`敌方充能 −${Math.round(e.slow * 100)}%`)
    if (e.pushBack) out.push(`击退行动条 ${Math.round(e.pushBack * 100)}%`)
    if (e.clearBar) out.push('清空行动条 · 打断咏唱')
    if (e.pierce) out.push('无视闪避与减伤')
    if (e.cleanse) out.push('解除负面')
    if (e.taunt) out.push(`引仇 ${k.turns ?? 2} 拍`)
    if (e.revive) out.push('把失能者拉回战列')
    if (e.selfToo) out.push('增益同时及于自身')
    if (e.atkUp) out.push(`攻击 +${Math.round(e.atkUp * 100)}%`)
    if (e.spdUp) out.push(`充能 +${Math.round(e.spdUp * 100)}%`)
    if (e.evade) out.push(`闪避 +${Math.round(e.evade * 100)}%`)
    if (e.accUp) out.push(`命中 +${Math.round(e.accUp * 100)}%`)
    if (e.pushBar) out.push(`立刻充能 ${Math.round(e.pushBar * 100)}%`)
  }

  if (k.needsStack) out.push(`需 ${k.needsStack} 层印记`)
  if (k.requireAlly) out.push(`需 ${personOf(k.requireAlly)?.name ?? k.requireAlly} 在场`)
  if (k.requireAll?.length) out.push(`合击 · ${k.requireAll.length} 人全员在场`)
  if (k.linkPow) out.push(`参加者各补 ${Math.round(k.linkPow * 100)}% 出力`)
  if (k.mergeAlly) out.push(`与 ${personOf(k.mergeAlly)?.name ?? k.mergeAlly} 合体 ${k.mergeTicks ?? 2} 拍`)
  if (k.morph) out.push(`变身 ${k.morphTicks ?? 3} 拍 · 变身毕起算冷却 ${k.morphCd ?? 0} 拍`)
  if (k.ult) out.push(`终结技 · 蓄 ${k.ult} 拍`)
  if (k.kind === '启动') out.push('启动技 · 解封普攻与技能')
  return out
}

/** 装具的要点：装上去究竟改了什么数（取自 GearDef.mods，不另写一份） */
function gearNotes(g: GearDef): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(g.mods)) {
    if (typeof v !== 'number' || !v) continue
    if (k === 'spd') out.push(`充能 +${Math.round(v * 100)}%`)
    else if (k === 'evade') out.push(`闪避 +${Math.round(v * 100)}%`)
    else if (k === 'shield') out.push(`减伤 ${Math.round(v * 100)}%`)
    else if (k === 'atk') out.push(`攻击 +${Math.round(v * 100)}%`)
    else if (k === 'basicMul') out.push(`普攻 ×${(1 + v).toFixed(1)}`)
    else out.push(`${k} ${v > 0 ? '+' : ''}${v}`)
  }
  if (g.skill) out.push(`附带一手「${g.skill.name}」`)
  if (g.unlockMain) out.push('须先完成对应主线才上架')
  return out
}

function SkillBtn({ k, sp, cd, onClick }: { k: SkillSpec; sp: number; cd: number; onClick: () => void }) {
  const poor = k.cost > sp
  const cooling = cd > 0
  const notes = notesOf(k)
  const state = cooling ? `冷却中 · 还需 ${cd} 拍` : poor ? '体力不足' : ''
  return (
    <button
      type="button"
      data-skill={k.id}
      data-kind={k.kind}
      data-power={k.power}
      data-cd={cooling ? cd : undefined}
      data-cdmax={k.cd ?? 0}
      className={`${css.row} ${k.kind === '启动' ? css.rowStart : ''} ${poor || cooling ? css.rowPoor : ''}`}
      disabled={poor || cooling}
      title={`${k.name}｜${k.desc}${state ? `（${state}）` : ''}`}
      onClick={onClick}
    >
      <SkillIcon id={k.id} />
      <span className={css.rowName}>
        {k.name}
        {k.kind !== '普攻' ? <i className={css.rowSub}>{k.kind}</i> : null}
      </span>
      <span className={css.rowCost}>
        {cooling ? `冷却 ${cd}` : k.cost ? `${k.cost} 体力` : '无耗'}
        {!cooling && k.cd ? <i className={css.rowSub}>CD {k.cd}</i> : null}
      </span>
      <span className={css.rowDesc} data-skill-desc>{k.desc}</span>
      <span className={css.rowNotes} data-skill-notes>
        {notes.map((n, i) => <i key={`${i}-${n}`}>{n}</i>)}
      </span>
    </button>
  )
}

/* ---------- 行动条 ---------- */

function Bar({ c }: { c: Combatant }) {
  const pct = Math.min(100, (c.bar / TUNING.barMax) * 100)
  const ready = c.bar >= TUNING.barMax
  return (
    <div className={css.atb} data-atb={c.id} data-ready={ready ? '1' : undefined} title={`行动条 ${Math.round(pct)}%`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

function BuffTags({ c }: { c: Combatant }) {
  if (!c.buffs.length && !c.shield && !c.taunt) return null
  const label: Record<string, string> = {
    atk: '攻势', spd: '加速', evade: '闪避', acc: '命中', shield: '护罩', mark: '破绽', slow: '减速',
  }
  return (
    <div className={css.buffs}>
      {c.buffs.map((b, i) => (
        <span key={`${b.k}-${i}`} className={css.buff} data-buff={b.k}>
          {label[b.k] ?? b.k}{b.v > 0 ? `+${Math.round(b.v * 100)}%` : ''}
        </span>
      ))}
      {c.taunt > 0 ? <span className={css.buff} data-buff="taunt">引仇</span> : null}
    </div>
  )
}

/* ---------- 单位卡：我方（小队列里的一行 —— 血、体力、行动条一眼看全） ---------- */

function Unit({
  c, fx, active, targetable, onPick,
}: {
  c: Combatant
  fx: FxView | null
  active?: boolean
  targetable?: boolean
  onPick?: () => void
}) {
  const hit = !!fx && fx.targetId === c.id
  const hpPct = (c.hp / c.hpMax) * 100
  const low = hpPct <= 30
  return (
    <div
      className={`${css.unit} ${c.down ? css.unitDown : ''} ${c.gone > 0 ? css.unitGone : ''} ${active ? css.unitActive : ''} ${targetable ? css.unitAim : ''}`}
      data-unit={c.id}
      data-side={c.side}
      data-down={c.down ? '1' : undefined}
      data-gone={c.gone > 0 ? String(c.gone) : undefined}
      style={{ '--u': c.hue } as CSSProperties}
      onClick={targetable ? onPick : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
    >
      <span className="glyph" style={{ '--g': c.hue } as CSSProperties}>
        <span style={{ fontSize: 14 }}>{c.sigil}</span>
      </span>

      <div className={css.unitBody}>
        <div className={css.unitTop}>
          <b className={css.unitName}>{c.name}</b>
          {c.startNeed > 0 ? (
            <span className={css.unitGate} title={`解封 ${c.startUsed}/${c.startNeed}`}>
              {c.startUsed}/{c.startNeed}
            </span>
          ) : null}
          {c.gear ? <span className={css.gearTag}>{GEAR_OF[c.gear]?.name}</span> : null}
          <span className={css.unitHpNum} data-low={low ? '1' : undefined}>
            {c.hp}<i>/{c.hpMax}</i>
          </span>
        </div>

        {/* 血条 —— 出招前先看这一条 */}
        <div className={css.hpBar}>
          <i style={{ width: `${hpPct}%` }} data-low={low ? '1' : undefined} />
        </div>

        <div className={css.unitFootRow}>
          <Bar c={c} />
          <span className={css.chSpBar} data-chsp={c.id} title={`自身体力 ${c.sp}/${c.spMax} · 出手从这里扣`}>
            <i style={{ width: `${(c.sp / c.spMax) * 100}%` }} data-low={c.sp <= c.spMax * 0.25 ? '1' : undefined} />
          </span>
          <span className={`${css.spNum} mono`}>体力 {c.sp}</span>
        </div>

        <div className={css.unitTags}>
          <span className={css.unitCls}>{c.cls}</span>
          {c.passive ? (
            <span className={css.unitPas} data-passive={c.passive.name} title={c.passive.desc}>
              〔{c.passive.name}〕
            </span>
          ) : null}
          {c.gone > 0 ? <span className={css.goneMark}>合体中 · {c.gone} 拍</span> : null}
          {c.morph ? (
            <span className={css.morphMark} data-morph={c.morph.name}>
              化身 · {c.morph.name} · {c.morph.ticks} 拍
            </span>
          ) : null}
          <BuffTags c={c} />
        </div>
      </div>

      {hit && fx.dmg ? <span key={fx.n} className={css.dmgNum}>{fx.dmg}</span> : null}
      {hit && fx.down ? <span className={css.downMark}>失能</span> : null}
    </div>
  )
}

/* ---------- 单位卡：敌方（居中放大 · 名在头上 · 数值在脚下） ---------- */

function Foe({
  c, fx, active, targetable, onPick,
}: {
  c: Combatant
  fx: FxView | null
  active?: boolean
  targetable?: boolean
  onPick?: () => void
}) {
  const hit = !!fx && fx.targetId === c.id
  const hpPct = (c.hp / c.hpMax) * 100
  const ready = c.bar >= TUNING.barMax
  return (
    <div className={css.foe} data-unit={c.id} data-side="enemy" data-foe-card={c.id}>
      {/* 名字在头上 */}
      <div className={css.foeName} data-foe-name>
        <b>{c.name}</b>
        <i>{c.cls}</i>
        {c.trait ? <em className="tiny muted">{c.trait}</em> : null}
      </div>

      <div
        data-foe-body
        className={`${css.foeBody} ${c.down ? css.unitDown : ''} ${active ? css.unitActive : ''} ${targetable ? css.unitAim : ''}`}
        style={{ '--u': c.hue } as CSSProperties}
        data-down={c.down ? '1' : undefined}
        onClick={targetable ? onPick : undefined}
        role={targetable ? 'button' : undefined}
        tabIndex={targetable ? 0 : undefined}
      >
        <span className="glyph" style={{ '--g': c.hue } as CSSProperties}>
          <span style={{ fontSize: 30 }}>{c.sigil}</span>
        </span>
        {hit && fx.dmg ? <span key={fx.n} className={css.dmgNumBig}>{fx.dmg}</span> : null}
        {hit && fx.down ? <span className={css.downMark}>失能</span> : null}
      </div>

      {/* 数值与状态在脚下 */}
      <div className={css.foeFoot} data-foe-foot>
        <div className={css.hpBarBig}>
          <i style={{ width: `${hpPct}%` }} data-low={hpPct <= 30 ? '1' : undefined} />
        </div>
        <div className={`${css.foeMeta} mono`}>
          <span>{c.hp} / {c.hpMax}</span>
          <span className="muted">{c.tags.join(' · ')}</span>
        </div>
        <div className={css.atb} data-atb={c.id} data-ready={ready ? '1' : undefined}>
          <i style={{ width: `${Math.min(100, (c.bar / TUNING.barMax) * 100)}%` }} />
        </div>
        <UltChant c={c} />
        <BuffTags c={c} />
      </div>
    </div>
  )
}

/**
 * 终结技能的咏唱槽（boss 专用）。
 * 玩家要判断的两件事都写在这里：还差几拍放出来，以及打断它得打掉多少。
 */
function UltChant({ c }: { c: Combatant }) {
  const u = c.skills.find((k) => k.ult)
  if (!u) return null
  const need = u.ult ?? 1
  const cur = Math.min(need, c.chant?.[u.id] ?? 0)
  const full = cur >= need
  const brk = Math.round((u.ultBreak ?? TUNING.ultBreak) * c.hpMax)
  const soft = c.buffs.filter((b) => b.k === 'mark' || b.k === 'slow').length
  return (
    <div
      className={css.chant}
      data-chant={c.id}
      data-full={full ? '1' : undefined}
      title={`终结技能「${u.name}」：${u.desc}
还差 ${need - cur} 拍放出；咏唱期间一次打掉 ${brk} 点即打断；它身上每层减益削弱这一击 ${Math.round(
        TUNING.ultDebuffCut * 100,
      )}%`}
    >
      <span className={css.chantName}>
        <Lightning size={11} weight="fill" /> {full ? '终结技能 · 待放' : `咏唱 ${cur}/${need}`}
      </span>
      <span className={css.chantBar}>
        <i style={{ width: `${(cur / need) * 100}%` }} />
      </span>
      <span className={css.chantHint}>
        打断 {brk}
        {soft ? ` · 已软 ${soft}` : ''}
      </span>
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
  const loot = st.loot.map((g) => GEAR_OF[g]?.name ?? g)
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
        <b data-outcome={rec.outcome}>{win ? '作战成功' : st.phase === 'fled' ? '已撤出' : '作战失败'}</b>
        <span className="tiny muted">
          {rec.rounds} 手 / {rec.ticks} 拍 · 出力最重 {rec.mvp} · 成文方式 {rec.narrativeBy}
        </span>
      </div>
      {win ? (
        <div className={css.resultGain} data-battle-gain>
          <span>终末点数 <b>+{rec.coin}</b></span>
          <span>
            搜刮：
            {loot.length ? <b>{loot.join('、')}</b> : <span className="muted">未搜到装具（掉落率 {Math.round(lootOddsOf(rec.stage) * 100)}%）</span>}
          </span>
        </div>
      ) : (
        <div className={css.resultGain} data-battle-gain>
          <span className="muted">没打过 —— 目标未清除，剧情不推进，本次不留档。</span>
        </div>
      )}
      <div className={css.resultBody} data-battle-narrative>
        {win ? rec.narrative : '小队退出交战区域，反现实反应仍在。重新观测后再来。'}
      </div>
      <button className="btn btn--primary" style={{ fontSize: 12 }} disabled={filed} onClick={onFile}>
        {filed ? '已归档' : win ? '归档并返回任务板' : '返回任务板'}
      </button>
    </div>
  )
}
