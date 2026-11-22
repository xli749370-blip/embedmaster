<script setup lang="ts">
/**
 * 交互式动画 ⑳：老化测试工装与产线节拍
 * ------------------------------------------------------------------
 * 场景：8 个测试工位并行跑同一套工序（上电自检 → 温循老化 → 功能复测 → 判定换料），
 *       每台设备在工位上按节拍往前推进一步，走完一轮就给出 PASS / FAIL 并换下一台。
 *       工位之间互相错开，形成典型的流水线（pipeline）。
 * 画布内容：
 *   - 顶部：四道工序汇总条，实时显示「本工序上现在有几台」
 *   - 中部：8 个工位卡（2 行 × 4 列），显示工位号、当前设备序号、当前工序、四格进度点；
 *           判定为 FAIL 的工位整卡变红，一眼看出问题工位
 *   - 底部：温循曲线带（-10 ℃ / 常温 / +60 ℃ 三段循环），标出当前所处温区
 *   - 状态栏：累计投入 / 通过 / 不良 / 良率
 * 交互：
 *   - 播放 / 暂停 / 单步 / 复位 / 1x·2x·4x 调速
 * 设计要点：
 *   - 每个工位就是一条独立状态机，节拍相同但相位错开 → 管道不会同时空转
 *   - 判定用确定性规则（序号能被 17 整除即不良），保证每次演示良率一致可复现
 *   - 良率不是「测出来多少算多少」，而是要在固定样本量下与其他批次可比
 *   - 窄屏（<300px）跳过绘制，规避圆角矩形负半径崩溃
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Konva from 'konva'
import AppIcon from '@/components/AppIcon.vue'

/* ---------------- 常量 ---------------- */
const H = 246
const STATIONS = 8
const STAGE_NAMES = ['上电自检', '温循老化', '功能复测', '判定换料']
const STAGE_COLORS = ['#0891b2', '#d97706', '#2563eb', '#059669']
const COLS = 4

const playing = ref(true)
const speed = ref(1)
const beat = ref(0) // 节拍数
const inputCnt = ref(0) // 累计投入
const passCnt = ref(0)
const failCnt = ref(0)

interface Station {
  serial: number
  stage: number // 0~3
  verdict: '' | 'PASS' | 'FAIL'
  lastFail: boolean
}

let stations: Station[] = []
let nextSerial = 1

function initStations() {
  stations = []
  nextSerial = 1
  for (let i = 0; i < STATIONS; i++) {
    stations.push({ serial: nextSerial++, stage: i % 4, verdict: '', lastFail: false })
  }
  inputCnt.value = STATIONS // 已投料 8 台
  passCnt.value = 0
  failCnt.value = 0
}
initStations()

const yieldRate = ref(0)

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
const C = {
  text: '#64748b',
  strong: '#0f172a',
  grid: '#e2e8f0',
  dim: '#cbd5e1',
  hi: '#dc2626',
  ok: '#059669',
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

  const x0 = 14
  const x1 = w - 14
  const compact = w < 430

  /* ---------- 标题 ---------- */
  L.add(
    new Konva.Text({
      x: 16,
      y: 9,
      text: '老化测试：8 工位流水线，工序固定、相位错开',
      fontSize: 11.5,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 四道工序汇总条 ---------- */
  const flowY = 28
  const flowH = 24
  const gap = 6
  const boxW = (x1 - x0 - gap * 3) / 4
  STAGE_NAMES.forEach((name, i) => {
    const bx = x0 + i * (boxW + gap)
    const cnt = stations.filter((s) => s.stage === i).length
    const active = cnt > 0
    L.add(
      new Konva.Rect({
        x: bx,
        y: flowY,
        width: boxW,
        height: flowH,
        fill: active ? '#ffffff' : '#f8fafc',
        stroke: active ? STAGE_COLORS[i] : C.grid,
        strokeWidth: active ? 1.4 : 1,
        cornerRadius: 5,
      }),
    )
    L.add(
      new Konva.Text({
        x: bx + 5,
        y: flowY + 4,
        width: boxW - 10,
        text: compact ? name : `${i + 1} ${name}`,
        fontSize: compact ? 8 : 8.5,
        fontFamily: FONT,
        fill: active ? STAGE_COLORS[i] : C.dim,
        fontStyle: 'bold',
      }),
    )
    L.add(
      new Konva.Text({
        x: bx + 5,
        y: flowY + 14,
        text: `${cnt} 台`,
        fontSize: 7.5,
        fontFamily: FONT,
        fill: active ? C.text : C.dim,
      }),
    )
    if (i < 3) {
      L.add(
        new Konva.Text({
          x: bx + boxW + 1,
          y: flowY + 6,
          text: '›',
          fontSize: 11,
          fontFamily: FONT,
          fill: C.dim,
        }),
      )
    }
  })

  /* ---------- 8 个工位 ---------- */
  const gridY = 58
  const colGap = 6
  const cellW = Math.min((x1 - x0 - colGap * (COLS - 1)) / COLS, 158)
  const gridW = cellW * COLS + colGap * (COLS - 1)
  const gridX = x0 + ((x1 - x0) - gridW) / 2
  const cellH = 44
  const rowGap = 7

  stations.forEach((st, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const cx = gridX + col * (cellW + colGap)
    const cy = gridY + row * (cellH + rowGap)
    const stageColor = STAGE_COLORS[st.stage]
    const isFail = st.stage === 3 && st.verdict === 'FAIL'
    const isPass = st.stage === 3 && st.verdict === 'PASS'

    L.add(
      new Konva.Rect({
        x: cx,
        y: cy,
        width: cellW,
        height: cellH,
        fill: isFail ? '#fef2f2' : isPass ? '#f0fdf4' : '#ffffff',
        stroke: isFail ? C.hi : isPass ? C.ok : C.grid,
        strokeWidth: isFail || isPass ? 1.6 : 1,
        cornerRadius: 6,
      }),
    )
    // 工位号
    L.add(
      new Konva.Text({
        x: cx + 6,
        y: cy + 5,
        text: `W${i + 1}`,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.dim,
        fontStyle: 'bold',
      }),
    )
    // 设备序号
    L.add(
      new Konva.Text({
        x: cx + cellW - 44,
        y: cy + 5,
        width: 38,
        align: 'right',
        text: `#${st.serial}`,
        fontSize: 8.5,
        fontFamily: FONT,
        fill: C.strong,
      }),
    )
    // 当前工序
    const stageText =
      st.stage === 3 ? (st.verdict === 'FAIL' ? 'FAIL 判废' : 'PASS 入库') : STAGE_NAMES[st.stage]
    L.add(
      new Konva.Text({
        x: cx + 6,
        y: cy + 19,
        width: cellW - 12,
        text: stageText,
        fontSize: 9,
        fontFamily: FONT,
        fill: isFail ? C.hi : isPass ? C.ok : stageColor,
        fontStyle: 'bold',
      }),
    )
    // 四格进度点
    const dotY = cy + cellH - 12
    const dotGap = compact ? 8 : 10
    for (let k = 0; k < 4; k++) {
      L.add(
        new Konva.Rect({
          x: cx + 6 + k * dotGap,
          y: dotY,
          width: 6,
          height: 4,
          fill: k <= st.stage ? (isFail ? C.hi : stageColor) : '#eef2f7',
          cornerRadius: 2,
        }),
      )
    }
    // 温循标记：和老化工序同处底部一行，避开工序名正文
    if (st.stage === 1) {
      L.add(
        new Konva.Text({
          x: cx + cellW - 40,
          y: dotY - 4,
          width: 34,
          align: 'right',
          text: '∿ 60℃',
          fontSize: 7.5,
          fontFamily: FONT,
          fill: '#d97706',
        }),
      )
    }
  })

  /* ---------- 温循曲线带 ---------- */
  const bandY = 174
  const bandH = 14
  const zoneW = (x1 - x0) / 3
  const zones = [
    { t: '−10 ℃', c: '#0ea5e9', bg: '#f0f9ff' },
    { t: '25 ℃', c: '#64748b', bg: '#f8fafc' },
    { t: '+60 ℃', c: '#dc2626', bg: '#fef2f2' },
  ]
  // 分三趟画：底色块 → 温区指针 → 文字，保证文字永远压在指针之上
  zones.forEach((z, i) => {
    L.add(
      new Konva.Rect({
        x: x0 + i * zoneW,
        y: bandY,
        width: zoneW - 2,
        height: bandH,
        fill: z.bg,
        stroke: z.c,
        strokeWidth: 0.8,
        cornerRadius: 3,
      }),
    )
  })

  // 当前温区指针：一个循环 12 拍，前三段低温、中三段常温、后六段高温
  const phase = beat.value % 12
  const pos = (phase + 0.5) / 12
  const markX = x0 + pos * (x1 - x0)
  L.add(
    new Konva.Line({
      points: [markX, bandY - 1, markX, bandY + bandH],
      stroke: 'rgba(15,23,42,0.45)',
      strokeWidth: 2.2,
    }),
  )
  L.add(
    new Konva.Line({
      points: [markX - 4, bandY - 7, markX + 4, bandY - 7, markX, bandY - 1],
      closed: true,
      fill: '#0f172a',
    }),
  )

  zones.forEach((z, i) => {
    L.add(
      new Konva.Text({
        x: x0 + i * zoneW + 4,
        y: bandY + 3,
        width: zoneW - 8,
        align: 'center',
        text: z.t,
        fontSize: 8,
        fontFamily: FONT,
        fill: z.c,
        fontStyle: 'bold',
      }),
    )
  })
  L.add(
    new Konva.Text({
      x: x0,
      y: bandY - 17,
      text: '温循曲线（一个循环 = 12 拍）',
      fontSize: 8,
      fontFamily: FONT,
      fill: C.text,
    }),
  )

  /* ---------- 状态栏 ---------- */
  const rate = passCnt.value + failCnt.value > 0 ? ((passCnt.value / (passCnt.value + failCnt.value)) * 100).toFixed(1) : '—'
  L.add(
    new Konva.Text({
      x: x0,
      y: 198,
      width: x1 - x0,
      text: `第 ${beat.value} 拍 · 投入 ${inputCnt.value} 台 · 通过 ${passCnt.value} · 不良 ${failCnt.value} · 良率 ${rate}%`,
      fontSize: 9.5,
      fontFamily: FONT,
      fill: C.strong,
      fontStyle: 'bold',
    }),
  )
  L.add(
    new Konva.Text({
      x: x0,
      y: 214,
      width: x1 - x0,
      text:
        failCnt.value > 0
          ? '不良品会被打上红色标记并隔离 —— 判废动作必须在工位上完成，不能留到出货前再挑'
          : '工位错相位＝流水线：同一拍里既有在自检的，也有在温循、在复测、在换料的',
      fontSize: 8.5,
      lineHeight: 1.25,
      fontFamily: FONT,
      fill: failCnt.value > 0 ? C.hi : C.text,
    }),
  )

  L.draw()
}

/* ---------------- 交互 ---------------- */
function step() {
  beat.value++
  stations.forEach((st) => {
    if (st.stage < 3) {
      st.stage++
      if (st.stage === 3) {
        // 走完三道工序 → 判定。确定性规则：序号能被 17 整除即判废
        const bad = st.serial % 17 === 0
        st.verdict = bad ? 'FAIL' : 'PASS'
        st.lastFail = bad
        if (bad) failCnt.value++
        else passCnt.value++
      }
    } else {
      // 换料：本台已入库，工位重新从上电自检开始
      st.serial = nextSerial++
      st.stage = 0
      st.verdict = ''
      inputCnt.value++
    }
  })
  yieldRate.value =
    passCnt.value + failCnt.value > 0 ? Math.round((passCnt.value / (passCnt.value + failCnt.value)) * 1000) / 10 : 0
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
  initStations()
  beat.value = 0
  yieldRate.value = 0
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
    const interval = 700 / speed.value
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
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-rose-600 text-white">
          <AppIcon name="target" :size="13" :stroke-width="2.2" />
        </span>
        <span class="text-[13px] font-bold text-ink-800">老化测试工装 · 交互式动画</span>
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

    <div class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">投入</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ inputCnt }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">通过</div>
        <div class="mt-0.5 font-mono text-base font-bold text-emerald-600">{{ passCnt }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">不良</div>
        <div class="mt-0.5 font-mono text-base font-bold text-rose-600">{{ failCnt }}</div>
      </div>
      <div class="bg-white px-4 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">良率</div>
        <div class="mt-0.5 font-mono text-base font-bold text-ink-900">{{ yieldRate }}%</div>
      </div>
    </div>

    <div class="space-y-2 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
      <p>
        8 个工位不是「同一个动作做 8 遍」，而是<b class="text-ink-700">同一条工序被 8 台设备
        错开推进</b>：任意一拍里，工位上一定同时有人在自检、有人在温循、有人在复测、有人在换料。
        这就是流水线能把节拍压到单台工时的 1/8 的原因。
      </p>
      <p class="text-ink-400">
        盯住红色的那张卡：判废动作发生在<b>工位上</b>，不是出货前统一挑。判废越晚，返工成本越高——
        等到成品仓才发现不良，你损失的不只是一个器件，还有前面所有工序的工时。
      </p>
    </div>
  </div>
</template>
