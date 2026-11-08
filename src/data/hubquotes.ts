/* ============================================================
   主页看板台词 —— 立绘说话用
   ------------------------------------------------------------
   — 指针移上立绘说一句，点一下再说一句；话一律取自原文：
     人物卡「代表台词 / 说话方式」、主役档案 quote、登场者页 quote。
   — 只做清洗（剥引号、去括注、压平空白），不改写、不拼接。
   — 每个角色自己的口吻，因此不写通用台词池。
   ============================================================ */

import { PERSON_IDS } from './castmeta'
import { CHARACTERS } from './chars'
import { SIDECAST } from './sidecast'
import { personaCardOf } from './persona'

/** 取一句话本身：有「」就取引号内那段，去掉括注与多余空白 */
function clean(raw: string): string {
  const t = raw.trim()
  const m = t.match(/「([^」]+)」/)
  const body = m ? m[1] : t
  return body.replace(/（[^）]*）/g, '').replace(/\s+/g, ' ').trim()
}

function bankOf(id: string): string[] {
  const out: string[] = []
  const card = personaCardOf(id)
  for (const sec of card?.sections ?? []) {
    if (sec.title !== '代表台词' && sec.title !== '说话方式') continue
    for (const line of sec.lines) out.push(clean(line))
  }
  const core = CHARACTERS.find((c) => c.id === id)
  if (core) out.push(clean(core.quote))
  const side = SIDECAST.find((s) => s.id === id)
  if (side) out.push(clean(side.quote))

  const seen = new Set<string>()
  return out.filter((t) => t.length >= 6 && t.length <= 60 && !seen.has(t) && (seen.add(t), true)).slice(0, 6)
}

/** 每个在册角色的看板台词（缺材料的角色为空数组，调用方给一句沉默） */
export const HUB_LINES: Record<string, string[]> = Object.fromEntries(
  PERSON_IDS.map((id) => [id, bankOf(id)]),
)
