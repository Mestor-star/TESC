/* ============================================================
   分块没拉下来时的自救（主人 2026-09-15：「失败自动重取一次」）
   ------------------------------------------------------------
   十一个视图各是一块单独的分块，第一次真的走到那一页才去拉
   （见 `App.tsx` 的 `view()`）。拉不到通常只有两条路：

     · **手一滑** —— 网络抖了一下，或那一块 CSS 的请求中途断了。
       原地再拉一次往往就成（Vite 那条预载在失败时会把记号抹掉，
       重来是真的重新发请求，不是白等一场）。
     · **页面自己缓存着上一版的入口** —— 那份 `index.html` 里记的分块名，
       服务器上已经不叫这个了，怎么重拉都是 404。这一条只有
       **整页换一个地址重来**才解得开（换个地址 = 绕开缓存）。

   所以走法是两步：原地重取一次 → 不行就带 `?v=<时间戳>` 整页重来一次。
   再失败就该看见兜底那一屏了 —— 「重挂界面」对它没有用：`React.lazy`
   把失败的那次 import **连同结果一起记着**，重挂只是把同一个失败再抛一遍。

   **防打转 —— 账要记在「哪一块」上，不能记在「这一趟」上。**（2026-09-15 实测
   改的，原先记在趟上，是个真的圈）：一页里不止一块分块 —— 开屏进来那一下
   `Dashboard` 就先拉成功了。要是「任意一次成功都把账抹掉」，那么
   「Saga 一直拉不到」的时候就成了：点 Saga → 重载 → 开屏把 Dashboard 拉成功、
   账被清零 → 再点 Saga → 又重载……主人卡在「点一次、重载一次」的圈里，
   永远见不到兜底那一屏，也永远不知道出了什么事。
   所以记的是**块名**：「Saga 这一块已经用它那一趟了」。重来之后 Saga 再失败，
   看名字对得上，直接抛给兜底；而别的块（Dashboard 那一下）拉成功跟 Saga 的账无关，
   不会顺手把它清掉。账只由**那一块自己**成功来销。

   这一整个模块是**纯的**（仓库可注入、地址是拼字符串），
   mech 拿一个内存桩就能把这几条路逐条走一遍。
   ============================================================ */

/** 记账用的小仓库 —— 浏览器里是 `sessionStorage`，mech 塞内存桩 */
export interface RetryStore {
  get(key: string): string | null
  set(key: string, val: string): void
  del(key: string): void
}

/** 值 = **已经自动重来过的那一块**的名字（不是「1」—— 见上面那段） */
export const RETRY_KEY = 'zts-chunk-retry:v1'

/** 浏览器那一份。隐私模式下 `sessionStorage` 可能直接抛 —— 抛了就退化成
    「每次都重取一次」：多花一次请求，但仍然转不出死循环（重来那一步
    另有「地址里带不带 `v=`」当第二道闸，见 `App.tsx` 的 `loadView`）。 */
export const browserStore: RetryStore = {
  get(k) { try { return sessionStorage.getItem(k) } catch { return null } },
  set(k, v) { try { sessionStorage.setItem(k, v) } catch { /* 存不住就少一道闸 */ } },
  del(k) { try { sessionStorage.removeItem(k) } catch { /* 同上 */ } },
}

/**
 * 领一次「这一块」的自动重取额度。
 *
 * 帐上写的是**上一次重来过的那一块叫什么**：名字对得上 → 这一块已经用过了，
 * 答「不行」（整页重来之后那笔账还在，所以第二趟进去正是这一条）；
 * 名字对不上（或帐是空的）→ 记上这一块、答「可以」。
 * 别的块拉的成败与这笔账无关 —— 这也是它不会被开屏那一下顺手清掉的原因。
 */
export function takeRetryOnce(s: RetryStore, name: string): boolean {
  if (s.get(RETRY_KEY) === name) return false
  s.set(RETRY_KEY, name)
  return true
}

/** 这一块自己拉成功了，把它那笔账销掉 —— 下一回真撞上，它还挣得一次自动重取。
    只销自己那一笔：别的块的账留在原处，免得又被开屏那一下清空。 */
export function clearRetry(s: RetryStore, name: string): void {
  if (s.get(RETRY_KEY) === name) s.del(RETRY_KEY)
}

/**
 * 换一个带着新时间戳的地址。**纯函数**，认一个地址、只动 `v` 这一个参数 ——
 * 原先的查询串与锚点原样留着（比如 `#/plot`），换的只是**缓存认的键**。
 * 地址解析不了（少见的畸形 href）就原样还回去，调用那一侧照旧走 `reload()`。
 */
export function freshUrl(href: string, now: number): string {
  try {
    const u = new URL(href)
    u.searchParams.set('v', String(now))
    return u.toString()
  } catch {
    return href
  }
}

/** 整页换地址重来一次。`replace` 而非 `push`：别在历史里留一串中转站 */
export function reloadFresh(now = Date.now()): void {
  try {
    location.replace(freshUrl(location.href, now))
  } catch {
    try { location.reload() } catch { /* 真走不了就留在兜底那一屏上 */ }
  }
}

/** 「这是分块没拉下来」，不是「代码本身炸了」——兜底那一屏要分开说话 */
export const CHUNK_ERR = 'ChunkLoadError'

/** 把底下的原话裹进一层，同时挂上名号，好让兜底那一屏认得出是哪一种 */
export function chunkError(name: string, cause: unknown): Error {
  const why = cause instanceof Error ? cause.message : String(cause)
  const e = new Error(`视图「${name}」那一块没能拉下来：${why}`)
  e.name = CHUNK_ERR
  return e
}

export function isChunkError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as Error).name === CHUNK_ERR
}
