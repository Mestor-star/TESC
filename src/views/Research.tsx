import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Check, Lock, Storefront, X } from '@phosphor-icons/react'

import { RESEARCH, RESEARCH_LINES } from '../data/research'
import type { ResearchEffect, ResearchLineId, ResearchNode } from '../data/research'
import { investResearch, researchStatusOf, syncResearch, useResearch } from '../lib/research'
import { OPERATOR_ID, PERSON_IDS, personOf } from '../data/castmeta'
import { TIMELINE } from '../data/timeline'
import { useTerminal } from '../terminal/Terminal'
import { GEAR_SHOP, ITEMS } from '../lib/battle/gear'
import {
  buyGear, buyItem, buyLevel, effectiveGrowth, levelCostOf,
  readBag, readCoin, readGearBag, readGrowth, readLevels, LEVEL_STEP_PCT,
} from '../lib/battle/store'
import { ITEM_TARGET_LABEL, effectTextsOf, modsTextsOf } from '../lib/battle/skilltext'
import { TUNING } from '../lib/battle/tuning'

import css from './Research.module.css'

/* ============================================================
   研究 —— 科研树 + 军需处柜台
   ------------------------------------------------------------
   这一页是两件事拼起来的，上树下柜：
     · 上：科研树（原先挂在武装图鉴底下那块研究室）。这一版改成**真树**：
       三条线各一根主干，节点按 tier 从上往下排，require 用直角折线连到前置；
     · 下：军需处（原先长在任务简报板上）。整块搬过来，行为一字不改 ——
       挂牌、柜台、三个标签页、买/升、观测记录全部原样。

   树的数据在 data/research.ts，存档与读写在 lib/research.ts（这一页只调 API，
   不改它的语义）。三条线的 require 都落在同一条线内，所以三根主干彼此没有
   交叉线 —— 每根自己画一张 SVG 就够，不必做全图坐标。
   ============================================================ */

/** 树上一格节点的外框（px）。三根主干共用这一组尺寸，SVG 与绝对定位才对得上 */
const NODE_W = 122
const NODE_H = 52
/** 同一层两个兄弟之间隔多远（也是「半格」的步长：x = 0 / 0.5 / 1） */
const LANE = 138
/** 层与层之间的竖向空隙 */
const GAP_Y = 38
const PITCH = NODE_H + GAP_Y

/** 一份 effect 念成人话：按四条比例偏序，写的顺序照「攻击 / 生命 / 物理抗性 / 反现实亲和」 */
function effectTextOf(e: ResearchEffect): string {
  const parts: string[] = []
  if (e.atk) parts.push('攻击 +' + (e.atk * 100).toFixed(1) + '%')
  if (e.hp) parts.push('生命 +' + (e.hp * 100).toFixed(1) + '%')
  if (e.resPhysical) parts.push('物理抗性 +' + (e.resPhysical * 100).toFixed(1) + '%')
  if (e.aff) parts.push('反现实亲和 +' + (e.aff * 100).toFixed(1) + '%')
  return parts.join(' · ')
}

interface Placed {
  node: ResearchNode
  /** 横向格位：0 / 0.5 / 1 …… 由叶子序列推出来（父节点落在子节点的中线上） */
  x: number
  /** 顶边（px） */
  top: number
}

interface Wire {
  /** 目标节点 id（一根线认一个 require） */
  key: string
  d: string
}

interface LineTree {
  id: ResearchLineId
  sub: string
  note: string
  width: number
  height: number
  nodes: Placed[]
  wires: Wire[]
}

/**
 * 一根主干的排布：先按 require 认父子，再让**叶子从左往右排**、
 * 父节点落在子节点的中线上（Reingold-Tilford 的最小版）。
 * 三条线各自是一棵小树，互不交叉 —— 所以每根自己算自己那一张。
 */
function buildLine(id: ResearchLineId): LineTree {
  const info = RESEARCH_LINES.find((l) => l.id === id)!
  const nodes = RESEARCH.filter((n) => n.line === id)
  const kidsOf = (nid: string) => nodes.filter((n) => n.require === nid)
  const xs = new Map<string, number>()
  let leaf = 0
  const walk = (n: ResearchNode): number => {
    const kids = kidsOf(n.id)
    const x = kids.length ? kids.reduce((s, k) => s + walk(k), 0) / kids.length : leaf++
    xs.set(n.id, x)
    return x
  }
  for (const root of nodes.filter((n) => !n.require)) walk(root)

  const placed: Placed[] = nodes.map((n) => ({
    node: n,
    x: xs.get(n.id) ?? 0,
    top: (n.tier - 1) * PITCH,
  }))
  const byId = new Map(placed.map((p) => [p.node.id, p]))
  const wires: Wire[] = []
  for (const p of placed) {
    const req = p.node.require
    if (!req) continue
    const from = byId.get(req)
    if (!from) continue
    const px = from.x * LANE + NODE_W / 2
    const cx = p.x * LANE + NODE_W / 2
    const py = from.top + NODE_H
    /* 直角拐弯：先竖着让出半格空隙，再横过去，再竖着落到子节点的顶边 */
    const midY = py + GAP_Y / 2
    wires.push({ key: p.node.id, d: 'M ' + px + ' ' + py + ' V ' + midY + ' H ' + cx + ' V ' + p.top })
  }
  const lanes = Math.max(1, leaf)
  const tiers = Math.max(...nodes.map((n) => n.tier))
  return {
    id: info.id,
    sub: info.sub,
    note: info.note,
    width: (lanes - 1) * LANE + NODE_W,
    height: (tiers - 1) * PITCH + NODE_H,
    nodes: placed,
    wires,
  }
}

/** 三根主干：数据是静态的，排布在模块加载时算一次就够 */
const LINES: LineTree[] = RESEARCH_LINES.map((l) => buildLine(l.id))

/** 一根线一个色：反现实解析走紫、武装改良走琥珀、体能训练走青 */
const LINE_TINT: Record<ResearchLineId, string> = {
  反现实解析: 'var(--violet)',
  武装改良: 'var(--amber)',
  体能训练: 'var(--jade)',
}

const STATE_LABEL = { done: '已研成', ready: '可研究', locked: '锁定' } as const

export function Research() {
  const { epDone, isMet, operatorName, push } = useTerminal()
  const save = useResearch()
  const [selId, setSelId] = useState<string | null>(null)
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  /* —— 研究点按来源重算（幂等）—— 文案与旧研究室逐字一致 ——
     只挂 [epDone]：同步本身会改存档，挂上存档就会自己咬自己。 */
  useEffect(() => {
    let alive = true
    void syncResearch(Object.keys(epDone).length).then((delta) => {
      if (!alive || delta <= 0) return
      push('info', '研究室 · 观测清算', '新入账 ' + delta + ' 研究点。', false)
    })
    return () => { alive = false }
  }, [epDone, push])

  /* ============================================================
     一、军需处的账（与搬迁前同一套读写）
     ============================================================ */
  const [coin, setCoin] = useState(0)
  const [gearBag, setGearBag] = useState<Record<string, number>>({})
  const [bag, setBag] = useState<Record<string, number>>({ ...TUNING.bagDefault })
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [growth, setGrowth] = useState<Record<string, number>>({})
  const [shopTab, setShopTab] = useState<'装具' | '补给' | '终末等级'>('装具')
  const [shopOpen, setShopOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([readCoin(), readGearBag(), readBag(), readLevels(), readGrowth()])
      .then(([c, gb, bg, lv, g]) => {
        if (!alive) return
        setCoin(c)
        setGearBag(gb)
        setBag(bg)
        setLevels(lv)
        setGrowth(g)
      })
      .catch(() => { /* 账读不出来就按空档：柜台上没有东西可兑，页面不因此塌 */ })
    return () => { alive = false }
  }, [])

  /* 能升的人：已经结识的那些（外加主角本人）—— 与任务简报那一版同一份口径 */
  const levelRows = useMemo(() => {
    const rows = PERSON_IDS.filter((id) => isMet(id)).map((id) => ({ id, name: personOf(id)?.name ?? id }))
    if (operatorName) rows.unshift({ id: OPERATOR_ID, name: operatorName })
    return rows
  }, [operatorName, isMet])

  const mainTitle = (id?: string) => (id ? TIMELINE.find((e) => e.id === id)?.title ?? id : '')
  const gearOpen = (g: { unlockMain?: string }) => !g.unlockMain || !!epDone[g.unlockMain]

  /* ============================================================
     二、树的读写
     ============================================================ */
  const done = RESEARCH.filter((n) => save.done[n.id]).length
  const sel = selId ? RESEARCH.find((n) => n.id === selId) ?? null : null
  const selState = sel ? researchStatusOf(sel) : null
  const selPrev = sel?.require ? RESEARCH.find((n) => n.id === sel.require) ?? null : null
  /** 锁定的时候差在哪 —— 前置没研 / 点数不够，各说各的 */
  const selBlocked = sel && selState === 'locked' && selPrev && !save.done[selPrev.id]
    ? '要先研成「' + selPrev.name + '」'
    : '研究点不足'

  const invest = (node: ResearchNode) => {
    const res = investResearch(node.id)
    if (!res.ok) {
      push('warn', '研究室 · 投不进去', res.reason ?? '这一项此刻研不了。', false)
      return
    }
    push(
      'success',
      '研究室 · 「' + node.name + '」研成',
      '投入 ' + node.cost + ' 研究点 —— ' + effectTextOf(node.effect) + '（全队 · 我方战斗面板）。',
      false,
    )
  }

  const focusNode = (id: string) => {
    setSelId(id)
    requestAnimationFrame(() => nodeRefs.current[id]?.focus())
  }

  /**
   * 键盘：上下换层、左右换线、Z 研成、Esc 收起。
   * 上下走的是**树的边**（上＝前置、下＝第一个子节点），不是简单的行号加减 ——
   * 那样在分支处才对得上「这一格是那条线接下来的那一层」。
   */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = sel
    if (e.key === 'Escape') {
      if (!selId) return
      e.preventDefault()
      setSelId(null)
      return
    }
    if (e.key === 'z' || e.key === 'Z') {
      if (!cur) return
      e.preventDefault()
      if (researchStatusOf(cur) === 'ready') invest(cur)
      return
    }
    const dir =
      e.key === 'ArrowUp' ? 'up'
      : e.key === 'ArrowDown' ? 'down'
      : e.key === 'ArrowLeft' ? 'left'
      : e.key === 'ArrowRight' ? 'right'
      : null
    if (!dir) return
    e.preventDefault()
    if (!cur) {
      const first = LINES[0]?.nodes[0]?.node.id
      if (first) focusNode(first)
      return
    }
    if (dir === 'up') {
      if (cur.require) focusNode(cur.require)
      return
    }
    if (dir === 'down') {
      const kids = RESEARCH.filter((n) => n.require === cur.id)
      if (kids.length) focusNode(kids[0].id)
      return
    }
    const li = LINES.findIndex((l) => l.id === cur.line)
    const nextLine = LINES[li + (dir === 'left' ? -1 : 1)]
    if (!nextLine) return
    const here = LINES[li].nodes.find((p) => p.node.id === cur.id)
    /* 换线时挑「层最接近、横向位置也最接近」的那一格 —— 三条线的形状一样，
       通常就是同一层同一格位，读起来像横着走了一格 */
    const pick = [...nextLine.nodes].sort((a, b) => (
      Math.abs(a.node.tier - cur.tier) - Math.abs(b.node.tier - cur.tier)
      || Math.abs(a.x - (here?.x ?? 0)) - Math.abs(b.x - (here?.x ?? 0))
    ))[0]
    if (pick) focusNode(pick.node.id)
  }

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">RESEARCH / LAB</div>
          <h1>研究</h1>
          <div className="vhead__sub">
            委员会与书架曼荼罗换知识的门路一直是通的 —— 上树投研究点，下柜兑贡献点。
          </div>
        </div>
        <div className="vhead__right">
          <span className="mono tiny" data-research-points={save.points}>
            研究点 <b>{save.points}</b>
          </span>
          <span className="mono tiny" data-research-done-count={done}>
            已研 <b>{done}</b>/{RESEARCH.length}
          </span>
        </div>
      </div>

      {/* ============ 上：科研树 ============ */}
      <section data-research-lab>
        <div className={css.intro}>
          观测攒下来的东西拿去换目录，换回来的不是新武器，是全队都受用的一层读数 ——
          它直接乘在我方的战斗面板上，敌方不吃这一份。点数来自：主线收束、任务完成、击破具名首领。
          <span className={css.keys}>
            <kbd>↑</kbd><kbd>↓</kbd> 换层 · <kbd>←</kbd><kbd>→</kbd> 换线 · <kbd>Z</kbd> 研成 · <kbd>Esc</kbd> 收起
          </span>
        </div>

        <div className={css.shell} onKeyDown={onKeyDown}>
          <div className={css.tree}>
            {LINES.map((line) => (
              <div key={line.id} className={css.line} style={{ width: line.width }} data-research-line={line.id}>
                <div className={css.lineHead}>
                  <span className={css.lineMark} style={{ background: LINE_TINT[line.id] }} />
                  <b>{line.id}</b>
                  <span className="tiny muted">{line.sub}</span>
                </div>

                <div className={css.canvas} style={{ width: line.width, height: line.height }}>
                  <svg
                    className={css.wires}
                    width={line.width}
                    height={line.height}
                    viewBox={'0 0 ' + line.width + ' ' + line.height}
                    aria-hidden
                  >
                    {line.wires.map((w) => {
                      const target = RESEARCH.find((n) => n.id === w.key)!
                      const st = researchStatusOf(target)
                      return (
                        <path
                          key={w.key}
                          d={w.d}
                          className={css.wire}
                          data-research-edge={w.key}
                          data-edge-state={st}
                        />
                      )
                    })}
                  </svg>

                  {line.nodes.map(({ node, x, top }) => {
                    const st = researchStatusOf(node)
                    const on = node.id === selId
                    return (
                      <button
                        key={node.id}
                        ref={(el) => { nodeRefs.current[node.id] = el }}
                        type="button"
                        className={css.node}
                        style={{ left: x * LANE, top } as CSSProperties}
                        data-research-node={node.id}
                        data-research-state={st}
                        data-research-cost={node.cost}
                        data-research-on={on ? '1' : '0'}
                        aria-pressed={on}
                        title={node.name + ' · 第 ' + node.tier + ' 层 · ' + node.cost + ' 点'}
                        onClick={() => setSelId(node.id)}
                      >
                        <span className={css.dot} aria-hidden>
                          {st === 'done' ? <Check size={9} weight="bold" /> : null}
                          {st === 'locked' ? <Lock size={8} weight="bold" /> : null}
                        </span>
                        <span className={css.nodeBody}>
                          <b className={css.nodeName}>{node.name}</b>
                          <i className={css.nodeCost}>{node.cost} 点</i>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 详情：宽屏落在树的右边，宽度不够时自己折到下面 */}
          <aside className={css.detail} data-research-detail>
            {sel && selState ? (
              <>
                <div className={css.detailHead}>
                  <span className={css.stateTag} data-research-detail-state={selState}>
                    {STATE_LABEL[selState]}
                  </span>
                  <b>{sel.name}</b>
                  <span className="tiny muted">{sel.line} · 第 {sel.tier} 层</span>
                </div>
                <p className={css.detailDesc}>{sel.desc}</p>
                <dl className={css.facts}>
                  <dt>效果</dt><dd>{effectTextOf(sel.effect)}</dd>
                  <dt>成本</dt><dd>{sel.cost} 研究点</dd>
                  <dt>前置</dt><dd>{selPrev ? selPrev.name : '无 —— 本线的起点'}</dd>
                </dl>
                {selState === 'done' ? (
                  <span className="chip chip--on" data-research-done>已研成</span>
                ) : (
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 12 }}
                    data-research-invest={sel.id}
                    disabled={selState !== 'ready'}
                    onClick={() => invest(sel)}
                  >
                    {selState === 'ready' ? '投入研究点' : selBlocked}
                  </button>
                )}
              </>
            ) : (
              <div className={css.detailHint}>
                <b>点一格看详情</b>
                <span className="tiny muted">方向键在树上走，Z 直接把这一格研成。</span>
                {RESEARCH_LINES.map((l) => (
                  <div key={l.id} className={css.noteRow}>
                    <span className={css.lineMark} style={{ background: LINE_TINT[l.id] }} />
                    <span className="tiny muted"><b>{l.id}</b> · {l.note}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* ============ 下：军需处（从任务简报整块搬来） ============ */}
      <section className={css.shopBar} data-gear-shop data-guide="shop">
        <span className={css.shopSigil} aria-hidden>泰</span>
        <div className={css.shopWho}>
          <b>军需处 · 泰尔米别克 · 简别科娃</b>
          <span className="tiny muted">
            梅芙的哥哥，苍之学园的前辈研究员，研究所深处的那位。研究所产出的装备不走市价，
            按贡献点兑换——作战结算累积的终末点数，在这儿就是贡献点。
          </span>
        </div>
        <span className={css.coin} data-coin title="作战结算累积 · 在军需处即贡献点">终末点数 <b>{coin}</b></span>
        <button
          className="btn btn--primary"
          style={{ fontSize: 12 }}
          data-shop-open
          onClick={() => setShopOpen(true)}
        >
          <Storefront size={13} weight="bold" style={{ marginRight: 5 }} />
          打开军需处
        </button>
      </section>

      {shopOpen ? (
        <div className={css.modal} data-shop-modal>
          <div className={css.modalBox + ' ' + css.modalBoxWide}>
            <div className={css.modalHead}>
              <Storefront size={15} weight="bold" />
              <b>军需处 · 研究所配给</b>
              <span className="tiny muted">贡献点 {coin} · 装具每人至多装配一件</span>
              <button className="btn btn--ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setShopOpen(false)} data-shop-close>
                <X size={12} weight="bold" />
              </button>
            </div>

            <div className={css.shopSeller} data-shop-seller>
              研究所仓库的账本摊在桌上。泰尔米别克 · 简别科娃——梅芙的哥哥——没有抬头：
              「终末点数你攒得不少了。这些不是买来的，是我们做出来、记在贡献上的东西。
              挑一件吧，一个人一件。」
            </div>

            <div className={css.shopTabs}>
              <button className={css.shopTab + (shopTab === '装具' ? ' ' + css.isOn : '')} data-shop-tab="装具" onClick={() => setShopTab('装具')}>
                研究所产出的装备
              </button>
              <button className={css.shopTab + (shopTab === '补给' ? ' ' + css.isOn : '')} data-shop-tab="补给" onClick={() => setShopTab('补给')}>
                道具补给
              </button>
              <button className={css.shopTab + (shopTab === '终末等级' ? ' ' + css.isOn : '')} data-shop-tab="终末等级" onClick={() => setShopTab('终末等级')}>
                终末等级
              </button>
            </div>

            {shopTab === '终末等级' ? (
              <div className={css.levelNote} data-level-note>
                <b>这里的「终末等级」与剧情里的终末无关。</b>
                <span>
                  剧情里的终末 Stage（Stage4『活性化』、Stage6『动摇』那一路）是那个人命里带来的东西，
                  按原文读数记在档案上，谁也不能改。
                  这一栏记的是另一回事：终端替在册者记下的常驻强化评级 ——
                  花终末点数买来的训练与校准，每级让本人的五轴与生命整体上抬 {LEVEL_STEP_PCT}%，
                  且不封顶，可以一路推上去。两者只是碰巧都叫「终末」，不是同一样东西。
                </span>
              </div>
            ) : null}

            <div className={css.shopGrid} data-shop-grid>
              {shopTab === '终末等级' ? levelRows.map((r) => {
                const lv = levels[r.id] ?? 0
                const cost = levelCostOf(lv)
                const afford = coin >= cost
                return (
                  <div key={r.id} className={css.shopItem} data-level={r.id} data-lv={lv}>
                    <div className={css.shopName}>
                      <b>{r.name}</b>
                      <i className="mono">终末等级 {lv}</i>
                    </div>
                    <p className={css.shopDesc}>
                      当前加成 +{(effectiveGrowth(growth, levels)[r.id] ?? 0).toFixed(0)}%（含任务成长）
                      {' · '}再升一级 → +{(effectiveGrowth(growth, levels)[r.id] ?? 0) + LEVEL_STEP_PCT}%
                    </p>
                    <div className={css.shopFoot}>
                      <span className="tiny muted">五轴与生命整体上抬 · 无等级上限</span>
                      <button
                        className="btn btn--ghost"
                        style={{ fontSize: 11 }}
                        data-level-up={r.id}
                        disabled={!afford}
                        onClick={async () => {
                          const res = await buyLevel(r.id, cost)
                          setCoin(res.coin)
                          setLevels(res.levels)
                          push(
                            res.ok ? 'success' : 'warn',
                            '军需处',
                            res.ok
                              ? r.name + ' 的终末等级 → ' + (res.levels[r.id] ?? 0) + '（余 ' + res.coin + ' 贡献点）'
                              : '贡献点不够 —— 先打几场再回来。',
                            false,
                          )
                        }}
                      >
                        升一级 · {cost} 贡献点
                      </button>
                    </div>
                  </div>
                )
              }) : shopTab === '装具'
                ? GEAR_SHOP.map((g) => {
                  const owned = gearBag[g.id] ?? 0
                  const full = g.maxOwn != null && owned >= g.maxOwn
                  return (
                    <div key={g.id} className={css.shopItem} data-shop={g.id} data-rank={g.rank}>
                      <div className={css.shopName}>
                        <b>{g.name}</b>
                        <i className="mono">{g.sub}</i>
                        {g.maxOwn ? <span className={css.limitTag}>限兑 {g.maxOwn}</span> : null}
                      </div>
                      <p className={css.shopDesc}>{g.desc}</p>
                      {/* 装备改了哪几个数 —— 与编成、档案读同一份翻法（skilltext.modsTextsOf）。 */}
                      <p className={css.shopMods} data-shop-mod={g.id}>
                        {modsTextsOf(g.mods).join(' · ') || '无修正'}
                      </p>
                      {g.skill ? (
                        <p className={css.shopEff} data-shop-skill={g.id}>
                          <b>附带一手「{g.skill.name}」</b>
                          {effectTextsOf(g.skill.effect).length
                            ? ' · ' + effectTextsOf(g.skill.effect).join(' · ') : ''}
                        </p>
                      ) : null}
                      <div className={css.shopFoot}>
                        <span className="tiny muted">
                          持有 {owned}{g.maxOwn ? '/' + g.maxOwn : ''}
                          {g.onlyFor ? ' · 仅限 ' + g.onlyFor.map((id) => personOf(id)?.name ?? id).join('、') : ''}
                        </span>
                        {!gearOpen(g) ? (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 11, opacity: 0.72 }}
                            data-gear-locked={g.id}
                            disabled
                            title={'完成主线「' + mainTitle(g.unlockMain) + '」后上架'}
                          >
                            需完成主线 · {mainTitle(g.unlockMain)}
                          </button>
                        ) : full ? (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 11, opacity: 0.72 }}
                            data-buy={g.id}
                            data-buy-full={g.id}
                            disabled
                            title="研究所的配给一人一件，兑完为止"
                          >
                            已兑完
                          </button>
                        ) : (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 11 }}
                            data-buy={g.id}
                            disabled={coin < g.price}
                            onClick={async () => {
                              const r = await buyGear(g.id, g.price, g.maxOwn)
                              setCoin(r.coin)
                              setGearBag(r.bag)
                              if (r.full) {
                                push('warn', '军需处', g.name + ' 是研究所的配给，一人只兑一件。', false)
                                return
                              }
                              push('success', '军需处', g.name + ' 已入库（余 ' + r.coin + ' 贡献点）', false)
                            }}
                          >
                            {g.price} 贡献点
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
                : ITEMS.map((it) => (
                  <div key={it.id} className={css.shopItem} data-shop={it.id} data-rank={1}>
                    <div className={css.shopName}>
                      <b>{it.name}</b>
                      <i className="mono">补给</i>
                    </div>
                    <p className={css.shopDesc}>{it.desc}</p>
                    {/* 补给的效果逐条写出来（同上：一处口径）——买的是「+35% 回复」，不是那句散文 */}
                    <p className={css.shopMods} data-shop-effect={it.id}>
                      {ITEM_TARGET_LABEL[it.target] ?? it.target}
                      {effectTextsOf(it.effect).length
                        ? ' · ' + effectTextsOf(it.effect).join(' · ') : ''}
                    </p>
                    <div className={css.shopFoot}>
                      <span className="tiny muted">携带 {bag[it.id] ?? 0}</span>
                      <button
                        className="btn btn--ghost"
                        style={{ fontSize: 11 }}
                        data-buy={it.id}
                        disabled={coin < it.price}
                        onClick={async () => {
                          const r = await buyItem(it.id, it.price)
                          setCoin(r.coin)
                          setBag(r.bag)
                          push('success', '军需处', it.name + ' 已入库（余 ' + r.coin + ' 贡献点）', false)
                        }}
                      >
                        {it.price} 贡献点
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className={css.modalFoot}>
              <span className="tiny muted">装具每人至多装配一件 · 战斗中更换不消耗回合</span>
              <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setShopOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
