import { useAgentLogs } from '../../hooks/useAgentLogs'
import { LogEntry } from './LogEntry'
import { Spinner } from '../ui/Spinner'

interface AgentLogsViewProps {
  userId: string
}

export function AgentLogsView({ userId }: AgentLogsViewProps) {
  const { logs, loading } = useAgentLogs(userId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (!logs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-white/3 flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="font-medium text-text-muted mb-1">No agent logs yet</p>
        <p className="text-sm text-text-faint">
          AI responses will be logged here after your agent goes live.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-tour="agent-logs">
      {logs.map(log => (
        <LogEntry key={log.id} log={log} />
      ))}
    </div>
  )
}
