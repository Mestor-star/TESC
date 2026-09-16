/**
 * lib/pv.ts — 开场 PV（2026-09-16）
 * ------------------------------------------------------------
 * 主人给的那支片子（官方 PV 剪出来的 **29 秒**：正片 →「こちら、終末停滞委員会。」
 * 定格卡收尾）**头一次开终端强制放一遍**，之后不再自动出现，改由开场标题屏
 * 右上角那枚播放键点着重看。
 *
 * 2026-09-16 收尾一刀（主人：「PV 的最后部分不需要，后面到标题就结束」）：原片
 * 43 秒，定格卡之后还缀着「点击进入游戏」→ 开始界面 → 认证开屏 三截 —— 那三截
 * 本终端自己就会演（开场标题屏 / 标题菜单 / 接入序列），片子里再演一遍是重。
 * 已在 **29.3s** 处切掉（29.0–29.3 是卡片的干净定格，29.4 起才抖、29.6 起才落出
 * 按钮），片子于是**正好停在定格卡上**。切点上补了一道 1 秒淡出 —— 其实那三截本
 * 来就是无声的（音乐在 28s 前后自然收束），所以听感上一处接缝都剪不出来。
 *
 * 2026-09-16 后段流程改版：片子放完**就停在定格卡上**，卡底下挂着
 * 「点击进入游戏」（`Boot` 的 `data-start-game`）—— 它得能点。
 * 从前那一下是底下那屏（指纹认证）在等着，片子只是个盖上去的过场；
 * 现在片子收场之后露出来的，本身就是那一屏的脸。
 *
 * 三条规矩：
 *  ① **「看过没」是设备级的，不进存档。** 记在 localStorage 的 `zts-pv-seen` 上，
 *     与 `lib/guide.ts` 的 `zts-guide:v1` 同一档 —— 它不是世界进度的东西，
 *     「重置世界进度」不该把 PV 又翻出来放一遍。
 *  ② **片子在不在要认，不能想当然。** 万一 `public/pv.mp4` 缺了（换了台机器、
 *     或者哪天主人决定把它从仓库里摘出去），播放键得自己藏起来，首启也别弹一个
 *     黑屏出来 —— 见下面那个 `pvOk` 小仓。探测**不另发请求**：谁真去放过一次，
 *     `<video>` 的 `onError` / 成功起播就会回报，回报了才写。
 *  ③ `localStorage` 读失败（无痕 / 禁存）时按「看过」算 —— 宁可这一次不放，
 *     也不要变成每刷一次页面就糊一支 29 秒的片子上去。
 */

import { assetBase } from './assetbase'

const SEEN_KEY = 'zts-pv-seen'

/** 片子的地址：跟着 `assetBase()` 走，GitHub Pages 那种子路径站也取得到 */
export function pvUrl(): string {
  return `${assetBase()}pv.mp4`
}

export function hasSeenPv(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export function markPvSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 存不下就算了：这一趟已经放过了，最坏是下次开还放一遍 */
  }
}

/* ------------------------------------------------------------------
   片子在不在 —— 一个 10 行的极小仓，给「重看」那枚按钮照着隐身
   （与 `lib/sms.ts` 的 `subscribeUnread` / `totalUnread` 同一套读法：
     `useSyncExternalStore(subscribePvOk, pvOk)`）。
   `null` = 还不知道（没放过）；true / false 是实际放出来的结果。
   ------------------------------------------------------------------ */
let ok: boolean | null = null
const subs = new Set<() => void>()

export function pvOk(): boolean | null {
  return ok
}

export function notePvOk(v: boolean): void {
  if (ok === v) return
  ok = v
  subs.forEach((f) => f())
}

export function subscribePvOk(f: () => void): () => void {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}
