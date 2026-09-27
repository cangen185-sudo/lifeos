import Dexie from 'dexie'
import { exportBackup, importBackup } from './backup'
import { parseBackup } from './backupSchema'
import { db } from './db'

type FileSaveStatus = {
  mode: 'browser' | 'file'
  state: 'ready' | 'connecting' | 'saved' | 'saving' | 'error' | 'conflict'
  dataFile?: string
  message?: string
  browserStoragePersistent?: boolean
}

const revisionKey = 'lifeos-local-file-revision'
const listeners = new Set<() => void>()
let status: FileSaveStatus = {
  mode: 'browser',
  state: 'ready',
  message: '当前入口仅使用浏览器存储。长期使用请从 Open-LifeOS.cmd 打开。',
}
let revision = 'none'
let dirty = false
let writing = false
let started = false

function update(next: FileSaveStatus) {
  status = next
  listeners.forEach((listener) => listener())
}

export function getLocalFileStatus(): FileSaveStatus {
  return status
}

export function subscribeLocalFileStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function sameBackupData(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const a = { ...left, exportedAt: null }
  const b = { ...right, exportedAt: null }
  return JSON.stringify(a) === JSON.stringify(b)
}

async function writeSnapshot(): Promise<void> {
  if (writing || status.state === 'conflict' || status.mode !== 'file') return
  writing = true
  try {
    while (dirty) {
      dirty = false
      update({ ...status, state: 'saving', message: undefined })
      const backup = await exportBackup()
      parseBackup(JSON.stringify(backup))
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LifeOS-Revision': revision,
        },
        body: JSON.stringify(backup),
        cache: 'no-store',
      })
      if (response.status === 409) {
        update({ ...status, state: 'conflict', message: '本地文件已被另一窗口更新；请先导出当前记录，再核对本地文件。' })
        return
      }
      if (!response.ok) throw new Error(`保存失败：HTTP ${response.status}`)
      const saved = await response.json() as { revision: string; dataFile: string }
      revision = saved.revision
      localStorage.setItem(revisionKey, revision)
      update({ ...status, state: 'saved', dataFile: saved.dataFile, message: undefined })
    }
  } catch (error) {
    dirty = true
    update({
      ...status,
      state: 'error',
      message: error instanceof Error ? error.message : '本地文件保存失败，请重试。',
    })
  } finally {
    writing = false
  }
}

function scheduleSnapshot() {
  dirty = true
  void writeSnapshot()
}

export async function startLocalFileSync(): Promise<void> {
  if (started) return
  started = true
  if (window.location.origin !== 'http://127.0.0.1:4179') return
  update({ mode: 'file', state: 'connecting' })

  try {
    const response = await fetch('/api/status', { cache: 'no-store' })
    if (!response.ok) throw new Error('本地文件服务不可用')
    const server = await response.json() as {
      appId: string
      dataFile: string
      revision: string
    }
    if (server.appId !== 'lifeos-local-file-v1') throw new Error('本地端口不是 LifeOS 文件服务')
    revision = server.revision

    const backupResponse = await fetch('/api/backup', { cache: 'no-store' })
    if (!backupResponse.ok && backupResponse.status !== 204) throw new Error('读取本地文件失败')
    const fileBackup = backupResponse.status === 204
      ? null : parseBackup(await backupResponse.text())
    const counts = await db.transaction('r', db.tables, () =>
      Promise.all(db.tables.map((table) => table.count())))
    const browserHasData = counts.some((count) => count > 0)
    let shouldSaveInitial = !fileBackup

    if (!browserHasData && fileBackup) {
      await importBackup(JSON.stringify(fileBackup))
      localStorage.setItem(revisionKey, revision)
    } else if (browserHasData && fileBackup) {
      const knownRevision = localStorage.getItem(revisionKey)
      const browserBackup = await exportBackup()
      const matchesFile = sameBackupData(browserBackup, fileBackup)
      if (knownRevision !== revision && !matchesFile) {
        update({
          mode: 'file', state: 'conflict', dataFile: server.dataFile,
          message: '浏览器记录与本地文件不同。请先导出当前记录，再核对要保留的版本。',
        })
        return
      }
      localStorage.setItem(revisionKey, revision)
      if (!matchesFile) shouldSaveInitial = true
    }

    let browserStoragePersistent = false
    try {
      browserStoragePersistent = await navigator.storage?.persist?.() ?? false
    } catch {
      // The JSON file remains available even if the browser denies persistence.
    }
    update({ mode: 'file', state: 'saved', dataFile: server.dataFile, browserStoragePersistent })
    Dexie.on.storagemutated.subscribe(scheduleSnapshot)
    window.setInterval(() => {
      if (status.state === 'error') scheduleSnapshot()
    }, 15_000)
    if (shouldSaveInitial) scheduleSnapshot()
  } catch (error) {
    update({
      mode: 'file', state: 'error',
      message: error instanceof Error ? error.message : '本地文件初始化失败',
    })
  }
}
