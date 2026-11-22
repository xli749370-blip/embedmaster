<script setup lang="ts">
/** 顶部导航：响应式，移动端折叠为抽屉 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import UserAvatar from './UserAvatar.vue'
import { useAuth } from '@/composables/useAuth'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useAchievements } from '@/composables/useAchievements'
import { registerBackConsumer } from '@/utils/backHandler'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const { user, isLogin, logout } = useAuth()
const { mode, cycle } = useTheme()
const { claimableCount } = useAchievements()

/** 三档主题的按钮外观与提示文案 */
const THEME_META: Record<ThemeMode, { icon: string; tip: string }> = {
  light: { icon: 'sun', tip: '当前：亮色（点击切换深色）' },
  dark: { icon: 'moon', tip: '当前：深色（点击切换跟随系统）' },
  auto: { icon: 'cpu', tip: '当前：跟随系统（点击切换亮色）' },
}

/** 导航分组：按层级/芯片整理，桌面下拉 + 移动端分组抽屉 */
interface NavItem { name: string; label: string; to: string }
interface NavGroup { key: string; label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    key: 'learn',
    label: '学习',
    items: [
      { name: 'courses', label: 'STM32 课程', to: '/courses' },
      { name: 'learn-lang', label: '语言基础', to: '/learn/lang' },
      { name: 'learn-computer', label: '计算机底层', to: '/learn/computer' },
      { name: 'learn-clang', label: 'C 语言大全', to: '/learn/clang' },
      { name: 'learn-python', label: 'Python', to: '/learn/python' },
    ],
  },
  {
    key: 'hw',
    label: '硬件层',
    items: [
      { name: 'circuit', label: '电路分析', to: '/circuit' },
      { name: 'components', label: '元器件百科', to: '/components' },
      { name: 'datasheets', label: '数据手册', to: '/datasheets' },
      { name: 'esp32', label: 'ESP32 平台', to: '/esp32' },
      { name: 'lab', label: '动画实验室', to: '/lab' },
    ],
  },
  {
    key: 'sw',
    label: '软件层',
    items: [
      { name: 'codelib', label: '代码库', to: '/codelib' },
    ],
  },
  {
    key: 'practice',
    label: '实战',
    items: [
      { name: 'quiz', label: '在线刷题', to: '/quiz' },
      { name: 'assess', label: '效果检测', to: '/assess' },
    ],
  },
  {
    key: 'coach',
    label: '督学',
    items: [
      { name: 'roadmap', label: '学习地图·打卡', to: '/roadmap' },
      { name: 'wrongbook', label: '错题本', to: '/wrongbook' },
      { name: 'report', label: '学习周报', to: '/report' },
      { name: 'ai', label: 'AI 答疑', to: '/ai' },
    ],
  },
]

/** 一级直达（不折叠进下拉）：冥想独立栏目 + 工程库（高频核心，不能藏进二级） */
const topNavs: NavItem[] = [
  { name: 'meditate', label: '冥想', to: '/meditate' },
  { name: 'projects', label: '工程库', to: '/projects' },
]

const directNavs: NavItem[] = [
  { name: 'home', label: '首页', to: '/' },
  { name: 'profile', label: '个人中心', to: '/profile' },
]

const mobileOpen = ref(false)
const scrolled = ref(false)
const menuOpen = ref(false)
const openGroup = ref('')

function groupActive(g: NavGroup): boolean {
  return g.items.some((n) => isActive(n.name))
}

function isActive(name: string): boolean {
  if (name === 'home') return route.name === 'home'
  if (name === 'courses') return ['courses', 'course-detail', 'chapter'].includes(String(route.name))
  if (name.startsWith('learn-')) {
    const id = name.slice(6)
    return route.name === 'learn' && String(route.params.id || '') === id
  }
  const direct: Record<string, string> = {
    quiz: 'quiz', assess: 'assess', circuit: 'circuit', components: 'components',
    wrongbook: 'wrongbook', projects: 'projects', codelib: 'codelib', lab: 'lab',
    report: 'report', profile: 'profile', esp32: 'esp32', datasheets: 'datasheets',
    roadmap: 'roadmap', meditate: 'meditate', ai: 'ai',
  }
  return direct[name] ? route.name === direct[name] : false
}

const onScroll = () => {
  scrolled.value = window.scrollY > 8
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))

// 路由变化时收起移动端菜单与下拉
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
    menuOpen.value = false
    openGroup.value = ''
  },
)

// 抽屉打开时锁定 body 滚动，防止触摸滑动穿透到主页面
watch(mobileOpen, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})
onUnmounted(() => {
  document.body.style.overflow = ''
})

// Android 物理返回键：抽屉/菜单打开时优先关闭它们而不是退出页面
const unregisterBack = registerBackConsumer(() => {
  if (mobileOpen.value || menuOpen.value) {
    mobileOpen.value = false
    menuOpen.value = false
    openGroup.value = ''
    return true
  }
  return false
})
onUnmounted(unregisterBack)

async function doLogout() {
  await logout()
  router.push('/')
  location.reload()
}
</script>

<template>
  <header
    class="sticky top-0 z-40 transition-all duration-300"
    :class="scrolled ? 'border-b border-slate-200/80 bg-white/85 backdrop-blur-xl' : 'border-b border-transparent bg-white/60 backdrop-blur-md'"
  >
    <div class="container-page flex h-16 items-center gap-3">
      <!-- Logo -->
      <RouterLink to="/" class="group flex items-center gap-2.5">
        <span
          class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-[0_6px_16px_-6px_rgba(37,73,235,.8)] transition-transform group-hover:scale-105"
        >
          <AppIcon name="cpu" :size="19" :stroke-width="2" />
        </span>
        <span class="flex flex-col leading-none">
          <span class="text-[15px] font-extrabold tracking-tight text-ink-900">EmbedMaster</span>
          <span class="mt-0.5 text-[10px] font-medium tracking-[0.14em] text-ink-400">EMBEDDED LEARNING</span>
        </span>
      </RouterLink>

      <!-- 桌面导航：首页 + 分组下拉 + 个人中心 -->
      <nav class="ml-4 hidden items-center gap-0.5 lg:flex">
        <RouterLink
          v-for="n in [...directNavs.slice(0, 1), ...topNavs]"
          :key="n.name"
          :to="n.to"
          class="relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="isActive(n.name) ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'"
        >
          {{ n.label }}
          <span
            v-if="isActive(n.name)"
            class="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
          />
        </RouterLink>

        <div v-for="g in navGroups" :key="g.key" class="relative">
          <button
            class="relative flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="groupActive(g) ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'"
            @click="openGroup = openGroup === g.key ? '' : g.key"
            @mouseenter="openGroup = g.key"
          >
            {{ g.label }}
            <AppIcon name="chevron-down" :size="13" class="text-ink-300" />
            <span v-if="groupActive(g)" class="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-brand-500 to-accent-500" />
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div
              v-if="openGroup === g.key"
              class="absolute left-0 top-[calc(100%+6px)] z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lift"
              @mouseleave="openGroup = ''"
            >
              <RouterLink
                v-for="n in g.items"
                :key="n.name"
                :to="n.to"
                class="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors"
                :class="isActive(n.name) ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-slate-50'"
              >
                {{ n.label }}
                <span v-if="isActive(n.name)" class="h-1.5 w-1.5 rounded-full bg-brand-500" />
              </RouterLink>
            </div>
          </Transition>
        </div>

        <RouterLink
          v-for="n in directNavs.slice(1)"
          :key="n.name"
          :to="n.to"
          class="relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="isActive(n.name) ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'"
        >{{ n.label }}</RouterLink>
      </nav>

      <div class="flex-1" />

      <!-- 深色模式切换：亮色 → 深色 → 跟随系统 循环 -->
      <button
        class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-ink-500 transition hover:border-brand-300 hover:text-brand-700"
        :title="THEME_META[mode].tip"
        @click="cycle()"
      >
        <AppIcon :name="THEME_META[mode].icon" :size="16" />
      </button>

      <!-- 全站检索入口 -->
      <RouterLink
        to="/search"
        class="hidden items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-ink-500 transition hover:border-brand-300 hover:text-brand-700 sm:flex"
        title="搜索讲义（/ 或 Ctrl+K）"
      >
        <AppIcon name="search" :size="15" />
        <span class="hidden lg:inline">搜索讲义</span>
      </RouterLink>

      <!-- 右侧操作 -->
      <RouterLink to="/quiz" class="btn-soft btn-sm hidden whitespace-nowrap sm:inline-flex">
        <AppIcon name="zap" :size="14" />
        开始刷题
      </RouterLink>

      <div v-if="isLogin" class="relative hidden md:block">
        <button
          class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition hover:border-slate-300 hover:shadow-sm"
          @click="menuOpen = !menuOpen"
        >
          <UserAvatar :avatar="user?.avatar_url || ''" :frame="user?.frame || 'none'" :name="user?.nickname" :size="26" />
          <span class="max-w-[7rem] truncate text-sm font-medium text-ink-700">{{ user?.nickname }}</span>
          <AppIcon name="chevron-down" :size="14" class="text-ink-400" />
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 top-[calc(100%+8px)] w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lift"
        >
          <RouterLink
            to="/profile"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-slate-50"
          >
            <AppIcon name="user" :size="16" class="text-ink-400" /> 个人中心
          </RouterLink>
          <RouterLink
            to="/profile?tab=achv"
            class="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-slate-50"
          >
            <span class="flex items-center gap-2"><AppIcon name="trophy" :size="16" class="text-ink-400" /> 成就中心</span>
            <span v-if="claimableCount" class="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{{ claimableCount }}</span>
          </RouterLink>
          <RouterLink
            to="/profile?tab=favorite"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-slate-50"
          >
            <AppIcon name="bookmark" :size="16" class="text-ink-400" /> 我的收藏
          </RouterLink>
          <div class="my-1 h-px bg-slate-100" />
          <button
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            @click="doLogout"
          >
            <AppIcon name="logout" :size="16" /> 退出登录
          </button>
        </div>
      </div>

      <!-- 移动端菜单按钮 -->
      <button class="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white lg:hidden" @click="mobileOpen = !mobileOpen">
        <AppIcon :name="mobileOpen ? 'x' : 'menu'" :size="18" />
      </button>
    </div>

    <!-- 移动端抽屉 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="mobileOpen" class="max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain border-t border-slate-200 bg-white px-4 pb-4 pt-2 lg:hidden">
        <RouterLink
          to="/search"
          class="mb-1 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-ink-500"
        >
          <AppIcon name="search" :size="16" class="text-ink-400" />
          搜索讲义
          <span class="ml-auto font-mono text-[10px] text-slate-400">{{ api.allChapters.length }} 章</span>
        </RouterLink>
        <RouterLink
          v-for="n in [...directNavs, ...topNavs]"
          :key="'m-' + n.name"
          :to="n.to"
          class="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium"
          :class="isActive(n.name) ? 'bg-brand-50 text-brand-700' : 'text-ink-600'"
        >
          {{ n.label }}
          <AppIcon name="chevron-right" :size="15" class="text-slate-300" />
        </RouterLink>
        <!-- 分组导航 -->
        <div v-for="g in navGroups" :key="'mg-' + g.key" class="mt-1">
          <p class="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-ink-300">{{ g.label }}</p>
          <RouterLink
            v-for="n in g.items"
            :key="n.name"
            :to="n.to"
            class="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
            :class="isActive(n.name) ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600'"
          >
            {{ n.label }}
            <span v-if="isActive(n.name)" class="h-1.5 w-1.5 rounded-full bg-brand-500" />
          </RouterLink>
        </div>
        <button
          class="mt-2 flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-ink-600"
          @click="cycle()"
        >
          <span class="flex items-center gap-2">
            <AppIcon :name="THEME_META[mode].icon" :size="16" class="text-ink-400" />
            外观
          </span>
          <span class="text-xs font-semibold text-brand-700">{{ mode === 'light' ? '亮色' : mode === 'dark' ? '深色' : '跟随系统' }}</span>
        </button>
        <div class="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
          <RouterLink to="/profile" class="flex min-w-0 items-center gap-2">
            <UserAvatar :avatar="user?.avatar_url || ''" :frame="user?.frame || 'none'" :name="user?.nickname" :size="30" />
            <span class="min-w-0 flex-1 truncate text-sm text-ink-600">{{ user?.nickname || '未登录' }}</span>
          </RouterLink>
          <button v-if="isLogin" class="text-xs font-semibold text-rose-600" @click="doLogout">退出</button>
        </div>
      </div>
    </Transition>
  </header>

  <!-- 点击遮罩关闭用户菜单 -->
  <div v-if="menuOpen" class="fixed inset-0 z-30" @click="menuOpen = false" />
</template>
