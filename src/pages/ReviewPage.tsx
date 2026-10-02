import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Chain } from '../components/ui/Chain'
import { EmptyState } from '../components/ui/EmptyState'
import { Button, Kicker, cx } from '../components/ui/primitives'
import { Spine, SpineNode } from '../components/ui/Spine'
import { ExitDialog } from '../components/ExitDialog'
import { db } from '../db/db'
import { closeDailyReview, correctReviewDisposition, correctReviewReason, settleMust, splitMust } from '../db/review'
import { whyPathFor } from '../domain/alignment'
import { closedMinutesForTask } from '../domain/analytics'
import { formatDisplayDate, isValidDateKey, shiftDate } from '../domain/clock'
import { desiresForTask } from '../domain/desireLinks'
import { useLocalDate } from '../hooks/useLocalDate'
import {
  CANCEL_REASONS,
  actionLabel,
  mustStats,
  openMusts,
  reasonLabel,
} from '../domain/review'
import type { ReasonCode, ReviewEntry, Task } from '../domain/types'

const EMPTY_TASKS: Task[] = []

export function ReviewPage() {
  const today = useLocalDate()
  const yesterday = shiftDate(today, -1)
  const [searchParams] = useSearchParams()
  const requestedDate = searchParams.get('date')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [exitTask, setExitTask] = useState<Task | null>(null)
  const [correctingTask, setCorrectingTask] = useState<Task | null>(null)
  const [error, setError] = useState('')

  const allTasks = useLiveQuery(() => db.tasks.toArray())
  const sessions = useLiveQuery(() => db.workSessions.toArray()) ?? []
  const desires = useLiveQuery(() => db.desires.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const commitments = useLiveQuery(() => db.commitments.toArray()) ?? []

  const tasks = allTasks ?? EMPTY_TASKS
  const overdueDates = useMemo(() => [...new Set(
      tasks
        .filter((task) => task.plannedDate && task.plannedDate < today && task.priorityBand === 'must')
        .filter((task) => openMusts([task], task.plannedDate!).length > 0)
        .map((task) => task.plannedDate!),
    )].sort(), [tasks, today])
  const overdueOpen = tasks.filter(
    (task) => task.plannedDate && task.plannedDate < today && openMusts([task], task.plannedDate).length > 0,
  ).length
  const validRequestedDate = requestedDate && isValidDateKey(requestedDate) && requestedDate <= today
    ? requestedDate : null
  const date = selectedDate ?? validRequestedDate ?? overdueDates.at(-1) ?? today
  const review = useLiveQuery(() => db.dailyReviews.get(date), [date])
  const plan = useLiveQuery(() => db.dailyPlans.get(date), [date])

  const open = openMusts(tasks, date)
  const stats = mustStats(tasks, date)
  const entries = review?.entries ?? []
  const plannedMusts = [...(plan?.confirmedMusts ?? []), ...(plan?.amendments ?? []).map((item) => item.task)]
  const closed = stats.open === 0 && Boolean(review?.closedAt)
  const isToday = date === today
  const isYesterday = date === yesterday

  const recentDates = useMemo(() => {
    const keys = new Set<string>()
    for (const task of tasks) {
      if (task.plannedDate && task.plannedDate <= today && task.priorityBand === 'must') keys.add(task.plannedDate)
    }
    for (let i = 0; i < 7; i += 1) keys.add(shiftDate(today, -i))
    return [...keys].sort().reverse().slice(0, 10)
  }, [tasks, today])

  let nodeIndex = 0

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0">
        <header className="rise">
          <Link to="/analytics" className="mb-4 inline-flex text-sm text-copper underline underline-offset-4">查看程序复盘与成长建议 →</Link>
          <Kicker>Review</Kicker>
          <h1 className="mt-3 font-display text-[3rem] leading-[1.05] sm:text-[3.5rem]">
            复盘
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-mute">
            未完成的 MUST 必须关账。选一个事实原因，系统不评价你。
          </p>
        </header>

        <div className="rise mt-8 flex items-center justify-between gap-3 border-y border-line py-3" style={{ ['--i' as string]: 1 }}>
          <Button
            variant="quiet"
            size="sm"
            aria-label="前一天"
            onClick={() => setSelectedDate(shiftDate(date, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
            前一天
          </Button>
          <div className="text-center">
            <p className="font-mono text-[12px] tracking-[0.18em] text-ink">{date}</p>
            <p className="mt-0.5 text-[13px] text-mute">
              {formatDisplayDate(date)}
              {isToday ? ' · 今天' : isYesterday ? ' · 昨天' : ''}
            </p>
          </div>
          <Button
            variant="quiet"
            size="sm"
            aria-label="后一天"
            disabled={date >= today}
            onClick={() => setSelectedDate(shiftDate(date, 1))}
          >
            后一天
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        {error ? <p role="alert" className="mt-5 text-sm text-copper">{error}</p> : null}
        <section className="mt-8 border-y border-line py-5">
          <Kicker>当日确认的 MUST</Kicker>
          {plan?.lockedAt ? (
            <>
              <p className="mt-2 text-[13px] text-mute">
                确认于 {new Date(plan.lockedAt).toLocaleString()} · {plannedMusts.length} 项 ·
                计划 {plannedMusts.reduce((sum, item) => sum + item.plannedMinutes, 0)} 分钟
              </p>
              {plannedMusts.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {plannedMusts.map((snapshot) => {
                    const task = tasks.find((item) => item.id === snapshot.taskId)
                    return (
                      <li key={snapshot.taskId} className="flex flex-wrap justify-between gap-2 text-[13px]">
                        <span>{snapshot.title} · {task?.status === 'completed' ? '已完成' : entries.some((item) => item.taskId === snapshot.taskId) ? '已说明去向' : '未处理'}</span>
                        <span className="font-mono text-mute">
                          计划 {snapshot.plannedMinutes} · 实际 {closedMinutesForTask(snapshot.taskId, sessions)} 分钟
                        </span>
                      </li>
                    )
                  })}
                </ol>
              ) : <p className="mt-3 text-sm text-mute">确认时没有 MUST。</p>}
            </>
          ) : <p className="mt-3 text-sm text-mute">这一天尚未确认计划；MUST 完成率不会计入分母。</p>}
        </section>

        {allTasks === undefined ? null : open.length > 0 ? (
          <Spine className="mt-10">
            {open.map((task) => {
              const goal = goals.find((item) => item.id === task.primaryGoalId)
              const desire = desires.find((item) => item.id === goal?.primaryDesireId)
              const commitment = commitments.find((item) => item.id === task.primaryCommitmentId)
              const linkedDesires = desiresForTask(task, goals, desires, true)
              const busy = busyId === task.id
              return (
                <SpineNode key={task.id} tone="must" index={nodeIndex++} className="not-first:mt-8">
                  <p className="text-[16px] font-medium leading-7 text-ink">{task.title}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-mute tabular">
                    {task.plannedMinutes} min
                    {task.status === 'in_progress' ? ' · 进行中，关账会先停表' : ''}
                  </p>
                  <Chain path={whyPathFor(goal, desire, commitment)} className="mt-1.5" />
                  <p className="mt-1 text-[12px] leading-5 text-mute">
                    {linkedDesires.length > 0
                      ? `关联欲望：${linkedDesires.map((item) => item.active ? item.title : `${item.title}（已停用）`).join(' · ')}`
                      : '尚未关联欲望'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="solid"
                      size="sm"
                      disabled={busy}
                      onClick={() => setExitTask(task)}
                    >
                      选择原因和去向
                    </Button>
                  </div>
                </SpineNode>
              )
            })}
          </Spine>
        ) : closed ? (
          <div className="mt-10">
            <EmptyState
              kicker="已关账"
              title={`${formatDisplayDate(date)} 已经关上`}
              body="未完成的 MUST 都有了原因。失败写进账本，明天仍然可以重新排。"
              action={
                <Link to="/" className="text-[14px] text-copper underline-offset-4 hover:underline">
                  回到今日 →
                </Link>
              }
            />
          </div>
        ) : entries.length > 0 ? (
          <div className="mt-10">
            <EmptyState
              kicker="待日结"
              title="未完成的 MUST 已说明去向"
              body="核对当日记录后，点击下方确认日结。原计划未完成的事实会保留。"
            />
          </div>
        ) : stats.done > 0 || stats.total > 0 ? (
          <div className="mt-10">
            <EmptyState
              kicker="无需归因"
              title="这一天的 MUST 都做完了"
              body="没有未完成需要关账。复盘只处理逃掉的 MUST，完成的事已经算数。"
              action={
                <Link to="/" className="text-[14px] text-copper underline-offset-4 hover:underline">
                  回到今日 →
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-10">
            <EmptyState
              kicker="空白的一天"
              title="这一天没有 MUST"
              body="没有写下不可撤回的事，也就没有需要关账的偏差。"
              action={
                date === today ? (
                  <Link to="/" className="text-[14px] text-copper underline-offset-4 hover:underline">
                    去写下今天的 MUST →
                  </Link>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today)}>
                    看今天
                  </Button>
                )
              }
            />
          </div>
        )}
        {plan?.lockedAt && !closed && open.length === 0 ? (
          <Button
            variant="solid"
            className="mt-7 scroll-mb-28"
            onClick={() => {
              setError('')
              void closeDailyReview(date).catch((cause) =>
                setError(cause instanceof Error ? cause.message : '日结失败'))
            }}
          >
            确认日结
          </Button>
        ) : null}
        {entries.length > 0 ? (
          <Ledger
            entries={entries}
            onCorrect={(taskId, reasonCode) => correctReviewReason({ date, taskId, reasonCode })}
            onCorrectDisposition={(taskId) => {
              const task = tasks.find((item) => item.id === taskId)
              if (task) setCorrectingTask(task)
            }}
          />
        ) : null}
        {(review?.history?.length ?? 0) > 0 ? (
          <details className="mt-6 border-t border-line pt-4">
            <summary className="cursor-pointer text-sm text-mute">查看结案及更正历史（{review?.history?.length} 条）</summary>
            <ol className="mt-3 space-y-2 text-xs text-mute">
              {review?.history?.map((change) => (
                <li key={change.id}>
                  {new Date(change.changedAt).toLocaleString()} · {change.after.title} ·
                  {change.before ? ` 原因从「${reasonLabel(change.before.reasonCode)}」更正为「${reasonLabel(change.after.reasonCode)}」` : ` ${actionLabel(change.after.action)}，原因：${reasonLabel(change.after.reasonCode)}`}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </section>

      <ExitDialog
        key={exitTask?.id ?? 'review-exit'}
        task={exitTask}
        date={date}
        splitTargetDate={date < today ? today : shiftDate(date, 1)}
        narrowTargetDate={date < today ? today : shiftDate(date, 1)}
        open={exitTask !== null}
        onClose={() => setExitTask(null)}
        onSettle={async (input) => {
          if (!exitTask) return
          setBusyId(exitTask.id)
          try {
            await settleMust({
              task: exitTask,
              date,
              action: input.action,
              reasonCode: input.reasonCode,
              nextDate: input.nextDate,
              narrowTitle: input.narrowTitle,
              narrowMinutes: input.narrowMinutes,
            })
          } finally {
            setBusyId(null)
          }
        }}
        onSplit={async ({ parts, reasonCode }) => {
          if (!exitTask) return
          setBusyId(exitTask.id)
          try {
            await splitMust({
              task: exitTask,
              date,
              parts,
              reasonCode,
              targetDate: date < today ? today : shiftDate(date, 1),
            })
          } finally {
            setBusyId(null)
          }
        }}
      />

      <ExitDialog
        key={correctingTask?.id ? `correct-${correctingTask.id}` : 'correct-review'}
        task={correctingTask}
        date={date}
        splitTargetDate={date < today ? today : shiftDate(date, 1)}
        narrowTargetDate={date < today ? today : shiftDate(date, 1)}
        open={correctingTask !== null}
        correcting
        onClose={() => setCorrectingTask(null)}
        onSettle={async (input) => {
          if (!correctingTask) return
          await correctReviewDisposition({
            date, taskId: correctingTask.id, action: input.action,
            reasonCode: input.reasonCode, nextDate: input.nextDate,
            narrowTitle: input.narrowTitle, narrowMinutes: input.narrowMinutes,
          })
        }}
        onSplit={async ({ parts, reasonCode }) => {
          if (!correctingTask) return
          await correctReviewDisposition({
            date, taskId: correctingTask.id, action: 'split', reasonCode, parts,
          })
        }}
      />

      <aside className="mt-14 lg:mt-0 lg:sticky lg:top-12 lg:self-start">
        <div className="rise border-l border-line pl-8" style={{ ['--i' as string]: 2 }}>
          <Kicker>这一天</Kicker>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[12px] tabular">
            <Row label="待关账" value={stats.open} alert={stats.open > 0} />
            <Row label="已完成" value={stats.done} />
            <Row label="已取消" value={stats.cancelled} />
            <Row label="已记录" value={entries.length} />
          </dl>
          <p className="mt-4 text-[13px] leading-6 text-mute">
            {stats.open > 0
              ? `还剩 ${stats.open} 件 MUST 没有原因。关完才算这一天结束。`
              : closed
                ? '账已关上。'
                : '没有未完成的 MUST。'}
          </p>
        </div>

        {overdueOpen > 0 && !overdueDates.includes(date) ? (
          <div className="rise mt-10 border-l border-copper/40 pl-8" style={{ ['--i' as string]: 3 }}>
            <Kicker tone="copper">过往未关</Kicker>
            <p className="mt-3 text-[14px] leading-6 text-ink">
              过去日期还有 {overdueOpen} 件 MUST 停在账上。
            </p>
            <button
              type="button"
              className="mt-3 text-[13px] text-copper underline-offset-4 hover:underline"
              onClick={() => setSelectedDate(overdueDates.at(-1) ?? yesterday)}
            >
              先关昨天 →
            </button>
          </div>
        ) : null}

        <div className="rise mt-10 border-l border-line pl-8" style={{ ['--i' as string]: 4 }}>
          <Kicker>近期</Kicker>
          <ul className="mt-3 space-y-1">
            {recentDates.map((key) => {
              const count = openMusts(tasks, key).length
              const active = key === date
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(key)}
                    className={cx(
                      'flex w-full items-baseline justify-between gap-3 rounded-md py-1.5 text-left text-[13px] transition-colors',
                      active ? 'text-ink' : 'text-mute hover:text-ink',
                    )}
                  >
                    <span>
                      {key === today ? '今天' : key === yesterday ? '昨天' : monthShort(key)}
                    </span>
                    <span className={cx('font-mono text-[11px] tabular', count > 0 ? 'text-copper' : 'text-faint')}>
                      {count > 0 ? `${count} 未关` : '—'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
    </div>
  )
}

function monthShort(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${Number(month)}/${Number(day)}`
}

function Row({
  label,
  value,
  alert,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  const dim = value === 0 && !alert
  return (
    <>
      <dt className={cx('tracking-[0.18em]', alert ? 'text-copper' : dim ? 'text-faint' : 'text-mute')}>
        {label}
      </dt>
      <dd className={cx('text-right', alert ? 'text-copper' : dim ? 'text-faint' : 'text-ink')}>
        {value}
      </dd>
    </>
  )
}

function Ledger({
  entries,
  onCorrect,
  onCorrectDisposition,
}: {
  entries: ReviewEntry[]
  onCorrect: (taskId: string, reasonCode: ReasonCode) => Promise<void>
  onCorrectDisposition: (taskId: string) => void
}) {
  return (
    <ol className="mt-8 space-y-3 border-t border-line pt-6">
      {entries.map((entry) => (
        <LedgerRow key={entry.taskId} entry={entry} onCorrect={onCorrect} onCorrectDisposition={onCorrectDisposition} />
      ))}
    </ol>
  )
}

function LedgerRow({
  entry,
  onCorrect,
  onCorrectDisposition,
}: {
  entry: ReviewEntry
  onCorrect: (taskId: string, reasonCode: ReasonCode) => Promise<void>
  onCorrectDisposition: (taskId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState<ReasonCode>(entry.reasonCode ?? 'plan_error')
  const [busy, setBusy] = useState(false)
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div>
        <p className="text-[15px] leading-6 text-ink">{entry.title}</p>
        {entry.snapshot?.desireTitles.length ? (
          <p className="text-[12px] text-mute">当时关联：{entry.snapshot.desireTitles.join(' · ')}</p>
        ) : null}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <select
            value={reason}
            disabled={busy}
            className="rounded-md border border-line bg-paper px-2 py-1.5 text-[12px] text-ink"
            onChange={(event) => setReason(event.target.value as ReasonCode)}
          >
            {CANCEL_REASONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <Button
            size="sm"
            variant="solid"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onCorrect(entry.taskId, reason).then(() => setEditing(false)).finally(() => setBusy(false))
            }}
          >
            保存更正
          </Button>
        </div>
      ) : (
        <p className="font-mono text-[11px] tracking-[0.12em] text-mute">
          {actionLabel(entry.action)} · {reasonLabel(entry.reasonCode)}
          <button className="ml-2 text-copper hover:underline" type="button" onClick={() => setEditing(true)}>
            更正原因
          </button>
          <button className="ml-2 text-copper hover:underline" type="button" onClick={() => onCorrectDisposition(entry.taskId)}>
            更正去向
          </button>
        </p>
      )}
    </li>
  )
}
