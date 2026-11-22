// 更贴近真机的复现：Android UA + 禁 GPU + CPU 6x 降速 + 360px 视口
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE || 'http://localhost:4183'
const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-accelerated-2d-canvas', '--force-device-scale-factor=3'],
})
const page = await browser.newPage()
await page.setUserAgent(UA)
await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 160)) })

const client = await page.target().createCDPSession()
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 })

await page.goto(`${BASE}/#/chapter/706`, { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 4000))

const info = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect()
    const ctx = c.getContext('2d')
    let ink = 0
    try {
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < d.length; i += 400) if (d[i] > 8) ink++
    } catch (e) { ink = -1 }
    return { attrW: c.width, attrH: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), ink }
  })
  return { cs, wrapW: document.querySelector('.anim-panel')?.getBoundingClientRect().width }
})
console.log(JSON.stringify(info, null, 1))
await page.evaluate(() => {
  const el = document.querySelector('.anim-panel')
  if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 60)
})
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'bug-anim2.png' })
await browser.close()
console.log('done')
