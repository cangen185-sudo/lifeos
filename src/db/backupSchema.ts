import type {
  BackupPayload,
  Commitment,
  DailyPlan,
  Desire,
  Goal,
  Task,
  TaskEvent,
  WorkSession,
} from '../domain/types'

type RecordValue = Record<string, unknown>

function fail(path: string): never {
  throw new Error(`备份文件格式不正确：${path}`)
}

function object(value: unknown, path: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path)
  return value as RecordValue
}

function string(value: unknown, path: string, nonempty = false): void {
  if (typeof value !== 'string' || (nonempty && !value.trim())) fail(path)
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined) string(value, path)
}

function timestamp(value: unknown, path: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) fail(path)
}

function optionalTimestamp(value: unknown, path: string): void {
  if (value !== undefined) timestamp(value, path)
}

function date(value: unknown, path: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail(path)
}

function optionalDate(value: unknown, path: string): void {
  if (value !== undefined) date(value, path)
}

function minutes(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(path)
}

function choice(value: unknown, allowed: readonly string[], path: string): void {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(path)
}

const priorities = ['must', 'should', 'optional']
const statuses = ['backlog', 'planned', 'in_progress', 'completed', 'cancelled']
const goalStatuses = ['active', 'achieved', 'dropped']
const commitmentStates = ['draft', 'active', 'fulfilled', 'breached', 'waived', 'expired']
const eventTypes = ['started', 'paused', 'resumed', 'completed', 'deferred', 'narrowed', 'split', 'priority_changed', 'cancelled', 'plan_overridden']
const reasons = ['uncontrollable_event', 'plan_error', 'time_estimate_error', 'priority_change', 'strategy_change', 'willful_breach', 'split', 'plan_overridden']

function rows<T>(value: unknown, path: string, key: 'id' | 'date', validate: (row: RecordValue, path: string) => void): T[] {
  if (!Array.isArray(value)) fail(path)
  const keys = new Set<string>()
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`
    const row = object(entry, at)
    string(row[key], `${at}.${key}`, true)
    if (keys.has(row[key] as string)) fail(`${at}.${key} 重复`)
    keys.add(row[key] as string)
    validate(row, at)
  })
  return value as T[]
}

export function parseBackup(text: string): BackupPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('不是有效的 JSON')
  }
  const data = object(parsed, '根对象')
  if (data.version !== 1 && data.version !== 2) fail('version')
  timestamp(data.exportedAt, 'exportedAt')

  const dailyPlans = rows<DailyPlan>(data.dailyPlans, 'dailyPlans', 'date', (row, at) => {
    date(row.date, `${at}.date`)
    minutes(row.capacityMinutes, `${at}.capacityMinutes`)
    optionalTimestamp(row.confirmedAt, `${at}.confirmedAt`)
    optionalTimestamp(row.lockedAt, `${at}.lockedAt`)
    optionalString(row.overloadOverrideReason, `${at}.overloadOverrideReason`)
  })
  const tasks = rows<Task>(data.tasks, 'tasks', 'id', (row, at) => {
    string(row.title, `${at}.title`, true)
    optionalDate(row.plannedDate, `${at}.plannedDate`)
    if (row.plannedStart !== undefined) {
      if (typeof row.plannedStart !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.plannedStart)) fail(`${at}.plannedStart`)
    }
    optionalTimestamp(row.deadline, `${at}.deadline`)
    choice(row.priorityBand, priorities, `${at}.priorityBand`)
    minutes(row.plannedMinutes, `${at}.plannedMinutes`)
    choice(row.status, statuses, `${at}.status`)
    optionalString(row.primaryGoalId, `${at}.primaryGoalId`)
    optionalString(row.primaryCommitmentId, `${at}.primaryCommitmentId`)
    if (row.desireIds !== undefined) {
      if (!Array.isArray(row.desireIds) || row.desireIds.some((id) => typeof id !== 'string' || !id.trim()) ||
        new Set(row.desireIds).size !== row.desireIds.length) fail(`${at}.desireIds`)
    }
    timestamp(row.createdAt, `${at}.createdAt`)
    optionalTimestamp(row.completedAt, `${at}.completedAt`)
  })
  const workSessions = rows<WorkSession>(data.workSessions, 'workSessions', 'id', (row, at) => {
    string(row.taskId, `${at}.taskId`, true)
    timestamp(row.startedAt, `${at}.startedAt`)
    optionalTimestamp(row.endedAt, `${at}.endedAt`)
    if (row.actualMinutes !== undefined) minutes(row.actualMinutes, `${at}.actualMinutes`)
  })
  const taskEvents = rows<TaskEvent>(data.taskEvents, 'taskEvents', 'id', (row, at) => {
    string(row.taskId, `${at}.taskId`, true)
    choice(row.type, eventTypes, `${at}.type`)
    if (row.reasonCode !== undefined) choice(row.reasonCode, reasons, `${at}.reasonCode`)
    timestamp(row.createdAt, `${at}.createdAt`)
  })
  // Version 1 predates direction tables. Version 2 always includes all seven tables.
  const direction = (key: 'desires' | 'goals' | 'commitments'): unknown =>
    data.version === 1 && data[key] === undefined ? [] : data[key]
  const desires = rows<Desire>(direction('desires'), 'desires', 'id', (row, at) => {
    string(row.title, `${at}.title`, true)
    optionalString(row.description, `${at}.description`)
    if (typeof row.importance !== 'number' || !Number.isInteger(row.importance) || row.importance < 1 || row.importance > 5) fail(`${at}.importance`)
    if (typeof row.active !== 'boolean') fail(`${at}.active`)
    timestamp(row.createdAt, `${at}.createdAt`)
    timestamp(row.updatedAt, `${at}.updatedAt`)
  })
  const goals = rows<Goal>(direction('goals'), 'goals', 'id', (row, at) => {
    string(row.title, `${at}.title`, true)
    optionalString(row.description, `${at}.description`)
    optionalDate(row.targetDate, `${at}.targetDate`)
    choice(row.status, goalStatuses, `${at}.status`)
    optionalString(row.primaryDesireId, `${at}.primaryDesireId`)
    timestamp(row.createdAt, `${at}.createdAt`)
  })
  const commitments = rows<Commitment>(direction('commitments'), 'commitments', 'id', (row, at) => {
    string(row.title, `${at}.title`, true)
    optionalString(row.rationale, `${at}.rationale`)
    timestamp(row.startAt, `${at}.startAt`)
    optionalTimestamp(row.endAt, `${at}.endAt`)
    optionalString(row.targetNote, `${at}.targetNote`)
    choice(row.state, commitmentStates, `${at}.state`)
    optionalString(row.primaryGoalId, `${at}.primaryGoalId`)
    timestamp(row.createdAt, `${at}.createdAt`)
  })

  const taskIds = new Set(tasks.map((row) => row.id))
  for (const [table, entries] of [['workSessions', workSessions], ['taskEvents', taskEvents]] as const) {
    entries.forEach((row, index) => {
      if (!taskIds.has(row.taskId)) fail(`${table}[${index}].taskId 不存在`)
    })
  }
  const desireIds = new Set(desires.map((row) => row.id))
  goals.forEach((row, index) => {
    if (row.primaryDesireId && !desireIds.has(row.primaryDesireId)) fail(`goals[${index}].primaryDesireId 不存在`)
  })
  const goalIds = new Set(goals.map((row) => row.id))
  commitments.forEach((row, index) => {
    if (row.primaryGoalId && !goalIds.has(row.primaryGoalId)) fail(`commitments[${index}].primaryGoalId 不存在`)
  })
  const commitmentIds = new Set(commitments.map((row) => row.id))
  tasks.forEach((row, index) => {
    if (row.primaryGoalId && !goalIds.has(row.primaryGoalId)) fail(`tasks[${index}].primaryGoalId 不存在`)
    if (row.primaryCommitmentId && !commitmentIds.has(row.primaryCommitmentId)) fail(`tasks[${index}].primaryCommitmentId 不存在`)
    for (const desireId of row.desireIds ?? []) {
      if (!desireIds.has(desireId)) fail(`tasks[${index}].desireIds 不存在`)
    }
  })

  return { version: data.version, exportedAt: data.exportedAt as string,
    dailyPlans, tasks, workSessions, taskEvents, desires, goals, commitments }
}
