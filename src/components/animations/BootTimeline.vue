<script setup lang="ts">
/**
 * 交互式动画 ㉑：从上电到 main 的启动时间线
 * ------------------------------------------------------------------
 * 场景：按下复位的瞬间，内核只做两件事（取 MSP、取 PC），其余全是
 *       Reset_Handler 这段"启动代码"干的活。本动画按 8 步走完全程，
 *       并在下方闪存 / SRAM 两条内存条上同步高亮"当前步骤动了谁"。
 * 画布内容：
 *   - 中部：8 个步骤卡（4×2 网格），当前步高亮描边
 *   - 底部：闪存条（isr_vector / text / data_init / rodata）
 *           与 SRAM 条（data / bss / heap / free / stack），
 *           当前步骤涉及的段发光
 * 交互：播放 / 单步 / 复位 / 1x·2x·4x 调速；步进期间 PC/MSP 实时更新
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

const H = 252

const playing = ref(true)
const speed = ref(1)
const stepIdx = ref(-1) // 当前执行到第几步（-1 = 复位瞬间）
const pc = ref(0x00000004)
const msp = ref(0)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  flash: '#d97706',
  ram: '#0891b2',
  hi: '#dc2626',
  ok: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
  glow: '#7c3aed',
}

interface Step {
  name: string
  desc: string
  pc: string
  /** 该步骤涉及的段（内存条高亮） */
  flash?: string
  ram?: string
}

const steps: Step[] = [
  { name: '上电复位', desc: '硬件读 0x0000_0000 → 塞进 MSP；读 0x0000_0004 → 塞进 PC', pc: '0x00000004', flash: 'isr_vector' },
  { name: '取向量', desc: 'MSP = 栈顶（RAM 末尾），PC = 复位向量（Reset_Handler）', pc: '0x080001C9', flash: 'isr_vector' },
  { name: 'Reset_Handler', desc: '启动文件汇编开始执行，C 世界前的最后准备', pc: '0x080001C9', flash: 'text' },
  { name: '搬 .data', desc: '把闪存里 .data 的初始值逐字复制到 RAM（memcpy）', pc: '0x080001D5', flash: 'data_init', ram: 'data' },
  { name: '清 .bss', desc: '把 .bss 区间逐字写 0——全局变量默认 0 的来源', pc: '0x080001E1', ram: 'bss' },
  { name: 'SystemInit', desc: '启动 HSI、清复位标志、VTOR 指向闪存开头', pc: '0x08000201', flash: 'text' },
  { name: '跳转 main', desc: 'BX LR → 进入你写的 main()，C 运行环境就绪', pc: '0x080003B9', flash: 'text' },
  { name: 'main 运行', desc: 'HAL_Init → SystemClock_Config(72MHz) → 你的业务循环', pc: '0x080003C1', flash: 'text' },
]

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
  const compact = w < 430
  const x0 = 14
  const x1 = w - 14

  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: compact ? '启动时间线：从上电到 main 共 8 步' : '启动时间线：每一步对应左下闪存 / 右下 SRAM 中被点亮的那段',
      fontSize: 11,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 8 步网格：宽屏 4×2（含描述），窄屏 2×4（只留名称防重叠） ---------- */
  const cols = compact ? 2 : 4
  const gridY = 30
  const cellH = compact ? 24 : 44
  const cellW = (x1 - x0 - 6 * (cols - 1)) / cols
  steps.forEach((st, i) => {
    const cx = x0 + (i % cols) * (cellW + 6)
    const cy = gridY + Math.floor(i / cols) * (cellH + 6)
    const active = i === stepIdx.value
    const done = i < stepIdx.value
    L.add(
      new Konva.Rect({
        x: cx,
        y: cy,
        width: cellW,
        height: cellH,
        fill: active ? '#f5f3ff' : done ? '#f8fafc' : '#ffffff',
        stroke: active ? C.glow : done ? C.ok : C.grid,
        strokeWidth: active ? 1.8 : 1,
        cornerRadius: 6,
      }),
    )
    L.add(
      new Konva.Text({
        x: cx + 6,
        y: compact ? cy + 8 : cy + 5,
        width: cellW - 10,
        text: `${i + 1}. ${st.name}`,
        fontSize: compact ? 8.6 : 9.5,
        fontFamily: FONT,
        fill: active ? C.glow : done ? C.ok : C.dim,
        fontStyle: active ? 'bold' : 'normal',
      }),
    )
    if (!compact) {
      L.add(
        new Konva.Text({
          x: cx + 6,
          y: cy + 19,
          width: cellW - 12,
          text: st.desc,
          fontSize: 7.4,
          fontFamily: FONT,
          fill: active ? C.strong : C.text,
          lineHeight: 1.25,
        }),
      )
    }
  })

  /* ---------- 两条内存条 ---------- */
  const memY = gridY + Math.ceil(steps.length / cols) * (cellH + 6) + 6
  const barH = compact ? 30 : 34

  const flashSegs = [
    { key: 'isr_vector', label: 'isr_vector', w: 0.16, color: '#fef3c7' },
    { key: 'text', label: '.text', w: 0.38, color: '#fde68a' },
    { key: 'data_init', label: '.data初始值', w: 0.26, color: '#fcd34d' },
    { key: 'rodata', label: '.rodata', w: 0.2, color: '#fef3c7' },
  ]
  const ramSegs = [
    { key: 'data', label: '.data', w: 0.18, color: '#cffafe' },
    { key: 'bss', label: '.bss', w: 0.26, color: '#a5f3fc' },
    { key: 'heap', label: 'heap →', w: 0.2, color: '#e0f2fe' },
    { key: 'free', label: '空闲', w: 0.16, color: '#f8fafc' },
    { key: 'stack', label: '← stack', w: 0.2, color: '#e0f2fe' },
  ]

  const drawBar = (
    segs: Array<{ key: string; label: string; w: number; color: string }>,
    y: number,
    tag: string,
    activeKey?: string,
  ) => {
    L.add(
      new Konva.Text({
        x: x0,
        y: y - 11,
        text: tag,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.text,
        fontStyle: 'bold',
      }),
    )
    let px = x0
    segs.forEach((s) => {
      const sw = (x1 - x0) * s.w
      const on = s.key === activeKey
      L.add(
        new Konva.Rect({
          x: px,
          y,
          width: sw - 2,
          height: barH,
          fill: s.color,
          stroke: on ? C.hi : C.grid,
          strokeWidth: on ? 2 : 0.8,
          cornerRadius: 4,
        }),
      )
      L.add(
        new Konva.Text({
          x: px,
          y: y + barH / 2 - 5,
          width: sw - 2,
          align: 'center',
          text: s.label,
          fontSize: compact ? 6.8 : 7.6,
          fontFamily: FONT,
          fill: on ? C.hi : '#475569',
          fontStyle: on ? 'bold' : 'normal',
        }),
      )
      px += sw
    })
  }

  drawBar(flashSegs, memY, '闪存 0x0800_0000', steps[stepIdx.value]?.flash)
  const ramY = memY + barH + (compact ? 12 : 22)
  drawBar(ramSegs, ramY, 'SRAM 0x2000_0000', steps[stepIdx.value]?.ram)

  /* 搬运箭头：搬 .data 时闪存 data_init → SRAM data 画一条虚线 */
  if (stepIdx.value === 3) {
    const fy = memY + barH
    const ry = ramY
    L.add(
      new Konva.Line({
        points: [x0 + (x1 - x0) * 0.72, fy + 2, x0 + (x1 - x0) * 0.09, ry - 2],
        stroke: C.hi,
        strokeWidth: 1.6,
        dash: [5, 4],
      }),
    )
  }

  /* ---------- 状态行 ---------- */
  const st = steps[stepIdx.value]
  L.add(
    new Konva.Text({
      x: x0,
      y: H - 16,
      text: compact
        ? st
          ? `PC=${st.pc}  MSP=0x20005000  ${st.name}`
          : '复位瞬间：即将取 MSP 与复位向量'
        : st
          ? `PC = ${st.pc}    MSP = 0x20005000    ${st.name}：${st.desc.slice(0, 30)}…`
          : '复位瞬间：内核即将从 0x0000_0000 取 MSP、从 0x0000_0004 取 PC',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
}

/* ---------------- 状态推进 ---------------- */
function step() {
  stepIdx.value = Math.min(stepIdx.value + 1, steps.length - 1)
  const st = steps[stepIdx.value]
  pc.value = parseInt(st.pc, 16)
  msp.value = 0x20005000
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
  stepIdx.value = -1
  pc.value = 0x00000004
  msp.value = 0
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
    const interval = 900 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    if (acc > interval * 3) acc = interval * 3
    let guard = 0
    while (acc >= interval && guard < 3) {
      acc -= interval
      guard++
      // 走到终点就停住，避免无限循环刷屏
      if (stepIdx.value < steps.length - 1) step()
    }
  })
  anim.start()

  ro = new ResizeObserver(() => {
    if (!stage || !wrapRef.value) return
    stage.width(wrapRef.value.clientWidth)
    buildScene()
  })
  ro.observe(wrapRef.value)
})

watch(speed, () => {
  lastStep = 0
  acc = 0
})

onBeforeUnmount(() => {
  ro?.disconnect()
  anim?.stop()
  stage?.destroy()
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-violet-600 text-white">
          <AppIcon name="cpu" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">启动时间线 · 交互式动画</span>
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

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">当前步骤</div>
        <div class="mt-0.5 text-sm font-bold text-violet-700">
          {{ stepIdx < 0 ? '复位瞬间' : `${stepIdx + 1} / 8 · ${steps[stepIdx].name}` }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">PC</div>
        <div class="mt-0.5 font-mono text-sm font-bold text-ink-900">0x{{ pc.toString(16).toUpperCase().padStart(8, '0') }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">MSP</div>
        <div class="mt-0.5 font-mono text-sm font-bold" :class="msp ? 'text-cyan-700' : 'text-ink-300'">
          {{ msp ? '0x' + msp.toString(16).toUpperCase() : '待取向量' }}
        </div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        硬件只负责两件事：从 <b class="text-ink-700">0x0000_0000</b> 取 MSP 初值、从
        <b class="text-ink-700">0x0000_0004</b> 取复位向量。之后的「搬 .data、清 .bss、配时钟」全是启动代码的功劳——
        全局变量默认为 0，不是编译器给的，是第 5 步逐字清出来的。
      </p>
      <p class="text-ink-400">
        注意第 4 步那条红色虚线：.data 的初始值一直躺在闪存里，启动时才"解压"到 RAM。
        大数组加上 const 就不用搬，启动立刻变快。
      </p>
    </div>
  </div>
</template>
