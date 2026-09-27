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
  const standaloneCommitments = commitments.filter(
    (item) => !item.primaryGoalId || !goals.some((goal) => goal.id === item.primaryGoalId),
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
            欲望可以是想要的结果、体验或状态；方向可以清晰可量，也可以只由你自己判断。
            承诺是可选的自我约定。它们不必层层相连，今日任务也可以直接关联多个欲望。
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

        {loading ? null : desires.length === 0 && goals.length === 0 && commitments.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              kicker="从顶层开始"
              title="先写下一个你在意的方向"
              body="可以是结果、体验或想维持的状态。不需要先想好如何衡量，目标和承诺也不是必填。"
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
                        goals={goals}
                        desires={desires}
                        commitments={commitments.filter((item) => item.primaryGoalId === goal.id)}
                        todayTasks={todayTasks}
                        allTasks={allTasks}
                        today={date}
                      />
                    ))}
                    {desire.active ? <li className="relative">
                      <Tick />
                      <GoalForm desireId={desire.id} desires={desires} />
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
                        goals={goals}
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

        <section className="mt-12 border-t border-line pt-8">
          <Kicker>自由记录</Kicker>
          <h2 className="mt-3 font-display text-[1.55rem] text-ink">不必先归类</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-mute">
            可以单独记方向或自我约定；以后想关联欲望或目标时再调整。
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            <GoalForm desires={desires} />
            <CommitmentForm goals={goals} />
          </div>
          {standaloneCommitments.length > 0 ? (
            <ul className="mt-6 space-y-3 border-l border-line pl-5">
              {standaloneCommitments.map((item) => (
                <CommitmentRow
                  key={item.id}
                  item={item}
                  goals={goals}
                  todayTasks={todayTasks}
                  allTasks={allTasks}
                  today={date}
                />
              ))}
            </ul>
          ) : null}
        </section>
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
              <span className="text-ink">欲望</span>可以是具体结果，也可以是想拥有的感受或状态。
            </li>
            <li>
              <span className="text-ink">方向</span>可选日期、可选判断方式；你自己说了算。
            </li>
            <li>
              <span className="text-ink">承诺</span>可以先存草稿，也可以只写一句约定。系统不会替你评判完成或违约。
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
  goals,
  desires,
  commitments,
  todayTasks,
  allTasks,
  today,
}: {
  goal: Goal
  goals: Goal[]
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
          {goal.status === 'achieved' ? '自己认为已达到 · ' : goal.status === 'dropped' ? '暂不继续 · ' : ''}
          {goal.targetDate ? `${goal.targetDate} · ` : ''}
          {linked.length > 0 ? `今日 ${linked.length} 项` : '今日无动作'}
        </p>
      </div>
      {goal.description ? <p className="mt-1 text-[13px] leading-5 text-mute">{goal.description}</p> : null}
      <GoalEditor goal={goal} desires={desires} />
      <ol className="mt-2 space-y-2 border-l border-line/70 pl-5">
        {commitments.map((item) => (
          <CommitmentRow
            key={item.id}
            item={item}
            goals={goals}
            todayTasks={todayTasks}
            allTasks={allTasks}
            today={today}
          />
        ))}
        <li>
          <CommitmentForm goalId={goal.id} goals={goals} />
        </li>
      </ol>
    </li>
  )
}

function GoalEditor({ goal, desires }: { goal: Goal; desires: Desire[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [description, setDescription] = useState(goal.description ?? '')
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
        title: title.trim(), description: description.trim() || undefined,
        primaryDesireId: desireId || undefined,
        status, targetDate: targetDate || undefined,
      }).then(() => { setOpen(false); setError('') })
        .catch((cause) => setError(cause instanceof Error ? cause.message : '保存失败'))
    }}>
      <Input required aria-label="目标标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Textarea
        aria-label="怎样由自己判断方向在推进"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="想记下的感受或判断方式（可选，不必量化）"
      />
      <label className="block text-xs text-mute">关联欲望（可选）
        <select value={desireId} onChange={(event) => setDesireId(event.target.value)} className="mt-1 block w-full rounded-md border border-line bg-paper px-2 py-2 text-ink">
          <option value="">不关联欲望</option>
          {desires.map((item) => <option key={item.id} value={item.id}>{item.title}{item.active ? '' : '（已停用）'}</option>)}
        </select>
      </label>
      <label className="block text-xs text-mute">状态
        <select value={status} onChange={(event) => setStatus(event.target.value as Goal['status'])} className="mt-1 block w-full rounded-md border border-line bg-paper px-2 py-2 text-ink">
          <option value="active">保持关注</option><option value="achieved">自己认为已达到</option><option value="dropped">暂不继续</option>
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
  goals,
  todayTasks,
  allTasks,
  today,
}: {
  item: Commitment
  goals: Goal[]
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
        {item.state === 'draft' ? <CommitmentEditor item={item} goals={goals} /> : null}
      </div>
    </li>
  )
}

function CommitmentEditor({ item, goals }: { item: Commitment; goals: Goal[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [rationale, setRationale] = useState(item.rationale ?? '')
  const [targetNote, setTargetNote] = useState(item.targetNote ?? '')
  const [goalId, setGoalId] = useState(item.primaryGoalId ?? '')
  const [endDate, setEndDate] = useState(item.endAt ? todayKey(new Date(item.endAt)) : '')
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    try {
      await db.commitments.update(item.id, {
        title: title.trim(),
        rationale: rationale.trim() || undefined,
        targetNote: targetNote.trim() || undefined,
        primaryGoalId: goalId || undefined,
        endAt: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
      })
      setError('')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }

  if (!open) {
    return <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(true)}>编辑约定</Button>
  }
  return (
    <form onSubmit={(event) => void save(event)} className="w-full min-w-[14rem] max-w-sm space-y-2 text-left">
      <Input required aria-label="约定标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Input aria-label="约定缘由" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="为什么想这样做（可选）" />
      <Textarea aria-label="自己的判断方式" rows={2} value={targetNote} onChange={(event) => setTargetNote(event.target.value)} placeholder="自己的判断方式（可选）" />
      <label className="block text-xs text-mute">关联目标（可选）
        <select value={goalId} onChange={(event) => setGoalId(event.target.value)} className="mt-1 block w-full rounded-md border border-line bg-paper px-2 py-2 text-ink">
          <option value="">暂不关联</option>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
      </label>
      <label className="block text-xs text-mute">想回看或结束的日期（可选）
        <Input type="date" className="mt-1" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-copper">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>取消</Button>
        <Button type="submit" variant="solid" size="sm">保存约定</Button>
      </div>
    </form>
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

function GoalForm({ desireId = '', desires }: { desireId?: string; desires: Desire[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedDesireId, setSelectedDesireId] = useState(desireId)
  const [targetDate, setTargetDate] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await db.goals.add({
      id: newId(),
      title: trimmed,
      description: description.trim() || undefined,
      status: 'active',
      primaryDesireId: selectedDesireId || undefined,
      targetDate: targetDate || undefined,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setDescription('')
    setSelectedDesireId(desireId)
    setTargetDate('')
    setOpen(false)
  }

  return (
    <InlineAdd label={desireId ? '方向 / 目标' : '独立方向 / 目标'} open={open} onOpen={() => setOpen(true)}>
      <form onSubmit={onSubmit} className="fade-in flex max-w-xl flex-col gap-2">
        <Input
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：更自在地生活，或完成某件具体事"
        />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="你自己会怎样感觉到它在推进？可不写，也不必量化。"
          rows={2}
        />
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          关联欲望（可选）
          <select
            value={selectedDesireId}
            onChange={(event) => setSelectedDesireId(event.target.value)}
            className="mt-1.5 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm tracking-normal text-ink"
          >
            <option value="">暂不关联</option>
            {desires.map((item) => (
              <option key={item.id} value={item.id}>{item.title}{item.active ? '' : '（已停用）'}</option>
            ))}
          </select>
        </label>
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          想回看的日期（可选）
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

function CommitmentForm({ goalId = '', goals }: { goalId?: string; goals: Goal[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [endDate, setEndDate] = useState('')
  const [targetNote, setTargetNote] = useState('')
  const [selectedGoalId, setSelectedGoalId] = useState(goalId)
  const [state, setState] = useState<'draft' | 'active'>('draft')

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
      state,
      primaryGoalId: selectedGoalId || undefined,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setRationale('')
    setEndDate('')
    setTargetNote('')
    setSelectedGoalId(goalId)
    setState('draft')
    setOpen(false)
  }

  return (
    <InlineAdd label={goalId ? '自我约定' : '独立承诺 / 自我约定'} size="sm" open={open} onOpen={() => setOpen(true)}>
      <form onSubmit={onSubmit} className="fade-in max-w-xl space-y-2 py-1">
        <Input
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：每周留一段时间给身体，或提醒自己放慢脚步"
        />
        <Input
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="为什么想这样做（可选）"
        />
        <Textarea
          value={targetNote}
          onChange={(event) => setTargetNote(event.target.value)}
          placeholder="怎样由自己判断是否遵守？可以是感受、态度或具体次数（可选）。"
          rows={2}
        />
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          关联目标（可选）
          <select
            value={selectedGoalId}
            onChange={(event) => setSelectedGoalId(event.target.value)}
            className="mt-1.5 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm tracking-normal text-ink"
          >
            <option value="">暂不关联</option>
            {goals.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          想回看或结束的日期（可选）
          <Input
            type="date"
            className="mt-1.5"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
          目前状态
          <select
            value={state}
            onChange={(event) => setState(event.target.value as 'draft' | 'active')}
            className="mt-1.5 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm tracking-normal text-ink"
          >
            <option value="draft">先记下，暂不启用</option>
            <option value="active">现在启用</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="submit" variant="solid" size="sm">
            记下约定
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
