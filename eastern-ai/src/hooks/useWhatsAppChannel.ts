import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { WhapiChannel } from '../types/whatsapp.types'

const POLL_INTERVAL = 5000

export function useWhatsAppChannel(userId: string | undefined) {
  const [channel, setChannel] = useState<WhapiChannel | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChannel = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('whapi_channels')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    setChannel(data as WhapiChannel | null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchChannel()
  }, [fetchChannel])

  // Poll every 5s until authorized
  useEffect(() => {
    if (!userId) return
    if (channel?.status === 'authorized') return
    const id = setInterval(fetchChannel, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [userId, channel?.status, fetchChannel])

  return { channel, loading, refetch: fetchChannel }
}
