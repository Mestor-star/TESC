/* ============================================================
   见面右栏（components/DateSide.tsx）
   ------------------------------------------------------------
   主人两句话点出来的这一栏：「约会的是特殊的 —— 短信触发约会指令之后，
   在特殊的在线推演生成框的右边写出约会对象的信息，再加一张特大的定妆图
   作为约会穿的常服」。

   所以只有**见面那一档**（线程 id `d:uuid`）会长出它，单聊与群聊没有。
   内容照主人定下的「**人 + 这一场**」：

     · 顶上钉住的那一节是**这一场** —— 名目 / 地点 / 时间 / 同场还有谁；
     · 底下一人一张卡（`rvAllIds` 的顺序，主位在前），**每人一张同等大**：
       特大常服立绘 + 名字 + 身份 + 羁绊读数 + 关系档位。

   为什么底下要自己滚：一场带三位时卡片要占两屏多 —— 那是「每人一张同等大」
   的价钱。真正不能让步的是**正文不能被顶**：这一栏自己滚，消息流与输入框
   的高度一点不受人头数影响（版式见 views/Tavern.module.css 的 .chatBody）。

   **立绘 ≠ CG**（主人立的规矩）：这一栏摆的是**立绘** —— 一人一张、文件名写死
   （`dateWearId`）、跟着人走，**不进导演候选**，也不落 `world.cg`。约会上屏的
   那张情境图是另一回事，由导演点名，走的是会话流顶部那个 3:2 的 CgSlot。

   **图位不再写「待补」（主人 2026-10-21）**：这一栏走 lib/cg.ts 的**兜底链** ——
   常服立绘（`cg-datewear-<角色id>`）→ 她的 SFW 图（表里登记过的那几位）→
   她的立绘（`public/charimg/<id>.jpg`）。三档全空才写一行小字。
   链子与剧演舞台共用 `probeSceneCg` 一个函数，两处各写一套必然对不上。
   ============================================================ */

import { useEffect, useMemo, useState } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { charOf } from '../data/personas'
import { genderOf } from '../data/castmeta'
import { hasIntimate } from '../data/intimate'
import { relTier } from '../data/rel'
import { bondName } from '../lib/format'
import { dateWearId, rvAllIds } from '../lib/rendezvous'
import { probeSceneCg } from '../lib/cg'
import type { SceneCg } from '../lib/cg'
import { inkOf } from '../lib/hue'
import type { Rendezvous } from '../lib/rendezvous'

import css from './DateSide.module.css'

/** 关系还没走到需要定名的那一步 —— 由剧情给，不由羁绊读数换算（与档案页同一句） */
const REL_UNSET = '关系还没走到需要定名的那一步 —— 由剧情给，不由羁绊读数换算'


/**
 * 一人一张图位：走 lib/cg.ts 的**兜底链**。
 *
 * 第一档是这一格的常服立绘（`cg-datewear-<角色id>`）；探不到就往她的 SFW 图、
 * 再往她的立绘退。**私密图不会漏进来**：这里不传 `intimate`，
 * 兜底链那道闸对 `lunaNSFW/**` 一律不放行（见 `probeSceneCg`）。
 *
 * 版式照旧：2 : 3 竖构图、`contain` 摆、最宽 320 —— 整身要看得见。
 * `data-cg-slot` 留着（说的是「这一格认的是哪个素材」，与有没有图无关）。
 */
function PersonArt({ id, wear, name }: { id: string; wear: string; name: string }) {
  const [scene, setScene] = useState<SceneCg | null>(null)
  useEffect(() => {
    let alive = true
    setScene(null)
    void probeSceneCg(wear ? [{ id: wear }] : [], [id]).then((s2) => { if (alive) setScene(s2) })
    return () => { alive = false }
  }, [id, wear])

  return (
    <figure
      data-cg-slot={wear || id}
      style={{ margin: 0, width: '100%', maxWidth: 320, aspectRatio: '2 / 3', overflow: 'hidden' }}
    >
      {scene ? (
        <img
          src={scene.url}
          alt={name}
          loading="lazy"
          decoding="async"
          data-cg-fallback={scene.isFallback ? scene.kind : undefined}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <span className={css.noArt}>这一位此刻没有图</span>
      )}
    </figure>
  )
}

export function DateSide({ rv }: { rv: Rendezvous }) {
  const { bondNow, relOf } = useTerminal()

  /** 这一场在场的人：主位在前，同场的跟上（`rvAllIds` 已去重） */
  const people = useMemo(
    () => rvAllIds(rv).map((id) => {
      const c = charOf(id)
      const bond = bondNow(id)
      return {
        id,
        name: c?.name ?? id,
        role: c?.role ?? '',
        hue: c?.hue ?? '#8ad',
        bond,
        bondWord: bondName(bond, { gender: genderOf(id) }),
        tier: relTier(relOf(id)),
        /* 常服立绘只对「有私密档案的女角色」有 —— 与左栏那一批同一把尺。
           名单理论上只会收够格的那几位，可档是手改得动的（脚本 / 旧档），
           真混进一位没有底档的，这里就**不摆图位**，免得写出一个永远补不上的文件名。 */
        wear: hasIntimate(id) ? dateWearId(id) : '',
        main: id === rv.charId,
      }
    }),
    [rv, bondNow, relOf],
  )

  const partyNames = (rv.party ?? []).map((id) => charOf(id)?.name ?? id)

  return (
    <aside className={css.dateSide} data-date-side={rv.id}>
      <div className={css.scene} data-date-scene>
        <span className={css.kicker}>
          <b>见面 · 这一场</b>
        </span>
        <dl className={css.sceneRows}>
          <dt>名目</dt>
          <dd data-date-scene-title>{rv.title}</dd>
          <dt>地点</dt>
          <dd data-date-scene-place>{rv.place}</dd>
          {/* 时间照实读（没给就写「没说定」）—— 这一栏是这一场的底账，
              不是聊天行，缺一栏就少一栏会让底下那几栏对不上位。 */}
          <dt>时间</dt>
          <dd className={rv.time ? undefined : css.none} data-date-scene-time={rv.time ?? ''}>
            {rv.time ?? '—— 没说定'}
          </dd>
          <dt>同场</dt>
          <dd data-date-scene-party={(rv.party ?? []).join(',')}>
            {partyNames.length ? partyNames.join('、') : '只有你们两个'}
          </dd>
        </dl>
      </div>

      <div className={css.body} data-date-side-body>
        {people.map((p) => (
          <article className={css.person} key={p.id} data-date-person={p.id}>
            {/* 特大常服立绘：栏宽减去内边距，2 : 3 竖构图、`contain` 摆 ——
                整身要看得见，画得方一点也不会被裁，只是两侧留空。 */}
            <div className={css.art} data-date-wear={p.wear || undefined}>
              <PersonArt id={p.id} wear={p.wear} name={p.name} />
            </div>

            <div className={css.meta}>
              <b className={css.name} style={{ color: inkOf(p.hue) }}>
                {p.name}
                {p.main ? <i className={css.mainTag}>主位</i> : null}
              </b>
              {p.role ? <span className={css.role}>{p.role}</span> : null}

              <div className="meter">
                <div
                  className="meter__fill"
                  style={{ width: `${p.bond}%`, background: `linear-gradient(90deg, ${p.hue}66, ${p.hue})` }}
                />
              </div>

              <div className={css.tags}>
                <span
                  className={css.bond}
                  style={{ color: inkOf(p.hue), borderColor: `${p.hue}88`, background: `${p.hue}1e` }}
                >
                  {p.bond} · {p.bondWord}
                </span>
                {/* 关系档位与上面那条读数是两回事：一条是攒出来的，这一枚由剧情定。
                    摆在一处正是为了让两者的差别看得见（与档案页同一口径）。 */}
                <span
                  className={css.rel}
                  data-date-person-rel={p.tier?.id ?? ''}
                  title={REL_UNSET}
                  style={p.tier ? { color: inkOf(p.hue), borderColor: `${p.hue}88`, background: `${p.hue}1e` } : undefined}
                >
                  关系 · {p.tier?.name ?? '尚未定下'}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}
