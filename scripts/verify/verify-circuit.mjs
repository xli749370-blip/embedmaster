/* 电路分析训练场验收 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4184'
const TOTAL = 60
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
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.setViewport({ width: 1280, height: 900 })

  await page.goto(`${BASE}/#/circuit`, { waitUntil: 'networkidle2' })
  await sleep(700)

  /* 1. 列表 */
  let s = await page.evaluate(() => ({
    cards: document.querySelectorAll('button.card').length,
    tabs: document.body.textContent.includes('设计避坑手册'),
  }))
  check(`列表渲染 ${TOTAL} 个案例卡`, s.cards === TOTAL, `got ${s.cards}`)
  check('双 Tab 存在', s.tabs)
  await page.screenshot({ path: 'shot-circuit-list.png' })

  /* 2. 逐案例：截图原理图 + 作答 + 提交 + 分析步骤 */
  for (let i = 0; i < TOTAL; i++) {
    await page.evaluate((idx) => document.querySelectorAll('button.card')[idx].click(), i)
    await sleep(400)
    const info = await page.evaluate(() => {
      const svg = document.querySelector('.anim-panel svg')
      const rects = [...document.querySelectorAll('.anim-panel svg rect, .anim-panel svg line, .anim-panel svg path, .anim-panel svg circle, .anim-panel svg polygon, .anim-panel svg text')]
      return {
        hasSvg: !!svg,
        drawn: rects.length,
        qCount: [...document.querySelectorAll('article.card')].length,
      }
    })
    check(`案例${i + 1} 原理图绘制（${info.drawn} 个图元）`, info.hasSvg && info.drawn > 8, `drawn=${info.drawn}`)
    await page.screenshot({ path: `shot-circuit-${String(i + 1).padStart(2, '0')}.png` })

    // 作答：单选/判断选 A（多选选 AB）
    await page.evaluate(() => {
      document.querySelectorAll('article.card').forEach((card) => {
        const multi = card.textContent.includes('多选题')
        card.querySelectorAll('button').forEach((b) => {
          const key = b.querySelector('span')?.textContent.trim()
          if (key === 'A' || (multi && key === 'B')) b.click()
        })
      })
    })
    await sleep(150)
    // 提交
    await page.evaluate(() => {
      window.confirm = () => true
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('提交'))
      btn?.click()
    })
    await sleep(500)
    s = await page.evaluate(() => ({
      graded: document.body.textContent.includes('参考分析'),
      steps: document.body.textContent.match(/[①②③④⑤]/g)?.length ?? 0,
      masteredBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('已掌握')),
    }))
    check(`案例${i + 1} 提交判分 + 分析步骤（${s.steps} 步）`, s.graded && s.steps >= 4 && s.masteredBtn)
    // 点一个分析步骤 → 高亮生效（图里出现琥珀色）
    await page.evaluate(() => {
      const steps = [...document.querySelectorAll('section button')].filter((b) => b.textContent.includes('①'))
      steps[0]?.click()
    })
    await sleep(200)
    const hlOk = await page.evaluate(() => document.querySelector('.anim-panel svg')?.innerHTML.includes('#d97706') ?? false)
    check(`案例${i + 1} 高亮联动`, hlOk)
    // 已掌握 → 返回列表
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('已掌握，标记完成'))
      btn?.click()
    })
    await sleep(400)
  }

  /* 3. 进度持久化 */
  s = await page.evaluate((t) => document.body.textContent.includes(`已掌握 ${t} 例`), TOTAL)
  check(`${TOTAL} 例全部记录已掌握`, s)

  /* 4. 避坑手册 */
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('设计避坑手册'))
    btn?.click()
  })
  await sleep(400)
  s = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('article.card')].length,
    cats: document.body.textContent.includes('PCB 布局'),
    symptom: document.body.textContent.includes('现象'),
  }))
  check('避坑手册 15 条渲染', s.cards === 15, `got ${s.cards}`)
  check('现象/原因/解决结构', s.symptom && s.cats)
  await page.screenshot({ path: 'shot-pitfalls.png' })
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('标记掌握'))
    btn?.click()
  })
  await sleep(300)
  s = await page.evaluate(() => document.body.textContent.includes('已掌握 1/15'))
  check('避坑条目可标记掌握', s)

  await browser.close()
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('脚本异常:', e); process.exit(1) })
