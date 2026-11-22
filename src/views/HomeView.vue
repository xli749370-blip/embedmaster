<script setup lang="ts">
/** 首页：Hero + 数据统计 + 能力矩阵 + 热门课程 + 继续学习 + 学习路径 */
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CourseCard from '@/components/CourseCard.vue'
import api, { type ProgressItem } from '@/api'
import { animations, courses, getChaptersByCourse, getQuestionsByChapter, totalChapterCount, totalQuestionCount } from '@/mock/data'

const progress = ref<ProgressItem[]>([])
const loading = ref(true)

/**
 * 全站可听内容规模：理论 70 节 + 心法 20 篇 + 工程 43 段 + 课程精听 205 篇
 * 数字取自 audio 下各频道 manifest 的条目数，音频有增减时同步更新这里
 */
const totalAudioCount = 338
const audioHours = 13

const features = [
  {
    icon: 'bolt',
    title: '交互式电路动画',
    desc: '基于 Konva 的电路仿真动画，拖动滑块即可观察电压、电流、波形的实时响应。',
    tone: 'from-brand-500 to-brand-600',
  },
  {
    icon: 'book',
    title: 'Markdown 讲义',
    desc: '支持 Markdown 渲染与 KaTeX 数学公式，公式、表格、代码块完整呈现。',
    tone: 'from-cyan-500 to-accent-600',
  },
  {
    icon: 'quiz',
    title: '自动判分刷题',
    desc: '单选、多选、判断自动判分，简答题对照参考答案自评，逐题给出解析。',
    tone: 'from-violet-500 to-violet-600',
  },
  {
    icon: 'target',
    title: '进度与错题本',
    desc: '章节阅读进度自动记录，答错的题自动归集到错题本，随时回炉。',
    tone: 'from-amber-500 to-orange-500',
  },
]

const stats = computed(() => [
  { label: '章节讲义', value: totalChapterCount, unit: '章' },
  { label: '题库题目', value: totalQuestionCount, unit: '道' },
  { label: '交互动画', value: animations.length, unit: '个' },
  { label: '覆盖阶段', value: new Set(courses.map((c) => c.stage_type)).size, unit: '个' },
])

/** 继续学习：优先选有进度但未完成的章节 */
const continueChapter = computed(() => {
  const list = courses.flatMap((c) => getChaptersByCourse(c.id))
  const inProgress = list.find((c) => {
    const p = progress.value.find((x) => x.chapter_id === c.id)
    return p && p.read_percent > 0 && p.read_percent < 95
  })
  if (inProgress) {
    const p = progress.value.find((x) => x.chapter_id === inProgress.id)!
    return { chapter: inProgress, percent: p.read_percent }
  }
  const done = progress.value.filter((p) => p.is_finished === 1).length
  if (done === list.length && list.length > 0) return { chapter: list[0], percent: 100 }
  return { chapter: list[0], percent: 0 }
})

const totalProgress = computed(() => {
  const total = totalChapterCount
  const finished = progress.value.filter((p) => p.is_finished === 1).length
  return Math.round((finished / total) * 100)
})

const finishedCount = computed(() => progress.value.filter((p) => p.is_finished === 1).length)

onMounted(async () => {
  const res = await api.getProgressList()
  progress.value = res.data
  loading.value = false
})

const courseMeta = (id: number) => {
  const chapters = getChaptersByCourse(id)
  const qCount = chapters.reduce((sum, c) => sum + getQuestionsByChapter(c.id).length, 0)
  const p = progress.value.filter((x) => chapters.some((c) => c.id === x.chapter_id))
  const avg = p.length ? p.reduce((s, x) => s + x.read_percent, 0) / chapters.length : 0
  return { chapters, qCount, progress: avg }
}

const path = [
  { step: '01', title: '硬件预备基础', desc: '电路基础 → RC 充放电 → 元器件与焊接', to: '/course/1', tone: 'bg-accent-500' },
  { step: '02', title: 'PCB 专项', desc: '封装 → 布局 → 布线 → DRC → 综合案例', to: '/course/2', tone: 'bg-brand-600' },
  { step: '03', title: '嵌入式 C 语言', desc: '指针 → 位操作 → 内存布局 → 并发 → 模块化', to: '/course/4', tone: 'bg-emerald-600' },
  { step: '04', title: 'STM32 固件', desc: 'GPIO → 中断 → PWM → ADC → 串口 → 总线', to: '/course/3', tone: 'bg-violet-500' },
  { step: '05', title: 'RTOS 与多任务', desc: '任务调度 → 上下文切换 → 同步通信 → 内存管理', to: '/course/5', tone: 'bg-emerald-500' },
  { step: '06', title: '综合项目实战', desc: '温湿度无线节点：硬件→驱动→RTOS→协议→量产', to: '/course/6', tone: 'bg-rose-500' },
  { step: '07', title: '刷题巩固', desc: '章节练习 + 错题本回炉，形成闭环', to: '/quiz', tone: 'bg-amber-500' },
]
</script>

<template>
  <div>
    <!-- ==================== Hero ==================== -->
    <section class="relative overflow-hidden">
      <div class="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-300/25 blur-3xl" />
      <div class="pointer-events-none absolute right-0 top-10 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" />

      <div class="container-page relative grid gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-20">
        <div class="animate-fade-up">
          <span class="chip border-brand-200 bg-brand-50/80 text-brand-700">
            <span class="relative flex h-1.5 w-1.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
              <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
            </span>
            从电路到固件 · 一站式嵌入式学习
          </span>

          <h1 class="mt-5 text-[1.75rem] font-extrabold leading-[1.18] tracking-tight text-ink-900 sm:text-[2.6rem]">
            把嵌入式知识<br />
            变成<span class="relative whitespace-nowrap">
              <span class="relative z-10 bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">看得见</span>
              <span class="absolute inset-x-0 bottom-1 z-0 h-2.5 rounded bg-brand-100" />
            </span>的电流
          </h1>

          <p class="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-500">
            EmbedMaster 面向嵌入式学习者，提供课程讲义、交互式电路动画、在线刷题、学习进度管理与错题本。
            从欧姆定律到综合项目实战，一条路径走完。
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <RouterLink to="/course/1" class="btn-primary">
              <AppIcon name="play" :size="16" />
              从第一章开始
            </RouterLink>
            <RouterLink to="/courses" class="btn-ghost">
              <AppIcon name="grid" :size="16" />
              浏览全部课程
            </RouterLink>
          </div>

          <RouterLink
            to="/search"
            class="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2 text-[13px] font-medium text-ink-500 transition hover:border-brand-300 hover:bg-white hover:text-brand-700"
          >
            <AppIcon name="search" :size="14" />
            在 {{ totalChapterCount }} 章讲义里搜索一个概念
            <kbd class="ml-1 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] text-ink-400">/</kbd>
          </RouterLink>

          <dl class="mt-8 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <div v-for="s in stats" :key="s.label">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-ink-400">{{ s.label }}</dt>
              <dd class="mt-0.5 flex items-baseline gap-1">
                <span class="font-mono text-2xl font-extrabold text-ink-900">{{ s.value }}</span>
                <span class="text-xs text-ink-400">{{ s.unit }}</span>
              </dd>
            </div>
          </dl>
        </div>

        <!-- Hero 右侧：继续学习卡片 -->
        <div class="animate-fade-up [animation-delay:120ms]">
          <div class="relative">
            <div class="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-brand-500/10 via-transparent to-accent-500/10 blur-xl" />
            <div class="card relative overflow-hidden p-0">
              <div class="relative h-28 overflow-hidden bg-gradient-to-br from-[#0e7490] via-[#0891b2] to-[#22d3ee]">
                <div
                  class="absolute inset-0 opacity-20"
                  style="
                    background-image: linear-gradient(to right, #fff 1px, transparent 1px),
                      linear-gradient(to bottom, #fff 1px, transparent 1px);
                    background-size: 20px 20px;
                  "
                />
                <div class="absolute inset-0 flex items-end justify-between p-5">
                  <div>
                    <div class="text-[11px] font-semibold uppercase tracking-wider text-white/70">继续学习</div>
                    <div class="mt-1 text-[15px] font-bold text-white">第 {{ continueChapter.chapter?.sort }} 章</div>
                  </div>
                  <!-- 进度环 -->
                  <div class="relative grid h-14 w-14 place-items-center">
                    <svg viewBox="0 0 44 44" class="absolute h-14 w-14 -rotate-90">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3.5" />
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        stroke="#fff"
                        stroke-width="3.5"
                        stroke-linecap="round"
                        :stroke-dasharray="113"
                        :stroke-dashoffset="113 - (113 * continueChapter.percent) / 100"
                        class="transition-all duration-700"
                      />
                    </svg>
                    <span class="font-mono text-xs font-bold text-white">{{ Math.round(continueChapter.percent) }}%</span>
                  </div>
                </div>
              </div>

              <div class="p-5">
                <h3 class="text-[15px] font-bold leading-snug text-ink-900">{{ continueChapter.chapter?.chapter_name }}</h3>
                <p class="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-500">
                  {{ continueChapter.chapter?.summary }}
                </p>

                <div class="mt-4 flex items-center gap-4 text-[11px] text-ink-400">
                  <span class="flex items-center gap-1"><AppIcon name="clock" :size="12" /> {{ continueChapter.chapter?.estimated_minutes }} 分钟</span>
                  <span class="flex items-center gap-1"><AppIcon name="quiz" :size="12" /> {{ getQuestionsByChapter(continueChapter.chapter?.id ?? 0).length }} 题</span>
                  <span v-if="continueChapter.chapter?.id === 101" class="flex items-center gap-1 text-brand-600"><AppIcon name="bolt" :size="12" /> 含动画</span>
                  <span v-if="continueChapter.chapter?.id === 102" class="flex items-center gap-1 text-brand-600"><AppIcon name="chart" :size="12" /> 含动画</span>
                </div>

                <RouterLink :to="`/chapter/${continueChapter.chapter?.id}`" class="btn-primary mt-5 w-full">
                  继续学习
                  <AppIcon name="arrow-right" :size="15" />
                </RouterLink>

                <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-ink-400">
                  <span>总进度 {{ finishedCount }} / {{ totalChapterCount }} 章</span>
                  <span class="font-mono font-semibold text-brand-700">{{ totalProgress }}%</span>
                </div>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-700" :style="{ width: `${totalProgress}%` }" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 能力矩阵 ==================== -->
    <section class="container-page py-6">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="f in features" :key="f.title" class="card group p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm" :class="f.tone">
            <AppIcon :name="f.icon" :size="19" :stroke-width="2" />
          </span>
          <h3 class="mt-4 text-sm font-bold text-ink-900">{{ f.title }}</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-ink-500">{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- ==================== 热门课程 ==================== -->
    <section class="container-page py-12">
      <div class="mb-6 flex items-end justify-between">
        <div>
          <h2 class="text-xl font-extrabold tracking-tight text-ink-900">热门课程</h2>
          <p class="mt-1 text-sm text-ink-500">按学习顺序编排，建议从硬件预备基础开始</p>
        </div>
        <RouterLink to="/courses" class="link-underline hidden text-sm font-semibold sm:inline">查看全部 →</RouterLink>
      </div>

      <div class="grid gap-5 sm:grid-cols-2">
        <CourseCard
          v-for="c in courses"
          :key="c.id"
          :course="c"
          :chapter-count="courseMeta(c.id).chapters.length"
          :question-count="courseMeta(c.id).qCount"
          :progress="courseMeta(c.id).progress"
        />
      </div>
    </section>

    <!-- ==================== 学习路径 ==================== -->
    <section class="container-page py-8">
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div class="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div class="relative bg-ink-900 p-8 text-white lg:p-10">
            <div class="pointer-events-none absolute inset-0 opacity-[0.07]" style="background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 18px 18px" />
            <h2 class="relative text-xl font-extrabold tracking-tight">七步走完嵌入式入门</h2>
            <p class="relative mt-2 text-sm leading-relaxed text-slate-400">
              课程顺序不是随便排的：先建立电路直觉，再动手画板，然后补上写固件必需的 C 语言功底，接着驱动 STM32 外设，用 RTOS 把多任务串起来，最后用一个综合项目把前面所有知识落地成可出货的产品、用题目把知识钉牢。
            </p>
            <RouterLink to="/courses" class="btn mt-6 bg-white text-ink-900 hover:bg-slate-100">
              <AppIcon name="compass" :size="16" />
              开始我的学习路径
            </RouterLink>
          </div>

          <div class="divide-y divide-slate-100">
            <RouterLink
              v-for="p in path"
              :key="p.step"
              :to="p.to"
              class="group flex items-center gap-4 px-6 py-5 transition-colors hover:bg-slate-50 lg:px-8"
            >
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold text-white" :class="p.tone">
                {{ p.step }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-ink-900">{{ p.title }}</div>
                <div class="mt-0.5 truncate text-[13px] text-ink-500">{{ p.desc }}</div>
              </div>
              <AppIcon name="chevron-right" :size="16" class="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 听学入口 ==================== -->
    <section class="container-page pt-6">
      <div class="relative overflow-hidden rounded-2xl border border-violet-200 px-6 py-8 sm:px-10" style="background: linear-gradient(120deg, #f5f3ff 0%, #eef2ff 100%)">
        <div class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40" style="background: radial-gradient(circle, #ddd6fe, transparent 70%)" />
        <div class="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-bold tracking-wider text-violet-500">眼睛累了，就换耳朵</p>
            <h2 class="mt-1 text-xl font-extrabold tracking-tight text-ink-900">冥想听学 · 闭着眼睛也能继续学</h2>
            <p class="mt-2 max-w-lg text-sm leading-relaxed text-ink-500">
              教材正文、电路门诊、元器件图鉴、代码思路、实战避坑，全部转成口语讲解：{{ totalAudioCount }} 段、约 {{ audioHours }} 小时。神经音色预生成，离线可听——睡前、通勤、闭眼休息时都能继续推进。
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-stretch gap-2">
            <RouterLink to="/meditate" class="btn bg-violet-600 text-white hover:bg-violet-700">
              <AppIcon name="play" :size="15" /> 开始听学
            </RouterLink>
            <RouterLink to="/meditate?channel=lecture" class="btn border border-violet-200 bg-white text-violet-700 hover:bg-violet-50">
              <AppIcon name="book" :size="15" /> 听整套讲义
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== CTA ==================== -->
    <section class="container-page pt-6">
      <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 px-6 py-10 text-center text-white sm:px-12">
        <div class="pointer-events-none absolute inset-0 opacity-[0.12]" style="background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 22px 22px" />
        <h2 class="relative text-xl font-extrabold tracking-tight sm:text-2xl">先用题目检验一下自己？</h2>
        <p class="relative mx-auto mt-2 max-w-md text-sm text-white/80">
          {{ totalQuestionCount }} 道题覆盖电路基础、PCB 全流程、嵌入式 C、STM32 固件、RTOS 多任务与综合项目实战，答错自动进错题本。
        </p>
        <div class="relative mt-6 flex flex-wrap justify-center gap-3">
          <RouterLink to="/quiz" class="btn bg-white text-brand-700 hover:bg-brand-50">
            <AppIcon name="zap" :size="16" /> 立即刷题
          </RouterLink>
          <RouterLink to="/assess" class="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
            <AppIcon name="edit" :size="16" /> 学习效果检测
          </RouterLink>
          <RouterLink to="/circuit" class="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
            <AppIcon name="zap" :size="16" /> 电路分析训练
          </RouterLink>
          <RouterLink to="/projects" class="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
            <AppIcon name="layers" :size="16" /> 项目实战库
          </RouterLink>
          <RouterLink to="/profile" class="btn border border-white/30 text-white hover:bg-white/10">
            <AppIcon name="chart" :size="16" /> 查看我的进度
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>
