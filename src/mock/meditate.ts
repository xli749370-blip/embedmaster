/**
 * 冥想听学 · 独立内容注册表
 * 冥想稿 = 口语引导式内容（与理论课 doc 是两种内容形态），只在此处维护
 */
import { meditatePart1 } from './meditate1'
import { meditatePart2 } from './meditate2'

export interface MeditatePiece {
  id: string
  /** 所属频道 id */
  channel: string
  /** 预计时长（分钟，按 220 字/分钟估算） */
  minutes: number
  title: string
  /** 冥想口语稿（唯一朗读源，不走 docToSpeech） */
  script: string
}

export interface MeditateChannel {
  id: string
  title: string
  desc: string
  icon: string
}

export const meditateChannels: MeditateChannel[] = [
  { id: 'night', title: '入门夜话', desc: '写给刚上路的人：嵌入式是什么、为什么、怎么开始', icon: 'moon' },
  { id: 'clang', title: 'C 语言慢读', desc: '变量、指针、栈堆、中断、volatile——用比喻重新理解它们', icon: 'terminal' },
  { id: 'sys', title: '系统漫游', desc: '从沙子到芯片、编译器的一天、总线与时序', icon: 'cpu' },
  { id: 'py', title: 'Python 轻风', desc: '从容、容器、生成器——动态语言的另一种活法', icon: 'zap' },
  { id: 'hw', title: '硬件与电路', desc: '电流、上拉、焊台呼吸——硬件工程师的手感', icon: 'circuit' },
]

/**
 * 第二组频道：教材正文与实战内容的「听学版」
 * ------------------------------------------------------------------
 * 稿件不入包（几十万字），篇目清单由 audio/listen/manifest.json 在运行时加载；
 * 音频全部预生成为内置 mp3，闭眼即可听，不依赖任何在线语音服务。
 */
export const listenChannels: MeditateChannel[] = [
  { id: 'lecture', title: '讲义精听', desc: '42 章教材原文：从电路基础到 RTOS，一整套课闭眼过一遍', icon: 'book' },
  { id: 'circuit', title: '电路门诊', desc: '60 例读图拆解：先看场景，再一步步把图读通', icon: 'zap' },
  { id: 'parts', title: '元器件图鉴', desc: '35 个常用器件：参数怎么读、怎么选、坑在哪', icon: 'layers' },
  { id: 'code', title: '代码兵器谱', desc: '47 个模块的思路：不念代码，只讲它为什么这么写', icon: 'code' },
  { id: 'pitfall', title: '实战避坑', desc: '15 个现场故障：现象、根因、排查顺序', icon: 'alert' },
  { id: 'esp32', title: 'ESP32 平台', desc: '6 讲平台认知：家族选型、与 STM32 的思维差异', icon: 'cpu' },
]

/** 全部频道（心法在前，课程精听在后） */
export const allChannels: MeditateChannel[] = [...meditateChannels, ...listenChannels]

/** 动态频道（篇目来自 listen manifest） */
export const LISTEN_CHANNEL_IDS = listenChannels.map((c) => c.id)

export const meditatePieces: MeditatePiece[] = [...meditatePart1, ...meditatePart2]

export function piecesOf(channel: string): MeditatePiece[] {
  return meditatePieces.filter((p) => p.channel === channel)
}

export function getPiece(id: string): MeditatePiece | undefined {
  return meditatePieces.find((p) => p.id === id)
}
