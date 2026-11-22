<script setup lang="ts">
/**
 * 交互式动画 ⑥：32 位寄存器位操作（Konva）
 * ------------------------------------------------------------------
 * 要讲清楚的一件事：**|= 置位、&= ~ 清零、^= 翻转，掩码从哪来**。
 *
 * 画布内容：
 *   - 一个 32 位寄存器，拆成两行（bit31~16 / bit15~0），每 4 位一组分隔
 *   - 值为 1 的位高亮填充，值为 0 的位白底
 *   - 点击某一位，按当前模式对它做置位/清零/翻转，被改的位闪一圈
 * 交互：
 *   - 三种模式切换，右侧代码行同步显示 `REG |= (1U << n)` 这类语句与掩码
 *   - 顶部读数同步显示 hex / 二进制 / 十进制
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 状态 ---------------- */

type Mode = 'set' | 'clear' | 'toggle'

const state = reactive({
  value: 0,
  mode: 'set' as Mode,
})
const lastBit = ref<number | null>(null)

/** 位号 → 是否置位（注意 bit31 是符号位位置，必须用无符号运算） */
const bitOn = (i: number) => ((state.value >>> i) & 1) === 1

const hexText = computed(() => {
  const h = (state.value >>> 0).toString(16).toUpperCase().padStart(8, '0')
  return `0x${h.slice(0, 4)}_${h.slice(4)}`
})
const decText = computed(() => String(state.value >>> 0))
const binText = computed(() => {
  const b = (state.value >>> 0).toString(2).padStart(32, '0')
  return b.slice(0, 16) + ' ' + b.slice(16)
})
const maskText = computed(() => {
  if (lastBit.value == null) return '—'
  const m = (1 << lastBit.value) >>> 0
  return `0x${m.toString(16).toUpperCase().padStart(8, '0')}`
})
const codeLine = computed(() => {
  const n = lastBit.value
  if (n == null) return '// 点击任意一位试试'
  if (state.mode === 'set') return `REG |=  (1U << ${n});`
  if (state.mode === 'clear') return `REG &= ~(1U << ${n});`
  return `REG ^=  (1U << ${n});`
})

/* ---------------- Konva ---------------- */

const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let ro: ResizeObserver | null = null
/** 本次点击后被修改的那一位，用于做淡出闪光 */
let ringNode: Konva.Rect | null = null
let pendingTween: Konva.Tween | null = null

const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace'
const C = {
  on: '#2549eb',
  onSoft: '#eef3ff',
  off: '#ffffff',
  stroke: '#dbe3ef',
  text: '#64748b',
  dim: '#94a3b8',
  flash: '#f59e0b',
}

const H = 200
const ROWS: Array<{ from: number; y: number }> = [
  { from: 31, y: 26 }, // bit31 → bit16，从左往右降序
  { from: 15, y: 100 }, // bit15 → bit0
]

function buildScene() {
  if (!stage || !layer) return
  layer.destroyChildren()
  ringNode = null

  const w = stage.width()
  // 窄屏重排的瞬间，容器宽度可能被量到几十像素，
  // 此时按宽度算出的格子/绘图区会变成负数，Konva 画圆角矩形时会抛
  // IndexSizeError: radius is negative。宽度不足就先跳过绘制，
  // 等 ResizeObserver 拿到最终宽度后再重建场景。
  if (w < 160) return

  const padL = 12
  const padR = 12
  const cols = 16
  const cellW = (w - padL - padR) / cols
  const cellH = 52

  for (const row of ROWS) {
    const { y } = row
    /* 行标签：说明这一行是高 16 位还是低 16 位 */
    layer.add(
      new Konva.Text({
        x: padL,
        y: y - 14,
        text: row.from === 31 ? 'bit 31 → 16' : 'bit 15 → 0',
        fontSize: 9.5,
        fontFamily: MONO,
        fill: C.dim,
      }),
    )

    for (let c = 0; c < cols; c++) {
      const bitIdx = row.from - c
      const on = bitOn(bitIdx)
      const x = padL + c * cellW

      /* 每 4 位画一条分隔线，方便按 nibble 读 */
      if (c > 0 && c % 4 === 0) {
        layer.add(
          new Konva.Line({
            points: [x, y - 2, x, y + cellH + 2],
            stroke: '#cbd5e1',
            strokeWidth: 1.2,
          }),
        )
      }

      const rect = new Konva.Rect({
        x: x + 1.5,
        y,
        width: cellW - 3,
        height: cellH,
        fill: on ? C.on : C.off,
        stroke: on ? C.on : C.stroke,
        strokeWidth: 1,
        cornerRadius: 4,
      })
      /* 自定义属性 + 点击回调：点击这一位就执行当前操作 */
      rect.on('mouseenter', () => {
        if (stage) stage.container().style.cursor = 'pointer'
      })
      rect.on('mouseleave', () => {
        if (stage) stage.container().style.cursor = 'default'
      })
      rect.on('click tap', () => applyBit(bitIdx))
      layer!.add(rect)

      layer.add(
        new Konva.Text({
          x,
          y: y + cellH / 2 - 9,
          width: cellW,
          align: 'center',
          text: String((state.value >>> bitIdx) & 1),
          fontSize: Math.min(15, cellW * 0.62),
          fontFamily: MONO,
          fontStyle: 'bold',
          fill: on ? '#ffffff' : '#cbd5e1',
          listening: false,
        }),
      )

      /* 位号 */
      layer.add(
        new Konva.Text({
          x,
          y: y + cellH + 5,
          width: cellW,
          align: 'center',
          text: String(bitIdx),
          fontSize: Math.min(9, cellW * 0.42),
          fontFamily: MONO,
          fill: C.dim,
          listening: false,
        }),
      )
    }
  }

  /* 被点击的那一位：加一圈橙色描边，随后淡出 */
  if (lastBit.value != null) {
    const row = lastBit.value >= 16 ? ROWS[0] : ROWS[1]
    const c = row.from - lastBit.value
    const x = padL + c * cellW
    ringNode = new Konva.Rect({
      x: x - 1,
      y: row.y - 4,
      width: cellW + 2,
      height: cellH + 8,
      stroke: C.flash,
      strokeWidth: 2,
      cornerRadius: 6,
      listening: false,
    })
    layer.add(ringNode)
  }

  layer.draw()
}

/** 对第 n 位执行当前模式的操作 */
function applyBit(n: number) {
  const m = (1 << n) >>> 0
  if (state.mode === 'set') state.value = (state.value | m) >>> 0
  else if (state.mode === 'clear') state.value = (state.value & ~m) >>> 0
  else state.value = (state.value ^ m) >>> 0

  lastBit.value = n
  buildScene()

  /* 闪光淡出：不重建场景，只让描边自己消失 */
  pendingTween?.destroy()
  if (ringNode) {
    pendingTween = new Konva.Tween({
      node: ringNode,
      duration: 0.75,
      opacity: 0,
      easing: Konva.Easings.EaseOut,
    })
    pendingTween.play()
  }
}

function setMode(m: Mode) {
  state.mode = m
}

function reset() {
  state.value = 0
  lastBit.value = null
  buildScene()
}

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
  pendingTween?.destroy()
  stage?.destroy()
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-violet-600 text-white">
          <AppIcon name="grid" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">32 位寄存器 · 点击某一位执行操作</span>
        <span class="tag bg-brand-50 text-brand-700">Konva</span>
      </div>
      <button class="btn-ghost btn-sm" @click="reset">
        <AppIcon name="refresh" :size="13" />
        清零
      </button>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 数据面板 -->
    <div class="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">REG (hex)</div>
        <div class="mt-0.5 font-mono text-[13px] font-bold text-brand-700">{{ hexText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">十进制</div>
        <div class="mt-0.5 font-mono text-sm font-bold text-ink-900">{{ decText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">本次掩码</div>
        <div class="mt-0.5 font-mono text-[13px] font-bold text-amber-600">{{ maskText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">操作位</div>
        <div class="mt-0.5 font-mono text-sm font-bold text-ink-900">
          {{ lastBit == null ? '—' : 'bit ' + lastBit }}
        </div>
      </div>
    </div>

    <!-- 控制区 -->
    <div class="space-y-3 px-4 py-4">
      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors"
          :class="
            state.mode === 'set'
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-200 bg-white text-ink-500 hover:bg-slate-50'
          "
          @click="setMode('set')"
        >
          置位 |=
        </button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors"
          :class="
            state.mode === 'clear'
              ? 'border-rose-500 bg-rose-50 text-rose-600'
              : 'border-slate-200 bg-white text-ink-500 hover:bg-slate-50'
          "
          @click="setMode('clear')"
        >
          清零 &= ~
        </button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors"
          :class="
            state.mode === 'toggle'
              ? 'border-amber-500 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-white text-ink-500 hover:bg-slate-50'
          "
          @click="setMode('toggle')"
        >
          翻转 ^=
        </button>
      </div>

      <div class="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2.5">
        <div class="font-mono text-[12px] font-bold text-emerald-300">{{ codeLine }}</div>
        <div class="mt-1 whitespace-nowrap font-mono text-[10.5px] text-slate-400">
          {{ binText }}
        </div>
      </div>

      <p class="text-[11.5px] leading-relaxed text-ink-400">
        提示：点 <span class="font-mono text-brand-600">置位 |=</span> 再点某一位，看它从 0 变 1；
        切到 <span class="font-mono text-rose-500">清零 &= ~</span> 再点同一位，看它变回 0。
        掩码永远是 <span class="font-mono">1 &lt;&lt; n</span>，清零时别忘了取反。
      </p>
    </div>
  </div>
</template>
