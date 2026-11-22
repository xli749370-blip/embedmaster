/**
 * 错题本与学习画像 · 统一错题数据层
 * ------------------------------------------------------------------
 * - 全站错题统一沉淀：效果检测（assess）/ 电路检查点（circuit）
 * - 六维能力画像：元件认知 / 电路分析 / 参数计算 / 软件开发 / 通信协议 / 调试排查
 * - 艾宾浩斯复习队列：1/3/7/15 天间隔推进，连续答对 2 次毕业移出
 * - 存储走 api 层（localStorage per-user），本文件只放纯逻辑与类型
 */

export type Dim = '元件认知' | '电路分析' | '参数计算' | '软件开发' | '通信协议' | '调试排查'

export const DIMS: Dim[] = ['元件认知', '电路分析', '参数计算', '软件开发', '通信协议', '调试排查']

export type WrongSource = 'assess' | 'circuit'

export const SOURCE_META: Record<WrongSource, { label: string; to: string }> = {
  assess: { label: '效果检测', to: '/assess' },
  circuit: { label: '电路训练', to: '/circuit' },
}

export interface WrongEntry {
  /** 唯一键：'assess-9012' | 'circuit-c14#q2' */
  key: string
  source: WrongSource
  refId: string
  /** 题干摘要 */
  title: string
  dim: Dim
  /** 考点标签 */
  tag: string
  addedAt: number
  /** 艾宾浩斯阶段 0..3 → 间隔 [1,3,7,15] 天 */
  stage: number
  /** 连续答对次数（>=2 毕业） */
  streak: number
  /** 下次应复习时间戳 */
  dueAt: number
  wrongCount: number
}

/** 检测题分类 → 六维映射 */
export function dimOfAssess(category: string): Dim {
  switch (category) {
    case '元件特性': return '元件认知'
    case '元件计算': return '参数计算'
    case '电路设计': return '电路分析'
    case '软件开发': return '软件开发'
    default: return '调试排查'
  }
}

/** 艾宾浩斯间隔（天） */
export const REVIEW_INTERVALS = [1, 3, 7, 15]
const DAY = 24 * 3600 * 1000

export function nextDue(stage: number, now = Date.now()): number {
  return now + REVIEW_INTERVALS[Math.min(stage, REVIEW_INTERVALS.length - 1)] * DAY
}

/** 新错题构造 */
export function makeEntry(p: {
  source: WrongSource
  refId: string
  title: string
  dim: Dim
  tag: string
}): WrongEntry {
  return {
    key: `${p.source}-${p.refId}`,
    source: p.source,
    refId: p.refId,
    title: p.title,
    dim: p.dim,
    tag: p.tag,
    addedAt: Date.now(),
    stage: 0,
    streak: 0,
    dueAt: nextDue(0),
    wrongCount: 1,
  }
}

/** 复习作答结果 → 返回条目的下一状态；'graduated' 表示连续两次答对毕业 */
export type ReviewOutcome = 'correct' | 'wrong' | 'graduated'

export function applyReview(e: WrongEntry, correct: boolean, now = Date.now()): { entry: WrongEntry; outcome: ReviewOutcome } {
  if (!correct) {
    return {
      entry: { ...e, stage: 0, streak: 0, wrongCount: e.wrongCount + 1, dueAt: nextDue(0, now) },
      outcome: 'wrong',
    }
  }
  const streak = e.streak + 1
  if (streak >= 2) return { entry: { ...e, streak }, outcome: 'graduated' }
  const stage = Math.min(e.stage + 1, REVIEW_INTERVALS.length - 1)
  return { entry: { ...e, stage, streak, dueAt: nextDue(stage, now) }, outcome: 'correct' }
}

/** 六维画像：每维统计 [活跃错题数, 累计错误次数] → 薄弱值 0~100 */
export function dimProfile(entries: WrongEntry[]): Array<{ dim: Dim; active: number; wrong: number; weak: number }> {
  return DIMS.map((dim) => {
    const list = entries.filter((e) => e.dim === dim)
    const active = list.length
    const wrong = list.reduce((s, e) => s + e.wrongCount, 0)
    const weak = Math.min(100, active * 20 + Math.floor(wrong / 2) * 5)
    return { dim, active, wrong, weak }
  })
}

/** 答案归一化比较（大小写/空格/逗号序） */
export function normCompare(a: string, b: string): boolean {
  const n = (s: string) => s.toUpperCase().replace(/\s+/g, '').split(',').filter(Boolean).sort().join(',')
  return n(a) === n(b)
}
