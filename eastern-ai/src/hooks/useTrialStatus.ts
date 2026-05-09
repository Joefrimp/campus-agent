import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/profile.types'

const MESSAGE_LIMIT = 50

/** Compute days left in UTC so the count is identical for owner + customers
 *  no matter where they are. Re-evaluated on every render so it stays fresh
 *  without needing a setInterval. */
function utcDaysBetween(future: Date, now: Date): number {
  // Normalize both to UTC midnight so partial-day rounding is deterministic.
  const futureUtc = Date.UTC(future.getUTCFullYear(), future.getUTCMonth(), future.getUTCDate())
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const diffMs = futureUtc - nowUtc
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export function useTrialStatus(profile: Profile | null, userId: string | undefined) {
  const [messagesUsed, setMessagesUsed] = useState(0)
  const [loadingCount, setLoadingCount] = useState(true)
  // Tick every minute so the days-left number can re-render across midnight UTC
  const [, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('message_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count }) => {
        setMessagesUsed(count ?? 0)
        setLoadingCount(false)
      })
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`msg-count-${userId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_logs',
        filter: `user_id=eq.${userId}`,
      }, () => {
        setMessagesUsed(prev => prev + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  if (!profile) {
    return { daysLeft: 0, messagesUsed: 0, isGated: false, loadingCount, messageLimit: MESSAGE_LIMIT }
  }

  const daysLeft = utcDaysBetween(new Date(profile.trial_expires_at), new Date())
  const isExpired = daysLeft <= 0
  const isGated = (isExpired || messagesUsed >= MESSAGE_LIMIT) && profile.plan === 'trial'

  return { daysLeft, messagesUsed, isGated, loadingCount, messageLimit: MESSAGE_LIMIT }
}
