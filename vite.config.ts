import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Vite 配置：Vue3 + TS + TailwindCSS
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // 用 @ 指向 src，避免深层相对路径
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 0.0.0.0 = 监听所有网卡，同一 Wi-Fi 下的手机才能访问；
    // 只想本机访问时改回 '127.0.0.1'
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 部署到公网后请求经过反向代理，Host 头不是 localhost，
    // 不放行会被 Vite 以 "Blocked request. This host is not allowed." 拒绝。
    allowedHosts: true,
    fs: {
      // dev server 默认只允许读取项目根目录内的文件（strict 模式），
      // 这里再显式拒绝各类密钥文件——将来接入真实后端放置 .env 时，
      // 也不会被 /@fs/ 路径读到。
      deny: ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', '.git/**'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    // Konva / KaTeX / markdown-it 体积较大，放宽单包体积告警阈值
    chunkSizeWarningLimit: 1600,
    // 关闭构建前清空 dist。vite 默认会在每次 build 前递归删除整个 dist 目录，
    // 这个删除动作会被安全策略拦截并要求确认（每构建一次就弹一次）。
    // 关掉后旧文件只是留在 dist 里，index.html 只引用最新哈希，不影响运行；
    // 需要彻底清理时执行 npm run clean:dist（会明确提示一次删除）。
    emptyOutDir: false,
  },
})
