/**
 * 截取真实 App 内的头像框效果（装扮抽屉 + 个人页右上角头像）
 * 场景 A：0 项成就 → 全部 Ⅰ（部分锁定，只有已解锁款可见）
 * 场景 B：全部 18 项成就已领 → 每款都到自己的满阶（Ⅲ 或 Ⅱ）
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
fs.mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(ids, tag) {
  await page.goto(BASE + '/#/profile', { waitUntil: 'networkidle2' })
  await page.evaluate(
    (k, v) => (v.length ? localStorage.setItem(k, JSON.stringify({ 1: v })) : localStorage.removeItem(k)),
    K,
    ids,
  )
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1500)
  // 打开装扮抽屉
  await page.evaluate(() => document.querySelector('[title="点击更换头像与头像框"]')?.click())
  await sleep(900)
  // 抽屉内部滚到「头像框」区域
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('*')).find(
      (e) => e.children.length === 0 && /头像框/.test(e.textContent || '') && e.textContent.trim().length < 8,
    )
    t?.scrollIntoView({ block: 'start' })
  })
  await sleep(600)
  await page.screenshot({ path: path.join(outDir, `wardrobe-${tag}.png`) })

  // 再看一眼个人页顶部头像（真实佩戴位置）
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const close = btns.find((b) => /关闭|完成|×/.test(b.innerText))
    close?.click()
  })
  await sleep(500)
  await page.screenshot({ path: path.join(outDir, `profile-${tag}.png`) })
  console.log('saved', tag)
}

await shoot([], 'tierA-none')
await shoot(ALL, 'tierB-max')
// 只领锡金/翡翠之类单阶，看 Ⅰ 阶在大屏上的基础观感
await shoot(['streak7', 'chapter1', 'answer10', 'circuit10'], 'tierC-mixed')

await browser.close()
