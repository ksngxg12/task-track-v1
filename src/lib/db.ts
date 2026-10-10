import Dexie, { type Table } from 'dexie'
import type { EstimateSnapshot, FocusSession, Task, TimeLog } from '../types/domain'

class TaskTrackDatabase extends Dexie {
  tasks!: Table<Task, string>
  sessions!: Table<FocusSession, string>
  timeLogs!: Table<TimeLog, string>
  estimateSnapshots!: Table<EstimateSnapshot, string>

  constructor() {
    super('TaskTrackV1')
    this.version(1).stores({
      tasks: 'id, deadline, status, priority, createdAt, updatedAt',
      sessions: 'id, taskId, status, startedAt, endedAt',
      timeLogs: 'id, taskId, startedAt, endedAt, createdAt',
      estimateSnapshots: 'id, taskId, createdAt'
    })
  }
}

export const db = new TaskTrackDatabase()
