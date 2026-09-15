/* ============================================================
   约会记录（components/DateArchive.tsx）
   ------------------------------------------------------------
   散场之后那一场去哪儿了 —— 这是本文件存在的唯一理由。

   账一直在：`d:<uuid>` 那条线程躺在同一本会话账里（`lib/sms.ts` 的
   `zts-tavern:v1`），`endScene` 只把名册上的 `done` 立起来，**不删账**
   （DateLane 里那句注释说的「线程留着当记录」）。可界面上一处都进不去：
   「约会专线」那一枚按「有没有**未散场**的一场」长（`views/Plot.tsx` 的
   `liveRvs`），散场那一下名册清空、按钮收走、人也被送回主线 ——
   于是**写下的那场对话只有导演还记得**（`lib/crosslink.ts` 往正文注背景时
   是读它的），主人自己翻不到上一次见面说了什么。

   这一块就是那扇门：**只读的旧账本**。
     · 上面一列：已散场的每一场（谁 · 标题 · 哪儿 · 什么时候）；
     · 下面：挑中的那一场按原来的样子铺开 —— 与 DateLane **同一套壳**
       （`components/PlotFlow.tsx` 的旁白块 / 台词框，`.onBody` / `.thread`
       就用 `views/Plot.module.css` 本身），不另造一种读法。
   **只读是真的只读**：没有输入框、没有生成、不碰名册、不推进任何东西。
   已经散场的一场再往里写字，等于把一段结束的场面续上 —— 那不是记录该做的事。
   ============================================================ */

import { useMemo, useState, useSyncExternalStore } from 'react'

import { useTerminal } from '../terminal/Terminal'
import { charOf } from '../data/personas'
import { fmtSlotTime } from '../lib/slots'
import { loadSmsLogs, smsLogVersion, subscribeSmsLog } from '../lib/sms'
import type { Rendezvous } from '../lib/rendezvous'
import { EmptyHint, NarrBlock, ThinkFold, YouFrame, opNameOf } from './PlotFlow'

import plot from '../views/Plot.module.css'
import css from './DateArchive.module.css'

/** 谁在场：主位在前，同场跟上（只用来写卡面那一行字，不再判关系档位） */
function whoOf(rv: Rendezvous): string {
  const main = charOf(rv.charId)?.name ?? rv.charId
  const rest = (rv.party ?? []).map((id) => charOf(id)?.name ?? id)
  return rest.length ? `${main} · 同场 ${rest.join('、')}` : main
}

export function DateArchive({ rvs }: { rvs: Rendezvous[] }) {
  const { operatorName } = useTerminal()
  const opName = opNameOf(operatorName)
  /* 账本与它同一份订阅：别的窗口把线程清了，这一块当场跟着变 */
  const ver = useSyncExternalStore(subscribeSmsLog, smsLogVersion)
  const logs = useMemo(() => loadSmsLogs(), [ver])
  const [pick, setPick] = useState<string | null>(null)
  const [foldOpen, setFoldOpen] = useState<Set<string>>(new Set())

  /* 挑中的那一场。没挑过（或挑的已经被清掉）就落到最近散场的那一场 ——
     `listRendezvous` 已经把 `done` 的排在前头（见 lib/rendezvous.ts）。 */
  const cur = rvs.find((r) => r.id === pick) ?? rvs[0] ?? null
  const log = cur ? logs[cur.id] ?? [] : []

  if (!cur) return null

  const toggleFold = (id: string) => {
    setFoldOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    /* 只读的一屏：右栏那两块（事件卡 / 色情状态栏）在这儿没有位置，
       所以这一块横跨 `.layout` 整两格（`gridColumn: '1 / -1'`）。 */
    <section className="panel" style={{ gridColumn: '1 / -1' }} data-date-record-area>
      <div className="panel__head">
        <span className="panel__title">约会记录 <span className="slash" /></span>
        <span className="muted tiny" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>
          已散场 {rvs.length} 场 · 只读
        </span>
      </div>

      <div className={css.picks} data-date-record-list>
        {rvs.map((r) => {
          const on = r.id === cur.id
          return (
            <button
              key={r.id}
              type="button"
              className={`${css.pick} ${on ? css.pickOn : ''}`}
              onClick={() => setPick(r.id)}
              data-date-record={r.id}
              data-date-record-on={on ? '1' : '0'}
              title={`${r.title} · ${r.place}${r.time ? ` · ${r.time}` : ''}`}
            >
              <b>{whoOf(r)}</b>
              <span>{r.title}</span>
              <span className={css.pickWhen}>{fmtSlotTime(r.ts)}</span>
            </button>
          )
        })}
      </div>

      {/* 会话说到底还是那一套壳：旁白块 + 台词框，与车道里长得一模一样 */}
      <div className={plot.onBody}>
        <div className={plot.thread} data-date-record-thread>
          <div className={css.lede}>
            <span className={css.ledeWho}>{whoOf(cur)}</span>
            <span className={css.ledeMeta}>
              {cur.place}{cur.time ? ` · ${cur.time}` : ''} · {fmtSlotTime(cur.ts)} 散场
            </span>
          </div>
          {log.length === 0 ? (
            <EmptyHint
              title="这一场没留下字"
              body={`${whoOf(cur)} · ${cur.title}　—— 约是开出来了，一句话也没说就走完了。`}
            />
          ) : null}
          {log.map((m) =>
            m.from === 'them' ? (
              <NarrBlock key={m.id} label="导演叙述" time={m.time} text={m.text} opName={opName}>
                {m.meta?.thinking ? (
                  <ThinkFold
                    open={foldOpen.has(m.id)}
                    text={m.meta.thinking}
                    onToggle={() => toggleFold(m.id)}
                  />
                ) : null}
              </NarrBlock>
            ) : (
              <YouFrame
                key={m.id}
                text={m.text}
                opName={opName}
                foot={<span className={`muted tiny ${plot.youFoot}`}>{m.time}</span>}
              />
            ),
          )}
        </div>
      </div>
    </section>
  )
}
