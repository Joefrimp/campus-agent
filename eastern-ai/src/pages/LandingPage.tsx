import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateAccountModal } from '../components/auth/CreateAccountModal'
import { SignInModal } from '../components/auth/SignInModal'
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal'
import { Logo } from '../components/layout/Logo'
import { Starfield } from '../components/layout/Starfield'
import { useAuth } from '../hooks/useAuth'
import { useScrollReveal } from '../hooks/useScrollReveal'

type AuthModal = 'create' | 'signin' | 'forgot' | null

export function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [modal, setModal] = useState<AuthModal>(null)

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true })
  }, [session, loading, navigate])

  const start = () => setModal('create')

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-text overflow-x-hidden">
      {/* ── Global atmosphere: starfield + drifting nebula ─── */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <Starfield count={90} />
        <div className="absolute top-[-200px] left-[-100px] h-[600px] w-[800px] bg-accent/20 blur-[140px] rounded-full animate-drift-slow" />
        <div className="absolute top-[40%] right-[-200px] h-[500px] w-[700px] bg-fuchsia-500/15 blur-[140px] rounded-full animate-drift-fast" />
        <div className="absolute bottom-[-200px] left-[20%] h-[500px] w-[700px] bg-emerald-500/10 blur-[140px] rounded-full animate-drift-slow" />
      </div>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="relative z-30 sticky top-0 backdrop-blur-md bg-background/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo variant="vector" size="sm" showText textClassName="text-[15px] font-semibold" />
          <div className="hidden md:flex items-center gap-8 text-sm text-text-muted">
            <a href="#story" className="hover:text-text transition-colors">Story</a>
            <a href="#features" className="hover:text-text transition-colors">Features</a>
            <a href="#pricing" className="hover:text-text transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-text transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal('signin')}
              className="h-9 px-3 rounded-md text-sm font-medium text-text-muted hover:text-text transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={start}
              className="btn-glow h-9 px-4 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent/30"
            >
              Get started →
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <Hero onStart={start} />

      {/* ── STORY SECTIONS (alternating, no boxes) ─────────── */}
      <StorySection
        id="story"
        eyebrow="01 — Replies"
        eyebrowColor="text-accent"
        title={<>Replies that <em className="not-italic text-gradient">close orders</em>, not just questions.</>}
        body="Customers ask 'is it available?' at 2am. Vector answers in seconds — with the price, the wait time, and the next step. Every reply nudges toward the sale, in your voice, never robotic."
        side="right"
        glow="bg-accent/25"
        mockup={<RepliesMockup />}
      />

      <StorySection
        eyebrow="02 — Vision"
        eyebrowColor="text-fuchsia-400"
        title={<>Sees what customers <em className="not-italic text-gradient">forward from group chats</em>.</>}
        body="Someone sends a competitor's product photo asking if you carry it. Vector compares it pixel-by-pixel against your catalogue, finds the match — or politely offers a better alternative for the customer's actual need. Zero hallucination, 100% honesty."
        side="left"
        glow="bg-fuchsia-500/25"
        mockup={<VisionMockup />}
      />

      <StorySection
        eyebrow="03 — Memory"
        eyebrowColor="text-emerald-400"
        title={<>A brain that <em className="not-italic text-gradient">learns your style</em> every single day.</>}
        body="Every time you correct a reply, every late-night fix, every tone adjustment — Vector studies it. By week three, it sounds more like you than your interns. Built-in self-improvement, no training required."
        side="right"
        glow="bg-emerald-500/25"
        mockup={<MemoryMockup />}
      />

      <StorySection
        eyebrow="04 — Toolset"
        eyebrowColor="text-amber-400"
        title={<>Knows which <em className="not-italic text-gradient">tool to reach for</em>, the way you do.</>}
        body="Calendar booking? Catalogue lookup? Payment confirmation? Website import? Vector picks the right tool for the job, chains them together, and only asks you when something genuinely needs a human call."
        side="left"
        glow="bg-amber-500/25"
        mockup={<ToolsMockup />}
      />

      {/* ── FEATURE GRID (compact, glow-icon style) ────────── */}
      <FeatureGrid />

      {/* ── PRICING (Xora-style, glowing icons) ────────────── */}
      <Pricing onStart={start} />

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <FAQ />

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <FinalCTA onStart={start} />

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="relative z-10 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <Logo variant="vector" size="sm" showText textClassName="text-sm font-semibold" />
            <p className="text-text-faint text-xs mt-3 leading-relaxed">
              Vector is an Eastern AI product. Autonomous WhatsApp operations for businesses that refuse to sleep on customers.
            </p>
          </div>
          <FooterCol title="Product" links={[
            ['Story', '#story'],
            ['Features', '#features'],
            ['Pricing', '#pricing'],
          ]} />
          <FooterCol title="Company" links={[
            ['About', '#'],
            ['Contact', 'mailto:hello@eastern.ai'],
          ]} />
          <FooterCol title="Legal" links={[
            ['Privacy', '#'],
            ['Terms', '#'],
          ]} />
        </div>
        <div className="py-5 text-center text-xs text-text-faint">
          © {new Date().getFullYear()} Eastern AI · All rights reserved
        </div>
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

/* ═══════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════ */
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative z-10">
      <div className="max-w-6xl mx-auto px-6 pt-24 md:pt-28 pb-20 md:pb-24 grid md:grid-cols-[1.1fr_1fr] gap-14 items-center">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/30 text-[11px] font-semibold tracking-wider uppercase text-accent mb-7">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-accent" />
            </span>
            Live · Vector v1
          </div>

          <h1 className="text-[44px] md:text-[64px] leading-[1.02] font-bold tracking-[-0.03em] text-text mb-6">
            Your business
            <br />
            doesn't sleep <span className="text-gradient">anymore.</span>
          </h1>

          <p className="text-[17px] md:text-[18px] leading-[1.55] text-text-muted max-w-[510px] mb-9">
            Vector is the AI employee who answers every WhatsApp message,
            takes orders, confirms payments, books appointments, and grows
            your customer base while you live your actual life.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-10">
            <button
              onClick={onStart}
              className="btn-glow group h-12 px-6 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-all shadow-2xl shadow-accent/40 inline-flex items-center gap-2"
            >
              Start free for 15 days
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <a
              href="#story"
              className="h-12 px-5 rounded-xl text-sm font-medium text-text hover:bg-surface/60 transition-colors inline-flex items-center gap-1.5"
            >
              <span className="h-2 w-2 rounded-full bg-fuchsia-400 animate-pulse" />
              Watch it work
            </a>
          </div>

          {/* Animated stats */}
          <div className="flex flex-wrap gap-x-9 gap-y-3 pt-7 border-t border-border/40">
            <Stat n="24/7" label="never sleeps" />
            <Stat n="< 3s" label="reply latency" />
            <Stat n="0" label="hallucinations*" />
          </div>
          <p className="text-[10px] text-text-faint mt-2">* image matches require ≥ 0.85 confidence, enforced in code</p>
        </div>

        {/* Right: floating WhatsApp mockup */}
        <div className="relative animate-fade-up" style={{ animationDelay: '180ms' }}>
          {/* Layered glow halo */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[480px] w-[480px] bg-accent/30 blur-[100px] rounded-full animate-pulse-glow" />
            <div className="absolute top-[20%] right-[-30px] h-[200px] w-[200px] bg-fuchsia-500/30 blur-[80px] rounded-full animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
          </div>
          <div className="animate-float-slow">
            <WhatsAppMockup />
          </div>
          {/* Floating pill stats */}
          <FloatingPill className="absolute -top-4 -left-6" delay={400}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Order #142 confirmed
          </FloatingPill>
          <FloatingPill className="absolute -bottom-4 -right-4" delay={700}>
            <span className="text-emerald-400">+GH₵25</span> · 6:45 pm
          </FloatingPill>
        </div>
      </div>
    </section>
  )
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="text-2xl md:text-3xl font-bold text-text tracking-tight">{n}</div>
      <div className="text-[11px] text-text-muted uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}

function FloatingPill({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/90 backdrop-blur-md border border-border text-xs font-medium text-text shadow-xl animate-fade-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   STORY SECTION (alternating, no card box)
   ═══════════════════════════════════════════════════════════════ */
function StorySection({
  id, eyebrow, eyebrowColor, title, body, side, glow, mockup,
}: {
  id?: string
  eyebrow: string
  eyebrowColor: string
  title: React.ReactNode
  body: string
  side: 'left' | 'right'
  glow: string
  mockup: React.ReactNode
}) {
  const ref = useScrollReveal<HTMLDivElement>()
  return (
    <section id={id} className="relative z-10 py-24 md:py-32">
      <div ref={ref} className="reveal-init max-w-6xl mx-auto px-6">
        <div className={`grid md:grid-cols-2 gap-14 md:gap-20 items-center ${side === 'left' ? 'md:[&>*:first-child]:order-2' : ''}`}>
          {/* Copy */}
          <div>
            <div className={`text-[11px] font-mono font-semibold tracking-[0.2em] uppercase ${eyebrowColor} mb-4`}>
              {eyebrow}
            </div>
            <h2 className="text-3xl md:text-[44px] leading-[1.08] font-bold tracking-tight text-text mb-5">
              {title}
            </h2>
            <p className="text-[16px] leading-[1.65] text-text-muted max-w-[480px]">{body}</p>
          </div>

          {/* Mockup with halo */}
          <div className="relative">
            <div className={`absolute inset-0 -z-10 ${glow} blur-[100px] rounded-full animate-pulse-glow`} />
            <div className="animate-float-slow">{mockup}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE GRID — glowing-icon row
   ═══════════════════════════════════════════════════════════════ */
function FeatureGrid() {
  const ref = useScrollReveal<HTMLDivElement>()
  const items = [
    { icon: <ChatIcon />, title: 'Three brand voices', body: 'Pro, Hype-man, Solver — pick one or write your own.' },
    { icon: <OrderIcon />, title: 'Orders + inventory', body: 'Catalogue, stock counts, low-stock alerts on WhatsApp.' },
    { icon: <MoneyIcon />, title: 'MoMo payment OCR', body: 'Reads MoMo screenshots, you approve in one tap.' },
    { icon: <CalendarIcon />, title: 'Appointments', body: 'Books slots from your real schedule, blocks conflicts.' },
    { icon: <DigestIcon />, title: 'Nightly digest', body: "Today's wins + tomorrow's prep, every night at 9pm." },
    { icon: <ShieldIcon />, title: 'Manual mode', body: 'Take over any conversation in one toggle. Vector goes silent.' },
  ]
  return (
    <section id="features" className="relative z-10 py-24">
      <div ref={ref} className="reveal-init max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-[11px] font-mono font-semibold tracking-[0.2em] uppercase text-accent mb-3">
            05 — Capabilities
          </div>
          <h2 className="text-3xl md:text-[44px] leading-[1.1] font-bold tracking-tight text-text">
            Everything a <span className="text-gradient">full-time employee</span> would do.
            <br />
            None of the salary.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-x-10 gap-y-12">
          {items.map((it, i) => (
            <FeatureRow key={i} {...it} delay={i * 80} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureRow({ icon, title, body, delay }: { icon: React.ReactNode; title: string; body: string; delay: number }) {
  return (
    <div className="group" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative w-12 h-12 mb-5">
        <div className="absolute inset-0 bg-accent/30 blur-xl rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
        <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-accent/30 to-accent/5 border border-accent/30 flex items-center justify-center text-accent">
          {icon}
        </div>
      </div>
      <h3 className="text-[17px] font-semibold text-text mb-1.5">{title}</h3>
      <p className="text-[14px] text-text-muted leading-relaxed">{body}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PRICING — Xora-style with glowing icon caps
   ═══════════════════════════════════════════════════════════════ */
function Pricing({ onStart }: { onStart: () => void }) {
  const ref = useScrollReveal<HTMLDivElement>()
  return (
    <section id="pricing" className="relative z-10 py-24 md:py-32">
      <div ref={ref} className="reveal-init max-w-5xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-[11px] font-mono font-semibold tracking-[0.2em] uppercase text-accent mb-3">
            06 — Pricing
          </div>
          <h2 className="text-3xl md:text-[44px] leading-[1.1] font-bold tracking-tight text-text">
            Try it free. <span className="text-gradient">Pay only if it pays you.</span>
          </h2>
          <p className="text-text-muted mt-4 text-[15px]">
            One MoMo transfer activates Pro. No cards. No subscriptions you forget to cancel.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto items-center">
          <PricingCard
            iconColor="from-blue-400 to-cyan-400"
            badge={null}
            name="Free trial"
            price="0"
            currency=""
            suffix="for 15 days"
            features={['50 customer messages', '1 brand voice', 'Order taking + catalogue', 'Email support']}
            cta="Start free"
            ctaPrimary={false}
            onCta={onStart}
          />
          <PricingCard
            iconColor="from-fuchsia-400 to-amber-400"
            badge="Most popular"
            name="Executive"
            price="100"
            currency="₵"
            suffix="/ month"
            features={['Unlimited messages', 'All 3 voices + custom style', 'MoMo OCR · appointments · digests', 'Priority WhatsApp concierge', 'Website import + image matching']}
            cta="Go Pro"
            ctaPrimary
            onCta={onStart}
            highlight
          />
        </div>

        <p className="text-center text-xs text-text-faint mt-10">
          MoMo · Pay once, get a code, activated automatically · Cancel anytime
        </p>
      </div>
    </section>
  )
}

function PricingCard({
  iconColor, badge, name, price, currency, suffix, features, cta, ctaPrimary, onCta, highlight,
}: {
  iconColor: string
  badge: string | null
  name: string
  price: string
  currency: string
  suffix: string
  features: string[]
  cta: string
  ctaPrimary: boolean
  onCta: () => void
  highlight?: boolean
}) {
  return (
    <div className={`relative pt-12 ${highlight ? 'md:-translate-y-4' : ''}`}>
      {/* Glowing icon cap */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
        <div className="relative">
          <div className={`absolute inset-0 bg-gradient-to-br ${iconColor} blur-2xl opacity-60 rounded-full animate-pulse-glow`} />
          <div className={`relative h-16 w-16 rounded-2xl bg-gradient-to-br ${iconColor} border border-white/20 flex items-center justify-center shadow-xl`}>
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M5 3l14 9-14 9V3z" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className={`relative rounded-3xl backdrop-blur-md p-8 pt-12 text-center ${
        highlight
          ? 'bg-gradient-to-b from-accent/15 via-surface/80 to-surface/40 shadow-2xl shadow-accent/20'
          : 'bg-surface/40'
      }`}>
        {badge && (
          <div className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-500 text-white text-[10px] font-bold tracking-[0.15em] uppercase shadow-lg">
            {badge}
          </div>
        )}
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-text-muted mb-3">{name}</div>
        <div className="flex items-baseline justify-center gap-1.5 mb-1">
          <span className="text-5xl font-bold text-text tracking-tight">
            {currency}{price}
          </span>
        </div>
        <div className="text-sm text-text-muted mb-7">{suffix}</div>
        <ul className="space-y-3 mb-8 text-left">
          {features.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-[14px] text-text">
              <CheckMini className="mt-1" /> {f}
            </li>
          ))}
        </ul>
        <button
          onClick={onCta}
          className={`w-full h-12 rounded-xl font-semibold text-sm transition-all ${
            ctaPrimary
              ? 'btn-glow bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/30'
              : 'bg-surface/80 text-text border border-border hover:border-accent/50'
          }`}
        >
          {cta}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FAQ
   ═══════════════════════════════════════════════════════════════ */
function FAQ() {
  const ref = useScrollReveal<HTMLDivElement>()
  const items = [
    {
      q: 'Does Vector use my real WhatsApp number?',
      a: 'Yes. Vector connects to your existing WhatsApp Business or personal number — customers chat with the same number they already know. No new line, no app to install.',
    },
    {
      q: 'What happens when my phone is off?',
      a: 'Vector runs in the cloud, so it keeps replying 24/7 even when your phone is asleep. Just open WhatsApp on your phone every couple of weeks to keep the session alive.',
    },
    {
      q: 'Can I take over a conversation manually?',
      a: 'Anytime. Flip "Manual mode" in your dashboard and Vector goes silent — you reply to that customer yourself. Toggle back when you\'re done.',
    },
    {
      q: 'How does the MoMo subscription work?',
      a: 'Click "Go Pro" → you get a unique reference code → pay GH₵100 to our MoMo number with that code as the reference → forward the success screenshot. Vector reads it, matches the code, and activates Pro automatically. Usually under 60 seconds, no human needed.',
    },
    {
      q: 'Can it really stop hallucinating about products?',
      a: 'Yes. Image-matching uses a confidence threshold enforced in code — anything under 0.85 triggers a polite "we don\'t carry that exact one, but here are honest alternatives." Truth is the default, not a prompt instruction.',
    },
  ]
  return (
    <section id="faq" className="relative z-10 py-24">
      <div ref={ref} className="reveal-init max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-[11px] font-mono font-semibold tracking-[0.2em] uppercase text-accent mb-3">
            07 — FAQ
          </div>
          <h2 className="text-3xl md:text-[44px] leading-[1.1] font-bold tracking-tight text-text">
            Honest questions, <span className="text-gradient">honest answers.</span>
          </h2>
        </div>
        <div className="space-y-3">
          {items.map((it, i) => <FaqItem key={i} {...it} />)}
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl backdrop-blur-md transition-colors ${open ? 'bg-surface/60' : 'bg-surface/30 hover:bg-surface/50'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-[15px] font-medium text-text">{q}</span>
        <span className={`text-text-muted text-xl leading-none transition-transform duration-300 ${open ? 'rotate-45 text-accent' : ''}`}>+</span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-5 text-[14px] text-text-muted leading-relaxed">{a}</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════════════════════════════ */
function FinalCTA({ onStart }: { onStart: () => void }) {
  const ref = useScrollReveal<HTMLDivElement>()
  return (
    <section className="relative z-10 py-24">
      <div ref={ref} className="reveal-init max-w-4xl mx-auto px-6">
        <div className="relative rounded-3xl overflow-hidden p-12 md:p-16 text-center backdrop-blur-md bg-gradient-to-br from-accent/15 via-fuchsia-500/10 to-emerald-500/10">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 h-[300px] w-[400px] bg-accent/40 blur-[100px] rounded-full animate-pulse-glow" />
            <div className="absolute bottom-0 right-1/4 h-[300px] w-[400px] bg-fuchsia-500/30 blur-[100px] rounded-full animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
          </div>
          <h2 className="text-3xl md:text-[48px] leading-[1.05] font-bold tracking-tight text-text mb-5">
            Stop replying at 11pm.
            <br />
            <span className="text-gradient">Let Vector own the night shift.</span>
          </h2>
          <p className="text-text-muted text-[16px] max-w-xl mx-auto mb-9">
            Setup is two minutes. The trial is 15 days. The decision is whether you want
            your business to keep working while you sleep.
          </p>
          <button
            onClick={onStart}
            className="btn-glow h-13 px-8 py-4 rounded-xl bg-accent text-white text-[15px] font-bold hover:bg-accent-hover transition-all shadow-2xl shadow-accent/40 inline-flex items-center gap-2"
          >
            Start your free trial
            <span>→</span>
          </button>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FOOTER COL
   ═══════════════════════════════════════════════════════════════ */
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide uppercase text-text-muted mb-3">{title}</div>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-text-faint hover:text-text transition-colors">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MOCKUPS
   ═══════════════════════════════════════════════════════════════ */
function WhatsAppMockup() {
  return (
    <div className="relative mx-auto max-w-sm rounded-[32px] border border-border/80 bg-[#0b141a] shadow-2xl shadow-black/50 overflow-hidden">
      <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3 border-b border-black/30">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">V</div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-white truncate">Ama's Kitchen</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            online · replies instantly
          </div>
        </div>
        <div className="text-white/60 text-lg">⋮</div>
      </div>
      <div className="px-3 py-4 space-y-2 min-h-[420px]" style={{ backgroundColor: '#0b141a' }}>
        <Bubble side="in">Hi do you have jollof today?</Bubble>
        <Bubble side="out">Hey! Yes 🍛 Today's jollof is GH₵25 with chicken or fish. Want one set aside?</Bubble>
        <Bubble side="in">Chicken. How long?</Bubble>
        <Bubble side="out">15 min. Hall 7 or Pharmacy block?</Bubble>
        <Bubble side="in">Hall 7. Sending momo</Bubble>
        <Bubble side="out">Perfect. 0244 ••• 891 — Ama's Kitchen 💙</Bubble>
        <Bubble side="in" attachment>📎 IMG_2849.jpg</Bubble>
        <Bubble side="out">Got it ✅ Order #142 confirmed for 6:45pm. See you soon!</Bubble>
        <div className="flex justify-center pt-2">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-medium">
            Vector handled this · 0 owner replies
          </span>
        </div>
      </div>
      <div className="bg-[#202c33] px-4 py-2.5 flex items-center gap-3">
        <div className="flex-1 h-8 rounded-full bg-[#2a3942] px-3 flex items-center text-[12px] text-white/40">Message</div>
        <div className="text-white/60">🎤</div>
      </div>
    </div>
  )
}

function Bubble({ side, children, attachment }: { side: 'in' | 'out'; children: React.ReactNode; attachment?: boolean }) {
  const isOut = side === 'out'
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] px-3 py-2 rounded-lg text-[13px] leading-snug ${isOut ? 'bg-[#005c4b] text-white rounded-br-sm' : 'bg-[#202c33] text-white rounded-bl-sm'} ${attachment ? 'italic opacity-90' : ''}`}>
        {children}
      </div>
    </div>
  )
}

function RepliesMockup() {
  return (
    <div className="relative mx-auto max-w-sm rounded-3xl bg-surface/70 backdrop-blur-md p-5 shadow-2xl shadow-black/40">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Live conversation
      </div>
      <div className="space-y-2">
        <Bubble side="in">how much braids?</Bubble>
        <Bubble side="out">From GH₵80 (knotless small) up to GH₵250 (jumbo with curls). Want to book?</Bubble>
        <Bubble side="in">tomorrow 10am?</Bubble>
        <Bubble side="out">10am Tue is open ✅ Booking now... done. See you tomorrow at 10!</Bubble>
      </div>
      <div className="mt-4 flex items-center justify-between text-[10px] text-text-faint">
        <span>0.8s avg latency</span>
        <span className="text-emerald-400">+1 booking</span>
      </div>
    </div>
  )
}

function VisionMockup() {
  return (
    <div className="relative mx-auto max-w-sm rounded-3xl bg-surface/70 backdrop-blur-md p-5 shadow-2xl shadow-black/40">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
        Image match
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="aspect-square rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-accent/30 flex items-center justify-center text-4xl">📷</div>
        <div className="aspect-square rounded-xl bg-gradient-to-br from-accent/30 to-emerald-500/30 flex items-center justify-center text-4xl">👟</div>
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-muted">Visual similarity</span>
          <span className="text-emerald-400 font-semibold">0.92</span>
        </div>
        <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full w-[92%] bg-gradient-to-r from-emerald-400 to-accent rounded-full" />
        </div>
        <div className="text-[11px] text-text-muted pt-2">
          → Match found in catalogue · <span className="text-text font-medium">Nike Air · GH₵420</span>
        </div>
      </div>
    </div>
  )
}

function MemoryMockup() {
  return (
    <div className="relative mx-auto max-w-sm rounded-3xl bg-surface/70 backdrop-blur-md p-5 shadow-2xl shadow-black/40">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Style learned this week
      </div>
      <ul className="space-y-2.5 text-[13px]">
        <li className="flex items-start gap-2 text-text"><span className="text-emerald-400 mt-1">✓</span>Use "boss" instead of "sir"</li>
        <li className="flex items-start gap-2 text-text"><span className="text-emerald-400 mt-1">✓</span>Mention free delivery over GH₵100</li>
        <li className="flex items-start gap-2 text-text"><span className="text-emerald-400 mt-1">✓</span>Suggest jollof+kelewele as combo</li>
        <li className="flex items-start gap-2 text-text-muted"><span className="text-amber-400 mt-1">~</span>Avoid emojis on serious complaints</li>
      </ul>
      <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-text-faint">
        Updated from 47 conversations · 6 owner corrections
      </div>
    </div>
  )
}

function ToolsMockup() {
  const tools = [
    { name: 'Catalogue', color: 'from-accent to-cyan-400', icon: '📦' },
    { name: 'Calendar', color: 'from-fuchsia-400 to-rose-400', icon: '📅' },
    { name: 'Payments', color: 'from-emerald-400 to-teal-400', icon: '💸' },
    { name: 'Web import', color: 'from-amber-400 to-orange-400', icon: '🌐' },
    { name: 'Image AI', color: 'from-violet-400 to-fuchsia-400', icon: '👁' },
    { name: 'Memory', color: 'from-blue-400 to-indigo-400', icon: '🧠' },
  ]
  return (
    <div className="relative mx-auto max-w-sm rounded-3xl bg-surface/70 backdrop-blur-md p-5 shadow-2xl shadow-black/40">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        Tools available to Vector
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tools.map(t => (
          <div key={t.name} className="flex flex-col items-center gap-1.5">
            <div className={`relative h-12 w-12 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center text-lg shadow-lg`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${t.color} blur-md opacity-50 -z-10 rounded-xl`} />
              {t.icon}
            </div>
            <span className="text-[10px] text-text-muted">{t.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-text-faint">
        Vector picks the right one per message — no setup
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ICONS
   ═══════════════════════════════════════════════════════════════ */
function CheckMini({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 text-accent flex-shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" />
    </svg>
  )
}
function ChatIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinejoin="round" /></svg> }
function OrderIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinejoin="round" strokeLinecap="round" /></svg> }
function MoneyIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2m0-8v1m0 6v1m0-8a3 3 0 013 3M3 12a9 9 0 1018 0 9 9 0 00-18 0z" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function CalendarIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function DigestIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function ShieldIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" strokeLinejoin="round" /></svg> }
