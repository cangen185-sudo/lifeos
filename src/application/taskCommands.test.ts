import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import type { Task } from '../domain/types'
import { finishTask, startTask } from './taskCommands'

const planned = (id: string): Task => ({
  id, title: 'A MUST', plannedDate: '2026-09-26', priorityBand: 'must',
  plannedMinutes: 30, status: 'planned', createdAt: '2026-09-26T00:00:00.000Z',
})

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
})

afterEach(() => vi.restoreAllMocks())
afterAll(async () => { await db.delete() })

describe('task timing commands', () => {
  it('starts once even when two actions race', async () => {
    await db.tasks.add(planned('a'))
    expect((await Promise.all([startTask('a'), startTask('a')])).sort()).toEqual([false, true])
    expect((await db.tasks.get('a'))?.status).toBe('in_progress')
    expect((await db.workSessions.toArray()).filter((s) => !s.endedAt)).toHaveLength(1)
    expect(await db.taskEvents.where('type').equals('started').count()).toBe(1)
  })

  it('finishes a running task once, preserving its first completion time', async () => {
    await db.tasks.add(planned('a'))
    await startTask('a')
    expect((await Promise.all([finishTask('a'), finishTask('a')])).sort()).toEqual([false, true])
    const completedAt = (await db.tasks.get('a'))?.completedAt
    expect(completedAt).toBeTruthy()
    expect(await finishTask('a')).toBe(false)
    expect((await db.tasks.get('a'))?.completedAt).toBe(completedAt)
    const sessions = await db.workSessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].endedAt).toBeTruthy()
    expect(sessions[0].actualMinutes).toBeGreaterThanOrEqual(1)
    expect(await db.taskEvents.where('type').equals('completed').count()).toBe(1)
  })

  it('does not double count a manually completed task on repeat submission', async () => {
    await db.tasks.add(planned('a'))
    expect((await Promise.all([finishTask('a', 30), finishTask('a', 30)])).sort()).toEqual([false, true])
    const sessions = await db.workSessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].actualMinutes).toBe(30)
    expect(await db.taskEvents.where('type').equals('completed').count()).toBe(1)
  })

  it('rolls back the task and session when the event write fails', async () => {
    await db.tasks.add(planned('a'))
    vi.spyOn(db.taskEvents, 'add').mockImplementationOnce(() => { throw new Error('event write failed') })
    await expect(startTask('a')).rejects.toThrow('event write failed')
    expect((await db.tasks.get('a'))?.status).toBe('planned')
    expect(await db.workSessions.count()).toBe(0)
    expect(await db.taskEvents.count()).toBe(0)
  })

  it('rolls back completion and keeps the session open when event write fails', async () => {
    await db.tasks.add(planned('a'))
    await startTask('a')
    vi.spyOn(db.taskEvents, 'add').mockImplementationOnce(() => { throw new Error('event write failed') })
    await expect(finishTask('a')).rejects.toThrow('event write failed')
    expect((await db.tasks.get('a'))?.status).toBe('in_progress')
    expect((await db.workSessions.toArray())[0].endedAt).toBeUndefined()
    expect(await db.taskEvents.where('type').equals('completed').count()).toBe(0)
  })

  it('rejects invalid manual minutes without changing the task', async () => {
    await db.tasks.add(planned('a'))
    await expect(finishTask('a', 0)).rejects.toThrow('实际分钟数')
    expect((await db.tasks.get('a'))?.status).toBe('planned')
    expect(await db.workSessions.count()).toBe(0)
  })

  it('does not guess which session to close if legacy data has multiple open sessions', async () => {
    await db.tasks.add({ ...planned('a'), status: 'in_progress' })
    await db.workSessions.bulkAdd([
      { id: 's1', taskId: 'a', startedAt: '2026-09-26T10:00:00.000Z' },
      { id: 's2', taskId: 'a', startedAt: '2026-09-26T10:01:00.000Z' },
    ])
    await expect(finishTask('a')).rejects.toThrow('不一致')
    expect((await db.tasks.get('a'))?.status).toBe('in_progress')
    expect((await db.workSessions.toArray()).filter((s) => !s.endedAt)).toHaveLength(2)
  })
})
