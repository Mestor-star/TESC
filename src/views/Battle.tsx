import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowLeft, Backpack, CaretRight, Crosshair, Lightning, Shield, Sneaker, Swap, X,
} from '@phosphor-icons/react'

import {
  act, bossUltOf, chargeOf, createBattle, digestOf, enemysTurn, legalSkills, lootOddsOf, pendingFoe, rewardOf,
} from '../lib/battle/engine'
import type { Command } from '../lib/battle/engine'
import { intentOf, requestEnemyIntent } from '../lib/battle/ai'
import type { RawIntent } from '../lib/battle/ai'

/**
 * 等一个请求，但**最多等这么久**。
 *
 * 敌方的这一手不该由模型的快慢说了算：到点还没回话就当没问过（返回 null），
 * 调用方退回引擎自己的判断 —— 宁可敌体打得笨一点，也不让玩家干等。
 * 超时会把请求 abort 掉，省得它回来时没人接、白烧一次 token。
 */
function withDeadline<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = window.setTimeout(() => {
      onTimeout()
      resolve(null)
    }, ms)
    void p.then(
      (v) => { window.clearTimeout(timer); resolve(v) },
      () => { window.clearTimeout(timer); resolve(null) },
    )
  })
}
import { battleBed, sfx } from '../lib/audio'
import type { SfxName } from '../lib/audio'
import { isReady, loadProfile } from '../lib/api'
import type { ApiSettings } from '../lib/api'
import { iconNameOf, iconOf } from '../lib/battle/icons'
import { narrateBattle, recordOf } from '../lib/battle/narrate'
import { canEquip, GEAR_OF, ITEMS, ITEM_OF, rollLoot } from '../lib/battle/gear'
import type { GearDef } from '../lib/battle/types'
import { passiveText } from '../lib/battle/roster'
import { effectTextsOf, mulTextOf } from '../lib/battle/skilltext'
import { archNameOf } from '../lib/battle/atlas'
import { namedBossOf } from '../lib/battle/bosses'
import { bondsOf, synergiesOf } from '../lib/battle/synergy'
import { rBadgeOf } from '../lib/battle/rvalue'
import { TUNING } from '../lib/battle/tuning'
import { endOf, isDebuff } from '../lib/battle/types'
import type { BattleRecord, BattleState, Combatant, EnemyIntent, FxKind, FxTone, SkillKind, SkillSpec, StaminaState } from '../lib/battle/types'
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
  /** 每人与你的羁绊读数（0~100）—— 决定连携接得多快、本人多硬气 */
  bond: Record<string, number>
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
  /** 这一手的性质（回复 / 增益 / 压制 / 纯伤）—— 配色按它走，不按动画类别 */
  tone: FxTone
  /** 'all' = 铺一整屏；'one' = 贴着挨打的那个放 */
  scope: 'one' | 'all'
  actorId: string
  /** 这一手是谁的哪一招 —— 特效按技能 id 取色与变奏，招招不同 */
  skillId: string
  skill: string
  targetId?: string
  dmg?: number
  down?: boolean
  /** 这一手是连携：参加者与招式名，右侧那张牌子照着它立起来 */
  link?: { id: string; name: string; members: string[] }
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

/* 一种演出配一种响 —— 同一手打出去，眼睛看到的和耳朵听到的得是一件事 */
const SFX_OF_FX: Record<FxKind, SfxName> = {
  slash: 'slash', blast: 'blast', guitar: 'guitar', seal: 'alert', drone: 'guard',
  noise: 'blast', guard: 'guard', heal: 'heal', item: 'loot', gear: 'open',
}

export function Battle({
  mission, squad, progress, growth, stamina, equip, owned, bag, coin, morphPool, bond,
  onExit, onSettled,
}: Props) {
  const [st, setSt] = useState<BattleState>(() =>
    createBattle({
      mission, squad, progress, growth, gear: equip,
      sp: stamina.cur, spMax: stamina.max, bag, coin, morphPool, bond,
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
  /** 敌方指挥：接口接通了才由模型点这一手，否则引擎自己判断 */
  const [cfg, setCfg] = useState<ApiSettings | null>(null)
  const thinking = useRef(false)
  /** 提前问回来的敌方那一手（敌体 id → 正在路上的回包），见下面两段 effect */
  const prefetch = useRef(new Map<string, { p: Promise<RawIntent | null>; ctl: AbortController }>())
  /** 场上有没有 boss 级敌体 —— 有的话底也要跟着换 */
  const bossUp = st.enemies.some((c) => bossUltOf(c))

  useEffect(() => {
    let live = true
    // 敌方走主通道（与剧情同一个接口）：没填 / 填了但调不通 —— 一律退回离线判断
    void loadProfile('main').then((c) => {
      if (!live) return
      setCfg(c)
      if (isReady(c)) setSt((s) => (s.command === 'ai' ? s : { ...s, command: 'ai' }))
    })
    return () => { live = false }
  }, [])

  /* ---- 敌方的这一手，什么时候去问模型 ----
     原来是在「思考」相位里现问现等：轮到敌体 → 发请求 → 等模型回话 → 才动。
     于是一次往返（一两秒、慢的时候更久）全算在敌方头上，玩家看着就是
     「敌人想了半天」。可这段时间本来是可以省掉的 —— 我方决定用哪一手的时候，
     敌方的局面基本已经定了，那一手完全可以**提前问**。

     所以分两步：
       ① 轮到我方决定（phase=select）时就把在世敌体的这一手全要来，存着；
       ② 真轮到敌体时先看存着的那份 —— 多半已经到了，**零等待**。
     只有当提前问没赶上（刚开打、或上一手把局面整个推翻）才现问，
     而且给一个**截止时间**：超过就用引擎自己的判断打，绝不为了等模型把仗卡住。

     提前问回来的那一手，落地前一律过 `intentOf` 按**此刻**的局面重校验 ——
     存的是局面，局面会变（技能可能冷却、它瞄的人可能已经倒了）。 */
  useEffect(() => {
    if (st.phase !== 'select') return
    if (!cfg || !isReady(cfg)) return
    for (const foe of st.enemies) {
      if (foe.down) continue
      // 已经有一份在路上 / 已经拿到，不重复问。
      // 死掉的敌体留在表里也无妨：它的 id 不会再进入思考相位，不会有人去取。
      if (prefetch.current.has(foe.id)) continue
      const ctl = new AbortController()
      const p = requestEnemyIntent(st, foe, cfg, { signal: ctl.signal }).catch(() => null)
      prefetch.current.set(foe.id, { p, ctl })
    }
  }, [st.phase, st.enemies, cfg])

  /* ---- 轮到敌体：先吃提前问好的那一手，吃不到就现问，但有个硬截止 ---- */
  useEffect(() => {
    if (st.phase !== 'think' || shown < st.log.length) return
    if (thinking.current) return
    thinking.current = true
    let live = true
    const foe = pendingFoe(st)
    const cached = foe ? prefetch.current.get(foe.id) : undefined
    // 用掉就作废：下一回我方决定时会重新问一份，免得一直拿开局那一手打到底
    if (foe) prefetch.current.delete(foe.id)
    const started = Date.now()
    const run = async () => {
      let intent: EnemyIntent | null = null
      if (foe && cfg && isReady(cfg)) {
        if (cached) {
          // 提前问好的那一份：多半已经到了，直接读完就出手。
          // 仍在路上的话也只等到截止 —— 玩家出手快的时候，这一份可能还没回来。
          const raw = await withDeadline(cached.p, TUNING.enemyAskMs, () => cached.ctl.abort())
          intent = intentOf(st, foe, raw)
        } else {
          // 没赶上 —— 现问，但只给这么久；超时就用引擎自己的判断（intent=null）
          const ctl = new AbortController()
          const raw = await withDeadline(
            requestEnemyIntent(st, foe, cfg, { signal: ctl.signal }), TUNING.enemyAskMs, () => ctl.abort(),
          )
          intent = intentOf(st, foe, raw)
        }
      }
      // 提前问好的那一份是现成的，会**立刻**出手 —— 快得像瞬移，读不出「它决定了」。
      // 补一个最短喘息：这一小段是演出，不是真在算，所以跟模型快慢无关。
      const rest = TUNING.enemyThinkMs - (Date.now() - started)
      if (rest > 0) await new Promise((r) => window.setTimeout(r, rest))
      if (!live) return
      thinking.current = false
      setSt((s) => (s.phase !== 'think' ? s : { ...enemysTurn(s, intent) }))
    }
    void run()
    return () => { live = false; thinking.current = false }
  }, [st, shown, cfg])

  /* 战场所在的 R 值（与任务简报同一口径）：出招前知道这地方把敌人抬了多少 */
  const siteR = useMemo(() => rBadgeOf(st.place, st.stage), [st.place, st.stage])
  const playing = shown < st.log.length
  /** 终局：赢 / 输 / 撤。排除 think —— 那只是敌方在决定这一手，仗还没打完 */
  const ended = st.phase === 'won' || st.phase === 'lost' || st.phase === 'fled'
  /** 不可操作：终局与敌方思考中都不接指令 */
  const over = st.phase !== 'select'
  const actor = useMemo(
    () => (st.actor ? [...st.allies, ...st.enemies].find((c) => c.id === st.actor) : undefined),
    [st],
  )

  /* ---- 羁绊挂牌：本场成立了哪几条、连携的共鸣槽蓄到几拍 ----
     槽要几拍是**羁绊说了算**的（见 synergy.linkNeed）——
     所以挂牌上要写清「本可以 3 拍，因为交情缩到 2 拍」，不然玩家不知道攒羁绊有什么用。 */
  const synergyRow = useMemo(() => {
    const ids = st.allies.map((c) => c.id)
    const bonds = new Map<string, ReturnType<typeof bondsOf>[number]>()
    for (const b of bondsOf(ids, st.bond)) {
      bonds.set(b.id, b)
      // 整队连携（xxx-full）挂在同一条羁绊名下
      if (b.id.endsWith('-full')) bonds.set(b.id.slice(0, -5), b)
    }
    // 名义拍数（不看羁绊）——用来算「交情省了几拍」
    const plain = new Map<string, number>()
    for (const b of bondsOf(ids)) {
      plain.set(b.id, b.need)
      if (b.id.endsWith('-full')) plain.set(b.id.slice(0, -5), b.need)
    }
    return synergiesOf(ids).map((s) => {
      const b = bonds.get(s.id)
      const base = plain.get(s.id)
      return {
        id: s.id, name: s.name, desc: s.desc, mark: s.mark,
        link: b && base !== undefined
          ? {
            name: b.link.name, desc: b.link.desc, need: b.need, base,
            // 双人看共享的槽；整队（特殊连携）看各人自己的能量 —— 取最落后的那一个，
            // 因为「全员满」才算数，最慢的那个人就是这条连携的进度。
            cur: b.squad
              ? Math.min(b.need, Math.min(...b.members.map((id) => st.gauge?.[id] ?? 0)))
              : Math.min(b.need, st.link?.[b.id] ?? 0),
            squad: !!b.squad,
            // 整队那条还要报「几个人已经满了」—— 只看最落后的那一个，
            // 玩家不知道是卡在谁身上。
            full: b.squad
              ? b.members.filter((id) => (st.gauge?.[id] ?? 0) >= b.need).length
              : 0,
            members: b.members,
          }
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

  /* ---- 敌阵的站位：最硬的那个站中间，其余分列两侧 ----
     `st.enemies` 是**按生成序排的**（第一只是这一场的头目档，见 derive.enemiesOf），
     照原样铺开就是「最强的杵在最左边」，越往后越弱 —— 眼睛会以为左边那个是杂兵。
     所以只在这里重排**显示序**，不动 st.enemies 本身（引擎、存档、日志全按 id 找，
     谁站哪一格与规则无关）：先把头一名摆进中线，剩下的从中间往两边交替铺开。 */
  const foeLine = useMemo(() => {
    const arr = st.enemies
    const n = arr.length
    if (n <= 2) return arr
    const out: typeof arr = new Array(n)
    const mid = Math.floor((n - 1) / 2)
    out[mid] = arr[0]
    let l = mid - 1
    let r = mid + 1
    for (let i = 1; i < n; i++) {
      // 先右后左：奇数位补右边，偶数位补左边，两侧同时向外扩
      if (i % 2 === 1 && r < n) out[r++] = arr[i]
      else if (l >= 0) out[l--] = arr[i]
      else out[r++] = arr[i]
    }
    return out
  }, [st.enemies])

  /* ---- 「回手」的那一下 ----
     解封尽解的人会被引擎原位填满行动条、点名下一位还是他（见 engine 的 again）。
     顺位条靠 translate 滑过去，那个人会当着玩家的面窜到最前 ——
     这里只再补一记提亮，说明「这一手不是抢来的，是解封给的」。 */
  const [surge, setSurge] = useState<string | null>(null)
  const logged = useRef(0)
  useEffect(() => {
    // 引擎是就地推进的（push 进同一个数组），所以只按「新添了哪几条」找
    const from = logged.current
    logged.current = st.log.length
    let who: string | null = null
    for (let i = st.log.length - 1; i >= from; i--) {
      const e = st.log[i]
      if (e.skillId === 'unseal' && e.skill === '解禁') { who = e.actorId; break }
    }
    if (!who) return
    setSurge(who)
    const t = window.setTimeout(() => setSurge(null), 1800)
    return () => window.clearTimeout(t)
  }, [st])

  /* ---- 底：一进作战屏就换战斗底，boss 上场再压重一层 ---- */
  useEffect(() => {
    battleBed(true, bossUp)
    return () => { battleBed(false) }
  }, [bossUp])

  /* ---- 逐条回放战斗日志（每条配一次演出） ---- */
  useEffect(() => {
    if (shown >= st.log.length) {
      setFx(null)
      return
    }
    const e = st.log[shown]
    setFx({
      n: shown, kind: e.fx, tone: e.tone ?? 'strike', scope: e.scope ?? 'one',
      actorId: e.actorId, skillId: e.skillId, skill: e.skill,
      targetId: e.targetId, dmg: e.dmg, down: e.down, link: e.link,
    })
    if (e.down) sfx('down')
    else if (e.miss) sfx('tick')
    else if (e.heal) sfx('heal')
    else if (e.kind === '启动') sfx('form')
    else sfx(SFX_OF_FX[e.fx] ?? 'hit')
    // 连携要留够看清两张脸的时间：它后面还跟着一手伤害，380ms 会一闪而过
    const hold = e.link ? 1500 : e.dmg || e.down ? 620 : 380
    const t = window.setTimeout(() => setShown((n) => n + 1), hold)
    return () => window.clearTimeout(t)
    // 依赖记在长度上：log 数组由引擎就地追加，引用不变
  }, [shown, st.log.length])

  /* ---- 收场：结算战利品，然后成文 ---- */
  useEffect(() => {
    if (!ended || playing || narrating || settled.current) return
    settled.current = true
    sfx(st.phase === 'won' ? 'win' : st.phase === 'lost' ? 'lose' : 'flee')
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
  }, [ended, playing, rec, narrating, st])

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

  /** 出手。要选人的（打敌阵 / 增益自己人）先开瞄准面板，无目标的（自身 · 全体 · 我方全体）直接出 */
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
    // 一件装具只有一副：界面上按不动，这里再拦一道
    if (gearId && Object.keys(equipMap).some((pid) => pid !== actor.id && equipMap[pid] === gearId)) return
    const next = { ...equipMap }
    if (gearId) next[actor.id] = gearId
    else delete next[actor.id]
    setEquipMap(next)
    setSt((s) => ({ ...act(s, { t: 'equip', gearId }) }))
  }

  // 观测频道挂在右栏，一栏高：多留几手，翻得到上一拍
  const recent = st.log.slice(Math.max(0, shown - 14), shown)
  const shake = !!fx && (fx.kind === 'blast' || fx.kind === 'noise')
  /* 这一手是冲敌阵去，还是冲自己人去的。
     道具看 target，技能也看 target —— 增益类（梅芙那种「鼓舞」）是给我方挑人的：
     光标要是打在敌阵上，点下去这一口就喂了对面。 */
  const aimEnemies = panel === 'aim' && (() => {
    if (!pending) return true
    if (pending.t === 'item') return ITEM_OF[pending.itemId]?.target === 'enemyOne'
    if (pending.t === 'skill') {
      const k = actor ? legalSkills(actor, st).find((x) => x.id === pending.skillId) : undefined
      return !k || k.target !== 'allyOne'
    }
    return true
  })()
  const aimAllies = panel === 'aim' && !aimEnemies

  /*
    作战屏走 portal 挂到 body 上。
    任务板 / 剧情页的容器带 transform，fixed 会被它当成包含块 ——
    直接渲染的话，作战界面会被压进简报那一栏里，还得上下翻。
    挂到 body 之后它才是一块真正独占视图的界面：1920×1080 一屏装得下。
  */
  return createPortal(
    <div className={css.root} data-battle="1" data-phase={st.phase} data-command={st.command} data-shake={shake ? '1' : undefined}>
      {/*
        全屏演出层 —— 只管「一手打一群」的那种（全体技 / 合击 / 终末系）。
        单体技不走这里：打在一个人身上的东西，就该出现在那个人身上
        （见 Unit / Foe 里的 data-fx-on），把整屏糊一层光是纯噪音。
      */}
      {fx && fx.scope === 'all' ? (
        <div
          key={fx.n}
          className={css.fx}
          data-fx={fx.kind}
          data-fx-tone={fx.tone}
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

      {/* 连携技：右侧立一张牌 —— 两个人（或一整队）的头像 + 招式名 */}
      {fx?.link ? <LinkPop key={fx.n} link={fx.link} /> : null}

      {/* 作战屏 —— 自成一块「游戏窗口」，不铺满整个浏览器宽度
          （铺满会让指令窗与小队列隔得太远，出招时眼睛要横跨半屏） */}
      <div className={css.stage}>

      {/* HUD */}
      <header className={css.hud}>
        <div className={css.hudL}>
          <span className={`${css.no} mono`}>{st.no} / S{st.stage}</span>
          <b className={css.title}>{st.title}</b>
          <span className="tiny muted">{st.place}</span>
          {/* 敌方怎么出手：接通了接口就是模型在指挥，没接通是引擎的离线判断 */}
          <span
            className={css.cmdChip}
            data-enemy-command={st.command}
            data-thinking={st.phase === 'think' ? '1' : undefined}
            title={st.command === 'ai'
              ? '敌方由接入的模型指挥：每一手都由它自己权衡（终结技能不在此列，照旧咏唱）'
              : '敌方由作战系统离线判断：各按其性质出手'}
          >
            {st.command === 'ai'
              ? (st.phase === 'think' ? '敌方指挥中…' : '敌方 · AI 指挥')
              : '敌方 · 离线判断'}
          </span>
          <span className={css.siteR} data-r-badge data-r-src={siteR.reading.src} title={`${siteR.reading.note}
${siteR.f.word}`}>
            R {siteR.reading.r.toFixed(3)}
            {siteR.reading.over ? ' · 量程外' : siteR.f.out ? ` · 敌 +${Math.round((siteR.f.mul - 1) * 100)}%` : ' · 常规'}
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
                  title={`${t.desc}${t.link
                    ? `　连携：${t.link.name} —— ${t.link.desc}`
                      + (t.link.squad
                        ? `　共鸣：整队连携 —— 名单上每个人各出一手（防御也算一手）把自己的能量蓄满，`
                          + `一人 ${t.link.need} 拍，全员都满才成立`
                          + (t.link.base > t.link.need ? `（交情够了，本要 ${t.link.base} 拍）` : '')
                          + '　接法：全员满能量的那一刻，由当下出手的那一位带出去，全队一起吃加成'
                        : `　共鸣：每人各出一手（防御也算一手），蓄满 ${t.link.need} 拍等着接`
                          + (t.link.base > t.link.need ? `（交情够了，本要 ${t.link.base} 拍）` : '')
                          + `　接法：槽满后谁出手，这一手就跟着谁出去 —— 防御只蓄拍、不接招`)
                    : ''}`}
                >
                  <b>{t.name}</b>
                  {t.link ? (
                    <>
                      <i className={css.linkGauge} data-link-gauge={t.id} data-squad={t.link.squad ? '1' : undefined} data-full={t.link.cur >= t.link.need ? '1' : undefined} data-cut={t.link.base > t.link.need ? '1' : undefined}>
                        {t.link.cur}/{t.link.need}
                        {/* 整队那条的槽是「最落后的那个人」的读数 —— 再报一句几个人满了，
                            否则玩家只看得到一个卡住不动的数字，不知道是卡在谁身上 */}
                        {t.link.squad ? <em className={css.linkCut} data-link-full>{t.link.full}/{t.link.members.length} 人满</em> : null}
                        {t.link.base > t.link.need ? <em className={css.linkCut}>羁绊</em> : null}
                      </i>
                      {/* 槽满不等于接上了 —— 防御不算出手，光架盾是接不上的。这一格就是把话说明白 */}
                      {t.link.cur >= t.link.need ? (
                        <em className={css.linkHint} data-link-hint={t.id} title={t.link.squad
                          ? '全员能量已满：谁出手，这一记整队连携就跟谁出去，全队一起吃加成'
                          : '共鸣已蓄满：谁出手，这一手就跟谁出去；防御只蓄拍、不接招'}>
                          {t.link.squad ? '全员满 · 出手即接' : '出手即接'}
                        </em>
                      ) : null}
                    </>
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

      {/* 行动顺位 —— 把每个人的行动条摊开排一行：谁先动、还差几拍，出招前一眼看得清。
          卡片是绝对定位 + translate 走的（见 orderCards 的注释）：
          顺位一变就是滑过去，不是「啪」地换一排 ——
          解封尽解那一拍的回手要靠这一下才看得见。 */}
      <div className={css.orderStrip} data-order-strip>
        <span className={`${css.orderCap} tiny mono`}>
          <Sneaker size={13} /> 行动顺位
        </span>
        <div
          className={css.orderCards}
          data-order-cards
          style={{ width: order.length * ORDER_STEP - ORDER_GAP }}
        >
          {order.map(({ c, pct, ready, eta }, i) => (
            <span
              key={c.id}
              className={css.orderCard}
              data-order={c.id}
              data-side={c.side}
              data-ready={ready ? '1' : undefined}
              data-next={i === 0 && !ready ? '1' : undefined}
              data-surge={surge === c.id ? '1' : undefined}
              data-slot={i}
              style={{ '--u': c.hue, '--x': `${i * ORDER_STEP}px` } as CSSProperties}
              title={`${named(c)} · 行动条 ${Math.round(pct)}%${ready ? ' · 已待命' : ` · 约 ${eta} 拍后出手`}`}
            >
              <i className={css.orderSigil}>{c.sigil}</i>
              <b>{named(c)}</b>
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
          {foeLine.map((c) => (
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

      {/* 观测频道 —— 右侧一栏竖排战报：谁出了哪一手、说了什么、打在谁身上，一眼扫得到，
          又不会压在敌阵脚下挡视野 */}
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
                {/* 轮到谁出手：我方是有脸的人（敌阵那些「未评定」的终末仍旧只有纹章） */}
                {actor.side === 'ally' ? (
                  <Portrait
                    avatarId={actor.avatarId ?? actor.id} name={named(actor)} hue={actor.hue} sigil={actor.sigil}
                    size={44} round
                  />
                ) : (
                  <span className="glyph" style={{ '--g': actor.hue } as CSSProperties}>
                    <span style={{ fontSize: 14 }}>{actor.sigil}</span>
                  </span>
                )}
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{named(actor)}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {actor.cls}
                    {actor.startNeed > 0 && actor.startUsed < actor.startNeed
                      ? ` · 封印 ${actor.startUsed}/${actor.startNeed} · 普攻与技能尚未解禁`
                      : stackText(actor) || (actor.note ? ` · ${actor.note}` : '')}
                  </span>
                </span>
              </div>

              {panel === 'root' ? (
                <div className={css.seq} data-command-menu>
                  {SEQ.map((b) => {
                    // 普通攻击是「攻击」这一条指令本身，不是技能表里的一栏（用户口径）。
                    // 封印未解的人按不动这一条 —— 灰着并写清为什么，比按下去没反应好。
                    const basic = b.id === 'atk'
                      ? legalSkills(actor, st).find((x) => x.kind === '普攻')
                      : undefined
                    const locked = b.id === 'atk' && !basic
                    return (
                    <button
                      key={b.id}
                      type="button"
                      data-cmd={b.id}
                      data-locked={locked ? '1' : undefined}
                      disabled={locked}
                      title={locked
                        ? `尚未解禁：解封 ${actor.startUsed}/${actor.startNeed} 打满后，普攻与技能才放得出来`
                        : undefined}
                      className={css.seqBtn}
                      onClick={() => {
                        if (b.id === 'atk') {
                          if (basic) issue({ t: 'atk', targetId: '' })
                        } else if (b.id === 'guard') issue({ t: 'guard' })
                        else setPanel(b.id as Panel)
                      }}
                    >
                      <b.Icon size={14} weight="bold" />
                      <span>{b.label}</span>
                      {b.id === 'flee' ? <span className={css.seqSub}>{Math.round(st.fleeOdds * 100)}%</span> : null}
                      {b.id === 'gear' ? <span className={css.seqSub}>不耗回合</span> : null}
                      {locked ? <span className={css.seqSub}>未解禁</span> : null}
                    </button>
                    )
                  })}
                </div>
              ) : null}

              {panel === 'skill' ? (
                <SubPanel title="技能" onBack={() => setPanel('root')}>
                  <div className={css.list} data-skill-list data-actor={actor.id}>
                    {SKILL_GROUPS.map((g) => {
                      const rows = legalSkills(actor, st).filter((k) => k.kind === g.kind)
                      if (!rows.length) return null
                      return (
                        <div key={g.kind} className={css.skillGroup} data-skill-group={g.kind}>
                          <div className={css.groupCap} data-skill-group-cap={g.kind}>
                            <b>{g.label}</b>
                            <span className={css.groupNote}>{g.note}</span>
                          </div>
                          {rows.map((k) => (
                            <SkillBtn
                              key={k.id}
                              k={k}
                              sp={actor.sp}
                              cd={actor.cds[k.id] ?? 0}
                              onClick={() => issue({ t: 'skill', skillId: k.id })}
                            />
                          ))}
                        </div>
                      )
                    })}
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
                        // 专属件认人：它认的是系丝线的那只手，不是背包里有没有位置
                        // 再一条：一件装具只有一副，队伍里谁先系上就是谁的 —— 别人那格按不动
                        const holder = Object.keys(equipMap).find((pid) => pid !== actor.id && equipMap[pid] === gid)
                        const ok = canEquip(actor.id, gid) && !holder
                        return (
                          <button
                            key={gid}
                            type="button"
                            data-gear={gid}
                            data-gear-only-for={!canEquip(actor.id, gid) ? g.onlyFor?.join(',') : undefined}
                            data-gear-held-by={holder || undefined}
                            disabled={!ok}
                            className={`${css.row} ${on ? css.rowOn : ''}`}
                            title={ok ? g.desc
                              : holder ? `${g.name} 正系在 ${personOf(holder)?.name ?? holder} 身上 —— 一件装具只有一副。`
                              : `${g.name} 只认 ${g.onlyFor?.map((id) => personOf(id)?.name ?? id).join('、')} —— 别人系上也只是一条普通的线。`}
                            onClick={() => ok && doEquip(gid)}
                          >
                            <SkillIcon id={`gear-${gid}`} />
                            <span className={css.rowName}>
                              {g.name}
                              <i className={css.rowSub}>{g.sub}</i>
                            </span>
                            <span className={css.rowCost}>{holder ? '在别人身上' : !ok ? '认人' : on ? '装配中' : `×${owned[gid]}`}</span>
                            <span className={css.rowDesc} data-gear-desc>{g.desc}</span>
                            <span className={css.rowNotes} data-gear-notes>
                              {gearNotes(g).map((n, i) => <i key={`${i}-${n}`}>{n}</i>)}
                              {holder ? <i>已在 {personOf(holder)?.name ?? holder} 身上</i>
                                : !ok ? <i>仅限 {g.onlyFor?.map((id) => personOf(id)?.name ?? id).join('、')}</i> : null}
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
/** 变身期间顶的是另一副名字（黄金狮子）—— 场上各处叫的都得跟着换 */
function named(c: Combatant): string {
  return c.morph?.kind === 'form' ? c.morph.name : c.name
}

/** 印记读数：还没蓄满才显示（蓄满了这一手就列在菜单里了，不必再报数） */
function stackText(c: Combatant): string {
  const need = endOf(c)?.needsStack ?? 0
  if (need <= 0 || c.stack >= need) return ''
  return ` · ${c.scar ? '樱印' : '印记'} ${c.stack}/${need}`
}

/** 技能面板分组：普攻不是技能，不该和技能混在同一张表里 */
const SKILL_GROUPS: Array<{ kind: SkillKind; label: string; note: string }> = [
  { kind: '到达点', label: '到达点（End）', note: '每个人的终结技 · 蓄满印记才列得出来' },
  { kind: '启动', label: '启动', note: '解封印的前置手 · 打满才算起手完毕' },
  { kind: '技能', label: '技能', note: '本命的那几手 · 各有代价与冷却' },
]

function notesOf(k: SkillSpec): string[] {
  const out: string[] = []
  // 这一手在框架里按哪一类打的 —— 同类的两个人可以直接对着看
  if (k.arch) out.push(`框架 · ${archNameOf(k.arch) ?? k.arch}`)
  // 倍率与效果同出一处（skilltext）：面板读的是实值，一件不落
  const mul = mulTextOf(k)
  if (mul) out.push(mul)
  out.push(TARGET_LABEL[k.target] ?? k.target)
  if (k.cost) out.push(`耗 ${k.cost} 体力`)
  if (k.cd) out.push(`冷却 ${k.cd} 拍`)

  const eff = effectTextsOf(k)
  if (eff.length) out.push(...eff)
  else if (k.power <= 0) out.push('不造成伤害 · 亦无附带效果')

  if (k.needsStack) out.push(`需 ${k.needsStack} 层印记`)
  if (k.requireAlly) out.push(`需 ${personOf(k.requireAlly)?.name ?? k.requireAlly} 在场`)
  if (k.requireAll?.length) out.push(`合击 · ${k.requireAll.length} 人全员在场`)
  if (k.linkPow) out.push(`参加者各补 ${Math.round(k.linkPow * 100)}% 出力`)
  if (k.mergeAlly) out.push(`与 ${personOf(k.mergeAlly)?.name ?? k.mergeAlly} 合体 ${k.mergeTicks ?? 2} 拍`)
  if (k.morph) out.push(`变形 ${k.morphTicks ?? 3} 拍 · 变身毕起算冷却 ${k.morphCd ?? 0} 拍`)
  if (k.form) {
    out.push(`变身「${k.form.name}」${k.form.ticks} 拍`)
    out.push('变身期间整份技能表换成那副面目的打法')
  }
  if (k.ult) out.push(`终结技 · 蓄 ${k.ult} 拍`)
  if (k.kind === '启动') out.push('启动技 · 解封普攻与技能')
  // 解封是一层一层拧开的：把每一层的台词也摊开，免得玩家以为五下是同一句
  if (k.startLines?.length) out.push(`逐层台词 · ${k.startLines.join(' → ')}`)
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
      className={`${css.row} ${k.kind === '启动' ? css.rowStart : ''} ${k.kind === '到达点' ? css.rowEnd : ''} ${poor || cooling ? css.rowPoor : ''}`}
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

/* ---------- 行动顺位条的滑动 ----------
   卡片在容器里是绝对定位的，横坐标由 `--x` 给（第几张 × 一步的距离），
   位移写在 `translate` 上、并有过渡 —— 于是顺位一变就是滑过去。
   宽度必须是个常数：靠内容撑宽的话，JS 算不出该滑多远。 */
const ORDER_CARD_W = 112
const ORDER_GAP = 6
const ORDER_STEP = ORDER_CARD_W + ORDER_GAP

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
  const guard = c.guardAxis ? c.guardPts : 0
  if (!c.buffs.length && !c.shield && !c.taunt && !guard && !c.broken && !c.ward && c.charge <= 1) return null
  const label: Record<string, string> = {
    /* `mark` 读作「易伤」不是「破绽」——
       它是一条「被打更重」的减益，而「破绽」是反现实实体身上那层轴护盾
       （guardPts / guardAxis，见下面单独那一条）。两个词从前混用过，这里分开。 */
    atk: '攻势', spd: '加速', evade: '闪避', acc: '命中', shield: '护罩', mark: '易伤', slow: '减速',
    // 敌方向我方挂的：标签直说后果，不必让玩家去翻说明
    silence: '沉默', bleed: '流血', frail: '减攻',
    stasis: '停滞', lockdown: '观测封锁', stall: '断拍',
  }
  return (
    <div className={css.buffs}>
      {/* 破绽：反现实实体身上那层「只有对上这条轴才削得动」的护盾。
          轴名直接挂在标签上 —— 这一条的全部意义就是让玩家**读**出来它怕什么，
          藏起来的话，五轴里另外四条就永远只是面板上的装饰。 */}
      {c.guardAxis && guard > 0 ? (
        <span className={css.buff} data-buff="guard" data-guard-axis={c.guardAxis}
          data-guard-left={guard}
          title={`破绽护盾：只有「${c.guardAxis}」这一路的攻击削得动（每段削 1 点），削穿它停一拍且挨打更重。还剩 ${guard} 点`}>
          破绽 · {c.guardAxis}<i className={css.buffT}>{guard}</i>
        </span>
      ) : null}
      {c.broken > 0 ? (
        <span className={css.buff} data-buff="broken" data-debuff="1"
          title={`破绽已成立 —— 它停 ${c.broken} 拍，这期间挨打 ×${TUNING.breakAmp}`}>
          破绽成立<i className={css.buffT}>{c.broken}</i>
        </span>
      ) : null}
      {c.buffs.map((b, i) => (
        <span key={`${b.k}-${i}`} className={css.buff} data-buff={b.k} data-debuff={isDebuff(b.k) ? '1' : undefined}>
          {label[b.k] ?? b.k}{b.v > 0 ? `+${Math.round(b.v * 100)}%` : ''}
          <i className={css.buffT} title={`还剩 ${b.t} 拍`}>{b.t}</i>
        </span>
      ))}
      {c.taunt > 0 ? <span className={css.buff} data-buff="taunt">引仇</span> : null}
      {c.ward > 0 ? (
        <span className={css.buff} data-buff="ward"
          title={`护持：接下来 ${c.ward} 次负面效果整条无效`}>
          护持<i className={css.buffT}>{c.ward}</i>
        </span>
      ) : null}
      {c.charge > 1 ? (
        <span className={css.buff} data-buff="charge"
          title={`蓄力：下一手伤害 ×${c.charge}（挨到最大生命 10% 的一下即中断）`}>
          蓄力 ×{c.charge}
        </span>
      ) : null}
    </div>
  )
}

/* ---------- 连携技：右侧立起来的那张牌 ----------
   羁绊攒满、自己接上的那一手，值得单占一块地方：
   谁跟谁一起打的，看脸就知道 —— 头像叠着排，招式名压在下头。
   跟伤害数字挤在一起就分不出「这是合击」了。

   牌面上排的是**人**，所以 members 里给的是档案 id —— 我方那几条向来如此。
   但连携不只有我方那几套：对面那位骷髅假面之男也接得上一条（与异次元的蕾雅），
   而他**不入档案**（roster 第 6 行）：personOf 查不到他，只剩一个 raw id 可念。
   于是这里再退一层 —— 指名首领那一张表（bosses.ts）里写着他的名字、纹章与颜色，
   正好是这块牌要的两样。两级都查不到才认命念 id。 */

function linkFaceOf(id: string) {
  const p = personOf(id)
  if (p) return { name: p.name, hue: p.hue as string | undefined, sigil: undefined as string | undefined }
  const nb = namedBossOf(id)
  /* 颜色只在**查得到**的时候给：Portrait 拿它去拼渐变，喂一个 `var(--ink)` 进去
     会拼成 `var(--ink)2e` 这种不是颜色的东西，整条 background 会被丢掉。
     查不到就留空，让它照常回自己那张灰底 —— 名字照念。 */
  return { name: nb?.name ?? id, hue: nb?.hue, sigil: nb?.sigil }
}

function LinkPop({ link }: { link: { id: string; name: string; members: string[] } }) {
  return (
    <div className={css.linkPop} data-link={link.id} data-link-pop="1" role="status">
      <b className={css.linkPopCap}>连携</b>
      <div className={css.linkPopFaces}>
        {link.members.map((id, i) => {
          const f = linkFaceOf(id)
          return (
            <span
              key={id}
              className={css.linkPopFace}
              /* 一张压一张：并排太散，叠起来才像「凑在一起」的两个人 */
              style={{ marginLeft: i ? -15 : 0, zIndex: 9 - i } as CSSProperties}
              data-link-face={id}
            >
              <Portrait avatarId={id} name={f.name} hue={f.hue} sigil={f.sigil}
                className={css.linkPopAva} size={54} round eager />
              <i style={{ color: f.hue ?? 'var(--ink)' }}>{f.name}</i>
            </span>
          )
        })}
      </div>
      <b className={css.linkPopName}>{link.name}</b>
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
  /** 单体演出就落在他身上（全体技走全屏那一层，这里只留飘字） */
  const onMe = hit && fx!.scope === 'one'
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
      {/* 我方队位放真头像；敌阵的终末没有脸，仍旧一枚纹章（未评定的东西不该看着像个人） */}
      {c.side === 'ally' ? (
        <Portrait
          avatarId={c.avatarId ?? c.id} name={named(c)} hue={c.hue} sigil={c.sigil}
          size={44} style={{ borderRadius: 3 }}
        />
      ) : (
        <span className="glyph" style={{ '--g': c.hue } as CSSProperties}>
          <span style={{ fontSize: 14 }}>{c.sigil}</span>
        </span>
      )}

      <div className={css.unitBody}>
        <div className={css.unitTop}>
          <b className={css.unitName} data-form={c.morph?.kind === 'form' ? c.morph.name : undefined}>
            {named(c)}
          </b>
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
            /* 说明写它从原文哪儿来，读数写它这一场究竟加减多少 —— 两样都得有 */
            <span
              className={css.unitPas}
              data-passive={c.passive.name}
              title={[c.passive.desc, ...passiveText(c.passive)].join('\n')}
            >
              〔{c.passive.name}〕
            </span>
          ) : null}
          {c.gone > 0 ? <span className={css.goneMark}>合体中 · {c.gone} 拍</span> : null}
          {c.morph ? (
            <span className={css.morphMark} data-morph={c.morph.name}>
              {c.morph.kind === 'form'
                ? `变身 · 剩 ${c.morph.ticks} 拍`
                : `化身 · ${c.morph.name} · ${c.morph.ticks} 拍`}
            </span>
          ) : null}
          <BuffTags c={c} />
        </div>
      </div>

      {onMe ? (
        <span
          key={fx!.n}
          className={css.fxOn}
          data-fx-on={c.id}
          data-fx={fx!.kind}
          data-fx-tone={fx!.tone}
          data-fx-var={fxSeed(fx!.skillId).variant}
          style={{ '--fx-hue': fxSeed(fx!.skillId).hue, '--u': c.hue } as CSSProperties}
          aria-hidden
        >
          <em className={css.fxTagOn}>{fx!.skill}</em>
        </span>
      ) : null}

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
  /** 单体演出就落在他身上（全体技走全屏那一层，这里只留飘字） */
  const onMe = hit && fx!.scope === 'one'
  const hpPct = (c.hp / c.hpMax) * 100
  const ready = c.bar >= TUNING.barMax
  return (
    <div className={css.foe} data-unit={c.id} data-side="enemy" data-foe-card={c.id}>
      {/* 名字在头上 */}
      <div className={css.foeName} data-foe-name>
        {/* 头目档：每场至少一个。徽标只是把名册上的分层摆到明面上 ——
            精英是硬骨头，首领还带一记要防的终结技。 */}
        {c.tier ? (
          <span
            className={`${css.foeTier} ${c.tier === 'boss' ? css.foeTierBoss : ''}`}
            data-foe-tier={c.tier}
          >
            {c.tier === 'boss' ? '首领' : '精英'}
          </span>
        ) : null}
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
        {onMe ? (
          <span
            key={fx!.n}
            className={css.fxOnBig}
            data-fx-on={c.id}
            data-fx={fx!.kind}
            data-fx-tone={fx!.tone}
            data-fx-var={fxSeed(fx!.skillId).variant}
            style={{ '--fx-hue': fxSeed(fx!.skillId).hue } as CSSProperties}
            aria-hidden
          >
            <em className={css.fxTagOn}>{fx!.skill}</em>
          </span>
        ) : null}
      </div>

      {/* 数值与状态在脚下。血量另挂 data-foe-hp 一份：
          脚下那行是给人看的（数字与标签拼在一起），要按血量挑目标得有个准头，
          别让谁去正则别人的屏上文案。 */}
      <div className={css.foeFoot} data-foe-foot data-foe-hp={c.hp} data-foe-hpmax={c.hpMax}>
        {/* 头目档只换**外形**，不换长短：条子的宽窄与杂兵一模一样
            （见 Battle.module.css 的 .hpBarBig[data-tier='boss']）——
            把首领那条拉得更长，在屏上分出来的是「更宽」，不是「更强」。 */}
        <div className={css.hpBarBig} data-tier={c.tier}>
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
