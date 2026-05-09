import { useState } from 'react'
import { AnimatedBackground } from '../components/layout/AnimatedBackground'
import { Button } from '../components/ui/Button'
import { createPaymentSession } from '../lib/webhooks'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const perks = [
  'Unlimited AI responses',
  'Dedicated WhatsApp channel',
  '3 brand voice presets',
  'Human-in-the-Loop control',
  'Sales stream & agent logs',
  'Priority support',
]

export function PaymentPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUpgrade = async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const res = await createPaymentSession(user.id)
      if (res.payment_url) {
        window.location.href = res.payment_url
      } else {
        setError('Could not start payment session. Try again.')
      }
    } catch {
      // Fallback: if n8n not configured, use env payment URL
      const fallback = import.meta.env.VITE_PAYMENT_PORTAL_URL
      if (fallback) window.location.href = fallback
      else setError('Payment portal not configured. Contact support.')
    }
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-xs text-amber-400 font-medium mb-4">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Your trial has ended
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">Upgrade to Pro</h1>
          <p className="text-text-muted text-sm">Keep your AI agent running and never miss a lead.</p>
        </div>

        <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-2xl">
          {/* Price header */}
          <div className="bg-gradient-to-br from-accent/20 to-accent/5 border-b border-border px-6 py-6 text-center">
            <p className="text-5xl font-bold text-text">
              100
              <span className="text-2xl font-medium text-text-muted ml-1">GHS</span>
            </p>
            <p className="text-sm text-text-muted mt-1">per month · cancel anytime</p>
          </div>

          {/* Perks */}
          <div className="px-6 py-5 space-y-3">
            {perks.map(p => (
              <div key={p} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <svg className="h-3 w-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm text-text">{p}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="px-6 pb-6 space-y-3">
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <Button onClick={handleUpgrade} className="w-full" size="lg" loading={loading}>
              Upgrade Now — 100 GHS/month
            </Button>
            <button
              onClick={handleSignOut}
              className="w-full text-xs text-text-faint hover:text-text-muted transition-colors py-1"
            >
              Sign out instead
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
