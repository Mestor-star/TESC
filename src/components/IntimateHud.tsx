/* ============================================================
   色情状态栏（components/IntimateHud.tsx）
   ------------------------------------------------------------
   用户口径：「在进行色情行为时增设色情状态栏，要有名字，情欲值，动作，
   贴身衣物状态，这样的话才实时，内裤湿不可能一直湿润」。
   所以这一栏量的是**此刻**：谁在场、她此刻情欲到什么读数、最近一回是
   怎么发生的、身上这两件此刻穿成什么样（内裤湿了几分）。

   与私密档案那一页的分工：
     · 档案页是**翻开看账**（开发度 / 次数账 / 破处 …，只增不减，看不看都一样）；
     · 这一栏是**摆在眼前的一行**：只在有人在场、且关系已经走到那一步时出现
       （`hasIntimate` + 羁绊过 `INTIMATE_BOND`），读数一动它当场就变 ——
       落地一次推进、或者那一回合什么都没动让湿润自己退一档，都在这里看得见。

   谁该出现在这一栏里由**调用方**给（主线看在场名册，见面看这一场带了谁）——
   本组件不自己判断在场，免得两处各算一套。
   ============================================================ */

import { useTerminal } from '../terminal/Terminal'
import { personOf } from '../data/castmeta'
import { LEWD_META, devStage } from '../data/intimate'
import { ATTIRE_META, ATTIRE_SLOTS } from '../data/attire'
import css from './IntimateHud.module.css'

export function IntimateHud({ ids, hint }: { ids: string[]; hint?: string }) {
  const { intimOf, attireOf } = useTerminal()
  if (!ids.length) return null
  return (
    <div className={css.hud} data-intim-hud="">
      <div className={css.hudHead}>
        <b>色情状态栏</b>
        <span className="tiny muted">{hint ?? '此刻 · 随推进实时变化'}</span>
      </div>
      <div className={css.hudRows}>
        {ids.map((id) => {
          const prof = intimOf(id)
          const attire = attireOf(id)
          if (!prof) return null
          return (
            <div className={css.row} key={id} data-intim-hud={id}>
              <div className={css.who}>
                <b>{personOf(id)?.name ?? id}</b>
                <span className={css.lewdNum} data-hud-lewd={prof.lewd}>{prof.lewd}</span>
                <i className={css.lewdWord}>{devStage(prof.lewd)}</i>
                <span className="tiny muted">{LEWD_META.label}</span>
              </div>
              <div className="meter">
                <div
                  className="meter__fill"
                  style={{ width: `${prof.lewd}%`, background: 'linear-gradient(90deg, color-mix(in srgb, var(--red) 35%, transparent), var(--red))' }}
                />
              </div>
              <div className={css.state}>
                <div className={css.act} data-hud-act>
                  <span className={css.k}>动作</span>
                  {prof.lastAct}
                </div>
                {attire ? (
                  <div className={css.wear} data-hud-wear={id}>
                    {ATTIRE_SLOTS.map((slot) => {
                      const p = attire.pieces.find((x) => x.slot === slot)
                      if (!p) return null
                      return (
                        <span className={css.piece} key={slot} data-hud-slot={slot} data-hud-slot-wear={p.wear}>
                          <span className={css.k}>{ATTIRE_META[slot].label}</span>
                          {p.wearWord}
                          {p.wet !== undefined ? (
                            <span className={css.wet} data-hud-wet={p.wet} data-hud-wet-word={p.wetWord}>
                              （{p.wetWord} {p.wet}）
                            </span>
                          ) : null}
                        </span>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
