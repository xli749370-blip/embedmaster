/**
 * Python 大全 —— 5 章 20 节，每节五维度（讲解/代码/避坑/小测/延伸）
 * 内容拆在 python1/python2 两卷，这里做章节与节合并
 */
import type { LearnCourse, LearnChapter, LearnSection } from './index'
import { pythonPart1 } from './python1'
import { pythonPart2 } from './python2'

const chapters: LearnChapter[] = [...pythonPart1.chapters, ...pythonPart2.chapters]
const sections: LearnSection[] = [...pythonPart1.sections, ...pythonPart2.sections] as unknown as LearnSection[]

export const pythonCourse: LearnCourse = {
  id: 'python',
  title: 'Python 大全',
  subtitle: '5 章 20 节：语言本体 + 面向对象进阶 + 嵌入式实战 + 工程素养，每节五维度',
  icon: 'zap',
  tts: true,
  chapters,
  sections,
}
