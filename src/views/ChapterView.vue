<script setup lang="ts">
/**
 * 讲义阅读页
 * - Markdown + KaTeX 渲染
 * - 讲义内的 [[anim:xxx]] 占位符会在此处被替换为 Konva 动画组件
 * - 滚动自动记录阅读进度（写入 user_progress）
 * - 支持收藏、上一章 / 下一章、跳转刷题
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AnimationHost from '@/components/animations/AnimationHost.vue'
import QuickQuiz from '@/components/QuickQuiz.vue'
import api, { type Chapter, type Course } from '@/api'
import { getQuestionsByChapter } from '@/mock/data'
import { renderMarkdown, splitAnimationBlocks, stripLeadingH1, type TocItem } from '@/utils/markdown'
import { escapeRegExp, tokenize, expandQuery } from '@/utils/search'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const chapter = ref<Chapter | null>(null)
const course = ref<Course | null>(null)
const prev = ref<Chapter | null>(null)
const next = ref<Chapter | null>(null)

const favorited = ref(false)
const readPercent = ref(0)
const toc = ref<TocItem[]>([])
const tocOpen = ref(false)
const articleRef = ref<HTMLElement | null>(null)
/** 从搜索页跳进来时的高亮状态 */
const highlightKw = ref('')
const highlightCount = ref(0)

/** 随章小测弹层 */
const quizOpen = ref(false)

/** 渲染后的区块：markdown HTML 或动画组件 key */
const blocks = ref<Array<{ type: 'md' | 'anim'; html?: string; key?: string }>>([])

const chapterId = computed(() => Number(route.params.id))
const questionCount = computed(() => (chapter.value ? getQuestionsByChapter(chapter.value.id).length : 0))

/** 统计讲义里出现的动画个数 */
const animCount = computed(() => blocks.value.filter((b) => b.type === 'anim').length)

/* ---------------- 解析 Markdown → HTML 区块 ---------------- */
function buildBlocks() {
  if (!chapter.value) return
  // 页面头部已经展示章节标题，去掉 Markdown 开头重复的一级标题
  const source = stripLeadingH1(chapter.value.chapter_content)
  const raw = splitAnimationBlocks(source)
  const headings: TocItem[] = []
  let counter = 0

  const out = raw.map((b) => {
    if (b.type === 'anim') return { type: 'anim' as const, key: b.key }

    // 给 h1~h3 注入 id，供右侧目录跳转
    const html = renderMarkdown(b.content).replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
      const id = `sec-${counter++}`
      const text = inner.replace(/<[^>]+>/g, '').trim()
      headings.push({ level: Number(lvl), text, id })
      return `<h${lvl} id="${id}">${inner}</h${lvl}>`
    })
    return { type: 'md' as const, html }
  })

  blocks.value = out
  toc.value = headings
}

/* ---------------- 加载章节 ---------------- */
async function load(id: number) {
  loading.value = true
  const res = await api.getChapterDetail(id)
  if (res.code !== 200) {
    toast.error(res.message)
    router.replace('/courses')
    return
  }
  chapter.value = res.data.chapter
  course.value = res.data.course
  prev.value = res.data.prev
  next.value = res.data.next
  buildBlocks()
  favorited.value = api.isFavorited(id)
  readPercent.value = 0

  await nextTick()
  loading.value = false
  await nextTick()
  // 从搜索页跳进来时会带 ?sec=小节序号&kw=关键词，直接落到命中位置
  const jumped = applyDeepLink()
  if (!jumped) window.scrollTo({ top: 0 })
  measure()
}

/** 代码块复制按钮：渲染在 markdown 的 .md-code-copy 上，这里统一做事件委托 */
async function onArticleClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest?.('.md-code-copy') as HTMLElement | null
  if (!btn) return
  const raw = btn.dataset.code ? decodeURIComponent(btn.dataset.code) : ''
  if (!raw) return
  try {
    await navigator.clipboard.writeText(raw)
    btn.textContent = '已复制 ✓'
  } catch {
    // 非安全上下文（http）下 clipboard API 不可用，退回 execCommand
    const ta = document.createElement('textarea')
    ta.value = raw
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    btn.textContent = '已复制 ✓'
  }
  toast.success('代码已复制到剪贴板')
  setTimeout(() => {
    btn.textContent = '复制代码'
  }, 1600)
}

onMounted(() => {
  load(chapterId.value)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measure, { passive: true })
  articleRef.value?.addEventListener('click', onArticleClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measure)
  articleRef.value?.removeEventListener('click', onArticleClick)
  flushProgress(true)
  if (timer) clearTimeout(timer)
})

watch(chapterId, (id) => {
  if (id) load(id)
})

// 同一章内只改查询参数（例如从搜索页点本页另一条结果）时重新定位
watch(
  () => [route.query.sec, route.query.kw],
  () => {
    if (!loading.value && chapter.value) nextTick(() => applyDeepLink())
  },
)

/* ---------------- 阅读进度 ---------------- */
let ticking = false
let timer: ReturnType<typeof setTimeout> | null = null

function measure() {
  const el = articleRef.value
  if (!el) return
  const start = el.offsetTop
  const height = el.offsetHeight
  const viewport = window.innerHeight
  const end = start + height - viewport * 0.8
  const y = window.scrollY
  let p = end > start ? (y - start) / (end - start) : 1
  p = Math.max(0, Math.min(1, p))
  // 滚到底部附近直接算完成
  if (y + viewport >= document.documentElement.scrollHeight - 40) p = 1
  readPercent.value = Math.round(p * 100)
}

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    measure()
    ticking = false
  })
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => flushProgress(), 900)
}

async function flushProgress(force = false) {
  if (!chapter.value) return
  if (!force && readPercent.value < 3) return
  await api.updateProgress(chapter.value.id, readPercent.value)
}

/* ---------------- 深链：定位小节 & 关键词高亮 ---------------- */

const MARK_STYLE = 'rounded-[2px] bg-amber-200/70 px-0.5 font-semibold text-amber-900'

/** 去掉正文里所有高亮标记，并把文本节点合并回去 */
function clearMarks() {
  const el = articleRef.value
  if (el) {
    el.querySelectorAll('mark[data-kw]').forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent ?? ''))
    })
    el.normalize()
  }
  highlightKw.value = ''
  highlightCount.value = 0
}

/**
 * 在正文里把关键词包成 <mark>，返回命中次数。
 * 跳过 KaTeX 公式、代码块与已有的 mark，避免破坏公式渲染和重复包裹。
 */
function applyHighlight(kw: string): number {
  const el = articleRef.value
  // 与检索页一致：拼音展开后按完整词表高亮（dsq → 定时器 等也会被标出）
  const terms = expandQuery(tokenize(kw)).all
  if (!el || !terms.length) return 0

  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('mark, .katex, pre, code, script, style')) return NodeFilter.FILTER_REJECT
      const v = (node.nodeValue ?? '').toLowerCase()
      if (!v) return NodeFilter.FILTER_REJECT
      return terms.some((t) => v.includes(t)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  // 先收集再替换：边遍历边改 DOM 会让 TreeWalker 丢节点
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)

  let count = 0
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    const frag = document.createDocumentFragment()
    let last = 0
    let hit = 0
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)))
      const mark = document.createElement('mark')
      mark.setAttribute('data-kw', '1')
      mark.className = MARK_STYLE
      mark.textContent = m[0]
      frag.appendChild(mark)
      last = m.index + m[0].length
      hit += 1
      if (m[0].length === 0) re.lastIndex += 1 // 空匹配保护
    }
    if (!hit) continue
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
    node.parentNode?.replaceChild(frag, node)
    count += hit
  }
  return count
}

/** 处理 ?sec=小节序号 与 ?kw=关键词，返回是否发生了滚动定位 */
function applyDeepLink(): boolean {
  const sec = typeof route.query.sec === 'string' ? route.query.sec : ''
  const kw = typeof route.query.kw === 'string' ? route.query.kw : ''

  clearMarks()
  if (kw) {
    const n = applyHighlight(kw)
    highlightCount.value = n
    highlightKw.value = n ? kw : ''
  }
  if (!sec) return false

  const target = document.getElementById(`sec-${sec}`)
  if (!target) return false
  const y = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 84)
  // 等一帧再滚，避免刚渲染的动画容器把高度撑开导致偏移
  requestAnimationFrame(() => window.scrollTo({ top: y }))
  return true
}

function clearHighlight() {
  clearMarks()
  if (route.query.sec || route.query.kw) router.replace({ path: route.path })
}

/* ---------------- 交互 ---------------- */
async function toggleFavorite() {
  const res = await api.toggleFavorite(chapterId.value)
  favorited.value = res.data.favorited
  toast.success(res.message)
}

async function markFinished() {
  readPercent.value = 100
  await api.updateProgress(chapterId.value, 100)
  toast.success('已标记本章完成')
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - 88
  window.scrollTo({ top: y, behavior: 'smooth' })
  tocOpen.value = false
}

function goQuiz() {
  flushProgress(true)
  router.push(`/quiz/${chapterId.value}`)
}
</script>

<template>
  <!-- 顶部阅读进度条 -->
  <div class="fixed left-0 top-16 z-30 h-0.5 w-full bg-transparent">
    <div
      class="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width] duration-150"
      :style="{ width: `${readPercent}%` }"
    />
  </div>

  <div v-if="loading" class="container-page py-16">
    <div class="mx-auto h-8 w-2/3 max-w-3xl animate-pulse rounded-lg bg-slate-100" />
    <div class="mx-auto mt-4 h-4 w-1/2 max-w-3xl animate-pulse rounded bg-slate-100/70" />
    <div class="mx-auto mt-8 h-96 max-w-3xl animate-pulse rounded-2xl bg-slate-100/60" />
  </div>

  <div v-else-if="chapter" class="container-page py-8">
    <!-- 面包屑 -->
    <nav class="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <RouterLink to="/courses" class="hover:text-brand-700">课程中心</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <RouterLink :to="`/course/${course?.id}`" class="hover:text-brand-700">{{ course?.course_name }}</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <span class="line-clamp-1 text-ink-600">{{ chapter.chapter_name }}</span>
    </nav>

    <div class="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <!-- ==================== 正文 ==================== -->
      <div class="min-w-0">
        <!-- 标题区 -->
        <header class="card p-6 sm:p-7">
          <div class="flex flex-wrap items-center gap-2">
            <span class="tag bg-brand-50 text-brand-700">{{ course?.stage_type }}</span>
            <span class="chip"><AppIcon name="clock" :size="12" /> 约 {{ chapter.estimated_minutes }} 分钟</span>
            <span class="chip"><AppIcon name="quiz" :size="12" /> {{ questionCount }} 道题</span>
            <span v-if="animCount" class="chip border-brand-200 bg-brand-50 text-brand-700">
              <AppIcon name="bolt" :size="12" /> {{ animCount }} 个交互动画
            </span>
          </div>

          <h1 class="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-ink-900">{{ chapter.chapter_name }}</h1>

          <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button class="btn-ghost btn-sm" :class="favorited ? 'border-brand-300 bg-brand-50 text-brand-700' : ''" @click="toggleFavorite">
              <AppIcon name="bookmark" :size="13" :class="favorited ? 'fill-brand-600 text-brand-600' : ''" />
              {{ favorited ? '已收藏' : '收藏本章' }}
            </button>
            <button class="btn-ghost btn-sm" @click="markFinished">
              <AppIcon name="check-circle" :size="13" /> 标记已学完
            </button>
            <button v-if="questionCount" class="btn-soft btn-sm" @click="quizOpen = true">
              <AppIcon name="zap" :size="13" /> 随章小测 · 3 题
            </button>
            <!-- 眼睛累了就换耳朵：跳听力频道并把索引定位到本章 -->
            <RouterLink :to="`/meditate?channel=lecture&id=L-${chapter.id}`" class="btn-ghost btn-sm">
              <AppIcon name="play" :size="13" /> 听本章
            </RouterLink>
            <div class="flex-1" />
            <span class="font-mono text-[11px] text-ink-400">阅读进度 {{ readPercent }}%</span>
          </div>
        </header>

        <!-- 移动端目录 -->
        <div class="mt-4 lg:hidden">
          <button class="btn-ghost w-full justify-between" @click="tocOpen = !tocOpen">
            <span class="flex items-center gap-2"><AppIcon name="layers" :size="15" /> 本章目录（{{ toc.length }}）</span>
            <AppIcon name="chevron-down" :size="15" :class="tocOpen ? 'rotate-180 transition-transform' : 'transition-transform'" />
          </button>
          <div v-if="tocOpen" class="card mt-2 divide-y divide-slate-100 p-2">
            <button
              v-for="t in toc"
              :key="t.id"
              class="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-ink-600 hover:bg-slate-50 hover:text-brand-700"
              :class="t.level === 3 ? 'pl-7' : t.level === 2 ? 'pl-5' : 'font-semibold'"
              @click="scrollTo(t.id)"
            >
              {{ t.text }}
            </button>
          </div>
        </div>

        <!-- 搜索关键词高亮提示 -->
        <div
          v-if="highlightKw"
          class="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-[12.5px] text-amber-900"
        >
          <AppIcon name="search" :size="13" />
          <span>
            从检索进入：已高亮「<b class="font-semibold">{{ highlightKw }}</b
            >」，本章共 <b class="font-mono">{{ highlightCount }}</b> 处
          </span>
          <button class="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 underline-offset-2 hover:underline" @click="clearHighlight">
            清除高亮
          </button>
        </div>

        <!-- 讲义正文 -->
        <article ref="articleRef" class="card mt-4 overflow-hidden">
          <div class="space-y-6 px-6 py-7 sm:px-8 sm:py-8">
            <template v-for="(b, i) in blocks" :key="i">
              <!-- Markdown 区块 -->
              <div v-if="b.type === 'md'" class="md-body" v-html="b.html" />

              <!-- 动画区块（anim-panel：深色模式下保持亮色仪表盘外观，见 style.css） -->
              <figure v-else class="anim-panel not-prose -mx-1">
                <AnimationHost :anim-key="b.key!" />
                <figcaption class="mt-2 px-1 text-center text-[11px] text-ink-400">
                  拖动滑块 / 点击按钮与动画交互，观察物理量之间的实时关系
                </figcaption>
              </figure>
            </template>
          </div>

          <!-- 章节底部 -->
          <div class="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <div class="text-xs text-ink-500">
              读完本章了吗？做 {{ questionCount }} 道题巩固一下
            </div>
            <div class="flex-1" />
            <button v-if="questionCount" class="btn-ghost btn-sm" @click="quizOpen = true">
              <AppIcon name="zap" :size="13" /> 随章小测
            </button>
            <button class="btn-primary btn-sm" @click="goQuiz">
              <AppIcon name="quiz" :size="13" /> 进入本章刷题
            </button>
          </div>
        </article>

        <!-- 上一章 / 下一章：子项必须 min-w-0，否则长章名会把网格撑破（窄屏横向溢出） -->
        <div class="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <RouterLink
            v-if="prev"
            :to="`/chapter/${prev.id}`"
            class="card group flex min-w-0 items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-ink-400 group-hover:bg-brand-50 group-hover:text-brand-600">
              <AppIcon name="arrow-left" :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-ink-400">上一章</div>
              <div class="truncate text-[13px] font-semibold text-ink-800">{{ prev.chapter_name }}</div>
            </div>
          </RouterLink>
          <div v-else class="hidden min-w-0 sm:block" />

          <RouterLink
            v-if="next"
            :to="`/chapter/${next.id}`"
            class="card group flex min-w-0 items-center gap-3 p-4 text-right transition-all hover:-translate-y-0.5 hover:shadow-lift sm:col-start-2"
          >
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-ink-400">下一章</div>
              <div class="truncate text-[13px] font-semibold text-ink-800">{{ next.chapter_name }}</div>
            </div>
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-ink-400 group-hover:bg-brand-50 group-hover:text-brand-600">
              <AppIcon name="arrow-right" :size="16" />
            </span>
          </RouterLink>
        </div>
      </div>

      <!-- ==================== 侧栏目录 ==================== -->
      <aside class="hidden lg:block">
        <div class="sticky top-24 space-y-4">
          <div class="card p-4">
            <h3 class="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <AppIcon name="layers" :size="12" /> 本章目录
            </h3>
            <nav class="max-h-[46vh] space-y-0.5 overflow-y-auto pr-1">
              <button
                v-for="t in toc"
                :key="t.id"
                class="block w-full rounded-md py-1.5 pr-2 text-left text-[13px] leading-snug transition-colors hover:bg-slate-50 hover:text-brand-700"
                :class="
                  t.level === 1
                    ? 'pl-2 font-bold text-ink-800'
                    : t.level === 2
                      ? 'pl-4 font-medium text-ink-600'
                      : 'pl-6 text-[12px] text-ink-500'
                "
                @click="scrollTo(t.id)"
              >
                {{ t.text }}
              </button>
            </nav>
          </div>

          <div class="card overflow-hidden">
            <div class="bg-gradient-to-br from-brand-600 to-accent-600 px-4 py-3.5 text-white">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-white/70">阅读进度</div>
              <div class="mt-1 flex items-end justify-between">
                <span class="font-mono text-2xl font-extrabold">{{ readPercent }}%</span>
                <AppIcon name="chart" :size="20" class="text-white/60" />
              </div>
            </div>
            <div class="h-1.5 w-full bg-slate-100">
              <div class="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all" :style="{ width: `${readPercent}%` }" />
            </div>
            <div class="space-y-2 p-4">
              <button class="btn-primary btn-sm w-full" @click="goQuiz">
                <AppIcon name="zap" :size="13" /> 去刷本章题
              </button>
              <button v-if="questionCount" class="btn-soft btn-sm w-full" @click="quizOpen = true">
                <AppIcon name="clock" :size="13" /> 随章小测 · 3 题
              </button>
              <button class="btn-ghost btn-sm w-full" @click="markFinished">
                <AppIcon name="check" :size="13" /> 标记已学完
              </button>
            </div>
          </div>

          <div class="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <div class="flex items-center gap-1.5 text-[11px] font-bold text-amber-800">
              <AppIcon name="info" :size="12" /> 学习提示
            </div>
            <p class="mt-1.5 text-[12px] leading-relaxed text-amber-900/80">
              阅读进度会自动保存到本地，关闭页面后再次打开可继续。
            </p>
          </div>
        </div>
      </aside>
    </div>

    <!-- 随章小测弹层 -->
    <QuickQuiz
      :chapter-id="chapterId"
      :chapter-name="chapter?.chapter_name ?? ''"
      :open="quizOpen"
      @close="quizOpen = false"
    />
  </div>
</template>
