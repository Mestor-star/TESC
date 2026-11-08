import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  CaretLeft, CaretRight, Compass, Crosshair, GlobeHemisphereWest, MapTrifold, X,
} from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { EPISODES } from '../lib/freetime'
import { rSeverity, stageSeverity } from '../lib/format'
import {
  MAP_KIND_LABEL, MAP_LAYER_HINT, MAP_LAYER_LABEL, MAP_NODES,
  mapChildrenOf, mapNodeById, mapNodeOfPlace, mapNodesOf, worldNodeOf,
} from '../data/map'
import type { MapNodeGeo } from '../data/map'
import type { MapLayer, MapScale } from '../data/types'

import css from './Map.module.css'

/* ============================================================
   地图 —— 世界 / 区域 两级索引
   ------------------------------------------------------------
   ① **世界档**：一条横向的节点带（地表 + 浮空），窄屏横滑、不折行；
      「异次元」「▼ 地表以下」这两档不在世界图面上，另起两栏列表铺在带子下面。
   ② **区域档**：按世界归属分组，组内是节点网格；点一格，详情落到右侧那条面板里。
   ③ 两档都读得出三态：当前所在（--steel 边）／已去过（--line-2 边 + --ink-dim）／
      没去过（--line 边 + --ink-faint）。只靠 1px 边与文字色，不发光、不铺底色。

   旧版「球壳 + 真世界底图 + 下钻平面图」的 data 属性钩子一个没丢，只是换了落点
   （冒烟按名取元素，不认形状）：
     data-map-globe / -level / -kind → 左栏节点面容器（kind 现在读 band / grid）
     data-map-base                  → 世界档那条节点带
     data-map-plan-layer / -plan    → 区域档的组容器 / 组头
     data-map-stub                  → s-lab 那一格

   口径（依主人 2026-10-23）：
   · 樱次元**就是我们所处的这一个世界**，不是与死灵次元并列的另一个次元 → 只当归属标注；
   · 三大学院都在天上（苍之学园 / 卡乌斯学院 / 九灯学院）；
   · 苍之学园地下 B-267 的研究所是**那座浮空学园自己的地下层**，挂在学园那一柱的正下方。
   ============================================================ */

const SCALE_LABEL: Record<MapScale, string> = { world: '世界', region: '区域' }

const LAYER_ORDER: MapLayer[] = ['surface', 'underground', 'sky', 'otherworld']

/** 父链里有没有踩到这一位（浮空学园地下的那两处靠它认） */
function underOf(id: string, ancestor: string): boolean {
  let cur: MapNodeGeo | null = mapNodeById(id)
  for (let i = 0; i < 8 && cur; i++) {
    if (cur.id === ancestor) return true
    cur = cur.parent ? mapNodeById(cur.parent) : null
  }
  return false
}

/** 区域档分组：上溯到最外层的那块区域（大区）—— 大区自己也算自己那一组 */
function regionRootOf(n: MapNodeGeo): MapNodeGeo {
  let top = n
  let cur: MapNodeGeo | null = n
  for (let i = 0; i < 12 && cur; i++) {
    top = cur
    if (!cur.parent) break
    const p = mapNodeById(cur.parent)
    if (!p || p.scale === 'world') break
    cur = p
  }
  return top
}

/** 从最外层一路排到它自己；樱次元那一格由面包屑的根按钮代表，不再重复 */
function trailOf(id: string): MapNodeGeo[] {
  const out: MapNodeGeo[] = []
  let cur: MapNodeGeo | null = mapNodeById(id)
  for (let i = 0; i < 12 && cur; i++) {
    if (!cur.frame) out.unshift(cur)
    cur = cur.parent ? mapNodeById(cur.parent) : null
  }
  return out
}

export function Map() {
  const { epDone, placeOfEvent, requestCodex, navigate } = useTerminal()

  const [scale, setScale] = useState<MapScale>('region')
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [offLayers, setOffLayers] = useState<MapLayer[]>([])
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  /* 此刻这一段：与剧情推进同一个指针（EPISODES 里第一段没收束的） */
  const curEv = useMemo(() => EPISODES.find((e) => !epDone[e.id]) ?? null, [epDone])
  const placeNow = curEv ? placeOfEvent(curEv) : ''
  const hereNode = useMemo(() => mapNodeOfPlace(placeNow, curEv?.id), [placeNow, curEv])
  const hereWorld = hereNode ? worldNodeOf(hereNode) : null

  const level = scale === 'world' ? 1 : 2
  const nodes = useMemo(() => mapNodesOf(scale), [scale])

  /* ---------- 世界档：一条带子 ---------- */
  const bandNodes = useMemo(
    () => (scale === 'world'
      ? nodes.filter((n) => !n.frame
        && (n.layer === 'surface' || n.layer === 'sky')
        && !offLayers.includes(n.layer))
      : []),
    [scale, nodes, offLayers],
  )

  /* 两个旧插窗：手里拿着的是**整张表**（不止世界层那一档） */
  const underAll = useMemo(
    () => MAP_NODES.filter((n) => n.layer === 'underground' && !offLayers.includes(n.layer)),
    [offLayers],
  )
  const otherAll = useMemo(
    () => MAP_NODES.filter((n) => n.layer === 'otherworld' && n.scale === 'world' && !offLayers.includes(n.layer)),
    [offLayers],
  )

  /* ---------- 区域档：按大区分组（大区自己算自己那一组） ---------- */
  const regionGroups = useMemo(() => {
    if (scale !== 'region') return []
    const order: string[] = []
    const by: Record<string, MapNodeGeo[]> = {}
    for (const n of nodes) {
      if (offLayers.includes(n.layer)) continue
      const key = regionRootOf(n).id
      if (!by[key]) {
        by[key] = []
        order.push(key)
      }
      by[key].push(n)
    }
    return order.map((id) => ({ id, name: mapNodeById(id)?.name ?? id, items: by[id] }))
  }, [scale, nodes, offLayers])

  /* 键盘走的那一条顺序：跟屏幕上排的一致 */
  const navNodes = useMemo(
    () => (scale === 'world'
      ? [...bandNodes, ...otherAll, ...underAll]
      : regionGroups.flatMap((g) => g.items)),
    [scale, bandNodes, otherAll, underAll, regionGroups],
  )

  /* 世界档把「此刻在哪」提到它所在的那个大单元上 */
  const hereOnThisScale = scale === 'world' ? hereWorld : hereNode
  const hereId = hereOnThisScale?.id ?? null

  const curNode = useMemo(() => {
    const hit = cursorId ? navNodes.find((n) => n.id === cursorId) : null
    if (hit) return hit
    const at = hereId ? navNodes.find((n) => n.id === hereId) : null
    return at ?? navNodes[0] ?? null
  }, [cursorId, navNodes, hereId])

  const sel = selId ? mapNodeById(selId) : null
  const selWorld = sel ? worldNodeOf(sel) : null
  const selLinks = sel ? sel.links.map((id) => mapNodeById(id)).filter((n): n is MapNodeGeo => !!n) : []
  const selKids = sel ? mapChildrenOf(sel.id) : []
  const trail = sel ? trailOf(sel.id) : []

  /* 三态：此刻所在 / 已去过（挂着的时间线段收过一段）/ 还没去过 */
  const markOf = (n: MapNodeGeo): 'here' | 'seen' | 'locked' => {
    if (n.id === hereId) return 'here'
    const evs = n.refs.events ?? []
    return evs.some((id) => epDone[id]) ? 'seen' : 'locked'
  }

  const focusNode = useCallback((id: string) => {
    setCursorId(id)
    requestAnimationFrame(() => nodeRefs.current[id]?.focus())
  }, [])

  const onNodeClick = (n: MapNodeGeo) => {
    setCursorId(n.id)
    setSelId(n.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (!selId) return
      e.preventDefault()
      setSelId(null)
      return
    }
    if (e.key === 'z' || e.key === 'Z') {
      if (!curNode) return
      e.preventDefault()
      setCursorId(curNode.id)
      setSelId(curNode.id)
      return
    }
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
      : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : 0
    if (!step || !curNode) return
    const i = navNodes.findIndex((n) => n.id === curNode.id)
    const to = navNodes[i + step]
    if (!to) return
    e.preventDefault()
    focusNode(to.id)
  }

  const toggleLayer = (l: MapLayer) => {
    setOffLayers((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }

  /* 一格 = 1px 边 + 文字色；状态全在边和字上 */
  const card = (n: MapNodeGeo) => {
    const mark = markOf(n)
    const on = n.id === selId
    const kids = mapChildrenOf(n.id)
    return (
      <button
        key={n.id}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={[css.card, css['is-' + mark], on ? css.isOn : ''].filter(Boolean).join(' ')}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-here={mark === 'here' ? '1' : undefined}
        data-selected={on ? '1' : undefined}
        data-map-geo={n.geo ? n.geo[0] + ',' + n.geo[1] : undefined}
        data-map-expand={kids.length ? n.id : undefined}
        data-map-stub={n.id === 's-lab' ? 's-lab' : undefined}
        aria-label={n.name + ' · ' + MAP_KIND_LABEL[n.kind] + ' · ' + MAP_LAYER_LABEL[n.layer]
          + (n.r ? ' · R ' + n.r.toFixed(3) : '') + (kids.length ? ' · 有下一层' : '')}
        aria-pressed={on}
        title={n.name}
        onClick={() => onNodeClick(n)}
      >
        <span className={css.dot} data-shape={n.layer} />
        <span className={css.cardName}>{n.name}</span>
        <span className={css.cardMeta}>{MAP_KIND_LABEL[n.kind]} · {MAP_LAYER_LABEL[n.layer]}</span>
        {n.id === 's-lab' ? <span className={css.stubTag}>▼ 地下 267 层</span> : null}
        {mark === 'here' ? <span className={css.hereTag}>你在这里</span> : null}
      </button>
    )
  }

  /* 不在世界图面上的那两档：一行一处的窄列表 */
  const insetRow = (n: MapNodeGeo, i: number, side: 'l' | 'r') => {
    const mark = markOf(n)
    const on = n.id === selId
    const inSchool = underOf(n.id, 's-school')
    return (
      <button
        key={n.id + '#' + i}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={[css.row, css['is-' + mark], on ? css.isOn : ''].filter(Boolean).join(' ')}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-map-inset={side}
        data-here={mark === 'here' ? '1' : undefined}
        data-selected={on ? '1' : undefined}
        onClick={() => onNodeClick(n)}
      >
        <span className={css.dot} data-shape={n.layer} />
        <span className={css.rowName}>{n.name}</span>
        {inSchool ? <span className={css.rowNote}>浮空学园地下</span> : null}
        {n.via ? <span className={css.rowVia}>经 {n.via}</span> : null}
        {mark === 'here' ? <span className={css.hereTag}>你在这里</span> : null}
      </button>
    )
  }

  return (
    <div
      className={'vpage ' + css.page}
      onKeyDown={onKeyDown}
      data-map-scale={scale}
      data-map-level={level}
      data-map-here={hereId ?? ''}
    >
      <div className="vhead">
        <div>
          <div className="vhead__kicker">FIELD / SURVEY MAP</div>
          <h1>地图</h1>
        </div>
        <div className="vhead__right">
          <span className="chip" data-map-count>{nodes.length} 个节点</span>
          {scale === 'world' ? (
            <button
              type="button"
              className="chip"
              data-map-worldmark="w-sakura"
              onClick={() => { setSelId('w-sakura'); setCursorId('w-sakura') }}
            >
              樱次元 · 此刻所在的这一个世界
            </button>
          ) : null}
          <span className={'chip ' + (hereNode ? css.hereChip : css.hereChipOff)}>
            {hereNode ? '你在这里 · ' + hereNode.name : '当前地点不在图上'}
          </span>
          {curNode ? <span className="chip">方向键选点 · Z 进入 · Esc 退一层</span> : null}
        </div>
      </div>

      {/* 两条横档：一张图 / 四层。都走按钮 —— 键盘 Tab 得到，回车按得下 */}
      <div className={css.bars}>
        <div className={css.seg} role="group" aria-label="切换地图">
          {(['world', 'region'] as MapScale[]).map((s) => (
            <button
              key={s}
              type="button"
              className={css.segBtn + (scale === s ? ' ' + css.isOn : '')}
              aria-pressed={scale === s}
              data-map-scale-btn={s}
              onClick={() => { setScale(s); setSelId(null); setCursorId(null) }}
            >
              {s === 'world' ? <Compass size={14} weight="bold" /> : <MapTrifold size={14} weight="bold" />}
              {SCALE_LABEL[s]}图
            </button>
          ))}
        </div>

        <div className={css.legend} role="group" aria-label="按层筛选">
          <span className={css.legendCap}>层</span>
          {LAYER_ORDER.map((l) => {
            const off = offLayers.includes(l)
            return (
              <button
                key={l}
                type="button"
                className={css.layerBtn + (off ? ' ' + css.isOff : '')}
                aria-pressed={!off}
                data-map-layer={l}
                title={MAP_LAYER_HINT[l]}
                onClick={() => toggleLayer(l)}
              >
                <i className={css.layerDot} data-shape={l} />
                {MAP_LAYER_LABEL[l]}
              </button>
            )
          })}
        </div>
      </div>

      {/* 面包屑：跟着选中的那一格走，每一级都点得回去 */}
      <div className={css.crumbs} data-map-crumbs>
        <button
          type="button"
          className={css.crumb + (trail.length ? '' : ' ' + css.crumbOn)}
          data-map-crumb="0"
          onClick={() => { setSelId(null); setCursorId(null) }}
        >
          <GlobeHemisphereWest size={12} weight="bold" /> 樱次元
        </button>
        {trail.map((n, i) => (
          <Fragment key={n.id}>
            <CaretRight size={10} weight="bold" className={css.crumbSep} />
            <button
              type="button"
              className={css.crumb + (i === trail.length - 1 ? ' ' + css.crumbOn : '')}
              data-map-crumb={String(i + 1)}
              onClick={() => { setSelId(n.id); setCursorId(n.id) }}
            >
              {n.name}
            </button>
          </Fragment>
        ))}
        {trail.length ? (
          <button
            type="button"
            className={css.crumbBack}
            data-map-back
            onClick={() => {
              const up = trail.length > 1 ? trail[trail.length - 2].id : null
              setSelId(up)
              setCursorId(up)
            }}
          >
            <CaretLeft size={11} weight="bold" /> 退一层
          </button>
        ) : null}
      </div>

      <div className={css.layout}>
        {/* 节点面：两档共用一块版面，窄屏就整页纵向走 */}
        <div
          className={css.surface}
          data-map-canvas
          data-map-globe={scale}
          data-map-globe-level={level}
          data-map-globe-kind={scale === 'world' ? 'band' : 'grid'}
        >
          {scale === 'world' ? (
            <>
              {/* 世界档：一条带子，横滑不折行 */}
              <div className={css.band} data-map-band data-map-base>
                {bandNodes.map(card)}
              </div>

              {otherAll.length || underAll.length ? (
                <div className={css.insets}>
                  {otherAll.length ? (
                    <section className={css.inset} data-map-inset-box="otherworld">
                      <div className={css.insetHead}>
                        <i className={css.layerDot} data-shape="otherworld" /> 异次元
                      </div>
                      {otherAll.map((n, i) => insetRow(n, i, 'l'))}
                    </section>
                  ) : null}
                  {underAll.length ? (
                    <section className={css.inset} data-map-inset-box="underground">
                      <div className={css.insetHead}>
                        <i className={css.layerDot} data-shape="underground" /> ▼ 地表以下
                      </div>
                      {underAll.map((n, i) => insetRow(n, i, 'r'))}
                    </section>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className={css.groups}>
              {regionGroups.map((g) => (
                <section key={g.id} className={css.group} data-map-plan-layer={g.id}>
                  <div className={css.groupHead} data-map-plan={g.id}>
                    <span className={css.groupName}>{g.name}</span>
                    <span className={css.groupCount}>{g.items.length}</span>
                  </div>
                  <div className={css.grid}>{g.items.map(card)}</div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* 右侧详情：点一格出这一格 */}
        <aside className={css.side} aria-live="polite">
          {!sel ? (
            <div className={'panel ' + css.sideEmpty}>
              <p>点一个地点，这里给出它的层级、读数与出处。</p>
              <p className={css.hint}>
                方向键在卡片之间挪，Z 打开这一格的详情，Esc 收起。
                {curNode ? <><br />此刻选着：<b>{curNode.name}</b></> : null}
              </p>
            </div>
          ) : (
            <div className={'panel ' + css.sideBody} data-map-detail={sel.id}>
              <div className={css.sideTop}>
                <div className={css.sideKicker}>
                  {SCALE_LABEL[sel.scale]}图 · {MAP_KIND_LABEL[sel.kind]}
                </div>
                <button type="button" className={css.iconBtn} aria-label="收起详情" onClick={() => setSelId(null)}>
                  <X size={14} weight="bold" />
                </button>
              </div>
              <h2 className={css.sideName}>{sel.name}</h2>
              <div className={css.tags}>
                <span className={css.tag}>{MAP_LAYER_LABEL[sel.layer]}</span>
                {sel.id === hereId ? <span className={css.tagHere}>你在这里</span> : null}
                {sel.geo ? <span className={css.tagFaint}>{sel.geo[0]}° · {sel.geo[1]}°</span> : null}
                {sel.frame ? <span className={css.tagHere}>本世界的归属</span> : null}
                {sel.r !== undefined ? (
                  <span className={css.tagSev} style={{ '--lc': rSeverity(sel.r).tone } as CSSProperties}>
                    R {sel.r.toFixed(3)} · {rSeverity(sel.r).label}
                  </span>
                ) : (
                  <span className={css.tagFaint}>R 值未标定</span>
                )}
                {sel.threat !== undefined ? (
                  <span className={css.tagSev} style={{ '--lc': stageSeverity(sel.threat).tone } as CSSProperties}>
                    危险度 S{sel.threat} · {stageSeverity(sel.threat).label}
                  </span>
                ) : null}
              </div>
              <p className={css.sideNote}>{sel.note}</p>

              {sel.via ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>怎么去</span>
                  <span className={css.hint}>{sel.via}</span>
                </div>
              ) : null}

              {selWorld && selWorld.id !== sel.id ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>所在</span>
                  <button
                    type="button"
                    className={css.jump}
                    onClick={() => { setScale('world'); setSelId(selWorld.id); setCursorId(selWorld.id) }}
                  >
                    {selWorld.name} <CaretRight size={11} weight="bold" />
                  </button>
                </div>
              ) : null}

              {selLinks.length || selKids.length ? (
                <div className={css.sideBlock}>
                  <div className={css.sideCap}>可达 / 下钻</div>
                  <div className={css.jumps}>
                    {selLinks.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={css.jump}
                        data-edge-layer={n.layer !== sel.layer ? n.layer : sel.layer}
                        onClick={() => { setSelId(n.id); setCursorId(n.id) }}
                      >
                        {n.name}
                      </button>
                    ))}
                    {selKids.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={css.jump + ' ' + css.jumpKid}
                        onClick={() => { setSelId(n.id); setCursorId(n.id) }}
                      >
                        {n.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={css.sideBlock}>
                <div className={css.sideCap}>相关事件</div>
                {sel.refs.events?.length ? (
                  <ul className={css.refList}>
                    {sel.refs.events.map((id) => {
                      const ev = TIMELINE.find((e) => e.id === id)
                      return (
                        <li key={id}>
                          <span className={css.refId}>{id}</span>
                          <span className={css.refTitle}>{ev ? ev.title : '（时间线上没有这一段）'}</span>
                          {ev && ev.id === curEv?.id ? <span className={css.refNow}>此刻</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : <p className={css.hint}>没有挂着的时间线段。</p>}
              </div>

              <div className={css.sideBlock}>
                <div className={css.sideCap}>相关词条</div>
                {sel.refs.codex?.length ? (
                  <div className={css.jumps}>
                    {sel.refs.codex.map((id) => (
                      <button key={id} type="button" className={css.jump} onClick={() => requestCodex(id)}>
                        {id}
                      </button>
                    ))}
                  </div>
                ) : <p className={css.hint}>没有挂着的图鉴条目。</p>}
              </div>

              {sel.refs.offtext ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>原文</span>
                  <span className={css.offChip}>public/offtext/{sel.refs.offtext}.txt</span>
                </div>
              ) : null}

              <div className={css.sideFoot}>
                <button
                  type="button"
                  className={'btn btn--ghost ' + css.sideFootBtn}
                  onClick={() => navigate('plot')}
                >
                  <Crosshair size={12} weight="bold" /> 去剧情推进
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className={css.foot}>
        <span className="tiny muted">
          {MAP_NODES.length} 个节点 · 依据只认时间线的地点、图鉴条目与 public/offtext 的原文切片
        </span>
      </div>
    </div>
  )
}
