import { cn } from '../../lib/utils'
import type { ChannelStatus } from '../../types/whatsapp.types'

interface AgentPulseProps {
  status: ChannelStatus
  brandVoiceProvisioned?: boolean
  className?: string
}

export function AgentPulse({ status, brandVoiceProvisioned, className }: AgentPulseProps) {
  const isLive = status === 'authorized' && brandVoiceProvisioned !== false

  if (isLive) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="relative flex items-center justify-center h-10 w-10">
          <div className="h-5 w-5 rounded-full bg-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-400">Agent Live</p>
          <p className="text-xs text-text-muted">Responding to messages</p>
        </div>
      </div>
    )
  }

  if (status === 'initializing' || status === 'pending') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="relative flex items-center justify-center h-10 w-10">
          <div className="absolute h-10 w-10 rounded-full border-2 border-accent opacity-40 animate-ping" />
          <div className="absolute h-8 w-8 rounded-full border border-accent opacity-30 animate-ping animation-delay-150" />
          <div className="h-4 w-4 rounded-full bg-accent/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-accent">
            {status === 'initializing' ? 'Connecting…' : 'Waiting for QR scan'}
          </p>
          <p className="text-xs text-text-muted">Scan the QR code with WhatsApp</p>
        </div>
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <div className="h-4 w-4 rounded-full bg-red-500/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-400">Disconnected</p>
          <p className="text-xs text-text-muted">Re-scan to reconnect</p>
        </div>
      </div>
    )
  }

  return null
}
