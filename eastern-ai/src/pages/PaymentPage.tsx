/**
 * Pro upgrade page — MoMo screenshot auto-activation flow.
 *
 * 1. Fetch operator config (MoMo number, name, price, activation WhatsApp)
 * 2. User picks duration (1 / 3 / 12 months)
 * 3. Click "Generate code" → POST /billing/start-upgrade → get a fresh
 *    VEC-XXXX-XXXX code + countdown
 * 4. Show pay-instructions card with copyable MoMo number + code +
 *    activation WhatsApp link
 * 5. Poll /billing/activation-status every 3s; when status='paid' →
 *    success state + navigate to dashboard after 2s
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedBackground } from '../components/layout/AnimatedBackground'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  getProPaymentConfig,
  startProUpgrade,
  getActivationStatus,
  cancelProUpgrade,
  type ProPaymentConfig,
} from '../lib/webhooks'

type Stage = 'pick' | 'pay' | 'success' | 'expired' | 'error'

const DURATIONS = [
  { months: 1, label: '1 month', save: null },
  { months: 3, label: '3 months', save: 'Save 5%' },
  { months: 12, label: '12 months', save: 'Save 15%' },
]

export function PaymentPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [opConfig, setOpConfig] = useState<ProPaymentConfig | null>(null)
  const [opErr, setOpErr] = useState('')
  const [duration, setDuration] = useState(1)

  const [stage, setStage] = useState<Stage>('pick')
  const [code, setCode] = useState('')
  const [amountDue, setAmountDue] = useState(0)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [starting, setStarting] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load operator config once
  useEffect(() => {
    let alive = true
    getProPaymentConfig()
      .then(c => { if (alive) setOpConfig(c) })
      .catch(e => { if (alive) setOpErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [])

  // Countdown ticker
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)))
      if (ms <= 0 && stage === 'pay') {
        setStage('expired')
        if (tickTimer.current) clearInterval(tickTimer.current)
        if (pollTimer.current) clearInterval(pollTimer.current)
      }
    }
    tick()
    tickTimer.current = setInterval(tick, 1000)
    return () => { if (tickTimer.current) clearInterval(tickTimer.current) }
  }, [expiresAt, stage])

  // Poll activation status
  useEffect(() => {
    if (stage !== 'pay' || !user || !code) return
    const poll = async () => {
      try {
        const res = await getActivationStatus(user.id, code)
        if (res.status === 'paid') {
          setStage('success')
          if (pollTimer.current) clearInterval(pollTimer.current)
          if (tickTimer.current) clearInterval(tickTimer.current)
          setTimeout(() => navigate('/dashboard', { replace: true }), 2200)
        } else if (res.status === 'expired' || res.status === 'cancelled') {
          setStage('expired')
          if (pollTimer.current) clearInterval(pollTimer.current)
        }
      } catch {/* swallow — keep polling */}
    }
    pollTimer.current = setInterval(poll, 3000)
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [stage, user, code, navigate])

  const handleStart = async () => {
    if (!user || !opConfig?.configured) return
    setStarting(true)
    setErrMsg('')
    try {
      const res = await startProUpgrade(user.id, duration)
      if (res.success) {
        setCode(res.code)
        setAmountDue(res.amount_due_ghs)
        setExpiresAt(res.expires_at)
        setStage('pay')
      } else {
        setErrMsg(res.error || 'Could not start upgrade')
        setStage('error')
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
    setStarting(false)
  }

  const handleCancel = async () => {
    if (user && code) await cancelProUpgrade(user.id, code).catch(() => {})
    setStage('pick'); setCode(''); setExpiresAt(null)
  }

  const handleNewCode = () => {
    setStage('pick'); setCode(''); setExpiresAt(null); setErrMsg('')
  }

  const handleSignOut = async () => { await supabase.auth.signOut() }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-lg">

        {!opConfig && !opErr && (
          <div className="text-center text-text-muted">Loading…</div>
        )}

        {opErr && (
          <div className="text-center text-red-400 text-sm">{opErr}</div>
        )}

        {opConfig && !opConfig.configured && (
          <NotConfiguredCard onSignOut={handleSignOut} />
        )}

        {opConfig?.configured && stage === 'pick' && (
          <PickPlanCard
            config={opConfig}
            duration={duration}
            setDuration={setDuration}
            starting={starting}
            errMsg={errMsg}
            onStart={handleStart}
            onSignOut={handleSignOut}
          />
        )}

        {opConfig?.configured && stage === 'pay' && (
          <PayCard
            config={opConfig}
            code={code}
            amount={amountDue}
            duration={duration}
            secondsLeft={secondsLeft}
            onCancel={handleCancel}
          />
        )}

        {stage === 'success' && <SuccessCard />}
        {stage === 'expired' && <ExpiredCard onRetry={handleNewCode} />}
        {stage === 'error' && <ErrorCard message={errMsg} onRetry={handleNewCode} />}
      </div>
    </div>
  )
}

/* ═══ Sub-cards ═══ */

function NotConfiguredCard({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-7 text-center">
      <h2 className="text-xl font-bold text-text mb-2">Pro upgrades not yet configured</h2>
      <p className="text-text-muted text-sm mb-5">
        The owner hasn't set up MoMo billing details yet. Please contact support to upgrade.
      </p>
      <a
        href="mailto:hello@eastern.ai"
        className="inline-block h-10 px-5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        Contact support
      </a>
      <div className="mt-4">
        <button onClick={onSignOut} className="text-xs text-text-faint hover:text-text-muted">
          Sign out
        </button>
      </div>
    </div>
  )
}

function PickPlanCard({
  config, duration, setDuration, starting, errMsg, onStart, onSignOut,
}: {
  config: ProPaymentConfig
  duration: number
  setDuration: (n: number) => void
  starting: boolean
  errMsg: string
  onStart: () => void
  onSignOut: () => void
}) {
  const total = config.pro_price_ghs * duration
  const discount = duration === 3 ? 0.05 : duration === 12 ? 0.15 : 0
  const finalPrice = Math.round(total * (1 - discount))
  return (
    <div>
      <div className="text-center mb-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1 text-[11px] text-amber-400 font-semibold tracking-wider uppercase mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          Activate Pro
        </div>
        <h1 className="text-3xl font-bold text-text mb-2 tracking-tight">Choose your plan</h1>
        <p className="text-text-muted text-sm">Pay once via MoMo. Activated automatically in under a minute.</p>
      </div>

      <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-2xl">
        <div className="p-6 space-y-3">
          {DURATIONS.map(d => {
            const active = d.months === duration
            const monthly = Math.round(config.pro_price_ghs * (d.months === 3 ? 0.95 : d.months === 12 ? 0.85 : 1))
            return (
              <button
                key={d.months}
                onClick={() => setDuration(d.months)}
                className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                  active
                    ? 'border-accent bg-accent/10 shadow-lg shadow-accent/15'
                    : 'border-border hover:border-border-strong bg-surface-2/40'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${active ? 'border-accent bg-accent' : 'border-border'}`}>
                      {active && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-text font-semibold text-sm">{d.label}</div>
                      <div className="text-text-muted text-xs">₵{monthly}/mo equivalent</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-text font-bold text-lg">₵{Math.round(config.pro_price_ghs * d.months * (d.months === 3 ? 0.95 : d.months === 12 ? 0.85 : 1))}</div>
                    {d.save && <div className="text-emerald-400 text-[11px] font-medium">{d.save}</div>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="border-t border-border p-6 bg-surface-2/20">
          {errMsg && <p className="text-sm text-red-400 mb-3 text-center">{errMsg}</p>}
          <Button onClick={onStart} className="w-full" size="lg" loading={starting}>
            Generate payment code · ₵{finalPrice}
          </Button>
          <p className="text-[11px] text-text-faint text-center mt-3">
            You'll get a unique reference code · valid for {config.activation_minutes} min
          </p>
        </div>
      </div>

      <div className="text-center mt-5">
        <button onClick={onSignOut} className="text-xs text-text-faint hover:text-text-muted">
          Sign out
        </button>
      </div>
    </div>
  )
}

function PayCard({
  config, code, amount, duration, secondsLeft, onCancel,
}: {
  config: ProPaymentConfig
  code: string
  amount: number
  duration: number
  secondsLeft: number
  onCancel: () => void
}) {
  const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const s = (secondsLeft % 60).toString().padStart(2, '0')
  const waUrl = useMemo(() => {
    const phone = config.activation_whatsapp.replace(/\D/g, '')
    const text = encodeURIComponent(`Pro activation\nCode: ${code}\nAmount: GH₵${amount}`)
    return `https://wa.me/${phone}?text=${text}`
  }, [config.activation_whatsapp, code, amount])

  return (
    <div>
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-400 font-semibold tracking-wider uppercase mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Code generated · waiting for payment
        </div>
        <h1 className="text-2xl font-bold text-text mb-1 tracking-tight">Send GH₵{amount} via MoMo</h1>
        <p className="text-text-muted text-sm">{duration} month{duration > 1 ? 's' : ''} of Vector Pro · auto-activates</p>
      </div>

      <div className="rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden">
        <Step n={1} title="Pay this amount via MoMo">
          <CopyRow label="Amount" value={`GH₵${amount}`} mono />
          <CopyRow label="MoMo number" value={config.momo_number} mono />
          <CopyRow label="Account name" value={config.momo_account_name} />
        </Step>

        <Step n={2} title="Use this exact reference">
          <div className="rounded-xl bg-gradient-to-br from-accent/15 via-fuchsia-500/10 to-emerald-500/10 p-5 border border-accent/30">
            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2 text-center">Activation code</div>
            <div className="flex items-center justify-center gap-2">
              <code className="text-2xl md:text-3xl font-bold text-text font-mono tracking-wider">{code}</code>
              <CopyButton value={code} compact />
            </div>
            <div className="text-center text-[11px] text-text-faint mt-3">
              Type this exactly into the MoMo "Reason" or "Reference" field
            </div>
          </div>
        </Step>

        <Step n={3} title="Forward your MoMo screenshot to Vector">
          <CopyRow label="Activation WhatsApp" value={config.activation_whatsapp} mono />
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/30"
          >
            <span>📲</span>
            Open in WhatsApp
          </a>
        </Step>

        <div className="border-t border-border bg-surface-2/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs text-text-muted">Listening for your screenshot…</span>
          </div>
          <div className="text-xs font-mono text-text">⏱ {m}:{s}</div>
        </div>
      </div>

      <div className="text-center mt-5">
        <button onClick={onCancel} className="text-xs text-text-faint hover:text-text-muted">
          Cancel and pick a different plan
        </button>
      </div>
    </div>
  )
}

function SuccessCard() {
  return (
    <div className="rounded-2xl bg-surface border border-emerald-500/30 shadow-2xl shadow-emerald-500/20 p-8 text-center">
      <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center animate-pulse-glow">
        <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-text mb-2">Pro activated 🎉</h2>
      <p className="text-text-muted text-sm mb-2">Welcome to Vector Pro. Redirecting to your dashboard…</p>
    </div>
  )
}

function ExpiredCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-surface border border-amber-500/30 shadow-2xl p-7 text-center">
      <h2 className="text-xl font-bold text-text mb-2">Code expired</h2>
      <p className="text-text-muted text-sm mb-5">
        Your activation code timed out. Generate a fresh one to continue.
      </p>
      <Button onClick={onRetry} size="lg" className="w-full">Generate new code</Button>
    </div>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-surface border border-red-500/30 shadow-2xl p-7 text-center">
      <h2 className="text-xl font-bold text-text mb-2">Something went wrong</h2>
      <p className="text-text-muted text-sm mb-5 break-words">{message}</p>
      <Button onClick={onRetry} size="lg" className="w-full">Try again</Button>
    </div>
  )
}

/* ═══ Atoms ═══ */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-7 w-7 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">
          {n}
        </div>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/50 border border-border px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-text-faint">{label}</div>
        <div className={`text-sm text-text truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
      <CopyButton value={value} />
    </div>
  )
}

function CopyButton({ value, compact }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {/* clipboard blocked */}
  }
  return (
    <button
      onClick={onCopy}
      className={`flex-shrink-0 rounded-md text-xs font-medium transition-all ${
        compact ? 'px-2 py-1' : 'px-3 py-1.5'
      } ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface text-text-muted hover:text-text hover:bg-surface-3'}`}
    >
      {copied ? '✓ Copied' : '📋 Copy'}
    </button>
  )
}
