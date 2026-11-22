/**
 * 把头衣柜里的「头像框」格子单独放大截取（4 倍设备像素），
 * 用来肉眼判断 Ⅰ/Ⅱ/Ⅲ 在真实 48px 尺寸下到底差多少。
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = "http://127.0.0.1:4217"
const K = 'embedmaster:achievements'
const ALL = [
  'streak3','streak7','streak21','checkin30','checkin60',
  'chapter1','chapter5','chapter12','chapter24',
  'answer10','answer100','correct50','accuracy90','wrongClear',
  'proj10','projDone1','projDone3','circuit10',
]
const outDir = path.resolve(process.cwd(), '../emb-archive/frames-1121')
fs.mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 4 })

for (const [tag, ids] of [
  ['max', ALL],
  ['mid', ['streak3', 'streak7', 'chapter1', 'chapter5', 'chapter12', 'answer10', 'answer100', 'correct50']],
]) {
  await page.goto(BASE + '/#/profile', { waitUntil: 'networkidle2' })
  await page.evaluate((k, v) => localStorage.setItem(k, JSON.stringify({ 1: v })), K, ids)
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1500)
  await page.evaluate(() => document.querySelector('[title="点击更换头像与头像框"]')?.click())
  await sleep(1000)
  const box = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll('div.grid.grid-cols-4'))
    const grid = grids.find((g) => (g.innerText || '').includes('无框') && (g.innerText || '').includes('环'))
    if (!grid) return null
    grid.scrollIntoView({ block: 'center' })
    return true
  })
  await sleep(600)
  if (!box) { console.log('grid not found'); continue }
  const b2 = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll('div.grid.grid-cols-4'))
    const grid = grids.find((g) => (g.innerText || '').includes('无框') && (g.innerText || '').includes('环'))
    const r = grid.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  await page.screenshot({ path: path.join(outDir, `grid-zoom-${tag}.png`), clip: b2 })
  console.log('saved', tag, JSON.stringify(b2))
}

await browser.close()
