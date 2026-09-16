import { useSyncExternalStore } from 'react'
import { Play } from '@phosphor-icons/react'

import { pvOk, subscribePvOk } from './lib/pv'
import { TitleCard } from './components/TitleCard'
import css from './Boot.module.css'

/**
 * 开场标题屏（2026-09-16 由「认证开屏」改过来）。
 *
 * 从前这一屏是**长按指纹**做认证，认完再跑一段自检、然后才进开始界面。
 * 主人把这条链子收了：指纹不要了（连带「点一下指纹」这个动作），
 * 片子放完就停在**官方 PV 收尾那张卡**上，卡底下挂着「点击进入游戏」——
 * 它得能点，点进开始界面。于是这一屏与 PV 的收尾卡是同一张脸：
 * 同一份 `components/TitleCard`，同一个底色、同一套入场动效。
 *
 * 原来那三段（指纹扫描 / 接入序列 / 学籍身份行）都不在这儿了：
 *   · 指纹那一段整个删掉；
 *   · **接入序列搬去了 `components/BootSeq`**，位置也从「进开始界面之前」
 *     挪到「开始界面上按下去之后」；
 *   · 底部那行「（临时访问／正式委员）· 言万心叶」是**从存档读出来的学籍身份**，
 *     随那一段一起走 —— 主人说的「不要读取身份的部分」就是它。
 *
 * 右上角那簇里的**「重看开场影像」**（`data-pv-replay`）留着：开场 PV 头一遍
 * 进终端是自动放的（那一下由 `App.tsx` 的 `Gate` 管），放完就不再自己冒出来 ——
 * 想再看只有这一枚。片子真放不出来时它自会隐身，判据在 `lib/pv.ts`。
 * 四角小件整块 `pointer-events: none`，所以它自己开了 `auto`。
 *
 * **冒烟把手**：`[data-boot-card]`（这一屏）与 `[data-start-game]`（进入按钮）。
 */
export function Boot({ onDone, onReplay, frozen }: { onDone: () => void; onReplay: () => void; frozen?: boolean }) {
  /* 右上角那枚「重看开场影像」什么时候该隐身 —— **只在确知片子放不出来**时收起来。
     `pvOk()` 是 `null`（这一趟还没放过 / 冷启动刚进来）时照常摆着：老主顾刷新页面时
     那个读数是 null，要是拿它当「没有」判，按钮就再也不出现了。读数见 `lib/pv.ts`。 */
  const canReplay = useSyncExternalStore(subscribePvOk, pvOk) !== false

  return (
    /* `frozen`：片子正压在上面放的时候，这一屏**停笔**（见 Boot.module.css 头上那一段）。
       它不是「不见了」—— 元素、盒子、把手全在，只是不画、不动画。
       片子放完（或按了跳过）`frozen` 落回 false，这一屏从暂停处接着入场。 */
    <div className={css.boot} role="dialog" aria-label="开场标题屏" data-boot-card="1" data-pv-up={frozen ? '1' : undefined}>
      {/* 四角小件 —— 与标题菜单、终端外壳同一套：开机的时候屏幕上先摆好框 */}
      <div className={css.corner}>
        <span className={`${css.chip} ${css.chipTL}`}>
          <i className={css.chipDot} />终端待机
        </span>
        {/* 右上角这一簇是「播放键 + VER」两件：播放键在最外，VER 挨着它 */}
        <span className={css.cornerR}>
          {canReplay ? (
            <button
              className={`${css.chip} ${css.pvBtn}`}
              data-pv-replay
              onClick={onReplay}
              title="重看开场影像"
              aria-label="重看开场影像"
            >
              <Play size={9} weight="fill" />开场影像
            </button>
          ) : null}
          <span className={css.chip}>VER 4.2</span>
        </span>
        <span className={`${css.chip} ${css.chipBL}`}>弗尔克图斯 · 第 12 区</span>
        <span className={`${css.chip} ${css.chipBR}`}>委员制式配备</span>
      </div>

      <div className={css.bootInner}>
        <TitleCard />
        <span className={css.bootSub}>停滞观测终端 v4.2 · 委员制式配备</span>
        <span className={css.orn} aria-hidden="true">✦</span>

        {/* 这一屏唯一的动作。片子放完停在这儿，点它进开始界面。 */}
        <button className={`btn btn--primary ${css.startBtn}`} data-start-game onClick={onDone}>
          点击进入游戏
        </button>
      </div>
    </div>
  )
}
