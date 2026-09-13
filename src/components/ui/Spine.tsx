import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './primitives'

export type NodeTone = 'must' | 'should' | 'optional' | 'running' | 'done' | 'root' | 'branch'

/**
 * Vertical line with nodes hanging off it. The one recurring visual in LifeOS:
 * intent flows top → bottom, from desire to today's task.
 */
export function Spine({
  children,
  className,
  animate = true,
}: {
  children: ReactNode
  className?: string
  animate?: boolean
}) {
  return (
    <ol className={cx('relative', className)}>
      <span
        aria-hidden
        className={cx(
          'pointer-events-none absolute bottom-0 left-[7px] top-2 w-px bg-line-strong',
          animate && 'draw-down',
        )}
      />
      {children}
    </ol>
  )
}

export function SpineNode({
  tone,
  children,
  index = 0,
  className,
  as: Tag = 'li',
}: {
  tone: NodeTone
  children: ReactNode
  index?: number
  className?: string
  as?: 'li' | 'div'
}) {
  return (
    <Tag
      className={cx('relative pl-9 rise', className)}
      style={{ ['--i' as string]: index }}
    >
      <NodeMark tone={tone} />
      {children}
    </Tag>
  )
}

export function NodeMark({ tone, className }: { tone: NodeTone; className?: string }) {
  const base = 'absolute left-0 top-[0.55rem] grid size-[15px] place-items-center rounded-full ring-4 ring-bone'
  if (tone === 'done') {
    return (
      <span className={cx(base, 'bg-moss text-paper', className)} aria-hidden>
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (tone === 'running') {
    return (
      <span className={cx(base, 'bg-copper breathe', className)} aria-hidden>
        <span className="size-1.5 rounded-full bg-paper" />
      </span>
    )
  }
  if (tone === 'must' || tone === 'root') {
    return <span className={cx(base, 'bg-ink', className)} aria-hidden />
  }
  if (tone === 'should' || tone === 'branch') {
    return (
      <span className={cx(base, 'border-[1.5px] border-ink bg-bone', className)} aria-hidden />
    )
  }
  return (
    <span className={cx(base, className)} aria-hidden>
      <span className="size-1.5 rounded-full bg-faint" />
    </span>
  )
}
