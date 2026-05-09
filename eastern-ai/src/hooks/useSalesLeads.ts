import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SalesLead } from '../types/message.types'

export function useSalesLeads(userId: string | undefined) {
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('sales_leads')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setLeads((data as SalesLead[]) ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`sales-leads-${userId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sales_leads',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setLeads(prev => [payload.new as SalesLead, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setLeads(prev => prev.map(l => l.id === payload.new.id ? payload.new as SalesLead : l))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { leads, loading }
}
