/**
 * 理论课程注册表 —— 语言基础 / 计算机底层 / C语言 / Python
 */
import { langCourse } from './lang'
import { computerCourse } from './computer'
import { clangCourse } from './clang'
import { pythonCourse } from './python'

export type LearnId = 'lang' | 'computer' | 'clang' | 'python'

export interface LearnQuiz {
  q: string
  options: string[]
  answer: number
  explain: string
}

export interface LearnSection {
  id: string
  title: string
  doc: string
  /** 双轨标记：clang 用（emb=嵌入式所需 / general=非嵌入式其他） */
  track?: 'emb' | 'general'
  /** 维度二：可运行示例代码（多段用 ### 标题分隔） */
  code?: string
  /** 维度三：常见错误与避坑 */
  pitfalls?: string[]
  /** 维度四：随节小测（检验理解） */
  quiz?: LearnQuiz[]
  /** 维度五：延伸与关联（串讲其他模块/工程实践） */
  extend?: string
  /** 所属章节 id（章节化课程用） */
  chapter?: string
}

export interface LearnChapter {
  id: string
  title: string
  brief?: string
}

export interface LearnCourse {
  id: LearnId
  title: string
  subtitle: string
  icon: string
  /** 是否支持冥想听学 */
  tts: boolean
  /** 章节目录（有则按章节分组渲染） */
  chapters?: LearnChapter[]
  sections: LearnSection[]
}

export const learnCourses: LearnCourse[] = [langCourse, computerCourse, clangCourse, pythonCourse]

export function getLearnCourse(id: string): LearnCourse | undefined {
  return learnCourses.find((c) => c.id === id)
}

/** 把 markdown-lite 文本转成可朗读的纯文本（供 TTS，跳过代码块） */
export function docToSpeech(doc: string): string {
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
