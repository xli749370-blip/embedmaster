/**
 * 电路图元件类型与构造器 —— circuits.ts / circuits2.ts 共用
 * 坐标系约定见 circuits.ts 文件头注释。
 */
export type CompType =
  | 'wire' | 'dot' | 'res' | 'diode' | 'led' | 'zener' | 'cap' | 'pcap'
  | 'bat' | 'xtal' | 'gnd' | 'rail' | 'npn' | 'pnp' | 'nmos' | 'pmos' | 'sw' | 'coil'
  | 'motor' | 'label' | 'ac' | 'box' | 'dline'

export interface CircuitComp {
  id: string
  type: CompType
  from?: [number, number]
  to?: [number, number]
  at?: [number, number]
  rot?: 0 | 90 | 180 | 270
  text?: string
  /** 标注相对元件中点的偏移（默认放上方） */
  labelOffset?: [number, number]
}

export interface Checkpoint {
  id: string
  q: string
  type: '单选题' | '判断题' | '多选题'
  options?: Array<{ key: string; text: string }>
  answer: string
  explain: string
  highlight: string[]
}

export interface AnalysisStep {
  title: string
  text: string
  highlight: string[]
}

export interface CircuitCase {
  id: string
  title: string
  scene: string
  difficulty: '入门' | '进阶' | '挑战' | '实战'
  tags: string[]
  width: number
  height: number
  comps: CircuitComp[]
  checkpoints: Checkpoint[]
  steps: AnalysisStep[]
}

/* ---------------- 便捷构造器 ---------------- */
export const wire = (id: string, x1: number, y1: number, x2: number, y2: number): CircuitComp => ({ id, type: 'wire', from: [x1, y1], to: [x2, y2] })
export const wireD = (id: string, x1: number, y1: number, x2: number, y2: number): CircuitComp => ({ id, type: 'dline', from: [x1, y1], to: [x2, y2] })
export const dot = (id: string, x: number, y: number): CircuitComp => ({ id, type: 'dot', at: [x, y] })
export const res = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'res', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const diode = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'diode', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const led = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'led', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
/** 电池 / 纽扣电池：长短线电池符号 */
export const bat = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'bat', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
/** 晶体谐振器：两片电极板 + 中间晶片矩形 */
export const xtal = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'xtal', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const zener = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'zener', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const cap = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'cap', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const pcap = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'pcap', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const rail = (id: string, x: number, y: number, text: string): CircuitComp => ({ id, type: 'rail', at: [x, y], text })
export const gnd = (id: string, x: number, y: number): CircuitComp => ({ id, type: 'gnd', at: [x, y] })
export const npn = (id: string, x: number, y: number, text: string, rot: 0 | 90 | 180 | 270 = 0, off: [number, number] = [28, 34]): CircuitComp => ({ id, type: 'npn', at: [x, y], rot, text, labelOffset: off })
export const pnp = (id: string, x: number, y: number, text: string, rot: 0 | 90 | 180 | 270 = 0, off: [number, number] = [28, 34]): CircuitComp => ({ id, type: 'pnp', at: [x, y], rot, text, labelOffset: off })
export const nmos = (id: string, x: number, y: number, text: string, rot: 0 | 90 | 180 | 270 = 0, off: [number, number] = [30, 32]): CircuitComp => ({ id, type: 'nmos', at: [x, y], rot, text, labelOffset: off })
export const pmos = (id: string, x: number, y: number, text: string, rot: 0 | 90 | 180 | 270 = 0, off: [number, number] = [30, 32]): CircuitComp => ({ id, type: 'pmos', at: [x, y], rot, text, labelOffset: off })
export const sw = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'sw', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const coil = (id: string, x1: number, y1: number, x2: number, y2: number, text: string, off?: [number, number]): CircuitComp => ({ id, type: 'coil', from: [x1, y1], to: [x2, y2], text, labelOffset: off })
export const motor = (id: string, x: number, y: number, text: string): CircuitComp => ({ id, type: 'motor', at: [x, y], text, labelOffset: [0, -26] })
export const ac = (id: string, x: number, y: number, text: string, rot: 0 | 90 | 180 | 270 = 0, labelOffset: [number, number] = [-2, -26]): CircuitComp => ({ id, type: 'ac', at: [x, y], text, rot, labelOffset })
export const box = (id: string, x1: number, y1: number, x2: number, y2: number): CircuitComp => ({ id, type: 'box', from: [x1, y1], to: [x2, y2] })
export const lbl = (id: string, x: number, y: number, text: string): CircuitComp => ({ id, type: 'label', at: [x, y], text })

export const JUDGE = [
  { key: 'A', text: '正确' },
  { key: 'B', text: '错误' },
]
export const ABCD = (a: string, b: string, c: string, d: string) => [
  { key: 'A', text: a },
  { key: 'B', text: b },
  { key: 'C', text: c },
  { key: 'D', text: d },
]
