import { cn } from '../../lib/utils'
import { Sparkline } from '../ui/Sparkline'

interface Props {
  label: string
  value: string
  delta?: { positive: boolean; text: string }
  accent?: 'blue' | 'red' | 'green' | 'gray' | 'amber' | 'purple'
  /** Optional sparkline series (≥2 points) drawn at the bottom-right. */
  sparkline?: number[]
  /** Period chip shown top-right (e.g. "This month"). */
  periodLabel?: string
  /** Optional callback for period chip click (opens custom dropdown later). */
  onPeriodClick?: () => void
}

const accentMap: Record<NonNullable<Props['accent']>, { text: string; spark: string }> = {
  blue:   { text: 'text-accent',         spark: 'var(--color-accent)' },
  red:    { text: 'text-red-400',        spark: '#EF4444' },
  green:  { text: 'text-emerald-400',    spark: '#10B981' },
  gray:   { text: 'text-text',           spark: 'var(--color-text-muted)' },
  amber:  { text: 'text-amber-400',      spark: '#F59E0B' },
  purple: { text: 'text-purple-400',     spark: '#A855F7' },
}

export function StatCard({ label, value, delta, accent = 'gray', sparkline, periodLabel, onPeriodClick }: Props) {
  const colors = accentMap[accent]

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
        {periodLabel && (
          <button
            type="button"
            onClick={onPeriodClick}
            disabled={!onPeriodClick}
            className={cn(
              'inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border text-[10px] text-text-muted',
              onPeriodClick && 'hover:bg-surface-2 hover:text-text transition-colors cursor-pointer',
            )}
          >
            {periodLabel}
            {onPeriodClick && (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        )}
      </div>

      <p className={cn('text-[26px] leading-[1.1] font-bold tabular-nums', colors.text)}>{value}</p>

      <div className="flex items-end justify-between mt-auto pt-3 gap-2">
        {delta ? (
          <p className={cn('text-xs font-medium inline-flex items-center gap-1', delta.positive ? 'text-emerald-400' : 'text-red-400')}>
            <svg className={cn('h-3 w-3', !delta.positive && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
            {delta.text}
          </p>
        ) : <span />}
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} width={88} height={28} color={colors.spark} />
        )}
      </div>
    </div>
  )
}
