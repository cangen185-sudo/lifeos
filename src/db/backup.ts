import { db } from './db'
import type { BackupPayload } from '../domain/types'

export async function exportBackup(): Promise<BackupPayload> {
  const [dailyPlans, tasks, workSessions, taskEvents] = await Promise.all([
    db.dailyPlans.toArray(),
    db.tasks.toArray(),
    db.workSessions.toArray(),
    db.taskEvents.toArray(),
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    dailyPlans,
    tasks,
    workSessions,
    taskEvents,
  }
}

export function downloadBackup(payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lifeos-backup-${payload.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<BackupPayload>
  return (
    record.version === 1 &&
    Array.isArray(record.dailyPlans) &&
    Array.isArray(record.tasks) &&
    Array.isArray(record.workSessions) &&
    Array.isArray(record.taskEvents)
  )
}

export async function importBackup(text: string): Promise<void> {
  const parsed: unknown = JSON.parse(text)
  if (!isBackupPayload(parsed)) {
    throw new Error('备份文件格式不正确')
  }
  await db.transaction(
    'rw',
    db.dailyPlans,
    db.tasks,
    db.workSessions,
    db.taskEvents,
    async () => {
      await Promise.all([
        db.dailyPlans.clear(),
        db.tasks.clear(),
        db.workSessions.clear(),
        db.taskEvents.clear(),
      ])
      await Promise.all([
        db.dailyPlans.bulkAdd(parsed.dailyPlans),
        db.tasks.bulkAdd(parsed.tasks),
        db.workSessions.bulkAdd(parsed.workSessions),
        db.taskEvents.bulkAdd(parsed.taskEvents),
      ])
    },
  )
}
