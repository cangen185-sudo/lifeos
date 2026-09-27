import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLifeOSServer } from './lifeos-local-server.mjs'

const emptyBackup = (title) => ({
  version: 5,
  exportedAt: new Date().toISOString(),
  dailyPlans: [],
  tasks: title ? [{ id: 'task', title }] : [],
  workSessions: [], taskEvents: [], desires: [], goals: [], commitments: [],
  dailyReviews: [], interventionEvents: [],
})

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

test('local file backup survives server restart and rejects stale or invalid writes', async () => {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifeos-server-test-'))
  const distDir = path.join(testDir, 'dist')
  const dataDir = path.join(testDir, 'data')
  await fs.mkdir(distDir)
  await fs.writeFile(path.join(distDir, 'index.html'), '<title>LifeOS test</title>')

  const first = createLifeOSServer({ distDir, dataDir })
  let server = first.server
  try {
    let origin = await listen(server)
    assert.equal((await fetch(origin)).status, 200)
    assert.equal((await fetch(`${origin}/api/backup`)).status, 204)

    async function post(value, revision) {
      return fetch(`${origin}/api/backup`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-LifeOS-Revision': revision,
        },
        body: JSON.stringify(value),
      })
    }

    assert.equal((await post({ broken: true }, 'none')).status, 400)
    assert.equal((await fetch(`${origin}/api/backup`)).status, 204)
    const saved = await post(emptyBackup('first'), 'none')
    assert.equal(saved.status, 200)
    const { revision } = await saved.json()
    assert.match(revision, /^[0-9a-f]{64}$/)
    assert.equal((await post(emptyBackup('stale'), 'none')).status, 409)
    assert.equal((await fetch(`${origin}/api/backup`)).status, 200)
    assert.equal((await (await fetch(`${origin}/api/backup`)).json()).tasks[0].title, 'first')

    const updated = await post(emptyBackup('second'), revision)
    assert.equal(updated.status, 200)
    assert.equal(JSON.parse(await fs.readFile(first.previousFile, 'utf8')).tasks[0].title, 'first')
    assert.equal(JSON.parse(await fs.readFile(first.dataFile, 'utf8')).tasks[0].title, 'second')
    await close(server)

    server = createLifeOSServer({ distDir, dataDir }).server
    origin = await listen(server)
    assert.equal((await (await fetch(`${origin}/api/backup`)).json()).tasks[0].title, 'second')
    const status = await (await fetch(`${origin}/api/status`)).json()
    assert.equal(status.appId, 'lifeos-local-file-v1')
    assert.equal(status.projectDir, path.dirname(distDir))
    assert.equal(status.dataFile, first.dataFile)
  } finally {
    if (server.listening) await close(server)
    const resolved = await fs.realpath(testDir)
    const tempRoot = path.resolve(os.tmpdir())
    assert.ok(resolved.startsWith(`${tempRoot}${path.sep}`) &&
      path.basename(resolved).startsWith('lifeos-server-test-'),
    `Unsafe test cleanup target: ${resolved}`)
    await fs.rm(resolved, { recursive: true })
  }
})
