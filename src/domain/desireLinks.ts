import type { Commitment, Desire, Goal, Task, TaskSnapshot } from './types'

/** Keep authored links separate from legacy Goal → Desire links, but show both. */
export function desiresForTask(task: Task, goals: Goal[], desires: Desire[], includeInactive = false): Desire[] {
  const primaryGoal = goals.find((goal) => goal.id === task.primaryGoalId)
  const ids = new Set(task.desireIds ?? [])
  if (primaryGoal?.primaryDesireId) ids.add(primaryGoal.primaryDesireId)
  return desires.filter((desire) => ids.has(desire.id) && (includeInactive || desire.active))
}

export function snapshotTask(
  task: Task,
  goals: Goal[],
  desires: Desire[],
  commitments: Commitment[],
): TaskSnapshot {
  const goal = goals.find((item) => item.id === task.primaryGoalId)
  const commitment = commitments.find((item) => item.id === task.primaryCommitmentId)
  const linked = desiresForTask(task, goals, desires, true)
  return {
    taskId: task.id,
    title: task.title,
    plannedDate: task.plannedDate,
    priorityBand: task.priorityBand,
    plannedMinutes: task.plannedMinutes,
    primaryGoalId: task.primaryGoalId,
    primaryCommitmentId: task.primaryCommitmentId,
    desireIds: linked.map((item) => item.id),
    desireTitles: linked.map((item) => item.title),
    goalTitle: goal?.title,
    commitmentTitle: commitment?.title,
  }
}
