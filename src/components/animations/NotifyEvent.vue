<script setup lang="ts">
/**
 * 交互式动画 ⑯：FreeRTOS 任务通知与事件组（Konva）
 * ------------------------------------------------------------------
 * 场景：同一个「传感器采到数据」的事件，分别用任务通知和事件组
 *       通知两个任务，观察两者的语义差别：
 *         任务通知 —— 32 位值直接写进目标任务 TCB，会被「取走」
 *         事件组   —— 位是状态，需显式清除，可按「任一/全部」组合等待
 * 画布内容：
 *   - 上：任务通知链路（EXTI ISR → vTaskNotifyGiveFromISR → TCB 值 → 任务 A）
 *   - 下：事件组（bit0 传感器 / bit1 按键 / bit2 定时器 → 24 位寄存器 → 任务 B）
 *   - 底：两条结论 + 当前拍的状态说明
 * 交互：播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 * 设计要点：
 *   - 第 3 拍特意让 A「取走通知值归零」，而事件组 bit0 仍然为 1 ——
 *     这就是「通知是消息、事件组是状态」最直观的差别
 *   - 第 5 拍由定时器置 bit2：说明等待掩码 0x03 之外的多余位不影响判据
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 脚本：6 拍 ---------------- */
type TState = 'blocked' | 'ready' | 'run'

interface Snap {
  /** TCB 里的 ulNotifiedValue */
  note: number
  /** 事件组位图（只用低 8 位演示） */
  bits: number
  aState: TState
  bState: TState
  caption: string
}

const SCRIPT: Snap[] = [
  {
    note: 0,
    bits: 0b00000000,
    aState: 'blocked',
    bState: 'blocked',
    caption: '两个任务都在等：A 等通知值，B 等 bit0|bit1。此刻 CPU 交给别的任务，它们都不占时间片。',
  },
  {
    note: 1,
    bits: 0b00000001,
    aState: 'ready',
    bState: 'blocked',
    caption:
      '传感器中断：vTaskNotifyGiveFromISR 把计数写进 A 的 TCB，A 立刻进就绪列表；bit0 同时置位，但 B 要 0x03，还差 bit1。',
  },
  {
    note: 0,
    bits: 0b00000001,
    aState: 'run',
    bState: 'blocked',
    caption:
      'A 被调度、ulTaskNotifyTake 把值取走归零 —— 通知是「消息」，取一次少一次；事件组 bit0 还亮着，位是「状态」，不会自己消失。',
  },
  {
    note: 0,
    bits: 0b00000011,
    aState: 'blocked',
    bState: 'ready',
    caption:
      '按键中断置 bit1：掩码 0x03 现在全置位，B 被内核从阻塞列表挪到就绪列表（这次是 ISR 里 xEventGroupSetBitsFromISR 的功劳）。',
  },
  {
    note: 0,
    bits: 0b00000111,
    aState: 'blocked',
    bState: 'run',
    caption:
      '定时器置 bit2（与 B 无关的位）：xEventGroupWaitBits 只比对掩码 0x03，多出来的位不影响判据 —— 这正是事件组适合「多源汇聚」的原因。',
  },
  {
    note: 0,
    bits: 0b00000100,
    aState: 'blocked',
    bState: 'blocked',
    caption:
      'B 处理完调 xEventGroupClearBits(eg, 0x03) 清掉自己等的位，bit2 留给别的任务判断 —— 事件位必须显式清，忘了清就会「下次不触发」。',
  },
]

const H = 304

const playing = ref(true)
const speed = ref(1)
const idx = ref(0)

const snap = computed(() => SCRIPT[idx.value])
const atEnd = computed(() => idx.value >= SCRIPT.length - 1)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const MONO = 'Consolas, "Courier New", monospace'
const C = {
  note: '#7c3aed',
  evt: '#0d9488',
  isr: '#ea580c',
  hi: '#dc2626',
  text: '#64748b',
  strong: '#0f172a',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
  panel: '#f8fafc',
}

const T_COLOR: Record<TState, string> = {
  blocked: '#94a3b8',
  ready: '#d97706',
  run: '#059669',
}
const T_CN: Record<TState, string> = {
  blocked: 'Blocked 阻塞',
  ready: 'Ready 就绪',
  run: 'Running 运行',
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
  if (!w || w < 40) {
    L.draw()
    return
  }

  const x0 = 14
  const x1 = w - 14
  const pw = x1 - x0
  const compact = w < 470
  const s = snap.value

  // 窄屏内容更高（多行文案更长），画布高度跟着档位走
  const nextH = compact ? 322 : 304
  if (S.height() !== nextH) S.height(nextH)

  /* ---------- 标题 ---------- */
  L.add(
    new Konva.Text({
      x: x0,
      y: 10,
      text: compact ? '任务通知 vs 事件组' : '同样一个事件，两种通知方式：任务通知 vs 事件组',
      fontSize: compact ? 10.5 : 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ================= ① 任务通知 ================= */
  const p1y = 32
  const p1h = 84
  L.add(
    new Konva.Rect({
      x: x0,
      y: p1y,
      width: pw,
      height: p1h,
      fill: '#faf5ff',
      stroke: '#e9d5ff',
      strokeWidth: 1,
      cornerRadius: 8,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: p1y + 7,
      text: compact ? '① 任务通知' : '① 任务通知：32 位值直接写进目标任务的 TCB',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.note,
      fontStyle: 'bold',
    }),
  )

  // ISR 方块
  L.add(
    new Konva.Rect({
      x: x0 + 9,
      y: p1y + 23,
      width: 46,
      height: 22,
      fill: '#fff7ed',
      stroke: C.isr,
      strokeWidth: 1,
      cornerRadius: 4,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: p1y + 30,
      width: 46,
      align: 'center',
      text: 'EXTI ISR',
      fontSize: 7.5,
      fontFamily: FONT,
      fill: C.isr,
      fontStyle: 'bold',
    }),
  )
  // 箭头
  L.add(
    new Konva.Arrow({
      points: [x0 + 57, p1y + 34, x0 + 93, p1y + 34],
      stroke: s.note > 0 ? C.note : C.dim,
      strokeWidth: 1.5,
      fill: s.note > 0 ? C.note : C.dim,
      pointerLength: 5,
      pointerWidth: 5,
    }),
  )
  // 调用说明（窄屏下必须收窄，否则会被右侧的 TCB 值框压住）
  L.add(
    new Konva.Text({
      x: x0 + 97,
      y: p1y + 22,
      text: compact ? 'vTaskNotifyGiveFromISR' : 'vTaskNotifyGiveFromISR(g_hWorker, ...)',
      fontSize: compact ? 7.5 : 8,
      fontFamily: MONO,
      fill: C.note,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 97,
      y: p1y + 34,
      text: compact ? '不经队列，直写 TCB' : '不经队列、不拷贝，直接写目标任务的 TCB（省 RAM 也省时间）',
      fontSize: 8,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  // TCB 值
  const tcbW = compact ? 78 : 118
  const tcbX = x1 - tcbW - 9
  L.add(
    new Konva.Rect({
      x: tcbX,
      y: p1y + 19,
      width: tcbW,
      height: 32,
      fill: s.note > 0 ? '#ede9fe' : '#ffffff',
      stroke: s.note > 0 ? C.note : C.gridStrong,
      strokeWidth: s.note > 0 ? 1.6 : 1,
      cornerRadius: 5,
    }),
  )
  L.add(
    new Konva.Text({
      x: tcbX + 6,
      y: p1y + 24,
      text: 'ulNotifiedValue',
      fontSize: 7,
      fontFamily: FONT,
      fill: '#94a3b8',
    }),
  )
  L.add(
    new Konva.Text({
      x: tcbX + 6,
      y: p1y + 36,
      text: String(s.note),
      fontSize: 11,
      fontFamily: MONO,
      fill: s.note > 0 ? C.note : C.strong,
      fontStyle: 'bold',
    }),
  )

  // 任务 A 状态条
  const chipY = p1y + 58
  L.add(
    new Konva.Rect({
      x: x0 + 9,
      y: chipY,
      width: pw - 18,
      height: 19,
      fill: '#ffffff',
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 4,
    }),
  )
  L.add(new Konva.Rect({ x: x0 + 9, y: chipY, width: 3.5, height: 19, fill: T_COLOR[s.aState] }))
  L.add(
    new Konva.Text({
      x: x0 + 17,
      y: chipY + 5,
      text: compact ? '任务 A（等通知）' : '任务 A（ulTaskNotifyTake 等通知）',
      fontSize: 8,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  L.add(
    new Konva.Text({
      x: x1 - 110,
      y: chipY + 4,
      width: 100,
      align: 'right',
      text: T_CN[s.aState],
      fontSize: 8.5,
      fontFamily: FONT,
      fill: T_COLOR[s.aState],
      fontStyle: 'bold',
    }),
  )

  /* ================= ② 事件组 ================= */
  const p2y = 124
  // 窄屏多一行说明文字，面板要更高，否则任务 B 的状态条会被挤出面板
  const p2h = compact ? 118 : 110
  L.add(
    new Konva.Rect({
      x: x0,
      y: p2y,
      width: pw,
      height: p2h,
      fill: '#f0fdfa',
      stroke: '#99f6e4',
      strokeWidth: 1,
      cornerRadius: 8,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: p2y + 7,
      text: compact ? '② 事件组（24 位）' : '② 事件组：多源多 bit，可等「任一」或「全部」',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.evt,
      fontStyle: 'bold',
    }),
  )

  // 8 个 bit 格
  const bx = x0 + 9
  const bw = pw - 18
  const cw = bw / 8
  for (let i = 0; i < 8; i++) {
    const on = (s.bits >> i) & 1
    const gx = bx + i * cw
    L.add(
      new Konva.Rect({
        x: gx + 1.5,
        y: p2y + 26,
        width: cw - 3,
        height: 26,
        fill: on ? '#ccfbf1' : '#ffffff',
        stroke: on ? C.evt : C.gridStrong,
        strokeWidth: on ? 1.6 : 1,
        cornerRadius: 4,
      }),
    )
    L.add(
      new Konva.Text({
        x: gx + 1.5,
        y: p2y + 29,
        width: cw - 3,
        align: 'center',
        text: `bit${i}`,
        fontSize: compact ? 6.5 : 7.5,
        fontFamily: FONT,
        fill: on ? C.evt : C.dim,
      }),
    )
    L.add(
      new Konva.Text({
        x: gx + 1.5,
        y: p2y + 38,
        width: cw - 3,
        align: 'center',
        text: String(on),
        fontSize: 11,
        fontFamily: MONO,
        fill: on ? C.evt : C.dim,
        fontStyle: 'bold',
      }),
    )
  }

  // 事件源说明
  L.add(
    new Konva.Text({
      x: bx,
      y: p2y + 58,
      width: bw,
      text: compact
        ? 'bit0 传感器 · bit1 按键 · bit2 定时器'
        : 'bit0 = 传感器采到数据　bit1 = 按键按下　bit2 = 定时器超时（其余位留给别的用途）',
      fontSize: 8,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  // 等待条件：左侧调用语句，右侧「是否满足」徽标（放同一行，避免两行挤在一起）
  const waitOk = (s.bits & 0x03) === 0x03
  L.add(
    new Konva.Text({
      x: bx,
      y: p2y + 74,
      text: compact ? 'xEventGroupWaitBits(eg, 0x03, ...)' : 'xEventGroupWaitBits(eg, 0x03, pdTRUE, pdTRUE, portMAX_DELAY)',
      fontSize: 8,
      fontFamily: MONO,
      fill: C.evt,
    }),
  )
  L.add(
    new Konva.Text({
      x: x1 - 130,
      y: p2y + 74,
      width: 118,
      align: 'right',
      text: waitOk ? '掩码 0x03 已满足' : '掩码 0x03 未满足',
      fontSize: 8,
      fontFamily: FONT,
      fill: waitOk ? C.evt : C.dim,
      fontStyle: waitOk ? 'bold' : 'normal',
    }),
  )

  // 任务 B 状态条
  const chipBY = p2y + (compact ? 92 : 90)
  const chipBH = compact ? 16 : 14
  L.add(
    new Konva.Rect({
      x: bx,
      y: chipBY,
      width: bw,
      height: chipBH,
      fill: '#ffffff',
      stroke: C.gridStrong,
      strokeWidth: 1,
      cornerRadius: 4,
    }),
  )
  L.add(
    new Konva.Text({
      x: bx + 6,
      y: chipBY + (compact ? 4 : 3),
      text: compact ? '任务 B（等 0x03）' : '任务 B（xEventGroupWaitBits 等 0x03 全置位）',
      fontSize: 7.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  L.add(
    new Konva.Text({
      x: x1 - 108,
      y: chipBY + 2,
      width: 96,
      align: 'right',
      text: T_CN[s.bState],
      fontSize: 8,
      fontFamily: FONT,
      fill: T_COLOR[s.bState],
      fontStyle: 'bold',
    }),
  )

  /* ---------- 结论 ---------- */
  const summaryY = p2y + p2h + 12
  L.add(
    new Konva.Text({
      x: x0,
      y: summaryY,
      width: pw,
      text: compact
        ? '通知：值会被取走，一个任务一个坑，最省 RAM；事件组：位是状态，多任务可同时等，能组合条件。'
        : '通知：值是「消息」，被取走就没了，一个任务一个坑，最省 RAM（约 5 字节/次）。事件组：位是「状态」，可多任务同时等、可按位组合，但要显式清除。',
      fontSize: 8.5,
      lineHeight: 1.4,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 状态栏 ---------- */
  L.add(
    new Konva.Text({
      x: x0,
      y: summaryY + 30,
      width: pw,
      // 窄屏上方进度条已经显示拍数，正文去掉前缀省一行高度
      text: compact ? s.caption : `第 ${idx.value + 1}/${SCRIPT.length} 拍 · ${s.caption}`,
      fontSize: 9,
      lineHeight: 1.4,
      fontFamily: FONT,
      fill: C.strong,
    }),
  )

  L.draw()
}

/* ---------------- 交互 ---------------- */
function step() {
  if (atEnd.value) return
  idx.value++
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
  idx.value = 0
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
    const interval = 1500 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    // 挂起恢复时 frame.time 会跳很大，封顶避免单帧同步重绘几百次
    if (acc > interval * 3) acc = interval * 3
    let guard = 0
    while (acc >= interval && guard < 3) {
      acc -= interval
      guard++
      // 播放到末尾自动从头循环，方便课上反复看
      if (atEnd.value) idx.value = 0
      else idx.value++
      buildScene()
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
          <AppIcon name="target" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">任务通知与事件组 · 交互式动画</span>
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

    <!-- 拍数指示条 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2">
      <span class="text-[11px] text-ink-400">进度</span>
      <div class="flex items-center gap-1">
        <span
          v-for="(_, i) in SCRIPT"
          :key="i"
          class="h-1.5 rounded-full transition-all"
          :class="i <= idx ? 'w-5 bg-violet-500' : 'w-2.5 bg-slate-200'"
        />
      </div>
      <span class="text-[11px] text-ink-400">
        第 <b class="font-mono text-violet-700">{{ idx + 1 }}</b> / {{ SCRIPT.length }} 拍
        　通知值 <b class="font-mono text-violet-700">{{ snap.note }}</b>
        　事件位 <b class="font-mono text-teal-700">0x{{ snap.bits.toString(16).toUpperCase().padStart(2, '0') }}</b>
      </span>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">ulNotifiedValue</div>
        <div class="mt-0.5 font-mono text-base font-bold text-violet-700">{{ snap.note }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">事件位 0x03</div>
        <div class="mt-0.5 font-mono text-base font-bold" :class="(snap.bits & 0x03) === 0x03 ? 'text-teal-700' : 'text-ink-400'">
          {{ (snap.bits & 0x03) === 0x03 ? '已满足' : '未满足' }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">任务 A（通知）</div>
        <div class="mt-0.5 text-base font-bold" :style="{ color: T_COLOR[snap.aState] }">
          {{ T_CN[snap.aState] }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">任务 B（事件组）</div>
        <div class="mt-0.5 text-base font-bold" :style="{ color: T_COLOR[snap.bState] }">
          {{ T_CN[snap.bState] }}
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        <b class="text-ink-700">任务通知</b>是 FreeRTOS 里最轻的同步手段：每个任务在 TCB 里自带一个 32 位值，
        ISR 或别的任务直接往这个值里写，内核顺手把目标任务挪进就绪列表——不分配内存、不拷贝数据。
        <b class="text-ink-700">事件组</b>则是一个（默认）24 位的寄存器，多个源各自置位，接收方可以等「任意一位」或「所有指定位置位」。
      </p>
      <p class="text-ink-400">
        提示：用 <b>单步</b> 走到第 3 拍——通知值被取走后归零，而事件组 bit0 还在亮着。
        这一格就是选型的判据：<b>要传「一件事发生了几次」用通知；要表达「现在处于什么状态」用事件组</b>。
      </p>
    </div>
  </div>
</template>
