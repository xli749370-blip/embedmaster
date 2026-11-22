<script setup lang="ts">
/**
 * AI 答疑 —— 接入自选大模型（在线 API 或本地 Ollama）
 * - OpenAI 兼容协议：DeepSeek / 通义 / Kimi / GLM / Ollama / 自定义
 * - 流式输出；内置嵌入式导师系统提示词；可一键注入错题本上下文
 */
import { computed, nextTick, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { readStore, writeStore } from '@/utils/storage'

/* ---------------- Provider 配置 ---------------- */
interface AiConfig {
  preset: string
  baseUrl: string
  apiKey: string
  model: string
}

const PRESETS: { id: string; label: string; baseUrl: string; model: string; needKey: boolean; hint: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', needKey: true, hint: 'platform.deepseek.com 申请 key' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', needKey: true, hint: '阿里云百炼控制台申请' },
  { id: 'moonshot', label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', needKey: true, hint: 'platform.moonshot.cn 申请' },
  { id: 'glm', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', needKey: true, hint: 'open.bigmodel.cn，有免费档' },
  { id: 'ollama', label: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', needKey: false, hint: '本机已装 Ollama（ollama pull 模型后用）' },
  { id: 'custom', label: '自定义 OpenAI 兼容', baseUrl: '', model: '', needKey: true, hint: '任何兼容 /chat/completions 的服务' },
]

const cfg = ref<AiConfig>(readStore<AiConfig>('ai_config', { preset: 'deepseek', baseUrl: PRESETS[0].baseUrl, apiKey: '', model: PRESETS[0].model }))
const cfgOpen = ref(false)

function pickPreset(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  cfg.value = { ...cfg.value, preset: id, baseUrl: p.baseUrl, model: p.model }
  saveCfg()
}
function saveCfg() {
  writeStore('ai_config', cfg.value)
}
const currentPreset = computed(() => PRESETS.find((p) => p.id === cfg.value.preset)!)
const ready = computed(() => !!cfg.value.baseUrl && !!cfg.value.model && (!currentPreset.value.needKey || !!cfg.value.apiKey))

/* ---------------- 对话 ---------------- */
interface Msg { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `你是 EmbedMaster 嵌入式学习平台的 AI 答疑导师「小U」。
学生正在学习：嵌入式 C 语言、计算机底层原理、STM32(HAL)/ESP32(ESP-IDF)、电路分析、传感器驱动、FreeRTOS、通信协议、控制算法。
回答规则：
1. 用简体中文，先给结论再展开；代码优先 STM32 HAL / ESP-IDF 真实可编译写法
2. 涉及概念时给「一句话本质 + 一个最小例子 + 常见坑」
3. 学生提问超出嵌入式范围时，简短回答并引导回主线
4. 学生贴出报错/代码时，先定位问题层（硬件/驱动/逻辑），再给修复方案`

const msgs = ref<Msg[]>([])
const input = ref('')
const busy = ref(false)
const err = ref('')
const listEl = ref<HTMLElement | null>(null)

async function scrollBottom() {
  await nextTick()
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
}

/** 从错题本构建上下文（让学生问「我的错题」时 AI 有据可依） */
function injectWrongbook() {
  const wb = readStore<Record<string, Record<string, { title: string; dim: string; wrongCount: number; stage: number }>>>('wrongbook', {})
  const all = Object.values(wb['u-local'] || {})
  if (!all.length) {
    err.value = '错题本是空的，先去刷题/电路训练里攒错题'
    return
  }
  const top = all.sort((a, b) => b.wrongCount - a.wrongCount).slice(0, 10)
  const digest = top.map((e, i) => `${i + 1}. [${e.dim}] ${e.title}（错 ${e.wrongCount} 次）`).join('\n')
  msgs.value.push({ role: 'user', content: `这是我的错题本高频错题摘要，请帮我分析知识漏洞并给复习建议：\n${digest}` })
  save()
  send()
}

function stopGen() {
  if (aborter) aborter.abort()
}

let aborter: AbortController | null = null

async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  err.value = ''
  if (!ready.value) {
    cfgOpen.value = true
    err.value = '先配置 AI 服务（填 Base URL / API Key / 模型名）'
    return
  }
  msgs.value.push({ role: 'user', content: text })
  input.value = ''
  save()
  await chat()
}

async function chat() {
  busy.value = true
  const reply = ref('')
  msgs.value.push({ role: 'assistant', content: '' })
  const mi = msgs.value.length - 1
  scrollBottom()

  aborter = new AbortController()
  try {
    const res = await fetch(`${cfg.value.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: aborter.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(currentPreset.value.needKey && cfg.value.apiKey ? { Authorization: `Bearer ${cfg.value.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.value.model,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...msgs.value.slice(0, -1).slice(-12)],
      }),
    })
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${t.slice(0, 160)}`)
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const s = line.trim()
        if (!s.startsWith('data:')) continue
        const payload = s.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const j = JSON.parse(payload)
          const delta = j.choices?.[0]?.delta?.content || ''
          if (delta) {
            reply.value += delta
            msgs.value[mi].content = reply.value
            scrollBottom()
          }
        } catch {
          /* 忽略非 JSON 行 */
        }
      }
    }
    if (!reply.value) msgs.value[mi].content = '（服务返回了空回复，检查模型名是否正确）'
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e)
    if (!m.includes('abort')) {
      msgs.value[mi].content = msgs.value[mi].content || ''
      err.value = `请求失败：${m}。排查：① Base URL 是否含 /v1 ② Key 是否有效 ③ 模型名是否存在 ④ 本地 Ollama 需先 ollama serve`
    }
  } finally {
    busy.value = false
    aborter = null
    save()
    scrollBottom()
  }
}

/** 会话持久化（轻量：最近 40 条） */
function save() {
  writeStore('ai_chat', msgs.value.slice(-40))
}
msgs.value = readStore<Msg[]>('ai_chat', []).slice(-40)

const QUICK = [
  '用一句话讲清 volatile，再举一个会出事的反例',
  'STM32 串口 DMA+空闲中断接收怎么配？给完整步骤',
  '我的 PID 一直震荡，按什么顺序排查？',
  'ESP32 和 STM32 该先学哪个？给学习路线建议',
  '解释 HardFault 的定位三板斧',
  'I2C 读不到设备，按什么顺序排查？',
]

const totalCount = computed(() => msgs.value.filter((m) => m.role === 'user').length)
</script>

<template>
  <div class="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-ink-900">AI 答疑</h1>
        <p class="mt-1 text-sm text-ink-500">接入你自己的大模型（在线 API / 本地 Ollama），嵌入式问题随问随答</p>
      </div>
      <button class="btn border-slate-200 bg-white px-3 py-2 text-xs text-ink-500 hover:border-brand-300" @click="cfgOpen = !cfgOpen">
        <AppIcon name="cpu" :size="13" /> {{ cfgOpen ? '收起设置' : '服务设置' }}
        <span v-if="ready" class="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
        <span v-else class="ml-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
      </button>
    </header>

    <!-- 配置面板 -->
    <div v-if="cfgOpen" class="anim-panel mb-4 rounded-2xl border border-slate-200 bg-white p-4" style="background: #fff">
      <div class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          class="btn px-3 py-1.5 text-xs"
          :class="cfg.preset === p.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-ink-400'"
          @click="pickPreset(p.id)"
        >{{ p.label }}</button>
      </div>
      <div class="grid gap-2 sm:grid-cols-3">
        <input v-model="cfg.baseUrl" @change="saveCfg" class="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" placeholder="Base URL（含 /v1）" />
        <input v-model="cfg.model" @change="saveCfg" class="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" placeholder="模型名" />
        <input v-model="cfg.apiKey" @change="saveCfg" type="password" class="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" :placeholder="currentPreset.needKey ? 'API Key（仅存本机）' : '本地模型无需 Key'" />
      </div>
      <p class="mt-2 text-[11px] text-ink-400">{{ currentPreset.hint }} · Key 只保存在浏览器 localStorage，请求直达所选服务商，不经过任何中转</p>
    </div>

    <!-- 消息区 -->
    <div ref="listEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div v-if="!msgs.length" class="py-10 text-center">
        <p class="text-sm text-ink-400">还没有对话。先完成服务设置，然后试试这些：</p>
        <div class="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-2">
          <button v-for="q in QUICK" :key="q" class="btn border-slate-200 bg-white px-3 py-1.5 text-[11px] text-ink-500 hover:border-brand-300 hover:text-brand-700" @click="input = q; send()">
            {{ q }}
          </button>
        </div>
      </div>
      <div v-for="(m, i) in msgs" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
        <div
          class="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed"
          :class="m.role === 'user' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-ink-700'"
        >{{ m.content }}<span v-if="busy && i === msgs.length - 1 && m.role === 'assistant'" class="ml-1 inline-block h-3 w-1.5 animate-pulse bg-brand-400 align-middle" /></div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="err" class="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" style="background: #fef2f2">{{ err }}</div>

    <!-- 输入区 -->
    <div class="mt-3 flex items-end gap-2">
      <button class="btn shrink-0 border-slate-200 bg-white px-3 py-2.5 text-xs text-ink-500 hover:border-brand-300" title="把错题本高频错题发给 AI 分析" @click="injectWrongbook">
        错题本分析
      </button>
      <textarea
        v-model="input"
        rows="1"
        class="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500"
        placeholder="输入问题，Enter 发送（Shift+Enter 换行）"
        @keydown.enter.exact.prevent="send"
      />
      <button v-if="busy" class="btn shrink-0 border-slate-200 bg-white px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50" @click="stopGen">停止</button>
      <button v-else class="btn btn-primary shrink-0 px-4 py-2.5 text-xs" :disabled="!input.trim()" @click="send">发送</button>
    </div>
    <p class="mt-1.5 text-center text-[10px] text-ink-300">已接入 {{ ready ? cfg.model : '未配置' }} · 累计提问 {{ totalCount }} 次</p>
  </div>
</template>
