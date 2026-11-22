<script setup lang="ts">
/**
 * 交互式动画 ⑩：I²C / SPI 总线时序（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - I²C 模式：SCL 方波 + SDA 阶梯线，标注 START / 地址 / R/W / ACK / 数据 / ACK / STOP
 *   - SPI 模式：CS 低有效 + SCK 时钟 + MOSI 数据（模式 0，上升沿采样）
 *   - 当前时钟节拍高亮，游标竖线贯穿两条信号线
 * 交互：
 *   - I²C / SPI 切换
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
type Mode = 'i2c' | 'spi'
type Seg = { u0: number; u1: number; lv: 0 | 1 }

const ADDR = 0x3c // 7 位地址，例如 SSD1306 OLED
const DATA = 0xa5 // 传送的数据字节
const H = 360

const playing = ref(true)
const speed = ref(1)
const mode = ref<Mode>('i2c')
const beat = ref(0) // 当前时钟节拍
const MODES: Array<{ k: Mode; t: string }> = [
  { k: 'i2c', t: 'I²C' },
  { k: 'spi', t: 'SPI' },
]

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  scl: '#6d28d9',
  sda: '#0891b2',
  cs: '#d97706',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
  panel: '#f8fafc',
}

/* ---------------- 派生量 ---------------- */
const N = computed(() => (mode.value === 'i2c' ? 18 : 8))

/** I²C SDA 上第 i 个时钟对应的位（地址 7 位 + R/W + ACK + 数据 8 位 + ACK） */
function i2cBit(i: number): 0 | 1 {
  if (i < 7) return ((ADDR >> (6 - i)) & 1) === 1 ? 1 : 0
  if (i === 7) return 0 // R/W = 0，写
  if (i === 8) return 0 // ACK，从机拉低
  if (i >= 9 && i <= 16) return ((DATA >> (16 - i)) & 1) === 1 ? 1 : 0
  return 0 // 最后一个 ACK
}

/** SPI MOSI 上第 i 个时钟对应的位（MSB 先发） */
function spiBit(i: number): 0 | 1 {
  return ((DATA >> (7 - i)) & 1) === 1 ? 1 : 0
}

function phaseOf(i: number): string {
  if (mode.value === 'spi') return `MOSI D${7 - i}`
  if (i < 7) return `地址 A${6 - i}`
  if (i === 7) return 'R/W = 0（写）'
  if (i === 8) return 'ACK（从机拉低）'
  if (i <= 16) return `数据 D${16 - i}`
  return 'ACK（从机拉低）'
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
  // 窄屏重排瞬间宽度塌缩时跳过
  if (w < 280) {
    L.draw()
    return
  }

  const wx0 = 58
  const wx1 = w - 14
  const n = N.value
  const pre = 0.7
  const post = 0.7
  const totalUnits = pre + n + post
  const unitW = (wx1 - wx0) / totalUnits

  /* 阶梯线绘制 */
  const drawStair = (segs: Seg[], yH: number, yL: number, color: string) => {
    const pts: number[] = []
    let prevY: number | null = null
    for (const s of segs) {
      const y = s.lv === 1 ? yH : yL
      const xa = wx0 + s.u0 * unitW
      const xb = wx0 + s.u1 * unitW
      if (prevY === null) pts.push(xa, y)
      else if (prevY !== y) pts.push(xa, prevY, xa, y)
      pts.push(xb, y)
      prevY = y
    }
    L.add(
      new Konva.Line({
        points: pts,
        stroke: color,
        strokeWidth: 2.4,
        lineJoin: 'round',
        lineCap: 'round',
      }),
    )
  }

  const label = (x: number, y: number, text: string, color: string, size = 9.5) =>
    L.add(new Konva.Text({ x, y, text, fontSize: size, fontFamily: FONT, fill: color }))

  /* 标题 */
  L.add(
    new Konva.Text({
      x: 16,
      y: 12,
      text: mode.value === 'i2c' ? 'I²C 写操作时序（地址 0x3C + 数据 0xA5）' : 'SPI 模式 0 时序（MOSI 发 0xA5，CS 低有效）',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* 当前节拍高亮带 */
  const hlX = wx0 + (pre + beat.value) * unitW
  L.add(
    new Konva.Rect({
      x: hlX,
      y: 26,
      width: unitW,
      height: mode.value === 'i2c' ? 180 : 200,
      fill: 'rgba(109,40,217,0.07)',
      stroke: C.scl,
      strokeWidth: 1,
      dash: [3, 3],
      cornerRadius: 4,
    }),
  )

  if (mode.value === 'i2c') {
    /* ---- SCL ---- */
    const sclSegs: Seg[] = [{ u0: 0, u1: pre, lv: 1 }]
    for (let i = 0; i < n; i++) {
      sclSegs.push({ u0: pre + i, u1: pre + i + 0.5, lv: 0 })
      sclSegs.push({ u0: pre + i + 0.5, u1: pre + i + 1, lv: 1 })
    }
    sclSegs.push({ u0: pre + n, u1: totalUnits, lv: 1 })
    drawStair(sclSegs, 76, 118, C.scl)
    label(8, 70, 'SCL', C.scl, 10.5)

    /* ---- SDA ---- */
    const startU = pre * 0.72
    const sdaSegs: Seg[] = [{ u0: 0, u1: startU, lv: 1 }]
    sdaSegs.push({ u0: startU, u1: pre + 0.18, lv: 0 })
    for (let i = 0; i < n; i++) {
      sdaSegs.push({ u0: pre + 0.18 + i, u1: pre + 0.18 + i + 1, lv: i2cBit(i) })
    }
    const lastEnd = pre + 0.18 + n
    sdaSegs.push({ u0: lastEnd, u1: pre + n + 0.4, lv: 0 })
    sdaSegs.push({ u0: pre + n + 0.4, u1: totalUnits, lv: 1 })
    drawStair(sdaSegs, 148, 190, C.sda)
    label(8, 142, 'SDA', C.sda, 10.5)

    /* START / STOP 标注 */
    const startX = wx0 + startU * unitW
    const stopX = wx0 + (pre + n + 0.4) * unitW
    L.add(new Konva.Line({ points: [startX, 40, startX, 200], stroke: C.cs, strokeWidth: 1, dash: [2, 3] }))
    L.add(new Konva.Line({ points: [stopX, 40, stopX, 200], stroke: C.cs, strokeWidth: 1, dash: [2, 3] }))
    label(Math.max(wx0, startX - 18), 34, 'START', C.cs, 8.5)
    label(Math.min(wx1 - 34, stopX - 12), 34, 'STOP', C.cs, 8.5)
  } else {
    /* ---- CS ---- */
    const csSegs: Seg[] = [
      { u0: 0, u1: pre, lv: 1 },
      { u0: pre, u1: pre + n, lv: 0 },
      { u0: pre + n, u1: totalUnits, lv: 1 },
    ]
    drawStair(csSegs, 46, 66, C.cs)
    label(8, 42, 'CS', C.cs, 10.5)

    /* ---- SCK（模式 0：空闲低，上升沿采样）---- */
    const sckSegs: Seg[] = [{ u0: 0, u1: pre, lv: 0 }]
    for (let i = 0; i < n; i++) {
      sckSegs.push({ u0: pre + i, u1: pre + i + 0.35, lv: 0 })
      sckSegs.push({ u0: pre + i + 0.35, u1: pre + i + 0.75, lv: 1 })
      sckSegs.push({ u0: pre + i + 0.75, u1: pre + i + 1, lv: 0 })
    }
    sckSegs.push({ u0: pre + n, u1: totalUnits, lv: 0 })
    drawStair(sckSegs, 104, 146, C.scl)
    label(8, 100, 'SCK', C.scl, 10.5)

    /* ---- MOSI ---- */
    const mosiSegs: Seg[] = []
    for (let i = 0; i < n; i++) {
      mosiSegs.push({ u0: pre + i, u1: pre + i + 1, lv: spiBit(i) })
    }
    drawStair(mosiSegs, 174, 216, C.sda)
    label(8, 170, 'MOSI', C.sda, 10.5)

    /* 采样点（上升沿） */
    const sampleX = wx0 + (pre + beat.value + 0.35) * unitW
    L.add(new Konva.Line({ points: [sampleX, 150, sampleX, 160], stroke: C.strong, strokeWidth: 1.5 }))
    label(sampleX - 14, 222, '采样', C.strong, 8.5)
  }

  /* 当前节拍游标 */
  const curX = wx0 + (pre + beat.value + 0.5) * unitW
  const bottomY = mode.value === 'i2c' ? 196 : 222
  L.add(
    new Konva.Line({
      points: [curX, 30, curX, bottomY],
      stroke: C.strong,
      strokeWidth: 1.5,
      dash: [3, 3],
    }),
  )

  /* 底部信息面板 */
  const by = mode.value === 'i2c' ? 216 : 246
  L.add(
    new Konva.Rect({
      x: 14,
      y: by,
      width: w - 28,
      height: 104,
      fill: C.panel,
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 8,
    }),
  )
  const compact = w < 430
  const lines =
    mode.value === 'i2c'
      ? compact
        ? [
            '地址 0x3C（7 位）：A6..A0 = 0 1 1 1 1 0 0',
            '第 8 拍 R/W = 0（写），第 9 拍 ACK 被拉低',
            `数据 0xA5 + 最后 1 拍 ACK，共 ${n} 个时钟`,
          ]
        : [
            `地址 0x3C（7 位）→ 线上 A6..A0 = 0 1 1 1 1 0 0，第 8 拍 R/W = 0 表示写`,
            `第 9 拍 ACK：主机释放 SDA，从机把它拉低；随后 8 拍数据 0xA5 = 1 0 1 0 0 1 0 1`,
            `共 ${n} 个时钟：地址+R/W+ACK（9 拍）+ 数据+ACK（9 拍）`,
          ]
      : compact
        ? [
            'CS 拉低选中从机，SCK 每拍给一个时钟',
            '0xA5 = 1 0 1 0 0 1 0 1，MSB 先发',
            '模式 0：CPOL=0 + CPHA=0，上升沿采样',
          ]
        : [
            `CS 拉低选中从机；SCK 每拍给出一个时钟，MOSI 在上升沿被采样`,
            `0xA5 = 1 0 1 0 0 1 0 1，MSB 先发；8 拍发完一字节`,
            `模式 0：CPOL=0（空闲低）+ CPHA=0（第一个边沿采样）`,
          ]
  lines.forEach((t, i) => {
    L.add(
      new Konva.Text({
        x: 26,
        y: by + 12 + i * 26,
        width: w - 52,
        text: t,
        fontSize: 10.5,
        fontFamily: FONT,
        fill: i === 2 ? C.text : C.strong,
      }),
    )
  })

  L.draw()
}

function draw() {
  buildScene()
}

/* ---------------- 交互 ---------------- */
function step() {
  beat.value = (beat.value + 1) % N.value
  draw()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) lastStep = 0
}

function reset() {
  beat.value = 0
  lastStep = 0
  acc = 0
  draw()
}

function switchMode(m: Mode) {
  if (mode.value === m) return
  mode.value = m
  beat.value = 0
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
    const interval = 620 / speed.value
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
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-violet-600 text-white">
          <AppIcon name="grid" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">总线时序 · 交互式动画</span>
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

    <!-- 模式切换 -->
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-2 text-[11px]"
    >
      <div class="flex items-center gap-1.5">
        <span class="text-ink-400">总线</span>
        <button
          v-for="m in MODES"
          :key="m.k"
          class="rounded px-2 py-0.5 font-bold transition-colors"
          :class="mode === m.k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="switchMode(m.k)"
        >
          {{ m.t }}
        </button>
      </div>
      <div class="text-ink-400">
        <span v-if="mode === 'i2c'">7 位地址 0x3C ｜ 写 ｜ 数据 0xA5</span>
        <span v-else>MOSI 0xA5 ｜ 模式 0 ｜ MSB 先发</span>
      </div>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">总线模式</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ mode === 'i2c' ? 'I²C' : 'SPI' }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">时钟节拍</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ beat }} <span class="text-xs font-normal text-ink-400">/ {{ N }}</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前阶段</div>
        <div class="mt-0.5 truncate font-mono text-sm font-bold text-violet-600">{{ phaseOf(beat) }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">速度</div>
        <div class="mt-0.5 flex gap-1">
          <button
            v-for="s in [1, 2, 4]"
            :key="s"
            class="rounded px-1.5 py-0.5 text-xs font-bold transition-colors"
            :class="speed === s ? 'bg-violet-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
            @click="speed = s"
          >
            {{ s }}x
          </button>
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p v-if="mode === 'i2c'">
        I²C 只有两根线：<b class="text-violet-700">SCL 时钟</b> + <b class="text-cyan-700">SDA 数据</b>，
        都是开漏 + 上拉，线与实现多主机仲裁。
        <b>起始 = SCL 高时 SDA 由高变低</b>，<b>停止 = SCL 高时 SDA 由低变高</b>；
        SDA 只能在 SCL 低电平期间变化，高电平期间必须稳定。
        一次写操作固定 9 拍一组（8 位 + 1 个 ACK）。
      </p>
      <p v-else>
        SPI 用四根线换速度：<b class="text-amber-700">CS</b> 选中从机、<b class="text-violet-700">SCK</b> 给时钟、
        <b class="text-cyan-700">MOSI/MISO</b> 双向数据。模式 0 下 SCK 空闲为低、在
        <b>上升沿采样</b>，所以数据必须在下降沿前后保持稳定。
      </p>
      <p class="text-ink-400">
        提示：点「单步」逐拍走，能看到 I²C 第 8 拍是 R/W、第 9 拍一定被拉低（ACK）；SPI 则每拍固定采样一位，8 拍一字节。
      </p>
    </div>
  </div>
</template>
