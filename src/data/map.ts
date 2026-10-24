import type { MapKind, MapLayer, MapNode } from './types'

/* ============================================================
   地图 · 两张图共用一份节点表
   ------------------------------------------------------------
   ① **世界层**（scale: 'world'）：大地理单元 —— 天空都市・弗尔克图斯、篝火之国、
      太平洋公海、巴塞罗那、伦敦、纽约、北极、第零区、死灵次元 / 樱次元 / 书架曼荼罗。
   ② **区域层**（scale: 'region'）：大区 → 场所 → 房间/街区。

   `layer` 是**立体分层**，不是什么配色：原文里就有几处明写在地表以下 ——
   富士山地下 300 米的浅间神社、苍之学园地下 267 层的研究所、第 13 区那座骨之圣堂、
   王宫地下的祭祀场、第零区的尸肉神殿。它们靠这一栏读得出来。

   **每个节点的 refs 至少要一处**（时间线段的 place / 图鉴条目 id / 原文切片文件）。
   查不到依据的地名一律没进表 —— 宁可少一个点，不许编一个点。

   `xy` 与 data/regions.ts 同一把尺：0~100 归一化，挨得近 = 故事里走得近，
   不是投影测绘。第 12 区那一片的落点直接沿用侦察网标定的读数（R 值也一并搬过来）。

   `links` 是「图上连得起来」的那些：原文写了怎么走、或者同在一条动线上的才连
   （第 12 区到第 6 区那条就是主线上走过的那一条）。**没有连线不等于去不了** ——
   巴塞罗那、富士山底下、第 9 区那几处，原文都明写着要坐飞机、或者根本没有直达的路，
   图上就照实不连，只留「所在」那一枚能跳到它的大地理单元。
   ============================================================ */

/* ============================================================
   地理那一栏（2026-10-23 起 · 世界图有了底图）
   ------------------------------------------------------------
   世界层里**真在地表上**的那几处带 `geo`（经度 / 纬度，等距圆柱投影直接换成百分比）。
   浮空 / 地下 / 异次元**一律不塞 geo** —— 硬塞就会落到海里或陆地上一个错的位置：

     · `anchor`  浮空节点的**经度锚点**：只用来画一条竖直虚线，挂到它正下方那片地表，
                  不是它自己的位置（浮空都市本来就没有经纬度）；
     · 地下 / 异次元  世界图右下 / 左下两个插窗里列名，不占地图坐标；
     · `frame`  那一条是**整张图的归属**（樱次元 = 我们所在的这一个次元），不上图，
                只当标题旁那一行小字 —— 它既不是「另一个次元」，也不该和死灵次元并列。

   **依主人 2026-10-23 口径：三大学院都在天上**（苍之学园 / 卡乌斯学院 / 九灯学院）——
   苍之学园是白墙蓝顶的浮空校舍，卡乌斯学院与九灯学院同样，三个都进「浮空」那一层。
   而 `苍之学园地下 B-267 · 泰尔的研究所` 是**那座浮空学园自己的地下层**：它挂在
   苍之学园这一柱的正下方，不给 geo，也不进「地表以下」那一档的说法里（插窗里另注）。
   ============================================================ */

/** 经纬度：[经度, 纬度]。经度 -180~180、纬度 -90~90 */
export type GeoPoint = [number, number]

/** 节点 + 地理那两栏（types.ts 这一轮不动，所以在数据表这一侧扩） */
export interface MapNodeGeo extends MapNode {
  /** 经纬度 —— **只有真在地表上的节点才有** */
  geo?: GeoPoint
  /** 浮空节点的经度锚点：竖直虚线挂到它正下方的地表（不是它的位置） */
  anchor?: number
  /** 整张世界图的归属那一条（樱次元）—— 不上图，只当标题旁的小字 */
  frame?: boolean
  /** 异次元插窗里那句「经何处前往」 */
  via?: string
}

/** 分层的界面名 · 一句话讲清这一层在地图的哪一侧 */
export const MAP_LAYER_LABEL: Record<MapLayer, string> = {
  surface: '地表',
  underground: '地下',
  sky: '浮空',
  otherworld: '异次元',
}

export const MAP_LAYER_HINT: Record<MapLayer, string> = {
  surface: '脚踩得到的地方',
  underground: '原文写了深度的几处',
  sky: '浮空都市与浮空要塞',
  otherworld: '另一次元 / 画中的异界',
}

export const MAP_KIND_LABEL: Record<MapKind, string> = {
  district: '大区',
  site: '场所',
  room: '房间 · 街区',
}

/** 越细的层级越往上（同一次点名时，房间比大区更「就是这儿」） */
export const MAP_KIND_RANK: Record<MapKind, number> = { room: 3, site: 2, district: 1 }

export const MAP_NODES: MapNodeGeo[] = [
  /* ==================== 世界层 ==================== */
  {
    id: 'w-falktus',
    name: '天空都市・弗尔克图斯',
    scale: 'world', kind: 'district', layer: 'sky', parent: null,
    xy: [62, 44],
    anchor: 45,
    note: '浮在天空里的都市，第 3 / 6 / 9 / 12 / 13 区都铺在它的地面上。委员会与苍之学园都在这里。',
    refs: { events: ['v1-9'], offtext: 'v1-4' },
    links: ['w-laputa'],
  },
  {
    id: 'w-laputa',
    name: '天空要塞・拉普达',
    scale: 'world', kind: 'site', layer: 'sky', parent: 'w-falktus',
    xy: [76, 58],
    anchor: 68,
    note: '第 6 区远郊那片低 R 地带的上空。要塞周遭数千米纳克萨指数极低，观测要先拿到 12 羽以上的许可。',
    refs: { events: ['v2-8'], codex: ['laputa'], offtext: 'v2-8' },
    links: ['w-falktus'],
  },
  {
    id: 'w-japan',
    name: '日本 · 东京都 / 真鹤町',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [14, 58],
    geo: [139.7, 35.7],
    note: '心叶的出身地。东京防卫战与之后那一整段日常都落在这条线上（永田町 · 有乐町 · 上野 · 真鹤）。',
    refs: { events: ['v3-4', 'v5-1'], offtext: 'v3-4' },
    links: ['w-pacific'],
  },
  {
    id: 'w-pacific',
    name: '太平洋 · 公海',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [10, 26],
    geo: [-150, 20],
    note: '被弃货船漂着的那片海。心叶落海自救是这一整条故事的开头，也是黑之魔王立约的地方。',
    refs: { events: ['v1-1'], offtext: 'v1-1' },
    links: ['w-japan'],
  },
  {
    id: 'w-barcelona',
    name: '巴塞罗那',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [46, 66],
    geo: [2.2, 41.4],
    note: '脏器公寓所在的城市。卡乌斯学院放逐部队在这一带合流。',
    refs: { events: ['v1-5'], offtext: 'v1-5' },
    links: ['w-london'],
  },
  {
    id: 'w-london',
    name: '伦敦',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [44, 28],
    geo: [-0.1, 51.5],
    note: '去卡乌斯学院的换乘点（希思罗机场）。从苍之学园没有直达的路，得经新加坡再飞这里。',
    refs: { events: ['v4-3'], offtext: 'v4-3' },
    links: ['w-barcelona', 'w-newyork'],
  },
  {
    id: 'w-newyork',
    name: '纽约',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [30, 46],
    geo: [-74.0, 40.7],
    note: '第六卷的主战场。时代广场、餐厅与酒店、哥伦比亚大学都在这一片。',
    refs: { events: ['v6-4', 'v6-5'], offtext: 'v6-5' },
    links: ['w-london', 'w-gulf', 'w-zero'],
  },
  {
    id: 'w-gulf',
    name: '墨西哥湾',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [22, 70],
    geo: [-90, 25],
    note: '美国海军第四舰队展开战斗的那片海。圣帕特里克教堂那一路从这里接过去。',
    refs: { events: ['v6-6'], offtext: 'v6-6' },
    links: ['w-newyork'],
  },
  {
    id: 'w-arctic',
    name: '北极 · 精灵之国',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [58, 10],
    geo: [0, 80],
    note: '那位老夫说要带心叶回去的地方 —— 原文只提到名字与方位，没有更多描写。',
    refs: { events: ['v6-4'], offtext: 'v6-5' },
    links: ['w-falktus'],
  },
  {
    id: 'w-zero',
    name: '第零区 · 尸肉神殿',
    scale: 'world', kind: 'district', layer: 'underground', parent: null,
    xy: [34, 14],
    note: '决斗公告上写的地点：「地点为第零区的尸肉神殿」。那一场不许迟到，迟到即判败北。',
    refs: { events: ['v6-1'], offtext: 'v6-1' },
    links: ['w-newyork'],
  },
  {
    id: 'w-bonfire',
    name: '篝火之国',
    scale: 'world', kind: 'district', layer: 'otherworld', parent: null,
    xy: [84, 26],
    via: '借画家阿斯兰・霍尔巴特的那幅画进去',
    note: '画里的异界 —— 要进去得借画家阿斯兰・霍尔巴特的那幅画。王宫、蘑菇森林、巴别塔都在里面。',
    refs: { events: ['v4-5'], offtext: 'v4-5' },
    links: ['w-necro'],
  },
  {
    id: 'w-necro',
    name: '死灵次元',
    scale: 'world', kind: 'district', layer: 'otherworld', parent: null,
    xy: [90, 58],
    via: '它在樱次元的远端 —— 得先走到这个次元的边界上',
    note: '侦探协会的叫法：这个次元叫「樱次元」，而死灵次元位于它的远端。',
    refs: { events: ['v3-3'], offtext: 'v3-3' },
    links: ['w-bonfire', 'w-sakura'],
  },
  {
    id: 'w-sakura',
    name: '樱次元',
    scale: 'world', kind: 'district', layer: 'surface', parent: null,
    xy: [58, 78],
    /* 依主人 2026-10-23 口径：樱次元**就是我们所处的这一个世界**，不是与死灵次元并列的
       另一个次元 —— 巴塞罗那、伦敦、纽约、日本、太平洋与浮空的天都市、三大学院全在它里面。
       所以它不上图、也不进「异次元」插窗：只当整张世界图的那一行归属标注（frame）。 */
    frame: true,
    note: '「我们现在所处的这个次元，被称为『樱次元』。」—— 它不是别处，就是我们所处的这一个世界：地表那几处与浮空的天都市、三大学院全在它里面。',
    refs: { events: ['v3-3'], offtext: 'v3-3' },
    links: ['w-necro', 'w-falktus'],
  },
  {
    id: 'w-library',
    name: '书架曼荼罗',
    scale: 'world', kind: 'site', layer: 'otherworld', parent: null,
    xy: [76, 80],
    via: '第 22 区霍尔山脉的竖井一路下到地底人「蟹人」的国度，再穿过绯红森林',
    note: '无限图书馆的发源地。反现实组织都想啃下它，可连它自己也几乎一无所知。',
    refs: { events: ['v5-4'], offtext: 'v5-4' },
    links: ['w-sakura'],
  },

  /* ==================== 区域层 · 第 12 区 ==================== */
  {
    id: 'd12',
    name: '第 12 区 · 苍之学园一带',
    scale: 'region', kind: 'district', layer: 'surface', parent: 'w-falktus',
    xy: [14, 30],
    note: '委员会与学园都在这一区。西侧是本校舍与山道宿舍，东侧是旧集市与废屋街。',
    refs: { events: ['v1-3', 'v2-2'], offtext: 'v2-2' },
    links: ['d6', 'd13'],
  },
  {
    id: 's-school',
    name: '苍之学园 · 本校舍',
    scale: 'region', kind: 'site', layer: 'sky', parent: 'd12',
    xy: [26, 12],
    /* 依主人 2026-10-23 口径：**三大学院都在天上** —— 苍之学园是白墙蓝顶的浮空校舍。
       它没有经纬度（geo），只有一个经度锚点：世界图上那条竖直虚线挂在日本那一柱底下
       （原文里心叶是骑自行车上学的，学园就在他头顶那片天上）。 */
    anchor: 140,
    r: 1.008, threat: 0,
    note: '白墙蓝顶的浮空校舍。骑士团的木制面具与日常安静地共存，是这一带最稳的一处。',
    refs: { events: ['v1-3'], offtext: 'v1-3' },
    links: ['r-inquis', 'r-council', 's-dorm', 's-deep'],
  },
  {
    id: 'r-inquis',
    name: '异端审问室',
    scale: 'region', kind: 'room', layer: 'sky', parent: 's-school',
    xy: [16, 4],
    note: '纯白走廊尽头那扇门，黄铜铭牌上刻着天秤与四足怪物。露娜在这里受审，判决是即刻销毁。',
    refs: { events: ['v1-3', 'v3-3'], offtext: 'v1-3' },
    links: ['s-school'],
  },
  {
    id: 'r-council',
    name: '学生会室',
    scale: 'region', kind: 'room', layer: 'sky', parent: 's-school',
    xy: [36, 4],
    note: '艾莉芙会长那张大椅子所在的一间。世界观与「欢迎会」都是围着这张桌子讲开的。',
    refs: { events: ['v1-4'], offtext: 'v1-4' },
    links: ['s-school'],
  },
  {
    id: 'r-court',
    name: '恋兔宿舍',
    scale: 'region', kind: 'room', layer: 'sky', parent: 's-school',
    xy: [38, 18],
    note: '恋兔队的宿舍。客厅、厨房、恋兔光的房间都在这一栋里 —— 日常多半发生在这儿。',
    refs: { events: ['s1-1', 'v4-2'], offtext: 's1-1' },
    links: ['s-school', 's-dorm'],
  },
  {
    id: 's-dorm',
    name: '山道尽头 · 学生宿舍',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd12',
    xy: [4, 38],
    r: 0.985, threat: 0,
    note: '鸡舍与山羊正常，门口晾着某位副官的战斗服 —— 以及不知谁留下的狗爪印。',
    refs: { events: ['v1-4'], offtext: 'v1-4' },
    links: ['s-school', 's-market'],
  },
  {
    id: 's-market',
    name: '第 12 区 · 旧集市',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd12',
    xy: [16, 52],
    r: 0.964, threat: 1,
    note: '东侧早已无人光顾的集市。反现实旧物残留着轻微的「低语」，野狗在成排卷帘门前游荡。',
    refs: { events: ['v1-4', 'v3-2', 's1-7'], offtext: 'v1-4' },
    links: ['s-dorm', 's-ewd'],
  },
  {
    id: 's-ewd',
    name: '第 12 区 · 东侧废屋街',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd12',
    xy: [38, 40],
    r: 0.931, threat: 3,
    note: '铁皮屋顶的废屋与零星路灯。夜里偶有「不该存在的脚步声」折返，恋兔队已加派巡哨。',
    refs: { events: ['v1-4'], offtext: 'v1-4' },
    links: ['s-market', 'd6'],
  },
  {
    id: 's-deep',
    name: '第 12 区 · 深穴',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd12',
    xy: [28, 26],
    note: '学园的「深穴实习」就下在这里 —— 拿它训练弹痕的能力。再往下不是学园的地。',
    refs: { events: ['v2-2'], codex: ['deep-hole'], offtext: 'v2-2' },
    links: ['s-school', 's-lab'],
  },
  {
    id: 's-lab',
    name: '苍之学园地下 B-267 · 泰尔的研究所',
    /* 依主人 2026-10-23 口径：**苍之学园的研究所不还是在天上吗** —— 它是那座浮空学园
       自己的地下层，挂在苍之学园这一柱的正下方（父链 s-school → s-lab → r-labroom），
       不给 geo；世界图的地下图例里照旧列它，但注明「浮空学园地下」。 */
    scale: 'region', kind: 'site', layer: 'underground', parent: 's-school',
    xy: [52, 14],
    note: '电梯显示器上写着 B-267 —— 地下 267 层。成堆的泥塑面具在这里以坐标心声呼救。',
    refs: { events: ['v1-6'], offtext: 'v1-6' },
    links: ['s-deep', 'r-labroom'],
  },
  {
    id: 'r-labroom',
    name: '研究所 · 最深处',
    scale: 'region', kind: 'room', layer: 'underground', parent: 's-lab',
    xy: [62, 6],
    note: '回避丝绸小丑的残骸之后撞上的那一间。两个人在这儿互诉了此生最初的信任。',
    refs: { events: ['v1-6'], codex: ['silk-clown-residue'], offtext: 'v1-6' },
    links: ['s-lab'],
  },

  /* ==================== 区域层 · 第 13 区 ==================== */
  {
    id: 'd13',
    name: '第 13 区',
    scale: 'region', kind: 'district', layer: 'surface', parent: 'w-falktus',
    xy: [8, 72],
    note: '隐藏着骨之圣堂的那一区。原文只给了它一个区名与一座圣堂。',
    refs: { events: ['v4-1'], offtext: 'v4-1' },
    links: ['d12'],
  },
  {
    id: 's-bonehall',
    name: '骨之圣堂',
    scale: 'region', kind: 'site', layer: 'underground', parent: 'd13',
    xy: [4, 88],
    note: '以数万根骨头建造的圣堂，藏于第 13 区 —— 不在街面上，在下面。',
    refs: { events: ['v4-1'], offtext: 'v4-1' },
    links: ['d13'],
  },

  /* ==================== 区域层 · 第 6 区 ==================== */
  {
    id: 'd6',
    name: '第 6 区 · 娱乐枢纽',
    scale: 'region', kind: 'district', layer: 'surface', parent: 'w-falktus',
    xy: [72, 48],
    note: '高度都市化的一区：摩天大楼、高级酒店、赌场与竞技场都挤在这片。',
    refs: { events: ['v2-3', 'v2-4'], offtext: 'v2-3' },
    links: ['d12', 'd6w'],
  },
  {
    id: 's-workshop',
    name: '第 6 区 · 工房街',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd6',
    xy: [58, 56],
    r: 0.902, threat: 4,
    note: '境界领域商会的制品暗中流通的街区。反现实机械的嗡鸣比昨日更近，光明会已派员盯梢。',
    refs: { events: ['v2-9'], offtext: 'v2-3' },
    links: ['s-corp', 'd6w'],
  },
  {
    id: 's-arena',
    name: '第 6 区竞技场 · 体育馆',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd6',
    xy: [82, 64],
    note: '娱乐枢纽里那座竞技场。模拟装置那几段就架在这一带的场馆里。',
    refs: { events: ['v2-4'], offtext: 'v2-4' },
    links: ['s-corp'],
  },
  {
    id: 's-corp',
    name: 'Corporations',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd6',
    xy: [92, 70],
    note: '银河电车开到的那一片商社区。仓库改建的派对会场也在这里。',
    refs: { events: ['v2-3', 's1-6'], offtext: 's1-6' },
    links: ['s-workshop', 's-arena'],
  },
  {
    id: 's-temple',
    name: '女神神殿遗址',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd6',
    xy: [88, 28],
    r: 0.876, threat: 5,
    note: '第 6 区近郊。灵魂蓄积器TM 被讨伐后的清点区 —— 被砸成碎屑的「女神」脚下仍有细碎反现实在聚拢。',
    refs: { events: ['v1-2'], codex: ['soul-reservoir'], offtext: 'v1-2' },
    links: ['d6'],
  },
  {
    id: 'd6w',
    name: '第 6 区远郊 · 低 R 荒野',
    scale: 'region', kind: 'district', layer: 'surface', parent: 'w-falktus',
    xy: [60, 82],
    note: '出了都市圈就是荒野。纳克萨指数极低，天空要塞拉普达就浮在这片地上头。',
    refs: { events: ['v2-8'], offtext: 'v2-8' },
    links: ['d6'],
  },
  {
    id: 's-outskirt',
    name: '第 12 区郊外荒野',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'd12',
    xy: [46, 92],
    note: '郊外那片没有街灯的荒野。第六卷开篇的决斗公告就是在这儿落进手里的。',
    refs: { events: ['v6-1'], offtext: 'v6-1' },
    links: ['d12'],
  },

  /* ==================== 区域层 · 第 9 区 ==================== */
  {
    id: 'd9',
    name: '第 9 区 · 卡乌斯学院一带',
    scale: 'region', kind: 'district', layer: 'surface', parent: 'w-falktus',
    xy: [78, 8],
    note: '卡乌斯学院所在的区。从苍之学园过去没有直达的路，要先经新加坡再飞伦敦。',
    refs: { events: ['v4-3'], offtext: 'v4-3' },
    links: [],
  },
  {
    id: 's-kawasu',
    name: '卡乌斯学院 · 礼拜堂与琉米爱尔公馆',
    scale: 'region', kind: 'site', layer: 'sky', parent: 'd9',
    xy: [92, 12],
    /* 三大学院之二：也在天上。锚点挂在欧洲那一柱（去卡乌斯要先飞希思罗换乘）。 */
    anchor: 2,
    note: '卡乌斯学院的礼拜堂，与艾梅・库尔・杜・琉米爱尔的那座公馆。第 9 区的大圣堂也在这一片。',
    refs: { events: ['v4-4'], offtext: 'v4-4' },
    links: ['d9'],
  },

  /* ==================== 区域层 · 第 21 区 ==================== */
  {
    id: 's-kyuhto',
    name: '九灯学院 · 第 21 区',
    /* 三大学院之三，依主人 2026-10-23 口径同样在天上。
       原文里它立在沙漠的正中央（「沙漠的正中央，居然有这么气派的城市啊」），
       从苍之学园过去是一趟长途；艾美莉亚与凯特琳在这里办学，也是去书架曼荼罗的出发点。
       表里原先没有它 —— 这一枚是世界地图这一轮补的（口径：三大学院都在天上）。 */
    scale: 'region', kind: 'site', layer: 'sky', parent: null,
    xy: [86, 92],
    anchor: 90,
    note: '第 21 区新设的学园，招牌上写着「连结宇宙的学园」。沙漠正中央的一座新城 —— 艾美莉亚与凯特琳联手建起，是去书架曼荼罗的出发点。',
    refs: { events: ['v5-1'], offtext: 'v5-1' },
    links: [],
  },

  /* ==================== 区域层 · 地下与异界 ==================== */
  {
    id: 's-asama',
    name: '浅间神社 · 富士山地下 300 米',
    scale: 'region', kind: 'site', layer: 'underground', parent: 'w-japan',
    xy: [56, 34],
    note: '巨大树根围出的圆顶，直径数百米；庄严却小巧的神社浮在浅浅的地底湖面上。',
    refs: { events: ['v3-8'], offtext: 'v3-8' },
    links: [],
  },
  {
    id: 's-apt',
    name: '脏器公寓 No.819',
    scale: 'region', kind: 'site', layer: 'surface', parent: 'w-barcelona',
    xy: [94, 46],
    note: '巴塞罗那郊外的「圣路西亚公馆」。这是地点：以人类为容器豢养终末的仪式灾害，不是怪物本身。',
    refs: { events: ['v1-5'], codex: ['organ-apt'], offtext: 'v1-5' },
    links: [],
  },
  {
    id: 's-mush',
    name: '篝火之国 · 蘑菇森林',
    scale: 'region', kind: 'site', layer: 'otherworld', parent: 'w-bonfire',
    xy: [28, 62],
    note: '几百米范围内长满巨型蘑菇的森林。穿过它就看见篝火之国的城墙了。',
    refs: { events: ['v4-5'], offtext: 'v4-5' },
    links: ['s-palace'],
  },
  {
    id: 's-palace',
    name: '篝火之国 · 王宫',
    scale: 'region', kind: 'site', layer: 'otherworld', parent: 'w-bonfire',
    xy: [40, 72],
    note: '火之仪式的东道主所在。王宫底下那段台阶通到祭祀场，得往下走几百米。',
    refs: { events: ['v4-6'], offtext: 'v4-6' },
    links: ['s-mush', 's-babel', 'r-trial'],
  },
  {
    id: 'r-trial',
    name: '王宫地下祭祀场',
    scale: 'region', kind: 'room', layer: 'underground', parent: 's-palace',
    xy: [30, 84],
    note: '沿着王宫地下延伸下去的台阶走到头就是。原文那句「这里可是地下几百米啊」。',
    refs: { events: ['v4-7'], offtext: 'v4-7' },
    links: ['s-palace'],
  },
  {
    id: 's-babel',
    name: '篝火之国 · 巴别塔',
    scale: 'region', kind: 'site', layer: 'otherworld', parent: 'w-bonfire',
    xy: [50, 66],
    note: '「『巴别塔』，就在前方。」—— 这一段是往塔顶去的，塔顶就是这一卷的收场。',
    refs: { events: ['v4-8'], offtext: 'v4-8' },
    links: ['s-palace'],
  },
]

/** 按 id 取节点（没有则 null） */
export function mapNodeById(id: string): MapNodeGeo | null {
  return MAP_NODES.find((n) => n.id === id) ?? null
}

/** 某一档上的全部节点（世界 / 区域） */
export function mapNodesOf(scale: MapNode['scale']): MapNodeGeo[] {
  return MAP_NODES.filter((n) => n.scale === scale)
}

/** 某个节点的下级（parent 指过来的那些） */
export function mapChildrenOf(id: string): MapNodeGeo[] {
  return MAP_NODES.filter((n) => n.parent === id)
}

/**
 * 往上追到世界层那一个（区域节点 → 它所在的大地理单元）。
 * 世界层节点自己就是答案；追不到返回 null（不硬塞一个「未知地带」）。
 */
export function worldNodeOf(node: MapNode | null): MapNodeGeo | null {
  let cur = node
  for (let i = 0; cur && i < 8; i++) {
    if (cur.scale === 'world') return cur
    cur = cur.parent ? mapNodeById(cur.parent) : null
  }
  return null
}

/** 名字里那些能拿来认路的片段（「苍之学园 · 本校舍」→ 苍之学园 / 本校舍） */
function nameParts(name: string): string[] {
  return name.split(/[·・/／、]/).map((s) => s.trim()).filter((s) => s.length >= 2)
}

/**
 * 当前位置 → 地图上那一格。
 *
 * 三道，从硬到软：
 *   ① 名字逐字相同（导演把地点改写成图上的名字时走这条）；
 *   ② 当前段的 id 落在某节点的 refs.events 里 —— 最可靠的一种，
 *      同一段点上好几处时取**最细的那一层**（房间 > 场所 > 大区）；
 *   ③ 地点串里含节点名的某一段（「第12区集市」认得出「旧集市」那条：按最长的片段算）。
 * 认不出就返回 null —— 界面照实读「不在图上」，不硬指一个地方。
 */
export function mapNodeOfPlace(place: string, eventId?: string): MapNodeGeo | null {
  const s = (place || '').trim()
  if (s) {
    const exact = MAP_NODES.find((n) => n.name === s)
    if (exact) return exact
  }
  if (eventId) {
    const hit = MAP_NODES
      .filter((n) => n.refs.events?.includes(eventId))
      .sort((a, b) => MAP_KIND_RANK[b.kind] - MAP_KIND_RANK[a.kind])
    if (hit[0]) return hit[0]
  }
  if (!s) return null
  let best: { n: MapNode; len: number } | null = null
  for (const n of MAP_NODES) {
    for (const part of nameParts(n.name)) {
      if (!s.includes(part)) continue
      if (!best || part.length > best.len
        || (part.length === best.len && MAP_KIND_RANK[n.kind] > MAP_KIND_RANK[best.n.kind])) {
        best = { n, len: part.length }
      }
    }
  }
  return best ? best.n : null
}

/** 图上要画的那些线（去重、只留两头都在这一档里的） */
export function mapEdgesOf(scale: MapNode['scale']): Array<[MapNode, MapNode]> {
  const mine = new Map(mapNodesOf(scale).map((n) => [n.id, n]))
  const seen = new Set<string>()
  const out: Array<[MapNode, MapNode]> = []
  for (const n of mine.values()) {
    for (const to of n.links) {
      const other = mine.get(to)
      if (!other) continue
      const key = n.id < to ? n.id + '|' + to : to + '|' + n.id
      if (seen.has(key)) continue
      seen.add(key)
      out.push([n, other])
    }
  }
  return out
}
