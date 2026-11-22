// 静态文件服务：供线上发布使用（监听 PORT 环境变量，绑定 0.0.0.0）
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, normalize, isAbsolute } from 'node:path'

// 脚本位于 scripts/，站点目录相对**项目根**解析（也接受绝对路径）
const PROJECT_ROOT = join(import.meta.dirname, '..')
const siteArg = process.env.SITE_DIR || 'site'
const ROOT = isAbsolute(siteArg) ? siteArg : join(PROJECT_ROOT, siteArg)
const PORT = Number(process.env.PORT || 3000)
const HOST = '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.apk': 'application/vnd.android.package-archive',
  '.map': 'application/json', '.xml': 'application/xml',
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath.endsWith('/')) urlPath += 'index.html'
    let file = normalize(join(ROOT, urlPath))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden') }
    // SPA 回退：文件不存在时回 index.html（音频/APK 等资源除外）
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (!extname(file)) file = join(ROOT, 'index.html')
      else { res.writeHead(404); return res.end('Not Found') }
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': statSync(file).size,
      'Cache-Control': 'no-cache',
    })
    createReadStream(file).pipe(res)
  } catch (e) {
    res.writeHead(500); res.end('Server Error')
  }
})

server.listen(PORT, HOST, () => console.log(`serving dist at http://${HOST}:${PORT}`))
