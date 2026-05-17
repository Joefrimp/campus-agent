/**
 * Admin → Gift Pro to anyone by email.
 *
 * Visible ONLY when the signed-in account's email is in the hardcoded
 * ADMIN_EMAILS list below. The backend has its own ADMIN_EMAILS env var
 * gate as the real authority — this client-side check is just to avoid
 * showing a 403-bait page to non-admins.
 *
 * Visual: Vector design tokens (#030303 bg, #0A0A0A cards, #00FF66 CTA).
 */
import { useState } from 'react'
import { motion } from 'motion/react'
import { Gift, Loader2, Mail, Calendar, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { giftProByEmail, type GiftProResponse } from '../lib/webhooks'

// Mirror this with the backend ADMIN_EMAILS env var.
const ADMIN_EMAILS = ['joefrimp123@gmail.com']

export function AdminGiftProPage() {
  const { user } = useAuth()
  const myEmail = (user?.email ?? '').toLowerCase()
  const isAdmin = ADMIN_EMAILS.includes(myEmail)

  const [recipient, setRecipient] = useState('')
  const [months, setMonths] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GiftProResponse | null>(null)
  const [err, setErr] = useState('')

  if (!isAdmin) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto">
        <div className="rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-8 text-center">
          <AlertCircle className="w-8 h-8 text-[#F87171] mx-auto mb-3" />
          <h1 className="font-[Outfit] font-bold text-xl text-white mb-2">Not available</h1>
          <p className="text-zinc-400 text-sm">
            This page is for Eastern AI admins only.
          </p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.email) return
    const target = recipient.trim()
    if (!target) { setErr('Enter the recipient email.'); return }
    if (!/^\S+@\S+\.\S+$/.test(target)) { setErr('That doesn\'t look like a valid email.'); return }
    setSubmitting(true)
    setErr('')
    setResult(null)
    try {
      const res = await giftProByEmail(user.email, target, months)
      if (res.success) {
        setResult(res)
        setRecipient('')
      } else {
        setErr(res.error || 'Could not grant Pro.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setSubmitting(false)
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-vector-primary/15 border border-vector-primary/30 flex items-center justify-center">
            <Gift className="w-5 h-5 text-vector-primary" />
          </div>
          <h1 className="font-[Outfit] font-black text-3xl text-white tracking-tight">
            Gift Pro to anyone
          </h1>
        </div>
        <p className="text-zinc-400 text-sm max-w-lg ml-13">
          Enter the recipient's account email and how long Pro should last.
          They get Pro immediately — no payment required.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-6 space-y-5"
      >
        <label className="block">
          <span className="block font-[Inter] text-xs font-medium uppercase tracking-widest text-[#E0E0E0] mb-2">
            Recipient email
          </span>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="friend@example.com"
              autoFocus
              className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#030303] border border-[rgba(255,255,255,0.1)] text-white font-[Inter] text-sm placeholder:text-zinc-600 focus:outline-none focus:border-vector-primary/60 focus:ring-2 focus:ring-vector-primary/20 transition-all"
            />
          </div>
        </label>

        <label className="block">
          <span className="block font-[Inter] text-xs font-medium uppercase tracking-widest text-[#E0E0E0] mb-2">
            Duration
          </span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#030303] border border-[rgba(255,255,255,0.1)] text-white font-[Inter] text-sm focus:outline-none focus:border-vector-primary/60 focus:ring-2 focus:ring-vector-primary/20 transition-all appearance-none cursor-pointer"
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months (1 year)</option>
              <option value={24}>24 months (2 years)</option>
            </select>
          </div>
        </label>

        {err && (
          <p className="text-sm text-[#F87171] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {err}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-full bg-vector-primary text-black font-[Outfit] font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>Gift Pro <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </form>

      {result?.success && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-2xl bg-vector-primary/10 border border-vector-primary/30 p-5"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-vector-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-[Outfit] font-bold text-white text-sm mb-1">
                Pro activated for {result.recipient_email}
              </h3>
              <p className="text-zinc-300 text-xs">
                {result.duration_months} month{result.duration_months === 1 ? '' : 's'} of Pro is now live on their account. They'll see the change immediately when they next open the dashboard.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="mt-8 rounded-2xl bg-[#0A0A0A]/60 border border-dashed border-[rgba(255,255,255,0.08)] p-5">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="font-semibold text-zinc-300">Heads up:</span> this
          endpoint is gated server-side by the <code className="text-[#00FF66] bg-black/40 px-1 rounded">ADMIN_EMAILS</code> env
          var on Render. Make sure your email is in that list, otherwise
          the request will return 403 even though this page rendered.
        </p>
      </div>
    </div>
  )
}
