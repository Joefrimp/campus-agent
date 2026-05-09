import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export type OrderState =
  | 'inquiry' | 'quoted' | 'confirmed' | 'paid' | 'preparing'
  | 'out_for_delivery' | 'delivered' | 'reviewed' | 'cancelled'

export interface OrderItem {
  name?: string
  qty?: number
  price?: number
}

export interface OrderRow {
  id: string
  state: OrderState
  items: OrderItem[]
  total_amount: number | null
  delivery_date: string | null
  delivery_addr: string | null
  payment_ref: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
}

export function useOrders(userId: string | undefined) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('orders')
      .select('id, state, items, total_amount, delivery_date, delivery_addr, payment_ref, notes, created_at, updated_at, customer_id, customers(display_name, phone)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const rows: OrderRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      state: row.state,
      items: (row.items ?? []) as OrderItem[],
      total_amount: row.total_amount != null ? Number(row.total_amount) : null,
      delivery_date: row.delivery_date,
      delivery_addr: row.delivery_addr,
      payment_ref: row.payment_ref,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      customer_id: row.customer_id,
      customer_name: row.customers?.display_name ?? null,
      customer_phone: row.customers?.phone ?? null,
    }))
    setOrders(rows)
    setLoading(false)
  }, [userId])

  useEffect(() => { refetch() }, [refetch])

  const updateState = useCallback(async (id: string, state: OrderState) => {
    await supabase.from('orders').update({ state }).eq('id', id)
    await refetch()
  }, [refetch])

  const counts = useMemo(() => {
    const map = new Map<OrderState, number>()
    for (const o of orders) map.set(o.state, (map.get(o.state) ?? 0) + 1)
    return map
  }, [orders])

  return { orders, loading, error, refetch, updateState, counts }
}
