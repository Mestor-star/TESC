import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  CaretLeft, CaretRight, Compass, Crosshair, GlobeHemisphereWest, MapTrifold, Minus, Plus, X,
} from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import { TIMELINE } from '../data/timeline'
import { EPISODES } from '../lib/freetime'
import { rSeverity, stageSeverity } from '../lib/format'
import {
  MAP_KIND_LABEL, MAP_LAYER_HINT, MAP_LAYER_LABEL, MAP_NODES,
  mapChildrenOf, mapEdgesOf, mapNodeById, mapNodeOfPlace, mapNodesOf, worldNodeOf,
} from '../data/map'
import type { MapNodeGeo } from '../data/map'
import type { MapLayer, MapScale } from '../data/types'

import css from './Map.module.css'

/* ============================================================
   地图 —— 一层一张图，点进去换成下一层的图
   ------------------------------------------------------------
   ① **第一层是真地图**：public/map 里那张公共领域的等距圆柱世界图。它整张都看得见
      （圆形球壳只是包装：球面高光 + 边缘暗角 + 经纬弧线，**不裁掉地图**），
      地表节点按经纬线性换算出落点，城市与海洋都读得出来。
      **天空带**横在球顶那一段空处，三大学院与天都市塞在里面，各自有一条竖虚线挂到
      它正下方的地表（天都市 / 拉普达 / 九灯底下没有地表物，就落到地图上缘）。
      两个插窗：左下「异次元」（只留真正的他界，各带一句「经何处前往」），
      右下「地表以下」（underground 那一档，浮空学园的地下另行注明）。
   ② **下钻 = 换一张图**：点有下层的点 → 镜头推进（260ms）→ 换成**那一处的平面示意图**
      （拿节点的 xy 排布 + links 画出谁挨着谁、哪一处要往下走），不是一堆浮点。
   ③ **区域图照旧**：它本来就没有地理意义，仍是那张抽象布局。

   口径（依主人 2026-10-23）：
   · 樱次元**就是我们所处的这一个世界**，不是与死灵次元并列的另一个次元 → 只当归属标注；
   · 三大学院都在天上（苍之学园 / 卡乌斯学院 / 九灯学院）；
   · 苍之学园地下 B-267 的研究所是**那座浮空学园自己的地下层**，挂在学园那一柱的正下方。
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

/** 球（画布百分比）。“球”= 圆框 + 高光 + 暗角；地图画在球心那一条 2:1 的带子里 */
const GLOBE_W = 98
const GLOBE_X = 1
const GLOBE_Y = 1
/** 世界底图那一条带子（球面坐标 0~100，占球高的 25%~75%，2:1 正好是等距圆柱那张图） */
const MAP_X = GLOBE_X
const MAP_W = GLOBE_W
const MAP_Y = GLOBE_Y + GLOBE_W * 0.25
const MAP_H = GLOBE_W * 0.5
/** 天空带：球顶那一段空处 */
const BAND_ROWS = [4.5, 9]
/** 平面示意图的画框（画布百分比） */
const PLAN = { x: 4, y: 10, w: 92, h: 68 }
/** 平面图的入口（走廊那一头）：子节点都从这儿通出去，细线连到它 */
const PLAN_HUB = { x: 50, y: 84 }

/** 天空带上那一条太窄，名字按「·」切成短名：短就整个留着，长就只留前半截 */
function shortName(name: string): string {
  const parts = name.split(/[·・]/).map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2) return name
  return parts[0].length + parts[1].length <= 9 ? parts[0] + '・' + parts[1] : parts[0]
}

const lonPct = (lon: number) => ((lon + 180) / 360) * 100
const latPct = (lat: number) => ((90 - lat) / 180) * 100

interface Placed { n: MapNodeGeo; x: number; y: number }

/** 经纬 → 画布落点（地图那一条带子里线性换算，和底图严丝合缝） */
const onMap = (lon: number, lat: number): { x: number; y: number } => ({
  x: MAP_X + (lonPct(lon) * MAP_W) / 100,
  y: MAP_Y + (latPct(lat) * MAP_H) / 100,
})

/** 平面示意图：把这一层的子节点按各自 xy 铺进画框（太挤就按最小跨度撑开） */
function planFit(kids: MapNodeGeo[]): Placed[] {
  if (!kids.length) return []
  const xs = kids.map((k) => k.xy[0])
  const ys = kids.map((k) => k.xy[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 46)
  const spanY = Math.max(maxY - minY, 46)
  const x0 = (minX + maxX) / 2 - spanX / 2
  const y0 = (minY + maxY) / 2 - spanY / 2
  return kids.map((n) => ({
    n,
    x: PLAN.x + ((n.xy[0] - x0) / spanX) * PLAN.w,
    y: PLAN.y + ((n.xy[1] - y0) / spanY) * PLAN.h,
  }))
}

/** 父链里有没有踩到这一位（浮空学园地下的那两处靠它认） */
function underOf(id: string, ancestor: string): boolean {
  let cur: MapNodeGeo | null = mapNodeById(id)
  for (let i = 0; i < 8 && cur; i++) {
    if (cur.id === ancestor) return true
    cur = cur.parent ? mapNodeById(cur.parent) : null
  }
  return false
}

type Dir = 'left' | 'right' | 'up' | 'down'

/** 方向键挪一格：同向取最近，斜着偏太多的算更远（不是拿直线距离糊过去） */
function nextInDir(from: Placed, dir: Dir, pool: Placed[]): Placed | null {
  const fx = from.x
  const fy = from.y
  let best: Placed | null = null
  let bestScore = Infinity
  /* 先认「大致在那个方向上」：偏出去超过 1.6 倍就当作不在这个方向
     （不加这道，按最近的挑会在两个点之间来回弹）。锥里没有才退回宽判。 */
  let fallback: Placed | null = null
  let fallbackScore = Infinity
  for (const p of pool) {
    if (p.n.id === from.n.id) continue
    const dx = p.x - fx
    const dy = p.y - fy
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    if (along <= 0.5) continue
    const perp = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const wide = along + perp * 2.2
    if (wide < fallbackScore) {
      fallbackScore = wide
      fallback = p
    }
    if (perp > along * 1.6) continue
    const score = along + perp * 0.6
    if (score < bestScore) {
      bestScore = score
      best = p
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
  /* 世界图下钻的那一条链（同一时刻只走一条，换了就是换一张图） */
  const [path, setPath] = useState<string[]>([])
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const canvasRef = useRef<HTMLDivElement | null>(null)

  /* 此刻这一段：与剧情推进同一个指针（EPISODES 里第一段没收束的） */
  const curEv = useMemo(() => EPISODES.find((e) => !epDone[e.id]) ?? null, [epDone])
  const placeNow = curEv ? placeOfEvent(curEv) : ''
  const hereNode = useMemo(() => mapNodeOfPlace(placeNow, curEv?.id), [placeNow, curEv])

  const level = path.length + 1
  const ownerId = path.length ? path[path.length - 1] : 'world'
  const levelOwner = useMemo(() => (path.length ? mapNodeById(ownerId) : null), [path.length, ownerId])

  const nodes = useMemo(() => mapNodesOf(scale), [scale])

  /* ---------- 第一层：世界那张真地图 ---------- */
  const worldPlaced = useMemo<Placed[]>(() => {
    const out: Placed[] = []
    for (const n of nodes) {
      if (n.frame) continue
      if (n.layer === 'surface' && n.geo) out.push({ n, ...onMap(n.geo[0], n.geo[1]) })
    }
    /* 天空带里放的是**整张表**上浮空的那几处 —— 三大学园是区域层的节点，
       可它们本来就悬在世界图的天上，所以这一条带子不分 scale。 */
    /* 只挂「悬在世界图上空的那几处」：天都市、要塞、三大学院 —— 校舍内部的房间
       （异端审问室那几间）也算浮空层，但它们不该在世界图上各占一格。 */
    const band = MAP_NODES
      .filter((n) => n.layer === 'sky' && !n.frame && n.kind !== 'room')
      .sort((a, b) => (a.anchor ?? 50) - (b.anchor ?? 50))
    band.forEach((n, i) => out.push({ n, x: lonPct(n.anchor ?? 50), y: BAND_ROWS[i % 2] }))
    return out
  }, [nodes])

  /* ---------- 下钻之后：这一处的平面示意图 ---------- */
  const levelPlaced = useMemo<Placed[]>(() => {
    if (!path.length) return []
    return planFit(mapChildrenOf(ownerId))
  }, [path.length, ownerId])

  const placed = useMemo<Placed[]>(() => {
    if (scale === 'region') return nodes.map((n) => ({ n, x: n.xy[0], y: n.xy[1] }))
    return path.length ? levelPlaced : worldPlaced
  }, [scale, nodes, path.length, levelPlaced, worldPlaced])

  const visible = useMemo(() => placed.filter((p) => !offLayers.includes(p.n.layer)), [placed, offLayers])

  /* 两个插窗只在第一层出现：手里拿着的是**整张表**（不止世界层那一档） */
  const underAll = useMemo(
    () => MAP_NODES.filter((n) => n.layer === 'underground' && !offLayers.includes(n.layer)),
    [offLayers],
  )
  const otherAll = useMemo(
    () => MAP_NODES.filter((n) => n.layer === 'otherworld' && n.scale === 'world' && !offLayers.includes(n.layer)),
    [offLayers],
  )
  const showInsets = scale === 'world' && !path.length

  /* 键盘：插窗里那几行也要进方向键的池子（它们不在图上，位置按行估读） */
  const navPool = useMemo<Placed[]>(() => {
    if (!showInsets) return visible
    const rows = (list: MapNodeGeo[], side: 'l' | 'r'): Placed[] =>
      list.map((n, i) => ({ n, x: side === 'l' ? 16 : 84, y: 76 + i * 3.1 }))
    return [...visible, ...rows(otherAll, 'l'), ...rows(underAll, 'r')]
  }, [visible, showInsets, otherAll, underAll])

  const cursored = navPool.find((p) => p.n.id === cursorId) ?? null

  /* 游标**在渲染里算**，不靠 effect 回写：换图 / 筛掉一层 / 进一层之后，原来那一格若看不见了，
     就落到「此刻所在」那一格，再不行落到第一格。 */
  const cursor: Placed | null = useMemo(() => {
    if (cursored) return cursored
    const here = hereNode ? navPool.find((p) => p.n.id === hereNode.id) : undefined
    return here ?? navPool[0] ?? null
  }, [cursored, navPool, hereNode])

  const sel = selId ? mapNodeById(selId) : null
  const selWorld = sel ? worldNodeOf(sel) : null
  const selLinks = sel ? sel.links.map((id) => mapNodeById(id)).filter((n): n is MapNodeGeo => !!n) : []
  const selKids = sel ? mapChildrenOf(sel.id) : []

  /* 到了世界图，就把「此刻在哪」提到它所在的那个大单元上 */
  const hereWorld = hereNode ? worldNodeOf(hereNode) : null
  const hereOnThisScale = scale === 'world' ? hereWorld : hereNode
  const hereIdOnThisScale = hereOnThisScale && navPool.some((p) => p.n.id === hereOnThisScale.id)
    ? hereOnThisScale.id
    : null

  const focusNode = useCallback((id: string) => {
    setCursorId(id)
    requestAnimationFrame(() => nodeRefs.current[id]?.focus())
  }, [])

  /* 换层之后原来那颗按钮就没了，焦点会掉回 body —— 而 keydown 挂在 .vpage 上，
     掉出去的焦点等于把键盘锁死。所以每次换层都把焦点收回到画布这枚容器上。 */
  const holdFocus = useCallback(() => {
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }))
  }, [])

  const enter = useCallback((id: string) => {
    if (!mapChildrenOf(id).length) return
    setDir('in')
    setPath((prev) => [...prev, id])
    setSelId(id)
    setCursorId(null)
    holdFocus()
  }, [holdFocus])

  const backTo = useCallback((depth: number) => {
    setDir('out')
    setPath((prev) => prev.slice(0, depth))
    setSelId(null)
    setCursorId(null)
    holdFocus()
  }, [holdFocus])

  const onNodeClick = (n: MapNodeGeo) => {
    setCursorId(n.id)
    if (scale === 'world' && mapChildrenOf(n.id).length) { enter(n.id); return }
    setSelId(n.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = cursor
    if (e.key === 'Escape') {
      e.preventDefault()
      if (scale === 'world' && path.length) { backTo(path.length - 1); return }
      if (selId) { setSelId(null); if (cur) focusNode(cur.n.id) }
      return
    }
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault()
      if (!cur) return
      if (scale === 'world' && mapChildrenOf(cur.n.id).length) { enter(cur.n.id); return }
      setSelId(cur.n.id)
      return
    }
    if (!cur) return
    const d: Dir | null =
      e.key === 'ArrowLeft' ? 'left'
      : e.key === 'ArrowRight' ? 'right'
      : e.key === 'ArrowUp' ? 'up'
      : e.key === 'ArrowDown' ? 'down'
      : null
    if (!d) return
    const to = nextInDir(cur, d, navPool)
    if (!to) return
    e.preventDefault()
    focusNode(to.n.id)
  }

  const toggleLayer = (l: MapLayer) => {
    setOffLayers((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }

  /* 图上的细线：两头都在场上的才画（跨层的那些留给右栏的「可达」） */
  const edges = useMemo<Array<[Placed, Placed]>>(() => {
    /* 注意：本组件自己就叫 Map，new Map(...) 会被它遮住 —— 这里一律走普通对象 */
    const byId: Record<string, Placed> = {}
    for (const p of visible) byId[p.n.id] = p
    const seen = new Set<string>()
    const out: Array<[Placed, Placed]> = []
    for (const p of visible) {
      for (const to of p.n.links) {
        const q = byId[to]
        if (!q) continue
        const key = p.n.id < to ? p.n.id + '|' + to : to + '|' + p.n.id
        if (seen.has(key)) continue
        seen.add(key)
        out.push([p, q])
      }
    }
    return out
  }, [visible])

  /* 天空带：每一条都挂一根竖线到它正下方的地表（底下没有东西的就落到地图上缘） */
  const beams = useMemo(() => {
    if (scale !== 'world' || path.length) return []
    const surf = visible.filter((p) => p.n.layer === 'surface' && p.n.geo)
    return visible.filter((p) => p.n.layer === 'sky').map((p) => {
      const below = surf.find((s) => Math.abs((s.n.geo as [number, number])[0] - (p.n.anchor ?? 0)) <= 6)
      const stub = p.n.id === 's-school' ? 4.6 : 0
      return { id: p.n.id, x: p.x, y1: p.y + 1.6 + stub, y2: below ? below.y - 1.4 : MAP_Y }
    })
  }, [scale, path.length, visible])

  /* 浮空学园地下那一段：学园正下方那枚「▼ 地下 267 层」小标记 */
  const schoolStub = useMemo(() => {
    if (scale !== 'world' || path.length || offLayers.includes('sky')) return null
    const school = visible.find((p) => p.n.id === 's-school')
    const lab = mapNodeById('s-lab')
    if (!school || !lab) return null
    return { x: school.x, y: school.y + 4.3, n: lab }
  }, [scale, path.length, offLayers, visible])

  const crumbs = useMemo(() => {
    if (scale !== 'world') return []
    return path.map((id, i) => ({ id, i, name: mapNodeById(id)?.name ?? id }))
  }, [scale, path])

  const curNode = cursor ? cursor.n : null
  const levelKey = scale + ':' + path.join('/')
  const regionMode = scale === 'region'
  const planMode = !regionMode && path.length > 0

  /* 地图上的圆点（地表 / 天空带） */
  const nodeBtn = (p: Placed, opt?: { band?: boolean }) => {
    const n = p.n
    const here = n.id === hereIdOnThisScale
    const on = n.id === selId
    const cur = cursor?.n.id === n.id
    const kids = mapChildrenOf(n.id)
    const rightLabel = p.x > 68
    return (
      <button
        key={n.id}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={[css.node, css['k-' + n.kind], here ? css.isHere : '', on ? css.isOn : '',
          cur ? css.isCursor : '', opt?.band ? css.bandNode : '', rightLabel ? css.labelLeft : '']
          .filter(Boolean).join(' ')}
        style={{ left: p.x + '%', top: p.y + '%', '--lc': 'var(--map-layer-' + n.layer + ')' } as CSSProperties}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-here={here ? '1' : undefined}
        data-selected={on ? '1' : undefined}
        data-map-geo={n.geo ? n.geo[0] + ',' + n.geo[1] : undefined}
        data-map-expand={kids.length ? n.id : undefined}
        aria-label={n.name + ' · ' + MAP_KIND_LABEL[n.kind] + ' · ' + MAP_LAYER_LABEL[n.layer]
          + (n.r ? ' · R ' + n.r.toFixed(3) : '') + (kids.length ? ' · 有下一层' : '')}
        aria-pressed={on}
        title={n.name + (kids.length ? '（点一下进下一层）' : '')}
        onClick={() => onNodeClick(n)}
      >
        <span className={css.dot} data-shape={n.layer}>
          {LAYER_MARK[n.layer] ? <i className={css.mark}>{LAYER_MARK[n.layer]}</i> : null}
        </span>
        <span className={css.label + (opt?.band || n.kind === 'district' || here || on || cur ? ' ' + css.labelOn : '')}>
          {opt?.band ? shortName(n.name) : n.name}
        </span>
        {here ? <span className={css.hereTag}>你在这里</span> : null}
      </button>
    )
  }

  /* 平面示意图上的方块：看得出这是一处地方，不只是个点 */
  const planBtn = (p: Placed) => {
    const n = p.n
    const here = n.id === hereIdOnThisScale
    const on = n.id === selId
    const cur = cursor?.n.id === n.id
    const kids = mapChildrenOf(n.id)
    const down = levelOwner && n.layer !== levelOwner.layer
    return (
      <button
        key={n.id}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={[css.planNode, css['k-' + n.kind], here ? css.isHere : '', on ? css.isOn : '',
          cur ? css.isCursor : '', down ? css.planDown : ''].filter(Boolean).join(' ')}
        style={{ left: p.x + '%', top: p.y + '%', '--lc': 'var(--map-layer-' + n.layer + ')' } as CSSProperties}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-here={here ? '1' : undefined}
        data-selected={on ? '1' : undefined}
        data-map-expand={kids.length ? n.id : undefined}
        aria-label={n.name + ' · ' + MAP_KIND_LABEL[n.kind] + ' · ' + MAP_LAYER_LABEL[n.layer]
          + (kids.length ? ' · 有下一层' : '')}
        aria-pressed={on}
        title={n.name + (kids.length ? '（点一下进下一层）' : '')}
        onClick={() => onNodeClick(n)}
      >
        <span className={css.planHead}>
          <span className={css.dot} data-shape={n.layer} />
          <span className={css.planName}>{n.name}</span>
          {here ? <span className={css.hereTag}>你在这里</span> : null}
        </span>
        <span className={css.planMeta}>
          {MAP_KIND_LABEL[n.kind]} · {MAP_LAYER_LABEL[n.layer]}
          {down ? ' · 与这一层不同高' : ''}
          {kids.length ? ' · 有下一层' : ''}
        </span>
      </button>
    )
  }

  const insetRow = (n: MapNodeGeo, i: number, side: 'l' | 'r') => {
    const on = n.id === selId
    const inSchool = underOf(n.id, 's-school')
    return (
      <button
        key={n.id + '#' + i}
        type="button"
        ref={(el) => { nodeRefs.current[n.id] = el }}
        className={css.insetRow + ' ' + css['k-' + n.kind] + (on ? ' ' + css.insetRowOn : '')}
        style={{ '--lc': 'var(--map-layer-' + n.layer + ')' } as CSSProperties}
        data-map-node={n.id}
        data-kind={n.kind}
        data-layer={n.layer}
        data-map-inset={side}
        data-selected={on ? '1' : undefined}
        onClick={() => { setCursorId(n.id); setSelId(n.id) }}
      >
        <span className={css.dot} data-shape={n.layer} />
        <span className={css.insetName}>{n.name}</span>
        {inSchool ? <span className={css.insetNote}>浮空学园地下</span> : null}
        {n.via ? <span className={css.insetVia}>经 {n.via}</span> : null}
      </button>
    )
  }

  return (
    <div
      className={'vpage ' + css.page}
      onKeyDown={onKeyDown}
      data-map-scale={scale}
      data-map-level={level}
      data-map-here={hereIdOnThisScale ?? ''}
    >
      <div className="vhead">
        <div>
          <div className="vhead__kicker">FIELD / SURVEY MAP</div>
          <h1>地图</h1>
          <div className="vhead__sub">
            世界图底下那张是公共领域的等距圆柱世界图，地表节点按经纬落点，浮空那一层横在球顶。
            点有下层的点就推进到那一处的平面示意图 —— 面包屑能逐级退回。区域图仍是那张抽象布局。
          </div>
        </div>
        <div className="vhead__right">
          <span className="chip" data-map-count>{nodes.length} 个节点</span>
          {scale === 'world' ? (
            <button type="button" className="chip" data-map-worldmark="w-sakura" onClick={() => setSelId('w-sakura')}>
              樱次元 · 此刻所在的这一个世界
            </button>
          ) : null}
          <span className={hereNode ? 'chip chip--on' : 'chip chip--off'}>
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
              onClick={() => { setScale(s); setSelId(null); setPath([]); setCursorId(null) }}
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

      {/* 面包屑：樱次元 › 天空都市 · 弗尔克图斯 › 苍之学园 —— 每一级都点得回去 */}
      {scale === 'world' ? (
        <div className={css.crumbs} data-map-crumbs>
          <button
            type="button"
            className={css.crumb + (path.length ? '' : ' ' + css.crumbOn)}
            data-map-crumb="0"
            onClick={() => backTo(0)}
          >
            <GlobeHemisphereWest size={12} weight="bold" /> 樱次元
          </button>
          {crumbs.map((c) => (
            <Fragment key={c.id}>
              <CaretRight size={10} weight="bold" className={css.crumbSep} />
              <button
                type="button"
                className={css.crumb + (c.i === path.length - 1 ? ' ' + css.crumbOn : '')}
                data-map-crumb={String(c.i + 1)}
                onClick={() => backTo(c.i + 1)}
              >
                {c.name}
              </button>
            </Fragment>
          ))}
          {path.length ? (
            <button type="button" className={css.crumbBack} data-map-back onClick={() => backTo(path.length - 1)}>
              <CaretLeft size={11} weight="bold" /> 退一层
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={css.layout}>
        {/* 图本体：**唯一**一层滚动容器 —— 窄屏就横着滚，页面本身不许被它撑出横条 */}
        <div className={css.canvasWrap} data-map-canvas>
          <div
            className={css.canvas + (planMode ? ' ' + css.canvasPlan : '')}
            ref={canvasRef}
            tabIndex={-1}
            style={{ width: (ZOOMS[zoom] ?? 1) * 100 + '%' }}
          >
            <div
              className={css.level + ' ' + (dir === 'in' ? css.slideIn : css.slideOut)
                + (regionMode ? '' : ' ' + css.levelWorld)}
              key={levelKey}
              role="group"
              aria-label={
                (scale === 'world'
                  ? (levelOwner ? levelOwner.name + ' 内部示意' : '世界')
                  : '区域') + '地图，共 ' + visible.length + ' 个节点'
              }
            >
              {/* 球壳 = 包装：圆框 / 高光 / 暗角 / 经纬弧线。里面装的是一张真地图 */}
              <div
                className={css.globe + ' ' + (planMode ? css.globePlan : '')}
                data-map-globe={ownerId}
                data-map-globe-level={level}
                data-map-globe-kind={regionMode ? 'flat' : planMode ? 'plan' : 'world'}
              >
                {!regionMode && !planMode ? (
                  <img
                    className={css.base}
                    src={import.meta.env.BASE_URL + 'map/world-location-map.svg'}
                    alt="世界底图 · 等距圆柱投影（公共领域）"
                    data-map-base
                    draggable={false}
                  />
                ) : null}
                {planMode ? <div className={css.planGrid} aria-hidden="true" /> : null}
                {!regionMode && !planMode ? (
                  <svg className={css.grid} viewBox="0 0 100 100" aria-hidden="true">
                    <circle cx="50" cy="50" r="49.2" className={css.gridRim} />
                    <ellipse cx="50" cy="50" rx="49.2" ry="18" className={css.gridLine} />
                    <ellipse cx="50" cy="50" rx="49.2" ry="34" className={css.gridLine} />
                    <ellipse cx="50" cy="50" rx="18" ry="49.2" className={css.gridLine} />
                    <ellipse cx="50" cy="50" rx="34" ry="49.2" className={css.gridLine} />
                  </svg>
                ) : null}
                <div className={css.shade} aria-hidden="true" />
              </div>

              {/* 天空带：只挂第一层 */}
              {!regionMode && !planMode ? (
                <div className={css.band} data-map-band aria-hidden="true">
                  <span className={css.bandCap}>浮空 · 天空都市</span>
                </div>
              ) : null}

              {/* 线：天空带的竖虚线 + 节点之间的连线 */}
              <svg className={css.edges} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {beams.map((b) => (
                  <line key={'beam-' + b.id} className={css.beam} x1={b.x} y1={b.y1} x2={b.x} y2={b.y2} />
                ))}
                {schoolStub ? (
                  <line className={css.beam} x1={schoolStub.x} y1={schoolStub.y - 2.9} x2={schoolStub.x} y2={schoolStub.y - 0.8} />
                ) : null}
                {regionMode
                  ? mapEdgesOf('region').map(([a, b]) => (
                    <line
                      key={a.id + '-' + b.id}
                      className={css.edge}
                      data-edge-layer={a.layer !== b.layer ? b.layer : a.layer}
                      x1={a.xy[0]} y1={a.xy[1]} x2={b.xy[0]} y2={b.xy[1]}
                    />
                  ))
                  : planMode
                  ? visible.map((p) => (
                    <line
                      key={'hub-' + p.n.id}
                      className={css.edgePlanHit}
                      x1={p.x} y1={p.y} x2={PLAN_HUB.x} y2={PLAN_HUB.y}
                    />
                  ))
                  : edges.map(([a, b]) => (
                    <line
                      key={a.n.id + '-' + b.n.id}
                      className={[css.edge, css.edgePlan].join(' ')}
                      data-edge-layer={a.n.layer !== b.n.layer ? b.n.layer : a.n.layer}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    />
                  ))}
              </svg>

              {planMode
                ? <div className={css.planLayer} data-map-plan-layer={ownerId}>{visible.map((p) => planBtn(p))}</div>
                : visible.map((p) => nodeBtn(p, { band: !regionMode && p.n.layer === 'sky' }))}

              {/* 平面示意图的角标与图例 */}
              {planMode ? (
                <>
                  <div className={css.planCap} data-map-plan={ownerId}>
                    {levelOwner?.name} · 内部示意
                  </div>
                  <div className={css.planSub}>
                    {levelOwner?.parent ? '由「' + (mapNodeById(levelOwner.parent)?.name ?? '') + '」进来 · ' : ''}
                    这一层 {visible.length} 处 · 在{MAP_LAYER_LABEL[levelOwner?.layer ?? 'surface']}那一档
                  </div>
                  <div className={css.planHub} style={{ left: PLAN_HUB.x + '%', top: PLAN_HUB.y + '%' } as CSSProperties}>
                    ⌐ 走廊口 · {levelOwner ? shortName(levelOwner.name) : ''}
                  </div>
                  <div className={css.planLegend}>
                    实线 = 走廊通着 · 虚线框 = 与这一层不同高（↓ 地下 / ↑ 浮空）· 点方块进下一层
                  </div>
                </>
              ) : null}

              {/* 浮空学园正下方那枚「▼ 地下 267 层」—— 点了开研究所的详情 */}
              {schoolStub ? (
                <button
                  type="button"
                  className={css.stubTag}
                  style={{ left: schoolStub.x + '%', top: schoolStub.y + '%' } as CSSProperties}
                  data-map-stub="s-lab"
                  data-map-node="s-lab-stub"
                  onClick={() => { setCursorId('s-lab'); enter('s-lab') }}
                  title={schoolStub.n.name}
                >
                  ▼ 地下 267 层
                </button>
              ) : null}

              {/* 两个插窗：只在第一层 */}
              {showInsets && otherAll.length ? (
                <div className={css.inset + ' ' + css.insetLeft} data-map-inset-box="otherworld">
                  <div className={css.insetCap}>
                    <i className={css.layerDot} data-shape="otherworld" /> 异次元
                  </div>
                  {otherAll.map((n, i) => insetRow(n, i, 'l'))}
                </div>
              ) : null}

              {showInsets && underAll.length ? (
                <div className={css.inset + ' ' + css.insetRight} data-map-inset-box="underground">
                  <div className={css.insetCap}>
                    <i className={css.layerDot} data-shape="underground" /> ▼ 地表以下
                  </div>
                  {underAll.map((n, i) => insetRow(n, i, 'r'))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 右侧详情：点一格出这一格 */}
        <aside className={css.side} aria-live="polite">
          {!sel ? (
            <div className={css.sideEmpty}>
              <MapTrifold size={22} weight="bold" />
              <p>点图上一个点，这里给出它的层级、读数与出处。</p>
              <p className={css.hint}>
                方向键在点之间挪，Z 打开这一格的详情（有下层的就直接进那一层），Esc 收起 / 退一层。
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
                {sel.geo ? <span className={css.tag + ' ' + css.tagFaint}>{sel.geo[0]}° · {sel.geo[1]}°</span> : null}
                {sel.frame ? <span className={css.tag + ' ' + css.tagHere}>本世界的归属</span> : null}
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

              {sel.via ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>怎么去</span>
                  <span className={css.hint}>{sel.via}</span>
                </div>
              ) : null}

              {selWorld && selWorld.id !== sel.id ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>所在</span>
                  <button type="button" className={css.jump} onClick={() => { setScale('world'); setSelId(selWorld.id); setCursorId(selWorld.id) }}>
                    {selWorld.name} <CaretRight size={11} weight="bold" />
                  </button>
                </div>
              ) : null}

              {selKids.length && scale === 'world' && path[path.length - 1] !== sel.id ? (
                <div className={css.sideRow}>
                  <span className={css.sideCap}>下一层</span>
                  <button type="button" className={css.jump} data-map-expand={sel.id} onClick={() => enter(sel.id)}>
                    <GlobeHemisphereWest size={12} weight="bold" /> 进入 {sel.name} 的平面图
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
        <span className="tiny muted">世界图底图：public/map/world-location-map.svg（公共领域 · 等距圆柱投影）</span>
        <span className="tiny muted">区域图：相邻 = 故事里走得近，不是投影测绘</span>
      </div>
    </div>
  )
}
