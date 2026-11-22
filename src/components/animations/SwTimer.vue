<script setup lang="ts">
/**
 * 交互式动画 ⑲：FreeRTOS 软件定时器与守护任务
 * ------------------------------------------------------------------
 * 场景：SysTick 每 1 个 tick 递增 xTickCount；软件定时器并不占用硬件定时器，
 *       而是由优先级最高的「守护任务（Timer Service Task）」在每次 tick 后
 *       巡检一条定时器链，谁到期就调用谁的回调。
 * 画布内容：
 *   - 左上：SysTick 中断卡（xTickCount 递增）
 *   - 右上：守护任务卡（唤醒 / 遍历 / 执行回调，回调跑在任务上下文）
 *   - 中部：三个定时器行 —— 周期 100 ms、单次 150 ms、周期 200 ms，
 *           每行有剩余时间进度条与状态标签
 *   - 底部：回调执行日志（最近两条），格式为「时刻 · 谁触发了什么」
 * 交互：
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 *   - 单步一次 = 走过 50 ms
 * 设计要点：
 *   - 周期定时器到期后自动重装 remaining = period，永远活着
 *   - 单次定时器到期后 alive=false，从链上摘掉，不再参与巡检
 *   - 回调在守护任务里跑：里面写 vTaskDelay 或死等，会让所有定时器一起迟到
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 常量 ---------------- */
const H = 258
const STEP_MS = 50 // 单步代表的时间

const playing = ref(true)
const speed = ref(1)
const now = ref(0) // 已走过的毫秒数
const ticks = ref(0) // xTickCount
const fired = ref(0) // 累计触发次数
const busy = ref(false) // 守护任务本拍是否执行了回调

interface SoftTimer {
  key: string
  period: number
  remaining: number
  periodic: boolean
  alive: boolean
  runs: number
  color: string
}

let timers: SoftTimer[] = []
let logs: string[] = []

function initTimers() {
  timers = [
    { key: 'T1', period: 100, remaining: 100, periodic: true, alive: true, runs: 0, color: '#059669' },
    { key: 'T2', period: 150, remaining: 150, periodic: false, alive: true, runs: 0, color: '#d97706' },
    { key: 'T3', period: 200, remaining: 200, periodic: true, alive: true, runs: 0, color: '#7c3aed' },
  ]
}
initTimers()

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  tick: '#0891b2',
  daemon: '#2563eb',
  hi: '#dc2626',
  ok: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
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
  if (!w || w < 40) {
    L.draw()
    return
  }

  const x0 = 14
  const x1 = w - 14
  const gap = 10
  const cardW = (x1 - x0 - gap) / 2
  const compact = w < 430

  /* ---------- 标题 ---------- */
  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: '软件定时器：回调跑在守护任务里，不是跑在中断里',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- SysTick 卡 ---------- */
  const cardY = 29
  const cardH = 48
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
      text: 'SysTick 中断（1 ms）',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.tick,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: cardY + 21,
      text: `xTickCount = ${ticks.value}`,
      fontSize: 10,
      fontFamily: FONT,
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: cardY + 35,
      text: compact ? '只做 +1 和唤醒守护' : '只做两件事：+1、唤醒守护任务',
      fontSize: 8,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 守护任务卡 ---------- */
  const dx = x0 + cardW + gap
  L.add(
    new Konva.Rect({
      x: dx,
      y: cardY,
      width: cardW,
      height: cardH,
      fill: busy.value ? '#eff6ff' : '#f8fafc',
      stroke: busy.value ? '#bfdbfe' : '#e2e8f0',
      strokeWidth: busy.value ? 1.6 : 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Text({
      x: dx + 9,
      y: cardY + 6,
      text: '守护任务 Timer Task',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.daemon,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: dx + 9,
      y: cardY + 21,
      text: busy.value ? '正在执行回调…' : '阻塞等下一次到期',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: busy.value ? C.daemon : C.text,
      fontStyle: busy.value ? 'bold' : 'normal',
    }),
  )
  L.add(
    new Konva.Text({
      x: dx + 9,
      y: cardY + 35,
      text: `已处理 ${fired.value} 次回调`,
      fontSize: 8,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 三个定时器 ---------- */
  // 每行三段：标题行（徽标 + 周期 + 状态）/ 整宽进度条 / 剩余与触发次数
  const rowY0 = 86
  const rowH = 38

  timers.forEach((t, i) => {
    const ry = rowY0 + i * rowH
    const ratio = t.alive ? Math.max(0, Math.min(1, t.remaining / t.period)) : 0

    L.add(
      new Konva.Rect({
        x: x0,
        y: ry,
        width: 20,
        height: 18,
        fill: t.alive ? t.color : '#cbd5e1',
        cornerRadius: 4,
      }),
    )
    L.add(
      new Konva.Text({
        x: x0,
        y: ry + 4,
        width: 20,
        align: 'center',
        text: t.key,
        fontSize: 9,
        fontFamily: FONT,
        fill: '#ffffff',
        fontStyle: 'bold',
      }),
    )
    L.add(
      new Konva.Text({
        x: x0 + 26,
        y: ry + 3,
        text: `${t.period} ms · ${t.periodic ? '周期' : '单次'}`,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: t.alive ? C.strong : C.dim,
      }),
    )
    // 右上角：运行 / 停止
    L.add(
      new Konva.Text({
        x: x1 - 50,
        y: ry + 3,
        width: 50,
        align: 'right',
        text: t.alive ? '运行中' : '已摘除',
        fontSize: 8.5,
        fontFamily: FONT,
        fill: t.alive ? t.color : C.dim,
        fontStyle: t.alive ? 'bold' : 'normal',
      }),
    )

    // 整宽进度条（下半行，不与文字抢位置）
    L.add(
      new Konva.Rect({
        x: x0,
        y: ry + 14,
        width: x1 - x0,
        height: 5,
        fill: '#eef2f7',
        stroke: C.grid,
        strokeWidth: 0.8,
        cornerRadius: 3,
      }),
    )
    if (ratio > 0.03) {
      L.add(
        new Konva.Rect({
          x: x0 + 1,
          y: ry + 15,
          width: Math.max(2, (x1 - x0 - 2) * ratio),
          height: 3,
          fill: t.alive ? t.color : '#cbd5e1',
          cornerRadius: 2,
        }),
      )
    }
    L.add(
      new Konva.Text({
        x: x0,
        y: ry + 25,
        text: t.alive
          ? `剩余 ${t.remaining} ms${t.runs > 0 ? ` · 已触发 ${t.runs} 次` : ''}`
          : '单次定时器已到期，自动从链表摘除',
        fontSize: 7.5,
        fontFamily: FONT,
        fill: t.alive ? C.text : C.dim,
      }),
    )
  })

  /* ---------- 回调日志 ---------- */
  const ly = 202
  L.add(
    new Konva.Text({
      x: x0,
      y: ly,
      text: '回调日志',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.text,
      fontStyle: 'bold',
    }),
  )
  const shown = logs.slice(-2)
  if (shown.length === 0) {
    L.add(
      new Konva.Text({
        x: x0 + 48,
        y: ly,
        text: '（还没有到期，再等等）',
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
  }
  shown.forEach((line, i) => {
    L.add(
      new Konva.Text({
        x: x0 + 48,
        y: ly + i * 13,
        width: x1 - x0 - 48,
        text: line,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: i === shown.length - 1 ? C.strong : C.dim,
        fontStyle: i === shown.length - 1 ? 'bold' : 'normal',
      }),
    )
  })

  /* ---------- 状态栏 ---------- */
  L.add(
    new Konva.Text({
      x: x0,
      y: 234,
      width: x1 - x0,
      text: busy.value
        ? '回调正在守护任务上下文里执行 —— 此刻它若阻塞，T1/T2/T3 会全体迟到'
        : `t = ${now.value} ms，守护任务回到阻塞态，等下一个 tick 把它叫醒`,
      fontSize: 9.5,
      lineHeight: 1.25,
      fontFamily: FONT,
      fill: busy.value ? C.hi : C.text,
      fontStyle: busy.value ? 'bold' : 'normal',
    }),
  )

  L.draw()
}

/* ---------------- 交互 ---------------- */
function step() {
  now.value += STEP_MS
  ticks.value += STEP_MS // 假设 1 tick = 1 ms

  let did = false
  timers.forEach((t) => {
    if (!t.alive) return
    t.remaining -= STEP_MS
    if (t.remaining <= 0) {
      t.runs++
      fired.value++
      did = true
      logs.push(`${now.value} ms · ${t.key} 到期 → 执行回调（第 ${t.runs} 次）`)
      if (t.periodic) {
        // 周期定时器重装，误差只体现在「整拍对齐」上
        t.remaining += t.period
      } else {
        t.alive = false
        t.remaining = 0
        logs.push(`${now.value} ms · ${t.key} 是单次定时器，执行后自动摘除`)
      }
    }
  })
  if (logs.length > 8) logs = logs.slice(-8)
  busy.value = did
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
  initTimers()
  logs = []
  now.value = 0
  ticks.value = 0
  fired.value = 0
  busy.value = false
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
    const interval = 640 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
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
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-white">
          <AppIcon name="clock" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">软件定时器 · 交互式动画</span>
        <span class="tag bg-emerald-50 text-emerald-700">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-ghost btn-sm" @click="togglePlay">
          <AppIcon :name="playing ? 'clock' : 'play'" :size="13" />
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button class="btn-ghost btn-sm" @click="step">
          <AppIcon name="chevron-right" :size="13" />
          单步 50ms
        </button>
        <button class="btn-ghost btn-sm" @click="reset">
          <AppIcon name="refresh" :size="13" />
          复位
        </button>
        <button
          v-for="s in [1, 2, 4]"
          :key="s"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="speed === s ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前时刻</div>
        <div class="mt-0.5 font-mono text-base font-bold text-cyan-700">{{ now }} ms</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">xTickCount</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ ticks }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">回调次数</div>
        <div class="mt-0.5 font-mono text-base font-bold text-emerald-600">{{ fired }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">守护任务</div>
        <div class="mt-0.5 font-mono text-sm font-bold" :class="busy ? 'text-rose-600' : 'text-ink-500'">
          {{ busy ? '执行回调' : '阻塞' }}
        </div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        软件定时器的「软件」二字有两层意思：<b class="text-ink-700">不占用硬件定时器</b>（全靠
        SysTick 的 tick 计数推时间），<b class="text-ink-700">回调不在中断里执行</b>（在守护任务里
        按任务优先级排队跑）。代价是精度只到 1 个 tick，而且所有回调互相排队。
      </p>
      <p class="text-ink-400">
        看 T2：它是单次定时器，150 ms 触发一次就从链上摘掉，进度条变灰再也不会回来。T1 每 100 ms
        重装一次，永远活着。这就是 `xTimerStart` 与 `xTimerStartOnce` 的差别。
      </p>
    </div>
  </div>
</template>
