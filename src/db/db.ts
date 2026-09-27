import Dexie, { type Table } from 'dexie'
import type {
  Commitment,
  DailyPlan,
  DailyReview,
  Desire,
  Goal,
  InterventionEvent,
  Task,
  TaskEvent,
  WorkSession,
} from '../domain/types'

export class LifeOSDatabase extends Dexie {
  dailyPlans!: Table<DailyPlan, string>
  tasks!: Table<Task, string>
  workSessions!: Table<WorkSession, string>
  taskEvents!: Table<TaskEvent, string>
  desires!: Table<Desire, string>
  goals!: Table<Goal, string>
  commitments!: Table<Commitment, string>
  dailyReviews!: Table<DailyReview, string>
  interventionEvents!: Table<InterventionEvent, string>

  constructor() {
    super('lifeos')
    this.version(1).stores({
      dailyPlans: 'date',
      tasks: 'id, plannedDate, status, priorityBand',
      workSessions: 'id, taskId, startedAt',
      taskEvents: 'id, taskId, createdAt, type',
    })
    this.version(2).stores({
      dailyPlans: 'date',
      tasks: 'id, plannedDate, status, priorityBand, primaryGoalId, primaryCommitmentId',
      workSessions: 'id, taskId, startedAt',
      taskEvents: 'id, taskId, createdAt, type',
      desires: 'id, active, importance',
      goals: 'id, status, primaryDesireId',
      commitments: 'id, state, primaryGoalId, endAt',
    })
    this.version(3).stores({
      dailyPlans: 'date',
      tasks: 'id, plannedDate, status, priorityBand, primaryGoalId, primaryCommitmentId',
      workSessions: 'id, taskId, startedAt',
      taskEvents: 'id, taskId, createdAt, type',
      desires: 'id, active, importance',
      goals: 'id, status, primaryDesireId',
      commitments: 'id, state, primaryGoalId, endAt',
      dailyReviews: 'date',
    })
    this.version(4).stores({
      dailyPlans: 'date',
      tasks: 'id, plannedDate, status, priorityBand, primaryGoalId, primaryCommitmentId',
      workSessions: 'id, taskId, startedAt',
      taskEvents: 'id, taskId, createdAt, type',
      desires: 'id, active, importance',
      goals: 'id, status, primaryDesireId',
      commitments: 'id, state, primaryGoalId, endAt',
      dailyReviews: 'date',
      interventionEvents: 'id, date, taskId, kind',
    })
    this.version(5).stores({
      dailyPlans: 'date',
      tasks: 'id, plannedDate, status, priorityBand, primaryGoalId, primaryCommitmentId, carriedFromId, splitFromId',
      workSessions: 'id, taskId, startedAt',
      taskEvents: 'id, taskId, createdAt, type',
      desires: 'id, active, importance',
      goals: 'id, status, primaryDesireId',
      commitments: 'id, state, primaryGoalId, endAt',
      dailyReviews: 'date',
      interventionEvents: 'id, date, taskId, kind',
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
  return db.transaction('rw', db.dailyPlans, async () => {
    const existing = await db.dailyPlans.get(date)
    if (existing) return existing
    const plan: DailyPlan = { date, capacityMinutes }
    await db.dailyPlans.add(plan)
    return plan
  })
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
