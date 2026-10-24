# public/map · 世界图底图

## 文件

| 文件 | 是什么 | 许可 |
| --- | --- | --- |
| `world-location-map.svg` | 空白世界地图（等距圆柱投影，带国界），800×400，168 条 path | **公共领域（Public domain）** |

## 来源

- 原文件：[File:World location map.svg](https://commons.wikimedia.org/wiki/File:World_location_map.svg)（Wikimedia Commons）
- 下载地址：<https://upload.wikimedia.org/wikipedia/commons/a/ac/World_location_map.svg>
- 作者：**STyx**（Commons 用户页 <https://commons.wikimedia.org/wiki/User:STyx>）
- 许可：**Public domain**（Commons 模板 `PD-self`，作者主动放弃全部权利 ——
  页面回执是 `LicenseShortName: Public domain` / `License: pd` / `Copyrighted: False` /
  `AttributionRequired: false`）
- 取用日期：2026-10-23
- 许可核验方式（可复查）：

  ```
  https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo
    &iiprop=url|extmetadata&titles=File:World_location_map.svg
  ```

## 用在哪

`src/views/Map.tsx` 的世界图（第一层）：底图**整张铺在球心那一条 2:1 的带子里**
（`.base`：`left:0; top:25%; width:100%; height:50%`），球壳只是包装（圆框 + 高光 + 边缘暗角），
**不裁地图、不做投影变形**。地表节点的经纬按 `x = (lon+180)/360`、`y = (90-lat)/180`
线性换算到同一个矩形里，所以点和陆地对得严丝合缝。

## 改图时注意

- 换底图必须仍是**等距圆柱投影（-180~180 / -90~90，整幅 2:1）**；换投影就要同时改
  `Map.tsx` 里那两行换算（`lonPct` / `latPct`），并把新来源的许可记录补在这张 README 里。
- 换图请把新文件的来源、许可、核验方式一并写在这里 —— **查不到许可的图一律不用**。
- 底图自带两色 `#C6ECFF`（海）/ `#FEFEE9`（陆）+ `#646464` 边线；页面侧只用 CSS 滤镜
  （`saturate(.55)`）压淡，不改文件本身。
