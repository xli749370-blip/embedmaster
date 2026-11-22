<script setup lang="ts">
/**
 * 交互式动画 ㉓：中断的硬件真相 —— 完整退出 vs 咬尾（Tail-Chaining）
 * ------------------------------------------------------------------
 * 场景：中断 A（EXTI0）处理中，中断 B（USART1）背靠背到达。
 *       上行演示"普通退出再进入"：出栈 8 寄存器（12 拍）→ 发现 B →
 *       重新压栈（8 拍）+ 取向量（4 拍）≈ 26 拍白费；
 *       下行演示"咬尾"：A 的栈帧直接留给 B，只花 6 拍取向量跳转。
 * 画布内容：
 *   - 两行 24 拍时序条，逐拍推进，每格标注当前动作
 *   - 压栈/出栈段用不同颜色，白费的部分标红框
 *   - 底部统计：两行各自耗时、咬尾省下的拍数
 * 交互：播放 / 单步 / 复位 / 1x·2x·4x 调速
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

const H = 240
const TOTAL = 28

const playing = ref(true)
const speed = ref(1)
const beat = ref(0)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  push: '#7c3aed', // 压栈
  pop: '#0891b2', // 出栈
  isr: '#059669', // 执行 ISR
  tail: '#d97706', // 咬尾跳转
  idle: '#f1f5f9',
  hi: '#dc2626',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
}

/** 每行动作序列：0 = A 的 ISR 执行，负数 = 空闲 */
function buildRow(kind: 'normal' | 'tail'): Array<{ t: string; c: string; w: number }> {
  const P = (n: number) => Array(n).fill(null).map(() => ({ t: '压栈', c: C.push, w: n }))
  const O = (n: number) => Array(n).fill(null).map(() => ({ t: '出栈', c: C.pop, w: n }))
  const I = (n: number) => Array(n).fill(null).map(() => ({ t: '执行 ISR', c: C.isr, w: n }))
  const T = (n: number) => Array(n).fill(null).map(() => ({ t: '咬尾取向量', c: C.tail, w: n }))
  const W = (n: number) => Array(n).fill(null).map(() => ({ t: '白费（出栈+重压）', c: '#fee2e2', w: n }))

  if (kind === 'normal') {
    // A 执行 4 拍 → 出栈 8（返回途中已见 B）→ 重新压栈 8 + 取向量 4 → B 执行 4 拍
    return [...I(4), ...O(8), ...P(8), { t: '取向量', c: C.push, w: 4 }, ...I(4)]
  }
  // 咬尾：A 执行 4 拍 → 退出阶段发现 B → 6 拍咬尾取向量 → B 执行 4 拍
  return [...I(4), ...T(6), ...I(4)]
}

/* 行数据在绘制时动态生成；beat 决定画到第几格 */
function rowCells(kind: 'normal' | 'tail') {
  return buildRow(kind)
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
  const compact = w < 430
  const x0 = 14
  const x1 = w - 14

  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: '同一个场景两种走法：中断 A 执行到第 4 拍时，中断 B 到达',
      fontSize: 11,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  const rows: Array<{ name: string; kind: 'normal' | 'tail' }> = [
    { name: '普通退出再进入', kind: 'normal' },
    { name: '咬尾 Tail-Chaining', kind: 'tail' },
  ]

  const barY0 = 34
  const barH = 26
  const rowGap = 46
  const labelW = compact ? 0 : 96
  const cellW = (x1 - x0 - labelW) / TOTAL

  rows.forEach((row, ri) => {
    const y = barY0 + ri * rowGap
    const cells = rowCells(row.kind)
    // 画满 24 格，超出 cells 的画空闲
    for (let j = 0; j < TOTAL; j++) {
      const cx = x0 + labelW + j * cellW
      const cell = cells[j]
      const revealed = j < beat.value
      L.add(
        new Konva.Rect({
          x: cx,
          y,
          width: Math.max(2, cellW - 1.5),
          height: barH,
          fill: revealed && cell ? cell.c : C.idle,
          stroke: revealed && cell && cell.c === '#fee2e2' ? C.hi : C.grid,
          strokeWidth: revealed && cell && cell.c === '#fee2e2' ? 1.4 : 0.6,
          cornerRadius: 2,
        }),
      )
    }
    if (!compact) {
      L.add(
        new Konva.Text({
          x: x0,
          y: y + 4,
          width: labelW - 8,
          text: row.name,
          fontSize: 9.5,
          fontFamily: FONT,
          fill: ri === 0 ? C.hi : C.tail,
          fontStyle: 'bold',
        }),
      )
    }
    // 结束统计
    L.add(
      new Konva.Text({
        x: x1 - 128,
        y: y + barH + 3,
        width: 128,
        align: 'right',
        text: ri === 0 ? `过场 24 拍（出栈+重压白费）` : `过场仅 6 拍 · 省 18 拍`,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: ri === 0 ? C.hi : C.isr,
        fontStyle: 'bold',
      }),
    )
  })

  /* 图例 */
  const ly = barY0 + 2 * rowGap - 2
  const legend = [
    { t: '压栈 8 拍', c: C.push },
    { t: '出栈 8 拍', c: C.pop },
    { t: '执行 ISR', c: C.isr },
    { t: '咬尾 6 拍', c: C.tail },
  ]
  let lx = x0
  legend.forEach((g) => {
    L.add(new Konva.Rect({ x: lx, y: ly, width: 8, height: 8, fill: g.c, cornerRadius: 2 }))
    L.add(
      new Konva.Text({
        x: lx + 11,
        y: ly,
        text: g.t,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.text,
      }),
    )
    lx += 74
  })

  /* 结论行 */
  L.add(
    new Konva.Text({
      x: x0,
      y: H - 18,
      text:
        beat.value >= TOTAL
          ? '咬尾跳过「出栈 12 拍 + 重压 8 拍」，多中断背靠背时几乎零成本切换——NVIC 自动完成，无需写任何代码'
          : '播放观察：上行标红的段落是白费的「出栈又压栈」，下行咬尾直接取向量进 ISR',
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
}

/* ---------------- 状态推进 ---------------- */
function step() {
  beat.value = Math.min(beat.value + 1, TOTAL)
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
  beat.value = 0
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
    const interval = 320 / speed.value
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-cyan-700 text-white">
          <AppIcon name="bolt" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">咬尾中断 · 交互式动画</span>
        <span class="tag bg-cyan-50 text-cyan-700">Konva</span>
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
          :class="speed === s ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">普通退出路径</div>
        <div class="mt-0.5 font-mono text-base font-bold text-rose-600">≈ 26 拍</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">咬尾路径</div>
        <div class="mt-0.5 font-mono text-base font-bold text-emerald-600">≈ 6 拍</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">单次节省</div>
        <div class="mt-0.5 font-mono text-base font-bold text-cyan-700">≈ 20 拍</div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        硬件自动压栈的 8 个寄存器（xPSR/PC/LR/R12/R3~R0）恰好是 C 调用约定的「调用者保存」组——
        这就是 <b class="text-ink-700">C 函数可以直接当中断服务函数</b> 的底层原因。
      </p>
      <p class="text-ink-400">
        咬尾与迟到都是 NVIC 的自动优化：背靠背中断只花几拍切换，高优先级中断甚至能在别人压栈途中
        直接"接管"栈帧。给真正时限敏感的中断最高优先级，硬件就把插队成本降到零。
      </p>
    </div>
  </div>
</template>
