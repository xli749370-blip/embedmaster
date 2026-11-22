/**
 * 360px 窄屏巡检：
 * 1) 主要页面横向溢出检测（scrollWidth > clientWidth）
 * 2) 所有含 Konva 动画的章节：逐个动画检查 canvas 是否有内容（ink）
 * 3) 把每个动画卡片截图拼成一张 montage 供目检
 */
import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4184'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 动画所在章节（从 bundle 里取）
const { animations } = await import('./.tmp-anim.mjs')
const chapterIds = [...new Set(animations.filter((a) => a.is_deleted === 0).map((a) => a.chapter_id))]

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))

// ---------- 1. 页面溢出 ----------
const routes = ['/', '/courses', '/learn', '/projects', '/circuit', '/components', '/codelib', '/roadmap', '/assess', '/profile', '/esp32', '/datasheets']
const overflow = []
for (const r of routes) {
  await page.goto(`${BASE}/#${r}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(900)
  const info = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  if (info.sw > info.cw + 2) overflow.push({ route: r, over: info.sw - info.cw })
  console.log(`${r.padEnd(12)} scrollW=${info.sw} clientW=${info.cw}${info.sw > info.cw + 2 ? '  ← 溢出' : ''}`)
}

// ---------- 2. 动画 ink 检测 + 截图 ----------
const shots = []
for (const cid of chapterIds) {
  await page.goto(`${BASE}/#/chapter/${cid}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1200)
  const n = await page.evaluate(() => document.querySelectorAll('.anim-panel').length)
  for (let i = 0; i < n; i++) {
    const el = (await page.$$('.anim-panel'))[i]
    const ink = await page.evaluate((idx) => {
      const p = document.querySelectorAll('.anim-panel')[idx]
      const c = p?.querySelector('canvas')
      if (!c) return -1
      try {
        const ctx = c.getContext('2d')
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        let k = 0
        for (let j = 3; j < d.length; j += 400) if (d[j] > 8) k++
        return k
      } catch (e) { return -2 }
    }, i)
    const name = `anim-${cid}-${i}`
    if (el) await el.screenshot({ path: `${name}.png` })
    shots.push({ cid, i, ink, name })
    console.log(`chapter ${cid} anim#${i}: ink=${ink}`)
  }
}

// ---------- 3. montage ----------
const cells = shots.map((s) => `<figure><img src="${s.name}.png"><figcaption>ch${s.cid} #${s.i} ink=${s.ink}</figcaption></figure>`).join('')
writeFileSync('montage.html', `<html><body style="background:#fff;font:12px sans-serif;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
${cells}
<style>figure{margin:0;border:1px solid #ddd}img{width:100%;display:block}figcaption{padding:2px 4px;color:#666}</style></body></html>`)
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1.5 })
await page.goto(`file://${process.cwd().replace(/\\/g, '/')}/montage.html`, { waitUntil: 'networkidle0' })
await sleep(600)
await page.screenshot({ path: 'montage.png', fullPage: true })

console.log('\n溢出页面:', overflow.length ? JSON.stringify(overflow) : '无')
const blank = shots.filter((s) => s.ink <= 0)
console.log('空白动画:', blank.length ? JSON.stringify(blank) : '无')
await browser.close()
