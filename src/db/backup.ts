import { db } from './db'
import type { BackupPayload } from '../domain/types'

export async function exportBackup(): Promise<BackupPayload> {
  const [dailyPlans, tasks, workSessions, taskEvents, desires, goals, commitments] =
    await Promise.all([
      db.dailyPlans.toArray(),
      db.tasks.toArray(),
      db.workSessions.toArray(),
      db.taskEvents.toArray(),
      db.desires.toArray(),
      db.goals.toArray(),
      db.commitments.toArray(),
    ])
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    dailyPlans,
    tasks,
    workSessions,
    taskEvents,
    desires,
    goals,
    commitments,
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
    (record.version === 1 || record.version === 2) &&
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
  await db.transaction('rw', db.tables, async () => {
      await Promise.all([
        db.dailyPlans.clear(),
        db.tasks.clear(),
        db.workSessions.clear(),
        db.taskEvents.clear(),
        db.desires.clear(),
        db.goals.clear(),
        db.commitments.clear(),
      ])
      await Promise.all([
        db.dailyPlans.bulkAdd(parsed.dailyPlans),
        db.tasks.bulkAdd(parsed.tasks),
        db.workSessions.bulkAdd(parsed.workSessions),
        db.taskEvents.bulkAdd(parsed.taskEvents),
        parsed.desires?.length ? db.desires.bulkAdd(parsed.desires) : Promise.resolve(),
        parsed.goals?.length ? db.goals.bulkAdd(parsed.goals) : Promise.resolve(),
        parsed.commitments?.length
          ? db.commitments.bulkAdd(parsed.commitments)
          : Promise.resolve(),
      ])
  })
}
