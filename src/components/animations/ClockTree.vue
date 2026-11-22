<script setup lang="ts">
/**
 * 交互式动画 ㉒：时钟树 —— 频率从晶振到外设的旅程
 * ------------------------------------------------------------------
 * 场景：HSE 8 MHz 晶振 → PLL ×9 → SYSCLK 72 MHz → AHB /1 → APB1 /2、
 *       APB2 /1，最后落到具体外设。三个预设一键切换，看整条链上
 *       每个节点的频率如何联动变化。
 * 画布内容：
 *   - 主链五节点横向排列：HSE → PLL → SYSCLK → HCLK → {PCLK1, PCLK2}
 *   - 当前步进到的节点高亮（播放时逐节点点亮）
 *   - 底部：定时器时钟换算提示 + Flash 等待周期
 * 预设：
 *   - 复位默认 HSI（8M，无 PLL）
 *   - HSE×9 = 72M（标准 72 MHz 配置）
 *   - HSE×6 = 48M（低功耗折中）
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

const H = 238

const playing = ref(true)
const speed = ref(1)
const stepIdx = ref(0) // 当前点亮到主链第几个节点
const preset = ref(1) // 0 HSI / 1 72M / 2 48M

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  osc: '#0891b2',
  pll: '#7c3aed',
  sys: '#dc2626',
  bus: '#d97706',
  per: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
}

interface Preset {
  key: string
  hse: number
  mul: number
  sysclk: number
  hpre: number
  ppre1: number
  ppre2: number
  flashWs: number
  note: string
}

const presets: Preset[] = [
  { key: 'HSI 默认', hse: 0, mul: 0, sysclk: 8, hpre: 1, ppre1: 1, ppre2: 1, flashWs: 0, note: '上电默认：内部 RC，精度 ±1%' },
  { key: 'HSE×9 = 72M', hse: 8, mul: 9, sysclk: 72, hpre: 1, ppre1: 2, ppre2: 1, flashWs: 2, note: '标准满频：APB1 上限 36，Flash 2 等待' },
  { key: 'HSE×6 = 48M', hse: 8, mul: 6, sysclk: 48, hpre: 1, ppre1: 2, ppre2: 1, flashWs: 1, note: '低功耗折中：Flash 1 等待' },
]

const p = () => presets[preset.value]

/** 主链节点定义：label + 当前预设下的频率 */
function nodes() {
  const v = p()
  return [
    { key: 'hse', label: v.hse ? `HSE ${v.hse} MHz` : 'HSI 8 MHz', color: C.osc, sub: v.hse ? '外部晶振 ±20ppm' : '内部 RC ±1%' },
    { key: 'pll', label: `PLL ${v.mul ? `×${v.mul}` : '—'}`, color: C.pll, sub: v.mul ? `${v.hse} × ${v.mul}` : '未启用' },
    { key: 'sysclk', label: `SYSCLK ${v.sysclk} MHz`, color: C.sys, sub: `Flash WS = ${v.flashWs}` },
    { key: 'hclk', label: `HCLK ${Math.round(v.sysclk / v.hpre)} MHz`, color: C.bus, sub: `AHB ÷${v.hpre}` },
    { key: 'pclk1', label: `PCLK1 ${Math.round(v.sysclk / v.hpre / v.ppre1)} MHz`, color: C.per, sub: `APB1 ÷${v.ppre1} · TIM×2` },
    { key: 'pclk2', label: `PCLK2 ${Math.round(v.sysclk / v.hpre / v.ppre2)} MHz`, color: C.per, sub: `APB2 ÷${v.ppre2}` },
  ]
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
  const list = nodes()

  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: `时钟树 · 预设「${p().key}」—— ${p().note}`,
      fontSize: 11,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 主链 6 节点：两行 3+3 ---------- */
  const nodeW = (x1 - x0 - 20 * 2) / 3
  const nodeH = 52
  const rowY = [34, 112]
  // 布局：第一行 HSE→PLL→SYSCLK，第二行 HCLK←(SYSCLK 下折)← 、PCLK1、PCLK2
  const positions = [
    { x: x0, y: rowY[0] },
    { x: x0 + nodeW + 20, y: rowY[0] },
    { x: x0 + (nodeW + 20) * 2, y: rowY[0] },
    { x: x0 + (nodeW + 20) * 2, y: rowY[1] },
    { x: x0 + nodeW + 20, y: rowY[1] },
    { x: x0, y: rowY[1] },
  ]

  list.forEach((n, i) => {
    const pos = positions[i]
    const on = i === stepIdx.value || i < stepIdx.value
    L.add(
      new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: nodeW,
        height: nodeH,
        fill: on ? '#ffffff' : '#f8fafc',
        stroke: i === stepIdx.value ? n.color : on ? n.color : C.grid,
        strokeWidth: i === stepIdx.value ? 2.2 : on ? 1.2 : 1,
        cornerRadius: 8,
      }),
    )
    L.add(
      new Konva.Text({
        x: pos.x + 8,
        y: pos.y + 8,
        text: n.label,
        fontSize: 10,
        fontFamily: FONT,
        fill: on ? n.color : C.dim,
        fontStyle: 'bold',
      }),
    )
    L.add(
      new Konva.Text({
        x: pos.x + 8,
        y: pos.y + 28,
        text: n.sub,
        fontSize: 8,
        fontFamily: FONT,
        fill: on ? C.text : C.dim,
      }),
    )
  })

  /* ---------- 连线 ---------- */
  const midY1 = rowY[0] + nodeH
  const arrow = (pts: number[], on: boolean) => {
    L.add(
      new Konva.Line({
        points: pts,
        stroke: on ? C.bus : C.dim,
        strokeWidth: on ? 2 : 1.2,
        dash: on ? undefined : [4, 3],
        markerEnd: undefined,
      }),
    )
  }
  arrow([x0 + nodeW, rowY[0] + nodeH / 2, x0 + nodeW + 20, rowY[0] + nodeH / 2], stepIdx.value >= 1)
  arrow([x0 + nodeW * 2 + 20, rowY[0] + nodeH / 2, x0 + nodeW * 2 + 40, rowY[0] + nodeH / 2], stepIdx.value >= 2)
  // SYSCLK 右侧下折到 HCLK
  const rx = x0 + nodeW * 3 + 6
  arrow([x0 + (nodeW + 20) * 2 + nodeW, rowY[0] + nodeH / 2, rx, rowY[0] + nodeH / 2, rx, rowY[1] + nodeH / 2, x0 + (nodeW + 20) * 2 + nodeW, rowY[1] + nodeH / 2], stepIdx.value >= 3)
  arrow([x0 + nodeW * 2 + 40, rowY[1] + nodeH / 2, x0 + nodeW * 2 + 20, rowY[1] + nodeH / 2], stepIdx.value >= 4)
  arrow([x0 + nodeW + 20, rowY[1] + nodeH / 2, x0 + nodeW, rowY[1] + nodeH / 2], stepIdx.value >= 5)

  /* ---------- 定时器换算卡 ---------- */
  const v = p()
  const timClk1 = v.ppre1 === 1 ? v.sysclk : Math.min(v.sysclk, Math.round(v.sysclk / v.ppre1) * 2)
  const ky = 178
  L.add(
    new Konva.Rect({
      x: x0,
      y: ky,
      width: x1 - x0,
      height: 44,
      fill: '#fffbeb',
      stroke: '#fde68a',
      strokeWidth: 1,
      cornerRadius: 7,
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 10,
      y: ky + 7,
      text: `定时器时钟联动：APB1 分频 ${v.ppre1} ≠ 1 → TIM2~4 实际 ${timClk1} MHz（自动 ×2），别拿 PCLK1 直接算 PSC/ARR`,
      fontSize: 8.8,
      fontFamily: FONT,
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0 + 10,
      y: ky + 24,
      text: `1 秒节拍：PSC = ${timClk1 * 1000 - 1}，ARR = 9999  →  T = (PSC+1)(ARR+1) / ${timClk1} MHz = 1 s`,
      fontSize: 8.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  void compact
}

/* ---------------- 状态推进 ---------------- */
function step() {
  stepIdx.value = (stepIdx.value + 1) % 6
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
  stepIdx.value = 0
  lastStep = 0
  acc = 0
  buildScene()
}

function pickPreset(i: number) {
  preset.value = i
  stepIdx.value = 0
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
    const interval = 800 / speed.value
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-amber-600 text-white">
          <AppIcon name="zap" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">时钟树 · 交互式动画</span>
        <span class="tag bg-amber-50 text-amber-700">Konva</span>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="(ps, i) in ['HSI 8M', 'HSE×9 72M', 'HSE×6 48M']"
          :key="i"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="preset === i ? 'bg-amber-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="pickPreset(i)"
        >
          {{ ps }}
        </button>
        <button class="btn-ghost btn-sm" @click="togglePlay">
          <AppIcon :name="playing ? 'clock' : 'play'" :size="13" />
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button class="btn-ghost btn-sm" @click="reset">
          <AppIcon name="refresh" :size="13" />
          复位
        </button>
        <button
          v-for="s in [1, 2, 4]"
          :key="s"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="speed === s ? 'bg-amber-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">SYSCLK</div>
        <div class="mt-0.5 font-mono text-base font-bold text-rose-600">{{ p().sysclk }} MHz</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">APB1 / TIM 时钟</div>
        <div class="mt-0.5 font-mono text-base font-bold text-emerald-600">
          {{ Math.round(p().sysclk / p().ppre1) }} / {{ p().ppre1 === 1 ? p().sysclk : Math.min(p().sysclk, Math.round(p().sysclk / p().ppre1) * 2) }} MHz
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Flash 等待周期</div>
        <div class="mt-0.5 font-mono text-base font-bold text-amber-600">WS = {{ p().flashWs }}</div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        频率是<b class="text-ink-700">逐级"过路费"算出来的</b>：晶振进 PLL 倍频、经 AHB/APB 预分频才落到外设。
        切预设看节点数字的联动——SYSCLK 变了，APB1 永远被硬件上限卡在 36 MHz，但定时器时钟会自动 ×2。
      </p>
      <p class="text-ink-400">
        配置顺序也在这条链里：先 HSE 稳定 → Flash 等待周期 → PLL 锁定 → 切 SYSCLK。
        顺序颠倒（尤其先切频再配 Flash）会直接取指不稳导致 HardFault。
      </p>
    </div>
  </div>
</template>
