/* 电路图截图脚本：60 例全截 + 保存 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:4183'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.setViewport({ width: 1100, height: 820 })
  await page.goto(`${BASE}/#/circuit`, { waitUntil: 'networkidle2' })
  await sleep(800)
  const total = await page.evaluate(() => document.querySelectorAll('button.card').length)
  console.log('cases:', total)
  for (let i = 0; i < total; i++) {
    await page.evaluate((idx) => document.querySelectorAll('button.card')[idx].click(), i)
    await sleep(320)
    await page.screenshot({ path: `shot2-${String(i + 1).padStart(2, '0')}.png` })
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('返回列表'))
      if (btn) btn.click()
    })
    await sleep(200)
  }
  await browser.close()
  console.log('done')
})()
