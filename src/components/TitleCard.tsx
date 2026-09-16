import css from './TitleCard.module.css'

/**
 * **官方 PV 收尾那张标题卡**（こちら、／終末停滞／委員会。／TIME IS THE END）。
 *
 * 两处共用，所以只有这一份：
 *   · `Boot` —— 开场标题屏：片子放完停的那一屏，卡底下挂着「点击进入游戏」；
 *   · `views/Title` —— 开始界面：卡上头那份菜单。
 * 主人要的是「PV 里那张卡」，两处必须一模一样；各写一份迟早会漂成两张。
 *
 * 样式、取色来源、以及「为什么它自带底色（格纸）」那条规矩，全在
 * `TitleCard.module.css` 头上 —— 改之前先读那一段。
 */
export function TitleCard() {
  return (
    <h1 className={css.pvCard}>
      <span className={css.pvStack}>
        <span className={css.pvHere}>こちら、</span>
        <span className={css.pvBig}>
          <span className={css.pvPair} data-i="0">終末</span>
          <span className={css.pvPair} data-i="1">停滞</span>
          <span className={css.pvRest}>委員会。</span>
        </span>
        <span className={css.pvEn}>
          TIME IS THE END
          <br />
          STAGNATION COMMITTEE.
        </span>
      </span>
    </h1>
  )
}
