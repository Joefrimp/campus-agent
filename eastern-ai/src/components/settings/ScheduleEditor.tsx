import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'

const DAYS: Array<[string, string]> = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
]

type Hours = Record<string, string>

export function ScheduleEditor({ userId }: { userId: string }) {
  const [hours, setHours] = useState<Hours>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('business_hours')
        .eq('user_id', userId)
        .maybeSingle()
      if (!cancelled) {
        setHours((data?.business_hours as Hours) ?? {})
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const setDay = (key: string, value: string) => setHours(prev => ({ ...prev, [key]: value }))
  const toggleClosed = (key: string) => {
    setHours(prev => ({ ...prev, [key]: prev[key] === 'closed' ? '08:00-19:00' : 'closed' }))
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase
      .from('business_settings')
      .update({ business_hours: hours })
      .eq('user_id', userId)
    setSaving(false)
    setSavedAt(new Date())
  }

  if (loading) {
    return <Card className="p-6"><div className="h-32 animate-pulse rounded bg-surface-2" /></Card>
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-text">Business Hours</h2>
        <p className="text-sm text-text-muted mt-1">
          The agent uses this to validate appointment requests and set quiet hours for marketing posts.
          Use 24-hour format like <code className="px-1 py-0.5 rounded bg-surface-2 text-xs">08:00-19:00</code>, or set "closed".
        </p>
      </div>

      <div className="space-y-2">
        {DAYS.map(([k, label]) => {
          const v = hours[k] ?? '08:00-19:00'
          const closed = v === 'closed'
          return (
            <div key={k} className="flex items-center gap-3">
              <span className="w-12 text-sm font-medium text-text">{label}</span>
              <input
                type="text"
                value={closed ? '' : v}
                onChange={e => setDay(k, e.target.value)}
                placeholder="08:00-19:00"
                disabled={closed}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
              />
              <button
                onClick={() => toggleClosed(k)}
                className={
                  closed
                    ? 'px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-text-muted border border-border hover:text-text'
                }
              >
                {closed ? 'Closed' : 'Open'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end items-center gap-3 pt-2">
        {savedAt && <span className="text-xs text-emerald-400">Saved {savedAt.toLocaleTimeString()}</span>}
        <Button onClick={handleSave} loading={saving} size="sm">Save hours</Button>
      </div>
    </Card>
  )
}
