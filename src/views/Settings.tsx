import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowClockwise, ChatsCircle, Database, DownloadSimple, Eye, EyeSlash, FloppyDisk, Play, Sparkle, Trash, UploadSimple, Wrench } from '@phosphor-icons/react'

import { useTerminal } from '../terminal/Terminal'
import type { AiChannel, ApiSettings } from '../lib/api'
import { API_DEFAULTS, chatCompletion, isReady, listModels, readProfiles, saveProfile } from '../lib/api'
import * as lore from '../lib/lorestore'
import { exportToJson } from '../lib/tavernlike/importer'
import type { MultiImportInput } from '../lib/tavernlike/importer'
import type { SillyTavernLorebookExport } from '../lib/tavernlike/types'

import css from './Settings.module.css'

/* —— 轻量「方案」：通道参数 + 激活词条库（不含密钥），存 localStorage —— */

interface SchemePart { baseUrl: string; model: string; temperature: number }
interface Scheme {
  id: string
  name: string
  main: SchemePart
  sms: SchemePart
  activeLoreIds: string[]
}

const SCHEME_KEY = 'zts-schemes:v1'

function loadSchemes(): Scheme[] {
  try {
    const raw = localStorage.getItem(SCHEME_KEY)
    const p = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(p) ? p as Scheme[] : []
  } catch {
    return []
  }
}

function persistSchemes(list: Scheme[]): void {
  try {
    localStorage.setItem(SCHEME_KEY, JSON.stringify(list))
  } catch {
    /* 隐私模式下降级 */
  }
}

function schemePart(cfg: ApiSettings): SchemePart {
  return { baseUrl: cfg.baseUrl, model: cfg.model, temperature: cfg.temperature }
}

/** 读取单个本地 .json 文件（返回解析值；非 JSON 时为 null） */
function readOneJson(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) { resolve(null); return }
      try {
        resolve(JSON.parse(await f.text()) as unknown)
      } catch {
        resolve(null)
      }
    }
    input.click()
  })
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

const CH_META: Record<Channel, { title: string; kicker: string; hint: string; tempNote: string }> = {
  main: {
    title: '主线剧情',
    kicker: 'STORY / DIRECTOR',
    hint: '剧情推演通道：AI 以第三人称「导演 + 在场角色」推进当前事件，回执带结构化指令自动落地。',
    tempNote: '叙事通道。越低越贴原作基调；建议 0.6–0.9。',
  },
  sms: {
    title: '角色短信',
    kicker: 'SMS / CHARACTER CHAT',
    hint: '角色一对一短信通道，回复可带轻量羁绊。可与此前的历史线程无缝衔接。',
    tempNote: '聊天通道。越放飞越跳脱；建议 0.7–1.0。',
  },
}

const SUB_FIELD = { fontFamily: 'inherit', fontSize: 11.5, letterSpacing: 0.02, color: 'var(--ink-faint)', textTransform: 'none' } as const

export function Settings() {
  const { push, navigate } = useTerminal()
  const [cfgs, setCfgs] = useState<Record<Channel, ApiSettings> | null>(null)
  const [eye, setEye] = useState<Record<Channel, boolean>>({ main: false, sms: false })
  const [busy, setBusy] = useState<Channel | null>(null)
  const [results, setResults] = useState<Record<Channel, { ok: boolean; text: string } | null>>({ main: null, sms: null })
  const abortRef = useRef<AbortController | null>(null)
  const [confirmAct, setConfirmAct] = useState<'clear' | 'restore' | null>(null)
  const [loreInfo, setLoreInfo] = useState<{ books: number; active: number }>({ books: -1, active: -1 })
  const [schemes, setSchemes] = useState<Scheme[]>(loadSchemes)
  const [schemeSel, setSchemeSel] = useState<string | null>(null)
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

  useEffect(() => {
    readProfiles()
      .then((p) => setCfgs({ main: p.main, sms: p.sms }))
      .catch(() => setCfgs(null))
  }, [])

  useEffect(() => {
    void refreshLoreInfo()
  }, [refreshLoreInfo])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!cfgs) {
    return (
      <div className="vpage">
        <div className="vhead"><div><div className="vhead__kicker">SYSTEM / SETTINGS</div><h1>终端设置</h1></div></div>
        <div className="panel" style={{ padding: 24 }}>正在读取本地设置…</div>
      </div>
    )
  }

  const set = (ch: Channel, k: keyof ApiSettings, v: string | number) => {
    setCfgs((prev) => (prev ? { ...prev, [ch]: { ...prev[ch], [k]: v } } : prev))
  }

  const save = async (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg) return
    try {
      await saveProfile(ch, cfg)
      push('success', '设置已保存', `${CH_META[ch].title}：通道配置已写入本机浏览器。`, false)
    } catch {
      push('danger', '保存失败', '写入 IndexedDB 出错，请重试。', false)
    }
  }

  const clearKey = async (ch: Channel) => {
    const cfg = cfgs[ch]
    if (!cfg) return
    setCfgs((prev) => (prev ? { ...prev, [ch]: { ...prev[ch], apiKey: '' } } : prev))
    await saveProfile(ch, { ...cfg, apiKey: '' })
    push('info', '已清除密钥', `${CH_META[ch].title}：本地保存的接口密钥已删除。`, false)
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
        { signal: ctrl.signal },
      )
      setResults((prev) => ({ ...prev, [ch]: { ok: true, text: `信道正常 · 模型返回：${out.slice(0, 120)}` } }))
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
        push('warn', '未返回模型', '该网关 /models 未列出任何模型。', false)
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

  /* —— 导入 ChatPreset：openai_model/temp_openai → 新方案并套用（baseUrl/密钥沿用通道现值） —— */
  const importChatPreset = async () => {
    if (!cfgs) return
    const data = await readOneJson()
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      push('warn', '无法识别', '所选文件不是 ChatPreset JSON。', false)
      return
    }
    const d = data as Record<string, unknown>
    const settings = (d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings) ? d.settings : {}) as Record<string, unknown>
    const model = typeof settings.openai_model === 'string' ? settings.openai_model.trim() : ''
    const temp = typeof settings.temp_openai === 'number' ? settings.temp_openai : 0.8
    if (!model) {
      push('warn', '预设缺模型', 'ChatPreset 未含 openai_model 字段，无法导入。', false)
      return
    }
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : `ChatPreset · ${model}`
    const actIds = await lore.getActiveLorebookIds()
    const s: Scheme = {
      id: crypto.randomUUID(),
      name,
      main: { baseUrl: cfgs.main.baseUrl, model, temperature: temp },
      sms: { baseUrl: cfgs.sms.baseUrl, model, temperature: temp },
      activeLoreIds: actIds,
    }
    const next = [...schemes, s]
    setSchemes(next)
    persistSchemes(next)
    setSchemeSel(s.id)
    // 直接套用两通道（密钥留 IndexedDB，baseUrl 不变）
    const nextMain = { ...cfgs.main, model, temperature: temp }
    const nextSms = { ...cfgs.sms, model, temperature: temp }
    setCfgs({ main: nextMain, sms: nextSms })
    try {
      await Promise.all([saveProfile('main', nextMain), saveProfile('sms', nextSms)])
    } catch { /* 写入失败时本次会话内仍生效 */ }
    push('success', '已导入并应用 ChatPreset', `${name} · ${model}`, false)
  }

  /* ============ 词条库数据管理 + 方案 ============ */

  const doExportLore = async () => {
    try {
      const backup = await lore.backupAll()
      exportToJson(backup, 'zts-lore-backup.json')
      push('success', '已导出备份', '词条库整库备份已下载（不含接口密钥）。', false)
    } catch {
      push('danger', '导出失败', '词条库备份未能生成。', false)
    }
  }

  const doRestoreLore = async () => {
    if (confirmAct !== 'restore') { setConfirmAct('restore'); return }
    setConfirmAct(null)
    const data = await readOneJson()
    if (!data || (data as { kind?: unknown }).kind !== 'zts-lore-backup') {
      push('warn', '无法识别', '请选择此前导出的「词条库整库备份」。', false)
      return
    }
    try {
      await lore.restoreAll(data as lore.LoreBackupFile)
      push('success', '已恢复词条库', '备份内容已覆盖词条库与启用标记。', false)
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
      push('info', '已清空词条库', '下次打开剧情推进会重新生成内置 canon 词条库。', false)
    } catch {
      push('danger', '清空失败', '词条库未能清空。', false)
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
    const ids = await lore.getActiveLorebookIds()
    const s: Scheme = { id: crypto.randomUUID(), name: n, main: schemePart(cfgs.main), sms: schemePart(cfgs.sms), activeLoreIds: ids }
    const next = [...schemes, s]
    setSchemes(next)
    persistSchemes(next)
    setNewSchemeName('')
    setSchemeSel(s.id)
    push('success', '已存为方案', `${n}（不含接口密钥）`, false)
  }

  const applyScheme = async (s: Scheme) => {
    if (!cfgs) return
    const nextMain = { ...cfgs.main, baseUrl: s.main.baseUrl, model: s.main.model, temperature: s.main.temperature }
    const nextSms = { ...cfgs.sms, baseUrl: s.sms.baseUrl, model: s.sms.model, temperature: s.sms.temperature }
    setCfgs({ main: nextMain, sms: nextSms })
    try {
      await Promise.all([saveProfile('main', nextMain), saveProfile('sms', nextSms)])
    } catch { /* 写入失败时本次会话内仍生效 */ }
    const curIds = await lore.getActiveLorebookIds()
    const want = new Set(s.activeLoreIds)
    for (const id of curIds) if (!want.has(id)) await lore.setBookActive(id, false)
    for (const id of s.activeLoreIds) if (!curIds.includes(id)) await lore.setBookActive(id, true)
    push('success', '已应用方案', `${s.name} · 两通道参数与词条库启用已套用`, false)
    void refreshLoreInfo()
  }

  const deleteScheme = (id: string) => {
    const next = schemes.filter((x) => x.id !== id)
    setSchemes(next)
    persistSchemes(next)
    if (schemeSel === id) setSchemeSel(null)
    push('info', '已删除方案', '', false)
  }

  const exportScheme = (s: Scheme) => {
    exportToJson(s, `${s.name}.json`)
    push('success', '已导出方案', `${s.name}（不含密钥）`, false)
  }

  const importScheme = async () => {
    const data = await readOneJson()
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      push('warn', '无法识别', '所选文件不是方案 JSON。', false)
      return
    }
    const d = data as Record<string, unknown>
    if (typeof d.name !== 'string' || !d.name.trim()) {
      push('warn', '无法识别', '方案缺少名称字段。', false)
      return
    }
    const mk = (p: unknown, fb: SchemePart): SchemePart => {
      const o = (p && typeof p === 'object' ? p as Record<string, unknown> : {}) as Record<string, unknown>
      return {
        baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : fb.baseUrl,
        model: typeof o.model === 'string' ? o.model : fb.model,
        temperature: typeof o.temperature === 'number' ? o.temperature : fb.temperature,
      }
    }
    const s: Scheme = {
      id: crypto.randomUUID(),
      name: d.name.trim(),
      main: mk(d.main, { baseUrl: '', model: '', temperature: 0.7 }),
      sms: mk(d.sms, { baseUrl: '', model: '', temperature: 0.7 }),
      activeLoreIds: Array.isArray(d.activeLoreIds) ? (d.activeLoreIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    }
    const next = [...schemes, s]
    setSchemes(next)
    persistSchemes(next)
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
            <span style={SUB_FIELD}>密钥经 IndexedDB 本地存储，不写进代码或任何明文文件。</span>
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
          <div className="vhead__sub">双通道 AI 配置：主线剧情与角色短信彼此独立，可同可异。所有字段仅保存在本机浏览器，随时可清除。</div>
        </div>
        <div className="vhead__right">
          <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => navigate('tavern')}>
            前往角色短信
          </button>
        </div>
      </div>

      <div className={css.cfgGrid}>
        {card('main')}
        {card('sms')}
      </div>

      {/* 词条库数据管理与方案 */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <span className="panel__title"><Database size={15} weight="bold" /> 词条库数据管理</span>
          <span className="muted tiny" style={{ marginLeft: 'auto' }}>LOREFILE / LOCAL</span>
        </div>
        <div className="panel__body" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={css.note}>
            <b>词条库与「方案」仅存本机，绝不包含密钥。</b><br />
            词条库（Dexie · zts-lore）存有从 canon 生成的种子库与你导入/编辑的内容，可整库导出一份备份 JSON；
            备份不含接口密钥（密钥在 api:main / api:sms，也不会被写进任何文件）。导入会覆盖当前词条库与启用标记。
          </div>

          <div className={css.dataLine}>
            <span className="chip">词条库 {loreInfo.books >= 0 ? loreInfo.books : '…'}</span>
            <span className="chip">启用 {loreInfo.active >= 0 ? loreInfo.active : '…'}</span>
            <span className={css.grow} />
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => void doExportLore()}>
              <DownloadSimple size={14} weight="bold" /> 导出备份
            </button>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => void doImportStLore()} disabled={importBusy}>
              <UploadSimple size={14} weight="bold" /> {importBusy ? '导入中…' : '导入 ST 世界书'}
            </button>
            <button
              className={`btn ${confirmAct === 'restore' ? `${css.danger} btn--ghost` : 'btn--ghost'}`}
              style={{ fontSize: 12 }}
              onClick={() => void doRestoreLore()}
            >
              <UploadSimple size={14} weight="bold" /> {confirmAct === 'restore' ? '再次点击确认覆盖' : '导入备份覆盖'}
            </button>
            <button
              className={`btn ${confirmAct === 'clear' ? `${css.danger} btn--ghost` : 'btn--ghost'}`}
              style={{ fontSize: 12 }}
              onClick={() => void doClearLore()}
            >
              <Trash size={14} weight="bold" /> {confirmAct === 'clear' ? '再次点击确认清空' : '清空词条库'}
            </button>
          </div>

          {confirmAct ? (
            <div className={css.confirmNote}>
              {confirmAct === 'restore'
                ? '导入会覆盖当前全部词条库与启用标记，不可撤销。'
                : '清空会删除全部词条库（含你导入的），下次打开剧情推进会重建内置 canon 库。'}
            </div>
          ) : null}

          <div className={css.schemeBox}>
            <div className={css.schemeHead}>
              <b className="muted tiny" style={{ letterSpacing: '0.12em' }}>方案（不含密钥 · 通道参数 + 激活词条库）</b>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => void importChatPreset()} title="导入 ST ChatPreset（data.settings.openai_model/temp_openai 映射为方案并套用）">
                  <UploadSimple size={13} weight="bold" /> 导入 ChatPreset
                </button>
                <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => void importScheme()}>
                  <UploadSimple size={13} weight="bold" /> 导入方案
                </button>
              </div>
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
                  const isSel = schemeSel === s.id
                  const chip = (p: SchemePart) => (p.model ? `${p.model} · ${p.temperature.toFixed(2)}` : '未配置')
                  return (
                    <div key={s.id} className={`${css.schemeRow} ${isSel ? css.isSel : ''}`} onClick={() => setSchemeSel(s.id)}>
                      <div className={css.schemeMain}>
                        <b>{s.name}</b>
                        <span className="muted tiny">
                          主线 {chip(s.main)} ｜ 短信 {chip(s.sms)} ｜ 启用词条库 {s.activeLoreIds.length}
                        </span>
                      </div>
                      <div className={css.rowActs} onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => void applyScheme(s)}>
                          <Play size={12} weight="bold" /> 应用
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
            <b>密钥只属于你的浏览器。</b><br />
            两路通道的密钥与模型配置分别写入本机的 IndexedDB（键名 api:main / api:sms），不会随存档同步，也不会上传任何服务器。
            若不放心，使用完可点各卡片的「清除密钥」，或在浏览器站点数据中删除本终端。
          </div>
          <div className={css.note}>
            <b>会话记录存 localStorage。</b><br />
            剧情会话（zts-plot:v1）与角色短信线程（zts-tavern:v1）均保存在浏览器本地，不含密钥。
            对话内容会发送给你配置的接口地址，请勿在其中输入真实账号密码或敏感信息。
          </div>
          <div className={css.note}>
            <b>兼容性说明。</b><br />
            本终端按 OpenAI 的 /chat/completions 规范调用。若你的网关需要自定义请求头或流式输出，
            可在配置的接口地址旁架设一层兼容代理后填入 baseUrl。
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
    </div>
  )
}
