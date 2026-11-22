<script setup lang="ts">
/**
 * 交互式动画 ②：RC 充放电（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 左侧电路：电池、开关、电阻 R、电容 C
 *   - 右侧示波器：实时绘制电容电压 Uc(t) 曲线，标注 τ / 2τ / 3τ / 4τ
 *   - 电流粒子随充放电方向反转，速度与 |I| 成正比
 * 交互：
 *   - 调节 R / C 改变时间常数 τ = RC
 *   - 手动切换充电 / 放电，或自动循环
 *   - 暂停 / 复位
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const params = reactive({
  vin: 5,
  r: 10, // kΩ
  c: 100, // µF
})
const playing = ref(true)
const autoLoop = ref(true)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C_LINE = '#475569'
const C_SYMBOL = '#0f172a'
const C_TEXT = '#64748b'
const C_STRONG = '#0f172a'
const C_GRID = '#e2e8f0'
const C_AMBER = '#f59e0b'
const C_BRAND = '#2549eb'
// 示波器（深色面板）
const S_BG = '#0b1120'
const S_GRID = '#1e293b'
const S_AXIS = '#334155'
const S_CURVE = '#22d3ee'
const S_TEXT = '#94a3b8'

/* ---------------- 计算 ---------------- */
/** 时间常数 τ = R × C（R: kΩ, C: µF → 结果单位 s） */
const tau = computed(() => (params.r * params.c) / 1000)
const tauText = computed(() => (tau.value >= 1 ? `${tau.value.toFixed(2)} s` : `${(tau.value * 1000).toFixed(0)} ms`))
const PHASE_LEN = 4 // 每个阶段绘制 4τ
const windowSec = computed(() => PHASE_LEN * tau.value)

/* ---------------- 仿真状态（非响应式，逐帧更新） ---------------- */
interface Sample {
  x: number
  y: number
}
const sim = {
  phase: 'charge' as 'charge' | 'discharge',
  vc: 0,
  t: 0,
  samples: [] as Sample[],
}

/** 用于界面展示的节流读数 */
const disp = reactive({ vc: 0, i: 0, t: 0, phase: 'charge' as 'charge' | 'discharge' })
const currentMa = computed(() => (disp.i * 1000).toFixed(2))

/* ---------------- Konva ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

let dots: Konva.Circle[] = []
let curve: Konva.Line | null = null
let tip: Konva.Circle | null = null
let capFill: Konva.Rect | null = null
let capGlow: Konva.Circle | null = null
let switchArm: Konva.Line | null = null
let phaseLabel: Konva.Text | null = null

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  len: number
}
let segs: Seg[] = []
let totalLen = 0
let offset = 0
/** 阶段结束后的定格计时（秒），用于让用户看清终值再切换 */
let hold = 0

/** 由 buildScene 填充的布局信息，供逐帧更新使用 */
const layout = {
  sx0: 0,
  sx1: 0,
  syTop: 0,
  syBottom: 0,
  capX: 0,
  capY: 0,
  plateHalf: 20,
}

function zigzagH(y: number, x1: number, x2: number, amp = 9, peaks = 6): number[] {
  const pts: number[] = [x1, y]
  const seg = (x2 - x1) / (peaks + 1)
  for (let i = 1; i <= peaks; i++) {
    pts.push(x1 + seg * i, y + (i % 2 ? -amp : amp))
  }
  pts.push(x2, y)
  return pts
}

function wire(points: number[], width = 3, color = C_LINE) {
  return new Konva.Line({ points, stroke: color, strokeWidth: width, lineCap: 'round', lineJoin: 'round' })
}

function buildScene() {
  if (!stage || !layer) return
  const W = stage.width()
  // 窄屏重排的瞬间，容器宽度可能被量到几十像素，
  // 此时按宽度算出的格子/绘图区会变成负数，Konva 画圆角矩形时会抛
  // IndexSizeError: radius is negative。宽度不足就先跳过绘制，
  // 等 ResizeObserver 拿到最终宽度后再重建场景。
  if (W < 300) return

  const narrow = W < 660
  const H = narrow ? 500 : 336

  // 布局：窄屏上下堆叠，宽屏左右分栏
  const cx0 = narrow ? 56 : 66
  const cx1 = narrow ? W - 56 : Math.max(230, W * 0.42)
  const topY = narrow ? 54 : 62
  const botY = narrow ? 206 : 286
  const midY = (topY + botY) / 2

  const sx0 = narrow ? 46 : Math.max(cx1 + 40, W * 0.5)
  const sx1 = W - 30
  const syTop = narrow ? 286 : 76
  const syBottom = narrow ? 462 : 292

  Object.assign(layout, { sx0, sx1, syTop, syBottom, capX: cx1, capY: midY, plateHalf: 20 })

  stage.height(H)
  layer.destroyChildren()

  /* ============ 左侧电路 ============ */
  // 网格
  for (let x = 0; x <= cx1 + 20; x += 28) {
    layer.add(new Konva.Line({ points: [x, 8, x, botY + 26], stroke: C_GRID, strokeWidth: 1, opacity: 0.45 }))
  }
  for (let y = 8; y <= botY + 26; y += 28) {
    layer.add(new Konva.Line({ points: [0, y, cx1 + 20, y], stroke: C_GRID, strokeWidth: 1, opacity: 0.45 }))
  }

  const swX1 = cx0 + 30
  const swX2 = swX1 + 44
  const rX1 = cx1 - 104
  const rX2 = rX1 + 68

  // 导线
  layer.add(wire([cx0, topY, swX1, topY]))
  layer.add(wire([swX2, topY, rX1, topY]))
  layer.add(wire([rX2, topY, cx1, topY]))
  layer.add(wire([cx1, topY, cx1, midY - 8]))
  layer.add(wire([cx1, midY + 8, cx1, botY]))
  layer.add(wire([cx1, botY, cx0, botY]))
  layer.add(wire([cx0, botY, cx0, midY + 8]))
  layer.add(wire([cx0, midY - 8, cx0, topY]))

  // 电池
  layer.add(wire([cx0 - 18, midY - 8, cx0 + 18, midY - 8], 4, C_SYMBOL))
  layer.add(wire([cx0 - 9, midY + 8, cx0 + 9, midY + 8], 4, C_SYMBOL))
  layer.add(new Konva.Text({ x: cx0 - 66, y: midY - 22, width: 44, align: 'right', text: `${params.vin}V`, fontSize: 13, fontStyle: 'bold', fontFamily: FONT, fill: C_STRONG }))
  layer.add(new Konva.Text({ x: cx0 - 66, y: midY + 16, width: 44, align: 'right', text: '+  −', fontSize: 11, fontFamily: FONT, fill: C_TEXT }))

  // 开关（顶部左侧）：铰链点 + 可旋转的闸刀
  layer.add(new Konva.Circle({ x: swX1, y: topY, radius: 3, fill: C_SYMBOL }))
  layer.add(new Konva.Circle({ x: swX2, y: topY, radius: 3, fill: C_SYMBOL }))
  switchArm = new Konva.Line({ points: [swX1, topY, swX2, topY], stroke: C_SYMBOL, strokeWidth: 3.4, lineCap: 'round' })
  layer.add(switchArm)
  layer.add(new Konva.Text({ x: swX1 - 6, y: topY - 22, text: 'S', fontSize: 12, fontStyle: 'bold', fontFamily: FONT, fill: C_TEXT }))

  // 电阻 R（顶部右侧，水平锯齿）
  layer.add(wire(zigzagH(topY, rX1, rX2), 3.4, C_SYMBOL))
  layer.add(new Konva.Text({ x: (rX1 + rX2) / 2 - 6, y: topY - 46, text: 'R', fontSize: 13, fontStyle: 'bold', fontFamily: FONT, fill: C_STRONG }))
  layer.add(new Konva.Text({ x: (rX1 + rX2) / 2 - 18, y: topY - 30, text: `${params.r}kΩ`, fontSize: 11, fontFamily: FONT, fill: C_TEXT }))

  // 电容 C（右侧竖直）
  layer.add(wire([cx1 - 20, midY - 8, cx1 + 20, midY - 8], 4, C_SYMBOL))
  layer.add(wire([cx1 - 20, midY + 8, cx1 + 20, midY + 8], 4, C_SYMBOL))
  // 充电指示：极板之间的能量填充
  capGlow = new Konva.Circle({ x: cx1, y: midY, radius: 24, fill: C_AMBER, opacity: 0, shadowColor: C_AMBER, shadowBlur: 18, shadowOpacity: 0.6 })
  layer.add(capGlow)
  capFill = new Konva.Rect({ x: cx1 - 19, y: midY - 7, width: 38, height: 14, fill: C_AMBER, opacity: 0 })
  layer.add(capFill)
  layer.add(new Konva.Text({ x: cx1 - 82, y: midY - 30, width: 54, align: 'right', text: 'C', fontSize: 13, fontStyle: 'bold', fontFamily: FONT, fill: C_STRONG }))
  layer.add(new Konva.Text({ x: cx1 - 82, y: midY - 14, width: 54, align: 'right', text: `${params.c}µF`, fontSize: 11, fontFamily: FONT, fill: C_TEXT }))

  // Uc 探针标注
  layer.add(new Konva.Text({ x: cx1 - 96, y: botY + 6, text: 'U_C', fontSize: 11, fontStyle: 'bold', fontFamily: FONT, fill: C_BRAND }))

  // 电流粒子
  dots = []
  for (let i = 0; i < 12; i++) {
    const d = new Konva.Circle({ x: -30, y: -30, radius: 3.4, fill: C_AMBER, opacity: 0.95 })
    d.shadowColor(C_AMBER)
    d.shadowBlur(6)
    d.shadowOpacity(0.55)
    layer.add(d)
    dots.push(d)
  }

  // 粒子路径（含电容间隙，视觉上穿过）
  const path: Array<[number, number]> = [
    [cx0, midY - 8],
    [cx0, topY],
    [cx1, topY],
    [cx1, midY - 8],
    [cx1, midY + 8],
    [cx1, botY],
    [cx0, botY],
    [cx0, midY + 8],
  ]
  segs = []
  totalLen = 0
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i]
    const [x2, y2] = path[i + 1]
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len > 0) {
      segs.push({ x1, y1, x2, y2, len })
      totalLen += len
    }
  }

  /* ============ 右侧示波器 ============ */
  const sw = sx1 - sx0
  const sh = syBottom - syTop
  layer.add(new Konva.Rect({ x: sx0 - 10, y: syTop - 24, width: sw + 20, height: sh + 42, fill: S_BG, cornerRadius: 12 }))
  // 网格
  for (let i = 0; i <= 4; i++) {
    const y = syBottom - (sh * i) / 4
    layer.add(new Konva.Line({ points: [sx0, y, sx1, y], stroke: S_GRID, strokeWidth: 1 }))
  }
  for (let i = 0; i <= PHASE_LEN; i++) {
    const x = sx0 + (sw * i) / PHASE_LEN
    layer.add(new Konva.Line({ points: [x, syTop, x, syBottom], stroke: S_GRID, strokeWidth: 1 }))
  }
  // 坐标轴
  layer.add(new Konva.Line({ points: [sx0, syBottom, sx1, syBottom], stroke: S_AXIS, strokeWidth: 1.5 }))
  layer.add(new Konva.Line({ points: [sx0, syTop, sx0, syBottom], stroke: S_AXIS, strokeWidth: 1.5 }))

  // 纵轴刻度
  layer.add(new Konva.Text({ x: sx0 + 4, y: syTop - 2, text: `${params.vin}V`, fontSize: 9, fontFamily: FONT, fill: S_TEXT }))
  layer.add(new Konva.Text({ x: sx0 + 4, y: syBottom - 12, text: '0', fontSize: 9, fontFamily: FONT, fill: S_TEXT }))
  // 63.2% 参考线
  const y632 = syBottom - sh * 0.632
  layer.add(new Konva.Line({ points: [sx0, y632, sx1, y632], stroke: '#475569', strokeWidth: 1, dash: [4, 4] }))
  layer.add(new Konva.Text({ x: sx1 - 62, y: y632 - 13, text: '0.632Vin', fontSize: 8.5, fontFamily: FONT, fill: '#64748b' }))

  // 横轴刻度
  for (let i = 1; i <= PHASE_LEN; i++) {
    const x = sx0 + (sw * i) / PHASE_LEN
    layer.add(new Konva.Text({ x: x - 6, y: syBottom + 5, text: `${i}τ`, fontSize: 9, fontFamily: FONT, fill: S_TEXT }))
  }
  layer.add(new Konva.Text({ x: sx1 - 46, y: syTop - 19, text: 'Uc(t)', fontSize: 10, fontStyle: 'bold', fontFamily: FONT, fill: S_CURVE }))

  // 曲线 + 端点
  curve = new Konva.Line({ points: [], stroke: S_CURVE, strokeWidth: 2.4, lineCap: 'round', lineJoin: 'round', shadowColor: S_CURVE, shadowBlur: 8, shadowOpacity: 0.5 })
  layer.add(curve)
  tip = new Konva.Circle({ x: sx0, y: syBottom, radius: 4, fill: S_CURVE, shadowColor: S_CURVE, shadowBlur: 10, shadowOpacity: 0.9 })
  layer.add(tip)

  // 阶段标签
  phaseLabel = new Konva.Text({
    x: sx0 + 8,
    y: syTop - 19,
    text: '',
    fontSize: 10,
    fontStyle: 'bold',
    fontFamily: FONT,
    fill: C_AMBER,
  })
  layer.add(phaseLabel)

  layer.draw()
  redrawCurve()
}

/** 把采样点画到示波器上 */
function redrawCurve() {
  if (!curve || !tip) return
  const pts = sim.samples.flatMap((p) => [p.x, p.y])
  curve.points(pts)
  const last = sim.samples[sim.samples.length - 1]
  if (last) tip.position({ x: last.x, y: last.y })
  layer?.batchDraw()
}

/** 采样：把当前 (t, Uc) 转成画布坐标 */
function sample() {
  const { sx0, sx1, syTop, syBottom } = layout
  const sw = sx1 - sx0
  const sh = syBottom - syTop
  const xn = Math.min(1, sim.t / windowSec.value)
  sim.samples.push({
    x: sx0 + sw * xn,
    y: syBottom - sh * Math.min(1, sim.vc / Math.max(0.001, params.vin)),
  })
  if (sim.samples.length > 900) sim.samples.shift()
}

function pointAt(dist: number) {
  if (!totalLen) return { x: 0, y: 0 }
  let d = ((dist % totalLen) + totalLen) % totalLen
  for (const s of segs) {
    if (d <= s.len) {
      const t = d / s.len
      return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t }
    }
    d -= s.len
  }
  return { x: segs[0].x1, y: segs[0].y1 }
}

/** 重置当前阶段（切换充放电时调用） */
function resetPhase(phase: 'charge' | 'discharge', keepVc = true) {
  sim.phase = phase
  sim.t = 0
  sim.samples = []
  if (!keepVc) sim.vc = phase === 'charge' ? 0 : params.vin
  disp.phase = phase
}

function initStage() {
  if (!wrapRef.value) return
  const width = Math.max(320, wrapRef.value.clientWidth)
  stage = new Konva.Stage({ container: wrapRef.value, width, height: 336 })
  layer = new Konva.Layer()
  stage.add(layer)
  sim.vc = 0
  buildScene()

  let last = 0
  let lastRead = 0
  anim = new Konva.Animation((frame) => {
    if (!frame || !playing.value) {
      last = frame?.time ?? 0
      return
    }
    const dtReal = last ? Math.min(0.05, (frame.time - last) / 1000) : 0
    last = frame.time
    if (dtReal <= 0) return

    const t = tau.value
    // 让 4τ 在约 3.5 秒内演完，τ 大小不影响观感
    const scale = (PHASE_LEN * t) / 3.5
    const dtSim = Math.min(dtReal * scale, t * 0.08)

    // 数值积分：充电 dUc = (Vin−Uc)/τ·dt；放电 dUc = −Uc/τ·dt
    if (sim.phase === 'charge') {
      sim.vc += ((params.vin - sim.vc) / t) * dtSim
    } else {
      sim.vc -= (sim.vc / t) * dtSim
    }
    sim.vc = Math.max(0, Math.min(params.vin, sim.vc))
    sim.t += dtSim
    sample()
    redrawCurve()

    // 电流方向：充电正向（流出电池正极），放电反向
    const iMag = Math.abs((params.vin - sim.vc) / (params.r * 1000))
    const iDisp = sim.phase === 'charge' ? (params.vin - sim.vc) / (params.r * 1000) : -sim.vc / (params.r * 1000)
    const speed = 20 + 240 * Math.min(1, Math.sqrt(iMag / 0.0005))
    offset += speed * dtReal * (sim.phase === 'charge' ? 1 : -1)
    const gap = totalLen / dots.length
    for (let i = 0; i < dots.length; i++) {
      const p = pointAt(offset + i * gap)
      dots[i].position(p)
    }

    // 电容能量可视化
    const ratio = sim.vc / Math.max(0.001, params.vin)
    capFill?.opacity(0.15 + 0.85 * ratio)
    capGlow?.opacity(ratio * 0.28)
    if (switchArm) {
      // 闭合状态：闸刀压到触点
      switchArm.points([switchArm.points()[0], switchArm.points()[1], switchArm.points()[2], switchArm.points()[3]])
    }
    if (phaseLabel) {
      phaseLabel.text(sim.phase === 'charge' ? '● 充电中  Uc ↑' : '● 放电中  Uc ↓')
      phaseLabel.fill(sim.phase === 'charge' ? '#f59e0b' : '#22d3ee')
    }

    // 阶段结束 → 定格 1.2 秒让用户看清终值，再自动切换到下一阶段
    if (sim.t >= windowSec.value - 1e-6) {
      sim.t = windowSec.value
      hold += dtReal
      if (autoLoop.value && hold >= 1.2) {
        hold = 0
        resetPhase(sim.phase === 'charge' ? 'discharge' : 'charge')
        offset = 0
      }
    }

    // 读数节流刷新
    const now = performance.now()
    disp.vc = sim.vc
    disp.t = sim.t
    disp.i = iDisp
    if (now - lastRead > 90) {
      lastRead = now
      layer?.batchDraw()
    }
  }, layer)
  anim.start()
}

onMounted(() => {
  initStage()
  if (wrapRef.value) {
    ro = new ResizeObserver(() => {
      if (!stage || !wrapRef.value) return
      const w = Math.max(320, wrapRef.value.clientWidth)
      if (Math.abs(w - stage.width()) < 2) return
      stage.width(w)
      buildScene()
    })
    ro.observe(wrapRef.value)
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  anim?.stop()
  stage?.destroy()
  stage = null
  layer = null
})

// R / C 变化 → 时间常数变化，重新开始当前阶段
watch(
  () => [params.r, params.c],
  () => {
    resetPhase(sim.phase, true)
    buildScene()
  },
)

// Vin 变化 → 重建图形并把电容电压按比例缩放
watch(
  () => params.vin,
  () => {
    sim.vc = Math.min(sim.vc, params.vin)
    resetPhase(sim.phase, true)
    buildScene()
  },
)

function switchPhase() {
  resetPhase(sim.phase === 'charge' ? 'discharge' : 'charge')
  offset = 0
  hold = 0
}

function reset() {
  params.vin = 5
  params.r = 10
  params.c = 100
  sim.vc = 0
  resetPhase('charge', false)
  offset = 0
  hold = 0
  buildScene()
}

function togglePlay() {
  playing.value = !playing.value
  if (anim) anim.start()
}

const progressPct = computed(() => Math.min(100, (disp.t / windowSec.value) * 100))
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-accent-600 text-white">
          <AppIcon name="chart" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">RC 充放电 · 交互式动画</span>
        <span class="tag bg-cyan-50 text-accent-600">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-ghost btn-sm" @click="switchPhase">
          <AppIcon name="rotate" :size="13" />
          {{ disp.phase === 'charge' ? '切到放电' : '切到充电' }}
        </button>
        <button class="btn-ghost btn-sm" @click="togglePlay">
          <AppIcon :name="playing ? 'clock' : 'play'" :size="13" />
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button class="btn-ghost btn-sm" @click="reset">
          <AppIcon name="refresh" :size="13" />
          复位
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 读数 -->
    <div class="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">电容电压 Uc</div>
        <div class="mt-0.5 font-mono text-base font-bold text-brand-700">
          {{ disp.vc.toFixed(2) }} <span class="text-xs font-normal text-ink-400">V</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">电流 |I|</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ currentMa }} <span class="text-xs font-normal text-ink-400">mA</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">时间常数 τ</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ tauText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前状态</div>
        <div class="mt-0.5 flex items-center gap-1.5 text-sm font-bold" :class="disp.phase === 'charge' ? 'text-amber-600' : 'text-cyan-600'">
          <span class="h-2 w-2 rounded-full" :class="disp.phase === 'charge' ? 'bg-amber-500' : 'bg-cyan-500'" />
          {{ disp.phase === 'charge' ? '充电' : '放电' }}
          <span class="ml-1 font-mono text-[11px] font-normal text-ink-400">t = {{ (disp.t).toFixed(2) }}s</span>
        </div>
      </div>
    </div>

    <!-- 进度条（当前阶段 4τ） -->
    <div class="h-1 w-full bg-slate-100">
      <div
        class="h-full bg-gradient-to-r from-amber-400 to-accent-500 transition-[width] duration-100"
        :style="{ width: `${progressPct}%` }"
      />
    </div>

    <!-- 控制区 -->
    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <div class="mb-1.5 flex items-baseline justify-between">
            <label class="text-xs font-semibold text-ink-600">电阻 R</label>
            <span class="font-mono text-xs font-bold text-ink-800">{{ params.r }} kΩ</span>
          </div>
          <input v-model.number="params.r" type="range" min="1" max="100" step="1" class="slider" />
        </div>
        <div>
          <div class="mb-1.5 flex items-baseline justify-between">
            <label class="text-xs font-semibold text-ink-600">电容 C</label>
            <span class="font-mono text-xs font-bold text-ink-800">{{ params.c }} µF</span>
          </div>
          <input v-model.number="params.c" type="range" min="10" max="1000" step="10" class="slider" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <label class="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink-600">
          <input v-model="autoLoop" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          自动循环（充 → 放 → 充）
        </label>
        <span class="font-mono text-[11px] text-ink-400">τ = R × C = {{ params.r }}kΩ × {{ params.c }}µF = {{ tauText }}</span>
      </div>

      <div class="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-600">
        <div>充电：Uc(t) = Vin × (1 − e<sup>−t/τ</sup>) → {{ params.vin }} × (1 − e<sup>−t/{{ tauText }}</sup>)</div>
        <div class="mt-0.5">放电：Uc(t) = U₀ × e<sup>−t/τ</sup></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  background: linear-gradient(90deg, #a5f3fc, #c7d7fe);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0891b2;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(8, 145, 178, 0.45);
  transition: transform 0.15s ease;
}
.slider::-webkit-slider-thumb:hover {
  transform: scale(1.12);
}
.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0891b2;
  border: 2px solid #fff;
}
</style>
