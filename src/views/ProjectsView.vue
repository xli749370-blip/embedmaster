<script setup lang="ts">
/**
 * 项目库 · 完整工程项目实战
 * - 列表：项目卡片（难度/周期/预算/技术栈/学习进度）
 * - 详情：教材式长页阅读（阶段侧导航 + 双链路小节 + 实操检查点打卡）
 * - 进度：每个小节可勾选完成，按项目存 localStorage
 */
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import ProjectDocRenderer from '@/components/ProjectDocRenderer.vue'
import api from '@/api'
import { useSpeech } from '@/composables/useSpeech'
import {
  projects,
  projectStepCount,
  PROJ_DIF_CLS,
  STEP_KIND_META,
  STAGE_LAYER_META,
  type Project,
  type ProjStep,
} from '@/mock/projects'

const current = ref<Project | null>(null)
const showBom = ref(true)
const progressMap = ref<Record<string, { projectId: string; doneSteps: string[] }>>({})

/* 进度工具 */
const doneSet = computed(() => new Set(current.value ? progressMap.value[current.value.id]?.doneSteps ?? [] : []))

const curTotal = computed(() => (current.value ? projectStepCount(current.value) : 0))
const curDone = computed(() => doneSet.value.size)
const curPct = computed(() => (curTotal.value ? Math.round((curDone.value / curTotal.value) * 100) : 0))

function projPct(p: Project): number {
  const total = projectStepCount(p)
  const done = progressMap.value[p.id]?.doneSteps.length ?? 0
  return total ? Math.round((done / total) * 100) : 0
}

const projStats = computed(() => ({
  started: projects.filter((p) => projPct(p) > 0).length,
  finished: projects.filter((p) => projPct(p) === 100).length,
}))

/** 实物参考图路径（public/img/pXX-*.jpg，没有则不显示） */
const IMG_MAP: Record<string, string> = {
  p01: '/img/p01-balance.jpg',
  p02: '/img/p02-car.jpg',
  p03: '/img/p03-drone.jpg',
  p04: '/img/p04-arm.jpg',
  p05: '/img/p05-pendulum.jpg',
  p06: '/img/p06-maglev.jpg',
  p07: '/img/p07-env.jpg',
}
const projImg = (id: string) => IMG_MAP[id] || ''

async function openProject(p: Project) {
  current.value = p
  showBom.value = true
  window.scrollTo({ top: 0 })
}

function backToList() {
  current.value = null
}

/** 小节完成打卡 */
async function toggleStep(step: ProjStep) {
  const p = current.value
  if (!p || !step.checks?.length) return
  const done = new Set(progressMap.value[p.id]?.doneSteps ?? [])
  if (done.has(step.id)) done.delete(step.id)
  else done.add(step.id)
  const res = await api.saveProjectProgress(p.id, [...done])
  if (res.code === 200) progressMap.value = { ...progressMap.value, [p.id]: res.data }
}

/** 一键把某阶段内全部带检查点的小节标完成 */
async function completeStage(stageIdx: number) {
  const p = current.value
  if (!p) return
  const done = new Set(progressMap.value[p.id]?.doneSteps ?? [])
  p.stages[stageIdx].steps.forEach((s) => done.add(s.id))
  const res = await api.saveProjectProgress(p.id, [...done])
  if (res.code === 200) progressMap.value = { ...progressMap.value, [p.id]: res.data }
}

/* 阶段导航跳转 */
function jumpTo(stageId: string) {
  document.getElementById(`stage-${stageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ---------------- 阶段听学（内置音频优先，缺文件回退 TTS） ---------------- */
const { speakFile, speak, stop, speaking, supported, audioTime } = useSpeech()
const stageAudio = ref<Record<string, string>>({})
const readingStage = ref('')

onMounted(async () => {
  const res = await api.getProjectProgress()
  if (res.code === 200) progressMap.value = res.data
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}audio/proj/manifest.json`)
    if (!r.ok) return
    const m = await r.json()
    const map: Record<string, string> = {}
    for (const s of m.stages || []) map[`${s.project}#${s.stage}`] = `${import.meta.env.BASE_URL}${s.file}`
    stageAudio.value = map
  } catch {
    /* 无清单则全部走 TTS */
  }
})

function listenStage(p: Project, stageId: string) {
  const key = `${p.id}#${stageId}`
  if (readingStage.value === key && speaking.value) {
    stop()
    readingStage.value = ''
    return
  }
  readingStage.value = key
  const st = p.stages.find((s) => s.id === stageId)
  if (!st) return
  const done = () => (readingStage.value = '')
  const url = stageAudio.value[key]
  if (url) {
    speakFile(url, '', done)
    return
  }
  // 回退：TTS 朗读阶段目标 + 各小节正文
  const text = [`阶段：${st.title}。目标：${st.goal}`].join('。') +
    (st.steps || []).map((s) => `${s.title}。`).join('')
  speak(text, done)
}

const layerDot = (layer: string) => STAGE_LAYER_META[layer as 'common']?.dot ?? 'bg-slate-400'

</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-ink-900">项目库</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
        完整工程项目实战教材：硬件链路（选型 → 原理图 → PCB → 焊接）+ 软件链路（工程创建 → 分层架构 → 算法 → 协议）双线剖析，跟着走跟着练，从零走出自己的工程项目。
      </p>
    </header>

    <!-- ==================== 项目列表 ==================== -->
    <template v-if="!current">
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-3 text-[13px] text-brand-800">
        <span class="font-semibold">{{ projects.length }} 个完整项目</span>
        <span class="text-brand-300">·</span>
        <span>已开动 {{ projStats.started }} 个</span>
        <span class="text-brand-300">·</span>
        <span>已完成 {{ projStats.finished }} 个</span>
        <span class="text-brand-300">·</span>
        <span class="text-ink-500">建议顺序：智能小车入门 → 平衡车/机械臂 → 倒立摆/电磁摆 → 无人机</span>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <button
          v-for="p in projects"
          :key="p.id"
          class="card group flex flex-col p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
          @click="openProject(p)"
        >
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-[16px] font-bold text-ink-900">{{ p.name }}</span>
            <span class="tag shrink-0" :class="PROJ_DIF_CLS[p.difficulty]">{{ p.difficulty }}</span>
          </div>
          <p class="mt-1 text-[12px] text-ink-400">{{ p.subtitle }}</p>
          <p class="mt-2.5 line-clamp-3 text-[12.5px] leading-relaxed text-ink-500">{{ p.summary }}</p>

          <div class="mt-3 flex flex-wrap gap-1.5">
            <span v-for="t in p.tags.slice(0, 4)" :key="t" class="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-ink-500">{{ t }}</span>
          </div>

          <div class="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-[11px] text-ink-400">
            <span><AppIcon name="clock" :size="11" class="mr-1 inline" />{{ p.weeks }}</span>
            <span><AppIcon name="zap" :size="11" class="mr-1 inline" />{{ p.cost }}</span>
            <span>{{ p.stages.length }} 个阶段 · {{ projectStepCount(p) }} 节</span>
            <div class="flex-1" />
            <span class="font-semibold" :class="projPct(p) === 100 ? 'text-emerald-600' : projPct(p) > 0 ? 'text-brand-600' : 'text-ink-300'">
              {{ projPct(p) === 100 ? '已完成' : projPct(p) > 0 ? `进行中 ${projPct(p)}%` : '未开始' }}
            </span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all" :style="{ width: projPct(p) + '%' }" />
          </div>
        </button>
      </div>
    </template>

    <!-- ==================== 项目详情（教材式长页） ==================== -->
    <template v-else>
      <button class="btn-ghost btn-sm mb-4" @click="backToList">
        <AppIcon name="x" :size="13" /> 返回项目列表
      </button>

      <!-- 项目头卡 -->
      <div class="card anim-panel mb-5 p-6" style="background: #fff">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-xl font-bold text-ink-900">{{ current.name }}</h2>
          <span class="tag" :class="PROJ_DIF_CLS[current.difficulty]">{{ current.difficulty }}</span>
          <span class="tag bg-slate-100 text-ink-500">{{ current.weeks }}</span>
          <span class="tag bg-slate-100 text-ink-500">{{ current.cost }}</span>
        </div>
        <p class="mt-1 text-[12px] text-ink-400">{{ current.subtitle }}</p>
        <!-- 实物参考图（帮助建立直观认知） -->
        <img
          v-if="projImg(current.id)"
          :src="projImg(current.id)"
          :alt="current.name + ' 实物参考'"
          class="mt-3 max-h-56 w-auto rounded-xl border border-slate-200 object-cover shadow-card"
        />
        <p class="mt-3 text-[13.5px] leading-relaxed text-ink-600">{{ current.summary }}</p>

        <!-- 进度 -->
        <div class="mt-4 flex items-center gap-3">
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all" :style="{ width: curPct + '%' }" />
          </div>
          <span class="text-[12px] font-semibold text-ink-500">{{ curDone }}/{{ curTotal }} 节 · {{ curPct }}%</span>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <!-- 能力清单 -->
          <div class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div class="mb-2 text-[12.5px] font-bold text-emerald-700"><AppIcon name="check-circle" :size="13" class="mr-1 inline" />跟完你将获得</div>
            <ul class="space-y-1.5 text-[12px] leading-relaxed text-ink-600">
              <li v-for="(o, i) in current.outcomes" :key="i" class="flex gap-1.5">
                <span class="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-emerald-400" />{{ o }}
              </li>
            </ul>
          </div>
          <!-- 技术栈 -->
          <div class="grid gap-3">
            <div class="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <div class="mb-2 text-[12.5px] font-bold text-amber-700">🧱 硬件技术栈</div>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="s in current.stack.hw" :key="s" class="rounded-md bg-white px-2 py-1 text-[11px] text-ink-600 shadow-sm">{{ s }}</span>
              </div>
            </div>
            <div class="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
              <div class="mb-2 text-[12.5px] font-bold text-brand-700">⌨️ 软件技术栈</div>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="s in current.stack.sw" :key="s" class="rounded-md bg-white px-2 py-1 text-[11px] text-ink-600 shadow-sm">{{ s }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- BOM -->
        <button class="mt-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700" @click="showBom = !showBom">
          <AppIcon :name="showBom ? 'chevron-down' : 'chevron-right'" :size="14" /> 物料清单 BOM（{{ current.bom.length }} 项）
        </button>
        <div v-if="showBom" class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-left text-[12px]">
            <thead class="bg-slate-50 text-ink-500">
              <tr>
                <th class="px-3 py-2 font-semibold">物料</th>
                <th class="px-3 py-2 font-semibold">规格</th>
                <th class="px-3 py-2 font-semibold">数量</th>
                <th class="px-3 py-2 font-semibold">备注</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-ink-600">
              <tr v-for="(b, i) in current.bom" :key="i">
                <td class="whitespace-nowrap px-3 py-2 font-semibold text-ink-800">{{ b.item }}</td>
                <td class="px-3 py-2">{{ b.spec }}</td>
                <td class="whitespace-nowrap px-3 py-2">{{ b.qty }}</td>
                <td class="px-3 py-2 text-[11.5px] text-ink-400">{{ b.note || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 主体：侧导航 + 内容 -->
      <div class="flex gap-5">
        <!-- 阶段导航（桌面侧栏） -->
        <aside class="hidden w-56 shrink-0 lg:block">
          <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <div class="mb-2 px-2 text-[11px] font-bold tracking-wider text-ink-400">学习路线</div>
            <button
              v-for="(st, si) in current.stages"
              :key="st.id"
              class="mb-1 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-[12px] transition hover:bg-slate-50"
              @click="jumpTo(st.id)"
            >
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="layerDot(st.layer)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-ink-700">{{ st.title }}</span>
                <span class="mt-0.5 block truncate text-[10.5px] text-ink-400">{{ st.goal }}</span>
              </span>
              <span class="shrink-0 text-[10px] text-ink-300">{{ si + 1 }}</span>
            </button>
          </div>
        </aside>

        <!-- 内容流 -->
        <div class="min-w-0 flex-1">
          <!-- 移动端阶段跳转条 -->
          <div class="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            <button
              v-for="st in current.stages"
              :key="st.id"
              class="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-ink-500"
              @click="jumpTo(st.id)"
            >
              {{ st.title.replace(' · ', '·') }}
            </button>
          </div>

          <section v-for="(st, si) in current.stages" :key="st.id" :id="'stage-' + st.id" class="mb-8 scroll-mt-20">
            <!-- 阶段头 -->
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h3 class="text-[16px] font-bold text-ink-900">{{ st.title }}</h3>
              <span class="tag bg-slate-100 text-ink-500">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full" :class="layerDot(st.layer)" />{{ STAGE_LAYER_META[st.layer].label }}
              </span>
              <div class="flex-1" />
              <button
                v-if="stageAudio[`${current.id}#${st.id}`] || supported"
                class="btn shrink-0 border-slate-200 bg-white px-2.5 py-1 text-[11px] text-ink-500 hover:border-brand-300 hover:text-brand-700"
                :title="stageAudio[`${current.id}#${st.id}`] ? '播放本阶段内置讲解音频（离线可听）' : '朗读本阶段概要'"
                @click="listenStage(current, st.id)"
              >
                {{ speaking && readingStage === `${current.id}#${st.id}` ? '■ 停止' : stageAudio[`${current.id}#${st.id}`] ? '▶ 听学 · 内置' : '▶ 听学' }}
              </button>
              <span class="text-[11px] text-ink-300">{{ st.steps.length }} 节</span>
            </div>
            <p class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-ink-500">🎯 {{ st.goal }}</p>

            <!-- 小节卡片 -->
            <div class="space-y-4">
              <div v-for="step in st.steps" :key="step.id" class="card p-5" :class="doneSet.has(step.id) && 'border-emerald-200 bg-emerald-50/20'">
                <div class="mb-2.5 flex flex-wrap items-center gap-2">
                  <span class="font-mono text-[10.5px] font-bold text-ink-300">{{ step.id.toUpperCase() }}</span>
                  <span class="min-w-0 flex-1 text-[15px] font-bold text-ink-900">{{ step.title }}</span>
                  <span class="tag shrink-0" :class="STEP_KIND_META[step.kind].cls">{{ STEP_KIND_META[step.kind].label }}</span>
                </div>

                <ProjectDocRenderer :doc="step.doc" />

                <!-- 实操检查点 -->
                <div v-if="step.checks?.length" class="mt-4 rounded-xl border p-3.5" :class="doneSet.has(step.id) ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60'">
                  <div class="mb-2 text-[12px] font-bold" :class="doneSet.has(step.id) ? 'text-emerald-700' : 'text-ink-600'">
                    ✅ 实操检查点（完成后勾选打卡）
                  </div>
                  <ul class="space-y-1.5 text-[12.5px] text-ink-600">
                    <li v-for="(c, ci) in step.checks" :key="ci" class="flex gap-2">
                      <span class="mt-[3px] shrink-0 text-emerald-500"><AppIcon name="check-circle" :size="13" /></span>
                      <span class="min-w-0 flex-1">{{ c.q }}</span>
                    </li>
                  </ul>
                  <button class="btn-sm mt-3" :class="doneSet.has(step.id) ? 'btn-ghost text-emerald-700' : 'btn-soft'" @click="toggleStep(step)">
                    <AppIcon :name="doneSet.has(step.id) ? 'refresh' : 'check-circle'" :size="13" />
                    {{ doneSet.has(step.id) ? '取消完成' : '我已完成，打卡' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 阶段完成快捷键 -->
            <button class="mt-2.5 text-[11.5px] text-ink-400 underline-offset-2 hover:text-brand-600 hover:underline" @click="completeStage(si)">
              本阶段全部完成，一键打卡 →
            </button>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
