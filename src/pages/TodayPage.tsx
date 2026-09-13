import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Play, Square } from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { addTaskEvent, db, ensureDailyPlan, newId } from '../db/db'
import { todayKey } from '../domain/clock'
import type { PriorityBand, Task } from '../domain/types'

const BANDS: { id: PriorityBand; label: string; hint: string }[] = [
  { id: 'must', label: 'MUST', hint: '今天不能悄悄消失' },
  { id: 'should', label: 'SHOULD', hint: '做了会更好' },
  { id: 'optional', label: 'OPTIONAL', hint: '有余力再做' },
]

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function TodayPage() {
  const date = todayKey()
  const now = new Date()
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(90)
  const [band, setBand] = useState<PriorityBand>('must')
  const [plannedStart, setPlannedStart] = useState('')
  const [capacityDraft, setCapacityDraft] = useState(240)
  const [completeTask, setCompleteTask] = useState<Task | null>(null)
  const [manualMinutes, setManualMinutes] = useState(0)

  const plan = useLiveQuery(() => db.dailyPlans.get(date), [date])
  const tasks = useLiveQuery(
    () => db.tasks.where('plannedDate').equals(date).toArray(),
    [date],
  )
  const sessions = useLiveQuery(() => db.workSessions.toArray(), [])

  useEffect(() => {
    void ensureDailyPlan(date)
  }, [date])

  useEffect(() => {
    if (plan) setCapacityDraft(plan.capacityMinutes)
  }, [plan])

  const openSessions = useMemo(() => {
    const map = new Map<string, string>()
    for (const session of sessions ?? []) {
      if (!session.endedAt) map.set(session.taskId, session.id)
    }
    return map
  }, [sessions])

  const visibleTasks = (tasks ?? []).filter((task) => task.status !== 'cancelled')
  const plannedMust = visibleTasks
    .filter((task) => task.priorityBand === 'must')
    .reduce((sum, task) => sum + task.plannedMinutes, 0)
  const loadRatio =
    capacityDraft > 0 ? Math.min(1, plannedMust / capacityDraft) : 0

  async function saveCapacity() {
    await db.dailyPlans.put({
      date,
      capacityMinutes: capacityDraft,
      confirmedAt: plan?.confirmedAt,
      lockedAt: plan?.lockedAt,
      overloadOverrideReason: plan?.overloadOverrideReason,
    })
  }

  async function addTask() {
    const trimmed = title.trim()
    if (!trimmed) return
    const task: Task = {
      id: newId(),
      title: trimmed,
      plannedDate: date,
      plannedStart: plannedStart || undefined,
      priorityBand: band,
      plannedMinutes: minutes,
      status: 'planned',
      createdAt: new Date().toISOString(),
    }
    await db.tasks.add(task)
    setTitle('')
    setPlannedStart('')
  }

  async function startTask(task: Task) {
    if (task.status === 'completed' || task.status === 'cancelled') return
    await db.workSessions.add({
      id: newId(),
      taskId: task.id,
      startedAt: new Date().toISOString(),
    })
    await db.tasks.update(task.id, { status: 'in_progress' })
    await addTaskEvent(task.id, 'started', {
      before: task.status,
      after: 'in_progress',
    })
  }

  async function finishTask(task: Task, actualMinutes: number) {
    const openId = openSessions.get(task.id)
    const stamp = new Date().toISOString()
    if (openId) {
      const session = await db.workSessions.get(openId)
      const started = session ? new Date(session.startedAt).getTime() : Date.now()
      const computed = Math.max(1, Math.round((Date.now() - started) / 60_000))
      await db.workSessions.update(openId, {
        endedAt: stamp,
        actualMinutes: computed,
      })
    } else {
      await db.workSessions.add({
        id: newId(),
        taskId: task.id,
        startedAt: stamp,
        endedAt: stamp,
        actualMinutes,
      })
    }
    await db.tasks.update(task.id, { status: 'completed', completedAt: stamp })
    await addTaskEvent(task.id, 'completed', {
      before: task.status,
      after: 'completed',
    })
    setCompleteTask(null)
  }

  function requestComplete(task: Task) {
    if (openSessions.has(task.id)) {
      void finishTask(task, 0)
      return
    }
    setManualMinutes(task.plannedMinutes)
    setCompleteTask(task)
  }

  const day = Number(date.slice(8, 10))
  const month = Number(date.slice(5, 7))

  return (
    <section>
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-mute">
            {date}
          </p>
          <div className="mt-2 flex items-end gap-4">
            <h1 className="font-display text-[4.75rem] leading-none tracking-tight text-ink">
              {day}
            </h1>
            <div className="mb-1.5">
              <p className="text-sm font-medium">{month}月</p>
              <p className="text-sm text-mute">{WEEKDAYS[now.getDay()]}</p>
            </div>
          </div>
        </div>
        <p className="hidden max-w-[10rem] text-right text-sm leading-6 text-mute sm:block">
          先写下今天不能逃的事，再开始计时。
        </p>
      </header>

      <div className="mt-8 rounded-2xl border border-line bg-snow p-5 shadow-[0_1px_0_rgba(21,32,43,0.04)]">
        <div className="flex items-end justify-between gap-3">
          <label className="text-sm text-mute">
            今天能投入
            <input
              type="number"
              min={0}
              className="mt-2 block w-28 rounded-md border border-line bg-paper px-3 py-2 font-mono text-ink"
              value={capacityDraft}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCapacityDraft(Number(event.target.value))
              }
              onBlur={() => void saveCapacity()}
            />
          </label>
          <div className="text-right">
            <p className="text-sm text-mute">MUST 已占</p>
            <p className="mt-1 font-mono text-2xl tracking-tight">
              {plannedMust}
              <span className="text-sm text-mute"> / {capacityDraft}</span>
            </p>
          </div>
        </div>
        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-line"
          role="meter"
          aria-label="MUST 占用今日容量"
          aria-valuemin={0}
          aria-valuemax={capacityDraft}
          aria-valuenow={plannedMust}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${
              loadRatio > 1 || plannedMust > capacityDraft
                ? 'bg-brass'
                : 'bg-ink'
            }`}
            style={{ width: `${Math.round(loadRatio * 100)}%` }}
          />
        </div>
      </div>

      <form
        className="mt-5 overflow-hidden rounded-2xl bg-ink text-snow"
        onSubmit={(event) => {
          event.preventDefault()
          void addTask()
        }}
      >
        <label className="block px-5 pt-5 text-[11px] tracking-[0.22em] text-brass">
          写入今日
          <input
            required
            placeholder="一件今天必须完成的事"
            className="mt-3 w-full border-0 bg-transparent p-0 text-lg text-snow outline-none placeholder:text-white/30 focus-visible:outline-none"
            value={title}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setTitle(event.target.value)
            }
          />
        </label>
        <div className="mt-5 grid grid-cols-2 border-t border-white/10 sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem_5.5rem]">
          <label className="border-b border-white/10 px-4 py-3 text-[11px] text-white/45 sm:border-b-0 sm:border-r">
            分钟
            <input
              type="number"
              min={1}
              className="mt-1 w-full border-0 bg-transparent p-0 font-mono text-sm text-snow outline-none focus-visible:outline-none"
              value={minutes}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setMinutes(Number(event.target.value))
              }
            />
          </label>
          <label className="border-b border-white/10 px-4 py-3 text-[11px] text-white/45 sm:order-3 sm:border-b-0 sm:border-r">
            开始
            <input
              type="time"
              className="mt-1 w-full border-0 bg-transparent p-0 font-mono text-sm text-snow outline-none focus-visible:outline-none"
              value={plannedStart}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setPlannedStart(event.target.value)
              }
            />
          </label>
          <fieldset className="col-span-2 border-b border-white/10 px-1 py-1 sm:col-span-1 sm:order-2 sm:border-b-0 sm:border-r">
            <legend className="sr-only">优先级</legend>
            <div className="grid h-full grid-cols-3">
              {BANDS.map((item) => (
                <label
                  key={item.id}
                  className={`flex min-h-11 cursor-pointer items-center justify-center font-mono text-[10px] tracking-[0.14em] transition-colors duration-200 ${
                    band === item.id ? 'bg-brass text-ink' : 'text-white/65 hover:text-snow'
                  }`}
                >
                  <input
                    type="radio"
                    name="band"
                    className="sr-only"
                    checked={band === item.id}
                    onChange={() => setBand(item.id)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="col-span-2 min-h-14 bg-snow text-sm font-medium text-ink transition-colors duration-200 hover:bg-brass-soft sm:col-span-1 sm:order-4"
          >
            记下
          </button>
        </div>
      </form>

      {BANDS.map((item) => {
        const list = visibleTasks.filter((task) => task.priorityBand === item.id)
        if (item.id !== 'must' && list.length === 0) return null
        return (
          <section key={item.id} className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] tracking-[0.22em] text-mute">
                {item.label}
              </h2>
              <p className="text-xs text-mute">{item.hint}</p>
            </div>
            {list.length === 0 ? (
              <p className="mt-4 border-t border-line pt-4 text-sm text-mute">
                今天还没有不可撤回的事。先写下第一件 MUST。
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {list.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    sessionStartedAt={
                      openSessions.has(task.id)
                        ? sessions?.find((session) => session.id === openSessions.get(task.id))
                            ?.startedAt
                        : undefined
                    }
                    onStart={() => void startTask(task)}
                    onComplete={() => requestComplete(task)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {completeTask && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <form
            className="w-full max-w-sm rounded-2xl bg-snow p-5"
            onSubmit={(event) => {
              event.preventDefault()
              void finishTask(completeTask, manualMinutes)
            }}
          >
            <p className="font-display text-2xl">记录实际投入</p>
            <p className="mt-2 text-sm leading-6 text-mute">
              这次没有点「开始」，需要手填分钟，不会自动等于计划时长。
            </p>
            <input
              type="number"
              min={1}
              className="mt-4 w-full rounded-md border border-line bg-paper px-3 py-3 font-mono"
              value={manualMinutes}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setManualMinutes(Number(event.target.value))
              }
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-md border border-line"
                onClick={() => setCompleteTask(null)}
              >
                取消
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 rounded-md bg-ink text-snow"
              >
                确认完成
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function TaskCard({
  task,
  sessionStartedAt,
  onStart,
  onComplete,
}: {
  task: Task
  sessionStartedAt?: string
  onStart: () => void
  onComplete: () => void
}) {
  const running = task.status === 'in_progress'
  const done = task.status === 'completed'

  return (
    <li
      className={`rounded-2xl border bg-snow p-4 transition-colors duration-200 ${
        running
          ? 'border-brass shadow-[inset_4px_0_0_0_#9a6b2f]'
          : done
            ? 'border-line opacity-70'
            : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base font-medium ${done ? 'line-through' : ''}`}>
            {task.title}
          </p>
          <p className="mt-1 font-mono text-xs text-mute">
            {task.plannedMinutes} min
            {task.plannedStart ? ` · ${task.plannedStart}` : ''}
            {' · '}
            {labelStatus(task.status)}
            {running && sessionStartedAt ? (
              <Elapsed startedAt={sessionStartedAt} />
            ) : null}
          </p>
          <p className="mt-2 text-xs text-mute">未挂方向</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {task.status !== 'completed' && task.status !== 'in_progress' && (
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line px-3 text-sm transition-colors duration-200 hover:border-ink"
              onClick={onStart}
            >
              <Play className="size-3.5" aria-hidden />
              开始
            </button>
          )}
          {task.status !== 'completed' && (
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg bg-ink px-3 text-sm text-snow transition-colors duration-200 hover:bg-brass hover:text-ink"
              onClick={onComplete}
            >
              {running ? (
                <Square className="size-3.5" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              完成
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000))
  const seconds = Math.max(
    0,
    Math.floor(((now - new Date(startedAt).getTime()) % 60_000) / 1000),
  )
  return (
    <span className="text-brass">
      {' · '}
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  )
}

function labelStatus(status: Task['status']): string {
  if (status === 'in_progress') return '进行中'
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已计划'
}
