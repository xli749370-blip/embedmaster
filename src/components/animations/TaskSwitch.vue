<script setup lang="ts">
/**
 * 交互式动画 ⑦：上下文切换与任务栈（Konva）
 * ------------------------------------------------------------------
 * 画布内容：
 *   - 顶部时间轴甘特图：两个任务（A 绿 / B 橙）按轮转调度交替占用时隙，
 *     已执行的时隙实色、未执行的半透明，白色竖线为当前时隙游标
 *   - 中部状态栏：说明当前时隙的动作（运行 / 切换：保存现场 → 恢复现场）
 *   - 底部两个任务栈：当前运行任务的栈高亮，呈现"上下文被压入"的概念
 * 交互：
 *   - 播放 / 暂停：自动按节拍推进时隙
 *   - 单步：手动推进一个时隙
 *   - 复位：回到时隙 0
 *   - 速度：1x / 2x / 4x 调节推进节拍
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */
const TOTAL_TICKS = 24
const SLICE = 4 // 每个任务连续运行的时隙数（轮转周期 = 2*SLICE）

const playing = ref(true)
const speed = ref(1) // 1x / 2x / 4x
const tick = ref(0)
const switchCount = ref(0)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  A: '#059669', // 任务 A：翠绿
  B: '#d97706', // 任务 B：橙
  axis: '#94a3b8',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#eef2f7',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
}

/* 时隙 i 归属哪个任务 */
function ownerOf(i: number): 'A' | 'B' {
  return i % (2 * SLICE) < SLICE ? 'A' : 'B'
}

let prevOwner: 'A' | 'B' = 'A'

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

let lastStep = 0
let acc = 0

const H = 330
let plot = { x0: 0, x1: 0 }

/** 推进一步（一个时隙） */
function step() {
  const cur = ownerOf(tick.value)
  let next = tick.value + 1
  if (next >= TOTAL_TICKS) next = 0
  const nxt = ownerOf(next)
  if (nxt !== cur) switchCount.value++
  tick.value = next
  prevOwner = nxt
  draw()
}

/** 当前时隙的状态文案 */
function statusText(): string {
  const t = tick.value
  const cur = ownerOf(t)
  const prev = ownerOf((t - 1 + TOTAL_TICKS) % TOTAL_TICKS)
  if (cur !== prev) {
    return `t=${t} 时间片到期 → 保存任务${prev}上下文，恢复任务${cur}现场（切换 #${switchCount.value}）`
  }
  if (t % SLICE === 0) {
    return `t=${t} 任务${cur} 开始运行（本轮时间片 ${SLICE} 拍）`
  }
  const inSlice = (cur === 'A' ? t % (2 * SLICE) : t % (2 * SLICE) - SLICE) + 1
  return `t=${t} 任务${cur} 运行中…（第 ${inSlice} / ${SLICE} 拍）`
}

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()

  const w = S.width()
  // 与既有动画一致：窄屏重排瞬间宽度被量到几十像素时跳过，等 ResizeObserver 拿到最终宽度再重建
  if (w < 240) {
    L.draw()
    return
  }

  const padL = 16
  const padR = 16
  plot = { x0: padL, x1: w - padR }

  const { x0, x1 } = plot
  const slotW = (x1 - x0) / TOTAL_TICKS

  /* ---- 时间轴：两行甘特 ---- */
  const laneY = [26, 58] // A 上行、B 下行
  const laneH = 26
  // 标签
  L.add(new Konva.Text({ x: x0, y: 18, text: '调度时间轴（轮转，每任务 ' + SLICE + ' 拍）', fontSize: 11, fontFamily: FONT, fill: C.text }))
  L.add(new Konva.Text({ x: x0, y: laneY[0] + 4, text: 'A', fontSize: 12, fontStyle: 'bold', fontFamily: FONT, fill: C.A }))
  L.add(new Konva.Text({ x: x0, y: laneY[1] + 4, text: 'B', fontSize: 12, fontStyle: 'bold', fontFamily: FONT, fill: C.B }))

  const ganttX = x0 + 22
  const ganttW = x1 - ganttX
  const gSlot = ganttW / TOTAL_TICKS
  const gLaneY = [laneY[0], laneY[1]]

  for (let i = 0; i < TOTAL_TICKS; i++) {
    const owner = ownerOf(i)
    const li = owner === 'A' ? 0 : 1
    const executed = i <= tick.value
    const isCur = i === tick.value
    L.add(
      new Konva.Rect({
        x: ganttX + i * gSlot + 1,
        y: gLaneY[li],
        width: gSlot - 2,
        height: laneH - 2,
        fill: owner === 'A' ? C.A : C.B,
        opacity: executed ? (isCur ? 1 : 0.85) : 0.22,
        cornerRadius: 3,
        stroke: isCur ? '#0f172a' : undefined,
        strokeWidth: isCur ? 1.5 : 0,
      }),
    )
  }
  // 当前时隙游标
  L.add(
    new Konva.Line({
      points: [ganttX + tick.value * gSlot + gSlot / 2, gLaneY[0] - 4, ganttX + tick.value * gSlot + gSlot / 2, gLaneY[1] + laneH + 4],
      stroke: '#0f172a',
      strokeWidth: 1.5,
      dash: [3, 3],
    }),
  )
  void slotW

  /* ---- 状态栏 ---- */
  const statusY = 104
  L.add(
    new Konva.Rect({ x: x0, y: statusY, width: x1 - x0, height: 30, fill: '#f8fafc', stroke: C.gridStrong, strokeWidth: 1, cornerRadius: 8 }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 12,
      y: statusY + 8,
      width: x1 - x0 - 24,
      text: statusText(),
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.strong,
    }),
  )

  /* ---- 两个任务栈 ---- */
  const stackTop = 156
  const stackH = 120
  const colW = (x1 - x0 - 24) / 2
  const regs = ['PC', 'LR', 'R12', 'R3', 'R2', 'R1', 'R0', 'xPSR']
  const drawStack = (colIdx: 0 | 1, owner: 'A' | 'B') => {
    const sx = x0 + colIdx * (colW + 24)
    const running = ownerOf(tick.value) === owner
    const color = owner === 'A' ? C.A : C.B
    L.add(
      new Konva.Text({ x: sx, y: stackTop - 20, text: `任务${owner} 栈`, fontSize: 12, fontStyle: 'bold', fontFamily: FONT, fill: color }),
    )
    L.add(
      new Konva.Rect({
        x: sx,
        y: stackTop,
        width: colW,
        height: stackH,
        fill: running ? color + '14' : '#f8fafc',
        stroke: running ? color : C.gridStrong,
        strokeWidth: running ? 2 : 1,
        cornerRadius: 8,
      }),
    )
    // 寄存器格
    const n = regs.length
    const cellH = (stackH - 12) / n
    for (let k = 0; k < n; k++) {
      L.add(
        new Konva.Rect({
          x: sx + 8,
          y: stackTop + 6 + k * cellH,
          width: colW - 16,
          height: cellH - 4,
          fill: running ? color + '22' : '#eef2f7',
          cornerRadius: 4,
        }),
      )
      L.add(
        new Konva.Text({
          x: sx + 14,
          y: stackTop + 6 + k * cellH + (cellH - 4) / 2 - 6,
          text: regs[k],
          fontSize: 10.5,
          fontFamily: FONT,
          fill: running ? color : C.dim,
          fontStyle: running ? 'bold' : 'normal',
        }),
      )
    }
    if (running) {
      L.add(
        new Konva.Text({ x: sx + colW - 56, y: stackTop - 20, text: '▲ 运行中', fontSize: 10, fontFamily: FONT, fill: color }),
      )
    }
  }
  drawStack(0, 'A')
  drawStack(1, 'B')

  L.draw()
}

/** 重画（参数/时隙变化时调用） */
function draw() {
  buildScene()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) lastStep = 0
}

function reset() {
  tick.value = 0
  prevOwner = 'A'
  switchCount.value = 0
  lastStep = 0
  acc = 0
  draw()
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
    if (!playing.value) {
      lastStep = frame.time
      return
    }
    const interval = 750 / speed.value
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

watch(() => speed.value, () => {
  lastStep = 0
  acc = 0
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-white">
          <AppIcon name="layers" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">上下文切换与任务栈 · 交互式动画</span>
        <span class="tag bg-emerald-50 text-emerald-700">Konva</span>
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

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前时隙</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ tick }} <span class="text-xs font-normal text-ink-400">/ {{ TOTAL_TICKS - 1 }}</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">运行任务</div>
        <div class="mt-0.5 font-mono text-base font-bold" :class="ownerOf(tick) === 'A' ? 'text-emerald-600' : 'text-amber-600'">
          任务{{ ownerOf(tick) }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">上下文切换</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ switchCount }} <span class="text-xs font-normal text-ink-400">次</span></div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">速度</div>
        <div class="mt-0.5 flex gap-1">
          <button
            v-for="s in [1, 2, 4]"
            :key="s"
            class="rounded px-1.5 py-0.5 text-xs font-bold transition-colors"
            :class="speed === s ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
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
        轮转调度下，任务 A 与 B 各连续运行 <span class="font-mono font-semibold text-ink-700">{{ SLICE }}</span> 个时隙后切换。每次切换都要
        <b class="text-emerald-700">保存当前任务的寄存器现场到它自己的栈</b>，再
        <b class="text-amber-700">从另一个任务的栈恢复现场</b>——这就是上下文切换的本质。
      </p>
      <p class="text-ink-400">
        提示：把速度调到 1x、点「单步」逐拍观察，能看清切换恰好发生在时间片边界；切换次数会实时累计。
      </p>
    </div>
  </div>
</template>
