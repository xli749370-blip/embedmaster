<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-16 border-t border-slate-200 bg-white/70">
    <div class="container-page flex flex-col items-center gap-1.5 py-8 text-center">
      <span class="text-[13px] font-bold tracking-tight text-ink-700">EmbedMaster · 嵌入式系统学习平台</span>
      <span class="text-[11px] text-slate-400">© {{ year }} EmbedMaster</span>
    </div>
  </footer>
</template>
