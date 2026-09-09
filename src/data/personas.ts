import { CHARACTERS } from './chars'
import type { Character } from './types'

/**
 * 角色短信 —— 可对话的出场角色。
 * 解锁规则与角色档案一致：遇见（world.met）后才可发起对话。
 * 人格系统提示由现有档案（bio / quote / epithet）拼装，绝不新增虚构设定。
 * scenario 为此刻与对方交流的情境；greeting 为对方的第一句来讯（撰写风格，非原文台词）。
 */
export interface TavernPersona {
  charId: string
  scenario: string
  greeting: string
}

export const TAVERN_PERSONAS: TavernPersona[] = [
  {
    charId: 'hikari',
    scenario: '任务归来的工房街，刚摘下耳机的休息间隙',
    greeting: '呀吼——？找本小姐有事？先说好，猜拳免谈，除非你带着布丁来赔罪。',
  },
  {
    charId: 'luna',
    scenario: '深夜的信道，烟盒见底前的独处时间',
    greeting: '……嗯？这个点还开着信道。睡不着的话，我陪你坐到这根抽完。',
  },
  {
    charId: 'mefisa',
    scenario: '恋兔队值班室，刚替某个笨蛋队长收拾完善后文件',
    greeting: '这么晚还切到这条频道……也罢。纪录刚归档完，坐吧，别碰八脚马就行。',
  },
  {
    charId: 'nyau',
    scenario: '学生宿舍门前，一边看羊一边等学长路过',
    greeting: '心叶学长！小柴在！今天想聊什么——巡逻、山羊，还是新出的草莓牛奶？',
  },
]

export function charOf(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id)
}

export function metaOf(id: string): TavernPersona | undefined {
  return TAVERN_PERSONAS.find((p) => p.charId === id)
}
