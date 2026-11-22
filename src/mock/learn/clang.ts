/**
 * C 语言大全 —— 双轨制：嵌入式主线（ch1~ch5）+ 非嵌入式通用（ch6）
 * 内容拆在 clang1/clang2 两卷，这里做章节与节合并
 */
import type { LearnCourse, LearnChapter, LearnSection } from './index'
import { clangPart1 } from './clang1'
import { clangPart2 } from './clang2'

const chapters: LearnChapter[] = [...clangPart1.chapters, ...clangPart2.chapters]
const sections: LearnSection[] = [...clangPart1.sections, ...clangPart2.sections] as unknown as LearnSection[]

export const clangCourse: LearnCourse = {
  id: 'clang',
  title: 'C 语言大全',
  subtitle: '嵌入式主线 + 非嵌入式通用，6 章 28 节，每节五维度（讲解/代码/避坑/小测/延伸）',
  icon: 'terminal',
  tts: true,
  chapters,
  sections,
}
