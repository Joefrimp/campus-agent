import { useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { AgentPulse } from './AgentPulse'
import { QrCodeDisplay } from './QrCodeDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { useWhatsAppChannel } from '../../hooks/useWhatsAppChannel'
import { setupWhatsApp, pairWhatsAppByPhone } from '../../lib/webhooks'
import { Spinner } from '../ui/Spinner'
import { cn } from '../../lib/utils'

interface SetupTabProps {
  userId: string
  brandVoiceProvisioned: boolean
}

type Mode = 'qr' | 'phone'

export function SetupTab({ userId, brandVoiceProvisioned }: SetupTabProps) {
  const { channel, loading, refetch } = useWhatsAppChannel(userId)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('qr')
  const [phone, setPhone] = useState('')
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [requestingCode, setRequestingCode] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    setError('')
    try {
      await setupWhatsApp(userId)
      await refetch()
    } catch {
      setError('Failed to initiate connection. Please try again.')
    }
    setConnecting(false)
  }

  const handleGetPairCode = async () => {
    setError('')
    setPairCode(null)
    if (!phone.trim() || phone.replace(/\D/g, '').length < 8) {
      setError('Enter your full WhatsApp number with country code (e.g. +233 53 254 4245).')
      return
    }
    setRequestingCode(true)
    try {
      const res = await pairWhatsAppByPhone(userId, phone)
      if (res.success && res.code) {
        setPairCode(res.code)
      } else {
        setError(res.error || 'Could not get a pairing code. Try the QR option instead.')
      }
    } catch {
      setError('Network error getting pairing code. Try again.')
    }
    setRequestingCode(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  const needsConnect = !channel || channel.status === 'pending' || channel.status === 'disconnected'

  return (
    <div className="space-y-6" data-tour="whatsapp-setup">
      {/* Status header */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-semibold text-text mb-1">WhatsApp Connection</h2>
            <p className="text-sm text-text-muted">
              Connect your WhatsApp to bring Vector online.
            </p>
          </div>
          <ConnectionStatus status={channel?.status ?? 'pending'} />
        </div>
      </Card>

      {/* Main card */}
      <Card className="p-6">
        {needsConnect ? (
          <div className="text-center py-4 space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
              <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-text mb-1">
                {channel?.status === 'disconnected' ? 'Reconnect WhatsApp' : 'Connect Your WhatsApp'}
              </p>
              <p className="text-sm text-text-muted max-w-sm mx-auto">
                Provision your channel first, then choose QR scan (faster) or phone-pairing (no second device needed).
              </p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={handleConnect} loading={connecting} size="lg">
              {channel?.status === 'disconnected' ? 'Reconnect' : 'Connect WhatsApp'}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <AgentPulse status={channel.status} brandVoiceProvisioned={brandVoiceProvisioned} />

            {channel.status === 'initializing' && (
              <>
                {/* Mode toggle */}
                <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1 w-full sm:w-auto">
                  {(['qr', 'phone'] as Mode[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setError(''); setPairCode(null) }}
                      className={cn(
                        'flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-colors',
                        mode === m ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text',
                      )}
                    >
                      {m === 'qr' ? 'Scan QR' : 'Use phone number'}
                    </button>
                  ))}
                </div>

                {mode === 'qr' && (
                  <div className="flex flex-col items-center pt-2">
                    <QrCodeDisplay qrUrl={channel.qr_code_url} status={channel.status} />
                    <div className="mt-4 flex items-center gap-2 text-xs text-text-faint">
                      <Spinner size="sm" />
                      Polling for connection status…
                    </div>
                  </div>
                )}

                {mode === 'phone' && (
                  <div className="space-y-4 max-w-md">
                    <div>
                      <Input
                        label="Your WhatsApp number"
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+233 53 254 4245"
                        hint="Include the country code (e.g. +233 for Ghana)."
                      />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button onClick={handleGetPairCode} loading={requestingCode}>
                      Get pairing code
                    </Button>

                    {pairCode && (
                      <Card className="p-5 bg-accent/5 border-accent/20" variant="flat">
                        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                          Your pairing code (valid ~60 seconds)
                        </p>
                        <p className="text-3xl font-bold tracking-[0.4em] text-accent text-center py-3 font-mono">
                          {pairCode}
                        </p>
                        <ol className="space-y-2 text-sm text-text-muted mt-3">
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 h-5 w-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-medium mt-0.5">1</span>
                            On your phone, open <span className="text-text font-medium">WhatsApp → Settings → Linked Devices</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 h-5 w-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-medium mt-0.5">2</span>
                            Tap <span className="text-text font-medium">Link a device</span> → <span className="text-text font-medium">Link with phone number instead</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 h-5 w-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-medium mt-0.5">3</span>
                            Type the code above (no dashes) and tap Confirm
                          </li>
                        </ol>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}

            {channel.status === 'authorized' && (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4 text-sm text-emerald-400">
                Vector is live and responding to WhatsApp messages automatically.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
