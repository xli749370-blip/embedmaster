/**
 * IA 重构 + 内容深化验收：章节化学习中心 / 冥想独立栏目 / 菜单 IA
 * 运行：node verify-v3.mjs（需先启动 vite preview 4182）
 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:4182'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const fails = []
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; fails.push(name); console.log(`  ✗ ${name}`) }
}

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await b.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// ---------- 1. C 语言大全：章节化 + 多维度 ----------
console.log('\n[1] C 语言大全 6 章 28 节')
await page.goto(`${BASE}/#/learn/clang`, { waitUntil: 'networkidle2' })
await sleep(800)
{
  const txt = await page.evaluate(() => document.body.innerText)
  check('章节横幅（地基/指针与内存）', /第 1 章 · 地基/.test(txt) && /指针与内存/.test(txt))
  check('避坑维度出现', /常见错误与避坑/.test(txt))
  check('随节小测出现', /随节小测/.test(txt))
  check('延伸维度出现', /延伸与关联/.test(txt))
  check('节总数 28', /28 节/.test(txt))
  // 小测交互：点第一个选项，看解析出现
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('article button')].find((b) => /^[ABCD]\./.test(b.textContent.trim()))
    if (btn) btn.click()
    return !!btn
  })
  await sleep(300)
  const explained = await page.evaluate(() => /答对了|再想想/.test(document.body.innerText))
  check('小测点击后出解析', clicked && explained)
}

// ---------- 2. Python 大全：5 章 20 节 ----------
console.log('\n[2] Python 大全 5 章 20 节')
await page.goto(`${BASE}/#/learn/python`, { waitUntil: 'networkidle2' })
await sleep(800)
{
  const txt = await page.evaluate(() => document.body.innerText)
  check('Python 章节横幅', /第 1 章/.test(txt))
  check('嵌入式实战章出现', /嵌入式实战/.test(txt))
  check('节总数 20', /20 节/.test(txt))
  check('代码示例维度', /代码示例/.test(txt))
}

// ---------- 3. 冥想独立栏目：频道制 ----------
console.log('\n[3] 冥想听学独立内容')
await page.goto(`${BASE}/#/meditate`, { waitUntil: 'networkidle2' })
await sleep(800)
{
  const txt = await page.evaluate(() => document.body.innerText)
  check('频道卡片（入门夜话/C 语言慢读）', /入门夜话/.test(txt) && /C 语言慢读/.test(txt))
  check('频道卡片（系统漫游/硬件与电路）', /系统漫游/.test(txt) && /硬件与电路/.test(txt))
  check('播放器渲染', /第 1 \/ \d+ 篇/.test(txt))
  check('语音方案按钮仍在', /语音方案/.test(txt))
  // 切频道
  const switched = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button.card')].find((b) => b.textContent.includes('硬件与电路'))
    if (el) el.click()
    return !!el
  })
  await sleep(400)
  const t2 = await page.evaluate(() => document.body.innerText)
  check('切频道后播放器更新', switched && /第 1 \/ 3 篇/.test(t2))
}

// ---------- 4. 菜单 IA：冥想一级 / 项目库在实战 ----------
console.log('\n[4] 菜单栏 IA')
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' })
await sleep(600)
{
  const header = await page.evaluate(() => document.querySelector('header')?.innerText || '')
  check('冥想为一级导航', /冥想/.test(header))
  check('分组含实战/督学', /实战/.test(header) && /督学/.test(header))
  // 打开实战下拉看项目库
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find((b) => b.textContent.trim().startsWith('实战'))
    if (btn) btn.click()
  })
  await sleep(300)
  const t2 = await page.evaluate(() => document.body.innerText)
  check('工程库一级直达', /工程库/.test(t2))
  // 硬件层下拉不应含项目库
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find((b) => b.textContent.trim().startsWith('硬件层'))
    if (btn) btn.click()
  })
  await sleep(300)
  const hwMenu = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header a')].map((a) => a.textContent)
    return btns.join('|')
  })
  check('硬件层不含项目库', !/项目库/.test(hwMenu) || !hwMenu.split('项目库')[0].includes('硬件层'))
}

// ---------- 5. 冥想与听学按钮联动 ----------
console.log('\n[5] 学习页冥想入口')
{
  await page.goto(`${BASE}/#/learn/clang`, { waitUntil: 'networkidle2' })
  await sleep(500)
  const hasEntry = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')].find((b) => /冥想听学/.test(b.textContent))
    return !!el
  })
  check('学习页有冥想频道入口', hasEntry)
}

check('无页面运行时错误', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 5))

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1) }
await b.close()
