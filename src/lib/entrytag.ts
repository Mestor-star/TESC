/* 词条记号：一条词条首尾各一枚标签，名字取自词条本身（不是 <lore name=…> 这类通用记号）。
   模型因此看得出「这一段是一条完整条目」的起止；几条同时在场也不会串成一段。
   标签名里不能有空白、引号与尖括号 —— 名字里带空格时直接并掉，斜杠换成间隔号。 */

export function tagOf(name?: string): string {
  const s = (name ?? '')
    .replace(/[<>"'“”‘’`\s]/g, '')
    .replace(/[／/]/g, '·')
    .trim()
  return s || '条目'
}

/** 把一条词条正文完全包起来：<名>
…
</名> */
export function wrapEntry(name: string | undefined, body: string): string {
  const t = tagOf(name)
  return `<${t}>\n${body}\n</${t}>`
}
