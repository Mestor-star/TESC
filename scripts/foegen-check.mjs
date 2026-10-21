/* ============================================================
   敌阵 · 目标池离线复核
   ------------------------------------------------------------
   跑法：node scripts/foegen-check.mjs
   验的是三件不能靠肉眼的事：
     ① 非生物（地点 / 现象 / 设施 / 器物）一个都进不了目标池；
     ② 脏器公寓那一段（v1-5）刷出来的只有狂热者格尔，没有那座馆；
     ③ 同一段多次进入必得同一批（确定性哈希），且每条都说得出出处。
   另附五个典型敌人的「能力贴核」对照表（从档案读，不另写一份）。
   ============================================================ */

import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

let pass = 0
let fail = 0
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('  ok  ' + name + (detail ? ' :: ' + detail : '')) }
  else { fail += 1; console.log('  XX  ' + name + (detail ? ' :: ' + detail : '')) }
}

try {
  const { foePoolOf, targetBossOf } = await server.ssrLoadModule('/src/lib/battle/foegen.ts')
  const { NON_COMBAT_CODEX, isFoeEntity } = await server.ssrLoadModule('/src/lib/battle/foeclass.ts')
  const { END_FOES } = await server.ssrLoadModule('/src/lib/battle/endfoes.ts')
  const { NAMED_BOSSES } = await server.ssrLoadModule('/src/lib/battle/bosses.ts')
  const { mainlineMissions } = await server.ssrLoadModule('/src/lib/battle/mainline.ts')
  const { genBoard } = await server.ssrLoadModule('/src/lib/battle/missiongen.ts')
  const { CODEX } = await server.ssrLoadModule('/src/data/codex.ts')
  const { TIMELINE } = await server.ssrLoadModule('/src/data/timeline.ts')

  const at = (id, progress = 0.5) => {
    const e = TIMELINE.find((x) => x.id === id)
    return {
      id: 'check-' + id, no: 'CHK', title: e.title, place: e.place, stage: 6,
      nature: '反现实 · 遭遇', recommend: [], status: '压制中', deadline: '即刻',
      desc: '', reward: [], at: id, bossId: id === 'v1-5' ? 'fanatic-ger' : undefined,
    }
  }

  console.log('\n【① 非生物不进敌阵】')
  const bad = []
  for (const id of Object.keys(NON_COMBAT_CODEX)) {
    const e = CODEX.find((c) => c.id === id)
    if (!e) { bad.push(id + '（名单里的 id 在图鉴里不存在）'); continue }
    if (isFoeEntity(e)) bad.push(id)
  }
  ok('黑名单里的每一条都真的被判定为非生物，且 id 都在图鉴里', bad.length === 0, bad.join('、') || Object.keys(NON_COMBAT_CODEX).join('、'))
  ok('脏器公寓（organ-apt）被明确判成地点', NON_COMBAT_CODEX['organ-apt']?.nature === '地点', NON_COMBAT_CODEX['organ-apt']?.why)

  console.log('\n【② v1-5：只打狂热者格尔】')
  const p15 = foePoolOf(at('v1-5'), 0.15)
  const ids15 = p15.map((t) => t.bossId)
  ok('v1-5 的目标池里没有脏器公寓', !ids15.includes('organ-apt') && !p15.some((t) => t.name.includes('脏器公寓')), p15.map((t) => t.name).join('、'))
  ok('v1-5 的目标池里没有黑曜石（这一场它不揭开）', !ids15.includes('obsidian'), p15.map((t) => t.name).join('、'))
  ok('v1-5 的目标池里有狂热者格尔', ids15.includes('fanatic-ger'), p15.map((t) => t.name + ' :: ' + t.why).join(' | '))
  ok('v1-5 的每一条都说得出出处与理由', p15.every((t) => t.origin && t.why), p15.map((t) => t.origin).join(' | '))

  console.log('\n【③ 同一段多次进入必得同一批】')
  const pA = JSON.stringify(foePoolOf(at('v1-5'), 0.15))
  const pB = JSON.stringify(foePoolOf(at('v1-5'), 0.15))
  ok('同一个任务两次取池子逐字相同', pA === pB)
  const p15b = foePoolOf(at('v1-5'), 0.9)
  ok('时期变了、原文种子那几条也不跟着变', JSON.stringify(p15b.map((t) => t.bossId)) === JSON.stringify(ids15), p15b.map((t) => t.name).join('、'))

  console.log('\n【④ 巡逻看板：按场面生成，脏器公寓那一条只认格尔】')
  const board = genBoard(3, 0.5, 10)
  const organ = board.find((m) => m.id.includes('-organ-'))
  ok('看板里确实有脏器公寓那一条（复核判据不是空转）', !!organ, organ ? organ.title : '（没有）')
  if (organ) {
    const p = foePoolOf(organ, 0.5)
    ok('脏器公寓那一条刷出的是狂热者格尔，不是那座馆', p.some((t) => t.bossId === 'fanatic-ger') && !p.some((t) => t.bossId === 'organ-apt'), p.map((t) => t.name).join('、'))
  }
  const pools = board.map((m) => foePoolOf(m, 0.5))
  const leak = pools.flat().filter((t) => t.bossId && !isFoeEntity(CODEX.find((c) => c.id === t.bossId) ?? { name: '' }))
  ok('整块看板的目标池里一个非生物都没有', leak.length === 0, leak.map((t) => t.name).join('、') || `${pools.flat().length} 条对过`)

  console.log('\n【⑤ 主线牌面：v1-5 挂的就是格尔】')
  const epDone = {}
  const claimed = {}
  for (const e of TIMELINE) { epDone[e.id] = true; if (e.id !== 'v1-5') claimed[e.id] = true }
  const main = mainlineMissions(epDone, claimed)[0]
  ok('主线 v1-5 的 bossId 是 fanatic-ger', main && main.bossId === 'fanatic-ger', main ? String(main.bossId) : '（没有这一场）')

  console.log('\n【⑥ 五个典型敌人 · 能力贴核对照】')
  const picks = [
    ['fanatic-ger', '不死者：言语命令 / 放逐 / 意志力破绽'],
    ['obsidian', '天使之律：律纹裁 / 旧神万目 / 渗透缝隙'],
    ['masked-kokonoha', '梵我合一：鸟与诗 / 亡灵军团 / 温柔怪物'],
    ['black-gold-lion', '融合体：五人的手各一份 / 意志力塌陷'],
    ['star-whale', '共同幻想：横渡 / 回家的路 / 不可暴力清除'],
  ]
  for (const [id, why] of picks) {
    const b = id === 'masked-kokonoha' || id === 'black-gold-lion' ? NAMED_BOSSES[id] : END_FOES[id]
    ok('档案存在：' + id, !!b, b ? b.name : '（缺）')
    if (!b) continue
    console.log('  · ' + b.name + '（' + why + '）')
    console.log('    来源：' + b.from)
    console.log('    技能：' + b.skills.map((k) => k.name).join(' / '))
    console.log('    被动：' + (b.passive?.name ?? '无') + '　破绽：' + (b.guardAxis ?? '无'))
    const derived = b.skills.length >= 3 && b.skills.every((k) => k.desc && k.desc.length > 8)
    ok('  每一手都带档案说明（不是通用招式）', derived)
  }
  ok('格尔的到达点写着「只能被放逐」', /放逐/.test(END_FOES['fanatic-ger'].skills.map((k) => k.desc).join('')))
  ok('星鲸的被动写着「不可用暴力清除」', /不可用暴力清除/.test(END_FOES['star-whale'].passive?.name ?? ''))
  ok('黑金狮子的招式分别出自融合进去的那几个人', ['认真模式SSS', '热沃当的少女', '大麻烦', '号外号外 · 记录世界'].every((n) => NAMED_BOSSES['black-gold-lion'].skills.some((k) => k.name === n)))

  console.log('\n【⑦ 挑中的那一条确实站到场上】')
  const t15 = p15.find((t) => t.bossId === 'fanatic-ger')
  const boss = targetBossOf(t15)
  ok('targetBossOf 把池子里的那一条翻成上场档案', boss && boss.id === 'fanatic-ger', boss ? boss.name : '（空）')
  const off = foePoolOf(at('v2-2'), 0.5)
  ok('v2-2（深穴）不进目标池：那一段只出无档案的现推观测体', !off.some((t) => t.bossId === 'deep-hole'), off.map((t) => t.name).join('、'))
} catch (e) {
  fail += 1
  console.error('CHECK ERROR:', e && e.stack ? e.stack : String(e))
} finally {
  await server.close()
}

console.log('\n=== FOEGEN ' + (fail === 0 ? 'PASS' : 'FAIL') + ' · ' + pass + ' 通过 / ' + fail + ' 失败 ===')
process.exit(fail === 0 ? 0 : 1)
