import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import {
  Button,
  ImportanceDots,
  Input,
  Kicker,
  Textarea,
  cx,
} from '../components/ui/primitives'
import { Spine, SpineNode } from '../components/ui/Spine'
import { db, newId } from '../db/db'
import { todayKey } from '../domain/clock'
import type { Commitment, CommitmentState, Desire, Goal, Task } from '../domain/types'

export function DirectionPage() {
  const desiresQuery = useLiveQuery(() => db.desires.orderBy('importance').reverse().toArray())
  const loading = desiresQuery === undefined
  const desires = desiresQuery ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const commitments = useLiveQuery(() => db.commitments.toArray()) ?? []
  const date = todayKey()
  const todayTasks =
    useLiveQuery(() => db.tasks.where('plannedDate').equals(date).toArray(), [date]) ?? []

  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const orphanGoals = activeGoals.filter(
    (goal) => !desires.some((desire) => desire.id === goal.primaryDesireId),
  )
  const liveCommitments = commitments.filter(
    (item) => item.state === 'active' || item.state === 'draft',
  )

  let index = 0

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0">
        <header className="rise">
          <Kicker>Direction</Kicker>
          <h1 className="mt-3 font-display text-[3rem] leading-[0.95] tracking-tight sm:text-[3.5rem]">
            方向
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-mute">
            欲望说明你真正要什么；目标是朝它推进、能被检验的结果；承诺是清醒时签下的约束。
            今日任务可以直接关联多个欲望；目标与承诺按需要再补充。
          </p>
        </header>

        {loading ? null : desires.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              kicker="从顶层开始"
              title="先写下一个你真正想要的结果"
              body="不写口号，写具体的、拿到手会让你松一口气的东西。目标和承诺都会挂在它下面。"
              action={<DesireForm autoOpen />}
            />
          </div>
        ) : (
          <Spine className="mt-12">
            {desires.map((desire) => {
              const nodeIndex = index++
              const childGoals = activeGoals.filter((goal) => goal.primaryDesireId === desire.id)
              return (
                <SpineNode key={desire.id} tone="root" index={nodeIndex} className="not-first:mt-12">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <h2 className="font-display text-[1.55rem] leading-tight tracking-tight text-ink">
                      {desire.title}
                    </h2>
                    <ImportanceDots value={desire.importance} size="sm" />
                  </div>
                  {desire.description ? (
                    <p className="mt-1.5 max-w-xl text-[14px] leading-6 text-mute">
                      {desire.description}
                    </p>
                  ) : null}

                  <Branch className="mt-5">
                    {childGoals.map((goal) => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        commitments={liveCommitments.filter((item) => item.primaryGoalId === goal.id)}
                        todayTasks={todayTasks}
                      />
                    ))}
                    <li className="relative">
                      <Tick />
                      <GoalForm desireId={desire.id} />
                    </li>
                  </Branch>
                </SpineNode>
              )
            })}

            {orphanGoals.length > 0 ? (
              <SpineNode tone="branch" index={index++} className="mt-12">
                <h2 className="font-display text-[1.3rem] leading-tight tracking-tight text-mute">
                  未挂到欲望的目标
                </h2>
                <Branch className="mt-4">
                  {orphanGoals.map((goal) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      commitments={liveCommitments.filter((item) => item.primaryGoalId === goal.id)}
                      todayTasks={todayTasks}
                    />
                  ))}
                </Branch>
              </SpineNode>
            ) : null}

            <SpineNode tone="optional" index={index++} className="mt-12">
              <DesireForm />
            </SpineNode>
          </Spine>
        )}
      </section>

      <aside className="mt-14 lg:mt-0 lg:sticky lg:top-12 lg:self-start">
        <div className="rise border-l border-line pl-8" style={{ ['--i' as string]: 2 }}>
          <Kicker>层次</Kicker>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[12px] tabular">
            <Row label="欲望" value={desires.length} />
            <Row label="目标" value={activeGoals.length} />
            <Row label="承诺" value={liveCommitments.filter((item) => item.state === 'active').length} />
          </dl>
        </div>
        <div className="rise mt-10 border-l border-line pl-8" style={{ ['--i' as string]: 3 }}>
          <Kicker>怎么用</Kicker>
          <ol className="mt-3 space-y-3 text-[14px] leading-6 text-mute">
            <li>
              <span className="text-ink">欲望</span>少而真，按重要程度排，不必凑数。
            </li>
            <li>
              <span className="text-ink">目标</span>要能判断有没有做到。
            </li>
            <li>
              <span className="text-ink">承诺</span>是给未来软弱的自己看的。写下当时的理由。
            </li>
          </ol>
          <Link
            to="/"
            className="mt-5 inline-block text-[13px] text-copper underline-offset-4 hover:underline"
          >
            回到今日，写第一件 MUST →
          </Link>
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  const dim = value === 0
  return (
    <>
      <dt className={cx('tracking-[0.18em]', dim ? 'text-faint' : 'text-mute')}>{label}</dt>
      <dd className={cx('text-right', dim ? 'text-faint' : 'text-ink')}>{value}</dd>
    </>
  )
}

/** Nested list hanging off a spine node, with a hairline and short ticks per child. */
function Branch({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ol className={cx('relative ml-[-1.3rem] border-l border-line pl-7 space-y-4', className)}>
      {children}
    </ol>
  )
}

function Tick() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -left-7 top-[1.1rem] h-px w-4 bg-line"
    />
  )
}

function GoalRow({
  goal,
  commitments,
  todayTasks,
}: {
  goal: Goal
  commitments: Commitment[]
  todayTasks: Task[]
}) {
  const linked = todayTasks.filter(
    (task) => task.primaryGoalId === goal.id && task.status !== 'cancelled',
  )
  return (
    <li className="relative">
      <Tick />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="text-[16px] font-medium leading-7 text-ink">{goal.title}</p>
        <p className="font-mono text-[11px] text-faint tabular">
          {linked.length > 0 ? `今日 ${linked.length} 项` : '今日无动作'}
        </p>
      </div>
      <ol className="mt-2 space-y-2 border-l border-line/70 pl-5">
        {commitments.map((item) => (
          <CommitmentRow key={item.id} item={item} todayTasks={todayTasks} />
        ))}
        <li>
          <CommitmentForm goalId={goal.id} />
        </li>
      </ol>
    </li>
  )
}

function CommitmentRow({ item, todayTasks }: { item: Commitment; todayTasks: Task[] }) {
  const linked = todayTasks.filter(
    (task) => task.primaryCommitmentId === item.id && task.status !== 'cancelled',
  )
  const mins = linked.reduce((sum, task) => sum + task.plannedMinutes, 0)
  return (
    <li className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-0.5">
      <div className="min-w-0">
        <p className={cx('text-[15px] leading-6', item.state === 'draft' ? 'text-mute' : 'text-ink')}>
          {item.title}
        </p>
        {item.rationale ? (
          <p className="text-[13px] leading-5 text-mute">「{item.rationale}」</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px] tabular">
        <span className="text-faint">
          {linked.length > 0 ? `${linked.length} 项 · ${mins} min` : ''}
        </span>
        <StateToggle id={item.id} state={item.state} />
      </div>
    </li>
  )
}

function InlineAdd({
  label,
  open,
  onOpen,
  children,
  size = 'md',
}: {
  label: string
  open: boolean
  onOpen: () => void
  children: ReactNode
  size?: 'md' | 'sm'
}) {
  if (open) return <>{children}</>
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md text-mute transition-colors duration-200 hover:text-ink',
        size === 'sm' ? 'min-h-8 text-[13px]' : 'min-h-9 text-[14px]',
      )}
    >
      <Plus className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      {label}
    </button>
  )
}

function DesireForm({ autoOpen = false }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [importance, setImportance] = useState<Desire['importance']>(4)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    await db.desires.add({
      id: newId(),
      title: trimmed,
      description: description.trim() || undefined,
      importance,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    setTitle('')
    setDescription('')
    if (!autoOpen) setOpen(false)
  }

  return (
    <InlineAdd label="新的欲望" open={open} onOpen={() => setOpen(true)}>
      <form onSubmit={onSubmit} className="fade-in max-w-xl space-y-3">
        <Input
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：让家人拥有更宽裕的生活"
          className="font-display text-[1.25rem]"
        />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="为什么这是你真正想要的（可选）"
          rows={2}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] tracking-[0.18em] text-mute">重要</span>
            <ImportanceDots value={importance} onChange={setImportance} />
          </div>
          <div className="flex gap-2">
            {!autoOpen ? (
              <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>
                取消
              </Button>
            ) : null}
            <Button type="submit" variant="solid" size="sm">
              记下欲望
            </Button>
          </div>
        </div>
      </form>
    </InlineAdd>
  )
}

function GoalForm({ desireId }: { desireId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await db.goals.add({
      id: newId(),
      title: trimmed,
      status: 'active',
      primaryDesireId: desireId,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setOpen(false)
  }

  return (
    <InlineAdd label="目标" open={open} onOpen={() => setOpen(true)}>
      <form onSubmit={onSubmit} className="fade-in flex max-w-xl flex-col gap-2 sm:flex-row">
        <Input
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="一个能被检验的结果，例如：交付可用的 LifeOS"
        />
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="submit" variant="solid">
            记下
          </Button>
        </div>
      </form>
    </InlineAdd>
  )
}

function CommitmentForm({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await db.commitments.add({
      id: newId(),
      title: trimmed,
      rationale: rationale.trim() || undefined,
      startAt: new Date().toISOString(),
      state: 'active',
      primaryGoalId: goalId,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setRationale('')
    setOpen(false)
  }

  return (
    <InlineAdd label="承诺" size="sm" open={open} onOpen={() => setOpen(true)}>
      <form onSubmit={onSubmit} className="fade-in max-w-xl space-y-2 py-1">
        <Input
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：本周完成 LifeOS 数据模型"
        />
        <Input
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="当时为什么答应自己（可选）"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="submit" variant="solid" size="sm">
            激活承诺
          </Button>
        </div>
      </form>
    </InlineAdd>
  )
}

function StateToggle({ id, state }: { id: string; state: CommitmentState }) {
  const active = state === 'active'
  const label = active ? '生效中' : state === 'draft' ? '草稿' : state
  return (
    <button
      type="button"
      title={active ? '点击改为草稿' : '点击激活'}
      className={cx(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 tracking-[0.14em] transition-colors duration-200',
        active
          ? 'border-copper/40 text-copper hover:bg-copper-soft'
          : 'border-line text-faint hover:border-line-strong hover:text-mute',
      )}
      onClick={() => {
        void db.commitments.update(id, { state: active ? 'draft' : 'active' })
      }}
    >
      <span
        aria-hidden
        className={cx('size-1.5 rounded-full', active ? 'bg-copper' : 'bg-line-strong')}
      />
      {label}
    </button>
  )
}
