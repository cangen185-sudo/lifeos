import { useState, type FormEvent } from 'react'
import type { PriorityBand, Task } from '../domain/types'
import { Dialog } from './ui/Dialog'
import { Button, Input } from './ui/primitives'

export function TaskEditDialog({
  task,
  onClose,
  onSave,
  onRemove,
}: {
  task: Task | null
  onClose: () => void
  onSave: (value: { title: string; plannedMinutes: number; priorityBand: PriorityBand; plannedStart?: string }) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [minutes, setMinutes] = useState(task?.plannedMinutes ?? 1)
  const [band, setBand] = useState<PriorityBand>(task?.priorityBand ?? 'must')
  const [start, setStart] = useState(task?.plannedStart ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!task) return null

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} kicker="Edit" title="编辑未确认的任务">
      <form onSubmit={(event: FormEvent) => {
        event.preventDefault()
        void run(() => onSave({ title, plannedMinutes: minutes, priorityBand: band, plannedStart: start || undefined }))
      }} className="space-y-4">
        <label className="block text-sm text-mute">任务标题
          <Input required className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block text-sm text-mute">计划分钟
          <Input required type="number" min={1} className="mt-1" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
        </label>
        <label className="block text-sm text-mute">优先级
          <select className="mt-1 block w-full rounded-md border border-line bg-paper px-3 py-2 text-ink" value={band} onChange={(event) => setBand(event.target.value as PriorityBand)}>
            <option value="must">MUST</option><option value="should">SHOULD</option><option value="optional">OPTIONAL</option>
          </select>
        </label>
        <label className="block text-sm text-mute">计划开始时间（可选）
          <Input type="time" className="mt-1" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        {error ? <p role="alert" className="text-sm text-copper">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="quiet" disabled={busy} onClick={onClose}>取消</Button>
          <Button type="submit" variant="solid" disabled={busy}>保存任务</Button>
          {confirmRemove ? (
            <Button type="button" variant="copper" disabled={busy} onClick={() => void run(onRemove)}>确认移除</Button>
          ) : (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>移除任务</Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
