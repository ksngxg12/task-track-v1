export type TaskStatus = 'active' | 'paused' | 'completed' | 'deleted'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type SessionStatus = 'running' | 'paused' | 'finished' | 'abandoned'
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  deadline: string
  priority: Priority
  note?: string
  status: TaskStatus
  progress: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface PauseSpan {
  pausedAt: number
  resumedAt?: number
}

export interface FocusSession {
  id: string
  taskId: string
  startedAt: number
  endedAt?: number
  pausedSpans: PauseSpan[]
  status: SessionStatus
  durationMs?: number
  progressSnapshot?: number
  createdAt: number
}

export interface TimeLog {
  id: string
  taskId: string
  startedAt: number
  endedAt: number
  durationMs: number
  previousProgress: number
  progressSnapshot: number
  progressDelta: number
  contributesToEstimate: boolean
  createdAt: number
}

export interface EstimateSnapshot {
  id: string
  taskId: string
  createdAt: number
  progress: number
  investedMs: number
  basicTotalMs?: number
  basicRemainingMs?: number
  weightedMsPerPercent?: number
  weightedTotalMs?: number
  weightedRemainingMs?: number
  confidence: Confidence
  rangeLowMs?: number
  rangeHighMs?: number
}

export interface TaskEstimate {
  investedMs: number
  basicTotalMs?: number
  basicRemainingMs?: number
  weightedMsPerPercent?: number
  weightedTotalMs?: number
  weightedRemainingMs?: number
  rangeLowMs?: number
  rangeHighMs?: number
  confidence: Confidence
  message?: string
}
