/**
 * 定点巡检：课程详情 + 42 个讲义章节 + 理论学习页
 * ------------------------------------------------------------------
 * 这些页面不能从列表页 <a> 直接爬到（课程→章节是二级跳转，理论是卡片点击），
 * 所以按 id 直接点名访问，逐页查横向溢出 / 空白 / JS 报错 / 资源失败。
 *
 * 用法：node verify-key-pages.mjs [extra-route...]
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = join(process.cwd(), process.env.ROOT_DIR || 'dist')
const PORT = 4194
const ORIGIN = `http://127.0.0.1:${PORT}`
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.apk': 'application/vnd.android.package-archive',
  '.txt': 'text/plain; charset=utf-8',
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const f = normalize(join(ROOT, p))
  if (!existsSync(f) || !statSync(f).isFile()) return void res.writeHead(404).end('x')
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
  createReadStream(f).pipe(res)
})

const CHAPTERS = [
  101, 102, 103,
  200, 201, 202, 203, 204, 205,
  301, 302, 303, 304, 305, 306, 307,
  401, 402, 403, 404, 405,
  501, 502, 503, 504, 505, 506, 507,
  601, 602, 603, 604, 605, 606, 607, 608,
  701, 702, 703, 704, 705, 706,
]
const COURSES = [1, 2, 3, 4, 5, 6, 7]
const LEARN_TRACKS = ['lang', 'computer', 'clang', 'python']

const routes = [
  '/courses',
  ...COURSES.map((i) => `/course/${i}`),
  ...CHAPTERS.map((i) => `/chapter/${i}`),
  '/learn',
  ...LEARN_TRACKS.map((t) => `/learn/${t}`),
  '/quiz', '/assess', '/circuit', '/components', '/codelib', '/wrongbook',
  '/projects', '/meditate', '/esp32', '/datasheets', '/roadmap', '/ai',
  '/lab', '/search', '/report', '/profile',
  ...process.argv.slice(2),
]

console.log(`[deps] ${routes.length} 条定向路由`)
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120))
})
const netFail = []
page.on('response', (r) => {
  if (r.status() >= 400) netFail.push(`${r.status()} ${r.url().replace(ORIGIN, '')}`)
})

const bad = []
for (const r of routes) {
  errors.length = 0
  netFail.length = 0
  try {
    await page.goto(ORIGIN + '/#' + r, { waitUntil: 'networkidle2', timeout: 45000 })
    await sleep(420)
  } catch (e) {
    bad.push({ r, why: '打开失败 ' + String(e.message).slice(0, 60) })
    continue
  }
  const info = await page.evaluate(() => {
    const de = document.documentElement
    const wide = []
    document.querySelectorAll('*').forEach((el) => {
      const b = el.getBoundingClientRect()
      if (b.width > 0 && b.right > de.clientWidth + 2) {
        wide.push(`${el.tagName}.${String(el.className || '').slice(0, 24)}`)
      }
    })
    return { sw: de.scrollWidth, cw: de.clientWidth, text: (document.body.innerText || '').trim().length, wide: wide.slice(0, 3) }
  })
  const p = []
  if (info.sw > info.cw + 1) p.push(`横向溢出 ${info.sw}>${info.cw} ${info.wide.join(',')}`)
  if (info.text < 60) p.push(`正文过短 ${info.text}`)
  if (errors.length) p.push(`JS: ${errors[0]}`)
  const nf = netFail.filter((x) => !x.includes('favicon'))
  if (nf.length) p.push(`资源: ${nf[0]}`)
  if (p.length) bad.push({ r, why: p.join(' | ') })
}

console.log(`巡检 ${routes.length} 页，异常 ${bad.length} 处`)
for (const b of bad) console.log(`  ✗ ${b.r}  ${b.why}`)

await browser.close()
server.close()
if (bad.length) process.exitCode = 1
