/**
 * 作战屏的「转横」—— 手机上进战斗时尽量把屏幕横过来。
 *
 * 为什么要有这一支：作战屏是六段并排的界面（HUD / 顺位 / 敌阵 / 观测 /
 * 指令 / 小队），**竖屏的 390 宽塞不下、靠折行也只是勉强**；横过来之后
 * 宽度富余、按「左右两栏」排（见 Battle.module.css 尾部的横屏档）才是
 * 它本来该有的样子。
 *
 * ⚠️ **必须在用户手势的同步栈里叫** —— 浏览器的全屏请求认手势，
 * 晚一拍（比如等组件挂载后的 effect）就会被拒。所以入口是「出击」那一枚
 * 按钮的 onClick，不是 Battle 的 useEffect。
 *
 * ⚠️ 锁屏有两道门：`screen.orientation.lock()` 只对**已全屏**的页面生效，
 * 而 iOS Safari 干脆没实现这个 API。两处都当**正常路径**处理、静默返回 false：
 * 竖屏那套折行布局本来就能用（Battle.module.css 末尾那三档），
 * 转不过去只是「窄一点」，不该变成一句报错。
 */

type Lockable = ScreenOrientation & { lock?: (o: string) => Promise<void> }

/** 只在窄屏上试 —— 桌面窗口再窄也不该被抢走全屏 */
const NARROW = 900

export async function tryLockLandscape(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (window.innerWidth > NARROW) return false
  const so = screen.orientation as Lockable | undefined
  if (!so?.lock) return false
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    }
    await so.lock('landscape')
    return true
  } catch {
    return false
  }
}

/**
 * 退出作战屏时把这两样还回去。
 *
 * 不加分辨地全退：这一趟是不是自己锁成的没法可靠判断（`lock` 成功、
 * 用户自己又转回去，状态就与记录对不上了）。**没锁过的话这两个调用
 * 本来就是空操作**，代价只有一个被吞掉的异常。
 */
export function releaseLandscape(): void {
  if (typeof window === 'undefined') return
  try {
    screen.orientation?.unlock?.()
  } catch {
    /* 没锁过 / 浏览器没实现 —— 都不当回事 */
  }
  try {
    if (document.fullscreenElement) void document.exitFullscreen()
  } catch {
    /* 同上 */
  }
}
