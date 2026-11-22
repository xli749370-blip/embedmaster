<script setup lang="ts">
/**
 * 数据手册索引 —— 元件 + 芯片手册一站速查
 * 手册按对象分类：主控芯片 / 传感器外设 / 元器件百科词条（与 /components 双向联动）
 */
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { compSheets, chipSheets, sheetTips, type Sheet } from '@/mock/datasheets'
import { componentBank } from '@/mock/components'

const kw = ref('')
const k = computed(() => kw.value.trim().toLowerCase())

/** 词条 + 手册 联合列表 */
const compRows = computed(() =>
  componentBank
    .filter((c) => compSheets[c.id]?.length)
    .map((c) => ({ id: c.id, name: `${c.name}（${c.en}）`, sheets: compSheets[c.id] }))
    .filter((r) => !k.value || (r.name + r.sheets.map((s) => s.name).join('')).toLowerCase().includes(k.value)),
)

const chipRows = computed(() =>
  chipSheets
    .map((c) => ({ ...c, sheets: c.sheets.filter((s) => !k.value || (c.name + s.name).toLowerCase().includes(k.value)) }))
    .filter((c) => c.sheets.length),
)

function open(url: string) {
  window.open(url, '_blank')
}

const totalSheets = computed(() => {
  let n = chipSheets.reduce((a, c) => a + c.sheets.length, 0)
  for (const id in compSheets) n += compSheets[id].length
  return n
})

function sheetLabel(s: Sheet) {
  return s.note ? `${s.name} — ${s.note}` : s.name
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-ink-900">数据手册索引</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
        平台涉及的 {{ totalSheets }} 份官方手册一站速查：主控芯片、传感器外设、元器件词条逐一对号。元器件详情页内也会挂上对应手册。
      </p>
    </header>

    <div class="mb-5 flex flex-wrap gap-2">
      <input
        v-model="kw"
        class="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-ink-900 outline-none focus:border-brand-500"
        placeholder="搜索芯片/器件名，如 STM32F103、MPU6050…"
      />
    </div>

    <!-- 查询方法论 -->
    <div class="anim-panel mb-6 rounded-xl border border-amber-200 p-4" style="background: #fffbeb">
      <p class="mb-2 text-xs font-semibold text-amber-800">手册怎么读 · 五条方法论</p>
      <ul class="space-y-1 text-xs leading-relaxed text-amber-900">
        <li v-for="(t, i) in sheetTips" :key="i" class="flex gap-2">
          <span class="font-mono opacity-50">{{ i + 1 }}.</span>{{ t }}
        </li>
      </ul>
    </div>

    <!-- 芯片手册 -->
    <section class="mb-7">
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900">
        <span class="h-4 w-1 rounded-full bg-brand-500" />主控与常用芯片
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="c in chipRows" :key="c.name" class="rounded-xl border border-slate-200 bg-white p-4" style="background: #fff">
          <div class="mb-2 flex items-center gap-2">
            <h3 class="text-sm font-semibold text-ink-900">{{ c.name }}</h3>
            <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-ink-400">{{ c.cat }}</span>
          </div>
          <button
            v-for="s in c.sheets"
            :key="s.url"
            class="mb-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-brand-700 transition hover:bg-brand-50"
            @click="open(s.url)"
          >
            <AppIcon name="bookmark" :size="13" class="shrink-0 text-brand-400" />
            <span class="min-w-0 flex-1">{{ sheetLabel(s) }}</span>
            <span class="shrink-0 text-[10px] text-ink-300">打开 ↗</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 元件词条手册 -->
    <section>
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900">
        <span class="h-4 w-1 rounded-full bg-accent-500" />元器件百科词条配套手册
      </h2>
      <div class="grid gap-2">
        <div v-for="r in compRows" :key="r.id" class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-2.5" style="background: #fff">
          <span class="min-w-40 text-xs font-medium text-ink-700">{{ r.name }}</span>
          <a
            v-for="s in r.sheets"
            :key="s.url"
            :href="s.url"
            target="_blank"
            rel="noopener"
            class="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-brand-700 transition hover:bg-brand-50"
          >{{ s.name }} ↗</a>
          <RouterLink :to="`/components`" class="ml-auto text-[10px] text-ink-300 hover:text-brand-600">词条详情 →</RouterLink>
        </div>
      </div>
      <div v-if="!compRows.length && !chipRows.length" class="py-12 text-center text-sm text-ink-300">没有匹配的手册，换个关键词</div>
    </section>
  </div>
</template>
