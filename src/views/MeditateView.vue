<script setup lang="ts">
/**
 * 冥想听学 —— 闭眼也能继续学
 *
 * 两组频道：
 *   心法（20 篇静态口语稿）—— 用比喻重新理解概念
 *   课程精听（205 篇动态清单）—— 教材正文 / 电路门诊 / 元器件 / 代码 / 避坑
 *
 * 全部音频预生成为内置 mp3：不依赖在线语音服务，离线可听，
 * 所以「眼睛不舒服、只想躺着听」时也能照常学习。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import {
  meditateChannels,
  listenChannels,
  allChannels,
  LISTEN_CHANNEL_IDS,
  piecesOf,
  getPiece,
} from '@/mock/meditate'
import { useSpeech, ttsCfg, saveTtsCfg, type TtsPreset } from '@/composables/useSpeech'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const toast = useToast()
const { speak, speakFile, stop, pause, resume, speaking, paused, rate, apiErr, sysVoices, ttsPresets, supported, audioProgress, audioTime } = useSpeech()

/** 统一篇目视图：静态口语稿与动态清单共用一套渲染 */
interface Row {
  id: string
  title: string
  minutes: number
  sub?: string
  ref?: string
  channel: string
}

/* ---------------- 两份内置音频清单 ---------------- */
const audioMap = ref<Record<string, string>>({})
const rowsByChannel = ref<Record<string, Row[]>>({})
const listState = ref<'loading' | 'ok' | 'fail'>('loading')

onMounted(async () => {
  const map: Record<string, string> = {}
  const byCh: Record<string, Row[]> = {}
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/meditate/manifest.json`)
    if (res.ok) {
      const m = await res.json()
      for (const p of m.pieces || []) map[p.id] = `${import.meta.env.BASE_URL}${p.file}`
    }
  } catch { /* 无清单则心法稿回退 TTS */ }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/listen/manifest.json`)
    if (res.ok) {
      const m = await res.json()
      for (const e of m.entries || []) {
        ;(byCh[e.channel] ||= []).push({
          id: e.id,
          title: e.title,
          minutes: e.minutes || 0,
          sub: e.sub,
          ref: e.ref,
          channel: e.channel,
        })
        map[e.id] = `${import.meta.env.BASE_URL}${e.file}`
      }
      listState.value = 'ok'
    } else {
      listState.value = 'fail'
    }
  } catch {
    listState.value = 'fail'
  }
  audioMap.value = map
  rowsByChannel.value = byCh
  lastRef.value = readLast()
})

const channelId = ref(String(route.query.channel || meditateChannels[0].id))
const channel = computed(() => allChannels.find((c) => c.id === channelId.value) || allChannels[0])
const isDynamic = computed(() => LISTEN_CHANNEL_IDS.includes(channelId.value))
const pieces = computed<Row[]>(() => {
  if (isDynamic.value) return rowsByChannel.value[channelId.value] || []
  return piecesOf(channelId.value).map((p) => ({ id: p.id, title: p.title, minutes: p.minutes, channel: p.channel }))
})

const idx = ref(0)
const autoNext = ref(true)
const cur = computed<Row | undefined>(() => pieces.value[idx.value])

/** 频道篇数（动态频道在清单加载前显示 0，加载完自动刷新） */
function countOf(id: string): number {
  if (LISTEN_CHANNEL_IDS.includes(id)) return rowsByChannel.value[id]?.length || 0
  return piecesOf(id).length
}

/** 频道总时长文案：超过 1 小时显示「5.6 小时」，否则「约 42 分钟」 */
function hoursOf(id: string): string {
  const rows = LISTEN_CHANNEL_IDS.includes(id)
    ? rowsByChannel.value[id] || []
    : piecesOf(id).map((p) => ({ minutes: p.minutes }))
  const min = rows.reduce((a, r) => a + (r.minutes || 0), 0)
  if (min < 1) return ''
  return min >= 60 ? `${(min / 60).toFixed(1)} 小时` : `${Math.round(min)} 分钟`
}

/* ---------------- 断点续听 ---------------- */
const LAST_KEY = 'embedmaster:meditate_last'
const lastRef = ref<{ channel: string; idx: number; title: string } | null>(null)
function readLast(): { channel: string; idx: number; title: string } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function saveLast() {
  const p = cur.value
  if (!p) return
  lastRef.value = { channel: channelId.value, idx: idx.value, title: p.title }
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(lastRef.value))
  } catch { /* 隐私模式忽略 */ }
}
function resumeLast() {
  const l = lastRef.value
  if (!l) return
  stop()
  channelId.value = l.channel
  nextTick(() => startPiece(Math.min(l.idx, Math.max(0, pieces.value.length - 1))))
}

/* ---------------- 睡眠定时（听睡着的兜底） ---------------- */
const sleepMin = ref(0)
const sleepLeft = ref(0)
let sleepTimer: ReturnType<typeof setInterval> | null = null
function setSleep(m: number) {
  if (sleepTimer) {
    clearInterval(sleepTimer)
    sleepTimer = null
  }
  sleepMin.value = m
  sleepLeft.value = m * 60
  if (!m) return
  sleepTimer = setInterval(() => {
    sleepLeft.value -= 1
    if (sleepLeft.value <= 0) {
      stop()
      sleepMin.value = 0
      sleepLeft.value = 0
      if (sleepTimer) {
        clearInterval(sleepTimer)
        sleepTimer = null
      }
      toast.info('定时到点，已停止播放')
    }
  }, 1000)
}
onBeforeUnmount(() => {
  if (sleepTimer) clearInterval(sleepTimer)
})
const sleepLabel = computed(() => {
  if (sleepLeft.value <= 0) return ''
  const m = Math.floor(sleepLeft.value / 60)
  const s = sleepLeft.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})
/** 模板里不能直接用 Math，预先算好分钟数 */
const curMinutes = computed(() => Math.max(1, Math.round(cur.value?.minutes || 0)))

/** 是否已经按深链定位过（只做一次，避免用户手动切频道时被拽回去） */
let located = false
/** 从讲义页「听本章」跳进来：把索引定位到那一篇（只定位，不自动出声） */
function locateFromQuery() {
  if (located) return
  const qid = String(route.query.id || '')
  if (!qid) {
    located = true
    return
  }
  // 链接只带了 id 没带 channel 时，从清单反查它属于哪个频道，
  // 否则会停在默认频道（心法第一组）里找不到这一篇
  if (!pieces.value.some((p) => p.id === qid)) {
    for (const ch of LISTEN_CHANNEL_IDS) {
      if (rowsByChannel.value[ch]?.some((r) => r.id === qid)) {
        channelId.value = ch
        break
      }
    }
  }
  const i = pieces.value.findIndex((p) => p.id === qid)
  if (i >= 0) {
    idx.value = i
    located = true
  }
}
watch(rowsByChannel, () => nextTick(locateFromQuery), { immediate: true })

function startPiece(i: number) {
  idx.value = Math.max(0, Math.min(i, pieces.value.length - 1))
  const p = cur.value
  if (!p) return
  saveLast()
  const onEnd = () => {
    if (autoNext.value && idx.value < pieces.value.length - 1) startPiece(idx.value + 1)
  }
  // 优先播放内置音频（预生成 mp3，离线可听，不消耗任何 Key）
  const url = audioMap.value[p.id]
  if (url) {
    speakFile(url, getPiece(p.id)?.script || '', onEnd)
    return
  }
  const sp = getPiece(p.id)
  // 课程精听频道只有清单没有正文稿：音频缺失说明资源没加载出来
  if (!sp) {
    toast.info('这一篇的音频还没加载出来，请检查网络后重试')
    return
  }
  // 环境不支持系统语音（App WebView）：不再静默无效，主动引导切在线语音
  if (!supported.value && ttsCfg.value.engine === 'system') {
    voiceOpen.value = true
    toast.info('当前环境不支持系统语音，请选择在线语音方案（填 API Key 即可）')
    return
  }
  speak(sp.script, onEnd)
}

function toggle() {
  if (speaking.value && !paused.value) pause()
  else if (paused.value) resume()
  else startPiece(idx.value)
}
function prev() { stop(); if (idx.value > 0) startPiece(idx.value - 1) }
function next() { stop(); if (idx.value < pieces.value.length - 1) startPiece(idx.value + 1) }

function switchChannel(id: string) {
  stop()
  channelId.value = id
  idx.value = 0
  // 切频道不自动播放——避免手机上突然外放，统一由用户点播放
}

function onRate(e: Event) {
  rate.value = Number((e.target as HTMLSelectElement).value)
  // 内置音频由 useSpeech watch 实时生效；TTS 引擎需重起当前篇
  if (speaking.value && !audioMap.value[cur.value?.id || '']) startPiece(idx.value)
}

/** 内置音频时间格式化 mm:ss */
function fmt(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const progress = computed(() => (pieces.value.length ? ((idx.value + 1) / pieces.value.length) * 100 : 0))

/* ---------------- 语音方案设置（与全站共用） ---------------- */
const voiceOpen = ref(false)
const curPreset = computed(() => ttsPresets.find((p) => p.id === ttsCfg.value.presetId))

// 面板展开时滚到可见（尤其播放键自动展开的场景，手机上面板在首屏外）
watch(voiceOpen, async (v) => {
  if (!v) return
  await nextTick()
  document.getElementById('voice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

// 语音错误即时反馈：App 上提示区在页面顶部容易看不到，同步弹 Toast；
// 面板开着时顺带把面板滚回可见（后续点击可能滚走了页面）
watch(apiErr, (v) => {
  if (!v) return
  toast.error(v)
  if (voiceOpen.value) {
    nextTick(() => document.getElementById('voice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
})

function pickPreset(p: TtsPreset) {
  ttsCfg.value.presetId = p.id
  ttsCfg.value.baseUrl = p.baseUrl
  ttsCfg.value.model = p.model
  if (p.voices.length) ttsCfg.value.apiVoice = p.voices[0].id
  ttsCfg.value.engine = 'api'
  saveTtsCfg()
  if (p.needKey && !ttsCfg.value.apiKey) {
    toast.info(`已选「${p.label.split('（')[0]}」：请在下方填入 API Key 后点试听`)
  } else {
    toast.success(`已切换到「${p.label.split('（')[0]}」，点试听试试效果`)
  }
}
function useSystem() {
  ttsCfg.value.engine = 'system'
  saveTtsCfg()
  if (!supported.value) {
    toast.error('当前环境（App 内）不支持系统语音，建议选择在线语音方案')
    return
  }
  toast.success('已切换到系统语音（离线）')
  if (speaking.value) startPiece(idx.value)
}
function pickApiVoice(e: Event) {
  ttsCfg.value.apiVoice = (e.target as HTMLSelectElement).value
  saveTtsCfg()
  if (speaking.value) startPiece(idx.value)
}
function pickSysVoice(e: Event) {
  ttsCfg.value.voiceURI = (e.target as HTMLSelectElement).value
  saveTtsCfg()
  if (speaking.value) startPiece(idx.value)
}
function trial() {
  stop()
  speak('你好，我是你的嵌入式听学伙伴。这一句用来试听当前语音方案的效果。')
}

// 从别的页面带着 ?channel=&id= 再次进入时，组件可能被复用，
// 这里重置定位标记并重新按新参数定位
watch(
  () => route.query.id,
  () => {
    located = false
    nextTick(locateFromQuery)
  },
)
watch(
  () => route.query.channel,
  (v) => {
    if (v && v !== channelId.value) switchChannel(String(v))
  },
)

onMounted(() => {
  // 不自动播放——进页面突然出声是打扰，由用户主动点击播放
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
    <header class="mb-6 flex flex-col items-center text-center">
      <h1 class="text-2xl font-bold text-ink-900">冥想听学</h1>
      <p class="mt-1.5 text-sm text-ink-500">专属口语稿 · 引导式讲解——与正文学习互补的第二种知识传输</p>
      <button
        class="btn mt-3 border-slate-200 bg-white px-3 py-1.5 text-xs text-ink-500 hover:border-brand-300"
        @click="voiceOpen = !voiceOpen"
      >
        <AppIcon name="zap" :size="13" />
        语音方案：{{ ttsCfg.engine === 'system' ? '系统语音' : (curPreset?.label.split('·')[0] || '在线语音') }}
        <span class="ml-1 rounded-full bg-brand-50 px-1.5 text-[10px] text-brand-600">可切换</span>
      </button>
    </header>

    <div v-if="apiErr" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800" style="background: #fffbeb">
      {{ apiErr }}
    </div>

    <!-- 环境不支持系统语音（如 App WebView）：明确告知并引导，而不是静默无效 -->
    <div v-if="!supported && ttsCfg.engine === 'system'" class="mb-4 rounded-xl border border-amber-200 px-4 py-3 text-xs text-amber-800" style="background: #fffbeb">
      <div class="flex flex-wrap items-center gap-2">
        <span class="flex-1">当前环境不支持系统语音（App 内置浏览器内核限制）。切换到 <b>在线语音</b>（填入 API Key 即可）即可正常听学。</span>
        <button class="btn shrink-0 border-amber-400 bg-amber-500 px-3 py-1.5 text-[11px] text-white hover:bg-amber-600" @click="voiceOpen = true">去设置</button>
      </div>
    </div>

    <!-- 继续上次：断点续听 -->
    <button
      v-if="lastRef && lastRef.title"
      class="mb-4 flex w-full items-center gap-3 rounded-xl border border-violet-200 px-4 py-2.5 text-left transition hover:bg-violet-50"
      style="background: rgba(245, 243, 255, 0.7)"
      @click="resumeLast"
    >
      <AppIcon name="play" :size="14" class="shrink-0 text-violet-600" />
      <span class="min-w-0 flex-1">
        <span class="block text-[11px] text-violet-500">继续上次</span>
        <span class="block truncate text-[13px] font-semibold text-ink-800">{{ lastRef.title }}</span>
      </span>
      <AppIcon name="chevron-right" :size="14" class="shrink-0 text-violet-400" />
    </button>

    <!-- 频道选择：心法 -->
    <p class="mb-2 text-[11px] font-bold tracking-wider text-ink-400">心法 · 慢下来听</p>
    <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="ch in meditateChannels"
        :key="ch.id"
        class="card p-3 text-left transition hover:-translate-y-0.5"
        :class="channelId === ch.id ? 'border-violet-300 ring-1 ring-violet-200' : ''"
        @click="switchChannel(ch.id)"
      >
        <p class="text-[13px] font-bold text-ink-900">{{ ch.title }}</p>
        <p class="mt-0.5 text-[11px] leading-snug text-ink-400">{{ ch.desc }}</p>
        <p class="mt-1 text-[10px] text-violet-500">{{ countOf(ch.id) }} 篇<span v-if="hoursOf(ch.id)"> · {{ hoursOf(ch.id) }}</span></p>
      </button>
    </div>

    <!-- 频道选择：课程精听 -->
    <p class="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wider text-ink-400">
      课程精听 · 闭眼过一遍
      <span v-if="listState === 'loading'" class="font-normal text-ink-300">加载中…</span>
      <span v-else-if="listState === 'fail'" class="font-normal text-rose-400">清单加载失败，请检查网络</span>
    </p>
    <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="ch in listenChannels"
        :key="ch.id"
        class="card p-3 text-left transition hover:-translate-y-0.5"
        :class="channelId === ch.id ? 'border-violet-300 ring-1 ring-violet-200' : ''"
        @click="switchChannel(ch.id)"
      >
        <p class="text-[13px] font-bold text-ink-900">{{ ch.title }}</p>
        <p class="mt-0.5 text-[11px] leading-snug text-ink-400">{{ ch.desc }}</p>
        <p class="mt-1 text-[10px] text-violet-500">{{ countOf(ch.id) }} 篇<span v-if="hoursOf(ch.id)"> · {{ hoursOf(ch.id) }}</span></p>
      </button>
    </div>

    <!-- 播放器 -->
    <div class="anim-panel rounded-2xl border border-slate-200 bg-white p-6 text-center" style="background: #fff">
      <p class="text-xs text-ink-400">
        {{ channel?.title }}
        <span v-if="cur?.sub"> · {{ cur.sub }}</span>
        <span v-if="cur?.minutes"> · {{ curMinutes }} 分钟</span>
      </p>
      <h2 class="mt-1 text-xl font-bold text-ink-900">{{ cur?.title || '—' }}</h2>
      <p class="mt-1 text-xs text-ink-400">第 {{ idx + 1 }} / {{ pieces.length }} 篇</p>

      <div class="mx-auto mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
        <div class="h-full rounded-full bg-gradient-to-r from-violet-500 to-brand-500 transition-all duration-500" :style="{ width: progress + '%' }" />
      </div>

      <!-- 真实播放进度（内置音频模式） -->
      <div v-if="audioProgress >= 0" class="mx-auto mt-3 w-full max-w-sm">
        <div class="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-violet-500" :style="{ width: (audioProgress * 100).toFixed(1) + '%' }" />
        </div>
        <div class="mt-1 flex justify-between font-mono text-[10px] text-ink-400">
          <span>{{ fmt(audioTime.cur) }}</span>
          <span>{{ fmt(audioTime.total) }}</span>
        </div>
      </div>

      <p v-if="audioMap[cur?.id || '']" class="mt-2 text-[10px] text-violet-400">内置神经音色 · 零配置离线可听</p>

      <div class="mt-6 flex items-center justify-center gap-4">
        <button class="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-ink-500 hover:border-violet-300" :disabled="idx <= 0" @click="prev">
          <AppIcon name="chevron-right" :size="16" class="rotate-180" />
        </button>
        <button
          class="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-brand-500 text-white shadow-lift transition hover:scale-105"
          @click="toggle"
        >
          <span v-if="speaking && !paused" class="text-xl font-bold">‖</span>
          <span v-else class="ml-1 text-xl">▶</span>
        </button>
        <button class="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-ink-500 hover:border-violet-300" :disabled="idx >= pieces.length - 1" @click="next">
          <AppIcon name="chevron-right" :size="16" />
        </button>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-ink-400">
        <label class="flex items-center gap-1.5">
          倍速
          <select :value="rate" class="rounded-lg border border-slate-200 px-2 py-1 text-xs" @change="onRate">
            <option :value="0.8">0.8x</option>
            <option :value="1.0">1.0x</option>
            <option :value="1.2">1.2x</option>
            <option :value="1.5">1.5x</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="autoNext" type="checkbox" class="accent-violet-600" /> 自动连播
        </label>
        <label class="flex items-center gap-1.5">
          定时停止
          <select :value="sleepMin" class="rounded-lg border border-slate-200 px-2 py-1 text-xs" @change="setSleep(Number(($event.target as HTMLSelectElement).value))">
            <option :value="0">关闭</option>
            <option :value="15">15 分钟</option>
            <option :value="30">30 分钟</option>
            <option :value="45">45 分钟</option>
            <option :value="60">60 分钟</option>
          </select>
          <span v-if="sleepLabel" class="font-mono text-[10px] text-violet-500">{{ sleepLabel }}</span>
        </label>
      </div>
    </div>

    <!-- 篇目清单 -->
    <div class="mt-5 space-y-1.5">
      <button
        v-for="(p, i) in pieces"
        :key="p.id"
        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition"
        :class="i === idx ? 'bg-violet-50 text-violet-700' : 'text-ink-500 hover:bg-slate-50'"
        @click="stop(); startPiece(i)"
      >
        <span class="font-mono opacity-50">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate">{{ p.title }}</span>
          <span v-if="p.sub" class="block truncate text-[10px] opacity-60">{{ p.sub }}</span>
        </span>
        <span class="shrink-0 font-mono text-[10px] opacity-50">{{ (p.minutes || 0).toFixed(0) }}′</span>
        <AppIcon v-if="i === idx && speaking" name="zap" :size="12" class="shrink-0 text-violet-500" />
      </button>
      <p v-if="!pieces.length && listState === 'ok'" class="py-6 text-center text-xs text-ink-400">这个频道还没有内容</p>
      <p v-if="listState === 'loading'" class="py-6 text-center text-xs text-ink-400">正在加载篇目…</p>
    </div>

    <!-- 语音方案设置弹层 -->
    <div v-if="voiceOpen" id="voice-panel" class="anim-panel mt-5 rounded-2xl border border-slate-200 bg-white p-5" style="background: #fff">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-bold text-ink-900">语音方案</h3>
        <button class="text-xs text-ink-400 hover:text-ink-700" @click="voiceOpen = false">收起</button>
      </div>
      <!-- 错误就近显示：面板内再渲染一份，手机上不用滚回顶部看原因 -->
      <div v-if="apiErr" class="mb-3 rounded-lg border border-amber-200 px-3 py-2 text-[11px] leading-relaxed text-amber-800" style="background: #fffbeb">
        {{ apiErr }}
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn px-3 py-1.5 text-xs"
          :class="ttsCfg.engine === 'system' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="useSystem"
        >A · 系统语音（离线）</button>
        <button
          v-for="p in ttsPresets"
          :key="p.id"
          class="btn px-3 py-1.5 text-xs"
          :class="ttsCfg.engine === 'api' && ttsCfg.presetId === p.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="pickPreset(p)"
        >B · {{ p.label }}</button>
      </div>
      <div v-if="ttsCfg.engine === 'system'" class="mt-4 space-y-3">
        <label class="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          中文音色
          <select :value="ttsCfg.voiceURI" class="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" @change="pickSysVoice">
            <option v-for="v in sysVoices" :key="v.voiceURI" :value="v.voiceURI">{{ v.name }}（{{ v.lang }}）</option>
          </select>
        </label>
        <p v-if="!sysVoices.length" class="text-xs text-amber-600">设备暂未列出中文音色，部分浏览器需先触发一次朗读才会加载。</p>
      </div>
      <div v-else class="mt-4 space-y-3">
        <p v-if="curPreset?.note" class="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-ink-400">{{ curPreset.note }}</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <input v-model="ttsCfg.baseUrl" @change="saveTtsCfg" class="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" placeholder="Base URL（含 /v1）" />
          <input v-model="ttsCfg.model" @change="saveTtsCfg" class="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" placeholder="模型名" />
        </div>
        <input v-model="ttsCfg.apiKey" @change="saveTtsCfg" type="password" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" placeholder="API Key（仅存本机）" />
        <label v-if="curPreset?.voices.length" class="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          音色
          <select :value="ttsCfg.apiVoice" class="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" @change="pickApiVoice">
            <option v-for="v in curPreset.voices" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </label>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button class="btn border-brand-600 bg-brand-600 px-4 py-1.5 text-xs text-white hover:bg-brand-700" @click="trial">▶ 试听当前方案</button>
        <span class="text-[11px] text-ink-400">方案全站记忆，学习页听学按钮共用</span>
      </div>
    </div>
  </div>
</template>
