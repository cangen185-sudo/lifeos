import { promises as fs } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGrowthService } from './growth-service.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const defaultDistDir = path.join(projectDir, 'dist')
export const defaultDataDir = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'LifeOS',
  'data',
)

const maxBackupBytes = 20 * 1024 * 1024
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

function replyJson(response, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  })
  response.end(body)
}

async function currentBackup(dataFile) {
  try {
    const bytes = await fs.readFile(dataFile)
    return {
      bytes,
      revision: createHash('sha256').update(bytes).digest('hex'),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function readBody(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > maxBackupBytes) {
      const error = new Error('备份超过 20 MB 上限')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function validateBackup(bytes) {
  let backup
  try {
    backup = JSON.parse(bytes.toString('utf8'))
  } catch {
    const error = new Error('备份不是有效 JSON')
    error.status = 400
    throw error
  }
  const collections = [
    'dailyPlans', 'tasks', 'workSessions', 'taskEvents', 'desires',
    'goals', 'commitments', 'dailyReviews', 'interventionEvents',
  ]
  if (backup?.version !== 5 || !Number.isFinite(Date.parse(backup.exportedAt)) ||
    collections.some((name) => !Array.isArray(backup[name]))) {
    const error = new Error('备份结构不完整')
    error.status = 400
    throw error
  }
  return backup
}

function resolvedFile(distDir, pathname) {
  const decoded = decodeURIComponent(pathname)
  if (decoded.includes('\0')) return null
  const target = path.resolve(distDir, `.${decoded}`)
  const relative = path.relative(distDir, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null
  }
  return target
}

export function createLifeOSServer({
  distDir = defaultDistDir,
  dataDir = defaultDataDir,
} = {}) {
  const root = path.resolve(distDir)
  const storageRoot = path.resolve(dataDir)
  const dataFile = path.join(storageRoot, 'lifeos-backup.json')
  const previousFile = path.join(storageRoot, 'lifeos-backup.previous.json')
  let writeQueue = Promise.resolve()
  const growth = createGrowthService(storageRoot, () => currentBackup(dataFile))

  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host
      if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) {
        return replyJson(response, 403, { error: '只允许本机固定地址访问' })
      }
      const url = new URL(request.url || '/', `http://${host}`)

      if (url.pathname === '/api/growth' || url.pathname.startsWith('/api/growth/')) {
        if (request.headers['sec-fetch-site'] === 'cross-site' ||
          (request.headers.origin && request.headers.origin !== `http://${host}`) ||
          (request.method === 'POST' && (request.headers.origin !== `http://${host}` ||
          !request.headers['content-type']?.startsWith('application/json')))) {
          return replyJson(response, 403, { error: '只允许本机应用访问成长接口' })
        }
        let body = {}
        if (request.method === 'POST') {
          try { body = JSON.parse((await readBody(request)).toString('utf8')) } catch (e) {
            return replyJson(response, e.status || 400, { error: '请求必须是有效 JSON' })
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) return replyJson(response, 400, { error: '请求格式无效' })
        }
        await writeQueue.catch(() => {})
        return replyJson(response, 200, await growth.handle(request.method, url.pathname, body))
      }

      if (url.pathname === '/api/status' && request.method === 'GET') {
        const backup = await currentBackup(dataFile)
        return replyJson(response, 200, {
          appId: 'lifeos-local-file-v1',
          projectDir: path.dirname(root),
          dataFile,
          previousFile,
          revision: backup?.revision ?? 'none',
          savedAt: backup ? JSON.parse(backup.bytes.toString('utf8')).exportedAt : null,
        })
      }

      if (url.pathname === '/api/backup' && request.method === 'GET') {
        const backup = await currentBackup(dataFile)
        if (!backup) {
          response.writeHead(204, { 'Cache-Control': 'no-store' })
          return response.end()
        }
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-LifeOS-Revision': backup.revision,
          'Content-Length': backup.bytes.length,
        })
        return response.end(backup.bytes)
      }

      if (url.pathname === '/api/backup' && request.method === 'POST') {
        if (request.headers.origin !== `http://${host}` ||
          !request.headers['content-type']?.startsWith('application/json')) {
          return replyJson(response, 403, { error: '只接受本机应用写入' })
        }
        const bytes = await readBody(request)
        validateBackup(bytes)
        const expected = request.headers['x-lifeos-revision']
        const work = writeQueue.catch(() => {}).then(async () => {
          const current = await currentBackup(dataFile)
          const revision = current?.revision ?? 'none'
          if (expected !== revision) {
            return { status: 409, value: { error: '本地文件已有更新，请先核对数据', revision } }
          }
          await fs.mkdir(storageRoot, { recursive: true })
          const temp = path.join(storageRoot, `lifeos-backup.${process.pid}.${randomUUID()}.tmp`)
          const previousTemp = path.join(storageRoot, `lifeos-backup.previous.${process.pid}.${randomUUID()}.tmp`)
          await fs.writeFile(temp, bytes, { flag: 'wx' })
          if (current) {
            await fs.copyFile(dataFile, previousTemp)
            await fs.rename(previousTemp, previousFile)
          }
          await fs.rename(temp, dataFile)
          const nextRevision = createHash('sha256').update(bytes).digest('hex')
          return { status: 200, value: { revision: nextRevision, dataFile } }
        })
        writeQueue = work
        const result = await work
        return replyJson(response, result.status, result.value)
      }

      if (url.pathname.startsWith('/api/')) {
        return replyJson(response, 405, { error: '不支持此操作' })
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return replyJson(response, 405, { error: '不支持此操作' })
      }

      const candidate = resolvedFile(root, url.pathname)
      if (!candidate) return replyJson(response, 403, { error: '路径无效' })
      let file = candidate
      let stat
      try {
        stat = await fs.stat(file)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      if (!stat?.isFile()) {
        if (path.extname(url.pathname)) return replyJson(response, 404, { error: '文件不存在' })
        file = path.join(root, 'index.html')
        stat = await fs.stat(file)
      }
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      })
      if (request.method === 'HEAD') return response.end()
      response.end(await fs.readFile(file))
    } catch (error) {
      if (!response.headersSent) replyJson(response, error.status || 500, { error: error.message })
      else response.destroy(error)
    }
  })
  let timer
  server.on('listening', () => {
    void growth.tick()
    timer = setInterval(() => { void growth.tick() }, 60_000)
    timer.unref()
  })
  server.on('close', () => clearInterval(timer))
  return { server, dataFile, previousFile, growth }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 4179)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('端口必须是 1024–65535 的整数')
  }
  const { server, dataFile } = createLifeOSServer({
    dataDir: process.env.LIFEOS_DATA_DIR || defaultDataDir,
  })
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`LifeOS local: http://127.0.0.1:${port}/\nData: ${dataFile}\n`)
  })
}
