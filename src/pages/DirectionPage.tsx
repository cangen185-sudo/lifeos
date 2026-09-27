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
import {
  SETTLE_STATES,
  canTransitionCommitment,
  commitmentAtRisk,
} from '../domain/commitment'
import type { Commitment, CommitmentState, Desire, Goal, Task } from '../domain/types'

export function DirectionPage() {
  const desiresQuery = useLiveQuery(() => db.desires.orderBy('importance').reverse().toArray())
  const loading = desiresQuery === undefined
  const desires = desiresQuery ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const commitments = useLiveQuery(() => db.commitments.toArray()) ?? []
  const date = todayKey()
  const allTasks = useLiveQuery(() => db.tasks.toArray()) ?? []
  const todayTasks = allTasks.filter((task) => task.plannedDate === date)

  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const orphanGoals = goals.filter(
    (goal) => !desires.some((desire) => desire.id === goal.primaryDesireId),
  )
  const liveCommitments = commitments.filter(
    (item) => item.state === 'active' || item.state === 'draft',
  )
  const atRisk = commitments.filter((item) =>
    commitmentAtRisk({ commitment: item, tasks: allTasks, today: date }),
  )

  let index = 0

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0">
        <header className="rise">
          <Kicker>Direction</Kicker>
          <h1 className="mt-3 font-display text-[3rem] leading-[1.05] sm:text-[3.5rem]">
            方向
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-mute">
            欲望说明你真正要什么；目标是朝它推进、能被检验的结果；承诺是清醒时签下的约束。
            今日任务可以由你直接关联多个欲望；目标与承诺按需要补充。系统只提示承诺风险，结案由你亲自确认。
          </p>
        </header>

        {atRisk.length > 0 ? (
          <div
            className="rise mt-8 border-y border-copper/35 py-4"
            style={{ ['--i' as string]: 1 }}
          >
            <p className="font-mono text-[11px] tracking-[0.22em] text-copper">at-risk</p>
            <p className="mt-2 text-[15px] leading-7 text-ink">
              {atRisk.length} 条承诺已到期，且仍有未完成的 MUST。系统不会自动标违约，由你结案。
            </p>
            <ul className="mt-3 space-y-1">
              {atRisk.map((item) => (
                <li key={item.id} className="text-[14px] text-mute">
                  {item.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

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
              const childGoals = goals.filter((goal) => goal.primaryDesireId === desire.id)
              return (
                <SpineNode key={desire.id} tone="root" index={nodeIndex} className="not-first:mt-12">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <h2 className="font-display text-[1.55rem] leading-tight text-ink">
                      {desire.title}
                    </h2>
                    <ImportanceDots value={desire.importance} size="sm" />
                    {!desire.active ? <span className="text-xs text-mute">已停用</span> : null}
                  </div>
                  {desire.description ? (
                    <p className="mt-1.5 max-w-xl text-[14px] leading-6 text-mute">
                      {desire.description}
                    </p>
                  ) : null}
                  <DesireEditor desire={desire} />

                  <Branch className="mt-5">
                    {childGoals.map((goal) => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        desires={desires}
                        commitments={commitments.filter((item) => item.primaryGoalId === goal.id)}
                        todayTasks={todayTasks}
                        allTasks={allTasks}
                        today={date}
                      />
                    ))}
                    {desire.active ? <li className="relative">
                      <Tick />
                      <GoalForm desireId={desire.id} />
                    </li> : null}
                  </Branch>
                </SpineNode>
              )
            })}

            {orphanGoals.length > 0 ? (
              <SpineNode tone="branch" index={index++} className="mt-12">
                <h2 className="font-display text-[1.3rem] leading-tight text-mute">
                  未挂到欲望的目标
                </h2>
                <Branch className="mt-4">
                    {orphanGoals.map((goal) => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        desires={desires}
                        commitments={commitments.filter((item) => item.primaryGoalId === goal.id)}
                        todayTasks={todayTasks}
                        allTasks={allTasks}
                        today={date}
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
            <Row label="风险中" value={atRisk.length} />
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
              <span className="text-ink">承诺</span>写下有效期和最低要求。到期未完成只提示 at-risk，结案必须你点。
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

function DesireEditor({ desire }: { desire: Desire }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(desire.title)
  const [description, setDescription] = useState(desire.description ?? '')
  const [importance, setImportance] = useState(desire.importance)
  const [active, setActive] = useState(desire.active)
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    try {
      await db.desires.update(desire.id, {
        title: title.trim(), description: description.trim() || undefined,
        importance, active, updatedAt: new Date().toISOString(),
      })
      setOpen(false)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }

  if (!open) return <Button variant="quiet" size="sm" className="mt-2" onClick={() => setOpen(true)}>编辑欲望</Button>
  return (
    <form onSubmit={(event) => void save(event)} className="mt-3 max-w-xl space-y-2 border-l border-line pl-4">
      <Input required aria-label="欲望标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Textarea aria-label="欲望描述" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
      <ImportanceDots value={importance} onChange={setImportance} />
      <label className="flex items-center gap-2 text-sm text-mute">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        作为当前方向推荐
      </label>
      {error ? <p role="alert" className="text-sm text-copper">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>取消</Button>
        <Button type="submit" variant="solid" size="sm">保存欲望</Button>
      </div>
    </form>
  )
}

function GoalRow({
  goal,
  desires,
  commitments,
  todayTasks,
  allTasks,
  today,
}: {
  goal: Goal
  desires: Desire[]
  commitments: Commitment[]
  todayTasks: Task[]
  allTasks: Task[]
  today: string
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
          {goal.status !== 'active' ? `${goal.status} · ` : ''}
          {goal.targetDate ? `${goal.targetDate} · ` : ''}
          {linked.length > 0 ? `今日 ${linked.length} 项` : '今日无动作'}
        </p>
      </div>
      <GoalEditor goal={goal} desires={desires} />
      <ol className="mt-2 space-y-2 border-l border-line/70 pl-5">
        {commitments.map((item) => (
          <CommitmentRow
            key={item.id}
            item={item}
            todayTasks={todayTasks}
            allTasks={allTasks}
            today={today}
          />
        ))}
        <li>
          <CommitmentForm goalId={goal.id} />
        </li>
      </ol>
    </li>
  )
}

function GoalEditor({ goal, desires }: { goal: Goal; desires: Desire[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [desireId, setDesireId] = useState(goal.primaryDesireId ?? '')
  const [status, setStatus] = useState(goal.status)
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '')
  const [error, setError] = useState('')
  if (!open) return <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>调整目标</Button>
  return (
    <form className="mt-2 space-y-2" onSubmit={(event) => {
      event.preventDefault()
      if (!title.trim()) return
      void db.goals.update(goal.id, {
        title: title.trim(), primaryDesireId: desireId || undefined,
        status, targetDate: targetDate || undefined,
      }).then(() => { setOpen(false); setError('') })
        .catch((cause) => setError(cause instanceof Error ? cause.message : '保存失败'))
    }}>
      <Input required aria-label="目标标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label className="block text-xs text-mute">关联欲望（可选）
        <select value={desireId} onChange={(event) => setDesireId(event.target.value)} className="mt-1 block w-full rounded-md border border-line bg-paper px-2 py-2 text-ink">
          <option value="">不关联欲望</option>
          {desires.map((item) => <option key={item.id} value={item.id}>{item.title}{item.active ? '' : '（已停用）'}</option>)}
        </select>
      </label>
      <label className="block text-xs text-mute">状态
        <select value={status} onChange={(event) => setStatus(event.target.value as Goal['status'])} className="mt-1 block w-full rounded-md border border-line bg-paper px-2 py-2 text-ink">
          <option value="active">进行中</option><option value="achieved">已达到</option><option value="dropped">已放弃</option>
        </select>
      </label>
      <Input type="date" aria-label="检验日期" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
      {error ? <p role="alert" className="text-sm text-copper">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>取消</Button>
        <Button type="submit" variant="solid" size="sm">保存目标</Button>
      </div>
    </form>
  )
}

function CommitmentRow({
  item,
  todayTasks,
  allTasks,
  today,
}: {
  item: Commitment
  todayTasks: Task[]
  allTasks: Task[]
  today: string
}) {
  const linked = todayTasks.filter(
    (task) => task.primaryCommitmentId === item.id && task.status !== 'cancelled',
  )
  const mins = linked.reduce((sum, task) => sum + task.plannedMinutes, 0)
  const atRisk = commitmentAtRisk({ commitment: item, tasks: allTasks, today })
  const endLabel = item.endAt ? item.endAt.slice(0, 10) : null
  return (
    <li className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-0.5">
      <div className="min-w-0">
        <p className={cx('text-[15px] leading-6', item.state === 'draft' ? 'text-mute' : 'text-ink')}>
          {item.title}
        </p>
        {item.rationale ? (
          <p className="text-[13px] leading-5 text-mute">「{item.rationale}」</p>
        ) : null}
        {item.targetNote || endLabel ? (
          <p className="font-mono text-[11px] leading-5 text-faint">
            {endLabel ? `至 ${endLabel}` : ''}
            {item.targetNote ? `${endLabel ? ' · ' : ''}${item.targetNote}` : ''}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1.5 font-mono text-[11px] tabular">
        <span className="text-faint">
          {linked.length > 0 ? `${linked.length} 项 · ${mins} min` : ''}
        </span>
        <CommitmentStatus item={item} atRisk={atRisk} />
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
  const [targetDate, setTargetDate] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await db.goals.add({
      id: newId(),
      title: trimmed,
      status: 'active',
      primaryDesireId: desireId,
      targetDate: targetDate || undefined,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setTargetDate('')
    setOpen(false)
  }

  return (
    <InlineAdd label="目标" open={open} onOpen={() => setOpen(true)}>
      <form onSubmit={onSubmit} className="fade-in flex max-w-xl flex-col gap-2">
        <Input
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="一个能被检验的结果，例如：交付可用的 LifeOS"
        />
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          检验日期（可选）
          <Input
            type="date"
            className="mt-1.5"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </label>
        <div className="flex shrink-0 justify-end gap-2">
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
  const [endDate, setEndDate] = useState('')
  const [targetNote, setTargetNote] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await db.commitments.add({
      id: newId(),
      title: trimmed,
      rationale: rationale.trim() || undefined,
      startAt: new Date().toISOString(),
      endAt: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
      targetNote: targetNote.trim() || undefined,
      state: 'active',
      primaryGoalId: goalId,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setRationale('')
    setEndDate('')
    setTargetNote('')
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
          placeholder="当时为什么答应自己（Why）"
        />
        <Input
          value={targetNote}
          onChange={(event) => setTargetNote(event.target.value)}
          placeholder="最低要求，例如：至少 4 次、合计 360 分钟"
        />
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          有效期至（可选）
          <Input
            type="date"
            className="mt-1.5"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
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

function CommitmentStatus({ item, atRisk }: { item: Commitment; atRisk: boolean }) {
  const [open, setOpen] = useState(false)
  const settled = SETTLE_STATES.find((row) => row.id === item.state)
  const active = item.state === 'active'
  const label = active ? '生效中' : item.state === 'draft' ? '草稿' : item.state

  async function go(to: CommitmentState) {
    if (!canTransitionCommitment(item.state, to)) return
    await db.commitments.update(item.id, { state: to })
    setOpen(false)
  }

  if (settled) {
    return (
      <span className="inline-flex min-h-7 items-center rounded-full border border-line px-2.5 tracking-[0.14em] text-faint">
        {settled.label}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {atRisk ? (
        <span className="tracking-[0.16em] text-copper">at-risk</span>
      ) : null}
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
          void go(active ? 'draft' : 'active')
        }}
      >
        <span
          aria-hidden
          className={cx('size-1.5 rounded-full', active ? 'bg-copper' : 'bg-line-strong')}
        />
        {label}
      </button>
      {active ? (
        open ? (
          <div className="flex flex-wrap justify-end gap-1">
            {SETTLE_STATES.map((row) => (
              <Button key={row.id} type="button" variant="quiet" size="sm" onClick={() => void go(row.id)}>
                {row.label}
              </Button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="min-h-7 px-1 tracking-[0.14em] text-faint transition-colors hover:text-ink"
            onClick={() => setOpen(true)}
          >
            结案
          </button>
        )
      ) : null}
    </div>
  )
}
