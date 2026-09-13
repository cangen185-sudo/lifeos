import { ChevronDown } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Small mono eyebrow used above titles and sections. */
export function Kicker({
  children,
  tone = 'mute',
  className,
}: {
  children: ReactNode
  tone?: 'mute' | 'copper' | 'snow'
  className?: string
}) {
  const color =
    tone === 'copper' ? 'text-copper' : tone === 'snow' ? 'text-paper/60' : 'text-mute'
  return (
    <p className={cx('font-mono text-[11px] uppercase tracking-[0.24em]', color, className)}>
      {children}
    </p>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'ghost' | 'quiet' | 'copper'
  size?: 'md' | 'sm'
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-[background-color,color,border-color,transform] duration-200 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-40'
  const sizes =
    size === 'sm'
      ? 'min-h-9 px-3 text-[13px]'
      : 'min-h-11 min-w-11 px-4 text-sm'
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    solid: 'bg-ink text-paper hover:bg-ink-soft',
    copper: 'bg-copper text-paper hover:bg-[#9a6323]',
    ghost:
      'border border-line-strong bg-transparent text-ink hover:border-ink hover:bg-paper',
    quiet: 'text-mute hover:text-ink hover:bg-paper',
  }
  return <button className={cx(base, sizes, variants[variant], className)} {...rest} />
}

const fieldBase =
  'w-full rounded-md border border-line bg-paper px-3 py-2.5 text-[15px] text-ink placeholder:text-faint transition-colors duration-200 hover:border-line-strong focus:border-ink focus:outline-none'

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, className)} {...rest} />
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, 'resize-none leading-6', className)} {...rest} />
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx('relative inline-flex w-full', className)}>
      <select
        className={cx(fieldBase, 'appearance-none pr-9 min-h-11')}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mute"
        aria-hidden
      />
    </span>
  )
}

/** Label + control stack with a mono caption. */
export function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string
  children: ReactNode
  className?: string
  hint?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-[0.18em] text-mute">{label}</span>
        {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
  dark = false,
  className,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
  name: string
  dark?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      className={cx(
        'grid rounded-md p-0.5',
        dark ? 'bg-white/8' : 'border border-line bg-bone',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <label
            key={option.id}
            className={cx(
              'flex min-h-10 cursor-pointer items-center justify-center rounded-[5px] font-mono text-[11px] tracking-[0.16em] transition-colors duration-200',
              active
                ? dark
                  ? 'bg-copper text-paper'
                  : 'bg-ink text-paper'
                : dark
                  ? 'text-paper/55 hover:text-paper'
                  : 'text-mute hover:text-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={active}
              onChange={() => onChange(option.id)}
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

/** Five-step importance selector shown as filled/hollow dots. */
export function ImportanceDots({
  value,
  onChange,
  size = 'md',
}: {
  value: 1 | 2 | 3 | 4 | 5
  onChange?: (value: 1 | 2 | 3 | 4 | 5) => void
  size?: 'md' | 'sm'
}) {
  const dot = size === 'sm' ? 'size-1.5' : 'size-2.5'
  const items = [1, 2, 3, 4, 5] as const
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-1" aria-label={`重要程度 ${value}`}>
        {items.map((item) => (
          <span
            key={item}
            className={cx(
              'rounded-full',
              dot,
              item <= value ? 'bg-copper' : 'border border-line-strong',
            )}
          />
        ))}
      </span>
    )
  }
  return (
    <div role="radiogroup" aria-label="重要程度" className="inline-flex items-center gap-1">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={item === value}
          aria-label={`重要程度 ${item}`}
          onClick={() => onChange(item)}
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-paper"
        >
          <span
            className={cx(
              'block size-2.5 rounded-full transition-colors duration-150',
              item <= value ? 'bg-copper' : 'border border-line-strong',
            )}
          />
        </button>
      ))}
    </div>
  )
}
