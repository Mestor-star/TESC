/* ============================================================
   导演变量名归一化（`world.flags` 的键）
   ------------------------------------------------------------
   这一格的键**有两拨人写**，规矩只管其中一拨：

     · 操作员 —— 变量面板里手打的（`addVar` / `renameVar` / `setFlag`）。
       手打的就是手打的，**一个字都不许替人改**，所以那些入口不经过这里。
     · 导演   —— 每回合回执里 `"flag": {"…": 值}` 自动落下的。
       归一化管的是它（`applyDirective` 落盘前那一道）。

   为什么需要它：同一件事，模型这一回合写 `Trust`、下一回合写 `trust `、
   再下回合写 `trust-level` —— 三条变量各涨各的，变量面板上看着像三件事，
   其实是一件。规矩本来写在提示词里（`buildDirectorSystem` 的【用户变量】一段：
   小写加下划线、无空格、≤48 字符），可提示词只是**请求**，模型不照做也拦不住，
   于是落盘这一层补一道 —— 跟 `freezeBond` 拦在落地层是同一个道理：
   写在提示词里的规矩是请求，写在落盘处的规矩才是规矩。

   **这一层只做机械归正，不做语义合并。**「身份暴露」和 `identity_exposed`
   是同一个意思，机器认不出来；硬凑就得靠词典或人工。这里给的是：
   折全半角 / 折大小写 / 折分隔符 / 去杂字符 / 截长，
   外加**先认已经登记过的键**（差一点点就并到老键上 —— 这条最要紧：
   模型换个大小写不该算「新建」，而「新建」正是这堆烂账的来源）。
   ============================================================ */

/** 与提示词里那句「≤48 字符」对齐 —— 两处别各写一个数 */
export const FLAG_KEY_MAX = 48

/** 分隔符一族：空白与各种短横 / 点 / 斜杠 / 冒号 / 竖线 / 破折号（含全角写法，NFKC 之后再折一遍） */
const SEP = /[\s　\-.·・/\\:：|—–－]+/g
/** 认得的字符：英文小写、数字、下划线，外加汉字（U+4E00–U+9FFF）—— 汉字**不删**，删了等于把值丢了 */
const KEEP = /[^a-z0-9_一-鿿]/g

/**
 * 机械归正一个变量名。空（或归正之后什么也不剩）返回 `''`，调用方据此跳过。
 *
 * 不做的事：不把汉字翻成英文、不砍词根、不做单复数。
 */
export function canonFlagKey(raw: string): string {
  const s = raw.normalize('NFKC').trim()
  if (!s) return ''
  const key = s
    .toLowerCase()
    .replace(SEP, '_')
    .replace(KEEP, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return key.slice(0, FLAG_KEY_MAX)
}

/**
 * 归正之后**再认一遍已登记的键**：写法差一点点就并到老键上。
 *
 * 只比「归正结果」这一层，不做编辑距离、不砍后缀 ——
 * `trust_state` 与 `trust` 到底是不是一件事，机器说了不算，宁可留着让人自己合。
 * 认不出来就返回归正后的新键（该新建就新建）。
 */
export function snapFlagKey(raw: string, known: readonly string[]): string {
  const key = canonFlagKey(raw)
  if (!key) return ''
  /* 第一遍原样比：大多数情况里的「老键」本来就是归正过的，这一遍就中了 */
  for (const k of known) if (k === key) return k
  /* 第二遍拿老键的归正结果比：`trust-level` 撞上登记着的 `trust_level` */
  for (const k of known) if (canonFlagKey(k) === key) return k
  return key
}
