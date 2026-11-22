<script setup lang="ts">
/**
 * 交互式动画 ⑫：定时器时基与预分频（Konva）
 * ------------------------------------------------------------------
 * 画布内容（自上而下的信号链路）：
 *   - 第一带：f_CLK = 72MHz 的密集时钟栅格（每个计数周期内画 ÷(PSC+1) 根细线，
 *     超过 14 根则用「⋯」示意，避免视觉糊成一片）
 *   - 中间标注：÷ (PSC+1) 分频箭头
 *   - 第二带：分频后的计数脉冲 f_CNT（每个 slot 一个上升沿）
 *   - 第三带：CNT 计数进度条 0 → ARR，溢出瞬间闪出 UEV 提示
 * 交互：
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 *   - 四组 PSC/ARR 预设，实时对比「同频不同分辨率」的取舍
 * 设计要点：
 *   - 8 个 slot 固定演示一个完整溢出周期，步长 = ceil((ARR+1)/8)，
 *     所以不管 ARR 是 99 还是 19999，视觉上始终 8 拍走完一轮
 *   - 窄屏（<260px）直接跳过绘制，规避 Konva 圆角矩形负半径崩溃
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 常量与参数 ---------------- */
const FCLK = 72_000_000 // STM32F103 的 TIMxCLK
const SLOTS = 8 // 一个溢出周期切成 8 拍演示
const H = 240

const PRESETS = [
  { psc: 71, arr: 999, label: '1 kHz · 1000 级' },
  { psc: 719, arr: 99, label: '1 kHz · 100 级' },
  { psc: 71, arr: 19999, label: '50 Hz · 舵机' },
  { psc: 0, arr: 35999, label: '2 kHz · 3.6 万级' },
]

const playing = ref(true)
const speed = ref(1)
const idx = ref(0)
const cnt = ref(0)
const uevCount = ref(0)
const justOverflow = ref(false)

/* ---------------- 派生量 ---------------- */
const preset = computed(() => PRESETS[idx.value])
const div = computed(() => preset.value.psc + 1) // 分频系数 = PSC + 1
const cntMax = computed(() => preset.value.arr + 1) // 周期 = ARR + 1 个计数
const fCnt = computed(() => FCLK / div.value) // 计数时钟
const fOut = computed(() => fCnt.value / cntMax.value) // 溢出频率
const periodUs = computed(() => 1e6 / fOut.value)
/** 每拍前进多少个计数：保证 8 拍正好走完一个周期 */
const stepSize = computed(() => Math.max(1, Math.ceil(cntMax.value / SLOTS)))

const fCntText = computed(() =>
  fCnt.value >= 1e6 ? `${(fCnt.value / 1e6).toFixed(2)} MHz` : `${(fCnt.value / 1e3).toFixed(1)} kHz`,
)
const fOutText = computed(() =>
  fOut.value >= 1000 ? `${(fOut.value / 1000).toFixed(2)} kHz` : `${fOut.value.toFixed(1)} Hz`,
)
const periodText = computed(() =>
  periodUs.value >= 1000
    ? `${(periodUs.value / 1000).toFixed(2)} ms`
    : `${periodUs.value.toFixed(1)} µs`,
)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  clk: '#ea580c',
  cnt: '#2563eb',
  uev: '#dc2626',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
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
  // 窄屏重排瞬间容器宽度可能塌缩到几十像素，此时算出的格宽为负，
  // Konva 画 cornerRadius 会抛 IndexSizeError。等 ResizeObserver 复位后再画。
  if (w < 260) {
    L.draw()
    return
  }

  const x0 = 62
  const x1 = w - 14
  const slotW = (x1 - x0) / SLOTS
  const d = div.value
  const compact = w < 430

  /* 标题 */
  L.add(
    new Konva.Text({
      x: 16,
      y: 10,
      text: compact
        ? '时基链路：f_CLK → PSC → CNT → ARR'
        : '时基链路：f_CLK → ÷(PSC+1) → CNT 计数 → ARR 溢出',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- f_CLK 时钟栅格带 ---------- */
  const cy = 38
  const ch = 34
  L.add(
    new Konva.Rect({
      x: x0,
      y: cy,
      width: x1 - x0,
      height: ch,
      fill: '#fff7ed',
      stroke: '#fed7aa',
      strokeWidth: 1,
      cornerRadius: 5,
    }),
  )
  L.add(
    new Konva.Text({
      x: 6,
      y: cy + 3,
      text: 'f_CLK',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.clk,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: 6,
      y: cy + 16,
      text: '72 MHz',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.dim,
    }),
  )

  // 每个 slot 内画 min(d, 14) 根时钟细线；d 太大时右侧补「⋯」
  const perSlot = Math.min(d, 14)
  for (let s = 0; s < SLOTS; s++) {
    const sx = x0 + s * slotW
    for (let k = 0; k < perSlot; k++) {
      const px = sx + ((k + 0.5) * slotW) / perSlot
      L.add(
        new Konva.Line({
          points: [px, cy + 5, px, cy + ch - 5],
          stroke: C.clk,
          strokeWidth: perSlot > 8 ? 1 : 1.6,
          opacity: 0.72,
        }),
      )
    }
    // slot 分隔线（更淡）
    if (s > 0) {
      L.add(
        new Konva.Line({
          points: [sx, cy + 1, sx, cy + ch - 1],
          stroke: '#fdba74',
          strokeWidth: 1.2,
          dash: [3, 3],
        }),
      )
    }
    if (d > 14) {
      L.add(
        new Konva.Text({
          x: sx + slotW - 13,
          y: cy + 11,
          text: '⋯',
          fontSize: 11,
          fontFamily: FONT,
          fill: C.clk,
        }),
      )
    }
  }

  /* 分频标注 */
  L.add(
    new Konva.Text({
      x: x0 + 4,
      y: cy + ch + 4,
      text: compact
        ? `÷ (PSC+1) = ÷${d}`
        : `÷ (PSC+1) = ÷${d}  每个计数周期 = ${d} 个时钟`,
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  L.add(
    new Konva.Line({
      points: [x0 + 2, cy + ch + 2, x0 + 2, cy + ch + 16, x0 + 8, cy + ch + 16],
      stroke: C.dim,
      strokeWidth: 1,
    }),
  )

  /* ---------- f_CNT 计数脉冲 ---------- */
  const yH = 112
  const yL = 140
  L.add(
    new Konva.Text({
      x: 6,
      y: yH - 4,
      text: 'f_CNT',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.cnt,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: 6,
      y: yL - 6,
      text: fCntText.value,
      fontSize: 8,
      fontFamily: FONT,
      fill: C.dim,
    }),
  )

  const pts: number[] = [x0, yL]
  for (let s = 0; s < SLOTS; s++) {
    const sx = x0 + s * slotW
    const hi = sx + slotW * 0.36
    pts.push(sx, yL, sx, yH, hi, yH, hi, yL, sx + slotW, yL)
  }
  L.add(
    new Konva.Line({
      points: pts,
      stroke: C.cnt,
      strokeWidth: 2.2,
      lineJoin: 'miter',
      lineCap: 'butt',
    }),
  )

  /* ---------- CNT 计数条 ---------- */
  const by = 164
  const bw = x1 - x0
  L.add(
    new Konva.Rect({
      x: x0,
      y: by,
      width: bw,
      height: 16,
      fill: '#f1f5f9',
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 4,
    }),
  )
  const ratio = Math.min(1, cnt.value / cntMax.value)
  if (ratio > 0.003) {
    L.add(
      new Konva.Rect({
        x: x0 + 1,
        y: by + 1,
        width: Math.max(3, bw * ratio - 2),
        height: 14,
        fill: C.cnt,
        cornerRadius: 3,
      }),
    )
  }
  L.add(
    new Konva.Text({
      x: 6,
      y: by + 2,
      text: 'CNT',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.cnt,
      fontStyle: 'bold',
    }),
  )
  /* 当前拍游标 */
  const curSlot = Math.min(SLOTS - 1, Math.floor(cnt.value / stepSize.value))
  const cursorX = x0 + curSlot * slotW + slotW / 2
  L.add(
    new Konva.Line({
      points: [cursorX, cy - 6, cursorX, by + 20],
      stroke: C.strong,
      strokeWidth: 1.2,
      dash: [3, 3],
      opacity: 0.5,
    }),
  )

  /* 底部数值 / UEV 提示 */
  L.add(
    new Konva.Text({
      x: x0,
      y: by + 24,
      text: `${cnt.value}`,
      fontSize: 14,
      fontFamily: FONT,
      fill: C.cnt,
      fontStyle: 'bold',
    }),
  )
  const noteX = x0 + 52
  const noteW = x1 - noteX
  if (justOverflow.value) {
    L.add(
      new Konva.Rect({
        x: noteX - 4,
        y: by + 22,
        width: Math.min(noteW + 4, 300),
        height: 20,
        fill: '#fef2f2',
        stroke: '#fecaca',
        strokeWidth: 1,
        cornerRadius: 4,
      }),
    )
    L.add(
      new Konva.Text({
        x: noteX + 2,
        y: by + 26,
        width: noteW,
        text: w < 430 ? '↻ UEV：CNT 归零重装' : '↻ UEV 更新事件：CNT 归零并重装载，可触发中断 / DMA',
        fontSize: 10,
        fontFamily: FONT,
        fill: C.uev,
        fontStyle: 'bold',
      }),
    )
  } else {
    L.add(
      new Konva.Text({
        x: noteX,
        y: by + 26,
        width: noteW,
        text: w < 430 ? `计数 ${cnt.value} / ${preset.value.arr}` : `当前计数值 ${cnt.value} / ${preset.value.arr}（到 ARR 后归零）`,
        fontSize: 10,
        fontFamily: FONT,
        fill: C.text,
      }),
    )
  }

  L.draw()
}

function draw() {
  buildScene()
}

/* ---------------- 交互 ---------------- */
function step() {
  justOverflow.value = false
  const next = cnt.value + stepSize.value
  if (next > preset.value.arr) {
    // 跨过 ARR：归零并产生一次更新事件
    cnt.value = 0
    uevCount.value++
    justOverflow.value = true
  } else {
    cnt.value = next
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
  cnt.value = 0
  uevCount.value = 0
  justOverflow.value = false
  lastStep = 0
  acc = 0
  draw()
}

function pickPreset(i: number) {
  idx.value = i
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
    if (!playing.value) {
      lastStep = frame.time
      return
    }
    const interval = 560 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    // 标签页切走再回来时 frame.time 会一次跳很大，若不封顶会在一帧里
    // 同步重绘几百次（每次都是整场景重建），造成明显卡顿。最多补 3 拍。
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-indigo-600 text-white">
          <AppIcon name="clock" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">定时器时基与预分频 · 交互式动画</span>
        <span class="tag bg-indigo-50 text-indigo-700">Konva</span>
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

    <!-- 参数条：PSC / ARR 预设 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2">
      <span class="text-[11px] text-ink-400">预设</span>
      <button
        v-for="(p, i) in PRESETS"
        :key="i"
        class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
        :class="idx === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
        @click="pickPreset(i)"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">计数时钟</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ fCntText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">溢出频率</div>
        <div class="mt-0.5 font-mono text-base font-bold text-indigo-600">{{ fOutText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">周期 T</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ periodText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">分辨率</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ cntMax }} <span class="text-xs font-normal text-ink-400">级</span>
        </div>
      </div>
    </div>

    <!-- 控制区 -->
    <div class="space-y-2.5 px-4 py-3">
      <div class="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-600">
        f_OUT = 72 MHz ÷ (PSC+1) ÷ (ARR+1) =
        72 MHz ÷ {{ div }} ÷ {{ cntMax }} =
        <span class="font-bold text-indigo-600">{{ fOutText }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <span class="text-ink-400">速度</span>
        <button
          v-for="s in [1, 2, 4]"
          :key="s"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="speed === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
        <span class="ml-auto font-mono text-[11px] text-ink-400">已产生 {{ uevCount }} 次 UEV</span>
      </div>
      <p class="text-[12px] leading-relaxed text-ink-500">
        <b class="text-ink-700">两个「+1」是新手最容易算错的地方</b>：<span class="font-mono">PSC = 0</span> 是
        ÷1（不分频）、<span class="font-mono">ARR = 0</span> 是每 1 个计数就溢出，寄存器从 0 开始数，
        所以实际除数与周期都要 +1。
      </p>
      <p class="text-ink-400">
        提示：切到「1 kHz · 100 级」与「1 kHz · 1000 级」对比——溢出频率相同，但后者分辨率高 10 倍；
        再看「2 kHz · 3.6 万级」，那就是「PSC 不分频、靠大 ARR 换精度」的代价（低频做不出来）。
      </p>
    </div>
  </div>
</template>
