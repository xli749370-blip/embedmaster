/**
 * 深色模式主题管理
 * ------------------------------------------------------------------
 * - 三档语义：'light' | 'dark' | 'auto'（跟随系统）
 * - 实际生效的模式写入 <html class="dark">，Tailwind class 策略接管配色；
 *   讲义页里嵌的 Konva 动画容器（.anim-panel）在 CSS 层豁免，保持亮色
 *   「仪表盘」外观 —— 画布内的颜色是绘制时写死的，无法随主题翻转。
 * - 用户选择持久化到 localStorage；'auto' 模式监听系统变化实时跟随。
 */
import { ref, watchEffect } from 'vue'
import { readStore, writeStore } from '@/utils/storage'

export type ThemeMode = 'light' | 'dark' | 'auto'

const K_THEME = 'theme-mode'

// 默认亮色：全站 dark: 变体覆盖不全，系统深色下「auto」会破相；
// 用户仍可手动切深色或跟随系统（选择持久化，老用户的既有选择不受影响）
const mode = ref<ThemeMode>(readStore<ThemeMode>(K_THEME, 'light'))

/** 实际生效的亮/暗（供 UI 显示状态用） */
const resolved = ref<'light' | 'dark'>('light')

/** 系统是否偏好深色 */
function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** 根据 mode 计算实际模式，并同步到 <html> */
function apply() {
  const dark = mode.value === 'dark' || (mode.value === 'auto' && systemDark())
  resolved.value = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', dark)
  // 同步浏览器地址栏 / 状态栏颜色
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = dark ? '#0b1120' : '#f6f7fb'
}

// 跟随系统：监听系统主题变化（仅 auto 模式受影响）
if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (mode.value === 'auto') apply()
  })
}

watchEffect(apply)

function setMode(m: ThemeMode) {
  mode.value = m
  writeStore(K_THEME, m)
}

/** 循环切换：light → dark → auto → light，返回切换后的模式 */
function cycle(): ThemeMode {
  const next: ThemeMode = mode.value === 'light' ? 'dark' : mode.value === 'dark' ? 'auto' : 'light'
  setMode(next)
  return next
}

export function useTheme() {
  return { mode, resolved, setMode, cycle }
}
