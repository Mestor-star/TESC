/** tokens.css 以 ?inline 取原文（宿主态 scope 后用），给 TS 一个字符串默认导出类型 */
declare module '*.css?inline' {
  const css: string
  export default css
}
