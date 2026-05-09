import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MessageLog } from '../types/message.types'

export function useMessageLogs(userId: string | undefined) {
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('message_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setLogs((data as MessageLog[]) ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`message-logs-${userId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_logs',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setLogs(prev => [payload.new as MessageLog, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { logs, loading }
}
