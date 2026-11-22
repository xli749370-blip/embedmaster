<script setup lang="ts">
/**
 * 交互式动画 ⑧：数据采集到上报的数据流（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 顶部四个 RTOS 任务块：sensor_task / report_task / battery_task / led_task，
 *     标注优先级；当前活跃任务随数据流阶段高亮
 *   - 中部数据管道：传感器 → 队列 → 上报任务 → UART → 蓝牙模块 → 手机，
 *     彩色脉冲沿管道流动，直观体现「采集与上报经队列平滑衔接」
 *   - 底部状态栏：说明当前阶段的数据在做什么
 * 交互：
 *   - 播放 / 暂停：自动按节拍推进数据流
 *   - 单步：手动推进一个节点
 *   - 复位：回到起点
 *   - 速度：1x / 2x / 4x 调节流速
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const NODES = ['传感器', '队列', '上报任务', 'UART', '蓝牙模块', '手机']
const NODE_F = [0, 0.2, 0.4, 0.6, 0.8, 1.0] // 节点在管道上的归一化位置

const TASKS = [
  { key: 'sensor', name: 'sensor_task', prio: '中', color: '#0891b2' },
  { key: 'report', name: 'report_task', prio: '高', color: '#d97706' },
  { key: 'battery', name: 'battery_task', prio: '低', color: '#64748b' },
  { key: 'led', name: 'led_task', prio: '低', color: '#64748b' },
]

const playing = ref(true)
const speed = ref(1) // 1x / 2x / 4x
const pos = ref(0) // 数据流头部进度 0..1
const cycle = ref(0) // 已完成的流循环次数

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  axis: '#94a3b8',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
  pipe: '#cbd5e1',
  pulse: '#e11d48',
}

/* 当前阶段描述 */
function stageInfo(): { label: string; activeTask: string } {
  const p = pos.value
  if (p < 0.2) return { label: '传感器测量：sensor_task 触发 SHT30，读取温湿度原始值', activeTask: 'sensor' }
  if (p < 0.4) return { label: '入队：采样数据写入 data_q，发送方与接收方解耦', activeTask: 'sensor' }
  if (p < 0.8) return { label: '上报任务处理：report_task 从队列取出数据，组帧并经 UART 发出', activeTask: 'report' }
  return { label: '空中传输：蓝牙模块把帧发给手机，联调解析完成', activeTask: 'report' }
}

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

let lastTime = 0
const BASE_RATE = 1 / 3500 // 1x 下约 3.5s 走完一程

const H = 340

function activeTaskKey(): string {
  return stageInfo().activeTask
}

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()

  const w = S.width()
  // 窄屏重排瞬间宽度被量到几十像素时跳过，等 ResizeObserver 拿到最终宽度再重建
  if (w < 240) {
    L.draw()
    return
  }

  const padL = 16
  const padR = 16
  const x0 = padL
  const x1 = w - padR
  const pw = x1 - x0

  /* ---- 顶部任务块 ---- */
  const blockY = 22
  const blockH = 48
  const gap = 12
  const blockW = (pw - gap * (TASKS.length - 1)) / TASKS.length
  const active = activeTaskKey()
  TASKS.forEach((t, i) => {
    const bx = x0 + i * (blockW + gap)
    const isActive = t.key === active
    const isReport = t.key === 'report' || t.key === 'sensor'
    L.add(
      new Konva.Rect({
        x: bx,
        y: blockY,
        width: blockW,
        height: blockH,
        fill: isActive ? t.color + '1f' : '#f8fafc',
        stroke: isActive ? t.color : C.gridStrong,
        strokeWidth: isActive ? 2 : 1,
        cornerRadius: 10,
      }),
    )
    L.add(
      new Konva.Text({ x: bx + 10, y: blockY + 8, text: t.name, fontSize: 11.5, fontStyle: isActive ? 'bold' : 'normal', fontFamily: FONT, fill: isActive ? t.color : C.strong }),
    )
    L.add(
      new Konva.Text({ x: bx + 10, y: blockY + 26, text: '优先级 ' + t.prio, fontSize: 10, fontFamily: FONT, fill: isActive ? t.color : C.dim }),
    )
    if (!isReport) {
      L.add(new Konva.Text({ x: bx + blockW - 16, y: blockY + 6, text: '·', fontSize: 14, fontFamily: FONT, fill: C.dim }))
    }
  })
  L.add(new Konva.Text({ x: x0, y: blockY + blockH + 6, text: 'RTOS 任务（当前活跃者高亮，battery/led 按自身周期后台运行）', fontSize: 10.5, fontFamily: FONT, fill: C.text }))

  /* ---- 管道 ---- */
  const pipeY = 168
  L.add(new Konva.Text({ x: x0, y: 140, text: '数据管道：采集 → 队列 → 上报 → UART → 蓝牙 → 手机', fontSize: 11, fontFamily: FONT, fill: C.text }))

  // 连接线段
  for (let i = 0; i < NODES.length - 1; i++) {
    const ax = x0 + NODE_F[i] * pw
    const bx = x0 + NODE_F[i + 1] * pw
    L.add(new Konva.Line({ points: [ax, pipeY, bx, pipeY], stroke: C.pipe, strokeWidth: 6, lineCap: 'round' }))
  }
  // 节点
  NODES.forEach((n, i) => {
    const nx = x0 + NODE_F[i] * pw
    const isHead = Math.abs(pos.value - NODE_F[i]) < 0.06
    L.add(new Konva.Circle({ x: nx, y: pipeY, radius: isHead ? 11 : 9, fill: '#fff', stroke: isHead ? C.pulse : C.axis, strokeWidth: isHead ? 3 : 2 }))
    L.add(new Konva.Text({ x: nx - 30, y: pipeY + 14, width: 60, align: 'center', text: n, fontSize: 10.5, fontFamily: FONT, fill: C.strong }))
  })

  /* ---- 流动脉冲（头部 + 两条拖尾）---- */
  const drawPulse = (p: number, alpha: number, r: number) => {
    if (p < 0 || p > 1) return
    const px = x0 + p * pw
    L.add(new Konva.Circle({ x: px, y: pipeY, radius: r, fill: C.pulse, opacity: alpha }))
    // 光晕
    L.add(new Konva.Circle({ x: px, y: pipeY, radius: r + 5, fill: C.pulse, opacity: alpha * 0.25 }))
  }
  drawPulse(pos.value, 1, 7)
  drawPulse(pos.value - 0.12, 0.55, 5)
  drawPulse(pos.value - 0.24, 0.28, 4)

  /* ---- 手机端接收指示 ---- */
  const phoneX = x0 + pw
  const lit = pos.value > 0.92
  L.add(new Konva.Rect({ x: phoneX - 2, y: pipeY - 26, width: 4, height: 52, fill: lit ? '#10b981' : '#e2e8f0', cornerRadius: 2 }))
  L.add(new Konva.Text({ x: phoneX - 28, y: pipeY - 40, width: 60, align: 'center', text: lit ? '已收到 ✓' : '待接收', fontSize: 10, fontFamily: FONT, fill: lit ? '#10b981' : C.dim }))

  /* ---- 状态栏 ---- */
  const statusY = 244
  L.add(new Konva.Rect({ x: x0, y: statusY, width: pw, height: 30, fill: '#f8fafc', stroke: C.gridStrong, strokeWidth: 1, cornerRadius: 8 }))
  L.add(new Konva.Text({ x: x0 + 12, y: statusY + 8, width: pw - 24, text: stageInfo().label, fontSize: 11.5, fontFamily: FONT, fill: C.strong }))

  // 提示
  L.add(new Konva.Text({ x: x0, y: statusY + 44, width: pw, text: '采集与上报不是同时发生，而是经队列平滑衔接——这正是 RTOS 相比裸机轮询的核心价值。', fontSize: 10.5, fontFamily: FONT, fill: C.text }))

  L.draw()
}

function draw() {
  buildScene()
}

function stepOnce() {
  let next = pos.value + 0.2
  if (next >= 1) {
    next = 0
    cycle.value++
  }
  pos.value = next
  draw()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) lastTime = 0
}

function reset() {
  pos.value = 0
  cycle.value = 0
  lastTime = 0
  draw()
}

onMounted(() => {
  if (!wrapRef.value) return
  stage = new Konva.Stage({ container: wrapRef.value, width: wrapRef.value.clientWidth, height: H })
  layer = new Konva.Layer()
  stage.add(layer)
  buildScene()

  anim = new Konva.Animation((frame) => {
    if (!frame) return
    if (!playing.value) {
      lastTime = frame.time
      return
    }
    if (lastTime === 0) lastTime = frame.time
    const dt = frame.time - lastTime
    lastTime = frame.time
    const adv = dt * BASE_RATE * speed.value
    let np = pos.value + adv
    while (np >= 1) {
      np -= 1
      cycle.value++
    }
    pos.value = np
    draw()
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

watch(() => speed.value, () => {
  lastTime = 0
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-rose-600 text-white">
          <AppIcon name="bolt" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">数据采集到上报的数据流 · 交互式动画</span>
        <span class="tag bg-rose-50 text-rose-700">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-ghost btn-sm" @click="togglePlay">
          <AppIcon :name="playing ? 'clock' : 'play'" :size="13" />
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button class="btn-ghost btn-sm" @click="stepOnce">
          <AppIcon name="chevron-right" :size="13" />
          单步
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
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前阶段</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ stageInfo().label.split('：')[0] }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">活跃任务</div>
        <div class="mt-0.5 font-mono text-base font-bold text-rose-600">{{ activeTaskKey() }}_task</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">数据流周期</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ cycle }} <span class="text-xs font-normal text-ink-400">次</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">速度</div>
        <div class="mt-0.5 flex gap-1">
          <button
            v-for="s in [1, 2, 4]"
            :key="s"
            class="rounded px-1.5 py-0.5 text-xs font-bold transition-colors"
            :class="speed === s ? 'bg-rose-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
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
        顶部四个 RTOS 任务中，<b class="text-cyan-700">sensor_task</b> 采到数据后写入队列，
        <b class="text-amber-700">report_task</b> 从队列取出并组帧经 UART / 蓝牙发出——发送方与接收方互不知道对方存在。
      </p>
      <p class="text-ink-400">
        提示：把速度调到 1x、点「单步」逐节点观察，能看清数据如何「先入队、再被上报任务消费」；手机端在脉冲抵达时显示「已收到 ✓」。
      </p>
    </div>
  </div>
</template>
