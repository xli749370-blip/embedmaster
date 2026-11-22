<script setup lang="ts">
/**
 * 错题本与学习画像
 * ------------------------------------------------------------------
 * - 六维雷达：元件认知/电路分析/参数计算/软件开发/通信协议/调试排查
 * - 艾宾浩斯复习：到期错题重新作答（自动判分），连续 2 次答对毕业
 * - 数据来源：效果检测错题 + 电路训练检查点错题（各模块自动汇入）
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api, { type WrongEntry } from '@/api'
import { assessmentBank } from '@/mock/assessment'
import { circuitCases } from '@/mock/circuits'
import {
  DIMS,
  SOURCE_META,
  dimProfile,
  normCompare,
  REVIEW_INTERVALS,
  type Dim,
  type WrongSource,
} from '@/mock/wrongbook'

const router = useRouter()

/* ------------------------------------------------------------------ 状态 */

const entries = ref<WrongEntry[]>([])
const loading = ref(true)
const filterSource = ref<'all' | WrongSource>('all')
const filterDim = ref<'all' | Dim>('all')

const now = Date.now()
const dueList = computed(() =>
  entries.value
    .filter((e) => e.dueAt <= Date.now())
    .sort((a, b) => a.dueAt - b.dueAt),
)
const graduatedCount = ref(0)

const filtered = computed(() =>
  entries.value.filter(
    (e) =>
      (filterSource.value === 'all' || e.source === filterSource.value) &&
      (filterDim.value === 'all' || e.dim === filterDim.value),
  ),
)

const profile = computed(() => dimProfile(entries.value))

function fmtDue(ts: number): string {
  const d = ts - Date.now()
  if (d <= 0) return '今日应复习'
  const days = Math.ceil(d / 86400000)
  return `${days} 天后`
}

/* ------------------------------------------------------------------ 雷达图 */

const RADAR_R = 82
const RADAR_CX = 160
const RADAR_CY = 118

function dimAngle(i: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / DIMS.length
}
function radarPoint(i: number, r: number): string {
  return `${(RADAR_CX + Math.cos(dimAngle(i)) * r).toFixed(1)},${(RADAR_CY + Math.sin(dimAngle(i)) * r).toFixed(1)}`
}
const radarGrid = computed(() => [0.25, 0.5, 0.75, 1].map((k) => DIMS.map((_, i) => radarPoint(i, RADAR_R * k)).join(' ')))
const radarShape = computed(() =>
  profile.value.map((p, i) => radarPoint(i, RADAR_R * (0.12 + (p.weak / 100) * 0.88))).join(' '),
)

/* ------------------------------------------------------------------ 复习模式 */

type ReviewPhase = 'idle' | 'review' | 'done'
const reviewPhase = ref<ReviewPhase>('idle')
const queue = ref<WrongEntry[]>([])
const qIndex = ref(0)
const current = computed(() => queue.value[qIndex.value] ?? null)

/** 当前题的选项数据（assess → 题库 / circuit → 检查点） */
const reviewQ = computed(() => {
  const e = current.value
  if (!e) return null
  if (e.source === 'assess') {
    const q = assessmentBank.find((x) => String(x.id) === e.refId)
    if (!q) return null
    return { title: q.question_title, options: q.options, answer: q.answer, multi: q.question_type === '多选题', analysis: q.analysis, type: q.question_type }
  }
  const [caseId, cpId] = e.refId.split('#')
  const c = circuitCases.find((x) => x.id === caseId)
  const cp = c?.checkpoints.find((x) => x.id === cpId)
  if (!c || !cp) return null
  return { title: `【${c.title}】${cp.q}`, options: cp.options ?? null, answer: cp.answer, multi: cp.type === '多选题', analysis: cp.explain, type: cp.type }
})

const myAnswer = ref('')
const reviewResult = ref<null | { outcome: 'correct' | 'wrong' | 'graduated' }>(null)

function startReview() {
  queue.value = dueList.value
  if (!queue.value.length) return
  qIndex.value = 0
  myAnswer.value = ''
  reviewResult.value = null
  reviewPhase.value = 'review'
}

function isOptionPicked(key: string): boolean {
  return (myAnswer.value || '').includes(key)
}
function pickOption(key: string) {
  if (reviewResult.value) return
  const q = reviewQ.value
  if (!q) return
  if (q.multi) {
    const cur = (myAnswer.value || '').split('').filter(Boolean)
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    myAnswer.value = next.sort().join('')
  } else {
    myAnswer.value = key
  }
}

async function submitReview() {
  const e = current.value
  const q = reviewQ.value
  if (!e || !q || !myAnswer.value) return
  const correct = normCompare(myAnswer.value, q.answer)
  const res = await api.reviewWrong(e.key, correct)
  reviewResult.value = { outcome: res.code === 200 ? res.data : 'wrong' }
}

async function nextQuestion() {
  if (reviewResult.value?.outcome === 'graduated') graduatedCount.value++
  qIndex.value++
  myAnswer.value = ''
  reviewResult.value = null
  if (qIndex.value >= queue.value.length) {
    reviewPhase.value = 'done'
    await reload()
  }
}

function exitReview() {
  reviewPhase.value = 'idle'
  window.scrollTo({ top: 0 })
}

/* ------------------------------------------------------------------ 列表操作 */

async function removeEntry(key: string) {
  await api.removeWrong(key)
  await reload()
}
async function clearAll() {
  if (!window.confirm('确定清空全部错题记录吗？此操作不可恢复。')) return
  await api.clearWrongbook()
  await reload()
}
async function reload() {
  const res = await api.getWrongbook()
  if (res.code === 200) entries.value = res.data
}
onMounted(async () => {
  await reload()
  loading.value = false
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-16 pt-6">
    <!-- 页头 -->
    <header class="mb-6">
      <h1 class="flex items-center gap-2 text-2xl font-semibold text-ink-900">
        <AppIcon name="bookmark" :size="22" class="text-brand-600" /> 错题本与学习画像
      </h1>
      <p class="mt-1 text-sm text-ink-400">
        效果检测与电路训练的错题自动汇入这里，按艾宾浩斯间隔（{{ REVIEW_INTERVALS.join('/') }} 天）滚动复习，连续答对 2 次毕业。
      </p>
    </header>

    <!-- 复习进行中：全屏卡片 -->
    <section v-if="reviewPhase === 'review' && current" class="anim-panel mb-8 rounded-2xl border border-slate-200 bg-white p-6" style="background:#fff">
      <div class="mb-4 flex items-center justify-between">
        <span class="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">
          复习 {{ qIndex + 1 }} / {{ queue.length }} · {{ current.dim }}
        </span>
        <button class="btn-ghost text-xs" @click="exitReview">退出复习</button>
      </div>

      <template v-if="reviewQ">
        <p class="mb-4 text-base font-medium leading-relaxed text-ink-900">{{ reviewQ.title }}</p>
        <p class="mb-2 text-xs text-ink-400">{{ reviewQ.type }} · 来源：{{ SOURCE_META[current.source].label }}</p>

        <!-- 选项 -->
        <div v-if="reviewQ.options" class="space-y-2">
          <button
            v-for="opt in reviewQ.options"
            :key="opt.key"
            class="block w-full rounded-lg border px-4 py-2.5 text-left text-sm transition"
            :class="[
              isOptionPicked(opt.key) && !reviewResult ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-slate-50 text-ink-900',
              reviewResult && reviewQ.answer.includes(opt.key) ? '!border-emerald-500 !bg-emerald-50 !text-ink-900' : '',
              reviewResult && isOptionPicked(opt.key) && !reviewQ.answer.includes(opt.key) ? '!border-red-500 !bg-red-50 !text-ink-900' : '',
            ]"
            @click="pickOption(opt.key)"
          >
            <span class="mr-2 font-semibold">{{ opt.key }}.</span>{{ opt.text }}
          </button>
        </div>

        <!-- 无选项：文本作答 -->
        <div v-else class="flex gap-2">
          <input
            v-model="myAnswer"
            :disabled="!!reviewResult"
            class="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500"
            placeholder="输入你的答案"
            @keyup.enter="submitReview"
          />
        </div>

        <!-- 判分前提交 -->
        <div v-if="!reviewResult" class="mt-4">
          <button class="btn-primary" :disabled="!myAnswer" @click="submitReview">提交答案</button>
        </div>

        <!-- 判分后反馈 -->
        <div v-else class="mt-4 space-y-3">
          <div
            class="rounded-lg px-4 py-3 text-sm font-medium"
            :class="reviewResult.outcome === 'wrong' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'"
          >
            {{ reviewResult.outcome === 'graduated' ? '🎓 连续两次答对，这道题已毕业移出错题本！' : reviewResult.outcome === 'correct' ? '回答正确！进入下一复习间隔。' : '回答错误，复习间隔重置为 1 天。' }}
          </div>
          <div class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-ink-900">
            <p class="mb-1 font-medium">正确答案：{{ reviewQ.answer.split('').join('、') }}</p>
            <p class="leading-relaxed text-ink-400">{{ reviewQ.analysis }}</p>
          </div>
          <button class="btn-primary" @click="nextQuestion">
            {{ qIndex + 1 >= queue.length ? '完成复习' : '下一题' }}
          </button>
        </div>
      </template>
      <div v-else class="text-sm text-ink-400">该错题的原始数据已不存在，正在跳过……<button class="btn-ghost ml-2 text-xs" @click="nextQuestion">下一题</button></div>
    </section>

    <!-- 复习完成 -->
    <section v-else-if="reviewPhase === 'done'" class="anim-panel mb-8 rounded-2xl border border-slate-200 bg-white p-8 text-center" style="background:#fff">
      <p class="text-lg font-semibold text-ink-900">本轮复习完成</p>
      <p class="mt-2 text-sm text-ink-400">
        本轮毕业 {{ graduatedCount }} 题，剩余 {{ dueList.length }} 题待复习。其余错题会在到期后出现在复习队列里。
      </p>
      <button class="btn-primary mt-4" @click="exitReview">返回错题本</button>
    </section>

    <!-- 主面板：画像 + 统计 + 列表 -->
    <template v-else>
      <div class="mb-8 grid gap-6 lg:grid-cols-[300px_1fr]">
        <!-- 六维雷达 -->
        <div class="anim-panel rounded-2xl border border-slate-200 bg-white p-4" style="background:#fff">
          <h2 class="mb-1 text-sm font-medium text-ink-900">薄弱点雷达</h2>
          <p class="mb-2 text-xs text-ink-400">六维错题分布（面积越大越薄弱）</p>
          <svg viewBox="0 0 320 236" class="mx-auto w-full max-w-[320px]">
            <polygon v-for="(g, i) in radarGrid" :key="i" :points="g" fill="none" stroke="#cbd5e1" stroke-width="0.5" />
            <polygon :points="radarShape" fill="rgba(209,62,62,0.18)" stroke="#e24b4a" stroke-width="1.5" />
            <text v-for="(p, i) in profile" :key="p.dim" class="fill-slate-600" font-size="11"
              :text-anchor="Math.abs(Math.cos(dimAngle(i))) < 0.3 ? 'middle' : Math.cos(dimAngle(i)) > 0 ? 'start' : 'end'"
              :x="(160 + Math.cos(dimAngle(i)) * (82 + 16)).toFixed(1)"
              :y="(118 + Math.sin(dimAngle(i)) * (82 + 16) + 4).toFixed(1)">
              {{ p.dim }}<tspan v-if="p.active" fill="#e24b4a" font-weight="500"> {{ p.active }}</tspan>
            </text>
          </svg>
        </div>

        <!-- 统计卡 + 复习入口 -->
        <div class="grid content-start gap-4">
          <div class="grid grid-cols-3 gap-4">
            <div class="anim-panel rounded-xl border border-slate-200 bg-white p-4 text-center" style="background:#fff">
              <p class="text-2xl font-semibold text-ink-900">{{ entries.length }}</p>
              <p class="mt-1 text-xs text-ink-400">活跃错题</p>
            </div>
            <div class="anim-panel rounded-xl border border-slate-200 bg-white p-4 text-center" style="background:#fff">
              <p class="text-2xl font-semibold" :class="dueList.length ? 'text-red-500' : 'text-emerald-600'">{{ dueList.length }}</p>
              <p class="mt-1 text-xs text-ink-400">今日应复习</p>
            </div>
            <div class="anim-panel rounded-xl border border-slate-200 bg-white p-4 text-center" style="background:#fff">
              <p class="text-2xl font-semibold text-emerald-600">{{ graduatedCount }}</p>
              <p class="mt-1 text-xs text-ink-400">本次已毕业</p>
            </div>
          </div>
          <div class="anim-panel rounded-xl border border-slate-200 bg-white p-5" style="background:#fff">
            <p class="mb-3 text-sm text-ink-900">
              {{ dueList.length ? `有 ${dueList.length} 道错题到了复习时间——现在清掉它们。` : '暂无到期错题。做完检测或电路训练后，错题会自动出现在这里。' }}
            </p>
            <button class="btn-primary" :disabled="!dueList.length" @click="startReview">
              <AppIcon name="zap" :size="15" /> 开始复习（{{ dueList.length }} 题）
            </button>
          </div>
        </div>
      </div>

      <!-- 错题列表 -->
      <section>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h2 class="mr-auto text-base font-medium text-ink-900">全部错题</h2>
          <select v-model="filterSource" class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-ink-900">
            <option value="all">全部来源</option>
            <option value="assess">效果检测</option>
            <option value="circuit">电路训练</option>
          </select>
          <select v-model="filterDim" class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-ink-900">
            <option value="all">全部维度</option>
            <option v-for="d in DIMS" :key="d" :value="d">{{ d }}</option>
          </select>
          <button v-if="entries.length" class="btn-ghost text-xs text-red-500" @click="clearAll">清空</button>
        </div>

        <div v-if="loading" class="py-10 text-center text-sm text-ink-400">加载中……</div>
        <div v-else-if="!filtered.length" class="anim-panel rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center" style="background:#fff">
          <p class="text-sm text-ink-400">错题本是空的——去做一套
            <RouterLink to="/assess" class="text-brand-600 underline">效果检测</RouterLink> 或
            <RouterLink to="/circuit" class="text-brand-600 underline">电路分析训练</RouterLink>，错题会自动汇入。
          </p>
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="e in filtered"
            :key="e.key"
            class="anim-panel flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            style="background:#fff"
          >
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="e.source === 'assess' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'">
              {{ SOURCE_META[e.source].label }}
            </span>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-ink-400">{{ e.dim }}</span>
            <p class="min-w-0 flex-1 truncate text-sm text-ink-900">{{ e.title }}</p>
            <span class="shrink-0 text-xs" :class="e.dueAt <= Date.now() ? 'font-medium text-red-500' : 'text-ink-400'">
              错 {{ e.wrongCount }} 次 · {{ fmtDue(e.dueAt) }}
            </span>
            <button class="btn-ghost shrink-0 text-xs" @click="removeEntry(e.key)">移除</button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
