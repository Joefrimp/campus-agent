import { cn } from '../../lib/utils'
import type { RecentTransaction } from '../../hooks/useFinances'

interface Props {
  items: RecentTransaction[]
}

export function TransactionsList({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-text-muted">
        No recent activity.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {items.map(t => (
        <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
          <div
            className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
              t.kind === 'order' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
            )}
          >
            {t.kind === 'order' ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text truncate">{t.detail || t.label}</p>
            <p className="text-xs text-text-muted">
              {t.kind === 'order' ? 'Order' : t.label}{' '}· {new Date(t.date).toLocaleDateString()}
              {t.state && ` · ${t.state}`}
            </p>
          </div>
          <span
            className={cn(
              'text-sm font-semibold tabular-nums whitespace-nowrap',
              t.kind === 'order' ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {t.kind === 'order' ? '+' : '-'}GHS {t.amount.toFixed(2).replace(/\.00$/, '')}
          </span>
        </li>
      ))}
    </ul>
  )
}
