/**
 * 学习周报统计
 * ------------------------------------------------------------------
 * 数据全部来自本地记录，不依赖后端：
 * - progress：`{ chapter_id, read_percent, is_finished, updated_at }`，
 *   每个章节只保留最后一次阅读时间，所以「当天阅读」只能统计到「这一天
 *   有哪些章节被读过」，拿不到每次阅读的时长与次数。
 * - answers：每次作答一条，含 `is_correct` 与 `created_at`，是唯一能按天
 *   精确聚合的序列。
 *
 * 所有函数都是纯函数（传入 now，便于测试与「查看历史周报」），
 * 只负责算数，不碰 DOM 也不写存储。
 */
import { chapters, courses, getCourseById } from '@/mock/data'
import type { AnswerRecord, ProgressItem } from '@/api'

/* ------------------------------------------------------------------ 类型 */

export interface DayStat {
  /** YYYY-MM-DD */
  key: string
  /** 轴标签：周一 ~ 周日 */
  weekday: string
  /** 轴标签：8/12 */
  label: string
  answers: number
  correct: number
  /** 当天被阅读过的章节数（去重） */
  chapters: number
  isToday: boolean
}

export interface HeatCell {
  key: string
  label: string
  level: 0 | 1 | 2 | 3 | 4
  answers: number
  chapters: number
}

export interface CourseStat {
  course_id: number
  name: string
  theme: string
  total: number
  /** 有阅读记录且读过一定比例的章节数 */
  read: number
  finished: number
  answers: number
  correct: number
  /** 正确率 0~100；本周没有作答时为 -1 */
  accuracy: number
  /** 掌握度 0~100：已读完占比 60% + 正确率 40% */
  mastery: number
}

export interface WeakChapter {
  chapter_id: number
  chapter_name: string
  course_name: string
  wrong: number
  total: number
  accuracy: number
}

export interface Suggestion {
  tone: 'good' | 'warn' | 'info'
  title: string
  text: string
  to?: string
}

export interface Report {
  /** 近 7 天，按时间正序（最后一项是今天） */
  days: DayStat[]
  /** 近 28 天热力图，按时间正序 */
  heat: HeatCell[]
  totals: {
    weekAnswers: number
    weekCorrect: number
    /** 正确率 0~100，本周无作答为 -1 */
    weekAccuracy: number
    /** 本周有阅读动作的章节数 */
    weekChapters: number
    readChapters: number
    finishedChapters: number
    streak: number
    wrongOpen: number
    /** 本周活跃天数 */
    activeDays: number
  }
  courses: CourseStat[]
  weak: WeakChapter[]
  suggestions: Suggestion[]
  /** 完全没有学习记录时为 true，页面据此展示引导 */
  empty: boolean
}

/* ------------------------------------------------------------------ 工具 */

/** 后端返回的时间是 `YYYY-MM-DD HH:mm:ss`，Safari 不接受空格分隔，统一换成 T */
function parseTime(s: string): Date {
  const t = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

const pad = (n: number) => String(n).padStart(2, '0')

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 取某个时刻所在那天的零点，用于按天分桶 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/* ------------------------------------------------------------------ 主函数 */

export function buildReport(progress: ProgressItem[], answers: AnswerRecord[], now = new Date()): Report {
  const today = startOfDay(now)

  /** 逐天聚合：答题数、答对数、当天读过的章节集合 */
  const buckets = new Map<string, { answers: number; correct: number; chapters: Set<number> }>()
  const bucketOf = (key: string) => {
    let b = buckets.get(key)
    if (!b) {
      b = { answers: 0, correct: 0, chapters: new Set<number>() }
      buckets.set(key, b)
    }
    return b
  }

  for (const a of answers) {
    const b = bucketOf(dayKey(parseTime(a.created_at)))
    b.answers += 1
    if (a.is_correct === 1) b.correct += 1
  }
  for (const p of progress) {
    if (p.read_percent <= 0) continue
    bucketOf(dayKey(parseTime(p.updated_at))).chapters.add(p.chapter_id)
  }

  const statOf = (key: string) => buckets.get(key) ?? { answers: 0, correct: 0, chapters: new Set<number>() }

  /* ---------- 近 7 天 ---------- */
  const days: DayStat[] = []
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    const key = dayKey(d)
    const b = statOf(key)
    days.push({
      key,
      weekday: WEEKDAYS[d.getDay()],
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      answers: b.answers,
      correct: b.correct,
      chapters: b.chapters.size,
      isToday: i === 0,
    })
  }

  /* ---------- 近 28 天热力图 ---------- */
  const heat: HeatCell[] = []
  for (let i = 27; i >= 0; i--) {
    const d = addDays(today, -i)
    const key = dayKey(d)
    const b = statOf(key)
    // 活动量 = 答题数 + 读过的章节数 × 2（读一章比做一题更重）
    const amount = b.answers + b.chapters.size * 2
    const level = (amount === 0 ? 0 : amount <= 2 ? 1 : amount <= 5 ? 2 : amount <= 10 ? 3 : 4) as HeatCell['level']
    heat.push({ key, label: `${d.getMonth() + 1}月${d.getDate()}日`, level, answers: b.answers, chapters: b.chapters.size })
  }

  /* ---------- 本周汇总 ---------- */
  const weekAnswers = days.reduce((s, d) => s + d.answers, 0)
  const weekCorrect = days.reduce((s, d) => s + d.correct, 0)
  const weekChapterSet = new Set<number>()
  for (const d of days) {
    const b = statOf(d.key)
    for (const id of b.chapters) weekChapterSet.add(id)
  }
  const activeDays = days.filter((d) => d.answers > 0 || d.chapters > 0).length
  /** 正确率 -1 表示本周没有作答，页面显示「—」而不是 0% */
  const weekAccuracy = weekAnswers ? Math.round((weekCorrect / weekAnswers) * 100) : -1

  const readChapters = progress.filter((p) => p.read_percent > 0).length
  const finishedChapters = progress.filter((p) => p.is_finished === 1).length

  /* ---------- 连续学习天数 ---------- */
  // 今天还没学不算断：从今天开始数，今天空则从昨天起算
  const hasActivity = (d: Date) => {
    const b = statOf(dayKey(d))
    return b.answers > 0 || b.chapters.size > 0
  }
  let streak = 0
  let cursor = hasActivity(today) ? today : addDays(today, -1)
  while (hasActivity(cursor) && streak < 365) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  /* ---------- 错题（每章最近一次仍错） ---------- */
  const latest = new Map<number, AnswerRecord>()
  for (const a of answers) latest.set(a.question_id, a) // 顺序写入，后写覆盖前写
  const wrongList = Array.from(latest.values()).filter((a) => a.is_correct === 0)

  /* ---------- 章节级答题统计（用于薄弱章节） ---------- */
  const perChapter = new Map<number, { total: number; wrong: number }>()
  for (const a of answers) {
    const cur = perChapter.get(a.chapter_id) ?? { total: 0, wrong: 0 }
    cur.total += 1
    if (a.is_correct === 0) cur.wrong += 1
    perChapter.set(a.chapter_id, cur)
  }

  /* ---------- 各课程掌握度 ---------- */
  const weekKeys = new Set(days.map((d) => d.key))
  const courseStats: CourseStat[] = courses.map((c) => {
    const list = chapters.filter((x) => x.course_id === c.id)
    const ids = new Set(list.map((x) => x.id))
    const mine = progress.filter((p) => ids.has(p.chapter_id) && p.read_percent > 0)
    const finished = mine.filter((p) => p.is_finished === 1).length
    const weekAns = answers.filter((a) => ids.has(a.chapter_id) && weekKeys.has(dayKey(parseTime(a.created_at))))
    const correct = weekAns.filter((a) => a.is_correct === 1).length
    const accuracy = weekAns.length ? Math.round((correct / weekAns.length) * 100) : -1
    // 掌握度用「阅读进度均值」而不是「读完章数」：一章读了 60% 也该有分数，
    // 否则大部分课程会永远停在 0%，条形图看起来像没读过。
    const readRatio = list.length
      ? mine.reduce((s, p) => s + Math.min(100, Math.max(0, p.read_percent)), 0) / 100 / list.length
      : 0
    const mastery = Math.round(accuracy < 0 ? readRatio * 100 : readRatio * 100 * 0.6 + accuracy * 0.4)
    return {
      course_id: c.id,
      name: c.course_name,
      theme: c.cover_theme,
      total: list.length,
      read: mine.length,
      finished,
      answers: weekAns.length,
      correct,
      accuracy,
      mastery,
    }
  })

  /* ---------- 薄弱章节 Top 5 ---------- */
  const weak: WeakChapter[] = []
  for (const [chapterId, s] of perChapter) {
    if (s.wrong === 0) continue
    const ch = chapters.find((x) => x.id === chapterId)
    if (!ch) continue
    weak.push({
      chapter_id: chapterId,
      chapter_name: ch.chapter_name,
      course_name: getCourseById(ch.course_id)?.course_name ?? '',
      wrong: s.wrong,
      total: s.total,
      accuracy: Math.round(((s.total - s.wrong) / s.total) * 100),
    })
  }
  weak.sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
  const weakTop = weak.slice(0, 5)

  /* ---------- 学习建议 ---------- */
  const suggestions: Suggestion[] = []

  if (streak >= 3) {
    suggestions.push({
      tone: 'good',
      title: `已连续 ${streak} 天`,
      text: '连续学习比单次时长更重要，保持这个节奏就好。',
    })
  }

  if (weekAnswers >= 5 && weekAccuracy >= 0 && weekAccuracy < 60) {
    const target = weakTop[0]
    suggestions.push({
      tone: 'warn',
      title: `本周正确率 ${weekAccuracy}%`,
      text: target
        ? `错误集中在《${target.chapter_name}》，建议先回看这一章再刷一遍错题。`
        : '建议放慢速度，先把每道题的解析读完再答下一题。',
      to: target ? `/chapter/${target.chapter_id}` : undefined,
    })
  } else if (weekAnswers >= 10 && weekAccuracy >= 85) {
    suggestions.push({
      tone: 'good',
      title: `本周正确率 ${weekAccuracy}%`,
      text: '基础题已经稳了，可以试试跨章节的综合练习。',
      to: '/quiz',
    })
  }

  if (wrongList.length > 0) {
    suggestions.push({
      tone: 'info',
      title: `还有 ${wrongList.length} 道错题未清`,
      text: '错题本只保留每题最近一次作答仍错的那道，答对就自动移除。',
      to: '/quiz?wrong=1',
    })
  }

  const untouched = courseStats.filter((c) => c.total > 0 && c.read === 0)
  if (untouched.length > 0) {
    suggestions.push({
      tone: 'info',
      title: `${untouched.length} 门课程还没开始`,
      text: `《${untouched[0].name}》一章都还没读，按课程顺序补上会顺一些。`,
      to: `/course/${untouched[0].course_id}`,
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      tone: 'info',
      title: '先读一章',
      text: '读完一章会自动记录进度，答几道题就能看到正确率曲线。',
      to: '/courses',
    })
  }

  const empty = answers.length === 0 && progress.every((p) => p.read_percent <= 0)

  return {
    days,
    heat,
    totals: {
      weekAnswers,
      weekCorrect,
      weekAccuracy,
      weekChapters: weekChapterSet.size,
      readChapters,
      finishedChapters,
      streak,
      wrongOpen: wrongList.length,
      activeDays,
    },
    courses: courseStats,
    weak: weakTop,
    suggestions: suggestions.slice(0, 3),
    empty,
  }
}
