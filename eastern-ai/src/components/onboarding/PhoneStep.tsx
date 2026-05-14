import { useState } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { sendOtp } from '../../lib/webhooks'
import { supabase } from '../../lib/supabase'
import { useOtpCooldown } from '../../hooks/useOtpCooldown'

interface PhoneStepProps {
  userId: string
  onComplete: (phone: string) => void
}

export function PhoneStep({ userId, onComplete }: PhoneStepProps) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { startCooldown } = useOtpCooldown()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || phone.length < 9) {
      setError('Enter a valid phone number.')
      return
    }
    setLoading(true)
    setError('')

    // Save phone to profile
    await supabase.from('profiles').update({ phone }).eq('id', userId)

    try {
      const res = await sendOtp(userId, phone)
      if (res.success) {
        startCooldown()
        onComplete(phone)
      } else {
        setError(res.error || 'Could not send verification code. Try again.')
      }
    } catch (e) {
      // Surface the real network/CORS error so it's debuggable, not "Failed to send code"
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.length > 200 ? msg.slice(0, 200) + '…' : msg)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Phone Number"
        type="tel"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        placeholder="+233 XX XXX XXXX"
        inputMode="tel"
        hint="We'll send a 6-digit verification code via WhatsApp"
        error={error}
        autoFocus
      />
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Send Verification Code
      </Button>
    </form>
  )
}
