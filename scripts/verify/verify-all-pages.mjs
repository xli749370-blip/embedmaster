/**
 * 全站路由巡检（自包含，不依赖任何中间产物）
 * ------------------------------------------------------------------
 * 做法：从首页出发，在同源 hash 路由上做 BFS，把站内能走到的页面全部收进来，
 * 然后逐个用 360px 手机视口打开，检查：
 *   - 横向溢出（scrollWidth > clientWidth + 1）
 *   - 页面是否空白（正文过短）
 *   - JS 运行时错误
 *   - 资源 4xx/5xx
 *
 * 用法：node verify-all-pages.mjs [maxPages]
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = join(process.cwd(), process.env.ROOT_DIR || 'dist')
const PORT = 4198
const ORIGIN = `http://127.0.0.1:${PORT}`
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MAX_PAGES = Number(process.argv[2] || 200)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

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

async function goto(hash) {
  await page.goto(ORIGIN + '/' + hash, { waitUntil: 'networkidle2', timeout: 45000 })
  await sleep(500)
}

/** 收集当前页里的同源路由 */
async function collectLinks() {
  return page.evaluate(() => {
    const out = new Set()
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || ''
      if (h.startsWith('#/')) out.add(h.replace(/^#/, ''))
      else if (h.startsWith('/') && !h.startsWith('//')) out.add(h)
    })
    return Array.from(out)
  })
}

console.log('[deps] 启动')
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

// ---------- 第一轮：BFS 收集路由 ----------
const seen = new Set(['/'])
const queue = ['/']
await goto('/#/')
let scanned = 0

while (queue.length && seen.size < MAX_PAGES) {
  const cur = queue.shift()
  scanned++
  try {
    await goto('#' + cur)
    const links = await collectLinks()
    for (const l of links) {
      const clean = l.split('?')[0]
      if (!seen.has(clean) && !/^https?:/.test(clean)) {
        seen.add(clean)
        queue.push(clean)
      }
    }
  } catch {
    /* 单个页面失败不影响整体收集 */
  }
  if (scanned % 20 === 0) console.log(`[crawl] 已访问 ${scanned}，收录 ${seen.size} 条路由`)
}

console.log(`\n[crawl] 共收录 ${seen.size} 条路由，用时 ${scanned} 次访问\n`)

// ---------- 第二轮：逐页体检 ----------
const routes = Array.from(seen).sort()
const bad = []
for (const r of routes) {
  errors.length = 0
  netFail.length = 0
  let info
  try {
    await goto('#' + r)
    info = await page.evaluate(() => {
      const de = document.documentElement
      const wide = []
      document.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect()
        if (b.width > 0 && b.right > de.clientWidth + 2) {
          wide.push(`${el.tagName}.${String(el.className || '').slice(0, 24)}`)
        }
      })
      return {
        sw: de.scrollWidth,
        cw: de.clientWidth,
        text: (document.body.innerText || '').trim().length,
        wide: wide.slice(0, 3),
      }
    })
  } catch (e) {
    bad.push({ r, why: '打开失败 ' + String(e.message).slice(0, 60) })
    continue
  }
  const problems = []
  if (info.sw > info.cw + 1) problems.push(`横向溢出 ${info.sw}>${info.cw} ${info.wide.join(',')}`)
  if (info.text < 60) problems.push(`正文过短 ${info.text} 字`)
  if (errors.length) problems.push(`JS: ${errors[0]}`)
  const nf = netFail.filter((x) => !x.includes('favicon'))
  if (nf.length) problems.push(`资源: ${nf[0]}`)
  if (problems.length) bad.push({ r, why: problems.join(' | ') })
}

console.log(`巡检 ${routes.length} 页，异常 ${bad.length} 处`)
for (const b of bad) console.log(`  ✗ ${b.r}  ${b.why}`)

await browser.close()
server.close()
if (bad.length) process.exitCode = 1
