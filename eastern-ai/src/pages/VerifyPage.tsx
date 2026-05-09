import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedBackground } from '../components/layout/AnimatedBackground'
import { OtpStep } from '../components/onboarding/OtpStep'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { sendOtp } from '../lib/webhooks'
import { useOtpCooldown } from '../hooks/useOtpCooldown'

export function VerifyPage() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const navigate = useNavigate()
  const [showOtp, setShowOtp] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const { startCooldown } = useOtpCooldown()

  const handleVerified = async () => {
    if (!user) return
    await supabase.from('profiles').update({ is_verified: true }).eq('id', user.id)
    navigate('/dashboard', { replace: true })
  }

  const handleStart = async () => {
    if (!user || !profile?.phone) {
      setError('No phone on file. Restart onboarding.')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await sendOtp(user.id, profile.phone)
      if (res.success) {
        startCooldown()
        setShowOtp(true)
      } else {
        setError(res.error || 'Could not send verification code. Try again.')
      }
    } catch {
      setError('Failed to send code. Try again.')
    }
    setSending(false)
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl bg-surface border border-border p-8 text-center shadow-2xl">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text mb-2">Phone Verification Required</h1>
          <p className="text-sm text-text-muted mb-6">
            Your account requires phone verification before accessing the dashboard.
          </p>

          {!showOtp ? (
            <>
              <button
                onClick={handleStart}
                disabled={sending}
                className="inline-flex items-center justify-center h-10 px-6 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Verify Now'}
              </button>
              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </>
          ) : (
            <OtpStep
              userId={user?.id ?? ''}
              phone={profile?.phone ?? ''}
              onVerified={handleVerified}
            />
          )}
        </div>
      </div>
    </div>
  )
}
