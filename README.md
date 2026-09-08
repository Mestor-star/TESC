# 停滞观测终端 · 终末停滞委员会

> 「在终末逼近的日常里，做出选择、守护羁绊。」
> 一张**世界观/剧情卡的前端壳**：主要形态是 SillyTavern 网页扩展，
> 让玩家用自己的预设与世界书，在酒馆里把这条主线一处处推演下去。

本仓库既是**可运行源码**，也产出**开箱即用的扩展发布物**（`release/`，zip 直装）。
发布物不含任何接口密钥，也不收集密钥。

---

## 它是什么 / 不是什么

- 是：一张「停滞观测终端」世界观卡的**游玩壳**。剧情按**事件卡**组织（`剧情推进` 视图），
  回合制地在线推演：玩家写动作 → AI 以「导演 + 在场角色」回执 → 回执里的结构化指令
  （`<vars>`）被自动解析并落地（事件收束、记录流、解锁档案、羁绊、图鉴…）。
- 宿主态（作为 ST 扩展运行）：在线推演**驱动酒馆当前锚点角色的对话**由 AI 生成，
  你的预设 / 已激活世界书 / 角色卡**全部照常生效**——不内置假引擎，也不偷走你的 key。
- 独立态（`npm run dev` / GitHub Pages 演示）：无酒馆宿主时，在线推演走「直连通道」
  （在终端设置里自填接口与密钥），离线原文通读 / 词条库等照常。
- 不是：一个把你圈死在站内的内嵌酒馆。

## 视图（按终端内导航）

终端总览 · 剧情推进 · 低语者日志（记录流）· 智库（词条库）· 武装图鉴 · 角色档案 ·
任务简报 · 通讯终端 · 终末图鉴 · 短信 · 终端设置。

---

## 给玩家：安装到 SillyTavern

前置：**SillyTavern 1.18+**，并已在酒馆里配好**至少一个 AI 后端**。
发布物（zip）里那份 `INSTALL.md` 就是给玩家的步骤，核心如下：

1. 把 `zts-terminal/` 整个目录放进酒馆扩展目录，最终为：
   `data/<用户>/extensions/zts-terminal/`（内含 `manifest.json`、`index.js`…）。
2. 刷新酒馆页面；扩展管理里确认「终末停滞委员会 · 停滞观测终端」已加载。
3. 右下角浮动按钮 **停滞观测终端 进入** → 长按指纹认证 → 剧情推进 → 在线推演。
4. 首次若提示无锚点：终端设置里点 **一键就绪**（自动取你现有某角色当推演锚点并接通对话），
   或下拉指定角色 / 另起一段新对话。酒馆一个角色都没有时，先回酒馆建/导入一张角色卡。

数据与隐私：
- 卡内记录/进度/词条库存酒馆同源浏览器（`localStorage zts-*`、IndexedDB `zts-lore`/`zts-terminal-store`）。
- 密钥只在你自己的酒馆/浏览器里，本卡不读不写不传；备份导出不含密钥。

## 给作者：从源码跑

要求 Node 20.19+ / 22.12+（Vite 8 的引擎下限）。npm 源可自选（国内可 `npm i --registry=https://registry.npmmirror.com`）。

```bash
npm ci
npm run dev          # 独立态（无酒馆宿主）：http://localhost:5174
npm run build        # 独立态产物 dist/
npm run st:dist      # 构建 ST 扩展产物 → release/zts-terminal/ + manifest
npm run st:install   # 复制进本机酒馆 data/<user>/extensions/（ST_DIR 可覆盖 data 路径）
npm run st:package   # 打发布 zip → release/zts-terminal.zip
node scripts/smoke/smoke.mjs   # 全链路冒烟（独立态 A–F + 宿主桩 H）
```

> 说明：`st:install` 默认目标 `C:/ai/SillyTavern/data/default-user`，可 `ST_DIR=...` 覆盖。

## 剧情内容 = 可分发数据文件

剧情内容与代码分离、以**数据文件**组织在仓库内并随发布物分发，方便后续用脚本/工具对接：

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 离线通读原文 | `public/offtext/*.txt` + `offtext/index.json` | 每段原文纯文本，随构建拷进扩展 `offtext/` |
| 词条库 canon 种子 | `src/data/…` + 运行期由 canon 生成 | 首次进剧情推进自动播种，可清空重建 |
| 事件/卷结构 | `src/data/…` | 事件 id（v1-x / s1-x / v2…）与卷推进 |
| 安装说明（随包） | `docs/INSTALL-ST.md` → 扩展内 `INSTALL.md` | 玩家安装手册 |

## 冒烟与质量门

```bash
npx tsc -b            # 类型全绿
npm run build         # 独立态产物
npm run st:build      # ST 扩展产物
node scripts/smoke/smoke.mjs   # 独立态 Phase A–F + 宿主桩 Phase H（含 onboarding）
```

发布物安全由 `st-manifest` 内置检查兜底：扩展目录里若出现形如 `sk-xxxx…` 的真实密钥串
或 `.env` 文件会直接失败，防止把 key 打进 zip。

## 目录速览

```
public/offtext/   离线原文数据（剧情内容）
scripts/          st-manifest / install-st / zip-st / smoke 宿主桩
src/st/           ST 宿主层：host 探测 · drive（direct/st 双通道）· entry（closed-shadow 壳）· onboard
src/views/        Plot/Saga/Lore/Arms/Archive/Missions/Comms/Codex/Tavern/Settings…
vite.config.ts    独立态产物线（index.html → dist/）
vite.st.config.ts ST 扩展产物线（entry.tsx → release/zts-terminal/）
```
