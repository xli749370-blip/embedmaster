/* 导出冥想稿为 JSON（供 Python edge-tts 生成音频用）
 * 运行：node --experimental-strip-types export-meditate.mjs
 */
import { meditatePart1 } from './src/mock/meditate1.ts'
import { meditatePart2 } from './src/mock/meditate2.ts'
import { writeFileSync } from 'node:fs'

const meditatePieces = [...meditatePart1, ...meditatePart2]
const out = meditatePieces.map((p) => ({ id: p.id, title: p.title, channel: p.channel, minutes: p.minutes, script: p.script }))
writeFileSync('meditate-scripts.json', JSON.stringify(out, null, 2), 'utf8')
console.log('导出', out.length, '篇，总字数', out.reduce((s, p) => s + p.script.length, 0))
