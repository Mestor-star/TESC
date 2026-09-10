# public/charimg/ · 角色素材清单

把图按下面的名字丢进这个目录，终端**立刻点亮**，不用改任何代码。
没放的槽位继续显示「主题色底 + 纹章」占位，所以**放一张亮一张**，也不存在缺图报错。

> 本文件与同目录的图片均随仓库分发。

## 命名规则

| 文件名 | 用途 | 构图 |
| --- | --- | --- |
| `<id>.webp` / `<id>.png` | **立绘** —— 档案页大图、剧情区人物框 | 竖构图整身 |
| `<id>-face.webp` / `<id>-face.png` | **头像** —— 小圆头像、行动表、连携弹窗 | 方构图，脸居中偏上 |

- 扩展名按 `webp` → `png` → `jpg` 依次试，三种都认，备一种即可（webp 体积约为 png 的 1/3）。
- **jpg 只作兜底**：它没有透明通道，透明区会露出组件自带的深色底。立绘想干净就用 webp / png。
- **只放立绘也行**：小圆头像位会自动退回用立绘，并按 `object-position: center 20%` 把取景拉向脸部（见 `src/lib/charimg.ts` 的 `FACE_FOCUS`）。觉得切得不理想，再补 `<id>-face` 那张。
- 取图顺序：`<id>-face` → `<id>` → 别名，逐个 404 顺延；全 404 才回退纹章。

## 建议规格

| 槽位 | 显示尺寸 | 出图建议 |
| --- | --- | --- |
| 小头像（行动表 / 名录 / 连携 / 引导） | 28 / 46 / 52 / 54 px | `-face` **256×256** 方图足够（2× 屏也锐） |
| 剧情区人物框 | 64 px × 框高（竖长条） | 立绘即可，会按上重心裁 |
| 档案页大立绘 | 132×188，`contain` 完整可见 | 立绘 **竖构图，高 800px 上下**封顶 |

透明底优先（立绘背后是该角色的主题色渐变，透出来更好看）。单张压在 **200 KB** 以内，档案页一次要列 24 人。

批量处理参考（ImageMagick）：

```bash
# 立绘：高度封顶 800，转 webp
magick mogrify -resize x800 -format webp -quality 82 *.png

# 头像：从立绘顶部切一张 256 方图（脸在最上时正好）
magick hikari.png -resize 256x256^ -gravity north -extent 256x256 hikari-face.webp
```

## 槽位清单（id 即文件名）

档名 = 下表 `id`。名称供你对照出图，**改了不生效**（终端按 id 找图）。

### 苍之学园 · 恋兔队

| id | 名称 |
| --- | --- |
| `hikari` | 恋兔光 |
| `luna` | 露娜 |
| `mefisa` | 梅芙莉莎・简别科娃 |
| `nyau` | 小柴喵呜 |
| `youshihan` | 吴诗涵 |
| `alive-anatolia` | 艾莉芙・安纳托利亚 |
| `vern-simon` | 弗恩・西蒙 |
| `xiaochai-lin` | 小柴琳 |

### 卡乌斯学院

| id | 名称 |
| --- | --- |
| `danae-whitmore` | 达娜厄・惠特摩尔 |
| `nana-kamiru` | 神流奈奈 |
| `reiya` | 蕾雅·库尔·杜·琉米爱尔 |
| `emei` | 艾梅·库尔·杜·琉米爱尔 |
| `isis-halid` | 伊西斯·哈利德 |

### Corporations

| id | 名称 |
| --- | --- |
| `katherine` | 凯特琳·安·奥斯汀 |
| `alex-cave` | 亚历克斯·凯夫 |
| `phidra` | 菲德拉·雷诺兹 |
| `maria` | 玛丽娅 |
| `merwen-gray` | 梅尔文·格蕾 |
| `ameria` | 艾美莉亚·玛克比尔 |

### 学园外 · 其它

| id | 名称 |
| --- | --- |
| `kuro-no-maou` | 黑之魔王 |
| `yiregel` | 伊=雷格 |
| `touyi-caojiro` | 东夷草次郎 |
| `huda-nayume` | 胡道乃梦 |
| `yuina-yoshito` | 勇鱼义人 |

### 操作员

| id | 名称 |
| --- | --- |
| `operator` | 言万心叶（操作员本人） |

一个 id 可用的备用异名（找不到主名时顺延）写在 `src/lib/charimg.ts` 的 `ALIASES` 里，目前只给 `operator` 配了 `yanwan-xinye` / `yanwan` / `yan-wan-xinye`。

## 小抄

- **改了图不生效？** `public/` 下的文件不带哈希，浏览器可能吃旧缓存 —— `Ctrl+F5`，或换个文件名。
- **控制台一堆 404？** 那是候选链在逐个试（`webp` → `png` → `jpg` → 别名）。只备一种扩展名时想消掉，把它挪到 `src/lib/charimg.ts` 的 `EXTS` 最前面即可。
- **想连 `-face` 也不用切**：单张立绘 + `FACE_FOCUS` 已能让圆头像取到脸；`-face` 是锦上添花。
