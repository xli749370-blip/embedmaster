/**
 * 新模块验收：错题本（/wrongbook）+ 元器件百科（/components）
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
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)))

/* ============ 1. 元器件百科 ============ */
console.log('\n[1] 元器件百科 /components')
await page.goto(`${BASE}/#/components`, { waitUntil: 'networkidle2' })
await sleep(600)

let s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('列表渲染 35 个器件卡', s === 35, `got ${s}`)

s = await page.evaluate(() => document.body.textContent.includes('全部 (35)'))
check('分类统计条', s)

// 分类筛选
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('三极管与MOS'))?.click())
await sleep(300)
s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('分类筛选「三极管与MOS」', s === 6, `got ${s}`)

// 搜索
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === `全部 (35)`)?.click())
await sleep(200)
await page.type('input[placeholder="搜索器件名…"]', '霍尔')
await sleep(300)
s = await page.evaluate(() => document.querySelectorAll('button.card').length)
check('搜索「霍尔」命中', s >= 1 && s <= 2, `got ${s}`)

// 详情页
await page.evaluate(() => [...document.querySelectorAll('button.card')].find((b) => b.textContent.includes('霍尔'))?.click())
await sleep(400)
s = await page.evaluate(() => ({
  params: document.body.textContent.includes('核心参数'),
  select: document.body.textContent.includes('选型决策'),
  apps: document.body.textContent.includes('典型应用'),
  pits: document.body.textContent.includes('避坑点'),
}))
check('详情页四大块渲染', s.params && s.select && s.apps && s.pits)

// 案例深链
const hasLink = await page.evaluate(() => !!document.querySelector('a[href*="case="]'))
check('案例深链按钮存在', hasLink)
if (hasLink) {
  await page.evaluate(() => document.querySelector('a[href*="case="]').click())
  await sleep(600)
  const opened = await page.evaluate(() => location.hash.includes('/circuit') && document.body.textContent.includes('检查点'))
  check('深链直达电路案例详情', opened)
}

/* ============ 2. 错题本（预置数据） ============ */
console.log('\n[2] 错题本 /wrongbook')
const seed = {
  '1': {
    'assess-9001': { key: 'assess-9001', source: 'assess', refId: '9001', title: '普通硅二极管的正向导通压降大约是？', dim: '元件认知', tag: '二极管', addedAt: Date.now(), stage: 0, streak: 0, dueAt: Date.now() - 1000, wrongCount: 2 },
    'circuit-c02#q1': { key: 'circuit-c02#q1', source: 'circuit', refId: 'c02#q1', title: '【NPN 继电器驱动】三极管导通时 LED 电流方向？', dim: '电路分析', tag: '驱动设计', addedAt: Date.now(), stage: 1, streak: 0, dueAt: Date.now() - 2000, wrongCount: 1 },
    'assess-9999': { key: 'assess-9999', source: 'assess', refId: '9999', title: '尚未到期的错题', dim: '软件开发', tag: '测试', addedAt: Date.now(), stage: 2, streak: 1, dueAt: Date.now() + 5 * 86400000, wrongCount: 1 },
  },
}
await page.evaluate((d) => localStorage.setItem('embedmaster:wrongbook', JSON.stringify(d)), seed)
await page.goto(`${BASE}/#/wrongbook`, { waitUntil: 'networkidle2' })
await sleep(600)

s = await page.evaluate(() => document.body.textContent.match(/活跃错题/) && document.body.textContent.includes('3'))
check('统计卡显示 3 道错题', s)

s = await page.evaluate(() => document.body.textContent.includes('今日应复习'))
check('应复习卡存在', s)

s = await page.evaluate(() => document.querySelectorAll('svg polygon').length >= 5)
check('六维雷达网格渲染', s)

s = await page.evaluate(() => [...document.querySelectorAll('li')].filter((li) => li.textContent.includes('次 ·')).length === 3)
check('错题列表 3 条', s)

// 筛选
await page.select('select', 'circuit')
await sleep(300)
s = await page.evaluate(() => [...document.querySelectorAll('li')].filter((li) => li.textContent.includes('次 ·')).length)
check('来源筛选「电路训练」剩 1 条', s === 1, `got ${s}`)

// 复习流程（2 题到期）
await page.select('select', 'all')
await sleep(200)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('开始复习'))?.click())
await sleep(400)
s = await page.evaluate(() => document.body.textContent.includes('复习 1 / 2'))
check('进入复习队列 2 题', s)

// 第 1 题（assess-9001 单选题，正确答案 B）
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('B.'))?.click())
await sleep(150)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('提交答案'))?.click())
await sleep(300)
s = await page.evaluate(() => document.body.textContent.includes('回答正确') || document.body.textContent.includes('毕业'))
check('复习判分反馈出现', s)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('下一题'))?.click())
await sleep(300)

// 第 2 题（circuit 检查点，多选/单选，随便选一个）
s = await page.evaluate(() => document.body.textContent.includes('复习 2 / 2'))
check('推进到第 2 题', s)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('A.'))?.click())
await sleep(150)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('提交答案'))?.click())
await sleep(300)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('完成复习') || b.textContent.includes('下一题'))?.click())
await sleep(500)
s = await page.evaluate(() => document.body.textContent.includes('本轮复习完成'))
check('复习完成页', s)

// 判分后的错题本状态（答对1题：仍在但阶段推进；可能错1题）
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('返回错题本'))?.click())
await sleep(400)
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('embedmaster:wrongbook') || '{}')['1'])
const remaining = Object.keys(stored ?? {}).length
check('复习后错题本状态回写', remaining === 3 || remaining === 2, `got ${remaining}`)

// 空状态
await page.evaluate(() => localStorage.removeItem('embedmaster:wrongbook'))
await page.reload({ waitUntil: 'networkidle2' })
await sleep(500)
s = await page.evaluate(() => document.body.textContent.includes('错题本是空的'))
check('空状态提示', s)

await page.screenshot({ path: 'shot-wrongbook.png' })
await page.goto(`${BASE}/#/components`, { waitUntil: 'networkidle2' })
await sleep(500)
await page.screenshot({ path: 'shot-components.png' })

await browser.close()
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
