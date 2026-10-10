import { create } from 'zustand'
import { db } from '../lib/db'
import { createEstimateSnapshot } from '../lib/estimate'
import { getSessionElapsed, uid } from '../lib/time'
import type { EstimateSnapshot, FocusSession, Priority, Task, TaskStatus, TimeLog } from '../types/domain'

interface TaskInput {
  title: string
  deadline: string
  priority: Priority
  note?: string
}

interface AppState {
  tasks: Task[]
  sessions: FocusSession[]
  timeLogs: TimeLog[]
  estimateSnapshots: EstimateSnapshot[]
  hydrated: boolean
  loadInitialData: () => Promise<void>
  createTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'deadline' | 'priority' | 'note' | 'progress'>>) => Promise<void>
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  startFocus: (taskId: string) => Promise<void>
  pauseFocus: () => Promise<void>
  resumeFocus: () => Promise<void>
  abandonFocus: () => Promise<void>
  finishFocus: (progressSnapshot: number) => Promise<TimeLog | undefined>
}

function sortTasks(tasks: Task[]) {
  const rank: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
  return [...tasks].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1
    if (b.status === 'completed' && a.status !== 'completed') return -1
    const dateDiff = a.deadline.localeCompare(b.deadline)
    if (dateDiff !== 0) return dateDiff
    return rank[b.priority] - rank[a.priority]
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  tasks: [],
  sessions: [],
  timeLogs: [],
  estimateSnapshots: [],
  hydrated: false,

  async loadInitialData() {
    const [tasks, sessions, timeLogs, estimateSnapshots] = await Promise.all([
      db.tasks.where('status').notEqual('deleted').toArray(),
      db.sessions.toArray(),
      db.timeLogs.toArray(),
      db.estimateSnapshots.toArray()
    ])
    set({
      tasks: sortTasks(tasks),
      sessions,
      timeLogs,
      estimateSnapshots,
      hydrated: true
    })
  },

  async createTask(input) {
    const now = Date.now()
    const task: Task = {
      id: uid('task'),
      title: input.title.trim(),
      deadline: input.deadline,
      priority: input.priority,
      note: input.note?.trim(),
      status: 'active',
      progress: 0,
      createdAt: now,
      updatedAt: now
    }
    await db.tasks.add(task)
    set((state) => ({ tasks: sortTasks([...state.tasks, task]) }))
  },

  async updateTask(id, patch) {
    const updatedPatch = { ...patch, updatedAt: Date.now() }
    await db.tasks.update(id, updatedPatch)
    set((state) => ({
      tasks: sortTasks(state.tasks.map((task) => (task.id === id ? { ...task, ...updatedPatch } : task)))
    }))
  },

  async setTaskStatus(id, status) {
    const patch: Partial<Task> = {
      status,
      updatedAt: Date.now(),
      completedAt: status === 'completed' ? Date.now() : undefined
    }
    if (status === 'completed') patch.progress = 100
    await db.tasks.update(id, patch)
    set((state) => ({
      tasks: sortTasks(state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)))
    }))
  },

  async deleteTask(id) {
    await get().setTaskStatus(id, 'deleted')
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }))
  },

  async startFocus(taskId) {
    const running = get().sessions.find((session) => session.status === 'running' || session.status === 'paused')
    if (running) return

    const task = get().tasks.find((item) => item.id === taskId)
    if (!task || task.status === 'completed' || task.status === 'deleted') return

    const session: FocusSession = {
      id: uid('session'),
      taskId,
      startedAt: Date.now(),
      pausedSpans: [],
      status: 'running',
      createdAt: Date.now()
    }
    const updatedTask = task.status === 'paused' ? { ...task, status: 'active' as const, updatedAt: Date.now() } : task
    await db.transaction('rw', db.sessions, db.tasks, async () => {
      await db.sessions.add(session)
      if (updatedTask !== task) await db.tasks.put(updatedTask)
    })
    set((state) => ({
      sessions: [...state.sessions, session],
      tasks: sortTasks(state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item)))
    }))
  },

  async pauseFocus() {
    const session = get().sessions.find((item) => item.status === 'running')
    if (!session) return
    const updated: FocusSession = {
      ...session,
      status: 'paused',
      pausedSpans: [...session.pausedSpans, { pausedAt: Date.now() }]
    }
    await db.sessions.put(updated)
    set((state) => ({ sessions: state.sessions.map((item) => (item.id === updated.id ? updated : item)) }))
  },

  async resumeFocus() {
    const session = get().sessions.find((item) => item.status === 'paused')
    if (!session) return
    const pausedSpans = [...session.pausedSpans]
    const last = pausedSpans[pausedSpans.length - 1]
    if (last && !last.resumedAt) {
      pausedSpans[pausedSpans.length - 1] = { ...last, resumedAt: Date.now() }
    }
    const updated: FocusSession = { ...session, status: 'running', pausedSpans }
    await db.sessions.put(updated)
    set((state) => ({ sessions: state.sessions.map((item) => (item.id === updated.id ? updated : item)) }))
  },

  async abandonFocus() {
    const session = get().sessions.find((item) => item.status === 'running' || item.status === 'paused')
    if (!session) return
    const updated: FocusSession = {
      ...session,
      status: 'abandoned',
      endedAt: Date.now(),
      durationMs: getSessionElapsed(session)
    }
    await db.sessions.put(updated)
    set((state) => ({ sessions: state.sessions.map((item) => (item.id === updated.id ? updated : item)) }))
  },

  async finishFocus(progressSnapshot) {
    const session = get().sessions.find((item) => item.status === 'running' || item.status === 'paused')
    if (!session) return undefined
    const task = get().tasks.find((item) => item.id === session.taskId)
    if (!task) return undefined

    const now = Date.now()
    const durationMs = getSessionElapsed(session, now)
    const safeProgress = Math.min(100, Math.max(0, progressSnapshot))
    const progressDelta = safeProgress - task.progress
    const log: TimeLog = {
      id: uid('log'),
      taskId: task.id,
      startedAt: session.startedAt,
      endedAt: now,
      durationMs,
      previousProgress: task.progress,
      progressSnapshot: safeProgress,
      progressDelta,
      contributesToEstimate: progressDelta > 0,
      createdAt: now
    }
    const updatedSession: FocusSession = {
      ...session,
      endedAt: now,
      status: 'finished',
      durationMs,
      progressSnapshot: safeProgress
    }
    const updatedTask: Task = {
      ...task,
      progress: safeProgress,
      status: safeProgress >= 100 ? 'completed' : task.status === 'paused' ? 'active' : task.status,
      updatedAt: now,
      completedAt: safeProgress >= 100 ? now : task.completedAt
    }
    const nextLogs = [...get().timeLogs, log]
    const snapshot = createEstimateSnapshot(updatedTask, nextLogs)

    await db.transaction('rw', db.sessions, db.timeLogs, db.tasks, db.estimateSnapshots, async () => {
      await db.sessions.put(updatedSession)
      await db.timeLogs.add(log)
      await db.tasks.put(updatedTask)
      await db.estimateSnapshots.add(snapshot)
    })

    set((state) => ({
      sessions: state.sessions.map((item) => (item.id === updatedSession.id ? updatedSession : item)),
      timeLogs: [...state.timeLogs, log],
      estimateSnapshots: [...state.estimateSnapshots, snapshot],
      tasks: sortTasks(state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item)))
    }))
    return log
  }
}))
