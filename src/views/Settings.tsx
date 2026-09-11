import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowClockwise, CaretDown, CaretRight, ChatsCircle, ClockCounterClockwise, Copy, Database, DownloadSimple, Eye, EyeSlash, FloppyDisk, Play, SlidersHorizontal, SpeakerHigh, Sparkle, Trash, UploadSimple, WarningOctagon, Wrench } from '@phosphor-icons/react'
import { aiLogVersion, clearAiLogs, listAiLogs, logLine, subscribeAiLog } from '../lib/ailog'
import type { AiLogRecord } from '../lib/ailog'
import PresetManager from './PresetManager'
import type { PresetEntry } from '../lib/preset'

import { useTerminal } from '../terminal/Terminal'
import { clampBudget, DEFAULT_BUDGET, MAX_BUDGET, MIN_BUDGET } from '../lib/budget'
import type { AiChannel, ApiSettings } from '../lib/api'
import { API_DEFAULTS, chatCompletion, isReady, listModels, readProfiles, saveProfile } from '../lib/api'
import * as lore from '../lib/lorestore'
import { applySchemeTo, captureFrom, listSchemes, parseChatPreset, parseSchemeFile, patchScheme, readJsonFile, storeSchemes } from '../lib/schemes'
import { ensureBudgetFloor, ensureBuiltinPresets } from '../lib/builtin-presets'
import { activePresetId } from '../lib/preset'
import type { Scheme, SchemePart } from '../lib/schemes'
import { exportToJson } from '../lib/tavernlike/importer'
import type { MultiImportInput } from '../lib/tavernlike/importer'
import type { SillyTavernLorebookExport } from '../lib/tavernlike/types'
import { AUDIO_DEFAULTS, setAudio, setBeds, sfx, useAudioSettings } from '../lib/audio'

import css from './Settings.module.css'

/**
 * 声音。
 * 三个滑块管的是总音量 / 背景音 / 音效；底噪与音效全部现场合成，不占存储。
 * 设置只落在本终端，不随存档走。
 */
function AudioPanel() {
  const a = useAudioSettings()
  const rows: Array<{ k: 'master' | 'music' | 'sfx'; cn: string; en: string; note: string }> = [
    { k: 'master', cn: '主音量', en: 'MASTER', note: '总开关 · 静音时归零但下方两个值原样保留' },
    { k: 'music', cn: '背景音', en: 'MUSIC', note: '各模块各有自己的一段底噪，换页即换' },
    { k: 'sfx', cn: '音效', en: 'SFX', note: '按钮、讯息推送与作战演出' },
  ]
  return (
    <section className="panel" style={{ marginBottom: 16 }} data-audio-panel>
      <div className="panel__head">
        <span className="panel__title"><SpeakerHigh size={15} weight="bold" /> 声音</span>
        <span className="muted tiny" style={{ marginLeft: 'auto' }}>AUDIO / LOCAL</span>
      </div>
      <div className="panel__body" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className={css.note}>
          <b>底噪与音效都是现场合成的，不占存储。</b><br />
          设置只落在本终端（键名 zts-audio:v1）。切到别的标签页时总音量会自动压下去，回来再抬起来。
          浏览器不许没有操作就出声 —— 所以按下第一个按钮之后才会有动静。
        </div>
        {/* 底噪是「要不要」的一档，不是音量的一档：默认关着，想听才开 */}
        <label className={css.bedSw} data-audio-bed>
          <button
            type="button"
            role="switch"
            aria-checked={a.beds}
            className={`btn ${a.beds ? '' : 'btn--ghost'}`}
            style={{ fontSize: 12 }}
            onClick={() => setBeds(!a.beds)}
          >
            {a.beds ? '底噪：开' : '底噪：关'}
          </button>
          <span className="tiny muted">
            各模块那段会自己走的垫乐。默认是关的 —— 不替你做主要不要听音乐。
            关掉它，音效（按钮、作战演出）不受影响。
          </span>
        </label>
        <div className={css.volGrid}>
          {rows.map((r) => (
            <label key={r.k} className={css.vol} data-audio-slider={r.k}>
              <span className={css.volTop}>
                <b>{r.cn}</b>
                <i className="tiny muted">{r.en}</i>
                <span className="num">{Math.round(a[r.k] * 100)}</span>
              </span>
              <input
                type="range" min={0} max={100} step={1}
                value={Math.round(a[r.k] * 100)}
                onChange={(e) => setAudio({ [r.k]: Number(e.target.value) / 100 })}
              />
              <span className={css.volNote}>{r.note}</span>
            </label>
          ))}
        </div>
        <div className={css.actions}>
          <button className="btn btn--ghost" style={{ fontSize: 12 }} data-audio-mute onClick={() => setAudio({ muted: !a.muted })}>
            {a.muted ? '取消静音' : '静音'}
          </button>
          <button className="btn btn--ghost" style={{ fontSize: 12 }} data-audio-test onClick={() => sfx('hit')}>
            试听一声
          </button>
          <button
            className="btn btn--ghost" style={{ fontSize: 12 }}
            onClick={() => { setAudio({ ...AUDIO_DEFAULTS }); setBeds(false) }}
          >
            恢复默认
          </button>
        </div>
      </div>
    </section>
  )
}

/** 读取本地 .json 文件（可多选）为待导入对象；JSON 解析失败标 null */
function pickJsons(multiple: boolean): Promise<Array<{ fileName: string; json: unknown }>> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.multiple = multiple
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      const out: Array<{ fileName: string; json: unknown }> = []
      for (const f of files) {
        try {
          out.push({ fileName: f.name, json: JSON.parse(await f.text()) as unknown })
        } catch {
          out.push({ fileName: f.name, json: null })
        }
      }
      resolve(out)
    }
    input.click()
  })
}

type Channel = AiChannel

const CH_META: Record<Channel, { title: string; kicker: string; hint: string; tempNote: string; maxNote: string; streamNote: string }> = {
  main: {
    title: '主线剧情',
    kicker: 'STORY / DIRECTOR',
    hint: '剧情推演通道：以第三人称「导演 + 在场角色」推进当前事件，回执带结构化指令自动落地。',
    tempNote: '叙事通道。越低越贴原作基调；建议 0.6–0.9。',
    maxNote: `每次推演的单回合输出上限，建议 ${DEFAULT_BUDGET}。思考型通道（DeepSeek reasoner 等）会先把预算耗在内部思考上——落在千位以内时，正文常常一个字还没写就被长度掐断。若该通道回话里明确说上限不够，照它给的数往下调（区间 ${MIN_BUDGET}–${MAX_BUDGET}）。`,
    streamNote: '开启后在线推演逐字上屏（SSE 流式）。若中转网关不支持流式、报错或久不出字，关掉即回退为整段接收。',
  },
  sms: {
    title: '角色短信',
    kicker: 'SMS / CHARACTER CHAT',
    hint: '角色一对一短信通道，回复可带轻量羁绊。可与此前的历史线程无缝衔接。',
    tempNote: '聊天通道。越放飞越跳脱；建议 0.7–1.0。',
    maxNote: `每条短信回复的输出上限，沿用与主线同一条口径（建议 ${DEFAULT_BUDGET}）：偏低时思考型通道会先被内部思考耗尽，回过来是一句空话。`,
    streamNote: '开启后短信回复逐字上屏；网关不支持流式时关掉。',
  },
}

const SUB_FIELD = { fontFamily: 'inherit', fontSize: 11.5, letterSpacing: 0.02, color: 'var(--ink-faint)', textTransform: 'none' } as const

/**
 * 通联日志。
 * 只回答一个问题：我在这一屏里配的东西，后台 AI 到底收到了没有。
 * 所以每条都摊开三样最容易被「看着生效、其实没进」的东西 ——
 * 生效预设实际命中的条目、世界书命中的词条、以及发出去的提示词全文。
 */
function AiLogPanel() {
  // 日志写在 lib/api 里（不经过 React），这里订阅它的版本号重读
  const version = useSyncExternalStore(subscribeAiLog, aiLogVersion)
  const rows = useMemo(() => listAiLogs(), [version])
  const [open, setOpen] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => { setCopied(id); window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600) },
      () => { /* 无剪贴板权限就静默 */ },
    )
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title"><ClockCounterClockwise size={15} weight="bold" /> 通联日志</span>
        <span className="muted tiny">最近 {rows.length} 次推演的去向</span>
      </div>
      <div className="panel__body" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={css.note}>
          <b>用来核对后台 AI 有没有真的吃到你配的东西。</b><br />
          每一趟请求都留一条：通道、模型、生效预设**实际进了哪几条**指令、世界书命中多少字、提示词全文、回来的字数与耗时。
          预设套用了却一条没进、世界书一本没命中、密钥不对被网关挡回来，都在这上面一眼看出来。
        </div>

        <div className={css.dataLine}>
          <span className="chip">记录 {rows.length} / 最多 30</span>
          <span className={css.grow} />
          <button
            className={`btn ${confirmClear ? `${css.danger} btn--ghost` : 'btn--ghost'}`}
            style={{ fontSize: 12 }}
            onClick={() => {
              if (!confirmClear) { setConfirmClear(true); window.setTimeout(() => setConfirmClear(false), 4000); return }
              clearAiLogs(); setConfirmClear(false); setOpen(null)
            }}
          >
            <Trash size={14} weight="bold" /> {confirmClear ? '再按一次清空' : '清空日志'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="muted tiny" style={{ padding: '4px 2px' }}>
            还没有记录。去剧情推进或角色短信里发一轮，回来这里核对。
          </div>
        ) : (
          <div className={css.logList}>
            {rows.map((r) => {
              const isOpen = open === r.id
              return (
                <div key={r.id} className={`${css.logRow} ${r.ok ? '' : css.logBad}`}>
                  <div className={css.logHead} onClick={() => setOpen(isOpen ? null : r.id)}>
                    {isOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
                    <span className={css.logWhen}>{logLine(r)}</span>
                    {r.ok ? null : <WarningOctagon size={13} weight="bold" className={css.logWarnIcon} />}
                    <span className={css.grow} />
                    <span className="muted tiny">{r.ts ? new Date(r.ts).toLocaleDateString('zh-CN') : ''}</span>
                  </div>
                  {isOpen ? <LogDetail rec={r} copied={copied === r.id} onCopy={() => copy(r.id, detailText(r))} /> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

/** 一条记录摊开后的全文（复制用：连同提示词一起带走） */
function detailText(r: AiLogRecord): string {
  return [
    logLine(r),
    `通道：${r.channel}${r.act ? ` · ${r.act}` : ''}`,
    `接口：${r.baseUrl || '未填'} ｜ 模型：${r.model || '未填'}`,
    `参数：温度 ${r.temperature} ｜ 上限 ${r.maxTokens} ｜ ${r.stream ? '流式' : '整段'}`,
    r.preset ? `预设：${r.preset.name || '未命名'}${r.preset.id ? `（${r.preset.id}）` : ''} ｜ 命中 ${r.preset.hits.length} 条：${r.preset.hits.join('、') || '无'}` : '预设：未套用',
    r.lore ? `世界书：命中 ${r.lore.hits.length} 条 / ${r.lore.chars} 字：${r.lore.hits.join('、') || '无'}` : '',
    `结果：${r.ok ? `成功 · 正文 ${r.replyChars} 字 · ${r.ms}ms${r.finishReason ? ` · ${r.finishReason}` : ''}` : `失败 · ${r.error ?? ''}`}`,
    '',
    '── 提示词 ──',
    r.prompt,
    r.replyHead ? `\n── 回复开头 ──\n${r.replyHead}` : '',
  ].filter(Boolean).join('\n')
}

function LogDetail({ rec, copied, onCopy }: { rec: AiLogRecord; copied: boolean; onCopy: () => void }) {
  const yes = (s: string) => <span className={css.logOk}>{s}</span>
  const no = (s: string) => <span className={css.logNo}>{s}</span>
  return (
    <div className={css.logBody}>
      <div className={css.logKv}>
        <span>通道</span><b>{rec.channel}{rec.act ? ` · ${rec.act}` : ''}</b>
        <span>接口</span><b>{rec.baseUrl || '未填'} ｜ {rec.model || '未填模型'}</b>
        <span>参数</span><b>温度 {rec.temperature} ｜ 上限 {rec.maxTokens} ｜ {rec.stream ? '流式' : '整段接收'}</b>
        <span>提示词</span><b>{rec.turns} 条消息 / {rec.chars} 字</b>
      </div>

      <div className={css.logBlock}>
        <b>生效预设</b>
        {rec.preset?.id || rec.preset?.name ? (
          <>
            <div className="muted tiny">
              {rec.preset.name || '未命名'}{rec.preset.id ? `（${rec.preset.id}）` : ''}
              {rec.preset.prefill ? ' ｜ 带预填充' : ''}
            </div>
            <div className={css.logHits}>
              {rec.preset.hits.length
                ? rec.preset.hits.map((h) => <span key={h} className={css.logHit}>{h}</span>)
                : no('一条都没进 —— 预设没生效，或条目全被关/全需未命中的关键词')}
            </div>
          </>
        ) : (
          <div className="muted tiny">{no('未套用任何预设（到「管理预设」里应用一份）')}</div>
        )}
      </div>

      <div className={css.logBlock}>
        <b>世界书</b>
        {rec.lore && rec.lore.chars > 0 ? (
          <>
            <div className="muted tiny">{rec.lore.chars} 字注入</div>
            <div className={css.logHits}>
              {rec.lore.hits.length
                ? rec.lore.hits.map((h) => <span key={h} className={css.logHit}>{h}</span>)
                : <span className="muted tiny">（未解析出词条名）</span>}
            </div>
          </>
        ) : (
          <div className="muted tiny">本次未命中任何词条</div>
        )}
      </div>

      <div className={css.logBlock}>
        <b>结果</b>
        {rec.ok
          ? <div className="muted tiny">{yes(`成功 · 正文 ${rec.replyChars} 字 · ${rec.ms}ms`)}{rec.finishReason ? ` · 终止 ${rec.finishReason}` : ''}{rec.reasoningChars ? ` · 内部思考 ${rec.reasoningChars} 字` : ''}</div>
          : <div className="muted tiny">{no(`失败 · ${rec.error ?? '未知错误'} · ${rec.ms}ms`)}</div>}
        {rec.replyHead ? <div className={css.logPre}>{rec.replyHead}</div> : null}
      </div>

      <div className={css.logBlock}>
        <b>提示词全文</b>
        <div className={css.logPre}>{rec.prompt}</div>
      </div>

      <div className={css.logActs}>
        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={onCopy}>
          <Copy size={12} weight="bold" /> {copied ? '已复制' : '复制这一条'}
        </button>
      </div>
    </div>
  )
}

export function Settings() {
  const { push, navigate, setupMode } = useTerminal()
  const [cfgs, setCfgs] = useState<Record<Channel, ApiSettings> | null>(null)
  const [eye, setEye] = useState<Record<Channel, boolean>>({ main: false, sms: false })
  const [busy, setBusy] = useState<Channel | null>(null)
  const [results, setResults] = useState<Record<Channel, { ok: boolean; text: string } | null>>({ main: null, sms: null })
  const abortRef = useRef<AbortController | null>(null)
  const [confirmAct, setConfirmAct] = useState<'clear' | 'restore' | null>(null)
  const [loreInfo, setLoreInfo] = useState<{ books: number; active: number }>({ books: -1, active: -1 })
  const [schemes, setSchemes] = useState<Scheme[]>(listSchemes)
  /* 金边画在**正在生效**的那一行上，而不是点过的那一行。
     这两件事以前是同一件（点一下 = 选中 + 加金边），于是「生效中的是哪一份」
     在界面上根本没有落点 —— 列表里没有金边的那一份照样在喂提示词。
     现在两本账分开：activeId 读的是生效快照，点击即套用（见下面 applyScheme）。 */
  const [activeId, setActiveId] = useState<string | null>(activePresetId)
  /** 预设调配：正在调配条目滤网的方案（null = 未开面板） */
  const [manageOf, setManageOf] = useState<Scheme | null>(null)
  const [newSchemeName, setNewSchemeName] = useState('')
  const [modelList, setModelList] = useState<Record<Channel, string[] | null>>({ main: null, sms: null })
  const [fetchingModels, setFetchingModels] = useState<Channel | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  /* 置于任何早返回之前：下方 useEffect 需在首帧（cfgs 为空走 loading 分支）就引用它，
     若声明在组件体靠后，首帧闭包里的该 const 处于 TDZ，commit 触发 effect 即抛错 → 黑屏。 */
  const refreshLoreInfo = useCallback(async () => {
    try {
      const [bs, ids] = await Promise.all([lore.listAllBooks(), lore.getActiveLorebookIds()])
      setLoreInfo({ books: bs.length, active: ids.filter((id) => bs.some((b) => b.id === id)).length })
    } catch {
      setLoreInfo({ books: 0, active: 0 })
    }
  }, [])

  const readCfg = useCallback(() => {
    readProfiles()
      .then((p) => setCfgs({ main: p.main, sms: p.sms }))
      .catch(() => setCfgs(null))
  }, [])

  useEffect(() => { readCfg() }, [readCfg])

  useEffect(() => {
    void refreshLoreInfo()
  }, [refreshLoreInfo])

  /*
    内置预设是在终端启动时入册的；万一它落盘比这一屏挂载还晚，这里补一次读取。
    它做的事比「加两行方案」多：本机从没套过预设时，它还会把协议预设直接启动
    （温度 / 输出预算 / 生效快照都落一遍）—— 所以返回 true 时要连通道配置与
    生效预设一起重读，否则界面上显示的还是自动启动之前的那套参数。
  */
  useEffect(() => {
    void ensureBuiltinPresets()
      .then((did) => ensureBudgetFloor().then((raised) => raised || did))
      .then((did) => {
        if (!did) return
        setSchemes(listSchemes())
        setActiveId(activePresetId())
        readCfg()
        void refreshLoreInfo()
      })
  }, [readCfg, refreshLoreInfo])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!cfgs) {
    return (
      <div className="vpage">
        <div className="vhead"><div><div className="vhead__kicker">SYSTEM / SETTINGS</div><h1>终端设置</h1></div></div>
        <div className="panel" style={{ padding: 24 }}>正在读取本地设置…</div>
      </div>
    )
  }

  const set = (ch: Channel, k: keyof ApiSettings, v: string | number | boolean) => {
    setCfgs((prev) => (prev ? { ...prev, [ch]: { ...prev[ch], [k]: v } } : prev))
  }

  const save = async (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg) return
    try {
      await saveProfile(ch, cfg)
      push('success', '设置已保存', `${CH_META[ch].title}：通道配置已写入本终端。`, false)
    } catch {
      push('danger', '保存失败', '本地存储区写入出错，请重试。', false)
    }
  }

  const clearKey = async (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg) return
    setCfgs((prev) => (prev ? { ...prev, [ch]: { ...prev[ch], apiKey: '' } } : prev))
    await saveProfile(ch, { ...cfg, apiKey: '' })
    push('info', '已清除密钥', `${CH_META[ch].title}：本终端留存的接口密钥已删除。`, false)
  }

  const reset = (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg) return
    setCfgs((prev) => (prev ? { ...prev, [ch]: { ...API_DEFAULTS, apiKey: cfg.apiKey } } : prev))
    setResults((prev) => ({ ...prev, [ch]: null }))
  }

  const test = async (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg || !isReady(cfg)) {
      push('warn', '配置不完整', '请先填好接口地址与模型名称，再测试连接。')
      return
    }
    setBusy(ch)
    setResults((prev) => ({ ...prev, [ch]: null }))
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const out = await chatCompletion(
        cfg,
        [
          { role: 'system', content: '你是一个连通性测试助手。只回复四个字：信道正常。' },
          { role: 'user', content: '测试' },
        ],
        // 自检要按**本通道的实际预算**发：拿一个比实际更小的数去自检，
        // 会在思考型通道上「测出来是空的」，而真正生成时反倒是好的 —— 假阴性。
        {
          signal: ctrl.signal,
          maxTokens: clampBudget(cfg.maxTokens),
          meta: { channel: '信道自检', act: ch === 'main' ? '主线剧情通道' : '角色短信通道' },
        },
      )
      setResults((prev) => ({ ...prev, [ch]: { ok: true, text: `信道正常 · 通道回话：${out.slice(0, 120)}` } }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setResults((prev) => ({ ...prev, [ch]: { ok: false, text: msg } }))
    } finally {
      setBusy(null)
      abortRef.current = null
    }
  }

  /* —— 拉取可用模型 —— */
  const fetchModels = async (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg) {
      push('warn', '配置未就绪', '设置尚未载入，请稍后再试。', false)
      return
    }
    if (!cfg.baseUrl.trim()) {
      push('warn', '缺少接口地址', '请先填好 BASE URL，再拉取模型列表。', false)
      return
    }
    setFetchingModels(ch)
    try {
      const ids = await listModels(cfg)
      if (!ids.length) {
        setModelList((prev) => ({ ...prev, [ch]: [] }))
        push('warn', '未返回模型', '该网关未列出任何模型。', false)
      } else {
        setModelList((prev) => ({ ...prev, [ch]: ids }))
        push('success', '已拉取模型', `${CH_META[ch].title}：网关列出 ${ids.length} 个模型。`, false)
      }
    } catch (e) {
      setModelList((prev) => ({ ...prev, [ch]: null }))
      push('danger', '拉取失败', e instanceof Error ? e.message : String(e), false)
    } finally {
      setFetchingModels(null)
    }
  }

  /* —— 导入 ST 世界书 JSON（多选，追加式） —— */
  const doImportStLore = async () => {
    if (importBusy) return
    const picked = await pickJsons(true)
    if (!picked.length) return
    setImportBusy(true)
    try {
      const inputs: MultiImportInput[] = picked.map((p) => ({ fileName: p.fileName, json: p.json as SillyTavernLorebookExport }))
      const results = await lore.importStLorebookMulti(inputs)
      const ok = results.filter((r) => r.book)
      const bad = results.filter((r) => r.error)
      if (ok.length) push('success', '已导入世界书', ok.map((r) => r.book?.name ?? '').filter(Boolean).join(' · '), false)
      if (bad.length) push('warn', '部分文件未识别', bad.map((r) => r.fileName).join('、'), false)
      if (!ok.length && !bad.length) push('info', '未导入任何文件', '所选 JSON 均未被识别为世界书。', false)
    } catch {
      push('danger', '导入失败', '读取世界书文件时出错。', false)
    } finally {
      setImportBusy(false)
      void refreshLoreInfo()
    }
  }

  /* —— 导入 ChatPreset：映射为方案并套用两通道（baseUrl/密钥沿用现值） —— */
  const importChatPreset = async () => {
    if (!cfgs) return
    try {
      const picked = await readJsonFile()
      if (picked === null) {
        push('warn', '未能读取文件', '所选文件不是可解析的 JSON。', false)
        return
      }
      const r = parseChatPreset(picked.json, cfgs, picked.name)
      if (!r.ok) {
        push('warn', '无法识别为 ChatPreset', r.warn, false)
        return
      }
      const { scheme, model, note } = r
      scheme.activeLoreIds = await lore.getActiveLorebookIds()
      scheme.loreEntryOff = await lore.snapshotEntryOff(scheme.activeLoreIds)
      const next = [...schemes, scheme]
      setSchemes(next)
      storeSchemes(next)
      let cfg = await applySchemeTo(cfgs, scheme)
      // 预设里的流式开关（酒馆 stream_openai）一并落到两通道
      if (typeof r.stream === 'boolean') {
        cfg = { main: { ...cfg.main, stream: r.stream }, sms: { ...cfg.sms, stream: r.stream } }
        await Promise.all([saveProfile('main', cfg.main), saveProfile('sms', cfg.sms)])
      }
      setCfgs(cfg)
      setActiveId(activePresetId())
      const streamNote = typeof r.stream === 'boolean' ? ` · 流式${r.stream ? '开' : '关'}` : ''
      push('success', '已导入并应用 ChatPreset', `${scheme.name}${model ? ` · ${model}` : ''}${note ? `（${note}）` : ''}${streamNote}`, false)
    } catch (e) {
      // 兜底：任何一步抛错都要有回执 —— 静默失败在这里等于「点了没反应」
      push('danger', '导入失败', e instanceof Error ? e.message : String(e), false)
    }
  }

  /* ============ 世界书数据管理 + 方案 ============ */

  const doExportLore = async () => {
    try {
      const backup = await lore.backupAll()
      exportToJson(backup, 'zts-lore-backup.json')
      push('success', '已导出备份', '世界书整库备份已下载（不含接口密钥）。', false)
    } catch {
      push('danger', '导出失败', '世界书备份未能生成。', false)
    }
  }

  const doRestoreLore = async () => {
    if (confirmAct !== 'restore') { setConfirmAct('restore'); return }
    setConfirmAct(null)
    const picked = await readJsonFile()
    const data = picked === null ? null : picked.json
    if (!data || (data as { kind?: unknown }).kind !== 'zts-lore-backup') {
      push('warn', '无法识别', '请选择此前导出的「世界书整库备份」。', false)
      return
    }
    try {
      await lore.restoreAll(data as lore.LoreBackupFile)
      push('success', '已恢复世界书', '备份内容已覆盖世界书与启用标记。', false)
    } catch (e) {
      push('danger', '恢复失败', e instanceof Error ? e.message : String(e), false)
    }
    void refreshLoreInfo()
  }

  const doClearLore = async () => {
    if (confirmAct !== 'clear') { setConfirmAct('clear'); return }
    setConfirmAct(null)
    try {
      await lore.clearAll()
      push('info', '已清空世界书', '下次打开剧情推进会重新生成内置 canon 世界书。', false)
    } catch {
      push('danger', '清空失败', '世界书未能清空。', false)
    }
    void refreshLoreInfo()
  }

  const captureScheme = async () => {
    if (!cfgs) return
    const n = newSchemeName.trim()
    if (!n) {
      push('warn', '方案名不能为空', '请先为这套参数命名。', false)
      return
    }
    const s = await captureFrom(cfgs, n)
    const next = [...schemes, s]
    setSchemes(next)
    storeSchemes(next)
    setNewSchemeName('')
    push('success', '已存为方案', `${n}（不含接口密钥）`, false)
  }

  const applyScheme = async (s: Scheme) => {
    if (!cfgs) return
    const cfg = await applySchemeTo(cfgs, s)
    setCfgs(cfg)
    setActiveId(activePresetId())
    push('success', '已应用方案', `${s.name} · 两通道参数与世界书启用已套用`, false)
    void refreshLoreInfo()
  }

  /** 管理预设 · 保存：只改本地方案记录（含生效快照的同步），不碰任何世界书 */
  const savePreset = (s: Scheme, patch: { entries: PresetEntry[]; loreEntryOff: Record<string, string[]> }) => {
    // patchScheme 会在该方案正生效时顺手刷新快照，开关因此立刻对下一次生成生效
    setSchemes(patchScheme(s.id, patch))
    setManageOf(null)
    const on = patch.entries.filter((e) => e.enabled !== false && !e.placeholder).length
    const all = patch.entries.filter((e) => !e.placeholder).length
    const n = Object.values(patch.loreEntryOff).reduce((a, ids) => a + ids.length, 0)
    push('success', '已保存预设', `${s.name} · 指令条目 ${on}/${all} 启用 · 世界书接管 ${Object.keys(patch.loreEntryOff).length} 本 / 关闭 ${n} 条`, false)
  }

  const deleteScheme = (id: string) => {
    const next = schemes.filter((x) => x.id !== id)
    setSchemes(next)
    storeSchemes(next)
    // 删掉的正是生效中的那一份 → 金边跟着走（提示词那边由下次首启补一份）
    setActiveId(activePresetId())
    push('info', '已删除方案', '', false)
  }

  const exportScheme = (s: Scheme) => {
    exportToJson(s, `${s.name}.json`)
    push('success', '已导出方案', `${s.name}（不含密钥）`, false)
  }

  const importScheme = async () => {
    const picked = await readJsonFile()
    const s = parseSchemeFile(picked === null ? null : picked.json)
    if (!s) {
      push('warn', '无法识别', '所选文件不是方案 JSON（需含名称与 main/sms 参数）。', false)
      return
    }
    const next = [...schemes, s]
    setSchemes(next)
    storeSchemes(next)
    push('success', '已导入方案', s.name, false)
  }

  const card = (ch: Channel) => {
    const cfg = cfgs[ch]
    const meta = CH_META[ch]
    const Icon = ch === 'main' ? Sparkle : ChatsCircle
    const res = results[ch]
    return (
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title"><Icon size={15} weight="bold" /> {meta.title}</span>
          <span className="muted tiny" style={{ marginLeft: 'auto' }}>{meta.kicker}</span>
        </div>
        <div className="panel__body" style={{ padding: 18 }}>
          <label className={css.fieldRow}>
            <span>接口地址 BASE URL</span>
            <input
              className="field"
              value={cfg.baseUrl}
              onChange={(e) => set(ch, 'baseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
            />
            <span style={SUB_FIELD}>{meta.hint}</span>
          </label>

          <label className={css.fieldRow}>
            <span>接口密钥 API KEY</span>
            <span className={css.rowInline}>
              <input
                className="field"
                type={eye[ch] ? 'text' : 'password'}
                value={cfg.apiKey}
                onChange={(e) => set(ch, 'apiKey', e.target.value)}
                placeholder="sk-…（选填；自建本地网关可留空）"
                autoComplete="off"
                spellCheck={false}
              />
              <button className={css.eyeBtn} onClick={() => setEye((prev) => ({ ...prev, [ch]: !prev[ch] }))} aria-label={eye[ch] ? '隐藏密钥' : '显示密钥'}>
                {eye[ch] ? <EyeSlash size={17} weight="bold" /> : <Eye size={17} weight="bold" />}
              </button>
            </span>
            <span style={SUB_FIELD}>密钥只落在本终端的本地存储区，不写进代码或任何明文文件。</span>
          </label>

          <label className={css.fieldRow}>
            <span>模型名称 MODEL</span>
            <span className={css.rowInline}>
              <input
                className="field"
                value={cfg.model}
                onChange={(e) => set(ch, 'model', e.target.value)}
                placeholder="如 gpt-4o-mini / deepseek-chat / qwen2.5 …"
                spellCheck={false}
              />
              <button
                className="btn btn--ghost"
                style={{ fontSize: 11, flex: '0 0 auto' }}
                onClick={() => void fetchModels(ch)}
                disabled={fetchingModels !== null || !cfg.baseUrl.trim()}
                title="向该接口地址拉取可用模型列表"
              >
                <ArrowClockwise size={13} weight="bold" /> {fetchingModels === ch ? '拉取中…' : '拉取模型'}
              </button>
            </span>
            {Array.isArray(modelList[ch]) ? (
              <span className={css.modelRow}>
                <select
                  className="field"
                  value={cfg.model}
                  onChange={(e) => set(ch, 'model', e.target.value)}
                  aria-label="可用模型列表"
                >
                  {!cfg.model ? <option value="">选择模型…</option> : null}
                  {cfg.model && !(modelList[ch] as string[]).includes(cfg.model) ? (
                    <option value={cfg.model}>{cfg.model}（当前，不在列表）</option>
                  ) : null}
                  {(modelList[ch] as string[]).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span style={SUB_FIELD}>
                  共 {(modelList[ch] as string[]).length} 个模型 · 选中即写回上方模型名称
                </span>
              </span>
            ) : null}
          </label>

          <label className={css.fieldRow}>
            <span>温度 TEMPERATURE</span>
            <span className={css.tempWrap}>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={cfg.temperature}
                onChange={(e) => set(ch, 'temperature', Number(e.target.value))}
              />
              <span className={css.tempVal}>{cfg.temperature.toFixed(2)}</span>
            </span>
            <span style={SUB_FIELD}>{meta.tempNote}</span>
          </label>

          <label className={css.fieldRow}>
            <span>输出预算 MAX TOKENS</span>
            <span className={css.rowInline}>
              <input
                type="number"
                min={MIN_BUDGET}
                max={MAX_BUDGET}
                step={256}
                className="field"
                style={{ maxWidth: 140 }}
                value={cfg.maxTokens}
                onChange={(e) => set(ch, 'maxTokens', clampBudget(Number(e.target.value)))}
              />
              <span className="muted tiny" style={{ flex: '0 0 auto' }}>tokens / 回合</span>
            </span>
            <span style={SUB_FIELD}>{meta.maxNote}</span>
          </label>

          <label className={css.fieldRow}>
            <span>流式生成 STREAM</span>
            <span className={css.rowInline}>
              <label className={css.ck}>
                <input
                  type="checkbox"
                  checked={cfg.stream !== false}
                  onChange={(e) => set(ch, 'stream', e.target.checked)}
                />
                逐字上屏（对应酒馆预设的 stream_openai）
              </label>
            </span>
            <span style={SUB_FIELD}>{meta.streamNote}</span>
          </label>

          <div className={css.actions}>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => reset(ch)}>恢复默认地址</button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => clearKey(ch)}>清除密钥</button>
            <button className="btn btn--amber" style={{ fontSize: 12 }} onClick={() => test(ch)} disabled={busy !== null || !isReady(cfg)}>
              <Play size={14} weight="bold" /> {busy === ch ? '测试中…' : '测试连接'}
            </button>
            <span className={css.grow} />
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => save(ch)}>
              <FloppyDisk size={15} weight="bold" /> 保存设置
            </button>
          </div>

          {res ? (
            <div className={css.note} style={{ marginTop: 16 }}>
              {res.ok ? <span className={css.okLine}>{res.text}</span> : <span className={css.errLine}>{res.text}</span>}
            </div>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <div className="vpage">
      <div className="vhead">
        <div>
          <div className="vhead__kicker">SYSTEM / SETTINGS</div>
          <h1>终端设置</h1>
          <div className="vhead__sub">双通道推演配置：主线剧情与角色短信彼此独立，可同可异。所有字段只落在本终端，随时可清除。</div>
        </div>
        <div className="vhead__right">
          {setupMode ? (
            <span className="chip">连接配置 · 返回标题可继续</span>
          ) : (
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('tavern')}>
              前往角色短信
            </button>
          )}
        </div>
      </div>

      <div className={css.cfgGrid}>
        {card('main')}
        {card('sms')}
      </div>

      <AudioPanel />

      {/* 世界书数据管理与方案 */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <span className="panel__title"><Database size={15} weight="bold" /> 世界书数据管理</span>
          <span className="muted tiny" style={{ marginLeft: 'auto' }}>WORLD INFO / LOCAL</span>
        </div>
        <div className="panel__body" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={css.note}>
            <b>世界书与「方案」只落本终端，绝不包含密钥。</b><br />
            世界书存有本终端从 canon 生成的种子书与你导入／编辑的内容，可整库导出一份备份 JSON；
            备份不含接口密钥（密钥在 api:main / api:sms，也不会被写进任何文件）。下方「整库备份」导入会覆盖当前世界书与启用标记。
          </div>

          {/* 导入簇：全部外部预设 / 方案 / 备份导入排列在同一区，显眼好找 */}
          <div className={css.importBox}>
            <div className={css.importHead}>
              <b>数据导入 / IMPORT</b>
              <span style={{ marginLeft: 'auto' }}>外部预设与备份读回本终端 · 密钥永不在文件里</span>
            </div>

            <div className={css.importRow}>
              <div className={css.importInfo}>
                <b>ST 世界书 JSON（追加导入）</b>
                <span>多选外部 SillyTavern 世界书文件，追加为终端世界书；可到智库页启停与编辑。</span>
              </div>
              <div className={css.importAct}>
                <button className="btn btn--amber" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => void doImportStLore()} disabled={importBusy}>
                  <UploadSimple size={14} weight="bold" /> {importBusy ? '导入中…' : '导入 ST 世界书'}
                </button>
              </div>
            </div>

            <div className={css.importRow}>
              <div className={css.importInfo}>
                <b>ChatPreset · 预设映射为方案</b>
                <span>读取 ST 预设的模型与温度，生成新方案并套用两通道（接口地址沿用当前值）。</span>
              </div>
              <div className={css.importAct}>
                <button className="btn btn--ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => void importChatPreset()}>
                  <UploadSimple size={14} weight="bold" /> 导入 ChatPreset
                </button>
              </div>
            </div>

            <div className={css.importRow}>
              <div className={css.importInfo}>
                <b>方案 JSON（读回本终端）</b>
                <span>导入此前导出的方案文件，加入下方「方案」列表，随时一键套用。</span>
              </div>
              <div className={css.importAct}>
                <button className="btn btn--ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => void importScheme()}>
                  <UploadSimple size={14} weight="bold" /> 导入方案
                </button>
              </div>
            </div>

            <div className={css.importRow}>
              <div className={css.importInfo}>
                <b>整库备份 JSON（覆盖还原）</b>
                <span>用此前导出的整库备份覆盖当前全部世界书与启用标记，不可撤销。</span>
              </div>
              <div className={css.importAct}>
                <button
                  className={`btn ${confirmAct === 'restore' ? `${css.danger} btn--ghost` : 'btn--ghost'}`}
                  style={{ fontSize: 12, padding: '7px 14px' }}
                  onClick={() => void doRestoreLore()}
                >
                  <UploadSimple size={14} weight="bold" /> {confirmAct === 'restore' ? '再按一次确认覆盖' : '导入备份覆盖'}
                </button>
              </div>
            </div>

            {confirmAct === 'restore' ? (
              <div className={css.confirmNote}>导入会覆盖当前全部世界书与启用标记，不可撤销。</div>
            ) : null}
          </div>

          <div className={css.dataLine}>
            <span className="chip">世界书 {loreInfo.books >= 0 ? loreInfo.books : '…'}</span>
            <span className="chip">启用 {loreInfo.active >= 0 ? loreInfo.active : '…'}</span>
            <span className={css.grow} />
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => void doExportLore()}>
              <DownloadSimple size={14} weight="bold" /> 导出备份
            </button>
            <button
              className={`btn ${confirmAct === 'clear' ? `${css.danger} btn--ghost` : 'btn--ghost'}`}
              style={{ fontSize: 12 }}
              onClick={() => void doClearLore()}
            >
              <Trash size={14} weight="bold" /> {confirmAct === 'clear' ? '再按一次确认清空' : '清空世界书'}
            </button>
          </div>

          {confirmAct === 'clear' ? (
            <div className={css.confirmNote}>清空会删除全部世界书（含你导入的），下次打开剧情推进会重建内置 canon 世界书。</div>
          ) : null}

          <div className={css.schemeBox}>
            <div className={css.schemeHead}>
              <b className="muted tiny" style={{ letterSpacing: '0.12em' }}>方案（不含密钥 · 通道参数 + 激活世界书）</b>
            </div>
            <div className={css.schemeNew}>
              <input
                className="field"
                placeholder="把当前两通道参数存成命名方案…"
                value={newSchemeName}
                onChange={(e) => setNewSchemeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void captureScheme() } }}
              />
              <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void captureScheme()}>
                <FloppyDisk size={14} weight="bold" /> 存为方案
              </button>
            </div>

            {schemes.length === 0 ? (
              <div className="muted tiny" style={{ padding: '4px 2px' }}>尚无方案。命名并保存当前参数，之后可一键套用。</div>
            ) : (
              <div className={css.schemeList}>
                {schemes.map((s) => {
                  const isOn = activeId === s.id
                  const chip = (p: SchemePart) => (p.model ? `${p.model} · ${p.temperature.toFixed(2)}` : '未配置')
                  return (
                    <div
                      key={s.id}
                      className={`${css.schemeRow} ${isOn ? css.isOn : ''}`}
                      data-scheme-row={s.id}
                      data-scheme-on={isOn ? '1' : undefined}
                      /* 点这一行 = 让它生效。以前这里只是「选中」，还得再点一次「应用」；
                         而界面上真正要紧的信息（哪一份在喂提示词）反倒没有落点。 */
                      title={isOn ? '正在生效' : '点击启用这一份预设'}
                      onClick={() => { if (!isOn) void applyScheme(s) }}
                    >
                      {isOn ? <span className={css.onMark}>生效中</span> : null}
                      <div className={css.schemeMain}>
                        <b>{s.name}</b>
                        {/* 内置的那两份随终端一起来；手动导入的没有这个标 */}
                        {s.builtin ? <span className={css.builtinTag}>内置</span> : null}
                        <span className="muted tiny">
                          主线 {chip(s.main)} ｜ 短信 {chip(s.sms)} ｜ 启用世界书 {s.activeLoreIds.length}
                        </span>
                      </div>
                      <div className={css.rowActs} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 11, padding: '5px 9px' }}
                          disabled={isOn}
                          onClick={() => void applyScheme(s)}
                        >
                          <Play size={12} weight="bold" /> {isOn ? '已应用' : '应用'}
                        </button>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 11, padding: '5px 9px' }}
                          onClick={() => setManageOf(s)}
                          title="管理预设：调本预设自带的指令条目与世界书词条开关，与世界书自身状态互不干扰"
                        >
                          <SlidersHorizontal size={12} weight="bold" /> 管理预设
                          {(() => {
                            const n = (s.entries ?? []).filter((e) => e.enabled !== false && !e.placeholder).length
                            return n > 0 ? <span className={css.tuneBadge}>{n}</span> : null
                          })()}
                        </button>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => exportScheme(s)} title="导出为方案 JSON">
                          <DownloadSimple size={12} weight="bold" />
                        </button>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => deleteScheme(s.id)} title="删除方案">
                          <Trash size={12} weight="bold" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 关于与安全 */}
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title"><Wrench size={15} weight="bold" /> 存储与安全</span>
        </div>
        <div className="panel__body" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={css.note}>
            <b>密钥只落在本终端。</b><br />
            两路通道的密钥与模型配置分别写入本终端的本地存储区（键名 api:main / api:sms），不随存档同步，也不会送往任何服务器。
            若不放心，使用完可点各卡片的「清除密钥」，或在浏览器站点数据中删除本终端。
          </div>
          <div className={css.note}>
            <b>会话留存于本终端。</b><br />
            剧情会话（zts-plot:v1）与角色短信线程（zts-tavern:v1）均留在本终端本地，不含密钥。
            对话内容会送往你所配置的接口地址，请勿在其中输入真实账号密码或敏感信息。
          </div>
          <div className={css.note}>
            <b>兼容性说明。</b><br />
            本终端按 OpenAI 的 /chat/completions 规范调用。若网关需要自定义请求头或流式输出，
            可在接口地址旁架设一层兼容代理后填入。
          </div>
          <div className={css.actions} style={{ marginTop: 2 }}>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => clearKey('main')}>
              <Trash size={14} weight="bold" /> 清除主线密钥
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => clearKey('sms')}>
              <Trash size={14} weight="bold" /> 清除短信密钥
            </button>
          </div>
        </div>
      </section>

      <AiLogPanel />

      {/* 预设调配：调的是预设自带的词条滤网，与世界书自身状态互不干扰 */}
      {manageOf && (
        <PresetManager
          scheme={manageOf}
          onSave={(patch) => savePreset(manageOf, patch)}
          onClose={() => setManageOf(null)}
        />
      )}
    </div>
  )
}
