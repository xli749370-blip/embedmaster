/** 线上终验：音频全量可达 + 页面溢出/内容 + 关键截图 */
import puppeteer from 'puppeteer-core'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://embedmaster-learning.app.workbuddy.host'
const SC = '?sharecode=ZHZM54FTXL'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---- 1. 音频全量 HEAD（并发 6） ---- */
const files = []
for (const g of ['learn', 'meditate', 'proj']) {
  const dir = join(process.cwd(), 'site', 'audio', g)
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp3'))) files.push(`/audio/${g}/${encodeURIComponent(f)}`)
}
let bad = []
// 线上资源受 sharecode 凭证保护：先访问首页拿 __wb_rsc cookie，再带同源 Cookie 请求
const boot = await fetch(`${BASE}/${SC}`)
const rawCookie = (boot.headers.getSetCookie?.() || [boot.headers.get('set-cookie') || '']).join('; ')
const cookie = rawCookie.split(';')[0]
console.log(`凭证: ${cookie ? cookie.slice(0, 18) + '…' : '未获取'}`)
let cursor = 0
const worker = async () => {
  while (cursor < files.length) {
    const p = files[cursor++]
    try {
      const r = await fetch(BASE + p, { method: 'HEAD', headers: { Cookie: cookie, Referer: `${BASE}/${SC}` } })
      const len = Number(r.headers.get('content-length') || 0)
      if (r.status !== 200 || len < 1000) bad.push(`${p} ${r.status}/${len}`)
    } catch (e) {
      bad.push(`${p} ERR ${e.message}`)
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
console.log(`音频线上全检：${files.length} 个，异常 ${bad.length}${bad.length ? ' → ' + bad.slice(0, 5).join(' , ') : ''}`)

/* ---- 2. 页面巡检 ---- */
const d = await import('./.tmp-anim.mjs')
const l = await import('./.tmp-learn.mjs')
const routes = [
  ...['/', '/courses', '/learn', '/projects', '/circuit', '/components', '/codelib', '/roadmap', '/assess', '/profile', '/esp32', '/datasheets'],
  ...l.learnCourses.map((t) => `/learn/${t.id}`),
  ...['302', '502', '601', '603', '706', '101', '405', '608'].map((id) => `/chapter/${id}`),
]

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
let errs = []
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)))

const probs = []
for (const r of routes) {
  errs = []
  await page.goto(`${BASE}/${SC}#${r}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(1200)
  const info = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    len: (document.body.innerText || '').replace(/\s+/g, '').length,
  }))
  const over = info.sw - info.cw
  const bad2 = []
  if (over > 2) bad2.push(`溢出${over}px`)
  if (info.len < 120) bad2.push(`内容过少 ${info.len}`)
  if (errs.length) bad2.push(`JS错误 ${errs[0]}`)
  if (bad2.length) { probs.push(r); console.log(`✗ ${r.padEnd(18)} ${bad2.join(' | ')}`) }
  else console.log(`✓ ${r.padEnd(18)} ${String(info.len).padStart(6)}字`)
}

/* ---- 3. 关键目检截图 ---- */
// 章节底部导航（曾溢出）
await page.goto(`${BASE}/${SC}#/chapter/302`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await sleep(600)
await page.screenshot({ path: 'live-ch302-bottom.png' })
// 电路 c08（桥式整流，曾重画两次）
await page.goto(`${BASE}/${SC}#/circuit`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => document.querySelectorAll('button.card')[7].click())
await sleep(900)
const el = await page.$('.anim-panel')
if (el) await el.screenshot({ path: 'live-c08.png' })
// 动画（曾空白）
await page.goto(`${BASE}/${SC}#/chapter/706`, { waitUntil: 'domcontentloaded' })
await sleep(2200)
const ink = await page.evaluate(() => {
  const c = document.querySelector('.anim-panel canvas')
  if (!c) return -1
  const dd = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let k = 0
  for (let i = 3; i < dd.length; i += 400) if (dd[i] > 8) k++
  return k
})
console.log(`\nchapter706 动画 ink = ${ink}`)

await browser.close()
const total = bad.length + probs.length + (ink > 100 ? 0 : 1)
console.log(`\n线上终验：音频异常 ${bad.length}，页面异常 ${probs.length}，动画 ${ink > 100 ? '正常' : '异常'}`)
process.exit(total ? 1 : 0)
