/**
 * 项目库 · 数据模型
 *
 * 设计说明：
 * - 每个项目 = 一本完整工程教材，从「方案选型」到「联调落地」的全链路。
 * - 阶段（ProjStage）按工程视角划分：通用（方案/总览）、硬件层、软件层。
 * - 小节（ProjStep）是最小学习单元，正文用 markdown-lite 字符串书写，
 *   由 ProjectDocRenderer 组件解析渲染（支持 ## 标题 / - 列表 / > 提示 / ``` 代码块 / **加粗**）。
 * - 每个小节可带 checks（实操检查点）：学习者对照自查、勾选完成，进度入库。
 */

/** 小节种类（决定渲染徽标与图标） */
export type StepKind = 'theory' | 'hardware' | 'software' | 'debug' | 'practice'

export const STEP_KIND_META: Record<StepKind, { label: string; cls: string }> = {
  theory: { label: '理论', cls: 'bg-slate-100 text-slate-600' },
  hardware: { label: '硬件', cls: 'bg-amber-50 text-amber-700' },
  software: { label: '软件', cls: 'bg-brand-50 text-brand-700' },
  debug: { label: '调试', cls: 'bg-rose-50 text-rose-600' },
  practice: { label: '实操', cls: 'bg-emerald-50 text-emerald-700' },
}

/** 实操检查点：对照自查条目 */
export interface ProjCheck {
  /** 检查点描述（做成什么样才算完成） */
  q: string
}

/** 阶段内小节 */
export interface ProjStep {
  id: string
  title: string
  kind: StepKind
  /** markdown-lite 正文（## 标题 / - 列表 / > 提示 / ``` 代码 / **加粗**） */
  doc: string
  /** 实操检查点（勾选后计入进度） */
  checks?: ProjCheck[]
}

/** 阶段层级：通用 / 硬件链路 / 软件链路 / 联调调试 */
export type StageLayer = 'common' | 'hardware' | 'software' | 'debug'

export const STAGE_LAYER_META: Record<StageLayer, { label: string; dot: string }> = {
  common: { label: '通用', dot: 'bg-slate-400' },
  hardware: { label: '硬件链路', dot: 'bg-amber-500' },
  software: { label: '软件链路', dot: 'bg-brand-500' },
  debug: { label: '联调调试', dot: 'bg-rose-500' },
}

/** 项目阶段 */
export interface ProjStage {
  id: string
  title: string
  layer: StageLayer
  /** 阶段目标一句话 */
  goal: string
  steps: ProjStep[]
}

/** 物料清单条目 */
export interface BomItem {
  item: string
  spec: string
  qty: string
  note?: string
}

export type ProjDifficulty = '入门' | '进阶' | '挑战' | '硬核'

/** 完整项目 */
export interface Project {
  id: string
  name: string
  subtitle: string
  difficulty: ProjDifficulty
  /** 预计周期（按每天 1~2 小时业余时间估算） */
  weeks: string
  /** 物料预算 */
  cost: string
  tags: string[]
  /** 技术栈：硬件 / 软件两侧 */
  stack: { hw: string[]; sw: string[] }
  summary: string
  /** 跟完全程能独立获得的能力 */
  outcomes: string[]
  bom: BomItem[]
  stages: ProjStage[]
}

/** 项目难度徽标配色 */
export const PROJ_DIF_CLS: Record<ProjDifficulty, string> = {
  入门: 'bg-emerald-50 text-emerald-700',
  进阶: 'bg-brand-50 text-brand-700',
  挑战: 'bg-amber-50 text-amber-700',
  硬核: 'bg-rose-50 text-rose-600',
}
