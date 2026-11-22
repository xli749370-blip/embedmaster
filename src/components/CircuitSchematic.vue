<script setup lang="ts">
/**
 * 电路原理图渲染器：把样例库里的元件坐标描述画成 SVG
 * - 符号自绘，按 GB/T 4728 习惯：电阻矩形、二极管三角、三极管/MOS、接地、电源轨、继电器/电机…
 * - 线路严格水平/垂直（正交矩形走线），斜线只允许出现在数据显式声明处
 * - 高亮模式：传入 highlight（元件 id 列表）→ 相关元件琥珀色加粗，其余淡化
 * - 悬空线端自动画"端子圆圈"（开路输入/输出端），符合图纸惯例
 * - 容器带 .anim-panel 类，深色模式下保持亮色"仪表盘"外观（与 Konva 动画一致）
 */
import { computed } from 'vue'
import type { CircuitComp, CircuitCase } from '@/mock/circuit-parts'

const props = defineProps<{
  circuit: CircuitCase
  /** 高亮的元件 id；为空 = 全部正常显示 */
  highlight?: string[]
}>()

const hl = computed(() => new Set(props.highlight ?? []))
const state = (id: string) => (hl.value.size === 0 ? 'idle' : hl.value.has(id) ? 'hl' : 'dim')
const strokeOf = (id: string) => (state(id) === 'hl' ? '#d97706' : '#334155')
const widthOf = (id: string) => (state(id) === 'hl' ? 2.8 : 1.8)
const opOf = (id: string) => (state(id) === 'dim' ? 0.16 : 1)

/** 两端元件的几何信息 */
function geo(c: CircuitComp) {
  const [x1, y1] = c.from!
  const [x2, y2] = c.to!
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  return { x1, y1, len, ang, mid: len / 2 }
}

/** 标注文字的位置（局部坐标转全局） */
function labelPos(c: CircuitComp) {
  // 三端元件：默认放在符号右下方
  if (c.at && !c.from) {
    return {
      x: c.at[0] + (c.labelOffset?.[0] ?? 28),
      y: c.at[1] + (c.labelOffset?.[1] ?? 30),
      anchor: 'middle' as const,
    }
  }
  const { x1, y1, len, ang } = geo(c)
  const rad = (ang * Math.PI) / 180
  const mx = x1 + (Math.cos(rad) * len) / 2
  const my = y1 + (Math.sin(rad) * len) / 2
  const vertical = Math.abs(c.to![0] - c.from![0]) < 0.001
  if (c.labelOffset) return { x: mx + c.labelOffset[0], y: my + c.labelOffset[1], anchor: 'middle' as const }
  if (vertical) return { x: mx + 14, y: my + 4, anchor: 'start' as const }
  return { x: mx, y: my - 12, anchor: 'middle' as const }
}


/** 晶振符号几何：按元件长度自适应，短元件也能画全 */
function xtalGeo(len: number) {
  const maxLead = Math.max(3, len / 2 - 3)
  const lead = Math.min(12, maxLead)
  return { lead, plate: Math.min(10, lead + 2), core: Math.min(5.5, Math.max(3, lead - 0.5)) }
}

/** 电阻国标矩形（GB/T 4728）：引线 + 长方形本体 */function resRect(len: number) {
  const bw = Math.min(44, Math.max(16, len - 10))
  const bh = Math.min(11, Math.max(7, bw / 3.6))
  const x0 = (len - bw) / 2
  return { x0, bw, bh }
}

/** 线段上的引线：cap/pcap/bat 中间留断口 */
function leadsWithGap(len: number, gapHalf = 4) {
  return `M0 0 H${len / 2 - gapHalf} M${len / 2 + gapHalf} 0 H${len}`
}

/** 在 (x1,y1)→(x2,y2) 线段的 t 处放一个沿线的箭头（tip 朝 x2 端） */
function arrowPts(x1: number, y1: number, x2: number, y2: number, t = 0.72, half = 4.2, back = 9) {
  const dx = x2 - x1, dy = y2 - y1
  const L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  const px = -uy, py = ux
  const tx = x1 + dx * t, ty = y1 + dy * t
  const bx = tx - ux * back, by = ty - uy * back
  return `${tx},${ty} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`
}

/* ---------------- 悬空端子自动检测 ---------------- */
/** 元件对外引脚（与 audit 脚本同一套约定） */
function pinsOf(c: CircuitComp): [number, number][] {
  if (c.from && c.to && c.type !== 'box') return [c.from, c.to]
  if (!c.at) return []
  const [x, y] = c.at
  const rot = c.rot ?? 0
  const R = (dx: number, dy: number): [number, number] =>
    rot === 90 ? [x - dy, y + dx] : rot === 180 ? [x - dx, y - dy] : rot === 270 ? [x + dy, y - dx] : [x + dx, y + dy]
  if (c.type === 'npn' || c.type === 'pnp') return [R(-30, 0), R(10, -20), R(10, 20)]
  if (c.type === 'nmos' || c.type === 'pmos') return [R(-25, 0), R(10, -22), R(10, 22)]
  if (c.type === 'motor') return [[x, y - 15], [x, y + 15], [x - 15, y], [x + 15, y]]
  if (c.type === 'ac') return [R(0, -16), R(0, 16)]
  if (c.type === 'gnd' || c.type === 'rail') return [[x, y]]
  return []
}
const distToSeg = (p: [number, number], s: { x1: number; y1: number; x2: number; y2: number }) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1
  const L2 = dx * dx + dy * dy
  let t = L2 ? ((p[0] - s.x1) * dx + (p[1] - s.y1) * dy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (s.x1 + t * dx), p[1] - (s.y1 + t * dy))
}
/** 字宽估算（font-size 12 / weight 600）：CJK≈12.2，ASCII≈6.6 */
function textW(t: string, fs = 12) {
  let w = 0
  for (const ch of t) w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fs * 1.02 : fs * 0.55
  return w
}
/** 导线/虚线端点上，既没碰到别的引脚、也不落在别的线段/封装框/文字标签附近的 → 画端子圆圈 */
const openEnds = computed(() => {
  const cs = props.circuit
  const TOL = 3
  const pins: { p: [number, number]; owner: string }[] = []
  const segs: { x1: number; y1: number; x2: number; y2: number; owner: string }[] = []
  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = []
  const labels: { at: [number, number]; text: string; type: string }[] = []
  for (const c of cs.comps) {
    for (const p of pinsOf(c)) pins.push({ p, owner: c.id })
    if (c.from && c.to && c.type !== 'box') segs.push({ x1: c.from[0], y1: c.from[1], x2: c.to[0], y2: c.to[1], owner: c.id })
    if (c.type === 'box' && c.from && c.to) {
      boxes.push({
        x1: Math.min(c.from[0], c.to[0]), x2: Math.max(c.from[0], c.to[0]),
        y1: Math.min(c.from[1], c.to[1]), y2: Math.max(c.from[1], c.to[1]),
      })
    }
    if ((c.type === 'label' || c.type === 'rail') && c.at && c.text) labels.push({ at: c.at, text: c.text, type: c.type })
  }
  const ends: { id: string; x: number; y: number }[] = []
  for (const c of cs.comps) {
    if (c.type !== 'wire' && c.type !== 'dline') continue
    for (const p of [c.from!, c.to!] as [number, number][]) {
      const nearPin = pins.some(o => o.owner !== c.id && Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < TOL)
      const onSeg = segs.some(s => s.owner !== c.id && distToSeg(p, s) < TOL)
      const onBox = boxes.some(b =>
        p[0] > b.x1 - TOL && p[0] < b.x2 + TOL && p[1] > b.y1 - TOL && p[1] < b.y2 + TOL &&
        (Math.abs(p[0] - b.x1) < TOL || Math.abs(p[0] - b.x2) < TOL || Math.abs(p[1] - b.y1) < TOL || Math.abs(p[1] - b.y2) < TOL))
      // 文字标签按"文字矩形"判定（与审计脚本同一口径），避免端子圈压到文字上
      const nearLbl = labels.some(l => {
        const fs = l.type === 'rail' ? 13 : 12
        const w = textW(l.text, fs)
        const bx = l.type === 'rail' ? l.at[0] - w / 2 : l.at[0]
        const by = l.type === 'rail' ? l.at[1] - 7 : l.at[1]
        return p[0] > bx - 16 && p[0] < bx + w + 16 && p[1] > by - fs * 0.78 - 16 && p[1] < by + fs * 0.22 + 16
      })
      if (!nearPin && !onSeg && !onBox && !nearLbl) ends.push({ id: c.id, x: p[0], y: p[1] })
    }
  }
  return ends
})
</script>

<template>
  <div
    class="anim-panel overflow-hidden rounded-xl border border-slate-200"
    style="background: #f8fafc"
  >
    <svg
      :viewBox="`0 0 ${circuit.width} ${circuit.height}`"
      class="block h-auto w-full"
      style="touch-action: manipulation"
    >
      <!-- 画布网格（很淡） -->
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="0.5" />
        </pattern>
      </defs>
      <rect x="0" y="0" :width="circuit.width" :height="circuit.height" fill="url(#grid)" />

      <template v-for="c in circuit.comps" :key="c.id">
        <!-- ============ 纯线段类 ============ -->
        <g v-if="c.type === 'wire' || c.type === 'dline'" :opacity="opOf(c.id)">
          <line
            :x1="c.from![0]" :y1="c.from![1]" :x2="c.to![0]" :y2="c.to![1]"
            :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)"
            :stroke-dasharray="c.type === 'dline' ? '5 4' : undefined"
            stroke-linecap="round"
          />
        </g>

        <circle v-else-if="c.type === 'dot'" :cx="c.at![0]" :cy="c.at![1]" r="4" fill="#334155" :opacity="opOf(c.id)" />

        <!-- ============ 两端元件 ============ -->
        <template v-else-if="c.from && c.to && c.type !== 'box'">
          <g :transform="`translate(${c.from![0]},${c.from![1]}) rotate(${geo(c).ang})`" :opacity="opOf(c.id)">
            <!-- 电阻（国标矩形） -->
            <template v-if="c.type === 'res'">
              <path :d="`M0 0 H${resRect(geo(c).len).x0} M${resRect(geo(c).len).x0 + resRect(geo(c).len).bw} 0 H${geo(c).len}`" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
              <rect
                :x="resRect(geo(c).len).x0" :y="-resRect(geo(c).len).bh / 2"
                :width="resRect(geo(c).len).bw" :height="resRect(geo(c).len).bh"
                fill="#f8fafc" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)"
              />
            </template>

            <!-- 二极管 / LED / 稳压管 -->
            <template v-else-if="c.type === 'diode' || c.type === 'led' || c.type === 'zener'">
              <path :d="`M0 0 H${geo(c).mid - 8} M${geo(c).mid + 7} 0 H${geo(c).len}`" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
              <polygon
                :points="`${geo(c).mid - 7},-8 ${geo(c).mid - 7},8 ${geo(c).mid + 7},0`"
                :fill="strokeOf(c.id)"
              />
              <line
                :x1="geo(c).mid + 7" :y1="-9" :x2="geo(c).mid + 7" :y2="9"
                :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.4"
              />
              <template v-if="c.type === 'zener'">
                <path
                  :d="`M${geo(c).mid + 7} -9 l-5 -4 M${geo(c).mid + 7} 9 l-5 4`"
                  :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" fill="none"
                />
              </template>
              <template v-if="c.type === 'led'">
                <g :stroke="strokeOf(c.id)" :stroke-width="1.6" fill="none" stroke-linecap="round">
                  <path :d="`M${geo(c).mid - 4} -10 l7 -7 m0 0 l-3.5 0.5 m3.5 -0.5 l-0.5 3.5`" />
                  <path :d="`M${geo(c).mid + 3} -10 l7 -7 m0 0 l-3.5 0.5 m3.5 -0.5 l-0.5 3.5`" />
                </g>
              </template>
            </template>

            <!-- 电容 / 极性电容（均为两条平行短直线；极性电容加 "+" 与加厚正极板） -->
            <template v-else-if="c.type === 'cap' || c.type === 'pcap'">
              <path :d="leadsWithGap(geo(c).len)" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
              <line :x1="geo(c).mid - 3.5" :y1="-11" :x2="geo(c).mid - 3.5" :y2="11" :stroke="strokeOf(c.id)" :stroke-width="c.type === 'pcap' ? widthOf(c.id) + 2 : widthOf(c.id) + 0.6" />
              <line :x1="geo(c).mid + 3.5" :y1="-11" :x2="geo(c).mid + 3.5" :y2="11" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.6" />
              <template v-if="c.type === 'pcap'">
                <text :x="7" y="-6" font-size="11" font-weight="bold" fill="#d97706">+</text>
              </template>
            </template>

            <!-- 晶振（GB/T 4728：两片电极板 + 中间晶片矩形） -->
            <template v-else-if="c.type === 'xtal'">
              <path :d="`M0 0 H${xtalGeo(geo(c).len).lead} M${geo(c).len - xtalGeo(geo(c).len).lead} 0 H${geo(c).len}`" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
              <line :x1="xtalGeo(geo(c).len).lead" :y1="-xtalGeo(geo(c).len).plate" :x2="xtalGeo(geo(c).len).lead" :y2="xtalGeo(geo(c).len).plate" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.4" />
              <line :x1="geo(c).len - xtalGeo(geo(c).len).lead" :y1="-xtalGeo(geo(c).len).plate" :x2="geo(c).len - xtalGeo(geo(c).len).lead" :y2="xtalGeo(geo(c).len).plate" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.4" />
              <rect
                :x="geo(c).len / 2 - xtalGeo(geo(c).len).core" :y="-xtalGeo(geo(c).len).core"
                :width="xtalGeo(geo(c).len).core * 2" :height="xtalGeo(geo(c).len).core * 2" rx="1.5"
                fill="#f8fafc" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)"
              />
            </template>

            <!-- 开关 -->
            <template v-else-if="c.type === 'sw'">
              <circle cx="4" cy="0" r="2.5" fill="#334155" />
              <circle :cx="geo(c).len - 4" cy="0" r="2.5" fill="#334155" />
              <path :d="`M0 0 H4 M${geo(c).len - 4} 0 H${geo(c).len}`" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
              <line :x1="5" :y1="0" :x2="geo(c).len - 7" :y2="-12" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" stroke-linecap="round" />
            </template>

            <!-- 继电器线圈 / 电感 -->
            <template v-else-if="c.type === 'coil'">
              <path
                :d="`M0 0 H3 ` + Array.from({ length: 4 }, (_, i) => {
                  const a = (geo(c).len - 6) / 4
                  return `a${a / 2},${a / 2} 0 0 1 ${a},0`
                }).join(' ') + ` H${geo(c).len}`"
                fill="none" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)"
              />
            </template>

            <!-- 电池 -->
            <template v-else-if="c.type === 'bat'">
              <path :d="leadsWithGap(geo(c).len, 5)" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
              <line :x1="geo(c).mid - 5" :y1="-12" :x2="geo(c).mid - 5" :y2="12" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.6" />
              <line :x1="geo(c).mid + 5" :y1="-6" :x2="geo(c).mid + 5" :y2="6" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.6" />
            </template>
          </g>

          <!-- 两端元件标注 -->
          <text
            v-if="c.text"
            :x="labelPos(c).x" :y="labelPos(c).y"
            :text-anchor="labelPos(c).anchor"
            font-size="12" font-weight="600"
            :fill="state(c.id) === 'hl' ? '#b45309' : '#475569'"
            :opacity="opOf(c.id)"
          >{{ c.text }}</text>
        </template>

        <!-- ============ 三端元件 ============ -->
        <g
          v-else-if="c.at && (c.type === 'npn' || c.type === 'pnp' || c.type === 'nmos' || c.type === 'pmos')"
          :transform="`translate(${c.at![0]},${c.at![1]}) rotate(${c.rot ?? 0})`"
          :opacity="opOf(c.id)"
        >
          <!-- NPN -->
          <template v-if="c.type === 'npn'">
            <circle cx="2" cy="0" r="20" fill="none" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-8" y1="-13" x2="-8" y2="13" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 1.2" />
            <line x1="-30" y1="0" x2="-8" y2="0" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-8" y1="-7" x2="10" y2="-20" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-8" y1="7" x2="10" y2="20" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <!-- 发射极箭头（沿发射极线、指向外） -->
            <polygon :points="arrowPts(-8, 7, 10, 20, 0.85)" :fill="strokeOf(c.id)" />
          </template>

          <!-- PNP -->
          <template v-else-if="c.type === 'pnp'">
            <circle cx="2" cy="0" r="20" fill="none" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-8" y1="-13" x2="-8" y2="13" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 1.2" />
            <line x1="-30" y1="0" x2="-8" y2="0" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-8" y1="-7" x2="10" y2="-20" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-8" y1="7" x2="10" y2="20" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <!-- 发射极箭头（沿发射极线、指向基极） -->
            <polygon :points="arrowPts(10, 20, -8, 7, 0.85)" :fill="strokeOf(c.id)" />
          </template>

          <!-- NMOS / PMOS -->
          <template v-else-if="c.type === 'nmos' || c.type === 'pmos'">
            <line x1="-25" y1="0" x2="-15" y2="0" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-15" y1="-11" x2="-15" y2="11" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.6" />
            <line x1="-9" y1="-14" x2="-9" y2="14" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 1.4" />
            <line x1="-9" y1="-8" x2="10" y2="-22" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line x1="-9" y1="8" x2="10" y2="22" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <!-- 体二极管（虚线示意；NMOS：S→D，PMOS：D→S） -->
            <g :stroke="state(c.id) === 'hl' ? '#d97706' : '#94a3b8'" fill="none" stroke-width="1.4">
              <path d="M13 16 L13 -16" stroke-dasharray="3 3" />
              <polygon v-if="c.type === 'nmos'" points="13,-16 9.5,-9 16.5,-9" fill="#94a3b8" stroke="none" />
              <polygon v-else points="13,16 9.5,9 16.5,9" fill="#94a3b8" stroke="none" />
              <line x1="13" y1="-16" x2="10" y2="-20" />
              <line x1="13" y1="16" x2="10" y2="20" />
            </g>
          </template>
        </g>

        <!-- 三端元件标注 -->
        <text
          v-if="c.at && c.text && (c.type === 'npn' || c.type === 'pnp' || c.type === 'nmos' || c.type === 'pmos')"
          :x="labelPos(c).x" :y="labelPos(c).y"
          font-size="12" font-weight="600"
          :text-anchor="labelPos(c).anchor"
          :fill="state(c.id) === 'hl' ? '#b45309' : '#475569'"
          :opacity="opOf(c.id)"
        >{{ c.text }}</text>

        <!-- ============ 独立符号 ============ -->
        <g v-else-if="c.at || c.type === 'box'" :opacity="opOf(c.id)">
          <!-- 电源轨 -->
          <template v-if="c.type === 'rail'">
            <line :x1="c.at![0] - 14" :y1="c.at![1]" :x2="c.at![0] + 14" :y2="c.at![1]" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id) + 0.4" stroke-linecap="round" />
            <text :x="c.at![0]" :y="c.at![1] - 7" text-anchor="middle" font-size="13" font-weight="700" fill="#b91c1c">{{ c.text }}</text>
          </template>

          <!-- 接地 -->
          <template v-else-if="c.type === 'gnd'">
            <line :x1="c.at![0]" :y1="c.at![1]" :x2="c.at![0]" :y2="c.at![1] + 2" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line :x1="c.at![0] - 12" :y1="c.at![1] + 2" :x2="c.at![0] + 12" :y2="c.at![1] + 2" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line :x1="c.at![0] - 7" :y1="c.at![1] + 7" :x2="c.at![0] + 7" :y2="c.at![1] + 7" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <line :x1="c.at![0] - 2" :y1="c.at![1] + 12" :x2="c.at![0] + 2" :y2="c.at![1] + 12" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
          </template>

          <!-- 电机 -->
          <template v-else-if="c.type === 'motor'">
            <circle :cx="c.at![0]" :cy="c.at![1]" r="15" fill="#f8fafc" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <text :x="c.at![0]" :y="c.at![1] + 5" text-anchor="middle" font-size="13" font-weight="700" :fill="strokeOf(c.id)">M</text>
          </template>

          <!-- 交流源（rot=90/270 时引脚水平，圆圈内画正弦符号） -->
          <template v-else-if="c.type === 'ac'">
            <circle :cx="c.at![0]" :cy="c.at![1]" r="16" fill="#f8fafc" :stroke="strokeOf(c.id)" :stroke-width="widthOf(c.id)" />
            <path
              :d="`M${c.at![0] - 8} ${c.at![1]} q4 -9 8 0 q4 9 8 0`"
              fill="none" :stroke="strokeOf(c.id)" :stroke-width="1.6"
            />
          </template>

          <!-- 封装框 -->
          <template v-else-if="c.type === 'box'">
            <rect
              :x="Math.min(c.from![0], c.to![0])" :y="Math.min(c.from![1], c.to![1])"
              :width="Math.abs(c.to![0] - c.from![0])" :height="Math.abs(c.to![1] - c.from![1])"
              rx="6" fill="#f8fafc" :stroke="strokeOf(c.id)" stroke-width="1.6" stroke-dasharray="6 4"
            />
            <text
              v-if="c.text"
              :x="(c.from![0] + c.to![0]) / 2" :y="(c.from![1] + c.to![1]) / 2 + 5"
              text-anchor="middle" font-size="13" font-weight="700" :fill="strokeOf(c.id)"
            >{{ c.text }}</text>
          </template>

          <!-- 自由文字 -->
          <template v-else-if="c.type === 'label'">
            <text :x="c.at![0]" :y="c.at![1]" font-size="12" font-weight="600" :fill="strokeOf(c.id)">{{ c.text }}</text>
          </template>
        </g>
      </template>

      <!-- 悬空端子（开路输入/输出端自动标注小圆圈） -->
      <circle
        v-for="(e, i) in openEnds"
        :key="'term-' + i"
        :cx="e.x" :cy="e.y" r="3.2"
        fill="#ffffff" :stroke="strokeOf(e.id)" stroke-width="1.6"
      />
    </svg>
  </div>
</template>
