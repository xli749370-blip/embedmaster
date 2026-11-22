<script setup lang="ts">
/**
 * 随章小测
 * ------------------------------------------------------------------
 * 讲义页内嵌的 3 题快测弹层：从本章题库随机抽 3 题（客观题优先，
 * 不足时才补简答题），复用 QuestionCard 完成作答与判分 —— 答题
 * 记录、错题本与刷题页完全共用同一套存储。
 * 每轮结束给出得分小结，可「再来一轮」换一批题。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import QuestionCard from './QuestionCard.vue'
import type { Question } from '@/api'
import { getQuestionsByChapter } from '@/mock/data'
import { useRouter } from 'vue-router'

const props = defineProps<{
  chapterId: number
  chapterName: string
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()

const QUIZ_SIZE = 3

/** 本轮抽到的题 */
const picked = ref<Question[]>([])
/** 随机种子：换一轮时让 QuestionCard 重新挂载 */
const round = ref(0)
/** questionId → 是否答对（含简答自评） */
const results = ref<Record<number, boolean>>({})

/** 洗牌取前 N 个；客观题优先，不够再补简答题 */
function draw() {
  const all = getQuestionsByChapter(props.chapterId)
  const objective = all.filter((q) => q.question_type !== '简答题')
  const subjective = all.filter((q) => q.question_type === '简答题')
  const shuffle = <T,>(arr: T[]) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const pickedList = shuffle(objective).slice(0, QUIZ_SIZE)
  if (pickedList.length < QUIZ_SIZE) {
    pickedList.push(...shuffle(subjective).slice(0, QUIZ_SIZE - pickedList.length))
  }
  picked.value = pickedList
  results.value = {}
  round.value += 1
}

watch(
  () => props.open,
  (v) => {
    if (v) draw()
  },
)

const answered = computed(() => Object.keys(results.value).length)
const correctCount = computed(() => Object.values(results.value).filter(Boolean).length)
const done = computed(() => picked.value.length > 0 && answered.value >= picked.value.length)
const scoreWord = computed(() => {
  if (!done.value) return ''
  const n = correctCount.value
  if (n === picked.value.length) return '全对，这章吃透了！'
  if (n >= picked.value.length - 1) return '只差一点，把错的看一眼解析'
  return '建议回到讲义把错的知识点再过一遍'
})

function onGraded(p: { questionId: number; correct: boolean }) {
  results.value[p.questionId] = p.correct
}

function again() {
  draw()
}

function goQuiz() {
  emit('close')
  router.push(`/quiz/${props.chapterId}`)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}

// 组件挂在讲义页常驻，这里用 window 监听即可（open 才响应）
watch(
  () => props.open,
  (v) => {
    if (v) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        @click.self="emit('close')"
      >
        <div class="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl">
          <!-- 弹层头部 -->
          <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
              <AppIcon name="zap" :size="17" />
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="text-[15px] font-extrabold text-ink-900">随章小测</h3>
              <p class="truncate text-[11.5px] text-ink-400">{{ chapterName }} · 随机 {{ picked.length }} 题，答错会计入错题本</p>
            </div>
            <button class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100" @click="emit('close')">
              <AppIcon name="x" :size="16" />
            </button>
          </div>

          <!-- 题目滚动区 -->
          <div class="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div v-for="(q, i) in picked" :key="`${round}-${q.id}`">
              <QuestionCard :question="q" :index="i" :total="picked.length" @graded="onGraded" />
            </div>
            <div v-if="!picked.length" class="py-10 text-center text-sm text-ink-400">
              本章暂无题目
            </div>
          </div>

          <!-- 底部：进度 / 小结 -->
          <div class="border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
            <div v-if="!done" class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1.5">
                <span
                  v-for="(q, i) in picked"
                  :key="q.id"
                  class="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold"
                  :class="
                    q.id in results
                      ? results[q.id]
                        ? 'bg-emerald-500 text-white'
                        : 'bg-rose-500 text-white'
                      : 'border border-slate-300 bg-white text-ink-400'
                  "
                >
                  <AppIcon v-if="q.id in results" :name="results[q.id] ? 'check' : 'x'" :size="10" :stroke-width="3" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
              </div>
              <span class="text-xs text-ink-500">已作答 {{ answered }} / {{ picked.length }}</span>
              <div class="flex-1" />
              <button class="btn-ghost btn-sm" @click="emit('close')">稍后再测</button>
            </div>

            <div v-else class="flex flex-wrap items-center gap-2.5">
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-sm font-extrabold text-white"
                :class="correctCount === picked.length ? 'bg-emerald-500' : correctCount ? 'bg-amber-500' : 'bg-rose-500'"
              >
                {{ correctCount }}<span class="text-[10px] opacity-80">/{{ picked.length }}</span>
              </span>
              <p class="min-w-0 flex-1 text-[12.5px] font-medium text-ink-700">{{ scoreWord }}</p>
              <button class="btn-ghost btn-sm" @click="again">
                <AppIcon name="refresh" :size="13" /> 再来一轮
              </button>
              <button class="btn-primary btn-sm" @click="goQuiz">
                <AppIcon name="zap" :size="13" /> 去刷本章全部题
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
