import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'

interface Props { userId: string }

export function PaymentDetailsEditor({ userId }: Props) {
  const [momoNumber, setMomoNumber] = useState('')
  const [momoName, setMomoName] = useState('')
  const [methods, setMethods] = useState<string[]>(['momo'])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('momo_number, momo_name, payment_methods')
        .eq('user_id', userId)
        .maybeSingle()
      if (!cancelled) {
        setMomoNumber(data?.momo_number ?? '')
        setMomoName(data?.momo_name ?? '')
        setMethods((data?.payment_methods as string[]) ?? ['momo'])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const toggleMethod = (m: string) => {
    setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  const handleSave = async () => {
    setError('')
    if (methods.includes('momo')) {
      if (!momoNumber.trim() || momoNumber.replace(/\D/g, '').length < 9) {
        setError('Enter a valid MoMo number (with country code or local format).')
        return
      }
      if (!momoName.trim()) {
        setError('Enter the name registered with the MoMo number.')
        return
      }
    }
    setSaving(true)
    const { error: err } = await supabase
      .from('business_settings')
      .update({
        momo_number: momoNumber.trim() || null,
        momo_name: momoName.trim() || null,
        payment_methods: methods,
      })
      .eq('user_id', userId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSavedAt(new Date())
  }

  if (loading) {
    return <Card className="p-6"><div className="h-32 animate-pulse rounded bg-surface-2" /></Card>
  }

  const ALL_METHODS: Array<{ key: string; label: string; hint?: string }> = [
    { key: 'momo', label: 'Mobile Money (MoMo)', hint: 'MTN / Vodafone / AirtelTigo' },
    { key: 'cash', label: 'Cash on delivery' },
    { key: 'bank_transfer', label: 'Bank transfer' },
  ]

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-text">Payment Details</h2>
        <p className="text-sm text-text-muted mt-1">
          Vector shares these with customers when they're ready to pay. Make sure the MoMo number + name match what your phone has registered — customers will type the name to confirm.
        </p>
      </div>

      {/* Methods */}
      <div>
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">Payment methods</label>
        <div className="space-y-2">
          {ALL_METHODS.map(m => (
            <label key={m.key} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-2 cursor-pointer hover:border-accent/40 transition-colors">
              <input
                type="checkbox"
                checked={methods.includes(m.key)}
                onChange={() => toggleMethod(m.key)}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{m.label}</p>
                {m.hint && <p className="text-xs text-text-muted">{m.hint}</p>}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* MoMo fields */}
      {methods.includes('momo') && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
          <Input
            label="MoMo number"
            type="tel"
            inputMode="tel"
            value={momoNumber}
            onChange={(e) => setMomoNumber(e.target.value)}
            placeholder="+233 53 254 4245"
            hint="The number customers will pay to."
          />
          <Input
            label="Name registered with MoMo"
            value={momoName}
            onChange={(e) => setMomoName(e.target.value)}
            placeholder="ADJEI EASTERN"
            hint="Exactly as it appears in your MoMo profile — customers see this on their payment screen."
          />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end items-center gap-3">
        {savedAt && <span className="text-xs text-emerald-400">Saved {savedAt.toLocaleTimeString()}</span>}
        <Button onClick={handleSave} loading={saving} size="sm">Save payment details</Button>
      </div>
    </Card>
  )
}
