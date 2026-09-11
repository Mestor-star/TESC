/* ============================================================
   一场仗到底几手打得完 —— 离线试跑
   ------------------------------------------------------------
   给作战引擎喂一场「随机看板任务 + 一支小队」，用最朴素的策略
   （能出伤就出伤、挑不出就普攻、门没开就防御）一路打到底，
   把「几手、谁还剩多少血、最后是胜是败」打出来。

   与 scripts/balance.mjs 的分工：那个是分布（六百场的胜率与拍数），
   这个是单场（这一仗为什么长 / 换个人打会不会短）。smoke 的 N 段
   曾经走不完一场危险度 9 的仗，就是拿这个逐项对出来的：
   少了主角、没带道具袋、一直敲头目 —— 每一条都实打实地拖长这场仗。

     node scripts/battlesim.mjs [seed] [卷期数] [手数上限] [小队逗号分隔]

   小队不给就按任务卡上的「推荐小队」编（与 balance 复核同一路径）。
   AIM=weak 挑血最少的打，AIM=first（缺省）打牌面上第一个。
   ============================================================ */
import { createServer } from 'vite'

const seed = Number(process.argv[2] || 20260911)
const epCount = Number(process.argv[3] || 5)
const cap = Number(process.argv[4] || 400)

const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: 'error',
  server: { middlewareMode: true }, appType: 'custom',
})

try {
  const eng = await server.ssrLoadModule('/src/lib/battle/engine.ts')
  const gen = await server.ssrLoadModule('/src/lib/battle/missiongen.ts')
  const der = await server.ssrLoadModule('/src/lib/battle/derive.ts')
  const tun = await server.ssrLoadModule('/src/lib/battle/tuning.ts')

  const board = gen.genBoard(seed, 5)
  const mission = board[0]
  // 队伍：给了参数就用手挑的那一队，不给就按任务卡上的「推荐小队」编
  // （后者才是 balance 复核走的路径 —— 它拿的是任务自己写明的应对班底）。
  // 早先这里写死一支不含主角的四人，跑出来的「几百手打不完」是编队的事，不是引擎的事。
  const squad = process.argv[5]
    ? process.argv[5].split(',')
    : ['operator', ...der.squadIdsFrom(mission.recommend).filter((x) => x !== 'operator')].slice(0, 6)
  const epDone = {}
  const ALL = ['v1-1', 'v1-2', 'v1-3', 'v1-4', 'v1-5', 'v1-6', 'v1-7', 'v1-8', 'v1-9',
    'v2-1', 'v2-2', 'v2-3', 'v2-4', 'v2-5', 'v2-6', 'v2-7', 'v2-8', 'v2-9',
    'v3-1', 'v3-2', 'v3-3', 'v3-4', 'v3-5', 'v3-6', 'v3-7', 'v3-8', 'v3-9']
  for (const id of ALL.slice(0, epCount)) epDone[id] = true
  const progress = der.periodProgress(epDone)
  const stamina = { cur: 120, max: 120 }
  const bond = Object.fromEntries(squad.map((id) => [id, 60]))

  let s = eng.createBattle({
    mission, squad, progress, growth: {}, gear: {},
    // 道具袋与体力也照 balance 复核那一套给：空着袋子跑出来的长仗，
    // 分不清是「这仗难」还是「没带东西」
    sp: tun.TUNING.spMax, spMax: tun.TUNING.spMax,
    bag: { ...tun.TUNING.bagDefault }, coin: 0, morphPool: [], bond,
  })
  console.log(`任务 ${mission.no} · ${mission.title}　地点 ${mission.place}　危险度 ${mission.stage}　敌 ${s.enemies.length} 体`)
  console.log('  小队：' + squad.join(' / '))
  console.log('  敌体：' + s.enemies.map((e) => `${e.name} ${e.hp}/${e.hpMax}`).join('　'))
  console.log('  我方：' + s.allies.map((a) => `${a.name} ${a.hp}/${a.hpMax}`).join('　'))

  // 打谁：ahead=场上第一个（面板顺序，通常是头目）/ weak=血最少的那个。
  // 这一条是拿来看「集中火力清杂兵」值多少手的 —— 界面上的机器人点的是前者。
  const aimMode = process.env.AIM || 'first'
  const firstFoe = (st) => {
    const live = st.enemies.filter((e) => !e.down && e.hp > 0)
    if (aimMode === 'weak') return [...live].sort((a, b) => a.hp - b.hp)[0]
    return live[0]
  }
  let hands = 0
  const marks = []
  while (s.phase === 'select' && hands < cap) {
    const before = s.hand
    s = eng.advance(s)
    if (s.phase !== 'select') break
    const me = s.actor ? s.allies.find((a) => a.id === s.actor) : null
    if (!me) break
    const foe = firstFoe(s)
    if (!foe) break
    // 朴素策略：挑得出伤最大的那一手（power 最高、没在冷却、时机够），挑不出就普攻
    let next = null
    const usable = (me.skills || [])
      .filter((sk) => (sk.power || 0) > 0)
      .filter((sk) => !(sk.cd && (me.cds?.[sk.id] ?? 0) > 0))
      .filter((sk) => !(sk.openAfter && s.hand < sk.openAfter))
      .filter((sk) => !(sk.needsStack && (me.stack || 0) < sk.needsStack))
      .sort((a, b) => (b.power || 0) - (a.power || 0))
    for (const sk of usable) {
      const t = sk.target === 'ally' || sk.target === 'allAlly' ? me.id : foe.id
      const r = eng.act(s, { t: 'skill', skillId: sk.id, targetId: t })
      if (r && r.hand !== s.hand) { next = r; break }
    }
    if (!next) next = eng.act(s, { t: 'atk', targetId: foe.id })
    if (!next || next.hand === before) {
      // 这一手推不动（门没开之类）—— 防御顶过去，避免在这儿空转
      next = eng.act(s, { t: 'guard' })
    }
    s = next
    hands = s.hand
    if (hands % 10 === 0) {
      marks.push(`${hands}手 敌 ${s.enemies.filter((e) => !e.down).map((e) => `${e.name} ${e.hp}`).join('/')}`)
    }
  }
  console.log('  进程：' + (marks.join(' | ') || '（没走满 10 手）'))
  console.log(`结果 phase=${s.phase} 手数=${s.hand} 拍数=${s.tick} 主战者甲 ${s.enemies.map((e) => `${e.name} ${e.hp}/${e.hpMax}${e.down ? ' 失能' : ''}`).join('　')}`)
  console.log('我方：' + s.allies.map((a) => `${a.name} ${a.hp}/${a.hpMax}${a.down ? ' 失能' : ''}`).join('　'))
} catch (e) {
  console.error('SIM ERROR:', e && e.stack ? e.stack : String(e))
  process.exitCode = 1
} finally {
  await server.close()
}
