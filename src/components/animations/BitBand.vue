<script setup lang="ts">
/**
 * 交互式动画 ㉖：位操作 —— RMW 竞态 vs 位带原子写
 * ------------------------------------------------------------------
 * 场景：主循环要把寄存器 0x4001_0C0C 的 bit3 置 1，与此同时 ISR 把
 *       bit7 置 1。上半演示普通「读-改-写」（|=' 的三条指令）在窗口期
 *       丢掉 ISR 的修改；下半演示位带别名区一次写一字、只动那一位。
 * 画布内容：
 *   - 两行场景，每行一个 8 位寄存器格子 + 当前指令说明
 *   - 底部：位带地址计算公式（alias = base + (addr-region)*32 + bit*4）
 * 交互：播放 / 单步 / 复位 / 1x·2x·4x 调速
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

const H = 244

const playing = ref(true)
const speed = ref(1)
const stepIdx = ref(-1) // 0..5

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  rmw: '#0891b2',
  band: '#7c3aed',
  hi: '#dc2626',
  ok: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
}

/** 六步脚本 */
interface BStep {
  name: string
  rmwLog: string
  bandLog: string
  /** RMW 行 bit7 是否保留 */
  rmwBit7: boolean
  rmwBit3: boolean
  bandBit3: boolean
}

const steps: BStep[] = [
  { name: '初值', rmwLog: '寄存器初值 0x00，主循环准备 |= (1<<3)', bandLog: '同一个目标：位带别名地址一次搞定', rmwBit7: false, rmwBit3: false, bandBit3: false },
  { name: '读整字', rmwLog: 'LDR：主循环读走整字快照 0x00', bandLog: '先算别名地址（一次乘加）', rmwBit7: false, rmwBit3: false, bandBit3: false },
  { name: 'ISR 改 bit7', rmwLog: '窗口期！ISR 把 bit7 置 1 → 寄存器 = 0x80', bandLog: 'alias = 0x4200_0000 + (addr−region)×32 + 3×4', rmwBit7: true, rmwBit3: false, bandBit3: false },
  { name: 'OR 写回', rmwLog: '主循环基于旧快照 OR 0x08 写回 → bit7 被抹掉', bandLog: '对别名地址写 1 个字', rmwBit7: false, rmwBit3: true, bandBit3: false },
  { name: '硬件裁决', rmwLog: '结果 0x08：ISR 的修改静默丢失', bandLog: '硬件只改 bit3，其他位物理上不可及', rmwBit7: false, rmwBit3: true, bandBit3: true },
  { name: '最终对比', rmwLog: 'bit3=1，bit7=0 ✗ 丢了 ISR 的修改', bandLog: 'bit3=1，bit7=1 ✓ 两边修改都保住', rmwBit7: false, rmwBit3: true, bandBit3: true },
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
  const x0 = 14
  const x1 = w - 14
  const st = stepIdx.value >= 0 ? steps[stepIdx.value] : null

  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: '目标：把 0x4001_0C0C 的 bit3 置 1，同时 ISR 在改 bit7',
      fontSize: 11,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  const drawRow = (
    y: number,
    title: string,
    color: string,
    bit3: boolean,
    bit7: boolean,
    lost: boolean,
    log: string,
    addr: string,
  ) => {
    // 标题
    L.add(
      new Konva.Text({
        x: x0,
        y,
        text: title,
        fontSize: 9.5,
        fontFamily: FONT,
        fill: color,
        fontStyle: 'bold',
      }),
    )
    // 地址标
    L.add(
      new Konva.Text({
        x: x1 - 150,
        y,
        width: 150,
        align: 'right',
        text: addr,
        fontSize: 8,
        fontFamily: 'Consolas, monospace',
        fill: C.dim,
      }),
    )
    // 8 个位格子（bit7..bit0）
    const bitW = Math.min(34, (x1 - x0 - 20) / 8)
    const startX = x0
    for (let b = 7; b >= 0; b--) {
      const bx = startX + (7 - b) * (bitW + 3)
      const on = b === 3 ? bit3 : b === 7 ? bit7 : false
      const conflict = lost && b === 7 && bit7 === false && stepIdx.value >= 4
      L.add(
        new Konva.Rect({
          x: bx,
          y: y + 14,
          width: bitW,
          height: 22,
          fill: on ? (b === 3 ? '#cffafe' : '#d1fae5') : conflict ? '#fee2e2' : '#f8fafc',
          stroke: conflict ? C.hi : on ? (b === 3 ? C.rmw : C.ok) : C.grid,
          strokeWidth: conflict ? 2 : 1,
          cornerRadius: 4,
        }),
      )
      L.add(
        new Konva.Text({
          x: bx,
          y: y + 19,
          width: bitW,
          align: 'center',
          text: on ? '1' : '0',
          fontSize: 10,
          fontFamily: 'Consolas, monospace',
          fill: on ? C.strong : conflict ? C.hi : C.dim,
          fontStyle: on || conflict ? 'bold' : 'normal',
        }),
      )
      L.add(
        new Konva.Text({
          x: bx,
          y: y + 37,
          width: bitW,
          align: 'center',
          text: `b${b}`,
          fontSize: 6.5,
          fontFamily: FONT,
          fill: b === 3 || b === 7 ? C.text : C.dim,
          fontStyle: b === 3 || b === 7 ? 'bold' : 'normal',
        }),
      )
    }
    // 说明
    L.add(
      new Konva.Text({
        x: x0,
        y: y + 46,
        width: x1 - x0,
        text: log,
        fontSize: 8.4,
        fontFamily: FONT,
        fill: lost ? C.hi : C.strong,
        fontStyle: 'bold',
      }),
    )
  }

  drawRow(
    28,
    '读改写 RMW（|= 三条指令）',
    C.rmw,
    st ? st.rmwBit3 : false,
    st ? st.rmwBit7 : false,
    stepIdx.value >= 4,
    st ? st.rmwLog : '两条路线，同一个寄存器，两种结局',
    '0x4001_0C0C',
  )

  drawRow(
    118,
    '位带别名写（一次写一字）',
    C.band,
    st ? st.bandBit3 : false,
    true, // 位带场景 bit7 始终保住
    false,
    st ? st.bandLog : '别名区把"一位"膨胀成一个 32 位地址',
    'alias 0x4202_184C',
  )

  /* 中间对比箭头：步骤 4 后 ISR 修改在 RMW 行消失 */
  if (stepIdx.value === 4) {
    L.add(
      new Konva.Text({
        x: x1 - 120,
        y: 92,
        width: 120,
        align: 'right',
        text: '↑ bit7 被旧快照抹掉',
        fontSize: 8,
        fontFamily: FONT,
        fill: C.hi,
        fontStyle: 'bold',
      }),
    )
  }

  /* 底部公式卡 */
  const ky = 188
  L.add(
    new Konva.Rect({
      x: x0,
      y: ky,
      width: x1 - x0,
      height: 48,
      fill: '#f5f3ff',
      stroke: '#ddd6fe',
      strokeWidth: 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: ky + 5,
      width: x1 - x0 - 18,
      text: 'alias = 0x4200_0000 + (0x4001_0C0C − 0x4000_0000) × 32 + 3 × 4 = 0x4202_184C',
      fontSize: 7.4,
      lineHeight: 1.25,
      fontFamily: 'Consolas, monospace',
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 9,
      y: ky + 27,
      width: x1 - x0 - 18,
      text: 'volatile 管编译器优化，屏障管 CPU 重排，位带/BSRR 管并发——三把钥匙各开一把锁',
      fontSize: 7.4,
      lineHeight: 1.2,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
}

/* ---------------- 状态推进 ---------------- */
function step() {
  stepIdx.value = Math.min(stepIdx.value + 1, steps.length - 1)
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
    const interval = 880 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    if (acc > interval * 3) acc = interval * 3
    let guard = 0
    while (acc >= interval && guard < 3) {
      acc -= interval
      guard++
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-violet-700 text-white">
          <AppIcon name="code" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">RMW 竞态与位带 · 交互式动画</span>
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
          :class="speed === s ? 'bg-violet-700 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">|= 编译成</div>
        <div class="mt-0.5 font-mono text-sm font-bold text-cyan-700">LDR+ORR+STR</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">RMW 结果</div>
        <div class="mt-0.5 text-sm font-bold" :class="stepIdx >= 4 ? 'text-rose-600' : 'text-ink-400'">
          {{ stepIdx >= 4 ? '丢 bit7' : '窗口期风险' }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">位带结果</div>
        <div class="mt-0.5 text-sm font-bold text-emerald-600">原子，两边都保住</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">首选方案</div>
        <div class="mt-0.5 text-sm font-bold text-ink-900">BSRR &gt; 位带 &gt; 关中断</div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        `GPIOA-&gt;ODR |= (1 &lt;&lt; 3)` 从来不是原子的：读整字、改位、写回整字——中间任何时刻被打断，
        别人的修改就可能被你的旧快照抹掉。<b class="text-ink-700">位带把"改一位"变成"写一个字"，硬件级原子</b>。
      </p>
      <p class="text-ink-400">
        别混淆三件事：volatile 防的是编译器把 while 优化成死循环，DMB/DSB 防的是 CPU 重排，
        位带/BSRR/临界区防的才是并发。三个问题三把钥匙，互相不可替代。
      </p>
    </div>
  </div>
</template>
