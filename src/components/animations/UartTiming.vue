<script setup lang="ts">
/**
 * 交互式动画 ⑨：UART 串口帧时序（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 一条从左到右的 8N1 帧波形（空闲 → 起始位 → D0~D7 → 停止位 → 空闲）
 *   - 每个位格标注名称与电平，当前位高亮并带虚线游标
 *   - 底部实时显示位时间、整帧时长，以及"高位在左 → 线上低位先发"的对应关系
 * 交互：
 *   - 播放 / 暂停：按节拍逐位推进
 *   - 单步 / 复位
 *   - 波特率：9600 / 115200 / 921600，位时间实时换算
 *   - 发送字节：切换几个典型值，观察数据位翻转
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const BAUDS = [9600, 115200, 921600]
const PRESETS = [
  { v: 0x41, text: "0x41 'A'" },
  { v: 0x55, text: '0x55' },
  { v: 0xa5, text: '0xA5' },
  { v: 0x00, text: '0x00' },
  { v: 0xff, text: '0xFF' },
]

const TOTAL_SLOTS = 12 // 空闲 + 起始 + 8 数据 + 停止 + 空闲
const H = 340

const playing = ref(true)
const speed = ref(1)
const slot = ref(0)
const baud = ref(115200)
const byteVal = ref(0x41)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  wave: '#0891b2',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
  panel: '#f8fafc',
}

/* ---------------- 派生量 ---------------- */
const bitUs = computed(() => 1e6 / baud.value)
const frameUs = computed(() => bitUs.value * 10)
const hex = computed(() => '0x' + byteVal.value.toString(16).toUpperCase().padStart(2, '0'))
const bin = computed(() => byteVal.value.toString(2).padStart(8, '0'))
const lsbFirst = computed(() => bin.value.split('').reverse().join(' '))

/** 第 i 个位格的电平：0 空闲，1 起始，2~9 数据，10 停止，11 空闲 */
function levelOf(i: number): 0 | 1 {
  if (i === 0) return 1
  if (i === 1) return 0
  if (i >= 2 && i <= 9) return ((byteVal.value >> (i - 2)) & 1) === 1 ? 1 : 0
  return 1
}

function labelOf(i: number): string {
  if (i === 0) return '空闲'
  if (i === 1) return '起始'
  if (i >= 2 && i <= 9) return 'D' + (i - 2)
  if (i === 10) return '停止'
  return '空闲'
}

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

let lastStep = 0
let acc = 0

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()

  const w = S.width()
  // 窄屏重排瞬间宽度塌缩时跳过，等 ResizeObserver 拿到最终宽度
  if (w < 260) {
    L.draw()
    return
  }

  const wx0 = 46
  const wx1 = w - 14
  const yHigh = 92
  const yLow = 152
  const slotW = (wx1 - wx0) / TOTAL_SLOTS

  /* 标题 */
  L.add(
    new Konva.Text({
      x: 16,
      y: 14,
      text: 'UART 8N1 一帧时序（低位先发）',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* 电平参考线 */
  const levels: Array<[number, string]> = [
    [yHigh, '3.3V'],
    [yLow, '0V'],
  ]
  for (const [y, txt] of levels) {
    L.add(
      new Konva.Line({
        points: [wx0 - 6, y, wx1, y],
        stroke: C.grid,
        strokeWidth: 1,
        dash: [3, 4],
      }),
    )
    L.add(
      new Konva.Text({ x: 8, y: y - 6, text: txt, fontSize: 9.5, fontFamily: FONT, fill: C.dim }),
    )
  }

  /* 位格：高亮、分隔线、名称、电平数字 */
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const sx = wx0 + i * slotW
    const active = i === slot.value
    if (active) {
      L.add(
        new Konva.Rect({
          x: sx + 1,
          y: yHigh - 22,
          width: slotW - 2,
          height: yLow - yHigh + 48,
          fill: 'rgba(8,145,178,0.07)',
          stroke: C.wave,
          strokeWidth: 1,
          dash: [3, 3],
          cornerRadius: 5,
        }),
      )
    }
    if (i > 0) {
      L.add(
        new Konva.Line({
          points: [sx, yHigh - 6, sx, yLow + 20],
          stroke: C.gridStrong,
          strokeWidth: 1,
          dash: [2, 3],
        }),
      )
    }
    L.add(
      new Konva.Text({
        x: sx,
        y: yLow + 24,
        width: slotW,
        align: 'center',
        text: labelOf(i),
        fontSize: slotW < 30 ? 7.5 : 9,
        fontFamily: FONT,
        fill: active ? C.wave : C.text,
        fontStyle: active ? 'bold' : 'normal',
      }),
    )
    const lv = levelOf(i)
    L.add(
      new Konva.Text({
        x: sx,
        y: (lv === 1 ? yHigh : yLow) - 15,
        width: slotW,
        align: 'center',
        text: String(lv),
        fontSize: 9,
        fontFamily: FONT,
        fill: active ? C.wave : C.dim,
      }),
    )
  }

  /* 波形（阶梯线） */
  const pts: number[] = []
  let curY = levelOf(0) === 1 ? yHigh : yLow
  pts.push(wx0, curY)
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const lv = levelOf(i)
    const ny = lv === 1 ? yHigh : yLow
    const sx = wx0 + i * slotW
    const ex = sx + slotW
    if (ny !== curY) {
      pts.push(sx, curY, sx, ny)
      curY = ny
    }
    pts.push(ex, curY)
  }
  L.add(
    new Konva.Line({
      points: pts,
      stroke: C.wave,
      strokeWidth: 2.5,
      lineJoin: 'round',
      lineCap: 'round',
    }),
  )

  /* 当前位游标 */
  const phX = wx0 + slot.value * slotW + slotW / 2
  L.add(
    new Konva.Line({
      points: [phX, yHigh - 26, phX, yLow + 20],
      stroke: C.strong,
      strokeWidth: 1.5,
      dash: [3, 3],
    }),
  )

  /* 底部信息面板 */
  const by = 204
  L.add(
    new Konva.Rect({
      x: 14,
      y: by,
      width: w - 28,
      height: 100,
      fill: C.panel,
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 8,
    }),
  )
  L.add(
    new Konva.Text({
      x: 26,
      y: by + 12,
      width: w - 52,
      text: `1 位 = ${bitUs.value.toFixed(2)} µs ｜ 整帧 10 位 ≈ ${frameUs.value.toFixed(1)} µs`,
      fontSize: 10.5,
      fontFamily: FONT,
      fill: C.strong,
    }),
  )
  const compact = w < 430
  const line2 = compact
    ? `${hex.value} → ${bin.value} → 线上 ${lsbFirst.value}`
    : `${hex.value} = ${bin.value}（高位在左）→ 线上：${lsbFirst.value}`
  L.add(
    new Konva.Text({
      x: 26,
      y: by + 40,
      width: w - 52,
      text: line2,
      fontSize: 10.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  L.add(
    new Konva.Text({
      x: 26,
      y: by + 68,
      width: w - 52,
      text: `当前：${labelOf(slot.value)} = ${levelOf(slot.value)}`,
      fontSize: 10.5,
      fontFamily: FONT,
      fill: C.wave,
      fontStyle: 'bold',
    }),
  )

  L.draw()
}

function draw() {
  buildScene()
}

/* ---------------- 交互 ---------------- */
function step() {
  slot.value = (slot.value + 1) % TOTAL_SLOTS
  draw()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) lastStep = 0
}

function reset() {
  slot.value = 0
  lastStep = 0
  acc = 0
  draw()
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
    if (!playing.value) {
      lastStep = frame.time
      return
    }
    const interval = 640 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    while (acc >= interval) {
      acc -= interval
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

watch([baud, byteVal], () => {
  draw()
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-cyan-600 text-white">
          <AppIcon name="code" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">UART 串口帧时序 · 交互式动画</span>
        <span class="tag bg-cyan-50 text-cyan-700">Konva</span>
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

    <!-- 参数条 -->
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-2 text-[11px]"
    >
      <div class="flex items-center gap-1.5">
        <span class="text-ink-400">波特率</span>
        <button
          v-for="b in BAUDS"
          :key="b"
          class="rounded px-1.5 py-0.5 font-mono font-bold transition-colors"
          :class="baud === b ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="baud = b"
        >
          {{ b }}
        </button>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-ink-400">发送字节</span>
        <button
          v-for="p in PRESETS"
          :key="p.v"
          class="rounded px-1.5 py-0.5 font-mono font-bold transition-colors"
          :class="byteVal === p.v ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="byteVal = p.v"
        >
          {{ p.text }}
        </button>
      </div>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">位时间</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ bitUs.toFixed(2) }} <span class="text-xs font-normal text-ink-400">µs</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">整帧时长</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ frameUs.toFixed(1) }} <span class="text-xs font-normal text-ink-400">µs</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前位</div>
        <div class="mt-0.5 font-mono text-base font-bold text-cyan-600">
          {{ labelOf(slot) }} = {{ levelOf(slot) }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">速度</div>
        <div class="mt-0.5 flex gap-1">
          <button
            v-for="s in [1, 2, 4]"
            :key="s"
            class="rounded px-1.5 py-0.5 text-xs font-bold transition-colors"
            :class="speed === s ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
            @click="speed = s"
          >
            {{ s }}x
          </button>
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        UART 没有时钟线，靠双方约定波特率对齐。一帧 = <b class="text-ink-700">1 起始位（低）+ 8 数据位 + 1 停止位（高）</b>，
        数据位<b class="text-cyan-700">低位先发</b>——所以显示为 <span class="font-mono">0x41</span> 时，
        线上顺序是 <span class="font-mono">1 0 0 0 0 0 1 0</span>。
      </p>
      <p class="text-ink-400">
        提示：切换波特率看位时间怎么变（115200 下约 8.68µs），切换发送字节看数据位逐位翻转；点「单步」可以一位一位对齐着看。
      </p>
    </div>
  </div>
</template>
