<script setup lang="ts">
/**
 * 代码库 —— 可复用嵌入式代码模块
 * - 分类筛选 + 关键词搜索（标题/简介/标签/代码内容全文匹配）
 * - 详情页：完整代码 + 复制 + 要点避坑 + 关联训练资源（电路案例/项目库）
 */
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { codeBank, CODE_CATS, type CodeEntry, type CodeCategory } from '@/mock/codelib'

const current = ref<CodeEntry | null>(null)
const cat = ref<CodeCategory | 'all'>('all')
const kw = ref('')
const copied = ref(false)

const filtered = computed(() => {
  const k = kw.value.trim().toLowerCase()
  return codeBank.filter((c) => {
    if (cat.value !== 'all' && c.cat !== cat.value) return false
    if (!k) return true
    const hay = (c.title + c.brief + c.tags.join('') + c.code + c.points.join('')).toLowerCase()
    return hay.includes(k)
  })
})

const catCounts = computed(() => {
  const m: Record<string, number> = {}
  for (const c of codeBank) m[c.cat] = (m[c.cat] ?? 0) + 1
  return m
})

function catLabel(id: string) {
  return CODE_CATS.find((c) => c.id === id)?.label ?? id
}

function openEntry(c: CodeEntry) {
  current.value = c
  copied.value = false
  window.scrollTo({ top: 0 })
}

/** 复制代码（clipboard API + execCommand 兜底，兼容 http 非安全上下文） */
async function copyCode() {
  if (!current.value) return
  const raw = current.value.code
  try {
    await navigator.clipboard.writeText(raw)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = raw
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1600)
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
    <header v-if="!current" class="mb-5">
      <h1 class="text-2xl font-bold text-ink-900">代码库</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
        可直接落进工程的 {{ codeBank.length }} 个代码模块：外设驱动、协议解析、RTOS 骨架、控制算法、调试手段——每段代码都配「要点避坑」，学到的是写法背后的判断力。
      </p>
    </header>

    <!-- ================= 详情页 ================= -->
    <template v-if="current">
      <button class="btn-ghost mb-4" @click="current = null">← 返回代码列表</button>
      <div class="anim-panel rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" style="background: #fff">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">{{ catLabel(current.cat) }}</span>
          <h1 class="text-xl font-semibold text-ink-900">{{ current.title }}</h1>
          <RouterLink :to="`/meditate?channel=code&id=K-${current.id}`" class="btn-ghost btn-sm ml-auto">
            <AppIcon name="play" :size="13" /> 听思路
          </RouterLink>
        </div>
        <p class="text-sm text-ink-500">{{ current.brief }}</p>

        <div class="mt-3 flex flex-wrap items-center gap-1.5">
          <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">{{ current.platform }}</span>
          <span v-for="t in current.tags" :key="t" class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-400">#{{ t }}</span>
        </div>

        <!-- 代码块 -->
        <div class="relative mt-4 overflow-hidden rounded-xl bg-ink-800">
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span class="font-mono text-[11px] tracking-wide text-slate-400">{{ current.id }} · STM32 HAL</span>
            <button
              class="rounded-md border border-white/20 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
              @click="copyCode"
            >
              {{ copied ? '已复制 ✓' : '复制代码' }}
            </button>
          </div>
          <pre class="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-slate-200"><code>{{ current.code }}</code></pre>
        </div>

        <!-- 要点避坑 -->
        <div class="mt-5">
          <p class="mb-2 text-xs font-semibold tracking-wide text-ink-400">要点与避坑</p>
          <ul class="space-y-2">
            <li v-for="(p, i) in current.points" :key="i" class="flex gap-2 text-sm leading-relaxed text-ink-700">
              <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-600">{{ i + 1 }}</span>
              <span>{{ p }}</span>
            </li>
          </ul>
        </div>

        <!-- 关联训练资源 -->
        <div v-if="current.linkCircuit || current.linkProject" class="mt-5 border-t border-slate-100 pt-4">
          <p class="mb-2 text-xs font-medium text-ink-400">学完就练 · 关联训练资源：</p>
          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-if="current.linkCircuit"
              :to="`/circuit?case=${current.linkCircuit}`"
              class="btn border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-100"
            >
              <AppIcon name="zap" :size="13" /> 电路案例 {{ current.linkCircuit }}
            </RouterLink>
            <RouterLink
              v-if="current.linkProject"
              to="/projects"
              class="btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-accent-600 hover:bg-slate-100"
            >
              <AppIcon name="bookmark" :size="13" /> 项目库实战
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
          v-for="cc in CODE_CATS"
          :key="cc.id"
          class="btn px-3 py-1.5 text-xs"
          :class="cat === cc.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="cat = cc.id"
        >{{ cc.label }} ({{ cc.id === 'all' ? codeBank.length : catCounts[cc.id] ?? 0 }})</button>
        <input
          v-model="kw"
          class="ml-auto w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-ink-900 outline-none focus:border-brand-500"
          placeholder="搜索标题/标签/代码…"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="c in filtered"
          :key="c.id"
          class="card anim-panel rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300"
          style="background: #fff"
          @click="openEntry(c)"
        >
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">{{ c.id }}</span>
            <h3 class="text-base font-medium text-ink-900">{{ c.title }}</h3>
          </div>
          <p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{{ c.brief }}</p>
          <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span class="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">{{ catLabel(c.cat) }}</span>
            <span v-for="t in c.tags.slice(0, 3)" :key="t" class="text-[10px] text-ink-300">#{{ t }}</span>
            <span class="ml-auto font-mono text-[10px] text-ink-300">{{ c.code.split('\n').length }} 行</span>
          </div>
        </button>
      </div>

      <div v-if="!filtered.length" class="py-16 text-center text-sm text-ink-300">
        没有匹配的代码模块，换个关键词试试
      </div>
    </template>
  </div>
</template>
