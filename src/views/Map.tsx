import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CaretLeft, CaretRight, Crosshair, GlobeHemisphereWest } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { EPISODES } from '../lib/freetime'
import { rSeverity, stageSeverity } from '../lib/format'
import {
  MAP_KIND_LABEL, MAP_LAYER_LABEL, MAP_NODES,
  mapChildrenOf, mapNodeById, mapNodeOfPlace,
} from '../data/map'
import type { MapNodeGeo } from '../data/map'
import type { MapLayer } from '../data/types'

import css from './Map.module.css'

/* ============================================================
   地图 —— 一张世界图 + 右侧地区介绍
   ------------------------------------------------------------
    · 图上只放**真在地表上**的点（data/map.ts 里带 geo 的那些）与浮空的那几处
      （带 anchor：一条虚线挂到它正下方的地面，不假装自己有纬度）。
    · 点在哪儿，右边就介绍哪儿：层级、读数、原文里怎么说的、区域内还有哪些地方。
      区域层不再单独一屏 —— 从大区点进场所、再点进房间，右侧面板跟着换，
      面包屑一路退得回去。
    · 地下与异次元的世界层几处在世界图上没有坐标，列在图下面那一排。
    · 三态只靠 1px 边与文字色：当前所在 / 已去过 / 没去过。
   ============================================================ */

const BASE = import.meta.env.BASE_URL

const LAYER_ORDER: MapLayer[] = ['surface', 'underground', 'sky', 'otherworld']

/** 经度 → 图上横坐标（等距圆柱投影，与底图 800×400 同一把尺） */
function lonPct(lon: number): number { return ((lon + 180) / 360) * 100 }
/** 纬度 → 图上纵坐标（北在上） */
function latPct(lat: number): number { return ((90 - lat) / 180) * 100 }
/** 图上那枚小牌只放短名；全名在右栏与 title 里 */
function shortName(name: string): string { return name.split(/[·・]/)[0].trim() || name }

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

  const [cursorId, setCursorId] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  /* 此刻这一段：与剧情推进同一个指针（EPISODES 里第一段没收束的） */
  const curEv = useMemo(() => EPISODES.find((e) => !epDone[e.id]) ?? null, [epDone])
  const placeNow = curEv ? placeOfEvent(curEv) : ''
  const hereNode = useMemo(() => mapNodeOfPlace(placeNow, curEv?.id), [placeNow, curEv])

  /* ---------- 图上的三组 ---------- */
  const surfaceNodes = useMemo(
    () => MAP_NODES.filter((n) => n.layer === 'surface' && !!n.geo)
      .sort((a, b) => lonPct(a.geo![0]) - lonPct(b.geo![0])),
    [],
  )
  const skyNodes = useMemo(
    () => MAP_NODES.filter((n) => n.layer === 'sky' && n.anchor !== undefined)
      .sort((a, b) => lonPct(a.anchor!) - lonPct(b.anchor!)),
    [],
  )
  /* 世界图上没有坐标的那几处：地下与异次元的世界层节点 */
  const offNodes = useMemo(
    () => MAP_NODES.filter((n) => n.scale === 'world' && !n.frame
      && (n.layer === 'underground' || n.layer === 'otherworld')),
    [],
  )
  const onMap = useMemo(() => [...surfaceNodes, ...skyNodes], [surfaceNodes, skyNodes])

  /* 键盘走的那一条顺序：跟屏幕上的读取顺序一致 */
  const navNodes = useMemo(() => [...surfaceNodes, ...skyNodes, ...offNodes], [surfaceNodes, skyNodes, offNodes])

  /* 此刻在哪：从当前那一格往上找，找第一个真出现在图上的祖先 */
  const hereMarkId = useMemo(() => {
    const shown = new Set([...onMap, ...offNodes].map((n) => n.id))
    let cur: MapNodeGeo | null = hereNode
    for (let i = 0; i < 8 && cur; i++) {
      if (shown.has(cur.id)) return cur.id
      cur = cur.parent ? mapNodeById(cur.parent) : null
    }
    return null
  }, [hereNode, onMap, offNodes])

  /* 选中的那一格：没有选中时先给「此刻所在」，再没有就给天空都市 */
  const sel = selId ? mapNodeById(selId) : null
  const shown = sel ?? hereNode ?? mapNodeById('w-falktus')!

  const curNode = useMemo(() => {
    const hit = cursorId ? navNodes.find((n) => n.id === cursorId) : null
    if (hit) return hit
    const at = hereMarkId ? navNodes.find((n) => n.id === hereMarkId) : null
    return at ?? navNodes[0] ?? null
  }, [cursorId, navNodes, hereMarkId])

  const selLinks = shown.links.map((id) => mapNodeById(id)).filter((n): n is MapNodeGeo => !!n)
  const selKids = mapChildrenOf(shown.id)
  const trail = trailOf(shown.id)

  const markOf = (n: MapNodeGeo): 'here' | 'seen' | 'locked' => {
    if (n.id === hereMarkId) return 'here'
    const evs = n.refs.events ?? []
    return evs.some((id) => epDone[id]) ? 'seen' : 'locked'
  }

  const focusNode = useCallback((id: string) => {
    setCursorId(id)
    requestAnimationFrame(() => nodeRefs.current[id]?.focus())
  }, [])

  const pick = (n: MapNodeGeo) => {
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
      pick(curNode)
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

  /* 一格点：地表按经纬落位；浮空的横坐标是锚点经度，竖直那一头在天轨里 */
  const marker = (n: MapNodeGeo) => {
    const mark = markOf(n)
    const on = n.id === shown.id
    const sky = n.layer === 'sky'
    const lon = sky ? n.anchor! : n.geo![0]
    const x = lonPct(lon)
    const flip = x > 84
    const skyRow = sky ? skyNodes.findIndex((s) => s.id === n.id) % 2 : 0
    return (
      <button
        key={n.id}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={[css.mar, sky ? css.marSky : '', 'is-' + mark, on ? css.marOn : '', flip ? css.marFlip : ''].filter(Boolean).join(' ')}
        style={sky ? { left: x + '%', bottom: skyRow ? 42 : 8 } : { left: x + '%', top: latPct(n.geo![1]) + '%' }}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-map-geo={n.geo ? n.geo[0] + ',' + n.geo[1] : undefined}
        data-here={mark === 'here' ? '1' : undefined}
        data-selected={on ? '1' : undefined}
        aria-label={n.name + ' · ' + MAP_KIND_LABEL[n.kind] + ' · ' + MAP_LAYER_LABEL[n.layer]
          + (n.r ? ' · R ' + n.r.toFixed(3) : '') + (mapChildrenOf(n.id).length ? ' · 有下一层' : '')}
        aria-pressed={on}
        title={n.name}
        onClick={() => pick(n)}
      >
        <i className={css.marDot} data-shape={n.layer} />
        <span className={css.marName}>{shortName(n.name)}</span>
        {mark === 'here' ? <span className={css.hereTag}>你在这里</span> : null}
      </button>
    )
  }

  /* 图外的几处：一行一枚小牌 */
  const offChip = (n: MapNodeGeo) => {
    const mark = markOf(n)
    const on = n.id === shown.id
    return (
      <button
        key={n.id}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={[css.offChip, 'is-' + mark, on ? css.offOn : ''].filter(Boolean).join(' ')}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-map-inset="off"
        data-here={mark === 'here' ? '1' : undefined}
        data-selected={on ? '1' : undefined}
        aria-pressed={on}
        onClick={() => pick(n)}
      >
        <i className={css.marDot} data-shape={n.layer} />
        {n.name}
      </button>
    )
  }

  return (
    <div
      className={'vpage ' + css.page}
      onKeyDown={onKeyDown}
      data-map-scale="world"
      data-map-level="1"
      data-map-here={hereMarkId ?? ''}
    >
      <div className="vhead">
        <div>
          <div className="vhead__kicker">FIELD / SURVEY MAP</div>
          <h1>地图</h1>
        </div>
        <div className="vhead__right">
          <span className="chip" data-map-count>{onMap.length} 处于图上</span>
          <span className={'chip ' + (hereNode ? css.hereChip : css.hereChipOff)}>
            {hereNode ? '你在这里 · ' + hereNode.name : '当前地点不在图上'}
          </span>
          <span className="chip">方向键选点 · Z 打开 · Esc 收起</span>
        </div>
      </div>

      <div className={css.body}>
        {/* 世界图 */}
        <div
          className={css.chart}
          data-map-canvas
          data-map-globe="world"
          data-map-globe-level="1"
          data-map-globe-kind="map"
        >
          <div className={css.chartHead}>
            <span className={css.chartTitle}>
              <GlobeHemisphereWest size={13} weight="bold" /> 世界图 · 樱次元
            </span>
            <span className={css.legend} role="group" aria-label="按层区分">
              {LAYER_ORDER.map((l) => (
                <span key={l} className={css.legendItem} data-map-layer={l}>
                  <i data-shape={l} /> {MAP_LAYER_LABEL[l]}
                </span>
              ))}
            </span>
          </div>

          {/* 浮空的那几处：一条天轨，虚线挂到正下方的地面 */}
          <div className={css.skyRail} data-map-sky>
            {skyNodes.map((n) => <span key={'d' + n.id} className={css.skyDrop} style={{ left: lonPct(n.anchor!) + '%' }} />)}
            {skyNodes.map(marker)}
          </div>

          <div className={css.mapBody} data-map-base>
            <img className={css.base} src={BASE + 'map/world-location-map.svg'} alt="" aria-hidden="true" />
            {surfaceNodes.map(marker)}
          </div>

          {offNodes.length ? (
            <div className={css.offMap} data-map-inset-box="off">
              <span className={css.offCap}>图外的几处</span>
              {offNodes.map(offChip)}
            </div>
          ) : null}
        </div>

        {/* 地区介绍 */}
        <aside className={css.side} aria-live="polite">
          <div className={'panel ' + css.sidePanel} data-map-detail={shown.id}>
            <div className={css.sideTop}>
              <span className={css.sideKicker}>地区介绍 · {MAP_KIND_LABEL[shown.kind]}</span>
              <span className={css.sideLayer} data-shape={shown.layer}>{MAP_LAYER_LABEL[shown.layer]}</span>
            </div>
            <h2 className={css.sideName}>{shown.name}</h2>

            <div className={css.tags}>
              {shown.id === hereMarkId ? <span className={css.tagHere}>你在这里</span> : null}
              {shown.geo ? <span className={css.tagFaint}>{shown.geo[0]}° · {shown.geo[1]}°</span> : null}
              {shown.frame ? <span className={css.tagHere}>本世界的归属</span> : null}
              {shown.r !== undefined ? (
                <span className={css.tagSev} data-sev={rSeverity(shown.r).label}>
                  R {shown.r.toFixed(3)} · {rSeverity(shown.r).label}
                </span>
              ) : <span className={css.tagFaint}>R 值未标定</span>}
              {shown.threat !== undefined ? (
                <span className={css.tagSev}>危险度 S{shown.threat} · {stageSeverity(shown.threat).label}</span>
              ) : null}
            </div>

            <p className={css.sideNote}>{shown.note}</p>

            <div className={css.crumbs} data-map-crumbs>
              <button
                type="button"
                className={css.crumb + (trail.length ? '' : ' ' + css.crumbOn)}
                data-map-crumb="0"
                onClick={() => { setSelId('w-sakura'); setCursorId('w-sakura') }}
              >
                樱次元
              </button>
              {trail.map((n, i) => (
                <Fragment key={n.id}>
                  <CaretRight size={10} weight="bold" className={css.crumbSep} />
                  <button
                    type="button"
                    className={css.crumb + (i === trail.length - 1 ? ' ' + css.crumbOn : '')}
                    data-map-crumb={String(i + 1)}
                    onClick={() => pick(n)}
                  >
                    {n.name}
                  </button>
                </Fragment>
              ))}
              {trail.length > 1 ? (
                <button
                  type="button"
                  className={css.crumbBack}
                  data-map-back
                  onClick={() => pick(trail[trail.length - 2]!)}
                >
                  <CaretLeft size={11} weight="bold" /> 退一层
                </button>
              ) : null}
            </div>

            {shown.via ? (
              <div className={css.sideRow}>
                <span className={css.sideCap}>怎么去</span>
                <span className={css.sideVal}>{shown.via}</span>
              </div>
            ) : null}

            {selKids.length ? (
              <div className={css.sideBlock}>
                <div className={css.sideCap}>区域内的地点 <span className={css.count}>{selKids.length}</span></div>
                <div className={css.kids}>
                  {selKids.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={css.kid + (n.id === shown.id ? ' ' + css.kidOn : '')}
                      data-map-node={n.id}
                      data-map-kid={n.id}
                      data-map-stub={n.id === 's-lab' ? 's-lab' : undefined}
                      onClick={() => pick(n)}
                    >
                      <i className={css.marDot} data-shape={n.layer} />
                      <span className={css.kidName}>{n.name}</span>
                      <span className={css.kidMeta}>
                        {MAP_LAYER_LABEL[n.layer]} · {MAP_KIND_LABEL[n.kind]}
                        {n.r !== undefined ? ' · R ' + n.r.toFixed(3) : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selLinks.length ? (
              <div className={css.sideBlock}>
                <div className={css.sideCap}>可达</div>
                <div className={css.jumps}>
                  {selLinks.map((n) => (
                    <button key={n.id} type="button" className={css.jump} data-map-link={n.id} onClick={() => pick(n)}>
                      {n.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={css.sideBlock}>
              <div className={css.sideCap}>相关事件</div>
              {shown.refs.events?.length ? (
                <ul className={css.refList}>
                  {shown.refs.events.map((id) => {
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
              ) : <p className={css.sideHint}>没有挂着的时间线段。</p>}
            </div>

            <div className={css.sideBlock}>
              <div className={css.sideCap}>相关词条</div>
              {shown.refs.codex?.length ? (
                <div className={css.jumps}>
                  {shown.refs.codex.map((id) => (
                    <button key={id} type="button" className={css.jump} data-map-codex={id} onClick={() => requestCodex(id)}>
                      {id}
                    </button>
                  ))}
                </div>
              ) : <p className={css.sideHint}>没有挂着的图鉴条目。</p>}
            </div>

            {shown.refs.offtext ? (
              <div className={css.sideRow}>
                <span className={css.sideCap}>原文</span>
                <span className={css.offPath}>public/offtext/{shown.refs.offtext}.txt</span>
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
        </aside>
      </div>
    </div>
  )
}
