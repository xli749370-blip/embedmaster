/* 电路图几何体检 v2：斜线段 / 悬空端点（含 T 接判定）/ 元件引脚连通性 */
import { circuitCases } from './.tmp-circ.mjs'

const TOL = 2.0
let issues = 0
const segs = [] // 全局线段：{x1,y1,x2,y2,owner}
const pts = []  // 所有连接点

const g = (c, dx, dy) => {
  const [x, y] = c.at
  const rot = c.rot ?? 0
  const r = rot === 90 ? [-dy, dx] : rot === 180 ? [-dx, -dy] : rot === 270 ? [dy, -dx] : [dx, dy]
  return [x + r[0], y + r[1]]
}
function pinsOf(c) {
  if (c.from && c.to && c.type !== 'box') return [[c.from, c.id + '.a'], [c.to, c.id + '.b']]
  if (!c.at) return []
  if (c.type === 'npn' || c.type === 'pnp')
    return [[g(c, -30, 0), c.id + '.B'], [g(c, 10, -20), c.id + '.C'], [g(c, 10, 20), c.id + '.E']]
  if (c.type === 'nmos' || c.type === 'pmos')
    return [[g(c, -25, 0), c.id + '.G'], [g(c, 10, -22), c.id + '.D'], [g(c, 10, 22), c.id + '.S']]
  if (c.type === 'motor') return [[g(c, 0, -15), c.id + '.t'], [g(c, 0, 15), c.id + '.b'], [g(c, -15, 0), c.id + '.l'], [g(c, 15, 0), c.id + '.r']]
  if (c.type === 'ac') return [[g(c, 0, -16), c.id + '.t'], [g(c, 0, 16), c.id + '.b']]
  if (c.type === 'gnd') return [[c.at, c.id + '.t']]
  if (c.type === 'rail') return [[c.at, c.id + '.p']]
  return []
}
const distToSeg = (p, s) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1
  const L2 = dx * dx + dy * dy
  let t = L2 ? ((p[0] - s.x1) * dx + (p[1] - s.y1) * dy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (s.x1 + t * dx), p[1] - (s.y1 + t * dy))
}

for (const cs of circuitCases) {
  segs.length = 0; pts.length = 0
  const probs = []
  const boxes = cs.comps.filter(c => c.type === 'box')
  const lbls = cs.comps.filter(c => c.type === 'label' || c.type === 'rail')
  for (const c of cs.comps) {
    for (const [p, name] of pinsOf(c)) pts.push({ p, name })
    if (c.from && c.to && c.type !== 'box') {
      const [x1, y1] = c.from, [x2, y2] = c.to
      segs.push({ x1, y1, x2, y2, owner: c.id, type: c.type })
      const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1)
      if (dx > 0.5 && dy > 0.5) probs.push(`斜线 ${c.id}(${c.type}) (${x1},${y1})→(${x2},${y2})`)
      if (Math.hypot(dx, dy) < 4) probs.push(`过短 ${c.id}(${c.type}) len=${Math.hypot(dx, dy).toFixed(1)}`)
    }
  }
  for (const e of pts) {
    const near = pts.some(o => o !== e && Math.hypot(o.p[0] - e.p[0], o.p[1] - e.p[1]) < TOL)
    // 电机：四侧引脚任一连通即可
    const motorOk = e.name.includes('.m') === false && cs.comps.some(c => c.type === 'motor' && c.id === e.name.split('.')[0] &&
      [[0, -15], [0, 15], [-15, 0], [15, 0]].some(([dx, dy]) => {
        const [x, y] = c.at
        const p = [x + dx, y + dy]
        return pts.some(o => o !== e && Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < TOL) ||
          segs.some(s => distToSeg(p, s) < TOL && s.owner !== c.id)
      }))
    const onSeg = segs.some(s => distToSeg(e.p, s) < TOL && !(e.name.startsWith(s.owner + '.')))
    // 合理开路：紧邻文字标签（按文字矩形判定）/ 落在封装框内部
    const textW = (t, fs) => {
      let w = 0
      for (const ch of t) w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fs * 1.02 : fs * 0.55
      return w
    }
    const nearLbl = lbls.some(l => {
      const lp = l.at ?? (l.from && l.to ? [(l.from[0] + l.to[0]) / 2, (l.from[1] + l.to[1]) / 2] : null)
      if (!lp || !l.text) return false
      const fs = l.type === 'rail' ? 13 : 12
      const w = textW(l.text, fs)
      const bx = l.type === 'rail' ? lp[0] - w / 2 : lp[0]
      const by = l.type === 'rail' ? lp[1] - 7 : lp[1]
      return e.p[0] > bx - 16 && e.p[0] < bx + w + 16 && e.p[1] > by - fs * 0.78 - 16 && e.p[1] < by + fs * 0.22 + 16
    })
    // 封装框内部的引脚（如光耦里的光敏管基极）不引出是正常的
    const insideBox = boxes.some(b => {
      const x1 = Math.min(b.from[0], b.to[0]), x2 = Math.max(b.from[0], b.to[0])
      const y1 = Math.min(b.from[1], b.to[1]), y2 = Math.max(b.from[1], b.to[1])
      return e.p[0] > x1 + TOL && e.p[0] < x2 - TOL && e.p[1] > y1 + TOL && e.p[1] < y2 - TOL
    })
    const onBox = boxes.some(b => {
      const x1 = Math.min(b.from[0], b.to[0]), x2 = Math.max(b.from[0], b.to[0])
      const y1 = Math.min(b.from[1], b.to[1]), y2 = Math.max(b.from[1], b.to[1])
      return e.p[0] > x1 - TOL && e.p[0] < x2 + TOL && e.p[1] > y1 - TOL && e.p[1] < y2 + TOL &&
        (Math.abs(e.p[0] - x1) < TOL || Math.abs(e.p[0] - x2) < TOL || Math.abs(e.p[1] - y1) < TOL || Math.abs(e.p[1] - y2) < TOL)
    })
    if (!near && !motorOk && !onSeg && !nearLbl && !onBox && !insideBox) probs.push(`悬空 ${e.name} @(${e.p[0]},${e.p[1]})`)
  }
  if (probs.length) {
    issues += probs.length
    console.log(`\n[${cs.id}] ${cs.title}`)
    probs.forEach(p => console.log('  - ' + p))
  }
}
console.log(`\n=== ${circuitCases.length} 例，问题 ${issues} 处 ===`)
