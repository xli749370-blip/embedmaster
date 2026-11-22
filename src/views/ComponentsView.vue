<script setup lang="ts">
/**
 * 元器件百科（选型手册）
 * - 六大类 35 个器件词条：参数表怎么读 → 选型决策 → 典型应用 → 避坑
 * - 应用条目可深链到电路分析训练场对应案例（/circuit?case=cXX）
 */
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import ProjectDocRenderer from '@/components/ProjectDocRenderer.vue'
import { componentBank, COMP_CATS, type CompEntry, type CompCategory } from '@/mock/components'
import { compSheets } from '@/mock/datasheets'

const current = ref<CompEntry | null>(null)
const cat = ref<'all' | CompCategory>('all')
const kw = ref('')

const filtered = computed(() => {
  const k = kw.value.trim().toLowerCase()
  return componentBank.filter((c) => {
    if (cat.value !== 'all' && c.category !== cat.value) return false
    if (k && !(c.name + c.en + c.oneLiner).toLowerCase().includes(k)) return false
    return true
  })
})

const catCounts = computed(() => {
  const m: Record<string, number> = {}
  for (const c of componentBank) m[c.category] = (m[c.category] ?? 0) + 1
  return m
})

/** 词条 → markdown-lite 文本（复用项目库渲染器） */
function entryDoc(c: CompEntry): string {
  const params = c.params.map((p) => `- **${p.name}**：${p.meaning}`).join('\n')
  const select = c.select.map((s) => `- ${s}`).join('\n')
  const apps = c.apps.map((a) => (a.caseId ? `- ${a.desc} → 训练场案例 \`${a.caseId}\`` : `- ${a.desc}`)).join('\n')
  const pits = c.pitfalls.map((s) => `- ${s}`).join('\n')
  return `## 核心参数（怎么读 datasheet）\n${params}\n\n## 选型决策\n${select}\n\n## 典型应用\n${apps}\n\n## 避坑点\n${pits}`
}

function openComp(c: CompEntry) {
  current.value = c
  window.scrollTo({ top: 0 })
}

/** 从词条文档里抽出案例 id 列表（渲染后无法直接绑定，用映射法高亮链接） */
const appCases = computed(() => (current.value ? current.value.apps.filter((a) => a.caseId) : []))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
    <header v-if="!current" class="mb-5">
      <h1 class="text-2xl font-bold text-ink-900">元器件百科</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
        每个器件按同一套标准剖析：核心参数怎么读、选型怎么决策、典型应用去哪练、坑在哪——积少成多，构建你自己的选型直觉。
      </p>
    </header>

    <!-- ================= 详情页 ================= -->
    <template v-if="current">
      <button class="btn-ghost mb-4" @click="current = null">← 返回器件列表</button>
      <div class="anim-panel rounded-2xl border border-slate-200 bg-white p-6" style="background:#fff">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">{{ current.category }}</span>
          <h1 class="text-xl font-semibold text-ink-900">{{ current.name }}</h1>
          <RouterLink :to="`/meditate?channel=parts&id=P-${current.id}`" class="btn-ghost btn-sm ml-auto">
            <AppIcon name="play" :size="13" /> 听这个器件
          </RouterLink>
        </div>
        <p class="text-xs text-ink-400">{{ current.en }}</p>
        <p class="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-ink-900">{{ current.oneLiner }}</p>
        <div class="mt-5">
          <ProjectDocRenderer :doc="entryDoc(current)" />
        </div>
        <!-- 数据手册索引 -->
        <div v-if="(compSheets[current.id] || []).length" class="mt-5 border-t border-slate-100 pt-4">
          <p class="mb-2 text-xs font-medium text-ink-400">数据手册 · 官方原版速查：</p>
          <div class="flex flex-wrap gap-2">
            <a
              v-for="s in compSheets[current.id]"
              :key="s.url"
              :href="s.url"
              target="_blank"
              rel="noopener"
              class="btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-50"
            >
              <AppIcon name="bookmark" :size="13" /> {{ s.name }} ↗
            </a>
          </div>
        </div>
        <!-- 案例直达 -->
        <div v-if="appCases.length" class="mt-5 border-t border-slate-100 pt-4">
          <p class="mb-2 text-xs font-medium text-ink-400">实战链接 · 到电路分析训练场练对应案例：</p>
          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-for="a in appCases"
              :key="a.caseId"
              :to="`/circuit?case=${a.caseId}`"
              class="btn border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-100"
            >
              <AppIcon name="zap" :size="13" /> {{ a.caseId }} 案例
            </RouterLink>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= 列表页 ================= -->
    <template v-else>
      <!-- 分类 + 搜索 -->
      <div class="mb-5 flex flex-wrap items-center gap-2">
        <button
          class="btn px-3 py-1.5 text-xs"
          :class="cat === 'all' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="cat = 'all'"
        >全部 ({{ componentBank.length }})</button>
        <button
          v-for="cc in COMP_CATS"
          :key="cc"
          class="btn px-3 py-1.5 text-xs"
          :class="cat === cc ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="cat = cc"
        >{{ cc }} ({{ catCounts[cc] ?? 0 }})</button>
        <input
          v-model="kw"
          class="ml-auto w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-ink-900 outline-none focus:border-brand-500"
          placeholder="搜索器件名…"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="c in filtered"
          :key="c.id"
          class="card anim-panel rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300"
          style="background:#fff"
          @click="openComp(c)"
        >
          <div class="flex items-center gap-2">
            <h3 class="text-base font-medium text-ink-900">{{ c.name }}</h3>
            <span class="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-ink-400">{{ c.category }}</span>
          </div>
          <p class="mt-0.5 text-xs text-ink-400">{{ c.en }}</p>
          <p class="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-500">{{ c.oneLiner }}</p>
          <div class="mt-2.5 flex gap-1.5 text-[11px]">
            <span class="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">{{ c.params.length }} 参数</span>
            <span v-if="c.apps.some((a) => a.caseId)" class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600">
              {{ c.apps.filter((a) => a.caseId).length }} 实战案例
            </span>
          </div>
        </button>
      </div>
      <p v-if="!filtered.length" class="py-10 text-center text-sm text-ink-400">没有匹配的器件，换个关键词试试。</p>
    </template>
  </div>
</template>
