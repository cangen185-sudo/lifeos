import { useEffect, useState } from 'react'
import { todayKey } from '../domain/clock'

export function useLocalDate(): string {
  const [date, setDate] = useState(() => todayKey())
  useEffect(() => {
    const id = window.setInterval(() => setDate(todayKey()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return date
}
