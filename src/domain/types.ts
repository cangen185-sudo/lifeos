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
  | 'willful_abandon'
  | 'procrastination'
  | 'split'
  | 'plan_overridden'

export type ReviewAction = 'defer' | 'narrow' | 'cancel' | 'split' | 'downgrade'

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
  | 'edited'
  | 'desire_links_changed'
  | 'plan_amended'
  | 'review_corrected'

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
  // Explicit many-to-many desire links for the personal MVP.
  desireIds?: string[]
  splitFromId?: string
  carriedFromId?: string
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
  confirmedMusts?: TaskSnapshot[]
  amendments?: { id: string; createdAt: string; reason: string; task: TaskSnapshot }[]
}

export type TaskSnapshot = {
  taskId: string
  title: string
  plannedDate?: string
  priorityBand: PriorityBand
  plannedMinutes: number
  primaryGoalId?: string
  primaryCommitmentId?: string
  desireIds: string[]
  desireTitles: string[]
  goalTitle?: string
  commitmentTitle?: string
}

export type ReviewEntry = {
  taskId: string
  title: string
  action: ReviewAction
  reasonCode?: ReasonCode
  createdAt: string
  updatedAt?: string
  snapshot?: TaskSnapshot
  nextTaskIds?: string[]
}

export type ReviewChange = {
  id: string
  taskId: string
  changedAt: string
  before?: ReviewEntry
  after: ReviewEntry
}

export type DailyReview = {
  date: string
  closedAt?: string
  entries: ReviewEntry[]
  history?: ReviewChange[]
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

export type InterventionKindStored =
  | 'START_REMINDER'
  | 'CONSEQUENCE'
  | 'RESCOPE_SUGGESTION'
  | 'CONFLICT_WARNING'
  | 'REVIEW_REQUIRED'

export type InterventionEvent = {
  id: string
  date: string
  kind: InterventionKindStored
  taskId?: string
  createdAt: string
  dismissedAt?: string
}

export type BackupPayload = {
  version: 1 | 2 | 3 | 4 | 5
  exportedAt: string
  dailyPlans: DailyPlan[]
  tasks: Task[]
  workSessions: WorkSession[]
  taskEvents: TaskEvent[]
  desires?: Desire[]
  goals?: Goal[]
  commitments?: Commitment[]
  dailyReviews?: DailyReview[]
  interventionEvents?: InterventionEvent[]
}
