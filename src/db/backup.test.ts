import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupPayload, Task } from '../domain/types'
import { exportBackup, importBackup } from './backup'
import { parseBackup } from './backupSchema'
import { db } from './db'

const stamp = '2026-09-26T08:00:00.000Z'
const task = (id: string): Task => ({
  id, title: id, priorityBand: 'must', plannedMinutes: 30,
  status: 'planned', createdAt: stamp,
})
const payload = (): BackupPayload => ({
  version: 2, exportedAt: stamp,
  dailyPlans: [{ date: '2026-09-26', capacityMinutes: 240 }],
  tasks: [task('restored')],
  workSessions: [{ id: 'session', taskId: 'restored', startedAt: stamp, actualMinutes: 12, endedAt: stamp }],
  taskEvents: [{ id: 'event', taskId: 'restored', type: 'completed', createdAt: stamp }],
  desires: [{ id: 'desire', title: '方向', importance: 4, active: true, createdAt: stamp, updatedAt: stamp }],
  goals: [{ id: 'goal', title: '目标', status: 'active', primaryDesireId: 'desire', createdAt: stamp }],
  commitments: [{ id: 'commitment', title: '承诺', startAt: stamp, state: 'active', primaryGoalId: 'goal', createdAt: stamp }],
})

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => { await db.delete() })

describe('backup safety', () => {
  it.each([
    ['missing task title', (data: BackupPayload) => { data.tasks[0] = { ...data.tasks[0], title: undefined } as unknown as Task }, 'tasks[0].title'],
    ['invalid status', (data: BackupPayload) => { data.tasks[0] = { ...data.tasks[0], status: 'nonsense' } as unknown as Task }, 'tasks[0].status'],
    ['negative minutes', (data: BackupPayload) => { data.workSessions[0].actualMinutes = -1 }, 'workSessions[0].actualMinutes'],
    ['missing direction table', (data: BackupPayload) => { delete data.goals }, 'goals'],
    ['duplicate key', (data: BackupPayload) => { data.tasks.push(task('restored')) }, 'tasks[1].id'],
    ['orphan session', (data: BackupPayload) => { data.workSessions[0].taskId = 'absent' }, 'workSessions[0].taskId'],
    ['unknown linked desire', (data: BackupPayload) => { data.tasks[0].desireIds = ['absent'] }, 'tasks[0].desireIds'],
    ['duplicate linked desire', (data: BackupPayload) => { data.tasks[0].desireIds = ['desire', 'desire'] }, 'tasks[0].desireIds'],
  ])('rejects %s before replacing existing data', async (_name, mutate, path) => {
    await db.tasks.add(task('original'))
    const data = payload()
    mutate(data)
    await expect(importBackup(JSON.stringify(data))).rejects.toThrow(path)
    expect((await db.tasks.toArray()).map((row) => row.id)).toEqual(['original'])
    expect(await db.workSessions.count()).toBe(0)
  })

  it('accepts a version 1 backup with no direction tables and clears old direction data', async () => {
    await db.desires.add(payload().desires![0])
    const { desires: _desires, goals: _goals, commitments: _commitments, ...legacy } = payload()
    await importBackup(JSON.stringify({ ...legacy, version: 1 }))
    expect((await db.tasks.toArray()).map((row) => row.id)).toEqual(['restored'])
    expect(await db.desires.count()).toBe(0)
  })

  it('round trips all seven tables and exposes a validated preview', async () => {
    const data = payload()
    data.tasks[0].desireIds = ['desire']
    const text = JSON.stringify(data)
    expect(parseBackup(text).tasks).toHaveLength(1)
    expect(await db.tasks.count()).toBe(0)
    await importBackup(text)
    const exported = await exportBackup()
    expect(exported).toEqual({
      ...data,
      version: 5,
      exportedAt: exported.exportedAt,
      dailyReviews: [],
      interventionEvents: [],
    })
    expect(parseBackup(JSON.stringify(exported))).toEqual(exported)
  })

  it('rolls back cleared tables if a write fails', async () => {
    await db.tasks.add(task('original'))
    vi.spyOn(db.taskEvents, 'bulkAdd').mockImplementationOnce(() => { throw new Error('write failed') })
    await expect(importBackup(JSON.stringify(payload()))).rejects.toThrow('write failed')
    expect((await db.tasks.toArray()).map((row) => row.id)).toEqual(['original'])
    expect(await db.dailyPlans.count()).toBe(0)
  })

  it.each([3, 4] as const)('imports version %i reviews and exports one final result per task', async (version) => {
    const data: BackupPayload = {
      ...payload(), version,
      dailyReviews: [{
        date: '2026-09-26',
        entries: [
          { taskId: 'restored', title: 'restored', action: 'defer', reasonCode: 'plan_error', createdAt: stamp },
          { taskId: 'restored', title: 'restored', action: 'cancel', reasonCode: 'priority_change', createdAt: stamp },
        ],
      }],
      ...(version === 4 ? { interventionEvents: [] } : {}),
    }
    await importBackup(JSON.stringify(data))
    const exported = await exportBackup()
    expect(exported.dailyReviews?.[0].entries).toHaveLength(1)
    expect(exported.dailyReviews?.[0].entries[0].reasonCode).toBe('priority_change')
    expect(exported.dailyReviews?.[0].history).toHaveLength(2)
    expect(parseBackup(JSON.stringify(exported)).dailyReviews?.[0].entries).toHaveLength(1)
  })

  it('rejects a damaged V5 review reference without replacing local data', async () => {
    await db.tasks.add(task('original'))
    const data: BackupPayload = {
      ...payload(), version: 5, dailyReviews: [{
        date: '2026-09-26', entries: [
          { taskId: 'missing', title: 'missing', action: 'cancel', reasonCode: 'plan_error', createdAt: stamp },
        ],
      }], interventionEvents: [],
    }
    await expect(importBackup(JSON.stringify(data))).rejects.toThrow('taskId 不存在')
    expect((await db.tasks.toArray()).map((row) => row.id)).toEqual(['original'])
  })
})
