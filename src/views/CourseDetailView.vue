<script setup lang="ts">
/** 课程详情：封面信息 + 章节列表 + 进度 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api, { type Chapter, type Course, type ProgressItem } from '@/api'
import { getQuestionsByChapter, getAnimationsByChapter } from '@/mock/data'

const route = useRoute()
const courseId = computed(() => Number(route.params.id))

const course = ref<Course | null>(null)
const chapters = ref<Chapter[]>([])
const progress = ref<ProgressItem[]>([])
const loading = ref(true)

const THEME: Record<string, string> = {
  blue: 'from-[#1d37d8] via-[#2549eb] to-[#3a68f7]',
  cyan: 'from-[#0e7490] via-[#0891b2] to-[#22d3ee]',
  violet: 'from-[#4c1d95] via-[#6d28d9] to-[#a78bfa]',
  amber: 'from-[#b45309] via-[#d97706] to-[#fbbf24]',
  emerald: 'from-[#047857] via-[#059669] to-[#34d399]',
  rose: 'from-[#9f1239] via-[#e11d48] to-[#fb7185]',
  sky: 'from-[#0369a1] via-[#0284c7] to-[#38bdf8]',
}

onMounted(async () => {
  const [res, pRes] = await Promise.all([api.getCourseDetail(courseId.value), api.getProgressList()])
  if (res.code === 200) {
    course.value = res.data.course
    chapters.value = res.data.chapters
  }
  progress.value = pRes.data
  loading.value = false
})

const progressOf = (chapterId: number) => progress.value.find((p) => p.chapter_id === chapterId)

const totalQ = computed(() => chapters.value.reduce((s, c) => s + getQuestionsByChapter(c.id).length, 0))
const totalAnim = computed(() => chapters.value.reduce((s, c) => s + getAnimationsByChapter(c.id).length, 0))
const totalMinutes = computed(() => chapters.value.reduce((s, c) => s + c.estimated_minutes, 0))
const finished = computed(() => chapters.value.filter((c) => progressOf(c.id)?.is_finished === 1).length)
const overall = computed(() => (chapters.value.length ? (finished.value / chapters.value.length) * 100 : 0))

/** 下一个要学的章节：第一个未完成的 */
const nextChapter = computed(() => {
  const un = chapters.value.find((c) => progressOf(c.id)?.is_finished !== 1)
  return un ?? chapters.value[0]
})
</script>

<template>
  <div v-if="loading" class="container-page py-16">
    <div class="mx-auto h-40 max-w-4xl animate-pulse rounded-2xl bg-slate-100" />
    <div class="mx-auto mt-6 h-64 max-w-4xl animate-pulse rounded-2xl bg-slate-100/70" />
  </div>

  <div v-else-if="course" class="container-page py-8">
    <!-- 面包屑 -->
    <nav class="flex items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <RouterLink to="/courses" class="hover:text-brand-700">课程中心</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <span class="text-ink-600">{{ course.course_name }}</span>
    </nav>

    <!-- 课程头部 -->
    <div class="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-br text-white" :class="THEME[course.cover_theme]">
      <div class="pointer-events-none absolute inset-0 opacity-[0.15]" style="background-image: linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px); background-size: 24px 24px" />
      <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />

      <div class="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
        <div>
          <span class="rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">{{ course.stage_type }}</span>
          <h1 class="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{{ course.course_name }}</h1>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-white/85">{{ course.course_desc }}</p>

          <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/80">
            <span class="flex items-center gap-1.5"><AppIcon name="book" :size="14" /> {{ chapters.length }} 个章节</span>
            <span class="flex items-center gap-1.5"><AppIcon name="quiz" :size="14" /> {{ totalQ }} 道练习题</span>
            <span class="flex items-center gap-1.5"><AppIcon name="clock" :size="14" /> 约 {{ totalMinutes }} 分钟</span>
            <span class="flex items-center gap-1.5"><AppIcon name="bolt" :size="14" /> {{ totalAnim }} 个交互动画</span>
          </div>
        </div>

        <div class="rounded-xl bg-white/10 p-4 backdrop-blur">
          <div class="flex items-center justify-between text-xs text-white/80">
            <span>学习进度</span>
            <span class="font-mono font-bold text-white">{{ Math.round(overall) }}%</span>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/25">
            <div class="h-full rounded-full bg-white transition-all duration-700" :style="{ width: `${overall}%` }" />
          </div>
          <div class="mt-2 text-[11px] text-white/70">已完成 {{ finished }} / {{ chapters.length }} 章</div>
          <RouterLink v-if="nextChapter" :to="`/chapter/${nextChapter.id}`" class="btn mt-4 w-full bg-white text-ink-900 hover:bg-slate-100">
            {{ overall > 0 ? '继续学习' : '开始学习' }}
            <AppIcon name="arrow-right" :size="15" />
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- 章节列表 -->
    <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 class="text-sm font-bold text-ink-900">课程章节</h2>
          <span class="text-xs text-ink-400">按顺序学习效果最佳</span>
        </div>

        <ol class="divide-y divide-slate-100">
          <li v-for="(c, idx) in chapters" :key="c.id">
            <RouterLink :to="`/chapter/${c.id}`" class="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50/80">
              <!-- 序号 / 完成状态 -->
              <span
                class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold transition-colors"
                :class="
                  progressOf(c.id)?.is_finished === 1
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                    : 'border-slate-200 bg-slate-50 text-ink-400 group-hover:border-brand-300 group-hover:bg-brand-50 group-hover:text-brand-600'
                "
              >
                <AppIcon v-if="progressOf(c.id)?.is_finished === 1" name="check" :size="15" :stroke-width="2.6" />
                <template v-else>{{ String(idx + 1).padStart(2, '0') }}</template>
              </span>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-sm font-bold text-ink-900 group-hover:text-brand-700">{{ c.chapter_name }}</h3>
                  <span v-if="getAnimationsByChapter(c.id).length" class="tag bg-brand-50 text-brand-700">
                    <AppIcon name="bolt" :size="10" class="mr-0.5" /> 动画
                  </span>
                </div>
                <p class="mt-1 line-clamp-1 text-[13px] text-ink-500">{{ c.summary }}</p>

                <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-400">
                  <span class="flex items-center gap-1"><AppIcon name="clock" :size="11" /> {{ c.estimated_minutes }} 分钟</span>
                  <span class="flex items-center gap-1"><AppIcon name="quiz" :size="11" /> {{ getQuestionsByChapter(c.id).length }} 题</span>
                  <span v-if="progressOf(c.id)" class="flex items-center gap-1 text-brand-600">
                    <AppIcon name="chart" :size="11" /> 已读 {{ progressOf(c.id)?.read_percent }}%
                  </span>
                </div>

                <div v-if="progressOf(c.id)" class="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500" :style="{ width: `${progressOf(c.id)?.read_percent}%` }" />
                </div>
              </div>

              <AppIcon name="chevron-right" :size="16" class="mt-2 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </RouterLink>
          </li>
        </ol>
      </div>

      <!-- 侧栏 -->
      <aside class="space-y-4">
        <div class="card p-5">
          <h3 class="text-sm font-bold text-ink-900">本课程练习</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-ink-500">
            共 {{ totalQ }} 道题，包含单选、多选、判断与简答。答错的题会自动进入错题本。
          </p>
          <RouterLink :to="`/quiz?course=${course.id}`" class="btn-primary mt-4 w-full">
            <AppIcon name="zap" :size="15" /> 进入刷题
          </RouterLink>
        </div>

        <div class="card p-5">
          <h3 class="text-sm font-bold text-ink-900">学习建议</h3>
          <ul class="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-500">
            <li class="flex gap-2"><AppIcon name="check" :size="14" class="mt-0.5 text-emerald-500" /> 每章讲义读完再做题，正确率会明显上升</li>
            <li class="flex gap-2"><AppIcon name="check" :size="14" class="mt-0.5 text-emerald-500" /> 动画部分务必动手拖动滑块，建立直觉</li>
            <li class="flex gap-2"><AppIcon name="check" :size="14" class="mt-0.5 text-emerald-500" /> 错题本至少回炉两次再进入下一阶段</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>

  <div v-else class="container-page py-24 text-center">
    <p class="text-lg font-bold text-ink-900">课程不存在</p>
    <RouterLink to="/courses" class="btn-primary mt-4">返回课程中心</RouterLink>
  </div>
</template>
