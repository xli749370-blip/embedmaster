/**
 * 大版本升级验收：理论四件套 + 冥想听学 + ESP32 + 数据手册 + 打卡地图 + AI 答疑
 * 运行：node verify-v2.mjs（需先启动 vite preview 4182）
 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:4182'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const fails = []
function check(name, cond) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    fails.push(name)
    console.log(`  ✗ ${name}`)
  }
}

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await b.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// ---------- 1. 学习中心（理论四件套） ----------
console.log('\n[1] /learn 学习中心')
await page.goto(`${BASE}/#/learn`, { waitUntil: 'networkidle2' })
await sleep(600)
{
  const txt = await page.evaluate(() => document.body.innerText)
  check('页面渲染出课程卡', txt.includes('嵌入式语言基础') && txt.includes('计算机底层认知'))
  check('C 语言大全在列', txt.includes('C 语言大全'))
  check('Python 在列', txt.includes('Python'))
}
// 打开语言基础，检查章节
{
  await page.evaluate(() => [...document.querySelectorAll('a,button,.card,[class*=cursor]')].find((e) => e.textContent.includes('嵌入式语言基础'))?.click())
  await sleep(500)
  const txt = await page.evaluate(() => document.body.innerText)
  check('语言基础章节渲染', /术语|表达|数据类型|关键字/.test(txt))
  // 听学按钮存在
  check('章节页有听学/朗读按钮', /听学|朗读|播放/.test(txt))
  // 回列表
  await page.goto(`${BASE}/#/learn`, { waitUntil: 'networkidle2' })
  await sleep(400)
  await page.evaluate(() => [...document.querySelectorAll('a,button,.card,[class*=cursor]')].find((e) => e.textContent.includes('C 语言大全'))?.click())
  await sleep(500)
  const t2 = await page.evaluate(() => document.body.innerText)
  check('C 语言双轨标注（嵌入式/非嵌入式）', /\[嵌入式\]|嵌入式所需|非嵌入式/.test(t2))
}

// ---------- 2. 计算机底层认知 ----------
console.log('\n[2] 计算机底层认知')
{
  await page.goto(`${BASE}/#/learn`, { waitUntil: 'networkidle2' })
  await sleep(400)
  await page.evaluate(() => [...document.querySelectorAll('a,button,.card,[class*=cursor]')].find((e) => e.textContent.includes('计算机底层'))?.click())
  await sleep(500)
  const txt = await page.evaluate(() => document.body.innerText)
  check('底层认知章节渲染', /晶体管|寄存器|中断|总线|编译/.test(txt))
}

// ---------- 3. 冥想学习 ----------
console.log('\n[3] /meditate 冥想听学')
{
  await page.goto(`${BASE}/#/meditate`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const txt = await page.evaluate(() => document.body.innerText)
  check('冥想页渲染出课程选择', /语言基础|冥想|听学/.test(txt))
  check('有播放控制（倍速/开始）', /倍速|开始|播放|0\.9|1\.0|1\.2/.test(txt))
}

// ---------- 4. ESP32 中枢 ----------
console.log('\n[4] /esp32 ESP32 区块')
{
  await page.goto(`${BASE}/#/esp32`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const txt = await page.evaluate(() => document.body.innerText)
  check('ESP32 中枢渲染', /ESP32|ESP-IDF/.test(txt))
  check('与 STM32 对比内容', /STM32/.test(txt))
  check('数据手册索引入口', /手册|datasheet/i.test(txt))
  const imgOk = await page.evaluate(() => [...document.images].some((i) => i.src.includes('esp32') && i.naturalWidth > 0))
  check('ESP32 实物图加载', imgOk)
}

// ---------- 5. ESP32 代码库 ----------
console.log('\n[5] 代码库 esp32 分类')
{
  await page.goto(`${BASE}/#/codelib`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /esp32/i.test(b.textContent))
    if (btn) btn.click()
    return !!btn
  })
  check('esp32 分类按钮存在', clicked)
  await sleep(400)
  const txt = await page.evaluate(() => document.body.innerText)
  check('ESP-IDF 模块渲染', /ESP-IDF|GPIO|WiFi|wifi/i.test(txt))
}

// ---------- 6. ESP32 项目（p07） ----------
console.log('\n[6] 工程库 p07 ESP32 项目')
{
  await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const txt = await page.evaluate(() => document.body.innerText)
  check('p07 项目在列', /环境监测|ESP32/.test(txt))
  const found = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button,.card,[class*=cursor]')].find((e) => e.textContent.includes('环境监测站'))
    if (el) el.click()
    return !!el
  })
  check('p07 可打开', !!found)
  await sleep(500)
  const t2 = await page.evaluate(() => document.body.innerText)
  check('p07 阶段内容渲染', /阶段|IDF|WiFi/i.test(t2))
  const imgOk = await page.evaluate(() => [...document.images].some((i) => i.src.includes('p07') && i.naturalWidth > 0))
  check('p07 实物图加载', imgOk)
}

// ---------- 7. 数据手册索引 ----------
console.log('\n[7] /datasheets 数据手册')
{
  await page.goto(`${BASE}/#/datasheets`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const txt = await page.evaluate(() => document.body.innerText)
  check('手册索引页渲染', /手册|STM32|ESP32/.test(txt))
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="st.com"],a[href*="espressif"],a[href*="ti.com"],a[href*="pdf"]')].length)
  check('有官方 PDF/官网外链', links > 0)
}

// ---------- 8. 打卡学习地图 ----------
console.log('\n[8] /roadmap 打卡督学')
{
  await page.goto(`${BASE}/#/roadmap`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const txt = await page.evaluate(() => document.body.innerText)
  check('阶段化路径渲染', /阶段|第 1|入门|打卡/.test(txt))
  check('签到/连续天数 UI', /签到|连续/.test(txt))
  // 点击打卡
  const signed = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('点击打卡'))
    if (el) el.click()
    return !!el
  })
  await sleep(400)
  const t2 = await page.evaluate(() => document.body.innerText)
  check('签到动作生效', !!signed && /已打卡/.test(t2))
  check('热力图渲染', await page.evaluate(() => !!document.querySelector('[class*=heat], svg rect, .grid')))
}

// ---------- 9. AI 答疑 ----------
console.log('\n[9] /ai AI 答疑')
{
  await page.goto(`${BASE}/#/ai`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const txt = await page.evaluate(() => document.body.innerText)
  check('AI 页渲染', /AI|答疑|模型|配置/.test(txt))
  check('provider 选择（DeepSeek/Kimi/GLM/Ollama 等）', /DeepSeek|Kimi|GLM|Ollama|通义|自定义/i.test(txt))
  // 打开服务设置面板
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('服务设置'))?.click())
  await sleep(300)
  check('API Key 输入框', !!(await page.$('input[type=password]')))
}

// ---------- 10. 菜单栏分组 ----------
console.log('\n[10] 菜单栏分组重构')
{
  const txt = await page.evaluate(() => document.querySelector('header')?.innerText || '')
  check('分组菜单（芯片/层级）', /STM32|ESP32|硬件|软件|学习|工具/.test(txt))
}

// ---------- 汇总 ----------
console.log('\n===== 运行时报错 =====')
check('无页面运行时错误', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 5))

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fails.length) {
  console.log('失败项：')
  fails.forEach((f) => console.log('  - ' + f))
  process.exit(1)
}
await b.close()
