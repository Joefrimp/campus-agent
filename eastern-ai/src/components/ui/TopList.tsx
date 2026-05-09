/**
 * Compact list of items with inline progress bars — used for "Where money went",
 * "Top products", "Top customers" etc. Each row shows a colored marker, a label,
 * a value, and a bar whose width is the item's share of the max.
 */
import { cn } from '../../lib/utils'

export interface TopListItem {
  label: string
  value: string | number   // displayed verbatim (already formatted)
  numeric: number          // used to compute bar width
  color?: string           // CSS color for the bar + dot. Defaults rotate.
  href?: string            // optional click target (renders an <a>)
  sub?: string             // small line under the label (e.g. "12 sold")
}

interface Props {
  items: TopListItem[]
  /** Caps how many to render. */
  limit?: number
  /** When true (default), bar widths are scaled to the largest item. */
  scaleToMax?: boolean
  /** Empty-state node. */
  empty?: React.ReactNode
  /** Class for the container (so callers can size). */
  className?: string
}

const DEFAULT_PALETTE = ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#A855F7']

export function TopList({ items, limit = 8, scaleToMax = true, empty, className }: Props) {
  const slice = items.slice(0, limit)
  if (slice.length === 0) {
    return (
      <div className={cn('px-2 py-6 text-sm text-text-muted text-center', className)}>
        {empty ?? 'Nothing here yet.'}
      </div>
    )
  }
  const max = scaleToMax ? Math.max(...slice.map((i) => i.numeric), 1) : 100

  return (
    <ul className={cn('space-y-3', className)}>
      {slice.map((it, idx) => {
        const color = it.color ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length]
        const pct = Math.min(100, Math.round((it.numeric / max) * 100))
        const Tag: 'a' | 'div' = it.href ? 'a' : 'div'
        return (
          <li key={idx}>
            <Tag
              href={it.href}
              className={cn(
                'block group',
                it.href && 'hover:bg-surface-2 -mx-2 px-2 py-1 rounded-lg transition-colors cursor-pointer',
              )}
            >
              <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-text truncate font-medium">{it.label}</span>
                  {it.sub && <span className="text-text-faint text-xs truncate">· {it.sub}</span>}
                </div>
                <span className="text-text tabular-nums font-medium flex-shrink-0">{it.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
