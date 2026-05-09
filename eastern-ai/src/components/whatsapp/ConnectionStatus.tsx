import { Badge } from '../ui/Badge'
import type { ChannelStatus } from '../../types/whatsapp.types'

interface ConnectionStatusProps {
  status: ChannelStatus
}

const STATUS_CONFIG: Record<ChannelStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'accent' }> = {
  pending: { label: 'Not Connected', variant: 'default' },
  initializing: { label: 'Scanning QR…', variant: 'accent' },
  authorized: { label: 'Connected', variant: 'success' },
  disconnected: { label: 'Disconnected', variant: 'danger' },
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant={config.variant}>
      {status === 'initializing' && (
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
      )}
      {status === 'authorized' && (
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      )}
      {config.label}
    </Badge>
  )
}
