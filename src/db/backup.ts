import { db } from './db'
import { parseBackup } from './backupSchema'
import type { BackupPayload } from '../domain/types'

export async function exportBackup(): Promise<BackupPayload> {
  const [dailyPlans, tasks, workSessions, taskEvents, desires, goals, commitments] =
    await db.transaction('r', db.tables, () => Promise.all([
      db.dailyPlans.toArray(),
      db.tasks.toArray(),
      db.workSessions.toArray(),
      db.taskEvents.toArray(),
      db.desires.toArray(),
      db.goals.toArray(),
      db.commitments.toArray(),
    ]))
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

export async function importBackup(text: string): Promise<void> {
  const parsed = parseBackup(text)
  await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear()
      await Promise.all([
        db.dailyPlans.bulkAdd(parsed.dailyPlans),
        db.tasks.bulkAdd(parsed.tasks),
        db.workSessions.bulkAdd(parsed.workSessions),
        db.taskEvents.bulkAdd(parsed.taskEvents),
        db.desires.bulkAdd(parsed.desires ?? []),
        db.goals.bulkAdd(parsed.goals ?? []),
        db.commitments.bulkAdd(parsed.commitments ?? []),
      ])
  })
}
