<script setup lang="ts">
/**
 * 交互式动画 ㉔：内存布局 —— .data/.bss/heap/stack 与栈撞堆
 * ------------------------------------------------------------------
 * 场景：把 32KB SRAM 摊开，从 0x2000_0000 到栈顶。播放时按"声明变量"
 *       的顺序逐个落位：g_init→.data、g_count→.bss、malloc→heap、
 *       局部变量→栈帧入栈……最后演示递归把栈压进堆、踩坏堆数据的瞬间。
 * 画布内容：
 *   - 左侧：SRAM 纵向内存条（5 段），带地址刻度
 *   - 右侧：代码动作日志（声明 → 落位 → 地址）
 *   - 栈溢出步骤：栈指针越过堆顶，被踩区域标红
 * 交互：播放 / 单步 / 复位 / 1x·2x·4x 调速
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

const H = 252

const playing = ref(true)
const speed = ref(1)
const stepIdx = ref(-1)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  data: '#0891b2',
  bss: '#0ea5e9',
  heap: '#d97706',
  stack: '#7c3aed',
  hi: '#dc2626',
  ok: '#059669',
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
}

/** 8 步动作脚本 */
interface MemStep {
  name: string
  desc: string
  seg: 'data' | 'bss' | 'heap' | 'stack' | 'crash' | 'none'
  addr: string
  log: string
}

const steps: MemStep[] = [
  { name: '启动代码', desc: '搬 .data、清 .bss（第一章做的事）', seg: 'none', addr: '—', log: '启动：.data 从闪存复制、.bss 清零' },
  { name: 'int g=5', desc: '已初始化全局 → .data 段', seg: 'data', addr: '0x2000_0000', log: 'g_init 落位 .data，初始值从闪存搬来' },
  { name: 'int g;', desc: '未初始化全局 → .bss 段', seg: 'bss', addr: '0x2000_0004', log: 'g_count 落位 .bss（启动时被清 0）' },
  { name: 'buf[512]', desc: '静态数组 → .bss（static 或全局同理）', seg: 'bss', addr: '0x2000_0008', log: 'adc_buf[512] 落位 .bss，占 512 字节' },
  { name: 'malloc(1024)', desc: '运行期分配 → 堆顶向上推 1024', seg: 'heap', addr: '0x2000_0208', log: 'heap 指针上移，返回 0x2000_0208' },
  { name: '调用函数', desc: '局部变量 + 返回地址 → 栈帧入栈', seg: 'stack', addr: '0x2000_4FC0', log: 'SP 下移 64 字节，压入函数栈帧' },
  { name: '递归 48 层', desc: '每层 256 字节 → 栈向低地址狂奔', seg: 'stack', addr: '0x2000_2CC0', log: '48 × 256 = 12288 字节，逼近堆顶' },
  { name: '撞穿！', desc: '栈写入堆区，堆数据被静默踩坏', seg: 'crash', addr: '0x2000_0600', log: 'SP 越过堆顶 → malloc 的缓冲区被踩' },
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
      text: compact ? 'SRAM 内存条：堆向上长、栈向下长' : 'SRAM 内存条（0x2000_0000 起）：堆向上长、栈向下长，中间是安全余量',
      fontSize: 11,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 左：内存条（纵向） ---------- */
  const barX = x0
  const barY = 30
  const barW = compact ? 104 : 150
  const barH = 196
  const segs = [
    { key: 'data', label: '.data', frac: 0.14, color: '#cffafe' },
    { key: 'bss', label: '.bss', frac: 0.24, color: '#a5f3fc' },
    { key: 'heap', label: 'heap', frac: 0.2, color: '#fef3c7' },
    { key: 'free', label: '空闲余量', frac: 0.2, color: '#f8fafc' },
    { key: 'stack', label: 'stack', frac: 0.22, color: '#ede9fe' },
  ]
  let sy = barY
  segs.forEach((s) => {
    const sh = barH * s.frac
    const activeSeg = steps[stepIdx.value]?.seg === s.key
    const crash = steps[stepIdx.value]?.seg === 'crash' && (s.key === 'heap' || s.key === 'stack')
    L.add(
      new Konva.Rect({
        x: barX,
        y: sy,
        width: barW,
        height: sh - 2,
        fill: s.color,
        stroke: activeSeg ? C.hi : crash ? C.hi : C.grid,
        strokeWidth: activeSeg ? 2.2 : crash ? 2 : 0.8,
        cornerRadius: 4,
      }),
    )
    L.add(
      new Konva.Text({
        x: barX + 6,
        y: sy + sh / 2 - 6,
        text: s.label,
        fontSize: 9,
        fontFamily: FONT,
        fill: activeSeg ? C.hi : '#475569',
        fontStyle: activeSeg ? 'bold' : 'normal',
      }),
    )
    sy += sh
  })
  // 地址刻度：窄屏只留顶部的起点地址，避免两条刻度在 104px 宽里打架
  L.add(new Konva.Text({ x: barX, y: barY - 11, text: '0x2000_0000', fontSize: 7.5, fontFamily: FONT, fill: C.dim }))
  if (!compact) {
    L.add(
      new Konva.Text({
        x: barX + barW - 62,
        y: barY + barH - 12,
        text: '0x2000_8000',
        fontSize: 7.5,
        fontFamily: FONT,
        fill: C.dim,
      }),
    )
  }

  /* 撞穿标记：栈段顶部与堆段底部之间画红色闪电 */
  if (stepIdx.value === 7) {
    const crashY = barY + barH * (0.14 + 0.24 + 0.2) - 2
    L.add(
      new Konva.Text({
        x: barX + barW + 4,
        y: crashY - 8,
        text: '⚡栈越过堆顶',
        fontSize: 9,
        fontFamily: FONT,
        fill: C.hi,
        fontStyle: 'bold',
      }),
    )
  }

  /* ---------- 右：步骤列表（4×2 网格） ---------- */
  const gx = compact ? barX + barW + 10 : barX + barW + 22
  const cols = 2
  const rowsN = 4
  const cw = (x1 - gx - 6 * (cols - 1)) / cols
  const ch = (barH - 18) / rowsN
  steps.forEach((st, i) => {
    const cx = gx + (i % cols) * (cw + 6)
    const cy = barY + Math.floor(i / cols) * (ch + 6)
    const active = i === stepIdx.value
    const done = i >= 0 && i < stepIdx.value
    L.add(
      new Konva.Rect({
        x: cx,
        y: cy,
        width: cw,
        height: ch - 6,
        fill: active ? '#fef2f2' : done ? '#f8fafc' : '#ffffff',
        stroke: active ? C.hi : done ? C.ok : C.grid,
        strokeWidth: active ? 2 : 1,
        cornerRadius: 5,
      }),
    )
    // 窄屏不放地址（太长必然越界），地址统一看底部日志
    const title = compact ? `${i + 1}. ${st.name}` : `${i + 1}. ${st.name}  ${st.addr !== '—' ? '@ ' + st.addr : ''}`
    L.add(
      new Konva.Text({
        x: cx + 5,
        y: cy + 3,
        width: cw - 8,
        text: title,
        fontSize: compact ? 7.2 : 7.8,
        fontFamily: FONT,
        fill: active ? C.hi : done ? C.ok : C.dim,
        fontStyle: active ? 'bold' : 'normal',
      }),
    )
    L.add(
      new Konva.Text({
        x: cx + 5,
        y: cy + 14,
        width: cw - 8,
        text: st.desc,
        fontSize: compact ? 6.2 : 7,
        fontFamily: FONT,
        fill: active ? C.strong : C.text,
        lineHeight: 1.2,
      }),
    )
  })

  /* ---------- 底部日志 ---------- */
  const st = steps[stepIdx.value]
  L.add(
    new Konva.Text({
      x: x0,
      y: H - 18,
      text: st ? `▸ ${st.log}` : '点播放：按声明顺序看每个变量落到哪一段，最后看递归如何无声撞穿堆',
      fontSize: 8.8,
      fontFamily: FONT,
      fill: st?.seg === 'crash' ? C.hi : C.strong,
      fontStyle: 'bold',
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
    const interval = 850 / speed.value
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-sky-600 text-white">
          <AppIcon name="layers" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">内存布局 · 交互式动画</span>
        <span class="tag bg-sky-50 text-sky-700">Konva</span>
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
          :class="speed === s ? 'bg-sky-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">.data 去</div>
        <div class="mt-0.5 text-sm font-bold text-cyan-700">RAM（闪存放初值）</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">const 去</div>
        <div class="mt-0.5 text-sm font-bold text-emerald-600">闪存 .rodata</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">局部变量去</div>
        <div class="mt-0.5 text-sm font-bold text-violet-700">栈（不保初值）</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">栈溢出后果</div>
        <div class="mt-0.5 text-sm font-bold" :class="stepIdx === 7 ? 'text-rose-600' : 'text-ink-500'">
          {{ stepIdx === 7 ? '踩坏堆数据' : '编译器不管' }}
        </div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        决定变量去处的只有三件事：<b class="text-ink-700">生命周期、可写性、初始值</b>。
        `const` 局部量仍在栈上，`static` 局部量在 .data/.bss——static 只改可见性，不改存储位置。
      </p>
      <p class="text-ink-400">
        第 8 步的车祸没有编译器报错：递归每层吃 256 字节，栈指针越过堆顶后，每写一个局部变量就踩坏一处堆数据。
        防线三件套——静态核算栈需求、上电涂 0xA5 测水位线、MPU 设不可访问区。
      </p>
    </div>
  </div>
</template>
