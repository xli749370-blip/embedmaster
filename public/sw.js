/**
 * EmbedMaster Service Worker
 * ------------------------------------------------------------------
 * 目标：断网 / 弱网时站点依然可用（讲义、题库、动画全部是打包进
 * 前端的静态资源，缓存住即可完整离线学习；学习数据本来就存
 * localStorage，离线读写不受影响）。
 *
 * 策略：
 * - 安装时预缓存构建产物的入口资源（index.html / manifest / 图标），
 *   其余带 hash 的 js/css/字体按「运行时缓存」首次访问后收进来；
 * - 同源 GET 请求：缓存命中直接回（cache-first），未命中走网络并
 *   顺手写入缓存；网络失败且缓存也没有时，导航请求回退到缓存的
 *   index.html（SPA hash 路由下就是它）；
 * - 非 GET（本项目没有）与跨域请求直接放行；
 * - 音频（/audio/ 下的 mp3）不接管，交给浏览器原生 HTTP 缓存：
 *   时长音频靠 Range 分段请求边下边播，Service Worker 整包缓存既会
 *   把几百 MB 塞进 Cache Storage 触发配额告警，也会破坏拖动定位；
 * - 版本号 CACHE_VERSION 变更后，activate 阶段清理旧缓存。
 */

const CACHE_VERSION = 'embedmaster-v2'
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-192.png',
  './pwa-512.png',
  './pwa-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 跨域请求（如 CDN 字体）不拦截，交给浏览器
  if (url.origin !== self.location.origin) return

  // 音频文件不接管：Range 分段请求由浏览器自行处理
  // （见文件头策略说明，SW 整包缓存会撑爆配额并破坏拖动定位）
  if (url.pathname.includes('/audio/')) return

  // SPA 导航：网络优先，失败回退到缓存的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // 静态资源：缓存优先，未命中回网络并写入缓存
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy))
        }
        return res
      })
    }),
  )
})
