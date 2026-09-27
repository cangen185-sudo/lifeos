import { describe, expect, it } from 'vitest'
import { closedSessionMinutes, desireAlignment, mustRateOnDate, sessionMinutesByLocalDate } from './analytics'
import { todayKey } from './clock'
import type { DailyPlan, Desire, Task, WorkSession } from './types'

const stamp = '2026-09-25T08:00:00.000Z'
const desires: Desire[] = ['d1', 'd2', 'd3'].map((id) => ({
  id, title: id, importance: 4, active: true, createdAt: stamp, updatedAt: stamp,
}))
const task: Task = {
  id: 'fitness', title: '健身', plannedDate: '2026-09-25', priorityBand: 'must',
  plannedMinutes: 60, status: 'completed', desireIds: ['d1', 'd2', 'd3'], createdAt: stamp,
}
const plan: DailyPlan = {
  date: '2026-09-25', capacityMinutes: 120, lockedAt: stamp,
  confirmedMusts: [{
    taskId: task.id, title: task.title, plannedDate: task.plannedDate,
    priorityBand: 'must', plannedMinutes: 60, desireIds: ['d1', 'd2', 'd3'],
    desireTitles: ['d1', 'd2', 'd3'],
  }],
}

describe('confirmed metrics and multi-desire attribution', () => {
  it('counts a confirmed MUST once after its title, status or links change', () => {
    const changed: Task = { ...task, title: '新版健身', desireIds: ['d1'], status: 'cancelled' }
    expect(mustRateOnDate([plan], [changed], plan.date)).toMatchObject({ total: 1, done: 0 })
  })

  it('shows one session under three desires without tripling total time', () => {
    const sessions: WorkSession[] = [{ id: 's1', taskId: 'fitness', startedAt: stamp, endedAt: stamp, actualMinutes: 45 }]
    const rows = desireAlignment({ tasks: [task], sessions, reviews: [], goals: [], desires, from: '2026-09-25', to: '2026-09-25' })
    expect(rows.map((row) => row.minutes)).toEqual([45, 45, 45])
    expect(closedSessionMinutes(sessions, '2026-09-25', '2026-09-25')).toBe(45)
  })

  it('allocates a cross-midnight session to local dates and preserves its total', () => {
    const start = new Date(2026, 8, 25, 23, 50)
    const end = new Date(2026, 8, 26, 0, 20)
    const session: WorkSession = {
      id: 'overnight', taskId: 'fitness', startedAt: start.toISOString(),
      endedAt: end.toISOString(), actualMinutes: 30,
    }
    const first = todayKey(start)
    const second = todayKey(end)
    expect([...sessionMinutesByLocalDate(session)]).toEqual([[first, 10], [second, 20]])
    expect(closedSessionMinutes([session], first, second)).toBe(30)
    expect(closedSessionMinutes([session, session], first, second)).toBe(30)
  })
})
