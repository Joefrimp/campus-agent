import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type ItemKind = 'product' | 'service' | 'both'

export interface CatalogueItem {
  id: string
  user_id: string
  name: string
  description: string | null
  price: number | null
  min_price: number | null
  in_stock: boolean
  stock_qty: number | null
  category: string | null
  image_url: string | null
  kind: ItemKind
  unit: string | null
  duration_minutes: number | null
  low_stock_threshold: number | null
  updated_at: string | null
}

export function useCatalogue(userId: string | undefined) {
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('price_list')
      .select('id, user_id, name, description, price, min_price, in_stock, stock_qty, category, image_url, kind, unit, duration_minutes, low_stock_threshold, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (err) setError(err.message)
    else setItems((data ?? []) as CatalogueItem[])
    setLoading(false)
  }, [userId])

  useEffect(() => { refetch() }, [refetch])

  const upsert = useCallback(async (item: Partial<CatalogueItem> & { name: string }) => {
    if (!userId) return { error: 'no user' }
    const payload = { ...item, user_id: userId }
    const q = item.id
      ? supabase.from('price_list').update(payload).eq('id', item.id)
      : supabase.from('price_list').insert(payload)
    const { error: err } = await q
    if (!err) await refetch()
    return { error: err?.message }
  }, [userId, refetch])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('price_list').delete().eq('id', id)
    if (!err) await refetch()
    return { error: err?.message }
  }, [refetch])

  const uploadImage = useCallback(async (file: File): Promise<{ url?: string; error?: string }> => {
    if (!userId) return { error: 'no user' }
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('product-images')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
    if (upErr) return { error: upErr.message }
    const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path)
    return { url: pub.publicUrl }
  }, [userId])

  return { items, loading, error, refetch, upsert, remove, uploadImage }
}
