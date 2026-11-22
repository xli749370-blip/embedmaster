/**
 * 代码库 —— 可复用嵌入式代码模块合集
 * 供学习与参考：每个条目 = 场景代码 + 要点避坑 + 关联训练资源
 */
import { bank1 } from './codelib1'
import { bank2 } from './codelib2'
import { bank3 } from './codelib3'
import { bank4 } from './codelib4'

export type CodeCategory = 'template' | 'gpio' | 'uart' | 'tim' | 'adc' | 'i2c' | 'spi' | 'rtos' | 'algo' | 'comm' | 'debug' | 'esp32'

export interface CodeEntry {
  id: string
  cat: CodeCategory
  title: string
  brief: string
  tags: string[]
  platform: string
  code: string
  points: string[]
  linkCircuit?: string   // 关联电路分析案例 id（cXX）
  linkProject?: string   // 关联项目库 id（pXX）
}

export const CODE_CATS: { id: CodeCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'template', label: '工程模板' },
  { id: 'gpio', label: 'GPIO' },
  { id: 'uart', label: '串口' },
  { id: 'tim', label: '定时器' },
  { id: 'adc', label: 'ADC' },
  { id: 'i2c', label: 'I2C' },
  { id: 'spi', label: 'SPI' },
  { id: 'rtos', label: 'RTOS' },
  { id: 'algo', label: '算法' },
  { id: 'comm', label: '通信协议' },
  { id: 'debug', label: '调试' },
  { id: 'esp32', label: 'ESP32' },
]

export const codeBank: CodeEntry[] = [...bank1, ...bank2, ...bank3, ...bank4]
