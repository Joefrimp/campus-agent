import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useFinances, type Period } from '../hooks/useFinances'
import { Card } from '../components/ui/Card'
import { TopList, type TopListItem } from '../components/ui/TopList'
import { StatCard } from '../components/finances/StatCard'
import { RevenueChart } from '../components/finances/RevenueChart'
import { TransactionsList } from '../components/finances/TransactionsList'
import { cn } from '../lib/utils'

const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week',
  month: 'This Month',
  '30d': 'Last 30 Days',
}

function fmtMoney(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '')
}

export function FinancesPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('month')
  const { summary, loading } = useFinances(user?.id, period)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Finances</h1>
          <p className="text-sm text-text-muted mt-1">
            Revenue, expenses, and profit trends — {PERIOD_LABELS[period].toLowerCase()}.
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-surface border border-border p-1">
          {(['week', 'month', '30d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                period === p
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Revenue"
          value={`GHS ${fmtMoney(summary.totals.revenue)}`}
          accent="blue"
          sparkline={summary.daily.map(d => d.revenue)}
        />
        <StatCard
          label="Expenses"
          value={`GHS ${fmtMoney(summary.totals.expenses)}`}
          accent="red"
          sparkline={summary.daily.map(d => d.expenses)}
        />
        <StatCard
          label="Net Profit"
          value={`GHS ${fmtMoney(summary.totals.net)}`}
          accent={summary.totals.net >= 0 ? 'green' : 'red'}
          sparkline={summary.daily.map(d => d.revenue - d.expenses)}
        />
        <StatCard
          label="Orders"
          value={String(summary.totals.orders)}
          accent="purple"
          sparkline={summary.daily.map(d => d.orders)}
          delta={summary.totals.avg_order_value > 0
            ? { positive: true, text: `Avg GHS ${fmtMoney(summary.totals.avg_order_value)}` }
            : undefined}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold text-text mb-1">Revenue vs Expenses</h2>
          <p className="text-xs text-text-muted mb-4">{PERIOD_LABELS[period]} · GHS</p>
          {loading ? (
            <div className="h-[260px] animate-pulse rounded bg-white/5" />
          ) : (
            <RevenueChart data={summary.daily} />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-text mb-1">Where money went</h2>
          <p className="text-xs text-text-muted mb-4">By category</p>
          {loading ? (
            <div className="h-[260px] animate-pulse rounded bg-white/5" />
          ) : (
            <TopList
              items={summary.categories.map<TopListItem>((c) => ({
                label: c.category,
                value: `GHS ${fmtMoney(c.amount)}`,
                numeric: c.amount,
              }))}
              empty={
                <>No expenses logged yet.<br />Use <code className="px-1 py-0.5 rounded bg-surface-2 text-xs">EXPENSE 50 supplier</code> via WhatsApp.</>
              }
            />
          )}
        </Card>
      </div>

      {/* Recent transactions */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-text">Recent activity</h2>
          <span className="text-xs text-text-muted">{summary.recent.length} of last 20</span>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-text-muted">Loading…</div>
        ) : (
          <TransactionsList items={summary.recent} />
        )}
      </Card>
    </div>
  )
}
