import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type Period = 'week' | 'month' | '30d'

export interface DailyPoint {
  date: string
  revenue: number
  expenses: number
  orders: number
}

export interface CategorySlice {
  category: string
  amount: number
}

export interface RecentTransaction {
  id: string
  kind: 'order' | 'expense'
  date: string
  label: string
  detail: string
  amount: number
  state?: string
}

export interface FinancesSummary {
  totals: {
    revenue: number
    expenses: number
    net: number
    orders: number
    avg_order_value: number
  }
  daily: DailyPoint[]
  categories: CategorySlice[]
  recent: RecentTransaction[]
}

const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, '30d': 30 }

function emptySummary(): FinancesSummary {
  return {
    totals: { revenue: 0, expenses: 0, net: 0, orders: 0, avg_order_value: 0 },
    daily: [],
    categories: [],
    recent: [],
  }
}

export function useFinances(userId: string | undefined, period: Period = 'month') {
  const [summary, setSummary] = useState<FinancesSummary>(emptySummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const days = PERIOD_DAYS[period]
  const since = useMemo(() => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(), [days])

  const refetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setError(null)

    try {
      const [{ data: orders, error: oErr }, { data: expenses, error: eErr }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, state, total_amount, items, created_at, customer_id')
          .eq('user_id', userId)
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, amount, description, category, recorded_at')
          .eq('user_id', userId)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: false }),
      ])
      if (oErr) throw oErr
      if (eErr && eErr.code !== '42P01') throw eErr // ignore "table doesn't exist" (pre-migration)

      const ord = orders ?? []
      const exp = expenses ?? []

      const closed = ord.filter(o => o.state === 'paid' || o.state === 'delivered')
      const revenue = closed.reduce((s, o) => s + Number(o.total_amount ?? 0), 0)
      const totalExpenses = exp.reduce((s, e) => s + Number(e.amount ?? 0), 0)

      // Daily series
      const map = new Map<string, DailyPoint>()
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000)
        const k = d.toISOString().slice(0, 10)
        map.set(k, { date: k, revenue: 0, expenses: 0, orders: 0 })
      }
      for (const o of closed) {
        const k = new Date(o.created_at).toISOString().slice(0, 10)
        const slot = map.get(k); if (slot) { slot.revenue += Number(o.total_amount ?? 0); slot.orders += 1 }
      }
      for (const e of exp) {
        const k = new Date(e.recorded_at).toISOString().slice(0, 10)
        const slot = map.get(k); if (slot) slot.expenses += Number(e.amount ?? 0)
      }

      // Category breakdown of expenses
      const cat = new Map<string, number>()
      for (const e of exp) {
        const k = e.category ?? 'other'
        cat.set(k, (cat.get(k) ?? 0) + Number(e.amount ?? 0))
      }

      // Recent transactions (top 20 by date, interleaved)
      const recent: RecentTransaction[] = []
      for (const o of closed.slice(0, 20)) {
        recent.push({
          id: `o-${o.id}`,
          kind: 'order',
          date: o.created_at,
          label: 'Order',
          detail: ((o.items ?? []) as Array<{ name?: string; qty?: number }>)
            .map(i => `${i.qty ?? 1}× ${i.name ?? '?'}`).join(' + ') || 'Order',
          amount: Number(o.total_amount ?? 0),
          state: o.state,
        })
      }
      for (const e of exp.slice(0, 20)) {
        recent.push({
          id: `e-${e.id}`,
          kind: 'expense',
          date: e.recorded_at,
          label: e.category ?? 'expense',
          detail: e.description ?? '',
          amount: Number(e.amount ?? 0),
        })
      }
      recent.sort((a, b) => b.date.localeCompare(a.date))

      setSummary({
        totals: {
          revenue,
          expenses: totalExpenses,
          net: revenue - totalExpenses,
          orders: closed.length,
          avg_order_value: closed.length > 0 ? revenue / closed.length : 0,
        },
        daily: [...map.values()],
        categories: [...cat.entries()]
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount),
        recent: recent.slice(0, 20),
      })
    } catch (err) {
      setError((err as Error).message)
    }
    setLoading(false)
  }, [userId, since, days])

  useEffect(() => { refetch() }, [refetch])

  return { summary, loading, error, refetch }
}
