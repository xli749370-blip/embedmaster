<script setup lang="ts">
/**
 * 交互式动画 ㉕：HardFault 取证 —— 从崩溃到代码行
 * ------------------------------------------------------------------
 * 场景：代码执行到 *(volatile uint32_t*)0x3000_0000 = 1（未映射地址）
 *       触发 BusFault。演示完整取证链：触发 → 硬件自动压栈 8 寄存器 →
 *       读 CFSR 判原因 → 从栈帧 PC 定位回出错的代码行。
 * 画布内容：
 *   - 左：代码窗口，当前执行行高亮，出错行标红
 *   - 右：栈帧 8 寄存器从上到下逐个"压入"，PC 格最终高亮
 *   - 底部：CFSR / BFAR 寄存器读数 + 取证结论
 * 交互：播放 / 单步 / 复位 / 1x·2x·4x 调速
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

const H = 248

const playing = ref(true)
const speed = ref(1)
const stepIdx = ref(-1) // 0..7

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  code: '#0f172a',
  isr: '#7c3aed',
  push: '#0891b2',
  hi: '#dc2626',
  ok: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
}

/** 取证 8 步 */
interface FStep {
  name: string
  desc: string
  log: string
}

const steps: FStep[] = [
  { name: '执行写操作', desc: 'CPU 发起对 0x3000_0000 的写', log: 'main 里执行 *(uint32_t*)0x30000000 = 1' },
  { name: '总线报错', desc: '该地址未映射 → 总线返回错误', log: '总线错误！CPU 收到 error response' },
  { name: '挂起 BusFault', desc: 'NVIC 记录故障，触发异常入口', log: 'NVIC 置 BusFault active，CFSR.PRECISERR=1' },
  { name: '自动压栈', desc: 'xPSR/PC/LR/R12/R3~R0 共 8 字压入栈', log: '硬件压栈：出错时的 PC 已被保存' },
  { name: '记录地址', desc: '出错地址写入 BFAR（精确错误才有）', log: 'BFAR = 0x30000000（PRECISERR → 地址可信）' },
  { name: '进 Handler', desc: '跳向 BusFault_Handler / HardFault_Handler', log: 'PC = BusFault_Handler，开始取证' },
  { name: '读 CFSR', desc: '0xE000ED28 读细分原因', log: 'CFSR = 0x00008200：PRECISERR 置位' },
  { name: '解析栈帧', desc: 'frame[6] = PC → 反查 MAP 定位代码行', log: '栈帧 PC = 0x08001F4A → main 第 42 行' },
]

/** 栈帧寄存器（压栈后从低地址到高地址） */
const frameRegs = [
  { k: 'R0', v: '0x30000000' },
  { k: 'R1', v: '0x00000001' },
  { k: 'R2', v: '0x20000348' },
  { k: 'R3', v: '0x30000000' },
  { k: 'R12', v: '0x00000000' },
  { k: 'LR', v: '0x08001F7D' },
  { k: 'PC', v: '0x08001F4A' },
  { k: 'xPSR', v: '0x61000000' },
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
  const st = steps[stepIdx.value]

  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: 'HardFault 取证流程：左看代码走到哪，右看栈帧存了什么',
      fontSize: 11,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 左：代码窗口 ---------- */
  const codeW = (x1 - x0) * (compact ? 0.55 : 0.5)
  const codeY = 30
  const codeH = 158
  L.add(
    new Konva.Rect({ x: x0, y: codeY, width: codeW, height: codeH, fill: '#0f172a', cornerRadius: 8 }),
  )
  const codeLines = [
    { t: 'int main(void) {', active: false },
    { t: '  HAL_Init();', active: false },
    { t: '  MX_GPIO_Init();', active: false },
    { t: '  /* 误把地址写成 0x3000_0000 */', active: false },
    { t: '*(uint32_t*)0x30000000 = 1;', active: true, fault: true },
    { t: '  while (1) { led_blink(); }', active: false },
    { t: '}', active: false },
  ]
  codeLines.forEach((ln, i) => {
    if (ln.active && stepIdx.value >= 0) {
      L.add(
        new Konva.Rect({
          x: x0 + 4,
          y: codeY + 12 + i * 19,
          width: codeW - 8,
          height: 18,
          fill: '#7f1d1d',
          cornerRadius: 3,
        }),
      )
    }
    L.add(
      new Konva.Text({
        x: x0 + 10,
        y: codeY + 16 + i * 19,
        text: `${String(i + 1).padStart(2, ' ')} │ ${ln.t}`,
        fontSize: 8.6,
        fontFamily: 'Consolas, monospace',
        fill: ln.fault && stepIdx.value >= 1 ? '#fca5a5' : '#e2e8f0',
        fontStyle: ln.fault ? 'bold' : 'normal',
      }),
    )
  })
  L.add(
    new Konva.Text({
      x: x0 + 10,
      y: codeY + codeH - 12,
      text: stepIdx.value >= 1 ? '第 5 行：访问未映射地址' : '正常执行中…',
      fontSize: 8,
      fontFamily: FONT,
      fill: stepIdx.value >= 1 ? '#f87171' : '#94a3b8',
      fontStyle: 'bold',
    }),
  )

  /* ---------- 右：栈帧 8 寄存器 ---------- */
  const fx = x0 + codeW + (compact ? 8 : 16)
  const fw = x1 - fx
  L.add(
    new Konva.Text({
      x: fx,
      y: codeY - 2,
      text: '栈帧（压栈后内存，低地址在前）',
      fontSize: 9,
      fontFamily: FONT,
      fill: C.text,
      fontStyle: 'bold',
    }),
  )
  const rh = 17
  const pushed = stepIdx.value >= 4 // 压栈步骤之后栈帧有内容
  const resolved = stepIdx.value >= 7
  frameRegs.forEach((r, i) => {
    const ry = codeY + 14 + i * rh
    const isPC = r.k === 'PC'
    const shown = pushed
    L.add(
      new Konva.Rect({
        x: fx,
        y: ry,
        width: fw,
        height: rh - 3,
        fill: isPC && resolved ? '#f0fdf4' : shown ? '#f8fafc' : '#ffffff',
        stroke: isPC && resolved ? C.ok : shown ? C.grid : '#f1f5f9',
        strokeWidth: isPC && resolved ? 1.8 : 1,
        cornerRadius: 3,
      }),
    )
    L.add(
      new Konva.Text({
        x: fx + 6,
        y: ry + 3,
        text: r.k,
        fontSize: 8.5,
        fontFamily: 'Consolas, monospace',
        fill: shown ? (isPC && resolved ? C.ok : C.strong) : C.dim,
        fontStyle: isPC ? 'bold' : 'normal',
      }),
    )
    L.add(
      new Konva.Text({
        x: fx + fw - 84,
        y: ry + 3,
        width: 78,
        align: 'right',
        text: shown ? r.v : '· · ·',
        fontSize: 8.5,
        fontFamily: 'Consolas, monospace',
        fill: shown ? (isPC && resolved ? C.ok : C.text) : '#e2e8f0',
        fontStyle: isPC && resolved ? 'bold' : 'normal',
      }),
    )
  })

  /* ---------- 底部：CFSR / BFAR + 结论 ---------- */
  const by = 196
  L.add(
    new Konva.Text({
      x: x0,
      y: by,
      text: `CFSR = 0x${stepIdx.value >= 6 ? '00008200' : '00000000'}    BFAR = ${stepIdx.value >= 5 ? '0x30000000' : '0x00000000'}    HFSR.FORCED = ${stepIdx.value >= 3 ? 1 : 0}`,
      fontSize: 8.6,
      fontFamily: 'Consolas, monospace',
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0,
      y: by + 16,
      text: st ? `▸ ${st.log}` : '点播放：看一次非法地址写如何从"崩溃"变成"定位到代码行"',
      fontSize: 8.6,
      fontFamily: FONT,
      fill: stepIdx.value >= 7 ? C.ok : C.strong,
      fontStyle: 'bold',
    }),
  )
  void compact
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
    const interval = 820 / speed.value
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-rose-600 text-white">
          <AppIcon name="alert" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">HardFault 取证 · 交互式动画</span>
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
        <button
          v-for="s in [1, 2, 4]"
          :key="s"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="speed === s ? 'bg-rose-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">细分原因</div>
        <div class="mt-0.5 text-sm font-bold" :class="stepIdx >= 6 ? 'text-rose-600' : 'text-ink-400'">
          {{ stepIdx >= 6 ? 'BusFault·精确' : '待判' }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">出错地址</div>
        <div class="mt-0.5 font-mono text-sm font-bold" :class="stepIdx >= 5 ? 'text-ink-900' : 'text-ink-300'">
          {{ stepIdx >= 5 ? '0x30000000' : '——' }}
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">定位结果</div>
        <div class="mt-0.5 text-sm font-bold" :class="stepIdx >= 7 ? 'text-emerald-600' : 'text-ink-400'">
          {{ stepIdx >= 7 ? 'main 第 5 行' : '待解析栈帧' }}
        </div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        崩溃现场没有消失，它就在栈里：硬件压栈的 <b class="text-ink-700">PC 就是出错指令的地址</b>。
        汇编桩判一下 MSP/PSP，frame[6] 拿 PC，减闪存基址查 MAP，三步落到代码行。
      </p>
      <p class="text-ink-400">
        看到 HFSR.FORCED=1 别硬啃——那是别的 fault 没开使能被升级上来的。IMPRECISERR 的 BFAR 不可信
        （写缓冲延迟），先关写缓冲复现成精确错误再查。
      </p>
    </div>
  </div>
</template>
