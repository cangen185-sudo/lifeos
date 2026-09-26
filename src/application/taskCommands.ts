import { db, newId } from '../db/db'

/** Each command reads the current database state inside the write transaction. */
export async function startTask(taskId: string): Promise<boolean> {
  return db.transaction('rw', db.tasks, db.workSessions, db.taskEvents, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) throw new Error('任务不存在')

    const openSessions = (await db.workSessions.where('taskId').equals(taskId).toArray())
      .filter((session) => !session.endedAt)
    if (task.status === 'in_progress' && openSessions.length === 1) return false
    if (task.status !== 'planned' || openSessions.length !== 0) {
      throw new Error('任务状态与计时记录不一致，无法开始')
    }

    const stamp = new Date().toISOString()
    await db.workSessions.add({ id: newId(), taskId, startedAt: stamp })
    await db.tasks.update(taskId, { status: 'in_progress' })
    await db.taskEvents.add({
      id: newId(), taskId, type: 'started',
      before: 'planned', after: 'in_progress', createdAt: stamp,
    })
    return true
  })
}

export async function finishTask(taskId: string, manualMinutes?: number): Promise<boolean> {
  return db.transaction('rw', db.tasks, db.workSessions, db.taskEvents, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) throw new Error('任务不存在')
    if (task.status === 'completed') return false
    if (task.status !== 'planned' && task.status !== 'in_progress') {
      throw new Error('当前任务不能完成')
    }

    const openSessions = (await db.workSessions.where('taskId').equals(taskId).toArray())
      .filter((session) => !session.endedAt)
    if (openSessions.length > 1 || (task.status === 'planned' && openSessions.length > 0)) {
      throw new Error('任务状态与计时记录不一致，无法完成')
    }

    const stamp = new Date().toISOString()
    if (openSessions.length === 1) {
      const session = openSessions[0]
      const start = Date.parse(session.startedAt)
      if (!Number.isFinite(start)) throw new Error('计时记录的开始时间无效')
      const actualMinutes = Math.max(1, Math.round((Date.parse(stamp) - start) / 60_000))
      await db.workSessions.update(session.id, { endedAt: stamp, actualMinutes })
    } else {
      if (!Number.isFinite(manualMinutes) || manualMinutes! < 1) {
        throw new Error('请填写有效的实际分钟数')
      }
      await db.workSessions.add({
        id: newId(), taskId, startedAt: stamp, endedAt: stamp,
        actualMinutes: manualMinutes,
      })
    }

    await db.tasks.update(taskId, { status: 'completed', completedAt: stamp })
    await db.taskEvents.add({
      id: newId(), taskId, type: 'completed',
      before: task.status, after: 'completed', createdAt: stamp,
    })
    return true
  })
}
