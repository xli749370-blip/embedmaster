import puppeteer from 'puppeteer-core'
const BASE = 'https://embedmaster-learning.app.workbuddy.host'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.goto(`${BASE}/?sharecode=ZHZM54FTXL`, { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1200)
await page.goto(`${BASE}/#/chapter/706?sharecode=ZHZM54FTXL`, { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2500)
const ink = await page.evaluate(() => {
  const c = document.querySelector('.anim-panel canvas')
  if (!c) return -1
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let k = 0
  for (let i = 3; i < d.length; i += 400) if (d[i] > 8) k++
  return k
})
console.log('chapter706 canvas ink =', ink)
await page.goto(`${BASE}/#/circuit?sharecode=ZHZM54FTXL`, { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1000)
await page.evaluate(() => document.querySelectorAll('button.card')[7].click())
await sleep(800)
const el = await page.$('.anim-panel')
if (el) await el.screenshot({ path: 'live-c08.png' })
console.log('done')
await browser.close()
