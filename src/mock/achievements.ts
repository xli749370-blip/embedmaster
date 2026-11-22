/**
 * 成就系统与头像框定义
 * - 头像框（AvatarFrame）：达成成就后领取，佩戴后全站头像生效
 * - 成就（AchievementDef）：按学习行为进度解锁，领取后奖励头像框
 * 进度数据来源（全部本地已有）：打卡 / 答题 / 章节进度 / 工程库 / 电路训练场 / 错题本
 */

/* ---------------- 头像框 ---------------- */

export interface AvatarFrame {
  id: string
  name: string
  /** 环体主材：多层渐变（大理石纹 / 金属反光带），直接用于环的 background-image */
  css: string
  /** 材质类型：金属 / 宝石刻面 / 余烬。决定是否叠刻面纹理 */
  mat?: 'metal' | 'gem' | 'ember'
  /** 发光阴影（可选，旧字段，保留给不支持进阶的场景） */
  glow?: string
  /** 主色调：进阶时用它生成外圈亮环与光晕，缺省则该框不参与进阶 */
  tint?: string
}

/**
 * 环体主材改为「多段明暗」的渐变：像抛光金属的高光带 / 宝石的切面反光，
 * 而不是原来两三个色标的纯色渐变。材质决定 48px 下能不能看出是金属还是石头。
 */
export const FRAMES: AvatarFrame[] = [
  { id: 'none', name: '无框', css: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)' },
  {
    id: 'bronze',
    name: '青铜环',
    mat: 'metal',
    css: 'linear-gradient(150deg,#ffe9c6 0%,#e79f45 18%,#8a4712 40%,#c2792b 56%,#ffdda8 72%,#a85f1a 88%,#f6d3a0 100%)',
    tint: '#d97706',
  },
  {
    id: 'silver',
    name: '星银环',
    mat: 'metal',
    css: 'linear-gradient(150deg,#ffffff 0%,#dbe4ef 16%,#6d7a8b 38%,#c3cfdd 54%,#ffffff 70%,#828f9f 86%,#e8eef6 100%)',
    tint: '#94a3b8',
  },
  {
    id: 'gold',
    name: '鎏金环',
    mat: 'metal',
    css: 'conic-gradient(from 198deg,#fff8d8,#f7be0c 14%,#7f5200 32%,#ffe680 48%,#e09b00 64%,#8a5c00 80%,#fffbdc 94%,#f0a800)',
    tint: '#f59e0b',
  },
  {
    id: 'emerald',
    name: '翡翠环',
    mat: 'gem',
    css: 'conic-gradient(from 30deg,#d9fff0,#2fd39b 16%,#0a7a56 34%,#8ff5cb 50%,#12996e 66%,#0d6749 84%,#eafff6)',
    tint: '#10b981',
  },
  {
    id: 'sapphire',
    name: '蓝宝环',
    mat: 'gem',
    css: 'conic-gradient(from 120deg,#e4f1ff,#3b82f6 16%,#1e3a8a 34%,#a5cdff 50%,#2563eb 66%,#1b2f6b 84%,#f2f9ff)',
    tint: '#3b82f6',
  },
  {
    id: 'violet',
    name: '极光环',
    mat: 'gem',
    css: 'conic-gradient(from 0deg,#efe4ff,#f472b6 18%,#6d28d9 36%,#8fc0ff 52%,#a78bfa 68%,#4c1d95 84%,#f7f0ff)',
    tint: '#a78bfa',
  },
  {
    id: 'flame',
    name: '烈焰环',
    mat: 'ember',
    css: 'conic-gradient(from 180deg,#ffe0a3,#f97316 16%,#7f1d1d 36%,#fbbf24 50%,#dc2626 68%,#4c0d0d 86%,#ffd08a)',
    tint: '#ef4444',
  },
  {
    id: 'rainbow',
    name: '七彩环',
    mat: 'gem',
    css: 'conic-gradient(#ff8a8a,#ffd166 15%,#7ef0c0 30%,#7fdcff 45%,#a5b4fc 62%,#f0a6ff 78%,#ff8a8a)',
    tint: '#a855f7',
  },
]

export const frameById = (id: string) => FRAMES.find((f) => f.id === id) ?? FRAMES[0]

/* ---------------- 头像框进阶 ---------------- */

/** 进阶上限（Ⅰ 基础 / Ⅱ 外圈亮环 / Ⅲ 双环+光晕+呼吸） */
export const MAX_TIER = 3
/** 阶数罗马数字，索引 0 = Ⅰ 阶 */
export const TIER_LABEL = ['Ⅰ', 'Ⅱ', 'Ⅲ'] as const

/* ---------------- 成就 ---------------- */

/** 进度指标 key（useAchievements 负责计算 value） */
export type MetricKey =
  | 'streak'          // 连续打卡天数
  | 'checkins'        // 累计签到天数
  | 'chapters'        // 学完章节数
  | 'answers'         // 累计答题数
  | 'correct'         // 累计答对数
  | 'accuracy'        // 正确率%（≥30 题才计）
  | 'wrongClear'      // 错题清零（曾有 ≥10 道）
  | 'projSteps'       // 工程库完成实操小节数
  | 'projDone'        // 完成的项目数（100%）
  | 'circuit'         // 电路训练场完成案例数

export interface AchievementDef {
  id: string
  title: string
  desc: string
  icon: string
  category: '学习' | '刷题' | '督学' | '工程'
  metric: MetricKey
  target: number
  /** 奖励的头像框 id */
  frame: string
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // 督学（打卡）
  { id: 'streak3', title: '三日之约', desc: '连续打卡 3 天', icon: 'zap', category: '督学', metric: 'streak', target: 3, frame: 'silver' },
  { id: 'streak7', title: '七日不辍', desc: '连续打卡 7 天', icon: 'zap', category: '督学', metric: 'streak', target: 7, frame: 'gold' },
  { id: 'streak21', title: '廿一习惯', desc: '连续打卡 21 天，习惯成自然', icon: 'zap', category: '督学', metric: 'streak', target: 21, frame: 'rainbow' },
  { id: 'checkin30', title: '三十而立', desc: '累计签到 30 天', icon: 'clock', category: '督学', metric: 'checkins', target: 30, frame: 'flame' },
  { id: 'checkin60', title: '六十不辍', desc: '累计签到 60 天，两个月的坚持', icon: 'clock', category: '督学', metric: 'checkins', target: 60, frame: 'flame' },
  // 学习
  { id: 'chapter1', title: '开卷有益', desc: '学完第 1 个章节', icon: 'book', category: '学习', metric: 'chapters', target: 1, frame: 'emerald' },
  { id: 'chapter5', title: '博览群书', desc: '学完 5 个章节', icon: 'book', category: '学习', metric: 'chapters', target: 5, frame: 'sapphire' },
  { id: 'chapter12', title: '学有所成', desc: '学完 12 个章节', icon: 'trophy', category: '学习', metric: 'chapters', target: 12, frame: 'violet' },
  { id: 'chapter24', title: '登堂入室', desc: '学完 24 个章节，走过大半课程', icon: 'trophy', category: '学习', metric: 'chapters', target: 24, frame: 'emerald' },
  // 刷题
  { id: 'answer10', title: '初试锋芒', desc: '完成 10 道题', icon: 'quiz', category: '刷题', metric: 'answers', target: 10, frame: 'bronze' },
  { id: 'answer100', title: '百炼成钢', desc: '完成 100 道题', icon: 'quiz', category: '刷题', metric: 'answers', target: 100, frame: 'sapphire' },
  { id: 'correct50', title: '稳扎稳打', desc: '答对 50 道题', icon: 'check-circle', category: '刷题', metric: 'correct', target: 50, frame: 'gold' },
  { id: 'accuracy90', title: '百步穿杨', desc: '累计 30 题以上且正确率 ≥90%', icon: 'target', category: '刷题', metric: 'accuracy', target: 90, frame: 'violet' },
  { id: 'wrongClear', title: '知错能改', desc: '错题本曾存 10 题以上后清零', icon: 'refresh', category: '刷题', metric: 'wrongClear', target: 1, frame: 'gold' },
  // 工程
  { id: 'proj10', title: '动手实践', desc: '工程库完成 10 个实操小节', icon: 'cpu', category: '工程', metric: 'projSteps', target: 10, frame: 'bronze' },
  { id: 'projDone1', title: '初成之作', desc: '完整完成 1 个工程项目', icon: 'check-circle', category: '工程', metric: 'projDone', target: 1, frame: 'violet' },
  { id: 'projDone3', title: '工程大满贯', desc: '完整完成 3 个工程项目', icon: 'trophy', category: '工程', metric: 'projDone', target: 3, frame: 'rainbow' },
  { id: 'circuit10', title: '电路新手', desc: '电路训练场完成 10 例', icon: 'cpu', category: '工程', metric: 'circuit', target: 10, frame: 'silver' },

  /*
   * Ⅲ 阶专档：上面每框只有 2 项，最多到 Ⅱ；这里给 6 个框各补 1 项难度最高的，
   * 使 8 个框 × 3 阶 = 24 项正好铺满，每个框都能真正爬到 Ⅲ 阶。
   * 必须声明在各自同框成就之后 —— 阶位按声明顺序分配（见 ACHIEVEMENT_TIER）。
   */
  { id: 'projSteps25', title: '匠气初成', desc: '工程库完成 25 个实操小节，手上开始有活', icon: 'cpu', category: '工程', metric: 'projSteps', target: 25, frame: 'bronze' },
  { id: 'correct150', title: '炉火纯青', desc: '答对 150 道题，手感已经形成', icon: 'check-circle', category: '刷题', metric: 'correct', target: 150, frame: 'sapphire' },
  { id: 'chapter36', title: '融会贯通', desc: '学完 36 个章节，全站课程贯通', icon: 'trophy', category: '学习', metric: 'chapters', target: 36, frame: 'emerald' },
  { id: 'checkin100', title: '百日筑基', desc: '累计签到 100 天，根基已成', icon: 'clock', category: '督学', metric: 'checkins', target: 100, frame: 'flame' },
  { id: 'circuit25', title: '电路老手', desc: '电路训练场完成 25 例，见题即会', icon: 'cpu', category: '工程', metric: 'circuit', target: 25, frame: 'silver' },
  { id: 'projDone5', title: '独当一面', desc: '完整完成 5 个工程项目，可独立交付', icon: 'trophy', category: '工程', metric: 'projDone', target: 5, frame: 'rainbow' },
]

/* ---------------- 进阶计算（纯函数，渲染层与成就层共用） ---------------- */

/**
 * 每项成就固定占据其头像框的某一阶位（按 ACHIEVEMENTS 中的声明顺序 = 难度递增）。
 * 这样「同一框的三张成就卡」会分别标注 Ⅰ / Ⅱ / Ⅲ，玩家一眼看出这个框还能爬到哪一阶；
 * 若按「已领取数量」动态推算，未领取时三张卡会全显示 Ⅰ，进阶路径就看不见了。
 */
export const ACHIEVEMENT_TIER: Record<string, number> = (() => {
  const out: Record<string, number> = {}
  const seq: Record<string, number> = {}
  for (const a of ACHIEVEMENTS) {
    if (a.frame === 'none') continue
    seq[a.frame] = (seq[a.frame] ?? 0) + 1
    out[a.id] = Math.min(seq[a.frame], MAX_TIER)
  }
  return out
})()

/** 某项成就对应的阶位（1 起） */
export const tierOfAchievement = (id: string) => ACHIEVEMENT_TIER[id] ?? 1

/**
 * 某框当前阶数 = 已领取成就里的最高阶位（0 = 尚未解锁）。
 * 跳着领（跳过 Ⅰ 直接完成 Ⅱ 阶位的成就）时直接给到 Ⅱ，符合「完成了更难的」直觉。
 */
export function frameTier(frameId: string, claimedIds: readonly string[]): number {
  if (frameId === 'none') return 0
  let max = 0
  for (const a of ACHIEVEMENTS) {
    if (a.frame === frameId && claimedIds.includes(a.id)) {
      max = Math.max(max, tierOfAchievement(a.id))
    }
  }
  return max
}

/** 某框最高能升到几阶（= 奖励它的成就总数，封顶 MAX_TIER） */
export function frameMaxTier(frameId: string): number {
  if (frameId === 'none') return 1
  return Math.min(ACHIEVEMENTS.filter((a) => a.frame === frameId).length, MAX_TIER)
}

/* ---------------- 头像框材质（渲染层共用） ---------------- */

/** 环体厚度：Ⅲ 阶稍厚一点，镶座才有「配得上」的分量 */
export const framePad = (size: number, tier = 1) =>
  Math.max(2, Math.round(size * (tier >= 3 ? 0.115 : 0.1)))

/**
 * 环体纹理层。
 * 实测：环宽只有 4~5px，再叠 repeated-conic 的切面会退化成「理发店转灯」条纹，
 * 反而廉价。所以这里一律不叠纹理，宝石的内部反光交给 css 里的多段明暗渐变。
 * 保留这个函数是为了让渲染层不必关心材质类型。
 */
export function frameTexture(_frameId: string, _size = 48): string {
  return ''
}

/* ---------------- 系统预设头像（内联 SVG，emoji + 渐变底） ---------------- */

export interface PresetAvatar {
  id: string
  label: string
  svg: string
}

function presetSvg(emoji: string, c1: string, c2: string, gid: string): string {
  return `<svg viewBox="0 0 96 96" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="96" height="96" fill="url(#${gid})"/><text x="48" y="64" font-size="46" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'bot', label: '机器人', svg: presetSvg('🤖', '#60a5fa', '#2563eb', 'pg-bot') },
  { id: 'chip', label: '芯片侠', svg: presetSvg('⚡', '#fbbf24', '#d97706', 'pg-chip') },
  { id: 'wrench', label: '工程师', svg: presetSvg('🔧', '#94a3b8', '#475569', 'pg-wrench') },
  { id: 'brain', label: '智多星', svg: presetSvg('🧠', '#f472b6', '#db2777', 'pg-brain') },
  { id: 'rocket', label: '火箭手', svg: presetSvg('🚀', '#a78bfa', '#6d28d9', 'pg-rocket') },
  { id: 'antenna', label: '电波君', svg: presetSvg('📡', '#34d399', '#059669', 'pg-antenna') },
  { id: 'bulb', label: '点子王', svg: presetSvg('💡', '#fde68a', '#f59e0b', 'pg-bulb') },
  { id: 'cat', label: '小U喵', svg: presetSvg('🐱', '#67e8f9', '#0891b2', 'pg-cat') },
]

export const presetById = (id: string) => PRESET_AVATARS.find((p) => p.id === id)
