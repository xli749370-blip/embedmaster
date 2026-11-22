<script setup lang="ts">
/**
 * 交互式动画 ⑤：指针与内存视图（Konva）
 * ------------------------------------------------------------------
 * 要讲清楚的一件事：**指针算术的单位是元素，不是字节**。
 *
 * 画布内容：
 *   - 一段 16 字节的 RAM，按字节画成格子，格子里是该字节的值
 *   - 按当前类型把字节分组成"元素"，元素编号画在格子上方
 *   - 指针 p 的方框浮在目标元素上方，一条箭头指向它，箭头上有一颗光点反复流过
 *   - 底部实时算出 p 的地址、*p 的值（按小端拼字节）
 * 交互：
 *   - 切换 uint8_t / uint16_t / uint32_t：同一个 p+1 走 1 / 2 / 4 字节
 *   - 拖动偏移或按 p++ / p--，观察地址与解引用结果同步变化
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 参数 ---------------- */

type CType = 'uint8_t' | 'uint16_t' | 'uint32_t'
const SIZES: Record<CType, number> = { uint8_t: 1, uint16_t: 2, uint32_t: 4 }

const params = reactive({ type: 'uint32_t' as CType, offset: 1 })

/** 一段内存的初始内容（刻意选成 0x12345678 / 0xDEADBEEF，切到 32 位时一眼能认出来） */
const MEM: number[] = [
  0x78, 0x56, 0x34, 0x12,
  0xef, 0xbe, 0xad, 0xde,
  0x00, 0x01, 0x02, 0x03,
  0xa5, 0x5a, 0xff, 0x0f,
]
const BASE = 0x20000000
const BYTES = 16

/* ---------------- 计算 ---------------- */

const size = computed(() => SIZES[params.type])
/** 每种类型下最多能取到第几个元素 */
const maxOffset = computed(() => BYTES / size.value - 1)
/** 当前元素的起始字节下标 */
const byteStart = computed(() => params.offset * size.value)
/** p 指向的地址 */
const addr = computed(() => BASE + byteStart.value)
/** 解引用：按小端把 size 个字节拼成一个数 */
const deref = computed(() => {
  let v = 0
  for (let i = size.value - 1; i >= 0; i--) {
    v = (v << 8) | MEM[byteStart.value + i]
  }
  return v
})

const hex = (n: number, w: number) => '0x' + n.toString(16).toUpperCase().padStart(w, '0')
const addrText = (n: number) => hex(n, 8).replace(/(0x[0-9A-F]{4})([0-9A-F]{4})/, '$1_$2')
const derefText = computed(() => hex(deref.value, size.value * 2))

/* ---------------- Konva ---------------- */

const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

/** 光点在箭头上移动的起止点，buildScene 时更新 */
let pulseFrom = { x: 0, y: 0 }
let pulseTo = { x: 0, y: 0 }
let pulseDot: Konva.Circle | null = null

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace'
const C = {
  cell: '#ffffff',
  cellStroke: '#dbe3ef',
  text: '#64748b',
  strong: '#0f172a',
  symbol: '#94a3b8',
  accent: '#2549eb',
  accentSoft: '#eef3ff',
  group: '#f8fafc',
  arrow: '#f59e0b',
}

const H = 250

function buildScene() {
  if (!stage || !layer) return
  layer.destroyChildren()

  const w = stage.width()
  // 窄屏重排的瞬间，容器宽度可能被量到几十像素，
  // 此时按宽度算出的格子/绘图区会变成负数，Konva 画圆角矩形时会抛
  // IndexSizeError: radius is negative。宽度不足就先跳过绘制，
  // 等 ResizeObserver 拿到最终宽度后再重建场景。
  if (w < 160) return

  const padL = 14
  const padR = 14
  const cellW = (w - padL - padR) / BYTES
  const stripY = 96
  const cellH = 46

  const sz = size.value

  /* ---------- 1. 元素分组底纹（每 size 个字节一块，交替浅色） ---------- */
  for (let e = 0; e < BYTES / sz; e++) {
    const x = padL + e * sz * cellW
    layer.add(
      new Konva.Rect({
        x,
        y: stripY - 22,
        width: sz * cellW,
        height: cellH + 40,
        fill: e % 2 === 0 ? C.group : '#ffffff',
        stroke: C.cellStroke,
        strokeWidth: 1,
        cornerRadius: 5,
      }),
    )
    /* 元素编号 */
    layer.add(
      new Konva.Text({
        x,
        y: stripY - 20,
        width: sz * cellW,
        align: 'center',
        text: `[${e}]`,
        fontSize: 9.5,
        fontFamily: MONO,
        fill: C.symbol,
      }),
    )
  }

  /* ---------- 2. 字节格子 ---------- */
  for (let i = 0; i < BYTES; i++) {
    const x = padL + i * cellW
    const isTarget = i >= byteStart.value && i < byteStart.value + sz
    layer.add(
      new Konva.Rect({
        x: x + 1,
        y: stripY,
        width: cellW - 2,
        height: cellH,
        fill: isTarget ? C.accentSoft : C.cell,
        stroke: isTarget ? C.accent : C.cellStroke,
        strokeWidth: isTarget ? 1.8 : 1,
        cornerRadius: 3,
      }),
    )
    layer.add(
      new Konva.Text({
        x,
        y: stripY + 11,
        width: cellW,
        align: 'center',
        text: MEM[i].toString(16).toUpperCase().padStart(2, '0'),
        fontSize: Math.min(11.5, cellW * 0.46),
        fontFamily: MONO,
        fontStyle: isTarget ? 'bold' : 'normal',
        fill: isTarget ? C.accent : C.text,
      }),
    )
    /* 字节偏移标注 */
    layer.add(
      new Konva.Text({
        x,
        y: stripY + cellH - 15,
        width: cellW,
        align: 'center',
        text: String(i),
        fontSize: 8.5,
        fontFamily: MONO,
        fill: C.symbol,
      }),
    )
  }

  /* ---------- 3. 基址标注 ---------- */
  layer.add(
    new Konva.Text({
      x: padL,
      y: stripY - 42,
      text: `uint8_t mem[16]   基址 ${addrText(BASE)}`,
      fontSize: 10,
      fontFamily: MONO,
      fill: C.text,
    }),
  )
  layer.add(
    new Konva.Text({
      x: padL,
      y: stripY + cellH + 24,
      text: '小端存储：低字节在低地址',
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.symbol,
    }),
  )

  /* ---------- 4. 指针方框 + 箭头 ---------- */
  const targetCx = padL + (byteStart.value + sz / 2) * cellW
  const boxW = 132
  const boxH = 26
  const boxY = 16
  /* 让方框尽量居中在目标上方，但不出画布 */
  const boxX = Math.max(padL, Math.min(w - padR - boxW, targetCx - boxW / 2))

  layer.add(
    new Konva.Rect({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      fill: '#fff7ed',
      stroke: C.arrow,
      strokeWidth: 1.4,
      cornerRadius: 6,
    }),
  )
  layer.add(
    new Konva.Text({
      x: boxX + 8,
      y: boxY + 6,
      text: `p = ${addrText(addr.value)}`,
      fontSize: 10.5,
      fontFamily: MONO,
      fontStyle: 'bold',
      fill: '#b45309',
    }),
  )

  /* 箭头：从方框底部走到目标元素顶边 */
  const from = { x: Math.min(Math.max(targetCx, boxX + 14), boxX + boxW - 14), y: boxY + boxH }
  const to = { x: targetCx, y: stripY - 22 }
  pulseFrom = from
  pulseTo = to

  layer.add(
    new Konva.Arrow({
      points: [from.x, from.y, from.x, (from.y + to.y) / 2, to.x, to.y],
      fill: C.arrow,
      stroke: C.arrow,
      strokeWidth: 1.6,
      pointerLength: 7,
      pointerWidth: 7,
      tension: 0.35,
    }),
  )

  /* 流动光点：表示"顺着 p 找到目标"这个过程 */
  pulseDot = new Konva.Circle({
    x: from.x,
    y: from.y,
    radius: 3.2,
    fill: C.arrow,
    opacity: 0.9,
  })
  layer.add(pulseDot)

  /* ---------- 5. 解引用结果 ---------- */
  layer.add(
    new Konva.Text({
      x: padL,
      y: stripY + cellH + 46,
      text: `*p = ${derefText.value}   （读取 ${sz} 字节）`,
      fontSize: 11.5,
      fontFamily: MONO,
      fontStyle: 'bold',
      fill: C.strong,
    }),
  )

  layer.draw()
}

function step(delta: number) {
  const next = params.offset + delta
  if (next < 0 || next > maxOffset.value) return
  params.offset = next
}

function reset() {
  params.type = 'uint32_t'
  params.offset = 1
}

function setType(t: CType) {
  params.type = t
  /* 换类型时把偏移夹回合法范围，避免高亮跑到内存外面 */
  const lim = BYTES / SIZES[t] - 1
  if (params.offset > lim) params.offset = lim
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

  /* 光点沿箭头往返流动 */
  anim = new Konva.Animation((frame) => {
    if (!frame || !pulseDot) return
    const period = 1400
    const k = ((frame.time % period) / period) * 2
    const t = k <= 1 ? k : 2 - k
    const ease = t * t * (3 - 2 * t)
    pulseDot.x(pulseFrom.x + (pulseTo.x - pulseFrom.x) * ease)
    pulseDot.y(pulseFrom.y + (pulseTo.y - pulseFrom.y) * ease)
    pulseDot.opacity(0.35 + 0.55 * (1 - Math.abs(ease - 0.5) * 2))
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

watch(() => [params.type, params.offset], () => buildScene())
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <!-- 顶部标题栏 -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-amber-500 text-white">
          <AppIcon name="target" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">指针与内存 · 交互式动画</span>
        <span class="tag bg-brand-50 text-brand-700">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-ghost btn-sm" @click="step(-1)">
          <AppIcon name="arrow-left" :size="13" />
          p--
        </button>
        <button class="btn-ghost btn-sm" @click="step(1)">
          p++
          <AppIcon name="arrow-right" :size="13" />
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
    <div class="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">sizeof(*p)</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          {{ size }} <span class="text-xs font-normal text-ink-400">字节</span>
        </div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">p 的地址</div>
        <div class="mt-0.5 font-mono text-[13px] font-bold text-amber-600">{{ addrText(addr) }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">*p 的值</div>
        <div class="mt-0.5 font-mono text-base font-bold text-brand-700">{{ derefText }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">p + 1 相对基址</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">
          +{{ size }} <span class="text-xs font-normal text-ink-400">字节</span>
        </div>
      </div>
    </div>

    <!-- 控制区 -->
    <div class="space-y-4 px-4 py-4">
      <div>
        <div class="mb-1.5 text-xs font-semibold text-ink-600">p 的类型（决定步长）</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in (['uint8_t', 'uint16_t', 'uint32_t'] as CType[])"
            :key="t"
            class="rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition-colors"
            :class="
              params.type === t
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-ink-500 hover:border-slate-300 hover:bg-slate-50'
            "
            @click="setType(t)"
          >
            {{ t }} *
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label class="text-xs font-semibold text-ink-600">偏移 n（p + n）</label>
          <span class="font-mono text-xs font-bold text-brand-700">{{ params.offset }}</span>
        </div>
        <input
          v-model.number="params.offset"
          type="range"
          min="0"
          :max="maxOffset"
          step="1"
          class="slider"
        />
      </div>

      <div class="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-600">
        p = {{ addrText(BASE) }} + {{ params.offset }} × {{ size }} =
        <span class="font-bold text-amber-600">{{ addrText(addr) }}</span>
        <br />
        *p 读 {{ size }} 个字节：
        <span class="font-bold text-brand-700">
          {{ MEM.slice(byteStart, byteStart + size).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  background: linear-gradient(90deg, #bed3ff, #91b5ff);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2549eb;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(37, 73, 235, 0.45);
  transition: transform 0.15s ease;
}
.slider::-webkit-slider-thumb:hover {
  transform: scale(1.12);
}
.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2549eb;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(37, 73, 235, 0.45);
}
</style>
