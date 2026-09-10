import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowLeft, Backpack, CaretRight, Crosshair, Lightning, Shield, Sneaker, Swap, X,
} from '@phosphor-icons/react'

import {
  act, createBattle, digestOf, legalSkills, lootOddsOf, rewardOf,
} from '../lib/battle/engine'
import type { Command } from '../lib/battle/engine'
import { iconNameOf, iconOf } from '../lib/battle/icons'
import { narrateBattle, recordOf } from '../lib/battle/narrate'
import { GEAR_OF, ITEMS, ITEM_OF, rollLoot } from '../lib/battle/gear'
import { TUNING } from '../lib/battle/tuning'
import type { BattleRecord, BattleState, Combatant, FxKind, SkillSpec, StaminaState } from '../lib/battle/types'
import type { Mission } from '../data/types'

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
  /** 军需点（结算后写回） */
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
type Panel = 'root' | 'skill' | 'item' | 'gear' | 'flee' | 'aim'

const SEQ = [
  { id: 'atk', label: '攻击', Icon: CaretRight },
  { id: 'skill', label: '技能', Icon: Lightning },
  { id: 'item', label: '道具', Icon: Backpack },
  { id: 'guard', label: '防御', Icon: Shield },
  { id: 'gear', label: '更换装备', Icon: Swap },
  { id: 'flee', label: '战略撤退', Icon: Sneaker },
] as const

export function Battle({
  mission, squad, progress, growth, stamina, equip, owned, bag, coin, onExit, onSettled,
}: Props) {
  const [st, setSt] = useState<BattleState>(() =>
    createBattle({
      mission, squad, progress, growth, gear: equip,
      sp: stamina.cur, spMax: stamina.max, bag, coin,
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

  const playing = shown < st.log.length
  const over = st.phase !== 'select'
  const actor = useMemo(
    () => (st.actor ? [...st.allies, ...st.enemies].find((c) => c.id === st.actor) : undefined),
    [st],
  )

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
      const k = actor ? legalSkills(actor).find((x) => x.id === cmd.skillId) : undefined
      return !!k && (k.target === 'one' || k.target === 'allyOne')
    }
    if (cmd.t === 'item') {
      const it = ITEM_OF[cmd.itemId]
      return !!it && (it.target === 'one' || it.target === 'enemyOne')
    }
    return false
  }

  const issue = (cmd: Command) => {
    if (playing || over) return
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

  return (
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

      {/* HUD */}
      <header className={css.hud}>
        <div className={css.hudL}>
          <span className={`${css.no} mono`}>{st.no} / S{st.stage}</span>
          <b className={css.title}>{st.title}</b>
          <span className="tiny muted">{st.place}</span>
        </div>
        <div className={css.hudR}>
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

      {/* 我方小队 */}
      <div className={css.party} data-party-field>
        <div className={css.partyRow}>
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
                          const k = legalSkills(actor).find((x) => x.kind === '普攻')
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
                    {legalSkills(actor).map((k) => (
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
      </div>
    </div>
  )
}

function aimLabel(s: BattleState, cmd: Command | null): string {
  if (!cmd) return '选择目标'
  const me = s.actor ? [...s.allies, ...s.enemies].find((c) => c.id === s.actor) : undefined
  if (cmd.t === 'atk') return '攻击 · 选择目标'
  if (cmd.t === 'skill') return `${me ? legalSkills(me).find((k) => k.id === cmd.skillId)?.name ?? '技能' : '技能'} · 选择目标`
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

function SkillBtn({ k, sp, cd, onClick }: { k: SkillSpec; sp: number; cd: number; onClick: () => void }) {
  const poor = k.cost > sp
  const cooling = cd > 0
  return (
    <button
      type="button"
      data-skill={k.id}
      data-kind={k.kind}
      data-cd={cooling ? cd : undefined}
      className={`${css.row} ${k.kind === '启动' ? css.rowStart : ''} ${poor || cooling ? css.rowPoor : ''}`}
      disabled={poor || cooling}
      title={k.desc + (cooling ? `（冷却中 · 还需 ${cd} 拍）` : poor ? '（体力不足）' : k.cd ? `（冷却 ${k.cd} 拍）` : '')}
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
    atk: '攻势', spd: '加速', evade: '闪避', shield: '护罩', mark: '破绽', slow: '减速',
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

/* ---------- 单位卡：我方（横排紧凑） ---------- */

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
      <Bar c={c} />
      <div className={css.unitTop}>
        <span className="glyph" style={{ '--g': c.hue } as CSSProperties}>
          <span style={{ fontSize: 14 }}>{c.sigil}</span>
        </span>
        <span className={css.unitName}>
          <b>{c.name}</b>
          <i className={css.unitCls}>{c.cls}</i>
        </span>
        {c.startNeed > 0 ? (
          <span className={css.unitGate} title={`解封 ${c.startUsed}/${c.startNeed}`}>
            {c.startUsed}/{c.startNeed}
          </span>
        ) : null}
      </div>
      <div className={css.hpBar}>
        <i style={{ width: `${hpPct}%` }} data-low={hpPct <= 30 ? '1' : undefined} />
      </div>
      <div className={css.chSpBar} data-chsp={c.id} title={`自身体力 ${c.sp}/${c.spMax} · 出手从这里扣`}>
        <i style={{ width: `${(c.sp / c.spMax) * 100}%` }} data-low={c.sp <= c.spMax * 0.25 ? '1' : undefined} />
      </div>
      <div className={`${css.unitMeta} mono`}>
        <span>{c.hp}/{c.hpMax}</span>
        <span className={css.spNum}>体力 {c.sp}</span>
        <span className="muted">敏 {c.axes.敏捷度}</span>
        {c.gear ? <span className={css.gearTag}>{GEAR_OF[c.gear]?.name}</span> : null}
      </div>
      <BuffTags c={c} />
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
        <BuffTags c={c} />
      </div>
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
          <span>军需点 <b>+{rec.coin}</b></span>
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
