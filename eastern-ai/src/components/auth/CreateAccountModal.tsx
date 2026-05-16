import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

function strengthScore(pw: string): number {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

const STRENGTH_COLORS = ['bg-[#F87171]', 'bg-[#FB923C]', 'bg-[#FACC15]', 'bg-[#00FF66]']

interface Props { onClose: () => void }

export function CreateAccountModal({ onClose }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [form, setForm] = useState({
    firstName: '', lastName: '', businessName: '',
    phone: '', email: '', password: '', confirmPassword: '',
  })

  const score = strengthScore(form.password)
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    // Same-tab redirect — Safari ITP blocks the auth cookie when OAuth runs
    // in a popup/new tab, which produces "browser is blocking a required
    // security cookie". Default Supabase behavior (full redirect) is safer.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (err) { setError(err.message); setGoogleLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { firstName, lastName, businessName, phone, email, password, confirmPassword } = form
    if (!firstName || !lastName || !businessName || !phone || !email || !password) {
      setError('All fields are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    setError('')

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName, business_name: businessName } },
    })

    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }

    if (data.user) {
      await supabase.from('profiles').update({ phone }).eq('id', data.user.id)
    }

    setLoading(false)

    if (data.session) {
      navigate('/verify', { replace: true })
    } else {
      setEmailSent(true)
    }
  }

  if (emailSent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-8 shadow-2xl text-center">
          <div className="h-14 w-14 rounded-2xl bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center mx-auto mb-5">
            <svg className="h-7 w-7 text-[#00FF66]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-[Outfit] font-bold text-2xl text-white mb-2">Check your email</h2>
          <p className="text-sm text-[#E0E0E0] mb-7">
            We sent a confirmation link to <span className="text-white font-medium">{form.email}</span>. Click it to activate your account, then sign in.
          </p>
          <button
            onClick={onClose}
            className="h-11 px-8 rounded-full bg-[#00FF66] text-black font-[Outfit] font-bold text-sm hover:brightness-110 transition-all"
          >
            Got it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-8 shadow-2xl max-h-[92vh] overflow-y-auto">

        <h2 className="font-[Outfit] font-bold text-2xl text-white mb-1.5">Create account</h2>
        <p className="text-sm text-[#E0E0E0] mb-7">Join Eastern AI to deploy your Vector.</p>

        {/* Google */}
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

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
          <span className="font-[Inter] text-[10px] tracking-[0.15em] text-[#A1A1AA] uppercase font-medium">Or register with email</span>
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={form.firstName} onChange={set('firstName')} autoFocus />
            <Input label="Last Name" value={form.lastName} onChange={set('lastName')} />
          </div>
          <Input
            label="Business Name"
            value={form.businessName}
            onChange={set('businessName')}
            placeholder="Eastern Apparel"
          />
          <Input
            label="WhatsApp Number"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+233 24 123 4567"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="chief@eastern.ai"
          />
          <div>
            <Input
              label="Secure Password"
              type="password"
              value={form.password}
              onChange={set('password')}
            />
            {form.password.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? STRENGTH_COLORS[score - 1] : 'bg-[rgba(255,255,255,0.1)]'}`}
                  />
                ))}
              </div>
            )}
          </div>
          <Input
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={set('confirmPassword')}
            error={form.confirmPassword && form.password !== form.confirmPassword ? "Passwords don't match" : ''}
          />

          {error && <p className="text-sm text-[#F87171] pt-1">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-none h-12 px-5 rounded-full border border-[rgba(255,255,255,0.1)] font-[Inter] text-sm text-white hover:border-[#00FF66] hover:text-[#00FF66] transition-all"
            >
              Cancel
            </button>
            <Button
              type="submit"
              loading={loading}
              size="lg"
              className="flex-1 !rounded-full !bg-[#00FF66] !text-black !font-[Outfit] !font-bold hover:!bg-[#00FF66] hover:brightness-110"
            >
              Register &amp; Continue →
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
