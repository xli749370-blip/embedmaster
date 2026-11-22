/**
 * 成就系统全局状态（单例）+ 头像/头像框佩戴
 * - 进度数据全部来自本地已有学习行为数据（打卡/答题/章节/工程库/电路/错题本）
 * - 领取（claim）后奖励头像框进入「衣柜」，全站头像可佩戴
 * - 头像与头像框挂在用户资料上（api.updateProfile）
 */
import { computed, ref } from 'vue'
import api, { type WrongEntry } from '@/api'
import { readStore, writeStore } from '@/utils/storage'
import { ACHIEVEMENTS, frameTier, frameMaxTier, type AchievementDef, type MetricKey } from '@/mock/achievements'
import { useAuth } from '@/composables/useAuth'

interface AchvStats {
  streak: number
  checkins: number
  chapters: number
  answers: number
  correct: number
  accuracy: number
  wrongClear: number
  projSteps: number
  projDone: number
  circuit: number
}

const ZERO: AchvStats = {
  streak: 0, checkins: 0, chapters: 0, answers: 0, correct: 0,
  accuracy: 0, wrongClear: 0, projSteps: 0, projDone: 0, circuit: 0,
}

/** claimed: { [userId]: AchievementDef['id'][] } */
const claimedMap = ref<Record<string, string[]>>(readStore('achievements', {} as Record<string, string[]>))
const stats = ref<AchvStats>({ ...ZERO })
const loaded = ref(false)
const loading = ref(false)

const K_CHECKINS = 'roadmap_checkins'
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const { user: authUser } = useAuth()
const uidOf = () => String(authUser.value?.id ?? 'local_default')

/** 连续签到天数（与 RoadmapView 口径一致：今天没签从昨天起算） */
function calcStreak(checkins: Record<string, number>): number {
  let n = 0
  const d = new Date()
  if (!checkins[dayKey(d)]) d.setDate(d.getDate() - 1)
  while (checkins[dayKey(d)]) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** 从全站数据源统计成就指标 */
async function refresh() {
  if (loading.value) return
  loading.value = true
  try {
    const [prog, ans, wrong, proj, circuit] = await Promise.all([
      api.getProgressList(),
      api.getAnswerHistory(),
      api.getWrongbook(),
      api.getProjectProgress(),
      api.getCircuitProgress(),
    ])

    const checkins = readStore<Record<string, number>>(K_CHECKINS, {})

    const chapters = prog.data.filter((p) => p.is_finished === 1).length
    const answers = ans.data.length
    const correct = ans.data.filter((h) => h.is_correct === 1).length
    const accuracy = answers >= 30 ? Math.round((correct / answers) * 100) : 0

    // 错题清零成就：错题本「历史峰值 ≥10 道」且当前清零才达成（防止新用户空错题本白拿）
    const wrongList = wrong.data as WrongEntry[]
    const peakMap = readStore<Record<string, number>>('wrongbook_peak', {})
    const peak = Math.max(peakMap[uidOf()] ?? 0, wrongList.length)
    if (peak !== peakMap[uidOf()]) {
      peakMap[uidOf()] = peak
      writeStore('wrongbook_peak', peakMap)
    }
    const wrongClear = peak >= 10 && wrongList.length === 0 ? 1 : 0

    const projList = Object.values(proj.data ?? {})
    const projSteps = projList.reduce((n, p) => n + (p.doneSteps?.length ?? 0), 0)
    // 完成项目：完成小节数 ≥ 该项目总小节数的 80%（宽松口径，避免卡在最后几节）
    const { projects, projectStepCount } = await import('@/mock/projects')
    const projDone = projects.filter((p) => {
      const done = proj.data?.[p.id]?.doneSteps?.length ?? 0
      return done > 0 && done >= Math.ceil(projectStepCount(p) * 0.8)
    }).length

    const circuitList = Object.values(circuit.data ?? {})
    const circuitDone = circuitList.filter((c) => c.mastered === 1 || c.attempts > 0).length

    stats.value = {
      streak: calcStreak(checkins),
      checkins: Object.keys(checkins).length,
      chapters,
      answers,
      correct,
      accuracy,
      wrongClear,
      projSteps,
      projDone,
      circuit: circuitDone,
    }
    loaded.value = true
  } finally {
    loading.value = false
  }
}

function metricValue(m: MetricKey): number {
  return stats.value[m]
}

export function useAchievements() {
  const { user } = useAuth()
  const uid = computed(() => String(user.value?.id ?? 'local_default'))
  const claimed = computed(() => claimedMap.value[uid.value] ?? [])

  /** 每个成就的实时进度 */
  const list = computed(() =>
    ACHIEVEMENTS.map((a) => {
      const value = Math.min(metricValue(a.metric), a.target)
      const done = metricValue(a.metric) >= a.target
      return { ...a, value, done, claimed: claimed.value.includes(a.id) }
    }),
  )

  /** 可领取（已完成但未领）数量 —— 供红点提示 */
  const claimableCount = computed(() => list.value.filter((a) => a.done && !a.claimed).length)

  /** 已领取成就解锁的头像框 id 集合（none 恒可用） */
  const unlockedFrames = computed(() => {
    const ids = new Set<string>(['none'])
    for (const a of ACHIEVEMENTS) {
      if (claimed.value.includes(a.id)) ids.add(a.frame)
    }
    return ids
  })

  /** 每个已解锁头像框的当前阶数（阶数完全由已领成就推导，无需额外存储） */
  const frameLevels = computed<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const id of unlockedFrames.value) out[id] = frameTier(id, claimed.value)
    return out
  })

  function claim(id: string): { ok: boolean; frame?: string; tier?: number; maxTier?: number } {
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (!def) return { ok: false }
    if (!stats.value[def.metric] || stats.value[def.metric] < def.target) return { ok: false }
    const cur = claimedMap.value[uid.value] ?? []
    if (cur.includes(id)) return { ok: false }
    const next = [...cur, id]
    claimedMap.value = { ...claimedMap.value, [uid.value]: next }
    writeStore('achievements', claimedMap.value)
    return { ok: true, frame: def.frame, tier: frameTier(def.frame, next), maxTier: frameMaxTier(def.frame) }
  }

  return { list, stats, loaded, claimableCount, unlockedFrames, frameLevels, claim, refresh }
}

/**
 * 当前用户某头像框的阶数（0 = 未解锁）。
 * 给 UserAvatar 这类不持有成就列表的组件直接用；在 computed 中调用可正常追踪依赖。
 */
export function currentFrameTier(frameId: string): number {
  return frameTier(frameId, claimedMap.value[uidOf()] ?? [])
}
