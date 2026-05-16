import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface Props {
  onClose: () => void
  onSwitchToCreate: () => void
  onForgotPassword: () => void
}

export function SignInModal({ onClose, onSwitchToCreate, onForgotPassword }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    setGoogleLoading(false)
    if (err) setError(err.message)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Email and password required.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-8 shadow-elev">
        <h2 className="font-[Outfit] font-bold text-2xl text-white mb-1.5">Welcome back</h2>
        <p className="text-sm text-[#E0E0E0] mb-7">Sign in to your Eastern AI account.</p>

        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex items-center justify-center gap-3 w-full h-12 rounded-full bg-white text-gray-900 font-[Outfit] font-bold text-sm hover:brightness-95 active:scale-[0.98] transition-all disabled:opacity-60 mb-5"
        >
          {googleLoading ? (
            <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
          <span className="font-[Inter] text-[10px] tracking-[0.15em] text-[#A1A1AA] uppercase font-medium">Or with email</span>
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="chief@eastern.ai"
            autoFocus
          />
          <div>
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={onForgotPassword}
              className="mt-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Forgot password?
            </button>
          </div>

          {error && <p className="text-sm text-danger pt-1">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-none h-11 px-5 rounded-xl text-sm font-medium text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <Button type="submit" loading={loading} className="flex-1" size="lg">
              Sign In
            </Button>
          </div>
        </form>

        <div className="text-center text-sm text-text-muted pt-5 mt-5 border-t border-border">
          New here?{' '}
          <button onClick={onSwitchToCreate} className="text-accent hover:text-accent-hover font-medium">
            Create an account
          </button>
        </div>
      </div>
    </div>
  )
}
