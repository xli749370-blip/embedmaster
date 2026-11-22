/**
 * 导出工程库 7 个项目的朗读文本（按阶段粒度，听学按阶段播放）
 * 输出 project-speech.json: [{projectId, projectTitle, stageId, stageTitle, order, text}]
 */
import { writeFileSync } from 'node:fs'
import { projectBalance } from './src/mock/projects1.ts'
import { projectCar, projectDrone } from './src/mock/projects2.ts'
import { projectArm, projectPendulum, projectMaglev } from './src/mock/projects3.ts'
import { projects4 } from './src/mock/projects4.ts'

const projects = [projectBalance, projectCar, projectDrone, projectArm, projectPendulum, projectMaglev, ...projects4]

/** markdown-lite 转朗读文本（去代码块/标记，与 LearnView 口径一致） */
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

const out = []
let totalChars = 0
for (const p of projects) {
  let order = 0
  for (const st of p.stages || []) {
    const parts = [`阶段：${st.title}。目标：${st.goal}`]
    for (const step of st.steps || []) {
      const kindLabel = { info: '讲解', hardware: '硬件实操', software: '软件实操', debug: '调试' }[step.kind] || '讲解'
      parts.push(`${step.title}（${kindLabel}）。` + docToSpeech(step.doc))
      if (step.checks?.length) parts.push('完成检查点：' + step.checks.map((c) => c.q).join('；') + '。')
    }
    const text = parts.join('。')
    totalChars += text.length
    out.push({ projectId: p.id, projectTitle: p.title, stageId: st.id, stageTitle: st.title, order: order++, text })
  }
}

writeFileSync(new URL('./project-speech.json', import.meta.url), JSON.stringify(out, null, 1), 'utf8')
console.log(`共 ${projects.length} 个项目 / ${out.length} 个阶段，朗读文本 ${totalChars} 字（约 ${Math.round(totalChars / 4 / 60)} 分钟音频）`)
