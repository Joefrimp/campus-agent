import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedBackground } from '../components/layout/AnimatedBackground'
import { CreateAccountModal } from '../components/auth/CreateAccountModal'
import { SignInModal } from '../components/auth/SignInModal'
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal'
import { Logo } from '../components/layout/Logo'
import { useAuth } from '../hooks/useAuth'

type AuthModal = 'create' | 'signin' | 'forgot' | null

const FREE_FEATURES = [
  '15 Days Duration',
  '50 Total Messages Cap',
  'Standard AI Voice',
  'Email Support',
]

const PRO_FEATURES = [
  'Permanent Access',
  'Unlimited Messages',
  'Full Brand Voice Customization',
  'Priority WhatsApp Concierge',
]

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

export function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [modal, setModal] = useState<AuthModal>(null)
  const setShowModal = (open: boolean) => setModal(open ? 'create' : null)

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true })
  }, [session, loading, navigate])

  return (
    <div className="relative min-h-screen flex flex-col">
      <AnimatedBackground />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <Logo variant="vector" size="sm" showText textClassName="text-lg" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal('signin')}
            className="h-9 px-4 rounded-lg text-sm font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => setModal('create')}
            className="h-9 px-4 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors shadow-sm"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/25 bg-accent/10 text-accent text-xs font-medium mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          New · Autonomous WhatsApp Operator
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-text mb-4 tracking-tight text-balance max-w-3xl">
          Meet Vector — the AI that runs your business while you focus on what matters.
        </h1>
        <p className="text-base md:text-lg text-text-muted max-w-2xl mb-14 leading-relaxed">
          Replies to every customer, takes orders, confirms payments, books appointments,
          and reports back to you nightly — all on WhatsApp, 24/7.
          You stay in class. Vector keeps the business running.
        </p>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl w-full">

          {/* Free trial */}
          <div className="rounded-2xl bg-surface border border-border p-7 flex flex-col text-left hover:border-accent/25 transition-colors duration-200">
            <h2 className="text-base font-bold tracking-[0.12em] text-text uppercase mb-1">
              15-Day Free Trial
            </h2>
            <p className="text-sm text-text-muted mb-6">Test the waters zero risk.</p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-text">0 GHS</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-text">
                  <CheckIcon /> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowModal(true)}
              className="w-full h-12 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-lg shadow-accent/20"
            >
              Start Free Trial
            </button>
          </div>

          {/* Executive Pro */}
          <div className="relative rounded-2xl bg-surface border border-border p-7 flex flex-col text-left hover:border-accent/25 transition-colors duration-200">
            <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-md bg-accent text-white text-[10px] font-bold tracking-[0.12em] uppercase">
              Pro Plan
            </div>
            <h2 className="text-base font-bold tracking-[0.12em] text-text uppercase mb-1">
              Executive
            </h2>
            <p className="text-sm text-text-muted mb-6">For growing campus businesses.</p>
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-text">100 GHS</span>
              <span className="text-sm text-text-muted">/ month</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {PRO_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-text">
                  <CheckIcon /> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setModal('create')}
              className="w-full h-12 rounded-xl border border-border text-text font-semibold text-sm hover:border-accent/60 hover:text-accent active:scale-[0.98] transition-all"
            >
              Sign Up Now
            </button>
          </div>

        </div>

        <p className="text-sm text-text-muted mt-10">
          Already have an account?{' '}
          <button
            onClick={() => setModal('signin')}
            className="text-accent hover:text-accent-hover font-medium"
          >
            Sign in
          </button>
        </p>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-text-faint border-t border-border">
        © {new Date().getFullYear()} Eastern AI
      </footer>

      {modal === 'create' && <CreateAccountModal onClose={() => setModal(null)} />}
      {modal === 'signin' && (
        <SignInModal
          onClose={() => setModal(null)}
          onSwitchToCreate={() => setModal('create')}
          onForgotPassword={() => setModal('forgot')}
        />
      )}
      {modal === 'forgot' && (
        <ForgotPasswordModal
          onClose={() => setModal(null)}
          onBackToSignIn={() => setModal('signin')}
        />
      )}
    </div>
  )
}
