import { describe, expect, it } from 'vitest'
import { isValidDateKey, shiftDate } from './clock'
import {
  mustStats,
  openMusts,
} from './review'
import type { Task } from './types'

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    plannedMinutes: 90,
    priorityBand: 'must',
    status: 'planned',
    plannedDate: '2026-09-12',
    createdAt: '2026-09-12T00:00:00.000Z',
    ...partial,
  }
}

describe('openMusts', () => {
  it('only counts unfinished MUSTs on that date', () => {
    const tasks = [
      task({ id: 'a', title: 'open', status: 'planned' }),
      task({ id: 'b', title: 'running', status: 'in_progress' }),
      task({ id: 'c', title: 'done', status: 'completed' }),
      task({ id: 'd', title: 'should', priorityBand: 'should' }),
      task({ id: 'e', title: 'tomorrow', plannedDate: '2026-09-13' }),
    ]
    const open = openMusts(tasks, '2026-09-12')
    expect(open.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('mustStats', () => {
  it('splits done / open / cancelled', () => {
    const stats = mustStats(
      [
        task({ id: 'a', title: 'open' }),
        task({ id: 'b', title: 'done', status: 'completed' }),
        task({ id: 'c', title: 'no', status: 'cancelled' }),
      ],
      '2026-09-12',
    )
    expect(stats).toEqual({ total: 2, done: 1, open: 1, cancelled: 1 })
  })
})

describe('shiftDate', () => {
  it('crosses month boundaries in local time', () => {
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31')
  })
  it('rejects impossible calendar dates', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2028-02-29')).toBe(true)
  })
})
