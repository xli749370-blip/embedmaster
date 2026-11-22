<script setup lang="ts">
/**
 * 电路分析训练场
 * - Tab1 分析训练：60 个综合电路样例，检查点挑战 → 参考分析（图上高亮联动）→ 自评掌握
 * - Tab2 设计避坑：常见设计问题（现象→原因→方案），可标记"已掌握"
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CircuitSchematic from '@/components/CircuitSchematic.vue'
import api from '@/api'
import { circuitCases, type CircuitCase } from '@/mock/circuits'
import { designPitfalls, PITFALL_CATS, type Pitfall, type PitfallCat } from '@/mock/designPitfalls'
import { makeEntry } from '@/mock/wrongbook'

const route = useRoute()
import { readStore, writeStore } from '@/utils/storage'

const tab = ref<'lab' | 'pitfall'>('lab')

/* ================= Tab1：分析训练 ================= */

interface CaseProgress {
  caseId: string
  best: number
  total: number
  mastered: 0 | 1
  attempts: number
  updated_at: string
}
const progressMap = ref<Record<string, CaseProgress>>({})

const stats = computed(() => {
  const list = Object.values(progressMap.value)
  return {
    attempted: list.length,
    mastered: list.filter((p) => p.mastered === 1).length,
    total: circuitCases.length,
  }
})

const current = ref<CircuitCase | null>(null)
/** 跳听学频道时用的篇目 id（c08 → C-8） */
const listenId = computed(() => `C-${Number(String(current.value?.id || '').replace(/^c/i, ''))}`)
const answers = ref<Record<string, string>>({})
const graded = ref(false)
const activeHighlight = ref<string[]>([])

const DIF_CLS: Record<string, string> = {
  入门: 'bg-emerald-50 text-emerald-700',
  进阶: 'bg-brand-50 text-brand-700',
  挑战: 'bg-rose-50 text-rose-600',
  实战: 'bg-violet-50 text-violet-700',
}

async function openCase(c: CircuitCase) {
  current.value = c
  answers.value = {}
  graded.value = false
  activeHighlight.value = []
  window.scrollTo({ top: 0 })
}

function backToList() {
  current.value = null
  activeHighlight.value = []
}

const norm = (s: string) =>
  (s || '').replace(/[^A-Za-z]/g, '').toUpperCase().split('').sort().join('')

const answeredCount = computed(() =>
  current.value ? current.value.checkpoints.filter((q) => answers.value[q.id]?.length).length : 0,
)

const allCorrect = computed(() => {
  if (!current.value || !graded.value) return false
  return current.value.checkpoints.every((q) => norm(answers.value[q.id]) === norm(q.answer))
})

const resultRows = computed(() => {
  if (!current.value || !graded.value) return []
  return current.value.checkpoints.map((q) => ({
    q,
    correct: norm(answers.value[q.id]) === norm(q.answer),
    user: answers.value[q.id]?.split('').join('、') || '未作答',
    key: q.answer.split('').join('、'),
  }))
})

async function submitCase() {
  if (!current.value) return
  const unanswered = current.value.checkpoints.length - answeredCount.value
  if (unanswered > 0 && !window.confirm(`还有 ${unanswered} 个检查点未作答，未答按答错计。继续吗？`)) return
  graded.value = true
  const wrongQs = current.value.checkpoints.filter((q) => norm(answers.value[q.id]) !== norm(q.answer))
  const correct = current.value.checkpoints.length - wrongQs.length
  await api.saveCircuitProgress({
    caseId: current.value.id,
    best: correct,
    total: current.value.checkpoints.length,
    mastered: 0,
  })
  /* 答错的检查点汇入错题本（幂等） */
  await api.addWrongEntries(
    wrongQs.map((q) =>
      makeEntry({
        source: 'circuit',
        refId: `${current.value!.id}#${q.id}`,
        title: `【${current.value!.title}】${q.q}`,
        dim: '电路分析',
        tag: current.value!.tags[0] ?? '电路分析',
      }),
    ),
  )
  const res = await api.getCircuitProgress()
  if (res.code === 200) progressMap.value = res.data
}

async function markMastered(m: boolean) {
  if (!current.value) return
  const correct = current.value.checkpoints.filter((q) => norm(answers.value[q.id]) === norm(q.answer)).length
  await api.saveCircuitProgress({
    caseId: current.value.id,
    best: correct,
    total: current.value.checkpoints.length,
    mastered: m ? 1 : 0,
  })
  const res = await api.getCircuitProgress()
  if (res.code === 200) progressMap.value = res.data
  backToList()
}

function toggleOption(qid: string, key: string, multi: boolean) {
  if (graded.value) return
  const cur = answers.value[qid]?.split('') ?? []
  if (multi) {
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    answers.value[qid] = next.sort().join('')
  } else {
    answers.value[qid] = key
  }
}

function optionCls(qid: string, key: string, qAnswer: string) {
  const selected = (answers.value[qid] || '').includes(key)
  if (!graded.value) {
    return selected
      ? 'border-brand-400 bg-brand-50/70 shadow-[0_0_0_3px_rgba(37,73,235,.08)]'
      : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
  }
  const isRight = qAnswer.includes(key)
  if (isRight) return 'border-emerald-300 bg-emerald-50/80'
  if (selected) return 'border-rose-300 bg-rose-50/80'
  return 'border-slate-200 bg-white opacity-70'
}

/* ================= Tab2：设计避坑 ================= */

const K_PITFALL = 'pitfall_mastered'
const masteredSet = ref<Set<string>>(new Set())
const pitfallCat = ref<PitfallCat | '全部'>('全部')

const pitfallList = computed(() =>
  pitfallCat.value === '全部' ? designPitfalls : designPitfalls.filter((p) => p.cat === pitfallCat.value),
)

const CAT_CLS: Record<string, string> = {
  电源: 'bg-amber-50 text-amber-700',
  驱动: 'bg-brand-50 text-brand-700',
  接口与保护: 'bg-emerald-50 text-emerald-700',
  'PCB 布局': 'bg-violet-50 text-violet-700',
  可靠性与工艺: 'bg-rose-50 text-rose-600',
}

function toggleMastered(id: string) {
  if (masteredSet.value.has(id)) masteredSet.value.delete(id)
  else masteredSet.value.add(id)
  writeStore(K_PITFALL, [...masteredSet.value])
}

onMounted(async () => {
  const res = await api.getCircuitProgress()
  if (res.code === 200) progressMap.value = res.data
  masteredSet.value = new Set(readStore<string[]>(K_PITFALL, []))
  /* 支持 ?case=c14 深链（元器件百科等模块跳转直达案例） */
  const target = route.query.case
  if (typeof target === 'string') {
    const c = circuitCases.find((x) => x.id === target)
    if (c) openCase(c)
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-ink-900">电路分析训练场</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
        以真实电路为载体做综合分析训练：元器件性质、计算、设计要点一网打尽，配合避坑手册积累设计经验——目标是构建完整的硬件知识体系。
      </p>
    </header>

    <!-- Tab 切换 -->
    <div class="mb-6 flex gap-2">
      <button class="btn-sm" :class="tab === 'lab' ? 'btn-primary' : 'btn-ghost'" @click="tab = 'lab'">
        <AppIcon name="edit" :size="13" /> 分析训练（{{ circuitCases.length }} 例）
      </button>
      <button class="btn-sm" :class="tab === 'pitfall' ? 'btn-primary' : 'btn-ghost'" @click="tab = 'pitfall'">
        <AppIcon name="info" :size="13" /> 设计避坑手册（{{ designPitfalls.length }} 条）
      </button>
    </div>

    <!-- ==================== Tab1 列表 ==================== -->
    <template v-if="tab === 'lab' && !current">
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-3 text-[13px] text-brand-800">
        <span class="font-semibold">已挑战 {{ stats.attempted }}/{{ stats.total }}</span>
        <span class="text-brand-300">·</span>
        <span>已掌握 {{ stats.mastered }} 例</span>
        <span class="text-brand-300">·</span>
        <span class="text-ink-500">建议顺序：入门 → 进阶 → 挑战 → 实战，每例先答检查点、再看参考分析</span>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="c in circuitCases"
          :key="c.id"
          class="card group p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
          @click="openCase(c)"
        >
          <div class="flex items-center gap-2">
            <span class="font-mono text-[11px] font-bold text-ink-300">{{ c.id.toUpperCase() }}</span>
            <span class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900">{{ c.title }}</span>
            <span class="tag shrink-0" :class="DIF_CLS[c.difficulty]">{{ c.difficulty }}</span>
          </div>
          <p class="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-500">{{ c.scene }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <span v-for="t in c.tags" :key="t" class="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-ink-500">{{ t }}</span>
            <div class="flex-1" />
            <span v-if="progressMap[c.id]" class="shrink-0 text-[11px] font-semibold" :class="progressMap[c.id].mastered ? 'text-emerald-600' : 'text-ink-400'">
              <AppIcon :name="progressMap[c.id].mastered ? 'check-circle' : 'refresh'" :size="12" />
              最佳 {{ progressMap[c.id].best }}/{{ progressMap[c.id].total }}{{ progressMap[c.id].mastered ? ' · 已掌握' : '' }}
            </span>
            <span v-else class="shrink-0 text-[11px] text-ink-300">未挑战</span>
          </div>
        </button>
      </div>
    </template>

    <!-- ==================== Tab1 详情 ==================== -->
    <template v-else-if="tab === 'lab' && current">
      <button class="btn-ghost btn-sm mb-4" @click="backToList">
        <AppIcon name="x" :size="13" /> 返回列表
      </button>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-bold text-ink-900">{{ current.title }}</h2>
        <span class="tag" :class="DIF_CLS[current.difficulty]">{{ current.difficulty }}</span>
        <span v-for="t in current.tags" :key="t" class="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-ink-500">{{ t }}</span>
        <RouterLink :to="`/meditate?channel=circuit&id=${listenId}`" class="btn-ghost btn-sm ml-auto">
          <AppIcon name="play" :size="13" /> 听这例
        </RouterLink>
      </div>
      <p class="mb-4 text-[13.5px] leading-relaxed text-ink-600">{{ current.scene }}</p>

      <!-- 电路图 -->
      <CircuitSchematic :circuit="current" :highlight="activeHighlight" class="mb-5" />

      <!-- 检查点挑战 -->
      <section class="mb-6">
        <h3 class="mb-1 text-sm font-bold text-ink-800">① 检查点挑战</h3>
        <p class="mb-3 text-[12px] text-ink-400">先自己想，再选答案；提交后查看判定与解析，可点"在图中查看"定位相关元件。</p>

        <div class="space-y-3">
          <article v-for="(q, qi) in current.checkpoints" :key="q.id" class="card p-5">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs font-bold text-ink-400">Q{{ qi + 1 }}/{{ current.checkpoints.length }}</span>
              <span class="tag bg-slate-100 text-ink-500">{{ q.type }}</span>
              <template v-if="graded">
                <span
                  class="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold"
                  :class="resultRows[qi].correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'"
                >
                  <AppIcon :name="resultRows[qi].correct ? 'check-circle' : 'x-circle'" :size="12" />
                  {{ resultRows[qi].correct ? '答对' : '答错' }}
                </span>
              </template>
            </div>
            <p class="text-[14.5px] font-medium leading-relaxed text-ink-900">{{ q.q }}</p>

            <div class="mt-3 space-y-2">
              <button
                v-for="opt in q.options"
                :key="opt.key"
                type="button"
                class="flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all"
                :class="optionCls(q.id, opt.key, q.answer)"
                @click="toggleOption(q.id, opt.key, q.type === '多选题')"
              >
                <span
                  class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-bold"
                  :class="answers[q.id]?.includes(opt.key) && !graded ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-ink-400'"
                >{{ opt.key }}</span>
                <span class="flex-1 leading-relaxed text-ink-700">{{ opt.text }}</span>
              </button>
            </div>

            <!-- 判分后的解析 -->
            <div v-if="graded" class="mt-3 space-y-2">
              <div class="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-600 dark:bg-slate-800/60">
                <b class="text-ink-700">解析：</b>{{ q.explain }}
                <span v-if="!resultRows[qi].correct" class="mt-1 block text-emerald-600">正确答案：{{ resultRows[qi].key }}</span>
              </div>
              <button class="btn-ghost btn-sm" @click="activeHighlight = q.highlight">
                <AppIcon name="zap" :size="12" /> 在图中查看相关元件
              </button>
            </div>
          </article>
        </div>

        <div v-if="!graded" class="mt-4 flex justify-center">
          <button class="btn-primary" @click="submitCase">
            <AppIcon name="check" :size="15" /> 提交（已答 {{ answeredCount }}/{{ current.checkpoints.length }}）
          </button>
        </div>
        <div v-else class="mt-4 rounded-xl px-4 py-3 text-center text-sm font-semibold" :class="allCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
          {{ allCorrect ? '全部答对，这个电路你已经拿下了！继续读完参考分析，把设计要点收进经验库。' : '检查点有错误——带着问题读下面的参考分析，逐条对照高亮。' }}
        </div>
      </section>

      <!-- 参考分析 -->
      <section class="mb-6">
        <h3 class="mb-1 text-sm font-bold text-ink-800">② 参考分析</h3>
        <p class="mb-3 text-[12px] text-ink-400">点击任一步骤，电路图会高亮对应的元件。</p>

        <div class="space-y-2.5">
          <button
            v-for="(s, si) in current.steps"
            :key="si"
            class="block w-full rounded-xl border px-4 py-3.5 text-left transition-all"
            :class="JSON.stringify(activeHighlight) === JSON.stringify(s.highlight) ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-900/10' : 'border-slate-200 bg-white hover:border-brand-300'"
            @click="activeHighlight = s.highlight"
          >
            <div class="text-[13.5px] font-bold text-ink-800">{{ s.title }}</div>
            <p class="mt-1 text-[13px] leading-relaxed text-ink-600">{{ s.text }}</p>
          </button>
        </div>
      </section>

      <!-- 自评 -->
      <section v-if="graded" class="mb-10">
        <h3 class="mb-2 text-sm font-bold text-ink-800">③ 自评掌握度</h3>
        <div class="flex flex-wrap gap-3">
          <button class="btn-primary" @click="markMastered(true)">
            <AppIcon name="check-circle" :size="14" /> 已掌握，标记完成
          </button>
          <button class="btn-ghost" @click="markMastered(false)">
            <AppIcon name="refresh" :size="14" /> 还需复习，稍后再来
          </button>
        </div>
      </section>
    </template>

    <!-- ==================== Tab2 避坑手册 ==================== -->
    <template v-else>
      <div class="mb-4 flex flex-wrap gap-1.5">
        <button
          v-for="cat in (['全部', ...PITFALL_CATS] as const)"
          :key="cat"
          class="btn-sm"
          :class="pitfallCat === cat ? 'btn-primary' : 'btn-ghost'"
          @click="pitfallCat = cat"
        >{{ cat }}</button>
        <div class="flex-1" />
        <span class="self-center text-[12px] text-ink-400">已掌握 {{ masteredSet.size }}/{{ designPitfalls.length }}</span>
      </div>

      <div class="space-y-3">
        <article v-for="p in pitfallList" :key="p.id" class="card p-5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="tag shrink-0" :class="CAT_CLS[p.cat]">{{ p.cat }}</span>
            <h3 class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900">{{ p.title }}</h3>
            <button
              class="btn-sm shrink-0"
              :class="masteredSet.has(p.id) ? 'btn-primary' : 'btn-ghost'"
              @click="toggleMastered(p.id)"
            >
              <AppIcon :name="masteredSet.has(p.id) ? 'check-circle' : 'check'" :size="12" />
              {{ masteredSet.has(p.id) ? '已掌握' : '标记掌握' }}
            </button>
          </div>

          <div class="mt-3 space-y-2.5 text-[13px] leading-relaxed">
            <div class="rounded-xl bg-rose-50/70 px-3.5 py-2.5 dark:bg-rose-900/10">
              <b class="text-rose-600">现象</b>
              <span class="ml-1 text-ink-600">{{ p.symptom }}</span>
            </div>
            <div class="rounded-xl bg-amber-50/70 px-3.5 py-2.5 dark:bg-amber-900/10">
              <b class="text-amber-600">原因</b>
              <span class="ml-1 text-ink-600">{{ p.cause }}</span>
            </div>
            <div class="rounded-xl bg-emerald-50/70 px-3.5 py-2.5 dark:bg-emerald-900/10">
              <b class="text-emerald-600">解决</b>
              <ul class="mt-1 space-y-1 text-ink-600">
                <li v-for="(s, i) in p.solutions" :key="i" class="flex gap-1.5">
                  <span class="text-emerald-500">›</span>{{ s }}
                </li>
              </ul>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="t in p.tags" :key="t" class="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-ink-500">#{{ t }}</span>
            </div>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>
