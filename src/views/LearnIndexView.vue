<script setup lang="ts">
/**
 * 学习中心索引 —— 理论四件套入口列表
 */
import { learnCourses } from '@/mock/learn'
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <h1 class="text-2xl font-bold text-ink-900">学习中心</h1>
    <p class="mt-1 text-sm text-ink-500">理论四件套：语言基础、计算机底层认知、C 语言大全、Python 大全。全部支持冥想听学。</p>

    <div class="mt-6 grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="c in learnCourses"
        :key="c.id"
        :to="`/learn/${c.id}`"
        class="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-[15px] font-bold text-ink-900">{{ c.title }}</h2>
          <span class="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
            {{ c.sections.length }} 节
          </span>
        </div>
        <p class="mt-2 text-[13px] leading-relaxed text-ink-500">{{ c.subtitle }}</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <span v-if="c.tts" class="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-600">🎧 可听学</span>
          <span v-if="c.id === 'clang'" class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-600">嵌入式 / 非嵌入式双轨</span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
