/**
 * 电路「导线穿过元件体」检查 v2：
 * 只按符号真实本体尺寸判定，并排除「导线端点落在元件引脚上」的正常连接。
 *
 * 用法：node audit-cross.mjs
 */
import { circuitCases } from './.tmp-circ.mjs'

const TWO_TERM = new Set(['res', 'cap', 'pcap', 'bat', 'diode', 'led', 'zener', 'sw', 'coil', 'fuse'])
const TRANS = new Set(['npn', 'pnp', 'nmos', 'pmos'])

/** 符号真实本体（沿线半长 along、垂直半宽 across） */
function bodySize(c) {
  const L = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1])
  switch (c.type) {
    case 'res': {
      const bw = Math.min(44, Math.max(16, L - 10))
      const bh = Math.min(11, Math.max(7, bw / 3.6))
      return { along: bw / 2, across: bh / 2 + 0.5 }
    }
    case 'cap':
    case 'pcap':
      return { along: 5, across: 11 }
    case 'bat':
      return { along: 6, across: 12 }
    case 'diode':
    case 'led':
    case 'zener':
      return { along: 8, across: 10 }
    case 'sw':
      return { along: Math.max(4, L / 2 - 6), across: 5 }
    case 'coil':
      return { along: Math.max(4, L / 2 - 3), across: 9 }
    default:
      return { along: 6, across: 8 }
  }
}

function bodyRegion(c) {
  const [x1, y1] = c.from
  const [x2, y2] = c.to
  const L = Math.hypot(x2 - x1, y2 - y1) || 1
  const { along, across } = bodySize(c)
  return {
    mx: (x1 + x2) / 2,
    my: (y1 + y2) / 2,
    ux: (x2 - x1) / L,
    uy: (y2 - y1) / L,
    along,
    across,
    id: c.id,
    type: c.type,
  }
}

function inBody(p, r) {
  const dx = p[0] - r.mx
  const dy = p[1] - r.my
  const a = dx * r.ux + dy * r.uy
  const b = -dx * r.uy + dy * r.ux
  return Math.abs(a) < r.along - 0.5 && Math.abs(b) < r.across - 0.5
}

let total = 0
for (const cs of circuitCases) {
  const bodies = []
  const circles = []
  for (const c of cs.comps) {
    if (c.from && c.to && TWO_TERM.has(c.type)) bodies.push(bodyRegion(c))
    if (c.at && TRANS.has(c.type)) circles.push({ x: c.at[0], y: c.at[1], r: 20, id: c.id })
    if (c.at && c.type === 'ac') circles.push({ x: c.at[0], y: c.at[1], r: 15, id: c.id })
  }
  const hits = new Map()
  for (const w of cs.comps) {
    if (w.type !== 'wire') continue
    const [x1, y1] = w.from
    const [x2, y2] = w.to
    const L = Math.hypot(x2 - x1, y2 - y1)
    const steps = Math.max(10, Math.ceil(L))
    for (let i = 1; i < steps; i++) {
      const p = [x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]
      for (const b of bodies) {
        if (inBody(p, b)) hits.set(`${w.id}→${b.id}(${b.type})`, `导线 ${w.id} 从 ${b.id} 符号中穿过`)
      }
      for (const cc of circles) {
        if (Math.hypot(p[0] - cc.x, p[1] - cc.y) < cc.r) hits.set(`${w.id}→${cc.id}`, `导线 ${w.id} 穿过 ${cc.id} 圆圈内部`)
      }
    }
  }
  if (hits.size) {
    total += hits.size
    console.log(`\n=== ${cs.id} ${cs.title} (${hits.size}) ===`)
    for (const t of hits.values()) console.log('  ' + t)
  }
}
console.log(`\n合计 ${total} 处`)
