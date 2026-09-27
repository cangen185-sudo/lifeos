import type { ReactNode } from 'react'
import { Kicker } from './primitives'

export function EmptyState({
  kicker,
  title,
  body,
  action,
}: {
  kicker: string
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="rise relative overflow-hidden rounded-lg border border-line bg-paper/70 px-6 py-10 sm:px-10 sm:py-14">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 font-display text-[11rem] leading-none text-ink/[0.035] select-none"
      >
        ∅
      </span>
      <Kicker tone="copper">{kicker}</Kicker>
      <h2 className="mt-3 max-w-md font-display text-[2rem] leading-[1.2]">
        {title}
      </h2>
      <p className="mt-4 max-w-md text-[15px] leading-7 text-mute">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
