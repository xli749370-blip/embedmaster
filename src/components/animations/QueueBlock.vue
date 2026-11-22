<script setup lang="ts">
/**
 * 交互式动画 ⑭：FreeRTOS 队列阻塞与唤醒（Konva）
 * ------------------------------------------------------------------
 * 场景（16 拍循环，一个完整的生产者-消费者回合）：
 *   ① 队列空 → Worker 调 xQueueReceive 阻塞，让出 CPU（不是死等！）
 *   ② 传感器 ISR 触发，xQueueSendFromISR 入队
 *   ③ 内核把 Worker 从阻塞列表挪到就绪列表（Blocked → Ready）
 *   ④ 调度器切过去，Worker 取走数据（队列又空），处理完继续取 → 再次阻塞
 * 画布内容：
 *   - 队列八格：有数据填充、空则虚线
 *   - Worker 状态卡：Running / Blocked / Ready / 处理中，右侧同步显示当前 API
 *   - 状态时间轴：16 拍按状态着色，入队的那几拍上方标红色 ISR 三角
 *   - 底部一句话解释当前发生了什么
 * 交互：播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 * 设计要点：
 *   - 阻塞不是「循环里傻等」，而是把任务移出就绪列表、CPU 去跑别人（或进 WFI）
 *   - 唤醒是 ISR 里发起的，但真正的任务切换要等退出 ISR 后由调度器完成
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 场景脚本 ---------------- */
type WState = 'running' | 'blocked' | 'ready' | 'process' | 'idle'

const STEPS: Array<{ q: number; w: WState; note: string }> = [
  { q: 0, w: 'running', note: 'Worker 跑完上一轮，回头再调用 xQueueReceive 取数据' },
  { q: 0, w: 'blocked', note: '队列空 → Worker 挂进阻塞列表，让出 CPU（不是死循环等待）' },
  { q: 0, w: 'blocked', note: 'CPU 转去跑别的任务或进 WFI 低功耗，Worker 一动不动' },
  { q: 0, w: 'blocked', note: '传感器转换完成，ISR 抢占进来（生产者开始工作）' },
  { q: 1, w: 'blocked', note: 'xQueueSendFromISR 入队 1 个 → 队列从空变成非空' },
  { q: 1, w: 'ready', note: '内核把 Worker 从阻塞列表挪到就绪列表：Blocked → Ready' },
  { q: 1, w: 'running', note: '退出 ISR 后调度器切到 Worker，恢复现场接着往下跑' },
  { q: 0, w: 'running', note: 'xQueueReceive 立即拿到数据（队列再次变空），返回 pdTRUE' },
  { q: 0, w: 'process', note: '处理这份数据；此时若再取，仍然会阻塞' },
  { q: 0, w: 'blocked', note: '第二次 xQueueReceive → 队列空 → 再次阻塞，循环开始' },
  { q: 1, w: 'blocked', note: 'ISR 入队第 1 个（Worker 还在阻塞）' },
  { q: 2, w: 'blocked', note: 'ISR 入队第 2 个：队列深度占用 2，仍远未满' },
  { q: 2, w: 'ready', note: 'Worker 就绪：只要调度器给它 CPU 就能连取两次' },
  { q: 2, w: 'running', note: 'Worker 获得 CPU，开始消化积压的数据' },
  { q: 1, w: 'running', note: '取走 1 个，还剩 1 个 → 下次读取不会阻塞' },
  { q: 0, w: 'running', note: '取走第 2 个，队列彻底空了 → 回到第 1 拍' },
]

const TOTAL = STEPS.length
const DEPTH = 8
const H = 292

const STATE_COLOR: Record<WState, string> = {
  blocked: '#94a3b8',
  ready: '#d97706',
  running: '#059669',
  process: '#2563eb',
  idle: '#cbd5e1',
}

const STATE_CN: Record<WState, string> = {
  blocked: 'Blocked 阻塞',
  ready: 'Ready 就绪',
  running: 'Running 运行',
  process: '运行中（处理数据）',
  idle: 'Idle 空闲',
}

const playing = ref(true)
const speed = ref(1)
const tick = ref(0)
/** 统计：累计被唤醒次数 */
const wakeCount = ref(0)

const cur = computed(() => STEPS[tick.value])
const wakeups = computed(() => STEPS.filter((s, i) => i > 0 && STEPS[i - 1].w === 'blocked' && s.w === 'ready').length)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  q: '#0d9488',
  isr: '#dc2626',
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

/** 第 i 拍是否发生了 ISR 入队（队列长度比上一拍多） */
function isrAt(i: number): boolean {
  return i > 0 && STEPS[i].q > STEPS[i - 1].q
}

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return
  L.destroyChildren()

  const w = S.width()
  // 窄屏重排瞬间宽度塌缩时跳过，等 ResizeObserver 拿到最终宽度
  if (w < 280) {
    L.draw()
    return
  }

  const x0 = 16
  const x1 = w - 16
  const compact = w < 430
  const s = cur.value

  /* 标题 */
  L.add(
    new Konva.Text({
      x: x0,
      y: 10,
      text: '队列阻塞与唤醒：阻塞 = 让出 CPU，不是死等',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 队列八格 ---------- */
  const qy = 48
  const qh = 30
  const gw = (x1 - x0) / DEPTH
  L.add(
    new Konva.Text({
      x: x0,
      y: qy - 15,
      text: compact ? `队列（深度 ${DEPTH}）` : `队列 xQueue（深度 ${DEPTH}）`,
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x1 - 122,
      y: qy - 15,
      width: 122,
      align: 'right',
      text: `已入队 ${s.q} / ${DEPTH}`,
      fontSize: 8.5,
      fontFamily: FONT,
      fill: s.q > 0 ? C.q : C.dim,
    }),
  )

  for (let i = 0; i < DEPTH; i++) {
    const gx = x0 + i * gw
    const has = i < s.q
    L.add(
      new Konva.Rect({
        x: gx + 1,
        y: qy,
        width: gw - 2,
        height: qh,
        fill: has ? '#ccfbf1' : '#fbfcfe',
        stroke: has ? C.q : C.gridStrong,
        strokeWidth: 1,
        dash: has ? undefined : [3, 3],
        cornerRadius: 4,
      }),
    )
    if (has) {
      L.add(
        new Konva.Text({
          x: gx + 1,
          y: qy + 9,
          width: gw - 2,
          align: 'center',
          text: '●',
          fontSize: 10,
          fontFamily: FONT,
          fill: C.q,
        }),
      )
    }
  }

  /* ---------- Worker 状态卡 ---------- */
  const wy = 94
  const wh = 50
  const wColor = STATE_COLOR[s.w]
  L.add(
    new Konva.Rect({
      x: x0,
      y: wy,
      width: x1 - x0,
      height: wh,
      fill: C.panel,
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Rect({ x: x0, y: wy, width: 4, height: wh, fill: wColor, cornerRadius: 2 }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 13,
      y: wy + 6,
      text: 'Worker 任务（消费者）',
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 13,
      y: wy + 18,
      text: STATE_CN[s.w],
      fontSize: compact ? 10 : 11,
      fontFamily: FONT,
      fill: wColor,
      fontStyle: 'bold',
    }),
  )
  // 右侧同步显示当前 API 调用；窄屏时下移到第三行，避免与状态文字叠在一起
  const api =
    s.w === 'blocked'
      ? 'xQueueReceive(q, &v, portMAX_DELAY)'
      : s.w === 'ready'
        ? '等待调度器选中…'
        : s.w === 'process'
          ? 'process(v)'
          : 'xQueueReceive(q, &v, 0)'
  L.add(
    new Konva.Text({
      x: compact ? x0 + 13 : x0 + (x1 - x0) * 0.5,
      y: compact ? wy + 34 : wy + 22,
      width: compact ? x1 - x0 - 26 : (x1 - x0) * 0.48,
      align: compact ? 'left' : 'right',
      text: api,
      fontSize: compact ? 7.5 : 9,
      fontFamily: FONT,
      fill: C.dim,
    }),
  )

  /* ---------- 状态时间轴 ---------- */
  const gy = 178
  const gh = 22
  const tw = (x1 - x0) / TOTAL
  L.add(
    new Konva.Text({
      x: x0,
      y: gy - 26,
      text: '任务状态时间轴',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.dim,
    }),
  )
  for (let i = 0; i < TOTAL; i++) {
    const exec = i <= tick.value
    const isCur = i === tick.value
    L.add(
      new Konva.Rect({
        x: x0 + i * tw + 0.5,
        y: gy,
        width: Math.max(1, tw - 1),
        height: gh,
        fill: STATE_COLOR[STEPS[i].w],
        opacity: exec ? (isCur ? 1 : 0.72) : 0.2,
        cornerRadius: 2,
        stroke: isCur ? C.strong : undefined,
        strokeWidth: isCur ? 1.4 : 0,
      }),
    )
    // ISR 入队标记
    if (isrAt(i)) {
      const mx = x0 + i * tw + tw / 2
      L.add(
        new Konva.Line({
          points: [mx, gy - 10, mx - 4, gy - 3, mx + 4, gy - 3],
          closed: true,
          fill: C.isr,
          opacity: exec ? 1 : 0.35,
        }),
      )
    }
  }
  // 当前拍游标
  const cx = x0 + tick.value * tw + tw / 2
  L.add(
    new Konva.Line({
      points: [cx, gy - 2, cx, gy + gh + 2],
      stroke: C.strong,
      strokeWidth: 1.4,
    }),
  )

  /* ---------- 状态说明栏 ---------- */
  const sy = 208
  L.add(
    new Konva.Rect({
      x: x0 - 2,
      y: sy,
      width: x1 - x0 + 4,
      height: 44,
      fill: C.panel,
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 8,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 10,
      y: sy + 9,
      width: x1 - x0 - 20,
      text: s.note,
      fontSize: 9.5,
      lineHeight: 1.35,
      fontFamily: FONT,
      fill: wColor,
      fontStyle: s.w === 'blocked' || s.w === 'ready' ? 'bold' : 'normal',
    }),
  )

  /* ---------- 图例（5 项按宽度均分，窄屏也不会被裁） ---------- */
  const ly = 262
  const lstep = (x1 - x0) / 5
  const legend: Array<[string, string]> = [
    ['blocked', '阻塞'],
    ['ready', '就绪'],
    ['running', '运行'],
    ['process', '处理'],
  ]
  legend.forEach(([k, txt], i) => {
    const lx = x0 + i * lstep
    L.add(
      new Konva.Rect({
        x: lx,
        y: ly,
        width: 8,
        height: 8,
        fill: STATE_COLOR[k as WState],
        cornerRadius: 2,
      }),
    )
    L.add(
      new Konva.Text({
        x: lx + 12,
        y: ly - 1,
        text: txt,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.text,
      }),
    )
  })
  const ix = x0 + 4 * lstep
  L.add(
    new Konva.Line({
      points: [ix, ly + 8, ix + 4, ly + 1, ix + 8, ly + 8],
      closed: true,
      fill: C.isr,
    }),
  )
  L.add(
    new Konva.Text({
      x: ix + 12,
      y: ly - 1,
      text: 'ISR 入队',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.text,
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
  if (STEPS[tick.value].w === 'blocked' && STEPS[next].w === 'ready') wakeCount.value++
  tick.value = next
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
  tick.value = 0
  wakeCount.value = 0
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-teal-600 text-white">
          <AppIcon name="grid" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">队列阻塞与唤醒 · 交互式动画</span>
        <span class="tag bg-teal-50 text-teal-700">Konva</span>
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
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Worker 状态</div>
        <div class="mt-0.5 font-mono text-[13px] font-bold" :style="{ color: STATE_COLOR[cur.w] }">
          {{ STATE_CN[cur.w] }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">队列占用</div>
        <div class="mt-0.5 font-mono text-base font-bold text-teal-700">
          {{ cur.q }} <span class="text-xs font-normal text-ink-400">/ {{ DEPTH }}</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">本回合唤醒次数</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ wakeCount }} <span class="text-xs font-normal text-ink-400">/ {{ wakeups }}</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">速度</div>
        <div class="mt-0.5 flex gap-1">
          <button
            v-for="sp in [1, 2, 4]"
            :key="sp"
            class="rounded px-1.5 py-0.5 text-xs font-bold transition-colors"
            :class="speed === sp ? 'bg-teal-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
            @click="speed = sp"
          >
            {{ sp }}x
          </button>
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        <b class="text-ink-700">阻塞的本质是「主动让出 CPU」</b>：<span class="font-mono">xQueueReceive</span>
        在队列空时把任务从就绪列表摘下、挂到队列的等待列表里，然后触发一次调度——
        这个任务不再被调度器考虑，CPU 去干别的（或进 WFI）。数据到达时由
        <span class="font-mono">xQueueSendFromISR</span> 把它挪回就绪列表，这就是「唤醒」。
      </p>
      <p>
        <b class="text-ink-700">注意唤醒的时机</b>：ISR 里只是把任务标成 Ready，
        <b>真正切换要等 ISR 退出</b>（<span class="font-mono">portYIELD_FROM_ISR</span> 置 PendSV）。
        所以不要在 ISR 里等数据处理完，那会把中断拖成几毫秒。
      </p>
      <p class="text-ink-400">
        提示：看时间轴上的红色三角——那是 ISR 入队的瞬间；注意 Worker 从
        Blocked（灰）跳到 Ready（橙）时，队列里的数据还没被取走，要等下一拍才变 Running（绿）。
      </p>
    </div>
  </div>
</template>
