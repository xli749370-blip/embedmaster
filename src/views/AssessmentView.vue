<script setup lang="ts">
/**
 * 学习效果检测：硬件（元器件特性/计算/电路设计）+ 软件开发
 * - 三阶段：选卷 → 计时答题（作答期间不判分，交卷统一出成绩）→ 成绩单
 * - 判分在本地完成（gradePaper 纯函数），成绩独立存储
 * - 答错的题自动汇入错题本（艾宾浩斯复习队列，见 /wrongbook）
 * - 成绩单给出总分、分维度得分、薄弱考点与推荐章节直达链接
 */
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import {
  buildPaper,
  gradePaper,
  scoreBand,
  CATEGORY_META,
  PAPERS,
  type AssessQuestion,
  type PaperMeta,
  type AssessResult,
} from '@/mock/assessment'
import { makeEntry, dimOfAssess } from '@/mock/wrongbook'

const router = useRouter()

type Phase = 'pick' | 'exam' | 'result'

const phase = ref<Phase>('pick')
const paper = ref<AssessQuestion[]>([])
const paperMeta = ref<PaperMeta | null>(null)
const answers = ref<Record<string, string>>({})
const result = ref<AssessResult | null>(null)
const saving = ref(false)

/* ------------------------------------------------------------------ 计时 */
const secondsLeft = ref(0)
let timer: number | null = null
const timeText = computed(() => {
  const m = Math.floor(secondsLeft.value / 60)
  const s = secondsLeft.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
const timeDanger = computed(() => secondsLeft.value <= 60)

function startTimer(durationSec: number) {
  stopTimer()
  secondsLeft.value = durationSec
  timer = window.setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) {
      secondsLeft.value = 0
      submitPaper(true) // 时间到自动交卷
    }
  }, 1000)
}
function stopTimer() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}
onUnmounted(stopTimer)

/* ------------------------------------------------------------------ 流程 */

function startExam(meta: PaperMeta) {
  paper.value = buildPaper(meta)
  paperMeta.value = meta
  answers.value = {}
  result.value = null
  phase.value = 'exam'
  startTimer(meta.durationSec)
  window.scrollTo({ top: 0 })
}

const answeredCount = computed(() => Object.values(answers.value).filter((v) => v).length)
const canSubmit = computed(() => answeredCount.value === paper.value.length)

function toggleOption(q: AssessQuestion, key: string) {
  const id = String(q.id)
  if (q.question_type === '多选题') {
    const cur = answers.value[id]?.split('') ?? []
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    answers.value[id] = next.sort().join('')
  } else {
    answers.value[id] = key
  }
}

async function submitPaper(auto = false) {
  if (phase.value !== 'exam') return
  if (!auto && answeredCount.value < paper.value.length) {
    const left = paper.value.length - answeredCount.value
    if (!window.confirm(`还有 ${left} 题未作答，未答的题按答错计分。确定交卷吗？`)) return
  }
  stopTimer()
  const r = gradePaper(paper.value, answers.value)
  result.value = r
  phase.value = 'result'
  window.scrollTo({ top: 0 })

  saving.value = true
  try {
    await api.saveAssessmentResult({
      paper: paperMeta.value!.key,
      paperName: paperMeta.value!.name,
      score: r.score,
      correct: r.correct,
      total: r.total,
      perCategory: r.perCategory,
    })
    /* 错题自动汇入错题本（幂等：重复错只累计计数） */
    const wrongEntries = paper.value
      .filter((q, i) => !r.perQuestion[i].correct)
      .map((q) =>
        makeEntry({
          source: 'assess',
          refId: String(q.id),
          title: q.question_title,
          dim: dimOfAssess(q.category),
          tag: q.tag,
        }),
      )
    await api.addWrongEntries(wrongEntries)
    history.value = await loadHistory()
  } finally {
    saving.value = false
  }
}

function backToPick() {
  phase.value = 'pick'
  window.scrollTo({ top: 0 })
}

/* ------------------------------------------------------------------ 成绩单辅助 */

const perCategoryRows = computed(() =>
  (result.value?.perCategory ?? []).map((c) => ({
    ...c,
    percent: c.total ? Math.round((c.correct / c.total) * 100) : 0,
  })),
)

const ring = computed(() => {
  const score = result.value?.score ?? 0
  const C = 2 * Math.PI * 52 // r=52
  return { dash: `${(score / 100) * C} ${C}`, score }
})

const band = computed(() => scoreBand(result.value?.score ?? 0))

/** 薄弱考点 → 去重后的推荐章节（题目挂了 ref_chapter） */
const weakChapters = computed(() => {
  if (!result.value) return []
  const wrongQs = paper.value.filter((q, i) => !result.value!.perQuestion[i].correct)
  const seen = new Set<number>()
  const out: Array<{ id: number; name: string; tag: string; category: string }> = []
  for (const q of wrongQs) {
    if (seen.has(q.ref_chapter)) continue
    seen.add(q.ref_chapter)
    const ch = api.allChapters.find((c) => c.id === q.ref_chapter)
    if (ch) out.push({ id: ch.id, name: ch.chapter_name, tag: q.tag, category: q.category })
  }
  return out
})

/** 逐题回看：题目 + 用户答案 + 正确答案 + 解析 */
const reviewRows = computed(() => {
  if (!result.value) return []
  return paper.value.map((q, i) => {
    const r = result.value!.perQuestion[i]
    const userKey = (answers.value[String(q.id)] || '—').split('').join('、')
    const correctKey = q.answer.split('').join('、')
    const keyText = (s: string) => (q.question_type === '判断题' ? (s.includes('A') ? '正确' : s.includes('B') ? '错误' : s) : s)
    return {
      q,
      correct: r.correct,
      userText: r.correct ? keyText(userKey) || '—' : keyText(userKey) || '未作答',
      correctText: keyText(correctKey),
    }
  })
})

/* ------------------------------------------------------------------ 历史 */
import { onMounted } from 'vue'

interface HistoryRow {
  id: number
  paper: string
  paperName: string
  score: number
  correct: number
  total: number
  created_at: string
}
const history = ref<HistoryRow[]>([])

async function loadHistory(): Promise<HistoryRow[]> {
  const res = await api.getAssessmentHistory()
  return res.code === 200 ? res.data : []
}

const clearHistory = async () => {
  if (!window.confirm('确定清空全部检测成绩吗？此操作不可恢复。')) return
  await api.clearAssessmentHistory()
  history.value = []
}

onMounted(async () => {
  history.value = await loadHistory()
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
    <!-- ==================== 选卷 ==================== -->
    <template v-if="phase === 'pick'">
      <header class="mb-6">
        <h1 class="text-2xl font-bold text-ink-900">学习效果检测</h1>
        <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
          覆盖元器件（二极管 / 三极管 / MOS 管等）的性质、计算与电路设计要点，以及 C 语言、中断、协议与 RTOS 等软件考点。
          计时作答、交卷统一判分，成绩单会指出薄弱考点并推荐对应讲义章节。
        </p>
      </header>

      <!-- 考卷卡片 -->
      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="p in PAPERS"
          :key="p.key"
          class="card group flex flex-col items-start gap-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
          @click="startExam(p)"
        >
          <span class="tag bg-brand-50 text-brand-700">{{ p.name }}</span>
          <p class="text-[13px] leading-relaxed text-ink-500">{{ p.desc }}</p>
          <div class="mt-auto flex items-center gap-3 pt-2 text-[11px] font-medium text-ink-400">
            <span class="flex items-center gap-1"><AppIcon name="edit" :size="12" /> {{ p.categories.length * p.perCategory }} 题</span>
            <span class="flex items-center gap-1"><AppIcon name="zap" :size="12" /> {{ p.durationSec / 60 }} 分钟</span>
          </div>
        </button>
      </div>

      <!-- 检测说明 -->
      <div class="card mt-4 p-5">
        <h2 class="mb-2 text-sm font-bold text-ink-800">考试规则</h2>
        <ul class="space-y-1.5 text-[13px] leading-relaxed text-ink-500">
          <li>· 限时作答，倒计时结束自动交卷；作答期间不显示对错，交卷后统一判分</li>
          <li>· 多选题多选、少选、错选均不得分；未作答按答错计</li>
          <li>· 检测成绩独立保存，不计入刷题错题本；逐题解析答后可见</li>
        </ul>
      </div>

      <!-- 历史成绩 -->
      <section class="mt-8">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-base font-bold text-ink-900">历史成绩</h2>
          <button v-if="history.length" class="btn-ghost btn-sm" @click="clearHistory">
            <AppIcon name="x" :size="13" /> 清空
          </button>
        </div>
        <div v-if="history.length" class="card divide-y divide-slate-100">
          <div v-for="h in history" :key="h.id" class="flex items-center gap-3 px-5 py-3">
            <span class="w-24 shrink-0 truncate text-[13px] font-semibold text-ink-800">{{ h.paperName }}</span>
            <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full"
                :class="h.score >= 75 ? 'bg-emerald-500' : h.score >= 60 ? 'bg-amber-500' : 'bg-rose-400'"
                :style="{ width: h.score + '%' }"
              />
            </div>
            <span class="w-14 shrink-0 text-right font-mono text-[13px] font-bold" :class="h.score >= 60 ? 'text-ink-700' : 'text-rose-500'">
              {{ h.score }}
            </span>
            <span class="hidden w-32 shrink-0 text-right text-[11px] text-ink-400 sm:block">{{ h.created_at }}</span>
          </div>
        </div>
        <p v-else class="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-[13px] text-ink-400">
          还没有检测记录，选一张卷子开始吧。
        </p>
      </section>
    </template>

    <!-- ==================== 答题 ==================== -->
    <template v-else-if="phase === 'exam' && paperMeta">
      <!-- 顶部：倒计时 + 进度 -->
      <div class="sticky top-14 z-20 -mx-4 mb-5 border-b border-slate-200 bg-page/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div class="mx-auto flex w-full max-w-3xl items-center gap-3">
          <span
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold"
            :class="timeDanger ? 'animate-pulse bg-rose-50 text-rose-600' : 'bg-slate-100 text-ink-700'"
          >
            <AppIcon name="zap" :size="14" /> {{ timeText }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center justify-between text-[11px] text-ink-400">
              <span>{{ paperMeta.name }}</span>
              <span>已答 {{ answeredCount }}/{{ paper.length }}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div class="h-full rounded-full bg-brand-500 transition-all" :style="{ width: (answeredCount / paper.length) * 100 + '%' }" />
            </div>
          </div>
          <button class="btn-primary btn-sm shrink-0" @click="submitPaper(false)">交卷</button>
        </div>
      </div>

      <!-- 题目 -->
      <div class="space-y-4">
        <article v-for="(q, i) in paper" :key="q.id" class="card p-5">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span class="font-mono text-xs font-bold text-ink-400">Q{{ i + 1 }}<span class="text-slate-300">/{{ paper.length }}</span></span>
            <span class="tag" :class="CATEGORY_META[q.category].cls">{{ q.category }}</span>
            <span class="tag bg-slate-100 text-ink-500">{{ q.question_type }}</span>
          </div>
          <p class="text-[15px] font-medium leading-relaxed text-ink-900">{{ q.question_title }}</p>
          <div class="mt-3.5 space-y-2">
            <button
              v-for="opt in q.options"
              :key="opt.key"
              type="button"
              class="flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-all"
              :class="
                (answers[String(q.id)] || '').includes(opt.key)
                  ? 'border-brand-400 bg-brand-50/70 shadow-[0_0_0_3px_rgba(37,73,235,.08)]'
                  : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
              "
              @click="toggleOption(q, opt.key)"
            >
              <span
                class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-bold"
                :class="
                  (answers[String(q.id)] || '').includes(opt.key)
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-ink-400'
                "
              >
                {{ opt.key }}
              </span>
              <span class="flex-1 leading-relaxed text-ink-700">{{ opt.text }}</span>
            </button>
          </div>
        </article>
      </div>

      <div class="mt-6 flex justify-center pb-10">
        <button class="btn-primary" @click="submitPaper(false)">
          <AppIcon name="check" :size="15" /> 交卷（已答 {{ answeredCount }}/{{ paper.length }}）
        </button>
      </div>
    </template>

    <!-- ==================== 成绩单 ==================== -->
    <template v-else-if="phase === 'result' && result && paperMeta">
      <header class="mb-6 text-center">
        <div class="tag mx-auto bg-slate-100 text-ink-500">{{ paperMeta.name }} · 成绩单</div>

        <!-- 总分环 -->
        <div class="relative mx-auto mt-5 h-36 w-36">
          <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" class="text-slate-200" stroke-width="10" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="currentColor"
              :class="result.score >= 75 ? 'text-emerald-500' : result.score >= 60 ? 'text-amber-500' : 'text-rose-400'"
              stroke-width="10"
              stroke-linecap="round"
              :stroke-dasharray="ring.dash"
            />
          </svg>
          <div class="absolute inset-0 grid place-content-center">
            <div class="font-mono text-4xl font-bold text-ink-900">{{ result.score }}</div>
            <div class="text-[11px] text-ink-400">答对 {{ result.correct }}/{{ result.total }}</div>
          </div>
        </div>
        <div class="mt-3 text-lg font-bold" :class="band.cls">{{ band.label }}</div>
        <p class="mt-1 text-[13px] text-ink-500">{{ band.advice }}</p>
        <p v-if="saving" class="mt-1 text-[11px] text-ink-300">正在保存成绩…</p>
      </header>

      <!-- 分维度得分 -->
      <section v-if="perCategoryRows.length > 1" class="card mb-4 p-5">
        <h2 class="mb-3 text-sm font-bold text-ink-800">分维度得分</h2>
        <div class="space-y-3">
          <div v-for="row in perCategoryRows" :key="row.category">
            <div class="mb-1 flex items-center justify-between text-[12.5px]">
              <span class="font-medium text-ink-700">{{ row.category }}</span>
              <span class="font-mono text-ink-400">{{ row.correct }}/{{ row.total }}（{{ row.percent }}%）</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full"
                :class="row.percent >= 75 ? 'bg-emerald-500' : row.percent >= 50 ? 'bg-amber-500' : 'bg-rose-400'"
                :style="{ width: row.percent + '%' }"
              />
            </div>
            <p class="mt-0.5 text-[11px] text-ink-400">{{ CATEGORY_META[row.category].desc }}</p>
          </div>
        </div>
      </section>

      <!-- 薄弱考点 → 推荐章节 -->
      <section v-if="weakChapters.length" class="card mb-4 p-5">
        <h2 class="mb-1 text-sm font-bold text-ink-800">薄弱考点 · 建议回炉</h2>
        <p class="mb-3 text-[12px] text-ink-400">按答错题目对应的知识点，推荐这些讲义章节：</p>
        <div class="space-y-2">
          <RouterLink
            v-for="w in weakChapters"
            :key="w.id"
            :to="`/chapter/${w.id}`"
            class="group flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span class="tag shrink-0" :class="CATEGORY_META[w.category as keyof typeof CATEGORY_META]?.cls || 'bg-slate-100 text-ink-500'">
              {{ w.tag }}
            </span>
            <span class="min-w-0 flex-1 truncate text-[13px] text-ink-700 group-hover:text-brand-700">{{ w.name }}</span>
            <AppIcon name="zap" :size="13" class="shrink-0 text-ink-300 group-hover:text-brand-500" />
          </RouterLink>
        </div>
      </section>

      <!-- 逐题回看 -->
      <section class="mb-4">
        <h2 class="mb-3 text-sm font-bold text-ink-800">逐题解析</h2>
        <div class="space-y-3">
          <article v-for="(row, i) in reviewRows" :key="row.q.id" class="card p-5" :class="!row.correct && 'border-rose-200'">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs font-bold text-ink-400">Q{{ i + 1 }}</span>
              <span
                class="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold"
                :class="row.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'"
              >
                <AppIcon :name="row.correct ? 'check-circle' : 'x-circle'" :size="12" />
                {{ row.correct ? '答对' : '答错' }}
              </span>
              <span class="tag bg-slate-100 text-ink-500">{{ row.q.category }} · {{ row.q.tag }}</span>
            </div>
            <p class="text-[14px] font-medium leading-relaxed text-ink-900">{{ row.q.question_title }}</p>
            <div class="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
              <span :class="row.correct ? 'text-emerald-600' : 'text-rose-500'">你的答案：{{ row.userText }}</span>
              <span v-if="!row.correct" class="text-emerald-600">正确答案：{{ row.correctText }}</span>
            </div>
            <p class="mt-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-600 dark:bg-slate-800/60">
              {{ row.q.analysis }}
            </p>
          </article>
        </div>
      </section>

      <!-- 操作 -->
      <div class="flex flex-wrap justify-center gap-3 pb-10">
        <button class="btn-primary" @click="startExam(paperMeta)">
          <AppIcon name="refresh" :size="15" /> 再来一套（重新抽题）
        </button>
        <button class="btn-ghost" @click="backToPick">返回选卷</button>
      </div>
    </template>
  </div>
</template>
