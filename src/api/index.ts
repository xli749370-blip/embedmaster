/**
 * Mock 后端接口层
 * ------------------------------------------------------------------
 * 完全按《要求包》的「后端 API 接口清单」组织函数签名，返回结构与真实
 * FastAPI 一致（{ code, data, message }）。原型阶段不发起任何网络请求，
 * 全部由本地数据 + localStorage 模拟，后续接真实后端时只需替换本文件内的
 * 实现（或把同一个 api 对象换成 axios 封装），页面层无需改动。
 */
import {
  courses,
  chapters,
  questions,
  animations,
  getChaptersByCourse,
  getCourseById,
  getQuestionsByChapter,
  getAnimationsByChapter,
  type Course,
  type Chapter,
  type Question,
  type Animation,
} from '@/mock/data'
import { readStore, writeStore, makeMockJwt } from '@/utils/storage'
import { searchChapters, type SearchHit, type SearchOptions } from '@/utils/search'
import type { PaperPreset, CategoryScore } from '@/mock/assessment'
import { applyReview, type WrongEntry, type ReviewOutcome } from '@/mock/wrongbook'

/* ------------------------------------------------------------------ 基础类型 */

/** 复用数据层实体类型，页面层统一从 @/api 引入 */
export type { Course, Chapter, Animation, Question, QuestionType, StageType } from '@/mock/data'
export type { SearchHit, SearchScope, SearchSort, SearchOptions } from '@/utils/search'
export type { WrongEntry, Dim, WrongSource, ReviewOutcome } from '@/mock/wrongbook'

/** 统一响应包，模拟 FastAPI 的返回风格 */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface UserInfo {
  id: number
  username: string
  nickname: string
  avatar_url: string
  /** 佩戴中的头像框 id（achievements.ts 的 FRAMES） */
  frame?: string
  created_at: string
}

export interface ProgressItem {
  chapter_id: number
  read_percent: number
  is_finished: 0 | 1
  updated_at: string
}

export interface AnswerRecord {
  id: number
  user_id: number
  question_id: number
  chapter_id: number
  user_answer: string
  is_correct: 0 | 1
  created_at: string
}

export interface SubmitPayload {
  question_id: number
  user_answer: string
}

export interface SubmitResult {
  is_correct: 0 | 1 | -1 // -1 表示主观题待自评
  answer: string
  analysis: string
  /** 多选/单选逐项对照结果，用于渲染选项正误 */
  detail?: { correct_keys: string[]; wrong_keys: string[] }
}

/* ------------------------------------------------------------------ 存储键 */

const K_TOKEN = 'token'
const K_USER = 'user'
const K_USERS = 'users' // 注册用户表（原型用，密码以 base64 占位）
const K_PROGRESS = 'progress' // { [userId]: { [chapterId]: ProgressItem } }
const K_ANSWERS = 'answers' // { [userId]: AnswerRecord[] }
const K_FAVORITE = 'favorite' // { [userId]: number[] }
const K_ASSESS = 'assess_results' // { [userId]: AssessRecord[] }
const K_CIRCUIT = 'circuit_progress' // { [userId]: { [caseId]: CircuitProgress } }
const K_PROJECT = 'project_progress' // { [userId]: { [projectId]: ProjectProgress } }

/* ------------------------------------------------------------------ 工具 */

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms))

const ok = <T>(data: T, message = 'success'): ApiResult<T> => ({ code: 200, message, data })
const fail = (message: string, code = 400): ApiResult<never> => ({ code, message, data: undefined as never })

/** 演示账号：首次访问自动创建并登录，让用户零门槛体验全部功能 */
const DEMO: UserInfo = {
  id: 1,
  username: 'demo',
  nickname: '嵌入式学习者',
  avatar_url: '',
  created_at: '2026-09-01 10:00:00',
}

/* ------------------------------------------------------------------ 用户模块 */

/** POST /api/user/register */
async function register(username: string, password: string, nickname?: string): Promise<ApiResult<{ token: string; user: UserInfo }>> {
  await delay()
  const name = username.trim()
  if (name.length < 3) return fail('用户名至少 3 个字符')
  if (password.length < 6) return fail('密码至少 6 位')

  const users = readStore<Array<UserInfo & { password_hash: string }>>(K_USERS, [])
  if (users.some((u) => u.username === name)) return fail('该用户名已被注册')

  const user: UserInfo = {
    id: Date.now() % 100000 + 10,
    username: name,
    nickname: nickname?.trim() || name,
    avatar_url: '',
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  // 原型不存明文，做一次可逆混淆仅作占位；真实后端必须用 bcrypt/argon2
  users.push({ ...user, password_hash: btoa(unescape(encodeURIComponent(password))) })
  writeStore(K_USERS, users)

  const token = makeMockJwt({ uid: user.id, username: user.username })
  writeStore(K_TOKEN, token)
  writeStore(K_USER, user)
  return ok({ token, user }, '注册成功')
}

/** POST /api/user/login */
async function login(username: string, password: string): Promise<ApiResult<{ token: string; user: UserInfo }>> {
  await delay()
  const name = username.trim()

  // 演示账号：任意密码 6 位以上即可进入
  if (name === DEMO.username) {
    if (password.length < 6) return fail('密码至少 6 位')
    const token = makeMockJwt({ uid: DEMO.id, username: DEMO.username })
    writeStore(K_TOKEN, token)
    writeStore(K_USER, DEMO)
    return ok({ token, user: DEMO }, '登录成功')
  }

  const users = readStore<Array<UserInfo & { password_hash: string }>>(K_USERS, [])
  const found = users.find((u) => u.username === name)
  if (!found) return fail('用户不存在')
  if (found.password_hash !== btoa(unescape(encodeURIComponent(password)))) return fail('密码错误')

  const { password_hash, ...user } = found
  const token = makeMockJwt({ uid: user.id, username: user.username })
  writeStore(K_TOKEN, token)
  writeStore(K_USER, user)
  return ok({ token, user }, '登录成功')
}

/** 退出登录（原型自定义接口） */
async function logout(): Promise<ApiResult<null>> {
  await delay(120)
  writeStore(K_TOKEN, '')
  writeStore(K_USER, null)
  return ok(null, '已退出登录')
}

/** 当前会话（同步读取，供路由守卫 / 全局初始化使用） */
function currentSession(): { token: string; user: UserInfo } | null {
  const token = readStore<string>(K_TOKEN, '')
  const user = readStore<UserInfo | null>(K_USER, null)
  if (!token || !user) return null
  return { token, user }
}

/** 首次访问自动注入演示会话 */
function ensureDemoSession(): { token: string; user: UserInfo } {
  const s = currentSession()
  if (s) return s
  const token = makeMockJwt({ uid: DEMO.id, username: DEMO.username })
  writeStore(K_TOKEN, token)
  writeStore(K_USER, DEMO)
  return { token, user: DEMO }
}

/** GET /api/user/profile */
async function getProfile(): Promise<ApiResult<UserInfo>> {
  await delay(120)
  const s = currentSession()
  if (!s) return fail('未登录', 401)
  return ok(s.user)
}

/** PUT /api/user/profile */
async function updateProfile(patch: Partial<Pick<UserInfo, 'nickname' | 'avatar_url' | 'frame'>>): Promise<ApiResult<UserInfo>> {
  await delay()
  const s = currentSession()
  if (!s) return fail('未登录', 401)
  const next = { ...s.user, ...patch }
  writeStore(K_USER, next)
  // 同步用户表（否则注册用户重新登录后头像/头像框丢失）
  const users = readStore<Array<UserInfo & { password_hash: string }>>(K_USERS, [])
  const i = users.findIndex((u) => u.id === next.id)
  if (i >= 0) {
    users[i] = { ...users[i], ...patch }
    writeStore(K_USERS, users)
  }
  return ok(next, '资料已更新')
}

/* ------------------------------------------------------------------ 课程 & 章节 */

/** GET /api/course/list */
async function getCourseList(params?: { stage_type?: string; keyword?: string }): Promise<ApiResult<Course[]>> {
  await delay(160)
  let list = courses.filter((c) => c.is_published === 1 && c.is_deleted === 0)
  if (params?.stage_type && params.stage_type !== '全部') {
    list = list.filter((c) => c.stage_type === params.stage_type)
  }
  if (params?.keyword?.trim()) {
    const kw = params.keyword.trim().toLowerCase()
    list = list.filter(
      (c) => c.course_name.toLowerCase().includes(kw) || c.course_desc.toLowerCase().includes(kw),
    )
  }
  return ok(list.sort((a, b) => a.sort - b.sort))
}

/** GET /api/course/{id} */
async function getCourseDetail(id: number): Promise<ApiResult<{ course: Course; chapters: Chapter[] }>> {
  await delay(160)
  const course = getCourseById(id)
  if (!course) return fail('课程不存在', 404)
  return ok({ course, chapters: getChaptersByCourse(id) })
}

/** GET /api/chapter/list?course_id=xxx */
async function getChapterList(courseId: number): Promise<ApiResult<Chapter[]>> {
  await delay(160)
  return ok(getChaptersByCourse(courseId))
}

/** GET /api/chapter/{id} */
async function getChapterDetail(id: number): Promise<ApiResult<{ chapter: Chapter; course: Course; prev: Chapter | null; next: Chapter | null }>> {
  await delay(160)
  const chapter = chapters.find((c) => c.id === id && c.is_published === 1)
  if (!chapter) return fail('章节不存在', 404)
  const course = getCourseById(chapter.course_id)!
  const siblings = getChaptersByCourse(chapter.course_id)
  const idx = siblings.findIndex((c) => c.id === id)
  return ok({
    chapter,
    course,
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
  })
}

/** GET /api/chapter/{id}/animations */
async function getChapterAnimations(id: number): Promise<ApiResult<Animation[]>> {
  await delay(120)
  return ok(getAnimationsByChapter(id))
}

/** GET /api/search?keyword=xxx&scope=all|title —— 讲义全文检索（原型扩展） */
async function search(keyword: string, options: SearchOptions = {}): Promise<ApiResult<SearchHit[]>> {
  await delay(140)
  if (!keyword.trim()) return ok([])
  return ok(searchChapters(keyword, options))
}

/* ------------------------------------------------------------------ 题库 & 答题 */

/** GET /api/question/list?chapter_id=xxx */
async function getQuestionList(chapterId: number): Promise<ApiResult<Question[]>> {
  await delay(160)
  return ok(getQuestionsByChapter(chapterId))
}

const normalizeKeys = (s: string) =>
  s
    .replace(/[^A-Za-z对错]/g, '')
    .toUpperCase()
    .split('')
    .filter(Boolean)
    .sort()
    .join('')

/** POST /api/question/submit */
async function submitAnswer(payload: SubmitPayload): Promise<ApiResult<SubmitResult>> {
  await delay(260)
  const question = questions.find((q) => q.id === payload.question_id)
  if (!question) return fail('题目不存在', 404)

  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id

  let isCorrect: 0 | 1 | -1 = -1
  let detail: SubmitResult['detail'] | undefined

  if (question.question_type === '简答题') {
    // 主观题不做自动判分，返回参考答案供自评
    isCorrect = -1
  } else {
    const userKeys = normalizeKeys(payload.user_answer)
    const answerKeys = normalizeKeys(question.answer)
    isCorrect = userKeys === answerKeys ? 1 : 0
    if (question.question_type === '多选题') {
      const correct = question.answer.split('')
      detail = {
        correct_keys: correct,
        wrong_keys: payload.user_answer.split('').filter((k) => !correct.includes(k)),
      }
    }
  }

  // 写入答题记录（user_answer 表）
  const all = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const list = all[String(uid)] ?? []
  list.push({
    id: Date.now(),
    user_id: uid,
    question_id: question.id,
    chapter_id: question.chapter_id,
    user_answer: payload.user_answer,
    is_correct: isCorrect === 1 ? 1 : 0,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  })
  all[String(uid)] = list
  writeStore(K_ANSWERS, all)

  return ok({ is_correct: isCorrect, answer: question.answer, analysis: question.analysis, detail })
}

/** 主观题自评（原型扩展接口） */
async function selfJudge(questionId: number, correct: boolean): Promise<ApiResult<null>> {
  await delay(120)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const list = all[String(uid)] ?? []
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].question_id === questionId) {
      list[i].is_correct = correct ? 1 : 0
      break
    }
  }
  all[String(uid)] = list
  writeStore(K_ANSWERS, all)
  return ok(null, '已记录自评结果')
}

/** GET /api/user/wrong-questions —— 错题本：每题只看最近一次作答，且答错 */
async function getWrongQuestions(): Promise<ApiResult<Array<{ question: Question; record: AnswerRecord }>>> {
  await delay(180)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const list = all[String(uid)] ?? []

  const latest = new Map<number, AnswerRecord>()
  for (const r of list) latest.set(r.question_id, r) // 后写入覆盖，即为最近一次

  const result: Array<{ question: Question; record: AnswerRecord }> = []
  for (const rec of latest.values()) {
    if (rec.is_correct === 1) continue
    const question = questions.find((q) => q.id === rec.question_id)
    if (question) result.push({ question, record: rec })
  }
  result.sort((a, b) => (a.record.created_at < b.record.created_at ? 1 : -1))
  return ok(result)
}

/** GET /api/user/answer/history */
async function getAnswerHistory(): Promise<ApiResult<AnswerRecord[]>> {
  await delay(180)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  return ok([...(all[String(uid)] ?? [])].reverse())
}

/* ------------------------------------------------------------------ 学习进度 & 收藏 */

/** GET /api/progress/list（原型扩展，用于首页/个人中心） */
async function getProgressList(): Promise<ApiResult<ProgressItem[]>> {
  await delay(140)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, ProgressItem>>>(K_PROGRESS, {})
  return ok(Object.values(all[String(uid)] ?? {}))
}

/** POST /api/progress/update */
async function updateProgress(chapterId: number, readPercent: number): Promise<ApiResult<ProgressItem>> {
  await delay(100)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, ProgressItem>>>(K_PROGRESS, {})
  const mine = all[String(uid)] ?? {}
  const prev = mine[String(chapterId)]
  const percent = Math.max(prev?.read_percent ?? 0, Math.min(100, Math.round(readPercent)))
  const item: ProgressItem = {
    chapter_id: chapterId,
    read_percent: percent,
    is_finished: percent >= 95 ? 1 : 0,
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  mine[String(chapterId)] = item
  all[String(uid)] = mine
  writeStore(K_PROGRESS, all)
  return ok(item)
}

/** POST /api/favorite/toggle */
async function toggleFavorite(chapterId: number): Promise<ApiResult<{ favorited: boolean }>> {
  await delay(120)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, number[]>>(K_FAVORITE, {})
  const mine = all[String(uid)] ?? []
  const exists = mine.includes(chapterId)
  all[String(uid)] = exists ? mine.filter((x) => x !== chapterId) : [...mine, chapterId]
  writeStore(K_FAVORITE, all)
  return ok({ favorited: !exists }, exists ? '已取消收藏' : '已加入收藏')
}

/** GET /api/favorite/list */
async function getFavoriteList(): Promise<ApiResult<Chapter[]>> {
  await delay(160)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, number[]>>(K_FAVORITE, {})
  const ids = all[String(uid)] ?? []
  return ok(chapters.filter((c) => ids.includes(c.id)))
}

/** 同步读取收藏状态（避免首屏闪烁） */
function isFavorited(chapterId: number): boolean {
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, number[]>>(K_FAVORITE, {})
  return (all[String(uid)] ?? []).includes(chapterId)
}

/* ------------------------------------------------------------------ 原型演示数据 */

const fmtTime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * POST /api/dev/seed-activity —— **仅原型演示**
 * 周报页在没有历史记录时几乎全是 0，看不出图表效果，所以提供一个手动按钮，
 * 生成近 N 天的阅读与答题记录。写入的是与真实操作完全相同的两张本地表，
 * 因此周报、错题本、学习进度都会一致地反映这些数据。
 */
async function seedDemoActivity(days = 21): Promise<ApiResult<{ answers: number; chapters: number }>> {
  await delay(220)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id

  const ansAll = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const list = ansAll[String(uid)] ?? []
  const progAll = readStore<Record<string, Record<string, ProgressItem>>>(K_PROGRESS, {})
  const mine = progAll[String(uid)] ?? {}

  const now = new Date()
  let answersAdded = 0
  let chaptersAdded = 0
  let seq = 0

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    // 周末与部分工作日故意留白，让热力图出现断档，更接近真实节奏
    const wd = day.getDay()
    const p = wd === 0 ? 0.3 : wd === 6 ? 0.45 : 0.78
    if (Math.random() > p) continue

    // 当天读 1~2 章
    const readCount = Math.random() < 0.6 ? 1 : 2
    for (let k = 0; k < readCount; k++) {
      const ch = chapters[Math.floor(Math.random() * chapters.length)]
      const prev = mine[String(ch.id)]
      const percent = Math.max(prev?.read_percent ?? 0, 40 + Math.floor(Math.random() * 61))
      const t = new Date(day.getTime() + (9 + k * 5) * 3600_000 + Math.floor(Math.random() * 3600_000))
      mine[String(ch.id)] = {
        chapter_id: ch.id,
        read_percent: percent,
        is_finished: percent >= 95 ? 1 : 0,
        updated_at: fmtTime(t),
      }
      if (!prev) chaptersAdded += 1
    }

    // 当天做 2~7 道题，正确率大致 7 成
    const n = 2 + Math.floor(Math.random() * 6)
    for (let k = 0; k < n; k++) {
      const q = questions[Math.floor(Math.random() * questions.length)]
      const correct: 0 | 1 = Math.random() < 0.72 ? 1 : 0
      const t = new Date(day.getTime() + (10 + k) * 3600_000 + Math.floor(Math.random() * 1800_000))
      list.push({
        // 用「当天时间戳 + 序号」保证唯一，且自然保持时间顺序
        id: Math.floor(t.getTime() / 1000) * 100 + seq++,
        user_id: uid,
        question_id: q.id,
        chapter_id: q.chapter_id,
        user_answer: correct === 1 ? q.answer : 'X',
        is_correct: correct,
        created_at: fmtTime(t),
      })
      answersAdded += 1
    }
  }

  ansAll[String(uid)] = list
  progAll[String(uid)] = mine
  writeStore(K_ANSWERS, ansAll)
  writeStore(K_PROGRESS, progAll)

  return ok({ answers: answersAdded, chapters: chaptersAdded }, `已生成 ${answersAdded} 条答题记录、${chaptersAdded} 个章节进度`)
}

/** POST /api/dev/clear-activity —— 仅原型演示：清空当前账号的学习记录 */
async function clearActivity(): Promise<ApiResult<null>> {
  await delay(160)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const ansAll = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const progAll = readStore<Record<string, Record<string, ProgressItem>>>(K_PROGRESS, {})
  ansAll[String(uid)] = []
  progAll[String(uid)] = {}
  writeStore(K_ANSWERS, ansAll)
  writeStore(K_PROGRESS, progAll)
  return ok(null, '学习记录已清空')
}

/* ------------------------------------------------------------------ 效果检测成绩 */

/** 一次效果检测的成绩记录 */
export interface AssessRecord {
  id: number
  paper: PaperPreset
  paperName: string
  score: number
  correct: number
  total: number
  perCategory: CategoryScore[]
  created_at: string
}

/** POST /assess/save —— 保存一次检测结果（检测不写入错题本，独立存表） */
async function saveAssessmentResult(
  record: Pick<AssessRecord, 'paper' | 'paperName' | 'score' | 'correct' | 'total' | 'perCategory'>,
): Promise<ApiResult<AssessRecord>> {
  await delay(160)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const full: AssessRecord = {
    ...record,
    id: Date.now(),
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  const all = readStore<Record<string, AssessRecord[]>>(K_ASSESS, {})
  const list = all[String(uid)] ?? []
  list.push(full)
  all[String(uid)] = list
  writeStore(K_ASSESS, all)
  return ok(full, '成绩已保存')
}

/** GET /assess/history —— 检测成绩历史（新的在前） */
async function getAssessmentHistory(): Promise<ApiResult<AssessRecord[]>> {
  await delay(140)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, AssessRecord[]>>(K_ASSESS, {})
  return ok([...(all[String(uid)] ?? [])].reverse())
}

/** POST /assess/clear —— 清空检测成绩（原型扩展） */
async function clearAssessmentHistory(): Promise<ApiResult<null>> {
  await delay(120)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, AssessRecord[]>>(K_ASSESS, {})
  all[String(uid)] = []
  writeStore(K_ASSESS, all)
  return ok(null, '检测成绩已清空')
}

/* ------------------------------------------------------------------ 电路分析训练 */

/** 单个电路样例的训练进度 */
export interface CircuitProgress {
  caseId: string
  /** 最近一次检查点得分 */
  best: number
  total: number
  /** 是否已自评掌握 */
  mastered: 0 | 1
  attempts: number
  updated_at: string
}

/** 保存一次电路样例的训练结果（取历史最佳得分） */
async function saveCircuitProgress(progress: Pick<CircuitProgress, 'caseId' | 'best' | 'total' | 'mastered'>): Promise<ApiResult<CircuitProgress>> {
  await delay(140)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, CircuitProgress>>>(K_CIRCUIT, {})
  const mine = all[String(uid)] ?? {}
  const prev = mine[progress.caseId]
  const item: CircuitProgress = {
    caseId: progress.caseId,
    best: Math.max(prev?.best ?? 0, progress.best),
    total: progress.total,
    mastered: (prev?.mastered === 1 || progress.mastered === 1 ? 1 : 0) as 0 | 1,
    attempts: (prev?.attempts ?? 0) + 1,
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  mine[progress.caseId] = item
  all[String(uid)] = mine
  writeStore(K_CIRCUIT, all)
  return ok(item, '训练记录已保存')
}

/** 读取电路训练进度 */
async function getCircuitProgress(): Promise<ApiResult<Record<string, CircuitProgress>>> {
  await delay(120)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, CircuitProgress>>>(K_CIRCUIT, {})
  return ok(all[String(uid)] ?? {})
}

/* ------------------------------------------------------------------ 错题本 */

const K_WRONG = 'wrongbook' // { [userId]: { [key]: WrongEntry } }

/** 汇入错题（幂等：同一题重复错只累计计数并重置复习阶段） */
async function addWrongEntries(entries: WrongEntry[]): Promise<ApiResult<number>> {
  if (!entries.length) return ok(0)
  await delay(100)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, WrongEntry>>>(K_WRONG, {})
  const mine = all[String(uid)] ?? {}
  let added = 0
  for (const e of entries) {
    const prev = mine[e.key]
    if (prev) {
      mine[e.key] = { ...prev, wrongCount: prev.wrongCount + 1, stage: 0, streak: 0, dueAt: e.dueAt }
    } else {
      mine[e.key] = e
      added++
    }
  }
  all[String(uid)] = mine
  writeStore(K_WRONG, all)
  return ok(added, `已汇入 ${added} 道错题`)
}

/** 读取全部错题 */
async function getWrongbook(): Promise<ApiResult<WrongEntry[]>> {
  await delay(120)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, WrongEntry>>>(K_WRONG, {})
  return ok(Object.values(all[String(uid)] ?? {}))
}

/** 复习作答回写：correct 推进艾宾浩斯阶段，连续 2 次答对毕业移出 */
async function reviewWrong(key: string, correct: boolean): Promise<ApiResult<ReviewOutcome>> {
  await delay(80)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, WrongEntry>>>(K_WRONG, {})
  const mine = all[String(uid)] ?? {}
  const e = mine[key]
  if (!e) return ok('wrong', '错题不存在')
  const { entry, outcome } = applyReview(e, correct)
  if (outcome === 'graduated') delete mine[key]
  else mine[key] = entry
  all[String(uid)] = mine
  writeStore(K_WRONG, all)
  return ok(outcome, outcome === 'graduated' ? '连续两次答对，已毕业移出错题本' : undefined)
}

/** 手动移出错题 */
async function removeWrong(key: string): Promise<ApiResult<boolean>> {
  await delay(80)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, WrongEntry>>>(K_WRONG, {})
  const mine = all[String(uid)] ?? {}
  delete mine[key]
  all[String(uid)] = mine
  writeStore(K_WRONG, all)
  return ok(true)
}

/** 清空错题本 */
async function clearWrongbook(): Promise<ApiResult<boolean>> {
  await delay(80)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, WrongEntry>>>(K_WRONG, {})
  all[String(uid)] = {}
  writeStore(K_WRONG, all)
  return ok(true)
}

/* ------------------------------------------------------------------ 项目库进度 */

export interface ProjectProgress {
  projectId: string
  /** 已完成打勾的小节 id 集合 */
  doneSteps: string[]
  updated_at: string
}

/** 保存项目学习进度（整包覆盖 doneSteps，调用方基于最新数据增删后提交） */
async function saveProjectProgress(projectId: string, doneSteps: string[]): Promise<ApiResult<ProjectProgress>> {
  await delay(120)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, ProjectProgress>>>(K_PROJECT, {})
  const mine = all[String(uid)] ?? {}
  const item: ProjectProgress = {
    projectId,
    doneSteps,
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  mine[projectId] = item
  all[String(uid)] = mine
  writeStore(K_PROJECT, all)
  return ok(item, '项目进度已保存')
}

/** 读取全部项目进度 */
async function getProjectProgress(): Promise<ApiResult<Record<string, ProjectProgress>>> {
  await delay(100)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const all = readStore<Record<string, Record<string, ProjectProgress>>>(K_PROJECT, {})
  return ok(all[String(uid)] ?? {})
}

/* ------------------------------------------------------------------ 学习记录备份（导出 / 导入） */

/** 备份文件结构：version 用于将来字段变更时的兼容判断 */
export interface UserDataExport {
  app: 'EmbedMaster'
  version: number
  exported_at: string
  user: { username: string; nickname: string }
  progress: ProgressItem[]
  answers: AnswerRecord[]
  favorites: number[]
}

export interface ImportSummary {
  progress: number
  answers: number
  favorites: number
  skipped: number
}

/** GET /api/user/export —— 把当前账号的全部学习数据打包成一个 JSON 对象 */
async function exportUserData(): Promise<ApiResult<UserDataExport>> {
  await delay(160)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id
  const user = s?.user ?? DEMO

  const progAll = readStore<Record<string, Record<string, ProgressItem>>>(K_PROGRESS, {})
  const ansAll = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const favAll = readStore<Record<string, number[]>>(K_FAVORITE, {})

  return ok({
    app: 'EmbedMaster',
    version: 1,
    exported_at: fmtTime(new Date()),
    user: { username: user.username, nickname: user.nickname },
    progress: Object.values(progAll[String(uid)] ?? {}),
    answers: [...(ansAll[String(uid)] ?? [])],
    favorites: [...(favAll[String(uid)] ?? [])],
  })
}

/**
 * POST /api/user/import —— 导入备份文件
 * - merge：与现有记录合并（进度取更高的那个、答题按「题目+时间+答案」去重、收藏取并集）
 * - replace：覆盖当前账号的三张表（慎选，现有记录会被清掉）
 * 非法条目（章节/题目不存在于当前题库的）会被跳过并计入 skipped。
 */
async function importUserData(payload: UserDataExport, mode: 'merge' | 'replace'): Promise<ApiResult<ImportSummary>> {
  await delay(260)
  const s = currentSession()
  const uid = s?.user.id ?? DEMO.id

  // ---- 结构校验：必须是本平台导出的备份 ----
  if (
    !payload ||
    payload.app !== 'EmbedMaster' ||
    typeof payload.version !== 'number' ||
    !Array.isArray(payload.progress) ||
    !Array.isArray(payload.answers) ||
    !Array.isArray(payload.favorites)
  ) {
    return fail('这不是 EmbedMaster 的备份文件，请重新导出后再试')
  }

  const chIds = new Set(chapters.map((c) => c.id))
  const qIds = new Set(questions.map((q) => q.id))

  // 过滤掉指向不存在章节 / 题目的脏数据
  const progress = payload.progress.filter(
    (p) => p && chIds.has(p.chapter_id) && typeof p.read_percent === 'number' && p.read_percent >= 0 && p.read_percent <= 100,
  )
  const answers = payload.answers.filter(
    (a) => a && qIds.has(a.question_id) && (a.is_correct === 0 || a.is_correct === 1),
  )
  const favorites = payload.favorites.filter((id) => chIds.has(id))
  const skipped = payload.progress.length + payload.answers.length + payload.favorites.length - progress.length - answers.length - favorites.length

  const progAll = readStore<Record<string, Record<string, ProgressItem>>>(K_PROGRESS, {})
  const ansAll = readStore<Record<string, AnswerRecord[]>>(K_ANSWERS, {})
  const favAll = readStore<Record<string, number[]>>(K_FAVORITE, {})
  const mine = progAll[String(uid)] ?? {}
  const list = ansAll[String(uid)] ?? []
  const favs = favAll[String(uid)] ?? []

  if (mode === 'replace') {
    for (const p of progress) mine[String(p.chapter_id)] = { ...p }
    list.length = 0
    list.push(...answers)
    favAll[String(uid)] = [...new Set(favorites)]
  } else {
    // 进度：同一章取读得更远的那个
    for (const p of progress) {
      const prev = mine[String(p.chapter_id)]
      if (!prev || p.read_percent > prev.read_percent) mine[String(p.chapter_id)] = { ...p }
    }
    // 答题记录：按「题目 + 时间 + 用户答案」去重（跨设备导出的同一条不重复计入）
    const seen = new Set(list.map((r) => `${r.question_id}|${r.created_at}|${r.user_answer}`))
    let seq = 0
    const base = Date.now()
    for (const a of answers) {
      const key = `${a.question_id}|${a.created_at}|${a.user_answer}`
      if (seen.has(key)) continue
      seen.add(key)
      // 重新分配 id，避免与现有记录的 Date.now 型 id 撞车
      list.push({ ...a, id: base + seq++ })
    }
    list.sort((x, y) => (x.created_at < y.created_at ? -1 : 1))
    favAll[String(uid)] = [...new Set([...favs, ...favorites])]
  }

  progAll[String(uid)] = mine
  ansAll[String(uid)] = list
  writeStore(K_PROGRESS, progAll)
  writeStore(K_ANSWERS, ansAll)
  writeStore(K_FAVORITE, favAll)

  return ok(
    { progress: progress.length, answers: answers.length, favorites: favorites.length, skipped },
    mode === 'replace' ? '已覆盖导入' : '已合并导入',
  )
}

/* ------------------------------------------------------------------ 导出 */

export const api = {
  // 用户
  register,
  login,
  logout,
  currentSession,
  ensureDemoSession,
  getProfile,
  updateProfile,
  // 课程 & 章节
  getCourseList,
  getCourseDetail,
  getChapterList,
  getChapterDetail,
  getChapterAnimations,
  search,
  // 题库 & 答题
  getQuestionList,
  submitAnswer,
  selfJudge,
  getWrongQuestions,
  getAnswerHistory,
  // 进度 & 收藏
  getProgressList,
  updateProgress,
  toggleFavorite,
  getFavoriteList,
  isFavorited,
  // 原型演示数据（周报页用）
  seedDemoActivity,
  clearActivity,
  // 学习记录备份
  exportUserData,
  importUserData,
  // 效果检测
  saveAssessmentResult,
  getAssessmentHistory,
  clearAssessmentHistory,
  // 电路分析训练
  saveCircuitProgress,
  getCircuitProgress,
  addWrongEntries,
  getWrongbook,
  reviewWrong,
  removeWrong,
  clearWrongbook,
  saveProjectProgress,
  getProjectProgress,
  // 数据源（只读，供统计）
  allCourses: courses,
  allChapters: chapters,
  allQuestions: questions,
  allAnimations: animations,
}

export default api
