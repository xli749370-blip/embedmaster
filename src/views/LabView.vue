<script setup lang="ts">
/**
 * 动画实验室：全站 26 个交互式动画的总览页。
 * 数据全部从数据层静态导出派生，按课程分组；
 * 卡片给出「动画在哪一章」的直达链接，方便脱离课程顺序按需复习。
 */
import { computed } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'

interface LabAnim {
  id: number
  chapterId: number
  chapterName: string
  animName: string
  intro: string
  courseId: number
}

interface LabGroup {
  courseId: number
  courseName: string
  theme: string
  items: LabAnim[]
}

/** 主题色 → 卡片左侧色条与图标底色（与 CourseCard 的 THEMES 对应） */
const BAR: Record<string, { bar: string; chip: string; icon: string }> = {
  blue: { bar: 'bg-[#2549eb]', chip: 'bg-blue-50 text-blue-700', icon: 'cpu' },
  cyan: { bar: 'bg-[#0891b2]', chip: 'bg-cyan-50 text-cyan-700', icon: 'bolt' },
  violet: { bar: 'bg-[#6d28d9]', chip: 'bg-violet-50 text-violet-700', icon: 'layers' },
  amber: { bar: 'bg-[#d97706]', chip: 'bg-amber-50 text-amber-700', icon: 'target' },
  emerald: { bar: 'bg-[#059669]', chip: 'bg-emerald-50 text-emerald-700', icon: 'layers' },
  rose: { bar: 'bg-[#e11d48]', chip: 'bg-rose-50 text-rose-700', icon: 'flag' },
  sky: { bar: 'bg-[#0284c7]', chip: 'bg-sky-50 text-sky-700', icon: 'compass' },
}

const groups = computed<LabGroup[]>(() => {
  const out: LabGroup[] = []
  for (const c of api.allCourses) {
    const chapters = api.allChapters.filter((ch) => ch.course_id === c.id)
    const items: LabAnim[] = []
    for (const ch of chapters) {
      for (const a of api.allAnimations.filter((x) => x.chapter_id === ch.id && x.is_deleted === 0)) {
        // 摘要：取 anim_script 的第一句（到第一个中文句号）
        const intro = a.anim_script.split('。')[0] + '。'
        items.push({
          id: a.id,
          chapterId: ch.id,
          chapterName: ch.chapter_name,
          animName: a.anim_name,
          intro,
          courseId: c.id,
        })
      }
    }
    if (items.length) {
      out.push({ courseId: c.id, courseName: c.course_name, theme: c.cover_theme, items })
    }
  }
  return out
})

const total = computed(() => groups.value.reduce((s, g) => s + g.items.length, 0))
</script>

<template>
  <div class="container-page pb-16 pt-6">
    <!-- 头部 -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink-900">动画实验室</h1>
        <p class="mt-1 text-[13px] text-ink-500">
          全站 {{ total }} 个交互式动画按课程归档——每个动画都长在讲义的语境里，点卡片回章节，正文 + 动画 + 习题一次看全。
        </p>
      </div>
      <span class="tag bg-brand-50 text-brand-700">共 {{ groups.length }} 门课参与</span>
    </div>

    <!-- 分组 -->
    <section v-for="g in groups" :key="g.courseId" class="mt-7">
      <div class="mb-3 flex items-center gap-2">
        <span class="h-4 w-1.5 rounded-full" :class="BAR[g.theme]?.bar ?? BAR.blue.bar" />
        <h2 class="text-[15px] font-bold text-ink-800">{{ g.courseName }}</h2>
        <span class="text-[11px] font-semibold text-ink-400">{{ g.items.length }} 个动画</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="a in g.items"
          :key="a.id"
          :to="`/chapter/${a.chapterId}`"
          class="card group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span class="absolute inset-y-0 left-0 w-1" :class="BAR[g.theme]?.bar ?? BAR.blue.bar" />
          <div class="flex items-center gap-2">
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
              :class="BAR[g.theme]?.bar ?? BAR.blue.bar"
            >
              <AppIcon :name="BAR[g.theme]?.icon ?? 'cpu'" :size="14" />
            </span>
            <h3 class="min-w-0 truncate text-[13.5px] font-bold text-ink-800 group-hover:text-brand-700">
              {{ a.animName }}
            </h3>
          </div>
          <p class="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-ink-500">{{ a.intro }}</p>
          <div class="mt-2.5 flex items-center justify-between gap-2">
            <span class="min-w-0 truncate text-[11px] text-ink-400">{{ a.chapterName }}</span>
            <span class="shrink-0 text-[11px] font-bold text-brand-600 opacity-0 transition group-hover:opacity-100">
              去章节 →
            </span>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
