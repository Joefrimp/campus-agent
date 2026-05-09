import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PLACEHOLDER = `Examples — write a few short rules in your own words:

• I'm direct. No "Hi there" or excessive emojis.
• When customers ask for discount, my line is: "GHS X is the best price — already running thin."
• I always confirm delivery slot before saying yes.
• Saturdays I close at 4pm, no late deliveries.
• Use the word "fam" for regulars, never for strangers.

The agent will read this every time it crafts a reply, and lean into your voice while staying within safety + pricing rules.`

const MAX_LEN = 4000

interface Props {
  userId: string
  isPro: boolean
}

export function StyleGuideEditor({ userId, isPro }: Props) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('tenant_style_guide')
        .eq('user_id', userId)
        .maybeSingle()
      if (!cancelled) {
        setValue(data?.tenant_style_guide ?? '')
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const handleSave = async () => {
    if (!isPro) return
    setSaving(true)
    const trimmed = value.slice(0, MAX_LEN)
    await supabase
      .from('business_settings')
      .update({ tenant_style_guide: trimmed })
      .eq('user_id', userId)
    setSaving(false)
    setSavedAt(new Date())
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-32 animate-pulse rounded-lg bg-white/5" />
      </Card>
    )
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-text">Personal Style Guide</h2>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              Pro
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Teach the agent your specific phrasing, lines, and policies. Applied on top of your Brand Voice.
          </p>
        </div>
      </div>

      {!isPro ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm text-amber-200">
            Personal Style Guide is a Pro feature. Upgrade to teach the agent your unique voice — the way you actually
            text customers — and it will mirror you on every reply.
          </p>
          <Link
            to="/dashboard/payment"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value.slice(0, MAX_LEN))}
            placeholder={PLACEHOLDER}
            rows={12}
            className="w-full rounded-lg border border-border bg-black/30 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent transition-colors resize-y font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {value.length} / {MAX_LEN} characters
            </span>
            <div className="flex items-center gap-3">
              {savedAt && (
                <span className="text-xs text-emerald-400">
                  Saved {savedAt.toLocaleTimeString()}
                </span>
              )}
              <Button onClick={handleSave} loading={saving} size="sm">Save</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
