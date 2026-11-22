<script setup lang="ts">
/**
 * 交互式动画 ⑱：DMA 双缓冲（乒乓）搬运
 * ------------------------------------------------------------------
 * 场景：ADC1 连续采样，DMA 配置为「双缓冲 / 乒乓」，每 4 个样本装满一块
 *       缓冲区就发一次传输完成中断（TC），CPU 只处理「已经填满的那一块」，
 *       DMA 同时去填另一块，二者永不抢同一块内存。
 * 画布内容：
 *   - 左上：ADC1 外设卡（DR 实时值 / 已采样数）
 *   - 右上：DMA1 卡（CNDTR 剩余、HT 半传输标志、TC 传输完成标志）
 *   - 中部：缓冲区 A、缓冲区 B 两行，每行 4 格；行首标注「DMA 正在写 /
 *           CPU 正在处理 / 空闲」，CPU 处理过的格子打勾变浅
 *   - 底部：12 拍滚动时序条，三行对比 —— DMA 通道、双缓冲下的 CPU、
 *           单缓冲下的 CPU（灰色交替，直观看出吞吐只有一半）
 * 交互：
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 * 设计要点：
 *   - 一拍 = DMA 搬 1 个样本 + CPU 处理 1 个样本，二者同拍进行即为「重叠」
 *   - 第 4 拍 TC 置位后立刻切换缓冲区，CPU 从下一拍开始处理刚填满的那块
 *   - 前 4 拍 CPU 只能空转 —— 这就是双缓冲也逃不掉的「首块延迟」
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 常量 ---------------- */
const N = 4 // 每块缓冲区长度
const WIN = 12 // 时序条窗口宽度（拍）
const H = 254

const playing = ref(true)
const speed = ref(1)

const tick = ref(0) // 已走过的拍数
const samples = ref(0) // DMA 已搬运样本数
const procDone = ref(0) // CPU 已处理样本数
const switches = ref(0) // 缓冲区切换次数（TC 次数）
const dmaBuf = ref(0) // DMA 正在写哪一块 0=A 1=B
const dmaIdx = ref(0) // DMA 写到块内第几个位置
const cpuBuf = ref(-1) // CPU 正在处理哪一块，-1 表示空闲
const cpuIdx = ref(0) // CPU 处理到块内第几个
const htFlag = ref(false)
const tcFlag = ref(false)
const lastVal = ref(0)

/** 非响应式：缓冲区数据与标记位，绘制统一走 buildScene */
let bufA: number[] = new Array(N).fill(0)
let bufB: number[] = new Array(N).fill(0)
let gotA: boolean[] = new Array(N).fill(false)
let gotB: boolean[] = new Array(N).fill(false)
let doneA: boolean[] = new Array(N).fill(false)
let doneB: boolean[] = new Array(N).fill(false)
/** 时序条历史：每拍记录 DMA 是否在搬、CPU 是否在处理 */
let histDma: boolean[] = []
let histCpu: boolean[] = []

const overlap = computed(() => {
  const busy = Math.max(1, tick.value - N) // 首块之后的拍数才算重叠
  return Math.round((Math.min(procDone.value, busy) / busy) * 100)
})

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  adc: '#0891b2',
  dma: '#7c3aed',
  cpu: '#2563eb',
  hi: '#dc2626',
  ok: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
  panel: '#f8fafc',
}

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

let lastStep = 0
let acc = 0

/* ---------------- 模拟采样值 ---------------- */
function sampleValue(t: number): number {
  const base = 2048 + 760 * Math.sin(t * 0.42)
  const noise = (((t * 149) % 37) - 18) * 1.6
  return Math.max(0, Math.min(4095, Math.round(base + noise)))
}

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()

  const w = S.width()
  if (!w || w < 40) {
    L.draw()
    return
  }

  const x0 = 14
  const x1 = w - 14
  const gap = 10
  const cardW = (x1 - x0 - gap) / 2
  const cardY = 27
  const cardH = 56
  const compact = w < 430

  /* ---------- 标题 ---------- */
  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: 'DMA 双缓冲：一块给 DMA 写，一块给 CPU 读',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- ADC 卡 ---------- */
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
      y: cardY + 6,
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
      y: cardY + 24,
      text: `DR = ${lastVal.value}`,
      fontSize: 10,
      fontFamily: FONT,
      fill: C.strong,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: cardY + 44,
      text: compact ? `已采 ${samples.value} 个` : `已采样 ${samples.value} 个（连续转换）`,
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- DMA 卡 ---------- */
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
      y: cardY + 6,
      text: 'DMA1 · 双缓冲',
      fontSize: 10,
      fontFamily: FONT,
      fill: C.dma,
      fontStyle: 'bold',
    }),
  )
  // 寄存器改成 2×2 网格：竖排四行在卡片里挤成一团，横排两列更好读
  // 右列贴住卡片右边沿，避免窄屏时 CMAR 的长地址值顶到 HT 上
  const col2X = dx + cardW - 52
  const regGrid: Array<[string, string, string, number, number]> = [
    ['CMAR', `→ buf${dmaBuf.value === 0 ? 'A' : 'B'}[${Math.min(dmaIdx.value, N - 1)}]`, C.strong, dx + 9, cardY + 24],
    ['CNDTR', `${N - dmaIdx.value} / ${N}`, C.dma, dx + 9, cardY + 39],
    ['HT', htFlag.value ? '1' : '0', htFlag.value ? C.hi : C.dim, col2X, cardY + 24],
    ['TC', tcFlag.value ? '1' : '0', tcFlag.value ? C.hi : C.dim, col2X, cardY + 39],
  ]
  regGrid.forEach(([k, v, col, rx, ry]) => {
    L.add(
      new Konva.Text({
        x: rx,
        y: ry,
        text: k,
        fontSize: 8,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
    L.add(
      new Konva.Text({
        x: rx + 34,
        y: ry,
        text: v,
        fontSize: 8,
        fontFamily: FONT,
        fill: col,
        fontStyle: k === 'HT' || k === 'TC' ? 'bold' : 'normal',
      }),
    )
  })

  /* ---------- 两块缓冲区 ---------- */
  const labelW = 30
  const cellW = (x1 - x0 - labelW) / N
  const cellH = 30

  const drawBuf = (
    which: 0 | 1,
    titleY: number,
  ) => {
    const byDma = dmaBuf.value === which
    const byCpu = cpuBuf.value === which
    let role = '空闲'
    let roleColor = C.dim
    if (byDma) {
      role = 'DMA 正在写'
      roleColor = C.dma
    } else if (byCpu) {
      role = 'CPU 正在处理'
      roleColor = C.cpu
    }
    L.add(
      new Konva.Text({
        x: x0,
        y: titleY,
        text: `缓冲区 ${which === 0 ? 'A' : 'B'}`,
        fontSize: 9,
        fontFamily: FONT,
        fill: byDma || byCpu ? C.strong : C.text,
        fontStyle: 'bold',
      }),
    )
    L.add(
      new Konva.Text({
        x: x0 + 62,
        y: titleY,
        text: `· ${role}`,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: roleColor,
        fontStyle: byDma || byCpu ? 'bold' : 'normal',
      }),
    )

    const cellY = titleY + 12
    const got = which === 0 ? gotA : gotB
    const done = which === 0 ? doneA : doneB
    const buf = which === 0 ? bufA : bufB

    // 行首字母徽标
    L.add(
      new Konva.Rect({
        x: x0,
        y: cellY,
        width: labelW - 8,
        height: cellH,
        fill: byDma ? '#f5f3ff' : byCpu ? '#eff6ff' : '#f8fafc',
        stroke: byDma ? '#c4b5fd' : byCpu ? '#bfdbfe' : C.grid,
        strokeWidth: 1,
        cornerRadius: 4,
      }),
    )
    L.add(
      new Konva.Text({
        x: x0,
        y: cellY + 9,
        width: labelW - 8,
        align: 'center',
        text: which === 0 ? 'A' : 'B',
        fontSize: 10,
        fontFamily: FONT,
        fill: byDma ? C.dma : byCpu ? C.cpu : C.dim,
        fontStyle: 'bold',
      }),
    )

    for (let i = 0; i < N; i++) {
      const gx = x0 + labelW + i * cellW
      const isWriting = byDma && i === dmaIdx.value - 1
      const isReading = byCpu && i === cpuIdx.value - 1
      let stroke = C.grid
      let strokeW = 1
      let fill = '#fbfcfe'
      if (isWriting) {
        stroke = C.dma
        strokeW = 1.8
        fill = '#faf5ff'
      } else if (isReading) {
        stroke = C.cpu
        strokeW = 1.8
        fill = '#eff6ff'
      } else if (got[i]) {
        fill = done[i] ? '#f0fdf4' : which === 0 ? '#eff6ff' : '#f5f3ff'
      }
      L.add(
        new Konva.Rect({
          x: gx + 1,
          y: cellY,
          width: cellW - 2,
          height: cellH,
          fill,
          stroke,
          strokeWidth: strokeW,
          cornerRadius: 4,
        }),
      )
      L.add(
        new Konva.Text({
          x: gx + 1,
          y: cellY + 7,
          width: cellW - 2,
          align: 'center',
          text: got[i] ? String(buf[i]) : '—',
          fontSize: 9,
          fontFamily: FONT,
          fill: got[i] ? C.strong : C.dim,
          fontStyle: got[i] ? 'bold' : 'normal',
        }),
      )
      // 已处理的格子在右上角打勾（不占用数值行，避免窄屏叠字）
      if (done[i]) {
        L.add(
          new Konva.Text({
            x: gx + cellW - 11,
            y: cellY + 1,
            text: '✓',
            fontSize: 7.5,
            fontFamily: FONT,
            fill: C.ok,
            fontStyle: 'bold',
          }),
        )
      }
      // 下标放在格子内部左下角，不再压到下一行标题
      L.add(
        new Konva.Text({
          x: gx + 4,
          y: cellY + cellH - 9,
          text: String(i),
          fontSize: 6.5,
          fontFamily: FONT,
          fill: C.dim,
        }),
      )
    }
  }

  drawBuf(0, 92)
  drawBuf(1, 140)

  /* ---------- 底部时序条 ---------- */
  const tlY = 190
  L.add(
    new Konva.Text({
      x: x0,
      y: tlY,
      text: '最近 12 拍时序：紫 = DMA 搬，蓝 = CPU 算，灰 = 单缓冲轮流',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.text,
      fontStyle: 'bold',
    }),
  )

  const barLabelW = 46
  const availW = Math.min(x1 - x0 - barLabelW, 560)
  const colW = availW / WIN
  const barH = 8

  const drawBar = (
    label: string,
    y: number,
    filled: (j: number) => boolean,
    color: string,
    ghost?: boolean,
  ) => {
    L.add(
      new Konva.Text({
        x: x0,
        y: y + 0.5,
        text: label,
        fontSize: 7.5,
        fontFamily: FONT,
        fill: C.text,
      }),
    )
    for (let j = 0; j < WIN; j++) {
      const cx = x0 + barLabelW + j * colW
      L.add(
        new Konva.Rect({
          x: cx,
          y,
          width: Math.max(1, colW - 1.5),
          height: barH,
          fill: filled(j) ? color : '#f8fafc',
          stroke: '#eef2f7',
          strokeWidth: ghost ? 0.5 : 0.5,
          cornerRadius: 1.5,
        }),
      )
    }
  }

  drawBar('DMA', tlY + 11, (j) => histDma[j] === true, C.dma)
  drawBar('CPU', tlY + 22, (j) => histCpu[j] === true, C.cpu)
  // 单缓冲参考：CPU 与 DMA 只能轮流，同一拍只有一方在动
  drawBar(
    '单缓冲',
    tlY + 33,
    (j) => Math.floor(j / 2) % 2 === 0,
    '#cbd5e1',
    true,
  )

  /* ---------- 状态栏 ---------- */
  const status =
    tick.value === 0
      ? '就绪：DMA 使能后先默默填满缓冲区 A，这期间 CPU 只能等'
      : cpuBuf.value < 0
        ? `第 ${tick.value} 拍：DMA 写 ${dmaBuf.value === 0 ? 'A' : 'B'}[${Math.max(0, dmaIdx.value - 1)}]，CPU 空闲（首块还没填满）`
        : `第 ${tick.value} 拍：DMA 写 ${dmaBuf.value === 0 ? 'A' : 'B'}，CPU 读 ${cpuBuf.value === 0 ? 'A' : 'B'} —— 同一拍两件事并行`
  L.add(
    new Konva.Text({
      x: x0,
      y: 236,
      width: x1 - x0,
      text: status,
      fontSize: 9.5,
      lineHeight: 1.25,
      fontFamily: FONT,
      fill: cpuBuf.value < 0 ? C.text : C.dma,
      fontStyle: cpuBuf.value >= 0 ? 'bold' : 'normal',
    }),
  )

  L.draw()
}

/* ---------------- 交互 ---------------- */
function step() {
  // ① DMA 搬一个样本进当前缓冲区
  const i = dmaIdx.value
  const v = sampleValue(samples.value)
  const cur = dmaBuf.value
  if (cur === 0) {
    bufA[i] = v
    gotA[i] = true
  } else {
    bufB[i] = v
    gotB[i] = true
  }
  samples.value++
  dmaIdx.value++
  lastVal.value = v
  histDma.push(true)

  // ② 半传输 / 传输完成标志
  htFlag.value = dmaIdx.value === 2
  tcFlag.value = dmaIdx.value === N

  if (dmaIdx.value === N) {
    // 装满：刚填满的这块交给 CPU，DMA 立刻转去填另一块
    cpuBuf.value = cur
    cpuIdx.value = 0
    dmaBuf.value = 1 - cur
    dmaIdx.value = 0
    switches.value++
  }

  // ③ CPU 与 DMA 同拍并行，处理「上一块已填满」的缓冲区
  let cpuBusy = false
  if (cpuBuf.value >= 0 && cpuIdx.value < N) {
    const k = cpuIdx.value
    if (cpuBuf.value === 0) doneA[k] = true
    else doneB[k] = true
    cpuIdx.value++
    procDone.value++
    cpuBusy = true
    if (cpuIdx.value === N) cpuBuf.value = -1
  }
  histCpu.push(cpuBusy)

  tick.value++
  if (histDma.length > WIN) histDma.shift()
  if (histCpu.length > WIN) histCpu.shift()

  buildScene()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    lastStep = 0
    acc = 0
  }
}

function reset() {
  bufA = new Array(N).fill(0)
  bufB = new Array(N).fill(0)
  gotA = new Array(N).fill(false)
  gotB = new Array(N).fill(false)
  doneA = new Array(N).fill(false)
  doneB = new Array(N).fill(false)
  histDma = []
  histCpu = []
  tick.value = 0
  samples.value = 0
  procDone.value = 0
  switches.value = 0
  dmaBuf.value = 0
  dmaIdx.value = 0
  cpuBuf.value = -1
  cpuIdx.value = 0
  htFlag.value = false
  tcFlag.value = false
  lastVal.value = 0
  lastStep = 0
  acc = 0
  buildScene()
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
    const interval = 760 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    // 标签页切回时 frame.time 会跳很大，封顶避免单帧同步重绘几十次
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
        <span class="text-[13px] font-bold text-ink-800">DMA 双缓冲 · 交互式动画</span>
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
        <button
          v-for="s in [1, 2, 4]"
          :key="s"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="speed === s ? 'bg-violet-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">DMA 已搬</div>
        <div class="mt-0.5 font-mono text-base font-bold text-violet-700">{{ samples }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">CPU 已处理</div>
        <div class="mt-0.5 font-mono text-base font-bold text-blue-700">{{ procDone }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">缓冲区切换</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ switches }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">重叠率</div>
        <div class="mt-0.5 font-mono text-base font-bold text-emerald-600">{{ overlap }}%</div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        双缓冲（乒乓）的本质是<b class="text-ink-700">给 DMA 和 CPU 各分配一块地盘</b>：DMA 写完 A
        立刻转到 B，CPU 只碰「已经写完的那一块」。任何时刻两边都不碰同一格内存，所以中断里
        不需要再做拷贝，也不需要关中断保护。
      </p>
      <p class="text-ink-400">
        盯住两处：① 前 4 拍 CPU 一直是「空闲」——这是双缓冲也躲不掉的首块延迟；② 第 4 拍之后
        DMA 与 CPU 每拍都在动，重叠率爬到 100%，而下面「单缓冲」那行永远是一格隔一格。
      </p>
    </div>
  </div>
</template>
