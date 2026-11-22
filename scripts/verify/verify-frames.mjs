/**
 * 头像框进阶专项验收
 * - 成就中心 24 项、8 款框各挂 3 项（Ⅰ/Ⅱ/Ⅲ 各一）、每卡标注奖励框与阶数
 * - 阶数随已领成就递增（Ⅰ→Ⅱ→Ⅲ），环的外圈层数与呼吸动画同步
 * - 衣柜提示文案、锁定卡条件文案
 * - 360px 无横向溢出
 */
import puppeteer from 'puppeteer-core'

const RAW = process.argv[2] || 'http://127.0.0.1:4201'
// 线上站点靠 ?sharecode= 放行，query 要跟在 origin 后面、hash 前面
const _u = new URL(RAW)
const BASE = _u.origin
const Q = _u.search
const K = 'embedmaster:achievements'
let pass = 0
let fail = 0
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`) }
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`) }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const seed = async (ids) => {
  await page.evaluate((k, v) => localStorage.setItem(k, JSON.stringify(v)), K, { 1: ids })
  await page.reload({ waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1500))
}

// ---------- 1. 成就中心 ----------
console.log('\n[1] 成就中心')
await page.goto(BASE + '/' + Q + '#/profile?tab=achv', { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate((k) => localStorage.removeItem(k), K)
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1800))

const cards = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.card')).filter((c) =>
    /奖励|已获/.test(c.innerText) && /达成|学完|连续|累计|完成|答/.test(c.innerText),
  )
  return items.map((c) => (c.innerText || '').replace(/\n+/g, ' | '))
})
if (cards.length === 24) ok('成就卡数量', `${cards.length} 项`)
else bad('成就卡数量', `期望 24，实际 ${cards.length}`)

// 每个框必须恰好挂 3 项，否则有的框永远到不了 Ⅲ
const perFrame = {}
for (const nm of ['青铜环', '星银环', '鎏金环', '翡翠环', '蓝宝环', '极光环', '烈焰环', '七彩环']) {
  perFrame[nm] = cards.filter((t) => new RegExp(`(已获|奖励)[\\s|]*${nm}`).test(t)).length
}
const badFrames = Object.entries(perFrame).filter(([, n]) => n !== 3)
if (!badFrames.length) ok('每款框挂 3 项', Object.values(perFrame).join('/'))
else bad('每款框挂 3 项', badFrames.map(([k, n]) => `${k}:${n}`).join(' '))

const roman = cards.filter((t) => /[ⅠⅡⅢ]/.test(t)).length
if (roman === cards.length) ok('每张卡标注阶数', `${roman}/${cards.length}`)
else bad('每张卡标注阶数', `${roman}/${cards.length}`)

const top = await page.evaluate(() => document.body.innerText.match(/已领取 \d+ \/ \d+ 项成就/)?.[0] || '')
if (/0 \/ 24/.test(top)) ok('顶部进度', top)
else bad('顶部进度', top || '未找到')

// 同一款框在多张卡上应显示不同阶数（这正是「重复」变成「进阶」的关键）
const gold = cards.filter((t) => t.includes('鎏金环')).map((t) => (t.replace(/[\s|]/g, '').match(/鎏金环[ⅠⅡⅢ]/) || [''])[0])
if (new Set(gold).size >= 2) ok('同框不同阶数', gold.join(' / '))
else bad('同框不同阶数', gold.join(' / '))

// ---------- 2. 阶数递增 ----------
console.log('\n[2] 阶数随领取递增')
const tierCase = async (label, ids, frameName, wantText) => {
  await page.goto(BASE + '/' + Q + '#/profile', { waitUntil: 'networkidle2' })
  await seed(ids)
  const info = await page.evaluate(() => {
    const btn = document.querySelector('[title="点击更换头像与头像框"]')
    if (btn) btn.click()
    return !!btn
  })
  if (!info) { bad(`${label} 打开装扮`); return }
  await new Promise((r) => setTimeout(r, 900))
  const got = await page.evaluate((nm) => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => b.innerText.includes(nm))
    const b = btns.find((x) => x.querySelector('.fring'))
    if (!b) return null
    // 新版：环体走 CSS 变量 + .fring-body，阶位体现在领环数量与扫光上
    const ring = b.querySelector('.fring')
    const collars = ring.querySelectorAll('.fring-collar').length
    const hasSweep = !!ring.querySelector('.fring-sweep')
    const body = ring.querySelector('.fring-body')
    const bg = body ? getComputedStyle(body).backgroundImage : ''
    return {
      text: (b.innerText || '').replace(/\n/g, ' | '),
      collars,
      hasSweep,
      painted: bg && bg !== 'none',
      cls: ring.classList.contains('frame-breathe') ? 1 : 0,
      tier: ring.getAttribute('data-tier'),
    }
  }, frameName)
  if (!got) { bad(`${label} 未找到衣柜卡片`); return }
  if (got.text.includes(wantText)) ok(`${label} 文案`, got.text)
  else bad(`${label} 文案`, `期望含「${wantText}」，实际「${got.text}」`)
  return got
}

const e1 = await tierCase('翡翠Ⅰ', ['chapter1'], '翡翠环', '再 1 项升 Ⅱ')
if (e1 && e1.collars === 0 && e1.tier === '1') ok('Ⅰ 阶素环', '无领环')
else bad('Ⅰ 阶素环', `领环 ${e1?.collars ?? '?'} / tier ${e1?.tier}`)
if (e1 && e1.painted) ok('Ⅰ 阶有材质底色', '已绘制')

const e2 = await tierCase('翡翠Ⅱ', ['chapter1', 'chapter24'], '翡翠环', '再 1 项升 Ⅲ')
if (e2 && e2.collars === 1 && e2.hasSweep) ok('Ⅱ 阶单领环 + 扫光', `领环 ${e2.collars}`)
else bad('Ⅱ 阶单领环 + 扫光', `领环 ${e2?.collars ?? 0}，扫光 ${e2?.hasSweep}`)

const g3 = await tierCase('鎏金Ⅲ', ['streak7', 'correct50', 'wrongClear'], '鎏金环', '已满阶')
if (g3 && g3.collars === 2) ok('Ⅲ 阶双领环', `领环 ${g3.collars}`)
else bad('Ⅲ 阶双领环', `领环 ${g3?.collars ?? 0}`)
if (g3 && g3.cls) ok('Ⅲ 阶呼吸动画', '已挂载')
else bad('Ⅲ 阶呼吸动画', '未挂载')

// ---------- 3. 锁定卡条件 ----------
console.log('\n[3] 未解锁框的条件说明')
await page.goto(BASE + '/' + Q + '#/profile', { waitUntil: 'networkidle2' })
await seed(['chapter1'])
await page.evaluate(() => document.querySelector('[title="点击更换头像与头像框"]')?.click())
await new Promise((r) => setTimeout(r, 900))
const locked = await page.evaluate(() => {
  const t = document.body.innerText
  return { hasFlame: t.includes('烈焰环'), hasCond: /三十而立\s*·\s*六十不辍\s*·\s*百日筑基/.test(t) }
})
if (locked.hasFlame && locked.hasCond) ok('锁定卡列出全部条件', '三十而立 · 六十不辍 · 百日筑基')
else bad('锁定卡列出全部条件', JSON.stringify(locked))

// ---------- 4. 溢出 ----------
console.log('\n[4] 360px 排版')
const over = await page.evaluate(() => {
  const d = document.documentElement
  const wide = Array.from(document.querySelectorAll('*')).filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.right > d.clientWidth + 1
  })
  return { scroll: d.scrollWidth - d.clientWidth, wide: wide.length, sample: wide.slice(0, 3).map((e) => e.className?.toString().slice(0, 40)) }
})
if (over.scroll <= 1 && over.wide === 0) ok('无横向溢出', `scrollWidth-clientWidth=${over.scroll}`)
else bad('无横向溢出', JSON.stringify(over))

await page.screenshot({ path: 'shot-frames-wardrobe.png' })
await page.goto(BASE + '/' + Q + '#/profile?tab=achv', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1600))
await page.screenshot({ path: 'shot-frames-achv.png', fullPage: false })

if (errors.length) bad('JS 报错', errors.slice(0, 2).join(' | '))
else ok('无 JS 报错')

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
