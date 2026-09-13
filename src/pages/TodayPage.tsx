import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { todayKey } from '../domain/clock'
import type { PriorityBand, Task } from '../domain/types'
import { addTaskEvent, db, ensureDailyPlan, newId } from '../db/db'

const BANDS: { id: PriorityBand; label: string }[] = [
  { id: 'must', label: 'MUST' },
  { id: 'should', label: 'SHOULD' },
  { id: 'optional', label: 'OPTIONAL' },
]

export function TodayPage() {
  const date = todayKey()
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

  const plannedMust = (tasks ?? [])
    .filter((task) => task.priorityBand === 'must' && task.status !== 'cancelled')
    .reduce((sum, task) => sum + task.plannedMinutes, 0)

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
    await addTaskEvent(task.id, 'started', { before: task.status, after: 'in_progress' })
  }

  async function finishTask(task: Task, actualMinutes: number) {
    const openId = openSessions.get(task.id)
    const now = new Date().toISOString()
    if (openId) {
      const session = await db.workSessions.get(openId)
      const started = session ? new Date(session.startedAt).getTime() : Date.now()
      const computed = Math.max(
        1,
        Math.round((Date.now() - started) / 60_000),
      )
      await db.workSessions.update(openId, {
        endedAt: now,
        actualMinutes: computed,
      })
    } else {
      await db.workSessions.add({
        id: newId(),
        taskId: task.id,
        startedAt: now,
        endedAt: now,
        actualMinutes,
      })
    }
    await db.tasks.update(task.id, { status: 'completed', completedAt: now })
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

  return (
    <section>
      <p className="text-sm text-stone-500">TODAY · {date}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          今日可支配执行时间（分钟）
          <input
            type="number"
            min={0}
            className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
            value={capacityDraft}
            onChange={(event) => setCapacityDraft(Number(event.target.value))}
            onBlur={() => void saveCapacity()}
          />
        </label>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          已规划 MUST
          <p className="mt-2 text-2xl text-stone-900">{plannedMust} min</p>
        </div>
      </div>

      <form
        className="mt-5 space-y-3 rounded-xl border border-stone-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void addTask()
        }}
      >
        <input
          required
          placeholder="今天要做的一件事"
          className="w-full rounded-md border border-stone-300 px-3 py-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-sm text-stone-600">
            计划分钟
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-stone-600">
            优先级
            <select
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              value={band}
              onChange={(event) => setBand(event.target.value as PriorityBand)}
            >
              {BANDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-stone-600 col-span-2 sm:col-span-1">
            开始时间（可选）
            <input
              type="time"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              value={plannedStart}
              onChange={(event) => setPlannedStart(event.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-stone-900 px-3 py-2 text-white"
        >
          加入今日
        </button>
      </form>

      {BANDS.map((item) => {
        const list = (tasks ?? []).filter(
          (task) =>
            task.priorityBand === item.id && task.status !== 'cancelled',
        )
        if (item.id !== 'must' && list.length === 0) return null
        return (
          <div key={item.id} className="mt-8">
            <h2 className="text-xs tracking-[0.16em] text-stone-500">
              {item.label}
            </h2>
            {list.length === 0 ? (
              <p className="mt-3 text-sm text-stone-400">还没有 MUST。先写一件今天必须完成的事。</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {list.map((task) => (
                  <li
                    key={task.id}
                    className="rounded-xl border border-stone-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="mt-1 text-sm text-stone-500">
                          {task.plannedMinutes} min
                          {task.plannedStart ? ` · ${task.plannedStart}` : ''}
                          {' · '}
                          {labelStatus(task.status)}
                        </p>
                        <p className="mt-2 text-sm text-stone-400">尚未关联方向</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        {task.status !== 'completed' &&
                          task.status !== 'in_progress' && (
                            <button
                              type="button"
                              className="rounded-md border border-stone-300 px-3 py-1 text-sm"
                              onClick={() => void startTask(task)}
                            >
                              开始
                            </button>
                          )}
                        {task.status !== 'completed' && (
                          <button
                            type="button"
                            className="rounded-md bg-stone-900 px-3 py-1 text-sm text-white"
                            onClick={() => requestComplete(task)}
                          >
                            完成
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {completeTask && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <form
            className="w-full max-w-sm rounded-xl bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void finishTask(completeTask, manualMinutes)
            }}
          >
            <p className="font-medium">记录实际投入</p>
            <p className="mt-1 text-sm text-stone-500">
              这次没有点「开始」，需要手填分钟，不会自动等于计划时长。
            </p>
            <input
              type="number"
              min={1}
              className="mt-3 w-full rounded-md border border-stone-300 px-3 py-2"
              value={manualMinutes}
              onChange={(event) => setManualMinutes(Number(event.target.value))}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md border border-stone-300 py-2"
                onClick={() => setCompleteTask(null)}
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 rounded-md bg-stone-900 py-2 text-white"
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

function labelStatus(status: Task['status']): string {
  if (status === 'in_progress') return '进行中'
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已计划'
}
