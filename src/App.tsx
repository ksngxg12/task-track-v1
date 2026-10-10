import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ElementType, type FormEvent } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  Clock3,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { estimateTask } from './lib/estimate'
import { addDaysIso, daysBetween, formatClock, formatDate, formatDuration, getSessionElapsed, hourMs, todayIso, toLocalIsoDate } from './lib/time'
import { useAppStore } from './store/useAppStore'
import type { EstimateSnapshot, FocusSession, Priority, Task, TaskEstimate, TimeLog } from './types/domain'

type View = 'today' | 'tasks' | 'plan' | 'stats'
type TaskEditorInput = { title: string; deadline: string; priority: Priority; note?: string }
type TaskModalState = { mode: 'create' } | { mode: 'edit'; task: Task }

const dailyCapacityMs = 4 * hourMs

const priorityMeta: Record<Priority, { label: string; className: string; weight: number }> = {
  low: { label: '低', className: 'bg-slate-100 text-slate-700', weight: 1 },
  medium: { label: '中', className: 'bg-emerald-50 text-emerald-700', weight: 2 },
  high: { label: '高', className: 'bg-amber-50 text-amber-700', weight: 3 },
  urgent: { label: '急', className: 'bg-rose-50 text-rose-700', weight: 4 }
}

const confidenceLabel = {
  insufficient: '数据不足',
  low: '低置信',
  medium: '中置信',
  high: '高置信'
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-ink text-white hover:bg-slate-700',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-coral text-white hover:bg-red-600',
        className
      )}
    >
      {children}
    </button>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'good' }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-soft">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx('mt-2 text-2xl font-semibold', tone === 'warn' && 'text-coral', tone === 'good' && 'text-mint')}>{value}</div>
    </div>
  )
}

function getTaskEstimate(task: Task, logs: TimeLog[]) {
  return estimateTask(task, logs)
}

function getRemainingMs(estimate: TaskEstimate) {
  return estimate.weightedRemainingMs ?? estimate.basicRemainingMs
}

function estimateText(estimate: TaskEstimate) {
  if (!getRemainingMs(estimate) && estimate.confidence === 'insufficient') return '继续记录'
  if (estimate.rangeLowMs !== undefined && estimate.rangeHighMs !== undefined) {
    return `${formatDuration(estimate.rangeLowMs)} - ${formatDuration(estimate.rangeHighMs)}`
  }
  return formatDuration(getRemainingMs(estimate))
}

function activeSessions(sessions: FocusSession[]) {
  return sessions.find((session) => session.status === 'running' || session.status === 'paused')
}

function buildPlan(tasks: Task[], logs: TimeLog[]) {
  const today = todayIso()
  return tasks
    .filter((task) => task.status !== 'completed' && task.status !== 'deleted')
    .map((task) => {
      const estimate = getTaskEstimate(task, logs)
      const remainingMs = getRemainingMs(estimate)
      const daysLeft = Math.max(1, daysBetween(today, task.deadline) + 1)
      const dailyMs = remainingMs === undefined ? undefined : remainingMs / daysLeft
      const overdue = task.deadline < today
      const overtimeMs = dailyMs === undefined ? undefined : Math.max(0, dailyMs - dailyCapacityMs)
      return { task, estimate, daysLeft, dailyMs, overdue, overtimeMs }
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return (b.dailyMs ?? 0) - (a.dailyMs ?? 0)
    })
}

function TopTimer({
  session,
  task,
  onPause,
  onResume,
  onAbandon,
  onFinish
}: {
  session?: FocusSession
  task?: Task
  onPause: () => void
  onResume: () => void
  onAbandon: () => void
  onFinish: () => void
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (!session || !task) {
    return (
      <div className="hidden items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-500 shadow-soft sm:flex">
        <Clock3 className="h-4 w-4" />
        <span>暂无专注</span>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-white px-2 py-2 shadow-soft">
      <div className="min-w-0 px-1">
        <div className="truncate text-xs font-medium text-slate-500">正在专注</div>
        <div className="truncate text-sm font-semibold text-ink">{task.title}</div>
      </div>
      <div className="min-w-[92px] rounded-md bg-slate-100 px-2 py-1 text-center font-mono text-sm font-semibold text-ink">
        {formatClock(getSessionElapsed(session, now))}
      </div>
      {session.status === 'running' ? (
        <Button variant="secondary" className="h-9 w-9 px-0" onClick={onPause} title="暂停">
          <Pause className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="secondary" className="h-9 w-9 px-0" onClick={onResume} title="继续">
          <Play className="h-4 w-4" />
        </Button>
      )}
      <Button variant="secondary" className="h-9 w-9 px-0" onClick={onFinish} title="结束本次专注">
        <Square className="h-4 w-4" />
      </Button>
      <Button variant="ghost" className="h-9 w-9 px-0 text-coral" onClick={onAbandon} title="放弃本次">
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}

function TaskEditorModal({
  state,
  onCancel,
  onSave
}: {
  state: TaskModalState
  onCancel: () => void
  onSave: (input: TaskEditorInput) => void
}) {
  const editingTask = state.mode === 'edit' ? state.task : undefined
  const [title, setTitle] = useState(editingTask?.title ?? '')
  const [deadline, setDeadline] = useState(editingTask?.deadline ?? todayIso())
  const [priority, setPriority] = useState<Priority>(editingTask?.priority ?? 'medium')
  const [note, setNote] = useState(editingTask?.note ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    onSave({ title: title.trim(), deadline, priority, note: note.trim() })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/35 p-4 sm:items-center sm:justify-center">
      <form onSubmit={submit} className="w-full max-w-lg rounded-md bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{state.mode === 'create' ? '新建任务' : '编辑任务'}</h2>
          <Button type="button" variant="ghost" onClick={onCancel}>
            关闭
          </Button>
        </div>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            任务名称
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-md border border-line px-3 outline-none focus:border-mint"
              autoFocus
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              截止日期
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="h-11 rounded-md border border-line px-3 outline-none focus:border-mint"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              优先级
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className="h-11 rounded-md border border-line px-3 outline-none focus:border-mint"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            备注
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="resize-none rounded-md border border-line px-3 py-2 outline-none focus:border-mint"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit">{state.mode === 'create' ? '创建' : '保存'}</Button>
        </div>
      </form>
    </div>
  )
}

function TaskRow({
  task,
  logs,
  disabledStart,
  onStart,
  onEdit,
  onPauseTask,
  onActivateTask,
  onComplete,
  onDelete
}: {
  task: Task
  logs: TimeLog[]
  disabledStart: boolean
  onStart: () => void
  onEdit: () => void
  onPauseTask: () => void
  onActivateTask: () => void
  onComplete: () => void
  onDelete: () => void
}) {
  const estimate = getTaskEstimate(task, logs)
  const overdue = task.deadline < todayIso() && task.status !== 'completed'

  return (
    <article className="rounded-md border border-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink">{task.title}</h3>
            <span className={cx('rounded px-2 py-0.5 text-xs font-semibold', priorityMeta[task.priority].className)}>
              {priorityMeta[task.priority].label}
            </span>
            {overdue && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-coral">逾期</span>}
            {task.status === 'paused' && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">已暂停</span>}
            {task.status === 'completed' && <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-mint">已完成</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>截止 {formatDate(task.deadline)}</span>
            <span>投入 {formatDuration(estimate.investedMs)}</span>
            <span>剩余 {estimateText(estimate)}</span>
            <span>{confidenceLabel[estimate.confidence]}</span>
          </div>
          {task.note && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{task.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onStart} disabled={disabledStart || task.status === 'completed'}>
            <Play className="h-4 w-4" />
            开始专注
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            编辑
          </Button>
          {task.status === 'paused' ? (
            <Button variant="secondary" onClick={onActivateTask}>
              <Play className="h-4 w-4" />
              恢复
            </Button>
          ) : (
            <Button variant="secondary" onClick={onPauseTask} disabled={task.status === 'completed'}>
              <Pause className="h-4 w-4" />
              暂停
            </Button>
          )}
          <Button variant="secondary" onClick={onComplete} disabled={task.status === 'completed'}>
            <Check className="h-4 w-4" />
            完成
          </Button>
          <Button variant="ghost" onClick={onDelete} className="text-coral">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <div className="flex justify-between text-xs font-medium text-slate-500">
          <span>进度</span>
          <span>{task.progress}%</span>
        </div>
        <ProgressBar value={task.progress} />
      </div>
    </article>
  )
}

function FinishFocusModal({
  session,
  task,
  logs,
  onCancel,
  onConfirm
}: {
  session: FocusSession
  task: Task
  logs: TimeLog[]
  onCancel: () => void
  onConfirm: (progress: number) => void
}) {
  const [progress, setProgress] = useState(task.progress)
  const elapsed = getSessionElapsed(session)
  const tentativeEstimate = useMemo(() => {
    const log: TimeLog = {
      id: 'preview',
      taskId: task.id,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      durationMs: elapsed,
      previousProgress: task.progress,
      progressSnapshot: progress,
      progressDelta: progress - task.progress,
      contributesToEstimate: progress - task.progress > 0,
      createdAt: Date.now()
    }
    return estimateTask({ ...task, progress }, [...logs, log])
  }, [elapsed, logs, progress, session.startedAt, task])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/35 p-4 sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-md bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">结束本次专注</h2>
          <span className="rounded bg-slate-100 px-3 py-1 font-mono text-sm font-semibold text-ink">{formatClock(elapsed)}</span>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-3 text-sm font-medium text-slate-700">
            当前总进度
            <input type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
            <input
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(event) => setProgress(Math.min(100, Math.max(0, Number(event.target.value))))}
              className="h-11 rounded-md border border-line px-3 outline-none focus:border-mint"
            />
          </label>
          <div className="grid gap-3 rounded-md border border-line bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-slate-500">推算总时长</div>
              <div className="mt-1 text-lg font-semibold text-ink">
                {formatDuration(tentativeEstimate.weightedTotalMs ?? tentativeEstimate.basicTotalMs)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">预计剩余</div>
              <div className="mt-1 text-lg font-semibold text-ink">{estimateText(tentativeEstimate)}</div>
            </div>
          </div>
          {progress <= task.progress && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">本次时长会计入累计投入，但不会更新单进度耗时。</div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={() => onConfirm(progress)}>确认记录</Button>
        </div>
      </div>
    </div>
  )
}

function TodayView({
  tasks,
  logs,
  disabledStart,
  onCreateTask,
  onStart
}: {
  tasks: Task[]
  logs: TimeLog[]
  disabledStart: boolean
  onCreateTask: () => void
  onStart: (taskId: string) => void
}) {
  const plan = buildPlan(tasks, logs)
  const todayLogs = logs.filter((log) => new Date(log.startedAt).toDateString() === new Date().toDateString())
  const todayFocused = todayLogs.reduce((total, log) => total + log.durationMs, 0)
  const todaySuggested = plan.reduce((total, item) => total + (item.dailyMs ?? 0), 0)
  const riskCount = plan.filter((item) => item.overdue || (item.overtimeMs ?? 0) > 0).length
  const topItems = plan.slice(0, 5)
  const week = Array.from({ length: 7 }, (_item, index) => {
    const date = addDaysIso(todayIso(), index)
    const total = plan.reduce((sum, item) => {
      if (item.task.deadline < date) return sum
      return sum + (item.dailyMs ?? 0)
    }, 0)
    return { name: formatDate(date).replace('月', '/').replace('日', ''), hours: Number((total / hourMs).toFixed(1)) }
  })

  return (
    <section className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">今日</h2>
          <p className="mt-1 text-sm text-slate-500">按截止压力自动安排投入</p>
        </div>
        <Button onClick={onCreateTask}>
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="今日建议投入" value={formatDuration(todaySuggested)} tone={todaySuggested > dailyCapacityMs ? 'warn' : 'default'} />
        <Metric label="今日已专注" value={formatDuration(todayFocused)} tone="good" />
        <Metric label="风险任务" value={`${riskCount} 个`} tone={riskCount > 0 ? 'warn' : 'default'} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-line bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">今日待办</h2>
            <CalendarDays className="h-5 w-5 text-slate-400" />
          </div>
          <div className="grid gap-3">
            {topItems.length === 0 && <div className="rounded-md bg-slate-50 p-5 text-sm text-slate-500">暂无进行中的任务</div>}
            {topItems.map(({ task, dailyMs, estimate, overdue, overtimeMs }) => (
              <div key={task.id} className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-ink">{task.title}</h3>
                    <span className={cx('rounded px-2 py-0.5 text-xs font-semibold', priorityMeta[task.priority].className)}>
                      {priorityMeta[task.priority].label}
                    </span>
                    {overdue && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-coral">逾期</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>今日 {dailyMs === undefined ? '暂无估算' : formatDuration(dailyMs)}</span>
                    <span>剩余 {estimateText(estimate)}</span>
                    {(overtimeMs ?? 0) > 0 && <span className="text-coral">每日超出 {formatDuration(overtimeMs)}</span>}
                  </div>
                </div>
                <Button onClick={() => onStart(task.id)} disabled={disabledStart}>
                  <Play className="h-4 w-4" />
                  开始
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-line bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">本周概览</h2>
            <BarChart3 className="h-5 w-5 text-slate-400" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip formatter={(value) => [`${value} 小时`, '建议投入']} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {week.map((item) => (
                    <Cell key={item.name} fill={item.hours > 4 ? '#e85d50' : '#1f9d8a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}

function TasksView({
  tasks,
  logs,
  disabledStart,
  onCreateTask,
  onEditTask,
  onStart,
  onPauseTask,
  onActivateTask,
  onComplete,
  onDelete
}: {
  tasks: Task[]
  logs: TimeLog[]
  disabledStart: boolean
  onCreateTask: () => void
  onEditTask: (task: Task) => void
  onStart: (taskId: string) => void
  onPauseTask: (taskId: string) => void
  onActivateTask: (taskId: string) => void
  onComplete: (taskId: string) => void
  onDelete: (taskId: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all')
  const filtered = tasks.filter((task) => filter === 'all' || task.status === filter)

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">任务</h2>
          <p className="mt-1 text-sm text-slate-500">按截止日期与优先级排序</p>
        </div>
        <Button onClick={onCreateTask}>
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'paused', 'completed'] as const).map((item) => (
          <Button key={item} variant={filter === item ? 'primary' : 'secondary'} onClick={() => setFilter(item)}>
            {item === 'all' ? '全部' : item === 'active' ? '进行中' : item === 'paused' ? '已暂停' : '已完成'}
          </Button>
        ))}
      </div>
      <div className="grid gap-3">
        {filtered.length === 0 && <div className="rounded-md border border-line bg-white p-8 text-center text-sm text-slate-500 shadow-soft">暂无任务</div>}
        {filtered.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            logs={logs}
            disabledStart={disabledStart}
            onStart={() => onStart(task.id)}
            onEdit={() => onEditTask(task)}
            onPauseTask={() => onPauseTask(task.id)}
            onActivateTask={() => onActivateTask(task.id)}
            onComplete={() => onComplete(task.id)}
            onDelete={() => onDelete(task.id)}
          />
        ))}
      </div>
    </section>
  )
}

function PlanView({ tasks, logs }: { tasks: Task[]; logs: TimeLog[] }) {
  const plan = buildPlan(tasks, logs)
  const today = todayIso()
  const weekDays = Array.from({ length: 7 }, (_item, index) => addDaysIso(today, index))

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold text-ink">计划</h2>
        <p className="mt-1 text-sm text-slate-500">默认每日可用容量为 4 小时</p>
      </div>
      <div className="grid gap-3">
        {plan.map(({ task, estimate, dailyMs, overdue, overtimeMs, daysLeft }) => (
          <article key={task.id} className="rounded-md border border-line bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{task.title}</h3>
                  <span className={cx('rounded px-2 py-0.5 text-xs font-semibold', priorityMeta[task.priority].className)}>
                    {priorityMeta[task.priority].label}
                  </span>
                  {overdue && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-coral">已逾期</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span>截止 {formatDate(task.deadline)}</span>
                  <span>{daysLeft} 天</span>
                  <span>剩余 {estimateText(estimate)}</span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-sm text-slate-500">每日建议</div>
                <div className={cx('text-xl font-semibold', (overtimeMs ?? 0) > 0 ? 'text-coral' : 'text-ink')}>
                  {dailyMs === undefined ? '暂无估算' : formatDuration(dailyMs)}
                </div>
                {(overtimeMs ?? 0) > 0 && <div className="mt-1 text-sm text-coral">需额外 {formatDuration(overtimeMs)}</div>}
              </div>
            </div>
          </article>
        ))}
        {plan.length === 0 && <div className="rounded-md border border-line bg-white p-8 text-center text-sm text-slate-500 shadow-soft">暂无计划</div>}
      </div>
      <div className="rounded-md border border-line bg-white p-4 shadow-soft">
        <h3 className="mb-4 text-lg font-semibold text-ink">一周分配</h3>
        <div className="grid gap-3 md:grid-cols-7">
          {weekDays.map((date) => {
            const total = plan.reduce((sum, item) => {
              if (item.task.deadline < date) return sum
              return sum + (item.dailyMs ?? 0)
            }, 0)
            return (
              <div key={date} className="rounded-md border border-line p-3">
                <div className="text-sm font-semibold text-ink">{formatDate(date)}</div>
                <div className={cx('mt-2 text-lg font-semibold', total > dailyCapacityMs ? 'text-coral' : 'text-mint')}>
                  {formatDuration(total)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StatsView({
  tasks,
  logs,
  estimateSnapshots
}: {
  tasks: Task[]
  logs: TimeLog[]
  estimateSnapshots: EstimateSnapshot[]
}) {
  const today = todayIso()
  const dailyData = Array.from({ length: 7 }, (_item, index) => {
    const date = addDaysIso(today, index - 6)
    const total = logs
      .filter((log) => toLocalIsoDate(new Date(log.startedAt)) === date)
      .reduce((sum, log) => sum + log.durationMs, 0)
    return { name: formatDate(date).replace('月', '/').replace('日', ''), hours: Number((total / hourMs).toFixed(1)) }
  })

  const taskData = tasks
    .map((task) => {
      const estimate = getTaskEstimate(task, logs)
      return {
        name: task.title.length > 8 ? `${task.title.slice(0, 8)}...` : task.title,
        hours: Number((estimate.investedMs / hourMs).toFixed(1)),
        progress: task.progress
      }
    })
    .filter((item) => item.hours > 0 || item.progress > 0)

  const completedAccuracy = tasks
    .filter((task) => task.status === 'completed')
    .map((task) => {
      const taskLogs = logs.filter((log) => log.taskId === task.id)
      const actualMs = taskLogs.reduce((sum, log) => sum + log.durationMs, 0)
      const early = estimateSnapshots
        .filter((snapshot) => snapshot.taskId === task.id && snapshot.weightedTotalMs)
        .sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!early?.weightedTotalMs || actualMs <= 0) return undefined
      const error = Math.abs(early.weightedTotalMs - actualMs) / actualMs
      return {
        name: task.title,
        early: formatDuration(early.weightedTotalMs),
        actual: formatDuration(actualMs),
        accuracy: `${Math.max(0, Math.round((1 - error) * 100))}%`
      }
    })
    .filter(Boolean) as Array<{ name: string; early: string; actual: string; accuracy: string }>

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold text-ink">统计</h2>
        <p className="mt-1 text-sm text-slate-500">专注、进度与估算回顾</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4 shadow-soft">
          <h3 className="mb-4 text-lg font-semibold text-ink">每日专注</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1f9d8a" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1f9d8a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip formatter={(value) => [`${value} 小时`, '专注']} />
                <Area type="monotone" dataKey="hours" stroke="#1f9d8a" fill="url(#focusFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-md border border-line bg-white p-4 shadow-soft">
          <h3 className="mb-4 text-lg font-semibold text-ink">任务投入与进度</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={taskData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="hours" name="投入小时" stroke="#a23b72" strokeWidth={2} />
                <Line type="monotone" dataKey="progress" name="进度%" stroke="#d58a00" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="rounded-md border border-line bg-white p-4 shadow-soft">
        <h3 className="mb-4 text-lg font-semibold text-ink">估算准确率回顾</h3>
        <div className="grid gap-3">
          {completedAccuracy.length === 0 && <div className="rounded-md bg-slate-50 p-5 text-sm text-slate-500">暂无已完成任务估算样本</div>}
          {completedAccuracy.map((item) => (
            <div key={item.name} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div className="font-semibold text-ink">{item.name}</div>
              <div className="text-sm text-slate-500">早期 {item.early}</div>
              <div className="text-sm text-slate-500">实际 {item.actual}</div>
              <div className="font-semibold text-mint">{item.accuracy}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const {
    tasks,
    sessions,
    timeLogs,
    estimateSnapshots,
    hydrated,
    loadInitialData,
    createTask,
    updateTask,
    setTaskStatus,
    deleteTask,
    startFocus,
    pauseFocus,
    resumeFocus,
    abandonFocus,
    finishFocus
  } = useAppStore()
  const [view, setView] = useState<View>('today')
  const [finishOpen, setFinishOpen] = useState(false)
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null)

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  const currentSession = activeSessions(sessions)
  const currentTask = currentSession ? tasks.find((task) => task.id === currentSession.taskId) : undefined
  const activeTasks = tasks.filter((task) => task.status !== 'deleted')

  async function confirmFinish(progress: number) {
    await finishFocus(progress)
    setFinishOpen(false)
  }

  async function saveTask(input: TaskEditorInput) {
    if (!taskModal) return
    if (taskModal.mode === 'create') {
      await createTask(input)
    } else {
      await updateTask(taskModal.task.id, input)
    }
    setTaskModal(null)
  }

  const navItems: Array<{ id: View; label: string; icon: ElementType }> = [
    { id: 'today', label: '今日', icon: CalendarDays },
    { id: 'tasks', label: '任务', icon: ListChecks },
    { id: 'plan', label: '计划', icon: AlertTriangle },
    { id: 'stats', label: '统计', icon: BarChart3 }
  ]

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xl font-bold tracking-normal text-ink">Task Track</div>
            <div className="text-xs font-medium text-slate-500">{formatDate(todayIso())}</div>
          </div>
          <TopTimer
            session={currentSession}
            task={currentTask}
            onPause={pauseFocus}
            onResume={resumeFocus}
            onAbandon={abandonFocus}
            onFinish={() => setFinishOpen(true)}
          />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[180px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 grid gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cx(
                    'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition',
                    view === item.id ? 'bg-ink text-white' : 'text-slate-600 hover:bg-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="pb-24 lg:pb-4">
          {!hydrated ? (
            <div className="rounded-md border border-line bg-white p-8 text-center text-sm text-slate-500 shadow-soft">正在载入</div>
          ) : (
            <>
              {view === 'today' && (
                <TodayView
                  tasks={activeTasks}
                  logs={timeLogs}
                  disabledStart={Boolean(currentSession)}
                  onCreateTask={() => setTaskModal({ mode: 'create' })}
                  onStart={(id) => void startFocus(id)}
                />
              )}
              {view === 'tasks' && (
                <TasksView
                  tasks={activeTasks}
                  logs={timeLogs}
                  disabledStart={Boolean(currentSession)}
                  onCreateTask={() => setTaskModal({ mode: 'create' })}
                  onEditTask={(task) => setTaskModal({ mode: 'edit', task })}
                  onStart={(id) => void startFocus(id)}
                  onPauseTask={(id) => void setTaskStatus(id, 'paused')}
                  onActivateTask={(id) => void setTaskStatus(id, 'active')}
                  onComplete={(id) => void setTaskStatus(id, 'completed')}
                  onDelete={(id) => void deleteTask(id)}
                />
              )}
              {view === 'plan' && <PlanView tasks={activeTasks} logs={timeLogs} />}
              {view === 'stats' && <StatsView tasks={activeTasks} logs={timeLogs} estimateSnapshots={estimateSnapshots} />}
            </>
          )}
        </main>
      </div>

      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-white px-2 py-2 shadow-soft lg:hidden">
        <div className="grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cx('grid h-12 place-items-center rounded-md text-xs font-semibold', view === item.id ? 'bg-ink text-white' : 'text-slate-600')}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      {finishOpen && currentSession && currentTask && (
        <FinishFocusModal session={currentSession} task={currentTask} logs={timeLogs} onCancel={() => setFinishOpen(false)} onConfirm={confirmFinish} />
      )}
      {taskModal && <TaskEditorModal state={taskModal} onCancel={() => setTaskModal(null)} onSave={(input) => void saveTask(input)} />}
    </div>
  )
}
