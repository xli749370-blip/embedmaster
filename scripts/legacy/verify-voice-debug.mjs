/* 复现「冥想语音不能切换」：模拟 App WebView（无 speechSynthesis）
 * 逐步点击：头部方案按钮 → A/B 预设 → 音色下拉 → 播放，记录每步 UI 状态
 * 运行：node verify-voice-debug.mjs（需 4182 预览）
 */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:4182'
const log = (...a) => console.log(...a)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })
page.on('console', (m) => { if (m.type() === 'error') log('[页面报错]', m.text()) })
page.on('pageerror', (e) => log('[JS异常]', e.message))
await page.evaluateOnNewDocument(() => {
  try { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance } catch {}
})
await page.goto(`${BASE}/#/meditate`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 800))

const txt = () => page.evaluate(() => document.body.innerText)

// 1) 头部「语音方案」按钮直接点开
log('--- 步骤1：点头部「语音方案」按钮 ---')
const clicked1 = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('语音方案：'))
  if (!b) return '按钮不存在'
  const r = b.getBoundingClientRect()
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  b.click()
  return `点击OK，元素遮挡检查: ${el === b || b.contains(el) ? '无遮挡' : '被 ' + (el?.tagName + '.' + (el?.className || '').toString().slice(0, 40)) + ' 遮挡'}`
})
log(clicked1)
await new Promise((r) => setTimeout(r, 400))
log('面板是否展开(A·系统语音可见):', (await txt()).includes('A · 系统语音（离线）'))

// 2) 点 B·硅基流动 预设
log('--- 步骤2：点「B · 硅基流动」预设 ---')
const r2 = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('硅基流动'))
  if (!b) return '按钮不存在'
  b.click()
  return '点击OK'
})
log(r2)
await new Promise((r) => setTimeout(r, 400))
const state2 = await page.evaluate(() => {
  const ls = localStorage.getItem('embedmaster:tts_config')
  const active = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('硅基流动'))
  return { stored: ls ? JSON.parse(ls).engine + '/' + JSON.parse(ls).presetId : 'null', activeCls: active?.className.includes('bg-brand-600') }
})
log('localStorage 引擎:', state2.stored, '| 按钮高亮:', state2.activeCls)

// 3) 面板内音色下拉与 Key 输入框可见性
log('--- 步骤3：在线配置区渲染 ---')
const s3 = await page.evaluate(() => ({
  hasKeyInput: !!document.querySelector('input[type=password]'),
  hasVoiceSelect: [...document.querySelectorAll('select')].some((s) => s.textContent.includes('Anna')),
}))
log('Key输入框:', s3.hasKeyInput, '| 音色下拉:', s3.hasVoiceSelect)

// 4) 填 Key 后点播放 → 应尝试在线合成（断网时报错提示而非静默）
log('--- 步骤4：填 Key 点播放 ---')
await page.evaluate(() => {
  const k = document.querySelector('input[type=password]')
  if (k) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(k, 'sk-test')
    k.dispatchEvent(new Event('input', { bubbles: true }))
    k.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await new Promise((r) => setTimeout(r, 300))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('试听当前方案'))
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 1500))
log('试听后提示区文本片段:', (await txt()).split('\n').filter((l) => l.includes('语音') || l.includes('失败') || l.includes('配置')).slice(0, 3))

// 5) UX 链路：先点播放（自动开面板）再点头部按钮 → 面板会被关上吗
log('--- 步骤5：播放键自动开面板 vs 头部按钮开关冲突 ---')
await page.evaluate(() => { localStorage.clear() })
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 600))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => ['▶', '‖'].some((t) => x.textContent.trim().includes(t)))
  b?.click()
})
await new Promise((r) => setTimeout(r, 400))
const openAfterPlay = (await txt()).includes('A · 系统语音（离线）')
log('点播放后面板自动展开:', openAfterPlay)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('语音方案：'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 400))
log('再点头部「语音方案」按钮后面板状态(预期用户以为会开，实际被关):', (await txt()).includes('A · 系统语音（离线）') ? '仍展开' : '被关上了←冲突点')

await page.screenshot({ path: 'shot-voice-panel.png', fullPage: true })
await browser.close()
