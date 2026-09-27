import { describe, expect, it } from 'vitest'
import { canConfirmPlan, plannedMustMinutes } from './capacity'
import { delayMinutes, impactIfNotDone, remainingMinutesToday } from './consequence'
import { canTransitionCommitment, commitmentAtRisk } from './commitment'
import { pickForegroundIntervention, shouldIntervene } from './intervention'
import { desireAlignment, mustRateOnDate, plannedVsActual, reasonDistribution } from './analytics'
import type { Commitment, DailyPlan, Desire, Goal, Task, WorkSession } from './types'

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    plannedMinutes: 90,
    priorityBand: 'must',
    status: 'planned',
    plannedDate: '2026-09-13',
    createdAt: '2026-09-13T00:00:00.000Z',
    ...partial,
  }
}

const now = new Date(2026, 8, 13, 21, 0, 0)

describe('capacity', () => {
  it('blocks confirm when MUST overflows without a reason', () => {
    const result = canConfirmPlan(300, 240)
    expect(result.ok).toBe(false)
    expect(result.needsReason).toBe(true)
    expect(result.overload).toBe(60)
  })
  it('allows overflow with a written reason', () => {
    expect(canConfirmPlan(300, 240, '今晚只能加班').ok).toBe(true)
  })
  it('sums MUST minutes and ignores cancelled', () => {
    expect(
      plannedMustMinutes(
        [
          task({ id: 'a', title: 'a', plannedMinutes: 90 }),
          task({ id: 'b', title: 'b', plannedMinutes: 60, status: 'cancelled' }),
        ],
        '2026-09-13',
      ),
    ).toBe(90)
  })
})

describe('consequence', () => {
  it('does not count delay when MUST has no plannedStart', () => {
    expect(delayMinutes(task({ id: 'a', title: 'a' }), now)).toBe(0)
  })
  it('counts delay from plannedStart', () => {
    expect(
      delayMinutes(task({ id: 'a', title: 'a', plannedStart: '20:00' }), now),
    ).toBe(60)
  })
  it('remaining time is min(capacity left, wall clock to 23:59)', () => {
    expect(remainingMinutesToday(240, 200, now)).toBe(40)
  })
  it('marks commitment at risk when not feasible today', () => {
    const item = task({
      id: 'a',
      title: 'CSP 训练',
      plannedStart: '17:00',
      plannedMinutes: 90,
      primaryCommitmentId: 'c1',
      primaryGoalId: 'g1',
    })
    const commitment: Commitment = {
      id: 'c1',
      title: '本周训练',
      startAt: '2026-09-01T00:00:00.000Z',
      endAt: '2026-09-13T15:59:59.000Z',
      state: 'active',
      createdAt: '2026-09-01T00:00:00.000Z',
      primaryGoalId: 'g1',
    }
    const goal: Goal = {
      id: 'g1',
      title: '算法能力',
      status: 'active',
      createdAt: '2026-09-01T00:00:00.000Z',
      primaryDesireId: 'd1',
    }
    const desire: Desire = {
      id: 'd1',
      title: '职业竞争力',
      importance: 5,
      active: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    const impact = impactIfNotDone({
      task: item,
      now,
      capacityMinutes: 30,
      sessions: [],
      tasks: [item],
      commitments: [commitment],
      goals: [goal],
      desires: [desire],
    })
    expect(impact.delayMinutes).toBe(240)
    expect(impact.feasibleToday).toBe(false)
    expect(impact.commitmentAtRisk).toBe(true)
    expect(impact.whyPath).toEqual(['本周训练', '算法能力', '职业竞争力'])
    expect(impact.estimatedMinutesNeeded).toBe(90)
    expect(impactIfNotDone({
      task: item, now, capacityMinutes: 30, sessions: [], tasks: [item],
      commitments: [{ ...commitment, endAt: undefined }], goals: [goal], desires: [desire],
    }).commitmentAtRisk).toBe(false)
  })
})

describe('remainingMinutesToday wall clock', () => {
  it('is about 179 minutes at 21:00', () => {
    const left = remainingMinutesToday(240, 0, now)
    expect(left).toBeGreaterThan(170)
    expect(left).toBeLessThan(190)
  })
})

describe('intervention', () => {
  const base = task({ id: 'a', title: 'CSP 训练', plannedStart: '17:00' })
  it('stays silent while in progress', () => {
    expect(
      shouldIntervene({
        task: { ...base, status: 'in_progress' },
        consequence: {
          taskId: 'a',
          delayMinutes: 80,
          remainingMinutesToday: 190,
          estimatedMinutesNeeded: 90,
          feasibleToday: true,
          commitmentAtRisk: true,
          tomorrowMustLoad: 210,
          whyPath: [],
        },
        now,
      }),
    ).toBe('SILENCE')
  })
  it('suggests rescope when not feasible', () => {
    expect(
      shouldIntervene({
        task: base,
        consequence: {
          taskId: 'a',
          delayMinutes: 80,
          remainingMinutesToday: 40,
          estimatedMinutesNeeded: 90,
          feasibleToday: false,
          commitmentAtRisk: true,
          tomorrowMustLoad: 210,
          whyPath: [],
        },
        now,
      }),
    ).toBe('RESCOPE_SUGGESTION')
  })
  it('emits consequence after 30 minutes delay if still feasible', () => {
    expect(
      shouldIntervene({
        task: base,
        consequence: {
          taskId: 'a',
          delayMinutes: 80,
          remainingMinutesToday: 190,
          estimatedMinutesNeeded: 90,
          feasibleToday: true,
          commitmentAtRisk: true,
          tomorrowMustLoad: 210,
          whyPath: [],
        },
        now,
      }),
    ).toBe('CONSEQUENCE')
  })
  it('picks review as the single foreground intervention', () => {
    const picked = pickForegroundIntervention({
      date: '2026-09-13',
      now,
      overdueOpen: 2,
      plannedMust: 90,
      capacityMinutes: 240,
      tasks: [base],
      sessions: [],
      commitments: [],
      goals: [],
      desires: [],
      shown: [],
    })
    expect(picked?.kind).toBe('REVIEW_REQUIRED')
  })
  it('does not repeat the same fact', () => {
    const picked = pickForegroundIntervention({
      date: '2026-09-13',
      now,
      overdueOpen: 2,
      plannedMust: 90,
      capacityMinutes: 240,
      tasks: [base],
      sessions: [],
      commitments: [],
      goals: [],
      desires: [],
      shown: [{ date: '2026-09-13', kind: 'REVIEW_REQUIRED' }],
    })
    expect(picked?.kind).not.toBe('REVIEW_REQUIRED')
  })
})

describe('commitment transitions', () => {
  it('allows manual settle from active', () => {
    expect(canTransitionCommitment('active', 'fulfilled')).toBe(true)
    expect(canTransitionCommitment('active', 'breached')).toBe(true)
    expect(canTransitionCommitment('active', 'waived')).toBe(true)
    expect(canTransitionCommitment('fulfilled', 'active')).toBe(false)
  })
  it('flags at-risk only when due and open MUST remains', () => {
    const commitment: Commitment = {
      id: 'c1',
      title: '本周训练',
      startAt: '2026-09-01T00:00:00.000Z',
      endAt: '2026-09-13T15:59:59.000Z',
      state: 'active',
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    expect(
      commitmentAtRisk({
        commitment,
        today: '2026-09-13',
        tasks: [task({ id: 'a', title: 'open', primaryCommitmentId: 'c1' })],
      }),
    ).toBe(true)
    expect(
      commitmentAtRisk({
        commitment,
        today: '2026-09-13',
        tasks: [task({ id: 'a', title: 'done', primaryCommitmentId: 'c1', status: 'completed' })],
      }),
    ).toBe(false)
  })
})

describe('analytics', () => {
  const tasks: Task[] = [
    task({ id: 'a', title: 'done', status: 'completed', primaryGoalId: 'g1', plannedMinutes: 90 }),
    task({ id: 'b', title: 'open', plannedMinutes: 90 }),
  ]
  const sessions: WorkSession[] = [
    {
      id: 's1',
      taskId: 'a',
      startedAt: '2026-09-13T12:00:00.000Z',
      endedAt: '2026-09-13T13:10:00.000Z',
      actualMinutes: 70,
    },
  ]
  const plan: DailyPlan = {
    date: '2026-09-13', capacityMinutes: 240, lockedAt: '2026-09-13T00:00:00.000Z',
    confirmedMusts: tasks.map((item) => ({
      taskId: item.id, title: item.title, plannedDate: item.plannedDate,
      priorityBand: item.priorityBand, plannedMinutes: item.plannedMinutes,
      desireIds: [], desireTitles: [],
    })),
  }
  it('computes MUST completion from the confirmed snapshot', () => {
    const rate = mustRateOnDate([plan], tasks, '2026-09-13')
    expect(rate).toEqual({ date: '2026-09-13', total: 2, done: 1, rate: 0.5 })
  })
  it('keeps historical denominator after cancellation and split', () => {
    const rate = mustRateOnDate(
      [plan],
      [
        ...tasks,
        task({ id: 'c', title: 'cancelled', status: 'cancelled' }),
        task({ id: 'parent', title: 'split origin', status: 'cancelled' }),
        task({ id: 'child', title: 'piece', splitFromId: 'parent', plannedMinutes: 45 }),
      ],
      '2026-09-13',
    )
    expect(rate.total).toBe(2)
    expect(rate.done).toBe(1)
  })
  it('shows no percentage without a confirmed plan', () => {
    expect(mustRateOnDate([], tasks, '2026-09-13').rate).toBeNull()
  })
  it('compares planned vs actual', () => {
    const result = plannedVsActual({
      plans: [plan],
      sessions,
      from: '2026-09-13',
      to: '2026-09-13',
    })
    expect(result.planned).toBe(180)
    expect(result.actual).toBe(70)
    expect(result.bias).toBe(-110)
  })
  it('shows the linked desire without adding its minutes to the total', () => {
    const goals: Goal[] = [
      {
        id: 'g1',
        title: '交付 LifeOS',
        status: 'active',
        createdAt: '2026-09-01T00:00:00.000Z',
        primaryDesireId: 'd1',
      },
    ]
    const desires: Desire[] = [
      {
        id: 'd1',
        title: '经济选择权',
        importance: 5,
        active: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]
    const rows = desireAlignment({
      tasks,
      sessions,
      reviews: [],
      goals,
      desires,
      from: '2026-09-13',
      to: '2026-09-13',
    })
    const desire = rows.find((row) => row.kind === 'desire')
    expect(desire?.minutes).toBe(70)
    expect(desire?.actionCount).toBe(1)
  })
  it('groups unfinished reasons', () => {
    const dist = reasonDistribution(
      [
        {
          date: '2026-09-12',
          closedAt: 'stamp',
          entries: [
            {
              taskId: 'a',
              title: 'a',
              action: 'cancel',
              reasonCode: 'willful_breach',
              createdAt: 'stamp',
            },
            {
              taskId: 'b',
              title: 'b',
              action: 'cancel',
              reasonCode: 'plan_error',
              createdAt: 'stamp',
            },
            {
              taskId: 'c',
              title: 'c',
              action: 'cancel',
              reasonCode: 'uncontrollable_event',
              createdAt: 'stamp',
            },
          ],
        },
      ],
    )
    expect(dist.execution).toBe(1)
    expect(dist.planning).toBe(1)
    expect(dist.external).toBe(1)
  })
  it('does not count plan override as an unfinished-task reason', () => {
    const dist = reasonDistribution(
      [],
    )
    expect(dist.planning).toBe(0)
  })
})
