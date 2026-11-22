// 复现：手机视口下章节页 Konva 动画是否渲染
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE || 'http://localhost:4183'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)) })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))

await page.goto(`${BASE}/#/chapter/706`, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 2500))

// 找到动画卡片（含 Konva 徽标）
const info = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect()
    const ctx = c.getContext('2d')
    let ink = 0
    try {
      const d = ctx.getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 300)).data
      for (let i = 3; i < d.length; i += 40) if (d[i] > 8) ink++
    } catch (e) { ink = -1 }
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), ink }
  })
  return { canvases, scrollH: document.body.scrollHeight }
})
console.log(JSON.stringify(info, null, 1))

// 滚到动画位置截图
const shot = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.anim-panel')][0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  window.scrollTo(0, window.scrollY + r.top - 80)
  return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
})
console.log('anim-panel:', JSON.stringify(shot))
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: 'bug-anim.png' })
await browser.close()
console.log('shot saved')
