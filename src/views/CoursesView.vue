<script setup lang="ts">
/** 课程中心：阶段筛选 + 关键词搜索 + 课程卡片栅格 */
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CourseCard from '@/components/CourseCard.vue'
import api, { type Course, type ProgressItem } from '@/api'
import { getChaptersByCourse, getQuestionsByChapter, courses } from '@/mock/data'

const list = ref<Course[]>([])
const progress = ref<ProgressItem[]>([])
const loading = ref(true)
const keyword = ref('')
const stage = ref('全部')

const stages = ['全部', '硬件预备基础', 'PCB专项', '嵌入式C', 'STM32固件', 'RTOS实战', '综合实战']

/** 实际阶段数（课程去重后的 stage_type 数量），避免文案与数据漂移 */
const stageCount = new Set(courses.map((c) => c.stage_type)).size

async function load() {
  loading.value = true
  const [courseRes, progressRes] = await Promise.all([api.getCourseList(), api.getProgressList()])
  list.value = courseRes.data
  progress.value = progressRes.data
  loading.value = false
}

onMounted(load)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return list.value.filter((c) => {
    const matchStage = stage.value === '全部' || c.stage_type === stage.value
    const matchKw = !kw || c.course_name.toLowerCase().includes(kw) || c.course_desc.toLowerCase().includes(kw)
    return matchStage && matchKw
  })
})

const meta = (id: number) => {
  const chapters = getChaptersByCourse(id)
  const qCount = chapters.reduce((s, c) => s + getQuestionsByChapter(c.id).length, 0)
  const p = progress.value.filter((x) => chapters.some((c) => c.id === x.chapter_id))
  const avg = p.length ? p.reduce((s, x) => s + x.read_percent, 0) / chapters.length : 0
  return { chapters, qCount, progress: avg }
}

// 每个阶段的课程数，用于标签角标
const countOf = (s: string) => (s === '全部' ? list.value.length : list.value.filter((c) => c.stage_type === s).length)

watch(stage, () => {
  /* 切换筛选时保留关键词，无需额外请求 */
})
</script>

<template>
  <div class="container-page py-10">
    <!-- 页头 -->
    <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div>
        <nav class="flex items-center gap-1.5 text-xs text-ink-400">
          <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
          <AppIcon name="chevron-right" :size="12" />
          <span class="text-ink-600">课程中心</span>
        </nav>
        <h1 class="mt-3 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">课程中心</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
          {{ stageCount }} 个阶段、{{ list.length }} 门课程，覆盖从电路基础、PCB 生产文件、嵌入式 C、STM32 固件、RTOS 多任务到综合项目实战的完整链路。
        </p>
      </div>

      <!-- 搜索 -->
      <div class="relative w-full md:w-72">
        <AppIcon name="search" :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input v-model="keyword" type="text" class="field pl-10" placeholder="搜索课程名称或简介…" />
        <button
          v-if="keyword"
          class="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
          @click="keyword = ''"
        >
          <AppIcon name="x" :size="13" />
        </button>
      </div>
    </div>

    <!-- 阶段筛选 -->
    <div class="mt-8 flex flex-wrap items-center gap-2">
      <button
        v-for="s in stages"
        :key="s"
        class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
        :class="
          stage === s
            ? 'border-brand-600 bg-brand-600 text-white shadow-[0_6px_16px_-8px_rgba(37,73,235,.8)]'
            : 'border-slate-200 bg-white text-ink-500 hover:border-brand-300 hover:text-brand-700'
        "
        @click="stage = s"
      >
        {{ s }}
        <span class="rounded-full px-1.5 text-[11px] font-bold" :class="stage === s ? 'bg-white/20' : 'bg-slate-100 text-ink-400'">
          {{ countOf(s) }}
        </span>
      </button>
      <div class="flex-1" />
      <span class="hidden text-xs text-ink-400 sm:block">共 {{ filtered.length }} 门课程</span>
    </div>

    <!-- 骨架屏 -->
    <div v-if="loading" class="mt-6 grid gap-5 sm:grid-cols-2">
      <div v-for="i in 2" :key="i" class="card h-72 animate-pulse bg-slate-100/70" />
    </div>

    <!-- 课程列表 -->
    <div v-else-if="filtered.length" class="mt-6 grid gap-5 sm:grid-cols-2">
      <CourseCard
        v-for="c in filtered"
        :key="c.id"
        :course="c"
        :chapter-count="meta(c.id).chapters.length"
        :question-count="meta(c.id).qCount"
        :progress="meta(c.id).progress"
      />
    </div>

    <!-- 空状态 -->
    <div v-else class="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 py-16">
      <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <AppIcon name="search" :size="22" />
      </span>
      <p class="mt-3 text-sm font-semibold text-ink-700">没有找到匹配的课程</p>
      <p class="mt-1 text-xs text-ink-400">试试更换关键词或切换到「全部」阶段</p>
      <button class="btn-ghost btn-sm mt-4" @click="(keyword = ''), (stage = '全部')">重置筛选</button>
    </div>
    <!-- 不知道从哪开始 -->
    <div class="card mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <AppIcon name="compass" :size="19" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-bold text-ink-900">不知道怎么选？</h3>
        <p class="mt-0.5 text-[13px] leading-relaxed text-ink-500">
          没有电路基础就从「硬件预备基础」开始，两章讲义配动画能建立直觉；已经会看原理图的，直接进 PCB 专项。
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <RouterLink to="/course/1" class="btn-primary btn-sm">从零开始</RouterLink>
        <RouterLink to="/quiz" class="btn-ghost btn-sm">先测一下</RouterLink>
      </div>
    </div>
  </div>
</template>
