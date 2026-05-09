import { useState } from 'react'
import { Card } from '../components/ui/Card'
import { cn } from '../lib/utils'

const SUPPORT = {
  email: 'easternai2005@gmail.com',
  whatsapp: '+233504728877',
  call: '+233532544245',
} as const

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Why isn\'t Vector replying to my customers?',
    a: 'Three things to check: (1) WhatsApp Setup tab shows the channel is "Live", (2) you haven\'t hit the Free Trial 50-message cap, (3) you haven\'t pressed PAUSE from your owner WhatsApp number. If all three look good, send any test message and watch Agent Logs in real-time — if nothing appears, your Whapi webhook URL may need updating.',
  },
  {
    q: 'A customer says they sent a payment screenshot but Vector didn\'t confirm.',
    a: 'Vector auto-confirms only when the amount in the screenshot exactly matches an open order total (within 1%). If it can\'t match, the screenshot is queued for your review — open the Agent Logs page and look for a "📋 needs review" entry. Approve it from there or via the APPROVE LAST WhatsApp command.',
  },
  {
    q: 'How do I customize how Vector talks?',
    a: 'Go to Settings → Brand Voice for the three baseline tones. For deeper personalization (Pro plan), use the Personal Style Guide section to write specific phrases, lines, and policies in your own words. Vector mirrors that style on every reply.',
  },
  {
    q: 'How do I add products via WhatsApp instead of the dashboard?',
    a: 'From your owner WhatsApp number (the one in Settings → Account), text your business number with: "ADD <name> <price>" — for example, "ADD Nivea Soft 30". Vector adds it to your catalogue immediately. Other WhatsApp commands: STOCK, PRICE, EXPENSE, EARNINGS, BEST SELLER, DELIVERIES, PAUSE/RESUME.',
  },
  {
    q: 'My free trial is ending. What happens?',
    a: 'After 15 days OR 50 messages (whichever comes first), Vector stops sending replies until you upgrade. Your data stays intact. Customers are told the agent is paused. Upgrade from the sidebar at any point to resume immediately.',
  },
  {
    q: 'Can I download my data?',
    a: 'Yes — every Friday at 7:30pm Vector emails you a PDF + Excel report of the week (orders, expenses, top products, full transactions). For an immediate export, contact support and we\'ll generate one within 24 hours.',
  },
]

interface Action {
  label: string
  href: string
  external?: boolean
}

function SupportCard({
  icon,
  label,
  value,
  primary,
  secondary,
  copyValue,
}: {
  icon: React.ReactNode
  label: string
  value: string
  primary: Action
  secondary?: Action
  copyValue: string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Card className="p-5 hover:border-accent/40 transition-colors">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
          <p className="text-sm font-medium text-text mt-0.5 truncate">{value}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={primary.href}
          {...(primary.external ? { target: '_blank', rel: 'noreferrer' } : {})}
          className="flex-1 inline-flex items-center justify-center h-9 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors shadow-sm"
        >
          {primary.label}
        </a>
        {secondary && (
          <a
            href={secondary.href}
            {...(secondary.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors text-xs"
          >
            {secondary.label}
          </a>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors text-xs"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </Card>
  )
}

export function HelpCenterPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const waLink = `https://wa.me/${SUPPORT.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hi Eastern AI team, I need help with my account.')}`

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/20 p-8 shadow-card">
        <h1 className="text-3xl font-bold text-text mb-2">How can we help?</h1>
        <p className="text-base text-text-muted max-w-xl">
          Pick any channel below — we usually respond within a few hours during business days.
          For urgent issues (Vector down, customer complaints), use WhatsApp or call.
        </p>
      </div>

      {/* Contact methods */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SupportCard
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          label="Email"
          value={SUPPORT.email}
          primary={{
            label: 'Open Gmail',
            href: `https://mail.google.com/mail/?view=cm&fs=1&to=${SUPPORT.email}&su=${encodeURIComponent('Eastern AI Support')}`,
            external: true,
          }}
          secondary={{
            label: 'Mail app',
            href: `mailto:${SUPPORT.email}?subject=${encodeURIComponent('Eastern AI Support')}`,
          }}
          copyValue={SUPPORT.email}
        />
        <SupportCard
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
          label="WhatsApp"
          value={SUPPORT.whatsapp}
          primary={{ label: 'Open WhatsApp', href: waLink, external: true }}
          copyValue={SUPPORT.whatsapp}
        />
        <SupportCard
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
          label="Call"
          value={SUPPORT.call}
          primary={{
            label: 'Call now',
            href: `tel:${SUPPORT.call.replace(/\s/g, '')}`,
          }}
          copyValue={SUPPORT.call}
        />
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-lg font-semibold text-text mb-4">Frequently asked</h2>
        <div className="space-y-2">
          {FAQ.map((item, idx) => {
            const open = openFaq === idx
            return (
              <Card key={idx} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : idx)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface-2 transition-colors"
                >
                  <span className="text-sm font-medium text-text">{item.q}</span>
                  <svg className={cn('h-4 w-4 text-text-muted transition-transform flex-shrink-0', open && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {open && (
                  <div className="px-5 pb-5 text-sm text-text-muted leading-relaxed border-t border-border pt-3">
                    {item.a}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {/* Reminder footer */}
      <Card className="p-5 bg-surface-2 border-dashed">
        <p className="text-sm text-text-muted">
          <span className="font-medium text-text">Tip:</span> Most agent issues resolve themselves within ~5 minutes (Whapi reconnect, Gemini retry).
          If something feels stuck, send PAUSE then RESUME from your owner WhatsApp number — it forces a clean restart.
        </p>
      </Card>
    </div>
  )
}
