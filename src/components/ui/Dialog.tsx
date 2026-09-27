import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from './primitives'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  kicker?: string
  children: ReactNode
  /** `sheet` slides from the bottom on small screens; `center` is a classic modal. */
  mode?: 'sheet' | 'center'
  tone?: 'paper' | 'night'
}

export function Dialog({
  open,
  onClose,
  title,
  kicker,
  children,
  mode = 'sheet',
  tone = 'paper',
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-close])',
    )
    first?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const night = tone === 'night'
  return (
    <div
      className={cx(
        'fixed inset-0 z-40 flex justify-center bg-ink/45 backdrop-blur-[2px] fade-in',
        mode === 'sheet' ? 'items-end sm:items-center' : 'items-center',
        'p-0 sm:p-6',
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'sheet-up w-full max-w-md lift',
          night ? 'on-dark bg-night text-paper' : 'bg-paper text-ink',
          mode === 'sheet'
            ? 'rounded-t-lg pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-lg sm:pb-6'
            : 'rounded-lg pb-6',
          'px-5 pt-5 sm:px-6 sm:pt-6',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {kicker ? (
              <p
                className={cx(
                  'font-mono text-[11px] uppercase tracking-[0.24em]',
                  night ? 'text-copper' : 'text-mute',
                )}
              >
                {kicker}
              </p>
            ) : null}
            <h2 className="mt-1 font-display text-[1.6rem] leading-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="关闭"
            className={cx(
              'grid size-9 shrink-0 place-items-center rounded-md transition-colors',
              night ? 'text-paper/60 hover:bg-white/10 hover:text-paper' : 'text-mute hover:bg-bone hover:text-ink',
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
