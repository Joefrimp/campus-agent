import { useState } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { verifyOtp, sendOtp } from '../../lib/webhooks'
import { useOtpCooldown } from '../../hooks/useOtpCooldown'

interface OtpStepProps {
  userId: string
  phone: string
  onVerified: () => void
}

export function OtpStep({ userId, phone, onVerified }: OtpStepProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const { secondsLeft, canResend, startCooldown } = useOtpCooldown()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return }
    setLoading(true)
    setError('')

    try {
      const res = await verifyOtp(userId, code)
      if (res.success) {
        onVerified()
      } else {
        setError(res.error || 'Invalid or expired code. Try again.')
      }
    } catch {
      setError('Verification failed. Please try again.')
    }
    setLoading(false)
  }

  const handleResend = async () => {
    if (!canResend) return
    setResending(true)
    setError('')

    try {
      const res = await sendOtp(userId, phone)
      if (res.success) {
        startCooldown()
      } else {
        setError(res.error || 'Could not resend. Try again shortly.')
      }
    } catch {
      setError('Failed to resend. Try again shortly.')
    }
    setResending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-text-muted">
        Code sent to <span className="text-text font-medium">{phone}</span> via WhatsApp
      </p>
      <Input
        label="Verification Code"
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        error={error}
      />
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Verify & Continue
      </Button>
      <button
        type="button"
        onClick={handleResend}
        disabled={!canResend || resending}
        className="w-full text-sm text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors py-1"
      >
        {!canResend ? `Resend in ${secondsLeft}s` : resending ? 'Sending…' : 'Resend code'}
      </button>
    </form>
  )
}
