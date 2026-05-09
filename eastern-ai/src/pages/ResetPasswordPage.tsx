import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedBackground } from '../components/layout/AnimatedBackground'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'

/**
 * Landing target for Supabase password-reset emails.
 * Supabase auto-creates a recovery session when the email link is clicked,
 * so updateUser() works without re-auth.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError("Passwords don't match."); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
    setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl bg-surface border border-border p-8 shadow-elev">
          {done ? (
            <div className="text-center">
              <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                <svg className="h-7 w-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-text mb-2">Password updated</h1>
              <p className="text-sm text-text-muted">Taking you to your dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-text mb-2">Set a new password</h1>
              <p className="text-sm text-text-muted mb-6">Pick something strong — at least 8 characters.</p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="New password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  error={confirm && password !== confirm ? "Passwords don't match" : ''}
                />
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Update password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
