<script setup lang="ts">
/**
 * 交互式动画 ①：电阻分压（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 电池符号（左侧），R1 / R2 串联（右侧），中间为分压抽头 Vout
 *   - 电流粒子沿回路流动，速度与回路电流 I 成正比
 *   - 抽头电压用高亮节点 + 数值实时显示
 * 交互：
 *   - 拖动 Vin / R1 / R2 滑块，实时改变分压比与电流
 *   - 支持暂停 / 复位
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const params = reactive({ vin: 5, r1: 1000, r2: 2000 })
const playing = ref(true)

const MAX_I = 0.06 // 用于把电流映射到粒子速度（A）
const DOT_COUNT = 14

/* ---------------- 计算 ---------------- */
/** 分压公式：Vout = Vin * R2 / (R1 + R2) */
const vout = computed(() => (params.vin * params.r2) / (params.r1 + params.r2))
/** 回路电流 I = Vin / (R1 + R2)，单位 A */
const current = computed(() => params.vin / (params.r1 + params.r2))
/** 总功率 P = Vin * I */
const power = computed(() => params.vin * current.value)

const currentMa = computed(() => (current.value * 1000).toFixed(current.value >= 0.01 ? 1 : 2))
const voutText = computed(() => vout.value.toFixed(2))
const r1Text = computed(() => (params.r1 >= 1000 ? `${(params.r1 / 1000).toFixed(1)}kΩ` : `${params.r1}Ω`))
const r2Text = computed(() => (params.r2 >= 1000 ? `${(params.r2 / 1000).toFixed(1)}kΩ` : `${params.r2}Ω`))
const ratio = computed(() => (params.r2 / (params.r1 + params.r2)) * 100)

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let dots: Konva.Circle[] = []
let ro: ResizeObserver | null = null

/** 回路折线（用于粒子沿路径运动） */
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

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  wire: '#475569',
  symbol: '#0f172a',
  text: '#64748b',
  strong: '#0f172a',
  brand: '#2549eb',
  amber: '#f59e0b',
  grid: '#e2e8f0',
}

/** 生成竖直锯齿电阻的折线点 */
function zigzag(x: number, y1: number, y2: number, amp = 11, peaks = 6): number[] {
  const pts: number[] = [x, y1]
  const seg = (y2 - y1) / (peaks + 1)
  for (let i = 1; i <= peaks; i++) {
    pts.push(x + (i % 2 ? amp : -amp), y1 + seg * i)
  }
  pts.push(x, y2)
  return pts
}

/** 一截导线 */
function wire(points: number[], width = 3, color = C.wire) {
  return new Konva.Line({
    points,
    stroke: color,
    strokeWidth: width,
    lineCap: 'round',
    lineJoin: 'round',
  })
}

/** 构建整幅静态场景（尺寸或参数变化时重建） */
function buildScene() {
  if (!stage || !layer) return
  const W = stage.width()
  // 窄屏重排的瞬间，容器宽度可能被量到几十像素，
  // 此时按宽度算出的格子/绘图区会变成负数，Konva 画圆角矩形时会抛
  // IndexSizeError: radius is negative。宽度不足就先跳过绘制，
  // 等 ResizeObserver 拿到最终宽度后再重建场景。
  if (W < 300) return

  const H = 330
  const leftX = 72
  const rightX = Math.max(200, W - 168)
  const topY = 52
  const botY = 286
  const midY = (topY + botY) / 2

  const r1Top = 82
  const r1Bot = 156
  const r2Top = 186
  const r2Bot = 260

  layer.destroyChildren()

  /* --- 背景网格 --- */
  for (let x = 0; x <= W; x += 28) {
    layer.add(new Konva.Line({ points: [x, 0, x, H], stroke: C.grid, strokeWidth: 1, opacity: 0.5 }))
  }
  for (let y = 0; y <= H; y += 28) {
    layer.add(new Konva.Line({ points: [0, y, W, y], stroke: C.grid, strokeWidth: 1, opacity: 0.5 }))
  }

  /* --- 导线回路 --- */
  layer.add(wire([leftX, botY, rightX, botY])) // 底
  layer.add(wire([rightX, botY, rightX, r2Bot])) // 右下半
  layer.add(wire([rightX, r1Bot, rightX, r2Top])) // 中间节点
  layer.add(wire([rightX, r1Top, rightX, topY])) // 右上半
  layer.add(wire([rightX, topY, leftX, topY])) // 顶
  layer.add(wire([leftX, topY, leftX, 148])) // 左上，接电池正极
  layer.add(wire([leftX, 186, leftX, botY])) // 左下，接电池负极

  /* --- 电池符号 --- */
  // 正极长线
  layer.add(wire([leftX - 18, 162, leftX + 18, 162], 4, C.symbol))
  // 负极短线
  layer.add(wire([leftX - 10, 176, leftX + 10, 176], 4, C.symbol))
  // 引出线
  layer.add(wire([leftX, 148, leftX, 162], 3))
  layer.add(wire([leftX, 176, leftX, 186], 3))
  layer.add(
    new Konva.Text({
      x: leftX - 74,
      y: 148,
      width: 52,
      align: 'right',
      text: `${params.vin.toFixed(1)}V`,
      fontSize: 15,
      fontStyle: 'bold',
      fontFamily: FONT,
      fill: C.strong,
    }),
  )
  layer.add(new Konva.Text({ x: leftX - 74, y: 166, width: 52, align: 'right', text: 'V_in', fontSize: 11, fontFamily: FONT, fill: C.text }))

  /* --- R1 --- */
  layer.add(wire(zigzag(rightX, r1Top, r1Bot), 3.4, C.symbol))
  layer.add(new Konva.Text({ x: rightX + 22, y: r1Top + 8, text: 'R1', fontSize: 14, fontStyle: 'bold', fontFamily: FONT, fill: C.strong }))
  layer.add(new Konva.Text({ x: rightX + 22, y: r1Top + 26, text: r1Text.value, fontSize: 12, fontFamily: FONT, fill: C.text }))

  /* --- R2 --- */
  layer.add(wire(zigzag(rightX, r2Top, r2Bot), 3.4, C.symbol))
  layer.add(new Konva.Text({ x: rightX + 22, y: r2Top + 8, text: 'R2', fontSize: 14, fontStyle: 'bold', fontFamily: FONT, fill: C.strong }))
  layer.add(new Konva.Text({ x: rightX + 22, y: r2Top + 26, text: r2Text.value, fontSize: 12, fontFamily: FONT, fill: C.text }))

  /* --- 分压抽头 Vout --- */
  // 抽头分支线
  layer.add(wire([rightX, midY, rightX + 52, midY], 3, C.brand))
  // 节点
  layer.add(new Konva.Circle({ x: rightX, y: midY, radius: 5.5, fill: C.brand, stroke: '#fff', strokeWidth: 2 }))
  // 数值气泡
  const bubbleW = 96
  const bubble = new Konva.Group({ x: rightX + 52, y: midY - 17 })
  bubble.add(
    new Konva.Rect({
      width: bubbleW,
      height: 34,
      cornerRadius: 9,
      fill: '#eff4ff',
      stroke: '#c7d7fe',
      strokeWidth: 1,
    }),
  )
  bubble.add(
    new Konva.Text({
      x: 0,
      y: 8,
      width: bubbleW,
      align: 'center',
      text: `${voutText.value} V`,
      fontSize: 15,
      fontStyle: 'bold',
      fontFamily: FONT,
      fill: C.brand,
    }),
  )
  layer.add(bubble)
  layer.add(
    new Konva.Text({ x: rightX + 52, y: midY + 22, width: bubbleW, align: 'center', text: 'V_out', fontSize: 11, fontFamily: FONT, fill: C.text }),
  )

  /* --- 电流粒子 --- */
  dots = []
  const radius = 3.6
  for (let i = 0; i < DOT_COUNT; i++) {
    const dot = new Konva.Circle({ x: -20, y: -20, radius, fill: C.amber, opacity: 0.95 })
    // 用 group 做光晕更方便，这里用 shadow 简化
    dot.shadowColor(C.amber)
    dot.shadowBlur(6)
    dot.shadowOpacity(0.6)
    layer.add(dot)
    dots.push(dot)
  }

  /* --- 电流方向提示 --- */
  layer.add(
    new Konva.Text({
      x: leftX + 6,
      y: topY - 22,
      text: `I = ${currentMa.value} mA`,
      fontSize: 12,
      fontFamily: FONT,
      fill: C.amber,
      fontStyle: 'bold',
    }),
  )

  /* --- 粒子路径 --- */
  const path: Array<[number, number]> = [
    [leftX, 162],
    [leftX, topY],
    [rightX, topY],
    [rightX, botY],
    [leftX, botY],
    [leftX, 176],
  ]
  segs = []
  totalLen = 0
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i]
    const [x2, y2] = path[i + 1]
    const len = Math.hypot(x2 - x1, y2 - y1)
    segs.push({ x1, y1, x2, y2, len })
    totalLen += len
  }

  layer.draw()
}

/** 按路径长度取点 */
function pointAt(dist: number) {
  let d = ((dist % totalLen) + totalLen) % totalLen
  for (const s of segs) {
    if (d <= s.len) {
      const t = s.len === 0 ? 0 : d / s.len
      return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t }
    }
    d -= s.len
  }
  return { x: segs[0]?.x1 ?? 0, y: segs[0]?.y1 ?? 0 }
}

/** 粒子速度：与电流正相关，开方压缩动态范围以便低速也可见 */
function speed() {
  const norm = Math.min(1, Math.sqrt(current.value / MAX_I))
  return 22 + 210 * norm
}

function initStage() {
  if (!wrapRef.value) return
  const width = Math.max(320, wrapRef.value.clientWidth)
  stage = new Konva.Stage({ container: wrapRef.value, width, height: 330 })
  layer = new Konva.Layer()
  stage.add(layer)
  buildScene()

  let last = 0
  anim = new Konva.Animation((frame) => {
    if (!frame || !playing.value) return
    const dt = last ? (frame.time - last) / 1000 : 0
    last = frame.time
    offset += speed() * dt
    const gap = totalLen / DOT_COUNT
    for (let i = 0; i < dots.length; i++) {
      const p = pointAt(offset + i * gap)
      dots[i].position(p)
    }
  }, layer)
  anim.start()
}

/* ---------------- 生命周期 ---------------- */
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

// 参数变化时重建静态场景（电阻读数、Vout 气泡、电流值都变了）
watch(
  () => [params.vin, params.r1, params.r2],
  () => buildScene(),
)

function reset() {
  params.vin = 5
  params.r1 = 1000
  params.r2 = 2000
  offset = 0
}

function togglePlay() {
  playing.value = !playing.value
  if (anim) anim.start()
}
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-white">
          <AppIcon name="bolt" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">电阻分压 · 交互式动画</span>
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
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">V_out</div>
        <div class="mt-0.5 font-mono text-base font-bold text-brand-700">{{ voutText }} <span class="text-xs font-normal text-ink-400">V</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">回路电流 I</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ currentMa }} <span class="text-xs font-normal text-ink-400">mA</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">分压比</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ ratio.toFixed(1) }}<span class="text-xs font-normal text-ink-400">%</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">总功率 P</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ (power * 1000).toFixed(1) }} <span class="text-xs font-normal text-ink-400">mW</span></div>
      </div>
    </div>

    <!-- 控制区 -->
    <div class="space-y-4 px-4 py-4">
      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label class="text-xs font-semibold text-ink-600">输入电压 V_in</label>
          <span class="font-mono text-xs font-bold text-brand-700">{{ params.vin.toFixed(1) }} V</span>
        </div>
        <input v-model.number="params.vin" type="range" min="3" max="12" step="0.5" class="slider" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <div class="mb-1.5 flex items-baseline justify-between">
            <label class="text-xs font-semibold text-ink-600">上臂电阻 R1</label>
            <span class="font-mono text-xs font-bold text-ink-800">{{ r1Text }}</span>
          </div>
          <input v-model.number="params.r1" type="range" min="100" max="10000" step="100" class="slider" />
        </div>
        <div>
          <div class="mb-1.5 flex items-baseline justify-between">
            <label class="text-xs font-semibold text-ink-600">下臂电阻 R2</label>
            <span class="font-mono text-xs font-bold text-ink-800">{{ r2Text }}</span>
          </div>
          <input v-model.number="params.r2" type="range" min="100" max="10000" step="100" class="slider" />
        </div>
      </div>

      <div class="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] text-ink-600">
        V_out = V_in × R2 / (R1 + R2) =
        <span class="font-bold text-brand-700">{{ params.vin.toFixed(1) }} × {{ params.r2 }} / ({{ params.r1 }} + {{ params.r2 }}) = {{ voutText }} V</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 统一滑块样式（跨浏览器） */
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
