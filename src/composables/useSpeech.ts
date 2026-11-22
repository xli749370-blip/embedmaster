/**
 * useSpeech —— 听学语音引擎 v2（三版可选）
 *
 * 版本 A「system」：Web Speech API 系统语音（离线零流量），支持音色选择 + 语速/音调
 * 版本 B「api」  ：OpenAI 兼容 TTS 接口（预置硅基流动 CosyVoice2 / OpenAI TTS / 自定义），
 *                  逐段合成 mp3 → <audio> 播放，带内存缓存与失败自动回退系统语音
 *
 * 配置持久化 localStorage（embedmaster:tts_config）
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { readStore, writeStore } from '@/utils/storage'

export interface SpeakTask {
  text: string
  onend?: () => void
}

/* ---------------- TTS 服务预置 ---------------- */
export interface TtsPreset {
  id: string
  label: string
  baseUrl: string
  model: string
  needKey: boolean
  voices: { id: string; label: string }[]
  note?: string
}

export const TTS_PRESETS: TtsPreset[] = [
  {
    id: 'siliconflow',
    label: '硅基流动 · CosyVoice2（有免费额度）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    needKey: true,
    voices: [
      { id: 'FunAudioLLM/CosyVoice2-0.5B:anna', label: 'Anna · 女声温柔' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:bella', label: 'Bella · 女声热情' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:claire', label: 'Claire · 女声知性' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:diana', label: 'Diana · 女声沉稳' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:alex', label: 'Alex · 男声清爽' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:benjamin', label: 'Benjamin · 男声磁性' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:charles', label: 'Charles · 男声浑厚' },
      { id: 'FunAudioLLM/CosyVoice2-0.5B:david', label: 'David · 男声活力' },
    ],
    note: 'siliconflow.cn 注册即送额度，免费模型可用',
  },
  {
    id: 'openai',
    label: 'OpenAI TTS（官方付费）',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    needKey: true,
    voices: [
      { id: 'nova', label: 'Nova · 女声明亮' },
      { id: 'shimmer', label: 'Shimmer · 女声柔和' },
      { id: 'coral', label: 'Coral · 女声自然' },
      { id: 'sage', label: 'Sage · 女声沉稳' },
      { id: 'alloy', label: 'Alloy · 中性平衡' },
      { id: 'echo', label: 'Echo · 男声沉稳' },
      { id: 'fable', label: 'Fable · 男声叙事' },
      { id: 'onyx', label: 'Onyx · 男声浑厚' },
    ],
    note: 'OpenAI 官方接口不允许浏览器直连（CORS 限制），Web 端大概率失败；建议优先用硅基流动或自建兼容端点',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容 /v1/audio/speech）',
    baseUrl: '',
    model: '',
    needKey: true,
    voices: [],
  },
]

/* ---------------- 配置持久化 ---------------- */
export interface TtsConfig {
  engine: 'system' | 'api'
  /** 系统 TTS 音色 voiceURI */
  voiceURI: string
  /** API 音色 */
  apiVoice: string
  presetId: string
  baseUrl: string
  apiKey: string
  model: string
  pitch: number
}

const DEFAULT_CFG: TtsConfig = {
  engine: 'system',
  voiceURI: '',
  apiVoice: 'FunAudioLLM/CosyVoice2-0.5B:anna',
  presetId: 'siliconflow',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  model: 'FunAudioLLM/CosyVoice2-0.5B',
  pitch: 1.0,
}

export const ttsCfg = ref<TtsConfig>({ ...DEFAULT_CFG, ...(readStore('tts_config', {} as Partial<TtsConfig>) || {}) })

export function saveTtsCfg() {
  writeStore('tts_config', ttsCfg.value)
}

/* ---------------- 状态 ---------------- */
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

const speaking = ref(false)
const paused = ref(false)
const rate = ref(1.0)          // 0.5 ~ 2.0
const currentTask = ref<SpeakTask | null>(null)
const apiErr = ref('')         // 在线合成失败信息（空=正常）
const sysVoices = ref<SpeechSynthesisVoice[]>([])

let systemVoice: SpeechSynthesisVoice | null = null
/** 播放会话令牌：每次 speak 递增；旧回调对不上令牌即作废（防止 stop/切频道后被旧 onend 打断） */
let speakSeq = 0
/** 当前 API 播放的 audio 元素与队列游标 */
let apiAudio: HTMLAudioElement | null = null
/** 合成结果内存缓存：key = model|voice|rate|text → blobUrl */
const blobCache = new Map<string, string>()

/* ---------------- 系统 TTS ---------------- */
function refreshVoices() {
  if (!supported) return
  sysVoices.value = window.speechSynthesis.getVoices().filter((v) => /^zh/i.test(v.lang) || /chinese|中文|普通话/i.test(v.name))
}

function pickSystemVoice(): SpeechSynthesisVoice | null {
  if (!supported) return null
  if (ttsCfg.value.voiceURI) {
    const hit = window.speechSynthesis.getVoices().find((v) => v.voiceURI === ttsCfg.value.voiceURI)
    if (hit) return hit
  }
  const all = window.speechSynthesis.getVoices()
  return (
    all.find((v) => /zh[-_]CN/i.test(v.lang) && /xiaoxiao|yunxi|female|女/i.test(v.name)) ||
    all.find((v) => /^zh/i.test(v.lang)) ||
    all[0] ||
    null
  )
}

function ensureVoice() {
  if (!systemVoice) systemVoice = pickSystemVoice()
}

if (supported) {
  // voices 列表异步加载，监听就绪
  window.speechSynthesis.onvoiceschanged = refreshVoices
  refreshVoices()
}

function sysStop() {
  if (!supported) return
  window.speechSynthesis.cancel()
}

function sysSpeak(text: string, onend?: () => void) {
  if (!supported) {
    // App WebView 等环境无 Web Speech API：明确报错并停在原地，
    // 绝不能调 onend —— 否则冥想的自动连播会把整册逐篇静默空转一遍
    apiErr.value = '当前环境不支持系统语音（App 内核限制），请点开「语音方案」切换到在线语音'
    return
  }
  sysStop()
  ensureVoice()
  const mySeq = ++speakSeq
  const u = new SpeechSynthesisUtterance(text)
  if (systemVoice) u.voice = systemVoice
  u.lang = 'zh-CN'
  u.rate = rate.value
  u.pitch = ttsCfg.value.pitch || 1.0
  const done = () => {
    speaking.value = false
    paused.value = false
    if (speakSeq === mySeq) onend?.()
  }
  u.onend = done
  u.onerror = done
  currentTask.value = { text, onend }
  speaking.value = true
  window.speechSynthesis.speak(u)
}

/* ---------------- 在线 TTS（OpenAI 兼容） ---------------- */
function cfgReady(): boolean {
  const c = ttsCfg.value
  return !!(c.baseUrl && c.model && c.apiVoice && (!TTS_PRESETS.find((p) => p.id === c.presetId)?.needKey || c.apiKey))
}

/** 长文按句切块（TTS 单次输入有长度上限） */
function chunkText(text: string, max = 900): string[] {
  if (text.length <= max) return [text]
  const sentences = text.split(/(?<=[。！？；.!?;])/)
  const chunks: string[] = []
  let buf = ''
  for (const s of sentences) {
    if ((buf + s).length > max && buf) {
      chunks.push(buf)
      buf = s
    } else buf += s
  }
  if (buf) chunks.push(buf)
  return chunks
}

async function synthBlob(text: string): Promise<Blob> {
  const c = ttsCfg.value
  const key = `${c.model}|${c.apiVoice}|${rate.value}|${text}`
  const hit = blobCache.get(key)
  if (hit) return (await fetch(hit)).blob()
  const res = await fetch(`${c.baseUrl.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({ model: c.model, input: text, voice: c.apiVoice, response_format: 'mp3', speed: rate.value }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`TTS ${res.status} ${detail.slice(0, 120)}`)
  }
  const blob = await res.blob()
  if (blob.size < 200) throw new Error('TTS 返回内容异常')
  try {
    blobCache.set(key, URL.createObjectURL(blob))
  } catch { /* 缓存失败不影响播放 */ }
  return blob
}

/** API 队列播放：当前块播完接下一块，全部播完回调 onend */
function apiSpeak(text: string, onend?: () => void) {
  apiErr.value = ''
  if (!cfgReady()) {
    // App WebView 无系统语音可回退：不能再提示「已用系统语音」造成死循环
    if (!supported) {
      apiErr.value = '还差最后一步：请在下方「API Key」栏填入密钥（siliconflow.cn 注册免费领），填完点试听即可'
      return
    }
    apiErr.value = '在线语音未配置完整（缺 Key 或地址），已用系统语音'
    sysSpeak(text, onend)
    return
  }
  const chunks = chunkText(text)
  let i = 0
  currentTask.value = { text, onend }
  const mySeq = ++speakSeq
  speaking.value = true

  const playNext = async () => {
    if (speakSeq !== mySeq) return            // 会话已作废
    if (i >= chunks.length) {
      speaking.value = false
      paused.value = false
      onend?.()
      return
    }
    try {
      const blob = await synthBlob(chunks[i++])
      if (speakSeq !== mySeq) return          // 合成期间被 stop
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      apiAudio = audio
      audio.playbackRate = 1 // 语速已在合成端通过 speed 控制
      audio.onended = () => { URL.revokeObjectURL(url); void playNext() }
      audio.onerror = () => { URL.revokeObjectURL(url); void playNext() }
      await audio.play()
    } catch (e) {
      if (speakSeq !== mySeq) return
      // App WebView 无系统语音可回退：明确告知失败原因，停在原地
      if (!supported) {
        apiErr.value = `在线语音失败（${e instanceof Error ? e.message : e}）。请检查 API Key 是否有效、网络是否可用`
        speaking.value = false
        apiAudio = null
        return
      }
      apiErr.value = `在线语音失败（${e instanceof Error ? e.message : e}），已回退系统语音`
      speaking.value = false
      apiAudio = null
      sysSpeak(chunks.slice(Math.max(0, i - 1)).join(''), onend)
    }
  }
  void playNext()
}

function apiStop() {
  if (apiAudio) {
    apiAudio.pause()
    apiAudio.currentTime = 0
    apiAudio = null
  }
}

/* ---------------- 内置音频（预生成 mp3，开箱即用） ---------------- */
/** 当前内置音频的播放进度（0~1），无内置音频播放时为 -1 */
const audioProgress = ref(-1)
const audioTime = ref({ cur: 0, total: 0 })
let fileAudio: HTMLAudioElement | null = null

/**
 * 播放打包内置的冥想音频（神经音色预生成，零配置）。
 * 播放失败（文件缺失等）时回退到 TTS 引擎。
 */
function speakFile(url: string, fallbackText: string, onend?: () => void) {
  stop()
  const mySeq = ++speakSeq
  const audio = new Audio(url)
  fileAudio = audio
  audio.playbackRate = rate.value
  speaking.value = true
  paused.value = false
  audioProgress.value = 0
  audioTime.value = { cur: 0, total: 0 }

  audio.ontimeupdate = () => {
    if (speakSeq !== mySeq) return
    const total = Number.isFinite(audio.duration) ? audio.duration : 0
    audioTime.value = { cur: audio.currentTime, total }
    audioProgress.value = total > 0 ? audio.currentTime / total : 0
  }
  const finish = () => {
    if (speakSeq !== mySeq) return
    speaking.value = false
    paused.value = false
    audioProgress.value = -1
    fileAudio = null
    onend?.()
  }
  audio.onended = finish
  audio.oncanplay = () => {
    if (speakSeq === mySeq && Number.isFinite(audio.duration)) {
      audioTime.value = { cur: audioTime.value.cur, total: audio.duration }
    }
  }
  audio.onerror = () => {
    if (speakSeq !== mySeq) return
    // 内置音频不可用（如旧版本升级后缺文件）→ 回退 TTS
    fileAudio = null
    audioProgress.value = -1
    speak(fallbackText, onend)
  }
  void audio.play().catch(() => {
    if (speakSeq !== mySeq) return
    fileAudio = null
    audioProgress.value = -1
    speak(fallbackText, onend)
  })
}

/* ---------------- 统一接口 ---------------- */
function stop() {
  speakSeq++                                  // 作废所有在途回调
  currentTask.value = null
  if (fileAudio) {
    fileAudio.pause()
    fileAudio.onended = null
    fileAudio.ontimeupdate = null
    fileAudio.onerror = null
    fileAudio = null
  }
  fileAudio = null
  audioProgress.value = -1
  apiStop()
  sysStop()
  speaking.value = false
  paused.value = false
}

function speak(text: string, onend?: () => void) {
  stop()
  if (ttsCfg.value.engine === 'api') apiSpeak(text, onend)
  else sysSpeak(text, onend)
}

function pause() {
  if (!speaking.value || paused.value) return
  if (fileAudio) {
    fileAudio.pause()
    paused.value = true
  } else if (ttsCfg.value.engine === 'api' && apiAudio) {
    apiAudio.pause()
    paused.value = true
  } else if (supported) {
    window.speechSynthesis.pause()
    paused.value = true
  }
}

function resume() {
  if (!paused.value) return
  if (fileAudio) {
    void fileAudio.play()
    paused.value = false
  } else if (ttsCfg.value.engine === 'api' && apiAudio) {
    void apiAudio.play()
    paused.value = false
  } else if (supported) {
    window.speechSynthesis.resume()
    paused.value = false
  }
}

// 倍速变化时实时作用于内置音频（TTS 端在合成时已带语速）
watch(rate, (r) => {
  if (fileAudio) fileAudio.playbackRate = r
})

export function useSpeech() {
  onUnmounted(stop)
  return {
    supported: computed(() => supported),
    speaking,
    paused,
    rate,
    apiErr,
    sysVoices,
    ttsCfg,
    ttsPresets: TTS_PRESETS,
    speak,
    speakFile,
    stop,
    pause,
    resume,
    audioProgress,
    audioTime,
  }
}
