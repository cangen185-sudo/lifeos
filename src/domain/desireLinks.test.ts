import { describe, expect, it } from 'vitest'
import { desiresForTask } from './desireLinks'
import type { Desire, Goal, Task } from './types'

const stamp = '2026-09-27T00:00:00.000Z'
const desires: Desire[] = [
  { id: 'posture', title: '改善体态', importance: 5, active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'growth', title: '提升自己', importance: 4, active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'retired', title: '已停止', importance: 3, active: false, createdAt: stamp, updatedAt: stamp },
]
const goals: Goal[] = [{ id: 'fitness', title: '坚持训练', status: 'active', primaryDesireId: 'posture', createdAt: stamp }]
const task: Task = { id: 'exercise', title: '健身', status: 'planned', priorityBand: 'must', plannedMinutes: 40, createdAt: stamp, primaryGoalId: 'fitness' }

describe('task desire links', () => {
  it('combines explicit links and the existing goal link without duplicates or inactive desires', () => {
    expect(desiresForTask({ ...task, desireIds: ['growth', 'posture', 'retired'] }, goals, desires).map((item) => item.id))
      .toEqual(['posture', 'growth'])
  })
  it('keeps existing tasks linked through their original goal', () => {
    expect(desiresForTask(task, goals, desires).map((item) => item.id)).toEqual(['posture'])
  })
})
