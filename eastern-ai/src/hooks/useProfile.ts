import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/profile.types'

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (err) setError(err.message)
    else setProfile(data as Profile)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`profile-${userId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        setProfile(payload.new as Profile)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!userId) return
    const { data, error: err } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    if (!err && data) setProfile(data as Profile)
    return { error: err }
  }, [userId])

  return { profile, loading, error, refetch: fetchProfile, updateProfile }
}
