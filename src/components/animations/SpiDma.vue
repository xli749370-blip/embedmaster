<script setup lang="ts">
/**
 * 交互式动画 ⑮：SPI 主机 + DMA 双向传输（Konva）
 * ------------------------------------------------------------------
 * 场景：STM32 用 SPI1 读 W25Q64 Flash 的 8 个字节。
 *       TX 与 RX 各挂一条 DMA 通道，8 个字节在同一个时钟节拍里
 *       一边发出去、一边收进来（全双工），CPU 只在开头配置一次。
 * 画布内容：
 *   - 左侧上下两条数组：TX buf（命令+地址+dummy）、RX buf（收到的字节）
 *   - 右侧从机卡：W25Q64，标注「MOSI 收命令 / MISO 回数据」
 *   - 两条反向流动的虚线箭头：TX 向右、RX 向左
 *   - 底部 CPU 占用对比：轮询 8 段 vs DMA 1 段
 * 交互：
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 *   - 模式切换：DMA 双向 / 轮询逐字节（对比 CPU 占用）
 * 设计要点：
 *   - 前 6 字节是命令 + 地址阶段，MISO 上收到的是无效数据（灰色显示），
 *     真正的数据从第 7 字节才开始——这是新手最容易把「数据错位一字节」
 *     归因成「时序模式配错」的地方
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 常量 ---------------- */
const N = 8
const H = 288
/** MISO 上前 6 字节是命令/地址阶段的无效数据 */
const VALID_FROM = 6

/** TX：0x03 读命令 + 3 字节地址 + 4 字节 dummy */
const TX = [0x03, 0x00, 0x12, 0x34, 0xff, 0xff, 0xff, 0xff]
/** RX：前 6 字节无效，后 2 字节是真正读到的数据 */
const RX = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xde, 0xad]

const playing = ref(true)
const speed = ref(1)
/** true = DMA 双向搬运；false = CPU 轮询逐字节 */
const dma = ref(true)
/** 已完成的字节数 0..N */
const sent = ref(0)
/** DMA 模式下的「配置」这一步是否已做 */
const configured = ref(false)

const modeText = computed(() => (dma.value ? 'DMA 双向' : '轮询逐字节'))
const done = computed(() => sent.value >= N)
/** DMA 模式下没配置之前不能搬数据；轮询模式不需要配置 */
const armed = computed(() => !dma.value || configured.value)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  tx: '#7c3aed',
  rx: '#0891b2',
  cpu: '#d97706',
  idle: '#e2e8f0',
  hi: '#dc2626',
  text: '#64748b',
  strong: '#0f172a',
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
/** 两条流动虚线，靠 dashOffset 产生方向感 */
let txLine: Konva.Line | null = null
let rxLine: Konva.Line | null = null

let lastStep = 0
let acc = 0

const hex = (v: number) => v.toString(16).toUpperCase().padStart(2, '0')

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()
  txLine = null
  rxLine = null

  const w = S.width()
  // 窄屏重排瞬间宽度塌缩时跳过，等 ResizeObserver 拿到最终宽度
  if (!w || w < 40) {
    L.draw()
    return
  }

  const x0 = 14
  const x1 = w - 14
  const compact = w < 470
  const slaveW = compact ? 86 : 114
  const gap = compact ? 26 : 54
  const arrRight = x1 - slaveW - gap
  const gw = (arrRight - x0) / N
  const rowH = 30
  const txY = 60
  const rxY = 124
  const slaveX = x1 - slaveW

  /* ---------- 标题 ---------- */
  L.add(
    new Konva.Text({
      x: x0,
      y: 10,
      text: compact ? 'SPI + DMA：8 字节同拍收发' : 'SPI1 + DMA：一次时钟节拍里同时发 8 字节、收 8 字节',
      fontSize: compact ? 10.5 : 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- TX / RX 数组 ---------- */
  const rows: Array<{
    y: number
    label: string
    data: number[]
    color: string
    tag: string
    isTx: boolean
  }> = [
    { y: txY, label: 'TX buf · 命令 + 地址 + dummy', data: TX, color: C.tx, tag: 'MOSI →', isTx: true },
    { y: rxY, label: 'RX buf · MISO 收回的字节', data: RX, color: C.rx, tag: '← MISO', isTx: false },
  ]

  rows.forEach((row) => {
    // 行标题
    L.add(
      new Konva.Text({
        x: x0,
        y: row.y - 15,
        text: compact ? `${row.tag} ${row.isTx ? '发送' : '接收'}` : row.label,
        fontSize: 9,
        fontFamily: FONT,
        fill: row.color,
        fontStyle: 'bold',
      }),
    )

    for (let i = 0; i < N; i++) {
      const gx = x0 + i * gw
      const isSent = i < sent.value
      const isCur = i === sent.value - 1
      // RX 前 6 字节是命令/地址阶段的无效数据
      const valid = row.isTx ? true : i >= VALID_FROM

      L.add(
        new Konva.Rect({
          x: gx + 1,
          y: row.y,
          width: gw - 2,
          height: rowH,
          fill: isSent ? (valid ? '#f8fafc' : '#fbfbfc') : '#fdfefe',
          stroke: isCur ? row.color : C.gridStrong,
          strokeWidth: isCur ? 1.8 : 1,
          cornerRadius: 4,
        }),
      )
      L.add(
        new Konva.Text({
          x: gx + 1,
          y: row.y + 9,
          width: gw - 2,
          align: 'center',
          text: isSent ? hex(row.data[i]) : '··',
          fontSize: compact ? 8 : 9,
          fontFamily: 'Consolas, "Courier New", monospace',
          fill: isSent ? (valid ? C.strong : C.dim) : C.dim,
          fontStyle: isSent && valid ? 'bold' : 'normal',
        }),
      )
    }
  })

  /* ---------- 从机卡 ---------- */
  L.add(
    new Konva.Rect({
      x: slaveX,
      y: 46,
      width: slaveW,
      height: 108,
      fill: '#f0fdfa',
      stroke: '#99f6e4',
      strokeWidth: 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Text({
      x: slaveX + 8,
      y: 53,
      text: 'W25Q64',
      fontSize: 10,
      fontFamily: FONT,
      fill: '#0d9488',
      fontStyle: 'bold',
    }),
  )
  // 一行一项：左侧引脚名、右侧状态，避免标签与数值上下叠在一起
  const slaveRows: Array<[string, string]> = [
    ['CS', sent.value > 0 && !done.value ? '0 选中' : '1 空闲'],
    ['MOSI', '收命令'],
    ['MISO', '回数据'],
    ['SCK', '9 MHz'],
  ]
  slaveRows.forEach(([k, v], i) => {
    const ry = 74 + i * 21
    L.add(
      new Konva.Text({
        x: slaveX + 7,
        y: ry,
        text: k,
        fontSize: 7.5,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
    L.add(
      new Konva.Text({
        x: slaveX + 7,
        y: ry,
        width: slaveW - 14,
        align: 'right',
        text: v,
        fontSize: 8,
        fontFamily: FONT,
        fill: k === 'CS' && sent.value > 0 && !done.value ? '#0d9488' : C.strong,
        fontStyle: 'bold',
      }),
    )
  })

  /* ---------- 两条反向流动的通道 ---------- */
  const arrowY1 = txY + rowH / 2
  const arrowY2 = rxY + rowH / 2
  const on = armed.value && !done.value

  txLine = new Konva.Line({
    points: [arrRight + 3, arrowY1, slaveX - 3, arrowY1],
    stroke: on ? C.tx : C.dim,
    strokeWidth: 1.8,
    dash: [5, 4],
  })
  L.add(txLine)
  // 箭头：TX 向右
  L.add(
    new Konva.Line({
      points: [slaveX - 3, arrowY1, slaveX - 8, arrowY1 - 3, slaveX - 8, arrowY1 + 3],
      closed: true,
      fill: on ? C.tx : C.dim,
    }),
  )

  rxLine = new Konva.Line({
    points: [slaveX - 3, arrowY2, arrRight + 3, arrowY2],
    stroke: on ? C.rx : C.dim,
    strokeWidth: 1.8,
    dash: [5, 4],
  })
  L.add(rxLine)
  // 箭头：RX 向左
  L.add(
    new Konva.Line({
      points: [arrRight + 3, arrowY2, arrRight + 8, arrowY2 - 3, arrRight + 8, arrowY2 + 3],
      closed: true,
      fill: on ? C.rx : C.dim,
    }),
  )

  /* ---------- CPU 占用对比 ---------- */
  const bx = x0 + 34
  const bw = x1 - bx
  const uw = bw / N
  L.add(
    new Konva.Text({
      x: x0,
      y: 164,
      text: '同样 8 个字节，CPU 要花多少时间？',
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
      fontStyle: 'bold',
    }),
  )

  // 轮询：8 段全占（每字节都要等 TXE / RXNE）
  L.add(
    new Konva.Text({ x: x0, y: 181, text: '轮询', fontSize: 8.5, fontFamily: FONT, fill: !dma.value ? C.cpu : C.dim }),
  )
  for (let i = 0; i < N; i++) {
    const active = !dma.value && i < Math.max(sent.value, 0)
    L.add(
      new Konva.Rect({
        x: bx + i * uw + 1,
        y: 179,
        width: uw - 2,
        height: 12,
        fill: active ? C.cpu : !dma.value ? '#fde9c8' : C.idle,
        cornerRadius: 2,
      }),
    )
  }

  // DMA：第 1 段配置，其余全空
  L.add(
    new Konva.Text({ x: x0, y: 199, text: 'DMA', fontSize: 8.5, fontFamily: FONT, fill: dma.value ? C.tx : C.dim }),
  )
  for (let i = 0; i < N; i++) {
    const isCfg = i === 0
    const cfgDone = dma.value && configured.value
    L.add(
      new Konva.Rect({
        x: bx + i * uw + 1,
        y: 197,
        width: uw - 2,
        height: 12,
        fill: isCfg ? (cfgDone ? C.tx : dma.value ? '#ddd6fe' : C.idle) : dma.value ? '#f1f5f9' : C.idle,
        cornerRadius: 2,
      }),
    )
  }
  L.add(
    new Konva.Text({
      x: bx,
      y: 212,
      text: dma.value
        ? compact
          ? '只占 1 段（配置）'
          : '只占 1 段（配置），其余时间 CPU 空闲'
        : compact
          ? '占满 8 段'
          : '占满 8 段：每个字节都在等标志位',
      fontSize: 8,
      fontFamily: FONT,
      fill: dma.value ? C.tx : C.cpu,
    }),
  )

  /* ---------- 第 6 字节提示 ---------- */
  L.add(
    new Konva.Text({
      x: x0,
      y: 228,
      width: x1 - x0,
      text: compact
        ? '前 6 字节是命令/地址期，MISO 上是无效数据'
        : '灰色格子 = 命令/地址阶段，MISO 上的字节无效；真正的数据从第 7 字节开始',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.dim,
    }),
  )

  /* ---------- 状态栏 ---------- */
  let status: string
  let sColor: string
  if (done.value) {
    status = dma.value
      ? '8 字节交换完成：TC 置位，CPU 期间完全可以去处理别的任务'
      : '8 字节交换完成：CPU 全程被占满，这期间其他任务一次都没被调度'
    sColor = dma.value ? C.tx : C.cpu
  } else if (!armed.value) {
    status = '待配置：SPI1 的 TX / RX 各需一条 DMA 通道（DMA1_Ch3 / DMA1_Ch2），CPAR 指向 SPI1->DR'
    sColor = C.tx
  } else if (sent.value === 0) {
    status = '已就绪：CS 拉低，DMA 一使能，SPI 就开始出时钟'
    sColor = C.tx
  } else if (dma.value) {
    status = `第 ${sent.value} 字节：DMA 把 TX buf[${sent.value - 1}] 搬进 DR，同时把 DR 收到的字节搬进 RX buf[${sent.value - 1}]`
    sColor = C.tx
  } else {
    status = `第 ${sent.value} 字节：CPU 写 DR → 轮询 TXE → 轮询 RXNE → 读 DR，一个字节占满一整圈`
    sColor = C.cpu
  }
  L.add(
    new Konva.Text({
      x: x0,
      y: 248,
      width: x1 - x0,
      text: status,
      fontSize: 9.5,
      lineHeight: 1.35,
      fontFamily: FONT,
      fill: sColor,
    }),
  )

  L.draw()
}

/* ---------------- 交互 ---------------- */
function step() {
  if (done.value) return
  if (!armed.value) {
    // DMA 模式的第一步：配置两条通道
    configured.value = true
    buildScene()
    return
  }
  sent.value++
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
  sent.value = 0
  configured.value = false
  lastStep = 0
  acc = 0
  buildScene()
}

function setMode(toDma: boolean) {
  if (dma.value === toDma) return
  dma.value = toDma
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
    // 通道流动感：只改 dashOffset，不重建场景；两条反向
    if (txLine && rxLine) {
      const o = (frame.time * 0.05) % 18
      txLine.dashOffset(-o)
      rxLine.dashOffset(o)
      layer?.batchDraw()
    }
    if (!playing.value) {
      lastStep = frame.time
      return
    }
    const interval = 640 / speed.value
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
          <AppIcon name="bolt" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">SPI + DMA 双向传输 · 交互式动画</span>
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
      <span class="text-[11px] text-ink-400">搬法</span>
      <button
        v-for="m in [
          { d: true, t: 'DMA 双向' },
          { d: false, t: '轮询逐字节' },
        ]"
        :key="String(m.d)"
        class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
        :class="dma === m.d ? 'bg-violet-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
        @click="setMode(m.d)"
      >
        {{ m.t }}
      </button>
      <span class="text-[11px] text-ink-400">
        当前：<b class="font-mono text-violet-700">{{ modeText }}</b>
        　已交换 {{ sent }} / 8 字节
      </span>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">SCK</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">9 MHz</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">已交换</div>
        <div class="mt-0.5 font-mono text-base font-bold text-violet-700">
          {{ sent }} <span class="text-xs font-normal text-ink-400">/ 8</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">8 字节耗时</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ ((8 * 8) / 9).toFixed(1) }} <span class="text-xs font-normal text-ink-400">µs</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">CPU 占用</div>
        <div class="mt-0.5 font-mono text-base font-bold" :class="dma ? 'text-emerald-600' : 'text-amber-600'">
          {{ dma ? '仅配置' : '100%' }}
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        SPI 是<b class="text-ink-700">全双工</b>：主机发一个字节的同一条时钟节拍里，从机也在回一个字节。
        所以读 Flash 时 <code class="rounded bg-slate-100 px-1 font-mono text-[11px]">HAL_SPI_TransmitReceive_DMA()</code>
        才是正解——TX、RX 两条 DMA 通道同时开工，8 个字节在 7 µs 内换完，CPU 全程不参与。
      </p>
      <p class="text-ink-400">
        提示：切到 <b>轮询逐字节</b> 看底部两条 CPU 占用条——同样的 8 个字节，轮询要吃掉 8 段 CPU 时间；
        再用 <b>单步</b> 走到第 7 个字节，注意 RX 从这一格才出现有效数据（前面都在命令/地址阶段）。
      </p>
    </div>
  </div>
</template>
