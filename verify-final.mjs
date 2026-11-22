/**
 * 落地前最终验收（不依赖 dev server）
 *
 * 用法： node verify-final.mjs <audio|circuit|mobile>
 *   - 在进程内起一个只读静态服务，指向构建产物目录（默认 dist）
 *   - 用子进程跑各专项脚本（子进程里 process.exit 不会杀掉服务）
 *   - 跑完关闭服务并退出，不留后台进程
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync, readFileSync, readdirSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = join(process.cwd(), process.env.ROOT_DIR || 'dist')
const PORT = Number(process.env.PORT || 4195)
const MODE = process.argv[2] || 'audio'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.apk': 'application/vnd.android.package-archive',
  '.txt': 'text/plain; charset=utf-8',
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const file = normalize(join(ROOT, p))
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return }
  let target = file
  if (!existsSync(target) || statSync(target).isDirectory()) target = join(ROOT, 'index.html') // SPA 回退
  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream'
  const size = statSync(target).size
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size })
  if (req.method === 'HEAD') { res.end(); return }
  createReadStream(target).pipe(res)
})

await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${PORT}`
process.env.BASE = BASE
console.log(`[serve] ${ROOT} → ${BASE}`)

const run = (file) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [file], { stdio: 'inherit', env: process.env })
    p.on('exit', (code) => resolve(code ?? 1))
  })

let code = 0

/* ---------- 音频可达性 ---------- */
async function auditAudio() {
  const groups = ['learn', 'meditate', 'proj', 'listen']
  let total = 0
  let bad = 0
  for (const g of groups) {
    const dir = join(process.cwd(), 'public', 'audio', g)
    if (!existsSync(dir)) { console.log(`✗ 缺少音频目录 ${g}`); bad++; continue }
    const files = readdirSync(dir).filter((f) => f.endsWith('.mp3'))
    const mf = join(dir, 'manifest.json')
    let listed = []
    if (existsSync(mf)) {
      const j = JSON.parse(readFileSync(mf, 'utf8'))
      // manifest 是对象（voice/rate/sections…），递归收集所有以 .mp3 结尾的字符串
      const walk = (v) => {
        if (typeof v === 'string') { if (v.endsWith('.mp3')) listed.push(v.split('/').pop()); return }
        if (Array.isArray(v)) { v.forEach(walk); return }
        if (v && typeof v === 'object') Object.values(v).forEach(walk)
      }
      walk(j)
    }
    console.log(`\n[${g}] mp3 ${files.length} 个，manifest 条目 ${listed.length} 条`)
    // manifest 指向的文件是否都存在
    const missing = listed.filter((f) => f && !existsSync(join(dir, f)))
    if (missing.length) { console.log(`  ✗ manifest 指向缺失文件 ${missing.length} 个：${missing.slice(0, 5).join(',')}`); bad += missing.length }
    // HTTP 可达 + 非空
    for (const f of files) {
      total++
      const r = await fetch(`${BASE}/audio/${g}/${encodeURIComponent(f)}`, { method: 'HEAD' })
      const len = Number(r.headers.get('content-length') || 0)
      if (r.status !== 200 || len < 1000) { bad++; console.log(`  ✗ ${g}/${f} status=${r.status} len=${len}`) }
    }
    // manifest 本身也要能取到
    if (existsSync(mf)) {
      const r = await fetch(`${BASE}/audio/${g}/manifest.json`, { method: 'HEAD' })
      if (r.status !== 200) { bad++; console.log(`  ✗ ${g}/manifest.json 不可达`) }
    }
  }
  console.log(`\n音频合计 ${total} 个，异常 ${bad} 处`)
  return bad ? 1 : 0
}

if (MODE === 'audio') {
  code = await auditAudio()
} else if (MODE === 'circuit') {
  code = await run('verify-circuit.mjs')
} else if (MODE === 'mobile') {
  code = await run('verify-mobile.mjs')
} else {
  console.log('未知模式')
  code = 1
}

server.close()
setTimeout(() => process.exit(code), 200)
