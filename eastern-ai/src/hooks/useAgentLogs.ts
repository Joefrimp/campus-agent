import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AgentLog } from '../types/message.types'

export function useAgentLogs(userId: string | undefined) {
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('agent_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setLogs((data as AgentLog[]) ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`agent-logs-${userId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_logs',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setLogs(prev => [payload.new as AgentLog, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { logs, loading }
}
