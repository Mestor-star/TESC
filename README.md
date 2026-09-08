# 停滞观测终端 · 终末停滞委员会

> 「在终末逼近的日常里，做出选择、守护羁绊。」
> 一张基于《这里是，终末停滞委员会。》轻小说世界观（1–6 卷 + 外传 S1）的交互剧情前端壳：
> 独立运行的网页应用，本地直连你自选的 OpenAI 兼容接口来推演主线；也可离线通读每段原文。

本仓库是**可运行源码**。密钥由你在终端设置里运行时填入，只存本机浏览器
（IndexedDB），不入代码、不入存档、不随仓库分发。

---

## 它是什么

- 一套「停滞观测终端」风格的游玩壳。剧情按**事件卡**组织（`剧情推进` 视图），
  可两种方式推进一条主线：
  - **在线推演**：在设置里为主线与角色短信各配一路「OpenAI 兼容」接口
    （官方、one-api/new-api 之类中继、本地 vLLM / Ollama 网关皆可），
    你写动作 → AI 以「导演 + 在场角色」回执 → 回执里的结构化指令被自动解析落地
    （事件收束、记录流、解锁档案、羁绊变化、图鉴登记…）。
  - **离线通读**：未配通道时，按当前事件逐段直读小说原文切片（`public/offtext/*.txt`），
    读毕点归档写入记录并推进——进度不卡。
- 角色档案（全员 25 人统一名册）、终末图鉴（动态登记）、武装图鉴、任务简报、词条库
  （Dexie 本地，支持 SillyTavern 世界书 JSON 的导入导出）等均为纯本地功能。

## 视图（按终端内导航）

终端总览 · 剧情推进 · 低语者日志（记录流）· 智库（词条库）· 武装图鉴 · 角色档案 ·
任务简报 · 通讯终端 · 终末图鉴 · 短信 · 终端设置。

## 数据与隐私

- 会话记录 / 进度 / 词条库只存**你的浏览器**（`localStorage zts-*`、IndexedDB
  `zts-lore` / `zts-terminal-store`），不上传任何服务器。
- 接口密钥（`api:main` / `api:sms`）经 IndexedDB 本地保存，绝不写进代码或任何明文文件；
  可随时在各通道卡片「清除密钥」，也可导出不含密钥的词条库备份与通道「方案」。
- 在线推演时，你的发言会发送给你自填的接口地址，请勿在其中输入真实账号密码。

## 从源码跑

要求 Node 20.19+ / 22.12+（Vite 8 的引擎下限）。npm 源可自选（国内可
`npm i --registry=https://registry.npmmirror.com`）。

```bash
npm ci
npm run dev     # http://localhost:5174
npm run build   # 产物 dist/
npm run preview
node scripts/smoke/smoke.mjs   # 全链路冒烟（离线通读 / 旧档回填 / 在线推演+指令落地 / 短信 clamp …）
```

## 剧情内容 = 数据文件

剧情内容与代码分离，组织为仓库内数据文件，便于维护与再分发：

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 离线通读原文 | `public/offtext/*.txt` | 每段原文纯文本（构建期由 `.canon` 语料切出） |
| 词条库 canon 种子 | `src/data/…` | 首次进剧情推进自动播种，可清空重建 |
| 事件/卷结构 | `src/data/…` | 事件 id（v1-x / s1-x / v2…）与卷推进 |

## 冒烟与质量门

```bash
npx tsc -b     # 类型全绿
npm run build  # 独立态产物
node scripts/smoke/smoke.mjs   # Phase A–F1（独立态）全 PASS
```

## 目录速览

```
public/offtext/   离线原文数据（剧情内容）
scripts/          slice_events / parts 清单 / smoke
src/views/        Plot/Saga/Lore/Arms/Archive/Missions/Comms/Codex/Tavern/Settings…
src/lib/          api（双通道直连）· plot（指令解析）· lorestore/tavernlike（词条库）
vite.config.ts    产物线（index.html → dist/）
```
