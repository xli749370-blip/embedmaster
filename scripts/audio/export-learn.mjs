/**
 * 导出四门理论课程（lang/computer/clang/python）全部节的朗读文本
 * 供 Python edge-tts 批量生成内置听学音频
 */
import { writeFileSync } from 'node:fs'
import { langCourse } from './src/mock/learn/lang.ts'
import { computerCourse } from './src/mock/learn/computer.ts'
import { clangPart1 } from './src/mock/learn/clang1.ts'
import { clangPart2 } from './src/mock/learn/clang2.ts'
import { pythonPart1 } from './src/mock/learn/python1.ts'
import { pythonPart2 } from './src/mock/learn/python2.ts'

/** 与 src/mock/learn/index.ts 的 docToSpeech 保持一致 */
function docToSpeech(doc) {
  let inCode = false
  return doc
    .split('\n')
    .map((l) => {
      let s = l.trim()
      if (s.startsWith('```')) {
        inCode = !inCode
        return ''
      }
      if (inCode) return ''
      if (s.startsWith('## ')) s = s.slice(3)
      else if (s.startsWith('- ')) s = s.slice(2)
      else if (s.startsWith('> ')) s = s.slice(2)
      if (s === '') return ''
      return s
    })
    .filter(Boolean)
    .join('。')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
}

const courses = [
  { id: 'lang', title: langCourse.title, sections: langCourse.sections },
  { id: 'computer', title: computerCourse.title, sections: computerCourse.sections },
  { id: 'clang', title: 'C 语言大全', sections: [...clangPart1.sections, ...clangPart2.sections] },
  { id: 'python', title: 'Python 大全', sections: [...pythonPart1.sections, ...pythonPart2.sections] },
]

const out = []
let totalChars = 0
for (const c of courses) {
  for (const s of c.sections) {
    const pit = s.pitfalls?.length ? '。常见错误与避坑：' + s.pitfalls.map((p) => p.replace(/\*\*/g, '').replace(/`/g, '')).join('。') : ''
    const text = `本节：${s.title}。` + docToSpeech(s.doc) + pit
    totalChars += text.length
    out.push({ course: c.id, courseTitle: c.title, id: s.id, title: s.title, text })
  }
}

writeFileSync(new URL('./learn-speech.json', import.meta.url), JSON.stringify(out, null, 1), 'utf8')
console.log(`共 ${out.length} 节，朗读文本 ${totalChars} 字（约 ${Math.round(totalChars / 4 / 60)} 分钟音频）`)
for (const c of courses) console.log(`  ${c.id}: ${c.sections.length} 节`)
