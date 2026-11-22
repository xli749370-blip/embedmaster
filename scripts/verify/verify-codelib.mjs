/**
 * 代码库验收：/codelib
 * 运行前提：vite preview 已在 4182 端口
 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:4182'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
let pageErrors = 0
page.on('pageerror', (e) => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 200)) })

console.log('\n[1] 代码库 /codelib 列表页')
await page.goto(`${BASE}/#/codelib`, { waitUntil: 'networkidle2' })
await sleep(700)

let s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('列表渲染 47 个代码模块卡', s === 47, `got ${s}`)

s = await page.evaluate(() => document.body.textContent.includes('全部 (47)'))
check('分类统计条', s)

// 分类筛选
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'RTOS (4)')?.click())
await sleep(300)
s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('分类筛选「RTOS」= 4 个', s === 4, `got ${s}`)

await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '算法 (4)')?.click())
await sleep(300)
s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('分类筛选「算法」= 4 个', s === 4, `got ${s}`)

// 回到全部 + 搜索（搜代码内容）
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '全部 (47)')?.click())
await sleep(200)
await page.type('input[placeholder="搜索标题/标签/代码…"]', 'HardFault')
await sleep(300)
s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('搜索代码内容「HardFault」命中', s === 2, `got ${s}`)

// 重新加载清空搜索状态，打开详情
await page.goto('about:blank')
await page.goto(`${BASE}/#/codelib`, { waitUntil: 'networkidle2' })
await sleep(500)
await page.evaluate(() => [...document.querySelectorAll('button.card')].find((b) => b.textContent.includes('PID'))?.click())
await sleep(500)

s = await page.evaluate(() => ({
  code: document.body.textContent.includes('pid_pos') && document.body.textContent.includes('积分限幅'),
  points: document.body.textContent.includes('要点与避坑'),
  copyBtn: !!document.querySelector('pre code'),
  backBtn: document.body.textContent.includes('返回代码列表'),
}))
check('详情页代码渲染（pid_pos）', s.code)
check('要点避坑块渲染', s.points)
check('代码块 pre/code 存在', s.copyBtn)
check('返回按钮存在', s.backBtn)

// 复制按钮（execCommand 兜底路径）
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('复制代码'))?.click())
await sleep(300)
s = await page.evaluate(() => document.body.textContent.includes('已复制 ✓'))
check('复制按钮反馈「已复制 ✓」', s)

// 返回列表
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('返回代码列表'))?.click())
await sleep(300)
s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('返回列表正常', s === 47, `got ${s}`)

// 详情页关联深链（选一个带 circuit 链接的：按键扫描 g02 → c40）
await page.evaluate(() => [...document.querySelectorAll('button.card')].find((b) => b.textContent.includes('按键扫描'))?.click())
await sleep(400)
const deepLink = await page.evaluate(() => document.querySelector('a[href*="/circuit?case="]')?.getAttribute('href') || '')
check('详情页电路案例深链（g02→c40）', deepLink.includes('c40'), `got ${deepLink}`)

// 无 JS 报错
check('无运行时 JS 报错', pageErrors === 0, `errors=${pageErrors}`)

console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`)
await browser.close()
process.exit(fail ? 1 : 0)
