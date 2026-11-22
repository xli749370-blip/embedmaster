import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth } from './composables/useAuth'

// 顺序很重要：先样式（含 Tailwind 基础层），再 KaTeX 样式
import './style.css'
import 'katex/dist/katex.min.css'

initAuth()

createApp(App).use(router).mount('#app')

// PWA：仅生产环境注册 Service Worker（离线缓存），开发时避免缓存干扰热更新
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 注册失败不影响站点功能，只是没有离线缓存 */
    })
  })
}
