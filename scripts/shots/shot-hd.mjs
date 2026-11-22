/* 高清单图截取：只截 .anim-panel 区域，2x 缩放 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4184'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CASES = process.argv[2] ? process.argv[2].split(',').map(Number) : [8, 10, 14, 39, 40, 42, 50, 59]

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/#/circuit`, { waitUntil: 'networkidle2' })
  await sleep(800)
  for (const idx of CASES) {
    await page.evaluate((i) => document.querySelectorAll('button.card')[i].click(), idx - 1)
    await sleep(400)
    const el = await page.$('.anim-panel')
    if (el) await el.screenshot({ path: `hd-${String(idx).padStart(2, '0')}.png` })
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('返回列表'))
      if (btn) btn.click()
    })
    await sleep(220)
  }
  await browser.close()
  console.log('done', CASES.join(','))
})()
