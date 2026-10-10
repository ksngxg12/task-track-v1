import type { EstimateSnapshot, Task, TaskEstimate, TimeLog } from '../types/domain'
import { uid } from './time'

const windowSize = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function stddev(values: number[]) {
  if (values.length <= 1) return 0
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function estimateTask(task: Task, logs: TimeLog[]): TaskEstimate {
  const taskLogs = logs.filter((log) => log.taskId === task.id)
  const investedMs = taskLogs.reduce((total, log) => total + log.durationMs, 0)

  if (task.progress <= 0 || investedMs <= 0) {
    return {
      investedMs,
      confidence: 'insufficient',
      message: '数据不足，继续记录以获得估算'
    }
  }

  const basicTotalMs = investedMs / (task.progress / 100)
  const basicRemainingMs = Math.max(0, basicTotalMs - investedMs)
  const validLogs = taskLogs.filter((log) => log.contributesToEstimate && log.progressDelta > 0)

  if (validLogs.length === 0) {
    return {
      investedMs,
      basicTotalMs,
      basicRemainingMs,
      confidence: 'low',
      message: '已有累计投入，但有效进度样本不足'
    }
  }

  const recentLogs = validLogs.slice(-windowSize)
  const samples = recentLogs.map((log) => log.durationMs / log.progressDelta)
  const weightedSum = samples.reduce((total, sample, index) => {
    const weight = 1 + (index + 1) / samples.length
    return total + sample * weight
  }, 0)
  const weightTotal = samples.reduce((total, _sample, index) => total + 1 + (index + 1) / samples.length, 0)
  const weightedMsPerPercent = weightedSum / weightTotal
  const weightedRemainingMs = weightedMsPerPercent * Math.max(0, 100 - task.progress)
  const weightedTotalMs = investedMs + weightedRemainingMs

  const avg = samples.reduce((total, value) => total + value, 0) / samples.length
  const volatility = avg > 0 ? stddev(samples) / avg : 0
  const spread = clamp(volatility || 0.18, 0.15, 0.45)

  const confidence =
    validLogs.length < 3 ? 'low' : volatility > 0.6 ? 'low' : volatility > 0.3 ? 'medium' : 'high'

  return {
    investedMs,
    basicTotalMs,
    basicRemainingMs,
    weightedMsPerPercent,
    weightedTotalMs,
    weightedRemainingMs,
    rangeLowMs: weightedRemainingMs * (1 - spread),
    rangeHighMs: weightedRemainingMs * (1 + spread),
    confidence
  }
}

export function createEstimateSnapshot(task: Task, logs: TimeLog[]): EstimateSnapshot {
  const estimate = estimateTask(task, logs)
  return {
    id: uid('estimate'),
    taskId: task.id,
    createdAt: Date.now(),
    progress: task.progress,
    investedMs: estimate.investedMs,
    basicTotalMs: estimate.basicTotalMs,
    basicRemainingMs: estimate.basicRemainingMs,
    weightedMsPerPercent: estimate.weightedMsPerPercent,
    weightedTotalMs: estimate.weightedTotalMs,
    weightedRemainingMs: estimate.weightedRemainingMs,
    confidence: estimate.confidence,
    rangeLowMs: estimate.rangeLowMs,
    rangeHighMs: estimate.rangeHighMs
  }
}
