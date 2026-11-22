<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
</script>

<template>
  <div class="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
    <span class="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-glow">
      <AppIcon name="compass" :size="30" :stroke-width="1.7" />
    </span>
    <p class="mt-6 font-mono text-5xl font-extrabold tracking-tight text-ink-900">404</p>
    <h1 class="mt-2 text-lg font-bold text-ink-800">这个引脚没有连到任何地方</h1>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
      页面可能已被移动或删除。就像悬空的 BOOT 引脚一样，状态不确定。
    </p>
    <div class="mt-6 flex gap-2">
      <RouterLink to="/" class="btn-primary">返回首页</RouterLink>
      <RouterLink to="/courses" class="btn-ghost">去课程中心</RouterLink>
    </div>
  </div>
</template>
