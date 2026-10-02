import { closedSessionMinutes, sessionMinutesByLocalDate } from './analytics.ts'
import { datesBetween, isValidDateKey, parseDateKey, shiftDate, todayKey } from './clock.ts'
import type { BackupPayload } from './types.ts'

export type Evidence = { id: string; kind: 'plan' | 'session' | 'event' | 'review' | 'external'; date: string; label: string; taskId?: string }
export type Finding = { id: string; title: string; fact: string; suggestion: string; evidenceIds: string[] }
export type GrowthReport = {
  id: string; engineVersion: 1; generatedAt: string; sourceSavedAt: string; sourceRevision: string
  from: string; to: string; timeZone: string; days: number
  metrics: { recordedDays: number; confirmedMusts: number; completedByEnd: number; recordedMinutes: number; closedReviews: number }
  evidence: Evidence[]; findings: Finding[]; limitations: string[]; externalItems: ExternalItem[]
}
export type ProposalFeedback = { reportId: string; findingId: string; status: 'accepted' | 'dismissed' | 'done'; note: string; updatedAt: string }
export type AgentResult = { id: string; reportId: string; author: string; createdAt: string; observations: { text: string; evidenceIds: string[] }[]; questions: string[] }
export type ExternalItem = { id: string; source: 'notion' | 'google-calendar'; kind: 'task' | 'event'; title: string; updatedAt: string; status?: 'open' | 'completed'; dueDate?: string; start?: string; end?: string; allDay?: boolean }
export type GrowthState = {
  version: 1; revision: number; reports: GrowthReport[]; feedback: ProposalFeedback[]; agentResults: AgentResult[]
  schedule: { enabled: boolean; time: string; lastRunDate: string | null; lastError: string | null }
  externalItems: ExternalItem[]; imports: { source: string; importedAt: string; count: number }[]
}

/** Pure facts only. No inferred personality, motivation or calendar completion. */
export function analyzeGrowth(input: BackupPayload, to: string, days = 7, now = new Date(), externalItems: ExternalItem[] = []): Omit<GrowthReport, 'id' | 'sourceRevision'> {
  if (!isValidDateKey(to) || to > todayKey(now) || ![1, 7, 30].includes(days)) throw new Error('日期或复盘周期无效')
  const from = shiftDate(to, 1 - days)
  const range = new Set(datesBetween(from, to))
  const evidence: Evidence[] = []
  const findings: Finding[] = []
  const tasks = new Map(input.tasks.map(task => [task.id, task]))
  const plans = input.dailyPlans.filter(plan => range.has(plan.date) && plan.lockedAt)
  let confirmedMusts = 0
  let completedByEnd = 0
  const overloaded: string[] = []
  const missingReviews: string[] = []
  const reviews = input.dailyReviews ?? []
  for (const plan of plans) {
    const snapshots = [...new Map([...(plan.confirmedMusts ?? []), ...(plan.amendments ?? []).map(a => a.task)].map(s => [s.taskId, s])).values()]
    const minutes = snapshots.reduce((sum, s) => sum + s.plannedMinutes, 0)
    const id = `plan:${plan.date}`
    evidence.push({ id, kind: 'plan', date: plan.date, label: `${plan.date}：确认 ${snapshots.length} 项 MUST，${minutes} 分钟；容量 ${plan.capacityMinutes} 分钟` })
    confirmedMusts += snapshots.length
    completedByEnd += snapshots.filter(s => {
      const task = tasks.get(s.taskId)
      const completedAt = task?.completedAt
      return task?.status === 'completed' && completedAt && todayKey(new Date(completedAt)) <= to
    }).length
    if (minutes > plan.capacityMinutes) overloaded.push(id)
    if (plan.date < todayKey(now) && !reviews.some(review => review.date === plan.date && review.closedAt)) missingReviews.push(id)
  }
  const sessions = [...new Map(input.workSessions.map(s => [s.id, s])).values()]
  for (const session of sessions) {
    const inRange = [...sessionMinutesByLocalDate(session)].filter(([date]) => range.has(date))
    if (!inRange.length) continue
    for (const [date, minutes] of inRange) evidence.push({ id: `session:${session.id}:${date}`, kind: 'session', date, taskId: session.taskId,
      label: `${date} · ${tasks.get(session.taskId)?.title ?? '原任务已不存在'}：记录 ${Math.round(minutes)} 分钟` })
  }
  const deferrals = new Map<string, string[]>()
  for (const event of [...new Map(input.taskEvents.map(e => [e.id, e])).values()]) {
    if (!range.has(todayKey(new Date(event.createdAt)))) continue
    const id = `event:${event.id}`
    evidence.push({ id, kind: 'event', date: todayKey(new Date(event.createdAt)), taskId: event.taskId,
      label: `${tasks.get(event.taskId)?.title ?? '原任务已不存在'}：${event.type === 'deferred' ? '延期' : event.type === 'completed' ? '完成' : '任务变更'}记录` })
    if (event.type === 'deferred') deferrals.set(event.taskId, [...(deferrals.get(event.taskId) ?? []), id])
  }
  for (const review of reviews.filter(r => range.has(r.date) && r.closedAt)) {
    evidence.push({ id: `review:${review.date}`, kind: 'review', date: review.date, label: `${review.date}：已完成日结，${review.entries.length} 项处置说明` })
  }
  if (overloaded.length) findings.push({ id: 'capacity', title: '给计划留出余量', fact: `${overloaded.length} 天确认的 MUST 估时超过当天设定容量。`, suggestion: '下次确认计划前，检查可用时间；必要时减少一项 MUST。', evidenceIds: overloaded })
  for (const [taskId, ids] of deferrals) {
    if (ids.length < 2 || ['completed', 'cancelled'].includes(tasks.get(taskId)?.status ?? '')) continue
    findings.push({ id: `defer:${taskId}`, title: '检查反复推迟的任务', fact: `「${tasks.get(taskId)?.title ?? '原任务'}」在本期有 ${ids.length} 次延期记录。`, suggestion: '确认这项任务是否仍重要；若重要，为它写下一个可直接开始的小步骤。', evidenceIds: ids })
  }
  if (missingReviews.length) findings.push({ id: 'review-gap', title: '补齐日结记录', fact: `${missingReviews.length} 天已有确认计划，但还没有完成日结。`, suggestion: '回到对应日期说明任务去向，避免后续复盘把缺失记录当成未执行。', evidenceIds: missingReviews })
  const recordedDays = new Set(evidence.map(e => e.date)).size
  const external = externalItems.filter(item => item.kind === 'task'
    ? Boolean(item.dueDate && range.has(item.dueDate))
    : item.allDay ? item.start! <= to && item.end! > from
      : Date.parse(item.start!) < parseDateKey(shiftDate(to, 1)).getTime() && Date.parse(item.end!) > parseDateKey(from).getTime())
  for (const item of external) {
    const date = item.dueDate ?? (item.allDay ? item.start! : todayKey(new Date(item.start!)))
    evidence.push({ id: `external:${item.source}:${item.id}`, kind: 'external', date,
      label: `${item.source} · ${item.title} · ${item.kind === 'task' ? `截止 ${item.dueDate}，来源状态 ${item.status}` : `${item.start} 至 ${item.end}`} · 导入快照更新时间 ${item.updatedAt}` })
  }
  const conflicts = calendarConflicts(external)
  if (conflicts.length) findings.push({ id: 'calendar-overlap', title: '核对重叠行程', fact: `已导入的本期日历有${conflicts.length === 200 ? '至少' : ''} ${conflicts.length} 组时间重叠（最多列出 200 组）。`, suggestion: '核实这些时间是否确实冲突；日程结束不代表任务已完成。', evidenceIds: [...new Set(conflicts.flatMap(c => [c.left, c.right]))].map(id => `external:google-calendar:${id}`) })
  return {
    engineVersion: 1, generatedAt: now.toISOString(), sourceSavedAt: input.exportedAt,
    from, to, days, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    metrics: { recordedDays, confirmedMusts, completedByEnd, recordedMinutes: Math.round(closedSessionMinutes(sessions, from, to)), closedReviews: evidence.filter(e => e.kind === 'review').length },
    evidence, findings, externalItems: external,
    limitations: [
      `本期 ${days} 天中有 ${recordedDays} 天可用记录。没有记录不代表没有行动。`,
      '完成数表示本期确认的 MUST 中，截至结束日期有完成时间且当前仍为完成状态的项数，不是按期完成率。同一任务在不同日确认按计划次数计。',
      '投入仅统计已结束的计时记录，跨午夜按本机时区分摊；不据此推断所有实际工作时间。',
      '报告基于生成时保存的快照，后续更正需重新生成；外部任务和日历不计入完成数。',
      'Notion 与 Google 日历仅使用已导入快照，可能过时；Agent 可结合这些证据分析，不能据此推断任务实际执行。',
    ],
  }
}

export function calendarConflicts(items: ExternalItem[]): { left: string; right: string }[] {
  const events = items.filter(i => i.kind === 'event' && !i.allDay && i.start && i.end).sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!))
  const result: { left: string; right: string }[] = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length && Date.parse(events[j].start!) < Date.parse(events[i].end!); j++) {
      result.push({ left: events[i].id, right: events[j].id })
      if (result.length === 200) return result
    }
  }
  return result
}
