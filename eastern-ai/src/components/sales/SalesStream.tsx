import { useSalesLeads } from '../../hooks/useSalesLeads'
import { LeadCard } from './LeadCard'
import { Spinner } from '../ui/Spinner'

interface SalesStreamProps {
  userId: string
}

export function SalesStream({ userId }: SalesStreamProps) {
  const { leads, loading } = useSalesLeads(userId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (!leads.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-white/3 flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </div>
        <p className="font-medium text-text-muted mb-1">No leads yet</p>
        <p className="text-sm text-text-faint">
          Connect WhatsApp and leads will appear here in real-time.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {leads.map(lead => (
        <LeadCard key={lead.id} lead={lead} />
      ))}
    </div>
  )
}
