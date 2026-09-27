import { Link } from 'react-router-dom'
import type { Intervention } from '../domain/intervention'
import { Button } from './ui/primitives'

export function InterventionBanner({
  item,
  onDismiss,
  onAdjust,
}: {
  item: Intervention
  onDismiss: () => void
  onAdjust?: () => void
}) {
  const toReview = item.kind === 'REVIEW_REQUIRED'
  const why = item.facts?.whyPath ?? []
  return (
    <aside className="rise border-y border-copper/35 py-4" style={{ ['--i' as string]: 1 }}>
      <p className="font-mono text-[11px] tracking-[0.22em] text-copper">
        {labelKind(item.kind)}
      </p>
      <p className="mt-2 text-[16px] leading-7 text-ink">{item.title}</p>
      <p className="mt-1 text-[14px] leading-6 text-mute">{item.body}</p>
      {why.length > 0 ? (
        <p className="mt-1.5 font-mono text-[11px] leading-5 text-faint">{why.join(' · ')}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        {toReview ? (
          <Link to="/review" className="text-[13px] text-copper underline-offset-4 hover:underline">
            去复盘 →
          </Link>
        ) : null}
        {onAdjust ? (
          <Button variant="quiet" size="sm" onClick={onAdjust}>
            调整这件事
          </Button>
        ) : null}
        <Button variant="quiet" size="sm" onClick={onDismiss}>
          这条已知晓
        </Button>
      </div>
    </aside>
  )
}

function labelKind(kind: Intervention['kind']): string {
  if (kind === 'REVIEW_REQUIRED') return 'Review'
  if (kind === 'CONFLICT_WARNING') return 'Conflict'
  if (kind === 'RESCOPE_SUGGESTION') return 'Rescope'
  if (kind === 'START_REMINDER') return 'Start'
  return 'Consequence'
}
