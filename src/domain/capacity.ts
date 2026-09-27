import type { Task } from './types'

export function plannedMustMinutes(tasks: Task[], date: string): number {
  return tasks
    .filter(
      (task) =>
        task.plannedDate === date &&
        task.priorityBand === 'must' &&
        task.status !== 'cancelled',
    )
    .reduce((sum, task) => sum + task.plannedMinutes, 0)
}

export function canConfirmPlan(
  plannedMust: number,
  capacityMinutes: number,
  overloadReason?: string,
): { ok: boolean; overload: number; needsReason: boolean } {
  if (!Number.isFinite(plannedMust) || plannedMust < 0 ||
      !Number.isFinite(capacityMinutes) || capacityMinutes < 0) {
    return { ok: false, overload: 0, needsReason: false }
  }
  const overload = plannedMust - capacityMinutes
  if (overload <= 0) return { ok: true, overload: 0, needsReason: false }
  const trimmed = overloadReason?.trim() ?? ''
  return { ok: trimmed.length > 0, overload, needsReason: true }
}
