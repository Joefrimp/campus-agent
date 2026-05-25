import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface UnansweredMessage {
  from: string
  last_message: string
  when: string
}

/**
 * Recent customer messages Vector did NOT reply to — the non-business
 * chatter it flags for the owner but never queues for approval. Reads
 * message_logs directly (RLS-gated to the owner) and surfaces customers
 * (real phone numbers) whose latest inbound got no outbound reply within
 * the window. Mirrors the owner-chat `unanswered_messages` tool.
 */
export function useUnansweredMessages(userId: string | undefined, ownerPhone?: string | null, windowHours = 48) {
  const [items, setItems] = useState<UnansweredMessage[]>([])
  const [loading, setLoading] = useState(true)

  const fetchIt = useCallback(async () => {
    if (!userId) return
    const since = new Date(Date.now() - windowHours * 3_600_000).toISOString()
    const { data } = await supabase
      .from('message_logs')
      .select('direction, contact_phone, content, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(400)

    const rows = data ?? []
    const ownerDigits = (ownerPhone ?? '').replace(/\D/g, '')
    // Real customers only: phone-like contact (≥8 digits), not broadcasts/@unknown,
    // and not the business's own number.
    const isCustomer = (p: string | null) =>
      !!p && /\d{8,}/.test(p) && (!ownerDigits || p.replace(/\D/g, '') !== ownerDigits)
    // Phones that received an actual outbound reply (so they're handled).
    const repliedTo = new Set(
      rows.filter((r) => r.direction === 'outbound').map((r) => r.contact_phone),
    )
    // Latest inbound per customer (rows are newest-first).
    const latest = new Map<string, { content: string | null; created_at: string }>()
    for (const r of rows) {
      if (r.direction !== 'inbound' || !isCustomer(r.contact_phone)) continue
      if (!latest.has(r.contact_phone)) {
        latest.set(r.contact_phone, { content: r.content, created_at: r.created_at })
      }
    }
    const list: UnansweredMessage[] = [...latest.entries()]
      .filter(([phone]) => !repliedTo.has(phone))
      .map(([from, r]) => ({ from, last_message: (r.content ?? '').slice(0, 160), when: r.created_at }))
      .slice(0, 25)

    setItems(list)
    setLoading(false)
  }, [userId, ownerPhone, windowHours])

  useEffect(() => {
    fetchIt()
  }, [fetchIt])

  return { items, loading, refetch: fetchIt }
}
