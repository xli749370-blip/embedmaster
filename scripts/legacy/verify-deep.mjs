/**
 * 全站深度巡检（落地前保障）
 * 覆盖：7 门课程详情 + 42 个讲义章节 + 4 条理论轨道 + 70 节理论小节 + 全部独立页面
 * 每页检查：横向溢出 / 正文是否为空 / JS 报错 / 资源 4xx-5xx
 *
 * 用法：node verify-deep.mjs <a|b>   （a=课程+讲义，b=理论+独立页）
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = join(process.cwd(), process.env.ROOT_DIR || 'dist')
const PORT = 4197
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const f = normalize(join(ROOT, p))
  let t = f
  if (!f.startsWith(ROOT) || !existsSync(t) || statSync(t).isDirectory()) t = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(t).toLowerCase()] || 'application/octet-stream', 'Content-Length': statSync(t).size })
  if (req.method === 'HEAD') { res.end(); return }
  createReadStream(t).pipe(res)
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${PORT}`

const d = await import('./.tmp-anim.mjs')
const l = await import('./.tmp-learn.mjs')
const SET = process.argv[2] || 'a'

let routes = []
if (SET === 'a') {
  routes = [
    ...d.courses.map((c) => ({ r: `/course/${c.id}` })),
    ...d.chapters.map((c) => ({ r: `/chapter/${c.id}` })),
    { r: '/quiz' },
    { r: `/quiz/${d.chapters[0].id}` },
  ]
} else {
  routes = [
    ...l.learnCourses.map((t) => ({ r: `/learn/${t.id}`, sections: t.sections.length, track: t.id === 'clang' })),
    ...['/wrongbook', '/ai', '/lab', '/search', '/report', '/meditate', '/datasheets', '/esp32',
      '/roadmap', '/profile', '/assess', '/components', '/codelib', '/nope-404'].map((r) => ({ r })),
  ]
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
let errs = []
let badRes = []
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 130)))
page.on('response', (r) => {
  const s = r.status()
  const u = r.url()
  if (s >= 400 && !u.includes('favicon')) badRes.push(`${s} ${u.replace(BASE, '')}`)
})

const probs = []
for (const item of routes) {
  const r = item.r
  errs = []; badRes = []
  await page.goto(`${BASE}/#${r}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(1100)
  const info = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    len: (document.body.innerText || '').replace(/\s+/g, '').length,
    h1: document.querySelector('h1,h2')?.textContent?.trim().slice(0, 24) || '',
    h3: document.querySelectorAll('article h3, section h3, h3').length,
  }))
  // 理论课：小节标题数应与数据一致
  if (item.sections !== undefined && info.h3 !== item.sections) {
    probs.push({ r, bad: [`小节数 ${info.h3}≠${item.sections}`] })
    console.log(`✗ ${r.padEnd(26)} 小节数 ${info.h3} ≠ ${item.sections}`)
    continue
  }
  // clang 双轨：切到另一条轨（通用 C 轨），确认同样渲染
  if (item.track) {
    const swapped = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => /嵌入式|通用/.test(b.textContent || ''))
      const other = btns.find((b) => !/bg-brand-600/.test(b.className))
      if (!other) return -1
      other.click()
      return 1
    })
    await sleep(700)
    const after = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      h3: document.querySelectorAll('h3').length,
    }))
    if (swapped === 1 && (after.h3 < 5 || after.sw > after.cw + 2)) {
      probs.push({ r: r + ' [双轨切换]', bad: [`切换后 h3=${after.h3} 溢出${after.sw - after.cw}`] })
      console.log(`✗ ${r} 双轨切换后异常 h3=${after.h3}`)
    }
  }
  const over = info.sw - info.cw
  const isQuiz = r.startsWith('/quiz')
  const minLen = r === '/nope-404' ? 4 : isQuiz ? 60 : 120
  const bad = []
  if (over > 2) bad.push(`溢出${over}px`)
  if (info.len < minLen) bad.push(`内容过少(${info.len})`)
  if (errs.length) bad.push(`JS错误:${errs[0]}`)
  if (badRes.length) bad.push(`资源:${badRes[0]}`)
  if (bad.length) {
    probs.push({ r, bad })
    console.log(`✗ ${r.padEnd(26)} ${bad.join(' | ')}`)
  } else {
    console.log(`✓ ${r.padEnd(26)} ${String(info.len).padStart(6)}字 h3=${info.h3}  ${info.h1}`)
  }
}

await browser.close()
server.close()
console.log(`\n巡检 ${routes.length} 个页面，异常 ${probs.length} 个`)
setTimeout(() => process.exit(probs.length ? 1 : 0), 200)
