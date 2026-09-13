import { cx } from './primitives'

/**
 * WHY chain: commitment → goal → desire, rendered as a quiet breadcrumb.
 * `path` is ordered nearest-first (as produced by whyPathFor).
 */
export function Chain({
  path,
  className,
  dark = false,
  empty = '未对齐人生方向',
}: {
  path: string[]
  className?: string
  dark?: boolean
  empty?: string
}) {
  if (path.length === 0) {
    return (
      <p className={cx('text-xs', dark ? 'text-paper/45' : 'text-faint', className)}>{empty}</p>
    )
  }
  return (
    <p
      className={cx(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-5',
        dark ? 'text-paper/75' : 'text-mute',
        className,
      )}
    >
      {path.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden className={cx('font-mono', dark ? 'text-copper' : 'text-copper')}>
              ↗
            </span>
          ) : null}
          <span className={index === path.length - 1 ? (dark ? 'text-paper' : 'text-ink') : ''}>
            {item}
          </span>
        </span>
      ))}
    </p>
  )
}
