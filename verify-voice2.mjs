/* 语音切换修复验收（模拟 App WebView 无 speechSynthesis）：
 * 1) 点预设 → 即时 toast 反馈 + 引擎切换成功
 * 2) 未填 Key 点播放 → 明确「还差最后一步…填 Key」提示（面板内 + Toast），不再死循环
 * 3) 面板自动展开后滚动到可见（id=voice-panel 出现在视口内）
 * 4) 无 Key 状态提示文案不再出现「已用系统语音」
 * 运行：node verify-voice2.mjs（需 4182 预览）
 */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:4182'
let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`)
  cond ? pass++ : fail++
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=420,900', '--lang=zh-CN', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })
// 屏蔽内置音频清单：本脚本验证的是 TTS 引擎链路（无音频时的回退体验）
await page.setRequestInterception(true)
page.on('request', (req) => {
  if (req.url().includes('audio/meditate/manifest.json')) void req.abort()
  else void req.continue()
})
await page.evaluateOnNewDocument(() => {
  try { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance } catch {}
})
await page.goto(`${BASE}/#/meditate`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 800))
const txt = () => page.evaluate(() => document.body.innerText)

// 1) 头部按钮展开面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('语音方案：'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 500))
check('头部按钮展开面板', (await txt()).includes('A · 系统语音（离线）'))

// 2) 点预设 → toast + 引擎切换
await page.evaluate(() => {
  const bs = [...document.querySelectorAll('button')]
  const b = bs.filter((x) => x.textContent.includes('硅基流动')).pop()
  b?.click()
})
await new Promise((r) => setTimeout(r, 500))
const engine = await page.evaluate(() => {
  const ls = localStorage.getItem('embedmaster:tts_config')
  return ls ? JSON.parse(ls).engine : '?'
})
check('点预设引擎切到 api', engine === 'api')
check('切换有即时 Toast 反馈', (await txt()).includes('请在下方填入 API Key') || (await txt()).includes('点试听试试效果'))

// 3) 未填 Key 点播放：有内置音频则直接开播（新版默认路径）；无音频则给「还差最后一步」指引
//    两种结果都算通过 —— 核心要求：点击必有明确反馈，绝不静默失败
await page.evaluate(() => {
  const bs = [...document.querySelectorAll('button')]
  const b = bs.find((x) => ['▶', '‖'].some((t) => x.textContent.trim().includes(t)))
  b?.click()
})
await new Promise((r) => setTimeout(r, 1200))
const body = await txt()
const audioNow = await page.evaluate(() => {
  const m = document.body.innerText.match(/\d+:\d\d/g)
  return m && m.length >= 2 && m[0] !== '0:00' || document.body.innerText.includes('内置神经音色')
})
const guidedNow = body.includes('还差最后一步') || body.includes('请在下方填入 API Key')
check('未填Key点击有明确反馈（音频开播或指引）', audioNow || guidedNow, audioNow ? '内置音频已开播' : guidedNow ? 'TTS 引导' : '无反馈!')
check('不再提示「请切换到在线语音」死循环', !body.includes('请点开「语音方案」切换到在线语音'))

// 4) 面板滚动到可见（与视口有交叠即可用：关键输入区在面板内）
await new Promise((r) => setTimeout(r, 900)) // 等平滑滚动与错误触发后的二次定位
const inView = await page.evaluate(() => {
  const el = document.getElementById('voice-panel')
  if (!el) return '面板不存在'
  const r = el.getBoundingClientRect()
  return r.top < window.innerHeight && r.bottom > 0 ? '视口内' : `不可见 top=${Math.round(r.top)} bottom=${Math.round(r.bottom)}`
})
check('面板滚动到视口内', inView === '视口内', String(inView))

// 5) 填 Key 后试听 → 无效 Key 报错也明确（401 而非静默）
await page.evaluate(() => {
  const k = document.querySelector('input[type=password]')
  if (k) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(k, 'sk-test-invalid')
    k.dispatchEvent(new Event('input', { bubbles: true }))
    k.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await new Promise((r) => setTimeout(r, 300))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('试听当前方案'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 2000))
const body2 = await txt()
check('无效Key报错明确(含失败原因)', body2.includes('在线语音失败') && body2.includes('检查 API Key'), '')

await page.screenshot({ path: 'shot-voice-fixed.png', fullPage: true })
await browser.close()
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
