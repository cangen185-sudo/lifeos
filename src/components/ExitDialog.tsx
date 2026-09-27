import { useRef, useState } from 'react'
import { CANCEL_REASONS } from '../domain/review'
import { shiftDate } from '../domain/clock'
import type { ReasonCode, ReviewAction, Task } from '../domain/types'
import { Button, Input } from './ui/primitives'
import { Dialog } from './ui/Dialog'

type SettleInput = {
  action: Exclude<ReviewAction, 'split'>
  reasonCode: ReasonCode
  nextDate?: string
  narrowTitle?: string
  narrowMinutes?: number
}

export function ExitDialog({
  task,
  date,
  open,
  onClose,
  onSettle,
  onSplit,
  splitTargetDate,
  narrowTargetDate,
  correcting = false,
}: {
  task: Task | null
  date: string
  splitTargetDate: string
  narrowTargetDate: string
  open: boolean
  onClose: () => void
  onSettle: (input: SettleInput) => Promise<void>
  onSplit: (input: {
    reasonCode: ReasonCode
    parts: { title: string; minutes: number }[]
  }) => Promise<void>
  correcting?: boolean
}) {
  const [mode, setMode] = useState<'pick' | 'cancel' | 'defer' | 'narrow' | 'split' | 'downgrade'>('pick')
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('')
  const [nextDate, setNextDate] = useState(shiftDate(date, 1))
  const [left, setLeft] = useState(task?.title ? `${task.title} · 前半` : '')
  const [right, setRight] = useState(task?.title ? `${task.title} · 后半` : '')
  const [leftMin, setLeftMin] = useState(Math.max(1, Math.round((task?.plannedMinutes ?? 90) / 2)))
  const [rightMin, setRightMin] = useState(Math.max(1, (task?.plannedMinutes ?? 90) - leftMin))
  const [narrowTitle, setNarrowTitle] = useState(task?.title ? `${task.title} · 缩小范围` : '')
  const [narrowMinutes, setNarrowMinutes] = useState(Math.max(1, Math.floor((task?.plannedMinutes ?? 90) / 2)))
  const [narrowDate, setNarrowDate] = useState(narrowTargetDate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)

  if (!task) return null

  function reset() {
    setMode('pick')
    setReasonCode('')
    setNextDate(shiftDate(date, 1))
    setNarrowDate(narrowTargetDate)
    setError('')
    busyRef.current = false
    setBusy(false)
  }

  async function finish(work: () => Promise<void>) {
    if (busyRef.current) return
    if (!reasonCode) {
      setError('请先选择事实原因。')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await work()
      reset()
      onClose()
    } catch (cause) {
      busyRef.current = false
      setBusy(false)
      setError(cause instanceof Error ? cause.message : '操作失败，请重试。')
    }
  }

  const reasons = mode === 'pick' ? null : (
    <ReasonPicker value={reasonCode} onChange={setReasonCode} disabled={busy} />
  )

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      kicker="Exit"
      title={correcting ? '更正结案去向' : '结构化退出'}
    >
      <p className="text-sm leading-7 text-mute">
        「{task.title}」{correcting ? '的原结案会保留在历史中；新去向需要重新选择原因。' : '不能悄悄消失。选一个动作并留下事实原因。'}
      </p>

      {mode === 'pick' ? (
        <div className="mt-4 grid gap-2" aria-busy={busy}>
          <Button variant="ghost" className="justify-start" onClick={() => setMode('defer')}>
            延期
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => setMode('narrow')}>
            缩小范围，生成待办
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => setMode('split')}>
            拆成两件
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => setMode('cancel')}>
            取消
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => setMode('downgrade')}>
            降为 SHOULD
          </Button>
        </div>
      ) : null}

      {mode === 'defer' ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reasonCode) return void setError('请先选择事实原因。')
            void finish(() => onSettle({ action: 'defer', reasonCode, nextDate }))
          }}
        >
          <label className="block font-mono text-[11px] tracking-[0.18em] text-mute">
            新的日期
            <Input
              required
              type="date"
              min={shiftDate(date, 1)}
              className="mt-1.5"
              value={nextDate}
              onChange={(event) => setNextDate(event.target.value)}
            />
          </label>
          {reasons}
          <Actions busy={busy} label="延到这一天" onBack={() => setMode('pick')} />
        </form>
      ) : null}

      {mode === 'narrow' ? (
        <form className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault()
          if (!reasonCode) return void setError('请先选择事实原因。')
          void finish(() => onSettle({ action: 'narrow', reasonCode, nextDate: narrowDate, narrowTitle, narrowMinutes }))
        }}>
          <p className="text-sm leading-6 text-mute">
            原计划留在本日未完成记录；缩小后的行动成为新的待办，实际分钟只来自计时。
          </p>
          <Input required value={narrowTitle} onChange={(event) => setNarrowTitle(event.target.value)} />
          <Input type="number" required min={1} max={Math.max(1, task.plannedMinutes - 1)} value={narrowMinutes} onChange={(event) => setNarrowMinutes(Number(event.target.value))} />
          <label className="block text-xs text-mute">缩小后安排日期
            <Input type="date" required min={narrowTargetDate} value={narrowDate} onChange={(event) => setNarrowDate(event.target.value)} />
          </label>
          {reasons}
          <Actions busy={busy} label="记录缩小范围" onBack={() => setMode('pick')} />
        </form>
      ) : null}

      {mode === 'downgrade' ? (
        <form className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault()
          if (!reasonCode) return void setError('请先选择事实原因。')
          void finish(() => onSettle({ action: 'downgrade', reasonCode }))
        }}>
          <p className="text-sm text-mute">这项行动保留在原日期作为 SHOULD；确认计划中的 MUST 分母仍保留。</p>
          {reasons}
          <Actions busy={busy} label="记录降级" onBack={() => setMode('pick')} />
        </form>
      ) : null}

      {mode === 'cancel' ? (
        <div className="mt-4 space-y-3">
          {reasons}
          <div className="flex gap-2">
            <Button variant="quiet" className="flex-1" disabled={busy} onClick={() => setMode('pick')}>
              返回
            </Button>
            <Button
              variant="solid"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                if (!reasonCode) return setError('请先选择事实原因。')
                void finish(() => onSettle({ action: 'cancel', reasonCode }))
              }}
            >
              记录并取消
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'split' ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reasonCode) return void setError('请先选择事实原因。')
            void finish(() => onSplit({
              reasonCode,
              parts: [
                { title: left, minutes: leftMin },
                { title: right, minutes: rightMin },
              ],
            }))
          }}
        >
          <p className="text-sm text-mute">拆出的两件待办将安排在 {splitTargetDate}。</p>
          <Input value={left} onChange={(event) => setLeft(event.target.value)} required />
          <Input type="number" min={1} value={leftMin} onChange={(event) => setLeftMin(Number(event.target.value))} />
          <Input value={right} onChange={(event) => setRight(event.target.value)} required />
          <Input type="number" min={1} value={rightMin} onChange={(event) => setRightMin(Number(event.target.value))} />
          {reasons}
          <Actions busy={busy} label="拆开并记录" onBack={() => setMode('pick')} />
        </form>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-sm text-copper">{error}</p> : null}
    </Dialog>
  )
}

function ReasonPicker({
  value,
  onChange,
  disabled,
}: {
  value: ReasonCode | ''
  onChange: (value: ReasonCode) => void
  disabled: boolean
}) {
  return (
    <fieldset>
      <legend className="font-mono text-[11px] tracking-[0.18em] text-mute">事实原因</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CANCEL_REASONS.map((reason) => (
          <button
            key={reason.id}
            type="button"
            disabled={disabled}
            aria-pressed={value === reason.id}
            className={`rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
              value === reason.id ? 'border-copper bg-copper-soft' : 'border-line bg-paper hover:border-ink'
            }`}
            onClick={() => onChange(reason.id)}
          >
            <span className="block text-[13px] text-ink">{reason.label}</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-mute">{reason.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Actions({ busy, label, onBack }: { busy: boolean; label: string; onBack: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="quiet" className="flex-1" disabled={busy} onClick={onBack}>
        返回
      </Button>
      <Button type="submit" variant="solid" className="flex-1" disabled={busy}>
        {label}
      </Button>
    </div>
  )
}
