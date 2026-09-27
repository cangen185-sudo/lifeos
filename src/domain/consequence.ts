import { combineDateAndTime, minutesUntilEndOfDay, shiftDate, todayKey } from './clock'
import { whyPathFor } from './alignment'
import { desiresForTask } from './desireLinks'
import { isOpenStatus, openMusts } from './review'
import type { Commitment, Desire, Goal, Task, WorkSession } from './types'

export type Consequence = {
  taskId: string
  delayMinutes: number
  remainingMinutesToday: number
  estimatedMinutesNeeded: number
  feasibleToday: boolean
  commitmentAtRisk: boolean
  tomorrowMustLoad: number
  whyPath: string[]
  desireTitles: string[]
}

export function delayMinutes(task: Task, now: Date): number {
  if (task.status === 'completed' || task.status === 'cancelled') return 0
  if (!task.plannedDate || !task.plannedStart) return 0
  const start = combineDateAndTime(task.plannedDate, task.plannedStart)
  return Math.max(0, Math.round((now.getTime() - start.getTime()) / 60_000))
}

export function actualMinutesOf(
  taskId: string,
  sessions: WorkSession[],
  now = new Date(),
): number {
  let total = 0
  for (const session of sessions) {
    if (session.taskId !== taskId) continue
    if (session.actualMinutes != null) {
      total += session.actualMinutes
      continue
    }
    if (!session.endedAt) {
      total += Math.max(1, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 60_000))
    }
  }
  return total
}

export function remainingMinutesToday(
  capacityMinutes: number,
  actualSpent: number,
  now = new Date(),
): number {
  const capacityLeft = Math.max(0, capacityMinutes - actualSpent)
  return Math.min(capacityLeft, minutesUntilEndOfDay(now))
}

export function tomorrowMustLoad(tasks: Task[], today: string, extraMinutes = 0): number {
  const tomorrow = shiftDate(today, 1)
  const existing = openMusts(tasks, tomorrow).reduce((sum, task) => sum + task.plannedMinutes, 0)
  return existing + extraMinutes
}

export function impactIfNotDone(input: {
  task: Task
  now?: Date
  capacityMinutes: number
  sessions: WorkSession[]
  tasks: Task[]
  commitments: Commitment[]
  goals: Goal[]
  desires: Desire[]
}): Consequence {
  const now = input.now ?? new Date()
  const today = input.task.plannedDate ?? todayKey(now)
  const spent = input.sessions
    .filter((session) => {
      const date = todayKey(new Date(session.startedAt))
      return date === today
    })
    .reduce((sum, session) => {
      if (session.actualMinutes != null) return sum + session.actualMinutes
      if (!session.endedAt) {
        return (
          sum +
          Math.max(1, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 60_000))
        )
      }
      return sum
    }, 0)

  const already = actualMinutesOf(input.task.id, input.sessions, now)
  const estimatedMinutesNeeded = Math.max(1, input.task.plannedMinutes - already)
  const remaining = remainingMinutesToday(input.capacityMinutes, spent, now)
  const delay = delayMinutes(input.task, now)
  const commitment = input.commitments.find((item) => item.id === input.task.primaryCommitmentId)
  const goal = input.goals.find((item) => item.id === input.task.primaryGoalId)
  const desire = input.desires.find((item) => item.id === goal?.primaryDesireId)
  const linkedDesires = desiresForTask(input.task, input.goals, input.desires)
  const feasibleToday = estimatedMinutesNeeded <= remaining
  const dueSoon =
    Boolean(commitment?.endAt) && todayKey(new Date(commitment!.endAt!)) <= today
  const commitmentAtRisk =
    commitment?.state === 'active' &&
    Boolean(commitment.endAt) &&
    input.task.priorityBand === 'must' &&
    isOpenStatus(input.task.status) &&
    dueSoon

  return {
    taskId: input.task.id,
    delayMinutes: delay,
    remainingMinutesToday: remaining,
    estimatedMinutesNeeded,
    feasibleToday,
    commitmentAtRisk,
    tomorrowMustLoad: tomorrowMustLoad(input.tasks, today, input.task.plannedMinutes),
    whyPath: whyPathFor(goal, desire, commitment),
    desireTitles: linkedDesires.map((item) => item.title),
  }
}
