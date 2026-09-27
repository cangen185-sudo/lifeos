import { db, newId } from './db'
import { canConfirmPlan, plannedMustMinutes } from '../domain/capacity'
import { isValidDateKey, shiftDate, todayKey } from '../domain/clock'
import { snapshotTask } from '../domain/desireLinks'
import { CANCEL_REASONS, isOpenStatus } from '../domain/review'
import type {
  DailyReview,
  InterventionEvent,
  ReasonCode,
  ReviewAction,
  ReviewEntry,
  Task,
  TaskSnapshot,
} from '../domain/types'

async function stopOpenSessions(taskId: string, stamp: string): Promise<void> {
  const sessions = await db.workSessions.where('taskId').equals(taskId).toArray()
  const open = sessions.filter((item) => !item.endedAt)
  if (open.length > 1) throw new Error('任务存在多个未闭合计时，需先修复记录')
  for (const session of open) {
    const started = Date.parse(session.startedAt)
    if (!Number.isFinite(started)) throw new Error('计时记录的开始时间无效')
    await db.workSessions.update(session.id, {
      endedAt: stamp,
      actualMinutes: Math.max(1, Math.round((Date.parse(stamp) - started) / 60_000)),
    })
  }
}

async function makeSnapshot(task: Task) {
  const [goals, desires, commitments] = await Promise.all([
    db.goals.toArray(),
    db.desires.toArray(),
    db.commitments.toArray(),
  ])
  return snapshotTask(task, goals, desires, commitments)
}

async function recordDestinationAmendment(task: Task, reasonCode: ReasonCode, stamp: string): Promise<void> {
  const date = task.plannedDate
  if (!date) throw new Error('后续任务缺少日期')
  if ((await db.dailyReviews.get(date))?.closedAt) throw new Error('目标日期已经日结，请选择其他日期')
  const plan = await db.dailyPlans.get(date)
  if (!plan?.lockedAt || task.priorityBand !== 'must') return
  const snapshot = await makeSnapshot(task)
  await db.dailyPlans.put({
    ...plan,
    amendments: [...(plan.amendments ?? []), {
      id: newId(), createdAt: stamp,
      reason: `结案调整：${reasonCode}`,
      task: snapshot,
    }],
  })
  await db.taskEvents.add({
    id: newId(), taskId: `plan:${date}`, type: 'plan_amended',
    before: { mustCount: (plan.confirmedMusts?.length ?? 0) + (plan.amendments?.length ?? 0) },
    after: { taskId: task.id, reasonCode }, createdAt: stamp,
  })
}

function emptyReview(date: string): DailyReview {
  return { date, entries: [], history: [] }
}

function requireDispositionReason(reasonCode: ReasonCode): void {
  if (!CANCEL_REASONS.some((item) => item.id === reasonCode)) {
    throw new Error('必须选择有效的未完成原因')
  }
}

async function recordFinalEntry(
  date: string,
  entry: ReviewEntry,
  stamp: string,
): Promise<void> {
  const existing = (await db.dailyReviews.get(date)) ?? emptyReview(date)
  const previous = existing.entries.find((item) => item.taskId === entry.taskId)
  const entries = previous
    ? existing.entries.map((item) => item.taskId === entry.taskId ? entry : item)
    : [...existing.entries, entry]
  const hasOpenMust = (await db.tasks.where('plannedDate').equals(date).toArray())
    .some((task) => task.priorityBand === 'must' && isOpenStatus(task.status))
  await db.dailyReviews.put({
    ...existing,
    entries,
    history: [
      ...(existing.history ?? []),
      { id: newId(), taskId: entry.taskId, changedAt: stamp, before: previous, after: entry },
    ],
    closedAt: hasOpenMust ? undefined : existing.closedAt,
  })
}

export async function closeDailyReview(date: string): Promise<boolean> {
  return db.transaction('rw', db.dailyPlans, db.tasks, db.dailyReviews, async () => {
    const plan = await db.dailyPlans.get(date)
    if (!plan?.lockedAt) throw new Error('请先确认这一天的计划')
    const review = (await db.dailyReviews.get(date)) ?? emptyReview(date)
    if (review.closedAt) return false
    const taskById = new Map((await db.tasks.toArray()).map((task) => [task.id, task]))
    for (const snapshot of [...(plan.confirmedMusts ?? []), ...(plan.amendments ?? []).map((item) => item.task)]) {
      const task = taskById.get(snapshot.taskId)
      if (task?.status === 'completed') continue
      if (!review.entries.some((entry) => entry.taskId === snapshot.taskId && entry.reasonCode)) {
        throw new Error(`「${snapshot.title}」还没有说明原因和去向`)
      }
    }
    const open = [...taskById.values()].filter((task) =>
      task.plannedDate === date && task.priorityBand === 'must' && isOpenStatus(task.status))
    if (open.length > 0) throw new Error('还有未处理的 MUST，不能日结')
    await db.dailyReviews.put({ ...review, closedAt: new Date().toISOString() })
    return true
  })
}

export async function settleMust(input: {
  task: Task
  date: string
  action: Exclude<ReviewAction, 'split'>
  reasonCode: ReasonCode
  nextDate?: string
  narrowTitle?: string
  narrowMinutes?: number
  correcting?: boolean
  originalSnapshot?: TaskSnapshot
}): Promise<boolean> {
  requireDispositionReason(input.reasonCode)

  return db.transaction('rw', db.tables, async () => {
    const current = await db.tasks.get(input.task.id)
    if (!current || !isOpenStatus(current.status) || current.plannedDate !== input.date) return false
    if (current.priorityBand !== 'must') throw new Error('只有未完成的 MUST 可结构化结案')
    if (!input.correcting && (await db.dailyReviews.get(input.date))?.closedAt) throw new Error('这一天已日结，请先查看历史')

    const stamp = new Date().toISOString()
    const snapshot = input.originalSnapshot ?? await makeSnapshot(current)
    await stopOpenSessions(current.id, stamp)

    let nextTaskIds: string[] | undefined
    let eventType: 'deferred' | 'narrowed' | 'cancelled' | 'priority_changed'
    let after: Partial<Task>

    if (input.action === 'defer') {
      const nextDate = input.nextDate ?? shiftDate(input.date, 1)
      if (!isValidDateKey(nextDate) || nextDate <= input.date) throw new Error('延期日期必须是晚于原日期的有效日期')
      const nextTask: Task = {
        ...current,
        id: newId(),
        plannedDate: nextDate,
        status: 'planned',
        completedAt: undefined,
        carriedFromId: current.id,
        createdAt: stamp,
      }
      await db.tasks.add(nextTask)
      await recordDestinationAmendment(nextTask, input.reasonCode, stamp)
      nextTaskIds = [nextTask.id]
      after = { status: 'cancelled' }
      eventType = 'deferred'
    } else if (input.action === 'narrow') {
      const title = input.narrowTitle?.trim()
      const minutes = input.narrowMinutes
      if (!title || !Number.isFinite(minutes) || minutes! < 1 || minutes! >= current.plannedMinutes) {
        throw new Error('请填写更小的范围和有效分钟数')
      }
      const targetDate = input.nextDate ?? (input.date < todayKey() ? todayKey() : input.date)
      if (!isValidDateKey(targetDate) || targetDate < input.date) throw new Error('新日期必须有效且不能早于原日期')
      const narrowed: Task = {
        ...current,
        id: newId(),
        title,
        plannedDate: targetDate,
        plannedMinutes: minutes!,
        status: 'planned',
        completedAt: undefined,
        carriedFromId: current.id,
        createdAt: stamp,
      }
      await db.tasks.add(narrowed)
      await recordDestinationAmendment(narrowed, input.reasonCode, stamp)
      nextTaskIds = [narrowed.id]
      after = { status: 'cancelled' }
      eventType = 'narrowed'
    } else if (input.action === 'downgrade') {
      after = { priorityBand: 'should', status: 'planned' }
      eventType = 'priority_changed'
    } else {
      after = { status: 'cancelled' }
      eventType = 'cancelled'
    }

    await db.tasks.update(current.id, after)
    await db.taskEvents.add({
      id: newId(),
      taskId: current.id,
      type: eventType,
      before: { status: current.status, plannedDate: current.plannedDate, priorityBand: current.priorityBand },
      after: { ...after, nextTaskIds, nextDate: input.nextDate },
      reasonCode: input.reasonCode,
      createdAt: stamp,
    })
    await recordFinalEntry(input.date, {
      taskId: current.id,
      title: current.title,
      action: input.action,
      reasonCode: input.reasonCode,
      createdAt: stamp,
      snapshot,
      nextTaskIds,
    }, stamp)
    return true
  })
}

export async function splitMust(input: {
  task: Task
  date: string
  reasonCode: ReasonCode
  parts: { title: string; minutes: number }[]
  targetDate?: string
  correcting?: boolean
  originalSnapshot?: TaskSnapshot
}): Promise<boolean> {
  requireDispositionReason(input.reasonCode)
  const parts = input.parts
    .map((part) => ({ title: part.title.trim(), minutes: Number(part.minutes) }))
    .filter((part) => part.title.length > 0)
  if (parts.length < 2) throw new Error('拆分至少需要两件新任务')
  if (parts.some((part) => !Number.isFinite(part.minutes) || part.minutes < 1)) {
    throw new Error('拆分分钟数必须是正数')
  }

  return db.transaction('rw', db.tables, async () => {
    const current = await db.tasks.get(input.task.id)
    if (!current || !isOpenStatus(current.status) || current.plannedDate !== input.date) return false
    if (current.priorityBand !== 'must') throw new Error('只有未完成的 MUST 可结构化结案')
    if (!input.correcting && (await db.dailyReviews.get(input.date))?.closedAt) throw new Error('这一天已日结，请先查看历史')
    const stamp = new Date().toISOString()
    const snapshot = input.originalSnapshot ?? await makeSnapshot(current)
    await stopOpenSessions(current.id, stamp)
    await db.tasks.update(current.id, { status: 'cancelled' })

    const targetDate = input.targetDate ?? shiftDate(input.date, 1)
    if (!isValidDateKey(targetDate) || targetDate <= input.date) throw new Error('拆分后的日期必须是晚于原日期的有效日期')
    const children: Task[] = parts.map((part) => ({
      id: newId(),
      title: part.title,
      plannedDate: targetDate,
      priorityBand: current.priorityBand,
      plannedMinutes: part.minutes,
      status: 'planned',
      primaryGoalId: current.primaryGoalId,
      primaryCommitmentId: current.primaryCommitmentId,
      desireIds: current.desireIds,
      splitFromId: current.id,
      createdAt: stamp,
    }))
    await db.tasks.bulkAdd(children)
    for (const child of children) await recordDestinationAmendment(child, input.reasonCode, stamp)
    await db.taskEvents.add({
      id: newId(),
      taskId: current.id,
      type: 'split',
      before: { status: current.status, plannedDate: current.plannedDate },
      after: { childTaskIds: children.map((item) => item.id), targetDate },
      reasonCode: input.reasonCode,
      createdAt: stamp,
    })
    await recordFinalEntry(input.date, {
      taskId: current.id,
      title: current.title,
      action: 'split',
      reasonCode: input.reasonCode,
      createdAt: stamp,
      snapshot,
      nextTaskIds: children.map((item) => item.id),
    }, stamp)
    return true
  })
}

export async function correctReviewReason(input: {
  date: string
  taskId: string
  reasonCode: ReasonCode
}): Promise<void> {
  requireDispositionReason(input.reasonCode)
  await db.transaction('rw', db.dailyReviews, async () => {
    const review = await db.dailyReviews.get(input.date)
    const previous = review?.entries.find((item) => item.taskId === input.taskId)
    if (!review || !previous) throw new Error('复盘记录不存在')
    if (previous.reasonCode === input.reasonCode) return
    const stamp = new Date().toISOString()
    const corrected: ReviewEntry = { ...previous, reasonCode: input.reasonCode, updatedAt: stamp }
    await db.dailyReviews.put({
      ...review,
      entries: review.entries.map((item) => item.taskId === input.taskId ? corrected : item),
      history: [
        ...(review.history ?? []),
        { id: newId(), taskId: input.taskId, changedAt: stamp, before: previous, after: corrected },
      ],
    })
  })
}

/** Change the final destination while retaining the earlier result in the audit history. */
export async function correctReviewDisposition(input: {
  date: string
  taskId: string
  action: ReviewAction
  reasonCode: ReasonCode
  nextDate?: string
  narrowTitle?: string
  narrowMinutes?: number
  parts?: { title: string; minutes: number }[]
}): Promise<void> {
  requireDispositionReason(input.reasonCode)
  await db.transaction('rw', db.tables, async () => {
    const review = await db.dailyReviews.get(input.date)
    const previous = review?.entries.find((entry) => entry.taskId === input.taskId)
    const task = await db.tasks.get(input.taskId)
    if (!previous || !task || task.plannedDate !== input.date) throw new Error('原结案记录不存在')

    const children: Task[] = []
    for (const childId of previous.nextTaskIds ?? []) {
      const child = await db.tasks.get(childId)
      if (!child || child.status !== 'planned') throw new Error('后续任务已有执行或变更，不能自动更正去向')
      if ((await db.workSessions.where('taskId').equals(childId).count()) > 0 ||
          (await db.taskEvents.where('taskId').equals(childId).count()) > 0 ||
          (await db.tasks.where('carriedFromId').equals(childId).count()) > 0 ||
          (await db.tasks.where('splitFromId').equals(childId).count()) > 0) {
        throw new Error('后续任务已有记录，不能自动更正去向')
      }
      children.push(child)
    }
    const plans = await db.dailyPlans.toArray()
    for (const child of children) {
      if (plans.some((plan) => [
        ...(plan.confirmedMusts ?? []), ...(plan.amendments ?? []).map((item) => item.task),
      ].some((snapshot) => snapshot.taskId === child.id))) {
        throw new Error('后续任务已进入确认计划，不能自动更正去向')
      }
    }

    const stamp = new Date().toISOString()
    for (const child of children) {
      await db.tasks.update(child.id, { status: 'cancelled' })
      await db.taskEvents.add({
        id: newId(), taskId: child.id, type: 'review_corrected',
        before: { status: child.status, plannedDate: child.plannedDate },
        after: { status: 'cancelled', replacedByCorrectionOf: task.id },
        reasonCode: input.reasonCode, createdAt: stamp,
      })
    }
    await db.tasks.update(task.id, {
      status: 'planned', priorityBand: 'must', completedAt: undefined,
    })
    await db.taskEvents.add({
      id: newId(), taskId: task.id, type: 'review_corrected',
      before: { action: previous.action, reasonCode: previous.reasonCode, nextTaskIds: previous.nextTaskIds },
      after: { action: input.action, reasonCode: input.reasonCode },
      reasonCode: input.reasonCode, createdAt: stamp,
    })

    const restored = (await db.tasks.get(task.id))!
    if (input.action === 'split') {
      if (!input.parts) throw new Error('拆分更正需要填写新任务')
      await splitMust({
        task: restored, date: input.date,
        reasonCode: input.reasonCode, parts: input.parts,
        targetDate: input.date < todayKey() ? todayKey() : shiftDate(input.date, 1),
        correcting: true, originalSnapshot: previous.snapshot,
      })
    } else {
      await settleMust({
        task: restored, date: input.date, action: input.action,
        reasonCode: input.reasonCode, nextDate: input.nextDate,
        narrowTitle: input.narrowTitle, narrowMinutes: input.narrowMinutes,
        correcting: true, originalSnapshot: previous.snapshot,
      })
    }
  })
}

export async function confirmDailyPlan(input: {
  date: string
  capacityMinutes: number
  overloadReason?: string
}): Promise<boolean> {
  if (!isValidDateKey(input.date)) throw new Error('计划日期无效')
  if (!Number.isFinite(input.capacityMinutes) || input.capacityMinutes < 0) {
    throw new Error('今日容量必须是有效的非负分钟数')
  }
  return db.transaction('rw', db.tables, async () => {
    const existing = await db.dailyPlans.get(input.date)
    if (existing?.lockedAt) return false
    const tasks = await db.tasks.where('plannedDate').equals(input.date).toArray()
    const planned = plannedMustMinutes(tasks, input.date)
    const check = canConfirmPlan(planned, input.capacityMinutes, input.overloadReason)
    if (!check.ok) throw new Error('MUST 超过今日容量，确认前必须写下覆盖原因')
    const [goals, desires, commitments] = await Promise.all([
      db.goals.toArray(),
      db.desires.toArray(),
      db.commitments.toArray(),
    ])
    const stamp = new Date().toISOString()
    const confirmedMusts = tasks
      .filter((task) => task.priorityBand === 'must' && task.status !== 'cancelled')
      .map((task) => snapshotTask(task, goals, desires, commitments))
    await db.dailyPlans.put({
      ...existing,
      date: input.date,
      capacityMinutes: input.capacityMinutes,
      confirmedAt: stamp,
      lockedAt: stamp,
      confirmedMusts,
      overloadOverrideReason: check.needsReason ? input.overloadReason?.trim() : undefined,
    })
    if (check.needsReason) {
      await db.taskEvents.add({
        id: newId(),
        taskId: `plan:${input.date}`,
        type: 'plan_overridden',
        before: { planned, capacity: input.capacityMinutes },
        after: { reason: input.overloadReason?.trim() },
        reasonCode: 'plan_overridden',
        createdAt: stamp,
      })
    }
    return true
  })
}

export async function updateDailyCapacity(date: string, capacityMinutes: number): Promise<void> {
  if (!Number.isFinite(capacityMinutes) || capacityMinutes < 0) {
    throw new Error('今日容量必须是有效的非负分钟数')
  }
  await db.transaction('rw', db.dailyPlans, async () => {
    const plan = await db.dailyPlans.get(date)
    if (plan?.lockedAt) throw new Error('今日计划已确认，容量不能无痕修改')
    await db.dailyPlans.put({ ...plan, date, capacityMinutes })
  })
}

export async function recordIntervention(input: {
  date: string
  kind: InterventionEvent['kind']
  taskId?: string
}): Promise<string> {
  return db.transaction('rw', db.interventionEvents, async () => {
    const existing = await db.interventionEvents
      .where('date')
      .equals(input.date)
      .and((item) => item.kind === input.kind && (item.taskId ?? '') === (input.taskId ?? ''))
      .first()
    if (existing) return existing.id
    const id = newId()
    await db.interventionEvents.add({
      id,
      date: input.date,
      kind: input.kind,
      taskId: input.taskId,
      createdAt: new Date().toISOString(),
    })
    return id
  })
}

export async function dismissIntervention(id: string): Promise<void> {
  await db.interventionEvents.update(id, { dismissedAt: new Date().toISOString() })
}
