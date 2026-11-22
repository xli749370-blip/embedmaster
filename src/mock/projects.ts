/**
 * 项目库 · 主入口：合并四卷内容
 * 注意保持与 circuits.ts 相同的合并模式，避免循环依赖。
 */
import type { Project } from './projectModel'
import { projectBalance } from './projects1'
import { projectCar, projectDrone } from './projects2'
import { projectArm, projectPendulum, projectMaglev } from './projects3'
import { projects4 } from './projects4'

export * from './projectModel'

/** 难度升序权重：列表统一按从易到难展示 */
const DIF_ORDER: Record<string, number> = { 入门: 0, 进阶: 1, 挑战: 2, 硬核: 3 }

export const projects: Project[] = [
  projectBalance,
  projectCar,
  projectDrone,
  projectArm,
  projectPendulum,
  projectMaglev,
  ...projects4,
].sort((a, b) => DIF_ORDER[a.difficulty] - DIF_ORDER[b.difficulty])

/** 按 id 查项目 */
export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}

/** 统计：项目总小节数（用于进度条分母） */
export function projectStepCount(p: Project): number {
  return p.stages.reduce((n, s) => n + s.steps.length, 0)
}

/** 全部小节 id 集合（进度存储的 key 空间） */
export function projectAllStepIds(p: Project): string[] {
  return p.stages.flatMap((s) => s.steps.map((st) => st.id))
}
