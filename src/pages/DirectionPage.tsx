import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { db, newId } from '../db/db'
import type { CommitmentState, Desire, Goal } from '../domain/types'

export function DirectionPage() {
  const desires = useLiveQuery(() => db.desires.orderBy('importance').reverse().toArray())
  const goals = useLiveQuery(() => db.goals.toArray())
  const commitments = useLiveQuery(() => db.commitments.toArray())

  return (
    <section>
      <p className="font-mono text-[11px] tracking-[0.22em] text-brass">DIRECTION</p>
      <h1 className="mt-2 font-display text-4xl leading-none">人生分层</h1>
      <p className="mt-3 max-w-lg text-sm leading-7 text-mute">
        欲望说明你真正要什么，目标是可检验的推进，承诺是清醒时签下的约束。今日任务会按标题自动对齐到这一层。
      </p>

      <Layer title="真实欲望" caption="顶层。不写口号，写你真想得到的结果。">
        <DesireForm />
        <ul className="mt-4 space-y-3">
          {(desires ?? []).map((desire) => (
            <li key={desire.id} className="rounded-2xl border border-line bg-snow p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{desire.title}</p>
                  {desire.description ? (
                    <p className="mt-1 text-sm text-mute">{desire.description}</p>
                  ) : null}
                </div>
                <span className="font-mono text-xs text-brass">重要 {desire.importance}</span>
              </div>
            </li>
          ))}
        </ul>
      </Layer>

      <Layer title="目标" caption="朝欲望推进、能被检验的结果。">
        <GoalForm desires={desires ?? []} />
        <ul className="mt-4 space-y-3">
          {(goals ?? [])
            .filter((goal) => goal.status === 'active')
            .map((goal) => {
              const desire = (desires ?? []).find((item) => item.id === goal.primaryDesireId)
              return (
                <li key={goal.id} className="rounded-2xl border border-line bg-snow p-4">
                  <p className="font-medium">{goal.title}</p>
                  <p className="mt-1 text-xs text-mute">
                    {desire ? `服务欲望 · ${desire.title}` : '尚未挂到欲望'}
                  </p>
                </li>
              )
            })}
        </ul>
      </Layer>

      <Layer title="承诺" caption="清醒状态下的约束。任务可以对齐到这里。">
        <CommitmentForm goals={(goals ?? []).filter((goal) => goal.status === 'active')} />
        <ul className="mt-4 space-y-3">
          {(commitments ?? []).map((item) => {
            const goal = (goals ?? []).find((goal) => goal.id === item.primaryGoalId)
            return (
              <li key={item.id} className="rounded-2xl border border-line bg-snow p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-mute">
                      {goal ? `对齐目标 · ${goal.title}` : '尚未挂到目标'}
                      {item.rationale ? ` · ${item.rationale}` : ''}
                    </p>
                  </div>
                  <StateToggle id={item.id} state={item.state} />
                </div>
              </li>
            )
          })}
        </ul>
      </Layer>
    </section>
  )
}

function Layer({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-mute">{caption}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function DesireForm() {
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
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-snow p-4">
      <input
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：让家人拥有更好的生活"
        className="w-full rounded-md border border-line bg-paper px-3 py-2"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="为什么这是你真正想要的（可选）"
        rows={2}
        className="mt-3 w-full rounded-md border border-line bg-paper px-3 py-2"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <fieldset>
          <legend className="text-xs text-mute">重要程度</legend>
          <div className="mt-1 flex gap-1">
            {([1, 2, 3, 4, 5] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`min-h-11 min-w-11 rounded-md border text-sm ${
                  importance === value
                    ? 'border-ink bg-ink text-snow'
                    : 'border-line'
                }`}
                onClick={() => setImportance(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="min-h-11 rounded-md bg-ink px-4 text-sm text-snow">
          记下欲望
        </button>
      </div>
    </form>
  )
}

function GoalForm({ desires }: { desires: Desire[] }) {
  const [title, setTitle] = useState('')
  const [desireId, setDesireId] = useState(desires[0]?.id ?? '')

  useEffect(() => {
    if (!desireId && desires[0]?.id) setDesireId(desires[0].id)
  }, [desires, desireId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await db.goals.add({
      id: newId(),
      title: trimmed,
      status: 'active',
      primaryDesireId: desireId || desires[0]?.id,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-snow p-4">
      <input
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：交付可用的 LifeOS"
        className="w-full rounded-md border border-line bg-paper px-3 py-2"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <select
          className="min-h-11 flex-1 rounded-md border border-line bg-paper px-3"
          value={desireId || desires[0]?.id || ''}
          onChange={(event) => setDesireId(event.target.value)}
        >
          {desires.length === 0 ? (
            <option value="">先添加欲望</option>
          ) : (
            desires.map((desire) => (
              <option key={desire.id} value={desire.id}>
                对齐：{desire.title}
              </option>
            ))
          )}
        </select>
        <button
          type="submit"
          disabled={desires.length === 0}
          className="min-h-11 rounded-md bg-ink px-4 text-sm text-snow disabled:opacity-40"
        >
          记下目标
        </button>
      </div>
    </form>
  )
}

function CommitmentForm({ goals }: { goals: Goal[] }) {
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '')

  useEffect(() => {
    if (!goalId && goals[0]?.id) setGoalId(goals[0].id)
  }, [goals, goalId])

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
      primaryGoalId: goalId || goals[0]?.id,
      createdAt: new Date().toISOString(),
    })
    setTitle('')
    setRationale('')
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-snow p-4">
      <input
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：本周完成 LifeOS 数据模型"
        className="w-full rounded-md border border-line bg-paper px-3 py-2"
      />
      <input
        value={rationale}
        onChange={(event) => setRationale(event.target.value)}
        placeholder="当时为什么答应自己（可选）"
        className="mt-3 w-full rounded-md border border-line bg-paper px-3 py-2"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <select
          className="min-h-11 flex-1 rounded-md border border-line bg-paper px-3"
          value={goalId || goals[0]?.id || ''}
          onChange={(event) => setGoalId(event.target.value)}
        >
          {goals.length === 0 ? (
            <option value="">先添加目标</option>
          ) : (
            goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                对齐：{goal.title}
              </option>
            ))
          )}
        </select>
        <button
          type="submit"
          disabled={goals.length === 0}
          className="min-h-11 rounded-md bg-ink px-4 text-sm text-snow disabled:opacity-40"
        >
          激活承诺
        </button>
      </div>
    </form>
  )
}

function StateToggle({ id, state }: { id: string; state: CommitmentState }) {
  const label =
    state === 'active' ? '进行中' : state === 'draft' ? '草稿' : state
  return (
    <button
      type="button"
      className="font-mono text-[10px] tracking-wide text-mute"
      onClick={() => {
        void db.commitments.update(id, {
          state: state === 'active' ? 'draft' : 'active',
        })
      }}
    >
      {label}
    </button>
  )
}
