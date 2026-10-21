import { useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Compass, MapTrifold, Crosshair, X, Plus, Minus, CaretRight } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { EPISODES } from '../lib/freetime'
import { rSeverity, stageSeverity } from '../lib/format'
import {
  MAP_KIND_LABEL, MAP_LAYER_HINT, MAP_LAYER_LABEL, MAP_NODES,
  mapChildrenOf, mapEdgesOf, mapNodeById, mapNodeOfPlace, mapNodesOf, worldNodeOf,
} from '../data/map'
import type { MapLayer, MapNode, MapScale } from '../data/types'

import css from './Map.module.css'

/* ============================================================
   地图 —— 两张图，一份节点表（src/data/map.ts）
   ------------------------------------------------------------
   · 世界层：大地理单元（天空都市・弗尔克图斯 / 篝火之国 / 太平洋公海 / 次元…）；
   · 区域层：大区 → 场所 → 房间/街区。
   四个**层**（地表 / 地下 / 浮空 / 异次元）不是配色，是原文里真写着的事 ——
   富士山地下 300 米的浅间神社、B-267 的研究所、第 13 区的骨之圣堂、王宫地下祭祀场、
   第零区的尸肉神殿。点上去看，或者按层筛掉别的层。

   「此刻在哪」不在这里另算：走 `placeOfEvent` 那套口径（导演改过就以改过的为准），
   再拿 mapNodeOfPlace 落到图上一格。认不出就照实说「不在图上」。
   ============================================================ */

const SCALE_LABEL: Record<MapScale, string> = { world: '世界', region: '区域' }

/** 分层的记号：地图上挨在一起时，靠这一个字认得出它在哪一层 */
const LAYER_MARK: Record<MapLayer, string> = {
  surface: '',
  underground: '↓',
  sky: '↑',
  otherworld: '◇',
}

const LAYER_ORDER: MapLayer[] = ['surface', 'underground', 'sky', 'otherworld']

const ZOOMS = [1, 1.35, 1.7, 2.1]

type Dir = 'left' | 'right' | 'up' | 'down'

/** 方向键挪一格：同向取最近，斜着偏太多的算更远（不是拿直线距离糊过去） */
function nextInDir(from: MapNode, dir: Dir, pool: MapNode[]): MapNode | null {
  const [fx, fy] = from.xy
  let best: MapNode | null = null
  let bestScore = Infinity
  /* 先认「大致在那个方向上」：偏出去超过 1.6 倍就当作不在这个方向
     （不加这道，按最近的挑会在两个点之间来回弹）。锥里没有才退回宽判。 */
  let fallback: MapNode | null = null
  let fallbackScore = Infinity
  for (const n of pool) {
    if (n.id === from.id) continue
    const dx = n.xy[0] - fx
    const dy = n.xy[1] - fy
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    if (along <= 0.5) continue
    const perp = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const wide = along + perp * 2.2
    if (wide < fallbackScore) {
      fallbackScore = wide
      fallback = n
    }
    if (perp > along * 1.6) continue
    const score = along + perp * 0.6
    if (score < bestScore) {
      bestScore = score
      best = n
    }
  }
  return best ?? fallback
}

export function Map() {
  const { epDone, placeOfEvent, requestCodex, navigate } = useTerminal()

  const [scale, setScale] = useState<MapScale>('region')
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [offLayers, setOffLayers] = useState<MapLayer[]>([])
  const [zoom, setZoom] = useState(0)
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  /* 此刻这一段：与剧情推进同一个指针（EPISODES 里第一段没收束的） */
  const curEv = useMemo(() => EPISODES.find((e) => !epDone[e.id]) ?? null, [epDone])
  const placeNow = curEv ? placeOfEvent(curEv) : ''
  const hereNode = useMemo(() => mapNodeOfPlace(placeNow, curEv?.id), [placeNow, curEv])

  const nodes = useMemo(() => mapNodesOf(scale), [scale])
  const visible = useMemo(
    () => nodes.filter((n) => !offLayers.includes(n.layer)),
    [nodes, offLayers],
  )
  const edges = useMemo(
    () => mapEdgesOf(scale).filter(([a, b]) => !offLayers.includes(a.layer) && !offLayers.includes(b.layer)),
    [scale, offLayers],
  )

  /* 游标**在渲染里算**，不靠 effect 回写：换图 / 筛掉一层之后，原来那一格若看不见了，
     就落到「此刻所在」那一格，再不行落到第一格。 */
  const cursor: MapNode | null = useMemo(() => {
    const keep = visible.find((n) => n.id === cursorId)
    if (keep) return keep
    const here = hereNode ? visible.find((n) => n.id === hereNode.id) : undefined
    return here ?? visible[0] ?? null
  }, [visible, cursorId, hereNode])

  const sel = selId ? mapNodeById(selId) : null
  const selWorld = sel ? worldNodeOf(sel) : null
  const selLinks = sel ? sel.links.map((id) => mapNodeById(id)).filter((n): n is MapNode => !!n) : []
  const selKids = sel ? mapChildrenOf(sel.id) : []

  /* 到了世界图，就把「此刻在哪」提到它所在的那个大单元上 */
  const hereWorld = hereNode ? worldNodeOf(hereNode) : null
  const hereOnThisScale = scale === 'world' ? hereWorld : hereNode
  const hereIdOnThisScale =
    hereOnThisScale && nodes.some((n) => n.id === hereOnThisScale.id) ? hereOnThisScale.id : null

  const focusNode = useCallback((id: string) => {
    setCursorId(id)
    requestAnimationFrame(() => nodeRefs.current[id]?.focus())
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = cursor
    if (e.key === 'Escape') {
      if (selId) {
        e.preventDefault()
        setSelId(null)
        if (cur) focusNode(cur.id)
      }
      return
    }
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault()
      if (cur) setSelId(cur.id)
      return
    }
    if (!cur) return
    const dir: Dir | null =
      e.key === 'ArrowLeft' ? 'left'
      : e.key === 'ArrowRight' ? 'right'
      : e.key === 'ArrowUp' ? 'up'
      : e.key === 'ArrowDown' ? 'down'
      : null
    if (!dir) return
    const to = nextInDir(cur, dir, visible)
    if (!to) return
    e.preventDefault()
    focusNode(to.id)
  }

  const toggleLayer = (l: MapLayer) => {
    setOffLayers((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }

  const curNode = cursor

  return (
    <div
      className={'vpage ' + css.page}
      onKeyDown={onKeyDown}
      data-map-scale={scale}
      data-map-here={hereIdOnThisScale ?? ''}
    >
      <div className="vhead">
        <div>
          <div className="vhead__kicker">FIELD / SURVEY MAP</div>
          <h1>地图</h1>
          <div className="vhead__sub">
            世界图看大地理单元（浮空都市、异界、公海、次元），区域图从大区一路细到房间与街区。
            四个层各有各的记号 —— 地表、地下、浮空、异次元；原文写着深度的那几处，都挂在地下这一层。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip" data-map-count>{nodes.length} 个节点</span>
          <span className={hereNode ? 'chip chip--on' : 'chip chip--off'}>
            {hereNode ? '你在这里 · ' + hereNode.name : '当前地点不在图上'}
          </span>
          {curNode ? <span className="chip">方向键选点 · Z 看详情 · Esc 收起</span> : null}
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
              onClick={() => { setScale(s); setSelId(null) }}
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
                style={{ '--lc': 'var(--map-layer-' + l + ')' } as CSSProperties}
                title={MAP_LAYER_HINT[l]}
                onClick={() => toggleLayer(l)}
              >
                <i className={css.layerDot} data-shape={l} />
                {MAP_LAYER_LABEL[l]}
              </button>
            )
          })}
        </div>

        <div className={css.seg} role="group" aria-label="缩放">
          <button
            type="button"
            className={css.iconBtn}
            aria-label="缩小"
            disabled={zoom === 0}
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
          >
            <Minus size={14} weight="bold" />
          </button>
          <span className={css.zoomNow}>{Math.round(ZOOMS[zoom] * 100)}%</span>
          <button
            type="button"
            className={css.iconBtn}
            aria-label="放大"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
          >
            <Plus size={14} weight="bold" />
          </button>
        </div>
      </div>

      <div className={css.layout}>
        {/* 图本体：**唯一**一层滚动容器 —— 窄屏就横着滚，页面本身不许被它撑出横条 */}
        <div className={css.canvasWrap} data-map-canvas>
          <div
            className={css.canvas}
            style={{ width: (ZOOMS[zoom] ?? 1) * 100 + '%' }}
            role="group"
            aria-label={SCALE_LABEL[scale] + '地图，共 ' + visible.length + ' 个节点'}
          >
            <svg className={css.edges} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {edges.map(([a, b]) => (
                <line
                  key={a.id + '-' + b.id}
                  className={css.edge}
                  data-edge-layer={a.layer !== b.layer ? b.layer : a.layer}
                  x1={a.xy[0]} y1={a.xy[1]} x2={b.xy[0]} y2={b.xy[1]}
                />
              ))}
            </svg>

            {visible.map((n) => {
              const here = n.id === hereIdOnThisScale
              const on = n.id === selId
              const cur = n.id === cursor?.id
              return (
                <button
                  key={n.id}
                  type="button"
                  ref={(el) => { nodeRefs.current[n.id] = el }}
                  className={[css.node, css['k-' + n.kind], here ? css.isHere : '', on ? css.isOn : '', cur ? css.isCursor : '']
                    .filter(Boolean).join(' ')}
                  style={{ left: n.xy[0] + '%', top: n.xy[1] + '%', '--lc': 'var(--map-layer-' + n.layer + ')' } as CSSProperties}
                  data-map-node={n.id}
                  data-kind={n.kind}
                  data-layer={n.layer}
                  data-here={here ? '1' : undefined}
                  data-selected={on ? '1' : undefined}
                  aria-label={n.name + ' · ' + MAP_KIND_LABEL[n.kind] + ' · ' + MAP_LAYER_LABEL[n.layer] + (n.r ? ' · R ' + n.r.toFixed(3) : '')}
                  aria-pressed={on}
                  title={n.name}
                  onClick={() => { setCursorId(n.id); setSelId(n.id) }}
                >
                  <span className={css.dot} data-shape={n.layer}>
                    {LAYER_MARK[n.layer] ? <i className={css.mark}>{LAYER_MARK[n.layer]}</i> : null}
                  </span>
                  <span className={css.label + (scale === 'world' || n.kind === 'district' || here || on || cur ? ' ' + css.labelOn : '')}>
                    {n.name}
                  </span>
                  {here ? <span className={css.hereTag}>你在这里</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* 右侧详情：点一格出这一格 */}
        <aside className={css.side} aria-live="polite">
          {!sel ? (
            <div className={css.sideEmpty}>
              <MapTrifold size={22} weight="bold" />
              <p>点图上一个点，这里给出它的层级、读数与出处。</p>
              <p className={css.hint}>
                方向键在点之间挪，Z 打开这一格的详情，Esc 收起。
                {curNode ? <><br />此刻选着：<b>{curNode.name}</b></> : null}
              </p>
            </div>
          ) : (
            <div className={css.sideBody} data-map-detail={sel.id}>
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
                <span className={css.tag + ' ' + css.tagLayer} style={{ '--lc': 'var(--map-layer-' + sel.layer + ')' } as CSSProperties}>
                  {MAP_LAYER_LABEL[sel.layer]}
                </span>
                {sel.id === hereIdOnThisScale ? <span className={css.tag + ' ' + css.tagHere}>你在这里</span> : null}
                {sel.r !== undefined ? (
                  <span className={css.tag} style={{ '--lc': rSeverity(sel.r).tone } as CSSProperties}>
                    R {sel.r.toFixed(3)} · {rSeverity(sel.r).label}
                  </span>
                ) : (
                  <span className={css.tag + ' ' + css.tagFaint}>R 值未标定</span>
                )}
                {sel.threat !== undefined ? (
                  <span className={css.tag} style={{ '--lc': stageSeverity(sel.threat).tone } as CSSProperties}>
                    危险度 S{sel.threat} · {stageSeverity(sel.threat).label}
                  </span>
                ) : null}
              </div>
              <p className={css.sideNote}>{sel.note}</p>

              {selWorld && selWorld.id !== sel.id ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>所在</span>
                  <button type="button" className={css.jump} onClick={() => { setScale('world'); setSelId(selWorld.id); setCursorId(selWorld.id) }}>
                    {selWorld.name} <CaretRight size={11} weight="bold" />
                  </button>
                </div>
              ) : null}

              {selLinks.length || selKids.length ? (
                <div className={css.sideBlock}>
                  <div className={css.sideCap}>可达 / 下钻</div>
                  <div className={css.jumps}>
                    {selLinks.map((n) => (
                      <button key={n.id} type="button" className={css.jump} onClick={() => { setSelId(n.id); setCursorId(n.id) }}>
                        {n.name}
                      </button>
                    ))}
                    {selKids.map((n) => (
                      <button key={n.id} type="button" className={css.jump + ' ' + css.jumpKid} onClick={() => { setSelId(n.id); setCursorId(n.id) }}>
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
                <button type="button" className="btn btn--ghost" style={{ fontSize: 11.5 }} onClick={() => navigate('plot')}>
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
        <span className="tiny muted">相邻 = 故事里走得近，不是投影测绘</span>
        <span className="tiny muted">没有连线 = 图上不相邻（要坐飞机 / 从画里进）</span>
      </div>
    </div>
  )
}
