/* 标注碰撞检测 v3：文字 vs 文字 / 文字 vs 元件体 / 文字 vs 导线 / 文字出界
 * 文字框按渲染器真实规则（font-size 12/13、text-anchor、baseline）估算 */
import { circuitCases } from './.tmp-circ.mjs'

// 字宽估算：CJK≈12.2px，ASCII≈6.6px（font-size 12、weight 600 实测偏宽一点）
function textW(t, fs = 12) {
  let w = 0
  for (const ch of t) w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fs * 1.02 : fs * 0.55
  return w
}
const g = (c, dx, dy) => {
  const [x, y] = c.at
  const rot = c.rot ?? 0
  const r = rot === 90 ? [-dy, dx] : rot === 180 ? [-dx, -dy] : rot === 270 ? [dy, -dx] : [dx, dy]
  return [x + r[0], y + r[1]]
}
/** 元件符号实体包围盒（引脚以内的可视化部分） */
function bodyBox(c) {
  if (c.from && c.to && c.type !== 'box' && c.type !== 'wire' && c.type !== 'dline') {
    const [x1, y1] = c.from, [x2, y2] = c.to
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const L = Math.hypot(x2 - x1, y2 - y1)
    const horiz = Math.abs(x2 - x1) > Math.abs(y2 - y1)
    let bw = Math.min(44, Math.max(16, L - 10)), bh = 11
    if (c.type === 'diode' || c.type === 'led' || c.type === 'zener') { bw = 15; bh = 18 }
    if (c.type === 'cap' || c.type === 'pcap') { bw = 9; bh = 23 }
    if (c.type === 'sw') { bw = L - 8; bh = 15 }
    if (c.type === 'coil') { bw = L - 6; bh = 13 }
    if (c.type === 'bat') { bw = 11; bh = 25 }
    if (c.type === 'xtal') { bw = 26; bh = 24 }
    return horiz
      ? { x1: mx - bw / 2, y1: my - bh / 2, x2: mx + bw / 2, y2: my + bh / 2 }
      : { x1: mx - bh / 2, y1: my - bw / 2, x2: mx + bh / 2, y2: my + bw / 2 }
  }
  if (!c.at) return null
  const [x, y] = c.at
  const rot = c.rot ?? 0
  const box = (a, b, cc, d) => {
    const corners = [[a, b], [cc, b], [cc, d], [a, d]].map(([px, py]) => {
      const r = rot === 90 ? [-py, px] : rot === 180 ? [-px, -py] : rot === 270 ? [py, -px] : [px, py]
      return [x + r[0], y + r[1]]
    })
    return {
      x1: Math.min(...corners.map(p => p[0])), x2: Math.max(...corners.map(p => p[0])),
      y1: Math.min(...corners.map(p => p[1])), y2: Math.max(...corners.map(p => p[1])),
    }
  }
  if (c.type === 'npn' || c.type === 'pnp') return box(-8, -20, 22, 20)
  if (c.type === 'nmos' || c.type === 'pmos') return box(-8, -23, 17, 23)
  if (c.type === 'motor') return box(-15, -15, 15, 15)
  if (c.type === 'ac') return box(-14, -14, 14, 14)
  if (c.type === 'gnd') return { x1: x - 12, y1: y, x2: x + 12, y2: y + 12 }
  return null
}
const hit = (a, b, p = 1) => a && b && a.x1 < b.x2 + p && a.x2 > b.x1 - p && a.y1 < b.y2 + p && a.y2 > b.y1 - p

let issues = 0
for (const cs of circuitCases) {
  const probs = []
  const W = cs.width ?? cs.w
  const H = cs.height ?? cs.h
  const labels = []
  for (const c of cs.comps) {
    if (!c.text) continue
    let lx, ly, anchor, fs = 12
    if (c.from && c.to && c.type !== 'box') {
      const [x1, y1] = c.from, [x2, y2] = c.to
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      const vertical = Math.abs(x2 - x1) < 0.001
      if (c.labelOffset) { lx = mx + c.labelOffset[0]; ly = my + c.labelOffset[1]; anchor = 'middle' }
      else if (vertical) { lx = mx + 14; ly = my + 4; anchor = 'start' }
      else { lx = mx; ly = my - 12; anchor = 'middle' }
    } else if (c.at && (c.type === 'npn' || c.type === 'pnp' || c.type === 'nmos' || c.type === 'pmos')) {
      lx = c.at[0] + (c.labelOffset?.[0] ?? 28)
      ly = c.at[1] + (c.labelOffset?.[1] ?? 30)
      anchor = 'middle'
    } else if (c.type === 'rail') {
      lx = c.at[0]; ly = c.at[1] - 7; anchor = 'middle'; fs = 13
    } else if (c.type === 'label') {
      lx = c.at[0]; ly = c.at[1]; anchor = 'start'
    } else continue
    const w = textW(c.text, fs)
    const bx = anchor === 'middle' ? lx - w / 2 : lx
    labels.push({ id: c.id, text: c.text, fs, box: { x1: bx, y1: ly - fs * 0.78, x2: bx + w, y2: ly + fs * 0.22 } })
  }
  // 0) 出界
  for (const l of labels) {
    const over = []
    if (l.box.x1 < -1) over.push(`左${Math.round(-l.box.x1)}`)
    if (l.box.x2 > W + 1) over.push(`右${Math.round(l.box.x2 - W)}`)
    if (l.box.y1 < -1) over.push(`上${Math.round(-l.box.y1)}`)
    if (l.box.y2 > H + 1) over.push(`下${Math.round(l.box.y2 - H)}`)
    if (over.length) probs.push(`文字出界[${l.text}] ${over.join('/')}`)
  }
  // 1) 文字 vs 文字（只报真重叠，留 0 容差避免"贴边"误报）
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (hit(labels[i].box, labels[j].box, 0.5))
        probs.push(`文字互压 [${labels[i].text}] × [${labels[j].text}]`)
  // 2) 文字 vs 元件体（留 0.5 容差）
  for (const l of labels)
    for (const c of cs.comps) {
      if (c.id === l.id || c.type === 'wire' || c.type === 'dline' || c.type === 'dot' || c.type === 'label' || c.type === 'box' || c.type === 'rail') continue
      if (hit(l.box, bodyBox(c), 0.5)) probs.push(`文字[${l.text}]压元件 ${c.id}(${c.type})`)
    }
  // 3) 文字 vs 导线（文字框内部包含导线采样点）
  for (const l of labels)
    for (const c of cs.comps) {
      if (c.type !== 'wire' && c.type !== 'dline') continue
      if (c.id === l.id) continue
      const [x1, y1] = c.from, [x2, y2] = c.to
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3))
      let bad = false
      for (let s = 0; s <= steps && !bad; s++) {
        const px = x1 + (x2 - x1) * s / steps, py = y1 + (y2 - y1) * s / steps
        if (px > l.box.x1 + 1.5 && px < l.box.x2 - 1.5 && py > l.box.y1 + 1.5 && py < l.box.y2 - 1.5) bad = true
      }
      if (bad) probs.push(`文字[${l.text}]压导线 ${c.id}`)
    }
  // 4) 文字 vs 元件引线（元件轴线上裸露的引出线段，排除元件自身标注）
  for (const l of labels)
    for (const c of cs.comps) {
      if (!c.from || !c.to || c.type === 'box' || c.type === 'wire' || c.type === 'dline') continue
      if (c.id === l.id) continue
      const [x1, y1] = c.from, [x2, y2] = c.to
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3))
      let bad = false
      for (let s = 0; s <= steps && !bad; s++) {
        const px = x1 + (x2 - x1) * s / steps, py = y1 + (y2 - y1) * s / steps
        if (px > l.box.x1 + 1.5 && px < l.box.x2 - 1.5 && py > l.box.y1 + 1.5 && py < l.box.y2 - 1.5) bad = true
      }
      if (bad) probs.push(`文字[${l.text}]压引线 ${c.id}(${c.type})`)
    }
  if (probs.length) {
    issues += probs.length
    console.log(`[${cs.id}] ${cs.title}`)
    ;[...new Set(probs)].forEach(p => console.log('  - ' + p))
  }
}
console.log(`\n=== 标注问题 ${issues} 处 ===`)
