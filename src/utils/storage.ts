/** 本地存储工具：统一前缀，避免污染其他站点数据 */

const PREFIX = 'embedmaster:'

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStore(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* 隐私模式或配额满时静默失败，不影响主流程 */
  }
}

export function removeStore(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** 生成一个极简的 Mock JWT（header.payload.signature 三段式，仅用于原型演示） */
export function makeMockJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '')
  const header = enc({ alg: 'HS256', typ: 'JWT' })
  const body = enc({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 })
  // 原型不做真实签名，用固定串占位
  const sign = 'mock-signature-not-verified'
  return `${header}.${body}.${sign}`
}

/** 解析 Mock JWT 的 payload（无校验） */
export function parseMockJwt(token: string): Record<string, any> | null {
  try {
    const [, body] = token.split('.')
    return JSON.parse(decodeURIComponent(escape(atob(body))))
  } catch {
    return null
  }
}
