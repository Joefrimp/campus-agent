import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { TopList, type TopListItem } from '../components/ui/TopList'
import { StatCard } from '../components/finances/StatCard'
import { AgentPulse } from '../components/whatsapp/AgentPulse'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useTrialStatus } from '../hooks/useTrialStatus'
import { useWhatsAppChannel } from '../hooks/useWhatsAppChannel'
import { useFinances } from '../hooks/useFinances'
import { useAgentLogs } from '../hooks/useAgentLogs'
import { useCatalogue } from '../hooks/useCatalogue'
import { useUnansweredMessages } from '../hooks/useUnansweredMessages'

function fmtMoney(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '')
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function DashboardPage() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { daysLeft, messagesUsed, messageLimit } = useTrialStatus(profile, user?.id)
  const { channel } = useWhatsAppChannel(user?.id)
  const { summary, loading: financesLoading } = useFinances(user?.id, '30d')
  const { logs, loading: logsLoading } = useAgentLogs(user?.id)
  const { items: catalogueItems } = useCatalogue(user?.id)
  const { items: unanswered, loading: unansweredLoading } = useUnansweredMessages(user?.id, profile?.phone)

  // Top products (from raw orders → items)
  const topProducts: TopListItem[] = (() => {
    const tally = new Map<string, { qty: number; revenue: number }>()
    summary.recent.forEach((t) => {
      if (t.kind !== 'order') return
      // detail is the items string; we approximate without re-querying
      const items = t.detail.split('+').map(s => s.trim()).filter(Boolean)
      items.forEach((it) => {
        const m = it.match(/^(\d+)?[×x]?\s*(.+)$/)
        const qty = m && m[1] ? Number(m[1]) : 1
        const name = m ? (m[2] ?? '').trim() : it
        if (!name) return
        const cur = tally.get(name) ?? { qty: 0, revenue: 0 }
        cur.qty += qty
        cur.revenue += t.amount / Math.max(items.length, 1)
        tally.set(name, cur)
      })
    })
    return [...tally.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([name, t]) => ({
        label: name,
        value: `GHS ${fmtMoney(t.revenue)}`,
        numeric: t.revenue,
        sub: `${t.qty} sold`,
      }))
  })()

  // Low-stock alerts (from catalogue)
  const lowStock: TopListItem[] = catalogueItems
    .filter(it => it.kind !== 'service' && it.stock_qty != null && it.stock_qty <= (it.low_stock_threshold ?? 3))
    .sort((a, b) => (a.stock_qty ?? 0) - (b.stock_qty ?? 0))
    .slice(0, 5)
    .map(it => ({
      label: it.name,
      value: it.stock_qty === 0 ? 'OUT' : `${it.stock_qty} left`,
      numeric: Math.max(1, (it.low_stock_threshold ?? 3) - (it.stock_qty ?? 0) + 1),
      color: it.stock_qty === 0 ? '#EF4444' : '#F59E0B',
    }))

  const trialUrgent = profile?.plan === 'trial' && daysLeft <= 3

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {profile?.business_name ? `Welcome back, ${profile.first_name}` : 'Dashboard'}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {profile?.human_in_loop
              ? "Manual mode is on — Vector is paused and you're handling messages directly."
              : channel?.status === 'authorized'
                ? "Vector is live and handling messages — here's your last 30 days."
                : 'Connect WhatsApp to bring Vector online.'}
          </p>
        </div>
        {channel?.status !== 'authorized' && (
          <Link
            to="/dashboard/setup"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors shadow-sm"
          >
            Setup WhatsApp
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* KPI row with sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Revenue"
          value={`GHS ${fmtMoney(summary.totals.revenue)}`}
          accent="blue"
          periodLabel="30 days"
          sparkline={summary.daily.map(d => d.revenue)}
        />
        <StatCard
          label="Orders"
          value={String(summary.totals.orders)}
          accent="purple"
          periodLabel="30 days"
          sparkline={summary.daily.map(d => d.orders)}
          delta={summary.totals.avg_order_value > 0
            ? { positive: true, text: `Avg GHS ${fmtMoney(summary.totals.avg_order_value)}` }
            : undefined}
        />
        <StatCard
          label="Messages used"
          value={`${messagesUsed} / ${messageLimit}`}
          accent={messagesUsed >= messageLimit * 0.8 ? 'amber' : 'green'}
          periodLabel="Trial"
        />
        <StatCard
          label={profile?.plan === 'pro' ? 'Plan' : 'Trial days left'}
          value={profile?.plan === 'pro' ? 'Pro' : `${daysLeft}d`}
          accent={profile?.plan === 'pro' ? 'green' : trialUrgent ? 'red' : 'gray'}
          periodLabel={profile?.plan === 'pro' ? undefined : 'Free trial'}
        />
      </div>

      {/* Two-column: Agent status + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
            <div>
              <h2 className="font-semibold text-text mb-1">Vector — your AI agent</h2>
              <p className="text-sm text-text-muted">
                {profile?.human_in_loop
                  ? 'Paused. You\'re replying to customers manually from WhatsApp. Toggle Manual Mode off in the sidebar to bring Vector back online.'
                  : channel?.status === 'authorized'
                    ? 'Active and replying to WhatsApp customers in real-time.'
                    : 'Vector is ready — just needs your WhatsApp connected.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {profile?.human_in_loop ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Paused (Manual)
                </span>
              ) : (
                <span className={
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ' +
                  (channel?.status === 'authorized'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : channel?.status === 'initializing'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-surface-2 text-text-muted')
                }>
                  <span className={
                    'h-1.5 w-1.5 rounded-full ' +
                    (channel?.status === 'authorized' ? 'bg-emerald-400 animate-pulse'
                      : channel?.status === 'initializing' ? 'bg-amber-400 animate-pulse'
                        : 'bg-text-faint')
                  } />
                  {channel?.status === 'authorized' ? 'Live' : channel?.status === 'initializing' ? 'Connecting' : 'Offline'}
                </span>
              )}
            </div>
          </div>
          {channel && !profile?.human_in_loop && <AgentPulse status={channel.status} brandVoiceProvisioned={!!profile?.brand_voice} />}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-text mb-3">Jump in</h2>
          <div className="space-y-2">
            {[
              { href: '/dashboard/catalogue', label: 'Manage catalogue', sub: `${catalogueItems.length} items` },
              { href: '/dashboard/sales', label: 'Sales stream', sub: 'Live customer chats' },
              { href: '/dashboard/finances', label: 'Finances', sub: `GHS ${fmtMoney(summary.totals.revenue)} this month` },
              { href: '/dashboard/settings', label: 'Settings & integrations', sub: 'Brand voice, schedule, Pro tools' },
            ].map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="flex items-center justify-between -mx-2 px-2 py-2 rounded-lg hover:bg-surface-2 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-text">{link.label}</p>
                  <p className="text-xs text-text-muted">{link.sub}</p>
                </div>
                <svg className="h-4 w-4 text-text-faint group-hover:text-text transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Needs your attention — customer messages Vector didn't auto-reply to */}
      <Card className={'p-5 ' + (unanswered.length > 0 ? 'border border-amber-500/30 bg-amber-500/[0.03]' : '')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-text">Needs your attention</h2>
            {unanswered.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold bg-amber-500 text-black">
                {unanswered.length}
              </span>
            )}
          </div>
          <span className="text-xs text-text-muted">Last 48h · not auto-replied</span>
        </div>
        {unansweredLoading ? (
          <div className="h-20 animate-pulse rounded bg-surface-2" />
        ) : unanswered.length === 0 ? (
          <div className="px-2 py-6 text-sm text-text-muted text-center">
            You're all caught up — nothing left unanswered 🎉
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {unanswered.map((m) => (
              <li key={m.from} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-amber-500">
                  {m.from.slice(-2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text truncate">{m.from}</p>
                    <span className="text-xs text-text-muted flex-shrink-0">{relativeTime(m.when)}</span>
                  </div>
                  <p className="text-sm text-text-muted truncate">{m.last_message || '[no text]'}</p>
                </div>
                <a
                  href={`https://wa.me/${m.from.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-xs font-medium text-accent hover:text-accent-hover whitespace-nowrap mt-0.5"
                >
                  Reply →
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Top products + Low stock + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text">Top products</h2>
            <span className="text-xs text-text-muted">30 days</span>
          </div>
          {financesLoading ? (
            <div className="h-32 animate-pulse rounded bg-surface-2" />
          ) : (
            <TopList
              items={topProducts}
              empty={<>No paid orders in the last 30 days yet.</>}
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text">Stock alerts</h2>
            <Link to="/dashboard/catalogue" className="text-xs text-accent hover:text-accent-hover">View all</Link>
          </div>
          {lowStock.length === 0 ? (
            <div className="px-2 py-6 text-sm text-text-muted text-center">All stock healthy 🎉</div>
          ) : (
            <TopList items={lowStock} />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text">Recent agent activity</h2>
            <Link to="/dashboard/logs" className="text-xs text-accent hover:text-accent-hover">View all</Link>
          </div>
          {logsLoading ? (
            <div className="h-32 animate-pulse rounded bg-surface-2" />
          ) : logs.length === 0 ? (
            <div className="px-2 py-6 text-sm text-text-muted text-center">No conversations yet.</div>
          ) : (
            <ul className="space-y-3">
              {logs.slice(0, 5).map((log) => (
                <li key={log.id} className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-accent">
                    {(log.contact_phone ?? '??').slice(-2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text truncate">{log.inbound_message}</p>
                    <p className="text-xs text-text-muted truncate">{relativeTime(log.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
