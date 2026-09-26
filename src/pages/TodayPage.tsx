import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Play, Plus, Square } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { Chain } from '../components/ui/Chain'
import { Dialog } from '../components/ui/Dialog'
import { Meter } from '../components/ui/Meter'
import { Button, Input, Kicker, Segmented, cx } from '../components/ui/primitives'
import { Spine, SpineNode } from '../components/ui/Spine'
import { finishTask, startTask } from '../application/taskCommands'
import { db, ensureDailyPlan, newId } from '../db/db'
import {
  importanceScore,
  suggestAlignment,
  whyPathFor,
} from '../domain/alignment'
import { todayKey } from '../domain/clock'
import type { Commitment, Desire, Goal, PriorityBand, Task } from '../domain/types'
import { useMediaQuery } from '../hooks/useMediaQuery'

const EMPTY_DESIRES: Desire[] = []
const EMPTY_GOALS: Goal[] = []
const EMPTY_COMMITMENTS: Commitment[] = []

const BANDS: { id: PriorityBand; label: string; hint: string }[] = [
  { id: 'must', label: 'MUST', hint: '今天不能悄悄消失' },
  { id: 'should', label: 'SHOULD', hint: '做了会更好' },
  { id: 'optional', label: 'OPTIONAL', hint: '有余力再做' },
]

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const MONTHS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]

export function TodayPage() {
  const date = todayKey()
  const now = new Date()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(90)
  const [band, setBand] = useState<PriorityBand>('must')
  const [plannedStart, setPlannedStart] = useState('')
  const [capacityDraft, setCapacityDraft] = useState(240)
  const [completeTask, setCompleteTask] = useState<Task | null>(null)
  const [manualMinutes, setManualMinutes] = useState(0)
  const [goalId, setGoalId] = useState('')
  const [commitmentId, setCommitmentId] = useState('')
  const [manualAlign, setManualAlign] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)

  const plan = useLiveQuery(() => db.dailyPlans.get(date), [date])
  const tasks = useLiveQuery(
    () => db.tasks.where('plannedDate').equals(date).toArray(),
    [date],
  )
  const sessions = useLiveQuery(() => db.workSessions.toArray(), [])
  const desires = useLiveQuery(() => db.desires.toArray(), []) ?? EMPTY_DESIRES
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? EMPTY_GOALS
  const commitments = useLiveQuery(() => db.commitments.toArray(), []) ?? EMPTY_COMMITMENTS

  useEffect(() => {
    void ensureDailyPlan(date)
  }, [date])

  useEffect(() => {
    if (plan) setCapacityDraft(plan.capacityMinutes)
  }, [plan])

  const openSessions = useMemo(() => {
    const map = new Map<string, string>()
    for (const session of sessions ?? []) {
      if (!session.endedAt) map.set(session.taskId, session.id)
    }
    return map
  }, [sessions])

  const suggestion = useMemo(
    () => suggestAlignment(title, goals, desires, commitments),
    [title, goals, desires, commitments],
  )

  useEffect(() => {
    if (manualAlign) return
    setGoalId(suggestion.goalId ?? '')
    setCommitmentId(suggestion.commitmentId ?? '')
  }, [suggestion, manualAlign])

  const alignedPath = useMemo(() => {
    const goal = goals.find((item) => item.id === goalId)
    const desire = desires.find((item) => item.id === goal?.primaryDesireId)
    const commitment = commitments.find((item) => item.id === commitmentId)
    return whyPathFor(goal, desire, commitment)
  }, [goalId, commitmentId, goals, desires, commitments])

  const loading = tasks === undefined
  const visibleTasks = (tasks ?? []).filter((task) => task.status !== 'cancelled')

  function contextOf(task: Task) {
    const goal = goals.find((item) => item.id === task.primaryGoalId)
    const desire = desires.find((item) => item.id === goal?.primaryDesireId)
    const commitment = commitments.find((item) => item.id === task.primaryCommitmentId)
    return { goal, desire, commitment }
  }
  function rankTask(task: Task): number {
    const { desire, commitment } = contextOf(task)
    return importanceScore(task.priorityBand, desire, commitment)
  }

  const mustTasks = visibleTasks.filter((task) => task.priorityBand === 'must')
  const plannedMust = mustTasks.reduce((sum, task) => sum + task.plannedMinutes, 0)
  const doneMust = mustTasks.filter((task) => task.status === 'completed').length
  const minutesToMidnight = Math.max(
    0,
    Math.floor(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).getTime() -
        now.getTime()) /
        60_000,
    ),
  )
  const remaining = Math.min(capacityDraft - plannedMust, minutesToMidnight)
  const runningTask = visibleTasks.find((task) => task.status === 'in_progress')
  const alignedCount = visibleTasks.filter((task) => task.primaryGoalId).length

  async function saveCapacity() {
    await db.dailyPlans.put({
      date,
      capacityMinutes: capacityDraft,
      confirmedAt: plan?.confirmedAt,
      lockedAt: plan?.lockedAt,
      overloadOverrideReason: plan?.overloadOverrideReason,
    })
  }

  async function addTask() {
    const trimmed = title.trim()
    if (!trimmed) return
    const task: Task = {
      id: newId(),
      title: trimmed,
      plannedDate: date,
      plannedStart: plannedStart || undefined,
      priorityBand: band,
      plannedMinutes: minutes,
      status: 'planned',
      primaryGoalId: goalId || undefined,
      primaryCommitmentId: commitmentId || undefined,
      createdAt: new Date().toISOString(),
    }
    await db.tasks.add(task)
    setTitle('')
    setPlannedStart('')
    setManualAlign(false)
    setComposerOpen(false)
  }

  async function runTaskCommand(taskId: string, action: () => Promise<unknown>) {
    if (pendingTaskId) return
    setPendingTaskId(taskId)
    setTaskError(null)
    try {
      await action()
      setCompleteTask(null)
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : '操作失败，请重试')
    } finally {
      setPendingTaskId(null)
    }
  }

  function requestComplete(task: Task) {
    if (openSessions.has(task.id)) {
      void runTaskCommand(task.id, () => finishTask(task.id))
      return
    }
    setManualMinutes(task.plannedMinutes)
    setCompleteTask(task)
  }

  const closeComplete = useCallback(() => setCompleteTask(null), [])
  const closeComposer = useCallback(() => setComposerOpen(false), [])

  const day = Number(date.slice(8, 10))
  const month = Number(date.slice(5, 7))

  const composer = (
    <Composer
      title={title}
      minutes={minutes}
      band={band}
      plannedStart={plannedStart}
      goalId={goalId}
      goals={goals}
      alignedPath={alignedPath}
      onTitle={(value) => {
        setTitle(value)
        setManualAlign(false)
      }}
      onMinutes={setMinutes}
      onBand={setBand}
      onPlannedStart={setPlannedStart}
      onGoal={(value) => {
        setManualAlign(true)
        setGoalId(value)
        const goal = goals.find((item) => item.id === value)
        const linked = commitments.find(
          (item) => item.primaryGoalId === goal?.id && item.state === 'active',
        )
        setCommitmentId(linked?.id ?? '')
      }}
      onSubmit={() => void addTask()}
      floating={isDesktop}
    />
  )

  let nodeIndex = 0

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0">
        {taskError && !completeTask ? (
          <p role="alert" className="mb-5 rounded-md border border-copper/40 bg-copper-soft p-3 text-sm text-ink">
            {taskError}
          </p>
        ) : null}
        <header className="rise">
          <Kicker>
            {date} · {WEEKDAYS[now.getDay()]}
          </Kicker>
          <div className="mt-3 flex items-end gap-5">
            <h1 className="font-display text-[5.75rem] leading-[0.82] tracking-[-0.035em] text-ink tabular sm:text-[6.5rem]">
              {day}
            </h1>
            <div className="pb-1">
              <p className="font-display text-[1.6rem] leading-none tracking-tight">
                {MONTHS[month - 1]}
              </p>
              <p className="mt-2 text-[13px] leading-5 text-mute">
                {mustTasks.length === 0
                  ? '先写下今天不能逃的事。'
                  : `${doneMust}/${mustTasks.length} 件 MUST 已完成`}
              </p>
            </div>
          </div>
        </header>

        {/* Compact capacity strip: phone & tablet */}
        <div className="rise mt-8 border-y border-line py-4 lg:hidden" style={{ ['--i' as string]: 1 }}>
          <div className="flex items-baseline justify-between gap-4">
            <CapacityInput
              value={capacityDraft}
              onChange={setCapacityDraft}
              onCommit={() => void saveCapacity()}
            />
            <p className="font-mono text-[12px] text-mute tabular">
              MUST 已占 <span className="text-ink">{plannedMust}</span>
              {remaining < 0 ? (
                <span className="text-copper"> · 超出 {-remaining}</span>
              ) : (
                <span> · 余 {remaining}</span>
              )}
            </p>
          </div>
          <Meter value={plannedMust} max={capacityDraft} label="MUST 占用今日容量" thin className="mt-3" />
        </div>

        <Spine className="mt-10 lg:mt-14">
          {loading ? null : BANDS.map((item) => {
            const list = visibleTasks
              .filter((task) => task.priorityBand === item.id)
              .sort((left, right) => rankTask(right) - rankTask(left))
            if (item.id !== 'must' && list.length === 0) return null
            const total = list.reduce((sum, task) => sum + task.plannedMinutes, 0)
            const headerIndex = nodeIndex++
            return (
              <li key={item.id} className="not-first:mt-10">
                <div
                  className="rise flex items-baseline justify-between gap-4 pl-9"
                  style={{ ['--i' as string]: headerIndex }}
                >
                  <h2 className="font-mono text-[11px] tracking-[0.24em] text-ink">
                    {item.label}
                    {list.length > 0 ? (
                      <span className="text-faint">
                        {' '}
                        · {list.length} 项 · {total} min
                      </span>
                    ) : null}
                  </h2>
                  <p className="text-[12px] text-faint">{item.hint}</p>
                </div>
                {list.length === 0 ? (
                  <ol className="mt-3">
                    <SpineNode tone="optional" index={nodeIndex++} className="py-2">
                      <p className="text-[15px] leading-7 text-mute">
                        今天还没有不可撤回的事。
                        {isDesktop ? '在下方录入台写下第一件 MUST。' : '点右下角「记下」写下第一件 MUST。'}
                      </p>
                    </SpineNode>
                  </ol>
                ) : (
                  <ol className="mt-3">
                    {list.map((task) => {
                      const { goal, desire, commitment } = contextOf(task)
                      return (
                        <TaskNode
                          key={task.id}
                          index={nodeIndex++}
                          task={task}
                          why={whyPathFor(goal, desire, commitment)}
                          importance={rankTask(task)}
                          sessionStartedAt={
                            openSessions.has(task.id)
                              ? sessions?.find((session) => session.id === openSessions.get(task.id))
                                  ?.startedAt
                              : undefined
                          }
                          busy={pendingTaskId === task.id}
                          onStart={() => void runTaskCommand(task.id, () => startTask(task.id))}
                          onComplete={() => requestComplete(task)}
                        />
                      )
                    })}
                  </ol>
                )}
              </li>
            )
          })}
        </Spine>

        {isDesktop ? <div className="sticky bottom-6 mt-14">{composer}</div> : null}
      </section>

      <aside className="hidden lg:block lg:sticky lg:top-12 lg:self-start">
        <div className="rise border-l border-line pl-8" style={{ ['--i' as string]: 2 }}>
          <Kicker>今日容量</Kicker>
          <div className="mt-4 flex items-end justify-between gap-3">
            <CapacityInput
              value={capacityDraft}
              onChange={setCapacityDraft}
              onCommit={() => void saveCapacity()}
              large
            />
            <p className="pb-1 text-right font-mono text-[12px] leading-5 text-mute tabular">
              MUST 已占
              <br />
              <span className="text-[15px] text-ink">{plannedMust}</span>
            </p>
          </div>
          <Meter value={plannedMust} max={capacityDraft} label="MUST 占用今日容量" className="mt-4" />
          <p className="mt-3 text-[13px] leading-6 text-mute">
            {remaining < 0 ? (
              <>
                MUST 已超出容量 <span className="font-mono text-copper">{-remaining}</span> 分钟。
                今天不该全都留下。
              </>
            ) : (
              <>
                还能给 MUST <span className="font-mono text-ink">{remaining}</span> 分钟，
                距今日结束 {formatHours(minutesToMidnight)}。
              </>
            )}
          </p>
        </div>

        <div className="rise mt-10 border-l border-line pl-8" style={{ ['--i' as string]: 3 }}>
          <Kicker>此刻</Kicker>
          <p className="mt-3 text-[15px] leading-7 text-ink">
            {runningTask ? (
              <>
                正在做「{runningTask.title}」。
                <span className="text-mute">做完再看别的。</span>
              </>
            ) : mustTasks.length === 0 ? (
              '还没有 MUST。今天最不能逃的一件事是什么？'
            ) : doneMust === mustTasks.length ? (
              '今天的 MUST 全部关账。剩下的时间是你的。'
            ) : (
              <>
                {mustTasks.length - doneMust} 件 MUST 待办。
                <span className="text-mute">选一件，点开始。</span>
              </>
            )}
          </p>
        </div>

        <div className="rise mt-10 border-l border-line pl-8" style={{ ['--i' as string]: 4 }}>
          <Kicker>结构</Kicker>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[12px] tabular">
            {BANDS.map((item) => {
              const count = visibleTasks.filter((task) => task.priorityBand === item.id).length
              return (
                <RailRow key={item.id} label={item.label} value={count} dim={count === 0} />
              )
            })}
            <RailRow
              label="已对齐"
              value={`${alignedCount}/${visibleTasks.length}`}
              dim={visibleTasks.length === 0}
            />
          </dl>
          {goals.length === 0 ? (
            <Link
              to="/direction"
              className="mt-4 inline-block text-[13px] text-copper underline-offset-4 hover:underline"
            >
              还没有方向。先写下欲望与目标 →
            </Link>
          ) : null}
        </div>

        {commitments.some((item) => item.state === 'active') ? (
          <div className="rise mt-10 border-l border-line pl-8" style={{ ['--i' as string]: 5 }}>
            <Kicker>活跃承诺</Kicker>
            <ul className="mt-3 space-y-3">
              {commitments
                .filter((item) => item.state === 'active')
                .map((item) => {
                  const linked = visibleTasks.filter((task) => task.primaryCommitmentId === item.id)
                  const mins = linked.reduce((sum, task) => sum + task.plannedMinutes, 0)
                  return (
                    <li key={item.id}>
                      <p className="text-[14px] leading-6 text-ink">{item.title}</p>
                      <p className="font-mono text-[11px] text-mute tabular">
                        {linked.length > 0 ? `今日 ${linked.length} 项 · ${mins} min` : '今日无动作'}
                      </p>
                    </li>
                  )
                })}
            </ul>
          </div>
        ) : null}
      </aside>

      {!isDesktop ? (
        <>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="lift fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] right-5 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink pl-4 pr-5 text-sm font-medium text-paper transition-transform duration-200 active:scale-[0.98] md:bottom-8"
          >
            <Plus className="size-4" aria-hidden />
            记下
          </button>
          <Dialog
            open={composerOpen}
            onClose={closeComposer}
            title="写入今日"
            kicker="Today"
            tone="night"
          >
            {composer}
          </Dialog>
        </>
      ) : null}

      <Dialog
        open={completeTask !== null}
        onClose={closeComplete}
        kicker="Complete"
        title="记录实际投入"
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            if (completeTask) {
              void runTaskCommand(completeTask.id, () => finishTask(completeTask.id, manualMinutes))
            }
          }}
        >
          <p className="text-sm leading-7 text-mute">
            这次没有点「开始」。请手填实际分钟，不会自动等于计划时长。
          </p>
          {taskError ? <p role="alert" className="mt-3 text-sm text-copper">{taskError}</p> : null}
          <div className="mt-4 flex items-baseline gap-3">
            <Input
              type="number"
              min={1}
              className="w-32 font-mono text-2xl tabular"
              value={manualMinutes}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setManualMinutes(Number(event.target.value))
              }
            />
            <span className="font-mono text-sm text-mute">
              min · 计划 {completeTask?.plannedMinutes}
            </span>
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={closeComplete}>
              取消
            </Button>
            <Button type="submit" variant="solid" className="flex-1" disabled={pendingTaskId !== null}>
              确认完成
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}

function RailRow({
  label,
  value,
  dim,
}: {
  label: string
  value: string | number
  dim?: boolean
}) {
  return (
    <>
      <dt className={cx('tracking-[0.18em]', dim ? 'text-faint' : 'text-mute')}>{label}</dt>
      <dd className={cx('text-right', dim ? 'text-faint' : 'text-ink')}>{value}</dd>
    </>
  )
}

function CapacityInput({
  value,
  onChange,
  onCommit,
  large = false,
}: {
  value: number
  onChange: (value: number) => void
  onCommit: () => void
  large?: boolean
}) {
  return (
    <label className="inline-flex items-baseline gap-2">
      <span className="sr-only">今天能投入的分钟数</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={cx(
          'w-[4.5ch] border-0 border-b border-line-strong bg-transparent p-0 font-display text-ink tabular transition-colors focus:border-ink focus:outline-none',
          large ? 'text-[2.6rem] leading-none' : 'text-[1.5rem] leading-none',
        )}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
      />
      <span className="font-mono text-[11px] tracking-[0.18em] text-mute">MIN</span>
    </label>
  )
}

function Composer({
  title,
  minutes,
  band,
  plannedStart,
  goalId,
  goals,
  alignedPath,
  onTitle,
  onMinutes,
  onBand,
  onPlannedStart,
  onGoal,
  onSubmit,
  floating,
}: {
  title: string
  minutes: number
  band: PriorityBand
  plannedStart: string
  goalId: string
  goals: Goal[]
  alignedPath: string[]
  onTitle: (value: string) => void
  onMinutes: (value: number) => void
  onBand: (value: PriorityBand) => void
  onPlannedStart: (value: string) => void
  onGoal: (value: string) => void
  onSubmit: () => void
  floating: boolean
}) {
  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const dark = 'border-0 bg-transparent p-0 text-paper outline-none placeholder:text-paper/30 focus-visible:outline-none'
  return (
    <form
      className={cx(
        'on-dark text-paper',
        floating && 'lift rounded-lg bg-night',
      )}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className={cx(floating && 'px-6 pt-5')}>
        {floating ? <Kicker tone="copper">写入今日</Kicker> : null}
        <input
          required
          autoFocus={!floating}
          placeholder="一件今天必须完成的事"
          className={cx(
            dark,
            'w-full border-b border-white/12 py-3 text-[1.2rem] leading-8 focus:border-copper',
            floating ? 'mt-2' : 'mt-0',
          )}
          value={title}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onTitle(event.target.value)}
        />
      </div>

      <div
        className={cx(
          'grid grid-cols-[1fr_auto] gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]',
          floating ? 'px-6 py-4' : 'py-4',
        )}
      >
        <div className="col-span-2 sm:col-span-1">
          <span className="font-mono text-[10px] tracking-[0.18em] text-paper/45">优先级</span>
          <Segmented
            name="band"
            dark
            className="mt-1.5"
            value={band}
            options={BANDS.map((item) => ({ id: item.id, label: item.label }))}
            onChange={onBand}
          />
        </div>
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.18em] text-paper/45">分钟</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            className={cx(dark, 'mt-1.5 block h-10 w-full border-b border-white/12 font-mono text-[15px] tabular focus:border-copper')}
            value={minutes}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onMinutes(Number(event.target.value))}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.18em] text-paper/45">开始（可选）</span>
          <input
            type="time"
            className={cx(dark, 'mt-1.5 block h-10 w-full border-b border-white/12 font-mono text-[15px] tabular focus:border-copper')}
            value={plannedStart}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onPlannedStart(event.target.value)}
          />
        </label>
      </div>

      <div
        className={cx(
          'flex flex-col gap-3 border-t border-white/10 sm:flex-row sm:items-center sm:justify-between',
          floating ? 'px-6 py-4' : 'pt-4',
        )}
      >
        <div className="min-w-0 flex-1">
          {activeGoals.length === 0 ? (
            <Link to="/direction" className="text-[12px] text-copper hover:text-paper">
              先去「方向」写下欲望和目标，任务才会自动对齐 →
            </Link>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Chain
                dark
                path={alignedPath}
                empty="未匹配到目标"
                className="min-w-0"
              />
              <label className="relative inline-flex items-center">
                <span className="sr-only">手动对齐目标</span>
                <select
                  className="max-w-[12rem] cursor-pointer appearance-none border-0 bg-transparent py-1 pr-4 font-mono text-[11px] tracking-[0.12em] text-paper/55 outline-none [field-sizing:content] hover:text-paper focus-visible:text-paper"
                  value={goalId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => onGoal(event.target.value)}
                >
                  <option value="" className="text-ink">
                    改为：不对齐
                  </option>
                  {activeGoals.map((goal) => (
                    <option key={goal.id} value={goal.id} className="text-ink">
                      改为：{goal.title}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="pointer-events-none absolute right-0 text-[10px] text-paper/45">
                  ▾
                </span>
              </label>
            </div>
          )}
        </div>
        <Button type="submit" variant="copper" className="shrink-0 sm:min-w-28">
          记下
        </Button>
      </div>
    </form>
  )
}

function TaskNode({
  task,
  why,
  importance,
  sessionStartedAt,
  onStart,
  onComplete,
  busy,
  index,
}: {
  task: Task
  why: string[]
  importance: number
  sessionStartedAt?: string
  onStart: () => void
  onComplete: () => void
  busy: boolean
  index: number
}) {
  const running = task.status === 'in_progress'
  const done = task.status === 'completed'
  const weighted = !done && !running && importance >= 60
  const tone = done ? 'done' : running ? 'running' : task.priorityBand

  return (
    <SpineNode tone={tone} index={index}>
      <div
        className={cx(
          'group -mx-3 flex flex-col gap-3 rounded-md px-3 py-2.5 transition-colors duration-200 sm:flex-row sm:items-start',
          !done && 'hover:bg-paper/80',
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'text-[16px] leading-7 transition-colors duration-300',
              done ? 'text-mute line-through decoration-line-strong' : 'font-medium text-ink',
            )}
          >
            {task.title}
            {weighted ? (
              <span className="ml-2 align-middle font-mono text-[10px] tracking-[0.18em] text-copper">
                高权重
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-[12px] text-mute tabular">
            {task.plannedMinutes} min
            {task.plannedStart ? ` · ${task.plannedStart}` : ''}
            {' · '}
            <span className={running ? 'text-copper' : ''}>{labelStatus(task.status)}</span>
            {running && sessionStartedAt ? <Elapsed startedAt={sessionStartedAt} /> : null}
          </p>
          <Chain path={why} className="mt-1.5" />
        </div>
        {!done ? (
          <div className="flex shrink-0 gap-1.5 sm:pt-0.5">
            {!running ? (
              <Button variant="ghost" size="sm" onClick={onStart} disabled={busy}>
                <Play className="size-3.5" aria-hidden />
                开始
              </Button>
            ) : null}
            <Button variant={running ? 'copper' : 'solid'} size="sm" onClick={onComplete} disabled={busy}>
              {running ? (
                <Square className="size-3.5" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              完成
            </Button>
          </div>
        ) : null}
      </div>
    </SpineNode>
  )
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const elapsed = Math.max(0, now - new Date(startedAt).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  const seconds = Math.floor((elapsed % 60_000) / 1000)
  return (
    <span className="text-copper">
      {' '}
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  )
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} 分钟`
  return `${h} 小时 ${String(m).padStart(2, '0')} 分`
}

function labelStatus(status: Task['status']): string {
  if (status === 'in_progress') return '进行中'
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已计划'
}
