import { format } from 'date-fns'

export function todayKey(now = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

export function formatDisplayDate(dateKey: string): string {
  return dateKey
}

export function minutesUntilEndOfDay(now = new Date()): number {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return Math.max(0, Math.round((end.getTime() - now.getTime()) / 60_000))
}
