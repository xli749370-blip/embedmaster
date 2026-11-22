<script setup lang="ts">
/** 课程卡片：封面色块用渐变生成，避免依赖外部图片资源 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { Course } from '@/mock/data'

const props = withDefaults(
  defineProps<{
    course: Course
    chapterCount: number
    questionCount?: number
    progress?: number
  }>(),
  { progress: 0, questionCount: 0 },
)

const THEMES: Record<string, { bg: string; ring: string; glow: string; icon: string }> = {
  blue: {
    bg: 'from-[#1d37d8] via-[#2549eb] to-[#3a68f7]',
    ring: 'ring-brand-500/20',
    glow: 'from-brand-400/30',
    icon: 'cpu',
  },
  cyan: {
    bg: 'from-[#0e7490] via-[#0891b2] to-[#22d3ee]',
    ring: 'ring-accent-500/20',
    glow: 'from-accent-400/30',
    icon: 'bolt',
  },
  violet: {
    bg: 'from-[#4c1d95] via-[#6d28d9] to-[#a78bfa]',
    ring: 'ring-violet-500/20',
    glow: 'from-violet-400/30',
    icon: 'layers',
  },
  amber: {
    bg: 'from-[#b45309] via-[#d97706] to-[#fbbf24]',
    ring: 'ring-amber-500/20',
    glow: 'from-amber-400/30',
    icon: 'target',
  },
  emerald: {
    bg: 'from-[#047857] via-[#059669] to-[#34d399]',
    ring: 'ring-emerald-500/20',
    glow: 'from-emerald-400/30',
    icon: 'layers',
  },
  rose: {
    bg: 'from-[#9f1239] via-[#e11d48] to-[#fb7185]',
    ring: 'ring-rose-500/20',
    glow: 'from-rose-400/30',
    icon: 'flag',
  },
  sky: {
    bg: 'from-[#0369a1] via-[#0284c7] to-[#38bdf8]',
    ring: 'ring-sky-500/20',
    glow: 'from-sky-400/30',
    icon: 'compass',
  },
}

const theme = computed(() => THEMES[props.course.cover_theme] ?? THEMES.blue)
</script>

<template>
  <RouterLink
    :to="`/course/${course.id}`"
    class="group card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
  >
    <!-- 封面 -->
    <div class="relative h-36 overflow-hidden bg-gradient-to-br" :class="theme.bg">
      <!-- 装饰网格 -->
      <div
        class="absolute inset-0 opacity-[0.18]"
        style="
          background-image: linear-gradient(to right, #fff 1px, transparent 1px),
            linear-gradient(to bottom, #fff 1px, transparent 1px);
          background-size: 22px 22px;
        "
      />
      <div class="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-xl" />
      <div class="absolute -bottom-10 left-6 h-24 w-24 rounded-full bg-white/10 blur-lg" />

      <div class="absolute inset-0 flex flex-col justify-between p-5">
        <div class="flex items-start justify-between">
          <span class="rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            {{ course.stage_type }}
          </span>
          <AppIcon :name="theme.icon" :size="30" :stroke-width="1.4" class="text-white/50 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110" />
        </div>
        <h3 class="text-[17px] font-extrabold tracking-tight text-white drop-shadow-sm">{{ course.course_name }}</h3>
      </div>
    </div>

    <!-- 正文 -->
    <div class="p-5">
      <p class="line-clamp-2 min-h-[2.6rem] text-[13px] leading-relaxed text-ink-500">{{ course.course_desc }}</p>

      <div class="mt-4 flex items-center gap-4 text-xs text-ink-400">
        <span class="flex items-center gap-1"><AppIcon name="book" :size="13" /> {{ chapterCount }} 章</span>
        <span v-if="questionCount" class="flex items-center gap-1"><AppIcon name="quiz" :size="13" /> {{ questionCount }} 题</span>
        <span class="flex items-center gap-1"><AppIcon name="clock" :size="13" /> 约 {{ chapterCount * 12 }} 分钟</span>
      </div>

      <!-- 进度 -->
      <div v-if="progress > 0" class="mt-4">
        <div class="mb-1.5 flex items-center justify-between text-[11px] font-medium">
          <span class="text-ink-400">学习进度</span>
          <span class="text-brand-700">{{ Math.round(progress) }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-700"
            :style="{ width: `${Math.min(100, progress)}%` }"
          />
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span class="text-xs font-semibold text-brand-700">进入课程</span>
        <span class="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-brand-600 transition-all group-hover:bg-brand-600 group-hover:text-white">
          <AppIcon name="arrow-right" :size="14" />
        </span>
      </div>
    </div>
  </RouterLink>
</template>
