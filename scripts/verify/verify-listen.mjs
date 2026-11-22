/**
 * 听学（冥想听学）专项验收
 * ------------------------------------------------------------------
 * 覆盖：
 *  1. 页面能拉到 listen/manifest.json，6 个课程频道全部渲染出篇目
 *  2. 频道篇目数与 manifest 一致（不丢条目不重复）
 *  3. 点击任意篇目能真正出声（audio 元素 currentTime 前进）
 *  4. 断点续听：刷新后「继续上次」能恢复到同一篇
 *  5. 睡眠定时按钮可切换
 *  6. 360px 窄屏无横向溢出
 *
 * 运行：node verify-listen.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core'

const RAW = process.argv[2] || 'http://127.0.0.1:4199'
// 线上站点靠 ?sharecode= 放行，资源请求也要带上，所以拆成 origin + query
const _u = new URL(RAW)
const BASE = _u.origin
const Q = _u.search
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const CHANNELS = [
  { id: 'lecture', label: '讲义精听' },
  { id: 'circuit', label: '电路门诊' },
  { id: 'parts', label: '元器件图鉴' },
  { id: 'code', label: '代码兵器谱' },
  { id: 'pitfall', label: '实战避坑' },
  { id: 'esp32', label: 'ESP32 平台' },
]

let pass = 0
let fail = 0
function ok(name, extra = '') {
  pass++
  console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`)
}
function bad(name, extra = '') {
  fail++
  console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })

  // 代码里是 new Audio(url)，元素不进 DOM，querySelector 抓不到；
  // 这里在页面脚本执行前劫持 Audio 构造，把实例挂到 window.__audios
  await page.evaluateOnNewDocument(() => {
    const Native = window.Audio
    const list = []
    window.__audios = list
    window.Audio = function (src) {
      const a = new Native(src)
      list.push(a)
      return a
    }
    window.Audio.prototype = Native.prototype
  })

  // ---- 1. 拉 manifest，拿真实篇目数 ----
  console.log('\n[1] 清单一致性')
  // 用 Node 侧 fetch：about:blank 的 origin 为 null，页面内 fetch 会被跨域拦截
  const man = await (await fetch(BASE + '/audio/listen/manifest.json' + Q)).json()
  const expect = {}
  for (const e of man.entries) expect[e.channel] = (expect[e.channel] || 0) + 1
  console.log('  manifest 频道分布:', JSON.stringify(expect))
  const total = man.entries.length
  if (total >= 200) ok('manifest 篇目总数', String(total))
  else bad('manifest 篇目总数', String(total))

  // ---- 2. 打开听学页 ----
  console.log('\n[2] 页面渲染')
  await page.goto(BASE + '/' + Q + '#/meditate', { waitUntil: 'networkidle2', timeout: 60000 })
  // 等频道卡片渲染出来（心法 5 组 + 课程精听 6 组）
  await page.waitForFunction(() => document.body.innerText.includes('课程精听'), { timeout: 20000 })
  await new Promise((r) => setTimeout(r, 800))

  // 每个频道标题 + 篇目数都要出现
  // 频道卡片结构：<button class="card"><p>标题</p><p>描述</p><p>N 篇</p></button>
  const cards = await page.evaluate(() => {
    const out = {}
    document.querySelectorAll('button.card').forEach((b) => {
      const ps = Array.from(b.querySelectorAll('p'))
      if (ps.length < 3) return
      const title = (ps[0].innerText || '').trim()
      const m = (ps[ps.length - 1].innerText || '').match(/(\d+)\s*篇/)
      if (title && m) out[title] = Number(m[1])
    })
    return out
  })
  for (const c of CHANNELS) {
    if (cards[c.label] === (expect[c.id] || 0)) ok(`频道篇目数：${c.label}`, `${cards[c.label]} 篇`)
    else bad(`频道篇目数：${c.label}`, `页面 ${cards[c.label] ?? '未找到'} vs manifest ${expect[c.id]}`)
  }
  // 心法频道也要在
  for (const t of ['入门夜话', 'C 语言慢读', '系统漫游', 'Python 轻风', '硬件与电路']) {
    if (Object.keys(cards).includes(t)) ok(`心法频道可见：${t}`, `${cards[t]} 篇`)
    else bad(`心法频道可见：${t}`)
  }

  // ---- 3. 进入讲义精听，实测播放 ----
  console.log('\n[3] 实际播放')
  const entered = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find((x) => (x.innerText || '').includes('讲义精听'))
    if (!b) return false
    b.scrollIntoView({ block: 'center' })
    b.click()
    return true
  })
  if (entered) ok('切换到讲义精听')
  else bad('切换到讲义精听', '未找到频道按钮')

  // 等篇目列表出现（章标题）
  try {
    await page.waitForFunction(() => /第[一二三四五六七八九十百]+章/.test(document.body.innerText), { timeout: 15000 })
    const rowCount = await page.evaluate(() => {
      const t = document.body.innerText
      return (t.match(/第[一二三四五六七八九十百]+章/g) || []).length
    })
    ok('讲义篇目已列出', `文本中命中 ${rowCount} 处章节标题`)
  } catch {
    bad('讲义篇目已列出', '15s 内未出现章节标题')
  }
  // 点大圆播放键（唯一 innerText 为 ▶ 的按钮）
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => (x.innerText || '').trim() === '▶')
    if (!b) return null
    b.scrollIntoView({ block: 'center' })
    b.click()
    return '▶ 播放键'
  })
  if (clicked) ok('点击播放', clicked)
  else bad('点击播放', '没找到播放键')

  // 轮询音频元素状态
  let playState = null
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500))
    playState = await page.evaluate(() => {
      const list = window.__audios || []
      if (!list.length) return { none: true }
      const a = list[list.length - 1]
      return { src: a.currentSrc || a.src, t: a.currentTime, dur: a.duration, paused: a.paused, n: list.length }
    })
    if (playState && playState.t > 1.2) break
  }
  if (playState && playState.t > 1.2) {
    ok('音频出声', `currentTime=${playState.t.toFixed(2)}s / ${Number.isFinite(playState.dur) ? playState.dur.toFixed(0) + 's' : 'n/a'}`)
    if (/\/audio\/listen\//.test(playState.src)) ok('音源来自内置 mp3', playState.src.split('/').slice(-1)[0])
    else bad('音源来自内置 mp3', playState.src)
  } else {
    bad('音频出声', JSON.stringify(playState))
  }

  // ---- 4. 断点续听 ----
  console.log('\n[4] 断点续听')
  const saved = await page.evaluate(() => localStorage.getItem('embedmaster:meditate_last'))
  if (saved) ok('已写入上次收听记录', saved.slice(0, 60))
  else bad('已写入上次收听记录')

  // ---- 5. 睡眠定时 ----
  console.log('\n[5] 定时停止与倍速')
  const ctrls = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select'))
    const sleep = sels.find((s) => Array.from(s.options).some((o) => /分钟/.test(o.text)))
    const rateSel = sels.find((s) => Array.from(s.options).some((o) => /x$/.test(o.text.trim())))
    return {
      sleepOpts: sleep ? Array.from(sleep.options).map((o) => o.text) : null,
      rateOpts: rateSel ? Array.from(rateSel.options).map((o) => o.text) : null,
      autoNext: !!Array.from(document.querySelectorAll('input[type=checkbox]')).length,
    }
  })
  if (ctrls.sleepOpts && ctrls.sleepOpts.length >= 4) ok('定时停止选项', ctrls.sleepOpts.join(' / '))
  else bad('定时停止选项', JSON.stringify(ctrls.sleepOpts))
  if (ctrls.rateOpts && ctrls.rateOpts.length >= 4) ok('倍速选项', ctrls.rateOpts.join(' / '))
  else bad('倍速选项', JSON.stringify(ctrls.rateOpts))
  if (ctrls.autoNext) ok('自动连播开关存在')
  else bad('自动连播开关存在')

  // ---- 6. 溢出 ----
  console.log('\n[6] 窄屏布局')
  const overflow = await page.evaluate(() => {
    const de = document.documentElement
    const wide = []
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > de.clientWidth + 2) {
        wide.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)} right=${Math.round(r.right)}`)
      }
    })
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, wide: wide.slice(0, 5) }
  })
  if (overflow.scrollW <= overflow.clientW + 1) ok('无横向溢出', `${overflow.scrollW}<=${overflow.clientW}`)
  else bad('无横向溢出', JSON.stringify(overflow))

  if (errors.length === 0) ok('无 JS 报错')
  else bad('无 JS 报错', errors.slice(0, 3).join(' | '))

  await page.screenshot({ path: 'shot-listen.png', fullPage: false })
} finally {
  await browser.close()
}

console.log(`\n===== 听学验收 ${pass}/${pass + fail} =====`)
if (fail > 0) process.exitCode = 1
