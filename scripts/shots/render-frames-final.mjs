/**
 * 头像框阶位终版对照表 —— 直接用构建产物里的 index.css + FRAMES 出图，
 * DOM 结构与 FrameRing.vue 一一对应，所以在浏览器里缩放也不会走样。
 * 输出：frames-1121/final-48.png（真实 48px，4 倍像素）、final-72.png（72px 大图）
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { FRAMES, framePad, frameTexture, frameMaxTier } from './.tmpbuild/ach.js'

const root = process.cwd()
const distDir = process.argv[2] || 'dist-v10'
const cssFile = fs.readdirSync(path.join(root, distDir, 'assets')).find((f) => /^index-.*\.css$/.test(f))
const baseCss = fs.readFileSync(path.join(root, distDir, 'assets', cssFile), 'utf8')
const outDir = path.resolve(root, '../emb-archive/frames-1121')
fs.mkdirSync(outDir, { recursive: true })

const AV = 'radial-gradient(circle at 34% 26%,#8ee9ff,#3b82f6 55%,#4f46e5 100%)'

function ring(frame, tier, size) {
  const f = FRAMES.find((x) => x.id === frame)
  const t = Math.min(tier, 3)
  const pad = framePad(size, t)
  const cut = size - pad * 2
  const u = size / 48
  const tint = f.tint || '#94a3b8'
  const tex = frameTexture(frame, size)
  const root =
    `width:${size}px;height:${size}px;--u:${u};--pad:${pad}px;--t:${tint};--tg:${tint}77;--tg2:${tint}99;--tg3:${tint}66`
  const bodyStyle = `background-image:${tex ? `${tex},${f.css}` : f.css};background-blend-mode:${tex ? 'overlay, normal' : 'normal'}`
  const inner = `<div class="fring-cut" style="width:${cut}px;height:${cut}px"><div style="width:100%;height:100%;border-radius:9999px;background:${AV};display:grid;place-items:center;font-size:${Math.round(cut * 0.4)}px">🤖</div></div>`
  return `<div class="fring" data-tier="${t}" style="${root}">
    <div class="fring-body" style="${bodyStyle}">${inner}</div>
    ${t >= 3 ? '<div class="fring-halo"></div>' : ''}
    ${t >= 2 ? '<div class="fring-collar a"></div>' : ''}
    ${t >= 3 ? '<div class="fring-collar b"></div>' : ''}
    ${t >= 2 ? '<div class="fring-arc"></div><div class="fring-sweep"></div>' : ''}
    ${t >= 3 ? '<div class="fring-stud n"></div><div class="fring-stud e"></div><div class="fring-stud s"></div><div class="fring-stud w"></div><div class="fring-spark s1"></div><div class="fring-spark s2"></div>' : ''}
  </div>`
}

const frames = FRAMES.filter((f) => f.id !== 'none')
const rows = frames
  .map((f) => {
    const max = frameMaxTier(f.id)
    const cells = [1, 2, 3]
      .map((t) => {
        const dim = t > max
        const content = dim ? '<span class="ph"></span>' : ring(f.id, t, 48)
        const lb = dim ? '不可达' : ['Ⅰ', 'Ⅱ', 'Ⅲ'][t - 1] + (t === max ? ' 满阶' : '')
        return `<div class="cell${dim ? ' dim' : ''}"><div class="slot">${content}</div><div class="lb">${lb}</div></div>`
      })
      .join('')
    return `<div class="row"><div class="nm">${f.name}<i>${f.mat === 'metal' ? '金属' : f.mat === 'gem' ? '宝石' : '余烬'}</i></div>${cells}</div>`
  })
  .join('\n')

const rows72 = frames
  .map((f) => {
    const max = frameMaxTier(f.id)
    const cells = [1, 2, 3]
      .map((t) =>
        t > max
          ? `<div class="cell dim"><div class="slot"><span class="ph ph72"></span></div></div>`
          : `<div class="cell"><div class="slot">${ring(f.id, t, 72)}</div></div>`,
      )
      .join('')
    return `<div class="row"><div class="nm">${f.name}</div>${cells}</div>`
  })
  .join('\n')

const shell = (title, lead, body, w) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${baseCss}</style><style>
  body{margin:0;background:#fff;font-family:"Microsoft YaHei","PingFang SC",system-ui;color:#0f172a}
  .wrap{width:${w}px;padding:22px 26px}
  h2{font-size:17px;margin:0 0 3px}
  .lead{font-size:11.5px;color:#64748b;margin:0 0 14px;line-height:1.6}
  .row{display:grid;grid-template-columns:104px repeat(3,1fr);align-items:center;gap:2px;padding:10px 0;border-bottom:1px dashed #e8edf4}
  .cell{display:flex;flex-direction:column;align-items:center;gap:7px}
  .cell.dim{opacity:.16}
  .slot{display:flex;align-items:center;justify-content:center;min-height:96px}
  .lb{font-size:10px;color:#94a3b8}
  .nm{font-size:13px;font-weight:700}
  .nm i{display:block;font-style:normal;font-size:10px;font-weight:400;color:#94a3b8;margin-top:2px}
  .ph{width:48px;height:48px;border:1px dashed #cbd5e1;border-radius:9999px}
  .ph72{width:72px;height:72px}
  .frame-breathe{animation:none!important}
</style></head><body><div class="wrap"><h2>${title}</h2><p class="lead">${lead}</p>${body}</div></body></html>`

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})

for (const [name, html, w, dsf] of [
  ['final-48', shell('头像框 阶位对照 · 48px（衣柜真实尺寸，4 倍像素）', '左→右 Ⅰ / Ⅱ / Ⅲ。Ⅰ 素环有倒角；Ⅱ 多一圈悬浮镶边 + 镜面扫光；Ⅲ 双环 + 宝石钉 + 星芒 + 光晕。', rows, 660), 660, 4],
  ['final-72', shell('头像框 阶位对照 · 72px（资料卡大头像尺寸）', '同一套参数按 --u 缩放，72px 下镶边与宝石钉的分量更足。', rows72, 760), 760, 3],
]) {
  const p = path.join(outDir, `${name}.html`)
  fs.writeFileSync(p, html, 'utf8')
  const page = await browser.newPage()
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: dsf })
  await page.goto('file://' + p.replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 92, fullPage: true })
  console.log('saved', name)
  await page.close()
}
await browser.close()
