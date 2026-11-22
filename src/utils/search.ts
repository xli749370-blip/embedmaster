/**
 * 讲义全文检索
 * ------------------------------------------------------------------
 * 36 章讲义合计十几万字，全部是打包进前端的静态字符串，所以不需要任何
 * 搜索服务：直接线性扫描即可（一屏内完成，实测单次查询 < 8 ms）。
 *
 * 设计要点：
 * 1. **多词 AND**：空格分隔的多个词必须同时出现，符合「DMA 双缓冲」这类
 *    组合查询的直觉；单个词则退化成普通包含匹配。
 * 2. **打分**：命中标题 ≫ 命中小节标题 > 正文出现次数，标题命中的章节
 *    永远排在只有正文命中的前面。
 * 3. **片段**：截取首个命中位置前后若干字符，先清洗 Markdown 记号再转义，
 *    最后用 <mark> 包住命中词，交给 v-html 渲染（已转义，无注入风险）。
 * 4. **小节定位**：顺带算出命中位置落在第几个标题之下，讲义页据此用
 *    ?sec=N 滚动到对应小节，而不是让用户从头翻。
 */
import { chapters, getCourseById } from '@/mock/data'
import { stripLeadingH1 } from '@/utils/markdown'
import { expandLatin, isSubsequence } from '@/utils/pinyin'

export interface SearchHit {
  chapter_id: number
  chapter_name: string
  course_id: number
  course_name: string
  stage_type: string
  cover_theme: string
  /** 命中的小节标题，未命中具体小节时为空 */
  heading: string
  /** 命中位置对应的标题序号（与讲义页 sec-N 对应），无标题时为 -1 */
  section_index: number
  /** 带 <mark> 的片段，已做 HTML 转义 */
  snippet: string
  /** 该章内所有关键词出现次数之和 */
  count: number
  score: number
  /** 命中的是章节标题 / 小节标题，而不是正文（「只搜标题」模式下恒为 true） */
  title_hit: boolean
  /** 本词没有任何精确命中，靠「子序列模糊匹配」在标题上救回来的 */
  fuzzy_hit: boolean
}

/** 检索范围：全文 / 只搜标题（章节标题 + 小节标题） */
export type SearchScope = 'all' | 'title'

/** 结果排序：相关度 / 课程顺序（按学习路径从硬件到综合，便于按体系阅读） */
export type SearchSort = 'relevance' | 'course'

export interface SearchOptions {
  scope?: SearchScope
}

/**
 * 查询词展开结果：
 * - `all`：参与「匹配 + 高亮 + 计分」的完整词表 = 原词 + 拼音展开出的中文术语
 * - `pinyin`：由拼音词典展开出来的中文术语（供 UI 展示「已展开为…」）
 */
export interface ExpandedQuery {
  all: string[]
  pinyin: string[]
}

/**
 * 把查询词表做拼音展开：输入 dsq / dingshiqi / dingshi 会展开出
 * 「定时器」等中文术语，与原词一起参与匹配和高亮。
 */
export function expandQuery(terms: string[]): ExpandedQuery {
  const all = [...terms]
  const pinyin: string[] = []
  for (const t of terms) {
    for (const zh of expandLatin(t)) {
      if (!all.includes(zh)) all.push(zh)
      if (!pinyin.includes(zh)) pinyin.push(zh)
    }
  }
  return { all, pinyin }
}

/** 关键词高亮用的 class，搜索页与讲义页保持一致 */
export const MARK_CLASS = 'rounded-[3px] bg-amber-200/70 px-0.5 font-semibold text-amber-900'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 供页面层复用：把词转成安全的正则片段 */
export const escapeRegExp = escapeReg

/** 把查询串拆成小写词数组（去重、去空） */
export function tokenize(keyword: string): string[] {
  return Array.from(
    new Set(
      keyword
        .toLowerCase()
        .split(/[\s,，、]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}

/** 清洗 Markdown 记号，让片段读起来像正文而不是源码 */
function cleanSnippet(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/^\s*```.*$/gm, ' ')
    .replace(/\[\[anim:[a-z0-9-]+\]\]/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[|*`>#]/g, ' ')
    .replace(/\${1,2}/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 在已转义的文本里把命中词包成 <mark> */
function highlight(escaped: string, terms: string[]): string {
  if (!terms.length) return escaped
  const re = new RegExp(`(${terms.map(escapeReg).join('|')})`, 'gi')
  return escaped.replace(re, `<mark class="${MARK_CLASS}">$1</mark>`)
}

/** 统计 pos 之前有几个 1~3 级标题，并取最近一个标题的文本 */
function locateSection(body: string, pos: number): { index: number; title: string } {
  const re = /^(#{1,3})\s+(.+?)\s*$/gm
  let index = -1
  let title = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index >= pos) break
    index += 1
    title = m[2].replace(/[*`$]/g, '').trim()
  }
  return { index, title }
}

/** 抽取正文里所有 1~3 级标题，序号与 locateSection 的计数方式一致（首个标题为 0） */
function headingList(body: string): Array<{ index: number; title: string; pos: number }> {
  const out: Array<{ index: number; title: string; pos: number }> = []
  const re = /^(#{1,3})\s+(.+?)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    out.push({ index: out.length, title: m[2].replace(/[*`$]/g, '').trim(), pos: m.index })
  }
  return out
}

/** 判断 pos 是否落在标题行上（`### DMA` 这种），标题命中不适合当片段起点 */
function onHeadingLine(body: string, pos: number): boolean {
  const lineStart = body.lastIndexOf('\n', pos) + 1
  return /^#{1,3}\s/.test(body.slice(lineStart, lineStart + 4))
}

/** 收集代码块的 [起, 止] 区间；片段尽量避开代码，否则会显示成一堆 ASCII 符号 */
function codeRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const re = /^```.*$/gm
  let open = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (open < 0) open = m.index
    else {
      ranges.push([open, m.index + m[0].length])
      open = -1
    }
  }
  if (open >= 0) ranges.push([open, body.length])
  return ranges
}

/** 取首个命中位置前后的窗口，清洗并高亮 */
function makeSnippet(body: string, pos: number, len: number, terms: string[]): string {
  const RADIUS = 58
  let start = Math.max(0, pos - RADIUS)
  let end = Math.min(body.length, pos + len + RADIUS)
  // 尽量在换行处收口，避免片段从半个句子中间开始
  if (start > 0) {
    const nl = body.lastIndexOf('\n', start)
    if (nl >= 0 && start - nl < 24) start = nl + 1
  }
  if (end < body.length) {
    const nl = body.indexOf('\n', end)
    if (nl >= 0 && nl - end < 24) end = nl
  }
  // 截断后开头经常剩下一个逗号或括号，去掉更干净
  const text = cleanSnippet(stripCodeBlocks(body.slice(start, end))).replace(/^[，,、。；;：:）)\]】》"”]+/, '')
  return `${start > 0 ? '… ' : ''}${highlight(escapeHtml(text), terms)}${end < body.length ? ' …' : ''}`
}

/** 去掉 fenced code block 的内容：片段里出现半截代码比没有片段更糟 */
function stripCodeBlocks(src: string): string {
  return src
    .replace(/(?:^|\n)```[^\n]*\n[\s\S]*?\n```/g, '\n\n') // 完整代码块
    .replace(/(?:^|\n)```[\s\S]*$/g, '\n\n') // 截断时残留的开头，一路删到结尾
}

/** 从指定位置取一小段正文做预览：跳过标题行与代码块，只取真正读得懂的段落 */
function previewFrom(body: string, from: number, terms: string[]): string {
  const nl = from > 0 ? body.indexOf('\n', from) : -1
  const begin = nl >= 0 ? nl + 1 : from
  const paras = stripCodeBlocks(body.slice(begin, begin + 1600))
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)

  // 优先选「像正文」的段落：不是标题 / 表格 / 引用 / 图片 / 列表 / 独立公式块
  const isProse = (s: string) =>
    !/^(#{1,6}\s|\||>|!\[|[-*+]\s|\d+\.\s|\$\$)/.test(s) && s.replace(/[\s*`_]/g, '').length > 16
  const para = paras.find(isProse) ?? paras[0] ?? ''

  let text = cleanSnippet(para).slice(0, 120)
  if (!text) text = cleanSnippet(stripCodeBlocks(body)).slice(0, 120)
  return highlight(escapeHtml(text), terms)
}

/**
 * 检索讲义正文，返回按相关度排序的章节列表。
 * 空关键词返回空数组；同分时按课程顺序 + 章节顺序排列，保证结果稳定。
 */
export function searchChapters(keyword: string, options: SearchOptions = {}): SearchHit[] {
  const raw = tokenize(keyword)
  if (!raw.length) return []
  const titleOnly = options.scope === 'title'

  /* 拼音展开：把查询词分组为 [原词, ...展开的中文术语]。
   * AND 语义按「组」判断 —— 组内任意一个词命中即算该组命中，
   * 因此搜 dsq 时只要「定时器」出现在讲义里就能命中。 */
  const groups = raw.map((t) => [t, ...expandLatin(t)])
  // 高亮 / 计分用完整词表（原词 + 所有展开词）
  const terms = Array.from(new Set(groups.flat()))

  const hits: SearchHit[] = []

  for (const ch of chapters) {
    if (ch.is_published !== 1 || ch.is_deleted !== 0) continue

    const body = stripLeadingH1(ch.chapter_content)
    const lowerBody = body.toLowerCase()
    const lowerTitle = ch.chapter_name.toLowerCase()
    const lowerSummary = ch.summary.toLowerCase()
    const codes = codeRanges(body)
    const inCode = (p: number) => codes.some(([a, b]) => p >= a && p <= b)
    const headings = headingList(body)

    /** 一组词（原词 + 拼音展开）是否命中 */
    const groupMatch = (g: string[]) => g.some((t) => lowerBody.includes(t) || lowerTitle.includes(t))
    /** 只搜标题模式：命中标题或小节标题 */
    const groupMatchTitle = (g: string[]) =>
      g.some((t) => lowerTitle.includes(t) || headings.some((h) => h.title.toLowerCase().includes(t)))

    // ---- AND 语义：每组词都得命中 ----
    const exactOK = groups.every(titleOnly ? groupMatchTitle : groupMatch)

    // ---- 模糊救援：某组完全没有精确命中时，用子序列匹配标题再试一次 ----
    let fuzzyHit = false
    if (!exactOK) {
      const fuzzyTitle = (t: string) =>
        t.length >= 2 && (isSubsequence(t, ch.chapter_name) || headings.some((h) => isSubsequence(t, h.title)))
      fuzzyHit = groups.every((g) => g.some(fuzzyTitle))
    }

    if (!exactOK && !fuzzyHit) continue

    let score = 0
    let count = 0
    let titleHit = false
    /** 正文里的首个命中（优先用它做片段，避免片段以 `### DMA` 开头） */
    let bodyPos = -1
    let bodyLen = 0
    /** 兜底：任意位置的首个命中（含标题行） */
    let anyPos = -1
    let anyLen = 0
    /** 命中的第一个小节标题，用于定位与小节预览 */
    let headHit: { index: number; title: string; pos: number } | null = null

    for (const t of terms) {
      // 标题层级命中：章节名权重最高，小节标题次之
      if (lowerTitle.includes(t)) {
        score += 120
        count += 1
        titleHit = true
      }
      for (const h of headings) {
        if (h.title.toLowerCase().includes(t)) {
          score += 80
          count += 1
          titleHit = true
          if (!headHit) headHit = h
        }
      }
      if (titleOnly) continue

      if (lowerSummary.includes(t)) score += 12

      let from = 0
      let c = 0
      while (c < 200) {
        const p = lowerBody.indexOf(t, from)
        if (p < 0) break
        c += 1
        if (anyPos < 0 || p < anyPos) {
          anyPos = p
          anyLen = t.length
        }
        if (!onHeadingLine(body, p) && !inCode(p) && (bodyPos < 0 || p < bodyPos)) {
          bodyPos = p
          bodyLen = t.length
        }
        from = p + t.length
      }
      count += c
      // 出现次数收益递减，避免长章节单纯靠堆次数压过精准匹配
      score += Math.min(c, 12) + Math.log2(c + 1)
    }

    // 模糊命中的章节保底加分：排在所有精确命中之后
    if (fuzzyHit) score += 18

    const firstPos = bodyPos >= 0 ? bodyPos : anyPos
    const firstLen = bodyPos >= 0 ? bodyLen : anyLen
    const section = firstPos >= 0 ? locateSection(body, firstPos) : { index: -1, title: '' }
    const course = getCourseById(ch.course_id)

    // 片段：全文模式取命中位置前后窗口；只搜标题模式改取命中该小节的开头一段，
    // 这样卡片里仍然能看到「这一节讲什么」，而不是只有一行重复的标题。
    let snippet: string
    let headingLine = section.title
    let sectionIndex = section.index

    if (titleOnly) {
      if (headHit) {
        headingLine = headHit.title
        sectionIndex = headHit.index
        snippet = previewFrom(body, headHit.pos, terms)
      } else {
        headingLine = ''
        sectionIndex = -1
        snippet = previewFrom(body, 0, terms)
      }
    } else {
      snippet = firstPos >= 0 ? makeSnippet(body, firstPos, firstLen, terms) : previewFrom(body, 0, terms)
    }

    hits.push({
      chapter_id: ch.id,
      chapter_name: ch.chapter_name,
      course_id: ch.course_id,
      course_name: course?.course_name ?? '',
      stage_type: course?.stage_type ?? '',
      cover_theme: course?.cover_theme ?? 'blue',
      heading: headingLine,
      section_index: sectionIndex,
      snippet,
      count,
      score,
      title_hit: titleHit,
      fuzzy_hit: fuzzyHit,
    })
  }

  return hits.sort((a, b) => b.score - a.score || a.chapter_id - b.chapter_id)
}

/** 按指定方式排出结果顺序：相关度，或按课程 / 章节的学习路径顺序 */
export function sortHits(hits: SearchHit[], mode: SearchSort): SearchHit[] {
  const list = [...hits]
  if (mode === 'course') return list.sort((a, b) => a.course_id - b.course_id || a.chapter_id - b.chapter_id)
  return list.sort((a, b) => b.score - a.score || a.chapter_id - b.chapter_id)
}

/** 命中总数（用于「共 N 处」统计） */
export function totalMatches(hits: SearchHit[]): number {
  return hits.reduce((s, h) => s + h.count, 0)
}

/** 给一段纯文本做转义 + 命中高亮，供标题等位置复用 */
export function highlightPlain(text: string, keyword: string): string {
  return highlight(escapeHtml(text), tokenize(keyword))
}
