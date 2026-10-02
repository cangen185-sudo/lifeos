import { useCallback, useEffect, useState } from 'react'
import type { GrowthState } from '../domain/growth'

export type GrowthStatus = GrowthState & { file: string; schedulerError: string | null; timeZone: string; conflicts: { left: string; right: string }[] }

export async function growthRequest<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/growth${path}`, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('此入口没有成长服务，请从本地启动入口打开。')
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? `请求失败：${response.status}`)
  return value as T
}

export function useGrowth() {
  const [state, setState] = useState<GrowthStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    const value = await growthRequest<GrowthStatus>()
    setState(previous => !previous || value.revision >= previous.revision ? value : previous)
    return value
  }, [])
  useEffect(() => {
    let active = true
    const load = () => {
      if (document.visibilityState === 'hidden') return
      growthRequest<GrowthStatus>().then(value => { if (active) setState(previous => !previous || value.revision >= previous.revision ? value : previous) }).catch(e => { if (active) setError(e.message) })
    }
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('focus', load)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', load) }
  }, [])
  const action = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await work(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setBusy(false) }
  }
  return { state, error, busy, action, refresh }
}

export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
