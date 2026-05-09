import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOrders, type OrderRow, type OrderState } from '../hooks/useOrders'
import { Card } from '../components/ui/Card'
import { cn } from '../lib/utils'

const ALL_STATES: OrderState[] = [
  'inquiry', 'quoted', 'confirmed', 'paid', 'preparing',
  'out_for_delivery', 'delivered', 'reviewed', 'cancelled',
]

const STATE_LABELS: Record<OrderState, string> = {
  inquiry: 'Inquiry',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  paid: 'Paid',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  reviewed: 'Reviewed',
  cancelled: 'Cancelled',
}

const STATE_BADGE: Record<OrderState, string> = {
  inquiry:          'bg-text-muted/15 text-text-muted',
  quoted:           'bg-accent/10 text-accent',
  confirmed:        'bg-accent/15 text-accent',
  paid:             'bg-emerald-500/15 text-emerald-500',
  preparing:        'bg-purple-500/15 text-purple-500',
  out_for_delivery: 'bg-amber-500/15 text-amber-600',
  delivered:        'bg-emerald-500/20 text-emerald-600',
  reviewed:         'bg-emerald-500/20 text-emerald-600',
  cancelled:        'bg-red-500/15 text-red-500',
}

function fmtMoney(n: number | null): string {
  if (n == null) return '—'
  return n.toFixed(2).replace(/\.00$/, '')
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function summarizeItems(items: OrderRow['items']): string {
  if (!items || items.length === 0) return '—'
  return items.map(i => `${i.qty ?? 1}× ${i.name ?? 'item'}`).join(' + ')
}

type Filter = 'all' | 'open' | OrderState

export function OrdersPage() {
  const { user } = useAuth()
  const { orders, loading, updateState, counts } = useOrders(user?.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filter !== 'all') {
        if (filter === 'open') {
          if (['delivered', 'reviewed', 'cancelled'].includes(o.state)) return false
        } else if (o.state !== filter) {
          return false
        }
      }
      if (search) {
        const s = search.toLowerCase()
        const blob = `${o.customer_name ?? ''} ${o.customer_phone ?? ''} ${summarizeItems(o.items)} ${o.delivery_addr ?? ''} ${o.id}`.toLowerCase()
        if (!blob.includes(s)) return false
      }
      return true
    })
  }, [orders, filter, search])

  const openCount = orders.filter(o => !['delivered', 'reviewed', 'cancelled'].includes(o.state)).length

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Orders</h1>
          <p className="text-sm text-text-muted mt-1">
            {orders.length} total · {openCount} open · click any row for full delivery details.
          </p>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1 overflow-x-auto">
          {([
            ['all', `All (${orders.length})`],
            ['open', `Open (${openCount})`],
            ...ALL_STATES.map(s => [s, `${STATE_LABELS[s]} (${counts.get(s) ?? 0})`] as const),
          ] as Array<readonly [Filter, string]>).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                filter === k ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer, phone, item, address…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-text-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-text-muted">
            {orders.length === 0 ? 'No orders yet. Vector will populate this as customers place orders.' : 'No orders match your filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border bg-surface-2">
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Items</th>
                  <th className="px-3 py-3 font-medium text-right">Total</th>
                  <th className="px-3 py-3 font-medium">When</th>
                  <th className="px-3 py-3 font-medium">Delivery</th>
                  <th className="px-5 py-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const isOpen = expanded === o.id
                  return (
                    <>
                      <tr
                        key={o.id}
                        onClick={() => setExpanded(isOpen ? null : o.id)}
                        className="border-b border-border hover:bg-surface-2 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-text">{o.customer_name ?? 'Unknown'}</div>
                          <div className="text-xs text-text-muted">{o.customer_phone ?? '—'}</div>
                        </td>
                        <td className="px-3 py-3 text-text max-w-[260px] truncate">{summarizeItems(o.items)}</td>
                        <td className="px-3 py-3 text-text font-medium tabular-nums text-right">
                          {o.total_amount != null ? `GHS ${fmtMoney(o.total_amount)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-text-muted text-xs whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                        <td className="px-3 py-3 text-text-muted text-xs">
                          {o.delivery_date ?? '—'}{o.delivery_addr && <div className="truncate max-w-[140px]">{o.delivery_addr}</div>}
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', STATE_BADGE[o.state])}>
                            {STATE_LABELS[o.state]}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-2 border-b border-border">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Order ID</p>
                                <p className="font-mono text-xs text-text">{o.id}</p>
                                <p className="text-xs text-text-muted mt-2">Updated {o.updated_at ? fmtDateTime(o.updated_at) : '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Items</p>
                                <ul className="text-text space-y-0.5">
                                  {(o.items ?? []).map((it, i) => (
                                    <li key={i}>{it.qty ?? 1}× {it.name ?? '?'} {it.price != null && <span className="text-text-muted">@ GHS {it.price}</span>}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Delivery</p>
                                <p className="text-text">{o.delivery_addr ?? '—'}</p>
                                <p className="text-text-muted text-xs">{o.delivery_date ?? 'No date'}</p>
                                {o.payment_ref && <p className="text-xs text-text-muted mt-2">Payment ref: <span className="font-mono text-text">{o.payment_ref}</span></p>}
                                {o.notes && <p className="text-xs text-text-muted mt-2">Notes: {o.notes}</p>}
                              </div>
                            </div>

                            {/* State changer */}
                            <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-text-muted">Move to:</span>
                              {ALL_STATES.filter(s => s !== o.state).map(s => (
                                <button
                                  key={s}
                                  onClick={(e) => { e.stopPropagation(); updateState(o.id, s) }}
                                  className="px-2 py-1 rounded-md border border-border text-text-muted hover:text-text hover:bg-surface text-[11px] transition-colors"
                                >
                                  {STATE_LABELS[s]}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
