import { cx } from './primitives'

export function Meter({
  value,
  max,
  label,
  className,
  thin = false,
}: {
  value: number
  max: number
  label: string
  className?: string
  thin?: boolean
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  const over = max > 0 && value > max
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx(
        'relative w-full overflow-hidden rounded-full bg-line',
        thin ? 'h-1' : 'h-1.5',
        className,
      )}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-quart)]',
          over ? 'bg-copper' : 'bg-ink',
        )}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
      {!thin && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-bone"
          style={{ left: '75%' }}
        />
      )}
    </div>
  )
}
