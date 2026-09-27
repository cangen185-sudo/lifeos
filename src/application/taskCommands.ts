import { db, newId } from '../db/db'
import { isValidDateKey, todayKey } from '../domain/clock'
import { snapshotTask } from '../domain/desireLinks'
import type { PriorityBand, Task } from '../domain/types'

export async function createTask(task: Task, amendmentReason?: string): Promise<void> {
  if (!task.title.trim() || !task.plannedDate ||
      !isValidDateKey(task.plannedDate) || task.plannedDate < todayKey() ||
      !Number.isFinite(task.plannedMinutes) || task.plannedMinutes < 1) {
    throw new Error('请填写有效的任务标题、日期和计划分钟数')
  }
  if (task.desireIds && new Set(task.desireIds).size !== task.desireIds.length) {
    throw new Error('欲望关联不能重复')
  }
  await db.transaction('rw', db.tables, async () => {
      const date = task.plannedDate!
      const plan = await db.dailyPlans.get(date)
      if ((await db.dailyReviews.get(date))?.closedAt) throw new Error('这一天已经日结，请安排下一天')
      const needsAmendment = Boolean(plan?.lockedAt && task.priorityBand === 'must')
      const reason = amendmentReason?.trim() ?? ''
      if (needsAmendment && !reason) throw new Error('确认计划后新增 MUST 必须填写变更原因')
      const [goals, desires, commitments] = await Promise.all([
        db.goals.toArray(), db.desires.toArray(), db.commitments.toArray(),
      ])
      for (const id of task.desireIds ?? []) {
        if (!desires.some((desire) => desire.id === id)) throw new Error('欲望关联不存在')
      }
      if (task.primaryGoalId && !goals.some((goal) => goal.id === task.primaryGoalId)) throw new Error('目标不存在')
      if (task.primaryCommitmentId && !commitments.some((item) => item.id === task.primaryCommitmentId)) throw new Error('承诺不存在')
      await db.tasks.add({ ...task, title: task.title.trim() })
      if (needsAmendment && plan) {
        const stamp = new Date().toISOString()
        const snapshot = snapshotTask(task, goals, desires, commitments)
        await db.dailyPlans.put({
          ...plan,
          amendments: [...(plan.amendments ?? []), { id: newId(), createdAt: stamp, reason, task: snapshot }],
        })
        await db.taskEvents.add({
          id: newId(), taskId: `plan:${date}`, type: 'plan_amended',
          before: { mustCount: (plan.confirmedMusts?.length ?? 0) + (plan.amendments?.length ?? 0) },
          after: { taskId: task.id, reason }, createdAt: stamp,
        })
      }
    })
}

export async function editTaskBeforeConfirmation(input: {
  taskId: string
  title: string
  plannedMinutes: number
  priorityBand: PriorityBand
  plannedStart?: string
}): Promise<void> {
  const title = input.title.trim()
  if (!title || !Number.isFinite(input.plannedMinutes) || input.plannedMinutes < 1) {
    throw new Error('请填写任务标题和有效的计划分钟数')
  }
  await db.transaction('rw', db.tasks, db.dailyPlans, db.taskEvents, async () => {
    const task = await db.tasks.get(input.taskId)
    if (!task || task.status !== 'planned' || !task.plannedDate) throw new Error('当前任务不能编辑')
    if ((await db.dailyPlans.get(task.plannedDate))?.lockedAt) throw new Error('计划已确认，请用调整操作并选择原因')
    const after: Partial<Task> = {
      title,
      plannedMinutes: input.plannedMinutes,
      priorityBand: input.priorityBand,
      plannedStart: input.plannedStart || undefined,
    }
    await db.tasks.update(task.id, after)
    await db.taskEvents.add({
      id: newId(), taskId: task.id, type: 'edited',
      before: { title: task.title, plannedMinutes: task.plannedMinutes, priorityBand: task.priorityBand, plannedStart: task.plannedStart },
      after, createdAt: new Date().toISOString(),
    })
  })
}

export async function removeTaskBeforeConfirmation(taskId: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.dailyPlans, db.taskEvents, async () => {
    const task = await db.tasks.get(taskId)
    if (!task || task.status !== 'planned' || !task.plannedDate) throw new Error('当前任务不能移除')
    if ((await db.dailyPlans.get(task.plannedDate))?.lockedAt) throw new Error('计划已确认，请用调整操作并选择原因')
    await db.tasks.update(taskId, { status: 'cancelled' })
    await db.taskEvents.add({
      id: newId(), taskId, type: 'cancelled', before: 'planned', after: 'cancelled',
      createdAt: new Date().toISOString(),
    })
  })
}

export async function changeTaskDesireLinks(taskId: string, desireIds: string[]): Promise<void> {
  if (desireIds.some((id) => !id) || new Set(desireIds).size !== desireIds.length) {
    throw new Error('欲望关联不能重复或为空 ID')
  }
  await db.transaction('rw', db.tasks, db.desires, db.taskEvents, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) throw new Error('任务不存在')
    for (const id of desireIds) {
      if (!(await db.desires.get(id))) throw new Error('欲望关联不存在')
    }
    if (JSON.stringify(task.desireIds ?? []) === JSON.stringify(desireIds)) return
    await db.tasks.update(taskId, { desireIds })
    await db.taskEvents.add({
      id: newId(), taskId, type: 'desire_links_changed',
      before: task.desireIds ?? [], after: desireIds,
      createdAt: new Date().toISOString(),
    })
  })
}

/** Each command reads the current database state inside the write transaction. */
export async function startTask(taskId: string): Promise<boolean> {
  return db.transaction('rw', db.tasks, db.workSessions, db.taskEvents, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) throw new Error('任务不存在')

    const openSessions = (await db.workSessions.where('taskId').equals(taskId).toArray())
      .filter((session) => !session.endedAt)
    if (task.status === 'in_progress' && openSessions.length === 1) return false
    if (task.status !== 'planned' || openSessions.length !== 0) {
      throw new Error('任务状态与计时记录不一致，无法开始')
    }

    const stamp = new Date().toISOString()
    await db.workSessions.add({ id: newId(), taskId, startedAt: stamp })
    await db.tasks.update(taskId, { status: 'in_progress' })
    await db.taskEvents.add({
      id: newId(), taskId, type: 'started',
      before: 'planned', after: 'in_progress', createdAt: stamp,
    })
    return true
  })
}

export async function finishTask(taskId: string, manualMinutes?: number): Promise<boolean> {
  return db.transaction('rw', db.tasks, db.workSessions, db.taskEvents, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) throw new Error('任务不存在')
    if (task.status === 'completed') return false
    if (task.status !== 'planned' && task.status !== 'in_progress') {
      throw new Error('当前任务不能完成')
    }

    const openSessions = (await db.workSessions.where('taskId').equals(taskId).toArray())
      .filter((session) => !session.endedAt)
    if (openSessions.length > 1 || (task.status === 'planned' && openSessions.length > 0)) {
      throw new Error('任务状态与计时记录不一致，无法完成')
    }

    const stamp = new Date().toISOString()
    if (openSessions.length === 1) {
      const session = openSessions[0]
      const start = Date.parse(session.startedAt)
      if (!Number.isFinite(start)) throw new Error('计时记录的开始时间无效')
      const actualMinutes = Math.max(1, Math.round((Date.parse(stamp) - start) / 60_000))
      await db.workSessions.update(session.id, { endedAt: stamp, actualMinutes })
    } else {
      if (!Number.isFinite(manualMinutes) || manualMinutes! < 1) {
        throw new Error('请填写有效的实际分钟数')
      }
      await db.workSessions.add({
        id: newId(), taskId, startedAt: stamp, endedAt: stamp,
        actualMinutes: manualMinutes,
      })
    }

    await db.tasks.update(taskId, { status: 'completed', completedAt: stamp })
    await db.taskEvents.add({
      id: newId(), taskId, type: 'completed',
      before: task.status, after: 'completed', createdAt: stamp,
    })
    return true
  })
}
