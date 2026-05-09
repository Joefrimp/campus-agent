import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface Props {
  onClose: () => void
  onBackToSignIn: () => void
}

export function ForgotPasswordModal({ onClose, onBackToSignIn }: Props) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Enter your email.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface border border-border p-8 shadow-elev">
        {sent ? (
          <div className="text-center">
            <div className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text mb-2">Check your email</h2>
            <p className="text-sm text-text-muted mb-6">
              We sent a password reset link to <span className="text-text font-medium">{email}</span>.
              Click it to set a new password.
            </p>
            <button
              onClick={onClose}
              className="h-11 px-8 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-base font-bold tracking-[0.2em] text-text uppercase mb-1">Reset Password</h2>
            <p className="text-sm text-text-muted mb-6">
              We'll email you a link to reset your password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chief@eastern.ai"
                autoFocus
              />
              {error && <p className="text-sm text-danger pt-1">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onBackToSignIn}
                  className="flex-none h-11 px-5 rounded-xl text-sm font-medium text-text-muted hover:text-text transition-colors"
                >
                  Back
                </button>
                <Button type="submit" loading={loading} className="flex-1" size="lg">
                  Send reset link
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
