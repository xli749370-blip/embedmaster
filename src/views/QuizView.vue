<script setup lang="ts">
/**
 * 刷题页
 * - 支持按章节练习（/quiz/:chapterId）与综合练习（/quiz）
 * - 题型筛选、逐题提交自动判分、实时正确率统计
 * - 答错自动进入错题本
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import QuestionCard from '@/components/QuestionCard.vue'
import api, { type Question } from '@/api'
import { chapters, getCourseById, getQuestionsByChapter } from '@/mock/data'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const all = ref<Question[]>([])
const loading = ref(true)
const typeFilter = ref('全部')
const sessionKey = ref(0)

/** 本次作答结果：questionId → 是否正确 */
const results = reactive<Record<number, boolean>>({})

const chapterId = computed(() => (route.params.chapterId ? Number(route.params.chapterId) : 0))
const currentChapter = computed(() => chapters.find((c) => c.id === chapterId.value) || null)
const courseQuery = computed(() => Number(route.query.course ?? 0))
/** 错题重练模式：/quiz?wrong=1 */
const wrongMode = computed(() => route.query.wrong === '1')

const types = ['全部', '单选题', '多选题', '判断题', '简答题']

const title = computed(() => {
  if (wrongMode.value) return `错题本中的 ${all.value.length} 道题`
  if (currentChapter.value) return currentChapter.value.chapter_name
  if (courseQuery.value) return getCourseById(courseQuery.value)?.course_name ?? '综合练习'
  return `覆盖 ${api.allCourses.length} 门课程、${chapters.length} 章的全部题目`
})
const heading = computed(() => (wrongMode.value ? '错题重练' : currentChapter.value ? '章节练习' : '综合练习'))

const filtered = computed(() =>
  typeFilter.value === '全部' ? all.value : all.value.filter((q) => q.question_type === typeFilter.value),
)

/** 只有客观题参与自动计分 */
const objective = computed(() => filtered.value.filter((q) => q.question_type !== '简答题'))
const answered = computed(() => Object.keys(results).length)
const correctCount = computed(() => Object.values(results).filter(Boolean).length)
const accuracy = computed(() => (answered.value ? Math.round((correctCount.value / answered.value) * 100) : 0))
const totalScore = computed(() => filtered.value.reduce((s, q) => s + q.score, 0))
const earnedScore = computed(() =>
  filtered.value.reduce((s, q) => (results[q.id] ? s + q.score : s), 0),
)

/** 章节切换：按课程分组，可折叠；默认展开当前章节所属课程 */
const chapterGroups = computed(() =>
  [...api.allCourses]
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({
      id: c.id,
      course: c.course_name,
      list: chapters.filter((x) => x.course_id === c.id && x.is_published === 1).sort((a, b) => a.sort - b.sort),
    }))
    .filter((g) => g.list.length),
)

const openCourses = ref<number[]>([])
watch(
  chapterId,
  (id) => {
    const ch = chapters.find((c) => c.id === id)
    if (ch && !openCourses.value.includes(ch.course_id)) openCourses.value.push(ch.course_id)
  },
  { immediate: true },
)

function toggleCourse(id: number) {
  openCourses.value = openCourses.value.includes(id)
    ? openCourses.value.filter((x) => x !== id)
    : [...openCourses.value, id]
}

async function load() {
  loading.value = true
  Object.keys(results).forEach((k) => delete results[Number(k)])
  if (wrongMode.value) {
    const res = await api.getWrongQuestions()
    all.value = res.data.map((x) => x.question)
  } else if (chapterId.value) {
    const res = await api.getQuestionList(chapterId.value)
    all.value = res.data
  } else if (courseQuery.value) {
    const list = chapters.filter((c) => c.course_id === courseQuery.value)
    all.value = list.flatMap((c) => getQuestionsByChapter(c.id))
  } else {
    all.value = [...api.allQuestions]
  }
  sessionKey.value++
  loading.value = false
}

onMounted(load)
watch(() => route.fullPath, load)

function onGraded(p: { questionId: number; correct: boolean }) {
  results[p.questionId] = p.correct
}

function restart() {
  Object.keys(results).forEach((k) => delete results[Number(k)])
  sessionKey.value++
  toast.info('已重置本次练习')
}

function changeChapter(id: number) {
  if (id === 0) router.push('/quiz')
  else router.push(`/quiz/${id}`)
}
</script>

<template>
  <div class="container-page py-8">
    <!-- 页头 -->
    <nav class="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <RouterLink to="/quiz" class="hover:text-brand-700">在线刷题</RouterLink>
      <template v-if="currentChapter">
        <AppIcon name="chevron-right" :size="12" />
        <RouterLink :to="`/course/${currentChapter.course_id}`" class="hover:text-brand-700">
          {{ getCourseById(currentChapter.course_id)?.course_name }}
        </RouterLink>
      </template>
    </nav>

    <div class="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink-900">{{ heading }}</h1>
        <p class="mt-1.5 text-sm text-ink-500">{{ title }}</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost btn-sm" @click="restart">
          <AppIcon name="refresh" :size="13" /> 重新开始
        </button>
        <RouterLink v-if="currentChapter" :to="`/chapter/${currentChapter.id}`" class="btn-soft btn-sm">
          <AppIcon name="book" :size="13" /> 回到讲义
        </RouterLink>
      </div>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <!-- 题目区 -->
      <div class="min-w-0">
        <!-- 错题重练提示 -->
        <div
          v-if="wrongMode"
          class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-[12.5px] text-amber-900"
        >
          <AppIcon name="target" :size="14" />
          <span>只练错题本里「最近一次作答仍是错」的题，答对后会自动从错题本移出。</span>
          <RouterLink to="/profile" class="ml-auto font-semibold underline underline-offset-2">打开错题本</RouterLink>
        </div>

        <!-- 题型筛选 -->
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <button
            v-for="t in types"
            :key="t"
            class="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
            :class="
              typeFilter === t
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-ink-500 hover:border-brand-300 hover:text-brand-700'
            "
            @click="typeFilter = t"
          >
            {{ t }}
            <span class="ml-1 font-mono text-[10px] opacity-70">
              {{ t === '全部' ? all.length : all.filter((q) => q.question_type === t).length }}
            </span>
          </button>
        </div>

        <!-- 骨架 -->
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 2" :key="i" class="card h-64 animate-pulse bg-slate-100/60" />
        </div>

        <!-- 题目列表 -->
        <div v-else-if="filtered.length" class="space-y-4">
          <QuestionCard
            v-for="(q, i) in filtered"
            :key="`${sessionKey}-${q.id}`"
            :question="q"
            :index="i"
            :total="filtered.length"
            @graded="onGraded"
          />
        </div>

        <!-- 空状态 -->
        <div v-else class="card flex flex-col items-center justify-center py-16">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            <AppIcon name="quiz" :size="22" />
          </span>
          <template v-if="wrongMode">
            <p class="mt-3 text-sm font-semibold text-ink-700">错题本里还没有题</p>
            <p class="mt-1 text-xs text-ink-400">先去章节练习或综合练习做几道，答错的题会自动收进来</p>
            <RouterLink to="/quiz" class="btn-primary btn-sm mt-4">去综合练习</RouterLink>
          </template>
          <template v-else>
            <p class="mt-3 text-sm font-semibold text-ink-700">该筛选条件下没有题目</p>
            <button class="btn-ghost btn-sm mt-3" @click="typeFilter = '全部'">查看全部题型</button>
          </template>
        </div>
      </div>

      <!-- 侧栏：计分板 + 章节切换 -->
      <aside class="space-y-4">
        <div class="card sticky top-24 overflow-hidden">
          <div class="bg-gradient-to-br from-ink-900 to-ink-800 px-5 py-4 text-white">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-white/50">本次练习</div>
            <div class="mt-1 flex items-end gap-2">
              <span class="font-mono text-3xl font-extrabold">{{ correctCount }}</span>
              <span class="pb-1 text-sm text-white/50">/ {{ objective.length }} 题答对</span>
            </div>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-accent-400 transition-all duration-500"
                :style="{ width: `${objective.length ? (correctCount / objective.length) * 100 : 0}%` }"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-px bg-slate-100">
            <div class="bg-white px-4 py-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">已作答</div>
              <div class="mt-0.5 font-mono text-lg font-bold text-ink-900">{{ answered }}</div>
            </div>
            <div class="bg-white px-4 py-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">正确率</div>
              <div class="mt-0.5 font-mono text-lg font-bold" :class="accuracy >= 60 ? 'text-emerald-600' : 'text-rose-500'">
                {{ accuracy }}%
              </div>
            </div>
            <div class="bg-white px-4 py-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">得分</div>
              <div class="mt-0.5 font-mono text-lg font-bold text-brand-700">{{ earnedScore }}<span class="text-[11px] font-normal text-ink-400">/{{ totalScore }}</span></div>
            </div>
            <div class="bg-white px-4 py-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">待作答</div>
              <div class="mt-0.5 font-mono text-lg font-bold text-ink-900">{{ objective.length - correctCount }}</div>
            </div>
          </div>

          <div class="space-y-2 border-t border-slate-100 p-4">
            <RouterLink to="/profile" class="btn-ghost btn-sm w-full">
              <AppIcon name="target" :size="13" /> 查看错题本
            </RouterLink>
            <p class="text-[11px] leading-relaxed text-ink-400">
              提示：答错的题会自动加入错题本，简答题提交后需自行对照参考答案评分。
            </p>
          </div>
        </div>

        <!-- 章节切换 -->
        <div class="card p-4">
          <h3 class="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
            <AppIcon name="layers" :size="12" /> 切换练习范围
          </h3>
          <button
            class="mb-1 block w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
            :class="chapterId === 0 && !wrongMode ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-600 hover:bg-slate-50'"
            @click="changeChapter(0)"
          >
            综合练习（全部 {{ api.allQuestions.length }} 题）
          </button>

          <div v-for="g in chapterGroups" :key="g.id" class="mt-1">
            <button
              class="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-50 hover:text-ink-500"
              @click="toggleCourse(g.id)"
            >
              <AppIcon
                name="chevron-right"
                :size="11"
                class="transition-transform"
                :class="openCourses.includes(g.id) ? 'rotate-90' : ''"
              />
              {{ g.course }}
              <span class="ml-auto font-mono font-normal normal-case tracking-normal text-slate-300">{{ g.list.length }}</span>
            </button>
            <template v-if="openCourses.includes(g.id)">
              <button
                v-for="c in g.list"
                :key="c.id"
                class="block w-full rounded-lg py-1.5 pl-7 pr-3 text-left text-[12.5px] leading-snug transition-colors"
                :class="chapterId === c.id ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-600 hover:bg-slate-50'"
                @click="changeChapter(c.id)"
              >
                {{ c.chapter_name }}
              </button>
            </template>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
