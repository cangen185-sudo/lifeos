import type { ReasonCode, ReviewAction, Task } from './types'

export const OPEN_TASK_STATUSES: Task['status'][] = ['backlog', 'planned', 'in_progress']

export const CANCEL_REASONS: {
  id: ReasonCode
  label: string
  hint: string
  group: 'execution' | 'planning' | 'external'
}[] = [
  {
    id: 'uncontrollable_event',
    label: '不可控',
    hint: '外部打断，当时没法做',
    group: 'external',
  },
  {
    id: 'plan_error',
    label: '计划错误',
    hint: '不该排进这一天',
    group: 'planning',
  },
  {
    id: 'time_estimate_error',
    label: '估时错误',
    hint: '量比想象中大',
    group: 'planning',
  },
  {
    id: 'priority_change',
    label: '优先级变了',
    hint: '有更急的事插进来',
    group: 'external',
  },
  {
    id: 'strategy_change',
    label: '战略变了',
    hint: '方向本身改了',
    group: 'external',
  },
  {
    id: 'willful_abandon',
    label: '主动放弃',
    hint: '决定不再执行这项行动',
    group: 'execution',
  },
  {
    id: 'procrastination',
    label: '拖延',
    hint: '有条件执行，但一再推迟',
    group: 'execution',
  },
]

export function isOpenStatus(status: Task['status']): boolean {
  return OPEN_TASK_STATUSES.includes(status)
}

export function openMusts(tasks: Task[], date: string): Task[] {
  return tasks.filter(
    (task) =>
      task.plannedDate === date &&
      task.priorityBand === 'must' &&
      isOpenStatus(task.status),
  )
}

export function mustStats(tasks: Task[], date: string) {
  const onDate = tasks.filter(
    (task) => task.plannedDate === date && task.priorityBand === 'must',
  )
  return {
    total: onDate.filter((task) => task.status !== 'cancelled').length,
    done: onDate.filter((task) => task.status === 'completed').length,
    open: openMusts(onDate, date).length,
    cancelled: onDate.filter((task) => task.status === 'cancelled').length,
  }
}

export function reasonLabel(code?: ReasonCode): string {
  if (!code) return ''
  if (code === 'willful_breach') return '主动未执行（旧记录）'
  return CANCEL_REASONS.find((item) => item.id === code)?.label ?? code
}

export function actionLabel(action: ReviewAction): string {
  if (action === 'defer') return '延期'
  if (action === 'narrow') return '缩小范围'
  if (action === 'split') return '已拆分'
  if (action === 'downgrade') return '降为 SHOULD'
  return '取消'
}

export function classifyReason(
  code?: ReasonCode,
): 'execution' | 'planning' | 'external' | 'move' {
  if (!code) return 'move'
  if (code === 'plan_overridden') return 'planning'
  if (code === 'split') return 'move'
  if (code === 'willful_breach') return 'execution'
  return CANCEL_REASONS.find((item) => item.id === code)?.group ?? 'move'
}
