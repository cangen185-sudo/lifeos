import Dexie, { type Table } from 'dexie'
import type { DailyPlan, Task, TaskEvent, WorkSession } from '../domain/types'

export class LifeOSDatabase extends Dexie {
  dailyPlans!: Table<DailyPlan, string>
  tasks!: Table<Task, string>
  workSessions!: Table<WorkSession, string>
  taskEvents!: Table<TaskEvent, string>

  constructor() {
    super('lifeos')
    this.version(1).stores({
      dailyPlans: 'date',
      tasks: 'id, plannedDate, status, priorityBand',
      workSessions: 'id, taskId, startedAt',
      taskEvents: 'id, taskId, createdAt, type',
    })
  }
}

export const db = new LifeOSDatabase()

export function newId(): string {
  return crypto.randomUUID()
}

export async function ensureDailyPlan(
  date: string,
  capacityMinutes = 240,
): Promise<DailyPlan> {
  const existing = await db.dailyPlans.get(date)
  if (existing) return existing
  const plan: DailyPlan = { date, capacityMinutes }
  await db.dailyPlans.put(plan)
  return plan
}

export async function addTaskEvent(
  taskId: string,
  type: TaskEvent['type'],
  extra: Partial<Pick<TaskEvent, 'before' | 'after' | 'reasonCode'>> = {},
): Promise<void> {
  await db.taskEvents.add({
    id: newId(),
    taskId,
    type,
    createdAt: new Date().toISOString(),
    ...extra,
  })
}
