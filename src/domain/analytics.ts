import { datesBetween, lastNDates, parseDateKey, shiftDate, todayKey } from './clock'
import { desiresForTask } from './desireLinks'
import { classifyReason } from './review'
import type {
  DailyPlan,
  DailyReview,
  Desire,
  Goal,
  ReasonCode,
  Task,
  WorkSession,
} from './types'

export type DayMustRate = {
  date: string
  total: number
  done: number
  rate: number | null
}

export function mustRateOnDate(
  plans: DailyPlan[],
  tasks: Task[],
  date: string,
): DayMustRate {
  const plan = plans.find((item) => item.date === date && item.lockedAt)
  const snapshots = [...(plan?.confirmedMusts ?? []), ...(plan?.amendments ?? []).map((item) => item.task)]
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const done = snapshots.filter((snapshot) => byId.get(snapshot.taskId)?.status === 'completed').length
  return {
    date,
    total: snapshots.length,
    done,
    rate: snapshots.length === 0 ? null : done / snapshots.length,
  }
}

export function mustRateByDay(
  plans: DailyPlan[],
  tasks: Task[],
  endDate: string,
  days = 7,
): DayMustRate[] {
  return lastNDates(endDate, days).map((date) => mustRateOnDate(plans, tasks, date))
}

export function mustRateRange(days: DayMustRate[]): {
  done: number
  total: number
  rate: number | null
} {
  const done = days.reduce((sum, item) => sum + item.done, 0)
  const total = days.reduce((sum, item) => sum + item.total, 0)
  return { done, total, rate: total === 0 ? null : done / total }
}

export function closedSessionMinutes(
  sessions: WorkSession[],
  from: string,
  to: string,
): number {
  const dates = new Set(datesBetween(from, to))
  const seen = new Set<string>()
  let total = 0
  for (const session of sessions) {
    if (seen.has(session.id) || !session.endedAt) continue
    seen.add(session.id)
    for (const [date, minutes] of sessionMinutesByLocalDate(session)) {
      if (dates.has(date)) total += minutes
    }
  }
  return total
}

/** Allocate one closed session across local calendar dates without changing its total. */
export function sessionMinutesByLocalDate(session: WorkSession): Map<string, number> {
  const result = new Map<string, number>()
  if (!session.endedAt) return result
  const started = Date.parse(session.startedAt)
  const ended = Date.parse(session.endedAt)
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return result
  const explicit = session.actualMinutes
  const total = explicit != null && Number.isFinite(explicit) && explicit >= 0
    ? explicit : Math.max(1, Math.round((ended - started) / 60_000))
  const firstDate = todayKey(new Date(started))
  if (ended === started) {
    result.set(firstDate, total)
    return result
  }
  const spans: { date: string; millis: number }[] = []
  let cursor = started
  while (cursor < ended) {
    const date = todayKey(new Date(cursor))
    const nextMidnight = parseDateKey(shiftDate(date, 1)).getTime()
    const until = Math.min(ended, nextMidnight)
    spans.push({ date, millis: until - cursor })
    cursor = until
  }
  const totalUnits = Math.round(total * 1000)
  const shares = spans.map((span) => span.millis / (ended - started) * totalUnits)
  const floors = shares.map(Math.floor)
  let remainder = totalUnits - floors.reduce((sum, value) => sum + value, 0)
  const order = shares.map((share, index) => ({ index, fraction: share - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction)
  for (const item of order) {
    if (remainder <= 0) break
    floors[item.index] += 1
    remainder -= 1
  }
  spans.forEach((span, index) => result.set(span.date, (result.get(span.date) ?? 0) + floors[index] / 1000))
  return result
}

export function closedMinutesForTask(taskId: string, sessions: WorkSession[]): number {
  const seen = new Set<string>()
  let total = 0
  for (const session of sessions) {
    if (session.taskId !== taskId || !session.endedAt || seen.has(session.id)) continue
    seen.add(session.id)
    if (session.actualMinutes != null && Number.isFinite(session.actualMinutes) && session.actualMinutes >= 0) {
      total += session.actualMinutes
      continue
    }
    const started = Date.parse(session.startedAt)
    const ended = Date.parse(session.endedAt)
    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
      total += Math.max(1, Math.round((ended - started) / 60_000))
    }
  }
  return total
}

export function plannedVsActual(input: {
  plans: DailyPlan[]
  sessions: WorkSession[]
  from: string
  to: string
}): { planned: number; actual: number; bias: number } {
  const dates = new Set(datesBetween(input.from, input.to))
  const planned = input.plans
    .filter((plan) => dates.has(plan.date) && Boolean(plan.lockedAt))
    .flatMap((plan) => [...(plan.confirmedMusts ?? []), ...(plan.amendments ?? []).map((item) => item.task)])
    .reduce((sum, task) => sum + task.plannedMinutes, 0)
  const actual = closedSessionMinutes(input.sessions, input.from, input.to)
  return { planned, actual, bias: actual - planned }
}

export type ReasonBucket = 'execution' | 'planning' | 'external' | 'move'

export function reasonDistribution(
  reviews: DailyReview[],
  from?: string,
  to?: string,
): Record<ReasonBucket, number> {
  const counts: Record<ReasonBucket, number> = {
    execution: 0,
    planning: 0,
    external: 0,
    move: 0,
  }
  for (const review of reviews) {
    if (from && review.date < from) continue
    if (to && review.date > to) continue
    for (const entry of review.entries) {
      if (entry.reasonCode) counts[classifyReason(entry.reasonCode)] += 1
    }
  }
  return counts
}

export function finalReasonCounts(
  reviews: DailyReview[],
  from?: string,
  to?: string,
): Map<ReasonCode, number> {
  const counts = new Map<ReasonCode, number>()
  for (const review of reviews) {
    if (from && review.date < from) continue
    if (to && review.date > to) continue
    for (const entry of review.entries) {
      if (!entry.reasonCode) continue
      counts.set(entry.reasonCode, (counts.get(entry.reasonCode) ?? 0) + 1)
    }
  }
  return counts
}

export type DesireAlignmentRow = {
  id: string
  title: string
  minutes: number
  actionCount: number
  unfinishedCount: number
  kind: 'desire' | 'unaligned'
}

export function desireAlignment(input: {
  tasks: Task[]
  plans?: DailyPlan[]
  sessions: WorkSession[]
  reviews: DailyReview[]
  goals: Goal[]
  desires: Desire[]
  from: string
  to: string
}): DesireAlignmentRow[] {
  const dates = new Set(datesBetween(input.from, input.to))
  const byTask = new Map(input.tasks.map((task) => [task.id, task]))
  const snapshots = new Map(
    (input.plans ?? []).flatMap((plan) => [
      ...(plan.confirmedMusts ?? []), ...(plan.amendments ?? []).map((item) => item.task),
    ]).map((snapshot) => [snapshot.taskId, snapshot]),
  )
  const minutesByTask = new Map<string, number>()
  const seenSessions = new Set<string>()
  for (const session of input.sessions) {
    if (seenSessions.has(session.id) || !session.endedAt) continue
    seenSessions.add(session.id)
    const minutes = [...sessionMinutesByLocalDate(session)]
      .filter(([date]) => dates.has(date))
      .reduce((sum, [, value]) => sum + value, 0)
    minutesByTask.set(session.taskId, (minutesByTask.get(session.taskId) ?? 0) + minutes)
  }

  const actionIdsByDesire = new Map<string, Set<string>>()
  const unfinishedIdsByDesire = new Map<string, Set<string>>()
  const minutesByDesire = new Map<string, number>()
  const unalignedActions = new Set<string>()
  const unalignedUnfinished = new Set<string>()
  let unalignedMinutes = 0

  for (const task of input.tasks) {
    if (!task.plannedDate || !dates.has(task.plannedDate)) continue
    const snapshotIds = snapshots.get(task.id)?.desireIds
    const linked = snapshotIds
      ? input.desires.filter((desire) => snapshotIds.includes(desire.id))
      : desiresForTask(task, input.goals, input.desires, true)
    const taskMinutes = minutesByTask.get(task.id) ?? 0
    if (linked.length === 0) {
      unalignedActions.add(task.id)
      unalignedMinutes += taskMinutes
      continue
    }
    for (const desire of linked) {
      const actions = actionIdsByDesire.get(desire.id) ?? new Set<string>()
      actions.add(task.id)
      actionIdsByDesire.set(desire.id, actions)
      minutesByDesire.set(desire.id, (minutesByDesire.get(desire.id) ?? 0) + taskMinutes)
    }
  }

  for (const review of input.reviews) {
    if (!dates.has(review.date)) continue
    for (const entry of review.entries) {
      const snapshotIds = entry.snapshot?.desireIds
      const task = byTask.get(entry.taskId)
      const ids = snapshotIds ?? snapshots.get(entry.taskId)?.desireIds ??
        (task ? desiresForTask(task, input.goals, input.desires, true).map((item) => item.id) : [])
      if (ids.length === 0) unalignedUnfinished.add(entry.taskId)
      for (const id of ids) {
        const unfinished = unfinishedIdsByDesire.get(id) ?? new Set<string>()
        unfinished.add(entry.taskId)
        unfinishedIdsByDesire.set(id, unfinished)
      }
    }
  }

  const rows: DesireAlignmentRow[] = input.desires
    .map((desire) => ({
      id: desire.id,
      title: desire.title,
      minutes: minutesByDesire.get(desire.id) ?? 0,
      actionCount: actionIdsByDesire.get(desire.id)?.size ?? 0,
      unfinishedCount: unfinishedIdsByDesire.get(desire.id)?.size ?? 0,
      kind: 'desire' as const,
    }))
    .filter((row) => row.minutes > 0 || row.actionCount > 0 || row.unfinishedCount > 0)
    .sort((left, right) => right.minutes - left.minutes)

  if (unalignedActions.size > 0 || unalignedMinutes > 0) {
    rows.push({
      id: 'unaligned',
      title: '未关联欲望',
      minutes: unalignedMinutes,
      actionCount: unalignedActions.size,
      unfinishedCount: unalignedUnfinished.size,
      kind: 'unaligned',
    })
  }
  return rows
}

export function weekRange(today: string): { from: string; to: string } {
  return { from: lastNDates(today, 7)[0], to: today }
}

export function percent(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`
}
