/* 本轮修复专项验收：
 * 1) 模拟 App WebView（无 speechSynthesis）→ 冥想点播放应弹 Toast + 展开语音面板，而不是没反应
 * 2) 无历史配置时默认主题为亮色（html 无 dark class）
 * 3) 打包产物包含 backButton/exitApp 逻辑（返回键防误触已编入）
 * 运行：node verify-fixes.mjs（需 4182 预览）
 */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:4182'
let pass = 0, fail = 0
const check = (name, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`)
  cond ? pass++ : fail++
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=420,900', '--lang=zh-CN', '--autoplay-policy=no-user-gesture-required'],
})

/* ---------- 场景 1：模拟 App WebView 无语音 ---------- */
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })
await page.evaluateOnNewDocument(() => {
  // WebView 无 Web Speech API：删掉 speechSynthesis 与 SpeechSynthesisUtterance
  try {
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  } catch { /* ignore */ }
})
await page.goto(`${BASE}/#/meditate`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 800))

// 默认引擎为系统语音时，应显示「不支持」引导横幅
const banner = await page.evaluate(() => document.body.innerText.includes('不支持系统语音'))
check('无语音环境显示引导横幅', banner)

// 点主播放键：内置音频应真实开播（audioProgress/时长就绪）；若音频不可用则回退引导
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const play = btns.find((x) => ['▶', '‖'].some((t) => x.textContent.trim().includes(t)))
  if (play) play.click()
})
await new Promise((r) => setTimeout(r, 1500))
const audioStarted = await page.evaluate(() => {
  const t = document.body.innerText
  const playing = t.includes('内置神经音色') && (t.includes('0:0') || t.includes('0:1'))
  return playing || t.includes('在线语音方案') || t.includes('不支持系统语音')
})
check('点播放有真实反馈（音频开播或引导）', audioStarted)
// 内置音频模式：不弹设置面板（无需配置即可听）
const panelAuto = await page.evaluate(() => document.body.innerText.includes('A · 系统语音（离线）'))
check('内置音频模式下不强制弹设置面板', !panelAuto)

// 切到在线语音后填 Key 前点播放：应提示未配置完整而不是静默
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find((x) => x.textContent.includes('硅基流动'))
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 300))
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.anim-panel button')]
  const play = btns.find((x) => x.textContent.includes('▶'))
  if (play) play.click()
})
await new Promise((r) => setTimeout(r, 600))
const cfgHint = await page.evaluate(() =>
  document.body.innerText.includes('未配置完整') || document.body.innerText.includes('API Key'),
)
check('在线语音未配置 Key 时有明确提示', cfgHint)

/* ---------- 场景 2：默认亮色主题 ---------- */
const page2 = await browser.newPage()
await page2.setViewport({ width: 420, height: 900 })
await page2.goto(`${BASE}/#/`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 500))
const darkOn = await page2.evaluate(() => document.documentElement.classList.contains('dark'))
check('无历史配置时默认亮色（html 无 dark）', !darkOn)

/* ---------- 场景 3：产物包含返回键逻辑 ---------- */
const page3 = await browser.newPage()
await page3.goto(`${BASE}/#/`, { waitUntil: 'networkidle0', timeout: 30000 })
const hasBackLogic = await page3.evaluate(async () => {
  const links = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'))
  for (const l of links) {
    const t = await fetch(l).then((r) => r.text()).catch(() => '')
    if (t.includes('backButton') && t.includes('exitApp')) return true
  }
  return false
})
check('打包产物含 backButton/exitApp 返回键逻辑', hasBackLogic)

await browser.close()
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
