/**
 * 听学音频完整性校验（不看比特率，直接比「字速」）
 * ------------------------------------------------------------------
 * mp3 时长靠首帧比特率推算，转码前后很容易算错（v1 就栽过：把 MPEG2 的帧
 * 按 MPEG1 的比特率表解析，时长被低估，反而把完好的文件误判成截断）。
 *
 * 这里换成与比特率无关的判据：
 *   字速 = 稿件字数 / 音频时长（分钟）
 * 该音色实测约 280~320 字/分，正常区间取 250~365；
 * 超过 380 基本可以断定音频只念了一部分（听众会毫无提示地少听内容）。
 *
 * manifest.json 的 minutes 由 ffmpeg 读出的真实时长算出，
 * 因此 file / bytes / minutes 三者自洽就说明文件完好。
 *
 * 运行：node check-listen.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CPM_MIN = 250 // 字/分，过慢
const CPM_MAX = 365 // 字/分，过快（超过说明有内容没念到）
const CPM_HARD = 380 // 硬线：超过必然截断

const ROOT = process.cwd()
const PUB = join(ROOT, 'public')
const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'audio')
const scripts = JSON.parse(readFileSync(join(AUDIO_DIR, 'listen-scripts.json'), 'utf8'))
const byId = new Map(scripts.map((s) => [s.id, s]))
const manifest = JSON.parse(readFileSync(join(PUB, 'audio', 'listen', 'manifest.json'), 'utf8'))
const rows = manifest.entries

let missing = 0
let sizeBad = 0
const fast = []
const slow = []
const perChannel = {}
const ORDER = { lecture: 0, circuit: 1, parts: 2, code: 3, pitfall: 4, esp32: 5 }

for (const e of rows) {
  const p = join(PUB, e.file)
  if (!existsSync(p)) {
    console.log(`  缺失 ${e.id} ${e.file}`)
    missing++
    continue
  }
  const real = statSync(p).size
  if (real !== e.bytes) {
    console.log(`  字节不符 ${e.id} manifest ${e.bytes} / 实际 ${real}`)
    sizeBad++
  }
  const chars = byId.get(e.id)?.script.length || 0
  const cpm = e.minutes > 0 ? chars / e.minutes : 0
  const ch = perChannel[e.channel] || (perChannel[e.channel] = { n: 0, min: 0, b: 0 })
  ch.n++
  ch.min += e.minutes
  ch.b += real
  if (cpm > CPM_MAX) fast.push([e.id, e.minutes, chars, Math.round(cpm)])
  else if (cpm < CPM_MIN) slow.push([e.id, e.minutes, chars, Math.round(cpm)])
}

console.log('频道统计：')
for (const k of Object.keys(perChannel).sort((a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9))) {
  const v = perChannel[k]
  console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(3)} 篇  ${v.min.toFixed(0).padStart(4)} 分钟  ${(v.b / 1048576).toFixed(1)} MB`)
}
const totalMin = rows.reduce((a, e) => a + e.minutes, 0)
const totalMb = rows.reduce((a, e) => a + e.bytes, 0) / 1048576
const totalChars = rows.reduce((a, e) => a + (byId.get(e.id)?.script.length || 0), 0)
console.log(`\n合计 ${rows.length}/${scripts.length} 篇，${totalMb.toFixed(1)} MB，${(totalMin / 60).toFixed(1)} 小时，平均 ${Math.round(totalChars / totalMin)} 字/分`)
console.log(`缺失 ${missing} / 字节不符 ${sizeBad} / 过快(疑似截断) ${fast.length} / 过慢 ${slow.length}`)
for (const [id, m, c, cpm] of fast.slice(0, 25)) console.log(`  过快 ${id} ${m} 分钟 ${c} 字 = ${cpm} 字/分`)
for (const [id, m, c, cpm] of slow.slice(0, 10)) console.log(`  过慢 ${id} ${m} 分钟 ${c} 字 = ${cpm} 字/分`)

if (missing || sizeBad || fast.length || slow.length || rows.length !== scripts.length) process.exitCode = 1
