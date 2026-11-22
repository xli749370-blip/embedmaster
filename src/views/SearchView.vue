<script setup lang="ts">
/**
 * 全站检索页
 * ------------------------------------------------------------------
 * 36 章讲义没有后端，全文检索在浏览器里直接完成（见 @/utils/search）。
 * 交互上做了三件事：
 * 1. 输入防抖 260ms 后写进 URL（?q=xxx），刷新 / 分享都能还原结果；
 * 2. 结果按课程分组，标题命中用 <mark> 高亮，正文片段带上下文；
 * 3. 点击结果跳到讲义页并带上 ?sec=N 与 ?kw=，直接落在命中小节且高亮原文。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api, { type SearchHit, type SearchScope, type SearchSort } from '@/api'
import { highlightPlain, sortHits, tokenize, expandQuery } from '@/utils/search'
import { readStore, writeStore } from '@/utils/storage'

const route = useRoute()
const router = useRouter()

const inputRef = ref<HTMLInputElement | null>(null)
const keyword = ref(String(route.query.q ?? ''))
const results = ref<SearchHit[]>([])
const loading = ref(false)
const courseFilter = ref(0)
const history = ref<string[]>(readStore<string[]>('search-history', []))

/** 排序与范围都可以从 URL 还原，分享出去的链接看到的结果顺序一致 */
const sortMode = ref<SearchSort>(route.query.sort === 'course' ? 'course' : 'relevance')
const scope = ref<SearchScope>(route.query.scope === 'title' ? 'title' : 'all')

/** 热门词：覆盖六门课程里最常被查的术语 */
const hotWords = ['DMA 双缓冲', '中断嵌套', '去耦电容', 'FreeRTOS 队列', 'PID', 'I2C 上拉', 'ADC 采样', '状态机']

const sortOptions: Array<{ value: SearchSort; label: string }> = [
  { value: 'relevance', label: '相关度' },
  { value: 'course', label: '课程顺序' },
]

/** 课程色块，和 CourseCard 保持同一套主题色 */
const THEME_BG: Record<string, string> = {
  blue: 'from-[#2549eb] to-[#3a68f7]',
  cyan: 'from-[#0891b2] to-[#22d3ee]',
  violet: 'from-[#6d28d9] to-[#a78bfa]',
  amber: 'from-[#d97706] to-[#fbbf24]',
  emerald: 'from-[#059669] to-[#34d399]',
  rose: 'from-[#e11d48] to-[#fb7185]',
}

const terms = computed(() => tokenize(keyword.value))
const hasQuery = computed(() => terms.value.length > 0)

/** 拼音展开：输入 dsq / dingshiqi 时提示「已同时匹配：定时器」 */
const pinyinExpanded = computed(() => expandQuery(terms.value).pinyin)

/** 课程筛选条：只展示本次结果里出现过的课程 */
const courseOptions = computed(() => {
  const seen = new Map<number, { id: number; name: string; theme: string; count: number }>()
  for (const h of results.value) {
    const item = seen.get(h.course_id)
    if (item) item.count += 1
    else seen.set(h.course_id, { id: h.course_id, name: h.course_name, theme: h.cover_theme, count: 1 })
  }
  return Array.from(seen.values())
})

/** 排序在页面层做，切换排序不需要重新检索 */
const sorted = computed(() => sortHits(results.value, sortMode.value))

const visible = computed(() =>
  courseFilter.value ? sorted.value.filter((h) => h.course_id === courseFilter.value) : sorted.value,
)

/** 按课程分组，组内保持当前排序 */
const groups = computed(() => {
  const map = new Map<number, { id: number; name: string; theme: string; hits: SearchHit[] }>()
  for (const h of visible.value) {
    const g = map.get(h.course_id)
    if (g) g.hits.push(h)
    else map.set(h.course_id, { id: h.course_id, name: h.course_name, theme: h.cover_theme, hits: [h] })
  }
  return Array.from(map.values())
})

const totalCount = computed(() => visible.value.reduce((s, h) => s + h.count, 0))

/** 结果卡片跳转地址：带小节序号与高亮词 */
function linkOf(h: SearchHit) {
  const query: Record<string, string> = { kw: keyword.value.trim() }
  if (h.section_index >= 0) query.sec = String(h.section_index)
  return { path: `/chapter/${h.chapter_id}`, query }
}

/** 把「关键词 + 排序 + 范围」拼成 URL query，三处跳转共用，避免互相覆盖 */
function buildQuery(q: string) {
  const query: Record<string, string> = {}
  if (q.trim()) query.q = q.trim()
  if (scope.value === 'title') query.scope = 'title'
  if (sortMode.value === 'course') query.sort = 'course'
  return query
}

/** 给章节标题做「转义 + 高亮」，结果直接给 v-html */
function titleHtml(text: string) {
  return highlightPlain(text, keyword.value)
}

function rememberHistory(q: string) {
  const v = q.trim()
  if (!v) return
  const next = [v, ...history.value.filter((x) => x !== v)].slice(0, 6)
  history.value = next
  writeStore('search-history', next)
}

let seq = 0
async function run(q: string) {
  const mine = ++seq
  if (!q.trim()) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  const res = await api.search(q, { scope: scope.value })
  if (mine !== seq) return // 有更新的查询在路上，丢弃旧结果
  results.value = res.data
  loading.value = false
  courseFilter.value = 0
  rememberHistory(q)
}

let debounce: ReturnType<typeof setTimeout> | null = null
function onInput() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    router.replace({ path: '/search', query: buildQuery(keyword.value) })
    if (!keyword.value.trim()) run('')
  }, 260)
}

function pick(word: string) {
  keyword.value = word
  router.replace({ path: '/search', query: buildQuery(word) })
}

function clearAll() {
  keyword.value = ''
  router.replace({ path: '/search', query: buildQuery('') })
  nextTick(() => inputRef.value?.focus())
}

function submitNow() {
  if (debounce) clearTimeout(debounce)
  router.push({ path: '/search', query: buildQuery(keyword.value) })
}

/** 切换排序：纯前端重排，不重新扫描讲义 */
function setSort(v: SearchSort) {
  if (sortMode.value === v) return
  sortMode.value = v
  router.replace({ path: '/search', query: buildQuery(keyword.value) })
}

/** 切换范围需要重新检索（只搜标题时正文不参与匹配） */
function setScope(v: SearchScope) {
  if (scope.value === v) return
  scope.value = v
  router.replace({ path: '/search', query: buildQuery(keyword.value) })
  run(keyword.value)
}

/** 键盘：/ 或 Ctrl/⌘+K 聚焦搜索框，Esc 清空 */
function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA'
  if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault()
    inputRef.value?.focus()
    inputRef.value?.select()
  } else if (e.key === 'Escape' && document.activeElement === inputRef.value) {
    clearAll()
  }
}

/** 已经检索过的「关键词|范围」组合，避免切换范围时 setScope 与 watch 各跑一次 */
let lastKey = ''

watch(
  () => [String(route.query.q ?? ''), String(route.query.scope ?? 'all')] as const,
  ([q, sc]) => {
    const v = String(q ?? '')
    if (v !== keyword.value) keyword.value = v
    const s: SearchScope = sc === 'title' ? 'title' : 'all'
    if (s !== scope.value) scope.value = s
    const key = `${v}|${s}`
    if (key === lastKey) return
    lastKey = key
    run(v)
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKey)
  lastKey = `${keyword.value}|${scope.value}`
  run(keyword.value)
  if (!keyword.value) inputRef.value?.focus()
  // 清掉可能残留的 100% 进度条
  window.scrollTo({ top: 0 })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="container-page max-w-4xl py-8 sm:py-10">
    <nav class="flex items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <span class="text-ink-600">全站检索</span>
    </nav>

    <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">搜索讲义</h1>
        <p class="mt-1.5 text-sm text-ink-500">
          在 {{ api.allChapters.length }} 章、约 12.5 万字讲义里按关键词查找，支持空格分隔多个词。
        </p>
      </div>
      <span class="hidden items-center gap-1 text-[11px] text-ink-400 sm:flex">
        <kbd class="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500">/</kbd>
        快速聚焦
      </span>
    </div>

    <!-- 搜索框 -->
    <div class="relative mt-6">
      <AppIcon name="search" :size="18" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref="inputRef"
        v-model="keyword"
        type="search"
        class="field py-3.5 pl-12 pr-24 text-[15px]"
        placeholder="例如：DMA 双缓冲、去耦电容、队列阻塞"
        autocomplete="off"
        @input="onInput"
        @keydown.enter="submitNow"
      />
      <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <button
          v-if="keyword"
          class="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-ink-600"
          title="清空"
          @click="clearAll"
        >
          <AppIcon name="x" :size="14" />
        </button>
        <span class="hidden rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 sm:block">Ctrl K</span>
      </div>
    </div>

    <!-- 关键词碎片：多词查询时提示匹配逻辑 -->
    <div v-if="terms.length > 1" class="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
      <span>同时包含</span>
      <span v-for="t in terms" :key="t" class="rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">{{ t }}</span>
      <span>的章节</span>
    </div>

    <!-- 拼音展开提示：输入 dsq / dingshiqi 时说明实际匹配到的术语 -->
    <div v-if="pinyinExpanded.length" class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
      <AppIcon name="sparkles" :size="12" class="text-accent-600" />
      <span>拼音匹配</span>
      <template v-for="p in pinyinExpanded" :key="p">
        <span class="rounded-md bg-accent-500/10 px-1.5 py-0.5 font-semibold text-accent-600">{{ p }}</span>
      </template>
      <span class="hidden sm:inline">（支持全拼、首字母缩写与半个音节）</span>
    </div>

    <!-- 未输入：热门词 + 历史 -->
    <div v-if="!hasQuery" class="mt-8 space-y-6">
      <section>
        <h2 class="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">试试这些</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="w in hotWords"
            :key="w"
            class="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            @click="pick(w)"
          >
            {{ w }}
          </button>
        </div>
      </section>

      <section v-if="history.length">
        <h2 class="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
          <AppIcon name="clock" :size="12" /> 最近搜索
        </h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="h in history"
            :key="h"
            class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[13px] text-ink-600 transition hover:bg-slate-200"
            @click="pick(h)"
          >
            {{ h }}
          </button>
        </div>
      </section>

      <div class="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-6">
        <div class="flex items-center gap-2 text-[12px] font-bold text-ink-600">
          <AppIcon name="info" :size="13" class="text-brand-600" /> 检索范围
        </div>
        <p class="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">
          覆盖全部课程的章节标题、正文与小节标题，不检索题库与代码块的注释内容。多词查询按「同时包含」处理，
          例如 <span class="font-mono text-ink-700">DMA 双缓冲</span> 只会命中同时出现这两个词的章节。
          支持拼音检索：输入 <span class="font-mono text-ink-700">dingshiqi</span> 或首字母
          <span class="font-mono text-ink-700">dsq</span> 都能找到「定时器」相关章节；
          实在想不起原文写法的词，会自动在标题上做模糊匹配（结果带「模糊」标记）。
          拿不准原文怎么写的，把范围切到 <b class="font-semibold text-ink-700">仅标题</b>，只看章节名与小节名；
          想按学习顺序读，把排序切到 <b class="font-semibold text-ink-700">课程顺序</b>。
        </p>
      </div>
    </div>

    <!-- 结果统计 -->
    <div v-else class="mt-6 flex flex-wrap items-center justify-between gap-2">
      <p class="text-[13px] text-ink-500">
        <template v-if="loading">正在检索…</template>
        <template v-else-if="visible.length">
          找到 <b class="font-mono text-ink-900">{{ visible.length }}</b> 章，共
          <b class="font-mono text-ink-900">{{ totalCount }}</b> 处命中
        </template>
        <template v-else>没有找到包含「{{ keyword }}」的章节</template>
      </p>
      <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          v-for="s in sortOptions"
          :key="s.value"
          class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition"
          :class="sortMode === s.value ? 'bg-ink-900 text-white' : 'text-ink-500 hover:bg-slate-50'"
          @click="setSort(s.value)"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- 课程筛选 + 检索范围 -->
    <div v-if="hasQuery" class="mt-3 flex flex-wrap items-center gap-1.5">
      <div class="mr-1 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition"
          :class="scope === 'all' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-slate-50'"
          title="章节标题、小节标题与全部正文"
          @click="setScope('all')"
        >
          全文
        </button>
        <button
          class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition"
          :class="scope === 'title' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-slate-50'"
          title="只匹配章节标题与小节标题"
          @click="setScope('title')"
        >
          仅标题
        </button>
      </div>
      <span class="mr-0.5 hidden h-4 w-px bg-slate-200 sm:block" />
      <button
        class="rounded-full border px-3 py-1 text-[12px] font-medium transition"
        :class="courseFilter === 0 ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-200 bg-white text-ink-500 hover:border-slate-300'"
        @click="courseFilter = 0"
      >
        全部 {{ sorted.length }}
      </button>
      <button
        v-for="c in courseOptions"
        :key="c.id"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition"
        :class="courseFilter === c.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-200 bg-white text-ink-500 hover:border-slate-300'"
        @click="courseFilter = c.id"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-gradient-to-br" :class="THEME_BG[c.theme] ?? THEME_BG.blue" />
        {{ c.name }} {{ c.count }}
      </button>
    </div>

    <!-- 骨架 -->
    <div v-if="hasQuery && loading" class="mt-5 space-y-3">
      <div v-for="i in 3" :key="i" class="card h-28 animate-pulse bg-slate-100/60" />
    </div>

    <!-- 结果 -->
    <div v-else-if="hasQuery" class="mt-5 space-y-7">
      <section v-for="g in groups" :key="g.id">
        <h2 class="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
          <span class="h-2 w-2 rounded-sm bg-gradient-to-br" :class="THEME_BG[g.theme] ?? THEME_BG.blue" />
          {{ g.name }}
          <span class="font-normal normal-case tracking-normal text-slate-400">{{ g.hits.length }} 章</span>
        </h2>

        <div class="space-y-2.5">
          <RouterLink
            v-for="h in g.hits"
            :key="h.chapter_id"
            :to="linkOf(h)"
            class="card group block p-4 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
          >
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3
                    class="text-[15px] font-bold leading-snug text-ink-900 group-hover:text-brand-700"
                    v-html="titleHtml(h.chapter_name)"
                  />
                  <span v-if="h.count" class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-500">
                    {{ h.count }} 处
                  </span>
                  <span v-if="h.fuzzy_hit" class="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600" title="没有精确命中，按字形相似在标题上模糊匹配">
                    模糊
                  </span>
                </div>

                <div v-if="h.heading" class="mt-1 flex items-center gap-1 truncate text-[11.5px] text-brand-600">
                  <AppIcon name="layers" :size="11" />
                  <span class="truncate" v-html="titleHtml(h.heading)" />
                </div>

                <p
                  class="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-600"
                  v-html="h.snippet"
                />
              </div>
              <AppIcon
                name="arrow-right"
                :size="15"
                class="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
              />
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- 无结果 -->
      <div v-if="!visible.length && !loading" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 py-14">
        <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
          <AppIcon name="search" :size="22" />
        </span>
        <p class="mt-3 text-sm font-semibold text-ink-700">没有匹配的讲义</p>
        <p class="mt-1 text-xs text-ink-400">试试更短的关键词，或减少同时包含的词</p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <button v-for="w in hotWords.slice(0, 4)" :key="w" class="btn-ghost btn-sm" @click="pick(w)">{{ w }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
