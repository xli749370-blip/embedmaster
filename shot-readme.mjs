/**
 * 为开源仓库 README 生成展示图
 * 输出：docs/screenshots/*.jpg（手机竖屏 390×844 @2x）
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://127.0.0.1:4219'
const outDir = path.resolve(process.cwd(), 'docs/screenshots')
fs.mkdirSync(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

async function shoot(hash, name, wait = 1900) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' }) // 同 hash 的 goto 不会真正重载 SPA
  await sleep(wait)
  await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 88 })
  console.log('saved', name)
}

// 先造一份成就数据，让衣柜里 8 个框都是 Ⅲ 阶（成就页也好看）
await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle2' })
await page.evaluate(() => {
  const ALL = [
    'streak3', 'streak7', 'streak21', 'checkin30', 'checkin60', 'checkin100',
    'chapter1', 'chapter5', 'chapter12', 'chapter24', 'chapter36',
    'answer10', 'answer100', 'correct50', 'correct150', 'accuracy90', 'wrongClear',
    'proj10', 'projSteps25', 'projDone1', 'projDone3', 'projDone5', 'circuit10', 'circuit25',
  ]
  localStorage.setItem('embedmaster:achievements', JSON.stringify({ 1: ALL }))
})

await shoot('#/', 'home')
await shoot('#/circuit?case=c14', 'circuit', 2600)
await shoot('#/meditate', 'meditate')
await shoot('#/learn', 'learn')
await shoot('#/projects', 'projects')
await shoot('#/profile?tab=achv', 'achievements')

if (errors.length) console.log('JS 报错:', errors.slice(0, 3))
await browser.close()
