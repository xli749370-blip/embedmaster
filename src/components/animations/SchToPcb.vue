<script setup lang="ts">
/**
 * 交互式动画 ⑰：原理图 ↔ PCB 交叉高亮（Konva）
 * ------------------------------------------------------------------
 * 场景：把一张「按键 + 上拉 + 去抖电容」的原理图局部，和它在 PCB 上的
 *       实际走线并排放，点击某个网络时两侧同时高亮。
 * 画布内容：
 *   - 左（窄屏在上）：原理图局部（U1 / R2 10k / C1 100nF / SW1 / 地符号）
 *   - 右（窄屏在下）：PCB 俯视（板框、U1、U2 LDO、R2、C1、SW1、走线、焊盘）
 *   - 选中网络时：该网络的折线加粗上色，其余网络淡成浅灰
 * 交互：
 *   - 点 +3V3 / BTN / GND 三个网络按钮切换
 *   - 播放 = 自动轮播三个网络；1x·2x·4x 调速
 * 设计要点：
 *   - 原理图与 PCB 用的是同一套网络定义（两边各一组归一化折线），
 *     所以强调的不是「画得像」，而是「同一根网络在两处怎么找」
 *   - 窄屏（<520px）自动改成上下排布，避免两侧各只有 150px 看不清
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 网络定义 ---------------- */
interface NetDef {
  key: string
  name: string
  color: string
  /** 原理图折线（归一化 0~100 坐标，y 向下） */
  sch: number[][][]
  /** PCB 折线（归一化 0~100 坐标） */
  pcb: number[][][]
  /** 该网络在板上的核对要点 */
  caption: string
}

const NETS: NetDef[] = [
  {
    key: 'v3',
    name: '+3V3',
    color: '#ea580c',
    sch: [
      [
        [8, 10],
        [87, 10],
      ],
      [
        [87, 10],
        [87, 20],
      ],
      [
        [26, 10],
        [26, 16],
      ],
    ],
    pcb: [
      [
        [24, 22],
        [75, 22],
      ],
      [
        [49, 22],
        [49, 30],
      ],
      [
        [75, 22],
        [75, 24],
      ],
    ],
    caption:
      '+3V3：LDO 输出 → U1 的 VDD，同时拉给 R2 上端。上电后先量这三个点两两通断，电源是否断、是否被过孔吃掉一眼就看出来。',
  },
  {
    key: 'btn',
    name: 'BTN',
    color: '#2563eb',
    sch: [
      [
        [26, 30],
        [26, 44],
      ],
      [
        [26, 38],
        [78, 38],
      ],
      [
        [48, 38],
        [48, 44],
      ],
    ],
    pcb: [
      [
        [66, 34],
        [66, 60],
      ],
      [
        [66, 38],
        [62, 38],
      ],
      [
        [66, 34],
        [75, 34],
      ],
      [
        [66, 40],
        [84, 40],
      ],
      [
        [66, 60],
        [68, 60],
      ],
    ],
    caption:
      'BTN：PA0 ↔ R2 上拉 ↔ C1 去抖 ↔ SW1 到地，四个器件是同一根网络。PCB 上它是一根 0.25mm 的「脊」（x=66 那条竖线），三处都从脊上分支，别再和 SCK 并排走。',
  },
  {
    key: 'gnd',
    name: 'GND',
    color: '#059669',
    sch: [
      [
        [26, 58],
        [26, 70],
      ],
      [
        [48, 58],
        [48, 70],
      ],
      [
        [87, 62],
        [87, 70],
      ],
      [
        [20, 70],
        [87, 70],
      ],
    ],
    pcb: [
      [
        [49, 58],
        [49, 72],
      ],
      [
        [84, 50],
        [84, 72],
      ],
      [
        [82, 60],
        [82, 72],
      ],
      [
        [14, 72],
        [90, 72],
      ],
    ],
    caption:
      'GND：SW1、C1、U1 的地各走一段回到同一个接地点。C1 的地必须就近回 U1 的 GND 脚——绕到板子另一头再回来，去抖电容就白装了。',
  },
]

const H_WIDE = 228
const H_NARROW = 286

const speed = ref(1)
const playing = ref(true)
const active = ref(0)

const cur = computed(() => NETS[active.value])

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  text: '#64748b',
  strong: '#0f172a',
  gridStrong: '#e2e8f0',
  dim: '#cbd5e1',
  off: '#d3dce7',
  body: '#f8fafc',
}

/* ---------------- Konva 状态 ---------------- */
const wrapRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let anim: Konva.Animation | null = null
let ro: ResizeObserver | null = null

let lastStep = 0
let acc = 0

/** 绘制区域：面板矩形 + 内容的纵向归一化范围（vMin~vMax 会被拉伸铺满面板） */interface DrawRect {
  x: number
  y: number
  w: number
  h: number
  vMin: number
  vMax: number
}

/* ---------------- 绘制 ---------------- */
function buildScene() {
  const S = stage
  const L = layer
  if (!S || !L) return

  const w = S.width()
  // 窄屏重排瞬间宽度塌缩时跳过，等 ResizeObserver 拿到最终宽度
  if (!w || w < 40) {
    L.draw()
    return
  }

  const stacked = w < 520
  const nextH = stacked ? H_NARROW : H_WIDE
  if (S.height() !== nextH) S.height(nextH)

  L.destroyChildren()

  const x0 = 14
  const x1 = w - 14
  const pw = x1 - x0
  const gap = stacked ? 8 : 12
  const schRect = stacked
    ? { x: x0, y: 34, w: pw, h: 118 }
    : { x: x0, y: 34, w: (pw - gap) / 2, h: 190 }
  const pcbRect = stacked
    ? { x: x0, y: 160, w: pw, h: 118 }
    : { x: x0 + (pw - gap) / 2 + gap, y: 34, w: (pw - gap) / 2, h: 190 }

  /* 真正用来画内容的内缩区域：上方留出面板标题，纵向按内容范围拉伸 */
  const schDraw: DrawRect = {
    x: schRect.x + 4,
    y: schRect.y + 15,
    w: schRect.w - 8,
    h: schRect.h - 24,
    vMin: 6,
    vMax: 80,
  }
  const pcbDraw: DrawRect = {
    x: pcbRect.x + 4,
    y: pcbRect.y + 15,
    w: pcbRect.w - 8,
    h: pcbRect.h - 24,
    vMin: 8,
    vMax: 84,
  }

  /* ---------- 标题 ---------- */
  L.add(
    new Konva.Text({
      x: x0,
      y: 10,
      text: stacked ? '原理图 ↔ PCB 对照' : '原理图 ↔ PCB：同一根网络，在两处分别长什么样',
      fontSize: stacked ? 10.5 : 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 两块面板底板 ---------- */
  ;[
    { r: schRect, label: '原理图（局部）' },
    { r: pcbRect, label: 'PCB 俯视（示意）' },
  ].forEach(({ r, label }) => {
    L.add(
      new Konva.Rect({
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        fill: '#fcfdff',
        stroke: C.gridStrong,
        strokeWidth: 1,
        cornerRadius: 8,
      }),
    )
    L.add(
      new Konva.Text({
        x: r.x + 8,
        y: r.y + 4,
        text: label,
        fontSize: 8,
        fontFamily: FONT,
        fill: '#94a3b8',
      }),
    )
  })

  /* 归一化坐标 → 画布坐标：
     内容本身的纵向范围只有 vMin~vMax（原理图 6~80、PCB 8~84），
     直接按 0~100 映射会在面板底部留一大片空白，所以按实际范围拉伸铺满 */
  const mx = (u: number, r: DrawRect) => r.x + (u / 100) * r.w
  const my = (v: number, r: DrawRect) => r.y + ((v - r.vMin) / (r.vMax - r.vMin)) * r.h

  /* ---------- 原理图元件 ---------- */
  const sr = schDraw
  const box = (u1: number, v1: number, u2: number, v2: number) =>
    new Konva.Rect({
      x: mx(u1, sr),
      y: my(v1, sr),
      width: mx(u2, sr) - mx(u1, sr),
      height: my(v2, sr) - my(v1, sr),
      fill: '#ffffff',
      stroke: '#94a3b8',
      strokeWidth: 1.1,
      cornerRadius: 2,
    })

  // U1
  L.add(box(78, 20, 96, 62))
  L.add(
    new Konva.Text({
      x: mx(79, sr),
      y: my(36, sr),
      width: mx(95, sr) - mx(79, sr),
      align: 'center',
      text: 'U1',
      fontSize: 7.5,
      fontFamily: FONT,
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
  // U1 引脚名（右对齐，末端留 1.5 格空隙，避免压在 U1 边框上）
  L.add(
    new Konva.Text({
      x: mx(68, sr),
      y: my(34, sr),
      width: mx(76.5, sr) - mx(68, sr),
      align: 'right',
      text: 'PA0',
      fontSize: 6,
      fontFamily: FONT,
      fill: C.text,
    }),
  )
  // R2 / C1 / SW1
  L.add(box(22, 16, 30, 30))
  L.add(box(44, 44, 52, 58))
  L.add(box(22, 44, 30, 58))
  const part = (u: number, v: number, t: string) =>
    L.add(
      new Konva.Text({
        x: mx(u, sr),
        y: my(v, sr),
        text: t,
        fontSize: 6,
        fontFamily: FONT,
        fill: C.text,
      }),
    )
  part(10, 21, 'R2 10k')
  part(53, 48, 'C1 100nF')
  part(10, 48, 'SW1')
  // 地符号（三条递减横线，放大一点才看得清）
  for (let i = 0; i < 3; i++) {
    L.add(
      new Konva.Line({
        points: [
          mx(20 - 3.2 + i * 1.6, sr),
          my(74 + i * 3.2, sr),
          mx(20 + 3.2 - i * 1.6, sr),
          my(74 + i * 3.2, sr),
        ],
        stroke: '#94a3b8',
        strokeWidth: 1.2,
      }),
    )
  }

  /* ---------- PCB 元件 ---------- */
  const pr = pcbDraw
  const pbox = (u1: number, v1: number, u2: number, v2: number, label: string, fill = '#eef2f7') => {
    L.add(
      new Konva.Rect({
        x: mx(u1, pr),
        y: my(v1, pr),
        width: mx(u2, pr) - mx(u1, pr),
        height: my(v2, pr) - my(v1, pr),
        fill,
        stroke: '#a9b6c7',
        strokeWidth: 1,
        cornerRadius: 3,
      }),
    )
    if (label) {
      L.add(
        new Konva.Text({
          x: mx(u1, pr),
          y: my((v1 + v2) / 2 - 3, pr),
          width: mx(u2, pr) - mx(u1, pr),
          align: 'center',
          text: label,
          fontSize: 6,
          fontFamily: FONT,
          fill: '#475569',
        }),
      )
    }
  }
  // 板框
  L.add(
    new Konva.Rect({
      x: mx(6, pr),
      y: my(10, pr),
      width: mx(94, pr) - mx(6, pr),
      height: my(82, pr) - my(10, pr),
      fill: '#f4f8f4',
      stroke: '#86b39a',
      strokeWidth: 1.1,
      cornerRadius: 5,
    }),
  )
  pbox(12, 16, 24, 28, 'U2 LDO', '#e6eef8')
  pbox(36, 30, 62, 58, 'U1', '#e6eef8')
  pbox(72, 24, 78, 34, 'R2', '#f1f5f9')
  pbox(81, 40, 87, 50, 'C1', '#f1f5f9')
  pbox(68, 54, 82, 66, 'SW1', '#f1f5f9')
  // 焊盘点
  const pads: number[][] = [
    [24, 22],
    [49, 30],
    [62, 38],
    [49, 58],
    [75, 24],
    [75, 34],
    [84, 40],
    [84, 50],
    [68, 60],
    [82, 60],
    [14, 72],
  ]
  pads.forEach(([u, v]) => {
    L.add(
      new Konva.Circle({
        x: mx(u, pr),
        y: my(v, pr),
        radius: 1.8,
        fill: '#b8c4d4',
      }),
    )
  })

  /* ---------- 网络折线：先画未选中的，再画选中的 ---------- */
  const drawPolys = (polys: number[][][], r: DrawRect, color: string, lw: number) => {
    polys.forEach((poly) => {
      const pts: number[] = []
      poly.forEach(([u, v]) => {
        pts.push(mx(u, r), my(v, r))
      })
      L.add(
        new Konva.Line({
          points: pts,
          stroke: color,
          strokeWidth: lw,
          lineCap: 'round',
          lineJoin: 'round',
        }),
      )
    })
  }

  NETS.forEach((n, i) => {
    if (i === active.value) return
    drawPolys(n.sch, sr, C.off, 1.2)
    drawPolys(n.pcb, pr, C.off, 1.2)
  })
  const curNet = NETS[active.value]
  drawPolys(curNet.sch, sr, curNet.color, 2.4)
  drawPolys(curNet.pcb, pr, curNet.color, 2.4)

  // 选中网络在原理图上的节点圆点
  if (curNet.key === 'btn') {
    ;[
      [26, 38],
      [48, 38],
    ].forEach(([u, v]) => {
      L.add(new Konva.Circle({ x: mx(u, sr), y: my(v, sr), radius: 2, fill: curNet.color }))
    })
  }

  /* ---------- 底部说明 ---------- */
  // 提示文字放到 HTML 面板里，画布只留图，避免压到面板下边框

  L.draw()
}

/* ---------------- 交互 ---------------- */
function pick(i: number) {
  active.value = i
  lastStep = 0
  acc = 0
  buildScene()
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    lastStep = 0
    acc = 0
  }
}

/* ---------------- 生命周期 ---------------- */
onMounted(() => {
  if (!wrapRef.value) return
  stage = new Konva.Stage({
    container: wrapRef.value,
    width: wrapRef.value.clientWidth,
    height: H_WIDE,
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
    const interval = 2600 / speed.value
    if (lastStep === 0) lastStep = frame.time
    acc += frame.time - lastStep
    lastStep = frame.time
    // 挂起恢复时 frame.time 会跳很大，封顶避免单帧同步重绘几百次
    if (acc > interval * 3) acc = interval * 3
    let guard = 0
    while (acc >= interval && guard < 3) {
      acc -= interval
      guard++
      active.value = (active.value + 1) % NETS.length
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
        <span class="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-white">
          <AppIcon name="grid" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">原理图 ↔ PCB 交叉高亮 · 交互式动画</span>
        <span class="tag bg-emerald-50 text-emerald-700">Konva</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-ghost btn-sm" @click="togglePlay">
          <AppIcon :name="playing ? 'clock' : 'play'" :size="13" />
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button
          v-for="s in [1, 2, 4]"
          :key="s"
          class="rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          :class="speed === s ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
          @click="speed = s"
        >
          {{ s }}x
        </button>
      </div>
    </div>

    <!-- 网络切换条 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2">
      <span class="text-[11px] text-ink-400">网络</span>
      <button
        v-for="(n, i) in NETS"
        :key="n.key"
        class="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors"
        :class="active === i ? 'bg-slate-900 text-white' : 'bg-slate-100 text-ink-500 hover:bg-slate-200'"
        @click="pick(i)"
      >
        <span class="h-2 w-2 rounded-full" :style="{ background: n.color }" />
        {{ n.name }}
      </button>
    </div>

    <!-- Konva 画布 -->
    <div ref="wrapRef" class="konva-wrap w-full bg-white" />

    <!-- 当前网络要点 -->
    <div class="border-t border-slate-100 px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full" :style="{ background: cur.color }" />
        <span class="font-mono text-[12px] font-bold" :style="{ color: cur.color }">{{ cur.name }}</span>
        <span class="text-[11px] text-ink-400">在板上的核对要点</span>
      </div>
      <p class="mt-1.5 text-[12px] leading-relaxed text-ink-500">{{ cur.caption }}</p>
    </div>

    <!-- 说明 -->
    <div class="space-y-2 border-t border-slate-100 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        读原理图的正确顺序是<b class="text-ink-700">先找网络、再看器件</b>：把所有带同名网络标号的引脚连起来，
        就是 PCB 上必须是同一根铜的那一坨。反过来查板时，万用表点两个焊盘「通/不通」，
        比拿着原理图逐个找器件快得多。
      </p>
      <p class="text-ink-400">
        提示：点 <b>BTN</b> 看那根竖着的「脊」——R2 上拉、C1 去抖、SW1 到地四个器件都从它分支，
        实际布板时这根脊越短越好，而且不能贴着 SCK 走。
      </p>
    </div>
  </div>
</template>
