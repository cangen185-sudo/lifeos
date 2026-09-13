export type PriorityBand = 'must' | 'should' | 'optional'
export type TaskStatus =
  | 'backlog'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type GoalStatus = 'active' | 'achieved' | 'dropped'
export type CommitmentState =
  | 'draft'
  | 'active'
  | 'fulfilled'
  | 'breached'
  | 'waived'
  | 'expired'

export type ReasonCode =
  | 'uncontrollable_event'
  | 'plan_error'
  | 'time_estimate_error'
  | 'priority_change'
  | 'strategy_change'
  | 'willful_breach'
  | 'split'
  | 'plan_overridden'

export type TaskEventType =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'deferred'
  | 'narrowed'
  | 'split'
  | 'priority_changed'
  | 'cancelled'
  | 'plan_overridden'

export type Desire = {
  id: string
  title: string
  description?: string
  importance: 1 | 2 | 3 | 4 | 5
  active: boolean
  createdAt: string
  updatedAt: string
}

export type Goal = {
  id: string
  title: string
  description?: string
  targetDate?: string
  status: GoalStatus
  primaryDesireId?: string
  createdAt: string
}

export type Commitment = {
  id: string
  title: string
  rationale?: string
  startAt: string
  endAt?: string
  targetNote?: string
  state: CommitmentState
  primaryGoalId?: string
  createdAt: string
}

export type Task = {
  id: string
  title: string
  plannedDate?: string
  plannedStart?: string
  deadline?: string
  priorityBand: PriorityBand
  plannedMinutes: number
  status: TaskStatus
  primaryGoalId?: string
  primaryCommitmentId?: string
  createdAt: string
  completedAt?: string
}

export type WorkSession = {
  id: string
  taskId: string
  startedAt: string
  endedAt?: string
  actualMinutes?: number
}

export type DailyPlan = {
  date: string
  capacityMinutes: number
  confirmedAt?: string
  lockedAt?: string
  overloadOverrideReason?: string
}

export type TaskEvent = {
  id: string
  taskId: string
  type: TaskEventType
  before?: unknown
  after?: unknown
  reasonCode?: ReasonCode
  createdAt: string
}

export type BackupPayload = {
  version: 1 | 2
  exportedAt: string
  dailyPlans: DailyPlan[]
  tasks: Task[]
  workSessions: WorkSession[]
  taskEvents: TaskEvent[]
  desires?: Desire[]
  goals?: Goal[]
  commitments?: Commitment[]
}
