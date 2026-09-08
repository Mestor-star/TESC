# ST 宿主集成 — 刺探结论（ST-1，真机 SillyTavern 1.18.0 源码核实）

来源：C:\ai\SillyTavern（package.json:118 = 1.18.0）+ 实装 d.ts + 源码调用链。
本文件是「驱动酒馆自身对话」习语与宿主事实的唯一权威速查。

## 1) 扩展 JS 环境

- 扩展目录 `data/<user>/extensions/<folder>/`；服务端 `/scripts/extensions/third-party/<folder>/*`。
- manifest `js` 以 **ESM module script** 注入酒馆主 DOM（`addExtensionScript`），非 classic、非 iframe。
- 模块作用域可见：`globalThis.SillyTavern = { libs, getContext }`（script.js:292）。yuzuki 式
  `typeof SillyTavern!=='undefined' && SillyTavern.getContext()` 探测正确。
- 也可用 URL 相对 `import` 拿 ST 内部模块（官方 data 扩展惯用法，如 `../../../../../script.js`）——
  但**本卡不打算依赖**（太脆），能走 getContext + DOM 就不 import。
- 执行时机在 `getSettings()` → `activateExtensions()` 内，早于 `APP_INITIALIZED`/`APP_READY`。
  需要完整 app 的事先 `eventSource.on(event_types.APP_READY, …)`。
- 启用 = 目录存在 + manifest 合法 js + `extension_settings.disabledExtensions` 不含 `third-party/<folder>`
  + `config.yaml extensions.enabled: true`（本机已 true）。无需点扩展菜单开关。

## 2) 驱动一次「普通」生成的习语（本卡 stDrive.plot 唯一依赖）

`context.generate` 即 `Generate`（script.js:4231）。`type:'normal'` 语义：
- **它读发送框**（`#send_textarea` 值，4340-4344），非空则先投成一条用户消息（4389-4399）。
- 所以"干净的用户回合 = 把操作员文本写进 `#send_textarea`，再 `await context.generate('normal')`"，
  generate 内部负责 投递用户消息 + 用当前角色/预设/世界书构造 prompt + 生成 + `saveReply` 存档。
- **await 在回复已 push 存档后 resolve**（5473/5523），返回值即助手文本
  （stream/非 stream 皆 String(value) 可得正文）。随后读 `context.chat[context.chat.length-1].mes` 兜底。
- `regenerate|swipe|quiet|impersonate|continue` 作用于末条，不用。
- 完成信号：`GENERATION_STARTED`(23，脚本名 genStarted) → `GENERATION_ENDED`(25) 仅由 stop 路径发。
  **最稳 = await generate 本身**；push 风格可 `eventSource.on(MESSAGE_RECEIVED, (id,type)=>chat[id])`。
- `addOneMessage(mes)` **不 push chat**（调用方先 push，script.js:2493）。不能当作"投用户回合"。
- `/send` 只投用户消息不生成；`/gen` 走 raw pipe 不入 chat；`/go` 只是打开聊天。都不是"发送并生成"。
- 官扩范式（Quick Reply）：写 `#send_textarea.value` → `#send_but`.click() → sendTextareaMessage → Generate。
  我们走 setValue+context.generate，效果等价且可 await 读回。

聊天消息形：`{ name, mes, is_user, is_system, ... }`（文本在 `mes`；角色靠布尔，非 role 串；global.d.ts:66）。

## 3) 会话锚点 / 聊天

- `characters` = 内存角色表；`characterId`(this_chid) = 当前选中角色索引对应 id；`chat` = 实时消息数组（getContext 同一引用）。
- `selectCharacterById(id)` 选中并 getChat()；`openCharacterChat(file)` 需已选中该角色；`doNewChat` 建新聊天。
- 新聊天非空：文件空时自动塞入角色问候语（getFirstMessage）。
- **剧情推进在线 = 驱动"当前打开的角色/聊天"**（玩家已在酒馆选好）；Settings 可提示去酒馆选角，不擅自换角。
- 反向剧透取舍：宿主态 canon 世界书按酒馆激活配置走，我们不再自建反剧透闸门（那是独立态行为）。
  导演大纲/回执格式经 `setExtensionPrompt` 并入（不覆写 preset）。

## 4) 世界书（仅可选落书用）

- `context.loadWorldInfo(name)` POST 读；`saveWorldInfo(name,data,immediately)` 写（debounce）。
- 落书为**可选**（默认关），以免污染玩家词条库；生成时酒馆自动应用当前角色激活书，无需我们喂。

## 5) 本卡存储

- 宿主态与酒馆同源：localStorage `zts-*` / Dexie `zts-lore`/`zts-terminal-store` 落在酒馆 origin。
  独立态(5174)另起。`crypto.randomUUID` 需 secure context：localhost 满足；局域网 IP 需降级。

## ST-5b onboarding（已实现，2026-09-08 冒烟 H14–H17 绿）

- 实现：`src/st/onboard.ts`（体检 anchorState + 一键就绪 makeAnchor/pickAnchor/freshChat），
  UI 在 Settings 的「酒馆宿主模式」横幅（推演锚点三步 chip：角色/对话/发送框；就绪语义与 hostDriveState 同门）。
- 用到的公开 getContext API（st-context.js 实装核实）：`selectCharacterById(id, { switchMenu:false })`
  选中角色并 getChat（chat 空且角色有 first_mes 时 getChatResult 自动种问候语，public/script.js:7629）；
  `/newchat` 走 `executeSlashCommandsWithOptions`（doNewChat，power-user.js:4115，默认 delete=false 旧对话存档不删）。
- `this_chid`/`characterId` = **字符串化索引**（"0" 起），undefined=未选（setCharacterId，script.js:7063）——
  门禁用 truthiness 即可（"0" 为真，勿用 `>0`）。
- 边界：酒馆无官方公开「建角色」API → 不自动造角；角色表为空时明确引导去酒馆导入/新建，README 兜底。
