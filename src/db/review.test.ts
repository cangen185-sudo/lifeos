import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { createTask, editTaskBeforeConfirmation } from '../application/taskCommands'
import { todayKey } from '../domain/clock'
import { closeDailyReview, confirmDailyPlan, correctReviewDisposition, correctReviewReason, recordIntervention, settleMust, splitMust, updateDailyCapacity } from './review'
import { exportBackup, importBackup } from './backup'
import { mustRateOnDate, plannedVsActual, reasonDistribution } from '../domain/analytics'
import type { Task } from '../domain/types'

const date = '2026-09-25'
const stamp = '2026-09-25T08:00:00.000Z'
const task = (id: string): Task => ({
  id, title: id, plannedDate: date, priorityBand: 'must', plannedMinutes: 60,
  status: 'planned', createdAt: stamp,
})

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
})
afterAll(async () => { await db.delete() })

describe('confirmed plan and daily close', () => {
  it('keeps the confirmed denominator after a reasoned deferral and repeat call', async () => {
    await db.tasks.add(task('work'))
    expect(await confirmDailyPlan({ date, capacityMinutes: 120 })).toBe(true)
    expect(await confirmDailyPlan({ date, capacityMinutes: 120 })).toBe(false)
    await expect(settleMust({ task: task('work'), date, action: 'defer', nextDate: '2026-09-26', reasonCode: undefined! })).rejects.toThrow('原因')
    expect(await settleMust({ task: task('work'), date, action: 'defer', nextDate: '2026-09-26', reasonCode: 'priority_change' })).toBe(true)
    expect(await settleMust({ task: task('work'), date, action: 'defer', nextDate: '2026-09-27', reasonCode: 'priority_change' })).toBe(false)
    const original = await db.tasks.get('work')
    const next = (await db.tasks.toArray()).find((item) => item.carriedFromId === 'work')
    expect(original?.plannedDate).toBe(date)
    expect(original?.status).toBe('cancelled')
    expect(next?.plannedDate).toBe('2026-09-26')
    expect(await db.tasks.count()).toBe(2)
    expect(await closeDailyReview(date)).toBe(true)
    expect(await closeDailyReview(date)).toBe(false)
    expect((await db.dailyReviews.get(date))?.entries).toHaveLength(1)
    expect((await db.dailyReviews.get(date))?.history).toHaveLength(1)
    expect(mustRateOnDate(await db.dailyPlans.toArray(), await db.tasks.toArray(), date)).toMatchObject({ total: 1, done: 0 })
  })

  it('does not close while a confirmed MUST has no reason and destination', async () => {
    await db.tasks.add(task('open'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await expect(closeDailyReview(date)).rejects.toThrow('原因和去向')
    expect(await db.dailyReviews.count()).toBe(0)
  })

  it('keeps one final reason while correction is audited', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await settleMust({ task: task('work'), date, action: 'cancel', reasonCode: 'plan_error' })
    await closeDailyReview(date)
    await correctReviewReason({ date, taskId: 'work', reasonCode: 'uncontrollable_event' })
    await correctReviewReason({ date, taskId: 'work', reasonCode: 'uncontrollable_event' })
    const review = (await db.dailyReviews.get(date))!
    expect(review.entries).toHaveLength(1)
    expect(review.history).toHaveLength(2)
    expect(review.entries[0].reasonCode).toBe('uncontrollable_event')
    expect(reasonDistribution([review], date, date)).toMatchObject({ planning: 0, external: 1 })
  })

  it('retains original minutes when a task is narrowed; child starts without copied sessions', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await expect(settleMust({ task: task('work'), date, action: 'narrow', reasonCode: 'time_estimate_error', narrowTitle: 'smaller', narrowMinutes: Number.NaN })).rejects.toThrow('更小')
    await settleMust({ task: task('work'), date, action: 'narrow', reasonCode: 'time_estimate_error', narrowTitle: 'smaller', narrowMinutes: 20, nextDate: '2026-09-26' })
    const child = (await db.tasks.toArray()).find((item) => item.carriedFromId === 'work')
    expect(child).toMatchObject({ title: 'smaller', plannedMinutes: 20, status: 'planned' })
    expect(await db.workSessions.count()).toBe(0)
    expect((await db.dailyReviews.get(date))?.entries[0].action).toBe('narrow')
  })

  it('rejects invalid split minutes atomically', async () => {
    await db.tasks.add(task('work'))
    await expect(splitMust({ task: task('work'), date, reasonCode: 'time_estimate_error', parts: [
      { title: 'one', minutes: 20 }, { title: 'two', minutes: -1 },
    ] })).rejects.toThrow('分钟')
    expect((await db.tasks.get('work'))?.status).toBe('planned')
    expect(await db.tasks.count()).toBe(1)
  })

  it('round trips V5 snapshots, reviews and events without changing the metrics', async () => {
    await db.tasks.add({ ...task('work'), desireIds: ['d1'] })
    await db.desires.add({ id: 'd1', title: '体态', importance: 4, active: true, createdAt: stamp, updatedAt: stamp })
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await settleMust({ task: task('work'), date, action: 'cancel', reasonCode: 'plan_error' })
    await closeDailyReview(date)
    const before = mustRateOnDate(await db.dailyPlans.toArray(), await db.tasks.toArray(), date)
    const backup = await exportBackup()
    expect(backup.version).toBe(5)
    await importBackup(JSON.stringify(backup))
    expect(JSON.parse(JSON.stringify(await exportBackup()))).toMatchObject({
      dailyPlans: JSON.parse(JSON.stringify(backup.dailyPlans)),
      dailyReviews: JSON.parse(JSON.stringify(backup.dailyReviews)),
      taskEvents: JSON.parse(JSON.stringify(backup.taskEvents)),
    })
    expect(mustRateOnDate(await db.dailyPlans.toArray(), await db.tasks.toArray(), date)).toEqual(before)
    expect(plannedVsActual({ plans: await db.dailyPlans.toArray(), sessions: await db.workSessions.toArray(), from: date, to: date })).toMatchObject({ planned: 60, actual: 0 })
  })

  it('requires a reason for an added MUST after confirmation and rolls back a failed event write', async () => {
    const today = todayKey()
    await confirmDailyPlan({ date: today, capacityMinutes: 120 })
    const newTask: Task = { ...task('new'), plannedDate: today }
    await expect(createTask(newTask)).rejects.toThrow('变更原因')
    expect(await db.tasks.count()).toBe(0)
    vi.spyOn(db.taskEvents, 'add').mockImplementationOnce(() => { throw new Error('event failed') })
    await expect(createTask(newTask, '紧急事项')).rejects.toThrow('event failed')
    expect(await db.tasks.count()).toBe(0)
    expect((await db.dailyPlans.get(today))?.amendments).toBeUndefined()
    vi.restoreAllMocks()
    await createTask(newTask, '紧急事项')
    const plan = (await db.dailyPlans.get(today))!
    expect(plan.confirmedMusts).toEqual([])
    expect(plan.amendments).toHaveLength(1)
    expect(mustRateOnDate([plan], [newTask], today)).toMatchObject({ total: 1, done: 0 })
    await expect(editTaskBeforeConfirmation({ taskId: 'new', title: 'changed', plannedMinutes: 30, priorityBand: 'should' })).rejects.toThrow('已确认')
    await expect(updateDailyCapacity(today, 10)).rejects.toThrow('已确认')
    expect((await db.dailyPlans.get(today))?.capacityMinutes).toBe(120)
  })

  it('deduplicates simultaneous in-app reminders for the same fact', async () => {
    const ids = await Promise.all([
      recordIntervention({ date, kind: 'REVIEW_REQUIRED' }),
      recordIntervention({ date, kind: 'REVIEW_REQUIRED' }),
    ])
    expect(ids[0]).toBe(ids[1])
    expect(await db.interventionEvents.count()).toBe(1)
  })

  it('corrects a closed-day defer to cancel, preserving one final result and the full history', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await settleMust({ task: task('work'), date, action: 'defer', reasonCode: 'priority_change', nextDate: '2026-09-26' })
    await closeDailyReview(date)
    const deferred = (await db.tasks.toArray()).find((item) => item.carriedFromId === 'work')!
    await correctReviewDisposition({ date, taskId: 'work', action: 'cancel', reasonCode: 'strategy_change' })
    const review = (await db.dailyReviews.get(date))!
    expect(review.entries).toHaveLength(1)
    expect(review.entries[0]).toMatchObject({ action: 'cancel', reasonCode: 'strategy_change' })
    expect(review.history).toHaveLength(2)
    expect(review.closedAt).toBeTruthy()
    expect((await db.tasks.get(deferred.id))?.status).toBe('cancelled')
    expect((await db.tasks.get('work'))?.status).toBe('cancelled')
    expect((await db.taskEvents.where('taskId').equals('work').toArray()).map((event) => event.type).sort())
      .toEqual(['cancelled', 'deferred', 'review_corrected'])
  })

  it('refuses to replace a deferred task once the next date is confirmed', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await settleMust({ task: task('work'), date, action: 'defer', reasonCode: 'priority_change', nextDate: '2026-09-26' })
    const deferred = (await db.tasks.toArray()).find((item) => item.carriedFromId === 'work')!
    await confirmDailyPlan({ date: '2026-09-26', capacityMinutes: 120 })
    await expect(correctReviewDisposition({ date, taskId: 'work', action: 'cancel', reasonCode: 'plan_error' }))
      .rejects.toThrow('确认计划')
    expect((await db.tasks.get(deferred.id))?.status).toBe('planned')
    expect((await db.dailyReviews.get(date))?.entries[0].action).toBe('defer')
  })

  it('does not settle a legacy task with two open sessions', async () => {
    await db.tasks.add({ ...task('work'), status: 'in_progress' })
    await db.workSessions.bulkAdd([
      { id: 's1', taskId: 'work', startedAt: stamp },
      { id: 's2', taskId: 'work', startedAt: stamp },
    ])
    await expect(settleMust({ task: task('work'), date, action: 'cancel', reasonCode: 'plan_error' }))
      .rejects.toThrow('多个未闭合计时')
    expect((await db.tasks.get('work'))?.status).toBe('in_progress')
    expect(await db.dailyReviews.count()).toBe(0)
  })

  it('splits into the next date and allows the original date to close', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    expect(await splitMust({ task: task('work'), date, reasonCode: 'time_estimate_error', parts: [
      { title: 'part one', minutes: 20 }, { title: 'part two', minutes: 25 },
    ] })).toBe(true)
    const children = (await db.tasks.toArray()).filter((item) => item.splitFromId === 'work')
    expect(children.map((item) => item.plannedDate)).toEqual(['2026-09-26', '2026-09-26'])
    expect(await closeDailyReview(date)).toBe(true)
    expect(mustRateOnDate(await db.dailyPlans.toArray(), await db.tasks.toArray(), date))
      .toMatchObject({ total: 1, done: 0 })
  })

  it('keeps one final result on each date after repeated deferrals', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await settleMust({ task: task('work'), date, action: 'defer', reasonCode: 'priority_change', nextDate: '2026-09-26' })
    await closeDailyReview(date)
    const firstChild = (await db.tasks.toArray()).find((item) => item.carriedFromId === 'work')!
    await confirmDailyPlan({ date: '2026-09-26', capacityMinutes: 120 })
    await settleMust({ task: firstChild, date: '2026-09-26', action: 'defer', reasonCode: 'time_estimate_error', nextDate: '2026-09-27' })
    await closeDailyReview('2026-09-26')
    const secondChild = (await db.tasks.toArray()).find((item) => item.carriedFromId === firstChild.id)!
    expect((await db.dailyReviews.get(date))?.entries).toHaveLength(1)
    expect((await db.dailyReviews.get('2026-09-26'))?.entries).toHaveLength(1)
    expect(secondChild.plannedDate).toBe('2026-09-27')
    expect(secondChild.status).toBe('planned')
    expect(await db.workSessions.count()).toBe(0)
    expect(mustRateOnDate(await db.dailyPlans.toArray(), await db.tasks.toArray(), date))
      .toMatchObject({ total: 1, done: 0 })
    expect(mustRateOnDate(await db.dailyPlans.toArray(), await db.tasks.toArray(), '2026-09-26'))
      .toMatchObject({ total: 1, done: 0 })
  })

  it('records a target-day amendment when deferring into a confirmed plan', async () => {
    await db.tasks.add(task('work'))
    await confirmDailyPlan({ date, capacityMinutes: 120 })
    await confirmDailyPlan({ date: '2026-09-26', capacityMinutes: 120 })
    await settleMust({ task: task('work'), date, action: 'defer', reasonCode: 'priority_change', nextDate: '2026-09-26' })
    const target = (await db.dailyPlans.get('2026-09-26'))!
    const tasks = await db.tasks.toArray()
    expect(target.amendments).toHaveLength(1)
    expect(mustRateOnDate([target], tasks, '2026-09-26')).toMatchObject({ total: 1, done: 0 })
    const exported = await exportBackup()
    await importBackup(JSON.stringify(exported))
    expect((await db.dailyPlans.get('2026-09-26'))?.amendments).toHaveLength(1)
  })
})
