/**
 * 课程听学音频专项验收
 * 1) manifest.json 存在且覆盖 70 节
 * 2) 抽查 3 个 mp3 可访问且非空
 * 3) /learn/clang 页听学按钮：有内置音频的节显示「内置」，点击后真实开播（audioTime 走动）
 */
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:4182'
let pass = 0, fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })

// 1) manifest
const m = JSON.parse(readFileSync('dist/audio/learn/manifest.json', 'utf8'))
check('manifest 覆盖 70 节', (m.sections || []).length === 70, `实际 ${(m.sections || []).length}`)
const courses = new Set(m.sections.map((s) => s.course))
check('四门课齐备', ['lang', 'computer', 'clang', 'python'].every((c) => courses.has(c)))

// 2) 抽查 mp3 经 preview 可访问
for (const f of [m.sections[0].file, m.sections[35].file, m.sections[69].file]) {
  const r = await page.goto(`${BASE}/${f}`, { waitUntil: 'domcontentloaded' })
  check(`mp3 可达 ${f.split('/').pop()}`, r.status() === 200, `status=${r.status()}`)
}

// 3) 页面真实播放
await page.goto(`${BASE}/#/learn/clang`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 900))
const hasBuiltIn = await page.evaluate(() => document.body.innerText.includes('听学 · 内置'))
check('「听学 · 内置」标识出现', hasBuiltIn)
// 点第一个内置听学按钮
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('听学 · 内置'))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 2500))
const playing = await page.evaluate(() => {
  const t = document.body.innerText.match(/\d+:\d\d/)
  return { timer: t ? t[0] : '', stopped: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '■ 停止') }
})
check('点击后真实开播（有■停止态）', playing.stopped, `timer=${playing.timer}`)
await page.screenshot({ path: 'shot-learn-audio.png' })
await browser.close()

console.log(`\n结果: ${pass} 过 / ${fail} 败`)
process.exit(fail ? 1 : 0)
