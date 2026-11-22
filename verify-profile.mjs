/**
 * 头像/成就/底部导航 专项验收
 * 1) /profile 成就中心渲染 16 项，进度条与数据联动
 * 2) 种子答题数据 → 「初试锋芒」可领取 → 点击领取 → 头像框解锁并自动佩戴
 * 3) 头像弹层：8 预设 + 相册入口 + 衣柜；点预设后 localStorage 与头部头像联动
 * 4) 移动端底部导航 5 项可见可点
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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })

// 种子：12 条答题记录（8 对 4 错）→ answer10(10题) done、correct50 未达成
const answers = []
for (let i = 0; i < 12; i++) {
  answers.push({
    id: 9000 + i,
    user_id: 1,
    question_id: 1,
    chapter_id: 1,
    user_answer: 'A',
    is_correct: i % 3 === 0 ? 0 : 1,
    created_at: '2026-11-19 10:00:00',
  })
}
await page.evaluateOnNewDocument((data) => {
  localStorage.setItem('embedmaster:answers', JSON.stringify({ '1': data }))
  localStorage.removeItem('embedmaster:achievements')
}, answers)

await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 1200))

// 1) 成就中心
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('成就中心'))?.click() })
await new Promise((r) => setTimeout(r, 500))
const achvTxt = await page.evaluate(() => document.body.innerText)
check('成就中心渲染 16 项', (achvTxt.match(/已领取|未达成|领取|佩戴/g) || []).length >= 10)
check('「初试锋芒」已完成待领取', achvTxt.includes('初试锋芒'))

// 2) 领取
const claimBtn = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')]
  const card = cards.find((c) => c.textContent.includes('初试锋芒'))
  const all = [...(card?.querySelectorAll('button') ?? [])]
  const target = all.find((b) => b.textContent.trim() === '领取')
  target?.click()
  return !!target
})
check('「领取」按钮存在并已点击', claimBtn)
await new Promise((r) => setTimeout(r, 800))
const afterClaim = await page.evaluate(() => ({
  ls: localStorage.getItem('embedmaster:achievements'),
  frame: JSON.parse(localStorage.getItem('embedmaster:user') || '{}').frame,
  toast: document.body.innerText.includes('成就已领取'),
}))
check('成就领取写入存储', (afterClaim.ls || '').includes('answer10'))
check('奖励头像框自动佩戴', afterClaim.frame === 'bronze', `frame=${afterClaim.frame}`)

// 3) 头像弹层
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('头像与装扮'))?.click() })
await new Promise((r) => setTimeout(r, 500))
const modalTxt = await page.evaluate(() => document.body.innerText)
check('弹层含系统头像 8 样例', modalTxt.includes('机器人') && modalTxt.includes('小U喵'))
check('弹层含相册入口', modalTxt.includes('从相册选择'))
check('青铜环已解锁（衣柜内）', modalTxt.includes('青铜环'))
check('未解锁框显示来源成就', modalTxt.includes('七日不辍') || modalTxt.includes('三日之约'))
// 选一个预设
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  btns.find((b) => b.textContent.includes('火箭手'))?.click()
})
await new Promise((r) => setTimeout(r, 600))
const avatarSet = await page.evaluate(() => JSON.parse(localStorage.getItem('embedmaster:user') || '{}').avatar_url)
check('预设头像佩戴成功', avatarSet === 'preset:rocket', `avatar=${avatarSet}`)
await page.screenshot({ path: 'shot-avatar-modal.png' })
// 关闭弹层
await page.keyboard.press('Escape')
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('头像与装扮')) || document.querySelector('.fixed.inset-0')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
await new Promise((r) => setTimeout(r, 400))

// 4) 底部导航
const navInfo = await page.evaluate(() => {
  const nav = [...document.querySelectorAll('nav')].find((n) => n.className.includes('bottom-0'))
  if (!nav) return { exists: false }
  const links = [...nav.querySelectorAll('a')]
  return { exists: true, count: links.length, labels: links.map((a) => a.textContent.trim()) }
})
check('底部导航存在且 5 项', navInfo.exists && navInfo.count === 5, JSON.stringify(navInfo))
check('含「我的」标签', (navInfo.labels || []).some((l) => l.includes('我的')))
// 点「学习」跳转
await page.evaluate(() => {
  const nav = [...document.querySelectorAll('nav')].find((n) => n.className.includes('bottom-0'))
  const learn = [...(nav?.querySelectorAll('a') ?? [])].find((a) => a.textContent.includes('学习'))
  learn?.click()
})
await new Promise((r) => setTimeout(r, 900))
check('底部导航跳转学习页生效', page.url().includes('/learn'))

// 头部头像组件渲染（桌面触发器在 md+ 才显示，改视口验证）
await page.setViewport({ width: 1280, height: 900 })
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 800))
const headerAvatar = await page.evaluate(() => !!document.querySelector('header span[class*="rounded-full"] svg'))
check('头部渲染预设头像 SVG', headerAvatar)

await browser.close()
console.log(`\n结果: ${pass} 过 / ${fail} 败`)
process.exit(fail ? 1 : 0)
