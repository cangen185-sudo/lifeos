import { todayKey } from './clock'
import { isOpenStatus } from './review'
import type { Commitment, CommitmentState, Task } from './types'

const ALLOWED: Record<CommitmentState, CommitmentState[]> = {
  draft: ['active'],
  active: ['draft', 'fulfilled', 'breached', 'waived', 'expired'],
  fulfilled: [],
  breached: [],
  waived: [],
  expired: [],
}

export function canTransitionCommitment(
  from: CommitmentState,
  to: CommitmentState,
): boolean {
  return ALLOWED[from].includes(to)
}

export function commitmentAtRisk(input: {
  commitment: Commitment
  tasks: Task[]
  today: string
}): boolean {
  if (input.commitment.state !== 'active') return false
  const linked = linkedOpenMusts(input.commitment.id, input.tasks)
  if (linked.length === 0) return false
  if (!input.commitment.endAt) return false
  return todayKey(new Date(input.commitment.endAt)) <= input.today
}

export function linkedOpenMusts(commitmentId: string, tasks: Task[]): Task[] {
  return tasks.filter(
    (task) =>
      task.primaryCommitmentId === commitmentId &&
      task.priorityBand === 'must' &&
      isOpenStatus(task.status),
  )
}

export const SETTLE_STATES: { id: CommitmentState; label: string }[] = [
  { id: 'fulfilled', label: '已兑现' },
  { id: 'breached', label: '已违约' },
  { id: 'waived', label: '已豁免' },
]
