/* 项目库验收 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:4182'
const TOTAL = 7
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  let pageErrors = 0
  page.on('pageerror', (e) => { pageErrors++; console.log('  [pageerror]', e.message) })
  await page.setViewport({ width: 1280, height: 900 })

  await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle2' })
  await sleep(700)

  /* 1. 列表 */
  let s = await page.evaluate(() => ({
    cards: document.querySelectorAll('button.card').length,
    header: document.body.textContent.includes('项目库'),
  }))
  check(`列表渲染 ${TOTAL} 个项目卡`, s.cards === TOTAL, `got ${s.cards}`)
  check('页头存在', s.header)
  await page.screenshot({ path: 'shot-projects-list.png' })

  /* 2. 逐项目：阶段/小节/代码块/检查点 */
  const EXPECT = [ // [stages, steps, minCodeBlocks, hasBom]
    [10, 26, 8, true],   // p01 平衡小车
    [7, 16, 8, true],    // p02 智能小车
    [8, 16, 4, true],    // p03 无人机
    [5, 11, 3, true],    // p04 机械臂
    [4, 8, 3, true],     // p05 旋转倒立摆
    [4, 9, 1, true],     // p06 电磁摆
    [5, 10, 7, true],    // p07 ESP32 环境监测站
  ]
  for (let i = 0; i < TOTAL; i++) {
    await page.evaluate((idx) => document.querySelectorAll('button.card')[idx].click(), i)
    await sleep(450)
    const info = await page.evaluate(() => ({
      stages: document.querySelectorAll('section[id^="stage-"]').length,
      steps: [...document.querySelectorAll('span.font-mono')].filter((el) => /^S\d/i.test(el.textContent.trim())).length,
      codes: document.querySelectorAll('pre').length,
      bom: document.body.textContent.includes('物料清单 BOM'),
      renderer: document.body.textContent.includes('实操检查点'),
    }))
    const [es, ep, ec, eb] = EXPECT[i]
    check(`项目${i + 1} 阶段数 ${info.stages}===${es}`, info.stages === es, `got ${info.stages}`)
    check(`项目${i + 1} 小节数 ${info.steps}===${ep}`, info.steps === ep, `got ${info.steps}`)
    check(`项目${i + 1} 代码块 ≥${ec}`, info.codes >= ec, `got ${info.codes}`)
    check(`项目${i + 1} BOM 表`, info.bom === eb)
    check(`项目${i + 1} 检查点渲染`, info.renderer)
    await page.screenshot({ path: `shot-project-${String(i + 1).padStart(2, '0')}.png` })
    // 返回列表
    await page.evaluate(() => [...document.querySelectorAll('button.btn-ghost')].find((b) => b.textContent.includes('返回项目列表'))?.click())
    await sleep(300)
  }

  /* 3. 打卡持久化 */
  await page.evaluate(() => document.querySelectorAll('button.card')[1].click())
  await sleep(400)
  const before = await page.evaluate(() => document.body.textContent.match(/(\d+)\/(\d+) 节/)?.slice(1).map(Number) ?? [0, 0])
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('我已完成，打卡'))
    if (btn) btn.click()
  })
  await sleep(500)
  const after = await page.evaluate(() => document.body.textContent.match(/(\d+)\/(\d+) 节/)?.slice(1).map(Number) ?? [0, 0])
  check(`打卡后进度 ${before[0]}→${after[0]}`, after[0] > before[0], `before=${before} after=${after}`)

  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(600)
  // 刷新后回到列表，重新进入同一项目再查
  await page.evaluate(() => document.querySelectorAll('button.card')[1].click())
  await sleep(400)
  const persisted = await page.evaluate(() => document.body.textContent.match(/(\d+)\/(\d+) 节/)?.slice(1).map(Number) ?? [0, 0])
  check(`刷新后进度保持 ${persisted[0]}`, persisted[0] === after[0], `got ${persisted}`)

  /* 4. 无运行时错误 */
  check('无页面运行时错误', pageErrors === 0, `got ${pageErrors}`)

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  await browser.close()
  process.exit(fail > 0 ? 1 : 0)
})()
