/**
 * 大头像（72/64）与顶栏小头像（26/30）的真实观感 —— 环的装饰在 26px 下会不会变噪点、
 * 会不会被父容器的 overflow 裁掉。
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = 'http://127.0.0.1:4217'
const K = 'embedmaster:achievements'
const ALL = [
  'streak3','streak7','streak21','checkin30','checkin60',
  'chapter1','chapter5','chapter12','chapter24',
  'answer10','answer100','correct50','accuracy90','wrongClear',
  'proj10','projDone1','projDone3','circuit10',
]
const outDir = path.resolve(process.cwd(), '../emb-archive/frames-1121')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 4 })
await page.goto(BASE + '/#/profile', { waitUntil: 'networkidle2' })
await page.evaluate((k, v) => {
  localStorage.setItem(k, JSON.stringify({ 1: v }))
  // 让用户戴上鎏金环（Ⅲ 阶），头像也用预设头像，靠近真实状态
  localStorage.setItem('embedmaster:user', JSON.stringify({ avatar_url: 'preset:bot', frame: 'gold', nickname: '李新成' }))
}, K, ALL)
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1800)

// 顶部区域（含顶栏小头像 + 资料卡大头像）
await page.screenshot({ path: path.join(outDir, 'avatar-sizes.png'), clip: { x: 0, y: 0, width: 390, height: 330 } })
console.log('saved avatar-sizes.png')

// 单独把两个头像放大取景
const boxes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.fring')).map((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x - 14, y: r.y - 14, w: r.width + 28, h: r.height + 28 }
  })
})
console.log('fring count', boxes.length, boxes[0])
await browser.close()
