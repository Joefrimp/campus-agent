import { formatRelativeTime } from '../../lib/utils'
import type { AgentLog } from '../../types/message.types'

const VOICE_LABELS: Record<string, string> = {
  professional_executive: 'Executive',
  hype_man: 'Hype-Man',
  problem_solver: 'Problem Solver',
}

interface LogEntryProps {
  log: AgentLog
}

export function LogEntry({ log }: LogEntryProps) {
  return (
    <div className="p-4 rounded-xl border border-border bg-surface space-y-3 hover:border-accent/20 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-accent/15 flex items-center justify-center">
            <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
          </div>
          <span className="text-xs font-medium text-text-muted">{log.contact_phone ?? 'Unknown'}</span>
          {log.brand_voice && (
            <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              {VOICE_LABELS[log.brand_voice] ?? log.brand_voice}
            </span>
          )}
          {log.was_overridden && (
            <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Overridden</span>
          )}
        </div>
        <span className="text-xs text-text-faint">{formatRelativeTime(log.created_at)}</span>
      </div>

      {log.inbound_message && (
        <div className="pl-9">
          <p className="text-xs text-text-faint mb-0.5 font-medium uppercase tracking-wide">Received</p>
          <p className="text-sm text-text-muted bg-white/3 rounded-lg px-3 py-2">{log.inbound_message}</p>
        </div>
      )}

      {log.ai_response && (
        <div className="pl-9">
          <p className="text-xs text-text-faint mb-0.5 font-medium uppercase tracking-wide">AI Replied</p>
          <p className="text-sm text-text bg-accent/5 border border-accent/10 rounded-lg px-3 py-2">{log.ai_response}</p>
        </div>
      )}
    </div>
  )
}
