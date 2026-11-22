<script setup lang="ts">
/**
 * 学习周报
 * ------------------------------------------------------------------
 * 把本地记录（阅读进度 + 答题记录）聚合成一页可读的报告：
 * 本周概览 → 近 7 天节奏 → 28 天热力图 → 课程掌握度 → 薄弱章节 → 建议。
 *
 * 统计口径（页面底部也写了一遍，避免误读）：
 * - 「阅读章节」= 当天有进度更新的章节数，不是阅读次数，也不含阅读时长；
 * - 「正确率」只统计单选题 / 多选题 / 判断题，简答题自评不计入分母；
 * - 「连续学习」以「当天有答题或有阅读」为一次，今天还没学不算断。
 */
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import { buildReport, type HeatCell, type Report } from '@/utils/report'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const loading = ref(true)
const busy = ref(false)
const report = ref<Report | null>(null)

async function load() {
  loading.value = true
  const [prog, hist] = await Promise.all([api.getProgressList(), api.getAnswerHistory()])
  report.value = buildReport(prog.data, hist.data)
  loading.value = false
}

async function seed() {
  busy.value = true
  const res = await api.seedDemoActivity(21)
  busy.value = false
  toast.success(res.message)
  await load()
}

async function clearAll() {
  const ok = window.confirm('将清空本机的阅读进度与答题记录（错题本、正确率都会归零），确定吗？')
  if (!ok) return
  busy.value = true
  await api.clearActivity()
  busy.value = false
  toast.success('学习记录已清空')
  await load()
}

const days = computed(() => report.value?.days ?? [])

/** 柱高归一化：答题数与阅读章节数共用一个上限，两种柱子才能直接比高低 */
const maxBar = computed(() => Math.max(1, ...days.value.map((d) => Math.max(d.answers, d.chapters))))
/** 上限 78px，上面留 14px 给柱顶数值，容器 100px 正好不溢出 */
const barH = (v: number) => (v <= 0 ? '0px' : `${Math.max(5, Math.round((v / maxBar.value) * 78))}px`)

const rangeText = computed(() => {
  const d = days.value
  if (!d.length) return ''
  const fmt = (key: string) => {
    const [, m, day] = key.split('-')
    return `${Number(m)} 月 ${Number(day)} 日`
  }
  return `${fmt(d[0].key)} — ${fmt(d[d.length - 1].key)}`
})

/** 各课程主题色，和 CourseCard / 搜索页保持同一套 */
const THEME: Record<string, string> = {
  blue: 'bg-[#2549eb]',
  cyan: 'bg-[#0891b2]',
  violet: 'bg-[#6d28d9]',
  amber: 'bg-[#d97706]',
  emerald: 'bg-[#059669]',
  rose: 'bg-[#e11d48]',
}

const HEAT = ['bg-slate-100', 'bg-emerald-100', 'bg-emerald-300', 'bg-emerald-500', 'bg-emerald-600']

function heatTitle(c: HeatCell) {
  if (c.answers === 0 && c.chapters === 0) return `${c.label}：没有学习记录`
  return `${c.label}：${c.answers} 道题 · ${c.chapters} 章`
}

/** 概览卡的四种语气，避免全用同一个颜色导致信息层级发平 */
const TONE: Record<'good' | 'warn' | 'info', { box: string; icon: string }> = {
  good: { box: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-600' },
  warn: { box: 'border-amber-200 bg-amber-50', icon: 'text-amber-600' },
  info: { box: 'border-slate-200 bg-white', icon: 'text-brand-600' },
}

const TONE_ICON: Record<'good' | 'warn' | 'info', string> = {
  good: 'check-circle',
  warn: 'alert',
  info: 'info',
}

onMounted(load)
</script>

<template>
  <div class="container-page max-w-5xl py-8 sm:py-10">
    <nav class="flex items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <RouterLink to="/profile" class="hover:text-brand-700">个人中心</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <span class="text-ink-600">学习周报</span>
    </nav>

    <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">学习周报</h1>
        <p class="mt-1.5 text-sm text-ink-500">
          <span class="font-mono text-[13px] text-ink-600">{{ rangeText }}</span>
          <span class="mx-1.5 text-slate-300">/</span>
          基于本机的阅读进度与答题记录自动汇总
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-ghost btn-sm" :disabled="loading || busy" @click="load">
          <AppIcon name="refresh" :size="13" :class="loading ? 'animate-spin' : ''" /> 重新统计
        </button>
        <button class="btn-ghost btn-sm" :disabled="busy" @click="seed">
          <AppIcon name="sparkles" :size="13" /> 生成演示数据
        </button>
      </div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading && !report" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="i in 4" :key="i" class="card h-24 animate-pulse bg-slate-100/60" />
    </div>

    <template v-else-if="report">
      <!-- ============ 空态 ============ -->
      <div
        v-if="report.empty"
        class="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center"
      >
        <span class="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <AppIcon name="chart" :size="24" />
        </span>
        <p class="mt-4 text-base font-bold text-ink-900">还没有可以统计的学习记录</p>
        <p class="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">
          读一章讲义、答几道题，这里就会出现正确率曲线、课程掌握度和薄弱章节。
          想先看看报表长什么样，可以生成一批演示数据（写入本机，可随时清空）。
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <RouterLink to="/courses" class="btn-primary btn-sm">去读一章</RouterLink>
          <button class="btn-ghost btn-sm" :disabled="busy" @click="seed">
            <AppIcon name="sparkles" :size="13" /> 生成演示数据
          </button>
        </div>
      </div>

      <!-- ============ 正式报表 ============ -->
      <template v-else>
        <!-- 概览 -->
        <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="card p-4">
            <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <AppIcon name="quiz" :size="12" /> 本周答题
            </div>
            <div class="mt-2 flex items-end gap-1">
              <span class="text-[26px] font-extrabold leading-none text-ink-900">{{ report.totals.weekAnswers }}</span>
              <span class="pb-0.5 text-[11px] text-ink-400">道</span>
            </div>
            <p class="mt-1.5 text-[11.5px] text-ink-400">7 天中活跃 {{ report.totals.activeDays }} 天</p>
          </div>

          <div class="card p-4">
            <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <AppIcon name="target" :size="12" /> 本周正确率
            </div>
            <div class="mt-2 flex items-end gap-1">
              <span
                class="text-[26px] font-extrabold leading-none"
                :class="
                  report.totals.weekAccuracy < 0
                    ? 'text-slate-300'
                    : report.totals.weekAccuracy >= 80
                      ? 'text-emerald-600'
                      : report.totals.weekAccuracy >= 60
                        ? 'text-ink-900'
                        : 'text-amber-600'
                "
              >
                {{ report.totals.weekAccuracy < 0 ? '—' : `${report.totals.weekAccuracy}%` }}
              </span>
            </div>
            <p class="mt-1.5 text-[11.5px] text-ink-400">
              答对 {{ report.totals.weekCorrect }} / {{ report.totals.weekAnswers }}
            </p>
          </div>

          <div class="card p-4">
            <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <AppIcon name="book" :size="12" /> 本周阅读
            </div>
            <div class="mt-2 flex items-end gap-1">
              <span class="text-[26px] font-extrabold leading-none text-ink-900">{{ report.totals.weekChapters }}</span>
              <span class="pb-0.5 text-[11px] text-ink-400">章</span>
            </div>
            <p class="mt-1.5 text-[11.5px] text-ink-400">累计读完 {{ report.totals.finishedChapters }} 章</p>
          </div>

          <div class="card p-4">
            <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <AppIcon name="zap" :size="12" /> 连续学习
            </div>
            <div class="mt-2 flex items-end gap-1">
              <span class="text-[26px] font-extrabold leading-none text-ink-900">{{ report.totals.streak }}</span>
              <span class="pb-0.5 text-[11px] text-ink-400">天</span>
            </div>
            <p class="mt-1.5 text-[11.5px] text-ink-400">待巩固错题 {{ report.totals.wrongOpen }} 道</p>
          </div>
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-5">
          <!-- 近 7 天节奏 -->
          <section class="card min-w-0 p-5 lg:col-span-3">
            <div class="flex items-center justify-between">
              <h2 class="text-[13px] font-bold text-ink-900">近 7 天节奏</h2>
              <div class="flex items-center gap-3 text-[10.5px] text-ink-400">
                <span class="flex items-center gap-1">
                  <span class="block h-2 w-2 rounded-sm bg-brand-500" /> 答题
                </span>
                <span class="flex items-center gap-1">
                  <span class="block h-2 w-2 rounded-sm bg-emerald-400" /> 阅读章节
                </span>
              </div>
            </div>

            <div class="mt-4 flex items-end justify-between gap-1 sm:gap-2">
              <div v-for="d in days" :key="d.key" class="flex min-w-0 flex-1 flex-col items-center">
                <!-- 柱体：答题与阅读并排，共用一个高度基准；数值只标在答题柱上方 -->
                <div class="flex h-[100px] w-full items-end justify-center gap-1">
                  <div
                    class="relative w-[14px] rounded-t-sm bg-brand-500 transition-all sm:w-[16px]"
                    :style="{ height: barH(d.answers) }"
                    :title="`${d.label}：${d.answers} 道题`"
                  >
                    <span
                      v-if="d.answers"
                      class="absolute -top-3.5 left-1/2 -translate-x-1/2 font-mono text-[9px] font-semibold text-ink-400"
                    >
                      {{ d.answers }}
                    </span>
                  </div>
                  <div
                    class="w-[14px] rounded-t-sm bg-emerald-400 transition-all sm:w-[16px]"
                    :style="{ height: barH(d.chapters) }"
                    :title="`${d.label}：${d.chapters} 章`"
                  />
                </div>
                <div class="mt-1.5 flex flex-col items-center leading-tight">
                  <span
                    class="text-[10.5px]"
                    :class="d.isToday ? 'font-bold text-brand-700' : 'text-ink-500'"
                  >
                    {{ d.isToday ? '今天' : d.weekday }}
                  </span>
                  <span class="font-mono text-[9.5px] text-slate-400">{{ d.label }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 28 天热力图 -->
          <section class="card min-w-0 p-5 lg:col-span-2">
            <div class="flex items-center justify-between">
              <h2 class="text-[13px] font-bold text-ink-900">近 28 天</h2>
              <div class="flex items-center gap-1 text-[10px] text-ink-400">
                少
                <span v-for="(h, i) in HEAT" :key="i" class="block h-2 w-2 rounded-[2px]" :class="h" />
                多
              </div>
            </div>
            <div class="mt-4 grid grid-cols-7 gap-1.5">
              <div
                v-for="c in report.heat"
                :key="c.key"
                class="h-5 rounded-[3px] transition hover:ring-2 hover:ring-brand-300 sm:h-6"
                :class="HEAT[c.level]"
                :title="heatTitle(c)"
              />
            </div>
            <p class="mt-3 text-[11px] leading-relaxed text-ink-400">
              每格一天，颜色越深=当天答题越多、读的章节越多。空白格表示那天没有学习记录。
            </p>
          </section>
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-5">
          <!-- 课程掌握度 -->
          <section class="card min-w-0 p-5 lg:col-span-3">
            <h2 class="text-[13px] font-bold text-ink-900">课程掌握度</h2>
            <p class="mt-0.5 text-[11px] text-ink-400">阅读进度占 60%，本周正确率占 40%</p>

            <div class="mt-4 space-y-3.5">
              <RouterLink
                v-for="c in report.courses"
                :key="c.course_id"
                :to="`/course/${c.course_id}`"
                class="block group"
              >
                <div class="flex items-baseline justify-between gap-2 text-[12px]">
                  <span class="min-w-0 truncate font-semibold text-ink-700 group-hover:text-brand-700">{{ c.name }}</span>
                  <span class="shrink-0 font-mono text-[11px] text-ink-400">读完 {{ c.finished }}/{{ c.total }} 章</span>
                </div>
                <div class="mt-1.5 flex items-center gap-2">
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="THEME[c.theme] ?? THEME.blue"
                      :style="{ width: `${Math.max(c.mastery, c.mastery > 0 ? 3 : 0)}%` }"
                    />
                  </div>
                  <span class="w-8 shrink-0 text-right font-mono text-[11px] font-semibold text-ink-500">
                    {{ c.mastery }}%
                  </span>
                </div>
              </RouterLink>
            </div>
          </section>

          <!-- 薄弱章节 -->
          <section class="card min-w-0 p-5 lg:col-span-2">
            <h2 class="text-[13px] font-bold text-ink-900">最该回看的章节</h2>
            <p class="mt-0.5 text-[11px] text-ink-400">按累计答错次数排序</p>

            <div v-if="report.weak.length" class="mt-3 space-y-1">
              <RouterLink
                v-for="w in report.weak"
                :key="w.chapter_id"
                :to="`/chapter/${w.chapter_id}`"
                class="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-slate-50"
              >
                <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-[11px] font-bold text-amber-600">
                  {{ w.wrong }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[12.5px] font-semibold text-ink-700">{{ w.chapter_name }}</div>
                  <div class="truncate text-[10.5px] text-ink-400">
                    {{ w.course_name }} · 正确率 {{ w.accuracy }}%（{{ w.total - w.wrong }}/{{ w.total }}）
                  </div>
                </div>
                <AppIcon name="chevron-right" :size="13" class="shrink-0 text-slate-300" />
              </RouterLink>
            </div>
            <div v-else class="mt-6 flex flex-col items-center py-6 text-center">
              <span class="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <AppIcon name="check-circle" :size="18" />
              </span>
              <p class="mt-2 text-[12.5px] font-semibold text-ink-700">没有答错的题</p>
              <p class="mt-0.5 text-[11px] text-ink-400">继续保持，或者去挑战更难的题</p>
            </div>
          </section>
        </div>

        <!-- 建议 -->
        <section class="mt-3">
          <h2 class="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">本周建议</h2>
          <div class="flex flex-col gap-3 sm:flex-row">
            <component
              :is="s.to ? 'RouterLink' : 'div'"
              v-for="(s, i) in report.suggestions"
              :key="i"
              :to="s.to"
              class="flex flex-1 gap-3 rounded-xl border p-4 transition"
              :class="[TONE[s.tone].box, s.to ? 'hover:-translate-y-0.5 hover:shadow-lift' : '']"
            >
              <span class="mt-0.5 shrink-0" :class="TONE[s.tone].icon">
                <AppIcon :name="TONE_ICON[s.tone]" :size="16" />
              </span>
              <div class="min-w-0">
                <div class="text-[12.5px] font-bold text-ink-900">{{ s.title }}</div>
                <p class="mt-1 text-[11.5px] leading-relaxed text-ink-500">{{ s.text }}</p>
              </div>
            </component>
          </div>
        </section>

        <!-- 口径说明 + 清空 -->
        <div class="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
          <p class="max-w-2xl text-[11px] leading-relaxed text-ink-400">
            统计口径：「阅读」按当天有进度更新的章节数计算，不记录阅读时长；正确率只统计客观题，
            简答题自评不计入分母；连续学习以「当天有答题或有阅读」为一天，今天还没开始学不算中断。
            数据只存在当前浏览器，清空后无法恢复。
          </p>
          <button class="btn-ghost btn-sm shrink-0 text-rose-600 hover:bg-rose-50" :disabled="busy" @click="clearAll">
            清空学习记录
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
