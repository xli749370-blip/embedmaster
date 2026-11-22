<script setup lang="ts">
/**
 * 题目卡片：覆盖单选 / 多选 / 判断 / 简答四类题型
 * - 选择型：提交后自动判分，逐项标出正误并展示解析
 * - 简答型：不做自动判分，展示参考答案 + 自评
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import api, { type Question } from '@/api'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  question: Question
  index: number
  total: number
  /** 复习模式：直接展开答案 */
  reveal?: boolean
}>()

const emit = defineEmits<{
  (e: 'graded', payload: { questionId: number; correct: boolean }): void
}>()

const toast = useToast()

const selected = ref<string[]>([])
const submitted = ref(false)
const loading = ref(false)
const result = ref<{ is_correct: number; answer: string; analysis: string; detail?: any } | null>(null)
const shortText = ref('')
const selfJudged = ref<'yes' | 'no' | null>(null)

const TYPES: Record<string, { label: string; cls: string; hint: string }> = {
  单选题: { label: '单选题', cls: 'bg-brand-50 text-brand-700', hint: '选出唯一正确答案' },
  多选题: { label: '多选题', cls: 'bg-violet-50 text-violet-700', hint: '多选、少选、错选均不得分' },
  判断题: { label: '判断题', cls: 'bg-emerald-50 text-emerald-700', hint: '判断正误' },
  简答题: { label: '简答题', cls: 'bg-amber-50 text-amber-700', hint: '主观题，提交后对照参考答案自评' },
}

const meta = computed(() => TYPES[props.question.question_type] ?? TYPES['单选题'])
const isMulti = computed(() => props.question.question_type === '多选题')
const isShort = computed(() => props.question.question_type === '简答题')

/** 正确答案的字母集合 */
const correctKeys = computed(() => props.question.answer.split('').filter((c) => /[A-Z]/.test(c)))
const isCorrectChoice = (key: string) => correctKeys.value.includes(key)
const isWrongPick = (key: string) => selected.value.includes(key) && !isCorrectChoice(key)

/** 参考答案的可读形式：判断题显示正/误，选择题带上选项内容 */
const answerDisplay = computed(() => {
  const q = props.question
  if (q.question_type === '简答题') return q.answer
  const keys = q.answer.split('').filter((c) => /[A-Z]/.test(c))
  const parts = keys.map((k) => {
    const opt = q.options.find((o) => o.key === k)
    if (!opt) return k
    return q.question_type === '判断题' ? opt.text : `${k}. ${opt.text}`
  })
  return parts.join('\n')
})

const canSubmit = computed(() => (isShort.value ? shortText.value.trim().length > 0 : selected.value.length > 0))
const isRight = computed(() => result.value?.is_correct === 1)

function toggle(key: string) {
  if (submitted.value) return
  if (isMulti.value) {
    selected.value = selected.value.includes(key) ? selected.value.filter((k) => k !== key) : [...selected.value, key]
  } else {
    selected.value = [key]
  }
}

/** 判断/单选选项样式 */
function optionClass(key: string) {
  const base =
    'group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-all duration-150'
  if (!submitted.value) {
    return [
      base,
      selected.value.includes(key)
        ? 'border-brand-400 bg-brand-50/70 shadow-[0_0_0_3px_rgba(37,73,235,.08)]'
        : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40',
    ]
  }
  if (isCorrectChoice(key)) return [base, 'border-emerald-300 bg-emerald-50/80']
  if (isWrongPick(key)) return [base, 'border-rose-300 bg-rose-50/80']
  return [base, 'border-slate-200 bg-white opacity-70']
}

function badgeClass(key: string) {
  if (!submitted.value) {
    return selected.value.includes(key)
      ? 'bg-brand-600 text-white border-brand-600'
      : 'border-slate-300 bg-white text-ink-400 group-hover:border-brand-400 group-hover:text-brand-600'
  }
  if (isCorrectChoice(key)) return 'bg-emerald-600 text-white border-emerald-600'
  if (isWrongPick(key)) return 'bg-rose-500 text-white border-rose-500'
  return 'border-slate-300 bg-white text-ink-400'
}

async function submit() {
  if (!canSubmit.value || loading.value) return
  loading.value = true
  try {
    const answer = isShort.value ? shortText.value.trim() : selected.value.sort().join('')
    const res = await api.submitAnswer({ question_id: props.question.id, user_answer: answer })
    if (res.code !== 200) {
      toast.error(res.message)
      return
    }
    result.value = res.data
    submitted.value = true
    if (res.data.is_correct !== -1) {
      emit('graded', { questionId: props.question.id, correct: res.data.is_correct === 1 })
    }
  } finally {
    loading.value = false
  }
}

async function judge(correct: boolean) {
  selfJudged.value = correct ? 'yes' : 'no'
  await api.selfJudge(props.question.id, correct)
  emit('graded', { questionId: props.question.id, correct })
  toast.success(correct ? '已记为答对' : '已加入错题本')
}

function retry() {
  submitted.value = false
  result.value = null
  selected.value = []
  shortText.value = ''
  selfJudged.value = null
}
</script>

<template>
  <article class="card overflow-hidden">
    <!-- 题头 -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
      <span class="font-mono text-xs font-bold text-ink-400">Q{{ index + 1 }}<span class="text-slate-300">/{{ total }}</span></span>
      <span class="tag" :class="meta.cls">{{ meta.label }}</span>
      <span class="text-[11px] text-ink-400">{{ meta.hint }}</span>
      <div class="flex-1" />
      <span class="font-mono text-[11px] text-ink-400">{{ question.score }} 分</span>
    </div>

    <!-- 题干 -->
    <div class="px-5 pt-4">
      <p class="text-[15px] font-medium leading-relaxed text-ink-900">{{ question.question_title }}</p>

      <!-- 选择型 -->
      <div v-if="!isShort" class="mt-4 space-y-2">
        <button
          v-for="opt in question.options"
          :key="opt.key"
          type="button"
          :class="optionClass(opt.key)"
          :disabled="submitted"
          @click="toggle(opt.key)"
        >
          <span
            class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-bold transition-colors"
            :class="badgeClass(opt.key)"
          >
            {{ opt.key }}
          </span>
          <span class="flex-1 leading-relaxed text-ink-700">{{ opt.text }}</span>
          <AppIcon
            v-if="submitted && isCorrectChoice(opt.key)"
            name="check-circle"
            :size="17"
            class="mt-0.5 text-emerald-600"
          />
          <AppIcon v-else-if="submitted && isWrongPick(opt.key)" name="x-circle" :size="17" class="mt-0.5 text-rose-500" />
          <span
            v-else-if="isMulti && !submitted"
            class="mt-0.5 grid h-4 w-4 place-items-center rounded border"
            :class="selected.includes(opt.key) ? 'border-brand-600 bg-brand-600' : 'border-slate-300'"
          >
            <AppIcon v-if="selected.includes(opt.key)" name="check" :size="10" class="text-white" :stroke-width="3" />
          </span>
        </button>
      </div>

      <!-- 简答型 -->
      <div v-else class="mt-4">
        <textarea
          v-model="shortText"
          :disabled="submitted"
          rows="4"
          class="field resize-y font-normal"
          placeholder="在这里写下你的答案要点…（提交后可与参考答案对照）"
        />
      </div>
    </div>

    <!-- 提交 / 结果 -->
    <div class="px-5 pb-5 pt-4">
      <div v-if="!submitted" class="flex items-center gap-3">
        <button class="btn-primary" :disabled="!canSubmit || loading" @click="submit">
          <AppIcon v-if="loading" name="refresh" :size="15" class="animate-spin" />
          <AppIcon v-else name="check" :size="15" />
          提交答案
        </button>
        <span v-if="!canSubmit" class="text-xs text-ink-400">
          {{ isShort ? '请先写下答案要点' : '请先选择一个答案' }}
        </span>
      </div>

      <div v-else class="space-y-3">
        <!-- 判定横幅 -->
        <div
          v-if="!isShort"
          class="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold"
          :class="isRight ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'"
        >
          <AppIcon :name="isRight ? 'check-circle' : 'x-circle'" :size="17" />
          {{ isRight ? '回答正确' : '回答错误' }}
          <span class="ml-auto text-xs font-normal opacity-80">正确答案：{{ result?.answer }}</span>
        </div>
        <div v-else class="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-700">
          <AppIcon name="info" :size="15" class="mr-1 inline" /> 简答题请对照参考答案自评，结果会计入错题本
        </div>

        <!-- 参考答案 -->
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <div class="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">参考答案</div>
          <p class="whitespace-pre-line text-[13px] leading-relaxed text-ink-700">{{ answerDisplay }}</p>
          <div class="mt-2.5 border-t border-slate-200/80 pt-2.5">
            <div class="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">解析</div>
            <p class="text-[13px] leading-relaxed text-ink-600">{{ result?.analysis }}</p>
          </div>
        </div>

        <!-- 简答自评 -->
        <div v-if="isShort" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-ink-500">与参考答案对照后：</span>
          <button
            class="btn-sm"
            :class="selfJudged === 'yes' ? 'btn-primary' : 'btn-ghost'"
            @click="judge(true)"
          >
            <AppIcon name="check" :size="13" /> 我答对了
          </button>
          <button
            class="btn-sm"
            :class="selfJudged === 'no' ? 'bg-rose-500 text-white' : 'btn-ghost'"
            @click="judge(false)"
          >
            <AppIcon name="x" :size="13" /> 未答对
          </button>
        </div>

        <button class="btn-ghost btn-sm" @click="retry">
          <AppIcon name="rotate" :size="13" /> 重做本题
        </button>
      </div>
    </div>
  </article>
</template>
