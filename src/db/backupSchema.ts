import type {
  BackupPayload,
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
const eventTypes = ['started', 'paused', 'resumed', 'completed', 'deferred', 'narrowed', 'split', 'priority_changed', 'cancelled', 'plan_overridden', 'edited', 'desire_links_changed', 'plan_amended', 'review_corrected']
const reasons = ['uncontrollable_event', 'plan_error', 'time_estimate_error', 'priority_change', 'strategy_change', 'willful_breach', 'willful_abandon', 'procrastination', 'split', 'plan_overridden']

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

function stringArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string') ||
    new Set(value).size !== value.length) fail(path)
}

function taskSnapshot(value: unknown, path: string): void {
  const row = object(value, path)
  string(row.taskId, `${path}.taskId`, true)
  string(row.title, `${path}.title`, true)
  optionalDate(row.plannedDate, `${path}.plannedDate`)
  choice(row.priorityBand, priorities, `${path}.priorityBand`)
  minutes(row.plannedMinutes, `${path}.plannedMinutes`)
  optionalString(row.primaryGoalId, `${path}.primaryGoalId`)
  optionalString(row.primaryCommitmentId, `${path}.primaryCommitmentId`)
  stringArray(row.desireIds, `${path}.desireIds`)
  stringArray(row.desireTitles, `${path}.desireTitles`)
  optionalString(row.goalTitle, `${path}.goalTitle`)
  optionalString(row.commitmentTitle, `${path}.commitmentTitle`)
}

export function parseBackup(text: string): BackupPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('不是有效的 JSON')
  }
  const data = object(parsed, '根对象')
  if (![1, 2, 3, 4, 5].includes(data.version as number)) fail('version')
  timestamp(data.exportedAt, 'exportedAt')

  const dailyPlans = rows<DailyPlan>(data.dailyPlans, 'dailyPlans', 'date', (row, at) => {
    date(row.date, `${at}.date`)
    minutes(row.capacityMinutes, `${at}.capacityMinutes`)
    optionalTimestamp(row.confirmedAt, `${at}.confirmedAt`)
    optionalTimestamp(row.lockedAt, `${at}.lockedAt`)
    optionalString(row.overloadOverrideReason, `${at}.overloadOverrideReason`)
    if (row.confirmedMusts !== undefined) {
      if (!Array.isArray(row.confirmedMusts)) fail(`${at}.confirmedMusts`)
      const ids = new Set<string>()
      row.confirmedMusts.forEach((snapshot, index) => {
        const snapshotAt = `${at}.confirmedMusts[${index}]`
        taskSnapshot(snapshot, snapshotAt)
        const id = object(snapshot, snapshotAt).taskId as string
        if (ids.has(id)) fail(`${snapshotAt}.taskId 重复`)
        ids.add(id)
      })
    }
    if (row.amendments !== undefined) {
      if (!Array.isArray(row.amendments)) fail(`${at}.amendments`)
      const ids = new Set<string>()
      row.amendments.forEach((value, index) => {
        const atAmendment = `${at}.amendments[${index}]`
        const amendment = object(value, atAmendment)
        string(amendment.id, `${atAmendment}.id`, true)
        if (ids.has(amendment.id as string)) fail(`${atAmendment}.id 重复`)
        ids.add(amendment.id as string)
        timestamp(amendment.createdAt, `${atAmendment}.createdAt`)
        string(amendment.reason, `${atAmendment}.reason`, true)
        taskSnapshot(amendment.task, `${atAmendment}.task`)
      })
    }
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
    optionalString(row.splitFromId, `${at}.splitFromId`)
    optionalString(row.carriedFromId, `${at}.carriedFromId`)
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
  if ((data.version as number) >= 3 && !Array.isArray(data.dailyReviews)) fail('dailyReviews')
  if ((data.version as number) >= 4 && !Array.isArray(data.interventionEvents)) fail('interventionEvents')
  const dailyReviews = rows<DailyReview>(data.dailyReviews ?? [], 'dailyReviews', 'date', (row, at) => {
    date(row.date, `${at}.date`)
    optionalTimestamp(row.closedAt, `${at}.closedAt`)
    if (!Array.isArray(row.entries)) fail(`${at}.entries`)
    row.entries.forEach((value, index) => {
      const entryAt = `${at}.entries[${index}]`
      const entry = object(value, entryAt)
      string(entry.taskId, `${entryAt}.taskId`, true)
      string(entry.title, `${entryAt}.title`, true)
      choice(entry.action, ['defer', 'narrow', 'cancel', 'split', 'downgrade'], `${entryAt}.action`)
      if (entry.reasonCode !== undefined) {
        choice(entry.reasonCode, reasons, `${entryAt}.reasonCode`)
      }
      timestamp(entry.createdAt, `${entryAt}.createdAt`)
      optionalTimestamp(entry.updatedAt, `${entryAt}.updatedAt`)
      if (entry.snapshot !== undefined) taskSnapshot(entry.snapshot, `${entryAt}.snapshot`)
      if (entry.nextTaskIds !== undefined) stringArray(entry.nextTaskIds, `${entryAt}.nextTaskIds`)
    })
    if (row.history !== undefined) {
      if (!Array.isArray(row.history)) fail(`${at}.history`)
      const ids = new Set<string>()
      row.history.forEach((value, index) => {
        const historyAt = `${at}.history[${index}]`
        const history = object(value, historyAt)
        string(history.id, `${historyAt}.id`, true)
        if (ids.has(history.id as string)) fail(`${historyAt}.id 重复`)
        ids.add(history.id as string)
        string(history.taskId, `${historyAt}.taskId`, true)
        timestamp(history.changedAt, `${historyAt}.changedAt`)
        if (history.before !== undefined) object(history.before, `${historyAt}.before`)
        object(history.after, `${historyAt}.after`)
      })
    }
  })
  if ((data.version as number) <= 4) {
    for (const review of dailyReviews) {
      const latest = new Map<string, (typeof review.entries)[number]>()
      const changes = [...(review.history ?? [])]
      review.entries.forEach((entry, index) => {
        const previous = latest.get(entry.taskId)
        changes.push({
          id: `legacy-${review.date}-${index}`,
          taskId: entry.taskId,
          changedAt: entry.createdAt,
          before: previous,
          after: entry,
        })
        latest.set(entry.taskId, entry)
      })
      review.entries = [...latest.values()]
      review.history = changes
    }
  } else {
    dailyReviews.forEach((review, index) => {
      const ids = review.entries.map((entry) => entry.taskId)
      if (new Set(ids).size !== ids.length) fail(`dailyReviews[${index}].entries 重复结案`)
    })
  }
  const interventionEvents = rows<InterventionEvent>(
    data.interventionEvents ?? [],
    'interventionEvents',
    'id',
    (row, at) => {
      date(row.date, `${at}.date`)
      choice(
        row.kind,
        ['START_REMINDER', 'CONSEQUENCE', 'RESCOPE_SUGGESTION', 'CONFLICT_WARNING', 'REVIEW_REQUIRED'],
        `${at}.kind`,
      )
      optionalString(row.taskId, `${at}.taskId`)
      timestamp(row.createdAt, `${at}.createdAt`)
      optionalTimestamp(row.dismissedAt, `${at}.dismissedAt`)
    },
  )

  const taskIds = new Set(tasks.map((row) => row.id))
  workSessions.forEach((row, index) => {
    if (!taskIds.has(row.taskId)) fail(`workSessions[${index}].taskId 不存在`)
  })
  taskEvents.forEach((row, index) => {
    const planEvent = (row.type === 'plan_overridden' || row.type === 'plan_amended') && row.taskId.startsWith('plan:')
    if (!taskIds.has(row.taskId) && !planEvent) fail(`taskEvents[${index}].taskId 不存在`)
  })
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
    if (row.splitFromId && !taskIds.has(row.splitFromId)) fail(`tasks[${index}].splitFromId 不存在`)
    if (row.carriedFromId && !taskIds.has(row.carriedFromId)) fail(`tasks[${index}].carriedFromId 不存在`)
  })
  dailyPlans.forEach((plan, index) => {
    for (const snapshot of plan.confirmedMusts ?? []) {
      if (!taskIds.has(snapshot.taskId)) fail(`dailyPlans[${index}].confirmedMusts.taskId 不存在`)
    }
    for (const amendment of plan.amendments ?? []) {
      if (!taskIds.has(amendment.task.taskId)) fail(`dailyPlans[${index}].amendments.taskId 不存在`)
    }
  })
  dailyReviews.forEach((review, reviewIndex) => {
    review.entries.forEach((entry, entryIndex) => {
      if (!taskIds.has(entry.taskId)) {
        fail(`dailyReviews[${reviewIndex}].entries[${entryIndex}].taskId 不存在`)
      }
      for (const nextTaskId of entry.nextTaskIds ?? []) {
        if (!taskIds.has(nextTaskId)) fail(`dailyReviews[${reviewIndex}].entries[${entryIndex}].nextTaskIds 不存在`)
      }
    })
  })
  interventionEvents.forEach((entry, index) => {
    if (entry.taskId && !taskIds.has(entry.taskId)) fail(`interventionEvents[${index}].taskId 不存在`)
  })

  return { version: data.version as BackupPayload['version'], exportedAt: data.exportedAt as string,
    dailyPlans, tasks, workSessions, taskEvents, desires, goals, commitments,
    dailyReviews, interventionEvents }
}
