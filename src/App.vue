<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useToast } from '@/composables/useToast'
// 引入即初始化主题（读 localStorage / 跟随系统，写 <html class="dark">）
import { useTheme } from '@/composables/useTheme'
import { useAchievements } from '@/composables/useAchievements'
import router from '@/router'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { consumeBack } from '@/utils/backHandler'

useTheme()

const route = useRoute()
const { items } = useToast()
const toast = useToast()
const { refresh: refreshAchievements, claimableCount } = useAchievements()

/* 启动时统计一次成就进度（登录/路由变化后也会刷新，供红点提示） */
onMounted(refreshAchievements)
watch(() => route.fullPath, refreshAchievements)

/* ---------------- 移动端底部导航（主流 App 标配） ---------------- */
const TABS = [
  { name: 'home', label: '首页', icon: 'home', to: '/' },
  { name: 'learn', label: '学习', icon: 'book', to: '/learn' },
  { name: 'projects', label: '工程库', icon: 'cpu', to: '/projects' },
  { name: 'roadmap', label: '督学', icon: 'flag', to: '/roadmap' },
  { name: 'profile', label: '我的', icon: 'user', to: '/profile' },
]
const activeTab = computed(() => {
  const p = route.path
  if (p === '/') return 'home'
  if (p.startsWith('/learn')) return 'learn'
  if (p.startsWith('/projects')) return 'projects'
  if (p.startsWith('/roadmap')) return 'roadmap'
  if (p.startsWith('/profile')) return 'profile'
  return ''
})

/* ------------------------------------------------------------------
 * Android 物理返回键（标准 App 行为）：
 *   1. 浮层优先 —— 抽屉/菜单打开中，先关闭它们
 *   2. 有上一页 —— 正常路由回退（App 内回退）
 *   3. 已在 App 主页 —— 弹「确认退出」对话框，用户确认才退出
 * Web 端无物理返回键，isNativePlatform 恒为 false，整段跳过。
 * setup 阶段立即注册（不等 onMounted），尽早接管返回键。
 * ------------------------------------------------------------------ */
const exitAsk = ref(false)
let backInited = false

function initBackButton() {
  if (backInited || !Capacitor.isNativePlatform()) return
  backInited = true
  void CapApp.addListener('backButton', () => {
    // 1) 浮层优先消费（退出确认框开着时再按返回 = 关闭它）
    if (exitAsk.value) {
      exitAsk.value = false
      return
    }
    if (consumeBack()) return
    // 2) vue-router 历史里有上一页 → 正常回退
    const st = window.history.state as { back?: string | null } | null
    if (st && typeof st.back === 'string') {
      router.back()
      return
    }
    // 3) App 主页：询问用户是否确认退出
    exitAsk.value = true
  })
}

function confirmExit() {
  exitAsk.value = false
  void CapApp.exitApp()
}

initBackButton()

const TONE: Record<string, string> = {
  success: 'bg-emerald-600',
  error: 'bg-rose-500',
  info: 'bg-ink-900',
}
const ICON: Record<string, string> = {
  success: 'check-circle',
  error: 'x-circle',
  info: 'info',
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />

    <main class="flex-1 pb-16 lg:pb-0">
      <RouterView v-slot="{ Component, route }">
        <Transition
          mode="out-in"
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="opacity-0"
        >
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </main>

    <AppFooter class="hidden lg:block" />

    <!-- 移动端底部导航（桌面隐藏） -->
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/92 backdrop-blur-xl lg:hidden" style="padding-bottom: env(safe-area-inset-bottom)">
      <div class="mx-auto grid max-w-lg grid-cols-5">
        <RouterLink
          v-for="t in TABS"
          :key="t.name"
          :to="t.to"
          class="relative flex flex-col items-center gap-0.5 py-2 transition-transform active:scale-95"
        >
          <span class="relative">
            <AppIcon :name="t.icon" :size="21" :class="activeTab === t.name ? 'text-brand-600' : 'text-ink-400'" />
            <span
              v-if="t.name === 'profile' && claimableCount"
              class="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white"
            >
              {{ claimableCount }}
            </span>
          </span>
          <span class="text-[10px] font-medium" :class="activeTab === t.name ? 'text-brand-700' : 'text-ink-400'">{{ t.label }}</span>
          <span v-if="activeTab === t.name" class="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500" />
        </RouterLink>
      </div>
    </nav>

    <!-- 退出确认对话框（Android 主页返回键触发） -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="exitAsk" class="fixed inset-0 z-[70] grid place-items-center bg-black/50 px-8" @click.self="exitAsk = false">
        <div class="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-lift">
          <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
            <AppIcon name="logout" :size="22" />
          </div>
          <h3 class="mt-3 text-base font-bold text-ink-900">退出 EmbedMaster？</h3>
          <p class="mt-1 text-xs leading-relaxed text-ink-400">学习进度与打卡记录已自动保存</p>
          <div class="mt-5 grid grid-cols-2 gap-3">
            <button class="btn border-slate-200 bg-white py-2.5 text-sm text-ink-600 hover:border-slate-300" @click="exitAsk = false">再学一会儿</button>
            <button class="btn border-rose-500 bg-rose-500 py-2.5 text-sm text-white hover:bg-rose-600" @click="confirmExit">确认退出</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 全局 Toast（移动端避开底部导航） -->
    <div class="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      <TransitionGroup
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-3 scale-95"
        leave-active-class="transition duration-200 ease-in absolute"
        leave-to-class="opacity-0 -translate-y-1 scale-95"
      >
        <div
          v-for="t in items"
          :key="t.id"
          class="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-medium text-white shadow-lift"
          :class="TONE[t.type]"
        >
          <AppIcon :name="ICON[t.type]" :size="16" />
          {{ t.text }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
