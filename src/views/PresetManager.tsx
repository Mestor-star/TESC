/* 管理预设
   ------------------------------------------------------------------
   预设是「导演的拍摄指令」：角色卡是演员的剧本，预设决定 AI 如何理解
   角色卡、以何种方式讲故事。它打包两类东西：
     1) 指令条目 —— 预设自带的生成行为 / 文本格式约定（本面板 Tab 1）；
     2) 世界书调配 —— 哪些世界书词条参与注入（本面板 Tab 2）。
   外加两份已在方案里的参数：双通道模型/温度/预算。

   本面板只改**方案记录**；真正的生效时刻是「套用该预设」。若它正在生效，
   保存会顺手刷新生效快照，使开关立刻对下一次生成起作用。 */

import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { PresetEntry } from '../lib/preset'
import type { Scheme } from '../lib/schemes'
import PresetEntryPane from './PresetEntryPane'
import LoreFilterPane from './LoreFilterPane'
import css from './PresetManager.module.css'

interface Props {
  scheme: Scheme
  onSave: (patch: { entries: PresetEntry[]; loreEntryOff: Record<string, string[]> }) => void
  onClose: () => void
}

type Tab = 'entries' | 'lore'

export default function PresetManager({ scheme, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('entries')
  const [entries, setEntries] = useState<PresetEntry[]>(scheme.entries ?? [])
  const [off, setOff] = useState<Record<string, string[]>>(scheme.loreEntryOff ?? {})

  const onCount = entries.filter((e) => e.enabled !== false && !e.placeholder).length
  const realCount = entries.filter((e) => !e.placeholder).length
  const offTotal = Object.values(off).reduce((n, a) => n + a.length, 0)

  return (
    <div className={css.mask} onClick={onClose}>
      <div className={css.panel} data-preset-panel="1" onClick={(e) => e.stopPropagation()}>
        <div className={css.head}>
          <div>
            <div className={css.kicker}>PRESET · DIRECTOR&apos;S CUT</div>
            <div className={css.title}>管理预设 · {scheme.name}</div>
          </div>
          <div className={css.headActs}>
            <button className="btn btn--ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={onClose}>
              <X size={13} weight="bold" /> 关闭
            </button>
          </div>
        </div>

        <div className={css.tabs}>
          <button data-preset-tab="entries" className={`${css.tab} ${tab === 'entries' ? css.isOn : ''}`} onClick={() => setTab('entries')}>
            指令条目 · {onCount}/{realCount}
          </button>
          <button data-preset-tab="lore" className={`${css.tab} ${tab === 'lore' ? css.isOn : ''}`} onClick={() => setTab('lore')}>
            世界书调配 · {Object.keys(off).length} 本
          </button>
        </div>

        <div className={`${css.hint} muted tiny`}>
          {tab === 'entries' ? (
            <>预设自带的控制指令：决定 AI 如何理解角色卡、用什么方式讲故事。条目按「常驻 / 关键词命中」注入，
              关闭者一律不进提示词。<b>不保存就什么都不会发生</b>；保存后，若本预设正在生效，下一次生成即按新开关行事。</>
          ) : (
            <>这里调的是<b>本预设自带的一层词条滤网</b>，与世界书自身的开关互不干扰。
              被接管的书在套用本预设时整层覆盖（未列的条目一律启用）；未接管的书套用时保持原样。</>
          )}
        </div>

        <div className={css.body}>
          {tab === 'entries'
            ? <PresetEntryPane entries={entries} onChange={setEntries} />
            : <LoreFilterPane off={off} onChange={setOff} />}
        </div>

        <div className={css.foot}>
          <span className={css.footInfo}>
            指令条目 {onCount}/{realCount} 启用 · 接管 {Object.keys(off).length} 本世界书 / 共关闭 {offTotal} 条
          </span>
          <div className={css.footActs}>
            <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={onClose}>取消</button>
            <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => onSave({ entries, loreEntryOff: off })}>
              保存到预设
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
