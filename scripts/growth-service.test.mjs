import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLifeOSServer } from './lifeos-local-server.mjs'
import { createGrowthService } from './growth-service.mjs'

const stamp = '2026-09-25T01:00:00.000Z'
const fixture = () => ({ version: 5, exportedAt: stamp, dailyPlans: [{ date: '2026-09-25', capacityMinutes: 10, lockedAt: stamp, confirmedMusts: [{ taskId: 't', title: '阅读', priorityBand: 'must', plannedMinutes: 30, desireIds: [], desireTitles: [] }] }], tasks: [{ id: 't', title: '阅读', priorityBand: 'must', status: 'planned', plannedMinutes: 30, plannedDate: '2026-09-25', createdAt: stamp }], workSessions: [], taskEvents: [], desires: [], goals: [], commitments: [], dailyReviews: [], interventionEvents: [] })

test('growth HTTP: persists independent reports, idempotency, evidence, conflicts, and source protection', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifeos-growth-test-'))
  const dataDir = path.join(dir, 'data')
  await fs.mkdir(dataDir)
  const backup = JSON.stringify(fixture())
  await fs.writeFile(path.join(dataDir, 'lifeos-backup.json'), backup)
  let { server } = createLifeOSServer({ dataDir, distDir: dir })
  let origin
  const start = async () => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}` }
  const post = (route, body, foreign = false) => fetch(`${origin}/api/growth${route}`, { method: 'POST', headers: { Origin: foreign ? 'https://evil.invalid' : origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const state = async () => (await fetch(`${origin}/api/growth`)).json()
  try {
    await start()
    assert.equal((await post('/run', { to: '2026-09-27' }, true)).status, 403)
    assert.equal((await post('/run', { to: 'bad' })).status, 400)
    const response = await post('/run', { to: '2026-09-27', days: 7 })
    assert.equal(response.status, 200)
    const report = await response.json()
    assert.equal(report.findings[0].id, 'capacity')
    assert.equal((await (await post('/run', { to: '2026-09-27', days: 7 })).json()).id, report.id)
    assert.equal((await state()).reports.length, 1)
    const handoff = await (await fetch(`${origin}/api/growth/handoff/${report.id}`)).json()
    assert.equal(handoff.report.id, report.id)
    const feedback = { revision: (await state()).revision, reportId: report.id, findingId: 'capacity', status: 'accepted', note: '明天少排一项' }
    assert.equal((await post('/feedback', feedback)).status, 200)
    assert.equal((await post('/feedback', feedback)).status, 409)
    const agent = { reportId: report.id, author: 'test-agent', observations: [{ text: '容量需要复核', evidenceIds: ['invented'] }], questions: [] }
    assert.equal((await post('/agent-results', agent)).status, 400)
    agent.observations[0].evidenceIds = [report.evidence[0].id]
    assert.equal((await post('/agent-results', agent)).status, 200)
    assert.equal((await post('/agent-results', agent)).status, 200)
    assert.equal((await state()).agentResults.length, 1)
    const items = [{ id: 'g1', kind: 'event', title: '会', updatedAt: stamp, start: '2026-09-27T09:00:00+08:00', end: '2026-09-27T10:00:00+08:00', allDay: false }]
    assert.equal((await post('/external', { revision: (await state()).revision, source: 'google-calendar', items })).status, 200)
    assert.equal((await post('/external', { revision: (await state()).revision, source: 'google-calendar', items })).status, 200)
    assert.equal((await state()).externalItems.length, 1)
    assert.equal((await post('/external', { revision: (await state()).revision, source: 'google-calendar', items: [{ ...items[0], title: '冲突' }] })).status, 409)
    assert.equal((await post('/external', { revision: (await state()).revision, source: 'google-calendar', items: [{ ...items[0], start: 'invalid' }] })).status, 400)
    assert.equal((await post('/schedule', { revision: (await state()).revision, enabled: true, time: '25:00' })).status, 400)
    assert.equal(await fs.readFile(path.join(dataDir, 'lifeos-backup.json'), 'utf8'), backup)
    await new Promise(resolve => server.close(resolve))
    server = createLifeOSServer({ dataDir, distDir: dir }).server
    await start()
    assert.equal((await state()).feedback[0].note, '明天少排一项')
    assert.equal((await state()).reports.length, 1)
    const exported = await (await fetch(`${origin}/api/growth/export`)).json()
    assert.equal(exported.state.externalItems.length, 1)
    await fs.writeFile(path.join(dataDir, 'lifeos-growth.json'), '{broken')
    assert.equal((await post('/run', { to: '2026-09-27' })).status, 500)
    assert.equal(await fs.readFile(path.join(dataDir, 'lifeos-growth.json'), 'utf8'), '{broken')
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve))
    const resolved = await fs.realpath(dir)
    assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}lifeos-growth-test-`))
    await fs.rm(resolved, { recursive: true })
  }
})

test('scheduler survives restart, catches up once, and reports unavailable source', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifeos-growth-scheduler-'))
  const bytes = Buffer.from(JSON.stringify(fixture()))
  let now = new Date(2026, 8, 28, 22)
  const read = async () => ({ bytes, revision: 'fixture' })
  try {
    let service = createGrowthService(dir, read, () => now)
    await service.handle('POST', '/api/growth/schedule', { revision: 0, enabled: true, time: '21:30' })
    await Promise.all([service.tick(), service.tick()])
    assert.equal((await service.handle('GET', '/api/growth')).reports.length, 1)
    service = createGrowthService(dir, read, () => now)
    await service.tick()
    assert.equal((await service.handle('GET', '/api/growth')).reports.length, 1)
    now = new Date(2026, 9, 1, 10)
    await service.tick()
    const state = await service.handle('GET', '/api/growth')
    assert.equal(state.reports.length, 2)
    assert.equal(state.schedule.lastRunDate, '2026-09-30')
    assert.equal(state.reports[0].to, '2026-09-29')
    service = createGrowthService(dir, async () => null, () => new Date(2026, 9, 2, 22))
    await service.tick()
    assert.match((await service.handle('GET', '/api/growth')).schedule.lastError, /还没有本地记录/)
    const failedRevision = (await service.handle('GET', '/api/growth')).revision
    await service.tick()
    assert.equal((await service.handle('GET', '/api/growth')).revision, failedRevision)
  } finally {
    const resolved = await fs.realpath(dir)
    assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}lifeos-growth-scheduler-`))
    await fs.rm(resolved, { recursive: true })
  }
})
