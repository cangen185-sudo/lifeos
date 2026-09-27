import type { Desire, Goal, Task } from './types'

/** Keep authored links separate from legacy Goal → Desire links, but show both. */
export function desiresForTask(task: Task, goals: Goal[], desires: Desire[]): Desire[] {
  const primaryGoal = goals.find((goal) => goal.id === task.primaryGoalId)
  const ids = new Set(task.desireIds ?? [])
  if (primaryGoal?.primaryDesireId) ids.add(primaryGoal.primaryDesireId)
  return desires.filter((desire) => desire.active && ids.has(desire.id))
}
