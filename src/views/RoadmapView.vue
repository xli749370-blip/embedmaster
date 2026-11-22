<script setup lang="ts">
/**
 * 学习地图 · 打卡督学 —— 阶段化 + 可视化
 * - 八阶段成长路径：自动汇总全站真实进度（课程/刷题/电路/项目/错题）
 * - 每日签到 + 连续天数 + 近 8 周热力图
 * - 阶段里程碑手动打勾（持久化）
 */
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { readStore, writeStore } from '@/utils/storage'
import { learnCourses } from '@/mock/learn'

const today = new Date()
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/* ---------------- 每日签到 ---------------- */
const checkins = ref<Record<string, number>>(readStore('roadmap_checkins', {} as Record<string, number>)) // key=日期 value=签到时间戳
const signedToday = computed(() => !!checkins.value[dayKey(today)])

function toggleSign() {
  const k = dayKey(today)
  const next = { ...checkins.value }
  if (next[k]) delete next[k]
  else next[k] = Date.now()
  checkins.value = next
  writeStore('roadmap_checkins', next)
}

/** 连续签到天数（从今天/昨天向回数） */
const streak = computed(() => {
  let n = 0
  const d = new Date(today)
  if (!checkins.value[dayKey(d)]) d.setDate(d.getDate() - 1) // 今天还没签，从昨天起算
  while (checkins.value[dayKey(d)]) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
})

/** 近 8 周（56 天）热力图 */
const heatmap = computed(() => {
  const cells: { key: string; on: boolean; label: string }[] = []
  const d = new Date(today)
  d.setDate(d.getDate() - 55)
  for (let i = 0; i < 56; i++) {
    const k = dayKey(d)
    cells.push({ key: k, on: !!checkins.value[k], label: k })
    d.setDate(d.getDate() + 1)
  }
  return cells
})

/* ---------------- 八阶段路径 ---------------- */
interface Stage {
  id: string
  title: string
  desc: string
  to?: string
  /** 自动进度：0~100（null 表示纯手动） */
  auto?: () => number
  /** 里程碑 */
  milestones: string[]
}

const K_UID = 'u-local'

function autoChapters(): number {
  // 课程：完成的讲义章节数 / 全部章节
  const prog = readStore<Record<string, Record<string, unknown>>>('progress', {})
  const done = Object.keys(prog[K_UID] || {}).length
  return Math.min(100, Math.round((done / 40) * 100))
}
function autoQuiz(): number {
  const ans = readStore<Record<string, unknown[]>>('answers', {})
  const n = (ans[K_UID] || []).length
  return Math.min(100, Math.round((n / 100) * 100))
}
function autoCircuit(): number {
  const cp = readStore<Record<string, Record<string, unknown>>>('circuit_progress', {})
  const n = Object.keys(cp[K_UID] || {}).length
  return Math.min(100, Math.round((n / 60) * 100))
}
function autoAssess(): number {
  const ar = readStore<Record<string, unknown[]>>('assess_results', {})
  const n = (ar[K_UID] || []).length
  return Math.min(100, Math.round((n / 10) * 100))
}
function autoWrong(): number {
  const wb = readStore<Record<string, Record<string, { stage: number }>>>('wrongbook', {})
  const all = Object.values(wb[K_UID] || {})
  if (!all.length) return 0
  const graduated = all.filter((e) => e.stage >= 2).length
  return Math.round((graduated / all.length) * 100)
}
function autoProjects(): number {
  const pp = readStore<Record<string, Record<string, { done?: string[] }>>>('project_progress', {})
  const rec = pp[K_UID] || {}
  let done = 0
  for (const pid in rec) done += rec[pid]?.done?.length || 0
  // 分母：7 个项目关键节估算
  return Math.min(100, Math.round((done / 40) * 100))
}

const stages: Stage[] = [
  { id: 'st1', title: 'S1 语言基础', desc: '术语、表达、内存模型——读得懂每一行 C', to: '/learn/lang', milestones: ['读完嵌入式语言基础 12 节', '能默写位操作读改写套路', '能讲清栈/堆/.data/.bss'] },
  { id: 'st2', title: 'S2 计算机底层', desc: '从晶体管到启动文件，建立分层模型', to: '/learn/computer', milestones: ['读完 10 节', '能画出「点灯」全链路', '能解释中断旅程'] },
  { id: 'st3', title: 'S3 C 语言主线', desc: '嵌入式所需核心逐节攻克', to: '/learn/clang', auto: autoChapters, milestones: ['嵌入式主线 10 节全读', '通用篇浏览一遍', '状态机/驱动框架能脱稿写'] },
  { id: 'st4', title: 'S4 STM32 课程', desc: '七门课讲义+随章小测全部过完', to: '/courses', auto: autoChapters, milestones: ['六章基础课读完', '底层原理进阶读完', '综合实战过完'] },
  { id: 'st5', title: 'S5 练习检测', desc: '刷题 + 检测双线并进', to: '/quiz', auto: autoQuiz, milestones: ['在线刷题 100 题次', '效果检测做满 10 卷', '检测正确率 ≥ 80%'] },
  { id: 'st6', title: 'S6 电路训练', desc: '60 例电路分析全通关', to: '/circuit', auto: autoCircuit, milestones: ['完成 60 例中的 80%', '15 条避坑手册过完', '错题都能讲出原因'] },
  { id: 'st7', title: 'S7 项目实战', desc: '项目库 7 个项目，至少完整跟完 2 个', to: '/projects', auto: autoProjects, milestones: ['p01 平衡小车跟完', 'p02 或 p07 跟完一个', '复盘 README 写一份'] },
  { id: 'st8', title: 'S8 毕业三件套', desc: '错题清零 + 检测达标 + 独立项目', to: '/wrongbook', auto: autoWrong, milestones: ['错题本毕业率 100%', '最新检测 ≥ 85 分', '独立完成一个自选项目'] },
]

const milestones = ref<Record<string, boolean>>(readStore('roadmap_milestones', {} as Record<string, boolean>))
function toggleMs(key: string) {
  const next = { ...milestones.value, [key]: !milestones.value[key] }
  milestones.value = next
  writeStore('roadmap_milestones', next)
}

const stageProgress = (s: Stage) => {
  const auto = s.auto ? s.auto() : null
  const ms = s.milestones
  const manual = ms.length ? Math.round((ms.filter((_, i) => milestones.value[`${s.id}:${i}`]).length / ms.length) * 100) : null
  if (auto !== null && manual !== null) return Math.round(auto * 0.5 + manual * 0.5)
  return auto ?? manual ?? 0
}

const overall = computed(() => Math.round(stages.reduce((a, s) => a + stageProgress(s), 0) / stages.length))

const totalLearn = computed(() => learnCourses.reduce((a, c) => a + c.sections.length, 0))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-ink-900">学习地图 · 打卡</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
        八个阶段，从语言基础到独立做项目——每阶段自动汇总全站真实进度 + 里程碑自查，配合每日打卡形成学习惯性。理论课共 {{ totalLearn }} 节等你在地图上点亮。
      </p>
    </header>

    <!-- 顶部：总进度 + 打卡 -->
    <div class="mb-7 grid gap-4 sm:grid-cols-3">
      <div class="anim-panel rounded-2xl border border-slate-200 bg-white p-5 text-center" style="background: #fff">
        <p class="text-xs text-ink-400">总进度</p>
        <p class="mt-1 text-3xl font-extrabold text-brand-600">{{ overall }}%</p>
        <div class="mx-auto mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500" :style="{ width: overall + '%' }" />
        </div>
      </div>
      <div class="anim-panel rounded-2xl border border-slate-200 bg-white p-5 text-center" style="background: #fff">
        <p class="text-xs text-ink-400">连续打卡</p>
        <p class="mt-1 text-3xl font-extrabold text-amber-500">{{ streak }}<span class="text-sm font-medium text-ink-400"> 天</span></p>
        <p class="mt-2 text-[11px] text-ink-400">每天打开学一点，惯性比意志力可靠</p>
      </div>
      <button
        class="anim-panel rounded-2xl border p-5 text-center transition"
        :class="signedToday ? 'border-emerald-200 bg-emerald-50' : 'border-brand-200 bg-brand-50 hover:bg-brand-100'"
        style="background: #fff"
        @click="toggleSign"
      >
        <p class="text-xs text-ink-400">今日签到</p>
        <p class="mt-1 text-xl font-extrabold" :class="signedToday ? 'text-emerald-600' : 'text-brand-700'">
          {{ signedToday ? '✓ 已打卡' : '点击打卡' }}
        </p>
        <p class="mt-2 text-[11px] text-ink-400">{{ signedToday ? '今天也要保持状态' : '完成任意学习后来打一下' }}</p>
      </button>
    </div>

    <!-- 热力图 -->
    <div class="anim-panel mb-7 rounded-2xl border border-slate-200 bg-white p-4" style="background: #fff">
      <p class="mb-2 text-xs font-semibold text-ink-400">近 8 周打卡热力图</p>
      <div class="grid grid-flow-col grid-rows-7 gap-1" style="grid-auto-columns: minmax(0, 1fr)">
        <span
          v-for="c in heatmap"
          :key="c.key"
          class="h-3.5 w-full rounded-sm"
          :class="c.on ? 'bg-brand-500' : 'bg-slate-100'"
          :title="c.label + (c.on ? ' · 已打卡' : '')"
        />
      </div>
    </div>

    <!-- 八阶段 -->
    <div class="space-y-4">
      <div v-for="(s, si) in stages" :key="s.id" class="anim-panel rounded-2xl border border-slate-200 bg-white p-5" style="background: #fff">
        <div class="flex flex-wrap items-center gap-3">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold"
            :class="stageProgress(s) >= 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-brand-50 text-brand-700'">
            {{ stageProgress(s) >= 100 ? '✓' : 'S' + (si + 1) }}
          </span>
          <div class="min-w-40 flex-1">
            <p class="text-sm font-bold text-ink-900">{{ s.title }}<span class="ml-2 text-xs font-normal text-ink-400">{{ s.desc }}</span></p>
            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500" :style="{ width: stageProgress(s) + '%' }" />
            </div>
          </div>
          <span class="text-lg font-extrabold" :class="stageProgress(s) >= 100 ? 'text-emerald-500' : 'text-ink-300'">{{ stageProgress(s) }}%</span>
          <RouterLink v-if="s.to" :to="s.to" class="btn border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-brand-700 hover:bg-brand-50">
            去学习 <AppIcon name="chevron-right" :size="11" />
          </RouterLink>
        </div>
        <!-- 里程碑 -->
        <div class="mt-3 space-y-1.5 border-t border-slate-50 pt-3">
          <button
            v-for="(m, mi) in s.milestones"
            :key="mi"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-slate-50"
            @click="toggleMs(`${s.id}:${mi}`)"
          >
            <span
              class="grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px]"
              :class="milestones[`${s.id}:${mi}`] ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-transparent'"
            >✓</span>
            <span :class="milestones[`${s.id}:${mi}`] ? 'text-ink-400 line-through' : 'text-ink-600'">{{ m }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
