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

  // The canonical quota counter is profiles.message_count, which is
  // incremented ONLY when Vector sends an actual AI reply to a customer
  // (in webhook.ts, after a successful reply send). System messages
  // (onboarding interview Qs, owner DMs, holding replies, stale-inquiry
  // followups, panic command replies) are NOT counted — exactly what the
  // owner expects when they see "messages used".
  //
  // We used to count rows in message_logs which logs EVERY message
  // (inbound + outbound + system), making the badge wildly inflated.
  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('message_count')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setMessagesUsed(data?.message_count ?? 0)
        setLoadingCount(false)
      })
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`msg-count-${userId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        const next = (payload.new as { message_count?: number })?.message_count
        if (typeof next === 'number') setMessagesUsed(next)
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
