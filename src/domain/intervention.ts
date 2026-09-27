import { impactIfNotDone, type Consequence } from './consequence'
import { openMusts } from './review'
import type { Commitment, Desire, Goal, Task, WorkSession } from './types'

export type InterventionKind =
  | 'SILENCE'
  | 'START_REMINDER'
  | 'CONSEQUENCE'
  | 'RESCOPE_SUGGESTION'
  | 'CONFLICT_WARNING'
  | 'REVIEW_REQUIRED'

export type Intervention = {
  kind: Exclude<InterventionKind, 'SILENCE'>
  taskId?: string
  title: string
  body: string
  facts?: Consequence
}

export type ShownFact = {
  date: string
  kind: InterventionKind
  taskId?: string
}

const PRIORITY: Record<InterventionKind, number> = {
  REVIEW_REQUIRED: 100,
  CONFLICT_WARNING: 80,
  RESCOPE_SUGGESTION: 70,
  CONSEQUENCE: 60,
  START_REMINDER: 40,
  SILENCE: 0,
}

export function shouldIntervene(input: {
  task: Task
  consequence: Consequence
  now: Date
}): InterventionKind {
  if (input.task.status === 'in_progress' || input.task.status === 'completed') return 'SILENCE'
  if (input.task.priorityBand !== 'must') return 'SILENCE'
  if (!input.consequence.feasibleToday) return 'RESCOPE_SUGGESTION'
  if (input.consequence.delayMinutes >= 30) return 'CONSEQUENCE'
  if (input.consequence.delayMinutes >= 15) return 'START_REMINDER'
  return 'SILENCE'
}

export function interventionsTodayForTask(shown: ShownFact[], date: string, taskId: string): number {
  return shown.filter(
    (item) =>
      item.date === date &&
      item.taskId === taskId &&
      item.kind !== 'SILENCE' &&
      item.kind !== 'REVIEW_REQUIRED',
  ).length
}

export function alreadyShown(
  shown: ShownFact[],
  date: string,
  kind: InterventionKind,
  taskId?: string,
): boolean {
  return shown.some(
    (item) => item.date === date && item.kind === kind && item.taskId === taskId,
  )
}

export function renderIntervention(
  kind: Exclude<InterventionKind, 'SILENCE'>,
  extra: { overdueOpen?: number; task?: Task; facts?: Consequence; plannedMust?: number; capacity?: number },
): Intervention {
  if (kind === 'REVIEW_REQUIRED') {
    const count = extra.overdueOpen ?? 0
    return {
      kind,
      title: '过去日期尚未关账',
      body: `过去日期还有 ${count} 件 MUST 没有原因。先复盘，再开始今天。`,
    }
  }
  if (kind === 'CONFLICT_WARNING') {
    return {
      kind,
      title: 'MUST 超过今日容量',
      body: `MUST 已占 ${extra.plannedMust ?? 0} 分钟，容量 ${extra.capacity ?? 0} 分钟。确认计划前必须写下覆盖原因，否则不能把今天锁上。`,
    }
  }
  const task = extra.task
  const facts = extra.facts
  const title = task?.title ?? '这件事'
  const desireFact = facts?.desireTitles.length
    ? `它关联你写下的欲望：${facts.desireTitles.join('、')}。`
    : '这项行动尚未关联欲望。'
  if (kind === 'RESCOPE_SUGGESTION' && facts) {
    return {
      kind,
      taskId: task?.id,
      facts,
      title: '今天可能做不完',
      body: `「${title}」还需要约 ${facts.estimatedMinutesNeeded} 分钟，今天只剩 ${facts.remainingMinutesToday} 分钟。${desireFact}缩小范围，或考虑延到明天；若整项延后，明天 MUST 预计 ${facts.tomorrowMustLoad} 分钟。`,
    }
  }
  if (kind === 'START_REMINDER' && facts) {
    return {
      kind,
      taskId: task?.id,
      facts,
      title: '还没开始',
      body: `「${title}」计划 ${task?.plannedStart ?? ''} 开始，已经过了 ${facts.delayMinutes} 分钟。${desireFact}`,
    }
  }
  return {
    kind: 'CONSEQUENCE',
    taskId: task?.id,
    facts,
    title: '如果现在不做',
    body:
      facts != null
        ? `「${title}」已延迟 ${facts.delayMinutes} 分钟。完成仍需要约 ${facts.estimatedMinutesNeeded} 分钟；今天剩余可执行时间约 ${facts.remainingMinutesToday} 分钟。${desireFact}${facts.commitmentAtRisk ? '相关承诺已到期，且仍有未完成的 MUST。' : ''}若整项延到明天，明天 MUST 预计 ${facts.tomorrowMustLoad} 分钟。`
        : `「${title}」请查看计划与实际记录。`,
  }
}

export function pickForegroundIntervention(input: {
  date: string
  now: Date
  overdueOpen: number
  plannedMust: number
  capacityMinutes: number
  tasks: Task[]
  sessions: WorkSession[]
  commitments: Commitment[]
  goals: Goal[]
  desires: Desire[]
  shown: ShownFact[]
}): Intervention | null {
  const candidates: Intervention[] = []

  if (input.overdueOpen > 0 && !alreadyShown(input.shown, input.date, 'REVIEW_REQUIRED')) {
    candidates.push(renderIntervention('REVIEW_REQUIRED', { overdueOpen: input.overdueOpen }))
  }

  if (
    input.plannedMust > input.capacityMinutes &&
    !alreadyShown(input.shown, input.date, 'CONFLICT_WARNING')
  ) {
    candidates.push(
      renderIntervention('CONFLICT_WARNING', {
        plannedMust: input.plannedMust,
        capacity: input.capacityMinutes,
      }),
    )
  }

  for (const task of openMusts(input.tasks, input.date)) {
    const facts = impactIfNotDone({
      task,
      now: input.now,
      capacityMinutes: input.capacityMinutes,
      sessions: input.sessions,
      tasks: input.tasks,
      commitments: input.commitments,
      goals: input.goals,
      desires: input.desires,
    })
    const kind = shouldIntervene({ task, consequence: facts, now: input.now })
    if (kind === 'SILENCE') continue
    if (alreadyShown(input.shown, input.date, kind, task.id)) continue
    if (interventionsTodayForTask(input.shown, input.date, task.id) >= 2) continue
    candidates.push(renderIntervention(kind, { task, facts }))
  }

  if (candidates.length === 0) return null
  return candidates.sort((left, right) => PRIORITY[right.kind] - PRIORITY[left.kind])[0] ?? null
}
