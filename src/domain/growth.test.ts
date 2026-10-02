import { describe, expect, it } from 'vitest'
import { analyzeGrowth, calendarConflicts } from './growth'
import type { BackupPayload, Task } from './types'

const now = new Date(2026, 8, 28, 22)
const stamp = new Date(2026, 8, 25, 9).toISOString()
const task: Task = { id: 't', title: '读书', status: 'completed', priorityBand: 'must', plannedMinutes: 60, createdAt: stamp, completedAt: new Date(2026, 8, 28, 9).toISOString() }
const empty = (): BackupPayload => ({ version: 5, exportedAt: stamp, dailyPlans: [], tasks: [], taskEvents: [], workSessions: [] })
describe('evidence-based growth analysis', () => {
  it('does not turn missing data into poor performance', () => {
    const report = analyzeGrowth(empty(), '2026-09-27', 7, now)
    expect(report.findings).toEqual([])
    expect(report.metrics.recordedDays).toBe(0)
    expect(report.limitations[0]).toContain('没有记录不代表没有行动')
  })
  it('does not count a later completion in an earlier report; detects overload and review gaps', () => {
    const data = empty()
    data.tasks = [task]
    data.dailyPlans = [{ date: '2026-09-25', capacityMinutes: 30, lockedAt: stamp, confirmedMusts: [{ taskId: 't', title: '读书', priorityBand: 'must', plannedMinutes: 60, desireIds: [], desireTitles: [] }] }]
    const report = analyzeGrowth(data, '2026-09-27', 7, now)
    expect(report.metrics).toMatchObject({ confirmedMusts: 1, completedByEnd: 0 })
    expect(report.findings.map(f => f.id)).toEqual(['capacity', 'review-gap'])
    expect(report.findings.every(f => f.evidenceIds.every(id => report.evidence.some(e => e.id === id)))).toBe(true)
    expect(analyzeGrowth(data, '2026-09-28', 7, now).metrics.completedByEnd).toBe(1)
  })
  it('deduplicates sessions and deferrals and counts both cross-midnight recording dates', () => {
    const data = empty()
    data.tasks = [task]
    const session = { id: 's', taskId: 't', startedAt: new Date(2026, 8, 25, 23, 50).toISOString(), endedAt: new Date(2026, 8, 26, 0, 20).toISOString(), actualMinutes: 30 }
    data.workSessions = [session, session]
    const event = { id: 'e', taskId: 't', type: 'deferred' as const, createdAt: stamp }
    data.taskEvents = [event, event]
    const report = analyzeGrowth(data, '2026-09-27', 7, now)
    expect(report.metrics.recordedMinutes).toBe(30)
    expect(report.metrics.recordedDays).toBe(2)
    expect(report.findings).toEqual([])
    data.taskEvents.push({ ...event, id: 'e2' })
    data.tasks = [{ ...task, status: 'planned' }]
    expect(analyzeGrowth(data, '2026-09-27', 7, now).findings[0].evidenceIds).toEqual(['event:e', 'event:e2'])
    data.tasks = [task]
    expect(analyzeGrowth(data, '2026-09-27', 7, now).findings).toEqual([])
  })
  it('rejects impossible, future dates and unsupported windows', () => {
    for (const date of ['2026-02-30', 'bad', '2027-01-01']) expect(() => analyzeGrowth(empty(), date, 7, now)).toThrow()
    expect(() => analyzeGrowth(empty(), '2026-09-27', 500, now)).toThrow()
  })
  it('includes external context and calendar evidence without inflating work metrics', () => {
    const base = { source: 'google-calendar' as const, kind: 'event' as const, title: '会', updatedAt: stamp, allDay: false }
    const report = analyzeGrowth(empty(), '2026-09-27', 7, now, [
      { ...base, id: 'a', start: '2026-09-27T09:00:00+08:00', end: '2026-09-27T10:00:00+08:00' },
      { ...base, id: 'b', start: '2026-09-27T09:30:00+08:00', end: '2026-09-27T10:30:00+08:00' },
      { ...base, id: 'future', start: '2026-10-01T09:00:00+08:00', end: '2026-10-01T10:00:00+08:00' },
    ])
    expect(report.metrics).toMatchObject({ recordedDays: 0, confirmedMusts: 0, recordedMinutes: 0 })
    expect(report.externalItems).toHaveLength(2)
    expect(report.findings[0].id).toBe('calendar-overlap')
    expect(report.findings[0].evidenceIds.every(id => report.evidence.some(e => e.id === id))).toBe(true)
  })
  it('uses absolute instants for conflicts and excludes touching boundaries and all-day events', () => {
    const base = { source: 'google-calendar' as const, kind: 'event' as const, title: '会', updatedAt: stamp }
    expect(calendarConflicts([
      { ...base, id: 'a', start: '2026-09-27T09:00:00+08:00', end: '2026-09-27T10:00:00+08:00' },
      { ...base, id: 'b', start: '2026-09-27T01:30:00Z', end: '2026-09-27T02:00:00Z' },
      { ...base, id: 'c', start: '2026-09-27T10:00:00+08:00', end: '2026-09-27T11:00:00+08:00' },
      { ...base, id: 'd', allDay: true, start: '2026-09-27', end: '2026-09-28' },
    ])).toEqual([{ left: 'a', right: 'b' }])
  })
})
