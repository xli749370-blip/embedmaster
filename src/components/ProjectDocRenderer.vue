<script setup lang="ts">
/**
 * 项目库正文渲染器：把 markdown-lite 文本解析为结构化块渲染
 * 支持：## 标题 / - 列表 / > 提示块 / ``` 围栏代码块 / **行内加粗**
 */
import { computed } from 'vue'

const props = defineProps<{ doc: string }>()

type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; html: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; html: string }
  | { type: 'code'; lang: string; text: string }

/** 行内格式：转义后替换 **加粗** */
function inline(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-ink-900">$1</strong>')
}

const blocks = computed<Block[]>(() => {
  const out: Block[] = []
  const lines = props.doc.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++ // 跳过收尾 ```
      out.push({ type: 'code', lang, text: buf.join('\n') })
      continue
    }
    if (line.startsWith('## ')) {
      out.push({ type: 'h', text: line.slice(3).trim() })
      i++
      continue
    }
    if (line.startsWith('> ')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2))
      out.push({ type: 'callout', html: inline(buf.join(' ')) })
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2))
      out.push({ type: 'ul', items: items.map((s) => s.trim()) })
      continue
    }
    if (line.trim() === '') {
      i++
      continue
    }
    // 普通段落：连续非特殊行合并为一段
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('## ') &&
      !lines[i].startsWith('- ') &&
      !lines[i].startsWith('> ') &&
      !lines[i].startsWith('```')
    ) {
      buf.push(lines[i++])
    }
    out.push({ type: 'p', html: inline(buf.join(' ')) })
  }
  return out
})
</script>

<template>
  <div class="text-[13.5px] leading-relaxed text-ink-600">
    <template v-for="(b, bi) in blocks" :key="bi">
      <h4 v-if="b.type === 'h'" class="mb-2 mt-5 flex items-center gap-2 text-[14.5px] font-bold text-ink-900 first:mt-0">
        <span class="h-3.5 w-1 rounded-full bg-gradient-to-b from-brand-500 to-accent-500" />
        {{ b.text }}
      </h4>
      <p v-else-if="b.type === 'p'" class="mb-2.5" v-html="b.html" />
      <ul v-else-if="b.type === 'ul'" class="mb-2.5 space-y-1.5">
        <li v-for="(it, ii) in b.items" :key="ii" class="flex gap-2">
          <span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
          <span class="min-w-0 flex-1" v-html="inline(it)" />
        </li>
      </ul>
      <div
        v-else-if="b.type === 'callout'"
        class="anim-panel mb-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900"
        style="background: #fffbeb"
      >
        <span class="mt-px shrink-0">💡</span>
        <span class="min-w-0 flex-1" v-html="b.html" />
      </div>
      <div v-else class="anim-panel mb-3 overflow-hidden rounded-lg border border-slate-700/40" style="background: #0f172a">
        <div v-if="b.lang" class="flex items-center justify-between border-b border-slate-700/60 px-3 py-1.5">
          <span class="font-mono text-[10px] font-semibold tracking-wider text-slate-400">{{ b.lang.toUpperCase() }}</span>
        </div>
        <pre class="overflow-x-auto px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-slate-200"><code>{{ b.text }}</code></pre>
      </div>
    </template>
  </div>
</template>
