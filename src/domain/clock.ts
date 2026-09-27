import { format } from 'date-fns'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function todayKey(now = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false
  const [year, month, day] = dateKey.split('-').map(Number)
  const parsed = parseDateKey(dateKey)
  return parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month && parsed.getDate() === day
}

export function shiftDate(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return todayKey(date)
}

export function weekdayLabel(dateKey: string): string {
  return WEEKDAYS[parseDateKey(dateKey).getDay()] ?? ''
}

export function monthDayLabel(dateKey: string): string {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatDisplayDate(dateKey: string): string {
  return `${monthDayLabel(dateKey)} ${weekdayLabel(dateKey)}`
}

export function combineDateAndTime(dateKey: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const date = parseDateKey(dateKey)
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

export function datesBetween(from: string, to: string): string[] {
  const keys: string[] = []
  let cursor = from
  while (cursor <= to) {
    keys.push(cursor)
    cursor = shiftDate(cursor, 1)
    if (keys.length > 366) break
  }
  return keys
}

export function lastNDates(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(end, index - count + 1))
}

export function minutesUntilEndOfDay(now = new Date()): number {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return Math.max(0, Math.round((end.getTime() - now.getTime()) / 60_000))
}
