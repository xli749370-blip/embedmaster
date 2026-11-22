/**
 * 导出「听学」全部朗读稿 → listen-scripts.json
 *
 * 覆盖 6 个频道：
 *   lecture  讲义精听（42 章正式教材正文，最长最有料）
 *   circuit  电路门诊（60 例：场景 + 逐条分析步骤）
 *   parts    元器件图鉴（35 词条：参数怎么读 / 选型 / 应用 / 坑）
 *   code     代码兵器谱（47 模块：解决什么问题 + 要点，不念代码）
 *   pitfall  实战避坑（15 条：现象 → 根因 → 解法）
 *   esp32    ESP32 平台（手写讲解稿）
 *
 * 设计原则：为「闭眼听」服务
 *   - 代码块、表格、公式不逐字念（念了听不懂）
 *   - 改为前置提示「本章有 N 段代码 / N 张对照表，建议对照屏幕」
 *   - 句子之间用句号断开，给 TTS 自然停顿
 *
 * 运行：node export-listen.mjs
 */
import { build } from 'esbuild'
import { writeFileSync } from 'node:fs'

/* ---------- 1. 把 TS 数据源打成可 import 的 ESM ---------- */
await build({
  entryPoints: [
    'src/mock/data.ts',
    'src/mock/circuits.ts',
    'src/mock/components.ts',
    'src/mock/designPitfalls.ts',
    'src/mock/codelib.ts',
  ],
  bundle: true,
  format: 'esm',
  outdir: '.tmp-listen',
  outExtension: { '.js': '.mjs' },
  loader: { '.md': 'text' },
  alias: { '@': './src' },
  logLevel: 'error',
})

const d = await import('./.tmp-listen/data.mjs')
const circ = await import('./.tmp-listen/circuits.mjs')
const comps = await import('./.tmp-listen/components.mjs')
const pit = await import('./.tmp-listen/designPitfalls.mjs')
const code = await import('./.tmp-listen/codelib.mjs')

/* ---------- 2. Markdown → 口语稿 ---------- */

/** 单位与符号的口语化替换（顺序敏感：复合单位在前，单个希腊字母兜底在后） */
const SYMBOLS = [
  // 复合单位（用 lookaround 防止误伤英文单词内部的字母组合）
  [/GHz/g, '吉赫兹'], [/MHz/g, '兆赫兹'], [/kHz/g, '千赫兹'],
  [/(?<![a-zA-Z])Hz(?![a-zA-Z])/g, '赫兹'],
  [/(?<![a-zA-Z])ns(?![a-zA-Z])/g, '纳秒'],
  [/(?<![a-zA-Z])ms(?![a-zA-Z])/g, '毫秒'],
  [/[µμu]s(?![a-zA-Z])/g, '微秒'],
  [/[µμu]F(?![a-zA-Z])/g, '微法'],
  [/(?<![a-zA-Z])nF(?![a-zA-Z])/g, '纳法'],
  [/(?<![a-zA-Z])pF(?![a-zA-Z])/g, '皮法'],
  [/(?<![a-zA-Z])mA(?![a-zA-Z])/g, '毫安'],
  [/(?<![a-zA-Z])mV(?![a-zA-Z])/g, '毫伏'],
  [/(?<![a-zA-Z])mW(?![a-zA-Z])/g, '毫瓦'],
  [/[kK]Ω/g, '千欧'],
  [/[µμM]Ω/g, '兆欧'],
  // 数学与排版符号
  [/[µμ]/g, '微'],
  [/Ω/g, '欧姆'],
  [/℃/g, '摄氏度'],
  [/±/g, '正负'],
  [/[≥⩾]/g, '大于等于'],
  [/[≤⩽]/g, '小于等于'],
  [/[≈≃]/g, '约等于'],
  [/≠/g, '不等于'],
  [/[−–]/g, '减'],
  [/→|←/g, '，'],
  [/↑/g, '上升'],
  [/↓/g, '下降'],
  [/×/g, '乘以'],
  [/÷/g, '除以'],
  [/°/g, '度'],
  [/—+/g, '，'],
  [/…+/g, '等等'],
  [/[①②③④⑤⑥⑦⑧⑨⑩]/g, ''],
  [/\s*~\s*(?=\d)/g, ' 到 '],
]

/** 行内代码片段：强代码特征（分号/箭头/复合赋值/移位/预处理）→ 不念符号，改说「这行代码」 */
const CODE_LIKE = /;|->|\|=|&=|\^=|<<|>>|\+\+|--|##|::/
const codeInline = (s) =>
  s.replace(/\x60+([^\x60]+)\x60+/g, (_, code) => (CODE_LIKE.test(code) ? '这行代码' : code)).replace(/\x60+/g, '')

function polish(t) {
  let s = t
  // 连续出现的公式占位（列表里连着几个 $...$）合并成一次，避免念成「这个量，这个量，这个量」
  s = s.replace(/(?:这个量[。，、；]?\s*){2,}/g, '这个量，')
  // 纯占位符构成的短句没有信息量（如「、这个量。」），整段删掉
  s = s.replace(/[。，、；]\s*这个量\s*(?=[。，、；])/g, '，')
  for (const [re, to] of SYMBOLS) s = s.replace(re, to)
  // 位运算符号在正文里读「或」比读「竖线」清楚；## 是预处理拼接符
  s = s.replace(/\s*\|\s*/g, '或')
  s = s.replace(/##/g, '两个井号')
  // 标点清理
  s = s
    .replace(/[：:][。.]/g, '。')
    .replace(/[，,][。]/g, '。')
    .replace(/[：:][，,]/g, '，')
    .replace(/。{2,}/g, '。')
    .replace(/，{2,}/g, '，')
    .replace(/、{2,}/g, '、')
    .replace(/。\s*，/g, '。')
    .replace(/\s+([。，、；：])/g, '$1')
    .replace(/([。，、；：])\s+/g, '$1')
    // 中文与中文之间的空格没有意义，会让 TTS 出现不该有的停顿
    .replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[。，、；：]+/, '')
  return s
}

function mdToSpeech(md) {
  // 跨行公式块先整篇替换（逐行处理会漏掉 \frac 之类的残留）
  md = md.replace(/\$\$[\s\S]*?\$\$/g, '，这里有一个公式，')
  const lines = md.split('\n')
  const out = []
  let inCode = false
  let codeBlocks = 0
  let tables = 0
  let skippedTitle = false
  for (const raw of lines) {
    let s = raw.trim()
    if (s.startsWith('```')) {
      inCode = !inCode
      if (inCode) codeBlocks++
      continue
    }
    if (inCode) continue
    // 未闭合的公式分隔行
    if (s === '$$' || s === '$') continue
    // 表格整行跳过（含分隔行）
    if (s.includes('|') && /^\|.*\|?$/.test(s)) {
      tables++
      continue
    }
    // 首个 H1 是章标题本身，前文已经念过，跳过避免重复
    if (/^#\s+/.test(s) && !skippedTitle) {
      skippedTitle = true
      continue
    }
    // 小节标题转成口语过渡
    const sec = s.match(/^#{2,6}\s+(?:\d+(?:\.\d+)*[.、]?\s*)?(.+)$/)
    if (sec) {
      out.push(/^###/.test(s) ? `再往下，${sec[1]}` : `接下来是，${sec[1]}`)
      continue
    }
    // C 风格注释（行内出现时别把 /* */ 念出来）
    s = s.replace(/\/\*[\s\S]*?\*\//g, '')
    // 图片 / 动画占位 / 链接
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    s = s.replace(/\[\[anim:[^\]]*\]\]/g, '')
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // 行内公式：不念符号，统一念成「这个量」；
    // 若整行就是个公式（列表项里的纯公式），念出来毫无信息量，直接丢掉
    s = s.replace(/\$[^$\n]*\$/g, '这个量')
    // 结构符号
    s = s.replace(/^>\s*/, '')
    s = s.replace(/^[-*+]\s+/, '')
    s = s.replace(/^\d+[.、)]\s+/, '')
    s = s.replace(/^[-*_]{3,}$/, '')
    // 行内标记（先粗体，再清残留星号）
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
    s = s.replace(/\*+/g, '')
    s = s.replace(/\x60+([^\x60]+)\x60+/g, (_, code) => (CODE_LIKE.test(code) ? '，这行代码，' : code))
    s = s.replace(/\x60+/g, '')
    s = s.replace(/~~([^~]+)~~/g, '$1')
    // 纯符号行丢掉
    if (!s || /^[|\-:\s]+$/.test(s)) continue
    out.push(s)
  }
  let text = out.join('。')
  text = polish(text)
  return { text, codeBlocks, tables }
}

/** 中文语速约 4.7 字/秒（+4% 语速的神经音色） */
const CHARS_PER_SEC = 4.7
const est = (t) => Math.round((t.length / CHARS_PER_SEC / 60) * 10) / 10

const items = []

/* ---------- 3. 讲义精听 ---------- */
const courseName = (id) => (d.courses.find((c) => c.id === id) || {}).course_name || `课程${id}`
for (const ch of d.chapters.filter((c) => c.is_deleted === 0).sort((a, b) => a.course_id - b.course_id || a.sort - b.sort)) {
  const { text, codeBlocks, tables } = mdToSpeech(ch.chapter_content || '')
  if (text.length < 300) continue
  const head = []
  head.push(`${courseName(ch.course_id)}。${ch.chapter_name}。`)
  if (ch.summary) head.push(`本章要点：${polish(ch.summary)}`)
  if (tables >= 2) head.push(`这一章有 ${tables} 处对照表，听的时候留意我念到的关键对比，回头对着屏幕看会更清楚。`)
  if (codeBlocks >= 1) head.push(`文中有 ${codeBlocks} 段代码，代码我不逐行念，只讲它想说明的道理。`)
  const script =
    head.filter(Boolean).join('') +
    text +
    '这一章就到这里。听的时候没跟上的地方不用回头，先让整体框架在心里搭起来，之后对着讲义再看一遍，会顺很多。'
  items.push({
    id: `L-${ch.id}`,
    channel: 'lecture',
    title: ch.chapter_name,
    sub: courseName(ch.course_id),
    ref: `/chapter/${ch.id}`,
    script,
    chars: script.length,
    minutes: est(script),
  })
}

/* ---------- 4. 电路门诊 ---------- */
const numCn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
circ.circuitCases.forEach((cs, i) => {
  const steps = (cs.steps || []).map((s) => ({
    t: (s.title || '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim(),
    x: (s.text || '').replace(/[`*]/g, ''),
  }))
  const body = steps.map((s, k) => `第${numCn[k] || k + 1}步，${s.t ? s.t + '。' : ''}${s.x}`).join('')
  const script =
    `电路门诊，第 ${i + 1} 例，${cs.title}。` +
    `先看这张图要解决的问题：${cs.scene}` +
    `我们分 ${steps.length} 步把它读一遍。` +
    body +
    `这一例的读图顺序就是这样。下次遇到类似的图，先找电源和地，再找信号的流向，最后看每个元件在中间扮演什么角色。`
  items.push({
    id: `C-${parseInt(cs.id.replace(/^c/i, ''), 10)}`,
    channel: 'circuit',
    title: `${i + 1}. ${cs.title}`,
    sub: (cs.tags || []).slice(0, 2).join(' · '),
    ref: `/circuit`,
    script,
    chars: script.length,
    minutes: est(script),
  })
})

/* ---------- 5. 元器件图鉴 ---------- */
for (const c of comps.componentBank) {
  const params = c.params.map((p) => `${p.name}，${p.meaning}`).join('。')
  const sel = c.select.length ? `选型的时候记住这几点。${c.select.join('。')}。` : ''
  const apps = c.apps.length ? `它最常出现在这些地方：${c.apps.map((a) => a.desc).join('；')}。` : ''
  const pf = c.pitfalls.length ? `容易踩的坑：${c.pitfalls.join('。')}。` : ''
  const script = `${c.name}，型号举例 ${c.en}。一句话定位：${c.oneLiner}先看几个关键参数怎么读。${params}。${sel}${apps}${pf}这个器件的轮廓就清楚了。`
  items.push({
    id: `P-${c.id}`,
    channel: 'parts',
    title: c.name,
    sub: c.category,
    ref: `/components`,
    script,
    chars: script.length,
    minutes: est(script),
  })
}

/* ---------- 6. 代码兵器谱 ---------- */
for (const m of code.codeBank) {
  const pts = (m.points || []).map((p) => p.replace(/[`*]/g, ''))
  const script =
    `${m.title}。` +
    `这个模块要解决的问题：${m.brief}` +
    (pts.length ? `代码里有 ${pts.length} 个要点，我讲思路，不念代码。${pts.join('。')}。` : '') +
    `需要的时候，回到代码库对着看一遍，印象会更深。`
  items.push({
    id: `K-${m.id}`,
    channel: 'code',
    title: m.title,
    sub: (m.tags || []).slice(0, 2).join(' · '),
    ref: `/codelib`,
    script,
    chars: script.length,
    minutes: est(script),
  })
}

/* ---------- 7. 实战避坑 ---------- */
for (const p of pit.designPitfalls) {
  const script =
    `${p.cat}类问题：${p.title}。` +
    `现场是什么表现呢？${p.symptom}` +
    `根因往往在这里：${p.cause}` +
    `怎么解决：${p.solutions.map((s) => s.replace(/[`*]/g, '')).join('。')}。` +
    `记住这个组合：现象对得上，先怀疑这个根因，再按上面的顺序排查。`
  items.push({
    id: `F-${p.id}`,
    channel: 'pitfall',
    title: p.title,
    sub: p.cat,
    ref: `/circuit`,
    script,
    chars: script.length,
    minutes: est(script),
  })
}

/* ---------- 8. ESP32 平台（手写稿：平台认知类内容，讲透比罗列参数有用） ---------- */
const esp32 = [
  {
    id: 'E-01',
    title: 'ESP32 是什么：一颗芯片把 WiFi 和实时控制装在一起',
    script:
      'ESP32 是乐鑫的一款 SoC，把 WiFi、蓝牙和双核 MCU 做在同一颗芯片里。这句话听起来平淡，但它决定了这类芯片的定位：它不只是联网模块，也不只是单片机，而是一台能联网的实时控制器。' +
      '在物联网设备里，常见两种分工。第一种是主控加模组：STM32 负责实时控制，ESP32 只做透传。第二种是 ESP32 单芯片全包：采集、控制、联网都由它做。' +
      '选择的关键在于实时性要求和成本。如果电机控制要求微秒级响应，让 STM32 主控、ESP32 只管联网更稳。如果是温湿度上报、继电器开关、小型网关这类场景，ESP32 单芯片就够，还省掉一颗芯片的物料和布线。' +
      '还有一点容易忽略：ESP32 的双核不是摆设。你可以让一个核跑 WiFi 协议栈，另一个核跑你的控制逻辑，互不打断。这是它比单核单片机更适合联网场景的根本原因。',
  },
  {
    id: 'E-02',
    title: '家族怎么选：ESP32、S2、S3、C3、C6 的差别',
    script:
      'ESP32 这个家族现在有十几个成员，选型时只要抓住四个维度：核数、无线制式、外设、封装尺寸。' +
      '经典款 ESP32，双核，WiFi 加经典蓝牙，外设最全，资料最多，缺点是功耗和价格都不占优，适合学习和功能验证。' +
      'ESP32-S3，双核，加了向量指令，能跑轻量神经网络，带 USB OTG，适合要接摄像头、做语音唤醒、或者需要 USB 设备的场景。' +
      'ESP32-C3，单核 RISC-V，只有 WiFi 和低功耗蓝牙，便宜、体积小，适合单个传感器节点、智能开关这类简单设备。' +
      'ESP32-C6，支持 WiFi 六和 Thread、Zigbee，是做多协议网关的选择。ESP32-H2 则专注 Thread 和 Zigbee，不带 WiFi。' +
      '如果不确定，从 S3 或 C3 起步最稳：S3 功能余量大，C3 成本低，两者资料都在快速补齐。',
  },
  {
    id: 'E-03',
    title: '和 STM32 的思维差异：从寄存器到框架',
    script:
      '从 STM32 转到 ESP32，最大的障碍不是寄存器，而是思维方式。' +
      'STM32 的习惯是：时钟使能、配置引脚、写寄存器、开中断，一切都在你的 main 里，时序由你控制。' +
      'ESP32 用 ESP-IDF 时，你要先接受一套框架：系统启动后创建任务，任务之间靠队列和信号量通信，WiFi 和蓝牙是跑在后台的任务，你的代码是众多任务中的一个。' +
      '这个转变带来两个后果。好消息是，你不用再自己写协议栈和联网逻辑。坏消息是，你必须理解抢占和优先级，否则会出现任务饿死、看门狗复位、栈溢出这些在裸机时代很少遇到的问题。' +
      '所以学 ESP32 的顺序应该是：先跑通任务创建和队列，再学事件循环，最后碰 WiFi。反过来先啃 WiFi，会被异步回调绕晕。',
  },
  {
    id: 'E-04',
    title: 'ESP-IDF 的工程结构：为什么要有 components',
    script:
      '一个 ESP-IDF 工程，根目录下是 CMakeLists 和 sdkconfig，源码放在 main 目录，可复用的模块放在 components 目录。' +
      '这个结构解决的是复用问题。你写的驱动、协议解析、业务逻辑，只要放进 components 并且带上自己的 CMakeLists，就能被别的工程直接引用，不用复制粘贴。' +
      'sdkconfig 是另一个关键。它记录了所有编译期配置：用哪个晶振、Flash 多大、WiFi 缓冲区几个、日志级别多少。这些配置最终会生成一个头文件，代码里通过宏读取。' +
      '很多人改了配置发现没生效，原因是改的是 sdkconfig 而工程用的是 sdkconfig.defaults，或者反过来。记住一条：sdkconfig 是本地产物，团队协作要提交的是 sdkconfig.defaults。',
  },
  {
    id: 'E-05',
    title: '内存的三个池子：IRAM、DRAM、PSRAM 怎么放',
    script:
      'ESP32 的内存不是一个整体，而是分块的，理解这一点能救你很多次莫名其妙的崩溃。' +
      'IRAM 是指令内存，代码默认放这里，中断处理函数必须在这里，因为中断不能被 Flash 访问拖慢。所以中断服务程序要加 IRAM_ATTR。' +
      'DRAM 是数据内存，全局变量、任务栈、堆都在这里。它不大，经典款大约三百多 K，开了 WiFi 之后剩的更少。' +
      'PSRAM 是外挂的大内存，几兆到八兆，但访问速度慢，而且不能放中断代码。摄像头帧缓冲、音频缓冲这类大块数据才放这里。' +
      '实际排错时，遇到启动就崩、或者分配大数组失败，先看是不是 DRAM 不够；遇到中断里跑飞，先看函数有没有放进 IRAM。',
  },
  {
    id: 'E-06',
    title: '低功耗设计的取舍：睡下去容易，醒得干净难',
    script:
      'ESP32 的低功耗有几个档位：调制解调器睡眠、浅睡眠、深睡眠。档位越深，省电越多，唤醒后要重建的状态也越多。' +
      '浅睡眠时，内存还保持着，醒来接着跑，适合短暂空闲。深睡眠时，除了 RTC 域全部断电，醒来相当于重启，程序从 setup 重新开始。' +
      '所以深睡眠的设计要点不是怎么睡，而是怎么醒：醒来之后要能立刻知道自己为什么醒、上次做到哪一步。这通常要靠 RTC 内存里保存的几个变量，或者外部 Flash 里的一条记录。' +
      '还有一个常见陷阱：唤醒源配置了，但引脚上拉了，漏电流把电池慢慢放干。做电池设备时，休眠电流要用表量，不能靠估算。',
  },
]
for (const e of esp32) {
  const script = e.script
  items.push({
    id: e.id,
    channel: 'esp32',
    title: e.title,
    sub: 'ESP32 平台',
    ref: '/esp32',
    script,
    chars: script.length,
    minutes: est(script),
  })
}

/* ---------- 9. 统一口语化 & 输出 ---------- */
for (const it of items) {
  it.script = polish(codeInline(it.script))
  it.chars = it.script.length
  it.minutes = est(it.script)
}

const byChannel = {}
for (const it of items) {
  byChannel[it.channel] = byChannel[it.channel] || { count: 0, chars: 0, minutes: 0 }
  byChannel[it.channel].count++
  byChannel[it.channel].chars += it.chars
  byChannel[it.channel].minutes += it.minutes
}
writeFileSync('listen-scripts.json', JSON.stringify(items, null, 1), 'utf-8')

console.log('频道统计：')
for (const [k, v] of Object.entries(byChannel)) {
  console.log(`  ${k.padEnd(9)} ${String(v.count).padStart(3)} 篇  ${String(Math.round(v.chars / 1000)).padStart(4)}k 字  约 ${v.minutes.toFixed(0)} 分钟`)
}
const totalChars = items.reduce((a, b) => a + b.chars, 0)
const totalMin = items.reduce((a, b) => a + b.minutes, 0)
console.log(`\n合计 ${items.length} 篇，${Math.round(totalChars / 1000)}k 字，约 ${(totalMin / 60).toFixed(1)} 小时`)
const longest = items.slice().sort((a, b) => b.chars - a.chars)[0]
console.log(`最长一篇：${longest.title} ${Math.round(longest.chars / 1000)}k 字 / ${longest.minutes} 分钟`)
