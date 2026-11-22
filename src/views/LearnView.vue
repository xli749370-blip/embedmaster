<script setup lang="ts">
/**
 * 理论课程通用视图（数据驱动）：/learn/:id
 * - 侧栏目录：支持章节分组；正文每节五维度：讲解 / 代码示例 / 避坑 / 随节小测 / 延伸
 * - clang 双轨过滤（嵌入式主线 / 非嵌入式通用）
 * - 「听学」= 朗读本节（学习型）；冥想有独立内容库（/meditate）
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ProjectDocRenderer from '@/components/ProjectDocRenderer.vue'
import { getLearnCourse, docToSpeech, type LearnSection } from '@/mock/learn'
import { useSpeech } from '@/composables/useSpeech'

const route = useRoute()
const router = useRouter()
const { speak, speakFile, stop, speaking, supported, audioTime } = useSpeech()

const course = computed(() => getLearnCourse(String(route.params.id || '')))

/* ---------------- 内置听学音频（离线可听，打包随 App 分发） ----------------
 * 70 节课程讲解已预生成为 mp3（神经音色），有音频的节点「听学」直接播放，
 * 无音频的节点回退到 TTS 朗读，行为不变。
 */
const audioMap = ref<Record<string, string>>({})
onMounted(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/learn/manifest.json`)
    if (!res.ok) return
    const m = await res.json()
    const map: Record<string, string> = {}
    for (const s of m.sections || []) map[`${s.course}#${s.id}`] = `${import.meta.env.BASE_URL}${s.file}`
    audioMap.value = map
  } catch {
    /* 离线或无清单：全部走 TTS 回退 */
  }
})

/** clang 双轨过滤：all / emb / general */
const track = ref<'all' | 'emb' | 'general'>('all')
const sections = computed<LearnSection[]>(() => {
  const c = course.value
  if (!c) return []
  if (c.id !== 'clang' || track.value === 'all') return c.sections
  return c.sections.filter((s) => s.track === track.value)
})

/** 章节分组目录数据：[{ chapter, items }]；无章节则整体一组 */
const groups = computed(() => {
  const c = course.value
  if (!c?.chapters?.length) return [{ id: '', title: '', brief: '', items: sections.value }]
  return c.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    brief: ch.brief || '',
    items: sections.value.filter((s) => (s.chapter || c.chapters![0].id) === ch.id),
  }))
})

const DIMS = (s: LearnSection) => [
  !!s.code,
  !!s.pitfalls?.length,
  !!s.quiz?.length,
  !!s.extend,
]

const activeId = ref('')
function jump(id: string) {
  activeId.value = id
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 代码示例块的渲染文档（按课程语言选围栏） */
function codeDoc(s: LearnSection): string {
  const lang = course.value?.id === 'python' ? 'python' : 'c'
  return `\n\`\`\`${lang}\n${s.code || ''}\n\`\`\``
}

/** 听学某节：优先播放内置音频（离线可用），缺文件时回退 TTS 朗读（讲解正文 + 避坑，代码不读） */
const readingId = ref('')
function listen(sec: LearnSection) {
  const secId = sec.id
  if (readingId.value === secId && speaking.value) {
    stop()
    readingId.value = ''
    return
  }
  readingId.value = secId
  const done = () => (readingId.value = '')
  const url = audioMap.value[`${course.value?.id}#${secId}`]
  if (url) {
    speakFile(url, '', done)
    return
  }
  const pit = sec.pitfalls?.length ? `常见的坑有：${sec.pitfalls.join('；')}` : ''
  speak(docToSpeech(sec.doc) + pit, done)
}

/* ---------------- 随节小测状态 ---------------- */
const quizPick = ref<Record<string, number>>({})
function pickQuiz(secId: string, qi: number, oi: number) {
  quizPick.value = { ...quizPick.value, [`${secId}#${qi}`]: oi }
}

onMounted(() => {
  if (!course.value) router.replace('/learn/lang')
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <template v-if="course">
      <!-- 页头 -->
      <header class="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-ink-900">{{ course.title }}</h1>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-500">{{ course.subtitle }}</p>
          <p class="mt-1 text-xs text-ink-400">
            共 {{ course.chapters?.length ? course.chapters.length + ' 章 · ' : '' }}{{ sections.length }} 节 · 每节含讲解 / 代码 / 避坑 / 小测多维度
          </p>
        </div>
        <button
          v-if="course.tts"
          class="btn border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 hover:bg-violet-100"
          @click="router.push('/meditate')"
        >
          <AppIcon name="zap" :size="13" /> 冥想听学 · 专属频道
        </button>
      </header>

      <!-- 双轨切换（仅 C 语言） -->
      <div v-if="course.id === 'clang'" class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="t in [
            { id: 'all', label: '全部内容' },
            { id: 'emb', label: '嵌入式所需（主线）' },
            { id: 'general', label: '非嵌入式通用' },
          ]"
          :key="t.id"
          class="btn px-3 py-1.5 text-xs"
          :class="track === t.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="track = t.id as any"
        >{{ t.label }}</button>
      </div>

      <div class="flex flex-col gap-5 lg:flex-row">
        <!-- 侧栏目录（章节分组） -->
        <aside class="lg:sticky lg:top-20 lg:h-fit lg:w-60 lg:shrink-0">
          <p class="mb-2 hidden text-xs font-semibold text-ink-400 lg:block">目录</p>
          <div class="flex gap-2 overflow-x-auto pb-1 lg:max-h-[72vh] lg:flex-col lg:overflow-y-auto">
            <div v-for="g in groups" :key="g.id || 'all'" class="lg:mb-2">
              <p v-if="g.title" class="mb-1 mt-2 hidden whitespace-nowrap text-[11px] font-bold text-ink-400 lg:block">
                {{ g.title }}
              </p>
              <div class="flex gap-2 lg:flex-col">
                <button
                  v-for="(s, i) in g.items"
                  :key="s.id"
                  class="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs transition lg:whitespace-normal"
                  :class="activeId === s.id ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 hover:bg-slate-50 border border-slate-100'"
                  @click="jump(s.id)"
                >
                  <span class="font-mono opacity-60">{{ String(sections.indexOf(s) + 1).padStart(2, '0') }}</span>
                  {{ s.title.replace(/^\[[^\]]+\]\s*/, '') }}
                  <span v-if="DIMS(s).filter(Boolean).length" class="ml-1 hidden text-[10px] opacity-50 lg:inline">+{{ DIMS(s).filter(Boolean).length }}维</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        <!-- 正文 -->
        <div class="min-w-0 flex-1 space-y-6">
          <template v-for="(g, gi) in groups" :key="g.id || gi">
            <!-- 章节横幅 -->
            <div v-if="g.title" class="rounded-2xl border border-brand-100 bg-brand-50/60 px-5 py-4" style="background: rgba(239,246,255,0.6)">
              <h2 class="text-base font-bold text-brand-800">第 {{ gi + 1 }} 章 · {{ g.title }}</h2>
              <p v-if="g.brief" class="mt-1 text-xs leading-relaxed text-brand-700/80">{{ g.brief }}</p>
            </div>

            <article
              v-for="s in g.items"
              :id="`sec-${s.id}`"
              :key="s.id"
              class="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              style="background: #fff"
            >
              <div class="mb-3 flex items-start justify-between gap-3">
                <h3 class="text-lg font-bold text-ink-900">{{ s.title }}</h3>
                <button
                  v-if="course.tts && (audioMap[`${course.id}#${s.id}`] || supported)"
                  class="btn shrink-0 border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-ink-500 hover:border-brand-300 hover:text-brand-700"
                  :title="audioMap[`${course.id}#${s.id}`] ? '播放内置讲解音频（离线可听）' : '朗读本节（视觉疲劳时可听学）'"
                  @click="listen(s)"
                >
                  {{ speaking && readingId === s.id ? '■ 停止' : audioMap[`${course.id}#${s.id}`] ? '▶ 听学 · 内置' : '▶ 听学' }}
                </button>
              </div>

              <!-- 维度一：讲解 -->
              <ProjectDocRenderer :doc="s.doc" />

              <!-- 维度二：代码示例（按课程语言高亮） -->
              <div v-if="s.code" class="mt-5">
                <p class="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-700">
                  <span class="inline-block h-2 w-2 rounded-full bg-emerald-500" /> 代码示例
                </p>
                <ProjectDocRenderer :doc="codeDoc(s)" />
              </div>

              <!-- 维度三：避坑 -->
              <div v-if="s.pitfalls?.length" class="mt-5 rounded-xl border border-rose-100 bg-rose-50/70 p-4" style="background: rgba(255,241,242,0.7)">
                <p class="mb-2 flex items-center gap-1.5 text-xs font-bold text-rose-700">
                  <span class="inline-block h-2 w-2 rounded-full bg-rose-500" /> 常见错误与避坑
                </p>
                <ul class="space-y-1.5 text-xs leading-relaxed text-rose-800">
                  <li v-for="(p, pi) in s.pitfalls" :key="pi" class="flex gap-2">
                    <span class="font-mono font-bold opacity-60">{{ pi + 1 }}.</span>{{ p }}
                  </li>
                </ul>
              </div>

              <!-- 维度四：随节小测 -->
              <div v-if="s.quiz?.length" class="mt-5 rounded-xl border border-amber-100 bg-amber-50/60 p-4" style="background: rgba(255,246,235,0.6)">
                <p class="mb-3 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <span class="inline-block h-2 w-2 rounded-full bg-amber-500" /> 随节小测（点击选项即判）
                </p>
                <div v-for="(q, qi) in s.quiz" :key="qi" class="mb-4 last:mb-0">
                  <p class="text-xs font-semibold text-ink-800">{{ qi + 1 }}. {{ q.q }}</p>
                  <div class="mt-2 grid gap-1.5">
                    <button
                      v-for="(o, oi) in q.options"
                      :key="oi"
                      class="rounded-lg border px-3 py-1.5 text-left text-xs transition"
                      :class="quizPick[`${s.id}#${qi}`] === undefined
                        ? 'border-slate-200 bg-white text-ink-600 hover:border-amber-300'
                        : oi === q.answer
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : quizPick[`${s.id}#${qi}`] === oi
                            ? 'border-rose-300 bg-rose-50 text-rose-600'
                            : 'border-slate-100 bg-white text-ink-400'"
                      @click="pickQuiz(s.id, qi, oi)"
                    >{{ 'ABCD'[oi] }}. {{ o }}</button>
                  </div>
                  <p v-if="quizPick[`${s.id}#${qi}`] !== undefined" class="mt-2 rounded-lg bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
                    {{ quizPick[`${s.id}#${qi}`] === q.answer ? '✓ 答对了。' : '✗ 再想想。' }}{{ q.explain }}
                  </p>
                </div>
              </div>

              <!-- 维度五：延伸 -->
              <div v-if="s.extend" class="mt-5 rounded-xl border border-sky-100 bg-sky-50/60 p-4" style="background: rgba(240,249,255,0.6)">
                <p class="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-sky-700">
                  <span class="inline-block h-2 w-2 rounded-full bg-sky-500" /> 延伸与关联
                </p>
                <p class="text-xs leading-relaxed text-sky-900/80">{{ s.extend }}</p>
              </div>
            </article>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
