<script setup lang="ts">
/**
 * 交互式动画 ④：ADC 采样与量化（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 蓝色正弦曲线 = 连续的模拟信号
 *   - 蓝色圆点    = 采样瞬间的电压（离散化）
 *   - 橙色阶梯    = 量化后的数字值（0 阶保持）
 *   - 灰色细竖线  = 量化误差（采样值与量化值之差）
 *   - 竖直游标    = 当前时刻，实时显示模拟电压与对应的数字码
 * 交互：
 *   - 拖动峰值电压，改变信号幅度
 *   - 拖动分辨率（4~12 位），观察阶梯变粗变细、LSB 变化
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const VREF = 3.3
/* 默认 6 位：STM32 实际为 12 位，但 12 位下阶梯几乎贴合曲线，看不出量化过程 */
const params = reactive({ vpeak: 3.0, bits: 6 })
const playing = ref(true)

/** 1 个 LSB 对应的电压 */
const lsb = computed(() => VREF / Math.pow(2, params.bits))
/** 满量程码值 */
const maxCode = computed(() => Math.pow(2, params.bits) - 1)

/** 当前时刻的采样值（由动画帧更新，供面板显示） */
const cursorV = ref(0)
const cursorCode = ref(0)

const lsbText = computed(() =>
  lsb.value >= 0.001 ? `${lsb.value.toFixed(4)} V` : `${(lsb.value * 1000).toFixed(2)} mV`,
)

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let cursor: Konva.Line | null = null
let cursorDot: Konva.Circle | null = null
let cursorLabel: Konva.Text | null = null
let ro: ResizeObserver | null = null

const H = 260
const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  analog: '#2549eb',
  sample: '#1d4ed8',
  quant: '#f59e0b',
  err: '#94a3b8',
  axis: '#94a3b8',
  text: '#64748b',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  cursor: '#0f172a',
}

let plot = { x0: 0, x1: 0, yTop: 0, yBot: 0 }
/** 采样间隔（像素） */
const SAMPLE_STEP = 34
let cursorPos = 0

function yOf(v: number): number {
  const r = Math.max(0, Math.min(1, v / VREF))
  return plot.yBot - r * (plot.yBot - plot.yTop)
}

/** 模拟信号：2 个完整周期，幅度由 vpeak 决定，垂直居中于 VREF/2 */
function analogAt(x: number): number {
  const { x0, x1 } = plot
  const period = (x1 - x0) / 2
  const ph = ((x - x0) / period) * Math.PI * 2
  const offset = (VREF - params.vpeak) / 2
  return offset + params.vpeak * (Math.sin(ph - Math.PI / 2) * 0.5 + 0.5)
}

/** 量化：最接近的 LSB 整数倍（四舍五入，即理想 ADC 的量化行为） */
function quantize(v: number): { volt: number; code: number } {
  const raw = Math.round(v / lsb.value)
  const code = Math.max(0, Math.min(maxCode.value, raw))
  return { volt: code * lsb.value, code }
}

function buildScene() {
  if (!stage || !layer) return
  layer.destroyChildren()
  cursor = null
  cursorDot = null
  cursorLabel = null

  const w = stage.width()
  // 窄屏重排的瞬间，容器宽度可能被量到几十像素，
  // 此时按宽度算出的格子/绘图区会变成负数，Konva 画圆角矩形时会抛
  // IndexSizeError: radius is negative。宽度不足就先跳过绘制，
  // 等 ResizeObserver 拿到最终宽度后再重建场景。
  if (w < 200) return

  const padL = 46
  const padR = 16
  plot = { x0: padL, x1: w - padR, yTop: 26, yBot: H - 42 }
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

  /* 水平网格 + Y 轴刻度 */
  for (const kv of [0, 0.25, 0.5, 0.75, 1]) {
    const v = VREF * kv
    const y = yOf(v)
    layer.add(
      new Konva.Line({
        points: [x0, y, x1, y],
        stroke: kv === 0 ? C.axis : C.grid,
        strokeWidth: 1,
        dash: kv === 0 ? [] : [3, 4],
      }),
    )
    if (kv === 0 || kv === 0.5 || kv === 1) {
      layer.add(
        new Konva.Text({
          x: 6,
          y: y - 7,
          width: padL - 12,
          align: 'right',
          text: v.toFixed(1),
          fontSize: 10.5,
          fontFamily: FONT,
          fill: C.text,
        }),
      )
    }
  }
  layer.add(
    new Konva.Text({ x: 6, y: yTop - 17, text: 'V', fontSize: 10, fontFamily: FONT, fill: C.axis }),
  )

  /* 模拟信号曲线（逐像素采样绘图） */
  const analogPts: number[] = []
  for (let x = x0; x <= x1; x += 1.5) {
    analogPts.push(x, yOf(analogAt(x)))
  }
  layer.add(
    new Konva.Line({
      points: analogPts,
      stroke: C.analog,
      strokeWidth: 2,
      lineJoin: 'round',
      opacity: 0.85,
    }),
  )
  layer.add(
    new Konva.Text({
      x: x0 + 8,
      y: yTop + 6,
      text: '模拟信号',
      fontSize: 10,
      fontFamily: FONT,
      fontStyle: 'bold',
      fill: C.analog,
    }),
  )

  /* 采样点与量化阶梯 */
  const samples: Array<{ x: number; v: number; qv: number; code: number }> = []
  for (let x = x0 + SAMPLE_STEP / 2; x < x1; x += SAMPLE_STEP) {
    const v = analogAt(x)
    const q = quantize(v)
    samples.push({ x, v, qv: q.volt, code: q.code })
  }

  /* 量化阶梯（0 阶保持：每个采样值保持到下一个采样点） */
  if (samples.length > 1) {
    const stepPts: number[] = []
    stepPts.push(samples[0].x, yOf(samples[0].qv))
    for (let i = 1; i < samples.length; i++) {
      stepPts.push(samples[i].x, yOf(samples[i - 1].qv)) // 水平保持
      stepPts.push(samples[i].x, yOf(samples[i].qv)) // 垂直跳变
    }
    stepPts.push(Math.min(x1 - 1, samples[samples.length - 1].x + SAMPLE_STEP), yOf(samples[samples.length - 1].qv))
    layer.add(
      new Konva.Line({
        points: stepPts,
        stroke: C.quant,
        strokeWidth: 2,
        lineJoin: 'miter',
        lineCap: 'butt',
      }),
    )
  }

  /* 量化误差：采样值与量化值之间的细竖线 */
  for (const s of samples) {
    const y1 = yOf(s.v)
    const y2 = yOf(s.qv)
    if (Math.abs(y1 - y2) < 0.6) continue
    layer.add(
      new Konva.Line({ points: [s.x, y1, s.x, y2], stroke: C.err, strokeWidth: 2 }),
    )
  }

  /* 采样点 */
  for (const s of samples) {
    layer.add(
      new Konva.Circle({ x: s.x, y: yOf(s.v), radius: 3.2, fill: C.sample, stroke: '#fff', strokeWidth: 1 }),
    )
  }

  /* 图例 */
  const legendY = yBot + 14
  const legend: Array<[string, string]> = [
    ['模拟信号', C.analog],
    ['采样点', C.sample],
    ['量化输出', C.quant],
  ]
  let lx = x0
  for (const [label, color] of legend) {
    layer.add(new Konva.Circle({ x: lx + 3, y: legendY, radius: 3, fill: color }))
    layer.add(
      new Konva.Text({ x: lx + 11, y: legendY - 6, text: label, fontSize: 10, fontFamily: FONT, fill: C.text }),
    )
    lx += label.length * 11 + 22
  }

  /* 游标（动态） */
  cursor = new Konva.Line({
    points: [x0, yTop, x0, yBot],
    stroke: C.cursor,
    strokeWidth: 1,
    dash: [4, 4],
    opacity: 0.45,
  })
  layer.add(cursor)

  cursorDot = new Konva.Circle({ x: x0, y: yBot, radius: 4.5, fill: C.cursor, stroke: '#fff', strokeWidth: 1.5 })
  layer.add(cursorDot)

  cursorLabel = new Konva.Text({
    x: x0 + 6,
    y: yTop - 17,
    text: '',
    fontSize: 10.5,
    fontFamily: FONT,
    fill: C.cursor,
  })
  layer.add(cursorLabel)

  layer.draw()
  updateCursor()
}

/** 更新游标位置与读数 */
function updateCursor() {
  if (!cursor || !cursorDot || !cursorLabel) return
  const x = plot.x0 + cursorPos
  const v = analogAt(x)
  const q = quantize(v)
  cursor.points([x, plot.yTop, x, plot.yBot])
  cursorDot.x(x)
  cursorDot.y(yOf(v))
  cursorLabel.x(Math.min(x + 6, plot.x1 - 110))
  cursorLabel.text(`${v.toFixed(3)} V  →  ${q.code}`)
  cursorV.value = v
  cursorCode.value = q.code
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) anim?.start()
  else anim?.stop()
}

function reset() {
  params.vpeak = 3.0
  params.bits = 6
  cursorPos = 0
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

  let lastT = 0
  anim = new Konva.Animation((frame) => {
    if (!frame) return
    const dt = lastT ? (frame.time - lastT) / 1000 : 0
    lastT = frame.time
    const span = plot.x1 - plot.x0
    if (span > 0) {
      cursorPos = (cursorPos + dt * 90) % span
      updateCursor()
    }
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

watch(
  () => [params.vpeak, params.bits],
  () => buildScene(),
)
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-white">
          <AppIcon name="chart" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">ADC 采样量化 · 交互式动画</span>
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
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">信号峰值</div>
        <div class="mt-0.5 font-mono text-base font-bold text-brand-700">
          {{ params.vpeak.toFixed(1) }} <span class="text-xs font-normal text-ink-400">V</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">分辨率</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ params.bits }} <span class="text-xs font-normal text-ink-400">bit / {{ maxCode + 1 }} 级</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">1 LSB</div>
        <div class="mt-0.5 font-mono text-base font-bold text-amber-600">{{ lsbText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">游标读数</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ cursorV.toFixed(2) }}<span class="text-xs font-normal text-ink-400">V → </span>
          <span class="text-brand-700">{{ cursorCode }}</span>
        </div>
      </div>
    </div>

    <!-- 控制区 -->
    <div class="space-y-4 px-4 py-4">
      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label class="text-xs font-semibold text-ink-600">信号峰值（须 ≤ V_ref）</label>
          <span class="font-mono text-xs font-bold text-brand-700">{{ params.vpeak.toFixed(1) }} V</span>
        </div>
        <input v-model.number="params.vpeak" type="range" min="0.5" max="3.3" step="0.1" class="slider" />
      </div>

      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label class="text-xs font-semibold text-ink-600">ADC 分辨率</label>
          <span class="font-mono text-xs font-bold text-ink-800">{{ params.bits }} 位</span>
        </div>
        <input v-model.number="params.bits" type="range" min="4" max="12" step="1" class="slider" />
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-400">
          默认 6 位是为了让量化阶梯看得清。STM32F1 的 ADC 实际为 12 位，拖到 12 位会看到阶梯几乎贴合曲线——这正说明高分辨率下量化误差极小。
        </p>
      </div>

      <div class="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] text-ink-600">
        1 LSB = V_ref / 2^bits =
        <span class="font-bold text-amber-600">{{ VREF }} / {{ Math.pow(2, params.bits) }} = {{ lsbText }}</span>
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
