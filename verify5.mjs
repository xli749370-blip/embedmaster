/* 验收脚本 v2：深色模式 / 拼音检索 / 随章小测 / 导出导入 / PWA 文件 */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:4180'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,1000'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

  const results = []
  const check = (name, ok, extra = '') => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`)
  }
  const themeBtn = 'header button[title^="当前"]'

  /* ---------- 0. PWA 文件 ---------- */
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle2' })
  const pwa = await page.evaluate(async () => {
    const out = {}
    for (const f of ['manifest.webmanifest', 'sw.js', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png']) {
      out[f] = (await fetch('./' + f)).ok
    }
    const mf = await (await fetch('./manifest.webmanifest')).json()
    return { files: out, icons: mf.icons.length, name: mf.name }
  })
  check('PWA 静态文件齐全', Object.values(pwa.files).every(Boolean), JSON.stringify(pwa.files))
  check('manifest 图标配置完整', pwa.icons === 3, pwa.name)

  /* ---------- 1. 深色模式三档循环 ---------- */
  const tip = () => page.$eval(themeBtn, (el) => el.getAttribute('title'))
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))

  // 无头 Chrome 可能偏好深色：auto 档下先记录初始状态
  const t0 = await tip()
  const d0 = await isDark()
  check('主题按钮存在且有档位提示', t0.includes('当前'), t0)

  await page.click(themeBtn) // 第 1 次点击
  await sleep(250)
  const t1 = await tip()
  const d1 = await isDark()
  check('循环第 1 步：档位顺序正确', t0.includes('跟随系统') === t1.includes('亮色') && d0 !== d1, `${t0} -> ${t1}`)

  await page.click(themeBtn) // 第 2 次：进入深色
  await sleep(250)
  const t2 = await tip()
  const d2 = await isDark()
  check('循环第 2 步：进入深色', t2.includes('深色') && d2, t2)

  // 深色下 body 背景
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('深色 body 背景为暗色', bodyBg.includes('11, 16, 30'), bodyBg)
  await page.screenshot({ path: 'shot-dark-home.png' })

  // 深色讲义页：卡片变暗 + 动画容器保持亮色（.anim-panel 豁免）
  await page.goto(BASE + '/#/chapter/701', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const cc = await page.evaluate(() => {
    const card = document.querySelector('article.card')
    const anim = document.querySelector('.anim-panel .bg-white')
    const head = document.querySelector('h1')
    return {
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      animBg: anim ? getComputedStyle(anim).backgroundColor : null,
      headColor: head ? getComputedStyle(head).color : null,
    }
  })
  check('深色讲义页卡片变暗', cc.cardBg === 'rgb(16, 24, 44)', cc.cardBg)
  check('动画容器保持亮色（豁免）', cc.animBg === 'rgb(255, 255, 255)', cc.animBg)
  check('深色下标题文字变亮', cc.headColor === 'rgb(232, 237, 248)', cc.headColor)
  await page.screenshot({ path: 'shot-dark-chapter.png' })

  /* ---------- 2. 拼音 / 模糊检索（亮色下测） ---------- */
  await page.click(themeBtn) // 深色 → auto
  await sleep(200)
  await page.click(themeBtn) // auto → light（若系统深色）或 dark；直接强制亮色：写 localStorage 再刷新
  await page.evaluate(() => localStorage.setItem('embedmaster:theme-mode', '"light"'))
  await page.goto(BASE + '/#/search?q=dsq', { waitUntil: 'networkidle2' })
  await sleep(700)
  let r = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.text-accent-600')].map((x) => x.textContent.trim()),
    count: document.querySelectorAll('a[href^="#/chapter/"]').length,
  }))
  check('dsq 命中定时器相关章节', r.count > 0, `results=${r.count}`)
  check('拼音展开提示出现（定时器）', r.chips.includes('定时器'), r.chips.join(','))

  await page.goto(BASE + '/#/search?q=dingshiqi', { waitUntil: 'networkidle2' })
  await sleep(700)
  r = await page.evaluate(() => document.querySelectorAll('a[href^="#/chapter/"]').length)
  check('dingshiqi 全拼可检索', r > 0, `results=${r}`)

  await page.goto(BASE + '/#/search?q=%E4%B8%B2%E5%8F%A3%E6%B3%A2%E7%89%B9%E7%8E%87', { waitUntil: 'networkidle2' })
  await sleep(700)
  r = await page.evaluate(() => document.querySelectorAll('a[href^="#/chapter/"]').length)
  check('中文精确检索仍正常', r > 0, `results=${r}`)

  /* ---------- 3. 随章小测（701 章，8 题库抽 3） ---------- */
  await page.goto(BASE + '/#/chapter/701', { waitUntil: 'networkidle2' })
  await sleep(1000)
  const opened = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('随章小测'))
    if (!btns.length) return false
    btns[0].click()
    return true
  })
  check('讲义页有随章小测按钮', opened)
  await sleep(500)
  let quiz = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('h3')].find((h) => h.textContent === '随章小测')
    const overlay = document.querySelector('div.fixed.inset-0')
    const cards = overlay ? overlay.querySelectorAll('article.card').length : 0
    return { open: !!modal, cards }
  })
  check('弹层打开并抽到 3 题', quiz.open && quiz.cards === 3, `cards=${quiz.cards}`)
  await page.screenshot({ path: 'shot-quiz.png' })

  const clickInCard = (idx, pick) => {
    const overlay = document.querySelector('div.fixed.inset-0')
    const cards = overlay ? [...overlay.querySelectorAll('article.card')] : []
    const card = cards[idx]
    if (!card) return
    if (pick) {
      const btn = card.querySelector('button')
      if (btn) btn.click()
    } else {
      const submit = [...card.querySelectorAll('button')].find((b) => b.textContent.includes('提交答案'))
      if (submit) submit.click()
    }
  }
  for (let i = 0; i < 3; i++) {
    await page.evaluate(clickInCard, i, true)
    await sleep(150)
    await page.evaluate(clickInCard, i, false)
    await sleep(650)
  }
  quiz = await page.evaluate(() => {
    const again = [...document.querySelectorAll('button')].some((b) => b.textContent.includes('再来一轮'))
    const goQuiz = [...document.querySelectorAll('button')].some((b) => b.textContent.includes('去刷本章全部题'))
    const summary = [...document.querySelectorAll('p')].some((p) => p.textContent.includes('吃透') || p.textContent.includes('建议回到讲义') || p.textContent.includes('差一点'))
    return { again, goQuiz, summary }
  })
  check('3 题作答后出现小结 / 再来一轮 / 去刷题', quiz.again && quiz.goQuiz && quiz.summary, JSON.stringify(quiz))
  await page.screenshot({ path: 'shot-quiz-done.png' })

  // Esc 关闭
  await page.keyboard.press('Escape')
  await sleep(300)
  quiz = await page.evaluate(() => ![...document.querySelectorAll('h3')].some((h) => h.textContent === '随章小测'))
  check('Esc 关闭小测弹层', quiz)

  /* ---------- 4. 导出 / 导入 ---------- */
  await page.goto(BASE + '/#/profile', { waitUntil: 'networkidle2' })
  await sleep(800)
  const backup = await page.evaluate(() => {
    const h3 = [...document.querySelectorAll('h3')].find((x) => x.textContent.includes('学习记录备份'))
    const exportBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('导出备份'))
    const importBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('导入备份'))
    return { present: !!h3, exportBtn: !!exportBtn, importBtn: !!importBtn }
  })
  check('个人中心有备份区块与按钮', backup.present && backup.exportBtn && backup.importBtn)

  const importFlow = await page.evaluate(async () => {
    const payload = {
      app: 'EmbedMaster',
      version: 1,
      exported_at: '2026-10-30 00:00:00',
      user: { username: 'demo', nickname: '测试备份' },
      progress: [{ chapter_id: 701, read_percent: 77, is_finished: 0, updated_at: '2026-10-30 00:00:00' }],
      answers: [
        { id: 1, user_id: 1, question_id: 1, chapter_id: 101, user_answer: 'B', is_correct: 1, created_at: '2026-10-29 10:00:00' },
        { id: 2, user_id: 1, question_id: 99999, chapter_id: 101, user_answer: 'A', is_correct: 0, created_at: '2026-10-29 10:01:00' },
      ],
      favorites: [701],
    }
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const input = document.querySelector('input[type="file"]')
    if (!input) return { ok: false, why: 'no file input' }
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 400))
    const info = [...document.querySelectorAll('span')].some((s) => s.textContent.includes('1 章进度、2 条答题'))
    const confirmBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认合并导入'))
    if (!confirmBtn) return { ok: false, why: 'no confirm btn', info }
    confirmBtn.click()
    await new Promise((r) => setTimeout(r, 1000))
    const row = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '#/chapter/701')
    return { ok: true, info, row: !!row }
  })
  check('备份概况正确展示（含无效题目过滤提示）', importFlow.ok && importFlow.info, JSON.stringify(importFlow))
  check('合并导入后 701 章进度出现在列表', importFlow.ok && importFlow.row)

  /* ---------- 汇总 ---------- */
  console.log('\n===== 验收结果 =====')
  for (const r of results) console.log(r)
  await browser.close()
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

main().catch((e) => {
  console.error('SCRIPT-ERR:', e)
  process.exit(2)
})
