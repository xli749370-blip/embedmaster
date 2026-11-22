<script setup lang="ts">
/**
 * 交互式动画 ⑬：DMA 数据搬运（Konva）
 * ------------------------------------------------------------------
 * 场景：ADC1 连续转换，每完成一次就向 DMA 发请求，DMA 把 DR 里的
 *       12 位结果搬进内存数组 buf[]，全程 CPU 不参与。
 * 画布内容：
 *   - 左上：ADC1 外设卡（DR 实时值、转换完成请求）
 *   - 右上：DMA1 控制器卡（CPAR / CMAR / CNDTR / EN）
 *   - 下方：内存数组 buf[0..7] 八格，被搬运的格子填值并高亮
 *   - 一条流动虚线表示「外设 → 内存」的通道，EN=0 时变灰静止
 *   - 底部 CNDTR 进度条，直观看到剩余计数递减
 * 交互：
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 *   - Normal / Circular 模式切换：验证「搬完一轮后会不会自己停下来」
 * 设计要点：
 *   - Circular 模式下 CNDTR 自动重装、CMAR 回到 buf[0]，永远不停
 *   - Normal 模式下 CNDTR 归零、EN 自动清零、DMA 停住（buf 里永远是旧值）
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 常量 ---------------- */
const N = 8 // 数组长度
const H = 254

const playing = ref(true)
const speed = ref(1)
const circular = ref(true)
const writeIdx = ref(0)
const remaining = ref(N)
const transfers = ref(0)
const finished = ref(false)
const lastVal = ref(0)
const lastIdx = ref(-1)

/** 数据缓冲区（非响应式，绘制统一走 buildScene） */
let buf: number[] = new Array(N).fill(0)
let filled: boolean[] = new Array(N).fill(false)
let flashIdx = -1

const modeText = computed(() => (circular.value ? 'Circular' : 'Normal'))

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  adc: '#0891b2',
  dma: '#7c3aed',
  mem: '#2563eb',
  hi: '#dc2626',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
  panel: '#f8fafc',
}

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null
let flowLine: Konva.Line | null = null

let lastStep = 0
let acc = 0

/* ---------------- 采样值（可复现的伪随机模拟量） ---------------- */
function sampleValue(t: number): number {
  const base = 2048 + 900 * Math.sin(t * 0.55)
  const noise = (((t * 137) % 41) - 20) * 1.5
  return Math.max(0, Math.min(4095, Math.round(base + noise)))
}

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()
  flowLine = null

  const w = S.width()
  // 窄屏重排瞬间宽度塌缩时跳过，等 ResizeObserver 拿到最终宽度
  if (!w || w < 40) {
    L.draw()
    return
  }

  const x0 = 14
  const x1 = w - 14
  const gap = 10
  const cardW = (x1 - x0 - gap) / 2
  const cardY = 36
  const cardH = 72
  const compact = w < 430

  /* 标题 */
  L.add(
    new Konva.Text({
      x: 16,
      y: 10,
      text: 'DMA 搬运：外设 → 内存，CPU 全程不参与',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- ADC 外设卡 ---------- */
  L.add(
    new Konva.Rect({
      x: x0,
      y: cardY,
      width: cardW,
      height: cardH,
      fill: '#ecfeff',
      stroke: '#a5f3fc',
      strokeWidth: 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: cardY + 7,
      text: 'ADC1',
      fontSize: 10,
      fontFamily: FONT,
      fill: C.adc,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: cardY + 23,
      text: compact ? `DR = ${lastVal.value}` : `DR = ${lastVal.value}（12 位）`,
      fontSize: 10,
      fontFamily: FONT,
      fill: C.strong,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: cardY + 43,
      text: compact ? 'EOC → 请求 DMA' : 'EOC 置位 → 向 DMA 发请求',
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- DMA 控制器卡 ---------- */
  const dx = x0 + cardW + gap
  L.add(
    new Konva.Rect({
      x: dx,
      y: cardY,
      width: cardW,
      height: cardH,
      fill: '#f5f3ff',
      stroke: '#ddd6fe',
      strokeWidth: 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Text({
      x: dx + 9,
      y: cardY + 7,
      text: `DMA1 · ${modeText.value}`,
      fontSize: 10,
      fontFamily: FONT,
      fill: C.dma,
      fontStyle: 'bold',
    }),
  )
  const enOn = !finished.value
  const rows: Array<[string, string]> = [
    ['CPAR', '→ ADC->DR'],
    ['CMAR', `→ buf[${Math.min(writeIdx.value, N - 1)}]`],
    ['CNDTR', String(remaining.value)],
    ['EN', enOn ? '1 运行' : '0 停止'],
  ]
  rows.forEach(([k, v], i) => {
    const ry = cardY + 23 + i * 10.5
    L.add(
      new Konva.Text({
        x: dx + 9,
        y: ry,
        text: k,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
    L.add(
      new Konva.Text({
        x: dx + 46,
        y: ry,
        text: v,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: k === 'EN' ? (enOn ? '#059669' : C.hi) : C.strong,
        fontStyle: k === 'CNDTR' || k === 'EN' ? 'bold' : 'normal',
      }),
    )
  })

  /* ---------- 内存数组 ---------- */
  const my = 148
  const cellH = 40
  const gw = (x1 - x0) / N
  // 数据包流向「刚被写入」的格子；CMAR 寄存器显示的仍是下一个待写地址
  const flowIdx = flashIdx >= 0 ? flashIdx : Math.min(writeIdx.value, N - 1)
  const targetX = x0 + flowIdx * gw + gw / 2

  /* 版面分三层：标题在上、格子居中、下标在下，互不同行 */
  L.add(
    new Konva.Text({
      x: x0,
      y: my - 22,
      text: '内存 buf[0..7]',
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
      fontStyle: 'bold',
    }),
  )

  for (let i = 0; i < N; i++) {
    const gx = x0 + i * gw
    const isCur = i === flashIdx && !finished.value
    L.add(
      new Konva.Rect({
        x: gx + 1,
        y: my,
        width: gw - 2,
        height: cellH,
        fill: filled[i] ? '#eff6ff' : '#fbfcfe',
        stroke: isCur ? C.hi : C.gridStrong,
        strokeWidth: isCur ? 1.8 : 1,
        cornerRadius: 4,
      }),
    )
    // 值垂直居中
    L.add(
      new Konva.Text({
        x: gx + 1,
        y: my + 14,
        width: gw - 2,
        align: 'center',
        text: filled[i] ? String(buf[i]) : '—',
        fontSize: 8.5,
        fontFamily: FONT,
        fill: filled[i] ? C.strong : C.dim,
        fontStyle: filled[i] ? 'bold' : 'normal',
      }),
    )
    // 下标放在格子下方
    L.add(
      new Konva.Text({
        x: gx + 1,
        y: my + cellH + 2,
        width: gw - 2,
        align: 'center',
        text: String(i),
        fontSize: 7,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
  }

  /* ---------- 搬运通道（流动虚线） ---------- */
  const ax = x0 + cardW / 2
  const pathY = 118
  flowLine = new Konva.Line({
    points: [ax, cardY + cardH, ax, pathY, targetX, pathY, targetX, my],
    stroke: enOn ? C.dma : C.dim,
    strokeWidth: 1.6,
    dash: [6, 5],
    lineJoin: 'round',
  })
  L.add(flowLine)

  /* ---------- CNDTR 进度条 ---------- */
  const by = 206
  const bw = x1 - x0
  const ratio = remaining.value / N
  L.add(
    new Konva.Rect({
      x: x0,
      y: by,
      width: bw,
      height: 8,
      fill: '#f1f5f9',
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 4,
    }),
  )
  if (ratio > 0.01) {
    L.add(
      new Konva.Rect({
        x: x0 + 1,
        y: by + 1,
        width: Math.max(3, (bw - 2) * ratio),
        height: 6,
        fill: C.dma,
        cornerRadius: 3,
      }),
    )
  }
  L.add(
    new Konva.Text({
      x: x0,
      y: by + 12,
      text: compact
        ? `CNDTR ${remaining.value} / ${N}`
        : `CNDTR 剩余 ${remaining.value} / ${N}（每搬 1 次自动递减）`,
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 状态栏 ---------- */
  const sy = 232
  let status: string
  let sColor: string
  if (finished.value) {
    status = '传输完成：TC 置位、EN 自动清零 → DMA 停住，buf 里将一直是旧值'
    sColor = C.hi
  } else if (transfers.value === 0) {
    status = '已使能：等 ADC 第一次转换完成就自动搬运'
    sColor = C.dma
  } else {
    status = `第 ${transfers.value} 次：ADC->DR → buf[${lastIdx.value}]，CNDTR ${remaining.value + 1} → ${remaining.value}`
    sColor = C.dma
  }
  L.add(
    new Konva.Text({
      x: x0,
      y: sy,
      width: x1 - x0,
      text: status,
      fontSize: 9.5,
      lineHeight: 1.3,
      fontFamily: FONT,
      fill: sColor,
      fontStyle: finished.value ? 'bold' : 'normal',
    }),
  )

  L.draw()
}

function draw() {
  buildScene()
}

/* ---------------- 交互 ---------------- */
function step() {
  if (finished.value) return

  const v = sampleValue(transfers.value)
  const i = writeIdx.value
  buf[i] = v
  filled[i] = true
  lastVal.value = v
  lastIdx.value = i
  flashIdx = i
  transfers.value++
  remaining.value--

  const next = i + 1
  if (next >= N) {
    if (circular.value) {
      // 循环模式：重装计数、指针回到数组头
      writeIdx.value = 0
      remaining.value = N
    } else {
      // 普通模式：搬满一轮停机
      writeIdx.value = N - 1
      finished.value = true
    }
  } else {
    writeIdx.value = next
  }
  draw()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    lastStep = 0
    acc = 0
  }
}

function reset() {
  buf = new Array(N).fill(0)
  filled = new Array(N).fill(false)
  flashIdx = -1
  writeIdx.value = 0
  remaining.value = N
  transfers.value = 0
  finished.value = false
  lastVal.value = 0
  lastIdx.value = -1
  lastStep = 0
  acc = 0
  draw()
}

function setMode(c: boolean) {
  if (circular.value === c) return
  circular.value = c
  reset()
}

/* ---------------- 生命周期 ---------------- */
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
    // 通道流动感：只改 dashOffset，不重建场景
    if (flowLine) {
      flowLine.dashOffset(-(frame.time * 0.045) % 22)
      layer?.batchDraw()
    }
    if (!playing.value) {
      lastStep = frame.time
      return
    }
    const interval = 620 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    // 挂起恢复时 frame.time 会跳很大，封顶避免单帧同步重绘几百次
    if (acc > interval * 3) acc = interval * 3
    let guard = 0
    while (acc >= interval && guard < 3) {
      acc -= interval
      guard++
      step()
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
  () => speed.value,
  () => {
    lastStep = 0
    acc = 0
  },
)
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-violet-600 text-white">
          <AppIcon name="layers" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">DMA 数据搬运 · 交互式动画</span>
        <span class="tag bg-violet-50 text-violet-700">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-ghost btn-sm" @click="togglePlay">
          <AppIcon :name="playing ? 'clock' : 'play'" :size="13" />
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button class="btn-ghost btn-sm" @click="step">
          <AppIcon name="chevron-right" :size="13" />
          单步
        </button>
        <button class="btn-ghost btn-sm" @click="reset">
          <AppIcon name="refresh" :size="13" />
          复位
        </button>
      </div>
    </div>

    <!-- 模式切换条 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2">
      <span class="text-[11px] text-ink-400">DMA 模式</span>
      <button
        v-for="m in [
          { c: true, t: 'Circular 循环' },
          { c: false, t: 'Normal 单次' },
        ]"
        :key="String(m.c)"
        class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
        :class="circular === m.c ? 'bg-violet-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
        @click="setMode(m.c)"
      >
        {{ m.t }}
      </button>
      <span class="text-[11px] text-ink-400">
        当前：<b class="font-mono text-violet-700">{{ modeText }}</b>
        　已搬 {{ transfers }} 次
      </span>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">DR 当前值</div>
        <div class="mt-0.5 font-mono text-base font-bold text-cyan-700">{{ lastVal }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">CNDTR</div>
        <div class="mt-0.5 font-mono text-base font-bold text-violet-700">
          {{ remaining }} <span class="text-xs font-normal text-ink-400">/ {{ N }}</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">搬运次数</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ transfers }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">EN 使能</div>
        <div class="mt-0.5 font-mono text-base font-bold" :class="finished ? 'text-rose-600' : 'text-emerald-600'">
          {{ finished ? '0 停止' : '1 运行' }}
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        DMA 是<b class="text-ink-700">独立于 CPU 的数据通道</b>：外设准备好数据就发请求，DMA 控制器用
        CPAR（外设地址）、CMAR（内存地址）、CNDTR（还剩多少）三个寄存器自己完成搬运，CPU 只管用结果。
      </p>
      <p class="text-ink-400">
        提示：切到 <b>Normal</b> 模式看搬完 8 次之后 EN 归零、CNDTR 停在 0，数组不再更新——
        这就是「ADC 循环模式下忘了把 DMA 设成 Circular，读数永远不变」的现场。
      </p>
    </div>
  </div>
</template>
