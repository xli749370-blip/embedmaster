/**
 * 补足到 24 项后的验收截图：
 * A. 装扮抽屉 —— 24 项全领，8 个框应全部到 Ⅲ
 * B. 成就列表顶部 —— 「已领取 24 / 24 项成就」
 * C. 成就卡片区 —— 看新加的 6 项排版有没有被挤坏
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://127.0.0.1:4218'
const K = 'embedmaster:achievements'
const ALL = [
  'streak3', 'streak7', 'streak21', 'checkin30', 'checkin60', 'checkin100',
  'chapter1', 'chapter5', 'chapter12', 'chapter24', 'chapter36',
  'answer10', 'answer100', 'correct50', 'correct150', 'accuracy90', 'wrongClear',
  'proj10', 'projSteps25', 'projDone1', 'projDone3', 'projDone5', 'circuit10', 'circuit25',
]
const outDir = path.resolve(process.cwd(), '../emb-archive/frames-1121')
fs.mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(BASE + '/#/profile', { waitUntil: 'networkidle2' })
await page.evaluate((k, v) => localStorage.setItem(k, JSON.stringify({ 1: v })), K, ALL)
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1800)

// 1) 装扮抽屉里的头像框区
await page.evaluate(() => document.querySelector('[title="点击更换头像与头像框"]')?.click())
await sleep(900)
const gridBox = await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('*')).find(
    (e) => e.children.length === 0 && /头像框/.test(e.textContent || '') && e.textContent.trim().length < 8,
  )
  if (!t) return null
  t.scrollIntoView({ block: 'start' })
  return true
})
await sleep(700)
await page.screenshot({ path: path.join(outDir, 'achv24-wardrobe.png') })
console.log('wardrobe scrolled:', !!gridBox)

// 2) 统计每款框的领环数（结构断言，直接从 DOM 读）
const info = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('.fring')) {
    const name = el.closest('button')?.innerText.split('\n')[0] ?? '?'
    out.push({ name, tier: el.getAttribute('data-tier'), collars: el.querySelectorAll('.fring-collar').length })
  }
  return out
})
console.log(JSON.stringify(info))

// 3) 另开一次页面看成就区（抽屉不好关，直接重载更干净）
await page.goto(BASE + '/#/profile', { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })   // 同 hash 的 goto 不会真正重载 SPA
await sleep(1600)
// 成就在「成就中心」页签里，默认落在学习进度
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find((x) => (x.innerText || '').includes('成就中心'))
  b?.click()
})
await sleep(1000)
const head = await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('p, div, span')).find(
    (e) => /项成就/.test(e.textContent || '') && (e.textContent || '').trim().length < 30,
  )
  t?.scrollIntoView({ block: 'center' })
  return t?.textContent.replace(/\s+/g, ' ').trim() ?? null
})
await sleep(800)
await page.screenshot({ path: path.join(outDir, 'achv24-head.png') })
console.log('head text:', head)

// 4) 滚到新加的高阶成就附近
await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('*')).find((e) => e.textContent?.trim() === '独当一面')
  t?.scrollIntoView({ block: 'center' })
})
await sleep(800)
await page.screenshot({ path: path.join(outDir, 'achv24-cards.png') })

await browser.close()
