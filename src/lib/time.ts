import type { FocusSession } from '../types/domain'

export const hourMs = 60 * 60 * 1000
export const dayMs = 24 * hourMs

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function todayIso() {
  const date = new Date()
  return toLocalIsoDate(date)
}

export function toLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysIso(startIso: string, offset: number) {
  const date = new Date(`${startIso}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return toLocalIsoDate(date)
}

export function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00`).getTime()
  const to = new Date(`${toIso}T00:00:00`).getTime()
  return Math.ceil((to - from) / dayMs)
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(`${iso}T00:00:00`))
}

export function formatClock(ms: number) {
  const safeMs = Math.max(0, ms)
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatDuration(ms?: number) {
  if (!ms || ms <= 0) return '0 分钟'
  const hours = Math.floor(ms / hourMs)
  const minutes = Math.round((ms % hourMs) / 60000)
  if (hours <= 0) return `${Math.max(1, minutes)} 分钟`
  if (minutes <= 0) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分钟`
}

export function getSessionElapsed(session: FocusSession, now = Date.now()) {
  const raw = (session.endedAt ?? now) - session.startedAt
  const pausedMs = session.pausedSpans.reduce((total, span) => {
    const end = span.resumedAt ?? now
    return total + Math.max(0, end - span.pausedAt)
  }, 0)
  return Math.max(0, raw - pausedMs)
}
