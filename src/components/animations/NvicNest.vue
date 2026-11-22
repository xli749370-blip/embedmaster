<script setup lang="ts">
/**
 * 交互式动画 ⑪：NVIC 中断嵌套与抢占（Konva）
 * ------------------------------------------------------------------
 * 场景：主循环运行中，USART1（抢占 5）触发；执行到一半被 TIM1（抢占 1）抢占；
 *       TIM1 结束后恢复 USART1；最后回到主循环。稍后 EXTI0（抢占 15）再插入一次。
 * 画布内容：
 *   - 四条泳道（TIM1 / USART1 / EXTI0 / 主循环）的甘特图，已执行实色、未执行半透明
 *   - 当前节拍游标 + SR 状态栏文案
 *   - 底部嵌套深度指示
 * 交互：播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 场景 ---------------- */
type Ctx = 'tim' | 'usart' | 'exti' | 'main'

const TOTAL = 40
const H = 300

const LANES: Array<{ key: Ctx; label: string; prio: string; color: string }> = [
  { key: 'tim', label: 'TIM1', prio: '抢占 1', color: '#dc2626' },
  { key: 'usart', label: 'USART1', prio: '抢占 5', color: '#2563eb' },
  { key: 'exti', label: 'EXTI0', prio: '抢占 15', color: '#d97706' },
  { key: 'main', label: '主循环', prio: '后台', color: '#64748b' },
]

/** 每一拍由谁执行 */
function ownerOf(t: number): Ctx {
  if (t < 5) return 'main'
  if (t < 7) return 'usart'
  if (t < 10) return 'tim'
  if (t < 12) return 'usart'
  if (t < 19) return 'main'
  if (t < 24) return 'exti'
  return 'main'
}

function ctxLabel(c: Ctx): string {
  const l = LANES.find((x) => x.key === c)
  return l ? l.label : c
}

function depthOf(t: number): number {
  const c = ownerOf(t)
  if (c === 'tim') return 2
  if (c === 'usart' || c === 'exti') return 1
  return 0
}

const playing = ref(true)
const speed = ref(1)
const tick = ref(0)
const preempt = ref(0)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
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

let lastStep = 0
let acc = 0

/* ---------------- 状态文案 ---------------- */
const statusText = computed(() => {
  const t = tick.value
  const cur = ownerOf(t)
  const prev = ownerOf((t - 1 + TOTAL) % TOTAL)
  if (cur !== prev) {
    if (cur === 'tim') return `t=${t}  TIM1（抢占 1）打断 USART1（抢占 5）→ 嵌套深度 2，压入新现场`
    if (cur === 'usart' && prev === 'tim') return `t=${t}  TIM1 结束，弹栈恢复 USART1 现场 → 嵌套深度 1`
    if (cur === 'usart') return `t=${t}  USART1 触发，主循环被挂起，保存现场 → 嵌套深度 1`
    if (cur === 'main' && prev === 'usart') return `t=${t}  USART1 结束，返回主循环`
    if (cur === 'exti') return `t=${t}  EXTI0（抢占 15）触发，主循环被中断 → 嵌套深度 1`
    if (cur === 'main' && prev === 'exti') return `t=${t}  EXTI0 结束，返回主循环`
    return `t=${t}  切换到 ${ctxLabel(cur)}`
  }
  if (cur === 'tim') return `t=${t}  TIM1 执行中…（两段 ISR 嵌套，最后触发的先返回）`
  if (cur === 'usart') return `t=${t}  USART1 执行中…（若此刻再来更高优先级仍可再抢占）`
  if (cur === 'exti') return `t=${t}  EXTI0 执行中…（数值 15 最低，谁都能打断它）`
  return `t=${t}  主循环执行中…（后台任务，任何中断都能打断）`
})

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

  const wx0 = 78
  const wx1 = w - 14
  const tickW = (wx1 - wx0) / TOTAL
  const laneTop = 52
  const laneGap = 38
  const laneH = 26

  /* 标题 */
  L.add(
    new Konva.Text({
      x: 16,
      y: 12,
      text: 'NVIC 抢占式嵌套（数值越小优先级越高）',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* 时间刻度 */
  for (let t = 0; t <= TOTAL; t += 5) {
    const x = wx0 + t * tickW
    L.add(
      new Konva.Line({
        points: [x, 34, x, laneTop + 4 * laneGap - 8],
        stroke: C.grid,
        strokeWidth: 1,
        dash: [2, 4],
      }),
    )
    L.add(
      new Konva.Text({
        x: x - 5,
        y: 26,
        text: String(t),
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
  }

  /* 泳道 */
  LANES.forEach((lane, li) => {
    const y = laneTop + li * laneGap

    // 泳道底
    L.add(
      new Konva.Rect({
        x: wx0,
        y,
        width: wx1 - wx0,
        height: laneH,
        fill: '#fbfcfe',
        stroke: C.gridStrong,
        strokeWidth: 1,
        cornerRadius: 4,
      }),
    )

    // 标签
    L.add(
      new Konva.Text({
        x: 8,
        y: y + 2,
        text: lane.label,
        fontSize: 9.5,
        fontFamily: FONT,
        fill: lane.color,
        fontStyle: 'bold',
      }),
    )
    L.add(
      new Konva.Text({
        x: 8,
        y: y + 12,
        text: lane.prio,
        fontSize: 8,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )

    // 执行块
    for (let t = 0; t < TOTAL; t++) {
      if (ownerOf(t) !== lane.key) continue
      const executed = t <= tick.value
      const isCur = t === tick.value
      L.add(
        new Konva.Rect({
          x: wx0 + t * tickW + 0.5,
          y: y + 2,
          width: tickW - 1,
          height: laneH - 4,
          fill: lane.color,
          opacity: executed ? (isCur ? 1 : 0.82) : 0.24,
          cornerRadius: 2,
          stroke: isCur ? C.strong : undefined,
          strokeWidth: isCur ? 1.4 : 0,
        }),
      )
    }
  })

  /* 当前节拍游标 */
  const curX = wx0 + tick.value * tickW + tickW / 2
  L.add(
    new Konva.Line({
      points: [curX, 30, curX, laneTop + 4 * laneGap - 4],
      stroke: C.strong,
      strokeWidth: 1.5,
      dash: [3, 3],
    }),
  )

  /* 状态栏 */
  const sy = 200
  L.add(
    new Konva.Rect({
      x: 14,
      y: sy,
      width: w - 28,
      height: 46,
      fill: C.panel,
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 8,
    }),
  )
  const curColor = LANES.find((l) => l.key === ownerOf(tick.value))?.color || C.strong
  L.add(
    new Konva.Text({
      x: 26,
      y: sy + 8,
      width: w - 52,
      text: statusText.value,
      fontSize: 10,
      lineHeight: 1.35,
      fontFamily: FONT,
      fill: curColor,
    }),
  )

  /* 嵌套深度 */
  const dy = 252
  L.add(
    new Konva.Text({
      x: 16,
      y: dy + 3,
      text: '嵌套深度',
      fontSize: 10,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  const d = depthOf(tick.value)
  for (let i = 0; i < 3; i++) {
    L.add(
      new Konva.Rect({
        x: 78 + i * 26,
        y: dy,
        width: 20,
        height: 16,
        fill: i < d ? ['#2563eb', '#dc2626', '#7c3aed'][i] : '#eef2f7',
        stroke: i < d ? 'transparent' : C.gridStrong,
        strokeWidth: 1,
        cornerRadius: 3,
      }),
    )
  }
  L.add(
    new Konva.Text({
      x: 160,
      y: dy + 3,
      text: d === 0 ? '无中断，跑后台' : d === 1 ? '一层中断' : '两层嵌套（TIM1 抢了 USART1）',
      fontSize: 10,
      fontFamily: FONT,
      fill: d === 0 ? C.dim : C.strong,
    }),
  )

  L.draw()
}

function draw() {
  buildScene()
}

/* ---------------- 交互 ---------------- */
function step() {
  const next = (tick.value + 1) % TOTAL
  if (next === 7) preempt.value++
  tick.value = next
  draw()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) lastStep = 0
}

function reset() {
  tick.value = 0
  preempt.value = 0
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
    const interval = 420 / speed.value
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-rose-600 text-white">
          <AppIcon name="bolt" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">中断嵌套与抢占 · 交互式动画</span>
        <span class="tag bg-rose-50 text-rose-700">Konva</span>
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
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前执行</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ ctxLabel(ownerOf(tick)) }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">嵌套深度</div>
        <div class="mt-0.5 font-mono text-base font-bold text-rose-600">{{ depthOf(tick) }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">抢占次数</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ preempt }} <span class="text-xs font-normal text-ink-400">次</span>
        </div>
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
        <b class="text-ink-700">抢占优先级</b>决定一个中断能否打断另一个正在执行的中断。
        TIM1（抢占 1）能打断 USART1（抢占 5），反过来不行；两者结束后按
        <b class="text-rose-700">后进先出</b>的顺序逐层返回。
      </p>
      <p>
        <b class="text-ink-700">子优先级</b>只在多个中断同时挂起时决定谁先执行，<b>不能打断</b>。
        工程上建议统一用 <span class="font-mono">NVIC_PRIORITYGROUP_4</span>（4 位全给抢占），规则只剩一条：数值小的能打断数值大的。
      </p>
      <p class="text-ink-400">
        提示：点「单步」逐拍走，注意 t=7 时 TIM1 插进来、t=10 时弹栈回到 USART1；嵌套深度会实时变化。
      </p>
    </div>
  </div>
</template>
