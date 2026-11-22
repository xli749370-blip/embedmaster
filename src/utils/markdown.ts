/**
 * Markdown 渲染 + 动画占位符切分
 * ------------------------------------------------------------------
 * 讲义正文里的 [[anim:voltage-divider]] 会被切分成独立区块，
 * 由 ChapterView 在该位置插入对应的 Konva 动画组件。
 */
import MarkdownIt from 'markdown-it'
import katexPlugin from '@vscode/markdown-it-katex'

const md = new MarkdownIt({
  html: false, // 讲义内容不允许注入原始 HTML
  linkify: true,
  breaks: false,
  typographer: false,
})

// KaTeX 插件（支持行内 $...$ 与块级 $$...$$）
md.use((katexPlugin as any).default ?? (katexPlugin as any), {
  throwOnError: false,
  errorColor: '#dc2626',
})

export interface MdBlock {
  type: 'md' | 'anim'
  content: string
  key?: string
}

const ANIM_RE = /^\s*\[\[anim:([a-z0-9-]+)\]\]\s*$/gim

/** 把 Markdown 按动画占位符切成若干区块 */
export function splitAnimationBlocks(source: string): MdBlock[] {
  const blocks: MdBlock[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  ANIM_RE.lastIndex = 0
  while ((match = ANIM_RE.exec(source)) !== null) {
    const before = source.slice(lastIndex, match.index)
    if (before.trim()) blocks.push({ type: 'md', content: before })
    blocks.push({ type: 'anim', content: '', key: match[1] })
    lastIndex = match.index + match[0].length
  }
  const rest = source.slice(lastIndex)
  if (rest.trim()) blocks.push({ type: 'md', content: rest })
  return blocks
}

/** 渲染单段 Markdown 为 HTML */
export function renderMarkdown(source: string): string {
  return md.render(source)
}

/**
 * 自定义代码块渲染：外层包 .md-code，顶部加语言标签 + 复制按钮。
 * 原始代码经 encodeURIComponent 塞进 data-code，讲义页用事件委托取出来写剪贴板。
 * 注意：pre 本身的圆角和内边距交给 .md-code 控制，这里去掉自带的 margin。
 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const lang = (token.info || '').trim().split(/\s+/)[0] || 'text'
  const code = token.content
  const esc = md.utils.escapeHtml(code)
  return (
    `<div class="md-code">` +
    `<div class="md-code-bar">` +
    `<span class="md-code-lang">${md.utils.escapeHtml(lang)}</span>` +
    `<button class="md-code-copy" type="button" data-code="${encodeURIComponent(code)}">复制代码</button>` +
    `</div>` +
    `<pre><code>${esc}</code></pre>` +
    `</div>`
  )
}

/**
 * 去掉正文开头的一级标题
 * 讲义页头已经展示章节名，正文里的同名 H1 会重复；检索计算小节序号时
 * 也必须基于「去掉 H1 之后」的文本，否则 sec-N 会和讲义页对不上。
 */
export function stripLeadingH1(source: string): string {
  return source.replace(/^\s*#\s+.*(?:\r?\n|$)/, '')
}

/** 提取标题列表，用于讲义侧边目录 */
export interface TocItem {
  level: number
  text: string
  id: string
}

export function extractToc(source: string): TocItem[] {
  const items: TocItem[] = []
  const lines = source.split('\n')
  let inCode = false
  for (const line of lines) {
    if (line.trim().startsWith('```')) inCode = !inCode
    if (inCode) continue
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line)
    if (m) {
      items.push({
        level: m[1].length,
        text: m[2].replace(/[*`]/g, ''),
        id: `sec-${items.length}`,
      })
    }
  }
  return items
}
