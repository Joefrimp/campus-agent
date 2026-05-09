import { Badge } from '../ui/Badge'
import { formatRelativeTime } from '../../lib/utils'
import type { SalesLead } from '../../types/message.types'

interface LeadCardProps {
  lead: SalesLead
}

const STATUS_BADGE: Record<SalesLead['status'], { label: string; variant: 'success' | 'accent' | 'default' }> = {
  new: { label: 'New', variant: 'accent' },
  active: { label: 'Active', variant: 'success' },
  closed: { label: 'Closed', variant: 'default' },
}

export function LeadCard({ lead }: LeadCardProps) {
  const badge = STATUS_BADGE[lead.status]
  const initials = (lead.contact_name ?? lead.contact_phone)
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-surface hover:border-accent/30 transition-colors">
      <div className="h-10 w-10 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
        <span className="text-accent text-sm font-semibold">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-medium text-text text-sm truncate">
            {lead.contact_name ?? lead.contact_phone}
          </p>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        {lead.contact_name && (
          <p className="text-xs text-text-faint mb-1">{lead.contact_phone}</p>
        )}
        {lead.last_message && (
          <p className="text-xs text-text-muted truncate">{lead.last_message}</p>
        )}
      </div>
      <p className="text-xs text-text-faint flex-shrink-0 mt-0.5">
        {formatRelativeTime(lead.updated_at)}
      </p>
    </div>
  )
}
