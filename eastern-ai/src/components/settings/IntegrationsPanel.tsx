import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

interface Connection {
  provider: string
  status: string
  account_email: string | null
  connected_at: string
}

const PROVIDERS = [
  {
    key: 'google_calendar',
    label: 'Google Calendar',
    description: 'Agent reads your availability and books appointments straight into your calendar.',
    scopes: 'https://www.googleapis.com/auth/calendar',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" />
      </svg>
    ),
  },
  {
    key: 'gmail',
    label: 'Gmail',
    description: 'Agent sends invoices, receipts, and follow-ups from your email address.',
    scopes: 'https://www.googleapis.com/auth/gmail.send',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
] as const

interface Props { userId: string; isPro: boolean }

export function IntegrationsPanel({ userId, isPro }: Props) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('tool_connections')
        .select('provider, status, account_email, connected_at')
        .eq('user_id', userId)
      if (!cancelled) {
        setConnections((data ?? []) as Connection[])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const handleConnect = async (providerKey: string, scopes: string) => {
    if (!isPro) return
    setBusy(providerKey)
    // Re-auth via Supabase Google provider with extra scopes; the redirect
    // returns with a provider_token we capture in the callback handler.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes,
        redirectTo: `${window.location.origin}/dashboard/settings?integration=${providerKey}`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) { setBusy(null); alert(error.message) }
  }

  const handleDisconnect = async (providerKey: string) => {
    setBusy(providerKey)
    await supabase.from('tool_connections').delete().eq('user_id', userId).eq('provider', providerKey)
    setConnections(prev => prev.filter(c => c.provider !== providerKey))
    setBusy(null)
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-text">Tool Connections</h2>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              Pro
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Let the agent operate inside your other tools — calendar, email, and more.
          </p>
        </div>
      </div>

      {!isPro && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm text-amber-300">
            Tool connections are a Pro feature. Upgrade to let the agent book real Calendar slots and send branded
            emails on your behalf.
          </p>
          <Link
            to="/dashboard/payment"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {PROVIDERS.map(p => {
          const conn = connections.find(c => c.provider === p.key)
          const connected = !!conn && conn.status === 'connected'
          return (
            <div
              key={p.key}
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border',
                connected ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface-2',
              )}
            >
              <div className="h-10 w-10 rounded-lg bg-surface flex items-center justify-center text-text-muted flex-shrink-0">
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text">{p.label}</p>
                <p className="text-xs text-text-muted truncate">
                  {connected
                    ? `Connected${conn.account_email ? ` · ${conn.account_email}` : ''}`
                    : p.description}
                </p>
              </div>
              {connected ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === p.key}
                  onClick={() => handleDisconnect(p.key)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={busy === p.key}
                  disabled={!isPro || loading}
                  onClick={() => handleConnect(p.key, p.scopes)}
                >
                  Connect
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {!loading && connections.length === 0 && isPro && (
        <p className="text-xs text-text-muted">
          Heads-up: after you click Connect, you'll be sent through Google's consent screen.
          The agent stores only what's needed to act on your behalf, and you can revoke any time.
        </p>
      )}
    </Card>
  )
}
