import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { Meter } from '../components/ui/Meter'
import { Kicker, cx } from '../components/ui/primitives'
import { db } from '../db/db'
import {
  desireAlignment,
  finalReasonCounts,
  mustRateByDay,
  mustRateRange,
  percent,
  plannedVsActual,
  weekRange,
} from '../domain/analytics'
import { CANCEL_REASONS } from '../domain/review'
import { useLocalDate } from '../hooks/useLocalDate'

export function AnalyticsPage() {
  const today = useLocalDate()
  const { from, to } = weekRange(today)
  const tasks = useLiveQuery(() => db.tasks.toArray())
  const plans = useLiveQuery(() => db.dailyPlans.toArray()) ?? []
  const sessions = useLiveQuery(() => db.workSessions.toArray()) ?? []
  const reviews = useLiveQuery(() => db.dailyReviews.toArray()) ?? []
  const desires = useLiveQuery(() => db.desires.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []

  const loading = tasks === undefined
  const allTasks = tasks ?? []
  const days = mustRateByDay(plans, allTasks, today, 7)
  const week = mustRateRange(days)
  const time = plannedVsActual({ plans, sessions, from, to })
  const reasons = finalReasonCounts(reviews, from, to)
  const reasonTotal = [...reasons.values()].reduce((sum, count) => sum + count, 0)
  const desireRows = desireAlignment({
    tasks: allTasks,
    plans,
    sessions,
    reviews,
    goals,
    desires,
    from,
    to,
  })
  const hasData = plans.some((plan) => plan.lockedAt && plan.date >= from && plan.date <= to) ||
    time.actual > 0 || reasonTotal > 0

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0">
        <header className="rise">
          <Kicker>Analytics</Kicker>
          <h1 className="mt-3 font-display text-[3rem] leading-[1.05] sm:text-[3.5rem]">
            分析
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-mute">
            只看记录。近七天确认的 MUST 完成了多少、计划与实际相差多少、未完成的最终原因是什么，以及行动关联了哪些欲望。
          </p>
        </header>

        {loading ? null : !hasData ? (
          <div className="mt-10">
            <EmptyState
              kicker="还没有账"
              title="还没有可分析的记录"
              body="确认计划、记录实际分钟或日结后，这里才会显示数值。"
              action={
                <Link to="/" className="text-[14px] text-copper underline-offset-4 hover:underline">
                  回到今日 →
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-12 space-y-14">
            <section className="rise">
              <Kicker>MUST 完成率</Kicker>
              <p className="mt-3 font-display text-[3rem] leading-none tabular text-ink">
                {percent(week.rate)}
              </p>
              <p className="mt-2 font-mono text-[12px] text-mute tabular">
                近七天 {week.done}/{week.total}
              </p>
              <ol className="mt-6 grid grid-cols-7 gap-2">
                {days.map((day) => (
                  <li key={day.date} className="text-center">
                    <div
                      className="mx-auto flex h-16 w-full max-w-[2.2rem] items-end rounded-sm bg-line/70"
                      title={`${day.date} ${day.done}/${day.total}`}
                    >
                      <div
                        className={cx(
                          'w-full rounded-sm',
                          day.rate == null ? 'bg-transparent' : day.rate === 1 ? 'bg-moss' : 'bg-ink',
                        )}
                        style={{ height: `${Math.round((day.rate ?? 0) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-[10px] text-faint">{day.date.slice(8)}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rise" style={{ ['--i' as string]: 1 }}>
              <Kicker>计划 vs 实际</Kicker>
              <dl className="mt-4 grid grid-cols-3 gap-4 font-mono text-[12px] tabular">
                <Stat label="计划" value={`${time.planned} min`} />
                <Stat label="实际" value={`${time.actual} min`} />
                <Stat
                  label="偏差"
                  value={`${time.bias >= 0 ? '+' : ''}${time.bias} min`}
                  alert={time.bias < 0}
                />
              </dl>
              <Meter
                className="mt-4"
                value={time.actual}
                max={Math.max(time.planned, time.actual, 1)}
                label="实际相对计划"
              />
              <p className="mt-3 text-[14px] leading-6 text-mute">
                {time.planned === 0
                  ? '这周还没有计划分钟。'
                  : time.bias < 0
                    ? `实际比计划少 ${-time.bias} 分钟。具体原因请对照当日复盘。`
                    : time.bias > 0
                      ? `实际比计划多 ${time.bias} 分钟。具体原因请对照当日复盘。`
                      : '计划和实际对齐。'}
              </p>
            </section>

            <section className="rise" style={{ ['--i' as string]: 2 }}>
              <Kicker>未完成原因</Kicker>
              {reasonTotal === 0 ? (
                <p className="mt-4 text-[15px] leading-7 text-mute">
                  还没有最终结案原因。未完成的 MUST 在复盘里选择事实原因和去向后，这里才会计数。
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {CANCEL_REASONS.map((reason) => (
                    <ReasonRow
                      key={reason.id}
                      label={reason.label}
                      hint={reason.hint}
                      value={reasons.get(reason.id) ?? 0}
                      total={reasonTotal}
                    />
                  ))}
                  {(reasons.get('willful_breach') ?? 0) > 0 ? (
                    <ReasonRow label="主动未执行（旧记录）" hint="旧版记录" value={reasons.get('willful_breach') ?? 0} total={reasonTotal} />
                  ) : null}
                </ul>
              )}
            </section>

            <section className="rise" style={{ ['--i' as string]: 3 }}>
              <Kicker>方向投入</Kicker>
              <p className="mt-3 text-[14px] leading-6 text-mute">
                每个欲望分别显示关联行动和投入；一项行动关联多个欲望时会在多行出现，这些行不能相加。总实际时间按唯一闭合计时记录计算。
              </p>
              {desireRows.length === 0 ? (
                <p className="mt-4 text-[15px] leading-7 text-mute">
                  还没有关联到欲望的行动。任务可以直接勾选多个欲望，不需要先建立目标。
                </p>
              ) : (
                <ol className="mt-5 space-y-3">
                  {desireRows.map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-4">
                      <p className={row.kind === 'unaligned' ? 'text-mute' : 'text-ink'}>
                        {row.title}
                      </p>
                      <p className="font-mono text-[12px] tabular text-mute">
                        {row.actionCount} 项 · {row.minutes} min · {row.unfinishedCount} 未完成
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
        <div className="mt-12 border-t border-line pt-5 text-[12px] leading-6 text-mute">
          <Kicker>统计口径</Kicker>
          <p className="mt-2">MUST 分母：当日确认计划的 MUST 和明确记录的新增修订；延期、取消、降级仍留在原日分母。</p>
          <p>实际分钟：按本机日历日期分配闭合的 WorkSession，每条只计一次；手填完成使用手填分钟。</p>
          <p>未完成原因：每项任务在某日的最终复盘结果，更正历史不重复计数。</p>
          <p>欲望关联：每个欲望单独显示关联行动，跨欲望数字不可相加；总时间按唯一计时记录计算。</p>
        </div>
      </section>

      <aside className="mt-14 lg:mt-0 lg:sticky lg:top-12 lg:self-start">
        <div className="rise border-l border-line pl-8" style={{ ['--i' as string]: 2 }}>
          <Kicker>窗口</Kicker>
          <p className="mt-3 font-mono text-[12px] tabular text-mute">
            {from} → {to}
          </p>
          <p className="mt-4 text-[14px] leading-6 text-mute">
            不做人生总分。这些数字只回答：这周有没有把 MUST 做完，时间有没有花在你说重要的地方。
          </p>
          <Link
            to="/review"
            className="mt-5 inline-block text-[13px] text-copper underline-offset-4 hover:underline"
          >
            去复盘看原因 →
          </Link>
          <Link
            to="/"
            className="mt-3 block text-[13px] text-copper underline-offset-4 hover:underline"
          >
            回今日安排下一次行动 →
          </Link>
        </div>
      </aside>
    </div>
  )
}

function Stat({
  label,
  value,
  alert,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div>
      <dt className="tracking-[0.18em] text-mute">{label}</dt>
      <dd className={cx('mt-1 text-[15px] text-ink', alert && 'text-copper')}>{value}</dd>
    </div>
  )
}

function ReasonRow({
  label,
  hint,
  value,
  total,
}: {
  label: string
  hint: string
  value: number
  total: number
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[15px] text-ink">{label}</p>
          <p className="text-[12px] text-faint">{hint}</p>
        </div>
        <p className="font-mono text-[12px] tabular text-mute">
          {value}
          {total > 0 ? ` · ${Math.round((value / total) * 100)}%` : ''}
        </p>
      </div>
      <Meter className="mt-2" thin value={value} max={Math.max(total, 1)} label={label} />
    </li>
  )
}
