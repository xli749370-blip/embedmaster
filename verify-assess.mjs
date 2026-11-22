/* 效果检测页验收脚本 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:4182'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} ${extra}`)
  }
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

  /* 1. 选卷页 */
  await page.goto(`${BASE}/#/assess`, { waitUntil: 'networkidle2' })
  await sleep(600)
  let s = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('button')].filter((b) => /卷/.test(b.textContent)).length,
    historyEmpty: !!document.body.textContent.includes('还没有检测记录'),
  }))
  check('选卷页渲染 3 张考卷卡', s.cards >= 3, `got ${s.cards}`)
  check('空历史提示', s.historyEmpty)
  await page.screenshot({ path: 'shot-assess-pick.png' })

  /* 2. 进入硬件综合卷 */
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('硬件综合卷'))
    btn.click()
  })
  await sleep(500)
  s = await page.evaluate(() => ({
    questions: document.querySelectorAll('article.card').length,
    timer: !!document.body.textContent.match(/\d{2}:\d{2}/),
    answered0: !!document.body.textContent.includes('已答 0/12'),
  }))
  check('硬件卷 12 题', s.questions === 12, `got ${s.questions}`)
  check('倒计时运行', s.timer)
  check('进度 0/12', s.answered0)

  /* 3. 作答：每题选 A（多选题全选） */
  for (let i = 0; i < 12; i++) {
    await page.evaluate((idx) => {
      const card = document.querySelectorAll('article.card')[idx]
      const btns = [...card.querySelectorAll('button')]
      const multi = card.textContent.includes('多选题')
      btns.forEach((b) => {
        const key = b.querySelector('span')?.textContent.trim()
        if (key === 'A' || (multi && key === 'B')) b.click()
      })
    }, i)
    await sleep(60)
  }
  s = await page.evaluate(() => document.body.textContent.includes('已答 12/12'))
  check('全部作答 12/12', s)
  await page.screenshot({ path: 'shot-assess-exam.png' })

  /* 4. 交卷 → 成绩单 */
  await page.evaluate(() => window.confirm = () => true)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('交卷'))
    btn.click()
  })
  await sleep(900)
  s = await page.evaluate(() => ({
    hasScore: !!document.querySelector('svg circle') && !!document.body.textContent.match(/答对 \d+\/12/),
    hasReview: !!document.body.textContent.includes('逐题解析'),
    saved: !document.body.textContent.includes('正在保存成绩'),
  }))
  check('成绩单出现（总分环 + 答对统计）', s.hasScore)
  check('逐题解析渲染', s.hasReview)
  check('成绩已保存', s.saved)
  await page.screenshot({ path: 'shot-assess-result.png' })

  /* 5. 分维度/薄弱推荐/历史 */
  s = await page.evaluate(() => ({
    weak: document.body.textContent.includes('薄弱考点'),
    chapterLinks: [...document.querySelectorAll('a')].filter((a) => a.getAttribute('href')?.includes('#/chapter/')).length,
  }))
  check('薄弱考点区出现', s.weak)
  check('推荐章节链接生成', s.chapterLinks > 0, `got ${s.chapterLinks}`)

  /* 6. 再来一套 → 返回选卷 → 历史已有记录 */
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('返回选卷'))
    btn.click()
  })
  await sleep(500)
  s = await page.evaluate(() => !document.body.textContent.includes('还没有检测记录'))
  check('历史记录持久化', s)

  /* 7. 导航高亮 + 首页入口 */
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' })
  await sleep(400)
  s = await page.evaluate(() => [...document.querySelectorAll('a')].some((a) => a.getAttribute('href')?.includes('#/assess')))
  check('首页 CTA 有检测入口', s)
  // IA 重构后「效果检测」收纳进「实战」下拉（收起时不渲染），改为验证分组入口存在
  const navOk = await page.evaluate(() => {
    const nav = [...document.querySelectorAll('nav button, nav a')]
    return nav.some((a) => a.textContent.includes('实战'))
  })
  check('导航含「实战」分组（效果检测入口）', navOk)
  await page.screenshot({ path: 'shot-assess-home.png' })

  await browser.close()
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
