<script setup lang="ts">
/**
 * 交互式动画 ③：PWM 波形（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 示波器风格的 PWM 方波，随时间向左滚动
 *   - 一条水平虚线标出平均电压 V_avg，直观体现"占空比等效出中间电压"
 *   - Y 轴标 0V / V_CC，X 轴标当前时间窗
 * 交互：
 *   - 拖动占空比滑块，方波宽度实时变化
 *   - 拖动频率滑块，时间窗自动缩放（始终显示约 4 个周期）
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const VCC = 3.3
const params = reactive({ duty: 35, freq: 1000 }) // duty: %  freq: Hz
const playing = ref(true)

/* ---------------- 计算 ---------------- */
/** 平均电压：PWM 的核心公式 */
const vavg = computed(() => (VCC * params.duty) / 100)
/** 周期，单位 ms */
const periodMs = computed(() => 1000 / params.freq)
/** 时间窗固定显示 4 个周期 */
const windowMs = computed(() => 4 * periodMs.value)
/** 等效分辨率：设计数时钟 1MHz，则一个周期内的计数级数 */
const resolution = computed(() => Math.round(1_000_000 / params.freq))

const freqText = computed(() =>
  params.freq >= 1000 ? `${(params.freq / 1000).toFixed(1)} kHz` : `${params.freq} Hz`,
)
const windowText = computed(() =>
  windowMs.value >= 1 ? `${windowMs.value.toFixed(1)} ms` : `${(windowMs.value * 1000).toFixed(0)} µs`,
)

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let wave: Konva.Line | null = null
let avgLine: Konva.Line | null = null
let ro: ResizeObserver | null = null

/** 滚动相位（像素） */
let phase = 0
let lastT = 0

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  wave: '#2549eb',
  avg: '#f59e0b',
  axis: '#94a3b8',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
}

/** 绘图区尺寸（随容器宽度计算） */
let plot = { x0: 0, x1: 0, yTop: 0, yBot: 0 }

const H = 230

/** 电压 → 画布 Y 坐标 */
function yOf(v: number): number {
  const r = v / VCC
  return plot.yBot - r * (plot.yBot - plot.yTop)
}

/**
 * 生成方波折线点。
 * 按"边沿"生成而非逐像素采样：点数少、跳变垂直干净。
 */
function wavePoints(ph: number): number[] {
  const { x0, x1 } = plot
  const T = (x1 - x0) / 4 // 时间窗内 4 个周期
  const highPx = (T * params.duty) / 100
  const yHigh = yOf(VCC)
  const yLow = yOf(0)

  /* 当前时刻在周期内的位置，决定起始电平 */
  const u = ((x0 - ph) % T + T) % T
  let curY = u < highPx ? yHigh : yLow
  const pts: number[] = [x0, curY]

  /* 收集落在可视区内的所有边沿 */
  const edges: Array<{ x: number; high: boolean }> = []
  let k = Math.ceil((x0 - ph) / T) - 1
  while (ph + k * T < x1 + T) {
    const rise = ph + k * T // 上升沿：变高
    const fall = rise + highPx // 下降沿：变低
    if (rise > x0 && rise < x1) edges.push({ x: rise, high: true })
    if (fall > x0 && fall < x1) edges.push({ x: fall, high: false })
    k++
  }
  edges.sort((a, b) => a.x - b.x)

  for (const e of edges) {
    pts.push(e.x, curY) // 水平走到边沿
    curY = e.high ? yHigh : yLow
    pts.push(e.x, curY) // 垂直跳变
  }
  pts.push(x1, curY) // 走到右边界
  return pts
}

/** 重建整个场景（尺寸变化、参数变化时调用） */
function buildScene() {
  if (!stage || !layer) return
  layer.destroyChildren()

  const w = stage.width()
  // 窄屏重排的瞬间，容器宽度可能被量到几十像素，
  // 此时按宽度算出的格子/绘图区会变成负数，Konva 画圆角矩形时会抛
  // IndexSizeError: radius is negative。宽度不足就先跳过绘制，
  // 等 ResizeObserver 拿到最终宽度后再重建场景。
  if (w < 200) return

  const padL = 46
  const padR = 16
  plot = { x0: padL, x1: w - padR, yTop: 22, yBot: H - 34 }

  const { x0, x1, yTop, yBot } = plot

  /* 背景 */
  layer.add(
    new Konva.Rect({
      x: x0,
      y: yTop,
      width: x1 - x0,
      height: yBot - yTop,
      fill: '#fbfcfe',
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 6,
    }),
  )

  /* 水平网格 + Y 轴刻度（0 / 1.65 / 3.3） */
  const yTicks = [0, VCC / 2, VCC]
  for (const v of yTicks) {
    const y = yOf(v)
    layer.add(
      new Konva.Line({
        points: [x0, y, x1, y],
        stroke: v === 0 ? C.axis : C.grid,
        strokeWidth: 1,
        dash: v === 0 ? [] : [3, 4],
      }),
    )
    layer.add(
      new Konva.Text({
        x: 6,
        y: y - 7,
        width: padL - 12,
        align: 'right',
        text: v === 0 ? '0' : v.toFixed(v === VCC ? 1 : 2),
        fontSize: 10.5,
        fontFamily: FONT,
        fill: C.text,
      }),
    )
  }

  /* 垂直网格：每个周期一条 */
  const T = (x1 - x0) / 4
  for (let i = 1; i <= 4; i++) {
    const x = x0 + T * i
    layer.add(
      new Konva.Line({ points: [x, yTop, x, yBot], stroke: C.grid, strokeWidth: 1, dash: [3, 4] }),
    )
  }

  /* 单位标注 */
  layer.add(
    new Konva.Text({ x: 6, y: yTop - 16, text: 'V', fontSize: 10, fontFamily: FONT, fill: C.axis }),
  )
  layer.add(
    new Konva.Text({
      x: x0,
      y: yBot + 8,
      text: `0`,
      fontSize: 10,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  layer.add(
    new Konva.Text({
      x: x1 - 90,
      y: yBot + 8,
      width: 90,
      align: 'right',
      text: windowText.value,
      fontSize: 10.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* 平均电压虚线 */
  const yAvg = yOf(vavg.value)
  avgLine = new Konva.Line({
    points: [x0, yAvg, x1, yAvg],
    stroke: C.avg,
    strokeWidth: 1.4,
    dash: [6, 4],
  })
  layer.add(avgLine)
  layer.add(
    new Konva.Text({
      x: x0 + 8,
      y: yAvg - 19,
      text: `V_avg = ${vavg.value.toFixed(2)} V`,
      fontSize: 10.5,
      fontFamily: FONT,
      fill: C.avg,
    }),
  )

  /* 主波形 */
  wave = new Konva.Line({
    points: wavePoints(phase),
    stroke: C.wave,
    strokeWidth: 2.4,
    lineJoin: 'miter',
    lineCap: 'butt',
  })
  layer.add(wave)

  /* 波形标签 */
  layer.add(
    new Konva.Text({
      x: x1 - 74,
      y: yTop + 6,
      width: 70,
      align: 'right',
      text: 'PWM',
      fontSize: 10,
      fontFamily: FONT,
      fontStyle: 'bold',
      fill: C.wave,
    }),
  )

  layer.draw()
}

/** 只更新波形与平均线（每帧调用，避免整场景重建） */
function redraw() {
  if (!wave || !avgLine) return
  wave.points(wavePoints(phase))
  const yAvg = yOf(vavg.value)
  avgLine.points([plot.x0, yAvg, plot.x1, yAvg])
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) anim?.start()
  else anim?.stop()
}

function reset() {
  params.duty = 35
  params.freq = 1000
  phase = 0
  buildScene()
}

onMounted(() => {
  if (!wrapRef.value) return
  stage = new Konva.Stage({
    container: wrapRef.value,
    width: wrapRef.value.clientWidth,
    height: H,
  })
  layer = new Konva.Layer()
  stage.add(layer)
  buildScene()

  anim = new Konva.Animation((frame) => {
    if (!frame) return
    const dt = lastT ? (frame.time - lastT) / 1000 : 0
    lastT = frame.time
    /* 固定像素滚动速度，营造"实时信号"的观感 */
    phase -= dt * 55
    const T = (plot.x1 - plot.x0) / 4
    if (T > 0 && phase < -T) phase += T
    redraw()
  }, layer)
  anim.start()

  ro = new ResizeObserver(() => {
    if (!stage || !wrapRef.value) return
    const w = wrapRef.value.clientWidth
    if (w === stage.width()) return
    stage.width(w)
    buildScene()
  })
  ro.observe(wrapRef.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  anim?.stop()
  stage?.destroy()
})

/* 参数变化 → 重建场景（时间窗/占空比都影响刻度与波形） */
watch(
  () => [params.duty, params.freq],
  () => buildScene(),
)
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-white">
          <AppIcon name="zap" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">PWM 波形 · 交互式动画</span>
        <span class="tag bg-brand-50 text-brand-700">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
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

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">占空比 D</div>
        <div class="mt-0.5 font-mono text-base font-bold text-brand-700">
          {{ params.duty }}<span class="text-xs font-normal text-ink-400">%</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">平均电压</div>
        <div class="mt-0.5 font-mono text-base font-bold text-amber-600">
          {{ vavg.toFixed(2) }} <span class="text-xs font-normal text-ink-400">V</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">周期 T</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ periodMs >= 1 ? periodMs.toFixed(2) : (periodMs * 1000).toFixed(0) }}
          <span class="text-xs font-normal text-ink-400">{{ periodMs >= 1 ? 'ms' : 'µs' }}</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">等效分辨率</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ resolution }} <span class="text-xs font-normal text-ink-400">级</span>
        </div>
      </div>
    </div>

    <!-- 控制区 -->
    <div class="space-y-4 px-4 py-4">
      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label class="text-xs font-semibold text-ink-600">占空比（CCR / (ARR+1)）</label>
          <span class="font-mono text-xs font-bold text-brand-700">{{ params.duty }} %</span>
        </div>
        <input v-model.number="params.duty" type="range" min="0" max="100" step="1" class="slider" />
      </div>

      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label class="text-xs font-semibold text-ink-600">PWM 频率</label>
          <span class="font-mono text-xs font-bold text-ink-800">{{ freqText }}</span>
        </div>
        <input v-model.number="params.freq" type="range" min="100" max="5000" step="100" class="slider" />
      </div>

      <div class="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] text-ink-600">
        V_avg = V_CC × D =
        <span class="font-bold text-amber-600">{{ VCC }} × {{ params.duty }}% = {{ vavg.toFixed(3) }} V</span>
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
  background: linear-gradient(90deg, #bed3ff, #91b5ff);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2549eb;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(37, 73, 235, 0.45);
  transition: transform 0.15s ease;
}
.slider::-webkit-slider-thumb:hover {
  transform: scale(1.12);
}
.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2549eb;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(37, 73, 235, 0.45);
}
</style>
