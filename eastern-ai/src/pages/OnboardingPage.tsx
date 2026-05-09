import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedBackground } from '../components/layout/AnimatedBackground'
import { OnboardingForm } from '../components/onboarding/OnboardingForm'
import { PhoneStep } from '../components/onboarding/PhoneStep'
import { OtpStep } from '../components/onboarding/OtpStep'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { FullPageSpinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'

type Step = 'profile' | 'phone' | 'otp'

const STEPS: { key: Step; label: string }[] = [
  { key: 'profile', label: 'Your Info' },
  { key: 'phone', label: 'Phone' },
  { key: 'otp', label: 'Verify' },
]

export function OnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('profile')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (authLoading || profileLoading) return
    if (!user) { navigate('/', { replace: true }); return }
    // Already verified — go to dashboard
    if (profile?.is_verified) navigate('/dashboard', { replace: true })
    // Profile filled, skip to phone
    else if (profile?.first_name) setStep('phone')
  }, [authLoading, profileLoading, user, profile, navigate])

  const handleVerified = async () => {
    if (!user) return
    await supabase.from('profiles').update({ is_verified: true }).eq('id', user.id)
    navigate('/dashboard', { replace: true })
  }

  if (authLoading || profileLoading) return <FullPageSpinner />

  const currentIdx = STEPS.findIndex(s => s.key === step)

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center">
            <svg className="h-6 w-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                i < currentIdx ? 'bg-accent text-white' :
                i === currentIdx ? 'bg-accent/20 border-2 border-accent text-accent' :
                'bg-white/5 text-text-faint'
              }`}>
                {i < currentIdx ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-8 transition-colors ${i < currentIdx ? 'bg-accent' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 shadow-2xl">
          {step === 'profile' && (
            <>
              <h1 className="text-xl font-bold text-text mb-1">Welcome to Eastern AI</h1>
              <p className="text-sm text-text-muted mb-6">Tell us a bit about yourself and your business.</p>
              <OnboardingForm userId={user?.id ?? ''} onComplete={() => setStep('phone')} />
            </>
          )}

          {step === 'phone' && (
            <>
              <h1 className="text-xl font-bold text-text mb-1">Verify your phone</h1>
              <p className="text-sm text-text-muted mb-6">We need your phone number to secure your account.</p>
              <PhoneStep
                userId={user?.id ?? ''}
                onComplete={(p) => { setPhone(p); setStep('otp') }}
              />
            </>
          )}

          {step === 'otp' && (
            <>
              <h1 className="text-xl font-bold text-text mb-1">Enter the code</h1>
              <p className="text-sm text-text-muted mb-6">Check your SMS for the 6-digit verification code.</p>
              <OtpStep userId={user?.id ?? ''} phone={phone} onVerified={handleVerified} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
