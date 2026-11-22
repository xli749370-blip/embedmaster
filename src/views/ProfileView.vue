<script setup lang="ts">
/** 个人中心：账号头像 / 成就中心 / 学习进度 / 收藏 / 错题本 / 答题历史 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import FrameRing from '@/components/FrameRing.vue'
import api, { type AnswerRecord, type Chapter, type ProgressItem, type Question } from '@/api'
import { chapters, questions as allQuestions, getCourseById } from '@/mock/data'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useAchievements } from '@/composables/useAchievements'
import { registerBackConsumer } from '@/utils/backHandler'
import {
  PRESET_AVATARS,
  FRAMES,
  frameById,
  frameTier,
  frameMaxTier,
  TIER_LABEL,
  tierOfAchievement,
  type AvatarFrame,
} from '@/mock/achievements'
import type { UserDataExport } from '@/api'

const route = useRoute()
const { user, isLogin, login, register, logout, updateNickname, updateAvatar, updateFrame } = useAuth()
const toast = useToast()
const { list: achvList, claimableCount, unlockedFrames, claim, refresh: refreshAchv } = useAchievements()

type TabKey = 'achv' | 'progress' | 'favorite' | 'wrong' | 'history'
const tab = ref<TabKey>('progress')
const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'achv', label: '成就中心', icon: 'trophy' },
  { key: 'progress', label: '学习进度', icon: 'chart' },
  { key: 'favorite', label: '我的收藏', icon: 'bookmark' },
  { key: 'wrong', label: '错题本', icon: 'target' },
  { key: 'history', label: '答题历史', icon: 'clock' },
]

/* 支持 /profile?tab=achv 直达（顶部下拉/底部导航跳转用） */
watch(
  () => route.query.tab,
  (t) => {
    if (t && tabs.some((x) => x.key === t)) tab.value = t as TabKey
  },
  { immediate: true },
)

const loading = ref(true)
const progress = ref<ProgressItem[]>([])
const favorites = ref<Chapter[]>([])
const wrongList = ref<Array<{ question: Question; record: AnswerRecord }>>([])
const history = ref<AnswerRecord[]>([])

/* ---------------- 账号表单 ---------------- */
const authMode = ref<'login' | 'register'>('login')
const form = reactive({ username: '', password: '', nickname: '' })
const submitting = ref(false)
const profileOpen = ref(false)
const nicknameInput = ref('')
const authOpen = ref(false)

async function loadAll() {
  loading.value = true
  const [p, f, w, h] = await Promise.all([
    api.getProgressList(),
    api.getFavoriteList(),
    api.getWrongQuestions(),
    api.getAnswerHistory(),
  ])
  progress.value = p.data
  favorites.value = f.data
  wrongList.value = w.data
  history.value = h.data
  loading.value = false
}

onMounted(() => {
  loadAll()
  refreshAchv()
})

/** 浮层返回键消费：返回键优先关闭打开中的弹窗 */
const unregisterBack = registerBackConsumer(() => {
  if (avatarOpen.value) {
    avatarOpen.value = false
    return true
  }
  if (profileOpen.value) {
    profileOpen.value = false
    return true
  }
  if (authOpen.value) {
    authOpen.value = false
    return true
  }
  return false
})
onUnmounted(unregisterBack)

/* ---------------- 统计 ---------------- */
const finishedCount = computed(() => progress.value.filter((p) => p.is_finished === 1).length)
const answeredTotal = computed(() => history.value.length)
const correctTotal = computed(() => history.value.filter((h) => h.is_correct === 1).length)
const accuracy = computed(() => (answeredTotal.value ? Math.round((correctTotal.value / answeredTotal.value) * 100) : 0))

const stats = computed(() => [
  { label: '已学完章节', value: finishedCount.value, total: chapters.length, icon: 'book', tone: 'text-brand-600 bg-brand-50' },
  { label: '累计答题', value: answeredTotal.value, total: null, icon: 'quiz', tone: 'text-violet-600 bg-violet-50' },
  { label: '答题正确率', value: accuracy.value, suffix: '%', total: null, icon: 'target', tone: 'text-emerald-600 bg-emerald-50' },
  { label: '错题待巩固', value: wrongList.value.length, total: null, icon: 'flag', tone: 'text-amber-600 bg-amber-50' },
])

const chapterName = (id: number) => chapters.find((c) => c.id === id)?.chapter_name ?? '未知章节'
const courseName = (chapterId: number) => {
  const c = chapters.find((x) => x.id === chapterId)
  return c ? getCourseById(c.course_id)?.course_name ?? '' : ''
}

/* ---------------- 账号操作 ---------------- */
async function doAuth() {
  if (submitting.value) return
  submitting.value = true
  try {
    const res =
      authMode.value === 'login'
        ? await login(form.username, form.password)
        : await register(form.username, form.password, form.nickname)
    if (res.code === 200) {
      toast.success(res.message)
      form.username = ''
      form.password = ''
      form.nickname = ''
      await loadAll()
    } else {
      toast.error(res.message)
    }
  } finally {
    submitting.value = false
  }
}

async function doLogout() {
  await logout()
  toast.info('已退出，进度数据保留在本地')
  // 重新注入演示会话，保证页面可用
  api.ensureDemoSession()
  await loadAll()
}

function openProfileEdit() {
  nicknameInput.value = user.value?.nickname ?? ''
  profileOpen.value = true
}

/* ---------------- 头像与头像框 ---------------- */
const avatarOpen = ref(false)
const avatarFileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const presets = PRESET_AVATARS

function openAvatarPicker() {
  if (!isLogin.value) return toast.info('请先登录后再设置头像')
  avatarOpen.value = true
}

/** 系统预设：一键佩戴 */
async function pickPreset(id: string) {
  const res = await updateAvatar(`preset:${id}`)
  if (res.code === 200) toast.success('头像已更新')
}

/** 从相册选择（App/移动端 file input 拉起相册或相机）并压缩到 256px */
function pickAlbum() {
  avatarFileInput.value?.click()
}

async function onAvatarFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return toast.error('请选择图片文件')
  if (file.size > 15 * 1024 * 1024) return toast.error('图片过大（>15MB），请换一张')
  uploading.value = true
  try {
    const dataUrl = await compressImage(file, 256, 0.85)
    const res = await updateAvatar(dataUrl)
    if (res.code === 200) toast.success('自定义头像已设置')
    else toast.error(res.message)
  } catch {
    toast.error('图片处理失败，请换一张试试')
  } finally {
    uploading.value = false
  }
}

/** 图片压缩：等比 cover 裁剪成方形，输出 JPEG dataURL（~20-60KB，localStorage 可承受） */
function compressImage(file: File, size: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        // cover 裁剪：取中间方形
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}

/** 佩戴头像框（衣柜只显示已解锁的） */
const wardrobe = computed<AvatarFrame[]>(() => FRAMES.filter((f) => unlockedFrames.value.has(f.id)))
const lockedFrames = computed<AvatarFrame[]>(() => FRAMES.filter((f) => !unlockedFrames.value.has(f.id)))
const claimedIds = computed(() => achvList.value.filter((a) => a.claimed).map((a) => a.id))

/** 某框当前阶数（0 = 未解锁） */
const tierOf = (fid: string) => (fid === 'none' ? 0 : frameTier(fid, claimedIds.value))

/** 框名 + 阶标记，如「鎏金环 Ⅱ」 */
function frameTitle(fid: string): string {
  const t = tierOf(fid)
  return t > 1 ? `${frameById(fid).name} ${TIER_LABEL[Math.min(t, 3) - 1]}` : frameById(fid).name
}

/** 衣柜卡片下的阶数提示 */
function tierHint(fid: string): string {
  const t = tierOf(fid)
  const max = frameMaxTier(fid)
  if (t <= 0) return '未解锁'
  if (t >= max) return '已满阶'
  return `再 1 项升 ${TIER_LABEL[Math.min(t + 1, 3) - 1]}`
}

/** 该成就固定占据对应框的第几阶（成就固有属性，与是否领取无关） */
const achvTier = (id: string) => tierOfAchievement(id)

/** 该框由哪些成就激活 —— 一个框可能挂多项成就，全部列出（原来只取第一个，信息是错的） */
const frameOwners = (fid: string) => achvList.value.filter((a) => a.frame === fid).map((a) => a.title)

async function wearFrame(id: string) {
  const res = await updateFrame(id)
  if (res.code === 200) toast.success(id === 'none' ? '已摘下头像框' : `已佩戴「${frameTitle(id)}」`)
}

/* ---------------- 成就领取 ---------------- */
async function claimAchv(id: string) {
  const def = achvList.value.find((a) => a.id === id)
  const before = def ? tierOf(def.frame) : 0
  const r = claim(id)
  if (r.ok && r.frame) {
    const name = frameById(r.frame).name
    const lv = TIER_LABEL[Math.min(r.tier ?? 1, 3) - 1]
    // 同一个框再次领到才叫「进阶」；首次解锁（哪怕直接跳到达高阶位）仍说「解锁」
    if (before === 0) toast.success(`成就已领取，解锁「${name} ${lv}」！`)
    else if ((r.tier ?? 1) > before) toast.success(`成就已领取，${name} 进阶至 ${lv}！`)
    else toast.success('成就已领取')
    await updateFrame(r.frame) // 领取即自动佩戴
  }
}

async function saveNickname() {
  const n = nicknameInput.value.trim()
  if (!n) return toast.error('昵称不能为空')
  const res = await updateNickname(n)
  if (res.code === 200) {
    toast.success('昵称已更新')
    profileOpen.value = false
  }
}

/** 错题展开状态 */
const expanded = ref<Record<number, boolean>>({})
const toggleExpand = (id: number) => (expanded.value[id] = !expanded.value[id])

const dateOnly = (s: string) => s?.slice(0, 16) ?? '-'

/* ---------------- 数据备份：导出 / 导入 ---------------- */
const importMode = ref<'merge' | 'replace'>('merge')
const importing = ref(false)
const pendingImport = ref<UserDataExport | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

/** 导出：把三张表打包成 JSON 下载 */
async function doExport() {
  const res = await api.exportUserData()
  if (res.code !== 200) return toast.error(res.message)
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const day = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `embedmaster-backup-${day}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出：${res.data.progress.length} 章进度、${res.data.answers.length} 条答题`)
}

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许连续选同一个文件
  if (!file) return
  if (file.size > 8 * 1024 * 1024) return toast.error('文件过大，请确认是本平台导出的备份')
  try {
    const text = await file.text()
    const data = JSON.parse(text) as UserDataExport
    if (data?.app !== 'EmbedMaster') return toast.error('这不是 EmbedMaster 的备份文件')
    pendingImport.value = data
  } catch {
    toast.error('文件解析失败，请确认是完整的 JSON 备份')
  }
}

async function confirmImport() {
  const data = pendingImport.value
  if (!data || importing.value) return
  importing.value = true
  try {
    const res = await api.importUserData(data, importMode.value)
    if (res.code !== 200) {
      toast.error(res.message)
      return
    }
    const s = res.data
    toast.success(
      `${res.message}：${s.progress} 章进度、${s.answers} 条答题、${s.favorites} 个收藏${s.skipped ? `（跳过 ${s.skipped} 条无效记录）` : ''}`,
    )
    pendingImport.value = null
    await loadAll()
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="container-page py-8">
    <nav class="flex items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-brand-700">首页</RouterLink>
      <AppIcon name="chevron-right" :size="12" />
      <span class="text-ink-600">个人中心</span>
    </nav>

    <!-- ==================== 用户卡片 ==================== -->
    <div class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div class="relative h-24 bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600">
        <div class="pointer-events-none absolute inset-0 opacity-[0.15]" style="background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 18px 18px" />
      </div>
      <div class="relative px-6 pb-5">
        <div class="-mt-10 flex items-end gap-3">
          <button
            class="group relative rounded-full transition-transform active:scale-95"
            title="点击更换头像与头像框"
            @click="openAvatarPicker"
          >
            <UserAvatar :avatar="user?.avatar_url || ''" :frame="user?.frame || 'none'" :name="user?.nickname" :size="72" />
            <span class="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-ink-900 text-white shadow-md transition group-hover:bg-brand-600">
              <AppIcon name="edit" :size="12" />
            </span>
          </button>
          <span v-if="user?.frame && user.frame !== 'none'" class="mb-2 rounded-full bg-gradient-to-r from-amber-100 to-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
            {{ frameTitle(user.frame) }}
          </span>
        </div>

        <div class="mt-3">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-lg font-extrabold text-ink-900">{{ user?.nickname || '未登录' }}</h1>
            <span v-if="isLogin" class="tag bg-emerald-50 text-emerald-600">已登录</span>
          </div>
          <p class="mt-0.5 text-xs text-ink-400">
            @{{ user?.username }} · 注册于 {{ user?.created_at?.slice(0, 10) }}
          </p>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <RouterLink to="/report" class="btn-primary btn-sm">
            <AppIcon name="chart" :size="13" /> 学习周报
          </RouterLink>
          <button class="btn-soft btn-sm" @click="openAvatarPicker">
            <AppIcon name="sparkles" :size="13" /> 头像与装扮
          </button>
          <button class="btn-ghost btn-sm" @click="authOpen = true">
            <AppIcon name="user" :size="13" /> 切换账号
          </button>
          <button class="btn-ghost btn-sm" @click="openProfileEdit">
            <AppIcon name="edit" :size="13" /> 修改昵称
          </button>
          <button class="btn-ghost btn-sm text-rose-600 hover:bg-rose-50" @click="doLogout">
            <AppIcon name="logout" :size="13" /> 退出
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== 数据统计 ==================== -->
    <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div v-for="s in stats" :key="s.label" class="card flex items-center gap-3 p-4">
        <span class="grid h-10 w-10 place-items-center rounded-xl" :class="s.tone">
          <AppIcon :name="s.icon" :size="18" :stroke-width="2" />
        </span>
        <div>
          <div class="text-[11px] font-medium text-ink-400">{{ s.label }}</div>
          <div class="mt-0.5 flex items-baseline gap-1">
            <span class="font-mono text-xl font-extrabold text-ink-900">{{ s.value }}{{ s.suffix ?? '' }}</span>
            <span v-if="s.total" class="text-[11px] text-ink-400">/ {{ s.total }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== Tabs ==================== -->
    <div class="mt-6 flex flex-wrap items-center gap-1 border-b border-slate-200">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors"
        :class="tab === t.key ? 'text-brand-700' : 'text-ink-400 hover:text-ink-700'"
        @click="tab = t.key"
      >
        <AppIcon :name="t.icon" :size="15" />
        {{ t.label }}
        <span v-if="t.key === 'achv' && claimableCount" class="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
          {{ claimableCount }}
        </span>
        <span v-if="t.key === 'wrong' && wrongList.length" class="rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-600">
          {{ wrongList.length }}
        </span>
        <span v-if="tab === t.key" class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
      </button>
    </div>

    <!-- 骨架 -->
    <div v-if="loading" class="mt-5 space-y-3">
      <div v-for="i in 3" :key="i" class="card h-20 animate-pulse bg-slate-100/60" />
    </div>

    <div v-else class="mt-5">
      <!-- ============ 成就中心 ============ -->
      <div v-if="tab === 'achv'" class="space-y-4">
        <div class="card flex flex-wrap items-center gap-3 p-4">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <AppIcon name="trophy" :size="19" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-extrabold text-ink-900">
              已领取 {{ achvList.filter((a) => a.claimed).length }} / {{ achvList.length }} 项成就
            </div>
            <p class="mt-0.5 text-[11.5px] text-ink-400">达成进度即可领取成就。每款头像框挂 3 项成就，分别对应 Ⅰ / Ⅱ / Ⅲ 阶；领到同一个框会把它往上推一阶（Ⅰ → Ⅱ → Ⅲ），框越戴越亮；领取后自动佩戴，可随时在「头像与装扮」里更换。</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="a in achvList"
            :key="a.id"
            class="card relative overflow-hidden p-4"
            :class="a.claimed ? 'border-amber-200 bg-amber-50/30' : a.done ? 'border-brand-200 bg-brand-50/30' : ''"
          >
            <div class="flex items-start gap-3">
              <span
                class="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                :class="a.claimed ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : a.done ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'"
              >
                <AppIcon :name="a.icon" :size="20" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-bold text-ink-900">{{ a.title }}</span>
                  <span class="tag bg-slate-100 text-ink-500">{{ a.category }}</span>
                  <span v-if="a.claimed" class="tag bg-amber-100 text-amber-700">已领取</span>
                </div>
                <p class="mt-0.5 text-[11.5px] text-ink-500">{{ a.desc }}</p>
                <div class="mt-2 flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="a.claimed ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-brand-500 to-accent-500'"
                      :style="{ width: `${Math.round((a.value / a.target) * 100)}%` }"
                    />
                  </div>
                  <span class="font-mono text-[10.5px] font-bold" :class="a.done ? 'text-brand-700' : 'text-ink-400'">
                    {{ a.value }}/{{ a.target }}
                  </span>
                </div>
                <div class="mt-2.5 flex items-center justify-between gap-2">
                  <span class="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
                    <span class="inline-block h-3.5 w-3.5 shrink-0 rounded-full" :style="{ background: frameById(a.frame).css }" />
                    <span>{{ a.claimed ? '已获' : '奖励' }}</span>
                    <span class="font-semibold text-ink-600">{{ frameById(a.frame).name }}</span>
                    <span
                      class="rounded px-1 text-[10px] font-bold leading-4"
                      :class="achvTier(a.id) > 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-ink-400'"
                    >{{ TIER_LABEL[Math.min(achvTier(a.id), 3) - 1] }}</span>
                  </span>
                  <button
                    v-if="!a.claimed"
                    class="btn-sm"
                    :class="a.done ? 'btn-primary animate-pulse' : 'btn-ghost cursor-default text-ink-300'"
                    @click="a.done && claimAchv(a.id)"
                  >
                    {{ a.done ? '领取' : '未达成' }}
                  </button>
                  <button v-else class="btn-sm btn-ghost text-amber-600" @click="wearFrame(a.frame)">
                    <AppIcon name="sparkles" :size="12" /> 佩戴
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 学习进度 ============ -->
      <div v-if="tab === 'progress'" class="space-y-3">
        <div v-if="!progress.length" class="card flex flex-col items-center py-14">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><AppIcon name="book" :size="22" /></span>
          <p class="mt-3 text-sm font-semibold text-ink-700">还没有学习记录</p>
          <p class="mt-1 text-xs text-ink-400">去读一章讲义，进度会自动记录在这里</p>
          <RouterLink to="/courses" class="btn-primary btn-sm mt-4">去看课程</RouterLink>
        </div>

        <div v-for="p in progress" :key="p.chapter_id" class="card p-4">
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold"
              :class="p.is_finished ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-ink-400'"
            >
              <AppIcon v-if="p.is_finished" name="check" :size="15" :stroke-width="2.6" />
              <AppIcon v-else name="book" :size="14" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <RouterLink :to="`/chapter/${p.chapter_id}`" class="text-sm font-bold text-ink-900 hover:text-brand-700">
                  {{ chapterName(p.chapter_id) }}
                </RouterLink>
                <span class="tag bg-slate-100 text-ink-500">{{ courseName(p.chapter_id) }}</span>
                <span v-if="p.is_finished" class="tag bg-emerald-50 text-emerald-600">已完成</span>
              </div>
              <div class="mt-2 flex items-center gap-3">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500" :style="{ width: `${p.read_percent}%` }" />
                </div>
                <span class="font-mono text-[11px] font-bold text-brand-700">{{ p.read_percent }}%</span>
              </div>
              <div class="mt-1.5 text-[11px] text-ink-400">最近阅读 {{ dateOnly(p.updated_at) }}</div>
            </div>
            <RouterLink :to="`/chapter/${p.chapter_id}`" class="btn-ghost btn-sm shrink-0">继续</RouterLink>
          </div>
        </div>
      </div>

      <!-- ============ 收藏 ============ -->
      <div v-else-if="tab === 'favorite'" class="space-y-3">
        <div v-if="!favorites.length" class="card flex flex-col items-center py-14">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><AppIcon name="bookmark" :size="22" /></span>
          <p class="mt-3 text-sm font-semibold text-ink-700">还没有收藏的章节</p>
          <p class="mt-1 text-xs text-ink-400">在讲义页点击「收藏本章」即可加入这里</p>
          <RouterLink to="/courses" class="btn-primary btn-sm mt-4">去逛课程</RouterLink>
        </div>

        <div v-for="c in favorites" :key="c.id" class="card flex items-start gap-3 p-4">
          <span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <AppIcon name="bookmark" :size="14" />
          </span>
          <div class="min-w-0 flex-1">
            <RouterLink :to="`/chapter/${c.id}`" class="text-sm font-bold text-ink-900 hover:text-brand-700">{{ c.chapter_name }}</RouterLink>
            <p class="mt-1 line-clamp-1 text-[13px] text-ink-500">{{ c.summary }}</p>
            <div class="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400">
              <span>{{ getCourseById(c.course_id)?.course_name }}</span>
              <span class="flex items-center gap-1"><AppIcon name="clock" :size="11" /> {{ c.estimated_minutes }} 分钟</span>
            </div>
          </div>
          <RouterLink :to="`/chapter/${c.id}`" class="btn-ghost btn-sm shrink-0">去阅读</RouterLink>
        </div>
      </div>

      <!-- ============ 错题本 ============ -->
      <div v-else-if="tab === 'wrong'" class="space-y-3">
        <div v-if="!wrongList.length" class="card flex flex-col items-center py-14">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-500"><AppIcon name="check-circle" :size="22" /></span>
          <p class="mt-3 text-sm font-semibold text-ink-700">错题本是空的</p>
          <p class="mt-1 text-xs text-ink-400">继续保持，说明你答得不错</p>
          <RouterLink to="/quiz" class="btn-primary btn-sm mt-4">去刷题</RouterLink>
        </div>

        <div v-if="wrongList.length" class="card flex flex-wrap items-center gap-3 p-3.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
            <AppIcon name="target" :size="17" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-[13px] font-bold text-ink-900">共 {{ wrongList.length }} 道错题待巩固</div>
            <p class="mt-0.5 text-[11.5px] text-ink-400">重练一次，最近一次答对的题会自动移出错题本</p>
          </div>
          <RouterLink to="/quiz?wrong=1" class="btn-primary btn-sm shrink-0">
            <AppIcon name="zap" :size="13" /> 重练全部
          </RouterLink>
        </div>

        <div v-for="item in wrongList" :key="item.question.id" class="card overflow-hidden">
          <div class="flex items-start gap-3 p-4">
            <span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-500">
              <AppIcon name="x" :size="15" :stroke-width="2.6" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="tag bg-rose-50 text-rose-600">{{ item.question.question_type }}</span>
                <span class="text-[11px] text-ink-400">{{ chapterName(item.question.chapter_id) }}</span>
                <span class="text-[11px] text-ink-400">· {{ dateOnly(item.record.created_at) }}</span>
              </div>
              <p class="mt-1.5 text-sm font-medium leading-relaxed text-ink-900">{{ item.question.question_title }}</p>

              <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span class="text-ink-500">你的答案：<span class="font-mono font-bold text-rose-600">{{ item.record.user_answer || '（空）' }}</span></span>
                <span class="text-ink-500">正确答案：<span class="font-mono font-bold text-emerald-600">{{ item.question.answer }}</span></span>
              </div>

              <div v-if="expanded[item.question.id]" class="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                <div class="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">解析</div>
                <p class="text-[13px] leading-relaxed text-ink-600">{{ item.question.analysis }}</p>
              </div>
            </div>
            <div class="flex shrink-0 flex-col gap-1.5">
              <button class="btn-ghost btn-sm" @click="toggleExpand(item.question.id)">
                {{ expanded[item.question.id] ? '收起' : '看解析' }}
              </button>
              <RouterLink :to="`/quiz/${item.question.chapter_id}`" class="btn-soft btn-sm">重做</RouterLink>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 答题历史 ============ -->
      <div v-else class="card overflow-hidden">
        <div v-if="!history.length" class="flex flex-col items-center py-14">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><AppIcon name="clock" :size="22" /></span>
          <p class="mt-3 text-sm font-semibold text-ink-700">还没有答题记录</p>
          <RouterLink to="/quiz" class="btn-primary btn-sm mt-4">去做第一道题</RouterLink>
        </div>

        <template v-else>
          <div class="hidden grid-cols-[1fr_90px_90px_130px] gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-400 sm:grid">
            <span>题目</span>
            <span>你的答案</span>
            <span>结果</span>
            <span>时间</span>
          </div>
          <div
            v-for="h in history"
            :key="h.id"
            class="grid gap-1 border-b border-slate-100 px-5 py-3 text-sm last:border-b-0 sm:grid-cols-[1fr_90px_90px_130px] sm:items-center sm:gap-3"
          >
            <div class="min-w-0">
              <div class="line-clamp-1 text-[13px] font-medium text-ink-800">
                {{ allQuestions.find((q) => q.id === h.question_id)?.question_title ?? '题目已删除' }}
              </div>
              <div class="mt-0.5 text-[11px] text-ink-400">{{ chapterName(h.chapter_id) }}</div>
            </div>
            <div class="font-mono text-xs text-ink-600 sm:block">{{ h.user_answer || '—' }}</div>
            <div>
              <span
                class="tag"
                :class="h.is_correct ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'"
              >
                {{ h.is_correct ? '正确' : '错误' }}
              </span>
            </div>
            <div class="font-mono text-[11px] text-ink-400">{{ dateOnly(h.created_at) }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- ==================== 数据备份 ==================== -->
    <div class="card mt-6 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-white">
          <AppIcon name="save" :size="17" />
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-[14.5px] font-extrabold text-ink-900">学习记录备份</h3>
          <p class="mt-0.5 text-[11.5px] text-ink-400">
            学习数据保存在当前浏览器里（不同域名互不相通）。换手机、换浏览器，或从热点地址迁到公网地址时，
            先在这里导出 JSON，再到新地址导入即可无缝接上。
          </p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button class="btn-soft btn-sm" @click="doExport">
          <AppIcon name="download" :size="13" /> 导出备份
        </button>
        <button class="btn-ghost btn-sm" @click="pickFile">
          <AppIcon name="upload" :size="13" /> 导入备份
        </button>
        <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFileChange" />

        <!-- 导入模式 -->
        <div class="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
          <button
            class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition"
            :class="importMode === 'merge' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-slate-50'"
            @click="importMode = 'merge'"
          >
            合并（推荐）
          </button>
          <button
            class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition"
            :class="importMode === 'replace' ? 'bg-rose-500 text-white' : 'text-ink-500 hover:bg-slate-50'"
            @click="importMode = 'replace'"
          >
            覆盖
          </button>
        </div>
      </div>

      <!-- 导入确认：展示备份概况，覆盖模式额外警告 -->
      <div v-if="pendingImport" class="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
        <div class="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
          <AppIcon name="info" :size="14" class="text-brand-600" />
          <span>
            <b class="font-semibold">{{ pendingImport.user?.nickname || pendingImport.user?.username || '未知用户' }}</b>
            于 {{ pendingImport.exported_at?.slice(0, 16) || '未知时间' }} 导出的备份：{{ pendingImport.progress.length }} 章进度、{{ pendingImport.answers.length }} 条答题、{{ pendingImport.favorites.length }} 个收藏
          </span>
        </div>
        <p v-if="importMode === 'replace'" class="mt-1.5 text-[12px] font-semibold text-rose-600">
          ⚠️ 覆盖模式会清掉当前账号现有的全部学习记录，再用备份替换，请确认清楚。
        </p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <button class="btn-primary btn-sm" :disabled="importing" @click="confirmImport">
            <AppIcon v-if="importing" name="refresh" :size="13" class="animate-spin" />
            确认{{ importMode === 'merge' ? '合并' : '覆盖' }}导入
          </button>
          <button class="btn-ghost btn-sm" @click="pendingImport = null">取消</button>
        </div>
      </div>
    </div>

    <!-- ==================== 头像与装扮弹层 ==================== -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div v-if="avatarOpen" class="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4" @click.self="avatarOpen = false">
          <div class="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lift sm:rounded-2xl">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-base font-extrabold text-ink-900">头像与装扮</h3>
              <button class="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100" @click="avatarOpen = false">
                <AppIcon name="x" :size="15" />
              </button>
            </div>

            <!-- 当前效果预览 -->
            <div class="mb-4 flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              <UserAvatar :avatar="user?.avatar_url || ''" :frame="user?.frame || 'none'" :name="user?.nickname" :size="64" />
              <div>
                <div class="text-sm font-bold text-ink-900">{{ user?.nickname }}</div>
                <p class="mt-0.5 text-[11px] text-ink-400">
                  当前头像框：{{ user?.frame && user.frame !== 'none' ? frameTitle(user.frame) : '无' }}
                  <span v-if="user?.frame && user.frame !== 'none'" class="text-ink-300">· {{ tierHint(user.frame) }}</span>
                </p>
                <button class="btn-ghost btn-sm mt-1.5" @click="pickAlbum" :disabled="uploading">
                  <AppIcon name="upload" :size="12" />
                  {{ uploading ? '处理中…' : '从相册选择' }}
                </button>
              </div>
            </div>

            <!-- 系统预设 -->
            <p class="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">系统头像</p>
            <div class="grid grid-cols-4 gap-3">
              <button
                v-for="p in presets"
                :key="p.id"
                class="group flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition active:scale-95"
                :class="user?.avatar_url === `preset:${p.id}` ? 'border-brand-500 bg-brand-50/50' : 'border-transparent hover:border-slate-200'"
                @click="pickPreset(p.id)"
              >
                <span class="h-12 w-12 overflow-hidden rounded-full">
                  <span class="block h-full w-full" v-html="p.svg" />
                </span>
                <span class="text-[10.5px]" :class="user?.avatar_url === `preset:${p.id}` ? 'font-bold text-brand-700' : 'text-ink-400'">{{ p.label }}</span>
              </button>
            </div>

            <!-- 头像框衣柜 -->
            <p class="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              头像框
              <span class="ml-1 font-normal normal-case tracking-normal text-ink-300">达成成就解锁更多（去「成就中心」领取）</span>
            </p>
            <div class="grid grid-cols-4 gap-3">
              <button
                v-for="f in wardrobe"
                :key="f.id"
                class="flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 pb-2 pt-2.5 transition active:scale-95"
                :class="user?.frame === f.id || (!user?.frame && f.id === 'none') ? 'border-brand-500 bg-brand-50/50' : 'border-transparent hover:border-slate-200'"
                @click="wearFrame(f.id)"
              >
                <!-- 环的材质与领环层数直接反映阶数：Ⅰ 素环 / Ⅱ 加一圈镶边 / Ⅲ 双环+宝石钉 -->
                <template v-if="f.id === 'none'">
                  <span
                    class="grid place-items-center rounded-full"
                    :style="{ background: f.css, width: '46px', height: '46px' }"
                  >
                    <span class="grid h-[38px] w-[38px] place-items-center rounded-full bg-white text-[15px] font-extrabold text-ink-500">无</span>
                  </span>
                </template>
                <FrameRing
                  v-else
                  :frame="f.id"
                  :tier="tierOf(f.id)"
                  :size="46"
                  class="my-1"
                  :class="tierOf(f.id) >= 3 ? 'frame-breathe' : ''"
                >
                  <span class="grid h-full w-full place-items-center rounded-full bg-white text-[15px] font-extrabold text-ink-500">✓</span>
                </FrameRing>
                <span class="text-[10.5px]" :class="(user?.frame === f.id || (!user?.frame && f.id === 'none')) ? 'font-bold text-brand-700' : 'text-ink-400'">{{ frameTitle(f.id) }}</span>
                <span
                  v-if="f.id !== 'none'"
                  class="text-center text-[9px] leading-tight"
                  :class="tierOf(f.id) >= frameMaxTier(f.id) ? 'text-ink-300' : 'text-amber-600'"
                >{{ tierHint(f.id) }}</span>
              </button>
              <div
                v-for="f in lockedFrames"
                :key="'l-' + f.id"
                class="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-200 p-2 opacity-60"
              >
                <FrameRing :frame="f.id" :tier="1" :size="46" class="my-1 opacity-90">
                  <span class="grid h-full w-full place-items-center rounded-full bg-white/75 text-base">🔒</span>
                </FrameRing>
                <span class="text-[10.5px] text-ink-400">{{ f.name }}</span>
                <span class="text-center text-[9px] leading-tight text-ink-300">{{ frameOwners(f.id).join(' · ') }}</span>
              </div>
            </div>

            <input ref="avatarFileInput" type="file" accept="image/*" class="hidden" @change="onAvatarFileChange" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ==================== 修改昵称弹层 ==================== -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div v-if="profileOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm" @click.self="profileOpen = false">
          <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lift">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-extrabold text-ink-900">修改昵称</h3>
              <button class="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100" @click="profileOpen = false">
                <AppIcon name="x" :size="15" />
              </button>
            </div>
            <label class="label mt-4">昵称</label>
            <input v-model="nicknameInput" class="field" maxlength="20" placeholder="输入新的昵称" @keyup.enter="saveNickname" />
            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-ghost btn-sm" @click="profileOpen = false">取消</button>
              <button class="btn-primary btn-sm" @click="saveNickname">保存</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ==================== 登录 / 注册弹层 ==================== -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div v-if="authOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm" @click.self="authOpen = false">
          <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lift">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-extrabold text-ink-900">{{ authMode === 'login' ? '登录' : '注册新账号' }}</h3>
              <button class="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100" @click="authOpen = false">
                <AppIcon name="x" :size="15" />
              </button>
            </div>

            <p class="mt-1 text-[11px] leading-relaxed text-ink-400">
              演示账号：<span class="font-mono font-semibold text-ink-600">demo</span> / 任意 6 位以上密码。
              注册的账号仅保存在本地浏览器。
            </p>

            <div class="mt-4 space-y-3">
              <div>
                <label class="label">用户名</label>
                <input v-model="form.username" class="field" placeholder="至少 3 个字符" @keyup.enter="doAuth" />
              </div>
              <div>
                <label class="label">密码</label>
                <input v-model="form.password" type="password" class="field" placeholder="至少 6 位" @keyup.enter="doAuth" />
              </div>
              <div v-if="authMode === 'register'">
                <label class="label">昵称（可选）</label>
                <input v-model="form.nickname" class="field" placeholder="显示名称" @keyup.enter="doAuth" />
              </div>
            </div>

            <button class="btn-primary mt-4 w-full" :disabled="submitting" @click="doAuth">
              <AppIcon v-if="submitting" name="refresh" :size="15" class="animate-spin" />
              {{ authMode === 'login' ? '登录' : '注册并登录' }}
            </button>

            <button class="mt-3 w-full text-center text-xs text-ink-400 hover:text-brand-700" @click="authMode = authMode === 'login' ? 'register' : 'login'">
              {{ authMode === 'login' ? '没有账号？去注册 →' : '已有账号？去登录 →' }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
