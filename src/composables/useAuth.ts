/** 全局登录态：单例响应式，App / Header / 个人中心共享同一个 user 引用 */
import { computed, ref } from 'vue'
import api, { type UserInfo } from '@/api'

const user = ref<UserInfo | null>(null)
const token = ref<string>('')

/** 应用启动时调用：优先恢复会话，否则注入演示账号 */
export function initAuth() {
  const session = api.ensureDemoSession()
  user.value = session.user
  token.value = session.token
}

export function useAuth() {
  const isLogin = computed(() => !!user.value)

  async function login(username: string, password: string) {
    const res = await api.login(username, password)
    if (res.code === 200) {
      user.value = res.data.user
      token.value = res.data.token
    }
    return res
  }

  async function register(username: string, password: string, nickname?: string) {
    const res = await api.register(username, password, nickname)
    if (res.code === 200) {
      user.value = res.data.user
      token.value = res.data.token
    }
    return res
  }

  async function logout() {
    await api.logout()
    user.value = null
    token.value = ''
  }

  async function updateNickname(nickname: string) {
    const res = await api.updateProfile({ nickname })
    if (res.code === 200) user.value = res.data
    return res
  }

  /** 更新头像（'preset:xxx' 系统预设 / dataURI 自定义上传） */
  async function updateAvatar(avatar: string) {
    const res = await api.updateProfile({ avatar_url: avatar })
    if (res.code === 200) user.value = res.data
    return res
  }

  /** 更新佩戴中的头像框 */
  async function updateFrame(frame: string) {
    const res = await api.updateProfile({ frame })
    if (res.code === 200) user.value = res.data
    return res
  }

  return { user, token, isLogin, login, register, logout, updateNickname, updateAvatar, updateFrame }
}
